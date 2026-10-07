/**
 * The grounds a match can be played at. Each has its own skyline, stand colours and trees, so the
 * stadium does not look the same every time. No Three.js here, so the choice can be tested.
 */

export type GroundId = 'apo' | 'seaside' | 'city' | 'village' | 'forest' | 'snowy';
export type SkylineKind = 'apo' | 'sea' | 'city' | 'fields' | 'pines' | 'peaks';
export type TreeKind = 'round' | 'palm' | 'pine';

export interface Ground {
  id: GroundId;
  name: string;
  skyline: SkylineKind;
  trees: TreeKind;
  /** Leaf colours for the trees round the ground. */
  leaves: [string, string, string];
  /** The stand: roof, the stepped rows, the back wall and the two seat colours. */
  roof: string;
  steps: string;
  wall: string;
  seats: [string, string];
  /** The grass outside the boards (sand at the seaside). */
  surround: string;
  /** Bunting all round the boards as well as on the stand. */
  extraBunting?: boolean;
  /** Flags on poles round the ground. */
  poleFlags?: boolean;
  /** A big screen behind one goal that joins in with the ad boards. */
  bigScreen?: boolean;
  /** Seagulls perched along the roof. */
  gulls?: boolean;
  /** A low wooden fence round the surround. */
  fence?: boolean;
}

export const GROUNDS: Record<GroundId, Ground> = {
  apo: { id: 'apo', name: 'Mount Apo Park', skyline: 'apo', trees: 'round', leaves: ['#1d8f5a', '#2aa86a', '#177a4a'], roof: '#3da5f4', steps: '#b8c4d6', wall: '#2d5f8a', seats: ['#ff7a00', '#2eb872'], surround: '#259a60' },
  seaside: { id: 'seaside', name: 'Seaside Arena', skyline: 'sea', trees: 'palm', leaves: ['#2e9e4f', '#3cb35c', '#24863f'], roof: '#f4f6fa', steps: '#d9d2c3', wall: '#3aa0c8', seats: ['#3da5f4', '#ffd23f'], surround: '#e3cf9a', gulls: true },
  city: { id: 'city', name: 'City Lights Stadium', skyline: 'city', trees: 'round', leaves: ['#2a8a5e', '#35a070', '#1f7550'], roof: '#c7ced8', steps: '#9aa7b8', wall: '#1b2a41', seats: ['#1b2a41', '#e63946'], surround: '#23905a', poleFlags: true, bigScreen: true },
  village: { id: 'village', name: 'Village Field', skyline: 'fields', trees: 'palm', leaves: ['#3a9e45', '#4cb556', '#2f8a3a'], roof: '#a9b1b8', steps: '#c69c6d', wall: '#8b5a2b', seats: ['#ffd23f', '#e63946'], surround: '#4caa4f', extraBunting: true },
  forest: { id: 'forest', name: 'Forest Ground', skyline: 'pines', trees: 'pine', leaves: ['#1f6b45', '#2a7d52', '#18573a'], roof: '#2eb872', steps: '#b9a88f', wall: '#5b3b22', seats: ['#2eb872', '#ffffff'], surround: '#2a8f58', fence: true },
  snowy: { id: 'snowy', name: 'Snowy Peaks', skyline: 'peaks', trees: 'pine', leaves: ['#1e5f4a', '#276f57', '#164c3b'], roof: '#e63946', steps: '#c9d3df', wall: '#7a2430', seats: ['#e63946', '#3da5f4'], surround: '#2f8d5f' },
};

export const GROUND_IDS = Object.keys(GROUNDS) as GroundId[];

/** What kind of match it is: it decides how full the stands are and, with the home team, where it is played. */
export type Occasion = 'friendly' | 'league' | 'cup' | 'final' | 'training';

export interface GroundChoice {
  occasion: Occasion;
  /** The home team's id: league, cup and career matches are played at its home ground. */
  homeId: string;
  weather?: 'clear' | 'cloudy' | 'rain' | 'snow';
  time?: 'day' | 'sunset' | 'night';
}

/** A small, steady hash of a team id, so a team always has the same home ground. */
function hash(s: string): number {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); }
  return h >>> 0;
}

/** A team's home ground, the same every time. */
export function homeGround(teamId: string): Ground {
  return GROUNDS[GROUND_IDS[hash(teamId) % GROUND_IDS.length]];
}

/**
 * Where a match is played. A friendly picks at random (snow sends it to the mountains more often, and
 * night to the city lights), league and cup matches go to the home team's ground, a cup final is always
 * at City Lights Stadium, and training is down at the Village Field.
 */
export function groundFor(c: GroundChoice, rng: () => number = Math.random): Ground {
  if (c.occasion === 'final') return GROUNDS.city;
  if (c.occasion === 'training') return GROUNDS.village;
  if (c.occasion === 'league' || c.occasion === 'cup') return homeGround(c.homeId);
  const weights = GROUND_IDS.map((id) => (id === 'snowy' && c.weather === 'snow' ? 4 : id === 'city' && c.time === 'night' ? 3 : 1));
  let r = rng() * weights.reduce((a, b) => a + b, 0);
  for (let i = 0; i < GROUND_IDS.length; i++) {
    r -= weights[i];
    if (r < 0) return GROUNDS[GROUND_IDS[i]];
  }
  return GROUNDS[GROUND_IDS[GROUND_IDS.length - 1]];
}

/** How full the stands are, 0..1: a cup final is packed, training has a few parents watching. */
export function crowdFill(occasion: Occasion): number {
  return { friendly: 0.7, league: 0.85, cup: 0.92, final: 1, training: 0.22 }[occasion];
}
