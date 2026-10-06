import { readdir, readFile, writeFile } from 'node:fs/promises';
import { join, relative, resolve, sep } from 'node:path';
import type { Plugin, ResolvedConfig } from 'vite';
import { precacheList, renderServiceWorker } from './sw-manifest.ts';

/**
 * Vite plugin: once a build is written, lists every file in dist (the hashed bundle, stylesheet and
 * fonts, and everything copied from public/), and writes dist/sw.js from the template with that list
 * and a version hashed from all of it. Nobody bumps the version by hand any more, and files that must
 * change together (commentary.json and commentary.mp3) always do. The dev server has no service
 * worker: main.ts only registers one in production builds.
 */
export function swPrecache(template: string): Plugin {
  let config: ResolvedConfig;
  return {
    name: 'goalrush:sw-precache',
    apply: 'build',
    configResolved(resolved) {
      config = resolved;
    },
    writeBundle: {
      // After every other plugin, when dist holds everything that will ship.
      order: 'post',
      async handler(output) {
        const outDir = output.dir ?? resolve(config.root, config.build.outDir);
        const paths = await listFiles(outDir);
        const built = await Promise.all(paths.map(async (path) => ({ path, bytes: await readFile(join(outDir, path)) })));
        const precache = await precacheList(built);
        const source = renderServiceWorker(await readFile(resolve(config.root, template), 'utf8'), precache);
        await writeFile(join(outDir, 'sw.js'), source);
        const mb = (precache.bytes / 1024 / 1024).toFixed(2);
        config.logger.info(`sw.js precaches ${precache.files.length} files (${mb} MB) as ${precache.version}`);
      },
    },
  };
}

/** Every file under dir, as forward-slash paths relative to it. */
async function listFiles(dir: string): Promise<string[]> {
  const entries = await readdir(dir, { recursive: true, withFileTypes: true });
  return entries.filter((e) => e.isFile()).map((e) => relative(dir, join(e.parentPath, e.name)).split(sep).join('/'));
}
