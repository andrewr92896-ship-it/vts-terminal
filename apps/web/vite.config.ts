import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { VitePWA } from 'vite-plugin-pwa';

const root = path.dirname(fileURLToPath(import.meta.url));

// vite-plugin-pwa injects the web-app manifest into every HTML entry it finds.
// The employee portal must not be one: it is a network-only, non-installable
// page, and an install prompt there would launch the *main* terminal (the
// manifest's start_url is "/"). Strip the injected tag from that entry only.
// The hook uses the object form with order: 'post' so it lands in the same late
// bucket as the PWA plugin's own injection and, being registered after it, runs
// last — the function shorthand would be treated as a normal-order hook and run
// before the tag exists.
function stripPwaFromEmployeeEntry() {
  return {
    name: 'vts-strip-pwa-from-employee',
    enforce: 'post' as const,
    transformIndexHtml: {
      order: 'post' as const,
      handler(html: string, ctx: { filename: string }) {
        // The same goes for the Site Editor's preview page: it is framed by
        // the editor and must not offer to install the terminal from inside it.
        if (!ctx.filename.endsWith('employee.html') && !ctx.filename.endsWith('site-preview.html')) return html;
        return html.replace(/\s*<link rel="manifest"[^>]*>/g, '');
      },
    },
  };
}

// The frontend dev server proxies /api to the backend so the browser talks
// to a single origin and the session cookie flows normally.
export default defineConfig({
  plugins: [
    react(),
    // Make the terminal installable as a home screen app on iOS and Android.
    // This is additive: it only adds a manifest, icons, and a service worker,
    // and never touches app features, layout, or the desktop experience.
    VitePWA({
      // The terminal deploys often. We surface a visible "Update available"
      // prompt (see UpdatePrompt) rather than swapping the worker silently:
      // in prompt mode the new worker waits until the user clicks Relaunch,
      // so the running page keeps serving its own chunks (no broken lazy
      // imports) until they choose to apply the update.
      registerType: 'prompt',
      // Registration is handled by the useRegisterSW() hook in UpdatePrompt;
      // 'auto' skips injecting a duplicate registration script when that
      // virtual module is imported.
      injectRegister: 'auto',
      manifest: {
        name: 'VTS Terminal',
        short_name: 'VTS',
        description: 'Vitalis Trading Systems terminal',
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
        // Pull our push/notification handlers into the generated service worker.
        // Kept as a static file (public/push-sw.js) so the worker stays
        // auto-generated while still handling Web Push.
        importScripts: ['/push-sw.js'],
        // Precache the built static shell so the app opens and routes offline.
        globPatterns: ['**/*.{js,css,html,svg,png,ico,woff,woff2}'],
        // ...but never the employee portal. That surface is deliberately
        // network-only: nothing about it should sit in a device's offline cache,
        // and a security-critical page must always run the code the server is
        // currently serving.
        globIgnores: [
          '**/employee.html',
          '**/employee-*.js',
          '**/employee-*.css',
          // The Site Editor's preview must always run the renderer the server
          // is currently serving — a cached one would preview a page the site
          // no longer draws.
          '**/site-preview.html',
          '**/sitePreview-*.js',
          '**/sitePreview-*.css',
        ],
        // Single-page app: unknown routes fall back to the app shell.
        navigateFallback: '/index.html',
        // Never serve the HTML shell for API, webhook or employee-portal paths.
        // The first two must hit the network so live data and the TradingView
        // webhook stay real; /employee must hit the network so the separate,
        // hardened page (and its headers) is what actually loads — the main
        // app shell must never stand in for it.
        navigateFallbackDenylist: [/^\/api/, /^\/employee/, /^\/site-preview/],
        // No runtimeCaching for /api on purpose: every API and live data request
        // goes to the network so nothing is ever served stale.
      },
    }),
    stripPwaFromEmployeeEntry(),
  ],
  build: {
    rollupOptions: {
      // Two independent entry points, not one app with two routes. The employee
      // terminal ships as its own HTML page and its own bundle, so none of its
      // code is ever downloaded by (or reachable from) the main terminal.
      input: {
        main: path.resolve(root, 'index.html'),
        employee: path.resolve(root, 'employee.html'),
        // The Site Editor's preview: the marketing page's own renderer and
        // stylesheet, as a page of its own so an iframe gives it a viewport.
        sitePreview: path.resolve(root, 'site-preview.html'),
      },
    },
  },
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
