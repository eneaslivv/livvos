import React, { useState, useMemo, useRef, useEffect, useCallback } from 'react';
import {
  Sparkles, Mic, MicOff, Wand2, CheckCircle2, X,
  ArrowDownLeft, ArrowUpFromLine, Loader2, Pencil, AlertCircle,
  FileSpreadsheet, Upload, ChevronDown, ChevronRight, UserPlus, Plus,
  Flag, RefreshCw, AlertTriangle,
} from 'lucide-react';
import * as XLSX from 'xlsx';
import { SlidePanel } from '../ui/SlidePanel';
import {
  parseFinanceEntryFromAI,
  parseFinanceBatchFromAI,
  type FinanceEntryAIResult,
} from '../../lib/ai';
import { supabase } from '../../lib/supabase';
import {
  useFinance,
  type CreateIncomeData,
  type CreateExpenseData,
  type ExpenseEntry,
  type IncomeEntry,
  type Budget,
} from '../../context/FinanceContext';
import { useProjects, type Project } from '../../context/ProjectsContext';
import { useClients, type Client } from '../../context/ClientsContext';
import { useTenant } from '../../context/TenantContext';

const EXPENSE_CATEGORIES = ['Software', 'Talent', 'Marketing', 'Operations', 'Legal'] as const;

// Anti-hallucination guardrails: cap how many rows the IA processes per call
// (chunked sequentially) and how many rows total we'll touch from a single
// upload. Tunables below; raising MAX_TOTAL_ROWS just means more sequential AI
// calls — the user already accepts that for correctness over speed.
const BATCH_CHUNK_SIZE = 25;
const MAX_TOTAL_ROWS = 500;

const fmtCurrency = (v: number) =>
  new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 }).format(v);

type Step = 'input' | 'parsing' | 'preview' | 'preview_batch' | 'saving' | 'done';

type SheetRow = {
  source_sheet: string;          // name of the worksheet this row came from
  source_row: number;            // 1-indexed position within that worksheet (header is row 0, data starts at 1)
  cells: Record<string, string>; // header → cell value as string (per-sheet headers may differ)
};

type SheetData = {
  name: string;
  headers: string[];
  rows: SheetRow[];
  totalRows: number;             // total non-blank data rows in this sheet (may exceed rows.length when capped)
};

// A workbook may have multiple sheets — we process each one separately so
// per-sheet header sets stay coherent in the prompt. The sheet name is also
// surfaced in the preview's "Source row" panel so the user can audit which
// tab a draft came from.
type WorkbookData = {
  sheets: SheetData[];
  totalRows: number;             // sum across sheets
};

type MatchStatus = 'new' | 'duplicate' | 'update' | 'low_confidence';

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
  // ─── Anti-hallucination + sync metadata ───
  source_sheet: string | null;
  source_row: number | null;
  source_row_data: Record<string, string> | null;
  needs_review: boolean;
  validation_errors: string[];
  match_status: MatchStatus;
  match_existing_id: string | null;
  match_existing_kind: 'expense' | 'income' | null;
  match_reason: string | null;
  budget_id: string | null;
  budget_name: string | null;
  confidence: number;
  // For Updates: lets the user pick "create new" / "update existing" / "skip"
  // per-row from the dropdown in the Updates section.
  update_action: 'update' | 'create' | 'skip';
};

type AIOutputRef = { type: 'finance_entries_batch' | 'finance_entry'; output_id: string | null };

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

// Builds a chunk-aware prompt where each row is a JSON object with a stable,
// 1-indexed `source_row` plus the originating sheet name. The IA echoes both
// so the frontend can verify every emitted entry's amount/date came from a
// real cell of that row — the fix for "phantom $3,000 expenses" caused by
// silent CSV truncation. Per-sheet calls keep header sets coherent.
const buildBatchPrompt = (
  fileName: string,
  sheetName: string,
  sheetIndex: number,
  totalSheets: number,
  headers: string[],
  rows: SheetRow[],
  totalInSheet: number,
  chunkRange: { from: number; to: number },
  clients: Client[],
  projects: Project[],
): string => {
  const today = new Date().toISOString().slice(0, 10);
  const clientLines = clients.slice(0, 80).map(c => `- id: ${c.id} | name: ${c.name}${c.company ? ` (${c.company})` : ''}`).join('\n');
  const projectLines = projects.slice(0, 80).map(p => `- id: ${p.id} | title: ${p.title} | client: ${p.client || p.clientName || '—'} | client_id: ${p.client_id || '—'}`).join('\n');
  return [
    `TODAY: ${today}`,
    `FILE: ${fileName}`,
    `SHEET: "${sheetName}" (${sheetIndex + 1} of ${totalSheets})`,
    `CHUNK: rows ${chunkRange.from}-${chunkRange.to} of ${totalInSheet} in this sheet`,
    '',
    'EXPENSE_CATEGORIES (use one of these EXACTLY, or "Operations" if uncertain):',
    ...EXPENSE_CATEGORIES.map(c => `- ${c}`),
    '',
    'CLIENTS:',
    clientLines || '(none)',
    '',
    'PROJECTS:',
    projectLines || '(none)',
    '',
    `SHEET_HEADERS: ${JSON.stringify(headers)}`,
    '',
    'ROWS (JSON, source_row is the 1-indexed row number within this sheet; source_sheet is the sheet name; never invent rows or sheets):',
    JSON.stringify(rows.map(r => ({ source_sheet: r.source_sheet, source_row: r.source_row, ...r.cells }))),
  ].join('\n');
};

// ─── Helpers: number/date parsing for source-row validation ───────────

// Strip currency symbols, thousand separators, and convert European decimals.
// "$1.234,56" → 1234.56 ; "2k" → 2000 ; "USD 89,00" → 89.
const parseCellNumber = (raw: string): number | null => {
  if (raw == null) return null;
  let s = String(raw).trim();
  if (!s) return null;
  // "2k" / "2.5k"
  const kMatch = s.match(/^([0-9]+(?:[.,][0-9]+)?)\s*k$/i);
  if (kMatch) return parseFloat(kMatch[1].replace(',', '.')) * 1000;
  // strip currency words/symbols and spaces
  s = s.replace(/[A-Za-z$€£¥]/g, '').replace(/\s+/g, '').trim();
  if (!s) return null;
  // If both . and , are present, the last one is the decimal separator.
  const lastComma = s.lastIndexOf(',');
  const lastDot = s.lastIndexOf('.');
  if (lastComma >= 0 && lastDot >= 0) {
    if (lastComma > lastDot) {
      // European: 1.234,56
      s = s.replace(/\./g, '').replace(',', '.');
    } else {
      // US: 1,234.56
      s = s.replace(/,/g, '');
    }
  } else if (lastComma >= 0) {
    // Only comma — could be European decimal (1234,56) or thousands grouping
    // (1,234). Heuristic: 2 digits after the last comma → decimal.
    if (s.length - lastComma - 1 === 2) s = s.replace(/,/g, '.');
    else s = s.replace(/,/g, '');
  } else if (lastDot >= 0) {
    // Only dot — same heuristic in reverse: 3 digits after means thousands.
    if (s.length - lastDot - 1 === 3 && (s.match(/\./g) || []).length > 1) s = s.replace(/\./g, '');
  }
  const n = parseFloat(s);
  return Number.isFinite(n) ? n : null;
};

// Try to find `target` numerically in any cell of the row. Tolerance ±0.01.
const rowContainsNumber = (row: SheetRow, target: number): string | null => {
  for (const [header, cell] of Object.entries(row.cells)) {
    const n = parseCellNumber(cell);
    if (n !== null && Math.abs(n - target) <= 0.01) return header;
  }
  return null;
};

// Returns true if any cell of the row, after normalising, contains the ISO
// date components — handles "15/04/2026", "2026-04-15", "Apr 15 2026", etc.
const rowContainsDate = (row: SheetRow, isoDate: string): boolean => {
  const [yyyy, mm, dd] = isoDate.split('-');
  if (!yyyy || !mm || !dd) return false;
  const dNoZero = String(parseInt(dd, 10));
  const mNoZero = String(parseInt(mm, 10));
  for (const cell of Object.values(row.cells)) {
    const c = String(cell ?? '').toLowerCase();
    if (!c) continue;
    if (c.includes(yyyy) && (c.includes(mm) || c.includes(mNoZero)) && (c.includes(dd) || c.includes(dNoZero))) {
      return true;
    }
    // Fallback: try parsing the cell as a date and comparing components.
    const parsed = new Date(c);
    if (!isNaN(parsed.getTime())) {
      if (
        parsed.getFullYear() === parseInt(yyyy, 10) &&
        parsed.getMonth() + 1 === parseInt(mm, 10) &&
        parsed.getDate() === parseInt(dd, 10)
      ) return true;
    }
  }
  return false;
};

// ─── Helpers: dedup + recurring + budget matching ────────────────────

// Tiny Levenshtein — used only to fuzzy-match concepts/vendors against
// existing rows when classifying duplicates. ~15 lines, no extra dep.
const levenshtein = (a: string, b: string): number => {
  if (!a) return b.length;
  if (!b) return a.length;
  const m = a.length, n = b.length;
  const dp: number[] = Array(n + 1).fill(0);
  for (let j = 0; j <= n; j++) dp[j] = j;
  for (let i = 1; i <= m; i++) {
    let prev = dp[0];
    dp[0] = i;
    for (let j = 1; j <= n; j++) {
      const tmp = dp[j];
      dp[j] = a[i - 1] === b[j - 1] ? prev : 1 + Math.min(prev, dp[j], dp[j - 1]);
      prev = tmp;
    }
  }
  return dp[n];
};

const norm = (s: string | null | undefined) => String(s ?? '').toLowerCase().trim();
const conceptsLooseMatch = (a: string, b: string): boolean => {
  const an = norm(a), bn = norm(b);
  if (!an || !bn) return false;
  if (an === bn) return true;
  if (an.includes(bn) || bn.includes(an)) return true;
  return levenshtein(an, bn) <= 3;
};

const daysBetween = (a: string, b: string): number => {
  const ta = new Date(a + 'T12:00:00').getTime();
  const tb = new Date(b + 'T12:00:00').getTime();
  if (!Number.isFinite(ta) || !Number.isFinite(tb)) return Infinity;
  return Math.abs(ta - tb) / 86400000;
};

type Classification = {
  status: MatchStatus;
  match?: { id: string; kind: 'expense' | 'income'; reason: string };
};

const classifyDraft = (
  draft: Pick<DraftEntry, 'kind' | 'amount' | 'date' | 'concept' | 'vendor' | 'recurring' | 'status'>,
  expenses: ExpenseEntry[],
  incomes: IncomeEntry[],
): Classification => {
  const amountTol = Math.max(1, draft.amount * 0.01);
  if (draft.kind === 'expense') {
    for (const e of expenses) {
      if (Math.abs(e.amount - draft.amount) > amountTol) continue;
      if (daysBetween(e.date, draft.date) > 3) continue;
      const sameVendor = norm(e.vendor) && norm(e.vendor) === norm(draft.vendor);
      const closeConcept = conceptsLooseMatch(e.concept, draft.concept);
      if (!sameVendor && !closeConcept) continue;
      // Match found
      if (e.recurring || draft.recurring) {
        return { status: 'update', match: { id: e.id, kind: 'expense', reason: 'Coincide con un gasto recurrente existente' } };
      }
      if (e.status !== draft.status) {
        return { status: 'update', match: { id: e.id, kind: 'expense', reason: `Mismo gasto, status difiere (${e.status} → ${draft.status})` } };
      }
      return { status: 'duplicate', match: { id: e.id, kind: 'expense', reason: 'Gasto idéntico ya existe' } };
    }
  } else {
    for (const i of incomes) {
      if (Math.abs(i.total_amount - draft.amount) > amountTol) continue;
      const incomeDate = i.due_date || '';
      if (incomeDate && daysBetween(incomeDate, draft.date) > 3) continue;
      const closeConcept = conceptsLooseMatch(i.concept, draft.concept);
      if (!closeConcept) continue;
      if (i.status !== draft.status) {
        return { status: 'update', match: { id: i.id, kind: 'income', reason: `Mismo income, status difiere (${i.status} → ${draft.status})` } };
      }
      return { status: 'duplicate', match: { id: i.id, kind: 'income', reason: 'Income idéntico ya existe' } };
    }
  }
  return { status: 'new' };
};

// Pick the active budget whose category matches and whose date range covers
// `date`. Used to auto-link `budget_id` so the user's allocations stay in sync
// without re-typing the budget on every expense.
const findMatchingBudget = (category: string, date: string, budgets: Budget[]): Budget | null => {
  if (!category || !date) return null;
  const d = new Date(date + 'T12:00:00').getTime();
  if (!Number.isFinite(d)) return null;
  for (const b of budgets) {
    if (!b.is_active) continue;
    if (norm(b.category) !== norm(category)) continue;
    const startOk = !b.start_date || new Date(b.start_date + 'T12:00:00').getTime() <= d;
    const endOk   = !b.end_date   || new Date(b.end_date   + 'T12:00:00').getTime() >= d;
    if (startOk && endOk) return b;
  }
  return null;
};

const sheetRowKey = (sheet: string, row: number) => `${sheet}::${row}`;

const toDraft = (
  r: FinanceEntryAIResult,
  rowsByKey: Map<string, SheetRow>,
  fallbackSheet: string,
): DraftEntry => {
  // The IA may echo source_sheet for each entry; if missing (older prompt or
  // single-sheet upload) fall back to the chunk's sheet name so audit still
  // works.
  const sheetName = (r as any).source_sheet || fallbackSheet || '';
  const lookupRow =
    typeof r.source_row === 'number'
      ? rowsByKey.get(sheetRowKey(sheetName, r.source_row))
      : undefined;
  return {
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
    source_sheet: sheetName || null,
    source_row: typeof r.source_row === 'number' ? r.source_row : null,
    source_row_data: lookupRow ? lookupRow.cells : null,
    needs_review: !!r.needs_review,
    validation_errors: [],
    match_status: 'new',
    match_existing_id: null,
    match_existing_kind: null,
    match_reason: null,
    budget_id: null,
    budget_name: null,
    confidence: typeof r.confidence === 'number' ? Math.max(0, Math.min(1, r.confidence)) : 0.7,
    update_action: 'update',
  };
};

// Run amount/date binding checks. Pushes errors to draft.validation_errors and
// flips needs_review when the IA's claim doesn't match the source cell.
const validateAgainstSource = (draft: DraftEntry): DraftEntry => {
  const errors: string[] = [];
  if (draft.source_row == null) {
    errors.push('La IA no devolvió source_row para esta fila.');
  } else if (!draft.source_row_data) {
    errors.push(
      draft.source_sheet
        ? `La IA referenció hoja "${draft.source_sheet}", fila ${draft.source_row}, pero no existe en el archivo.`
        : `La IA referenció source_row=${draft.source_row}, pero no existe en el archivo.`
    );
  } else {
    const fakeRow: SheetRow = {
      source_sheet: draft.source_sheet || '',
      source_row: draft.source_row,
      cells: draft.source_row_data,
    };
    if (draft.amount > 0 && !rowContainsNumber(fakeRow, draft.amount)) {
      errors.push(`El monto ${fmtCurrency(draft.amount)} no aparece en la fila origen — posible alucinación.`);
    }
    const today = new Date().toISOString().slice(0, 10);
    if (draft.date && draft.date !== today && !rowContainsDate(fakeRow, draft.date)) {
      errors.push(`La fecha ${draft.date} no aparece en la fila origen.`);
    }
  }
  return errors.length > 0
    ? { ...draft, needs_review: true, validation_errors: errors }
    : draft;
};

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
  const { createIncome, createExpense, updateIncome, updateExpense, expenses, incomes, budgets } = useFinance();
  const { projects } = useProjects();
  const { clients, createClient } = useClients();
  const { currentTenant } = useTenant();

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
  const [editedRows, setEditedRows] = useState<Set<number>>(new Set());
  const [batchProgress, setBatchProgress] = useState<{ current: number; total: number } | null>(null);
  const [aiOutputRef, setAIOutputRef] = useState<AIOutputRef | null>(null);

  // File upload state. workbookData holds every sheet of the uploaded file
  // (each with its own headers + rows). Multi-sheet support means processing
  // each tab independently so per-sheet header sets stay coherent in the
  // prompt — and so the audit trail can show which tab a draft came from.
  const [fileName, setFileName] = useState<string | null>(null);
  const [workbookData, setWorkbookData] = useState<WorkbookData | null>(null);
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
      setEditedRows(new Set());
      setBatchProgress(null);
      setAIOutputRef(null);
      setFileName(null);
      setWorkbookData(null);
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
    try { recognitionRef.current?.abort?.(); } catch { /* noop */ }
    recognitionRef.current = null;

    const SR = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
    const rec = new SR();
    rec.lang = navigator.language || 'es-ES';
    rec.interimResults = true;
    rec.continuous = false;

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
      const wb = XLSX.read(buf, { type: 'array', cellDates: true, cellNF: false, cellText: true });
      if (wb.SheetNames.length === 0) {
        setError('El archivo no tiene hojas.');
        return;
      }
      // Iterate every sheet (tab) of the workbook. Each sheet is processed
      // separately downstream so its header set stays coherent. Empty sheets
      // are skipped silently. The MAX_TOTAL_ROWS cap is applied across the
      // whole workbook to bound the total AI calls.
      const sheets: SheetData[] = [];
      let totalRowsAcrossWorkbook = 0;
      let remainingBudget = MAX_TOTAL_ROWS;

      for (const sheetName of wb.SheetNames) {
        const sheet = wb.Sheets[sheetName];
        if (!sheet) continue;
        const aoa: any[][] = XLSX.utils.sheet_to_json(sheet, { header: 1, blankrows: false, defval: '', raw: false });
        if (aoa.length === 0) continue;
        const headers = (aoa[0] || []).map((v, i) => String(v ?? '').trim() || `col${i + 1}`);
        const dataRowsAll = aoa.slice(1);
        if (dataRowsAll.length === 0) continue;

        totalRowsAcrossWorkbook += dataRowsAll.length;
        const dataRowsCapped = remainingBudget > 0 ? dataRowsAll.slice(0, remainingBudget) : [];
        remainingBudget -= dataRowsCapped.length;

        const rows: SheetRow[] = dataRowsCapped.map((row, idx) => {
          const cells: Record<string, string> = {};
          headers.forEach((h, ci) => { cells[h] = String(row[ci] ?? '').trim(); });
          return { source_sheet: sheetName, source_row: idx + 1, cells };
        });
        sheets.push({ name: sheetName, headers, rows, totalRows: dataRowsAll.length });
      }

      if (sheets.length === 0) {
        setError('El archivo está vacío o ninguna hoja tiene filas con datos.');
        return;
      }

      setFileName(file.name);
      setWorkbookData({ sheets, totalRows: totalRowsAcrossWorkbook });
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
    setWorkbookData(null);
  }, []);

  // ─── Submit → AI parse (single OR batch depending on file presence) ─
  const handleParse = useCallback(async () => {
    setError(null);

    // Batch mode — multi-sheet aware
    if (workbookData && workbookData.sheets.some(s => s.rows.length > 0)) {
      setStep('parsing');
      // One chunk = one AI call. We chunk per sheet so each call sees only
      // the headers that belong to that sheet — mixing sheets in one call
      // confuses the IA when columns differ.
      type Chunk = { sheet: SheetData; sheetIndex: number; rows: SheetRow[] };
      const chunks: Chunk[] = [];
      workbookData.sheets.forEach((sheet, sheetIndex) => {
        for (let i = 0; i < sheet.rows.length; i += BATCH_CHUNK_SIZE) {
          chunks.push({ sheet, sheetIndex, rows: sheet.rows.slice(i, i + BATCH_CHUNK_SIZE) });
        }
      });
      setBatchProgress({ current: 0, total: chunks.length });

      try {
        const allEntries: FinanceEntryAIResult[] = [];
        const allUnknownClients: string[] = [];
        const allUnknownProjects: string[] = [];
        let lastOutputId: string | null = null;

        for (let i = 0; i < chunks.length; i++) {
          const { sheet, sheetIndex, rows: chunkRows } = chunks[i];
          const range = { from: chunkRows[0].source_row, to: chunkRows[chunkRows.length - 1].source_row };
          const prompt = buildBatchPrompt(
            fileName || 'data.csv',
            sheet.name,
            sheetIndex,
            workbookData.sheets.length,
            sheet.headers,
            chunkRows,
            sheet.totalRows,
            range,
            clients,
            projects,
          );
          const result = await parseFinanceBatchFromAI(prompt);
          if ((result as any)._outputId) lastOutputId = (result as any)._outputId;
          // Tag each entry with the sheet name so toDraft can recover it even
          // if the IA forgot to echo source_sheet in its output.
          (result.entries || []).forEach(e => {
            if (!(e as any).source_sheet) (e as any).source_sheet = sheet.name;
            allEntries.push(e);
          });
          (result.unknown_clients || []).forEach(s => { if (typeof s === 'string' && s.trim()) allUnknownClients.push(s.trim()); });
          (result.unknown_projects || []).forEach(s => { if (typeof s === 'string' && s.trim()) allUnknownProjects.push(s.trim()); });
          setBatchProgress({ current: i + 1, total: chunks.length });
        }

        if (allEntries.length === 0) {
          setError('La IA no encontró filas válidas en el archivo. Verificá los encabezados.');
          setStep('input');
          setBatchProgress(null);
          return;
        }

        // Composite-key index: (sheet name, row index) → SheetRow. Two sheets
        // can share row numbers, so the sheet name is part of the key.
        const rowsByKey = new Map<string, SheetRow>();
        workbookData.sheets.forEach(s =>
          s.rows.forEach(r => rowsByKey.set(sheetRowKey(r.source_sheet, r.source_row), r))
        );

        // 1. Convert + validate against source rows (anti-hallucination).
        // 2. Classify against existing data (dedup / update vs create).
        // 3. Auto-link budget when category + date matches an active budget.
        const drafts = allEntries.map(e => {
          const fallbackSheet = (e as any).source_sheet || workbookData.sheets[0]?.name || '';
          let d = toDraft(e, rowsByKey, fallbackSheet);
          d = validateAgainstSource(d);
          const classification = classifyDraft(d, expenses, incomes);
          d.match_status = classification.status;
          d.match_existing_id = classification.match?.id || null;
          d.match_existing_kind = classification.match?.kind || null;
          d.match_reason = classification.match?.reason || null;
          if (d.kind === 'expense' && d.category) {
            const b = findMatchingBudget(d.category, d.date, budgets);
            if (b) {
              d.budget_id = b.id;
              d.budget_name = b.name;
            }
          }
          return d;
        });

        setBatchDrafts(drafts);
        // Auto-select only confident `new` and `update` rows. Skip duplicates
        // and rows flagged for review by default — user can opt them in.
        const initialSelection = new Set<number>();
        drafts.forEach((d, i) => {
          if (d.match_status === 'duplicate') return;
          if (d.needs_review) return;
          if (d.confidence > 0 && d.confidence < 0.6) return;
          initialSelection.add(i);
        });
        setSelectedRows(initialSelection);
        setUnknownClients(Array.from(new Set(allUnknownClients)));
        setUnknownProjects(Array.from(new Set(allUnknownProjects)));
        setAIOutputRef(lastOutputId ? { type: 'finance_entries_batch', output_id: lastOutputId } : null);
        setBatchProgress(null);
        setStep('preview_batch');
      } catch (err: any) {
        console.error('[FinanceAssistant] batch parse error', err);
        setError(err?.message || 'No pude procesar el archivo.');
        setStep('input');
        setBatchProgress(null);
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
      const draft = toDraft(result, new Map(), '');
      // Single entries don't have a source row — clear the validation noise.
      draft.validation_errors = [];
      draft.needs_review = false;
      // Still classify so the user sees if they're about to dup an existing row.
      const classification = classifyDraft(draft, expenses, incomes);
      draft.match_status = classification.status;
      draft.match_existing_id = classification.match?.id || null;
      draft.match_existing_kind = classification.match?.kind || null;
      draft.match_reason = classification.match?.reason || null;
      if (draft.kind === 'expense' && draft.category) {
        const b = findMatchingBudget(draft.category, draft.date, budgets);
        if (b) { draft.budget_id = b.id; draft.budget_name = b.name; }
      }
      setDraft(draft);
      setQuestions(Array.isArray(result.questions) ? result.questions.filter(q => typeof q === 'string' && q.trim().length > 0) : []);
      setConfidence(typeof result.confidence === 'number' ? Math.max(0, Math.min(1, result.confidence)) : 0.7);
      setAIOutputRef((result as any)._outputId ? { type: 'finance_entry', output_id: (result as any)._outputId } : null);
      setStep('preview');
    } catch (err: any) {
      console.error('[FinanceAssistant] parse error', err);
      setError(err?.message || 'No pude procesar la descripción. Probá reformular.');
      setStep('input');
    }
  }, [workbookData, fileName, userInput, clients, projects, expenses, incomes, budgets]);

  // ─── Persist a single draft ──────────────────────────────────────
  // Honors match_status: a draft tagged `update` can be applied to the
  // matched existing expense/income (toggling status, adjusting amount) or
  // recorded as a new instance of a recurring expense via `recurring_source_id`.
  const persistDraft = useCallback(async (d: DraftEntry) => {
    const project = d.project_id ? projects.find(p => p.id === d.project_id) : null;
    const client = d.client_id ? clients.find(c => c.id === d.client_id) : null;

    // Skip explicit duplicates and update-action=skip rows.
    if (d.match_status === 'duplicate') return;
    if (d.match_status === 'update' && d.update_action === 'skip') return;

    if (d.match_status === 'update' && d.update_action === 'update' && d.match_existing_id) {
      if (d.match_existing_kind === 'expense') {
        // Update existing expense with the new amount/status/budget link.
        await updateExpense(d.match_existing_id, {
          status: d.status,
          amount: d.amount,
          date: d.date,
          ...(d.budget_id ? { budget_id: d.budget_id } : {}),
        });
        return;
      }
      if (d.match_existing_kind === 'income') {
        await updateIncome(d.match_existing_id, {
          status: d.status,
          total_amount: d.amount,
          due_date: d.date,
        });
        return;
      }
    }

    // Recurring instance: create a new expense linked to the recurring source
    // so the dashboard correctly groups them and the renewer skips this month.
    const isRecurringInstance =
      d.match_status === 'update' &&
      d.update_action === 'create' &&
      d.match_existing_kind === 'expense' &&
      d.match_existing_id &&
      expenses.some(e => e.id === d.match_existing_id && e.recurring);

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
        recurring: !!d.recurring && !isRecurringInstance,
        status: d.status,
        ...(d.budget_id ? { budget_id: d.budget_id } : {}),
        ...(isRecurringInstance && d.match_existing_id ? { recurring_source_id: d.match_existing_id } : {}),
      };
      await createExpense(data);
    }
  }, [projects, clients, createIncome, createExpense, updateExpense, updateIncome, expenses]);

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
    const toSave = batchDrafts
      .map((d, i) => ({ d, i }))
      .filter(({ i }) => selectedRows.has(i));
    if (toSave.length === 0) { setError('Seleccioná al menos una fila.'); return; }
    setStep('saving');
    setError(null);
    let ok = 0;
    let firstErr: string | null = null;
    for (const { d, i } of toSave) {
      try {
        if (!d.concept.trim() || !d.amount || d.amount <= 0 || !d.date) continue;
        await persistDraft(d);
        ok++;
        // Telemetry: log corrections for rows the user edited before saving.
        if (editedRows.has(i) && aiOutputRef?.output_id && currentTenant?.id) {
          const original = batchDrafts[i];
          // Fire-and-forget — never let telemetry block the save flow.
          supabase.from('ai_feedback').insert({
            output_id: aiOutputRef.output_id,
            tenant_id: currentTenant.id,
            rating: 0,
            correction: JSON.stringify({
              reason: 'user_edited_before_save',
              source_row: d.source_row,
              original: { amount: original.amount, date: original.date, kind: original.kind, category: original.category, vendor: original.vendor, concept: original.concept },
              edited:   { amount: d.amount,        date: d.date,        kind: d.kind,        category: d.category,        vendor: d.vendor,        concept: d.concept },
            }).slice(0, 4000),
          }).then(({ error: e }) => { if (e && import.meta.env.DEV) console.warn('[FinanceAssistant] telemetry failed', e); });
        }
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
  }, [batchDrafts, selectedRows, persistDraft, onClose, editedRows, aiOutputRef, currentTenant?.id]);

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
  // Inconsistency: project has a canonical client that differs from the
  // draft's client. Surface it so the user can one-click-fix instead of
  // shipping mis-attributed data.
  const projectClientMismatch = useMemo(() => {
    if (!matchedProject || !draft) return null;
    const projClientId = matchedProject.client_id;
    if (!projClientId) return null;
    if (draft.client_id === projClientId) return null;
    const projClient = clients.find(c => c.id === projClientId);
    return projClient ? { id: projClientId, name: projClient.name } : null;
  }, [matchedProject, draft?.client_id, clients]);

  const updateDraft = useCallback((patch: Partial<DraftEntry>) => {
    setDraft(prev => (prev ? { ...prev, ...patch } : prev));
  }, []);

  const updateBatchRow = useCallback((idx: number, patch: Partial<DraftEntry>) => {
    setBatchDrafts(prev => prev.map((d, i) => (i === idx ? { ...d, ...patch } : d)));
    setEditedRows(prev => {
      if (prev.has(idx)) return prev;
      const next = new Set(prev);
      next.add(idx);
      return next;
    });
  }, []);

  const flagBadParse = useCallback(async (idx: number) => {
    if (!aiOutputRef?.output_id || !currentTenant?.id) return;
    const d = batchDrafts[idx];
    try {
      await supabase.from('ai_feedback').insert({
        output_id: aiOutputRef.output_id,
        tenant_id: currentTenant.id,
        rating: -1,
        correction: JSON.stringify({
          reason: 'user_flagged_bad_parse',
          source_row: d.source_row,
          source_row_data: d.source_row_data,
          ai_output: { amount: d.amount, date: d.date, kind: d.kind, category: d.category, vendor: d.vendor, concept: d.concept },
          validation_errors: d.validation_errors,
        }).slice(0, 4000),
      });
      // Visual ack via match_reason — keeps the chip in place.
      updateBatchRow(idx, { match_reason: 'Reportado como mal parseo' });
    } catch (err: any) {
      console.warn('[FinanceAssistant] flag failed', err);
    }
  }, [aiOutputRef, currentTenant?.id, batchDrafts, updateBatchRow]);

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

  // Group drafts by status for the preview UI.
  const groupedDrafts = useMemo(() => {
    const groups = {
      new: [] as { d: DraftEntry; i: number }[],
      update: [] as { d: DraftEntry; i: number }[],
      needs_review: [] as { d: DraftEntry; i: number }[],
      duplicate: [] as { d: DraftEntry; i: number }[],
    };
    batchDrafts.forEach((d, i) => {
      if (d.needs_review) groups.needs_review.push({ d, i });
      else if (d.match_status === 'duplicate') groups.duplicate.push({ d, i });
      else if (d.match_status === 'update') groups.update.push({ d, i });
      else groups.new.push({ d, i });
    });
    return groups;
  }, [batchDrafts]);

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
            {!workbookData ? (
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
                  <div className="text-[10px] text-zinc-400">Arrastrá un archivo o hacé click — procesa todas las pestañas en tandas de {BATCH_CHUNK_SIZE} filas</div>
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
                      {workbookData.sheets.length} {workbookData.sheets.length === 1 ? 'hoja' : 'hojas'} · {workbookData.totalRows} filas totales
                    </div>
                  </div>
                  <button onClick={clearFile} type="button" className="p-1.5 rounded-lg text-zinc-400 hover:text-rose-500 hover:bg-rose-50 dark:hover:bg-rose-500/10 transition-colors">
                    <X size={13} />
                  </button>
                </div>

                {/* Per-sheet breakdown — surfaces multi-tab visibility so the
                    user knows the IA is going to read everything, not just
                    the first sheet (the previous behaviour). */}
                <div className="flex flex-wrap gap-1">
                  {workbookData.sheets.map(s => (
                    <span key={s.name}
                      className="inline-flex items-center gap-1 px-2 py-0.5 rounded bg-white dark:bg-zinc-900/60 border border-fuchsia-200 dark:border-fuchsia-500/30 text-[10px] text-zinc-700 dark:text-zinc-300">
                      <span className="font-semibold">{s.name}</span>
                      <span className="text-zinc-400">{s.totalRows}</span>
                    </span>
                  ))}
                </div>

                {/* Pagination warning */}
                {(() => {
                  const totalChunks = workbookData.sheets.reduce(
                    (acc, s) => acc + Math.ceil(s.rows.length / BATCH_CHUNK_SIZE), 0
                  );
                  return totalChunks > 1 ? (
                    <div className="flex items-start gap-1.5 text-[10px] text-amber-700 dark:text-amber-300 bg-amber-50 dark:bg-amber-500/10 border border-amber-200 dark:border-amber-500/30 rounded px-2 py-1.5">
                      <AlertTriangle size={11} className="shrink-0 mt-0.5" />
                      <span>Se procesará en {totalChunks} tandas (~{totalChunks * 4}s).</span>
                    </div>
                  ) : null;
                })()}
                {workbookData.totalRows > MAX_TOTAL_ROWS && (
                  <div className="flex items-start gap-1.5 text-[10px] text-rose-700 dark:text-rose-300 bg-rose-50 dark:bg-rose-500/10 border border-rose-200 dark:border-rose-500/30 rounded px-2 py-1.5">
                    <AlertTriangle size={11} className="shrink-0 mt-0.5" />
                    <span>
                      El archivo tiene {workbookData.totalRows} filas — solo se procesarán las primeras {MAX_TOTAL_ROWS}.
                    </span>
                  </div>
                )}

                {/* Preview the first sheet's first 3 rows just so the user
                    sees the headers were read correctly. */}
                {workbookData.sheets[0] && (
                  <div className="overflow-x-auto rounded-lg border border-zinc-100 dark:border-zinc-800/60 bg-white dark:bg-zinc-900/60">
                    <div className="px-2 py-1 text-[9px] font-semibold uppercase tracking-wider text-zinc-400 border-b border-zinc-100 dark:border-zinc-800/60">
                      Vista previa: {workbookData.sheets[0].name}
                    </div>
                    <table className="w-full text-[10px]">
                      <thead className="bg-zinc-50/70 dark:bg-zinc-800/30">
                        <tr>
                          {workbookData.sheets[0].headers.slice(0, 6).map((h, i) => (
                            <th key={i} className="px-2 py-1.5 text-left font-semibold text-zinc-500 uppercase tracking-wider whitespace-nowrap">{h || `col${i + 1}`}</th>
                          ))}
                          {workbookData.sheets[0].headers.length > 6 && <th className="px-2 py-1.5 text-left text-zinc-400">+{workbookData.sheets[0].headers.length - 6}</th>}
                        </tr>
                      </thead>
                      <tbody>
                        {workbookData.sheets[0].rows.slice(0, 3).map((row, ri) => (
                          <tr key={ri} className="border-t border-zinc-100 dark:border-zinc-800/40">
                            {workbookData.sheets[0].headers.slice(0, 6).map((h, ci) => (
                              <td key={ci} className="px-2 py-1.5 text-zinc-600 dark:text-zinc-400 whitespace-nowrap max-w-[140px] truncate">{String(row.cells[h] ?? '')}</td>
                            ))}
                            {workbookData.sheets[0].headers.length > 6 && <td className="px-2 py-1.5 text-zinc-300">…</td>}
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>
            )}

            {/* Examples — only when no file is loaded */}
            {!workbookData && (
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
                disabled={!userInput.trim() && !workbookData}
                className="flex items-center gap-1.5 px-3.5 py-2 rounded-lg text-white text-xs font-semibold shadow-sm hover:opacity-90 disabled:opacity-50 transition-opacity"
                style={{ background: 'linear-gradient(135deg, #6366f1 0%, #8b5cf6 50%, #ec4899 100%)' }}>
                <Wand2 size={13} />
                {workbookData ? 'Procesar archivo' : 'Parse with AI'}
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
              {workbookData
                ? batchProgress
                  ? `Tanda ${batchProgress.current} de ${batchProgress.total} — analizando filas y matcheando con tu CRM…`
                  : 'Preparando tandas…'
                : 'Procesando…'}
            </p>
            {batchProgress && (
              <div className="w-48 h-1 rounded-full bg-zinc-200 dark:bg-zinc-800 overflow-hidden">
                <div className="h-full bg-fuchsia-500 transition-all" style={{ width: `${(batchProgress.current / Math.max(1, batchProgress.total)) * 100}%` }} />
              </div>
            )}
          </div>
        )}

        {/* ─── SAVING STEP ─────────────────────────────── */}
        {step === 'saving' && (
          <div className="flex flex-col items-center justify-center gap-3 py-16">
            <Loader2 size={32} className="animate-spin text-emerald-500" />
            <p className="text-xs text-zinc-500 dark:text-zinc-400">Guardando…</p>
          </div>
        )}

        {/* ─── PREVIEW STEP (single) ─────────────────────────────── */}
        {step === 'preview' && draft && (
          <>
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

            {/* Match status banner — surfaces when this entry would dup or update an existing row */}
            {draft.match_status === 'duplicate' && (
              <div className="flex items-start gap-2 text-xs font-medium text-zinc-600 bg-zinc-100 dark:bg-zinc-800/40 border border-zinc-200 dark:border-zinc-700 rounded-lg px-3 py-2">
                <RefreshCw size={13} className="shrink-0 mt-0.5" />
                <span>{draft.match_reason || 'Esta entrada ya existe — confirmar igual creará un duplicado.'}</span>
              </div>
            )}
            {draft.match_status === 'update' && draft.match_existing_id && (
              <div className="flex items-start gap-2 text-xs font-medium text-indigo-700 dark:text-indigo-300 bg-indigo-50 dark:bg-indigo-500/10 border border-indigo-200 dark:border-indigo-500/30 rounded-lg px-3 py-2">
                <RefreshCw size={13} className="shrink-0 mt-0.5" />
                <span>{draft.match_reason || 'Coincide con un registro existente.'}</span>
              </div>
            )}

            {/* Project↔client inconsistency hint */}
            {projectClientMismatch && (
              <div className="flex items-start gap-2 text-xs font-medium text-amber-700 dark:text-amber-300 bg-amber-50 dark:bg-amber-500/10 border border-amber-200 dark:border-amber-500/30 rounded-lg px-3 py-2">
                <AlertTriangle size={13} className="shrink-0 mt-0.5" />
                <div className="flex-1">
                  El proyecto pertenece a <span className="font-semibold">{projectClientMismatch.name}</span>.
                </div>
                <button type="button" onClick={() => updateDraft({ client_id: projectClientMismatch.id, client_name: projectClientMismatch.name })}
                  className="px-2 py-0.5 rounded-md bg-amber-600 text-white text-[10px] font-semibold hover:bg-amber-700 transition-colors">
                  Usar ese
                </button>
              </div>
            )}

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
                          onChange={e => {
                            const cat = e.target.value;
                            const b = findMatchingBudget(cat, draft.date, budgets);
                            updateDraft({ category: cat, budget_id: b?.id || null, budget_name: b?.name || null });
                          }}
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
                    {draft.budget_name && (
                      <p className="text-[10px] text-indigo-600 dark:text-indigo-400 flex items-center gap-1">
                        <CheckCircle2 size={10} />Auto-link al budget <strong>{draft.budget_name}</strong>
                      </p>
                    )}
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
            grouped={groupedDrafts}
            drafts={batchDrafts}
            selectedRows={selectedRows}
            setSelectedRows={setSelectedRows}
            expandedRow={expandedRow}
            setExpandedRow={setExpandedRow}
            updateBatchRow={updateBatchRow}
            projects={projects}
            clients={clients}
            budgets={budgets}
            unknownClients={unknownClients}
            unknownProjects={unknownProjects}
            onCreateClient={handleCreateUnknownClient}
            onFlagBadParse={flagBadParse}
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
// BatchPreview — sectioned by match_status (new/update/needs_review/dup)
// ════════════════════════════════════════════════════════════════════
type GroupedDrafts = {
  new: { d: DraftEntry; i: number }[];
  update: { d: DraftEntry; i: number }[];
  needs_review: { d: DraftEntry; i: number }[];
  duplicate: { d: DraftEntry; i: number }[];
};

type BatchPreviewProps = {
  grouped: GroupedDrafts;
  drafts: DraftEntry[];
  selectedRows: Set<number>;
  setSelectedRows: React.Dispatch<React.SetStateAction<Set<number>>>;
  expandedRow: number | null;
  setExpandedRow: React.Dispatch<React.SetStateAction<number | null>>;
  updateBatchRow: (idx: number, patch: Partial<DraftEntry>) => void;
  projects: Project[];
  clients: Client[];
  budgets: Budget[];
  unknownClients: string[];
  unknownProjects: string[];
  onCreateClient: (name: string) => Promise<void>;
  onFlagBadParse: (idx: number) => Promise<void>;
  error: string | null;
};

const BatchPreview: React.FC<BatchPreviewProps> = ({
  grouped, drafts, selectedRows, setSelectedRows, expandedRow, setExpandedRow,
  updateBatchRow, projects, clients, budgets, unknownClients, unknownProjects,
  onCreateClient, onFlagBadParse, error,
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

        <div className="max-h-[55vh] overflow-y-auto">
          {(['new', 'update', 'needs_review', 'duplicate'] as const).map(group => {
            const items = grouped[group];
            if (items.length === 0) return null;
            const meta = GROUP_META[group];
            return (
              <BatchPreviewSection
                key={group}
                title={meta.title}
                count={items.length}
                color={meta.color}
                icon={meta.icon}
                items={items}
                selectedRows={selectedRows}
                expandedRow={expandedRow}
                setExpandedRow={setExpandedRow}
                onToggleRow={toggleRow}
                updateBatchRow={updateBatchRow}
                projects={projects}
                clients={clients}
                budgets={budgets}
                onFlagBadParse={onFlagBadParse}
              />
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

const GROUP_META = {
  new: { title: 'New', color: 'emerald', icon: Plus },
  update: { title: 'Updates', color: 'indigo', icon: RefreshCw },
  needs_review: { title: 'Needs review', color: 'amber', icon: AlertTriangle },
  duplicate: { title: 'Duplicates', color: 'zinc', icon: RefreshCw },
} as const;

type BatchPreviewSectionProps = {
  title: string;
  count: number;
  color: string;
  icon: React.ComponentType<{ size?: number; className?: string }>;
  items: { d: DraftEntry; i: number }[];
  selectedRows: Set<number>;
  expandedRow: number | null;
  setExpandedRow: React.Dispatch<React.SetStateAction<number | null>>;
  onToggleRow: (i: number) => void;
  updateBatchRow: (idx: number, patch: Partial<DraftEntry>) => void;
  projects: Project[];
  clients: Client[];
  budgets: Budget[];
  onFlagBadParse: (idx: number) => Promise<void>;
};

const BatchPreviewSection: React.FC<BatchPreviewSectionProps> = ({
  title, count, color, icon: Icon, items, selectedRows, expandedRow, setExpandedRow,
  onToggleRow, updateBatchRow, projects, clients, budgets, onFlagBadParse,
}) => {
  const [collapsed, setCollapsed] = useState(title === 'Duplicates');
  const colorClasses: Record<string, string> = {
    emerald: 'text-emerald-700 dark:text-emerald-300 bg-emerald-50/60 dark:bg-emerald-500/5',
    indigo:  'text-indigo-700 dark:text-indigo-300 bg-indigo-50/60 dark:bg-indigo-500/5',
    amber:   'text-amber-700 dark:text-amber-300 bg-amber-50/60 dark:bg-amber-500/5',
    zinc:    'text-zinc-600 dark:text-zinc-400 bg-zinc-100/40 dark:bg-zinc-800/20',
  };
  return (
    <div className="border-t border-zinc-100 dark:border-zinc-800/60 first:border-t-0">
      <button type="button" onClick={() => setCollapsed(c => !c)}
        className={`w-full flex items-center gap-2 px-3 py-1.5 text-[10px] font-semibold uppercase tracking-wider ${colorClasses[color]}`}>
        {collapsed ? <ChevronRight size={11} /> : <ChevronDown size={11} />}
        <Icon size={11} />
        <span>{title}</span>
        <span className="opacity-60">({count})</span>
      </button>
      {!collapsed && (
        <div className="divide-y divide-zinc-100 dark:divide-zinc-800/60">
          {items.map(({ d, i }) => {
            const isSelected = selectedRows.has(i);
            const isExpanded = expandedRow === i;
            return (
              <div key={i} className={`transition-colors ${isSelected ? '' : 'opacity-50'}`}>
                <div className="flex items-center gap-2 px-3 py-2 hover:bg-zinc-50/60 dark:hover:bg-zinc-800/20">
                  <input type="checkbox" checked={isSelected} onChange={() => onToggleRow(i)}
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
                  {d.source_row != null && (
                    <span className="shrink-0 text-[9px] font-mono text-zinc-400" title={d.source_sheet ? `Hoja: ${d.source_sheet}` : undefined}>
                      {d.source_sheet ? `${d.source_sheet}#${d.source_row}` : `#${d.source_row}`}
                    </span>
                  )}
                  <div className="flex-1 min-w-0">
                    <div className="text-xs font-medium text-zinc-900 dark:text-zinc-100 truncate">
                      {d.concept || <span className="italic text-zinc-400">sin concepto</span>}
                    </div>
                    <div className="text-[10px] text-zinc-400 truncate">
                      {d.client_name || (d.client_id ? '' : 'sin cliente')}
                      {d.project_name ? ` · ${d.project_name}` : ''}
                      {' · '}{d.date}
                      {d.match_reason ? ` · ${d.match_reason}` : ''}
                    </div>
                  </div>
                  {d.budget_name && (
                    <span className="shrink-0 hidden sm:inline-flex items-center gap-1 px-1.5 py-0.5 rounded bg-indigo-100 dark:bg-indigo-500/20 text-indigo-700 dark:text-indigo-200 text-[9px] font-semibold">
                      ${d.budget_name}
                    </span>
                  )}
                  <div className={`text-xs font-semibold tabular-nums ${
                    d.kind === 'income' ? 'text-emerald-600 dark:text-emerald-400' : 'text-zinc-700 dark:text-zinc-200'
                  }`}>
                    {d.kind === 'income' ? '+' : '−'}{fmtCurrency(d.amount)}
                  </div>
                  <button type="button" onClick={() => onFlagBadParse(i)} title="Reportar mal parseo"
                    className="shrink-0 p-1 rounded text-zinc-300 hover:text-rose-500 hover:bg-rose-50 dark:hover:bg-rose-500/10 transition-colors">
                    <Flag size={11} />
                  </button>
                </div>

                {isExpanded && (
                  <div className="px-3 pb-3 pt-1 space-y-2 bg-zinc-50/40 dark:bg-zinc-800/10">
                    {/* Validation errors banner */}
                    {d.validation_errors.length > 0 && (
                      <div className="text-[10px] text-rose-700 dark:text-rose-300 bg-rose-50 dark:bg-rose-500/10 border border-rose-200 dark:border-rose-500/30 rounded px-2 py-1.5 space-y-0.5">
                        {d.validation_errors.map((err, ei) => (
                          <div key={ei} className="flex items-start gap-1"><AlertCircle size={10} className="shrink-0 mt-0.5" /><span>{err}</span></div>
                        ))}
                      </div>
                    )}

                    {/* Source row audit panel */}
                    {d.source_row_data && (
                      <div className="rounded border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 px-2 py-1.5 text-[10px]">
                        <div className="flex items-center gap-1 text-[9px] font-semibold uppercase tracking-wider text-zinc-400 mb-1">
                          <FileSpreadsheet size={10} />
                          {d.source_sheet ? `Hoja "${d.source_sheet}" · Fila #${d.source_row}` : `Fila origen #${d.source_row}`}
                        </div>
                        <div className="grid grid-cols-2 gap-x-3 gap-y-0.5">
                          {Object.entries(d.source_row_data).map(([h, v]) => (
                            <div key={h} className="truncate">
                              <span className="text-zinc-400">{h}:</span>{' '}
                              <span className="text-zinc-700 dark:text-zinc-300">{String(v ?? '') || <span className="italic text-zinc-300">vacío</span>}</span>
                            </div>
                          ))}
                        </div>
                      </div>
                    )}

                    {/* Update action selector — only for `update` rows */}
                    {d.match_status === 'update' && d.match_existing_id && (
                      <div className="flex items-center gap-2 text-[10px]">
                        <span className="text-zinc-500 font-medium">Acción:</span>
                        <select value={d.update_action}
                          onChange={e => updateBatchRow(i, { update_action: e.target.value as DraftEntry['update_action'] })}
                          className="rounded border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 px-2 py-1 text-[10px] text-zinc-900 dark:text-zinc-100 focus:outline-none focus:ring-1 focus:ring-indigo-500/30">
                          <option value="update">Actualizar existente</option>
                          <option value="create">Crear nuevo (ej. nueva instancia)</option>
                          <option value="skip">Skip</option>
                        </select>
                      </div>
                    )}

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
                        <select value={d.category || 'Operations'} onChange={e => {
                          const cat = e.target.value;
                          const b = findMatchingBudget(cat, d.date, budgets);
                          updateBatchRow(i, { category: cat, budget_id: b?.id || null, budget_name: b?.name || null });
                        }}
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
      )}
    </div>
  );
};
