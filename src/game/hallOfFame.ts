import { skillKeys } from '../data/skills';
import type { AgeGroup, Badge, Gender, HairStyle, Position, Team } from '../data/types';
import { TWISTS, type CareerState } from './career';

/**
 * The scrapbook and the Hall of Fame. A career writes short lines into its scrapbook as things
 * happen (a first goal, a title, a new signing), and when it is retired or replaced it is kept as a
 * summary in the Hall of Fame instead of being thrown away. Names are plain text here; the screens
 * escape them.
 */

/** One scrapbook line. `at` is the mini season it happened in (see seasonIndex: 1 is the Under 5s' Autumn). */
export interface ScrapLine { at: number; emoji: string; text: string }

/** Lines a career keeps; the oldest go first, but the very first few (where the story starts) always stay. */
export const SCRAPBOOK_KEEP = 60;
const KEEP_FIRST = 5;
/** Careers the Hall of Fame keeps, newest first. */
export const HALL_KEEP = 20;

const AGES: AgeGroup[] = ['U5', 'U6', 'U7', 'U8', 'U9', 'U10'];
const SEASONS = ['Autumn', 'Winter', 'Spring', 'Summer'];

export function addScrap(book: ScrapLine[], at: number, emoji: string, text: string): void {
  book.push({ at, emoji, text });
  if (book.length > SCRAPBOOK_KEEP) book.splice(KEEP_FIRST, book.length - SCRAPBOOK_KEEP);
}

/** "U7 Spring" for a scrapbook line. */
export function scrapWhen(at: number): string {
  const i = Math.max(0, at - 1);
  return `${AGES[Math.min(AGES.length - 1, Math.floor(i / 4))]} ${SEASONS[i % 4]}`;
}

export interface HallEntry {
  /** Career 1, Career 2, ... in the order they were played. */
  no: number;
  /** When it was retired (ms since 1970). */
  ended: number;
  /** Played right to the end of the Under 10s. */
  finished: boolean;
  team: { name: string; badge: Badge };
  /** The Star as they were at the end: looks and the seven ratings for their position. */
  star: { name: string; number: number; position: Position; gender?: Gender; skin: string; hair: string; hairStyle: HairStyle; skills: Record<string, number> } | null;
  /** How far it got. */
  age: AgeGroup;
  seasons: number;
  titles: number;
  /** Titles won in each tier, Tier 1 first. */
  tierTitles: number[];
  /** The highest tier played in (1 is the top). */
  bestTier: number;
  playoffsWon: number;
  /** Yearly cups won. */
  cups: number;
  /** End-of-year awards the Star won. */
  awards: number;
  /** The twist the career started with, as its emoji and name, or null. */
  twist: string | null;
  /** The Star's career numbers. */
  totals: { played: number; goals: number; assists: number; saves: number; cleanSheets: number; motm: number };
  milestones: string[];
  rival: { name: string; w: number; d: number; l: number } | null;
  /** The best mini season: highest tier first, then highest place. */
  best: { when: string; tier: number; position: number } | null;
  scrapbook: ScrapLine[];
}

/** A badge for the Hall of Fame: a big uploaded logo is left out (the icon and colours stay), so 20 careers stay small. */
function smallBadge(b: Badge): Badge {
  const out = structuredClone(b);
  if (out.image && out.image.length >= 60_000) delete out.image;
  return out;
}

/** The career summed up for the Hall of Fame. */
export function hallEntry(c: CareerState, team: Team, no: number, ended = Date.now()): HallEntry {
  const star = team.players.find((p) => p.id === c.starId) ?? null;
  const st = (star && c.careerStats[star.id]) || null;
  const w = c.world;
  const rival = w.clubs.find((cl) => cl.team.id === w.rivalId);
  const h2h = rival ? w.h2h[rival.team.id] : undefined;
  let best: HallEntry['best'] = null;
  for (const h of c.history) {
    if (!best || h.tier < best.tier || (h.tier === best.tier && h.position < best.position)) best = { when: `${h.age} ${SEASONS[(h.miniSeason - 1) % 4]}`, tier: h.tier, position: h.position };
  }
  return {
    no, ended, finished: c.done,
    team: { name: team.name, badge: smallBadge(team.badge) },
    star: star ? {
      name: star.name, number: star.number, position: star.position, ...(star.gender ? { gender: star.gender } : {}),
      skin: star.skin, hair: star.hair, hairStyle: star.hairStyle,
      skills: Object.fromEntries(skillKeys(star.position).map((k) => [k, star.skills[k]])),
    } : null,
    age: AGES[Math.min(c.year, AGES.length) - 1],
    seasons: c.history.length,
    titles: c.titles,
    tierTitles: [...w.tierTitles],
    bestTier: Math.min(c.league.tier, ...c.history.map((h) => h.tier)),
    playoffsWon: c.history.filter((h) => h.playoff === 'won').length,
    cups: (c.cupRuns ?? []).filter((r) => r.reached === 3).length,
    twist: c.twist ? `${TWISTS[c.twist].emoji} ${TWISTS[c.twist].name}` : null,
    awards: (c.awards ?? []).reduce((n, y) => n + y.awards.filter((a) => a.playerId === c.starId).length, 0),
    totals: { played: st?.played ?? 0, goals: st?.goals ?? 0, assists: st?.assists ?? 0, saves: st?.saves ?? 0, cleanSheets: st?.cleanSheets ?? 0, motm: st?.motm ?? 0 },
    milestones: [...c.milestones],
    rival: rival ? { name: rival.team.name, w: h2h?.w ?? 0, d: h2h?.d ?? 0, l: h2h?.l ?? 0 } : null,
    best,
    scrapbook: structuredClone(c.scrapbook),
  };
}

/** A career is worth keeping once a match has been played in it. */
export const worthKeeping = (c: CareerState): boolean => c.history.length > 0 || c.league.round > 0;

/** Add a career to the front of the Hall of Fame, keeping the newest HALL_KEEP. Returns the new list. */
export function addToHall(hall: HallEntry[], entry: HallEntry): HallEntry[] {
  return [entry, ...hall].slice(0, HALL_KEEP);
}

/** Scrapbook lines for a career saved before the scrapbook: its past seasons. */
export function scrapsFromHistory(c: Pick<CareerState, 'history'>, tierName: (tier: number) => string): ScrapLine[] {
  const out: ScrapLine[] = [];
  c.history.forEach((h) => {
    const at = (h.year - 1) * 4 + h.miniSeason;
    if (h.position === 1) addScrap(out, at, '🥇', `Champions of the ${tierName(h.tier)}!`);
    else if (h.outcome === 'promoted') addScrap(out, at, '⬆️', `Up to the ${tierName(h.tier - 1)}.`);
    else if (h.outcome === 'relegated') addScrap(out, at, '⬇️', `Down to the ${tierName(h.tier + 1)}.`);
  });
  return out;
}
