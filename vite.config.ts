import path from 'path';
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { VitePWA } from 'vite-plugin-pwa';

// Build-time constants — Vercel inyecta VERCEL_GIT_COMMIT_SHA en CI.
// En local cae a 'dev'. Estos se exponen al cliente via `define` para que
// la app pueda mostrar qué commit está vivo (DevTools console + meta tags).
const BUILD_COMMIT = (process.env.VERCEL_GIT_COMMIT_SHA || process.env.GIT_COMMIT_SHA || 'dev').slice(0, 7);
const BUILD_TIME = new Date().toISOString();

export default defineConfig(() => {
    return {
      define: {
        __BUILD_COMMIT__: JSON.stringify(BUILD_COMMIT),
        __BUILD_TIME__: JSON.stringify(BUILD_TIME),
      },
      server: {
        port: 3000,
        host: true,
      },
      plugins: [
        react(),
        VitePWA({
          registerType: 'autoUpdate',
          includeAssets: ['icon.svg', 'apple-touch-icon-180.png'],
          manifest: {
            name: 'Eneas OS',
            short_name: 'Eneas OS',
            description: 'Project management, CRM & business operations',
            theme_color: '#2c0405',
            background_color: '#FDFBF7',
            display: 'standalone',
            start_url: '/',
            icons: [
              { src: 'icon-192.png', sizes: '192x192', type: 'image/png' },
              { src: 'icon-512.png', sizes: '512x512', type: 'image/png' },
              { src: 'icon-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
            ],
          },
          // PWA assets that bloat the precache list (TipTap, Recharts, xlsx,
          // Supabase, framer-motion) skew the precache size past the default
          // 2MB warning. Bump the cap so the SW doesn't silently drop chunks.
          // Exclude the static livv-bundle/ design mockup (9MB) — it's only
          // viewed in BundlePreview via iframe and doesn't need to live offline.
          workbox: {
            maximumFileSizeToCacheInBytes: 6 * 1024 * 1024,
            globIgnores: ['**/livv-bundle/**'],
            navigateFallbackDenylist: [/^\/livv-bundle\//],
          },
        }),
      ],
      resolve: {
        alias: {
          '@': path.resolve(__dirname, '.'),
        }
      },
      build: {
        // Lift the chunk-size warning so we don't hit it on legitimately
        // big route chunks (Finance, Projects).
        chunkSizeWarningLimit: 900,
        rollupOptions: {
          output: {
            // Conservative chunk strategy: only split out libraries that
            // are genuinely large AND only used in a single page (so most
            // users never download them). Everything else — React, React
            // DOM, Recharts, Framer Motion, Supabase — stays inside the
            // default chunks Vite generates, because those packages ship
            // CommonJS shims (e.g. use-sync-external-store/shim) that
            // expect to be in the SAME chunk as react. Splitting them
            // apart causes cross-chunk init order bugs:
            //   "Cannot read properties of undefined (reading
            //    'useSyncExternalStore')"
            // which is what we hit with the previous aggressive split.
            //
            // Lessons:
            //   • xlsx (~430KB) — only loads on Excel upload. Big win.
            //   • tiptap+prosemirror (~350KB) — only loads on Docs/Calendar
            //     editor. Big win.
            //   • Anything else: leave it to Vite. The marginal caching
            //     benefit isn't worth the SSR / chunk-load fragility.
            // Current rules also split React, Supabase, Motion, Charts and
            // Icons into stable vendor chunks; React-related packages stay
            // grouped together to avoid the shim issue described above.
            manualChunks: (id: string) => {
              if (!id.includes('node_modules')) return undefined;
              const normalized = id.replace(/\\/g, '/');
              if (
                normalized.includes('/react/') ||
                normalized.includes('/react-dom/') ||
                normalized.includes('/scheduler/') ||
                normalized.includes('/use-sync-external-store/')
              ) return 'vendor-react';
              if (normalized.includes('/@supabase/')) return 'vendor-supabase';
              if (
                normalized.includes('/framer-motion/') ||
                normalized.includes('/motion-dom/') ||
                normalized.includes('/motion-utils/')
              ) return 'vendor-motion';
              if (
                normalized.includes('/recharts/') ||
                normalized.includes('/d3-') ||
                normalized.includes('/victory-vendor/')
              ) return 'vendor-charts';
              if (normalized.includes('/lucide-react/')) return 'vendor-icons';
              if (normalized.includes('/xlsx/')) return 'vendor-xlsx';
              if (normalized.includes('/@tiptap/') || normalized.includes('/prosemirror-')) return 'vendor-tiptap';
              return undefined;
            },
          },
        },
      },
    };
});
