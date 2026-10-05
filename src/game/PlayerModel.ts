import * as THREE from 'three';
import type { Kit, Player } from '../data/types';
import { cloneRig, loadPlayerAsset, playerAssetNow, type PlayerAsset } from './playerAsset';
import { contrastColour, numberTexture, playerAtlas } from './playerAtlas';
import { ProceduralPlayerModel } from './ProceduralPlayerModel';
import { addSkinnedOutline, toonMaterial } from './toon';

/** Models are drawn bigger than their physical size so the kids read clearly from the camera. */
export const MODEL_SCALE = 1.35;
/** Height in metres of a scale-1 kid before MODEL_SCALE (matches the old procedural model). */
const BASE_HEIGHT = 1.4;

const shadowGeo = new THREE.CircleGeometry(0.42, 20);
const shadowMat = new THREE.MeshBasicMaterial({ color: 0x000000, transparent: true, opacity: 0.25, depthWrite: false });
const plateGeo = new THREE.PlaneGeometry(0.44, 0.44);

type Loco = 'idle' | 'walk' | 'run' | 'cheer';
type Head = 'Head_plain' | 'Head_short' | 'Head_long';
const HEAD_FOR: Record<Player['hairStyle'], Head> = { short: 'Head_plain', spiky: 'Head_short', long: 'Head_long', curly: 'Head_short', bald: 'Head_short' };

/**
 * A rigged, animated kid (CC0 KayKit character, see public/models/LICENSE.md)
 * painted with the team kit. Local +x is "forward"; call setFacing(yaw).
 * Until the model file arrives nothing is drawn; if it fails to load, the old
 * procedural kid takes over so the game still plays.
 */
export class PlayerModel {
  readonly group = new THREE.Group();
  private readonly body = new THREE.Group();
  private readonly ring: THREE.Mesh;
  private readonly material: THREE.MeshToonMaterial;
  private rig: THREE.Group | null = null;
  private mixer: THREE.AnimationMixer | null = null;
  private actions = new Map<string, THREE.AnimationAction>();
  private heads = new Map<Head, THREE.SkinnedMesh>();
  private plate: THREE.Mesh | null = null;
  private fallback: ProceduralPlayerModel | null = null;
  private disposed = false;

  private kit: Kit;
  private number: number;
  private skin: string;
  private hair: string;
  private boots: string;
  private hairStyle: Player['hairStyle'];
  private readonly scale: number;

  private loco: Loco = 'idle';
  private oneShot: THREE.AnimationAction | null = null;
  private wasKicking = false;
  private wasDiving = false;
  private facing = 0;
  private cheer = false;

  constructor(private readonly player: Player, kit: Kit, scale: number) {
    this.kit = kit; this.number = player.number; this.skin = player.skin; this.hair = player.hair;
    this.boots = player.boots ?? '#222222'; this.hairStyle = player.hairStyle ?? 'short'; this.scale = scale;
    this.material = toonMaterial({ map: this.atlas() });

    const s = scale * MODEL_SCALE;
    const shadow = new THREE.Mesh(shadowGeo, shadowMat);
    shadow.rotation.x = -Math.PI / 2;
    shadow.position.y = 0.01;
    shadow.scale.setScalar(s);
    this.ring = new THREE.Mesh(new THREE.RingGeometry(0.44, 0.56, 32), new THREE.MeshBasicMaterial({ color: 0xffd23f, transparent: true, opacity: 0.9, depthWrite: false }));
    this.ring.rotation.x = -Math.PI / 2;
    this.ring.position.y = 0.02;
    this.ring.scale.setScalar(s);
    this.ring.visible = false;
    this.group.add(shadow, this.ring, this.body);

    const ready = playerAssetNow();
    if (ready) this.build(ready);
    else loadPlayerAsset().then((a) => { if (!this.disposed) this.build(a); }).catch(() => { if (!this.disposed) this.useFallback(); });
  }

  private atlas(): THREE.CanvasTexture {
    return playerAtlas(this.kit, { skin: this.skin, hair: this.hair, boots: this.boots, bald: this.hairStyle === 'bald' });
  }

  private build(asset: PlayerAsset): void {
    const rig = cloneRig(asset);
    // The file faces +z; the game treats local +x as forward.
    rig.rotation.y = Math.PI / 2;
    const k = (this.scale * MODEL_SCALE * BASE_HEIGHT) / asset.height;
    rig.scale.setScalar(k);
    // Collect first: the outline is itself a skinned child, and traverse would walk into it.
    const skinned: THREE.SkinnedMesh[] = [];
    rig.traverse((o) => { if ((o as THREE.SkinnedMesh).isSkinnedMesh) skinned.push(o as THREE.SkinnedMesh); });
    for (const m of skinned) {
      m.material = this.material;
      m.castShadow = true;
      m.receiveShadow = false;
      m.frustumCulled = false;
      addSkinnedOutline(m, 0.028);
      if (m.name.startsWith('Head_')) this.heads.set(m.name as Head, m);
    }
    this.rig = rig;
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
    mixer.addEventListener('finished', (e) => { if (e.action === this.oneShot) this.endOneShot(); });
    this.setFacing(this.facing);
  }

  private useFallback(): void {
    this.fallback = new ProceduralPlayerModel({ ...this.player, number: this.number, skin: this.skin, hair: this.hair, boots: this.boots, hairStyle: this.hairStyle }, this.kit, this.scale);
    // The fallback has its own shadow and ring; hide ours.
    this.group.children.forEach((c) => { if (c !== this.body) c.visible = false; });
    this.group.add(this.fallback.group);
    this.fallback.setFacing(this.facing);
  }

  private applyHead(): void {
    const want = HEAD_FOR[this.hairStyle] ?? 'Head_plain';
    this.heads.forEach((mesh, name) => { mesh.visible = name === want; mesh.children.forEach((c) => { c.visible = name === want; }); });
  }

  setKit(kit: Kit, number: number): void {
    this.kit = kit; this.number = number;
    this.material.map = this.atlas();
    this.material.needsUpdate = true;
    if (this.plate) { const pm = this.plate.material as THREE.MeshBasicMaterial; pm.map = numberTexture(number, contrastColour(kit.shirt)); pm.needsUpdate = true; }
    this.fallback?.setKit(kit, number);
  }

  setLook(skin: string, hair: string, hairStyle?: Player['hairStyle'], boots?: string): void {
    this.skin = skin; this.hair = hair;
    if (boots) this.boots = boots;
    if (hairStyle) this.hairStyle = hairStyle;
    this.material.map = this.atlas();
    this.material.needsUpdate = true;
    this.applyHead();
    this.fallback?.setLook(skin, hair, hairStyle, boots);
  }

  setSelected(on: boolean, colour?: number): void {
    if (this.fallback) { this.fallback.setSelected(on, colour); return; }
    this.ring.visible = on;
    if (colour !== undefined) (this.ring.material as THREE.MeshBasicMaterial).color.set(colour);
  }

  setFacing(yaw: number): void {
    this.facing = yaw;
    // Sim yaw is measured in the x/z plane with 0 = +x; Three's rotation.y is anticlockwise about y.
    this.body.rotation.y = -yaw;
    this.fallback?.setFacing(yaw);
  }

  /** Scoring team jumps for joy during the goal celebration. */
  setCheer(on: boolean): void { this.cheer = on; }

  /**
   * Drives the clips from the sim: speed in m/s, kick 0..1 (1 = just kicked),
   * dive 0..1 with direction (+1 = towards +z), dt seconds.
   */
  animate(speed: number, kick: number, dive: number, diveDir: number, dt: number, scale: number, wobble = 0): void {
    if (this.fallback) { this.fallback.animate(speed, kick, dive, diveDir, dt, scale, wobble); return; }
    if (!this.mixer) return;
    const norm = speed / Math.max(0.4, scale);

    // One-shots: a kick snaps in over the run; a dive plays once and holds.
    const kicking = kick > 0, diving = dive > 0;
    if (kicking && !this.wasKicking) this.startOneShot('Unarmed_Melee_Attack_Kick', 2.4, false);
    if (diving && !this.wasDiving) {
      // Which way is that in the kid's own frame? Right is (-sin yaw, cos yaw).
      const toRight = diveDir * Math.cos(this.facing) > 0;
      this.startOneShot(toRight ? 'Dodge_Right' : 'Dodge_Left', 1.1, true);
    }
    if (!diving && this.wasDiving && this.oneShot) this.endOneShot();
    this.wasKicking = kicking; this.wasDiving = diving;

    // Locomotion from speed; feet speed follows the kid's actual speed.
    const want: Loco = this.cheer && norm < 0.8 ? 'cheer' : norm < 0.35 ? 'idle' : norm < 2.4 ? 'walk' : 'run';
    if (want !== this.loco) this.switchLoco(want);
    const run = this.actions.get('Running_A'), walk = this.actions.get('Walking_A');
    if (run) run.setEffectiveTimeScale(THREE.MathUtils.clamp(norm / 4.5, 0.75, 1.8));
    if (walk) walk.setEffectiveTimeScale(THREE.MathUtils.clamp(norm / 1.8, 0.7, 1.5));
    // Little ones run with a wobble: the body sways side to side as they go.
    this.body.rotation.z = wobble * Math.sin(performance.now() / 180) * 0.12 * Math.min(1, norm / 2);
    this.mixer.update(dt);
  }

  private clipName(l: Loco): string { return l === 'idle' ? 'Idle' : l === 'walk' ? 'Walking_A' : l === 'run' ? 'Running_A' : 'Cheer'; }

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

  private startOneShot(name: string, timeScale: number, hold: boolean): void {
    const a = this.actions.get(name);
    if (!a) return;
    if (this.oneShot && this.oneShot !== a) this.oneShot.fadeOut(0.05);
    a.reset().setLoop(THREE.LoopOnce, 1).setEffectiveTimeScale(timeScale).setEffectiveWeight(1);
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
    // Geometry is shared with the loaded asset, so only our own materials go.
    this.rig?.traverse((o) => {
      const m = o as THREE.Mesh;
      if (m.isMesh && m.material !== this.material) (m.material as THREE.Material).dispose();
    });
    this.material.dispose();
    (this.ring.material as THREE.Material).dispose();
    this.ring.geometry.dispose();
    this.fallback?.dispose();
  }
}
