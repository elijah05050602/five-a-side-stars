import { describe, expect, it } from 'vitest';
import { awardsNight } from '../game/awards';
import { SEASONS_PER_YEAR, advanceCareer, applyCareerMatch, createCareer, freshSeasonStats, pickStar, signTriallist, type CareerState, type PlayerSeasonStats } from '../game/career';
import { getCareer, reloadSave, resetAll, saveTeam, setCareer } from '../data/storage';
import { recordCareer } from '../data/progress';
import { startingFive } from '../data/defaults';
import { nextFixture } from '../game/league';
import { freshMatchStats } from '../game/sim';
import type { MatchResult } from '../game/MatchScene';
import type { SimOutcome } from '../game/background';
import type { Team } from '../data/types';
import { team } from './helpers';
import { seedRandom } from './setup';

const KEY = 'five-a-side-stars:v1';
const line = (over: Partial<PlayerSeasonStats>): PlayerSeasonStats => ({ ...freshSeasonStats(), played: 10, ...over });
const draws = (): SimOutcome[] => [0, 1, 2].map(() => ({ score: [1, 1], pens: null }));

/** A match where the Star scores and is Player of the Match by a mile. */
function starMatch(you: Team, opponent: Team, starId: string): MatchResult {
  const players = Object.fromEntries(startingFive(you).map((p) => [p.id, { ...freshMatchStats(), goals: p.id === starId ? 3 : 0, passes: 5, shots: p.id === starId ? 5 : 0 }]));
  return { mode: 'match', score: [3, 0], goals: [], home: you, away: opponent, stats: { touches: [0, 0], distance: [0, 0] }, players, shootout: null, trainingPoints: 0, twoPlayer: false };
}

function playYear(c: CareerState, you: Team): ReturnType<typeof advanceCareer> {
  let adv!: ReturnType<typeof advanceCareer>;
  for (let s = 0; s < SEASONS_PER_YEAR; s++) {
    while (nextFixture(c.league, you)) {
      const f = nextFixture(c.league, you)!;
      applyCareerMatch(c, you, starMatch(you, f.youAreHome ? f.away : f.home, c.starId), draws());
    }
    adv = advanceCareer(c, you);
  }
  return adv;
}

describe('awards night', () => {
  it('picks the year\'s best: Player of the Year, Golden Boot, Best Keeper, Goal of the Year and the newcomer', () => {
    const t = team('t', 'Award Winners');
    const [gk, a, b, c] = [t.players.find((p) => p.position === 'GK')!, ...t.players.filter((p) => p.position !== 'GK')];
    const year = {
      [gk.id]: line({ saves: 30, cleanSheets: 4 }),
      [a.id]: line({ goals: 12, motm: 1 }),
      [b.id]: line({ goals: 3, motm: 4, superGoals: 1 }),
      [c.id]: line({ played: 2, assists: 1 }),
    };
    const got = awardsNight(t, year, c.id);
    expect(got.map((x) => [x.id, x.name])).toEqual([
      ['player-of-year', b.name], ['golden-boot', a.name], ['best-keeper', gk.name], ['goal-of-year', b.name], ['young-player', c.name],
    ]);
    expect(got.find((x) => x.id === 'golden-boot')!.line).toBe('12 goals');
    expect(got.find((x) => x.id === 'best-keeper')!.line).toBe('30 saves, 4 clean sheets');
    // Nobody scored a super goal, and there was no signing: those awards are left out.
    expect(awardsNight(t, { [a.id]: line({ goals: 2 }) }, null).map((x) => x.id)).toEqual(['player-of-year', 'golden-boot']);
    expect(awardsNight(t, {}, null)).toEqual([]);
  });

  it('is held at the end of every career year, and Player of the Year for the Star is a milestone', () => {
    seedRandom(9);
    const { career: c, team: you } = createCareer(team('src', 'Night Owls', 'U8'), 60);
    pickStar(c, you, you.players.find((p) => p.position === 'ATT')!.id);
    const adv = playYear(c, you);
    expect(adv.awards!.map((a) => a.id)).toContain('golden-boot');
    expect(adv.awards!.find((a) => a.id === 'player-of-year')!.playerId).toBe(c.starId);
    expect(adv.milestones.map((m) => m.id)).toContain('player-of-year');
    expect(c.milestones).toContain('player-of-year');
    expect(c.awards).toHaveLength(1);
    expect(c.awards[0].age).toBe('U5');
    expect(c.yearStats).toEqual({});
    expect(c.scrapbook.some((l) => l.text.includes('won Player of the Year'))).toBe(true);
    // The Trial Day signing can be Best Young Player next year.
    const signed = signTriallist(c, you, c.trialDay!.players[0].id)!;
    c.offers = null;
    expect(c.newcomer).toBe(signed.id);
    // Put them in the team in place of an outfield player who is not the Star.
    const out = you.players.find((p) => p.starter && p.position !== 'GK' && p.id !== c.starId && p.id !== signed.id)!;
    out.starter = false;
    signed.starter = true;
    if (signed.position === 'GK') { signed.positions = ['GK']; signed.position = out.position; }
    const next = playYear(c, you);
    expect(next.awards!.some((a) => a.id === 'young-player' && a.playerId === signed.id)).toBe(true);
    expect(c.newcomer).toBeNull();
  });

  it('gives the Award Night sticker when the Star wins one', () => {
    resetAll();
    expect(recordCareer({ starAward: false })).toEqual([]);
    expect(recordCareer({ starAward: true }).map((s) => s.id)).toEqual(['award-night']);
  });

  it('loads a save from before awards night, and leaves out an award it cannot read', () => {
    resetAll();
    const { career: c, team: you } = createCareer(team('src', 'Old Awards', 'U8'), 60);
    saveTeam(you);
    setCareer(c);
    const save = JSON.parse(localStorage.getItem(KEY)!);
    delete save.career.yearStats;
    delete save.career.newcomer;
    delete save.career.awards;
    localStorage.setItem(KEY, JSON.stringify(save));
    reloadSave();
    expect(getCareer()).toMatchObject({ yearStats: {}, newcomer: null, awards: [] });
    const again = JSON.parse(localStorage.getItem(KEY)!);
    again.career.awards = [{ age: 'U5', awards: [{ id: 'golden-boot', emoji: '👟', title: 'Golden Boot', playerId: 'p', name: 'Mia', line: '9 goals' }, { id: 'best-dancer', playerId: 'p', name: 'Mia' }] }, { age: 'U42', awards: [] }];
    localStorage.setItem(KEY, JSON.stringify(again));
    reloadSave();
    expect(getCareer()!.awards).toEqual([{ age: 'U5', awards: [{ id: 'golden-boot', emoji: '👟', title: 'Golden Boot', playerId: 'p', name: 'Mia', line: '9 goals' }] }]);
  });
});
