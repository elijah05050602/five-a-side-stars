import { describe, expect, it } from 'vitest';
import { deleteTeam, getLeague, getSettings, getTeam, getTeams, reloadSave, resetAll, saveTeam, setLeague, updateSettings } from '../data/storage';
import { createLeague } from '../game/league';
import { team } from './helpers';

const KEY = 'five-a-side-stars:v1';

describe('save file', () => {
  it('starts with the two starter teams and sensible settings', () => {
    resetAll();
    const teams = getTeams();
    expect(teams.map((t) => t.name)).toEqual(['Rocket Rovers', 'Sunny Sharks']);
    expect(getSettings()).toMatchObject({ sound: true, music: true, halfLengthSeconds: 120, difficulty: 'normal' });
    expect(localStorage.getItem(KEY)).not.toBeNull();
  });

  it('round-trips a saved team through localStorage', () => {
    resetAll();
    const t = team('t1', 'Test Tigers', 'U6');
    saveTeam(t);
    const raw = JSON.parse(localStorage.getItem(KEY)!) as { teams: { id: string }[] };
    expect(raw.teams.some((x) => x.id === 't1')).toBe(true);
    expect(getTeam('t1')?.name).toBe('Test Tigers');
    t.name = 'Renamed';
    saveTeam(t);
    expect(getTeams().filter((x) => x.id === 't1')).toHaveLength(1);
    expect(getTeam('t1')?.name).toBe('Renamed');
  });

  it('deleting the last team brings the starter teams back', () => {
    resetAll();
    for (const t of getTeams()) deleteTeam(t.id);
    expect(getTeams().length).toBe(2);
  });

  it('fills in fields added since an old save was written', () => {
    resetAll();
    const old = {
      teams: [{
        id: 'old', name: 'Old Timers', short: 'OLD', ageGroup: 'U7', createdAt: 1,
        kit: { pattern: 'plain', shirt: '#3da5f4', shirt2: '#ffd23f', shorts: '#ffffff', socks: '#3da5f4' },
        keeperKit: { pattern: 'plain', shirt: '#ff7a00', shirt2: '#111111', shorts: '#111111', socks: '#ff7a00' },
        players: [
          { id: 'p1', name: 'Gus', number: 1, position: 'GK', skin: '#f6d7c3', hair: '#2b1b0e' },
          { id: 'p2', name: 'Dee', number: 4, position: 'DEF', skin: '#f6d7c3', hair: '#2b1b0e' },
          { id: 'p3', name: 'Dan', number: 5, position: 'DEF', skin: '#f6d7c3', hair: '#2b1b0e' },
          { id: 'p4', name: 'Ann', number: 7, position: 'ATT', skin: '#f6d7c3', hair: '#2b1b0e' },
          { id: 'p5', name: 'Al', number: 9, position: 'ATT', skin: '#f6d7c3', hair: '#2b1b0e' },
          { id: 'p6', name: 'Sub', number: 11, position: 'ATT', skin: '#f6d7c3', hair: '#2b1b0e' },
        ],
      }],
      settings: { sound: false },
    };
    localStorage.setItem(KEY, JSON.stringify(old));
    reloadSave();
    const t = getTeam('old')!;
    expect(t.awayKit.shirt).toBe('#ffd23f');
    expect(t.badge.shape).toBe('shield');
    expect(t.players[0]).toMatchObject({ hairStyle: 'short', boots: '#222222', special: 'none', starter: true });
    expect(t.players[5].starter).toBe(false);
    expect(getSettings()).toMatchObject({ sound: false, music: true, difficulty: 'normal' });
  });

  it('starts fresh when the stored JSON is corrupt', () => {
    localStorage.setItem(KEY, '{not json');
    reloadSave();
    expect(getTeams().length).toBe(2);
  });

  it('keeps settings and the league in the same save', () => {
    resetAll();
    updateSettings({ difficulty: 'hard', halfLengthSeconds: 300 });
    const league = createLeague(getTeams()[0], 60);
    setLeague(league);
    reloadSave();
    expect(getSettings().difficulty).toBe('hard');
    expect(getSettings().halfLengthSeconds).toBe(300);
    expect(getLeague()?.teamId).toBe(league.teamId);
    expect(getLeague()?.rounds.length).toBe(5);
    setLeague(null);
    expect(getLeague()).toBeNull();
  });
});
