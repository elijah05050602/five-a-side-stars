import { describe, expect, it } from 'vitest';
import { CAREER_YEARS, SEASONS_PER_YEAR, TRAINING_STEP, advanceCareer, applyCareerMatch, careerAge, careerSeasonOver, careerStar, chooseLeavers, createCareer, freshSeasonStats, pickStar, signTriallist, startTrialDay, trainStar } from '../game/career';
import { makePlayer } from '../data/defaults';
import { nextFixture } from '../game/league';
import { STAR_BUDGET, STAR_CAP, skillKeys } from '../data/skills';
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

describe('your Star', () => {
  it('suggests an attacker and waits for the player to pick', () => {
    const { career: c, team: you } = createCareer(team('src', 'Star Makers', 'U8'), 60);
    expect(c.starPicked).toBe(false);
    expect(careerStar(c, you)?.position).toBe('ATT');
    const keeper = you.players.find((p) => p.position === 'GK')!;
    expect(pickStar(c, you, 'nobody')).toBe(false);
    expect(pickStar(c, you, keeper.id)).toBe(true);
    expect(c.starId).toBe(keeper.id);
    expect(c.starPicked).toBe(true);
  });

  it('earns training points and milestones only for the Star', () => {
    const { career: c, team: you } = createCareer(team('src', 'Pointers', 'U8'), 60);
    const star = you.players.find((p) => p.position === 'ATT')!;
    pickStar(c, you, star.id);
    // A 3-0 win where the Star scores their first goal: played + win + the First Goal milestone (and maybe Player of the Match).
    const s = play(c, you, 3, 0);
    expect(s.milestones.map((m) => m.id)).toContain('first-goal');
    expect(s.points).toBeGreaterThanOrEqual(3);
    expect(c.trainingPoints).toBe(s.points);
    expect(c.milestones).toContain('first-goal');
    // Each milestone is only reached once.
    expect(play(c, you, 3, 0).milestones.map((m) => m.id)).not.toContain('first-goal');
    // A loss still earns the point for playing.
    const before = c.trainingPoints;
    const loss = play(c, you, 0, 2);
    expect(loss.points).toBeGreaterThanOrEqual(1);
    expect(c.trainingPoints).toBe(before + loss.points);
  });

  it('turns four training points into a star, never past the age cap', () => {
    const { career: c, team: you } = createCareer(team('src', 'Trainers', 'U8'), 60);
    const star = careerStar(c, you)!;
    pickStar(c, you, star.id);
    star.skills.shooting = 1;
    star.xp = { ...star.xp!, shooting: 0 };
    c.trainingPoints = 10;
    const steps = Math.round(1 / TRAINING_STEP);
    for (let i = 0; i < steps - 1; i++) expect(trainStar(c, you, 'shooting')).toEqual([]);
    const grew = trainStar(c, you, 'shooting')!;
    expect(grew).toHaveLength(1);
    expect(star.skills.shooting).toBe(2); // the U5 cap
    expect(c.trainingPoints).toBe(10 - steps);
    // At the cap the point is kept for later.
    expect(trainStar(c, you, 'shooting')).toBeNull();
    expect(c.trainingPoints).toBe(10 - steps);
    c.trainingPoints = 0;
    expect(trainStar(c, you, 'speed')).toBeNull();
  });
});

describe('Trial Day', () => {
  /** Play a whole first year (four mini seasons) and move up to the Under 6s. */
  function finishYear(c: ReturnType<typeof createCareer>['career'], you: Team) {
    for (let season = 0; season < SEASONS_PER_YEAR; season++) {
      while (!careerSeasonOver(c)) play(c, you, 2, 1);
      advanceCareer(c, you);
    }
  }

  it('nobody leaves a squad of five, and one triallist joins', () => {
    const { career: c, team: you } = createCareer(team('src', 'Fivers', 'U8'), 60);
    pickStar(c, you, you.players[3].id);
    finishYear(c, you);
    expect(careerAge(c)).toBe('U6');
    expect(c.trialDay).not.toBeNull();
    expect(c.trialDay!.left).toEqual([]);
    expect(c.trialDay!.players).toHaveLength(3);
    // Rated like a year in the Under 5s (plus one stand-out star at most), not a fresh Under 6s budget.
    for (const p of c.trialDay!.players) expect(skillKeys(p.position).reduce((n, k) => n + p.skills[k], 0)).toBeLessThanOrEqual(STAR_BUDGET.U5 + 1);
    expect(you.players).toHaveLength(5);
    const pick = c.trialDay!.players[1];
    expect(signTriallist(c, you, pick.id)).toBe(pick);
    expect(you.players).toHaveLength(6);
    expect(pick.starter).toBe(false);
    expect(c.trialDay).toBeNull();
    // Signing again does nothing.
    expect(signTriallist(c, you, pick.id)).toBeNull();
  });

  it('the least-used player moves on (never the Star or the only keeper), and a triallist takes their spot', () => {
    const src = team('src', 'Movers', 'U8');
    src.players.push(makePlayer('ATT', 11, 'Benchy', false, 'U8'), makePlayer('DEF', 12, 'Spare', false, 'U8'));
    const { career: c, team: you } = createCareer(src, 60);
    const star = you.players.find((p) => p.name === 'Benchy')!;
    pickStar(c, you, star.id);
    finishYear(c, you);
    // The two subs never played; the Star is one of them, so the other one leaves.
    expect(c.trialDay!.left.map((l) => l.name)).toEqual(['Spare']);
    expect(you.players.some((p) => p.id === star.id)).toBe(true);
    expect(you.players).toHaveLength(6);
    signTriallist(c, you, c.trialDay!.players[0].id);
    expect(you.players).toHaveLength(7);
  });

  it('a starter who moves on leaves their spot open for the new signing', () => {
    const src = team('src', 'Openers', 'U8');
    src.players.push(makePlayer('ATT', 11, 'Sub', false, 'U8'));
    const { career: c, team: you } = createCareer(src, 60);
    pickStar(c, you, you.players[3].id);
    // The sub has played more than the defender who starts.
    const def = you.players.find((p) => p.position === 'DEF')!;
    for (const p of you.players) c.careerStats[p.id] = { ...freshSeasonStats(), played: p === def ? 1 : 10 };
    expect(chooseLeavers(c, you)).toEqual([def]);
    c.year = 2;
    const t = startTrialDay(c, you);
    c.trialDay = t;
    expect(t.openSpots).toEqual(['DEF']);
    const signing = t.players.find((p) => p.position !== 'GK')!;
    signTriallist(c, you, signing.id);
    expect(signing.starter).toBe(true);
    expect(signing.position).toBe('DEF');
    expect(startingFive(you)).toContain(signing);
  });

  it('a full squad of eight loses two and signs one', () => {
    const src = team('src', 'Eights', 'U8');
    src.players.push(makePlayer('ATT', 11, 'Sub One', false, 'U8'), makePlayer('DEF', 12, 'Sub Two', false, 'U8'), makePlayer('MID', 14, 'Sub Three', false, 'U8'));
    const { career: c, team: you } = createCareer(src, 60);
    pickStar(c, you, you.players[3].id);
    finishYear(c, you);
    expect(c.trialDay!.left).toHaveLength(2);
    expect(you.players).toHaveLength(6);
    const names = new Set(you.players.map((p) => p.name));
    expect(c.trialDay!.players.every((p) => !names.has(p.name))).toBe(true);
  });
});

