import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { addOutline, toonMaterial } from './toon';
import { POST_R, netPresses, roofHeight, type GoalShape, type NetPanel } from './goalFrame';
import { AdBoards, type BoardFace, type BoardTeam } from './adBoards';
import { GROUNDS, type Ground } from './grounds';
import { shared } from './renderer';
import { SKYLINE_RADIUS } from './skyline';
import {
  StadiumLife, bannerMaterial, buildBallStopNetting, buildBigScreen, buildDugout, buildEndStand, buildExtraBunting, buildFence,
  buildGulls, buildKiosk, buildPitchside, buildPoleFlags, buildStand, buildTree, ledFace, standLayout,
} from './stadium';

export { standLayout, type StandLayout } from './stadium';

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
  /** Where the match is played (default Mount Apo Park), and the two teams, for the boards, banners and flags. */
  ground?: Ground;
  teams?: [BoardTeam, BoardTeam];
  /** Graphics: smaller pictures on the boards (phones). */
  lite?: boolean;
  /** Graphics: the end stand, the people by the pitch and the flags that wave (Medium and High). */
  extras?: boolean;
  /** Graphics: fine grass blades over the stripes for the low replay cameras (Medium and High). */
  grassDetail?: boolean;
  /** Reduce motion: the boards change without sliding and nothing flashes. */
  calm?: boolean;
}

/** Where the four floodlight towers stand: [x, y, z] of each lamp head. */
export function floodlightPositions(L: number, W: number): [number, number, number][] {
  const out: [number, number, number][] = [];
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) out.push([sx * (L / 2 + 4.5), 9.5, sz * (W / 2 + 4.5)]);
  return out;
}

/** The parts of the pitch the match scene animates: nets, the big scoreboard, the LED boards and the stadium's little movements. The fans live in Crowd.ts. */
export interface PitchExtras { nets: GoalNet[]; scoreboard: Scoreboard; boards: AdBoards; life: StadiumLife }
export function pitchExtras(pitch: THREE.Group): PitchExtras {
  return pitch.userData.extras as PitchExtras;
}

const DEFAULT_TEAMS: [BoardTeam, BoardTeam] = [
  { name: 'Home', short: 'HOM', shirt: '#e63946', shirt2: '#ffffff' },
  { name: 'Away', short: 'AWY', shirt: '#3da5f4', shirt2: '#1b2a41' },
];

/** Worn grass where the most running happens: in front of each goal and round the centre spot. */
export interface GrassWear { length: number; width: number; goalWidth: number; planeLength: number; planeWidth: number }

/** Mown stripes with a sprinkle of lighter and darker blades, so the grass is not a flat colour. */
export function grassTexture(stripes: number, light: string, dark: string, speckle = true, wear?: GrassWear): THREE.CanvasTexture {
  const c = document.createElement('canvas');
  c.width = 1024; c.height = 1024;
  const ctx = c.getContext('2d')!;
  for (let i = 0; i < stripes; i++) {
    ctx.fillStyle = i % 2 === 0 ? light : dark;
    ctx.fillRect((i * 1024) / stripes, 0, 1024 / stripes + 1, 1024);
  }
  if (wear) {
    // Canvas x runs along the pitch, canvas y across it (top is the far touchline).
    const px = (x: number) => (x / wear.planeLength + 0.5) * 1024, pz = (z: number) => (z / wear.planeWidth + 0.5) * 1024;
    const scale = 1024 / wear.planeLength;
    const patch = (x: number, z: number, rx: number, rz: number, alpha: number) => {
      ctx.save();
      ctx.translate(px(x), pz(z));
      ctx.scale(rx * scale, rz * 1024 / wear.planeWidth);
      const g = ctx.createRadialGradient(0, 0, 0, 0, 0, 1);
      g.addColorStop(0, `rgba(196,184,120,${alpha})`);
      g.addColorStop(0.55, `rgba(170,175,110,${alpha * 0.5})`);
      g.addColorStop(1, 'rgba(170,175,110,0)');
      ctx.fillStyle = g;
      ctx.beginPath(); ctx.arc(0, 0, 1, 0, Math.PI * 2); ctx.fill();
      ctx.restore();
    };
    for (const sx of [-1, 1]) {
      // The goalmouth takes the most wear, the keeper's spot on the line most of all.
      patch(sx * (wear.length / 2 - 0.9), 0, 1.6, wear.goalWidth * 0.55, 0.42);
      patch(sx * (wear.length / 2 - 0.35), 0, 0.7, wear.goalWidth * 0.3, 0.38);
    }
    patch(0, 0, 1.4, 1.4, 0.3);
    // Scuffs: little bare streaks, thickest in the goalmouths.
    for (let i = 0; i < 700; i++) {
      const sx = Math.random() < 0.5 ? -1 : 1;
      const mouth = Math.random() < 0.8;
      const x = mouth ? sx * (wear.length / 2 - Math.random() * 2.2) : (Math.random() - 0.5) * 3;
      const z = mouth ? (Math.random() - 0.5) * wear.goalWidth * 1.1 : (Math.random() - 0.5) * 3;
      ctx.fillStyle = Math.random() < 0.6 ? 'rgba(150,130,80,0.22)' : 'rgba(225,215,160,0.18)';
      ctx.fillRect(px(x), pz(z), 2 + Math.random() * 5, 1 + Math.random() * 2);
    }
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

let bladeTex: THREE.CanvasTexture | null = null;
/** A small tile of grass blades, repeated every metre or so over the stripes. Painted once and kept. */
function bladeTexture(): THREE.CanvasTexture {
  if (bladeTex) return bladeTex;
  const c = document.createElement('canvas');
  c.width = c.height = 256;
  const ctx = c.getContext('2d')!;
  ctx.fillStyle = 'rgb(128,128,128)';
  ctx.fillRect(0, 0, 256, 256);
  for (let i = 0; i < 2600; i++) {
    const x = Math.random() * 256, y = Math.random() * 256, len = 4 + Math.random() * 9, lean = (Math.random() - 0.5) * 3;
    const v = Math.random() < 0.5 ? 70 + Math.random() * 40 : 170 + Math.random() * 60;
    ctx.strokeStyle = `rgb(${v},${v},${v})`;
    ctx.lineWidth = 1 + Math.random();
    // Drawn three times across each edge so the tile repeats without a seam.
    for (const dx of [-256, 0, 256]) for (const dy of [-256, 0, 256]) {
      ctx.beginPath(); ctx.moveTo(x + dx, y + dy); ctx.lineTo(x + dx + lean, y + dy - len); ctx.stroke();
    }
  }
  bladeTex = shared(new THREE.CanvasTexture(c));
  bladeTex.wrapS = bladeTex.wrapT = THREE.RepeatWrapping;
  bladeTex.anisotropy = 8;
  return bladeTex;
}

/** Fine blades over the grass's own picture, so the low cameras see grass rather than a smooth green. */
function addGrassBlades(mat: THREE.Material, repeat: [number, number]): void {
  const uniforms = { uBlades: { value: bladeTexture() }, uBladeRepeat: { value: new THREE.Vector2(...repeat) } };
  mat.onBeforeCompile = (shader) => {
    Object.assign(shader.uniforms, uniforms);
    shader.fragmentShader = shader.fragmentShader
      .replace('#include <common>', '#include <common>\nuniform sampler2D uBlades;\nuniform vec2 uBladeRepeat;')
      .replace('#include <map_fragment>', '#include <map_fragment>\n#ifdef USE_MAP\n  diffuseColor.rgb *= mix(0.86, 1.12, texture2D(uBlades, vMapUv * uBladeRepeat).r);\n#endif');
  };
  mat.customProgramCacheKey = () => 'grass-blades';
}

/** A strip along the boards' backs: navy with a faint Goal Rush! stencil, repeated every three metres. */
function boardBackTexture(): THREE.CanvasTexture {
  const c = document.createElement('canvas');
  c.width = 512; c.height = 128;
  const ctx = c.getContext('2d')!;
  ctx.fillStyle = '#1b2a41';
  ctx.fillRect(0, 0, 512, 128);
  ctx.font = '600 54px Fredoka, "Trebuchet MS", system-ui, sans-serif';
  ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
  ctx.fillStyle = 'rgba(255,255,255,0.22)';
  ctx.fillText('GOAL RUSH!', 256, 68);
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.wrapS = THREE.RepeatWrapping;
  tex.anisotropy = 4;
  return tex;
}

/** "GOAL RUSH!" painted faintly on the grass beside the halfway line, by the far touchline. */
function pitchArt(width: number): THREE.Mesh {
  const c = document.createElement('canvas');
  c.width = 1024; c.height = 160;
  const ctx = c.getContext('2d')!;
  ctx.font = '600 128px Fredoka, "Trebuchet MS", system-ui, sans-serif';
  ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
  ctx.fillStyle = '#ffffff';
  ctx.fillText('GOAL RUSH!', 512, 88);
  const tex = new THREE.CanvasTexture(c);
  tex.anisotropy = 8;
  const mesh = new THREE.Mesh(new THREE.PlaneGeometry(width, width * 160 / 1024), new THREE.MeshBasicMaterial({ map: tex, transparent: true, opacity: 0.32, depthWrite: false }));
  mesh.rotation.x = -Math.PI / 2;
  return mesh;
}

/** Grass, markings, LED boards, two goals with nets, flags, the stadium round it and the ground's own scenery. */
export function buildPitch(d: PitchDims): THREE.Group {
  const g = new THREE.Group();
  const L = d.length, W = d.width;
  const ground = d.ground ?? GROUNDS.apo;
  const teams = d.teams ?? DEFAULT_TEAMS;
  const life = new StadiumLife(!!d.calm);
  const extras = d.extras ?? true;
  // The grass fills most of the screen, so on Low it skips the costly physically based lighting.
  const surface = (opts: { map: THREE.Texture; roughness: number }): THREE.MeshStandardMaterial | THREE.MeshLambertMaterial =>
    d.pbr === false ? new THREE.MeshLambertMaterial({ map: opts.map }) : new THREE.MeshStandardMaterial(opts);

  const grassMat = surface({ map: grassTexture(12, '#3cc47c', '#33b36f', true, { length: L, width: W, goalWidth: d.goalWidth, planeLength: L + 6, planeWidth: W + 6 }), roughness: 1 });
  if (d.grassDetail) addGrassBlades(grassMat, [(L + 6) / 1.1, (W + 6) / 1.1]);
  const grass = new THREE.Mesh(new THREE.PlaneGeometry(L + 6, W + 6), grassMat);
  grass.rotation.x = -Math.PI / 2;
  grass.receiveShadow = true;
  grass.userData.grass = true;
  g.add(grass);

  // Surround: darker, rougher grass outside the boards (sand at the seaside).
  const apronTex = grassTexture(1, ground.surround, ground.surround);
  apronTex.wrapS = apronTex.wrapT = THREE.RepeatWrapping;
  // Out to the painted skyline (skyline.ts), so no sky shows under the hills from a high camera.
  apronTex.repeat.set(36, 36);
  const apron = new THREE.Mesh(new THREE.PlaneGeometry(SKYLINE_RADIUS * 2.2, SKYLINE_RADIUS * 2.2), surface({ map: apronTex, roughness: 1 }));
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
  if (ground.surround !== '#e3cf9a') g.add(daisy); // no daisies on the sand
  else { daisy.geometry.dispose(); (daisy.material as THREE.Material).dispose(); daisy.dispose(); }

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
  const flagMat = new THREE.MeshBasicMaterial({ color: teams[0].shirt, side: THREE.DoubleSide });
  for (const sx of [-1, 1]) {
    flat(new THREE.RingGeometry(W * 0.26 - lw, W * 0.26, 48, 1, sx > 0 ? Math.PI / 2 : -Math.PI / 2, Math.PI), (sx * L) / 2, 0);
    flat(new THREE.CircleGeometry(0.12, 12), sx * (L / 2 - W * 0.26 - 0.6), 0, 0.006);
    // Corner arcs and flags in the home team's colour
    for (const sz of [-1, 1]) {
      const start = sx > 0 ? (sz > 0 ? Math.PI : Math.PI / 2) : (sz > 0 ? -Math.PI / 2 : 0);
      flat(new THREE.RingGeometry(0.6 - lw, 0.6, 16, 1, start, Math.PI / 2), (sx * L) / 2, (sz * W) / 2);
      g.add(buildFlag((sx * L) / 2 + sx * 0.25, (sz * W) / 2 + sz * 0.25, flagMat, extras ? life : null));
    }
  }

  // LED boards round the pitch, leaving the goal mouths open. The board itself is a navy box with a
  // stencilled back; its pitch-side face is part of the one AdBoards mesh made below.
  const boardH = 0.9;
  const leds: BoardFace[] = [];
  const bodyMat = toonMaterial({ color: 0x1b2a41 });
  const backTex = boardBackTexture();
  const backMat = toonMaterial({ map: backTex });
  const boardTop = toonMaterial({ color: 0x1b2a41 });
  const t = 0.15;
  const board = (x: number, z: number, lx: number, lz: number, nx: number, nz: number) => {
    const m = new THREE.Mesh(new THREE.BoxGeometry(lx, boardH, lz), bodyMat);
    m.position.set(x, boardH / 2, z);
    m.castShadow = true;
    g.add(m);
    const cap = new THREE.Mesh(new THREE.BoxGeometry(lx + 0.06, 0.1, lz + 0.06), boardTop);
    cap.position.set(x, boardH + 0.03, z);
    g.add(cap);
    const len = Math.max(lx, lz);
    const normal = new THREE.Vector3(nx, 0, nz);
    leds.push(ledFace(x + nx * (t / 2 + 0.004), boardH * 0.5, z + nz * (t / 2 + 0.004), normal, len - 0.02, boardH - 0.08));
    // The back, facing away from the pitch: a stencil repeated every three metres.
    const backGeo = new THREE.PlaneGeometry(len, boardH - 0.08);
    const uv = backGeo.attributes.uv as THREE.BufferAttribute;
    for (let i = 0; i < uv.count; i++) uv.setX(i, uv.getX(i) * len / 3);
    const back = new THREE.Mesh(backGeo, backMat);
    back.position.set(x - nx * (t / 2 + 0.004), boardH * 0.5, z - nz * (t / 2 + 0.004));
    back.rotation.y = Math.atan2(-nx, -nz);
    g.add(back);
  };
  const rs = d.runoffSide ?? 0, re = d.runoffEnd ?? 0;
  const bl = L + re * 2, bw = W + rs * 2;
  board(0, -bw / 2 - t / 2, bl + t * 2, t, 0, 1);
  board(0, bw / 2 + t / 2, bl + t * 2, t, 0, -1);
  const nets: GoalNet[] = [];
  for (const sx of [-1, 1] as const) {
    if (re > d.goalDepth) {
      // Boards set back behind the goal, so the ball can run out for a goal kick or a corner.
      board(sx * (bl / 2 + t / 2), 0, t, bw, -sx, 0);
    } else {
      const sideLen = (W - d.goalWidth) / 2;
      board(sx * (L / 2 + t / 2), -(d.goalWidth / 2 + sideLen / 2), t, sideLen, -sx, 0);
      board(sx * (L / 2 + t / 2), d.goalWidth / 2 + sideLen / 2, t, sideLen, -sx, 0);
    }
    const net = new GoalNet(sx, d, d.netDetail, d.netCols, d.calmNets);
    nets.push(net);
    g.add(buildGoal(sx, d), net.group);
  }
  if (rs >= 1) {
    const art = pitchArt(Math.min(6, L * 0.22));
    art.position.set(0, 0.004, -W / 2 - rs * 0.5);
    g.add(art);
  }

  // The stand along the far side (the fans are in Crowd.ts), with the end stand behind the +x goal on
  // Medium and High; netting and banners behind both goals; benches in dugouts on the near side.
  const bannerMat = bannerMaterial(teams);
  // The new stadium parts are merged even on High (see stadiumParts), so they go in a list as they are added.
  const parts: THREE.Object3D[] = [];
  const part = (o: THREE.Object3D) => { parts.push(o); g.add(o); };
  part(buildStand({ L, W, ground, teams, leds, bannerMat }));
  if (extras) part(buildEndStand({ L, W, ground, teams, leds, bannerMat, runoffEnd: re }));
  part(buildBallStopNetting(L, bl, bw, d.goalDepth, bannerMat));
  const scoreboard = new Scoreboard(teams);
  scoreboard.group.position.set(-L / 2 - 7.5, 0, 0);
  scoreboard.group.rotation.y = Math.PI / 2;
  g.add(scoreboard.group);
  for (const [x, y, z] of floodlightPositions(L, W)) g.add(buildFloodlight(x, y, z));
  for (const sx of [-1, 1]) {
    g.add(buildBench(sx * L * 0.18, W / 2 + 2.2));
    part(buildDugout(sx * L * 0.18, W / 2 + 2.2));
  }
  const coneMat = toonMaterial({ color: 0xff7a00 });
  for (let i = 0; i < 4; i++) {
    const cone = new THREE.Mesh(new THREE.ConeGeometry(0.18, 0.4, 8), coneMat);
    cone.position.set(-L / 2 + 1 + i * 0.9, 0.2, W / 2 + 3.2);
    cone.castShadow = true;
    addOutline(cone, 0.02);
    g.add(cone);
  }
  const lay = standLayout(L, W);
  part(buildKiosk(lay, extras ? life : null));
  if (extras) part(buildPitchside(L, { goalWidth: d.goalWidth, runoffEnd: re, bl, bw }, life));

  // Each ground's own touches.
  if (ground.bigScreen) part(buildBigScreen(L, leds));
  if (ground.poleFlags) part(buildPoleFlags(L, W, teams, extras ? life : null));
  if (ground.gulls) part(buildGulls(lay));
  if (ground.fence) part(buildFence(L, W));
  if (ground.extraBunting) part(buildExtraBunting(bl, bw));

  // Trees of the ground's kind round the outside, so the camera edge isn't bare.
  const leafMats = ground.leaves.map((c) => toonMaterial({ color: c }));
  const trunkMat = toonMaterial({ color: 0x8b5a2b });
  for (let i = 0; i < 16; i++) {
    const a = (i / 16) * Math.PI * 2 + 0.2;
    // Leave room for the big screen behind the +x goal.
    if (ground.bigScreen && Math.cos(a) > 0.9) continue;
    const tree = buildTree(ground.trees, i, leafMats, trunkMat);
    const far = Math.abs(Math.sin(a)) > 0.7 && Math.sin(a) < 0 ? 5 : 0; // leave room for the stand
    tree.position.set(Math.cos(a) * (L / 2 + 8 + (i % 3) * 1.5), 0, Math.sin(a) * (W / 2 + 7 + ((i * 2) % 3) + far));
    g.add(tree);
  }

  // Every LED face (boards, stand roofs, big screen) in one mesh.
  const boards = new AdBoards(leds, { teams, ground: ground.name, lite: !!d.lite, calm: !!d.calm });
  g.add(boards.mesh);
  // Only the players and the ball then draw into the shadow map, which is most of its cost saved.
  if (d.sceneryShadows === false) g.traverse((o) => { o.castShadow = false; });
  g.userData.extras = { nets, scoreboard, boards, life } satisfies PitchExtras;
  g.userData.stadiumParts = parts;
  return g;
}

/**
 * The stadium's many small parts (stands, people, kiosk, netting...). High graphics keeps the rest of
 * the scenery as separate meshes, but merges these, which looks the same and saves a couple of hundred draw calls.
 */
export function stadiumParts(pitch: THREE.Group): THREE.Object3D[] {
  return (pitch.userData.stadiumParts as THREE.Object3D[] | undefined) ?? [];
}

/** A corner flag on its pole; it waves when `life` is given. */
function buildFlag(x: number, z: number, mat: THREE.Material, life: StadiumLife | null): THREE.Group {
  const g = new THREE.Group();
  const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.02, 0.025, 1.5, 6), toonMaterial({ color: 0xffffff }));
  pole.position.y = 0.75;
  const shape = new THREE.Shape();
  shape.moveTo(0, 0); shape.lineTo(0.45, -0.14); shape.lineTo(0, -0.3); shape.closePath();
  const flag = new THREE.Mesh(new THREE.ShapeGeometry(shape), mat);
  flag.position.set(0, 1.5, 0);
  flag.rotation.y = Math.atan2(-z, -x);
  g.add(pole, flag);
  if (life) {
    flag.userData.dynamic = true;
    life.wavers.push({ o: flag, base: flag.rotation.y, phase: x * 0.7 + z * 0.3 });
  }
  g.position.set(x, 0, z);
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

  constructor(private readonly teams: [BoardTeam, BoardTeam] = DEFAULT_TEAMS) {
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
    // A stripe in each team's shirt colour under its code (the codes are made and checked by shortCode()).
    c.fillStyle = this.teams[0].shirt;
    c.fillRect(40, 98, 120, 8);
    c.fillStyle = this.teams[1].shirt;
    c.fillRect(352, 98, 120, 8);
    c.fillStyle = '#ffffff';
    c.font = 'bold 54px system-ui, sans-serif';
    c.fillText(home.toUpperCase(), 100, 70, 150);
    c.fillText(away.toUpperCase(), 412, 70, 150);
    c.fillStyle = '#ffd23f';
    c.font = 'bold 120px system-ui, sans-serif';
    c.fillText(String(h), 100, 158);
    c.fillText(String(a), 412, 158);
    c.fillStyle = '#8d99ae';
    c.font = 'bold 48px system-ui, sans-serif';
    c.fillText('-', 256, 150);
    c.fillStyle = '#ffd23f';
    c.font = 'bold 30px system-ui, sans-serif';
    c.fillText('GOAL RUSH!', 256, 46);
    this.tex.needsUpdate = true;
  }
}

/** A floodlight tower: a tall pole with a bank of twelve lamps in a frame. Weather turns the lamps on at night. */
function buildFloodlight(x: number, y: number, z: number): THREE.Group {
  const g = new THREE.Group();
  const poleMat = toonMaterial({ color: 0x9aa7b8 });
  const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.1, 0.16, y, 8), poleMat);
  pole.position.y = y / 2;
  pole.castShadow = true;
  const head = new THREE.Mesh(new THREE.BoxGeometry(1.9, 1.1, 0.3), toonMaterial({ color: 0x1b2a41 }));
  head.position.y = y;
  const rim = new THREE.Mesh(new THREE.BoxGeometry(2.05, 0.08, 0.36), poleMat);
  rim.position.set(0, 0.6, 0);
  head.add(rim);
  const lampMat = new THREE.MeshStandardMaterial({ color: 0xf6f8ff, emissive: 0xffffff, emissiveIntensity: 0, roughness: 0.3 });
  // All twelve lamps in one mesh, so a tower costs one draw call for them even on High.
  const lamps = mergeGeometries(Array.from({ length: 12 }, (_, i) => new THREE.CircleGeometry(0.15, 10).translate(-0.7 + (i % 4) * (1.4 / 3), 0.33 - Math.floor(i / 4) * 0.33, 0.16)))!;
  const lamp = new THREE.Mesh(lamps, lampMat);
  lamp.userData.lamp = true;
  head.add(lamp);
  g.add(pole, head);
  g.position.set(x, 0, z);
  g.lookAt(0, 0, 0);
  return g;
}
