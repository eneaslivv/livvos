// Plain-text helper that detects URLs and renders them as:
//   1. Inline clickable anchors interleaved with the original text, AND
//   2. (Optional) compact preview cards below the text — favicon + domain +
//      truncated URL — so links feel like first-class citizens instead of
//      raw http:// strings.
//
// No external scraping is performed (no OG/meta fetch). Favicons come from
// Google's S2 service which is free, fast, and tolerant of broken hosts.
//
// Use this anywhere we render user-supplied plain text that might include
// URLs (project description, task next_steps, comment bodies, lead notes…).

import React, { useMemo } from 'react';
import { Icons } from './Icons';

// Match http(s) URLs that look reasonable. Stops at whitespace and trailing
// punctuation we don't want included in the href (closing parens, periods,
// commas at end of sentences). Keep simple — false positives are far worse
// than missing the occasional weird URL.
const URL_RE = /https?:\/\/[^\s<>"]+[^\s<>".,;:!?)\]}]/g;

type Token = { kind: 'text'; value: string } | { kind: 'url'; value: string };

const tokenize = (text: string): Token[] => {
  if (!text) return [];
  const out: Token[] = [];
  let lastIndex = 0;
  let m: RegExpExecArray | null;
  // Reset state in case the regex is reused (it has the global flag).
  URL_RE.lastIndex = 0;
  while ((m = URL_RE.exec(text)) !== null) {
    if (m.index > lastIndex) out.push({ kind: 'text', value: text.slice(lastIndex, m.index) });
    out.push({ kind: 'url', value: m[0] });
    lastIndex = m.index + m[0].length;
  }
  if (lastIndex < text.length) out.push({ kind: 'text', value: text.slice(lastIndex) });
  return out;
};

const safeHostname = (url: string): string => {
  try { return new URL(url).hostname.replace(/^www\./, ''); } catch { return url; }
};

const safePath = (url: string): string => {
  try {
    const u = new URL(url);
    const path = (u.pathname + u.search).replace(/^\//, '');
    return path.length > 60 ? path.slice(0, 57) + '…' : path;
  } catch { return ''; }
};

const faviconFor = (url: string): string => {
  try {
    const host = new URL(url).hostname;
    return `https://www.google.com/s2/favicons?domain=${encodeURIComponent(host)}&sz=32`;
  } catch { return ''; }
};

interface Props {
  /** Source text that may contain URLs. */
  text: string;
  /** Below the inline render, list each unique URL as a preview card.
   *  Default: true. Set false in tight spots (table cells, etc.). */
  withCards?: boolean;
  /** When true, only render the preview cards — skip the inline text/link
   *  pass. Useful when this component sits beneath a separate text field
   *  (e.g. a textarea) that already shows the raw text. */
  cardsOnly?: boolean;
  /** Override the className for the outer wrapper. */
  className?: string;
  /** Inline link styling override. */
  linkClassName?: string;
}

export const LinkifiedText: React.FC<Props> = ({ text, withCards = true, cardsOnly = false, className, linkClassName }) => {
  const { tokens, urls } = useMemo(() => {
    const tokens = tokenize(text || '');
    const urls = Array.from(new Set(tokens.filter(t => t.kind === 'url').map(t => t.value)));
    return { tokens, urls };
  }, [text]);

  if (!text) return null;
  // When the caller only wants cards and there are no URLs, render nothing
  // — prevents an empty wrapper div from leaking visual padding/margin.
  if (cardsOnly && urls.length === 0) return null;

  const linkCls = linkClassName || 'text-blue-600 dark:text-blue-400 underline decoration-blue-300/60 underline-offset-2 hover:decoration-blue-500 hover:text-blue-700 dark:hover:text-blue-300 break-all';

  return (
    <div className={className}>
      {!cardsOnly && (
        <div className="whitespace-pre-wrap break-words">
          {tokens.map((tok, i) =>
            tok.kind === 'text'
              ? <React.Fragment key={i}>{tok.value}</React.Fragment>
              : <a key={i} href={tok.value} target="_blank" rel="noopener noreferrer" className={linkCls}>{tok.value}</a>
          )}
        </div>
      )}

      {withCards && urls.length > 0 && (
        <div className="mt-3 space-y-1.5">
          {urls.map(url => (
            <a
              key={url}
              href={url}
              target="_blank"
              rel="noopener noreferrer"
              className="group flex items-center gap-2.5 px-3 py-2 rounded-lg border border-zinc-200/80 dark:border-zinc-800 hover:border-zinc-300 dark:hover:border-zinc-700 hover:bg-zinc-50 dark:hover:bg-zinc-800/40 transition-colors"
            >
              <span className="w-7 h-7 rounded-md bg-white dark:bg-zinc-900 border border-zinc-200/80 dark:border-zinc-800 flex items-center justify-center overflow-hidden shrink-0">
                <img
                  src={faviconFor(url)}
                  alt=""
                  className="w-4 h-4"
                  onError={(e) => {
                    // Hide the broken favicon and show the link icon underneath.
                    const img = e.currentTarget as HTMLImageElement;
                    img.style.display = 'none';
                    const fallback = img.nextElementSibling as HTMLElement | null;
                    if (fallback) fallback.style.display = 'inline-flex';
                  }}
                />
                <span style={{ display: 'none' }} className="items-center justify-center text-zinc-400">
                  <Icons.Link size={12} />
                </span>
              </span>
              <span className="flex-1 min-w-0">
                <span className="block text-[12px] font-medium text-zinc-800 dark:text-zinc-200 truncate">{safeHostname(url)}</span>
                <span className="block text-[10.5px] text-zinc-400 dark:text-zinc-500 truncate font-mono">{safePath(url) || url}</span>
              </span>
              <Icons.ChevronRight size={13} className="text-zinc-300 dark:text-zinc-600 group-hover:text-zinc-500 dark:group-hover:text-zinc-400 transition-colors shrink-0" />
            </a>
          ))}
        </div>
      )}
    </div>
  );
};
