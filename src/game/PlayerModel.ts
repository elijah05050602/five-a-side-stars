import * as THREE from 'three';
import { P1_RING } from './ringColours';
import { getSettings } from '../data/storage';
import type { BootStyle, Build, Kit, Player } from '../data/types';
import { cloneRig, loadPlayerAsset, playerAssetNow, type PlayerAsset } from './playerAsset';
import { contrastColour, numberTexture, playerAtlas } from './playerAtlas';
import { faceTexture, type Expression } from './playerFace';
import { ProceduralPlayerModel } from './ProceduralPlayerModel';
import { DIVE_AIR_SHARE, DRIBBLE_STRIDE, SLIDE_AT, type Celebration, type KickKind, type MoveKind, type TrickKind } from './sim';
import { graphicsProfile } from './graphics';
import { disposeObject, releaseTexture, shared } from './renderer';
import { addOutline, addSkinnedOutline, smoothOutlineNormals, toonMaterial } from './toon';

/** Models are drawn bigger than their physical size so the kids read clearly from the camera. */
export const MODEL_SCALE = 1.35;
/** Height in metres of a scale-1 kid before MODEL_SCALE (matches the old procedural model). */
const BASE_HEIGHT = 1.4;

/** Everything the sim tells a model each frame. */
export interface AnimState {
  /** Ground speed in m/s. */
  speed: number;
  /** 1 right after a kick, fading to 0. */
  kick: number;
  /** 1 at the start of a dive, fading to 0; diveDir is the world z sign. */
  dive: number;
  diveDir: number;
  /** 1 right after being tackled off the ball, fading to 0. */
  stun: number;
  /** Seconds left on this kid's own tackle attempt (0 = not tackling). */
  tackle: number;
  /** Age-group scale, so strides and hops match the kid's size. */
  scale: number;
  /** 0..1 how wobbly the little ones run. */
  wobble: number;
  /** The face to pull, and where the eyes look (quantised -1..1). */
  mood: Expression;
  gazeX: number;
  gazeY: number;
  /** Jump for joy (goal celebration). */
  cheer: boolean;
  /** A keeper getting up after a dive: 1 as they start, falling to 0 when back on their feet. */
  recover?: number;
  /** Sideways speed across the kid's body in m/s (positive = to their right), for a keeper's shuffle. */
  strafe?: number;
  /** On the ball and running with it (eyes down, a little hunched over it). */
  dribble?: boolean;
  /** A skill move: which one, 1 as it starts fading to 0, which way it goes across the body (-1 or 1), and the way the kid was heading when it began. */
  trick?: TrickKind | null;
  trickT?: number;
  trickDir?: number;
  trickFrom?: number;
  /** While a goal stands: this kid's celebration (or gloom), and seconds since the goal. */
  celebrate?: Celebration | null;
  celebrateT?: number;
  /** A one-off move (keeper handling, a header, a first touch off a high ball): 1 as it starts, fading to 0. */
  move?: MoveKind | null;
  moveAnim?: number;
  /** A keeper with the ball in their hands, held out in front. */
  hold?: boolean;
  /** What the last kick was (a shot is a big swing, a pass a quick side-foot, a lob a scoop). */
  kickKind?: KickKind;
  /** 0..1 while the shoot button is held: the kicking leg draws back. */
  charge?: number;
  /** Waiting for the kick-off: up on the toes. */
  ready?: boolean;
  /** Holding the ball over the head for a throw-in. */
  throwIn?: boolean;
  /** Calling for a pass: an arm up in the air. */
  call?: boolean;
  /** Holding a trophy in both hands: 0 in front of the chest, 1 lifted high over the head. */
  trophy?: number;
}

export const IDLE_STATE: AnimState = { speed: 0, kick: 0, dive: 0, diveDir: 1, stun: 0, tackle: 0, scale: 1, wobble: 0, mood: 'neutral', gazeX: 0, gazeY: 0, cheer: false };

/**
 * Where an elastico has the ball across the body over the move (0..1): out to one side, snapped across to the
 * other, then back under the feet. Matches MatchSim.trickBallOffset, so the foot is on the ball.
 */
function elasticoShape(u: number): number {
  const s = THREE.MathUtils.smoothstep;
  return u < 0.4 ? Math.sin((u / 0.4) * Math.PI * 0.5) : u < 0.6 ? 1 - 2 * s(u, 0.4, 0.6) : -1 + s(u, 0.6, 1);
}

let shadowTex: THREE.CanvasTexture | null = null;
/** A soft contact shadow: dark in the middle, fading out, so kids sit on the grass. */
function shadowTexture(): THREE.CanvasTexture {
  if (shadowTex) return shadowTex;
  const c = document.createElement('canvas');
  c.width = 128; c.height = 128;
  const ctx = c.getContext('2d')!;
  const g = ctx.createRadialGradient(64, 64, 10, 64, 64, 64);
  g.addColorStop(0, 'rgba(10,25,40,0.42)');
  g.addColorStop(0.55, 'rgba(10,25,40,0.22)');
  g.addColorStop(1, 'rgba(10,25,40,0)');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, 128, 128);
  shadowTex = shared(new THREE.CanvasTexture(c));
  // The canvas holds sRGB colours like every other painted texture.
  shadowTex.colorSpace = THREE.SRGBColorSpace;
  return shadowTex;
}
/** A gold star with a dark rim, painted once and shared by every career Star's badge. */
let starTex: THREE.CanvasTexture | null = null;
function starTexture(): THREE.CanvasTexture {
  if (starTex) return starTex;
  const c = document.createElement('canvas');
  c.width = 128; c.height = 128;
  const ctx = c.getContext('2d')!;
  ctx.beginPath();
  for (let i = 0; i < 10; i++) {
    const r = i % 2 ? 26 : 58, a = -Math.PI / 2 + (i * Math.PI) / 5;
    ctx.lineTo(64 + r * Math.cos(a), 66 + r * Math.sin(a));
  }
  ctx.closePath();
  ctx.lineJoin = 'round';
  ctx.lineWidth = 9;
  ctx.strokeStyle = '#7a4a00';
  ctx.stroke();
  ctx.fillStyle = '#ffd23f';
  ctx.fill();
  starTex = shared(new THREE.CanvasTexture(c));
  starTex.colorSpace = THREE.SRGBColorSpace;
  return starTex;
}

const shadowGeo = shared(new THREE.PlaneGeometry(1.25, 1.0));
const plateGeo = shared(new THREE.PlaneGeometry(0.44, 0.44));

type Loco = 'idle' | 'walk' | 'run' | 'cheer';
type Head = 'Head_plain' | 'Head_short' | 'Head_long';
const HEAD_FOR: Record<Player['hairStyle'], Head> = { short: 'Head_plain', spiky: 'Head_short', long: 'Head_long', curly: 'Head_plain', afro: 'Head_short', buns: 'Head_short', bald: 'Head_short' };
/** Body shapes as (width, height, depth) multipliers on the rig. */
const BUILD_SCALE: Record<Build, [number, number, number]> = { small: [0.9, 0.88, 0.9], regular: [1, 1, 1], tall: [0.96, 1.1, 0.96], sturdy: [1.12, 0.97, 1.12] };

/** Rolled onto their side, the kid's body pivots at the feet, so it is raised this much to lie on the grass rather than in it. */
const LYING_LIFT = 0.3;
/** Seconds a dribbling tap takes. */
const TAP_TIME = 0.2;
/** Time in Running_B when the right foot swings through under the body. */
const RUN_RIGHT_THROUGH = 0.35;
/** How far a kneeling kid sinks (the shin length), as a share of their scale. */
const KNEEL_DROP = 0.17;
/** Seconds each kind of kick takes, swing and follow-through. */
const KICK_TIME: Record<KickKind, number> = { pass: 0.3, shot: 0.45, lob: 0.42, boot: 0.5 };
/** How high the kicking leg swings through after the ball, in radians from straight down. */
const KICK_SWING: Record<KickKind, number> = { pass: 0.95, shot: 1.55, lob: 1.25, boot: 1.75 };

const UP = new THREE.Vector3(0, 1, 0);
const wrapAngle = (a: number): number => Math.atan2(Math.sin(a), Math.cos(a));

/**
 * A rigged, animated kid (CC0 KayKit character, see public/models/LICENSE.md)
 * painted with the team kit and a face that reacts to the play.
 * Local +x is "forward"; call setFacing(yaw).
 * Until the model file arrives nothing is drawn; if it fails to load, the old
 * procedural kid takes over so the game still plays.
 */
/** Calm motion: the selection ring holds still. */
const CALM = () => getSettings().reduceMotion;

export class PlayerModel {
  readonly group = new THREE.Group();
  private readonly body = new THREE.Group();
  private readonly ring: THREE.Mesh;
  /** Always-on ring in the team's colour, so sides are easy to tell apart from above. */
  private readonly teamRing: THREE.Mesh;
  /** Bobbing arrow over the controlled player's head. */
  private readonly marker: THREE.Mesh;
  private readonly shadow: THREE.Mesh;
  private readonly baseScale: number;
  private markerT = 0;
  private readonly material: THREE.MeshToonMaterial;
  private readonly faceMat: THREE.MeshToonMaterial;
  private readonly hairMat: THREE.MeshToonMaterial;
  private rig: THREE.Group | null = null;
  private rigScale = 1;
  private mixer: THREE.AnimationMixer | null = null;
  private actions = new Map<string, THREE.AnimationAction>();
  private heads = new Map<Head, THREE.Object3D>();
  private hairAcc: THREE.Group | null = null;
  private plate: THREE.Mesh | null = null;
  /** Gold star over a career Star's head (see setStar). */
  private starBadge: THREE.Sprite | null = null;
  private fallback: ProceduralPlayerModel | null = null;
  private disposed = false;

  private kit: Kit;
  private number: number;
  private skin: string;
  private hair: string;
  private boots: string;
  private bootStyle: BootStyle;
  private hairStyle: Player['hairStyle'];
  private build: Build;
  private readonly isKeeper: boolean;
  private readonly scale: number;

  private loco: Loco = 'idle';
  private oneShot: THREE.AnimationAction | null = null;
  private wasStepping = false;
  private lastKick = 0;
  /** Seconds left on a dribbling tap with the right foot (a small push, not a full kick). */
  private tap = 0;
  /** Which foot the current tap is with (1 = right). */
  private tapSide = 1;
  private wasDiving = false;
  private wasStunned = false;
  private wasTackling = false;
  private wasCommitted = false;
  /** Which way the current dive goes across the kid's body (1 = their right). */
  private diveSide = 1;
  private shuffleT = 0;
  private legL: THREE.Object3D | null = null;
  private legR: THREE.Object3D | null = null;
  private armL: THREE.Object3D | null = null;
  private armR: THREE.Object3D | null = null;
  private foreL: THREE.Object3D | null = null;
  private foreR: THREE.Object3D | null = null;
  private shinL: THREE.Object3D | null = null;
  private shinR: THREE.Object3D | null = null;
  private chest: THREE.Object3D | null = null;
  private headBone: THREE.Object3D | null = null;
  private lastMove: MoveKind | null = null;
  private lastMoveAnim = 0;
  private sitting = false;
  private readonly rest: [THREE.Object3D, THREE.Quaternion][] = [];
  private root: THREE.Object3D | null = null;
  private readonly rootRest = new THREE.Vector3();
  private slide = 0;
  /** The current tackle: a slide along the grass when running at it, else a standing poke. */
  private slideFast = false;
  private slideTime = 0.42;
  /** Seconds left on the current kick, and which kind it is. */
  private kickT = 0;
  private kickKind: KickKind = 'pass';
  /** Builds up while sprinting; a tired kid who stops puts their hands on their knees. */
  private fatigue = 0;
  private breath = 0;
  /** Blend weights for the waiting bounce, the throw-in hold, calling for the ball and stepping round on the spot. */
  private readyW = 0;
  private throwW = 0;
  private callW = 0;
  private stepW = 0;
  private stepT = 0;
  /** A sharp turn at speed: plant the outside foot and push off. */
  private turnAcc = 0;
  private plant = 0;
  private plantSide = 1;
  private readonly seed = Math.random() * 10;
  private facing = 0;
  /** Extra yaw on top of the facing while a turn or a spin is drawn (the sim has already turned). */
  private yawOff = 0;
  private turn = 0;
  private lean = 0;
  private faceKey = '';
  private blinkIn = 2 + Math.random() * 4;
  private blinkLeft = 0;

  private lashes = false;
  constructor(private readonly player: Player, kit: Kit, scale: number) {
    this.kit = kit; this.number = player.number; this.skin = player.skin; this.hair = player.hair;
    this.boots = player.boots ?? '#222222'; this.bootStyle = player.bootStyle ?? 'classic'; this.hairStyle = player.hairStyle ?? 'short'; this.build = player.build ?? 'regular';
    this.isKeeper = player.position === 'GK';
    this.scale = scale;
    // Yaw first, so roll (x) and pitch (z) stay about the kid's own forward and side axes whichever way they face.
    this.body.rotation.order = 'YXZ';
    this.material = toonMaterial({ map: this.atlas() });
    this.lashes = player.gender === 'girl';
    this.faceMat = toonMaterial({ map: faceTexture(this.skin, 'neutral', 0, 0, this.hair, this.lashes) });
    this.hairMat = toonMaterial({ color: this.hair });

    const s = scale * MODEL_SCALE;
    this.baseScale = s;
    const shadow = new THREE.Mesh(shadowGeo, new THREE.MeshBasicMaterial({ map: shadowTexture(), transparent: true, depthWrite: false }));
    shadow.rotation.x = -Math.PI / 2;
    shadow.position.y = 0.012;
    shadow.scale.setScalar(s);
    shadow.renderOrder = -1;
    this.shadow = shadow;
    // The team ring is thin and soft: it only says which side someone is on.
    this.teamRing = new THREE.Mesh(new THREE.RingGeometry(0.43, 0.49, 32), new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.6, depthWrite: false }));
    this.teamRing.rotation.x = -Math.PI / 2;
    this.teamRing.position.y = 0.016;
    this.teamRing.scale.setScalar(s);
    // The controlled player's ring: thick and bright with a thin dark edge, pulsing gently, outside the team ring.
    this.ring = new THREE.Mesh(new THREE.RingGeometry(0.54, 0.78, 40), new THREE.MeshBasicMaterial({ color: P1_RING, transparent: true, opacity: 1, depthWrite: false }));
    const edge = new THREE.Mesh(new THREE.RingGeometry(0.5, 0.82, 40), new THREE.MeshBasicMaterial({ color: 0x1b2a41, transparent: true, opacity: 0.85, depthWrite: false }));
    edge.position.z = 0.004;
    this.ring.add(edge);
    this.ring.rotation.x = -Math.PI / 2;
    this.ring.position.y = 0.02;
    this.ring.scale.setScalar(s);
    this.ring.visible = false;
    this.marker = new THREE.Mesh(new THREE.ConeGeometry(0.17, 0.3, 4), new THREE.MeshBasicMaterial({ color: P1_RING }));
    this.marker.rotation.x = Math.PI;
    this.marker.position.y = 1.95 * s;
    this.marker.scale.setScalar(s);
    this.marker.visible = false;
    this.group.add(shadow, this.teamRing, this.ring, this.marker, this.body);

    const ready = playerAssetNow();
    if (ready) this.buildRig(ready);
    else loadPlayerAsset().then((a) => { if (!this.disposed) this.buildRig(a); }).catch(() => { if (!this.disposed) this.useFallback(); });
  }

  private atlas(): THREE.CanvasTexture {
    const bald = this.hairStyle === 'bald' || this.hairStyle === 'afro';
    return playerAtlas(this.kit, { skin: this.skin, hair: this.hair, boots: this.boots, bootStyle: this.bootStyle, bald });
  }

  private buildRig(asset: PlayerAsset): void {
    const rig = cloneRig(asset);
    // The clone's geometry (and the file's own materials) belong to the loaded model, which every kid shares.
    rig.traverse((o) => {
      const m = o as THREE.Mesh;
      if (!m.isMesh) return;
      shared(m.geometry);
      for (const mat of Array.isArray(m.material) ? m.material : [m.material]) shared(mat);
    });
    // The file faces +z; the game treats local +x as forward.
    rig.rotation.y = Math.PI / 2;
    this.rigScale = (this.scale * MODEL_SCALE * BASE_HEIGHT) / asset.height;
    this.rig = rig;
    this.applyBuild();
    // Collect first: the outline is itself a skinned child, and traverse would walk into it.
    const skinned: THREE.SkinnedMesh[] = [];
    rig.traverse((o) => { if ((o as THREE.SkinnedMesh).isSkinnedMesh) skinned.push(o as THREE.SkinnedMesh); });
    smoothOutlineNormals(skinned);
    for (const m of skinned) {
      const isFace = (m.material as THREE.Material).name === 'face';
      m.material = isFace ? this.faceMat : this.material;
      m.castShadow = true;
      m.receiveShadow = false;
      m.frustumCulled = false;
      if (graphicsProfile().playerOutlines) addSkinnedOutline(m, 0.028);
    }
    for (const name of ['Head_plain', 'Head_short', 'Head_long'] as Head[]) {
      const node = rig.getObjectByName(name);
      if (node) this.heads.set(name, node);
    }
    this.body.add(rig);
    this.applyHead();

    // Shirt number on a little plate that rides on the chest bone.
    const chest = rig.getObjectByName('chest');
    if (chest) {
      this.plate = new THREE.Mesh(plateGeo, new THREE.MeshBasicMaterial({ map: numberTexture(this.number, contrastColour(this.kit.shirt)), transparent: true, depthWrite: false }));
      this.plate.position.set(0, 0.02, -0.4);
      this.plate.rotation.y = Math.PI;
      chest.add(this.plate);
    }

    const mixer = new THREE.AnimationMixer(rig);
    this.mixer = mixer;
    asset.clips.forEach((clip, name) => this.actions.set(name, mixer.clipAction(clip)));
    const idle = this.actions.get('Idle');
    if (idle) { idle.play(); idle.time = Math.random() * idle.getClip().duration; }
    this.loco = 'idle';
    // Held one-shots (a keeper's dive) stay on their last frame until the sim says the dive is over.
    mixer.addEventListener('finished', (e) => { if (e.action === this.oneShot && !e.action.clampWhenFinished) this.endOneShot(); });
    this.legL = rig.getObjectByName('upperlegl') ?? null;
    this.legR = rig.getObjectByName('upperlegr') ?? null;
    this.armL = rig.getObjectByName('upperarml') ?? null;
    this.armR = rig.getObjectByName('upperarmr') ?? null;
    this.foreL = rig.getObjectByName('lowerarml') ?? null;
    this.foreR = rig.getObjectByName('lowerarmr') ?? null;
    this.shinL = rig.getObjectByName('lowerlegl') ?? null;
    this.shinR = rig.getObjectByName('lowerlegr') ?? null;
    this.chest = rig.getObjectByName('chest') ?? null;
    this.headBone = rig.getObjectByName('head') ?? null;
    // Bones the procedural layer bends. Clips that do not key one would let the bends pile up, so each frame starts from rest.
    for (const b of [this.legL, this.legR, this.shinL, this.shinR, this.armL, this.armR, this.foreL, this.foreR, this.chest, this.headBone]) if (b) this.rest.push([b, b.quaternion.clone()]);
    this.root = rig.getObjectByName('root') ?? null;
    if (this.root) this.rootRest.copy(this.root.position);
    this.setFacing(this.facing);
  }

  private useFallback(): void {
    this.fallback = new ProceduralPlayerModel({ ...this.player, number: this.number, skin: this.skin, hair: this.hair, boots: this.boots, hairStyle: this.hairStyle }, this.kit, this.scale);
    // The fallback has its own shadow; the rings and marker here still apply.
    this.shadow.visible = false;
    this.group.add(this.fallback.group);
    this.fallback.setFacing(this.facing);
  }

  private applyBuild(): void {
    if (!this.rig) return;
    const [w, h, d] = BUILD_SCALE[this.build] ?? BUILD_SCALE.regular;
    // The rig is turned 90 degrees, so its own x is the kid's depth and z the width.
    this.rig.scale.set(this.rigScale * d, this.rigScale * h, this.rigScale * w);
  }

  private applyHead(): void {
    const want = HEAD_FOR[this.hairStyle] ?? 'Head_plain';
    this.heads.forEach((node, name) => { node.visible = name === want; });
    this.buildHairAccessory();
  }

  /** Extra hair pieces (curls, buns, an afro) ride on the head bone over the base head. */
  private buildHairAccessory(): void {
    if (!this.rig) return;
    const headBone = this.rig.getObjectByName('head');
    if (!headBone) return;
    if (!this.hairAcc) { this.hairAcc = new THREE.Group(); headBone.add(this.hairAcc); }
    const g = this.hairAcc;
    while (g.children.length) {
      const c = g.children.pop() as THREE.Mesh;
      c.geometry.dispose();
    }
    const add = (r: number, x: number, y: number, z: number) => {
      const m = new THREE.Mesh(new THREE.SphereGeometry(r, 14, 10), this.hairMat);
      m.position.set(x, y, z);
      m.castShadow = true;
      addOutline(m, 0.03);
      g.add(m);
    };
    switch (this.hairStyle) {
      case 'afro':
        add(0.62, 0, 0.5, -0.06);
        break;
      case 'buns':
        add(0.2, 0.4, 0.78, -0.12);
        add(0.2, -0.4, 0.78, -0.12);
        break;
      case 'curly':
        for (let i = 0; i < 9; i++) {
          const a = (i / 9) * Math.PI * 2;
          add(0.19, Math.cos(a) * 0.42, 0.7 + (i % 2) * 0.12, Math.sin(a) * 0.4 - 0.04);
        }
        add(0.3, 0, 0.9, -0.05);
        break;
      default:
        break;
    }
  }

  setKit(kit: Kit, number: number): void {
    this.kit = kit; this.number = number;
    this.swapMap(this.material, this.atlas());
    if (this.plate) this.swapMap(this.plate.material as THREE.MeshBasicMaterial, numberTexture(number, contrastColour(kit.shirt)));
    this.fallback?.setKit(kit, number);
  }

  /** Put a cached texture on one of this kid's materials and hand back the one it replaces. */
  private swapMap(mat: THREE.MeshToonMaterial | THREE.MeshBasicMaterial, tex: THREE.Texture): void {
    const old = mat.map;
    mat.map = tex;
    mat.needsUpdate = true;
    // Even when it is the same texture: getting it again took a second hold.
    releaseTexture(old);
  }

  /** Girls' faces get eyelashes; the next frame repaints the face. */
  setGender(gender: Player['gender']): void {
    this.lashes = gender === 'girl';
    this.faceKey = '';
  }

  setLook(skin: string, hair: string, hairStyle?: Player['hairStyle'], boots?: string, bootStyle?: BootStyle): void {
    this.skin = skin; this.hair = hair;
    if (boots) this.boots = boots;
    if (bootStyle) this.bootStyle = bootStyle;
    if (hairStyle) this.hairStyle = hairStyle;
    this.swapMap(this.material, this.atlas());
    this.hairMat.color.set(hair);
    this.faceKey = '';
    this.applyHead();
    this.fallback?.setLook(skin, hair, hairStyle, boots);
  }

  setBuild(build: Build): void {
    this.build = build;
    this.applyBuild();
  }

  /** Colour of the always-on ring under the feet (the team's identifying colour). */
  /** Show or hide the team-coloured ring on the grass (hidden for the trophy lift). */
  showTeamRing(on: boolean): void { this.teamRing.visible = on; }

  setTeamColour(colour: THREE.ColorRepresentation): void {
    (this.teamRing.material as THREE.MeshBasicMaterial).color.set(colour);
  }

  /** Mark this player as the career's Star: a gold star floating above their head. */
  setStar(on: boolean): void {
    if (!on) { if (this.starBadge) this.starBadge.visible = false; return; }
    if (!this.starBadge) {
      this.starBadge = new THREE.Sprite(new THREE.SpriteMaterial({ map: starTexture(), depthWrite: false, transparent: true }));
      this.starBadge.scale.setScalar(0.6 * this.baseScale);
      this.starBadge.position.y = 2.5 * this.baseScale;
      this.starBadge.renderOrder = 2;
      this.group.add(this.starBadge);
    }
    this.starBadge.visible = true;
  }

  setSelected(on: boolean, colour?: number): void {
    this.ring.visible = on;
    this.marker.visible = on;
    if (colour !== undefined) { (this.ring.material as THREE.MeshBasicMaterial).color.set(colour); (this.marker.material as THREE.MeshBasicMaterial).color.set(colour); }
  }

  setFacing(yaw: number): void {
    this.turn += wrapAngle(yaw - this.facing);
    this.facing = yaw;
    // Sim yaw is measured in the x/z plane with 0 = +x; Three's rotation.y is anticlockwise about y.
    this.body.rotation.y = -yaw;
    this.fallback?.setFacing(yaw);
  }

  private updateFace(mood: Expression, gazeX: number, gazeY: number, dt: number): void {
    // Blink now and then, unless the face is already doing something bigger.
    this.blinkIn -= dt;
    if (this.blinkIn <= 0) { this.blinkLeft = 0.13; this.blinkIn = 2.5 + Math.random() * 4; }
    if (this.blinkLeft > 0) this.blinkLeft -= dt;
    const expr: Expression = this.blinkLeft > 0 && (mood === 'neutral' || mood === 'focus') ? 'blink' : mood;
    const gx = expr === 'neutral' || expr === 'focus' || expr === 'sad' ? gazeX : 0;
    const gy = expr === 'neutral' || expr === 'focus' ? gazeY : expr === 'sad' ? 1 : 0;
    const key = `${expr}|${gx}|${gy}`;
    if (key === this.faceKey) return;
    this.faceKey = key;
    this.swapMap(this.faceMat, faceTexture(this.skin, expr, gx, gy, this.hair, this.lashes));
  }

  /** Drives the clips and the procedural layer (leans, hops, slides) from the sim state. */
  animate(dt: number, st: AnimState): void {
    if (this.ring.visible) {
      this.markerT += dt;
      const s = this.baseScale;
      this.ring.scale.setScalar(s * (CALM() ? 1 : 1 + 0.05 * Math.sin(this.markerT * 6)));
      this.marker.position.y = s * (1.95 + 0.06 * Math.sin(this.markerT * 5));
      this.marker.rotation.y += dt * 2;
    }
    if (this.fallback) { this.fallback.animate(st.speed, st.kick, st.dive, st.diveDir, dt, st.scale, st.wobble); return; }
    if (!this.mixer) return;
    const scale = Math.max(0.4, st.scale);
    const norm = st.speed / scale;
    this.updateFace(st.mood, st.gazeX, st.gazeY, dt);

    // One-shots: a kick snaps in over the run; a dive plays once and holds; a tackle knocks you.
    // A real kick starts at 1; a dribbling touch only nudges the kick timer up a little.
    const kickStart = st.kick > this.lastKick + 0.05;
    const realKick = kickStart && st.kick > 0.5;
    if (kickStart && !realKick) this.startTap();
    this.lastKick = st.kick;
    const kicking = st.kick > 0.3, diving = st.dive > 0, stunned = st.stun > 0, tackling = st.tackle > 0;
    const trick = (st.trickT ?? 0) > 0 ? st.trick ?? null : null;
    const tu = trick ? 1 - (st.trickT ?? 0) : 0; // 0 → 1 through the skill move
    const tdir = st.trickDir ?? 1;
    const stepping = trick === 'stepover';
    // Step-over: a quick dodge one way over the ball (the clip is played fast so it reads as a feint).
    if (stepping && !this.wasStepping && !kicking && !diving) this.startOneShot(tdir > 0 ? 'Dodge_Right' : 'Dodge_Left', 2.6, false);
    this.wasStepping = stepping;
    // Keeper handling and headers: a scoop off the grass, an overarm throw; a header is a jump, not a kick.
    const move = (st.moveAnim ?? 0) > 0 ? st.move ?? null : null;
    const moveStart = move !== null && (move !== this.lastMove || (st.moveAnim ?? 0) > this.lastMoveAnim + 0.05);
    this.lastMove = move; this.lastMoveAnim = st.moveAnim ?? 0;
    const mu = move ? 1 - (st.moveAnim ?? 0) : 0; // 0 → 1 through the move
    if (moveStart && move === 'scoop') this.startOneShot('PickUp', 2.6, false, 0.15);
    if (moveStart && move === 'throw') this.startOneShot('Throw', 1.8, false, 0.3);
    if (realKick && move !== 'header' && move !== 'throw' && move !== 'throwIn') {
      this.tap = 0;
      this.kickKind = st.kickKind ?? 'pass';
      this.kickT = KICK_TIME[this.kickKind];
    }
    const recovering = (st.recover ?? 0) > 0;
    const committed = diving || (this.isKeeper && recovering);
    if (diving && !this.wasDiving) {
      this.diveSide = st.diveDir * Math.cos(this.facing) > 0 ? 1 : -1;
      this.startOneShot(this.diveSide > 0 ? 'Dodge_Right' : 'Dodge_Left', 1.1, true);
    }
    // The dive pose holds while the keeper lies on the grass and gets up; only then do the feet take over again.
    if (!committed && this.wasCommitted && this.oneShot) this.endOneShot();
    this.wasCommitted = committed;
    if (stunned && !this.wasStunned && !diving) this.startOneShot('Hit_A', 1.4, false);
    // Goal celebrations: the beaten keeper sits down on the grass.
    const cel = st.celebrate ?? null, ct = st.celebrateT ?? 0;
    const kneeling = cel === 'slide' && ct >= SLIDE_AT;
    const sitting = cel === 'sit' && ct > 0.6 && !committed;
    if (sitting && !this.sitting) this.startOneShot('Sit_Floor_Down', 1.3, true);
    if (!sitting && this.sitting && this.oneShot && !committed) this.endOneShot();
    this.sitting = sitting;
    if (tackling && !this.wasTackling && !kicking) {
      this.slideFast = norm > 2.2;
      this.slideTime = this.slideFast ? 0.55 : 0.3;
      this.slide = this.slideTime;
    }
    this.wasDiving = diving; this.wasStunned = stunned; this.wasTackling = tackling;

    // Locomotion from speed; feet speed follows the kid's actual speed.
    // A keeper moving across their goal shuffles side-on in the ready stance instead of running.
    const strafe = this.isKeeper && !committed ? (st.strafe ?? 0) : 0;
    const shuffling = Math.abs(strafe) / scale > 0.35 && Math.abs(strafe) > st.speed * 0.6;
    const want: Loco = kneeling ? 'idle' : st.cheer && norm < 0.8 ? 'cheer' : norm < 0.35 || shuffling ? 'idle' : norm < 2.4 ? 'walk' : 'run';
    if (want !== this.loco) this.switchLoco(want);
    const run = this.actions.get('Running_B'), walk = this.actions.get('Walking_A');
    // Running_B swings each arm with the opposite leg; its stride is longer than Running_A's, so it plays a little faster.
    // Dribbling locks the stride to the touches: one touch per step, each with the foot coming through.
    if (run) run.setEffectiveTimeScale(st.dribble ? run.getClip().duration / (2 * DRIBBLE_STRIDE) : THREE.MathUtils.clamp(norm / 3.4, 1, 2.4));
    if (walk) walk.setEffectiveTimeScale(THREE.MathUtils.clamp(norm / 1.8, cel === 'slump' ? 0.5 : 0.7, 1.5));
    for (const [b, q] of this.rest) b.quaternion.copy(q);
    this.mixer.update(dt);

    // Procedural layer on top of the clips. Body axes: x forward, y up, z the kid's right.
    const turnRate = dt > 0 ? this.turn / dt : 0;
    this.turn = 0;
    const targetLean = THREE.MathUtils.clamp(turnRate * 0.06, -0.35, 0.35) * Math.min(1, norm / 2.5);
    this.lean += (targetLean - this.lean) * Math.min(1, dt * 10);
    let roll = this.lean;
    let pitch = -0.1 * Math.min(1, norm / 4); // lean into the run
    let lift = 0;
    // Little ones run with a wobble: the body sways side to side as they go.
    roll += st.wobble * Math.sin(performance.now() / 180) * 0.12 * Math.min(1, norm / 2);
    if (kicking) lift += 0.07 * scale * Math.sin(st.kick * Math.PI);
    // Dribbling: hunched a little over the ball, watching it.
    if (st.dribble) pitch -= 0.12 * Math.min(1, norm / 2);
    if (stunned) {
      // Knocked off the ball: a wobble and a stumble forward.
      roll += 0.22 * st.stun * Math.sin(st.stun * Math.PI * 3);
      pitch -= 0.35 * Math.sin(st.stun * Math.PI);
    }
    if (stepping) roll += tdir * 0.3 * Math.sin(tu * Math.PI * 2);
    const tk = Math.sin(tu * Math.PI);
    if (trick === 'feint') {
      // Body swerve: a big drop of the shoulder one way, then the other.
      roll += tdir * 0.42 * Math.sin(tu * Math.PI * 2) * (1 - 0.4 * tu);
      lift -= 0.04 * scale * tk;
    } else if (trick === 'elastico') roll += tdir * 0.18 * elasticoShape(tu);
    else if (trick === 'dragback' || trick === 'cruyff') pitch += 0.12 * tk; // sitting back as the ball comes back
    else if (trick === 'roulette') lift += 0.03 * scale * tk;
    else if (trick === 'rainbow') {
      // A little hop off the flick, leaning forward over it.
      const f = Math.sin(THREE.MathUtils.clamp((tu - 0.25) / 0.5, 0, 1) * Math.PI);
      lift += 0.1 * scale * f;
      pitch -= 0.15 * f;
    }
    // Turns are drawn turning: from the way the kid was heading round to the way the sim already faces.
    // A roulette goes the long way round, a full spin with the back to the defender.
    this.yawOff = 0;
    if (trick === 'dragback' || trick === 'cruyff' || trick === 'roulette') {
      const d = wrapAngle((st.trickFrom ?? this.facing) - this.facing);
      const from = trick === 'roulette' ? (Math.abs(d) < 0.3 ? tdir * Math.PI * 2 : d - Math.sign(d) * Math.PI * 2) : d;
      const [a, b] = trick === 'roulette' ? [0.05, 0.85] : trick === 'cruyff' ? [0.35, 0.75] : [0.1, 0.6];
      this.yawOff = from * (1 - THREE.MathUtils.smoothstep(tu, a, b));
    }
    let slideK = 0;
    if (this.slide > 0) {
      // Slide tackle: sit back and drop onto the grass, then spring up. A standing tackle just leans in.
      this.slide = Math.max(0, this.slide - dt);
      slideK = Math.sin((1 - this.slide / this.slideTime) * Math.PI);
      if (this.slideFast) { pitch += 0.85 * slideK; lift -= 0.24 * scale * slideK; }
      else pitch -= 0.15 * slideK;
    }
    // Kicks: a shot leans over the ball and hops through it, a lob leans back under it.
    let kickU = -1;
    if (this.kickT > 0) {
      this.kickT = Math.max(0, this.kickT - dt);
      kickU = 1 - this.kickT / KICK_TIME[this.kickKind];
      const k = Math.sin(kickU * Math.PI);
      if (this.kickKind === 'lob') pitch += 0.3 * k;
      else if (this.kickKind !== 'pass') { pitch -= 0.12 * k; lift += 0.05 * scale * k; }
    }
    const charge = this.kickT > 0 ? 0 : st.charge ?? 0;
    if (charge > 0) pitch -= 0.1 * charge;
    // Sharp turns at a run: dip, lean in and plant the outside foot.
    this.turnAcc = this.turnAcc * Math.exp(-dt * 8) + turnRate * dt;
    if (this.plant <= 0 && Math.abs(this.turnAcc) > 0.9 && norm > 2) { this.plant = 0.26; this.plantSide = Math.sign(this.turnAcc); this.turnAcc = 0; }
    let plantK = 0;
    if (this.plant > 0) {
      this.plant = Math.max(0, this.plant - dt);
      plantK = Math.sin((1 - this.plant / 0.26) * Math.PI);
      lift -= 0.06 * scale * plantK;
      roll += this.plantSide * 0.2 * plantK;
      pitch += 0.12 * plantK;
    }
    // Turning on the spot: little steps round instead of spinning on the studs.
    const stepping2 = norm < 0.6 && Math.abs(turnRate) > 2.5;
    this.stepW += ((stepping2 ? 1 : 0) - this.stepW) * Math.min(1, dt * 12);
    if (this.stepW > 0.01) this.stepT += dt * 16;
    // Tired after a long sprint: when the kid stops, hands on knees to get their breath back.
    this.fatigue = THREE.MathUtils.clamp(this.fatigue + dt * (norm > 4.8 ? 0.22 : norm > 1 ? -0.03 : -0.1), 0, 1);
    const puffed = norm < 0.35 && this.fatigue > 0.5 && !st.hold && !st.ready && !st.throwIn && !st.call && !this.isKeeper && !st.celebrate;
    this.breath += ((puffed ? 1 : 0) - this.breath) * Math.min(1, dt * (puffed ? 4 : 8));
    if (this.breath > 0.01) { pitch -= 0.6 * this.breath; lift -= 0.05 * scale * this.breath; }
    // Waiting for the kick-off: bouncing on the toes.
    this.readyW += ((st.ready && norm < 0.35 ? 1 : 0) - this.readyW) * Math.min(1, dt * 6);
    if (this.readyW > 0.01) lift += 0.03 * scale * this.readyW * Math.abs(Math.sin(performance.now() / 140 + this.seed));
    this.throwW += ((st.throwIn ? 1 : 0) - this.throwW) * Math.min(1, dt * 10);
    this.callW += ((st.call ? 1 : 0) - this.callW) * Math.min(1, dt * 8);
    if (diving && this.isKeeper) {
      // Keepers fly: launch sideways in an arc, land on their side and stay down for a moment.
      const t = 1 - st.dive;
      const air = DIVE_AIR_SHARE;
      if (t < air) {
        const u = t / air;
        roll += this.diveSide * 1.35 * Math.sin(u * Math.PI * 0.5);
        lift += 0.2 * scale * Math.sin(u * Math.PI) + LYING_LIFT * scale * u;
      } else {
        roll += this.diveSide * 1.35;
        lift += LYING_LIFT * scale;
      }
      pitch = 0;
    } else if (recovering && this.isKeeper) {
      // Getting up: push off the grass, over onto the knees and back to the feet.
      const u = 1 - (st.recover ?? 0);
      const up = u * u * (3 - 2 * u);
      roll += this.diveSide * 1.35 * (1 - up);
      lift += LYING_LIFT * scale * (1 - up);
      pitch = -0.35 * Math.sin(u * Math.PI);
    }
    const k = Math.sin(mu * Math.PI); // in and out over a move
    if (move === 'hop') lift += 0.2 * scale * k; // skipping over the tackle
    else if (move === 'throwIn') pitch -= 0.3 * k;
    if (move === 'header' || move === 'headTrap') {
      // Spring up to meet it: lean back, then snap the head through the ball.
      lift += (move === 'header' ? 0.24 : 0.12) * scale * k;
      pitch += (move === 'header' ? 0.5 : 0.3) * Math.sin(2 * Math.PI * mu) * k;
    } else if (move === 'diveHeader') {
      // Launch forward flat out to meet it, land on the belly, then push back up.
      const flat = mu < 0.3 ? Math.sin((mu / 0.3) * Math.PI * 0.5) : mu < 0.72 ? 1 : 1 - (mu - 0.72) / 0.28;
      const fly = mu < 0.3 ? Math.sin((mu / 0.3) * Math.PI) : 0;
      pitch = -1.4 * flat;
      lift += (0.18 * fly + 0.2 * flat) * scale;
      roll = 0;
    } else if (move === 'chestTrap') pitch += 0.35 * k; // chest out, leaning back to cushion it
    else if (move === 'thighTrap') pitch -= 0.08 * k;
    else if (move === 'catchHigh') lift += 0.22 * scale * k;
    else if (move === 'catchChest') { lift -= 0.05 * scale * k; pitch -= 0.15 * k; }
    else if (move === 'punt') pitch += 0.2 * k;
    let kneel = 0;
    if (kneeling) {
      // Knee slide: drop onto the knees, lean back and slide to a stop.
      kneel = Math.min(1, (ct - SLIDE_AT) / 0.2);
      lift -= KNEEL_DROP * scale * kneel;
      pitch += 0.3 * kneel;
      roll = 0;
    }
    if (cel === 'plane') roll += 0.28 * Math.sin(ct * 3.2); // banking like an aeroplane
    if (cel === 'slump') pitch -= 0.08;
    this.body.rotation.x = roll;
    this.body.rotation.y = -(this.facing + this.yawOff);
    this.body.rotation.z = pitch;
    this.body.position.y = lift;

    if (this.isKeeper && committed) {
      // The dodge clip side-steps the whole skeleton; the dive itself carries the keeper, so keep it over the spot.
      if (this.root) this.root.position.copy(this.rootRest);
      // Both arms stretch up past the head, reaching for the ball, and come down again as they get up.
      const reach = diving ? Math.min(1, (1 - st.dive) / (DIVE_AIR_SHARE * 0.5)) : 1 - (1 - (st.recover ?? 0)) * 1.6;
      const r = Math.max(0, reach);
      if (this.armL && this.armR) { this.swingSideways(this.armL, 2.1 * r); this.swingSideways(this.armR, -2.1 * r); }
    }

    // Dribbling tap: the right foot reaches forward and pushes the ball on, over the run cycle.
    if (this.tap > 0 && this.legR) {
      this.tap = Math.max(0, this.tap - dt);
      const k = Math.sin((1 - this.tap / TAP_TIME) * Math.PI);
      const [push, plant] = this.tapSide > 0 ? [this.legR, this.legL] : [this.legL, this.legR];
      if (push) this.swingAbout(push, 0, 0, 1, 0.5 * k);
      if (plant) this.swingAbout(plant, 0, 0, 1, -0.15 * k);
    }

    // Shuffle: little side-steps that open and close the legs, with a hop on each step.
    if (shuffling && this.legL && this.legR) {
      this.shuffleT += dt * (5 + 2.2 * Math.abs(strafe) / scale);
      const open = 0.32 * Math.abs(Math.sin(this.shuffleT));
      this.body.position.y += 0.035 * scale * Math.abs(Math.cos(this.shuffleT));
      this.body.rotation.x += Math.sign(strafe) * 0.06;
      this.swingSideways(this.legL, open);
      this.swingSideways(this.legR, -open);
    }
    this.poseExtras(st, move, mu, k, kneel, ct);
    if (!cel && !committed) this.footballMoves(move, mu, k, slideK, kickU, charge, plantK, trick, tu, tdir);
  }

  /** Legs and arms for kicks, tackles, hops, throw-ins, catching breath, calling for the ball and turning. */
  private footballMoves(move: MoveKind | null, mu: number, k: number, slideK: number, kickU: number, charge: number, plantK: number, trick: TrickKind | null, tu: number, tdir: number): void {
    const { legL, legR, shinL, shinR } = this;
    if (!legL || !legR || !shinL || !shinR) return;
    if (slideK > 0 && this.slideFast) {
      // Slide tackle: the right leg shoots out along the grass, the left tucks under, a hand goes down behind.
      this.aimBone(legR, 1, -0.25, 0.12, slideK, true);
      this.aimBone(shinR, 1, -0.3, 0.12, slideK, true);
      this.aimBone(legL, 0.75, -0.6, -0.15, slideK, true);
      this.aimBone(shinL, -0.7, -0.7, -0.1, slideK, true);
      this.aimArms(-0.5, -0.8, 0.6, -0.2, -0.3, 1, slideK, true);
      return;
    }
    if (slideK > 0) {
      // A standing tackle: poke a foot in.
      this.aimBone(legR, 1, -0.4, 0.15, slideK, true);
      this.aimBone(shinR, 1, -0.25, 0.15, slideK, true);
      this.aimArms(0, -0.5, 1, 0, -0.5, 1, 0.5 * slideK);
      return;
    }
    if (kickU >= 0) {
      // From the strike, the kicking leg swings on up and through, then drops back.
      const swing = KICK_SWING[this.kickKind];
      const a = 0.3 + (swing - 0.3) * Math.sin(Math.min(1, kickU / 0.4) * Math.PI * 0.5);
      const w = kickU < 0.55 ? 1 : 1 - THREE.MathUtils.smoothstep(kickU, 0.55, 1);
      const bend = this.kickKind === 'pass' ? 0.6 : this.kickKind === 'lob' ? 0.25 : 0;
      const across = this.kickKind === 'pass' ? -0.25 : 0.08; // a side-foot pass sweeps across the body
      this.aimBone(legR, Math.sin(a), -Math.cos(a), across, w, true);
      this.aimBone(shinR, Math.sin(a - bend), -Math.cos(a - bend), across, w, true);
      this.aimBone(legL, -0.15, -1, -0.1, 0.6 * w, true);
      const big = this.kickKind === 'pass' ? 0.45 : 0.9;
      // The arms fly out for balance: the left one forward, the right one back.
      this.aimArms(0.6, -0.1, 0.8, -0.55, -0.2, 0.8, big * w);
      return;
    }
    if (charge > 0) {
      // Winding up a shot: the kicking leg draws back, knee bent, the other arm out in front.
      const a = -1.0 * charge;
      this.aimBone(legR, Math.sin(a), -Math.cos(a), 0.05, 1, true);
      this.aimBone(shinR, Math.sin(a - 1.3 * charge), -Math.cos(a - 1.3 * charge), 0.05, 1, true);
      this.aimArms(0.6, -0.1, 0.8, -0.4, -0.3, 0.8, 0.8 * charge);
      return;
    }
    if (trick && trick !== 'nutmeg' && this.trickLegs(trick, tu, tdir)) return;
    if (move === 'hop') {
      // Both feet tucked up to skip over the outstretched leg, arms out.
      this.aimBone(legL, 0.45, -0.9, -0.1, k, true);
      this.aimBone(legR, 0.45, -0.9, 0.1, k, true);
      this.aimBone(shinL, -0.6, -0.8, -0.1, k, true);
      this.aimBone(shinR, -0.6, -0.8, 0.1, k, true);
      this.aimArms(0.1, 0.2, 1, 0.1, 0.2, 1, 0.8 * k);
      return;
    }
    if (move === 'throwIn') {
      // Both hands whip the ball from behind the head over and forward.
      const a = -0.35 + 2.1 * Math.min(1, mu / 0.6); // from up and back to forward and down
      const w = mu < 0.6 ? 1 : 1 - (mu - 0.6) / 0.4;
      this.aimArms(Math.sin(a), Math.cos(a), 0.3, Math.sin(a), Math.cos(a), 0.3, w);
      return;
    }
    if (this.throwW > 0.01) {
      // Both hands up either side of the head, ball on top (little arms only just reach past the big head).
      this.aimArms(0, 0.6, 0.9, 0, 0.6, 0.9, this.throwW);
      this.aimBone(this.foreL, 0, 1, 0.3, this.throwW);
      this.aimBone(this.foreR, 0, 1, -0.3, this.throwW);
      return;
    }
    if (this.breath > 0.01) {
      // Bent over, hands on the knees, chest heaving.
      const b = this.breath;
      this.aimArms(0.35, -1, 0.3, 0.35, -1, 0.3, b, true);
      this.aimBone(legL, 0.3, -1, -0.15, b, true);
      this.aimBone(legR, 0.3, -1, 0.15, b, true);
      this.aimBone(shinL, -0.15, -1, -0.15, b, true);
      this.aimBone(shinR, -0.15, -1, 0.15, b, true);
      if (this.chest) this.swingAbout(this.chest, 0, 0, 1, 0.07 * b * Math.sin(performance.now() / 160 + this.seed));
      return;
    }
    if (this.callW > 0.01) {
      // Calling for it: the left arm up and out past the big head (so it shows from above), hand waving.
      const wave = 0.25 * Math.sin(performance.now() / 110 + this.seed);
      this.aimBone(this.armL, 0.3, 0.75, -0.8, this.callW);
      this.aimBone(this.foreL, 0.3, 1, -0.45 + wave, this.callW);
    }
    if (this.readyW > 0.01) {
      // On the toes, arms loose and a little out.
      this.aimArms(0.1, -1, 0.35, 0.1, -1, 0.35, 0.5 * this.readyW * (this.callW > 0.5 ? 0 : 1));
    }
    if (plantK > 0) {
      // The outside foot goes out wide to push off.
      const out = this.plantSide > 0 ? legL : legR;
      this.aimBone(out, 0.1, -1, -this.plantSide * 0.5, plantK, true);
    }
    if (this.stepW > 0.01) {
      // Little steps round: one knee up, then the other.
      const sL = Math.max(0, Math.sin(this.stepT)), sR = Math.max(0, -Math.sin(this.stepT));
      this.swingAbout(legL, 0, 0, 1, 0.45 * sL * this.stepW);
      this.swingAbout(shinL, 0, 0, 1, -0.7 * sL * this.stepW);
      this.swingAbout(legR, 0, 0, 1, 0.45 * sR * this.stepW);
      this.swingAbout(shinR, 0, 0, 1, -0.7 * sR * this.stepW);
    }
  }

  /** Legs and arms for the skill moves (the nutmeg is a poke, drawn as a kick). Body frame: x forward, y up, z the kid's right. */
  private trickLegs(trick: TrickKind, u: number, dir: number): boolean {
    const { legL, legR, shinL, shinR } = this;
    if (!legL || !legR || !shinL || !shinR) return false;
    const k = Math.sin(u * Math.PI);
    const fade = 1 - THREE.MathUtils.smoothstep(u, 0.75, 1);
    switch (trick) {
      case 'stepover': {
        // The foot circles over the ball from the inside to the outside, then plants.
        const w = Math.sin(Math.min(1, u / 0.6) * Math.PI);
        const a = Math.min(1, u / 0.6) * Math.PI * 2;
        const [leg, shin] = dir > 0 ? [legR, shinR] : [legL, shinL];
        const out = dir * (0.1 + 0.8 * (1 - Math.cos(a)) / 2);
        this.aimBone(leg, 0.6 + 0.3 * Math.sin(a), -0.7 + 0.45 * Math.max(0, Math.sin(a)), out, w, true);
        this.aimBone(shin, 0.3, -1, out, w, true);
        this.aimArms(0, -0.5, 0.8, 0, -0.5, 0.8, 0.5 * k);
        return true;
      }
      case 'feint': {
        // The foot goes out wide the way of the swerve, the arms out for balance.
        const [leg, shin] = dir > 0 ? [legR, shinR] : [legL, shinL];
        const w = Math.sin(Math.min(1, u / 0.55) * Math.PI);
        this.aimBone(leg, 0.15, -0.8, dir * 0.8, w, true);
        this.aimBone(shin, 0.05, -1, dir * 0.7, w, true);
        this.aimArms(0, -0.5, 0.9, 0, -0.5, 0.9, 0.6 * k);
        return true;
      }
      case 'elastico': {
        // The outside of the foot pushes the ball out, then the inside snaps it back across, as the ball does in the sim.
        const m = dir < 0 ? 1 : -1;
        const [leg, shin] = m > 0 ? [legR, shinR] : [legL, shinL];
        const sh = -dir * elasticoShape(u) * m; // +1 out to that foot's side, -1 across
        this.aimBone(leg, 0.5, -0.75, m * (0.15 + 0.75 * sh), fade, true);
        this.aimBone(shin, 0.45, -1, m * (0.15 + 0.8 * sh), fade, true);
        this.aimArms(0.1, -0.5, 0.8, 0.1, -0.5, 0.8, 0.6 * k);
        return true;
      }
      case 'dragback': {
        // Sole on top of the ball, then rolled back under the body.
        const r = THREE.MathUtils.smoothstep(u, 0.05, 0.6);
        const x = 0.9 - 1.3 * r;
        this.aimBone(legR, x, -0.6 + 0.1 * Math.sin(r * Math.PI), 0.12, fade, true);
        this.aimBone(shinR, x * 0.6, -1, 0.12, fade, true);
        this.aimBone(legL, -0.1, -1, -0.12, 0.6 * fade, true);
        this.aimArms(0.2, -0.6, 0.6, 0.2, -0.6, 0.6, 0.6 * k);
        return true;
      }
      case 'cruyff': {
        if (u < 0.35) {
          // Pretend to kick it: the leg draws back as if for a big shot...
          const c = Math.sin((u / 0.35) * Math.PI * 0.5);
          const a = -1.0 * c;
          this.aimBone(legR, Math.sin(a), -Math.cos(a), 0.05, 1, true);
          this.aimBone(shinR, Math.sin(a - 1.3 * c), -Math.cos(a - 1.3 * c), 0.05, 1, true);
          this.aimArms(0.6, -0.1, 0.8, -0.4, -0.3, 0.8, 0.8 * c);
        } else {
          // ...then hooks it back behind the standing leg with the inside of the foot.
          const h = THREE.MathUtils.smoothstep(u, 0.35, 0.55);
          this.aimBone(legR, 0.6 - 0.8 * h, -0.75, -0.8 * h, fade, true);
          this.aimBone(shinR, 0.3 - 0.8 * h, -0.9, -0.75 * h, fade, true);
          this.aimArms(0.5, -0.2, 0.8, -0.3, -0.3, 0.8, 0.7 * fade);
        }
        return true;
      }
      case 'roulette': {
        // One sole drags the ball back, then the other rolls it on as the kid spins: arms out wide like a spinning top.
        const first = u < 0.45;
        const w = Math.sin(((first ? u : u - 0.45) / 0.45) * Math.PI) * (u < 0.9 ? 1 : 0);
        const [leg, shin, side] = first ? [legR, shinR, 1] : [legL, shinL, -1];
        this.aimBone(leg, 0.75, -0.6, side * 0.25, w, true);
        this.aimBone(shin, 0.4, -1, side * 0.25, w, true);
        this.aimArms(0, -0.2, 1, 0, -0.2, 1, 0.8 * k);
        return true;
      }
      case 'rainbow': {
        // The ball rolls up the back of the right leg and the heel flicks it up over the head.
        const w = Math.sin(THREE.MathUtils.clamp((u - 0.1) / 0.65, 0, 1) * Math.PI);
        const up = THREE.MathUtils.smoothstep(u, 0.2, 0.45);
        this.aimBone(legR, -0.3 - 0.7 * up, -0.95 + 0.5 * up, 0.08, w, true);
        this.aimBone(shinR, -0.4 - 0.6 * up, -0.9 + 1.8 * up, 0.08, w, true);
        this.aimBone(legL, 0.15, -1, -0.1, 0.6 * w, true);
        this.aimArms(0.2, 0.1, 0.9, 0.2, 0.1, 0.9, 0.8 * w);
        return true;
      }
      default: return false;
    }
  }

  /** Bone-level touches for celebrations, a keeper's handling, headers and first touches, on top of the clips. */
  private poseExtras(st: AnimState, move: MoveKind | null, mu: number, k: number, kneel: number, ct: number): void {
    if (!this.armL || !this.armR) return;
    const cel = st.celebrate ?? null;
    if (st.trophy !== undefined) { this.trophyArms(st.trophy); return; }
    if (kneel > 0) {
      // Thighs upright under the body, shins flat on the grass behind, arms flung up to the sky.
      if (this.legL && this.legR) { this.swingAbout(this.legL, 0, 0, 1, -0.3 * kneel); this.swingAbout(this.legR, 0, 0, 1, -0.3 * kneel); }
      if (this.shinL && this.shinR) { this.swingAbout(this.shinL, 0, 0, 1, -1.55 * kneel); this.swingAbout(this.shinR, 0, 0, 1, -1.55 * kneel); }
      const wave = 0.15 * Math.sin(ct * 9);
      this.aimArms(0.15, 1, 0.9 + wave, 0.15, 1, 0.9 + wave, kneel);
      return;
    }
    if (cel === 'plane') { this.aimArms(0, 0.1, 1, 0, 0.1, 1, 1); return; }
    if (cel === 'slump') {
      // Heads down, shoulders slumped, arms dangling.
      if (this.chest) this.swingAbout(this.chest, 0, 0, 1, -0.3);
      if (this.headBone) this.swingAbout(this.headBone, 0, 0, 1, -0.35);
      this.aimArms(0.05, -1, 0.12, 0.05, -1, 0.12, 0.8);
      return;
    }
    if (move === 'header' || move === 'chestTrap' || move === 'headTrap') { this.aimArms(0.1, -0.2, 1, 0.1, -0.2, 1, k * (move === 'headTrap' ? 0.5 : 0.8)); return; }
    if (move === 'diveHeader') { this.aimArms(1, -0.3, 0.5, 1, -0.3, 0.5, k); return; }
    if (move === 'thighTrap') {
      // Knee up to cushion it, arms out for balance.
      if (this.legR) this.swingAbout(this.legR, 0, 0, 1, 1.5 * k);
      if (this.shinR) this.swingAbout(this.shinR, 0, 0, 1, -1.6 * k);
      this.aimArms(0, -0.4, 1, 0, -0.4, 1, 0.6 * k);
      return;
    }
    // A keeper's hands: up high for a lob, then the ball is clutched to the chest until it is thrown or kicked.
    if (move === 'catchHigh') {
      const up = mu < 0.45 ? 1 : 1 - (mu - 0.45) / 0.55;
      this.aimArms(0.5, 1, 0.55, 0.5, 1, 0.55, up);
      if (up < 1) this.holdArms(1 - up);
      return;
    }
    if (move === 'scoop' || move === 'throw' || move === 'punt') return; // the clip has the arms
    const hold = move === 'catchChest' ? Math.min(1, mu * 4) : st.hold ? 1 : 0;
    if (hold > 0) this.holdArms(hold);
  }

  /** Both hands on a trophy: held in front of the chest (u = 0), lifted straight up over the head (u = 1). */
  private trophyArms(u: number): void {
    const l = THREE.MathUtils.clamp(u, 0, 1);
    const mix = (a: number, b: number) => a + (b - a) * l;
    this.aimArms(mix(0.75, 0.15), mix(-0.6, 0.8), mix(0.3, 0.8), mix(0.75, 0.15), mix(-0.6, 0.8), mix(0.3, 0.8), 1);
    // Forearms in towards each other, hands either side of the trophy.
    this.aimBone(this.foreL, mix(1, 0.15), mix(0, 1), mix(0.35, -0.25), 1);
    this.aimBone(this.foreR, mix(1, 0.15), mix(0, 1), mix(-0.35, 0.25), 1);
  }

  /** Where the hands are in the world (halfway between them), for putting a trophy in them. False before the model loads. */
  handsAt(out: THREE.Vector3): boolean {
    const l = this.foreL?.children[0], r = this.foreR?.children[0];
    if (!l || !r) return false;
    this.group.updateMatrixWorld(true);
    l.getWorldPosition(out);
    out.add(r.getWorldPosition(this.tmpV));
    out.multiplyScalar(0.5);
    return true;
  }

  /** Arms out in front, wrapped round the ball. */
  private holdArms(w: number): void {
    this.aimArms(0.75, -0.6, 0.3, 0.75, -0.6, 0.3, w);
    // Forearms forward and in, hands either side of the ball.
    this.aimBone(this.foreL, 1, 0, 0.35, w);
    this.aimBone(this.foreR, 1, 0, -0.35, w);
  }

  /**
   * Point both arms (upper arm and forearm together) along body-frame directions: x forward, y up,
   * and `outL`/`outR` how far out to that side. w blends from the clip's pose (0) to the aimed pose (1).
   */
  private aimArms(fl: number, ul: number, outL: number, fr: number, ur: number, outR: number, w: number, level = false): void {
    if (w <= 0) return;
    this.aimBone(this.armL, fl, ul, -outL, w, level);
    this.aimBone(this.foreL, fl, ul, -outL, w, level);
    this.aimBone(this.armR, fr, ur, outR, w, level);
    this.aimBone(this.foreR, fr, ur, outR, w, level);
  }

  private readonly tmpV = new THREE.Vector3();
  private readonly tmpV2 = new THREE.Vector3();
  /**
   * Turn a bone so it points (towards its first child) along a body-frame direction, blended by w.
   * `level` measures the direction from the ground instead (facing the same way, but ignoring the body's lean).
   */
  private aimBone(bone: THREE.Object3D | null, x: number, y: number, z: number, w: number, level = false): void {
    const child = bone?.children[0];
    const parent = bone?.parent;
    if (!bone || !child || !parent || w <= 0) return;
    const from = child.getWorldPosition(this.tmpV).sub(bone.getWorldPosition(this.tmpV2)).normalize();
    const frame = level ? this.group.getWorldQuaternion(this.tmpQ).multiply(this.tmpQ2.setFromAxisAngle(UP, -(this.facing + this.yawOff))) : this.body.getWorldQuaternion(this.tmpQ);
    const to = this.tmpAxis.set(x, y, z).normalize().applyQuaternion(frame);
    const d = this.tmpQ.setFromUnitVectors(from, to);
    if (w < 1) d.slerp(this.tmpQ2.identity(), 1 - w);
    // world delta d becomes local: q' = Pinv * d * P * q
    const p = parent.getWorldQuaternion(this.tmpQ3);
    bone.quaternion.premultiply(this.tmpQ4.copy(p).premultiply(d).premultiply(p.invert()));
  }

  /**
   * A dribbling touch. While running, nudge the run cycle so the touch lands as a foot swings
   * through (Running_B brings the right foot through at about 0.35 s and the left half a cycle later)
   * and push with that foot.
   */
  private startTap(): void {
    this.tap = TAP_TIME;
    this.tapSide = 1;
    const run = this.actions.get('Running_B');
    if (this.loco !== 'run' || !run || this.oneShot) return;
    const dur = run.getClip().duration;
    const wrap = (x: number) => ((x % dur) + dur * 1.5) % dur - dur / 2;
    const toRight = wrap(RUN_RIGHT_THROUGH - run.time), toLeft = wrap(RUN_RIGHT_THROUGH + dur / 2 - run.time);
    const err = Math.abs(toRight) <= Math.abs(toLeft) ? toRight : toLeft;
    this.tapSide = err === toRight ? 1 : -1;
    run.time = (run.time + err * 0.5 + dur) % dur;
  }

  private readonly tmpQ = new THREE.Quaternion();
  private readonly tmpQ2 = new THREE.Quaternion();
  private readonly tmpQ3 = new THREE.Quaternion();
  private readonly tmpQ4 = new THREE.Quaternion();
  private readonly tmpAxis = new THREE.Vector3();

  /** Swing a limb out sideways (about the kid's forward axis; positive lifts a left limb, negative a right one) on top of the clip. */
  private swingSideways(bone: THREE.Object3D, angle: number): void {
    this.swingAbout(bone, 1, 0, 0, angle);
  }

  /**
   * Rotate a bone about an axis given in the kid's body frame (x forward, y up, z their right) on top of the clip.
   * About z, a positive angle swings a leg forward.
   */
  private swingAbout(bone: THREE.Object3D, ax: number, ay: number, az: number, angle: number): void {
    const parent = bone.parent;
    if (!parent) return;
    // The body-frame axis in world space, then in the bone's parent space.
    this.tmpAxis.set(ax, ay, az).applyQuaternion(this.body.getWorldQuaternion(this.tmpQ));
    this.tmpAxis.applyQuaternion(parent.getWorldQuaternion(this.tmpQ2).invert()).normalize();
    bone.quaternion.premultiply(this.tmpQ.setFromAxisAngle(this.tmpAxis, angle));
  }

  private clipName(l: Loco): string { return l === 'idle' ? 'Idle' : l === 'walk' ? 'Walking_A' : l === 'run' ? 'Running_B' : 'Cheer'; }

  private switchLoco(next: Loco): void {
    const from = this.actions.get(this.clipName(this.loco));
    const to = this.actions.get(this.clipName(next));
    this.loco = next;
    if (!to) return;
    const fade = 0.18;
    if (this.oneShot) { to.reset().setEffectiveWeight(0).play(); return; }
    to.enabled = true;
    to.reset().setEffectiveWeight(1).fadeIn(fade).play();
    if (from && from !== to) from.fadeOut(fade);
  }

  /** Play a clip once over the run; `from` skips the first part of it (a share of its length). */
  private startOneShot(name: string, timeScale: number, hold: boolean, from = 0): void {
    const a = this.actions.get(name);
    if (!a) return;
    if (this.oneShot && this.oneShot !== a) this.oneShot.fadeOut(0.05);
    a.reset().setLoop(THREE.LoopOnce, 1).setEffectiveTimeScale(timeScale).setEffectiveWeight(1);
    a.time = a.getClip().duration * from;
    a.clampWhenFinished = hold;
    a.fadeIn(0.06).play();
    this.actions.get(this.clipName(this.loco))?.fadeOut(0.06);
    this.oneShot = a;
  }

  private endOneShot(): void {
    const a = this.oneShot;
    this.oneShot = null;
    if (!a) return;
    a.fadeOut(0.15);
    const loco = this.actions.get(this.clipName(this.loco));
    if (loco) { loco.enabled = true; loco.setEffectiveWeight(1); loco.fadeIn(0.15).play(); }
  }

  dispose(): void {
    if (this.disposed) return;
    this.disposed = true;
    this.mixer?.stopAllAction();
    if (this.rig) this.mixer?.uncacheRoot(this.rig);
    // The kit, face and number textures are cached for every kid who looks the same: hand them back.
    releaseTexture(this.material.map);
    releaseTexture(this.faceMat.map);
    if (this.plate) releaseTexture((this.plate.material as THREE.MeshBasicMaterial).map);
    if (this.fallback) { this.fallback.group.removeFromParent(); this.fallback.dispose(); }
    // The rest is this kid's own: rings, shadow, outlines, skeletons, hair pieces and the number plate.
    // The rig's geometry and the outline material are shared, so disposeObject leaves them be.
    disposeObject(this.group);
    // These are not always in the tree (before the rig loads, or on a model with no face part).
    for (const m of [this.material, this.faceMat, this.hairMat]) m.dispose();
  }
}
