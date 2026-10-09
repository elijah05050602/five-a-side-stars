import { awayKitFor, makeBadge, makeKit, makePlayer, shortCode, starterTeams, uid } from './defaults';
import type { LeagueFixture, LeagueState, Tally } from '../game/league';
import { defaultStar, worldForOldCareer, type CareerState, type TrialDay } from '../game/career';
import { TIER_COUNT, freshRecord, type CareerWorld, type ClubRecord, type HeadToHead, type Playoff, type TierSeason, type WorldClub, type WorldNews } from '../game/careerWorld';
import type { TournamentState } from '../game/tournament';
import { ensureSkills, fitSkills } from './skills';
import { freshProgress, type Progress } from './progress';
import { AGE_GROUPS, BADGE_SHAPES, BOOT_STYLES, BUILDS, HAIR_STYLES, KIT_PATTERNS, POSITIONS, SPECIALS, type AgeGroup, type Kit, type Player, type Position, type Team } from './types';
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
  /** Super skills: on with their cutscenes, on without them, or off. */
  supers: SuperChoice;
}

export type SuperChoice = 'full' | 'quick' | 'off';

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
  return { sound: true, music: true, commentary: true, musicVolume: 0.7, voiceVolume: 1, sfxVolume: 1, reduceMotion: devicePrefersLess(), motion: 'auto', halfLengthSeconds: 120, difficulty: 'normal', tutorialDone: false, graphics: 'auto', beginnerHelp: false, supers: 'full' };
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
  if (career && career !== 'broken') { mendStar(career, teams); mendWorld(career, teams); }
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
      gender: old.gender === 'boy' || old.gender === 'girl' ? old.gender : undefined,
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
    supers: oneOf(['full', 'quick', 'off'] as const, o.supers, d.supers),
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
    // Counts on stickers won again (added with tier titles): an older save starts them now.
    counts: o.counts && typeof o.counts === 'object' && !Array.isArray(o.counts)
      ? Object.fromEntries(Object.entries(o.counts).filter(([, v]) => typeof v === 'number' && Number.isFinite(v) && v > 0).map(([k, v]) => [k, Math.floor(v)]))
      : {},
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
  if (!(isObj(v) && typeof v.teamId === 'string' && typeof v.tier === 'number' && v.tier >= 1 && v.tier <= 5 && Array.isArray(v.rounds) && typeof v.round === 'number' && Array.isArray(v.history) && mendTeams(v.teams))) return false;
  // Stats pages (added with the living league): a league saved before them starts its tally now.
  v.tally = readTallies(v.tally);
  return true;
}

const count = (v: unknown): number => (typeof v === 'number' && Number.isFinite(v) && v >= 0 ? Math.floor(v) : 0);

/** Everyone's goals, saves and awards; a row that cannot be read is left out. */
function readTallies(v: unknown): Record<string, Tally> {
  const out: Record<string, Tally> = {};
  if (!isObj(v)) return out;
  for (const [id, t] of Object.entries(v)) {
    if (!isObj(t) || typeof t.club !== 'string' || typeof t.name !== 'string' || !isNameOk(t.name)) continue;
    out[id] = { club: t.club, name: t.name, gk: t.gk === true, p: count(t.p), g: count(t.g), a: count(t.a), sv: count(t.sv), cs: count(t.cs), motm: count(t.motm) };
  }
  return out;
}

function readRecord(v: unknown): ClubRecord {
  if (!isObj(v)) return freshRecord();
  const big = Array.isArray(v.big) && v.big.length === 3 && typeof v.big[2] === 'string' ? [count(v.big[0]), count(v.big[1]), v.big[2]] as [number, number, string] : null;
  return { p: count(v.p), w: count(v.w), d: count(v.d), l: count(v.l), gf: count(v.gf), ga: count(v.ga), big, run: count(v.run), bestRun: count(v.bestRun), form: typeof v.form === 'string' ? v.form.replace(/[^WDL]/g, '').slice(-5) : '' };
}

const isScore = (v: unknown): v is [number, number] => Array.isArray(v) && v.length === 2 && v.every((x) => Number.isInteger(x) && x >= 0);
const isFixture = (f: unknown): f is LeagueFixture => isObj(f) && typeof f.homeId === 'string' && typeof f.awayId === 'string' && (f.score === null || isScore(f.score));

/**
 * The career's world (added with the living league), checked piece by piece. Anything that does
 * not add up (a club in two tiers, a missing tier, your team in none) means a fresh world built
 * around the career's current league, so the career itself is never lost.
 */
function readWorld(v: unknown, youId: string): CareerWorld | null {
  if (!isObj(v) || !Array.isArray(v.clubs) || !Array.isArray(v.tiers) || v.tiers.length !== TIER_COUNT) return null;
  const clubs: WorldClub[] = v.clubs.map((c: unknown) => {
    if (!isObj(c) || !Number.isInteger(c.tier) || typeof c.strength !== 'number' || !Number.isFinite(c.strength)) throw new Error('bad club');
    const team = migrateTeam(c.team);
    const past = Array.isArray(c.past) ? c.past.filter((x): x is [number, number, number] => Array.isArray(x) && x.length === 3 && x.every((n) => Number.isInteger(n))) : [];
    return {
      team, tier: c.tier as number, strength: Math.min(1.4, Math.max(0.6, c.strength)),
      starId: typeof c.starId === 'string' && team.players.some((p) => p.id === c.starId) ? c.starId : team.players[0]?.id ?? '',
      lastRest: typeof c.lastRest === 'number' ? c.lastRest : -1, rec: readRecord(c.rec), past,
    };
  });
  const ids = new Set(clubs.map((c) => c.team.id));
  const seen = new Set<string>();
  const tiers: TierSeason[] = v.tiers.map((t: unknown, i: number) => {
    if (!isObj(t) || t.tier !== i + 1 || !Array.isArray(t.members) || !Array.isArray(t.rounds)) throw new Error('bad tier');
    const members = t.members.filter((m): m is string => typeof m === 'string');
    for (const m of members) {
      if (seen.has(m) || (m !== youId && !ids.has(m))) throw new Error('bad member');
      seen.add(m);
    }
    if (!t.rounds.every((r) => Array.isArray(r) && r.every(isFixture))) throw new Error('bad rounds');
    return { tier: i + 1, members, resting: typeof t.resting === 'string' && members.includes(t.resting) ? t.resting : null, rounds: t.rounds as LeagueFixture[][] };
  });
  if (!seen.has(youId) || seen.size !== ids.size + 1) return null;
  for (const c of clubs) c.tier = tiers.find((t) => t.members.includes(c.team.id))!.tier;
  const h2h: Record<string, HeadToHead> = {};
  if (isObj(v.h2h)) for (const [id, r] of Object.entries(v.h2h)) if (isObj(r)) h2h[id] = { w: count(r.w), d: count(r.d), l: count(r.l), gf: count(r.gf), ga: count(r.ga) };
  const po = v.playoff;
  const playoff: Playoff | null = isObj(po) && typeof po.opponentId === 'string' && ids.has(po.opponentId) && isScore(po.score)
    ? { opponentId: po.opponentId, up: po.up === true, score: po.score, pens: isScore(po.pens) ? po.pens : null, won: typeof po.won === 'boolean' ? po.won : null }
    : null;
  const news: WorldNews[] = Array.isArray(v.news) ? v.news.filter((x): x is WorldNews => isObj(x) && typeof x.at === 'number' && typeof x.emoji === 'string' && typeof x.text === 'string') : [];
  const ladder = Array.isArray(v.ladder) && v.ladder.length === TIER_COUNT && v.ladder.every((t) => Array.isArray(t) && t.every((x) => typeof x === 'string')) ? v.ladder as string[][] : null;
  const titles = Array.isArray(v.tierTitles) && v.tierTitles.length === TIER_COUNT ? v.tierTitles.map(count) : [0, 0, 0, 0, 0];
  return {
    clubs, tiers,
    rivalId: typeof v.rivalId === 'string' && ids.has(v.rivalId) ? v.rivalId : clubs[0]?.team.id ?? '',
    rivalFar: count(v.rivalFar), rivalWins: count(v.rivalWins), h2h, you: readRecord(v.you), tally: readTallies(v.tally), playoff, news, ladder,
    tierTitles: titles, titleAges: Array.isArray(v.titleAges) ? v.titleAges.filter((a): a is AgeGroup => AGE_GROUPS.includes(a as AgeGroup)) : [],
  };
}

/** A career saved before the living league (or with a world that cannot be read) gets one built on load, keeping the clubs it is playing now. */
function mendWorld(c: CareerState, teams: Team[]): void {
  const team = teams.find((t) => t.id === c.teamId);
  let world: CareerWorld | null = null;
  try { world = readWorld((c as Partial<CareerState>).world, c.teamId); } catch { world = null; }
  if (world && world.tiers[c.league.tier - 1].members.includes(c.teamId)) { c.world = world; return; }
  if (team) c.world = worldForOldCareer(c, team);
}
function isCareer(v: unknown): v is CareerState {
  return isObj(v) && typeof v.teamId === 'string' && typeof v.year === 'number' && typeof v.season === 'number' && isLeague(v.league) && isObj(v.seasonStats) && isObj(v.careerStats) && Array.isArray(v.history);
}
/**
 * Star fields (added with Your Star): a career saved before them, or with a Star who has
 * left the squad, gets the best player so far and a prompt to pick.
 */
function mendStar(c: CareerState, teams: Team[]): void {
  const raw = c as Partial<CareerState>;
  const team = teams.find((t) => t.id === c.teamId);
  const valid = typeof raw.starId === 'string' && !!team?.players.some((p) => p.id === raw.starId);
  if (!valid) {
    c.starId = team ? defaultStar(team, c.careerStats) : '';
    c.starPicked = false;
  } else c.starPicked = raw.starPicked === true;
  c.trainingPoints = typeof raw.trainingPoints === 'number' && Number.isFinite(raw.trainingPoints) && raw.trainingPoints >= 0 ? Math.floor(raw.trainingPoints) : 0;
  c.milestones = Array.isArray(raw.milestones) ? raw.milestones.filter((m): m is string => typeof m === 'string') : [];
  c.trialDay = readTrialDay(raw.trialDay, team?.ageGroup ?? 'U5');
}

/** A Trial Day in progress, or null if there is none or it cannot be read (the squad is whole either way). */
function readTrialDay(v: unknown, age: AgeGroup): TrialDay | null {
  if (!isObj(v) || !Array.isArray(v.left) || !Array.isArray(v.openSpots) || !Array.isArray(v.players) || v.players.length === 0) return null;
  const isPlayer = (p: unknown): p is Player => isObj(p) && typeof p.id === 'string' && typeof p.name === 'string' && isNameOk(p.name)
    && POSITIONS.includes(p.position as Position) && Number.isInteger(p.number) && isObj(p.skills);
  if (!v.players.every(isPlayer)) return null;
  const left = v.left.filter((l): l is TrialDay['left'][number] => isObj(l) && typeof l.name === 'string' && Number.isInteger(l.number) && POSITIONS.includes(l.position as Position));
  return {
    left,
    openSpots: v.openSpots.filter((x): x is Position => POSITIONS.includes(x as Position)),
    players: v.players.map((p) => ensureSkills({ ...p, starter: false }, age)),
  };
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
