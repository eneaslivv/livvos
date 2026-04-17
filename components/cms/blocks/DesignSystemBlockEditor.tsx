import React, { useRef, useState } from 'react';
import { Plus, X, Upload, Type as TypeIcon } from 'lucide-react';
import { DesignSystemBlock } from '../../../types/cms';

interface Props {
  block: DesignSystemBlock;
  onChange: (block: DesignSystemBlock) => void;
  onUpload?: (file: File) => Promise<string | null>;
}

const WEIGHT_OPTIONS = ['100', '200', '300', '400', '500', '600', '700', '800', '900'];
const FONT_ACCEPT = '.woff2,.woff,.ttf,.otf,font/woff2,font/woff,font/ttf,font/otf,application/font-woff2,application/font-woff,application/x-font-ttf,application/x-font-otf';

const detectFontFormat = (url: string, filename?: string): string => {
  const src = (filename || url).toLowerCase();
  if (src.endsWith('.woff2')) return 'woff2';
  if (src.endsWith('.woff')) return 'woff';
  if (src.endsWith('.ttf')) return 'truetype';
  if (src.endsWith('.otf')) return 'opentype';
  return 'woff2';
};

export const DesignSystemBlockEditor: React.FC<Props> = ({ block, onChange, onUpload }) => {
  const colors = block.colors || [];
  const weights = block.typeface?.weights || [];
  const sources = block.typeface?.sources || [];
  const assets = block.assets || [];
  const fontInputRef = useRef<HTMLInputElement>(null);
  const assetInputRef = useRef<HTMLInputElement>(null);
  const [uploadingFont, setUploadingFont] = useState(false);
  const [uploadingAsset, setUploadingAsset] = useState(false);

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

  const updateSource = (i: number, patch: Partial<{ url: string; weight: string; style: 'normal' | 'italic'; format: string }>) => {
    const tf = block.typeface || { name: '', weights: [] };
    const next = [...sources];
    next[i] = { ...next[i], ...patch };
    onChange({ ...block, typeface: { ...tf, sources: next } });
  };
  const removeSource = (i: number) => {
    const tf = block.typeface || { name: '', weights: [] };
    onChange({ ...block, typeface: { ...tf, sources: sources.filter((_, idx) => idx !== i) } });
  };

  const handleFontUpload = async (files: FileList | null) => {
    if (!files || !onUpload) return;
    setUploadingFont(true);
    try {
      for (const file of Array.from(files)) {
        const url = await onUpload(file);
        if (!url) continue;
        const format = detectFontFormat(url, file.name);
        const tf = block.typeface || { name: '', weights: [] };
        const nextSources = [...(tf.sources || []), { url, weight: '400', style: 'normal' as const, format }];
        onChange({ ...block, typeface: { ...tf, sources: nextSources } });
      }
    } finally {
      setUploadingFont(false);
      if (fontInputRef.current) fontInputRef.current.value = '';
    }
  };

  const updateAsset = (i: number, patch: Partial<{ url: string; name: string; kind: 'logo' | 'icon' | 'image' }>) => {
    const next = [...assets];
    next[i] = { ...next[i], ...patch };
    onChange({ ...block, assets: next });
  };
  const removeAsset = (i: number) => onChange({ ...block, assets: assets.filter((_, idx) => idx !== i) });

  const handleAssetUpload = async (files: FileList | null) => {
    if (!files || !onUpload) return;
    setUploadingAsset(true);
    try {
      const next = [...assets];
      for (const file of Array.from(files)) {
        if (!file.type.startsWith('image/')) continue;
        const url = await onUpload(file);
        if (!url) continue;
        const baseName = file.name.replace(/\.[^.]+$/, '');
        next.push({ url, name: baseName, kind: 'logo' });
      }
      onChange({ ...block, assets: next });
    } finally {
      setUploadingAsset(false);
      if (assetInputRef.current) assetInputRef.current.value = '';
    }
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

        {/* Font files */}
        {onUpload && (
          <div className="pt-3 mt-1 border-t border-[#E6E2D8]/70 space-y-2">
            <div className="flex items-center justify-between">
              <span className="text-[10px] font-mono text-[#78736A]">Font files <span className="text-[#09090B]/30 normal-case">(woff2, woff, ttf, otf)</span></span>
              <button
                onClick={() => fontInputRef.current?.click()}
                disabled={uploadingFont}
                className="flex items-center gap-1 text-[10px] font-medium text-[#E8BC59] hover:text-[#d4a94d] disabled:opacity-50"
              >
                {uploadingFont ? (
                  <span className="w-3 h-3 border border-[#E8BC59] border-t-transparent rounded-full animate-spin" />
                ) : (
                  <Upload size={12} />
                )}
                Upload
              </button>
              <input
                ref={fontInputRef}
                type="file"
                accept={FONT_ACCEPT}
                multiple
                className="hidden"
                onChange={(e) => handleFontUpload(e.target.files)}
              />
            </div>
            {sources.length === 0 ? (
              <p className="text-[10px] text-[#09090B]/40">
                No font files uploaded. Without a file, the preview falls back to system fonts.
              </p>
            ) : (
              <div className="space-y-1.5">
                {sources.map((s, i) => {
                  const fileLabel = s.url.split('/').pop()?.split('?')[0] || s.url;
                  return (
                    <div key={i} className="flex items-center gap-2 p-2 rounded-lg border border-[#E6E2D8] bg-white">
                      <TypeIcon size={12} className="text-[#09090B]/40 shrink-0" />
                      <div className="flex-1 min-w-0">
                        <div className="text-[11px] text-[#09090B] truncate">{fileLabel}</div>
                        <div className="font-mono text-[9px] text-[#78736A]">{s.format || 'woff2'}</div>
                      </div>
                      <select
                        value={s.weight}
                        onChange={(e) => updateSource(i, { weight: e.target.value })}
                        className="px-1.5 py-0.5 rounded border border-[#E6E2D8] bg-white text-[10px] font-mono text-[#09090B] focus:border-[#E8BC59] outline-none"
                        title="Font weight"
                      >
                        {WEIGHT_OPTIONS.map((w) => <option key={w} value={w}>{w}</option>)}
                      </select>
                      <select
                        value={s.style || 'normal'}
                        onChange={(e) => updateSource(i, { style: e.target.value as 'normal' | 'italic' })}
                        className="px-1.5 py-0.5 rounded border border-[#E6E2D8] bg-white text-[10px] text-[#09090B] focus:border-[#E8BC59] outline-none"
                        title="Font style"
                      >
                        <option value="normal">Normal</option>
                        <option value="italic">Italic</option>
                      </select>
                      <button onClick={() => removeSource(i)} className="text-[#09090B]/30 hover:text-red-500 shrink-0">
                        <X size={12} />
                      </button>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        )}
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

      {/* Spacing */}
      <div className="p-3 rounded-lg border border-[#E6E2D8] bg-[#FAF8F3]/50 space-y-3">
        <div className="flex items-center justify-between">
          <label className="text-[10px] font-mono uppercase tracking-widest text-[#78736A]">Spacing scale</label>
          <button
            onClick={() => {
              const sizes = block.spacing?.sizes || [];
              onChange({ ...block, spacing: { sizes: [...sizes, { px: 8, rem: '0.5rem' }] } });
            }}
            className="flex items-center gap-1 text-[10px] font-medium text-[#E8BC59] hover:text-[#d4a94d]"
          >
            <Plus size={12} /> Add
          </button>
        </div>
        <div className="space-y-2">
          {(block.spacing?.sizes || []).map((s, i) => (
            <div key={i} className="flex items-center gap-2">
              <input
                type="number"
                value={s.px}
                onChange={(e) => {
                  const sizes = [...(block.spacing?.sizes || [])];
                  sizes[i] = { ...sizes[i], px: Number(e.target.value) };
                  onChange({ ...block, spacing: { sizes } });
                }}
                placeholder="8"
                className="w-16 px-2 py-1 rounded border border-[#E6E2D8] bg-white text-xs text-[#09090B] font-mono focus:border-[#E8BC59] outline-none"
              />
              <span className="text-[10px] text-[#78736A]">px</span>
              <input
                type="text"
                value={s.rem}
                onChange={(e) => {
                  const sizes = [...(block.spacing?.sizes || [])];
                  sizes[i] = { ...sizes[i], rem: e.target.value };
                  onChange({ ...block, spacing: { sizes } });
                }}
                placeholder="0.5rem"
                className="w-20 px-2 py-1 rounded border border-[#E6E2D8] bg-white text-xs text-[#09090B] font-mono focus:border-[#E8BC59] outline-none"
              />
              <button
                onClick={() => {
                  const sizes = (block.spacing?.sizes || []).filter((_, idx) => idx !== i);
                  onChange({ ...block, spacing: { sizes } });
                }}
                className="text-[#09090B]/30 hover:text-red-500"
              >
                <X size={12} />
              </button>
            </div>
          ))}
        </div>
      </div>

      {/* Components */}
      <div className="p-3 rounded-lg border border-[#E6E2D8] bg-[#FAF8F3]/50 space-y-3">
        <label className="text-[10px] font-mono uppercase tracking-widest text-[#78736A]">Components</label>

        {/* Buttons */}
        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <span className="text-[10px] font-mono text-[#78736A]">Buttons</span>
            <button
              onClick={() => {
                const btns = block.components?.buttons || [];
                onChange({ ...block, components: { ...block.components, buttons: [...btns, { label: 'Action', variant: 'primary' }] } });
              }}
              className="flex items-center gap-1 text-[10px] font-medium text-[#E8BC59] hover:text-[#d4a94d]"
            >
              <Plus size={12} /> Add
            </button>
          </div>
          {(block.components?.buttons || []).map((btn, i) => (
            <div key={i} className="flex items-center gap-2">
              <input
                type="text"
                value={btn.label}
                onChange={(e) => {
                  const btns = [...(block.components?.buttons || [])];
                  btns[i] = { ...btns[i], label: e.target.value };
                  onChange({ ...block, components: { ...block.components, buttons: btns } });
                }}
                placeholder="Button label"
                className="flex-1 px-2 py-1 rounded border border-[#E6E2D8] bg-white text-xs text-[#09090B] focus:border-[#E8BC59] outline-none"
              />
              <select
                value={btn.variant || 'primary'}
                onChange={(e) => {
                  const btns = [...(block.components?.buttons || [])];
                  btns[i] = { ...btns[i], variant: e.target.value as 'primary' | 'secondary' | 'outline' };
                  onChange({ ...block, components: { ...block.components, buttons: btns } });
                }}
                className="px-2 py-1 rounded border border-[#E6E2D8] bg-white text-xs text-[#09090B] focus:border-[#E8BC59] outline-none"
              >
                <option value="primary">Primary</option>
                <option value="secondary">Secondary</option>
                <option value="outline">Outline</option>
              </select>
              <button
                onClick={() => {
                  const btns = (block.components?.buttons || []).filter((_, idx) => idx !== i);
                  onChange({ ...block, components: { ...block.components, buttons: btns } });
                }}
                className="text-[#09090B]/30 hover:text-red-500"
              >
                <X size={12} />
              </button>
            </div>
          ))}
        </div>

        {/* Inputs */}
        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <span className="text-[10px] font-mono text-[#78736A]">Inputs</span>
            <button
              onClick={() => {
                const inputs = block.components?.inputs || [];
                onChange({ ...block, components: { ...block.components, inputs: [...inputs, { placeholder: 'Type...' }] } });
              }}
              className="flex items-center gap-1 text-[10px] font-medium text-[#E8BC59] hover:text-[#d4a94d]"
            >
              <Plus size={12} /> Add
            </button>
          </div>
          {(block.components?.inputs || []).map((inp, i) => (
            <div key={i} className="flex items-center gap-2">
              <input
                type="text"
                value={inp.placeholder}
                onChange={(e) => {
                  const inputs = [...(block.components?.inputs || [])];
                  inputs[i] = { ...inputs[i], placeholder: e.target.value };
                  onChange({ ...block, components: { ...block.components, inputs } });
                }}
                placeholder="Placeholder text"
                className="flex-1 px-2 py-1 rounded border border-[#E6E2D8] bg-white text-xs text-[#09090B] focus:border-[#E8BC59] outline-none"
              />
              <button
                onClick={() => {
                  const inputs = (block.components?.inputs || []).filter((_, idx) => idx !== i);
                  onChange({ ...block, components: { ...block.components, inputs } });
                }}
                className="text-[#09090B]/30 hover:text-red-500"
              >
                <X size={12} />
              </button>
            </div>
          ))}
        </div>
      </div>

      {/* Assets (logos, icons, marks) */}
      {onUpload && (
        <div className="p-3 rounded-lg border border-[#E6E2D8] bg-[#FAF8F3]/50 space-y-3">
          <div className="flex items-center justify-between">
            <label className="text-[10px] font-mono uppercase tracking-widest text-[#78736A]">Assets</label>
            <button
              onClick={() => assetInputRef.current?.click()}
              disabled={uploadingAsset}
              className="flex items-center gap-1 text-[10px] font-medium text-[#E8BC59] hover:text-[#d4a94d] disabled:opacity-50"
            >
              {uploadingAsset ? (
                <span className="w-3 h-3 border border-[#E8BC59] border-t-transparent rounded-full animate-spin" />
              ) : (
                <Upload size={12} />
              )}
              Upload
            </button>
            <input
              ref={assetInputRef}
              type="file"
              accept="image/*"
              multiple
              className="hidden"
              onChange={(e) => handleAssetUpload(e.target.files)}
            />
          </div>
          {assets.length === 0 ? (
            <p className="text-[10px] text-[#09090B]/40">
              Upload logos, icons, or marks to include in the design system card.
            </p>
          ) : (
            <div className="grid grid-cols-2 gap-2">
              {assets.map((a, i) => (
                <div key={i} className="flex items-center gap-2 p-2 rounded-lg border border-[#E6E2D8] bg-white">
                  <div className="w-10 h-10 rounded border border-[#E6E2D8] bg-[#FAF8F3] flex items-center justify-center overflow-hidden shrink-0">
                    <img src={a.url} alt={a.name} className="max-w-full max-h-full object-contain" />
                  </div>
                  <div className="flex-1 min-w-0 space-y-1">
                    <input
                      type="text"
                      value={a.name}
                      onChange={(e) => updateAsset(i, { name: e.target.value })}
                      placeholder="Asset name"
                      className="w-full text-xs text-[#09090B] outline-none bg-transparent"
                    />
                    <select
                      value={a.kind || 'logo'}
                      onChange={(e) => updateAsset(i, { kind: e.target.value as 'logo' | 'icon' | 'image' })}
                      className="px-1.5 py-0.5 rounded border border-[#E6E2D8] bg-white text-[10px] text-[#09090B] focus:border-[#E8BC59] outline-none"
                    >
                      <option value="logo">Logo</option>
                      <option value="icon">Icon</option>
                      <option value="image">Image</option>
                    </select>
                  </div>
                  <button onClick={() => removeAsset(i)} className="text-[#09090B]/30 hover:text-red-500 shrink-0">
                    <X size={12} />
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
};
