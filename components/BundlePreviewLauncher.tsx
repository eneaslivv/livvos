import React from 'react';
import { Icons } from './ui/Icons';
import type { PageView } from '../types';

/**
 * Floating "Preview new design" launcher.
 *
 * Fixed at bottom-right of the screen, always visible regardless of
 * current page or mode (except when already inside the bundle preview).
 * Pulses gently to draw attention while the user gets used to it.
 *
 * Click → navigates to bundle_preview, the static iframe workspace
 * that hosts every screen from the livv-update design bundle (Strategy /
 * Content / Scaling / Growth / Toolkit / Agent / Partners + all modals
 * and wizards).
 */
interface BundlePreviewLauncherProps {
  currentPage: PageView;
  onNavigate: (page: PageView) => void;
}

export const BundlePreviewLauncher: React.FC<BundlePreviewLauncherProps> = ({
  currentPage,
  onNavigate,
}) => {
  // Don't show if already inside the preview
  if (currentPage === 'bundle_preview') return null;

  return (
    <button
      onClick={() => onNavigate('bundle_preview')}
      className="
        fixed bottom-4 right-4 z-40
        inline-flex items-center gap-2
        px-4 py-2.5
        bg-gradient-to-br from-amber-400 via-amber-500 to-rose-600
        text-white
        rounded-full
        shadow-lg shadow-amber-500/40
        hover:shadow-xl hover:shadow-amber-500/50
        hover:scale-[1.04]
        active:scale-[0.97]
        transition-all duration-200
        font-semibold text-[12.5px]
        ring-2 ring-white/40 dark:ring-zinc-900/40
        animate-bundle-pulse
      "
      title="Open the Bundle Preview — every screen from the new design bundle"
    >
      <Icons.Sparkles size={14} className="drop-shadow" />
      <span>Preview new design</span>
      <span
        className="
          inline-flex items-center justify-center
          ml-1 px-1.5 py-0.5 rounded
          bg-white/20 text-[10px] font-mono uppercase tracking-wider
        "
      >
        NEW
      </span>
      <style>{`
        @keyframes bundle-pulse {
          0%, 100% { box-shadow: 0 10px 30px -8px rgba(196,163,90,0.5), 0 0 0 0 rgba(232,188,89,0.4); }
          50%      { box-shadow: 0 10px 30px -8px rgba(196,163,90,0.5), 0 0 0 14px rgba(232,188,89,0); }
        }
        .animate-bundle-pulse {
          animation: bundle-pulse 2.4s ease-in-out infinite;
        }
      `}</style>
    </button>
  );
};
