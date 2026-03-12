import React, { useEffect, useMemo, useState } from 'react';
import { Plus, Pencil, Trash2, LayoutGrid, List, Star, X, Image as ImageIcon, Film, GripVertical, Type, Quote, Heading, ChevronDown, ChevronUp } from 'lucide-react';
import { AnimatePresence, motion } from 'framer-motion';
import type { CmsPortfolioItem, CmsViewMode, PortfolioMedia, ContentBlock } from '../../types/cms';
import { ImageUploader } from './ImageUploader';
import { TagInput } from './TagInput';
import { GridSkeleton, ListSkeleton, EmptyState } from './CmsSkeleton';

interface PortfolioEditorProps {
  items: CmsPortfolioItem[];
  isLoading?: boolean;
  isSaving: boolean;
  onSave: (data: Partial<CmsPortfolioItem>, id?: string) => Promise<CmsPortfolioItem | null>;
  onDelete: (id: string) => Promise<void>;
  onUpload: (file: File) => Promise<string | null>;
  detectMediaType?: (url: string) => PortfolioMedia['type'];
}

const CATEGORIES = [
  'Internal Tools',
  'SaaS / Product',
  'Dev Tools',
  'Fintech / App',
  'Content Tech',
  'Enterprise',
  'Web',
  'Branding',
  'E-commerce',
  'Mobile',
];

interface FormState {
  title: string;
  subtitle: string;
  category: string;
  services: string;
  year: string;
  image: string;
  slug: string;
  color: string;
  colors: string[];
  description: string;
  tech_tags: string[];
  display_order: number;
  published: boolean;
  featured: boolean;
  media: PortfolioMedia[];
  content_blocks: ContentBlock[];
}

const emptyForm: FormState = {
  title: '',
  subtitle: '',
  category: 'Web',
  services: '',
  year: String(new Date().getFullYear()),
  image: '',
  slug: '',
  color: '#6366f1',
  colors: [],
  description: '',
  tech_tags: [],
  display_order: 0,
  published: true,
  featured: false,
  media: [],
  content_blocks: [],
};

const BLOCK_TYPES: { type: ContentBlock['type']; icon: typeof Type; label: string }[] = [
  { type: 'heading', icon: Heading, label: 'Heading' },
  { type: 'text', icon: Type, label: 'Text' },
  { type: 'quote', icon: Quote, label: 'Quote' },
];

const defaultDetect = (url: string): PortfolioMedia['type'] => {
  if (/\.(mp4|webm|mov)(\?|$)/i.test(url)) return 'video';
  if (/\.gif(\?|$)/i.test(url)) return 'gif';
  return 'image';
};

export const PortfolioEditor: React.FC<PortfolioEditorProps> = ({
  items,
  isLoading,
  isSaving,
  onSave,
  onDelete,
  onUpload,
  detectMediaType = defaultDetect,
}) => {
  const [viewMode, setViewMode] = useState<CmsViewMode>('grid');
  const [editingId, setEditingId] = useState<string | null>(null);
  const [showModal, setShowModal] = useState(false);
  const [form, setForm] = useState<FormState>(emptyForm);
  const [deleteConfirm, setDeleteConfirm] = useState<string | null>(null);

  const editingItem = useMemo(
    () => items.find((i) => i.id === editingId) || null,
    [items, editingId]
  );

  useEffect(() => {
    if (editingItem) {
      setForm({
        title: editingItem.title || '',
        subtitle: editingItem.subtitle || '',
        category: editingItem.category || editingItem.project_type || 'Web',
        services: editingItem.services || '',
        year: editingItem.year || String(new Date().getFullYear()),
        image: editingItem.image || editingItem.cover_url || '',
        slug: editingItem.slug || '',
        color: editingItem.color || '#6366f1',
        colors: editingItem.colors || [],
        description: editingItem.description || '',
        tech_tags: editingItem.tech_tags || editingItem.tags || [],
        display_order: editingItem.display_order ?? editingItem.sort_order ?? 0,
        published: editingItem.published ?? true,
        featured: editingItem.featured ?? false,
        media: editingItem.media || [],
        content_blocks: editingItem.content_blocks || [],
      });
      setShowModal(true);
    }
  }, [editingItem]);

  const resetForm = () => {
    setEditingId(null);
    setForm(emptyForm);
    setShowModal(false);
  };

  const handleSave = async () => {
    if (!form.title.trim()) return;
    // Use cover from media if no explicit image set
    const coverMedia = form.media.find((m) => m.is_cover);
    const coverImage = form.image || coverMedia?.url || null;

    const data: Partial<CmsPortfolioItem> = {
      title: form.title.trim(),
      subtitle: form.subtitle || null,
      category: form.category,
      services: form.services || null,
      year: form.year || null,
      image: coverImage,
      slug: form.slug || undefined,
      color: form.color || null,
      colors: form.colors.length > 0 ? form.colors : [],
      description: form.description || null,
      tech_tags: form.tech_tags.length > 0 ? form.tech_tags : [],
      display_order: form.display_order,
      published: form.published,
      featured: form.featured,
      media: form.media,
      content_blocks: form.content_blocks,
    };
    const result = await onSave(data, editingId || undefined);
    if (result) resetForm();
  };

  const handleDelete = async (id: string) => {
    await onDelete(id);
    setDeleteConfirm(null);
    if (editingId === id) resetForm();
  };

  const openNew = () => {
    setEditingId(null);
    setForm(emptyForm);
    setShowModal(true);
  };

  if (isLoading) {
    return (
      <div className="h-full flex flex-col">
        <div className="flex items-center justify-between px-6 py-4 border-b border-[#E6E2D8]">
          <div>
            <h2 className="text-lg font-semibold text-[#09090B] tracking-tight">Portfolio</h2>
            <p className="text-xs text-[#09090B]/40 mt-0.5">Loading...</p>
          </div>
        </div>
        {viewMode === 'grid' ? <GridSkeleton /> : <ListSkeleton />}
      </div>
    );
  }

  return (
    <div className="h-full flex flex-col">
      {/* Top bar */}
      <div className="flex items-center justify-between px-6 py-4 border-b border-[#E6E2D8]">
        <div>
          <h2 className="text-lg font-semibold text-[#09090B] tracking-tight">Portfolio</h2>
          <p className="text-xs text-[#09090B]/40 mt-0.5">
            {items.length} project{items.length !== 1 ? 's' : ''}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <div className="flex items-center border border-[#E6E2D8] rounded-lg overflow-hidden">
            <button
              onClick={() => setViewMode('grid')}
              className={`p-1.5 ${viewMode === 'grid' ? 'bg-[#09090B] text-white' : 'text-[#09090B]/40 hover:text-[#09090B]'}`}
            >
              <LayoutGrid size={14} />
            </button>
            <button
              onClick={() => setViewMode('list')}
              className={`p-1.5 ${viewMode === 'list' ? 'bg-[#09090B] text-white' : 'text-[#09090B]/40 hover:text-[#09090B]'}`}
            >
              <List size={14} />
            </button>
          </div>
          <button
            onClick={openNew}
            className="flex items-center gap-2 px-5 py-2.5 bg-[#09090B] text-white text-xs font-medium rounded-full hover:bg-[#09090B]/90 transition-colors"
          >
            <span className="w-5 h-5 rounded-full bg-[#E8BC59] flex items-center justify-center text-[#09090B] text-[10px] font-bold">
              <Plus size={12} />
            </span>
            New Project
          </button>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto">
        {items.length === 0 ? (
          <EmptyState
            title="No projects yet"
            description="Add your first portfolio project to showcase your work"
            actionLabel="Add Project"
            onAction={openNew}
          />
        ) : (
          <div className={`p-6 ${viewMode === 'grid' ? 'grid grid-cols-2 xl:grid-cols-3 gap-3' : 'space-y-2'}`}>
            {items.map((item) => (
              <motion.div
                key={item.id}
                layout
                whileHover={{ y: -4 }}
                transition={{ duration: 0.2 }}
                className={`group border border-[#E6E2D8] rounded-xl bg-white shadow-[0_4px_20px_rgb(0,0,0,0.03)] hover:shadow-[0_8px_30px_rgb(0,0,0,0.08)] transition-shadow cursor-pointer ${
                  viewMode === 'list' ? 'flex items-center gap-3 p-3' : 'p-0 overflow-hidden'
                }`}
                onClick={() => setEditingId(item.id)}
              >
                {viewMode === 'grid' ? (
                  <>
                    <div className="relative">
                      {(item.image || item.cover_url) ? (
                        <div className="h-28 bg-[#F5F3EE] overflow-hidden">
                          <img
                            src={item.image || item.cover_url || ''}
                            alt={item.title}
                            className="w-full h-full object-cover"
                          />
                        </div>
                      ) : (
                        <div
                          className="h-28 flex items-center justify-center"
                          style={{ backgroundColor: item.color || '#F5F3EE' }}
                        >
                          <span className="text-white/60 text-2xl font-bold">
                            {item.title.charAt(0)}
                          </span>
                        </div>
                      )}
                      {item.featured && (
                        <div className="absolute top-2 right-2">
                          <Star size={16} className="text-[#E8BC59] fill-[#E8BC59] drop-shadow" />
                        </div>
                      )}
                    </div>
                    <div className="p-3">
                      <div className="flex items-start justify-between gap-2">
                        <div className="min-w-0">
                          <h3 className="text-sm font-semibold text-[#09090B] truncate tracking-tight">
                            {item.title}
                          </h3>
                          <p className="text-[10px] text-[#78736A] mt-0.5">
                            {item.category || item.project_type || 'general'}
                            {item.year ? ` · ${item.year}` : ''}
                          </p>
                        </div>
                        <span
                          className={`shrink-0 px-1.5 py-0.5 rounded-full text-[9px] font-medium ${
                            item.published !== false
                              ? 'bg-green-100 text-green-700'
                              : 'bg-zinc-100 text-zinc-500'
                          }`}
                        >
                          {item.published !== false ? 'Live' : 'Draft'}
                        </span>
                      </div>
                      {(item.tech_tags || item.tags) && (item.tech_tags || item.tags)!.length > 0 && (
                        <div className="flex flex-wrap gap-1 mt-2">
                          {(item.tech_tags || item.tags)!.slice(0, 3).map((tag) => (
                            <span key={tag} className="px-1.5 py-0.5 bg-[#09090B]/5 rounded text-[9px] text-[#78736A]">
                              {tag}
                            </span>
                          ))}
                          {(item.tech_tags || item.tags)!.length > 3 && (
                            <span className="text-[9px] text-[#78736A]">
                              +{(item.tech_tags || item.tags)!.length - 3}
                            </span>
                          )}
                        </div>
                      )}
                      <div className="flex items-center gap-1 mt-2 opacity-0 group-hover:opacity-100 transition-opacity">
                        <button
                          onClick={(e) => { e.stopPropagation(); setEditingId(item.id); }}
                          className="p-1 rounded hover:bg-[#E6E2D8] transition-colors"
                        >
                          <Pencil size={12} className="text-[#09090B]/40" />
                        </button>
                        <button
                          onClick={(e) => { e.stopPropagation(); setDeleteConfirm(item.id); }}
                          className="p-1 rounded hover:bg-red-50 transition-colors"
                        >
                          <Trash2 size={12} className="text-red-400" />
                        </button>
                      </div>
                    </div>
                  </>
                ) : (
                  <>
                    {(item.image || item.cover_url) ? (
                      <img
                        src={item.image || item.cover_url || ''}
                        alt=""
                        className="w-10 h-10 rounded-lg object-cover shrink-0"
                      />
                    ) : (
                      <div
                        className="w-10 h-10 rounded-lg flex items-center justify-center shrink-0"
                        style={{ backgroundColor: item.color || '#F5F3EE' }}
                      >
                        <span className="text-white/60 text-sm font-bold">{item.title.charAt(0)}</span>
                      </div>
                    )}
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-1.5">
                        <h3 className="text-sm font-medium text-[#09090B] truncate">{item.title}</h3>
                        {item.featured && <Star size={12} className="text-[#E8BC59] fill-[#E8BC59] shrink-0" />}
                      </div>
                      <p className="text-[10px] text-[#78736A]">
                        {item.category || item.project_type || 'general'}
                        {item.year ? ` · ${item.year}` : ''}
                      </p>
                    </div>
                    <span
                      className={`shrink-0 px-1.5 py-0.5 rounded-full text-[9px] font-medium ${
                        item.published !== false ? 'bg-green-100 text-green-700' : 'bg-zinc-100 text-zinc-500'
                      }`}
                    >
                      {item.published !== false ? 'Live' : 'Draft'}
                    </span>
                    <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                      <button
                        onClick={(e) => { e.stopPropagation(); setEditingId(item.id); }}
                        className="p-1 rounded hover:bg-[#E6E2D8]"
                      >
                        <Pencil size={12} className="text-[#09090B]/40" />
                      </button>
                      <button
                        onClick={(e) => { e.stopPropagation(); setDeleteConfirm(item.id); }}
                        className="p-1 rounded hover:bg-red-50"
                      >
                        <Trash2 size={12} className="text-red-400" />
                      </button>
                    </div>
                  </>
                )}
              </motion.div>
            ))}
          </div>
        )}
      </div>

      {/* Edit / Create Modal */}
      <AnimatePresence>
        {showModal && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.2 }}
            className="fixed inset-0 z-50 flex items-center justify-center bg-black/30 backdrop-blur-sm"
            onClick={(e) => { if (e.target === e.currentTarget) resetForm(); }}
          >
            <motion.div
              initial={{ opacity: 0, scale: 0.95, y: 20 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95, y: 20 }}
              transition={{ duration: 0.25, ease: 'easeOut' }}
              className="bg-white rounded-2xl shadow-2xl w-full max-w-2xl mx-4 max-h-[85vh] flex flex-col"
            >
              {/* Modal header */}
              <div className="flex items-center justify-between px-6 py-4 border-b border-[#E6E2D8]">
                <h3 className="text-sm font-semibold text-[#09090B] tracking-tight">
                  {editingId ? 'Edit Project' : 'New Project'}
                </h3>
                <button
                  onClick={resetForm}
                  className="p-1.5 rounded-lg hover:bg-[#E6E2D8]/50 transition-colors"
                >
                  <X size={16} className="text-[#09090B]/40" />
                </button>
              </div>

              {/* Modal body */}
              <div className="flex-1 overflow-y-auto px-6 py-5 space-y-6">
                {/* ── Basic Info ── */}
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-1.5">
                    <label className="text-[10px] font-mono uppercase tracking-widest text-[#78736A]">Title</label>
                    <input
                      value={form.title}
                      onChange={(e) => setForm((f) => ({ ...f, title: e.target.value }))}
                      className="w-full px-3 py-2 text-sm rounded-lg border border-[#E6E2D8] bg-white text-[#09090B] placeholder:text-[#09090B]/25 focus:outline-none focus:border-[#E8BC59] transition-colors"
                      placeholder="Project name"
                    />
                  </div>
                  <div className="space-y-1.5">
                    <label className="text-[10px] font-mono uppercase tracking-widest text-[#78736A]">Subtitle</label>
                    <input
                      value={form.subtitle}
                      onChange={(e) => setForm((f) => ({ ...f, subtitle: e.target.value }))}
                      className="w-full px-3 py-2 text-sm rounded-lg border border-[#E6E2D8] bg-white text-[#09090B] placeholder:text-[#09090B]/25 focus:outline-none focus:border-[#E8BC59] transition-colors"
                      placeholder="Short tagline"
                    />
                  </div>
                  <div className="space-y-1.5">
                    <label className="text-[10px] font-mono uppercase tracking-widest text-[#78736A]">Category</label>
                    <select
                      value={form.category}
                      onChange={(e) => setForm((f) => ({ ...f, category: e.target.value }))}
                      className="w-full px-3 py-2 text-sm rounded-lg border border-[#E6E2D8] bg-white text-[#09090B] focus:outline-none focus:border-[#E8BC59] transition-colors"
                    >
                      {CATEGORIES.map((c) => (
                        <option key={c} value={c}>{c}</option>
                      ))}
                    </select>
                  </div>
                  <div className="space-y-1.5">
                    <label className="text-[10px] font-mono uppercase tracking-widest text-[#78736A]">Services</label>
                    <input
                      value={form.services}
                      onChange={(e) => setForm((f) => ({ ...f, services: e.target.value }))}
                      className="w-full px-3 py-2 text-sm rounded-lg border border-[#E6E2D8] bg-white text-[#09090B] placeholder:text-[#09090B]/25 focus:outline-none focus:border-[#E8BC59] transition-colors"
                      placeholder="Design, Development, etc."
                    />
                  </div>
                  <div className="space-y-1.5">
                    <label className="text-[10px] font-mono uppercase tracking-widest text-[#78736A]">Year</label>
                    <input
                      type="text"
                      value={form.year}
                      onChange={(e) => setForm((f) => ({ ...f, year: e.target.value }))}
                      className="w-full px-3 py-2 text-sm rounded-lg border border-[#E6E2D8] bg-white text-[#09090B] placeholder:text-[#09090B]/25 focus:outline-none focus:border-[#E8BC59] transition-colors"
                      placeholder="2024"
                    />
                  </div>
                  <div className="space-y-1.5">
                    <label className="text-[10px] font-mono uppercase tracking-widest text-[#78736A]">Slug</label>
                    <input
                      value={form.slug}
                      onChange={(e) => setForm((f) => ({ ...f, slug: e.target.value }))}
                      className="w-full px-3 py-2 text-sm rounded-lg border border-[#E6E2D8] bg-white text-[#09090B] placeholder:text-[#09090B]/25 focus:outline-none focus:border-[#E8BC59] transition-colors font-mono text-xs"
                      placeholder="auto-generated from title"
                    />
                  </div>
                  <div className="space-y-1.5">
                    <label className="text-[10px] font-mono uppercase tracking-widest text-[#78736A]">Order</label>
                    <input
                      type="number"
                      value={form.display_order}
                      onChange={(e) => setForm((f) => ({ ...f, display_order: Number(e.target.value) }))}
                      className="w-full px-3 py-2 text-sm rounded-lg border border-[#E6E2D8] bg-white text-[#09090B] focus:outline-none focus:border-[#E8BC59] transition-colors"
                    />
                  </div>
                  <div className="space-y-1.5">
                    <label className="text-[10px] font-mono uppercase tracking-widest text-[#78736A]">&nbsp;</label>
                    <div />
                  </div>
                  <div className="col-span-2">
                    <TagInput
                      tags={form.tech_tags}
                      onChange={(tags) => setForm((f) => ({ ...f, tech_tags: tags }))}
                      placeholder="Add technology..."
                      label="Tech Tags"
                    />
                  </div>
                  <div className="col-span-2 space-y-1.5">
                    <label className="text-[10px] font-mono uppercase tracking-widest text-[#78736A]">Description</label>
                    <textarea
                      value={form.description}
                      onChange={(e) => setForm((f) => ({ ...f, description: e.target.value }))}
                      rows={3}
                      className="w-full px-3 py-2 text-sm rounded-lg border border-[#E6E2D8] bg-white text-[#09090B] placeholder:text-[#09090B]/25 focus:outline-none focus:border-[#E8BC59] resize-none transition-colors"
                      placeholder="Describe the project..."
                    />
                  </div>
                </div>

                {/* ── Colors ── */}
                <div className="space-y-2">
                  <label className="text-[10px] font-mono uppercase tracking-widest text-[#78736A]">Colors</label>
                  <div className="flex flex-wrap items-center gap-2">
                    {/* Primary color */}
                    <div className="relative group">
                      <input
                        type="color"
                        value={form.color}
                        onChange={(e) => setForm((f) => ({ ...f, color: e.target.value }))}
                        className="w-9 h-9 rounded-lg border-2 border-[#E8BC59] cursor-pointer p-0.5"
                      />
                      <span className="absolute -bottom-4 left-1/2 -translate-x-1/2 text-[8px] text-[#78736A] whitespace-nowrap">primary</span>
                    </div>
                    {/* Additional colors */}
                    {form.colors.map((c, i) => (
                      <div key={i} className="relative group">
                        <input
                          type="color"
                          value={c}
                          onChange={(e) => {
                            const next = [...form.colors];
                            next[i] = e.target.value;
                            setForm((f) => ({ ...f, colors: next }));
                          }}
                          className="w-9 h-9 rounded-lg border border-[#E6E2D8] cursor-pointer p-0.5"
                        />
                        <button
                          onClick={() => setForm((f) => ({ ...f, colors: f.colors.filter((_, idx) => idx !== i) }))}
                          className="absolute -top-1 -right-1 w-4 h-4 bg-red-500 text-white rounded-full flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity"
                        >
                          <X size={8} />
                        </button>
                      </div>
                    ))}
                    <button
                      onClick={() => setForm((f) => ({ ...f, colors: [...f.colors, '#78736A'] }))}
                      className="w-9 h-9 rounded-lg border border-dashed border-[#E6E2D8] flex items-center justify-center hover:border-[#E8BC59] transition-colors"
                    >
                      <Plus size={14} className="text-[#09090B]/30" />
                    </button>
                  </div>
                </div>

                {/* ── Media Gallery ── */}
                <div className="space-y-2 mt-2">
                  <div className="flex items-center justify-between">
                    <label className="text-[10px] font-mono uppercase tracking-widest text-[#78736A]">
                      Media Gallery
                      <span className="ml-2 text-[#09090B]/30 normal-case tracking-normal">
                        images, videos, gifs — click star to set cover
                      </span>
                    </label>
                  </div>
                  {form.media.length > 0 && (
                    <div className="grid grid-cols-3 gap-2">
                      {form.media.map((m, i) => (
                        <div
                          key={i}
                          className={`relative group rounded-lg overflow-hidden border-2 transition-colors ${
                            m.is_cover ? 'border-[#E8BC59]' : 'border-[#E6E2D8]'
                          }`}
                        >
                          {m.type === 'video' ? (
                            <video src={m.url} className="w-full h-20 object-cover" muted />
                          ) : (
                            <img src={m.url} alt="" className="w-full h-20 object-cover" />
                          )}
                          {/* Type badge */}
                          <span className="absolute top-1 left-1 px-1 py-0.5 bg-black/60 rounded text-[8px] text-white font-mono uppercase flex items-center gap-0.5">
                            {m.type === 'video' ? <Film size={8} /> : <ImageIcon size={8} />}
                            {m.type}
                          </span>
                          {/* Cover star */}
                          <button
                            onClick={() =>
                              setForm((f) => ({
                                ...f,
                                media: f.media.map((item, idx) => ({
                                  ...item,
                                  is_cover: idx === i,
                                })),
                              }))
                            }
                            className="absolute top-1 right-1 p-0.5"
                          >
                            <Star
                              size={14}
                              className={`drop-shadow ${
                                m.is_cover
                                  ? 'text-[#E8BC59] fill-[#E8BC59]'
                                  : 'text-white/70 opacity-0 group-hover:opacity-100 transition-opacity'
                              }`}
                            />
                          </button>
                          {/* Caption */}
                          <input
                            value={m.caption || ''}
                            onChange={(e) => {
                              const next = [...form.media];
                              next[i] = { ...next[i], caption: e.target.value };
                              setForm((f) => ({ ...f, media: next }));
                            }}
                            placeholder="Caption..."
                            className="w-full px-1.5 py-1 text-[10px] bg-[#FDFBF7] border-t border-[#E6E2D8] focus:outline-none placeholder:text-[#09090B]/20"
                          />
                          {/* Delete */}
                          <button
                            onClick={() => setForm((f) => ({ ...f, media: f.media.filter((_, idx) => idx !== i) }))}
                            className="absolute bottom-6 right-1 w-5 h-5 bg-red-500/80 text-white rounded-full flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity"
                          >
                            <X size={10} />
                          </button>
                        </div>
                      ))}
                    </div>
                  )}
                  <ImageUploader
                    value={null}
                    onChange={(url) => {
                      if (!url) return;
                      const mediaType = detectMediaType(url);
                      const isFirst = form.media.length === 0;
                      setForm((f) => ({
                        ...f,
                        media: [
                          ...f.media,
                          { url, type: mediaType, is_cover: isFirst, caption: '' },
                        ],
                        // Also set as main image if first upload
                        ...(isFirst ? { image: url } : {}),
                      }));
                    }}
                    onUpload={(file) => onUpload(file)}
                    label={form.media.length > 0 ? 'Add more media' : 'Upload images, videos or GIFs'}
                  />
                </div>

                {/* ── Content Blocks ── */}
                <div className="space-y-2">
                  <div className="flex items-center justify-between">
                    <label className="text-[10px] font-mono uppercase tracking-widest text-[#78736A]">
                      Content Blocks
                    </label>
                    <div className="flex items-center gap-1">
                      {BLOCK_TYPES.map(({ type, icon: Icon, label }) => (
                        <button
                          key={type}
                          onClick={() =>
                            setForm((f) => ({
                              ...f,
                              content_blocks: [
                                ...f.content_blocks,
                                { type, content: '', sort_order: f.content_blocks.length },
                              ],
                            }))
                          }
                          className="flex items-center gap-1 px-2 py-1 text-[10px] text-[#78736A] border border-[#E6E2D8] rounded-md hover:border-[#E8BC59] hover:text-[#09090B] transition-colors"
                        >
                          <Icon size={10} />
                          {label}
                        </button>
                      ))}
                    </div>
                  </div>
                  {form.content_blocks.length === 0 && (
                    <p className="text-xs text-[#09090B]/25 py-3 text-center">
                      Add headings, text paragraphs, or quotes
                    </p>
                  )}
                  <div className="space-y-2">
                    {form.content_blocks.map((block, i) => (
                      <div
                        key={i}
                        className="flex gap-2 items-start border border-[#E6E2D8] rounded-lg p-2 bg-[#FDFBF7]"
                      >
                        <div className="flex flex-col items-center gap-0.5 pt-1">
                          <GripVertical size={12} className="text-[#09090B]/20" />
                          <span className="text-[8px] font-mono text-[#78736A] uppercase mt-0.5">
                            {block.type === 'heading' ? 'H' : block.type === 'quote' ? 'Q' : 'T'}
                          </span>
                          <div className="flex flex-col gap-0.5 mt-1">
                            {i > 0 && (
                              <button
                                onClick={() => {
                                  const next = [...form.content_blocks];
                                  [next[i - 1], next[i]] = [next[i], next[i - 1]];
                                  setForm((f) => ({ ...f, content_blocks: next.map((b, idx) => ({ ...b, sort_order: idx })) }));
                                }}
                                className="p-0.5 hover:bg-[#E6E2D8] rounded"
                              >
                                <ChevronUp size={10} className="text-[#09090B]/40" />
                              </button>
                            )}
                            {i < form.content_blocks.length - 1 && (
                              <button
                                onClick={() => {
                                  const next = [...form.content_blocks];
                                  [next[i], next[i + 1]] = [next[i + 1], next[i]];
                                  setForm((f) => ({ ...f, content_blocks: next.map((b, idx) => ({ ...b, sort_order: idx })) }));
                                }}
                                className="p-0.5 hover:bg-[#E6E2D8] rounded"
                              >
                                <ChevronDown size={10} className="text-[#09090B]/40" />
                              </button>
                            )}
                          </div>
                        </div>
                        <div className="flex-1">
                          {block.type === 'heading' ? (
                            <input
                              value={block.content}
                              onChange={(e) => {
                                const next = [...form.content_blocks];
                                next[i] = { ...next[i], content: e.target.value };
                                setForm((f) => ({ ...f, content_blocks: next }));
                              }}
                              className="w-full px-2 py-1.5 text-sm font-semibold tracking-tight rounded border border-transparent focus:border-[#E8BC59] bg-transparent focus:bg-white focus:outline-none transition-colors"
                              placeholder="Section heading..."
                            />
                          ) : (
                            <textarea
                              value={block.content}
                              onChange={(e) => {
                                const next = [...form.content_blocks];
                                next[i] = { ...next[i], content: e.target.value };
                                setForm((f) => ({ ...f, content_blocks: next }));
                              }}
                              rows={block.type === 'quote' ? 2 : 3}
                              className={`w-full px-2 py-1.5 text-sm rounded border border-transparent focus:border-[#E8BC59] bg-transparent focus:bg-white focus:outline-none resize-none transition-colors ${
                                block.type === 'quote' ? 'italic border-l-2 border-l-[#E8BC59] pl-3' : ''
                              }`}
                              placeholder={block.type === 'quote' ? 'Quote text...' : 'Paragraph text...'}
                            />
                          )}
                        </div>
                        <button
                          onClick={() =>
                            setForm((f) => ({
                              ...f,
                              content_blocks: f.content_blocks
                                .filter((_, idx) => idx !== i)
                                .map((b, idx) => ({ ...b, sort_order: idx })),
                            }))
                          }
                          className="p-1 rounded hover:bg-red-50 transition-colors mt-1"
                        >
                          <Trash2 size={12} className="text-red-400" />
                        </button>
                      </div>
                    ))}
                  </div>
                </div>
              </div>

              {/* Modal footer */}
              <div className="flex items-center justify-between px-6 py-4 border-t border-[#E6E2D8]">
                <div className="flex items-center gap-4">
                  <label className="flex items-center gap-2 cursor-pointer">
                    <button
                      type="button"
                      onClick={() => setForm((f) => ({ ...f, published: !f.published }))}
                      className={`relative w-9 h-5 rounded-full transition-colors ${
                        form.published ? 'bg-green-500' : 'bg-zinc-300'
                      }`}
                    >
                      <span
                        className={`absolute top-0.5 left-0.5 w-4 h-4 bg-white rounded-full transition-transform ${
                          form.published ? 'translate-x-4' : ''
                        }`}
                      />
                    </button>
                    <span className="text-xs text-[#78736A]">
                      {form.published ? 'Published' : 'Draft'}
                    </span>
                  </label>
                  <button
                    type="button"
                    onClick={() => setForm((f) => ({ ...f, featured: !f.featured }))}
                    className={`flex items-center gap-1.5 px-2.5 py-1 rounded-full border transition-colors ${
                      form.featured
                        ? 'border-[#E8BC59] bg-[#E8BC59]/10 text-[#E8BC59]'
                        : 'border-[#E6E2D8] text-[#09090B]/30 hover:text-[#E8BC59] hover:border-[#E8BC59]/40'
                    }`}
                  >
                    <Star size={12} className={form.featured ? 'fill-[#E8BC59]' : ''} />
                    <span className="text-xs font-medium">Featured</span>
                  </button>
                </div>
                <div className="flex items-center gap-2">
                  <button
                    onClick={resetForm}
                    className="px-4 py-2 text-xs font-medium text-[#78736A] border border-[#E6E2D8] rounded-full hover:bg-[#F5F3EE] transition-colors"
                  >
                    Cancel
                  </button>
                  <button
                    onClick={handleSave}
                    disabled={isSaving || !form.title.trim()}
                    className="flex items-center gap-2 px-5 py-2 bg-[#09090B] text-white text-xs font-medium rounded-full hover:bg-[#09090B]/90 disabled:opacity-50 transition-colors"
                  >
                    {isSaving ? (
                      'Saving...'
                    ) : (
                      <>
                        <span className="w-4 h-4 rounded-full bg-[#E8BC59] flex items-center justify-center text-[#09090B] text-[8px] font-bold">✓</span>
                        {editingId ? 'Update' : 'Create'}
                      </>
                    )}
                  </button>
                </div>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Delete confirmation */}
      <AnimatePresence>
        {deleteConfirm && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-[60] flex items-center justify-center bg-black/30 backdrop-blur-sm"
          >
            <motion.div
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.95 }}
              className="bg-white rounded-xl p-5 shadow-xl max-w-sm w-full mx-4"
            >
              <h3 className="text-sm font-semibold text-[#09090B]">Delete project?</h3>
              <p className="text-xs text-[#78736A] mt-1">This action cannot be undone.</p>
              <div className="flex justify-end gap-2 mt-4">
                <button
                  onClick={() => setDeleteConfirm(null)}
                  className="px-3 py-1.5 text-xs border border-[#E6E2D8] rounded-full hover:bg-[#F5F3EE] transition-colors"
                >
                  Cancel
                </button>
                <button
                  onClick={() => handleDelete(deleteConfirm)}
                  className="px-3 py-1.5 text-xs bg-red-500 text-white rounded-full hover:bg-red-600 transition-colors"
                >
                  Delete
                </button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
};
