import React, { useEffect, useMemo, useState } from 'react';
import { Plus, Pencil, Trash2, LayoutGrid, List, Sparkles } from 'lucide-react';
import type { CmsBlogPost, CmsViewMode } from '../../types/cms';
import { ImageUploader } from './ImageUploader';
import { generateBlogFromAI } from '../../lib/ai';

interface BlogEditorProps {
  items: CmsBlogPost[];
  isSaving: boolean;
  onSave: (data: Partial<CmsBlogPost>, id?: string) => Promise<CmsBlogPost | null>;
  onDelete: (id: string) => Promise<void>;
  onUpload: (file: File) => Promise<string | null>;
}

const emptyForm = {
  title: '',
  slug: '',
  status: 'draft' as 'draft' | 'published',
  excerpt: '',
  content: '',
  language: 'en',
  cover_url: '',
  tags: '',
};

export const BlogEditor: React.FC<BlogEditorProps> = ({
  items,
  isSaving,
  onSave,
  onDelete,
  onUpload,
}) => {
  const [viewMode, setViewMode] = useState<CmsViewMode>('list');
  const [editingId, setEditingId] = useState<string | null>(null);
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState(emptyForm);
  const [deleteConfirm, setDeleteConfirm] = useState<string | null>(null);
  const [isGenerating, setIsGenerating] = useState(false);

  const editingItem = useMemo(
    () => items.find((i) => i.id === editingId) || null,
    [items, editingId]
  );

  useEffect(() => {
    if (editingItem) {
      setForm({
        title: editingItem.title || '',
        slug: editingItem.slug || '',
        status: editingItem.status || 'draft',
        excerpt: editingItem.excerpt || '',
        content: editingItem.content || '',
        language: editingItem.language || 'en',
        cover_url: editingItem.cover_url || '',
        tags: (editingItem.tags || []).join(', '),
      });
      setShowForm(true);
    }
  }, [editingItem]);

  const resetForm = () => {
    setEditingId(null);
    setForm(emptyForm);
    setShowForm(false);
  };

  const handleSave = async () => {
    if (!form.title.trim()) return;
    const data: Partial<CmsBlogPost> = {
      title: form.title.trim(),
      slug: form.slug || undefined,
      status: form.status,
      excerpt: form.excerpt || null,
      content: form.content || null,
      language: form.language,
      cover_url: form.cover_url || null,
      tags: form.tags ? form.tags.split(',').map((t) => t.trim()).filter(Boolean) : [],
    };
    const result = await onSave(data, editingId || undefined);
    if (result) resetForm();
  };

  const handleDelete = async (id: string) => {
    await onDelete(id);
    setDeleteConfirm(null);
    if (editingId === id) resetForm();
  };

  const handleAIGenerate = async () => {
    if (!form.title.trim()) return;
    setIsGenerating(true);
    try {
      const result = await generateBlogFromAI(form.title);
      if (result) {
        setForm((f) => ({
          ...f,
          title: result.title || f.title,
          content: result.content || f.content,
          excerpt: result.excerpt || f.excerpt,
        }));
      }
    } catch {
      if (import.meta.env.DEV) console.error('[CMS] AI generation failed');
    }
    setIsGenerating(false);
  };

  return (
    <div className="h-full flex flex-col">
      {/* Top bar */}
      <div className="flex items-center justify-between px-6 py-4 border-b border-[#E6E2D8]">
        <div>
          <h2 className="text-lg font-semibold text-[#09090B] tracking-tight">Blog</h2>
          <p className="text-xs text-[#09090B]/40 mt-0.5">
            {items.length} post{items.length !== 1 ? 's' : ''}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <div className="flex items-center border border-[#E6E2D8] rounded-lg overflow-hidden">
            <button onClick={() => setViewMode('grid')} className={`p-1.5 ${viewMode === 'grid' ? 'bg-[#09090B] text-white' : 'text-[#09090B]/40 hover:text-[#09090B]'}`}>
              <LayoutGrid size={14} />
            </button>
            <button onClick={() => setViewMode('list')} className={`p-1.5 ${viewMode === 'list' ? 'bg-[#09090B] text-white' : 'text-[#09090B]/40 hover:text-[#09090B]'}`}>
              <List size={14} />
            </button>
          </div>
          <button
            onClick={() => { resetForm(); setShowForm(true); }}
            className="flex items-center gap-1.5 px-3 py-1.5 bg-[#09090B] text-white text-xs font-medium rounded-lg hover:bg-[#09090B]/90 transition-colors"
          >
            <Plus size={14} />
            New
          </button>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto">
        {/* Items */}
        <div className={`p-6 ${viewMode === 'grid' ? 'grid grid-cols-2 xl:grid-cols-3 gap-3' : 'space-y-2'}`}>
          {items.map((item) => (
            <div
              key={item.id}
              className={`group border border-[#E6E2D8] rounded-xl bg-white hover:shadow-sm transition-all cursor-pointer ${
                editingId === item.id ? 'ring-2 ring-[#E8BC59] border-[#E8BC59]' : ''
              } ${viewMode === 'list' ? 'flex items-center gap-3 p-3' : 'p-3'}`}
              onClick={() => setEditingId(item.id)}
            >
              {viewMode === 'grid' ? (
                <>
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      <h3 className="text-sm font-semibold text-[#09090B] truncate">{item.title}</h3>
                      <p className="text-[10px] text-[#09090B]/40 mt-0.5 truncate">{item.slug}</p>
                    </div>
                    <span className={`shrink-0 px-1.5 py-0.5 rounded text-[9px] font-medium ${
                      item.status === 'published' ? 'bg-green-100 text-green-700' : 'bg-amber-100 text-amber-700'
                    }`}>
                      {item.status}
                    </span>
                  </div>
                  {item.excerpt && (
                    <p className="text-[11px] text-[#09090B]/40 mt-2 line-clamp-2">{item.excerpt}</p>
                  )}
                  <div className="flex items-center gap-1 mt-2 opacity-0 group-hover:opacity-100 transition-opacity">
                    <button onClick={(e) => { e.stopPropagation(); setEditingId(item.id); }} className="p-1 rounded hover:bg-[#E6E2D8]">
                      <Pencil size={12} className="text-[#09090B]/40" />
                    </button>
                    <button onClick={(e) => { e.stopPropagation(); setDeleteConfirm(item.id); }} className="p-1 rounded hover:bg-red-50">
                      <Trash2 size={12} className="text-red-400" />
                    </button>
                  </div>
                </>
              ) : (
                <>
                  <div className="flex-1 min-w-0">
                    <h3 className="text-sm font-medium text-[#09090B] truncate">{item.title}</h3>
                    <p className="text-[10px] text-[#09090B]/40">{item.language?.toUpperCase()} · {item.slug}</p>
                  </div>
                  <span className={`shrink-0 px-1.5 py-0.5 rounded text-[9px] font-medium ${
                    item.status === 'published' ? 'bg-green-100 text-green-700' : 'bg-amber-100 text-amber-700'
                  }`}>
                    {item.status}
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
            </div>
          ))}
        </div>

        {/* Form */}
        {showForm && (
          <div className="border-t border-[#E6E2D8] px-6 py-5 bg-[#FDFBF7]">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-sm font-semibold text-[#09090B]">
                {editingId ? 'Edit Post' : 'New Post'}
              </h3>
              <div className="flex items-center gap-2">
                <button
                  onClick={handleAIGenerate}
                  disabled={isGenerating || !form.title.trim()}
                  className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-[#E8BC59] border border-[#E8BC59]/30 rounded-lg hover:bg-[#E8BC59]/5 disabled:opacity-50 transition-colors"
                >
                  <Sparkles size={12} />
                  {isGenerating ? 'Generating...' : 'AI Generate'}
                </button>
                <button onClick={resetForm} className="text-xs text-[#09090B]/40 hover:text-[#09090B]">Cancel</button>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1">
                <label className="text-xs font-medium text-[#09090B]/70">Title</label>
                <input
                  value={form.title}
                  onChange={(e) => setForm((f) => ({ ...f, title: e.target.value }))}
                  className="w-full px-3 py-2 text-sm rounded-lg border border-[#E6E2D8] bg-white text-[#09090B] placeholder:text-[#09090B]/30 focus:outline-none focus:border-[#E8BC59]"
                  placeholder="Post title"
                />
              </div>
              <div className="space-y-1">
                <label className="text-xs font-medium text-[#09090B]/70">Slug</label>
                <input
                  value={form.slug}
                  onChange={(e) => setForm((f) => ({ ...f, slug: e.target.value }))}
                  className="w-full px-3 py-2 text-sm rounded-lg border border-[#E6E2D8] bg-white text-[#09090B] placeholder:text-[#09090B]/30 focus:outline-none focus:border-[#E8BC59]"
                  placeholder="auto-generated"
                />
              </div>
              <div className="col-span-2 space-y-1">
                <label className="text-xs font-medium text-[#09090B]/70">Excerpt</label>
                <textarea
                  value={form.excerpt}
                  onChange={(e) => setForm((f) => ({ ...f, excerpt: e.target.value }))}
                  rows={2}
                  className="w-full px-3 py-2 text-sm rounded-lg border border-[#E6E2D8] bg-white text-[#09090B] placeholder:text-[#09090B]/30 focus:outline-none focus:border-[#E8BC59] resize-none"
                  placeholder="Brief summary..."
                />
              </div>
              <div className="col-span-2 space-y-1">
                <label className="text-xs font-medium text-[#09090B]/70">Content</label>
                <textarea
                  value={form.content}
                  onChange={(e) => setForm((f) => ({ ...f, content: e.target.value }))}
                  rows={8}
                  className="w-full px-3 py-2 text-sm rounded-lg border border-[#E6E2D8] bg-white text-[#09090B] placeholder:text-[#09090B]/30 focus:outline-none focus:border-[#E8BC59] resize-y font-mono"
                  placeholder="Write your post content..."
                />
              </div>
              <div className="col-span-2">
                <ImageUploader
                  value={form.cover_url || null}
                  onChange={(url) => setForm((f) => ({ ...f, cover_url: url || '' }))}
                  onUpload={(file) => onUpload(file)}
                  label="Cover Image"
                />
              </div>
              <div className="space-y-1">
                <label className="text-xs font-medium text-[#09090B]/70">Tags</label>
                <input
                  value={form.tags}
                  onChange={(e) => setForm((f) => ({ ...f, tags: e.target.value }))}
                  className="w-full px-3 py-2 text-sm rounded-lg border border-[#E6E2D8] bg-white text-[#09090B] placeholder:text-[#09090B]/30 focus:outline-none focus:border-[#E8BC59]"
                  placeholder="tag1, tag2, tag3"
                />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1">
                  <label className="text-xs font-medium text-[#09090B]/70">Language</label>
                  <select
                    value={form.language}
                    onChange={(e) => setForm((f) => ({ ...f, language: e.target.value }))}
                    className="w-full px-3 py-2 text-sm rounded-lg border border-[#E6E2D8] bg-white text-[#09090B] focus:outline-none focus:border-[#E8BC59]"
                  >
                    <option value="en">English</option>
                    <option value="es">Spanish</option>
                  </select>
                </div>
                <div className="space-y-1">
                  <label className="text-xs font-medium text-[#09090B]/70">Status</label>
                  <select
                    value={form.status}
                    onChange={(e) => setForm((f) => ({ ...f, status: e.target.value as 'draft' | 'published' }))}
                    className="w-full px-3 py-2 text-sm rounded-lg border border-[#E6E2D8] bg-white text-[#09090B] focus:outline-none focus:border-[#E8BC59]"
                  >
                    <option value="draft">Draft</option>
                    <option value="published">Published</option>
                  </select>
                </div>
              </div>
              <div className="col-span-2 flex justify-end gap-2 pt-2">
                <button onClick={resetForm} className="px-4 py-2 text-xs font-medium text-[#09090B]/60 border border-[#E6E2D8] rounded-lg hover:bg-white transition-colors">Cancel</button>
                <button
                  onClick={handleSave}
                  disabled={isSaving || !form.title.trim()}
                  className="px-4 py-2 text-xs font-medium bg-[#09090B] text-white rounded-lg hover:bg-[#09090B]/90 disabled:opacity-50 transition-colors"
                >
                  {isSaving ? 'Saving...' : editingId ? 'Update' : 'Create'}
                </button>
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Delete confirmation */}
      {deleteConfirm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/30 backdrop-blur-sm">
          <div className="bg-white rounded-xl p-5 shadow-xl max-w-sm w-full mx-4">
            <h3 className="text-sm font-semibold text-[#09090B]">Delete post?</h3>
            <p className="text-xs text-[#09090B]/50 mt-1">This action cannot be undone.</p>
            <div className="flex justify-end gap-2 mt-4">
              <button onClick={() => setDeleteConfirm(null)} className="px-3 py-1.5 text-xs border border-[#E6E2D8] rounded-lg hover:bg-[#F5F3EE]">Cancel</button>
              <button onClick={() => handleDelete(deleteConfirm)} className="px-3 py-1.5 text-xs bg-red-500 text-white rounded-lg hover:bg-red-600">Delete</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
