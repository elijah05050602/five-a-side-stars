import { describe, expect, it } from 'vitest';
import { CAREER_YEARS, SEASONS_PER_YEAR, advanceCareer, applyCareerMatch, careerAge, careerSeasonOver, createCareer } from '../game/career';
import { nextFixture } from '../game/league';
import { STAR_CAP, skillKeys } from '../data/skills';
import { startingFive } from '../data/defaults';
import { freshMatchStats } from '../game/sim';
import type { MatchResult } from '../game/MatchScene';
import type { Team } from '../data/types';
import type { SimOutcome } from '../game/background';
import { team } from './helpers';

/** A finished match without playing it: the career team wins `gf`–`ga`, and every starter did a bit of everything. */
function result(you: Team, opponent: Team, gf: number, ga: number): MatchResult {
  const players = Object.fromEntries(startingFive(you).map((p) => [p.id, {
    ...freshMatchStats(), goals: p.position === 'ATT' ? 1 : 0, assists: 1, shots: 3, passes: 6, tackles: 2, saves: p.position === 'GK' ? 4 : 0,
  }]));
  return { mode: 'match', score: [gf, ga], goals: [], home: you, away: opponent, stats: { touches: [0, 0], distance: [0, 0] }, players, shootout: null, trainingPoints: 0, twoPlayer: false };
}

/** The rest of a round settled as draws, as if it had been played in the background. */
const draws = (): SimOutcome[] => [0, 1, 2].map(() => ({ score: [1, 1], pens: null }));

/** Play the career team's next match with the given score. */
function play(c: ReturnType<typeof createCareer>['career'], you: Team, gf: number, ga: number) {
  const f = nextFixture(c.league, you)!;
  return applyCareerMatch(c, you, result(you, f.youAreHome ? f.away : f.home, gf, ga), draws());
}

describe('career', () => {
  it('starts a copy of the team in the Under 5s with small stars, leaving the original alone', () => {
    const source = team('src', 'Source Stars', 'U9');
    const before = JSON.stringify(source);
    const { career, team: you } = createCareer(source, 60);
    expect(JSON.stringify(source)).toBe(before);
    expect(you.id).not.toBe(source.id);
    expect(you.ageGroup).toBe('U5');
    expect(you.career).toBe(true);
    expect(you.players.every((p) => skillKeys(p.position).every((k) => p.skills[k] <= STAR_CAP.U5))).toBe(true);
    expect(career.year).toBe(1);
    expect(career.league.tier).toBe(5);
  });

  it('grows players by playing, and never past the age group cap', () => {
    const { career: c, team: you } = createCareer(team('src', 'Growers', 'U8'), 60);
    // One mini season banks progress towards the next star in every rating a starter uses...
    for (let i = 0; i < 5; i++) play(c, you, 3, 0);
    expect(careerSeasonOver(c)).toBe(true);
    expect(Object.values(c.seasonStats).every((s) => s.played === 5)).toBe(true);
    for (const p of startingFive(you)) for (const k of skillKeys(p.position)) expect(p.xp![k]).toBeGreaterThan(0);
    // ...and a year of matches turns it into stars, held at the age group's cap.
    let grew = 0;
    for (let season = 1; season < 4; season++) {
      advanceCareer(c, you);
      while (!careerSeasonOver(c)) grew += play(c, you, 3, 0).growth.length;
      for (const p of you.players) for (const k of skillKeys(p.position)) expect(p.skills[k]).toBeLessThanOrEqual(STAR_CAP.U5);
    }
    expect(grew + c.pendingGrowth.length).toBeGreaterThan(0);
  });

  it('climbs a tier for every winning mini season and moves up an age group every four', () => {
    const { career: c, team: you } = createCareer(team('src', 'Climbers', 'U8'), 60);
    const tiers: number[] = [];
    for (let season = 0; season < SEASONS_PER_YEAR + 1; season++) {
      while (!careerSeasonOver(c)) play(c, you, 3, 0);
      advanceCareer(c, you);
      tiers.push(c.league.tier);
    }
    expect(tiers).toEqual([4, 3, 2, 1, 1]);
    expect(c.year).toBe(2);
    expect(you.ageGroup).toBe('U6');
    expect(careerAge(c)).toBe('U6');
  });

  it('a whole career from the Under 5s to the Under 10s keeps every rule', () => {
    const { career: c, team: you } = createCareer(team('src', 'Lifers', 'U8'), 60);
    let matches = 0, guard = 0;
    while (!c.done && guard++ < 100) {
      // Mixed results, so the team goes up and down the tiers.
      while (!careerSeasonOver(c)) { play(c, you, matches % 3, matches % 2); matches++; }
      const cap = STAR_CAP[careerAge(c)];
      for (const p of you.players) for (const k of skillKeys(p.position)) expect(p.skills[k]).toBeLessThanOrEqual(cap);
      advanceCareer(c, you);
      if (!c.done) expect(c.league.tier).toBeGreaterThanOrEqual(1);
      if (!c.done) expect(c.league.tier).toBeLessThanOrEqual(5);
    }
    expect(c.done).toBe(true);
    expect(c.history.length).toBe(CAREER_YEARS * SEASONS_PER_YEAR);
    expect(matches).toBe(CAREER_YEARS * SEASONS_PER_YEAR * 5);
    expect(you.ageGroup).toBe('U10');
  });
});
