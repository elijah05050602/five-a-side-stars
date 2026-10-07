import { describe, expect, it } from 'vitest';
import { IDLE_INPUT, type MatchSim, type SimConfig, type SimPlayer } from '../game/sim';
import type { InputState } from '../game/input';
import { cpuMatch, runUntil } from './helpers';
import { seedRandom } from './setup';

const push = (over: Partial<InputState>): InputState => ({ ...IDLE_INPUT, ...over });
const still = (p: SimPlayer, x: number, z: number) => { p.pos = { x, z }; p.vel = { x: 0, z: 0 }; };

/**
 * The human's passer on the halfway line facing the far goal with the ball at their feet, a team-mate a short pass
 * ahead and another a long pass ahead, and the opponents out of the way (or one right on the passer with `pressed`).
 */
function setUp(over: Partial<SimConfig>, pressed = false) {
  const sim = cpuMatch({ humanSide: 0, ...over });
  runUntil(sim, (s) => s.phase === 'play');
  const [passer, near, far, spare] = sim.teamOf(0).filter((p) => !p.isKeeper);
  const L = sim.length;
  still(passer, 0, 0);
  passer.facing = 0;
  still(near, L * 0.15, 0.8);
  still(far, L * 0.42, -0.8);
  still(spare, -L * 0.2, sim.width * 0.4);
  sim.teamOf(1).filter((p) => !p.isKeeper).forEach((o, i) => still(o, -L * 0.3, -sim.width * 0.4 + i));
  if (pressed) still(sim.teamOf(1).find((p) => !p.isKeeper)!, -0.9, 0.6);
  sim.controlledBy[0] = passer;
  const b = sim.ball;
  b.owner = passer; b.pos = { x: passer.radius + b.radius, z: 0 }; b.vel = { x: 0, z: 0 }; b.y = 0; b.vy = 0;
  sim.events.length = 0;
  return { sim, passer, near, far };
}

const speed = (sim: MatchSim) => Math.hypot(sim.ball.vel.x, sim.ball.vel.z);

describe('assisted passing', () => {
  it('a tap finds the near team-mate and a full-power pass the far one, where the stick points', () => {
    const tap = setUp({ difficulty: 'normal' });
    tap.sim.humanPass(tap.passer, { x: 1, z: 0 }, null);
    expect(tap.sim.ball.receiver).toBe(tap.near);
    const long = setUp({ difficulty: 'normal' });
    long.sim.humanPass(long.passer, { x: 1, z: 0 }, 1);
    expect(long.sim.ball.receiver).toBe(long.far);
  });

  it('nobody where the stick points with a held pass: it goes into space that way', () => {
    const { sim, passer } = setUp({ difficulty: 'normal' });
    sim.humanPass(passer, { x: 0, z: 1 }, 0.5);
    expect(sim.ball.receiver).toBeNull();
    expect(sim.ball.vel.z).toBeGreaterThan(Math.abs(sim.ball.vel.x));
  });

  it('Starter weights the pass for the team-mate whatever the power; Hard plays the power you chose', () => {
    const starter = setUp({ difficulty: 'easy', assist: true });
    starter.sim.humanPass(starter.passer, { x: 1, z: 0 }, 1);
    const hardSoft = setUp({ difficulty: 'hard' });
    hardSoft.sim.humanPass(hardSoft.passer, { x: 1, z: 0 }, 0.75);
    const hardFull = setUp({ difficulty: 'hard' });
    hardFull.sim.humanPass(hardFull.passer, { x: 1, z: 0 }, 1);
    // All three find the far team-mate, but on Hard less power is a slower ball.
    expect(starter.sim.ball.receiver).toBe(starter.far);
    expect(hardSoft.sim.ball.receiver).toBe(hardSoft.far);
    expect(speed(hardSoft.sim)).toBeLessThan(speed(hardFull.sim) - 0.3);
  });

  it('mispasses: never on Starter, rare on Normal, more on Hard, and more under pressure from a weak passer', () => {
    const rate = (over: Partial<SimConfig>, pressed: boolean, wobble: number) => {
      let slips = 0;
      const n = 300;
      for (let i = 0; i < n; i++) {
        seedRandom(1000 + i);
        const { sim, passer } = setUp(over, pressed);
        passer.mul.passWobble = wobble;
        sim.humanPass(passer, { x: 1, z: 0 }, null);
        if (sim.events.some((e) => e.type === 'mispass')) slips++;
      }
      return slips / n;
    };
    expect(rate({ difficulty: 'easy', assist: true }, true, 1.6)).toBe(0);
    expect(rate({ difficulty: 'easy' }, false, 1.6)).toBe(0);
    const normalCalm = rate({ difficulty: 'normal' }, false, 1);
    const hardCalm = rate({ difficulty: 'hard' }, false, 1);
    const hardPressedWeak = rate({ difficulty: 'hard' }, true, 1.6);
    const hardPressedGood = rate({ difficulty: 'hard' }, true, 0.5);
    expect(normalCalm).toBeLessThan(0.06);
    expect(hardCalm).toBeGreaterThan(normalCalm);
    expect(hardPressedWeak).toBeGreaterThan(0.15);
    expect(hardPressedWeak).toBeLessThan(0.4);
    expect(hardPressedGood).toBeLessThan(hardPressedWeak / 2);
  });

  it('holding Pass fills the meter and plays a longer pass on release; a quick tap still passes', () => {
    const held = setUp({ difficulty: 'normal' });
    for (let i = 0; i < 45; i++) held.sim.step(1 / 60, push({ moveX: 1, pass: i === 0, passHeld: true }));
    expect(held.passer.passCharge).toBeGreaterThan(0.9);
    expect(held.sim.ball.owner).toBe(held.passer);
    held.sim.step(1 / 60, push({ moveX: 1 }));
    expect(held.sim.ball.owner).toBeNull();
    expect(held.sim.ball.receiver).toBe(held.far);
    expect(held.passer.passCharge).toBe(0);

    // A tap too quick for the sim to see it held is still a pass.
    const tap = setUp({ difficulty: 'normal' });
    tap.sim.step(1 / 60, push({ moveX: 1, pass: true }));
    expect(tap.sim.ball.owner).toBeNull();
    expect(tap.sim.ball.receiver).toBe(tap.near);
  });
});
