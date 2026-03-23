import React, { useEffect, useRef } from 'react';
import { useEditor, EditorContent } from '@tiptap/react';
import StarterKit from '@tiptap/starter-kit';
import Underline from '@tiptap/extension-underline';
import Placeholder from '@tiptap/extension-placeholder';
import {
  Bold,
  Italic,
  Underline as UnderlineIcon,
  Heading2,
  Heading3,
  List,
  ListOrdered,
  Quote,
} from 'lucide-react';

interface Props {
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  rows?: number;
  className?: string;
  /** Hide heading & quote buttons (useful for quote blocks) */
  minimal?: boolean;
}

/** Convert legacy markdown-lite content (bold + bullets) to HTML */
function markdownLiteToHtml(text: string): string {
  if (!text || text.startsWith('<')) return text;

  const lines = text.split('\n');
  const htmlParts: string[] = [];
  let inList = false;

  for (const line of lines) {
    const isBullet = line.startsWith('- ');

    if (isBullet && !inList) {
      htmlParts.push('<ul>');
      inList = true;
    } else if (!isBullet && inList) {
      htmlParts.push('</ul>');
      inList = false;
    }

    if (isBullet) {
      const content = line.slice(2).replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>');
      htmlParts.push(`<li><p>${content}</p></li>`);
    } else if (line.trim() === '') {
      htmlParts.push('<p></p>');
    } else {
      const content = line.replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>');
      htmlParts.push(`<p>${content}</p>`);
    }
  }

  if (inList) htmlParts.push('</ul>');
  return htmlParts.join('');
}

const BTN =
  'p-1 rounded transition-colors text-[#78736A] hover:text-[#09090B] hover:bg-[#E6E2D8]/60';
const BTN_ACTIVE =
  'p-1 rounded transition-colors bg-[#E8BC59]/15 text-[#E8BC59]';

export const MiniEditor: React.FC<Props> = ({
  value,
  onChange,
  placeholder = '',
  rows = 6,
  className = '',
  minimal = false,
}) => {
  const internalUpdate = useRef(false);

  const editor = useEditor({
    extensions: [
      StarterKit.configure({
        heading: { levels: [2, 3] },
        codeBlock: false,
        code: false,
        horizontalRule: false,
      }),
      Underline,
      Placeholder.configure({ placeholder }),
    ],
    content: markdownLiteToHtml(value),
    editorProps: {
      attributes: {
        class: `prose prose-sm prose-zinc max-w-none outline-none ${className}`,
        style: `min-height: ${Math.max(rows * 24, 96)}px`,
      },
    },
    onUpdate: ({ editor: e }) => {
      internalUpdate.current = true;
      const html = e.getHTML();
      onChange(html === '<p></p>' ? '' : html);
    },
  });

  // Sync external value changes without resetting cursor
  useEffect(() => {
    if (!editor) return;
    if (internalUpdate.current) {
      internalUpdate.current = false;
      return;
    }
    const current = editor.getHTML();
    const incoming = markdownLiteToHtml(value);
    if (current !== incoming && incoming !== current) {
      editor.commands.setContent(incoming, false);
    }
  }, [value, editor]);

  if (!editor) return null;

  return (
    <div className="rounded-lg border border-[#E6E2D8] bg-white overflow-hidden focus-within:border-[#E8BC59] transition-colors">
      {/* Toolbar */}
      <div className="flex items-center gap-0.5 px-2 py-1.5 border-b border-[#E6E2D8] bg-[#FAFAF8] flex-wrap">
        {/* Text formatting */}
        <button
          type="button"
          onClick={() => editor.chain().focus().toggleBold().run()}
          className={editor.isActive('bold') ? BTN_ACTIVE : BTN}
          title="Bold (Ctrl+B)"
        >
          <Bold size={14} />
        </button>
        <button
          type="button"
          onClick={() => editor.chain().focus().toggleItalic().run()}
          className={editor.isActive('italic') ? BTN_ACTIVE : BTN}
          title="Italic (Ctrl+I)"
        >
          <Italic size={14} />
        </button>
        <button
          type="button"
          onClick={() => editor.chain().focus().toggleUnderline().run()}
          className={editor.isActive('underline') ? BTN_ACTIVE : BTN}
          title="Underline (Ctrl+U)"
        >
          <UnderlineIcon size={14} />
        </button>

        {!minimal && (
          <>
            <div className="w-px h-4 bg-[#E6E2D8] mx-1" />
            {/* Headings */}
            <button
              type="button"
              onClick={() => editor.chain().focus().toggleHeading({ level: 2 }).run()}
              className={editor.isActive('heading', { level: 2 }) ? BTN_ACTIVE : BTN}
              title="Heading 2"
            >
              <Heading2 size={14} />
            </button>
            <button
              type="button"
              onClick={() => editor.chain().focus().toggleHeading({ level: 3 }).run()}
              className={editor.isActive('heading', { level: 3 }) ? BTN_ACTIVE : BTN}
              title="Heading 3"
            >
              <Heading3 size={14} />
            </button>
          </>
        )}

        <div className="w-px h-4 bg-[#E6E2D8] mx-1" />
        {/* Lists */}
        <button
          type="button"
          onClick={() => editor.chain().focus().toggleBulletList().run()}
          className={editor.isActive('bulletList') ? BTN_ACTIVE : BTN}
          title="Bullet list"
        >
          <List size={14} />
        </button>
        <button
          type="button"
          onClick={() => editor.chain().focus().toggleOrderedList().run()}
          className={editor.isActive('orderedList') ? BTN_ACTIVE : BTN}
          title="Ordered list"
        >
          <ListOrdered size={14} />
        </button>

        {!minimal && (
          <>
            <div className="w-px h-4 bg-[#E6E2D8] mx-1" />
            <button
              type="button"
              onClick={() => editor.chain().focus().toggleBlockquote().run()}
              className={editor.isActive('blockquote') ? BTN_ACTIVE : BTN}
              title="Quote"
            >
              <Quote size={14} />
            </button>
          </>
        )}
      </div>

      {/* Editor */}
      <div className="px-3 py-2.5">
        <EditorContent editor={editor} />
      </div>
    </div>
  );
};
