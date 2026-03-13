import React, { useRef, useCallback, useState, useMemo } from 'react';
import { Bold, List, Eye, EyeOff } from 'lucide-react';

interface Props {
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  rows?: number;
  className?: string;
}

/** Render markdown-lite (bold + bullets + paragraphs) to React nodes */
function renderRichPreview(text: string): React.ReactNode[] {
  if (!text) return [];
  const lines = text.split('\n');
  const nodes: React.ReactNode[] = [];
  let bulletBuffer: string[] = [];
  let key = 0;

  const flushBullets = () => {
    if (bulletBuffer.length === 0) return;
    nodes.push(
      <ul key={key++} className="list-disc pl-5 space-y-0.5 text-sm text-[#09090B]/80">
        {bulletBuffer.map((b, i) => (
          <li key={i}>{renderInline(b)}</li>
        ))}
      </ul>
    );
    bulletBuffer = [];
  };

  for (const line of lines) {
    if (line.startsWith('- ')) {
      bulletBuffer.push(line.slice(2));
    } else {
      flushBullets();
      if (line.trim() === '') {
        nodes.push(<div key={key++} className="h-2" />);
      } else {
        nodes.push(
          <p key={key++} className="text-sm text-[#09090B]/80 leading-relaxed">
            {renderInline(line)}
          </p>
        );
      }
    }
  }
  flushBullets();
  return nodes;
}

function renderInline(text: string): React.ReactNode {
  const parts = text.split(/(\*\*[^*]+\*\*)/);
  if (parts.length === 1) return text;
  return parts.map((part, i) =>
    part.startsWith('**') && part.endsWith('**')
      ? <strong key={i} className="font-semibold text-[#09090B]">{part.slice(2, -2)}</strong>
      : part
  );
}

export const RichTextarea: React.FC<Props> = ({ value, onChange, placeholder, rows = 6, className = '' }) => {
  const ref = useRef<HTMLTextAreaElement>(null);
  const [showPreview, setShowPreview] = useState(false);

  const wrapSelection = useCallback((before: string, after: string) => {
    const ta = ref.current;
    if (!ta) return;
    const start = ta.selectionStart;
    const end = ta.selectionEnd;
    const selected = value.substring(start, end);

    // If already wrapped, unwrap
    const textBefore = value.substring(Math.max(0, start - before.length), start);
    const textAfter = value.substring(end, end + after.length);
    if (textBefore === before && textAfter === after) {
      const newVal = value.substring(0, start - before.length) + selected + value.substring(end + after.length);
      onChange(newVal);
      requestAnimationFrame(() => {
        ta.selectionStart = start - before.length;
        ta.selectionEnd = end - before.length;
        ta.focus();
      });
      return;
    }

    const newVal = value.substring(0, start) + before + selected + after + value.substring(end);
    onChange(newVal);
    requestAnimationFrame(() => {
      ta.selectionStart = start + before.length;
      ta.selectionEnd = end + before.length;
      ta.focus();
    });
  }, [value, onChange]);

  const toggleBold = useCallback(() => wrapSelection('**', '**'), [wrapSelection]);

  const insertBullet = useCallback(() => {
    const ta = ref.current;
    if (!ta) return;
    const start = ta.selectionStart;
    // Find start of current line
    const lineStart = value.lastIndexOf('\n', start - 1) + 1;
    const line = value.substring(lineStart, value.indexOf('\n', start) === -1 ? value.length : value.indexOf('\n', start));

    if (line.startsWith('- ')) {
      // Remove bullet
      const newVal = value.substring(0, lineStart) + line.substring(2) + value.substring(lineStart + line.length);
      onChange(newVal);
      requestAnimationFrame(() => { ta.selectionStart = ta.selectionEnd = start - 2; ta.focus(); });
    } else {
      // Add bullet
      const newVal = value.substring(0, lineStart) + '- ' + value.substring(lineStart);
      onChange(newVal);
      requestAnimationFrame(() => { ta.selectionStart = ta.selectionEnd = start + 2; ta.focus(); });
    }
  }, [value, onChange]);

  const handleKeyDown = useCallback((e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    // Ctrl+B for bold
    if ((e.ctrlKey || e.metaKey) && e.key === 'b') {
      e.preventDefault();
      toggleBold();
    }
    // Enter after a bullet line → auto-add bullet
    if (e.key === 'Enter') {
      const ta = e.currentTarget;
      const pos = ta.selectionStart;
      const lineStart = value.lastIndexOf('\n', pos - 1) + 1;
      const line = value.substring(lineStart, pos);
      if (line.startsWith('- ') && line.trim() !== '-') {
        e.preventDefault();
        const newVal = value.substring(0, pos) + '\n- ' + value.substring(pos);
        onChange(newVal);
        requestAnimationFrame(() => { ta.selectionStart = ta.selectionEnd = pos + 3; ta.focus(); });
      } else if (line.trim() === '-') {
        // Empty bullet → remove it
        e.preventDefault();
        const newVal = value.substring(0, lineStart) + value.substring(pos);
        onChange(newVal);
        requestAnimationFrame(() => { ta.selectionStart = ta.selectionEnd = lineStart; ta.focus(); });
      }
    }
  }, [value, onChange, toggleBold]);

  const previewNodes = useMemo(() => renderRichPreview(value), [value]);

  return (
    <div className="rounded-lg border border-[#E6E2D8] bg-white overflow-hidden focus-within:border-[#E8BC59] transition-colors">
      {/* Toolbar */}
      <div className="flex items-center gap-1 px-2 py-1.5 border-b border-[#E6E2D8] bg-[#FAFAF8]">
        <button
          type="button"
          onClick={toggleBold}
          title="Bold (Ctrl+B)"
          className="p-1 rounded hover:bg-[#E6E2D8]/60 text-[#78736A] hover:text-[#09090B] transition-colors"
        >
          <Bold size={14} />
        </button>
        <button
          type="button"
          onClick={insertBullet}
          title="Bullet list"
          className="p-1 rounded hover:bg-[#E6E2D8]/60 text-[#78736A] hover:text-[#09090B] transition-colors"
        >
          <List size={14} />
        </button>
        <div className="ml-auto flex items-center gap-2">
          <span className="text-[9px] text-[#78736A]/50 select-none">**bold** &nbsp; - bullets</span>
          <button
            type="button"
            onClick={() => setShowPreview((p) => !p)}
            title={showPreview ? 'Hide preview' : 'Show preview'}
            className={`p-1 rounded transition-colors ${showPreview ? 'bg-[#E8BC59]/15 text-[#E8BC59]' : 'hover:bg-[#E6E2D8]/60 text-[#78736A] hover:text-[#09090B]'}`}
          >
            {showPreview ? <EyeOff size={14} /> : <Eye size={14} />}
          </button>
        </div>
      </div>
      {/* Textarea */}
      <textarea
        ref={ref}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        onKeyDown={handleKeyDown}
        placeholder={placeholder}
        rows={rows}
        className={`w-full px-3 py-2.5 text-sm text-[#09090B] outline-none resize-vertical min-h-[120px] ${className}`}
      />
      {/* Rich preview */}
      {showPreview && value.trim() && (
        <div className="px-3 py-3 border-t border-[#E6E2D8] bg-[#FDFBF7] space-y-1.5">
          <span className="text-[9px] font-mono uppercase tracking-widest text-[#78736A]/40 block mb-2">Preview</span>
          {previewNodes}
        </div>
      )}
    </div>
  );
};
