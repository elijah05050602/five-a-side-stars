import { describe, expect, it } from 'vitest';
import { MatchSim, type Side } from '../game/sim';
import { team } from './helpers';

const home = team('h', 'Home Stars', 'U8');
const away = team('a', 'Away Rovers', 'U8');
const match = (assist: boolean) => new MatchSim({ home, away, difficulty: 'easy', halfSeconds: 60, humanSide: 0, mode: 'match', assist });

/** The share of shots from out wide, with the stick pushed away from goal, that would cross the line between the posts. */
function onTarget(assist: boolean): number {
  const s = match(assist);
  const p = s.players.find((x) => x.side === 0 && !x.isKeeper)!;
  const line = s.length / 2;
  let hits = 0;
  for (let i = 0; i < 300; i++) {
    p.pos = { x: line - 6, z: 3 };
    s.ball.pos = { x: p.pos.x, z: p.pos.z };
    s.ball.owner = p;
    s.shoot(p, { x: 0.3, z: 1 }, 1);
    const { pos, vel } = s.ball;
    if (Math.abs(pos.z + vel.z * ((line - pos.x) / vel.x)) < s.goalWidth / 2) hits++;
  }
  return hits / 300;
}

describe('beginner help', () => {
  it('steers your shots towards the goal', () => {
    const off = onTarget(false);
    const on = onTarget(true);
    expect(on).toBe(1);
    expect(off).toBeLessThan(0.6);
  });

  it('slows the computer team and leaves yours alone', () => {
    const speeds = (s: MatchSim, side: Side) => s.players.filter((p) => p.side === side).map((p) => p.speedMul);
    const off = match(false);
    const on = match(true);
    speeds(on, 1).forEach((m, i) => expect(m).toBeLessThan(speeds(off, 1)[i]));
    expect(speeds(on, 0)).toEqual(speeds(off, 0));
  });
});
