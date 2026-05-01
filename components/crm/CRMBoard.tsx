import React, { useMemo, useState } from 'react';
import { Lead } from '../../types';
import { Icons } from '../ui/Icons';

interface CRMBoardProps {
    leads: Lead[];
    onStatusChange: (id: string, status: 'new' | 'contacted' | 'following' | 'closed' | 'lost') => void;
    onConvert: (lead: Lead) => void;
    onLeadClick?: (lead: Lead) => void;
    convertingId?: string | null;
}

type ColId = 'new' | 'contacted' | 'following' | 'closed' | 'lost';

const COLUMNS: { id: ColId; label: string; dot: string; ring: string; tint: string }[] = [
    { id: 'new', label: 'New Inbox', dot: 'bg-blue-500', ring: 'ring-blue-400/40', tint: 'bg-blue-500/[0.04]' },
    { id: 'contacted', label: 'In Contact', dot: 'bg-amber-500', ring: 'ring-amber-400/40', tint: 'bg-amber-500/[0.04]' },
    { id: 'following', label: 'Following Up', dot: 'bg-purple-500', ring: 'ring-purple-400/40', tint: 'bg-purple-500/[0.04]' },
    { id: 'closed', label: 'Won / Closed', dot: 'bg-emerald-500', ring: 'ring-emerald-400/40', tint: 'bg-emerald-500/[0.04]' },
    { id: 'lost', label: 'Lost', dot: 'bg-zinc-400', ring: 'ring-zinc-400/40', tint: 'bg-zinc-500/[0.04]' },
];

function formatRelative(value?: string): string {
    if (!value) return 'Today';
    const d = new Date(value);
    if (Number.isNaN(d.getTime())) return 'Today';
    const diffMs = Date.now() - d.getTime();
    const diffMin = Math.round(diffMs / 60000);
    if (diffMin < 1) return 'now';
    if (diffMin < 60) return `${diffMin}m`;
    const diffH = Math.round(diffMin / 60);
    if (diffH < 24) return `${diffH}h`;
    const diffD = Math.round(diffH / 24);
    if (diffD < 7) return `${diffD}d`;
    return d.toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
}

export const CRMBoard: React.FC<CRMBoardProps> = ({ leads, onStatusChange, onConvert, onLeadClick, convertingId }) => {
    const [draggedLead, setDraggedLead] = useState<string | null>(null);
    const [dragOverCol, setDragOverCol] = useState<ColId | null>(null);

    const leadsByStatus = useMemo(() => {
        const acc: Record<string, Lead[]> = {};
        leads.forEach((lead) => {
            const key = lead.status || 'new';
            if (!acc[key]) acc[key] = [];
            acc[key].push(lead);
        });
        return acc;
    }, [leads]);

    const handleDragStart = (e: React.DragEvent, id: string) => {
        setDraggedLead(id);
        e.dataTransfer.setData('leadId', id);
        e.dataTransfer.effectAllowed = 'move';
    };

    const handleDragEnd = () => {
        setDraggedLead(null);
        setDragOverCol(null);
    };

    const handleDragOver = (e: React.DragEvent, colId: ColId) => {
        e.preventDefault();
        e.dataTransfer.dropEffect = 'move';
        if (dragOverCol !== colId) setDragOverCol(colId);
    };

    const handleDragLeave = (e: React.DragEvent, colId: ColId) => {
        // only clear if we actually left the column (not entering a child)
        const related = e.relatedTarget as Node | null;
        if (related && (e.currentTarget as Node).contains(related)) return;
        if (dragOverCol === colId) setDragOverCol(null);
    };

    const handleDrop = (e: React.DragEvent, status: ColId) => {
        e.preventDefault();
        const leadId = e.dataTransfer.getData('leadId');
        if (leadId) {
            const current = leads.find(l => l.id === leadId);
            if (current && current.status !== status) {
                onStatusChange(leadId, status);
            }
        }
        setDraggedLead(null);
        setDragOverCol(null);
    };

    const handleCardClick = (lead: Lead) => {
        if (draggedLead === lead.id) return;
        onLeadClick?.(lead);
    };

    return (
        <div className="h-full overflow-x-auto pb-3 no-scrollbar">
            <div className="flex gap-3 min-w-max h-full">
                {COLUMNS.map(col => {
                    const colLeads = leadsByStatus[col.id] || [];
                    const isOver = dragOverCol === col.id;

                    return (
                        <div
                            key={col.id}
                            className={`w-[272px] flex flex-col h-full rounded-xl transition-all duration-150 ease-out ${
                                isOver ? `ring-2 ${col.ring} ${col.tint}` : 'ring-1 ring-transparent'
                            }`}
                            onDragOver={(e) => handleDragOver(e, col.id)}
                            onDragLeave={(e) => handleDragLeave(e, col.id)}
                            onDrop={(e) => handleDrop(e, col.id)}
                        >
                            {/* Column Header */}
                            <div className="flex items-center justify-between mb-2 px-2 pt-2">
                                <div className="flex items-center gap-2 min-w-0">
                                    <div className={`w-1.5 h-1.5 rounded-full ${col.dot} shrink-0`} />
                                    <h3 className="text-[13px] font-medium text-zinc-800 dark:text-zinc-200 tracking-tight truncate">
                                        {col.label}
                                    </h3>
                                    <span className="text-[11px] text-zinc-400 dark:text-zinc-500 font-mono tabular-nums">
                                        {colLeads.length}
                                    </span>
                                </div>
                                <button className="text-zinc-400 hover:text-zinc-700 dark:hover:text-zinc-200 transition-colors p-1 -mr-1 rounded hover:bg-zinc-100 dark:hover:bg-zinc-800">
                                    <Icons.Plus size={13} />
                                </button>
                            </div>

                            {/* Column Content */}
                            <div className="flex-1 overflow-y-auto space-y-2 px-2 pb-2 no-scrollbar">
                                {colLeads.map(lead => {
                                    const isDragging = draggedLead === lead.id;
                                    const temp = lead.aiAnalysis?.temperature;
                                    return (
                                        <div
                                            key={lead.id}
                                            draggable
                                            onDragStart={(e) => handleDragStart(e, lead.id)}
                                            onDragEnd={handleDragEnd}
                                            onClick={() => handleCardClick(lead)}
                                            className={`group relative bg-white dark:bg-zinc-900 px-2.5 py-2 rounded-lg border border-zinc-200/80 dark:border-zinc-800 shadow-[0_1px_2px_rgba(0,0,0,0.03)] hover:shadow-[0_2px_8px_rgba(0,0,0,0.06)] hover:border-zinc-300 dark:hover:border-zinc-700 hover:-translate-y-px cursor-grab active:cursor-grabbing transition-all duration-150 ease-out ${
                                                isDragging ? 'opacity-40 scale-[0.97] rotate-[0.5deg]' : ''
                                            }`}
                                        >
                                            {/* Left accent */}
                                            <div className={`absolute left-0 top-2 bottom-2 w-[2px] rounded-r ${
                                                temp === 'hot' ? 'bg-rose-400' :
                                                temp === 'warm' ? 'bg-amber-400' :
                                                temp === 'cold' ? 'bg-blue-400' :
                                                'bg-zinc-200 dark:bg-zinc-700'
                                            }`} />

                                            {/* Header row */}
                                            <div className="flex items-center justify-between gap-2 mb-1">
                                                <div className="flex items-center gap-1.5 min-w-0">
                                                    <div className="w-5 h-5 rounded-full bg-zinc-100 dark:bg-zinc-800 flex items-center justify-center text-[9px] font-semibold text-zinc-600 dark:text-zinc-300 shrink-0">
                                                        {(lead.name || 'U').split(' ').map(n => n[0]).join('').slice(0, 2).toUpperCase()}
                                                    </div>
                                                    <span className="text-[12.5px] font-medium text-zinc-900 dark:text-zinc-100 truncate">
                                                        {lead.name || 'Unknown'}
                                                    </span>
                                                </div>
                                                <span className="text-[10px] text-zinc-400 dark:text-zinc-500 font-mono tabular-nums shrink-0">
                                                    {formatRelative(lead.createdAt)}
                                                </span>
                                            </div>

                                            {/* Message */}
                                            {lead.message && (
                                                <p className="text-[11.5px] text-zinc-500 dark:text-zinc-400 line-clamp-2 leading-snug mb-1.5 pl-1">
                                                    {lead.message}
                                                </p>
                                            )}

                                            {/* Tags + Convert */}
                                            <div className="flex items-center justify-between gap-1.5 pl-1">
                                                <div className="flex items-center gap-1 min-w-0 flex-wrap">
                                                    {temp && (
                                                        <span className={`px-1.5 py-px rounded text-[9.5px] font-medium ${
                                                            temp === 'hot' ? 'bg-rose-50 text-rose-600 dark:bg-rose-500/10 dark:text-rose-400' :
                                                            temp === 'warm' ? 'bg-amber-50 text-amber-600 dark:bg-amber-500/10 dark:text-amber-400' :
                                                            'bg-blue-50 text-blue-600 dark:bg-blue-500/10 dark:text-blue-400'
                                                        }`}>
                                                            {temp}
                                                        </span>
                                                    )}
                                                    {(lead.origin || lead.source) && (
                                                        <span
                                                            title={lead.source ? `source: ${lead.source}` : undefined}
                                                            className="px-1.5 py-px rounded text-[9.5px] font-medium bg-zinc-50 dark:bg-zinc-800 text-zinc-500 dark:text-zinc-400 max-w-[110px] truncate"
                                                        >
                                                            {lead.origin || lead.source}
                                                        </span>
                                                    )}
                                                </div>

                                                {col.id !== 'closed' && (
                                                    <button
                                                        onClick={(e) => { e.stopPropagation(); onConvert(lead); }}
                                                        disabled={convertingId === lead.id}
                                                        className="opacity-0 group-hover:opacity-100 transition-opacity flex items-center gap-1 text-[9.5px] font-medium text-emerald-600 dark:text-emerald-400 hover:bg-emerald-50 dark:hover:bg-emerald-900/20 px-1.5 py-px rounded shrink-0"
                                                    >
                                                        {convertingId === lead.id ? (
                                                            <Icons.Loader size={9} className="animate-spin" />
                                                        ) : (
                                                            <Icons.Sparkles size={9} />
                                                        )}
                                                        <span>Convert</span>
                                                    </button>
                                                )}
                                            </div>
                                        </div>
                                    );
                                })}

                                {colLeads.length === 0 && (
                                    <div className={`h-16 border border-dashed rounded-lg flex items-center justify-center text-[10px] transition-colors ${
                                        isOver
                                            ? 'border-zinc-400 dark:border-zinc-600 text-zinc-500 dark:text-zinc-400 bg-white/60 dark:bg-zinc-900/60'
                                            : 'border-zinc-200 dark:border-zinc-800 text-zinc-300 dark:text-zinc-700'
                                    }`}>
                                        {isOver ? 'Drop here' : 'Empty'}
                                    </div>
                                )}
                            </div>
                        </div>
                    );
                })}
            </div>
        </div>
    );
};
