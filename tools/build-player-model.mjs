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
// Body: the tunic is the shirt; the belt ring becomes the shorts' waistband, and the legs below it
// are painted as shorts, so the ragged tunic hem (y < 0.5 and its underside) is cut away along
// with the scarf, hip pouches and buckle. The small chest pocket is an inset in the tunic surface,
// so it is painted as shirt rather than cut.
const bodyMap = (key, [x, y, z]) => ({
  '0,1': y < 0.5 ? 'drop' : 'shirt', '1,1': 'drop', '5,0': 'shorts', '7,1': 'drop', '3,0': 'drop',
  '6,0': Math.abs(x) < 0.14 && y > 0.74 && y < 0.9 && z > 0.24 ? 'shirt' : 'drop',
})[key];
// Arms: the wrist cuff is bare skin so the sleeve ends cleanly.
const armMap = (key) => ({ '5,2': 'skin', '0,1': 'shirt', '5,0': 'shirt', '1,1': 'skin' })[key];
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
        let out = map(`${c},${r}`, p);
        if (out === undefined) { console.warn('unmapped cell', node.getName(), c, r); out = 'skin'; }
        if (typeof out === 'string') return { t: out, u: u * 8 - c, v: v * 4 - r };
        return { t: out.t, u: clamp01(out.u), v: clamp01(out.v) };
      };
      const kind = []; const newUV = [];
      for (let i = 0; i < vcount; i++) { const k = resolve(i); kind.push(k.t); newUV.push(k.u, k.v); }
      // Per vertex target cell. A triangle whose corners disagree on shirt/shorts gets its own copies
      // of the odd corners, so no triangle ever stretches across the atlas.
      const idx = Array.from(prim.getIndices().getArray());
      const keep = [], face = [];
      const dupVertex = (i, t) => {
        for (const sem of semantics) { const n = sizes[sem]; for (let k = 0; k < n; k++) attrs[sem].push(attrs[sem][i * n + k]); }
        kind.push(t); newUV.push(newUV[i * 2], newUV[i * 2 + 1]);
        return vcount++;
      };
      for (let t = 0; t < idx.length; t += 3) {
        let tri = [idx[t], idx[t + 1], idx[t + 2]];
        const ks = tri.map((i) => kind[i]);
        if (ks.includes('drop')) continue;
        if (ks.every((k) => k === 'face')) { face.push(...tri); continue; }
        if (new Set(ks).size > 1) {
          // Majority wins; with three different kinds, the lowest corner decides (hem over shirt).
          const counts = {}; ks.forEach((k) => { counts[k] = (counts[k] || 0) + 1; });
          let win = ks[0]; for (const k of ks) if (counts[k] > counts[win]) win = k;
          if (ks.includes('face')) win = ks.find((k) => k !== 'face');
          tri = tri.map((i) => (kind[i] === win ? i : dupVertex(i, win)));
        }
        keep.push(...tri);
      }
      // Final UVs into the chosen cell.
      const uvOut = new Float32Array(vcount * 2);
      const faceUV = new Float32Array(vcount * 2);
      for (let i = 0; i < vcount; i++) {
        const t = kind[i] === 'face' ? 'skin' : kind[i] === 'drop' ? 'skin' : kind[i];
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
