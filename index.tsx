import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App';

// Design tokens + Documents page CSS + Proposal builder CSS — adopted 1:1
// from the claude.ai/design bundle (exported 2026-05-22).
import './styles/livv-design-tokens.css';
import './styles/livv-documents.css';
import './styles/livv-proposal-builder.css';

// Build info — inyectado por vite.config define. Permite verificar qué
// commit está vivo en producción abriendo DevTools console.
declare const __BUILD_COMMIT__: string;
declare const __BUILD_TIME__: string;

try {
  const meta = (name: string) => document.querySelector(`meta[name="${name}"]`) as HTMLMetaElement | null;
  const commitMeta = meta('x-commit');
  const builtAtMeta = meta('x-built-at');
  if (commitMeta) commitMeta.content = __BUILD_COMMIT__;
  if (builtAtMeta) builtAtMeta.content = __BUILD_TIME__;
  // eslint-disable-next-line no-console
  console.info(
    `%c🚀 livvos%c · commit %c${__BUILD_COMMIT__}%c · built ${__BUILD_TIME__}`,
    'font-weight:600;color:#C4A35A',
    'color:#71717a',
    'font-family:monospace;color:#0EA5E9',
    'color:#71717a',
  );
} catch { /* meta tags or define missing — ignore */ }

const rootElement = document.getElementById('root');
if (!rootElement) {
  throw new Error("Could not find root element to mount to");
}

const root = ReactDOM.createRoot(rootElement);
root.render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
);