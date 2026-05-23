import React, { useState, useEffect, useRef, useCallback } from 'react';
import { Icons } from '../ui/Icons';
import { useTenant } from '../../context/TenantContext';
import { ConnectAgencyModal } from './ConnectAgencyModal';
import { supabase } from '../../lib/supabase';
import { appUrl } from '../../lib/appUrl';

interface PendingInvite {
  id: string;
  invited_email: string;
  invited_agency_name: string;
  token: string;
  status: string;
  created_at: string;
}

interface TenantSwitcherProps {
    expanded: boolean;
    isDarkMode: boolean;
    /** Optional — when provided, "Manage shared team" actions navigate to
     *  Tenant Settings via the App router instead of falling back to a
     *  hash mutation that the custom PageView routing wouldn't pick up. */
    onNavigate?: (page: import('../../types').PageView) => void;
}

// Friendly relative time for "Sent X ago" badges on pending invites.
function timeAgoShort(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime();
  const mins = Math.floor(diff / 60_000);
  if (mins < 1) return 'just now';
  if (mins < 60) return `${mins}m`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h`;
  const days = Math.floor(hrs / 24);
  if (days < 30) return `${days}d`;
  return new Date(iso).toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}

export const TenantSwitcher: React.FC<TenantSwitcherProps> = ({ expanded, isDarkMode, onNavigate }) => {
    const { currentTenant, memberships, switchTenant, refreshMemberships } = useTenant();
    const [isOpen, setIsOpen] = useState(false);
    const [isSwitching, setIsSwitching] = useState<string | null>(null);
    const [showConnectModal, setShowConnectModal] = useState(false);
    const [pendingInvites, setPendingInvites] = useState<PendingInvite[]>([]);
    const [copiedId, setCopiedId] = useState<string | null>(null);
    const [revokingId, setRevokingId] = useState<string | null>(null);
    const dropdownRef = useRef<HTMLDivElement>(null);

    // Load pending agency invites for the current super-agency tenant. The
    // dropdown otherwise hides them, so the user has no way to know that
    // someone hasn't accepted yet — surfacing them here is what they
    // expected when they said "the agency should appear".
    const loadPendingInvites = useCallback(async () => {
        if (!currentTenant?.id) return;
        const { data } = await supabase
          .from('tenant_connections')
          .select('id, invited_email, invited_agency_name, token, status, created_at')
          .eq('parent_tenant_id', currentTenant.id)
          .eq('status', 'pending')
          .order('created_at', { ascending: false });
        setPendingInvites((data as PendingInvite[]) || []);
    }, [currentTenant?.id]);
    useEffect(() => { if (isOpen) loadPendingInvites(); }, [isOpen, loadPendingInvites]);

    const copyInviteLink = async (invite: PendingInvite) => {
        const link = `${appUrl()}/accept-connection?token=${invite.token}`;
        try { await navigator.clipboard.writeText(link); } catch { /* clipboard blocked */ }
        setCopiedId(invite.id);
        setTimeout(() => setCopiedId(null), 1800);
    };

    const revokeInvite = async (invite: PendingInvite) => {
        if (!window.confirm(`Cancel the invitation to "${invite.invited_agency_name}" (${invite.invited_email})?`)) return;
        setRevokingId(invite.id);
        try {
            // Try the SECURITY DEFINER RPC first (cleanest path); fall back to
            // a direct status update if the RPC isn't available.
            const { error } = await supabase.rpc('revoke_connection', { p_connection_id: invite.id });
            if (error) {
                await supabase.from('tenant_connections').update({ status: 'revoked' }).eq('id', invite.id);
            }
            await loadPendingInvites();
        } finally {
            setRevokingId(null);
        }
    };

    useEffect(() => {
        if (!isOpen) return;
        const handleClickOutside = (e: MouseEvent) => {
            if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node)) {
                setIsOpen(false);
            }
        };
        document.addEventListener('mousedown', handleClickOutside);
        return () => document.removeEventListener('mousedown', handleClickOutside);
    }, [isOpen]);

    const handleSwitch = useCallback(async (tenantId: string) => {
        if (tenantId === currentTenant?.id) {
            setIsOpen(false);
            return;
        }
        setIsSwitching(tenantId);
        const ok = await switchTenant(tenantId);
        setIsSwitching(null);
        setIsOpen(false);
        if (ok) {
            // Reload to ensure all contexts refetch with new tenant_id
            window.location.reload();
        }
    }, [currentTenant?.id, switchTenant]);

    if (!currentTenant) return null;

    const isSuperAgency = currentTenant.is_super_agency === true;
    const isInChildTenant = !isSuperAgency && !!currentTenant.parent_tenant_id;
    const nativeMemberships = memberships.filter(m => m.source === 'native' || m.is_super_agency);
    const connectedAgencies = memberships.filter(m => m.source === 'connection');

    // Contrast-swap: light mode → show the WHITE version of the logo on
    // a dark circle; dark mode → show the DARK version on a white circle.
    // This keeps the logo always popping against its container.
    const logoSrc = isDarkMode
        ? (currentTenant.logo_url || currentTenant.logo_url_dark)    // dark logo (dark/black) on white circle
        : (currentTenant.logo_url_dark || currentTenant.logo_url);   // light logo (white) on dark circle

    return (
        <>
            <div className="relative w-[calc(100%-24px)] mx-3 mb-1.5 shrink-0" ref={dropdownRef}>
                {/* Minimal trigger — no border by default. Logo is bigger and
                    occupies the row; the recuadro shows up on hover so the
                    sidebar feels less boxy at rest. */}
                <button
                    onClick={() => setIsOpen(prev => !prev)}
                    className={`
                        group/sw w-full flex items-center gap-2 rounded-lg
                        border border-transparent hover:border-zinc-200 dark:hover:border-zinc-800
                        hover:bg-zinc-50 dark:hover:bg-zinc-800/40
                        transition-all
                        ${isInChildTenant ? 'ring-1 ring-amber-300 dark:ring-amber-700' : ''}
                        ${expanded ? 'px-1.5 py-1 justify-start' : 'p-0.5 justify-center'}
                    `}
                    title={expanded ? undefined : currentTenant.name}
                >
                    <div className={`relative flex items-center justify-center rounded-full shrink-0 overflow-hidden bg-zinc-900 dark:bg-white ${expanded ? 'w-11 h-11' : 'w-12 h-12'}`}>
                        {logoSrc ? (
                            <img src={logoSrc} alt={currentTenant.name} className="w-[70%] h-[70%] object-contain" />
                        ) : (
                            <span className="text-[13px] font-bold text-white dark:text-zinc-900 select-none">
                                {currentTenant.name.slice(0, 2).toUpperCase()}
                            </span>
                        )}
                    </div>
                    {expanded && (
                        <>
                            <div className="flex-1 min-w-0 text-left">
                                <div className="text-[12.5px] font-semibold text-zinc-900 dark:text-zinc-100 truncate leading-tight">
                                    {currentTenant.name}
                                </div>
                                <div className="text-[9px] uppercase tracking-wider text-zinc-400 dark:text-zinc-500 truncate leading-tight mt-0.5 opacity-0 group-hover/sw:opacity-100 transition-opacity">
                                    {isSuperAgency ? 'Super agency' : isInChildTenant ? 'Connected agency' : 'Workspace'}
                                </div>
                            </div>
                            <Icons.ChevronDown size={12} className="text-zinc-400 shrink-0 opacity-0 group-hover/sw:opacity-100 transition-opacity" />
                        </>
                    )}
                </button>

                {isOpen && (
                    <div className={`
                        absolute z-[60] mt-1.5 left-0 right-0 ${expanded ? 'w-full' : 'min-w-[240px]'}
                        bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800
                        rounded-xl shadow-xl shadow-zinc-200/60 dark:shadow-black/80
                        overflow-hidden
                    `}>
                        {/* Native workspaces */}
                        {nativeMemberships.length > 0 && (
                            <div className="p-1.5">
                                {nativeMemberships.map(m => (
                                    <TenantRow
                                        key={m.tenant_id}
                                        membership={m}
                                        isLoading={isSwitching === m.tenant_id}
                                        onClick={() => handleSwitch(m.tenant_id)}
                                    />
                                ))}
                            </div>
                        )}

                        {/* Connected agencies — accepted child workspaces.
                            Shows a green "Active" pill so the user knows
                            the difference vs. pending invites below.
                            Each row has an inline "Manage team" shortcut
                            into Tenant Settings → SharedTeamManager. */}
                        {connectedAgencies.length > 0 && (
                            <>
                                <div className="px-3 pt-2 pb-1 border-t border-zinc-100 dark:border-zinc-800 flex items-center justify-between">
                                    <div className="text-[10px] font-semibold uppercase tracking-wider text-zinc-400 dark:text-zinc-500">
                                        Connected agencies
                                    </div>
                                    <span className="text-[10px] font-semibold text-emerald-600 dark:text-emerald-400">
                                        {connectedAgencies.length} active
                                    </span>
                                </div>
                                <div className="p-1.5 pt-0">
                                    {connectedAgencies.map(m => (
                                        <ConnectedAgencyRow
                                            key={m.tenant_id}
                                            membership={m}
                                            isLoading={isSwitching === m.tenant_id}
                                            onSwitch={() => handleSwitch(m.tenant_id)}
                                            onManageTeam={() => {
                                                // SharedTeamManager lives inside Tenant
                                                // Settings. Use the App router (when
                                                // available) so the custom PageView
                                                // routing picks it up; otherwise the
                                                // hash fallback is harmless.
                                                if (onNavigate) onNavigate('tenant_settings');
                                                else window.location.hash = '#tenant_settings';
                                                setIsOpen(false);
                                            }}
                                        />
                                    ))}
                                </div>
                            </>
                        )}

                        {/* Pending invites — surfaced so the user can copy
                            the link, resend, or revoke an invitation that
                            hasn't been accepted yet. The amber "awaiting"
                            chip + relative time make the difference vs.
                            connected agencies obvious. */}
                        {isSuperAgency && pendingInvites.length > 0 && (
                            <>
                                <div className="px-3 pt-2 pb-1 border-t border-zinc-100 dark:border-zinc-800 flex items-center justify-between">
                                    <div className="text-[10px] font-semibold uppercase tracking-wider text-zinc-400 dark:text-zinc-500">
                                        Pending invitations
                                    </div>
                                    <span className="text-[10px] font-semibold text-amber-600 dark:text-amber-400">
                                        {pendingInvites.length} awaiting
                                    </span>
                                </div>
                                <div className="p-1.5 pt-0 space-y-0.5">
                                    {pendingInvites.map(inv => {
                                        const isCopied = copiedId === inv.id;
                                        const isRevoking = revokingId === inv.id;
                                        return (
                                            <div key={inv.id} className="group/inv flex items-center gap-2 px-2 py-1.5 rounded-md hover:bg-zinc-50 dark:hover:bg-zinc-800/60 transition-colors">
                                                <span className="w-6 h-6 rounded bg-amber-50 dark:bg-amber-500/10 ring-1 ring-amber-200 dark:ring-amber-500/30 flex items-center justify-center shrink-0">
                                                    <Icons.Mail size={11} className="text-amber-600 dark:text-amber-400" />
                                                </span>
                                                <div className="flex-1 min-w-0">
                                                    <div className="flex items-center gap-1.5">
                                                        <span className="text-xs font-medium text-zinc-800 dark:text-zinc-200 truncate leading-tight">
                                                            {inv.invited_agency_name}
                                                        </span>
                                                        <span className="text-[9px] font-semibold uppercase tracking-wider px-1 py-px rounded bg-amber-100 text-amber-700 dark:bg-amber-500/15 dark:text-amber-300 shrink-0">
                                                            sent {timeAgoShort(inv.created_at)}
                                                        </span>
                                                    </div>
                                                    <div className="text-[10px] text-zinc-400 dark:text-zinc-500 truncate font-mono leading-tight mt-0.5">
                                                        {inv.invited_email}
                                                    </div>
                                                </div>
                                                <div className="flex items-center gap-0.5 shrink-0">
                                                    <button
                                                        onClick={() => copyInviteLink(inv)}
                                                        title="Copy invite link"
                                                        className="p-1 rounded text-zinc-400 hover:text-zinc-700 dark:hover:text-zinc-200 hover:bg-zinc-100 dark:hover:bg-zinc-700 transition-colors"
                                                    >
                                                        {isCopied ? <Icons.Check size={11} className="text-emerald-500" /> : <Icons.Copy size={11} />}
                                                    </button>
                                                    <button
                                                        onClick={() => revokeInvite(inv)}
                                                        disabled={isRevoking}
                                                        title="Cancel invitation"
                                                        className="p-1 rounded text-zinc-400 hover:text-rose-500 hover:bg-rose-50 dark:hover:bg-rose-500/10 transition-colors disabled:opacity-40"
                                                    >
                                                        {isRevoking ? <Icons.Loader size={11} className="animate-spin" /> : <Icons.Close size={11} />}
                                                    </button>
                                                </div>
                                            </div>
                                        );
                                    })}
                                </div>
                            </>
                        )}

                        {/* Super-agency actions */}
                        {isSuperAgency && (
                            <div className="border-t border-zinc-100 dark:border-zinc-800 p-1.5 space-y-0.5">
                                <button
                                    onClick={() => {
                                        setShowConnectModal(true);
                                        setIsOpen(false);
                                    }}
                                    className="w-full flex items-center gap-2 px-3 py-2 rounded-lg text-sm text-zinc-600 dark:text-zinc-300 hover:bg-zinc-50 dark:hover:bg-zinc-800 transition-colors"
                                >
                                    <Icons.Plus size={14} />
                                    Connect a client agency
                                </button>
                                {connectedAgencies.length > 0 && (
                                    <button
                                        onClick={() => {
                                            // SharedTeamManager lives inside Tenant
                                            // Settings — that's the canonical place to
                                            // pick which of your team members get
                                            // access to each accepted child agency.
                                            if (onNavigate) onNavigate('tenant_settings');
                                            else window.location.hash = '#tenant_settings';
                                            setIsOpen(false);
                                        }}
                                        className="w-full flex items-center gap-2 px-3 py-2 rounded-lg text-sm text-zinc-600 dark:text-zinc-300 hover:bg-zinc-50 dark:hover:bg-zinc-800 transition-colors"
                                        title="Pick which of your team members have access to each connected agency"
                                    >
                                        <Icons.Users size={14} />
                                        Manage shared team
                                    </button>
                                )}
                            </div>
                        )}
                    </div>
                )}
            </div>

            <ConnectAgencyModal
                isOpen={showConnectModal}
                onClose={() => setShowConnectModal(false)}
                onConnectionCreated={() => refreshMemberships()}
            />
        </>
    );
};

const TenantRow: React.FC<{
    membership: import('../../context/TenantContext').TenantMembership;
    isLoading: boolean;
    onClick: () => void;
}> = ({ membership, isLoading, onClick }) => (
    <button
        onClick={onClick}
        disabled={isLoading}
        className={`
            w-full flex items-center gap-2 px-2 py-1.5 rounded-md text-left transition-colors
            ${membership.is_active
                ? 'bg-zinc-100 dark:bg-zinc-800'
                : 'hover:bg-zinc-50 dark:hover:bg-zinc-800/60'
            }
            disabled:opacity-50 disabled:cursor-wait
        `}
    >
        <div className="flex items-center justify-center w-6 h-6 rounded bg-white dark:bg-zinc-800 ring-1 ring-zinc-200/80 dark:ring-zinc-700 shrink-0 overflow-hidden">
            {membership.logo_url ? (
                <img src={membership.logo_url} alt="" className="w-full h-full object-contain p-0.5" />
            ) : (
                <span className="text-[9px] font-bold text-zinc-600 dark:text-zinc-400 select-none">
                    {membership.tenant_name.slice(0, 2).toUpperCase()}
                </span>
            )}
        </div>
        <div className="flex-1 min-w-0">
            <div className="text-xs font-medium text-zinc-900 dark:text-zinc-100 truncate leading-tight">
                {membership.tenant_name}
            </div>
            {membership.is_super_agency && (
                <div className="text-[9px] uppercase tracking-wider text-amber-600 dark:text-amber-400 leading-tight mt-0.5">
                    Super agency
                </div>
            )}
        </div>
        {isLoading ? (
            <Icons.Loader size={12} className="text-zinc-400 animate-spin shrink-0" />
        ) : membership.is_active ? (
            <Icons.Check size={12} className="text-emerald-500 shrink-0" />
        ) : null}
    </button>
);

// Variant of TenantRow for accepted CHILD agencies the parent owner can
// manage. Adds an inline "Manage team" button (hover-revealed) and an
// "Active" pill so the user clearly sees the difference between a
// connection that's live vs one that's still pending acceptance.
const ConnectedAgencyRow: React.FC<{
    membership: import('../../context/TenantContext').TenantMembership;
    isLoading: boolean;
    onSwitch: () => void;
    onManageTeam: () => void;
}> = ({ membership, isLoading, onSwitch, onManageTeam }) => (
    <div className={`group/row relative flex items-center gap-2 pl-2 pr-1.5 py-1.5 rounded-md transition-colors ${
        membership.is_active
            ? 'bg-zinc-100 dark:bg-zinc-800'
            : 'hover:bg-zinc-50 dark:hover:bg-zinc-800/60'
    }`}>
        <button
            onClick={onSwitch}
            disabled={isLoading}
            className="flex items-center gap-2 flex-1 min-w-0 disabled:opacity-50 disabled:cursor-wait text-left"
        >
            <div className="flex items-center justify-center w-6 h-6 rounded bg-white dark:bg-zinc-800 ring-1 ring-zinc-200/80 dark:ring-zinc-700 shrink-0 overflow-hidden">
                {membership.logo_url ? (
                    <img src={membership.logo_url} alt="" className="w-full h-full object-contain p-0.5" />
                ) : (
                    <span className="text-[9px] font-bold text-zinc-600 dark:text-zinc-400 select-none">
                        {membership.tenant_name.slice(0, 2).toUpperCase()}
                    </span>
                )}
            </div>
            <div className="flex-1 min-w-0">
                <div className="flex items-center gap-1.5">
                    <span className="text-xs font-medium text-zinc-900 dark:text-zinc-100 truncate leading-tight">
                        {membership.tenant_name}
                    </span>
                    <span className="text-[9px] font-semibold uppercase tracking-wider px-1 py-px rounded bg-emerald-100 text-emerald-700 dark:bg-emerald-500/15 dark:text-emerald-300 shrink-0">
                        active
                    </span>
                </div>
                <div className="text-[9px] uppercase tracking-wider text-zinc-400 dark:text-zinc-500 leading-tight mt-0.5">
                    Connected agency
                </div>
            </div>
        </button>
        <div className="flex items-center gap-0.5 shrink-0">
            <button
                onClick={(e) => { e.stopPropagation(); onManageTeam(); }}
                title="Manage shared team for this agency"
                className="p-1 rounded text-zinc-400 hover:text-zinc-700 dark:hover:text-zinc-200 hover:bg-zinc-200/70 dark:hover:bg-zinc-700 transition-colors opacity-0 group-hover/row:opacity-100 focus:opacity-100"
            >
                <Icons.Users size={11} />
            </button>
            {isLoading ? (
                <Icons.Loader size={12} className="text-zinc-400 animate-spin" />
            ) : membership.is_active ? (
                <Icons.Check size={12} className="text-emerald-500" />
            ) : null}
        </div>
    </div>
);
