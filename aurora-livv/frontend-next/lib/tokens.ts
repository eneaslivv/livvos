// Design tokens for aurora-livv.
// All colors live here. Components use CSS variables; this file emits them.
// Re-ordered to match Livv's existing whitelabel pattern.

export type AgentSlug = 'atlas' | 'solara' | 'marina' | 'nova';

export const agents: Record<AgentSlug, {
  display_name: string;
  tagline: string;
  glyph: string;
  accent_hex: string;
  accent_soft: string;
  accent_text: string;
}> = {
  atlas: {
    display_name: 'Atlas',
    tagline: 'The map that routes the work',
    glyph: 'compass',
    accent_hex:  '#475569',
    accent_soft: '#E2E8F0',
    accent_text: '#0F172A',
  },
  solara: {
    display_name: 'Solara',
    tagline: 'Closes deals like fine art',
    glyph: 'spark',
    accent_hex:  '#E11D74',
    accent_soft: '#FCE7F3',
    accent_text: '#831843',
  },
  marina: {
    display_name: 'Marina',
    tagline: 'Calm waters in the cashflow',
    glyph: 'droplet',
    accent_hex:  '#10B981',
    accent_soft: '#D1FAE5',
    accent_text: '#064E3B',
  },
  nova: {
    display_name: 'Nova',
    tagline: 'The signal in the noise',
    glyph: 'pulse',
    accent_hex:  '#3B82F6',
    accent_soft: '#DBEAFE',
    accent_text: '#1E3A8A',
  },
};

// Shared
export const base = {
  bg: '#FAFAF9',
  surface: '#FFFFFF',
  surface_2: '#F5F5F4',
  text: '#1C1917',
  text_muted: '#78716C',
  border: '#E7E5E4',
  ok: '#10B981',
  warn: '#F59E0B',
  err: '#E11D74',
  radius_sm: '6px',
  radius_md: '12px',
  radius_lg: '20px',
  shadow_sm: '0 1px 2px rgba(0,0,0,.04)',
  shadow_md: '0 8px 24px rgba(0,0,0,.08)',
  shadow_lg: '0 20px 60px rgba(0,0,0,.12)',
  font_body: 'ui-sans-serif, system-ui, -apple-system, "Segoe UI", Roboto, sans-serif',
  font_mono: 'ui-monospace, SFMono-Regular, "SF Mono", Consolas, monospace',
};

export function cssVarsForAgent(slug: AgentSlug): React.CSSProperties {
  const a = agents[slug];
  return {
    // Cast to any because React.CSSProperties doesn't type custom props.
    ['--accent' as any]: a.accent_hex,
    ['--accent-soft' as any]: a.accent_soft,
    ['--accent-text' as any]: a.accent_text,
  };
}
