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

type Block =
  | { type: 'heading'; level: number; text: string }
  | { type: 'para'; text: string }
  | { type: 'ulist'; items: string[] }
  | { type: 'olist'; items: string[] }
  | { type: 'code'; lang: string | null; content: string }
  | { type: 'quote'; text: string }
  | { type: 'callout'; tone: ToneKey; body: string }
  | { type: 'stat'; label: string; value: string; tone: ToneKey }
  | { type: 'divider' };

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
    // Custom directive: :::stat label="X" value="Y" tone="emerald"
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

// ── Block renderer ──────────────────────────────────────────────
const Heading: React.FC<{ level: number; text: string }> = ({ level, text }) => {
  const inline = parseInline(text);
  // Tailwind sizes scale roughly with heading level — kept tight to
  // match the dense zen-minimal vibe.
  const cls = level === 1 ? 'text-[15px] font-bold text-zinc-900 dark:text-zinc-100 mt-3 mb-1.5'
            : level === 2 ? 'text-[13.5px] font-bold text-zinc-900 dark:text-zinc-100 mt-3 mb-1'
            : level === 3 ? 'text-[12.5px] font-semibold text-zinc-800 dark:text-zinc-200 mt-2.5 mb-1 uppercase tracking-wider'
            :              'text-[12px] font-semibold text-zinc-700 dark:text-zinc-300 mt-2 mb-1';
  const Tag = `h${Math.min(level, 6)}` as 'h1' | 'h2' | 'h3' | 'h4' | 'h5' | 'h6';
  return React.createElement(Tag, { className: cls }, inline);
};

const ListItem: React.FC<{ text: string }> = ({ text }) => (
  <li className="leading-relaxed">{parseInline(text)}</li>
);

const RenderBlock: React.FC<{ block: Block }> = ({ block }) => {
  if (block.type === 'heading') return <Heading level={block.level} text={block.text} />;
  if (block.type === 'para') return <p className="text-[12.5px] leading-relaxed text-zinc-700 dark:text-zinc-200">{parseInline(block.text)}</p>;
  if (block.type === 'ulist') return (
    <ul className="list-disc list-outside pl-5 space-y-0.5 text-[12.5px] text-zinc-700 dark:text-zinc-200 marker:text-zinc-400">
      {block.items.map((t, i) => <ListItem key={i} text={t} />)}
    </ul>
  );
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
  return null;
};

export const Markdown: React.FC<{ source: string; className?: string }> = ({ source, className }) => {
  if (!source) return null;
  const blocks = React.useMemo(() => parseBlocks(source), [source]);
  return (
    <div className={`space-y-1.5 ${className || ''}`}>
      {blocks.map((b, i) => <RenderBlock key={i} block={b} />)}
    </div>
  );
};
