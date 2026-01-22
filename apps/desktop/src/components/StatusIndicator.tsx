import { Wifi, WifiOff, Circle } from 'lucide-react';
import { clsx } from 'clsx';
import type { VoiceState } from '../store';

interface StatusIndicatorProps {
    state: VoiceState;
    isConnected: boolean;
}

export function StatusIndicator({ state, isConnected }: StatusIndicatorProps) {
    return (
        <div className="absolute top-4 right-4 flex items-center gap-3">
            {/* Connection status */}
            <div
                className={clsx(
                    'flex items-center gap-2 px-3 py-1.5 rounded-full text-xs font-medium',
                    {
                        'bg-green-500/20 text-green-400': isConnected,
                        'bg-red-500/20 text-red-400': !isConnected,
                    }
                )}
            >
                {isConnected ? (
                    <Wifi className="w-3 h-3" />
                ) : (
                    <WifiOff className="w-3 h-3" />
                )}
                {isConnected ? 'Conectado' : 'Desconectado'}
            </div>

            {/* Voice state */}
            <div
                className={clsx(
                    'flex items-center gap-2 px-3 py-1.5 rounded-full text-xs font-medium',
                    {
                        'bg-white/10 text-white/50': state === 'idle',
                        'bg-red-500/20 text-red-400': state === 'listening',
                        'bg-amber-500/20 text-amber-400': state === 'processing',
                        'bg-green-500/20 text-green-400': state === 'speaking',
                    }
                )}
            >
                <Circle
                    className={clsx('w-2 h-2', {
                        'fill-white/50 text-white/50': state === 'idle',
                        'fill-red-400 text-red-400 animate-pulse': state === 'listening',
                        'fill-amber-400 text-amber-400 animate-pulse': state === 'processing',
                        'fill-green-400 text-green-400': state === 'speaking',
                    })}
                />
                {state === 'idle' && 'Esperando'}
                {state === 'listening' && 'Escuchando'}
                {state === 'processing' && 'Procesando'}
                {state === 'speaking' && 'Hablando'}
            </div>
        </div>
    );
}
