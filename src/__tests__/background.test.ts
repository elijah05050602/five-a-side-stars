import { describe, expect, it } from 'vitest';
import { homeWon, inBackground, playOut, runBackground } from '../game/background';
import { applyLeagueResult, createLeague, nextFixture, roundJobs } from '../game/league';
import { applyResult, createTournament, cupAheadRequest } from '../game/tournament';
import type { MatchResult } from '../game/MatchScene';
import type { Team } from '../data/types';
import { team } from './helpers';

const finished = (home: Team, away: Team, score: [number, number], mode: MatchResult['mode'] = 'match'): MatchResult =>
  ({ mode, score, goals: [], home, away, stats: { touches: [0, 0], distance: [0, 0] }, players: {}, shootout: null, trainingPoints: 0, twoPlayer: false });

describe('matches played in the background', () => {
  it('lists the rest of the round, leaving out the player\'s own match', () => {
    const you = team('you', 'You FC', 'U7');
    const ls = createLeague(you, 60);
    const jobs = roundJobs(ls, you);
    expect(jobs.length).toBe(3);
    expect(jobs.filter((j) => j === null).length).toBe(1);
    expect(jobs.every((j) => !j || (j.home.id !== you.id && j.away.id !== you.id))).toBe(true);
  });

  it('fills the round with the results played in the background', () => {
    const you = team('you', 'You FC', 'U7');
    const ls = createLeague(you, 60);
    const nf = nextFixture(ls, you)!;
    const others = roundJobs(ls, you).map((j) => (j ? { score: [4, 2] as [number, number], pens: null } : null));
    applyLeagueResult(ls, you, finished(you, nf.youAreHome ? nf.away : nf.home, [1, 0]), others);
    const round = ls.rounds[0];
    expect(round.filter((f) => f.homeId !== you.id && f.awayId !== you.id).every((f) => f.score?.[0] === 4 && f.score?.[1] === 2)).toBe(true);
    expect(ls.round).toBe(1);
  });

  it('settles a drawn cup tie on penalties, and a level shoot-out goes to the home side', () => {
    const o = playOut({ home: team('h', 'Home', 'U8'), away: team('a', 'Away', 'U8'), difficulty: 'normal', halfSeconds: 20, pens: true });
    if (o.score[0] === o.score[1]) expect(o.pens).not.toBeNull();
    else expect(o.pens).toBeNull();
    expect(homeWon({ score: [1, 1], pens: [3, 3] })).toBe(true);
    expect(homeWon({ score: [1, 1], pens: [2, 4] })).toBe(false);
    expect(homeWon({ score: [0, 2], pens: null })).toBe(false);
  });

  it('plays the other semi and the final your opponent would reach, in case they knock you out', () => {
    const you = team('you', 'You FC', 'U8');
    const s = createTournament(you, 'normal', 20);
    const res = runBackground(cupAheadRequest(s)!);
    expect(res.kind).toBe('cup');
    if (res.kind !== 'cup') return;
    // Knocked out in the semi: the computer's ties come from the background results, not new ones.
    applyResult(s, finished(s.semis[0].home, s.semis[0].away, [0, 3]), res.ahead);
    expect(s.semis[1].score).toEqual(res.ahead.semi2.score);
    expect(s.final?.score).toEqual(res.ahead.finalIfOut.score);
    expect(s.stage).toBe('done');
  });

  it('runs on this thread where there are no workers', async () => {
    const you = team('you', 'You FC', 'U7');
    const ls = createLeague(you, 20);
    const res = await inBackground({ kind: 'round', jobs: roundJobs(ls, you) });
    expect(res.kind).toBe('round');
    if (res.kind === 'round') expect(res.outcomes.filter((o) => o !== null).length).toBe(2);
  });
});

describe('two-player cup', () => {
  it('Player 2 plays the final when their team wins the semi', () => {
    const p1 = team('p1', 'Player One FC', 'U8');
    const p2 = team('p2', 'Player Two FC', 'U8');
    const s = createTournament(p1, 'normal', 20, true, p2);
    expect(s.semis[0].away.id).toBe('p2');
    applyResult(s, finished(s.semis[0].home, s.semis[0].away, [0, 2]));
    expect(s.stage).toBe('final');
    expect(s.final?.home.id).toBe('p2');
    expect(s.final?.score).toBeNull();
  });
});
