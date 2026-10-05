import { afterEach, describe, expect, it, vi } from 'vitest';
import { IDLE_INPUT, MatchSim, RUNOFF_END, skillMuls } from '../game/sim';
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
    // Match pitches have run-off behind the goal line (for goal kicks and corners); the boards stop it there.
    expect(Math.abs(wide.ball.pos.x)).toBeLessThanOrEqual(wide.length / 2 + RUNOFF_END);
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

describe('dribbling', () => {
  afterEach(() => vi.restoreAllMocks());

  /** A human dribbler on their own: everyone else is sent far away and frozen. */
  function soloRun(control: number, sprint = false, seconds = 3) {
    const sim = cpuMatch({ humanSide: 0, halfSeconds: 120 });
    sim.phase = 'play';
    const p = sim.ball.owner!;
    p.info.skills = { ...p.info.skills, control };
    p.mul = { ...p.mul, touchDist: skillMulsFor(sim, p) };
    for (const o of sim.players) if (o !== p) { o.pos = { x: o.side === 0 ? -15 : 15, z: 9 }; o.speedMul = 0; }
    let maxGap = 0, touches = 0, owned = true;
    for (let i = 0; i < seconds * 60; i++) {
      sim.step(1 / 60, { ...IDLE_INPUT, moveX: 1, sprint });
      touches += sim.events.filter((e) => e.type === 'touch').length;
      sim.events.length = 0;
      owned &&= sim.ball.owner === p;
      maxGap = Math.max(maxGap, Math.hypot(sim.ball.pos.x - p.pos.x, sim.ball.pos.z - p.pos.z));
    }
    return { maxGap, touches, owned };
  }
  const skillMulsFor = (sim: MatchSim, p: MatchSim['players'][number]) => skillMuls(p.info, sim.teams[0].ageGroup).touchDist;

  it('pops the ball just off the feet each touch but never loses it', () => {
    for (const control of [1, 3, 5]) {
      const run = soloRun(control, true, 2);
      expect(run.owned).toBe(true);
      expect(run.touches).toBeGreaterThanOrEqual(5);
      expect(run.maxGap).toBeGreaterThan(0.6);
      expect(run.maxGap).toBeLessThan(1.3);
    }
  });

  it('pushes it further at a sprint and keeps it closer with better Dribbling', () => {
    const jog = soloRun(3).maxGap;
    expect(soloRun(3, true).maxGap).toBeGreaterThan(jog);
    expect(soloRun(4).maxGap).toBeLessThan(soloRun(1).maxGap);
  });

  it('a defender can nick the ball while it is away from the dribbler\'s feet', () => {
    vi.spyOn(Math, 'random').mockReturnValue(0.01);
    const sim = cpuMatch({ humanSide: null, halfSeconds: 120 });
    sim.phase = 'play';
    const o = sim.ball.owner!;
    o.pos = { x: 0, z: 0 };
    o.vel = { x: 3, z: 0 };
    sim.ball.pos = { x: 1.6, z: 0 };
    sim.ball.vel = { x: 3, z: 0 };
    const thief = sim.players.find((p) => p.side !== o.side && !p.isKeeper)!;
    thief.pos = { x: 1.9, z: 0.2 };
    sim.step(1 / 60, IDLE_INPUT);
    expect(sim.ball.owner).toBe(thief);
    expect(thief.match.tackles).toBe(1);
  });
});

describe('passing and lobs', () => {
  /** Side 0's attacker on the ball with one team-mate up the pitch and a defender standing in the lane. Only the team-mate can move. */
  function lane() {
    const sim = cpuMatch({ humanSide: null, halfSeconds: 120 });
    sim.phase = 'play';
    const p = sim.ball.owner!;
    p.pos = { x: -4, z: 0 }; p.vel = { x: 0, z: 0 };
    sim.ball.pos = { x: -3.6, z: 0 };
    const mate = sim.players.find((q) => q.side === 0 && q !== p && !q.isKeeper)!;
    const defender = sim.players.find((q) => q.side === 1 && !q.isKeeper)!;
    for (const o of sim.players) if (o !== p) { o.pos = { x: o.side === 0 ? -14 : 14, z: o.side === 0 ? -8 : 8 }; o.speedMul = 0; }
    mate.pos = { x: 6, z: 0 };
    mate.speedMul = 1;
    defender.pos = { x: 1, z: 0 };
    return { sim, p, mate, defender };
  }

  it('a lob sails over a defender in the lane and drops to the team-mate', () => {
    const { sim, p, mate, defender } = lane();
    sim.lob(p, { x: 1, z: 0 });
    let overHead = false;
    runUntil(sim, (s) => {
      if (Math.abs(s.ball.pos.x - defender.pos.x) < 0.3) overHead = s.ball.y > 0.6 * s.stats.scale + 0.2;
      return s.ball.owner !== null;
    }, 60 * 4);
    expect(overHead).toBe(true);
    expect(sim.ball.owner).toBe(mate);
  });

  it('from out wide near goal the same button crosses into the box', () => {
    const { sim, p, mate, defender } = lane();
    const W = sim.width / 2, L = sim.length / 2;
    p.pos = { x: L - 4, z: W - 1 };
    sim.ball.pos = { x: L - 3.7, z: W - 1 };
    const back = sim.players.find((q) => q.side === 0 && q !== p && q !== mate && !q.isKeeper)!;
    back.pos = { x: -5, z: 0 }; // an open team-mate behind would be the lofted-pass pick
    mate.pos = { x: L - (sim.width * 0.26 + 0.6), z: 0.5 };
    defender.pos = { x: L - 1, z: W - 5 }; // marking the near post, out of the cross's path
    sim.lob(p, null);
    expect(sim.ball.receiver).toBe(mate);
    runUntil(sim, (s) => s.ball.owner !== null, 60 * 4);
    expect(sim.ball.owner).toBe(mate);
  });

  it('a ground pass along the same lane is cut out by the defender', () => {
    const { sim, p, defender } = lane();
    sim.pass(p, { x: 1, z: 0 });
    runUntil(sim, (s) => s.ball.owner !== null, 60 * 4);
    expect(sim.ball.owner).toBe(defender);
  });

  it('passes are struck firmly enough to reach a team-mate still rolling', () => {
    const { sim, p, mate, defender } = lane();
    defender.pos = { x: 1, z: 6 };
    sim.pass(p, { x: 1, z: 0 });
    expect(Math.hypot(sim.ball.vel.x, sim.ball.vel.z)).toBeGreaterThan(sim.stats.power * 0.6);
    runUntil(sim, (s) => s.ball.owner !== null || Math.abs(s.ball.pos.x - mate.pos.x) < 0.5, 60 * 4);
    expect(Math.hypot(sim.ball.vel.x, sim.ball.vel.z) > 3 || sim.ball.owner === mate).toBe(true);
  });
});

describe('throw-ins', () => {
  it('a throw-in the taker runs out of time on is thrown in, not given to the other side', () => {
    const sim = cpuMatch({ humanSide: 0, halfSeconds: 120 });
    sim.phase = 'play';
    const b = sim.ball;
    b.owner = null;
    b.lastTouch = sim.players.find((p) => p.side === 1 && !p.isKeeper)!;
    b.pos = { x: 3, z: sim.width / 2 + 0.5 };
    b.vel = { x: 0, z: 1 };
    sim.step(1 / 60, IDLE_INPUT);
    expect(sim.phase).toBe('setpiece');
    // Nobody presses anything, so the referee has the taker throw it after a few seconds.
    const restarts: number[] = [];
    let played = 0;
    for (let i = 0; i < 60 * 15 && played < 30; i++) {
      sim.step(1 / 60, IDLE_INPUT);
      for (const e of sim.events) if (e.type === 'restart') restarts.push(e.side);
      sim.events.length = 0;
      if (sim.phase === 'play') played++;
    }
    expect(played).toBe(30);
    expect(restarts).toEqual([0]); // just the one throw, to the right side
  });
});
