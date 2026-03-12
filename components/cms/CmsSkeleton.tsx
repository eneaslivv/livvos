import React from 'react';

const Pulse: React.FC<{ className?: string }> = ({ className = '' }) => (
  <div className={`animate-pulse bg-[#E6E2D8]/50 rounded ${className}`} />
);

export const GridSkeleton: React.FC<{ count?: number }> = ({ count = 6 }) => (
  <div className="p-6 grid grid-cols-2 xl:grid-cols-3 gap-3">
    {Array.from({ length: count }).map((_, i) => (
      <div key={i} className="border border-[#E6E2D8] rounded-xl overflow-hidden">
        <Pulse className="h-28 rounded-none" />
        <div className="p-3 space-y-2">
          <Pulse className="h-4 w-3/4" />
          <div className="flex items-center gap-2">
            <Pulse className="h-3 w-16" />
            <Pulse className="h-3 w-10" />
          </div>
        </div>
      </div>
    ))}
  </div>
);

export const ListSkeleton: React.FC<{ count?: number }> = ({ count = 5 }) => (
  <div className="p-6 space-y-2">
    {Array.from({ length: count }).map((_, i) => (
      <div key={i} className="flex items-center gap-3 p-3 border border-[#E6E2D8] rounded-xl">
        <Pulse className="w-10 h-10 rounded-lg shrink-0" />
        <div className="flex-1 space-y-1.5">
          <Pulse className="h-4 w-1/3" />
          <Pulse className="h-3 w-1/5" />
        </div>
        <Pulse className="h-5 w-12 rounded-full" />
      </div>
    ))}
  </div>
);

export const LogoGridSkeleton: React.FC<{ count?: number }> = ({ count = 8 }) => (
  <div className="p-6 grid grid-cols-3 sm:grid-cols-4 xl:grid-cols-5 gap-3">
    {Array.from({ length: count }).map((_, i) => (
      <div key={i} className="border border-[#E6E2D8] rounded-xl overflow-hidden">
        <Pulse className="aspect-square rounded-none" />
        <div className="px-2.5 py-2 border-t border-[#E6E2D8]">
          <Pulse className="h-3 w-2/3" />
        </div>
      </div>
    ))}
  </div>
);

export const EmptyState: React.FC<{
  title: string;
  description: string;
  actionLabel: string;
  onAction: () => void;
}> = ({ title, description, actionLabel, onAction }) => (
  <div className="flex flex-col items-center justify-center py-20 px-6">
    <div className="w-16 h-16 rounded-2xl bg-[#E6E2D8]/30 flex items-center justify-center mb-4">
      <div className="w-8 h-8 rounded-lg bg-[#E6E2D8]/50" />
    </div>
    <h3 className="text-sm font-semibold text-[#09090B] tracking-tight">{title}</h3>
    <p className="text-xs text-[#78736A] mt-1 max-w-[240px] text-center">{description}</p>
    <button
      onClick={onAction}
      className="mt-4 flex items-center gap-2 px-5 py-2.5 bg-[#09090B] text-white text-xs font-medium rounded-full hover:bg-[#09090B]/90 transition-colors"
    >
      <span className="w-5 h-5 rounded-full bg-[#E8BC59] flex items-center justify-center text-[#09090B] text-[10px] font-bold">+</span>
      {actionLabel}
    </button>
  </div>
);
