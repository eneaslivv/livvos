import React, { useRef, useCallback } from 'react';
import { Bold, List } from 'lucide-react';

interface Props {
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  rows?: number;
  className?: string;
}

export const RichTextarea: React.FC<Props> = ({ value, onChange, placeholder, rows = 6, className = '' }) => {
  const ref = useRef<HTMLTextAreaElement>(null);

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
        <span className="ml-auto text-[9px] text-[#78736A]/50 select-none">**bold** &nbsp; - bullets</span>
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
    </div>
  );
};
