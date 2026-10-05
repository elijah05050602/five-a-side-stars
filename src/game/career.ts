import { AGE_GROUPS, SKILL_KEYS, type AgeGroup, type Player, type SkillKey, type Skills, type Team } from '../data/types';
import { STAR_CAP, randomSkills, skillKeys, skillLabel } from '../data/skills';
import { startingFive, uid } from '../data/defaults';
import { applyLeagueResult, createLeague, seasonOutcome, seasonOver, type LeagueState, type SeasonRecord } from './league';
import type { MatchResult } from './MatchScene';
import { freshMatchStats, type PlayerMatchStats } from './sim';

/**
 * Career mode: one team starts in the Under 5s and plays a year in each age
 * group up to the Under 10s. Every year is four mini seasons (each a small
 * league of five matches), and players grow by what they do on the pitch.
 */
export const SEASONS_PER_YEAR = 4;
export const SEASON_NAMES = ['Autumn', 'Winter', 'Spring', 'Summer'];
export const CAREER_AGES: AgeGroup[] = AGE_GROUPS; // U5 first, U10 last
export const CAREER_YEARS = CAREER_AGES.length;

export interface PlayerSeasonStats extends PlayerMatchStats {
  played: number;
  /** Player of the match awards. */
  motm: number;
  cleanSheets: number;
}

export const freshSeasonStats = (): PlayerSeasonStats => ({ ...freshMatchStats(), played: 0, motm: 0, cleanSheets: 0 });

export interface CareerSeasonRecord extends SeasonRecord {
  year: number;
  /** 1 to 4 within the year. */
  miniSeason: number;
  age: AgeGroup;
  topScorer: { name: string; goals: number } | null;
}

export interface CareerState {
  teamId: string;
  /** 1 = Under 5s, 6 = Under 10s. */
  year: number;
  /** 1 to 4 within the year. */
  season: number;
  league: LeagueState;
  halfSeconds: number;
  seasonStats: Record<string, PlayerSeasonStats>;
  careerStats: Record<string, PlayerSeasonStats>;
  history: CareerSeasonRecord[];
  /** Mini-season titles won. */
  titles: number;
  /** Set once the Under 10s' fourth season is finished. */
  done: boolean;
  /** Star changes waiting to be shown on the career screen (after a year change). */
  pendingGrowth: GrowthEvent[];
}

export interface GrowthEvent {
  playerId: string;
  name: string;
  skill: SkillKey;
  label: string;
  stars: number;
}

export const careerAge = (c: CareerState): AgeGroup => CAREER_AGES[Math.min(c.year, CAREER_YEARS) - 1];
export const seasonName = (c: CareerState): string => SEASON_NAMES[(c.season - 1) % SEASONS_PER_YEAR];

const zeroSkills = (): Skills => Object.fromEntries(SKILL_KEYS.map((k) => [k, 0])) as Skills;

/**
 * A fresh career: a copy of the chosen team sent back to the Under 5s, with
 * tiny stars that have room to grow. The copy is its own saved team so the
 * original is untouched.
 */
export function createCareer(source: Team, halfSeconds: number): { career: CareerState; team: Team } {
  const age = CAREER_AGES[0];
  const team: Team = {
    ...structuredClone(source),
    id: `career-${uid()}`,
    name: source.name,
    ageGroup: age,
    career: true,
    createdAt: Date.now(),
    players: source.players.map((p) => ({ ...p, id: uid(), skills: randomSkills(p.position, age), xp: zeroSkills() })),
  };
  const league = createLeague(team, halfSeconds, 5);
  const career: CareerState = {
    teamId: team.id, year: 1, season: 1, league, halfSeconds,
    seasonStats: {}, careerStats: {}, history: [], titles: 0, done: false, pendingGrowth: [],
  };
  return { career, team };
}

/**
 * Growth per action, in fractions of a star. Tuned on headless CPU careers so
 * a regular starter gains roughly one star every six matches: enough to see
 * someone grow most weeks, slow enough that the age cap is not hit at once.
 * Every player trains all seven of their ratings by turning up; what they do
 * in the match pushes the matching ones along faster.
 */
const RATES = {
  played: 0.012, win: 0.01, draw: 0.005,
  shot: 0.006, goal: 0.04, pass: 0.003, assist: 0.04, tackle: 0.007, bigMatch: 0.02,
  save: 0.007, saveHandling: 0.004, cleanSheet: 0.05, keeperKick: 0.004,
};

/** Turn one match into star progress for one player. Returns the ratings that gained a star. */
function grow(p: Player, m: PlayerMatchStats, won: boolean, drawn: boolean, cleanSheet: boolean, age: AgeGroup): GrowthEvent[] {
  const gain = zeroSkills();
  const bonus = RATES.played + (won ? RATES.win : drawn ? RATES.draw : 0);
  for (const k of skillKeys(p.position)) gain[k] += bonus;
  gain.speed += m.goals * 0.005 + m.tackles * 0.005 + m.saves * 0.003;
  // A busy match (lots of involvement) builds Stamina and Strength.
  const busy = m.shots + m.passes + m.tackles + m.saves;
  gain.strength += m.tackles * 0.004 + (busy >= 8 ? RATES.bigMatch * 0.5 : 0);
  if (p.position === 'GK') {
    gain.diving += m.saves * RATES.save;
    gain.reflexes += m.saves * RATES.save * 0.8;
    gain.handling += m.saves * RATES.saveHandling + (cleanSheet ? RATES.cleanSheet : 0);
    gain.positioning += (cleanSheet ? RATES.cleanSheet * 0.8 : 0) + m.saves * RATES.saveHandling * 0.5;
    gain.passing += m.passes * RATES.keeperKick; // Kicking
  } else {
    gain.shooting += m.shots * RATES.shot + m.goals * RATES.goal;
    gain.passing += m.passes * RATES.pass + m.assists * RATES.assist;
    // Dribbling grows with the ball at your feet: goals and the passes you carry it into.
    gain.control += m.goals * RATES.goal * 0.5 + m.passes * RATES.pass * 0.6 + m.shots * RATES.shot * 0.5;
    gain.tackling += m.tackles * RATES.tackle + (cleanSheet && p.position === 'DEF' ? RATES.cleanSheet * 0.4 : 0);
    gain.stamina += busy >= 8 ? RATES.bigMatch : busy * RATES.bigMatch * 0.1;
  }
  p.xp = { ...zeroSkills(), ...(p.xp ?? {}) };
  for (const k of skillKeys(p.position)) p.xp[k] += gain[k];
  return levelUp(p, age);
}

/** Convert banked progress into stars, up to the age group's cap. */
export function levelUp(p: Player, age: AgeGroup): GrowthEvent[] {
  const out: GrowthEvent[] = [];
  const cap = STAR_CAP[age];
  p.xp = { ...zeroSkills(), ...(p.xp ?? {}) };
  for (const k of skillKeys(p.position)) {
    while (p.xp[k] >= 1 && p.skills[k] < cap) {
      p.xp[k] -= 1;
      p.skills[k]++;
      out.push({ playerId: p.id, name: p.name, skill: k, label: skillLabel(p.position, k).label, stars: p.skills[k] });
    }
    // At the cap, up to one whole star is banked for next year, so moving up feels like a growth spurt.
    if (p.skills[k] >= cap) p.xp[k] = Math.min(p.xp[k], 1.99);
  }
  return out;
}

/** Best performer in the match by what they did, over both teams. */
export function playerOfTheMatch(r: MatchResult): Player | null {
  const score = (m: PlayerMatchStats) => m.goals * 3 + m.assists * 2 + m.saves * 1.2 + m.tackles * 0.6 + m.shots * 0.2 + m.passes * 0.1;
  let best: Player | null = null, bs = 0;
  for (const team of [r.home, r.away]) {
    for (const p of startingFive(team)) {
      const m = r.players?.[p.id];
      if (!m) continue;
      const s = score(m);
      if (s > bs) { bs = s; best = p; }
    }
  }
  if (best) return best;
  return startingFive(r.home).find((p) => p.position === 'GK') ?? null;
}

export interface CareerMatchSummary {
  growth: GrowthEvent[];
  motm: Player | null;
  /** First time a player reached five stars this match. */
  fiveStar: boolean;
}

/**
 * Record the career team's finished match: league table, season and career
 * stats, and growth for everyone who played. Mutates both the career and the
 * team; the caller saves them.
 */
export function applyCareerMatch(c: CareerState, team: Team, r: MatchResult): CareerMatchSummary {
  const youHome = r.home.id === team.id;
  const [gf, ga] = youHome ? r.score : [r.score[1], r.score[0]];
  const won = gf > ga, drawn = gf === ga, cleanSheet = ga === 0;
  applyLeagueResult(c.league, team, r);
  const motm = playerOfTheMatch(r);
  const growth: GrowthEvent[] = [];
  let fiveStar = false;
  const age = careerAge(c);
  for (const p of startingFive(team)) {
    const m = r.players?.[p.id] ?? freshMatchStats();
    for (const bucket of [c.seasonStats, c.careerStats]) {
      const s = bucket[p.id] ?? (bucket[p.id] = freshSeasonStats());
      s.played++; s.goals += m.goals; s.assists += m.assists; s.shots += m.shots; s.passes += m.passes; s.tackles += m.tackles; s.saves += m.saves;
      if (cleanSheet) s.cleanSheets++;
      if (motm?.id === p.id) s.motm++;
    }
    const had5 = skillKeys(p.position).some((k) => p.skills[k] >= 5);
    growth.push(...grow(p, m, won, drawn, cleanSheet, age));
    if (!had5 && skillKeys(p.position).some((k) => p.skills[k] >= 5)) fiveStar = true;
  }
  return { growth, motm, fiveStar };
}

export const careerSeasonOver = (c: CareerState): boolean => seasonOver(c.league);

/** This mini season's result for the career team, once all five matches are played. */
export function careerSeasonOutcome(c: CareerState, team: Team): CareerSeasonRecord {
  const rec = seasonOutcome(c.league, team);
  let top: CareerSeasonRecord['topScorer'] = null;
  for (const p of team.players) {
    const g = c.seasonStats[p.id]?.goals ?? 0;
    if (g > 0 && (!top || g > top.goals)) top = { name: p.name, goals: g };
  }
  return { ...rec, year: c.year, miniSeason: c.season, age: careerAge(c), topScorer: top };
}

export interface SeasonAdvance {
  record: CareerSeasonRecord;
  /** The team moved up an age group. */
  movedUp: boolean;
  /** The whole career (Under 10s, season 4) is finished. */
  finished: boolean;
}

/**
 * Close the mini season: promotion or relegation carries over like the league,
 * and after the fourth season the team moves up an age group. Mutates the
 * career and the team; the caller saves them.
 */
export function advanceCareer(c: CareerState, team: Team): SeasonAdvance {
  const record = careerSeasonOutcome(c, team);
  c.history.push(record);
  if (record.position === 1) c.titles++;
  const tier = record.outcome === 'promoted' ? c.league.tier - 1 : record.outcome === 'relegated' ? c.league.tier + 1 : c.league.tier;
  let movedUp = false, finished = false;
  if (c.season >= SEASONS_PER_YEAR) {
    if (c.year >= CAREER_YEARS) {
      finished = true;
      c.done = true;
    } else {
      c.year++;
      c.season = 1;
      team.ageGroup = careerAge(c);
      movedUp = true;
      // Banked progress turns into stars now that the cap has risen.
      c.pendingGrowth = team.players.flatMap((p) => levelUp(p, team.ageGroup));
    }
  } else {
    c.season++;
  }
  c.seasonStats = {};
  if (!finished) {
    const league = createLeague(team, c.halfSeconds, tier, c.league);
    league.history = [...c.league.history, record];
    c.league = league;
  }
  return { record, movedUp, finished };
}

/** Rows for the season (or whole career) stat cards, best performers first. */
export function statRows(c: CareerState, team: Team, scope: 'season' | 'career'): { player: Player; stats: PlayerSeasonStats }[] {
  const src = scope === 'season' ? c.seasonStats : c.careerStats;
  return team.players
    .map((player) => ({ player, stats: src[player.id] ?? freshSeasonStats() }))
    .sort((a, b) => (b.stats.goals + b.stats.assists + b.stats.saves) - (a.stats.goals + a.stats.assists + a.stats.saves));
}
