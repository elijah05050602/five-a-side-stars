import { generateOpponent } from '../data/defaults';
import type { Difficulty, Team } from '../data/types';
import { MatchSim } from './sim';
import { IDLE_INPUT } from './sim';
import type { MatchResult } from './MatchScene';

export interface Fixture {
  home: Team;
  away: Team;
  score: [number, number] | null;
  /** Shoot-out score when the match was drawn. */
  pens: [number, number] | null;
  winnerId: string | null;
}

export interface TournamentState {
  humanTeamId: string;
  difficulty: Difficulty;
  halfSeconds: number;
  twoPlayer: boolean;
  semis: [Fixture, Fixture];
  final: Fixture | null;
  stage: 'semi' | 'final' | 'done';
  /** True while the human's current fixture ended level and needs a shoot-out. */
  needsShootout: boolean;
  trophyRecorded?: boolean;
}

const fixture = (home: Team, away: Team): Fixture => ({ home, away, score: null, pens: null, winnerId: null });

/** Four teams: yours plus three computer teams of the same age group. */
export function createTournament(human: Team, difficulty: Difficulty, halfSeconds: number, twoPlayer = false, second?: Team): TournamentState {
  const used = [human.kit, ...(second ? [second.kit] : [])];
  const cpus: Team[] = [];
  while (cpus.length < (second ? 2 : 3)) {
    const t = generateOpponent(human.ageGroup, used[cpus.length % used.length]);
    if (!cpus.some((c) => c.name === t.name) && t.name !== human.name) cpus.push(t);
  }
  const others = second ? [second, ...cpus] : cpus;
  return {
    humanTeamId: human.id,
    difficulty,
    halfSeconds,
    twoPlayer,
    semis: [fixture(human, others[0]), fixture(others[1], others[2])],
    final: null,
    stage: 'semi',
    needsShootout: false,
  };
}

/** The fixture the human plays next, or null once they are out or the cup is over. */
export function currentFixture(s: TournamentState): Fixture | null {
  if (s.stage === 'semi') return s.semis[0];
  if (s.stage === 'final' && s.final) return s.final;
  return null;
}

export function humanStillIn(s: TournamentState): boolean {
  if (s.stage === 'semi') return true;
  if (s.stage === 'final') return s.final !== null && (s.final.home.id === s.humanTeamId || s.final.away.id === s.humanTeamId);
  return s.final?.winnerId === s.humanTeamId;
}

/** Run a whole computer-vs-computer match in one go (a few milliseconds). */
export function simulateFixture(f: Fixture, difficulty: Difficulty, halfSeconds: number): void {
  const sim = new MatchSim({ home: f.home, away: f.away, difficulty, halfSeconds: Math.min(halfSeconds, 90), humanSide: null });
  let guard = 0;
  while (sim.phase !== 'fulltime' && guard++ < 60 * 60 * 20) { sim.step(1 / 60, IDLE_INPUT); sim.events.length = 0; }
  f.score = [...sim.score] as [number, number];
  if (f.score[0] !== f.score[1]) { f.winnerId = f.score[0] > f.score[1] ? f.home.id : f.away.id; return; }
  const so = new MatchSim({ home: f.home, away: f.away, difficulty, halfSeconds: 60, humanSide: null, mode: 'shootout' });
  guard = 0;
  while (so.phase !== 'fulltime' && guard++ < 60 * 60 * 5) { so.step(1 / 60, IDLE_INPUT); so.events.length = 0; }
  f.pens = [...so.score] as [number, number];
  // A shoot-out that somehow never settled goes to the home side.
  f.winnerId = f.pens[1] > f.pens[0] ? f.away.id : f.home.id;
}

/**
 * Feed a finished human match (or shoot-out) into the bracket and move it on.
 * Returns true when the result settled a fixture (so the next stage is ready).
 */
export function applyResult(s: TournamentState, r: MatchResult): void {
  const f = currentFixture(s);
  if (!f) return;
  if (r.mode === 'shootout') {
    f.pens = [...r.score] as [number, number];
    f.winnerId = f.pens[0] > f.pens[1] ? f.home.id : f.away.id;
  } else {
    f.score = [...r.score] as [number, number];
    if (f.score[0] === f.score[1]) { s.needsShootout = true; return; }
    f.winnerId = f.score[0] > f.score[1] ? f.home.id : f.away.id;
  }
  s.needsShootout = false;
  if (s.stage === 'semi') {
    simulateFixture(s.semis[1], s.difficulty, s.halfSeconds);
    const w1 = f.winnerId === f.home.id ? f.home : f.away;
    const w2 = s.semis[1].winnerId === s.semis[1].home.id ? s.semis[1].home : s.semis[1].away;
    // The human (or their conqueror) is always listed first in the final.
    s.final = fixture(w1, w2);
    s.stage = 'final';
    if (w1.id !== s.humanTeamId) { simulateFixture(s.final, s.difficulty, s.halfSeconds); s.stage = 'done'; }
  } else if (s.stage === 'final') {
    s.stage = 'done';
  }
}

export function teamById(s: TournamentState, id: string | null): Team | null {
  if (!id) return null;
  for (const f of [...s.semis, ...(s.final ? [s.final] : [])]) {
    if (f.home.id === id) return f.home;
    if (f.away.id === id) return f.away;
  }
  return null;
}
