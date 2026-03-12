import React, { useState } from 'react';
import { X, Copy, Check, Code2 } from 'lucide-react';

interface IntegrationSnippetProps {
  isOpen: boolean;
  onClose: () => void;
  tenantSlug: string;
}

export const IntegrationSnippet: React.FC<IntegrationSnippetProps> = ({
  isOpen,
  onClose,
  tenantSlug,
}) => {
  const [copied, setCopied] = useState<string | null>(null);
  const [tab, setTab] = useState<'fetch' | 'supabase' | 'react'>('fetch');

  if (!isOpen) return null;

  const supabaseUrl = import.meta.env.VITE_SUPABASE_URL || 'https://your-project.supabase.co';
  const anonKey = import.meta.env.VITE_SUPABASE_ANON_KEY || 'your-anon-key';

  const snippets = {
    fetch: `// No dependencies needed — works in any JS framework
const SLUG = '${tenantSlug}';
const API  = '${supabaseUrl}/rest/v1/rpc';
const KEY  = '${anonKey}';

async function fetchCms(fn) {
  const res = await fetch(\`\${API}/\${fn}\`, {
    method: 'POST',
    headers: {
      'apikey': KEY,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ p_tenant_slug: SLUG }),
  });
  return res.json();
}

// Usage
const portfolio = await fetchCms('get_public_portfolio_items');
const products  = await fetchCms('get_public_products');
const logos      = await fetchCms('get_public_client_logos');`,

    supabase: `// npm install @supabase/supabase-js
import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  '${supabaseUrl}',
  '${anonKey}'
);

const SLUG = '${tenantSlug}';

// Portfolio items (published, ordered by display_order)
const { data: portfolio } = await supabase
  .rpc('get_public_portfolio_items', { p_tenant_slug: SLUG });

// Products (published, ordered by display_order)
const { data: products } = await supabase
  .rpc('get_public_products', { p_tenant_slug: SLUG });

// Client logos (visible, ordered by sort_order)
const { data: logos } = await supabase
  .rpc('get_public_client_logos', { p_tenant_slug: SLUG });`,

    react: `// npm install @supabase/supabase-js
import { createClient } from '@supabase/supabase-js';
import { useEffect, useState } from 'react';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL || '${supabaseUrl}',
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || '${anonKey}'
);

const SLUG = '${tenantSlug}';

export function useCms<T>(rpcName: string) {
  const [data, setData] = useState<T[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    supabase
      .rpc(rpcName, { p_tenant_slug: SLUG })
      .then(({ data }) => { setData(data || []); })
      .finally(() => setLoading(false));
  }, [rpcName]);

  return { data, loading };
}

// Usage in components:
// const { data: portfolio, loading } = useCms('get_public_portfolio_items');
// const { data: products } = useCms('get_public_products');
// const { data: logos } = useCms('get_public_client_logos');`,
  };

  const handleCopy = async (key: string) => {
    await navigator.clipboard.writeText(snippets[tab]);
    setCopied(key);
    setTimeout(() => setCopied(null), 2000);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm">
      <div className="bg-[#FDFBF7] rounded-2xl border border-[#E6E2D8] shadow-2xl w-full max-w-2xl max-h-[80vh] flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-[#E6E2D8]">
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 rounded-lg bg-[#09090B] flex items-center justify-center">
              <Code2 size={16} className="text-[#E8BC59]" />
            </div>
            <div>
              <h3 className="text-sm font-semibold text-[#09090B]">API Integration</h3>
              <p className="text-[10px] text-[#09090B]/40">
                Connect your website to this CMS — tenant: <span className="font-mono text-[#E8BC59]">{tenantSlug}</span>
              </p>
            </div>
          </div>
          <button onClick={onClose} className="p-1.5 hover:bg-[#E6E2D8] rounded-lg transition-colors">
            <X size={16} className="text-[#09090B]/40" />
          </button>
        </div>

        {/* Tabs */}
        <div className="flex gap-1 px-6 pt-4">
          {([
            { id: 'fetch', label: 'Vanilla JS' },
            { id: 'supabase', label: 'Supabase SDK' },
            { id: 'react', label: 'React Hook' },
          ] as const).map((t) => (
            <button
              key={t.id}
              onClick={() => setTab(t.id)}
              className={`px-3 py-1.5 text-xs font-medium rounded-lg transition-all ${
                tab === t.id
                  ? 'bg-[#09090B] text-white'
                  : 'text-[#09090B]/50 hover:text-[#09090B] hover:bg-[#E6E2D8]/50'
              }`}
            >
              {t.label}
            </button>
          ))}
        </div>

        {/* Code */}
        <div className="flex-1 overflow-auto px-6 py-4">
          <div className="relative">
            <button
              onClick={() => handleCopy(tab)}
              className="absolute top-3 right-3 flex items-center gap-1.5 px-2.5 py-1 bg-white/80 hover:bg-white border border-[#E6E2D8] rounded-md text-[10px] font-medium text-[#09090B]/60 hover:text-[#09090B] transition-all"
            >
              {copied === tab ? <Check size={12} className="text-green-500" /> : <Copy size={12} />}
              {copied === tab ? 'Copied!' : 'Copy'}
            </button>
            <pre className="bg-[#09090B] text-[#E6E2D8] rounded-xl p-4 pr-24 text-xs leading-relaxed overflow-x-auto font-mono">
              {snippets[tab]}
            </pre>
          </div>
        </div>

        {/* Footer */}
        <div className="px-6 py-3 border-t border-[#E6E2D8] flex items-center justify-between">
          <p className="text-[10px] text-[#09090B]/30">
            All endpoints return published content only. No authentication required.
          </p>
          <div className="flex items-center gap-1.5">
            <div className="w-1.5 h-1.5 rounded-full bg-green-400" />
            <span className="text-[10px] text-[#09090B]/40">API active</span>
          </div>
        </div>
      </div>
    </div>
  );
};
