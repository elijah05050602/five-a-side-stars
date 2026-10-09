import { describe, expect, it } from 'vitest';
import { advanceCareer, applyCareerMatch, careerStar, createCareer } from '../game/career';
import { tierOf } from '../game/careerWorld';
import { skillKeys } from '../data/skills';
import { getCareer, reloadSave, resetAll, saveTeam, setCareer } from '../data/storage';
import { recordCareer } from '../data/progress';
import { nextFixture } from '../game/league';
import type { MatchResult } from '../game/MatchScene';
import type { Team } from '../data/types';
import { team } from './helpers';
import { seedRandom } from './setup';

const KEY = 'five-a-side-stars:v1';
const stars = (t: Team, skip: string) => t.players.filter((p) => p.id !== skip).reduce((n, p) => n + skillKeys(p.position).reduce((m, k) => m + p.skills[k], 0), 0);
const draw = (home: Team, away: Team): MatchResult => ({ mode: 'match', score: [1, 1], goals: [], home, away, stats: { touches: [0, 0], distance: [0, 0] }, players: {}, shootout: null, trainingPoints: 0, twoPlayer: false });

describe('career starts with a twist', () => {
  it('Start Late begins in the Under 7s and lasts four years', () => {
    const src = team('src', 'Late Comers', 'U8');
    const { career: c, team: you } = createCareer(src, 60, src.players[3], 'late');
    expect(c).toMatchObject({ year: 3, season: 1, twist: 'late' });
    expect(you.ageGroup).toBe('U7');
    expect(c.world.clubs.every((x) => x.team.ageGroup === 'U7')).toBe(true);
    expect(c.scrapbook[0]).toMatchObject({ at: 9, emoji: '⏰' });
    let seasons = 0;
    while (!c.done && seasons < 30) {
      while (nextFixture(c.league, you)) { const f = nextFixture(c.league, you)!; applyCareerMatch(c, you, draw(f.home, f.away), [0, 1, 2].map(() => ({ score: [1, 1], pens: null }))); }
      advanceCareer(c, you);
      c.offers = null;
      c.trialDay = null;
      seasons++;
    }
    expect(seasons).toBe(16);
  });

  it('Big Club starts in the Thunder League', () => {
    const src = team('src', 'Big Spenders', 'U8');
    const { career: c, team: you } = createCareer(src, 60, src.players[3], 'big');
    expect(c.league.tier).toBe(3);
    expect(tierOf(c.world, you.id)).toBe(3);
    expect(c.world.tiers.reduce((n, t) => n + t.members.length, 0)).toBe(31);
  });

  it("Keeper's Journey puts the Star in goal, and the keeper swaps out onto the pitch", () => {
    const src = team('src', 'Glove Story', 'U8');
    const striker = src.players.find((p) => p.position === 'ATT' && p.starter)!;
    const { career: c, team: you } = createCareer(src, 60, striker, 'keeper');
    const star = careerStar(c, you)!;
    expect(star.position).toBe('GK');
    expect(star.starter).toBe(true);
    expect(star.positions).toEqual(['ATT']);
    const starters = you.players.filter((p) => p.starter);
    expect(starters).toHaveLength(5);
    expect(starters.filter((p) => p.position === 'GK')).toHaveLength(1);
    expect(you.players.some((p) => p.positions?.includes('GK') && p.position === 'ATT')).toBe(true);
  });

  it('Underdogs start the team-mates a star down each', () => {
    const src = team('src', 'Little Ones', 'U8');
    seedRandom(4);
    const plain = createCareer(src, 60, src.players[3]);
    seedRandom(4);
    const under = createCareer(src, 60, src.players[3], 'underdogs');
    expect(stars(under.team, under.career.starId)).toBe(stars(plain.team, plain.career.starId) - (src.players.length - 1));
  });

  it('keeps the twist in the save, gives a sticker for finishing one, and an older career has none', () => {
    resetAll();
    expect(recordCareer({ twistDone: 'late' }).map((s) => s.id)).toEqual(['twist-late']);
    const src = team('src', 'Saved Twist', 'U8');
    const { career: c, team: you } = createCareer(src, 60, src.players[3], 'big');
    saveTeam(you);
    setCareer(c);
    reloadSave();
    expect(getCareer()!.twist).toBe('big');
    const save = JSON.parse(localStorage.getItem(KEY)!);
    delete save.career.twist;
    localStorage.setItem(KEY, JSON.stringify(save));
    reloadSave();
    expect(getCareer()!.twist).toBeNull();
  });
});
