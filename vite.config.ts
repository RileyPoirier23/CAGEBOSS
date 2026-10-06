import { defineConfig } from 'vitest/config';
import { readFileSync } from 'node:fs';

const pkg = JSON.parse(readFileSync(new URL('./package.json', import.meta.url), 'utf8'));

export default defineConfig({
  base: './',
  // the version shown in game comes straight from package.json
  define: { __APP_VERSION__: JSON.stringify(pkg.version) },
  build: { target: 'es2022', chunkSizeWarningLimit: 4000 },
  test: { include: ['tests/**/*.test.ts'], testTimeout: 120000 },
});
