import type { AgeGroup, Player, Position, SkillKey, Skills } from './types';
import { SKILL_KEYS } from './types';

export const MAX_STARS = 5;
export const MIN_STARS = 1;

/**
 * Age group sets the ceiling. Little ones cannot reach five stars however
 * hard they train; the cap rises as a career team moves up a year.
 */
export const STAR_CAP: Record<AgeGroup, number> = { U5: 2, U6: 3, U7: 3, U8: 4, U9: 4, U10: 5 };

/**
 * Stars to share out across the four skills of one player in the team
 * builder (and the average a computer team of that age plays with).
 */
export const STAR_BUDGET: Record<AgeGroup, number> = { U5: 6, U6: 8, U7: 9, U8: 11, U9: 12, U10: 14 };

/** A typical star in one skill for this age: the budget spread evenly. */
export const averageStars = (age: AgeGroup): number => STAR_BUDGET[age] / SKILL_KEYS.length;

export const SKILL_LABELS: Record<'outfield' | 'keeper', Record<SkillKey, { label: string; blurb: string; emoji: string }>> = {
  outfield: {
    speed: { label: 'Speed', blurb: 'How fast they run.', emoji: '⚡' },
    shooting: { label: 'Shooting', blurb: 'Harder, straighter shots.', emoji: '🎯' },
    passing: { label: 'Passing', blurb: 'Tidy passes and a soft first touch.', emoji: '🤝' },
    defending: { label: 'Defending', blurb: 'Wins more tackles.', emoji: '🛡️' },
  },
  keeper: {
    speed: { label: 'Speed', blurb: 'How fast they move across the goal.', emoji: '⚡' },
    shooting: { label: 'Handling', blurb: 'Holds on to the ball instead of spilling it.', emoji: '🧤' },
    passing: { label: 'Kicking', blurb: 'Clean throws and clearances.', emoji: '🦶' },
    defending: { label: 'Diving', blurb: 'Reaches shots in the corners.', emoji: '🤸' },
  },
};

export const skillLabels = (position: Position) => SKILL_LABELS[position === 'GK' ? 'keeper' : 'outfield'];

export const clampStars = (n: number, age?: AgeGroup): number => Math.max(MIN_STARS, Math.min(age ? STAR_CAP[age] : MAX_STARS, Math.round(n)));

export const totalStars = (s: Skills): number => SKILL_KEYS.reduce((n, k) => n + s[k], 0);

/** Stars left to spend for a player of this age. Negative when over budget (after an age change). */
export const starsLeft = (s: Skills, age: AgeGroup): number => STAR_BUDGET[age] - totalStars(s);

export const starsText = (n: number, cap = MAX_STARS): string => '★'.repeat(n) + '☆'.repeat(Math.max(0, cap - n));

/** Which skills a position leans on; used when spreading stars at random. */
const WEIGHTS: Record<Position, Skills> = {
  GK: { speed: 1, shooting: 2, passing: 1, defending: 3 },
  DEF: { speed: 1.5, shooting: 0.6, passing: 1.4, defending: 2.5 },
  ATT: { speed: 2, shooting: 2.5, passing: 1.4, defending: 0.6 },
};

/** Spend the whole budget for this age at random, leaning towards what the position needs. */
export function randomSkills(position: Position, age: AgeGroup): Skills {
  const cap = STAR_CAP[age];
  const s: Skills = { speed: 1, shooting: 1, passing: 1, defending: 1 };
  let left = STAR_BUDGET[age] - SKILL_KEYS.length;
  const w = WEIGHTS[position];
  let guard = 0;
  while (left > 0 && guard++ < 100) {
    const open = SKILL_KEYS.filter((k) => s[k] < cap);
    if (!open.length) break;
    const total = open.reduce((n, k) => n + w[k], 0);
    let r = Math.random() * total;
    let pick = open[open.length - 1];
    for (const k of open) { r -= w[k]; if (r <= 0) { pick = k; break; } }
    s[pick]++;
    left--;
  }
  return s;
}

/**
 * Make a player's stars legal for an age group: nothing above the cap, nothing
 * below one. Used when a team changes age group in the builder. Stars over the
 * budget are left for the builder to point out; stars under it are a gift.
 */
export function fitSkills(p: Player, age: AgeGroup): Skills {
  const s = { ...p.skills };
  for (const k of SKILL_KEYS) s[k] = clampStars(s[k], age);
  return s;
}

/** Players saved before stars existed get a sensible spread for their team's age. */
export function ensureSkills(p: Player, age: AgeGroup): Player {
  const raw = (p as Partial<Player>).skills;
  const ok = raw && SKILL_KEYS.every((k) => Number.isFinite(raw[k]));
  return { ...p, skills: ok ? { ...raw } : randomSkills(p.position, age) };
}

/**
 * How much a star rating changes a sim quantity, centred on the age's
 * average so an ordinary team plays exactly as the age group alone would.
 * `k` is the change per star; 0.06 means a five-star U10 is about 9% faster
 * than an average one, and a one-star U10 about 15% slower.
 */
export function skillMul(stars: number, age: AgeGroup, k: number): number {
  return 1 + k * (stars - averageStars(age));
}
