import React, { useRef, useEffect, useCallback } from 'react';
import { Icons } from './Icons';

interface SlidePanelProps {
  isOpen: boolean;
  onClose: () => void;
  title?: string;
  subtitle?: string;
  /** 'sm' ~384px | 'md' ~448px | 'lg' ~512px | 'xl' ~640px | 'full' ~100% */
  width?: 'sm' | 'md' | 'lg' | 'xl' | 'full';
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
  full: 'max-w-2xl',
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

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 overflow-hidden">
      {/* Backdrop */}
      <div
        className="absolute inset-0 bg-black/30 backdrop-blur-[2px] transition-opacity duration-200"
        onClick={onClose}
      />

      {/* Panel */}
      <div className="absolute inset-y-0 right-0 flex">
        <div
          ref={panelRef}
          className={`relative w-screen ${widthClasses[width]} bg-white dark:bg-zinc-900 shadow-2xl flex flex-col transform transition-transform duration-200 ease-out translate-x-0`}
        >
          {/* Header */}
          {(title || headerRight) && (
            <div className="flex items-center justify-between px-5 py-4 border-b border-zinc-100 dark:border-zinc-800 shrink-0">
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
              <div className="flex items-center gap-2 ml-3">
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
          <div className="flex-1 overflow-y-auto">
            {children}
          </div>

          {/* Footer */}
          {footer && (
            <div className="px-5 py-3 border-t border-zinc-100 dark:border-zinc-800 bg-zinc-50/50 dark:bg-zinc-900 shrink-0">
              {footer}
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
