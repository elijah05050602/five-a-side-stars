import { generateOpponent } from '../data/defaults';
import type { Team } from '../data/types';
import { playOut, type SimJob, type SimLine, type SimOutcome } from './background';
import type { MatchResult } from './MatchScene';

export interface LeagueTier {
  tier: 1 | 2 | 3 | 4 | 5;
  name: string;
  /** Computer strength passed to the simulation (0 = a touch below Easy, 1 = a touch above Hard). */
  level: number;
  blurb: string;
}

/** Tier 5 is where everyone starts; Tier 1 is the top. */
export const TIERS: LeagueTier[] = [
  { tier: 5, name: 'Acorn League', level: -0.1, blurb: 'Where every star starts. Friendly teams and plenty of space.' },
  { tier: 4, name: 'Puddle League', level: 0.2, blurb: 'A bit quicker, a bit braver. Watch out for the tackles.' },
  { tier: 3, name: 'Thunder League', level: 0.45, blurb: 'Proper teams now. They pass, they press, they shoot.' },
  { tier: 2, name: 'Lightning League', level: 0.7, blurb: 'Fast, sharp and clever. Only the best climb out of here.' },
  { tier: 1, name: 'Star Premier League', level: 1.05, blurb: 'The very top. Win this and you are a legend.' },
];

export const tierInfo = (tier: number): LeagueTier => TIERS.find((t) => t.tier === tier) ?? TIERS[0];

export const TEAMS_PER_LEAGUE = 6;
export const PROMOTED = 2;
export const RELEGATED = 1;

export interface LeagueFixture {
  homeId: string;
  awayId: string;
  score: [number, number] | null;
}

export interface SeasonRecord {
  season: number;
  tier: number;
  position: number;
  outcome: 'champion' | 'promoted' | 'stayed' | 'relegated';
}

export interface LeagueState {
  teamId: string;
  tier: number;
  season: number;
  halfSeconds: number;
  /** The five computer teams in this season's league. */
  teams: Team[];
  /** Five rounds of three fixtures: everyone plays everyone once. */
  rounds: LeagueFixture[][];
  /** Index of the next round to play. */
  round: number;
  history: SeasonRecord[];
  bestTier: number;
  /** Everyone's goals, saves and awards this season, by player id, for the Stats tab. */
  tally: Record<string, Tally>;
}

/** One player's numbers over a season (or a whole career), kept by player id. */
export interface Tally {
  /** The club they played for, by team id. */
  club: string;
  name: string;
  gk: boolean;
  /** Matches played. */
  p: number;
  g: number;
  a: number;
  sv: number;
  /** Clean sheets (keepers). */
  cs: number;
  /** Player of the Match awards. */
  motm: number;
}

/** How much a match line counts towards Player of the Match. */
const motmScore = (l: SimLine): number => l.g * 3 + l.a * 2 + l.sv * 1.2;

/**
 * Add one match to the tallies: everyone who played gets an appearance and their goals, assists
 * and saves, a keeper whose side let nothing in gets a clean sheet, and the best player gets
 * Player of the Match (or `motmId`, when the match already picked one).
 */
export function tallyMatch(tallies: Record<string, Tally>[], home: Team, away: Team, score: [number, number], lines: Record<string, SimLine>, motmId?: string | null): void {
  let best: string | null = motmId ?? null, bs = 0;
  ([[0, home], [1, away]] as const).forEach(([side, team]) => {
    for (const p of team.players) {
      const l = lines[p.id];
      if (!l) continue;
      for (const t of tallies) {
        const row = t[p.id] ??= { club: team.id, name: p.name, gk: p.position === 'GK', p: 0, g: 0, a: 0, sv: 0, cs: 0, motm: 0 };
        row.club = team.id; row.name = p.name; row.gk = p.position === 'GK';
        row.p++; row.g += l.g; row.a += l.a; row.sv += l.sv;
        if (p.position === 'GK' && score[1 - side] === 0) row.cs++;
      }
      if (motmId === undefined && motmScore(l) > bs) { bs = motmScore(l); best = p.id; }
    }
  });
  if (best) for (const t of tallies) if (t[best]) t[best].motm++;
}

/** A finished match's player stats in the background matches' shape. */
export const resultLines = (r: MatchResult): Record<string, SimLine> =>
  Object.fromEntries(Object.entries(r.players ?? {}).map(([id, m]) => [id, { g: m.goals, a: m.assists, sv: m.saves }]));

export interface TableRow {
  team: Team;
  played: number;
  won: number;
  drawn: number;
  lost: number;
  gf: number;
  ga: number;
  points: number;
  isYou: boolean;
}

/** Round robin for an even number of teams (circle method). */
export function roundRobin(ids: string[]): LeagueFixture[][] {
  const n = ids.length;
  const list = [...ids];
  const rounds: LeagueFixture[][] = [];
  for (let r = 0; r < n - 1; r++) {
    const round: LeagueFixture[] = [];
    for (let i = 0; i < n / 2; i++) {
      const a = list[i], b = list[n - 1 - i];
      // Alternate home and away so the player is not always at home.
      round.push((r + i) % 2 === 0 ? { homeId: a, awayId: b, score: null } : { homeId: b, awayId: a, score: null });
    }
    rounds.push(round);
    list.splice(1, 0, list.pop()!);
  }
  return rounds;
}

/** A brand-new league career (or a fresh season when `previous` is given). Pass `opponents` to play set teams (the career's clubs) instead of new ones. */
export function createLeague(human: Team, halfSeconds: number, tier = 5, previous?: LeagueState, opponents?: Team[]): LeagueState {
  const teams: Team[] = opponents ? [...opponents] : [];
  while (teams.length < TEAMS_PER_LEAGUE - 1) {
    const t = generateOpponent(human.ageGroup, human.kit);
    if (t.name !== human.name && !teams.some((o) => o.name === t.name)) teams.push(t);
  }
  const ids = [human.id, ...teams.map((t) => t.id)];
  // Shuffle so the player's fixtures vary from season to season.
  for (let i = ids.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [ids[i], ids[j]] = [ids[j], ids[i]]; }
  return {
    teamId: human.id,
    tier,
    season: previous ? previous.season + 1 : 1,
    halfSeconds,
    teams,
    rounds: roundRobin(ids),
    round: 0,
    history: previous ? previous.history : [],
    bestTier: Math.min(tier, previous?.bestTier ?? 5),
    tally: {},
  };
}

export function leagueTeam(s: LeagueState, human: Team, id: string): Team {
  return id === human.id ? human : s.teams.find((t) => t.id === id) ?? human;
}

export const seasonOver = (s: LeagueState): boolean => s.round >= s.rounds.length;

/** The player's next match, or null when the season is over. */
export function nextFixture(s: LeagueState, human: Team): { home: Team; away: Team; fixture: LeagueFixture; youAreHome: boolean } | null {
  if (seasonOver(s)) return null;
  const f = s.rounds[s.round].find((x) => x.homeId === human.id || x.awayId === human.id)!;
  return { home: leagueTeam(s, human, f.homeId), away: leagueTeam(s, human, f.awayId), fixture: f, youAreHome: f.homeId === human.id };
}

/** The rest of the current round, one job per fixture (null for the player's own), to play in the background during theirs. */
export function roundJobs(s: LeagueState, human: Team): (SimJob | null)[] {
  if (seasonOver(s)) return [];
  const level = tierInfo(s.tier).level;
  return s.rounds[s.round].map((f) => (f.score || f.homeId === human.id || f.awayId === human.id ? null
    : { home: leagueTeam(s, human, f.homeId), away: leagueTeam(s, human, f.awayId), difficulty: 'normal', halfSeconds: s.halfSeconds, cpuLevel: level }));
}

/**
 * Record the player's finished match, fill in the rest of the round and move the league on.
 * `others` are the round's other results already played in the background (see roundJobs);
 * any that are missing are played here. The result's home side is whoever the player was at
 * home or away against, so scores are turned round when the player was away. Everyone's stats
 * go into the season's tally and any `extra` tallies (the career's), with `motmId` as the player's
 * match's Player of the Match.
 */
export function applyLeagueResult(s: LeagueState, human: Team, r: MatchResult, others?: (SimOutcome | null)[], extra: Record<string, Tally>[] = [], motmId?: string | null): void {
  const nf = nextFixture(s, human);
  if (!nf || nf.fixture.score) return;
  nf.fixture.score = r.home.id === nf.fixture.homeId ? [...r.score] as [number, number] : [r.score[1], r.score[0]];
  const tallies = [s.tally ??= {}, ...extra];
  tallyMatch(tallies, r.home, r.away, r.score, resultLines(r), motmId);
  const jobs = roundJobs(s, human);
  s.rounds[s.round].forEach((f, i) => {
    if (f.score) return;
    const o = others?.[i] ?? playOut(jobs[i]!);
    f.score = o.score;
    if (o.players) tallyMatch(tallies, leagueTeam(s, human, f.homeId), leagueTeam(s, human, f.awayId), o.score, o.players);
  });
  s.round++;
}

export function computeTable(s: LeagueState, human: Team): TableRow[] {
  const rows = new Map<string, TableRow>();
  for (const id of [human.id, ...s.teams.map((t) => t.id)]) rows.set(id, { team: leagueTeam(s, human, id), played: 0, won: 0, drawn: 0, lost: 0, gf: 0, ga: 0, points: 0, isYou: id === human.id });
  for (const round of s.rounds) for (const f of round) {
    if (!f.score) continue;
    const h = rows.get(f.homeId)!, a = rows.get(f.awayId)!;
    const [hs, as] = f.score;
    h.played++; a.played++; h.gf += hs; h.ga += as; a.gf += as; a.ga += hs;
    if (hs > as) { h.won++; a.lost++; h.points += 3; } else if (hs < as) { a.won++; h.lost++; a.points += 3; } else { h.drawn++; a.drawn++; h.points++; a.points++; }
  }
  return [...rows.values()].sort((x, y) => y.points - x.points || (y.gf - y.ga) - (x.gf - x.ga) || y.gf - x.gf || x.team.name.localeCompare(y.team.name));
}

export function yourPosition(s: LeagueState, human: Team): number {
  return computeTable(s, human).findIndex((r) => r.isYou) + 1;
}

/** Work out promotion or relegation at the end of a season. Does not start the next one. */
export function seasonOutcome(s: LeagueState, human: Team): SeasonRecord {
  const position = yourPosition(s, human);
  let outcome: SeasonRecord['outcome'] = 'stayed';
  if (s.tier === 1 && position === 1) outcome = 'champion';
  else if (position <= PROMOTED && s.tier > 1) outcome = 'promoted';
  else if (position > TEAMS_PER_LEAGUE - RELEGATED && s.tier < 5) outcome = 'relegated';
  return { season: s.season, tier: s.tier, position, outcome };
}

/** Build next season's league from this one's outcome. */
export function nextSeason(s: LeagueState, human: Team): LeagueState {
  const rec = seasonOutcome(s, human);
  const tier = rec.outcome === 'promoted' ? s.tier - 1 : rec.outcome === 'relegated' ? s.tier + 1 : s.tier;
  const next = createLeague(human, s.halfSeconds, tier, s);
  next.history = [...s.history, rec];
  return next;
}
