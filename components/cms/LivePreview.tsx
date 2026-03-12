import React, { useState } from 'react';
import { RefreshCw, ExternalLink, Globe } from 'lucide-react';
import type { CmsSection } from '../../types/cms';

interface LivePreviewProps {
  websiteUrl?: string | null;
  section: CmsSection;
  refreshKey: number;
}

export const LivePreview: React.FC<LivePreviewProps> = ({
  websiteUrl,
  section,
  refreshKey,
}) => {
  const [localKey, setLocalKey] = useState(0);

  if (!websiteUrl) {
    return (
      <div className="flex flex-col items-center justify-center h-full bg-[#F5F3EE] rounded-xl border border-[#E6E2D8]">
        <Globe size={32} className="text-[#09090B]/15 mb-3" />
        <p className="text-sm font-medium text-[#09090B]/40">
          No website connected
        </p>
        <p className="text-xs text-[#09090B]/25 mt-1 max-w-[200px] text-center">
          Set your website URL in Tenant Settings to enable live preview
        </p>
      </div>
    );
  }

  const separator = websiteUrl.includes('?') ? '&' : '?';
  const src = `${websiteUrl}${separator}preview=true&section=${section}`;

  return (
    <div className="flex flex-col h-full rounded-xl border border-[#E6E2D8] overflow-hidden bg-white">
      {/* Toolbar */}
      <div className="flex items-center justify-between px-3 py-2 border-b border-[#E6E2D8] bg-[#FDFBF7]">
        <div className="flex items-center gap-2">
          <div className="flex gap-1">
            <div className="w-2.5 h-2.5 rounded-full bg-red-400/60" />
            <div className="w-2.5 h-2.5 rounded-full bg-yellow-400/60" />
            <div className="w-2.5 h-2.5 rounded-full bg-green-400/60" />
          </div>
          <span className="text-[10px] text-[#09090B]/30 ml-2 truncate max-w-[200px]">
            {websiteUrl}
          </span>
        </div>
        <div className="flex items-center gap-1">
          <button
            onClick={() => setLocalKey((k) => k + 1)}
            className="p-1.5 rounded-md hover:bg-[#09090B]/5 transition-colors"
            title="Refresh preview"
          >
            <RefreshCw size={12} className="text-[#09090B]/40" />
          </button>
          <a
            href={src}
            target="_blank"
            rel="noopener noreferrer"
            className="p-1.5 rounded-md hover:bg-[#09090B]/5 transition-colors"
            title="Open in new tab"
          >
            <ExternalLink size={12} className="text-[#09090B]/40" />
          </a>
        </div>
      </div>

      {/* iframe */}
      <div className="flex-1 relative">
        <iframe
          key={`${refreshKey}-${localKey}`}
          src={src}
          className="w-full h-full border-0"
          title="Website Preview"
          sandbox="allow-scripts allow-same-origin"
        />
      </div>
    </div>
  );
};
