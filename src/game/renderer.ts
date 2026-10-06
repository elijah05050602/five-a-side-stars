import * as THREE from 'three';

/** Tone mapping for the matches (and the team builder's preview, so a kit looks the same in both). */
export const TONE_MAPPING = THREE.ACESFilmicToneMapping;
export const EXPOSURE = 1.15;

let renderer: THREE.WebGLRenderer | null = null;
/** True from the moment the match canvas loses its context until the browser gives it back. */
let lost = false;

/**
 * The renderer every match draws with: made on first use for #game-canvas and then kept for the
 * app's lifetime. Browsers allow only a handful of live WebGL contexts (and drop the oldest past
 * that), and three.js keeps its own GPU copy of every cached texture per renderer, so a new renderer
 * per match would run out of both. MatchScene sets what it needs at the start of each match and
 * never disposes it.
 *
 * If the context was lost and not given back, the canvas is swapped for a fresh one first. Returns
 * null when WebGL cannot draw at all; show showDrawError() then.
 */
export function gameRenderer(): THREE.WebGLRenderer | null {
  if (renderer && !lost && !renderer.getContext().isContextLost()) return renderer;
  let canvas = document.getElementById('game-canvas') as HTMLCanvasElement;
  if (renderer) {
    // The browser dropped the context (to make room for another one, or after a GPU reset) and has
    // not restored it. A canvas only ever gets the one context, so carry on with a new canvas.
    try { renderer.dispose(); } catch { /* nothing left to free on a lost context */ }
    renderer = null;
    const fresh = document.createElement('canvas');
    fresh.id = canvas.id;
    fresh.className = canvas.className;
    canvas.replaceWith(fresh);
    canvas = fresh;
  }
  try {
    renderer = new THREE.WebGLRenderer({ canvas, antialias: true, powerPreference: 'high-performance' });
  } catch {
    return null;
  }
  lost = false;
  watchContext(canvas);
  return renderer;
}

/**
 * For as long as the canvas lives: ask the browser to give a lost context back rather than leave
 * the pitch blank (three.js rebuilds its side when it does), and remember whether it is gone.
 */
function watchContext(canvas: HTMLCanvasElement): void {
  canvas.addEventListener('webglcontextlost', (e) => {
    e.preventDefault();
    if (renderer?.domElement === canvas) lost = true;
  });
  canvas.addEventListener('webglcontextrestored', () => {
    if (renderer?.domElement === canvas) lost = false;
  });
}

/** Instead of a blank screen when the pitch cannot be drawn at all: a short note, and a tap starts the game afresh. */
export function showDrawError(root: HTMLElement): void {
  const note = document.createElement('div');
  note.className = 'overlay';
  note.setAttribute('role', 'alert');
  note.style.cursor = 'pointer';
  note.innerHTML = '<div class="card overlay-card"><p>Something went wrong drawing the pitch — tap to reload</p></div>';
  note.addEventListener('click', () => location.reload());
  root.append(note);
}

// ---------- freeing GPU memory ----------

const sharedResources = new WeakSet<object>();

/**
 * Marks a geometry, material or texture that is made once and used by many objects (or by every
 * match), so disposeObject leaves it alone. Returns it, for use where it is made.
 */
export function shared<T extends object>(resource: T): T {
  sharedResources.add(resource);
  return resource;
}

/**
 * Frees what everything under `root` holds on the GPU: geometries, materials and their textures,
 * skeletons' bone textures, instanced meshes' buffers and lights' shadow maps. Anything marked
 * shared(), and every texture a TextureCache handed out, is left for its other users.
 */
export function disposeObject(root: THREE.Object3D): void {
  const done = new Set<object>();
  const free = (r: { dispose(): void } | null | undefined): void => {
    if (!r || sharedResources.has(r) || done.has(r)) return;
    done.add(r);
    r.dispose();
  };
  root.traverse((o) => {
    const mesh = o as THREE.Mesh;
    free(mesh.geometry);
    const mats = mesh.material === undefined ? [] : Array.isArray(mesh.material) ? mesh.material : [mesh.material];
    for (const m of mats) {
      if (sharedResources.has(m)) continue;
      for (const v of Object.values(m)) if ((v as THREE.Texture | null)?.isTexture) free(v as THREE.Texture);
      free(m);
    }
    if ((o as THREE.SkinnedMesh).isSkinnedMesh) free((o as THREE.SkinnedMesh).skeleton);
    if ((o as THREE.InstancedMesh).isInstancedMesh || (o as THREE.Light).isLight) free(o as THREE.InstancedMesh | THREE.Light);
  });
}

// ---------- texture caches ----------

/** Which cache a cached texture belongs to, so whoever holds it can hand it back. */
const homes = new WeakMap<THREE.Texture, TextureCache<THREE.Texture>>();

/**
 * Textures painted on demand and shared by everyone who asks for the same key. Each acquire() is a
 * hold, handed back with releaseTexture(). A texture nobody holds stays cached in case it is wanted
 * again, but only the `spare` most recently used of those: older ones are disposed, so a long session
 * in the team builder, or match after match against new teams, cannot fill the memory (phones, and
 * iOS above all, cap the total canvas memory). A held texture is never disposed.
 */
export class TextureCache<T extends THREE.Texture> {
  /** Least recently used first. */
  private readonly entries = new Map<string, { tex: T; holds: number }>();
  private readonly keys = new Map<T, string>();

  constructor(private readonly spare: number) {}

  /** The texture for `key`, painted by make() if it is not cached. Hand it back with releaseTexture(). */
  acquire(key: string, make: () => T): T {
    let e = this.entries.get(key);
    if (e) this.entries.delete(key);
    else {
      e = { tex: shared(make()), holds: 0 };
      this.keys.set(e.tex, key);
      homes.set(e.tex, this as unknown as TextureCache<THREE.Texture>);
    }
    e.holds++;
    this.entries.set(key, e);
    this.trim(this.spare);
    return e.tex;
  }

  release(tex: T): void {
    const key = this.keys.get(tex);
    const e = key === undefined ? undefined : this.entries.get(key);
    if (!e || e.holds === 0) return;
    if (--e.holds > 0) return;
    // Just let go of, so it is the newest of the spares.
    this.entries.delete(key!);
    this.entries.set(key!, e);
    this.trim(this.spare);
  }

  /** Dispose every texture nobody holds (when a match ends, say). */
  clearIdle(): void { this.trim(0); }

  /** How many textures are cached, held or not. */
  get size(): number { return this.entries.size; }

  private trim(spare: number): void {
    let idle = 0;
    for (const e of this.entries.values()) if (e.holds === 0) idle++;
    for (const [key, e] of this.entries) {
      if (idle <= spare) return;
      if (e.holds > 0) continue;
      this.entries.delete(key);
      this.keys.delete(e.tex);
      e.tex.dispose();
      // Safari keeps a canvas's pixels until it is shrunk, long after nothing points at it.
      const img = e.tex.image as unknown;
      if (typeof HTMLCanvasElement !== 'undefined' && img instanceof HTMLCanvasElement) { img.width = 0; img.height = 0; }
      idle--;
    }
  }
}

/** Hand back a texture from a TextureCache (anything else, or null, is ignored). */
export function releaseTexture(tex: THREE.Texture | null | undefined): void {
  if (tex) homes.get(tex)?.release(tex);
}
