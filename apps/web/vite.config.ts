import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { VitePWA } from 'vite-plugin-pwa';

// The frontend dev server proxies /api to the backend so the browser talks
// to a single origin and the session cookie flows normally.
export default defineConfig({
  plugins: [
    react(),
    // Make the portal installable as a home screen app on iOS and Android.
    // This is additive: it only adds a manifest, icons, and a service worker,
    // and never touches app features, layout, or the desktop experience.
    VitePWA({
      // The portal deploys often, so the worker must update itself and take
      // control automatically. A returning user never gets a stale bundle.
      registerType: 'autoUpdate',
      // Let the plugin inject the registration for us, with no hand-written
      // service worker file to maintain.
      injectRegister: 'auto',
      manifest: {
        name: 'VTS Portal',
        short_name: 'VTS',
        description: 'Vitalis Trading Systems portal',
        display: 'standalone',
        start_url: '/',
        scope: '/',
        background_color: '#0A2A6B',
        theme_color: '#0A2A6B',
        icons: [
          { src: '/icon-192.png', sizes: '192x192', type: 'image/png' },
          { src: '/icon-512.png', sizes: '512x512', type: 'image/png' },
          {
            src: '/icon-512-maskable.png',
            sizes: '512x512',
            type: 'image/png',
            purpose: 'maskable',
          },
          { src: '/apple-touch-icon-180.png', sizes: '180x180', type: 'image/png' },
        ],
      },
      workbox: {
        // Precache the built static shell so the app opens and routes offline.
        globPatterns: ['**/*.{js,css,html,svg,png,ico,woff,woff2}'],
        // Single-page app: unknown routes fall back to the app shell.
        navigateFallback: '/index.html',
        // Never serve the HTML shell for API or webhook paths. They must always
        // hit the network so live data and the TradingView webhook stay real.
        navigateFallbackDenylist: [/^\/api/],
        // No runtimeCaching for /api on purpose: every API and live data request
        // goes to the network so nothing is ever served stale.
      },
    }),
  ],
  server: {
    port: 5173,
    proxy: {
      '/api': {
        target: 'http://localhost:4000',
        changeOrigin: true,
      },
    },
  },
});
