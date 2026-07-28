import { defineConfig } from 'vitest/config';

export default defineConfig(() => ({
  root: __dirname,
  cacheDir: './node_modules/.vite',
  test: {
    name: '@jsfc/voronoi',
    watch: false,
    globals: true,
    environment: 'node',
    include: ['{src,tests}/**/*.{test,spec}.{js,mjs,cjs,ts,mts,cts,jsx,tsx}'],
    reporters: ['default'],
    coverage: {
      reportsDirectory: './coverage',
      reporter: ['text', 'json-summary', 'html'],
      provider: 'v8' as const,
    },
  },
}));
