import { describe, expect, it } from 'vitest';
import { IDLE_INPUT, MatchSim } from '../game/sim';
import { AGE_STATS } from '../data/ageGroups';
import { AGE_GROUPS } from '../data/types';
import { cpuMatch, runUntil, team } from './helpers';

describe('match engine: setup', () => {
  it('builds a pitch and ten players from the home team\'s age group', () => {
    const sim = cpuMatch();
    expect(sim.players).toHaveLength(10);
    expect(sim.length).toBe(AGE_STATS.U8.pitch.length);
    expect(sim.width).toBe(AGE_STATS.U8.pitch.width);
    expect(sim.players.filter((p) => p.isKeeper)).toHaveLength(2);
    expect(sim.phase).toBe('kickoff');
    expect(sim.score).toEqual([0, 0]);
  });

  it('lines both teams up in their own half with the kick-off side on the ball', () => {
    const sim = cpuMatch();
    for (const p of sim.players) {
      if (sim.ball.owner === p) continue;
      if (p.side === 0) expect(p.pos.x).toBeLessThan(0); else expect(p.pos.x).toBeGreaterThan(0);
    }
    expect(sim.ball.owner?.side).toBe(0);
    expect(sim.ball.pos).toEqual({ x: 0, z: 0 });
  });

  it('every age group produces a playable match', () => {
    for (const age of AGE_GROUPS) {
      const sim = new MatchSim({ home: team('h', 'H', age), away: team('a', 'A', age), difficulty: 'easy', halfSeconds: 5, humanSide: null });
      runUntil(sim, (s) => s.phase === 'fulltime');
      expect(sim.phase).toBe('fulltime');
      expect(sim.goalWidth).toBe(AGE_STATS[age].goalWidth);
    }
  });
});

describe('match engine: flow', () => {
  it('plays two halves, pauses at half time and finishes at full time', () => {
    const sim = cpuMatch({ halfSeconds: 15 });
    const sawHalftime = runUntil(sim, (s) => s.phase === 'halftime') > 0 && sim.phase === 'halftime';
    expect(sawHalftime).toBe(true);
    expect(sim.half).toBe(1);
    expect(sim.clock).toBeGreaterThanOrEqual(15);
    runUntil(sim, (s) => s.phase === 'fulltime');
    expect(sim.half).toBe(2);
    expect(sim.phase).toBe('fulltime');
    expect(sim.clock).toBeGreaterThanOrEqual(30);
    // Full time is final: stepping again changes nothing.
    const clock = sim.clock;
    sim.step(1 / 60, IDLE_INPUT);
    expect(sim.clock).toBe(clock);
  });

  it('keeps the ball and the players on the pitch', () => {
    const sim = cpuMatch({ halfSeconds: 30, difficulty: 'hard' });
    const L = sim.length / 2 + sim.goalDepth + 0.5, W = sim.width / 2 + 0.5;
    let steps = 0;
    while (sim.phase !== 'fulltime' && steps++ < 60 * 90) {
      sim.step(1 / 60, IDLE_INPUT);
      sim.events.length = 0;
      expect(Math.abs(sim.ball.pos.x)).toBeLessThanOrEqual(L);
      expect(Math.abs(sim.ball.pos.z)).toBeLessThanOrEqual(W);
      expect(sim.ball.y).toBeGreaterThanOrEqual(0);
      for (const p of sim.players) {
        expect(Number.isFinite(p.pos.x) && Number.isFinite(p.pos.z)).toBe(true);
        expect(Math.abs(p.pos.x)).toBeLessThanOrEqual(sim.length / 2 + 3);
        expect(Math.abs(p.pos.z)).toBeLessThanOrEqual(sim.width / 2 + 3);
      }
    }
  });

  it('pausing freezes the clock and resuming carries on', () => {
    const sim = cpuMatch();
    runUntil(sim, (s) => s.clock > 1);
    sim.togglePause();
    expect(sim.phase).toBe('paused');
    const clock = sim.clock;
    for (let i = 0; i < 60; i++) sim.step(1 / 60, IDLE_INPUT);
    expect(sim.clock).toBe(clock);
    sim.togglePause();
    expect(sim.phase).not.toBe('paused');
    sim.step(1 / 60, IDLE_INPUT);
    expect(sim.clock).toBeGreaterThan(clock);
  });

  it('the score and goal list always agree', () => {
    const sim = cpuMatch({ halfSeconds: 60, difficulty: 'hard' });
    runUntil(sim, (s) => s.phase === 'fulltime', 60 * 200);
    const home = sim.goals.filter((g) => g.side === 0).length;
    const away = sim.goals.filter((g) => g.side === 1).length;
    expect(sim.score).toEqual([home, away]);
  });
});

describe('match engine: goals', () => {
  /** Drop a free ball just in front of a goal so it rolls over the line. */
  function rollIntoGoal(sim: MatchSim, goalSide: 0 | 1, z = 0, y = 0): void {
    runUntil(sim, (s) => s.phase === 'play');
    const x = sim.goalX(goalSide);
    const b = sim.ball;
    b.owner = null;
    b.pos = { x: x - Math.sign(x) * 0.5, z };
    b.vel = { x: Math.sign(x) * 8, z: 0 };
    b.y = y; b.vy = 0;
    for (const p of sim.players) { p.pos = { x: -Math.sign(x) * 3, z: 4 }; p.kickCooldown = 1; }
  }

  it('a ball crossing the line inside the posts is a goal for the attacking side', () => {
    const sim = cpuMatch();
    const kicker = sim.players.find((p) => p.side === 0 && !p.isKeeper)!;
    rollIntoGoal(sim, 0);
    sim.ball.lastKick = kicker;
    const seen: string[] = [];
    for (let i = 0; i < 60 && sim.phase !== 'goal'; i++) { sim.step(1 / 60, IDLE_INPUT); seen.push(...sim.events.map((e) => `${e.type}:${e.side}`)); sim.events.length = 0; }
    expect(sim.phase).toBe('goal');
    expect(sim.score).toEqual([1, 0]);
    expect(sim.goals[0]).toMatchObject({ side: 0, ownGoal: false, scorer: kicker.info });
    expect(seen).toContain('goal:0');
  });

  it('a defender\'s last touch into their own net is an own goal that still counts', () => {
    const sim = cpuMatch();
    const defender = sim.players.find((p) => p.side === 1 && p.info.position === 'DEF')!;
    rollIntoGoal(sim, 0);
    sim.ball.lastKick = defender;
    runUntil(sim, (s) => s.phase === 'goal', 60);
    expect(sim.score).toEqual([1, 0]);
    expect(sim.goals[0].ownGoal).toBe(true);
    expect(sim.goals[0].scorer).toBe(defender.info);
  });

  it('a ball over the bar or wide of the posts is not a goal', () => {
    const over = cpuMatch();
    rollIntoGoal(over, 0, 0, over.goalHeight + 0.5);
    runUntil(over, (s) => s.phase === 'goal', 30);
    expect(over.score).toEqual([0, 0]);
    const wide = cpuMatch();
    rollIntoGoal(wide, 1, wide.goalWidth / 2 + 0.5);
    runUntil(wide, (s) => s.phase === 'goal', 30);
    expect(wide.score).toEqual([0, 0]);
    expect(Math.abs(wide.ball.pos.x)).toBeLessThanOrEqual(wide.length / 2);
  });

  it('after a goal the side that conceded kicks off', () => {
    const sim = cpuMatch();
    rollIntoGoal(sim, 0);
    runUntil(sim, (s) => s.phase === 'goal', 60);
    runUntil(sim, (s) => s.phase === 'kickoff', 60 * 5);
    expect(sim.phase).toBe('kickoff');
    expect(sim.kickoffSide).toBe(1);
    expect(sim.ball.owner?.side).toBe(1);
  });
});

describe('penalty shoot-out', () => {
  it('runs to a decision with at most five kicks each before sudden death', () => {
    const sim = cpuMatch({ mode: 'shootout', halfSeconds: 60 });
    expect(sim.shootout).not.toBeNull();
    expect(sim.phase).toBe('setpiece');
    runUntil(sim, (s) => s.phase === 'fulltime', 60 * 60 * 5);
    expect(sim.phase).toBe('fulltime');
    const so = sim.shootout!;
    const [a, b] = so.results;
    expect(sim.score).toEqual([a.filter(Boolean).length, b.filter(Boolean).length]);
    expect(sim.score[0]).not.toBe(sim.score[1]);
    // Nobody takes more than one kick ahead of the other side.
    expect(Math.abs(a.length - b.length)).toBeLessThanOrEqual(1);
    expect(a.length).toBeGreaterThanOrEqual(2);
  });
});

describe('training', () => {
  it('only the opposing keeper takes the field and the timer ends it', () => {
    const sim = new MatchSim({ home: team('h', 'H'), away: team('a', 'A'), difficulty: 'normal', halfSeconds: 10, humanSide: 0, mode: 'training' });
    expect(sim.players.filter((p) => p.side === 1)).toHaveLength(1);
    expect(sim.players.find((p) => p.side === 1)!.isKeeper).toBe(true);
    runUntil(sim, (s) => s.phase === 'fulltime');
    expect(sim.phase).toBe('fulltime');
    expect(sim.score[0]).toBe(sim.trainingPoints);
  });
});
