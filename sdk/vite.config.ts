import { defineConfig } from 'vitest/config';

// Builds a single script-tag file that exposes `window.Organiser`.
export default defineConfig({
  build: {
    lib: {
      entry: 'src/standalone.ts',
      name: 'Organiser',
      formats: ['iife', 'es'],
      fileName: (format) => `organiser-sdk.${format === 'iife' ? 'js' : 'mjs'}`,
    },
  },
  test: { environment: 'jsdom' },
});
