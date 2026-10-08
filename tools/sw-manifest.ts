/**
 * What the service worker keeps for offline play, worked out from the files a build wrote to dist,
 * and the service worker itself filled in from its template. No Node APIs here (hashing is Web
 * Crypto), so the unit tests type-check it along with the game; tools/sw-precache.ts does the disk work.
 */

/** A file the build wrote, by its path inside dist with forward slashes. */
export interface BuiltFile {
  path: string;
  bytes: Uint8Array<ArrayBuffer>;
}

/**
 * The commentary's index and recording have fixed names but must change together, so the game asks
 * for them with ?v= and a hash of the index, and the service worker keeps them under those URLs. An
 * older service worker still looking after the page when a new deploy loads then has no copy under
 * the new URL and fetches the new pair, instead of handing the new game the old recording.
 */
export const VERSIONED = ['audio/commentary.json', 'audio/commentary.mp3'];

/** The ?v= value for the commentary: the first ten hex digits of the index's SHA-256. */
export async function commentaryVersion(index: Uint8Array<ArrayBuffer>): Promise<string> {
  return (await sha256(index)).slice(0, 10);
}

export interface Precache {
  /** The cache name: 'goalrush-' and a hash of every listed file's path and contents. */
  version: string;
  /** Paths inside dist, sorted, the commentary's with its ?v= query. */
  files: string[];
  /** Total size of the listed files in bytes. */
  bytes: number;
}

/** Everything the build wrote is kept, except the service worker itself and source maps. */
export function isPrecached(path: string): boolean {
  return path !== 'sw.js' && !path.endsWith('.map');
}

/**
 * The files to precache and one version for all of them. Any changed byte, added, removed or renamed
 * file gives a new version; the same files always give the same one, in whatever order they come.
 */
export async function precacheList(built: readonly BuiltFile[]): Promise<Precache> {
  const files = built.filter((f) => isPrecached(f.path)).sort((a, b) => (a.path < b.path ? -1 : a.path > b.path ? 1 : 0));
  // One "path hash" line per file, then a hash of those lines.
  const lines = await Promise.all(files.map(async (f) => `${f.path} ${await sha256(f.bytes)}\n`));
  const version = `goalrush-${(await sha256(new TextEncoder().encode(lines.join('')))).slice(0, 12)}`;
  const index = files.find((f) => f.path === VERSIONED[0]);
  const v = index ? `?v=${await commentaryVersion(index.bytes)}` : '';
  return { version, files: files.map((f) => (VERSIONED.includes(f.path) ? f.path + v : f.path)), bytes: files.reduce((sum, f) => sum + f.bytes.byteLength, 0) };
}

/** The template with its version and file list filled in. Each placeholder must be there exactly once. */
export function renderServiceWorker(template: string, precache: Precache): string {
  // URLs relative to sw.js, which sits at the top of dist, so the game works from any sub-folder.
  const urls = precache.files.map((file) => {
    const [path, query] = file.split('?');
    return `./${path.split('/').map(encodeURIComponent).join('/')}${query ? `?${query}` : ''}`;
  });
  const values: Record<string, string> = { __VERSION__: JSON.stringify(precache.version), __FILES__: JSON.stringify(urls, null, 2) };
  let out = template;
  for (const [token, value] of Object.entries(values)) {
    const parts = out.split(token);
    if (parts.length !== 2) throw new Error(`Service worker template: expected ${token} once, found it ${parts.length - 1} times`);
    out = parts.join(value);
  }
  return out;
}

async function sha256(bytes: Uint8Array<ArrayBuffer>): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', bytes);
  return Array.from(new Uint8Array(digest), (b) => b.toString(16).padStart(2, '0')).join('');
}
