import React, { useEffect, useState, useCallback } from 'react';
import { supabase } from '../lib/supabase';
import { Icons } from '../components/ui/Icons';
import { ProjectDocument } from '../components/projects';
import type { ProjectDocumentData } from '../components/projects';

/* ── Request Access Form ── */
const RequestAccessForm: React.FC<{ projectTitle: string; clientName?: string; token: string }> = ({ projectTitle, clientName, token }) => {
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [message, setMessage] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim() || !email.trim()) return;
    setSubmitting(true);
    setError(null);
    try {
      const { data, error: rpcErr } = await supabase.rpc('request_portal_access', {
        p_token: token, p_name: name.trim(), p_email: email.trim(), p_message: message.trim() || null,
      });
      if (rpcErr) throw rpcErr;
      if (data?.error) { setError(data.error); return; }
      setSubmitted(true);
    } catch (err: any) {
      setError(err.message || 'Error sending request');
    } finally {
      setSubmitting(false);
    }
  };

  if (submitted) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-zinc-50 p-4">
        <div className="w-full max-w-md bg-white rounded-2xl border border-zinc-200 p-8 text-center shadow-xl">
          <div className="w-14 h-14 bg-emerald-50 rounded-full flex items-center justify-center mx-auto mb-4">
            <Icons.Check size={24} className="text-emerald-500" />
          </div>
          <h2 className="text-lg font-semibold text-zinc-900 mb-2">Request sent</h2>
          <p className="text-sm text-zinc-500">Your access request for <strong>{projectTitle}</strong> has been sent. You will be notified when it's approved.</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-zinc-50 p-4">
      <div className="w-full max-w-md">
        <div className="text-center mb-8">
          <div className="w-12 h-12 bg-zinc-900 rounded-xl flex items-center justify-center text-white font-bold text-lg mx-auto mb-4">
            {projectTitle.charAt(0).toUpperCase()}
          </div>
          <h1 className="text-xl font-bold text-zinc-900">{projectTitle}</h1>
          {clientName && <p className="text-sm text-zinc-500 mt-1">{clientName}</p>}
          <p className="text-xs text-zinc-400 mt-3">This project requires access approval. Fill in the form below to request access.</p>
        </div>

        <form onSubmit={handleSubmit} className="bg-white rounded-2xl border border-zinc-200 p-6 shadow-xl space-y-4">
          <div>
            <label className="block text-xs font-semibold text-zinc-600 mb-1.5">Name</label>
            <input
              type="text" value={name} onChange={e => setName(e.target.value)} required
              className="w-full px-3 py-2.5 bg-zinc-50 border border-zinc-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500"
              placeholder="Your full name"
            />
          </div>
          <div>
            <label className="block text-xs font-semibold text-zinc-600 mb-1.5">Email</label>
            <input
              type="email" value={email} onChange={e => setEmail(e.target.value)} required
              className="w-full px-3 py-2.5 bg-zinc-50 border border-zinc-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500"
              placeholder="you@example.com"
            />
          </div>
          <div>
            <label className="block text-xs font-semibold text-zinc-600 mb-1.5">Message <span className="text-zinc-400 font-normal">(optional)</span></label>
            <textarea
              value={message} onChange={e => setMessage(e.target.value)} rows={3}
              className="w-full px-3 py-2.5 bg-zinc-50 border border-zinc-200 rounded-xl text-sm resize-none focus:outline-none focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500"
              placeholder="Why do you need access?"
            />
          </div>
          {error && <p className="text-xs text-red-500">{error}</p>}
          <button
            type="submit" disabled={submitting || !name.trim() || !email.trim()}
            className="w-full py-2.5 bg-zinc-900 text-white rounded-xl text-sm font-semibold hover:bg-zinc-800 disabled:opacity-40 transition-colors"
          >
            {submitting ? 'Sending...' : 'Request Access'}
          </button>
        </form>

        <p className="text-center text-[10px] text-zinc-300 mt-6">Powered by Livv</p>
      </div>
    </div>
  );
};

/* ── Main Component ── */
interface PublicPortalViewProps { token: string; }

export const PublicPortalView: React.FC<PublicPortalViewProps> = ({ token }) => {
  const [data, setData] = useState<ProjectDocumentData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
  const [mode, setMode] = useState<'public' | 'request'>('public');

  const loadData = useCallback(async () => {
    setLoading(true);
    try {
      const { data: result, error: rpcErr } = await supabase.rpc('get_public_portal', { p_token: token });
      if (rpcErr || !result) { setError(true); return; }
      setMode(result.mode);
      setData(result as ProjectDocumentData);
    } catch {
      setError(true);
    } finally {
      setLoading(false);
    }
  }, [token]);

  useEffect(() => { loadData(); }, [loadData]);

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-zinc-50">
        <div className="w-8 h-8 border-2 border-zinc-300 border-t-emerald-600 rounded-full animate-spin" />
      </div>
    );
  }

  if (error || !data) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-zinc-50 p-4">
        <div className="w-full max-w-md bg-white border border-zinc-200 rounded-2xl p-8 text-center shadow-xl">
          <div className="w-14 h-14 bg-red-50 rounded-full flex items-center justify-center mx-auto mb-4">
            <Icons.AlertCircle size={24} className="text-red-500" />
          </div>
          <h2 className="text-lg font-semibold text-zinc-900 mb-2">Link not valid</h2>
          <p className="text-sm text-zinc-500">This link is invalid or has been disabled.</p>
        </div>
      </div>
    );
  }

  // Request access mode
  if (mode === 'request') {
    return (
      <RequestAccessForm
        projectTitle={data.project.title}
        clientName={data.project.client_company || data.project.client_name}
        token={token}
      />
    );
  }

  // Public mode — document view
  return <ProjectDocument data={data} />;
};
