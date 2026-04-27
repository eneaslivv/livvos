import React from 'react';
import { Icons } from '../ui/Icons';
import { supabase } from '../../lib/supabase';

export interface AiSummaryData {
  objectives: string[];
  focus_tasks: string[];
  recommendations: string[];
}

export interface AiWeeklySummaryProps {
  aiSummary: AiSummaryData | null;
  aiSummaryLoading: boolean;
  aiSummaryError: string | null;
  aiSummaryExpanded: boolean;
  setAiSummaryExpanded: (v: boolean) => void;
  showAiPromptInput: boolean;
  setShowAiPromptInput: (v: boolean) => void;
  aiCustomPrompt: string;
  setAiCustomPrompt: (v: string) => void;
  onGenerate: (customExtra?: string) => void;
  onClearError: () => void;
}

export const AiWeeklySummary: React.FC<AiWeeklySummaryProps> = ({
  aiSummary,
  aiSummaryLoading,
  aiSummaryError,
  aiSummaryExpanded,
  setAiSummaryExpanded,
  showAiPromptInput,
  setShowAiPromptInput,
  aiCustomPrompt,
  setAiCustomPrompt,
  onGenerate,
  onClearError,
}) => {
  return (
    <div className="mb-4">
      {!aiSummary && !aiSummaryLoading && (
        <button
          onClick={() => onGenerate()}
          className="flex items-center gap-1.5 px-2 py-1 rounded-md text-zinc-500 dark:text-zinc-400 hover:text-indigo-600 dark:hover:text-indigo-400 hover:bg-indigo-50/60 dark:hover:bg-indigo-950/20 transition-colors"
        >
          <Icons.Sparkles size={13} className="text-indigo-500 dark:text-indigo-400" />
          <span className="text-xs font-medium">Weekly summary</span>
        </button>
      )}

      {aiSummaryLoading && (
        <div className="flex items-center gap-3 px-4 py-3 rounded-xl bg-indigo-50/60 dark:bg-indigo-950/20 border border-indigo-100 dark:border-indigo-900/40">
          <div className="w-6 h-6 rounded-lg bg-gradient-to-br from-indigo-500 to-purple-500 flex items-center justify-center animate-pulse">
            <Icons.Sparkles size={12} className="text-white" />
          </div>
          <div className="flex-1">
            <div className="flex items-center gap-2">
              <div className="h-1.5 w-24 bg-indigo-200 dark:bg-indigo-800 rounded-full overflow-hidden">
                <div className="h-full w-1/2 bg-indigo-500 rounded-full animate-[shimmer_1.5s_ease-in-out_infinite]" style={{ animation: 'pulse 1.5s ease-in-out infinite' }} />
              </div>
              <span className="text-[11px] font-medium text-indigo-500 dark:text-indigo-400">Analyzing your week...</span>
            </div>
          </div>
        </div>
      )}

      {aiSummaryError && (
        <div className="flex items-center gap-2 px-4 py-2.5 rounded-xl bg-red-50 dark:bg-red-950/20 border border-red-100 dark:border-red-900/40 mb-2">
          <Icons.AlertCircle size={14} className="text-red-500 shrink-0" />
          <span className="text-xs text-red-600 dark:text-red-400">{aiSummaryError}</span>
          {/log in|session has ended|sesión/i.test(aiSummaryError) ? (
            <button
              onClick={async () => { await supabase.auth.signOut(); window.location.reload(); }}
              className="ml-auto text-[10px] font-semibold text-red-500 hover:text-red-700 transition-colors"
            >
              Log in again
            </button>
          ) : (
            <button onClick={() => { onClearError(); onGenerate(); }} className="ml-auto text-[10px] font-semibold text-red-500 hover:text-red-700 transition-colors">
              Retry
            </button>
          )}
        </div>
      )}

      {aiSummary && !aiSummaryLoading && (
        <div className="rounded-xl border border-zinc-200/60 dark:border-zinc-800/60 bg-white dark:bg-zinc-900/50 overflow-hidden">
          {/* Summary header -- always visible */}
          <button
            onClick={() => setAiSummaryExpanded(!aiSummaryExpanded)}
            className="w-full flex items-center gap-3 px-4 py-3 hover:bg-zinc-50 dark:hover:bg-zinc-800/30 transition-colors"
          >
            <div className="w-6 h-6 rounded-lg bg-gradient-to-br from-indigo-500 to-purple-500 flex items-center justify-center shrink-0">
              <Icons.Sparkles size={12} className="text-white" />
            </div>
            <div className="flex-1 text-left min-w-0">
              <span className="text-xs font-semibold text-zinc-900 dark:text-zinc-100">AI Weekly Summary</span>
              <span className="ml-2 text-[10px] text-zinc-400 dark:text-zinc-500">
                {aiSummary.objectives.length} objectives · {aiSummary.focus_tasks.length} key tasks · {aiSummary.recommendations.length} recommendations
              </span>
            </div>
            <div className="flex items-center gap-1.5 shrink-0">
              <button
                onClick={(e) => { e.stopPropagation(); setShowAiPromptInput(!showAiPromptInput); }}
                className="p-1.5 rounded-lg text-zinc-400 hover:text-indigo-500 hover:bg-indigo-50 dark:hover:bg-indigo-950/30 transition-colors"
                title="Add custom context"
              >
                <Icons.Message size={13} />
              </button>
              <button
                onClick={(e) => { e.stopPropagation(); onGenerate(); }}
                className="p-1.5 rounded-lg text-zinc-400 hover:text-indigo-500 hover:bg-indigo-50 dark:hover:bg-indigo-950/30 transition-colors"
                title="Regenerate summary"
              >
                <Icons.RefreshCw size={13} />
              </button>
              <Icons.ChevronDown size={14} className={`text-zinc-400 transition-transform duration-200 ${aiSummaryExpanded ? 'rotate-180' : ''}`} />
            </div>
          </button>

          {/* Custom prompt input */}
          {showAiPromptInput && (
            <div className="px-4 pb-3 border-t border-zinc-100 dark:border-zinc-800/60">
              <div className="flex items-center gap-2 mt-3">
                <input
                  type="text"
                  value={aiCustomPrompt}
                  onChange={(e) => setAiCustomPrompt(e.target.value)}
                  onKeyDown={(e) => { if (e.key === 'Enter' && aiCustomPrompt.trim()) onGenerate(aiCustomPrompt); }}
                  placeholder="E.g.: Focus on client X deliverables, prioritize design..."
                  className="flex-1 px-3 py-2 text-xs bg-zinc-50 dark:bg-zinc-800/60 border border-zinc-200 dark:border-zinc-700 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500/30 focus:border-indigo-400 dark:focus:border-indigo-600 placeholder-zinc-400"
                />
                <button
                  onClick={() => onGenerate(aiCustomPrompt)}
                  disabled={!aiCustomPrompt.trim()}
                  className="px-3 py-2 bg-indigo-600 text-white rounded-lg text-xs font-semibold hover:bg-indigo-700 transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
                >
                  Generate
                </button>
              </div>
              <p className="text-[10px] text-zinc-400 mt-1.5">Add extra context to customize the summary</p>
            </div>
          )}

          {/* Expanded content */}
          {aiSummaryExpanded && (
            <div className="px-4 pb-4 border-t border-zinc-100 dark:border-zinc-800/60">
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mt-4">
                {/* Objectives */}
                <div>
                  <div className="flex items-center gap-1.5 mb-2.5">
                    <div className="w-4 h-4 rounded bg-blue-100 dark:bg-blue-900/40 flex items-center justify-center">
                      <Icons.Target size={10} className="text-blue-600 dark:text-blue-400" />
                    </div>
                    <span className="text-[10px] font-bold text-zinc-500 dark:text-zinc-400 uppercase tracking-wider">Objectives</span>
                  </div>
                  <ul className="space-y-1.5">
                    {aiSummary.objectives.map((obj, i) => (
                      <li key={i} className="flex items-start gap-2 text-xs text-zinc-700 dark:text-zinc-300 leading-relaxed">
                        <span className="w-4 h-4 rounded-full bg-blue-50 dark:bg-blue-900/20 flex items-center justify-center shrink-0 mt-0.5 text-[9px] font-bold text-blue-500">{i + 1}</span>
                        {obj}
                      </li>
                    ))}
                  </ul>
                </div>

                {/* Focus Tasks */}
                <div>
                  <div className="flex items-center gap-1.5 mb-2.5">
                    <div className="w-4 h-4 rounded bg-amber-100 dark:bg-amber-900/40 flex items-center justify-center">
                      <Icons.Zap size={10} className="text-amber-600 dark:text-amber-400" />
                    </div>
                    <span className="text-[10px] font-bold text-zinc-500 dark:text-zinc-400 uppercase tracking-wider">Key Tasks</span>
                  </div>
                  <ul className="space-y-1.5">
                    {aiSummary.focus_tasks.map((task, i) => (
                      <li key={i} className="flex items-start gap-2 text-xs text-zinc-700 dark:text-zinc-300 leading-relaxed">
                        <div className="w-1.5 h-1.5 rounded-full bg-amber-400 dark:bg-amber-500 shrink-0 mt-1.5" />
                        {task}
                      </li>
                    ))}
                  </ul>
                </div>

                {/* Recommendations */}
                <div>
                  <div className="flex items-center gap-1.5 mb-2.5">
                    <div className="w-4 h-4 rounded bg-emerald-100 dark:bg-emerald-900/40 flex items-center justify-center">
                      <Icons.Lightbulb size={10} className="text-emerald-600 dark:text-emerald-400" />
                    </div>
                    <span className="text-[10px] font-bold text-zinc-500 dark:text-zinc-400 uppercase tracking-wider">Recommendations</span>
                  </div>
                  <ul className="space-y-1.5">
                    {aiSummary.recommendations.map((rec, i) => (
                      <li key={i} className="flex items-start gap-2 text-xs text-zinc-700 dark:text-zinc-300 leading-relaxed">
                        <div className="w-1.5 h-1.5 rounded-full bg-emerald-400 dark:bg-emerald-500 shrink-0 mt-1.5" />
                        {rec}
                      </li>
                    ))}
                  </ul>
                </div>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
};
