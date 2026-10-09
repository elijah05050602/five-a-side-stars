import * as THREE from 'three';
import { addOutline, toonMaterial } from './toon';
import { Fireworks, type BurstStyle } from './fireworks';
import { softDot } from './effects';
import { shared } from './renderer';
import { standLayout } from './stadium';
import { MODEL_SCALE, type AnimState, type PlayerModel } from './PlayerModel';
import type { TrophyKind, TrophyLevel, TrophyWin } from './trophy';

/**
 * The trophy lift. At the final whistle of a match that wins something, the winners jog over to a podium
 * in front of the main stand, the lifter hops up, picks up the trophy and raises it over their head, and
 * the sky fills with fireworks. The same show at every level, grander the higher the win:
 *
 *   1 Acorn League: a gold star trophy, a few pops of gold.
 *   2 Puddle League: a small silver shield, coloured rockets, CHAMPIONS on the LED boards.
 *   3 Thunder League: a silver shield, rockets and rings, streamers and confetti.
 *   4 Lightning League: a gold shield, big bursts and gold rain, sparkler fountains, camera flashes.
 *   5 Star Premier League and cup finals: the big gold cup, a sky full of fireworks, light beams sweeping
 *     the sky and the stadium dimming to dusk so it all glows.
 *
 * Nothing here touches the sim: the match is over, and this only moves the models and the camera.
 */

export interface CeremonyCast {
  /** Who lifts the trophy: the career Star, or the winners' top scorer. */
  lifter: PlayerModel;
  /** The rest of the winners, subs included: they line up either side of the podium. */
  mates: PlayerModel[];
  /** The other team stay where they are, heads down at first; their keeper sits on the grass. */
  losers: PlayerModel[];
  loserKeepers: PlayerModel[];
}

export interface CeremonyOptions {
  /** Pitch size and the kids' age-group scale. */
  length: number;
  width: number;
  scale: number;
  /** The winners' shirt colours, for the ribbons and some of the fireworks. */
  colours: [string, string];
  /** "Reduce motion": a shorter, still show with fewer fireworks and no camera flashes or sweeping beams. */
  calm: boolean;
  /** Low graphics: fewer sparks. */
  lite: boolean;
  /** Already night: no need to dim the sky. */
  night: boolean;
}

/** How grand each level is. */
interface Show {
  /** Rockets in the volley as the trophy goes up, then one about every `every` seconds. */
  volley: number;
  every: number;
  sparks: number;
  radius: number;
  styles: BurstStyle[];
  /** Sparkler fountains along the front of the stand, and camera flashes a second. */
  fountains: number;
  flashes: number;
  /** Light beams sweeping the sky from behind the stand. */
  beams: number;
  /** Dim the stadium to dusk so the fireworks glow. */
  dusk: boolean;
  /** Seconds the trophy is held up before the full-time card comes. */
  hold: number;
  /** CHAMPIONS on the LED boards, and the paper confetti. */
  boards: boolean;
  confetti: boolean;
}

export const SHOWS: Record<TrophyLevel, Show> = {
  1: { volley: 3, every: 2.6, sparks: 40, radius: 1.5, styles: ['peony'], fountains: 0, flashes: 0, beams: 0, dusk: false, hold: 4.5, boards: false, confetti: false },
  2: { volley: 5, every: 1.7, sparks: 55, radius: 1.8, styles: ['peony', 'ring'], fountains: 0, flashes: 0, beams: 0, dusk: false, hold: 5, boards: true, confetti: false },
  3: { volley: 6, every: 1.2, sparks: 70, radius: 2.1, styles: ['peony', 'ring', 'peony'], fountains: 0, flashes: 0, beams: 0, dusk: false, hold: 6, boards: true, confetti: true },
  4: { volley: 8, every: 0.85, sparks: 90, radius: 2.4, styles: ['peony', 'ring', 'willow'], fountains: 4, flashes: 3, beams: 0, dusk: false, hold: 7, boards: true, confetti: true },
  5: { volley: 12, every: 0.5, sparks: 120, radius: 2.8, styles: ['peony', 'ring', 'willow', 'willow', 'peony'], fountains: 6, flashes: 6, beams: 4, dusk: true, hold: 8, boards: true, confetti: true },
};

/** Podium colours: green, blue, purple, red, then navy for the very top. */
const PODIUM = ['#2eb872', '#3da5f4', '#6a4c93', '#e63946', '#1b2a41'];
const GOLD = '#ffc83d', SILVER = '#d9e2ec';

const smooth = (x: number) => THREE.MathUtils.smoothstep(x, 0, 1);

/** A kid's height in metres at this age-group scale. */
const kidHeight = (scale: number) => 1.4 * MODEL_SCALE * scale;

/** A five-pointed star shape, `r` across its points. */
function starShape(r: number, inner = 0.45): THREE.Shape {
  const s = new THREE.Shape();
  for (let i = 0; i < 10; i++) {
    const a = Math.PI / 2 + (i * Math.PI) / 5;
    const rr = i % 2 ? r * inner : r;
    if (i === 0) s.moveTo(Math.cos(a) * rr, Math.sin(a) * rr); else s.lineTo(Math.cos(a) * rr, Math.sin(a) * rr);
  }
  s.closePath();
  return s;
}

function part(geo: THREE.BufferGeometry, colour: string, outline = 0.012): THREE.Mesh {
  const m = new THREE.Mesh(geo, toonMaterial({ color: colour }));
  m.castShadow = true;
  if (outline > 0) addOutline(m, outline);
  return m;
}

/**
 * The trophy, about `u` (a kid's height) across. Its origin is where the hands hold it, so it can simply be put
 * at the lifter's hands.
 */
export function buildTrophy(kind: TrophyKind, gold: boolean, u: number, ribbons: [string, string]): THREE.Group {
  const g = new THREE.Group();
  const body = new THREE.Group();
  g.add(body);
  const metal = gold ? GOLD : SILVER;
  const trim = gold ? '#fff1b0' : GOLD;
  if (kind === 'cup') {
    // The big cup: a foot, a stem and a wide bowl, two loop handles and ribbons in the winners' colours.
    const H = 0.5 * u;
    const prof = [[0, 0], [0.16, 0], [0.16, 0.05], [0.1, 0.09], [0.05, 0.12], [0.04, 0.3], [0.09, 0.36], [0.2, 0.5], [0.25, 0.7], [0.26, 0.86], [0.23, 0.87], [0.0, 0.84]]
      .map(([x, y]) => new THREE.Vector2(x * H, y * H));
    const cup = part(new THREE.LatheGeometry(prof, 24), metal);
    body.add(cup);
    const band = part(new THREE.TorusGeometry(0.255 * H, 0.016 * H, 6, 24), trim, 0);
    band.rotation.x = Math.PI / 2;
    band.position.y = 0.86 * H;
    body.add(band);
    for (const side of [-1, 1]) {
      const handle = part(new THREE.TorusGeometry(0.11 * H, 0.025 * H, 6, 16, Math.PI * 1.25), metal, 0.008);
      handle.position.set(side * 0.27 * H, 0.66 * H, 0);
      handle.rotation.z = side > 0 ? -Math.PI * 0.62 : Math.PI * 1.62;
      body.add(handle);
      const ribbon = part(new THREE.PlaneGeometry(0.06 * H, 0.42 * H), side > 0 ? ribbons[0] : ribbons[1], 0);
      (ribbon.material as THREE.Material).side = THREE.DoubleSide;
      ribbon.geometry.translate(0, -0.21 * H, 0);
      ribbon.position.set(side * 0.36 * H, 0.66 * H, 0.02 * H);
      ribbon.name = 'ribbon';
      body.add(ribbon);
    }
    const emblem = part(new THREE.ShapeGeometry(starShape(0.07 * H)), trim, 0);
    emblem.position.set(0, 0.62 * H, 0.235 * H);
    body.add(emblem);
    body.position.y = -0.6 * H;
    g.userData.below = 0.6 * H;
  } else if (kind === 'shield') {
    // A round shield with a raised rim and a star in the middle, held up by its sides.
    const R = (gold ? 0.3 : 0.26) * u;
    const disc = part(new THREE.CylinderGeometry(R, R, 0.05 * R, 32), metal);
    disc.rotation.x = Math.PI / 2;
    body.add(disc);
    const rim = part(new THREE.TorusGeometry(R, 0.06 * R, 8, 32), trim, 0);
    body.add(rim);
    const inner = part(new THREE.TorusGeometry(R * 0.68, 0.035 * R, 6, 32), trim, 0);
    inner.position.z = 0.03 * R;
    body.add(inner);
    const star = part(new THREE.ExtrudeGeometry(starShape(0.42 * R), { depth: 0.06 * R, bevelEnabled: false }), trim, 0.006);
    star.position.z = 0.03 * R;
    body.add(star);
    g.userData.below = 1.06 * R;
  } else {
    // The Acorn League's trophy: a chunky gold star on a little stand.
    const S = 0.42 * u;
    const base = part(new THREE.CylinderGeometry(0.16 * S, 0.2 * S, 0.12 * S, 16), '#1b2a41');
    base.position.y = 0.06 * S;
    const stem = part(new THREE.CylinderGeometry(0.05 * S, 0.07 * S, 0.3 * S, 10), metal);
    stem.position.y = 0.27 * S;
    const star = part(new THREE.ExtrudeGeometry(starShape(0.32 * S), { depth: 0.1 * S, bevelEnabled: true, bevelSize: 0.02 * S, bevelThickness: 0.02 * S, bevelSegments: 1 }), metal);
    star.position.set(0, 0.68 * S, -0.05 * S);
    body.add(base, stem, star);
    body.position.y = -0.25 * S;
    g.userData.below = 0.25 * S;
  }
  // A few glints that twinkle on the metal.
  const glintMat = new THREE.SpriteMaterial({ map: softDot(), color: 0xffffff, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, toneMapped: false });
  for (let i = 0; i < 3; i++) {
    const s = new THREE.Sprite(glintMat.clone());
    s.position.set((i - 1) * 0.08 * u, (0.05 + 0.07 * i) * u * (kind === 'star' ? 1.5 : 1), 0.1 * u);
    s.scale.setScalar(0.12 * u);
    s.name = 'glint';
    g.add(s);
  }
  glintMat.dispose();
  return g;
}

/** A two-step round podium in the level's colour with a gold rim. Returns it and the height of its top. */
function buildPodium(u: number, level: TrophyLevel): { group: THREE.Group; top: number } {
  const g = new THREE.Group();
  const colour = PODIUM[level - 1];
  const step = 0.13 * u;
  const low = part(new THREE.CylinderGeometry(0.95 * u, 1.0 * u, step, 32), colour, 0.02);
  low.position.y = step / 2;
  const high = part(new THREE.CylinderGeometry(0.62 * u, 0.66 * u, step, 32), colour, 0.02);
  high.position.y = step * 1.5;
  const rim1 = part(new THREE.TorusGeometry(0.95 * u, 0.02 * u, 6, 40), GOLD, 0);
  rim1.rotation.x = Math.PI / 2;
  rim1.position.y = step;
  const rim2 = part(new THREE.TorusGeometry(0.62 * u, 0.02 * u, 6, 40), GOLD, 0);
  rim2.rotation.x = Math.PI / 2;
  rim2.position.y = step * 2;
  for (const m of [low, high]) m.receiveShadow = true;
  g.add(low, high, rim1, rim2);
  return { group: g, top: step * 2 };
}

/** A soft beam of light's glow: bright at the foot, fading out up the sky. Made once, shared by every beam. */
let beamTex: THREE.CanvasTexture | null = null;
function beamTexture(): THREE.CanvasTexture {
  if (beamTex) return beamTex;
  const c = document.createElement('canvas');
  c.width = 8; c.height = 128;
  const ctx = c.getContext('2d')!;
  const grad = ctx.createLinearGradient(0, 0, 0, 128);
  grad.addColorStop(0, 'rgba(0,0,0,1)');
  grad.addColorStop(1, 'rgba(255,255,255,1)');
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, 8, 128);
  beamTex = shared(new THREE.CanvasTexture(c));
  beamTex.colorSpace = THREE.SRGBColorSpace;
  return beamTex;
}

/** Fireworks colours: the winners' shirts (unless too dark to glow), gold and white. */
function fireworkColours(colours: [string, string]): THREE.Color[] {
  const out = colours.map((c) => new THREE.Color(c)).filter((c) => c.getHSL({ h: 0, s: 0, l: 0 }).l > 0.25);
  out.push(new THREE.Color(GOLD), new THREE.Color('#ffffff'));
  return out;
}

export class Ceremony {
  readonly group = new THREE.Group();
  readonly fireworks: Fireworks;
  readonly show: Show;
  /** Seconds since the final whistle's ceremony began. */
  t = 0;
  /** When the lifter hops up, picks the trophy up, starts to raise it, and holds it high; and when the full-time card comes. */
  readonly gatherEnd: number;
  readonly raiseAt: number;
  readonly peak: number;
  readonly duration: number;
  /** Called once as the trophy goes up (the roar), on every burst (a bang), and as the stadium dims (0..1). */
  onPeak: (() => void) | null = null;
  onDusk: ((k: number) => void) | null = null;

  private readonly u: number;
  private readonly zP: number;
  private readonly topY: number;
  private readonly trophy: THREE.Group;
  private readonly restAt: THREE.Vector3;
  private readonly halo: THREE.Sprite;
  private readonly beams: THREE.Mesh[] = [];
  private readonly targets = new Map<PlayerModel, THREE.Vector3>();
  private readonly cheerDelay = new Map<PlayerModel, number>();
  private readonly colours: THREE.Color[];
  private readonly gold = new THREE.Color(GOLD);
  private readonly stand: ReturnType<typeof standLayout>;
  private peaked = false;
  private nextRocket = 0;
  private volleyLeft = 0;
  private flashDue = 0;
  private readonly camFrom = new THREE.Vector3();
  private readonly lookFrom = new THREE.Vector3();
  private readonly hands = new THREE.Vector3();

  constructor(readonly win: TrophyWin, private readonly cast: CeremonyCast, private readonly o: CeremonyOptions, camera: THREE.Camera, look: THREE.Vector3) {
    this.show = SHOWS[win.level];
    const u = kidHeight(o.scale);
    this.u = u;
    this.stand = standLayout(o.length, o.width);
    // In front of the main stand, just inside the far touchline, where the camera can look up at it with the fans behind.
    this.zP = -o.width / 2 + 1.25 * u;
    const gather = o.calm ? 2.0 : 2.6;
    this.gatherEnd = gather;
    this.raiseAt = gather + 0.7;
    this.peak = this.raiseAt + 0.6;
    this.duration = this.peak + (o.calm ? 3.5 : this.show.hold);

    const podium = buildPodium(u, win.level);
    podium.group.position.set(0, 0, this.zP);
    this.topY = podium.top;
    this.group.add(podium.group);
    this.trophy = buildTrophy(win.kind, win.gold, u, o.colours);
    this.restAt = new THREE.Vector3(0, this.topY + 0.32 * u, this.zP + 0.38 * u);
    this.trophy.position.copy(this.restAt);
    this.group.add(this.trophy);
    this.halo = new THREE.Sprite(new THREE.SpriteMaterial({ map: softDot(), color: GOLD, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, toneMapped: false, opacity: 0 }));
    this.halo.scale.setScalar(1.6 * u);
    this.group.add(this.halo);

    this.fireworks = new Fireworks(1, o.lite);
    this.group.add(this.fireworks.group);
    this.colours = fireworkColours(o.colours);

    // Line the winners up either side of the podium, alternating sides, the subs at the ends.
    cast.mates.forEach((m, i) => {
      const side = i % 2 ? 1 : -1, slot = Math.floor(i / 2);
      this.targets.set(m, new THREE.Vector3(side * (1.1 + slot * 0.62) * u, 0, this.zP + (0.2 + slot * 0.14) * u));
      this.cheerDelay.set(m, Math.random() * 0.5);
    });
    this.targets.set(cast.lifter, new THREE.Vector3(0, 0, this.zP + 1.05 * u));
    // The other team spread out along the near touchline, behind the camera.
    cast.losers.forEach((m, i) => {
      const n = cast.losers.length;
      this.targets.set(m, new THREE.Vector3((i - (n - 1) / 2) * 1.1 * u, 0, o.width / 2 - 0.6 * u));
    });
    for (const m of [cast.lifter, ...cast.mates, ...cast.losers]) m.showTeamRing(false);

    if (!o.calm) {
      const lay = this.stand;
      for (let i = 0; i < this.show.fountains; i++) {
        const side = i % 2 ? 1 : -1, slot = Math.floor(i / 2);
        this.fireworks.fountain(side * (1.6 + slot * 1.7) * u, this.zP - 0.7 * u, i % 4 < 2 ? this.gold : this.colours[0], o.lite ? 25 : 45, 1.6 * u);
      }
      for (let i = 0; i < this.show.beams; i++) {
        const geo = new THREE.CylinderGeometry(2.4, 0.25, 30, 16, 1, true);
        geo.translate(0, 15, 0);
        const beam = new THREE.Mesh(geo, new THREE.MeshBasicMaterial({ map: beamTexture(), color: i % 2 ? 0xfff2c0 : 0xc8e8ff, transparent: true, opacity: 0.32, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide, toneMapped: false, fog: false }));
        const side = i % 2 ? 1 : -1;
        beam.position.set(side * (2.5 + Math.floor(i / 2) * 5) * (o.length / 34), lay.roofY + 0.4, lay.z0 - lay.rows * lay.rowDepth - 0.5);
        beam.userData.phase = i * 1.3;
        this.beams.push(beam);
        this.group.add(beam);
      }
    }
    this.camFrom.copy(camera.position);
    this.lookFrom.copy(look);
  }

  /** The kids' shared animation state for this moment. */
  private anim(speed: number, mood: AnimState['mood'], extra: Partial<AnimState> = {}): AnimState {
    return { speed, kick: 0, dive: 0, diveDir: 1, stun: 0, tackle: 0, scale: this.o.scale, wobble: 0, mood, gazeX: 0, gazeY: 0, cheer: false, celebrate: 'huddle', celebrateT: this.t, ...extra };
  }

  /** Jog towards a spot; past the gathering time anyone still on the way is simply there (the camera is on the podium). */
  private walk(m: PlayerModel, to: THREE.Vector3, dt: number, pace = 1): number {
    const p = m.group.position;
    const dx = to.x - p.x, dz = to.z - p.z, d = Math.hypot(dx, dz);
    if (d < 0.05 || this.t > this.gatherEnd) { p.set(to.x, to.y, to.z); return 0; }
    const speed = (3.4 * this.o.scale + 1) * pace;
    const step = Math.min(d, speed * dt);
    p.x += (dx / d) * step; p.z += (dz / d) * step;
    m.setFacing(Math.atan2(dz, dx));
    return step / Math.max(dt, 1e-3);
  }

  /** "Lift it again": the camera cuts to the team by the podium, and the lifter hops up and raises the trophy once more. */
  restart(): void {
    this.t = this.gatherEnd;
    this.peaked = false;
  }

  /** Jump to the trophy held high (a tap during the ceremony). */
  skip(): void {
    if (this.t < this.peak) {
      this.t = this.peak;
      this.fireNow();
    }
    this.t = Math.max(this.t, this.duration);
  }

  get finished(): boolean { return this.t >= this.duration; }

  private fireNow(): void {
    if (this.peaked) return;
    this.peaked = true;
    this.volleyLeft = this.o.calm ? Math.min(3, this.show.volley) : this.show.volley;
    this.nextRocket = 0;
    this.onPeak?.();
  }

  private wideShot(camera: THREE.Camera): THREE.Vector3 {
    const portrait = (camera as THREE.PerspectiveCamera).aspect < 0.9;
    const d = (portrait ? 6.5 : 4.4) * this.u + 2;
    return new THREE.Vector3(0, 1.4 * this.u + 1, this.zP + d);
  }

  update(dt: number, camera: THREE.PerspectiveCamera): void {
    this.t += dt;
    const t = this.t, u = this.u;
    const { lifter, mates, losers, loserKeepers } = this.cast;

    // The winners jog over and line up facing the camera, then jump for joy as the trophy goes up.
    for (const m of mates) {
      const speed = this.walk(m, this.targets.get(m)!, dt);
      if (speed === 0) m.setFacing(Math.PI / 2);
      const cheer = t > this.peak + (this.cheerDelay.get(m) ?? 0);
      m.animate(dt, this.anim(speed, 'happy', { cheer }));
    }
    // The lifter: over to the podium, a hop up on to it, pick up the trophy and lift it high.
    let lift: number | undefined;
    if (t < this.gatherEnd) {
      const speed = this.walk(lifter, this.targets.get(lifter)!, dt);
      if (speed === 0) lifter.setFacing(Math.PI / 2);
      lifter.animate(dt, this.anim(speed, 'happy'));
    } else {
      const hop = smooth((t - this.gatherEnd) / 0.35);
      const front = this.targets.get(lifter)!;
      lifter.group.position.set(0, this.topY * hop + Math.sin(hop * Math.PI) * 0.25 * u, THREE.MathUtils.lerp(front.z, this.zP - 0.1 * u, hop));
      lifter.setFacing(Math.PI / 2);
      if (t >= this.gatherEnd + 0.35) {
        const up = smooth((t - this.raiseAt) / (this.peak - this.raiseAt));
        // Held high, bobbing up and down with joy.
        lift = t < this.peak ? up : 0.86 + 0.14 * Math.sin((t - this.peak) * 5);
      }
      lifter.animate(dt, this.anim(0, 'happy', lift === undefined ? {} : { trophy: lift }));
    }
    // In the lifter's hands once picked up; until then waiting on the podium.
    if (lift !== undefined && lifter.handsAt(this.hands)) {
      // Little arms only just reach past a big head, so the trophy rides up from in front of the chest to
      // sit just over the head, between the hands.
      const over = lifter.group.position.y + 0.97 * u + (this.trophy.userData.below as number ?? 0.2 * u);
      this.hands.z += 0.2 * u * (1 - lift);
      this.hands.y = THREE.MathUtils.lerp(this.hands.y, Math.max(this.hands.y, over), lift);
      const pick = smooth((t - this.gatherEnd - 0.35) / 0.3);
      this.trophy.position.lerpVectors(this.restAt, this.hands, pick);
      this.trophy.rotation.z = lift > 0.8 ? 0.06 * Math.sin((t - this.peak) * 5) : 0;
    } else {
      this.trophy.position.copy(this.restAt);
      this.trophy.rotation.z = 0;
    }
    for (const r of this.trophy.children) if (r.name === 'ribbon') r.rotation.z = 0.25 * Math.sin(t * 7 + r.position.x);
    this.trophy.traverse((o) => {
      if (o.name === 'glint') (((o as THREE.Sprite).material) as THREE.SpriteMaterial).opacity = Math.max(0, Math.sin(t * 3.1 + o.position.x * 40)) * 0.9;
    });
    const glow = smooth((t - this.raiseAt) / 0.8);
    this.halo.position.copy(this.trophy.position);
    (this.halo.material as THREE.SpriteMaterial).opacity = glow * (0.35 + 0.1 * this.trophy.position.y / Math.max(1, u * 3)) * (0.5 + 0.1 * this.o.scale + 0.08 * this.win.level);

    // The other team: heads down for a moment (the keeper sits on the grass), then they stand and watch.
    // The other team: heads down, they walk off to the near touchline (out of the camera's way) and turn to
    // watch; their keeper sits on the grass for a moment first.
    for (const m of losers) {
      const keeper = loserKeepers.includes(m);
      const sitting = keeper && t < 2.2;
      const speed = sitting ? 0 : this.walk(m, this.targets.get(m)!, dt, 1.6);
      if (speed === 0 && !sitting) m.setFacing(Math.atan2(this.zP - m.group.position.z, -m.group.position.x));
      const sad = t < 5;
      m.animate(dt, this.anim(speed, sad ? 'sad' : 'neutral', { celebrate: sitting ? 'sit' : sad ? 'slump' : null, celebrateT: t + 1 }));
    }

    if (t >= this.peak - 0.25) this.fireNow();
    this.updateFireworks(dt, camera);
    this.updateBeams();
    if (this.show.dusk && !this.o.night) this.onDusk?.(smooth((t - 0.5) / 2.5));
    this.updateCamera(camera);
  }

  private updateFireworks(dt: number, camera: THREE.PerspectiveCamera): void {
    const s = this.show, t = this.t, calm = this.o.calm;
    this.nextRocket -= dt;
    // The top two levels start the show while the team gathers.
    const early = !this.peaked && this.win.level >= 4 && t > 0.6;
    if ((this.peaked || early) && this.nextRocket <= 0) {
      const every = calm ? s.every * 2 : s.every;
      if (this.volleyLeft > 0) { this.volleyLeft--; this.nextRocket = 0.1 + Math.random() * 0.08; } else this.nextRocket = (early ? every * 2 : every * (this.finished ? 1.6 : 1)) * (0.7 + Math.random() * 0.6);
      this.launch(camera);
    }
    // Camera flashes popping in the stand.
    if (this.peaked && !calm && s.flashes > 0) {
      this.flashDue += s.flashes * dt;
      const lay = this.stand;
      while (this.flashDue >= 1) {
        this.flashDue -= 1;
        const r = Math.random() * lay.rows;
        this.fireworks.flash((Math.random() - 0.5) * lay.len * 0.9, lay.baseHeight + r * lay.rowRise + 0.9, lay.z0 - r * lay.rowDepth);
      }
    }
    this.fireworks.update(dt);
  }

  /** One rocket from behind the main stand, aimed into the part of the sky the camera can see. */
  private launch(camera: THREE.PerspectiveCamera): void {
    const s = this.show, lay = this.stand;
    const z = lay.z0 - lay.rows * lay.rowDepth - 1.5 - Math.random() * 2;
    const dist = Math.max(4, camera.position.z - z);
    const half = Math.tan(THREE.MathUtils.degToRad(camera.fov / 2)) * camera.aspect * dist * 0.7;
    const x = camera.position.x * 0.5 + (Math.random() * 2 - 1) * half;
    const y = 5.5 + Math.random() * 4 + Math.max(0, this.u - 1.2) * 2;
    const style = s.styles[Math.floor(Math.random() * s.styles.length)];
    const colours = style === 'willow' ? [this.gold] : [this.colours[Math.floor(Math.random() * this.colours.length)], this.colours[Math.floor(Math.random() * this.colours.length)]];
    const count = Math.round(s.sparks * (this.o.lite ? 0.6 : 1) * (this.o.calm ? 0.6 : 1));
    this.fireworks.rocket(x, z, y, colours, style, count, s.radius * (0.85 + Math.random() * 0.3));
  }

  private updateBeams(): void {
    const on = smooth((this.t - this.raiseAt) / 1.2);
    for (const b of this.beams) {
      const ph = b.userData.phase as number;
      b.rotation.z = 0.35 * Math.sin(this.t * 0.55 + ph);
      b.rotation.x = 0.25 + 0.08 * Math.sin(this.t * 0.4 + ph * 2);
      (b.material as THREE.MeshBasicMaterial).opacity = 0.3 * on;
    }
  }

  /** From the match camera out to a wide shot of the team gathering, then in low on the lifter, swinging slowly round. */
  private updateCamera(camera: THREE.PerspectiveCamera): void {
    const t = this.t, u = this.u;
    const portrait = camera.aspect < 0.9;
    if (Math.abs(camera.fov - 50) > 0.01) { camera.fov = 50; camera.updateProjectionMatrix(); }
    const wide = this.wideShot(camera);
    const wideLook = new THREE.Vector3(0, 0.5 * u, this.zP);
    const a = this.o.calm ? 0 : 0.32 * Math.sin(0.3 * Math.max(0, t - this.gatherEnd) - 1.2);
    const R = (portrait ? 5.4 : 3.5) * u + 1;
    const close = new THREE.Vector3(Math.sin(a) * R, 0.55 * u + 0.5, this.zP + Math.cos(a) * R);
    const closeLook = new THREE.Vector3(0, 1.45 * u + 0.6, this.zP);
    const pos = new THREE.Vector3(), look = new THREE.Vector3();
    if (t < this.gatherEnd) {
      const k = smooth(t / 1.2);
      pos.lerpVectors(this.camFrom, wide, k);
      look.lerpVectors(this.lookFrom, wideLook, k);
    } else {
      const k = smooth((t - this.gatherEnd) / 1.3);
      pos.lerpVectors(wide, close, k);
      look.lerpVectors(wideLook, closeLook, k);
    }
    camera.position.copy(pos);
    camera.lookAt(look);
  }

  dispose(): void {
    this.fireworks.clear();
  }
}
