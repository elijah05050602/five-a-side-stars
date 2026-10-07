import { describe, expect, it } from 'vitest';
import { IDLE_INPUT, NET_GIVE, type MatchSim } from '../game/sim';
import { GoalNet } from '../game/Pitch';
import { cpuMatch, runUntil } from './helpers';

/** A free ball struck at the home side's target goal from `back` metres out, crossing the line at zAim. */
function strike(sim: MatchSim, speed: number, zAim: number, opts: { z0?: number; y?: number; vy?: number; back?: number } = {}): void {
  runUntil(sim, (s) => s.phase === 'play');
  const { z0 = 0, y = 0.2, vy = 1, back = 3 } = opts;
  const x = sim.goalX(0), b = sim.ball;
  b.owner = null;
  b.pos = { x: x - back, z: z0 };
  const dz = zAim - z0, n = Math.hypot(back, dz);
  b.vel = { x: (back / n) * speed, z: (dz / n) * speed };
  b.y = y; b.vy = vy;
  b.lastKick = b.lastTouch = sim.players.find((p) => p.side === 0 && !p.isKeeper)!;
  for (const p of sim.players) { p.pos = { x: -x * 0.5, z: 4 }; p.kickCooldown = 99; }
}

/** Step on, noting how deep behind the line the ball goes and whether it ever comes back out. */
function follow(sim: MatchSim, steps: number): { deepest: number; widest: number; cameBack: boolean } {
  const L = sim.length / 2;
  let deepest = -99, widest = 0, inside = false, cameBack = false;
  for (let i = 0; i < steps; i++) {
    sim.step(1 / 60, IDLE_INPUT);
    sim.events.length = 0;
    const b = sim.ball, d = b.pos.x - L;
    deepest = Math.max(deepest, d);
    if (b.inGoal) { inside = true; widest = Math.max(widest, Math.abs(b.pos.z)); }
    if (inside && d < b.radius) cameBack = true;
    expect(b.y).toBeGreaterThanOrEqual(0);
  }
  return { deepest, widest, cameBack };
}

describe('the ball in the net', () => {
  it('a firm shot carries into the goal, stretches the back of the net and drops to the grass inside', () => {
    const sim = cpuMatch();
    strike(sim, 15, 0);
    const { deepest, cameBack } = follow(sim, 90);
    expect(sim.goals).toHaveLength(1);
    expect(sim.phase).toBe('goal');
    const r = sim.ball.radius, back = sim.goalDepth - r;
    // Past where the net hangs, but no further than it can stretch.
    expect(deepest).toBeGreaterThan(back + 0.15);
    expect(deepest).toBeLessThanOrEqual(back + NET_GIVE + 1e-6);
    expect(cameBack).toBe(false);
    // At rest on the ground, in the goal.
    const b = sim.ball;
    expect(Math.hypot(b.vel.x, b.vel.z)).toBeLessThan(0.2);
    expect(b.y).toBeLessThan(0.01);
    expect(b.pos.x - sim.length / 2).toBeGreaterThan(r);
    expect(b.inGoal).toBe(1);
  });

  it('a harder shot stretches the net further than a soft one', () => {
    const soft = cpuMatch(), hard = cpuMatch();
    strike(soft, 9, 0);
    strike(hard, 18, 0);
    expect(follow(hard, 60).deepest).toBeGreaterThan(follow(soft, 60).deepest + 0.08);
  });

  it('an angled shot into the corner bulges the side netting', () => {
    const sim = cpuMatch();
    strike(sim, 14, -0.9, { z0: 3, y: 0.1 });
    const { widest } = follow(sim, 90);
    expect(sim.goals).toHaveLength(1);
    expect(widest).toBeGreaterThan(sim.goalWidth / 2 - sim.ball.radius + 0.05);
    expect(widest).toBeLessThanOrEqual(sim.goalWidth / 2 - sim.ball.radius + NET_GIVE + 1e-6);
  });

  it('a high shot under the bar is brought down by the roof of the net', () => {
    const sim = cpuMatch();
    strike(sim, 15, 0, { y: sim.goalHeight - 0.35, vy: 2 });
    let highest = 0;
    for (let i = 0; i < 60; i++) {
      sim.step(1 / 60, IDLE_INPUT);
      const d = sim.ball.pos.x - sim.length / 2;
      if (d > 0.3) highest = Math.max(highest, sim.ball.y);
    }
    expect(sim.goals).toHaveLength(1);
    expect(highest).toBeLessThan(sim.goalHeight);
  });

  it('the goal is given once, to the shooter, while the ball settles in the net', () => {
    const sim = cpuMatch();
    strike(sim, 15, 0.5);
    const goals: string[] = [];
    for (let i = 0; i < 120; i++) {
      sim.step(1 / 60, IDLE_INPUT);
      goals.push(...sim.events.filter((e) => e.type === 'goal').map((e) => `${e.side}`));
      sim.events.length = 0;
    }
    expect(goals).toEqual(['0']);
    expect(sim.score).toEqual([1, 0]);
  });
});

describe('the goal frame', () => {
  it('a shot at the post bounces back out and is not a goal', () => {
    const sim = cpuMatch();
    strike(sim, 12, sim.goalWidth / 2, { y: 0.3, vy: 0 });
    follow(sim, 30);
    expect(sim.goals).toHaveLength(0);
    expect(sim.ball.vel.x).toBeLessThan(0);
  });

  it('a shot at the crossbar bounces back out and is not a goal', () => {
    const sim = cpuMatch();
    strike(sim, 14, 0, { y: sim.goalHeight + 0.02, vy: 1.05 });
    follow(sim, 30);
    expect(sim.goals).toHaveLength(0);
    expect(sim.ball.vel.x).toBeLessThan(0);
  });

  it('a ball dropping on the roof of the net is not a goal, and is out of play', () => {
    const sim = cpuMatch();
    strike(sim, 8, 0, { y: sim.goalHeight + 1.1, vy: 2, back: 2.5 });
    follow(sim, 60);
    expect(sim.goals).toHaveLength(0);
    expect(sim.phase).toBe('setpiece');
  });
});

describe('the drawn net', () => {
  const dims = { length: 30, width: 19, goalWidth: 3, goalHeight: 1.5, goalDepth: 1.2 };
  /** How far the net has moved from where it hangs (the furthest any point has gone, out of the goal). */
  const bulge = (net: GoalNet): number => {
    const lines = net.group.children[0] as unknown as { geometry: { attributes: { position: { array: Float32Array } } } };
    const p = lines.geometry.attributes.position.array;
    let most = 0;
    for (let i = 0; i < p.length; i += 3) most = Math.max(most, p[i] - (dims.length / 2 + dims.goalDepth));
    return most;
  };

  for (const detail of ['cloth', 'dent'] as const) {
    it(`${detail}: the back of the net bulges where the ball pushes it, then hangs still again`, () => {
      const net = new GoalNet(1, dims, detail, 12);
      const ball = { x: dims.length / 2 + dims.goalDepth + 0.2, y: 0.4, z: 0.5, r: 0.16, inGoal: 1 as const };
      for (let i = 0; i < 10; i++) net.update(1 / 60, ball);
      // Out past the back bar by about as far as the ball pushes it.
      expect(bulge(net)).toBeGreaterThan(0.25);
      expect(bulge(net)).toBeLessThan(0.45);
      for (let i = 0; i < 60 * 6; i++) net.update(1 / 60, null);
      expect(bulge(net)).toBeLessThan(0.06); // just the rope's own sag
    });
  }

  it('a ball outside the goal pushes the side netting in, not out', () => {
    const net = new GoalNet(1, dims, 'cloth', 12);
    const ball = { x: dims.length / 2 + 0.6, y: 0.3, z: dims.goalWidth / 2 + 0.05, r: 0.16, inGoal: 0 as const };
    for (let i = 0; i < 10; i++) net.update(1 / 60, ball);
    const lines = net.group.children[0] as unknown as { geometry: { attributes: { position: { array: Float32Array } } } };
    const p = lines.geometry.attributes.position.array;
    let inward = 0;
    for (let i = 0; i < p.length; i += 3) if (p[i] > dims.length / 2 + 0.05 && p[i + 2] > 0) inward = Math.max(inward, dims.goalWidth / 2 - p[i + 2]);
    expect(inward).toBeGreaterThan(0.05);
  });
});
