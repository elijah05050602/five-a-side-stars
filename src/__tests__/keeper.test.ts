import { describe, expect, it } from 'vitest';
import { IDLE_INPUT } from '../game/sim';
import { cpuMatch, runUntil } from './helpers';

describe('keeper dives', () => {
  /** A shot from side 1 heading for side 0's goal, well wide of the keeper. */
  function shotAtKeeper() {
    const sim = cpuMatch({ halfSeconds: 120 });
    sim.phase = 'play';
    const keeper = sim.players.find((p) => p.side === 0 && p.isKeeper)!;
    const own = sim.ownGoalX(0);
    for (const p of sim.players) if (p !== keeper) { p.pos = { x: 10, z: 6 }; p.speedMul = 0; }
    keeper.pos = { x: own + 0.7, z: 0 };
    const b = sim.ball;
    b.owner = null; b.y = 0; b.vy = 0;
    b.pos = { x: own + 6, z: 0 };
    b.vel = { x: -10, z: 1.9 }; // crosses the keeper's line about 1.2 m to their side
    b.lastKick = sim.players.find((p) => p.side === 1 && !p.isKeeper)!;
    b.wasPass = false;
    b.flightId++;
    return { sim, keeper };
  }

  it('commits to the dive: one direction in the air, then stays down and gets up before moving again', () => {
    const { sim, keeper } = shotAtKeeper();
    runUntil(sim, () => keeper.diveAnim > 0, 120);
    expect(keeper.diveAnim).toBeGreaterThan(0);
    const dir = keeper.diveDir;
    // Turn the ball round the other way: a committed keeper cannot change direction.
    sim.ball.vel = { x: -10, z: -dir * 6 };
    let wrongWay = false;
    while (keeper.diveAnim > 0) {
      sim.step(1 / 60, IDLE_INPUT); sim.events.length = 0;
      if (keeper.vel.z * dir < -0.5) wrongWay = true;
      expect(keeper.diveDir).toBe(dir);
    }
    expect(wrongWay).toBe(false);
    expect(keeper.recover).toBeGreaterThan(0);
    // Getting up: the keeper stays put while the ball is played elsewhere.
    sim.ball.owner = null; sim.ball.vel = { x: 0, z: 0 }; sim.ball.pos = { x: keeper.pos.x + 3, z: keeper.pos.z - dir * 1.5 };
    const at = { ...keeper.pos };
    while (keeper.recover > 0) { sim.step(1 / 60, IDLE_INPUT); sim.events.length = 0; }
    expect(Math.hypot(keeper.pos.x - at.x, keeper.pos.z - at.z)).toBeLessThan(0.15);
    // Back on their feet, they move again.
    runUntil(sim, () => Math.hypot(keeper.vel.x, keeper.vel.z) > 0.5, 60);
    expect(Math.hypot(keeper.vel.x, keeper.vel.z)).toBeGreaterThan(0.5);
  });
});

describe('keeper handling', () => {
  /** A gentle shot straight at side 0's keeper, so it is caught rather than parried. */
  function catchable(y: number) {
    const sim = cpuMatch({ halfSeconds: 120 });
    sim.phase = 'play';
    const keeper = sim.players.find((p) => p.side === 0 && p.isKeeper)!;
    const own = sim.ownGoalX(0);
    for (const p of sim.players) if (p !== keeper) { p.pos = { x: 10, z: 6 }; p.speedMul = 0; }
    keeper.pos = { x: own + 0.7, z: 0 };
    const b = sim.ball;
    b.owner = null; b.y = y; b.vy = 0;
    b.pos = { x: own + 4, z: 0 };
    b.vel = { x: -5, z: 0 };
    b.lastKick = sim.players.find((p) => p.side === 1 && !p.isKeeper)!;
    b.wasPass = false;
    b.flightId++;
    return { sim, keeper };
  }

  it('catches a shot in the hands, holds it up in front and then throws or kicks it out', () => {
    const { sim, keeper } = catchable(0.5);
    runUntil(sim, (s) => s.ball.owner === keeper, 120);
    expect(sim.ball.owner).toBe(keeper);
    expect(keeper.handling).toBe(true);
    expect(['catchChest', 'catchHigh', 'scoop']).toContain(keeper.move);
    runUntil(sim, () => false, 20);
    expect(sim.ball.y).toBeGreaterThan(0.4 * sim.stats.scale);
    runUntil(sim, (s) => s.ball.owner !== keeper, 60 * 6);
    expect(sim.ball.lastKick).toBe(keeper);
    expect(['throw', 'punt']).toContain(keeper.move);
    expect(keeper.handling).toBe(false);
  });

  it('a ball rolled along the grass is scooped up', () => {
    const { sim, keeper } = catchable(0);
    sim.ball.vel = { x: -3.6, z: 0 };
    runUntil(sim, (s) => s.ball.owner === keeper, 120);
    expect(keeper.move).toBe('scoop');
  });
});

describe('pass back to the keeper', () => {
  function backPass() {
    const sim = cpuMatch({ halfSeconds: 120 });
    sim.phase = 'play';
    const keeper = sim.players.find((p) => p.side === 0 && p.isKeeper)!;
    const own = sim.ownGoalX(0);
    const p = sim.players.find((q) => q.side === 0 && !q.isKeeper)!;
    for (const o of sim.players) if (o !== p && o !== keeper) { o.pos = { x: o.side === 0 ? 8 : 12, z: o.side === 0 ? 7 : -7 }; o.speedMul = 0; }
    keeper.pos = { x: own + 0.7, z: 0 };
    p.pos = { x: own + 7, z: 1 }; p.vel = { x: 0, z: 0 };
    sim.ball.owner = p; sim.ball.pos = { x: own + 6.7, z: 1 }; sim.ball.vel = { x: 0, z: 0 };
    return { sim, keeper, p };
  }

  it('an outfield player can play it back to their keeper, who takes it without diving or counting a save', () => {
    const { sim, keeper, p } = backPass();
    sim.pass(p, { x: -1, z: -0.1 });
    expect(sim.ball.receiver).toBe(keeper);
    let saves = 0, dived = false;
    for (let i = 0; i < 60 * 4 && sim.ball.owner !== keeper; i++) {
      sim.step(1 / 60, IDLE_INPUT);
      saves += sim.events.filter((e) => e.type === 'save').length;
      sim.events.length = 0;
      if (keeper.diveAnim > 0) dived = true;
    }
    expect(sim.ball.owner).toBe(keeper);
    expect(saves).toBe(0);
    expect(dived).toBe(false);
    expect(sim.score).toEqual([0, 0]);
  });

  it('a pass back stays at the keeper\'s feet rather than in their hands', () => {
    const { sim, keeper, p } = backPass();
    sim.pass(p, { x: -1, z: -0.1 });
    runUntil(sim, (s) => s.ball.owner === keeper, 60 * 4);
    expect(keeper.handling).toBe(false);
    runUntil(sim, () => false, 20);
    expect(sim.ball.y).toBeLessThan(0.05);
  });

  it('the keeper then gives it away to a team-mate', () => {
    const { sim, keeper, p } = backPass();
    sim.pass(p, { x: -1, z: -0.1 });
    runUntil(sim, (s) => s.ball.owner === keeper, 60 * 4);
    for (const o of sim.players) o.speedMul = 1;
    runUntil(sim, (s) => s.ball.owner !== keeper, 60 * 6);
    expect(sim.ball.lastKick).toBe(keeper);
  });
});
