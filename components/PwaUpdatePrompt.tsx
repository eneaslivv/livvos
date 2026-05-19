import React, { useEffect, useState } from 'react';
import { Icons } from './ui/Icons';

/**
 * PWA Update Prompt — surfaces a small banner at the bottom-right
 * when the service worker has a new version waiting (or when the
 * user just installed an update and needs to refresh to see it).
 *
 * Why this exists: vite-plugin-pwa with registerType:'autoUpdate'
 * downloads the new bundle silently but only activates after all
 * tabs close. On a long-lived tab the user keeps seeing the old
 * code. This banner lets them activate immediately.
 *
 * Also includes a "Clear cache & reload" button — nukes the SW
 * registration + caches and hard-reloads. Useful when changes
 * aren't showing up.
 */
export const PwaUpdatePrompt: React.FC = () => {
  const [updateAvailable, setUpdateAvailable] = useState(false);
  const [clearing, setClearing] = useState(false);

  useEffect(() => {
    if (typeof window === 'undefined' || !('serviceWorker' in navigator)) return;
    let mounted = true;
    navigator.serviceWorker.getRegistration().then(reg => {
      if (!reg || !mounted) return;
      // Wake the SW to check for updates whenever this component mounts
      reg.update().catch(() => {});
      const onUpdateFound = () => {
        const installing = reg.installing;
        if (!installing) return;
        installing.addEventListener('statechange', () => {
          // 'installed' + an existing controller → new version waiting
          if (installing.state === 'installed' && navigator.serviceWorker.controller && mounted) {
            setUpdateAvailable(true);
          }
        });
      };
      reg.addEventListener('updatefound', onUpdateFound);
      // If a waiting worker is already there, surface immediately
      if (reg.waiting && navigator.serviceWorker.controller) {
        setUpdateAvailable(true);
      }
    });
    return () => { mounted = false; };
  }, []);

  const handleApplyUpdate = async () => {
    if (typeof navigator === 'undefined' || !('serviceWorker' in navigator)) {
      window.location.reload();
      return;
    }
    const reg = await navigator.serviceWorker.getRegistration();
    if (reg?.waiting) {
      reg.waiting.postMessage({ type: 'SKIP_WAITING' });
    }
    // Reload regardless so the user sees the new code
    setTimeout(() => window.location.reload(), 200);
  };

  const handleHardReset = async () => {
    setClearing(true);
    try {
      if ('serviceWorker' in navigator) {
        const regs = await navigator.serviceWorker.getRegistrations();
        await Promise.all(regs.map(r => r.unregister()));
      }
      if ('caches' in window) {
        const keys = await caches.keys();
        await Promise.all(keys.map(k => caches.delete(k)));
      }
      try { sessionStorage.clear(); } catch {}
    } catch {
      // best-effort cleanup
    }
    window.location.reload();
  };

  if (!updateAvailable) {
    // Hidden but accessible — keyboard shortcut Cmd+Shift+R triggers hard reset
    return (
      <button
        onClick={handleHardReset}
        disabled={clearing}
        style={{
          position: 'fixed',
          bottom: 12,
          right: 12,
          zIndex: 40,
          padding: '6px 10px',
          background: 'rgba(255,255,255,0.6)',
          border: '0.5px solid rgba(214,209,199,0.55)',
          borderRadius: 9999,
          fontSize: 10,
          fontFamily: 'JetBrains Mono, ui-monospace, monospace',
          letterSpacing: '0.08em',
          color: '#71717a',
          cursor: 'pointer',
          backdropFilter: 'blur(6px)',
          WebkitBackdropFilter: 'blur(6px)',
          display: 'inline-flex',
          alignItems: 'center',
          gap: 4,
          opacity: clearing ? 0.6 : 0.55,
          transition: 'opacity 0.2s',
        }}
        onMouseEnter={(e) => { (e.currentTarget as HTMLButtonElement).style.opacity = '1'; }}
        onMouseLeave={(e) => { (e.currentTarget as HTMLButtonElement).style.opacity = clearing ? '0.6' : '0.55'; }}
        title="If you don't see latest changes — unregisters the service worker + clears caches + reloads"
      >
        {clearing ? (
          <Icons.Loader size={10} className="animate-spin" />
        ) : (
          <Icons.RefreshCw size={10} />
        )}
        {clearing ? 'Clearing…' : 'Force refresh'}
      </button>
    );
  }

  return (
    <div
      style={{
        position: 'fixed',
        bottom: 16,
        right: 16,
        zIndex: 50,
        padding: 14,
        maxWidth: 340,
        background: 'linear-gradient(135deg, #ffffff, rgba(196,163,90,0.08))',
        border: '0.5px solid rgba(196,163,90,0.4)',
        borderRadius: 14,
        boxShadow: '0 24px 60px -12px rgba(44,4,5,0.18), 0 0 0 0 rgba(196,163,90,0.4)',
        animation: 'pwa-update-pop 0.35s cubic-bezier(0.34, 1.56, 0.64, 1)',
      }}
    >
      <style>{`
        @keyframes pwa-update-pop {
          from { transform: translateY(20px) scale(0.96); opacity: 0; }
          to   { transform: translateY(0) scale(1); opacity: 1; }
        }
      `}</style>
      <div style={{ display: 'flex', alignItems: 'flex-start', gap: 10 }}>
        <div style={{
          width: 28, height: 28, borderRadius: 8,
          background: '#18181b', color: '#e8bc59',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          flexShrink: 0,
        }}>
          <Icons.Sparkles size={14} />
        </div>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{
            fontFamily: 'JetBrains Mono, monospace',
            fontSize: 9,
            letterSpacing: '0.22em',
            textTransform: 'uppercase',
            color: '#8b6a17',
            fontWeight: 600,
            marginBottom: 4,
          }}>New design ready</div>
          <p style={{ margin: 0, fontSize: 13, color: '#18181b', lineHeight: 1.4 }}>
            A new version of the LIVV OS bundle is available.
          </p>
        </div>
      </div>
      <div style={{ display: 'flex', gap: 6, marginTop: 12 }}>
        <button
          onClick={() => setUpdateAvailable(false)}
          style={{
            padding: '6px 12px',
            background: 'transparent',
            border: '0.5px solid rgba(214,209,199,0.55)',
            borderRadius: 8,
            fontSize: 11.5,
            color: '#71717a',
            cursor: 'pointer',
          }}
        >Later</button>
        <button
          onClick={handleApplyUpdate}
          style={{
            flex: 1,
            padding: '6px 12px',
            background: '#18181b',
            color: '#fafafa',
            border: 0,
            borderRadius: 8,
            fontSize: 11.5,
            fontWeight: 500,
            cursor: 'pointer',
            display: 'inline-flex',
            alignItems: 'center',
            justifyContent: 'center',
            gap: 5,
          }}
        >
          <Icons.RefreshCw size={11} />
          Refresh & see it
        </button>
      </div>
    </div>
  );
};
