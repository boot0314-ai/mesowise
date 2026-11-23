import fs from 'node:fs';
import path from 'node:path';
import { defineConfig } from 'vitest/config';
import type { Plugin } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';

function precacheSwPlugin(): Plugin {
  return {
    name: 'precache-sw-assets',
    writeBundle(outputOptions, bundle) {
      const outDir = outputOptions.dir ?? 'dist';
      const swPath = path.resolve(outDir, 'sw.js');
      if (!fs.existsSync(swPath)) return;

      const emittedAssets = Object.keys(bundle)
        .filter((fileName) => fileName.endsWith('.js') || fileName.endsWith('.css'))
        .map((fileName) => `./${fileName}`);

      const baseShell = [
        './',
        './index.html',
        './manifest.webmanifest',
        './icons/icon.svg',
        './icons/icon-192.png',
        './icons/icon-512.png',
      ];

      const allPrecacheUrls = Array.from(new Set([...baseShell, ...emittedAssets]));
      const buildCacheName = `mesowise-cache-${Date.now()}`;

      let swContent = fs.readFileSync(swPath, 'utf-8');
      swContent = swContent.replace(
        /const CACHE_NAME = '[^']+';/,
        `const CACHE_NAME = '${buildCacheName}';`
      );
      swContent = swContent.replace(
        /const APP_SHELL = \[[\s\S]*?\];/,
        `const APP_SHELL = ${JSON.stringify(allPrecacheUrls, null, 2)};`
      );

      fs.writeFileSync(swPath, swContent, 'utf-8');
    },
  };
}

export default defineConfig({
  base: './',
  plugins: [react(), tailwindcss(), precacheSwPlugin()],
  test: {
    environment: 'node',
    include: ['src/**/*.test.ts'],
  },
});
