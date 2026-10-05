import type { AgeGroup, LegacySkills, Player, Position, SkillKey, Skills } from './types';
import { KEEPER_SKILLS, OUTFIELD_SKILLS, SKILL_KEYS } from './types';

export const MAX_STARS = 5;
export const MIN_STARS = 1;

/** The seven ratings that count for a player in this position. */
export const skillKeys = (position: Position): SkillKey[] => (position === 'GK' ? KEEPER_SKILLS : OUTFIELD_SKILLS);

/**
 * Age group sets the ceiling. Little ones cannot reach five stars however
 * hard they train; the cap rises as a career team moves up a year.
 */
export const STAR_CAP: Record<AgeGroup, number> = { U5: 2, U6: 3, U7: 3, U8: 4, U9: 4, U10: 5 };

/**
 * Stars to share out across a player's seven ratings in the team builder
 * (and the average a computer team of that age plays with). Every player has
 * at least one star in each, so the U5 budget leaves three to spend and each
 * year after adds three more.
 */
export const STAR_BUDGET: Record<AgeGroup, number> = { U5: 10, U6: 13, U7: 16, U8: 19, U9: 22, U10: 25 };

/** A typical star in one rating for this age: the budget spread evenly. */
export const averageStars = (age: AgeGroup): number => STAR_BUDGET[age] / OUTFIELD_SKILLS.length;

export const SKILL_LABELS: Record<'outfield' | 'keeper', Partial<Record<SkillKey, { label: string; blurb: string; emoji: string }>>> = {
  outfield: {
    speed: { label: 'Speed', blurb: 'How fast they run.', emoji: '⚡' },
    control: { label: 'Dribbling', blurb: 'Keeps the ball close, a soft first touch and slicker tricks.', emoji: '🪄' },
    passing: { label: 'Passing', blurb: 'Tidy, accurate passes.', emoji: '🤝' },
    shooting: { label: 'Shooting', blurb: 'Harder, straighter shots.', emoji: '🎯' },
    tackling: { label: 'Tackling', blurb: 'Wins the ball back more often.', emoji: '🛡️' },
    stamina: { label: 'Stamina', blurb: 'Sprints for longer and stays quick late in the game.', emoji: '🔋' },
    strength: { label: 'Strength', blurb: 'Hard to knock off the ball, wins the bumps.', emoji: '💪' },
  },
  keeper: {
    speed: { label: 'Speed', blurb: 'How fast they move across the goal.', emoji: '⚡' },
    handling: { label: 'Handling', blurb: 'Catches the ball instead of spilling it.', emoji: '🧤' },
    diving: { label: 'Diving', blurb: 'Reaches shots in the corners.', emoji: '🤸' },
    reflexes: { label: 'Reflexes', blurb: 'Reacts to fast shots in time.', emoji: '👀' },
    positioning: { label: 'Positioning', blurb: 'Stands in the right spot and narrows the angle.', emoji: '📐' },
    passing: { label: 'Kicking', blurb: 'Clean throws and long clearances.', emoji: '🦶' },
    strength: { label: 'Strength', blurb: 'Booming goal kicks and holds on in a crowd.', emoji: '💪' },
  },
};

export const skillLabel = (position: Position, k: SkillKey) => SKILL_LABELS[position === 'GK' ? 'keeper' : 'outfield'][k] ?? { label: k, blurb: '', emoji: '⭐' };

export const clampStars = (n: number, age?: AgeGroup): number => Math.max(MIN_STARS, Math.min(age ? STAR_CAP[age] : MAX_STARS, Math.round(n)));

/** Stars spent on the seven ratings that count for this position. */
export const totalStars = (s: Skills, position: Position): number => skillKeys(position).reduce((n, k) => n + s[k], 0);

/** Stars left to spend for a player of this age. Negative when over budget (after an age change). */
export const starsLeft = (s: Skills, age: AgeGroup, position: Position): number => STAR_BUDGET[age] - totalStars(s, position);

export const starsText = (n: number, cap = MAX_STARS): string => '★'.repeat(n) + '☆'.repeat(Math.max(0, cap - n));

/** Which ratings a position leans on; used when spreading stars at random and trimming. */
const WEIGHTS: Record<Position, Partial<Record<SkillKey, number>>> = {
  GK: { speed: 0.8, handling: 2, diving: 2.2, reflexes: 2, positioning: 1.6, passing: 0.9, strength: 0.7 },
  DEF: { speed: 1.3, control: 0.8, passing: 1.3, shooting: 0.5, tackling: 2.5, stamina: 1.2, strength: 1.8 },
  MID: { speed: 1.2, control: 1.6, passing: 2.4, shooting: 1.1, tackling: 1.3, stamina: 2, strength: 1 },
  WING: { speed: 2.4, control: 2.1, passing: 1.8, shooting: 1.1, tackling: 0.6, stamina: 1.6, strength: 0.6 },
  ATT: { speed: 1.8, control: 2, passing: 1.2, shooting: 2.5, tackling: 0.5, stamina: 1.1, strength: 0.9 },
};

/** Ratings a player's position does not use, set to an ordinary level for the age so a position change starts fair. */
function fillOffPosition(s: Skills, position: Position, age: AgeGroup): void {
  const used = skillKeys(position);
  const typical = clampStars(Math.floor(averageStars(age)), age);
  for (const k of SKILL_KEYS) if (!used.includes(k)) s[k] = typical;
}

const ones = (): Skills => Object.fromEntries(SKILL_KEYS.map((k) => [k, MIN_STARS])) as Skills;

/** Spend the whole budget for this age at random, leaning towards what the position needs. */
export function randomSkills(position: Position, age: AgeGroup): Skills {
  const cap = STAR_CAP[age];
  const keys = skillKeys(position);
  const s = ones();
  let left = STAR_BUDGET[age] - keys.length;
  const w = WEIGHTS[position];
  let guard = 0;
  while (left > 0 && guard++ < 200) {
    const open = keys.filter((k) => s[k] < cap);
    if (!open.length) break;
    const total = open.reduce((n, k) => n + (w[k] ?? 1), 0);
    let r = Math.random() * total;
    let pick = open[open.length - 1];
    for (const k of open) { r -= w[k] ?? 1; if (r <= 0) { pick = k; break; } }
    s[pick]++;
    left--;
  }
  fillOffPosition(s, position, age);
  return s;
}

/**
 * Make a player's stars legal for an age group: nothing above the cap, nothing
 * below one, and (unless `keepBudget` is false, as on career teams that earn
 * stars by playing) no more than the age's budget in total. Stars over the
 * budget come off the player's strongest rating first, keeping the one their
 * position leans on most. Stars under the budget are a gift.
 */
export function fitSkills(p: Player, age: AgeGroup, keepBudget = true): Skills {
  const s = { ...ones(), ...p.skills };
  for (const k of SKILL_KEYS) s[k] = clampStars(Number.isFinite(s[k]) ? s[k] : MIN_STARS, age);
  if (!keepBudget) return s;
  const position = p.position;
  const keys = skillKeys(position);
  const w = WEIGHTS[position] ?? WEIGHTS.DEF;
  let guard = 0;
  while (totalStars(s, position) > STAR_BUDGET[age] && guard++ < 80) {
    const open = keys.filter((k) => s[k] > MIN_STARS);
    if (!open.length) break;
    open.sort((a, b) => s[b] - s[a] || (w[a] ?? 1) - (w[b] ?? 1));
    s[open[0]]--;
  }
  return s;
}

const isLegacy = (raw: unknown): raw is LegacySkills =>
  !!raw && typeof raw === 'object' && 'defending' in raw && !('tackling' in raw);

/**
 * Turn the four ratings saved before the seven-stat update into the seven.
 * Each old star carries over to the new rating it became, and the brand-new
 * ones (Stamina, Strength and so on) start from the player's old average, so
 * nobody gets worse. Callers trim the result to the cap and budget.
 * Works for star ratings and for career progress alike (`round` off for progress).
 */
export function fromLegacy(old: LegacySkills, round = true): Skills {
  const n = (x: unknown) => (Number.isFinite(x) ? Number(x) : round ? MIN_STARS : 0);
  const speed = n(old.speed), shooting = n(old.shooting), passing = n(old.passing), defending = n(old.defending);
  const avg = (speed + shooting + passing + defending) / 4;
  const r = (x: number) => (round ? Math.round(x) : x);
  return {
    speed,
    // Outfield: Shooting, Passing, Defending carry over; old Passing also gave the first touch, so it seeds Dribbling.
    control: r((passing + shooting) / 2),
    passing,
    shooting,
    tackling: defending,
    stamina: r(avg),
    strength: r((defending + avg) / 2),
    // Keepers read the old slots as Handling (shooting), Kicking (passing) and Diving (defending).
    handling: shooting,
    diving: defending,
    reflexes: r((defending + shooting) / 2),
    positioning: r((shooting + avg) / 2),
  };
}

/** Players saved before stars existed get a sensible spread; players saved with four ratings move to seven. */
export function ensureSkills(p: Player, age: AgeGroup): Player {
  const raw = (p as { skills?: unknown }).skills;
  const rawXp = (p as { xp?: unknown }).xp;
  const xp = isLegacy(rawXp) ? fromLegacy(rawXp, false) : rawXp ? { ...(Object.fromEntries(SKILL_KEYS.map((k) => [k, 0])) as Skills), ...(rawXp as Skills) } : undefined;
  if (isLegacy(raw)) return { ...p, skills: fromLegacy(raw), ...(xp ? { xp } : {}) };
  const ok = raw && typeof raw === 'object' && skillKeys(p.position).every((k) => Number.isFinite((raw as Skills)[k]));
  if (!ok) return { ...p, skills: randomSkills(p.position, age), ...(xp ? { xp } : {}) };
  const s = { ...(raw as Skills) };
  const fill = clampStars(Math.floor(averageStars(age)), age);
  for (const k of SKILL_KEYS) if (!Number.isFinite(s[k])) s[k] = fill;
  return { ...p, skills: s, ...(xp ? { xp } : {}) };
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
