import { readFile } from 'node:fs/promises';
import { defineConfig } from 'vite';
import { commentaryVersion } from './tools/sw-manifest.ts';
import { swPrecache } from './tools/sw-precache.ts';

// base is relative so the built game works from GitHub Pages or any sub-folder.
export default defineConfig(async () => ({
  base: './',
  build: { target: 'es2022' },
  // The game asks for the commentary with this ?v=, and sw.js keeps it under the same URL (see VERSIONED).
  define: { __COMMENTARY_V__: JSON.stringify(await commentaryVersion(new Uint8Array(await readFile('public/audio/commentary.json')))) },
  // Writes dist/sw.js from the template, listing every built file under a version hashed from them.
  plugins: [swPrecache('src/sw-template.js')],
}));
