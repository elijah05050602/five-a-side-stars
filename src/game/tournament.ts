import { generateOpponent } from '../data/defaults';
import type { Difficulty, Team } from '../data/types';
import { homeWon, playOut, type BackgroundRequest, type CupAhead, type SimOutcome } from './background';
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
  const humans = humanTeams(s);
  if (s.stage === 'final') return s.final !== null && (humans.includes(s.final.home.id) || humans.includes(s.final.away.id));
  return humans.includes(s.final?.winnerId ?? '');
}

/** Write a played-out tie into the bracket (a shoot-out that somehow never settled goes to the home side). */
function settle(f: Fixture, o: SimOutcome): void {
  f.score = o.score;
  f.pens = o.pens;
  f.winnerId = homeWon(o) ? f.home.id : f.away.id;
}

/** Play a whole computer-vs-computer tie here and now, penalties included (see background.ts for the cost). */
export function simulateFixture(f: Fixture, difficulty: Difficulty, halfSeconds: number): void {
  settle(f, playOut({ home: f.home, away: f.away, difficulty, halfSeconds, pens: true }));
}

/** The teams humans control in this cup: yours, and Player 2's in a two-player cup (they meet in the first semi). */
const humanTeams = (s: TournamentState): string[] => (s.twoPlayer ? [s.humanTeamId, s.semis[0].away.id] : [s.humanTeamId]);

/** During your semi-final: the other semi, and the final your opponent would play if they beat you, to play in the background. */
export function cupAheadRequest(s: TournamentState): BackgroundRequest | null {
  if (s.stage !== 'semi') return null;
  const yours = s.semis[0];
  const opponent = yours.home.id === s.humanTeamId ? yours.away : yours.home;
  return { kind: 'cup', semi2: { home: s.semis[1].home, away: s.semis[1].away, difficulty: s.difficulty, halfSeconds: s.halfSeconds, pens: true }, opponent };
}

/**
 * Feed a finished human match (or shoot-out) into the bracket and move it on. `ahead` holds the
 * computer ties already played in the background (see cupAheadRequest); without it they are played here.
 */
export function applyResult(s: TournamentState, r: MatchResult, ahead?: CupAhead): void {
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
    if (ahead) settle(s.semis[1], ahead.semi2);
    else simulateFixture(s.semis[1], s.difficulty, s.halfSeconds);
    const w1 = f.winnerId === f.home.id ? f.home : f.away;
    const w2 = s.semis[1].winnerId === s.semis[1].home.id ? s.semis[1].home : s.semis[1].away;
    // The human (or their conqueror) is always listed first in the final.
    s.final = fixture(w1, w2);
    s.stage = 'final';
    // Knocked out: the computer finishes the cup. (In a two-player cup the semi winner is always a human, who plays on.)
    if (!humanTeams(s).includes(w1.id)) {
      if (ahead) settle(s.final, ahead.finalIfOut);
      else simulateFixture(s.final, s.difficulty, s.halfSeconds);
      s.stage = 'done';
    }
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
