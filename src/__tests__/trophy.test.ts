import { describe, expect, it } from 'vitest';
import { createLeague, nextFixture, type LeagueState } from '../game/league';
import { applyResult, createTournament } from '../game/tournament';
import { cupTrophy, finalTrophy, leagueTrophy, levelForTier, playoffTrophy, trophyLook } from '../game/trophy';
import { SHOWS } from '../game/ceremony';
import type { MatchResult } from '../game/MatchScene';
import type { Team } from '../data/types';
import { team } from './helpers';

const you = team('you', 'Your Team');

const result = (home: Team, away: Team, score: [number, number], mode: MatchResult['mode'] = 'match'): MatchResult =>
  ({ mode, score, goals: [], home, away, stats: { touches: [0, 0], distance: [0, 0] }, players: {}, shootout: null, trainingPoints: 0, twoPlayer: false });

/** Play every round but the last by hand: `you` win all your matches 1-0 (or lose them 0-1), everyone else draws. */
function toLastRound(s: LeagueState, youWin: boolean): void {
  while (s.round < s.rounds.length - 1) {
    for (const f of s.rounds[s.round]) {
      const yours = f.homeId === you.id ? 0 : f.awayId === you.id ? 1 : -1;
      f.score = yours < 0 ? [0, 0] : (yours === 0) === youWin ? [1, 0] : [0, 1];
    }
    s.round++;
  }
}

/** The player's last match of the season, won (or lost) 2-0, with the rest of the round already played. */
function lastMatch(s: LeagueState, win: boolean): { r: MatchResult; others: ({ score: [number, number]; pens: null } | null)[] } {
  const nf = nextFixture(s, you)!;
  const r = result(you, nf.youAreHome ? nf.away : nf.home, win ? [2, 0] : [0, 2]);
  const others = s.rounds[s.round].map((f) => (f === nf.fixture ? null : { score: [0, 0] as [number, number], pens: null }));
  return { r, others };
}

describe('which trophy, and how grand', () => {
  it('the Acorn League is level 1 and the Star Premier League level 5', () => {
    expect(levelForTier(5)).toBe(1);
    expect(levelForTier(3)).toBe(3);
    expect(levelForTier(1)).toBe(5);
    expect(trophyLook(1).kind).toBe('star');
    expect(trophyLook(2)).toEqual({ kind: 'shield', gold: false });
    expect(trophyLook(4)).toEqual({ kind: 'shield', gold: true });
    expect(trophyLook(5)).toEqual({ kind: 'cup', gold: true });
  });

  it('every level is grander than the one below', () => {
    for (let l = 2; l <= 5; l++) {
      const lo = SHOWS[(l - 1) as 1 | 2 | 3 | 4], hi = SHOWS[l as 2 | 3 | 4 | 5];
      expect(hi.volley).toBeGreaterThan(lo.volley);
      expect(hi.every).toBeLessThan(lo.every);
      expect(hi.sparks).toBeGreaterThan(lo.sparks);
      expect(hi.hold).toBeGreaterThanOrEqual(lo.hold);
    }
    expect(SHOWS[5].dusk && SHOWS[5].beams > 0).toBe(true);
    expect(SHOWS[1].dusk || SHOWS[1].beams > 0 || SHOWS[1].flashes > 0).toBe(false);
  });
});

describe('winning the league', () => {
  it('the last match of a season you finish top lifts the trophy, without changing the league', () => {
    const s = createLeague(you, 120);
    toLastRound(s, true);
    const { r, others } = lastMatch(s, true);
    const before = JSON.stringify(s);
    const win = leagueTrophy(s, you, r, others);
    expect(win).toMatchObject({ level: 1, kind: 'star', title: 'Acorn League champions', side: 0 });
    expect(JSON.stringify(s)).toBe(before);
  });

  it('the top tier gets the big gold cup, and the side is whichever one you played on', () => {
    const s = createLeague(you, 120, 1);
    toLastRound(s, true);
    const { r, others } = lastMatch(s, true);
    expect(leagueTrophy(s, you, { ...r, home: r.away, away: r.home, score: [0, 2] }, others)).toMatchObject({ level: 5, kind: 'cup', gold: true, side: 1, title: 'Star Premier League champions' });
  });

  it('no trophy before the last match, for finishing lower, or without the rest of the round', () => {
    const early = createLeague(you, 120);
    const first = lastMatch(early, true);
    expect(leagueTrophy(early, you, first.r, first.others)).toBeNull();

    const lost = createLeague(you, 120);
    toLastRound(lost, false);
    const l = lastMatch(lost, true);
    expect(leagueTrophy(lost, you, l.r, l.others)).toBeNull();

    const s = createLeague(you, 120);
    toLastRound(s, true);
    const { r } = lastMatch(s, true);
    expect(leagueTrophy(s, you, r, undefined)).toBeNull();
    expect(leagueTrophy(s, you, { ...r, mode: 'training' }, lastMatch(s, true).others)).toBeNull();
  });
});

describe('winning the cup', () => {
  /** A cup that has reached its final, with you in it. */
  function inFinal() {
    const s = createTournament(you, 'normal', 60);
    const f = s.semis[0];
    applyResult(s, result(f.home, f.away, [2, 0]));
    return s;
  }

  it('winning the final, in the match or the shoot-out, lifts the big cup', () => {
    const s = inFinal();
    const f = s.final!;
    expect(cupTrophy(s, result(f.home, f.away, [3, 1]))).toMatchObject({ level: 5, kind: 'cup', side: 0, title: 'Cup winners' });
    expect(cupTrophy(s, result(f.home, f.away, [5, 4], 'shootout'))).toMatchObject({ level: 5, side: 0 });
  });

  it('no cup for a semi-final, a drawn final (penalties next) or losing it', () => {
    const s = createTournament(you, 'normal', 60);
    expect(cupTrophy(s, result(s.semis[0].home, s.semis[0].away, [2, 0]))).toBeNull();
    const fin = inFinal();
    const f = fin.final!;
    expect(cupTrophy(fin, result(f.home, f.away, [1, 1]))).toBeNull();
    expect(cupTrophy(fin, result(f.home, f.away, [0, 1]))).toBeNull();
  });

  it('in a two-player cup, whichever player wins the final lifts it', () => {
    const p2 = team('p2', 'Player Two');
    const s = createTournament(you, 'normal', 60, true, p2);
    const f = s.semis[0];
    applyResult(s, result(f.home, f.away, [0, 1]));
    expect(s.final?.home.id).toBe('p2');
    const fin = s.final!;
    expect(cupTrophy(s, result(fin.home, fin.away, [2, 1]))).toMatchObject({ side: 0 });
  });
});

describe('winning a play-off', () => {
  const them = team('them', 'Them');

  it('winning the play-off that takes you up lifts the trophy, in the match or its shoot-out', () => {
    expect(playoffTrophy(3, true, null, you, result(you, them, [2, 1]))).toMatchObject({ level: 3, title: 'Play-off winners', side: 0 });
    expect(playoffTrophy(2, true, null, you, result(them, you, [0, 1]))).toMatchObject({ level: 4, side: 1 });
    expect(playoffTrophy(3, true, { won: null }, you, result(you, them, [5, 4], 'shootout'))).toMatchObject({ side: 0 });
  });

  it('no trophy for staying up, losing, a draw, or a play-off already settled', () => {
    expect(playoffTrophy(3, false, null, you, result(you, them, [2, 1]))).toBeNull();
    expect(playoffTrophy(3, true, null, you, result(you, them, [0, 1]))).toBeNull();
    expect(playoffTrophy(3, true, null, you, result(you, them, [1, 1]))).toBeNull();
    expect(playoffTrophy(3, true, { won: true }, you, result(you, them, [2, 1]))).toBeNull();
    expect(playoffTrophy(3, true, { won: true }, you, result(you, them, [5, 4], 'shootout'))).toBeNull();
  });
});

describe('winning a one-off final', () => {
  const them = team('them', 'Them');

  it('the winner of the match or its shoot-out lifts the big gold cup, on whichever side they played', () => {
    expect(finalTrophy(you, result(you, them, [2, 0]))).toMatchObject({ level: 5, kind: 'cup', title: 'Cup winners', side: 0 });
    expect(finalTrophy(you, result(them, you, [3, 4], 'shootout'))).toMatchObject({ side: 1 });
    expect(finalTrophy(you, result(you, them, [1, 1]))).toBeNull();
    expect(finalTrophy(you, result(them, you, [1, 0]))).toBeNull();
    expect(finalTrophy(you, { ...result(you, them, [2, 0]), mode: 'training' })).toBeNull();
  });
});
