import { describe, expect, it } from 'vitest';
import { CLUB_TEAM_ID, davaoStrikersTeam, ensureClubTeam, resetClubTeam } from '../data/club';
import { assignSlots, canPlay, formationById, formationFor, applyFormation, swapPlayers } from '../data/formations';
import { getTeam, saveTeam } from '../data/storage';
import { kitsClash } from '../game/kitTexture';
import { isNameOk } from '../data/wordFilter';
import { starsLeft } from '../data/skills';
import { makePlayer } from '../data/defaults';
import { MatchSim } from '../game/sim';
import { runUntil, team } from './helpers';

describe('Davao Strikers FC U7', () => {
  it('has the club squad with their numbers and positions, Randall on the bench', () => {
    const t = davaoStrikersTeam();
    expect(t.ageGroup).toBe('U7');
    expect(t.badge.image).toMatch(/^data:image\/webp;base64,/);
    const row = (name: string) => t.players.find((p) => p.name === name)!;
    expect(t.players.map((p) => [p.name, p.number])).toEqual([['Ragnar', 19], ['Elijah', 8], ['Baby Girl', 22], ['Sage', 12], ['Liam', 21], ['Randall', 10]]);
    expect(canPlay(row('Ragnar'))).toEqual(['GK']);
    expect(canPlay(row('Elijah'))).toEqual(['DEF', 'WING']);
    expect(canPlay(row('Baby Girl'))).toEqual(['WING', 'DEF']);
    expect(canPlay(row('Sage'))).toEqual(['WING', 'ATT']);
    expect(canPlay(row('Liam'))).toEqual(['ATT', 'DEF']);
    expect(canPlay(row('Randall'))).toEqual(['ATT', 'WING']);
    expect(t.players.filter((p) => p.starter).map((p) => p.name)).not.toContain('Randall');
    expect(formationFor(t)).toBe('diamond');
    for (const p of t.players) { expect(isNameOk(p.name)).toBe(true); expect(starsLeft(p.skills, 'U7', p.position)).toBeGreaterThanOrEqual(0); }
  });

  it('wears kits that tell the outfield and the keeper apart', () => {
    const t = davaoStrikersTeam();
    expect(kitsClash(t.kit, t.keeperKit)).toBe(false);
    expect(kitsClash(t.kit, t.awayKit)).toBe(false);
  });

  it('is saved once, keeps edits, and can be reset', () => {
    const first = ensureClubTeam();
    first.players[0].name = 'Ragz';
    saveTeam(first);
    expect(ensureClubTeam().players[0].name).toBe('Ragz');
    resetClubTeam();
    expect(getTeam(CLUB_TEAM_ID)!.players[0].name).toBe('Ragnar');
  });

  it('plays a full match', () => {
    const sim = new MatchSim({ home: davaoStrikersTeam(), away: team('a', 'Away', 'U7'), difficulty: 'normal', halfSeconds: 20, humanSide: null });
    runUntil(sim, (s) => s.phase === 'fulltime');
    expect(sim.phase).toBe('fulltime');
  });
});

describe('multiple positions', () => {
  it('fills a spot with someone who can also play there before a near fit', () => {
    const striker = makePlayer('ATT', 9);
    const playmaker = { ...makePlayer('ATT', 10), positions: ['ATT', 'MID'] as ('ATT' | 'MID')[] };
    const def = makePlayer('DEF', 2);
    const winger = makePlayer('WING', 7);
    // Pyramid: DEF, DEF, MID, ATT. The striker who can also play midfield takes the middle; the winger drops back.
    const slots = assignSlots([striker, playmaker, def, winger], formationById('pyramid'));
    expect(slots.get(striker)!.pos).toBe('ATT');
    expect(slots.get(playmaker)!.pos).toBe('MID');
    expect(slots.get(def)!.pos).toBe('DEF');
    expect(slots.get(winger)!.pos).toBe('DEF');
  });

  it('a formation change moves players into the spots they can play', () => {
    const t = davaoStrikersTeam();
    applyFormation(t, 'box');
    const pos = (name: string) => t.players.find((p) => p.name === name)!.position;
    // Box is two defenders and two strikers: Baby Girl drops back, Sage moves up.
    expect(pos('Elijah')).toBe('DEF');
    expect(pos('Baby Girl')).toBe('DEF');
    expect(pos('Liam')).toBe('ATT');
    expect(pos('Sage')).toBe('ATT');
    // Their natural positions are untouched.
    expect(canPlay(t.players.find((p) => p.name === 'Sage')!)).toEqual(['WING', 'ATT']);
  });
});

describe('swapping players in the line-up', () => {
  it('two starters swap spots on the pitch', () => {
    const t = davaoStrikersTeam();
    const elijah = t.players.find((p) => p.name === 'Elijah')!;
    const liam = t.players.find((p) => p.name === 'Liam')!;
    swapPlayers(t, elijah, liam);
    expect(elijah.position).toBe('ATT');
    expect(liam.position).toBe('DEF');
    const slots = assignSlots(t.players.filter((p) => p.starter && p.position !== 'GK'), formationById(t.formation));
    expect(slots.get(elijah)!.pos).toBe('ATT');
    expect(slots.get(liam)!.pos).toBe('DEF');
    expect(formationFor(t)).toBe('diamond');
  });

  it('two players in the same position swap sides', () => {
    const t = davaoStrikersTeam();
    const f = formationById('diamond');
    const wingers = () => assignSlots(t.players.filter((p) => p.starter && p.position !== 'GK'), f);
    const bg = t.players.find((p) => p.name === 'Baby Girl')!;
    const sage = t.players.find((p) => p.name === 'Sage')!;
    const before = wingers().get(bg)!.z;
    swapPlayers(t, bg, sage);
    expect(wingers().get(sage)!.z).toBe(before);
  });

  it('a sub dragged onto a starter comes on in their place', () => {
    const t = davaoStrikersTeam();
    const randall = t.players.find((p) => p.name === 'Randall')!;
    const sage = t.players.find((p) => p.name === 'Sage')!;
    swapPlayers(t, randall, sage);
    expect(randall.starter).toBe(true);
    expect(randall.position).toBe('WING');
    expect(sage.starter).toBe(false);
    expect(t.players.filter((p) => p.starter)).toHaveLength(5);
    expect(formationFor(t)).toBe('diamond');
  });

  it('an outfielder can swap into goal', () => {
    const t = davaoStrikersTeam();
    const ragnar = t.players.find((p) => p.name === 'Ragnar')!;
    const liam = t.players.find((p) => p.name === 'Liam')!;
    swapPlayers(t, liam, ragnar);
    expect(liam.position).toBe('GK');
    expect(ragnar.position).toBe('ATT');
    expect(t.players.filter((p) => p.position === 'GK')).toHaveLength(1);
  });

  it('two subs only swap places on the bench', () => {
    const t = team('h', 'Home');
    t.players.push(makePlayer('DEF', 12, 'Sub A', false), makePlayer('ATT', 13, 'Sub B', false));
    const [a, b] = t.players.slice(5);
    swapPlayers(t, a, b);
    expect(a.position).toBe('DEF');
    expect(t.players.slice(5)).toEqual([b, a]);
  });
});
