import { defineConfig } from 'vite';
import { swPrecache } from './tools/sw-precache.ts';

// base is relative so the built game works from GitHub Pages or any sub-folder.
export default defineConfig({
  base: './',
  build: { target: 'es2022' },
  // Writes dist/sw.js from the template, listing every built file under a version hashed from them.
  plugins: [swPrecache('src/sw-template.js')],
});
