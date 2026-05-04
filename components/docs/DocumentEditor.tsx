import React, { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import { createPortal } from 'react-dom';
import { useEditor, EditorContent } from '@tiptap/react';
import StarterKit from '@tiptap/starter-kit';
import TaskList from '@tiptap/extension-task-list';
import TaskItem from '@tiptap/extension-task-item';
import Placeholder from '@tiptap/extension-placeholder';
import Underline from '@tiptap/extension-underline';
import Table from '@tiptap/extension-table';
import TableRow from '@tiptap/extension-table-row';
import { TableCellCheckbox } from './extensions/TableCellCheckbox';
import TableHeader from '@tiptap/extension-table-header';
import Image from '@tiptap/extension-image';
import { Icons } from '../ui/Icons';
import { DocumentToolbar } from './DocumentToolbar';
import { SlashCommand, type SlashState } from './extensions/SlashCommand';
import { SlashCommandMenu, type SlashItem, type SlashCommandMenuHandle } from './SlashCommandMenu';
import { TaskCreatePopover } from './TaskCreatePopover';
import { supabase } from '../../lib/supabase';
import { useDocuments } from '../../context/DocumentsContext';
import { useTenant } from '../../context/TenantContext';
import { useClients } from '../../context/ClientsContext';
import { useProjects } from '../../context/ProjectsContext';
import { useCalendar } from '../../context/CalendarContext';
import { useTeam } from '../../context/TeamContext';
import { useAuth } from '../../hooks/useAuth';
import type { Document } from '../../types/documents';

interface DocumentEditorProps {
  documentId: string;
  onClose: () => void;
}

// Helper: extract all text from a TipTap node recursively
const extractNodeText = (node: any): string => {
  if (node.text) return node.text;
  if (!node.content) return '';
  return node.content.map(extractNodeText).join('').trim();
};

// Extract task item text from Tiptap JSON content (checklists)
interface DocTaskItem { text: string; checked: boolean }
const extractTaskItems = (content: Record<string, any>): DocTaskItem[] => {
  const items: DocTaskItem[] = [];
  const walk = (node: any) => {
    if (node.type === 'taskItem') {
      const text = (node.content || [])
        .filter((c: any) => c.type === 'paragraph')
        .flatMap((p: any) => (p.content || []).map((t: any) => t.text || ''))
        .join('')
        .trim();
      if (text) items.push({ text, checked: !!node.attrs?.checked });
    }
    if (node.content) node.content.forEach(walk);
  };
  walk(content);
  return items;
};

// Extract tasks from table rows that have a checkbox cell
const extractTableTasks = (content: Record<string, any>): DocTaskItem[] => {
  const items: DocTaskItem[] = [];
  const walk = (node: any) => {
    if (node.type === 'table') {
      const rows = node.content || [];
      for (const row of rows) {
        const cells = row.content || [];
        // Skip header rows (all tableHeader cells)
        if (cells.every((c: any) => c.type === 'tableHeader')) continue;
        // Find the cell with a checked attribute
        const checkboxCell = cells.find((c: any) => c.attrs?.checked !== null && c.attrs?.checked !== undefined);
        if (!checkboxCell) continue;
        // Find the best title: first non-numeric, non-checkbox cell with text
        const checkboxIdx = cells.indexOf(checkboxCell);
        let titleText = '';
        for (let i = 0; i < cells.length; i++) {
          if (i === checkboxIdx) continue;
          const text = extractNodeText(cells[i]);
          // Skip cells that are just numbers (like the # column)
          if (text && !/^\d+(\.\d+)?$/.test(text)) {
            titleText = text;
            break;
          }
        }
        if (titleText) {
          items.push({ text: titleText, checked: !!checkboxCell.attrs.checked });
        }
      }
    }
    if (node.content) node.content.forEach(walk);
  };
  walk(content);
  return items;
};

// Tabs (sub-pages) stored inside document.content
interface DocTab { id: string; title: string; content: Record<string, any> }

const EMPTY_DOC = { type: 'doc', content: [{ type: 'paragraph' }] };

const parseTabs = (content: Record<string, any> | null | undefined): DocTab[] => {
  if (content && Array.isArray((content as any).tabs) && (content as any).tabs.length > 0) {
    return (content as any).tabs as DocTab[];
  }
  // Legacy single-doc → wrap as one tab
  if (content && Object.keys(content).length > 0 && (content as any).type) {
    return [{ id: 'tab-1', title: 'Page 1', content: content as Record<string, any> }];
  }
  return [{ id: 'tab-1', title: 'Page 1', content: EMPTY_DOC }];
};

export const DocumentEditor: React.FC<DocumentEditorProps> = ({ documentId, onClose }) => {
  const { documents, updateDocument, deleteDocument } = useDocuments();
  const { currentTenant } = useTenant();
  const { clients } = useClients();
  const { projects } = useProjects();
  const { tasks, createTask, updateTask } = useCalendar();
  const { members } = useTeam();
  const { user } = useAuth();

  const doc = documents.find(d => d.id === documentId);
  const [title, setTitle] = useState(doc?.title || 'Untitled Document');
  const [clientId, setClientId] = useState(doc?.client_id || '');
  const [projectId, setProjectId] = useState(doc?.project_id || '');
  const [shareEnabled, setShareEnabled] = useState(doc?.share_enabled || false);
  const [copied, setCopied] = useState(false);
  const [saving, setSaving] = useState(false);
  const [showSidebar, setShowSidebar] = useState(false);
  const [showPagesSidebar, setShowPagesSidebar] = useState(true);
  const [deleting, setDeleting] = useState(false);
  const [syncing, setSyncing] = useState(false);
  const [tabs, setTabs] = useState<DocTab[]>(() => parseTabs(doc?.content));
  const [activeTabId, setActiveTabId] = useState<string>(() => parseTabs(doc?.content)[0].id);
  const [renamingTabId, setRenamingTabId] = useState<string | null>(null);
  const saveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const initializedRef = useRef(false);
  const isSyncingBackRef = useRef(false);
  const tabsRef = useRef<DocTab[]>(tabs);
  const activeTabIdRef = useRef<string>(activeTabId);
  tabsRef.current = tabs;
  activeTabIdRef.current = activeTabId;
  const activeTab = tabs.find(t => t.id === activeTabId) || tabs[0];

  // Slash command menu state
  const [slashState, setSlashState] = useState<SlashState>({ active: false, query: '', range: null, coords: null });
  const slashMenuRef = useRef<SlashCommandMenuHandle>(null);
  const [taskPopover, setTaskPopover] = useState<null | { coords: { left: number; top: number; bottom: number }; range: { from: number; to: number } }>(null);

  // Tasks linked to this document
  const linkedTasks = useMemo(() => tasks.filter((t: any) => t.document_id === documentId), [tasks, documentId]);

  // Upload an image file to Supabase Storage and return its public URL.
  // Uses tenant-assets (the 'documents' bucket lacks INSERT policies, so
  // uploads were silently failing and the editor showed the raw <img> tag
  // instead of the image). Path is tenant-scoped so two tenants can have
  // documents with the same id without collisions.
  const uploadImage = useCallback(async (file: File): Promise<string | null> => {
    const tenantId = currentTenant?.id || 'shared';
    const ext = file.name.split('.').pop() || 'png';
    const path = `doc-images/${tenantId}/${documentId}/${Date.now()}.${ext}`;
    const { error } = await supabase.storage.from('tenant-assets').upload(path, file, { upsert: true, contentType: file.type });
    if (error) {
      console.error('[DocumentEditor] Image upload failed:', error);
      return null;
    }
    const { data: urlData } = supabase.storage.from('tenant-assets').getPublicUrl(path);
    return urlData.publicUrl;
  }, [documentId, currentTenant?.id]);

  const editor = useEditor({
    extensions: [
      StarterKit.configure({
        heading: { levels: [1, 2, 3] },
      }),
      TaskList,
      TaskItem.configure({ nested: true }),
      Placeholder.configure({ placeholder: 'Empezá a escribir, o tipeá / para comandos...' }),
      Underline,
      Table.configure({ resizable: true }),
      TableRow,
      TableCellCheckbox,
      TableHeader,
      Image.configure({ inline: false, allowBase64: true }),
      SlashCommand.configure({
        onStateChange: (state) => setSlashState(state),
        onKeyDown: (event) => slashMenuRef.current?.onKeyDown(event) ?? false,
      }),
    ],
    content: activeTab?.content || EMPTY_DOC,
    editorProps: {
      attributes: {
        class: 'prose prose-zinc dark:prose-invert max-w-none outline-none min-h-[300px] px-8 py-6',
      },
      handlePaste: (view, event) => {
        const items = event.clipboardData?.items;
        if (!items) return false;
        // Only intercept if clipboard has a real image file (not HTML with tables/text)
        const hasHTML = event.clipboardData?.types.includes('text/html');
        for (const item of Array.from(items)) {
          if (item.type.startsWith('image/') && item.kind === 'file' && !hasHTML) {
            event.preventDefault();
            const file = item.getAsFile();
            if (file) uploadImage(file).then(url => {
              if (url) view.dispatch(view.state.tr.replaceSelectionWith(
                view.state.schema.nodes.image.create({ src: url })
              ));
            });
            return true;
          }
        }
        // Let Tiptap handle HTML paste (tables, formatted text, etc.)
        return false;
      },
      handleDrop: (view, event) => {
        const files = event.dataTransfer?.files;
        if (!files?.length) return false;
        const file = files[0];
        if (file.type.startsWith('image/')) {
          event.preventDefault();
          const pos = view.posAtCoords({ left: event.clientX, top: event.clientY });
          uploadImage(file).then(url => {
            if (url && pos) {
              const node = view.state.schema.nodes.image.create({ src: url });
              const tr = view.state.tr.insert(pos.pos, node);
              view.dispatch(tr);
            }
          });
          return true;
        }
        return false;
      },
    },
    onUpdate: ({ editor: e }) => {
      if (!initializedRef.current || isSyncingBackRef.current) return;
      const json = e.getJSON();
      const nextTabs = tabsRef.current.map(t =>
        t.id === activeTabIdRef.current ? { ...t, content: json } : t
      );
      tabsRef.current = nextTabs;
      setTabs(nextTabs);
      debouncedSave();
    },
  });

  useEffect(() => {
    // Mark as initialized after first render so we don't trigger save on content load
    const timer = setTimeout(() => { initializedRef.current = true; }, 500);
    return () => clearTimeout(timer);
  }, []);

  // Slash command items
  const slashItems = useMemo<SlashItem[]>(() => [
    {
      id: 'task',
      label: 'Tarea con fecha',
      hint: 'Crea una tarea en este doc y la pone en el calendario',
      icon: 'SquareCheck',
      keywords: ['tarea', 'task', 'todo', 'fecha', 'date', 'calendario'],
      run: (ed, range) => {
        if (!slashState.coords) return false;
        const coords = slashState.coords;
        ed.chain().focus().deleteRange(range).run();
        setTaskPopover({ coords, range: { from: range.from, to: range.from } });
        return false;
      },
    },
    {
      id: 'h1',
      label: 'Título 1',
      hint: 'Encabezado grande',
      icon: 'Hash',
      keywords: ['h1', 'heading', 'titulo', 'header'],
      run: (ed, range) => { ed.chain().focus().deleteRange(range).setNode('heading', { level: 1 }).run(); },
    },
    {
      id: 'h2',
      label: 'Título 2',
      hint: 'Encabezado mediano',
      icon: 'Hash',
      keywords: ['h2', 'heading', 'titulo', 'header'],
      run: (ed, range) => { ed.chain().focus().deleteRange(range).setNode('heading', { level: 2 }).run(); },
    },
    {
      id: 'h3',
      label: 'Título 3',
      hint: 'Encabezado chico',
      icon: 'Hash',
      keywords: ['h3', 'heading', 'titulo', 'header'],
      run: (ed, range) => { ed.chain().focus().deleteRange(range).setNode('heading', { level: 3 }).run(); },
    },
    {
      id: 'checklist',
      label: 'Checklist',
      hint: 'Lista de tareas con checkboxes',
      icon: 'ListChecks',
      keywords: ['checklist', 'todo', 'task list', 'tareas'],
      run: (ed, range) => { ed.chain().focus().deleteRange(range).toggleTaskList().run(); },
    },
    {
      id: 'bullet',
      label: 'Lista',
      hint: 'Lista con viñetas',
      icon: 'List',
      keywords: ['lista', 'list', 'bullet', 'viñetas'],
      run: (ed, range) => { ed.chain().focus().deleteRange(range).toggleBulletList().run(); },
    },
    {
      id: 'numbered',
      label: 'Lista numerada',
      hint: 'Lista 1. 2. 3.',
      icon: 'ListOrdered',
      keywords: ['numerada', 'numbered', 'ordered'],
      run: (ed, range) => { ed.chain().focus().deleteRange(range).toggleOrderedList().run(); },
    },
    {
      id: 'table',
      label: 'Tabla',
      hint: 'Tabla 3x3 con checkboxes',
      icon: 'Table',
      keywords: ['tabla', 'table', 'grid'],
      run: (ed, range) => {
        ed.chain().focus().deleteRange(range).insertTable({ rows: 3, cols: 3, withHeaderRow: true }).run();
      },
    },
    {
      id: 'quote',
      label: 'Cita',
      hint: 'Bloque destacado',
      icon: 'Quote',
      keywords: ['cita', 'quote', 'blockquote'],
      run: (ed, range) => { ed.chain().focus().deleteRange(range).toggleBlockquote().run(); },
    },
    {
      id: 'code',
      label: 'Código',
      hint: 'Bloque de código',
      icon: 'Code',
      keywords: ['code', 'codigo', 'snippet'],
      run: (ed, range) => { ed.chain().focus().deleteRange(range).toggleCodeBlock().run(); },
    },
    {
      id: 'divider',
      label: 'Separador',
      hint: 'Línea horizontal',
      icon: 'Minus',
      keywords: ['divider', 'separador', 'hr', 'line'],
      run: (ed, range) => { ed.chain().focus().deleteRange(range).setHorizontalRule().run(); },
    },
  ], [slashState.coords]);

  const closeSlash = useCallback(() => {
    setSlashState({ active: false, query: '', range: null, coords: null });
  }, []);

  const handleCreateTaskFromPopover = useCallback(async (data: { title: string; date: string | null }) => {
    if (!editor || !user) return;
    const range = taskPopover?.range;
    setTaskPopover(null);

    // Insert a checklist item with the title in the doc
    if (range) {
      editor.chain()
        .focus()
        .insertContentAt(range.from, {
          type: 'taskList',
          content: [{ type: 'taskItem', attrs: { checked: false }, content: [{ type: 'paragraph', content: [{ type: 'text', text: data.title }] }] }],
        })
        .run();
    }

    // Create the task in the calendar/db, linked to this document
    try {
      await createTask({
        title: data.title,
        completed: false,
        status: 'todo',
        priority: 'medium',
        owner_id: user.id,
        assignee_ids: [],
        order_index: 0,
        document_id: documentId,
        client_id: doc?.client_id || undefined,
        project_id: doc?.project_id || undefined,
        ...(data.date ? { start_date: data.date } : {}),
      } as any);
    } catch (err) {
      if (import.meta.env.DEV) console.error('Failed to create task from doc:', err);
    }
  }, [editor, user, taskPopover, createTask, documentId, doc?.client_id, doc?.project_id]);

  // Bidirectional sync: when a linked task's completion changes externally, update document checkboxes
  useEffect(() => {
    if (!editor || !linkedTasks.length || !initializedRef.current) return;
    const json = editor.getJSON();

    // Build a map of task title → completed from linked tasks
    const taskMap = new Map(linkedTasks.map(t => [t.title, t.completed]));

    let changed = false;

    // Walk and update taskItem nodes (checklists)
    const updateChecklist = (node: any): any => {
      if (node.type === 'taskItem') {
        const text = (node.content || [])
          .filter((c: any) => c.type === 'paragraph')
          .flatMap((p: any) => (p.content || []).map((t: any) => t.text || ''))
          .join('').trim();
        const taskCompleted = taskMap.get(text);
        if (taskCompleted !== undefined && !!node.attrs?.checked !== taskCompleted) {
          changed = true;
          return { ...node, attrs: { ...node.attrs, checked: taskCompleted } };
        }
      }
      if (node.content) {
        const newContent = node.content.map(updateChecklist);
        if (newContent !== node.content) return { ...node, content: newContent };
      }
      return node;
    };

    // Walk and update table cell checkboxes
    const updateTableCells = (node: any): any => {
      if (node.type === 'table') {
        const rows = (node.content || []).map((row: any) => {
          const cells = row.content || [];
          if (cells.every((c: any) => c.type === 'tableHeader')) return row;
          const checkboxCell = cells.find((c: any) => c.attrs?.checked !== null && c.attrs?.checked !== undefined);
          if (!checkboxCell) return row;
          const checkboxIdx = cells.indexOf(checkboxCell);
          let titleText = '';
          for (let i = 0; i < cells.length; i++) {
            if (i === checkboxIdx) continue;
            const text = extractNodeText(cells[i]);
            if (text && !/^\d+(\.\d+)?$/.test(text)) { titleText = text; break; }
          }
          const taskCompleted = taskMap.get(titleText);
          if (taskCompleted !== undefined && !!checkboxCell.attrs.checked !== taskCompleted) {
            changed = true;
            const newCells = cells.map((c: any) =>
              c === checkboxCell ? { ...c, attrs: { ...c.attrs, checked: taskCompleted } } : c
            );
            return { ...row, content: newCells };
          }
          return row;
        });
        return { ...node, content: rows };
      }
      if (node.content) {
        const newContent = node.content.map((child: any) => {
          const updated = updateChecklist(child);
          return updateTableCells(updated);
        });
        return { ...node, content: newContent };
      }
      return node;
    };

    const updatedJson = updateTableCells(json);
    if (changed) {
      isSyncingBackRef.current = true;
      editor.commands.setContent(updatedJson);
      // Mirror the synced state into the active tab and persist
      const nextTabs = tabsRef.current.map(t =>
        t.id === activeTabIdRef.current ? { ...t, content: updatedJson } : t
      );
      tabsRef.current = nextTabs;
      setTabs(nextTabs);
      debouncedSave();
      requestAnimationFrame(() => { isSyncingBackRef.current = false; });
    }
  }, [linkedTasks]);

  const debouncedSave = useCallback(() => {
    if (saveTimerRef.current) clearTimeout(saveTimerRef.current);
    saveTimerRef.current = setTimeout(async () => {
      setSaving(true);
      try {
        const allTabs = tabsRef.current;
        const aggregateText = allTabs
          .map(t => extractNodeText(t.content || {}))
          .join('\n\n');
        await updateDocument(documentId, {
          content: { tabs: allTabs },
          content_text: aggregateText,
        });
      } catch (err) {
        if (import.meta.env.DEV) console.error('Auto-save failed:', err);
      } finally {
        setSaving(false);
      }
    }, 1500);
  }, [documentId, updateDocument]);

  // Swap editor content when active tab changes
  useEffect(() => {
    if (!editor || !activeTab) return;
    const current = editor.getJSON();
    const next = activeTab.content || EMPTY_DOC;
    if (JSON.stringify(current) === JSON.stringify(next)) return;
    isSyncingBackRef.current = true;
    editor.commands.setContent(next);
    requestAnimationFrame(() => { isSyncingBackRef.current = false; });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeTabId, editor]);

  const addTab = () => {
    const newTab: DocTab = {
      id: `tab-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
      title: `Page ${tabs.length + 1}`,
      content: EMPTY_DOC,
    };
    const next = [...tabs, newTab];
    setTabs(next);
    tabsRef.current = next;
    setActiveTabId(newTab.id);
    activeTabIdRef.current = newTab.id;
    debouncedSave();
  };

  const renameTab = (id: string, title: string) => {
    const next = tabs.map(t => t.id === id ? { ...t, title: title || 'Untitled' } : t);
    setTabs(next);
    tabsRef.current = next;
    debouncedSave();
  };

  const deleteTab = (id: string) => {
    if (tabs.length <= 1) return;
    if (!confirm('Delete this page?')) return;
    const next = tabs.filter(t => t.id !== id);
    setTabs(next);
    tabsRef.current = next;
    if (activeTabId === id) {
      setActiveTabId(next[0].id);
      activeTabIdRef.current = next[0].id;
    }
    debouncedSave();
  };

  // Save title on blur
  const handleTitleBlur = async () => {
    if (title !== doc?.title) {
      setSaving(true);
      try {
        await updateDocument(documentId, { title });
      } finally {
        setSaving(false);
      }
    }
  };

  // Save assignment changes
  const handleAssign = async (field: 'client_id' | 'project_id', value: string) => {
    const val = value || null;
    if (field === 'client_id') setClientId(value);
    else setProjectId(value);
    await updateDocument(documentId, { [field]: val });
  };

  // Toggle sharing
  const handleToggleShare = async () => {
    const next = !shareEnabled;
    setShareEnabled(next);
    await updateDocument(documentId, { share_enabled: next });
  };

  const handleCopyLink = () => {
    if (!doc?.share_token) return;
    const url = `${window.location.origin}/#shared-doc/${doc.share_token}`;
    navigator.clipboard.writeText(url);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const handleDelete = async () => {
    if (!confirm('Delete this document?')) return;
    setDeleting(true);
    try {
      await deleteDocument(documentId);
      onClose();
    } catch {
      setDeleting(false);
    }
  };

  // Sync document checklist items + table rows as real tasks
  const handleSyncTasks = async () => {
    if (!editor || !user) return;
    setSyncing(true);
    try {
      // Scan checklist items + table-row checkboxes across all pages
      const docTasks: DocTaskItem[] = tabs.flatMap(t => [
        ...extractTaskItems(t.content || {}),
        ...extractTableTasks(t.content || {}),
      ]);

      for (const item of docTasks) {
        // Check if task already exists (match by title + document_id)
        const existing = linkedTasks.find(t => t.title === item.text);
        if (existing) {
          // Update completion status if changed
          if (existing.completed !== item.checked) {
            await updateTask(existing.id, {
              completed: item.checked,
              status: item.checked ? 'done' : 'todo',
            });
          }
        } else {
          // Create new task linked to this document
          await createTask({
            title: item.text,
            completed: item.checked,
            status: item.checked ? 'done' : 'todo',
            priority: 'medium',
            owner_id: user.id,
            assignee_ids: [],
            order_index: 0,
            document_id: documentId,
            client_id: doc?.client_id || undefined,
            project_id: doc?.project_id || undefined,
          } as any);
        }
      }
    } catch (err) {
      if (import.meta.env.DEV) console.error('Task sync failed:', err);
    } finally {
      setSyncing(false);
    }
  };

  // Assign a team member to a linked task
  const handleAssignTask = async (taskId: string, memberId: string) => {
    const ids = memberId ? [memberId] : [];
    await updateTask(taskId, { assignee_ids: ids, assignee_id: memberId || undefined });
  };

  // Cleanup save timer
  useEffect(() => {
    return () => {
      if (saveTimerRef.current) clearTimeout(saveTimerRef.current);
    };
  }, []);

  if (!doc) return null;

  return createPortal(
    <div className="fixed inset-0 z-50 bg-white dark:bg-zinc-950 flex flex-col">
      <style>{`
        .ProseMirror table { border-collapse: collapse; width: 100%; margin: 1em 0; overflow: hidden; }
        .ProseMirror th, .ProseMirror td { border: 1px solid #e4e4e7; padding: 8px 12px; text-align: left; vertical-align: top; min-width: 80px; position: relative; }
        .dark .ProseMirror th, .dark .ProseMirror td { border-color: #3f3f46; }
        .ProseMirror th { background: #f4f4f5; font-weight: 600; font-size: 0.85em; text-transform: uppercase; letter-spacing: 0.03em; color: #71717a; }
        .dark .ProseMirror th { background: #27272a; color: #a1a1aa; }
        .ProseMirror td { font-size: 0.9em; }
        .ProseMirror .selectedCell { background: #dbeafe; }
        .dark .ProseMirror .selectedCell { background: #1e3a5f; }
        .ProseMirror img { max-width: 100%; height: auto; border-radius: 8px; margin: 1em 0; }
        .ProseMirror .column-resize-handle { position: absolute; right: -2px; top: 0; bottom: 0; width: 4px; background: #3b82f6; pointer-events: none; }
        .ProseMirror.resize-cursor { cursor: col-resize; }
        .ProseMirror td.has-checkbox { padding-left: 32px; }
        .ProseMirror td .cell-checkbox {
          position: absolute; left: 8px; top: 50%; transform: translateY(-50%);
          width: 16px; height: 16px; cursor: pointer; accent-color: #10b981;
          margin: 0; border-radius: 3px;
        }
        .ProseMirror td[data-checked="true"] .cell-content { color: #a1a1aa; text-decoration: line-through; }
        .dark .ProseMirror td[data-checked="true"] .cell-content { color: #52525b; }
      `}</style>
      {/* Top bar */}
      <div className="flex items-center justify-between px-4 py-3 border-b border-zinc-100 dark:border-zinc-800/60 shrink-0">
        <div className="flex items-center gap-3 flex-1 min-w-0">
          <button
            onClick={onClose}
            className="p-1.5 rounded-lg hover:bg-zinc-100 dark:hover:bg-zinc-800 transition-colors text-zinc-400 hover:text-zinc-600 dark:hover:text-zinc-300"
          >
            <Icons.ArrowLeft size={18} />
          </button>
          <button
            onClick={() => setShowPagesSidebar(s => !s)}
            className={`p-1.5 rounded-lg transition-colors ${showPagesSidebar ? 'bg-zinc-100 dark:bg-zinc-800 text-zinc-700 dark:text-zinc-300' : 'text-zinc-400 hover:text-zinc-600 dark:hover:text-zinc-300 hover:bg-zinc-50 dark:hover:bg-zinc-800/50'}`}
            title="Toggle pages panel"
          >
            <Icons.Menu size={16} />
          </button>
          <div className="flex items-center gap-2 flex-1 min-w-0">
            <Icons.Docs size={18} className="text-blue-500 shrink-0" />
            <input
              type="text"
              value={title}
              onChange={e => setTitle(e.target.value)}
              onBlur={handleTitleBlur}
              onKeyDown={e => { if (e.key === 'Enter') e.currentTarget.blur(); }}
              className="text-base font-semibold bg-transparent outline-none text-zinc-900 dark:text-zinc-100 placeholder:text-zinc-300 dark:placeholder:text-zinc-600 flex-1 min-w-0"
              placeholder="Document title..."
            />
          </div>
          <div className="flex items-center gap-2 shrink-0">
            {saving && (
              <span className="text-[10px] text-zinc-400 flex items-center gap-1">
                <div className="w-2 h-2 border border-zinc-300 border-t-zinc-500 rounded-full animate-spin" />
                Saving
              </span>
            )}
            {!saving && initializedRef.current && (
              <span className="text-[10px] text-zinc-300 dark:text-zinc-600">Saved</span>
            )}
            <button
              onClick={() => setShowSidebar(!showSidebar)}
              className={`p-1.5 rounded-lg transition-colors ${showSidebar ? 'bg-zinc-100 dark:bg-zinc-800 text-zinc-700 dark:text-zinc-300' : 'text-zinc-400 hover:text-zinc-600 dark:hover:text-zinc-300 hover:bg-zinc-50 dark:hover:bg-zinc-800/50'}`}
              title="Settings"
            >
              <Icons.Settings size={16} />
            </button>
          </div>
        </div>
      </div>

      {/* Toolbar */}
      <DocumentToolbar editor={editor} onImageUpload={uploadImage} />

      {/* Content area */}
      <div className="flex flex-1 min-h-0 overflow-hidden">
        {/* Pages sidebar (left) */}
        {showPagesSidebar && (
          <div className="w-56 border-r border-zinc-100 dark:border-zinc-800/60 bg-zinc-50/50 dark:bg-zinc-900/50 overflow-y-auto shrink-0 flex flex-col">
            <div className="px-3 py-2.5 flex items-center justify-between border-b border-zinc-100 dark:border-zinc-800/60">
              <span className="text-[10px] font-medium text-zinc-400 uppercase tracking-wider">Pages</span>
              <button
                onClick={addTab}
                className="p-1 rounded hover:bg-zinc-100 dark:hover:bg-zinc-800 text-zinc-400 hover:text-zinc-600 dark:hover:text-zinc-300 transition-colors"
                title="Add page"
              >
                <Icons.Plus size={13} />
              </button>
            </div>
            <div className="flex-1 overflow-y-auto p-1.5 space-y-0.5">
              {tabs.map(t => {
                const isActive = t.id === activeTabId;
                const isRenaming = renamingTabId === t.id;
                return (
                  <div
                    key={t.id}
                    className={`group flex items-center gap-1.5 px-2 py-1.5 rounded-md cursor-pointer transition-colors ${
                      isActive
                        ? 'bg-white dark:bg-zinc-800 text-zinc-900 dark:text-zinc-100 shadow-sm'
                        : 'text-zinc-500 dark:text-zinc-400 hover:bg-white/60 dark:hover:bg-zinc-800/50'
                    }`}
                    onClick={() => { if (!isRenaming) setActiveTabId(t.id); }}
                  >
                    <Icons.Docs size={13} className={isActive ? 'text-blue-500' : 'text-zinc-400'} />
                    {isRenaming ? (
                      <input
                        autoFocus
                        defaultValue={t.title}
                        onClick={e => e.stopPropagation()}
                        onBlur={e => { renameTab(t.id, e.target.value.trim()); setRenamingTabId(null); }}
                        onKeyDown={e => {
                          if (e.key === 'Enter') { renameTab(t.id, (e.target as HTMLInputElement).value.trim()); setRenamingTabId(null); }
                          else if (e.key === 'Escape') setRenamingTabId(null);
                        }}
                        className="flex-1 min-w-0 bg-transparent outline-none text-xs text-zinc-900 dark:text-zinc-100 border-b border-blue-400"
                      />
                    ) : (
                      <span
                        className="flex-1 min-w-0 truncate text-xs"
                        onDoubleClick={e => { e.stopPropagation(); setRenamingTabId(t.id); }}
                      >
                        {t.title}
                      </span>
                    )}
                    {!isRenaming && (
                      <div className="flex items-center gap-0.5 opacity-0 group-hover:opacity-100 transition-opacity">
                        <button
                          onClick={e => { e.stopPropagation(); setRenamingTabId(t.id); }}
                          className="p-0.5 rounded text-zinc-400 hover:text-zinc-600 dark:hover:text-zinc-300"
                          title="Rename"
                        >
                          <Icons.Edit size={11} />
                        </button>
                        {tabs.length > 1 && (
                          <button
                            onClick={e => { e.stopPropagation(); deleteTab(t.id); }}
                            className="p-0.5 rounded text-zinc-400 hover:text-red-500"
                            title="Delete page"
                          >
                            <Icons.Trash size={11} />
                          </button>
                        )}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {/* Editor */}
        <div className="flex-1 overflow-y-auto">
          <div className="max-w-3xl mx-auto py-8">
            <EditorContent editor={editor} />
          </div>
        </div>

        {/* Slash command menu */}
        {slashState.active && slashState.coords && slashState.range && !taskPopover && (
          <SlashCommandMenu
            ref={slashMenuRef}
            editor={editor}
            query={slashState.query}
            range={slashState.range}
            coords={slashState.coords}
            items={slashItems}
            onClose={closeSlash}
          />
        )}

        {/* Inline task creator (triggered from /tarea) */}
        {taskPopover && (
          <TaskCreatePopover
            coords={taskPopover.coords}
            onSubmit={handleCreateTaskFromPopover}
            onCancel={() => setTaskPopover(null)}
          />
        )}

        {/* Sidebar */}
        {showSidebar && (
          <div className="w-72 border-l border-zinc-100 dark:border-zinc-800/60 bg-zinc-50/50 dark:bg-zinc-900/50 overflow-y-auto shrink-0">
            <div className="p-5 space-y-5">
              {/* Status */}
              <div>
                <label className="block text-[10px] font-medium text-zinc-400 uppercase tracking-wider mb-2">Status</label>
                <div className="flex gap-1.5">
                  {(['draft', 'published'] as const).map(s => (
                    <button
                      key={s}
                      onClick={() => updateDocument(documentId, { status: s })}
                      className={`px-3 py-1.5 rounded-full text-xs font-medium border transition-colors ${
                        doc.status === s
                          ? s === 'published'
                            ? 'bg-emerald-50 dark:bg-emerald-500/10 border-emerald-300 dark:border-emerald-500/30 text-emerald-700 dark:text-emerald-400'
                            : 'bg-zinc-100 dark:bg-zinc-800 border-zinc-300 dark:border-zinc-600 text-zinc-700 dark:text-zinc-300'
                          : 'border-transparent text-zinc-400 hover:bg-zinc-100 dark:hover:bg-zinc-800'
                      }`}
                    >
                      {s.charAt(0).toUpperCase() + s.slice(1)}
                    </button>
                  ))}
                </div>
              </div>

              {/* Assign to Project */}
              <div>
                <label className="block text-[10px] font-medium text-zinc-400 uppercase tracking-wider mb-1.5">Project</label>
                <select
                  value={projectId}
                  onChange={e => handleAssign('project_id', e.target.value)}
                  className="w-full px-3 py-2 bg-white dark:bg-zinc-800/50 border border-zinc-200 dark:border-zinc-700 rounded-lg text-sm text-zinc-900 dark:text-zinc-100 outline-none focus:border-zinc-400"
                >
                  <option value="">None</option>
                  {projects.map(p => <option key={p.id} value={p.id}>{p.title}</option>)}
                </select>
              </div>

              {/* Assign to Client */}
              <div>
                <label className="block text-[10px] font-medium text-zinc-400 uppercase tracking-wider mb-1.5">Client</label>
                <select
                  value={clientId}
                  onChange={e => handleAssign('client_id', e.target.value)}
                  className="w-full px-3 py-2 bg-white dark:bg-zinc-800/50 border border-zinc-200 dark:border-zinc-700 rounded-lg text-sm text-zinc-900 dark:text-zinc-100 outline-none focus:border-zinc-400"
                >
                  <option value="">None</option>
                  {clients.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
                </select>
              </div>

              {/* Sharing */}
              <div>
                <label className="block text-[10px] font-medium text-zinc-400 uppercase tracking-wider mb-2">Sharing</label>
                <button
                  onClick={handleToggleShare}
                  className={`flex items-center gap-2 w-full px-3 py-2 rounded-lg border text-xs font-medium transition-colors ${
                    shareEnabled
                      ? 'bg-blue-50 dark:bg-blue-500/10 border-blue-200 dark:border-blue-500/30 text-blue-700 dark:text-blue-400'
                      : 'bg-white dark:bg-zinc-800/50 border-zinc-200 dark:border-zinc-700 text-zinc-500 hover:border-zinc-300'
                  }`}
                >
                  {shareEnabled ? <Icons.Globe size={14} /> : <Icons.Lock size={14} />}
                  {shareEnabled ? 'Public link enabled' : 'Private'}
                </button>
                {shareEnabled && doc.share_token && (
                  <button
                    onClick={handleCopyLink}
                    className="mt-2 flex items-center gap-2 w-full px-3 py-2 rounded-lg bg-white dark:bg-zinc-800/50 border border-zinc-200 dark:border-zinc-700 text-xs text-zinc-600 dark:text-zinc-400 hover:border-zinc-300 transition-colors"
                  >
                    {copied ? <Icons.Check size={13} className="text-emerald-500" /> : <Icons.Copy size={13} />}
                    {copied ? 'Copied!' : 'Copy share link'}
                  </button>
                )}
              </div>

              {/* Tasks sync */}
              <div>
                <label className="block text-[10px] font-medium text-zinc-400 uppercase tracking-wider mb-2">Tasks</label>
                <button
                  onClick={handleSyncTasks}
                  disabled={syncing}
                  className="flex items-center gap-2 w-full px-3 py-2 rounded-lg border border-zinc-200 dark:border-zinc-700 bg-white dark:bg-zinc-800/50 text-xs font-medium text-zinc-600 dark:text-zinc-400 hover:border-zinc-300 transition-colors"
                >
                  {syncing ? (
                    <>
                      <div className="w-3 h-3 border border-zinc-300 border-t-zinc-500 rounded-full animate-spin" />
                      Syncing...
                    </>
                  ) : (
                    <>
                      <Icons.RefreshCw size={13} />
                      Sync to tasks
                    </>
                  )}
                </button>
                {linkedTasks.length > 0 && (
                  <div className="mt-2 space-y-1.5">
                    {linkedTasks.map(t => (
                      <div key={t.id} className="flex items-start gap-2 px-2 py-1.5 rounded-lg bg-white dark:bg-zinc-800/30 border border-zinc-100 dark:border-zinc-800">
                        <div className="mt-0.5">
                          {t.completed
                            ? <Icons.Check size={13} className="text-emerald-500" />
                            : <Icons.Circle size={13} className="text-zinc-300" />
                          }
                        </div>
                        <div className="flex-1 min-w-0">
                          <p className={`text-[11px] leading-tight truncate ${t.completed ? 'line-through text-zinc-400' : 'text-zinc-700 dark:text-zinc-300'}`}>
                            {t.title}
                          </p>
                          <select
                            value={t.assignee_ids?.[0] || ''}
                            onChange={e => handleAssignTask(t.id, e.target.value)}
                            className="mt-1 w-full text-[10px] px-1.5 py-0.5 bg-zinc-50 dark:bg-zinc-800 border border-zinc-100 dark:border-zinc-700 rounded text-zinc-500 dark:text-zinc-400 outline-none"
                          >
                            <option value="">Unassigned</option>
                            {members.filter(m => m.status === 'active').map(m => (
                              <option key={m.id} value={m.id}>{m.name || m.email}</option>
                            ))}
                          </select>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              {/* Delete */}
              <div className="pt-3 border-t border-zinc-200 dark:border-zinc-800">
                <button
                  onClick={handleDelete}
                  disabled={deleting}
                  className="flex items-center gap-2 text-xs text-zinc-400 hover:text-red-500 transition-colors"
                >
                  <Icons.Trash size={13} />
                  {deleting ? 'Deleting...' : 'Delete document'}
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>,
    document.body
  );
};
