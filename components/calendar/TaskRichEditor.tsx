// Slim TipTap editor for the task description block. Mirrors the visual
// affordances of a Notion text block: no chrome until focus, slash-style
// formatting via the floating toolbar that shows on selection. Persists to
// HTML so the value can round-trip through the existing tasks.description
// (treated as plain text) plus a parallel tasks.description_html column for
// rich rendering.

import React, { useEffect, useRef } from 'react';
import { useEditor, EditorContent } from '@tiptap/react';
import StarterKit from '@tiptap/starter-kit';
import Placeholder from '@tiptap/extension-placeholder';
import Underline from '@tiptap/extension-underline';
import TaskList from '@tiptap/extension-task-list';
import TaskItem from '@tiptap/extension-task-item';
import Image from '@tiptap/extension-image';
import Link from '@tiptap/extension-link';
import { Icons } from '../ui/Icons';

interface Props {
  html: string;
  onChange: (next: { html: string; text: string }) => void;
  placeholder?: string;
  /** Called whenever an image is pasted/dropped — return its hosted URL. */
  onUploadImage?: (file: File) => Promise<string | null>;
  /** Called on Cmd/Ctrl+Enter or after debounce on blur. Returns save status. */
  onCommit?: (next: { html: string; text: string }) => Promise<void> | void;
  /** Hint shown below toolbar — "Saved 2s ago" / "Saving…" */
  saveHint?: string | null;
}

// TipTap's Link extension only auto-detects URLs while the user is
// typing/pasting — content already saved with plain-text URLs (which is
// most existing tasks) doesn't get linkified on setContent. This util
// wraps unlinked URLs in <a> tags before we feed HTML to the editor, so
// historical descriptions become clickable too.
const URL_REGEX = /(https?:\/\/[^\s<>"]+|mailto:[^\s<>"]+)/g;
function linkifyHtml(input: string): string {
  if (!input) return input;
  // Skip rows that already have anchors — assume the author intended what's
  // there. We only touch HTML that has zero anchors (the common case for
  // pasted Drive/Notion links typed into the editor before Link landed).
  if (/<a\s/i.test(input)) return input;
  return input.replace(URL_REGEX, (match) => {
    // Trim trailing punctuation that's almost never part of a real URL.
    const trail = match.match(/[.,;:!?)]+$/)?.[0] || '';
    const url = trail ? match.slice(0, -trail.length) : match;
    return `<a href="${url}" target="_blank" rel="noopener noreferrer nofollow">${url}</a>${trail}`;
  });
}

export const TaskRichEditor: React.FC<Props> = ({ html, onChange, placeholder, onUploadImage, onCommit, saveHint }) => {
  // Keep a ref to the latest html prop so we don't fight with the editor's
  // internal state on every render (TipTap is the source of truth while
  // focused; the prop only matters when switching tasks).
  const lastSetRef = useRef<string>(html);

  const editor = useEditor({
    extensions: [
      StarterKit.configure({
        heading: { levels: [1, 2, 3] },
        bulletList: { HTMLAttributes: { class: 'list-disc pl-5' } },
        orderedList: { HTMLAttributes: { class: 'list-decimal pl-5' } },
        codeBlock: { HTMLAttributes: { class: 'rounded-md bg-zinc-100 dark:bg-zinc-800/60 px-3 py-2 text-[13px] font-mono' } },
        blockquote: { HTMLAttributes: { class: 'border-l-2 border-zinc-300 dark:border-zinc-600 pl-3 italic text-zinc-600 dark:text-zinc-300' } },
      }),
      Underline,
      // Image node — required so the <img> tags inserted by paste/drop
      // render as actual images instead of literal text.
      Image.configure({
        inline: false,
        allowBase64: false,
        HTMLAttributes: { class: 'rounded-lg max-w-full h-auto my-2 border border-zinc-200 dark:border-zinc-700' },
      }),
      // Link — auto-detects URLs as the user types/pastes (autolink) and
      // makes both fresh URLs AND ones already saved in description_html
      // render as clickable anchors. We force target="_blank" + the
      // proper rel attrs so they always open in a new tab without the
      // referrer leak. linkOnPaste lets the user paste a URL while text
      // is selected to wrap that selection in a link, the standard editor
      // affordance.
      Link.configure({
        openOnClick: true,
        autolink: true,
        linkOnPaste: true,
        HTMLAttributes: {
          target: '_blank',
          rel: 'noopener noreferrer nofollow',
          class: 'text-indigo-600 dark:text-indigo-400 underline underline-offset-2 hover:text-indigo-700 dark:hover:text-indigo-300 break-all',
        },
        protocols: ['http', 'https', 'mailto', 'tel'],
        validate: (href) => /^(https?:\/\/|mailto:|tel:)/i.test(href),
      }),
      TaskList.configure({ HTMLAttributes: { class: 'list-none pl-0 space-y-0.5' } }),
      TaskItem.configure({ nested: true, HTMLAttributes: { class: 'flex gap-2 items-start' } }),
      Placeholder.configure({ placeholder: placeholder || 'Empezá a escribir, o pegá una imagen…' }),
    ],
    content: linkifyHtml(html || ''),
    editorProps: {
      attributes: {
        class: 'prose-sm max-w-none outline-none px-1 py-2 -mx-1 text-[15px] leading-[1.65] text-zinc-800 dark:text-zinc-200 min-h-[80px]',
      },
      handleKeyDown: (_, event) => {
        // Cmd/Ctrl+Enter — explicit "I'm done" gesture. Triggers onCommit so
        // the user gets feedback that the description was persisted, instead
        // of having to click Save in the footer (which they may not even
        // realize applies to the description block too).
        if (event.key === 'Enter' && (event.metaKey || event.ctrlKey)) {
          event.preventDefault();
          if (onCommit && editor) {
            onCommit({ html: editor.getHTML(), text: editor.getText() });
          }
          return true;
        }
        return false;
      },
      handlePaste: (_, event) => {
        // Image-from-clipboard path. Defers to onUploadImage and inserts an
        // Image NODE (via setImage) at the caret on success. Using
        // setImage instead of inserting raw HTML avoids edge cases where
        // an unwrapped <img> tag wouldn't survive a DB round-trip + reload.
        const items = event.clipboardData?.items;
        if (!items || !onUploadImage) return false;
        for (const item of items) {
          if (item.kind === 'file' && item.type.startsWith('image/')) {
            const file = item.getAsFile();
            if (file) {
              onUploadImage(file).then(url => {
                if (url && editor) editor.chain().focus().setImage({ src: url }).run();
              });
              return true;
            }
          }
        }
        return false;
      },
      handleDrop: (_, event) => {
        const files = (event as DragEvent).dataTransfer?.files;
        if (!files || files.length === 0 || !onUploadImage) return false;
        const imageFiles = Array.from(files).filter(f => f.type.startsWith('image/'));
        if (imageFiles.length === 0) return false;
        event.preventDefault();
        Promise.all(imageFiles.map(f => onUploadImage(f))).then(urls => {
          urls.filter(Boolean).forEach(u => {
            editor?.chain().focus().setImage({ src: u as string }).run();
          });
        });
        return true;
      },
    },
    onUpdate: ({ editor }) => {
      const nextHtml = editor.getHTML();
      lastSetRef.current = nextHtml;
      onChange({ html: nextHtml, text: editor.getText() });
    },
  }, [/* recreate per task by remounting parent with key */]);

  // When the parent swaps to a different task OR the editor was just
  // created, replace the editor content. We compare against lastSetRef
  // so user typing doesn't loop back into setContent — but on the FIRST
  // editor-ready cycle we always force-set, because TipTap's `content:`
  // prop on useEditor is sometimes ignored when the React component
  // re-mounts with the same key (which happens when the panel reopens
  // the same task).
  const firstSyncRef = useRef(true);
  useEffect(() => {
    if (!editor) return;
    if (firstSyncRef.current) {
      firstSyncRef.current = false;
      lastSetRef.current = html;
      editor.commands.setContent(linkifyHtml(html || ''), false);
      return;
    }
    if (html === lastSetRef.current) return;
    lastSetRef.current = html;
    editor.commands.setContent(html || '', false);
  }, [html, editor]);

  if (!editor) return null;

  // Tiny floating toolbar shown when text is selected.
  const isActive = (name: string, attrs?: Record<string, any>) => !!editor.isActive(name, attrs as any);
  const btn = (label: React.ReactNode, action: () => void, active: boolean, title: string) => (
    <button
      type="button"
      onMouseDown={(e) => { e.preventDefault(); action(); }}
      title={title}
      className={`px-1.5 py-1 rounded text-[11px] font-medium transition-colors ${
        active
          ? 'bg-zinc-200 dark:bg-zinc-700 text-zinc-900 dark:text-zinc-100'
          : 'text-zinc-500 dark:text-zinc-400 hover:bg-zinc-100 dark:hover:bg-zinc-800 hover:text-zinc-900 dark:hover:text-zinc-100'
      }`}
    >{label}</button>
  );

  return (
    <div
      className="relative"
      onBlur={(e) => {
        // Auto-commit when the editor loses focus — but only if the focus
        // isn't moving to one of the toolbar buttons. Without this, every
        // bold/italic click would fire a save.
        if (!onCommit) return;
        const next = e.relatedTarget as HTMLElement | null;
        if (next && (e.currentTarget as HTMLElement).contains(next)) return;
        onCommit({ html: editor.getHTML(), text: editor.getText() });
      }}
    >
      {/* Toolbar row — formatting on the left, save indicator on the right.
          Same micro-toolbar as before, just paired with a tiny status hint
          so the user knows when the editor wrote back to the DB. */}
      <div className="flex items-center justify-between mb-1.5">
        <div className="flex items-center gap-0.5 opacity-60 hover:opacity-100 transition-opacity">
          {btn('B', () => editor.chain().focus().toggleBold().run(), isActive('bold'), 'Bold (⌘B)')}
          {btn(<span className="italic">i</span>, () => editor.chain().focus().toggleItalic().run(), isActive('italic'), 'Italic (⌘I)')}
          {btn(<span className="underline">U</span>, () => editor.chain().focus().toggleUnderline().run(), isActive('underline'), 'Underline (⌘U)')}
          <span className="w-px h-3.5 bg-zinc-200 dark:bg-zinc-700 mx-1" />
          {btn('H1', () => editor.chain().focus().toggleHeading({ level: 1 }).run(), isActive('heading', { level: 1 }), 'Heading 1')}
          {btn('H2', () => editor.chain().focus().toggleHeading({ level: 2 }).run(), isActive('heading', { level: 2 }), 'Heading 2')}
          <span className="w-px h-3.5 bg-zinc-200 dark:bg-zinc-700 mx-1" />
          {btn(<Icons.List size={11} />, () => editor.chain().focus().toggleBulletList().run(), isActive('bulletList'), 'Bulleted list')}
          {btn(<Icons.Hash size={11} />, () => editor.chain().focus().toggleOrderedList().run(), isActive('orderedList'), 'Numbered list')}
          {btn(<Icons.SquareCheck size={11} />, () => editor.chain().focus().toggleTaskList().run(), isActive('taskList'), 'Checklist')}
          <span className="w-px h-3.5 bg-zinc-200 dark:bg-zinc-700 mx-1" />
          {btn(<Icons.Quote size={11} />, () => editor.chain().focus().toggleBlockquote().run(), isActive('blockquote'), 'Quote')}
          {btn(<Icons.Code size={11} />, () => editor.chain().focus().toggleCodeBlock().run(), isActive('codeBlock'), 'Code block')}
        </div>
        {saveHint && (
          <span className="text-[10px] text-zinc-400 dark:text-zinc-500 flex items-center gap-1 select-none">
            {saveHint === 'Saving…' && <span className="w-1.5 h-1.5 rounded-full bg-amber-400 animate-pulse" />}
            {saveHint.startsWith('Saved') && <Icons.Check size={10} className="text-emerald-500" />}
            {saveHint}
          </span>
        )}
      </div>
      <EditorContent editor={editor} />
    </div>
  );
};
