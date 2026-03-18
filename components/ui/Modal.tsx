import React, { useEffect, useCallback } from 'react';
import { createPortal } from 'react-dom';
import { motion, AnimatePresence } from 'framer-motion';
import { Icons } from './Icons';
import { useIsMobile } from '../../hooks/useMediaQuery';

interface ModalProps {
    isOpen: boolean;
    onClose: () => void;
    title?: string;
    size?: 'sm' | 'md' | 'lg' | 'xl' | '2xl' | '4xl';
    children: React.ReactNode;
}

const sizeClasses = {
    sm: 'max-w-sm',
    md: 'max-w-md',
    lg: 'max-w-lg',
    xl: 'max-w-xl',
    '2xl': 'max-w-2xl',
    '4xl': 'max-w-4xl',
};

export const Modal: React.FC<ModalProps> = ({
    isOpen,
    onClose,
    title,
    size = 'md',
    children,
}) => {
    const isMobile = useIsMobile();

    const handleEscape = useCallback(
        (e: KeyboardEvent) => {
            if (e.key === 'Escape') onClose();
        },
        [onClose]
    );

    useEffect(() => {
        if (isOpen) {
            document.addEventListener('keydown', handleEscape);
            document.body.style.overflow = 'hidden';
        }
        return () => {
            document.removeEventListener('keydown', handleEscape);
            document.body.style.overflow = '';
        };
    }, [isOpen, handleEscape]);

    return createPortal(
        <AnimatePresence>
            {isOpen && (
                <div className={`fixed inset-0 z-50 ${isMobile ? 'flex items-end' : 'flex items-center justify-center p-4'}`}>
                    {/* Backdrop */}
                    <motion.div
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 1 }}
                        exit={{ opacity: 0 }}
                        onClick={onClose}
                        className="absolute inset-0 bg-black/40 backdrop-blur-sm"
                    />

                    {/* Modal Content */}
                    <motion.div
                        initial={isMobile ? { y: '100%' } : { opacity: 0, scale: 0.95, y: 10 }}
                        animate={isMobile ? { y: 0 } : { opacity: 1, scale: 1, y: 0 }}
                        exit={isMobile ? { y: '100%' } : { opacity: 0, scale: 0.95, y: 10 }}
                        transition={isMobile
                            ? { type: 'spring', damping: 28, stiffness: 300 }
                            : { type: 'spring', damping: 25, stiffness: 300 }
                        }
                        className={`relative w-full ${isMobile ? 'max-h-[85vh] rounded-t-3xl rounded-b-none' : `${sizeClasses[size]} max-h-[90vh] rounded-2xl`} bg-white dark:bg-zinc-950 shadow-2xl border border-zinc-200 dark:border-zinc-800 overflow-hidden flex flex-col`}
                        style={isMobile ? { paddingBottom: 'env(safe-area-inset-bottom, 0px)' } : undefined}
                        onClick={(e) => e.stopPropagation()}
                    >
                        {/* Mobile drag handle */}
                        {isMobile && (
                            <div className="flex justify-center pt-3 pb-1 shrink-0">
                                <div className="w-10 h-1 rounded-full bg-zinc-300 dark:bg-zinc-700" />
                            </div>
                        )}

                        {title && (
                            <div className={`flex items-center justify-between ${isMobile ? 'px-5 py-3' : 'px-6 py-4'} border-b border-zinc-100 dark:border-zinc-900 bg-white dark:bg-zinc-950 z-10`}>
                                <h2 className={`${isMobile ? 'text-lg' : 'text-xl'} font-bold text-zinc-900 dark:text-zinc-100`}>
                                    {title}
                                </h2>
                                <button
                                    onClick={onClose}
                                    className="p-2 text-zinc-400 hover:text-zinc-600 dark:hover:text-zinc-200 rounded-full hover:bg-zinc-100 dark:hover:bg-zinc-900 transition-colors"
                                >
                                    <Icons.X size={20} />
                                </button>
                            </div>
                        )}

                        <div className="flex-1 overflow-y-auto overscroll-contain">
                            {children}
                        </div>
                    </motion.div>
                </div>
            )}
        </AnimatePresence>,
        document.body
    );
};
