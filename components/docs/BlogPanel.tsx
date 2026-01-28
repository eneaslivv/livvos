import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { supabase } from '../../lib/supabase';
import { generateBlogFromAI } from '../../lib/ai';
import { useTenant } from '../../context/TenantContext';

type BlogStatus = 'draft' | 'published';

interface BlogPost {
  id: string;
  tenant_id: string;
  title: string;
  slug: string;
  status: BlogStatus;
  excerpt?: string | null;
  content?: string | null;
  language?: string | null;
  cover_url?: string | null;
  tags?: string[] | null;
  published_at?: string | null;
  created_at: string;
  updated_at: string;
}

const slugify = (input: string) =>
  input
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/(^-|-$)+/g, '');

export const BlogPanel: React.FC = () => {
  const { currentTenant } = useTenant();
  const [posts, setPosts] = useState<BlogPost[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [draftInput, setDraftInput] = useState('');

  const selected = useMemo(() => posts.find(p => p.id === selectedId) || null, [posts, selectedId]);

  const fetchPosts = useCallback(async () => {
    setIsLoading(true);
    const { data, error } = await supabase
      .from('blog_posts')
      .select('*')
      .order('created_at', { ascending: false });
    if (!error) setPosts(data || []);
    setIsLoading(false);
  }, []);

  useEffect(() => {
    fetchPosts();
  }, [fetchPosts]);

  const createPost = async () => {
    if (!currentTenant?.id || !draftInput.trim()) return;
    setIsSaving(true);
    try {
      const titleSeed = draftInput.split('\n')[0].slice(0, 60) || 'New Blog';
      const slug = slugify(titleSeed);
      const { data, error } = await supabase
        .from('blog_posts')
        .insert({
          tenant_id: currentTenant.id,
          title: titleSeed,
          slug,
          status: 'draft',
          language: /\b(el|la|los|las|que|para|con)\b/i.test(draftInput) ? 'es' : 'en'
        })
        .select()
        .single();
      if (error) throw error;
      setPosts(prev => [data as BlogPost, ...prev]);
      setSelectedId(data.id);
      setDraftInput('');
    } finally {
      setIsSaving(false);
    }
  };

  const updatePost = async (updates: Partial<BlogPost>) => {
    if (!selected) return;
    setIsSaving(true);
    try {
      const { data, error } = await supabase
        .from('blog_posts')
        .update({ ...updates, updated_at: new Date().toISOString() })
        .eq('id', selected.id)
        .select()
        .single();
      if (error) throw error;
      setPosts(prev => prev.map(p => (p.id === selected.id ? (data as BlogPost) : p)));
    } finally {
      setIsSaving(false);
    }
  };

  const generateWithAI = async () => {
    if (!selected) return;
    setIsSaving(true);
    try {
      const prompt = `Write a blog post based on this brief:\n${draftInput || selected.excerpt || ''}`;
      const result = await generateBlogFromAI(prompt);
      await updatePost({
        title: result.title,
        excerpt: result.excerpt,
        content: result.content,
        language: result.language || selected.language || 'en',
        slug: slugify(result.title)
      });
    } finally {
      setIsSaving(false);
    }
  };

  const publishPost = async () => {
    if (!selected) return;
    await updatePost({ status: 'published', published_at: new Date().toISOString() });
  };

  return (
    <div className="grid grid-cols-1 xl:grid-cols-12 gap-6">
      <div className="xl:col-span-4 space-y-4">
        <div className="flex items-center justify-between">
          <div>
            <h3 className="text-lg font-semibold text-zinc-900 dark:text-zinc-100">Blog</h3>
            <p className="text-xs text-zinc-500">Genera contenido con IA y publícalo.</p>
          </div>
          <button
            onClick={createPost}
            className="px-3 py-2 rounded-lg bg-zinc-900 text-white text-xs font-bold uppercase tracking-wide"
          >
            Nuevo
          </button>
        </div>

        <textarea
          value={draftInput}
          onChange={(e) => setDraftInput(e.target.value)}
          placeholder="Brief o ideas para el blog"
          className="w-full min-h-[120px] px-3 py-2 rounded-lg border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-950 text-sm"
        />

        <div className="space-y-2">
          {isLoading && <div className="text-xs text-zinc-500">Cargando posts...</div>}
          {posts.map(post => (
            <button
              key={post.id}
              onClick={() => setSelectedId(post.id)}
              className={`w-full text-left border rounded-xl p-3 transition-all ${
                selectedId === post.id
                  ? 'border-indigo-400 bg-indigo-50/50 dark:border-indigo-700 dark:bg-indigo-900/20'
                  : 'border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900'
              }`}
            >
              <div className="text-sm font-semibold text-zinc-900 dark:text-zinc-100">{post.title}</div>
              <div className="text-[11px] text-zinc-500">{post.status}</div>
            </button>
          ))}
        </div>
      </div>

      <div className="xl:col-span-8">
        {selected ? (
          <div className="bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-2xl p-6 space-y-4">
            <input
              value={selected.title}
              onChange={(e) => updatePost({ title: e.target.value })}
              className="text-2xl font-bold bg-transparent border-b border-zinc-200 dark:border-zinc-700 focus:outline-none w-full"
            />
            <textarea
              value={selected.excerpt || ''}
              onChange={(e) => updatePost({ excerpt: e.target.value })}
              placeholder="Resumen"
              className="w-full min-h-[80px] p-3 rounded-xl border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-950 text-sm"
            />
            <textarea
              value={selected.content || ''}
              onChange={(e) => updatePost({ content: e.target.value })}
              placeholder="Contenido del blog"
              className="w-full min-h-[240px] p-3 rounded-xl border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-950 text-sm"
            />
            <div className="flex flex-wrap gap-2">
              <button
                onClick={generateWithAI}
                className="px-3 py-2 rounded-lg bg-zinc-900 text-white text-xs font-semibold"
              >
                Generar con IA
              </button>
              <button
                onClick={publishPost}
                className="px-3 py-2 rounded-lg border border-emerald-200 text-emerald-700 text-xs font-semibold"
              >
                Publicar
              </button>
            </div>
          </div>
        ) : (
          <div className="h-full flex items-center justify-center text-zinc-500 border border-dashed border-zinc-200 dark:border-zinc-800 rounded-2xl">
            Selecciona un post para editarlo
          </div>
        )}
      </div>
    </div>
  );
};
