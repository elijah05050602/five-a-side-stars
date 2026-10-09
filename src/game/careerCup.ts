import type { AgeGroup } from '../data/types';
import { AGE_STATS } from '../data/ageGroups';
import { clubById, quickMatch, tierOf, type CareerWorld, type WorldClub } from './careerWorld';
import { tallyMatch } from './league';

/**
 * The career's cup: once a year, between the 2nd and 3rd mini seasons, eight clubs from the world
 * (you and seven from your tier and the ones around it) play a knockout. One match a round, a draw
 * goes to penalties. Your ties are played for real; the others are worked out at once like the
 * other tiers' matches.
 */
export interface CupTie {
  homeId: string;
  awayId: string;
  score: [number, number] | null;
  pens: [number, number] | null;
  /** Null until decided (a drawn tie of yours waits for its shoot-out). */
  winnerId: string | null;
}

export interface CareerCup {
  /** The career year it is played in (1 is the Under 5s). */
  year: number;
  age: AgeGroup;
  /** Quarter-finals, semi-finals, final; a round is added once the one before is decided. */
  rounds: CupTie[][];
  /** The round being played now (0 to 2), or 3 once the cup is over. */
  round: number;
  /** You were knocked out. */
  out: boolean;
}

export const CUP_ROUNDS = ['Quarter-final', 'Semi-final', 'Final'];
export const CUP_SIZE = 8;

export const cupName = (cup: Pick<CareerCup, 'age'>): string => `${AGE_STATS[cup.age].label} Cup`;
export const cupOver = (cup: CareerCup): boolean => cup.round >= CUP_ROUNDS.length;
export const cupWinner = (cup: CareerCup): string | null => (cupOver(cup) ? cup.rounds[CUP_ROUNDS.length - 1][0].winnerId : null);
/** How far you got: 0 out in the quarter-finals, 1 the semis, 2 the final, 3 won it. */
export const cupReached = (cup: CareerCup, youId: string): number => (cupWinner(cup) === youId ? 3 : Math.max(0, cup.rounds.findIndex((r) => r.some((t) => (t.homeId === youId || t.awayId === youId) && t.winnerId && t.winnerId !== youId))));

function shuffle<T>(list: T[]): T[] {
  const out = [...list];
  for (let i = out.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [out[i], out[j]] = [out[j], out[i]]; }
  return out;
}

/** Seven clubs to join you: three from your tier and two each from the tiers either side (or more from yours at the top and bottom). */
function entrants(w: CareerWorld, youId: string): WorldClub[] {
  const mine = tierOf(w, youId);
  const from = (tier: number) => shuffle(w.clubs.filter((c) => c.tier === tier));
  const above = from(mine - 1), same = from(mine), below = from(mine + 1);
  const picked = [...same.splice(0, 3), ...above.splice(0, 2), ...below.splice(0, 2)];
  // Fill up from whatever is left nearest to you.
  for (const pool of [same, above, below, shuffle(w.clubs)]) {
    while (picked.length < CUP_SIZE - 1 && pool.length) {
      const c = pool.shift()!;
      if (!picked.includes(c)) picked.push(c);
    }
  }
  return picked;
}

export function createCup(w: CareerWorld, youId: string, year: number, age: AgeGroup): CareerCup {
  const ids = shuffle([youId, ...entrants(w, youId).map((c) => c.team.id)]);
  const ties: CupTie[] = [];
  for (let i = 0; i < ids.length; i += 2) ties.push({ homeId: ids[i], awayId: ids[i + 1], score: null, pens: null, winnerId: null });
  return { year, age, rounds: [ties], round: 0, out: false };
}

/** Your tie in the round being played, while you are still in. */
export function yourTie(cup: CareerCup, youId: string): CupTie | null {
  if (cup.out || cupOver(cup)) return null;
  return cup.rounds[cup.round].find((t) => t.homeId === youId || t.awayId === youId) ?? null;
}

/** A shoot-out between two computer clubs: the stronger one is a little likelier to win it. */
function quickPens(home: WorldClub, away: WorldClub): [number, number] {
  const homeWins = Math.random() < 0.5 + (home.strength - away.strength) * 0.5;
  const loser = 2 + Math.floor(Math.random() * 3);
  return homeWins ? [loser + 1, loser] : [loser, loser + 1];
}

/** Play out a tie between two computer clubs. */
function playTie(w: CareerWorld, t: CupTie): void {
  const home = clubById(w, t.homeId), away = clubById(w, t.awayId);
  if (!home || !away) { t.score = [0, 0]; t.winnerId = home ? t.homeId : t.awayId; return; }
  const m = quickMatch(home, away);
  t.score = m.score;
  tallyMatch([w.tally], home.team, away.team, m.score, m.lines, null);
  if (m.score[0] === m.score[1]) t.pens = quickPens(home, away);
  const [a, b] = t.pens ?? m.score;
  t.winnerId = a > b ? t.homeId : t.awayId;
}

/** Once every tie in the round is decided: the next round's draw (winners in bracket order), or the end of the cup. */
function nextRound(cup: CareerCup): void {
  const done = cup.rounds[cup.round];
  if (done.some((t) => !t.winnerId)) return;
  cup.round++;
  if (cupOver(cup)) return;
  const winners = done.map((t) => t.winnerId!);
  const ties: CupTie[] = [];
  for (let i = 0; i < winners.length; i += 2) ties.push({ homeId: winners[i], awayId: winners[i + 1], score: null, pens: null, winnerId: null });
  cup.rounds.push(ties);
}

/**
 * Settle the round after your tie is decided: the other ties are played, and the next round is
 * drawn. Once you are out, the rest of the cup is played to the end at once.
 */
export function settleCup(w: CareerWorld, cup: CareerCup, youId: string): void {
  for (let guard = 0; guard < 4 && !cupOver(cup); guard++) {
    const mine = yourTie(cup, youId);
    if (mine && !mine.winnerId) return;
    for (const t of cup.rounds[cup.round]) if (!t.winnerId) playTie(w, t);
    if (mine && mine.winnerId !== youId) cup.out = true;
    nextRound(cup);
    if (!cup.out) return;
  }
}

/**
 * Record your cup match (scores your way round) or its shoot-out. A draw waits for the shoot-out.
 * Returns false when there is no tie of yours to record.
 */
export function recordCupResult(w: CareerWorld, cup: CareerCup, youId: string, gf: number, ga: number, shootout: boolean): boolean {
  const t = yourTie(cup, youId);
  if (!t) return false;
  const home = t.homeId === youId;
  if (shootout) {
    if (!t.score || t.winnerId || t.score[0] !== t.score[1]) return false;
    t.pens = home ? [gf, ga] : [ga, gf];
    t.winnerId = gf > ga ? youId : home ? t.awayId : t.homeId;
  } else {
    if (t.score) return false;
    t.score = home ? [gf, ga] : [ga, gf];
    if (gf !== ga) t.winnerId = gf > ga ? youId : home ? t.awayId : t.homeId;
  }
  settleCup(w, cup, youId);
  return true;
}
