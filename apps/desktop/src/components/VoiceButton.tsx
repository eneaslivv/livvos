import { motion } from 'framer-motion';
import { Mic, Square, Loader2 } from 'lucide-react';
import { clsx } from 'clsx';
import type { VoiceState } from '../store';

interface VoiceButtonProps {
    state: VoiceState;
    onStart: () => void;
    onStop: () => void;
}

export function VoiceButton({ state, onStart, onStop }: VoiceButtonProps) {
    const isListening = state === 'listening';
    const isProcessing = state === 'processing';
    const isSpeaking = state === 'speaking';
    const isIdle = state === 'idle';
    const isDisabled = isProcessing || isSpeaking;

    const handleClick = () => {
        if (isDisabled) return;
        if (isListening) {
            onStop();
        } else {
            onStart();
        }
    };

    return (
        <div className="relative">
            {/* Outer pulse ring when listening */}
            {isListening && (
                <>
                    <motion.div
                        className="absolute inset-0 rounded-full bg-primary-500"
                        initial={{ scale: 1, opacity: 0.5 }}
                        animate={{ scale: 1.5, opacity: 0 }}
                        transition={{ duration: 1.5, repeat: Infinity }}
                    />
                    <motion.div
                        className="absolute inset-0 rounded-full bg-primary-500"
                        initial={{ scale: 1, opacity: 0.3 }}
                        animate={{ scale: 1.8, opacity: 0 }}
                        transition={{ duration: 1.5, repeat: Infinity, delay: 0.5 }}
                    />
                </>
            )}

            {/* Main button */}
            <motion.button
                onClick={handleClick}
                disabled={isDisabled}
                whileTap={{ scale: 0.95 }}
                className={clsx(
                    'relative w-24 h-24 rounded-full flex items-center justify-center transition-all duration-300',
                    {
                        'bg-gradient-to-br from-primary-500 to-primary-600 glow-primary cursor-pointer hover:from-primary-400 hover:to-primary-500':
                            isIdle,
                        'bg-gradient-to-br from-red-500 to-red-600 glow-accent cursor-pointer':
                            isListening,
                        'bg-gradient-to-br from-amber-500 to-amber-600 cursor-wait':
                            isProcessing,
                        'bg-gradient-to-br from-green-500 to-green-600 glow-success cursor-default':
                            isSpeaking,
                    }
                )}
            >
                {isIdle && <Mic className="w-10 h-10 text-white" />}
                {isListening && <Square className="w-8 h-8 text-white" />}
                {isProcessing && (
                    <Loader2 className="w-10 h-10 text-white animate-spin" />
                )}
                {isSpeaking && (
                    <div className="flex items-center gap-1">
                        {[...Array(3)].map((_, i) => (
                            <motion.div
                                key={i}
                                className="w-1.5 h-6 bg-white rounded-full"
                                animate={{ scaleY: [0.4, 1, 0.4] }}
                                transition={{
                                    duration: 0.6,
                                    repeat: Infinity,
                                    delay: i * 0.1,
                                }}
                            />
                        ))}
                    </div>
                )}
            </motion.button>

            {/* State label */}
            <div className="absolute -bottom-8 left-1/2 -translate-x-1/2 whitespace-nowrap">
                <span
                    className={clsx('text-xs font-medium uppercase tracking-wider', {
                        'text-primary-400': isIdle,
                        'text-red-400': isListening,
                        'text-amber-400': isProcessing,
                        'text-green-400': isSpeaking,
                    })}
                >
                    {isIdle && 'Listo'}
                    {isListening && 'Grabando'}
                    {isProcessing && 'Pensando'}
                    {isSpeaking && 'Hablando'}
                </span>
            </div>
        </div>
    );
}
