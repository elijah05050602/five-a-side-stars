import type { SuperKind } from './supers';

/**
 * What the match effects need to know about one player. Live play reads it from the sim; a goal replay
 * reads it from the recorded frame, so the effects follow the players as they were at that moment.
 */
export interface FxPlayer {
  x: number;
  z: number;
  speed: number;
  /** The super they are in the middle of, or null. */
  superKind: SuperKind | null;
  /** How many puffs of dust they kick up: 4 in a tackle, 7 in a dive, 0 otherwise. */
  puff: number;
}

/** The player whose super lasts a while (a dash, a slide, the gloves) and glows round them, or -1. */
export function lastingSuper(players: readonly FxPlayer[]): number {
  return players.findIndex((p) => p.superKind !== null && p.superKind !== 'rocket' && p.superKind !== 'magic');
}

/** The players who started a super between two frames of a replay, so its burst of light plays again there. */
export function startedSupers(before: readonly FxPlayer[], after: readonly FxPlayer[]): number[] {
  const out: number[] = [];
  after.forEach((p, i) => { if (p.superKind && before[i]?.superKind !== p.superKind) out.push(i); });
  return out;
}

/** How many puffs a tackle or a dive kicks up (none when neither). */
export function puffsFor(tackle: number, dive: number): number {
  return dive > 0.4 ? 7 : tackle > 0.25 ? 4 : 0;
}
