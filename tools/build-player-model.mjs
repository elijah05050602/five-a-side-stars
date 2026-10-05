// Builds public/models/player.glb from the KayKit Adventurers pack (CC0):
// Rogue body + Rogue/Mage/Knight heads on one rig, no weapons or capes, only the
// animations the game uses, and UVs remapped to the colour grid src/game/playerAtlas.ts paints.
//
// One-off tool, not part of the build. To run it:
//   git clone https://github.com/KayKit-Game-Assets/KayKit-Character-Pack-Adventures-1.0 /tmp/kaykit
//   npm i --no-save @gltf-transform/core @gltf-transform/functions @gltf-transform/extensions
//   KAYKIT=/tmp/kaykit/addons/kaykit_character_pack_adventures/Characters/gltf \
//     node tools/build-player-model.mjs public/models/player.glb remap
import { NodeIO } from '@gltf-transform/core';
import { ALL_EXTENSIONS } from '@gltf-transform/extensions';
import { mergeDocuments, prune, dedup, resample, unpartition, quantize } from '@gltf-transform/functions';
import fs from 'fs';

const PACK = process.env.KAYKIT || '/tmp/kaykit/addons/kaykit_character_pack_adventures/Characters/gltf';
const OUT = process.argv[2] || 'player.glb';
const REMAP = process.argv[3] === 'remap';
const KEEP_ANIMS = ['Idle', 'Walking_A', 'Running_A', 'Running_B', 'Cheer', 'Unarmed_Melee_Attack_Kick', 'Dodge_Left', 'Dodge_Right', 'Hit_A', 'Jump_Full_Short'];
const io = new NodeIO().registerExtensions(ALL_EXTENSIONS);

const doc = await io.read(`${PACK}/Rogue.glb`);
const root = doc.getRoot();
const scene = root.listScenes()[0];
const skin = root.listSkins()[0];
const findNode = (d, name) => d.getRoot().listNodes().find((n) => n.getName() === name);

// Drop props and the cape.
for (const name of ['Knife_Offhand', '1H_Crossbow', '2H_Crossbow', 'Knife', 'Throwable', 'Rogue_Cape']) {
  const n = findNode(doc, name); if (n) { n.getMesh()?.dispose(); n.dispose(); }
}
// Keep only the animations we use.
const dropAnim = (a) => { a.listChannels().forEach((c) => c.dispose()); a.listSamplers().forEach((s) => s.dispose()); a.dispose(); };
for (const a of root.listAnimations()) if (!KEEP_ANIMS.includes(a.getName())) dropAnim(a);

const headParent = findNode(doc, 'Rogue_Head').getParentNode() ?? scene;
const ibmA = skin.getInverseBindMatrices().getArray();

// Borrow heads from the other adventurers: same rig, same joint order.
for (const [file, nodeName, newName] of [['Mage', 'Mage_Head', 'Head_short'], ['Knight', 'Knight_Head', 'Head_plain']]) {
  const src = await io.read(`${PACK}/${file}.glb`);
  const srcSkin = src.getRoot().listSkins()[0];
  const ibmB = srcSkin.getInverseBindMatrices().getArray();
  let maxDiff = 0; for (let i = 0; i < ibmA.length; i++) maxDiff = Math.max(maxDiff, Math.abs(ibmA[i] - ibmB[i]));
  const jointsSame = srcSkin.listJoints().map((j) => j.getName()).join() === skin.listJoints().map((j) => j.getName()).join();
  console.log(file, 'ibm max diff', maxDiff.toFixed(5), 'joints same', jointsSame);
  for (const a of src.getRoot().listAnimations()) dropAnim(a);
  const map = mergeDocuments(doc, src);
  const head = map.get(findNode(src, nodeName));
  head.setName(newName);
  head.detach();
  head.setSkin(skin);
  // Point the head's material at the rogue material so there is one texture.
  head.getMesh().listPrimitives().forEach((p) => p.setMaterial(root.listMaterials()[0]));
  if (headParent === scene) scene.addChild(head); else headParent.addChild(head);
  // Everything else from the merged document goes.
  for (const s of root.listScenes()) if (s !== scene) { const all = []; s.traverse((n) => all.push(n)); all.forEach((n) => { n.getMesh()?.dispose(); n.dispose(); }); s.dispose(); }
}
findNode(doc, 'Rogue_Head').setName('Head_long');

// Semantic atlas: every body part gets its own cell so the game can paint kit colours.
// Cells are (col,row) on an 8x4 grid; the game paints the same grid (see src/game/playerAtlas.ts).
// 'leg' and 'boot' cells use a flat vertical mapping (v = top..bottom) so the painter can draw
// shorts/skin and sock/boot bands at exact heights; the boot also maps u = heel..toe.
const CELL = { skin: [0, 0], hair: [1, 0], eyes: [2, 0], brow: [3, 0], shirt: [0, 1], shirt2: [1, 1], shorts: [2, 1], leg: [3, 1], boot: [4, 1] };
const headMap = (extra) => (key, [, y, z]) => {
  const t = { '0,0': 'skin', '1,0': 'hair', '2,0': 'eyes', ...extra }[key];
  if (t === 'hair' && y < 1.78 && z > 0.3) return 'brow';
  if (t === 'skin' && z > 0.25 && y > 1.3 && y < 1.92) return 'face';
  return t;
};
// Body: the tunic is the shirt, mapped by angle round the torso (u) and height (v) so kit stripes
// run straight and continue over the neck cap; the belt ring becomes the shorts' waistband, and
// the legs below it are painted as shorts, so the ragged tunic hem (y < 0.5 and its underside) is
// cut away along with the scarf, hip pouches and buckle. The small chest pocket is an inset in
// the tunic surface, so it is painted as shirt (same mapping) rather than cut.
const shirtUV = (x, y, z) => ({ t: 'shirt', u: 0.5 + Math.atan2(x, z) / (2 * Math.PI), v: 0.19 + (1.15 - y) * 0.6, wrap: true });
const bodyMap = (key, [x, y, z]) => ({
  '0,1': y < 0.5 ? 'drop' : y > 1.12 ? 'cut' : shirtUV(x, y, z), '1,1': 'drop', '5,0': 'shorts', '7,1': 'drop', '3,0': 'drop',
  '6,0': Math.abs(x) < 0.14 && y > 0.74 && y < 0.9 && z > 0.24 ? shirtUV(x, y, z) : 'drop',
})[key];
// Arms: the sleeve and shoulder band keep their u but are squeezed into the plain middle of the
// shirt cell (the painter puts the collar at the top and the tucked-in ring at the bottom); the
// wrist cuff is bare skin so the sleeve ends cleanly.
const armMap = (key, _p, [cu, cv]) => ({
  '5,2': 'skin', '1,1': 'skin',
  '0,1': { t: 'shirt', u: cu, v: 0.27 + Math.min(1, cv / 0.65) * 0.26 },
  '5,0': 'drop', // the raised shoulder strap; the sleeve continues underneath
})[key];
// Legs: upper leg (y 0.53..0.28) becomes a vertical strip; the foot block (y 0.22..0) too, with u heel..toe.
const legMap = (key, [, y, z]) => key === '7,1' ? { t: 'leg', u: 0.5, v: (0.53 - y) / 0.25 }
  : key === '3,2' ? { t: 'boot', u: (z + 0.13) / 0.39, v: (0.22 - y) / 0.22 }
  : key === '0,0' ? 'skin' : undefined;
const MAP = {
  Head_long: headMap({ '3,0': 'skin' }),
  Head_short: headMap({ '1,1': 'hair' }),
  Head_plain: headMap({}),
  Rogue_Body: bodyMap,
  Rogue_ArmLeft: armMap, Rogue_ArmRight: armMap,
  Rogue_LegLeft: legMap, Rogue_LegRight: legMap,
};
const clamp01 = (v) => Math.min(0.98, Math.max(0.02, v));

// ---- Hole capping -------------------------------------------------------------------------------
// Cutting parts away (scarf, hem, eyes, brows, pouches) leaves open edges, and the game's inverted
// hull outline shows through any opening as a dark patch. Every closed boundary loop is filled
// with a flat fan/ear-clip cap made of the loop's own vertices, so UVs, normals and skin weights
// come along for free. Caps go into the last primitive that holds the whole loop, which puts eye
// sockets into the painted face patch.
const dot3 = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
const cross3 = (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
const unit = (a) => { const l = Math.hypot(a[0], a[1], a[2]) || 1; return [a[0] / l, a[1] / l, a[2] / l]; };
function earClip(p) {
  const idx = p.map((_, i) => i);
  let area = 0;
  for (let i = 0; i < p.length; i++) { const a = p[i], b = p[(i + 1) % p.length]; area += a[0] * b[1] - b[0] * a[1]; }
  if (area < 0) idx.reverse();
  const cr = (a, b, c) => (b[0] - a[0]) * (c[1] - a[1]) - (b[1] - a[1]) * (c[0] - a[0]);
  const inside = (q, a, b, c) => cr(a, b, q) >= -1e-9 && cr(b, c, q) >= -1e-9 && cr(c, a, q) >= -1e-9;
  const tris = [];
  let guard = 0;
  while (idx.length > 3 && guard++ < 5000) {
    let found = false;
    for (let i = 0; i < idx.length; i++) {
      const i0 = idx[(i + idx.length - 1) % idx.length], i1 = idx[i], i2 = idx[(i + 1) % idx.length];
      if (cr(p[i0], p[i1], p[i2]) <= 1e-9) continue;
      if (idx.some((j) => j !== i0 && j !== i1 && j !== i2 && inside(p[j], p[i0], p[i1], p[i2]))) continue;
      tris.push([i0, i1, i2]); idx.splice(i, 1); found = true; break;
    }
    if (!found) { for (let i = 1; i < idx.length - 1; i++) tris.push([idx[0], idx[i], idx[i + 1]]); return tris; }
  }
  if (idx.length === 3) tris.push([idx[0], idx[1], idx[2]]);
  return tris;
}
function capHoles(mesh, name) {
  const prims = mesh.listPrimitives();
  const P = prims.map((p) => p.getAttribute('POSITION').getArray());
  const I = prims.map((p) => Array.from(p.getIndices().getArray()));
  const owners = []; const wid = new Map();
  const W = prims.map((_, pi) => new Int32Array(P[pi].length / 3).fill(-1));
  // Only vertices that triangles still use: cut-away parts left duplicates at the same positions
  // (with their own UVs), and a cap must not pick those up.
  const used = prims.map((_, pi) => new Set(I[pi]));
  for (let pi = 0; pi < prims.length; pi++) for (let i = 0; i < W[pi].length; i++) {
    if (!used[pi].has(i)) continue;
    const pos = [P[pi][3 * i], P[pi][3 * i + 1], P[pi][3 * i + 2]];
    const k = pos.map((v) => v.toFixed(3)).join(',');
    let w = wid.get(k);
    if (w === undefined) { w = owners.length; wid.set(k, w); owners.push({ pos, by: new Map() }); }
    if (!owners[w].by.has(pi)) owners[w].by.set(pi, i);
    W[pi][i] = w;
  }
  const edges = new Map();
  for (let pi = 0; pi < prims.length; pi++) for (let t = 0; t < I[pi].length; t += 3) for (let e = 0; e < 3; e++) {
    const a = W[pi][I[pi][t + e]], b = W[pi][I[pi][t + (e + 1) % 3]];
    if (a === b) continue;
    const k = a < b ? `${a}_${b}` : `${b}_${a}`;
    edges.set(k, (edges.get(k) || 0) + 1);
  }
  const adj = new Map();
  for (const [k, n] of edges) if (n === 1) { const [a, b] = k.split('_').map(Number); (adj.get(a) || adj.set(a, []).get(a)).push(b); (adj.get(b) || adj.set(b, []).get(b)).push(a); }
  const centre = [0, 0, 0];
  for (const o of owners) for (let c = 0; c < 3; c++) centre[c] += o.pos[c] / owners.length;

  // New vertices are appended to a primitive's (un-shared) attribute arrays.
  const ext = prims.map(() => null);
  const arraysFor = (pi) => {
    if (!ext[pi]) {
      const prim = prims[pi];
      for (const sem of prim.listSemantics()) prim.setAttribute(sem, prim.getAttribute(sem).clone());
      ext[pi] = { arrays: Object.fromEntries(prim.listSemantics().map((sem) => [sem, Array.from(prim.getAttribute(sem).getArray())])), count: prim.getAttribute('POSITION').getCount() };
    }
    return ext[pi];
  };
  const addVertex = (pi, src, { pos, normal, uv }) => {
    const e = arraysFor(pi); const prim = prims[pi];
    for (const sem of prim.listSemantics()) {
      const n = prim.getAttribute(sem).getElementSize();
      const vals = sem === 'POSITION' && pos ? pos : sem === 'NORMAL' && normal ? normal : sem === 'TEXCOORD_0' && uv ? uv : e.arrays[sem].slice(src * n, src * n + n);
      e.arrays[sem].push(...vals);
    }
    return e.count++;
  };
  const shirtAt = (p) => { const m = shirtUV(p[0], p[1], p[2]); return [(CELL.shirt[0] + clamp01(m.u)) / 8, (CELL.shirt[1] + clamp01(m.v)) / 4]; };
  const collarUV = () => [(CELL.shirt[0] + 0.5) / 8, (CELL.shirt[1] + 0.1) / 4];

  const seen = new Set(); const added = prims.map(() => 0);
  for (const s of adj.keys()) {
    if (seen.has(s)) continue;
    const loop = []; let cur = s, prev = -1;
    while (cur !== undefined && !seen.has(cur)) { seen.add(cur); loop.push(cur); const nx = adj.get(cur).filter((n) => n !== prev); prev = cur; cur = nx[0]; }
    if (loop.length < 3) continue;
    // Which primitive holds every vertex of the loop? The face patch is preferred, so eye sockets
    // are painted by the face texture.
    const order = [...prims.keys()].sort((a, b) => (prims[b].getMaterial()?.getName() === 'face') - (prims[a].getMaterial()?.getName() === 'face'));
    let pi = -1;
    for (const p of order) if (loop.every((w) => owners[w].by.has(p))) { pi = p; break; }
    if (pi < 0) { console.warn(name, 'hole spans primitives, left open:', loop.length, 'vertices'); continue; }
    const prim = prims[pi];
    const pts = loop.map((w) => owners[w].pos);
    const n = [0, 0, 0];
    for (let i = 0; i < pts.length; i++) { const a = pts[i], b = pts[(i + 1) % pts.length]; n[0] += (a[1] - b[1]) * (a[2] + b[2]); n[1] += (a[2] - b[2]) * (a[0] + b[0]); n[2] += (a[0] - b[0]) * (a[1] + b[1]); }
    const nn = unit(n);
    const lc = [0, 0, 0];
    for (const p of pts) for (let c = 0; c < 3; c++) lc[c] += p[c] / pts.length;
    // Face the cap outward: along the rim's own normals when they agree, else away from the mesh.
    const NA = prim.getAttribute('NORMAL')?.getArray();
    const rimN = [0, 0, 0];
    if (NA) for (const w of loop) { const i = owners[w].by.get(pi); for (let c = 0; c < 3; c++) rimN[c] += NA[3 * i + c]; }
    const away = [lc[0] - centre[0], lc[1] - centre[1], lc[2] - centre[2]];
    const ref = Math.hypot(...rimN) > loop.length * 0.3 ? rimN : away;
    const flip = dot3(nn, ref) < 0;
    const emit = (tri) => { if (flip) tri.reverse(); I[pi].push(...tri); added[pi]++; };
    const xs = pts.map((p) => p[0]), ys = pts.map((p) => p[1]);
    const [x0, x1, y0, y1] = [Math.min(...xs), Math.max(...xs), Math.min(...ys), Math.max(...ys)];
    const isHead = name.startsWith('Head_'), isFacePrim = prim.getMaterial()?.getName() === 'face';
    if (process.env.CAPLOG) console.log(name, 'cap', loop.length, 'verts in', prim.getMaterial()?.getName(), 'x', x0.toFixed(2), x1.toFixed(2), 'y', y0.toFixed(2), y1.toFixed(2), 'n', nn.map((c) => c.toFixed(2)).join(','), 'flip', flip);

    if (name === 'Rogue_Body' && lc[1] > 0.85) {
      // ---- The neck. The opening is the tunic's top ring plus a V down the chest where the scarf
      // hung. The V is filled with a convex chest patch; the ring gets a short collar band that
      // leans in towards the neck and a lid on top, so the shirt reads as a round crew neck.
      const srcOf = (k) => owners[loop[k]].by.get(pi);
      const COLLAR_Y = 1.05;
      const isV = (k) => pts[k][1] < COLLAR_Y && pts[k][2] > 0;
      let a = loop.findIndex((_, k) => isV(k) && !isV((k + loop.length - 1) % loop.length));
      const run = [];
      if (a >= 0) for (let k = a; isV(k); k = (k + 1) % loop.length) run.push(k);
      const nL = loop.length;
      const before = a >= 0 ? (a + nL - 1) % nL : -1, after = a >= 0 ? (run[run.length - 1] + 1) % nL : -1;
      // Chest patch: corner, V run, corner, fanned to a point pushed out to the chest surface.
      if (run.length) {
        const vIdx = [before, ...run, after];
        const vPts = vIdx.map((k) => pts[k]);
        const zFront = Math.max(...vPts.map((p) => p[2]));
        const cv = [vPts.reduce((t, p) => t + p[0], 0) / vPts.length, vPts.reduce((t, p) => t + p[1], 0) / vPts.length, zFront * 0.97];
        const cIdx = addVertex(pi, srcOf(run[0]), { pos: cv, normal: [0, 0.25, 0.97], uv: shirtAt(cv) });
        const copies = vIdx.map((k) => addVertex(pi, srcOf(k), { normal: unit([pts[k][0] * 0.6, 0.2, 1]), uv: shirtAt(pts[k]) }));
        for (let i = 0; i < copies.length - 1; i++) emit([copies[i], copies[i + 1], cIdx]);
        emit([copies[copies.length - 1], copies[0], cIdx]); // across the neckline chord
      }
      // Collar: the ring (collar-height vertices in loop order, closed across the V's corners).
      const ring = [];
      if (run.length) { for (let k = after; k !== before; k = (k + 1) % nL) ring.push(k); ring.push(before); }
      else for (let k = 0; k < nL; k++) ring.push(k);
      const rPts = ring.map((k) => pts[k]);
      const cx = rPts.reduce((t, p) => t + p[0], 0) / rPts.length, cz = rPts.reduce((t, p) => t + p[2], 0) / rPts.length;
      const yTop = Math.max(...rPts.map((p) => p[1]));
      const outer = ring.map((k) => addVertex(pi, srcOf(k), { normal: unit([pts[k][0] - cx, 0.6, pts[k][2] - cz]), uv: collarUV() }));
      const inner = ring.map((k) => { const p = pts[k]; const q = [cx + (p[0] - cx) * 0.62, yTop + 0.07, cz + (p[2] - cz) * 0.62]; return addVertex(pi, srcOf(k), { pos: q, normal: unit([p[0] - cx, 1.1, p[2] - cz]), uv: collarUV() }); });
      const top = addVertex(pi, srcOf(ring[0]), { pos: [cx, yTop + 0.08, cz], normal: [0, 1, 0], uv: collarUV() });
      for (let i = 0; i < ring.length; i++) {
        const j = (i + 1) % ring.length;
        emit([outer[i], outer[j], inner[j]]);
        emit([outer[i], inner[j], inner[i]]);
        emit([inner[i], inner[j], top]);
      }
      continue;
    }

    const u = unit(cross3(nn, Math.abs(nn[0]) < 0.9 ? [1, 0, 0] : [0, 1, 0])), v = cross3(nn, u);
    const tris = earClip(pts.map((p) => [dot3(p, u), dot3(p, v)]));
    // Face holes get their own vertices with chosen UVs and a flat normal: eye sockets map onto the
    // eye drawn in the face texture, so the painted eye (with its expressions and gaze) fills the
    // socket exactly; other holes (brow slots, nose, ear notches) continue the flat face mapping.
    let uvFor = null;
    if (isHead && isFacePrim && x1 - x0 < 0.35 && (y0 + y1) / 2 < 1.7 && Math.abs(lc[0]) > 0.1 && Math.abs(lc[0]) < 0.33) {
      // Face texture eye centres: u = 0.5 -/+ 0.28 (the kid's right eye is at +x), v = 0.49.
      const cu = lc[0] > 0 ? 0.5 - 0.28 : 0.5 + 0.28;
      uvFor = (p) => [cu + ((p[0] - x0) / (x1 - x0) - 0.5) * 0.2, 0.49 + ((y1 - p[1]) / (y1 - y0) - 0.5) * 0.22];
    } else if (isHead && isFacePrim) uvFor = (p) => [(p[0] + 0.36) / 0.72, (1.92 - p[1]) / 0.62];
    let vertexOf = (k) => owners[loop[k]].by.get(pi);
    if (uvFor) {
      const nrm = flip ? nn.map((c) => -c) : nn;
      const copies = new Map();
      vertexOf = (k) => { if (!copies.has(k)) copies.set(k, addVertex(pi, owners[loop[k]].by.get(pi), { normal: nrm, uv: uvFor(owners[loop[k]].pos) })); return copies.get(k); };
    }
    for (const t of tris) emit(t.map(vertexOf));
  }
  prims.forEach((prim, pi) => {
    if (ext[pi]) for (const sem of prim.listSemantics()) { const a = prim.getAttribute(sem); a.setArray(new (a.getArray().constructor)(ext[pi].arrays[sem])); }
    if (added[pi]) prim.getIndices().setArray(new Uint16Array(I[pi]));
  });
  if (added.some((n) => n)) console.log(name, 'capped', added.reduce((a, b) => a + b, 0), 'triangles over', seen.size, 'boundary vertices');
}

if (REMAP) {
  const faceMat = doc.createMaterial('face').setDoubleSided(false);
  for (const node of root.listNodes()) {
    const map = MAP[node.getName()]; if (!map || !node.getMesh()) continue;
    // three.js names loaded meshes after the glTF mesh, so give meshes their node's name.
    node.getMesh().setName(node.getName());
    for (const prim of node.getMesh().listPrimitives()) {
      const semantics = prim.listSemantics();
      const attrs = Object.fromEntries(semantics.map((sem) => [sem, Array.from(prim.getAttribute(sem).getArray())]));
      const sizes = Object.fromEntries(semantics.map((sem) => [sem, prim.getAttribute(sem).getElementSize()]));
      const src = attrs.TEXCOORD_0, pos = attrs.POSITION;
      let vcount = src.length / 2;
      const resolve = (i) => {
        const u = src[i * 2], v = src[i * 2 + 1];
        const c = Math.min(7, Math.floor(u * 8)), r = Math.min(3, Math.floor(v * 4));
        const p = [pos[i * 3], pos[i * 3 + 1], pos[i * 3 + 2]];
        let out = map(`${c},${r}`, p, [u * 8 - c, v * 4 - r]);
        if (out === undefined) { console.warn('unmapped cell', node.getName(), c, r); out = 'skin'; }
        if (typeof out === 'string') return { t: out, u: u * 8 - c, v: v * 4 - r };
        return { t: out.t, u: out.wrap ? out.u : clamp01(out.u), v: clamp01(out.v), wrap: !!out.wrap };
      };
      const kind = []; const newUV = []; const wrap = [];
      for (let i = 0; i < vcount; i++) { const k = resolve(i); kind.push(k.t); newUV.push(k.u, k.v); wrap.push(!!k.wrap); }
      // Per vertex target cell. A triangle whose corners disagree on shirt/shorts gets its own copies
      // of the odd corners, so no triangle ever stretches across the atlas.
      const idx = Array.from(prim.getIndices().getArray());
      const keep = [], face = [];
      const dupVertex = (i, t, du = 0) => {
        for (const sem of semantics) { const n = sizes[sem]; for (let k = 0; k < n; k++) attrs[sem].push(attrs[sem][i * n + k]); }
        kind.push(t); newUV.push(newUV[i * 2] + du, newUV[i * 2 + 1]); wrap.push(wrap[i]);
        return vcount++;
      };
      for (let t = 0; t < idx.length; t += 3) {
        let tri = [idx[t], idx[t + 1], idx[t + 2]];
        const ks = tri.map((i) => kind[i]);
        // 'drop' removes a triangle when its corners mostly agree; 'cut' removes it on any corner,
        // which leaves a clean edge along a mesh row (used for the tunic's rolled top).
        if (ks.includes('drop') || ks.includes('cut')) continue;
        if (ks.every((k) => k === 'face')) { face.push(...tri); continue; }
        if (new Set(ks).size > 1) {
          // Majority wins; with three different kinds, the lowest corner decides (hem over shirt).
          const counts = {}; ks.forEach((k) => { counts[k] = (counts[k] || 0) + 1; });
          let win = ks[0]; for (const k of ks) if (counts[k] > counts[win]) win = k;
          if (ks.includes('face')) win = ks.find((k) => k !== 'face');
          tri = tri.map((i) => (kind[i] === win ? i : dupVertex(i, win)));
        }
        // Angle-mapped shirt triangles that straddle the back seam: shift the low-u corners up by
        // one cell. The painter repeats the shirt in the next cell, so the seam disappears.
        if (tri.every((i) => wrap[i])) {
          const us = tri.map((i) => newUV[i * 2]);
          if (Math.max(...us) - Math.min(...us) > 0.5) tri = tri.map((i) => (newUV[i * 2] < 0.5 ? dupVertex(i, kind[i], 1) : i));
        }
        keep.push(...tri);
      }
      // Final UVs into the chosen cell.
      const uvOut = new Float32Array(vcount * 2);
      const faceUV = new Float32Array(vcount * 2);
      for (let i = 0; i < vcount; i++) {
        const t = kind[i] === 'face' || kind[i] === 'drop' || kind[i] === 'cut' ? 'skin' : kind[i];
        const cell = CELL[t]; if (!cell) throw new Error('no cell for ' + t);
        uvOut[i * 2] = (cell[0] + newUV[i * 2]) / 8; uvOut[i * 2 + 1] = (cell[1] + newUV[i * 2 + 1]) / 4;
        // Planar UVs over the face box so a 2D face texture lands eyes-at-eye-height.
        faceUV[i * 2] = (attrs.POSITION[i * 3] + 0.36) / 0.72; faceUV[i * 2 + 1] = (1.92 - attrs.POSITION[i * 3 + 1]) / 0.62;
      }
      const buffer = root.listBuffers()[0];
      const mk = (sem, arr) => { const a = prim.getAttribute(sem); const acc = doc.createAccessor().setType(a.getType()).setBuffer(buffer).setNormalized(a.getNormalized()); acc.setArray(new (arr.constructor === Array ? a.getArray().constructor : arr.constructor)(arr)); return acc; };
      for (const sem of semantics) if (sem !== 'TEXCOORD_0') prim.setAttribute(sem, mk(sem, attrs[sem]));
      prim.setAttribute('TEXCOORD_0', doc.createAccessor().setType('VEC2').setArray(uvOut).setBuffer(buffer));
      prim.setIndices(doc.createAccessor().setType('SCALAR').setArray(new Uint16Array(keep)).setBuffer(buffer));
      if (face.length) {
        const fp = doc.createPrimitive().setMaterial(faceMat).setMode(prim.getMode());
        for (const sem of semantics) fp.setAttribute(sem, prim.getAttribute(sem));
        fp.setAttribute('TEXCOORD_0', doc.createAccessor().setType('VEC2').setArray(faceUV).setBuffer(buffer));
        fp.setIndices(doc.createAccessor().setType('SCALAR').setArray(new Uint16Array(face)).setBuffer(buffer));
        node.getMesh().addPrimitive(fp);
      }
      console.log(node.getName(), 'tris kept', keep.length / 3, 'face', face.length / 3, 'of', idx.length / 3, 'verts', vcount);
    }
    capHoles(node.getMesh(), node.getName());
  }
  // The game paints its own atlas, so the pack texture is not shipped.
  for (const t of root.listTextures()) t.dispose();
}
await doc.transform(prune({ keepAttributes: true }), dedup(), resample(), quantize({ quantizePosition: 14, quantizeNormal: 8, quantizeTexcoord: 12 }), unpartition());
await io.write(OUT, doc);
const st = fs.statSync(OUT);
console.log('wrote', OUT, (st.size / 1024).toFixed(0), 'KB');
console.log('nodes with meshes:', root.listNodes().filter((n) => n.getMesh()).map((n) => n.getName()).join(', '));
console.log('anims:', root.listAnimations().map((a) => a.getName()).join(', '));
// Body-only bounds (skinned meshes in bind pose)
let min = [1e9, 1e9, 1e9], max = [-1e9, -1e9, -1e9];
for (const n of root.listNodes()) if (n.getMesh()) for (const p of n.getMesh().listPrimitives()) { const a = p.getAttribute('POSITION'); const mn = a.getMin([]), mx = a.getMax([]); for (let i = 0; i < 3; i++) { min[i] = Math.min(min[i], mn[i]); max[i] = Math.max(max[i], mx[i]); } }
console.log('bounds', min.map((v) => v.toFixed(2)), max.map((v) => v.toFixed(2)));
// Where does the nose point? Head mesh extremes on x and z.
const head = findNode(doc, 'Head_long'); const pos = head.getMesh().listPrimitives()[0].getAttribute('POSITION').getArray();
let xs = [1e9, -1e9], zs = [1e9, -1e9]; for (let i = 0; i < pos.length; i += 3) { xs = [Math.min(xs[0], pos[i]), Math.max(xs[1], pos[i])]; zs = [Math.min(zs[0], pos[i + 2]), Math.max(zs[1], pos[i + 2])]; }
console.log('head x', xs.map((v) => v.toFixed(2)), 'z', zs.map((v) => v.toFixed(2)));
