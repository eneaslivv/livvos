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
import { Icons } from '../ui/Icons';

interface Props {
  html: string;
  onChange: (next: { html: string; text: string }) => void;
  placeholder?: string;
  /** Called whenever an image is pasted/dropped — return its hosted URL. */
  onUploadImage?: (file: File) => Promise<string | null>;
}

export const TaskRichEditor: React.FC<Props> = ({ html, onChange, placeholder, onUploadImage }) => {
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
      TaskList.configure({ HTMLAttributes: { class: 'list-none pl-0 space-y-0.5' } }),
      TaskItem.configure({ nested: true, HTMLAttributes: { class: 'flex gap-2 items-start' } }),
      Placeholder.configure({ placeholder: placeholder || 'Empezá a escribir, o pegá una imagen…' }),
    ],
    content: html || '',
    editorProps: {
      attributes: {
        class: 'prose-sm max-w-none outline-none px-1 py-2 -mx-1 text-[15px] leading-[1.65] text-zinc-800 dark:text-zinc-200 min-h-[80px]',
      },
      handlePaste: (_, event) => {
        // Image-from-clipboard path. Defers to onUploadImage and inserts an
        // <img> at the caret on success. Returning true tells TipTap we
        // handled it (so the binary blob doesn't get pasted as garbage).
        const items = event.clipboardData?.items;
        if (!items || !onUploadImage) return false;
        for (const item of items) {
          if (item.kind === 'file' && item.type.startsWith('image/')) {
            const file = item.getAsFile();
            if (file) {
              onUploadImage(file).then(url => {
                if (url && editor) editor.chain().focus().insertContent(`<img src="${url}" alt="" />`).run();
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
            editor?.chain().focus().insertContent(`<img src="${u}" alt="" />`).run();
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

  // When the parent swaps to a different task, replace the editor content.
  // We compare to lastSetRef so editor edits don't loop back into setContent.
  useEffect(() => {
    if (!editor) return;
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
    <div className="relative">
      {/* Persistent micro-toolbar above the editor — keeps Notion-vibe but
          gives a discoverable formatting surface. */}
      <div className="flex items-center gap-0.5 mb-1.5 opacity-60 hover:opacity-100 transition-opacity">
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
      <EditorContent editor={editor} />
    </div>
  );
};
