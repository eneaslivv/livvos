import React from 'react';
import { BannerBlock } from '../../../types/cms';

interface Props {
  block: BannerBlock;
  onChange: (block: BannerBlock) => void;
}

export const BannerBlockEditor: React.FC<Props> = ({ block, onChange }) => (
  <div className="space-y-3">
    <div>
      <label className="text-[10px] font-mono uppercase tracking-widest text-[#78736A]">Heading</label>
      <div className="mt-1">
        <textarea
          value={block.heading || ''}
          onChange={(e) => onChange({ ...block, heading: e.target.value })}
          placeholder="Redefine wellness with exclusive specials"
          rows={4}
          className="w-full px-3 py-2.5 rounded-lg border border-[#E6E2D8] bg-white text-sm text-[#09090B] focus:border-[#E8BC59] outline-none transition-colors resize-vertical min-h-[80px]"
        />
      </div>
    </div>
    <div>
      <label className="text-[10px] font-mono uppercase tracking-widest text-[#78736A]">Subtext (faded)</label>
      <input
        type="text"
        value={block.subtext || ''}
        onChange={(e) => onChange({ ...block, subtext: e.target.value })}
        placeholder="Optional secondary text"
        className="mt-1 w-full px-3 py-2 rounded-lg border border-[#E6E2D8] bg-white text-sm text-[#09090B] focus:border-[#E8BC59] outline-none transition-colors"
      />
    </div>
    <div>
      <label className="text-[10px] font-mono uppercase tracking-widest text-[#78736A]">Background color</label>
      <div className="flex items-center gap-2 mt-1">
        <input
          type="color"
          value={block.background_color || '#2A1818'}
          onChange={(e) => onChange({ ...block, background_color: e.target.value })}
          className="w-8 h-8 rounded border border-[#E6E2D8] cursor-pointer"
        />
        <input
          type="text"
          value={block.background_color || '#2A1818'}
          onChange={(e) => onChange({ ...block, background_color: e.target.value })}
          className="flex-1 px-3 py-2 rounded-lg border border-[#E6E2D8] bg-white text-sm text-[#09090B] font-mono focus:border-[#E8BC59] outline-none transition-colors"
        />
      </div>
    </div>
  </div>
);
