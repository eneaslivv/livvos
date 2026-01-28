import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { supabase } from '../../lib/supabase';
import { useRBAC } from '../../context/RBACContext';
import { useTenant } from '../../context/TenantContext';

type BlogStatus = 'draft' | 'published';

interface PortfolioItem {
  id: string;
  title: string;
  url: string;
  cover_url?: string | null;
  project_type?: string | null;
  tags?: string[] | null;
  summary?: string | null;
  highlights?: string[] | null;
  tech_stack?: string[] | null;
  gallery?: string[] | null;
  is_featured?: boolean | null;
  sort_order?: number | null;
}

interface BlogPost {
  id: string;
  title: string;
  slug: string;
  status: BlogStatus;
  excerpt?: string | null;
  content?: string | null;
  language?: string | null;
  cover_url?: string | null;
  tags?: string[] | null;
  published_at?: string | null;
}

const PROJECT_TYPES = [
  'web',
  'branding',
  'saas',
  'ecommerce',
  'automation',
  'animation',
  'content'
];

const slugify = (input: string) =>
  input
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/(^-|-$)+/g, '');

export const ContentManagement: React.FC = () => {
  const { isAdmin } = useRBAC();
  const { currentTenant } = useTenant();
  const [portfolio, setPortfolio] = useState<PortfolioItem[]>([]);
  const [posts, setPosts] = useState<BlogPost[]>([]);
  const [selectedPortfolioId, setSelectedPortfolioId] = useState<string | null>(null);
  const [selectedPostId, setSelectedPostId] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);

  const [portfolioForm, setPortfolioForm] = useState({
    title: '',
    url: '',
    cover_url: '',
    project_type: 'web',
    tags: '',
    summary: '',
    highlights: '',
    tech_stack: '',
    gallery: '',
    is_featured: false,
    sort_order: '0'
  });

  const [postForm, setPostForm] = useState({
    title: '',
    slug: '',
    status: 'draft' as BlogStatus,
    excerpt: '',
    content: '',
    language: 'en',
    cover_url: '',
    tags: ''
  });

  const selectedPortfolio = useMemo(
    () => portfolio.find((p) => p.id === selectedPortfolioId) || null,
    [portfolio, selectedPortfolioId]
  );

  const selectedPost = useMemo(
    () => posts.find((p) => p.id === selectedPostId) || null,
    [posts, selectedPostId]
  );

  const fetchContent = useCallback(async () => {
    setIsLoading(true);
    const [portfolioRes, blogRes] = await Promise.all([
      supabase.from('portfolio_items').select('*').order('sort_order', { ascending: true }).order('created_at', { ascending: false }),
      supabase.from('blog_posts').select('*').order('created_at', { ascending: false })
    ]);

    if (!portfolioRes.error) setPortfolio(portfolioRes.data || []);
    if (!blogRes.error) setPosts(blogRes.data || []);
    setIsLoading(false);
  }, []);

  useEffect(() => {
    fetchContent();
  }, [fetchContent]);

  useEffect(() => {
    if (selectedPortfolio) {
      setPortfolioForm({
        title: selectedPortfolio.title || '',
        url: selectedPortfolio.url || '',
        cover_url: selectedPortfolio.cover_url || '',
        project_type: selectedPortfolio.project_type || 'web',
        tags: (selectedPortfolio.tags || []).join(', '),
        summary: selectedPortfolio.summary || '',
        highlights: (selectedPortfolio.highlights || []).join(', '),
        tech_stack: (selectedPortfolio.tech_stack || []).join(', '),
        gallery: (selectedPortfolio.gallery || []).join(', '),
        is_featured: Boolean(selectedPortfolio.is_featured),
        sort_order: String(selectedPortfolio.sort_order || 0)
      });
    }
  }, [selectedPortfolio]);

  useEffect(() => {
    if (selectedPost) {
      setPostForm({
        title: selectedPost.title || '',
        slug: selectedPost.slug || '',
        status: selectedPost.status,
        excerpt: selectedPost.excerpt || '',
        content: selectedPost.content || '',
        language: selectedPost.language || 'en',
        cover_url: selectedPost.cover_url || '',
        tags: (selectedPost.tags || []).join(', ')
      });
    }
  }, [selectedPost]);

  const resetPortfolioForm = () => {
    setSelectedPortfolioId(null);
    setPortfolioForm({
      title: '',
      url: '',
      cover_url: '',
      project_type: 'web',
      tags: '',
      summary: '',
      highlights: '',
      tech_stack: '',
      gallery: '',
      is_featured: false,
      sort_order: '0'
    });
  };

  const resetPostForm = () => {
    setSelectedPostId(null);
    setPostForm({
      title: '',
      slug: '',
      status: 'draft',
      excerpt: '',
      content: '',
      language: 'en',
      cover_url: '',
      tags: ''
    });
  };

  const savePortfolio = async () => {
    if (!isAdmin || !currentTenant?.id || !portfolioForm.title.trim() || !portfolioForm.url.trim()) return;
    setIsSaving(true);
    const payload = {
      tenant_id: currentTenant.id,
      title: portfolioForm.title.trim(),
      url: portfolioForm.url.trim(),
      cover_url: portfolioForm.cover_url || null,
      project_type: portfolioForm.project_type,
      tags: portfolioForm.tags ? portfolioForm.tags.split(',').map(t => t.trim()).filter(Boolean) : [],
      summary: portfolioForm.summary || null,
      highlights: portfolioForm.highlights ? portfolioForm.highlights.split(',').map(h => h.trim()).filter(Boolean) : [],
      tech_stack: portfolioForm.tech_stack ? portfolioForm.tech_stack.split(',').map(s => s.trim()).filter(Boolean) : [],
      gallery: portfolioForm.gallery ? portfolioForm.gallery.split(',').map(g => g.trim()).filter(Boolean) : [],
      is_featured: portfolioForm.is_featured,
      sort_order: Number(portfolioForm.sort_order) || 0
    };

    try {
      if (selectedPortfolioId) {
        const { data, error } = await supabase
          .from('portfolio_items')
          .update(payload)
          .eq('id', selectedPortfolioId)
          .select()
          .single();
        if (!error && data) {
          setPortfolio(prev => prev.map(item => (item.id === selectedPortfolioId ? data : item)));
        }
      } else {
        const { data, error } = await supabase
          .from('portfolio_items')
          .insert(payload)
          .select()
          .single();
        if (!error && data) {
          setPortfolio(prev => [data, ...prev]);
        }
      }
      resetPortfolioForm();
    } finally {
      setIsSaving(false);
    }
  };

  const savePost = async () => {
    if (!isAdmin || !currentTenant?.id || !postForm.title.trim()) return;
    setIsSaving(true);
    const payload = {
      tenant_id: currentTenant.id,
      title: postForm.title.trim(),
      slug: postForm.slug ? slugify(postForm.slug) : slugify(postForm.title),
      status: postForm.status,
      excerpt: postForm.excerpt || null,
      content: postForm.content || null,
      language: postForm.language,
      cover_url: postForm.cover_url || null,
      tags: postForm.tags ? postForm.tags.split(',').map(t => t.trim()).filter(Boolean) : [],
      published_at: postForm.status === 'published' ? new Date().toISOString() : null
    };

    try {
      if (selectedPostId) {
        const { data, error } = await supabase
          .from('blog_posts')
          .update(payload)
          .eq('id', selectedPostId)
          .select()
          .single();
        if (!error && data) {
          setPosts(prev => prev.map(item => (item.id === selectedPostId ? data : item)));
        }
      } else {
        const { data, error } = await supabase
          .from('blog_posts')
          .insert(payload)
          .select()
          .single();
        if (!error && data) {
          setPosts(prev => [data, ...prev]);
        }
      }
      resetPostForm();
    } finally {
      setIsSaving(false);
    }
  };

  if (!isAdmin) {
    return (
      <div className="text-sm text-zinc-500">Only admins can manage content.</div>
    );
  }

  return (
    <div className="space-y-8">
      <div>
        <h3 className="text-lg font-semibold text-zinc-900 dark:text-zinc-100">Portfolio CMS</h3>
        <p className="text-sm text-zinc-500">Cargá proyectos para el sitio y propuestas.</p>
        {isLoading && <div className="text-xs text-zinc-400 mt-2">Cargando contenido...</div>}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-3 mt-4">
          {portfolio.map(item => (
            <button
              key={item.id}
              onClick={() => setSelectedPortfolioId(item.id)}
              className={`text-left border rounded-xl p-3 ${selectedPortfolioId === item.id ? 'border-indigo-400 bg-indigo-50/40' : 'border-zinc-200 bg-white'}`}
            >
              <div className="text-sm font-semibold text-zinc-900">{item.title}</div>
              <div className="text-[11px] text-zinc-500">{item.project_type || 'general'}</div>
            </button>
          ))}
        </div>
        <div className="mt-4 grid grid-cols-1 md:grid-cols-2 gap-3">
          <input value={portfolioForm.title} onChange={(e) => setPortfolioForm(prev => ({ ...prev, title: e.target.value }))} placeholder="Título" className="px-3 py-2 rounded-lg border border-zinc-200" />
          <input value={portfolioForm.url} onChange={(e) => setPortfolioForm(prev => ({ ...prev, url: e.target.value }))} placeholder="URL" className="px-3 py-2 rounded-lg border border-zinc-200" />
          <input value={portfolioForm.cover_url} onChange={(e) => setPortfolioForm(prev => ({ ...prev, cover_url: e.target.value }))} placeholder="Cover URL" className="px-3 py-2 rounded-lg border border-zinc-200" />
          <select value={portfolioForm.project_type} onChange={(e) => setPortfolioForm(prev => ({ ...prev, project_type: e.target.value }))} className="px-3 py-2 rounded-lg border border-zinc-200">
            {PROJECT_TYPES.map(type => (<option key={type} value={type}>{type}</option>))}
          </select>
          <input value={portfolioForm.tags} onChange={(e) => setPortfolioForm(prev => ({ ...prev, tags: e.target.value }))} placeholder="Tags (coma separada)" className="px-3 py-2 rounded-lg border border-zinc-200" />
          <input value={portfolioForm.summary} onChange={(e) => setPortfolioForm(prev => ({ ...prev, summary: e.target.value }))} placeholder="Resumen" className="px-3 py-2 rounded-lg border border-zinc-200" />
          <input value={portfolioForm.highlights} onChange={(e) => setPortfolioForm(prev => ({ ...prev, highlights: e.target.value }))} placeholder="Highlights (coma separada)" className="px-3 py-2 rounded-lg border border-zinc-200" />
          <input value={portfolioForm.tech_stack} onChange={(e) => setPortfolioForm(prev => ({ ...prev, tech_stack: e.target.value }))} placeholder="Tech stack (coma separada)" className="px-3 py-2 rounded-lg border border-zinc-200" />
          <input value={portfolioForm.gallery} onChange={(e) => setPortfolioForm(prev => ({ ...prev, gallery: e.target.value }))} placeholder="Gallery URLs (coma separada)" className="px-3 py-2 rounded-lg border border-zinc-200" />
          <input value={portfolioForm.sort_order} onChange={(e) => setPortfolioForm(prev => ({ ...prev, sort_order: e.target.value }))} placeholder="Orden" className="px-3 py-2 rounded-lg border border-zinc-200" />
          <label className="flex items-center gap-2 text-xs">
            <input type="checkbox" checked={portfolioForm.is_featured} onChange={(e) => setPortfolioForm(prev => ({ ...prev, is_featured: e.target.checked }))} />
            Destacado
          </label>
        </div>
        <div className="mt-3 flex gap-2">
          <button onClick={savePortfolio} disabled={isSaving} className="px-4 py-2 rounded-lg bg-zinc-900 text-white text-sm">Guardar</button>
          <button onClick={resetPortfolioForm} className="px-4 py-2 rounded-lg border border-zinc-200 text-sm">Nuevo</button>
        </div>
      </div>

      <div>
        <h3 className="text-lg font-semibold text-zinc-900 dark:text-zinc-100">Blog CMS</h3>
        <p className="text-sm text-zinc-500">Crea y publica posts.</p>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-3 mt-4">
          {posts.map(item => (
            <button
              key={item.id}
              onClick={() => setSelectedPostId(item.id)}
              className={`text-left border rounded-xl p-3 ${selectedPostId === item.id ? 'border-indigo-400 bg-indigo-50/40' : 'border-zinc-200 bg-white'}`}
            >
              <div className="text-sm font-semibold text-zinc-900">{item.title}</div>
              <div className="text-[11px] text-zinc-500">{item.status}</div>
            </button>
          ))}
        </div>
        <div className="mt-4 grid grid-cols-1 md:grid-cols-2 gap-3">
          <input value={postForm.title} onChange={(e) => setPostForm(prev => ({ ...prev, title: e.target.value }))} placeholder="Título" className="px-3 py-2 rounded-lg border border-zinc-200" />
          <input value={postForm.slug} onChange={(e) => setPostForm(prev => ({ ...prev, slug: e.target.value }))} placeholder="Slug" className="px-3 py-2 rounded-lg border border-zinc-200" />
          <textarea value={postForm.excerpt} onChange={(e) => setPostForm(prev => ({ ...prev, excerpt: e.target.value }))} placeholder="Excerpt" className="px-3 py-2 rounded-lg border border-zinc-200 min-h-[80px]" />
          <textarea value={postForm.content} onChange={(e) => setPostForm(prev => ({ ...prev, content: e.target.value }))} placeholder="Contenido" className="px-3 py-2 rounded-lg border border-zinc-200 min-h-[120px]" />
          <input value={postForm.cover_url} onChange={(e) => setPostForm(prev => ({ ...prev, cover_url: e.target.value }))} placeholder="Cover URL" className="px-3 py-2 rounded-lg border border-zinc-200" />
          <input value={postForm.tags} onChange={(e) => setPostForm(prev => ({ ...prev, tags: e.target.value }))} placeholder="Tags (coma separada)" className="px-3 py-2 rounded-lg border border-zinc-200" />
          <select value={postForm.status} onChange={(e) => setPostForm(prev => ({ ...prev, status: e.target.value as BlogStatus }))} className="px-3 py-2 rounded-lg border border-zinc-200">
            <option value="draft">Draft</option>
            <option value="published">Published</option>
          </select>
          <select value={postForm.language} onChange={(e) => setPostForm(prev => ({ ...prev, language: e.target.value }))} className="px-3 py-2 rounded-lg border border-zinc-200">
            <option value="en">English</option>
            <option value="es">Español</option>
          </select>
        </div>
        <div className="mt-3 flex gap-2">
          <button onClick={savePost} disabled={isSaving} className="px-4 py-2 rounded-lg bg-zinc-900 text-white text-sm">Guardar</button>
          <button onClick={resetPostForm} className="px-4 py-2 rounded-lg border border-zinc-200 text-sm">Nuevo</button>
        </div>
      </div>
    </div>
  );
};
