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
const CELL = { skin: [0, 0], hair: [1, 0], eyes: [2, 0], brow: [3, 0], shirt: [0, 1], shirt2: [1, 1], shorts: [2, 1], socks: [3, 1] };
const MAP = {
  Head_long: { '0,0': 'skin', '1,0': 'hair', '2,0': 'eyes', '3,0': 'skin' },
  Head_short: { '0,0': 'skin', '1,0': 'hair', '2,0': 'eyes', '1,1': 'hair' },
  Head_plain: { '0,0': 'skin', '1,0': 'hair', '2,0': 'eyes' },
  // The belt holds the tunic and its hem together, so it stays but is painted as shirt.
  Rogue_Body: { '0,1': 'shirt', '1,1': 'shirt2', '6,0': 'shirt', '3,0': 'shirt', '5,0': 'shirt', '7,1': 'shirt' },
  Rogue_ArmLeft: { '5,2': 'skin', '0,1': 'shirt', '5,0': 'shirt', '1,1': 'shirt2' },
  Rogue_ArmRight: { '5,2': 'skin', '0,1': 'shirt', '5,0': 'shirt', '1,1': 'shirt2' },
  Rogue_LegLeft: { '3,2': 'shorts', '7,1': 'socks', '0,0': 'skin' },
  Rogue_LegRight: { '3,2': 'shorts', '7,1': 'socks', '0,0': 'skin' },
};
if (REMAP) {
  const faceMat = doc.createMaterial('face').setDoubleSided(false);
  for (const node of root.listNodes()) {
    const m = MAP[node.getName()]; if (!m || !node.getMesh()) continue;
    const isHead = node.getName().startsWith('Head_');
    // three.js names loaded meshes after the glTF mesh, so give meshes their node's name.
    node.getMesh().setName(node.getName());
    for (const prim of node.getMesh().listPrimitives()) {
      const uv = prim.getAttribute('TEXCOORD_0');
      const pos = prim.getAttribute('POSITION').getArray();
      const src = uv.getArray();
      const arr = Float32Array.from(src);
      const vcount = arr.length / 2;
      // Per-vertex semantic target; eyes and brows are painted on the face texture instead of modelled.
      const kind = new Array(vcount);
      for (let i = 0; i < vcount; i++) {
        const u = src[i * 2], v = src[i * 2 + 1];
        const c = Math.min(7, Math.floor(u * 8)), r = Math.min(3, Math.floor(v * 4));
        let target = m[`${c},${r}`];
        if (!target) { console.warn('unmapped cell', node.getName(), c, r); target = 'skin'; }
        const y = pos[i * 3 + 1], z = pos[i * 3 + 2];
        if (target === 'hair' && y < 1.78 && z > 0.3) target = 'brow';
        if (isHead && target === 'skin' && z > 0.25 && y > 1.3 && y < 1.92) target = 'face';
        kind[i] = target;
        const t = CELL[target === 'face' ? 'skin' : target];
        arr[i * 2] = (t[0] + (u * 8 - c)) / 8; arr[i * 2 + 1] = (t[1] + (v * 4 - r)) / 4;
      }
      // Split triangles: dropped (modelled eyes/brows, belt and pouches), face, or body.
      const idx = Array.from(prim.getIndices().getArray());
      const keep = [], face = [];
      const DROP = new Set(isHead ? ['eyes', 'brow'] : []);
      for (let t = 0; t < idx.length; t += 3) {
        const ks = [kind[idx[t]], kind[idx[t + 1]], kind[idx[t + 2]]];
        if (ks.some((k) => DROP.has(k))) continue;
        if (ks.every((k) => k === 'face')) face.push(idx[t], idx[t + 1], idx[t + 2]);
        else keep.push(idx[t], idx[t + 1], idx[t + 2]);
      }
      const buffer = root.listBuffers()[0];
      prim.setIndices(doc.createAccessor().setType('SCALAR').setArray(new Uint16Array(keep)).setBuffer(buffer));
      prim.setAttribute('TEXCOORD_0', doc.createAccessor().setType('VEC2').setArray(arr).setBuffer(buffer));
      if (face.length) {
        // Planar UVs over the face box so a 2D face texture lands eyes-at-eye-height.
        const fuv = new Float32Array(vcount * 2);
        for (let i = 0; i < vcount; i++) { fuv[i * 2] = (pos[i * 3] + 0.36) / 0.72; fuv[i * 2 + 1] = (1.92 - pos[i * 3 + 1]) / 0.62; }
        const fp = doc.createPrimitive().setMaterial(faceMat).setMode(prim.getMode());
        for (const sem of prim.listSemantics()) fp.setAttribute(sem, prim.getAttribute(sem));
        fp.setAttribute('TEXCOORD_0', doc.createAccessor().setType('VEC2').setArray(fuv).setBuffer(buffer));
        fp.setIndices(doc.createAccessor().setType('SCALAR').setArray(new Uint16Array(face)).setBuffer(buffer));
        node.getMesh().addPrimitive(fp);
        console.log(node.getName(), 'face tris', face.length / 3, 'kept', keep.length / 3, 'of', idx.length / 3);
      } else console.log(node.getName(), 'kept', keep.length / 3, 'of', idx.length / 3);
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
