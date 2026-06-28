import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { resolve } from 'path';

// The renderer is a standalone React app. It is loaded by Electron either from
// the Vite dev server (development) or from the built files in dist/renderer
// (production). `base: './'` keeps asset paths relative so file:// loading works.
export default defineConfig({
  root: resolve(__dirname, 'src/renderer'),
  base: './',
  plugins: [react()],
  server: {
    port: 5173,
    strictPort: true,
  },
  build: {
    outDir: resolve(__dirname, 'dist/renderer'),
    emptyOutDir: true,
  },
});
