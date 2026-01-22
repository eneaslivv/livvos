import { motion, AnimatePresence } from 'framer-motion';
import { User, Bot } from 'lucide-react';
import type { Message } from '../store';

interface ChatContainerProps {
    messages: Message[];
}

export function ChatContainer({ messages }: ChatContainerProps) {
    return (
        <div className="h-full overflow-y-auto flex flex-col gap-4 py-4 px-2">
            <AnimatePresence initial={false}>
                {messages.map((message) => (
                    <motion.div
                        key={message.id}
                        initial={{ opacity: 0, y: 20 }}
                        animate={{ opacity: 1, y: 0 }}
                        exit={{ opacity: 0, y: -20 }}
                        transition={{ duration: 0.3 }}
                        className={`flex gap-3 ${message.role === 'user' ? 'flex-row-reverse' : 'flex-row'
                            }`}
                    >
                        {/* Avatar */}
                        <div
                            className={`w-8 h-8 rounded-full flex items-center justify-center flex-shrink-0 ${message.role === 'user'
                                ? 'bg-primary-500'
                                : 'bg-gradient-to-br from-accent to-purple-600'
                                }`}
                        >
                            {message.role === 'user' ? (
                                <User className="w-4 h-4 text-white" />
                            ) : (
                                <Bot className="w-4 h-4 text-white" />
                            )}
                        </div>

                        {/* Message bubble */}
                        <div
                            className={`rounded-2xl px-4 py-3 max-w-[75%] border ${message.role === 'user'
                                ? 'bg-primary-950/30 border-primary-500/20 text-white'
                                : 'bg-zinc-900 border-white/5 text-zinc-200'
                                }`}
                        >
                            <p className="text-white/90 text-sm leading-relaxed">
                                {message.content}
                            </p>
                            <span className="text-[10px] text-white/30 mt-1 block">
                                {new Date(message.createdAt).toLocaleTimeString('es-AR', {
                                    hour: '2-digit',
                                    minute: '2-digit',
                                })}
                            </span>
                        </div>
                    </motion.div>
                ))}
            </AnimatePresence>

            {/* Empty state */}
            {messages.length === 0 && (
                <div className="flex-1 flex items-center justify-center">
                    <div className="text-center text-white/30">
                        <Bot className="w-16 h-16 mx-auto mb-4 opacity-50" />
                        <p className="text-lg font-medium">¡Hola! Soy tu asistente</p>
                        <p className="text-sm mt-1">
                            Presioná el botón y decime qué necesitás
                        </p>
                    </div>
                </div>
            )}
        </div>
    );
}
