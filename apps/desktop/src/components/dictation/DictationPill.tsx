import React from 'react';
import { Mic } from 'lucide-react';
import { useDictation } from '../../hooks/useDictation';

/**
 * Versión minimalista tipo "pill" que aparece en la esquina
 * Similar a como funciona Wispr Flow
 */
export const DictationPill: React.FC = () => {
    const {
        isActive,
        isListening,
        interimTranscript,
        transcript,
    } = useDictation({
        autoPaste: true,
    });

    if (!isActive) return null;

    return (
        <div
            className="fixed bottom-6 left-1/2 -translate-x-1/2 z-[9999]"
            style={{ animation: 'fadeInUp 0.2s ease-out' }}
        >
            <div className="flex items-center gap-3 bg-black/90 backdrop-blur-xl rounded-full px-4 py-2 shadow-2xl border border-white/10">
                {/* Indicador de mic */}
                <div
                    className={`
            w-3 h-3 rounded-full transition-colors
            ${isListening ? 'bg-red-500 animate-pulse' : 'bg-zinc-500'}
          `}
                />

                {/* Ícono */}
                <Mic className={`w-4 h-4 ${isListening ? 'text-white' : 'text-zinc-400'}`} />

                {/* Texto interim o transcript */}
                {(interimTranscript || transcript) && (
                    <span className="text-white text-sm max-w-[300px] truncate">
                        {interimTranscript || transcript}
                    </span>
                )}

                {/* Estado */}
                <span className="text-zinc-400 text-xs">
                    {isListening ? 'Hablá...' : 'Listo'}
                </span>
            </div>

            <style>{`
        @keyframes fadeInUp {
          from {
            opacity: 0;
            transform: translate(-50%, 20px);
          }
          to {
            opacity: 1;
            transform: translate(-50%, 0);
          }
        }
      `}</style>
        </div>
    );
};
