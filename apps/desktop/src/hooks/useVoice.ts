import { useCallback, useRef, useEffect } from 'react';
import { useVoiceStore } from '../store';

const API_URL = import.meta.env.VITE_API_URL || 'ws://localhost:8000';

export function useVoice() {
    const wsRef = useRef<WebSocket | null>(null);
    const mediaRecorderRef = useRef<MediaRecorder | null>(null);
    const audioContextRef = useRef<AudioContext | null>(null);

    const {
        isConnected,
        state,
        sessionId,
        setConnected,
        setSessionId,
        setState,
        setTranscript,
        addMessage,
    } = useVoiceStore();

    // Connect to WebSocket
    const connect = useCallback(() => {
        if (wsRef.current?.readyState === WebSocket.OPEN) return;

        const newSessionId = sessionId || crypto.randomUUID();
        setSessionId(newSessionId);
        setState('connecting');

        const ws = new WebSocket(`${API_URL}/ws/voice/${newSessionId}`);

        ws.onopen = () => {
            console.log('WebSocket connected');
            setConnected(true);
            setState('idle');
        };

        ws.onmessage = async (event) => {
            if (event.data instanceof Blob) {
                // Audio response - play it
                setState('speaking');
                await playAudio(event.data);
                setState('idle');
            } else {
                // JSON message
                try {
                    const data = JSON.parse(event.data);

                    if (data.type === 'transcript') {
                        setTranscript(data.text);
                        // Add user's transcribed message to chat
                        addMessage('user', data.text);
                    } else if (data.type === 'response') {
                        addMessage('assistant', data.text);
                        setTranscript('');
                        setState('speaking');
                    } else if (data.type === 'error') {
                        console.error('Server error:', data.message);
                        setState('error');
                    }
                } catch (e) {
                    console.error('Failed to parse message:', e);
                }
            }
        };

        ws.onclose = () => {
            console.log('WebSocket disconnected');
            setConnected(false);
            setState('idle');
        };

        ws.onerror = (error) => {
            console.error('WebSocket error:', error);
            setConnected(false);
            setState('error');
        };

        wsRef.current = ws;
    }, [sessionId, setConnected, setSessionId, setState, setTranscript, addMessage]);

    // Start listening
    const startListening = useCallback(async () => {
        if (!wsRef.current || wsRef.current.readyState !== WebSocket.OPEN) {
            connect();
            // Wait for connection
            await new Promise((resolve) => setTimeout(resolve, 500));
        }

        try {
            const stream = await navigator.mediaDevices.getUserMedia({
                audio: {
                    sampleRate: 16000,
                    channelCount: 1,
                    echoCancellation: true,
                    noiseSuppression: true,
                },
            });

            const mediaRecorder = new MediaRecorder(stream, {
                mimeType: 'audio/webm;codecs=opus',
            });

            const audioChunks: Blob[] = [];

            mediaRecorder.ondataavailable = (event) => {
                if (event.data.size > 0) {
                    audioChunks.push(event.data);
                }
            };

            mediaRecorder.onstop = async () => {
                // Send complete audio to server
                if (audioChunks.length > 0 && wsRef.current?.readyState === WebSocket.OPEN) {
                    const audioBlob = new Blob(audioChunks, { type: 'audio/webm' });
                    const arrayBuffer = await audioBlob.arrayBuffer();
                    wsRef.current.send(arrayBuffer);
                    setState('processing');
                } else {
                    // If not connected, or no audio, return to idle
                    setState('idle');
                }

                // Stop all tracks
                stream.getTracks().forEach((track) => track.stop());
            };

            mediaRecorder.start(100); // Collect chunks every 100ms
            mediaRecorderRef.current = mediaRecorder;
            setState('listening');
        } catch (error) {
            console.error('Failed to start recording:', error);
            setState('error');
        }
    }, [connect, setState]);

    // Stop listening
    const stopListening = useCallback(() => {
        if (mediaRecorderRef.current && mediaRecorderRef.current.state === 'recording') {
            mediaRecorderRef.current.stop();
            // Note: User message is now added when transcript arrives from backend
        }
    }, []);

    // Play audio
    const playAudio = async (blob: Blob) => {
        try {
            if (!audioContextRef.current) {
                audioContextRef.current = new AudioContext();
            }

            const arrayBuffer = await blob.arrayBuffer();
            const audioBuffer = await audioContextRef.current.decodeAudioData(arrayBuffer);

            const source = audioContextRef.current.createBufferSource();
            source.buffer = audioBuffer;
            source.connect(audioContextRef.current.destination);
            source.start();

            // Wait for audio to finish
            return new Promise<void>((resolve) => {
                source.onended = () => resolve();
            });
        } catch (error) {
            console.error('Failed to play audio:', error);
        }
    };

    // Cleanup on unmount
    useEffect(() => {
        return () => {
            if (wsRef.current) {
                wsRef.current.close();
            }
            if (mediaRecorderRef.current) {
                mediaRecorderRef.current.stop();
            }
        };
    }, []);

    return {
        state,
        isConnected,
        sessionId,
        connect,
        startListening,
        stopListening,
    };
}
