import type { Position, Team } from '../data/types';
import type { MatchResult } from './MatchScene';
import type { LeagueState } from './league';
import type { PlayerMatchStats } from './sim';

/**
 * Season goals: three things to aim for in every career mini season (one easy, one medium, one
 * hard), picked to suit the Star's position, so season 17 feels different from season 3. Each one
 * done is a training point; all three is a Clean Sweep.
 */
export type GoalLevel = 0 | 1 | 2;

export interface SeasonGoal {
  id: string;
  level: GoalLevel;
  /** How many it takes. */
  target: number;
  /** How far along it is (never more than the target). */
  progress: number;
  done: boolean;
}

/** What a goal can look at: the season so far, and the match just played when there is one. */
export interface GoalContext {
  star?: { position: Position; season: SeasonLine };
  /** Your team's season: wins, goals scored, clean sheets, matches scored in, matches played, and where you are. */
  team: { won: number; gf: number; cleanSheets: number; scoredIn: number; played: number; lost: number; position: number; over: boolean };
  match?: { gf: number; ga: number; passes: number; cameBack: boolean; rivalBeaten: boolean };
  /** A rival is in your tier this season. */
  rivalHere: boolean;
}

/** The Star's season so far. */
export interface SeasonLine extends PlayerMatchStats { motm: number; cleanSheets: number }

interface GoalDef {
  id: string;
  level: GoalLevel;
  target: number;
  /** In the words a 7-year-old reads; {n} is the target and {star} the Star's name. */
  text: string;
  emoji: string;
  /** Who it suits: the Star's position, or the season (a rival). */
  fits?: (pos: Position | null, ctx: { rivalHere: boolean }) => boolean;
  /** Progress from the season so far (cumulative) or this match (1 when done in it). */
  measure: (c: GoalContext) => number;
}

const outfield = (p: Position | null) => !!p && p !== 'GK';
const keeper = (p: Position | null) => p === 'GK';
const attacker = (p: Position | null) => p === 'ATT' || p === 'WING' || p === 'MID';
const defender = (p: Position | null) => p === 'DEF' || p === 'MID';
const s = (c: GoalContext) => c.star?.season;

export const GOAL_DEFS: GoalDef[] = [
  // Easy
  { id: 'star-goal-1', level: 0, target: 1, emoji: '⚽', text: '{star} scores a goal', fits: outfield, measure: (c) => s(c)?.goals ?? 0 },
  { id: 'star-saves-8', level: 0, target: 8, emoji: '🧤', text: '{star} makes {n} saves', fits: keeper, measure: (c) => s(c)?.saves ?? 0 },
  { id: 'star-tackles-4', level: 0, target: 4, emoji: '🛡️', text: '{star} wins the ball {n} times', fits: defender, measure: (c) => s(c)?.tackles ?? 0 },
  { id: 'star-trick-1', level: 0, target: 1, emoji: '🪄', text: '{star} beats a defender with a skill move', fits: outfield, measure: (c) => s(c)?.tricks ?? 0 },
  { id: 'win-1', level: 0, target: 1, emoji: '✅', text: 'Win a match', measure: (c) => c.team.won },
  { id: 'goals-4', level: 0, target: 4, emoji: '🥅', text: 'Score {n} goals as a team', measure: (c) => c.team.gf },
  { id: 'scored-in-3', level: 0, target: 3, emoji: '🎯', text: 'Score in {n} matches', measure: (c) => c.team.scoredIn },
  { id: 'super-1', level: 0, target: 1, emoji: '⚡', text: '{star} uses a super skill', fits: outfield, measure: (c) => s(c)?.supers ?? 0 },
  { id: 'passes-10', level: 0, target: 1, emoji: '🤝', text: 'Make 10 passes in one match', measure: (c) => (c.match && c.match.passes >= 10 ? 1 : 0) },
  // Medium
  { id: 'star-goals-3', level: 1, target: 3, emoji: '🚀', text: '{star} scores {n} goals', fits: attacker, measure: (c) => s(c)?.goals ?? 0 },
  { id: 'star-assists-2', level: 1, target: 2, emoji: '🎁', text: '{star} sets up {n} goals', fits: outfield, measure: (c) => s(c)?.assists ?? 0 },
  { id: 'star-saves-15', level: 1, target: 15, emoji: '🧱', text: '{star} makes {n} saves', fits: keeper, measure: (c) => s(c)?.saves ?? 0 },
  { id: 'star-tackles-8', level: 1, target: 8, emoji: '🛡️', text: '{star} wins the ball {n} times', fits: defender, measure: (c) => s(c)?.tackles ?? 0 },
  { id: 'star-tricks-2', level: 1, target: 2, emoji: '🪄', text: '{star} lands {n} skill moves', fits: outfield, measure: (c) => s(c)?.tricks ?? 0 },
  { id: 'clean-sheets-2', level: 1, target: 2, emoji: '🧤', text: 'Keep {n} clean sheets', measure: (c) => c.team.cleanSheets },
  { id: 'wins-3', level: 1, target: 3, emoji: '🏅', text: 'Win {n} matches', measure: (c) => c.team.won },
  { id: 'score-3', level: 1, target: 1, emoji: '🔥', text: 'Score 3 goals in one match', measure: (c) => (c.match && c.match.gf >= 3 ? 1 : 0) },
  { id: 'beat-rival', level: 1, target: 1, emoji: '😤', text: 'Beat your rival', fits: (_p, x) => x.rivalHere, measure: (c) => (c.match?.rivalBeaten ? 1 : 0) },
  { id: 'top-three', level: 1, target: 1, emoji: '🥉', text: 'Finish in the top three', measure: (c) => (c.team.over && c.team.position <= 3 ? 1 : 0) },
  { id: 'star-motm-1', level: 1, target: 1, emoji: '🏆', text: '{star} is Player of the Match', measure: (c) => s(c)?.motm ?? 0 },
  // Hard
  { id: 'star-goals-5', level: 2, target: 5, emoji: '👟', text: '{star} scores {n} goals', fits: attacker, measure: (c) => s(c)?.goals ?? 0 },
  { id: 'star-clean-3', level: 2, target: 3, emoji: '🧤', text: '{star} keeps {n} clean sheets', fits: (p) => p === 'GK' || p === 'DEF', measure: (c) => s(c)?.cleanSheets ?? 0 },
  { id: 'star-supergoal', level: 2, target: 1, emoji: '💫', text: '{star} scores with a super skill', fits: attacker, measure: (c) => s(c)?.superGoals ?? 0 },
  { id: 'star-motm-2', level: 2, target: 2, emoji: '🎤', text: '{star} is Player of the Match {n} times', measure: (c) => s(c)?.motm ?? 0 },
  { id: 'win-by-3', level: 2, target: 1, emoji: '💥', text: 'Win a match by 3 goals or more', measure: (c) => (c.match && c.match.gf - c.match.ga >= 3 ? 1 : 0) },
  { id: 'comeback', level: 2, target: 1, emoji: '🔁', text: 'Win after going a goal behind', measure: (c) => (c.match?.cameBack ? 1 : 0) },
  { id: 'unbeaten', level: 2, target: 1, emoji: '🛡️', text: 'Go the whole season without losing', measure: (c) => (c.team.over && c.team.lost === 0 ? 1 : 0) },
  { id: 'wins-4', level: 2, target: 4, emoji: '🌟', text: 'Win {n} matches', measure: (c) => c.team.won },
  { id: 'top-of-table', level: 2, target: 1, emoji: '🥇', text: 'Win the league', measure: (c) => (c.team.over && c.team.position === 1 ? 1 : 0) },
  { id: 'clean-sheets-3', level: 2, target: 3, emoji: '🧱', text: 'Keep {n} clean sheets', measure: (c) => c.team.cleanSheets },
];

export const goalDef = (id: string): GoalDef | undefined => GOAL_DEFS.find((g) => g.id === id);

/** A goal's words, with the Star's name and the target filled in. */
export function goalText(g: SeasonGoal, starName: string): { emoji: string; text: string } {
  const d = goalDef(g.id);
  if (!d) return { emoji: '🎯', text: 'A season goal' };
  return { emoji: d.emoji, text: d.text.replace('{star}', starName || 'Your Star').replace('{n}', String(g.target)) };
}

/** Goals that ask for the same thing ("score 1", "score 3") are one family, and a season gets one of each family at most. */
const family = (id: string) => id.replace(/-\d+$/, '').replace(/s$/, '');

/** Three goals for a new mini season, one at each level, that suit the Star and the season. */
export function pickGoals(starPos: Position | null, rivalHere: boolean): SeasonGoal[] {
  const out: SeasonGoal[] = [];
  for (const level of [0, 1, 2] as GoalLevel[]) {
    const fit = GOAL_DEFS.filter((d) => d.level === level && (!d.fits || d.fits(starPos, { rivalHere })) && !out.some((o) => family(o.id) === family(d.id)));
    const d = fit[Math.floor(Math.random() * fit.length)];
    if (d) out.push({ id: d.id, level, target: d.target, progress: 0, done: false });
  }
  return out;
}

/** Your team's season so far, from the league's fixtures. */
export function teamSeason(ls: LeagueState, teamId: string, position: number): GoalContext['team'] {
  const t = { won: 0, gf: 0, cleanSheets: 0, scoredIn: 0, played: 0, lost: 0, position, over: ls.round >= ls.rounds.length };
  for (const round of ls.rounds) for (const f of round) {
    if (!f.score || (f.homeId !== teamId && f.awayId !== teamId)) continue;
    const [gf, ga] = f.homeId === teamId ? f.score : [f.score[1], f.score[0]];
    t.played++; t.gf += gf;
    if (gf > ga) t.won++; else if (gf < ga) t.lost++;
    if (ga === 0) t.cleanSheets++;
    if (gf > 0) t.scoredIn++;
  }
  return t;
}

/** What the season goals need to know about a finished match, your way round. */
export function matchFacts(r: MatchResult, team: Team, rivalId: string): GoalContext['match'] {
  const me = r.away.id === team.id ? 1 : 0;
  const [gf, ga] = me === 0 ? r.score : [r.score[1], r.score[0]];
  const opp = me === 0 ? r.away : r.home;
  let behind = false, h = 0, a = 0;
  for (const g of r.goals) { if (g.side === 0) h++; else a++; if ((me === 0 ? a - h : h - a) > 0) behind = true; }
  const passes = team.players.reduce((n, p) => n + (r.players?.[p.id]?.passes ?? 0), 0);
  return { gf, ga, passes, cameBack: behind && gf > ga, rivalBeaten: opp.id === rivalId && gf > ga };
}

/** Move the goals on. Returns the ones done just now. */
export function updateGoals(goals: SeasonGoal[], ctx: GoalContext): SeasonGoal[] {
  const now: SeasonGoal[] = [];
  for (const g of goals) {
    if (g.done) continue;
    const d = goalDef(g.id);
    if (!d) continue;
    g.progress = Math.min(g.target, Math.max(g.progress, d.measure(ctx)));
    if (g.progress >= g.target) { g.done = true; now.push(g); }
  }
  return now;
}
