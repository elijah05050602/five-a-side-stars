import { describe, expect, it } from 'vitest';
import { KIT_COLOURS, makeKit } from '../data/defaults';
import { looksSelected, teamRingColours } from '../game/ringColours';
import * as THREE from 'three';

describe('player rings', () => {
  it('never give a team a ring that looks like a selection ring', () => {
    for (const a of KIT_COLOURS) for (const b of KIT_COLOURS) for (const c of KIT_COLOURS) {
      const [h, w] = teamRingColours(makeKit(a, b, c, a), makeKit(b, c, a, b));
      expect(looksSelected(h)).toBe(false);
      expect(looksSelected(w)).toBe(false);
    }
  });

  it('treat yellow, orange and cyan as selection colours, and red, blue and white as team colours', () => {
    for (const c of ['#ffd23f', '#ff7a00', '#f26a1b', '#00c2cb']) expect(looksSelected(new THREE.Color(c))).toBe(true);
    for (const c of ['#e63946', '#3da5f4', '#ffffff', '#1b2a41', '#2eb872']) expect(looksSelected(new THREE.Color(c))).toBe(false);
  });
});
