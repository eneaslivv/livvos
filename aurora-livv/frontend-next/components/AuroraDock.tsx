'use client';
import { useEffect, useRef, useState } from 'react';
import { X, Send } from 'lucide-react';
import { Canvas } from './Canvas';
import { agents, cssVarsForAgent, type AgentSlug } from '@/lib/tokens';
import { registry } from '@/lib/agents';

interface Msg {
  role: 'user' | 'agent';
  agent?: AgentSlug;
  text: string;
  canvas?: any;
}

interface Props {
  agent: AgentSlug;
  onChangeAgent: (a: AgentSlug) => void;
  onClose: () => void;
  seed: { text: string; agent: AgentSlug } | null;
  onConsumeSeed: () => void;
}

export function AuroraDock({ agent, onChangeAgent, onClose, seed, onConsumeSeed }: Props) {
  const meta = agents[agent];
  const [msgs, setMsgs] = useState<Msg[]>([
    { role: 'agent', agent, text: openerFor(agent) }
  ]);
  const [input, setInput] = useState('');
  const [mode, setMode] = useState<'multi' | 'unified'>('multi');
  const bodyRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const v = window.localStorage.getItem('aurora_mode');
    if (v === 'multi' || v === 'unified') setMode(v);
    function onModeEvt(e: any) { setMode(e.detail); }
    window.addEventListener('aurora-mode', onModeEvt as any);
    return () => window.removeEventListener('aurora-mode', onModeEvt as any);
  }, []);

  // when agent switches, drop an opener
  const lastAgent = useRef(agent);
  useEffect(() => {
    if (lastAgent.current !== agent) {
      setMsgs(m => [...m, { role: 'agent', agent, text: openerFor(agent) }]);
      lastAgent.current = agent;
    }
  }, [agent]);

  // seed from page chips
  useEffect(() => {
    if (seed && seed.agent === agent) {
      send(seed.text);
      onConsumeSeed();
    } else if (seed) {
      onChangeAgent(seed.agent);
    }
  }, [seed, agent]); // eslint-disable-line

  // scroll to bottom
  useEffect(() => { bodyRef.current?.scrollTo({ top: 1e9, behavior: 'smooth' }); }, [msgs]);

  async function send(text: string) {
    if (!text.trim()) return;
    setInput('');
    setMsgs(m => [...m, { role: 'user', text }]);

    const r = await fetch('/api/chat', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ agent, message: text }),
    });
    const data = await r.json();

    // Atlas route → swap agent and replay
    if (data.canvas?.type === 'route' && data.canvas.target_agent && data.canvas.target_agent !== agent) {
      setMsgs(m => [...m, { role: 'agent', agent: 'atlas', text: data.text, canvas: data.canvas }]);
      setTimeout(() => {
        onChangeAgent(data.canvas.target_agent);
        // re-send the user's text after agent swap
        setTimeout(() => send(text), 200);
      }, 400);
      return;
    }

    setMsgs(m => [...m, { role: 'agent', agent: data.agent, text: data.text, canvas: data.canvas }]);
  }

  return (
    <div className="aurora-dock" style={cssVarsForAgent(agent)}>
      <div className="head">
        <div className="orb-mini" />
        <div className="who">
          <div className="name">{mode === 'unified' ? 'Livv Assistant' : meta.display_name}</div>
          <div className="tag">{mode === 'unified' ? 'todo en uno' : meta.tagline}</div>
        </div>
        <button onClick={onClose} aria-label="Cerrar"><X size={18} /></button>
      </div>

      {mode === 'multi' && (
        <div className="switcher">
          {registry.map(a => (
            <button
              key={a.slug}
              className={a.slug === agent ? 'active' : ''}
              style={a.slug === agent ? cssVarsForAgent(a.slug) : undefined}
              onClick={() => onChangeAgent(a.slug)}
            >{a.display_name}</button>
          ))}
        </div>
      )}

      <div className="body" ref={bodyRef}>
        {msgs.map((m, i) => (
          <div key={i} className={`bubble ${m.role}${m.canvas ? ' with-canvas' : ''}`} style={m.role === 'agent' && m.agent ? cssVarsForAgent(m.agent) : undefined}>
            {m.role === 'agent' && m.canvas ? (
              <>
                <div className="body-text">{m.text}</div>
                <Canvas canvas={m.canvas} onConfirm={() => setMsgs(ms => [...ms, { role: 'agent', agent: m.agent, text: 'Listo, confirmado. (mock)' }])} />
              </>
            ) : (
              m.text
            )}
          </div>
        ))}
      </div>

      <div className="composer">
        <input
          value={input}
          onChange={e => setInput(e.target.value)}
          onKeyDown={e => { if (e.key === 'Enter') send(input); }}
          placeholder={`Escribile a ${mode === 'unified' ? 'Livv' : meta.display_name}...`}
        />
        <button onClick={() => send(input)}><Send size={16} /></button>
      </div>
    </div>
  );
}

function openerFor(a: AgentSlug): string {
  switch (a) {
    case 'atlas':  return 'Hola. Decime qué necesitás y te paso con quien lo lleva.';
    case 'solara': return 'Solara acá. ¿Qué movemos del pipeline?';
    case 'marina': return 'Marina. Decime qué número querés ver.';
    case 'nova':   return 'Nova. Decime la ventana y la métrica.';
  }
}
