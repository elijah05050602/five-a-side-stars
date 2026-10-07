import { describe, expect, it } from 'vitest';
import { IDLE_INPUT, MatchSim, type SimPlayer } from '../game/sim';
import type { Difficulty, Position } from '../data/types';
import { team } from './helpers';

const home = team('h', 'Home', 'U8');
const away = { ...home, id: 'a', name: 'Away', players: home.players.map((p) => ({ ...p, id: `${p.id}-a` })) };
const TRICK = { ...IDLE_INPUT, trick: true };

function sim(difficulty: Difficulty = 'normal', supers = true, assist = false): MatchSim {
  const s = new MatchSim({ home, away, difficulty, halfSeconds: 600, humanSide: 0, mode: 'match', supers, assist });
  s.phase = 'play';
  return s;
}

/** Your player in a position, on the ball `from` metres out from the goal you attack, everyone else out of the way. */
function onTheBall(s: MatchSim, position: Position, from: number, z = 1): SimPlayer {
  const p = s.players.find((q) => q.side === 0 && !q.isKeeper)!;
  p.info = { ...p.info, position };
  const line = s.goalX(0);
  for (const q of s.players) if (!q.isKeeper && q !== p) q.pos = { x: -line * 0.8, z: 6 };
  s.players.find((q) => q.side === 1 && q.isKeeper)!.pos = { x: line - 0.7, z: 0 };
  p.pos = { x: line - from, z };
  s.ball.pos = { ...p.pos };
  s.ball.owner = p;
  return p;
}

const run = (s: MatchSim, steps: number) => { for (let k = 0; k < steps && s.phase === 'play'; k++) s.step(1 / 60, IDLE_INPUT); };

/** Goals from n shots `from` metres out on Hard: a Rocket Shot, or a normal full-power shot. */
function scoring(rocket: boolean, from: number, n = 40): number {
  let goals = 0;
  for (let i = 0; i < n; i++) {
    const s = sim('hard');
    const p = onTheBall(s, 'ATT', from, ((i % 5) - 2) * 0.8);
    if (rocket) { s.superMeter[0] = 1; s.step(1 / 60, TRICK); } else s.shoot(p, null, 1);
    run(s, 200);
    if (s.score[0] > 0) goals++;
  }
  return goals / n;
}

describe('super skills', () => {
  it('stay off, and the meter stays empty, unless the match turns them on', () => {
    const s = sim('normal', false);
    onTheBall(s, 'ATT', 10);
    s.superMeter[0] = 1;
    s.step(1 / 60, TRICK);
    expect(s.superPending).toBeNull();
    const t = sim('normal', false);
    run(t, 600);
    expect(t.superMeter).toEqual([0, 0]);
  });

  it('fill the meter over time, and the trick button calls the super once it is full', () => {
    const s = sim();
    onTheBall(s, 'ATT', 14);
    s.step(1 / 60, TRICK);
    expect(s.superPending).toBeNull(); // not full yet: a normal trick
    s.superMeter[0] = 0.5;
    run(s, 60);
    expect(s.superMeter[0]).toBeGreaterThan(0.5);
    const t = sim();
    onTheBall(t, 'ATT', 14);
    t.superMeter[0] = 1;
    t.step(1 / 60, TRICK);
    expect(t.superPending?.kind).toBe('rocket');
    expect(t.events.some((e) => e.type === 'super' && e.superKind === 'rocket')).toBe(true);
    expect(t.superMeter[0]).toBe(0);
  });

  it('match the position: a striker shoots, a winger dashes, a midfielder passes, a defender bulldozes', () => {
    const kinds = (['ATT', 'WING', 'MID', 'DEF'] as Position[]).map((pos) => {
      const s = sim();
      onTheBall(s, pos, 14);
      s.step(1 / 60, IDLE_INPUT); // the player on the ball becomes yours
      return s.superFor(0)?.kind;
    });
    expect(kinds).toEqual(['rocket', 'turbo', 'magic', 'bulldozer']);
  });

  it('make a Rocket Shot score far more often than a normal shot, but not every time', () => {
    const rocket = scoring(true, 10), normal = scoring(false, 10);
    expect(rocket).toBeGreaterThan(normal + 0.2);
    expect(rocket).toBeLessThan(1);
  });

  it('let a Super Slide win the ball from a dribbler', () => {
    const s = sim();
    const them = s.players.find((q) => q.side === 1 && !q.isKeeper)!;
    const me = s.players.find((q) => q.side === 0 && !q.isKeeper)!;
    for (const q of s.players) if (!q.isKeeper && q !== me && q !== them) q.pos = { x: 0, z: 6 };
    them.pos = { x: 0, z: 0 };
    me.pos = { x: -4, z: 0 };
    s.ball.pos = { ...them.pos };
    s.ball.owner = them;
    s.controlledBy[0] = me;
    s.superMeter[0] = 1;
    s.step(1 / 60, TRICK);
    expect(s.superPending?.kind).toBe('slide');
    run(s, 90);
    expect(s.ball.owner?.side).toBe(0);
  });

  it('give the keeper Giant Gloves that save more shots', () => {
    const saved = (gloves: boolean) => {
      let goals = 0;
      for (let i = 0; i < 200; i++) {
        const s = sim('hard');
        const shooter = s.players.find((q) => q.side === 1 && !q.isKeeper)!;
        const keeper = s.players.find((q) => q.side === 0 && q.isKeeper)!;
        const line = s.goalX(1);
        for (const q of s.players) if (!q.isKeeper && q !== shooter) q.pos = { x: -line * 0.8, z: 6 };
        keeper.pos = { x: line + 0.7, z: 0 };
        shooter.pos = { x: line + 5 + (i % 3), z: ((i % 5) - 2) * 1.1 };
        s.ball.pos = { ...shooter.pos };
        s.ball.owner = shooter;
        if (gloves) { keeper.superKind = 'gloves'; keeper.superTime = 8; }
        s.shoot(shooter, null, 1.3);
        run(s, 150);
        if (s.score[1] > 0) goals++;
      }
      return goals;
    };
    expect(saved(true)).toBeLessThan(saved(false));
  });

  it('send a Magic Pass past defenders standing in its way', () => {
    const s = sim();
    const me = onTheBall(s, 'MID', 16, 0);
    const mate = s.players.find((q) => q.side === 0 && !q.isKeeper && q !== me)!;
    for (const q of s.players) if (q.side === 0 && !q.isKeeper && q !== me && q !== mate) q.pos = { x: me.pos.x - 6, z: 5 };
    mate.pos = { x: me.pos.x + 7, z: 0 };
    const blocker = s.players.find((q) => q.side === 1 && !q.isKeeper)!;
    blocker.pos = { x: me.pos.x + 3.5, z: 0 };
    s.superMeter[0] = 1;
    s.step(1 / 60, TRICK);
    expect(s.superPending?.kind).toBe('magic');
    let theirs = false;
    for (let k = 0; k < 120 && s.ball.owner?.side !== 0; k++) { s.step(1 / 60, IDLE_INPUT); if (s.ball.owner?.side === 1) theirs = true; }
    expect(theirs).toBe(false);
    expect(s.ball.owner?.side).toBe(0);
  });

  it('are never used by the computer on Starter, and are used on Hard', () => {
    const uses = (difficulty: Difficulty, assist: boolean) => {
      const s = new MatchSim({ home, away, difficulty, halfSeconds: 120, humanSide: 0, mode: 'match', supers: true, assist });
      let n = 0;
      for (let k = 0; k < 60 * 240 && s.phase !== 'fulltime'; k++) { s.step(1 / 60, IDLE_INPUT); n += s.events.filter((e) => e.type === 'super' && e.side === 1).length; s.events.length = 0; }
      return n;
    };
    expect(uses('easy', true)).toBe(0);
    expect(uses('hard', false)).toBeGreaterThan(0);
  });

  it('switch themselves off for the match, and let it carry on, if anything in them goes wrong', () => {
    const s = sim();
    onTheBall(s, 'ATT', 14);
    (s as unknown as { runSuper: () => void }).runSuper = () => { throw new Error('boom'); };
    s.superMeter[0] = 1;
    const warn = console.warn;
    console.warn = () => {};
    try {
      s.step(1 / 60, TRICK);
      expect(() => run(s, 120)).not.toThrow();
    } finally { console.warn = warn; }
    expect(s.supersOn).toBe(false);
    expect(s.superReady(0)).toBe(false);
    expect(s.clock).toBeGreaterThan(1);
  });
});
