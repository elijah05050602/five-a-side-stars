import { describe, expect, it } from 'vitest';
import { commentaryVersion, isPrecached, precacheList, renderServiceWorker, type BuiltFile } from '../../tools/sw-manifest';
import template from '../sw-template.js?raw';

const text = (s: string) => new TextEncoder().encode(s);

/** A small dist: a page, a hashed bundle, the commentary pair, plus the worker and a source map. */
function dist(): BuiltFile[] {
  return [
    { path: 'index.html', bytes: text('<!doctype html><title>Goal Rush!</title>') },
    { path: 'assets/index-BjjME8yp.js', bytes: text('console.log("kick off")') },
    { path: 'audio/commentary.json', bytes: text('{"clips":{"goal":[[0,1.5]]}}') },
    { path: 'audio/commentary.mp3', bytes: new Uint8Array([0xff, 0xfb, 0x90, 0x44, 0x00, 0x00]) },
    { path: 'sw.js', bytes: text('/* last build */') },
    { path: 'assets/index-BjjME8yp.js.map', bytes: text('{"version":3}') },
  ];
}

describe('service worker precache list', () => {
  it('keeps every built file but the worker itself and source maps, sorted', async () => {
    const p = await precacheList(dist());
    // The commentary pair carries a hash of its index, the same ?v= the game asks for (see VERSIONED).
    expect(p.files).toEqual(['assets/index-BjjME8yp.js', 'audio/commentary.json?v=3153ccdf68', 'audio/commentary.mp3?v=3153ccdf68', 'index.html']);
    expect(p.bytes).toBe(23 + 28 + 6 + 40);
    expect(isPrecached('sw.js')).toBe(false);
    expect(isPrecached('assets/index-BjjME8yp.css.map')).toBe(false);
    expect(isPrecached('models/sw.js')).toBe(true);
  });

  it('gives the commentary a new ?v= whenever its index changes', async () => {
    const v = await commentaryVersion(text('{"clips":{"goal":[[0,1.5]]}}'));
    expect(v).toBe('3153ccdf68');
    expect(await commentaryVersion(text('{"clips":{"goal":[[0,1.6]]}}'))).not.toBe(v);
  });

  it('gives the same version for the same files, in any order', async () => {
    const p = await precacheList(dist());
    expect(p.version).toMatch(/^goalrush-[0-9a-f]{12}$/);
    expect((await precacheList(dist().reverse())).version).toBe(p.version);
    // Fixed for these inputs on every machine (sha256 of the "path sha256" lines), so CI and a laptop agree.
    expect(p.version).toBe('goalrush-e8aa98904085');
  });

  it('changes the version when any byte of any listed file changes', async () => {
    const versions = new Set([(await precacheList(dist())).version]);
    let changes = 0;
    for (let i = 0; i < 4; i++) {
      for (let j = 0; j < dist()[i].bytes.length; j++) {
        const files = dist();
        files[i].bytes[j] ^= 1;
        versions.add((await precacheList(files)).version);
        changes++;
      }
    }
    expect(changes).toBe(97);
    expect(versions.size).toBe(changes + 1);
  });

  it('changes the version when a file is added, removed or renamed', async () => {
    const before = (await precacheList(dist())).version;
    const added = [...dist(), { path: 'art/stadium.jpg', bytes: text('jpeg') }];
    const removed = dist().filter((f) => f.path !== 'audio/commentary.mp3');
    const renamed = dist().map((f) => (f.path === 'index.html' ? { ...f, path: 'home.html' } : f));
    for (const files of [added, removed, renamed]) expect((await precacheList(files)).version).not.toBe(before);
  });

  it('does not change the version for the worker itself or source maps', async () => {
    const before = (await precacheList(dist())).version;
    const files = dist().map((f) => (f.path.endsWith('.map') || f.path === 'sw.js' ? { ...f, bytes: text('something else') } : f));
    expect((await precacheList(files)).version).toBe(before);
  });
});

describe('service worker template', () => {
  it('fills in the version and the files as URLs next to sw.js', async () => {
    const p = await precacheList([...dist(), { path: 'art/club crest#1.jpg', bytes: text('jpeg') }]);
    const sw = renderServiceWorker('const VERSION = __VERSION__;\nconst FILES = __FILES__;\n', p);
    const run = new Function(`${sw}; return { VERSION, FILES };`) as () => { VERSION: string; FILES: string[] };
    expect(run()).toEqual({
      VERSION: p.version,
      FILES: ['./art/club%20crest%231.jpg', './assets/index-BjjME8yp.js', './audio/commentary.json?v=3153ccdf68', './audio/commentary.mp3?v=3153ccdf68', './index.html'],
    });
  });

  it('turns the real template into a worker with nothing left to fill in', async () => {
    const sw = renderServiceWorker(template, await precacheList(dist()));
    expect(sw).not.toMatch(/__VERSION__|__FILES__/);
    expect(() => new Function(sw)).not.toThrow();
  });

  it('refuses a template with a placeholder missing or repeated', async () => {
    const p = await precacheList(dist());
    expect(() => renderServiceWorker('const FILES = __FILES__;', p)).toThrow(/__VERSION__/);
    expect(() => renderServiceWorker('__VERSION__ __FILES__ __FILES__', p)).toThrow(/__FILES__ once, found it 2 times/);
  });
});
