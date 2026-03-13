import React, { useState, useEffect } from 'react';
import { RefreshCw, ExternalLink, Globe, Eye, Radio, Clock } from 'lucide-react';
import type { CmsSection } from '../../types/cms';

type PreviewMode = 'preview' | 'live';

interface LivePreviewProps {
  websiteUrl?: string | null;
  previewUrl?: string | null;
  section: CmsSection;
  refreshKey: number;
}

export const LivePreview: React.FC<LivePreviewProps> = ({
  websiteUrl,
  previewUrl,
  section,
  refreshKey,
}) => {
  const [localKey, setLocalKey] = useState(0);
  const [mode, setMode] = useState<PreviewMode>(previewUrl ? 'preview' : 'live');
  const [lastRefresh, setLastRefresh] = useState<Date>(new Date());
  const [showUpdated, setShowUpdated] = useState(false);
  const initialRef = React.useRef(true);

  // Track refresh timestamps + show "Updated!" flash
  useEffect(() => {
    setLastRefresh(new Date());
    // Don't flash on initial mount
    if (initialRef.current) {
      initialRef.current = false;
      return;
    }
    setShowUpdated(true);
    const timer = setTimeout(() => setShowUpdated(false), 2000);
    return () => clearTimeout(timer);
  }, [refreshKey]);

  const hasAnyUrl = websiteUrl || previewUrl;

  if (!hasAnyUrl) {
    return (
      <div className="flex flex-col items-center justify-center h-full bg-[#F5F3EE] rounded-xl border border-[#E6E2D8]">
        <Globe size={32} className="text-[#09090B]/15 mb-3" />
        <p className="text-sm font-medium text-[#09090B]/40">
          No website connected
        </p>
        <p className="text-xs text-[#09090B]/25 mt-1 max-w-[220px] text-center leading-relaxed">
          Set your website URL and preview URL in Tenant Settings to enable live preview
        </p>
      </div>
    );
  }

  const baseUrl = mode === 'preview' && previewUrl ? previewUrl : websiteUrl;
  if (!baseUrl) {
    // Fallback: if current mode has no URL, show message
    return (
      <div className="flex flex-col items-center justify-center h-full bg-[#F5F3EE] rounded-xl border border-[#E6E2D8]">
        <Globe size={32} className="text-[#09090B]/15 mb-3" />
        <p className="text-sm font-medium text-[#09090B]/40">
          {mode === 'preview' ? 'No preview URL configured' : 'No website URL configured'}
        </p>
        <p className="text-xs text-[#09090B]/25 mt-1 max-w-[200px] text-center">
          {mode === 'preview'
            ? 'Add your Vercel/staging URL in Tenant Settings'
            : 'Add your live domain in Tenant Settings'}
        </p>
      </div>
    );
  }

  const separator = baseUrl.includes('?') ? '&' : '?';
  const previewParam = mode === 'preview' ? 'preview=true&' : '';
  const src = `${baseUrl}${separator}${previewParam}section=${section}`;

  const formatTime = (date: Date) => {
    return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' });
  };

  return (
    <div className="flex flex-col h-full rounded-xl border border-[#E6E2D8] overflow-hidden bg-white">
      {/* Mode toggle */}
      <div className="flex items-center justify-between px-3 py-2 border-b border-[#E6E2D8] bg-[#09090B]">
        <div className="flex items-center gap-1 bg-[#09090B] rounded-lg p-0.5">
          {previewUrl && (
            <button
              onClick={() => setMode('preview')}
              className={`flex items-center gap-1.5 px-2.5 py-1 rounded-md text-[10px] font-medium transition-all ${
                mode === 'preview'
                  ? 'bg-[#E8BC59]/20 text-[#E8BC59]'
                  : 'text-white/40 hover:text-white/60'
              }`}
            >
              <Eye size={10} />
              Preview
            </button>
          )}
          {websiteUrl && (
            <button
              onClick={() => setMode('live')}
              className={`flex items-center gap-1.5 px-2.5 py-1 rounded-md text-[10px] font-medium transition-all ${
                mode === 'live'
                  ? 'bg-green-500/20 text-green-400'
                  : 'text-white/40 hover:text-white/60'
              }`}
            >
              <Radio size={10} />
              Live
            </button>
          )}
        </div>

        {mode === 'preview' && (
          <span className="text-[9px] font-mono text-[#E8BC59]/50 uppercase tracking-widest">
            Draft + Published
          </span>
        )}
        {mode === 'live' && (
          <span className="text-[9px] font-mono text-green-400/50 uppercase tracking-widest">
            Published only
          </span>
        )}
      </div>

      {/* URL bar + actions */}
      <div className="flex items-center justify-between px-3 py-1.5 border-b border-[#E6E2D8] bg-[#FDFBF7]">
        <div className="flex items-center gap-2 min-w-0">
          <div className="flex gap-1 shrink-0">
            <div className="w-2 h-2 rounded-full bg-red-400/60" />
            <div className="w-2 h-2 rounded-full bg-yellow-400/60" />
            <div className="w-2 h-2 rounded-full bg-green-400/60" />
          </div>
          <span className="text-[9px] text-[#09090B]/30 ml-1 truncate font-mono">
            {baseUrl}
          </span>
        </div>
        <div className="flex items-center gap-0.5 shrink-0">
          <button
            onClick={() => {
              setLocalKey((k) => k + 1);
              setLastRefresh(new Date());
            }}
            className="p-1 rounded-md hover:bg-[#09090B]/5 transition-colors"
            title="Refresh preview"
          >
            <RefreshCw size={11} className="text-[#09090B]/40" />
          </button>
          <a
            href={src}
            target="_blank"
            rel="noopener noreferrer"
            className="p-1 rounded-md hover:bg-[#09090B]/5 transition-colors"
            title="Open in new tab"
          >
            <ExternalLink size={11} className="text-[#09090B]/40" />
          </a>
        </div>
      </div>

      {/* iframe */}
      <div className="flex-1 relative">
        {mode === 'preview' && (
          <div className="absolute top-2 left-2 z-10 flex items-center gap-1.5 px-2 py-1 bg-[#E8BC59]/90 rounded-md shadow-sm">
            <Eye size={10} className="text-[#09090B]" />
            <span className="text-[9px] font-semibold text-[#09090B] uppercase tracking-wide">Preview</span>
          </div>
        )}
        {showUpdated && (
          <div className="absolute inset-0 z-20 flex items-center justify-center pointer-events-none animate-pulse">
            <div className="px-4 py-2 bg-green-500/90 text-white rounded-lg shadow-lg flex items-center gap-2 text-sm font-semibold">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"><polyline points="20 6 9 17 4 12" /></svg>
              Updated!
            </div>
          </div>
        )}
        <iframe
          key={`${mode}-${refreshKey}-${localKey}`}
          src={src}
          className="w-full h-full border-0"
          title={mode === 'preview' ? 'Website Preview (includes drafts)' : 'Live Website'}
          sandbox="allow-scripts allow-same-origin"
        />
      </div>

      {/* Footer with last refresh time */}
      <div className="flex items-center justify-between px-3 py-1.5 border-t border-[#E6E2D8] bg-[#FDFBF7]">
        <div className="flex items-center gap-1.5">
          <Clock size={9} className="text-[#09090B]/25" />
          <span className="text-[9px] text-[#09090B]/30 font-mono">
            Last refresh: {formatTime(lastRefresh)}
          </span>
        </div>
        <div className="flex items-center gap-1.5">
          <div className={`w-1.5 h-1.5 rounded-full ${mode === 'preview' ? 'bg-[#E8BC59]' : 'bg-green-400'} animate-pulse`} />
          <span className="text-[9px] text-[#09090B]/30">
            {mode === 'preview' ? 'Staging' : 'Production'}
          </span>
        </div>
      </div>
    </div>
  );
};
