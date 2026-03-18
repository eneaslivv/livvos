import React, { useRef } from 'react';
import { Editor } from '@tiptap/react';
import { Icons } from '../ui/Icons';

interface DocumentToolbarProps {
  editor: Editor | null;
  onImageUpload?: (file: File) => Promise<string | null>;
}

interface ToolbarButton {
  icon: React.ReactNode;
  action: () => void;
  isActive: boolean;
  title: string;
}

export const DocumentToolbar: React.FC<DocumentToolbarProps> = ({ editor, onImageUpload }) => {
  const fileInputRef = useRef<HTMLInputElement>(null);

  if (!editor) return null;

  const handleImagePick = () => {
    fileInputRef.current?.click();
  };

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (onImageUpload) {
      const url = await onImageUpload(file);
      if (url) editor.chain().focus().setImage({ src: url }).run();
    } else {
      // Fallback: URL prompt
      const url = prompt('Image URL:');
      if (url) editor.chain().focus().setImage({ src: url }).run();
    }
    // Reset so same file can be re-selected
    e.target.value = '';
  };

  const groups: ToolbarButton[][] = [
    // Text formatting
    [
      { icon: <Icons.Bold size={15} />, action: () => editor.chain().focus().toggleBold().run(), isActive: editor.isActive('bold'), title: 'Bold' },
      { icon: <Icons.Italic size={15} />, action: () => editor.chain().focus().toggleItalic().run(), isActive: editor.isActive('italic'), title: 'Italic' },
      { icon: <Icons.Underline size={15} />, action: () => editor.chain().focus().toggleUnderline().run(), isActive: editor.isActive('underline'), title: 'Underline' },
      { icon: <Icons.Strikethrough size={15} />, action: () => editor.chain().focus().toggleStrike().run(), isActive: editor.isActive('strike'), title: 'Strikethrough' },
    ],
    // Headings
    [
      { icon: <span className="text-xs font-bold">H1</span>, action: () => editor.chain().focus().toggleHeading({ level: 1 }).run(), isActive: editor.isActive('heading', { level: 1 }), title: 'Heading 1' },
      { icon: <span className="text-xs font-bold">H2</span>, action: () => editor.chain().focus().toggleHeading({ level: 2 }).run(), isActive: editor.isActive('heading', { level: 2 }), title: 'Heading 2' },
      { icon: <span className="text-xs font-bold">H3</span>, action: () => editor.chain().focus().toggleHeading({ level: 3 }).run(), isActive: editor.isActive('heading', { level: 3 }), title: 'Heading 3' },
    ],
    // Lists
    [
      { icon: <Icons.List size={15} />, action: () => editor.chain().focus().toggleBulletList().run(), isActive: editor.isActive('bulletList'), title: 'Bullet List' },
      { icon: <Icons.ListOrdered size={15} />, action: () => editor.chain().focus().toggleOrderedList().run(), isActive: editor.isActive('orderedList'), title: 'Ordered List' },
      { icon: <Icons.ListChecks size={15} />, action: () => editor.chain().focus().toggleTaskList().run(), isActive: editor.isActive('taskList'), title: 'Task List' },
    ],
    // Blocks
    [
      { icon: <Icons.Quote size={15} />, action: () => editor.chain().focus().toggleBlockquote().run(), isActive: editor.isActive('blockquote'), title: 'Blockquote' },
      { icon: <Icons.Code size={15} />, action: () => editor.chain().focus().toggleCodeBlock().run(), isActive: editor.isActive('codeBlock'), title: 'Code Block' },
      { icon: <Icons.Minus size={15} />, action: () => editor.chain().focus().setHorizontalRule().run(), isActive: false, title: 'Divider' },
    ],
    // Table & Image
    [
      { icon: <Icons.Table size={15} />, action: () => editor.chain().focus().insertTable({ rows: 3, cols: 3, withHeaderRow: true }).run(), isActive: editor.isActive('table'), title: 'Insert Table' },
      ...(editor.isActive('table') ? [{
        icon: <Icons.SquareCheck size={15} />,
        action: () => {
          const { state } = editor;
          const { $from } = state.selection;
          // Walk up to find tableCell node
          for (let d = $from.depth; d > 0; d--) {
            const node = $from.node(d);
            if (node.type.name === 'tableCell') {
              const pos = $from.before(d);
              const currentChecked = node.attrs.checked;
              const newChecked = currentChecked === null || currentChecked === undefined ? false : null;
              editor.view.dispatch(state.tr.setNodeMarkup(pos, undefined, { ...node.attrs, checked: newChecked }));
              break;
            }
          }
        },
        isActive: (() => {
          const { $from } = editor.state.selection;
          for (let d = $from.depth; d > 0; d--) {
            const node = $from.node(d);
            if (node.type.name === 'tableCell') return node.attrs.checked !== null && node.attrs.checked !== undefined;
          }
          return false;
        })(),
        title: 'Toggle cell checkbox',
      }] : []),
      { icon: <Icons.Image size={15} />, action: handleImagePick, isActive: false, title: 'Insert Image' },
    ],
  ];

  return (
    <div className="flex items-center gap-0.5 px-4 py-2 border-b border-zinc-100 dark:border-zinc-800/60 bg-white dark:bg-zinc-900 shrink-0 flex-wrap">
      <input ref={fileInputRef} type="file" accept="image/*" onChange={handleFileChange} className="hidden" />
      {groups.map((group, gi) => (
        <React.Fragment key={gi}>
          {gi > 0 && <div className="w-px h-5 bg-zinc-200 dark:bg-zinc-700 mx-1.5" />}
          {group.map((btn, bi) => (
            <button
              key={bi}
              type="button"
              onClick={btn.action}
              title={btn.title}
              className={`p-1.5 rounded-md transition-colors ${
                btn.isActive
                  ? 'bg-zinc-100 dark:bg-zinc-800 text-zinc-900 dark:text-zinc-100'
                  : 'text-zinc-400 dark:text-zinc-500 hover:text-zinc-700 dark:hover:text-zinc-300 hover:bg-zinc-50 dark:hover:bg-zinc-800/50'
              }`}
            >
              {btn.icon}
            </button>
          ))}
        </React.Fragment>
      ))}
    </div>
  );
};
