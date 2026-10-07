import * as THREE from 'three';
import { addOutline, toonMaterial } from './toon';
import { POST_R, netPresses, roofHeight, type GoalShape, type NetPanel } from './goalFrame';

export interface PitchDims {
  length: number; width: number; goalWidth: number; goalHeight: number; goalDepth: number;
  /** Grass between the lines and the boards (0 = boards on the lines, as in training). */
  runoffSide?: number; runoffEnd?: number;
  /** Graphics: let the stands, trees and boards cast shadows (default true). */
  sceneryShadows?: boolean;
  /** Graphics: shiny physically based grass and boards; false uses a cheaper matt material (default true). */
  pbr?: boolean;
  /** Graphics: how the nets move (default a cloth), how many strands across (default 16), and calmer for Reduce motion. */
  netDetail?: NetDetail;
  netCols?: number;
  calmNets?: boolean;
}

/** Where the four floodlight towers stand: [x, y, z] of each lamp head. */
export function floodlightPositions(L: number, W: number): [number, number, number][] {
  const out: [number, number, number][] = [];
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) out.push([sx * (L / 2 + 4.5), 9.5, sz * (W / 2 + 4.5)]);
  return out;
}

/** The parts of the pitch the match scene animates: nets and the big scoreboard. The fans live in Crowd.ts. */
export interface PitchExtras { nets: GoalNet[]; scoreboard: Scoreboard }
export function pitchExtras(pitch: THREE.Group): PitchExtras {
  return pitch.userData.extras as PitchExtras;
}

const KIT_PALETTE = ['#e63946', '#3da5f4', '#ffd23f', '#2eb872', '#ff6fb5', '#ff7a00', '#6a4c93', '#ffffff', '#1b2a41'];

/** Mown stripes with a sprinkle of lighter and darker blades, so the grass is not a flat colour. */
export function grassTexture(stripes: number, light: string, dark: string, speckle = true): THREE.CanvasTexture {
  const c = document.createElement('canvas');
  c.width = 1024; c.height = 1024;
  const ctx = c.getContext('2d')!;
  for (let i = 0; i < stripes; i++) {
    ctx.fillStyle = i % 2 === 0 ? light : dark;
    ctx.fillRect((i * 1024) / stripes, 0, 1024 / stripes + 1, 1024);
  }
  if (speckle) {
    for (let i = 0; i < 9000; i++) {
      const x = Math.random() * 1024, y = Math.random() * 1024;
      ctx.fillStyle = Math.random() < 0.5 ? 'rgba(255,255,255,0.07)' : 'rgba(0,40,0,0.10)';
      ctx.fillRect(x, y, 2 + Math.random() * 3, 1 + Math.random() * 2);
    }
  }
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 8;
  return tex;
}

/** Cheerful advertising-board style panels: colour blocks with stars and balls, no words. */
function boardTexture(): THREE.CanvasTexture {
  const c = document.createElement('canvas');
  c.width = 1024; c.height = 128;
  const ctx = c.getContext('2d')!;
  const colours = ['#3da5f4', '#ffd23f', '#2eb872', '#ff6fb5', '#ff7a00', '#6a4c93'];
  const panels = 8;
  for (let i = 0; i < panels; i++) {
    ctx.fillStyle = colours[i % colours.length];
    ctx.fillRect((i * 1024) / panels, 0, 1024 / panels, 128);
    const cx = (i + 0.5) * (1024 / panels), cy = 64;
    ctx.fillStyle = 'rgba(255,255,255,0.9)';
    if (i % 2 === 0) {
      // Star
      ctx.beginPath();
      for (let k = 0; k < 10; k++) { const r = k % 2 === 0 ? 34 : 14; const a = (k / 10) * Math.PI * 2 - Math.PI / 2; ctx.lineTo(cx + Math.cos(a) * r, cy + Math.sin(a) * r); }
      ctx.closePath(); ctx.fill();
    } else {
      // Ball
      ctx.beginPath(); ctx.arc(cx, cy, 30, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = '#1b1b1b';
      for (let k = 0; k < 5; k++) { const a = (k / 5) * Math.PI * 2; ctx.beginPath(); ctx.arc(cx + Math.cos(a) * 17, cy + Math.sin(a) * 17, 7, 0, Math.PI * 2); ctx.fill(); }
      ctx.beginPath(); ctx.arc(cx, cy, 8, 0, Math.PI * 2); ctx.fill();
    }
  }
  ctx.fillStyle = 'rgba(0,0,0,0.18)';
  for (let i = 1; i < panels; i++) ctx.fillRect((i * 1024) / panels - 2, 0, 4, 128);
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.wrapS = THREE.RepeatWrapping;
  return tex;
}

/** Grass, markings, rebound boards, two goals with nets, flags, a little stand and some scenery. */
export function buildPitch(d: PitchDims): THREE.Group {
  const g = new THREE.Group();
  const L = d.length, W = d.width;
  // The grass fills most of the screen, so on Low it skips the costly physically based lighting.
  const surface = (opts: { map: THREE.Texture; roughness: number }): THREE.MeshStandardMaterial | THREE.MeshLambertMaterial =>
    d.pbr === false ? new THREE.MeshLambertMaterial({ map: opts.map }) : new THREE.MeshStandardMaterial(opts);

  const grass = new THREE.Mesh(new THREE.PlaneGeometry(L + 6, W + 6), surface({ map: grassTexture(12, '#3cc47c', '#33b36f'), roughness: 1 }));
  grass.rotation.x = -Math.PI / 2;
  grass.receiveShadow = true;
  grass.userData.grass = true;
  g.add(grass);

  // Surround: darker, rougher grass outside the boards.
  const apronTex = grassTexture(1, '#259a60', '#259a60');
  apronTex.wrapS = apronTex.wrapT = THREE.RepeatWrapping;
  apronTex.repeat.set(6, 6);
  const apron = new THREE.Mesh(new THREE.PlaneGeometry(L + 60, W + 60), surface({ map: apronTex, roughness: 1 }));
  apron.rotation.x = -Math.PI / 2;
  apron.position.y = -0.01;
  apron.receiveShadow = true;
  apron.userData.grass = 'apron';
  g.add(apron);
  // Daisies dotted about the surround.
  const daisy = new THREE.InstancedMesh(new THREE.CircleGeometry(0.09, 6), new THREE.MeshBasicMaterial({ color: 0xffffff }), 160);
  const m4 = new THREE.Matrix4();
  for (let i = 0; i < 160; i++) {
    const a = Math.random() * Math.PI * 2, r = 1 + Math.random() * 14;
    const x = Math.cos(a) * (L / 2 + 2 + r), z = Math.sin(a) * (W / 2 + 2 + r);
    m4.makeRotationX(-Math.PI / 2).setPosition(x, 0.0, z);
    daisy.setMatrixAt(i, m4);
  }
  g.add(daisy);

  // Line markings as thin flat boxes slightly above the grass.
  const lineMat = new THREE.MeshBasicMaterial({ color: 0xffffff });
  const lw = 0.1;
  const line = (x: number, z: number, lx: number, lz: number) => {
    const m = new THREE.Mesh(new THREE.BoxGeometry(lx, 0.01, lz), lineMat);
    m.position.set(x, 0.005, z);
    g.add(m);
  };
  line(0, -W / 2, L, lw);
  line(0, W / 2, L, lw);
  line(-L / 2, 0, lw, W);
  line(L / 2, 0, lw, W);
  line(0, 0, lw, W); // halfway
  const flat = (geo: THREE.BufferGeometry, x: number, z: number, y = 0.005, rz = 0) => {
    const m = new THREE.Mesh(geo, lineMat);
    m.rotation.x = -Math.PI / 2;
    m.rotation.z = rz;
    m.position.set(x, y, z);
    g.add(m);
    return m;
  };
  flat(new THREE.RingGeometry(W * 0.12 - lw, W * 0.12, 48), 0, 0);
  flat(new THREE.CircleGeometry(0.12, 12), 0, 0, 0.006);
  for (const sx of [-1, 1]) {
    flat(new THREE.RingGeometry(W * 0.26 - lw, W * 0.26, 48, 1, sx > 0 ? Math.PI / 2 : -Math.PI / 2, Math.PI), (sx * L) / 2, 0);
    flat(new THREE.CircleGeometry(0.12, 12), sx * (L / 2 - W * 0.26 - 0.6), 0, 0.006);
    // Corner arcs and flags
    for (const sz of [-1, 1]) {
      const start = sx > 0 ? (sz > 0 ? Math.PI : Math.PI / 2) : (sz > 0 ? -Math.PI / 2 : 0);
      flat(new THREE.RingGeometry(0.6 - lw, 0.6, 16, 1, start, Math.PI / 2), (sx * L) / 2, (sz * W) / 2);
      g.add(buildFlag((sx * L) / 2 + sx * 0.25, (sz * W) / 2 + sz * 0.25));
    }
  }

  // Rebound boards around the pitch, leaving the goal mouths open.
  const boardH = 0.9;
  const boardTex = boardTexture();
  const boardTop = toonMaterial({ color: 0x1b2a41 });
  const board = (x: number, z: number, lx: number, lz: number) => {
    const tex = boardTex.clone();
    tex.needsUpdate = true;
    tex.repeat.set(Math.max(1, Math.round(Math.max(lx, lz) / 8)), 1);
    const mat = surface({ map: tex, roughness: 0.7 });
    const m = new THREE.Mesh(new THREE.BoxGeometry(lx, boardH, lz), mat);
    m.position.set(x, boardH / 2, z);
    m.castShadow = true;
    g.add(m);
    const cap = new THREE.Mesh(new THREE.BoxGeometry(lx + 0.06, 0.1, lz + 0.06), boardTop);
    cap.position.set(x, boardH + 0.03, z);
    g.add(cap);
  };
  const t = 0.15;
  const rs = d.runoffSide ?? 0, re = d.runoffEnd ?? 0;
  const bl = L + re * 2, bw = W + rs * 2;
  board(0, -bw / 2 - t / 2, bl + t * 2, t);
  board(0, bw / 2 + t / 2, bl + t * 2, t);
  const nets: GoalNet[] = [];
  for (const sx of [-1, 1] as const) {
    if (re > d.goalDepth) {
      // Boards set back behind the goal, so the ball can run out for a goal kick or a corner.
      board(sx * (bl / 2 + t / 2), 0, t, bw);
    } else {
      const sideLen = (W - d.goalWidth) / 2;
      board(sx * (L / 2 + t / 2), -(d.goalWidth / 2 + sideLen / 2), t, sideLen);
      board(sx * (L / 2 + t / 2), d.goalWidth / 2 + sideLen / 2, t, sideLen);
    }
    const net = new GoalNet(sx, d, d.netDetail, d.netCols, d.calmNets);
    nets.push(net);
    g.add(buildGoal(sx, d), net.group);
  }

  // A stand along the far side (the fans are in Crowd.ts), benches and cones on the near side.
  g.add(buildStand(L, W));
  const scoreboard = new Scoreboard();
  scoreboard.group.position.set(-L / 2 - 7.5, 0, 0);
  scoreboard.group.rotation.y = Math.PI / 2;
  g.add(scoreboard.group);
  for (const [x, y, z] of floodlightPositions(L, W)) g.add(buildFloodlight(x, y, z));
  g.userData.extras = { nets, scoreboard } satisfies PitchExtras;
  for (const sx of [-1, 1]) g.add(buildBench(sx * L * 0.18, W / 2 + 2.2));
  const coneMat = toonMaterial({ color: 0xff7a00 });
  for (let i = 0; i < 4; i++) {
    const cone = new THREE.Mesh(new THREE.ConeGeometry(0.18, 0.4, 8), coneMat);
    cone.position.set(-L / 2 + 1 + i * 0.9, 0.2, W / 2 + 3.2);
    cone.castShadow = true;
    addOutline(cone, 0.02);
    g.add(cone);
  }

  // Round, friendly trees around the outside so the camera edge isn't bare.
  const leafMats = [0x1d8f5a, 0x2aa86a, 0x177a4a].map((c) => toonMaterial({ color: c }));
  const trunkMat = toonMaterial({ color: 0x8b5a2b });
  for (let i = 0; i < 16; i++) {
    const tree = new THREE.Group();
    const trunk = new THREE.Mesh(new THREE.CylinderGeometry(0.16, 0.22, 1.0, 7), trunkMat);
    trunk.position.y = 0.5;
    addOutline(trunk, 0.03);
    const size = 1.1 + (i % 3) * 0.3;
    const top = new THREE.Mesh(new THREE.SphereGeometry(size, 10, 8), leafMats[i % 3]);
    top.position.y = 1.0 + size * 0.9;
    top.castShadow = true;
    top.userData.leaves = true;
    addOutline(top, 0.05);
    const top2 = new THREE.Mesh(new THREE.SphereGeometry(size * 0.7, 9, 7), leafMats[(i + 1) % 3]);
    top2.position.set(size * 0.5, 1.0 + size * 1.3, size * 0.3);
    addOutline(top2, 0.04);
    tree.add(trunk, top, top2);
    const a = (i / 16) * Math.PI * 2 + 0.2;
    const far = Math.abs(Math.sin(a)) > 0.7 && Math.sin(a) < 0 ? 5 : 0; // leave room for the stand
    tree.position.set(Math.cos(a) * (L / 2 + 8 + (i % 3) * 1.5), 0, Math.sin(a) * (W / 2 + 7 + ((i * 2) % 3) + far));
    g.add(tree);
  }
  // Only the players and the ball then draw into the shadow map, which is most of its cost saved.
  if (d.sceneryShadows === false) g.traverse((o) => { o.castShadow = false; });
  return g;
}

function buildFlag(x: number, z: number): THREE.Group {
  const g = new THREE.Group();
  const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.02, 0.025, 1.5, 6), toonMaterial({ color: 0xffffff }));
  pole.position.y = 0.75;
  const shape = new THREE.Shape();
  shape.moveTo(0, 0); shape.lineTo(0.45, -0.14); shape.lineTo(0, -0.3); shape.closePath();
  const flag = new THREE.Mesh(new THREE.ShapeGeometry(shape), new THREE.MeshBasicMaterial({ color: 0xffd23f, side: THREE.DoubleSide }));
  flag.position.set(0, 1.5, 0);
  flag.rotation.y = Math.atan2(-z, -x);
  g.add(pole, flag);
  g.position.set(x, 0, z);
  return g;
}

export interface StandLayout { len: number; z0: number; rows: number; rowDepth: number; rowRise: number; baseHeight: number; roofY: number }

/** Where the stand's seat rows are; the crowd (Crowd.ts) sits its fans on these. Row r tops out at baseHeight + r * rowRise, at z0 - r * rowDepth. The roof's underside is at roofY. */
export function standLayout(L: number, W: number): StandLayout {
  return { len: L * 0.8, z0: -W / 2 - 3.2, rows: 3, rowDepth: 1.2, rowRise: 0.6, baseHeight: 0.6, roofY: 3.14 };
}

/** Three stepped rows of seats under a roof with bunting. The fans themselves are added by Crowd. */
function buildStand(L: number, W: number): THREE.Group {
  const g = new THREE.Group();
  const { len, z0, rows, rowDepth, rowRise, baseHeight, roofY } = standLayout(L, W);
  const stepMat = toonMaterial({ color: 0xb8c4d6 });
  for (let r = 0; r < rows; r++) {
    const h = baseHeight + r * rowRise;
    const step = new THREE.Mesh(new THREE.BoxGeometry(len, h, rowDepth), stepMat);
    step.position.set(0, h / 2, z0 - r * rowDepth);
    step.receiveShadow = true;
    step.castShadow = true;
    g.add(step);
  }
  // Roof on two posts, with bunting along the front edge.
  const roof = new THREE.Mesh(new THREE.BoxGeometry(len + 0.6, 0.12, rows * rowDepth + 0.8), toonMaterial({ color: 0x3da5f4 }));
  roof.position.set(0, roofY + 0.06, z0 - (rows - 1) * rowDepth / 2);
  roof.castShadow = true;
  g.add(roof);
  const postMat = toonMaterial({ color: 0x1b2a41 });
  for (const sx of [-1, 1]) {
    const post = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.06, 3.2, 6), postMat);
    post.position.set(sx * (len / 2 + 0.2), 1.6, z0 - rows * rowDepth + 0.4);
    g.add(post);
  }
  const flagCount = Math.floor(len / 0.5);
  const tri = new THREE.Shape();
  tri.moveTo(-0.18, 0); tri.lineTo(0.18, 0); tri.lineTo(0, -0.32); tri.closePath();
  const bunting = new THREE.InstancedMesh(new THREE.ShapeGeometry(tri), new THREE.MeshBasicMaterial({ side: THREE.DoubleSide }), flagCount);
  const bm = new THREE.Matrix4();
  const bc = new THREE.Color();
  for (let i = 0; i < flagCount; i++) {
    bm.makeTranslation(-len / 2 + 0.25 + i * 0.5, 3.1 - Math.abs(Math.sin(i * 0.9)) * 0.08, z0 + 0.95);
    bunting.setMatrixAt(i, bm);
    bunting.setColorAt(i, bc.set(KIT_PALETTE[i % KIT_PALETTE.length]));
  }
  g.add(bunting);
  return g;
}

function buildBench(x: number, z: number): THREE.Group {
  const g = new THREE.Group();
  const seat = new THREE.Mesh(new THREE.BoxGeometry(2.4, 0.08, 0.4), toonMaterial({ color: 0xffd23f }));
  seat.position.y = 0.45;
  seat.castShadow = true;
  addOutline(seat, 0.02);
  const back = new THREE.Mesh(new THREE.BoxGeometry(2.4, 0.35, 0.06), toonMaterial({ color: 0xffd23f }));
  back.position.set(0, 0.7, 0.18);
  addOutline(back, 0.02);
  const legMat = toonMaterial({ color: 0x1b2a41 });
  for (const sx of [-1, 1]) {
    const leg = new THREE.Mesh(new THREE.BoxGeometry(0.08, 0.45, 0.4), legMat);
    leg.position.set(sx * 1.05, 0.225, 0);
    g.add(leg);
  }
  // A bag of spare balls under one end.
  const ballMat = toonMaterial({ color: 0xffffff });
  for (let i = 0; i < 3; i++) {
    const b = new THREE.Mesh(new THREE.SphereGeometry(0.13, 10, 8), ballMat);
    b.position.set(-0.6 + i * 0.3, 0.13, 0.5);
    addOutline(b, 0.015);
    g.add(b);
  }
  g.add(seat, back);
  g.position.set(x, 0, z);
  return g;
}

function buildGoal(sx: number, d: PitchDims): THREE.Group {
  const g = new THREE.Group();
  const postR = POST_R;
  const postMat = toonMaterial({ color: 0xffffff });
  const gw = d.goalWidth, gh = d.goalHeight, gd = d.goalDepth;
  const x0 = sx * d.length / 2;
  const post = (z: number) => {
    const m = new THREE.Mesh(new THREE.CylinderGeometry(postR, postR, gh, 10), postMat);
    m.position.set(x0, gh / 2, z);
    m.castShadow = true;
    addOutline(m, 0.02);
    g.add(m);
  };
  post(-gw / 2);
  post(gw / 2);
  const bar = new THREE.Mesh(new THREE.CylinderGeometry(postR, postR, gw + postR * 2, 10), postMat);
  bar.rotation.x = Math.PI / 2;
  bar.position.set(x0, gh, 0);
  addOutline(bar, 0.02);
  g.add(bar);
  for (const z of [-gw / 2, gw / 2]) {
    const joint = new THREE.Mesh(new THREE.SphereGeometry(postR * 1.1, 10, 8), postMat);
    joint.position.set(x0, gh, z);
    g.add(joint);
  }
  // Back frame
  const backBar = new THREE.Mesh(new THREE.CylinderGeometry(postR * 0.7, postR * 0.7, gw + postR * 2, 8), postMat);
  backBar.rotation.x = Math.PI / 2;
  backBar.position.set(x0 + sx * gd, gh * 0.5, 0);
  g.add(backBar);
  for (const z of [-gw / 2, gw / 2]) {
    const side = new THREE.Mesh(new THREE.CylinderGeometry(postR * 0.7, postR * 0.7, Math.hypot(gd, gh * 0.5), 8), postMat);
    side.position.set(x0 + sx * gd / 2, gh * 0.75, z);
    side.rotation.z = sx * Math.atan2(gd, gh * 0.5);
    g.add(side);
  }
  return g;
}

/** What the net needs to know about the ball: where it is, its size, and which goal (if any) it went into. */
export interface NetBall { x: number; y: number; z: number; r: number; inGoal: -1 | 0 | 1 }

/** How the net moves: a springy cloth that wobbles (High and Medium), or just a dent that follows the ball (Low). */
export type NetDetail = 'cloth' | 'dent';

/**
 * A proper goal net: rope strands over a back, a sloping roof and two sides, with a little sag and a
 * faint skin so it reads as a surface from a distance. The ball pushes into it and it wraps round the
 * ball; as a cloth it springs back and the wobble runs across the netting.
 *
 * Every point of the netting only moves in and out of its panel, by h. The lines and the skin share one
 * buffer of positions, so each net is two draw calls, and nothing is uploaded while the net is still.
 */
export class GoalNet {
  readonly group = new THREE.Group();
  private readonly shape: GoalShape;
  private readonly positions: Float32Array;
  private readonly attr: THREE.BufferAttribute;
  /** Per point: where it rests in the world, which way it bulges (world), and where it rests measured from the goal (d, y, z). */
  private readonly rest: Float32Array;
  private readonly normal: Float32Array;
  private readonly local: Float32Array;
  private readonly panelOf: Uint8Array;
  private readonly fixed: Uint8Array;
  /** Up to four neighbours a point is tied to (-1 for none). */
  private readonly nbr: Int32Array;
  private readonly h: Float32Array;
  private readonly vel: Float32Array;
  private readonly target: Float32Array;
  private awake = false;

  constructor(private readonly sx: 1 | -1, d: PitchDims, private readonly detail: NetDetail = 'cloth', cols = 16, private readonly calm = false) {
    const gw = d.goalWidth, gh = d.goalHeight, gd = d.goalDepth;
    this.shape = { halfLength: d.length / 2, width: gw, height: gh, depth: gd };
    const g = this.shape;
    const k = gh / (2 * gd), ks = Math.hypot(k, 1);
    const rows = Math.max(4, Math.round(cols * 0.4)), deep = Math.max(4, Math.round(cols * 0.4));
    // Each panel: its size in points, where a point (u, v from 0 to 1) rests, and its outward normal (d, y, z).
    const panels: { id: number; nu: number; nv: number; at: (u: number, v: number) => [number, number, number]; n: [number, number, number] }[] = [
      { id: PANELS.back, nu: cols, nv: rows, at: (u, v) => [gd + Math.sin(Math.PI * u) * Math.sin(Math.PI * v) * 0.05, gh * 0.5 * v, -gw / 2 + gw * u], n: [1, 0, 0] },
      { id: PANELS.roof, nu: cols, nv: deep, at: (u, v) => [gd * v, gh - gh * 0.5 * v - Math.sin(Math.PI * u) * Math.sin(Math.PI * v) * 0.04, -gw / 2 + gw * u], n: [k / ks, 1 / ks, 0] },
      { id: PANELS.left, nu: deep, nv: rows, at: (u, v) => [gd * u, v * roofHeight(g, gd * u), -gw / 2], n: [0, 0, -1] },
      { id: PANELS.right, nu: deep, nv: rows, at: (u, v) => [gd * u, v * roofHeight(g, gd * u), gw / 2], n: [0, 0, 1] },
    ];
    const count = panels.reduce((t, p) => t + (p.nu + 1) * (p.nv + 1), 0);
    this.positions = new Float32Array(count * 3);
    this.rest = new Float32Array(count * 3);
    this.normal = new Float32Array(count * 3);
    this.local = new Float32Array(count * 3);
    this.panelOf = new Uint8Array(count);
    this.fixed = new Uint8Array(count);
    this.nbr = new Int32Array(count * 4).fill(-1);
    this.h = new Float32Array(count);
    this.vel = new Float32Array(count);
    this.target = new Float32Array(count);
    const lines: number[] = [], tris: number[] = [];
    let base = 0;
    for (const p of panels) {
      const at = (i: number, j: number): number => base + j * (p.nu + 1) + i;
      for (let j = 0; j <= p.nv; j++) {
        for (let i = 0; i <= p.nu; i++) {
          const n = at(i, j);
          const [ld, ly, lz] = p.at(i / p.nu, j / p.nv);
          this.local.set([ld, ly, lz], n * 3);
          this.rest.set([sx * (g.halfLength + ld), ly, lz], n * 3);
          this.normal.set([sx * p.n[0], p.n[1], p.n[2]], n * 3);
          this.panelOf[n] = p.id;
          // The edges are tied to the frame and pegged to the ground.
          this.fixed[n] = i === 0 || j === 0 || i === p.nu || j === p.nv ? 1 : 0;
          const nb = [i > 0 ? at(i - 1, j) : -1, i < p.nu ? at(i + 1, j) : -1, j > 0 ? at(i, j - 1) : -1, j < p.nv ? at(i, j + 1) : -1];
          this.nbr.set(nb, n * 4);
          if (i < p.nu) lines.push(n, at(i + 1, j));
          if (j < p.nv) lines.push(n, at(i, j + 1));
          if (i < p.nu && j < p.nv) tris.push(n, at(i + 1, j), at(i + 1, j + 1), n, at(i + 1, j + 1), at(i, j + 1));
        }
      }
      base += (p.nu + 1) * (p.nv + 1);
    }
    this.positions.set(this.rest);
    this.attr = new THREE.BufferAttribute(this.positions, 3);
    this.attr.setUsage(THREE.DynamicDrawUsage);
    const lineGeo = new THREE.BufferGeometry();
    lineGeo.setAttribute('position', this.attr);
    lineGeo.setIndex(lines);
    const rope = new THREE.LineSegments(lineGeo, new THREE.LineBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.85 }));
    rope.frustumCulled = false;
    // A faint translucent skin so the net reads as a surface from a distance.
    const skinGeo = new THREE.BufferGeometry();
    skinGeo.setAttribute('position', this.attr);
    skinGeo.setIndex(tris);
    const skin = new THREE.Mesh(skinGeo, new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.1, side: THREE.DoubleSide, depthWrite: false }));
    skin.frustumCulled = false;
    this.group.add(rope, skin);
  }

  /** Back to rest, still (a replay starts from a still net). */
  reset(): void {
    this.h.fill(0);
    this.vel.fill(0);
    this.positions.set(this.rest);
    this.attr.needsUpdate = true;
    this.awake = false;
  }

  /** Move the net on by dt, with the ball where it is now (null when there is no ball to draw). */
  update(dt: number, ball: NetBall | null): void {
    if (dt <= 0) return;
    const touching = this.press(ball);
    if (!touching && !this.awake) return;
    const h = this.h, vel = this.vel, t = this.target, fixed = this.fixed;
    if (this.detail === 'dent') {
      // Low graphics: the dent follows the ball, then eases back.
      const ease = 1 - Math.exp(-8 * dt);
      for (let n = 0; n < h.length; n++) {
        if (fixed[n]) continue;
        h[n] = Math.abs(t[n]) > Math.abs(h[n]) ? t[n] : h[n] + (t[n] - h[n]) * ease;
      }
    } else {
      // A cloth: each point is pulled back to rest and towards its neighbours, so the bulge spreads and wobbles.
      const tie = 900, spring = 40, damp = this.calm ? 16 : 6;
      const steps = Math.ceil(dt / (1 / 120));
      const sdt = dt / steps;
      const nbr = this.nbr;
      for (let s = 0; s < steps; s++) {
        for (let n = 0; n < h.length; n++) {
          if (fixed[n]) continue;
          let pull = 0;
          for (let q = n * 4; q < n * 4 + 4; q++) { const m = nbr[q]; if (m >= 0) pull += h[m] - h[n]; }
          vel[n] += (tie * pull - spring * h[n] - damp * vel[n]) * sdt;
        }
        for (let n = 0; n < h.length; n++) {
          if (fixed[n]) continue;
          h[n] += vel[n] * sdt;
          // The ball is solid: the netting goes round it.
          const tn = t[n];
          if ((tn > 0 && h[n] < tn) || (tn < 0 && h[n] > tn)) { h[n] = tn; vel[n] = 0; }
        }
      }
    }
    let moving = touching;
    const p = this.positions, r = this.rest, nm = this.normal;
    for (let n = 0; n < h.length; n++) {
      const v = n * 3;
      p[v] = r[v] + nm[v] * h[n];
      p[v + 1] = r[v + 1] + nm[v + 1] * h[n];
      p[v + 2] = r[v + 2] + nm[v + 2] * h[n];
      if (Math.abs(h[n]) > 1e-4 || Math.abs(vel[n]) > 1e-3) moving = true;
    }
    this.attr.needsUpdate = true;
    if (!moving) this.reset();
    this.awake = moving;
  }

  /** Where the ball pushes the netting: how far each point must be out of the way. True if it touches. */
  private press(ball: NetBall | null): boolean {
    if (this.awake) this.target.fill(0);
    if (!ball) return false;
    const g = this.shape;
    const d = this.sx * ball.x - g.halfLength;
    if (d < -ball.r - 0.2) return false;
    const presses = netPresses(g, d, ball.y, ball.z, ball.r, ball.inGoal === this.sx);
    if (!presses.length) return false;
    const loc = this.local, nm = this.normal, t = this.target;
    for (const pr of presses) {
      const id = PANELS[pr.panel];
      // Pushing out of the goal bulges the panel outwards; from outside it dents inwards.
      const pushN: [number, number, number] = [this.sx * pr.nd, pr.ny, pr.nz];
      const reach = ball.r * 1.3 + pr.depth * 0.35 + 0.12;
      for (let n = 0; n < t.length; n++) {
        if (this.panelOf[n] !== id) continue;
        const v = n * 3;
        const dir = nm[v] * pushN[0] + nm[v + 1] * pushN[1] + nm[v + 2] * pushN[2];
        // How far the point is from the ball, across the panel.
        const ed = loc[v] - d, ey = loc[v + 1] - ball.y, ez = loc[v + 2] - ball.z;
        const along = ed * pr.nd + ey * pr.ny + ez * pr.nz;
        const across2 = ed * ed + ey * ey + ez * ez - along * along;
        if (across2 >= reach * reach) continue;
        const f = 1 - across2 / (reach * reach);
        const want = pr.depth * f * f * Math.sign(dir);
        if (Math.abs(want) > Math.abs(t[n])) t[n] = want;
      }
    }
    return true;
  }
}

const PANELS: Record<NetPanel, number> = { back: 0, roof: 1, left: 2, right: 3 };

/** A big scoreboard on two legs behind one goal, drawn on a canvas so it can show the live score. */
export class Scoreboard {
  readonly group = new THREE.Group();
  private readonly canvas = document.createElement('canvas');
  private readonly tex: THREE.CanvasTexture;

  constructor() {
    this.canvas.width = 512; this.canvas.height = 224;
    this.tex = new THREE.CanvasTexture(this.canvas);
    this.tex.colorSpace = THREE.SRGBColorSpace;
    const board = new THREE.Mesh(new THREE.BoxGeometry(6, 2.6, 0.25), [
      toonMaterial({ color: 0x1b2a41 }), toonMaterial({ color: 0x1b2a41 }), toonMaterial({ color: 0x1b2a41 }), toonMaterial({ color: 0x1b2a41 }),
      new THREE.MeshBasicMaterial({ map: this.tex }), toonMaterial({ color: 0x1b2a41 }),
    ]);
    board.position.y = 4.0;
    board.castShadow = true;
    addOutline(board, 0.03);
    const legMat = toonMaterial({ color: 0x1b2a41 });
    for (const sx of [-1, 1]) {
      const leg = new THREE.Mesh(new THREE.CylinderGeometry(0.08, 0.1, 2.8, 8), legMat);
      leg.position.set(sx * 2.4, 1.4, 0);
      this.group.add(leg);
    }
    const star = new THREE.Mesh(new THREE.CircleGeometry(0.35, 5), new THREE.MeshBasicMaterial({ color: 0xffd23f }));
    star.position.set(0, 5.65, 0.05);
    this.group.add(board, star);
    this.set('HOME', 'AWAY', 0, 0);
  }

  set(home: string, away: string, h: number, a: number): void {
    const c = this.canvas.getContext('2d')!;
    c.fillStyle = '#0f1b30';
    c.fillRect(0, 0, 512, 224);
    c.fillStyle = '#1b2a41';
    c.fillRect(12, 12, 488, 200);
    c.textAlign = 'center';
    c.textBaseline = 'middle';
    c.fillStyle = '#ffffff';
    c.font = 'bold 54px system-ui, sans-serif';
    c.fillText(home.slice(0, 3).toUpperCase(), 100, 70);
    c.fillText(away.slice(0, 3).toUpperCase(), 412, 70);
    c.fillStyle = '#ffd23f';
    c.font = 'bold 120px system-ui, sans-serif';
    c.fillText(String(h), 100, 158);
    c.fillText(String(a), 412, 158);
    c.fillStyle = '#8d99ae';
    c.font = 'bold 48px system-ui, sans-serif';
    c.fillText('-', 256, 150);
    c.fillStyle = '#3da5f4';
    c.font = 'bold 26px system-ui, sans-serif';
    c.fillText('FIVE-A-SIDE STARS', 256, 46);
    this.tex.needsUpdate = true;
  }
}

/** A floodlight tower: a tall pole with a bank of six lamps. Weather turns the lamps on at night. */
function buildFloodlight(x: number, y: number, z: number): THREE.Group {
  const g = new THREE.Group();
  const poleMat = toonMaterial({ color: 0x9aa7b8 });
  const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.1, 0.16, y, 8), poleMat);
  pole.position.y = y / 2;
  pole.castShadow = true;
  const head = new THREE.Mesh(new THREE.BoxGeometry(1.7, 0.9, 0.3), toonMaterial({ color: 0x1b2a41 }));
  head.position.y = y;
  const lampMat = new THREE.MeshStandardMaterial({ color: 0xf6f8ff, emissive: 0xffffff, emissiveIntensity: 0, roughness: 0.3 });
  for (let i = 0; i < 6; i++) {
    const lamp = new THREE.Mesh(new THREE.CircleGeometry(0.17, 10), lampMat);
    lamp.position.set(-0.6 + (i % 3) * 0.6, y + (i < 3 ? 0.2 : -0.2), 0.16);
    lamp.userData.lamp = true;
    head.add(lamp);
  }
  g.add(pole, head);
  g.position.set(x, 0, z);
  g.lookAt(0, 0, 0);
  return g;
}
