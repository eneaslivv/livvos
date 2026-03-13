import React from 'react';
import { Plus, X } from 'lucide-react';
import { DesignSystemBlock } from '../../../types/cms';

interface Props {
  block: DesignSystemBlock;
  onChange: (block: DesignSystemBlock) => void;
}

export const DesignSystemBlockEditor: React.FC<Props> = ({ block, onChange }) => {
  const colors = block.colors || [];
  const weights = block.typeface?.weights || [];

  const addColor = () => onChange({ ...block, colors: [...colors, { name: '', hex: '#000000' }] });
  const updateColor = (i: number, patch: Partial<{ name: string; hex: string }>) => {
    const c = [...colors];
    c[i] = { ...c[i], ...patch };
    onChange({ ...block, colors: c });
  };
  const removeColor = (i: number) => onChange({ ...block, colors: colors.filter((_, idx) => idx !== i) });

  const addWeight = () => {
    const tf = block.typeface || { name: '', weights: [] };
    onChange({ ...block, typeface: { ...tf, weights: [...tf.weights, { value: '', label: '' }] } });
  };
  const updateWeight = (i: number, patch: Partial<{ value: string; label: string }>) => {
    const tf = block.typeface || { name: '', weights: [] };
    const w = [...tf.weights];
    w[i] = { ...w[i], ...patch };
    onChange({ ...block, typeface: { ...tf, weights: w } });
  };
  const removeWeight = (i: number) => {
    const tf = block.typeface || { name: '', weights: [] };
    onChange({ ...block, typeface: { ...tf, weights: tf.weights.filter((_, idx) => idx !== i) } });
  };

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className="text-[10px] font-mono uppercase tracking-widest text-[#78736A]">Section label</label>
          <input
            type="text"
            value={block.label || ''}
            onChange={(e) => onChange({ ...block, label: e.target.value })}
            placeholder="Design Language"
            className="mt-1 w-full px-3 py-2 rounded-lg border border-[#E6E2D8] bg-white text-sm text-[#09090B] focus:border-[#E8BC59] outline-none transition-colors"
          />
        </div>
        <div>
          <label className="text-[10px] font-mono uppercase tracking-widest text-[#78736A]">Heading</label>
          <input
            type="text"
            value={block.heading || ''}
            onChange={(e) => onChange({ ...block, heading: e.target.value })}
            placeholder="System & Assets"
            className="mt-1 w-full px-3 py-2 rounded-lg border border-[#E6E2D8] bg-white text-sm text-[#09090B] focus:border-[#E8BC59] outline-none transition-colors"
          />
        </div>
      </div>

      <div>
        <label className="text-[10px] font-mono uppercase tracking-widest text-[#78736A]">Description</label>
        <textarea
          value={block.description || ''}
          onChange={(e) => onChange({ ...block, description: e.target.value })}
          placeholder="A comprehensive set of foundational elements..."
          rows={2}
          className="mt-1 w-full px-3 py-2 rounded-lg border border-[#E6E2D8] bg-white text-sm text-[#09090B] focus:border-[#E8BC59] outline-none transition-colors resize-none"
        />
      </div>

      {/* Typeface */}
      <div className="p-3 rounded-lg border border-[#E6E2D8] bg-[#FAF8F3]/50 space-y-3">
        <label className="text-[10px] font-mono uppercase tracking-widest text-[#78736A]">Typeface</label>
        <input
          type="text"
          value={block.typeface?.name || ''}
          onChange={(e) => onChange({ ...block, typeface: { ...(block.typeface || { name: '', weights: [] }), name: e.target.value } })}
          placeholder="Inter Display"
          className="w-full px-3 py-2 rounded-lg border border-[#E6E2D8] bg-white text-sm text-[#09090B] focus:border-[#E8BC59] outline-none transition-colors"
        />
        <div className="flex items-center justify-between">
          <span className="text-[10px] font-mono text-[#78736A]">Weights</span>
          <button onClick={addWeight} className="flex items-center gap-1 text-[10px] font-medium text-[#E8BC59] hover:text-[#d4a94d]">
            <Plus size={12} /> Add
          </button>
        </div>
        <div className="grid grid-cols-3 gap-2">
          {weights.map((w, i) => (
            <div key={i} className="flex items-center gap-1">
              <input
                type="text"
                value={w.value}
                onChange={(e) => updateWeight(i, { value: e.target.value })}
                placeholder="400"
                className="w-12 px-2 py-1 rounded border border-[#E6E2D8] bg-white text-xs text-[#09090B] font-mono focus:border-[#E8BC59] outline-none"
              />
              <input
                type="text"
                value={w.label}
                onChange={(e) => updateWeight(i, { label: e.target.value })}
                placeholder="Regular"
                className="flex-1 px-2 py-1 rounded border border-[#E6E2D8] bg-white text-xs text-[#09090B] focus:border-[#E8BC59] outline-none"
              />
              <button onClick={() => removeWeight(i)} className="text-[#09090B]/30 hover:text-red-500">
                <X size={12} />
              </button>
            </div>
          ))}
        </div>
      </div>

      {/* Colors */}
      <div>
        <div className="flex items-center justify-between mb-2">
          <label className="text-[10px] font-mono uppercase tracking-widest text-[#78736A]">Color palette</label>
          <button onClick={addColor} className="flex items-center gap-1 text-[10px] font-medium text-[#E8BC59] hover:text-[#d4a94d]">
            <Plus size={12} /> Add
          </button>
        </div>
        <div className="grid grid-cols-2 gap-2">
          {colors.map((c, i) => (
            <div key={i} className="flex items-center gap-2 p-2 rounded-lg border border-[#E6E2D8] bg-white">
              <input
                type="color"
                value={c.hex}
                onChange={(e) => updateColor(i, { hex: e.target.value })}
                className="w-7 h-7 rounded border border-[#E6E2D8] cursor-pointer shrink-0"
              />
              <div className="flex-1 min-w-0">
                <input
                  type="text"
                  value={c.name}
                  onChange={(e) => updateColor(i, { name: e.target.value })}
                  placeholder="Color name"
                  className="w-full text-xs text-[#09090B] outline-none"
                />
                <span className="text-[10px] font-mono text-[#78736A]">{c.hex}</span>
              </div>
              <button onClick={() => removeColor(i)} className="text-[#09090B]/30 hover:text-red-500 shrink-0">
                <X size={12} />
              </button>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
};
