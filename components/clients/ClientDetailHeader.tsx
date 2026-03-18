import React, { useState } from 'react';
import { Icons } from '../ui/Icons';
import { Client } from '../../hooks/useClients';
import { colorToBg } from '../ui/ColorPalette';

const statusConfig = {
  active:   { label: 'Active',   bg: 'bg-emerald-50 dark:bg-emerald-500/10', text: 'text-emerald-600 dark:text-emerald-400', dot: 'bg-emerald-500' },
  prospect: { label: 'Prospect', bg: 'bg-amber-50 dark:bg-amber-500/10',     text: 'text-amber-600 dark:text-amber-400',     dot: 'bg-amber-500' },
  inactive: { label: 'Inactive', bg: 'bg-zinc-100 dark:bg-zinc-800',         text: 'text-zinc-500 dark:text-zinc-400',       dot: 'bg-zinc-400' },
} as const;

const getInitials = (name: string) => {
  const parts = name.trim().split(/\s+/);
  return parts.length > 1 ? `${parts[0][0]}${parts[1][0]}`.toUpperCase() : name.slice(0, 2).toUpperCase();
};

const fmtMoney = (v: number) => `$${v.toLocaleString()}`;

interface ClientDetailHeaderProps {
  client: Client;
  editingField: string | null;
  editDraft: Record<string, string>;
  clientFinanceSummary: {
    totalInvoiced: number;
    totalPaid: number;
    totalPending: number;
  };
  clientInviteStatus: 'none' | 'pending' | 'accepted';
  portalInviteLink: string | null;
  portalInviteError: string | null;
  isInvitingPortal: boolean;
  emailSent: boolean | null;
  isUploadingLogo?: boolean;
  onEditField: (field: string) => void;
  onEditDraftChange: (draft: Record<string, string>) => void;
  onCancelEdit: () => void;
  onInlineEdit: (field: string) => Promise<boolean>;
  onUpdateStatus: (status: string) => void;
  onDelete: () => void;
  onInvitePortal: () => void;
  onUploadLogo?: (file: File) => void;
  onRemoveLogo?: () => void;
}

export const ClientDetailHeader: React.FC<ClientDetailHeaderProps> = ({
  client,
  editingField,
  editDraft,
  clientFinanceSummary,
  clientInviteStatus,
  portalInviteLink,
  portalInviteError,
  isInvitingPortal,
  emailSent,
  onEditField,
  onEditDraftChange,
  onCancelEdit,
  onInlineEdit,
  onUpdateStatus,
  onDelete,
  onInvitePortal,
  onUploadLogo,
  onRemoveLogo,
  isUploadingLogo,
}) => {
  const [savedField, setSavedField] = useState<string | null>(null);

  const handleSave = async (field: string) => {
    const ok = await onInlineEdit(field);
    if (ok) {
      setSavedField(field);
      setTimeout(() => setSavedField(null), 1500);
    }
  };

  return (
    <div className="p-5 border-b border-zinc-100 dark:border-zinc-800/60">
      <div className="flex items-start justify-between">
        <div className="flex items-center gap-4">
          <div className="relative group/avatar">
            <div
              className={`w-12 h-12 rounded-full flex items-center justify-center text-sm font-bold overflow-hidden ${
                client.color
                  ? ''
                  : 'bg-gradient-to-br from-zinc-200 to-zinc-300 dark:from-zinc-700 dark:to-zinc-600 text-zinc-600 dark:text-zinc-300'
              }`}
              style={client.color ? {
                backgroundColor: colorToBg(client.color, 0.15),
                color: client.color,
              } : undefined}
            >
              {client.avatar_url ? (
                <img src={client.avatar_url} alt="" className="w-12 h-12 object-contain p-1" />
              ) : getInitials(client.name)}
            </div>
            {onUploadLogo && (
              <label className="absolute inset-0 flex items-center justify-center bg-black/50 rounded-full opacity-0 group-hover/avatar:opacity-100 cursor-pointer transition-opacity">
                {isUploadingLogo ? (
                  <Icons.Loader size={14} className="text-white animate-spin" />
                ) : (
                  <Icons.Upload size={14} className="text-white" />
                )}
                <input
                  type="file"
                  accept="image/png,image/jpeg,image/webp"
                  className="hidden"
                  disabled={isUploadingLogo}
                  onChange={(e) => {
                    const file = e.target.files?.[0];
                    if (file) onUploadLogo(file);
                    e.target.value = '';
                  }}
                />
              </label>
            )}
            {client.avatar_url && onRemoveLogo && (
              <button
                onClick={onRemoveLogo}
                className="absolute -top-1 -right-1 w-4 h-4 bg-rose-500 text-white rounded-full flex items-center justify-center opacity-0 group-hover/avatar:opacity-100 transition-opacity hover:bg-rose-600"
                title="Remove logo"
              >
                <Icons.X size={8} />
              </button>
            )}
          </div>
          <div>
            {editingField === 'name' ? (
              <div className="flex items-center gap-1.5">
                <input
                  autoFocus
                  className="text-lg font-semibold text-zinc-900 dark:text-zinc-100 bg-white dark:bg-zinc-800 border-2 border-indigo-400 dark:border-indigo-500 rounded-lg outline-none px-2.5 py-1 ring-2 ring-indigo-100 dark:ring-indigo-900/30"
                  value={editDraft['name'] || ''}
                  onChange={e => onEditDraftChange({ ...editDraft, name: e.target.value })}
                  onKeyDown={async e => {
                    if (e.key === 'Enter') await handleSave('name');
                    if (e.key === 'Escape') onCancelEdit();
                  }}
                />
                <button
                  onClick={() => handleSave('name')}
                  className="p-1.5 bg-emerald-500 hover:bg-emerald-600 text-white rounded-lg transition-colors"
                  title="Save"
                >
                  <Icons.CheckCircle size={16} />
                </button>
                <button
                  onClick={onCancelEdit}
                  className="p-1.5 text-zinc-400 hover:text-zinc-600 hover:bg-zinc-100 dark:hover:bg-zinc-800 rounded-lg transition-colors"
                  title="Cancel (Esc)"
                >
                  <Icons.X size={16} />
                </button>
              </div>
            ) : savedField === 'name' ? (
              <div className="flex items-center gap-2">
                <h2 className="text-lg font-semibold text-emerald-600">{client.name}</h2>
                <span className="text-xs text-emerald-500 font-medium flex items-center gap-1">
                  <Icons.CheckCircle size={13} /> Saved
                </span>
              </div>
            ) : (
              <div className="flex items-center gap-1.5 group/name">
                <h2
                  className="text-lg font-semibold text-zinc-900 dark:text-zinc-100 cursor-pointer hover:text-indigo-600 dark:hover:text-indigo-400 transition-colors"
                  onClick={() => { onEditField('name'); onEditDraftChange({ ...editDraft, name: client.name || '' }); }}
                >{client.name}</h2>
                <button
                  onClick={() => { onEditField('name'); onEditDraftChange({ ...editDraft, name: client.name || '' }); }}
                  className="p-1 text-zinc-300 hover:text-zinc-500 opacity-0 group-hover/name:opacity-100 transition-all"
                  title="Edit name"
                >
                  <Icons.Edit size={13} />
                </button>
              </div>
            )}
            <div className="flex items-center gap-2 mt-0.5">
              {client.company && (
                <span className="text-xs text-zinc-500 dark:text-zinc-400">{client.company}</span>
              )}
              {client.company && client.email && <span className="text-zinc-300 dark:text-zinc-600">·</span>}
              {client.email && (
                <span className="text-xs text-zinc-400">{client.email}</span>
              )}
            </div>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <select
            value={client.status}
            onChange={(e) => onUpdateStatus(e.target.value)}
            className={`px-3 py-1.5 rounded-lg text-[11px] font-semibold border-0 outline-none cursor-pointer ${statusConfig[client.status]?.bg} ${statusConfig[client.status]?.text}`}
          >
            <option value="prospect">Prospect</option>
            <option value="active">Active</option>
            <option value="inactive">Inactive</option>
          </select>
          <button
            onClick={onDelete}
            className="p-1.5 text-zinc-400 hover:text-rose-600 dark:hover:text-rose-400 rounded-lg hover:bg-rose-50 dark:hover:bg-rose-500/10 transition-all"
            title="Delete client"
          >
            <Icons.Trash size={15} />
          </button>
        </div>
      </div>

      {/* Finance summary cards in header */}
      {clientFinanceSummary.totalInvoiced > 0 && (
        <div className="grid grid-cols-3 gap-2 mt-4">
          <div className="p-2.5 bg-zinc-50 dark:bg-zinc-800/40 rounded-xl">
            <p className="text-[9px] font-semibold text-zinc-400 uppercase tracking-wider">Invoiced</p>
            <p className="text-sm font-bold text-zinc-900 dark:text-zinc-100 mt-0.5">{fmtMoney(clientFinanceSummary.totalInvoiced)}</p>
          </div>
          <div className="p-2.5 bg-emerald-50/70 dark:bg-emerald-500/10 rounded-xl">
            <p className="text-[9px] font-semibold text-emerald-600/60 uppercase tracking-wider">Collected</p>
            <p className="text-sm font-bold text-emerald-700 dark:text-emerald-400 mt-0.5">{fmtMoney(clientFinanceSummary.totalPaid)}</p>
          </div>
          <div className="p-2.5 bg-amber-50/70 dark:bg-amber-500/10 rounded-xl">
            <p className="text-[9px] font-semibold text-amber-600/60 uppercase tracking-wider">Pending</p>
            <p className="text-sm font-bold text-amber-700 dark:text-amber-400 mt-0.5">{fmtMoney(clientFinanceSummary.totalPending)}</p>
          </div>
        </div>
      )}

      {/* Portal Access Card */}
      <div className={`mt-4 p-4 rounded-xl border ${
        clientInviteStatus === 'accepted'
          ? 'bg-gradient-to-r from-emerald-50/80 to-teal-50/80 dark:from-emerald-950/20 dark:to-teal-950/20 border-emerald-200 dark:border-emerald-900/30'
          : clientInviteStatus === 'pending'
          ? 'bg-gradient-to-r from-amber-50/80 to-orange-50/80 dark:from-amber-950/20 dark:to-orange-950/20 border-amber-200 dark:border-amber-900/30'
          : 'bg-gradient-to-r from-indigo-50/80 to-violet-50/80 dark:from-indigo-950/30 dark:to-violet-950/30 border-indigo-100 dark:border-indigo-900/30'
      }`}>
        <div className="flex items-center justify-between mb-2">
          <div className="flex items-center gap-2">
            <Icons.External size={14} className={clientInviteStatus === 'accepted' ? 'text-emerald-500' : clientInviteStatus === 'pending' ? 'text-amber-500' : 'text-indigo-500'} />
            <h4 className={`text-xs font-bold uppercase tracking-wider ${
              clientInviteStatus === 'accepted' ? 'text-emerald-700 dark:text-emerald-400'
              : clientInviteStatus === 'pending' ? 'text-amber-700 dark:text-amber-400'
              : 'text-indigo-700 dark:text-indigo-400'
            }`}>Client Portal</h4>
          </div>
          {clientInviteStatus === 'accepted' && (
            <span className="text-[10px] font-semibold text-emerald-600 dark:text-emerald-400 bg-emerald-100 dark:bg-emerald-500/15 px-2.5 py-0.5 rounded-full flex items-center gap-1">
              <Icons.CheckCircle size={10} /> Active
            </span>
          )}
          {clientInviteStatus === 'pending' && (
            <span className="text-[10px] font-semibold text-amber-600 dark:text-amber-400 bg-amber-100 dark:bg-amber-500/15 px-2.5 py-0.5 rounded-full flex items-center gap-1">
              <Icons.Clock size={10} /> Pending
            </span>
          )}
        </div>

        {/* Status: No invitation yet */}
        {clientInviteStatus === 'none' && (
          <div>
            <p className="text-xs text-zinc-500 dark:text-zinc-400 mb-3">
              {client.email
                ? 'Invite the client so they can see their project progress, files and communicate.'
                : 'Add an email to the client to invite them to the portal.'}
            </p>
            <div className="flex items-center gap-2">
              <button
                onClick={() => window.open(`/?portal=client&clientId=${client.id}`, '_blank')}
                className="flex items-center gap-1.5 px-4 py-2 text-xs font-semibold text-indigo-600 dark:text-indigo-400 border border-indigo-200 dark:border-indigo-800 rounded-lg hover:bg-indigo-50 dark:hover:bg-indigo-950/30 transition-all"
              >
                <Icons.External size={13} /> Preview portal
              </button>
              <button
                onClick={onInvitePortal}
                disabled={!client.email || isInvitingPortal}
                className="flex items-center gap-2 px-4 py-2 text-xs font-semibold bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 disabled:opacity-40 disabled:cursor-not-allowed transition-all"
              >
                {isInvitingPortal ? (
                  <><Icons.Loader size={13} className="animate-spin" /> Generating invitation...</>
                ) : (
                  <><Icons.Send size={13} /> Invite to portal</>
                )}
              </button>
            </div>
          </div>
        )}

        {/* Status: Pending */}
        {clientInviteStatus === 'pending' && (
          <div className="space-y-2.5">
            <p className="text-xs text-amber-700/80 dark:text-amber-400/80">
              Invitation sent. The client hasn't created their account yet.
            </p>
            {emailSent === true && (
              <div className="flex items-center gap-2 text-xs text-emerald-700 dark:text-emerald-400 bg-emerald-50/80 dark:bg-emerald-500/10 px-3 py-2 rounded-lg">
                <Icons.CheckCircle size={14} className="shrink-0" />
                <span>Email sent to <strong>{client.email}</strong></span>
              </div>
            )}
            {emailSent === false && (
              <div className="flex items-center gap-2 text-xs text-rose-700 dark:text-rose-400 bg-rose-50/80 dark:bg-rose-500/10 px-3 py-2 rounded-lg">
                <Icons.AlertCircle size={14} className="shrink-0" />
                <span>Could not send the email. Copy the link manually.</span>
              </div>
            )}
            {portalInviteLink && (
              <div className="flex items-center gap-2">
                <input type="text" readOnly value={portalInviteLink}
                  className="flex-1 px-3 py-2 text-xs bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-700 rounded-lg text-zinc-600 dark:text-zinc-400 select-all"
                  onClick={(e) => (e.target as HTMLInputElement).select()} />
                <button onClick={() => navigator.clipboard.writeText(portalInviteLink)}
                  className="px-3 py-2 text-xs font-semibold bg-zinc-900 dark:bg-zinc-100 text-white dark:text-zinc-900 rounded-lg hover:bg-zinc-800 dark:hover:bg-zinc-200 transition-colors shrink-0">
                  Copy link
                </button>
              </div>
            )}
            <div className="flex items-center gap-2">
              <button onClick={() => window.open(`/?portal=client&clientId=${client.id}`, '_blank')}
                className="flex items-center gap-1.5 px-3 py-1.5 text-[11px] font-medium text-indigo-600 dark:text-indigo-400 border border-indigo-200 dark:border-indigo-800 rounded-lg hover:bg-indigo-50 dark:hover:bg-indigo-950/30 transition-colors">
                <Icons.External size={12} /> Preview
              </button>
              <button onClick={onInvitePortal} disabled={isInvitingPortal}
                className="flex items-center gap-1.5 px-3 py-1.5 text-[11px] font-medium text-zinc-500 dark:text-zinc-400 border border-zinc-200 dark:border-zinc-700 rounded-lg hover:bg-zinc-50 dark:hover:bg-zinc-800 transition-colors disabled:opacity-40">
                {isInvitingPortal ? <Icons.Loader size={12} className="animate-spin" /> : <Icons.Send size={12} />} Resend
              </button>
            </div>
          </div>
        )}

        {/* Status: Accepted */}
        {clientInviteStatus === 'accepted' && (
          <div className="space-y-2.5">
            <p className="text-xs text-emerald-700/80 dark:text-emerald-400/80">
              The client has portal access and can view their projects, payments and documents.
            </p>
            <div className="flex items-center gap-2">
              <button onClick={() => window.open(`/?portal=client&clientId=${client.id}`, '_blank')}
                className="flex items-center gap-1.5 px-3 py-1.5 text-[11px] font-medium text-emerald-700 dark:text-emerald-400 border border-emerald-200 dark:border-emerald-800 rounded-lg hover:bg-emerald-50 dark:hover:bg-emerald-950/30 transition-colors">
                <Icons.External size={12} /> View client portal
              </button>
              {portalInviteLink && (
                <button onClick={() => navigator.clipboard.writeText(portalInviteLink)}
                  className="flex items-center gap-1.5 px-3 py-1.5 text-[11px] font-medium text-zinc-500 dark:text-zinc-400 border border-zinc-200 dark:border-zinc-700 rounded-lg hover:bg-zinc-50 dark:hover:bg-zinc-800 transition-colors">
                  <Icons.Link size={12} /> Copy link
                </button>
              )}
            </div>
          </div>
        )}

        {portalInviteError && (
          <p className="mt-2 text-xs text-rose-600 dark:text-rose-400 bg-rose-50 dark:bg-rose-500/10 rounded-lg px-3 py-2">
            {portalInviteError}
          </p>
        )}
      </div>
    </div>
  );
};
