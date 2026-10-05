import type { MatchResult } from '../game/MatchScene';
import { loadSave, persist } from './storage';
import type { AgeGroup } from './types';
import type { SeasonRecord } from '../game/league';

/** Everything the sticker album and unlockables are built from. Lives in the save file. */
export interface Progress {
  played: number;
  won: number;
  drawn: number;
  lost: number;
  goalsFor: number;
  goalsAgainst: number;
  trophies: number;
  shootoutsWon: number;
  trainingBest: number;
  agesPlayed: AgeGroup[];
  stickers: string[];
}

export function freshProgress(): Progress {
  return { played: 0, won: 0, drawn: 0, lost: 0, goalsFor: 0, goalsAgainst: 0, trophies: 0, shootoutsWon: 0, trainingBest: 0, agesPlayed: [], stickers: [] };
}

export interface Sticker {
  id: string;
  emoji: string;
  name: string;
  how: string;
  /** Badge icon this sticker unlocks for the badge builder, if any. */
  unlocks?: string;
}

export const STICKERS: Sticker[] = [
  { id: 'first-match', emoji: '🥾', name: 'First Boots', how: 'Finish your first match.' },
  { id: 'first-win', emoji: '🥇', name: 'Winner', how: 'Win a match.', unlocks: '🏆' },
  { id: 'hat-trick', emoji: '🎩', name: 'Hat-trick Hero', how: 'One player scores three goals in a match.', unlocks: '🎩' },
  { id: 'clean-sheet', emoji: '🧤', name: 'Clean Sheet', how: 'Win without letting a goal in.', unlocks: '🧤' },
  { id: 'five-goals', emoji: '🖐️', name: 'High Five', how: 'Score five goals in one match.' },
  { id: 'comeback', emoji: '🔁', name: 'Comeback Kings', how: 'Win after going a goal behind.', unlocks: '🦄' },
  { id: 'shootout', emoji: '🥅', name: 'Spot-kick Star', how: 'Win a penalty shoot-out.', unlocks: '🎯' },
  { id: 'training-10', emoji: '🎯', name: 'Sharp Shooter', how: 'Score 10 points in one training session.' },
  { id: 'trophy', emoji: '🏆', name: 'Champions', how: 'Win a tournament.', unlocks: '🐉' },
  { id: 'two-player', emoji: '👯', name: 'Best Mates', how: 'Play a two-player match.' },
  { id: 'all-ages', emoji: '📏', name: 'Growing Up', how: 'Play a match with a team from every age group.', unlocks: '🦖' },
  { id: 'ten-matches', emoji: '🔟', name: 'Regular', how: 'Finish ten matches.', unlocks: '🌈' },
  { id: 'promoted', emoji: '⬆️', name: 'Going Up!', how: 'Win promotion in League mode.', unlocks: '🏅' },
  { id: 'league-champ', emoji: '👑', name: 'League Legends', how: 'Win the Star Premier League (Tier 1).', unlocks: '🏟️' },
];

export function getProgress(): Progress {
  const save = loadSave();
  if (!save.progress) save.progress = freshProgress();
  return save.progress;
}

export function hasSticker(id: string): boolean {
  return getProgress().stickers.includes(id);
}

/** Badge icons unlocked by stickers earned so far. */
export function unlockedIcons(): string[] {
  const got = getProgress().stickers;
  return STICKERS.filter((s) => s.unlocks && got.includes(s.id)).map((s) => s.unlocks!);
}

/** Icons still locked, with the sticker that unlocks each. */
export function lockedIcons(): { icon: string; sticker: Sticker }[] {
  const got = getProgress().stickers;
  return STICKERS.filter((s) => s.unlocks && !got.includes(s.id)).map((s) => ({ icon: s.unlocks!, sticker: s }));
}

function award(p: Progress, id: string, out: Sticker[]): void {
  if (p.stickers.includes(id)) return;
  const st = STICKERS.find((s) => s.id === id);
  if (!st) return;
  p.stickers.push(id);
  out.push(st);
}

/** Record a finished match, shoot-out or training session and return any new stickers. */
export function recordResult(r: MatchResult): Sticker[] {
  const p = getProgress();
  const out: Sticker[] = [];
  const [h, a] = r.score;
  if (r.mode === 'training') {
    p.trainingBest = Math.max(p.trainingBest, r.trainingPoints);
    if (r.trainingPoints >= 10) award(p, 'training-10', out);
    persist();
    return out;
  }
  if (r.mode === 'shootout') {
    if (h > a) { p.shootoutsWon++; award(p, 'shootout', out); }
    persist();
    return out;
  }
  p.played++;
  p.goalsFor += h;
  p.goalsAgainst += a;
  if (h > a) p.won++; else if (h < a) p.lost++; else p.drawn++;
  if (!p.agesPlayed.includes(r.home.ageGroup)) p.agesPlayed.push(r.home.ageGroup);
  award(p, 'first-match', out);
  if (p.played >= 10) award(p, 'ten-matches', out);
  if (h > a) award(p, 'first-win', out);
  if (h > a && a === 0) award(p, 'clean-sheet', out);
  if (h >= 5) award(p, 'five-goals', out);
  if (r.twoPlayer) award(p, 'two-player', out);
  if (p.agesPlayed.length >= 6) award(p, 'all-ages', out);
  const perScorer = new Map<string, number>();
  let behind = false, home = 0, away = 0;
  for (const g of r.goals) {
    if (g.side === 0) home++; else away++;
    if (away > home) behind = true;
    if (g.side === 0 && !g.ownGoal) perScorer.set(g.scorer.id, (perScorer.get(g.scorer.id) ?? 0) + 1);
  }
  if ([...perScorer.values()].some((n) => n >= 3)) award(p, 'hat-trick', out);
  if (h > a && behind) award(p, 'comeback', out);
  if (r.shootoutWon) { p.shootoutsWon++; award(p, 'shootout', out); }
  persist();
  return out;
}

/** Record the end of a league season and return any new stickers. */
export function recordSeason(rec: SeasonRecord): Sticker[] {
  const p = getProgress();
  const out: Sticker[] = [];
  if (rec.outcome === 'promoted') award(p, 'promoted', out);
  if (rec.outcome === 'champion') award(p, 'league-champ', out);
  persist();
  return out;
}

/** Record a tournament win. */
export function recordTrophy(): Sticker[] {
  const p = getProgress();
  const out: Sticker[] = [];
  p.trophies++;
  award(p, 'trophy', out);
  persist();
  return out;
}
