/**
 * BriefSettings — modal where the user toggles which categories show
 * in the Daily Brief + reorders them + picks the AI synthesis tone.
 *
 * Reorder is done with up/down arrows (cheap to ship, accessible,
 * works on touch). Could be upgraded to drag-and-drop later if the
 * list grows past ~8 items.
 */
import React, { useState } from 'react';
import { motion } from 'framer-motion';
import { Icons } from '../ui/Icons';
import { CATEGORY_REGISTRY, type CategoryId, type CategoryMeta } from '../../lib/brief/data-loaders';
import { SPRING_ENTER, SPRING_TAP } from '../../lib/ui/motion';

interface Prefs {
  enabled_categories: CategoryId[];
  ai_synthesis_enabled: boolean;
  synthesis_tone: 'concise' | 'warm' | 'direct' | 'coaching';
  show_top_recommendation: boolean;
}

interface Props {
  prefs: Prefs;
  onClose: () => void;
  onSave: (prefs: Prefs) => void;
}

const TONE_PILL: Record<string, string> = {
  rose:    'bg-rose-50 dark:bg-rose-500/10 text-rose-700 dark:text-rose-300',
  emerald: 'bg-emerald-50 dark:bg-emerald-500/10 text-emerald-700 dark:text-emerald-300',
  violet:  'bg-violet-50 dark:bg-violet-500/10 text-violet-700 dark:text-violet-300',
  fuchsia: 'bg-fuchsia-50 dark:bg-fuchsia-500/10 text-fuchsia-700 dark:text-fuchsia-300',
  amber:   'bg-amber-50 dark:bg-amber-500/10 text-amber-700 dark:text-amber-300',
  blue:    'bg-blue-50 dark:bg-blue-500/10 text-blue-700 dark:text-blue-300',
  indigo:  'bg-indigo-50 dark:bg-indigo-500/10 text-indigo-700 dark:text-indigo-300',
  zinc:    'bg-zinc-100 dark:bg-zinc-800 text-zinc-600 dark:text-zinc-300',
};

export const BriefSettings: React.FC<Props> = ({ prefs, onClose, onSave }) => {
  const [draft, setDraft] = useState<Prefs>(prefs);

  // Build the ordered list of categories: enabled first (in user order),
  // then disabled (in registry order). Each row shows a toggle + arrows.
  const enabledSet = new Set(draft.enabled_categories);
  const enabledInOrder = draft.enabled_categories
    .map(id => CATEGORY_REGISTRY.find(m => m.id === id))
    .filter((m): m is CategoryMeta => !!m);
  const disabled = CATEGORY_REGISTRY.filter(m => !enabledSet.has(m.id));

  const toggle = (id: CategoryId) => {
    if (enabledSet.has(id)) {
      setDraft(d => ({ ...d, enabled_categories: d.enabled_categories.filter(c => c !== id) }));
    } else {
      setDraft(d => ({ ...d, enabled_categories: [...d.enabled_categories, id] }));
    }
  };

  const move = (id: CategoryId, direction: -1 | 1) => {
    setDraft(d => {
      const arr = [...d.enabled_categories];
      const idx = arr.indexOf(id);
      if (idx < 0) return d;
      const target = idx + direction;
      if (target < 0 || target >= arr.length) return d;
      [arr[idx], arr[target]] = [arr[target], arr[idx]];
      return { ...d, enabled_categories: arr };
    });
  };

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      transition={{ duration: 0.18 }}
      onClick={onClose}
      className="fixed inset-0 z-[80] bg-zinc-900/40 dark:bg-black/60 backdrop-blur-sm flex items-center justify-center p-4"
    >
      <motion.div
        onClick={e => e.stopPropagation()}
        initial={{ opacity: 0, y: 12, scale: 0.97 }}
        animate={{ opacity: 1, y: 0, scale: 1 }}
        exit={{ opacity: 0, scale: 0.98, transition: { duration: 0.15 } }}
        transition={SPRING_ENTER}
        className="w-full max-w-md bg-white dark:bg-zinc-900 rounded-2xl border border-zinc-200 dark:border-zinc-800 shadow-2xl overflow-hidden"
      >
        {/* Header */}
        <div className="px-5 py-4 border-b border-zinc-100 dark:border-zinc-800/60 flex items-center justify-between">
          <div>
            <h3 className="text-[14px] font-semibold text-zinc-900 dark:text-zinc-100">Configure your brief</h3>
            <p className="text-[10.5px] text-zinc-400 mt-0.5">Pick which categories to surface, in what order.</p>
          </div>
          <button onClick={onClose} className="p-1 rounded-md text-zinc-400 hover:text-zinc-700 dark:hover:text-zinc-200 hover:bg-zinc-100 dark:hover:bg-zinc-800 transition-colors">
            <Icons.X size={14} />
          </button>
        </div>

        {/* Body */}
        <div className="px-5 py-4 max-h-[60vh] overflow-y-auto space-y-4">
          {/* AI synthesis section */}
          <section>
            <div className="text-[10px] font-bold uppercase tracking-wider text-zinc-400 mb-2">AI synthesis</div>
            <label className="flex items-start gap-2 cursor-pointer">
              <input
                type="checkbox"
                checked={draft.ai_synthesis_enabled}
                onChange={e => setDraft(d => ({ ...d, ai_synthesis_enabled: e.target.checked }))}
                className="mt-0.5 rounded"
              />
              <div className="flex-1">
                <div className="text-[12px] font-medium text-zinc-800 dark:text-zinc-200">Generate a narrative summary</div>
                <div className="text-[10.5px] text-zinc-500 dark:text-zinc-400">
                  Adds a 2-3 sentence digest at the top of the brief that interprets the cards in context of your strategy + learned style.
                </div>
              </div>
            </label>

            {draft.ai_synthesis_enabled && (
              <>
                <label className="flex items-start gap-2 mt-2.5 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={draft.show_top_recommendation}
                    onChange={e => setDraft(d => ({ ...d, show_top_recommendation: e.target.checked }))}
                    className="mt-0.5 rounded"
                  />
                  <div className="flex-1">
                    <div className="text-[12px] font-medium text-zinc-800 dark:text-zinc-200">Suggest one action to do first</div>
                    <div className="text-[10.5px] text-zinc-500 dark:text-zinc-400">
                      A single concrete recommendation based on what's most important right now.
                    </div>
                  </div>
                </label>

                <div className="mt-3">
                  <div className="text-[10.5px] font-medium text-zinc-700 dark:text-zinc-300 mb-1.5">Tone</div>
                  <div className="flex flex-wrap gap-1">
                    {(['concise','warm','direct','coaching'] as const).map(t => (
                      <motion.button
                        key={t}
                        onClick={() => setDraft(d => ({ ...d, synthesis_tone: t }))}
                        whileTap={{ scale: 0.96, transition: SPRING_TAP }}
                        className={`text-[10.5px] px-2 py-1 rounded-md capitalize transition-colors ${
                          draft.synthesis_tone === t
                            ? 'bg-violet-600 text-white'
                            : 'bg-zinc-100 dark:bg-zinc-800 text-zinc-600 dark:text-zinc-300 hover:bg-zinc-200 dark:hover:bg-zinc-700'
                        }`}
                      >{t}</motion.button>
                    ))}
                  </div>
                </div>
              </>
            )}
          </section>

          {/* Enabled categories — ordered, with move arrows */}
          <section>
            <div className="flex items-center justify-between mb-2">
              <div className="text-[10px] font-bold uppercase tracking-wider text-zinc-400">Showing</div>
              <span className="text-[10px] text-zinc-400 tabular-nums">{enabledInOrder.length} active</span>
            </div>
            <div className="space-y-1">
              {enabledInOrder.length === 0 && (
                <p className="text-[11px] text-zinc-400 italic">All categories disabled. Add some from the list below.</p>
              )}
              {enabledInOrder.map((meta, idx) => {
                const IconCmp = (Icons as any)[meta.icon] || Icons.Sparkles;
                return (
                  <CategoryRow
                    key={meta.id}
                    meta={meta}
                    iconCmp={IconCmp}
                    enabled
                    onToggle={() => toggle(meta.id)}
                    onMoveUp={idx > 0 ? () => move(meta.id, -1) : undefined}
                    onMoveDown={idx < enabledInOrder.length - 1 ? () => move(meta.id, 1) : undefined}
                  />
                );
              })}
            </div>
          </section>

          {/* Disabled */}
          {disabled.length > 0 && (
            <section>
              <div className="text-[10px] font-bold uppercase tracking-wider text-zinc-400 mb-2">Available</div>
              <div className="space-y-1">
                {disabled.map(meta => {
                  const IconCmp = (Icons as any)[meta.icon] || Icons.Sparkles;
                  return (
                    <CategoryRow
                      key={meta.id}
                      meta={meta}
                      iconCmp={IconCmp}
                      enabled={false}
                      onToggle={() => toggle(meta.id)}
                    />
                  );
                })}
              </div>
            </section>
          )}
        </div>

        {/* Footer */}
        <div className="px-5 py-3 border-t border-zinc-100 dark:border-zinc-800/60 flex items-center justify-end gap-2">
          <button onClick={onClose} className="px-3 py-1.5 text-[11.5px] font-medium text-zinc-600 dark:text-zinc-300 hover:bg-zinc-100 dark:hover:bg-zinc-800 rounded-lg transition-colors">Cancel</button>
          <motion.button
            onClick={() => onSave(draft)}
            whileTap={{ scale: 0.97, transition: SPRING_TAP }}
            className="px-3 py-1.5 text-[11.5px] font-semibold text-white bg-violet-600 hover:bg-violet-700 rounded-lg transition-colors inline-flex items-center gap-1.5"
          >
            <Icons.Save size={12} />
            Save preferences
          </motion.button>
        </div>
      </motion.div>
    </motion.div>
  );
};

const CategoryRow: React.FC<{
  meta: CategoryMeta;
  iconCmp: any;
  enabled: boolean;
  onToggle: () => void;
  onMoveUp?: () => void;
  onMoveDown?: () => void;
}> = ({ meta, iconCmp: IconCmp, enabled, onToggle, onMoveUp, onMoveDown }) => (
  <div className={`flex items-start gap-2 p-2 rounded-lg border ${
    enabled ? 'border-zinc-200/70 dark:border-zinc-800 bg-white dark:bg-zinc-900' : 'border-zinc-200/40 dark:border-zinc-800/40 bg-zinc-50/40 dark:bg-zinc-900/40'
  }`}>
    <span className={`w-6 h-6 rounded-md flex items-center justify-center shrink-0 ${TONE_PILL[meta.tone]}`}>
      <IconCmp size={11} />
    </span>
    <div className="flex-1 min-w-0">
      <div className={`text-[12px] font-medium ${enabled ? 'text-zinc-800 dark:text-zinc-200' : 'text-zinc-500 dark:text-zinc-400'}`}>{meta.label}</div>
      <div className="text-[10px] text-zinc-500 dark:text-zinc-400 mt-0.5 line-clamp-2">{meta.describe}</div>
    </div>
    {/* Reorder arrows — only enabled rows */}
    {enabled && (
      <div className="flex flex-col gap-0.5 shrink-0">
        <button onClick={onMoveUp} disabled={!onMoveUp} className="p-1 rounded text-zinc-400 hover:text-zinc-700 dark:hover:text-zinc-200 hover:bg-zinc-100 dark:hover:bg-zinc-800 disabled:opacity-30 transition-colors" title="Move up">
          <Icons.ChevronDown size={10} className="rotate-180" />
        </button>
        <button onClick={onMoveDown} disabled={!onMoveDown} className="p-1 rounded text-zinc-400 hover:text-zinc-700 dark:hover:text-zinc-200 hover:bg-zinc-100 dark:hover:bg-zinc-800 disabled:opacity-30 transition-colors" title="Move down">
          <Icons.ChevronDown size={10} />
        </button>
      </div>
    )}
    <motion.button
      onClick={onToggle}
      whileTap={{ scale: 0.94, transition: SPRING_TAP }}
      className={`px-2 py-1 rounded-md text-[10px] font-semibold transition-colors shrink-0 ${
        enabled
          ? 'bg-emerald-50 dark:bg-emerald-500/10 text-emerald-700 dark:text-emerald-300 hover:bg-emerald-100 dark:hover:bg-emerald-500/20'
          : 'bg-zinc-100 dark:bg-zinc-800 text-zinc-600 dark:text-zinc-300 hover:bg-zinc-200 dark:hover:bg-zinc-700'
      }`}
    >
      {enabled ? '✓ ON' : '+ ADD'}
    </motion.button>
  </div>
);
