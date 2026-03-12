import { useCallback, useEffect, useState } from 'react';
import { supabase } from '../lib/supabase';
import { useTenant } from '../context/TenantContext';
import { useRBAC } from '../context/RBACContext';
import type {
  CmsPortfolioItem,
  CmsProduct,
  CmsBlogPost,
  CmsClientLogo,
  PortfolioMedia,
} from '../types/cms';

const slugify = (input: string) =>
  input
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/(^-|-$)+/g, '');

export const useCmsContent = () => {
  const { currentTenant } = useTenant();
  const { isAdmin } = useRBAC();
  const tenantId = currentTenant?.id;

  const [portfolio, setPortfolio] = useState<CmsPortfolioItem[]>([]);
  const [products, setProducts] = useState<CmsProduct[]>([]);
  const [posts, setPosts] = useState<CmsBlogPost[]>([]);
  const [clientLogos, setClientLogos] = useState<CmsClientLogo[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);

  // ─── Fetch all ────────────────────────────────────────────
  const fetchAll = useCallback(async () => {
    if (!tenantId) return;
    setIsLoading(true);

    const [portfolioRes, productsRes, blogRes, logosRes] = await Promise.all([
      supabase
        .from('portfolio_items')
        .select('*')
        .eq('tenant_id', tenantId)
        .order('display_order', { ascending: true })
        .order('created_at', { ascending: false }),
      supabase
        .from('products')
        .select('*')
        .eq('tenant_id', tenantId)
        .order('display_order', { ascending: true })
        .order('created_at', { ascending: false }),
      supabase
        .from('blog_posts')
        .select('*')
        .eq('tenant_id', tenantId)
        .order('created_at', { ascending: false }),
      supabase
        .from('client_logos')
        .select('*')
        .eq('tenant_id', tenantId)
        .order('sort_order', { ascending: true }),
    ]);

    if (!portfolioRes.error) setPortfolio(portfolioRes.data || []);
    if (!productsRes.error) setProducts(productsRes.data || []);
    if (!blogRes.error) setPosts(blogRes.data || []);
    if (!logosRes.error) setClientLogos(logosRes.data || []);
    setIsLoading(false);
  }, [tenantId]);

  useEffect(() => {
    fetchAll();
  }, [fetchAll]);

  // ─── Portfolio CRUD ───────────────────────────────────────
  const savePortfolio = async (
    data: Partial<CmsPortfolioItem>,
    id?: string
  ): Promise<CmsPortfolioItem | null> => {
    if (!isAdmin || !tenantId) return null;
    setIsSaving(true);
    const payload = {
      ...data,
      tenant_id: tenantId,
      slug: data.slug || slugify(data.title || ''),
      updated_at: new Date().toISOString(),
    };

    try {
      if (id) {
        const { data: updated, error } = await supabase
          .from('portfolio_items')
          .update(payload)
          .eq('id', id)
          .select()
          .single();
        if (!error && updated) {
          setPortfolio((prev) =>
            prev.map((item) => (item.id === id ? updated : item))
          );
          return updated;
        }
      } else {
        const { data: created, error } = await supabase
          .from('portfolio_items')
          .insert(payload)
          .select()
          .single();
        if (!error && created) {
          setPortfolio((prev) => [created, ...prev]);
          return created;
        }
      }
      return null;
    } finally {
      setIsSaving(false);
    }
  };

  const deletePortfolio = async (id: string) => {
    if (!isAdmin) return;
    const { error } = await supabase
      .from('portfolio_items')
      .delete()
      .eq('id', id);
    if (!error) {
      setPortfolio((prev) => prev.filter((item) => item.id !== id));
    }
  };

  // ─── Products CRUD ────────────────────────────────────────
  const saveProduct = async (
    data: Partial<CmsProduct>,
    id?: string
  ): Promise<CmsProduct | null> => {
    if (!isAdmin || !tenantId) return null;
    setIsSaving(true);
    const payload = {
      ...data,
      tenant_id: tenantId,
      slug: data.slug || slugify(data.name || ''),
      updated_at: new Date().toISOString(),
    };

    try {
      if (id) {
        const { data: updated, error } = await supabase
          .from('products')
          .update(payload)
          .eq('id', id)
          .select()
          .single();
        if (!error && updated) {
          setProducts((prev) =>
            prev.map((item) => (item.id === id ? updated : item))
          );
          return updated;
        }
      } else {
        const { data: created, error } = await supabase
          .from('products')
          .insert(payload)
          .select()
          .single();
        if (!error && created) {
          setProducts((prev) => [created, ...prev]);
          return created;
        }
      }
      return null;
    } finally {
      setIsSaving(false);
    }
  };

  const deleteProduct = async (id: string) => {
    if (!isAdmin) return;
    const { error } = await supabase.from('products').delete().eq('id', id);
    if (!error) {
      setProducts((prev) => prev.filter((item) => item.id !== id));
    }
  };

  // ─── Blog CRUD ────────────────────────────────────────────
  const savePost = async (
    data: Partial<CmsBlogPost>,
    id?: string
  ): Promise<CmsBlogPost | null> => {
    if (!isAdmin || !tenantId) return null;
    setIsSaving(true);
    const payload = {
      ...data,
      tenant_id: tenantId,
      slug: data.slug || slugify(data.title || ''),
      published_at:
        data.status === 'published' ? new Date().toISOString() : null,
      updated_at: new Date().toISOString(),
    };

    try {
      if (id) {
        const { data: updated, error } = await supabase
          .from('blog_posts')
          .update(payload)
          .eq('id', id)
          .select()
          .single();
        if (!error && updated) {
          setPosts((prev) =>
            prev.map((item) => (item.id === id ? updated : item))
          );
          return updated;
        }
      } else {
        const { data: created, error } = await supabase
          .from('blog_posts')
          .insert(payload)
          .select()
          .single();
        if (!error && created) {
          setPosts((prev) => [created, ...prev]);
          return created;
        }
      }
      return null;
    } finally {
      setIsSaving(false);
    }
  };

  const deletePost = async (id: string) => {
    if (!isAdmin) return;
    const { error } = await supabase.from('blog_posts').delete().eq('id', id);
    if (!error) {
      setPosts((prev) => prev.filter((item) => item.id !== id));
    }
  };

  // ─── Client Logos CRUD ────────────────────────────────────
  const saveLogo = async (
    data: Partial<CmsClientLogo>,
    id?: string
  ): Promise<CmsClientLogo | null> => {
    if (!isAdmin || !tenantId) return null;
    setIsSaving(true);
    const payload = {
      ...data,
      tenant_id: tenantId,
      updated_at: new Date().toISOString(),
    };

    try {
      if (id) {
        const { data: updated, error } = await supabase
          .from('client_logos')
          .update(payload)
          .eq('id', id)
          .select()
          .single();
        if (!error && updated) {
          setClientLogos((prev) =>
            prev.map((item) => (item.id === id ? updated : item))
          );
          return updated;
        }
      } else {
        const { data: created, error } = await supabase
          .from('client_logos')
          .insert(payload)
          .select()
          .single();
        if (!error && created) {
          setClientLogos((prev) => [created, ...prev]);
          return created;
        }
      }
      return null;
    } finally {
      setIsSaving(false);
    }
  };

  const deleteLogo = async (id: string) => {
    if (!isAdmin) return;
    const { error } = await supabase
      .from('client_logos')
      .delete()
      .eq('id', id);
    if (!error) {
      setClientLogos((prev) => prev.filter((item) => item.id !== id));
    }
  };

  // ─── Media upload (images, videos, gifs) ─────────────────
  const uploadImage = async (
    file: File,
    folder: string = 'portfolio'
  ): Promise<string | null> => {
    if (!tenantId) return null;
    const isAllowed =
      file.type.startsWith('image/') || file.type.startsWith('video/');
    if (!isAllowed) return null;

    const ext = file.name.split('.').pop();
    const path = `${tenantId}/${folder}/${Date.now()}.${ext}`;

    const { error } = await supabase.storage
      .from('portfolio-images')
      .upload(path, file, { upsert: true });

    if (error) {
      if (import.meta.env.DEV) console.error('[CMS] Upload error:', error);
      return null;
    }

    const {
      data: { publicUrl },
    } = supabase.storage.from('portfolio-images').getPublicUrl(path);
    return publicUrl;
  };

  const detectMediaType = (url: string): PortfolioMedia['type'] => {
    if (/\.(mp4|webm|mov)(\?|$)/i.test(url)) return 'video';
    if (/\.gif(\?|$)/i.test(url)) return 'gif';
    return 'image';
  };

  // ─── Reorder helpers ──────────────────────────────────────
  const reorderPortfolio = async (items: { id: string; display_order: number }[]) => {
    for (const item of items) {
      await supabase
        .from('portfolio_items')
        .update({ display_order: item.display_order })
        .eq('id', item.id);
    }
    await fetchAll();
  };

  const reorderProducts = async (items: { id: string; display_order: number }[]) => {
    for (const item of items) {
      await supabase
        .from('products')
        .update({ display_order: item.display_order })
        .eq('id', item.id);
    }
    await fetchAll();
  };

  const reorderLogos = async (items: { id: string; sort_order: number }[]) => {
    for (const item of items) {
      await supabase
        .from('client_logos')
        .update({ sort_order: item.sort_order })
        .eq('id', item.id);
    }
    await fetchAll();
  };

  return {
    portfolio,
    products,
    posts,
    clientLogos,
    isLoading,
    isSaving,
    savePortfolio,
    deletePortfolio,
    saveProduct,
    deleteProduct,
    savePost,
    deletePost,
    saveLogo,
    deleteLogo,
    uploadImage,
    reorderPortfolio,
    reorderProducts,
    reorderLogos,
    detectMediaType,
    refetch: fetchAll,
  };
};
