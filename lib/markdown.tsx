/**
 * Tiny markdown renderer for AI chat messages.
 *
 * Why hand-rolled (no `marked` / `react-markdown` / `remark`):
 *   • All three would add 50-200kb gzipped to a bundle that's already
 *     pushing 380kb. The AI output set is narrow — bold, italics,
 *     bullets, numbered lists, headings, inline + fenced code,
 *     blockquotes. That's a 100-line parser.
 *   • We also want CUSTOM block types the agents can emit:
 *       :::stat label=Foo value=$5k tone=emerald
 *       :::callout tone=info :: Body text
 *       :::pill tone=rose :: URGENT
 *     Easier to weave these in without fighting plugin APIs.
 *
 * Renders into our app's typography/spacing classes — no global
 * .prose styles needed, no extra Tailwind plugin.
 */
import React from 'react';

// ── Interactive action types ───────────────────────────────────────
// When interactive blocks (topic pills, clickable headings) are present,
// the consumer passes an `onAction` callback to `<Markdown>`. Each
// interactive block fires this with a typed payload.
export type MarkdownAction =
  | { type: 'topic_click'; label: string; filter: string }
  | { type: 'navigate'; target: string; params?: Record<string, string> };

type Block =
  | { type: 'heading'; level: number; text: string }
  | { type: 'para'; text: string }
  | { type: 'ulist'; items: string[] }
  | { type: 'olist'; items: string[] }
  | { type: 'code'; lang: string | null; content: string }
  | { type: 'quote'; text: string }
  | { type: 'callout'; tone: ToneKey; body: string }
  | { type: 'stat'; label: string; value: string; tone: ToneKey }
  | { type: 'divider' }
  // ── Richer directives ────────────────────────────────────────────
  // section: titled, color-toned block. Body parsed recursively.
  //   :::section title="..." tone="violet"
  //   ... markdown body ...
  //   :::end:::
  | { type: 'section'; title: string; tone: ToneKey; body: Block[] }
  // row: aligned key:value display. Multiple rows stack nicely.
  //   :::row label="Implementation" value="$5,000":::
  | { type: 'row'; label: string; value: string; tone?: ToneKey }
  // kpi: bigger value display for a single key metric — bigger than stat.
  //   :::kpi label="MRR" value="$2,400" target="$3,000" tone="emerald":::
  | { type: 'kpi'; label: string; value: string; target?: string; tone: ToneKey }
  // Visual grid of stat tiles. Body lines are `label | value | tone`.
  //   :::grid
  //   Overdue | 25 | rose
  //   Due today | 1 | amber
  //   :::end:::
  | { type: 'grid'; tiles: Array<{ label: string; value: string; tone: ToneKey }> }
  // tasklist: bullet list where each item can be prefixed with
  // [urgent] / [high] / [medium] / [low] / [done] for visual priority.
  // Treated specially so the renderer can drop colored dots.
  | { type: 'tasklist'; items: Array<{ priority: TaskPriority; text: string }> }
  // topic: clickable pill for topic/channel groupings. Fires onAction
  // with the filter value when clicked.
  //   :::topic label="Frenetic Updates" count="6" filter="#frenetic-pace" tone="violet":::
  | { type: 'topic'; label: string; count?: string; filter: string; tone: ToneKey }
  // topics: a row of topic pills rendered as a flex-wrap group.
  //   :::topics
  //   Frenetic Updates | 6 | #frenetic-pace | violet
  //   Mobilita Feedback | 4 | #mobilita | rose
  //   :::end:::
  | { type: 'topics'; items: Array<{ label: string; count?: string; filter: string; tone: ToneKey }> };

type TaskPriority = 'urgent' | 'high' | 'medium' | 'low' | 'done' | 'none';
const PRIORITY_DOT: Record<TaskPriority, string> = {
  urgent: 'bg-rose-500',
  high:   'bg-amber-500',
  medium: 'bg-indigo-400',
  low:    'bg-zinc-300 dark:bg-zinc-700',
  done:   'bg-emerald-500',
  none:   'bg-zinc-300 dark:bg-zinc-700',
};
const detectPriority = (s: string): { priority: TaskPriority; text: string } => {
  const m = s.match(/^\[(urgent|high|medium|low|done)\]\s+(.+)$/i);
  if (m) return { priority: m[1].toLowerCase() as TaskPriority, text: m[2] };
  return { priority: 'none', text: s };
};

type ToneKey = 'rose' | 'amber' | 'emerald' | 'violet' | 'indigo' | 'blue' | 'zinc';

// ── Block tokenizer ─────────────────────────────────────────────
// Single pass over lines. Tracks fenced-code-block state so backticks
// inside code don't trigger inline parsing. Custom `:::` directives
// short-circuit before normal markdown rules.
const parseBlocks = (md: string): Block[] => {
  const lines = md.replace(/\r\n/g, '\n').split('\n');
  const blocks: Block[] = [];
  let i = 0;
  let paraBuffer: string[] = [];
  let listBuffer: { kind: 'u' | 'o'; items: string[] } | null = null;
  const flushPara = () => {
    if (paraBuffer.length) {
      blocks.push({ type: 'para', text: paraBuffer.join(' ') });
      paraBuffer = [];
    }
  };
  const flushList = () => {
    if (listBuffer) {
      blocks.push(listBuffer.kind === 'u'
        ? { type: 'ulist', items: listBuffer.items }
        : { type: 'olist', items: listBuffer.items });
      listBuffer = null;
    }
  };
  while (i < lines.length) {
    const raw = lines[i];
    const line = raw.trimEnd();
    // Fenced code block
    const fence = line.match(/^```\s*([\w-]*)\s*$/);
    if (fence) {
      flushPara(); flushList();
      const lang = fence[1] || null;
      const body: string[] = [];
      i++;
      while (i < lines.length && !/^```\s*$/.test(lines[i])) {
        body.push(lines[i]);
        i++;
      }
      i++; // skip closing fence
      blocks.push({ type: 'code', lang, content: body.join('\n') });
      continue;
    }
    // Custom directive: :::stat label="X" value="Y" tone="emerald":::
    const statM = line.match(/^:::stat\s+(.+):::$/);
    if (statM) {
      flushPara(); flushList();
      const attrs = parseAttrs(statM[1]);
      blocks.push({
        type: 'stat',
        label: attrs.label || '',
        value: attrs.value || '',
        tone: toneOf(attrs.tone),
      });
      i++; continue;
    }
    // :::row label="..." value="..." tone="...":::
    const rowM = line.match(/^:::row\s+(.+):::$/);
    if (rowM) {
      flushPara(); flushList();
      const attrs = parseAttrs(rowM[1]);
      blocks.push({
        type: 'row',
        label: attrs.label || '',
        value: attrs.value || '',
        tone: attrs.tone ? toneOf(attrs.tone) : undefined,
      });
      i++; continue;
    }
    // :::kpi label="..." value="..." target="..." tone="...":::
    const kpiM = line.match(/^:::kpi\s+(.+):::$/);
    if (kpiM) {
      flushPara(); flushList();
      const attrs = parseAttrs(kpiM[1]);
      blocks.push({
        type: 'kpi',
        label: attrs.label || '',
        value: attrs.value || '',
        target: attrs.target || undefined,
        tone: toneOf(attrs.tone),
      });
      i++; continue;
    }
    // :::section title="..." tone="..." ... :::end:::
    // Body is parsed recursively so nested directives work.
    const sectionOpen = line.match(/^:::section\s+(.+)$/);
    if (sectionOpen && !line.endsWith(':::')) {
      flushPara(); flushList();
      const attrs = parseAttrs(sectionOpen[1]);
      const body: string[] = [];
      i++;
      while (i < lines.length && lines[i].trim() !== ':::end:::' && lines[i].trim() !== ':::') {
        body.push(lines[i]);
        i++;
      }
      i++;
      blocks.push({
        type: 'section',
        title: attrs.title || '',
        tone: toneOf(attrs.tone),
        body: parseBlocks(body.join('\n')),
      });
      continue;
    }
    // :::grid ... :::end:::  — body lines: `label | value | tone`
    const gridOpen = line.match(/^:::grid\s*$/);
    if (gridOpen) {
      flushPara(); flushList();
      const tiles: Array<{ label: string; value: string; tone: ToneKey }> = [];
      i++;
      while (i < lines.length && lines[i].trim() !== ':::end:::' && lines[i].trim() !== ':::') {
        const row = lines[i].trim();
        if (row) {
          const parts = row.split('|').map(p => p.trim());
          if (parts.length >= 2) {
            tiles.push({
              label: parts[0] || '',
              value: parts[1] || '',
              tone: toneOf(parts[2]),
            });
          }
        }
        i++;
      }
      i++;
      blocks.push({ type: 'grid', tiles });
      continue;
    }
    // :::topic label="..." count="6" filter="..." tone="...":::
    const topicM = line.match(/^:::topic\s+(.+):::$/);
    if (topicM) {
      flushPara(); flushList();
      const attrs = parseAttrs(topicM[1]);
      blocks.push({
        type: 'topic',
        label: attrs.label || '',
        count: attrs.count || undefined,
        filter: attrs.filter || attrs.label || '',
        tone: toneOf(attrs.tone),
      });
      i++; continue;
    }
    // :::topics ... :::end:::  — body lines: `label | count | filter | tone`
    const topicsOpen = line.match(/^:::topics\s*$/);
    if (topicsOpen) {
      flushPara(); flushList();
      const items: Array<{ label: string; count?: string; filter: string; tone: ToneKey }> = [];
      i++;
      while (i < lines.length && lines[i].trim() !== ':::end:::' && lines[i].trim() !== ':::') {
        const row = lines[i].trim();
        if (row) {
          const parts = row.split('|').map(p => p.trim());
          if (parts.length >= 2) {
            items.push({
              label: parts[0] || '',
              count: parts[1] || undefined,
              filter: parts[2] || parts[0] || '',
              tone: toneOf(parts[3]),
            });
          }
        }
        i++;
      }
      i++;
      blocks.push({ type: 'topics', items });
      continue;
    }
    // :::tasklist ... :::end:::  — body lines: each is a task item
    // (with optional [urgent] [high] [medium] [low] [done] prefix).
    const tasklistOpen = line.match(/^:::tasklist\s*$/);
    if (tasklistOpen) {
      flushPara(); flushList();
      const items: Array<{ priority: TaskPriority; text: string }> = [];
      i++;
      while (i < lines.length && lines[i].trim() !== ':::end:::' && lines[i].trim() !== ':::') {
        const raw = lines[i].trim().replace(/^[-*•]\s*/, '');
        if (raw) items.push(detectPriority(raw));
        i++;
      }
      i++;
      blocks.push({ type: 'tasklist', items });
      continue;
    }
    // Custom directive: :::callout tone="info" :: Body text
    const calloutInline = line.match(/^:::callout\s+(.+?)::\s*(.+)$/);
    if (calloutInline) {
      flushPara(); flushList();
      const attrs = parseAttrs(calloutInline[1]);
      blocks.push({
        type: 'callout',
        tone: toneOf(attrs.tone),
        body: calloutInline[2],
      });
      i++; continue;
    }
    // Multi-line callout: :::callout tone="info" ... ::: on its own line
    const calloutOpen = line.match(/^:::callout\s+(.+)$/);
    if (calloutOpen && !line.endsWith(':::')) {
      flushPara(); flushList();
      const attrs = parseAttrs(calloutOpen[1]);
      const body: string[] = [];
      i++;
      while (i < lines.length && lines[i].trim() !== ':::') {
        body.push(lines[i]);
        i++;
      }
      i++;
      blocks.push({ type: 'callout', tone: toneOf(attrs.tone), body: body.join('\n') });
      continue;
    }
    // Heading
    const h = line.match(/^(#{1,6})\s+(.+)$/);
    if (h) {
      flushPara(); flushList();
      blocks.push({ type: 'heading', level: h[1].length, text: h[2] });
      i++; continue;
    }
    // Horizontal rule
    if (/^---+$/.test(line) || /^\*\*\*+$/.test(line)) {
      flushPara(); flushList();
      blocks.push({ type: 'divider' });
      i++; continue;
    }
    // Blockquote
    if (line.startsWith('> ')) {
      flushPara(); flushList();
      const buf: string[] = [line.slice(2)];
      while (i + 1 < lines.length && lines[i + 1].startsWith('> ')) {
        buf.push(lines[i + 1].slice(2));
        i++;
      }
      blocks.push({ type: 'quote', text: buf.join(' ') });
      i++; continue;
    }
    // Unordered list
    const ul = line.match(/^[\s]*[-*•]\s+(.+)$/);
    if (ul) {
      flushPara();
      if (!listBuffer || listBuffer.kind !== 'u') {
        flushList();
        listBuffer = { kind: 'u', items: [] };
      }
      listBuffer.items.push(ul[1]);
      i++; continue;
    }
    // Ordered list
    const ol = line.match(/^[\s]*\d+\.\s+(.+)$/);
    if (ol) {
      flushPara();
      if (!listBuffer || listBuffer.kind !== 'o') {
        flushList();
        listBuffer = { kind: 'o', items: [] };
      }
      listBuffer.items.push(ol[1]);
      i++; continue;
    }
    // Blank line — paragraph break
    if (line.trim() === '') {
      flushPara(); flushList();
      i++; continue;
    }
    // Normal paragraph text
    flushList();
    paraBuffer.push(line);
    i++;
  }
  flushPara(); flushList();
  return blocks;
};

// ── Inline tokenizer ────────────────────────────────────────────
// Handles **bold**, *italic*, `code`, [text](url). Does not nest
// (good enough for AI output, vastly simpler than a real grammar).
const parseInline = (text: string): React.ReactNode[] => {
  const out: React.ReactNode[] = [];
  let i = 0;
  let buffer = '';
  const flush = () => {
    if (buffer) {
      // Auto-linkify bare URLs as a last pass on the buffer.
      out.push(...linkify(buffer));
      buffer = '';
    }
  };
  while (i < text.length) {
    // Bold ** ** (no nesting)
    if (text[i] === '*' && text[i + 1] === '*') {
      const end = text.indexOf('**', i + 2);
      if (end > i + 2) {
        flush();
        out.push(<strong key={out.length} className="font-semibold text-zinc-900 dark:text-zinc-100">{text.slice(i + 2, end)}</strong>);
        i = end + 2;
        continue;
      }
    }
    // Italic * *
    if (text[i] === '*' && text[i - 1] !== '*' && text[i + 1] !== '*') {
      const end = text.indexOf('*', i + 1);
      if (end > i + 1 && text[end - 1] !== '*' && text[end + 1] !== '*') {
        flush();
        out.push(<em key={out.length} className="italic">{text.slice(i + 1, end)}</em>);
        i = end + 1;
        continue;
      }
    }
    // Inline code
    if (text[i] === '`') {
      const end = text.indexOf('`', i + 1);
      if (end > i + 1) {
        flush();
        out.push(<code key={out.length} className="px-1 py-0.5 rounded bg-zinc-100 dark:bg-zinc-800 text-[0.92em] font-mono text-zinc-800 dark:text-zinc-100">{text.slice(i + 1, end)}</code>);
        i = end + 1;
        continue;
      }
    }
    // Link [text](url)
    if (text[i] === '[') {
      const m = text.slice(i).match(/^\[([^\]]+)\]\(([^)]+)\)/);
      if (m) {
        flush();
        out.push(<a key={out.length} href={m[2]} target="_blank" rel="noreferrer" className="text-violet-600 dark:text-violet-400 hover:underline">{m[1]}</a>);
        i += m[0].length;
        continue;
      }
    }
    buffer += text[i];
    i++;
  }
  flush();
  return out;
};

const URL_RE = /(https?:\/\/[^\s<>"]+)/g;
const linkify = (text: string): React.ReactNode[] => {
  if (!URL_RE.test(text)) return [text];
  URL_RE.lastIndex = 0;
  const parts: React.ReactNode[] = [];
  let last = 0;
  let m: RegExpExecArray | null;
  let k = 0;
  while ((m = URL_RE.exec(text)) !== null) {
    if (m.index > last) parts.push(text.slice(last, m.index));
    parts.push(<a key={`l${k++}`} href={m[0]} target="_blank" rel="noreferrer" className="text-violet-600 dark:text-violet-400 hover:underline break-all">{m[0]}</a>);
    last = m.index + m[0].length;
  }
  if (last < text.length) parts.push(text.slice(last));
  return parts;
};

// ── Attr parser for :::stat etc. — handles key="value with spaces" ──
const parseAttrs = (raw: string): Record<string, string> => {
  const out: Record<string, string> = {};
  const re = /(\w+)="([^"]*)"/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(raw)) !== null) {
    out[m[1]] = m[2];
  }
  return out;
};

const TONE_VALUES: ToneKey[] = ['rose', 'amber', 'emerald', 'violet', 'indigo', 'blue', 'zinc'];
const toneOf = (s: string | undefined): ToneKey =>
  (s && TONE_VALUES.includes(s as ToneKey)) ? (s as ToneKey)
  : s === 'info'    ? 'blue'
  : s === 'warning' ? 'amber'
  : s === 'success' ? 'emerald'
  : s === 'error'   ? 'rose'
  : 'zinc';

const TONE_CLASS: Record<ToneKey, { card: string; text: string; muted: string }> = {
  rose:    { card: 'bg-rose-50 dark:bg-rose-500/10 border-rose-200/60 dark:border-rose-500/30',          text: 'text-rose-700 dark:text-rose-300',    muted: 'text-rose-500/80 dark:text-rose-400/80' },
  amber:   { card: 'bg-amber-50 dark:bg-amber-500/10 border-amber-200/60 dark:border-amber-500/30',      text: 'text-amber-700 dark:text-amber-300',   muted: 'text-amber-600/80 dark:text-amber-400/80' },
  emerald: { card: 'bg-emerald-50 dark:bg-emerald-500/10 border-emerald-200/60 dark:border-emerald-500/30', text: 'text-emerald-700 dark:text-emerald-300', muted: 'text-emerald-600/80 dark:text-emerald-400/80' },
  violet:  { card: 'bg-violet-50 dark:bg-violet-500/10 border-violet-200/60 dark:border-violet-500/30',  text: 'text-violet-700 dark:text-violet-300', muted: 'text-violet-600/80 dark:text-violet-400/80' },
  indigo:  { card: 'bg-indigo-50 dark:bg-indigo-500/10 border-indigo-200/60 dark:border-indigo-500/30',  text: 'text-indigo-700 dark:text-indigo-300', muted: 'text-indigo-600/80 dark:text-indigo-400/80' },
  blue:    { card: 'bg-blue-50 dark:bg-blue-500/10 border-blue-200/60 dark:border-blue-500/30',          text: 'text-blue-700 dark:text-blue-300',     muted: 'text-blue-600/80 dark:text-blue-400/80' },
  zinc:    { card: 'bg-zinc-50 dark:bg-zinc-800 border-zinc-200/70 dark:border-zinc-700',                text: 'text-zinc-800 dark:text-zinc-200',     muted: 'text-zinc-500/80 dark:text-zinc-400/80' },
};

// ── Action context ──────────────────────────────────────────────
// Threaded through React context so deeply nested blocks (topic
// pills inside sections, etc.) can fire click handlers without
// prop-drilling through every intermediate component.
const ActionCtx = React.createContext<((action: MarkdownAction) => void) | undefined>(undefined);

// ── Topic pill ─────────────────────────────────────────────────
const TopicPill: React.FC<{
  label: string;
  count?: string;
  filter: string;
  tone: ToneKey;
}> = ({ label, count, filter, tone }) => {
  const onAction = React.useContext(ActionCtx);
  const c = TONE_CLASS[tone];
  return (
    <button
      type="button"
      onClick={() => onAction?.({ type: 'topic_click', label, filter })}
      className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-[11px] font-medium transition-all
        ${c.card} ${c.text}
        ${onAction
          ? 'cursor-pointer hover:scale-[1.04] hover:shadow-sm active:scale-[0.97]'
          : 'cursor-default'
        }`}
    >
      <span className="truncate max-w-[160px]">{label}</span>
      {count && (
        <span className={`inline-flex items-center justify-center min-w-[18px] h-[16px] rounded-full text-[9px] font-bold tabular-nums ${c.muted} bg-black/5 dark:bg-white/10`}>
          {count}
        </span>
      )}
      {onAction && (
        <svg className="w-3 h-3 opacity-50" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" />
        </svg>
      )}
    </button>
  );
};

// ── Block renderer ──────────────────────────────────────────────
const Heading: React.FC<{ level: number; text: string }> = ({ level, text }) => {
  const inline = parseInline(text);
  const Tag = `h${Math.min(level, 6)}` as 'h1' | 'h2' | 'h3' | 'h4' | 'h5' | 'h6';
  // H1: big + violet accent bar on the left. Headlines a section.
  if (level === 1) {
    return (
      <Tag className="text-[17px] font-bold text-zinc-900 dark:text-zinc-100 mt-4 mb-2 pl-2.5 border-l-2 border-violet-500">
        {inline}
      </Tag>
    );
  }
  // H2: medium + thin underline. Section breaks.
  if (level === 2) {
    return (
      <Tag className="text-[14px] font-bold text-zinc-900 dark:text-zinc-100 mt-3.5 mb-1.5 pb-1 border-b border-zinc-200/70 dark:border-zinc-800">
        {inline}
      </Tag>
    );
  }
  // H3: small + uppercase + tracking. Sub-sections / category tags.
  if (level === 3) {
    return (
      <Tag className="text-[10.5px] font-bold uppercase tracking-[0.08em] text-zinc-500 dark:text-zinc-400 mt-3 mb-1.5">
        {inline}
      </Tag>
    );
  }
  return React.createElement(Tag, { className: 'text-[12px] font-semibold text-zinc-700 dark:text-zinc-300 mt-2 mb-1' }, inline);
};

const ListItem: React.FC<{ text: string }> = ({ text }) => (
  <li className="leading-relaxed">{parseInline(text)}</li>
);

const RenderBlock: React.FC<{ block: Block }> = ({ block }) => {
  if (block.type === 'heading') return <Heading level={block.level} text={block.text} />;
  if (block.type === 'para') return <p className="text-[12.5px] leading-relaxed text-zinc-700 dark:text-zinc-200">{parseInline(block.text)}</p>;
  if (block.type === 'ulist') {
    // Auto-upgrade plain bullets to task-style rendering when any item
    // starts with a [priority] prefix. Keeps the renderer "do what I
    // mean" — the AI doesn't have to remember to wrap in :::tasklist:::
    // if it's already using bracketed priorities.
    const detected = block.items.map(detectPriority);
    const anyPriority = detected.some(d => d.priority !== 'none');
    if (anyPriority) {
      return (
        <ul className="space-y-1 my-1">
          {detected.map((d, i) => (
            <li key={i} className="flex items-start gap-2 text-[12.5px] text-zinc-700 dark:text-zinc-200 leading-relaxed">
              <span className={`mt-[7px] w-1.5 h-1.5 rounded-full shrink-0 ${PRIORITY_DOT[d.priority]}`} aria-hidden />
              <span className="flex-1 min-w-0">{parseInline(d.text)}</span>
            </li>
          ))}
        </ul>
      );
    }
    return (
      <ul className="list-disc list-outside pl-5 space-y-0.5 text-[12.5px] text-zinc-700 dark:text-zinc-200 marker:text-zinc-400">
        {block.items.map((t, i) => <ListItem key={i} text={t} />)}
      </ul>
    );
  }
  if (block.type === 'olist') return (
    <ol className="list-decimal list-outside pl-5 space-y-0.5 text-[12.5px] text-zinc-700 dark:text-zinc-200 marker:text-zinc-400 marker:tabular-nums">
      {block.items.map((t, i) => <ListItem key={i} text={t} />)}
    </ol>
  );
  if (block.type === 'code') return (
    <pre className="bg-zinc-50 dark:bg-zinc-800/60 border border-zinc-200/70 dark:border-zinc-700 rounded-lg p-2.5 overflow-x-auto text-[11px] font-mono text-zinc-700 dark:text-zinc-200 my-2">
      <code>{block.content}</code>
    </pre>
  );
  if (block.type === 'quote') return (
    <blockquote className="border-l-2 border-zinc-300 dark:border-zinc-700 pl-3 text-[12.5px] italic text-zinc-600 dark:text-zinc-300 my-1.5">
      {parseInline(block.text)}
    </blockquote>
  );
  if (block.type === 'divider') return <hr className="border-zinc-100 dark:border-zinc-800/60 my-2" />;
  if (block.type === 'callout') {
    const c = TONE_CLASS[block.tone];
    return (
      <div className={`rounded-lg border p-2.5 my-2 ${c.card}`}>
        <p className={`text-[12px] leading-relaxed ${c.text}`}>{parseInline(block.body)}</p>
      </div>
    );
  }
  if (block.type === 'stat') {
    const c = TONE_CLASS[block.tone];
    return (
      <div className={`inline-flex items-baseline gap-1.5 rounded-md border px-2 py-1 my-0.5 ${c.card}`}>
        <span className={`text-[9px] font-bold uppercase tracking-wider ${c.muted}`}>{block.label}</span>
        <span className={`text-[13px] font-semibold tabular-nums ${c.text}`}>{block.value}</span>
      </div>
    );
  }
  // ── Richer directives ──────────────────────────────────────────
  if (block.type === 'section') {
    const c = TONE_CLASS[block.tone];
    return (
      <section className={`rounded-xl border my-2 ${c.card}`}>
        {block.title && (
          <div className={`px-3 py-2 border-b border-current/10 text-[11px] font-bold uppercase tracking-[0.06em] ${c.text}`}>
            {block.title}
          </div>
        )}
        <div className="px-3 py-2 space-y-1.5">
          {block.body.map((b, i) => <RenderBlock key={i} block={b} />)}
        </div>
      </section>
    );
  }
  if (block.type === 'row') {
    const c = block.tone ? TONE_CLASS[block.tone] : TONE_CLASS.zinc;
    return (
      <div className="flex items-center justify-between gap-3 px-2.5 py-1.5 rounded-md bg-zinc-50/60 dark:bg-zinc-800/40 border border-zinc-100 dark:border-zinc-800/60 my-0.5">
        <span className="text-[11px] font-medium text-zinc-600 dark:text-zinc-300 truncate">{parseInline(block.label)}</span>
        <span className={`text-[12px] font-semibold tabular-nums shrink-0 ${block.tone ? c.text : 'text-zinc-800 dark:text-zinc-100'}`}>{parseInline(block.value)}</span>
      </div>
    );
  }
  if (block.type === 'kpi') {
    const c = TONE_CLASS[block.tone];
    return (
      <div className={`rounded-xl border p-3 my-2 ${c.card}`}>
        <div className={`text-[10px] font-bold uppercase tracking-wider ${c.muted} mb-1`}>{block.label}</div>
        <div className="flex items-baseline gap-2">
          <span className={`text-[22px] font-bold tabular-nums ${c.text}`}>{block.value}</span>
          {block.target && (
            <span className={`text-[11px] tabular-nums ${c.muted}`}>/ {block.target}</span>
          )}
        </div>
      </div>
    );
  }
  if (block.type === 'grid') {
    return (
      <div className="grid grid-cols-2 md:grid-cols-3 gap-2 my-2">
        {block.tiles.map((t, i) => {
          const c = TONE_CLASS[t.tone];
          return (
            <div key={i} className={`rounded-lg border px-3 py-2 ${c.card}`}>
              <div className={`text-[9.5px] font-bold uppercase tracking-wider ${c.muted}`}>{t.label}</div>
              <div className={`text-[15px] font-semibold tabular-nums mt-0.5 ${c.text}`}>{t.value}</div>
            </div>
          );
        })}
      </div>
    );
  }
  if (block.type === 'tasklist') {
    return (
      <ul className="space-y-1 my-1">
        {block.items.map((item, i) => (
          <li key={i} className="flex items-start gap-2 text-[12.5px] text-zinc-700 dark:text-zinc-200 leading-relaxed">
            <span className={`mt-[7px] w-1.5 h-1.5 rounded-full shrink-0 ${PRIORITY_DOT[item.priority]}`} aria-hidden />
            <span className="flex-1 min-w-0">{parseInline(item.text)}</span>
            {item.priority !== 'none' && item.priority !== 'medium' && (
              <span className={`text-[9px] font-bold uppercase tracking-wider shrink-0 mt-1 ${
                item.priority === 'urgent' || item.priority === 'high' ? 'text-rose-500' :
                item.priority === 'done' ? 'text-emerald-500' :
                'text-zinc-400'
              }`}>{item.priority}</span>
            )}
          </li>
        ))}
      </ul>
    );
  }
  if (block.type === 'topic') {
    return (
      <div className="inline-flex my-0.5 mr-1.5">
        <TopicPill label={block.label} count={block.count} filter={block.filter} tone={block.tone} />
      </div>
    );
  }
  if (block.type === 'topics') {
    return (
      <div className="flex flex-wrap gap-1.5 my-2">
        {block.items.map((t, i) => (
          <TopicPill key={i} label={t.label} count={t.count} filter={t.filter} tone={t.tone} />
        ))}
      </div>
    );
  }
  return null;
};

export const Markdown: React.FC<{
  source: string;
  className?: string;
  /** Fires when the user clicks an interactive element (topic pill, etc.). */
  onAction?: (action: MarkdownAction) => void;
}> = ({ source, className, onAction }) => {
  if (!source) return null;
  const blocks = React.useMemo(() => parseBlocks(source), [source]);
  const content = (
    <div className={`space-y-1.5 ${className || ''}`}>
      {blocks.map((b, i) => <RenderBlock key={i} block={b} />)}
    </div>
  );
  // Only wrap in context provider when there's an action handler —
  // avoids needless re-renders for consumers that don't use interactivity.
  return onAction
    ? <ActionCtx.Provider value={onAction}>{content}</ActionCtx.Provider>
    : content;
};
