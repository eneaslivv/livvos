import { useState, useEffect } from 'react';
import { VoiceButton } from './components/VoiceButton';
import { ChatContainer } from './components/ChatContainer';
import { StatusIndicator } from './components/StatusIndicator';
import { Waveform } from './components/Waveform';
import { DictationOverlay } from './components/dictation/DictationOverlay';
import { useVoice } from './hooks/useVoice';
import { useVoiceStore } from './store';
import { Settings, Mic, MessageSquare } from 'lucide-react';
import { listen } from '@tauri-apps/api/event';

function App() {
    const [mode, setMode] = useState<'agent' | 'dictation'>('agent');
    const [showDictation, setShowDictation] = useState(false);
    const { state, messages, transcript } = useVoiceStore();
    const { startListening, stopListening, isConnected, connect } = useVoice();

    // Escuchar evento de Tauri para activar dictado (Ctrl+Shift+D)
    useEffect(() => {
        let unlistenPromise: Promise<() => void>;

        try {
            unlistenPromise = listen('start-dictation', () => {
                setMode('dictation');
                setShowDictation(true);
            });
        } catch (error) {
            console.log('Tauri events not available');
        }

        return () => {
            if (unlistenPromise) {
                unlistenPromise.then(fn => fn()).catch(console.error);
            }
        };
    }, []);

    // Manejar cambio de modo
    const handleModeChange = (newMode: 'agent' | 'dictation') => {
        setMode(newMode);
        if (newMode === 'dictation') {
            setShowDictation(true);
        }
    };

    return (
        <div className="min-h-screen flex flex-col">
            {/* Header */}
            <header className="flex items-center justify-between px-6 py-4 border-b border-white/5 bg-black">
                <div className="flex items-center gap-3">
                    <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-primary-500 to-accent flex items-center justify-center">
                        <Mic className="w-5 h-5 text-white" />
                    </div>
                    <div>
                        <h1 className="text-lg font-semibold text-white">Antigravity</h1>
                        <p className="text-xs text-white/50">Voice Assistant</p>
                    </div>
                </div>

                {/* Mode toggle */}
                <div className="flex items-center gap-2">
                    <button
                        onClick={() => handleModeChange('agent')}
                        className={`px-4 py-2 rounded-lg text-sm font-medium transition-all ${mode === 'agent'
                            ? 'bg-primary-500 text-white'
                            : 'text-white/60 hover:text-white hover:bg-white/10'
                            }`}
                    >
                        <MessageSquare className="w-4 h-4 inline mr-2" />
                        Agente
                    </button>
                    <button
                        onClick={() => handleModeChange('dictation')}
                        className={`px-4 py-2 rounded-lg text-sm font-medium transition-all ${mode === 'dictation'
                            ? 'bg-primary-500 text-white'
                            : 'text-white/60 hover:text-white hover:bg-white/10'
                            }`}
                    >
                        <Mic className="w-4 h-4 inline mr-2" />
                        Dictado
                    </button>
                </div>

                <button className="p-2 rounded-lg hover:bg-white/10 transition-colors">
                    <Settings className="w-5 h-5 text-white/60" />
                </button>
            </header>

            {/* Main content */}
            <main className="flex-1 flex flex-col items-center justify-center p-6 relative">
                {/* Status indicator */}
                <StatusIndicator state={state} isConnected={isConnected} />

                {/* Chat messages (agent mode) */}
                {mode === 'agent' && (
                    <div className="absolute inset-x-6 top-20 bottom-48 overflow-hidden">
                        <ChatContainer messages={messages} />
                    </div>
                )}

                {/* Dictation transcript (inline mode) */}
                {mode === 'dictation' && transcript && !showDictation && (
                    <div className="absolute inset-x-6 top-20 bottom-48 flex items-center justify-center">
                        <div className="glass rounded-2xl p-8 max-w-2xl">
                            <p className="text-2xl text-white/90 leading-relaxed">{transcript}</p>
                        </div>
                    </div>
                )}

                {/* Waveform visualization */}
                {(state === 'listening' || state === 'speaking') && (
                    <div className="absolute bottom-52 left-1/2 -translate-x-1/2">
                        <Waveform isActive={state === 'listening'} />
                    </div>
                )}

                {/* Voice button */}
                <div className="absolute bottom-20">
                    {mode === 'agent' ? (
                        <VoiceButton
                            state={state}
                            onStart={startListening}
                            onStop={stopListening}
                        />
                    ) : (
                        <button
                            onClick={() => setShowDictation(true)}
                            className="w-20 h-20 rounded-full bg-primary-500 hover:bg-primary-600 flex items-center justify-center shadow-lg transition-all hover:scale-105"
                        >
                            <Mic className="w-8 h-8 text-white" />
                        </button>
                    )}
                </div>

                {/* Hint text */}
                <p className="absolute bottom-6 text-white/40 text-sm">
                    {mode === 'agent' && (
                        <>
                            {state === 'idle' && 'Presioná para hablar'}
                            {state === 'listening' && 'Escuchando...'}
                            {state === 'processing' && 'Procesando...'}
                            {state === 'speaking' && 'Respondiendo...'}
                        </>
                    )}
                    {mode === 'dictation' && (
                        'Presioná para dictar • El texto se pegará automáticamente'
                    )}
                </p>
            </main>

            {/* Dictation Overlay */}
            <DictationOverlay
                isVisible={showDictation}
                onClose={() => setShowDictation(false)}
            />
        </div>
    );
}

export default App;

