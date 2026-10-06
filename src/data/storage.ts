import { awayKitFor, makeBadge, makeKit, makePlayer, shortCode, starterTeams, uid } from './defaults';
import type { LeagueState } from '../game/league';
import type { CareerState } from '../game/career';
import type { TournamentState } from '../game/tournament';
import { ensureSkills, fitSkills } from './skills';
import { freshProgress, type Progress } from './progress';
import { AGE_GROUPS, BADGE_SHAPES, BOOT_STYLES, BUILDS, HAIR_STYLES, KIT_PATTERNS, POSITIONS, SPECIALS, type Kit, type Player, type Team } from './types';
import { FORMATIONS } from './formations';
import { isNameOk } from './wordFilter';
import type { GraphicsQuality } from '../game/graphics';

const KEY = 'five-a-side-stars:v1';
/**
 * The save as it was before the game last had to repair it, reset it or load a backup file over it,
 * so nothing a child has built is ever lost to a bad load. The Parents Zone can put it back.
 */
const BACKUP_KEY = `${KEY}:backup`;

/** How much the game animates: follow the device's own setting, or always calm, or always full. */
export type MotionChoice = 'auto' | 'reduce' | 'full';

interface Settings {
  sound: boolean; music: boolean; commentary: boolean;
  musicVolume: number; voiceVolume: number; sfxVolume: number;
  /** What the game does now (from `motion` and the device). Everything that animates reads this. */
  reduceMotion: boolean;
  motion: MotionChoice;
  halfLengthSeconds: number; difficulty: 'easy' | 'normal' | 'hard'; tutorialDone: boolean; graphics: GraphicsQuality;
  /** Beginner help in every match: a gentler computer team and help aiming shots. */
  beginnerHelp: boolean;
}

interface SaveFile {
  teams: Team[];
  settings: Settings;
  progress?: Progress;
  league?: LeagueState | null;
  career?: CareerState | null;
  tournament?: TournamentState | null;
}

let cache: SaveFile | null = null;

const devicePrefersLess = (): boolean => typeof window !== 'undefined' && 'matchMedia' in window && window.matchMedia('(prefers-reduced-motion: reduce)').matches;

function freshSettings(): Settings {
  return { sound: true, music: true, commentary: true, musicVolume: 0.7, voiceVolume: 1, sfxVolume: 1, reduceMotion: devicePrefersLess(), motion: 'auto', halfLengthSeconds: 120, difficulty: 'normal', tutorialDone: false, graphics: 'auto', beginnerHelp: false };
}

function fresh(): SaveFile {
  return { teams: starterTeams(), settings: freshSettings() };
}

export function loadSave(): SaveFile {
  if (cache) return cache;
  let raw: string | null = null;
  try {
    raw = localStorage.getItem(KEY);
  } catch {
    // Storage is blocked (some private modes): play this visit without saving.
    cache = fresh();
    return cache;
  }
  if (raw) {
    const { save, repaired } = readSave(raw);
    cache = save;
    // Anything that had to be dropped is still in the backup, and the repaired save carries on.
    if (repaired) { keepBackup(raw); persist(); }
    return cache;
  }
  cache = fresh();
  persist();
  return cache;
}

/**
 * Turn stored text into a save the game can play with. Old saves get the fields added since they
 * were written; anything broken is mended or left out piece by piece (one bad team never costs the
 * others, the stickers or the league). `repaired` says something had to be dropped.
 */
function readSave(raw: string): { save: SaveFile; repaired: boolean } {
  let parsed: Partial<SaveFile> & { settings?: Partial<Settings> };
  try {
    parsed = JSON.parse(raw);
  } catch {
    return { save: fresh(), repaired: true };
  }
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return { save: fresh(), repaired: true };
  let repaired = false;
  const teams: Team[] = [];
  if (Array.isArray(parsed.teams)) {
    for (const t of parsed.teams) {
      try { teams.push(migrateTeam(t)); } catch { repaired = true; }
    }
  } else if (parsed.teams !== undefined) repaired = true;
  const settings = readSettings(parsed.settings);
  const progress = readProgress(parsed.progress);
  if (parsed.progress !== undefined && !progress) repaired = true;
  const league = readOptional(parsed.league, isLeague);
  const career = readOptional(parsed.career, isCareer);
  const tournament = readOptional(parsed.tournament, isTournament);
  if ([league, career, tournament].some((x) => x === 'broken')) repaired = true;
  return {
    save: {
      teams: teams.length ? teams : starterTeams(),
      settings,
      ...(progress ? { progress } : {}),
      league: league === 'broken' ? null : league,
      career: career === 'broken' ? null : career,
      tournament: tournament === 'broken' ? null : tournament,
    },
    repaired,
  };
}

const HEX = /^#[0-9a-f]{6}$/i;
/** Uploaded logos are re-drawn as small PNG/WebP/JPEG data URLs; anything else is not a logo. */
const LOGO = /^data:image\/(png|webp|jpeg);base64,[a-z0-9+/]+=*$/i;
const oneOf = <T extends string>(list: readonly T[], v: unknown, fallback: T): T => (list.includes(v as T) ? (v as T) : fallback);
const colour = (v: unknown, fallback: string): string => (typeof v === 'string' && HEX.test(v) ? v : fallback);
const text = (v: unknown, fallback: string, max: number): string => (typeof v === 'string' && v.trim() ? Array.from(v).slice(0, max).join('') : fallback);

function readKit(k: unknown, fallback: Kit): Kit {
  if (!k || typeof k !== 'object') return fallback;
  const o = k as Partial<Kit>;
  return makeKit(colour(o.shirt, fallback.shirt), colour(o.shirt2, fallback.shirt2), colour(o.shorts, fallback.shorts), colour(o.socks, fallback.socks), oneOf(KIT_PATTERNS, o.pattern, fallback.pattern));
}

/** Fill in fields added since a team was saved, and mend anything that is not the right shape, so old teams keep working. */
function migrateTeam(raw: unknown): Team {
  if (!raw || typeof raw !== 'object') throw new Error('not a team');
  const t = raw as Partial<Team>;
  if (!Array.isArray(t.players)) throw new Error('no players');
  const ageGroup = oneOf(AGE_GROUPS, t.ageGroup, 'U8');
  const name = text(t.name, 'My Team', 40);
  const kit = readKit(t.kit, makeKit('#e63946', '#ffffff', '#1b2a41', '#e63946'));
  const badgeIn = (t.badge && typeof t.badge === 'object' ? t.badge : {}) as Partial<Team['badge']>;
  const badge = makeBadge(colour(badgeIn.colour1, kit.shirt), colour(badgeIn.colour2, kit.shirt2), typeof badgeIn.icon === 'string' && badgeIn.icon.length <= 16 ? badgeIn.icon : '⚽', oneOf(BADGE_SHAPES, badgeIn.shape, 'shield'));
  if (typeof badgeIn.image === 'string' && LOGO.test(badgeIn.image) && badgeIn.image.length < 400_000) badge.image = badgeIn.image;
  const team: Team = {
    ...t,
    id: text(t.id, uid(), 80),
    name,
    short: typeof t.short === 'string' && /^[\p{L}\p{N}]{1,3}$/u.test(t.short) && isNameOk(t.short) ? t.short : shortCode(name),
    ageGroup,
    badge,
    kit,
    awayKit: readKit(t.awayKit, awayKitFor(kit)),
    keeperKit: readKit(t.keeperKit, makeKit('#ffd23f', '#111111', '#111111', '#ffd23f')),
    formation: FORMATIONS.some((f) => f.id === t.formation) ? t.formation : undefined,
    createdAt: Number.isFinite(t.createdAt) ? t.createdAt! : Date.now(),
    players: [],
  };
  const players = t.players.filter((p): p is Player => !!p && typeof p === 'object').slice(0, 8).map((p, i) => {
    const old = p as Partial<Player>;
    const position = oneOf(POSITIONS, old.position, i === 0 ? 'GK' : 'DEF');
    const fixedUp: Player = {
      ...p,
      id: text(old.id, uid(), 80),
      name: text(old.name, `Player ${i + 1}`, 30),
      number: Number.isInteger(old.number) && old.number! >= 1 && old.number! <= 99 ? old.number! : i + 1,
      position,
      positions: Array.isArray(old.positions) ? old.positions.filter((x) => POSITIONS.includes(x)) : undefined,
      skin: colour(old.skin, '#d49a6a'),
      hair: colour(old.hair, '#2b1b0e'),
      hairStyle: oneOf(HAIR_STYLES, old.hairStyle, 'short'),
      build: old.build === undefined ? undefined : oneOf(BUILDS, old.build, 'regular'),
      boots: colour(old.boots, '#222222'),
      bootStyle: old.bootStyle === undefined ? undefined : oneOf(BOOT_STYLES, old.bootStyle, 'classic'),
      special: oneOf(SPECIALS.map((s) => s.id), old.special, 'none'),
      starter: typeof old.starter === 'boolean' ? old.starter : i < 5,
    };
    if (!fixedUp.positions?.length) delete fixedUp.positions;
    const player = ensureSkills(fixedUp, ageGroup);
    // Teams saved before the star budget (or moved down an age group) can carry too many stars; trim them so no one is blocked.
    return { ...player, skills: fitSkills(player, ageGroup, !team.career) };
  });
  // A team needs five players and a keeper to take the field: top up a damaged squad rather than lose it.
  while (players.length < 5) players.push(makePlayer(players.some((p) => p.position === 'GK') ? 'ATT' : 'GK', 90 + players.length, `Player ${players.length + 1}`, true, ageGroup));
  team.players = players;
  return team;
}

function readSettings(s: Partial<Settings> | undefined): Settings {
  const d = freshSettings();
  const o = (s && typeof s === 'object' ? s : {}) as Partial<Settings>;
  const bool = (v: unknown, fallback: boolean) => (typeof v === 'boolean' ? v : fallback);
  const vol = (v: unknown, fallback: number) => (typeof v === 'number' && v >= 0 && v <= 1 ? v : fallback);
  // Saves from before the motion choice: a setting that matches the device is "follow the device".
  const motion: MotionChoice = o.motion === 'auto' || o.motion === 'reduce' || o.motion === 'full' ? o.motion
    : typeof o.reduceMotion === 'boolean' && o.reduceMotion !== devicePrefersLess() ? (o.reduceMotion ? 'reduce' : 'full') : 'auto';
  return {
    sound: bool(o.sound, d.sound),
    music: bool(o.music, d.music),
    commentary: bool(o.commentary, d.commentary),
    musicVolume: vol(o.musicVolume, d.musicVolume),
    voiceVolume: vol(o.voiceVolume, d.voiceVolume),
    sfxVolume: vol(o.sfxVolume, d.sfxVolume),
    motion,
    reduceMotion: motionFor(motion),
    halfLengthSeconds: typeof o.halfLengthSeconds === 'number' && o.halfLengthSeconds >= 30 && o.halfLengthSeconds <= 600 ? o.halfLengthSeconds : d.halfLengthSeconds,
    difficulty: oneOf(['easy', 'normal', 'hard'] as const, o.difficulty, d.difficulty),
    // Saves from before the tutorial existed belong to players who already know the controls.
    tutorialDone: bool(o.tutorialDone, true),
    beginnerHelp: bool(o.beginnerHelp, false),
    graphics: oneOf(['auto', 'low', 'medium', 'high'] as const, o.graphics, d.graphics),
  };
}

const motionFor = (m: MotionChoice): boolean => (m === 'auto' ? devicePrefersLess() : m === 'reduce');

function readProgress(p: unknown): Progress | null {
  if (p === undefined) return null;
  if (!p || typeof p !== 'object') return null;
  const o = p as Partial<Progress>;
  const n = (v: unknown) => (typeof v === 'number' && Number.isFinite(v) && v >= 0 ? v : 0);
  const base = freshProgress();
  return {
    played: n(o.played), won: n(o.won), drawn: n(o.drawn), lost: n(o.lost), goalsFor: n(o.goalsFor), goalsAgainst: n(o.goalsAgainst),
    trophies: n(o.trophies), shootoutsWon: n(o.shootoutsWon), trainingBest: n(o.trainingBest),
    agesPlayed: Array.isArray(o.agesPlayed) ? o.agesPlayed.filter((a) => AGE_GROUPS.includes(a)) : base.agesPlayed,
    stickers: Array.isArray(o.stickers) ? o.stickers.filter((s): s is string => typeof s === 'string') : base.stickers,
  };
}

/** A league, career or cup in the save: kept if it still looks like one (with its teams mended), dropped if not. */
function readOptional<T>(v: unknown, check: (x: unknown) => x is T): T | null | 'broken' {
  if (v === undefined || v === null) return null;
  try {
    return check(v) ? v : 'broken';
  } catch {
    return 'broken';
  }
}

const isObj = (v: unknown): v is Record<string, unknown> => !!v && typeof v === 'object' && !Array.isArray(v);
const mendTeams = (list: unknown): boolean => {
  if (!Array.isArray(list)) return false;
  for (let i = 0; i < list.length; i++) list[i] = migrateTeam(list[i]);
  return true;
};

function isLeague(v: unknown): v is LeagueState {
  return isObj(v) && typeof v.teamId === 'string' && typeof v.tier === 'number' && v.tier >= 1 && v.tier <= 5 && Array.isArray(v.rounds) && typeof v.round === 'number' && Array.isArray(v.history) && mendTeams(v.teams);
}
function isCareer(v: unknown): v is CareerState {
  return isObj(v) && typeof v.teamId === 'string' && typeof v.year === 'number' && typeof v.season === 'number' && isLeague(v.league) && isObj(v.seasonStats) && isObj(v.careerStats) && Array.isArray(v.history);
}
function isTournament(v: unknown): v is TournamentState {
  if (!isObj(v) || typeof v.humanTeamId !== 'string' || !Array.isArray(v.semis) || v.semis.length !== 2 || !['semi', 'final', 'done'].includes(v.stage as string)) return false;
  for (const f of [...v.semis, ...(v.final ? [v.final] : [])] as Record<string, unknown>[]) {
    if (!isObj(f)) return false;
    f.home = migrateTeam(f.home);
    f.away = migrateTeam(f.away);
  }
  return true;
}

/** Keep a copy of a save that is about to be replaced (or that could not be read in full). */
function keepBackup(raw: string): void {
  try { localStorage.setItem(BACKUP_KEY, raw); } catch { /* no room: nothing more we can do */ }
}

/** Drop the in-memory copy and read the save again (a fresh page load, or another tab changed it). */
export function reloadSave(): SaveFile {
  cache = null;
  return loadSave();
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
  if (save.tournament?.humanTeamId === id) save.tournament = null;
  persist();
}

export function getSettings(): SaveFile['settings'] {
  return loadSave().settings;
}

export function updateSettings(patch: Partial<Omit<Settings, 'reduceMotion'>>): void {
  const save = loadSave();
  save.settings = { ...save.settings, ...patch };
  save.settings.reduceMotion = motionFor(save.settings.motion);
  persist();
}

/** The device's own reduce-motion setting changed: follow it when the choice is "auto". */
export function refreshMotion(): void {
  const s = loadSave().settings;
  s.reduceMotion = motionFor(s.motion);
}

export function getLeague(): LeagueState | null {
  return loadSave().league ?? null;
}

export function setLeague(league: LeagueState | null): void {
  loadSave().league = league;
  persist();
}

export function getCareer(): CareerState | null {
  return loadSave().career ?? null;
}

export function setCareer(career: CareerState | null): void {
  loadSave().career = career;
  persist();
}

/** The cup in progress (or just finished), so leaving the cup screen never loses a cup run. */
export function getTournament(): TournamentState | null {
  return loadSave().tournament ?? null;
}

export function setTournament(t: TournamentState | null): void {
  loadSave().tournament = t;
  persist();
}

/** A cup that still has matches to play. */
export function cupInProgress(): boolean {
  const t = getTournament();
  return !!t && t.stage !== 'done';
}

export function resetAll(): void {
  // A reset can be undone from the Parents Zone until the next one.
  if (cache) keepBackup(JSON.stringify(cache));
  cache = fresh();
  persist();
}

/** The whole save as a file a grown-up can keep somewhere safe or move to another device. */
export function exportSave(): string {
  return JSON.stringify({ app: 'goal-rush', format: 1, savedAt: new Date().toISOString(), save: loadSave() });
}

/** Load a file made by exportSave (or a bare save). The save it replaces goes to the backup slot. */
export function importSave(textIn: string): { ok: true; teams: number } | { ok: false; reason: string } {
  let data: unknown;
  try { data = JSON.parse(textIn); } catch { return { ok: false, reason: 'That file is not a Goal Rush! save.' }; }
  const inner = isObj(data) && 'save' in data ? data.save : data;
  if (!isObj(inner) || !Array.isArray(inner.teams) || !inner.teams.length) return { ok: false, reason: 'That file is not a Goal Rush! save.' };
  const { save } = readSave(JSON.stringify(inner));
  keepBackup(JSON.stringify(loadSave()));
  cache = save;
  persist();
  return { ok: true, teams: save.teams.length };
}

/** When the last reset, repair or loaded file left an older save in the backup slot. */
export function hasBackup(): boolean {
  try { return localStorage.getItem(BACKUP_KEY) !== null; } catch { return false; }
}

/** Swap the backup in (the current save becomes the backup, so this can be undone too). */
export function restoreBackup(): boolean {
  let raw: string | null = null;
  try { raw = localStorage.getItem(BACKUP_KEY); } catch { return false; }
  if (!raw) return false;
  const { save } = readSave(raw);
  keepBackup(JSON.stringify(loadSave()));
  cache = save;
  persist();
  return true;
}

/**
 * Ask the browser to keep this site's storage when space runs low (Chrome and Firefox honour it;
 * Safari keeps data for games added to the Home Screen). Resolves to whether storage is now kept.
 */
export async function requestPersistentStorage(): Promise<boolean> {
  try {
    if (typeof navigator === 'undefined' || !navigator.storage?.persist) return false;
    if (await navigator.storage.persisted()) return true;
    return await navigator.storage.persist();
  } catch {
    return false;
  }
}
