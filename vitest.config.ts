import { defineConfig } from 'vitest/config';
import path from 'node:path';

export default defineConfig({
  test: {
    globals: false,
    environment: 'node',
    include: ['packages/**/*.test.ts', 'apps/server/**/*.test.ts'],
  },
  resolve: {
    alias: {
      '@hotel-billing/shared': path.resolve(__dirname, './packages/shared/src'),
    },
  },
});
