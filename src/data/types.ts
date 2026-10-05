export type AgeGroup = 'U5' | 'U6' | 'U7' | 'U8' | 'U9' | 'U10';
export const AGE_GROUPS: AgeGroup[] = ['U5', 'U6', 'U7', 'U8', 'U9', 'U10'];

export type Position = 'GK' | 'DEF' | 'ATT';
export type KitPattern = 'plain' | 'stripes' | 'hoops' | 'halves' | 'sash' | 'chevron';
export const KIT_PATTERNS: KitPattern[] = ['plain', 'stripes', 'hoops', 'halves', 'sash', 'chevron'];

export type HairStyle = 'short' | 'spiky' | 'long' | 'curly' | 'afro' | 'buns' | 'bald';
export const HAIR_STYLES: HairStyle[] = ['short', 'spiky', 'long', 'curly', 'afro', 'buns', 'bald'];
export const HAIR_STYLE_LABELS: Record<HairStyle, string> = { short: 'Short', spiky: 'Fringe', long: 'Long', curly: 'Curly', afro: 'Afro', buns: 'Buns', bald: 'Bald' };
/** Body shape: a little variety in height and width (looks only). */
export type Build = 'small' | 'regular' | 'tall' | 'sturdy';
export const BUILDS: Build[] = ['small', 'regular', 'tall', 'sturdy'];

/** One small perk per player, kept gentle so nobody is useless. */
export type Special = 'none' | 'speedy' | 'power' | 'keeper';
export const SPECIALS: { id: Special; label: string; blurb: string }[] = [
  { id: 'none', label: 'All-rounder', blurb: 'Solid at everything.' },
  { id: 'speedy', label: 'Speedy', blurb: 'Runs a bit faster.' },
  { id: 'power', label: 'Power shot', blurb: 'Harder shots.' },
  { id: 'keeper', label: 'Super keeper', blurb: 'Longer reach in goal.' },
];

export type BadgeShape = 'shield' | 'circle' | 'diamond' | 'hex';
export const BADGE_SHAPES: BadgeShape[] = ['shield', 'circle', 'diamond', 'hex'];
export const BADGE_ICONS = ['🦁', '⭐', '🚀', '⚽', '⚡', '🦊', '🌊', '👑', '🐯', '🦅', '🐼', '🔥'];

export interface Badge {
  shape: BadgeShape;
  icon: string;
  colour1: string;
  colour2: string;
  /** An uploaded club logo as a small data URL; when set it replaces the icon and colours. */
  image?: string;
}

export interface Kit {
  pattern: KitPattern;
  shirt: string; // hex colour
  shirt2: string; // second shirt colour for patterns
  shorts: string;
  socks: string;
}

export interface Player {
  id: string;
  name: string;
  number: number;
  position: Position;
  skin: string;
  hair: string;
  hairStyle: HairStyle;
  build?: Build;
  boots: string;
  special: Special;
  /** In the starting five (the rest are subs). */
  starter: boolean;
}

export interface Team {
  id: string;
  name: string;
  short: string; // 3-letter code shown on the scoreboard
  ageGroup: AgeGroup;
  badge: Badge;
  kit: Kit; // home kit
  awayKit: Kit;
  keeperKit: Kit;
  players: Player[]; // 5 to 8 players; 5 starters including exactly one GK
  createdAt: number;
}

export type Difficulty = 'easy' | 'normal' | 'hard';

export interface MatchSettings {
  homeTeamId: string;
  awayTeamId: string;
  difficulty: Difficulty;
  halfLengthSeconds: number;
}
