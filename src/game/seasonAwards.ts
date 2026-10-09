import type { Position } from '../data/types';
import type { Tally } from './league';

/**
 * End-of-season awards for the whole league (league mode and every career mini season), from the
 * season's stats: the Golden Boot, and the best midfielder, defender and keeper. Clean sheets count
 * most for defenders and keepers. Names are plain text here; the screens escape them.
 */
export type SeasonAwardId = 'golden-boot' | 'best-mid' | 'best-def' | 'best-keeper';

export interface SeasonAward {
  id: SeasonAwardId;
  playerId: string;
  name: string;
  /** The club they played for, by team id. */
  club: string;
  /** Why, in a few words: "9 goals", "4 clean sheets, 21 saves". */
  line: string;
}

export const SEASON_AWARDS: Record<SeasonAwardId, { emoji: string; title: string }> = {
  'golden-boot': { emoji: '👟', title: 'Golden Boot' },
  'best-mid': { emoji: '🎯', title: 'Best Midfielder' },
  'best-def': { emoji: '🛡️', title: 'Best Defender' },
  'best-keeper': { emoji: '🧤', title: 'Best Goalkeeper' },
};
export const SEASON_AWARD_IDS = Object.keys(SEASON_AWARDS) as SeasonAwardId[];

const plural = (n: number, one: string) => `${n} ${one}${n === 1 ? '' : 's'}`;
/** Where they play. A tally from before positions were kept only knows who kept goal. */
const posOf = (t: Tally): Position | null => (t.gk ? 'GK' : t.pos ?? null);

/**
 * The season's award winners. `clubs` limits them to the clubs in this league (the career's tally
 * can hold other tiers too). An award nobody earned (no goals, nobody in that position) is left out.
 */
export function seasonAwards(tally: Record<string, Tally>, clubs?: readonly string[] | null): SeasonAward[] {
  const rows = Object.entries(tally).filter(([, t]) => t.p > 0 && (!clubs || clubs.includes(t.club)));
  const out: SeasonAward[] = [];
  const add = (id: SeasonAwardId, list: [string, Tally][], score: (t: Tally) => number, line: (t: Tally) => string) => {
    const best = [...list].sort((a, b) => score(b[1]) - score(a[1]) || a[1].name.localeCompare(b[1].name))[0];
    if (best && score(best[1]) > 0) out.push({ id, playerId: best[0], name: best[1].name, club: best[1].club, line: line(best[1]) });
  };
  add('golden-boot', rows, (t) => t.g * 100 + t.a, (t) => plural(t.g, 'goal'));
  // Midfielders and wingers: goals they make and score, and Player of the Match awards.
  add('best-mid', rows.filter(([, t]) => posOf(t) === 'MID' || posOf(t) === 'WING'), (t) => t.a * 3 + t.g * 2 + t.motm * 2 + 0.01 * t.p,
    (t) => `${plural(t.a, 'assist')}, ${plural(t.g, 'goal')}`);
  add('best-def', rows.filter(([, t]) => posOf(t) === 'DEF'), (t) => t.cs * 100 + t.motm * 10 + t.g + t.a + 0.01 * t.p,
    (t) => plural(t.cs, 'clean sheet'));
  add('best-keeper', rows.filter(([, t]) => posOf(t) === 'GK'), (t) => t.cs * 1000 + t.sv + 0.01 * t.p,
    (t) => `${plural(t.cs, 'clean sheet')}, ${plural(t.sv, 'save')}`);
  return out;
}

/** The awards won by your club's players. */
export const awardsFor = (awards: readonly SeasonAward[] | undefined, clubId: string): SeasonAward[] => (awards ?? []).filter((a) => a.club === clubId);
