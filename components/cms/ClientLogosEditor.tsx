import React, { useEffect, useMemo, useState } from 'react';
import { Plus, Pencil, Trash2, Eye, EyeOff } from 'lucide-react';
import type { CmsClientLogo } from '../../types/cms';
import { ImageUploader } from './ImageUploader';

interface ClientLogosEditorProps {
  items: CmsClientLogo[];
  isSaving: boolean;
  onSave: (data: Partial<CmsClientLogo>, id?: string) => Promise<CmsClientLogo | null>;
  onDelete: (id: string) => Promise<void>;
  onUpload: (file: File) => Promise<string | null>;
}

const emptyForm = {
  name: '',
  logo_url: '',
  website_url: '',
  is_visible: true,
  sort_order: 0,
};

export const ClientLogosEditor: React.FC<ClientLogosEditorProps> = ({
  items,
  isSaving,
  onSave,
  onDelete,
  onUpload,
}) => {
  const [editingId, setEditingId] = useState<string | null>(null);
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState(emptyForm);
  const [deleteConfirm, setDeleteConfirm] = useState<string | null>(null);

  const editingItem = useMemo(
    () => items.find((i) => i.id === editingId) || null,
    [items, editingId]
  );

  useEffect(() => {
    if (editingItem) {
      setForm({
        name: editingItem.name || '',
        logo_url: editingItem.logo_url || '',
        website_url: editingItem.website_url || '',
        is_visible: editingItem.is_visible ?? true,
        sort_order: editingItem.sort_order ?? 0,
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
    if (!form.name.trim()) return;
    const data: Partial<CmsClientLogo> = {
      name: form.name.trim(),
      logo_url: form.logo_url,
      website_url: form.website_url || null,
      is_visible: form.is_visible,
      sort_order: form.sort_order,
    };
    const result = await onSave(data, editingId || undefined);
    if (result) resetForm();
  };

  const handleDelete = async (id: string) => {
    await onDelete(id);
    setDeleteConfirm(null);
    if (editingId === id) resetForm();
  };

  const toggleVisibility = async (item: CmsClientLogo) => {
    await onSave({ is_visible: !item.is_visible }, item.id);
  };

  return (
    <div className="h-full flex flex-col">
      {/* Top bar */}
      <div className="flex items-center justify-between px-6 py-4 border-b border-[#E6E2D8]">
        <div>
          <h2 className="text-lg font-semibold text-[#09090B] tracking-tight">Client Logos</h2>
          <p className="text-xs text-[#09090B]/40 mt-0.5">
            {items.length} logo{items.length !== 1 ? 's' : ''}
          </p>
        </div>
        <button
          onClick={() => { resetForm(); setShowForm(true); }}
          className="flex items-center gap-1.5 px-3 py-1.5 bg-[#09090B] text-white text-xs font-medium rounded-lg hover:bg-[#09090B]/90 transition-colors"
        >
          <Plus size={14} />
          New
        </button>
      </div>

      <div className="flex-1 overflow-y-auto">
        {/* Logo grid */}
        <div className="p-6 grid grid-cols-3 sm:grid-cols-4 xl:grid-cols-5 gap-3">
          {items.map((item) => (
            <div
              key={item.id}
              className={`group relative border border-[#E6E2D8] rounded-xl bg-white hover:shadow-sm transition-all cursor-pointer overflow-hidden ${
                editingId === item.id ? 'ring-2 ring-[#E8BC59] border-[#E8BC59]' : ''
              }`}
              onClick={() => setEditingId(item.id)}
            >
              <div className="aspect-square flex items-center justify-center p-4 bg-[#FDFBF7]">
                {item.logo_url ? (
                  <img
                    src={item.logo_url}
                    alt={item.name}
                    className={`max-w-full max-h-full object-contain ${
                      item.is_visible === false ? 'opacity-30' : ''
                    }`}
                  />
                ) : (
                  <span className="text-2xl font-bold text-[#09090B]/10">
                    {item.name.charAt(0)}
                  </span>
                )}
              </div>
              <div className="px-2.5 py-2 border-t border-[#E6E2D8]">
                <div className="flex items-center justify-between">
                  <h3 className="text-[11px] font-medium text-[#09090B] truncate">
                    {item.name}
                  </h3>
                  {item.is_visible === false && (
                    <EyeOff size={10} className="text-[#09090B]/30 shrink-0" />
                  )}
                </div>
              </div>
              {/* Hover actions */}
              <div className="absolute top-1.5 right-1.5 flex items-center gap-0.5 opacity-0 group-hover:opacity-100 transition-opacity">
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    toggleVisibility(item);
                  }}
                  className="p-1 rounded bg-white/90 shadow-sm hover:bg-white"
                  title={item.is_visible !== false ? 'Hide' : 'Show'}
                >
                  {item.is_visible !== false ? (
                    <Eye size={11} className="text-[#09090B]/50" />
                  ) : (
                    <EyeOff size={11} className="text-[#09090B]/50" />
                  )}
                </button>
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    setDeleteConfirm(item.id);
                  }}
                  className="p-1 rounded bg-white/90 shadow-sm hover:bg-red-50"
                >
                  <Trash2 size={11} className="text-red-400" />
                </button>
              </div>
            </div>
          ))}
        </div>

        {/* Form */}
        {showForm && (
          <div className="border-t border-[#E6E2D8] px-6 py-5 bg-[#FDFBF7]">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-sm font-semibold text-[#09090B]">
                {editingId ? 'Edit Logo' : 'New Logo'}
              </h3>
              <button onClick={resetForm} className="text-xs text-[#09090B]/40 hover:text-[#09090B]">Cancel</button>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1">
                <label className="text-xs font-medium text-[#09090B]/70">Client Name</label>
                <input
                  value={form.name}
                  onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
                  className="w-full px-3 py-2 text-sm rounded-lg border border-[#E6E2D8] bg-white text-[#09090B] placeholder:text-[#09090B]/30 focus:outline-none focus:border-[#E8BC59]"
                  placeholder="Company name"
                />
              </div>
              <div className="space-y-1">
                <label className="text-xs font-medium text-[#09090B]/70">Website URL</label>
                <input
                  value={form.website_url}
                  onChange={(e) => setForm((f) => ({ ...f, website_url: e.target.value }))}
                  className="w-full px-3 py-2 text-sm rounded-lg border border-[#E6E2D8] bg-white text-[#09090B] placeholder:text-[#09090B]/30 focus:outline-none focus:border-[#E8BC59]"
                  placeholder="https://client.com"
                />
              </div>
              <div className="col-span-2">
                <ImageUploader
                  value={form.logo_url || null}
                  onChange={(url) => setForm((f) => ({ ...f, logo_url: url || '' }))}
                  onUpload={(file) => onUpload(file)}
                  label="Logo"
                />
              </div>
              <div className="col-span-2 flex items-center justify-between pt-2">
                <div className="flex items-center gap-3">
                  <label className="flex items-center gap-2 cursor-pointer">
                    <button
                      type="button"
                      onClick={() => setForm((f) => ({ ...f, is_visible: !f.is_visible }))}
                      className={`relative w-9 h-5 rounded-full transition-colors ${
                        form.is_visible ? 'bg-green-500' : 'bg-zinc-300'
                      }`}
                    >
                      <span className={`absolute top-0.5 left-0.5 w-4 h-4 bg-white rounded-full transition-transform ${
                        form.is_visible ? 'translate-x-4' : ''
                      }`} />
                    </button>
                    <span className="text-xs text-[#09090B]/60">
                      {form.is_visible ? 'Visible' : 'Hidden'}
                    </span>
                  </label>
                  <div className="flex items-center gap-1.5">
                    <label className="text-xs text-[#09090B]/60">Order</label>
                    <input
                      type="number"
                      value={form.sort_order}
                      onChange={(e) => setForm((f) => ({ ...f, sort_order: Number(e.target.value) }))}
                      className="w-16 px-2 py-1 text-xs rounded-md border border-[#E6E2D8] bg-white text-[#09090B] focus:outline-none focus:border-[#E8BC59]"
                    />
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <button onClick={resetForm} className="px-4 py-2 text-xs font-medium text-[#09090B]/60 border border-[#E6E2D8] rounded-lg hover:bg-white transition-colors">Cancel</button>
                  <button
                    onClick={handleSave}
                    disabled={isSaving || !form.name.trim()}
                    className="px-4 py-2 text-xs font-medium bg-[#09090B] text-white rounded-lg hover:bg-[#09090B]/90 disabled:opacity-50 transition-colors"
                  >
                    {isSaving ? 'Saving...' : editingId ? 'Update' : 'Create'}
                  </button>
                </div>
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Delete confirmation */}
      {deleteConfirm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/30 backdrop-blur-sm">
          <div className="bg-white rounded-xl p-5 shadow-xl max-w-sm w-full mx-4">
            <h3 className="text-sm font-semibold text-[#09090B]">Delete logo?</h3>
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
