import React from 'react';
import { Plus, X } from 'lucide-react';
import { ImageUploader } from '../ImageUploader';
import { ImageShowcaseBlock } from '../../../types/cms';

interface Props {
  block: ImageShowcaseBlock;
  onChange: (block: ImageShowcaseBlock) => void;
  onUpload: (file: File) => Promise<string | null>;
}

const LAYOUTS: { value: ImageShowcaseBlock['layout']; label: string }[] = [
  { value: 'single', label: 'Single image' },
  { value: 'side_by_side', label: 'Side by side' },
  { value: 'wireframe', label: 'Wireframe' },
];

export const ImageShowcaseBlockEditor: React.FC<Props> = ({ block, onChange, onUpload }) => {
  const images = block.images || [];

  const addImage = () => onChange({ ...block, images: [...images, { url: '', alt: '' }] });

  const updateImage = (i: number, patch: Partial<(typeof images)[0]>) => {
    const imgs = [...images];
    imgs[i] = { ...imgs[i], ...patch };
    onChange({ ...block, images: imgs });
  };

  const removeImage = (i: number) => onChange({ ...block, images: images.filter((_, idx) => idx !== i) });

  return (
    <div className="space-y-3">
      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className="text-[10px] font-mono uppercase tracking-widest text-[#78736A]">Label</label>
          <input
            type="text"
            value={block.label || ''}
            onChange={(e) => onChange({ ...block, label: e.target.value })}
            placeholder="High fidelity interface"
            className="mt-1 w-full px-3 py-2 rounded-lg border border-[#E6E2D8] bg-white text-sm text-[#09090B] focus:border-[#E8BC59] outline-none transition-colors"
          />
        </div>
        <div>
          <label className="text-[10px] font-mono uppercase tracking-widest text-[#78736A]">Layout</label>
          <select
            value={block.layout}
            onChange={(e) => onChange({ ...block, layout: e.target.value as ImageShowcaseBlock['layout'] })}
            className="mt-1 w-full px-3 py-2 rounded-lg border border-[#E6E2D8] bg-white text-sm text-[#09090B] focus:border-[#E8BC59] outline-none transition-colors"
          >
            {LAYOUTS.map((l) => (
              <option key={l.value} value={l.value}>{l.label}</option>
            ))}
          </select>
        </div>
      </div>

      <div className="flex items-center justify-between">
        <label className="text-[10px] font-mono uppercase tracking-widest text-[#78736A]">Images</label>
        <button onClick={addImage} className="flex items-center gap-1 text-[10px] font-medium text-[#E8BC59] hover:text-[#d4a94d]">
          <Plus size={12} /> Add image
        </button>
      </div>

      <div className="space-y-3">
        {images.map((img, i) => (
          <div key={i} className="p-3 rounded-lg border border-[#E6E2D8] bg-[#FAF8F3]/50 space-y-2">
            <div className="flex items-center justify-between">
              <span className="text-[10px] font-mono text-[#78736A]">Image {i + 1}</span>
              <button onClick={() => removeImage(i)} className="text-[#09090B]/30 hover:text-red-500">
                <X size={14} />
              </button>
            </div>
            <ImageUploader
              value={img.url || null}
              onChange={(url) => updateImage(i, { url: url || '' })}
              onUpload={onUpload}
              label=""
            />
            <div className="grid grid-cols-2 gap-2">
              <input
                type="text"
                value={img.alt || ''}
                onChange={(e) => updateImage(i, { alt: e.target.value })}
                placeholder="Alt text"
                className="px-3 py-1.5 rounded-lg border border-[#E6E2D8] bg-white text-xs text-[#09090B] focus:border-[#E8BC59] outline-none transition-colors"
              />
              {block.layout === 'side_by_side' && (
                <select
                  value={img.theme || ''}
                  onChange={(e) => updateImage(i, { theme: (e.target.value || undefined) as 'light' | 'dark' | undefined })}
                  className="px-3 py-1.5 rounded-lg border border-[#E6E2D8] bg-white text-xs text-[#09090B] focus:border-[#E8BC59] outline-none transition-colors"
                >
                  <option value="">No theme</option>
                  <option value="light">Light mode</option>
                  <option value="dark">Dark mode</option>
                </select>
              )}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
};
