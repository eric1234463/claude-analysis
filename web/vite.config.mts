import { fileURLToPath } from 'node:url';
import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import { defineConfig } from 'vitest/config';

export default defineConfig({
  plugins: [react(), tailwindcss()],
  resolve: { alias: { '@': fileURLToPath(new URL('./src', import.meta.url)) } },
  server: {
    port: Number(process.env.WEB_PORT ?? 5173),
    proxy: { '/api': `http://localhost:${process.env.PORT ?? 3000}` },
  },
  // The zone is pinned east of UTC on purpose, and must not be "fixed" to UTC for
  // symmetry with the server: under UTC the local and UTC calendar dates coincide, so
  // `toDayKey` and `toISOString().slice(0, 10)` become indistinguishable and every
  // day-key timezone test goes vacuous. Asia/Hong_Kong is the DASHBOARD_TIME_ZONE default.
  test: {
    environment: 'jsdom',
    globals: true,
    setupFiles: ['./src/test-setup.ts'],
    env: { TZ: 'Asia/Hong_Kong' },
  },
});
