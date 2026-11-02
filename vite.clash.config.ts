import { defineConfig } from 'vite';

// Universe Clash is its own page and its own build. It must never touch the
// CAGE BOSS / CAGE BOSS II bundles.
export default defineConfig({
  base: './',
  build: {
    outDir: 'dist-clash',
    emptyOutDir: true,
    target: 'es2022',
    rollupOptions: { input: 'clash.html' },
  },
});
