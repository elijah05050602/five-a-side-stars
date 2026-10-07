import { describe, expect, it } from 'vitest';
import { IDLE_INPUT, type MatchSim, type SimPlayer } from '../game/sim';
import type { InputState } from '../game/input';
import { cpuMatch, runUntil } from './helpers';

const push = (over: Partial<InputState>): InputState => ({ ...IDLE_INPUT, ...over });

/** Get play going, then knock the ball over the near touchline off an away player: a throw-in to the home side. */
function throwInToHome(sim: MatchSim): void {
  runUntil(sim, (s) => s.phase === 'play');
  const b = sim.ball;
  b.owner = null;
  b.pos = { x: 2, z: sim.width / 2 + 0.6 };
  b.vel = { x: 0, z: 0 }; b.y = 0; b.vy = 0;
  b.lastTouch = sim.teamOf(1).find((p) => !p.isKeeper)!;
  sim.step(1 / 60, IDLE_INPUT);
  expect(sim.setPiece?.kind).toBe('throwin');
  expect(sim.setPiece?.side).toBe(0);
}

/** Step until the ball first comes down after the throw; returns how far it carried from the touchline spot. */
function firstBounce(sim: MatchSim, from: { x: number; z: number }): number {
  for (let i = 0; i < 180 && sim.ball.y > 0.02 && !sim.ball.owner; i++) { sim.step(1 / 60, IDLE_INPUT); sim.events.length = 0; }
  return Math.hypot(sim.ball.pos.x - from.x, sim.ball.pos.z - from.z);
}

describe('throw-ins', () => {
  it('the thrower may not play the ball again until someone else has touched it', () => {
    const sim = cpuMatch({ humanSide: 0 });
    throwInToHome(sim);
    const thrower = sim.setPiece!.taker;
    runUntil(sim, (s) => s.ball.owner === thrower);
    for (let i = 0; i < 80 && sim.phase === 'setpiece'; i++) sim.step(1 / 60, i > 70 ? push({ pass: true }) : IDLE_INPUT);
    expect(sim.phase).toBe('play');
    expect(sim.ball.thrower).toBe(thrower);
    // You take over a team-mate straight away, not the kid who threw it.
    sim.step(1 / 60, IDLE_INPUT);
    expect(sim.controlledBy[0]).not.toBe(thrower);

    // Drop the ball dead at the thrower's feet with nobody else near: they cannot pick it up.
    const far = (p: SimPlayer) => { p.pos = { x: -sim.length / 2 + 1, z: 0 }; p.vel = { x: 0, z: 0 }; };
    const place = () => { const b = sim.ball; b.owner = null; b.pos = { x: thrower.pos.x + 0.2, z: thrower.pos.z }; b.vel = { x: 0, z: 0 }; b.y = 0; b.vy = 0; };
    for (let i = 0; i < 30; i++) {
      for (const p of sim.players) if (p !== thrower) far(p);
      thrower.pos = { x: 2, z: sim.width / 2 - 2 };
      place();
      sim.step(1 / 60, IDLE_INPUT);
      expect(sim.ball.owner).toBeNull();
    }
    // A team-mate touches it: now it is anyone's ball again.
    const mate = sim.teamOf(0).find((p) => p !== thrower && !p.isKeeper)!;
    mate.pos = { x: sim.ball.pos.x + 0.2, z: sim.ball.pos.z };
    sim.step(1 / 60, IDLE_INPUT);
    expect(sim.phase).toBe('play');
    expect(sim.ball.owner).toBe(mate);
    expect(sim.ball.thrower).toBeNull();
  });

  it('a computer team throws it in to a team-mate, a good few metres in', () => {
    const sim = cpuMatch();
    throwInToHome(sim);
    const spot = { ...sim.setPiece!.spot };
    const taker = sim.setPiece!.taker;
    runUntil(sim, (s) => s.phase !== 'setpiece');
    expect(sim.ball.lastKick).toBe(taker);
    expect(sim.ball.receiver?.side).toBe(0);
    expect(firstBounce(sim, spot)).toBeGreaterThan(4);
  });

  it('a fully charged long throw carries well onto the pitch', () => {
    const sim = cpuMatch({ humanSide: 0 });
    throwInToHome(sim);
    const spot = { ...sim.setPiece!.spot };
    runUntil(sim, (s) => s.setPiece?.placed === true && s.ball.owner === s.setPiece.taker);
    // Aim straight across the pitch and hold shoot for a full-power throw.
    for (let i = 0; i < 60; i++) sim.step(1 / 60, push({ moveZ: -1, shootHeld: true }));
    sim.step(1 / 60, push({ moveZ: -1 }));
    expect(sim.phase).toBe('play');
    expect(firstBounce(sim, spot)).toBeGreaterThan(9);
  });
});
