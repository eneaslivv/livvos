// Single source of truth for "the public URL where this app is reachable".
// Used when we hand a link to someone outside the app (invitations, share
// links, OAuth callbacks). Always prefer the configured env var so an admin
// inviting users from a localhost dev session does not email a link nobody
// else can open. Falls back to window.location.origin so the helper still
// works in environments where VITE_APP_URL was forgotten — better than
// throwing.
export const appUrl = (): string => {
  const fromEnv = import.meta.env.VITE_APP_URL as string | undefined;
  if (fromEnv && fromEnv.trim()) return fromEnv.trim().replace(/\/+$/, '');
  if (typeof window !== 'undefined' && window.location?.origin) return window.location.origin;
  return '';
};
