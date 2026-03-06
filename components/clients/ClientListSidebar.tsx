import React from 'react';
import { Icons } from '../ui/Icons';
import { Client } from '../../hooks/useClients';
import { IncomeEntry } from '../../context/FinanceContext';
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

interface ClientListSidebarProps {
  clients: Client[];
  incomes: IncomeEntry[];
  selectedClient: Client | null;
  searchQuery: string;
  statusFilter: string;
  onSelectClient: (client: Client) => void;
  onSearchChange: (query: string) => void;
  onStatusFilterChange: (status: string) => void;
}

export const ClientListSidebar: React.FC<ClientListSidebarProps> = ({
  clients,
  incomes,
  selectedClient,
  searchQuery,
  statusFilter,
  onSelectClient,
  onSearchChange,
  onStatusFilterChange,
}) => {
  const filteredClients = clients.filter(c => {
    const matchesSearch = !searchQuery ||
      c.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
      c.email?.toLowerCase().includes(searchQuery.toLowerCase()) ||
      c.company?.toLowerCase().includes(searchQuery.toLowerCase());
    const matchesStatus = statusFilter === 'all' || c.status === statusFilter;
    return matchesSearch && matchesStatus;
  });

  return (
    <div className="lg:col-span-4 xl:col-span-3">
      <div className="bg-white dark:bg-zinc-900 rounded-2xl border border-zinc-200/60 dark:border-zinc-800 overflow-hidden">
        {/* Search */}
        <div className="p-3 border-b border-zinc-100 dark:border-zinc-800/60">
          <div className="relative">
            <Icons.Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-zinc-400" />
            <input
              type="text"
              placeholder="Search client..."
              value={searchQuery}
              onChange={(e) => onSearchChange(e.target.value)}
              className="w-full pl-9 pr-3 py-2 bg-zinc-50 dark:bg-zinc-800/60 border border-zinc-200/60 dark:border-zinc-700/60 rounded-xl outline-none focus:border-zinc-300 dark:focus:border-zinc-600 text-xs text-zinc-900 dark:text-zinc-100 placeholder:text-zinc-400"
            />
          </div>
          <div className="flex gap-1 mt-2">
            {(['all', 'active', 'prospect', 'inactive'] as const).map(s => (
              <button
                key={s}
                onClick={() => onStatusFilterChange(s)}
                className={`px-2.5 py-1 rounded-lg text-[10px] font-medium transition-colors ${
                  statusFilter === s
                    ? 'bg-zinc-900 dark:bg-zinc-100 text-white dark:text-zinc-900'
                    : 'bg-zinc-50 dark:bg-zinc-800/60 text-zinc-500 dark:text-zinc-400 hover:bg-zinc-100 dark:hover:bg-zinc-700'
                }`}
              >
                {s === 'all' ? 'All' : statusConfig[s].label}
              </button>
            ))}
          </div>
        </div>

        {/* Client list */}
        <div className="max-h-[calc(100vh-280px)] overflow-y-auto">
          {filteredClients.length > 0 ? (
            <div className="p-2 space-y-1">
              {filteredClients.map((client) => {
                const cfg = statusConfig[client.status] || statusConfig.inactive;
                const isSelected = selectedClient?.id === client.id;
                const clientInc = incomes.filter(i => i.client_id === client.id);
                const clientTotal = clientInc.reduce((s, i) => s + i.total_amount, 0);
                return (
                  <button
                    key={client.id}
                    onClick={() => onSelectClient(client)}
                    className={`w-full text-left p-3 rounded-xl transition-all group ${
                      isSelected
                        ? 'bg-zinc-900 dark:bg-zinc-100'
                        : 'hover:bg-zinc-50 dark:hover:bg-zinc-800/60'
                    }`}
                  >
                    <div className="flex items-center gap-3">
                      <div
                        className={`w-9 h-9 rounded-full flex items-center justify-center text-xs font-bold shrink-0 ${
                          isSelected
                            ? 'bg-white/20 text-white dark:bg-zinc-900/30 dark:text-zinc-900'
                            : client.color
                            ? ''
                            : 'bg-zinc-100 dark:bg-zinc-800 text-zinc-500 dark:text-zinc-400'
                        }`}
                        style={!isSelected && client.color ? {
                          backgroundColor: colorToBg(client.color, 0.15),
                          color: client.color,
                        } : undefined}
                      >
                        {client.avatar_url ? (
                          <img src={client.avatar_url} alt="" className="w-9 h-9 rounded-full object-cover" />
                        ) : getInitials(client.name)}
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center justify-between gap-2">
                          <p className={`text-sm font-medium truncate ${
                            isSelected ? 'text-white dark:text-zinc-900' : 'text-zinc-900 dark:text-zinc-100'
                          }`}>
                            {client.name}
                          </p>
                          <div className={`w-1.5 h-1.5 rounded-full shrink-0 ${cfg.dot}`} />
                        </div>
                        <div className="flex items-center justify-between mt-0.5">
                          <p className={`text-[11px] truncate ${
                            isSelected ? 'text-white/60 dark:text-zinc-900/50' : 'text-zinc-400'
                          }`}>
                            {client.company || client.email || 'No details'}
                          </p>
                          {clientTotal > 0 && (
                            <span className={`text-[10px] font-semibold ${isSelected ? 'text-white/50' : 'text-zinc-300'}`}>
                              {fmtMoney(clientTotal)}
                            </span>
                          )}
                        </div>
                      </div>
                    </div>
                  </button>
                );
              })}
            </div>
          ) : (
            <div className="text-center py-12 px-4">
              <div className="w-10 h-10 rounded-full bg-zinc-100 dark:bg-zinc-800 flex items-center justify-center mx-auto mb-3">
                <Icons.Users size={18} className="text-zinc-400" />
              </div>
              <p className="text-xs font-medium text-zinc-500 dark:text-zinc-400">
                {searchQuery || statusFilter !== 'all' ? 'No results' : 'No clients'}
              </p>
              <p className="text-[10px] text-zinc-400 mt-0.5">
                {searchQuery || statusFilter !== 'all' ? 'Adjust your search' : 'Create your first client'}
              </p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
