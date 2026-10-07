/**
 * The goal frame and its net, shared by the rules (sim.ts) and the drawn net (Pitch.ts). Everything is
 * measured from one goal: d is how far behind the goal line, y how high, and z across the goal mouth.
 * No Three.js here, so the sim can use it in the worker and in the tests.
 */

/** The size of a goal, and where its line is. */
export interface GoalShape { halfLength: number; width: number; height: number; depth: number }

/** The four panels of netting. */
export type NetPanel = 'back' | 'roof' | 'left' | 'right';

/**
 * The ball pressing into one panel of the net: the way it is pushing the netting (a unit vector), how
 * far past the resting net the ball's surface has gone, and where the ball's centre is.
 */
export interface NetPress { panel: NetPanel; nd: number; ny: number; nz: number; depth: number; d: number; y: number; z: number }

/** The radius of the posts and the crossbar (the drawn goal uses it too). */
export const POST_R = 0.07;

/** The roof of the net slopes from the crossbar down to half height at the back. */
export function roofHeight(g: GoalShape, d: number): number {
  return g.height - g.height * 0.5 * Math.min(1, Math.max(0, d / g.depth));
}

/** The roof's slope, and the length of its normal before it is made a unit vector. */
function roof(g: GoalShape): { k: number; s: number } {
  const k = g.height / (2 * g.depth);
  return { k, s: Math.hypot(k, 1) };
}

/**
 * Where a ball of radius r is pressing into the net. A ball that came in through the goal mouth
 * (inside) pushes the netting outwards; one outside the goal pushes it inwards, from the side, from
 * above or from behind.
 */
export function netPresses(g: GoalShape, d: number, y: number, z: number, r: number, inside: boolean): NetPress[] {
  const out: NetPress[] = [];
  const w = g.width / 2;
  const { k, s } = roof(g);
  const above = (y + k * Math.max(0, d) - g.height) / s; // how far the ball's centre is above the roof
  if (inside) {
    const back = d + r - g.depth;
    if (back > 0) out.push({ panel: 'back', nd: 1, ny: 0, nz: 0, depth: back, d, y, z });
    const top = above + r;
    if (d > 0 && top > 0) out.push({ panel: 'roof', nd: k / s, ny: 1 / s, nz: 0, depth: top, d, y, z });
    const side = Math.abs(z) + r - w;
    if (side > 0) out.push({ panel: z < 0 ? 'left' : 'right', nd: 0, ny: 0, nz: z < 0 ? -1 : 1, depth: side, d, y, z });
    return out;
  }
  // Outside: only next to the netting, and then it pushes the ball out the shortest way.
  if (d <= 0 || d > g.depth + r || Math.abs(z) > w + r || y > roofHeight(g, d) + r * 1.5) return out;
  let best: NetPress | null = null;
  const consider = (p: NetPress): void => { if (p.depth > 0 && (!best || p.depth < best.depth)) best = p; };
  consider({ panel: z < 0 ? 'left' : 'right', nd: 0, ny: 0, nz: z < 0 ? 1 : -1, depth: w + r - Math.abs(z), d, y, z });
  if (d < g.depth) consider({ panel: 'roof', nd: -k / s, ny: -1 / s, nz: 0, depth: r - above, d, y, z });
  if (y < g.height * 0.5 + r) consider({ panel: 'back', nd: -1, ny: 0, nz: 0, depth: g.depth + r - d, d, y, z });
  if (best) out.push(best);
  return out;
}

/** A ball of radius r touching a post or the crossbar: the way out of the frame (a unit vector) and how far in it is. */
export interface FrameHit { nd: number; ny: number; nz: number; depth: number }

/** The ball against the frame, if it is touching a post or the crossbar. */
export function frameHit(g: GoalShape, d: number, y: number, z: number, r: number): FrameHit | null {
  const reach = r + POST_R;
  if (Math.abs(d) > reach) return null;
  const w = g.width / 2;
  let best: FrameHit | null = null;
  const test = (cd: number, cy: number, cz: number): void => {
    const ed = d - cd, ey = y - cy, ez = z - cz;
    const dist = Math.hypot(ed, ey, ez);
    if (dist >= reach || dist < 1e-6) return;
    const depth = reach - dist;
    if (!best || depth > best.depth) best = { nd: ed / dist, ny: ey / dist, nz: ez / dist, depth };
  };
  // The nearest point on each post, and on the crossbar.
  for (const pz of [-w, w]) test(0, Math.min(g.height, Math.max(0, y)), pz);
  test(0, g.height, Math.min(w, Math.max(-w, z)));
  return best;
}
