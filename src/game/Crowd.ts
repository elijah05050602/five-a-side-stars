import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import type { MatchSim, SimEvent } from './sim';
import { standLayout } from './Pitch';
import { toonMaterial } from './toon';
import { faceTexture, type Expression } from './playerFace';
import { kitTexture } from './kitTexture';
import { getSettings } from '../data/storage';

export type CrowdWeather = 'clear' | 'cloudy' | 'rain' | 'snow';
export interface CrowdConditions { night?: boolean; weather?: CrowdWeather }

/** What one side of the crowd is doing right now. Neutral fans have their own. */
type Mood = 'idle' | 'anticipate' | 'cheer' | 'groan' | 'clap' | 'slump' | 'party';

interface SideMood {
  mood: Mood;
  prev: Mood;
  /** Seconds since the mood changed: each fan joins in after their own small delay, so reactions ripple. */
  since: number;
  /** Seconds left before falling back to idle; Infinity holds the mood (full time). */
  left: number;
}

interface Fan {
  x: number; y: number; z: number;
  yaw: number;
  size: number;
  /** 0 home, 1 away, 2 neutral. */
  side: 0 | 1 | 2;
  phase: number;
  /** How lively this fan is; scales jumps and bounces. */
  energy: number;
  delay: number;
  shirt: THREE.Color;
  hair: THREE.Color;
  bald: boolean;
  flag: number; umbrella: number; glow: number;
  /** Index into this side's full-kit body mesh, or -1 for everyday clothes. */
  kit: number;
  scarf: number; cap: number;
  /** Atlas cell of the face currently shown, and seconds to the next blink. */
  face: number; blink: number;
  /** A little solo moment now and then: a clap or a wave while everyone else sits. */
  fidget: number;
  fidgetNext: number;
  // Smoothed pose
  rise: number; lean: number; nod: number; look: number;
  lf: number; ls: number; rf: number; rs: number;
}

const NEUTRAL_SHIRTS = ['#e63946', '#3da5f4', '#ffd23f', '#2eb872', '#ff6fb5', '#ff7a00', '#6a4c93', '#ffffff', '#1b2a41', '#8ecae6'];
const SKINS = ['#f6d7c3', '#eab98f', '#d49a6a', '#a86b3c', '#7a4a26', '#4a2d17'];
const HAIRS = ['#2b1b10', '#4a2d17', '#7a4a26', '#c68642', '#e8c170', '#d35400', '#1b1b1b', '#9e9e9e'];
const UMBRELLAS = ['#e63946', '#ffd23f', '#3da5f4', '#2eb872', '#ff6fb5', '#ffffff'];
const GLOWS = ['#7cfffb', '#ff7cf2', '#b6ff6b', '#ffe66b', '#ffffff'];
const TROUSERS = ['#2f4a7a', '#3a4a6b', '#1f2733', '#6b5b45', '#4b6b8a', '#5a5a5a'];
const CASUAL = ['#9bc53d', '#e8e8e8', '#5bc0eb', '#fa7921', '#c3423f', '#8e7dbe', '#f4d35e', '#2d3047', '#7a9e9f'];

/** Face cells in the crowd's face atlas, drawn with the same painter as the players' faces. */
const FACES: Expression[] = ['neutral', 'happy', 'sad', 'ouch', 'blink', 'focus'];
const F = { neutral: 0, happy: 1, sad: 2, ouch: 3, blink: 4, focus: 5 } as const;
const ATLAS_COLS = 3, ATLAS_ROWS = 2;

const CONFETTI = ['#ffd23f', '#ff6fb5', '#3da5f4', '#2eb872', '#ffffff', '#ff7a00', '#e63946'];

interface Confetto { x: number; y: number; z: number; vx: number; vy: number; vz: number; spin: number; rx: number; ry: number; life: number }

const SEAT_SPACING = 0.55;
const SHOULDER_Y = 0.5, SHOULDER_X = 0.2, HEAD_Y = 0.79, ARM_LEN = 0.38;

const _m = new THREE.Matrix4();
const _base = new THREE.Matrix4();
const _torso = new THREE.Matrix4();
const _head = new THREE.Matrix4();
const _arm = new THREE.Matrix4();
const _tmp = new THREE.Matrix4();
const _q = new THREE.Quaternion();
const _e = new THREE.Euler();
const _p = new THREE.Vector3();
const _s = new THREE.Vector3();
const _hand = new THREE.Vector3();

function trs(out: THREE.Matrix4, x: number, y: number, z: number, rx = 0, ry = 0, rz = 0, s = 1, order: THREE.EulerOrder = 'XYZ'): THREE.Matrix4 {
  _q.setFromEuler(_e.set(rx, ry, rz, order));
  return out.compose(_p.set(x, y, z), _q, _s.set(s, s, s));
}

function pick<T>(a: T[]): T { return a[Math.floor(Math.random() * a.length)]; }
function approach(cur: number, target: number, rate: number, dt: number): number { return cur + (target - cur) * (1 - Math.exp(-rate * dt)); }

/**
 * The fans in the stand: little chibi supporters in their team's colours, drawn
 * with one instanced mesh per body part so a full stand costs a handful of draw
 * calls. Each frame every fan gets a pose from their side's mood (cheering,
 * groaning, clapping...), with a personal delay and energy so the crowd moves
 * like a crowd, plus heads that follow the ball and the odd Mexican wave.
 */
export class Crowd {
  readonly group = new THREE.Group();
  /** 0..1: how loud the moment is, for the crowd sound to follow. */
  excitement = 0.15;

  private readonly fans: Fan[] = [];
  private readonly moods: [SideMood, SideMood, SideMood];
  private readonly meshes: THREE.InstancedMesh[] = [];
  private readonly body: THREE.InstancedMesh;
  private readonly legs: THREE.InstancedMesh;
  private readonly head: THREE.InstancedMesh;
  private readonly hair: THREE.InstancedMesh;
  private readonly faces: THREE.InstancedMesh;
  private readonly faceCell: THREE.InstancedBufferAttribute;
  private readonly kitBodies: THREE.InstancedMesh[] = [];
  private readonly scarves: THREE.InstancedMesh;
  private readonly caps: THREE.InstancedMesh;
  private readonly arms: THREE.InstancedMesh;
  private readonly bodyLine: THREE.InstancedMesh | null;
  private readonly headLine: THREE.InstancedMesh | null;
  private readonly flags: THREE.InstancedMesh;
  private readonly umbrellas: THREE.InstancedMesh;
  private readonly glows: THREE.InstancedMesh;
  private readonly pompoms: THREE.InstancedMesh;
  private readonly disposables: { dispose(): void }[] = [];
  private readonly calm: boolean;
  private readonly len: number;
  private readonly lay: ReturnType<typeof standLayout>;
  /** Middle of each team's end of the stand, for the goal camera. */
  private readonly ends: [number, number] = [0, 0];
  private time = 0;
  /** Seconds since anything exciting happened, for starting a Mexican wave. */
  private quiet = 0;
  private waveX = Infinity;
  /** A shot is in the air: if nothing comes of it soon, the shooting side goes "ooooh". */
  private shotWatch: { side: 0 | 1; t: number } | null = null;
  private night = false;
  private weather: CrowdWeather = 'clear';
  /** Confetti thrown by the scoring fans while the camera is on them. */
  private readonly confetti: THREE.InstancedMesh;
  private readonly bits: Confetto[] = [];
  private partySide: 0 | 1 | null = null;
  private confettiDue = 0;

  constructor(private readonly sim: MatchSim, opts: { lite: boolean }) {
    this.calm = getSettings().reduceMotion;
    const lite = opts.lite;
    const idle = (): SideMood => ({ mood: 'idle', prev: 'idle', since: 99, left: 0 });
    this.moods = [idle(), idle(), idle()];

    // Seats along the stand rows, home fans to the left, away to the right, a few neutrals mixed in.
    const lay = standLayout(sim.length, sim.width);
    this.len = lay.len;
    this.lay = lay;
    const kits = [sim.teams[0].kit, sim.teams[1].kit];
    const perRow = Math.floor(lay.len / SEAT_SPACING);
    const empty = lite ? 0.3 : 0.08;
    for (let r = 0; r < lay.rows; r++) {
      for (let i = 0; i < perRow; i++) {
        if (Math.random() < empty) continue;
        const x = -lay.len / 2 + SEAT_SPACING * (i + 0.5) + (Math.random() - 0.5) * 0.12;
        const along = x / (lay.len / 2);
        let side: 0 | 1 | 2 = along < 0 ? 0 : 1;
        if (Math.random() < 0.14 || Math.abs(along) < 0.06) side = 2;
        else if (Math.random() < 0.1) side = side === 0 ? 1 : 0; // the odd away fan in the home end
        const kit = side === 2 ? null : kits[side];
        // About a third of each team's fans wear the full club kit; the rest wear everyday clothes,
        // in team colours or not, and show who they support with a scarf or a cap.
        const shirt = new THREE.Color(kit ? (Math.random() < 0.55 ? kit.shirt : Math.random() < 0.4 ? kit.shirt2 : pick(CASUAL)) : pick([...NEUTRAL_SHIRTS, ...CASUAL]));
        const bald = Math.random() < 0.12;
        this.fans.push({
          x, y: lay.baseHeight + r * lay.rowRise, z: lay.z0 - r * lay.rowDepth + (Math.random() - 0.5) * 0.15,
          yaw: (Math.random() - 0.5) * 0.25 - along * 0.15,
          size: 0.82 + Math.random() * 0.3,
          side, phase: Math.random() * Math.PI * 2,
          energy: 0.65 + Math.random() * 0.55,
          delay: Math.random() * 0.35 + Math.abs(along) * 0.1,
          shirt, hair: new THREE.Color(pick(HAIRS)), bald,
          flag: -1, umbrella: -1, glow: -1, kit: -1, scarf: -1, cap: -1,
          face: F.neutral, blink: 1 + Math.random() * 5,
          fidget: 0, fidgetNext: 3 + Math.random() * 20,
          rise: 0, lean: 0, nod: 0, look: 0, lf: 0.25, ls: 0.1, rf: 0.25, rs: 0.1,
        });
      }
    }
    const n = this.fans.length;
    for (const side of [0, 1] as const) {
      const xs = this.fans.filter((f) => f.side === side).map((f) => f.x);
      this.ends[side] = xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : (side === 0 ? -1 : 1) * lay.len / 4;
    }

    // Parts. Geometries are built around the joint they turn about.
    // Lite crowds (phones) use rounder-cornered, lower-poly parts: the fans are small on screen.
    const bodyGeo = lite ? new THREE.CapsuleGeometry(0.17, 0.16, 2, 7) : new THREE.CapsuleGeometry(0.17, 0.16, 4, 10);
    const legGeo = new THREE.BoxGeometry(0.28, 1, 0.16).translate(0, -0.5, 0);
    const headGeo = lite ? new THREE.SphereGeometry(0.2, 9, 7) : new THREE.SphereGeometry(0.2, 12, 10);
    const hairGeo = new THREE.SphereGeometry(0.212, lite ? 9 : 12, lite ? 5 : 8, 0, Math.PI * 2, 0, Math.PI * 0.55).rotateX(-0.3);
    const armGeo = new THREE.CapsuleGeometry(0.058, 0.28, lite ? 1 : 3, lite ? 5 : 6).translate(0, -0.19, 0);
    // The face: a cap of sphere just proud of the head's front, with flat UVs like the players' face patch.
    const faceGeo = new THREE.SphereGeometry(0.203, lite ? 8 : 14, lite ? 6 : 10, Math.PI / 2 - 1.0, 2.0, 0.95, 1.55);
    {
      const pos = faceGeo.attributes.position, uv = faceGeo.attributes.uv;
      const half = 0.135, top = 0.1, bottom = -0.155;
      for (let k = 0; k < pos.count; k++) {
        const u = THREE.MathUtils.clamp(pos.getX(k) / (half * 2) + 0.5, 0.01, 0.99);
        const v = THREE.MathUtils.clamp((top - pos.getY(k)) / (top - bottom), 0.01, 0.99);
        uv.setXY(k, u, v);
      }
    }
    const scarfGeo = mergeGeometries([
      new THREE.TorusGeometry(0.15, 0.05, 6, 14).rotateX(Math.PI / 2).translate(0, 0.6, 0),
      new THREE.BoxGeometry(0.09, 0.24, 0.05).translate(0.08, 0.47, 0.17),
    ])!;
    // A cap: crown and a peak at the front.
    const capGeo = mergeGeometries([
      new THREE.SphereGeometry(0.215, 12, 6, 0, Math.PI * 2, 0, Math.PI * 0.42),
      new THREE.CylinderGeometry(0.15, 0.15, 0.025, 12, 1, false, -Math.PI / 2, Math.PI).scale(1, 1, 1.1).translate(0, 0.11, 0.13),
    ])!.translate(0, 0.02, 0);
    this.disposables.push(bodyGeo, legGeo, headGeo, hairGeo, armGeo, faceGeo, scarfGeo, capGeo);

    const toon = toonMaterial({ color: 0xffffff });
    const toonBoth = toonMaterial({ color: 0xffffff });
    toonBoth.side = THREE.DoubleSide;
    toonBoth.vertexColors = true;
    const faceMat = toonMaterial({ map: crowdFaceAtlas() });
    faceMat.transparent = true;
    faceMat.alphaTest = 0.05;
    faceMat.depthWrite = false;
    faceMat.polygonOffset = true;
    faceMat.polygonOffsetFactor = -1;
    // Each instance picks its own cell of the face atlas.
    faceMat.onBeforeCompile = (shader) => {
      shader.vertexShader = shader.vertexShader
        .replace('#include <common>', '#include <common>\nattribute float aFace;')
        .replace('#include <uv_vertex>', `#include <uv_vertex>
          vMapUv = (vMapUv + vec2(mod(aFace, ${ATLAS_COLS}.0), floor(aFace / ${ATLAS_COLS}.0))) / vec2(${ATLAS_COLS}.0, ${ATLAS_ROWS}.0);`);
    };
    const kitMats = kits.map((k) => toonMaterial({ map: kitTexture(k, null) }));
    this.disposables.push(...kitMats);
    const lineMat = new THREE.MeshBasicMaterial({ color: 0x12203a, side: THREE.BackSide });
    const glowMat = new THREE.MeshBasicMaterial({ color: 0xffffff, toneMapped: false });
    this.disposables.push(toon, toonBoth, faceMat, lineMat, glowMat);

    const inst = (geo: THREE.BufferGeometry, mat: THREE.Material, count: number, shadow = false): THREE.InstancedMesh => {
      const m = new THREE.InstancedMesh(geo, mat, Math.max(1, count));
      m.count = count;
      m.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
      // Instances move every frame, so the cached bounds would be wrong; the stand is always near the view anyway.
      m.frustumCulled = false;
      m.castShadow = shadow && !lite;
      this.meshes.push(m);
      this.group.add(m);
      return m;
    };
    this.legs = inst(legGeo, toon, n);
    this.body = inst(bodyGeo, toon, n, true);
    this.head = inst(headGeo, toon, n, true);
    this.hair = inst(hairGeo, toon, n);
    this.arms = inst(armGeo, toon, n * 2);
    this.faces = inst(faceGeo, faceMat, n);
    this.faceCell = new THREE.InstancedBufferAttribute(new Float32Array(Math.max(1, n)), 1);
    this.faceCell.setUsage(THREE.DynamicDrawUsage);
    faceGeo.setAttribute('aFace', this.faceCell);
    this.bodyLine = lite ? null : inst(bodyGeo, lineMat, n);
    this.headLine = lite ? null : inst(headGeo, lineMat, n);

    // Props: flags for the keenest fans, plus umbrellas, glow sticks and bobble hats depending on the weather.
    const shade = (geo: THREE.BufferGeometry, v: number) => {
      const c = new Float32Array(geo.attributes.position.count * 3).fill(v);
      geo.setAttribute('color', new THREE.BufferAttribute(c, 3));
      return geo;
    };
    const flagGeo = mergeGeometries([
      shade(new THREE.CylinderGeometry(0.014, 0.014, 0.95, 5).translate(0, 0.4, 0), 0.35),
      shade(new THREE.PlaneGeometry(0.46, 0.3).translate(0.23, 0.72, 0), 1),
    ])!;
    const umbrellaGeo = mergeGeometries([
      shade(new THREE.CylinderGeometry(0.012, 0.012, 0.95, 5).translate(0, 0.47, 0), 0.3),
      shade(new THREE.ConeGeometry(0.46, 0.2, 8, 1, true).translate(0, 0.98, 0), 1),
    ])!;
    const glowGeo = new THREE.CapsuleGeometry(0.038, 0.22, 2, 6).translate(0, 0.12, 0);
    const pompomGeo = new THREE.SphereGeometry(0.06, 7, 6);
    this.disposables.push(flagGeo, umbrellaGeo, glowGeo, pompomGeo);

    let flags = 0, umbrellas = 0, glows = 0, scarves = 0, caps = 0;
    const kitCount = [0, 0];
    for (const f of this.fans) {
      const teamFan = f.side !== 2;
      if (teamFan && Math.random() < 0.35) f.kit = kitCount[f.side]++;
      if (Math.random() < (teamFan ? (f.kit >= 0 ? 0.15 : 0.5) : 0.1)) f.scarf = scarves++;
      else if (Math.random() < 0.25) f.cap = caps++;
      if (f.side !== 2 && Math.random() < 0.2) f.flag = flags++;
      if (Math.random() < 0.4) f.umbrella = umbrellas++;
      if (Math.random() < 0.45) f.glow = glows++;
    }
    this.flags = inst(flagGeo, toonBoth, flags);
    this.umbrellas = inst(umbrellaGeo, toonBoth, umbrellas);
    this.glows = inst(glowGeo, glowMat, glows);
    this.pompoms = inst(pompomGeo, toon, n);
    const confettiGeo = new THREE.PlaneGeometry(0.11, 0.07);
    const confettiMat = new THREE.MeshBasicMaterial({ color: 0xffffff, side: THREE.DoubleSide, toneMapped: false });
    this.disposables.push(confettiGeo, confettiMat);
    this.confetti = inst(confettiGeo, confettiMat, lite ? 160 : 320);
    this.confetti.count = 0;
    for (let k = 0; k < this.confetti.instanceMatrix.count; k++) this.confetti.setColorAt(k, new THREE.Color(CONFETTI[k % CONFETTI.length]));
    this.scarves = inst(scarfGeo, toon, scarves);
    this.caps = inst(capGeo, toon, caps);
    for (const side of [0, 1]) this.kitBodies.push(inst(bodyGeo, kitMats[side], kitCount[side], true));

    // Colours never change mid-match, except hair under bobble hats (see setConditions).
    const c = new THREE.Color();
    this.fans.forEach((f, i) => {
      const kit = f.side === 2 ? null : kits[f.side];
      if (f.kit >= 0 && kit) f.shirt.set(kit.shirt);
      this.body.setColorAt(i, f.shirt);
      this.legs.setColorAt(i, c.set(f.kit >= 0 && kit ? kit.shorts : pick(TROUSERS)));
      this.head.setColorAt(i, c.set(pick(SKINS)));
      this.arms.setColorAt(i * 2, f.shirt);
      this.arms.setColorAt(i * 2 + 1, f.shirt);
      // Scarves and caps are in team colours (neutrals pick any colour).
      if (f.scarf >= 0) this.scarves.setColorAt(f.scarf, c.set(kit ? (Math.random() < 0.6 ? kit.shirt : kit.shirt2) : pick(CASUAL)));
      if (f.cap >= 0) this.caps.setColorAt(f.cap, c.set(kit ? (Math.random() < 0.6 ? kit.shirt : kit.shirt2) : pick(NEUTRAL_SHIRTS)));
      if (f.flag >= 0) this.flags.setColorAt(f.flag, f.side === 2 ? f.shirt : c.set(kits[f.side].shirt));
      if (f.umbrella >= 0) this.umbrellas.setColorAt(f.umbrella, c.set(Math.random() < 0.5 ? f.shirt.getStyle() : pick(UMBRELLAS)));
      if (f.glow >= 0) this.glows.setColorAt(f.glow, c.set(pick(GLOWS)));
      this.pompoms.setColorAt(i, c.set('#ffffff'));
    });
    this.setConditions({});
  }

  /** Night lights up glow sticks; rain brings out umbrellas; snow brings out bobble hats. */
  setConditions(c: CrowdConditions): void {
    if (c.night !== undefined) this.night = c.night;
    if (c.weather !== undefined) this.weather = c.weather;
    this.umbrellas.visible = this.weather === 'rain';
    this.glows.visible = this.night;
    this.pompoms.visible = this.weather === 'snow';
    this.caps.visible = this.weather !== 'snow'; // bobble hats instead
    const col = new THREE.Color();
    const white = new THREE.Color('#ffffff');
    this.fans.forEach((f, i) => {
      const hat = this.weather === 'snow';
      this.hair.setColorAt(i, hat ? col.copy(f.shirt).lerp(white, 0.15) : f.hair);
    });
    for (const m of this.meshes) if (m.instanceColor) m.instanceColor.needsUpdate = true;
  }

  /** Where to put the camera, and what to look at, to see one team's fans celebrate. */
  celebrationShot(side: 0 | 1): { pos: THREE.Vector3; look: THREE.Vector3 } {
    const x = this.ends[side], { z0, baseHeight } = this.lay;
    return { pos: new THREE.Vector3(x * 0.8, baseHeight + 3.2, z0 + 6.5), look: new THREE.Vector3(x, baseHeight + 0.9, z0 - 1.2) };
  }

  /**
   * Called every frame while the goal camera is on the scoring team's fans: they go wild
   * (jumping, fist pumps, scarves twirling overhead) and throw confetti. Stops a moment after the calls stop.
   */
  celebrate(side: 0 | 1): void {
    const other: 0 | 1 = side === 0 ? 1 : 0;
    if (this.partySide !== side) {
      this.partySide = side;
      this.confettiDue = 0;
    }
    this.set(side, 'party', 0.4);
    this.set(2, 'clap', 0.4);
    if (this.moods[other].mood !== 'slump') this.set(other, 'slump', 0.4);
    this.bump(1);
  }

  /** Feed every sim event through here. */
  onEvent(ev: SimEvent): void {
    const side = ev.side === 0 || ev.side === 1 ? ev.side : null;
    const other = (s: 0 | 1): 0 | 1 => (s === 0 ? 1 : 0);
    switch (ev.type) {
      case 'kickoff':
        this.setAll('clap', 1.6);
        this.bump(0.45);
        break;
      case 'shot':
        if (side === null) break;
        this.set(side, 'anticipate', 2);
        this.set(2, 'anticipate', 2);
        this.shotWatch = { side, t: 0 };
        this.bump(0.6);
        break;
      case 'goal':
        if (side === null) break;
        this.shotWatch = null;
        this.set(side, 'cheer', 4.5);
        this.set(other(side), 'slump', 3.2);
        this.set(2, 'clap', 3);
        this.bump(1);
        this.waveX = Infinity;
        break;
      case 'save':
        if (side === null) break;
        this.shotWatch = null;
        this.set(side, 'cheer', 1.8);
        this.set(other(side), 'groan', 2);
        this.set(2, 'clap', 1.5);
        this.bump(0.75);
        break;
      case 'miss':
        if (side === null) break;
        this.shotWatch = null;
        this.set(side, 'groan', 2.2);
        this.set(other(side), 'cheer', 1.6);
        this.bump(0.7);
        break;
      case 'halftime':
        this.setAll('clap', 2.5);
        this.bump(0.5);
        break;
      case 'fulltime': {
        const [a, b] = this.sim.score;
        if (a === b) this.setAll('clap', Infinity);
        else {
          const win: 0 | 1 = a > b ? 0 : 1;
          this.set(win, 'cheer', Infinity);
          this.set(other(win), 'clap', Infinity); // good sports
          this.set(2, 'clap', Infinity);
        }
        this.bump(1);
        break;
      }
    }
  }

  private set(side: 0 | 1 | 2, mood: Mood, dur: number): void {
    const m = this.moods[side];
    if (m.left === Infinity) return; // full time is final
    if (m.mood !== mood) { m.prev = m.mood; m.mood = mood; m.since = 0; }
    m.left = dur;
  }
  private setAll(mood: Mood, dur: number): void { for (const s of [0, 1, 2] as const) this.set(s, mood, dur); }
  private bump(level: number): void { this.excitement = Math.max(this.excitement, level); this.quiet = 0; }

  update(dt: number): void {
    const sim = this.sim;
    this.time += dt;
    const t = this.time;
    for (const m of this.moods) {
      m.since += dt;
      if (m.left !== Infinity && m.mood !== 'idle') {
        m.left -= dt;
        if (m.left <= 0) { m.prev = m.mood; m.mood = 'idle'; m.since = 0; }
      }
    }
    // A shot that came to nothing near the goal is a near miss.
    if (this.shotWatch) {
      this.shotWatch.t += dt;
      if (this.shotWatch.t > 1.4) {
        const s = this.shotWatch.side;
        this.shotWatch = null;
        if (Math.abs(sim.ball.pos.x) > sim.length / 2 - 3 && sim.phase !== 'goal') {
          this.set(s, 'groan', 2);
          this.set(2, 'groan', 1.5);
          this.bump(0.7);
        }
      }
    }
    this.excitement = Math.max(0.15, this.excitement - dt * 0.12);

    // Mexican wave, now and then when the game has been calm for a while.
    this.quiet += dt;
    if (!this.calm && sim.phase === 'play' && this.quiet > 25 && this.waveX === Infinity && Math.random() < dt / 8) {
      this.waveX = -this.len / 2 - 2;
      this.quiet = 0;
    }
    if (this.waveX !== Infinity) {
      this.waveX += dt * this.len / 4.5;
      if (this.waveX > this.len / 2 + 2) this.waveX = Infinity;
    }

    const bx = sim.ball.pos.x, bz = sim.ball.pos.z;
    const jump = this.calm ? 0.25 : 1;
    const raining = this.weather === 'rain';
    let faceChanged = false;
    for (let i = 0; i < this.fans.length; i++) {
      const f = this.fans[i];
      const sm = this.moods[f.side];
      let mood = sm.since >= f.delay ? sm.mood : sm.prev;

      // Solo fidgets keep a calm crowd alive.
      f.fidgetNext -= dt;
      if (f.fidgetNext <= 0) { f.fidget = 1.4; f.fidgetNext = 8 + Math.random() * 25; }
      if (f.fidget > 0) { f.fidget -= dt; if (mood === 'idle') mood = f.flag >= 0 ? 'cheer' : 'clap'; }

      // Target pose for the mood. f = arm raised forward/up (0 down, ~2.9 overhead), s = splayed out sideways.
      let rise = 0, lean = 0, nod = 0, hop = 0, lf = 0.3, ls = 0.12, rf = 0.3, rs = 0.12;
      const e = f.energy;
      switch (mood) {
        case 'idle':
          hop = Math.sin(t * 2 + f.phase) * 0.008;
          lf = rf = 0.35;
          ls = rs = 0.05;
          break;
        case 'anticipate':
          rise = 0.55 * e; lean = 0.22; nod = 0.05;
          lf = rf = 1.05; ls = rs = -0.12;
          hop = Math.sin(t * 18 + f.phase) * 0.006;
          break;
        case 'cheer': {
          rise = 1;
          const b = Math.sin(t * 8.5 * (0.8 + e * 0.3) + f.phase);
          hop = Math.max(0, b) * 0.2 * e * jump;
          lf = rf = 2.85; ls = rs = 0.35 + b * 0.12;
          nod = -0.25;
          break;
        }
        case 'party': {
          // Everyone's on their feet; each fan celebrates their own way.
          rise = 1;
          const beat = t * 9 * (0.85 + e * 0.25) + f.phase;
          const b = Math.sin(beat);
          hop = Math.max(0, b) * 0.34 * e * jump;
          nod = -0.3 + Math.max(0, b) * 0.12;
          lean = Math.sin(beat * 0.5) * 0.08;
          const style = Math.floor(f.phase * 1.7) % 3;
          if (style === 0) {
            // Both arms punching the sky on every jump.
            lf = rf = 2.6 + Math.max(0, b) * 0.35; ls = rs = 0.25 + b * 0.15;
          } else if (style === 1) {
            // Alternating fist pumps.
            lf = 1.9 + b * 0.9; rf = 1.9 - b * 0.9; ls = rs = 0.2;
          } else {
            // Arms swinging overhead side to side, scarf-twirl style.
            const sw = Math.sin(beat * 0.5);
            lf = rf = 2.8; ls = 0.15 + sw * 0.45; rs = 0.15 - sw * 0.45;
          }
          break;
        }
        case 'groan':
          rise = 0.75; lean = -0.12; nod = -0.3;
          lf = rf = 2.5; ls = rs = 0.85;
          break;
        case 'clap': {
          rise = 0.75;
          const c = 0.5 + 0.5 * Math.sin(t * 15 + f.phase);
          lf = rf = 1.3; ls = rs = -0.28 + c * 0.22;
          hop = Math.abs(Math.sin(t * 7.5 + f.phase)) * 0.02 * jump;
          break;
        }
        case 'slump':
          lean = 0.3; nod = 0.5;
          lf = rf = 0.15; ls = rs = 0.05;
          break;
      }
      if (f.flag >= 0 && (mood === 'cheer' || mood === 'clap' || mood === 'party')) { rf = 2.6 + Math.sin(t * 7 + f.phase) * 0.35; rs = 0.3; }
      if (this.waveX !== Infinity) {
        const w = Math.exp(-(((f.x - this.waveX) / 1.3) ** 2));
        rise = Math.max(rise, w);
        lf += (2.9 - lf) * w; rf += (2.9 - rf) * w;
        ls += (0.3 - ls) * w; rs += (0.3 - rs) * w;
        hop += w * 0.06;
      }
      if (raining && f.umbrella >= 0) { lf = 1.25; ls = 0.05; }

      // Smooth towards the target so moods blend instead of snapping.
      const k = mood === 'cheer' || mood === 'groan' || mood === 'party' ? 14 : 8;
      f.rise = approach(f.rise, rise, k, dt);
      f.lean = approach(f.lean, lean, k, dt);
      f.nod = approach(f.nod, nod, k, dt);
      f.lf = approach(f.lf, lf, k, dt);
      f.ls = approach(f.ls, ls, k * 1.5, dt);
      f.rf = approach(f.rf, rf, k, dt);
      f.rs = approach(f.rs, rs, k * 1.5, dt);
      // Heads follow the ball, within reason.
      const look = THREE.MathUtils.clamp(Math.atan2(bx - f.x, bz - f.z) - f.yaw, -1.0, 1.0);
      f.look = approach(f.look, look, 4, dt);

      // Faces follow the mood, with a blink now and then when nothing much is happening.
      let face: number = mood === 'cheer' || mood === 'clap' || mood === 'party' ? F.happy : mood === 'groan' ? F.ouch : mood === 'slump' ? F.sad : mood === 'anticipate' ? F.focus : F.neutral;
      if (this.waveX !== Infinity && Math.abs(f.x - this.waveX) < 2) face = F.happy;
      f.blink -= dt;
      if (f.blink < 0) { if (face === F.neutral) face = F.blink; if (f.blink < -0.14) f.blink = 2 + Math.random() * 5; }
      if (face !== f.face) { f.face = face; this.faceCell.setX(i, face); faceChanged = true; }

      this.pose(i, f, hop, t);
    }
    this.updateConfetti(dt);
    for (const m of this.meshes) m.instanceMatrix.needsUpdate = true;
    if (faceChanged) this.faceCell.needsUpdate = true;
  }

  /** Bursts of confetti from the partying end while it lasts, then each piece flutters down and fades out. */
  private updateConfetti(dt: number): void {
    const side = this.partySide;
    if (side !== null && this.moods[side].mood !== 'party') this.partySide = null;
    const max = this.confetti.instanceMatrix.count;
    if (this.partySide !== null) {
      this.confettiDue += dt * (this.calm ? 40 : 110);
      const { z0, baseHeight, rows, rowRise, rowDepth } = this.lay;
      const cx = this.ends[this.partySide];
      while (this.confettiDue >= 1) {
        this.confettiDue -= 1;
        if (this.bits.length >= max) break;
        const r = Math.random() * rows;
        this.bits.push({
          x: cx + (Math.random() - 0.5) * this.len * 0.45,
          y: baseHeight + r * rowRise + 1.2 + Math.random() * 0.5,
          z: z0 - r * rowDepth + (Math.random() - 0.5) * 0.4,
          vx: (Math.random() - 0.5) * 2.2, vy: 1.2 + Math.random() * 2.2, vz: 0.6 + Math.random() * 1.6,
          spin: 4 + Math.random() * 8, rx: Math.random() * 6, ry: Math.random() * 6,
          life: 2.6 + Math.random() * 1.4,
        });
      }
    }
    if (!this.bits.length && this.confetti.count === 0) return;
    let n = 0;
    for (let i = this.bits.length - 1; i >= 0; i--) {
      const b = this.bits[i];
      b.life -= dt;
      if (b.life <= 0) { this.bits.splice(i, 1); continue; }
      // Paper falls slowly and drifts, so drag soon wins over the throw.
      b.vy -= 6 * dt;
      const drag = Math.exp(-2.4 * dt);
      b.vx *= drag; b.vz *= drag; b.vy = Math.max(b.vy * drag, -1.1);
      b.x += (b.vx + Math.sin(b.rx * 2) * 0.4) * dt; b.y += b.vy * dt; b.z += b.vz * dt;
      b.rx += b.spin * dt; b.ry += b.spin * 0.6 * dt;
    }
    for (const b of this.bits) {
      const fade = Math.min(1, b.life / 0.5);
      this.confetti.setMatrixAt(n++, trs(_m, b.x, b.y, b.z, b.rx, b.ry, 0, fade));
    }
    this.confetti.count = n;
  }

  private pose(i: number, f: Fan, hop: number, t: number): void {
    const lift = f.rise * 0.2;
    trs(_base, f.x, f.y, f.z, 0, f.yaw, 0, f.size);
    // Torso: hips at the seat, lifted when standing and jumping, leaning forward or back.
    _torso.multiplyMatrices(_base, trs(_m, 0, lift + hop, 0, f.lean));

    this.legs.setMatrixAt(i, _tmp.multiplyMatrices(_torso, _m.compose(_p.set(0, 0.12, 0.02), _q.identity(), _s.set(1, lift + 0.12, 1))));
    _tmp.multiplyMatrices(_torso, trs(_m, 0, 0.34, 0));
    if (f.kit >= 0 && f.side !== 2) {
      this.kitBodies[f.side].setMatrixAt(f.kit, _tmp);
      this.body.setMatrixAt(i, _m.makeScale(0, 0, 0));
    } else this.body.setMatrixAt(i, _tmp);
    if (f.scarf >= 0) this.scarves.setMatrixAt(f.scarf, _torso);
    this.bodyLine?.setMatrixAt(i, _tmp.multiply(_m.makeScale(1.07, 1.05, 1.07)));

    _head.multiplyMatrices(_torso, trs(_m, 0, HEAD_Y, 0, f.nod, f.look, 0, 1, 'YXZ'));
    this.head.setMatrixAt(i, _head);
    this.faces.setMatrixAt(i, _head);
    if (f.cap >= 0) this.caps.setMatrixAt(f.cap, _head);
    this.headLine?.setMatrixAt(i, _tmp.copy(_head).multiply(_m.makeScale(1.07, 1.07, 1.07)));
    const hat = this.weather === 'snow';
    this.hair.setMatrixAt(i, f.bald && !hat ? _tmp.makeScale(0, 0, 0) : _head);
    this.pompoms.setMatrixAt(i, _tmp.multiplyMatrices(_head, trs(_m, 0, 0.22, -0.04)));

    // Arms swing about the shoulder: forward/up first, then splayed outward.
    for (const side of [-1, 1]) {
      const fw = side < 0 ? f.lf : f.rf, sp = side < 0 ? f.ls : f.rs;
      _arm.multiplyMatrices(_torso, trs(_m, side * SHOULDER_X, SHOULDER_Y, 0, -fw, 0, side * sp, 1, 'ZYX'));
      this.arms.setMatrixAt(i * 2 + (side < 0 ? 0 : 1), _arm);
      _hand.set(0, -ARM_LEN, 0).applyMatrix4(_arm);
      // Props stay upright in the hand, with a bit of sway.
      if (side > 0 && f.flag >= 0) {
        const sway = Math.sin(t * 7 + f.phase) * 0.3 * Math.max(0, (f.rf - 1) / 1.9);
        this.flags.setMatrixAt(f.flag, trs(_m, _hand.x, _hand.y, _hand.z, 0, f.yaw + 0.4, sway, f.size));
      }
      if (side < 0 && f.umbrella >= 0) this.umbrellas.setMatrixAt(f.umbrella, trs(_m, _hand.x, _hand.y, _hand.z, 0, 0, -0.18, f.size));
      if (f.glow >= 0 && side === (f.flag >= 0 ? -1 : 1)) {
        this.glows.setMatrixAt(f.glow, trs(_m, _hand.x, _hand.y, _hand.z, 0, f.yaw, Math.sin(t * 5 + f.phase) * 0.6, f.size));
      }
    }
  }

  dispose(): void {
    for (const m of this.meshes) m.dispose();
    for (const d of this.disposables) d.dispose();
    this.group.removeFromParent();
  }
}

let faceAtlas: THREE.CanvasTexture | null = null;
/** Every crowd expression in one texture: features only, on a clear background, so the head's skin shows through. */
function crowdFaceAtlas(): THREE.CanvasTexture {
  if (faceAtlas) return faceAtlas;
  const cell = 160;
  const c = document.createElement('canvas');
  c.width = cell * ATLAS_COLS; c.height = cell * ATLAS_ROWS;
  const ctx = c.getContext('2d')!;
  FACES.forEach((expr, i) => {
    const img = faceTexture('rgba(0,0,0,0)', expr).image as HTMLCanvasElement;
    ctx.drawImage(img, (i % ATLAS_COLS) * cell, Math.floor(i / ATLAS_COLS) * cell, cell, cell);
  });
  faceAtlas = new THREE.CanvasTexture(c);
  faceAtlas.colorSpace = THREE.SRGBColorSpace;
  faceAtlas.flipY = false;
  faceAtlas.anisotropy = 4;
  return faceAtlas;
}
