import * as THREE from 'three';
import { shared } from './renderer';

/**
 * Small match effects: the streak behind a rocket of a shot, and puffs of dust and grass where a ball is
 * struck hard, a tackle flies in or a keeper dives. All of them are a few sprites with one shared soft dot.
 */
let dot: THREE.CanvasTexture | null = null;

/** A soft round dot, made once: the puffs, the ball's streak and the floodlight halos all use it. */
export function softDot(): THREE.CanvasTexture {
  if (dot) return dot;
  const c = document.createElement('canvas');
  c.width = c.height = 64;
  const ctx = c.getContext('2d')!;
  const g = ctx.createRadialGradient(32, 32, 0, 32, 32, 32);
  g.addColorStop(0, 'rgba(255,255,255,1)');
  g.addColorStop(0.45, 'rgba(255,255,255,0.55)');
  g.addColorStop(1, 'rgba(255,255,255,0)');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, 64, 64);
  dot = shared(new THREE.CanvasTexture(c));
  dot.colorSpace = THREE.SRGBColorSpace;
  return dot;
}

const dotMaterial = (colour: number) => new THREE.SpriteMaterial({ map: softDot(), color: colour, transparent: true, depthWrite: false, opacity: 0 });

/** A short streak of fading dots behind the ball while it flies fast. */
export class BallTrail {
  readonly group = new THREE.Group();
  private readonly dots: THREE.Sprite[] = [];
  private readonly points: THREE.Vector3[] = [];
  private life = 0;

  constructor(private readonly radius: number, n = 12) {
    for (let i = 0; i < n; i++) {
      const s = new THREE.Sprite(dotMaterial(0xffe27a));
      s.visible = false;
      this.dots.push(s);
      this.points.push(new THREE.Vector3());
      this.group.add(s);
    }
  }

  /** Each frame: where the ball is, and whether it is flying fast enough to streak. */
  update(dt: number, ball: THREE.Vector3, fast: boolean): void {
    this.life = fast ? 1 : Math.max(0, this.life - dt * 5);
    // Shift the history back a place and put the ball at the front (the vectors are reused, not made).
    const oldest = this.points.pop()!;
    this.points.unshift(oldest.copy(ball));
    const n = this.dots.length;
    for (let i = 0; i < n; i++) {
      const d = this.dots[i];
      d.visible = this.life > 0 && i > 0;
      if (!d.visible) continue;
      const k = 1 - i / n;
      d.position.copy(this.points[i]);
      d.scale.setScalar(this.radius * 4.2 * (0.35 + 0.65 * k));
      (d.material as THREE.SpriteMaterial).opacity = 0.85 * k * this.life;
    }
  }
}

interface Puff { s: THREE.Sprite; t: number; life: number; vx: number; vz: number; size: number }

/** Little dust-and-grass puffs, from a small pool of sprites. */
export class Puffs {
  readonly group = new THREE.Group();
  private readonly pool: Puff[] = [];

  constructor(n = 28) {
    for (let i = 0; i < n; i++) {
      const s = new THREE.Sprite(dotMaterial(0xd9c7a1));
      s.visible = false;
      this.pool.push({ s, t: 1, life: 0, vx: 0, vz: 0, size: 0 });
      this.group.add(s);
    }
  }

  /** A burst of `count` puffs at a spot on the grass, each about `size` across. */
  burst(x: number, z: number, count: number, size: number): void {
    for (let i = 0; i < count; i++) {
      const p = this.pool.find((q) => q.t >= q.life) ?? this.pool[i % this.pool.length];
      const a = Math.random() * Math.PI * 2, speed = 0.4 + Math.random() * 0.8;
      p.t = 0;
      p.life = 0.45 + Math.random() * 0.3;
      p.vx = Math.cos(a) * speed;
      p.vz = Math.sin(a) * speed;
      p.size = size * (0.7 + Math.random() * 0.6);
      p.s.position.set(x + p.vx * 0.1, 0.08, z + p.vz * 0.1);
      (p.s.material as THREE.SpriteMaterial).color.set(i % 3 === 0 ? 0x8fbf5a : 0xd9c7a1); // grass and dust
      p.s.visible = true;
    }
  }

  update(dt: number): void {
    for (const p of this.pool) {
      if (!p.s.visible) continue;
      p.t += dt;
      if (p.t >= p.life) { p.s.visible = false; continue; }
      const k = p.t / p.life;
      p.s.position.x += p.vx * dt;
      p.s.position.z += p.vz * dt;
      p.s.position.y += dt * 0.5;
      p.s.scale.setScalar(p.size * (0.6 + k * 1.2));
      (p.s.material as THREE.SpriteMaterial).opacity = 0.7 * (1 - k);
    }
  }
}
