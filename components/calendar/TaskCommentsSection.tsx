import React, { useState, useRef, useEffect, useMemo, useCallback } from 'react';
import { supabase } from '../../lib/supabase';
import { useTenant } from '../../context/TenantContext';
import { useTeam } from '../../context/TeamContext';
import { errorLogger } from '../../lib/errorLogger';
import { LinkifiedText } from '../ui/LinkifiedText';
import { Icons } from '../ui/Icons';
import { useTaskComments, TaskComment } from '../../hooks/useTaskComments';
import { useAuth } from '../../hooks/useAuth';
import {
  MentionPicker, detectMention, applyMention, renderMentionParts,
  type MentionState,
} from './MentionPicker';

interface TaskCommentsSectionProps {
  taskId: string;
  taskTitle?: string;
  taskOwnerId?: string;
  taskAssigneeId?: string;
  /** When provided, the component checks `project_agency_shares` to
   *  detect cross-tenant collaboration and renders explicit privacy
   *  hints — e.g. "Internal is private to your team, the partner
   *  agency can't see it." */
  taskProjectId?: string | null;
  /** The task's owning tenant — used to figure out whether the current
   *  user is on the OWNER side or the partner-agency side of a shared
   *  project. Defaults to currentTenant.id when omitted. */
  taskTenantId?: string | null;
}

interface ProjectShareInfo {
  isShared: boolean;
  /** If we're viewing from the partner side, the owner's tenant name. */
  ownerName: string | null;
  /** If we're viewing from the owner side, the names of partner agencies. */
  partnerNames: string[];
}

const formatTime = (dateStr: string): string => {
  const d = new Date(dateStr);
  return d.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', hour12: true });
};

const getDateLabel = (dateStr: string): string => {
  const d = new Date(dateStr);
  const today = new Date();
  const yesterday = new Date();
  yesterday.setDate(yesterday.getDate() - 1);

  if (d.toDateString() === today.toDateString()) return 'Today';
  if (d.toDateString() === yesterday.toDateString()) return 'Yesterday';
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
};

const groupByDate = (comments: TaskComment[]): Map<string, TaskComment[]> => {
  const groups = new Map<string, TaskComment[]>();
  for (const c of comments) {
    const key = new Date(c.created_at).toDateString();
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key)!.push(c);
  }
  return groups;
};

export const TaskCommentsSection: React.FC<TaskCommentsSectionProps> = ({ taskId, taskTitle, taskOwnerId, taskAssigneeId, taskProjectId, taskTenantId }) => {
  const { user } = useAuth();
  const { currentTenant } = useTenant();
  const { members } = useTeam();
  const taskInfo = useMemo(() => taskTitle ? { title: taskTitle, owner_id: taskOwnerId, assignee_id: taskAssigneeId, project_id: taskProjectId ?? null } : undefined, [taskTitle, taskOwnerId, taskAssigneeId, taskProjectId]);
  const { comments, loading, addComment } = useTaskComments(taskId, taskInfo);
  const [activeTab, setActiveTab] = useState<'internal' | 'client'>('internal');
  const [inputText, setInputText] = useState('');
  const [sending, setSending] = useState(false);
  const [uploadingImage, setUploadingImage] = useState(false);
  const [mention, setMention] = useState<MentionState | null>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  // Detect cross-tenant project share so we can render the right privacy
  // hint. We resolve from the partner side ("you're seeing this from
  // <agency> — Internal comments by <owner> are hidden") AND from the
  // owner side ("Internal stays private; Client is visible to <agency>").
  const [shareInfo, setShareInfo] = useState<ProjectShareInfo>({ isShared: false, ownerName: null, partnerNames: [] });
  useEffect(() => {
    if (!taskProjectId || !currentTenant?.id) {
      setShareInfo({ isShared: false, ownerName: null, partnerNames: [] });
      return;
    }
    let cancelled = false;
    (async () => {
      const { data } = await supabase
        .from('project_agency_shares')
        .select('owner_tenant_id, shared_with_tenant_id, owner:tenants!project_agency_shares_owner_tenant_id_fkey(name), partner:tenants!project_agency_shares_shared_with_tenant_id_fkey(name)')
        .eq('project_id', taskProjectId);
      if (cancelled) return;
      const rows = (data as any[]) || [];
      if (rows.length === 0) {
        setShareInfo({ isShared: false, ownerName: null, partnerNames: [] });
        return;
      }
      const viewingAsOwner = !!rows.find(r => r.owner_tenant_id === currentTenant.id);
      if (viewingAsOwner) {
        setShareInfo({
          isShared: true,
          ownerName: null,
          partnerNames: rows.map(r => r.partner?.name).filter(Boolean) as string[],
        });
      } else {
        const ownerRow = rows.find(r => r.shared_with_tenant_id === currentTenant.id);
        setShareInfo({
          isShared: true,
          ownerName: (ownerRow?.owner?.name as string) || null,
          partnerNames: [],
        });
      }
    })();
    return () => { cancelled = true; };
  }, [taskProjectId, currentTenant?.id]);

  // The partner-agency side can't post Internal comments (RLS blocks
  // it), so collapse the Internal tab and force them onto Client.
  const isPartnerView = shareInfo.isShared && !!shareInfo.ownerName;
  useEffect(() => {
    if (isPartnerView && activeTab === 'internal') setActiveTab('client');
  }, [isPartnerView, activeTab]);

  // Re-evaluate mention state any time the input or selection moves.
  const refreshMentionState = useCallback(() => {
    const ta = textareaRef.current;
    if (!ta) return;
    setMention(detectMention(ta));
  }, []);

  // Paste/drop/click an image → upload to tenant-assets/comment-attachments
  // and insert the public URL into the comment input as plain text. The
  // comment renderer below detects image URLs and renders them inline.
  const uploadAndInsert = useCallback(async (file: File) => {
    if (!currentTenant?.id || !file.type.startsWith('image/')) return;
    if (file.size > 10 * 1024 * 1024) { alert('Image too large (max 10MB)'); return; }
    setUploadingImage(true);
    try {
      const ext = file.name.split('.').pop() || 'png';
      const id = crypto.randomUUID();
      const path = `comment-attachments/${currentTenant.id}/${taskId}/${id}.${ext}`;
      const { error: upErr } = await supabase.storage.from('tenant-assets').upload(path, file, { upsert: true, contentType: file.type });
      if (upErr) { errorLogger.error('comment image upload', upErr); return; }
      const { data: urlData } = supabase.storage.from('tenant-assets').getPublicUrl(path);
      // Insert the URL on its own line so the renderer picks it up cleanly.
      setInputText(prev => (prev.trim() ? prev.replace(/\s*$/, '\n') : '') + urlData.publicUrl + '\n');
    } finally {
      setUploadingImage(false);
    }
  }, [currentTenant?.id, taskId]);

  const handlePaste = useCallback((e: React.ClipboardEvent<HTMLTextAreaElement>) => {
    const items = e.clipboardData?.items;
    if (!items) return;
    for (const it of items) {
      if (it.kind === 'file' && it.type.startsWith('image/')) {
        const f = it.getAsFile();
        if (f) { e.preventDefault(); uploadAndInsert(f); return; }
      }
    }
  }, [uploadAndInsert]);

  const filteredComments = useMemo(
    () => comments.filter(c => activeTab === 'internal' ? c.is_internal : !c.is_internal),
    [comments, activeTab]
  );

  const internalCount = useMemo(() => comments.filter(c => c.is_internal).length, [comments]);
  const clientCount = useMemo(() => comments.filter(c => !c.is_internal).length, [comments]);

  // Auto-scroll to bottom on new comments
  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [filteredComments.length]);

  const handleSend = async () => {
    if (!inputText.trim() || sending) return;
    const text = inputText;
    setInputText('');
    setSending(true);
    try {
      await addComment(text, activeTab === 'internal');
    } finally {
      setSending(false);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    // When the mention picker is open, let it consume Enter / Tab / arrows.
    if (mention && (e.key === 'Enter' || e.key === 'Tab' || e.key === 'ArrowUp' || e.key === 'ArrowDown' || e.key === 'Escape')) {
      return;
    }
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  const handlePickMention = useCallback((member: { id: string; name: string | null; email: string }) => {
    const ta = textareaRef.current;
    if (!ta || !mention) return;
    applyMention(ta, mention, { id: member.id, name: member.name || member.email }, setInputText);
    setMention(null);
  }, [mention]);

  const dateGroups = groupByDate(filteredComments);

  return (
    <div className="border-t border-zinc-100 dark:border-zinc-800 pt-4">
      {/* Header + tabs */}
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-1.5">
          <Icons.Message size={12} className="text-zinc-400" />
          <span className="text-[10px] font-medium text-zinc-400 uppercase tracking-wide">Comments</span>
        </div>
        <div className="flex items-center gap-1 bg-zinc-100 dark:bg-zinc-800 rounded-lg p-0.5">
          {/* Internal tab — hidden for partner-agency viewers (RLS blocks
              their access to is_internal=true rows anyway). */}
          {!isPartnerView && (
            <button
              onClick={() => setActiveTab('internal')}
              className={`px-2.5 py-1 rounded-md text-[10px] font-semibold transition-all ${
                activeTab === 'internal'
                  ? 'bg-white dark:bg-zinc-700 text-zinc-900 dark:text-zinc-100 shadow-sm'
                  : 'text-zinc-500 dark:text-zinc-400 hover:text-zinc-700 dark:hover:text-zinc-300'
              }`}
              title={shareInfo.isShared && shareInfo.partnerNames.length > 0
                ? `Internal: only your team. ${shareInfo.partnerNames.join(', ')} won't see these.`
                : 'Internal-only comments. Not visible to clients in the portal.'}
            >
              Internal{internalCount > 0 ? ` (${internalCount})` : ''}
            </button>
          )}
          <button
            onClick={() => setActiveTab('client')}
            className={`px-2.5 py-1 rounded-md text-[10px] font-semibold transition-all ${
              activeTab === 'client'
                ? 'bg-blue-500 text-white shadow-sm'
                : 'text-zinc-500 dark:text-zinc-400 hover:text-zinc-700 dark:hover:text-zinc-300'
            }`}
            title={shareInfo.isShared && shareInfo.partnerNames.length > 0
              ? `Visible to clients in the portal AND to ${shareInfo.partnerNames.join(', ')}.`
              : 'Visible to clients in the portal.'}
          >
            Client{clientCount > 0 ? ` (${clientCount})` : ''}
          </button>
        </div>
      </div>

      {/* Privacy hint banner — only on shared projects so the user knows
          who's reading what. Differentiates owner-side (Internal stays
          private) from partner-side (Internal is hidden by the owner). */}
      {shareInfo.isShared && (
        <div className={`mb-2.5 px-2.5 py-1.5 rounded-md text-[11px] leading-snug ${
          activeTab === 'internal'
            ? 'bg-amber-50 dark:bg-amber-500/10 text-amber-800 dark:text-amber-300 border border-amber-200/70 dark:border-amber-500/30'
            : 'bg-blue-50 dark:bg-blue-500/10 text-blue-800 dark:text-blue-300 border border-blue-200/70 dark:border-blue-500/30'
        }`}>
          {isPartnerView ? (
            <span className="inline-flex items-center gap-1.5">
              <Icons.Briefcase size={11} />
              You're viewing this from the partner side. Internal-only comments by{' '}
              <span className="font-semibold">{shareInfo.ownerName}</span> are kept private to their team.
            </span>
          ) : activeTab === 'internal' ? (
            <span className="inline-flex items-center gap-1.5">
              <Icons.Lock size={11} />
              Private to your team — <span className="font-semibold">{shareInfo.partnerNames.join(', ')}</span> can't see these.
            </span>
          ) : (
            <span className="inline-flex items-center gap-1.5">
              <Icons.Globe size={11} />
              Visible to clients in the portal AND to{' '}
              <span className="font-semibold">{shareInfo.partnerNames.join(', ')}</span> — write internal notes in the Internal tab.
            </span>
          )}
        </div>
      )}

      {/* Comments list */}
      <div
        ref={scrollRef}
        className="max-h-72 overflow-y-auto space-y-1 mb-2 scroll-smooth"
      >
        {loading ? (
          <div className="flex items-center justify-center py-6">
            <div className="w-4 h-4 border-2 border-zinc-300 border-t-zinc-600 rounded-full animate-spin" />
          </div>
        ) : filteredComments.length === 0 ? (
          <div className="flex flex-col items-center py-6 text-zinc-400">
            <Icons.Message size={20} className="mb-1.5 opacity-40" />
            <span className="text-[11px]">No {activeTab} comments yet</span>
          </div>
        ) : (
          Array.from(dateGroups.entries()).map(([dateKey, dayComments]) => (
            <div key={dateKey}>
              {/* Date separator */}
              <div className="flex items-center gap-2 py-1.5">
                <div className="flex-1 h-px bg-zinc-100 dark:bg-zinc-800" />
                <span className="text-[9px] font-medium text-zinc-400 dark:text-zinc-500">
                  {getDateLabel(dayComments[0].created_at)}
                </span>
                <div className="flex-1 h-px bg-zinc-100 dark:bg-zinc-800" />
              </div>
              {/* Comments for this date */}
              {dayComments.map(comment => {
                const isMe = comment.user_id === user?.id;
                return (
                  <div key={comment.id} className={`flex gap-2 py-1.5 px-1 rounded-lg ${
                    comment.id.startsWith('temp-') ? 'opacity-60' : ''
                  }`}>
                    {/* Avatar */}
                    {comment.user_avatar_url ? (
                      <img src={comment.user_avatar_url} alt="" className="w-6 h-6 rounded-full shrink-0 mt-0.5" />
                    ) : (
                      <div className={`w-6 h-6 rounded-full flex items-center justify-center shrink-0 mt-0.5 text-[9px] font-bold ${
                        isMe
                          ? 'bg-blue-100 dark:bg-blue-900/30 text-blue-700 dark:text-blue-300'
                          : 'bg-violet-100 dark:bg-violet-900/30 text-violet-700 dark:text-violet-300'
                      }`}>
                        {(comment.user_name || '?')[0]?.toUpperCase()}
                      </div>
                    )}
                    {/* Content */}
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-1.5">
                        <span className="text-[11px] font-semibold text-zinc-700 dark:text-zinc-300">
                          {isMe ? 'You' : (comment.user_name || 'Unknown')}
                        </span>
                        <span className="text-[9px] text-zinc-400 dark:text-zinc-500">
                          {formatTime(comment.created_at)}
                        </span>
                      </div>
                      <div className={`text-xs text-zinc-600 dark:text-zinc-400 mt-0.5 break-words ${
                        activeTab === 'client' ? 'bg-blue-50/50 dark:bg-blue-900/10 rounded px-1.5 py-1 -mx-1.5' : ''
                      }`}>
                        <CommentBody text={comment.comment} currentUserId={user?.id} />
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          ))
        )}
      </div>

      {/* Input — textarea so multi-line + image previews work; Enter sends,
          Shift+Enter adds a newline. Paste/drop/click an image to attach. */}
      <div
        onDragOver={(e) => e.preventDefault()}
        onDrop={(e) => {
          e.preventDefault();
          const f = e.dataTransfer.files?.[0];
          if (f) uploadAndInsert(f);
        }}
        className={`relative flex items-end gap-1.5 p-1.5 border rounded-lg transition-all ${
          activeTab === 'client'
            ? 'bg-blue-50/50 dark:bg-blue-900/10 border-blue-200 dark:border-blue-800 focus-within:border-blue-400'
            : 'bg-zinc-50 dark:bg-zinc-800/60 border-zinc-200 dark:border-zinc-700 focus-within:border-blue-400'
        }`}
      >
        <MentionPicker
          query={mention?.query || ''}
          members={members}
          excludeId={user?.id}
          open={!!mention}
          anchor={textareaRef.current}
          onPick={handlePickMention}
          onClose={() => setMention(null)}
        />
        <button
          type="button"
          onClick={() => fileInputRef.current?.click()}
          disabled={uploadingImage}
          title="Attach an image (or paste with ⌘V)"
          className="p-1.5 text-zinc-400 hover:text-zinc-700 dark:hover:text-zinc-200 hover:bg-zinc-100 dark:hover:bg-zinc-700 rounded-md transition-colors disabled:opacity-50"
        >
          {uploadingImage ? <div className="w-3 h-3 border-2 border-zinc-300 border-t-zinc-600 rounded-full animate-spin" /> : <Icons.Image size={14} />}
        </button>
        <input
          ref={fileInputRef}
          type="file"
          accept="image/*"
          className="hidden"
          onChange={(e) => { const f = e.target.files?.[0]; if (f) uploadAndInsert(f); e.currentTarget.value = ''; }}
        />
        <textarea
          ref={textareaRef}
          placeholder={activeTab === 'client' ? 'Comment for client — type @ to mention, ⌘V to paste images' : 'Internal comment — type @ to mention, ⌘V to paste images'}
          value={inputText}
          onChange={e => { setInputText(e.target.value); requestAnimationFrame(refreshMentionState); }}
          onKeyDown={handleKeyDown}
          onKeyUp={refreshMentionState}
          onClick={refreshMentionState}
          onSelect={refreshMentionState}
          onBlur={() => setTimeout(() => setMention(null), 150)}
          onPaste={handlePaste}
          rows={1}
          className={`flex-1 px-2 py-1 bg-transparent border-0 outline-none text-xs resize-none max-h-32 ${
            activeTab === 'client'
              ? 'placeholder:text-blue-300 dark:placeholder:text-blue-700'
              : 'placeholder:text-zinc-400'
          } text-zinc-700 dark:text-zinc-300`}
        />
        <button
          onClick={handleSend}
          disabled={!inputText.trim() || sending}
          className="px-2.5 py-1.5 bg-zinc-900 dark:bg-zinc-100 text-white dark:text-zinc-900 rounded-md text-[10px] font-semibold hover:bg-zinc-800 dark:hover:bg-zinc-200 disabled:opacity-30 transition-all"
        >
          {sending ? (
            <div className="w-3 h-3 border-2 border-white/30 border-t-white rounded-full animate-spin" />
          ) : (
            <Icons.Send size={12} />
          )}
        </button>
      </div>
    </div>
  );
};

// Renders a comment body. Pipeline:
//   1. Split by whitespace so URLs/words stay intact
//   2. Image URLs → inline thumbnail
//   3. Other URLs → clickable link
//   4. Plain words → run through `renderMentionParts` so `@[Name](uuid)`
//      tokens render as styled chips. Chips that match the current user
//      get a stronger amber treatment so it's obvious you've been pinged.
const IMAGE_URL_RE = /^(https?:\/\/[^\s]+\.(?:png|jpe?g|gif|webp|svg|avif)(?:\?[^\s]*)?)$/i
const URL_RE = /(https?:\/\/[^\s<>"]+[^\s<>".,;:!?)\]}])/g

const CommentBody: React.FC<{ text: string; currentUserId?: string | null }> = ({ text, currentUserId }) => {
  const parts = text.split(/(\s+)/);
  const inline: React.ReactNode[] = [];
  const nonImageUrls: string[] = [];

  const renderChip = (name: string, userId: string, key: string) => (
    <span
      key={key}
      className={`inline-flex items-center px-1 rounded text-[11px] font-semibold ${
        userId === currentUserId
          ? 'bg-amber-100 dark:bg-amber-500/20 text-amber-800 dark:text-amber-300 ring-1 ring-amber-300/60'
          : 'bg-violet-100 dark:bg-violet-500/15 text-violet-700 dark:text-violet-300'
      }`}
      title={`@${name}`}
    >
      @{name}
    </span>
  );

  parts.forEach((part, i) => {
    if (IMAGE_URL_RE.test(part)) {
      inline.push(
        <a key={i} href={part} target="_blank" rel="noreferrer noopener" className="block my-1.5 rounded-lg overflow-hidden border border-zinc-200 dark:border-zinc-700 max-w-[260px]">
          <img src={part} alt="" className="w-full h-auto block" />
        </a>
      );
    } else if (URL_RE.test(part)) {
      URL_RE.lastIndex = 0;
      nonImageUrls.push(part);
      inline.push(
        <a key={i} href={part} target="_blank" rel="noreferrer noopener" className="text-blue-600 dark:text-blue-400 underline decoration-blue-300/60 hover:decoration-blue-500 break-all">{part}</a>
      );
    } else if (part.includes('@[')) {
      // Token may contain one or more mentions. Hand off to the helper so
      // chips render in-place with the surrounding text preserved.
      const rendered = renderMentionParts(part, renderChip);
      rendered.forEach((node, idx) => inline.push(
        typeof node === 'string'
          ? <span key={`${i}-${idx}`} className="whitespace-pre-wrap">{node}</span>
          : <React.Fragment key={`${i}-${idx}`}>{node}</React.Fragment>
      ));
    } else {
      inline.push(<span key={i} className="whitespace-pre-wrap">{part}</span>);
    }
  });
  return (
    <>
      <div>{inline}</div>
      {nonImageUrls.length > 0 && (
        <LinkifiedText text={nonImageUrls.join(' ')} cardsOnly className="mt-1.5" />
      )}
    </>
  );
};
