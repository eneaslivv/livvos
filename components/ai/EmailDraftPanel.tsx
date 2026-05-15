/**
 * EmailDraftPanel — slim modal that drafts + sends a new email via the
 * connected Gmail integration. Used as a shortcut from the AI Advisor
 * (and anywhere else we want a quick "compose with AI assist" affordance).
 *
 * Flow:
 *  1. Opens with optional pre-fills (To, Subject, Brief).
 *  2. User fills "Brief" — a one-liner describing what the email should
 *     say. Click "✨ Generate body" → AI drafts the body via Gemini.
 *  3. User edits the To, Subject, Body, then clicks "Send" → calls the
 *     gmail-send edge function which uses the user's Gmail OAuth token.
 *  4. Success toast + the message lands in their Sent folder AND in the
 *     in-app Inbox view (as direction='outbound').
 *
 * Requires: an active Gmail integration_token for the current tenant.
 * If none, the Send button shows "Connect Gmail first" and links to
 * Communications.
 */
import React, { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { Icons } from '../ui/Icons';
import { useTenant } from '../../context/TenantContext';
import { sendNewGmail } from '../../lib/communications/gmail';
import { sendAdvisorChat } from '../../lib/ai';
import { errorLogger } from '../../lib/errorLogger';

interface Props {
  isOpen: boolean;
  onClose: () => void;
  /** Optional pre-fills — useful when triggered from a context that
   *  already knows the recipient (e.g. client detail page). */
  initialTo?: string;
  initialSubject?: string;
  initialBrief?: string;
  /** Optional context passed to the AI so the body comes out grounded
   *  (e.g. project name, past message thread, etc.). */
  aiContext?: string;
  /** Fired after a successful send so the parent can refresh / close. */
  onSent?: (result: { external_id: string; thread_id: string }) => void;
}

export const EmailDraftPanel: React.FC<Props> = ({
  isOpen, onClose, initialTo = '', initialSubject = '', initialBrief = '', aiContext = '', onSent,
}) => {
  const { currentTenant } = useTenant();
  const [to, setTo] = useState(initialTo);
  const [subject, setSubject] = useState(initialSubject);
  const [brief, setBrief] = useState(initialBrief);
  const [body, setBody] = useState('');
  const [generating, setGenerating] = useState(false);
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [sentResult, setSentResult] = useState<{ external_id: string; thread_id: string } | null>(null);

  useEffect(() => {
    if (isOpen) {
      setTo(initialTo);
      setSubject(initialSubject);
      setBrief(initialBrief);
      setBody('');
      setError(null);
      setSentResult(null);
    }
  }, [isOpen, initialTo, initialSubject, initialBrief]);

  // Esc closes
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape' && !sending) onClose(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose, sending]);

  const generateBody = async () => {
    if (!brief.trim() || generating) return;
    setGenerating(true);
    setError(null);
    try {
      // Use the existing advisor chat endpoint with a tightly-scoped
      // system instruction so the reply comes back as just the email
      // body — no JSON wrapping, no extra commentary.
      const prompt = [
        'Draft a professional email body in plain text.',
        '',
        `Recipient: ${to || '<unknown>'}`,
        `Subject: ${subject || '(none yet)'}`,
        '',
        `What the email should say: ${brief}`,
        aiContext ? `\nAdditional context:\n${aiContext}` : '',
        '',
        'Return ONLY the email body. Start with a greeting (e.g. "Hi Christie,"), end with a sign-off (e.g. "Best,\\nEneas"). No subject line, no JSON, no markdown — just the text body as it should appear in the recipient\\u2019s inbox. Keep it concise (under 200 words unless the brief calls for more).',
      ].join('\n');
      // sendAdvisorChat(context, history, question) — pass aiContext as
      // the rolling context, empty history, and the prompt as the question.
      const result = await sendAdvisorChat(aiContext || '', [], prompt);
      const reply = (result as any)?.reply || '';
      if (!reply.trim()) throw new Error('AI returned an empty draft');
      setBody(reply.trim());
    } catch (e: any) {
      errorLogger.error('email draft AI failed', e);
      setError(e?.message || 'Could not draft the email');
    } finally {
      setGenerating(false);
    }
  };

  const send = async () => {
    if (!to.trim() || !body.trim() || !currentTenant?.id || sending) return;
    setSending(true);
    setError(null);
    try {
      const result = await sendNewGmail({
        tenantId: currentTenant.id,
        to: to.trim(),
        subject: subject.trim() || '(no subject)',
        body: body,
      });
      setSentResult({ external_id: result.external_id, thread_id: result.thread_id });
      onSent?.({ external_id: result.external_id, thread_id: result.thread_id });
    } catch (e: any) {
      errorLogger.error('email send failed', e);
      setError(e?.message || 'Could not send the email');
    } finally {
      setSending(false);
    }
  };

  if (!isOpen) return null;

  return createPortal(
    <div
      className="fixed inset-0 z-[60] flex items-center justify-center bg-black/40 backdrop-blur-sm p-4"
      onClick={() => { if (!sending) onClose(); }}
    >
      <div
        className="w-full max-w-xl bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-2xl shadow-2xl overflow-hidden flex flex-col max-h-[90vh]"
        onClick={e => e.stopPropagation()}
      >
        {/* Header */}
        <header className="px-5 pt-4 pb-3 border-b border-zinc-100 dark:border-zinc-800/60 flex items-center gap-2">
          <div className="w-7 h-7 rounded-lg bg-gradient-to-br from-fuchsia-500/15 to-indigo-500/15 flex items-center justify-center">
            <Icons.Mail size={14} className="text-fuchsia-600 dark:text-fuchsia-400" />
          </div>
          <div className="flex-1 min-w-0">
            <h3 className="text-sm font-semibold text-zinc-900 dark:text-zinc-100">
              {sentResult ? 'Email sent' : 'New email'}
            </h3>
            <p className="text-[10px] text-zinc-400">AI-assisted draft, sent via your connected Gmail</p>
          </div>
          <button
            onClick={onClose}
            disabled={sending}
            className="p-1 rounded text-zinc-400 hover:text-zinc-700 dark:hover:text-zinc-200 hover:bg-zinc-100 dark:hover:bg-zinc-800 transition-colors disabled:opacity-30"
          >
            <Icons.Close size={14} />
          </button>
        </header>

        {sentResult ? (
          /* Success state */
          <div className="p-8 text-center flex-1 flex flex-col items-center justify-center">
            <div className="w-12 h-12 rounded-full bg-emerald-50 dark:bg-emerald-500/10 flex items-center justify-center mb-3">
              <Icons.CheckCircle size={22} className="text-emerald-500" />
            </div>
            <h4 className="text-base font-semibold text-zinc-900 dark:text-zinc-100">Sent</h4>
            <p className="text-xs text-zinc-500 mt-1 max-w-sm">
              Delivered to {to}. It'll show up in your Inbox view shortly (and in Gmail's Sent folder).
            </p>
            <button
              onClick={onClose}
              className="mt-5 px-3 py-1.5 rounded-md text-xs font-semibold bg-zinc-900 dark:bg-zinc-100 text-white dark:text-zinc-900 hover:opacity-90"
            >Close</button>
          </div>
        ) : (
          /* Compose state */
          <div className="p-5 space-y-4 overflow-y-auto flex-1">
            {/* To */}
            <div>
              <label className="block text-[10px] font-bold uppercase tracking-wider text-zinc-400 mb-1.5">To</label>
              <input
                type="email"
                value={to}
                onChange={e => setTo(e.target.value)}
                placeholder="recipient@example.com"
                className="w-full px-3 py-2 rounded-md border border-zinc-200 dark:border-zinc-700 bg-white dark:bg-zinc-950 text-[13px] text-zinc-900 dark:text-zinc-100 focus:outline-none focus:ring-1 focus:ring-fuchsia-400"
              />
            </div>

            {/* Subject */}
            <div>
              <label className="block text-[10px] font-bold uppercase tracking-wider text-zinc-400 mb-1.5">Subject</label>
              <input
                type="text"
                value={subject}
                onChange={e => setSubject(e.target.value)}
                placeholder="What's this email about"
                className="w-full px-3 py-2 rounded-md border border-zinc-200 dark:border-zinc-700 bg-white dark:bg-zinc-950 text-[13px] text-zinc-900 dark:text-zinc-100 focus:outline-none focus:ring-1 focus:ring-fuchsia-400"
              />
            </div>

            {/* Brief — what the email should say (AI input) */}
            <div>
              <label className="block text-[10px] font-bold uppercase tracking-wider text-zinc-400 mb-1.5">
                Brief <span className="text-zinc-300 font-normal normal-case">— tell the AI what to write</span>
              </label>
              <textarea
                value={brief}
                onChange={e => setBrief(e.target.value)}
                placeholder="e.g. follow up with Christie about Friday's design checkpoint, ask if she has feedback on the Lucky sub-brand assets"
                rows={3}
                className="w-full px-3 py-2 rounded-md border border-zinc-200 dark:border-zinc-700 bg-white dark:bg-zinc-950 text-[12px] text-zinc-900 dark:text-zinc-100 focus:outline-none focus:ring-1 focus:ring-fuchsia-400 resize-none"
              />
              <button
                onClick={generateBody}
                disabled={!brief.trim() || generating}
                className="mt-2 inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md text-[11px] font-semibold text-fuchsia-700 dark:text-fuchsia-300 bg-fuchsia-50 dark:bg-fuchsia-500/10 border border-fuchsia-200 dark:border-fuchsia-500/30 hover:bg-fuchsia-100 dark:hover:bg-fuchsia-500/20 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
              >
                {generating ? (
                  <>
                    <span className="w-2.5 h-2.5 border-2 border-fuchsia-400 border-t-transparent rounded-full animate-spin" />
                    Drafting…
                  </>
                ) : (
                  <>
                    <Icons.Sparkles size={11} />
                    {body ? 'Regenerate body' : '✨ Generate body with AI'}
                  </>
                )}
              </button>
            </div>

            {/* Body */}
            <div>
              <label className="block text-[10px] font-bold uppercase tracking-wider text-zinc-400 mb-1.5">Body</label>
              <textarea
                value={body}
                onChange={e => setBody(e.target.value)}
                placeholder="The email body will appear here after you click Generate. You can edit anything before sending."
                rows={8}
                className="w-full px-3 py-2 rounded-md border border-zinc-200 dark:border-zinc-700 bg-white dark:bg-zinc-950 text-[12.5px] text-zinc-900 dark:text-zinc-100 focus:outline-none focus:ring-1 focus:ring-fuchsia-400 resize-y leading-relaxed font-sans"
              />
            </div>

            {error && (
              <div className="flex items-start gap-2 p-2 rounded-md text-[11px] text-rose-700 dark:text-rose-300 bg-rose-50 dark:bg-rose-500/10 border border-rose-200 dark:border-rose-500/20">
                <Icons.AlertCircle size={12} className="shrink-0 mt-0.5" />
                <span>{error}</span>
              </div>
            )}
          </div>
        )}

        {/* Footer */}
        {!sentResult && (
          <footer className="px-5 py-3 border-t border-zinc-100 dark:border-zinc-800/60 flex items-center gap-2">
            <span className="text-[10px] text-zinc-400 flex-1 truncate">
              Sends from your connected Gmail account.
            </span>
            <button
              onClick={onClose}
              disabled={sending}
              className="text-[11px] font-medium text-zinc-500 hover:text-zinc-900 dark:hover:text-zinc-100 px-2.5 py-1.5 disabled:opacity-30"
            >Cancel</button>
            <button
              onClick={send}
              disabled={!to.trim() || !body.trim() || sending}
              className="px-3 py-1.5 rounded-md text-[11px] font-semibold text-white bg-zinc-900 dark:bg-zinc-100 dark:text-zinc-900 disabled:opacity-40 disabled:cursor-not-allowed hover:opacity-90 transition-opacity inline-flex items-center gap-1.5"
            >
              {sending ? (
                <>
                  <span className="w-2.5 h-2.5 border-2 border-white border-t-transparent rounded-full animate-spin" />
                  Sending…
                </>
              ) : (
                <>
                  <Icons.Send size={11} /> Send
                </>
              )}
            </button>
          </footer>
        )}
      </div>
    </div>,
    document.body
  );
};
