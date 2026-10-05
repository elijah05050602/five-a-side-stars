import * as THREE from 'three';
import type { Kit, Player } from '../data/types';
import { kitTexture } from './kitTexture';

const shadowGeo = new THREE.CircleGeometry(0.42, 20);
const shadowMat = new THREE.MeshBasicMaterial({ color: 0x000000, transparent: true, opacity: 0.28, depthWrite: false });

/**
 * A chunky low-poly footballer built from primitives, so every part of the kit
 * can be recoloured instantly. Local +x is "forward"; call setFacing(yaw).
 */
export class PlayerModel {
  readonly group = new THREE.Group();
  private readonly body = new THREE.Group();
  private readonly legL: THREE.Group;
  private readonly legR: THREE.Group;
  private readonly armL: THREE.Group;
  private readonly armR: THREE.Group;
  private readonly shirtMat: THREE.MeshStandardMaterial;
  private readonly sleeveMat: THREE.MeshStandardMaterial;
  private readonly shortsMat: THREE.MeshStandardMaterial;
  private readonly socksMat: THREE.MeshStandardMaterial;
  private readonly skinMat: THREE.MeshStandardMaterial;
  private readonly hairMat: THREE.MeshStandardMaterial;
  private readonly ring: THREE.Mesh;
  private walk = 0;

  constructor(player: Player, kit: Kit, scale: number) {
    const s = scale;
    this.shirtMat = new THREE.MeshStandardMaterial({ map: kitTexture(kit, player.number), roughness: 0.85 });
    this.sleeveMat = new THREE.MeshStandardMaterial({ color: kit.shirt, roughness: 0.85 });
    this.shortsMat = new THREE.MeshStandardMaterial({ color: kit.shorts, roughness: 0.9 });
    this.socksMat = new THREE.MeshStandardMaterial({ color: kit.socks, roughness: 0.9 });
    this.skinMat = new THREE.MeshStandardMaterial({ color: player.skin, roughness: 0.7 });
    this.hairMat = new THREE.MeshStandardMaterial({ color: player.hair, roughness: 0.95 });
    const bootMat = new THREE.MeshStandardMaterial({ color: 0x222222, roughness: 0.6 });

    // Proportions in metres for scale = 1 (a 10-year-old, about 1.4 m tall, with a big head).
    const legH = 0.42, shortsH = 0.16, torsoH = 0.42, headR = 0.19;
    const hipY = legH;

    const mkLeg = (side: number) => {
      const g = new THREE.Group();
      g.position.set(0, hipY, side * 0.1);
      const sock = new THREE.Mesh(new THREE.CylinderGeometry(0.075, 0.07, legH * 0.62, 10), this.socksMat);
      sock.position.y = -legH * 0.69;
      const thigh = new THREE.Mesh(new THREE.CylinderGeometry(0.085, 0.078, legH * 0.42, 10), this.skinMat);
      thigh.position.y = -legH * 0.2;
      const boot = new THREE.Mesh(new THREE.BoxGeometry(0.22, 0.09, 0.13), bootMat);
      boot.position.set(0.04, -legH + 0.045, 0);
      g.add(sock, thigh, boot);
      return g;
    };
    this.legL = mkLeg(-1);
    this.legR = mkLeg(1);

    const shorts = new THREE.Mesh(new THREE.CylinderGeometry(0.21, 0.2, shortsH, 12), this.shortsMat);
    shorts.position.y = hipY + shortsH / 2;

    const torso = new THREE.Mesh(new THREE.CylinderGeometry(0.2, 0.21, torsoH, 16, 1, false), this.shirtMat);
    torso.position.y = hipY + shortsH + torsoH / 2;
    // Rotate so the texture's centre (the number) faces -x (the player's back).
    torso.rotation.y = Math.PI / 2;

    const mkArm = (side: number) => {
      const g = new THREE.Group();
      g.position.set(0, hipY + shortsH + torsoH - 0.05, side * 0.25);
      const sleeve = new THREE.Mesh(new THREE.CylinderGeometry(0.065, 0.06, 0.16, 8), this.sleeveMat);
      sleeve.position.y = -0.08;
      const arm = new THREE.Mesh(new THREE.CylinderGeometry(0.055, 0.05, 0.2, 8), this.skinMat);
      arm.position.y = -0.25;
      const hand = new THREE.Mesh(new THREE.SphereGeometry(0.06, 8, 6), this.skinMat);
      hand.position.y = -0.36;
      g.add(sleeve, arm, hand);
      return g;
    };
    this.armL = mkArm(-1);
    this.armR = mkArm(1);

    const neckY = hipY + shortsH + torsoH;
    const head = new THREE.Mesh(new THREE.SphereGeometry(headR, 16, 12), this.skinMat);
    head.position.y = neckY + headR * 0.95;
    const hair = new THREE.Mesh(new THREE.SphereGeometry(headR * 1.04, 16, 10, 0, Math.PI * 2, 0, Math.PI * 0.5), this.hairMat);
    hair.position.y = neckY + headR * 1.0;
    hair.rotation.z = -0.25; // fringe tilts forward
    const eyeGeo = new THREE.SphereGeometry(0.025, 6, 6);
    const eyeMat = new THREE.MeshBasicMaterial({ color: 0x1b2a41 });
    const eyeL = new THREE.Mesh(eyeGeo, eyeMat);
    const eyeR = new THREE.Mesh(eyeGeo, eyeMat);
    eyeL.position.set(headR * 0.85, head.position.y + 0.02, -0.07);
    eyeR.position.set(headR * 0.85, head.position.y + 0.02, 0.07);

    this.body.add(this.legL, this.legR, shorts, torso, this.armL, this.armR, head, hair, eyeL, eyeR);
    this.body.scale.setScalar(s);
    this.body.traverse((o) => { if ((o as THREE.Mesh).isMesh) { o.castShadow = true; } });

    const shadow = new THREE.Mesh(shadowGeo, shadowMat);
    shadow.rotation.x = -Math.PI / 2;
    shadow.position.y = 0.01;
    shadow.scale.setScalar(s);

    this.ring = new THREE.Mesh(new THREE.RingGeometry(0.42, 0.52, 32), new THREE.MeshBasicMaterial({ color: 0xffd23f, transparent: true, opacity: 0.9, depthWrite: false }));
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
    this.shortsMat.color.set(kit.shorts);
    this.socksMat.color.set(kit.socks);
  }

  setLook(skin: string, hair: string): void {
    this.skinMat.color.set(skin);
    this.hairMat.color.set(hair);
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
    const amp = Math.min(1, speed / 3) * 0.75;
    const swing = Math.sin(this.walk) * amp;
    // Little ones run with a wobble: the body sways side to side as they go.
    this.body.rotation.z = wobble * Math.sin(this.walk * 0.5) * 0.18 * Math.min(1, speed / 2);
    this.legL.rotation.z = swing;
    this.legR.rotation.z = -swing;
    this.armL.rotation.z = -swing * 0.8;
    this.armR.rotation.z = swing * 0.8;
    if (kick > 0) {
      // Right leg snaps forward and back.
      this.legR.rotation.z = -Math.sin(kick * Math.PI) * 1.4;
      this.armL.rotation.z = Math.sin(kick * Math.PI) * 0.6;
    }
    // Slight bob when running.
    this.body.position.y = Math.abs(Math.sin(this.walk)) * 0.03 * amp;
    if (dive > 0) {
      const t = Math.sin(Math.min(1, (1 - dive) * 2) * Math.PI * 0.5);
      this.body.rotation.x = diveDir * t * 1.2;
      this.body.position.y = t * 0.25 * scale;
      this.armL.rotation.z = -2.6 * t;
      this.armR.rotation.z = -2.6 * t;
    } else {
      this.body.rotation.x = 0;
    }
  }

  dispose(): void {
    this.group.traverse((o) => {
      const m = o as THREE.Mesh;
      if (m.isMesh) {
        m.geometry.dispose();
      }
    });
    [this.shirtMat, this.sleeveMat, this.shortsMat, this.socksMat, this.skinMat, this.hairMat].forEach((m) => m.dispose());
  }
}
