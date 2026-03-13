import React from 'react';
import { ImageUploader } from '../ImageUploader';
import { HeroImageBlock } from '../../../types/cms';

interface Props {
  block: HeroImageBlock;
  onChange: (block: HeroImageBlock) => void;
  onUpload: (file: File) => Promise<string | null>;
}

export const HeroImageBlockEditor: React.FC<Props> = ({ block, onChange, onUpload }) => (
  <div className="space-y-3">
    <ImageUploader
      value={block.image_url || null}
      onChange={(url) => onChange({ ...block, image_url: url || '' })}
      onUpload={onUpload}
      label="Hero Screenshot"
    />
    <div>
      <label className="text-[10px] font-mono uppercase tracking-widest text-[#78736A]">Alt text</label>
      <input
        type="text"
        value={block.alt || ''}
        onChange={(e) => onChange({ ...block, alt: e.target.value })}
        placeholder="Dashboard screenshot"
        className="mt-1 w-full px-3 py-2 rounded-lg border border-[#E6E2D8] bg-white text-sm text-[#09090B] focus:border-[#E8BC59] outline-none transition-colors"
      />
    </div>
  </div>
);
