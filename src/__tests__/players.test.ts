import { describe, expect, it } from 'vitest';
import { FIRST_NAMES, genderOfName, makePlayer, randomPlayerName } from '../data/defaults';
import { davaoStrikersTeam, ensureClubTeam } from '../data/club';
import { resetAll, saveTeam } from '../data/storage';

describe('boy or girl', () => {
  it('gives a made-up player a name to match', () => {
    for (let i = 0; i < 60; i++) {
      const p = makePlayer('ATT', 9);
      expect(p.gender).toBeDefined();
      expect(p.gender).toBe(genderOfName(p.name));
    }
    for (const g of ['boy', 'girl'] as const) for (let i = 0; i < 20; i++) expect(genderOfName(randomPlayerName(g))).toBe(g);
    expect(FIRST_NAMES.filter((n) => genderOfName(n) === 'girl')).toHaveLength(FIRST_NAMES.length / 2);
  });

  it('leaves a name someone typed unset', () => {
    expect(makePlayer('ATT', 9, 'Bob').gender).toBeUndefined();
  });

  it('makes Baby Girl the only girl in the club squad', () => {
    const squad = davaoStrikersTeam().players;
    expect(squad.filter((p) => p.gender === 'girl').map((p) => p.name)).toEqual(['Baby Girl']);
    expect(squad.every((p) => p.gender === 'girl' || p.gender === 'boy')).toBe(true);
  });

  it('tells a saved club team who is a girl and keeps the looks changed since', () => {
    resetAll();
    const saved = davaoStrikersTeam();
    saved.clubVersion = 2;
    for (const p of saved.players) delete p.gender;
    const changed = saved.players[0];
    changed.hairStyle = changed.hairStyle === 'bald' ? 'afro' : 'bald';
    saveTeam(saved);
    const team = ensureClubTeam();
    expect(team.players.find((p) => p.name === 'Baby Girl')?.gender).toBe('girl');
    expect(team.players.filter((p) => p.gender === 'boy')).toHaveLength(team.players.length - 1);
    expect(team.players.find((p) => p.id === changed.id)?.hairStyle).toBe(changed.hairStyle);
  });
});
