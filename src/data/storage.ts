import { starterTeams } from './defaults';
import type { Team } from './types';

const KEY = 'five-a-side-stars:v1';

interface SaveFile {
  teams: Team[];
  settings: { sound: boolean; halfLengthSeconds: number; difficulty: 'easy' | 'normal' | 'hard' };
}

let cache: SaveFile | null = null;

function fresh(): SaveFile {
  return { teams: starterTeams(), settings: { sound: true, halfLengthSeconds: 120, difficulty: 'normal' } };
}

export function loadSave(): SaveFile {
  if (cache) return cache;
  try {
    const raw = localStorage.getItem(KEY);
    if (raw) {
      const parsed = JSON.parse(raw) as SaveFile;
      if (Array.isArray(parsed.teams) && parsed.teams.length > 0) {
        cache = { ...fresh(), ...parsed, settings: { ...fresh().settings, ...(parsed.settings ?? {}) } };
        return cache;
      }
    }
  } catch {
    /* corrupt or blocked storage: start fresh */
  }
  cache = fresh();
  persist();
  return cache;
}

export function persist(): void {
  if (!cache) return;
  try {
    localStorage.setItem(KEY, JSON.stringify(cache));
  } catch {
    /* private mode or quota: the game still works for this visit */
  }
}

export function getTeams(): Team[] {
  return loadSave().teams;
}

export function getTeam(id: string): Team | undefined {
  return getTeams().find((t) => t.id === id);
}

export function saveTeam(team: Team): void {
  const save = loadSave();
  const i = save.teams.findIndex((t) => t.id === team.id);
  if (i >= 0) save.teams[i] = team;
  else save.teams.push(team);
  persist();
}

export function deleteTeam(id: string): void {
  const save = loadSave();
  save.teams = save.teams.filter((t) => t.id !== id);
  if (save.teams.length === 0) save.teams = starterTeams();
  persist();
}

export function getSettings(): SaveFile['settings'] {
  return loadSave().settings;
}

export function updateSettings(patch: Partial<SaveFile['settings']>): void {
  const save = loadSave();
  save.settings = { ...save.settings, ...patch };
  persist();
}

export function resetAll(): void {
  cache = fresh();
  persist();
}
