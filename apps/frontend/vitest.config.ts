import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';
import path from 'path';

// Node 25+ ships a localStorage global that shadows jsdom's.
const WEBSTORAGE_FLAG = '--no-experimental-webstorage';

export default defineConfig({
  plugins: [react()],
  css: {
    postcss: {
      plugins: [],
    },
  },
  test: {
    environment: 'jsdom',
    setupFiles: ['./vitest.setup.ts'],
    // The first test in a builder spec pays the cold import of resume-builder,
    // which takes about 5s on slower machines (Windows); the 5s default then
    // times it out and the rest of the file fails after it.
    testTimeout: 30_000,
    execArgv: process.allowedNodeEnvironmentFlags.has(WEBSTORAGE_FLAG) ? [WEBSTORAGE_FLAG] : [],
  },
  resolve: {
    alias: {
      '@': path.resolve(__dirname, '.'),
    },
  },
});
