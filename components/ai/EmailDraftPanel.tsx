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
import React, { useEffect, useMemo, useState } from 'react';
import { createPortal } from 'react-dom';
import { Icons } from '../ui/Icons';
import { useTenant } from '../../context/TenantContext';
import { useProjects } from '../../context/ProjectsContext';
import { useCalendar } from '../../context/CalendarContext';
import { sendNewGmail } from '../../lib/communications/gmail';
import { postToSlack } from '../../lib/communications/slack';
import { sendAdvisorChat } from '../../lib/ai';
import { errorLogger } from '../../lib/errorLogger';
import { supabase } from '../../lib/supabase';
import { SearchableSelect } from '../ui/SearchableSelect';

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

type Timeframe = 'this_week' | 'last_week' | 'past_7' | 'past_30';
const TIMEFRAME_LABEL: Record<Timeframe, string> = {
  this_week: 'This week',
  last_week: 'Last week',
  past_7:    'Past 7 days',
  past_30:   'Past 30 days',
};

const timeframeRange = (tf: Timeframe): { start: Date; end: Date } => {
  const now = new Date();
  now.setHours(0, 0, 0, 0);
  const end = new Date(now); end.setHours(23, 59, 59, 999);
  if (tf === 'past_7') {
    const start = new Date(now); start.setDate(start.getDate() - 6);
    return { start, end };
  }
  if (tf === 'past_30') {
    const start = new Date(now); start.setDate(start.getDate() - 29);
    return { start, end };
  }
  // this_week / last_week — Monday-anchored
  const dayOfWeek = (now.getDay() + 6) % 7; // 0 = Monday
  const monday = new Date(now); monday.setDate(now.getDate() - dayOfWeek);
  if (tf === 'this_week') {
    const sunday = new Date(monday); sunday.setDate(monday.getDate() + 6); sunday.setHours(23, 59, 59, 999);
    return { start: monday, end: sunday };
  }
  // last_week
  const lastMon = new Date(monday); lastMon.setDate(monday.getDate() - 7);
  const lastSun = new Date(monday); lastSun.setDate(monday.getDate() - 1); lastSun.setHours(23, 59, 59, 999);
  return { start: lastMon, end: lastSun };
};

export const EmailDraftPanel: React.FC<Props> = ({
  isOpen, onClose, initialTo = '', initialSubject = '', initialBrief = '', aiContext = '', onSent,
}) => {
  const { currentTenant } = useTenant();
  const { projects } = useProjects();
  const { tasks: calendarTasks } = useCalendar();
  const [to, setTo] = useState(initialTo);
  const [subject, setSubject] = useState(initialSubject);
  const [brief, setBrief] = useState(initialBrief);
  const [body, setBody] = useState('');
  const [generating, setGenerating] = useState(false);
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [sentResult, setSentResult] = useState<{ external_id: string; thread_id: string } | null>(null);

  // Task-summary picker state
  const [taskPickerOpen, setTaskPickerOpen] = useState(false);
  const [taskPickerProject, setTaskPickerProject] = useState<string>('');
  const [taskPickerTimeframe, setTaskPickerTimeframe] = useState<Timeframe>('this_week');
  // Free-form context appended to the AI prompt — populated when user adds
  // task summaries; fully editable so they can prune what gets sent.
  const [contextNotes, setContextNotes] = useState('');

  // Refinement loop state — visible once the body has been generated.
  const [refineInstruction, setRefineInstruction] = useState('');
  const [refining, setRefining] = useState(false);

  // ── Destination + preview ──
  // The same body can be routed to either Gmail (sent to `to` address)
  // or to a Slack channel the user picks. Toggling the destination
  // swaps the relevant input ("To" vs "Channel") and the Send button
  // routes through the right edge function.
  const [destination, setDestination] = useState<'email' | 'slack'>('email');
  const [slackChannelId, setSlackChannelId] = useState<string>('');
  const [slackChannels, setSlackChannels] = useState<Array<{ id: string; name: string }>>([]);
  // Preview/confirm step — instead of sending immediately on click, we
  // first show a summary so the user can double-check what's going out.
  const [previewing, setPreviewing] = useState(false);

  useEffect(() => {
    if (isOpen) {
      setTo(initialTo);
      setSubject(initialSubject);
      setBrief(initialBrief);
      setBody('');
      setError(null);
      setSentResult(null);
      setContextNotes('');
      setTaskPickerOpen(false);
      setTaskPickerProject('');
      setTaskPickerTimeframe('this_week');
      setRefineInstruction('');
      setDestination('email');
      setSlackChannelId('');
      setPreviewing(false);
    }
  }, [isOpen, initialTo, initialSubject, initialBrief]);

  // Load the tenant's Slack monitored channels so the user can pick one
  // when destination = 'slack'. Cheap query, runs once when the panel opens.
  useEffect(() => {
    if (!isOpen || !currentTenant?.id) return;
    let cancelled = false;
    (async () => {
      try {
        const { data } = await supabase
          .from('slack_monitored_channels')
          .select('channel_id, channel_name')
          .eq('tenant_id', currentTenant.id)
          .eq('is_active', true)
          .order('channel_name');
        if (cancelled) return;
        setSlackChannels((data || []).map((c: any) => ({ id: c.channel_id, name: c.channel_name })));
      } catch { /* ignore — Slack just won't be selectable */ }
    })();
    return () => { cancelled = true; };
  }, [isOpen, currentTenant?.id]);

  // Esc closes
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape' && !sending) onClose(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose, sending]);

  // ── Pull completed tasks for project + timeframe → contextNotes ──
  // Reads from CalendarContext.tasks (already cached + cross-tenant aware
  // for shared projects). Filters by completed=true within the picked
  // timeframe, optionally scoped to a project. Renders a bulleted list
  // into contextNotes which the user can edit before generating.
  const pullCompletedTasks = () => {
    const { start, end } = timeframeRange(taskPickerTimeframe);
    const picked = calendarTasks.filter(t => {
      if (!t.completed) return false;
      if (taskPickerProject && t.project_id !== taskPickerProject) return false;
      const stamp = t.completed_at || t.start_date;
      if (!stamp) return false;
      const d = new Date(String(stamp).slice(0, 10) + 'T12:00:00');
      return d >= start && d <= end;
    });
    if (picked.length === 0) {
      setError(`No completed tasks found for ${TIMEFRAME_LABEL[taskPickerTimeframe]}${taskPickerProject ? ' on this project' : ''}.`);
      return;
    }
    const projectName = taskPickerProject
      ? (projects.find(p => p.id === taskPickerProject)?.title || 'this project')
      : null;
    const header = projectName
      ? `Completed tasks on ${projectName} — ${TIMEFRAME_LABEL[taskPickerTimeframe]}:`
      : `Completed tasks across all projects — ${TIMEFRAME_LABEL[taskPickerTimeframe]}:`;
    const lines = picked.slice(0, 30).map(t => {
      const stamp = t.completed_at || t.start_date;
      const dateStr = stamp ? new Date(String(stamp).slice(0, 10) + 'T12:00:00').toLocaleDateString('en-US', { day: 'numeric', month: 'short' }) : '';
      const projBit = !taskPickerProject && t.project_id
        ? ` _(${projects.find(p => p.id === t.project_id)?.title || 'project'})_`
        : '';
      return `• ${t.title}${dateStr ? ` — ${dateStr}` : ''}${projBit}`;
    });
    if (picked.length > 30) lines.push(`…+${picked.length - 30} more`);
    const block = [header, ...lines].join('\n');
    setContextNotes(prev => prev ? `${prev}\n\n${block}` : block);
    setError(null);
    setTaskPickerOpen(false);
  };

  const generateBody = async () => {
    if (!brief.trim() || generating) return;
    setGenerating(true);
    setError(null);
    try {
      const fullContext = [aiContext || '', contextNotes || ''].filter(Boolean).join('\n\n');
      const prompt = [
        'Draft a professional email body in plain text.',
        '',
        `Recipient: ${to || '<unknown>'}`,
        `Subject: ${subject || '(none yet)'}`,
        '',
        `What the email should say: ${brief}`,
        fullContext ? `\nUse this context (real data — reference specific items naturally, do NOT just copy-paste the list):\n${fullContext}` : '',
        '',
        'Return ONLY the email body. Start with a greeting (e.g. "Hi Christie,"), end with a sign-off (e.g. "Best,\\nEneas"). No subject line, no JSON, no markdown — just the text body as it should appear in the recipient\\u2019s inbox. Keep it concise (under 250 words unless the brief calls for more).',
      ].join('\n');
      const result = await sendAdvisorChat(fullContext, [], prompt);
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

  // ── Refinement loop — takes current body + an instruction, returns
  // an updated body. Lets the user iterate without rewriting from
  // scratch ("make it more formal", "add a thank you", "shorter", etc).
  const refineBody = async () => {
    if (!body.trim() || !refineInstruction.trim() || refining) return;
    setRefining(true);
    setError(null);
    try {
      const prompt = [
        'Refine the email body below according to the instruction.',
        '',
        `Instruction: ${refineInstruction}`,
        '',
        'Current email body:',
        body,
        '',
        'Return ONLY the new email body (greeting + content + sign-off, plain text). No commentary, no markdown, no subject line.',
      ].join('\n');
      const result = await sendAdvisorChat('', [], prompt);
      const reply = (result as any)?.reply || '';
      if (!reply.trim()) throw new Error('AI returned an empty refinement');
      setBody(reply.trim());
      setRefineInstruction('');
    } catch (e: any) {
      errorLogger.error('email refine AI failed', e);
      setError(e?.message || 'Could not refine the email');
    } finally {
      setRefining(false);
    }
  };

  // Project options for the SearchableSelect
  const projectOptions = useMemo(() => projects.map(p => ({
    value: p.id,
    label: p.title,
    icon: (p as any).icon || '📁',
    avatarUrl: (p as any).logoUrl || null,
    searchValue: (p.title || '').toLowerCase(),
  })), [projects]);

  // Validations vary by destination. Used both to gate the Preview/Send
  // button and to decide what to render in the preview step.
  const canSend = body.trim() && currentTenant?.id && (
    destination === 'email' ? to.trim() : slackChannelId
  );

  const send = async () => {
    if (!canSend || sending) return;
    setSending(true);
    setError(null);
    try {
      if (destination === 'email') {
        const result = await sendNewGmail({
          tenantId: currentTenant!.id,
          to: to.trim(),
          subject: subject.trim() || '(no subject)',
          body: body,
        });
        setSentResult({ external_id: result.external_id, thread_id: result.thread_id });
        onSent?.({ external_id: result.external_id, thread_id: result.thread_id });
      } else {
        // Slack — assemble a clean message: optional subject as bold
        // header, then body. No Block Kit blocks; the AI body is
        // already structured prose, posting as plain text reads better.
        const text = subject.trim()
          ? `*${subject.trim()}*\n${body}`
          : body;
        const result = await postToSlack({
          tenantId: currentTenant!.id,
          channelId: slackChannelId,
          text,
        });
        setSentResult({ external_id: result.ts, thread_id: result.channel });
        onSent?.({ external_id: result.ts, thread_id: result.channel });
      }
    } catch (e: any) {
      errorLogger.error(`${destination} send failed`, e);
      setError(e?.message || `Could not send via ${destination}`);
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
            {/* Destination toggle — Email vs Slack channel.
                Switches the input below (To address vs channel picker)
                and changes which API the Send button hits. */}
            <div>
              <label className="block text-[10px] font-bold uppercase tracking-wider text-zinc-400 mb-1.5">Send via</label>
              <div className="inline-flex p-0.5 rounded-lg bg-zinc-100 dark:bg-zinc-800/60 border border-zinc-200 dark:border-zinc-800">
                {([
                  { v: 'email' as const, label: 'Email', icon: 'Mail' as const },
                  { v: 'slack' as const, label: 'Slack', icon: 'MessageSquare' as const },
                ]).map(opt => {
                  const active = destination === opt.v;
                  const IconCmp = (Icons as any)[opt.icon] || Icons.Mail;
                  return (
                    <button
                      key={opt.v}
                      onClick={() => setDestination(opt.v)}
                      className={`px-3 py-1 rounded-md text-[12px] font-semibold transition-all inline-flex items-center gap-1.5 ${
                        active
                          ? 'bg-white dark:bg-zinc-900 text-zinc-900 dark:text-zinc-100 shadow-sm'
                          : 'text-zinc-500 dark:text-zinc-400 hover:text-zinc-700 dark:hover:text-zinc-200'
                      }`}
                    >
                      <IconCmp size={11} />
                      {opt.label}
                    </button>
                  );
                })}
              </div>
            </div>

            {/* Recipient input — switches between Email and Slack */}
            {destination === 'email' ? (
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
            ) : (
              <div>
                <label className="block text-[10px] font-bold uppercase tracking-wider text-zinc-400 mb-1.5">Channel</label>
                {slackChannels.length > 0 ? (
                  <SearchableSelect
                    value={slackChannelId}
                    onChange={setSlackChannelId}
                    options={slackChannels.map(c => ({ value: c.id, label: `#${c.name}`, searchValue: c.name }))}
                    placeholder="Search channel…"
                    emptyOption={{ value: '', label: 'Pick a channel' }}
                    popoverWidth={280}
                  />
                ) : (
                  <div className="text-[11.5px] text-zinc-500 px-3 py-2 rounded-md border border-dashed border-zinc-200 dark:border-zinc-800">
                    No Slack channels are monitored. Configure them in Inbox → channels.
                  </div>
                )}
              </div>
            )}

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
              <div className="mt-2 flex items-center gap-2 flex-wrap">
                <button
                  onClick={generateBody}
                  disabled={!brief.trim() || generating}
                  className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md text-[11px] font-semibold text-fuchsia-700 dark:text-fuchsia-300 bg-fuchsia-50 dark:bg-fuchsia-500/10 border border-fuchsia-200 dark:border-fuchsia-500/30 hover:bg-fuchsia-100 dark:hover:bg-fuchsia-500/20 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
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
                {/* Pull tasks shortcut — opens the project + timeframe picker */}
                <button
                  onClick={() => setTaskPickerOpen(v => !v)}
                  className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md text-[11px] font-medium border transition-colors ${
                    taskPickerOpen || contextNotes
                      ? 'bg-emerald-50 dark:bg-emerald-500/10 border-emerald-200 dark:border-emerald-500/30 text-emerald-700 dark:text-emerald-300'
                      : 'border-zinc-200 dark:border-zinc-700 text-zinc-500 dark:text-zinc-400 hover:bg-zinc-50 dark:hover:bg-zinc-800/40'
                  }`}
                >
                  <Icons.CheckCircle size={11} />
                  {contextNotes ? 'Context attached' : '📋 Add completed tasks'}
                </button>
              </div>

              {/* Inline picker — appears when user clicks "Add completed tasks" */}
              {taskPickerOpen && (
                <div className="mt-2 p-3 rounded-lg border border-emerald-200 dark:border-emerald-500/30 bg-emerald-50/40 dark:bg-emerald-500/5 space-y-2">
                  <p className="text-[10px] text-emerald-700 dark:text-emerald-300 font-medium">
                    Pulls completed tasks for the picked project + timeframe and feeds them as context to the AI.
                  </p>
                  <div className="grid grid-cols-2 gap-2">
                    <div>
                      <label className="block text-[9px] font-bold uppercase tracking-wider text-zinc-400 mb-1">Project</label>
                      <SearchableSelect
                        value={taskPickerProject}
                        onChange={(v) => setTaskPickerProject(v)}
                        options={projectOptions}
                        placeholder="Search project…"
                        emptyOption={{ value: '', label: '— All projects' }}
                        popoverWidth={260}
                      />
                    </div>
                    <div>
                      <label className="block text-[9px] font-bold uppercase tracking-wider text-zinc-400 mb-1">Timeframe</label>
                      <select
                        value={taskPickerTimeframe}
                        onChange={e => setTaskPickerTimeframe(e.target.value as Timeframe)}
                        className="w-full px-2 py-1.5 rounded-md border border-zinc-200 dark:border-zinc-700 bg-white dark:bg-zinc-950 text-[12px] text-zinc-900 dark:text-zinc-100 focus:outline-none focus:ring-1 focus:ring-emerald-400"
                      >
                        {(['this_week', 'last_week', 'past_7', 'past_30'] as Timeframe[]).map(tf => (
                          <option key={tf} value={tf}>{TIMEFRAME_LABEL[tf]}</option>
                        ))}
                      </select>
                    </div>
                  </div>
                  <div className="flex justify-end gap-1.5">
                    <button
                      onClick={() => setTaskPickerOpen(false)}
                      className="text-[11px] text-zinc-500 hover:text-zinc-900 dark:hover:text-zinc-100 px-2 py-1"
                    >Cancel</button>
                    <button
                      onClick={pullCompletedTasks}
                      className="px-2.5 py-1 rounded-md text-[11px] font-semibold text-white bg-emerald-600 hover:bg-emerald-700"
                    >Add to context</button>
                  </div>
                </div>
              )}

              {/* Context notes — visible whenever populated, fully editable */}
              {contextNotes && (
                <div className="mt-2">
                  <div className="flex items-center justify-between mb-1">
                    <label className="text-[10px] font-bold uppercase tracking-wider text-zinc-400">Context for AI</label>
                    <button
                      onClick={() => setContextNotes('')}
                      className="text-[10px] text-zinc-400 hover:text-rose-500"
                    >Clear</button>
                  </div>
                  <textarea
                    value={contextNotes}
                    onChange={e => setContextNotes(e.target.value)}
                    rows={4}
                    className="w-full px-2 py-1.5 rounded-md border border-zinc-200 dark:border-zinc-700 bg-zinc-50 dark:bg-zinc-800/40 text-[11px] text-zinc-700 dark:text-zinc-300 focus:outline-none focus:ring-1 focus:ring-fuchsia-400 resize-y font-mono leading-snug"
                  />
                </div>
              )}
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

              {/* Refinement loop — appears once a body exists. Lets the
                  user iterate ("more formal", "shorter", "add a thank
                  you") without rewriting from scratch. */}
              {body && (
                <div className="mt-2 flex items-center gap-2">
                  <input
                    type="text"
                    value={refineInstruction}
                    onChange={e => setRefineInstruction(e.target.value)}
                    placeholder="Tell the AI how to improve this — e.g. more formal, shorter, add a thank you"
                    onKeyDown={e => { if (e.key === 'Enter' && refineInstruction.trim()) { e.preventDefault(); refineBody(); } }}
                    className="flex-1 px-2.5 py-1.5 rounded-md border border-zinc-200 dark:border-zinc-700 bg-white dark:bg-zinc-950 text-[11.5px] text-zinc-900 dark:text-zinc-100 focus:outline-none focus:ring-1 focus:ring-fuchsia-400"
                  />
                  <button
                    onClick={refineBody}
                    disabled={!refineInstruction.trim() || refining}
                    className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-md text-[11px] font-semibold text-white bg-zinc-900 dark:bg-zinc-100 dark:text-zinc-900 hover:opacity-90 disabled:opacity-40 disabled:cursor-not-allowed transition-opacity"
                  >
                    {refining ? (
                      <>
                        <span className="w-2.5 h-2.5 border-2 border-white border-t-transparent rounded-full animate-spin" />
                        Refining…
                      </>
                    ) : (
                      <>
                        <Icons.Sparkles size={11} /> Refine
                      </>
                    )}
                  </button>
                </div>
              )}
            </div>

            {error && (
              <div className="flex items-start gap-2 p-2 rounded-md text-[11px] text-rose-700 dark:text-rose-300 bg-rose-50 dark:bg-rose-500/10 border border-rose-200 dark:border-rose-500/20">
                <Icons.AlertCircle size={12} className="shrink-0 mt-0.5" />
                <span>{error}</span>
              </div>
            )}
          </div>
        )}

        {/* Preview banner — appears when previewing=true. Renders the
            email/slack message exactly as it'll go out, with the
            recipient + subject + body laid out in a clean read-only
            block. The user can hit "Back to edit" or "Confirm send". */}
        {!sentResult && previewing && (
          <div className="mx-5 mb-2 p-3 rounded-lg border border-amber-300 dark:border-amber-500/40 bg-amber-50/60 dark:bg-amber-500/5">
            <div className="flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-wider text-amber-700 dark:text-amber-300 mb-2">
              <Icons.AlertCircle size={11} />
              Final review — this will be sent
            </div>
            <div className="text-[11px] text-zinc-600 dark:text-zinc-300 space-y-1">
              <div><strong>Sending via:</strong> {destination === 'email' ? 'Email (Gmail)' : 'Slack'}</div>
              {destination === 'email' ? (
                <div><strong>To:</strong> {to || <em className="text-rose-500">missing</em>}</div>
              ) : (
                <div><strong>Channel:</strong> {slackChannelId ? `#${slackChannels.find(c => c.id === slackChannelId)?.name || slackChannelId}` : <em className="text-rose-500">missing</em>}</div>
              )}
              {subject && <div><strong>Subject:</strong> {subject}</div>}
              <div className="mt-2 pt-2 border-t border-amber-200 dark:border-amber-500/20">
                <div className="text-[10px] uppercase tracking-wider text-amber-700 dark:text-amber-300 mb-1">Body</div>
                <div className="whitespace-pre-wrap text-zinc-700 dark:text-zinc-200 leading-relaxed max-h-48 overflow-y-auto">{body}</div>
              </div>
            </div>
          </div>
        )}

        {/* Footer */}
        {!sentResult && (
          <footer className="px-5 py-3 border-t border-zinc-100 dark:border-zinc-800/60 flex items-center gap-2">
            <span className="text-[10px] text-zinc-400 flex-1 truncate">
              {destination === 'email' ? 'Sends from your connected Gmail.' : 'Posts via your Slack bot.'}
            </span>
            {previewing ? (
              <>
                <button
                  onClick={() => setPreviewing(false)}
                  disabled={sending}
                  className="text-[11px] font-medium text-zinc-500 hover:text-zinc-900 dark:hover:text-zinc-100 px-2.5 py-1.5 disabled:opacity-30 inline-flex items-center gap-1"
                >
                  <Icons.ChevronLeft size={11} /> Back to edit
                </button>
                <button
                  onClick={send}
                  disabled={!canSend || sending}
                  className="px-3 py-1.5 rounded-md text-[11px] font-semibold text-white bg-emerald-600 hover:bg-emerald-700 disabled:opacity-40 disabled:cursor-not-allowed transition-opacity inline-flex items-center gap-1.5"
                >
                  {sending ? (
                    <>
                      <span className="w-2.5 h-2.5 border-2 border-white border-t-transparent rounded-full animate-spin" />
                      Sending…
                    </>
                  ) : (
                    <>
                      <Icons.Check size={11} /> Confirm send
                    </>
                  )}
                </button>
              </>
            ) : (
              <>
                <button
                  onClick={onClose}
                  disabled={sending}
                  className="text-[11px] font-medium text-zinc-500 hover:text-zinc-900 dark:hover:text-zinc-100 px-2.5 py-1.5 disabled:opacity-30"
                >Cancel</button>
                <button
                  onClick={() => setPreviewing(true)}
                  disabled={!canSend || sending}
                  className="px-3 py-1.5 rounded-md text-[11px] font-semibold text-white bg-zinc-900 dark:bg-zinc-100 dark:text-zinc-900 disabled:opacity-40 disabled:cursor-not-allowed hover:opacity-90 transition-opacity inline-flex items-center gap-1.5"
                >
                  <Icons.Eye size={11} /> Review &amp; send
                </button>
              </>
            )}
          </footer>
        )}
      </div>
    </div>,
    document.body
  );
};
