import tkinter as tk
import sounddevice as sd
import numpy as np
import websockets
import asyncio
import threading
import keyboard
import sys
import uuid
import io
import struct
import math
import queue
import winsound
import time
import os
from scipy.io.wavfile import write

# --- Config ---
API_URL = "ws://localhost:8000/ws/dictation"
HOTKEY = "ctrl+shift"
SAMPLE_RATE = 16000
CHANNELS = 1

# --- Sound Generator (Apple Style "Pop") ---
class SoundManager:
    @staticmethod
    def play_pop(start_freq, end_freq, duration_ms):
        # Generate a "Pop" (Pitch drop sine wave)
        rate = 44100
        t = np.linspace(0, duration_ms/1000, int(rate * duration_ms/1000), False)
        
        # Frequency sweep (Linear)
        freqs = np.linspace(start_freq, end_freq, len(t))
        phases = np.cumsum(freqs) / rate * 2 * np.pi
        
        wave = np.sin(phases)
        
        # Envelope (Fast attack, Exponential decay)
        envelope = np.exp(-10 * t) # Quick fade out
        wave = wave * envelope

        # Soft clip to add warmth (saturation)
        wave = np.tanh(wave * 1.5)

        # Normalize
        audio = (wave * 32767 * 0.8).astype(np.int16)
        
        wav_io = io.BytesIO()
        write(wav_io, rate, audio)
        wav_io.seek(0)
        
        try:
            winsound.PlaySound(wav_io.read(), winsound.SND_MEMORY | winsound.SND_ASYNC)
        except:
            pass

    @staticmethod
    def play_start():
        # High "Pop" (Like iOS Record)
        # Sweeps from 800Hz down to 400Hz very quickly
        SoundManager.play_pop(1000, 500, 100)

    @staticmethod
    def play_stop():
        # Low "Click" 
        # Sweeps from 500Hz down to 200Hz
        SoundManager.play_pop(500, 200, 80)
        
    @staticmethod
    def play_success():
        # Software Success Chime (Rising)
        SoundManager.play_pop(600, 1200, 150)

# --- UI Overlay (Premium Animated) ---
class DictationOverlay:
    def __init__(self):
        self.root = tk.Tk()
        self.root.overrideredirect(True) 
        self.root.attributes("-topmost", True)
        self.root.attributes("-alpha", 0.0) 
        self.root.attributes("-toolwindow", True) # Don't show in taskbar
        
        # Colors (Apple Dark Mode)
        self.bg_color = "#1c1c1e" 
        self.border_color = "#3a3a3c"
        self.transparent_key = "#000001"
        
        self.root.config(bg=self.transparent_key)
        self.root.wm_attributes("-transparentcolor", self.transparent_key)
        
        # Dimensions
        self.size = 70
        screen_width = self.root.winfo_screenwidth()
        screen_height = self.root.winfo_screenheight()
        x = (screen_width - self.size) // 2
        y = screen_height - 140 
        self.root.geometry(f"{self.size}x{self.size}+{x}+{y}")
        
        self.canvas = tk.Canvas(self.root, width=self.size, height=self.size, bg=self.transparent_key, highlightthickness=0)
        self.canvas.pack()

        # --- GHOST MODE (Click-through & No-Focus) ---
        # Essential for overlay to not block typing
        if os.name == 'nt':
            try:
                import ctypes
                from ctypes import windll
                
                hwnd = windll.user32.GetParent(self.root.winfo_id())
                # Get current style
                style = windll.user32.GetWindowLongW(hwnd, -20) # GWL_EXSTYLE
                
                # WS_EX_LAYERED (0x80000) | WS_EX_TRANSPARENT (0x20) | WS_EX_NOACTIVATE (0x08000000) | WS_EX_TOPMOST (0x8)
                # WS_EX_NOACTIVATE is crucial: prevents window from becoming foreground when shown
                style = style | 0x00080000 | 0x00000020 | 0x08000000 | 0x00000008
                
                windll.user32.SetWindowLongW(hwnd, -20, style)
                # Force update
                windll.user32.SetWindowPos(hwnd, -1, 0, 0, 0, 0, 0x0003) # SWP_NOMOVE | SWP_NOSIZE
            except Exception as e:
                print(f"Ghost mode error: {e}")
        # ----------------------------------
        
        # State
        self.anim_id = None
        self.current_mode = None
        self.angle = 0
        self.pulse_scale = 1.0
        self.pulse_dir = 1
        
        # Base Shape (Container)
        # Draw a dark circle with a subtle border
        self.base = self.canvas.create_oval(2, 2, self.size-2, self.size-2, fill=self.bg_color, outline=self.border_color, width=2)

        # Icon Placeholders
        self.icon_items = []

        self.queue = queue.Queue()
        self.check_queue()

    def clear_icons(self):
        for item in self.icon_items:
            self.canvas.delete(item)
        self.icon_items = []

    # --- Siri Orb Implementation ---
    def draw_recording(self):
        self.clear_icons()
        cx, cy = self.size/2, self.size/2
        
        # We draw 3 layers to simulate the Siri Gradient Orb
        # Layer 1: Outer Glow (Purple/Pink)
        self.orb1 = self.canvas.create_oval(cx, cy, cx, cy, fill="#af52de", outline="") # Purple
        # Layer 2: Mid Glow (Blue)
        self.orb2 = self.canvas.create_oval(cx, cy, cx, cy, fill="#5856d6", outline="") # Indigo
        # Layer 3: Core (Cyan/White)
        self.orb3 = self.canvas.create_oval(cx, cy, cx, cy, fill="#00d1fb", outline="") # Cyan
        
        self.icon_items.extend([self.orb1, self.orb2, self.orb3])
        
        # Init organic movement vars
        self.tick = 0
        self.animate_siri_orb()

    def animate_siri_orb(self):
        if self.current_mode != "listening": return
        
        self.tick += 0.08 # Slower, smoother tick
        cx, cy = self.size/2, self.size/2
        
        # Synchronized Breathing (Heartbeat)
        # Base pulse
        pulse = math.sin(self.tick)
        
        # Layer 1 (Outer Purple) - Expands most
        r1 = 20 + pulse * 2
        # Layer 2 (Mid Blue) - Lagging slightly
        r2 = 16 + math.sin(self.tick - 0.5) * 2
        # Layer 3 (Core Cyan) - Stable center
        r3 = 12 + pulse * 1
        
        # Update Coords
        self.canvas.coords(self.orb1, cx-r1, cy-r1, cx+r1, cy+r1)
        self.canvas.coords(self.orb2, cx-r2, cy-r2, cx+r2, cy+r2)
        self.canvas.coords(self.orb3, cx-r3, cy-r3, cx+r3, cy+r3)
        
        self.anim_id = self.root.after(40, self.animate_siri_orb) # 25 FPS (Stable)

    def draw_processing(self):
        self.clear_icons()
        self.current_mode = "processing"
        # Spinner Arc (Apple White/Grey style)
        cx, cy = self.size/2, self.size/2
        r = 14
        item = self.canvas.create_arc(cx-r, cy-r, cx+r, cy+r, start=0, extent=100, style=tk.ARC, outline="#ffffff", width=3)
        self.icon_items.append(item)
        self.animate_spinner(item)
        
    def animate_pulse(self, item):
        pass # Deprecated for Siri Orb

    def animate_spinner(self, item):
        if self.current_mode != "processing": return
        
        self.angle = (self.angle - 15) % 360
        self.canvas.itemconfig(item, start=self.angle)
        
        self.anim_id = self.root.after(30, lambda: self.animate_spinner(item))

    def draw_success(self):
        self.clear_icons()
        self.current_mode = "success"
        # Green Checkmark
        # Points for a checkmark
        points = [20, 35, 30, 45, 50, 25] # Relative coords
        # Shift to center (approx)
        points = [p + 10 for p in points]
        
        item = self.canvas.create_line(points, capstyle=tk.ROUND, joinstyle=tk.ROUND, width=4, fill="#32d74b")
        self.icon_items.append(item)

    def check_queue(self):
        try:
            while True:
                msg = self.queue.get_nowait()
                action, data = msg
                if action == "show":
                    self.perform_show(data)
                elif action == "hide":
                    self.perform_hide()
                elif action == "update":
                    self.perform_update(data)
        except queue.Empty:
            pass
        self.root.after(50, self.check_queue)

    def perform_show(self, mode="listening"):
        self.root.attributes("-alpha", 1.0) 
        self.root.attributes("-topmost", True)
        self.root.lift()
        
        self.current_mode = mode
        if self.anim_id: self.root.after_cancel(self.anim_id)
        
        if mode == "listening":
            self.draw_recording()

    def perform_update(self, state):
        self.root.attributes("-topmost", True)
        if self.anim_id: self.root.after_cancel(self.anim_id)
        
        if state == "processing":
            self.draw_processing()
        elif state == "writing":
            self.draw_success()
             
    def perform_hide(self):
        self.root.attributes("-alpha", 0.0)
        self.current_mode = "hidden"

    def start(self):
        # Intro
        self.perform_show("listening")
        
        # Draw Apple Logo equivalent (Simple white dot for now)
        self.clear_icons()
        logo = self.canvas.create_oval(30,30,40,40, fill="white", outline="")
        self.icon_items.append(logo)
        
        self.root.after(1500, self.perform_hide)
        self.root.mainloop()

# --- Logic Core ---
class WisprCore:
    def __init__(self, ui_queue):
        self.ui_queue = ui_queue
        self.is_recording = False
        self.audio_buffer = []
        self.loop = asyncio.new_event_loop()
        self.stream = None

    def start_recording(self):
        if self.is_recording: return
        
        SoundManager.play_start()
        self.ui_queue.put(("show", "listening"))
        
        self.is_recording = True
        self.audio_buffer = []

        try:
            self.stream = sd.InputStream(
                samplerate=SAMPLE_RATE,
                channels=CHANNELS,
                callback=self.audio_callback
            )
            self.stream.start()
        except Exception as e:
            print(f"Audio Error: {e}")
            self.is_recording = False

    def stop_recording(self):
        if not self.is_recording: return
        
        SoundManager.play_stop()
        self.ui_queue.put(("update", "processing"))
        
        self.is_recording = False
        if self.stream:
            self.stream.stop()
            self.stream.close()
            self.stream = None
            
        # Send audio in background
        threading.Thread(target=self.run_async_send).start()

    def audio_callback(self, indata, frames, time, status):
        if self.is_recording:
            self.audio_buffer.append(indata.copy())

    def run_async_send(self):
         asyncio.run(self.send_audio())

    async def send_audio(self):
        if not self.audio_buffer:
            self.ui_queue.put(("hide", None))
            return

        try:
            # Prepare Audio
            audio_np = np.concatenate(self.audio_buffer, axis=0)
            audio_int16 = (audio_np * 32767).astype(np.int16)
            wav_buffer = io.BytesIO()
            write(wav_buffer, SAMPLE_RATE, audio_int16)
            wav_bytes = wav_buffer.getvalue()

            session_id = str(uuid.uuid4())
            uri = f"{API_URL}/{session_id}?auto_type=true"

            async with websockets.connect(uri) as websocket:
                await websocket.send(wav_bytes)
                
                # Wait for transcript/action
                # The backend will type it out for us due to auto_type=true
                
                # We show 'Writing' state
                self.ui_queue.put(("update", "writing"))
                
                response = await asyncio.wait_for(websocket.recv(), timeout=30.0)
                
                SoundManager.play_success()
                # Initial delay to let user see "Writing"
                await asyncio.sleep(0.5) 
                self.ui_queue.put(("hide", None))
                
        except Exception as e:
            print(f"Network Error: {e}")
            self.ui_queue.put(("hide", None))

    def toggle(self):
        if self.is_recording:
            self.stop_recording()
        else:
            self.start_recording()

# --- Main Entry ---
if __name__ == "__main__":
    print(f"=== Wispr Flow Native (GUI) ===")
    print(f"Hotkey: {HOTKEY}")
    
    # Init UI
    overlay = DictationOverlay()
    
    # Init Logic
    core = WisprCore(overlay.queue)
    
    # Hook Keyboard
    keyboard.add_hotkey(HOTKEY, core.toggle)
    
    # Run UI (Blocking)
    try:
        overlay.start()
    except KeyboardInterrupt:
        pass
