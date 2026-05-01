import React, { useState, useMemo, useRef, useEffect, useCallback } from 'react';
import {
  Sparkles, Mic, MicOff, Wand2, CheckCircle2, X,
  ArrowDownLeft, ArrowUpFromLine, Loader2, Pencil, AlertCircle,
  FileSpreadsheet, Upload, ChevronDown, ChevronRight, UserPlus, Plus,
} from 'lucide-react';
import * as XLSX from 'xlsx';
import { SlidePanel } from '../ui/SlidePanel';
import {
  parseFinanceEntryFromAI,
  parseFinanceBatchFromAI,
  type FinanceEntryAIResult,
} from '../../lib/ai';
import { useFinance, type CreateIncomeData, type CreateExpenseData } from '../../context/FinanceContext';
import { useProjects, type Project } from '../../context/ProjectsContext';
import { useClients, type Client } from '../../context/ClientsContext';

const EXPENSE_CATEGORIES = ['Software', 'Talent', 'Marketing', 'Operations', 'Legal'] as const;
const MAX_BATCH_ROWS = 50;

const fmtCurrency = (v: number) =>
  new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 }).format(v);

type Step = 'input' | 'parsing' | 'preview' | 'preview_batch' | 'saving' | 'done';

type DraftEntry = {
  kind: 'income' | 'expense';
  concept: string;
  amount: number;
  date: string;
  client_id: string | null;
  client_name: string | null;
  project_id: string | null;
  project_name: string | null;
  category: string | null;
  vendor: string | null;
  num_installments: number;
  status: 'paid' | 'pending';
  recurring: boolean;
  notes: string | null;
};

const buildSinglePrompt = (
  text: string,
  clients: Client[],
  projects: Project[],
): string => {
  const today = new Date().toISOString().slice(0, 10);
  const clientLines = clients.slice(0, 80).map(c => `- id: ${c.id} | name: ${c.name}${c.company ? ` (${c.company})` : ''}`).join('\n');
  const projectLines = projects.slice(0, 80).map(p => `- id: ${p.id} | title: ${p.title} | client: ${p.client || p.clientName || '—'} | client_id: ${p.client_id || '—'}`).join('\n');
  return [
    `TODAY: ${today}`,
    '',
    'EXPENSE_CATEGORIES:',
    ...EXPENSE_CATEGORIES.map(c => `- ${c}`),
    '',
    'CLIENTS:',
    clientLines || '(none)',
    '',
    'PROJECTS:',
    projectLines || '(none)',
    '',
    'USER_INPUT:',
    text.trim(),
  ].join('\n');
};

const buildBatchPrompt = (
  csvText: string,
  fileName: string,
  clients: Client[],
  projects: Project[],
): string => {
  const today = new Date().toISOString().slice(0, 10);
  const clientLines = clients.slice(0, 80).map(c => `- id: ${c.id} | name: ${c.name}${c.company ? ` (${c.company})` : ''}`).join('\n');
  const projectLines = projects.slice(0, 80).map(p => `- id: ${p.id} | title: ${p.title} | client: ${p.client || p.clientName || '—'} | client_id: ${p.client_id || '—'}`).join('\n');
  return [
    `TODAY: ${today}`,
    `FILE: ${fileName}`,
    '',
    'EXPENSE_CATEGORIES:',
    ...EXPENSE_CATEGORIES.map(c => `- ${c}`),
    '',
    'CLIENTS:',
    clientLines || '(none)',
    '',
    'PROJECTS:',
    projectLines || '(none)',
    '',
    'SPREADSHEET_DATA (CSV):',
    csvText,
  ].join('\n');
};

const toDraft = (r: FinanceEntryAIResult): DraftEntry => ({
  kind: r.kind,
  concept: r.concept || '',
  amount: Number(r.amount) || 0,
  date: r.date || new Date().toISOString().slice(0, 10),
  client_id: r.client_id || null,
  client_name: r.client_name || null,
  project_id: r.project_id || null,
  project_name: r.project_name || null,
  category: r.category || (r.kind === 'expense' ? 'Operations' : null),
  vendor: r.vendor || null,
  num_installments: Math.max(1, Number(r.num_installments) || 1),
  status: r.status === 'paid' ? 'paid' : 'pending',
  recurring: !!r.recurring,
  notes: r.notes || null,
});

const EXAMPLES = [
  'Recibí $2.500 de Coffe Payper por la consultoría de menú, factura el 15',
  'Pagué $89 a Figma de licencias mensuales',
  'Cobramos 3 cuotas de $1.000 a Studio Vélez por el rediseño web',
];

interface FinanceAssistantProps {
  isOpen: boolean;
  onClose: () => void;
}

export const FinanceAssistant: React.FC<FinanceAssistantProps> = ({ isOpen, onClose }) => {
  const { createIncome, createExpense } = useFinance();
  const { projects } = useProjects();
  const { clients, createClient } = useClients();

  const [step, setStep] = useState<Step>('input');
  const [userInput, setUserInput] = useState('');
  const [draft, setDraft] = useState<DraftEntry | null>(null);
  const [batchDrafts, setBatchDrafts] = useState<DraftEntry[]>([]);
  const [selectedRows, setSelectedRows] = useState<Set<number>>(new Set());
  const [expandedRow, setExpandedRow] = useState<number | null>(null);
  const [unknownClients, setUnknownClients] = useState<string[]>([]);
  const [unknownProjects, setUnknownProjects] = useState<string[]>([]);
  const [questions, setQuestions] = useState<string[]>([]);
  const [confidence, setConfidence] = useState<number>(0);
  const [error, setError] = useState<string | null>(null);
  const [savedCount, setSavedCount] = useState(0);

  // File upload state
  const [fileName, setFileName] = useState<string | null>(null);
  const [filePreview, setFilePreview] = useState<{ headers: string[]; rows: any[][]; totalRows: number } | null>(null);
  const [csvText, setCsvText] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [isListening, setIsListening] = useState(false);
  const recognitionRef = useRef<any>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const voiceBaseRef = useRef<string>('');

  // Reset state every time the panel re-opens so each invocation starts fresh.
  useEffect(() => {
    if (isOpen) {
      setStep('input');
      setUserInput('');
      setDraft(null);
      setBatchDrafts([]);
      setSelectedRows(new Set());
      setExpandedRow(null);
      setUnknownClients([]);
      setUnknownProjects([]);
      setQuestions([]);
      setConfidence(0);
      setError(null);
      setSavedCount(0);
      setFileName(null);
      setFilePreview(null);
      setCsvText(null);
      setTimeout(() => textareaRef.current?.focus(), 80);
    } else {
      try { recognitionRef.current?.abort?.(); } catch { /* noop */ }
      recognitionRef.current = null;
      setIsListening(false);
    }
  }, [isOpen]);

  // ─── Voice input (Web Speech API, graceful degradation) ──────────
  const speechSupported = typeof window !== 'undefined' && (
    'SpeechRecognition' in window || 'webkitSpeechRecognition' in window
  );

  const toggleListening = useCallback(() => {
    if (!speechSupported) return;
    if (isListening) {
      try { recognitionRef.current?.stop(); } catch { /* noop */ }
      return;
    }
    // Tear down any leftover instance from a fast double-click before spinning up a new one.
    try { recognitionRef.current?.abort?.(); } catch { /* noop */ }
    recognitionRef.current = null;

    const SR = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
    const rec = new SR();
    rec.lang = navigator.language || 'es-ES';
    rec.interimResults = true;
    rec.continuous = false;

    // Snapshot whatever the user had typed before pressing the mic.
    // Every onresult call rewrites the textarea as `base + final + interim`,
    // so we never accumulate stale partial transcripts.
    voiceBaseRef.current = userInput.trim();
    let finalTranscript = '';

    const compose = (interim: string) => {
      const tail = `${finalTranscript}${interim ? (finalTranscript ? ' ' : '') + interim : ''}`.trim();
      const base = voiceBaseRef.current;
      if (!tail) return base;
      return base ? `${base} ${tail}` : tail;
    };

    rec.onresult = (ev: any) => {
      let interim = '';
      for (let i = ev.resultIndex; i < ev.results.length; i++) {
        const txt = ev.results[i][0].transcript;
        if (ev.results[i].isFinal) finalTranscript += txt;
        else interim += txt;
      }
      setUserInput(compose(interim));
    };
    rec.onerror = () => setIsListening(false);
    rec.onend = () => {
      setIsListening(false);
      setUserInput(compose(''));
    };
    recognitionRef.current = rec;
    setIsListening(true);
    try { rec.start(); } catch { setIsListening(false); }
  }, [isListening, speechSupported, userInput]);

  // ─── File upload handling ────────────────────────────────────────
  const handleFile = useCallback(async (file: File) => {
    setError(null);
    if (file.size > 5 * 1024 * 1024) {
      setError('El archivo supera 5MB. Probá con uno más chico.');
      return;
    }
    try {
      const buf = await file.arrayBuffer();
      const wb = XLSX.read(buf, { type: 'array' });
      const sheet = wb.Sheets[wb.SheetNames[0]];
      if (!sheet) {
        setError('No pude leer la primera hoja del archivo.');
        return;
      }
      const aoa: any[][] = XLSX.utils.sheet_to_json(sheet, { header: 1, blankrows: false, defval: '' });
      if (aoa.length === 0) {
        setError('El archivo está vacío.');
        return;
      }
      const headers = (aoa[0] || []).map(v => String(v ?? '').trim());
      const rows = aoa.slice(1, MAX_BATCH_ROWS + 1);
      const csv = XLSX.utils.sheet_to_csv(sheet);
      setFileName(file.name);
      setFilePreview({ headers, rows, totalRows: aoa.length - 1 });
      setCsvText(csv.length > 24000 ? csv.slice(0, 24000) : csv);
    } catch (err: any) {
      console.error('[FinanceAssistant] file parse error', err);
      setError('No pude leer ese archivo. Asegurate de que sea CSV o Excel válido.');
    }
  }, []);

  const onPickFile = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0];
    if (f) handleFile(f);
    e.target.value = '';
  }, [handleFile]);

  const onDrop = useCallback((e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    const f = e.dataTransfer.files?.[0];
    if (f) handleFile(f);
  }, [handleFile]);

  const clearFile = useCallback(() => {
    setFileName(null);
    setFilePreview(null);
    setCsvText(null);
  }, []);

  // ─── Submit → AI parse (single OR batch depending on file presence) ─
  const handleParse = useCallback(async () => {
    setError(null);

    // Batch mode: a file was uploaded
    if (csvText && filePreview) {
      setStep('parsing');
      try {
        const prompt = buildBatchPrompt(csvText, fileName || 'data.csv', clients, projects);
        const result = await parseFinanceBatchFromAI(prompt);
        const drafts = (result.entries || []).map(toDraft);
        if (drafts.length === 0) {
          setError('La IA no encontró filas válidas en el archivo. Verificá los encabezados.');
          setStep('input');
          return;
        }
        setBatchDrafts(drafts);
        setSelectedRows(new Set(drafts.map((_, i) => i)));
        setUnknownClients(Array.from(new Set((result.unknown_clients || []).filter(s => typeof s === 'string' && s.trim()))));
        setUnknownProjects(Array.from(new Set((result.unknown_projects || []).filter(s => typeof s === 'string' && s.trim()))));
        setStep('preview_batch');
      } catch (err: any) {
        console.error('[FinanceAssistant] batch parse error', err);
        setError(err?.message || 'No pude procesar el archivo.');
        setStep('input');
      }
      return;
    }

    // Single mode (text)
    const input = userInput.trim();
    if (!input || input.length < 4) {
      setError('Describe la operación con al menos unas palabras o subí un archivo.');
      return;
    }
    setStep('parsing');
    try {
      const prompt = buildSinglePrompt(input, clients, projects);
      const result = await parseFinanceEntryFromAI(prompt);
      setDraft(toDraft(result));
      setQuestions(Array.isArray(result.questions) ? result.questions.filter(q => typeof q === 'string' && q.trim().length > 0) : []);
      setConfidence(typeof result.confidence === 'number' ? Math.max(0, Math.min(1, result.confidence)) : 0.7);
      setStep('preview');
    } catch (err: any) {
      console.error('[FinanceAssistant] parse error', err);
      setError(err?.message || 'No pude procesar la descripción. Probá reformular.');
      setStep('input');
    }
  }, [csvText, filePreview, fileName, userInput, clients, projects]);

  // ─── Persist a single draft ──────────────────────────────────────
  const persistDraft = useCallback(async (d: DraftEntry) => {
    const project = d.project_id ? projects.find(p => p.id === d.project_id) : null;
    const client = d.client_id ? clients.find(c => c.id === d.client_id) : null;
    if (d.kind === 'income') {
      const data: CreateIncomeData = {
        client_id: d.client_id || null,
        project_id: d.project_id || null,
        client_name: client?.name || d.client_name || (d.client_id ? 'Client' : 'No client'),
        project_name: project?.title || d.project_name || (d.project_id ? 'Project' : 'No project'),
        concept: d.concept.trim(),
        total_amount: d.amount,
        due_date: d.date,
        num_installments: Math.max(1, d.num_installments || 1),
      };
      await createIncome(data);
    } else {
      const data: CreateExpenseData = {
        category: d.category || 'Operations',
        concept: d.concept.trim(),
        amount: d.amount,
        date: d.date,
        project_id: d.project_id || null,
        project_name: project?.title || d.project_name || 'General',
        client_id: d.client_id || null,
        vendor: d.vendor?.trim() || '',
        recurring: !!d.recurring,
        status: d.status,
      };
      await createExpense(data);
    }
  }, [projects, clients, createIncome, createExpense]);

  // ─── Confirm single ──────────────────────────────────────────────
  const handleConfirm = useCallback(async () => {
    if (!draft) return;
    if (!draft.concept.trim()) { setError('Falta el concepto.'); return; }
    if (!draft.amount || draft.amount <= 0) { setError('El monto debe ser mayor a 0.'); return; }
    if (!draft.date) { setError('Falta la fecha.'); return; }
    setStep('saving');
    setError(null);
    try {
      await persistDraft(draft);
      setSavedCount(1);
      setStep('done');
      setTimeout(() => { onClose(); }, 900);
    } catch (err: any) {
      console.error('[FinanceAssistant] save error', err);
      setError(err?.message || 'No pude guardar la entrada.');
      setStep('preview');
    }
  }, [draft, persistDraft, onClose]);

  // ─── Confirm batch ───────────────────────────────────────────────
  const handleConfirmBatch = useCallback(async () => {
    const toSave = batchDrafts.filter((_, i) => selectedRows.has(i));
    if (toSave.length === 0) { setError('Seleccioná al menos una fila.'); return; }
    setStep('saving');
    setError(null);
    let ok = 0;
    let firstErr: string | null = null;
    for (const d of toSave) {
      try {
        if (!d.concept.trim() || !d.amount || d.amount <= 0 || !d.date) continue;
        await persistDraft(d);
        ok++;
      } catch (err: any) {
        if (!firstErr) firstErr = err?.message || 'Error guardando alguna fila.';
      }
    }
    setSavedCount(ok);
    if (ok === 0 && firstErr) {
      setError(firstErr);
      setStep('preview_batch');
      return;
    }
    setStep('done');
    setTimeout(() => onClose(), 1200);
  }, [batchDrafts, selectedRows, persistDraft, onClose]);

  // ─── Create unknown client on the fly + backfill drafts ──────────
  const handleCreateUnknownClient = useCallback(async (name: string) => {
    try {
      const c = await createClient({ name, status: 'active' } as any);
      const lower = name.trim().toLowerCase();
      setBatchDrafts(prev => prev.map(d =>
        d.client_id === null && d.client_name && d.client_name.trim().toLowerCase() === lower
          ? { ...d, client_id: c.id, client_name: c.name }
          : d
      ));
      if (draft && draft.client_id === null && draft.client_name && draft.client_name.trim().toLowerCase() === lower) {
        setDraft({ ...draft, client_id: c.id, client_name: c.name });
      }
      setUnknownClients(prev => prev.filter(n => n !== name));
    } catch (err: any) {
      console.error('[FinanceAssistant] create client error', err);
      setError(err?.message || 'No pude crear el cliente.');
    }
  }, [createClient, draft]);

  // ─── Helpers for the preview UI ──────────────────────────────────
  const matchedProject = useMemo(
    () => (draft?.project_id ? projects.find(p => p.id === draft.project_id) : null),
    [draft?.project_id, projects],
  );
  const matchedClient = useMemo(
    () => (draft?.client_id ? clients.find(c => c.id === draft.client_id) : null),
    [draft?.client_id, clients],
  );

  const updateDraft = useCallback((patch: Partial<DraftEntry>) => {
    setDraft(prev => (prev ? { ...prev, ...patch } : prev));
  }, []);

  const updateBatchRow = useCallback((idx: number, patch: Partial<DraftEntry>) => {
    setBatchDrafts(prev => prev.map((d, i) => (i === idx ? { ...d, ...patch } : d)));
  }, []);

  const switchKind = useCallback((kind: 'income' | 'expense') => {
    setDraft(prev => prev ? { ...prev, kind, category: kind === 'expense' ? (prev.category || 'Operations') : null } : prev);
  }, []);

  const batchTotals = useMemo(() => {
    let income = 0, expense = 0, n = 0;
    selectedRows.forEach(i => {
      const d = batchDrafts[i];
      if (!d) return;
      n++;
      if (d.kind === 'income') income += d.amount;
      else expense += d.amount;
    });
    return { income, expense, n };
  }, [batchDrafts, selectedRows]);

  // ─── Render ──────────────────────────────────────────────────────
  return (
    <SlidePanel
      isOpen={isOpen}
      onClose={onClose}
      width="2xl"
      title="Add with AI"
      subtitle="Describe la operación o subí un Excel/CSV — la IA llena el formulario y lo sincroniza con tu CRM"
      headerRight={
        <div className="flex items-center gap-1.5 px-2 py-0.5 rounded-full bg-gradient-to-r from-indigo-500/10 via-fuchsia-500/10 to-rose-500/10 border border-fuchsia-500/30">
          <Sparkles size={11} className="text-fuchsia-500" />
          <span className="text-[10px] font-semibold uppercase tracking-wider text-fuchsia-600 dark:text-fuchsia-300">AI</span>
        </div>
      }
      footer={
        step === 'preview' && draft ? (
          <div className="flex items-center justify-between gap-2">
            <button onClick={() => { setStep('input'); }} type="button"
              className="px-3 py-1.5 rounded-lg border border-zinc-200 dark:border-zinc-800 text-xs font-medium text-zinc-500 hover:text-zinc-900 dark:hover:text-zinc-100 hover:bg-zinc-50 dark:hover:bg-zinc-900 transition-colors">
              Reformular
            </button>
            <button onClick={handleConfirm} type="button"
              className="px-4 py-1.5 rounded-lg text-white text-xs font-semibold shadow-sm hover:opacity-90 transition-opacity flex items-center gap-1.5"
              style={{ background: draft.kind === 'income' ? '#059669' : '#18181b' }}>
              <CheckCircle2 size={13} />
              {draft.kind === 'income' ? 'Confirmar Income' : 'Confirmar Expense'}
            </button>
          </div>
        ) : step === 'preview_batch' ? (
          <div className="flex items-center justify-between gap-2 flex-wrap">
            <div className="flex items-center gap-3 text-[11px] text-zinc-500">
              <span className="font-medium text-zinc-700 dark:text-zinc-300">{batchTotals.n} filas seleccionadas</span>
              <span className="text-emerald-600 dark:text-emerald-400 font-semibold">+{fmtCurrency(batchTotals.income)}</span>
              <span className="text-rose-600 dark:text-rose-400 font-semibold">−{fmtCurrency(batchTotals.expense)}</span>
            </div>
            <div className="flex items-center gap-2">
              <button onClick={() => setStep('input')} type="button"
                className="px-3 py-1.5 rounded-lg border border-zinc-200 dark:border-zinc-800 text-xs font-medium text-zinc-500 hover:text-zinc-900 dark:hover:text-zinc-100 hover:bg-zinc-50 dark:hover:bg-zinc-900 transition-colors">
                Volver
              </button>
              <button onClick={handleConfirmBatch} type="button"
                disabled={selectedRows.size === 0}
                className="px-4 py-1.5 rounded-lg text-white text-xs font-semibold shadow-sm hover:opacity-90 disabled:opacity-50 transition-opacity flex items-center gap-1.5"
                style={{ background: 'linear-gradient(135deg, #6366f1 0%, #8b5cf6 50%, #ec4899 100%)' }}>
                <CheckCircle2 size={13} />
                Confirmar {selectedRows.size} {selectedRows.size === 1 ? 'fila' : 'filas'}
              </button>
            </div>
          </div>
        ) : null
      }
    >
      <div className="p-5 space-y-4">

        {/* ─── INPUT STEP ─────────────────────────────────────── */}
        {step === 'input' && (
          <>
            {/* Bigger textarea with optional voice input */}
            <div className="relative">
              <textarea
                ref={textareaRef}
                value={userInput}
                onChange={e => { setUserInput(e.target.value); if (error) setError(null); }}
                onKeyDown={e => {
                  if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) { e.preventDefault(); handleParse(); }
                }}
                rows={8}
                placeholder="Ej: Recibí 2500 USD de Coffe Payper por la consultoría de menú&#10;&#10;Podés escribir varias operaciones, dictarlas con el micrófono, o subir un Excel/CSV abajo."
                className="w-full min-h-[180px] rounded-xl border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 px-4 py-3 pr-12 text-sm leading-relaxed text-zinc-900 dark:text-zinc-100 placeholder:text-zinc-400 resize-y focus:outline-none focus:ring-2 focus:ring-fuchsia-500/30 focus:border-fuchsia-400 transition-all"
              />
              {speechSupported && (
                <button onClick={toggleListening} type="button"
                  title={isListening ? 'Stop recording' : 'Use voice'}
                  className={`absolute right-2 top-2 p-2 rounded-lg transition-all ${
                    isListening
                      ? 'bg-rose-500 text-white shadow-sm animate-pulse'
                      : 'bg-zinc-100 dark:bg-zinc-800 text-zinc-500 hover:text-zinc-900 dark:hover:text-zinc-100'
                  }`}>
                  {isListening ? <MicOff size={14} /> : <Mic size={14} />}
                </button>
              )}
            </div>

            {/* File upload zone */}
            {!filePreview ? (
              <div
                onDrop={onDrop}
                onDragOver={e => e.preventDefault()}
                onClick={() => fileInputRef.current?.click()}
                className="group relative flex items-center gap-3 px-4 py-3 rounded-xl border-2 border-dashed border-zinc-200 dark:border-zinc-800 hover:border-fuchsia-400 dark:hover:border-fuchsia-600 hover:bg-fuchsia-50/30 dark:hover:bg-fuchsia-500/5 cursor-pointer transition-all"
              >
                <div className="p-2 rounded-lg bg-zinc-100 dark:bg-zinc-800 group-hover:bg-fuchsia-100 dark:group-hover:bg-fuchsia-500/20 transition-colors">
                  <FileSpreadsheet size={18} className="text-zinc-500 group-hover:text-fuchsia-600 dark:group-hover:text-fuchsia-300 transition-colors" />
                </div>
                <div className="flex-1 min-w-0">
                  <div className="text-xs font-semibold text-zinc-700 dark:text-zinc-200">Subí un Excel o CSV</div>
                  <div className="text-[10px] text-zinc-400">Arrastrá un archivo o hacé click — la IA procesa hasta {MAX_BATCH_ROWS} filas por vez</div>
                </div>
                <Upload size={14} className="text-zinc-400 group-hover:text-fuchsia-600 transition-colors" />
                <input ref={fileInputRef} type="file" accept=".csv,.xlsx,.xls,.tsv,text/csv" onChange={onPickFile} className="hidden" />
              </div>
            ) : (
              <div className="rounded-xl border border-fuchsia-200 dark:border-fuchsia-800/40 bg-fuchsia-50/40 dark:bg-fuchsia-500/5 p-3 space-y-2">
                <div className="flex items-center gap-2">
                  <div className="p-1.5 rounded-lg bg-fuchsia-100 dark:bg-fuchsia-500/20">
                    <FileSpreadsheet size={14} className="text-fuchsia-600 dark:text-fuchsia-300" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="text-xs font-semibold text-zinc-900 dark:text-zinc-100 truncate">{fileName}</div>
                    <div className="text-[10px] text-zinc-500">
                      {filePreview.totalRows} filas · {filePreview.headers.length} columnas
                      {filePreview.totalRows > MAX_BATCH_ROWS && ` · primeras ${MAX_BATCH_ROWS} se procesarán`}
                    </div>
                  </div>
                  <button onClick={clearFile} type="button" className="p-1.5 rounded-lg text-zinc-400 hover:text-rose-500 hover:bg-rose-50 dark:hover:bg-rose-500/10 transition-colors">
                    <X size={13} />
                  </button>
                </div>
                <div className="overflow-x-auto rounded-lg border border-zinc-100 dark:border-zinc-800/60 bg-white dark:bg-zinc-900/60">
                  <table className="w-full text-[10px]">
                    <thead className="bg-zinc-50/70 dark:bg-zinc-800/30">
                      <tr>
                        {filePreview.headers.slice(0, 6).map((h, i) => (
                          <th key={i} className="px-2 py-1.5 text-left font-semibold text-zinc-500 uppercase tracking-wider whitespace-nowrap">{h || `col${i + 1}`}</th>
                        ))}
                        {filePreview.headers.length > 6 && <th className="px-2 py-1.5 text-left text-zinc-400">+{filePreview.headers.length - 6}</th>}
                      </tr>
                    </thead>
                    <tbody>
                      {filePreview.rows.slice(0, 3).map((row, ri) => (
                        <tr key={ri} className="border-t border-zinc-100 dark:border-zinc-800/40">
                          {row.slice(0, 6).map((cell, ci) => (
                            <td key={ci} className="px-2 py-1.5 text-zinc-600 dark:text-zinc-400 whitespace-nowrap max-w-[140px] truncate">{String(cell ?? '')}</td>
                          ))}
                          {row.length > 6 && <td className="px-2 py-1.5 text-zinc-300">…</td>}
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            )}

            {/* Examples — only when no file is loaded */}
            {!filePreview && (
              <div className="space-y-1.5">
                <div className="text-[10px] font-semibold uppercase tracking-wider text-zinc-400">Ejemplos rápidos</div>
                <div className="flex flex-col gap-1.5">
                  {EXAMPLES.map((ex, i) => (
                    <button key={i} type="button"
                      onClick={() => { setUserInput(ex); textareaRef.current?.focus(); }}
                      className="text-left px-3 py-2 rounded-lg border border-zinc-100 dark:border-zinc-800/60 bg-zinc-50/50 dark:bg-zinc-800/20 hover:border-fuchsia-300 dark:hover:border-fuchsia-700 hover:bg-fuchsia-50/40 dark:hover:bg-fuchsia-500/5 text-[11px] text-zinc-600 dark:text-zinc-300 transition-all">
                      <span className="text-fuchsia-500 mr-1.5">›</span>{ex}
                    </button>
                  ))}
                </div>
              </div>
            )}

            {error && (
              <div className="flex items-start gap-2 text-xs font-medium text-rose-600 bg-rose-50 dark:bg-rose-500/10 border border-rose-200 dark:border-rose-500/20 rounded-lg px-3 py-2">
                <AlertCircle size={13} className="shrink-0 mt-0.5" />
                <span>{error}</span>
              </div>
            )}

            <div className="flex items-center justify-between pt-1">
              <p className="text-[10px] text-zinc-400">⌘/Ctrl + Enter para enviar</p>
              <button onClick={handleParse} type="button"
                disabled={!userInput.trim() && !filePreview}
                className="flex items-center gap-1.5 px-3.5 py-2 rounded-lg text-white text-xs font-semibold shadow-sm hover:opacity-90 disabled:opacity-50 transition-opacity"
                style={{ background: 'linear-gradient(135deg, #6366f1 0%, #8b5cf6 50%, #ec4899 100%)' }}>
                <Wand2 size={13} />
                {filePreview ? 'Procesar archivo' : 'Parse with AI'}
              </button>
            </div>
          </>
        )}

        {/* ─── PARSING STEP ─────────────────────────────── */}
        {step === 'parsing' && (
          <div className="flex flex-col items-center justify-center gap-3 py-16">
            <div className="relative">
              <Loader2 size={32} className="animate-spin text-fuchsia-500" />
              <Sparkles size={14} className="absolute -top-1 -right-1 text-indigo-500 animate-pulse" />
            </div>
            <p className="text-xs text-zinc-500 dark:text-zinc-400">
              {filePreview ? 'Analizando filas y matcheando con tu CRM…' : 'Procesando…'}
            </p>
          </div>
        )}

        {/* ─── SAVING STEP ─────────────────────────────── */}
        {step === 'saving' && (
          <div className="flex flex-col items-center justify-center gap-3 py-16">
            <Loader2 size={32} className="animate-spin text-emerald-500" />
            <p className="text-xs text-zinc-500 dark:text-zinc-400">Guardando…</p>
          </div>
        )}

        {/* ─── PREVIEW STEP ─────────────────────────────────── */}
        {step === 'preview' && draft && (
          <>
            {/* Confidence + kind toggle */}
            <div className="flex items-center justify-between gap-3">
              <div className="inline-flex items-center gap-0.5 p-0.5 rounded-lg bg-zinc-100/70 dark:bg-zinc-900/70">
                <button type="button" onClick={() => switchKind('income')}
                  className={`flex items-center gap-1.5 px-2.5 py-1 rounded-md text-[11px] font-medium transition-all ${
                    draft.kind === 'income'
                      ? 'bg-emerald-600 text-white shadow-sm'
                      : 'text-zinc-500 hover:text-zinc-800 dark:hover:text-zinc-200'
                  }`}>
                  <ArrowDownLeft size={12} />Income
                </button>
                <button type="button" onClick={() => switchKind('expense')}
                  className={`flex items-center gap-1.5 px-2.5 py-1 rounded-md text-[11px] font-medium transition-all ${
                    draft.kind === 'expense'
                      ? 'bg-zinc-900 text-white dark:bg-zinc-100 dark:text-zinc-900 shadow-sm'
                      : 'text-zinc-500 hover:text-zinc-800 dark:hover:text-zinc-200'
                  }`}>
                  <ArrowUpFromLine size={12} />Expense
                </button>
              </div>
              <div className="flex items-center gap-1.5 text-[10px] text-zinc-400">
                <span>Confidence</span>
                <div className="w-16 h-1.5 rounded-full bg-zinc-200 dark:bg-zinc-800 overflow-hidden">
                  <div className="h-full rounded-full transition-all" style={{
                    width: `${Math.round(confidence * 100)}%`,
                    background: confidence > 0.75 ? '#10b981' : confidence > 0.5 ? '#f59e0b' : '#ef4444',
                  }} />
                </div>
                <span className="font-semibold text-zinc-500 dark:text-zinc-300 tabular-nums">{Math.round(confidence * 100)}%</span>
              </div>
            </div>

            {/* AI questions, if any */}
            {questions.length > 0 && (
              <div className="rounded-lg border border-amber-200 dark:border-amber-500/30 bg-amber-50/60 dark:bg-amber-500/5 p-3 space-y-1.5">
                <div className="flex items-center gap-1.5 text-[10px] font-semibold uppercase tracking-wider text-amber-700 dark:text-amber-300">
                  <Sparkles size={11} /> El asistente quiere confirmar
                </div>
                <ul className="space-y-1">
                  {questions.map((q, i) => (
                    <li key={i} className="text-xs text-amber-800 dark:text-amber-200 flex gap-2">
                      <span className="text-amber-500">•</span><span>{q}</span>
                    </li>
                  ))}
                </ul>
              </div>
            )}

            {/* ── Editable preview card ─────────────────────── */}
            <div className="rounded-xl border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900/80 overflow-hidden">
              <div className="px-4 py-3 border-b border-zinc-100 dark:border-zinc-800/60 flex items-center justify-between">
                <input value={draft.concept} onChange={e => updateDraft({ concept: e.target.value })}
                  placeholder="Concepto"
                  className="bg-transparent text-sm font-semibold text-zinc-900 dark:text-zinc-100 focus:outline-none w-full" />
                <div className="flex items-center gap-1.5 text-[10px] text-zinc-400">
                  <Pencil size={10} />edit
                </div>
              </div>

              <div className="p-4 space-y-3">
                {/* Amount + Date */}
                <div className="grid grid-cols-2 gap-3">
                  <div className="space-y-1">
                    <label className="text-[10px] font-semibold uppercase tracking-wider text-zinc-400">Amount</label>
                    <div className="relative">
                      <span className="absolute left-3 top-1/2 -translate-y-1/2 text-xs text-zinc-400">$</span>
                      <input type="number" min="0" step="0.01" value={draft.amount || ''}
                        onChange={e => updateDraft({ amount: Number(e.target.value) || 0 })}
                        className="w-full rounded-lg border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 pl-7 pr-3 py-2 text-sm font-semibold text-zinc-900 dark:text-zinc-100 focus:outline-none focus:ring-2 focus:ring-fuchsia-500/20" />
                    </div>
                  </div>
                  <div className="space-y-1">
                    <label className="text-[10px] font-semibold uppercase tracking-wider text-zinc-400">
                      {draft.kind === 'income' ? 'Due / billed' : 'Date'}
                    </label>
                    <input type="date" value={draft.date}
                      onChange={e => updateDraft({ date: e.target.value })}
                      className="w-full rounded-lg border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 px-3 py-2 text-xs font-medium text-zinc-900 dark:text-zinc-100 focus:outline-none focus:ring-2 focus:ring-fuchsia-500/20" />
                  </div>
                </div>

                {/* Project (synced) */}
                <div className="space-y-1">
                  <label className="text-[10px] font-semibold uppercase tracking-wider text-zinc-400">Project</label>
                  <select value={draft.project_id || ''}
                    onChange={e => {
                      const pid = e.target.value || null;
                      const p = pid ? projects.find(pr => pr.id === pid) : null;
                      const c = p ? clients.find(cl => cl.id === p.client_id || cl.name === p.client || cl.name === p.clientName) : null;
                      updateDraft({
                        project_id: pid,
                        project_name: p?.title || null,
                        client_id: c?.id || draft.client_id,
                        client_name: c?.name || draft.client_name,
                      });
                    }}
                    className="w-full rounded-lg border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 px-3 py-2 text-xs font-medium text-zinc-900 dark:text-zinc-100 focus:outline-none focus:ring-2 focus:ring-fuchsia-500/20">
                    <option value="">— No project —</option>
                    {projects.map(p => (
                      <option key={p.id} value={p.id}>{p.title}{p.client ? ` · ${p.client}` : ''}</option>
                    ))}
                  </select>
                  {matchedProject && (
                    <p className="text-[10px] text-emerald-600 dark:text-emerald-400 flex items-center gap-1">
                      <CheckCircle2 size={10} />Sincronizado con proyecto existente
                    </p>
                  )}
                </div>

                {/* Client (synced) */}
                <div className="space-y-1">
                  <label className="text-[10px] font-semibold uppercase tracking-wider text-zinc-400">Client</label>
                  <select value={draft.client_id || ''}
                    onChange={e => {
                      const cid = e.target.value || null;
                      const c = cid ? clients.find(cl => cl.id === cid) : null;
                      updateDraft({ client_id: cid, client_name: c?.name || null });
                    }}
                    className="w-full rounded-lg border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 px-3 py-2 text-xs font-medium text-zinc-900 dark:text-zinc-100 focus:outline-none focus:ring-2 focus:ring-fuchsia-500/20">
                    <option value="">— No client —</option>
                    {clients.map(c => (
                      <option key={c.id} value={c.id}>{c.name}{c.company ? ` · ${c.company}` : ''}</option>
                    ))}
                  </select>
                  {matchedClient && (
                    <p className="text-[10px] text-emerald-600 dark:text-emerald-400 flex items-center gap-1">
                      <CheckCircle2 size={10} />Sincronizado con cliente del CRM
                    </p>
                  )}
                </div>

                {/* Income-only: installments */}
                {draft.kind === 'income' && (
                  <div className="grid grid-cols-2 gap-3">
                    <div className="space-y-1">
                      <label className="text-[10px] font-semibold uppercase tracking-wider text-zinc-400">Installments</label>
                      <input type="number" min={1} max={36} value={draft.num_installments}
                        onChange={e => updateDraft({ num_installments: Math.max(1, Number(e.target.value) || 1) })}
                        className="w-full rounded-lg border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 px-3 py-2 text-xs font-medium text-zinc-900 dark:text-zinc-100 focus:outline-none focus:ring-2 focus:ring-fuchsia-500/20" />
                    </div>
                    <div className="space-y-1">
                      <label className="text-[10px] font-semibold uppercase tracking-wider text-zinc-400">Per installment</label>
                      <div className="px-3 py-2 rounded-lg bg-zinc-50 dark:bg-zinc-800/40 text-xs font-semibold text-emerald-600 dark:text-emerald-400">
                        {fmtCurrency(draft.amount / Math.max(1, draft.num_installments))}
                      </div>
                    </div>
                  </div>
                )}

                {/* Expense-only: category, vendor, status, recurring */}
                {draft.kind === 'expense' && (
                  <>
                    <div className="grid grid-cols-2 gap-3">
                      <div className="space-y-1">
                        <label className="text-[10px] font-semibold uppercase tracking-wider text-zinc-400">Category</label>
                        <select value={draft.category || 'Operations'}
                          onChange={e => updateDraft({ category: e.target.value })}
                          className="w-full rounded-lg border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 px-3 py-2 text-xs font-medium text-zinc-900 dark:text-zinc-100 focus:outline-none focus:ring-2 focus:ring-fuchsia-500/20">
                          {EXPENSE_CATEGORIES.map(c => <option key={c} value={c}>{c}</option>)}
                        </select>
                      </div>
                      <div className="space-y-1">
                        <label className="text-[10px] font-semibold uppercase tracking-wider text-zinc-400">Status</label>
                        <select value={draft.status} onChange={e => updateDraft({ status: e.target.value as 'paid' | 'pending' })}
                          className="w-full rounded-lg border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 px-3 py-2 text-xs font-medium text-zinc-900 dark:text-zinc-100 focus:outline-none focus:ring-2 focus:ring-fuchsia-500/20">
                          <option value="pending">Pending</option>
                          <option value="paid">Paid</option>
                        </select>
                      </div>
                    </div>
                    <div className="space-y-1">
                      <label className="text-[10px] font-semibold uppercase tracking-wider text-zinc-400">Vendor</label>
                      <input type="text" value={draft.vendor || ''}
                        onChange={e => updateDraft({ vendor: e.target.value })}
                        placeholder="Vendor name"
                        className="w-full rounded-lg border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 px-3 py-2 text-xs font-medium text-zinc-900 dark:text-zinc-100 focus:outline-none focus:ring-2 focus:ring-fuchsia-500/20" />
                    </div>
                    <label className="flex items-center gap-2 cursor-pointer">
                      <input type="checkbox" checked={draft.recurring}
                        onChange={e => updateDraft({ recurring: e.target.checked })}
                        className="rounded border-zinc-300 dark:border-zinc-700 text-fuchsia-600 focus:ring-fuchsia-500" />
                      <span className="text-xs text-zinc-600 dark:text-zinc-400">Recurring (monthly)</span>
                    </label>
                  </>
                )}
              </div>
            </div>

            {error && (
              <div className="flex items-start gap-2 text-xs font-medium text-rose-600 bg-rose-50 dark:bg-rose-500/10 border border-rose-200 dark:border-rose-500/20 rounded-lg px-3 py-2">
                <AlertCircle size={13} className="shrink-0 mt-0.5" />
                <span>{error}</span>
              </div>
            )}
          </>
        )}

        {/* ─── BATCH PREVIEW STEP ────────────────────────── */}
        {step === 'preview_batch' && (
          <BatchPreview
            drafts={batchDrafts}
            selectedRows={selectedRows}
            setSelectedRows={setSelectedRows}
            expandedRow={expandedRow}
            setExpandedRow={setExpandedRow}
            updateBatchRow={updateBatchRow}
            projects={projects}
            clients={clients}
            unknownClients={unknownClients}
            unknownProjects={unknownProjects}
            onCreateClient={handleCreateUnknownClient}
            error={error}
          />
        )}

        {/* ─── DONE STEP ─────────────────────────────────────── */}
        {step === 'done' && (
          <div className="flex flex-col items-center justify-center gap-3 py-16">
            <div className="p-3 rounded-full bg-emerald-100 dark:bg-emerald-500/10">
              <CheckCircle2 size={32} className="text-emerald-600 dark:text-emerald-400" />
            </div>
            <p className="text-sm font-semibold text-zinc-900 dark:text-zinc-100">
              {savedCount === 1 ? 'Entrada guardada' : `${savedCount} entradas guardadas`}
            </p>
            {draft && savedCount === 1 && (
              <p className="text-[11px] text-zinc-400">{draft.concept} · {fmtCurrency(draft.amount)}</p>
            )}
          </div>
        )}
      </div>
    </SlidePanel>
  );
};

// ════════════════════════════════════════════════════════════════════
// BatchPreview — table of parsed rows with per-row edit + bulk select
// ════════════════════════════════════════════════════════════════════
type BatchPreviewProps = {
  drafts: DraftEntry[];
  selectedRows: Set<number>;
  setSelectedRows: React.Dispatch<React.SetStateAction<Set<number>>>;
  expandedRow: number | null;
  setExpandedRow: React.Dispatch<React.SetStateAction<number | null>>;
  updateBatchRow: (idx: number, patch: Partial<DraftEntry>) => void;
  projects: Project[];
  clients: Client[];
  unknownClients: string[];
  unknownProjects: string[];
  onCreateClient: (name: string) => Promise<void>;
  error: string | null;
};

const BatchPreview: React.FC<BatchPreviewProps> = ({
  drafts, selectedRows, setSelectedRows, expandedRow, setExpandedRow,
  updateBatchRow, projects, clients, unknownClients, unknownProjects, onCreateClient, error,
}) => {
  const allSelected = selectedRows.size === drafts.length;
  const toggleAll = () => {
    setSelectedRows(allSelected ? new Set() : new Set(drafts.map((_, i) => i)));
  };
  const toggleRow = (i: number) => {
    setSelectedRows(prev => {
      const next = new Set(prev);
      if (next.has(i)) next.delete(i); else next.add(i);
      return next;
    });
  };

  return (
    <>
      {(unknownClients.length > 0 || unknownProjects.length > 0) && (
        <div className="rounded-lg border border-indigo-200 dark:border-indigo-500/30 bg-indigo-50/50 dark:bg-indigo-500/5 p-3 space-y-2">
          <div className="flex items-center gap-1.5 text-[10px] font-semibold uppercase tracking-wider text-indigo-700 dark:text-indigo-300">
            <UserPlus size={11} /> Datos nuevos detectados
          </div>
          {unknownClients.length > 0 && (
            <div className="flex items-start gap-2 flex-wrap">
              <span className="text-[10px] text-indigo-600 dark:text-indigo-300 font-medium pt-1.5">Clientes:</span>
              {unknownClients.map(name => (
                <button key={name} type="button" onClick={() => onCreateClient(name)}
                  className="flex items-center gap-1 px-2 py-1 rounded-md bg-white dark:bg-zinc-900/60 border border-indigo-200 dark:border-indigo-500/30 text-[11px] font-medium text-indigo-700 dark:text-indigo-200 hover:bg-indigo-100 dark:hover:bg-indigo-500/10 transition-colors">
                  <Plus size={10} /> {name}
                </button>
              ))}
            </div>
          )}
          {unknownProjects.length > 0 && (
            <div className="flex items-start gap-2 flex-wrap">
              <span className="text-[10px] text-indigo-600 dark:text-indigo-300 font-medium pt-1.5">Proyectos:</span>
              {unknownProjects.map(title => (
                <span key={title} className="px-2 py-1 rounded-md bg-white dark:bg-zinc-900/60 border border-indigo-200 dark:border-indigo-500/30 text-[11px] font-medium text-indigo-700 dark:text-indigo-200">
                  {title}
                </span>
              ))}
              <span className="text-[10px] text-indigo-500 italic pt-1.5">creá estos proyectos desde la pestaña Projects para sincronizar</span>
            </div>
          )}
        </div>
      )}

      <div className="rounded-xl border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900/80 overflow-hidden">
        <div className="flex items-center justify-between px-3 py-2 bg-zinc-50/70 dark:bg-zinc-800/30 border-b border-zinc-100 dark:border-zinc-800/60">
          <label className="flex items-center gap-2 cursor-pointer">
            <input type="checkbox" checked={allSelected} onChange={toggleAll}
              className="rounded border-zinc-300 dark:border-zinc-700 text-fuchsia-600 focus:ring-fuchsia-500" />
            <span className="text-[10px] font-semibold uppercase tracking-wider text-zinc-500 dark:text-zinc-400">
              {drafts.length} filas detectadas
            </span>
          </label>
          <span className="text-[10px] text-zinc-400">{selectedRows.size} seleccionadas</span>
        </div>

        <div className="divide-y divide-zinc-100 dark:divide-zinc-800/60 max-h-[55vh] overflow-y-auto">
          {drafts.map((d, i) => {
            const isSelected = selectedRows.has(i);
            const isExpanded = expandedRow === i;
            return (
              <div key={i} className={`transition-colors ${isSelected ? '' : 'opacity-50'}`}>
                <div className="flex items-center gap-2 px-3 py-2 hover:bg-zinc-50/60 dark:hover:bg-zinc-800/20">
                  <input type="checkbox" checked={isSelected} onChange={() => toggleRow(i)}
                    className="rounded border-zinc-300 dark:border-zinc-700 text-fuchsia-600 focus:ring-fuchsia-500" />
                  <button onClick={() => setExpandedRow(isExpanded ? null : i)} type="button"
                    className="p-0.5 rounded text-zinc-400 hover:text-zinc-700 dark:hover:text-zinc-200">
                    {isExpanded ? <ChevronDown size={13} /> : <ChevronRight size={13} />}
                  </button>
                  <div className={`shrink-0 px-1.5 py-0.5 rounded text-[9px] font-bold uppercase ${
                    d.kind === 'income'
                      ? 'bg-emerald-100 dark:bg-emerald-500/20 text-emerald-700 dark:text-emerald-300'
                      : 'bg-zinc-200 dark:bg-zinc-700 text-zinc-700 dark:text-zinc-200'
                  }`}>{d.kind === 'income' ? 'IN' : 'EX'}</div>
                  <div className="flex-1 min-w-0">
                    <div className="text-xs font-medium text-zinc-900 dark:text-zinc-100 truncate">{d.concept || <span className="italic text-zinc-400">sin concepto</span>}</div>
                    <div className="text-[10px] text-zinc-400 truncate">
                      {d.client_name || (d.client_id ? '' : 'sin cliente')}
                      {d.project_name ? ` · ${d.project_name}` : ''}
                      {' · '}{d.date}
                    </div>
                  </div>
                  <div className={`text-xs font-semibold tabular-nums ${
                    d.kind === 'income' ? 'text-emerald-600 dark:text-emerald-400' : 'text-zinc-700 dark:text-zinc-200'
                  }`}>
                    {d.kind === 'income' ? '+' : '−'}{fmtCurrency(d.amount)}
                  </div>
                </div>

                {isExpanded && (
                  <div className="px-3 pb-3 pt-1 space-y-2 bg-zinc-50/40 dark:bg-zinc-800/10">
                    <div className="grid grid-cols-2 gap-2">
                      <input type="text" value={d.concept}
                        onChange={e => updateBatchRow(i, { concept: e.target.value })}
                        placeholder="Concepto"
                        className="rounded-md border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 px-2 py-1 text-[11px] text-zinc-900 dark:text-zinc-100 focus:outline-none focus:ring-1 focus:ring-fuchsia-500/30" />
                      <input type="number" min="0" step="0.01" value={d.amount || ''}
                        onChange={e => updateBatchRow(i, { amount: Number(e.target.value) || 0 })}
                        placeholder="Amount"
                        className="rounded-md border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 px-2 py-1 text-[11px] font-semibold text-zinc-900 dark:text-zinc-100 focus:outline-none focus:ring-1 focus:ring-fuchsia-500/30" />
                    </div>
                    <div className="grid grid-cols-2 gap-2">
                      <input type="date" value={d.date}
                        onChange={e => updateBatchRow(i, { date: e.target.value })}
                        className="rounded-md border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 px-2 py-1 text-[11px] text-zinc-900 dark:text-zinc-100 focus:outline-none focus:ring-1 focus:ring-fuchsia-500/30" />
                      <select value={d.kind} onChange={e => updateBatchRow(i, { kind: e.target.value as 'income' | 'expense' })}
                        className="rounded-md border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 px-2 py-1 text-[11px] text-zinc-900 dark:text-zinc-100 focus:outline-none focus:ring-1 focus:ring-fuchsia-500/30">
                        <option value="income">Income</option>
                        <option value="expense">Expense</option>
                      </select>
                    </div>
                    <div className="grid grid-cols-2 gap-2">
                      <select value={d.client_id || ''}
                        onChange={e => {
                          const cid = e.target.value || null;
                          const c = cid ? clients.find(cl => cl.id === cid) : null;
                          updateBatchRow(i, { client_id: cid, client_name: c?.name || null });
                        }}
                        className="rounded-md border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 px-2 py-1 text-[11px] text-zinc-900 dark:text-zinc-100 focus:outline-none focus:ring-1 focus:ring-fuchsia-500/30">
                        <option value="">— Client —</option>
                        {clients.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
                      </select>
                      <select value={d.project_id || ''}
                        onChange={e => {
                          const pid = e.target.value || null;
                          const p = pid ? projects.find(pr => pr.id === pid) : null;
                          updateBatchRow(i, { project_id: pid, project_name: p?.title || null });
                        }}
                        className="rounded-md border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 px-2 py-1 text-[11px] text-zinc-900 dark:text-zinc-100 focus:outline-none focus:ring-1 focus:ring-fuchsia-500/30">
                        <option value="">— Project —</option>
                        {projects.map(p => <option key={p.id} value={p.id}>{p.title}</option>)}
                      </select>
                    </div>
                    {d.kind === 'expense' && (
                      <div className="grid grid-cols-2 gap-2">
                        <select value={d.category || 'Operations'} onChange={e => updateBatchRow(i, { category: e.target.value })}
                          className="rounded-md border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 px-2 py-1 text-[11px] text-zinc-900 dark:text-zinc-100 focus:outline-none focus:ring-1 focus:ring-fuchsia-500/30">
                          {EXPENSE_CATEGORIES.map(c => <option key={c} value={c}>{c}</option>)}
                        </select>
                        <input type="text" value={d.vendor || ''}
                          onChange={e => updateBatchRow(i, { vendor: e.target.value })}
                          placeholder="Vendor"
                          className="rounded-md border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 px-2 py-1 text-[11px] text-zinc-900 dark:text-zinc-100 focus:outline-none focus:ring-1 focus:ring-fuchsia-500/30" />
                      </div>
                    )}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </div>

      {error && (
        <div className="flex items-start gap-2 text-xs font-medium text-rose-600 bg-rose-50 dark:bg-rose-500/10 border border-rose-200 dark:border-rose-500/20 rounded-lg px-3 py-2">
          <AlertCircle size={13} className="shrink-0 mt-0.5" />
          <span>{error}</span>
        </div>
      )}
    </>
  );
};
