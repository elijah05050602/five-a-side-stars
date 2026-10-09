import { FIRST_NAMES, generateOpponent, makePlayer, pick, uid } from '../data/defaults';
import { CLUB_NAME, davaoStrikersTeam } from '../data/club';
import { STAR_CAP, randomSkills, skillKeys } from '../data/skills';
import type { AgeGroup, Player, Position, Team } from '../data/types';
import type { SimLine } from './background';
import { TEAMS_PER_LEAGUE, roundRobin, tallyMatch, tierInfo, type LeagueFixture, type Tally } from './league';

/**
 * The career's world: 30 computer clubs that stay for the whole career. They sit in the five
 * tiers (six places each, so one tier has a seventh club and one club there rests each mini
 * season), go up and down among themselves, and grow up a year with you. Only your own tier is
 * played as real matches; the other four are worked out at once from each club's strength and a
 * bit of luck, so phones never wait for them.
 */
export const WORLD_CLUBS = 30;
export const TIER_COUNT = 5;

/** A club's whole-career record. */
export interface ClubRecord {
  p: number; w: number; d: number; l: number; gf: number; ga: number;
  /** Biggest win: goals for, goals against, and who it was against. */
  big: [number, number, string] | null;
  /** Wins in a row now, and the most in a row ever. */
  run: number;
  bestRun: number;
  /** The last five results, oldest first: W, D or L. */
  form: string;
}

export interface WorldClub {
  team: Team;
  tier: number;
  /** How good the club tends to be, around 1 (0.6 to 1.4). Hidden from the player. */
  strength: number;
  /** The club's player to watch, by player id. They stay at the club and grow each year. */
  starId: string;
  /** The mini season (see seasonIndex) the club last sat out, or -1. */
  lastRest: number;
  rec: ClubRecord;
  /** One line per past mini season: [season index, tier, final position], position 0 for a rest. */
  past: [number, number, number][];
}

/** One tier's mini season. */
export interface TierSeason {
  tier: number;
  /** Every club in the tier (your team too, where you are), including any club resting. */
  members: string[];
  resting: string | null;
  /** The fixtures, for the tiers other than yours (yours are the career's league). */
  rounds: LeagueFixture[][];
}

/** Your record against one club. */
export interface HeadToHead { w: number; d: number; l: number; gf: number; ga: number }

/** Your play-off this mini season, once it has been played (scores are yours first). */
export interface Playoff {
  opponentId: string;
  /** True when you are playing to go up, false when playing to stay up. */
  up: boolean;
  score: [number, number];
  pens: [number, number] | null;
  /** Null while a draw waits for its shoot-out. */
  won: boolean | null;
}

export interface WorldNews { at: number; emoji: string; text: string }

export interface CareerWorld {
  clubs: WorldClub[];
  /** Index 0 is Tier 1. */
  tiers: TierSeason[];
  rivalId: string;
  /** Mini seasons in a row the rival has been two or more tiers away. */
  rivalFar: number;
  /** Wins over your rival (whoever it was at the time). */
  rivalWins: number;
  h2h: Record<string, HeadToHead>;
  you: ClubRecord;
  /** Every player's numbers over the whole career, in every tier. */
  tally: Record<string, Tally>;
  playoff: Playoff | null;
  /** Newest last; the oldest drop off. */
  news: WorldNews[];
  /** The final order of every tier at the end of the last mini season, before anyone moved. */
  ladder: string[][] | null;
  /** League titles won in each tier this career (index 0 is Tier 1). */
  tierTitles: number[];
  /** The age groups you won a title in. */
  titleAges: AgeGroup[];
}

const NEWS_KEEP = 60;
const PAST_KEEP = 24;

export const freshRecord = (): ClubRecord => ({ p: 0, w: 0, d: 0, l: 0, gf: 0, ga: 0, big: null, run: 0, bestRun: 0, form: '' });

/** The mini season count from the start of the career: 1 for U5 Autumn, 24 for U10 Summer. */
export const seasonIndex = (year: number, season: number): number => (year - 1) * 4 + season;

const rand = (a: number, b: number) => a + Math.random() * (b - a);
const clamp = (v: number, a: number, b: number) => Math.max(a, Math.min(b, v));
const shuffle = <T>(list: T[]): T[] => {
  const out = [...list];
  for (let i = out.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [out[i], out[j]] = [out[j], out[i]]; }
  return out;
};

export const clubById = (w: CareerWorld, id: string): WorldClub | undefined => w.clubs.find((c) => c.team.id === id);
export const tierOf = (w: CareerWorld, id: string): number => (w.tiers.find((t) => t.members.includes(id))?.tier ?? TIER_COUNT);
const tierSeason = (w: CareerWorld, tier: number): TierSeason => w.tiers[tier - 1];
/** The clubs playing in a tier this mini season (everyone but the one resting). */
export const activeIds = (t: TierSeason): string[] => t.members.filter((id) => id !== t.resting);

/** The club's best outfield player by stars: their player to watch. */
function bestPlayer(team: Team): Player {
  const total = (p: Player) => skillKeys(p.position).reduce((n, k) => n + p.skills[k], 0) + (p.position === 'ATT' ? 1 : 0);
  return [...team.players].filter((p) => p.position !== 'GK').sort((a, b) => total(b) - total(a))[0] ?? team.players[0];
}

/**
 * Ratings for a club's squad at an age: the usual roll for the age group, then a strong club's
 * players get a star here and there and a weak club's lose one, so strength shows on the pitch
 * without moving the age group's balance much.
 */
function rollSquad(team: Team, age: AgeGroup, strength: number): void {
  const cap = STAR_CAP[age];
  for (const p of team.players) {
    p.skills = randomSkills(p.position, age);
    const keys = skillKeys(p.position);
    if (strength > 1.08 && Math.random() < (strength - 1) * 2.5) {
      const room = keys.filter((k) => p.skills[k] < cap);
      if (room.length) p.skills[pick(room)]++;
    } else if (strength < 0.92 && Math.random() < (1 - strength) * 2.5) {
      const spare = keys.filter((k) => p.skills[k] > 1);
      if (spare.length) p.skills[pick(spare)]--;
    }
  }
}

/** The player to watch grows like yours do: at least as good as last year, and a star or two better. */
function growStar(p: Player, before: Player['skills'], age: AgeGroup): void {
  const cap = STAR_CAP[age];
  const keys = skillKeys(p.position);
  for (const k of keys) p.skills[k] = Math.min(cap, Math.max(p.skills[k], before[k]));
  for (let i = 0; i < 2; i++) {
    const room = keys.filter((k) => p.skills[k] < cap);
    if (room.length) p.skills[pick(room)]++;
  }
}

function newClub(team: Team, tier: number, strength: number): WorldClub {
  return { team, tier, strength, starId: bestPlayer(team).id, lastRest: -1, rec: freshRecord(), past: [] };
}

/** Davao Strikers as one of the world's clubs (when you are not playing as them): their kids, at your age. */
function davaoClub(age: AgeGroup): Team {
  const t = davaoStrikersTeam();
  t.id = `world-${uid()}`;
  t.ageGroup = age;
  // The crest stays on the club page; in the world they wear their fox badge, which keeps the save small.
  delete t.badge.image;
  delete t.clubVersion;
  for (const p of t.players) p.id = uid();
  return t;
}

/**
 * Make the world for a career. `you` start in `yourTier`; `keep` are clubs already in your tier
 * (an old career's current opponents), which stay there.
 */
export function buildWorld(you: Team, yourTier = TIER_COUNT, keep: Team[] = []): CareerWorld {
  const age = you.ageGroup;
  const names = new Set([you.name, ...keep.map((t) => t.name)]);
  const teams: Team[] = [];
  if (you.name !== CLUB_NAME && !names.has(CLUB_NAME)) { teams.push(davaoClub(age)); names.add(CLUB_NAME); }
  let guard = 0;
  while (teams.length + keep.length < WORLD_CLUBS && guard++ < 2000) {
    const t = generateOpponent(age, you.kit);
    if (names.has(t.name)) continue;
    names.add(t.name);
    teams.push(t);
  }
  // Strengths, strongest first, dealt six to a tier from the top, with a little shuffle across each line.
  const strengths = Array.from({ length: WORLD_CLUBS }, () => rand(0.72, 1.28)).sort((a, b) => b - a);
  const bands: number[][] = Array.from({ length: TIER_COUNT }, (_, i) => strengths.slice(i * 6, i * 6 + 6));
  for (let i = 0; i < TIER_COUNT - 1; i++) {
    if (Math.random() < 0.7) {
      const a = Math.floor(Math.random() * 6), b = Math.floor(Math.random() * 6);
      [bands[i][a], bands[i + 1][b]] = [bands[i + 1][b], bands[i][a]];
    }
  }
  const clubs: WorldClub[] = [];
  const pool = shuffle(teams);
  bands.forEach((band, i) => {
    const tier = i + 1;
    band.forEach((s, j) => {
      const team = tier === yourTier && j < keep.length ? keep[j] : pool.pop();
      if (!team) return;
      if (!(tier === yourTier && j < keep.length)) rollSquad(team, age, s);
      clubs.push(newClub(team, tier, s));
    });
  });
  const tiers: TierSeason[] = Array.from({ length: TIER_COUNT }, (_, i) => ({
    tier: i + 1,
    members: [...clubs.filter((c) => c.tier === i + 1).map((c) => c.team.id), ...(i + 1 === yourTier ? [you.id] : [])],
    resting: null,
    rounds: [],
  }));
  const world: CareerWorld = {
    clubs, tiers, rivalId: '', rivalFar: 0, rivalWins: 0, h2h: {}, you: freshRecord(), tally: {}, playoff: null, news: [], ladder: null,
    tierTitles: [0, 0, 0, 0, 0], titleAges: [],
  };
  world.rivalId = pickRival(world, yourTier)?.team.id ?? '';
  return world;
}

/** A rival near your level: from your tier and the one above, the club closest to an ordinary strength. */
function pickRival(w: CareerWorld, yourTier: number): WorldClub | undefined {
  const near = w.clubs.filter((c) => c.tier === yourTier || c.tier === yourTier - 1 || (yourTier === 1 && c.tier === 2));
  return [...near].sort((a, b) => Math.abs(a.strength - 1) - Math.abs(b.strength - 1))[0];
}

export function addNews(w: CareerWorld, at: number, emoji: string, text: string): void {
  w.news.push({ at, emoji, text });
  if (w.news.length > NEWS_KEEP) w.news.splice(0, w.news.length - NEWS_KEEP);
}

/**
 * Start a mini season in every tier: a tier with a seventh club rests the one that rested
 * longest ago (never you), and the tiers other than yours get their fixtures. Returns the clubs
 * in your tier who play this time.
 */
export function startSeasons(w: CareerWorld, youId: string, si: number): Team[] {
  const yourTier = tierOf(w, youId);
  for (const t of w.tiers) {
    t.resting = null;
    if (t.members.length > TEAMS_PER_LEAGUE) {
      const cpu = shuffle(t.members.filter((id) => id !== youId)).sort((a, b) => (clubById(w, a)?.lastRest ?? -1) - (clubById(w, b)?.lastRest ?? -1));
      t.resting = cpu[0];
      const club = clubById(w, t.resting);
      if (club) {
        club.lastRest = si;
        if (t.tier === yourTier) addNews(w, si, '😴', `${club.team.name} are having a rest this season.`);
      }
    }
    t.rounds = t.tier === yourTier ? [] : roundRobin(shuffle(activeIds(t)));
  }
  w.playoff = null;
  return activeIds(tierSeason(w, yourTier)).filter((id) => id !== youId).map((id) => clubById(w, id)!.team);
}

/** Add a result to a club record. */
function addResult(rec: ClubRecord, gf: number, ga: number, against: string): void {
  rec.p++; rec.gf += gf; rec.ga += ga;
  const res = gf > ga ? 'W' : gf < ga ? 'L' : 'D';
  if (res === 'W') { rec.w++; rec.run++; rec.bestRun = Math.max(rec.bestRun, rec.run); } else { rec.run = 0; if (res === 'D') rec.d++; else rec.l++; }
  if (gf > ga && (!rec.big || gf - ga > rec.big[0] - rec.big[1] || (gf - ga === rec.big[0] - rec.big[1] && gf > rec.big[0]))) rec.big = [gf, ga, against];
  rec.form = (rec.form + res).slice(-5);
}

/** Record one played fixture in the clubs' records (and yours, and your head-to-head). */
export function recordFixture(w: CareerWorld, youId: string, homeId: string, awayId: string, score: [number, number]): void {
  const name = (id: string) => (id === youId ? 'you' : clubById(w, id)?.team.name ?? '');
  const recOf = (id: string) => (id === youId ? w.you : clubById(w, id)?.rec);
  const h = recOf(homeId), a = recOf(awayId);
  if (h) addResult(h, score[0], score[1], name(awayId));
  if (a) addResult(a, score[1], score[0], name(homeId));
  const other = homeId === youId ? awayId : awayId === youId ? homeId : null;
  if (other) {
    const [gf, ga] = homeId === youId ? score : [score[1], score[0]];
    const r = w.h2h[other] ??= { w: 0, d: 0, l: 0, gf: 0, ga: 0 };
    r.gf += gf; r.ga += ga;
    if (gf > ga) r.w++; else if (gf < ga) r.l++; else r.d++;
  }
}

/** Poisson draw, for goals and saves. */
function poisson(mean: number): number {
  const l = Math.exp(-mean);
  let k = 0, p = 1;
  do { k++; p *= Math.random(); } while (p > l && k < 12);
  return k - 1;
}

/** Share out a side's goals (and assists) among its players, weighted by their shooting. */
function shareGoals(team: Team, goals: number, conceded: number, lines: Record<string, SimLine>): void {
  const line = team.players.filter((p) => p.starter);
  const five = line.length ? line : team.players.slice(0, 5);
  for (const p of five) lines[p.id] = { g: 0, a: 0, sv: 0 };
  const outfield = five.filter((p) => p.position !== 'GK');
  const weight = (p: Player) => p.skills.shooting ** 2 + (p.position === 'ATT' ? 2 : p.position === 'WING' ? 1 : 0);
  const total = outfield.reduce((n, p) => n + weight(p), 0);
  const draw = (not?: Player): Player | undefined => {
    const list = not ? outfield.filter((p) => p !== not) : outfield;
    let r = Math.random() * list.reduce((n, p) => n + weight(p), 0);
    for (const p of list) { r -= weight(p); if (r <= 0) return p; }
    return list[list.length - 1];
  };
  for (let i = 0; i < goals && total > 0; i++) {
    const scorer = draw()!;
    lines[scorer.id].g++;
    if (Math.random() < 0.55) { const helper = draw(scorer); if (helper) lines[helper.id].a++; }
  }
  const keeper = five.find((p) => p.position === 'GK');
  if (keeper) lines[keeper.id].sv = poisson(1.4 + conceded * 0.4);
}

/** A match between two clubs worked out at once: goals from their strength and some luck. */
export function quickMatch(home: WorldClub, away: WorldClub): { score: [number, number]; lines: Record<string, SimLine> } {
  const ratio = home.strength / away.strength;
  const score: [number, number] = [poisson(1.55 * ratio ** 1.6), poisson(1.35 / ratio ** 1.6)];
  const lines: Record<string, SimLine> = {};
  shareGoals(home.team, score[0], score[1], lines);
  shareGoals(away.team, score[1], score[0], lines);
  return { score, lines };
}

/** Play round `index` of every tier other than yours, at once. */
export function playOtherTiers(w: CareerWorld, youId: string, index: number): void {
  const yours = tierOf(w, youId);
  for (const t of w.tiers) {
    if (t.tier === yours) continue;
    for (const f of t.rounds[index] ?? []) {
      if (f.score) continue;
      const h = clubById(w, f.homeId), a = clubById(w, f.awayId);
      if (!h || !a) continue;
      const m = quickMatch(h, a);
      f.score = m.score;
      tallyMatch([w.tally], h.team, a.team, m.score, m.lines);
      recordFixture(w, youId, f.homeId, f.awayId, m.score);
    }
  }
}

/** A tier's table from its fixtures, as club ids in order: points, goal difference, goals, then name. */
export function tierTable(w: CareerWorld, ids: string[], rounds: LeagueFixture[][], youName = ''): { id: string; pts: number; gd: number; gf: number; played: number }[] {
  const rows = new Map(ids.map((id) => [id, { id, pts: 0, gd: 0, gf: 0, played: 0 }]));
  for (const round of rounds) for (const f of round) {
    if (!f.score) continue;
    const h = rows.get(f.homeId), a = rows.get(f.awayId);
    if (!h || !a) continue;
    const [hs, as] = f.score;
    h.played++; a.played++; h.gf += hs; a.gf += as; h.gd += hs - as; a.gd += as - hs;
    if (hs > as) h.pts += 3; else if (hs < as) a.pts += 3; else { h.pts++; a.pts++; }
  }
  const name = (id: string) => clubById(w, id)?.team.name ?? youName;
  return [...rows.values()].sort((x, y) => y.pts - x.pts || y.gd - x.gd || y.gf - x.gf || name(x.id).localeCompare(name(y.id)));
}

/** The strength nudge on your opponent's computer level: a strong club in form plays a touch better (at most ±0.1). */
export function opponentNudge(w: CareerWorld, clubId: string): number {
  const c = clubById(w, clubId);
  if (!c) return 0;
  const form = [...c.rec.form].reduce((n, r) => n + (r === 'W' ? 1 : r === 'L' ? -1 : 0), 0);
  return clamp((c.strength - 1) * 0.25 + form * 0.01, -0.1, 0.1);
}

/** The play-off you are in once the mini season's matches are done, or null: 2nd plays the tier above's 5th, 5th plays the tier below's 2nd. */
export function playoffFor(w: CareerWorld, yourTier: number, position: number, tables: string[][]): { opponent: WorldClub; up: boolean; cpuLevel: number } | null {
  const level = (a: number, b: number) => (tierInfo(a).level + tierInfo(b).level) / 2;
  if (position === 2 && yourTier > 1) {
    const opponent = clubById(w, tables[yourTier - 2][4]);
    return opponent ? { opponent, up: true, cpuLevel: level(yourTier, yourTier - 1) + opponentNudge(w, opponent.team.id) } : null;
  }
  if (position === 5 && yourTier < TIER_COUNT) {
    const opponent = clubById(w, tables[yourTier][1]);
    return opponent ? { opponent, up: false, cpuLevel: level(yourTier, yourTier + 1) + opponentNudge(w, opponent.team.id) } : null;
  }
  return null;
}

/** Every tier's final order this mini season (club ids, the resting club left out); your tier's comes from `yourTable`. */
export function allTables(w: CareerWorld, youId: string, yourTable: string[], youName: string): string[][] {
  const yours = tierOf(w, youId);
  return w.tiers.map((t) => (t.tier === yours ? yourTable : tierTable(w, activeIds(t), t.rounds, youName).map((r) => r.id)));
}

export interface WorldSeasonEnd {
  /** Where you go next. */
  tier: number;
  /** Your play-off, if you were in one. */
  playoff: 'won' | 'lost' | null;
}

/**
 * Close a mini season in every tier. Between each pair of tiers the champions go up, the bottom
 * club goes down, and the 2nd club below plays the 5th club above (yours was played for real; the
 * rest are worked out here, a draw going to whoever has more strength). Saves each club's line in
 * its history and the news. Does not start the next mini season.
 */
export function endSeasons(w: CareerWorld, youId: string, youName: string, yourTable: string[], si: number): WorldSeasonEnd {
  const tables = allTables(w, youId, yourTable, youName);
  w.ladder = tables;
  const yourTier = tierOf(w, youId);
  const name = (id: string) => (id === youId ? youName : clubById(w, id)?.team.name ?? '');
  const move = new Map<string, number>();
  let playoff: WorldSeasonEnd['playoff'] = null;
  for (let above = 1; above < TIER_COUNT; above++) {
    const top = tables[above - 1], below = tables[above];
    const champ = below[0], bottom = top[top.length - 1];
    if (champ) { move.set(champ, above); addNews(w, si, '⬆️', `${name(champ)} won the ${tierInfo(above + 1).name} and go up!`); }
    if (bottom) { move.set(bottom, above + 1); addNews(w, si, '⬇️', `${name(bottom)} go down to the ${tierInfo(above + 1).name}.`); }
    const low = below[1], high = top[4];
    if (!low || !high) continue;
    let lowWins: boolean;
    if (low === youId || high === youId) {
      const won = w.playoff?.won === true;
      lowWins = low === youId ? won : !won;
      playoff = won ? 'won' : 'lost';
    } else {
      const lc = clubById(w, low)!, hc = clubById(w, high)!;
      const m = quickMatch(lc, hc);
      lowWins = m.score[0] !== m.score[1] ? m.score[0] > m.score[1] : lc.strength > hc.strength;
    }
    if (lowWins) {
      move.set(low, above); move.set(high, above + 1);
      addNews(w, si, '🎟️', `${name(low)} won the play-off against ${name(high)} and go up to the ${tierInfo(above).name}!`);
    } else addNews(w, si, '🛟', `${name(high)} beat ${name(low)} in the play-off and stay in the ${tierInfo(above).name}.`);
  }
  // Each club's line in its history, then the moves.
  for (const club of w.clubs) {
    const t = tables[club.tier - 1];
    const pos = t.indexOf(club.team.id) + 1;
    club.past.push([si, club.tier, pos]);
    if (club.past.length > PAST_KEEP) club.past.shift();
  }
  for (const [id, tier] of move) {
    const from = w.tiers.find((t) => t.members.includes(id));
    if (!from || from.tier === tier) continue;
    from.members = from.members.filter((x) => x !== id);
    w.tiers[tier - 1].members.push(id);
    const club = clubById(w, id);
    if (club) club.tier = tier;
  }
  const yourPos = tables[yourTier - 1].indexOf(youId) + 1;
  if (yourPos === 1) {
    w.tierTitles[yourTier - 1]++;
  }
  return { tier: tierOf(w, youId), playoff };
}

/** Keep the rival near you: one who has been two or more tiers away for a whole year is replaced by the club you have had the closest matches with. */
export function checkRival(w: CareerWorld, youId: string, si: number, yearEnd: boolean): void {
  const yours = tierOf(w, youId);
  const rival = clubById(w, w.rivalId);
  w.rivalFar = rival && Math.abs(rival.tier - yours) >= 2 ? w.rivalFar + 1 : 0;
  if (rival && !(yearEnd && w.rivalFar >= 4)) return;
  const near = w.clubs.filter((c) => Math.abs(c.tier - yours) <= 1 && c !== rival);
  const closeness = (c: WorldClub) => {
    const r = w.h2h[c.team.id];
    const games = r ? r.w + r.d + r.l : 0;
    return games ? Math.abs(r!.gf - r!.ga) / games - games * 0.1 : 99 + Math.abs(c.strength - 1);
  };
  const next = [...near].sort((a, b) => closeness(a) - closeness(b))[0];
  if (!next) return;
  w.rivalId = next.team.id;
  w.rivalFar = 0;
  addNews(w, si, '🔥', `${next.team.name} are your new rivals!`);
}

/**
 * Every club's summer when the career moves up an age group: one or two players move on and new
 * ones sign, the squad's ratings are rolled again for the new age, the strength drifts a little,
 * and the player to watch stays and grows.
 */
export function ageUpWorld(w: CareerWorld, age: AgeGroup, si: number): void {
  for (const club of w.clubs) {
    const team = club.team;
    team.ageGroup = age;
    club.strength = clamp(club.strength * rand(0.9, 1.1), 0.6, 1.4);
    const star = team.players.find((p) => p.id === club.starId);
    const before = star ? { ...star.skills } : null;
    const keepers = team.players.filter((p) => p.position === 'GK').length;
    const count = 1 + (Math.random() < 0.4 ? 1 : 0);
    const leavers = shuffle(team.players.filter((p) => p.id !== club.starId && !(p.position === 'GK' && keepers <= 1))).slice(0, count);
    const used = new Set(team.players.map((p) => p.name));
    const signed: string[] = [];
    for (const old of leavers) {
      const names = FIRST_NAMES.filter((n) => !used.has(n));
      const nm = names.length ? pick(names) : pick(FIRST_NAMES);
      used.add(nm);
      const p = makePlayer(old.position as Position, old.number, nm, old.starter, age);
      team.players[team.players.indexOf(old)] = p;
      signed.push(nm);
    }
    rollSquad(team, age, club.strength);
    const s = team.players.find((p) => p.id === club.starId);
    if (s && before) growStar(s, before, age);
    else club.starId = bestPlayer(team).id;
    if (signed.length && (club.tier <= 2 || club.team.id === w.rivalId)) addNews(w, si, '✍️', `${team.name} signed ${signed.join(' and ')}.`);
  }
}
