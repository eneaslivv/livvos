import React, { useState, useEffect, useCallback } from 'react';
import { motion } from 'framer-motion';
import { Icons } from '../ui/Icons';
import { Project } from '../../context/ProjectsContext';
import { supabase } from '../../lib/supabase';

export interface ShareModalProps {
  project: Project;
  onClose: () => void;
  // Team invite
  inviteEmail: string;
  onInviteEmailChange: (val: string) => void;
  onInviteMember: () => void;
  // Client portal
  onInviteClientPortal: () => void;
  isInvitingClient: boolean;
  clientInviteLink: string | null;
  clientInviteError: string | null;
  // External sharing
  externalShareEmail: string;
  onExternalShareEmailChange: (val: string) => void;
  externalShareRole: 'viewer' | 'collaborator' | 'editor';
  onExternalShareRoleChange: (val: 'viewer' | 'collaborator' | 'editor') => void;
  externalShareLink: string | null;
  externalShareError: string | null;
  isCreatingShare: boolean;
  onCreateExternalShare: () => void;
  existingShares: any[];
  onRevokeShare: (shareId: string) => void;
}

/* ── Portal Link Section (self-contained) ── */
type PortalShareMode = 'disabled' | 'public' | 'request';
interface AccessRequest {
  id: string; name: string; email: string; message?: string;
  status: string; created_at: string;
}

export const PortalLinkSection: React.FC<{ project: Project }> = ({ project }) => {
  const [mode, setMode] = useState<PortalShareMode>('disabled');
  const [token, setToken] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [requests, setRequests] = useState<AccessRequest[]>([]);
  const [copied, setCopied] = useState(false);

  const loadPortalConfig = useCallback(async () => {
    setLoading(true);
    const { data } = await supabase
      .from('projects')
      .select('portal_share_mode, portal_share_token')
      .eq('id', project.id)
      .single();
    if (data) {
      setMode((data.portal_share_mode as PortalShareMode) || 'disabled');
      setToken(data.portal_share_token || null);
    }
    // Load pending requests
    const { data: reqs } = await supabase
      .from('portal_access_requests')
      .select('*')
      .eq('project_id', project.id)
      .eq('status', 'pending')
      .order('created_at', { ascending: false });
    if (reqs) setRequests(reqs);
    setLoading(false);
  }, [project.id]);

  useEffect(() => { loadPortalConfig(); }, [loadPortalConfig]);

  const handleModeChange = async (newMode: PortalShareMode) => {
    setSaving(true);
    setMode(newMode);
    const { data } = await supabase
      .from('projects')
      .update({ portal_share_mode: newMode })
      .eq('id', project.id)
      .select('portal_share_token')
      .single();
    if (data?.portal_share_token) setToken(data.portal_share_token);
    setSaving(false);
  };

  const handleCopy = () => {
    if (!token) return;
    const url = `${window.location.origin}/?public_portal=${token}`;
    navigator.clipboard.writeText(url);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const handleReview = async (requestId: string, status: 'approved' | 'rejected') => {
    await supabase.rpc('review_portal_request', { p_request_id: requestId, p_status: status });
    setRequests(prev => prev.filter(r => r.id !== requestId));
  };

  const getTimeAgo = (dateString: string): string => {
    const seconds = Math.floor((Date.now() - new Date(dateString).getTime()) / 1000);
    if (seconds < 60) return 'just now';
    if (seconds < 3600) return `${Math.floor(seconds / 60)}m ago`;
    if (seconds < 86400) return `${Math.floor(seconds / 3600)}h ago`;
    return `${Math.floor(seconds / 86400)}d ago`;
  };

  if (loading) {
    return (
      <div className="flex items-center gap-2 py-2">
        <div className="w-4 h-4 border-2 border-zinc-300 border-t-zinc-600 rounded-full animate-spin" />
        <span className="text-xs text-zinc-400">Loading...</span>
      </div>
    );
  }

  const portalUrl = token ? `${window.location.origin}/?public_portal=${token}` : null;

  return (
    <div className="space-y-3">
      {/* Mode toggle */}
      <div className="flex items-center gap-1 p-1 bg-zinc-100 dark:bg-zinc-900 rounded-lg">
        {(['disabled', 'public', 'request'] as const).map(m => (
          <button
            key={m}
            onClick={() => handleModeChange(m)}
            disabled={saving}
            className={`flex-1 px-2 py-1.5 text-xs font-medium rounded-md transition-all ${
              mode === m
                ? 'bg-white dark:bg-zinc-800 text-zinc-900 dark:text-zinc-100 shadow-sm'
                : 'text-zinc-500 hover:text-zinc-700 dark:hover:text-zinc-300'
            } disabled:opacity-50`}
          >
            {m === 'disabled' ? 'Disabled' : m === 'public' ? 'Public' : 'Request Access'}
          </button>
        ))}
      </div>

      {/* Description */}
      <p className="text-[10px] text-zinc-400">
        {mode === 'disabled' && 'Portal link is disabled. No one can access the project via link.'}
        {mode === 'public' && 'Anyone with the link can view the project portal without signing in.'}
        {mode === 'request' && 'Visitors must request access. You approve or reject from notifications.'}
      </p>

      {/* Link (when not disabled) */}
      {mode !== 'disabled' && portalUrl && (
        <div className="p-3 bg-zinc-50 dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-lg">
          <div className="flex items-center justify-between mb-1">
            <span className="text-[10px] font-bold text-zinc-400 uppercase tracking-wider">Portal Link</span>
            <button onClick={handleCopy} className="text-[10px] text-indigo-600 dark:text-indigo-400 font-medium hover:underline">
              {copied ? 'Copied!' : 'Copy'}
            </button>
          </div>
          <p className="text-xs text-zinc-600 dark:text-zinc-300 break-all font-mono">{portalUrl}</p>
        </div>
      )}

      {/* Pending requests (only in request mode) */}
      {mode === 'request' && requests.length > 0 && (
        <div className="space-y-1.5">
          <div className="text-[10px] font-bold text-zinc-400 uppercase tracking-wider">
            Pending Requests ({requests.length})
          </div>
          {requests.map(req => (
            <div key={req.id} className="p-2.5 bg-zinc-50 dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-lg">
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0 flex-1">
                  <p className="text-xs font-medium text-zinc-800 dark:text-zinc-200">{req.name}</p>
                  <p className="text-[10px] text-zinc-500 truncate">{req.email}</p>
                  {req.message && (
                    <p className="text-[10px] text-zinc-400 mt-1 italic line-clamp-2">"{req.message}"</p>
                  )}
                  <p className="text-[10px] text-zinc-400 mt-0.5">{getTimeAgo(req.created_at)}</p>
                </div>
                <div className="flex items-center gap-1 shrink-0">
                  <button
                    onClick={() => handleReview(req.id, 'approved')}
                    className="p-1.5 rounded-lg bg-emerald-50 dark:bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 hover:bg-emerald-100 dark:hover:bg-emerald-500/20 transition-colors"
                    title="Approve"
                  >
                    <Icons.Check size={14} />
                  </button>
                  <button
                    onClick={() => handleReview(req.id, 'rejected')}
                    className="p-1.5 rounded-lg bg-rose-50 dark:bg-rose-500/10 text-rose-600 dark:text-rose-400 hover:bg-rose-100 dark:hover:bg-rose-500/20 transition-colors"
                    title="Reject"
                  >
                    <Icons.Close size={14} />
                  </button>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
};

export const ShareModal: React.FC<ShareModalProps> = ({
  project,
  onClose,
  inviteEmail,
  onInviteEmailChange,
  onInviteMember,
  onInviteClientPortal,
  isInvitingClient,
  clientInviteLink,
  clientInviteError,
  externalShareEmail,
  onExternalShareEmailChange,
  externalShareRole,
  onExternalShareRoleChange,
  externalShareLink,
  externalShareError,
  isCreatingShare,
  onCreateExternalShare,
  existingShares,
  onRevokeShare,
}) => {
  return (
    <motion.div
      initial={{ height: 0, opacity: 0 }}
      animate={{ height: 'auto', opacity: 1 }}
      exit={{ height: 0, opacity: 0 }}
      transition={{ duration: 0.2 }}
      className="overflow-hidden border-b border-zinc-100 dark:border-zinc-800"
    >
      <div className="px-8 py-4">
        <div className="max-w-lg p-5 bg-white dark:bg-zinc-950 border border-zinc-200 dark:border-zinc-800 rounded-xl shadow-sm">
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-sm font-bold text-zinc-900 dark:text-zinc-100">Share Project</h3>
            <button onClick={onClose} className="text-zinc-400 hover:text-zinc-900 dark:hover:text-zinc-100"><Icons.Close size={16} /></button>
          </div>
          <div className="mb-5">
            <div className="text-[10px] font-bold text-zinc-400 uppercase tracking-wider mb-2">Invite Team Member</div>
            <div className="flex items-center gap-2">
              <input value={inviteEmail} onChange={e => onInviteEmailChange(e.target.value)} placeholder="team@company.com"
                className="flex-1 px-3 py-2 bg-zinc-50 dark:bg-zinc-950 border border-zinc-200 dark:border-zinc-800 rounded-lg text-sm" />
              <button onClick={onInviteMember} className="px-3 py-2 text-sm bg-zinc-900 dark:bg-zinc-100 text-white dark:text-zinc-900 rounded-lg font-medium">Invite</button>
            </div>
            <p className="text-[10px] text-zinc-400 mt-1.5">The user must have an active account in the system.</p>
          </div>
          <div className="border-t border-zinc-100 dark:border-zinc-800 my-4" />
          <div>
            <div className="text-[10px] font-bold text-zinc-400 uppercase tracking-wider mb-2">Client Portal Access</div>
            {project.client_id ? (
              <div className="space-y-3">
                <div className="flex items-center gap-2 p-3 bg-emerald-50 dark:bg-emerald-500/5 border border-emerald-200 dark:border-emerald-500/20 rounded-lg">
                  <div className="w-2 h-2 rounded-full bg-emerald-500" />
                  <span className="text-xs text-emerald-700 dark:text-emerald-400 font-medium">Client linked to this project</span>
                </div>
                <div className="flex items-center gap-2">
                  <button onClick={onInviteClientPortal} disabled={isInvitingClient}
                    className="flex-1 px-3 py-2 text-sm bg-zinc-900 dark:bg-zinc-100 text-white dark:text-zinc-900 rounded-lg font-medium disabled:opacity-60">
                    {isInvitingClient ? 'Generating...' : 'Generate Invite Link'}
                  </button>
                  <button onClick={() => window.open(`/?portal=client&projectId=${project.id}`, '_blank')}
                    className="px-3 py-2 text-sm border border-zinc-200 dark:border-zinc-700 rounded-lg hover:bg-zinc-50 dark:hover:bg-zinc-800">
                    Open Portal
                  </button>
                </div>
                <p className="text-[10px] text-zinc-400">The client will receive a link to register. Their access is private and secure.</p>
                {clientInviteError && <p className="text-xs text-rose-600">{clientInviteError}</p>}
                {clientInviteLink && (
                  <div className="p-3 bg-zinc-50 dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-lg">
                    <div className="flex items-center justify-between mb-1">
                      <span className="text-[10px] font-bold text-zinc-400 uppercase tracking-wider">Invitation Link</span>
                      <button onClick={() => { navigator.clipboard.writeText(clientInviteLink); }}
                        className="text-[10px] text-indigo-600 dark:text-indigo-400 font-medium hover:underline">Copy</button>
                    </div>
                    <p className="text-xs text-zinc-600 dark:text-zinc-300 break-all font-mono">{clientInviteLink}</p>
                  </div>
                )}
              </div>
            ) : (
              <div className="p-3 bg-amber-50 dark:bg-amber-500/5 border border-amber-200 dark:border-amber-500/20 rounded-lg">
                <p className="text-xs text-amber-700 dark:text-amber-400 font-medium mb-1">No client linked</p>
                <p className="text-[10px] text-amber-600 dark:text-amber-500">Assign a client from Settings to enable the portal.</p>
              </div>
            )}
          </div>

          {/* External Sharing */}
          <div className="border-t border-zinc-100 dark:border-zinc-800 my-4" />
          <div>
            <div className="text-[10px] font-bold text-zinc-400 uppercase tracking-wider mb-2">Share with External People</div>
            <div className="flex items-center gap-2 mb-2">
              <input
                value={externalShareEmail}
                onChange={e => { onExternalShareEmailChange(e.target.value); }}
                placeholder="person@email.com"
                className="flex-1 px-3 py-2 bg-zinc-50 dark:bg-zinc-950 border border-zinc-200 dark:border-zinc-800 rounded-lg text-sm"
              />
              <select
                value={externalShareRole}
                onChange={e => onExternalShareRoleChange(e.target.value as any)}
                className="px-2 py-2 bg-zinc-50 dark:bg-zinc-950 border border-zinc-200 dark:border-zinc-800 rounded-lg text-xs"
              >
                <option value="viewer">Viewer</option>
                <option value="collaborator">Collaborator</option>
                <option value="editor">Editor</option>
              </select>
              <button
                onClick={onCreateExternalShare}
                disabled={isCreatingShare || !externalShareEmail.trim()}
                className="px-3 py-2 text-sm bg-zinc-900 dark:bg-zinc-100 text-white dark:text-zinc-900 rounded-lg font-medium disabled:opacity-50"
              >
                {isCreatingShare ? '...' : 'Share'}
              </button>
            </div>
            <p className="text-[10px] text-zinc-400 mb-2">The person will receive a link to create an account and view the project.</p>
            {externalShareError && <p className="text-xs text-rose-600 mb-2">{externalShareError}</p>}
            {externalShareLink && (
              <div className="p-3 bg-zinc-50 dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-lg mb-3">
                <div className="flex items-center justify-between mb-1">
                  <span className="text-[10px] font-bold text-zinc-400 uppercase tracking-wider">Share Link</span>
                  <button onClick={() => { navigator.clipboard.writeText(externalShareLink); }} className="text-[10px] text-indigo-600 dark:text-indigo-400 font-medium hover:underline">Copy</button>
                </div>
                <p className="text-xs text-zinc-600 dark:text-zinc-300 break-all font-mono">{externalShareLink}</p>
              </div>
            )}
            {/* Existing shares list */}
            {existingShares.length > 0 && (
              <div className="space-y-1.5 mt-3">
                <div className="text-[10px] font-bold text-zinc-400 uppercase tracking-wider">Active Shares</div>
                {existingShares.map(share => (
                  <div key={share.id} className="flex items-center justify-between p-2 bg-zinc-50 dark:bg-zinc-900 border border-zinc-100 dark:border-zinc-800 rounded-lg">
                    <div className="flex items-center gap-2 min-w-0">
                      <div className="w-6 h-6 rounded-full bg-zinc-200 dark:bg-zinc-700 flex items-center justify-center text-[10px] font-bold text-zinc-500 dark:text-zinc-400 shrink-0">
                        {share.email?.[0]?.toUpperCase() || '?'}
                      </div>
                      <div className="min-w-0">
                        <p className="text-xs text-zinc-700 dark:text-zinc-300 truncate">{share.email}</p>
                        <p className="text-[10px] text-zinc-400">{share.role} · {share.status}</p>
                      </div>
                    </div>
                    <button
                      onClick={() => onRevokeShare(share.id)}
                      className="text-[10px] text-rose-500 hover:text-rose-600 font-medium shrink-0 ml-2"
                    >
                      Revoke
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Portal Link */}
          <div className="border-t border-zinc-100 dark:border-zinc-800 my-4" />
          <div>
            <div className="text-[10px] font-bold text-zinc-400 uppercase tracking-wider mb-2">Portal Link</div>
            <PortalLinkSection project={project} />
          </div>
        </div>
      </div>
    </motion.div>
  );
};
