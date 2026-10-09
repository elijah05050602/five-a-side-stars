import type { AgeGroup, Player, Team } from '../data/types';
import type { PlayerSeasonStats } from './career';

/**
 * Awards night at the end of every career year: the squad's best of the year, from what they did
 * on the pitch that year. Names are plain text here; the screens escape them.
 */
export interface Award {
  id: 'golden-boot' | 'best-keeper' | 'player-of-year' | 'young-player' | 'goal-of-year';
  emoji: string;
  title: string;
  playerId: string;
  name: string;
  /** Why, in a few words: "12 goals", "3 clean sheets". */
  line: string;
}

export interface AwardsNight { age: AgeGroup; awards: Award[] }

const plural = (n: number, one: string) => `${n} ${one}${n === 1 ? '' : 's'}`;

/**
 * The year's awards for a squad. `year` is each player's numbers for the year; `newcomer` is the
 * player signed at this year's Trial Day, if they are still here. An award nobody earned (no
 * goals, no super goals) is left out.
 */
export function awardsNight(team: Team, year: Record<string, PlayerSeasonStats>, newcomer: string | null): Award[] {
  const players = team.players.filter((p) => (year[p.id]?.played ?? 0) > 0);
  const st = (p: Player) => year[p.id];
  const best = (list: Player[], score: (p: Player) => number): Player | null => {
    const sorted = [...list].sort((a, b) => score(b) - score(a));
    return sorted[0] && score(sorted[0]) > 0 ? sorted[0] : null;
  };
  const out: Award[] = [];
  const add = (id: Award['id'], emoji: string, title: string, p: Player | null, line: (p: Player) => string) => {
    if (p) out.push({ id, emoji, title, playerId: p.id, name: p.name, line: line(p) });
  };
  add('player-of-year', '🌟', 'Player of the Year', best(players, (p) => st(p).motm * 10 + st(p).goals + st(p).assists + st(p).saves / 4 + st(p).tackles / 4),
    (p) => (st(p).motm ? `${plural(st(p).motm, 'Player of the Match award')}` : `${st(p).played} matches`));
  add('golden-boot', '👟', 'Golden Boot', best(players, (p) => st(p).goals * 10 + st(p).assists), (p) => plural(st(p).goals, 'goal'));
  add('best-keeper', '🧤', 'Best Keeper', best(players.filter((p) => p.position === 'GK'), (p) => st(p).cleanSheets * 5 + st(p).saves + 0.1),
    (p) => `${plural(st(p).saves, 'save')}, ${plural(st(p).cleanSheets, 'clean sheet')}`);
  add('goal-of-year', '💫', 'Goal of the Year', best(players, (p) => st(p).superGoals ?? 0), () => 'a super-skill goal');
  const young = newcomer ? players.find((p) => p.id === newcomer) ?? null : null;
  add('young-player', '🌱', 'Best Young Player', young, (p) => `${st(p).played} matches in their first year`);
  return out;
}
