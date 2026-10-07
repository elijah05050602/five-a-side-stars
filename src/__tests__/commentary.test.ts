import { describe, expect, it } from 'vitest';
import { Commentator, LINES, classifyShot, goalKey, goalLine, line, placement, type LineKey } from '../game/commentary';
import { resolveConditions } from '../game/Weather';
import { IDLE_INPUT } from '../game/sim';
import { cpuMatch, runUntil } from './helpers';

const first = () => 0; // always the first line of a list, so tests are exact

describe('commentary lines', () => {
  it('fills in names and scores', () => {
    expect(line('goalOpener', { scorer: 'Mia', team: 'Rocket Rovers' }, first)).toBe('GOAL! Mia opens the scoring for Rocket Rovers!');
    expect(line('fulltimeWin', { winner: 'Sunny Sharks', score: '3-1' }, first)).toBe('Full time! Sunny Sharks win it 3-1!');
  });

  it('every line list has at least two options and no stray tokens', () => {
    for (const [key, lines] of Object.entries(LINES)) {
      expect(lines.length, key).toBeGreaterThanOrEqual(2);
      for (const l of lines) expect(l, key).not.toMatch(/\{(?!scorer|team|score|keeper|shooter|offender|leader|winner|points|owner|home|away)\w+\}/);
    }
  });

  it('picks the right goal line for the situation', () => {
    const base = { side: 0 as const, scorer: 'Mia', team: 'Rovers', ownGoal: false, minute: 10, scorerGoals: 1, mode: 'match' as const };
    expect(goalLine({ ...base, score: [1, 0] }, first)).toContain('opens the scoring');
    expect(goalLine({ ...base, score: [1, 1] }, first)).toContain('levels it up');
    expect(goalLine({ ...base, score: [2, 1] }, first)).toContain('Rovers lead');
    expect(goalLine({ ...base, score: [1, 2] }, first)).toContain('pull one back');
    expect(goalLine({ ...base, score: [4, 1] }, first)).toContain('running away');
    expect(goalLine({ ...base, score: [3, 0], scorerGoals: 3 }, first)).toContain('HAT-TRICK');
    expect(goalLine({ ...base, score: [1, 0], minute: 39 }, first)).toContain('Late drama');
    expect(goalLine({ ...base, score: [1, 0], ownGoal: true }, first)).toContain('own net');
    expect(goalLine({ ...base, score: [1, 0], penalty: true }, first)).toContain('from the spot');
    expect(goalLine({ ...base, score: [1, 0], longRange: true }, first)).toContain('From miles out');
    expect(goalLine({ ...base, score: [1, 0], mode: 'shootout' }, first)).toContain('shoot-out');
    expect(goalLine({ ...base, score: [1, 0], mode: 'training', rocket: true }, first)).toContain('ROCKET');
    expect(goalLine({ ...base, score: [1, 0], header: true }, first)).toContain('HEADER');
    expect(goalLine({ ...base, score: [1, 0], closeRange: true }, first)).toContain('Tapped in');
    expect(goalLine({ ...base, score: [2, 2], wasDown: 2 }, first)).toContain('comeback');
    expect(goalLine({ ...base, score: [3, 2], wasDown: 1 }, first)).toContain('turned it around');
    expect(goalLine({ ...base, score: [1, 1], wasDown: 1 }, first)).toContain('levels it up');
  });

  it('sorts where a goal went in: corners near a post, the roof high, the middle low', () => {
    const dims = { goalWidth: 3, goalHeight: 1.5, radius: 0.16 };
    expect(placement({ y: 1.2, z: 1.2 }, dims)).toBe('topCorner');
    expect(placement({ y: 1.2, z: 0 }, dims)).toBe('roof');
    expect(placement({ y: 0.16, z: -1.2 }, dims)).toBe('bottomCorner');
    expect(placement({ y: 0.16, z: 0.2 }, dims)).toBe('lowMiddle');
    expect(placement({ y: 0.7, z: 0.6 }, dims)).toBe('plain');
  });

  it('only names a corner when the goal really went in one', () => {
    const corner = /corner/i;
    const placed: LineKey[] = ['goalTopCorner', 'goalBottomCorner', 'goalPenaltyCorner'];
    for (const [key, lines] of Object.entries(LINES)) if (key.startsWith('goal') && !placed.includes(key as LineKey)) for (const l of lines) expect(l, key).not.toMatch(corner);
    const base = { side: 0 as const, scorer: 'Mia', team: 'Rovers', ownGoal: false, minute: 10, scorerGoals: 1, mode: 'match' as const, score: [2, 1] as const };
    // A ball rolled down the middle never gets a corner line, whatever the dice say.
    for (let i = 0; i < 50; i++) {
      const r = i / 50;
      for (const extra of [{}, { penalty: true }, { mode: 'training' as const }]) {
        const key = goalKey({ ...base, ...extra, placement: 'lowMiddle' }, () => r);
        expect(placed, key).not.toContain(key);
      }
    }
    expect(goalKey({ ...base, placement: 'topCorner' }, first)).toBe('goalTopCorner');
    expect(goalKey({ ...base, placement: 'bottomCorner' }, first)).toBe('goalBottomCorner');
    expect(goalKey({ ...base, placement: 'roof' }, first)).toBe('goalRoof');
    expect(goalKey({ ...base, penalty: true, placement: 'topCorner' }, first)).toBe('goalPenaltyCorner');
    expect(goalKey({ ...base, penalty: true, placement: 'plain' }, first)).toBe('goalPenalty');
  });
});

describe('shot watching', () => {
  const dims = { halfLength: 15, goalWidth: 3, goalHeight: 1.6, radius: 0.16 };
  const ball = (o: Partial<Parameters<typeof classifyShot>[0]>) => ({ x: 0, y: 0, z: 0, vx: 5, ownerIsKeeper: false, ownerSide: null as 0 | 1 | null, ...o });

  it('calls wide, over, bar and post from where the ball bounces back', () => {
    expect(classifyShot(ball({ x: 14.9, z: 2.2, vx: -3 }), dims, 1, 0)).toBe('wide');
    expect(classifyShot(ball({ x: 14.9, z: 1.6, vx: -3 }), dims, 1, 0)).toBe('post');
    expect(classifyShot(ball({ x: 14.9, z: 0, y: 2.1, vx: -3 }), dims, 1, 0)).toBe('over');
    expect(classifyShot(ball({ x: 14.9, z: 0, y: 1.55, vx: -3 }), dims, 1, 0)).toBe('bar');
    // Still flying towards goal: nothing to say yet. Inside the goal mouth at ground level: that is a goal, not a miss.
    expect(classifyShot(ball({ x: 10, z: 0, vx: 8 }), dims, 1, 0)).toBeNull();
    expect(classifyShot(ball({ x: 14.9, z: 0, y: 0.2, vx: -1 }), dims, 1, 0)).toBeNull();
    // Away attacks the other way.
    expect(classifyShot(ball({ x: -14.9, z: 2.2, vx: 3 }), dims, -1, 1)).toBe('wide');
  });

  it('knows when the keeper has gathered it', () => {
    expect(classifyShot(ball({ x: 13, ownerIsKeeper: true, ownerSide: 1 }), dims, 1, 0)).toBe('gathered');
    expect(classifyShot(ball({ x: 13, ownerIsKeeper: false, ownerSide: 1 }), dims, 1, 0)).toBeNull();
    expect(classifyShot(ball({ x: 13, ownerIsKeeper: true, ownerSide: 0 }), dims, 1, 0)).toBeNull();
  });
});

describe('commentator over a match', () => {
  it('opens the match, names the scorer and calls full time', () => {
    const sim = cpuMatch({ halfSeconds: 12 });
    const c = new Commentator({ weather: 'clear', time: 'day' }, first);
    const said: string[] = [];
    let guard = 0;
    while (sim.phase !== 'fulltime' && guard++ < 60 * 60) {
      sim.step(1 / 60, IDLE_INPUT);
      said.push(...c.onEvents(sim, sim.events).filter((l): l is string => !!l));
      sim.events.length = 0;
      const q = c.onFrame(sim, 1 / 60);
      if (q) said.push(q);
    }
    expect(said[0]).toBe('And we are off! Home against Away.');
    expect(said.some((l) => l.startsWith('Half time'))).toBe(true);
    expect(said[said.length - 1]).toMatch(/^Full time|^The whistle goes/);
    for (const g of sim.goals) expect(said.some((l) => l.includes(g.scorer.name))).toBe(true);
  });

  it('a shot that misses gets a line naming the shooter', () => {
    const sim = cpuMatch();
    runUntil(sim, (s) => s.phase === 'play');
    const c = new Commentator({ weather: 'clear', time: 'day' }, first);
    const shooter = sim.players.find((p) => p.side === 0 && !p.isKeeper)!;
    c.onEvents(sim, [{ type: 'shot', side: 0, player: shooter.info }]);
    const b = sim.ball;
    b.owner = null;
    b.pos = { x: sim.length / 2 - b.radius - 0.02, z: sim.goalWidth }; // well wide
    b.vel = { x: -2, z: 0 };
    expect(c.onFrame(sim, 1 / 60)).toBe(`${shooter.info.name} drags it wide!`);
    // Once called, it is not called again.
    expect(c.onFrame(sim, 1 / 60)).toBeNull();
  });

  it('fills a quiet spell with something about the play', () => {
    const sim = cpuMatch();
    runUntil(sim, (s) => s.phase === 'play');
    const c = new Commentator({ weather: 'rain', time: 'day' }, () => 0.5);
    let said: string | null = null;
    for (let i = 0; i < 60 * 40 && !said; i++) { sim.step(1 / 60, IDLE_INPUT); sim.events.length = 0; said = c.onFrame(sim, 1 / 60); }
    expect(said).not.toBeNull();
  });
});

describe('weather choices', () => {
  it('named choices give what they say; random covers the whole range', () => {
    expect(resolveConditions('sunny')).toEqual({ weather: 'clear', time: 'day' });
    expect(resolveConditions('snow', () => 0.9).weather).toBe('snow');
    expect(resolveConditions('night', () => 0.9).time).toBe('night');
    const seen = new Set<string>();
    let x = 0;
    const rng = () => { x = (x + 0.3137) % 1; return x; };
    for (let i = 0; i < 200; i++) { const c = resolveConditions('random', rng); seen.add(`${c.weather}/${c.time}`); }
    expect(seen.size).toBeGreaterThanOrEqual(6);
  });
});
