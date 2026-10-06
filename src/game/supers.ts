/**
 * Super skills: once a side's star meter is full, its player can do one big move. Which one depends on
 * their position and what is happening. No Three.js and no DOM, so the sim can use it too.
 */
export type SuperKind = 'rocket' | 'turbo' | 'magic' | 'bulldozer' | 'slide' | 'gloves';

export interface SuperInfo {
  name: string;
  icon: string;
  /** The cutscene's colour, as CSS and as a number for Three.js. */
  css: string;
  hex: number;
  /** What the commentator shouts. */
  line: (name: string) => string;
}

export const SUPERS: Record<SuperKind, SuperInfo> = {
  rocket: { name: 'Rocket Shot', icon: '🚀', css: '#ff7a1a', hex: 0xff7a1a, line: (n) => `${n} lets fly with a ROCKET SHOT!` },
  turbo: { name: 'Turbo Dash', icon: '⚡', css: '#3da5f4', hex: 0x3da5f4, line: (n) => `Turbo Dash! Nobody can catch ${n}!` },
  magic: { name: 'Magic Pass', icon: '🌈', css: '#b45cff', hex: 0xb45cff, line: (n) => `A Magic Pass from ${n}! Nobody can cut it out!` },
  bulldozer: { name: 'Bulldozer', icon: '💪', css: '#e63946', hex: 0xe63946, line: (n) => `${n} goes full Bulldozer! Out of the way!` },
  slide: { name: 'Super Slide', icon: '🛡️', css: '#2eb872', hex: 0x2eb872, line: (n) => `Super Slide from ${n}! What a tackle!` },
  gloves: { name: 'Giant Gloves', icon: '🧤', css: '#ffd23f', hex: 0xffd23f, line: (n) => `${n} has GIANT GLOVES! Good luck scoring now!` },
};

/** Seconds of play to fill the meter from empty; shots, skill moves and saves add a bit more. */
export const SUPER_FILL = 50;

/** How long each super lasts once it starts (0: it is one kick). */
export const SUPER_TIME: Record<SuperKind, number> = { rocket: 0, magic: 0, turbo: 2.6, bulldozer: 3, slide: 1.3, gloves: 8 };
