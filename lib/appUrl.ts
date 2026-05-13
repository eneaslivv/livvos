// Single source of truth for "the public URL where this app is reachable".
// Used when we hand a link to someone outside the app (invitations, share
// links, OAuth callbacks).
//
// Hard-locked to the production URL so an admin inviting users from a
// localhost dev session can never accidentally email a link the recipient
// can't open. The previous behaviour (fall through to window.location.origin)
// caused exactly that — invites sent from localhost produced
// http://localhost:5173/accept-connection?token=... in the recipient's
// inbox. Always emit the public production URL instead.
//
// VITE_APP_URL is honoured ONLY when it's clearly a public URL (not
// localhost, not 127.0.0.1) — gives us a knob for staging environments
// without re-introducing the localhost footgun.
// Production URL — confirmed by the user. Don't change this without
// asking. If you need to support a staging environment, set
// VITE_APP_URL in that env's settings instead of editing this file.
const PRODUCTION_URL = 'https://www.livv.space';

const isPublicUrl = (url: string): boolean => {
  const u = url.trim().toLowerCase();
  if (!u) return false;
  if (u.includes('localhost')) return false;
  if (u.includes('127.0.0.1')) return false;
  if (u.includes('0.0.0.0')) return false;
  if (!u.startsWith('http://') && !u.startsWith('https://')) return false;
  return true;
};

export const appUrl = (): string => {
  const fromEnv = import.meta.env.VITE_APP_URL as string | undefined;
  if (fromEnv && isPublicUrl(fromEnv)) {
    return fromEnv.trim().replace(/\/+$/, '');
  }
  return PRODUCTION_URL;
};
