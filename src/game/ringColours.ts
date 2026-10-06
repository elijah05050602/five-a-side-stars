import * as THREE from 'three';
import type { Kit } from '../data/types';

/** Rings under the player you control: yellow for player 1, cyan for player 2. No team ring may look like them. */
export const P1_RING = 0xffd23f;
export const P2_RING = 0x00e5ff;

const selection = [new THREE.Color(P1_RING), new THREE.Color(P2_RING)];
const hsl = { h: 0, s: 0, l: 0 };

/** True when a colour could be mistaken for a selection ring: a strong yellow-to-orange, or a strong cyan. */
export function looksSelected(c: THREE.Color): boolean {
  c.getHSL(hsl, THREE.SRGBColorSpace);
  if (hsl.s < 0.35 || hsl.l < 0.25 || hsl.l > 0.85) return false;
  const deg = hsl.h * 360;
  return (deg >= 22 && deg <= 70) || (deg >= 170 && deg <= 205) || selection.some((s) => Math.hypot(s.r - c.r, s.g - c.g, s.b - c.b) < 0.3);
}

/**
 * One identifying colour per team for the thin rings under the feet: the shirt colour, unless it could be
 * mistaken for a selection ring or the two teams are too alike; then the next of shorts, second colour,
 * white or navy that is safe.
 */
export function teamRingColours(home: Kit, away: Kit): [THREE.Color, THREE.Color] {
  const far = (a: THREE.Color, b: THREE.Color) => Math.hypot(a.r - b.r, a.g - b.g, a.b - b.b) > 0.45;
  const pick = (k: Kit, avoid?: THREE.Color) => {
    const options = [k.shirt, k.shorts, k.shirt2, '#ffffff', '#1b2a41', '#e63946'].map((c) => new THREE.Color(c));
    return options.find((c) => !looksSelected(c) && (!avoid || far(c, avoid))) ?? options[3];
  };
  const h = pick(home);
  return [h, pick(away, h)];
}
