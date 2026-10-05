import * as THREE from 'three';

let ballTex: THREE.CanvasTexture | null = null;

function texture(): THREE.CanvasTexture {
  if (ballTex) return ballTex;
  const c = document.createElement('canvas');
  c.width = 256; c.height = 128;
  const ctx = c.getContext('2d')!;
  ctx.fillStyle = '#ffffff';
  ctx.fillRect(0, 0, 256, 128);
  ctx.fillStyle = '#1b1b1b';
  // A sprinkling of dark patches reads as a classic ball when it spins.
  const spots = [[32, 30], [96, 70], [160, 28], [224, 72], [64, 108], [192, 110], [128, 10], [0, 70], [256, 70]];
  for (const [x, y] of spots) {
    ctx.beginPath();
    ctx.moveTo(x, y - 16);
    for (let i = 1; i < 5; i++) ctx.lineTo(x + Math.sin((i * Math.PI * 2) / 5) * 16, y - Math.cos((i * Math.PI * 2) / 5) * 16);
    ctx.closePath();
    ctx.fill();
  }
  ballTex = new THREE.CanvasTexture(c);
  ballTex.colorSpace = THREE.SRGBColorSpace;
  return ballTex;
}

export class BallModel {
  readonly group = new THREE.Group();
  private readonly mesh: THREE.Mesh;
  private readonly shadow: THREE.Mesh;

  constructor(radius: number) {
    this.mesh = new THREE.Mesh(new THREE.SphereGeometry(radius, 20, 14), new THREE.MeshStandardMaterial({ map: texture(), roughness: 0.5 }));
    this.mesh.castShadow = true;
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
}
