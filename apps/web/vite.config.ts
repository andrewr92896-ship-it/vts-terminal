import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// The frontend dev server proxies /api to the backend so the browser talks
// to a single origin and the session cookie flows normally.
export default defineConfig({
  plugins: [react()],
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
