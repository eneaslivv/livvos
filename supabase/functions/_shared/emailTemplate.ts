// Shared email template system for all Edge Functions.
//
// Design language: Livv Mailing System (Cream + Wine + Gold).
// All templates render to a 600px-wide content area on a cream canvas, with
// minimal Gmail-style chrome stripped (we ship to inboxes, not previews).
// Inline styles only; no <style> blocks, no external CSS, no web fonts —
// system stack with Inter preferred where available. Background images and
// gradient text are avoided because Outlook/iOS Mail render them poorly.

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

// ── CORS ─────────────────────────────────────────────
export const emailCorsHeaders = {
  'Access-Control-Allow-Origin': Deno.env.get('ALLOWED_ORIGINS') || '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, x-custom-version, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
}

// ── Design tokens (mirror of colors_and_type.css) ────
export const T = {
  cream50:  '#FDFBF7',
  cream100: '#F5F2EB',
  cream200: '#E6E2D8',
  cream300: '#D6D1C7',
  cream400: '#A8A29A',
  cream500: '#78736A',
  cream600: '#52525B',
  cream800: '#27272A',
  cream900: '#09090B',
  wine200:  '#5c1d18',
  wine400:  '#2C0405',
  wine500:  '#2A1818',
  wine700:  '#0F0505',
  parchment:'#EDE5D8',
  gold:     '#C4A35A',
  goldBright:'#E8BC59',
  sage:     '#769268',
  pink:     '#F1ADD8',
  fgBody:   '#5A3E3E',
} as const

const FONT_SANS = `Inter, -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif`
const FONT_MONO = `"JetBrains Mono", "SF Mono", Menlo, Consolas, monospace`
const FONT_SERIF = `Georgia, "Times New Roman", serif`

// ── Types ────────────────────────────────────────────
export interface TenantBranding {
  name: string
  logoUrl: string | null
}

export interface EmailLayoutOptions {
  accent: string
  brandName: string
  logoUrl: string | null
  greeting: string
  title?: string
  icon?: string
  bodyHtml: string
  ctaUrl?: string
  ctaText?: string
  footerExtra?: string
}

// ── Tenant branding lookup ───────────────────────────
export async function resolveTenantBranding(
  supabase: ReturnType<typeof createClient>,
  tenantId: string,
): Promise<TenantBranding> {
  try {
    const { data: tenant } = await supabase
      .from('tenants')
      .select('name, logo_url, logo_url_dark')
      .eq('id', tenantId)
      .single()
    return {
      name: (tenant?.name as string) || 'Livv',
      logoUrl: (tenant?.logo_url_dark as string) || (tenant?.logo_url as string) || null,
    }
  } catch {
    return { name: 'Livv', logoUrl: null }
  }
}

// ── Logo HTML (kept for back-compat with older call sites) ───
export function buildLogoHtml(
  logoUrl: string | null | undefined,
  brandName: string,
  _accent: string,
): string {
  return wordmark(brandName, logoUrl, false)
}

// ────────────────────────────────────────────────────
// Primitive builders — every template composes these.
// ────────────────────────────────────────────────────

const escapeHtml = (s: string) =>
  String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')

const wordmark = (brandName: string, logoUrl: string | null | undefined, light: boolean) => {
  if (logoUrl) {
    return `<img src="${escapeHtml(logoUrl)}" alt="${escapeHtml(brandName)}" height="22" style="display:inline-block;height:22px;width:auto;border:0;outline:none;text-decoration:none;${light ? 'filter:brightness(0) invert(1);' : ''}">`
  }
  // Text wordmark fallback — italic serif for the "v" tail to evoke the mark.
  const color = light ? T.parchment : T.cream900
  return `<span style="font-family:${FONT_SANS};font-weight:500;font-size:15px;letter-spacing:-0.02em;color:${color};">${escapeHtml(brandName)}<span style="color:${T.gold};">.</span></span>`
}

const eyebrow = (text: string, color?: string) =>
  `<span style="font-family:${FONT_SANS};font-size:10px;font-weight:500;letter-spacing:0.22em;text-transform:uppercase;color:${color || 'rgba(90,62,62,0.6)'};">© ${escapeHtml(text)}</span>`

const meta = (text: string, color?: string) =>
  `<span style="font-family:${FONT_MONO};font-size:10px;letter-spacing:0.1em;color:${color || T.cream500};">${escapeHtml(text)}</span>`

const dashedRule = (color?: string) =>
  `<div style="height:1px;width:100%;border-top:1px dashed ${color || 'rgba(90,62,62,0.28)'};line-height:0;font-size:0;">&nbsp;</div>`

const button = (label: string, href: string, opts: { fullWidth?: boolean; variant?: 'dark' | 'cream' } = {}) => {
  const isDark = (opts.variant ?? 'dark') === 'dark'
  const bg = isDark ? T.cream900 : T.cream100
  const fg = isDark ? T.cream50 : T.cream900
  const arrowBg = isDark ? T.cream50 : T.cream900
  const arrowFg = isDark ? T.cream900 : T.cream50
  const widthAttr = opts.fullWidth ? 'width:100%;' : ''
  // Use a single-row table so the arrow chip lines up cleanly across clients.
  return `<table role="presentation" cellpadding="0" cellspacing="0" border="0" style="${widthAttr}border-collapse:collapse;">
    <tr>
      <td style="border-radius:9999px;background:${bg};">
        <a href="${escapeHtml(href)}" style="display:block;padding:12px 22px;color:${fg};font-family:${FONT_SANS};font-weight:500;font-size:13px;letter-spacing:0.01em;text-decoration:none;border-radius:9999px;">
          <table role="presentation" cellpadding="0" cellspacing="0" border="0" style="${widthAttr}border-collapse:collapse;">
            <tr>
              <td style="vertical-align:middle;color:${fg};">${escapeHtml(label)}</td>
              <td align="right" style="vertical-align:middle;width:30px;">
                <span style="display:inline-block;width:30px;height:30px;border-radius:9999px;background:${arrowBg};color:${arrowFg};line-height:30px;text-align:center;font-size:13px;">&rarr;</span>
              </td>
            </tr>
          </table>
        </a>
      </td>
    </tr>
  </table>`
}

const field = (label: string, value: string, mono = false) =>
  `<div style="padding:10px 0;border-bottom:1px dashed ${T.cream200};">
    <div style="font-family:${FONT_MONO};font-size:9px;letter-spacing:0.16em;text-transform:uppercase;color:${T.cream500};margin-bottom:4px;">${escapeHtml(label)}</div>
    <div style="font-size:13px;color:${T.cream900};font-family:${mono ? FONT_MONO : FONT_SANS};">${escapeHtml(value)}</div>
  </div>`

const taskRow = (t: { title: string; project?: string; assignee?: string; due?: string; priority?: 'high' | 'med' | 'low'; status?: string }) => {
  const priColor = t.priority === 'high' ? T.wine200 : t.priority === 'med' ? T.gold : T.cream400
  const subtitleParts = [t.project, t.assignee, t.due ? `DUE ${t.due}` : null].filter(Boolean)
  return `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="border-collapse:collapse;border-bottom:1px dashed ${T.cream200};">
    <tr>
      <td style="padding:14px 0;vertical-align:middle;width:18px;"><span style="display:inline-block;width:7px;height:7px;border-radius:999px;background:${priColor};"></span></td>
      <td style="padding:14px 0;vertical-align:middle;">
        <div style="font-family:${FONT_SANS};font-size:13px;color:${T.cream900};line-height:1.3;margin-bottom:3px;">${escapeHtml(t.title)}</div>
        ${subtitleParts.length ? `<div style="font-family:${FONT_MONO};font-size:10.5px;letter-spacing:0.06em;text-transform:uppercase;color:${T.cream500};">${subtitleParts.map(escapeHtml).join(' · ')}</div>` : ''}
      </td>
      ${t.status ? `<td align="right" style="padding:14px 0 14px 12px;vertical-align:middle;white-space:nowrap;">
        <span style="display:inline-block;font-family:${FONT_MONO};font-size:9px;padding:3px 8px;border-radius:3px;background:${T.cream100};color:${T.wine200};letter-spacing:0.12em;text-transform:uppercase;">${escapeHtml(t.status)}</span>
      </td>` : ''}
    </tr>
  </table>`
}

const statCell = (s: { label: string; value: string; delta?: string; deltaPositive?: boolean; dark?: boolean; accent?: boolean }, isLast = false) => {
  const labelColor = s.dark ? T.cream400 : T.cream500
  const valueColor = s.accent ? T.gold : (s.dark ? T.parchment : T.cream900)
  const borderColor = s.dark ? 'rgba(237,229,216,0.18)' : T.cream200
  return `<td style="padding:16px 14px;border-right:${isLast ? 'none' : `1px dashed ${borderColor}`};vertical-align:top;">
    <div style="font-family:${FONT_MONO};font-size:9px;letter-spacing:0.16em;text-transform:uppercase;color:${labelColor};margin-bottom:8px;">${escapeHtml(s.label)}</div>
    <div style="font-family:${FONT_SANS};font-weight:300;font-size:36px;line-height:1;letter-spacing:-0.04em;color:${valueColor};">${escapeHtml(s.value)}</div>
    ${s.delta ? `<div style="margin-top:6px;font-size:10.5px;color:${s.deltaPositive ? T.sage : T.wine200};">${s.deltaPositive ? '&uarr;' : '&darr;'} ${escapeHtml(s.delta)}</div>` : ''}
  </td>`
}

const headerBlock = (opts: {
  brandName: string
  logoUrl: string | null
  eyebrowText: string
  eyebrowColor?: string
  metaText: string
  title: string
  dark?: boolean
}) => {
  const bg = opts.dark ? T.wine400 : '#ffffff'
  const fg = opts.dark ? T.parchment : T.cream900
  const border = opts.dark ? 'none' : `1px solid ${T.cream200}`
  return `<div style="padding:32px 36px 26px;background:${bg};color:${fg};border-bottom:${border};">
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="border-collapse:collapse;margin-bottom:22px;">
      <tr>
        <td>${wordmark(opts.brandName, opts.logoUrl, !!opts.dark)}</td>
        <td align="right">${meta(opts.metaText, opts.dark ? 'rgba(237,229,216,0.55)' : T.cream500)}</td>
      </tr>
    </table>
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="border-collapse:collapse;padding-bottom:12px;border-bottom:1px dashed ${opts.dark ? 'rgba(237,229,216,0.25)' : T.cream200};margin-bottom:18px;">
      <tr>
        <td>${eyebrow(opts.eyebrowText, opts.eyebrowColor)}</td>
      </tr>
    </table>
    <h1 style="margin:0;font-family:${FONT_SANS};font-weight:300;font-size:28px;line-height:1.1;letter-spacing:-0.04em;color:${fg};">${opts.title}</h1>
  </div>`
}

const footerBlock = (opts: { context?: 'team' | 'client'; dark?: boolean; brandName: string; logoUrl: string | null; unsubscribeUrl?: string; settingsUrl?: string }) => {
  const dark = !!opts.dark
  const bg = dark ? T.cream900 : T.cream50
  const border = dark ? T.wine700 : T.cream200
  const linkColor = dark ? T.cream400 : T.cream500
  const underline = dark ? T.cream500 : T.cream300
  const ctx = opts.context === 'client'
    ? "You're receiving this as a partner of Livv Studio."
    : "You're getting this because you're part of the Livv space team."
  return `<div style="padding:28px 36px 24px;background:${bg};border-top:1px solid ${border};color:${linkColor};font-family:${FONT_SANS};font-size:11px;">
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="border-collapse:collapse;margin-bottom:14px;">
      <tr>
        <td>${wordmark(opts.brandName, opts.logoUrl, dark)}</td>
        <td align="right">${meta('livv.systems · Buenos Aires', dark ? T.cream500 : T.cream400)}</td>
      </tr>
    </table>
    ${dashedRule(dark ? 'rgba(255,255,255,0.12)' : 'rgba(90,62,62,0.2)')}
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="border-collapse:collapse;margin-top:14px;">
      <tr>
        <td style="font-size:10.5px;letter-spacing:0.04em;line-height:1.5;color:${linkColor};">${ctx}</td>
        <td align="right" style="font-size:10.5px;white-space:nowrap;">
          ${opts.settingsUrl ? `<a href="${escapeHtml(opts.settingsUrl)}" style="color:inherit;text-decoration:none;border-bottom:1px solid ${underline};margin-left:14px;">Notification settings</a>` : ''}
          ${opts.unsubscribeUrl ? `<a href="${escapeHtml(opts.unsubscribeUrl)}" style="color:inherit;text-decoration:none;border-bottom:1px solid ${underline};margin-left:14px;">Unsubscribe</a>` : ''}
        </td>
      </tr>
    </table>
    <div style="margin-top:18px;font-family:${FONT_MONO};font-size:9px;letter-spacing:0.14em;color:${dark ? T.cream500 : T.cream400};text-transform:uppercase;">© Livv Studio · livv space&trade;</div>
  </div>`
}

// Wrap any rendered body in the cream canvas + 600px white card.
const shell = (innerHtml: string, subjectPreview = '') => `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<meta http-equiv="X-UA-Compatible" content="IE=edge">
<title>${escapeHtml(subjectPreview)}</title>
</head>
<body style="margin:0;padding:0;background:${T.cream100};font-family:${FONT_SANS};color:${T.cream900};-webkit-text-size-adjust:100%;">
<!-- Preview text (hidden) -->
${subjectPreview ? `<div style="display:none;font-size:1px;color:${T.cream100};line-height:1px;max-height:0;max-width:0;opacity:0;overflow:hidden;">${escapeHtml(subjectPreview)}</div>` : ''}
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="background:${T.cream100};">
  <tr>
    <td align="center" style="padding:24px 12px;">
      <table role="presentation" width="600" cellpadding="0" cellspacing="0" border="0" style="width:600px;max-width:600px;background:#ffffff;border:1px solid ${T.cream200};border-radius:6px;overflow:hidden;">
        <tr><td>${innerHtml}</td></tr>
      </table>
    </td>
  </tr>
</table>
</body>
</html>`

// ────────────────────────────────────────────────────
// Six high-level email builders.
// All accept a typed payload and return a complete <html> string.
// ────────────────────────────────────────────────────

interface CommonOpts {
  brandName: string
  logoUrl: string | null
  unsubscribeUrl?: string
  settingsUrl?: string
}

// 1. New task assigned (internal team)
export interface TaskAssignedTeamPayload extends CommonOpts {
  taskTitle: string
  description?: string
  priority?: 'high' | 'med' | 'low'
  assignedByName: string
  assignedByEmailMeta?: string
  projectName?: string
  dueDate?: string
  estimate?: string
  reviewers?: string
  taskUrl: string
  taskNumber?: string
}

export function buildTaskAssignedTeamEmail(p: TaskAssignedTeamPayload): string {
  const priColor = p.priority === 'high' ? T.wine400 : p.priority === 'med' ? T.gold : T.cream400
  const priLabel = p.priority === 'high' ? 'High' : p.priority === 'med' ? 'Med' : 'Low'
  const inner = `
    <div style="padding:32px 36px 26px;background:#ffffff;border-bottom:1px solid ${T.cream200};">
      <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="border-collapse:collapse;margin-bottom:18px;">
        <tr>
          <td>${wordmark(p.brandName, p.logoUrl, false)}</td>
          <td align="right">${meta(`WDX® — TASK${p.taskNumber ? ` · ${p.taskNumber}` : ''}`)}</td>
        </tr>
      </table>
      ${eyebrow('New task assigned')}
      <h1 style="margin:12px 0 0;font-family:${FONT_SANS};font-weight:300;font-size:28px;line-height:1.1;letter-spacing:-0.04em;color:${T.cream900};">${escapeHtml(p.taskTitle)}</h1>
    </div>

    <div style="padding:0 36px;">
      <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="border-collapse:collapse;margin:20px 0 4px;background:${T.cream50};border:1px solid ${T.cream200};border-radius:8px;">
        <tr>
          <td style="padding:14px 18px;">
            <div style="font-family:${FONT_SANS};font-size:12.5px;color:${T.cream900};"><strong style="font-weight:500;">${escapeHtml(p.assignedByName)}</strong> assigned this to you</div>
            ${p.assignedByEmailMeta ? `<div style="font-family:${FONT_MONO};font-size:10.5px;letter-spacing:0.08em;text-transform:uppercase;color:${T.cream500};margin-top:2px;">${escapeHtml(p.assignedByEmailMeta)}</div>` : ''}
          </td>
          <td align="right" style="padding:14px 18px;white-space:nowrap;vertical-align:middle;">
            <span style="display:inline-block;font-family:${FONT_MONO};font-size:9px;padding:4px 10px;border-radius:3px;background:${priColor};color:${T.parchment};letter-spacing:0.14em;text-transform:uppercase;">${priLabel}</span>
          </td>
        </tr>
      </table>
    </div>

    ${p.description ? `<div style="padding:20px 36px 8px;background:#ffffff;">
      <div style="font-family:${FONT_SANS};font-size:13.5px;color:${T.fgBody};line-height:1.65;">${escapeHtml(p.description)}</div>
    </div>` : ''}

    <div style="padding:14px 36px 4px;background:#ffffff;">
      ${p.projectName ? field('Project', p.projectName) : ''}
      ${p.dueDate ? field('Due', p.dueDate) : ''}
      ${p.estimate ? field('Estimate', p.estimate) : ''}
      ${p.reviewers ? field('Reviewers', p.reviewers) : ''}
      ${field('Linked', p.taskUrl, true)}
    </div>

    <div style="padding:22px 36px 28px;background:#ffffff;">
      ${button('Open task in livv space', p.taskUrl, { fullWidth: true })}
    </div>

    ${footerBlock({ context: 'team', brandName: p.brandName, logoUrl: p.logoUrl, unsubscribeUrl: p.unsubscribeUrl, settingsUrl: p.settingsUrl })}
  `
  return shell(inner, `${p.assignedByName} assigned you "${p.taskTitle}"`)
}

// 2. Ready for review (client / partner)
export interface TaskReadyForReviewPayload extends CommonOpts {
  projectName: string
  intro?: string
  items: { title: string; project?: string; assignee?: string; due?: string; priority?: 'high' | 'med' | 'low' }[]
  reviewBoardUrl: string
  leadName?: string
  reviewNumber?: string
}

export function buildTaskReadyForReviewEmail(p: TaskReadyForReviewPayload): string {
  const inner = `
    <div style="padding:32px 36px 28px;background:#ffffff;border-bottom:1px solid ${T.cream200};">
      <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="border-collapse:collapse;margin-bottom:22px;">
        <tr>
          <td>${wordmark(p.brandName, p.logoUrl, false)}</td>
          <td align="right">${meta(`WDX® — REVIEW${p.reviewNumber ? ` · ${p.reviewNumber}` : ''}`)}</td>
        </tr>
      </table>
      <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="border-collapse:collapse;padding-bottom:12px;border-bottom:1px dashed ${T.cream200};margin-bottom:22px;">
        <tr>
          <td>${eyebrow('Ready for your review')}</td>
          <td align="right">${meta(p.projectName)}</td>
        </tr>
      </table>
      <h1 style="margin:0;font-family:${FONT_SANS};font-weight:300;font-size:26px;line-height:1.1;letter-spacing:-0.04em;color:${T.cream900};">A new round is packaged for you. A short, considered review window opens today.</h1>
    </div>

    ${p.intro ? `<div style="padding:22px 36px 0;background:#ffffff;">
      <div style="font-family:${FONT_SANS};font-size:13.5px;color:${T.fgBody};line-height:1.65;">${escapeHtml(p.intro)}</div>
    </div>` : ''}

    <div style="padding:18px 36px;background:#ffffff;">
      <div style="background:${T.cream50};border:1px solid ${T.cream200};border-radius:8px;padding:4px 18px;">
        ${p.items.map(t => taskRow({ ...t, status: 'Awaiting' })).join('')}
      </div>
    </div>

    <div style="padding:6px 36px 28px;background:#ffffff;">
      ${button('Open your review board', p.reviewBoardUrl, { fullWidth: true })}
      ${p.leadName ? `<div style="margin-top:16px;font-family:${FONT_SANS};font-size:11px;color:${T.cream500};text-align:center;line-height:1.5;">Your project lead is <span style="color:${T.wine200};border-bottom:1px solid ${T.cream300};">${escapeHtml(p.leadName)}</span>. Reply to this email or message them in the workspace.</div>` : ''}
    </div>

    ${footerBlock({ context: 'client', brandName: p.brandName, logoUrl: p.logoUrl, unsubscribeUrl: p.unsubscribeUrl, settingsUrl: p.settingsUrl })}
  `
  return shell(inner, `${p.projectName} — new deliverables ready for review`)
}

// 3. Weekly digest (internal team) — wine hero
export interface WeeklyDigestTeamPayload extends CommonOpts {
  weekLabel: string                      // e.g. "Wk 18 · 28 apr — 03 may"
  digestNumber?: string                  // e.g. "WK18"
  headline: string                       // long sentence summary
  intro?: string
  stats: { tasksClosed: number; openInProgress: number; overdue: number; velocityPerDay?: string | number }
  velocity?: { label: string; value: number; dim?: boolean }[]
  shipped?: { title: string; project?: string; assignee?: string; due?: string }[]
  attention?: { title: string; project?: string; assignee?: string; due?: string; priority?: 'high' | 'med' | 'low' }[]
  leadPulse?: { newCount: number; qualifiedCount: number; avgTimeToReply?: string }
  ctaUrl: string
}

export function buildWeeklyDigestTeamEmail(p: WeeklyDigestTeamPayload): string {
  const velocityRow = (p.velocity || []).map(d => {
    const max = Math.max(...(p.velocity || [{ value: 1 }]).map(x => x.value || 1), 1)
    const pct = Math.round((d.value / max) * 100)
    return `<td align="center" style="padding:0 4px;vertical-align:bottom;">
      <div style="display:inline-block;width:24px;height:64px;vertical-align:bottom;position:relative;">
        <div style="position:absolute;bottom:0;width:100%;height:${pct}%;background:${T.cream900};opacity:${d.dim ? '0.25' : '1'};border-radius:2px 2px 0 0;min-height:3px;">&nbsp;</div>
      </div>
      <div style="font-family:${FONT_MONO};font-size:8px;letter-spacing:0.1em;color:${T.cream500};text-transform:uppercase;margin-top:6px;">${escapeHtml(d.label)}</div>
    </td>`
  }).join('')

  const inner = `
    <!-- Dark wine hero -->
    <div style="background:${T.wine400};color:${T.parchment};padding:36px 36px 32px;">
      <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="border-collapse:collapse;margin-bottom:28px;">
        <tr>
          <td>${wordmark(p.brandName, p.logoUrl, true)}</td>
          <td align="right">${meta(`WDX® — DIGEST${p.digestNumber ? ` · ${p.digestNumber}` : ''}`, 'rgba(237,229,216,0.55)')}</td>
        </tr>
      </table>
      <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="border-collapse:collapse;padding-bottom:12px;border-bottom:1px dashed rgba(237,229,216,0.25);margin-bottom:22px;">
        <tr>
          <td>${eyebrow('Weekly digest', 'rgba(241,173,216,0.85)')}</td>
          <td align="right">${meta(p.weekLabel, 'rgba(241,173,216,0.7)')}</td>
        </tr>
      </table>
      <h1 style="margin:0;font-family:${FONT_SANS};font-weight:300;font-size:30px;line-height:1.05;letter-spacing:-0.045em;color:${T.parchment};">${escapeHtml(p.headline)}</h1>
      ${p.intro ? `<div style="margin-top:22px;font-size:12.5px;color:rgba(237,229,216,0.7);line-height:1.6;max-width:480px;">${escapeHtml(p.intro)}</div>` : ''}
    </div>

    <!-- Stats row (dark) -->
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="border-collapse:collapse;background:${T.wine700};border-top:1px solid rgba(237,229,216,0.08);">
      <tr>
        ${statCell({ label: 'Tasks closed', value: String(p.stats.tasksClosed), dark: true })}
        ${statCell({ label: 'Open · in progress', value: String(p.stats.openInProgress), dark: true })}
        ${statCell({ label: 'Overdue', value: String(p.stats.overdue).padStart(2, '0'), dark: true })}
        ${statCell({ label: 'Velocity', value: String(p.stats.velocityPerDay || '—'), dark: true, accent: true }, true)}
      </tr>
    </table>

    ${p.velocity && p.velocity.length ? `<div style="background:#ffffff;padding:26px 36px 22px;">
      <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="border-collapse:collapse;margin-bottom:16px;">
        <tr>
          <td>${eyebrow('Velocity — last 7 days')}</td>
          <td align="right">${meta('tasks/day')}</td>
        </tr>
      </table>
      <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="border-collapse:collapse;">
        <tr>${velocityRow}</tr>
      </table>
    </div>` : ''}

    ${p.shipped && p.shipped.length ? `<div style="padding:22px 36px 8px;background:#ffffff;border-top:1px dashed ${T.cream200};">
      <div style="margin-bottom:14px;">${eyebrow('Shipped this week')}</div>
      ${p.shipped.map(t => taskRow({ ...t, status: 'Shipped', priority: 'med' })).join('')}
    </div>` : ''}

    ${p.attention && p.attention.length ? `<div style="padding:22px 36px 8px;background:#ffffff;border-top:1px dashed ${T.cream200};">
      <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="border-collapse:collapse;margin-bottom:14px;">
        <tr>
          <td>${eyebrow('Wants your attention', T.wine200)}</td>
          <td align="right">${meta(`${String(p.attention.length).padStart(2, '0')} item${p.attention.length === 1 ? '' : 's'}`)}</td>
        </tr>
      </table>
      ${p.attention.map(t => taskRow({ ...t, status: t.due === 'yesterday' || t.due === 'today' ? 'Overdue' : 'Open' })).join('')}
    </div>` : ''}

    ${p.leadPulse ? `<div style="padding:22px 36px 24px;background:#ffffff;border-top:1px dashed ${T.cream200};">
      <div style="margin-bottom:14px;">${eyebrow('Lead pulse')}</div>
      <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="border-collapse:collapse;">
        <tr>
          <td style="padding:14px 16px;background:${T.cream50};border:1px solid ${T.cream200};border-radius:6px;width:33%;">
            ${meta('NEW · LAST 7 DAYS', T.cream500)}
            <div style="font-family:${FONT_SANS};font-weight:300;font-size:30px;color:${T.cream900};margin-top:6px;letter-spacing:-0.03em;">${String(p.leadPulse.newCount).padStart(2, '0')}</div>
          </td>
          <td style="width:8px;"></td>
          <td style="padding:14px 16px;background:${T.cream50};border:1px solid ${T.cream200};border-radius:6px;width:33%;">
            ${meta('QUALIFIED', T.cream500)}
            <div style="font-family:${FONT_SANS};font-weight:300;font-size:30px;margin-top:6px;letter-spacing:-0.03em;color:${T.gold};">${String(p.leadPulse.qualifiedCount).padStart(2, '0')}</div>
          </td>
          <td style="width:8px;"></td>
          <td style="padding:14px 16px;background:${T.cream50};border:1px solid ${T.cream200};border-radius:6px;width:34%;">
            ${meta('AVG · TIME TO REPLY', T.cream500)}
            <div style="font-family:${FONT_SANS};font-weight:300;font-size:30px;color:${T.cream900};margin-top:6px;letter-spacing:-0.03em;">${escapeHtml(p.leadPulse.avgTimeToReply || '—')}</div>
          </td>
        </tr>
      </table>
    </div>` : ''}

    <div style="padding:20px 36px 32px;background:#ffffff;">
      ${button('Open the week in livv space', p.ctaUrl, { fullWidth: true })}
    </div>

    ${footerBlock({ context: 'team', brandName: p.brandName, logoUrl: p.logoUrl, unsubscribeUrl: p.unsubscribeUrl, settingsUrl: p.settingsUrl })}
  `
  return shell(inner, p.headline)
}

// 4. Project update (client / partner)
export interface WeeklyDigestClientPayload extends CommonOpts {
  projectName: string                    // "Halcyon"
  weekLabel: string                      // "28 apr — 03 may"
  digestNumber?: string                  // "WK18"
  headline: string
  stats: { shipped: number; inReview?: number; hoursUsed?: number; budgetPct?: number }
  shipped?: { title: string; project?: string; assignee?: string; due?: string }[]
  decisionWaiting?: { title: string; description: string; ctaUrl: string }
  ctaUrl?: string
}

export function buildWeeklyDigestClientEmail(p: WeeklyDigestClientPayload): string {
  const inner = `
    ${headerBlock({
      brandName: p.brandName,
      logoUrl: p.logoUrl,
      eyebrowText: `Project update — ${p.projectName}`,
      metaText: `WDX® — ${p.projectName.toUpperCase()}${p.digestNumber ? ` · ${p.digestNumber}` : ''}`,
      title: p.headline,
    })}

    <!-- Stats row -->
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="border-collapse:collapse;background:${T.cream50};border-bottom:1px solid ${T.cream200};">
      <tr>
        ${statCell({ label: 'Shipped', value: String(p.stats.shipped).padStart(2, '0'), delta: 'on plan', deltaPositive: true })}
        ${statCell({ label: 'In review', value: String(p.stats.inReview ?? 0).padStart(2, '0') })}
        ${statCell({ label: 'Hours used', value: String(p.stats.hoursUsed ?? '—') })}
        ${statCell({ label: 'Budget', value: p.stats.budgetPct != null ? `${p.stats.budgetPct}%` : '—', accent: true }, true)}
      </tr>
    </table>

    ${p.shipped && p.shipped.length ? `<div style="padding:22px 36px 6px;background:#ffffff;">
      <div style="margin-bottom:14px;">${eyebrow('Shipped this week')}</div>
      ${p.shipped.map(t => taskRow({ ...t, status: 'Shipped', priority: 'med' })).join('')}
    </div>` : ''}

    ${p.decisionWaiting ? `<div style="padding:22px 36px;background:#ffffff;border-top:1px dashed ${T.cream200};">
      <div style="background:#ffffff;border:1px solid ${T.cream200};border-radius:10px;padding:20px 22px;">
        ${eyebrow('Waiting on you', T.gold)}
        <h3 style="margin:10px 0 8px;font-family:${FONT_SANS};font-weight:400;font-size:18px;color:${T.wine500};letter-spacing:-0.02em;line-height:1.3;">${escapeHtml(p.decisionWaiting.title)}</h3>
        <div style="font-family:${FONT_SANS};font-size:12.5px;color:${T.fgBody};line-height:1.6;margin-bottom:14px;">${escapeHtml(p.decisionWaiting.description)}</div>
        ${button('Review and decide', p.decisionWaiting.ctaUrl, { fullWidth: true })}
      </div>
    </div>` : p.ctaUrl ? `<div style="padding:22px 36px 28px;background:#ffffff;">
      ${button('Open the project', p.ctaUrl, { fullWidth: true })}
    </div>` : ''}

    ${footerBlock({ context: 'client', brandName: p.brandName, logoUrl: p.logoUrl, unsubscribeUrl: p.unsubscribeUrl, settingsUrl: p.settingsUrl })}
  `
  return shell(inner, p.headline)
}

// 5. New lead alert (internal team)
export interface NewLeadTeamPayload extends CommonOpts {
  leadName: string
  leadCompany?: string
  leadRole?: string
  leadEmail: string
  fitScore?: number
  source?: string
  budget?: string
  scope?: string
  quote?: string
  leadUrl: string
  leadNumber?: string
  suggestedNextStep?: string
}

export function buildNewLeadTeamEmail(p: NewLeadTeamPayload): string {
  const fit = Math.max(0, Math.min(100, Math.round(p.fitScore ?? 0)))
  const inner = `
    ${headerBlock({
      brandName: p.brandName,
      logoUrl: p.logoUrl,
      eyebrowText: 'New lead',
      eyebrowColor: T.gold,
      metaText: `WDX® — LEAD${p.leadNumber ? ` · ${p.leadNumber}` : ''}`,
      title: `${escapeHtml(p.leadName)}${p.leadCompany ? ` — ${escapeHtml(p.leadRole || 'contact')} at <span style="font-style:italic;font-family:${FONT_SERIF};color:${T.wine200};">${escapeHtml(p.leadCompany)}</span>` : ''}`,
    })}

    ${p.fitScore != null ? `<div style="padding:20px 36px;background:${T.cream50};border-bottom:1px solid ${T.cream200};">
      <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="border-collapse:collapse;">
        <tr>
          <td style="vertical-align:middle;width:140px;">
            ${meta('FIT SCORE', T.cream500)}
            <div style="margin-top:6px;font-family:${FONT_SANS};font-weight:300;font-size:36px;letter-spacing:-0.04em;color:${T.gold};">${fit}<span style="font-size:14px;color:${T.cream500};margin-left:4px;">/100</span></div>
          </td>
          <td style="vertical-align:middle;padding-left:16px;">
            <div style="height:6px;background:${T.cream200};border-radius:999px;overflow:hidden;">
              <div style="width:${fit}%;height:6px;background:${T.gold};border-radius:999px;line-height:0;font-size:0;">&nbsp;</div>
            </div>
          </td>
        </tr>
      </table>
    </div>` : ''}

    <div style="padding:22px 36px 8px;background:#ffffff;">
      <div style="font-family:${FONT_SANS};font-size:15px;font-weight:500;color:${T.cream900};">${escapeHtml(p.leadName)}</div>
      ${p.leadCompany || p.leadRole ? `<div style="font-family:${FONT_SANS};font-size:12px;color:${T.cream500};margin-top:2px;margin-bottom:14px;">${escapeHtml([p.leadRole, p.leadCompany].filter(Boolean).join(' · '))}</div>` : '<div style="margin-bottom:14px;"></div>'}
      ${field('Email', p.leadEmail, true)}
      ${p.leadCompany ? field('Company', p.leadCompany) : ''}
      ${p.scope ? field('Looking for', p.scope) : ''}
      ${p.budget ? field('Budget signal', p.budget) : ''}
      ${p.source ? field('Source', p.source) : ''}
    </div>

    ${p.quote ? `<div style="padding:20px 36px;background:#ffffff;border-top:1px dashed ${T.cream200};">
      <div style="margin-bottom:12px;">${eyebrow('In their words')}</div>
      <div style="padding:18px 22px;background:${T.cream50};border:1px solid ${T.cream200};border-left:2px solid ${T.gold};border-radius:0 6px 6px 0;font-size:13px;color:${T.wine500};line-height:1.65;font-style:italic;font-family:${FONT_SERIF};">"${escapeHtml(p.quote)}"</div>
    </div>` : ''}

    <div style="padding:20px 36px 28px;background:#ffffff;border-top:1px dashed ${T.cream200};">
      <div style="margin-bottom:12px;">${eyebrow('Suggested next step')}</div>
      ${p.suggestedNextStep ? `<div style="font-family:${FONT_SANS};font-size:12.5px;color:${T.fgBody};line-height:1.6;margin-bottom:16px;">${escapeHtml(p.suggestedNextStep)}</div>` : ''}
      ${button('Open lead in livv space', p.leadUrl, { fullWidth: true })}
    </div>

    ${footerBlock({ context: 'team', brandName: p.brandName, logoUrl: p.logoUrl, unsubscribeUrl: p.unsubscribeUrl, settingsUrl: p.settingsUrl })}
  `
  return shell(inner, `New lead · ${p.leadName}${p.leadCompany ? ` from ${p.leadCompany}` : ''}`)
}

// 6. Lead welcome reply (client / inbound prospect)
export interface LeadWelcomeReplyProject {
  title: string
  subtitle?: string                      // role / what was built
  category?: string                      // e.g. "Identity", "Web", "Motion"
  year?: string | number
  url?: string                           // public case-study URL
}

export interface LeadWelcomeReplyPayload extends CommonOpts {
  leadFirstName: string
  fromName: string                       // founder / sales rep name
  fromTitle?: string
  bodyParagraphs?: string[]
  steps?: { number: string; title: string; description: string }[]
  ctaUrl: string
  ctaLabel?: string
  // Optional SLA banner + recent-work showcase. Both render only if provided
  // so smaller / single-product tenants can keep the message focused.
  responseTimeText?: string              // e.g. "We reply within 4 business hours."
  projects?: LeadWelcomeReplyProject[]   // 2-4 recent works, rendered as a list
  portfolioUrl?: string                  // "See all work" link below the projects
}

export function buildLeadWelcomeReplyEmail(p: LeadWelcomeReplyPayload): string {
  const initials = (p.fromName || 'L').split(' ').map(s => s[0]).slice(0, 2).join('').toUpperCase()
  const defaultSteps = [
    { number: '01', title: 'A 30-min discovery call', description: 'No deck, no pitch. Just a real conversation about what you need to become.' },
    { number: '02', title: 'A scope memo within 48h', description: 'A short, written proposal with milestones, hours, and a fixed price.' },
    { number: '03', title: 'A kickoff if it fits', description: "We'd start in two weeks. You'd get direct access to our boards from day one." },
  ]
  const steps = p.steps && p.steps.length ? p.steps : defaultSteps

  const projects = (p.projects || []).slice(0, 4)

  const inner = `
    <div style="padding:40px 36px 36px;background:${T.cream50};border-bottom:1px solid ${T.cream200};">
      <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="border-collapse:collapse;margin-bottom:28px;">
        <tr>
          <td>${wordmark(p.brandName, p.logoUrl, false)}</td>
          <td align="right">${meta('WDX® — INTAKE')}</td>
        </tr>
      </table>
      ${eyebrow('Welcome to Livv Studio')}
      <h1 style="margin:14px 0 0;font-family:${FONT_SANS};font-weight:300;font-size:30px;line-height:1.05;letter-spacing:-0.045em;color:${T.cream900};max-width:460px;">${escapeHtml(p.leadFirstName)} — your message landed. Thank you for reaching out.</h1>
    </div>

    ${p.responseTimeText ? `<div style="padding:18px 36px;background:${T.wine400};color:${T.parchment};border-bottom:1px solid ${T.wine700};">
      <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="border-collapse:collapse;">
        <tr>
          <td style="vertical-align:middle;width:30px;">
            <span style="display:inline-block;width:22px;height:22px;border-radius:9999px;background:${T.gold};color:${T.wine400};line-height:22px;text-align:center;font-family:${FONT_SANS};font-weight:500;font-size:13px;">&#10004;</span>
          </td>
          <td style="vertical-align:middle;padding-left:8px;">
            <div style="font-family:${FONT_MONO};font-size:9px;letter-spacing:0.18em;text-transform:uppercase;color:rgba(241,173,216,0.85);margin-bottom:2px;">© Response time</div>
            <div style="font-family:${FONT_SANS};font-size:14px;color:${T.parchment};line-height:1.4;">${escapeHtml(p.responseTimeText)}</div>
          </td>
        </tr>
      </table>
    </div>` : ''}

    ${(p.bodyParagraphs && p.bodyParagraphs.length ? p.bodyParagraphs : [
      "I read your note this morning. The brief is exactly the kind of work we love: a brand with story, a product with care, and a team ready to commit.",
      "Here's what happens next, no pressure on either of us:",
    ]).map(par => `<div style="padding:18px 36px 0;background:#ffffff;">
      <div style="font-family:${FONT_SANS};font-size:14px;color:${T.fgBody};line-height:1.7;">${escapeHtml(par)}</div>
    </div>`).join('')}

    <div style="padding:18px 36px 8px;background:#ffffff;">
      ${steps.map((s, i) => `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="border-collapse:collapse;border-bottom:${i < steps.length - 1 ? `1px dashed ${T.cream200}` : 'none'};">
        <tr>
          <td style="padding:16px 0;vertical-align:top;width:38px;font-family:${FONT_MONO};font-size:11px;letter-spacing:0.14em;color:${T.gold};">${escapeHtml(s.number)}</td>
          <td style="padding:16px 0;vertical-align:top;">
            <div style="font-family:${FONT_SANS};font-weight:500;font-size:14px;color:${T.cream900};margin-bottom:4px;">${escapeHtml(s.title)}</div>
            <div style="font-family:${FONT_SANS};font-size:12.5px;color:${T.fgBody};line-height:1.55;">${escapeHtml(s.description)}</div>
          </td>
        </tr>
      </table>`).join('')}
    </div>

    ${projects.length ? `<div style="padding:24px 36px 8px;background:#ffffff;border-top:1px dashed ${T.cream200};">
      <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="border-collapse:collapse;margin-bottom:14px;">
        <tr>
          <td>${eyebrow('Recent work')}</td>
          <td align="right">${meta(`${String(projects.length).padStart(2, '0')} ${projects.length === 1 ? 'project' : 'projects'}`)}</td>
        </tr>
      </table>
      ${projects.map((proj, i) => {
        const titleHtml = proj.url
          ? `<a href="${escapeHtml(proj.url)}" style="color:${T.cream900};text-decoration:none;border-bottom:1px solid ${T.cream300};">${escapeHtml(proj.title)}</a>`
          : escapeHtml(proj.title)
        const subtitle = [proj.category, proj.subtitle, proj.year].filter(Boolean).map(escapeHtml as any).join(' · ')
        return `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="border-collapse:collapse;border-bottom:${i < projects.length - 1 ? `1px dashed ${T.cream200}` : 'none'};">
          <tr>
            <td style="padding:14px 0;vertical-align:top;width:8px;">
              <span style="display:inline-block;width:6px;height:6px;border-radius:9999px;background:${T.gold};margin-top:6px;"></span>
            </td>
            <td style="padding:14px 0 14px 12px;vertical-align:top;">
              <div style="font-family:${FONT_SANS};font-size:14px;color:${T.cream900};line-height:1.35;margin-bottom:4px;">${titleHtml}</div>
              ${subtitle ? `<div style="font-family:${FONT_MONO};font-size:10.5px;letter-spacing:0.1em;text-transform:uppercase;color:${T.cream500};">${subtitle}</div>` : ''}
            </td>
          </tr>
        </table>`
      }).join('')}
      ${p.portfolioUrl ? `<div style="text-align:center;margin-top:14px;">
        <a href="${escapeHtml(p.portfolioUrl)}" style="font-family:${FONT_SANS};font-size:11.5px;color:${T.cream500};text-decoration:none;border-bottom:1px solid ${T.cream300};">See all work &rarr;</a>
      </div>` : ''}
    </div>` : ''}

    <div style="padding:22px 36px 28px;background:#ffffff;${projects.length ? `border-top:1px dashed ${T.cream200};` : ''}">
      ${button(p.ctaLabel || 'Pick a time on my calendar', p.ctaUrl, { fullWidth: true })}
      <div style="margin-top:18px;font-family:${FONT_SANS};font-size:12px;color:${T.fgBody};line-height:1.6;">Or just reply to this email — it goes straight to me, not to a queue.</div>
      <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="border-collapse:collapse;margin-top:22px;padding-top:18px;border-top:1px dashed ${T.cream200};">
        <tr>
          <td style="vertical-align:middle;width:48px;">
            <span style="display:inline-block;width:40px;height:40px;border-radius:9999px;background:${T.wine400};color:${T.parchment};font-family:${FONT_SANS};font-weight:500;font-size:14px;line-height:40px;text-align:center;">${escapeHtml(initials)}</span>
          </td>
          <td style="vertical-align:middle;padding-left:12px;">
            <div style="font-family:${FONT_SANS};font-size:13px;font-weight:500;color:${T.cream900};">${escapeHtml(p.fromName)}</div>
            ${p.fromTitle ? `<div style="font-family:${FONT_SANS};font-size:11px;color:${T.cream500};margin-top:2px;">${escapeHtml(p.fromTitle)}</div>` : ''}
          </td>
        </tr>
      </table>
    </div>

    ${footerBlock({ context: 'client', brandName: p.brandName, logoUrl: p.logoUrl, unsubscribeUrl: p.unsubscribeUrl, settingsUrl: p.settingsUrl })}
  `
  return shell(inner, `${p.fromName}: thanks for reaching out`)
}

// ────────────────────────────────────────────────────
// Generic builder (compat layer for callers that haven't migrated yet)
// Renders any { greeting, title, bodyHtml, ctaUrl, ctaText } payload
// inside the new shell + footer.
// ────────────────────────────────────────────────────
export function wrapEmailHtml(options: EmailLayoutOptions): string {
  const ctaBlock = options.ctaUrl ? `<div style="padding:8px 0 0;">${button(options.ctaText || 'Open', options.ctaUrl, { fullWidth: true })}</div>` : ''
  const inner = `
    <div style="padding:32px 36px 26px;background:#ffffff;border-bottom:1px solid ${T.cream200};">
      <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="border-collapse:collapse;margin-bottom:18px;">
        <tr>
          <td>${wordmark(options.brandName, options.logoUrl, false)}</td>
          <td align="right">${meta(`WDX® — NOTIFY`)}</td>
        </tr>
      </table>
      ${options.title ? eyebrow(options.title) : ''}
      <h1 style="margin:12px 0 0;font-family:${FONT_SANS};font-weight:300;font-size:26px;line-height:1.1;letter-spacing:-0.04em;color:${T.cream900};">${escapeHtml(options.greeting)}</h1>
    </div>
    <div style="padding:24px 36px 8px;background:#ffffff;">
      <div style="font-family:${FONT_SANS};font-size:14px;line-height:1.65;color:${T.fgBody};">${options.bodyHtml}</div>
    </div>
    <div style="padding:16px 36px 32px;background:#ffffff;">${ctaBlock}</div>
    ${options.footerExtra ? `<div style="padding:0 36px 16px;background:#ffffff;font-family:${FONT_MONO};font-size:10px;letter-spacing:0.1em;color:${T.cream500};text-transform:uppercase;">${options.footerExtra}</div>` : ''}
    ${footerBlock({ context: 'team', brandName: options.brandName, logoUrl: options.logoUrl })}
  `
  return shell(inner, options.title || options.greeting)
}
