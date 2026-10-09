import type { Team } from '../data/types';
import { applyLeagueResult, roundJobs, seasonOver, tierInfo, yourPosition, type LeagueState } from './league';
import { currentFixture, type TournamentState } from './tournament';
import type { SimOutcome } from './background';
import type { MatchResult } from './MatchScene';
import type { Side } from './sim';

/**
 * Winning something: the trophy lift at the final whistle. Five levels, from the Acorn League (1) to the
 * Star Premier League and cup finals (5); each level brings a bigger trophy and a grander show.
 */
export type TrophyLevel = 1 | 2 | 3 | 4 | 5;
/** A gold star on a stand, a shield, or the big cup with handles. */
export type TrophyKind = 'star' | 'shield' | 'cup';

export interface TrophyWin {
  level: TrophyLevel;
  kind: TrophyKind;
  /** Silver or gold. */
  gold: boolean;
  /** What was won, for the banner: "Acorn League champions". */
  title: string;
  /** The side in the match that lifts it. */
  side: Side;
}

/** League tier 5 (the Acorn League) is level 1; tier 1 (the Star Premier League) is level 5. */
export const levelForTier = (tier: number): TrophyLevel => Math.min(5, Math.max(1, 6 - Math.round(tier))) as TrophyLevel;

/** The trophy for a level: a star, then shields (silver, silver, gold), then the gold cup. */
export function trophyLook(level: TrophyLevel): { kind: TrophyKind; gold: boolean } {
  if (level === 1) return { kind: 'star', gold: true };
  if (level === 5) return { kind: 'cup', gold: true };
  return { kind: 'shield', gold: level === 4 };
}

const win = (level: TrophyLevel, title: string, side: Side): TrophyWin => ({ level, ...trophyLook(level), title, side });

/**
 * Does this match win the league? Only the season's last match can, and only when the player ends it top.
 * The rest of the round must already be played (`others`, from the background), so the table here is the
 * one the results screen will show; without them there is no ceremony rather than a wrong one.
 * Changes nothing: it works on a copy.
 */
export function leagueTrophy(ls: LeagueState, you: Team, r: MatchResult, others?: (SimOutcome | null)[]): TrophyWin | null {
  if (r.mode !== 'match' || seasonOver(ls) || ls.round !== ls.rounds.length - 1) return null;
  const jobs = roundJobs(ls, you);
  if (jobs.some((j, i) => j !== null && !others?.[i])) return null;
  const copy = structuredClone(ls);
  applyLeagueResult(copy, you, r, others);
  if (!seasonOver(copy) || yourPosition(copy, you) !== 1) return null;
  const side: Side = r.home.id === you.id ? 0 : 1;
  return win(levelForTier(ls.tier), `${tierInfo(ls.tier).name} champions`, side);
}

/**
 * Does this match win the cup? The final (or the shoot-out that settles it), won by a team a player
 * controls. A drawn final goes to penalties, so only the shoot-out's winner lifts the cup then.
 */
export function cupTrophy(t: TournamentState, r: MatchResult): TrophyWin | null {
  if (t.stage !== 'final' || !currentFixture(t)) return null;
  if (r.mode !== 'match' && r.mode !== 'shootout') return null;
  const [h, a] = r.score;
  if (h === a) return null;
  const side: Side = h > a ? 0 : 1;
  const humans = [t.humanTeamId, ...(t.twoPlayer ? [t.semis[0].away.id] : [])];
  const winner = side === 0 ? r.home : r.away;
  return humans.includes(winner.id) ? win(5, 'Cup winners', side) : null;
}

/**
 * Does this match win a promotion play-off? Only the play-off that takes you up a tier counts (staying
 * up is a relief, not a trophy). `up` and `played` describe the play-off before this match is recorded:
 * `played` is null before the match, and has `won: null` while the shoot-out that settles a draw waits.
 */
export function playoffTrophy(tier: number, up: boolean, played: { won: boolean | null } | null, you: Team, r: MatchResult): TrophyWin | null {
  if (!up) return null;
  if (r.mode === 'match' ? played !== null : r.mode !== 'shootout' || played?.won !== null) return null;
  const side: Side = r.home.id === you.id ? 0 : 1;
  const [h, a] = r.score;
  if (h === a || (h > a) !== (side === 0)) return null;
  return win(levelForTier(tier), 'Play-off winners', side);
}
