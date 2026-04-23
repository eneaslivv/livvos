import React from 'react';

type Loader<T> = () => Promise<T>;

const RELOAD_FLAG_PREFIX = '__chunk_reload__:';

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

// Retries a dynamic import once on transient failure, then forces a single
// page reload for stale-chunk errors (common after a new deploy). Uses a
// sessionStorage flag keyed by moduleId to prevent infinite reload loops.
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
            const alreadyReloaded = sessionStorage.getItem(key);
            if (!alreadyReloaded) {
              sessionStorage.setItem(key, String(Date.now()));
              window.location.reload();
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

// Call after a successful navigation render to clear the reload flag so
// the next stale-chunk error in a future deploy can trigger a reload again.
export function clearChunkReloadFlag(moduleId: string) {
  if (typeof window === 'undefined') return;
  sessionStorage.removeItem(RELOAD_FLAG_PREFIX + moduleId);
}

export { isChunkLoadError };
