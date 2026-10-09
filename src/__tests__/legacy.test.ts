import { describe, expect, it } from 'vitest';
import { COACH_POINTS, advanceCareer, applyCareerMatch, careerStar, createCareer, legacyAfter, nextGeneration } from '../game/career';
import { getCareer, reloadSave, resetAll, saveTeam, setCareer } from '../data/storage';
import { recordCareer } from '../data/progress';
import { nextFixture } from '../game/league';
import type { MatchResult } from '../game/MatchScene';
import type { Team } from '../data/types';
import { team } from './helpers';

const KEY = 'five-a-side-stars:v1';
const draw = (home: Team, away: Team): MatchResult => ({ mode: 'match', score: [1, 1], goals: [], home, away, stats: { touches: [0, 0], distance: [0, 0] }, players: {}, shootout: null, trainingPoints: 0, twoPlayer: false });

describe('legacy careers', () => {
  it('passes the club\'s history on, and the old Star becomes the coach', () => {
    const src = team('src', 'Family Fives', 'U8');
    const { career: c, team: you } = createCareer(src, 60, src.players[3]);
    c.titles = 3;
    c.cupRuns = [{ age: 'U5', reached: 3 }, { age: 'U6', reached: 1 }] as typeof c.cupRuns;
    c.awards = [{ age: 'U5', awards: [{ id: 'golden-boot', emoji: '👟', title: 'Golden Boot', playerId: 'x', name: 'Mia', line: '9 goals' }] }];
    const first = legacyAfter(c, you, 'sister');
    expect(first).toEqual({ level: 1, coach: careerStar(c, you)!.name, relation: 'sister', heritage: { titles: 3, cups: 1, awards: 1, careers: 1 } });
    // The next generation adds to it.
    const heirs = nextGeneration(you);
    expect(heirs.name).toBe(you.name);
    expect(heirs.kit).toEqual(you.kit);
    expect(heirs.players).toHaveLength(you.players.length);
    expect(heirs.players.every((p) => !you.players.some((q) => q.id === p.id))).toBe(true);
    const next = createCareer(heirs, 60, heirs.players[2], null, first);
    expect(next.career.legacy).toEqual(first);
    expect(next.career.scrapbook[0].text).toContain('coached by');
    next.career.titles = 1;
    expect(legacyAfter(next.career, next.team, 'cousin')).toMatchObject({ level: 2, heritage: { titles: 4, cups: 1, awards: 1, careers: 2 } });
  });

  it('gives the coach\'s training point every new mini season', () => {
    const src = team('src', 'Coached Fives', 'U8');
    const legacy = { level: 1, coach: 'Ana', relation: 'cousin' as const, heritage: { titles: 0, cups: 0, awards: 0, careers: 1 } };
    const run = (l: typeof legacy | null) => {
      const { career: c, team: you } = createCareer(structuredClone(src), 60, src.players[3], null, l);
      while (nextFixture(c.league, you)) { const f = nextFixture(c.league, you)!; applyCareerMatch(c, you, draw(f.home, f.away), [0, 1, 2].map(() => ({ score: [1, 1], pens: null }))); }
      const before = c.trainingPoints;
      advanceCareer(c, you);
      return c.trainingPoints - before;
    };
    expect(run(legacy) - run(null)).toBe(COACH_POINTS);
  });

  it('gives the Family Club and Family Tree stickers', () => {
    resetAll();
    expect(recordCareer({ legacy: 1 })).toEqual([]);
    expect(recordCareer({ legacy: 2 }).map((s) => s.id)).toEqual(['legacy-2']);
    expect(recordCareer({ legacy: 3 }).map((s) => s.id)).toEqual(['legacy-3']);
  });

  it('loads a save from before legacy careers, and drops a legacy it cannot read', () => {
    resetAll();
    const { career: c, team: you } = createCareer(team('src', 'Old Family', 'U8'), 60);
    saveTeam(you);
    setCareer(c);
    const save = JSON.parse(localStorage.getItem(KEY)!);
    delete save.career.legacy;
    localStorage.setItem(KEY, JSON.stringify(save));
    reloadSave();
    expect(getCareer()!.legacy).toBeNull();
    save.career.legacy = { level: 'lots', coach: 'Ana', relation: 'uncle', heritage: { titles: -2, cups: 1 } };
    localStorage.setItem(KEY, JSON.stringify(save));
    reloadSave();
    expect(getCareer()!.legacy).toEqual({ level: 1, coach: 'Ana', relation: 'cousin', heritage: { titles: 0, cups: 1, awards: 0, careers: 0 } });
    save.career.legacy = { coach: 7 };
    localStorage.setItem(KEY, JSON.stringify(save));
    reloadSave();
    expect(getCareer()!.legacy).toBeNull();
  });
});
