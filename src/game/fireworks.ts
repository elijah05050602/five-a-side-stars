import * as THREE from 'three';
import { softDot } from './effects';

/**
 * Fireworks for the trophy lift: rockets that climb on a trail of sparks and burst into a ball of colour,
 * gold rain that drifts down, sparkler fountains on the touchline, and camera flashes in the stand.
 * Every spark is one point in one of two point clouds (small sparks and big soft flashes), so a sky full
 * of them is still only two draw calls. They glow through the tone mapping, so they stay bright when the
 * stadium dims for the top tier's show.
 */

/** How a burst opens: a round ball of sparks, a ring, or a willow whose sparks hang and fall as gold rain. */
export type BurstStyle = 'peony' | 'ring' | 'willow';

interface Cloud {
  points: THREE.Points;
  pos: Float32Array;
  col: Float32Array;
  /** Per spark: velocity, the colour it fades from, life left and its whole life, gravity, drag and twinkle. */
  vel: Float32Array;
  base: Float32Array;
  life: Float32Array;
  max: Float32Array;
  grav: Float32Array;
  drag: Float32Array;
  twinkle: Uint8Array;
  n: number;
}

interface Rocket { x: number; y: number; z: number; vx: number; vy: number; vz: number; t: number; fuse: number; colours: THREE.Color[]; style: BurstStyle; count: number; radius: number }

interface Fountain { x: number; z: number; rate: number; due: number; colour: THREE.Color; height: number }

function cloud(max: number, size: number): Cloud {
  const geo = new THREE.BufferGeometry();
  const pos = new Float32Array(max * 3), col = new Float32Array(max * 3);
  geo.setAttribute('position', new THREE.BufferAttribute(pos, 3).setUsage(THREE.DynamicDrawUsage));
  geo.setAttribute('color', new THREE.BufferAttribute(col, 3).setUsage(THREE.DynamicDrawUsage));
  geo.setDrawRange(0, 0);
  const mat = new THREE.PointsMaterial({
    size, map: softDot(), vertexColors: true, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending,
    sizeAttenuation: true, toneMapped: false, fog: false,
  });
  const points = new THREE.Points(geo, mat);
  // The sparks fly all over the sky; never let a stale bounding sphere hide them.
  points.frustumCulled = false;
  return {
    points, pos, col, vel: new Float32Array(max * 3), base: new Float32Array(max * 3), life: new Float32Array(max), max: new Float32Array(max),
    grav: new Float32Array(max), drag: new Float32Array(max), twinkle: new Uint8Array(max), n: 0,
  };
}

const tmp = new THREE.Color();

export class Fireworks {
  readonly group = new THREE.Group();
  private readonly sparks: Cloud;
  private readonly glows: Cloud;
  private readonly rockets: Rocket[] = [];
  private readonly fountains: Fountain[] = [];
  /** Called as each rocket bursts, for its bang. */
  onBurst: ((x: number, y: number, z: number) => void) | null = null;

  /** `scale` sizes the sparks to the scene; `lite` (Low graphics) keeps fewer of them. */
  constructor(private readonly scale = 1, lite = false) {
    this.sparks = cloud(lite ? 1400 : 3200, 0.32 * scale);
    this.glows = cloud(lite ? 60 : 120, 2.6 * scale);
    this.group.add(this.sparks.points, this.glows.points);
    this.group.name = 'fireworks';
  }

  private add(c: Cloud, x: number, y: number, z: number, vx: number, vy: number, vz: number, colour: THREE.Color, life: number, grav: number, drag: number, twinkle = false): void {
    if (c.n >= c.life.length) return;
    const i = c.n++, j = i * 3;
    c.pos[j] = x; c.pos[j + 1] = y; c.pos[j + 2] = z;
    c.vel[j] = vx; c.vel[j + 1] = vy; c.vel[j + 2] = vz;
    c.base[j] = colour.r; c.base[j + 1] = colour.g; c.base[j + 2] = colour.b;
    c.life[i] = life; c.max[i] = life; c.grav[i] = grav; c.drag[i] = drag; c.twinkle[i] = twinkle ? 1 : 0;
  }

  /** Launch a rocket from (x, z) at ground level up to height `y`, where it bursts. */
  rocket(x: number, z: number, y: number, colours: THREE.Color[], style: BurstStyle, count: number, radius: number): void {
    const fuse = 0.75 + Math.random() * 0.35;
    const vy = (y + 0.5 * 9.8 * fuse * fuse * 0.35) / fuse;
    this.rockets.push({ x, y: 0.5, z, vx: (Math.random() - 0.5) * 1.5, vy, vz: (Math.random() - 0.5) * 0.6, t: 0, fuse, colours, style, count, radius });
  }

  /** A burst of sparks at a point in the sky. */
  burst(x: number, y: number, z: number, colours: THREE.Color[], style: BurstStyle, count: number, radius: number): void {
    const s = this.scale;
    const speed = radius * (style === 'willow' ? 1.25 : 1.9);
    for (let i = 0; i < count; i++) {
      // Even points on a sphere (or round a tilted ring), so the burst opens as a clean ball.
      let dx: number, dy: number, dz: number;
      if (style === 'ring') {
        const a = (i / count) * Math.PI * 2;
        dx = Math.cos(a); dy = Math.sin(a) * 0.85; dz = Math.sin(a) * 0.5;
      } else {
        const k = (i + 0.5) / count;
        const phi = Math.acos(1 - 2 * k), th = Math.PI * (1 + Math.sqrt(5)) * i;
        dx = Math.sin(phi) * Math.cos(th); dy = Math.cos(phi); dz = Math.sin(phi) * Math.sin(th);
      }
      const v = speed * (0.85 + Math.random() * 0.3);
      const colour = colours[i % colours.length];
      if (style === 'willow') this.add(this.sparks, x, y, z, dx * v, dy * v, dz * v, colour, 2.6 + Math.random() * 1.2, 2.2 * s, 1.6, true);
      else this.add(this.sparks, x, y, z, dx * v, dy * v, dz * v, colour, 1.3 + Math.random() * 0.6, 3.2 * s, 2.2, Math.random() < 0.3);
    }
    // A soft flash of the burst's colour where it opens.
    this.add(this.glows, x, y, z, 0, 0, 0, tmp.copy(colours[0]).multiplyScalar(0.9), 0.35, 0, 0);
    this.onBurst?.(x, y, z);
  }

  /** A fountain of sparks that keeps spraying up from the grass until clear(). */
  fountain(x: number, z: number, colour: THREE.Color, rate = 60, height = 2.5): void {
    this.fountains.push({ x, z, rate, due: 0, colour: colour.clone(), height });
  }

  /** A camera flash in the stand: a quick white pop. */
  flash(x: number, y: number, z: number): void {
    this.add(this.glows, x, y, z, 0, 0, 0, tmp.setRGB(0.55, 0.55, 0.6), 0.09, 0, 0);
  }

  /** Every spark, rocket and fountain gone at once. */
  clear(): void {
    this.rockets.length = 0;
    this.fountains.length = 0;
    this.sparks.n = 0;
    this.glows.n = 0;
    this.sparks.points.geometry.setDrawRange(0, 0);
    this.glows.points.geometry.setDrawRange(0, 0);
  }

  update(dt: number): void {
    const s = this.scale;
    for (let i = this.rockets.length - 1; i >= 0; i--) {
      const r = this.rockets[i];
      r.t += dt;
      r.vy -= 9.8 * 0.35 * dt;
      r.x += r.vx * dt; r.y += r.vy * dt; r.z += r.vz * dt;
      // A trail of little gold sparks behind the climbing rocket.
      for (let k = 0; k < 2; k++) this.add(this.sparks, r.x, r.y, r.z, (Math.random() - 0.5) * 0.6, -0.5 - Math.random(), (Math.random() - 0.5) * 0.6, tmp.setRGB(1, 0.75, 0.35), 0.35 + Math.random() * 0.2, 1.5 * s, 3);
      if (r.t >= r.fuse) {
        this.rockets.splice(i, 1);
        this.burst(r.x, r.y, r.z, r.colours, r.style, r.count, r.radius);
      }
    }
    for (const f of this.fountains) {
      f.due += f.rate * dt;
      const up = Math.sqrt(2 * 9.8 * f.height);
      while (f.due >= 1) {
        f.due -= 1;
        const a = Math.random() * Math.PI * 2, out = Math.random() * 0.9;
        this.add(this.sparks, f.x, 0.2, f.z, Math.cos(a) * out, up * (0.75 + Math.random() * 0.3), Math.sin(a) * out, f.colour, 0.9 + Math.random() * 0.4, 9.8, 0.4, true);
      }
    }
    this.step(this.sparks, dt);
    this.step(this.glows, dt);
  }

  private step(c: Cloud, dt: number): void {
    let i = 0;
    while (i < c.n) {
      c.life[i] -= dt;
      if (c.life[i] <= 0) {
        // Swap the last live spark into this slot.
        const last = --c.n;
        if (i !== last) {
          const j = i * 3, l = last * 3;
          for (let k = 0; k < 3; k++) { c.pos[j + k] = c.pos[l + k]; c.vel[j + k] = c.vel[l + k]; c.base[j + k] = c.base[l + k]; }
          c.life[i] = c.life[last]; c.max[i] = c.max[last]; c.grav[i] = c.grav[last]; c.drag[i] = c.drag[last]; c.twinkle[i] = c.twinkle[last];
        }
        continue;
      }
      const j = i * 3;
      const drag = Math.exp(-c.drag[i] * dt);
      c.vel[j] *= drag; c.vel[j + 1] = c.vel[j + 1] * drag - c.grav[i] * dt; c.vel[j + 2] *= drag;
      c.pos[j] += c.vel[j] * dt; c.pos[j + 1] += c.vel[j + 1] * dt; c.pos[j + 2] += c.vel[j + 2] * dt;
      // Bright as it opens, fading out at the end; twinkling sparks flicker as they fall.
      const u = c.life[i] / c.max[i];
      let k = Math.min(1, u * 2.2);
      if (c.twinkle[i] && u < 0.6) k *= Math.random() < 0.35 ? 0.25 : 1;
      c.col[j] = c.base[j] * k; c.col[j + 1] = c.base[j + 1] * k; c.col[j + 2] = c.base[j + 2] * k;
      i++;
    }
    const g = c.points.geometry;
    g.setDrawRange(0, c.n);
    (g.attributes.position as THREE.BufferAttribute).needsUpdate = true;
    (g.attributes.color as THREE.BufferAttribute).needsUpdate = true;
  }
}
