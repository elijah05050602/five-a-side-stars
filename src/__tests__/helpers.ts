import { makeKit, makePlayer, makeTeam } from '../data/defaults';
import type { AgeGroup, Team } from '../data/types';
import { IDLE_INPUT, MatchSim, type SimConfig } from '../game/sim';

/** A fixed team with named players, so test output is readable. */
export function team(id: string, name: string, ageGroup: AgeGroup = 'U8', shirt = '#e63946'): Team {
  return makeTeam({
    id,
    name,
    ageGroup,
    kit: makeKit(shirt, '#ffffff', '#1b2a41', shirt, 'plain'),
    players: [
      makePlayer('GK', 1, `${name} GK`), makePlayer('DEF', 4, `${name} D1`), makePlayer('DEF', 5, `${name} D2`),
      makePlayer('ATT', 7, `${name} A1`), makePlayer('ATT', 9, `${name} A2`),
    ],
  });
}

export function cpuMatch(over: Partial<SimConfig> = {}): MatchSim {
  return new MatchSim({ home: team('h', 'Home'), away: team('a', 'Away'), difficulty: 'normal', halfSeconds: 20, humanSide: null, ...over });
}

/** Step the sim until a condition holds or the guard runs out. Returns the steps taken. */
export function runUntil(sim: MatchSim, done: (s: MatchSim) => boolean, maxSteps = 60 * 60 * 10): number {
  let n = 0;
  while (!done(sim) && n < maxSteps) { sim.step(1 / 60, IDLE_INPUT); sim.events.length = 0; n++; }
  return n;
}
