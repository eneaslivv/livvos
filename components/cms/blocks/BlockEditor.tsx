import React from 'react';
import { ChevronUp, ChevronDown, Trash2, Image, Target, Layout, Palette, Flag, Type, AlignLeft, Quote } from 'lucide-react';
import { ContentBlock } from '../../../types/cms';
import { HeroImageBlockEditor } from './HeroImageBlockEditor';
import { ChallengeBlockEditor } from './ChallengeBlockEditor';
import { ImageShowcaseBlockEditor } from './ImageShowcaseBlockEditor';
import { DesignSystemBlockEditor } from './DesignSystemBlockEditor';
import { BannerBlockEditor } from './BannerBlockEditor';
import { RichTextarea } from './RichTextarea';

interface Props {
  block: ContentBlock;
  onChange: (block: ContentBlock) => void;
  onDelete: () => void;
  onMoveUp: () => void;
  onMoveDown: () => void;
  onUpload: (file: File) => Promise<string | null>;
  isFirst: boolean;
  isLast: boolean;
}

const BLOCK_LABELS: Record<string, { label: string; icon: React.ReactNode; color: string }> = {
  heading:        { label: 'Heading',        icon: <Type size={12} />,    color: 'bg-blue-100 text-blue-700' },
  text:           { label: 'Text',           icon: <AlignLeft size={12} />, color: 'bg-zinc-100 text-zinc-700' },
  quote:          { label: 'Quote',          icon: <Quote size={12} />,   color: 'bg-purple-100 text-purple-700' },
  hero_image:     { label: 'Hero Image',     icon: <Image size={12} />,   color: 'bg-amber-100 text-amber-700' },
  challenge:      { label: 'Challenge',      icon: <Target size={12} />,  color: 'bg-red-100 text-red-700' },
  image_showcase: { label: 'Image Showcase', icon: <Layout size={12} />,  color: 'bg-green-100 text-green-700' },
  design_system:  { label: 'Design System',  icon: <Palette size={12} />, color: 'bg-indigo-100 text-indigo-700' },
  banner:         { label: 'Banner',         icon: <Flag size={12} />,    color: 'bg-orange-100 text-orange-700' },
};

export const BlockEditor: React.FC<Props> = ({ block, onChange, onDelete, onMoveUp, onMoveDown, onUpload, isFirst, isLast }) => {
  const meta = BLOCK_LABELS[block.type] || { label: block.type, icon: null, color: 'bg-zinc-100 text-zinc-600' };

  return (
    <div className="rounded-xl border border-[#E6E2D8] bg-white overflow-hidden">
      {/* Header */}
      <div className="flex items-center gap-2 px-3 py-2 bg-[#FAF8F3] border-b border-[#E6E2D8]">
        <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded text-[10px] font-semibold ${meta.color}`}>
          {meta.icon} {meta.label}
        </span>
        <div className="flex-1" />
        <button onClick={onMoveUp} disabled={isFirst} className="p-0.5 text-[#09090B]/30 hover:text-[#09090B] disabled:opacity-20">
          <ChevronUp size={14} />
        </button>
        <button onClick={onMoveDown} disabled={isLast} className="p-0.5 text-[#09090B]/30 hover:text-[#09090B] disabled:opacity-20">
          <ChevronDown size={14} />
        </button>
        <button onClick={onDelete} className="p-0.5 text-[#09090B]/30 hover:text-red-500">
          <Trash2 size={14} />
        </button>
      </div>

      {/* Body */}
      <div className="p-4">
        {block.type === 'heading' && (
          <input
            type="text"
            value={block.content}
            onChange={(e) => onChange({ ...block, content: e.target.value })}
            placeholder="Section heading"
            className="w-full px-3 py-2 rounded-lg border border-[#E6E2D8] bg-white text-sm font-semibold text-[#09090B] focus:border-[#E8BC59] outline-none transition-colors"
          />
        )}
        {block.type === 'text' && (
          <RichTextarea
            value={block.content}
            onChange={(content) => onChange({ ...block, content })}
            placeholder="Paragraph text..."
            rows={6}
          />
        )}
        {block.type === 'quote' && (
          <RichTextarea
            value={block.content}
            onChange={(content) => onChange({ ...block, content })}
            placeholder="Quote text..."
            rows={4}
            className="italic"
          />
        )}
        {block.type === 'hero_image' && (
          <HeroImageBlockEditor block={block} onChange={onChange as any} onUpload={onUpload} />
        )}
        {block.type === 'challenge' && (
          <ChallengeBlockEditor block={block} onChange={onChange as any} />
        )}
        {block.type === 'image_showcase' && (
          <ImageShowcaseBlockEditor block={block} onChange={onChange as any} onUpload={onUpload} />
        )}
        {block.type === 'design_system' && (
          <DesignSystemBlockEditor block={block} onChange={onChange as any} />
        )}
        {block.type === 'banner' && (
          <BannerBlockEditor block={block} onChange={onChange as any} />
        )}
      </div>
    </div>
  );
};

// Default values for new blocks
export const createDefaultBlock = (type: ContentBlock['type'], sortOrder: number): ContentBlock => {
  const base = { sort_order: sortOrder };
  switch (type) {
    case 'heading': return { ...base, type: 'heading', content: '' };
    case 'text': return { ...base, type: 'text', content: '' };
    case 'quote': return { ...base, type: 'quote', content: '' };
    case 'hero_image': return { ...base, type: 'hero_image', image_url: '' };
    case 'challenge': return { ...base, type: 'challenge', label: 'The Challenge', heading: '', paragraphs: [''], tools: [], kpis: [] };
    case 'image_showcase': return { ...base, type: 'image_showcase', layout: 'single', images: [] };
    case 'design_system': return { ...base, type: 'design_system', label: 'Design Language', heading: 'System & Assets', colors: [] };
    case 'banner': return { ...base, type: 'banner', heading: '' };
  }
};
