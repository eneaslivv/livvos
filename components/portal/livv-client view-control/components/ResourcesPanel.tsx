import React, { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { KeyRound, FileText, DollarSign, Eye, EyeOff, Copy, Check, Download, Figma, FolderOpen, CalendarClock, CircleCheck, Clock, AlertTriangle } from 'lucide-react';
import type { CredentialItem, AssetItem, PaymentEntry } from '../types';

interface ResourcesPanelProps {
  credentials?: CredentialItem[];
  assets?: AssetItem[];
  budget: {
    total: number;
    paid: number;
    nextPayment?: { amount: number; dueDate: string; concept?: string };
    payments?: PaymentEntry[];
  };
}

const TABS = [
  { id: 'finance', label: 'Finanzas', icon: DollarSign },
  { id: 'access', label: 'Accesos', icon: KeyRound },
  { id: 'docs', label: 'Documentos', icon: FileText },
] as const;

type TabId = typeof TABS[number]['id'];

const fmtDate = (d: string) => {
  if (!d) return '—';
  const date = new Date(d + 'T00:00:00');
  return date.toLocaleDateString('es-AR', { day: 'numeric', month: 'short', year: 'numeric' });
};

const ResourcesPanel: React.FC<ResourcesPanelProps> = ({ credentials, assets, budget }) => {
  const [activeTab, setActiveTab] = useState<TabId>('finance');
  const [showPass, setShowPass] = useState<Record<string, boolean>>({});
  const [copied, setCopied] = useState<string | null>(null);
  const [showAmounts, setShowAmounts] = useState(true);

  const credItems = credentials && credentials.length
    ? credentials
    : [
        { id: '1', service: 'Panel de Admin', user: 'admin@livv.com', pass: 'secure-pass-2026' },
        { id: '2', service: 'Base de Datos', user: 'db_admin', pass: 'p_secure_88!v2' },
      ];

  const docItems = assets && assets.length
    ? assets
    : [
        { id: '1', name: 'Contrato de Servicios', type: 'PDF', size: '2.4 MB' },
        { id: '2', name: 'Diseño del Proyecto', type: 'Figma', size: 'Enlace' },
        { id: '3', name: 'Entregables Fase I', type: 'Drive', size: 'Enlace' },
      ];

  const togglePass = (id: string) => setShowPass(p => ({ ...p, [id]: !p[id] }));
  const copyText = (text: string, id: string) => {
    navigator.clipboard.writeText(text);
    setCopied(id);
    setTimeout(() => setCopied(null), 2000);
  };

  const getDocIcon = (type?: string) => {
    if (!type) return <FileText size={14} />;
    const k = type.toLowerCase();
    if (k.includes('figma')) return <Figma size={14} />;
    if (k.includes('drive')) return <FolderOpen size={14} />;
    return <FileText size={14} />;
  };

  const remaining = budget.total - budget.paid;
  const pct = budget.total > 0 ? Math.round((budget.paid / budget.total) * 100) : 0;
  const fmt = (v: number) => showAmounts ? `$${v.toLocaleString()}` : '••••••';

  const payments = budget.payments || [];
  const paidPayments = payments.filter(p => p.status === 'paid');
  const pendingPayments = payments.filter(p => p.status !== 'paid');
  const nextPayment = budget.nextPayment;

  return (
    <motion.div
      variants={{ hidden: { opacity: 0, y: 16 }, visible: { opacity: 1, y: 0 } }}
      className="bg-white rounded-2xl border border-zinc-200/60 overflow-hidden h-full flex flex-col"
    >
      {/* Tab bar */}
      <div className="flex items-center border-b border-zinc-100 px-1 pt-1">
        {TABS.map(tab => {
          const Icon = tab.icon;
          const isActive = activeTab === tab.id;
          return (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              className={`relative flex items-center gap-1.5 px-4 py-2.5 text-[11px] font-semibold transition-colors ${
                isActive
                  ? 'text-zinc-800'
                  : 'text-zinc-300 hover:text-zinc-500'
              }`}
            >
              <Icon size={12} />
              {tab.label}
              {isActive && (
                <motion.div
                  layoutId="resources-tab-indicator"
                  className="absolute bottom-0 left-2 right-2 h-[2px] bg-zinc-800 rounded-full"
                  transition={{ type: 'spring', stiffness: 400, damping: 30 }}
                />
              )}
            </button>
          );
        })}
      </div>

      {/* Tab content */}
      <div className="flex-1 overflow-y-auto p-5">
        <AnimatePresence mode="wait">
          {/* ── Finance Tab ── */}
          {activeTab === 'finance' && (
            <motion.div
              key="finance"
              initial={{ opacity: 0, x: -8 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: 8 }}
              transition={{ duration: 0.2 }}
              className="space-y-4"
            >
              {/* Header: total + toggle */}
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-[10px] text-zinc-400 font-medium mb-0.5">Valor total del proyecto</p>
                  <p className="text-2xl font-black text-zinc-900 tracking-tight">{fmt(budget.total)}</p>
                </div>
                <button onClick={() => setShowAmounts(!showAmounts)} className="p-1.5 hover:bg-zinc-50 rounded-lg transition-colors">
                  {showAmounts ? <EyeOff size={13} className="text-zinc-300" /> : <Eye size={13} className="text-zinc-400" />}
                </button>
              </div>

              {/* Progress bar */}
              <div>
                <div className="flex justify-between text-[10px] mb-1.5">
                  <span className="text-zinc-400">Progreso de cobro</span>
                  <span className="font-semibold text-zinc-500">{showAmounts ? `${pct}%` : '••'}</span>
                </div>
                <div className="h-1.5 bg-zinc-100 rounded-full overflow-hidden">
                  <motion.div
                    initial={{ width: 0 }}
                    animate={{ width: `${pct}%` }}
                    transition={{ duration: 1.2, ease: 'circOut' }}
                    className="h-full bg-emerald-500 rounded-full"
                  />
                </div>
              </div>

              {/* Paid / Remaining cards */}
              <div className="grid grid-cols-2 gap-2">
                <div className="p-3 bg-emerald-50/60 rounded-xl">
                  <p className="text-[9px] text-emerald-600/50 font-semibold mb-0.5">Cobrado</p>
                  <p className="text-sm font-bold text-emerald-700">{fmt(budget.paid)}</p>
                </div>
                <div className="p-3 bg-zinc-50 rounded-xl">
                  <p className="text-[9px] text-zinc-400 font-semibold mb-0.5">Pendiente</p>
                  <p className="text-sm font-bold text-zinc-600">{fmt(remaining)}</p>
                </div>
              </div>

              {/* Next Payment highlight */}
              {nextPayment && (
                <div className="p-3.5 bg-amber-50/80 border border-amber-200/50 rounded-xl">
                  <div className="flex items-center gap-1.5 mb-1.5">
                    <CalendarClock size={12} className="text-amber-600" />
                    <p className="text-[10px] font-semibold text-amber-700 uppercase tracking-wider">Pr{'\u00f3'}ximo pago</p>
                  </div>
                  <div className="flex items-end justify-between">
                    <div>
                      <p className="text-[10px] text-amber-600/70 mb-0.5">{nextPayment.concept || 'Cuota pendiente'}</p>
                      <p className="text-lg font-bold text-amber-800">{fmt(nextPayment.amount)}</p>
                    </div>
                    <div className="text-right">
                      <p className="text-[9px] text-amber-500 font-medium">Vence</p>
                      <p className="text-[11px] font-semibold text-amber-700">{fmtDate(nextPayment.dueDate)}</p>
                    </div>
                  </div>
                </div>
              )}

              {/* Payment Schedule */}
              {payments.length > 0 && (
                <div>
                  <p className="text-[10px] text-zinc-400 font-semibold uppercase tracking-wider mb-2.5">
                    Calendario de pagos
                    <span className="text-zinc-300 ml-1.5 normal-case font-normal">
                      ({paidPayments.length}/{payments.length} completados)
                    </span>
                  </p>
                  <div className="space-y-1.5">
                    {payments.map((p, i) => {
                      const isPaid = p.status === 'paid';
                      const isOverdue = p.status === 'overdue';
                      const isNext = !isPaid && pendingPayments[0]?.id === p.id;

                      return (
                        <div
                          key={p.id}
                          className={`flex items-center gap-2.5 p-2.5 rounded-xl border transition-all ${
                            isPaid
                              ? 'bg-emerald-50/40 border-emerald-100/60'
                              : isOverdue
                              ? 'bg-red-50/40 border-red-100/60'
                              : isNext
                              ? 'bg-amber-50/40 border-amber-200/60'
                              : 'bg-zinc-50/60 border-zinc-100/60'
                          }`}
                        >
                          {/* Status icon */}
                          <div className={`flex-shrink-0 w-5 h-5 rounded-full flex items-center justify-center ${
                            isPaid
                              ? 'bg-emerald-100 text-emerald-600'
                              : isOverdue
                              ? 'bg-red-100 text-red-500'
                              : 'bg-zinc-100 text-zinc-400'
                          }`}>
                            {isPaid ? <CircleCheck size={11} /> : isOverdue ? <AlertTriangle size={10} /> : <Clock size={10} />}
                          </div>

                          {/* Info */}
                          <div className="flex-1 min-w-0">
                            <p className={`text-[10px] font-semibold truncate ${
                              isPaid ? 'text-emerald-700' : isOverdue ? 'text-red-700' : 'text-zinc-600'
                            }`}>
                              {p.concept}
                            </p>
                            <p className={`text-[9px] ${isPaid ? 'text-emerald-500' : isOverdue ? 'text-red-400' : 'text-zinc-400'}`}>
                              {isPaid && p.paidDate ? `Pagado ${fmtDate(p.paidDate)}` : `Vence ${fmtDate(p.dueDate)}`}
                            </p>
                          </div>

                          {/* Amount */}
                          <p className={`text-[11px] font-bold flex-shrink-0 ${
                            isPaid ? 'text-emerald-600' : isOverdue ? 'text-red-600' : 'text-zinc-600'
                          }`}>
                            {fmt(p.amount)}
                          </p>
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}

              {/* Empty state when no payments and no budget */}
              {payments.length === 0 && budget.total === 0 && (
                <div className="text-center py-4">
                  <CalendarClock size={20} className="text-zinc-200 mx-auto mb-2" />
                  <p className="text-[11px] text-zinc-300">No hay pagos configurados a{'\u00fa'}n</p>
                </div>
              )}
            </motion.div>
          )}

          {/* ── Access Tab ── */}
          {activeTab === 'access' && (
            <motion.div
              key="access"
              initial={{ opacity: 0, x: -8 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: 8 }}
              transition={{ duration: 0.2 }}
              className="space-y-2"
            >
              {credItems.map(c => (
                <div key={c.id} className="p-3 bg-zinc-50/80 border border-zinc-100 rounded-xl hover:border-zinc-200 transition-all group">
                  <div className="flex items-center justify-between mb-2">
                    <p className="text-[11px] font-semibold text-zinc-600">{c.service}</p>
                    <div className="flex gap-0.5 opacity-0 group-hover:opacity-100 transition-opacity">
                      <button onClick={() => togglePass(c.id)} className="p-1 text-zinc-300 hover:text-zinc-500 rounded transition-colors">
                        {showPass[c.id] ? <EyeOff size={12} /> : <Eye size={12} />}
                      </button>
                      <button onClick={() => copyText(c.pass || '', c.id)} className="p-1 text-zinc-300 hover:text-zinc-500 rounded transition-colors">
                        {copied === c.id ? <Check size={12} className="text-emerald-500" /> : <Copy size={12} />}
                      </button>
                    </div>
                  </div>
                  <div className="space-y-1 text-[10px]">
                    <div className="flex justify-between">
                      <span className="text-zinc-300">Usuario</span>
                      <span className="text-zinc-500 font-mono font-medium">{c.user || '—'}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-zinc-300">Contrase{'\u00f1'}a</span>
                      <span className="text-zinc-500 font-mono font-medium tracking-wider">
                        {showPass[c.id] ? c.pass : '••••••••'}
                      </span>
                    </div>
                  </div>
                </div>
              ))}
              {credItems.length === 0 && (
                <p className="text-[11px] text-zinc-300 text-center py-6">No hay accesos compartidos</p>
              )}
            </motion.div>
          )}

          {/* ── Documents Tab ── */}
          {activeTab === 'docs' && (
            <motion.div
              key="docs"
              initial={{ opacity: 0, x: -8 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: 8 }}
              transition={{ duration: 0.2 }}
              className="space-y-1.5"
            >
              {docItems.map((a, i) => (
                <div
                  key={a.id || i}
                  onClick={() => a.url && window.open(a.url, '_blank')}
                  className="flex items-center justify-between p-2.5 bg-zinc-50/80 border border-zinc-100 rounded-xl hover:border-zinc-200 transition-all cursor-pointer group"
                >
                  <div className="flex items-center gap-2.5">
                    <div className="p-1.5 bg-white rounded-lg text-zinc-300 group-hover:text-indigo-500 transition-colors border border-zinc-100">
                      {getDocIcon(a.type)}
                    </div>
                    <div>
                      <p className="text-[11px] font-semibold text-zinc-600 group-hover:text-zinc-800 transition-colors">{a.name}</p>
                      <p className="text-[9px] text-zinc-300">{a.size} · {a.type}</p>
                    </div>
                  </div>
                  <button className="p-1 text-zinc-200 group-hover:text-indigo-500 transition-all">
                    <Download size={13} />
                  </button>
                </div>
              ))}
              {docItems.length === 0 && (
                <p className="text-[11px] text-zinc-300 text-center py-6">No hay documentos compartidos</p>
              )}
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </motion.div>
  );
};

export default ResourcesPanel;
