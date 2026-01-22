import { motion } from 'framer-motion';

interface WaveformProps {
    isActive: boolean;
    barCount?: number;
}

export function Waveform({ isActive, barCount = 5 }: WaveformProps) {
    return (
        <div className="flex items-center gap-1 h-12">
            {[...Array(barCount)].map((_, i) => (
                <motion.div
                    key={i}
                    className="w-1 bg-gradient-to-t from-primary-500 to-accent rounded-full"
                    animate={
                        isActive
                            ? {
                                height: [12, 32, 20, 40, 16],
                            }
                            : {
                                height: 12,
                            }
                    }
                    transition={
                        isActive
                            ? {
                                duration: 0.8,
                                repeat: Infinity,
                                repeatType: 'reverse',
                                delay: i * 0.1,
                            }
                            : {
                                duration: 0.3,
                            }
                    }
                />
            ))}
        </div>
    );
}
