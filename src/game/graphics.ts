import { getSettings } from '../data/storage';

/** What the player picks in the settings. Auto chooses for the device. */
export type GraphicsQuality = 'auto' | 'low' | 'medium' | 'high';

/** The knobs a match uses, resolved from the chosen quality once per match. */
export interface GraphicsProfile {
  tier: 'low' | 'medium' | 'high';
  /** Auto only: drop the render resolution while frames run slow, raise it again when they recover. */
  adaptive: boolean;
  maxPixelRatio: number;
  /** Lowest pixel ratio the adaptive step may go down to. */
  minPixelRatio: number;
  /** Real cast shadows from the sun. Without them the players and ball keep their soft contact shadows. */
  shadowMap: boolean;
  shadowSize: number;
  /** Stands, floodlights, trees and boards cast shadows too (players and the ball always do). */
  sceneryShadows: boolean;
  /** Dark cartoon outlines round the players. */
  playerOutlines: boolean;
  /** Fewer fans, no fan outlines or fan shadows, less confetti. */
  liteCrowd: boolean;
  /** Fewer raindrops, snowflakes and stars. */
  liteWeather: boolean;
  /** Night floodlights light the pitch with real spotlights (costly on phones); otherwise a flat wash. */
  spotlights: boolean;
  /** Merge the still parts of the stadium into a few big meshes (same look, far fewer draw calls). */
  batchScenery: boolean;
  /** Grass and stands use the shiny physically based material; otherwise a cheaper matt one. */
  pbrGround: boolean;
  /** The goal nets: a springy cloth that wobbles, or a cheap dent that follows the ball; and how many strands across. */
  netDetail: 'cloth' | 'dent';
  netCols: number;
}

const PROFILES: Record<GraphicsProfile['tier'], Omit<GraphicsProfile, 'adaptive'>> = {
  high: { tier: 'high', maxPixelRatio: 2, minPixelRatio: 1, shadowMap: true, shadowSize: 2048, sceneryShadows: true, playerOutlines: true, liteCrowd: false, liteWeather: false, spotlights: true, pbrGround: true, batchScenery: false, netDetail: 'cloth', netCols: 16 },
  // The old phone and tablet settings, before the Low setting existed.
  medium: { tier: 'medium', maxPixelRatio: 1.5, minPixelRatio: 1, shadowMap: true, shadowSize: 1024, sceneryShadows: true, playerOutlines: true, liteCrowd: true, liteWeather: true, spotlights: true, pbrGround: true, batchScenery: true, netDetail: 'cloth', netCols: 12 },
  low: { tier: 'low', maxPixelRatio: 1, minPixelRatio: 0.7, shadowMap: false, shadowSize: 512, sceneryShadows: false, playerOutlines: false, liteCrowd: true, liteWeather: true, spotlights: false, pbrGround: false, batchScenery: true, netDetail: 'dent', netCols: 12 },
};

/** Phones get Low, tablets Medium, computers High. */
export function autoTier(): GraphicsProfile['tier'] {
  if (typeof window === 'undefined' || !('matchMedia' in window)) return 'high';
  const touch = window.matchMedia('(pointer: coarse)').matches;
  if (!touch) return 'high';
  const short = Math.min(window.screen?.width ?? window.innerWidth, window.screen?.height ?? window.innerHeight);
  return short < 600 ? 'low' : 'medium';
}

export function graphicsProfile(quality: GraphicsQuality = urlQuality() ?? getSettings().graphics ?? 'auto'): GraphicsProfile {
  const tier = quality === 'auto' ? autoTier() : quality;
  return { ...PROFILES[tier], adaptive: quality === 'auto' };
}

export const GRAPHICS_LABELS: Record<GraphicsQuality, string> = {
  auto: 'Auto',
  low: 'Low (smoothest)',
  medium: 'Medium',
  high: 'High (prettiest)',
};

/** `?graphics=low` (or medium, high, auto) overrides the saved choice, for testing on a device. */
function urlQuality(): GraphicsQuality | null {
  if (typeof location === 'undefined') return null;
  const q = new URLSearchParams(location.search).get('graphics');
  return q && q in GRAPHICS_LABELS ? (q as GraphicsQuality) : null;
}
