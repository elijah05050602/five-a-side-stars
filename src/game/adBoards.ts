import * as THREE from 'three';

/**
 * The pitch-side LED boards (and the LED strip on the stand roof, and a big screen at some grounds):
 * one mesh and one material for all of them, so they cost a single draw call however many there are.
 *
 * The pictures are a dozen panels painted once on one canvas (an atlas of 4 x 3 cells, each the same
 * shape as a panel on the boards, so nothing is ever stretched). The shader lays the panels end to end
 * along every board, and slides them all along one panel every few seconds like real LED boards. After
 * a goal (or a super skill) every board shows the same message in the scoring team's colours instead.
 * Sliding and messages only change two numbers, so nothing is repainted or uploaded while they run.
 */

/** One flat LED face: its middle, the way that is "right" for someone looking at it, the way it faces, and its size in metres. */
export interface BoardFace {
  centre: THREE.Vector3;
  right: THREE.Vector3;
  normal: THREE.Vector3;
  length: number;
  height: number;
}

/** What the boards need to know about a team: its name, scoreboard code and shirt colours. */
export interface BoardTeam { name: string; short: string; shirt: string; shirt2: string }

export interface AdBoardOptions {
  teams: [BoardTeam, BoardTeam];
  /** The ground's name, for the "Welcome to" panel. */
  ground: string;
  /** Phones: a smaller picture. */
  lite: boolean;
  /** Reduce motion: panels change without sliding, and messages do not flash. */
  calm: boolean;
}

const COLS = 4, ROWS = 3, COUNT = COLS * ROWS;
/** A panel is three times as wide as it is tall, on the canvas and on the boards. */
export const PANEL_ASPECT = 3;
/** Seconds each set of panels stays up before the boards slide on, and how long the slide takes. */
const HOLD = 6, SLIDE = 0.7;

const NAVY = '#1b2a41', YELLOW = '#ffd23f', WHITE = '#ffffff';

/** Black or white, whichever reads better on this colour. */
export function inkFor(bg: string): string {
  const c = new THREE.Color(bg);
  const lum = 0.2126 * c.r + 0.7152 * c.g + 0.0722 * c.b; // linear
  return lum > 0.35 ? NAVY : WHITE;
}

const FONT = (px: number) => `600 ${Math.round(px)}px Fredoka, "Trebuchet MS", system-ui, sans-serif`;

/** Write `text` centred at (x, y), shrunk to fit `maxW`, with an outline when `stroke` is given. */
function fitText(ctx: CanvasRenderingContext2D, text: string, x: number, y: number, size: number, maxW: number, fill: string, stroke?: string): void {
  ctx.font = FONT(size);
  const w = ctx.measureText(text).width;
  if (w > maxW) ctx.font = FONT(size * maxW / w);
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  if (stroke) {
    ctx.lineJoin = 'round';
    ctx.lineWidth = size * 0.16;
    ctx.strokeStyle = stroke;
    ctx.strokeText(text, x, y);
  }
  ctx.fillStyle = fill;
  ctx.fillText(text, x, y);
}

function star(ctx: CanvasRenderingContext2D, cx: number, cy: number, r: number, fill: string): void {
  ctx.beginPath();
  for (let k = 0; k < 10; k++) {
    const rr = k % 2 === 0 ? r : r * 0.42;
    const a = (k / 10) * Math.PI * 2 - Math.PI / 2;
    ctx.lineTo(cx + Math.cos(a) * rr, cy + Math.sin(a) * rr);
  }
  ctx.closePath();
  ctx.fillStyle = fill;
  ctx.fill();
}

function ball(ctx: CanvasRenderingContext2D, cx: number, cy: number, r: number): void {
  ctx.beginPath(); ctx.arc(cx, cy, r, 0, Math.PI * 2); ctx.fillStyle = WHITE; ctx.fill();
  ctx.lineWidth = r * 0.08; ctx.strokeStyle = NAVY; ctx.stroke();
  ctx.fillStyle = NAVY;
  const patch = (x: number, y: number, s: number) => {
    ctx.beginPath();
    for (let k = 0; k < 5; k++) { const a = (k / 5) * Math.PI * 2 - Math.PI / 2; ctx.lineTo(x + Math.cos(a) * s, y + Math.sin(a) * s); }
    ctx.closePath(); ctx.fill();
  };
  patch(cx, cy, r * 0.3);
  for (let k = 0; k < 5; k++) { const a = (k / 5) * Math.PI * 2 - Math.PI / 2; patch(cx + Math.cos(a) * r * 0.82, cy + Math.sin(a) * r * 0.82, r * 0.2); }
}

function heart(ctx: CanvasRenderingContext2D, cx: number, cy: number, s: number, fill: string): void {
  ctx.beginPath();
  ctx.moveTo(cx, cy + s * 0.9);
  ctx.bezierCurveTo(cx - s * 1.4, cy, cx - s * 0.8, cy - s * 1.1, cx, cy - s * 0.4);
  ctx.bezierCurveTo(cx + s * 0.8, cy - s * 1.1, cx + s * 1.4, cy, cx, cy + s * 0.9);
  ctx.fillStyle = fill;
  ctx.fill();
}

function trophy(ctx: CanvasRenderingContext2D, cx: number, cy: number, s: number): void {
  ctx.fillStyle = YELLOW;
  ctx.beginPath();
  ctx.moveTo(cx - s * 0.6, cy - s * 0.8); ctx.lineTo(cx + s * 0.6, cy - s * 0.8);
  ctx.quadraticCurveTo(cx + s * 0.6, cy + s * 0.15, cx, cy + s * 0.25);
  ctx.quadraticCurveTo(cx - s * 0.6, cy + s * 0.15, cx - s * 0.6, cy - s * 0.8);
  ctx.fill();
  ctx.lineWidth = s * 0.14; ctx.strokeStyle = YELLOW;
  for (const d of [-1, 1]) { ctx.beginPath(); ctx.arc(cx + d * s * 0.62, cy - s * 0.45, s * 0.25, d < 0 ? Math.PI * 0.5 : -Math.PI * 0.5, d < 0 ? Math.PI * 1.5 : Math.PI * 0.5); ctx.stroke(); }
  ctx.fillRect(cx - s * 0.1, cy + s * 0.2, s * 0.2, s * 0.35);
  ctx.fillRect(cx - s * 0.42, cy + s * 0.55, s * 0.84, s * 0.22);
}

function boot(ctx: CanvasRenderingContext2D, cx: number, cy: number, s: number, fill: string): void {
  ctx.fillStyle = fill;
  ctx.beginPath();
  ctx.moveTo(cx - s * 0.6, cy - s * 0.7);
  ctx.lineTo(cx - s * 0.1, cy - s * 0.7);
  ctx.lineTo(cx, cy - s * 0.1);
  ctx.quadraticCurveTo(cx + s * 0.9, cy - s * 0.05, cx + s * 0.95, cy + s * 0.35);
  ctx.lineTo(cx - s * 0.65, cy + s * 0.35);
  ctx.closePath();
  ctx.fill();
  ctx.fillStyle = NAVY;
  for (let k = 0; k < 3; k++) ctx.fillRect(cx - s * 0.5 + k * s * 0.4, cy + s * 0.35, s * 0.14, s * 0.16);
}

/** Paint one panel into the cell at (x, y), w by h. */
function paintPanel(ctx: CanvasRenderingContext2D, i: number, x: number, y: number, w: number, h: number, o: AdBoardOptions): void {
  const [home, away] = o.teams;
  const cx = x + w / 2, cy = y + h / 2;
  const bg = (c: string) => { ctx.fillStyle = c; ctx.fillRect(x, y, w, h); };
  const text = h * 0.42;
  switch (i) {
    case 0: case 7: {
      // The game's name, navy on yellow or yellow on navy.
      const dark = i === 0;
      bg(dark ? NAVY : YELLOW);
      fitText(ctx, 'GOAL RUSH!', cx, cy + h * 0.03, h * 0.5, w * 0.66, dark ? YELLOW : NAVY, dark ? '#0b1526' : WHITE);
      star(ctx, x + w * 0.1, cy, h * 0.24, dark ? WHITE : NAVY);
      star(ctx, x + w * 0.9, cy, h * 0.24, dark ? WHITE : NAVY);
      break;
    }
    case 1: case 4: {
      // A team's name in its colours, with its second colour down each end.
      const t = i === 1 ? home : away;
      bg(t.shirt);
      ctx.fillStyle = t.shirt2;
      ctx.fillRect(x, y, w * 0.07, h);
      ctx.fillRect(x + w * 0.93, y, w * 0.07, h);
      fitText(ctx, `GO ${t.name.toUpperCase()}!`, cx, cy + h * 0.03, text, w * 0.8, inkFor(t.shirt));
      break;
    }
    case 2:
      bg('#2eb872');
      fitText(ctx, 'Play fair!', cx + w * 0.06, cy, text, w * 0.66, WHITE);
      star(ctx, x + w * 0.12, cy, h * 0.26, YELLOW);
      break;
    case 3:
      bg('#3da5f4');
      ball(ctx, x + w * 0.12, cy, h * 0.3);
      fitText(ctx, 'Pass, move, score!', cx + w * 0.07, cy, h * 0.36, w * 0.72, WHITE);
      break;
    case 5: {
      bg('#ff6fb5');
      ctx.fillStyle = 'rgba(255,255,255,0.18)';
      for (let k = 0; k < 16; k++) {
        const a = (k / 16) * Math.PI * 2;
        ctx.beginPath(); ctx.moveTo(cx, cy);
        ctx.lineTo(cx + Math.cos(a) * w, cy + Math.sin(a) * w);
        ctx.lineTo(cx + Math.cos(a + 0.18) * w, cy + Math.sin(a + 0.18) * w);
        ctx.closePath(); ctx.fill();
      }
      ctx.save(); ctx.beginPath(); ctx.rect(x, y, w, h); ctx.restore();
      fitText(ctx, 'Have fun!', cx, cy, text * 1.1, w * 0.8, WHITE, '#c2357f');
      break;
    }
    case 6:
      bg('#6a4c93');
      trophy(ctx, x + w * 0.13, cy, h * 0.42);
      fitText(ctx, 'Dream big!', cx + w * 0.07, cy, text, w * 0.66, WHITE);
      break;
    case 8:
      bg('#ff7a00');
      boot(ctx, x + w * 0.12, cy, h * 0.4, WHITE);
      fitText(ctx, 'Well played!', cx + w * 0.07, cy, text, w * 0.68, WHITE);
      break;
    case 9: {
      // Today's match: home code against away code, the panel split in their colours.
      ctx.fillStyle = home.shirt;
      ctx.beginPath(); ctx.moveTo(x, y); ctx.lineTo(cx + w * 0.06, y); ctx.lineTo(cx - w * 0.06, y + h); ctx.lineTo(x, y + h); ctx.fill();
      ctx.fillStyle = away.shirt;
      ctx.beginPath(); ctx.moveTo(cx + w * 0.06, y); ctx.lineTo(x + w, y); ctx.lineTo(x + w, y + h); ctx.lineTo(cx - w * 0.06, y + h); ctx.fill();
      fitText(ctx, home.short.toUpperCase(), x + w * 0.25, cy, h * 0.5, w * 0.36, inkFor(home.shirt));
      fitText(ctx, away.short.toUpperCase(), x + w * 0.75, cy, h * 0.5, w * 0.36, inkFor(away.shirt));
      fitText(ctx, 'v', cx, cy, h * 0.34, w * 0.1, YELLOW, NAVY);
      break;
    }
    case 10:
      bg('#e63946');
      heart(ctx, x + w * 0.12, cy, h * 0.3, WHITE);
      fitText(ctx, 'Be kind!', cx + w * 0.06, cy, text, w * 0.66, WHITE);
      break;
    case 11:
      bg('#0f1b30');
      fitText(ctx, 'Welcome to', cx, y + h * 0.27, h * 0.22, w * 0.6, '#8ecae6');
      fitText(ctx, o.ground, cx, y + h * 0.64, h * 0.36, w * 0.88, YELLOW);
      break;
  }
  // A thin dark line between panels, like the seam between real LED tiles.
  ctx.fillStyle = 'rgba(0,0,0,0.35)';
  ctx.fillRect(x, y, Math.max(1, w * 0.006), h);
  ctx.fillRect(x + w - Math.max(1, w * 0.006), y, Math.max(1, w * 0.006), h);
}

function canvasTexture(c: HTMLCanvasElement): THREE.CanvasTexture {
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 8;
  return tex;
}

/** The twelve panels on one canvas, 4 across and 3 down. */
export function paintAtlas(o: AdBoardOptions): HTMLCanvasElement {
  const c = document.createElement('canvas');
  c.width = o.lite ? 1024 : 2048;
  c.height = Math.round(c.width / COLS / PANEL_ASPECT) * ROWS;
  const ctx = c.getContext('2d')!;
  const w = c.width / COLS, h = c.height / ROWS;
  for (let i = 0; i < COUNT; i++) {
    const x = (i % COLS) * w, y = Math.floor(i / COLS) * h;
    ctx.save();
    ctx.beginPath(); ctx.rect(x, y, w, h); ctx.clip();
    paintPanel(ctx, i, x, y, w, h, o);
    ctx.restore();
  }
  return c;
}

/**
 * The faces of every board as one geometry. Each face's u runs on from the last one's, in panels, so
 * the panels flow all the way round the pitch, and the same panel width (three times the face's height)
 * keeps every panel the same shape as on the canvas.
 */
export function boardGeometry(faces: BoardFace[]): THREE.BufferGeometry {
  const pos: number[] = [], uv: number[] = [], nor: number[] = [], idx: number[] = [];
  let u = 0;
  const p = new THREE.Vector3();
  for (const f of faces) {
    const panel = f.height * PANEL_ASPECT;
    const du = f.length / panel;
    const b = pos.length / 3;
    for (const [s, t] of [[-0.5, -0.5], [0.5, -0.5], [0.5, 0.5], [-0.5, 0.5]]) {
      p.copy(f.centre).addScaledVector(f.right, s * f.length);
      p.y += t * f.height;
      pos.push(p.x, p.y, p.z);
      nor.push(f.normal.x, f.normal.y, f.normal.z);
      uv.push(u + (s + 0.5) * du, t + 0.5);
    }
    idx.push(b, b + 1, b + 2, b, b + 2, b + 3);
    // Start the next board on a fresh panel, so no panel is cut in two at a corner.
    u = Math.ceil(u + du);
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('normal', new THREE.Float32BufferAttribute(nor, 3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  g.setIndex(idx);
  return g;
}

export class AdBoards {
  readonly mesh: THREE.Mesh;
  private readonly atlas: THREE.CanvasTexture;
  private readonly msgCanvas = document.createElement('canvas');
  private readonly msgTex: THREE.CanvasTexture;
  private readonly uniforms = {
    uScroll: { value: 0 },
    uMsg: { value: 0 },
    uMsgCell: { value: 0 },
    uMsgMap: { value: null as THREE.Texture | null },
  };
  private hold = HOLD;
  private sliding = 0;
  private from = 0;
  private msgLeft = 0;
  private flash = 0;

  constructor(faces: BoardFace[], private readonly o: AdBoardOptions) {
    this.atlas = canvasTexture(paintAtlas(o));
    this.msgCanvas.width = o.lite ? 512 : 1024;
    this.msgCanvas.height = Math.round(this.msgCanvas.width / 2 / PANEL_ASPECT);
    this.msgTex = canvasTexture(this.msgCanvas);
    this.uniforms.uMsgMap.value = this.msgTex;
    // Lit by itself, like a real LED board: it glows at night and costs no lighting.
    const mat = new THREE.MeshBasicMaterial({ map: this.atlas });
    mat.onBeforeCompile = (shader) => {
      Object.assign(shader.uniforms, this.uniforms);
      shader.fragmentShader = shader.fragmentShader
        .replace('#include <common>', '#include <common>\nuniform float uScroll;\nuniform float uMsg;\nuniform float uMsgCell;\nuniform sampler2D uMsgMap;')
        .replace('#include <map_fragment>', `
          #ifdef USE_MAP
            float pu = vMapUv.x + uScroll;
            float cell = mod(floor(pu), ${COUNT}.0);
            vec2 local = vec2(fract(pu), clamp(vMapUv.y, 0.002, 0.998));
            // Gradients from the smooth uv, so the jump from one cell to the next never shows as a line.
            vec2 gx = dFdx(vMapUv), gy = dFdy(vMapUv);
            vec4 texel;
            if (uMsg > 0.5) {
              vec2 m = vec2((uMsgCell + local.x) * 0.5, local.y);
              texel = textureGrad(uMsgMap, m, gx * vec2(0.5, 1.0), gy * vec2(0.5, 1.0));
            } else {
              vec2 a = vec2((mod(cell, ${COLS}.0) + local.x) / ${COLS}.0, (${ROWS - 1}.0 - floor(cell / ${COLS}.0) + local.y) / ${ROWS}.0);
              texel = textureGrad(map, a, gx / vec2(${COLS}.0, ${ROWS}.0), gy / vec2(${COLS}.0, ${ROWS}.0));
            }
            diffuseColor *= texel;
          #endif`);
    };
    // Shader changes the cache key would not otherwise see.
    mat.customProgramCacheKey = () => 'adboards-v1';
    this.mesh = new THREE.Mesh(boardGeometry(faces), mat);
    this.mesh.userData.dynamic = true;
    this.mesh.name = 'adboards';
  }

  /** Show `text` on every board in these colours for `seconds` (Infinity: until clear()). */
  show(text: string, bg: string, seconds: number): void {
    const c = this.msgCanvas, ctx = c.getContext('2d')!;
    const w = c.width / 2, h = c.height;
    const ink = inkFor(bg);
    for (const [k, back, fore] of [[0, bg, ink], [1, ink, bg]] as const) {
      ctx.fillStyle = back;
      ctx.fillRect(k * w, 0, w, h);
      star(ctx, k * w + w * 0.11, h / 2, h * 0.28, fore);
      star(ctx, k * w + w * 0.89, h / 2, h * 0.28, fore);
      fitText(ctx, text, k * w + w / 2, h * 0.53, h * 0.62, w * 0.66, fore);
    }
    this.msgTex.needsUpdate = true;
    this.uniforms.uMsg.value = 1;
    this.uniforms.uMsgCell.value = 0;
    this.msgLeft = seconds;
    this.flash = 0;
  }

  clear(): void {
    this.uniforms.uMsg.value = 0;
    this.msgLeft = 0;
  }

  get showing(): boolean { return this.uniforms.uMsg.value > 0.5; }

  update(dt: number): void {
    if (this.showing) {
      this.msgLeft -= dt;
      if (this.msgLeft <= 0) this.clear();
      else if (!this.o.calm) {
        // Swap the colours round a few times a second, like a stadium screen going wild.
        this.flash += dt;
        this.uniforms.uMsgCell.value = Math.floor(this.flash / 0.35) % 2;
      }
      return;
    }
    if (this.sliding > 0) {
      this.sliding = Math.max(0, this.sliding - dt);
      const k = 1 - this.sliding / SLIDE;
      this.uniforms.uScroll.value = this.from + k * k * (3 - 2 * k);
      if (this.sliding === 0) this.uniforms.uScroll.value = (this.from + 1) % COUNT;
      return;
    }
    this.hold -= dt;
    if (this.hold <= 0) {
      this.hold = HOLD;
      this.from = this.uniforms.uScroll.value;
      if (this.o.calm) this.uniforms.uScroll.value = (this.from + 1) % COUNT;
      else this.sliding = SLIDE;
    }
  }

  dispose(): void {
    this.mesh.geometry.dispose();
    (this.mesh.material as THREE.Material).dispose();
    this.atlas.dispose();
    this.msgTex.dispose();
    // Safari keeps a canvas's pixels until it is shrunk.
    for (const c of [this.atlas.image as HTMLCanvasElement, this.msgCanvas]) { c.width = 0; c.height = 0; }
  }
}
