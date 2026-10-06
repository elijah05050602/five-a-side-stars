import * as THREE from 'three';
import { disposeObject, shared } from './renderer';
import { addOutline, toonMaterial } from './toon';

let ballTex: THREE.CanvasTexture | null = null;

/**
 * Face normals of a truncated icosahedron (the classic 32-panel football):
 * 12 pentagons sit on the icosahedron's vertices and 20 hexagons on its faces.
 * Each comes with its plane's distance from the centre (edge length 1).
 */
function ballFaces(): { n: THREE.Vector3; h: number; pent: boolean }[] {
  const g = (1 + Math.sqrt(5)) / 2;
  const out: { n: THREE.Vector3; h: number; pent: boolean }[] = [];
  const add = (x: number, y: number, z: number, pent: boolean) => out.push({ n: new THREE.Vector3(x, y, z).normalize(), h: pent ? 2.32744 : 2.26728, pent });
  for (const a of [-1, 1]) for (const b of [-1, 1]) {
    add(0, a, b * g, true); add(a, b * g, 0, true); add(b * g, 0, a, true);
    add(0, a * g, b / g, false); add(a * g, b / g, 0, false); add(b / g, 0, a * g, false);
  }
  for (const a of [-1, 1]) for (const b of [-1, 1]) for (const c of [-1, 1]) add(a, b, c, false);
  return out;
}

/**
 * Paint the panels onto the sphere's equirectangular UVs pixel by pixel: each
 * pixel's direction is projected onto the polyhedron, so pentagons stay
 * pentagons at the poles too, with thin stitched seams between panels.
 */
function texture(): THREE.CanvasTexture {
  if (ballTex) return ballTex;
  const W = 512, H = 256;
  const c = document.createElement('canvas');
  c.width = W; c.height = H;
  const ctx = c.getContext('2d')!;
  const img = ctx.createImageData(W, H);
  const faces = ballFaces();
  for (let py = 0; py < H; py++) {
    const theta = ((py + 0.5) / H) * Math.PI;
    const st = Math.sin(theta), ct = Math.cos(theta);
    for (let px = 0; px < W; px++) {
      const phi = ((px + 0.5) / W) * Math.PI * 2;
      // Same mapping as THREE.SphereGeometry.
      const x = -Math.cos(phi) * st, y = ct, z = Math.sin(phi) * st;
      let best = -1, second = -1, bestFace = faces[0];
      for (const f of faces) {
        const v = (x * f.n.x + y * f.n.y + z * f.n.z) / f.h;
        if (v > best) { second = best; best = v; bestFace = f; } else if (v > second) second = v;
      }
      const seam = (best - second) / best < 0.012;
      const [r, gr, b] = seam ? (bestFace.pent ? [40, 40, 46] : [150, 156, 166]) : bestFace.pent ? [27, 27, 32] : [250, 250, 250];
      const i = (py * W + px) * 4;
      img.data[i] = r; img.data[i + 1] = gr; img.data[i + 2] = b; img.data[i + 3] = 255;
    }
  }
  ctx.putImageData(img, 0, 0);
  // Painted once and kept: every match's ball wears it.
  ballTex = shared(new THREE.CanvasTexture(c));
  ballTex.colorSpace = THREE.SRGBColorSpace;
  ballTex.anisotropy = 4;
  return ballTex;
}

export class BallModel {
  readonly group = new THREE.Group();
  private readonly mesh: THREE.Mesh;
  private readonly shadow: THREE.Mesh;

  constructor(radius: number) {
    this.mesh = new THREE.Mesh(new THREE.SphereGeometry(radius, 32, 24), toonMaterial({ map: texture() }));
    this.mesh.castShadow = true;
    addOutline(this.mesh, 0.02);
    this.shadow = new THREE.Mesh(new THREE.CircleGeometry(radius * 1.1, 16), new THREE.MeshBasicMaterial({ color: 0x000000, transparent: true, opacity: 0.3, depthWrite: false }));
    this.shadow.rotation.x = -Math.PI / 2;
    this.shadow.position.y = 0.012;
    this.group.add(this.mesh, this.shadow);
  }

  update(x: number, y: number, z: number, radius: number, vx: number, vz: number, dt: number): void {
    this.group.position.set(x, 0, z);
    this.mesh.position.y = y + radius;
    const speed = Math.hypot(vx, vz);
    if (speed > 0.01) {
      // Roll about the axis perpendicular to travel.
      const axis = new THREE.Vector3(vz, 0, -vx).normalize();
      this.mesh.rotateOnWorldAxis(axis, (speed * dt) / radius);
    }
    const sh = 1 / (1 + y * 0.8);
    this.shadow.scale.setScalar(sh);
    (this.shadow.material as THREE.MeshBasicMaterial).opacity = 0.3 * sh;
  }

  /** Free the ball's geometry and materials (the panel texture stays for the next ball). */
  dispose(): void {
    disposeObject(this.group);
  }
}
