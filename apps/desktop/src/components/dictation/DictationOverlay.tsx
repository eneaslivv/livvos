import React, { useEffect } from 'react';
import { Mic, MicOff, Clipboard } from 'lucide-react';
import { useDictation } from '../../hooks/useDictation';

interface DictationOverlayProps {
    isVisible: boolean;
    onClose?: () => void;
}

export const DictationOverlay: React.FC<DictationOverlayProps> = ({ isVisible, onClose }) => {
    const {
        isActive,
        isListening,
        transcript,
        interimTranscript,
        displayText,
        startDictation,
        stopDictation,
        toggleDictation,
        copyToClipboard,
    } = useDictation({
        autoPaste: true,
        onComplete: (text) => {
            console.log('Dictation complete:', text);
            // El overlay se cierra automáticamente después de pegar
            setTimeout(() => onClose?.(), 500);
        },
    });

    // Iniciar automáticamente cuando se muestra
    useEffect(() => {
        if (isVisible && !isActive) {
            startDictation();
        } else if (!isVisible && isActive) {
            stopDictation();
        }
    }, [isVisible, isActive, startDictation, stopDictation]);

    // Cerrar con Escape
    useEffect(() => {
        const handleKeyDown = (e: KeyboardEvent) => {
            if (e.key === 'Escape') {
                stopDictation();
                onClose?.();
            }
        };

        window.addEventListener('keydown', handleKeyDown);
        return () => window.removeEventListener('keydown', handleKeyDown);
    }, [stopDictation, onClose]);

    if (!isVisible) return null;

    return (
        <div className="fixed inset-0 z-50 flex items-start justify-center pt-20 bg-black/50 backdrop-blur-sm">
            <div
                className="bg-zinc-900/95 backdrop-blur-xl rounded-2xl shadow-2xl border border-zinc-700 p-6 min-w-[400px] max-w-[600px]"
                style={{ animation: 'slideDown 0.3s ease-out' }}
            >
                {/* Header */}
                <div className="flex items-center justify-between mb-4">
                    <div className="flex items-center gap-3">
                        <div className={`p-2 rounded-full ${isListening ? 'bg-red-500/20' : 'bg-zinc-700'}`}>
                            {isListening ? (
                                <Mic className="w-5 h-5 text-red-500 animate-pulse" />
                            ) : (
                                <MicOff className="w-5 h-5 text-zinc-400" />
                            )}
                        </div>
                        <div>
                            <span className="text-lg font-medium text-white">
                                {isListening ? 'Escuchando...' : 'Dictado'}
                            </span>
                            <p className="text-xs text-zinc-500">El texto se pegará automáticamente</p>
                        </div>
                    </div>

                    {/* Indicador de grabación */}
                    {isListening && (
                        <div className="flex items-center gap-2">
                            <div className="w-2 h-2 bg-red-500 rounded-full animate-pulse" />
                            <span className="text-xs text-red-400 font-medium">REC</span>
                        </div>
                    )}
                </div>

                {/* Área de texto */}
                <div className="bg-zinc-800/50 rounded-xl p-4 min-h-[100px] max-h-[250px] overflow-y-auto mb-4">
                    {displayText ? (
                        <p className="text-white text-lg leading-relaxed">
                            {transcript}
                            {interimTranscript && (
                                <span className="text-zinc-400 italic"> {interimTranscript}</span>
                            )}
                        </p>
                    ) : (
                        <p className="text-zinc-500 text-center py-4">
                            {isListening ? 'Empezá a hablar...' : 'Presioná para comenzar'}
                        </p>
                    )}
                </div>

                {/* Barra de waveform animada */}
                {isListening && (
                    <div className="flex items-center justify-center gap-1 mb-4 h-8">
                        {[...Array(20)].map((_, i) => (
                            <div
                                key={i}
                                className="w-1 bg-primary-500 rounded-full animate-waveform"
                                style={{
                                    animationDelay: `${i * 0.05}s`,
                                    height: `${Math.random() * 24 + 8}px`,
                                }}
                            />
                        ))}
                    </div>
                )}

                {/* Controles */}
                <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2 text-xs text-zinc-500">
                        <kbd className="px-2 py-1 bg-zinc-800 rounded border border-zinc-700">Esc</kbd>
                        <span>para cancelar</span>
                    </div>

                    <div className="flex items-center gap-2">
                        {/* Botón copiar */}
                        {transcript && (
                            <button
                                onClick={() => copyToClipboard(transcript)}
                                className="p-2 hover:bg-zinc-700 rounded-lg transition-colors"
                                title="Copiar al clipboard"
                            >
                                <Clipboard className="w-4 h-4 text-zinc-400" />
                            </button>
                        )}

                        {/* Botón principal */}
                        <button
                            onClick={toggleDictation}
                            className={`
                px-6 py-2 rounded-xl font-medium transition-all
                ${isListening
                                    ? 'bg-red-500 hover:bg-red-600 text-white'
                                    : 'bg-primary-500 hover:bg-primary-600 text-white'
                                }
              `}
                        >
                            {isListening ? 'Detener y Pegar' : 'Iniciar'}
                        </button>
                    </div>
                </div>
            </div>

            <style>{`
        @keyframes slideDown {
          from {
            opacity: 0;
            transform: translateY(-20px);
          }
          to {
            opacity: 1;
            transform: translateY(0);
          }
        }
        @keyframes waveform {
          0%, 100% { transform: scaleY(0.3); }
          50% { transform: scaleY(1); }
        }
        .animate-waveform {
          animation: waveform 0.5s ease-in-out infinite;
        }
      `}</style>
        </div>
    );
};
