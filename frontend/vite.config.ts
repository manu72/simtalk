import { fileURLToPath } from 'node:url';

import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import { defineConfig } from 'vitest/config';

export default defineConfig({
  plugins: [react(), tailwindcss()],
  resolve: {
    alias: {
      '@': fileURLToPath(new URL('./src', import.meta.url)),
      '@simtalk/shared-types': fileURLToPath(new URL('../shared/types/src/index.ts', import.meta.url)),
      '@testing-library/jest-dom': fileURLToPath(
        new URL('./node_modules/@testing-library/jest-dom', import.meta.url)
      ),
      '@testing-library/react': fileURLToPath(
        new URL('./node_modules/@testing-library/react', import.meta.url)
      ),
      react: fileURLToPath(new URL('./node_modules/react', import.meta.url)),
      'react-dom': fileURLToPath(new URL('./node_modules/react-dom', import.meta.url))
    }
  },
  server: {
    port: 5173
  },
  preview: {
    port: 4173
  },
  test: {
    environment: 'jsdom',
    include: ['../tests/frontend/**/*.{test,spec}.{ts,tsx}'],
    setupFiles: '../tests/frontend/support/setupTests.ts'
  }
});
