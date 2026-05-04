/**
 * ContentStrategyPanel — pinned strategy "brain" for the Content calendar.
 *
 * Lives at the top of pages/Calendar.tsx when calendarMode === 'content'.
 * Holds:
 *  - Pinned summary (always-visible recap, AI-generated or manual)
 *  - Weekly objectives — anchored to the week the user is viewing
 *  - Reference documents (links + uploaded files) the AI can use
 *  - AI suggestions panel (cached + on-demand regenerate)
 *
 * Collapsible — once expanded the user can edit. The collapsed state shows
 * just the headline + 3 active objectives + count of docs so the user has
 * the "fixed in mind" feeling without losing canvas room for the calendar.
 */

import React, { useMemo, useRef, useState } from 'react';
import { Icons } from '../ui/Icons';
import { useContentStrategy, type StrategyDoc, type StrategyObjective } from '../../hooks/useContentStrategy';
import { useTenant } from '../../context/TenantContext';
import { supabase } from '../../lib/supabase';
import { generateContentStrategySuggestions } from '../../lib/ai';
import { errorLogger } from '../../lib/errorLogger';

interface Props {
  /** Monday of the currently-viewed week (YYYY-MM-DD). Used to scope objectives. */
  weekStart: string;
  /** Optional callback when the AI suggests a date — lets parent jump to it. */
  onPickSuggestedDate?: (isoDate: string) => void;
}

const STORAGE_KEY = 'eneas-os:content-strategy-panel-expanded';

export const ContentStrategyPanel: React.FC<Props> = ({ weekStart, onPickSuggestedDate }) => {
  const { strategy, loading, update, addObjective, updateObjective, deleteObjective, addDocument, deleteDocument } = useContentStrategy();
  const { currentTenant } = useTenant();

  const [expanded, setExpanded] = useState<boolean>(() => {
    try { return localStorage.getItem(STORAGE_KEY) !== '0'; } catch { return true; }
  });
  const toggle = () => {
    setExpanded(v => {
      const next = !v;
      try { localStorage.setItem(STORAGE_KEY, next ? '1' : '0'); } catch {}
      return next;
    });
  };

  const [newObjective, setNewObjective] = useState('');
  const [newDocName, setNewDocName] = useState('');
  const [newDocUrl, setNewDocUrl] = useState('');
  const [generating, setGenerating] = useState(false);
  const [genError, setGenError] = useState<string | null>(null);
  const [savingNotes, setSavingNotes] = useState(false);
  const [notesDraft, setNotesDraft] = useState('');
  const [notesEditing, setNotesEditing] = useState(false);
  const fileRef = useRef<HTMLInputElement | null>(null);
  const [uploadingDoc, setUploadingDoc] = useState(false);

  // Keep notesDraft in sync with strategy whenever we leave editing.
  React.useEffect(() => {
    if (!notesEditing) setNotesDraft(strategy?.pinned_notes || '');
  }, [strategy?.pinned_notes, notesEditing]);

  // Objectives split: this week, evergreen (week_start=null), other weeks.
  const weekObjectives = useMemo(() =>
    (strategy?.objectives || []).filter(o => o.week_start === weekStart),
    [strategy?.objectives, weekStart],
  );
  const evergreenObjectives = useMemo(() =>
    (strategy?.objectives || []).filter(o => o.week_start === null),
    [strategy?.objectives],
  );
  const activeObjectives = [...weekObjectives, ...evergreenObjectives].filter(o => !o.done);
  const totalDocs = strategy?.documents?.length || 0;
  const aiItems = strategy?.ai_suggestions?.items || [];

  // ── Add objective ──────────────────────────────────────────────────
  const handleAddObjective = async () => {
    const text = newObjective.trim();
    if (!text) return;
    try {
      await addObjective(text, weekStart);
      setNewObjective('');
    } catch {}
  };

  // ── Add document (link or upload) ──────────────────────────────────
  const handleAddLink = async () => {
    const name = newDocName.trim() || newDocUrl.trim();
    const url = newDocUrl.trim();
    if (!url) return;
    try {
      await addDocument({ name, url, kind: 'link' });
      setNewDocName('');
      setNewDocUrl('');
    } catch {}
  };

  const handleUploadFile = async (file: File) => {
    if (!currentTenant?.id) return;
    setUploadingDoc(true);
    try {
      const ext = file.name.split('.').pop() || 'bin';
      const id = crypto.randomUUID();
      const path = `content-strategy/${currentTenant.id}/${id}.${ext}`;
      const { error: upErr } = await supabase.storage
        .from('tenant-assets')
        .upload(path, file, { upsert: true, contentType: file.type });
      if (upErr) throw upErr;
      const { data: urlData } = supabase.storage.from('tenant-assets').getPublicUrl(path);
      await addDocument({ name: file.name, url: urlData.publicUrl, kind: 'upload' });
    } catch (err) {
      errorLogger.error('strategy doc upload failed', err);
    } finally {
      setUploadingDoc(false);
    }
  };

  // ── Save pinned notes ──────────────────────────────────────────────
  const handleSaveNotes = async () => {
    setSavingNotes(true);
    try {
      await update({ pinned_notes: notesDraft.trim() || null });
      setNotesEditing(false);
    } catch {} finally {
      setSavingNotes(false);
    }
  };

  // ── Generate AI suggestions ────────────────────────────────────────
  const handleGenerate = async () => {
    setGenerating(true);
    setGenError(null);
    try {
      const payload = {
        tenant_name: currentTenant?.name || 'this brand',
        week_start: weekStart,
        summary: strategy?.summary || '',
        pinned_notes: strategy?.pinned_notes || '',
        objectives: (strategy?.objectives || []).map(o => ({ text: o.text, done: o.done, week: o.week_start })),
        documents: (strategy?.documents || []).map(d => ({ name: d.name, url: d.url, kind: d.kind })),
      };
      const result = await generateContentStrategySuggestions(JSON.stringify(payload));
      const items = (result?.items || []).map((it: any) => ({
        id: crypto.randomUUID(),
        title: String(it.title || ''),
        body: String(it.body || ''),
        suggested_date: it.suggested_date || null,
        format: it.format || null,
        hook: it.hook || null,
      }));
      const summary = typeof result?.summary === 'string' ? result.summary : null;
      await update({
        ai_suggestions: { generated_at: new Date().toISOString(), items },
        ...(summary ? { summary } : {}),
      });
    } catch (err: any) {
      setGenError(err?.message || 'Could not generate suggestions');
    } finally {
      setGenerating(false);
    }
  };

  // ── Render ─────────────────────────────────────────────────────────
  if (loading && !strategy) {
    return (
      <div className="rounded-2xl border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 p-4 mb-3 text-[11px] text-zinc-400 flex items-center gap-2">
        <div className="w-3 h-3 border-2 border-zinc-300 border-t-zinc-600 rounded-full animate-spin" />
        Loading content brain…
      </div>
    );
  }

  return (
    <div className="rounded-2xl border border-zinc-200 dark:border-zinc-800 bg-gradient-to-br from-amber-50/60 via-white to-white dark:from-amber-500/5 dark:via-zinc-900 dark:to-zinc-900 mb-3 overflow-hidden">
      {/* Header — always visible */}
      <button
        onClick={toggle}
        className="w-full flex items-center gap-3 px-4 py-3 hover:bg-amber-50/40 dark:hover:bg-amber-500/5 transition-colors"
      >
        <div className="p-1.5 rounded-lg bg-amber-100/70 dark:bg-amber-500/15 shrink-0">
          <Icons.Sparkles size={13} className="text-amber-600 dark:text-amber-400" />
        </div>
        <div className="flex-1 min-w-0 text-left">
          <div className="flex items-center gap-2">
            <span className="text-[10px] font-semibold uppercase tracking-[0.14em] text-amber-700 dark:text-amber-400">Content brain</span>
            {strategy?.summary && (
              <span className="text-[10px] text-zinc-400">·</span>
            )}
            <span className="text-[12px] font-medium text-zinc-700 dark:text-zinc-200 truncate">
              {strategy?.summary || 'Cargá tu estrategia, objetivos y referencias para que la IA proponga ideas.'}
            </span>
          </div>
          {!expanded && activeObjectives.length > 0 && (
            <div className="mt-1 flex items-center gap-2 flex-wrap">
              {activeObjectives.slice(0, 3).map(o => (
                <span key={o.id} className="text-[10px] text-zinc-500 dark:text-zinc-400 inline-flex items-center gap-1">
                  <span className="w-1 h-1 rounded-full bg-zinc-400" />
                  {o.text}
                </span>
              ))}
              {activeObjectives.length > 3 && (
                <span className="text-[10px] text-zinc-400">+{activeObjectives.length - 3} más</span>
              )}
            </div>
          )}
        </div>
        <div className="flex items-center gap-3 text-[10px] text-zinc-400 dark:text-zinc-500 shrink-0">
          <span className="hidden sm:inline">{activeObjectives.length} {activeObjectives.length === 1 ? 'objetivo' : 'objetivos'}</span>
          <span className="hidden sm:inline">·</span>
          <span className="hidden sm:inline">{totalDocs} {totalDocs === 1 ? 'doc' : 'docs'}</span>
          <Icons.ChevronDown size={13} className={`transition-transform ${expanded ? 'rotate-180' : ''}`} />
        </div>
      </button>

      {/* Body — only visible when expanded */}
      {expanded && (
        <div className="border-t border-amber-200/40 dark:border-amber-500/10 p-4 grid grid-cols-1 lg:grid-cols-3 gap-4">
          {/* ─── Column 1: Objectives ─── */}
          <div>
            <div className="flex items-center justify-between mb-2">
              <span className="text-[10px] font-semibold uppercase tracking-[0.14em] text-zinc-500 dark:text-zinc-400">
                Objetivos · semana del {new Date(weekStart + 'T12:00:00').toLocaleDateString('es-AR', { day: 'numeric', month: 'short' })}
              </span>
            </div>
            <div className="space-y-1.5">
              {weekObjectives.length === 0 && evergreenObjectives.length === 0 && (
                <p className="text-[11px] text-zinc-400 italic">Sin objetivos todavía.</p>
              )}
              {[...weekObjectives, ...evergreenObjectives].map(o => (
                <ObjectiveRow
                  key={o.id}
                  obj={o}
                  onToggle={(done) => updateObjective(o.id, { done })}
                  onDelete={() => deleteObjective(o.id)}
                />
              ))}
            </div>
            <div className="mt-2 flex items-center gap-1.5">
              <input
                value={newObjective}
                onChange={(e) => setNewObjective(e.target.value)}
                onKeyDown={(e) => { if (e.key === 'Enter') handleAddObjective(); }}
                placeholder="Nuevo objetivo de la semana…"
                className="flex-1 px-2.5 py-1.5 text-[11.5px] bg-white dark:bg-zinc-800/50 border border-zinc-200 dark:border-zinc-700 rounded-lg outline-none focus:ring-2 focus:ring-amber-300/30 text-zinc-700 dark:text-zinc-200 placeholder:text-zinc-400"
              />
              {newObjective.trim() && (
                <button
                  onClick={handleAddObjective}
                  className="px-2.5 py-1.5 text-[11px] font-medium bg-zinc-900 dark:bg-zinc-100 text-white dark:text-zinc-900 rounded-lg hover:opacity-90"
                >
                  Add
                </button>
              )}
            </div>
          </div>

          {/* ─── Column 2: Documents + Notes ─── */}
          <div>
            <div className="flex items-center justify-between mb-2">
              <span className="text-[10px] font-semibold uppercase tracking-[0.14em] text-zinc-500 dark:text-zinc-400">
                Estrategias y referencias
              </span>
            </div>

            {/* Pinned notes */}
            <div className="mb-3">
              {notesEditing ? (
                <>
                  <textarea
                    autoFocus
                    value={notesDraft}
                    onChange={(e) => setNotesDraft(e.target.value)}
                    rows={3}
                    placeholder="Escribí la estrategia / pilares / tono / audiencia para que la IA lo tenga siempre presente…"
                    className="w-full px-2.5 py-2 text-[11.5px] bg-white dark:bg-zinc-800/50 border border-zinc-200 dark:border-zinc-700 rounded-lg outline-none focus:ring-2 focus:ring-amber-300/30 text-zinc-700 dark:text-zinc-200 placeholder:text-zinc-400 resize-none"
                  />
                  <div className="flex justify-end gap-1.5 mt-1.5">
                    <button
                      onClick={() => { setNotesDraft(strategy?.pinned_notes || ''); setNotesEditing(false); }}
                      className="px-2.5 py-1 text-[11px] text-zinc-500 hover:text-zinc-800 dark:hover:text-zinc-200"
                    >Cancelar</button>
                    <button
                      onClick={handleSaveNotes}
                      disabled={savingNotes}
                      className="px-2.5 py-1 text-[11px] font-medium bg-zinc-900 dark:bg-zinc-100 text-white dark:text-zinc-900 rounded-lg hover:opacity-90 disabled:opacity-40"
                    >{savingNotes ? '…' : 'Guardar'}</button>
                  </div>
                </>
              ) : (
                <button
                  onClick={() => setNotesEditing(true)}
                  className={`w-full text-left p-2.5 rounded-lg text-[11.5px] transition-colors ${
                    strategy?.pinned_notes
                      ? 'bg-white dark:bg-zinc-800/50 border border-zinc-200 dark:border-zinc-700 text-zinc-700 dark:text-zinc-200'
                      : 'bg-zinc-50 dark:bg-zinc-800/30 border border-dashed border-zinc-300 dark:border-zinc-700 text-zinc-400 hover:border-zinc-400 dark:hover:border-zinc-600'
                  }`}
                >
                  {strategy?.pinned_notes || 'Click para escribir la estrategia base (pilares, tono, audiencia, do/don\'t)…'}
                </button>
              )}
            </div>

            {/* Docs list */}
            <div className="space-y-1">
              {(strategy?.documents || []).map(d => (
                <DocRow key={d.id} doc={d} onDelete={() => deleteDocument(d.id)} />
              ))}
            </div>

            {/* Add doc — link or file */}
            <div className="mt-2 flex items-center gap-1.5">
              <input
                value={newDocUrl}
                onChange={(e) => setNewDocUrl(e.target.value)}
                onKeyDown={(e) => { if (e.key === 'Enter') handleAddLink(); }}
                placeholder="Pegá un link…"
                className="flex-1 px-2.5 py-1.5 text-[11.5px] bg-white dark:bg-zinc-800/50 border border-zinc-200 dark:border-zinc-700 rounded-lg outline-none focus:ring-2 focus:ring-amber-300/30 text-zinc-700 dark:text-zinc-200 placeholder:text-zinc-400 min-w-0"
              />
              <button
                onClick={() => fileRef.current?.click()}
                disabled={uploadingDoc}
                title="Subir archivo"
                className="px-2 py-1.5 text-zinc-500 hover:text-zinc-800 dark:hover:text-zinc-200 hover:bg-zinc-100 dark:hover:bg-zinc-800 rounded-lg disabled:opacity-40"
              >
                {uploadingDoc ? <span className="text-[10px]">…</span> : <Icons.Paperclip size={13} />}
              </button>
              <input
                ref={fileRef}
                type="file"
                hidden
                onChange={(e) => {
                  const f = e.target.files?.[0];
                  if (f) handleUploadFile(f);
                  if (fileRef.current) fileRef.current.value = '';
                }}
              />
            </div>
          </div>

          {/* ─── Column 3: AI suggestions ─── */}
          <div>
            <div className="flex items-center justify-between mb-2">
              <span className="text-[10px] font-semibold uppercase tracking-[0.14em] text-zinc-500 dark:text-zinc-400 flex items-center gap-1.5">
                <Icons.Sparkles size={10} className="text-amber-500" />
                AI sugiere
              </span>
              <button
                onClick={handleGenerate}
                disabled={generating}
                className="text-[10px] font-medium px-2 py-1 rounded-md bg-amber-100/80 hover:bg-amber-100 dark:bg-amber-500/15 dark:hover:bg-amber-500/25 text-amber-700 dark:text-amber-300 disabled:opacity-50"
              >
                {generating ? '…' : aiItems.length > 0 ? 'Regenerar' : 'Generar'}
              </button>
            </div>

            {genError && (
              <p className="text-[10px] text-rose-500 mb-2">{genError}</p>
            )}

            {aiItems.length === 0 && !generating && (
              <p className="text-[11px] text-zinc-400 italic">
                {strategy?.pinned_notes || (strategy?.documents?.length || 0) > 0
                  ? 'Click "Generar" para que la IA proponga posts a partir de tu estrategia.'
                  : 'Cargá la estrategia o un documento para que la IA tenga material.'}
              </p>
            )}

            <div className="space-y-2 max-h-[260px] overflow-y-auto pr-1">
              {aiItems.map(item => (
                <div
                  key={item.id}
                  className="p-2.5 rounded-lg bg-white dark:bg-zinc-800/50 border border-zinc-200 dark:border-zinc-700"
                >
                  <div className="flex items-start justify-between gap-2 mb-1">
                    <h4 className="text-[12px] font-semibold text-zinc-800 dark:text-zinc-100 leading-tight">{item.title}</h4>
                    {item.suggested_date && onPickSuggestedDate && (
                      <button
                        onClick={() => onPickSuggestedDate(item.suggested_date!)}
                        title="Saltar al día sugerido"
                        className="text-[10px] font-mono text-amber-600 dark:text-amber-400 hover:underline shrink-0"
                      >
                        {new Date(item.suggested_date + 'T12:00:00').toLocaleDateString('es-AR', { day: 'numeric', month: 'short' })}
                      </button>
                    )}
                  </div>
                  <p className="text-[11px] text-zinc-600 dark:text-zinc-300 leading-snug">{item.body}</p>
                  {(item.format || item.hook) && (
                    <div className="mt-1.5 flex items-center gap-2 flex-wrap text-[9.5px] text-zinc-400">
                      {item.format && <span className="px-1.5 py-0.5 bg-zinc-100 dark:bg-zinc-800 rounded uppercase tracking-wider font-medium">{item.format}</span>}
                      {item.hook && <span className="italic truncate">"{item.hook}"</span>}
                    </div>
                  )}
                </div>
              ))}
            </div>

            {strategy?.ai_suggestions?.generated_at && (
              <p className="text-[9.5px] text-zinc-400 mt-2 text-right">
                Generado {new Date(strategy.ai_suggestions.generated_at).toLocaleString('es-AR', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })}
              </p>
            )}
          </div>
        </div>
      )}
    </div>
  );
};

// ──────────────────────────────────────────────────────────────────────
//  Sub-rows
// ──────────────────────────────────────────────────────────────────────

const ObjectiveRow: React.FC<{
  obj: StrategyObjective;
  onToggle: (done: boolean) => void;
  onDelete: () => void;
}> = ({ obj, onToggle, onDelete }) => (
  <div className="group flex items-center gap-2 px-1.5 py-1 rounded hover:bg-white/60 dark:hover:bg-zinc-800/40 transition-colors">
    <button
      onClick={() => onToggle(!obj.done)}
      className={`w-3.5 h-3.5 rounded-full border-2 flex items-center justify-center shrink-0 transition-colors ${
        obj.done
          ? 'bg-emerald-500 border-emerald-500'
          : 'border-zinc-300 dark:border-zinc-600 hover:border-emerald-400'
      }`}
    >
      {obj.done && <Icons.Check size={8} className="text-white" />}
    </button>
    <span className={`flex-1 text-[11.5px] ${obj.done ? 'line-through text-zinc-400' : 'text-zinc-700 dark:text-zinc-200'}`}>
      {obj.text}
    </span>
    {obj.week_start === null && (
      <span className="text-[9px] text-zinc-400 uppercase tracking-wider">Pin</span>
    )}
    <button
      onClick={onDelete}
      className="opacity-0 group-hover:opacity-100 text-zinc-300 hover:text-rose-500 transition-all p-0.5"
    >
      <Icons.X size={11} />
    </button>
  </div>
);

const DocRow: React.FC<{
  doc: StrategyDoc;
  onDelete: () => void;
}> = ({ doc, onDelete }) => {
  const Icon = doc.kind === 'upload' ? Icons.Paperclip : doc.kind === 'doc' ? Icons.Docs : Icons.Link;
  return (
    <div className="group flex items-center gap-2 px-2 py-1.5 rounded-lg bg-white dark:bg-zinc-800/50 border border-zinc-100 dark:border-zinc-800">
      <Icon size={11} className="text-zinc-400 shrink-0" />
      <a
        href={doc.url}
        target="_blank"
        rel="noopener noreferrer"
        className="flex-1 text-[11.5px] text-zinc-700 dark:text-zinc-200 hover:text-amber-700 dark:hover:text-amber-400 truncate"
        title={doc.url}
      >
        {doc.name}
      </a>
      <button
        onClick={onDelete}
        className="opacity-0 group-hover:opacity-100 text-zinc-300 hover:text-rose-500 transition-all p-0.5"
      >
        <Icons.X size={10} />
      </button>
    </div>
  );
};
