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
