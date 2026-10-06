/// <reference types="vitest" />
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  // nur die App scannen (nicht den archivierten Prototyp)
  optimizeDeps: { entries: ['index.html'] },
  build: { sourcemap: true, chunkSizeWarningLimit: 900 },
  test: { include: ['src/**/*.test.ts'], environment: 'node' }
});
