import React from 'react';
import { Icons } from '../ui/Icons';
import { SlidePanel } from '../ui/SlidePanel';

interface NewLeadModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSubmit: () => void;
  isCreating: boolean;
  newLeadData: {
    name: string;
    email: string;
    message: string;
    company: string;
  };
  setNewLeadData: (data: any) => void;
}

export const NewLeadModal: React.FC<NewLeadModalProps> = ({
  isOpen,
  onClose,
  onSubmit,
  isCreating,
  newLeadData,
  setNewLeadData,
}) => {
  return (
    <SlidePanel
      isOpen={isOpen}
      onClose={onClose}
      title="Add New Lead"
      subtitle="Enter lead details manually"
      width="sm"
      footer={
        <div className="flex justify-end gap-3">
          <button
            onClick={onClose}
            className="px-4 py-2 text-sm font-medium text-zinc-600 dark:text-zinc-400 hover:text-zinc-900 dark:hover:text-zinc-100 transition-colors"
          >
            Cancel
          </button>
          <button
            onClick={onSubmit}
            disabled={isCreating}
            className="px-5 py-2 bg-zinc-900 dark:bg-zinc-100 hover:bg-zinc-800 dark:hover:bg-zinc-200 text-white dark:text-zinc-900 text-sm font-medium rounded-lg transition-colors disabled:opacity-50 flex items-center gap-2"
          >
            {isCreating ? <Icons.Loader size={16} className="animate-spin" /> : <Icons.Plus size={16} />}
            <span>Create Lead</span>
          </button>
        </div>
      }
    >
      <div className="p-5 space-y-4">
        <div>
          <label className="text-xs font-semibold text-zinc-500 uppercase tracking-wide mb-1 block">Full Name</label>
          <input
            autoFocus
            type="text"
            className="w-full px-3 py-2 bg-zinc-50 dark:bg-zinc-800 border border-zinc-200 dark:border-zinc-700 rounded-lg outline-none focus:border-zinc-400 transition-colors text-sm"
            placeholder="e.g. John Doe"
            value={newLeadData.name}
            onChange={(e) => setNewLeadData({ ...newLeadData, name: e.target.value })}
          />
        </div>
        <div>
          <label className="text-xs font-semibold text-zinc-500 uppercase tracking-wide mb-1 block">Email</label>
          <input
            type="email"
            className="w-full px-3 py-2 bg-zinc-50 dark:bg-zinc-800 border border-zinc-200 dark:border-zinc-700 rounded-lg outline-none focus:border-zinc-400 transition-colors text-sm"
            placeholder="john@example.com"
            value={newLeadData.email}
            onChange={(e) => setNewLeadData({ ...newLeadData, email: e.target.value })}
          />
        </div>
        <div>
          <label className="text-xs font-semibold text-zinc-500 uppercase tracking-wide mb-1 block">Company (Optional)</label>
          <input
            type="text"
            className="w-full px-3 py-2 bg-zinc-50 dark:bg-zinc-800 border border-zinc-200 dark:border-zinc-700 rounded-lg outline-none focus:border-zinc-400 transition-colors text-sm"
            placeholder="Acme Inc."
            value={newLeadData.company}
            onChange={(e) => setNewLeadData({ ...newLeadData, company: e.target.value })}
          />
        </div>
        <div>
          <label className="text-xs font-semibold text-zinc-500 uppercase tracking-wide mb-1 block">Message / Note</label>
          <textarea
            className="w-full px-3 py-2 bg-zinc-50 dark:bg-zinc-800 border border-zinc-200 dark:border-zinc-700 rounded-lg outline-none focus:border-zinc-400 transition-colors resize-none h-24 text-sm"
            placeholder="Any details..."
            value={newLeadData.message}
            onChange={(e) => setNewLeadData({ ...newLeadData, message: e.target.value })}
          />
        </div>
      </div>
    </SlidePanel>
  );
};
