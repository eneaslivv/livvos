/**
 * LIVV Studio — shared design primitives.
 *
 * These mirror the design-bundle prototypes (Primitives.jsx) reimplemented
 * as proper React/TypeScript components with Framer Motion for the few
 * pieces that need it. Import any of these into a page to get the
 * brand's signature patterns without rebuilding them inline.
 *
 * Every component uses CSS custom properties from livv-design-tokens.css
 * so they automatically respect dark-mode overrides.
 */
import React, { useState } from 'react';
import { motion } from 'framer-motion';

/* ─────────────────────────────────────────────────────────────
   Eyebrow — the tracked, uppercase micro-label used everywhere.
   Pattern: © Services サービス
   ───────────────────────────────────────────────────────────── */
export const Eyebrow: React.FC<{
  children: React.ReactNode;
  gold?: boolean;
  className?: string;
  style?: React.CSSProperties;
}> = ({ children, gold, className, style }) => (
  <span
    className={className}
    style={{
      fontFamily: 'var(--font-sans)',
      fontSize: 10,
      fontWeight: 500,
      letterSpacing: '0.22em',
      textTransform: 'uppercase' as const,
      color: gold ? 'var(--livv-gold)' : 'color-mix(in oklab, var(--livv-wine-500) 60%, transparent)',
      ...style,
    }}
  >
    {children}
  </span>
);

/* ─────────────────────────────────────────────────────────────
   WdxTag — WDX® section numbering, right-aligned on eyebrow rows.
   Usage: <WdxTag n={1} />  → (WDX® — 01)
   ───────────────────────────────────────────────────────────── */
export const WdxTag: React.FC<{ n: number; style?: React.CSSProperties }> = ({ n, style }) => (
  <span
    style={{
      fontFamily: 'var(--font-sans)',
      fontSize: 10,
      letterSpacing: '0.22em',
      textTransform: 'uppercase' as const,
      color: 'color-mix(in oklab, var(--livv-wine-500) 55%, transparent)',
      ...style,
    }}
  >
    (WDX® — {String(n).padStart(2, '0')})
  </span>
);

/* ─────────────────────────────────────────────────────────────
   DashedRule — warm dashed separator (horizontal or vertical).
   Color matches Livv's warm border token, never cool gray.
   ───────────────────────────────────────────────────────────── */
export const DashedRule: React.FC<{
  vertical?: boolean;
  className?: string;
  style?: React.CSSProperties;
}> = ({ vertical, className, style }) =>
  vertical ? (
    <div
      className={className}
      style={{
        width: 1,
        alignSelf: 'stretch',
        borderLeft: '1px dashed rgba(90,62,62,0.25)',
        ...style,
      }}
    />
  ) : (
    <div
      className={className}
      style={{
        height: 1,
        width: '100%',
        borderTop: '1px dashed rgba(90,62,62,0.3)',
        ...style,
      }}
    />
  );

/* ─────────────────────────────────────────────────────────────
   Arrow — thin Lucide-style arrow. The studio's workhorse CTA icon.
   ArrowUpRight by default; use rotate={0} for ArrowRight.
   ───────────────────────────────────────────────────────────── */
export const Arrow: React.FC<{
  rotate?: number;
  size?: number;
  color?: string;
  style?: React.CSSProperties;
}> = ({ rotate = 0, size = 14, color = 'currentColor', style }) => (
  <svg
    width={size}
    height={size}
    viewBox="0 0 24 24"
    fill="none"
    stroke={color}
    strokeWidth="2"
    strokeLinecap="round"
    strokeLinejoin="round"
    style={{
      transform: `rotate(${rotate}deg)`,
      transition: 'transform .3s cubic-bezier(.16,1,.3,1)',
      ...style,
    }}
  >
    <path d="M7 17L17 7M7 7h10v10" />
  </svg>
);

/* ─────────────────────────────────────────────────────────────
   ButtonPill — dark pill CTA with spinning conic-gradient arrow.
   Variants: dark (default), light, cream, ghost.
   ───────────────────────────────────────────────────────────── */
type ButtonPillVariant = 'dark' | 'light' | 'cream' | 'ghost';
type ButtonPillSize = 'sm' | 'md';

export const ButtonPill: React.FC<{
  children: React.ReactNode;
  variant?: ButtonPillVariant;
  size?: ButtonPillSize;
  arrow?: boolean;
  onClick?: () => void;
  disabled?: boolean;
  className?: string;
  style?: React.CSSProperties;
}> = ({ children, variant = 'dark', size = 'md', arrow = true, onClick, disabled, className, style }) => {
  const [hover, setHover] = useState(false);
  const isDark = variant === 'dark';
  const isCream = variant === 'cream';
  const isGhost = variant === 'ghost';
  const pad = size === 'sm' ? '4px 4px 4px 14px' : '5px 5px 5px 18px';
  const arrSz = size === 'sm' ? 24 : 30;
  const bg = isGhost ? 'transparent' : isCream ? 'var(--livv-cream-100)' : isDark ? 'var(--livv-cream-900)' : '#FFFFFF';
  const fg = isDark ? 'var(--livv-cream-50)' : 'var(--livv-cream-900)';
  const arrBg = isDark ? 'var(--livv-cream-50)' : 'var(--livv-cream-900)';
  const arrFg = isDark ? 'var(--livv-cream-900)' : 'var(--livv-cream-50)';

  return (
    <button
      onClick={onClick}
      disabled={disabled}
      onMouseEnter={() => setHover(true)}
      onMouseLeave={() => setHover(false)}
      className={className}
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        gap: 10,
        padding: arrow ? pad : '10px 22px',
        background: bg,
        color: fg,
        border: isGhost
          ? '1px solid rgba(26,26,26,0.25)'
          : '1px solid rgba(255,255,255,0.15)',
        borderRadius: 9999,
        fontFamily: 'var(--font-sans)',
        fontWeight: 500,
        fontSize: size === 'sm' ? 12 : 13,
        letterSpacing: hover ? '0.02em' : '0',
        cursor: disabled ? 'default' : 'pointer',
        opacity: disabled ? 0.4 : 1,
        boxShadow: isDark
          ? '0 4px 16px rgba(0,0,0,0.2)'
          : '0 2px 8px rgba(0,0,0,0.06)',
        transform: hover && !disabled ? 'scale(1.02)' : 'scale(1)',
        transition:
          'transform .4s cubic-bezier(.16,1,.3,1), letter-spacing .4s, opacity .2s',
        ...style,
      }}
    >
      <span>{children}</span>
      {arrow && (
        <span
          style={{
            position: 'relative',
            width: arrSz,
            height: arrSz,
            display: 'inline-block',
            flexShrink: 0,
          }}
        >
          {hover && !disabled && (
            <span
              style={{
                position: 'absolute',
                inset: -2,
                borderRadius: 9999,
                background: 'var(--gradient-brand-conic)',
                animation: 'livv-spin 2s linear infinite',
                filter: 'blur(1px)',
              }}
            />
          )}
          <span
            style={{
              position: 'absolute',
              inset: 0,
              borderRadius: 9999,
              background: arrBg,
              color: arrFg,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
            }}
          >
            <svg
              width="13"
              height="13"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <path d="M5 12h14M13 5l7 7-7 7" />
            </svg>
          </span>
        </span>
      )}
    </button>
  );
};

/* ─────────────────────────────────────────────────────────────
   SectionFrame — editorial section wrapper with eyebrow row.
   Adds dashed border + © prefix + WDX® tag automatically.
   ───────────────────────────────────────────────────────────── */
export const SectionFrame: React.FC<{
  eyebrow: string;
  jp?: string;
  wdx?: number;
  children: React.ReactNode;
  bg?: string;
  id?: string;
  className?: string;
  style?: React.CSSProperties;
}> = ({ eyebrow, jp, wdx, children, bg, id, className, style }) => (
  <section
    id={id}
    className={className}
    style={{
      background: bg || 'var(--livv-cream-50)',
      padding: '96px 48px',
      position: 'relative',
      ...style,
    }}
  >
    <div style={{ maxWidth: 1280, margin: '0 auto' }}>
      <div
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          paddingBottom: 16,
          borderBottom: '1px dashed rgba(90,62,62,0.3)',
          marginBottom: 40,
        }}
      >
        <Eyebrow>
          © {eyebrow}
          {jp ? ` ${jp}` : ''}
        </Eyebrow>
        {wdx !== undefined && <WdxTag n={wdx} />}
      </div>
      {children}
    </div>
  </section>
);

/* ─────────────────────────────────────────────────────────────
   CornerDots — decorative dot-bracket wrapper used on feature cards.
   ───────────────────────────────────────────────────────────── */
export const CornerDots: React.FC<{
  children: React.ReactNode;
  color?: string;
  className?: string;
  style?: React.CSSProperties;
}> = ({ children, color = 'var(--livv-wine-500)', className, style }) => (
  <div className={className} style={{ position: 'relative', ...style }}>
    {[
      { top: -3, right: 'auto', bottom: 'auto', left: -3 },
      { top: -3, right: -3, bottom: 'auto', left: 'auto' },
      { top: 'auto', right: 'auto', bottom: -3, left: -3 },
      { top: 'auto', right: -3, bottom: -3, left: 'auto' },
    ].map((pos, i) => (
      <span
        key={i}
        style={{
          position: 'absolute',
          top: pos.top,
          right: pos.right,
          bottom: pos.bottom,
          left: pos.left,
          width: 6,
          height: 6,
          borderRadius: 999,
          background: color,
          zIndex: 2,
        }}
      />
    ))}
    {children}
  </div>
);

/* ─────────────────────────────────────────────────────────────
   SectionHeading — Inter Light headline with tight tracking.
   Use for any page or section heading.
   ───────────────────────────────────────────────────────────── */
export const SectionHeading: React.FC<{
  children: React.ReactNode;
  as?: 'h1' | 'h2' | 'h3';
  size?: 'xl' | 'lg' | 'md';
  accent?: string;
  className?: string;
  style?: React.CSSProperties;
}> = ({ children, as: Tag = 'h2', size = 'lg', accent, className, style }) => {
  const fontSize =
    size === 'xl'
      ? 'clamp(40px, 6vw, 72px)'
      : size === 'lg'
        ? 'clamp(32px, 4vw, 56px)'
        : 'clamp(22px, 2.4vw, 30px)';

  return (
    <Tag
      className={className}
      style={{
        margin: 0,
        fontFamily: 'var(--font-sans)',
        fontWeight: 300,
        fontSize,
        lineHeight: 1.05,
        letterSpacing: '-0.04em',
        wordSpacing: '-0.05em',
        color: accent || 'var(--fg-1, var(--livv-wine-500))',
        ...style,
      }}
    >
      {children}
    </Tag>
  );
};

/* ─────────────────────────────────────────────────────────────
   GoldGradientText — the money-shot treatment for emphasis.
   Applies gold gradient clip on text.
   ───────────────────────────────────────────────────────────── */
export const GoldGradientText: React.FC<{
  children: React.ReactNode;
  className?: string;
  style?: React.CSSProperties;
}> = ({ children, className, style }) => (
  <span
    className={className}
    style={{
      backgroundImage: 'var(--gradient-gold)',
      WebkitBackgroundClip: 'text',
      backgroundClip: 'text',
      color: 'transparent',
      WebkitTextFillColor: 'transparent',
      ...style,
    }}
  >
    {children}
  </span>
);

/* ─────────────────────────────────────────────────────────────
   StatCard — glass stat card used in "Business meets Art" section.
   Wine-dark glass background with pink glow on hover.
   ───────────────────────────────────────────────────────────── */
export const StatCard: React.FC<{
  value: string;
  label: string;
  description?: string;
  className?: string;
  style?: React.CSSProperties;
}> = ({ value, label, description, className, style }) => {
  const [hover, setHover] = useState(false);
  return (
    <div
      onMouseEnter={() => setHover(true)}
      onMouseLeave={() => setHover(false)}
      className={className}
      style={{
        position: 'relative',
        padding: '28px 28px 24px',
        background: 'rgba(15,5,5,0.45)',
        backdropFilter: 'blur(14px)',
        border: '1px solid rgba(237,229,216,0.14)',
        borderRadius: 'var(--radius-lg)',
        boxShadow: hover
          ? '0 25px 50px -12px rgba(0,0,0,0.5), 0 0 0 1px rgba(255,184,224,0.25)'
          : '0 4px 12px rgba(0,0,0,0.2)',
        transform: hover ? 'translateY(-4px)' : 'translateY(0)',
        transition: 'all .5s cubic-bezier(.16,1,.3,1)',
        overflow: 'hidden',
        ...style,
      }}
    >
      {hover && (
        <div
          style={{
            position: 'absolute',
            inset: 0,
            background:
              'radial-gradient(circle at 50% 0%, rgba(255,184,224,0.22), transparent 60%)',
            pointerEvents: 'none',
          }}
        />
      )}
      <div style={{ position: 'relative' }}>
        <div
          style={{
            fontFamily: 'var(--font-sans)',
            fontWeight: 300,
            fontSize: 76,
            lineHeight: 1,
            letterSpacing: '-0.04em',
            color: 'var(--livv-parchment)',
            fontVariantNumeric: 'tabular-nums',
          }}
        >
          {value}
        </div>
        <div
          style={{
            marginTop: 14,
            fontFamily: 'var(--font-sans)',
            fontSize: 12,
            fontWeight: 600,
            letterSpacing: '0.18em',
            textTransform: 'uppercase',
            color: 'var(--livv-parchment)',
          }}
        >
          {label}
        </div>
        {description && (
          <div
            style={{
              marginTop: 6,
              fontFamily: 'var(--font-mono)',
              fontSize: 11,
              color: 'var(--livv-pink)',
            }}
          >
            {description}
          </div>
        )}
      </div>
    </div>
  );
};

/* ─────────────────────────────────────────────────────────────
   ServiceCard — tall image card with gradient overlay and hover lift.
   Used for showcasing services or portfolio items.
   ───────────────────────────────────────────────────────────── */
export const ServiceCard: React.FC<{
  title: string;
  description: string;
  imageUrl: string;
  tag?: string;
  onClick?: () => void;
  className?: string;
  style?: React.CSSProperties;
}> = ({ title, description, imageUrl, tag, onClick, className, style }) => {
  const [hover, setHover] = useState(false);
  return (
    <div
      onClick={onClick}
      onMouseEnter={() => setHover(true)}
      onMouseLeave={() => setHover(false)}
      className={className}
      style={{
        position: 'relative',
        height: 440,
        borderRadius: 10,
        overflow: 'hidden',
        transform: hover ? 'translateY(-8px)' : 'translateY(0)',
        transition: 'transform .6s cubic-bezier(.16,1,.3,1)',
        cursor: onClick ? 'pointer' : 'default',
        ...style,
      }}
    >
      <div
        style={{
          position: 'absolute',
          inset: 0,
          backgroundImage: `url(${imageUrl})`,
          backgroundSize: 'cover',
          backgroundPosition: 'center',
          transform: hover ? 'scale(1.08)' : 'scale(1)',
          transition: 'transform 1s cubic-bezier(.16,1,.3,1)',
        }}
      />
      <div
        style={{
          position: 'absolute',
          inset: 0,
          background:
            'linear-gradient(180deg, rgba(15,5,5,0) 40%, rgba(15,5,5,0.85) 100%)',
        }}
      />
      {tag && (
        <div
          style={{
            position: 'absolute',
            top: 18,
            left: 18,
            right: 18,
            display: 'flex',
            justifyContent: 'space-between',
          }}
        >
          <span
            style={{
              fontFamily: 'var(--font-mono)',
              fontSize: 10,
              letterSpacing: '0.15em',
              color: 'rgba(253,251,247,0.8)',
            }}
          >
            ({tag})
          </span>
          <span
            style={{
              width: 30,
              height: 30,
              borderRadius: 999,
              background: 'rgba(253,251,247,0.9)',
              color: '#1a1a1a',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              transform: hover ? 'rotate(0deg)' : 'rotate(-45deg)',
              transition: 'transform .5s cubic-bezier(.16,1,.3,1)',
            }}
          >
            <Arrow size={13} />
          </span>
        </div>
      )}
      <div
        style={{
          position: 'absolute',
          left: 22,
          right: 22,
          bottom: 22,
          color: 'var(--livv-cream-50)',
        }}
      >
        <h3
          style={{
            margin: '0 0 10px',
            fontFamily: 'var(--font-sans)',
            fontWeight: 500,
            fontSize: 22,
            letterSpacing: '-0.02em',
            color: 'var(--livv-cream-50)',
          }}
        >
          {title}
        </h3>
        <p
          style={{
            margin: 0,
            fontFamily: 'var(--font-sans)',
            fontSize: 13,
            lineHeight: 1.55,
            color: 'rgba(237,229,216,0.82)',
          }}
        >
          {description}
        </p>
      </div>
    </div>
  );
};

/* ─────────────────────────────────────────────────────────────
   PageShell — consistent page wrapper for OS pages. Includes
   the editorial title + meta line used across reskinned pages.
   ───────────────────────────────────────────────────────────── */
export const PageShell: React.FC<{
  title: string;
  meta?: React.ReactNode;
  actions?: React.ReactNode;
  children: React.ReactNode;
  maxWidth?: number;
  className?: string;
  style?: React.CSSProperties;
}> = ({ title, meta, actions, children, maxWidth = 1600, className, style }) => (
  <div
    className={className}
    style={{
      maxWidth,
      margin: '0 auto',
      padding: '24px 0 80px',
      ...style,
    }}
  >
    {/* Header bar */}
    <div
      style={{
        display: 'flex',
        alignItems: 'flex-end',
        justifyContent: 'space-between',
        gap: 24,
        marginBottom: 22,
        paddingBottom: 18,
        borderBottom: '0.5px solid var(--os-divider)',
      }}
    >
      <div>
        <h1
          style={{
            fontSize: 'clamp(22px, 2.4vw, 30px)',
            fontWeight: 300,
            letterSpacing: '-0.03em',
            lineHeight: 1.05,
            color: 'var(--os-fg-0)',
            margin: 0,
          }}
        >
          {title}
        </h1>
        {meta && (
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 8,
              flexWrap: 'wrap',
              marginTop: 6,
              fontFamily: 'var(--font-mono)',
              fontSize: 10.5,
              letterSpacing: '0.04em',
              color: 'var(--os-fg-2)',
            }}
          >
            {meta}
          </div>
        )}
      </div>
      {actions && <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>{actions}</div>}
    </div>
    {children}
  </div>
);

/* ─────────────────────────────────────────────────────────────
   PillTabs — round pill tab switcher (like cx-tabs / dx-tabs).
   ───────────────────────────────────────────────────────────── */
export const PillTabs: React.FC<{
  tabs: Array<{ id: string; label: string; icon?: React.ReactNode; count?: number }>;
  active: string;
  onChange: (id: string) => void;
  className?: string;
  style?: React.CSSProperties;
}> = ({ tabs, active, onChange, className, style }) => (
  <div
    className={className}
    style={{
      display: 'inline-flex',
      alignItems: 'center',
      padding: 3,
      background: 'var(--os-panel)',
      border: '0.5px solid var(--os-border-2)',
      borderRadius: 999,
      boxShadow: 'var(--shadow-card)',
      ...style,
    }}
  >
    {tabs.map((tab) => (
      <button
        key={tab.id}
        onClick={() => onChange(tab.id)}
        style={{
          display: 'inline-flex',
          alignItems: 'center',
          gap: 7,
          padding: '7px 16px',
          background: active === tab.id ? 'var(--os-ink)' : 'transparent',
          border: 0,
          cursor: 'pointer',
          borderRadius: 999,
          fontSize: 12.5,
          fontWeight: 500,
          color: active === tab.id ? 'var(--livv-cream-50)' : 'var(--os-fg-2)',
          transition: 'all 0.2s cubic-bezier(0.4, 0, 0.2, 1)',
        }}
      >
        {tab.icon}
        {tab.label}
        {tab.count !== undefined && (
          <span
            style={{
              fontFamily: 'var(--font-mono)',
              fontSize: 9.5,
              opacity: 0.6,
            }}
          >
            {tab.count}
          </span>
        )}
      </button>
    ))}
  </div>
);

/* ─────────────────────────────────────────────────────────────
   FilterPill — small pill used in filter strips.
   ───────────────────────────────────────────────────────────── */
export const FilterPill: React.FC<{
  children: React.ReactNode;
  active?: boolean;
  count?: number;
  onClick?: () => void;
  className?: string;
  style?: React.CSSProperties;
}> = ({ children, active, count, onClick, className, style }) => (
  <button
    onClick={onClick}
    className={className}
    style={{
      display: 'inline-flex',
      alignItems: 'center',
      gap: 5,
      padding: '5px 12px',
      borderRadius: 999,
      fontSize: 11.5,
      fontWeight: 500,
      background: active ? 'var(--os-ink)' : 'transparent',
      color: active ? 'var(--livv-cream-50)' : 'var(--os-fg-2)',
      border: active ? '0.5px solid var(--os-ink)' : '0.5px solid transparent',
      cursor: 'pointer',
      transition: 'all 0.2s cubic-bezier(0.4, 0, 0.2, 1)',
      ...style,
    }}
  >
    {children}
    {count !== undefined && (
      <span
        style={{
          fontFamily: 'var(--font-mono)',
          fontSize: 9.5,
          opacity: 0.6,
        }}
      >
        {count}
      </span>
    )}
  </button>
);

/* ─────────────────────────────────────────────────────────────
   LivvCard — base card container matching the editorial system.
   ───────────────────────────────────────────────────────────── */
export const LivvCard: React.FC<{
  children: React.ReactNode;
  hover?: boolean;
  className?: string;
  style?: React.CSSProperties;
}> = ({ children, hover: enableHover, className, style }) => {
  const [isHover, setIsHover] = useState(false);
  return (
    <div
      onMouseEnter={enableHover ? () => setIsHover(true) : undefined}
      onMouseLeave={enableHover ? () => setIsHover(false) : undefined}
      className={className}
      style={{
        borderRadius: 14,
        border: '0.5px solid var(--os-border-2)',
        background: 'var(--os-panel)',
        overflow: 'hidden',
        boxShadow: isHover ? 'var(--shadow-md)' : 'var(--shadow-card)',
        transform: isHover ? 'translateY(-2px)' : 'translateY(0)',
        transition: 'all 0.3s cubic-bezier(.16,1,.3,1)',
        ...style,
      }}
    >
      {children}
    </div>
  );
};

/* ─────────────────────────────────────────────────────────────
   RoundButton — the cx-btn / dx-btn pattern used across pages.
   ───────────────────────────────────────────────────────────── */
export const RoundButton: React.FC<{
  children: React.ReactNode;
  primary?: boolean;
  icon?: React.ReactNode;
  onClick?: () => void;
  disabled?: boolean;
  className?: string;
  style?: React.CSSProperties;
}> = ({ children, primary, icon, onClick, disabled, className, style }) => (
  <button
    onClick={onClick}
    disabled={disabled}
    className={className}
    style={{
      display: 'inline-flex',
      alignItems: 'center',
      gap: 7,
      padding: '8px 16px',
      background: primary ? 'var(--os-ink)' : 'var(--os-panel)',
      color: primary ? 'var(--livv-cream-50)' : 'var(--os-fg-0)',
      border: primary
        ? '0.5px solid var(--os-ink)'
        : '0.5px solid var(--os-border-2)',
      borderRadius: 999,
      cursor: disabled ? 'default' : 'pointer',
      fontSize: 12,
      fontWeight: 500,
      opacity: disabled ? 0.4 : 1,
      transition: 'all 0.2s cubic-bezier(0.4, 0, 0.2, 1)',
      ...style,
    }}
  >
    {icon}
    {children}
  </button>
);
