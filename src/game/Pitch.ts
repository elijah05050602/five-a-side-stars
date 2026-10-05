import * as THREE from 'three';

export interface PitchDims { length: number; width: number; goalWidth: number; goalHeight: number; goalDepth: number }

/** Grass, markings, rebound boards and two goals with nets. */
export function buildPitch(d: PitchDims): THREE.Group {
  const g = new THREE.Group();
  const L = d.length, W = d.width;

  // Grass with mown stripes drawn into a texture.
  const c = document.createElement('canvas');
  c.width = 512; c.height = 512;
  const ctx = c.getContext('2d')!;
  const stripes = 10;
  for (let i = 0; i < stripes; i++) {
    ctx.fillStyle = i % 2 === 0 ? '#2eb872' : '#29a866';
    ctx.fillRect((i * 512) / stripes, 0, 512 / stripes + 1, 512);
  }
  const grassTex = new THREE.CanvasTexture(c);
  grassTex.colorSpace = THREE.SRGBColorSpace;
  const grass = new THREE.Mesh(new THREE.PlaneGeometry(L + 6, W + 6), new THREE.MeshStandardMaterial({ map: grassTex, roughness: 1 }));
  grass.rotation.x = -Math.PI / 2;
  grass.receiveShadow = true;
  g.add(grass);

  // Surround: a darker apron outside the boards so the pitch reads as a unit.
  const apron = new THREE.Mesh(new THREE.PlaneGeometry(L + 40, W + 40), new THREE.MeshStandardMaterial({ color: 0x1f8f57, roughness: 1 }));
  apron.rotation.x = -Math.PI / 2;
  apron.position.y = -0.01;
  g.add(apron);

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
  // Centre circle
  const circle = new THREE.Mesh(new THREE.RingGeometry(W * 0.12 - lw, W * 0.12, 48), lineMat);
  circle.rotation.x = -Math.PI / 2;
  circle.position.y = 0.005;
  g.add(circle);
  const spot = new THREE.Mesh(new THREE.CircleGeometry(0.12, 12), lineMat);
  spot.rotation.x = -Math.PI / 2;
  spot.position.y = 0.006;
  g.add(spot);
  // D-shaped goal areas
  for (const sx of [-1, 1]) {
    const arc = new THREE.Mesh(new THREE.RingGeometry(W * 0.26 - lw, W * 0.26, 48, 1, sx > 0 ? Math.PI / 2 : -Math.PI / 2, Math.PI), lineMat);
    arc.rotation.x = -Math.PI / 2;
    arc.position.set((sx * L) / 2, 0.005, 0);
    g.add(arc);
    const pen = new THREE.Mesh(new THREE.CircleGeometry(0.12, 12), lineMat);
    pen.rotation.x = -Math.PI / 2;
    pen.position.set(sx * (L / 2 - W * 0.26 - 0.6), 0.006, 0);
    g.add(pen);
  }

  // Rebound boards around the pitch, leaving the goal mouths open.
  const boardH = 0.9;
  const boardMat = new THREE.MeshStandardMaterial({ color: 0x3da5f4, roughness: 0.6 });
  const boardTop = new THREE.MeshStandardMaterial({ color: 0x1b4fd8, roughness: 0.6 });
  const board = (x: number, z: number, lx: number, lz: number) => {
    const m = new THREE.Mesh(new THREE.BoxGeometry(lx, boardH, lz), boardMat);
    m.position.set(x, boardH / 2, z);
    m.castShadow = true;
    g.add(m);
    const cap = new THREE.Mesh(new THREE.BoxGeometry(lx + 0.05, 0.08, lz + 0.05), boardTop);
    cap.position.set(x, boardH + 0.02, z);
    g.add(cap);
  };
  const t = 0.15;
  board(0, -W / 2 - t / 2, L + t * 2, t);
  board(0, W / 2 + t / 2, L + t * 2, t);
  const sideLen = (W - d.goalWidth) / 2;
  for (const sx of [-1, 1]) {
    board(sx * (L / 2 + t / 2), -(d.goalWidth / 2 + sideLen / 2), t, sideLen);
    board(sx * (L / 2 + t / 2), d.goalWidth / 2 + sideLen / 2, t, sideLen);
    g.add(buildGoal(sx, d));
  }

  // A few cheerful cones/trees around the outside so the camera edge isn't bare.
  const treeMat = new THREE.MeshStandardMaterial({ color: 0x1d8f5a, roughness: 1 });
  const trunkMat = new THREE.MeshStandardMaterial({ color: 0x8b5a2b, roughness: 1 });
  for (let i = 0; i < 14; i++) {
    const tree = new THREE.Group();
    const trunk = new THREE.Mesh(new THREE.CylinderGeometry(0.15, 0.2, 0.8, 6), trunkMat);
    trunk.position.y = 0.4;
    const top = new THREE.Mesh(new THREE.ConeGeometry(1.1, 2.4, 7), treeMat);
    top.position.y = 1.9;
    top.castShadow = true;
    tree.add(trunk, top);
    const a = (i / 14) * Math.PI * 2;
    tree.position.set(Math.cos(a) * (L / 2 + 7 + (i % 3)), 0, Math.sin(a) * (W / 2 + 7 + ((i * 2) % 3)));
    g.add(tree);
  }
  return g;
}

function buildGoal(sx: number, d: PitchDims): THREE.Group {
  const g = new THREE.Group();
  const postR = 0.06;
  const postMat = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.4 });
  const gw = d.goalWidth, gh = d.goalHeight, gd = d.goalDepth;
  const x0 = sx * d.length / 2;
  const post = (z: number) => {
    const m = new THREE.Mesh(new THREE.CylinderGeometry(postR, postR, gh, 10), postMat);
    m.position.set(x0, gh / 2, z);
    m.castShadow = true;
    g.add(m);
  };
  post(-gw / 2);
  post(gw / 2);
  const bar = new THREE.Mesh(new THREE.CylinderGeometry(postR, postR, gw + postR * 2, 10), postMat);
  bar.rotation.x = Math.PI / 2;
  bar.position.set(x0, gh, 0);
  g.add(bar);
  // Back frame
  const backBar = new THREE.Mesh(new THREE.CylinderGeometry(postR * 0.7, postR * 0.7, gw + postR * 2, 8), postMat);
  backBar.rotation.x = Math.PI / 2;
  backBar.position.set(x0 + sx * gd, gh * 0.5, 0);
  g.add(backBar);
  for (const z of [-gw / 2, gw / 2]) {
    const side = new THREE.Mesh(new THREE.CylinderGeometry(postR * 0.7, postR * 0.7, Math.hypot(gd, gh * 0.5), 8), postMat);
    side.position.set(x0 + sx * gd / 2, gh * 0.75, z);
    side.rotation.z = sx * Math.atan2(gd, gh * 0.5) ;
    g.add(side);
  }
  // Net: translucent panels (back, top, sides)
  const netMat = new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.35, side: THREE.DoubleSide, depthWrite: false });
  const back = new THREE.Mesh(new THREE.PlaneGeometry(gw, gh * 0.55), netMat);
  back.position.set(x0 + sx * gd, gh * 0.27, 0);
  back.rotation.y = Math.PI / 2;
  g.add(back);
  const top = new THREE.Mesh(new THREE.PlaneGeometry(Math.hypot(gd, gh * 0.5), gw), netMat);
  top.position.set(x0 + sx * gd / 2, gh * 0.75, 0);
  top.rotation.x = Math.PI / 2;
  top.rotation.y = sx * -Math.atan2(gh * 0.5, gd);
  g.add(top);
  for (const z of [-gw / 2, gw / 2]) {
    const shape = new THREE.Shape();
    shape.moveTo(0, 0);
    shape.lineTo(sx * gd, 0);
    shape.lineTo(sx * gd, gh * 0.5);
    shape.lineTo(0, gh);
    shape.closePath();
    const sideNet = new THREE.Mesh(new THREE.ShapeGeometry(shape), netMat);
    sideNet.position.set(x0, 0, z);
    g.add(sideNet);
  }
  return g;
}
