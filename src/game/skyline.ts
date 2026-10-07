import * as THREE from 'three';
import type { SkylineKind } from './grounds';

/**
 * The far-away view round a ground, painted on one canvas and wrapped round the whole stadium on a
 * single open cylinder: hills and Mount Apo, the sea, the city, rice fields, pine forest or snowy
 * mountains. It sits beyond the fog (it paints its own haze instead), so it costs one draw call and
 * no lighting. u = 0.5 is behind the main stand, and 0.25 and 0.75 are behind the two goals.
 */

export interface SkylineLook {
  /** The fog colour: far layers fade into it. */
  haze: string;
  night: boolean;
  snow: boolean;
  /** Phones: a smaller canvas. */
  lite: boolean;
}

/** Metres from the middle of the pitch to the painted ring, and how tall the ring is. */
export const SKYLINE_RADIUS = 118;
const RING_HEIGHT = 30;
const RING_BOTTOM = -3;

type Ctx = CanvasRenderingContext2D;

/** A seeded random, so a ground's skyline is the same every match. */
function rng(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** A wavy line that joins up round the ring (whole numbers of waves only). */
function ridge(seed: number, base: number, amp: number, waves = [2, 3, 5, 9, 14]): (u: number) => number {
  const r = rng(seed);
  const parts = waves.map((k) => ({ k, a: amp * (0.4 + r() * 0.6) / Math.sqrt(k), p: r() * Math.PI * 2 }));
  return (u) => base + parts.reduce((s, q) => s + q.a * Math.sin(Math.PI * 2 * q.k * u + q.p), 0);
}

export class SkylinePainter {
  readonly canvas = document.createElement('canvas');
  private readonly ctx: Ctx;
  readonly w: number;
  readonly h: number;

  constructor(readonly look: SkylineLook) {
    this.w = this.canvas.width = look.lite ? 1024 : 2048;
    this.h = this.canvas.height = look.lite ? 256 : 512;
    this.ctx = this.canvas.getContext('2d')!;
  }

  /** A colour pushed towards the haze by `far` (0 near, 1 lost in it), and darkened at night. */
  col(hex: string, far: number): string {
    const c = new THREE.Color(hex).lerp(new THREE.Color(this.look.haze), far);
    if (this.look.night) c.lerp(new THREE.Color('#0b142b'), 0.72 - far * 0.25);
    return `#${c.getHexString()}`;
  }

  /** Height in pixels from the bottom for a height in metres on the ring. */
  y(m: number): number { return this.h - ((m - RING_BOTTOM) / RING_HEIGHT) * this.h; }

  /** Fill everything below the line `top(u)` (metres) in `fill`. */
  layer(top: (u: number) => number, fill: string): void {
    const { ctx, w } = this;
    ctx.fillStyle = fill;
    ctx.beginPath();
    ctx.moveTo(0, this.h);
    for (let x = 0; x <= w; x += 4) ctx.lineTo(x, this.y(top(x / w)));
    ctx.lineTo(w, this.h);
    ctx.closePath();
    ctx.fill();
  }

  /** Little tree shapes along a line: round tops, palms or pines. */
  trees(kind: 'round' | 'palm' | 'pine', ground: (u: number) => number, n: number, size: number, fill: string, seed: number): void {
    const { ctx, w } = this;
    const r = rng(seed);
    ctx.fillStyle = fill;
    ctx.strokeStyle = fill;
    for (let i = 0; i < n; i++) {
      const u = r();
      const x = u * w, s = size * (0.7 + r() * 0.6);
      const y0 = this.y(ground(u)), px = (s / RING_HEIGHT) * this.h;
      for (const dx of [0, w, -w]) {
        const cx = x + dx;
        if (cx < -px * 2 || cx > w + px * 2) continue;
        if (kind === 'pine') {
          ctx.beginPath(); ctx.moveTo(cx - px * 0.35, y0); ctx.lineTo(cx, y0 - px * 1.4); ctx.lineTo(cx + px * 0.35, y0); ctx.fill();
        } else if (kind === 'palm') {
          ctx.lineWidth = Math.max(1, px * 0.08);
          ctx.beginPath(); ctx.moveTo(cx, y0); ctx.quadraticCurveTo(cx + px * 0.15, y0 - px * 0.7, cx + px * 0.1, y0 - px * 1.3); ctx.stroke();
          for (let k = 0; k < 6; k++) {
            const a = -Math.PI / 2 + (k - 2.5) * 0.55;
            ctx.beginPath();
            ctx.moveTo(cx + px * 0.1, y0 - px * 1.3);
            ctx.quadraticCurveTo(cx + px * 0.1 + Math.cos(a) * px * 0.5, y0 - px * 1.45 + Math.sin(a) * px * 0.2, cx + px * 0.1 + Math.cos(a) * px * 0.75, y0 - px * 1.15 + Math.abs(Math.cos(a)) * px * 0.2);
            ctx.stroke();
          }
        } else {
          ctx.beginPath(); ctx.arc(cx, y0 - px * 0.6, px * 0.5, 0, Math.PI * 2); ctx.fill();
          ctx.fillRect(cx - px * 0.06, y0 - px * 0.3, px * 0.12, px * 0.3);
        }
      }
    }
  }

  paint(kind: SkylineKind): HTMLCanvasElement {
    const { ctx } = this;
    ctx.clearRect(0, 0, this.w, this.h);
    PAINTERS[kind](this);
    return this.canvas;
  }

  get context(): Ctx { return this.ctx; }
}

/** Mount Apo: a broad volcano with a twin summit behind the stand, among rolling green hills. */
function apo(p: SkylinePainter): void {
  p.layer(ridge(11, 6, 5), p.col('#6f9fb3', 0.55));
  // The mountain itself, left of the stand's middle.
  const mount = (u: number) => {
    const d = (u - 0.42) / 0.11;
    const shape = Math.exp(-d * d) * 15 + Math.exp(-(((u - 0.445) / 0.018) ** 2)) * 1.2;
    return 4 + shape;
  };
  p.layer(mount, p.col('#5d8aa0', 0.42));
  if (p.look.snow) p.layer((u) => mount(u) > 16.3 ? mount(u) : -10, p.col('#ffffff', 0.25));
  // A wisp of cloud on the summit.
  const ctx = p.context;
  ctx.fillStyle = p.look.night ? 'rgba(200,210,230,0.18)' : 'rgba(255,255,255,0.7)';
  ctx.beginPath(); ctx.ellipse(0.43 * p.w, p.y(18.4), p.w * 0.03, p.h * 0.025, 0, 0, Math.PI * 2); ctx.fill();
  const mid = ridge(12, 3.5, 3.5);
  p.layer(mid, p.col('#3f8f5c', 0.28));
  const near = ridge(13, 1.2, 2.2, [3, 4, 7, 11, 17]);
  p.layer(near, p.col('#2f7a4a', 0.12));
  p.trees('round', near, 70, 1.2, p.col('#245f3a', 0.1), 14);
  p.trees('palm', near, 25, 1.6, p.col('#245f3a', 0.1), 15);
}

/** The sea: a low horizon, an island, sailing boats, a lighthouse and palms along the shore. */
function sea(p: SkylinePainter): void {
  const ctx = p.context;
  // Water, darker towards the shore.
  const horizon = 2.2;
  const grad = ctx.createLinearGradient(0, p.y(horizon), 0, p.h);
  grad.addColorStop(0, p.col('#7fc4e0', 0.35));
  grad.addColorStop(1, p.col('#2f8fbf', 0.1));
  ctx.fillStyle = grad;
  ctx.fillRect(0, p.y(horizon), p.w, p.h - p.y(horizon));
  // An island with a hill, far out.
  const island = (u: number) => { const d = (u - 0.62) / 0.06; return horizon - 0.2 + Math.max(0, 4 * Math.exp(-d * d)) + Math.max(0, 1.5 * Math.exp(-(((u - 0.68) / 0.03) ** 2))); };
  p.layer((u) => (island(u) > horizon ? island(u) : -10), p.col('#4f8a6a', 0.45));
  // Little white sails.
  const r = rng(21);
  for (let i = 0; i < 9; i++) {
    const x = r() * p.w, yb = p.y(horizon - 0.2 - r() * 0.8), s = p.h * (0.025 + r() * 0.02);
    ctx.fillStyle = p.col('#ffffff', 0.15);
    ctx.beginPath(); ctx.moveTo(x, yb); ctx.lineTo(x, yb - s * 1.8); ctx.lineTo(x + s, yb); ctx.fill();
    ctx.fillStyle = p.col('#e63946', 0.2);
    ctx.fillRect(x - s * 0.4, yb, s * 1.6, s * 0.3);
  }
  // A lighthouse on a little point.
  const lx = 0.31 * p.w;
  ctx.fillStyle = p.col('#ffffff', 0.2);
  ctx.beginPath(); ctx.moveTo(lx - p.h * 0.02, p.y(horizon)); ctx.lineTo(lx - p.h * 0.012, p.y(horizon + 5)); ctx.lineTo(lx + p.h * 0.012, p.y(horizon + 5)); ctx.lineTo(lx + p.h * 0.02, p.y(horizon)); ctx.fill();
  ctx.fillStyle = p.col('#e63946', 0.2);
  ctx.fillRect(lx - p.h * 0.017, p.y(horizon + 2.4), p.h * 0.034, p.h * 0.025);
  ctx.fillStyle = p.look.night ? '#fff2a8' : p.col('#ffd23f', 0.2);
  ctx.fillRect(lx - p.h * 0.012, p.y(horizon + 5.6), p.h * 0.024, p.h * 0.02);
  // The shore and its palms.
  const shore = ridge(22, 0.4, 0.8, [3, 5, 8, 13]);
  p.layer(shore, p.col('#e3cf9a', 0.1));
  p.trees('palm', shore, 60, 2.4, p.col('#2a6b3a', 0.08), 23);
}

/** The city: tall buildings with windows that light up at sunset and night, and a big wheel. */
function city(p: SkylinePainter): void {
  const ctx = p.context;
  p.layer(ridge(31, 2, 2), p.col('#7a9cb0', 0.5));
  const r = rng(32);
  const night = p.look.night;
  for (const [far, count] of [[0.42, 70], [0.2, 55]] as const) {
    for (let i = 0; i < count; i++) {
      const u = r(), bw = p.w * (0.008 + r() * 0.014), hm = 4 + r() * (far > 0.3 ? 14 : 10);
      const x = u * p.w, top = p.y(hm), bottom = p.h;
      const tones = ['#c7d3df', '#9fb2c4', '#d9cbb8', '#b5c7d6', '#8aa0b5'];
      ctx.fillStyle = p.col(tones[i % tones.length], far);
      ctx.fillRect(x, top, bw, bottom - top);
      if (r() < 0.2) { ctx.fillRect(x + bw * 0.45, top - p.h * 0.04, Math.max(1, bw * 0.08), p.h * 0.04); }
      // Windows.
      const cell = Math.max(2, p.h * 0.012);
      for (let wy = top + cell; wy < p.y(1); wy += cell * 2) {
        for (let wx = x + cell * 0.6; wx < x + bw - cell; wx += cell * 1.8) {
          const lit = night ? r() < 0.55 : r() < 0.1;
          ctx.fillStyle = lit ? (night ? '#ffe28a' : p.col('#fff6c8', far)) : p.col('#5a7a99', far + 0.1);
          ctx.fillRect(wx, wy, cell * 0.9, cell);
        }
      }
    }
  }
  // A big wheel by the river.
  const cx = 0.7 * p.w, cy = p.y(8), rad = p.h * 0.17;
  ctx.strokeStyle = night ? '#ff8ad8' : p.col('#ffffff', 0.25);
  ctx.lineWidth = Math.max(1, p.h * 0.006);
  ctx.beginPath(); ctx.arc(cx, cy, rad, 0, Math.PI * 2); ctx.stroke();
  for (let k = 0; k < 12; k++) { const a = (k / 12) * Math.PI * 2; ctx.beginPath(); ctx.moveTo(cx, cy); ctx.lineTo(cx + Math.cos(a) * rad, cy + Math.sin(a) * rad); ctx.stroke(); }
  ctx.beginPath(); ctx.moveTo(cx - rad * 0.4, p.h); ctx.lineTo(cx, cy); ctx.lineTo(cx + rad * 0.4, p.h); ctx.stroke();
  const near = ridge(33, 0.6, 0.8, [4, 7, 11]);
  p.layer(near, p.col('#2f6f4a', 0.1));
  p.trees('round', near, 60, 1.1, p.col('#245f3a', 0.08), 34);
}

/** Rice fields in green terraces, little huts on stilts, coconut palms and far hills (with a cow or two). */
function fields(p: SkylinePainter): void {
  const ctx = p.context;
  p.layer(ridge(41, 6, 5), p.col('#6f9fb3', 0.5));
  p.layer(ridge(42, 3.2, 3), p.col('#4f9a5c', 0.3));
  // Terraces: bands of bright and darker green.
  const bands = 5;
  for (let b = 0; b < bands; b++) {
    const top = ridge(43 + b, 2.2 - b * 0.42, 0.35, [2, 3, 6]);
    p.layer(top, p.col(b % 2 ? '#7cc95a' : '#5fb24a', 0.22 - b * 0.04));
  }
  // Huts with pointed roofs.
  const r = rng(49);
  for (let i = 0; i < 14; i++) {
    const x = r() * p.w, base = p.y(0.8 + r() * 1.2), s = p.h * (0.03 + r() * 0.015);
    ctx.fillStyle = p.col('#a0703f', 0.15);
    ctx.fillRect(x - s * 0.5, base - s * 0.7, s, s * 0.7);
    ctx.fillStyle = p.col('#d8b36a', 0.15);
    ctx.beginPath(); ctx.moveTo(x - s * 0.75, base - s * 0.65); ctx.lineTo(x, base - s * 1.4); ctx.lineTo(x + s * 0.75, base - s * 0.65); ctx.fill();
  }
  // A few cows grazing.
  for (let i = 0; i < 6; i++) {
    const x = r() * p.w, base = p.y(0.4 + r() * 0.5), s = p.h * 0.014;
    ctx.fillStyle = p.col(i % 2 ? '#ffffff' : '#8b5a2b', 0.12);
    ctx.fillRect(x, base - s, s * 2, s);
    ctx.fillRect(x + s * 1.9, base - s * 1.4, s * 0.7, s * 0.6);
  }
  const near = ridge(44, 0.3, 0.6, [5, 9]);
  p.trees('palm', near, 55, 2.2, p.col('#2a6b3a', 0.08), 45);
}

/** Rolling hills covered in dark pines. */
function pines(p: SkylinePainter): void {
  const far = ridge(51, 7, 6), mid = ridge(52, 4, 4), near = ridge(53, 1.5, 2.5, [3, 4, 7, 11]);
  p.layer(far, p.col('#4f7d6a', 0.5));
  p.trees('pine', far, 160, 1.3, p.col('#3f6a58', 0.48), 54);
  p.layer(mid, p.col('#2f6a4a', 0.3));
  p.trees('pine', mid, 180, 1.7, p.col('#245a3e', 0.28), 55);
  p.layer(near, p.col('#245a3a', 0.12));
  p.trees('pine', near, 160, 2.3, p.col('#18452c', 0.1), 56);
}

/** Jagged snowy mountains with fir trees in front. */
function peaks(p: SkylinePainter): void {
  // Sharp peaks: a ridge folded into points.
  const r = rng(61);
  const tops = Array.from({ length: 11 }, (_, i) => ({ u: (i + r() * 0.6) / 11, h: 9 + r() * 10 }));
  const peak = (u: number) => tops.reduce((m, t) => {
    let d = Math.abs(u - t.u); d = Math.min(d, 1 - d);
    return Math.max(m, t.h - d * 160);
  }, 2);
  p.layer(peak, p.col('#7d8fa8', 0.4));
  // Snow on everything above the snow line.
  p.layer((u) => (peak(u) > 10 ? peak(u) : -10), p.col('#ffffff', 0.25));
  const ctx = p.context;
  ctx.globalCompositeOperation = 'source-atop';
  // Put the rock back under the snow line, with a soft jagged edge.
  p.layer(ridge(62, 10, 0.8, [9, 17, 29]), p.col('#7d8fa8', 0.4));
  ctx.globalCompositeOperation = 'source-over';
  const mid = ridge(63, 3, 2.5);
  p.layer(mid, p.col('#45705e', 0.25));
  p.trees('pine', mid, 160, 1.5, p.col('#2c5546', 0.22), 64);
  const near = ridge(65, 1, 1.4, [3, 5, 9]);
  p.layer(near, p.col(p.look.snow ? '#e9eef2' : '#2f6a4a', 0.08));
  p.trees('pine', near, 120, 2.2, p.col('#1e4a3a', 0.06), 66);
}

const PAINTERS: Record<SkylineKind, (p: SkylinePainter) => void> = { apo, sea, city, fields, pines, peaks };

/** The painted ring round the ground. */
export function buildSkyline(kind: SkylineKind, look: SkylineLook): THREE.Mesh {
  const canvas = new SkylinePainter(look).paint(kind);
  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.wrapS = THREE.RepeatWrapping;
  tex.anisotropy = 4;
  const geo = new THREE.CylinderGeometry(SKYLINE_RADIUS, SKYLINE_RADIUS, RING_HEIGHT, 72, 1, true);
  geo.translate(0, RING_BOTTOM + RING_HEIGHT / 2, 0);
  // Seen from inside, so the picture would read backwards: flip u.
  const uv = geo.attributes.uv as THREE.BufferAttribute;
  for (let i = 0; i < uv.count; i++) uv.setX(i, 1 - uv.getX(i));
  const mesh = new THREE.Mesh(geo, new THREE.MeshBasicMaterial({ map: tex, side: THREE.BackSide, alphaTest: 0.5, fog: false }));
  mesh.name = 'skyline';
  mesh.renderOrder = -1;
  return mesh;
}
