import * as THREE from 'three';
import type { BootStyle, Build, Kit, Player } from '../data/types';
import { cloneRig, loadPlayerAsset, playerAssetNow, type PlayerAsset } from './playerAsset';
import { contrastColour, numberTexture, playerAtlas } from './playerAtlas';
import { faceTexture, type Expression } from './playerFace';
import { ProceduralPlayerModel } from './ProceduralPlayerModel';
import { DIVE_AIR_SHARE, DRIBBLE_STRIDE, SLIDE_AT, type Celebration, type MoveKind } from './sim';
import { graphicsProfile } from './graphics';
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
  /** Step-over skill move: 1 as it starts, fading to 0; stepoverDir is which way the feint goes (-1 or 1). */
  stepover?: number;
  stepoverDir?: number;
  /** While a goal stands: this kid's celebration (or gloom), and seconds since the goal. */
  celebrate?: Celebration | null;
  celebrateT?: number;
  /** A one-off move (keeper handling, a header, a first touch off a high ball): 1 as it starts, fading to 0. */
  move?: MoveKind | null;
  moveAnim?: number;
  /** A keeper with the ball in their hands, held out in front. */
  hold?: boolean;
}

export const IDLE_STATE: AnimState = { speed: 0, kick: 0, dive: 0, diveDir: 1, stun: 0, tackle: 0, scale: 1, wobble: 0, mood: 'neutral', gazeX: 0, gazeY: 0, cheer: false };

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
  shadowTex = new THREE.CanvasTexture(c);
  return shadowTex;
}
const shadowGeo = new THREE.PlaneGeometry(1.25, 1.0);
const plateGeo = new THREE.PlaneGeometry(0.44, 0.44);

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

const wrapAngle = (a: number): number => Math.atan2(Math.sin(a), Math.cos(a));

/**
 * A rigged, animated kid (CC0 KayKit character, see public/models/LICENSE.md)
 * painted with the team kit and a face that reacts to the play.
 * Local +x is "forward"; call setFacing(yaw).
 * Until the model file arrives nothing is drawn; if it fails to load, the old
 * procedural kid takes over so the game still plays.
 */
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
  private facing = 0;
  private turn = 0;
  private lean = 0;
  private faceKey = '';
  private blinkIn = 2 + Math.random() * 4;
  private blinkLeft = 0;

  constructor(private readonly player: Player, kit: Kit, scale: number) {
    this.kit = kit; this.number = player.number; this.skin = player.skin; this.hair = player.hair;
    this.boots = player.boots ?? '#222222'; this.bootStyle = player.bootStyle ?? 'classic'; this.hairStyle = player.hairStyle ?? 'short'; this.build = player.build ?? 'regular';
    this.isKeeper = player.position === 'GK';
    this.scale = scale;
    // Yaw first, so roll (x) and pitch (z) stay about the kid's own forward and side axes whichever way they face.
    this.body.rotation.order = 'YXZ';
    this.material = toonMaterial({ map: this.atlas() });
    this.faceMat = toonMaterial({ map: faceTexture(this.skin, 'neutral', 0, 0, this.hair) });
    this.hairMat = toonMaterial({ color: this.hair });

    const s = scale * MODEL_SCALE;
    this.baseScale = s;
    const shadow = new THREE.Mesh(shadowGeo, new THREE.MeshBasicMaterial({ map: shadowTexture(), transparent: true, depthWrite: false }));
    shadow.rotation.x = -Math.PI / 2;
    shadow.position.y = 0.012;
    shadow.scale.setScalar(s);
    shadow.renderOrder = -1;
    this.shadow = shadow;
    this.teamRing = new THREE.Mesh(new THREE.RingGeometry(0.4, 0.5, 32), new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.85, depthWrite: false }));
    this.teamRing.rotation.x = -Math.PI / 2;
    this.teamRing.position.y = 0.016;
    this.teamRing.scale.setScalar(s);
    // The controlled player's ring: bigger, brighter and pulsing, outside the team ring.
    this.ring = new THREE.Mesh(new THREE.RingGeometry(0.56, 0.72, 40), new THREE.MeshBasicMaterial({ color: 0xff8a00, transparent: true, opacity: 0.95, depthWrite: false }));
    this.ring.rotation.x = -Math.PI / 2;
    this.ring.position.y = 0.02;
    this.ring.scale.setScalar(s);
    this.ring.visible = false;
    this.marker = new THREE.Mesh(new THREE.ConeGeometry(0.17, 0.3, 4), new THREE.MeshBasicMaterial({ color: 0xff8a00 }));
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
    this.material.map = this.atlas();
    this.material.needsUpdate = true;
    if (this.plate) { const pm = this.plate.material as THREE.MeshBasicMaterial; pm.map = numberTexture(number, contrastColour(kit.shirt)); pm.needsUpdate = true; }
    this.fallback?.setKit(kit, number);
  }

  setLook(skin: string, hair: string, hairStyle?: Player['hairStyle'], boots?: string, bootStyle?: BootStyle): void {
    this.skin = skin; this.hair = hair;
    if (boots) this.boots = boots;
    if (bootStyle) this.bootStyle = bootStyle;
    if (hairStyle) this.hairStyle = hairStyle;
    this.material.map = this.atlas();
    this.material.needsUpdate = true;
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
  setTeamColour(colour: THREE.ColorRepresentation): void {
    (this.teamRing.material as THREE.MeshBasicMaterial).color.set(colour);
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
    this.faceMat.map = faceTexture(this.skin, expr, gx, gy, this.hair);
    this.faceMat.needsUpdate = true;
  }

  /** Drives the clips and the procedural layer (leans, hops, slides) from the sim state. */
  animate(dt: number, st: AnimState): void {
    if (this.ring.visible) {
      this.markerT += dt;
      const s = this.baseScale;
      this.ring.scale.setScalar(s * (1 + 0.05 * Math.sin(this.markerT * 6)));
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
    const stepping = (st.stepover ?? 0) > 0;
    // Step-over: a quick dodge one way over the ball (the clip is played fast so it reads as a feint).
    if (stepping && !this.wasStepping && !kicking && !diving) this.startOneShot((st.stepoverDir ?? 1) > 0 ? 'Dodge_Right' : 'Dodge_Left', 2.6, false);
    this.wasStepping = stepping;
    // Keeper handling and headers: a scoop off the grass, an overarm throw; a header is a jump, not a kick.
    const move = (st.moveAnim ?? 0) > 0 ? st.move ?? null : null;
    const moveStart = move !== null && (move !== this.lastMove || (st.moveAnim ?? 0) > this.lastMoveAnim + 0.05);
    this.lastMove = move; this.lastMoveAnim = st.moveAnim ?? 0;
    const mu = move ? 1 - (st.moveAnim ?? 0) : 0; // 0 → 1 through the move
    if (moveStart && move === 'scoop') this.startOneShot('PickUp', 2.6, false, 0.15);
    if (moveStart && move === 'throw') this.startOneShot('Throw', 1.8, false, 0.3);
    if (realKick && move !== 'header' && move !== 'throw') { this.tap = 0; this.startOneShot('Unarmed_Melee_Attack_Kick', 2.4, false); }
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
    if (tackling && !this.wasTackling && !kicking) this.slide = 0.42;
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
    if (stunned) roll += 0.22 * st.stun * Math.sin(st.stun * Math.PI * 3);
    if (stepping) roll += (st.stepoverDir ?? 1) * 0.3 * Math.sin((1 - st.stepover!) * Math.PI * 2);
    if (this.slide > 0) {
      // Slide tackle: sit back and drop, then spring up.
      this.slide = Math.max(0, this.slide - dt);
      const k = Math.sin((1 - this.slide / 0.42) * Math.PI);
      pitch += 0.8 * k;
      lift -= 0.16 * scale * k;
    }
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
  }

  /** Bone-level touches for celebrations, a keeper's handling, headers and first touches, on top of the clips. */
  private poseExtras(st: AnimState, move: MoveKind | null, mu: number, k: number, kneel: number, ct: number): void {
    if (!this.armL || !this.armR) return;
    const cel = st.celebrate ?? null;
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
  private aimArms(fl: number, ul: number, outL: number, fr: number, ur: number, outR: number, w: number): void {
    if (w <= 0) return;
    this.aimBone(this.armL, fl, ul, -outL, w);
    this.aimBone(this.foreL, fl, ul, -outL, w);
    this.aimBone(this.armR, fr, ur, outR, w);
    this.aimBone(this.foreR, fr, ur, outR, w);
  }

  private readonly tmpV = new THREE.Vector3();
  private readonly tmpV2 = new THREE.Vector3();
  /** Turn a bone so it points (towards its first child) along a body-frame direction, blended by w. */
  private aimBone(bone: THREE.Object3D | null, x: number, y: number, z: number, w: number): void {
    const child = bone?.children[0];
    const parent = bone?.parent;
    if (!bone || !child || !parent || w <= 0) return;
    const from = child.getWorldPosition(this.tmpV).sub(bone.getWorldPosition(this.tmpV2)).normalize();
    const to = this.tmpAxis.set(x, y, z).normalize().applyQuaternion(this.body.getWorldQuaternion(this.tmpQ));
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
    this.disposed = true;
    this.mixer?.stopAllAction();
    if (this.rig) this.mixer?.uncacheRoot(this.rig);
    // Skinned geometry is shared with the loaded asset, so only our own materials and hair pieces go.
    this.rig?.traverse((o) => {
      const m = o as THREE.Mesh;
      if (m.isMesh && m.material !== this.material && m.material !== this.faceMat && m.material !== this.hairMat) (m.material as THREE.Material).dispose();
    });
    this.hairAcc?.children.forEach((c) => (c as THREE.Mesh).geometry.dispose());
    this.material.dispose();
    this.faceMat.dispose();
    this.hairMat.dispose();
    (this.ring.material as THREE.Material).dispose();
    this.ring.geometry.dispose();
    (this.teamRing.material as THREE.Material).dispose();
    this.teamRing.geometry.dispose();
    (this.marker.material as THREE.Material).dispose();
    this.marker.geometry.dispose();
    this.fallback?.dispose();
  }
}
