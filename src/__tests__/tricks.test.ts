import { describe, expect, it } from 'vitest';
import { IDLE_INPUT, MatchSim, type SimPlayer, type TrickKind } from '../game/sim';
import type { AgeGroup } from '../data/types';
import { team } from './helpers';
import { seedRandom } from './setup';

function sim(age: AgeGroup = 'U8'): MatchSim {
  const home = team('h', 'Home', age);
  const away = { ...team('a', 'Away', age), id: 'a' };
  const s = new MatchSim({ home, away, difficulty: 'normal', halfSeconds: 600, humanSide: 0, mode: 'match', supers: false });
  s.phase = 'play';
  return s;
}

/** Your player on the ball in midfield, running towards the other goal, with one defender `ahead` metres in front (or none). */
function setUp(s: MatchSim, ahead: number | null): { p: SimPlayer; d: SimPlayer } {
  const p = s.players.find((q) => q.side === 0 && !q.isKeeper)!;
  const d = s.players.find((q) => q.side === 1 && !q.isKeeper)!;
  for (const q of s.players) if (!q.isKeeper && q !== p && q !== d) q.pos = { x: -10, z: 8 };
  p.pos = { x: 0, z: 0 };
  p.facing = 0;
  p.vel = { x: 3, z: 0 };
  d.pos = ahead === null ? { x: 6, z: 7 } : { x: ahead, z: 0 };
  s.ball.pos = { x: 0.3, z: 0 };
  s.ball.owner = p;
  return { p, d };
}

/** Which moves the trick button does, over many tries, for a stick direction and a defender. */
function kinds(aim: { x: number; z: number } | null, ahead: number | null, age: AgeGroup = 'U8'): Set<TrickKind> {
  const seen = new Set<TrickKind>();
  for (let i = 0; i < 40; i++) {
    seedRandom(100 + i);
    const s = sim(age);
    const { p } = setUp(s, ahead);
    if (aim) p.facing = Math.atan2(aim.z, aim.x); // the stick turns the facing before the trick is played
    s.trick(p, aim);
    if (p.trickKind) seen.add(p.trickKind);
  }
  return seen;
}

describe('skill moves', () => {
  it('straight on in space is a step-over or a body swerve', () => {
    expect([...kinds(null, null)].sort()).toEqual(['feint', 'stepover']);
  });

  it('a defender right in front is a nutmeg, or a rainbow flick for the bigger kids only', () => {
    expect([...kinds(null, 0.9)].sort()).toEqual(['nutmeg', 'rainbow']);
    expect([...kinds(null, 0.7, 'U6')]).toEqual(['nutmeg']);
  });

  it('pulling back against the run is a drag-back or a Cruyff turn', () => {
    expect([...kinds({ x: -1, z: 0 }, 1.2)].sort()).toEqual(['cruyff', 'dragback']);
  });

  it('pushing sideways is an elastico, or a roulette with someone in the way', () => {
    expect([...kinds({ x: 0, z: 1 }, null)]).toEqual(['elastico']);
    expect([...kinds({ x: 0, z: 1 }, 1.2)].sort()).toEqual(['elastico', 'roulette']);
  });

  it('every move keeps the trick event, and the turns keep the ball at the feet', () => {
    for (const [aim, ahead] of [[null, null], [{ x: -1, z: 0 }, 1.2], [{ x: 0, z: 1 }, 1.2], [{ x: 0, z: -1 }, null]] as const) {
      seedRandom(7);
      const s = sim();
      const { p } = setUp(s, ahead);
      if (aim) p.facing = Math.atan2(aim.z, aim.x);
      s.trick(p, aim);
      expect(s.events.some((e) => e.type === 'trick' && e.kind === p.trickKind)).toBe(true);
      if (p.trickKind !== 'nutmeg' && p.trickKind !== 'rainbow') expect(s.ball.owner).toBe(p);
    }
  });

  it('a rainbow flick that works lifts the ball over the defender and lands it beyond them', () => {
    let tried = 0;
    for (let i = 0; i < 60 && tried < 3; i++) {
      seedRandom(300 + i);
      const s = sim('U10');
      const { p, d } = setUp(s, 0.9);
      s.trick(p, null);
      const ev = s.events.find((e) => e.type === 'trick');
      if (p.trickKind !== 'rainbow' || !ev?.ok) continue;
      tried++;
      let peak = 0;
      for (let k = 0; k < 90 && s.ball.owner !== p; k++) {
        s.step(1 / 60, IDLE_INPUT);
        peak = Math.max(peak, s.ball.y);
        if (s.ball.owner === d) break;
      }
      expect(peak).toBeGreaterThan(0.6);
      expect(s.ball.owner).not.toBe(d);
    }
    expect(tried).toBeGreaterThan(0);
  });

  it('an elastico carries the ball out to one side and back across the other', () => {
    seedRandom(11);
    const s = sim();
    const { p } = setUp(s, null);
    p.facing = Math.PI / 2;
    s.trick(p, { x: 0, z: 1 });
    expect(p.trickKind).toBe('elastico');
    let lo = Infinity, hi = -Infinity;
    for (let k = 0; k < 30; k++) {
      s.step(1 / 60, { ...IDLE_INPUT, moveZ: 0 });
      lo = Math.min(lo, s.ball.pos.x - p.pos.x);
      hi = Math.max(hi, s.ball.pos.x - p.pos.x);
    }
    expect(hi - lo).toBeGreaterThan(0.25);
  });
});
