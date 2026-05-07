import path from 'path';
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { VitePWA } from 'vite-plugin-pwa';

export default defineConfig(() => {
    return {
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
          workbox: {
            maximumFileSizeToCacheInBytes: 6 * 1024 * 1024,
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
        chunkSizeWarningLimit: 800,
        rollupOptions: {
          output: {
            // Split heavy 3rd-party libs into their own long-lived chunks.
            // Why this helps:
            //   • Smaller initial JS — only the libs we use on the auth/home
            //     paint ship before paint. Recharts/TipTap/xlsx don't ship
            //     until the page that needs them is opened.
            //   • Better long-term caching — when we update app code, the
            //     vendor chunks (which change rarely) stay cached in the
            //     browser, so reloads after a deploy fetch tens of KB
            //     instead of hundreds.
            // Order matters: more specific tests first. Anything not matched
            // falls through to the default route-chunk grouping.
            manualChunks: (id: string) => {
              if (!id.includes('node_modules')) return undefined;
              if (id.includes('xlsx')) return 'vendor-xlsx';
              if (id.includes('@tiptap') || id.includes('prosemirror')) return 'vendor-tiptap';
              if (id.includes('recharts') || id.includes('d3-')) return 'vendor-recharts';
              if (id.includes('framer-motion')) return 'vendor-motion';
              if (id.includes('@hello-pangea/dnd')) return 'vendor-dnd';
              if (id.includes('@supabase/')) return 'vendor-supabase';
              if (id.includes('lucide-react')) return 'vendor-icons';
              if (id.includes('crypto-js')) return 'vendor-crypto';
              if (id.includes('react-dom')) return 'vendor-react-dom';
              if (id.includes('/react/') || id.endsWith('/react')) return 'vendor-react';
              return 'vendor';
            },
          },
        },
      },
    };
});
