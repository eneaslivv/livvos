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

const COLUMNS: { id: 'new' | 'contacted' | 'following' | 'closed' | 'lost'; label: string; color: string }[] = [
    { id: 'new', label: 'New Inbox', color: 'bg-blue-500' },
    { id: 'contacted', label: 'In Contact', color: 'bg-amber-500' },
    { id: 'following', label: 'Following Up', color: 'bg-purple-500' },
    { id: 'closed', label: 'Won / Closed', color: 'bg-emerald-500' },
    { id: 'lost', label: 'Lost', color: 'bg-zinc-400' },
];

export const CRMBoard: React.FC<CRMBoardProps> = ({ leads, onStatusChange, onConvert, onLeadClick, convertingId }) => {
    const [draggedLead, setDraggedLead] = useState<string | null>(null);

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
    };

    const handleDragOver = (e: React.DragEvent) => {
        e.preventDefault();
    };

    const handleDrop = (e: React.DragEvent, status: any) => {
        e.preventDefault();
        const leadId = e.dataTransfer.getData('leadId');
        if (leadId) {
            onStatusChange(leadId, status);
        }
        setDraggedLead(null);
    };

    const handleCardClick = (lead: Lead) => {
        if (draggedLead === lead.id) {
            return;
        }
        onLeadClick?.(lead);
    };

    return (
        <div className="h-full overflow-x-auto pb-4">
            <div className="flex gap-6 min-w-max h-full">
                {COLUMNS.map(col => {
                    const colLeads = leadsByStatus[col.id] || [];

                    return (
                        <div
                            key={col.id}
                            className="w-80 flex flex-col h-full rounded-xl transition-colors"
                            onDragOver={handleDragOver}
                            onDrop={(e) => handleDrop(e, col.id)}
                        >
                            {/* Column Header */}
                            <div className="flex items-center justify-between mb-4 px-2">
                                <div className="flex items-center gap-2">
                                    <div className={`w-2 h-2 rounded-full ${col.color}`} />
                                    <h3 className="font-serif text-zinc-900 dark:text-zinc-100 font-medium text-lg">
                                        {col.label}
                                    </h3>
                                    <span className="text-xs text-zinc-400 font-mono ml-1">
                                        {colLeads.length}
                                    </span>
                                </div>
                                <button className="text-zinc-400 hover:text-zinc-600 dark:hover:text-zinc-200">
                                    <Icons.Plus size={16} />
                                </button>
                            </div>

                            {/* Column Content */}
                            <div className="flex-1 overflow-y-auto space-y-3 px-1 no-scrollbar">
                                {colLeads.map(lead => (
                                    <div
                                        key={lead.id}
                                        draggable
                                        onDragStart={(e) => handleDragStart(e, lead.id)}
                                        onDragEnd={() => setDraggedLead(null)}
                                        onClick={() => handleCardClick(lead)}
                                        className="group bg-white dark:bg-zinc-900 p-4 rounded-xl border border-zinc-200 dark:border-zinc-800 shadow-sm hover:shadow-md transition-all cursor-grab active:cursor-grabbing relative"
                                    >
                                        {/* Header */}
                                        <div className="flex justify-between items-start mb-2">
                                            <div className="flex items-center gap-2">
                                                {/* Avatar - Initials */}
                                                <div className="w-6 h-6 rounded-full bg-zinc-100 dark:bg-zinc-800 flex items-center justify-center text-[10px] font-bold text-zinc-600 dark:text-zinc-300 border border-zinc-200 dark:border-zinc-700">
                                                    {(lead.name || 'Unknown').split(' ').map(n => n[0]).join('').slice(0, 2)}
                                                </div>
                                                <span className="text-sm font-medium text-zinc-900 dark:text-zinc-100 truncate max-w-[120px]">
                                                    {lead.name || 'Unknown'}
                                                </span>
                                            </div>
                                            <div className="opacity-0 group-hover:opacity-100 transition-opacity flex gap-1">
                                                <button className="p-1 hover:bg-zinc-100 dark:hover:bg-zinc-800 rounded">
                                                    <Icons.MoreHorizontal size={14} className="text-zinc-400" />
                                                </button>
                                            </div>
                                        </div>

                                        {/* Message / Content */}
                                        <p className="text-xs text-zinc-500 dark:text-zinc-400 line-clamp-2 mb-3 leading-relaxed">
                                            {lead.message || "No message provided yet..."}
                                        </p>

                                        {/* Meta Tags */}
                                        {lead.aiAnalysis && (
                                            <div className="flex flex-wrap gap-1.5 mb-3">
                                                <span className={`px-1.5 py-0.5 rounded text-[10px] font-medium border
                          ${lead.aiAnalysis.temperature === 'hot' ? 'bg-rose-50 border-rose-100 text-rose-600' :
                                                        lead.aiAnalysis.temperature === 'warm' ? 'bg-amber-50 border-amber-100 text-amber-600' :
                                                            'bg-blue-50 border-blue-100 text-blue-600'
                                                    }
                        `}>
                                                    {lead.aiAnalysis.temperature}
                                                </span>
                                                <span className="px-1.5 py-0.5 rounded text-[10px] font-medium bg-zinc-50 dark:bg-zinc-800 border border-zinc-100 dark:border-zinc-700 text-zinc-500">
                                                    {lead.aiAnalysis.category}
                                                </span>
                                            </div>
                                        )}

                                        {/* Actions */}
                                        <div className="flex items-center justify-between pt-2 border-t border-zinc-50 dark:border-zinc-800/50">
                                            <span className="text-[10px] text-zinc-400 flex items-center gap-1">
                                                <Icons.Calendar size={10} />
                                                {lead.createdAt || 'Today'}
                                            </span>

                                            {col.id !== 'closed' && (
                                                <button
                                                    onClick={() => onConvert(lead)}
                                                    disabled={convertingId === lead.id}
                                                    className="opacity-0 group-hover:opacity-100 transition-all flex items-center gap-1 text-[10px] font-medium text-emerald-600 dark:text-emerald-400 bg-emerald-50 dark:bg-emerald-900/20 px-2 py-1 rounded-full hover:bg-emerald-100 dark:hover:bg-emerald-900/30"
                                                >
                                                    {convertingId === lead.id ? (
                                                        <Icons.Loader size={10} className="animate-spin" />
                                                    ) : (
                                                        <Icons.Sparkles size={10} />
                                                    )}
                                                    <span>Convert</span>
                                                </button>
                                            )}
                                        </div>

                                        {/* Left accent border */}
                                        <div className={`absolute left-0 top-3 bottom-3 w-0.5 rounded-r ${lead.aiAnalysis?.temperature === 'hot' ? 'bg-rose-400' :
                                                lead.aiAnalysis?.temperature === 'warm' ? 'bg-amber-400' :
                                                    'bg-zinc-200 dark:bg-zinc-700'
                                            }`} />
                                    </div>
                                ))}

                                {colLeads.length === 0 && (
                                    <div className="h-24 border-2 border-dashed border-zinc-200 dark:border-zinc-800 rounded-xl flex items-center justify-center text-zinc-300 dark:text-zinc-700 text-xs">
                                        Empty
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
