export type AgeGroup = 'U5' | 'U6' | 'U7' | 'U8' | 'U9' | 'U10';
export const AGE_GROUPS: AgeGroup[] = ['U5', 'U6', 'U7', 'U8', 'U9', 'U10'];

export type Position = 'GK' | 'DEF' | 'MID' | 'WING' | 'ATT';
export const POSITIONS: Position[] = ['GK', 'DEF', 'MID', 'WING', 'ATT'];
export const POSITION_LABELS: Record<Position, string> = { GK: 'Keeper', DEF: 'Defender', MID: 'Midfielder', WING: 'Winger', ATT: 'Attacker' };
export type KitPattern = 'plain' | 'stripes' | 'hoops' | 'halves' | 'sash' | 'chevron';
export const KIT_PATTERNS: KitPattern[] = ['plain', 'stripes', 'hoops', 'halves', 'sash', 'chevron'];

export type HairStyle = 'short' | 'spiky' | 'long' | 'curly' | 'afro' | 'buns' | 'bald';
export const HAIR_STYLES: HairStyle[] = ['short', 'spiky', 'long', 'curly', 'afro', 'buns', 'bald'];
export const HAIR_STYLE_LABELS: Record<HairStyle, string> = { short: 'Short', spiky: 'Fringe', long: 'Long', curly: 'Curly', afro: 'Afro', buns: 'Buns', bald: 'Bald' };
/** How the boots are painted. */
export type BootStyle = 'classic' | 'stripes' | 'toecap' | 'twotone';
export const BOOT_STYLES: BootStyle[] = ['classic', 'stripes', 'toecap', 'twotone'];
export const BOOT_STYLE_LABELS: Record<BootStyle, string> = { classic: 'Classic', stripes: 'Stripes', toecap: 'Toe cap', twotone: 'Two-tone' };
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

/**
 * Seven star ratings per player, 1 to 5 each. Outfield players and keepers
 * rate different things, sharing Speed, Passing (Kicking, for keepers) and
 * Strength. Every player stores all eleven, so a position change has numbers
 * ready; only the seven for their position count (see skillKeys in skills.ts).
 */
export type OutfieldSkill = 'speed' | 'control' | 'passing' | 'shooting' | 'tackling' | 'stamina' | 'strength';
export type KeeperSkill = 'speed' | 'handling' | 'diving' | 'reflexes' | 'positioning' | 'passing' | 'strength';
export type SkillKey = OutfieldSkill | KeeperSkill;
export const OUTFIELD_SKILLS: OutfieldSkill[] = ['speed', 'control', 'passing', 'shooting', 'tackling', 'stamina', 'strength'];
export const KEEPER_SKILLS: KeeperSkill[] = ['speed', 'handling', 'diving', 'reflexes', 'positioning', 'passing', 'strength'];
export const SKILL_KEYS: SkillKey[] = ['speed', 'control', 'passing', 'shooting', 'tackling', 'stamina', 'strength', 'handling', 'diving', 'reflexes', 'positioning'];
export type Skills = Record<SkillKey, number>;
/** The four ratings saved before the seven-stat update (keepers read them as Speed, Handling, Kicking, Diving). */
export interface LegacySkills { speed: number; shooting: number; passing: number; defending: number }

export interface Player {
  id: string;
  name: string;
  number: number;
  /** Where they line up right now (set by the formation, dragging, or picking a position). */
  position: Position;
  /** Every position they are good at, so a formation puts them somewhere they like. Missing means just `position`. */
  positions?: Position[];
  skin: string;
  hair: string;
  hairStyle: HairStyle;
  build?: Build;
  boots: string;
  bootStyle?: BootStyle;
  special: Special;
  /** In the starting five (the rest are subs). */
  starter: boolean;
  /** Star ratings, 1 to 5 each. The age group caps how high they can go. */
  skills: Skills;
  /** Career mode: progress (0..1) towards the next star in each skill. */
  xp?: Skills;
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
  /** A career-mode team: its players grow by playing, so stars cannot be spent by hand. */
  career?: boolean;
  /** How the four outfield starters line up (see src/data/formations.ts). Box (2-2) when missing. */
  formation?: FormationId;
}

export type FormationId = 'box' | 'pyramid' | 'arrow' | 'diamond' | 'engine' | 'wall' | 'wings';

export type Difficulty = 'easy' | 'normal' | 'hard';

export interface MatchSettings {
  homeTeamId: string;
  awayTeamId: string;
  difficulty: Difficulty;
  halfLengthSeconds: number;
}
