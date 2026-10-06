import { describe, expect, it } from 'vitest';
import { cupInProgress, deleteTeam, exportSave, getLeague, getSettings, getTeam, getTeams, getTournament, hasBackup, importSave, reloadSave, resetAll, restoreBackup, saveTeam, setLeague, setTournament, updateSettings } from '../data/storage';
import { getProgress } from '../data/progress';
import { createLeague } from '../game/league';
import { createTournament } from '../game/tournament';
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

describe('a damaged save never costs the rest of it', () => {
  /** A save with stickers, a league and one good custom team, plus whatever `extra` adds. */
  const goodSave = (extra: Record<string, unknown> = {}) => {
    resetAll();
    saveTeam(team('mine', 'My Mighty Team', 'U8'));
    const save = JSON.parse(localStorage.getItem(KEY)!);
    save.progress = { played: 42, won: 30, drawn: 5, lost: 7, goalsFor: 99, goalsAgainst: 40, trophies: 3, shootoutsWon: 2, trainingBest: 12, agesPlayed: ['U8'], stickers: ['first-match', 'first-win', 'trophy'] };
    save.league = createLeague(save.teams[0], 60);
    return { ...save, ...extra };
  };

  it('drops only the broken team, keeps a backup, and keeps the stickers and the league', () => {
    const save = goodSave();
    save.teams.push({ ...save.teams[1], id: 'broken', players: undefined });
    const raw = JSON.stringify(save);
    localStorage.setItem(KEY, raw);
    localStorage.removeItem(`${KEY}:backup`);
    reloadSave();
    expect(getTeams().map((t) => t.id)).toContain('mine');
    expect(getTeam('broken')).toBeUndefined();
    expect(getProgress().stickers).toEqual(['first-match', 'first-win', 'trophy']);
    expect(getProgress().played).toBe(42);
    expect(getLeague()?.rounds.length).toBe(5);
    expect(localStorage.getItem(`${KEY}:backup`)).toBe(raw);
  });

  it('keeps an unreadable save in the backup slot instead of throwing it away', () => {
    localStorage.removeItem(`${KEY}:backup`);
    localStorage.setItem(KEY, '{not json');
    reloadSave();
    expect(getTeams().length).toBe(2);
    expect(localStorage.getItem(`${KEY}:backup`)).toBe('{not json');
    expect(hasBackup()).toBe(true);
  });

  it('mends bad colours, logos, numbers and names rather than trusting them', () => {
    const save = goodSave();
    const t = save.teams.find((x: { id: string }) => x.id === 'mine');
    t.badge.image = 'javascript:alert(1)';
    t.kit.shirt = '"><img src=x onerror=alert(1)>';
    t.players[0].number = 400;
    t.players[1].name = '';
    t.players[2].position = 'STRIKER';
    localStorage.setItem(KEY, JSON.stringify(save));
    reloadSave();
    const mine = getTeam('mine')!;
    expect(mine.badge.image).toBeUndefined();
    expect(mine.kit.shirt).toMatch(/^#[0-9a-f]{6}$/i);
    expect(mine.players[0].number).toBeGreaterThanOrEqual(1);
    expect(mine.players[0].number).toBeLessThanOrEqual(99);
    expect(mine.players[1].name.length).toBeGreaterThan(0);
    expect(['GK', 'DEF', 'MID', 'WING', 'ATT']).toContain(mine.players[2].position);
  });

  it('keeps a real uploaded logo', () => {
    const save = goodSave();
    const logo = 'data:image/webp;base64,UklGRhoAAABXRUJQVlA4TA0AAAAvAAAAEAcQERGIiP4HAA==';
    save.teams.find((x: { id: string }) => x.id === 'mine').badge.image = logo;
    localStorage.setItem(KEY, JSON.stringify(save));
    reloadSave();
    expect(getTeam('mine')!.badge.image).toBe(logo);
  });

  it('drops a league that is not the right shape, but nothing else', () => {
    localStorage.setItem(KEY, JSON.stringify(goodSave({ league: { tier: 'banana' } })));
    reloadSave();
    expect(getLeague()).toBeNull();
    expect(getTeam('mine')).toBeDefined();
    expect(getProgress().played).toBe(42);
  });
});

describe('backups, export and import', () => {
  it('a backup file loads back to the same teams, stickers and settings', () => {
    resetAll();
    saveTeam(team('mine', 'Backup Bees', 'U9'));
    updateSettings({ difficulty: 'hard' });
    getProgress().stickers.push('first-win');
    const file = exportSave();
    resetAll();
    expect(getTeam('mine')).toBeUndefined();
    const result = importSave(file);
    expect(result).toMatchObject({ ok: true });
    reloadSave();
    expect(getTeam('mine')?.name).toBe('Backup Bees');
    expect(getSettings().difficulty).toBe('hard');
    expect(getProgress().stickers).toContain('first-win');
  });

  it('refuses a file that is not a save, and leaves the save alone', () => {
    resetAll();
    saveTeam(team('mine', 'Stay Put', 'U8'));
    expect(importSave('hello')).toMatchObject({ ok: false });
    expect(importSave(JSON.stringify({ teams: [] }))).toMatchObject({ ok: false });
    expect(getTeam('mine')?.name).toBe('Stay Put');
  });

  it('a reset can be undone, and the undo can be undone', () => {
    resetAll();
    saveTeam(team('mine', 'Undo United', 'U8'));
    resetAll();
    expect(getTeam('mine')).toBeUndefined();
    expect(restoreBackup()).toBe(true);
    expect(getTeam('mine')?.name).toBe('Undo United');
    expect(restoreBackup()).toBe(true);
    expect(getTeam('mine')).toBeUndefined();
  });
});

describe('the cup and the motion setting live in the save', () => {
  it('keeps a cup in progress until it is finished', () => {
    resetAll();
    const state = createTournament(getTeams()[0], 'normal', 60);
    setTournament(state);
    reloadSave();
    expect(getTournament()?.semis[0].home.id).toBe(getTeams()[0].id);
    expect(cupInProgress()).toBe(true);
    const done = { ...getTournament()!, stage: 'done' as const };
    setTournament(done);
    expect(cupInProgress()).toBe(false);
  });

  it('deleting the cup team ends the cup', () => {
    resetAll();
    saveTeam(team('mine', 'Cup Kids', 'U8'));
    setTournament(createTournament(getTeam('mine')!, 'normal', 60));
    deleteTeam('mine');
    expect(getTournament()).toBeNull();
  });

  it('turns the old reduce-motion switch into a motion choice', () => {
    localStorage.setItem(KEY, JSON.stringify({ teams: getTeams(), settings: { reduceMotion: true } }));
    reloadSave();
    // The test device does not ask for reduced motion, so a switched-on setting was the player's own choice.
    expect(getSettings().motion).toBe('reduce');
    expect(getSettings().reduceMotion).toBe(true);
    updateSettings({ motion: 'full' });
    expect(getSettings().reduceMotion).toBe(false);
  });
});
