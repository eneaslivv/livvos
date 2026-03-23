import React from 'react';
import { Plus, X } from 'lucide-react';
import { TagInput } from '../TagInput';
import { ChallengeBlock } from '../../../types/cms';
import { MiniEditor } from './MiniEditor';

interface Props {
  block: ChallengeBlock;
  onChange: (block: ChallengeBlock) => void;
}

export const ChallengeBlockEditor: React.FC<Props> = ({ block, onChange }) => {
  const addParagraph = () => onChange({ ...block, paragraphs: [...(block.paragraphs || []), ''] });
  const updateParagraph = (i: number, val: string) => {
    const p = [...(block.paragraphs || [])];
    p[i] = val;
    onChange({ ...block, paragraphs: p });
  };
  const removeParagraph = (i: number) => onChange({ ...block, paragraphs: (block.paragraphs || []).filter((_, idx) => idx !== i) });

  const addKpi = () => onChange({ ...block, kpis: [...(block.kpis || []), { text: '' }] });
  const updateKpi = (i: number, text: string) => {
    const k = [...(block.kpis || [])];
    k[i] = { text };
    onChange({ ...block, kpis: k });
  };
  const removeKpi = (i: number) => onChange({ ...block, kpis: (block.kpis || []).filter((_, idx) => idx !== i) });

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className="text-[10px] font-mono uppercase tracking-widest text-[#78736A]">Section label</label>
          <input
            type="text"
            value={block.label || ''}
            onChange={(e) => onChange({ ...block, label: e.target.value })}
            placeholder="The Challenge"
            className="mt-1 w-full px-3 py-2 rounded-lg border border-[#E6E2D8] bg-white text-sm text-[#09090B] focus:border-[#E8BC59] outline-none transition-colors"
          />
        </div>
        <div>
          <label className="text-[10px] font-mono uppercase tracking-widest text-[#78736A]">Heading</label>
          <input
            type="text"
            value={block.heading || ''}
            onChange={(e) => onChange({ ...block, heading: e.target.value })}
            placeholder="Defining the core problem..."
            className="mt-1 w-full px-3 py-2 rounded-lg border border-[#E6E2D8] bg-white text-sm text-[#09090B] focus:border-[#E8BC59] outline-none transition-colors"
          />
        </div>
      </div>

      {/* Paragraphs */}
      <div>
        <div className="flex items-center justify-between mb-2">
          <label className="text-[10px] font-mono uppercase tracking-widest text-[#78736A]">Paragraphs</label>
          <button onClick={addParagraph} className="flex items-center gap-1 text-[10px] font-medium text-[#E8BC59] hover:text-[#d4a94d]">
            <Plus size={12} /> Add
          </button>
        </div>
        <div className="space-y-2">
          {(block.paragraphs || []).map((p, i) => (
            <div key={i} className="flex gap-2">
              <div className="flex-1">
                <MiniEditor
                  value={p}
                  onChange={(val) => updateParagraph(i, val)}
                  placeholder={`Paragraph ${i + 1}`}
                  rows={5}
                />
              </div>
              <button onClick={() => removeParagraph(i)} className="text-[#09090B]/30 hover:text-red-500 self-start mt-2">
                <X size={14} />
              </button>
            </div>
          ))}
        </div>
      </div>

      {/* Tools */}
      <TagInput
        tags={block.tools || []}
        onChange={(tools) => onChange({ ...block, tools })}
        label="Tools used"
        placeholder="Add tool (e.g. Figma, Next.js)"
      />

      {/* KPIs */}
      <div>
        <div className="flex items-center justify-between mb-2">
          <label className="text-[10px] font-mono uppercase tracking-widest text-[#78736A]">KPIs</label>
          <button onClick={addKpi} className="flex items-center gap-1 text-[10px] font-medium text-[#E8BC59] hover:text-[#d4a94d]">
            <Plus size={12} /> Add
          </button>
        </div>
        <div className="space-y-2">
          {(block.kpis || []).map((kpi, i) => (
            <div key={i} className="flex gap-2">
              <input
                type="text"
                value={kpi.text}
                onChange={(e) => updateKpi(i, e.target.value)}
                placeholder="Increased conversion by 12%"
                className="flex-1 px-3 py-2 rounded-lg border border-[#E6E2D8] bg-white text-sm text-[#09090B] focus:border-[#E8BC59] outline-none transition-colors"
              />
              <button onClick={() => removeKpi(i)} className="text-[#09090B]/30 hover:text-red-500">
                <X size={14} />
              </button>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
};
