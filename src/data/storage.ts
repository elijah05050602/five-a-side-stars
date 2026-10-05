import { awayKitFor, makeBadge, starterTeams } from './defaults';
import type { LeagueState } from '../game/league';
import type { Progress } from './progress';
import type { Team } from './types';

const KEY = 'five-a-side-stars:v1';

interface SaveFile {
  teams: Team[];
  settings: { sound: boolean; music: boolean; reduceMotion: boolean; halfLengthSeconds: number; difficulty: 'easy' | 'normal' | 'hard' };
  progress?: Progress;
  league?: LeagueState | null;
}

let cache: SaveFile | null = null;

function fresh(): SaveFile {
  const prefersLess = typeof window !== 'undefined' && 'matchMedia' in window && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  return { teams: starterTeams(), settings: { sound: true, music: true, reduceMotion: prefersLess, halfLengthSeconds: 120, difficulty: 'normal' } };
}

export function loadSave(): SaveFile {
  if (cache) return cache;
  try {
    const raw = localStorage.getItem(KEY);
    if (raw) {
      const parsed = JSON.parse(raw) as SaveFile;
      if (Array.isArray(parsed.teams) && parsed.teams.length > 0) {
        cache = { ...fresh(), ...parsed, teams: parsed.teams.map(migrateTeam), settings: { ...fresh().settings, ...(parsed.settings ?? {}) } };
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

/** Fill in fields added since a team was saved, so old teams keep working. */
function migrateTeam(t: Team): Team {
  const team = { ...t };
  if (!team.awayKit) team.awayKit = awayKitFor(team.kit);
  if (!team.badge) team.badge = makeBadge(team.kit.shirt, team.kit.shirt2);
  team.players = team.players.map((p, i) => {
    const old = p as Partial<Team['players'][number]>;
    return { ...p, hairStyle: old.hairStyle ?? 'short', boots: old.boots ?? '#222222', special: old.special ?? 'none', starter: old.starter ?? i < 5 };
  });
  return team;
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

export function getLeague(): LeagueState | null {
  return loadSave().league ?? null;
}

export function setLeague(league: LeagueState | null): void {
  loadSave().league = league;
  persist();
}

export function resetAll(): void {
  cache = fresh();
  persist();
}
