from fastapi import APIRouter, WebSocket, WebSocketDisconnect, Query
import structlog
import asyncio
import pyautogui
import pyperclip

from src.services.asr import transcribe_audio

router = APIRouter()
logger = structlog.get_logger()

# Configure pyautogui
pyautogui.FAILSAFE = False # Prevent errors if cursor is in corner

def type_text_via_clipboard(text: str):
    """Type text by copying to clipboard and pressing Ctrl+V."""
    try:
        # Prevent "Sticky Keys" issue:
        # If user releases Ctrl+Shift hotkey just as we try to paste, 
        # Windows might still think Shift is down, resulting in Ctrl+Shift+V (Paste Plain Text)
        # which doesn't work in many apps. We force release modifiers.
        pyautogui.keyUp('shift')
        pyautogui.keyUp('ctrl') 
        pyautogui.keyUp('alt')
        
        pyperclip.copy(text)
        # Wait for clipboard to actually update (Windows is slow)
        pyautogui.sleep(0.3) 
        
        pyautogui.hotkey('ctrl', 'v')
    except Exception as e:
        logger.error("keyboard_simulation_failed", error=str(e))

@router.websocket("/dictation/{session_id}")
async def dictation_websocket(
    websocket: WebSocket, 
    session_id: str,
    auto_type: bool = Query(False)
):
    """
    WebSocket for dictation.
    params:
    - auto_type: If true, the server will simulate keystrokes to type the text.
    """
    await websocket.accept()
    logger.info("Dictation WebSocket connected", session_id=session_id, auto_type=auto_type)
    
    try:
        while True:
            # Recibir datos del cliente
            data = await websocket.receive()
            
            # Check for disconnect
            if data.get("type") == "websocket.disconnect":
                logger.info("Dictation client disconnected", session_id=session_id)
                break
            
            if "bytes" in data:
                audio_data = data["bytes"]
                logger.debug(f"Dictation received audio: {len(audio_data)} bytes")
                
                try:
                    # Transcribir audio
                    # Transcribe
                    transcript = await transcribe_audio(audio_data, delayed=True)
                    
                    # --- Custom Corrections ---
                    # User specifically requested "Dale" instead of "Vale"
                    # Using simple replacement for now as it's a strong user preference
                    if transcript:
                        transcript = transcript.replace("Vale", "Dale").replace("vale", "dale")
                    # --------------------------
                    
                    if transcript and transcript.strip():
                        logger.info(f"Dictation transcript: {transcript[:100]}")
                        
                        # Enviar transcripción al cliente
                        await websocket.send_json({
                            "type": "transcript",
                            "text": transcript,
                        })
                        
                        # Auto-Type if enabled
                        if auto_type:
                            logger.info(f"Auto-typing text for session {session_id}")
                            try:
                                # Run blocking keyboard ops in a separate thread
                                await asyncio.to_thread(type_text_via_clipboard, transcript)
                            except Exception as e:
                                logger.error("Auto-type error", error=str(e))
                            
                except Exception as e:
                    logger.error("Dictation transcription error", error=str(e))
                    await websocket.send_json({
                        "type": "error",
                        "message": str(e),
                    })
    
    except WebSocketDisconnect:
        logger.info("Dictation WebSocket disconnected", session_id=session_id)
    except Exception as e:
        logger.error("Dictation WebSocket error", error=str(e))
