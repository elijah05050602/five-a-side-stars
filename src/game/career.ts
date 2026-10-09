import { AGE_GROUPS, SKILL_KEYS, type AgeGroup, type Player, type Position, type SkillKey, type Skills, type Team } from '../data/types';
import { STAR_CAP, randomSkills, skillKeys, skillLabel } from '../data/skills';
import { FIRST_NAMES, makePlayer, pick, startingFive, uid } from '../data/defaults';
import { applyLeagueResult, computeTable, createLeague, resultLines, seasonOver, tallyMatch, type LeagueState, type SeasonRecord } from './league';
import type { MatchResult } from './MatchScene';
import { freshMatchStats, type PlayerMatchStats } from './sim';
import type { SimOutcome } from './background';
import { TIER_COUNT, activeIds, addNews, ageUpWorld, allTables, buildWorld, checkRival, clubById, endSeasons, opponentNudge, playOtherTiers, playoffFor, recordFixture, seasonIndex, startSeasons, tierOf, type CareerWorld, type WorldClub } from './careerWorld';

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
  /** The play-off this season, if you were in one. */
  playoff?: 'won' | 'lost' | null;
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
  /** Your Star: the one player the career follows. Every match is still played with the whole team. */
  starId: string;
  /** False until the player has picked their Star (a new career, or a save from before Stars). */
  starPicked: boolean;
  /** Training points the Star has waiting to spend on any rating. */
  trainingPoints: number;
  /** Ids of the Star milestones reached (see STAR_MILESTONES). */
  milestones: string[];
  /** After moving up an age group: who moved on, and the youngsters on trial. Null the rest of the time. */
  trialDay: TrialDay | null;
  /** The 30 clubs you play against all career, the tiers, your rival and everyone's stats. */
  world: CareerWorld;
}

/** Squad changes when the team moves up an age group: someone moves on, and the player signs one of three triallists. */
export interface TrialDay {
  /** Team-mates who moved to another club (already out of the squad). */
  left: { name: string; number: number; position: Position }[];
  /** Line-up spots the leavers had, which a new signing fills. */
  openSpots: Position[];
  /** Three youngsters to choose from. */
  players: Player[];
}

/** The biggest squad a team can have (the builder allows 5 to 8). */
export const MAX_SQUAD = 8;
/** A squad this size or smaller loses nobody, so a Trial Day always leaves at least six. */
const KEEP_ALL_AT = 5;

export interface StarMilestone {
  id: string;
  emoji: string;
  name: string;
  how: string;
}

/** Big moments in the Star's career. Each one gives a bonus training point. */
export const STAR_MILESTONES: StarMilestone[] = [
  { id: 'first-goal', emoji: '⚽', name: 'First Goal', how: 'Score your first goal.' },
  { id: 'hat-trick', emoji: '🎩', name: 'Hat-trick', how: 'Score three goals in one match.' },
  { id: 'goals-10', emoji: '🔟', name: 'Ten Goals', how: 'Score 10 goals in your career.' },
  { id: 'goals-25', emoji: '🚀', name: 'Goal Machine', how: 'Score 25 goals in your career.' },
  { id: 'assists-5', emoji: '🤝', name: 'Team Player', how: 'Set up 5 goals for your team-mates.' },
  { id: 'clean-sheet', emoji: '🧤', name: 'Clean Sheet', how: 'Play a whole match without letting a goal in.' },
  { id: 'saves-25', emoji: '🧱', name: 'Brick Wall', how: 'Make 25 saves in your career.' },
  { id: 'tackles-25', emoji: '🛡️', name: 'Ball Winner', how: 'Win the ball 25 times in your career.' },
  { id: 'motm-1', emoji: '🏆', name: 'Player of the Match', how: 'Be Player of the Match.' },
  { id: 'motm-5', emoji: '🎤', name: 'Crowd Favourite', how: 'Be Player of the Match five times.' },
  { id: 'games-20', emoji: '👟', name: 'Regular', how: 'Play 20 matches.' },
  { id: 'games-60', emoji: '🏅', name: 'Club Legend', how: 'Play 60 matches.' },
];

/** Training points after a match: one for playing, one for a win, one for Player of the Match. */
export const TRAINING = { played: 1, win: 1, motm: 1, milestone: 1 };
/** Each training point is this much of a star, so about four points make a new star. */
export const TRAINING_STEP = 0.25;

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
 * original is untouched. Give a `star` (one of the team's players, a player from
 * another team, or one made up for the career) and they join as the Star.
 */
export function createCareer(source: Team, halfSeconds: number, star?: Player): { career: CareerState; team: Team } {
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
  delete team.clubVersion;
  let starId: string | null = null;
  if (star) {
    const own = source.players.findIndex((p) => p.id === star.id);
    starId = own >= 0 ? team.players[own].id : joinSquad(team, star).id;
  }
  const world = buildWorld(team, TIER_COUNT);
  const league = createLeague(team, halfSeconds, TIER_COUNT, undefined, startSeasons(world, team.id, 1));
  const career: CareerState = {
    teamId: team.id, year: 1, season: 1, league, halfSeconds,
    seasonStats: {}, careerStats: {}, history: [], titles: 0, done: false, pendingGrowth: [],
    starId: starId ?? defaultStar(team), starPicked: starId !== null, trainingPoints: 0, milestones: [], trialDay: null, world,
  };
  return { career, team };
}

/**
 * A world for a career saved before there was one: the clubs it is playing now stay in its tier
 * (one more joins them and rests this mini season), and the other tiers catch up to the same round.
 */
export function worldForOldCareer(c: Pick<CareerState, 'league' | 'year' | 'season'>, team: Team): CareerWorld {
  const keep = c.league.teams;
  const world = buildWorld(team, c.league.tier, keep);
  startSeasons(world, team.id, seasonIndex(c.year, c.season));
  const yours = world.tiers[c.league.tier - 1];
  const extra = yours.members.find((id) => id !== team.id && !keep.some((t) => t.id === id)) ?? null;
  if (yours.members.length > 6) yours.resting = extra;
  for (let i = 0; i < c.league.round; i++) {
    for (const f of c.league.rounds[i] ?? []) if (f.score) recordFixture(world, team.id, f.homeId, f.awayId, f.score);
    playOtherTiers(world, team.id, i);
  }
  return world;
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

/** Who played in a match for `team`, and for how much of it (0 to 1): the starting five in full when the result does not say. */
export function whoPlayed(team: Team, r: MatchResult): { player: Player; share: number }[] {
  if (!r.played) return startingFive(team).map((player) => ({ player, share: 1 }));
  return team.players.filter((p) => (r.played![p.id] ?? 0) > 0).map((player) => ({ player, share: r.played![player.id] }));
}

/** Turn one match into star progress for one player. Returns the ratings that gained a star. */
function grow(p: Player, m: PlayerMatchStats, won: boolean, drawn: boolean, cleanSheet: boolean, age: AgeGroup, share = 1): GrowthEvent[] {
  const gain = zeroSkills();
  // Turning up and the result count for the share of the match they were on the pitch; what they did counts in full.
  const bonus = (RATES.played + (won ? RATES.win : drawn ? RATES.draw : 0)) * share;
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
    for (const { player: p } of whoPlayed(team, r)) {
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
  /** You beat your rival in this match. */
  rivalWin?: boolean;
  growth: GrowthEvent[];
  motm: Player | null;
  /** First time a player reached five stars this match. */
  fiveStar: boolean;
  /** Training points the Star earned in this match, milestones included. */
  points: number;
  /** Star milestones reached in this match. */
  milestones: StarMilestone[];
}

/**
 * The player a career follows until someone picks: the best record so far
 * (for a save from before Stars), else the first attacker in the line-up.
 */
export function defaultStar(team: Team, stats: Record<string, PlayerSeasonStats> = {}): string {
  const score = (id: string) => { const s = stats[id]; return s ? s.goals * 3 + s.assists * 2 + s.saves + s.motm * 2 + s.played * 0.1 : 0; };
  const line = startingFive(team);
  const best = [...team.players].sort((a, b) => score(b.id) - score(a.id))[0];
  if (best && score(best.id) > 0) return best.id;
  return (line.find((p) => p.position === 'ATT') ?? line.find((p) => p.position !== 'GK') ?? team.players[0])?.id ?? '';
}

/**
 * A newcomer joins the career squad as a starter, in the place of a starter who
 * plays where they do (or the last outfield starter), who moves to the bench. A
 * full squad lets its last substitute go to make room.
 */
function joinSquad(team: Team, newcomer: Player): Player {
  const age = team.ageGroup;
  const p: Player = { ...structuredClone(newcomer), id: uid(), skills: randomSkills(newcomer.position, age), xp: zeroSkills(), starter: true };
  delete p.positions;
  if (team.players.length >= MAX_SQUAD) {
    const sub = [...team.players].reverse().find((x) => !x.starter);
    team.players = team.players.filter((x) => x !== (sub ?? team.players[team.players.length - 1]));
  }
  const starters = team.players.filter((x) => x.starter);
  const keeper = p.position === 'GK';
  const out = starters.find((x) => x.position === p.position)
    ?? (keeper ? starters.find((x) => x.position === 'GK') : [...starters].reverse().find((x) => x.position !== 'GK'));
  if (out && starters.length >= 5) {
    out.starter = false;
    // The newcomer lines up where the benched player did, keeping their own position as their natural one.
    if (!keeper && out.position !== 'GK' && out.position !== p.position) { p.positions = [p.position]; p.position = out.position; }
  }
  const numbers = new Set(team.players.map((x) => x.number));
  while (numbers.has(p.number) && p.number < 99) p.number++;
  team.players.push(p);
  return p;
}

/** The career's Star, or undefined if they have left the squad. */
export const careerStar = (c: CareerState, team: Team): Player | undefined => team.players.find((p) => p.id === c.starId);

/** Make someone the Star. */
export function pickStar(c: CareerState, team: Team, playerId: string): boolean {
  if (!team.players.some((p) => p.id === playerId)) return false;
  c.starId = playerId;
  c.starPicked = true;
  return true;
}

/** Can a training point go into this rating? Not once it is at the age group's cap. */
export function canTrain(c: CareerState, star: Player, skill: SkillKey): boolean {
  return c.trainingPoints >= 1 && skillKeys(star.position).includes(skill) && star.skills[skill] < STAR_CAP[careerAge(c)];
}

/** Spend one training point on one of the Star's ratings. Returns any star it earned. */
export function trainStar(c: CareerState, team: Team, skill: SkillKey): GrowthEvent[] | null {
  const star = careerStar(c, team);
  if (!star || !canTrain(c, star, skill)) return null;
  c.trainingPoints--;
  star.xp = { ...zeroSkills(), ...(star.xp ?? {}) };
  star.xp[skill] += TRAINING_STEP;
  return levelUp(star, careerAge(c));
}

/** Milestones the Star has just reached, given their whole-career stats and this match. */
function newMilestones(c: CareerState, star: Player, s: PlayerSeasonStats, m: PlayerMatchStats, cleanSheet: boolean): StarMilestone[] {
  const keeper = star.position === 'GK';
  const reached: Record<string, boolean> = {
    'first-goal': s.goals >= 1,
    'hat-trick': m.goals >= 3,
    'goals-10': s.goals >= 10,
    'goals-25': s.goals >= 25,
    'assists-5': s.assists >= 5,
    'clean-sheet': cleanSheet && (keeper || star.position === 'DEF'),
    'saves-25': s.saves >= 25,
    'tackles-25': s.tackles >= 25,
    'motm-1': s.motm >= 1,
    'motm-5': s.motm >= 5,
    'games-20': s.played >= 20,
    'games-60': s.played >= 60,
  };
  return STAR_MILESTONES.filter((ms) => reached[ms.id] && !c.milestones.includes(ms.id));
}

/** Who you played in a finished match, and the score your way round. */
function yourSide(team: Team, r: MatchResult): { gf: number; ga: number; opponent: Team } {
  const youHome = r.home.id === team.id;
  const [gf, ga] = youHome ? r.score : [r.score[1], r.score[0]];
  return { gf, ga, opponent: youHome ? r.away : r.home };
}

/** Season and career stats, growth for everyone who played, and the Star's training points. */
function recordPlayers(c: CareerState, team: Team, r: MatchResult, motm: Player | null): CareerMatchSummary {
  const { gf, ga } = yourSide(team, r);
  const won = gf > ga, drawn = gf === ga, cleanSheet = ga === 0;
  const growth: GrowthEvent[] = [];
  let fiveStar = false;
  const age = careerAge(c);
  for (const { player: p, share } of whoPlayed(team, r)) {
    const m = r.players?.[p.id] ?? freshMatchStats();
    for (const bucket of [c.seasonStats, c.careerStats]) {
      const s = bucket[p.id] ?? (bucket[p.id] = freshSeasonStats());
      s.played++; s.goals += m.goals; s.assists += m.assists; s.shots += m.shots; s.passes += m.passes; s.tackles += m.tackles; s.saves += m.saves;
      if (cleanSheet) s.cleanSheets++;
      if (motm?.id === p.id) s.motm++;
    }
    const had5 = skillKeys(p.position).some((k) => p.skills[k] >= 5);
    growth.push(...grow(p, m, won, drawn, cleanSheet, age, share));
    if (!had5 && skillKeys(p.position).some((k) => p.skills[k] >= 5)) fiveStar = true;
  }
  // The Star earns training points to spend by hand, on top of growing like everyone else.
  let points = 0;
  const milestones: StarMilestone[] = [];
  const star = careerStar(c, team);
  if (star && startingFive(team).includes(star)) {
    points = TRAINING.played + (won ? TRAINING.win : 0) + (motm?.id === star.id ? TRAINING.motm : 0);
    milestones.push(...newMilestones(c, star, c.careerStats[star.id], r.players?.[star.id] ?? freshMatchStats(), cleanSheet));
    c.milestones.push(...milestones.map((ms) => ms.id));
    points += milestones.length * TRAINING.milestone;
    c.trainingPoints += points;
  }
  return { growth, motm, fiveStar, points, milestones };
}

/** Count a win over your rival. */
function rivalCheck(c: CareerState, team: Team, r: MatchResult): boolean {
  const { gf, ga, opponent } = yourSide(team, r);
  if (opponent.id !== c.world.rivalId || gf <= ga) return false;
  c.world.rivalWins++;
  return true;
}

/**
 * Record the career team's finished match: league table, every tier's round, the stats pages,
 * season and career stats, and growth for everyone who played. Mutates both the career and the
 * team; the caller saves them.
 */
export function applyCareerMatch(c: CareerState, team: Team, r: MatchResult, others?: (SimOutcome | null)[]): CareerMatchSummary {
  const motm = playerOfTheMatch(r);
  const index = c.league.round;
  applyLeagueResult(c.league, team, r, others, [c.world.tally], motm?.id ?? null);
  if (c.league.round > index) {
    for (const f of c.league.rounds[index]) if (f.score) recordFixture(c.world, team.id, f.homeId, f.awayId, f.score);
    playOtherTiers(c.world, team.id, index);
  }
  const rivalWin = rivalCheck(c, team, r);
  return { ...recordPlayers(c, team, r, motm), rivalWin };
}

/** Your play-off, when the mini season is over and you finished 2nd (playing to go up) or 5th (playing to stay up). */
export function careerPlayoff(c: CareerState, team: Team): { opponent: WorldClub; up: boolean; cpuLevel: number } | null {
  if (!seasonOver(c.league) || c.done) return null;
  const table = computeTable(c.league, team);
  const pos = table.findIndex((row) => row.isYou) + 1;
  return playoffFor(c.world, c.league.tier, pos, allTables(c.world, team.id, table.map((row) => row.team.id), team.name));
}

/** The play-off still to be played (or its shoot-out), or null when there is none or it is done. */
export const playoffWaiting = (c: CareerState, team: Team): boolean => !!careerPlayoff(c, team) && (c.world.playoff?.won ?? null) === null;

/**
 * Record a play-off match or its shoot-out. A draw waits for the shoot-out (`won` stays null).
 * The match counts for stats and growth like any other; the shoot-out only settles it.
 */
export function applyPlayoffMatch(c: CareerState, team: Team, r: MatchResult): CareerMatchSummary | null {
  const po = careerPlayoff(c, team);
  if (!po) return null;
  const { gf, ga } = yourSide(team, r);
  if (r.mode === 'shootout') {
    const p = c.world.playoff;
    if (!p || p.won !== null) return null;
    p.pens = [gf, ga];
    p.won = gf > ga;
    return null;
  }
  if (c.world.playoff) return null;
  const motm = playerOfTheMatch(r);
  c.world.playoff = { opponentId: po.opponent.team.id, up: po.up, score: [gf, ga], pens: null, won: gf === ga ? null : gf > ga };
  recordFixture(c.world, team.id, r.home.id, r.away.id, r.score);
  tallyMatch([c.world.tally], r.home, r.away, r.score, resultLines(r), motm?.id ?? null);
  const rivalWin = rivalCheck(c, team, r);
  return { ...recordPlayers(c, team, r, motm), rivalWin };
}

export const careerSeasonOver = (c: CareerState): boolean => seasonOver(c.league);

/** This mini season's result for the career team, once all five matches are played. */
export function careerSeasonOutcome(c: CareerState, team: Team): CareerSeasonRecord {
  const position = computeTable(c.league, team).findIndex((row) => row.isYou) + 1;
  const tier = c.league.tier;
  const po = c.world.playoff?.won;
  // Champions go up and the bottom club goes down; 2nd and 5th go through a play-off.
  let outcome: SeasonRecord['outcome'] = 'stayed';
  let playoff: CareerSeasonRecord['playoff'] = null;
  if (position === 1) outcome = tier === 1 ? 'champion' : 'promoted';
  else if (position === TEAMS_PER_TABLE && tier < TIER_COUNT) outcome = 'relegated';
  else if (careerPlayoff(c, team)) {
    playoff = po === true ? 'won' : po === false ? 'lost' : null;
    if (position === 2 && po === true) outcome = 'promoted';
    if (position === 5 && po === false) outcome = 'relegated';
  }
  const rec: SeasonRecord = { season: c.league.season, tier, position, outcome };
  let top: CareerSeasonRecord['topScorer'] = null;
  for (const p of team.players) {
    const g = c.seasonStats[p.id]?.goals ?? 0;
    if (g > 0 && (!top || g > top.goals)) top = { name: p.name, goals: g };
  }
  return { ...rec, year: c.year, miniSeason: c.season, age: careerAge(c), topScorer: top, playoff };
}

const TEAMS_PER_TABLE = 6;

export interface SeasonAdvance {
  record: CareerSeasonRecord;
  /** The tier you won this mini season (1 to 5), if you won it. */
  titleTier: number | null;
  /** You won a title in every age group, from the Under 5s to now. */
  everyYear: boolean;
  /** You have won all five tiers in this career. */
  allTheWayUp: boolean;
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
  const w = c.world;
  const si = seasonIndex(c.year, c.season);
  const titleTier = record.position === 1 ? c.league.tier : null;
  if (titleTier) {
    c.titles++;
    if (!w.titleAges.includes(careerAge(c))) w.titleAges.push(careerAge(c));
  }
  const end = endSeasons(w, team.id, team.name, computeTable(c.league, team).map((row) => row.team.id), si);
  const tier = end.tier;
  let movedUp = false, finished = false;
  const yearEnd = c.season >= SEASONS_PER_YEAR;
  checkRival(w, team.id, si, yearEnd);
  if (yearEnd) {
    if (c.year >= CAREER_YEARS) {
      finished = true;
      c.done = true;
    } else {
      c.year++;
      c.season = 1;
      team.ageGroup = careerAge(c);
      movedUp = true;
      ageUpWorld(w, team.ageGroup, si);
      // Someone moves on first, so the growth spurt below is only for the players who stay.
      c.trialDay = startTrialDay(c, team);
      for (const l of c.trialDay.left) addNews(w, si, '👋', `${l.name} has left ${team.name} for a new club. Good luck, ${l.name}!`);
      // Banked progress turns into stars now that the cap has risen.
      c.pendingGrowth = team.players.flatMap((p) => levelUp(p, team.ageGroup));
    }
  } else {
    c.season++;
  }
  c.seasonStats = {};
  if (!finished) {
    const league = createLeague(team, c.halfSeconds, tier, c.league, startSeasons(w, team.id, seasonIndex(c.year, c.season)));
    league.history = [...c.league.history, record];
    c.league = league;
  }
  const everyYear = !!titleTier && CAREER_AGES.every((a) => w.titleAges.includes(a));
  return { record, movedUp, finished, titleTier, everyYear, allTheWayUp: w.tierTitles.every((n) => n > 0) };
}

/** Your rival club, if there is one. */
export const careerRival = (c: CareerState): WorldClub | undefined => clubById(c.world, c.world.rivalId);

/** How much stronger (or weaker) a club plays you than its tier's usual level. */
export const careerNudge = (c: CareerState, clubId: string): number => opponentNudge(c.world, clubId);

/** The clubs in your tier this mini season, resting one included, for the Stats tab. */
export const yourTierIds = (c: CareerState, team: Team): string[] => activeIds(c.world.tiers[tierOf(c.world, team.id) - 1]);

/**
 * Who moves on when the team moves up: whoever has played least (never the Star, never
 * the only keeper). Nobody leaves a squad of five, one leaves six or seven, two leave eight,
 * and one triallist signs, so the squad ends up six to seven strong.
 */
export function chooseLeavers(c: CareerState, team: Team): Player[] {
  const count = team.players.length <= KEEP_ALL_AT ? 0 : team.players.length >= MAX_SQUAD ? 2 : 1;
  const played = (p: Player) => c.careerStats[p.id]?.played ?? 0;
  const stars = (p: Player) => skillKeys(p.position).reduce((n, k) => n + p.skills[k], 0);
  const keepers = team.players.filter((p) => p.position === 'GK').length;
  return team.players
    .filter((p) => p.id !== c.starId && !(p.position === 'GK' && keepers <= 1))
    .sort((a, b) => played(a) - played(b) || stars(a) - stars(b))
    .slice(0, count);
}

/** Send the leavers off and line up three triallists. Mutates the team. */
export function startTrialDay(c: CareerState, team: Team): TrialDay {
  const age = careerAge(c);
  const leavers = chooseLeavers(c, team);
  team.players = team.players.filter((p) => !leavers.includes(p));
  const usedNames = new Set(team.players.map((p) => p.name));
  const usedNumbers = new Set(team.players.map((p) => p.number));
  const freeName = () => {
    const names = FIRST_NAMES.filter((n) => !usedNames.has(n));
    const n = names.length ? pick(names) : pick(FIRST_NAMES);
    usedNames.add(n);
    return n;
  };
  const freeNumber = (wanted?: number) => {
    let n = wanted && !usedNumbers.has(wanted) ? wanted : 2;
    while (usedNumbers.has(n) && n < 99) n++;
    usedNumbers.add(n);
    return n;
  };
  // One triallist plays where the first leaver did (or fills a gap), the others anywhere outfield.
  const outfield: Position[] = ['DEF', 'MID', 'WING', 'ATT'];
  const first = leavers[0]?.position ?? (team.players.some((p) => p.position === 'GK') ? pick(outfield) : 'GK');
  const positions: Position[] = [first, pick(outfield), pick(outfield)];
  // Triallists are rated like a squad that has played a year in the age group below, so a new face
  // is a fair swap for the kids who have grown up in the career, not an instant upgrade.
  const below = CAREER_AGES[Math.max(0, CAREER_AGES.indexOf(age) - 1)];
  const players = positions.map((pos, i) => {
    const p = makePlayer(pos, freeNumber(i === 0 ? leavers[0]?.number : undefined), freeName(), false, age);
    p.skills = randomSkills(pos, below);
    p.xp = zeroSkills();
    return p;
  });
  // One of them is a bit better than the rest: an extra star where there is room for one.
  const standout = pick(players);
  const room = skillKeys(standout.position).filter((k) => standout.skills[k] < STAR_CAP[age]);
  if (room.length) standout.skills[pick(room)]++;
  return {
    left: leavers.map((p) => ({ name: p.name, number: p.number, position: p.position })),
    openSpots: leavers.filter((p) => p.starter).map((p) => p.position),
    players,
  };
}

/** Sign one triallist: they join the squad, starting in a leaver's spot if one is open. Ends the Trial Day. */
export function signTriallist(c: CareerState, team: Team, playerId: string): Player | null {
  const t = c.trialDay;
  const p = t?.players.find((x) => x.id === playerId);
  if (!t || !p || team.players.length >= MAX_SQUAD) return null;
  const spot = t.openSpots[0];
  // Only a keeper goes in goal; an outfield triallist waits on the bench for a goalkeeper's spot.
  if (spot && (spot !== 'GK' || p.position === 'GK') && team.players.filter((x) => x.starter).length < 5) {
    if (spot !== p.position) p.positions = [p.position];
    p.position = spot;
    p.starter = true;
  }
  team.players.push(p);
  c.trialDay = null;
  addNews(c.world, seasonIndex(c.year, c.season) - 1, '✍️', `${team.name} signed ${p.name} at the Trial Day!`);
  return p;
}

/** Rows for the season (or whole career) stat cards, best performers first. */
export function statRows(c: CareerState, team: Team, scope: 'season' | 'career'): { player: Player; stats: PlayerSeasonStats }[] {
  const src = scope === 'season' ? c.seasonStats : c.careerStats;
  return team.players
    .map((player) => ({ player, stats: src[player.id] ?? freshSeasonStats() }))
    .sort((a, b) => (b.stats.goals + b.stats.assists + b.stats.saves) - (a.stats.goals + a.stats.assists + a.stats.saves));
}
