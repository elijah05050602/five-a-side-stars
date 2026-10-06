import type { Difficulty, Team } from '../data/types';
import { IDLE_INPUT, MatchSim } from './sim';

/**
 * Computer-vs-computer matches: the rest of a league round, or the other cup semi-final. A whole
 * match takes the sim a noticeable moment (well over 100 ms on a fast laptop, more on a phone), so
 * the game plays them in a Web Worker while the child plays their own match, and the results are
 * ready at the final whistle. Without workers (tests, very old browsers) they run right here.
 */
export interface SimJob {
  home: Team;
  away: Team;
  difficulty: Difficulty;
  halfSeconds: number;
  /** League strength for both sides (see SimConfig.cpuLevel). */
  cpuLevel?: number;
  /** A cup tie: a draw goes to penalties. */
  pens?: boolean;
}

export interface SimOutcome { score: [number, number]; pens: [number, number] | null }

/** The other semi-final, and the final the side that knocks you out would play, in case they do. */
export interface CupAhead { semi2: SimOutcome; finalIfOut: SimOutcome }

export type BackgroundRequest =
  | { kind: 'round'; jobs: (SimJob | null)[] }
  | { kind: 'cup'; semi2: SimJob; opponent: Team };

export type BackgroundResult =
  | { kind: 'round'; outcomes: (SimOutcome | null)[] }
  | { kind: 'cup'; ahead: CupAhead };

/** Background matches are capped at this half length, so a long league setting does not mean a long wait. */
const MAX_HALF = 90;

/** Play one computer-vs-computer match to the end in one go. */
export function playOut(job: SimJob): SimOutcome {
  const sim = new MatchSim({ home: job.home, away: job.away, difficulty: job.difficulty, halfSeconds: Math.min(job.halfSeconds, MAX_HALF), humanSide: null, cpuLevel: job.cpuLevel });
  let guard = 0;
  while (sim.phase !== 'fulltime' && guard++ < 60 * 60 * 20) { sim.step(1 / 60, IDLE_INPUT); sim.events.length = 0; }
  const score = [...sim.score] as [number, number];
  if (!job.pens || score[0] !== score[1]) return { score, pens: null };
  const so = new MatchSim({ home: job.home, away: job.away, difficulty: job.difficulty, halfSeconds: 60, humanSide: null, mode: 'shootout', cpuLevel: job.cpuLevel });
  guard = 0;
  while (so.phase !== 'fulltime' && guard++ < 60 * 60 * 5) { so.step(1 / 60, IDLE_INPUT); so.events.length = 0; }
  return { score, pens: [...so.score] as [number, number] };
}

/** Which side won a played-out tie (a shoot-out that somehow never settled goes to the home side). */
export const homeWon = (o: SimOutcome): boolean => o.score[0] !== o.score[1] ? o.score[0] > o.score[1] : !o.pens || o.pens[0] >= o.pens[1];

/** Do the work of a request on this thread. */
export function runBackground(req: BackgroundRequest): BackgroundResult {
  if (req.kind === 'round') return { kind: 'round', outcomes: req.jobs.map((j) => (j ? playOut(j) : null)) };
  const semi2 = playOut(req.semi2);
  const finalist = homeWon(semi2) ? req.semi2.home : req.semi2.away;
  const finalIfOut = playOut({ ...req.semi2, home: req.opponent, away: finalist });
  return { kind: 'cup', ahead: { semi2, finalIfOut } };
}

/** Do the work of a request in a Web Worker when there is one, falling back to this thread. */
export function inBackground(req: BackgroundRequest): Promise<BackgroundResult> {
  if (typeof Worker === 'undefined') return Promise.resolve().then(() => runBackground(req));
  return new Promise((resolve) => {
    let worker: Worker;
    try {
      worker = new Worker(new URL('./simWorker.ts', import.meta.url), { type: 'module' });
    } catch {
      resolve(runBackground(req));
      return;
    }
    worker.onmessage = (e: MessageEvent<BackgroundResult>) => { worker.terminate(); resolve(e.data); };
    worker.onerror = () => { worker.terminate(); resolve(runBackground(req)); };
    worker.postMessage(req);
  });
}
