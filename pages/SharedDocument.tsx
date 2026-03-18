import React, { useState, useEffect, useCallback, useRef } from 'react';
import { useEditor, EditorContent } from '@tiptap/react';
import StarterKit from '@tiptap/starter-kit';
import TaskList from '@tiptap/extension-task-list';
import TaskItem from '@tiptap/extension-task-item';
import Underline from '@tiptap/extension-underline';
import Table from '@tiptap/extension-table';
import TableRow from '@tiptap/extension-table-row';
import TableCell from '@tiptap/extension-table-cell';
import TableHeader from '@tiptap/extension-table-header';
import Image from '@tiptap/extension-image';
import { supabase } from '../lib/supabase';
import { useDocumentComments, type DocumentComment } from '../hooks/useDocumentComments';

interface SharedDoc {
  id: string;
  title: string;
  content: Record<string, any>;
  status: string;
  created_at: string;
  updated_at: string;
}

export const SharedDocument: React.FC<{ token: string }> = ({ token }) => {
  const [doc, setDoc] = useState<SharedDoc | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [showComments, setShowComments] = useState(false);
  const { comments, loading: commentsLoading, addComment } = useDocumentComments(token);

  // Comment form state
  const [commentName, setCommentName] = useState('');
  const [commentEmail, setCommentEmail] = useState('');
  const [commentText, setCommentText] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const commentEndRef = useRef<HTMLDivElement>(null);

  // Persist name/email in localStorage
  useEffect(() => {
    const saved = localStorage.getItem('shared-doc-author');
    if (saved) {
      try {
        const { name, email } = JSON.parse(saved);
        if (name) setCommentName(name);
        if (email) setCommentEmail(email);
      } catch { /* ignore */ }
    }
  }, []);

  const editor = useEditor({
    extensions: [
      StarterKit.configure({ heading: { levels: [1, 2, 3] } }),
      TaskList,
      TaskItem.configure({ nested: true }),
      Underline,
      Table.configure({ resizable: false }),
      TableRow,
      TableCell,
      TableHeader,
      Image.configure({ inline: false, allowBase64: true }),
    ],
    editable: false,
    content: null,
    editorProps: {
      attributes: {
        class: 'prose prose-zinc dark:prose-invert max-w-none outline-none px-8 py-6',
      },
    },
  });

  useEffect(() => {
    const load = async () => {
      try {
        const { data, error: err } = await supabase.rpc('get_shared_document', { p_token: token });
        if (err) throw err;
        if (!data) {
          setError('Document not found or sharing is disabled.');
          return;
        }
        setDoc(data);
      } catch (err: any) {
        setError(err.message || 'Failed to load document');
      } finally {
        setLoading(false);
      }
    };
    load();
  }, [token]);

  // Set content and attach checklist click handler
  useEffect(() => {
    if (doc?.content && editor && Object.keys(doc.content).length > 0) {
      editor.commands.setContent(doc.content);
    }
  }, [doc, editor]);

  // Handle checklist checkbox clicks
  useEffect(() => {
    if (!editor) return;

    const handleClick = (e: MouseEvent) => {
      const target = e.target as HTMLElement;
      // TipTap task items have checkboxes inside li[data-type="taskItem"]
      if (target.tagName === 'INPUT' && target.getAttribute('type') === 'checkbox') {
        const taskItemEl = target.closest('[data-type="taskItem"]');
        if (!taskItemEl) return;

        e.preventDefault();
        e.stopPropagation();

        // Toggle the checked state in the TipTap JSON
        const currentChecked = (target as HTMLInputElement).checked;
        const newChecked = !currentChecked;

        // Update the checkbox visually
        (target as HTMLInputElement).checked = newChecked;
        taskItemEl.setAttribute('data-checked', String(newChecked));

        // Get updated JSON from the editor DOM and persist
        // We need to walk the editor's internal state
        const json = editor.getJSON();
        toggleTaskItemInJson(json, taskItemEl, newChecked);

        // Save to DB via RPC
        supabase.rpc('toggle_shared_document_checklist', {
          p_token: token,
          p_content: json,
        }).then(({ error: rpcErr }) => {
          if (rpcErr && import.meta.env.DEV) {
            console.warn('[SharedDocument] checklist toggle error:', rpcErr.message);
          }
        });
      }
    };

    const editorEl = editor.view.dom;
    editorEl.addEventListener('click', handleClick, true);
    return () => editorEl.removeEventListener('click', handleClick, true);
  }, [editor, token]);

  // Make checkboxes clickable even though editor is read-only
  useEffect(() => {
    if (!editor) return;
    const editorEl = editor.view.dom;
    // TipTap disables checkboxes in non-editable mode — re-enable them
    const enableCheckboxes = () => {
      editorEl.querySelectorAll('input[type="checkbox"]').forEach((cb) => {
        (cb as HTMLInputElement).disabled = false;
        (cb as HTMLElement).style.cursor = 'pointer';
        (cb as HTMLElement).style.pointerEvents = 'auto';
      });
    };
    // Run after content is set
    const timer = setTimeout(enableCheckboxes, 100);
    // Also observe for DOM changes (in case content updates)
    const observer = new MutationObserver(enableCheckboxes);
    observer.observe(editorEl, { childList: true, subtree: true });
    return () => {
      clearTimeout(timer);
      observer.disconnect();
    };
  }, [editor]);

  const handleSubmitComment = useCallback(async (e: React.FormEvent) => {
    e.preventDefault();
    if (!commentText.trim() || submitting) return;

    setSubmitting(true);
    // Save author info for next time
    localStorage.setItem('shared-doc-author', JSON.stringify({ name: commentName, email: commentEmail }));

    const ok = await addComment(commentName, commentEmail, commentText);
    if (ok) {
      setCommentText('');
      // Scroll to bottom
      setTimeout(() => commentEndRef.current?.scrollIntoView({ behavior: 'smooth' }), 100);
    }
    setSubmitting(false);
  }, [commentName, commentEmail, commentText, submitting, addComment]);

  if (loading) {
    return (
      <div className="min-h-screen bg-zinc-50 dark:bg-zinc-950 flex items-center justify-center">
        <div className="flex items-center gap-3 text-zinc-400">
          <div className="w-5 h-5 border-2 border-zinc-300 border-t-zinc-500 rounded-full animate-spin" />
          Loading...
        </div>
      </div>
    );
  }

  if (error || !doc) {
    return (
      <div className="min-h-screen bg-zinc-50 dark:bg-zinc-950 flex items-center justify-center">
        <div className="text-center">
          <p className="text-lg font-semibold text-zinc-700 dark:text-zinc-300 mb-2">Not Found</p>
          <p className="text-sm text-zinc-400">{error || 'This document is not available.'}</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-white dark:bg-zinc-950">
      <style>{`
        .ProseMirror table { border-collapse: collapse; width: 100%; margin: 1em 0; overflow: hidden; }
        .ProseMirror th, .ProseMirror td { border: 1px solid #e4e4e7; padding: 8px 12px; text-align: left; vertical-align: top; min-width: 80px; }
        .dark .ProseMirror th, .dark .ProseMirror td { border-color: #3f3f46; }
        .ProseMirror th { background: #f4f4f5; font-weight: 600; font-size: 0.85em; text-transform: uppercase; letter-spacing: 0.03em; color: #71717a; }
        .dark .ProseMirror th { background: #27272a; color: #a1a1aa; }
        .ProseMirror td { font-size: 0.9em; }
        .ProseMirror img { max-width: 100%; height: auto; border-radius: 8px; margin: 1em 0; }
        .ProseMirror input[type="checkbox"] { width: 16px; height: 16px; accent-color: #18181b; cursor: pointer; }
        .ProseMirror li[data-type="taskItem"] { display: flex; align-items: flex-start; gap: 8px; }
        .ProseMirror li[data-checked="true"] > div > p { text-decoration: line-through; color: #a1a1aa; }
      `}</style>

      {/* Header */}
      <div className="border-b border-zinc-100 dark:border-zinc-800/60 px-6 py-4">
        <div className="max-w-3xl mx-auto flex items-start justify-between">
          <div>
            <div className="flex items-center gap-2 mb-1">
              <span className="text-[10px] font-medium text-zinc-400 bg-zinc-100 dark:bg-zinc-800 px-2 py-0.5 rounded-full">
                Shared document
              </span>
            </div>
            <h1 className="text-xl font-semibold text-zinc-900 dark:text-zinc-100">{doc.title}</h1>
            <p className="text-xs text-zinc-400 mt-1">
              Last updated {new Date(doc.updated_at).toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' })}
            </p>
          </div>
          <button
            onClick={() => setShowComments(!showComments)}
            className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-zinc-600 dark:text-zinc-400 bg-zinc-100 dark:bg-zinc-800 rounded-full hover:bg-zinc-200 dark:hover:bg-zinc-700 transition-colors mt-1"
          >
            <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z" />
            </svg>
            {comments.length > 0 ? `${comments.length}` : 'Comments'}
          </button>
        </div>
      </div>

      <div className="flex">
        {/* Content */}
        <div className={`flex-1 transition-all duration-200 ${showComments ? 'max-w-3xl' : 'max-w-3xl mx-auto'}`} style={showComments ? { marginLeft: 'auto', marginRight: '0' } : {}}>
          <div className="py-8 px-4">
            <EditorContent editor={editor} />
          </div>
        </div>

        {/* Comments sidebar */}
        {showComments && (
          <div className="w-80 border-l border-zinc-100 dark:border-zinc-800/60 flex flex-col h-[calc(100vh-73px)] sticky top-[73px]">
            <div className="px-4 py-3 border-b border-zinc-100 dark:border-zinc-800/60">
              <div className="flex items-center justify-between">
                <h3 className="text-sm font-semibold text-zinc-800 dark:text-zinc-200">
                  Comments {comments.length > 0 && `(${comments.length})`}
                </h3>
                <button
                  onClick={() => setShowComments(false)}
                  className="text-zinc-400 hover:text-zinc-600 dark:hover:text-zinc-300"
                >
                  <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                  </svg>
                </button>
              </div>
            </div>

            {/* Comments list */}
            <div className="flex-1 overflow-y-auto px-4 py-3 space-y-3">
              {commentsLoading ? (
                <div className="flex items-center justify-center py-8">
                  <div className="w-4 h-4 border-2 border-zinc-300 border-t-zinc-500 rounded-full animate-spin" />
                </div>
              ) : comments.length === 0 ? (
                <div className="text-center py-8">
                  <p className="text-xs text-zinc-400">No comments yet.</p>
                  <p className="text-xs text-zinc-300 dark:text-zinc-600 mt-1">Be the first to leave a note.</p>
                </div>
              ) : (
                comments.map((c) => (
                  <CommentBubble key={c.id} comment={c} />
                ))
              )}
              <div ref={commentEndRef} />
            </div>

            {/* Comment form */}
            <form onSubmit={handleSubmitComment} className="border-t border-zinc-100 dark:border-zinc-800/60 p-3 space-y-2">
              <div className="flex gap-2">
                <input
                  type="text"
                  placeholder="Your name"
                  value={commentName}
                  onChange={(e) => setCommentName(e.target.value)}
                  className="flex-1 text-xs px-2.5 py-1.5 rounded-md border border-zinc-200 dark:border-zinc-700 bg-white dark:bg-zinc-900 text-zinc-800 dark:text-zinc-200 placeholder:text-zinc-400 focus:outline-none focus:ring-1 focus:ring-zinc-400"
                />
                <input
                  type="email"
                  placeholder="Email (optional)"
                  value={commentEmail}
                  onChange={(e) => setCommentEmail(e.target.value)}
                  className="flex-1 text-xs px-2.5 py-1.5 rounded-md border border-zinc-200 dark:border-zinc-700 bg-white dark:bg-zinc-900 text-zinc-800 dark:text-zinc-200 placeholder:text-zinc-400 focus:outline-none focus:ring-1 focus:ring-zinc-400"
                />
              </div>
              <div className="flex gap-2">
                <textarea
                  placeholder="Leave a comment..."
                  value={commentText}
                  onChange={(e) => setCommentText(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) {
                      handleSubmitComment(e);
                    }
                  }}
                  rows={2}
                  className="flex-1 text-xs px-2.5 py-1.5 rounded-md border border-zinc-200 dark:border-zinc-700 bg-white dark:bg-zinc-900 text-zinc-800 dark:text-zinc-200 placeholder:text-zinc-400 focus:outline-none focus:ring-1 focus:ring-zinc-400 resize-none"
                />
                <button
                  type="submit"
                  disabled={!commentText.trim() || submitting}
                  className="self-end px-3 py-1.5 text-xs font-medium text-white bg-zinc-800 dark:bg-zinc-200 dark:text-zinc-900 rounded-md hover:bg-zinc-700 dark:hover:bg-zinc-300 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
                >
                  {submitting ? '...' : 'Send'}
                </button>
              </div>
              <p className="text-[10px] text-zinc-300 dark:text-zinc-600">
                Ctrl+Enter to send
              </p>
            </form>
          </div>
        )}
      </div>

      {/* Footer */}
      <div className="border-t border-zinc-100 dark:border-zinc-800/60 px-6 py-4 text-center">
        <p className="text-[11px] text-zinc-300 dark:text-zinc-600">
          Shared via livv
        </p>
      </div>
    </div>
  );
};

/* ─── Comment bubble ─── */
const CommentBubble: React.FC<{ comment: DocumentComment }> = ({ comment }) => {
  const initials = comment.author_name
    .split(' ')
    .map(w => w[0])
    .join('')
    .slice(0, 2)
    .toUpperCase();

  const timeAgo = getTimeAgo(comment.created_at);

  return (
    <div className="flex gap-2.5">
      <div className="w-7 h-7 rounded-full bg-zinc-200 dark:bg-zinc-700 flex items-center justify-center flex-shrink-0 mt-0.5">
        <span className="text-[10px] font-semibold text-zinc-500 dark:text-zinc-400">{initials}</span>
      </div>
      <div className="flex-1 min-w-0">
        <div className="flex items-baseline gap-2">
          <span className="text-xs font-medium text-zinc-700 dark:text-zinc-300 truncate">
            {comment.author_name}
          </span>
          <span className="text-[10px] text-zinc-400 flex-shrink-0">{timeAgo}</span>
        </div>
        <p className="text-xs text-zinc-600 dark:text-zinc-400 mt-0.5 whitespace-pre-wrap break-words">
          {comment.comment}
        </p>
      </div>
    </div>
  );
};

/* ─── Helpers ─── */

function getTimeAgo(dateStr: string): string {
  const now = Date.now();
  const then = new Date(dateStr).getTime();
  const diffSec = Math.floor((now - then) / 1000);
  if (diffSec < 60) return 'just now';
  const diffMin = Math.floor(diffSec / 60);
  if (diffMin < 60) return `${diffMin}m ago`;
  const diffHr = Math.floor(diffMin / 60);
  if (diffHr < 24) return `${diffHr}h ago`;
  const diffDay = Math.floor(diffHr / 24);
  if (diffDay < 7) return `${diffDay}d ago`;
  return new Date(dateStr).toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}

/**
 * Walk the TipTap JSON content tree and toggle the checked attribute
 * of the taskItem node that corresponds to the clicked DOM element.
 * We match by position: count which taskItem in DOM order was clicked,
 * then toggle the same-indexed taskItem in the JSON.
 */
function toggleTaskItemInJson(json: any, _clickedEl: Element, newChecked: boolean): void {
  // Get all task items from the DOM to find the index of the clicked one
  const allTaskItems = document.querySelectorAll('[data-type="taskItem"]');
  let clickedIndex = -1;
  allTaskItems.forEach((el, i) => {
    if (el === _clickedEl) clickedIndex = i;
  });

  if (clickedIndex === -1) return;

  // Walk the JSON tree and find the nth taskItem
  let currentIndex = 0;

  function walk(node: any): boolean {
    if (node.type === 'taskItem') {
      if (currentIndex === clickedIndex) {
        node.attrs = { ...node.attrs, checked: newChecked };
        return true; // found
      }
      currentIndex++;
    }
    if (node.content) {
      for (const child of node.content) {
        if (walk(child)) return true;
      }
    }
    return false;
  }

  walk(json);
}
