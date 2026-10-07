import { describe, expect, it } from 'vitest';
import * as THREE from 'three';
import { GROUNDS, GROUND_IDS, crowdFill, groundFor, homeGround } from '../game/grounds';
import { PANEL_ASPECT, boardGeometry, inkFor, type BoardFace } from '../game/adBoards';
import { SEAT_SPACING, endStandLayout, seatSpots, standAisles, standLayout } from '../game/stadium';
import { floodlightPositions } from '../game/Pitch';
import { graphicsProfile } from '../game/graphics';
import { AGE_STATS } from '../data/ageGroups';
import { RUNOFF_END } from '../game/sim';

describe('grounds', () => {
  it('gives a team the same home ground every time, and league and cup matches are played there', () => {
    const g = homeGround('team-abc');
    for (let i = 0; i < 5; i++) expect(homeGround('team-abc')).toBe(g);
    expect(groundFor({ occasion: 'league', homeId: 'team-abc' })).toBe(g);
    expect(groundFor({ occasion: 'cup', homeId: 'team-abc' })).toBe(g);
  });

  it('spreads teams over every ground', () => {
    const seen = new Set(Array.from({ length: 200 }, (_, i) => homeGround(`team-${i}`).id));
    expect([...seen].sort()).toEqual([...GROUND_IDS].sort());
  });

  it('plays a cup final at City Lights and training at the Village Field', () => {
    expect(groundFor({ occasion: 'final', homeId: 'x' })).toBe(GROUNDS.city);
    expect(groundFor({ occasion: 'training', homeId: 'x' })).toBe(GROUNDS.village);
  });

  it('picks every ground for friendlies, and the mountains more often in the snow', () => {
    const count = (weather: 'clear' | 'snow') => {
      const n: Record<string, number> = {};
      for (let i = 0; i < 3000; i++) { const g = groundFor({ occasion: 'friendly', homeId: 'x', weather, time: 'day' }); n[g.id] = (n[g.id] ?? 0) + 1; }
      return n;
    };
    const clear = count('clear'), snow = count('snow');
    for (const id of GROUND_IDS) expect(clear[id]).toBeGreaterThan(300);
    expect(snow.snowy).toBeGreaterThan(clear.snowy * 2);
  });

  it('fills the stands most for a final and least for training', () => {
    expect(crowdFill('final')).toBe(1);
    expect(crowdFill('training')).toBeLessThan(crowdFill('friendly'));
    expect(crowdFill('friendly')).toBeLessThan(crowdFill('league'));
    expect(crowdFill('league')).toBeLessThan(crowdFill('cup'));
  });
});

describe('ad boards', () => {
  const face = (length: number, height: number): BoardFace => ({ centre: new THREE.Vector3(), right: new THREE.Vector3(1, 0, 0), normal: new THREE.Vector3(0, 0, 1), length, height });

  it('keeps every panel the same shape as on the canvas, on boards of any size', () => {
    const faces = [face(37, 0.82), face(7.3, 0.82), face(15, 0.3), face(4.95, 1.65)];
    const g = boardGeometry(faces);
    const uv = g.attributes.uv as THREE.BufferAttribute;
    faces.forEach((f, i) => {
      const du = uv.getX(i * 4 + 1) - uv.getX(i * 4);
      // One panel (one unit of u) is three times as wide as the face is tall.
      expect(f.length / du).toBeCloseTo(f.height * PANEL_ASPECT, 5);
      expect(uv.getY(i * 4)).toBe(0);
      expect(uv.getY(i * 4 + 2)).toBe(1);
    });
  });

  it('starts each board on a fresh panel, so no panel is cut in two at a corner', () => {
    const g = boardGeometry([face(10, 0.82), face(10, 0.82), face(3, 0.3)]);
    const uv = g.attributes.uv as THREE.BufferAttribute;
    for (const i of [0, 1, 2]) expect(Number.isInteger(uv.getX(i * 4))).toBe(true);
  });

  it('writes on team colours in whichever of navy or white reads better', () => {
    expect(inkFor('#ffffff')).not.toBe('#ffffff');
    expect(inkFor('#ffd23f')).not.toBe('#ffffff');
    expect(inkFor('#1b2a41')).toBe('#ffffff');
    expect(inkFor('#e63946')).toBe('#ffffff');
  });
});

describe('stadium layout', () => {
  it('leaves the two aisles free of seats', () => {
    const lay = standLayout(34, 21);
    const spots = seatSpots(lay);
    expect(spots.length).toBeGreaterThan(40);
    for (const a of standAisles(lay)) for (const x of spots) expect(Math.abs(x - a)).toBeGreaterThan(SEAT_SPACING * 0.75);
  });

  it('puts the end stand behind the boards and between the floodlights, on every pitch size', () => {
    for (const info of Object.values(AGE_STATS)) {
      const { length: L, width: W } = info.pitch;
      const end = endStandLayout(L, W, RUNOFF_END);
      expect(end.x0 - end.rowDepth / 2).toBeGreaterThan(L / 2 + RUNOFF_END + 1);
      const lights = floodlightPositions(L, W).filter(([x]) => x > 0);
      for (const [x, , z] of lights) {
        const inX = x > end.x0 - end.rowDepth && x < end.x0 + end.rows * end.rowDepth;
        expect(inX && Math.abs(z) < end.len / 2 + 0.5).toBe(false);
      }
    }
  });

  it('keeps the end stand, the people by the pitch and the grass blades off Low graphics', () => {
    expect(graphicsProfile('low')).toMatchObject({ stadiumExtras: false, grassDetail: false });
    expect(graphicsProfile('medium')).toMatchObject({ stadiumExtras: true, grassDetail: true });
    expect(graphicsProfile('high')).toMatchObject({ stadiumExtras: true, grassDetail: true });
  });
});
