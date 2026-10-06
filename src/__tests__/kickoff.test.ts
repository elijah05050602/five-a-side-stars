import { describe, expect, it } from 'vitest';
import { IDLE_INPUT } from '../game/sim';
import type { InputState } from '../game/input';
import { cpuMatch } from './helpers';

const push = (over: Partial<InputState>): InputState => ({ ...IDLE_INPUT, ...over });

describe('kick-off', () => {
  it('the taker cannot run with the ball; it has to be passed or shot first', () => {
    const sim = cpuMatch({ humanSide: 0 });
    expect(sim.phase).toBe('kickoff');
    const taker = sim.ball.owner!;
    expect(taker.side).toBe(0);
    const start = { ...taker.pos };
    for (let i = 0; i < 90; i++) { sim.step(1 / 60, push({ moveX: 1, sprint: true })); sim.events.length = 0; }
    expect(sim.phase).toBe('kickoff');
    expect(sim.ball.owner).toBe(taker);
    expect(Math.hypot(taker.pos.x - start.x, taker.pos.z - start.z)).toBeLessThan(0.1);
    // Pressing pass gets the game going.
    sim.step(1 / 60, push({ pass: true }));
    expect(sim.phase).toBe('play');
    expect(sim.ball.owner).toBeNull();
    expect(sim.ball.lastKick).toBe(taker);
  });

  it('a taker who waits too long has the ball played on for them', () => {
    const sim = cpuMatch({ humanSide: 0 });
    for (let i = 0; i < 60 * 9 && sim.phase === 'kickoff'; i++) { sim.step(1 / 60, IDLE_INPUT); sim.events.length = 0; }
    expect(sim.phase).toBe('play');
  });

  it('a CPU taker passes rather than dribbling off', () => {
    const sim = cpuMatch();
    const taker = sim.ball.owner!;
    const start = { ...taker.pos };
    for (let i = 0; i < 60 * 3 && sim.phase === 'kickoff'; i++) { sim.step(1 / 60, IDLE_INPUT); sim.events.length = 0; }
    expect(sim.phase).toBe('play');
    expect(sim.ball.lastKick).toBe(taker);
    expect(Math.hypot(taker.pos.x - start.x, taker.pos.z - start.z)).toBeLessThan(0.3);
  });
});
