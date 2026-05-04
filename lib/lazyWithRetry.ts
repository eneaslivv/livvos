import React from 'react';

type Loader<T> = () => Promise<T>;

const RELOAD_FLAG_PREFIX = '__chunk_reload__:';
// We allow one reload per moduleId per RELOAD_DEBOUNCE_MS window. If a stale
// chunk error happens AGAIN after that window (e.g. user kept the tab open
// across two consecutive deploys), we reload again instead of giving up.
const RELOAD_DEBOUNCE_MS = 30_000;

function isChunkLoadError(err: unknown): boolean {
  if (!err) return false;
  const msg = (err as { message?: string })?.message || String(err);
  return (
    /Failed to fetch dynamically imported module/i.test(msg) ||
    /Loading chunk [\d]+ failed/i.test(msg) ||
    /Loading CSS chunk/i.test(msg) ||
    /Importing a module script failed/i.test(msg)
  );
}

// Force a hard, cache-busting reload. Browsers normally re-use cached
// assets on `location.reload()`, which defeats the purpose when the
// problem is a stale index.html still referencing missing chunks. Adding
// a `_v` query param invalidates the SW + HTTP cache for the document.
function hardReload() {
  if (typeof window === 'undefined') return;
  try {
    const url = new URL(window.location.href);
    url.searchParams.set('_v', String(Date.now()));
    window.location.replace(url.toString());
  } catch {
    window.location.reload();
  }
}

// Retries a dynamic import once on transient failure, then forces a hard
// (cache-busting) reload on stale-chunk errors. Throttled by sessionStorage
// keyed by moduleId so consecutive failures don't loop, but allowed again
// after RELOAD_DEBOUNCE_MS so a NEW deploy in the same tab still recovers.
export function retryDynamicImport<T>(loader: Loader<T>, moduleId: string, attempts = 2): Promise<T> {
  return new Promise((resolve, reject) => {
    const attempt = (remaining: number, lastErr?: unknown) => {
      loader()
        .then(resolve)
        .catch((err: unknown) => {
          if (remaining > 0) {
            setTimeout(() => attempt(remaining - 1, err), 400);
            return;
          }
          if (isChunkLoadError(err) && typeof window !== 'undefined') {
            const key = RELOAD_FLAG_PREFIX + moduleId;
            const last = Number(sessionStorage.getItem(key) || 0);
            const tooRecent = last && Date.now() - last < RELOAD_DEBOUNCE_MS;
            if (!tooRecent) {
              sessionStorage.setItem(key, String(Date.now()));
              hardReload();
              return;
            }
          }
          reject(lastErr ?? err);
        });
    };
    attempt(attempts);
  });
}

export function lazyWithRetry<T extends React.ComponentType<any>>(
  loader: Loader<{ default: T }>,
  moduleId: string,
): React.LazyExoticComponent<T> {
  return React.lazy(() => retryDynamicImport(loader, moduleId));
}

// Clear the reload flag for a moduleId — call from a page after it
// successfully mounts so the next stale-chunk error (next deploy) can
// recover via a fresh reload instead of being throttled.
export function clearChunkReloadFlag(moduleId: string) {
  if (typeof window === 'undefined') return;
  sessionStorage.removeItem(RELOAD_FLAG_PREFIX + moduleId);
  sessionStorage.removeItem(RELOAD_FLAG_PREFIX + 'page:' + moduleId);
}

// Wipe ALL chunk-reload throttles. Use sparingly (e.g. on auth state
// transitions) to give the recovery system a clean slate.
export function clearAllChunkReloadFlags() {
  if (typeof window === 'undefined') return;
  for (let i = sessionStorage.length - 1; i >= 0; i--) {
    const k = sessionStorage.key(i);
    if (k && k.startsWith(RELOAD_FLAG_PREFIX)) sessionStorage.removeItem(k);
  }
}

export { isChunkLoadError };
