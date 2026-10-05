import { defineConfig } from 'vite';

// base is relative so the built game works from GitHub Pages or any sub-folder.
export default defineConfig({
  base: './',
  build: { target: 'es2022' },
});
