import { describe, expect, it } from 'vitest';
import { CUP_SEASON, advanceCareer, applyCareerMatch, applyCupMatch, createCareer, cupResultNote, cupWaiting, pickStar, type CareerState } from '../game/career';
import { CUP_SIZE, cupOver, cupWinner, yourTie } from '../game/careerCup';
import { clubById, tierOf } from '../game/careerWorld';
import { getCareer, reloadSave, resetAll, saveTeam, setCareer } from '../data/storage';
import { getProgress, recordCareer } from '../data/progress';
import { startingFive } from '../data/defaults';
import { nextFixture } from '../game/league';
import { freshMatchStats } from '../game/sim';
import type { MatchResult } from '../game/MatchScene';
import type { SimOutcome } from '../game/background';
import type { Team } from '../data/types';
import { team } from './helpers';
import { seedRandom } from './setup';

const KEY = 'five-a-side-stars:v1';

function result(home: Team, away: Team, score: [number, number], mode: MatchResult['mode'] = 'match'): MatchResult {
  const players = Object.fromEntries([...startingFive(home), ...startingFive(away)].map((p) => [p.id, { ...freshMatchStats() }]));
  return { mode, score, goals: [], home, away, stats: { touches: [0, 0], distance: [0, 0] }, players, shootout: null, trainingPoints: 0, twoPlayer: false };
}
const draws = (): SimOutcome[] => [0, 1, 2].map(() => ({ score: [1, 1], pens: null }));

/** A career at cup time: two mini seasons played, the cup drawn. */
function atTheCup(): { c: CareerState; you: Team } {
  const { career: c, team: you } = createCareer(team('src', 'Cup Runners', 'U8'), 60);
  pickStar(c, you, you.players.find((p) => p.position === 'ATT')!.id);
  for (let s = 1; s < CUP_SEASON; s++) {
    while (nextFixture(c.league, you)) {
      const f = nextFixture(c.league, you)!;
      applyCareerMatch(c, you, result(f.home, f.away, [1, 1]), draws());
    }
    advanceCareer(c, you);
  }
  return { c, you };
}

/** Play your current cup tie with your score first. */
function playTie(c: CareerState, you: Team, gf: number, ga: number, mode: MatchResult['mode'] = 'match') {
  const tie = yourTie(c.cup!, you.id)!;
  const opp = clubById(c.world, tie.homeId === you.id ? tie.awayId : tie.homeId)!.team;
  const home = tie.homeId === you.id;
  return applyCupMatch(c, you, result(home ? you : opp, home ? opp : you, home ? [gf, ga] : [ga, gf], mode));
}

describe('the career cup', () => {
  it('is drawn before the 3rd mini season: you and seven clubs from your tier and the tiers around it', () => {
    seedRandom(1);
    const { c, you } = atTheCup();
    expect(c.season).toBe(CUP_SEASON);
    const ties = c.cup!.rounds[0];
    const ids = ties.flatMap((t) => [t.homeId, t.awayId]);
    expect(ties).toHaveLength(CUP_SIZE / 2);
    expect(new Set(ids).size).toBe(CUP_SIZE);
    expect(ids).toContain(you.id);
    const mine = tierOf(c.world, you.id);
    for (const id of ids) expect(Math.abs(tierOf(c.world, id) - mine)).toBeLessThanOrEqual(1);
    expect(cupWaiting(c, you)).toBe(true);
    expect(c.world.news.some((n) => n.text.includes('Under 5s Cup'))).toBe(true);
  });

  it('three wins lift the cup, and the matches count for stats and growth', () => {
    seedRandom(2);
    const { c, you } = atTheCup();
    const star = c.starId;
    const played = c.careerStats[star].played;
    expect(playTie(c, you, 2, 0)!.cupDone).toBe(false);
    expect(cupResultNote(c, you, false).text).toContain('semi-final');
    expect(c.cup!.rounds[1].every((t) => !t.winnerId)).toBe(true);
    expect(c.cup!.rounds[0].every((t) => t.winnerId)).toBe(true);
    playTie(c, you, 1, 0);
    const last = playTie(c, you, 3, 1)!;
    expect(last.cupDone).toBe(true);
    expect(cupOver(c.cup!)).toBe(true);
    expect(cupWinner(c.cup!)).toBe(you.id);
    expect(cupResultNote(c, you, true)).toMatchObject({ won: true, pens: false });
    expect(c.cupRuns).toEqual([{ age: 'U5', reached: 3 }]);
    expect(c.careerStats[star].played).toBe(played + 3);
    expect(c.scrapbook.some((l) => l.text === 'Won the Under 5s Cup!')).toBe(true);
    expect(cupWaiting(c, you)).toBe(false);
    // Nothing more to record once it is over.
    expect(applyCupMatch(c, you, result(you, you, [1, 0]))).toBeNull();
  });

  it('a draw goes to a shoot-out, which settles the tie', () => {
    seedRandom(3);
    const { c, you } = atTheCup();
    playTie(c, you, 1, 1);
    expect(cupResultNote(c, you, false)).toMatchObject({ pens: true });
    expect(cupWaiting(c, you)).toBe(true);
    // A second match for the same tie is not recorded.
    expect(playTie(c, you, 4, 0)).toBeNull();
    playTie(c, you, 4, 3, 'shootout');
    const first = c.cup!.rounds[0].find((t) => t.homeId === you.id || t.awayId === you.id)!;
    expect(first.winnerId).toBe(you.id);
    expect(first.pens).not.toBeNull();
    expect(c.cup!.round).toBe(1);
  });

  it('going out plays the rest of the cup at once, and the league carries on', () => {
    seedRandom(4);
    const { c, you } = atTheCup();
    const s = playTie(c, you, 0, 2)!;
    expect(s.cupDone).toBe(true);
    expect(c.cup!.out).toBe(true);
    expect(cupOver(c.cup!)).toBe(true);
    expect(cupWinner(c.cup!)).not.toBe(you.id);
    expect(cupWinner(c.cup!)).toBeTruthy();
    expect(c.cupRuns).toEqual([{ age: 'U5', reached: 0 }]);
    expect(cupResultNote(c, you, true).text).toContain('quarter-final');
    expect(cupWaiting(c, you)).toBe(false);
    // The cup stays on the screen until the mini season ends.
    while (nextFixture(c.league, you)) {
      const f = nextFixture(c.league, you)!;
      applyCareerMatch(c, you, result(f.home, f.away, [1, 1]), draws());
    }
    advanceCareer(c, you);
    expect(c.cup).toBeNull();
  });

  it('keeps a cup in progress in the save, and drops one that does not add up', () => {
    resetAll();
    seedRandom(5);
    const { c, you } = atTheCup();
    playTie(c, you, 2, 1);
    saveTeam(you);
    setCareer(c);
    reloadSave();
    expect(getCareer()!.cup).toEqual(c.cup);
    const save = JSON.parse(localStorage.getItem(KEY)!);
    save.career.cup.rounds[0][1].homeId = 'a club that is gone';
    save.career.cupRuns = [{ age: 'U5', reached: 9 }, { age: 'U99', reached: 1 }];
    localStorage.setItem(KEY, JSON.stringify(save));
    reloadSave();
    expect(getCareer()!.cup).toBeNull();
    expect(getCareer()!.cupRuns).toEqual([{ age: 'U5', reached: 3 }]);
    const old = JSON.parse(localStorage.getItem(KEY)!);
    delete old.career.cup;
    delete old.career.cupRuns;
    localStorage.setItem(KEY, JSON.stringify(old));
    reloadSave();
    expect(getCareer()!.cup).toBeNull();
    expect(getCareer()!.cupRuns).toEqual([]);
  });

  it('gives Cup Winners every time (with a count), and Cup Kings for the third', () => {
    resetAll();
    expect(recordCareer({ cupWon: true }).map((s) => s.id)).toEqual(['cup-winners']);
    expect(recordCareer({ cupWon: true })).toEqual([]);
    expect(recordCareer({ cupWon: true }).map((s) => s.id)).toEqual(['cup-kings']);
    expect(getProgress().counts['cup-winners']).toBe(3);
  });
});
