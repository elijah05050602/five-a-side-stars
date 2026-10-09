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
  /** How many times a sticker that can be won again (a tier title) has been won, by sticker id. */
  counts: Record<string, number>;
}

export function freshProgress(): Progress {
  return { played: 0, won: 0, drawn: 0, lost: 0, goalsFor: 0, goalsAgainst: 0, trophies: 0, shootoutsWon: 0, trainingBest: 0, agesPlayed: [], stickers: [], counts: {} };
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
  { id: 'career-start', emoji: '🌱', name: 'Little Stars', how: 'Start a career with an Under 5s team.' },
  { id: 'star-up', emoji: '⭐', name: 'Rising Star', how: 'A career player earns a new star.', unlocks: '🌟' },
  { id: 'mini-champ', emoji: '🎖️', name: 'Mini Champs', how: 'Win a career mini season.' },
  { id: 'moved-up', emoji: '🎒', name: 'Big School', how: 'Move your career team up an age group.', unlocks: '🎒' },
  { id: 'golden-boot', emoji: '👟', name: 'Golden Boot', how: 'One career player scores 8 goals in a mini season.', unlocks: '👟' },
  { id: 'motm-3', emoji: '🎤', name: 'Star of the Show', how: 'One career player is Player of the Match three times.' },
  { id: 'five-star', emoji: '💫', name: 'Superstar', how: 'A career player reaches five stars in a skill.', unlocks: '💫' },
  { id: 'career-done', emoji: '🎓', name: 'All Grown Up', how: 'Finish the Under 10s year of a career.', unlocks: '🎓' },
  { id: 'star-moment', emoji: '🌟', name: 'Star Moment', how: 'Your career Star reaches a milestone.' },
  { id: 'star-legend', emoji: '🌠', name: 'Legend in the Making', how: 'Your career Star reaches eight milestones.', unlocks: '🌠' },
  { id: 'tier5-champ', emoji: '🌰', name: 'Acorn Champions', how: 'Win the Acorn League (Tier 5) in a career.' },
  { id: 'tier4-champ', emoji: '💧', name: 'Puddle Champions', how: 'Win the Puddle League (Tier 4) in a career.' },
  { id: 'tier3-champ', emoji: '⛈️', name: 'Thunder Champions', how: 'Win the Thunder League (Tier 3) in a career.' },
  { id: 'tier2-champ', emoji: '⚡', name: 'Lightning Champions', how: 'Win the Lightning League (Tier 2) in a career.' },
  { id: 'tier1-champ', emoji: '👑', name: 'Star Premier Champions', how: 'Win the Star Premier League (Tier 1) in a career.', unlocks: '👑' },
  { id: 'all-the-way-up', emoji: '🪜', name: 'All the Way Up', how: 'Win all five tiers in one career.', unlocks: '🪜' },
  { id: 'every-year', emoji: '📆', name: 'Champions Every Year', how: 'Win a title at every age from the Under 5s to the Under 10s in one career.' },
  { id: 'rival-beaten', emoji: '🔥', name: 'Rival Beaten', how: 'Beat your career rival.', unlocks: '🔥' },
  { id: 'rival-master', emoji: '☄️', name: 'Rival Master', how: 'Beat your career rival five times.' },
  { id: 'playoff-hero', emoji: '🎟️', name: 'Play-off Hero', how: 'Win a career play-off to go up.' },
  { id: 'great-escape', emoji: '🛟', name: 'Great Escape', how: 'Win a career play-off to stay up.' },
  { id: 'clean-sweep', emoji: '🧹', name: 'Clean Sweep', how: 'Do all three season goals in a career mini season.', unlocks: '🧹' },
];

/** Stickers that can be won again, with a count on them in the album. */
export const COUNTED_STICKERS = ['clean-sweep', 'tier5-champ', 'tier4-champ', 'tier3-champ', 'tier2-champ', 'tier1-champ', 'rival-beaten', 'playoff-hero', 'great-escape'];

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
  if (COUNTED_STICKERS.includes(id)) { p.counts ??= {}; p.counts[id] = (p.counts[id] ?? 0) + 1; }
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

/** Career milestones; each flag is a sticker that may be new. */
export interface CareerMilestones {
  started?: boolean;
  starUp?: boolean;
  fiveStar?: boolean;
  goldenBoot?: boolean;
  motm3?: boolean;
  champion?: boolean;
  movedUp?: boolean;
  finished?: boolean;
  /** How many milestones the career's Star has reached, when one was just reached. */
  starMilestones?: number;
  /** The tier (1 to 5) whose title was just won. */
  tierTitle?: number | null;
  allTheWayUp?: boolean;
  everyYear?: boolean;
  /** A win over the rival, and how many there have been. */
  rivalWins?: number;
  playoff?: 'up' | 'stayed' | null;
  /** All three season goals done. */
  sweep?: boolean;
}

export function recordCareer(m: CareerMilestones): Sticker[] {
  const p = getProgress();
  const out: Sticker[] = [];
  if (m.started) award(p, 'career-start', out);
  if (m.starUp) award(p, 'star-up', out);
  if (m.fiveStar) award(p, 'five-star', out);
  if (m.goldenBoot) award(p, 'golden-boot', out);
  if (m.motm3) award(p, 'motm-3', out);
  if (m.champion) award(p, 'mini-champ', out);
  if (m.movedUp) award(p, 'moved-up', out);
  if (m.finished) award(p, 'career-done', out);
  if (m.starMilestones && m.starMilestones >= 1) award(p, 'star-moment', out);
  if (m.starMilestones && m.starMilestones >= 8) award(p, 'star-legend', out);
  if (m.tierTitle) award(p, `tier${m.tierTitle}-champ`, out);
  if (m.allTheWayUp) award(p, 'all-the-way-up', out);
  if (m.everyYear) award(p, 'every-year', out);
  if (m.rivalWins) award(p, 'rival-beaten', out);
  if (m.rivalWins && m.rivalWins >= 5) award(p, 'rival-master', out);
  if (m.playoff === 'up') award(p, 'playoff-hero', out);
  if (m.playoff === 'stayed') award(p, 'great-escape', out);
  if (m.sweep) award(p, 'clean-sweep', out);
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
