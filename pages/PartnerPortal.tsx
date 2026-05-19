/**
 * PartnerPortal — public-facing mini-site rendered when the URL is
 *   /portal/<referral_code>
 *
 * Bypasses auth. Pulls the partner row (filtered by referral_code +
 * status=active + portal_access=true via the RLS policy added in
 * migrations/2026-06-05_partners.sql) and renders a clean page
 * showing the partner's branding + commission terms + a "submit lead"
 * form that creates a lead tagged with this referral source.
 *
 * Reach the page by visiting:
 *   https://yourapp.com/portal/ABC123
 *
 * Detected in App.tsx — App reads the pathname and renders this
 * standalone (no Layout / no Sidebar).
 */
import React, { useEffect, useMemo, useState } from 'react';
import { supabase } from '../lib/supabase';
import { Icons } from '../components/ui/Icons';
import type { Partner } from '../types';

interface Props {
  code: string;
}

export const PartnerPortal: React.FC<Props> = ({ code }) => {
  const [partner, setPartner] = useState<Partner | null>(null);
  const [loading, setLoading] = useState(true);
  const [notFound, setNotFound] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const [form, setForm] = useState({ name: '', email: '', company: '', message: '' });
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const { data, error } = await supabase
        .from('partners')
        .select('id, tenant_id, name, company, type, referral_code, commission_model, brand_color, avatar_url, status, portal_access')
        .eq('referral_code', code)
        .eq('status', 'active')
        .eq('portal_access', true)
        .maybeSingle();
      if (cancelled) return;
      if (error || !data) {
        setNotFound(true);
        setLoading(false);
        return;
      }
      setPartner(data as Partner);
      setLoading(false);
    })();
    return () => { cancelled = true; };
  }, [code]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!partner) return;
    setSubmitting(true);
    setErr(null);
    try {
      // Insert the lead with this partner's referral code as source.
      // The existing cross-module triggers (2026-06-01) handle the
      // attribution + downstream pipeline plumbing.
      const { error } = await supabase
        .from('leads')
        .insert({
          tenant_id: partner.tenant_id,
          name: form.name.trim(),
          email: form.email.trim().toLowerCase(),
          company: form.company.trim() || null,
          message: form.message.trim() || null,
          source: `partner:${partner.referral_code}`,
          origin: 'partner_portal',
          utm: { source: 'partner', medium: 'portal', campaign: partner.referral_code },
        });
      if (error) throw error;
      setSubmitted(true);
    } catch (e) {
      setErr((e as Error).message || 'Could not submit. Try again in a moment.');
    } finally {
      setSubmitting(false);
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-zinc-50 dark:bg-zinc-950 flex items-center justify-center">
        <Icons.Loader size={20} className="animate-spin text-zinc-400" />
      </div>
    );
  }

  if (notFound || !partner) {
    return (
      <div className="min-h-screen bg-zinc-50 dark:bg-zinc-950 flex items-center justify-center px-4">
        <div className="max-w-md text-center">
          <Icons.AlertCircle size={28} className="mx-auto text-zinc-300 dark:text-zinc-700 mb-3" />
          <h1 className="text-[18px] font-semibold text-zinc-900 dark:text-zinc-100">Partner not found</h1>
          <p className="text-[13px] text-zinc-500 dark:text-zinc-400 mt-1.5">
            The referral code <code className="font-mono">{code}</code> isn't active. Ask the partner for an updated link.
          </p>
        </div>
      </div>
    );
  }

  const brandColor = partner.brand_color || '#18181b';
  const commission = partner.commission_model;

  return (
    <div className="min-h-screen bg-gradient-to-br from-zinc-50 via-white to-zinc-50 dark:from-zinc-950 dark:via-zinc-900 dark:to-zinc-950 flex items-center justify-center px-4 py-12">
      <div className="w-full max-w-2xl">
        {/* Branding header */}
        <div className="flex items-center gap-3 mb-6">
          <div
            className="w-12 h-12 rounded-xl flex items-center justify-center text-white text-[14px] font-semibold shrink-0"
            style={{ background: brandColor }}
          >
            {partner.avatar_url
              ? <img src={partner.avatar_url} alt="" className="w-full h-full object-cover rounded-xl" />
              : partner.name.split(' ').map(s => s[0]).slice(0, 2).join('').toUpperCase()}
          </div>
          <div>
            <div className="font-mono text-[10px] uppercase tracking-[0.22em] text-zinc-400">{partner.type} · LIVV partner</div>
            <h1 className="text-[22px] font-light tracking-[-0.025em] text-zinc-900 dark:text-zinc-100 leading-tight">{partner.name}</h1>
          </div>
        </div>

        {/* Card */}
        <div className="rounded-2xl border border-zinc-200/70 dark:border-zinc-800 bg-white dark:bg-zinc-900 shadow-sm overflow-hidden">
          {/* Top accent bar */}
          <div className="h-1.5 w-full" style={{ background: `linear-gradient(90deg, ${brandColor}, #f59e0b)` }} />

          <div className="p-6 sm:p-8">
            {submitted ? (
              <div className="text-center py-6">
                <div className="w-12 h-12 mx-auto rounded-full bg-emerald-50 dark:bg-emerald-500/15 flex items-center justify-center mb-3">
                  <Icons.CheckCircle size={20} className="text-emerald-500" />
                </div>
                <h2 className="text-[18px] font-semibold text-zinc-900 dark:text-zinc-100 mb-1">Thanks — we got it.</h2>
                <p className="text-[13px] text-zinc-500 dark:text-zinc-400">
                  {partner.name} forwarded your details. The LIVV team will reply within 24 hours.
                </p>
              </div>
            ) : (
              <>
                <h2 className="text-[18px] font-semibold text-zinc-900 dark:text-zinc-100 mb-1 tracking-[-0.012em]">
                  Send your project brief
                </h2>
                <p className="text-[13px] text-zinc-500 dark:text-zinc-400 mb-5">
                  Referred by <strong className="text-zinc-700 dark:text-zinc-200">{partner.name}</strong>. We'll get back to you within 24 hours.
                </p>

                <form onSubmit={handleSubmit} className="space-y-3">
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    <div>
                      <label className="block font-mono text-[10px] uppercase tracking-[0.18em] text-zinc-400 mb-1">Your name</label>
                      <input
                        required
                        value={form.name}
                        onChange={(e) => setForm({ ...form, name: e.target.value })}
                        className="w-full px-3 py-2 text-[13px] bg-zinc-50/70 dark:bg-zinc-800/60 border border-zinc-200 dark:border-zinc-700 rounded-lg outline-none focus:border-zinc-400 dark:focus:border-zinc-500 text-zinc-900 dark:text-zinc-100"
                      />
                    </div>
                    <div>
                      <label className="block font-mono text-[10px] uppercase tracking-[0.18em] text-zinc-400 mb-1">Email</label>
                      <input
                        required
                        type="email"
                        value={form.email}
                        onChange={(e) => setForm({ ...form, email: e.target.value })}
                        className="w-full px-3 py-2 text-[13px] bg-zinc-50/70 dark:bg-zinc-800/60 border border-zinc-200 dark:border-zinc-700 rounded-lg outline-none focus:border-zinc-400 dark:focus:border-zinc-500 text-zinc-900 dark:text-zinc-100"
                      />
                    </div>
                  </div>
                  <div>
                    <label className="block font-mono text-[10px] uppercase tracking-[0.18em] text-zinc-400 mb-1">Company</label>
                    <input
                      value={form.company}
                      onChange={(e) => setForm({ ...form, company: e.target.value })}
                      className="w-full px-3 py-2 text-[13px] bg-zinc-50/70 dark:bg-zinc-800/60 border border-zinc-200 dark:border-zinc-700 rounded-lg outline-none focus:border-zinc-400 dark:focus:border-zinc-500 text-zinc-900 dark:text-zinc-100"
                    />
                  </div>
                  <div>
                    <label className="block font-mono text-[10px] uppercase tracking-[0.18em] text-zinc-400 mb-1">What do you need?</label>
                    <textarea
                      value={form.message}
                      onChange={(e) => setForm({ ...form, message: e.target.value })}
                      rows={4}
                      placeholder="Project, timeline, budget — any context helps."
                      className="w-full px-3 py-2 text-[13px] bg-zinc-50/70 dark:bg-zinc-800/60 border border-zinc-200 dark:border-zinc-700 rounded-lg outline-none focus:border-zinc-400 dark:focus:border-zinc-500 text-zinc-900 dark:text-zinc-100 resize-y"
                    />
                  </div>
                  {err && <div className="text-[12px] text-rose-600 dark:text-rose-400">{err}</div>}
                  <button
                    type="submit"
                    disabled={submitting || !form.name.trim() || !form.email.trim()}
                    className="w-full inline-flex items-center justify-center gap-2 px-4 py-2.5 rounded-lg text-[13px] font-semibold text-white disabled:opacity-50 transition-transform hover:scale-[1.01] active:scale-[0.99]"
                    style={{ background: brandColor }}
                  >
                    {submitting ? <Icons.Loader size={13} className="animate-spin" /> : <Icons.Send size={13} />}
                    {submitting ? 'Sending…' : 'Send brief'}
                  </button>
                </form>
              </>
            )}
          </div>

          {/* Commission footer */}
          <div className="border-t border-zinc-100 dark:border-zinc-800/60 px-6 sm:px-8 py-3 bg-zinc-50/60 dark:bg-zinc-950/30 flex items-center justify-between text-[11px] text-zinc-500 dark:text-zinc-400 font-mono">
            <span>code · {partner.referral_code}</span>
            <span>
              {commission.kind === 'percent' ? `${commission.amount}%` : `$${commission.amount}${commission.kind === 'recurring' ? '/mo' : ''}`} · {commission.applies_to?.replace('_', ' ') || 'first payment'}
            </span>
          </div>
        </div>

        <p className="mt-4 text-center text-[11px] text-zinc-400 font-mono">
          Powered by <strong className="text-zinc-600 dark:text-zinc-300">LIVV OS</strong>
        </p>
      </div>
    </div>
  );
};
