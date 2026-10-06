import { describe, expect, it } from 'vitest';
import { IDLE_INPUT, MatchSim, type Side } from '../game/sim';
import type { Difficulty } from '../data/types';
import { team } from './helpers';

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
});
