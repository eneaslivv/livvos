import React, { useState } from 'react';
import { motion } from 'framer-motion';
import { X, Send, Check } from 'lucide-react';

export interface NewOrderInput {
  title: string;
  description: string;
  priority: 'low' | 'medium' | 'high' | 'urgent';
}

const PRIORITIES: { key: NewOrderInput['priority']; label: string; dot: string }[] = [
  { key: 'low',    label: 'Baja',    dot: 'bg-emerald-500' },
  { key: 'medium', label: 'Media',   dot: 'bg-blue-500' },
  { key: 'high',   label: 'Alta',    dot: 'bg-amber-500' },
  { key: 'urgent', label: 'Urgente', dot: 'bg-rose-500' },
];

/**
 * Client-facing "Nuevo pedido" form. The client submits a work request that
 * lands in the agency's orders inbox (and notifies all staff). Pure UI — the
 * actual insert is handled by the onSubmit callback passed from ClientPortalView
 * (which owns the supabase client + tenant/client context).
 */
const NewOrderModal: React.FC<{
  onClose: () => void;
  onSubmit: (input: NewOrderInput) => Promise<void>;
  projectTitle?: string;
}> = ({ onClose, onSubmit, projectTitle }) => {
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [priority, setPriority] = useState<NewOrderInput['priority']>('medium');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!title.trim() || submitting) return;
    setSubmitting(true);
    setError(null);
    try {
      await onSubmit({ title: title.trim(), description: description.trim(), priority });
      setDone(true);
      setTimeout(onClose, 1300);
    } catch (err: any) {
      setError(err?.message || 'No se pudo enviar el pedido. Probá de nuevo.');
      setSubmitting(false);
    }
  };

  return (
    <motion.div
      className="fixed inset-0 z-[120] flex items-center justify-center p-4 bg-black/40 backdrop-blur-sm"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      onClick={onClose}
    >
      <motion.div
        className="w-full max-w-lg bg-white dark:bg-zinc-900 rounded-3xl border border-zinc-200/70 dark:border-zinc-800 shadow-2xl overflow-hidden"
        initial={{ opacity: 0, y: 24, scale: 0.97 }}
        animate={{ opacity: 1, y: 0, scale: 1 }}
        exit={{ opacity: 0, y: 24, scale: 0.97 }}
        transition={{ duration: 0.28, ease: [0.16, 1, 0.3, 1] }}
        onClick={(e) => e.stopPropagation()}
      >
        {done ? (
          <div className="px-8 py-14 text-center">
            <div className="w-14 h-14 rounded-full bg-emerald-50 dark:bg-emerald-900/20 flex items-center justify-center mx-auto mb-4">
              <Check size={26} className="text-emerald-600 dark:text-emerald-400" strokeWidth={2.5} />
            </div>
            <h3 className="text-lg font-semibold text-zinc-900 dark:text-zinc-100 mb-1">¡Pedido enviado!</h3>
            <p className="text-sm text-zinc-500">El equipo ya lo recibió y te va a responder pronto.</p>
          </div>
        ) : (
          <form onSubmit={submit}>
            {/* Header */}
            <div className="flex items-start justify-between px-7 pt-6 pb-4 border-b border-zinc-100 dark:border-zinc-800">
              <div>
                <div className="text-[10px] font-semibold uppercase tracking-[0.18em] text-[#C4A35A]">Nuevo pedido</div>
                <h3 className="text-lg font-semibold text-zinc-900 dark:text-zinc-100 mt-1">¿Qué necesitás?</h3>
                {projectTitle && (
                  <p className="text-[11px] text-zinc-400 mt-0.5">Para {projectTitle}</p>
                )}
              </div>
              <button
                type="button"
                onClick={onClose}
                className="p-1.5 rounded-full text-zinc-400 hover:text-zinc-700 hover:bg-zinc-100 dark:hover:bg-zinc-800 transition-colors"
              >
                <X size={18} />
              </button>
            </div>

            {/* Body */}
            <div className="px-7 py-5 space-y-5">
              <div>
                <label className="block text-[11px] font-medium text-zinc-500 uppercase tracking-wider mb-2">Título</label>
                <input
                  type="text"
                  value={title}
                  onChange={(e) => { setTitle(e.target.value); setError(null); }}
                  placeholder="Ej. Agregar sección de testimonios"
                  className="w-full px-4 py-3 bg-white dark:bg-zinc-950 border border-zinc-200 dark:border-zinc-800 rounded-xl text-zinc-800 dark:text-zinc-100 placeholder-zinc-400 focus:outline-none focus:ring-2 focus:ring-[#2C0405]/15 focus:border-[#2C0405] transition-all"
                  autoFocus
                  maxLength={140}
                  required
                />
              </div>

              <div>
                <label className="block text-[11px] font-medium text-zinc-500 uppercase tracking-wider mb-2">Detalle <span className="text-zinc-300 normal-case">(opcional)</span></label>
                <textarea
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  placeholder="Contanos un poco más: qué, para cuándo, referencias…"
                  rows={4}
                  className="w-full px-4 py-3 bg-white dark:bg-zinc-950 border border-zinc-200 dark:border-zinc-800 rounded-xl text-zinc-800 dark:text-zinc-100 placeholder-zinc-400 focus:outline-none focus:ring-2 focus:ring-[#2C0405]/15 focus:border-[#2C0405] transition-all resize-none"
                  maxLength={2000}
                />
              </div>

              <div>
                <label className="block text-[11px] font-medium text-zinc-500 uppercase tracking-wider mb-2">Prioridad</label>
                <div className="flex flex-wrap gap-2">
                  {PRIORITIES.map((p) => (
                    <button
                      key={p.key}
                      type="button"
                      onClick={() => setPriority(p.key)}
                      className={`inline-flex items-center gap-1.5 px-3.5 py-2 rounded-full text-[12px] font-medium border transition-all ${
                        priority === p.key
                          ? 'border-[#2C0405] bg-[#2C0405]/5 text-[#2C0405] dark:text-[#e8a0a2] dark:border-[#e8a0a2]/40'
                          : 'border-zinc-200 dark:border-zinc-800 text-zinc-500 hover:border-zinc-300'
                      }`}
                    >
                      <span className={`w-1.5 h-1.5 rounded-full ${p.dot}`} />
                      {p.label}
                    </button>
                  ))}
                </div>
              </div>

              {error && (
                <div className="p-3 rounded-xl text-sm bg-rose-50 border border-rose-200 text-rose-700">{error}</div>
              )}
            </div>

            {/* Footer */}
            <div className="flex items-center justify-end gap-2 px-7 py-4 border-t border-zinc-100 dark:border-zinc-800 bg-zinc-50/50 dark:bg-zinc-900/50">
              <button
                type="button"
                onClick={onClose}
                className="px-4 py-2.5 text-sm font-medium text-zinc-500 hover:text-zinc-800 transition-colors"
              >
                Cancelar
              </button>
              <button
                type="submit"
                disabled={submitting || !title.trim()}
                className="inline-flex items-center gap-2 px-5 py-2.5 text-sm font-semibold text-white rounded-full bg-[#2C0405] hover:bg-[#1a0203] shadow-lg shadow-[#2C0405]/20 disabled:opacity-50 disabled:cursor-not-allowed transition-all"
              >
                {submitting ? (
                  <>
                    <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                    Enviando…
                  </>
                ) : (
                  <>
                    <Send size={14} />
                    Enviar pedido
                  </>
                )}
              </button>
            </div>
          </form>
        )}
      </motion.div>
    </motion.div>
  );
};

export default NewOrderModal;
