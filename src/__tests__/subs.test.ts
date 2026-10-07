import { describe, expect, it } from 'vitest';
import { IDLE_INPUT, MatchSim, TIRED_SLOWDOWN, freshMatchStats, type SimEvent } from '../game/sim';
import { extraSubs, makePlayer } from '../data/defaults';
import { applyCareerMatch, createCareer, whoPlayed } from '../game/career';
import { nextFixture } from '../game/league';
import type { MatchResult } from '../game/MatchScene';
import type { Team } from '../data/types';
import { seedRandom } from './setup';
import { cpuMatch, runUntil, team } from './helpers';

/** A team with two subs on the bench. */
function squad(id: string, name: string): Team {
  const t = team(id, name);
  t.players.push(makePlayer('DEF', 12, `${name} S1`, false), makePlayer('ATT', 14, `${name} S2`, false));
  return t;
}

/** You (home, with a bench) against the computer. */
function myMatch(halfSeconds = 30): MatchSim {
  return new MatchSim({ home: squad('h', 'Home'), away: team('a', 'Away'), difficulty: 'normal', halfSeconds, humanSide: 0 });
}

/** Step until a condition holds, keeping every event. */
function runCollect(sim: MatchSim, done: (s: MatchSim) => boolean, events: SimEvent[], maxSteps = 60 * 60 * 10): void {
  for (let n = 0; !done(sim) && n < maxSteps; n++) { sim.step(1 / 60, IDLE_INPUT); events.push(...sim.events); sim.events.length = 0; }
}

describe('substitutions: the bench', () => {
  it('puts everyone outside the starting five on the bench', () => {
    const sim = myMatch();
    expect(sim.bench[0].map((p) => p.name)).toEqual(['Home S1', 'Home S2']);
    expect(sim.canSub(0)).toBe(true);
  });

  it('gives a computer team with only five players two made-up subs, the same two every time', () => {
    const sim = myMatch();
    expect(sim.bench[1]).toHaveLength(2);
    const again = extraSubs(team('a', 'Away'));
    expect(again.map((p) => [p.id, p.name, p.number, p.skin])).toEqual(sim.bench[1].map((p) => [p.id, p.name, p.number, p.skin]));
    expect(new Set(sim.bench[1].map((p) => p.number))).toEqual(new Set([12, 13]));
    expect(sim.bench[1].every((p) => !sim.teams[1].players.some((q) => q.name === p.name))).toBe(true);
  });

  it('making up subs does not change the rest of the match', () => {
    const t = team('x', 'X');
    seedRandom(7);
    const before = Math.random();
    seedRandom(7);
    extraSubs(t);
    expect(Math.random()).toBe(before);
  });

  it('leaves your own five-player team with no bench and no subs', () => {
    const sim = new MatchSim({ home: team('h', 'Home'), away: team('a', 'Away'), difficulty: 'normal', halfSeconds: 30, humanSide: 0 });
    expect(sim.bench[0]).toEqual([]);
    expect(sim.canSub(0)).toBe(false);
  });

  it('has no subs in training, the tutorial or a shoot-out', () => {
    for (const mode of ['training', 'tutorial', 'shootout'] as const) {
      const sim = new MatchSim({ home: squad('h', 'Home'), away: team('a', 'Away'), difficulty: 'normal', halfSeconds: 30, humanSide: 0, mode });
      expect(sim.canSub(0)).toBe(false);
    }
  });
});

describe('substitutions: when they happen', () => {
  it('a sub picked while the ball is dead at kick-off comes on straight away in the same spot', () => {
    const sim = myMatch();
    const team0 = sim.teamOf(0);
    const i = team0.findIndex((p) => p.info.position === 'DEF');
    const spot = team0[i];
    const { role, slot } = spot;
    const pos = { ...spot.pos };
    const off = spot.info;
    const sub = sim.bench[0][0];
    sim.requestSubs(0, team0.map((p, j) => (j === i ? sub.id : p.id)));
    expect(spot.info).toBe(sub);
    expect(spot.id).toBe(sub.id);
    expect(spot.role).toBe(role);
    expect(spot.slot).toEqual(slot);
    expect(spot.pos).toEqual(pos);
    expect(sim.bench[0]).toContain(off);
    expect(sim.events.some((e) => e.type === 'sub' && e.player === sub && e.off === off)).toBe(true);
  });

  it('a sub picked in open play waits for the ball to go out, then runs on from the bench', () => {
    const sim = myMatch();
    runUntil(sim, (s) => s.phase === 'play');
    const team0 = sim.teamOf(0);
    const i = team0.findIndex((p) => p.info.position === 'ATT');
    const off = team0[i].info;
    const sub = sim.bench[0][1];
    sim.requestSubs(0, team0.map((p, j) => (j === i ? sub.id : p.id)));
    expect(team0[i].info).toBe(off);
    expect(sim.pendingSubs[0].get(i)).toBe(sub);
    const events: SimEvent[] = [];
    runCollect(sim, (s) => s.pendingSubs[0].size === 0, events);
    const when = events.findIndex((e) => e.type === 'sub' && e.side === 0);
    expect(when).toBeGreaterThanOrEqual(0);
    expect(['setpiece', 'kickoff']).toContain(sim.phase);
    expect(team0[i].info).toBe(sub);
    expect(sim.bench[0]).toContain(off);
    if (sim.phase === 'setpiece') {
      // They start by the bench, and the set piece waits for them.
      expect(team0[i].pos.z).toBeGreaterThan(sim.width / 2);
      expect(sim.setPiece!.wait).toBeGreaterThan(sim.setPiece!.timer + 1);
    }
  });

  it('a waiting sub can be called off by picking the player already there', () => {
    const sim = myMatch();
    runUntil(sim, (s) => s.phase === 'play');
    const team0 = sim.teamOf(0);
    sim.requestSubs(0, team0.map((p, j) => (j === 1 ? sim.bench[0][0].id : p.id)));
    expect(sim.pendingSubs[0].size).toBe(1);
    sim.requestSubs(0, team0.map((p) => p.id));
    expect(sim.pendingSubs[0].size).toBe(0);
  });

  it('ignores players who are not on the bench, and the same sub twice', () => {
    const sim = myMatch();
    runUntil(sim, (s) => s.phase === 'play');
    const team0 = sim.teamOf(0);
    const sub = sim.bench[0][0].id;
    sim.requestSubs(0, [sub, sub, 'nobody', team0[3].id, sim.teamOf(1)[0].id]);
    expect([...sim.pendingSubs[0].keys()]).toEqual([0]);
  });

  it('no sub comes on while a penalty is being taken', () => {
    const sim = myMatch();
    runUntil(sim, (s) => s.phase === 'play');
    const keeper = sim.teamOf(1).find((p) => p.isKeeper)!;
    sim.setPiece = { kind: 'penalty', side: 0, taker: sim.teamOf(0)[1], spot: { x: 0, z: 0 }, timer: 0, wait: 0, stand: { x: 0, z: 0 }, face: 0, placed: true, targets: new Map() };
    sim.phase = 'setpiece';
    expect(sim.ballDead()).toBe(false);
    void keeper;
  });

  it('a player who comes back on keeps what they did before going off', () => {
    const sim = myMatch();
    const team0 = sim.teamOf(0);
    const off = team0[1];
    const offId = off.id;
    off.match.goals = 2;
    const sub = sim.bench[0][0];
    sim.requestSubs(0, team0.map((p, j) => (j === 1 ? sub.id : p.id)));
    expect(sim.playerStats()[offId].goals).toBe(2);
    expect(team0[1].match.goals).toBe(0);
    sim.requestSubs(0, team0.map((p, j) => (j === 1 ? offId : p.id)));
    expect(team0[1].id).toBe(offId);
    expect(team0[1].match.goals).toBe(2);
  });
});

describe('substitutions: energy and the computer', () => {
  it('players tire as the match goes on, and tired legs are a little slower', () => {
    const sim = myMatch(40);
    runUntil(sim, (s) => s.phase === 'fulltime');
    const energy = sim.players.map((p) => p.energy);
    expect(Math.min(...energy)).toBeLessThan(0.75);
    expect(Math.max(...energy)).toBeLessThan(1);
    const p = sim.players[1];
    const fresh = { ...p, energy: 1 };
    expect(sim.pace(p) / sim.pace(fresh)).toBeCloseTo(1 - TIRED_SLOWDOWN * (1 - p.energy), 5);
  });

  it('the computer brings on fresh legs in the second half, at most two a half, the same way every time', () => {
    const play = () => {
      seedRandom(97); // a match where someone tires before a late stoppage
      const sim = cpuMatch({ halfSeconds: 90 });
      const events: SimEvent[] = [];
      runCollect(sim, (s) => s.phase === 'fulltime', events);
      return { sim, subs: events.filter((e) => e.type === 'sub').map((e) => `${e.side}:${e.off!.name}>${e.player!.name}`) };
    };
    const a = play(), b = play();
    expect(a.subs.length).toBeGreaterThan(0);
    expect(a.subs).toEqual(b.subs);
    for (const side of ['0:', '1:']) expect(a.subs.filter((s) => s.startsWith(side)).length).toBeLessThanOrEqual(2);
    // Everyone who played has stats, and the share of the match they were on adds up to five whole players a side.
    const share = a.sim.playedShare();
    const total = Object.values(share).reduce((n, x) => n + x, 0);
    expect(total).toBeGreaterThan(9.5);
    expect(total).toBeLessThan(10.5);
    for (const id of Object.keys(share)) expect(a.sim.playerStats()[id]).toBeDefined();
  });
});

describe('substitutions: career', () => {
  it('counts a sub who came on, with growth for the part of the match they played', () => {
    const { career: c, team: me } = createCareer(squad('me', 'Me'), 60);
    const [subPlayer, benchPlayer] = me.players.filter((p) => !p.starter);
    const starter = me.players.find((p) => p.starter && p.position === 'DEF')!;
    const f = nextFixture(c.league, me)!;
    const r: MatchResult = {
      mode: 'match', score: [1, 0], goals: [], home: me, away: f.youAreHome ? f.away : f.home, stats: { touches: [0, 0], distance: [0, 0] },
      players: Object.fromEntries(me.players.map((p) => [p.id, freshMatchStats()])),
      played: { ...Object.fromEntries(me.players.filter((p) => p.starter).map((p) => [p.id, 1])), [subPlayer.id]: 0.5 },
      shootout: null, trainingPoints: 0, twoPlayer: false,
    };
    expect(whoPlayed(me, r).map((x) => x.player.id)).toEqual([...me.players.filter((p) => p.starter), subPlayer].map((p) => p.id));
    applyCareerMatch(c, me, r, [0, 1, 2].map(() => ({ score: [1, 1], pens: null })));
    expect(c.seasonStats[subPlayer.id].played).toBe(1);
    expect(c.seasonStats[benchPlayer.id]).toBeUndefined();
    expect(subPlayer.xp!.speed).toBeCloseTo(starter.xp!.speed / 2, 5);
  });

  it('an older result without time on the pitch counts the starting five in full', () => {
    const me = squad('me', 'Me');
    const r = { home: me, played: undefined } as unknown as MatchResult;
    expect(whoPlayed(me, r).map((x) => x.share)).toEqual([1, 1, 1, 1, 1]);
  });
});
