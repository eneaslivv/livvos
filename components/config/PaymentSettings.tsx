import React, { useState } from 'react';
import { useRBAC } from '../../context/RBACContext';
import { Icons } from '../ui/Icons';

export const PaymentSettings: React.FC = () => {
  const { hasPermission } = useRBAC();
  const canEdit = hasPermission('finance', 'edit');

  const [processors] = useState([
    { id: '1', name: 'Stripe', type: 'Primary', status: 'Active', lastSync: '2 mins ago' },
    { id: '2', name: 'PayPal', type: 'Secondary', status: 'Inactive', lastSync: 'Never' },
  ]);

  if (!hasPermission('finance', 'view')) {
    return (
        <div className="flex flex-col items-center justify-center py-12 text-center">
            <div className="p-3 bg-rose-50 dark:bg-rose-900/20 rounded-full text-rose-500 mb-4">
                <Icons.Lock size={24} />
            </div>
            <h3 className="text-lg font-medium text-zinc-900 dark:text-zinc-100">Access Restricted</h3>
            <p className="text-sm text-zinc-500 mt-2 max-w-xs">You do not have permission to view payment configurations. Contact your administrator.</p>
        </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
            <h3 className="text-lg font-medium leading-6 text-zinc-900 dark:text-zinc-100">Payment Processors</h3>
            <p className="mt-1 text-sm text-zinc-500 dark:text-zinc-400">
            Manage payment gateways and financial integrations.
            </p>
        </div>
        {canEdit && (
            <button className="flex items-center gap-2 px-3 py-1.5 text-sm font-medium text-white bg-indigo-600 hover:bg-indigo-700 rounded-lg transition-colors">
                <Icons.Plus size={16} />
                Add Processor
            </button>
        )}
      </div>

      <div className="grid gap-4">
        {processors.map((proc) => (
            <div key={proc.id} className="flex items-center justify-between p-4 bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-xl">
                <div className="flex items-center gap-4">
                    <div className="w-10 h-10 rounded-lg bg-indigo-50 dark:bg-indigo-900/20 flex items-center justify-center text-indigo-600 dark:text-indigo-400 font-bold text-xs">
                        {proc.name.substring(0, 2).toUpperCase()}
                    </div>
                    <div>
                        <div className="flex items-center gap-2">
                            <h4 className="text-sm font-medium text-zinc-900 dark:text-zinc-100">{proc.name}</h4>
                            {proc.type === 'Primary' && (
                                <span className="text-[10px] font-bold px-1.5 py-0.5 bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-300 rounded uppercase tracking-wide">Primary</span>
                            )}
                        </div>
                        <p className="text-xs text-zinc-500 dark:text-zinc-400 mt-0.5">Last sync: {proc.lastSync}</p>
                    </div>
                </div>
                
                <div className="flex items-center gap-3">
                    <span className={`text-xs px-2 py-1 rounded-full font-medium ${proc.status === 'Active' ? 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400' : 'bg-zinc-100 text-zinc-500 dark:bg-zinc-800 dark:text-zinc-400'}`}>
                        {proc.status}
                    </span>
                    {canEdit && (
                        <button className="p-2 text-zinc-400 hover:text-zinc-600 dark:hover:text-zinc-300 hover:bg-zinc-100 dark:hover:bg-zinc-800 rounded-lg transition-colors">
                            <Icons.Settings size={16} />
                        </button>
                    )}
                </div>
            </div>
        ))}
      </div>
    </div>
  );
};
