'use client';
import { useEffect, useState } from 'react';
import { defaultAgentForModule } from '@/lib/agents';
import { agents } from '@/lib/tokens';

export function Topbar({ title, module }: { title: string; module: string }) {
  const [mode, setMode] = useState<'multi' | 'unified'>('multi');
  const def = defaultAgentForModule(module);
  const agent = agents[def];

  // Persist mode in localStorage so the toggle survives reloads (like tenant_config.agent_mode would).
  useEffect(() => {
    const v = window.localStorage.getItem('aurora_mode');
    if (v === 'multi' || v === 'unified') setMode(v);
  }, []);
  useEffect(() => { window.localStorage.setItem('aurora_mode', mode); window.dispatchEvent(new CustomEvent('aurora-mode', { detail: mode })); }, [mode]);

  return (
    <div className="topbar">
      <h1>{title}</h1>
      <div className="right">
        <span style={{ fontSize: 12, color: 'var(--text-muted)' }}>
          Default aquí: <span style={{ color: agent.accent_hex, fontWeight: 600 }}>{agent.display_name}</span>
        </span>
        <button
          style={{
            padding: '6px 10px', borderRadius: 999, border: '1px solid var(--border)',
            background: 'var(--surface)', color: 'var(--text)', fontSize: 12
          }}
          onClick={() => setMode(mode === 'multi' ? 'unified' : 'multi')}
          title="Toggle multi-personalidad / unificado"
        >
          modo: {mode}
        </button>
      </div>
    </div>
  );
}
