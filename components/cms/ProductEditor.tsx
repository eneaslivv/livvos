import React, { useEffect, useMemo, useState } from 'react';
import { Plus, Pencil, Trash2, LayoutGrid, List, X } from 'lucide-react';
import { AnimatePresence, motion } from 'framer-motion';
import type {
  CmsProduct,
  CmsPortfolioItem,
  CmsViewMode,
  ProductStat,
  ProductProblem,
  ProductFeature,
  ProductWorkflowStep,
  ProductPricing,
} from '../../types/cms';
import { ImageUploader } from './ImageUploader';
import { DynamicJsonList } from './DynamicJsonList';
import { GridSkeleton, ListSkeleton, EmptyState } from './CmsSkeleton';

interface ProductEditorProps {
  items: CmsProduct[];
  portfolioItems: CmsPortfolioItem[];
  isLoading?: boolean;
  isSaving: boolean;
  onSave: (data: Partial<CmsProduct>, id?: string) => Promise<CmsProduct | null>;
  onDelete: (id: string) => Promise<void>;
  onUpload: (file: File) => Promise<string | null>;
}

const emptyForm = {
  name: '',
  slug: '',
  industry: '',
  target: '',
  headline: '',
  subheadline: '',
  solution: '',
  accent_color: '#E8BC59',
  gradient: '',
  dark_gradient: '',
  hero_image: '',
  gallery: [] as string[],
  published: false,
  display_order: 0,
  portfolio_item_id: '' as string,
  stats: [] as ProductStat[],
  problems: [] as ProductProblem[],
  features: [] as ProductFeature[],
  workflow: [] as ProductWorkflowStep[],
  pricing: { monthly: '', setup: '', includes: [] as string[] } as ProductPricing,
};

type FormTab = 'general' | 'stats' | 'problems' | 'features' | 'workflow' | 'pricing' | 'media';

const TABS: { key: FormTab; label: string }[] = [
  { key: 'general', label: 'General' },
  { key: 'stats', label: 'Stats' },
  { key: 'problems', label: 'Problems' },
  { key: 'features', label: 'Features' },
  { key: 'workflow', label: 'Workflow' },
  { key: 'pricing', label: 'Pricing' },
  { key: 'media', label: 'Media' },
];

export const ProductEditor: React.FC<ProductEditorProps> = ({
  items,
  portfolioItems,
  isLoading,
  isSaving,
  onSave,
  onDelete,
  onUpload,
}) => {
  const [viewMode, setViewMode] = useState<CmsViewMode>('grid');
  const [editingId, setEditingId] = useState<string | null>(null);
  const [showModal, setShowModal] = useState(false);
  const [form, setForm] = useState(emptyForm);
  const [deleteConfirm, setDeleteConfirm] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<FormTab>('general');

  const editingItem = useMemo(
    () => items.find((i) => i.id === editingId) || null,
    [items, editingId]
  );

  useEffect(() => {
    if (editingItem) {
      setForm({
        name: editingItem.name || '',
        slug: editingItem.slug || '',
        industry: editingItem.industry || '',
        target: editingItem.target || '',
        headline: editingItem.headline || '',
        subheadline: editingItem.subheadline || '',
        solution: editingItem.solution || '',
        accent_color: editingItem.accent_color || '#E8BC59',
        gradient: editingItem.gradient || '',
        dark_gradient: editingItem.dark_gradient || '',
        hero_image: editingItem.hero_image || '',
        gallery: editingItem.gallery || [],
        published: editingItem.published ?? false,
        display_order: editingItem.display_order ?? 0,
        portfolio_item_id: editingItem.portfolio_item_id || '',
        stats: editingItem.stats || [],
        problems: editingItem.problems || [],
        features: editingItem.features || [],
        workflow: editingItem.workflow || [],
        pricing: editingItem.pricing || { monthly: '', setup: '', includes: [] },
      });
      setShowModal(true);
      setActiveTab('general');
    }
  }, [editingItem]);

  const resetForm = () => {
    setEditingId(null);
    setForm(emptyForm);
    setShowModal(false);
    setActiveTab('general');
  };

  const handleSave = async () => {
    if (!form.name.trim()) return;
    const data: Partial<CmsProduct> = {
      name: form.name.trim(),
      slug: form.slug || undefined,
      industry: form.industry || null,
      target: form.target || null,
      headline: form.headline || null,
      subheadline: form.subheadline || null,
      solution: form.solution || null,
      accent_color: form.accent_color || null,
      gradient: form.gradient || null,
      dark_gradient: form.dark_gradient || null,
      hero_image: form.hero_image || null,
      gallery: form.gallery,
      published: form.published,
      display_order: form.display_order,
      portfolio_item_id: form.portfolio_item_id || null,
      stats: form.stats,
      problems: form.problems,
      features: form.features,
      workflow: form.workflow,
      pricing: form.pricing,
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
    setActiveTab('general');
  };

  if (isLoading) {
    return (
      <div className="h-full flex flex-col">
        <div className="flex items-center justify-between px-6 py-4 border-b border-[#E6E2D8]">
          <div>
            <h2 className="text-lg font-semibold text-[#09090B] tracking-tight">Products</h2>
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
          <h2 className="text-lg font-semibold text-[#09090B] tracking-tight">Products</h2>
          <p className="text-xs text-[#09090B]/40 mt-0.5">
            {items.length} product{items.length !== 1 ? 's' : ''}
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
            New Product
          </button>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto">
        {items.length === 0 ? (
          <EmptyState
            title="No products yet"
            description="Create your first product page to showcase your offerings"
            actionLabel="Add Product"
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
                    {item.hero_image ? (
                      <div className="h-28 bg-[#F5F3EE] overflow-hidden">
                        <img src={item.hero_image} alt={item.name} className="w-full h-full object-cover" />
                      </div>
                    ) : (
                      <div
                        className="h-28 flex items-center justify-center"
                        style={{ backgroundColor: item.accent_color || '#F5F3EE' }}
                      >
                        <span className="text-white/60 text-2xl font-bold">{item.name.charAt(0)}</span>
                      </div>
                    )}
                    <div className="p-3">
                      <div className="flex items-start justify-between gap-2">
                        <div className="min-w-0">
                          <div className="flex items-center gap-2">
                            <h3 className="text-sm font-semibold text-[#09090B] truncate tracking-tight">{item.name}</h3>
                            {item.accent_color && (
                              <span
                                className="w-3 h-3 rounded-full shrink-0 border border-white shadow-sm"
                                style={{ backgroundColor: item.accent_color }}
                              />
                            )}
                          </div>
                          <p className="text-[10px] text-[#78736A] mt-0.5">
                            {item.industry ? (
                              <span className="inline-block px-1.5 py-0.5 bg-[#09090B]/5 rounded text-[9px]">{item.industry}</span>
                            ) : 'No industry'}
                          </p>
                        </div>
                        <span className={`shrink-0 px-1.5 py-0.5 rounded-full text-[9px] font-medium ${
                          item.published ? 'bg-green-100 text-green-700' : 'bg-zinc-100 text-zinc-500'
                        }`}>
                          {item.published ? 'Live' : 'Draft'}
                        </span>
                      </div>
                      <div className="flex items-center gap-1 mt-2 opacity-0 group-hover:opacity-100 transition-opacity">
                        <button onClick={(e) => { e.stopPropagation(); setEditingId(item.id); }} className="p-1 rounded hover:bg-[#E6E2D8] transition-colors">
                          <Pencil size={12} className="text-[#09090B]/40" />
                        </button>
                        <button onClick={(e) => { e.stopPropagation(); setDeleteConfirm(item.id); }} className="p-1 rounded hover:bg-red-50 transition-colors">
                          <Trash2 size={12} className="text-red-400" />
                        </button>
                      </div>
                    </div>
                  </>
                ) : (
                  <>
                    {item.hero_image ? (
                      <img src={item.hero_image} alt="" className="w-10 h-10 rounded-lg object-cover shrink-0" />
                    ) : (
                      <div className="w-10 h-10 rounded-lg flex items-center justify-center shrink-0" style={{ backgroundColor: item.accent_color || '#F5F3EE' }}>
                        <span className="text-white/60 text-sm font-bold">{item.name.charAt(0)}</span>
                      </div>
                    )}
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <h3 className="text-sm font-medium text-[#09090B] truncate">{item.name}</h3>
                        {item.accent_color && (
                          <span className="w-2.5 h-2.5 rounded-full shrink-0" style={{ backgroundColor: item.accent_color }} />
                        )}
                      </div>
                      <p className="text-[10px] text-[#78736A]">{item.industry || 'No industry'}</p>
                    </div>
                    <span className={`shrink-0 px-1.5 py-0.5 rounded-full text-[9px] font-medium ${
                      item.published ? 'bg-green-100 text-green-700' : 'bg-zinc-100 text-zinc-500'
                    }`}>
                      {item.published ? 'Live' : 'Draft'}
                    </span>
                    <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                      <button onClick={(e) => { e.stopPropagation(); setEditingId(item.id); }} className="p-1 rounded hover:bg-[#E6E2D8]">
                        <Pencil size={12} className="text-[#09090B]/40" />
                      </button>
                      <button onClick={(e) => { e.stopPropagation(); setDeleteConfirm(item.id); }} className="p-1 rounded hover:bg-red-50">
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

      {/* Edit / Create Modal — full-width */}
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
              className="bg-white rounded-2xl shadow-2xl w-full max-w-4xl mx-4 max-h-[90vh] flex flex-col"
            >
              {/* Modal header */}
              <div className="flex items-center justify-between px-6 py-4 border-b border-[#E6E2D8]">
                <h3 className="text-sm font-semibold text-[#09090B] tracking-tight">
                  {editingId ? 'Edit Product' : 'New Product'}
                </h3>
                <button
                  onClick={resetForm}
                  className="p-1.5 rounded-lg hover:bg-[#E6E2D8]/50 transition-colors"
                >
                  <X size={16} className="text-[#09090B]/40" />
                </button>
              </div>

              {/* Tab bar */}
              <div className="px-6 border-b border-[#E6E2D8]">
                <div className="flex gap-0 -mb-px overflow-x-auto">
                  {TABS.map((tab) => (
                    <button
                      key={tab.key}
                      onClick={() => setActiveTab(tab.key)}
                      className={`relative px-4 py-3 text-xs font-medium transition-colors whitespace-nowrap ${
                        activeTab === tab.key
                          ? 'text-[#09090B]'
                          : 'text-[#78736A] hover:text-[#09090B]'
                      }`}
                    >
                      {tab.label}
                      {activeTab === tab.key && (
                        <motion.div
                          layoutId="product-tab-indicator"
                          className="absolute bottom-0 left-0 right-0 h-0.5 bg-[#E8BC59]"
                          transition={{ duration: 0.2 }}
                        />
                      )}
                    </button>
                  ))}
                </div>
              </div>

              {/* Tab content */}
              <div className="flex-1 overflow-y-auto px-6 py-5">
                <AnimatePresence mode="wait">
                  <motion.div
                    key={activeTab}
                    initial={{ opacity: 0, x: 10 }}
                    animate={{ opacity: 1, x: 0 }}
                    exit={{ opacity: 0, x: -10 }}
                    transition={{ duration: 0.15 }}
                  >
                    {activeTab === 'general' && (
                      <div className="grid grid-cols-2 gap-4">
                        <InputField label="Name" value={form.name} onChange={(v) => setForm((f) => ({ ...f, name: v }))} placeholder="Product name" />
                        <InputField label="Slug" value={form.slug} onChange={(v) => setForm((f) => ({ ...f, slug: v }))} placeholder="auto-generated" />
                        <InputField label="Industry" value={form.industry} onChange={(v) => setForm((f) => ({ ...f, industry: v }))} placeholder="e.g. Healthcare" />
                        <InputField label="Target" value={form.target} onChange={(v) => setForm((f) => ({ ...f, target: v }))} placeholder="Target audience" />
                        <InputField label="Headline" value={form.headline} onChange={(v) => setForm((f) => ({ ...f, headline: v }))} placeholder="Main headline" />
                        <InputField label="Subheadline" value={form.subheadline} onChange={(v) => setForm((f) => ({ ...f, subheadline: v }))} placeholder="Supporting text" />
                        <div className="col-span-2 space-y-1.5">
                          <label className="text-[10px] font-mono uppercase tracking-widest text-[#78736A]">Solution</label>
                          <textarea
                            value={form.solution}
                            onChange={(e) => setForm((f) => ({ ...f, solution: e.target.value }))}
                            rows={2}
                            className="w-full px-3 py-2 text-sm rounded-lg border border-[#E6E2D8] bg-white text-[#09090B] placeholder:text-[#09090B]/25 focus:outline-none focus:border-[#E8BC59] resize-none transition-colors"
                            placeholder="Describe the solution..."
                          />
                        </div>
                        <div className="space-y-1.5">
                          <label className="text-[10px] font-mono uppercase tracking-widest text-[#78736A]">Accent Color</label>
                          <div className="flex items-center gap-2">
                            <input type="color" value={form.accent_color} onChange={(e) => setForm((f) => ({ ...f, accent_color: e.target.value }))} className="w-10 h-10 rounded-lg border border-[#E6E2D8] cursor-pointer p-0.5" />
                            <input value={form.accent_color} onChange={(e) => setForm((f) => ({ ...f, accent_color: e.target.value }))} className="flex-1 px-3 py-2 text-sm rounded-lg border border-[#E6E2D8] bg-white font-mono focus:outline-none focus:border-[#E8BC59] transition-colors" />
                          </div>
                        </div>
                        <InputField label="Gradient" value={form.gradient} onChange={(v) => setForm((f) => ({ ...f, gradient: v }))} placeholder="CSS gradient" />
                        <InputField label="Dark Gradient" value={form.dark_gradient} onChange={(v) => setForm((f) => ({ ...f, dark_gradient: v }))} placeholder="Dark mode gradient" />
                        <div className="space-y-1.5">
                          <label className="text-[10px] font-mono uppercase tracking-widest text-[#78736A]">Linked Portfolio</label>
                          <select
                            value={form.portfolio_item_id}
                            onChange={(e) => setForm((f) => ({ ...f, portfolio_item_id: e.target.value }))}
                            className="w-full px-3 py-2 text-sm rounded-lg border border-[#E6E2D8] bg-white text-[#09090B] focus:outline-none focus:border-[#E8BC59] transition-colors"
                          >
                            <option value="">None</option>
                            {portfolioItems.map((p) => (
                              <option key={p.id} value={p.id}>{p.title}</option>
                            ))}
                          </select>
                        </div>
                        <InputField label="Display Order" value={String(form.display_order)} onChange={(v) => setForm((f) => ({ ...f, display_order: Number(v) || 0 }))} placeholder="0" />
                      </div>
                    )}

                    {activeTab === 'stats' && (
                      <DynamicJsonList
                        label="Product Stats"
                        fields={[
                          { key: 'label', label: 'Label' },
                          { key: 'value', label: 'Value' },
                        ]}
                        items={form.stats as unknown as Record<string, string>[]}
                        onChange={(items) => setForm((f) => ({ ...f, stats: items as unknown as ProductStat[] }))}
                        defaultItem={{ label: '', value: '' }}
                      />
                    )}

                    {activeTab === 'problems' && (
                      <DynamicJsonList
                        label="Problems Solved"
                        fields={[
                          { key: 'title', label: 'Title' },
                          { key: 'desc', label: 'Description', type: 'textarea' },
                        ]}
                        items={form.problems as unknown as Record<string, string>[]}
                        onChange={(items) => setForm((f) => ({ ...f, problems: items as unknown as ProductProblem[] }))}
                        defaultItem={{ title: '', desc: '' }}
                      />
                    )}

                    {activeTab === 'features' && (
                      <DynamicJsonList
                        label="Key Features"
                        fields={[
                          { key: 'title', label: 'Title' },
                          { key: 'desc', label: 'Description', type: 'textarea' },
                        ]}
                        items={form.features as unknown as Record<string, string>[]}
                        onChange={(items) => setForm((f) => ({ ...f, features: items as unknown as ProductFeature[] }))}
                        defaultItem={{ title: '', desc: '' }}
                      />
                    )}

                    {activeTab === 'workflow' && (
                      <DynamicJsonList
                        label="Workflow Steps"
                        fields={[
                          { key: 'step', label: 'Step #' },
                          { key: 'title', label: 'Title' },
                          { key: 'desc', label: 'Description', type: 'textarea' },
                        ]}
                        items={form.workflow as unknown as Record<string, string>[]}
                        onChange={(items) => setForm((f) => ({ ...f, workflow: items as unknown as ProductWorkflowStep[] }))}
                        defaultItem={{ step: '', title: '', desc: '' }}
                      />
                    )}

                    {activeTab === 'pricing' && (
                      <div className="space-y-4">
                        <div className="grid grid-cols-2 gap-4">
                          <InputField label="Monthly" value={form.pricing.monthly || ''} onChange={(v) => setForm((f) => ({ ...f, pricing: { ...f.pricing, monthly: v } }))} placeholder="$99/mo" />
                          <InputField label="Setup" value={form.pricing.setup || ''} onChange={(v) => setForm((f) => ({ ...f, pricing: { ...f.pricing, setup: v } }))} placeholder="$500 one-time" />
                        </div>
                        <DynamicJsonList
                          label="Includes"
                          fields={[{ key: 'item', label: 'Feature included' }]}
                          items={(form.pricing.includes || []).map((i) => ({ item: i }))}
                          onChange={(items) =>
                            setForm((f) => ({
                              ...f,
                              pricing: { ...f.pricing, includes: items.map((i) => i.item) },
                            }))
                          }
                          defaultItem={{ item: '' }}
                        />
                      </div>
                    )}

                    {activeTab === 'media' && (
                      <div className="space-y-4">
                        <ImageUploader
                          value={form.hero_image || null}
                          onChange={(url) => setForm((f) => ({ ...f, hero_image: url || '' }))}
                          onUpload={(file) => onUpload(file)}
                          label="Hero Image"
                        />
                        <DynamicJsonList
                          label="Gallery"
                          fields={[{ key: 'url', label: 'Image URL' }]}
                          items={form.gallery.map((u) => ({ url: u }))}
                          onChange={(items) => setForm((f) => ({ ...f, gallery: items.map((i) => i.url) }))}
                          defaultItem={{ url: '' }}
                        />
                      </div>
                    )}
                  </motion.div>
                </AnimatePresence>
              </div>

              {/* Modal footer */}
              <div className="flex items-center justify-between px-6 py-4 border-t border-[#E6E2D8]">
                <label className="flex items-center gap-2 cursor-pointer">
                  <button
                    type="button"
                    onClick={() => setForm((f) => ({ ...f, published: !f.published }))}
                    className={`relative w-9 h-5 rounded-full transition-colors ${form.published ? 'bg-green-500' : 'bg-zinc-300'}`}
                  >
                    <span className={`absolute top-0.5 left-0.5 w-4 h-4 bg-white rounded-full transition-transform ${form.published ? 'translate-x-4' : ''}`} />
                  </button>
                  <span className="text-xs text-[#78736A]">{form.published ? 'Published' : 'Draft'}</span>
                </label>
                <div className="flex items-center gap-2">
                  <button
                    onClick={resetForm}
                    className="px-4 py-2 text-xs font-medium text-[#78736A] border border-[#E6E2D8] rounded-full hover:bg-[#F5F3EE] transition-colors"
                  >
                    Cancel
                  </button>
                  <button
                    onClick={handleSave}
                    disabled={isSaving || !form.name.trim()}
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
              <h3 className="text-sm font-semibold text-[#09090B]">Delete product?</h3>
              <p className="text-xs text-[#78736A] mt-1">This action cannot be undone.</p>
              <div className="flex justify-end gap-2 mt-4">
                <button onClick={() => setDeleteConfirm(null)} className="px-3 py-1.5 text-xs border border-[#E6E2D8] rounded-full hover:bg-[#F5F3EE] transition-colors">Cancel</button>
                <button onClick={() => handleDelete(deleteConfirm)} className="px-3 py-1.5 text-xs bg-red-500 text-white rounded-full hover:bg-red-600 transition-colors">Delete</button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
};

// ─── Helper ──────────────────────────────────────────────
const InputField: React.FC<{
  label: string;
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
}> = ({ label, value, onChange, placeholder }) => (
  <div className="space-y-1.5">
    <label className="text-[10px] font-mono uppercase tracking-widest text-[#78736A]">{label}</label>
    <input
      value={value}
      onChange={(e) => onChange(e.target.value)}
      placeholder={placeholder}
      className="w-full px-3 py-2 text-sm rounded-lg border border-[#E6E2D8] bg-white text-[#09090B] placeholder:text-[#09090B]/25 focus:outline-none focus:border-[#E8BC59] transition-colors"
    />
  </div>
);
