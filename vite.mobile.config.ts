import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/postcss';
import { defineConfig } from 'vite';
import { cpSync, readdirSync } from 'node:fs';
import { resolve } from 'node:path';

export default defineConfig({
  root: 'mobile',
  publicDir: '../public',
  base: './',
  css: { postcss: { plugins: [tailwindcss()] } },
  plugins: [react(), {
    name: 'copy-app-public-assets',
    closeBundle() {
      const source = resolve(import.meta.dirname, 'public');
      const destination = resolve(import.meta.dirname, 'mobile-dist');
      for (const entry of readdirSync(source)) {
        if (entry !== 'windows') cpSync(resolve(source, entry), resolve(destination, entry), { recursive: true });
      }
    },
  }],
  build: {
    // Installer downloads belong to the website, never inside the next desktop bundle.
    copyPublicDir: false,
    outDir: '../mobile-dist',
    emptyOutDir: true,
  },
});
