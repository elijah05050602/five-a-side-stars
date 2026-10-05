import { describe, expect, it } from 'vitest';
import { STAR_BUDGET, STAR_CAP, fitSkills, starsLeft } from '../data/skills';
import { getTeams, reloadSave, resetAll } from '../data/storage';
import { AGE_GROUPS } from '../data/types';
import { team } from './helpers';

const KEY = 'five-a-side-stars:v1';

describe('star budget', () => {
  it('trims a player moved down an age group to the cap and the budget', () => {
    const p = { ...team('t', 'T', 'U8').players[1], skills: { speed: 4, shooting: 3, passing: 2, defending: 2 } };
    for (const age of AGE_GROUPS) {
      const s = fitSkills(p, age);
      expect(Math.max(...Object.values(s))).toBeLessThanOrEqual(STAR_CAP[age]);
      expect(starsLeft(s, age)).toBeGreaterThanOrEqual(0);
    }
    expect(fitSkills(p, 'U7')).toMatchObject({ defending: 2 });
  });

  it('leaves career players over the budget, since they earn stars by playing', () => {
    const p = { ...team('t', 'T', 'U8').players[1], skills: { speed: 4, shooting: 4, passing: 4, defending: 4 } };
    expect(starsLeft(fitSkills(p, 'U8', false), 'U8')).toBeLessThan(0);
  });

  it('fixes over-budget teams in an old save when it loads', () => {
    resetAll();
    const t = team('old', 'Old Owls', 'U7');
    t.players[2].skills = { speed: 3, shooting: 3, passing: 3, defending: 2 };
    const save = JSON.parse(localStorage.getItem(KEY)!);
    save.teams.push(t);
    localStorage.setItem(KEY, JSON.stringify(save));
    reloadSave();
    for (const tm of getTeams()) for (const p of tm.players) expect(totalOk(p.skills, tm.ageGroup)).toBe(true);
  });

  it('starter teams are within their budget', () => {
    resetAll();
    for (const tm of getTeams()) for (const p of tm.players) expect(totalOk(p.skills, tm.ageGroup)).toBe(true);
  });
});

const totalOk = (s: Parameters<typeof starsLeft>[0], age: keyof typeof STAR_BUDGET) => starsLeft(s, age) >= 0;
