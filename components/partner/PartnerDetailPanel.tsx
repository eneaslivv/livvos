/**
 * PartnerDetailPanel — slide-over with referral code + link +
 * commission model + activity counters + payouts list + widgets
 * builder. Same shape pattern as BrandDetailPanel.
 *
 * Sections (collapsible):
 *   1. Identity      — name, company, email, type, brand_color, avatar
 *   2. Referral      — referral_code + auto-generated link + copy CTAs
 *   3. Commission    — kind / amount / currency / applies_to
 *   4. Settings      — attribution_days, min_payout, portal_access, status
 *   5. Widgets       — list of widgets + "+ New widget" → opens builder
 *   6. Payouts       — list from partner_payouts (read-only; settle UI lives in Finance)
 */
import React, { useEffect, useMemo, useState } from 'react';
import { createPortal } from 'react-dom';
import { motion, AnimatePresence } from 'framer-motion';
import { Icons } from '../ui/Icons';
import { SPRING_ENTER, SPRING_TAP, TAP_SCALE } from '../../lib/ui/motion';
import { usePartners } from '../../hooks/usePartners';
import { supabase } from '../../lib/supabase';
import { errorLogger } from '../../lib/errorLogger';
import type { Partner, PartnerType, PartnerCommissionModel, PartnerWidget, PartnerWidgetType } from '../../types';
import { WidgetBuilder } from './WidgetBuilder';

interface Props {
  partner: Partner | null;
  isOpen: boolean;
  onClose: () => void;
}

const Field: React.FC<{ label: string; children: React.ReactNode }> = ({ label, children }) => (
  <div>
    <label className="block font-mono text-[9.5px] uppercase tracking-[0.18em] text-zinc-400 mb-1">{label}</label>
    {children}
  </div>
);

const inputCls = 'w-full px-2.5 py-1.5 text-[12.5px] bg-transparent border border-zinc-200 dark:border-zinc-700/60 rounded-md outline-none focus:border-zinc-400 dark:focus:border-zinc-500 text-zinc-800 dark:text-zinc-200 placeholder:text-zinc-400 dark:placeholder:text-zinc-600';

const SectionHeader: React.FC<{ icon: React.ReactNode; title: string; open: boolean; onToggle: () => void; right?: React.ReactNode }> = ({ icon, title, open, onToggle, right }) => (
  <button
    type="button"
    onClick={onToggle}
    className="w-full flex items-center gap-2.5 py-3 px-1 text-left border-b border-zinc-100 dark:border-zinc-800/60 hover:bg-zinc-50/50 dark:hover:bg-zinc-800/30 transition-colors"
  >
    <span className="w-5 h-5 flex items-center justify-center text-zinc-400">{icon}</span>
    <span className="text-[12.5px] font-medium text-zinc-800 dark:text-zinc-100 flex-1 tracking-[-0.005em]">{title}</span>
    {right}
    <Icons.ChevronDown size={12} className={`text-zinc-400 transition-transform ${open ? 'rotate-180' : ''}`} />
  </button>
);

export const PartnerDetailPanel: React.FC<Props> = ({ partner, isOpen, onClose }) => {
  const { upsertPartner, deletePartner, widgets, addWidget, updateWidget, removeWidget, generateReferralCode } = usePartners();
  const isNew = !partner;

  const [draft, setDraft] = useState<Partner | null>(null);
  const [open, setOpen] = useState({ identity: true, referral: true, commission: false, settings: false, widgets: false, payouts: false });
  const [saving, setSaving] = useState(false);
  const [copyState, setCopyState] = useState<'idle' | 'copied'>('idle');
  const [widgetBuilderOpen, setWidgetBuilderOpen] = useState(false);
  const [editingWidget, setEditingWidget] = useState<PartnerWidget | null>(null);
  const [payouts, setPayouts] = useState<Array<{ id: string; amount: number; method: string | null; status: string; paid_at: string | null; created_at: string }>>([]);

  useEffect(() => {
    if (partner) {
      setDraft(partner);
    } else if (isOpen && !partner) {
      setDraft({
        id: '', tenant_id: '', name: '', email: null, company: null,
        type: 'referrer', referral_code: generateReferralCode(),
        referral_link: null,
        commission_model: { kind: 'flat', amount: 200, currency: 'USD', applies_to: 'first_payment' },
        attribution_days: 30, min_payout: 100, status: 'invited', portal_access: true,
        avatar_url: null, brand_color: null, notes: null,
        created_at: '', updated_at: '',
      } as Partner);
    }
  }, [partner, isOpen, generateReferralCode]);

  // Load payouts lazily (only when the partner exists and the panel opens).
  useEffect(() => {
    if (!partner?.id) { setPayouts([]); return; }
    (async () => {
      const { data, error } = await supabase
        .from('partner_payouts')
        .select('id, amount, method, status, paid_at, created_at')
        .eq('partner_id', partner.id)
        .order('created_at', { ascending: false })
        .limit(20);
      if (!error) setPayouts(data as any[]);
    })();
  }, [partner?.id]);

  const partnerWidgets = useMemo(() => partner ? widgets.filter(w => w.partner_id === partner.id) : [], [partner, widgets]);

  if (!isOpen || !draft) return null;

  const portalUrl = (() => {
    if (typeof window === 'undefined') return '';
    return `${window.location.origin}/portal/${draft.referral_code}`;
  })();

  const copyReferralLink = async () => {
    try {
      await navigator.clipboard.writeText(portalUrl);
      setCopyState('copied');
      setTimeout(() => setCopyState('idle'), 1500);
    } catch {/* ignore */}
  };

  const toggle = (k: keyof typeof open) => setOpen(s => ({ ...s, [k]: !s[k] }));

  const handleSave = async () => {
    if (!draft.name.trim() || !draft.referral_code.trim()) return;
    setSaving(true);
    try {
      const link = draft.referral_link || (typeof window !== 'undefined' ? `${window.location.origin}/portal/${draft.referral_code}` : null);
      await upsertPartner({
        ...(draft.id ? { id: draft.id } : {}),
        name: draft.name,
        email: draft.email,
        company: draft.company,
        type: draft.type,
        referral_code: draft.referral_code,
        referral_link: link,
        commission_model: draft.commission_model,
        attribution_days: draft.attribution_days,
        min_payout: draft.min_payout,
        status: draft.status,
        portal_access: draft.portal_access,
        avatar_url: draft.avatar_url,
        brand_color: draft.brand_color,
        notes: draft.notes,
      });
      onClose();
    } catch (e) {
      errorLogger.warn('save partner failed', e);
    } finally {
      setSaving(false);
    }
  };

  return createPortal(
    <AnimatePresence>
      <motion.div
        initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} transition={{ duration: 0.18 }}
        className="fixed inset-0 z-50 flex justify-end bg-black/15 dark:bg-black/40 backdrop-blur-[2px]"
        onClick={onClose}
      >
        <motion.aside
          initial={{ x: '100%' }} animate={{ x: 0 }} exit={{ x: '100%' }} transition={SPRING_ENTER}
          onClick={(e) => e.stopPropagation()}
          className="h-full w-full max-w-[640px] bg-white dark:bg-zinc-950 border-l border-zinc-200/60 dark:border-zinc-800 shadow-[-20px_0_60px_-10px_rgba(0,0,0,0.08)] flex flex-col overflow-hidden"
        >
          {/* Header */}
          <div className="px-5 py-4 border-b border-zinc-200/40 dark:border-zinc-800/60 flex items-start justify-between gap-3 shrink-0">
            <div className="flex items-center gap-3 min-w-0">
              <div
                className="w-11 h-11 rounded-xl flex items-center justify-center text-[11px] font-semibold shrink-0 border border-zinc-200/50 dark:border-zinc-700/60 text-white"
                style={{ background: draft.brand_color || '#3f3f46' }}
              >
                {draft.avatar_url
                  ? <img src={draft.avatar_url} alt="" className="w-full h-full object-cover rounded-xl" />
                  : (draft.name || 'P').split(' ').map(p => p[0]).slice(0, 2).join('').toUpperCase()}
              </div>
              <div className="min-w-0">
                <input
                  value={draft.name}
                  onChange={(e) => setDraft({ ...draft, name: e.target.value })}
                  placeholder="Partner name"
                  className="text-[15.5px] font-semibold bg-transparent border-0 outline-none w-full tracking-[-0.012em] text-zinc-900 dark:text-zinc-100 placeholder:text-zinc-400"
                />
                <div className="text-[11.5px] text-zinc-500 dark:text-zinc-400 mt-0.5 truncate font-mono">
                  {draft.referral_code} · {draft.type}
                </div>
              </div>
            </div>
            <div className="flex items-center gap-0.5 shrink-0">
              <select
                value={draft.status}
                onChange={(e) => setDraft({ ...draft, status: e.target.value as Partner['status'] })}
                className="text-[10.5px] font-semibold uppercase tracking-wider bg-transparent border border-zinc-200 dark:border-zinc-700 rounded-md px-2 py-1 outline-none text-zinc-700 dark:text-zinc-200 cursor-pointer"
              >
                <option value="invited">Invited</option>
                <option value="active">Active</option>
                <option value="paused">Paused</option>
                <option value="archived">Archived</option>
              </select>
              <button onClick={onClose} className="p-1.5 rounded-md text-zinc-400 hover:bg-zinc-100 dark:hover:bg-zinc-800">
                <Icons.X size={14} />
              </button>
            </div>
          </div>

          {/* Body */}
          <div className="flex-1 overflow-y-auto overscroll-contain min-h-0 px-5">

            {/* 1 — Identity */}
            <SectionHeader icon={<Icons.User size={12} />} title="Identity" open={open.identity} onToggle={() => toggle('identity')} />
            <AnimatePresence initial={false}>{open.identity && (
              <motion.div initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: 'auto' }} exit={{ opacity: 0, height: 0 }} className="overflow-hidden">
                <div className="grid grid-cols-2 gap-3 py-3">
                  <Field label="Email"><input value={draft.email || ''} onChange={(e) => setDraft({ ...draft, email: e.target.value || null })} placeholder="contact@…" className={inputCls} type="email" /></Field>
                  <Field label="Company"><input value={draft.company || ''} onChange={(e) => setDraft({ ...draft, company: e.target.value || null })} placeholder="—" className={inputCls} /></Field>
                  <Field label="Type">
                    <select value={draft.type} onChange={(e) => setDraft({ ...draft, type: e.target.value as PartnerType })} className={inputCls}>
                      <option value="referrer">Referrer</option>
                      <option value="affiliate">Affiliate</option>
                      <option value="agency">Agency</option>
                      <option value="reseller">Reseller</option>
                      <option value="creator">Creator</option>
                    </select>
                  </Field>
                  <Field label="Brand color"><input value={draft.brand_color || ''} onChange={(e) => setDraft({ ...draft, brand_color: e.target.value || null })} placeholder="#3f3f46" className={inputCls} /></Field>
                  <Field label="Avatar URL"><input value={draft.avatar_url || ''} onChange={(e) => setDraft({ ...draft, avatar_url: e.target.value || null })} placeholder="https://…" className={inputCls} /></Field>
                  <div className="col-span-2">
                    <Field label="Notes">
                      <textarea value={draft.notes || ''} onChange={(e) => setDraft({ ...draft, notes: e.target.value || null })} rows={2} placeholder="Anything to remember about this partner" className={inputCls + ' resize-y'} />
                    </Field>
                  </div>
                </div>
              </motion.div>
            )}</AnimatePresence>

            {/* 2 — Referral */}
            <SectionHeader icon={<Icons.Link size={12} />} title="Referral link & code" open={open.referral} onToggle={() => toggle('referral')} />
            <AnimatePresence initial={false}>{open.referral && (
              <motion.div initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: 'auto' }} exit={{ opacity: 0, height: 0 }} className="overflow-hidden">
                <div className="py-3 space-y-3">
                  <Field label="Referral code">
                    <div className="flex gap-1.5">
                      <input
                        value={draft.referral_code}
                        onChange={(e) => setDraft({ ...draft, referral_code: e.target.value.toUpperCase().replace(/[^A-Z0-9]/g, '') })}
                        placeholder="ABC123"
                        className={inputCls + ' font-mono tracking-wider uppercase'}
                      />
                      <button
                        type="button"
                        onClick={() => setDraft({ ...draft, referral_code: generateReferralCode() })}
                        className="px-2.5 py-1.5 text-[11px] font-semibold rounded-md text-zinc-500 hover:bg-zinc-100 dark:hover:bg-zinc-800"
                        title="Regenerate"
                      >
                        <Icons.RefreshCw size={11} />
                      </button>
                    </div>
                  </Field>
                  <Field label="Portal URL (auto-generated)">
                    <div className="flex gap-1.5">
                      <input value={portalUrl} readOnly className={inputCls + ' font-mono text-[11.5px] bg-zinc-50/60 dark:bg-zinc-900/40'} />
                      <motion.button
                        type="button"
                        onClick={copyReferralLink}
                        whileTap={{ scale: TAP_SCALE, transition: SPRING_TAP }}
                        className="inline-flex items-center gap-1.5 px-2.5 py-1.5 text-[11px] font-semibold rounded-md bg-zinc-900 dark:bg-zinc-100 text-white dark:text-zinc-900"
                      >
                        {copyState === 'copied' ? <><Icons.Check size={11} /> Copied</> : <><Icons.Link size={11} /> Copy</>}
                      </motion.button>
                    </div>
                  </Field>
                  <p className="text-[10.5px] text-zinc-500 dark:text-zinc-400 leading-relaxed">
                    Leads arriving at <code className="font-mono px-1 bg-zinc-100 dark:bg-zinc-800 rounded">/portal/{draft.referral_code}</code> auto-tag with this partner. The cross-module trigger pipes them through to the sales pipeline + flags the commission.
                  </p>
                </div>
              </motion.div>
            )}</AnimatePresence>

            {/* 3 — Commission */}
            <SectionHeader icon={<Icons.DollarSign size={12} />} title="Commission model" open={open.commission} onToggle={() => toggle('commission')} />
            <AnimatePresence initial={false}>{open.commission && (
              <motion.div initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: 'auto' }} exit={{ opacity: 0, height: 0 }} className="overflow-hidden">
                <div className="grid grid-cols-2 gap-3 py-3">
                  <Field label="Kind">
                    <select
                      value={draft.commission_model.kind}
                      onChange={(e) => setDraft({ ...draft, commission_model: { ...draft.commission_model, kind: e.target.value as PartnerCommissionModel['kind'] } })}
                      className={inputCls}
                    >
                      <option value="flat">Flat amount</option>
                      <option value="percent">Percent of deal</option>
                      <option value="recurring">Recurring monthly</option>
                    </select>
                  </Field>
                  <Field label={draft.commission_model.kind === 'percent' ? 'Percent' : 'Amount'}>
                    <input
                      type="number"
                      value={draft.commission_model.amount}
                      onChange={(e) => setDraft({ ...draft, commission_model: { ...draft.commission_model, amount: Number(e.target.value) || 0 } })}
                      className={inputCls}
                    />
                  </Field>
                  <Field label="Currency">
                    <input
                      value={draft.commission_model.currency || 'USD'}
                      onChange={(e) => setDraft({ ...draft, commission_model: { ...draft.commission_model, currency: e.target.value.toUpperCase() } })}
                      className={inputCls + ' uppercase font-mono'}
                    />
                  </Field>
                  <Field label="Applies to">
                    <select
                      value={draft.commission_model.applies_to || 'first_payment'}
                      onChange={(e) => setDraft({ ...draft, commission_model: { ...draft.commission_model, applies_to: e.target.value as any } })}
                      className={inputCls}
                    >
                      <option value="first_payment">First payment</option>
                      <option value="first_12mo">First 12 months</option>
                      <option value="lifetime">Lifetime</option>
                    </select>
                  </Field>
                  <div className="col-span-2">
                    <Field label="Notes (internal)">
                      <textarea
                        value={draft.commission_model.notes || ''}
                        onChange={(e) => setDraft({ ...draft, commission_model: { ...draft.commission_model, notes: e.target.value } })}
                        rows={2}
                        placeholder="Negotiated terms, edge cases, etc."
                        className={inputCls + ' resize-y'}
                      />
                    </Field>
                  </div>
                </div>
              </motion.div>
            )}</AnimatePresence>

            {/* 4 — Settings */}
            <SectionHeader icon={<Icons.Settings size={12} />} title="Settings" open={open.settings} onToggle={() => toggle('settings')} />
            <AnimatePresence initial={false}>{open.settings && (
              <motion.div initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: 'auto' }} exit={{ opacity: 0, height: 0 }} className="overflow-hidden">
                <div className="grid grid-cols-2 gap-3 py-3">
                  <Field label="Attribution window (days)">
                    <input type="number" value={draft.attribution_days} onChange={(e) => setDraft({ ...draft, attribution_days: Number(e.target.value) || 0 })} className={inputCls} />
                  </Field>
                  <Field label="Min payout ($)">
                    <input type="number" value={draft.min_payout} onChange={(e) => setDraft({ ...draft, min_payout: Number(e.target.value) || 0 })} className={inputCls} />
                  </Field>
                  <div className="col-span-2 flex items-center justify-between py-1">
                    <span className="text-[12.5px] text-zinc-700 dark:text-zinc-200">Portal access</span>
                    <button
                      type="button"
                      onClick={() => setDraft({ ...draft, portal_access: !draft.portal_access })}
                      className={`relative w-9 h-5 rounded-full transition-colors ${draft.portal_access ? 'bg-emerald-500' : 'bg-zinc-300 dark:bg-zinc-700'}`}
                    >
                      <span className={`absolute top-0.5 w-4 h-4 rounded-full bg-white transition-transform ${draft.portal_access ? 'translate-x-4' : 'translate-x-0.5'}`} />
                    </button>
                  </div>
                </div>
              </motion.div>
            )}</AnimatePresence>

            {/* 5 — Widgets */}
            <SectionHeader
              icon={<Icons.Briefcase size={12} />}
              title="Embeddable widgets"
              open={open.widgets}
              onToggle={() => toggle('widgets')}
              right={<span className="font-mono text-[10px] text-zinc-400 mr-1.5">{partnerWidgets.length}</span>}
            />
            <AnimatePresence initial={false}>{open.widgets && (
              <motion.div initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: 'auto' }} exit={{ opacity: 0, height: 0 }} className="overflow-hidden">
                <div className="py-3 space-y-2">
                  {partnerWidgets.map(w => (
                    <div key={w.id} className="p-3 rounded-lg border border-zinc-200 dark:border-zinc-700 bg-white dark:bg-zinc-900">
                      <div className="flex items-center justify-between mb-1">
                        <div className="flex items-center gap-2">
                          <span className="font-mono text-[9.5px] uppercase tracking-wider bg-zinc-100 dark:bg-zinc-800 text-zinc-600 px-1.5 py-0.5 rounded">{w.type}</span>
                          <span className="text-[12.5px] font-medium text-zinc-800 dark:text-zinc-100">{w.name || w.config?.headline || '(no name)'}</span>
                        </div>
                        <div className="flex items-center gap-1">
                          <button onClick={() => { setEditingWidget(w); setWidgetBuilderOpen(true); }} className="text-zinc-400 hover:text-zinc-700 dark:hover:text-zinc-200" title="Edit">
                            <Icons.Edit size={12} />
                          </button>
                          <button onClick={() => removeWidget(w.id)} className="text-zinc-400 hover:text-rose-500" title="Delete">
                            <Icons.X size={12} />
                          </button>
                        </div>
                      </div>
                      <div className="flex items-center gap-4 text-[10.5px] text-zinc-500 font-mono">
                        <span>{w.views} views</span>
                        <span>{w.clicks} clicks</span>
                        <span>{w.conversions} conv.</span>
                        <span className="ml-auto">{w.status}</span>
                      </div>
                    </div>
                  ))}
                  <motion.button
                    type="button"
                    whileTap={{ scale: TAP_SCALE, transition: SPRING_TAP }}
                    onClick={() => { setEditingWidget(null); setWidgetBuilderOpen(true); }}
                    disabled={!partner?.id}
                    className="w-full inline-flex items-center justify-center gap-1.5 px-3 py-2 rounded-md border border-dashed border-zinc-300 dark:border-zinc-700 text-[11.5px] font-semibold text-zinc-600 dark:text-zinc-300 hover:bg-zinc-50 dark:hover:bg-zinc-800/60 disabled:opacity-40"
                  >
                    <Icons.Plus size={11} /> New widget
                  </motion.button>
                  {!partner?.id && <p className="text-[10.5px] text-zinc-400 text-center">Save the partner first to add widgets.</p>}
                </div>
              </motion.div>
            )}</AnimatePresence>

            {/* 6 — Payouts */}
            <SectionHeader
              icon={<Icons.DollarSign size={12} />}
              title="Payouts"
              open={open.payouts}
              onToggle={() => toggle('payouts')}
              right={<span className="font-mono text-[10px] text-zinc-400 mr-1.5">{payouts.length}</span>}
            />
            <AnimatePresence initial={false}>{open.payouts && (
              <motion.div initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: 'auto' }} exit={{ opacity: 0, height: 0 }} className="overflow-hidden">
                <div className="py-3 space-y-1.5">
                  {payouts.length === 0 ? (
                    <div className="text-center py-6 text-[11px] text-zinc-400 italic font-mono">no payouts yet</div>
                  ) : (
                    payouts.map(p => (
                      <div key={p.id} className="flex items-center justify-between p-2.5 rounded-md bg-zinc-50/60 dark:bg-zinc-900/40 border border-zinc-100 dark:border-zinc-800">
                        <div>
                          <div className="text-[12.5px] font-medium text-zinc-800 dark:text-zinc-100 tabular-nums">${p.amount.toLocaleString()}</div>
                          <div className="text-[10.5px] text-zinc-500 font-mono">{p.method || '—'} · {new Date(p.created_at).toLocaleDateString()}</div>
                        </div>
                        <span className={`text-[9.5px] font-mono uppercase tracking-wider px-1.5 py-0.5 rounded ${
                          p.status === 'paid' ? 'bg-emerald-50 dark:bg-emerald-500/15 text-emerald-700 dark:text-emerald-300'
                          : 'bg-amber-50 dark:bg-amber-500/15 text-amber-700 dark:text-amber-300'
                        }`}>{p.status}</span>
                      </div>
                    ))
                  )}
                </div>
              </motion.div>
            )}</AnimatePresence>

            <div className="h-6" />
          </div>

          {/* Footer */}
          <div className="border-t border-zinc-200/40 dark:border-zinc-800/60 px-5 py-3 shrink-0 flex items-center justify-between gap-2">
            <button
              onClick={() => partner?.id && deletePartner(partner.id).then(onClose)}
              disabled={!partner?.id}
              className="text-[11px] text-zinc-400 hover:text-rose-500 disabled:opacity-30 transition-colors"
            >
              Delete partner
            </button>
            <div className="flex items-center gap-2">
              <button onClick={onClose} className="px-3 py-1.5 text-[11.5px] font-medium rounded-md text-zinc-600 dark:text-zinc-300 hover:bg-zinc-100 dark:hover:bg-zinc-800">
                Cancel
              </button>
              <motion.button
                type="button"
                whileTap={{ scale: TAP_SCALE, transition: SPRING_TAP }}
                disabled={!draft.name.trim() || !draft.referral_code.trim() || saving}
                onClick={handleSave}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-md bg-zinc-900 dark:bg-zinc-100 text-white dark:text-zinc-900 text-[11.5px] font-semibold disabled:opacity-40"
              >
                {saving ? 'Saving…' : (isNew ? 'Create partner' : 'Save changes')}
              </motion.button>
            </div>
          </div>
        </motion.aside>
      </motion.div>

      {/* Widget builder slide-in (on top of the partner panel) */}
      {widgetBuilderOpen && partner?.id && (
        <WidgetBuilder
          partner={partner}
          existing={editingWidget}
          onClose={() => { setWidgetBuilderOpen(false); setEditingWidget(null); }}
          onSave={async (type, config, name) => {
            if (editingWidget) {
              await updateWidget(editingWidget.id, { type, config, name } as any);
            } else {
              await addWidget(partner.id, type as PartnerWidgetType, config);
            }
            setWidgetBuilderOpen(false);
            setEditingWidget(null);
          }}
        />
      )}
    </AnimatePresence>,
    document.body,
  );
};
