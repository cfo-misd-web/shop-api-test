import { defineConfig } from 'tsdown';

export default defineConfig({
  entry: ['src/server.ts', 'src/seed.ts'],
  outDir: 'dist',
  format: 'esm',
  platform: 'node',
  target: 'node22',
  // Runtime deps — keep external, don't bundle. better-sqlite3 is a native addon.
  external: ['express', 'better-sqlite3'],
  clean: true,
});
