import path from 'path';
import { defineConfig, loadEnv } from 'vite';
import react from '@vitejs/plugin-react';
import { VitePWA } from 'vite-plugin-pwa';

export default defineConfig(({ mode }) => {
    const env = loadEnv(mode, '.', '');
    return {
      server: {
        port: 3000,
        host: '0.0.0.0',
      },
      plugins: [
        react(),
        VitePWA({
          strategies: 'injectManifest',
          srcDir: 'src',
          filename: 'sw.ts',
          registerType: 'autoUpdate',
          injectRegister: 'auto',
          manifest: {
            name: 'BSO Portal',
            short_name: 'BSO Portal',
            description: 'Application de gestion offline-first pour BSO',
            start_url: '/',
            display: 'standalone',
            background_color: '#0f172a',
            theme_color: '#2563eb',
            icons: [
              {
                src: 'data:image/svg+xml,%3Csvg xmlns=\'http://www.w3.org/2000/svg\' viewBox=\'0 0 100 100\'%3E%3Crect width=\'100\' height=\'100\' fill=\'%232563eb\'/%3E%3Ctext x=\'50\' y=\'50\' font-size=\'50\' fill=\'white\' text-anchor=\'middle\' dominant-baseline=\'middle\' font-family=\'Arial\'%3EB%3C/text%3E%3C/svg%3E',
                sizes: '192x192',
                type: 'image/svg+xml'
              },
              {
                src: 'data:image/svg+xml,%3Csvg xmlns=\'http://www.w3.org/2000/svg\' viewBox=\'0 0 100 100\'%3E%3Crect width=\'100\' height=\'100\' fill=\'%232563eb\'/%3E%3Ctext x=\'50\' y=\'50\' font-size=\'50\' fill=\'white\' text-anchor=\'middle\' dominant-baseline=\'middle\' font-family=\'Arial\'%3EB%3C/text%3E%3C/svg%3E',
                sizes: '512x512',
                type: 'image/svg+xml',
                purpose: 'any maskable'
              }
            ]
          },
          includeAssets: ['favicon.svg', 'manifest.webmanifest'],
          devOptions: {
            enabled: false // SW désactivé en dev
          },
          workbox: {
            // Mode injectManifest: on contrôle tout dans sw.ts
          }
        })
      ],
      define: {
        'process.env.API_KEY': JSON.stringify(env.GEMINI_API_KEY),
        'process.env.GEMINI_API_KEY': JSON.stringify(env.GEMINI_API_KEY)
      },
      resolve: {
        alias: {
          '@': path.resolve(__dirname, '.'),
        }
      },
      build: {
        sourcemap: false,
        rollupOptions: {
          output: {
            manualChunks: {
              'react-vendor': ['react', 'react-dom'],
              'supabase-vendor': ['@supabase/supabase-js'],
              'db-vendor': ['dexie', 'dexie-react-hooks']
            }
          }
        }
      }
    };
});
