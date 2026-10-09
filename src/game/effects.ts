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
  private size = 1;
  private fresh = true;

  constructor(private readonly radius: number, n = 12) {
    for (let i = 0; i < n; i++) {
      const s = new THREE.Sprite(dotMaterial(0xffe27a));
      s.visible = false;
      this.dots.push(s);
      this.points.push(new THREE.Vector3());
      this.group.add(s);
    }
  }

  /** A super skill's ball streaks in its colour, and bigger; null puts the usual gold back. */
  setColour(colour: number | null): void {
    this.size = colour === null ? 1 : 2.2;
    for (const d of this.dots) (d.material as THREE.SpriteMaterial).color.set(colour ?? 0xffe27a);
  }

  /** Put the streak out at once, so the next one does not join up with where the ball was. */
  clear(): void {
    this.life = 0;
    this.fresh = true;
    for (const d of this.dots) d.visible = false;
  }

  /** Each frame: where the ball is, and whether it is flying fast enough to streak. */
  update(dt: number, ball: THREE.Vector3, fast: boolean): void {
    this.life = fast ? 1 : Math.max(0, this.life - dt * 5);
    // Shift the history back a place and put the ball at the front (the vectors are reused, not made).
    const oldest = this.points.pop()!;
    this.points.unshift(oldest.copy(ball));
    // After clear(), every point starts at the ball, so no streak is drawn from where it was before.
    if (this.fresh) { this.fresh = false; for (const p of this.points) p.copy(ball); }
    const n = this.dots.length;
    for (let i = 0; i < n; i++) {
      const d = this.dots[i];
      d.visible = this.life > 0 && i > 0;
      if (!d.visible) continue;
      const k = 1 - i / n;
      d.position.copy(this.points[i]);
      d.scale.setScalar(this.radius * 4.2 * this.size * (0.35 + 0.65 * k));
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

  /** Put every puff out at once. */
  clear(): void {
    for (const p of this.pool) { p.s.visible = false; p.t = p.life; }
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

/** A soft glow that fades from the bottom up, for the super skill's pillar of light. Made once per match. */
function pillarTexture(): THREE.CanvasTexture {
  const c = document.createElement('canvas');
  c.width = 4;
  c.height = 64;
  const ctx = c.getContext('2d')!;
  const g = ctx.createLinearGradient(0, 64, 0, 0);
  g.addColorStop(0, 'rgba(255,255,255,0.95)');
  g.addColorStop(0.35, 'rgba(255,255,255,0.45)');
  g.addColorStop(1, 'rgba(255,255,255,0)');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, 4, 64);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

interface Spark { s: THREE.Sprite; a: number; r: number; y: number; vy: number; life: number; t: number }

/**
 * The super skill's aura: a pillar of light round the player, rings bursting out across the grass and
 * sparks spiralling up. `burst()` is the big moment of the cutscene; while the super lasts, `follow()`
 * keeps a smaller glow on the player.
 */
export class SuperAura {
  readonly group = new THREE.Group();
  private readonly pillar: THREE.Mesh;
  private readonly rings: THREE.Mesh[] = [];
  private readonly sparks: Spark[] = [];
  private readonly colour = new THREE.Color();
  private t = 10;
  private glow = 0;
  private target = 0;

  constructor(private readonly size: number) {
    const add = <M extends THREE.Material>(m: M): M => Object.assign(m, { transparent: true, depthWrite: false, blending: THREE.AdditiveBlending });
    this.pillar = new THREE.Mesh(new THREE.CylinderGeometry(0.55 * size, 0.75 * size, 3.2 * size, 28, 1, true), add(new THREE.MeshBasicMaterial({ map: pillarTexture(), side: THREE.DoubleSide, opacity: 0 })));
    this.pillar.position.y = 1.6 * size;
    this.group.add(this.pillar);
    const ringGeo = new THREE.RingGeometry(0.8, 1, 48);
    for (let i = 0; i < 3; i++) {
      const r = new THREE.Mesh(ringGeo, add(new THREE.MeshBasicMaterial({ opacity: 0 })));
      r.rotation.x = -Math.PI / 2;
      r.position.y = 0.03 + i * 0.005;
      this.rings.push(r);
      this.group.add(r);
    }
    for (let i = 0; i < 26; i++) {
      const s = new THREE.Sprite(add(new THREE.SpriteMaterial({ map: softDot(), opacity: 0 })));
      s.visible = false;
      this.sparks.push({ s, a: 0, r: 0, y: 0, vy: 0, life: 1, t: 1 });
      this.group.add(s);
    }
    this.group.visible = false;
  }

  /** The big moment: rings, a flare of the pillar and a fountain of sparks. */
  burst(x: number, z: number, colour: number): void {
    this.colour.set(colour);
    this.group.position.set(x, 0, z);
    this.group.visible = true;
    this.t = 0;
    this.glow = 1.6;
    for (const sp of this.sparks) this.spark(sp, true);
  }

  /** While the super lasts: keep a gentler glow, in its colour, on the player (on = false when it is over). */
  follow(x: number, z: number, on: boolean, colour: number): void {
    if (on) {
      this.group.position.set(x, 0, z);
      this.colour.set(colour);
      this.group.visible = true; // a replay can start partway through a super, after its burst
    }
    this.target = on ? 0.55 : 0;
  }

  /** Put the glow, rings and sparks out at once. */
  clear(): void {
    this.t = 10;
    this.glow = 0;
    this.target = 0;
    for (const sp of this.sparks) sp.s.visible = false;
    this.group.visible = false;
  }

  private spark(sp: Spark, first: boolean): void {
    sp.a = Math.random() * Math.PI * 2;
    sp.r = (0.3 + Math.random() * 0.6) * this.size;
    sp.y = first ? Math.random() * 0.4 : 0;
    sp.vy = (1.2 + Math.random() * 2.2) * this.size;
    sp.life = 0.6 + Math.random() * 0.8;
    sp.t = first ? 0 : -Math.random() * 0.3;
    (sp.s.material as THREE.SpriteMaterial).color.copy(this.colour).lerp(new THREE.Color(0xffffff), Math.random() * 0.5);
    sp.s.visible = true;
  }

  update(dt: number): void {
    if (!this.group.visible) return;
    this.t += dt;
    this.glow += (Math.max(this.target, this.t < 1.2 ? 1.3 : 0) - this.glow) * Math.min(1, dt * 4);
    const pm = this.pillar.material as THREE.MeshBasicMaterial;
    pm.color.copy(this.colour);
    pm.opacity = Math.min(0.5, this.glow * 0.4 * (0.75 + 0.25 * Math.sin(this.t * 18)));
    this.pillar.scale.set(1 + 0.08 * Math.sin(this.t * 9), 1, 1 + 0.08 * Math.sin(this.t * 9));
    this.pillar.rotation.y += dt * 2;
    this.rings.forEach((r, i) => {
      const k = (this.t - i * 0.18) / 0.9;
      const m = r.material as THREE.MeshBasicMaterial;
      m.color.copy(this.colour);
      m.opacity = k > 0 && k < 1 ? (1 - k) * 0.9 : 0;
      r.scale.setScalar((0.4 + k * 3.6) * this.size);
    });
    const live = this.glow > 0.4;
    for (const sp of this.sparks) {
      sp.t += dt;
      if (sp.t < 0) continue;
      if (sp.t > sp.life) {
        if (live) this.spark(sp, false);
        else { sp.s.visible = false; continue; }
      }
      const k = sp.t / sp.life;
      sp.a += dt * 3;
      sp.y += sp.vy * dt;
      sp.s.position.set(Math.cos(sp.a) * sp.r, sp.y, Math.sin(sp.a) * sp.r);
      sp.s.scale.setScalar(0.22 * this.size * (1 - k * 0.6));
      (sp.s.material as THREE.SpriteMaterial).opacity = (1 - k) * Math.min(1, this.glow);
    }
    if (this.glow < 0.02 && this.t > 1.2 && this.sparks.every((sp) => !sp.s.visible)) this.group.visible = false;
  }
}
