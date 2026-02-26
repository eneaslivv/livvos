import React, { useState, useMemo, useEffect, useRef } from 'react';
import { Icons } from '../ui/Icons';
import { SlidePanel } from '../ui/SlidePanel';
import { useSupabase } from '../../hooks/useSupabase';
import { useAuth } from '../../hooks/useAuth';

// ─── Types ────────────────────────────────────────────────────────
interface PasswordEntry {
    id: string;
    title: string;
    username: string;
    password_encrypted: string;
    url: string;
    category: string;
    notes: string;
    visibility: 'private' | 'team' | 'role';
    allowed_roles: string[];
    created_by: string;
    owner_id?: string;
    created_at: string;
    updated_at: string;
}

const CATEGORIES = [
    { id: 'general', label: 'General', color: 'bg-zinc-100 text-zinc-600 dark:bg-zinc-800 dark:text-zinc-400' },
    { id: 'social', label: 'Social', color: 'bg-blue-50 text-blue-600 dark:bg-blue-500/10 dark:text-blue-400' },
    { id: 'hosting', label: 'Hosting', color: 'bg-violet-50 text-violet-600 dark:bg-violet-500/10 dark:text-violet-400' },
    { id: 'banking', label: 'Bancaria', color: 'bg-emerald-50 text-emerald-600 dark:bg-emerald-500/10 dark:text-emerald-400' },
    { id: 'email', label: 'Email', color: 'bg-amber-50 text-amber-600 dark:bg-amber-500/10 dark:text-amber-400' },
    { id: 'dev', label: 'Dev / API', color: 'bg-rose-50 text-rose-600 dark:bg-rose-500/10 dark:text-rose-400' },
    { id: 'client', label: 'Cliente', color: 'bg-orange-50 text-orange-600 dark:bg-orange-500/10 dark:text-orange-400' },
];

const VISIBILITY_OPTIONS = [
    { id: 'private', label: 'Solo yo', icon: Icons.Lock },
    { id: 'team', label: 'Todo el equipo', icon: Icons.Users },
    { id: 'role', label: 'Roles específicos', icon: Icons.Shield },
];

// ─── Component ────────────────────────────────────────────────────

export const PasswordsPanel: React.FC = () => {
    const { data: passwords, add, update, remove, loading, error: fetchError } = useSupabase<PasswordEntry>('passwords');
    const { user } = useAuth();

    // Loading timeout — after 4s, show content regardless to avoid infinite spinner
    const [loadingTimedOut, setLoadingTimedOut] = useState(false);
    const loadingStartRef = useRef(Date.now());

    useEffect(() => {
        if (loading) {
            const elapsed = Date.now() - loadingStartRef.current;
            const remaining = Math.max(0, 4000 - elapsed);
            const timer = setTimeout(() => setLoadingTimedOut(true), remaining);
            return () => clearTimeout(timer);
        }
        loadingStartRef.current = Date.now();
        setLoadingTimedOut(false);
    }, [loading]);

    const isActuallyLoading = loading && !loadingTimedOut;

    // UI State
    const [search, setSearch] = useState('');
    const [categoryFilter, setCategoryFilter] = useState('all');
    const [visiblePasswords, setVisiblePasswords] = useState<Set<string>>(new Set());
    const [copiedId, setCopiedId] = useState<string | null>(null);

    // Form state
    const [isFormOpen, setIsFormOpen] = useState(false);
    const [editingId, setEditingId] = useState<string | null>(null);
    const [formError, setFormError] = useState<string | null>(null);
    const [isSubmitting, setIsSubmitting] = useState(false);
    const [form, setForm] = useState({
        title: '',
        username: '',
        password_encrypted: '',
        url: '',
        category: 'general',
        notes: '',
        visibility: 'private' as 'private' | 'team' | 'role',
        allowed_roles: [] as string[],
    });

    // ─── Filter passwords by access (RLS handles server-side, this is UI-only) ───
    const accessiblePasswords = useMemo(() => {
        return passwords.filter((p) => {
            if (p.created_by === user?.id) return true;
            if (p.visibility === 'team') return true;
            if (p.visibility === 'role') return true; // RLS handles role access server-side
            return false;
        });
    }, [passwords, user?.id]);

    const filteredPasswords = useMemo(() => {
        let result = accessiblePasswords;
        if (categoryFilter !== 'all') {
            result = result.filter(p => p.category === categoryFilter);
        }
        if (search) {
            const q = search.toLowerCase();
            result = result.filter(p =>
                p.title.toLowerCase().includes(q) ||
                p.username.toLowerCase().includes(q) ||
                p.url.toLowerCase().includes(q)
            );
        }
        return result.sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());
    }, [accessiblePasswords, categoryFilter, search]);

    // ─── Handlers ────────────────────────────────────────────────
    const togglePasswordVisibility = (id: string) => {
        setVisiblePasswords(prev => {
            const next = new Set(prev);
            if (next.has(id)) next.delete(id);
            else next.add(id);
            return next;
        });
    };

    const copyToClipboard = async (text: string, id: string) => {
        try {
            await navigator.clipboard.writeText(text);
            setCopiedId(id);
            setTimeout(() => setCopiedId(null), 2000);
        } catch {
            // fallback
        }
    };

    const resetForm = () => {
        setForm({ title: '', username: '', password_encrypted: '', url: '', category: 'general', notes: '', visibility: 'private', allowed_roles: [] });
        setEditingId(null);
        setFormError(null);
    };

    const openNewForm = () => {
        resetForm();
        setIsFormOpen(true);
    };

    const openEditForm = (p: PasswordEntry) => {
        if (p.created_by !== user?.id) return; // only creator can edit
        setForm({
            title: p.title,
            username: p.username,
            password_encrypted: p.password_encrypted,
            url: p.url,
            category: p.category,
            notes: p.notes,
            visibility: p.visibility,
            allowed_roles: p.allowed_roles || [],
        });
        setEditingId(p.id);
        setFormError(null);
        setIsFormOpen(true);
    };

    const handleSubmit = async () => {
        if (!form.title.trim()) { setFormError('Ingresá un título.'); return; }
        if (!form.password_encrypted.trim()) { setFormError('Ingresá la contraseña.'); return; }

        setIsSubmitting(true);
        setFormError(null);

        try {
            const data = {
                title: form.title.trim(),
                username: form.username.trim(),
                password_encrypted: form.password_encrypted,
                url: form.url.trim(),
                category: form.category,
                notes: form.notes.trim(),
                visibility: form.visibility,
                allowed_roles: form.visibility === 'role' ? form.allowed_roles : [],
            };

            if (editingId) {
                await update(editingId, data);
            } else {
                await add({ ...data, created_by: user?.id } as any);
            }
            setIsFormOpen(false);
            resetForm();
        } catch (err: any) {
            setFormError(err.message || 'Error al guardar.');
        } finally {
            setIsSubmitting(false);
        }
    };

    const handleDelete = async (id: string) => {
        if (!confirm('¿Eliminar esta contraseña?')) return;
        try {
            await remove(id);
        } catch (err) {
            console.error('Error deleting password:', err);
        }
    };

    const getCategoryInfo = (id: string) => CATEGORIES.find(c => c.id === id) || CATEGORIES[0];
    const getVisibilityInfo = (v: string) => VISIBILITY_OPTIONS.find(o => o.id === v) || VISIBILITY_OPTIONS[0];

    // ─── Render ──────────────────────────────────────────────────
    return (
        <>
            {/* Search & Actions */}
            <div className="flex flex-col sm:flex-row gap-3 mb-5">
                <div className="relative flex-1">
                    <Icons.Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-zinc-400" />
                    <input
                        type="text"
                        value={search}
                        onChange={e => setSearch(e.target.value)}
                        placeholder="Buscar por título, usuario o URL..."
                        className="w-full pl-9 pr-4 py-2.5 text-xs bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-xl focus:outline-none focus:ring-2 focus:ring-zinc-900/10 dark:focus:ring-white/10 transition-all"
                    />
                </div>
                <div className="flex gap-2">
                    <select
                        value={categoryFilter}
                        onChange={e => setCategoryFilter(e.target.value)}
                        className="px-3 py-2 text-xs border border-zinc-200 dark:border-zinc-700 rounded-xl bg-white dark:bg-zinc-900 text-zinc-700 dark:text-zinc-300 focus:outline-none"
                    >
                        <option value="all">Todas las categorías</option>
                        {CATEGORIES.map(c => (
                            <option key={c.id} value={c.id}>{c.label}</option>
                        ))}
                    </select>
                    <button
                        onClick={openNewForm}
                        className="flex items-center gap-1.5 px-4 py-2 bg-zinc-900 dark:bg-white text-white dark:text-zinc-900 rounded-xl text-xs font-medium hover:opacity-90 transition-all shadow-sm"
                    >
                        <Icons.Plus size={14} />
                        <span>Nueva</span>
                    </button>
                </div>
            </div>

            {/* Passwords List */}
            {isActuallyLoading ? (
                <div className="flex flex-col items-center justify-center py-16 gap-2">
                    <div className="w-6 h-6 border-2 border-zinc-200 dark:border-zinc-800 border-t-zinc-900 dark:border-t-zinc-100 rounded-full animate-spin" />
                    <p className="text-zinc-400 text-[10px] font-medium uppercase tracking-wider">Cargando contraseñas...</p>
                </div>
            ) : fetchError ? (
                <div className="text-center py-16">
                    <div className="w-16 h-16 bg-amber-50 dark:bg-amber-500/10 rounded-2xl flex items-center justify-center mx-auto mb-5">
                        <Icons.AlertTriangle size={28} className="text-amber-500" />
                    </div>
                    <h3 className="text-base font-semibold text-zinc-900 dark:text-zinc-100 mb-1.5">No se pudo cargar</h3>
                    <p className="text-sm text-zinc-500 dark:text-zinc-400 max-w-sm mx-auto">
                        Es posible que la tabla de contraseñas no exista aún. Ejecutá la migración correspondiente.
                    </p>
                </div>
            ) : filteredPasswords.length === 0 ? (
                <div className="text-center py-16">
                    <div className="w-16 h-16 bg-zinc-100 dark:bg-zinc-800 rounded-2xl flex items-center justify-center mx-auto mb-5">
                        <Icons.Lock size={28} className="text-zinc-400 dark:text-zinc-500" />
                    </div>
                    <h3 className="text-base font-semibold text-zinc-900 dark:text-zinc-100 mb-1.5">
                        {search || categoryFilter !== 'all' ? 'Sin resultados' : 'Sin contraseñas'}
                    </h3>
                    <p className="text-sm text-zinc-500 dark:text-zinc-400 max-w-sm mx-auto">
                        {search || categoryFilter !== 'all'
                            ? 'Probá con otros filtros o términos de búsqueda.'
                            : 'Guardá tus credenciales de forma segura. Solo vos y los usuarios autorizados podrán verlas.'}
                    </p>
                </div>
            ) : (
                <div className="space-y-2">
                    {filteredPasswords.map(p => {
                        const cat = getCategoryInfo(p.category);
                        const vis = getVisibilityInfo(p.visibility);
                        const VisIcon = vis.icon;
                        const isVisible = visiblePasswords.has(p.id);
                        const isOwner = p.created_by === user?.id;
                        const isCopied = copiedId === p.id;

                        return (
                            <div
                                key={p.id}
                                className="group bg-white dark:bg-zinc-900 border border-zinc-100 dark:border-zinc-800 rounded-xl p-4 hover:border-zinc-300 dark:hover:border-zinc-600 transition-all"
                            >
                                <div className="flex items-start gap-4">
                                    {/* Icon */}
                                    <div className="w-10 h-10 rounded-xl bg-zinc-100 dark:bg-zinc-800 flex items-center justify-center flex-shrink-0">
                                        <Icons.Key size={18} className="text-zinc-500 dark:text-zinc-400" />
                                    </div>

                                    {/* Info */}
                                    <div className="flex-1 min-w-0">
                                        <div className="flex items-center gap-2 mb-1">
                                            <h4 className="text-sm font-semibold text-zinc-900 dark:text-zinc-100 truncate">{p.title}</h4>
                                            <span className={`inline-flex items-center px-1.5 py-0.5 rounded text-[9px] font-semibold uppercase tracking-wide ${cat.color}`}>
                                                {cat.label}
                                            </span>
                                            <span className="inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded text-[9px] font-medium text-zinc-400 bg-zinc-50 dark:bg-zinc-800">
                                                <VisIcon size={9} />
                                                {vis.label}
                                            </span>
                                        </div>

                                        {/* Username */}
                                        {p.username && (
                                            <p className="text-xs text-zinc-500 dark:text-zinc-400 mb-1.5 truncate">
                                                <span className="text-zinc-400 dark:text-zinc-500">Usuario:</span> {p.username}
                                            </p>
                                        )}

                                        {/* Password row */}
                                        <div className="flex items-center gap-2">
                                            <code className="text-xs font-mono bg-zinc-50 dark:bg-zinc-800 px-2 py-1 rounded border border-zinc-100 dark:border-zinc-700 text-zinc-700 dark:text-zinc-300 select-all">
                                                {isVisible ? p.password_encrypted : '••••••••••••'}
                                            </code>
                                            <button
                                                onClick={() => togglePasswordVisibility(p.id)}
                                                className="p-1 rounded text-zinc-400 hover:text-zinc-700 dark:hover:text-zinc-200 transition-colors"
                                                title={isVisible ? 'Ocultar' : 'Mostrar'}
                                            >
                                                {isVisible ? <Icons.EyeOff size={13} /> : <Icons.Eye size={13} />}
                                            </button>
                                            <button
                                                onClick={() => copyToClipboard(p.password_encrypted, p.id)}
                                                className={`p-1 rounded transition-colors ${isCopied ? 'text-emerald-500' : 'text-zinc-400 hover:text-zinc-700 dark:hover:text-zinc-200'}`}
                                                title="Copiar"
                                            >
                                                {isCopied ? <Icons.Check size={13} /> : <Icons.File size={13} />}
                                            </button>
                                        </div>

                                        {/* URL */}
                                        {p.url && (
                                            <a href={p.url} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 text-[10px] text-blue-500 hover:text-blue-600 mt-1.5 transition-colors">
                                                <Icons.External size={10} />
                                                {p.url.replace(/^https?:\/\//, '').split('/')[0]}
                                            </a>
                                        )}
                                    </div>

                                    {/* Actions */}
                                    {isOwner && (
                                        <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-all flex-shrink-0">
                                            <button
                                                onClick={() => openEditForm(p)}
                                                className="p-1.5 rounded-lg text-zinc-400 hover:text-zinc-700 dark:hover:text-zinc-200 hover:bg-zinc-100 dark:hover:bg-zinc-800 transition-all"
                                            >
                                                <Icons.Edit size={13} />
                                            </button>
                                            <button
                                                onClick={() => handleDelete(p.id)}
                                                className="p-1.5 rounded-lg text-zinc-400 hover:text-rose-500 hover:bg-rose-50 dark:hover:bg-rose-500/10 transition-all"
                                            >
                                                <Icons.Trash size={13} />
                                            </button>
                                        </div>
                                    )}
                                </div>
                            </div>
                        );
                    })}
                </div>
            )}

            {/* ─── Add/Edit Form SlidePanel ─────────────────────────── */}
            <SlidePanel
                isOpen={isFormOpen}
                onClose={() => { setIsFormOpen(false); resetForm(); }}
                title={editingId ? 'Editar Contraseña' : 'Nueva Contraseña'}
                size="md"
            >
                <div className="space-y-4 p-5">
                    {formError && (
                        <div className="p-3 bg-rose-50 dark:bg-rose-500/10 border border-rose-200 dark:border-rose-500/20 rounded-lg text-xs text-rose-600 dark:text-rose-400">
                            {formError}
                        </div>
                    )}

                    {/* Title */}
                    <div>
                        <label className="text-[11px] font-medium text-zinc-500 dark:text-zinc-400 uppercase tracking-wider mb-1.5 block">Título *</label>
                        <input
                            type="text"
                            value={form.title}
                            onChange={e => setForm(f => ({ ...f, title: e.target.value }))}
                            placeholder="Gmail trabajo, AWS Console..."
                            className="w-full px-3 py-2.5 text-sm border border-zinc-200 dark:border-zinc-700 rounded-lg bg-white dark:bg-zinc-900 text-zinc-900 dark:text-zinc-100 focus:outline-none focus:ring-2 focus:ring-zinc-900/10 dark:focus:ring-white/10"
                        />
                    </div>

                    {/* Username */}
                    <div>
                        <label className="text-[11px] font-medium text-zinc-500 dark:text-zinc-400 uppercase tracking-wider mb-1.5 block">Usuario / Email</label>
                        <input
                            type="text"
                            value={form.username}
                            onChange={e => setForm(f => ({ ...f, username: e.target.value }))}
                            placeholder="user@email.com"
                            className="w-full px-3 py-2.5 text-sm border border-zinc-200 dark:border-zinc-700 rounded-lg bg-white dark:bg-zinc-900 text-zinc-900 dark:text-zinc-100 focus:outline-none focus:ring-2 focus:ring-zinc-900/10 dark:focus:ring-white/10"
                        />
                    </div>

                    {/* Password */}
                    <div>
                        <label className="text-[11px] font-medium text-zinc-500 dark:text-zinc-400 uppercase tracking-wider mb-1.5 block">Contraseña *</label>
                        <input
                            type="password"
                            value={form.password_encrypted}
                            onChange={e => setForm(f => ({ ...f, password_encrypted: e.target.value }))}
                            placeholder="••••••••"
                            className="w-full px-3 py-2.5 text-sm border border-zinc-200 dark:border-zinc-700 rounded-lg bg-white dark:bg-zinc-900 text-zinc-900 dark:text-zinc-100 font-mono focus:outline-none focus:ring-2 focus:ring-zinc-900/10 dark:focus:ring-white/10"
                        />
                    </div>

                    {/* URL */}
                    <div>
                        <label className="text-[11px] font-medium text-zinc-500 dark:text-zinc-400 uppercase tracking-wider mb-1.5 block">URL</label>
                        <input
                            type="url"
                            value={form.url}
                            onChange={e => setForm(f => ({ ...f, url: e.target.value }))}
                            placeholder="https://..."
                            className="w-full px-3 py-2.5 text-sm border border-zinc-200 dark:border-zinc-700 rounded-lg bg-white dark:bg-zinc-900 text-zinc-900 dark:text-zinc-100 focus:outline-none focus:ring-2 focus:ring-zinc-900/10 dark:focus:ring-white/10"
                        />
                    </div>

                    {/* Category */}
                    <div>
                        <label className="text-[11px] font-medium text-zinc-500 dark:text-zinc-400 uppercase tracking-wider mb-1.5 block">Categoría</label>
                        <div className="flex flex-wrap gap-1.5">
                            {CATEGORIES.map(cat => (
                                <button
                                    key={cat.id}
                                    onClick={() => setForm(f => ({ ...f, category: cat.id }))}
                                    className={`px-2.5 py-1 rounded-lg text-[11px] font-medium transition-all border ${form.category === cat.id
                                        ? `${cat.color} border-current ring-1 ring-current/20`
                                        : 'border-zinc-200 dark:border-zinc-700 text-zinc-500 hover:border-zinc-300'
                                        }`}
                                >
                                    {cat.label}
                                </button>
                            ))}
                        </div>
                    </div>

                    {/* Visibility */}
                    <div>
                        <label className="text-[11px] font-medium text-zinc-500 dark:text-zinc-400 uppercase tracking-wider mb-1.5 block">Acceso</label>
                        <div className="space-y-1.5">
                            {VISIBILITY_OPTIONS.map(opt => {
                                const OptIcon = opt.icon;
                                return (
                                    <button
                                        key={opt.id}
                                        onClick={() => setForm(f => ({ ...f, visibility: opt.id as any }))}
                                        className={`w-full flex items-center gap-2.5 px-3 py-2.5 rounded-lg text-xs font-medium transition-all border ${form.visibility === opt.id
                                            ? 'border-zinc-900 dark:border-zinc-100 bg-zinc-900 dark:bg-zinc-100 text-white dark:text-zinc-900'
                                            : 'border-zinc-200 dark:border-zinc-700 text-zinc-600 dark:text-zinc-400 hover:border-zinc-300'
                                            }`}
                                    >
                                        <OptIcon size={14} />
                                        {opt.label}
                                    </button>
                                );
                            })}
                        </div>

                        {/* Role selector */}
                        {form.visibility === 'role' && (
                            <div className="mt-2 p-3 bg-zinc-50 dark:bg-zinc-800/50 rounded-lg">
                                <p className="text-[10px] text-zinc-400 mb-2 uppercase tracking-wider font-medium">Roles con acceso:</p>
                                <div className="flex flex-wrap gap-1.5">
                                    {['owner', 'admin', 'manager', 'member'].map(roleName => (
                                        <button
                                            key={roleName}
                                            onClick={() => {
                                                setForm(f => ({
                                                    ...f,
                                                    allowed_roles: f.allowed_roles.includes(roleName)
                                                        ? f.allowed_roles.filter(r => r !== roleName)
                                                        : [...f.allowed_roles, roleName]
                                                }));
                                            }}
                                            className={`px-2.5 py-1 rounded-lg text-[11px] font-medium transition-all border capitalize ${form.allowed_roles.includes(roleName)
                                                ? 'bg-violet-50 dark:bg-violet-500/10 text-violet-600 dark:text-violet-400 border-violet-200 dark:border-violet-500/30'
                                                : 'border-zinc-200 dark:border-zinc-700 text-zinc-500 hover:border-zinc-300'
                                                }`}
                                        >
                                            {roleName}
                                        </button>
                                    ))}
                                </div>
                            </div>
                        )}
                    </div>

                    {/* Notes */}
                    <div>
                        <label className="text-[11px] font-medium text-zinc-500 dark:text-zinc-400 uppercase tracking-wider mb-1.5 block">Notas</label>
                        <textarea
                            value={form.notes}
                            onChange={e => setForm(f => ({ ...f, notes: e.target.value }))}
                            placeholder="Notas adicionales..."
                            rows={3}
                            className="w-full px-3 py-2.5 text-sm border border-zinc-200 dark:border-zinc-700 rounded-lg bg-white dark:bg-zinc-900 text-zinc-900 dark:text-zinc-100 focus:outline-none focus:ring-2 focus:ring-zinc-900/10 dark:focus:ring-white/10 resize-none"
                        />
                    </div>

                    {/* Submit */}
                    <div className="flex gap-2 pt-2">
                        <button
                            onClick={handleSubmit}
                            disabled={isSubmitting}
                            className="flex-1 py-2.5 bg-zinc-900 dark:bg-white text-white dark:text-zinc-900 rounded-lg text-sm font-medium hover:opacity-90 transition-all disabled:opacity-50 shadow-sm"
                        >
                            {isSubmitting ? 'Guardando...' : editingId ? 'Actualizar' : 'Guardar'}
                        </button>
                        <button
                            onClick={() => { setIsFormOpen(false); resetForm(); }}
                            className="px-4 py-2.5 border border-zinc-200 dark:border-zinc-700 rounded-lg text-sm font-medium text-zinc-600 dark:text-zinc-400 hover:bg-zinc-50 dark:hover:bg-zinc-800 transition-all"
                        >
                            Cancelar
                        </button>
                    </div>
                </div>
            </SlidePanel>
        </>
    );
};
