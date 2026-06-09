import React from 'react';
import { Sparkles, Wallet, ShieldCheck, Compass, LineChart, Boxes, type LucideIcon } from 'lucide-react';
import '../../styles/portal-auth.css';

const FEATURE_ICONS: Record<string, LucideIcon> = {
  progress: Sparkles,
  payments: Wallet,
  docs: ShieldCheck,
  command: Compass,
  finance: LineChart,
  infra: Boxes,
};

export interface AuthFeature { icon: keyof typeof FEATURE_ICONS | string; title: string; desc: string; }

interface Props {
  /** Mono eyebrow, e.g. "© CLIENT PORTAL ポータル". */
  eyebrow: string;
  /** Big light headline (can include <br/>). */
  headline: React.ReactNode;
  /** Supporting sentence under the headline. */
  subtitle: string;
  /** 0–3 feature rows with a gold-tinted icon tile. */
  features?: AuthFeature[];
  /** Mono footer line on the wine panel. */
  footer?: string;
  /** The right-side form. */
  children: React.ReactNode;
}

/**
 * Livv auth shell — split wine/cream layout from the Claude Design handoff
 * ("livv-cliente-view"). Left: a radial-wine panel with a soft conic glow,
 * the livv mark, an editorial headline and feature tiles. Right: the form.
 * Collapses to a single column (form only) below `lg`.
 */
export const AuthSplitLayout: React.FC<Props> = ({
  eyebrow,
  headline,
  subtitle,
  features,
  footer = 'DESIGNED BY LIVV · WHITE-LABEL CREATIVE PARTNER',
  children,
}) => (
  <div className="grid grid-cols-1 lg:grid-cols-[1.05fr_1fr]" style={{ minHeight: '100vh', background: '#FDFBF7' }}>
    {/* LEFT — wine panel */}
    <div
      className="hidden lg:flex"
      style={{
        position: 'relative', overflow: 'hidden', flexDirection: 'column', justifyContent: 'space-between',
        background: 'radial-gradient(120% 120% at 20% 0%, #5c1d18 0%, #2C0405 48%, #1A0203 100%)',
        color: '#EDE5D8', padding: '56px 64px',
      }}
    >
      <div
        aria-hidden
        style={{
          position: 'absolute', inset: 0, opacity: 0.45,
          background: 'conic-gradient(from 0deg, #E8BC59, #769268, #6DBEDC, #E8BC59)',
          mixBlendMode: 'soft-light', filter: 'blur(70px)', transform: 'scale(1.3)',
        }}
      />

      {/* Wordmark */}
      <div style={{ position: 'relative', display: 'flex', alignItems: 'center', gap: 12 }}>
        <img src="/livv-mark.svg" alt="Livv" width={40} height={40} style={{ borderRadius: 11 }} />
        <span style={{ fontFamily: "'Inter', serif", fontStyle: 'italic', fontWeight: 300, fontSize: 26, letterSpacing: '0.01em', color: '#FDFBF7' }}>
          livv
        </span>
      </div>

      {/* Headline + features */}
      <div className="pa-rise" style={{ position: 'relative', maxWidth: 440 }}>
        <p className="pa-eyebrow" style={{ color: '#C4A35A', marginBottom: 22 }}>{eyebrow}</p>
        <h1 className="pa-h" style={{ fontSize: 46, lineHeight: 1.05, color: '#FDFBF7' }}>{headline}</h1>
        <p style={{ color: 'rgba(237,229,216,0.72)', fontSize: 15.5, lineHeight: 1.6, marginTop: 18 }}>{subtitle}</p>

        {features && features.length > 0 && (
          <div style={{ marginTop: 40, display: 'flex', flexDirection: 'column', gap: 22 }}>
            {features.map((f, i) => {
              const Ico = FEATURE_ICONS[f.icon] || Sparkles;
              return (
                <div key={i} style={{ display: 'flex', gap: 16, alignItems: 'flex-start' }}>
                  <span style={{
                    width: 40, height: 40, borderRadius: 12, flex: 'none', display: 'grid', placeItems: 'center',
                    background: 'rgba(196,163,90,0.16)', border: '1px solid rgba(196,163,90,0.3)', color: '#C4A35A',
                  }}>
                    <Ico size={18} strokeWidth={1.75} />
                  </span>
                  <div>
                    <div style={{ fontWeight: 500, color: '#FDFBF7', fontSize: 15 }}>{f.title}</div>
                    <div style={{ color: 'rgba(237,229,216,0.6)', fontSize: 13.5, marginTop: 2 }}>{f.desc}</div>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Footer */}
      <div style={{ position: 'relative', fontFamily: "'JetBrains Mono', monospace", fontSize: 10, letterSpacing: '0.16em', color: 'rgba(237,229,216,0.45)' }}>
        {footer}
      </div>
    </div>

    {/* RIGHT — form */}
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '48px 32px', background: '#FDFBF7' }}>
      <div className="pa-rise" style={{ width: '100%', maxWidth: 380 }}>{children}</div>
    </div>
  </div>
);
