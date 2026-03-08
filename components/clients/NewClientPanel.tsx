import React from 'react';
import { Icons } from '../ui/Icons';
import { SlidePanel } from '../ui/SlidePanel';
import { ColorPalette } from '../ui/ColorPalette';
import { TIMEZONE_OPTIONS, tzCity, tzNow } from '../../lib/timezone';

const inputClass = 'w-full px-3 py-2.5 bg-zinc-50 dark:bg-zinc-800/60 border border-zinc-200 dark:border-zinc-700 rounded-xl outline-none focus:border-zinc-400 dark:focus:border-zinc-500 focus:ring-2 focus:ring-zinc-100 dark:focus:ring-zinc-800 text-sm text-zinc-900 dark:text-zinc-100 placeholder:text-zinc-400 transition-all';
const labelClass = 'block text-[11px] font-semibold text-zinc-500 dark:text-zinc-400 mb-1.5';

interface NewClientPanelProps {
  isOpen: boolean;
  newClientData: {
    name: string;
    email: string;
    company: string;
    phone: string;
    status: string;
    notes: string;
    industry: string;
    address: string;
    color?: string | null;
    timezone?: string | null;
  };
  creatingClient: boolean;
  onClose: () => void;
  onDataChange: (data: NewClientPanelProps['newClientData']) => void;
  onCreate: () => void;
}

export const NewClientPanel: React.FC<NewClientPanelProps> = ({
  isOpen,
  newClientData,
  creatingClient,
  onClose,
  onDataChange,
  onCreate,
}) => {
  return (
    <SlidePanel
      isOpen={isOpen}
      onClose={onClose}
      title="New Client"
      width="sm"
      footer={
        <div className="flex items-center justify-end gap-2">
          <button
            onClick={onClose}
            className="px-4 py-2 text-xs font-medium text-zinc-500 hover:text-zinc-900 dark:text-zinc-400 dark:hover:text-zinc-100 rounded-xl hover:bg-zinc-100 dark:hover:bg-zinc-800 transition-colors"
          >
            Cancel
          </button>
          <button
            onClick={onCreate}
            disabled={!newClientData.name.trim() || creatingClient}
            className="px-5 py-2.5 bg-zinc-900 dark:bg-zinc-100 text-white dark:text-zinc-900 rounded-xl text-xs font-semibold disabled:opacity-40 disabled:cursor-not-allowed hover:bg-zinc-800 dark:hover:bg-zinc-200 transition-all active:scale-[0.97] flex items-center gap-2"
          >
            {creatingClient ? (
              <div className="w-3.5 h-3.5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
            ) : (
              <Icons.Plus size={14} />
            )}
            {creatingClient ? 'Creating...' : 'Create Client'}
          </button>
        </div>
      }
    >
      <div className="p-5 space-y-4">
        <div>
          <label className={labelClass}>Name *</label>
          <input
            type="text"
            placeholder="Client name"
            value={newClientData.name}
            onChange={(e) => onDataChange({ ...newClientData, name: e.target.value })}
            className={inputClass}
            autoFocus
          />
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className={labelClass}>Email</label>
            <input
              type="email"
              placeholder="email@example.com"
              value={newClientData.email}
              onChange={(e) => onDataChange({ ...newClientData, email: e.target.value })}
              className={inputClass}
            />
          </div>
          <div>
            <label className={labelClass}>Phone</label>
            <input
              type="text"
              placeholder="+1 555 123-4567"
              value={newClientData.phone}
              onChange={(e) => onDataChange({ ...newClientData, phone: e.target.value })}
              className={inputClass}
            />
          </div>
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className={labelClass}>Company</label>
            <input
              type="text"
              placeholder="Company name"
              value={newClientData.company}
              onChange={(e) => onDataChange({ ...newClientData, company: e.target.value })}
              className={inputClass}
            />
          </div>
          <div>
            <label className={labelClass}>Industry</label>
            <input
              type="text"
              placeholder="Technology, Healthcare..."
              value={newClientData.industry}
              onChange={(e) => onDataChange({ ...newClientData, industry: e.target.value })}
              className={inputClass}
            />
          </div>
        </div>

        <div>
          <label className={labelClass}>Status</label>
          <select
            value={newClientData.status}
            onChange={(e) => onDataChange({ ...newClientData, status: e.target.value as any })}
            className={inputClass}
          >
            <option value="prospect">Prospect</option>
            <option value="active">Active</option>
            <option value="inactive">Inactive</option>
          </select>
        </div>

        <div>
          <label className={labelClass}>Timezone</label>
          <select
            value={newClientData.timezone || ''}
            onChange={(e) => onDataChange({ ...newClientData, timezone: e.target.value || null })}
            className={inputClass}
          >
            <option value="">No timezone</option>
            {TIMEZONE_OPTIONS.map(group => (
              <optgroup key={group.group} label={group.group}>
                {group.zones.map(z => (
                  <option key={z.value} value={z.value}>{z.label} — {tzNow(z.value)}</option>
                ))}
              </optgroup>
            ))}
          </select>
        </div>

        <ColorPalette
          label="Color"
          value={newClientData.color ?? null}
          onChange={(color) => onDataChange({ ...newClientData, color })}
          allowClear
        />

        <div>
          <label className={labelClass}>Notes</label>
          <textarea
            placeholder="Additional notes..."
            value={newClientData.notes}
            onChange={(e) => onDataChange({ ...newClientData, notes: e.target.value })}
            className={inputClass + ' resize-none'}
            rows={3}
          />
        </div>
      </div>
    </SlidePanel>
  );
};
