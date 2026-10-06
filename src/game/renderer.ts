import * as THREE from 'three';

/** Tone mapping for the matches (and the team builder's preview, so a kit looks the same in both). */
export const TONE_MAPPING = THREE.ACESFilmicToneMapping;
export const EXPOSURE = 1.15;

let renderer: THREE.WebGLRenderer | null = null;

/**
 * The renderer every match draws with: made on first use for #game-canvas and then kept for the
 * app's lifetime. Browsers allow only a handful of live WebGL contexts (and drop the oldest past
 * that), and three.js keeps its own GPU copy of every cached texture per renderer, so a new renderer
 * per match would run out of both. MatchScene sets what it needs at the start of each match and
 * never disposes it.
 */
export function gameRenderer(): THREE.WebGLRenderer {
  if (!renderer) {
    const canvas = document.getElementById('game-canvas') as HTMLCanvasElement;
    renderer = new THREE.WebGLRenderer({ canvas, antialias: true, powerPreference: 'high-performance' });
  }
  return renderer;
}
