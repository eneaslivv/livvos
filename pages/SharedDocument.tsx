import React, { useState, useEffect } from 'react';
import { useEditor, EditorContent } from '@tiptap/react';
import StarterKit from '@tiptap/starter-kit';
import TaskList from '@tiptap/extension-task-list';
import TaskItem from '@tiptap/extension-task-item';
import Underline from '@tiptap/extension-underline';
import { supabase } from '../lib/supabase';

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

  const editor = useEditor({
    extensions: [
      StarterKit.configure({ heading: { levels: [1, 2, 3] } }),
      TaskList,
      TaskItem.configure({ nested: true }),
      Underline,
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

  useEffect(() => {
    if (doc?.content && editor && Object.keys(doc.content).length > 0) {
      editor.commands.setContent(doc.content);
    }
  }, [doc, editor]);

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
      {/* Header */}
      <div className="border-b border-zinc-100 dark:border-zinc-800/60 px-6 py-4">
        <div className="max-w-3xl mx-auto">
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
      </div>

      {/* Content */}
      <div className="max-w-3xl mx-auto py-8">
        <EditorContent editor={editor} />
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
