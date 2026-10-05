import type { AgeGroup } from './types';

/**
 * Everything that changes between age groups lives here. There is one game
 * mode; the age group is team data that tunes how the players feel.
 */
export interface AgeStats {
  label: string;
  /** Height multiplier for the player model (U10 = 1). */
  scale: number;
  /** Top running speed in metres per second. */
  speed: number;
  /** Kick power: launch speed of a full shot in m/s. */
  power: number;
  /** 0..1: how often tackles and first touches succeed, how straight passes go. */
  control: number;
  /** How far the keeper can reach when diving, in metres. */
  keeperReach: number;
  /** Pitch length and width in metres. */
  pitch: { length: number; width: number };
  /** Goal width in metres. */
  goalWidth: number;
  /** Default half length in seconds. */
  halfSeconds: number;
  blurb: string;
}

export const AGE_STATS: Record<AgeGroup, AgeStats> = {
  U5: { label: 'Under 5s', scale: 0.62, speed: 3.6, power: 8, control: 0.35, keeperReach: 1.0, pitch: { length: 22, width: 14 }, goalWidth: 2.4, halfSeconds: 60, blurb: 'Tiny, wobbly and chaotic. Everyone chases the ball!' },
  U6: { label: 'Under 6s', scale: 0.68, speed: 4.0, power: 9.5, control: 0.45, keeperReach: 1.15, pitch: { length: 24, width: 15 }, goalWidth: 2.6, halfSeconds: 75, blurb: 'Still a bit wild, but passes start to happen.' },
  U7: { label: 'Under 7s', scale: 0.75, speed: 4.4, power: 11, control: 0.55, keeperReach: 1.3, pitch: { length: 27, width: 17 }, goalWidth: 2.8, halfSeconds: 90, blurb: 'Quicker feet and the first real shots.' },
  U8: { label: 'Under 8s', scale: 0.82, speed: 4.8, power: 12.5, control: 0.65, keeperReach: 1.45, pitch: { length: 30, width: 19 }, goalWidth: 3.0, halfSeconds: 120, blurb: 'Proper little footballers. Passing moves and saves.' },
  U9: { label: 'Under 9s', scale: 0.9, speed: 5.2, power: 14, control: 0.75, keeperReach: 1.6, pitch: { length: 32, width: 20 }, goalWidth: 3.2, halfSeconds: 150, blurb: 'Faster, stronger and clever with the ball.' },
  U10: { label: 'Under 10s', scale: 1.0, speed: 5.6, power: 15.5, control: 0.85, keeperReach: 1.8, pitch: { length: 34, width: 21 }, goalWidth: 3.4, halfSeconds: 180, blurb: 'Plays like real football. Skilful and quick.' },
};
