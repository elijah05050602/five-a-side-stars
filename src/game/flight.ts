/**
 * How a free ball flies, and what launch gets it somewhere. The sim moves the ball with these numbers
 * (`MatchSim.moveBall`), and shots, lobs, crosses and keeper kicks ask the helpers below for the launch
 * that lands where they mean, by running the same physics ahead. No Three.js, no DOM.
 */

export const GRAVITY = 9.81;
/** Rolling friction on the grass and in the air (m/s lost each second), and air drag (per m/s of speed). */
export const GRASS_FRICTION = 3.2;
export const AIR_FRICTION = 0.4;
export const DRAG = 0.06;
/** A bounce keeps this share of the falling speed; slower than BOUNCE_MIN it just settles. */
export const BOUNCE = 0.55;
export const BOUNCE_MIN = 0.5;
/** A dropping lob checks up as it lands (keeps this share of its speed along the ground). */
export const LOB_CHECK = 0.7;
export const LOB_CHECK_FALL = 2.5;

/** One free-ball step: gravity, a bounce, then friction and drag on the speed along the ground. Returns the new ground speed. */
export function flightStep(s: { y: number; vy: number; lofted: boolean }, speed: number, dt: number, grassFriction = GRASS_FRICTION): { speed: number; checked: boolean } {
  s.vy -= GRAVITY * dt;
  s.y += s.vy * dt;
  let checked = false;
  if (s.y <= 0) {
    s.y = 0;
    if (s.vy < -BOUNCE_MIN) {
      if (s.lofted && s.vy < -LOB_CHECK_FALL) { speed *= LOB_CHECK; s.lofted = false; checked = true; }
      s.vy = -s.vy * BOUNCE;
    } else s.vy = 0;
  }
  const friction = s.y < 0.01 ? grassFriction : AIR_FRICTION;
  return { speed: Math.max(0, speed - (friction + DRAG * speed) * dt), checked };
}

const DT = 1 / 60;
const MAX_STEPS = 60 * 6;

/** How high a ball struck at this speed and upward speed is when it has travelled `dist` along the ground (null if it stops short). */
export function heightAt(dist: number, speed: number, vy: number): number | null {
  const s = { y: 0, vy, lofted: false };
  let x = 0;
  for (let i = 0; i < MAX_STEPS && speed > 0.05; i++) {
    const before = x;
    const ny = flightStep(s, speed, DT);
    speed = ny.speed;
    x += speed * DT;
    if (x >= dist) {
      // Back along the step to where it crossed.
      const f = (dist - before) / Math.max(1e-6, x - before);
      return Math.max(0, s.y - s.vy * DT * (1 - f));
    }
  }
  return null;
}

/** How far along the ground a lofted ball comes down for the first time. */
export function firstBounce(speed: number, vy: number): number {
  const s = { y: 0, vy, lofted: true };
  let x = 0;
  for (let i = 0; i < MAX_STEPS; i++) {
    speed = flightStep(s, speed, DT).speed;
    x += speed * DT;
    if (s.y <= 0 && i > 0) return x;
  }
  return x;
}

/**
 * The upward speed that puts a ball struck at `speed` at height `y` when it has travelled `dist`.
 * Low aims stay on the grass; a high aim from far out climbs and dips; one it cannot reach gets the closest try.
 */
export function vyForHeight(dist: number, speed: number, y: number, maxVy: number): number {
  if (y <= 0.02) return 0;
  let best = 0, bestErr = Infinity;
  const tries = 40;
  for (let i = 0; i <= tries; i++) {
    const vy = (maxVy * i) / tries;
    const h = heightAt(dist, speed, vy);
    const err = h === null ? Infinity : Math.abs(h - y);
    if (err < bestErr) { bestErr = err; best = vy; }
  }
  // Finer around the best step.
  const step = maxVy / tries;
  for (let i = -5; i <= 5; i++) {
    const vy = Math.max(0, best + (step * i) / 5);
    const h = heightAt(dist, speed, vy);
    const err = h === null ? Infinity : Math.abs(h - y);
    if (err < bestErr) { bestErr = err; best = vy; }
  }
  return best;
}

/** The speed along the ground that makes a ball launched upwards at `vy` come down first at `dist` (capped at maxSpeed). */
export function speedForCarry(dist: number, vy: number, maxSpeed: number): number {
  let lo = 0, hi = maxSpeed;
  if (firstBounce(hi, vy) <= dist) return hi;
  for (let i = 0; i < 24; i++) {
    const mid = (lo + hi) / 2;
    if (firstBounce(mid, vy) < dist) lo = mid; else hi = mid;
  }
  return (lo + hi) / 2;
}

/** A lofted ball that comes down first at `dist`: launched upwards at `vy`, or higher if the speed limit cannot reach that far. */
export function launchForCarry(dist: number, vy: number, maxSpeed: number): { speed: number; vy: number } {
  for (let up = vy; up < vy * 2.5; up += vy * 0.1) {
    if (firstBounce(maxSpeed, up) >= dist) return { speed: speedForCarry(dist, up, maxSpeed), vy: up };
  }
  return { speed: maxSpeed, vy: vy * 2.5 };
}
