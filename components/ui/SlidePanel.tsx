import React, { useRef, useEffect, useCallback } from 'react';
import { createPortal } from 'react-dom';
import { motion, AnimatePresence, PanInfo } from 'framer-motion';
import { Icons } from './Icons';
import { useIsMobile } from '../../hooks/useMediaQuery';

export interface SlidePanelProps {
  isOpen: boolean;
  onClose: () => void;
  title?: string;
  subtitle?: string;
  description?: string;
  /** 'sm' ~384px | 'md' ~448px | 'lg' ~512px | 'xl' ~640px | '2xl' ~672px | 'full' ~100% */
  width?: 'sm' | 'md' | 'lg' | 'xl' | '2xl' | 'full';
  /** Alias for width */
  size?: 'sm' | 'md' | 'lg' | 'xl' | '2xl' | 'full';
  /** Optional footer (action buttons, etc.) */
  footer?: React.ReactNode;
  /** Optional header-right element (extra buttons, badges) */
  headerRight?: React.ReactNode;
  children: React.ReactNode;
}

const widthClasses: Record<string, string> = {
  sm: 'max-w-sm',
  md: 'max-w-md',
  lg: 'max-w-lg',
  xl: 'max-w-xl',
  '2xl': 'max-w-2xl',
  full: 'max-w-full',
};

export const SlidePanel: React.FC<SlidePanelProps> = ({
  isOpen,
  onClose,
  title,
  subtitle,
  width = 'md',
  footer,
  headerRight,
  children,
}) => {
  const panelRef = useRef<HTMLDivElement>(null);
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

  const handleDragEnd = (_: any, info: PanInfo) => {
    if (info.offset.y > 100 || info.velocity.y > 500) {
      onClose();
    }
  };

  return createPortal(
    <AnimatePresence>
      {isOpen && (
        <div className="fixed inset-0 z-50 overflow-hidden">
          {/* Backdrop */}
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.3, ease: [0.16, 1, 0.3, 1] }}
            className="absolute inset-0 bg-zinc-900/20 dark:bg-black/40 backdrop-blur-sm"
            onClick={onClose}
          />

          {/* Panel */}
          <motion.div
            ref={panelRef}
            initial={isMobile ? { y: '100%' } : { x: '100%' }}
            animate={isMobile ? { y: 0 } : { x: 0 }}
            exit={isMobile ? { y: '100%' } : { x: '100%' }}
            transition={{
              duration: 0.4,
              ease: [0.16, 1, 0.3, 1],
            }}
            drag={isMobile ? 'y' : false}
            dragConstraints={{ top: 0 }}
            dragElastic={0.2}
            onDragEnd={isMobile ? handleDragEnd : undefined}
            className={
              isMobile
                ? 'absolute bottom-0 left-0 right-0 max-h-[92vh] bg-white dark:bg-zinc-900 rounded-t-3xl shadow-2xl flex flex-col'
                : `absolute top-0 right-0 bottom-0 w-screen ${widthClasses[width]} bg-white dark:bg-zinc-900 shadow-[-20px_0_40px_-5px_rgba(0,0,0,0.05)] dark:shadow-[-20px_0_40px_-5px_rgba(0,0,0,0.3)] border-l border-zinc-100 dark:border-zinc-800 flex flex-col`
            }
            style={isMobile ? { paddingBottom: 'env(safe-area-inset-bottom, 0px)' } : undefined}
          >
            {/* Mobile drag handle */}
            {isMobile && (
              <div className="flex justify-center pt-3 pb-1 shrink-0 cursor-grab active:cursor-grabbing touch-none">
                <div className="w-10 h-1 rounded-full bg-zinc-300 dark:bg-zinc-700" />
              </div>
            )}

            {/* Header */}
            {(title || headerRight) && (
              <div className={`flex items-center justify-between ${isMobile ? 'px-5 py-3' : 'px-6 py-5'} border-b border-zinc-100 dark:border-zinc-800/60 shrink-0`}>
                <div className="flex-1 min-w-0">
                  {title && (
                    <h2 className="text-base font-semibold text-zinc-900 dark:text-zinc-100 truncate">
                      {title}
                    </h2>
                  )}
                  {subtitle && (
                    <p className="text-xs text-zinc-500 dark:text-zinc-400 mt-0.5">
                      {subtitle}
                    </p>
                  )}
                </div>
                <div className="flex items-center gap-2 ml-4">
                  {headerRight}
                  <button
                    onClick={onClose}
                    className="p-1.5 rounded-lg hover:bg-zinc-100 dark:hover:bg-zinc-800 transition-colors text-zinc-400 hover:text-zinc-600 dark:hover:text-zinc-300"
                  >
                    <Icons.X size={18} />
                  </button>
                </div>
              </div>
            )}

            {/* Scrollable content */}
            <div className="flex-1 overflow-y-auto overscroll-contain min-h-0">
              <motion.div
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                transition={{ duration: 0.3, delay: 0.1, ease: 'easeOut' }}
              >
                {children}
              </motion.div>
            </div>

            {/* Footer */}
            {footer && (
              <div className={`${isMobile ? 'px-5 py-3' : 'px-6 py-4'} border-t border-zinc-100 dark:border-zinc-800/60 bg-white dark:bg-zinc-900 shrink-0`}>
                {footer}
              </div>
            )}
          </motion.div>
        </div>
      )}
    </AnimatePresence>,
    document.body
  );
};
