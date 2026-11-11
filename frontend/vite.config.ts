import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import { defineConfig } from 'vitest/config';

/** Where the dev server forwards API calls. The browser only ever sees one origin. */
const DEV_API_TARGET = process.env.DEV_API_TARGET ?? 'http://localhost:3000';

export default defineConfig({
  plugins: [react(), tailwindcss()],
  server: {
    proxy: {
      // The Host header is left untouched so the API's same-origin (CSRF)
      // check sees the origin the browser actually used.
      '/api': { target: DEV_API_TARGET, changeOrigin: false },
    },
  },
  test: {
    environment: 'jsdom',
    setupFiles: ['./src/test/setup.ts'],
    restoreMocks: true,
  },
});
