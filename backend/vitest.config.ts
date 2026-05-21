import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vitest/config';

export default defineConfig({
  resolve: {
    alias: {
      '@simtalk/shared-types': fileURLToPath(new URL('../shared/types/src/index.ts', import.meta.url))
    }
  },
  test: {
    include: ['../tests/backend/**/*.{test,spec}.ts']
  }
});
