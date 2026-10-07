import { describe, expect, it } from 'vitest';
import type { AgeGroup, Difficulty } from '../data/types';
import { firstBounce, heightAt, vyForHeight } from '../game/flight';
import type { MatchSim, SimPlayer } from '../game/sim';
import { cpuMatch, runUntil, team } from './helpers';

const AGES: AgeGroup[] = ['U5', 'U6', 'U8', 'U10'];
type Kicks = { longKick(p: SimPlayer, aim: null, powerMul: number): void };

function match(age: AgeGroup, over: { difficulty?: Difficulty; assist?: boolean; human?: boolean } = {}): MatchSim {
  const sim = cpuMatch({ home: team('h', 'Home', age), away: team('a', 'Away', age), difficulty: over.difficulty ?? 'normal', assist: over.assist, humanSide: over.human ? 0 : null });
  runUntil(sim, (s) => s.phase === 'play');
  return sim;
}

/** Where the ball, just struck, comes down first, along the pitch. */
function landing(sim: MatchSim, from: { x: number }): number {
  const b = sim.ball, speed = Math.hypot(b.vel.x, b.vel.z);
  return from.x + (firstBounce(speed, b.vy) * b.vel.x) / speed;
}

/** Full-power shots from `back` metres straight out: how high each one is as it reaches the goal line. */
function shotHeights(sim: MatchSim, back: number, charge: number, n: number): number[] {
  const p = sim.players.find((q) => q.side === 0 && !q.isKeeper)!;
  const out: number[] = [];
  for (let i = 0; i < n; i++) {
    p.pos = { x: sim.goalX(0) - back, z: 0 };
    sim.ball.owner = p; sim.ball.pos = { ...p.pos }; sim.ball.y = 0;
    sim.shoot(p, null, 0.85 + 0.45 * charge);
    const b = sim.ball, speed = Math.hypot(b.vel.x, b.vel.z);
    out.push(heightAt(back / (b.vel.x / speed), speed, b.vy) ?? 0);
  }
  return out;
}

const overBar = (sim: MatchSim, hs: number[]) => hs.filter((h) => h > sim.goalHeight + sim.ball.radius).length / hs.length;

describe('lofted balls land where they are aimed', () => {
  it('a lob comes down within a metre of its spot, short or long, at every age', () => {
    for (const age of AGES) {
      const sim = match(age);
      const p = sim.players.find((q) => q.side === 0 && !q.isKeeper)!;
      for (const d of [4, 8, 12, 16]) {
        p.pos = { x: -sim.length * 0.3, z: 0 };
        sim.ball.owner = p; sim.ball.pos = { ...p.pos }; sim.ball.y = 0;
        sim.lob(p, null, { x: p.pos.x + d, z: 0 });
        // A lofted pass is meant to drop a little short and bounce on to the spot.
        expect(Math.abs(landing(sim, p.pos) - (p.pos.x + d * 0.9)), `${age} ${d} m`).toBeLessThan(1);
      }
    }
  });

  it('a full-power goal kick first bounces by the keeper\'s Strength: short of halfway, at halfway, or beyond', () => {
    for (const age of AGES) {
      const sim = match(age);
      const k = sim.players.find((q) => q.side === 0 && q.isKeeper)!;
      const share = (strength: number) => {
        const xs: number[] = [];
        for (let i = 0; i < 40; i++) {
          k.pos = { x: sim.ownGoalX(0) + 1, z: 0 }; k.mul.strength = strength;
          sim.ball.owner = k; sim.ball.pos = { ...k.pos }; sim.ball.y = 0;
          (sim as unknown as Kicks).longKick(k, null, 1.1);
          expect(sim.ball.lofted).toBe(true); // it checks up as it lands
          xs.push((landing(sim, k.pos) - sim.ownGoalX(0)) / sim.length);
        }
        return { lo: Math.min(...xs), hi: Math.max(...xs) };
      };
      const weak = share(0.7), mid = share(1), strong = share(1.35);
      expect(weak.lo, age).toBeGreaterThan(0.34); expect(weak.hi, age).toBeLessThan(0.45);
      expect(mid.lo, age).toBeGreaterThan(0.45); expect(mid.hi, age).toBeLessThan(0.55);
      expect(strong.lo, age).toBeGreaterThan(0.56); expect(strong.hi, age).toBeLessThan(0.67);
    }
  });
});

describe('shot height', () => {
  it('a soft shot from far out loops down onto the bounce; a hard one is still in the air at the line', () => {
    const dist = 18, aim = 0.9;
    const soft = 8, hard = 18;
    expect(firstBounce(soft, vyForHeight(dist, soft, aim, 10))).toBeLessThan(dist);
    expect(firstBounce(hard, vyForHeight(dist, hard, aim, 10))).toBeGreaterThan(dist);
    expect(heightAt(dist, hard, vyForHeight(dist, hard, aim, 10))).toBeCloseTo(aim, 1);
  });

  it('on Starter your full-power long shots never go over the bar', () => {
    for (const age of ['U6', 'U8', 'U10'] as AgeGroup[]) {
      const sim = match(age, { assist: true, difficulty: 'easy', human: true });
      const hs = shotHeights(sim, 20, 1, 200);
      expect(Math.max(...hs), age).toBeLessThan(sim.goalHeight - sim.ball.radius);
    }
  });

  it('on Hard a full-power shot from far out can fly over, from close in hardly ever, and a tap stays low', () => {
    const sim = match('U10', { difficulty: 'hard', human: true });
    const far = overBar(sim, shotHeights(sim, 20, 1, 300));
    const near = overBar(sim, shotHeights(sim, 6, 1, 300));
    expect(far).toBeGreaterThan(0.12);
    expect(far).toBeLessThan(0.4);
    expect(near).toBeLessThan(0.03);
    expect(Math.max(...shotHeights(sim, 12, 0, 100))).toBeLessThan(sim.goalHeight * 0.6);
  });

  it('the harder the level, the more your long shots fly over', () => {
    const rate = (difficulty: Difficulty) => {
      const sim = match('U8', { difficulty, human: true });
      return overBar(sim, shotHeights(sim, 20, 1, 300));
    };
    const easy = rate('easy'), normal = rate('normal'), hard = rate('hard');
    expect(easy).toBeLessThan(normal);
    expect(normal).toBeLessThan(hard);
  });
});

describe('where a goal went in', () => {
  it('the goal carries the height and spot it crossed the line at', () => {
    const sim = match('U8');
    const x = sim.goalX(0), b = sim.ball;
    b.owner = null;
    b.pos = { x: x - 3, z: 0.6 };
    b.vel = { x: 14, z: 0 };
    b.y = 0.5; b.vy = 0;
    b.lastKick = b.lastTouch = sim.players.find((p) => p.side === 0 && !p.isKeeper)!;
    for (const p of sim.players) { p.pos = { x: -x * 0.5, z: 4 }; p.kickCooldown = 99; }
    runUntil(sim, (s) => s.goals.length > 0, 120);
    const at = sim.goals[0]?.at;
    expect(at).toBeDefined();
    expect(at!.z).toBeCloseTo(0.6, 1);
    // It dropped a little over the three metres before the line.
    expect(at!.y).toBeLessThan(0.5);
    expect(at!.y).toBeGreaterThan(0.2);
  });
});
