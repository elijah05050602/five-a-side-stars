import * as THREE from 'three';
import type { Kit, Player } from '../data/types';
import { kitTexture } from './kitTexture';
import { addOutline, toonMaterial } from './toon';

/** Models are drawn bigger than their physical size so the kids read clearly from the camera. */
export const MODEL_SCALE = 1.35;
const shadowGeo = new THREE.CircleGeometry(0.42, 20);
const shadowMat = new THREE.MeshBasicMaterial({ color: 0x000000, transparent: true, opacity: 0.25, depthWrite: false });

let faceTex: THREE.CanvasTexture | null = null;
/** Big friendly eyes, rosy cheeks and a smile, drawn once and shared. */
function faceTexture(): THREE.CanvasTexture {
  if (faceTex) return faceTex;
  const c = document.createElement('canvas');
  c.width = 512; c.height = 256;
  const ctx = c.getContext('2d')!;
  ctx.clearRect(0, 0, 512, 256);
  const cx = 256; // u = 0.5 is the front of a Three.js sphere
  const eyeY = 118;
  for (const dx of [-30, 30]) {
    ctx.fillStyle = '#ffffff';
    ctx.beginPath(); ctx.ellipse(cx + dx, eyeY, 15, 18, 0, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = '#1b2a41';
    ctx.beginPath(); ctx.ellipse(cx + dx + 3, eyeY + 2, 9, 12, 0, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = '#ffffff';
    ctx.beginPath(); ctx.arc(cx + dx + 6, eyeY - 3, 3.5, 0, Math.PI * 2); ctx.fill();
    // Eyebrow
    ctx.strokeStyle = 'rgba(40,25,10,0.55)'; ctx.lineWidth = 5; ctx.lineCap = 'round';
    ctx.beginPath(); ctx.moveTo(cx + dx - 14, eyeY - 30); ctx.quadraticCurveTo(cx + dx, eyeY - 38, cx + dx + 14, eyeY - 30); ctx.stroke();
  }
  // Cheeks
  ctx.fillStyle = 'rgba(255,110,120,0.35)';
  for (const dx of [-58, 58]) { ctx.beginPath(); ctx.ellipse(cx + dx, eyeY + 28, 16, 10, 0, 0, Math.PI * 2); ctx.fill(); }
  // Smile
  ctx.strokeStyle = '#7a2e2e'; ctx.lineWidth = 6; ctx.lineCap = 'round';
  ctx.beginPath(); ctx.moveTo(cx - 22, eyeY + 38); ctx.quadraticCurveTo(cx, eyeY + 62, cx + 22, eyeY + 38); ctx.stroke();
  faceTex = new THREE.CanvasTexture(c);
  faceTex.colorSpace = THREE.SRGBColorSpace;
  faceTex.anisotropy = 4;
  return faceTex;
}

/**
 * A chunky cartoon footballer built from primitives with toon shading and a
 * dark outline, so every part of the kit can be recoloured instantly.
 * Local +x is "forward"; call setFacing(yaw).
 */
export class PlayerModel {
  readonly group = new THREE.Group();
  private readonly body = new THREE.Group();
  private readonly legL: THREE.Group;
  private readonly legR: THREE.Group;
  private readonly armL: THREE.Group;
  private readonly armR: THREE.Group;
  private readonly head: THREE.Group;
  private readonly shirtMat: THREE.MeshToonMaterial;
  private readonly sleeveMat: THREE.MeshToonMaterial;
  private readonly trimMat: THREE.MeshToonMaterial;
  private readonly shortsMat: THREE.MeshToonMaterial;
  private readonly socksMat: THREE.MeshToonMaterial;
  private readonly skinMat: THREE.MeshToonMaterial;
  private readonly hairMat: THREE.MeshToonMaterial;
  private readonly bootMat: THREE.MeshToonMaterial;
  private readonly ring: THREE.Mesh;
  private hairGroup = new THREE.Group();
  private readonly headR = 0.215;
  private walk = 0;
  private idle = Math.random() * 10;

  constructor(player: Player, kit: Kit, scale: number) {
    const s = scale * MODEL_SCALE;
    this.shirtMat = toonMaterial({ map: kitTexture(kit, player.number) });
    this.sleeveMat = toonMaterial({ color: kit.shirt });
    this.trimMat = toonMaterial({ color: kit.shirt2 });
    this.shortsMat = toonMaterial({ color: kit.shorts });
    this.socksMat = toonMaterial({ color: kit.socks });
    this.skinMat = toonMaterial({ color: player.skin });
    this.hairMat = toonMaterial({ color: player.hair });
    this.bootMat = toonMaterial({ color: player.boots ?? '#222222' });
    const white = toonMaterial({ color: 0xffffff });

    // Proportions in metres for scale = 1: short legs, round tummy, big head.
    const legH = 0.4, shortsH = 0.17, torsoH = 0.4, headR = this.headR;
    const hipY = legH;
    const mesh = (geo: THREE.BufferGeometry, mat: THREE.Material, outline = 0.025) => {
      const m = new THREE.Mesh(geo, mat);
      m.castShadow = true;
      addOutline(m, outline);
      return m;
    };

    const mkLeg = (side: number) => {
      const g = new THREE.Group();
      g.position.set(0, hipY, side * 0.105);
      const thigh = mesh(new THREE.CapsuleGeometry(0.085, legH * 0.3, 4, 10), this.skinMat);
      thigh.position.y = -legH * 0.22;
      const sock = mesh(new THREE.CylinderGeometry(0.08, 0.072, legH * 0.5, 10), this.socksMat);
      sock.position.y = -legH * 0.7;
      const band = mesh(new THREE.CylinderGeometry(0.084, 0.084, 0.05, 10), white, 0.02);
      band.position.y = -legH * 0.47;
      const boot = mesh(new THREE.CapsuleGeometry(0.075, 0.12, 4, 8), this.bootMat);
      boot.rotation.z = Math.PI / 2;
      boot.position.set(0.05, -legH + 0.06, 0);
      g.add(thigh, sock, band, boot);
      return g;
    };
    this.legL = mkLeg(-1);
    this.legR = mkLeg(1);

    const shorts = mesh(new THREE.CylinderGeometry(0.235, 0.215, shortsH, 14), this.shortsMat);
    shorts.position.y = hipY + shortsH / 2;

    // A capsule torso reads rounder and friendlier than a tube; the texture's centre (the number) faces -x.
    const torso = mesh(new THREE.CapsuleGeometry(0.225, torsoH - 0.2, 6, 18), this.shirtMat, 0.03);
    torso.position.y = hipY + shortsH + torsoH / 2 - 0.02;
    torso.rotation.y = Math.PI / 2;
    const collar = mesh(new THREE.TorusGeometry(0.11, 0.028, 8, 16), this.trimMat, 0.015);
    collar.rotation.x = Math.PI / 2;
    collar.position.y = hipY + shortsH + torsoH + 0.005;

    const mkArm = (side: number) => {
      const g = new THREE.Group();
      g.position.set(0, hipY + shortsH + torsoH - 0.08, side * 0.255);
      const sleeve = mesh(new THREE.CylinderGeometry(0.07, 0.062, 0.15, 8), this.sleeveMat);
      sleeve.position.y = -0.07;
      const cuff = mesh(new THREE.CylinderGeometry(0.066, 0.066, 0.035, 8), this.trimMat, 0.015);
      cuff.position.y = -0.15;
      const arm = mesh(new THREE.CapsuleGeometry(0.052, 0.14, 4, 8), this.skinMat);
      arm.position.y = -0.26;
      const hand = mesh(new THREE.SphereGeometry(0.068, 10, 8), this.skinMat);
      hand.position.y = -0.37;
      g.add(sleeve, cuff, arm, hand);
      return g;
    };
    this.armL = mkArm(-1);
    this.armR = mkArm(1);

    const neckY = hipY + shortsH + torsoH;
    this.head = new THREE.Group();
    this.head.position.y = neckY + headR * 0.92;
    const skull = mesh(new THREE.SphereGeometry(headR, 20, 14), this.skinMat, 0.03);
    const face = new THREE.Mesh(new THREE.SphereGeometry(headR * 1.012, 20, 14), new THREE.MeshBasicMaterial({ map: faceTexture(), transparent: true, depthWrite: false }));
    const ears = [-1, 1].map((z) => { const e = mesh(new THREE.SphereGeometry(headR * 0.26, 8, 6), this.skinMat, 0.015); e.position.set(-headR * 0.1, -headR * 0.05, z * headR * 0.98); return e; });
    this.head.add(skull, face, ...ears);
    this.buildHair(player.hairStyle ?? 'short');
    this.head.add(this.hairGroup);

    this.body.add(this.legL, this.legR, shorts, torso, collar, this.armL, this.armR, this.head);
    this.body.scale.setScalar(s);

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
  }

  setKit(kit: Kit, number: number): void {
    this.shirtMat.map = kitTexture(kit, number);
    this.shirtMat.needsUpdate = true;
    this.sleeveMat.color.set(kit.shirt);
    this.trimMat.color.set(kit.shirt2);
    this.shortsMat.color.set(kit.shorts);
    this.socksMat.color.set(kit.socks);
  }

  setLook(skin: string, hair: string, hairStyle?: Player['hairStyle'], boots?: string): void {
    this.skinMat.color.set(skin);
    this.hairMat.color.set(hair);
    if (boots) this.bootMat.color.set(boots);
    if (hairStyle) this.buildHair(hairStyle);
  }

  /** Rebuilds the hair meshes for a style. Styles are deliberately chunky and readable from above. */
  private buildHair(style: Player['hairStyle']): void {
    const g = this.hairGroup;
    while (g.children.length) {
      const c = g.children.pop() as THREE.Mesh;
      c.geometry.dispose();
    }
    const r = this.headR;
    const add = (geo: THREE.BufferGeometry, x: number, y: number, z: number, rz = 0) => {
      const m = new THREE.Mesh(geo, this.hairMat);
      m.position.set(x, y, z);
      m.rotation.z = rz;
      m.castShadow = true;
      addOutline(m, 0.02);
      g.add(m);
    };
    switch (style) {
      case 'bald':
        break;
      case 'spiky':
        add(new THREE.SphereGeometry(r * 1.04, 14, 8, 0, Math.PI * 2, 0, Math.PI * 0.42), 0, r * 0.08, 0);
        for (let i = 0; i < 5; i++) {
          const a = (i / 5) * Math.PI - Math.PI / 2;
          add(new THREE.ConeGeometry(r * 0.24, r * 0.75, 6), Math.cos(a) * r * 0.45 - 0.02, r * 1.1, Math.sin(a) * r * 0.5, Math.cos(a) * 0.5);
        }
        break;
      case 'long':
        add(new THREE.SphereGeometry(r * 1.07, 16, 10, 0, Math.PI * 2, 0, Math.PI * 0.5), 0, r * 0.08, 0, -0.2);
        add(new THREE.CylinderGeometry(r * 0.98, r * 0.82, r * 1.35, 12, 1, true, 0, Math.PI), -r * 0.05, -r * 0.45, 0);
        break;
      case 'curly':
        add(new THREE.SphereGeometry(r * 1.2, 10, 7, 0, Math.PI * 2, 0, Math.PI * 0.55), 0, r * 0.18, 0);
        for (let i = 0; i < 6; i++) {
          const a = (i / 6) * Math.PI * 2;
          add(new THREE.SphereGeometry(r * 0.34, 7, 5), Math.cos(a) * r * 0.9, r * 0.55 + (i % 2) * r * 0.2, Math.sin(a) * r * 0.9);
        }
        break;
      default:
        add(new THREE.SphereGeometry(r * 1.05, 16, 10, 0, Math.PI * 2, 0, Math.PI * 0.5), 0, r * 0.08, 0, -0.25);
        // A little fringe tuft at the front.
        add(new THREE.SphereGeometry(r * 0.3, 8, 6), r * 0.75, r * 0.72, 0);
        break;
    }
  }

  setSelected(on: boolean, colour?: number): void {
    this.ring.visible = on;
    if (colour !== undefined) (this.ring.material as THREE.MeshBasicMaterial).color.set(colour);
  }

  setFacing(yaw: number): void {
    // Sim yaw is measured in the x/z plane with 0 = +x; Three's rotation.y is anticlockwise about y.
    this.body.rotation.y = -yaw;
  }

  /**
   * Procedural animation. speed in m/s, kick 0..1 (1 = just kicked),
   * dive 0..1 with direction, dt seconds.
   */
  animate(speed: number, kick: number, dive: number, diveDir: number, dt: number, scale: number, wobble = 0): void {
    const stride = speed / Math.max(0.4, scale);
    this.walk += stride * dt * 2.2;
    this.idle += dt;
    const amp = Math.min(1, speed / 3) * 0.8;
    const swing = Math.sin(this.walk) * amp;
    // Little ones run with a wobble: the body sways side to side as they go.
    this.body.rotation.z = wobble * Math.sin(this.walk * 0.5) * 0.18 * Math.min(1, speed / 2);
    this.legL.rotation.z = swing;
    this.legR.rotation.z = -swing;
    this.armL.rotation.z = -swing * 0.9;
    this.armR.rotation.z = swing * 0.9;
    // Arms held a touch out from the body, elbows back, like a running kid.
    this.armL.rotation.x = 0.25;
    this.armR.rotation.x = -0.25;
    // Lean into the run and nod the head a little; breathe when standing still.
    this.body.rotation.x = 0;
    this.head.rotation.z = amp * 0.08 + Math.sin(this.idle * 2) * 0.03 * (1 - amp);
    this.head.rotation.y = Math.sin(this.walk * 0.5) * 0.08 * amp;
    if (kick > 0) {
      // Right leg snaps forward and back.
      this.legR.rotation.z = -Math.sin(kick * Math.PI) * 1.5;
      this.armL.rotation.z = Math.sin(kick * Math.PI) * 0.7;
      this.armR.rotation.z = -Math.sin(kick * Math.PI) * 0.4;
    }
    // Slight bob when running, a slow breath when still.
    this.body.position.y = Math.abs(Math.sin(this.walk)) * 0.035 * amp + Math.sin(this.idle * 2) * 0.004 * (1 - amp);
    if (dive > 0) {
      const t = Math.sin(Math.min(1, (1 - dive) * 2) * Math.PI * 0.5);
      this.body.rotation.x = diveDir * t * 1.2;
      this.body.position.y = t * 0.25 * scale;
      this.armL.rotation.z = -2.6 * t;
      this.armR.rotation.z = -2.6 * t;
    }
  }

  dispose(): void {
    this.group.traverse((o) => {
      const m = o as THREE.Mesh;
      if (m.isMesh) m.geometry.dispose();
    });
    [this.shirtMat, this.sleeveMat, this.trimMat, this.shortsMat, this.socksMat, this.skinMat, this.hairMat, this.bootMat].forEach((m) => m.dispose());
  }
}
