import { describe, expect, it } from 'vitest';
import { IDLE_INPUT, MatchSim, type Side } from '../game/sim';
import type { Difficulty } from '../data/types';
import { team } from './helpers';
import { seedRandom } from './setup';

// The teams are made when the file loads, before each test's seed, so seed here too: their looks (build, height) change a keeper's reach.
seedRandom(4321);
const home = team('h', 'Home', 'U8');
// The same players under new ids, so both keepers are equally good and only the difficulty differs.
const away = { ...home, id: 'a', name: 'Away', players: home.players.map((p) => ({ ...p, id: `${p.id}-a` })) };

/** The share of n shots from 6 m that go in: by your team (side 0) or the computer's (side 1), aimed or straight at the keeper. */
function scored(side: Side, difficulty: Difficulty, atKeeper = false, n = 40): number {
  let goals = 0;
  for (let i = 0; i < n; i++) {
    const s = new MatchSim({ home, away, difficulty, halfSeconds: 600, humanSide: 0, mode: 'match' });
    s.phase = 'play';
    const shooter = s.players.find((p) => p.side === side && !p.isKeeper)!;
    const keeper = s.players.find((p) => p.side !== side && p.isKeeper)!;
    const line = s.goalX(side), dir = side === 0 ? 1 : -1;
    for (const p of s.players) if (!p.isKeeper && p !== shooter) p.pos = { x: -line * 0.8, z: 6 };
    shooter.pos = { x: line - dir * 6, z: atKeeper ? 0 : ((i % 5) - 2) * 0.8 };
    keeper.pos = { x: line - dir * 0.7, z: 0 };
    s.ball.pos = { ...shooter.pos };
    s.ball.owner = shooter;
    if (atKeeper) { s.ball.owner = null; s.ball.vel = { x: dir * 14, z: 0 }; s.ball.flightId++; s.ball.lastKick = s.ball.lastTouch = shooter; }
    else s.shoot(shooter, null, 1);
    const before = s.score[side];
    for (let k = 0; k < 150 && s.phase === 'play'; k++) s.step(1 / 60, IDLE_INPUT);
    if (s.score[side] > before) goals++;
  }
  return goals / n;
}

describe('keepers', () => {
  it('are beatable on Easy, and the computer finds yours much harder to beat', () => {
    const you = scored(0, 'easy'), cpu = scored(1, 'easy');
    expect(you).toBeGreaterThan(0.25);
    expect(you).toBeGreaterThan(cpu + 0.15);
  });

  it('get harder to beat from Easy to Hard', () => {
    expect(scored(0, 'easy')).toBeGreaterThan(scored(0, 'hard') + 0.1);
  });

  it('stop a shot that runs into them instead of letting it through', () => {
    expect(scored(0, 'easy', true)).toBeLessThan(0.15);
    expect(scored(1, 'easy', true)).toBeLessThan(0.15);
  });

  it('never let a long shot pass through their body, whichever team shoots', () => {
    // Every goal from 8 to 22 metres out: the ball's path must never have crossed the keeper's body.
    let through = 0, goals = 0;
    for (const difficulty of ['easy', 'hard'] as Difficulty[]) for (const side of [0, 1] as Side[]) for (const from of [8, 14, 20]) for (let i = 0; i < 20; i++) {
      const s = new MatchSim({ home, away, difficulty, halfSeconds: 600, humanSide: 0, mode: 'match' });
      s.phase = 'play';
      const shooter = s.players.find((p) => p.side === side && !p.isKeeper)!;
      const keeper = s.players.find((p) => p.side !== side && p.isKeeper)!;
      const line = s.goalX(side), dir = side === 0 ? 1 : -1;
      for (const p of s.players) if (!p.isKeeper && p !== shooter) p.pos = { x: -line * 0.9, z: 7 };
      shooter.pos = { x: line - dir * from, z: ((i % 5) - 2) * 1.2 };
      keeper.pos = { x: line - dir * 0.7, z: 0 };
      s.ball.pos = { ...shooter.pos };
      s.ball.owner = shooter;
      s.shoot(shooter, null, i % 2 ? 1.4 : 1);
      let closest = Infinity, heightThere = 0;
      const before = s.score[side];
      for (let k = 0; k < 400 && s.phase === 'play' && !s.ball.owner; k++) {
        const a = { ...s.ball.pos };
        s.step(1 / 60, IDLE_INPUT);
        // The nearest the ball came to the keeper's middle along this step's path, not just at its ends.
        const b = s.ball.pos, kx = keeper.pos.x - a.x, kz = keeper.pos.z - a.z, dx = b.x - a.x, dz = b.z - a.z;
        const t = Math.max(0, Math.min(1, (kx * dx + kz * dz) / (dx * dx + dz * dz || 1)));
        const d = Math.hypot(kx - dx * t, kz - dz * t);
        if (d < closest) { closest = d; heightThere = s.ball.y; }
      }
      if (s.score[side] <= before) continue;
      goals++;
      if (closest < keeper.radius + s.ball.radius && heightThere < 1.7 * s.stats.scale) through++;
    }
    expect(goals).toBeGreaterThan(20);
    expect(through).toBe(0);
  });

  it('never stand still while a long shot they could reach goes past them', () => {
    // A goal that passed within diving reach of the keeper must have had them diving for it.
    let stood = 0, goals = 0;
    for (const difficulty of ['easy', 'normal', 'hard'] as Difficulty[]) for (const side of [0, 1] as Side[]) for (let i = 0; i < 50; i++) {
      const s = new MatchSim({ home, away, difficulty, halfSeconds: 600, humanSide: 0, mode: 'match' });
      s.phase = 'play';
      const shooter = s.players.find((p) => p.side === side && !p.isKeeper)!;
      const keeper = s.players.find((p) => p.side !== side && p.isKeeper)!;
      const line = s.goalX(side), dir = side === 0 ? 1 : -1;
      for (const p of s.players) if (!p.isKeeper && p !== shooter) p.pos = { x: -line * 0.9, z: 7 };
      shooter.pos = { x: line - dir * 16, z: ((i % 5) - 2) * 1.5 };
      keeper.pos = { x: line - dir * 0.7, z: 0 };
      s.ball.pos = { ...shooter.pos };
      // Low and hard at a spot along the goal line.
      const aim = ((i % 7) / 3 - 1) * s.goalWidth * 0.45;
      const run = Math.hypot(line - s.ball.pos.x, aim - s.ball.pos.z);
      s.ball.vel = { x: (line - s.ball.pos.x) / run * 14, z: (aim - s.ball.pos.z) / run * 14 };
      s.ball.owner = null;
      shooter.kickCooldown = 1; // the shooter must not just collect it again
      s.ball.flightId++;
      s.ball.lastKick = s.ball.lastTouch = shooter;
      let dived = false, nearest = Infinity;
      for (let k = 0; k < 120 && s.phase === 'play' && !s.ball.owner; k++) {
        s.step(1 / 60, IDLE_INPUT);
        if (keeper.diveAnim > 0) dived = true;
        nearest = Math.min(nearest, Math.hypot(s.ball.pos.x - keeper.pos.x, s.ball.pos.z - keeper.pos.z));
      }
      if (s.score[side] === 0) continue;
      goals++;
      if (!dived && nearest < s.stats.keeperReach) stood++;
    }
    expect(goals).toBeGreaterThan(5);
    expect(stood).toBe(0);
  });


  it('make your long shots a real test on Hard, while Easy stays generous', () => {
    // Shots the way a player takes them: hold Shoot to power up, stick pointing at a corner, then let go.
    const rate = (difficulty: Difficulty, from: number, n = 40) => {
      let goals = 0;
      for (let i = 0; i < n; i++) {
        const s = new MatchSim({ home, away, difficulty, halfSeconds: 600, humanSide: 0, mode: 'match' });
        s.phase = 'play';
        const me = s.players.find((p) => p.side === 0 && !p.isKeeper)!;
        const line = s.goalX(0);
        for (const p of s.players) if (!p.isKeeper && p !== me) p.pos = { x: -line * 0.8, z: 6 };
        me.pos = { x: line - from, z: ((i % 5) - 2) * 1.2 };
        s.players.find((p) => p.side === 1 && p.isKeeper)!.pos = { x: line - 0.7, z: 0 };
        s.ball.pos = { ...me.pos };
        s.ball.owner = me;
        const corner = (i % 2 ? 1 : -1) * s.goalWidth * 0.4;
        const l = Math.hypot(line - me.pos.x, corner - me.pos.z);
        const stick = { moveX: (line - me.pos.x) / l, moveZ: (corner - me.pos.z) / l };
        for (let k = 0; k < (i % 3 ? 45 : 20); k++) s.step(1 / 60, { ...IDLE_INPUT, ...stick, shootHeld: true, shoot: k === 0 });
        s.step(1 / 60, { ...IDLE_INPUT, ...stick });
        for (let k = 0; k < 300 && s.phase === 'play' && !s.ball.owner; k++) s.step(1 / 60, IDLE_INPUT);
        if (s.score[0] > 0) goals++;
      }
      return goals / n;
    };
    expect(rate('hard', 20)).toBeLessThan(0.1);
    expect(rate('hard', 20)).toBeLessThan(rate('hard', 8));
    expect(rate('normal', 20)).toBeLessThan(0.15);
    expect(rate('easy', 20)).toBeGreaterThan(0.15);
  });

  it('still catch a firm shot hit straight at them, instead of always knocking it back out', () => {
    let caught = 0;
    for (const side of [0, 1] as Side[]) for (let i = 0; i < 20; i++) {
      const s = new MatchSim({ home, away, difficulty: 'normal', halfSeconds: 600, humanSide: 0, mode: 'match' });
      s.phase = 'play';
      const shooter = s.players.find((p) => p.side === side && !p.isKeeper)!;
      const keeper = s.players.find((p) => p.side !== side && p.isKeeper)!;
      const line = s.goalX(side), dir = side === 0 ? 1 : -1;
      for (const p of s.players) if (!p.isKeeper && p !== shooter) p.pos = { x: -line * 0.85, z: 6 };
      shooter.pos = { x: line - dir * 8, z: 0 };
      keeper.pos = { x: line - dir * 0.7, z: 0 };
      s.ball.pos = { ...shooter.pos };
      s.ball.owner = null;
      s.ball.vel = { x: dir * 8, z: 0 };
      s.ball.flightId++;
      s.ball.lastKick = s.ball.lastTouch = shooter;
      shooter.kickCooldown = 1;
      // Caught cleanly: in the keeper's hands without first bouncing back off them.
      let bounced = false;
      for (let k = 0; k < 120 && s.ball.owner !== keeper; k++) {
        s.step(1 / 60, IDLE_INPUT);
        if (!s.ball.owner && s.ball.vel.x * dir < 0) bounced = true;
      }
      if (s.ball.owner === keeper && !bounced) caught++;
    }
    expect(caught).toBeGreaterThan(25);
  });
});
