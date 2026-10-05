import { describe, expect, it } from 'vitest';
import { STAR_BUDGET, STAR_CAP, averageStars, ensureSkills, fitSkills, randomSkills, skillKeys, starsLeft, totalStars } from '../data/skills';
import { getTeams, reloadSave, resetAll } from '../data/storage';
import { AGE_GROUPS, KEEPER_SKILLS, OUTFIELD_SKILLS, type AgeGroup, type Player, type Position, type Skills } from '../data/types';
import { skillMuls } from '../game/sim';
import { team } from './helpers';

const KEY = 'five-a-side-stars:v1';

/** Every rating at `n` stars. */
const flat = (n: number): Skills => Object.fromEntries([...OUTFIELD_SKILLS, ...KEEPER_SKILLS].map((k) => [k, n])) as Skills;

describe('seven stats', () => {
  it('outfield players and keepers each have seven ratings', () => {
    expect(skillKeys('ATT')).toHaveLength(7);
    expect(skillKeys('DEF')).toHaveLength(7);
    expect(skillKeys('GK')).toHaveLength(7);
    expect(skillKeys('GK')).toEqual(expect.arrayContaining(['handling', 'diving', 'reflexes', 'positioning']));
    expect(skillKeys('ATT')).toEqual(expect.arrayContaining(['control', 'shooting', 'tackling', 'stamina', 'strength']));
  });

  it('random players spend exactly their budget, within the cap', () => {
    for (const age of AGE_GROUPS) for (const pos of ['GK', 'DEF', 'ATT'] as Position[]) {
      const s = randomSkills(pos, age);
      expect(starsLeft(s, age, pos)).toBe(0);
      for (const k of skillKeys(pos)) expect(s[k]).toBeLessThanOrEqual(STAR_CAP[age]);
    }
  });

  it('every rating a position uses changes how that player plays', () => {
    const base = { ...team('t', 'T', 'U8').players[1] };
    for (const pos of ['GK', 'DEF', 'ATT'] as Position[]) {
      const avg = skillMuls({ ...base, position: pos, skills: flat(3) }, 'U8');
      for (const k of skillKeys(pos)) {
        const boosted = skillMuls({ ...base, position: pos, skills: { ...flat(3), [k]: 4 } }, 'U8');
        expect(boosted, `${pos} ${k}`).not.toEqual(avg);
      }
    }
  });

  it('an average player plays exactly like the age group', () => {
    const p = { ...team('t', 'T', 'U9').players[1], skills: flat(averageStars('U9')) };
    const m = skillMuls(p, 'U9');
    for (const v of Object.values(m)) expect([0, 1]).toContain(Math.round(v * 1e9) / 1e9);
  });
});

describe('star budget', () => {
  it('trims a player moved down an age group to the cap and the budget', () => {
    const p: Player = { ...team('t', 'T', 'U8').players[1], skills: { ...flat(2), speed: 4, shooting: 3, tackling: 4 } };
    for (const age of AGE_GROUPS) {
      const s = fitSkills(p, age);
      expect(Math.max(...skillKeys(p.position).map((k) => s[k]))).toBeLessThanOrEqual(STAR_CAP[age]);
      expect(starsLeft(s, age, p.position)).toBeGreaterThanOrEqual(0);
    }
  });

  it('leaves career players over the budget, since they earn stars by playing', () => {
    const p = { ...team('t', 'T', 'U8').players[1], skills: flat(4) };
    expect(starsLeft(fitSkills(p, 'U8', false), 'U8', p.position)).toBeLessThan(0);
  });

  it('fixes over-budget teams in a save when it loads', () => {
    resetAll();
    const t = team('old', 'Old Owls', 'U7');
    t.players[2].skills = flat(3);
    const save = JSON.parse(localStorage.getItem(KEY)!);
    save.teams.push(t);
    localStorage.setItem(KEY, JSON.stringify(save));
    reloadSave();
    for (const tm of getTeams()) for (const p of tm.players) expect(starsLeft(p.skills, tm.ageGroup, p.position)).toBeGreaterThanOrEqual(0);
  });

  it('starter teams are within their budget', () => {
    resetAll();
    for (const tm of getTeams()) for (const p of tm.players) expect(starsLeft(p.skills, tm.ageGroup, p.position)).toBeGreaterThanOrEqual(0);
  });
});

describe('moving four-star saves to seven stats', () => {
  const legacy = (age: AgeGroup, career = false) => {
    const t = team(`old-${age}`, 'Old Owls', age);
    const old = t.players.map((p) => ({ ...p, skills: { speed: 3, shooting: 2, passing: 3, defending: 1 }, ...(career ? { xp: { speed: 0.5, shooting: 0.25, passing: 0, defending: 0.75 } } : {}) }));
    return { ...t, career, players: old } as unknown as typeof t;
  };

  it('carries each old star to its new rating and keeps the team playable', () => {
    resetAll();
    const save = JSON.parse(localStorage.getItem(KEY)!);
    save.teams.push(legacy('U9'), legacy('U6'));
    localStorage.setItem(KEY, JSON.stringify(save));
    reloadSave();
    const u9 = getTeams().find((t) => t.id === 'old-U9')!;
    const att = u9.players.find((p) => p.position === 'ATT')!;
    expect(att.skills).toMatchObject({ speed: 3, shooting: 2, passing: 3, tackling: 1 });
    const gk = u9.players.find((p) => p.position === 'GK')!;
    expect(gk.skills).toMatchObject({ speed: 3, handling: 2, passing: 3, diving: 1 });
    for (const t of getTeams().filter((x) => x.id.startsWith('old-'))) {
      for (const p of t.players) {
        for (const k of skillKeys(p.position)) {
          expect(Number.isInteger(p.skills[k])).toBe(true);
          expect(p.skills[k]).toBeGreaterThanOrEqual(1);
          expect(p.skills[k]).toBeLessThanOrEqual(STAR_CAP[t.ageGroup]);
        }
        expect(starsLeft(p.skills, t.ageGroup, p.position)).toBeGreaterThanOrEqual(0);
      }
    }
  });

  it('keeps a career player\'s stars and moves their progress across', () => {
    const t = legacy('U8', true);
    const p = ensureSkills(t.players[3], 'U8');
    expect(p.skills).toMatchObject({ speed: 3, shooting: 2, passing: 3, tackling: 1 });
    expect(p.xp).toMatchObject({ speed: 0.5, shooting: 0.25, tackling: 0.75 });
    expect(totalStars(p.skills, p.position)).toBeGreaterThan(9);
  });

  it('budgets grow every year', () => {
    for (let i = 1; i < AGE_GROUPS.length; i++) expect(STAR_BUDGET[AGE_GROUPS[i]]).toBeGreaterThan(STAR_BUDGET[AGE_GROUPS[i - 1]]);
  });
});
