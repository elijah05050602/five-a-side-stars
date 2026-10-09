import { describe, expect, it } from 'vitest';
import { GOAL_DEFS, goalText, pickGoals, updateGoals, type GoalContext } from '../game/seasonGoals';
import { TRAINING, advanceCareer, applyCareerMatch, careerStar, createCareer, pickStar } from '../game/career';
import { startingFive } from '../data/defaults';
import { nextFixture } from '../game/league';
import { freshMatchStats } from '../game/sim';
import type { MatchResult } from '../game/MatchScene';
import type { SimOutcome } from '../game/background';
import type { Team } from '../data/types';
import { team } from './helpers';
import { seedRandom } from './setup';

const ctx = (over: Partial<GoalContext> = {}): GoalContext => ({
  team: { won: 0, gf: 0, cleanSheets: 0, scoredIn: 0, played: 0, lost: 0, position: 4, over: false },
  rivalHere: false,
  ...over,
});

function result(you: Team, opponent: Team, gf: number, ga: number, starGoals = 0, starId = ''): MatchResult {
  const players = Object.fromEntries(startingFive(you).map((p) => [p.id, { ...freshMatchStats(), goals: p.id === starId ? starGoals : 0, passes: 3, saves: p.position === 'GK' ? 2 : 0 }]));
  return { mode: 'match', score: [gf, ga], goals: [], home: you, away: opponent, stats: { touches: [0, 0], distance: [0, 0] }, players, shootout: null, trainingPoints: 0, twoPlayer: false };
}
const draws = (): SimOutcome[] => [0, 1, 2].map(() => ({ score: [1, 1], pens: null }));

describe('season goals', () => {
  it('picks one easy, one medium and one hard goal that suit the Star', () => {
    for (let i = 0; i < 30; i++) {
      seedRandom(i);
      const keeper = pickGoals('GK', false);
      expect(keeper.map((g) => g.level)).toEqual([0, 1, 2]);
      expect(keeper.some((g) => ['star-goal-1', 'star-goals-3', 'star-goals-5', 'star-trick-1', 'super-1'].includes(g.id))).toBe(false);
      expect(pickGoals('ATT', false).some((g) => g.id === 'beat-rival')).toBe(false);
      expect(pickGoals('ATT', false).some((g) => g.id.startsWith('star-saves'))).toBe(false);
    }
    // The pool is big enough to keep seasons different.
    expect(GOAL_DEFS.length).toBeGreaterThanOrEqual(30);
    expect(goalText({ id: 'star-goals-3', level: 1, target: 3, progress: 0, done: false }, 'Mia').text).toBe('Mia scores 3 goals');
  });

  it('counts up through the season, and match goals are done in one match', () => {
    const goals = [
      { id: 'goals-4', level: 0 as const, target: 4, progress: 0, done: false },
      { id: 'win-by-3', level: 2 as const, target: 1, progress: 0, done: false },
      { id: 'top-three', level: 1 as const, target: 1, progress: 0, done: false },
    ];
    expect(updateGoals(goals, ctx({ team: { ...ctx().team, gf: 2 }, match: { gf: 2, ga: 1, passes: 4, cameBack: false, rivalBeaten: false } }))).toEqual([]);
    expect(goals[0].progress).toBe(2);
    const done = updateGoals(goals, ctx({ team: { ...ctx().team, gf: 6, position: 2 }, match: { gf: 4, ga: 0, passes: 4, cameBack: false, rivalBeaten: false } }));
    expect(done.map((g) => g.id)).toEqual(['goals-4', 'win-by-3']);
    expect(goals[0].progress).toBe(4);
    // A finishing place only counts once the season is over.
    expect(goals[2].done).toBe(false);
    updateGoals(goals, ctx({ team: { ...ctx().team, position: 2, over: true } }));
    expect(goals[2].done).toBe(true);
  });

  it('gives a training point for each goal done in a career, and new goals each mini season', () => {
    seedRandom(5);
    const { career: c, team: you } = createCareer(team('src', 'Goal Getters', 'U8'), 60);
    pickStar(c, you, you.players.find((p) => p.position === 'ATT')!.id);
    c.goals = [
      { id: 'win-1', level: 0, target: 1, progress: 0, done: false },
      { id: 'star-goals-3', level: 1, target: 3, progress: 0, done: false },
      { id: 'clean-sheets-2', level: 1, target: 2, progress: 0, done: false },
    ];
    const star = careerStar(c, you)!;
    const before = c.trainingPoints;
    const f = nextFixture(c.league, you)!;
    const s = applyCareerMatch(c, you, result(you, f.youAreHome ? f.away : f.home, 3, 0, 3, star.id), draws());
    expect(s.goalsDone!.map((g) => g.id)).toEqual(['win-1', 'star-goals-3']);
    expect(s.sweep).toBe(false);
    expect(c.trainingPoints - before).toBe(s.points);
    expect(s.points).toBe(TRAINING.played + TRAINING.win + 2 * TRAINING.goal + s.milestones.length + (s.motm?.id === star.id ? TRAINING.motm : 0));
    const f2 = nextFixture(c.league, you)!;
    const s2 = applyCareerMatch(c, you, result(you, f2.youAreHome ? f2.away : f2.home, 1, 0), draws());
    expect(s2.sweep).toBe(true);
    expect(c.sweeps).toBe(1);
    while (nextFixture(c.league, you)) {
      const n = nextFixture(c.league, you)!;
      applyCareerMatch(c, you, result(you, n.youAreHome ? n.away : n.home, 0, 0), draws());
    }
    const adv = advanceCareer(c, you);
    expect(adv.record.goals).toBe(3);
    expect(c.goals).toHaveLength(3);
    expect(c.goals.every((g) => !g.done && g.progress === 0)).toBe(true);
  });

  it('adds about 15% (well under a fifth) to the training points of an ordinary season', () => {
    let goalPoints = 0, other = 0;
    for (let run = 0; run < 12; run++) {
      seedRandom(40 + run);
      const { career: c, team: you } = createCareer(team('src', `Balance ${run}`, 'U8'), 60);
      const star = you.players.find((p) => p.position === 'ATT')!;
      pickStar(c, you, star.id);
      for (let season = 0; season < 4; season++) {
        while (nextFixture(c.league, you)) {
          const n = nextFixture(c.league, you)!;
          // An ordinary spread of results: about four goals a match between the sides, the Star scoring now and then.
          const gf = Math.floor(Math.random() * 4), ga = Math.floor(Math.random() * 3);
          const r = result(you, n.youAreHome ? n.away : n.home, gf, ga, Math.min(gf, Math.random() < 0.4 ? 1 : 0), star.id);
          const s = applyCareerMatch(c, you, r, draws());
          const g = (s.goalsDone?.length ?? 0) * TRAINING.goal;
          goalPoints += g;
          other += s.points - g;
        }
        advanceCareer(c, you);
      }
    }
    expect(goalPoints / other).toBeLessThan(0.2);
  });
});
