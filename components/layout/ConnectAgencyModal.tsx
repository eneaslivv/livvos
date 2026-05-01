import React, { useState, useCallback, useEffect } from 'react';
import { SlidePanel } from '../ui/SlidePanel';
import { Icons } from '../ui/Icons';
import { supabase } from '../../lib/supabase';
import { useTenant } from '../../context/TenantContext';
import { errorLogger } from '../../lib/errorLogger';
import { appUrl } from '../../lib/appUrl';

interface ConnectAgencyModalProps {
    isOpen: boolean;
    onClose: () => void;
    onConnectionCreated?: () => void;
}

type Step = 'form' | 'sharing';

export const ConnectAgencyModal: React.FC<ConnectAgencyModalProps> = ({
    isOpen,
    onClose,
    onConnectionCreated,
}) => {
    const { currentTenant } = useTenant();
    const [step, setStep] = useState<Step>('form');
    const [agencyName, setAgencyName] = useState('');
    const [ownerEmail, setOwnerEmail] = useState('');
    const [isSubmitting, setIsSubmitting] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [inviteToken, setInviteToken] = useState<string | null>(null);
    const [emailSent, setEmailSent] = useState(false);
    const [copied, setCopied] = useState(false);

    useEffect(() => {
        if (isOpen) {
            setStep('form');
            setAgencyName('');
            setOwnerEmail('');
            setError(null);
            setInviteToken(null);
            setEmailSent(false);
            setCopied(false);
        }
    }, [isOpen]);

    const inviteLink = inviteToken
        ? `${window.location.origin}/accept-connection?token=${inviteToken}`
        : '';

    const handleSubmit = useCallback(async (e: React.FormEvent) => {
        e.preventDefault();
        if (isSubmitting) return;
        if (!agencyName.trim() || !ownerEmail.trim()) return;

        setIsSubmitting(true);
        setError(null);

        try {
            const { data, error: rpcError } = await supabase.rpc('create_connection_invite', {
                p_invited_email: ownerEmail.trim().toLowerCase(),
                p_invited_agency_name: agencyName.trim(),
            });

            if (rpcError) throw rpcError;
            const row = Array.isArray(data) ? data[0] : data;
            if (!row?.invite_token) throw new Error('No token returned');

            setInviteToken(row.invite_token);

            // Best-effort email send (non-blocking — UI shows the link either way)
            try {
                const link = `${appUrl()}/accept-connection?token=${row.invite_token}`;
                const res = await fetch(
                    `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/send-invite-email`,
                    {
                        method: 'POST',
                        headers: {
                            'Content-Type': 'application/json',
                            'apikey': import.meta.env.VITE_SUPABASE_ANON_KEY,
                            'Authorization': `Bearer ${(await supabase.auth.getSession()).data.session?.access_token ?? ''}`,
                        },
                        body: JSON.stringify({
                            client_email: ownerEmail.trim().toLowerCase(),
                            client_name: agencyName.trim(),
                            invite_link: link,
                            tenant_name: currentTenant?.name,
                            tenant_id: currentTenant?.id,
                            invite_type: 'agency_connection',
                        }),
                    }
                );
                setEmailSent(res.ok);
            } catch {
                setEmailSent(false);
            }

            setStep('sharing');
            onConnectionCreated?.();
        } catch (err: any) {
            errorLogger.error('Failed to create connection invite:', err);
            setError(err?.message || 'Failed to create invite');
        } finally {
            setIsSubmitting(false);
        }
    }, [agencyName, ownerEmail, isSubmitting, currentTenant, onConnectionCreated]);

    const handleCopy = useCallback(() => {
        if (!inviteLink) return;
        navigator.clipboard.writeText(inviteLink).then(() => {
            setCopied(true);
            setTimeout(() => setCopied(false), 2000);
        });
    }, [inviteLink]);

    const footer = step === 'form' ? (
        <div className="flex justify-end gap-2">
            <button
                onClick={onClose}
                className="px-4 py-2 text-sm text-zinc-500 hover:text-zinc-900 dark:hover:text-zinc-200 rounded-lg"
            >
                Cancel
            </button>
            <button
                type="submit"
                form="connect-agency-form"
                disabled={!agencyName.trim() || !ownerEmail.trim() || isSubmitting}
                className="px-5 py-2 bg-zinc-900 dark:bg-white text-white dark:text-zinc-900 rounded-xl text-sm font-semibold hover:opacity-90 disabled:opacity-40 flex items-center gap-2"
            >
                {isSubmitting ? <Icons.Loader size={14} className="animate-spin" /> : <Icons.Send size={14} />}
                Send invite
            </button>
        </div>
    ) : (
        <div className="flex justify-end">
            <button
                onClick={onClose}
                className="px-5 py-2 bg-zinc-900 dark:bg-white text-white dark:text-zinc-900 rounded-xl text-sm font-semibold hover:opacity-90"
            >
                Done
            </button>
        </div>
    );

    return (
        <SlidePanel
            isOpen={isOpen}
            onClose={onClose}
            title="Connect a client agency"
            subtitle="Invite an agency to be managed from your super-agency dashboard"
            width="md"
            footer={footer}
        >
            <div className="p-5 space-y-5">
                {step === 'form' ? (
                    <form id="connect-agency-form" onSubmit={handleSubmit} className="space-y-5">
                        <div>
                            <label className="block text-[11px] font-semibold uppercase tracking-wider text-zinc-400 dark:text-zinc-500 mb-2">
                                Agency name
                            </label>
                            <input
                                type="text"
                                value={agencyName}
                                onChange={e => setAgencyName(e.target.value)}
                                placeholder="e.g., Kru Food"
                                autoFocus
                                className="w-full px-3 py-2.5 bg-zinc-50 dark:bg-zinc-950 border border-zinc-200 dark:border-zinc-800 rounded-xl outline-none focus:border-zinc-400 text-sm text-zinc-900 dark:text-zinc-100"
                            />
                        </div>

                        <div>
                            <label className="block text-[11px] font-semibold uppercase tracking-wider text-zinc-400 dark:text-zinc-500 mb-2">
                                Owner email
                            </label>
                            <input
                                type="email"
                                value={ownerEmail}
                                onChange={e => setOwnerEmail(e.target.value)}
                                placeholder="owner@kru.com"
                                className="w-full px-3 py-2.5 bg-zinc-50 dark:bg-zinc-950 border border-zinc-200 dark:border-zinc-800 rounded-xl outline-none focus:border-zinc-400 text-sm text-zinc-900 dark:text-zinc-100"
                            />
                            <p className="mt-2 text-xs text-zinc-500">
                                The owner of that agency must accept this invite from inside their workspace.
                            </p>
                        </div>

                        <div className="bg-zinc-50 dark:bg-zinc-950 border border-zinc-200 dark:border-zinc-800 rounded-xl p-4 space-y-2">
                            <div className="text-[11px] font-semibold uppercase tracking-wider text-zinc-400 dark:text-zinc-500">
                                What this enables
                            </div>
                            <ul className="text-xs text-zinc-600 dark:text-zinc-400 space-y-1.5">
                                <li className="flex items-start gap-2">
                                    <Icons.Check size={12} className="text-emerald-500 mt-0.5 shrink-0" />
                                    You can switch into their workspace as an admin
                                </li>
                                <li className="flex items-start gap-2">
                                    <Icons.Check size={12} className="text-emerald-500 mt-0.5 shrink-0" />
                                    Their team can mention you on tasks (mirroring coming soon)
                                </li>
                                <li className="flex items-start gap-2">
                                    <Icons.Close size={12} className="text-zinc-400 mt-0.5 shrink-0" />
                                    You will not see anything in their workspace they don't share
                                </li>
                            </ul>
                        </div>

                        {error && (
                            <div className="p-3 rounded-xl text-sm bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 text-red-700 dark:text-red-400 flex items-center gap-2">
                                <Icons.AlertCircle size={14} className="shrink-0" />
                                {error}
                            </div>
                        )}
                    </form>
                ) : (
                    <div className="space-y-5">
                        <div className="flex items-center gap-3 p-4 bg-emerald-50 dark:bg-emerald-900/20 border border-emerald-200 dark:border-emerald-800 rounded-xl">
                            <div className="w-10 h-10 rounded-full bg-emerald-100 dark:bg-emerald-800/40 flex items-center justify-center shrink-0">
                                <Icons.CheckCircle size={20} className="text-emerald-600 dark:text-emerald-400" />
                            </div>
                            <div>
                                <div className="text-sm font-semibold text-emerald-900 dark:text-emerald-200">
                                    Invite created
                                </div>
                                <div className="text-xs text-emerald-700 dark:text-emerald-300 mt-0.5">
                                    {emailSent
                                        ? `Email sent to ${ownerEmail}`
                                        : `Email could not be sent — share the link manually with ${ownerEmail}`}
                                </div>
                            </div>
                        </div>

                        <div>
                            <label className="block text-[11px] font-semibold uppercase tracking-wider text-zinc-400 dark:text-zinc-500 mb-2">
                                Invite link
                            </label>
                            <div className="flex gap-2">
                                <input
                                    type="text"
                                    value={inviteLink}
                                    readOnly
                                    onFocus={e => e.currentTarget.select()}
                                    className="flex-1 px-3 py-2.5 bg-zinc-50 dark:bg-zinc-950 border border-zinc-200 dark:border-zinc-800 rounded-xl text-xs text-zinc-700 dark:text-zinc-300 font-mono"
                                />
                                <button
                                    onClick={handleCopy}
                                    className="px-3 py-2.5 bg-zinc-900 dark:bg-white text-white dark:text-zinc-900 rounded-xl text-sm font-medium hover:opacity-90 flex items-center gap-1.5"
                                >
                                    {copied ? <Icons.Check size={14} /> : <Icons.Copy size={14} />}
                                    {copied ? 'Copied' : 'Copy'}
                                </button>
                            </div>
                        </div>

                        <p className="text-xs text-zinc-500">
                            The agency owner needs to be signed in to their own workspace, then open this link to accept.
                        </p>
                    </div>
                )}
            </div>
        </SlidePanel>
    );
};
