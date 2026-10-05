export type AgeGroup = 'U5' | 'U6' | 'U7' | 'U8' | 'U9' | 'U10';
export const AGE_GROUPS: AgeGroup[] = ['U5', 'U6', 'U7', 'U8', 'U9', 'U10'];

export type Position = 'GK' | 'DEF' | 'ATT';
export type KitPattern = 'plain' | 'stripes' | 'hoops' | 'halves' | 'sash';
export const KIT_PATTERNS: KitPattern[] = ['plain', 'stripes', 'hoops', 'halves', 'sash'];

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
}

export interface Team {
  id: string;
  name: string;
  short: string; // 3-letter code shown on the scoreboard
  ageGroup: AgeGroup;
  kit: Kit;
  keeperKit: Kit;
  players: Player[]; // exactly 5 for Phase 1: 1 GK, 2 DEF, 2 ATT
  createdAt: number;
}

export type Difficulty = 'easy' | 'normal' | 'hard';

export interface MatchSettings {
  homeTeamId: string;
  awayTeamId: string;
  difficulty: Difficulty;
  halfLengthSeconds: number;
}
