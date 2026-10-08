// End-to-end check that one online visit is enough to play Goal Rush! offline, with the game served
// from a sub-folder the way GitHub Pages serves it. Not part of the build or the unit tests. To run it:
//   npm run build
//   node tools/check-offline.mjs
// It needs python3 and Playwright with its Chromium. When playwright is not installed in this project,
// point PLAYWRIGHT at its index.js, e.g. PLAYWRIGHT=/opt/node-tools/node_modules/playwright/index.js.
// PORT (default 4791) picks the port. It copies dist into a temporary <tmp>/five-a-side-stars/, serves
// <tmp> with python3 -m http.server on 127.0.0.1 and checks, in headless Chromium, that:
//   1. the first visit installs the service worker once every file in dist/sw.js is in its cache, and
//      clears an older goalrush- cache but leaves another game's cache on the same site alone;
//   2. offline (Playwright's switch, and the server stopped too) a reload and a fresh launch both boot
//      the game in Fredoka, and the commentary recording (at its ?v= URL) is answered from the cache;
//   3. with a server that never answers, the page still opens from the cache after about 3 s;
//   4. a new deploy (a changed commentary.json, so a new version) replaces the old cache.
// Any page error, failed request, or (offline) answer that did not come from the service worker fails it.
import { spawn } from 'node:child_process';
import { cpSync, existsSync, mkdtempSync, readFileSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { createServer } from 'node:net';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

const { chromium } = createRequire(import.meta.url)(process.env.PLAYWRIGHT || 'playwright');
const DIST = fileURLToPath(new URL('../dist/', import.meta.url));
const SUB = 'five-a-side-stars';
const PORT = Number(process.env.PORT || 4791);
const BASE = `http://127.0.0.1:${PORT}/${SUB}/`;

if (!existsSync(join(DIST, 'sw.js'))) throw new Error('No dist/sw.js: run npm run build first');
const sw = readFileSync(join(DIST, 'sw.js'), 'utf8');
const VERSION = JSON.parse(sw.match(/const VERSION = (".*?");/)[1]);
const FILES = JSON.parse(sw.match(/const FILES = (\[[\s\S]*?\]);/)[1]);
const BYTES = FILES.reduce((sum, url) => sum + statSync(join(DIST, decodeURIComponent(url.split('?')[0]))).size, 0);

const root = mkdtempSync(join(tmpdir(), 'goalrush-offline-'));
cpSync(DIST, join(root, SUB), { recursive: true });
let server = null;
let hang = null;
let browser = null;
const problems = [];
let offline = false;

try {
  browser = await chromium.launch({ args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
  const context = await browser.newContext();
  // Software WebGL is slow, more so on a busy machine, so allow plenty of time for each step.
  context.setDefaultTimeout(90000);
  const page = await watch(await context.newPage());
  await serve();

  // 1. First visit. Leftovers first (from the server's file listing, before any worker): an older
  // Goal Rush! cache, and a cache another game on the same site uses.
  await page.goto(`http://127.0.0.1:${PORT}/`);
  await page.evaluate(async () => { await (await caches.open('goalrush-v7')).put('./old', new Response('old')); await caches.open('another-game-v1'); });
  await page.goto(`${BASE}?debug`);
  const ready = await page.evaluate(() => Promise.race([navigator.serviceWorker.ready.then(() => true), new Promise((r) => setTimeout(() => r(false), 60000))]));
  check(ready, 'the service worker never became ready');
  const keys = await page.evaluate(async (v) => (await (await caches.open(v)).keys()).map((r) => r.url).sort(), VERSION);
  const expected = FILES.map((url) => new URL(url, BASE).href).sort();
  check(JSON.stringify(keys) === JSON.stringify(expected), `cache ${VERSION} holds ${keys.length} of ${expected.length} files`);
  const names = await page.evaluate(() => caches.keys());
  check(!names.includes('goalrush-v7') && names.includes('another-game-v1'), `caches after install: ${names.join(', ')}`);
  await page.waitForFunction(() => navigator.serviceWorker.controller !== null);
  await booted(page, true);
  console.log(`first visit: ${VERSION} active with all ${keys.length} files (${BYTES.toLocaleString('en-GB')} bytes); caches now ${names.join(', ')}`);

  // 2. Offline: the browser's switch, and nothing listening either, so only the cache can answer.
  await stop();
  await context.setOffline(true);
  offline = true;
  await page.reload();
  await booted(page, true);
  const fonts = await page.evaluate(async () => { await document.fonts.ready; return [...document.fonts].filter((f) => f.family.replace(/["']/g, '') === 'Fredoka' && f.status === 'loaded').map((f) => f.weight).sort(); });
  check(fonts.includes('700'), `Fredoka faces loaded offline: ${fonts.join(', ') || 'none'}`);
  // The game asks for the recording with its ?v=, as sw.js lists it.
  const mp3Url = FILES.find((url) => url.includes('commentary.mp3'));
  const mp3 = await page.evaluate(async (url) => { const r = await fetch(url); return { ok: r.ok, bytes: (await r.arrayBuffer()).byteLength }; }, mp3Url);
  const mp3Size = statSync(join(DIST, 'audio/commentary.mp3')).size;
  check(mp3.ok && mp3.bytes === mp3Size, `offline commentary.mp3: ok ${mp3.ok}, ${mp3.bytes} of ${mp3Size} bytes`);
  // A fresh launch, as from the home screen: a new tab (and the old one closed, so one match renders at a time).
  await page.close();
  const launch = await watch(await context.newPage());
  await launch.goto(BASE);
  await booted(launch, false);
  console.log(`offline: reload booted (Fredoka ${fonts.join('/')}), commentary.mp3 ${mp3.bytes.toLocaleString('en-GB')} bytes from the cache, fresh launch shows Tap to Play`);

  // 3. A connection that never answers: the page must arrive from the cache after the worker's 3 s wait.
  // Timed from a blank tab: replacing a tab that is still rendering a match takes software WebGL a while.
  offline = false;
  await context.setOffline(false);
  await launch.goto('about:blank');
  hang = await blackHole();
  const start = Date.now();
  await launch.goto(`${BASE}?debug`, { waitUntil: 'commit' });
  const waited = (Date.now() - start) / 1000;
  await booted(launch, true);
  check(waited >= 2.5 && waited < 10, `page took ${waited.toFixed(1)} s with a server that never answers`);
  console.log(`server not answering: page opened from the cache after ${waited.toFixed(1)} s`);

  // 4. A new deploy: commentary.json changes, so the build gives sw.js a new version.
  hang.stop();
  hang = null;
  const next = 'goalrush-000000e2e000';
  const json = `${readFileSync(join(DIST, 'audio/commentary.json'), 'utf8')}\n`;
  writeFileSync(join(root, SUB, 'audio/commentary.json'), json);
  writeFileSync(join(root, SUB, 'sw.js'), sw.replace(VERSION, next));
  await serve();
  await launch.goto(`${BASE}?debug`);
  await booted(launch, true);
  await until(() => launch.evaluate(([old, now]) => caches.keys().then((k) => !k.includes(old) && k.includes(now)), [VERSION, next]), 'the new version to replace the old cache');
  await until(() => launch.evaluate((want) => fetch('audio/commentary.json').then((r) => r.text()).then((t) => t === want), json), 'the new commentary.json');
  console.log(`new deploy: ${next} replaced ${VERSION} and serves the new commentary.json`);
} catch (e) {
  problems.push(e.message);
} finally {
  await browser?.close();
  await stop();
  hang?.stop();
  rmSync(root, { recursive: true, force: true });
}

if (problems.length) {
  console.error(`FAILED:\n  ${problems.join('\n  ')}`);
  process.exit(1);
}
console.log('OK: no page errors, no failed requests, and every offline answer came from the service worker');

/** Notes page errors, failed requests and, while offline, anything not answered by the service worker. */
function watch(p) {
  p.on('pageerror', (e) => problems.push(`page error: ${e.message}`));
  p.on('requestfailed', (r) => problems.push(`request failed: ${r.url()} (${r.failure()?.errorText})`));
  p.on('response', (r) => { if (offline && r.url().startsWith('http') && !r.fromServiceWorker()) problems.push(`offline answer not from the cache: ${r.url()}`); });
  return p;
}

/** ?debug lifts the loading screen; otherwise it turns into the Tap to Play button. Either way #ui fills. */
async function booted(p, debug) {
  if (debug) await p.waitForFunction(() => !document.getElementById('boot') || document.getElementById('boot').classList.contains('is-gone'));
  else await p.waitForSelector('#boot .boot-play');
  await p.waitForFunction(() => (document.getElementById('ui')?.children.length ?? 0) > 0);
}

function check(ok, message) {
  if (!ok) throw new Error(message);
}

async function until(test, what, ms = 90000) {
  for (const end = Date.now() + ms; !(await test());) {
    if (Date.now() > end) throw new Error(`timed out waiting for ${what}`);
    await new Promise((r) => setTimeout(r, 200));
  }
}

/** Serves root on PORT, and makes sure it is this copy answering (not something else on the port). */
async function serve() {
  server = spawn('python3', ['-m', 'http.server', String(PORT), '--bind', '127.0.0.1', '--directory', root], { stdio: 'ignore' });
  server.on('error', (e) => problems.push(`python3: ${e.message}`));
  const ours = readFileSync(join(root, SUB, 'sw.js'), 'utf8');
  await until(() => fetch(`${BASE}sw.js`).then((r) => r.text()).then((t) => t === ours, () => false), `python3 http.server serving ${root} on port ${PORT}`, 10000);
}

async function stop() {
  if (server && server.exitCode === null && server.signalCode === null) {
    const exited = new Promise((r) => server.once('exit', r));
    server.kill();
    await exited;
  }
  server = null;
}

/** Takes connections on the port and never answers them, like a very poor mobile signal. */
async function blackHole() {
  const sockets = new Set();
  const s = createServer((socket) => sockets.add(socket));
  await new Promise((r) => s.listen(PORT, '127.0.0.1', r));
  return { stop: () => { for (const socket of sockets) socket.destroy(); s.close(); } };
}
