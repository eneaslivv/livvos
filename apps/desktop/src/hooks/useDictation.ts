import { useState, useCallback, useRef, useEffect } from 'react';
import { invoke } from '@tauri-apps/api/core';

interface UseDictationOptions {
    // Callback cuando se transcribe texto
    onTranscript?: (text: string) => void;
    // Callback cuando se completa el dictado
    onComplete?: (fullText: string) => void;
    // Callback en errores
    onError?: (error: Error) => void;
    // Auto-pegar después de transcribir
    autoPaste?: boolean;
    // URL del WebSocket de ASR
    wsUrl?: string;
}

interface DictationState {
    isActive: boolean;
    isListening: boolean;
    transcript: string;
    interimTranscript: string;
    error: string | null;
}

export function useDictation(options: UseDictationOptions = {}) {
    const {
        onTranscript,
        onComplete,
        onError,
        autoPaste = true,
        wsUrl = 'ws://localhost:8000/ws/dictation',
    } = options;

    const [state, setState] = useState<DictationState>({
        isActive: false,
        isListening: false,
        transcript: '',
        interimTranscript: '',
        error: null,
    });

    const wsRef = useRef<WebSocket | null>(null);
    const mediaRecorderRef = useRef<MediaRecorder | null>(null);
    const fullTranscriptRef = useRef<string>('');

    // Copiar texto al clipboard
    const copyToClipboard = useCallback(async (text: string) => {
        try {
            await invoke('copy_to_clipboard', { text });
            return true;
        } catch (error) {
            console.error('Error copying to clipboard:', error);
            // Fallback to browser API
            try {
                await navigator.clipboard.writeText(text);
                return true;
            } catch {
                return false;
            }
        }
    }, []);

    // Simular paste
    const simulatePaste = useCallback(async () => {
        try {
            await invoke('simulate_paste');
            return true;
        } catch (error) {
            console.error('Error simulating paste:', error);
            return false;
        }
    }, []);

    // Copiar y pegar en un solo paso
    const copyAndPaste = useCallback(async (text: string) => {
        try {
            await invoke('copy_and_paste', { text });
            return true;
        } catch (error) {
            console.error('Error in copy_and_paste:', error);
            // Fallback: just copy to clipboard
            await copyToClipboard(text);
            return false;
        }
    }, [copyToClipboard]);

    // Escribir texto directamente
    const typeText = useCallback(async (text: string, delayMs?: number) => {
        try {
            await invoke('type_text', { text, delayMs });
            return true;
        } catch (error) {
            console.error('Error typing text:', error);
            return false;
        }
    }, []);

    // Iniciar grabación de audio
    const startRecording = useCallback(async () => {
        try {
            const stream = await navigator.mediaDevices.getUserMedia({
                audio: {
                    channelCount: 1,
                    sampleRate: 16000,
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

            mediaRecorder.onstop = () => {
                if (audioChunks.length > 0 && wsRef.current?.readyState === WebSocket.OPEN) {
                    const audioBlob = new Blob(audioChunks, { type: 'audio/webm' });
                    // Send as a single message
                    wsRef.current.send(audioBlob);
                }
            };

            mediaRecorder.start(100); // Enviar chunks cada 100ms
            mediaRecorderRef.current = mediaRecorder;

            setState((prev) => ({ ...prev, isListening: true }));
        } catch (error) {
            console.error('Error starting recording:', error);
            onError?.(error as Error);
        }
    }, [onError]);

    // Detener grabación
    const stopRecording = useCallback(() => {
        if (mediaRecorderRef.current && mediaRecorderRef.current.state === 'recording') {
            mediaRecorderRef.current.stop();
            mediaRecorderRef.current.stream.getTracks().forEach((track) => track.stop());
            mediaRecorderRef.current = null;
        }
        setState((prev) => ({ ...prev, isListening: false }));
    }, []);

    // Conectar WebSocket
    const connectWebSocket = useCallback(() => {
        const sessionId = crypto.randomUUID();
        const ws = new WebSocket(`${wsUrl}/${sessionId}`);

        ws.onopen = () => {
            console.log('Dictation WebSocket connected');
            startRecording();
        };

        ws.onmessage = (event) => {
            try {
                const data = JSON.parse(event.data);

                if (data.type === 'transcript') {
                    const text = data.text;

                    // Acumular transcripciones
                    fullTranscriptRef.current += (fullTranscriptRef.current ? ' ' : '') + text;

                    setState((prev) => ({
                        ...prev,
                        transcript: fullTranscriptRef.current,
                        interimTranscript: '',
                    }));

                    onTranscript?.(text);
                } else if (data.type === 'interim') {
                    // Texto intermedio (mientras habla)
                    setState((prev) => ({
                        ...prev,
                        interimTranscript: data.text,
                    }));
                }
            } catch (error) {
                console.error('Error parsing WebSocket message:', error);
            }
        };

        ws.onerror = (error) => {
            console.error('WebSocket error:', error);
            onError?.(new Error('WebSocket connection error'));
        };

        ws.onclose = () => {
            console.log('Dictation WebSocket closed');
        };

        wsRef.current = ws;
    }, [wsUrl, startRecording, onTranscript, onError]);

    // Iniciar dictado
    const startDictation = useCallback(() => {
        if (state.isActive) return;

        fullTranscriptRef.current = '';

        setState({
            isActive: true,
            isListening: false,
            transcript: '',
            interimTranscript: '',
            error: null,
        });

        connectWebSocket();
    }, [state.isActive, connectWebSocket]);

    // Detener dictado
    const stopDictation = useCallback(async () => {
        if (!state.isActive) return;

        stopRecording();
        wsRef.current?.close();
        wsRef.current = null;

        const finalText = fullTranscriptRef.current;

        setState((prev) => ({
            ...prev,
            isActive: false,
            isListening: false,
        }));

        // Auto-pegar si está habilitado y hay texto
        if (autoPaste && finalText.trim()) {
            // Pequeña pausa para que la ventana anterior recupere el foco
            await new Promise((resolve) => setTimeout(resolve, 150));
            await copyAndPaste(finalText);
        }

        onComplete?.(finalText);
    }, [state.isActive, stopRecording, autoPaste, copyAndPaste, onComplete]);

    // Toggle dictado
    const toggleDictation = useCallback(() => {
        if (state.isActive) {
            stopDictation();
        } else {
            startDictation();
        }
    }, [state.isActive, startDictation, stopDictation]);

    // Cleanup al desmontar
    useEffect(() => {
        return () => {
            stopRecording();
            wsRef.current?.close();
        };
    }, [stopRecording]);

    return {
        // Estado
        isActive: state.isActive,
        isListening: state.isListening,
        transcript: state.transcript,
        interimTranscript: state.interimTranscript,
        displayText: state.transcript + (state.interimTranscript ? ` ${state.interimTranscript}` : ''),
        error: state.error,

        // Acciones
        startDictation,
        stopDictation,
        toggleDictation,

        // Utilidades de clipboard
        copyToClipboard,
        simulatePaste,
        copyAndPaste,
        typeText,
    };
}
