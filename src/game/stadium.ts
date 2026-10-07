import * as THREE from 'three';
import { addOutline, toonMaterial } from './toon';
import { shared } from './renderer';
import { batchStatic } from './batchStatic';
import type { BoardFace, BoardTeam } from './adBoards';
import { inkFor } from './adBoards';
import type { Ground, TreeKind } from './grounds';

/**
 * The stadium round the pitch: the main stand and the small end stand, the ball-stop netting and the fan
 * banners, the people by the pitch, the snack kiosk, the dugouts and each ground's own touches. The
 * pitch itself (grass, lines, boards and goals) is in Pitch.ts, and the fans in Crowd.ts.
 *
 * Almost everything here is still, so on Low and Medium batchStatic merges it into a few meshes. The
 * few things that move (camera flashes, the kiosk queue, waving flags) are listed in StadiumLife.
 */

export interface StandLayout { len: number; z0: number; rows: number; rowDepth: number; rowRise: number; baseHeight: number; roofY: number }

/** Where the stand's seat rows are; the crowd (Crowd.ts) sits its fans on these. Row r tops out at baseHeight + r * rowRise, at z0 - r * rowDepth. The roof's underside is at roofY. */
export function standLayout(L: number, W: number): StandLayout {
  return { len: L * 0.8, z0: -W / 2 - 3.2, rows: 3, rowDepth: 1.2, rowRise: 0.6, baseHeight: 0.6, roofY: 3.14 };
}

/** Space between seats along a row. */
export const SEAT_SPACING = 0.55;

/** The two aisles that split the main stand into three blocks. */
export function standAisles(lay: StandLayout): number[] {
  return [-lay.len / 6, lay.len / 6];
}

/** Where the seats along each row of the main stand are (the aisles have none). */
export function seatSpots(lay: StandLayout): number[] {
  const out: number[] = [];
  const perRow = Math.floor(lay.len / SEAT_SPACING);
  const aisles = standAisles(lay);
  for (let i = 0; i < perRow; i++) {
    const x = -lay.len / 2 + SEAT_SPACING * (i + 0.5);
    if (aisles.every((a) => Math.abs(x - a) > SEAT_SPACING * 0.8)) out.push(x);
  }
  return out;
}

/**
 * The small stand behind the goal at +x (Medium and High graphics): two rows facing down the pitch.
 * Rows run along z; row r is at x0 + r * rowDepth and tops out at baseHeight + r * rowRise.
 */
export interface EndStandLayout { x0: number; len: number; rows: number; rowDepth: number; rowRise: number; baseHeight: number; roofY: number }
export function endStandLayout(L: number, W: number, runoffEnd: number): EndStandLayout {
  return { x0: L / 2 + runoffEnd + 2.75, len: Math.min(W * 0.7, 14), rows: 2, rowDepth: 1.1, rowRise: 0.5, baseHeight: 0.5, roofY: 2.62 };
}

/** Where the seats along each row of the end stand are, along z. */
export function endSeatSpots(lay: EndStandLayout): number[] {
  const out: number[] = [];
  const n = Math.floor(lay.len / SEAT_SPACING);
  for (let i = 0; i < n; i++) out.push(-lay.len / 2 + SEAT_SPACING * (i + 0.5));
  return out;
}

const KIT_PALETTE = ['#e63946', '#3da5f4', '#ffd23f', '#2eb872', '#ff6fb5', '#ff7a00', '#6a4c93', '#ffffff', '#1b2a41'];

/** The face that faces `normal`, as seen from in front of it: which way is "right". */
function rightOf(normal: THREE.Vector3): THREE.Vector3 {
  return new THREE.Vector3().crossVectors(normal.clone().negate(), new THREE.Vector3(0, 1, 0)).normalize();
}

/** An LED face for the ad boards (see AdBoards): centred at (x, y, z), facing `normal`. */
export function ledFace(x: number, y: number, z: number, normal: THREE.Vector3, length: number, height: number): BoardFace {
  return { centre: new THREE.Vector3(x, y, z), normal: normal.clone(), right: rightOf(normal), length, height };
}

/** A row of bunting flags hung from (a) to (b), sagging in the middle. One draw call. */
function bunting(a: THREE.Vector3, b: THREE.Vector3, sag: number): THREE.InstancedMesh {
  const len = a.distanceTo(b);
  const n = Math.max(2, Math.floor(len / 0.5));
  const tri = new THREE.Shape();
  tri.moveTo(-0.18, 0); tri.lineTo(0.18, 0); tri.lineTo(0, -0.32); tri.closePath();
  const mesh = new THREE.InstancedMesh(new THREE.ShapeGeometry(tri), new THREE.MeshBasicMaterial({ side: THREE.DoubleSide }), n);
  const m = new THREE.Matrix4(), c = new THREE.Color(), p = new THREE.Vector3();
  const yaw = Math.atan2(-(b.z - a.z), b.x - a.x);
  for (let i = 0; i < n; i++) {
    const t = (i + 0.5) / n;
    p.lerpVectors(a, b, t);
    p.y -= Math.sin(Math.PI * t) * sag;
    m.makeRotationY(yaw).setPosition(p);
    mesh.setMatrixAt(i, m);
    mesh.setColorAt(i, c.set(KIT_PALETTE[i % KIT_PALETTE.length]));
  }
  return mesh;
}

// ---------- banners ----------

/** Rows of the banner picture: four long banners, then the two teams' big flags side by side. */
const BANNER_ROWS = 4;
const BANNER_H = 1 / 6;

/** Fans' banners and the teams' big flags, painted once per match. */
function bannerTexture(teams: [BoardTeam, BoardTeam]): THREE.CanvasTexture {
  const c = document.createElement('canvas');
  c.width = 1024; c.height = 1024;
  const ctx = c.getContext('2d')!;
  const [home, away] = teams;
  const rowH = 1024 * BANNER_H;
  const font = (px: number) => `600 ${Math.round(px)}px Fredoka, "Trebuchet MS", system-ui, sans-serif`;
  const write = (text: string, x: number, y: number, size: number, maxW: number, fill: string) => {
    ctx.font = font(size);
    const w = ctx.measureText(text).width;
    if (w > maxW) ctx.font = font(size * maxW / w);
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.fillStyle = fill;
    ctx.fillText(text, x, y);
  };
  const cloth = (y: number, bg: string, edge: string) => {
    ctx.fillStyle = bg; ctx.fillRect(0, y, 1024, rowH);
    ctx.fillStyle = edge; ctx.fillRect(0, y, 1024, rowH * 0.1); ctx.fillRect(0, y + rowH * 0.9, 1024, rowH * 0.1);
  };
  cloth(0, home.shirt, home.shirt2);
  write(`GO ${home.name.toUpperCase()}!`, 512, rowH * 0.52, rowH * 0.55, 940, inkFor(home.shirt));
  cloth(rowH, away.shirt, away.shirt2);
  write(`${away.name.toUpperCase()} ★`, 512, rowH * 1.52, rowH * 0.55, 940, inkFor(away.shirt));
  cloth(rowH * 2, '#ffffff', '#e63946');
  write('WE LOVE FOOTBALL', 512, rowH * 2.52, rowH * 0.5, 940, '#e63946');
  cloth(rowH * 3, '#1b2a41', '#ffd23f');
  write('GOAL RUSH!', 512, rowH * 3.52, rowH * 0.6, 940, '#ffd23f');
  // The two big flags, each a 512 x 340 cell: the shirt colour with a band of the second colour and a star.
  for (const [k, t] of [[0, home], [1, away]] as const) {
    const x = k * 512, y = rowH * 4;
    ctx.fillStyle = t.shirt; ctx.fillRect(x, y, 512, 1024 - y);
    ctx.fillStyle = t.shirt2; ctx.fillRect(x, y + (1024 - y) * 0.38, 512, (1024 - y) * 0.24);
    write('★', x + 256, y + (1024 - y) * 0.5, 150, 300, inkFor(t.shirt2));
  }
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 4;
  return tex;
}

/** A plane showing one row of the banner picture (or one of the two flags: row 4 + team). */
function bannerPlane(mat: THREE.Material, row: number, w: number, h: number): THREE.Mesh {
  const geo = new THREE.PlaneGeometry(w, h);
  const uv = geo.attributes.uv as THREE.BufferAttribute;
  // Canvas rows count from the top, uv from the bottom.
  const flag = row >= BANNER_ROWS;
  const u0 = flag ? (row - BANNER_ROWS) * 0.5 : 0, u1 = flag ? u0 + 0.5 : 1;
  const v1 = flag ? 1 - BANNER_ROWS * BANNER_H : 1 - row * BANNER_H, v0 = flag ? 0 : v1 - BANNER_H;
  for (let i = 0; i < uv.count; i++) uv.setXY(i, uv.getX(i) < 0.5 ? u0 : u1, uv.getY(i) < 0.5 ? v0 : v1);
  return new THREE.Mesh(geo, mat);
}

// ---------- the main stand ----------

export interface StandOptions { L: number; W: number; ground: Ground; teams: [BoardTeam, BoardTeam]; leds: BoardFace[]; bannerMat: THREE.Material }

/** Three stepped rows of coloured seats in three blocks, a front wall in the teams' colours with banners, a roof with an LED strip, a back wall and a big flag for each team. */
export function buildStand(o: StandOptions): THREE.Group {
  const g = new THREE.Group();
  const lay = standLayout(o.L, o.W);
  const { len, z0, rows, rowDepth, rowRise, baseHeight, roofY } = lay;
  const stepMat = toonMaterial({ color: o.ground.steps });
  for (let r = 0; r < rows; r++) {
    const h = baseHeight + r * rowRise;
    const step = new THREE.Mesh(new THREE.BoxGeometry(len, h, rowDepth), stepMat);
    step.position.set(0, h / 2, z0 - r * rowDepth);
    step.receiveShadow = true;
    step.castShadow = true;
    g.add(step);
  }
  // Aisles: a half step on the back of each row, with yellow edges, so the stand reads as three blocks.
  const stairMat = toonMaterial({ color: new THREE.Color(o.ground.steps).lerp(new THREE.Color('#ffffff'), 0.35) });
  const edgeMat = toonMaterial({ color: 0xffd23f });
  for (const ax of standAisles(lay)) {
    for (let r = 0; r < rows; r++) {
      const top = baseHeight + r * rowRise;
      const edge = new THREE.Mesh(new THREE.BoxGeometry(0.7, 0.03, 0.08), edgeMat);
      edge.position.set(ax, top + 0.015, z0 - r * rowDepth + rowDepth / 2 - 0.04);
      g.add(edge);
      if (r < rows - 1) {
        const half = new THREE.Mesh(new THREE.BoxGeometry(0.7, rowRise / 2, rowDepth / 2), stairMat);
        half.position.set(ax, top + rowRise / 4, z0 - r * rowDepth - rowDepth / 4);
        g.add(half);
      }
    }
  }
  // Seats: one little seat at every place along the rows, in the ground's two colours.
  const spots = seatSpots(lay);
  const seatGeo = seatGeometry();
  const seats = new THREE.InstancedMesh(seatGeo, toonMaterial({ color: 0xffffff }), spots.length * rows);
  const m = new THREE.Matrix4(), c = new THREE.Color();
  let k = 0;
  for (let r = 0; r < rows; r++) {
    for (const x of spots) {
      m.makeTranslation(x, baseHeight + r * rowRise, z0 - r * rowDepth);
      seats.setMatrixAt(k, m);
      const block = x < standAisles(lay)[0] ? 0 : x > standAisles(lay)[1] ? 2 : 1;
      seats.setColorAt(k, c.set(o.ground.seats[(block + r) % 2]));
      k++;
    }
  }
  seats.receiveShadow = true;
  g.add(seats);
  // The front wall: home colours at the home end, away colours at the away end, the ground's colour in the middle.
  const front = z0 + rowDepth / 2 + 0.03;
  const wallParts: [number, number, string][] = [
    [-len / 2, standAisles(lay)[0], o.teams[0].shirt],
    [standAisles(lay)[0], standAisles(lay)[1], o.ground.wall],
    [standAisles(lay)[1], len / 2, o.teams[1].shirt],
  ];
  for (const [a, b, col] of wallParts) {
    const wall = new THREE.Mesh(new THREE.BoxGeometry(b - a, baseHeight, 0.06), toonMaterial({ color: col }));
    wall.position.set((a + b) / 2, baseHeight / 2, front);
    g.add(wall);
  }
  // A rail along the front, with banners hung over it.
  const railMat = toonMaterial({ color: 0xdfe6ef });
  const rail = new THREE.Mesh(new THREE.CylinderGeometry(0.03, 0.03, len, 6), railMat);
  rail.rotation.z = Math.PI / 2;
  rail.position.set(0, baseHeight + 0.42, front - 0.02);
  g.add(rail);
  for (let x = -len / 2 + 0.1; x <= len / 2; x += len / 8) {
    const post = new THREE.Mesh(new THREE.CylinderGeometry(0.025, 0.025, 0.42, 5), railMat);
    post.position.set(x, baseHeight + 0.21, front - 0.02);
    g.add(post);
  }
  const bannerAt: [number, number][] = [[-len * 0.36, 0], [-len * 0.12, 2], [len * 0.12, 3], [len * 0.36, 1]];
  for (const [x, row] of bannerAt) {
    const b = bannerPlane(o.bannerMat, row, Math.min(3.2, len * 0.17), 0.52);
    b.position.set(x, baseHeight + 0.18, front + 0.02);
    g.add(b);
  }
  // Roof on two posts with a deeper fascia carrying an LED strip, a back wall, and bunting along the front edge.
  const roofDepth = rows * rowDepth + 0.8;
  const roofZ = z0 - (rows - 1) * rowDepth / 2;
  const roof = new THREE.Mesh(new THREE.BoxGeometry(len + 0.6, 0.12, roofDepth), toonMaterial({ color: o.ground.roof }));
  roof.position.set(0, roofY + 0.06, roofZ);
  roof.castShadow = true;
  g.add(roof);
  const roofFront = roofZ + roofDepth / 2;
  const fascia = new THREE.Mesh(new THREE.BoxGeometry(len + 0.6, 0.44, 0.12), toonMaterial({ color: 0x1b2a41 }));
  fascia.position.set(0, roofY + 0.2, roofFront - 0.06);
  g.add(fascia);
  o.leds.push(ledFace(0, roofY + 0.2, roofFront + 0.005, new THREE.Vector3(0, 0, 1), len + 0.5, 0.3));
  const back = new THREE.Mesh(new THREE.BoxGeometry(len + 0.4, roofY, 0.12), toonMaterial({ color: o.ground.wall }));
  back.position.set(0, roofY / 2, z0 - (rows - 1) * rowDepth - rowDepth / 2 - 0.06);
  back.receiveShadow = true;
  g.add(back);
  const postMat = toonMaterial({ color: 0x1b2a41 });
  for (const sx of [-1, 1]) {
    const post = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.06, roofY, 6), postMat);
    post.position.set(sx * (len / 2 + 0.2), roofY / 2, z0 - rows * rowDepth + 0.4);
    g.add(post);
  }
  g.add(bunting(new THREE.Vector3(-len / 2, 3.1, roofFront - 0.08), new THREE.Vector3(len / 2, 3.1, roofFront - 0.08), 0));
  // A big flag on a pole at each end of the stand: home at the home end, away at the away end.
  for (const [side, sx] of [[0, -1], [1, 1]] as const) {
    const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.04, 0.05, 4.4, 6), postMat);
    pole.position.set(sx * (len / 2 + 0.7), 2.2, z0 + 0.4);
    // The flag flies from the pole towards the middle of the stand.
    const flag = bannerPlane(o.bannerMat, BANNER_ROWS + side, 1.5, 1.0);
    flag.position.set(sx * (len / 2 + 0.7) - sx * 0.77, 3.85, z0 + 0.4);
    g.add(pole, flag);
  }
  return g;
}

/** A plastic seat: pan and backrest, built round the seat's front-middle on the step. */
function seatGeometry(): THREE.BufferGeometry {
  const pan = new THREE.BoxGeometry(0.42, 0.05, 0.34).translate(0, 0.045, -0.04);
  const back = new THREE.BoxGeometry(0.42, 0.3, 0.05).translate(0, 0.2, -0.27);
  const g = new THREE.BufferGeometry();
  const parts = [pan, back];
  const pos: number[] = [], nor: number[] = [], idx: number[] = [];
  let base = 0;
  for (const p of parts) {
    pos.push(...p.attributes.position.array);
    nor.push(...p.attributes.normal.array);
    for (const i of p.index!.array) idx.push(i + base);
    base += p.attributes.position.count;
    p.dispose();
  }
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('normal', new THREE.Float32BufferAttribute(nor, 3));
  g.setIndex(idx);
  return g;
}

/** The small end stand behind the +x goal: two rows of seats under a roof with its own LED strip. */
export function buildEndStand(o: StandOptions & { runoffEnd: number }): THREE.Group {
  const g = new THREE.Group();
  const lay = endStandLayout(o.L, o.W, o.runoffEnd);
  const { x0, len, rows, rowDepth, rowRise, baseHeight, roofY } = lay;
  const stepMat = toonMaterial({ color: o.ground.steps });
  for (let r = 0; r < rows; r++) {
    const h = baseHeight + r * rowRise;
    const step = new THREE.Mesh(new THREE.BoxGeometry(rowDepth, h, len), stepMat);
    step.position.set(x0 + r * rowDepth, h / 2, 0);
    step.receiveShadow = true;
    g.add(step);
  }
  const spots = endSeatSpots(lay);
  const seats = new THREE.InstancedMesh(seatGeometry(), toonMaterial({ color: 0xffffff }), spots.length * rows);
  const m = new THREE.Matrix4(), q = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), -Math.PI / 2), c = new THREE.Color();
  let k = 0;
  for (let r = 0; r < rows; r++) {
    for (const z of spots) {
      m.compose(new THREE.Vector3(x0 + r * rowDepth, baseHeight + r * rowRise, z), q, new THREE.Vector3(1, 1, 1));
      seats.setMatrixAt(k, m);
      seats.setColorAt(k++, c.set(o.ground.seats[r % 2]));
    }
  }
  g.add(seats);
  const wall = new THREE.Mesh(new THREE.BoxGeometry(0.06, baseHeight, len), toonMaterial({ color: o.ground.wall }));
  wall.position.set(x0 - rowDepth / 2 - 0.03, baseHeight / 2, 0);
  g.add(wall);
  const b = bannerPlane(o.bannerMat, 2, Math.min(3, len * 0.4), 0.4);
  b.rotation.y = -Math.PI / 2;
  b.position.set(x0 - rowDepth / 2 - 0.07, baseHeight / 2, 0);
  g.add(b);
  const roofDepth = rows * rowDepth + 0.7;
  const roofX = x0 + (rows - 1) * rowDepth / 2;
  const roof = new THREE.Mesh(new THREE.BoxGeometry(roofDepth, 0.1, len + 0.4), toonMaterial({ color: o.ground.roof }));
  roof.position.set(roofX, roofY + 0.05, 0);
  roof.castShadow = true;
  g.add(roof);
  const roofFront = roofX - roofDepth / 2;
  const fascia = new THREE.Mesh(new THREE.BoxGeometry(0.1, 0.36, len + 0.4), toonMaterial({ color: 0x1b2a41 }));
  fascia.position.set(roofFront + 0.05, roofY + 0.16, 0);
  g.add(fascia);
  o.leds.push(ledFace(roofFront - 0.005, roofY + 0.16, 0, new THREE.Vector3(-1, 0, 0), len + 0.3, 0.24));
  const back = new THREE.Mesh(new THREE.BoxGeometry(0.12, roofY, len + 0.2), toonMaterial({ color: o.ground.wall }));
  back.position.set(x0 + (rows - 1) * rowDepth + rowDepth / 2 + 0.06, roofY / 2, 0);
  g.add(back);
  return g;
}

// ---------- behind the goals ----------

let netTex: THREE.CanvasTexture | null = null;
/** A square of netting, tiled along the ball-stop nets. Painted once and kept. */
function nettingTexture(): THREE.CanvasTexture {
  if (netTex) return netTex;
  const c = document.createElement('canvas');
  c.width = 64; c.height = 64;
  const ctx = c.getContext('2d')!;
  ctx.strokeStyle = 'rgba(235,240,245,0.9)';
  ctx.lineWidth = 3;
  ctx.strokeRect(1.5, 1.5, 61, 61);
  netTex = shared(new THREE.CanvasTexture(c));
  netTex.wrapS = netTex.wrapT = THREE.RepeatWrapping;
  netTex.anisotropy = 4;
  return netTex;
}

/** Tall see-through netting on poles behind each goal, with a fans' banner on each. */
export function buildBallStopNetting(L: number, bl: number, bw: number, goalDepth: number, bannerMat: THREE.Material): THREE.Group {
  const g = new THREE.Group();
  const h = 4.2, span = bw + 0.6;
  const x = Math.max(bl / 2, L / 2 + goalDepth) + 0.7;
  const tex = nettingTexture();
  const mat = new THREE.MeshBasicMaterial({ map: tex, transparent: true, opacity: 0.55, depthWrite: false, side: THREE.DoubleSide });
  const poleMat = toonMaterial({ color: 0x2b3a4a });
  for (const sx of [-1, 1]) {
    const geo = new THREE.PlaneGeometry(span, h);
    const uv = geo.attributes.uv as THREE.BufferAttribute;
    for (let i = 0; i < uv.count; i++) uv.setXY(i, uv.getX(i) * span / 0.35, uv.getY(i) * h / 0.35);
    const net = new THREE.Mesh(geo, mat);
    net.rotation.y = Math.PI / 2;
    net.position.set(sx * x, h / 2, 0);
    net.renderOrder = 1;
    g.add(net);
    const posts = Math.max(3, Math.round(span / 4) + 1);
    for (let i = 0; i < posts; i++) {
      const post = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.06, h + 0.2, 6), poleMat);
      post.position.set(sx * x, (h + 0.2) / 2, -span / 2 + (span * i) / (posts - 1));
      g.add(post);
    }
    const top = new THREE.Mesh(new THREE.CylinderGeometry(0.025, 0.025, span, 5), poleMat);
    top.rotation.x = Math.PI / 2;
    top.position.set(sx * x, h, 0);
    g.add(top);
    // A banner each end, on the pitch side of the netting, off to one side of the goal.
    const banner = bannerPlane(bannerMat, sx < 0 ? 0 : 1, 3.2, 0.55);
    banner.rotation.y = sx < 0 ? Math.PI / 2 : -Math.PI / 2;
    banner.position.set(sx * (x - 0.04), 1.6, (sx < 0 ? -1 : 1) * span * 0.28);
    g.add(banner);
  }
  return g;
}

/** The banner material shared by the stand, the netting and the flags. */
export function bannerMaterial(teams: [BoardTeam, BoardTeam]): THREE.MeshBasicMaterial {
  return new THREE.MeshBasicMaterial({ map: bannerTexture(teams), side: THREE.DoubleSide });
}

// ---------- trees ----------

/** A friendly tree of the ground's kind: round, a coconut palm or a pine. */
export function buildTree(kind: TreeKind, i: number, leafMats: THREE.Material[], trunkMat: THREE.Material): THREE.Group {
  const tree = new THREE.Group();
  const size = 1.1 + (i % 3) * 0.3;
  if (kind === 'palm') {
    const h = 3.2 + (i % 3) * 0.6;
    const lean = ((i % 5) - 2) * 0.06;
    const trunk = new THREE.Mesh(new THREE.CylinderGeometry(0.11, 0.18, h, 7), trunkMat);
    trunk.position.y = h / 2;
    trunk.rotation.z = lean;
    addOutline(trunk, 0.03);
    tree.add(trunk);
    const topX = -Math.sin(lean) * h, topY = Math.cos(lean) * h;
    for (let k = 0; k < 7; k++) {
      const leaf = new THREE.Mesh(new THREE.ConeGeometry(0.28, 1.9, 4), leafMats[k % 3]);
      leaf.geometry.translate(0, 0.95, 0);
      leaf.position.set(topX, topY, 0);
      leaf.rotation.set(0, (k / 7) * Math.PI * 2, 1.25 + (k % 2) * 0.25, 'YXZ');
      leaf.scale.set(1, 1, 0.35);
      leaf.castShadow = true;
      leaf.userData.leaves = true;
      tree.add(leaf);
    }
    const nuts = new THREE.Mesh(new THREE.SphereGeometry(0.22, 7, 5), trunkMat);
    nuts.position.set(topX, topY - 0.15, 0);
    tree.add(nuts);
    return tree;
  }
  if (kind === 'pine') {
    const trunk = new THREE.Mesh(new THREE.CylinderGeometry(0.14, 0.2, 0.9, 7), trunkMat);
    trunk.position.y = 0.45;
    addOutline(trunk, 0.03);
    tree.add(trunk);
    for (let k = 0; k < 3; k++) {
      const r = size * (1.1 - k * 0.28), hh = size * 1.3;
      const cone = new THREE.Mesh(new THREE.ConeGeometry(r, hh, 9), leafMats[(i + k) % 3]);
      cone.position.y = 0.8 + hh / 2 + k * size * 0.65;
      cone.castShadow = true;
      cone.userData.leaves = true;
      addOutline(cone, 0.04);
      tree.add(cone);
    }
    return tree;
  }
  const trunk = new THREE.Mesh(new THREE.CylinderGeometry(0.16, 0.22, 1.0, 7), trunkMat);
  trunk.position.y = 0.5;
  addOutline(trunk, 0.03);
  const top = new THREE.Mesh(new THREE.SphereGeometry(size, 10, 8), leafMats[i % 3]);
  top.position.y = 1.0 + size * 0.9;
  top.castShadow = true;
  top.userData.leaves = true;
  addOutline(top, 0.05);
  const top2 = new THREE.Mesh(new THREE.SphereGeometry(size * 0.7, 9, 7), leafMats[(i + 1) % 3]);
  top2.position.set(size * 0.5, 1.0 + size * 1.3, size * 0.3);
  top2.userData.leaves = true;
  addOutline(top2, 0.04);
  tree.add(trunk, top, top2);
  return tree;
}

// ---------- people by the pitch ----------

/** Stand-in people by the pitch: a simple body, head and hair, sharing a few materials. */
interface PersonMats { skin: THREE.Material; hair: THREE.Material; dark: THREE.Material; eye: THREE.Material }

function person(mats: PersonMats, shirt: THREE.Material, kneel: boolean): THREE.Group {
  const g = new THREE.Group();
  const legs = new THREE.Mesh(new THREE.BoxGeometry(0.26, kneel ? 0.22 : 0.42, kneel ? 0.4 : 0.16), mats.dark);
  legs.position.set(0, kneel ? 0.11 : 0.21, kneel ? -0.1 : 0);
  const body = new THREE.Mesh(new THREE.CapsuleGeometry(0.17, 0.2, 2, 8), shirt);
  body.position.y = kneel ? 0.48 : 0.68;
  const head = new THREE.Mesh(new THREE.SphereGeometry(0.19, 10, 8), mats.skin);
  head.position.y = kneel ? 0.85 : 1.05;
  const hair = new THREE.Mesh(new THREE.SphereGeometry(0.2, 10, 6, 0, Math.PI * 2, 0, Math.PI * 0.55), mats.hair);
  hair.position.copy(head.position);
  hair.rotation.x = -0.35;
  g.add(legs, body, head, hair);
  for (const sx of [-1, 1]) {
    const eye = new THREE.Mesh(new THREE.SphereGeometry(0.025, 5, 4), mats.eye);
    eye.position.set(sx * 0.065, head.position.y + 0.02, 0.175);
    g.add(eye);
  }
  return g;
}

let dotTex: THREE.CanvasTexture | null = null;
function flashDot(): THREE.CanvasTexture {
  if (dotTex) return dotTex;
  const c = document.createElement('canvas');
  c.width = c.height = 64;
  const ctx = c.getContext('2d')!;
  const grad = ctx.createRadialGradient(32, 32, 0, 32, 32, 32);
  grad.addColorStop(0, 'rgba(255,255,255,1)');
  grad.addColorStop(0.3, 'rgba(255,255,255,0.6)');
  grad.addColorStop(1, 'rgba(255,255,255,0)');
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, 64, 64);
  dotTex = shared(new THREE.CanvasTexture(c));
  return dotTex;
}

/**
 * What moves in the stadium: photographers' flashes and the kiosk queue cheering after a goal, and the
 * corner flags and the big flags waving. All of it cheap: a few sprites and group positions.
 */
export class StadiumLife {
  readonly flashes: THREE.Sprite[] = [];
  readonly hoppers: THREE.Object3D[] = [];
  readonly wavers: { o: THREE.Object3D; base: number; phase: number }[] = [];
  private t = 0;
  private party = 0;
  private flashT: number[] = [];

  constructor(private readonly calm: boolean) {}

  /** A goal: flashes go off and the snack queue jumps for joy. */
  goal(): void {
    this.party = 3;
    this.flashT = this.flashes.map(() => Math.random() * 0.6);
  }

  update(dt: number): void {
    this.t += dt;
    this.party = Math.max(0, this.party - dt);
    for (let i = 0; i < this.flashes.length; i++) {
      const s = this.flashes[i];
      // A few quick flashes from each camera while the goal is fresh.
      let on = false;
      if (this.party > 0) {
        const k = (this.t + (this.flashT[i] ?? 0) * 7) % 0.55;
        on = !this.calm && k < 0.07;
      }
      s.visible = on;
    }
    for (const [i, h] of this.hoppers.entries()) h.position.y = this.party > 0 && !this.calm ? Math.max(0, Math.sin(this.t * 11 + i * 1.3)) * 0.18 : 0;
    if (!this.calm) for (const w of this.wavers) w.o.rotation.y = w.base + Math.sin(this.t * 2.2 + w.phase) * 0.22 + Math.sin(this.t * 5.1 + w.phase) * 0.05;
  }
}

/** Two photographers crouched behind each goal line, and a ball kid at each corner. */
export function buildPitchside(L: number, d: { goalWidth: number; runoffEnd: number; bl: number; bw: number }, life: StadiumLife): THREE.Group {
  const g = new THREE.Group();
  const mats: PersonMats = {
    skin: toonMaterial({ color: 0xd49a6a }),
    hair: toonMaterial({ color: 0x2b1b10 }),
    dark: toonMaterial({ color: 0x2f3a4a }),
    eye: new THREE.MeshBasicMaterial({ color: 0x1b1b1b }),
  };
  const skins = [0xf6d7c3, 0xd49a6a, 0xa86b3c, 0xeab98f].map((c) => toonMaterial({ color: c }));
  const press = toonMaterial({ color: 0x3a4f6b });
  const bib = toonMaterial({ color: 0xffd23f });
  const camMat = toonMaterial({ color: 0x1b1b1b });
  const lensMat = toonMaterial({ color: 0x4a5a6a });
  const ballMat = toonMaterial({ color: 0xffffff });
  const behind = Math.min(d.runoffEnd * 0.6, 0.95);
  let n = 0;
  for (const sx of [-1, 1]) {
    for (const sz of [-1, 1]) {
      const p = person({ ...mats, skin: skins[n % skins.length] }, press, true);
      // Facing the pitch, off to the side of the goal.
      p.position.set(sx * (L / 2 + behind), 0, sz * (d.goalWidth / 2 + 1.1 + (n % 2) * 0.5));
      p.rotation.y = sx > 0 ? -Math.PI / 2 : Math.PI / 2;
      const cam = new THREE.Mesh(new THREE.BoxGeometry(0.2, 0.16, 0.14), camMat);
      cam.position.set(0, 0.86, 0.24);
      const lens = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.07, 0.34, 8), lensMat);
      lens.rotation.x = Math.PI / 2;
      lens.position.set(0, 0.86, 0.46);
      p.add(cam, lens);
      const flash = new THREE.Sprite(new THREE.SpriteMaterial({ map: flashDot(), color: 0xffffff, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending }));
      flash.scale.set(0.9, 0.9, 1);
      flash.position.set(0, 0.95, 0.4);
      flash.visible = false;
      p.add(flash);
      life.flashes.push(flash);
      g.add(p);
      n++;
    }
  }
  // Ball kids in yellow bibs at the corners, just behind the boards, each with a spare ball.
  for (const sx of [-1, 1]) {
    for (const sz of [-1, 1]) {
      const kid = person({ ...mats, skin: skins[(n++) % skins.length] }, bib, false);
      kid.scale.setScalar(0.85);
      kid.position.set(sx * (d.bl / 2 + 0.55), 0, sz * (d.bw / 2 + 0.55));
      kid.lookAt(0, 0, 0);
      const b = new THREE.Mesh(new THREE.SphereGeometry(0.12, 10, 8), ballMat);
      b.position.set(0.24, 0.62, 0.08);
      kid.add(b);
      g.add(kid);
    }
  }
  return g;
}

/** A snack kiosk at one end of the main stand, with a striped awning and a little queue. */
export function buildKiosk(lay: StandLayout, life: StadiumLife | null): THREE.Group {
  const g = new THREE.Group();
  const body = new THREE.Mesh(new THREE.BoxGeometry(2, 1.7, 1.3), toonMaterial({ color: 0xf4f1ea }));
  body.position.y = 0.85;
  body.castShadow = true;
  addOutline(body, 0.03);
  const counter = new THREE.Mesh(new THREE.BoxGeometry(2.04, 0.12, 0.3), toonMaterial({ color: 0xff7a00 }));
  counter.position.set(0, 0.95, 0.72);
  const hatch = new THREE.Mesh(new THREE.PlaneGeometry(1.6, 0.6), toonMaterial({ color: 0x3b2a1a }));
  hatch.position.set(0, 1.3, 0.66);
  // The awning and the sign, painted on one little canvas.
  const c = document.createElement('canvas');
  c.width = 256; c.height = 128;
  const ctx = c.getContext('2d')!;
  for (let i = 0; i < 8; i++) { ctx.fillStyle = i % 2 ? '#ffffff' : '#e63946'; ctx.fillRect(i * 32, 0, 32, 64); }
  ctx.fillStyle = '#ffd23f'; ctx.fillRect(0, 64, 256, 64);
  ctx.font = '600 44px Fredoka, "Trebuchet MS", system-ui, sans-serif';
  ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.fillStyle = '#1b2a41';
  ctx.fillText('SNACKS', 128, 98);
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  const awningGeo = new THREE.PlaneGeometry(2.2, 0.7);
  const auv = awningGeo.attributes.uv as THREE.BufferAttribute;
  for (let i = 0; i < auv.count; i++) auv.setY(i, auv.getY(i) < 0.5 ? 0.5 : 1);
  const signMat = new THREE.MeshBasicMaterial({ map: tex, side: THREE.DoubleSide });
  const awning = new THREE.Mesh(awningGeo, signMat);
  awning.rotation.x = -1.0;
  awning.position.set(0, 1.62, 0.95);
  const signGeo = new THREE.PlaneGeometry(1.6, 0.4);
  const suv = signGeo.attributes.uv as THREE.BufferAttribute;
  for (let i = 0; i < suv.count; i++) suv.setY(i, suv.getY(i) < 0.5 ? 0 : 0.5);
  // The sign stands on the roof.
  const sign = new THREE.Mesh(signGeo, signMat);
  sign.position.set(0, 1.92, 0.45);
  g.add(body, counter, hatch, awning, sign);
  g.position.set(lay.len / 2 + 2.1, 0, lay.z0 - 0.9);
  if (life) {
    // Three fans queueing for a snack, who jump together when a goal goes in. They are merged into a
    // few meshes that hop as one, and left out of the stadium's own merging.
    const mats: PersonMats = { skin: toonMaterial({ color: 0xeab98f }), hair: toonMaterial({ color: 0x4a2d17 }), dark: toonMaterial({ color: 0x2f4a7a }), eye: new THREE.MeshBasicMaterial({ color: 0x1b1b1b }) };
    const shirts = [0x9bc53d, 0x5bc0eb, 0xfa7921].map((col) => toonMaterial({ color: col }));
    const queue = new THREE.Group();
    for (let i = 0; i < 3; i++) {
      const p = person(mats, shirts[i], false);
      p.scale.setScalar(0.9 - (i === 1 ? 0.15 : 0));
      p.position.set((i - 1) * 0.2, 0, 1.2 + i * 0.55);
      p.rotation.y = Math.PI + (i - 1) * 0.15;
      queue.add(p);
    }
    batchStatic(queue, []);
    queue.traverse((o) => { o.userData.dynamic = true; });
    g.add(queue);
    life.hoppers.push(queue);
  }
  return g;
}

/** A clear dugout shelter over a bench at (x, z): a curved roof and a back, on a navy frame. */
export function buildDugout(x: number, z: number): THREE.Group {
  const g = new THREE.Group();
  const glass = new THREE.MeshBasicMaterial({ color: 0xbfe3ff, transparent: true, opacity: 0.28, depthWrite: false, side: THREE.DoubleSide });
  // A quarter tube lying along x: over the bench at the top, curving down behind it.
  const shell = new THREE.Mesh(new THREE.CylinderGeometry(1.25, 1.25, 2.9, 14, 1, true, 0, Math.PI / 2), glass);
  shell.rotation.z = Math.PI / 2;
  shell.position.set(0, 0.1, -0.3);
  shell.renderOrder = 2;
  const frameMat = toonMaterial({ color: 0x1b2a41 });
  for (const sx of [-1, 1]) {
    const arc = new THREE.Mesh(new THREE.TorusGeometry(1.25, 0.04, 5, 12, Math.PI / 2), frameMat);
    arc.rotation.y = -Math.PI / 2;
    arc.position.set(sx * 1.45, 0.1, -0.3);
    g.add(arc);
  }
  const back = new THREE.Mesh(new THREE.BoxGeometry(2.9, 0.08, 0.08), frameMat);
  back.position.set(0, 0.12, 0.95);
  g.add(shell, back);
  g.position.set(x, 0, z);
  return g;
}

// ---------- each ground's own touches ----------

/** Flags on tall poles round the ground (City Lights), in the two teams' colours. */
export function buildPoleFlags(L: number, W: number, teams: [BoardTeam, BoardTeam], life: StadiumLife | null): THREE.Group {
  const g = new THREE.Group();
  const poleMat = toonMaterial({ color: 0xc7ced8 });
  const spots: [number, number][] = [[-L / 2 - 6, W / 2 + 5], [L / 2 + 6, W / 2 + 5], [-L * 0.2, W / 2 + 6], [L * 0.2, W / 2 + 6]];
  spots.forEach(([x, z], i) => {
    const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.06, 6, 6), poleMat);
    pole.position.set(x, 3, z);
    const t = teams[i % 2];
    const holder = new THREE.Group();
    holder.position.set(x, 5.4, z);
    const flag = new THREE.Mesh(new THREE.PlaneGeometry(1.4, 0.9).translate(0.72, 0, 0), new THREE.MeshBasicMaterial({ color: t.shirt, side: THREE.DoubleSide }));
    const band = new THREE.Mesh(new THREE.PlaneGeometry(1.4, 0.24).translate(0.72, 0, 0.005), new THREE.MeshBasicMaterial({ color: t.shirt2, side: THREE.DoubleSide }));
    holder.add(flag, band);
    holder.traverse((o) => { o.userData.dynamic = !!life; });
    g.add(pole, holder);
    if (life) life.wavers.push({ o: holder, base: i * 1.1, phase: i * 0.9 });
  });
  return g;
}

/** Seagulls perched along the stand roof (Seaside Arena). */
export function buildGulls(lay: StandLayout): THREE.Group {
  const g = new THREE.Group();
  const white = toonMaterial({ color: 0xffffff });
  const grey = toonMaterial({ color: 0x9aa7b8 });
  const beak = toonMaterial({ color: 0xffb020 });
  const roofTop = lay.roofY + 0.42;
  for (let i = 0; i < 5; i++) {
    const gull = new THREE.Group();
    const body = new THREE.Mesh(new THREE.SphereGeometry(0.13, 8, 6), white);
    body.scale.set(1.5, 0.9, 0.9);
    const wing = new THREE.Mesh(new THREE.SphereGeometry(0.1, 6, 5), grey);
    wing.scale.set(1.6, 0.5, 1.05);
    wing.position.set(-0.03, 0.03, 0);
    const head = new THREE.Mesh(new THREE.SphereGeometry(0.08, 8, 6), white);
    head.position.set(0.17, 0.09, 0);
    const b = new THREE.Mesh(new THREE.ConeGeometry(0.025, 0.09, 5), beak);
    b.rotation.z = -Math.PI / 2;
    b.position.set(0.27, 0.08, 0);
    gull.add(body, wing, head, b);
    gull.position.set(-lay.len / 2 + 1.5 + i * (lay.len - 3) / 4 + (i % 2) * 0.6, roofTop + 0.1, lay.z0 + 0.95);
    gull.rotation.y = (i % 2 ? 1 : -1) * 0.9 - Math.PI / 2;
    g.add(gull);
  }
  return g;
}

/** A low wooden fence round the ground (Forest Ground). */
export function buildFence(L: number, W: number): THREE.Group {
  const g = new THREE.Group();
  const wood = toonMaterial({ color: 0x8b5a2b });
  const x0 = L / 2 + 6.6, zN = W / 2 + 5, zF = -W / 2 - 7.6;
  const sides: [THREE.Vector2, THREE.Vector2][] = [
    [new THREE.Vector2(-x0, zN), new THREE.Vector2(x0, zN)],
    [new THREE.Vector2(-x0, zF), new THREE.Vector2(x0, zF)],
    [new THREE.Vector2(-x0, zF), new THREE.Vector2(-x0, zN)],
    [new THREE.Vector2(x0, zF), new THREE.Vector2(x0, zN)],
  ];
  for (const [a, b] of sides) {
    const len = a.distanceTo(b);
    const along = b.x !== a.x;
    for (const y of [0.35, 0.7]) {
      const rail = new THREE.Mesh(new THREE.BoxGeometry(along ? len : 0.06, 0.09, along ? 0.06 : len), wood);
      rail.position.set((a.x + b.x) / 2, y, (a.y + b.y) / 2);
      g.add(rail);
    }
    const posts = Math.round(len / 2);
    for (let i = 0; i <= posts; i++) {
      const t = i / posts;
      const post = new THREE.Mesh(new THREE.BoxGeometry(0.1, 0.9, 0.1), wood);
      post.position.set(a.x + (b.x - a.x) * t, 0.45, a.y + (b.y - a.y) * t);
      g.add(post);
    }
  }
  return g;
}

/** Strings of bunting all round the boards on poles (Village Field). */
export function buildExtraBunting(bl: number, bw: number): THREE.Group {
  const g = new THREE.Group();
  const poleMat = toonMaterial({ color: 0x8b5a2b });
  const x = bl / 2 + 1.2, z = bw / 2 + 1.0;
  const corners = [new THREE.Vector3(-x, 2.6, z), new THREE.Vector3(x, 2.6, z), new THREE.Vector3(x, 2.6, -z), new THREE.Vector3(-x, 2.6, -z)];
  // The far side has the stand behind it and the near side would hang across the camera, so only the ends get strings.
  const runs: [number, number][] = [[1, 2], [3, 0]];
  for (const [a, b] of runs) {
    const len = corners[a].distanceTo(corners[b]);
    const pieces = Math.max(1, Math.round(len / 9));
    for (let i = 0; i < pieces; i++) {
      const p = corners[a].clone().lerp(corners[b], i / pieces), q = corners[a].clone().lerp(corners[b], (i + 1) / pieces);
      g.add(bunting(p, q, 0.35));
      const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.04, 0.05, 2.7, 5), poleMat);
      pole.position.set(p.x, 1.35, p.z);
      g.add(pole);
    }
    const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.04, 0.05, 2.7, 5), poleMat);
    pole.position.set(corners[b].x, 1.35, corners[b].z);
    g.add(pole);
  }
  return g;
}

/** A big screen on legs behind the +x goal (City Lights): its face joins the ad boards. */
export function buildBigScreen(L: number, leds: BoardFace[]): THREE.Group {
  const g = new THREE.Group();
  const navy = toonMaterial({ color: 0x1b2a41 });
  const x = L / 2 + 8.2;
  const frame = new THREE.Mesh(new THREE.BoxGeometry(0.3, 2.0, 5.4), navy);
  frame.position.set(x, 5.2, 0);
  frame.castShadow = true;
  addOutline(frame, 0.03);
  g.add(frame);
  for (const sz of [-1, 1]) {
    const leg = new THREE.Mesh(new THREE.CylinderGeometry(0.1, 0.12, 4.3, 8), navy);
    leg.position.set(x, 2.15, sz * 2.1);
    g.add(leg);
  }
  leds.push(ledFace(x - 0.16, 5.2, 0, new THREE.Vector3(-1, 0, 0), 4.95, 1.65));
  return g;
}
