import { describe, expect, it } from 'vitest';
import { IDLE_INPUT } from '../game/sim';
import type { InputState } from '../game/input';
import { cpuMatch, runUntil } from './helpers';

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

  it('the clock waits at the first kick-off of the match until the ball is played', () => {
    const sim = cpuMatch({ humanSide: 0 });
    for (let i = 0; i < 60 * 5; i++) { sim.step(1 / 60, IDLE_INPUT); sim.events.length = 0; }
    expect(sim.phase).toBe('kickoff');
    expect(sim.clock).toBe(0);
    sim.step(1 / 60, push({ pass: true }));
    for (let i = 0; i < 60; i++) { sim.step(1 / 60, IDLE_INPUT); sim.events.length = 0; }
    expect(sim.clock).toBeGreaterThan(0.9);
  });

  it('the clock waits at the second-half kick-off too', () => {
    const sim = cpuMatch({ humanSide: 1 });
    runUntil(sim, (s) => s.half === 2);
    const atHalf = sim.clock;
    expect(atHalf).toBeGreaterThanOrEqual(sim.config.halfSeconds);
    expect(sim.ball.owner?.side).toBe(1); // you kick off the second half
    for (let i = 0; i < 60 * 5; i++) { sim.step(1 / 60, IDLE_INPUT); sim.events.length = 0; }
    expect(sim.phase).toBe('kickoff');
    expect(sim.clock).toBe(atHalf);
  });

  it('after a goal the clock keeps running while the kick-off is taken', () => {
    const sim = cpuMatch({ humanSide: 0, halfSeconds: 120 });
    runUntil(sim, (s) => s.phase === 'kickoff' && s.goals.length > 0 && s.ball.owner?.side === 0);
    expect(sim.goals.length).toBeGreaterThan(0);
    const before = sim.clock;
    for (let i = 0; i < 60 * 2; i++) { sim.step(1 / 60, IDLE_INPUT); sim.events.length = 0; }
    expect(sim.phase).toBe('kickoff');
    expect(sim.clock).toBeGreaterThan(before + 1.9);
  });
});
