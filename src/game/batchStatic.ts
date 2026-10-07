import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';

/**
 * Merge every still mesh under `root` that shares a material into one mesh, so the stadium
 * costs a handful of draw calls instead of a couple of hundred. Phones are slow at issuing
 * draw calls, far more than at drawing the triangles themselves.
 *
 * Meshes inside `keep` (things that move or change, like the nets and the scoreboard) and meshes
 * tagged `userData.dynamic` are left alone. Run it after anything that restyles the scenery (the
 * weather paints snow and lights the lamps); materials stay shared, so later colour changes still show.
 */
export function batchStatic(root: THREE.Object3D, keep: THREE.Object3D[]): void {
  shareMaterials(root, keep);
  root.updateMatrixWorld(true);
  const toRoot = new THREE.Matrix4().copy(root.matrixWorld).invert();
  const groups = new Map<string, { mat: THREE.Material; cast: boolean; receive: boolean; geos: THREE.BufferGeometry[]; meshes: THREE.Mesh[] }>();
  const visit = (o: THREE.Object3D): void => {
    if (keep.includes(o)) return;
    const m = o as THREE.Mesh;
    if (m.isMesh && !m.userData.dynamic && !(m as THREE.InstancedMesh).isInstancedMesh && !(m as THREE.SkinnedMesh).isSkinnedMesh && !Array.isArray(m.material) && m.visible) {
      const geo = m.geometry;
      const attrs = Object.keys(geo.attributes).sort().join(',');
      const key = `${m.material.uuid}|${attrs}|${geo.index ? 'i' : 'n'}|${m.castShadow ? 1 : 0}${m.receiveShadow ? 1 : 0}|${geo.morphAttributes.position ? 'm' : ''}`;
      if (!geo.morphAttributes.position) {
        const g = groups.get(key) ?? groups.set(key, { mat: m.material, cast: m.castShadow, receive: m.receiveShadow, geos: [], meshes: [] }).get(key)!;
        g.geos.push(geo.clone().applyMatrix4(new THREE.Matrix4().multiplyMatrices(toRoot, m.matrixWorld)));
        g.meshes.push(m);
      }
    }
    for (const c of o.children) visit(c);
  };
  visit(root);

  for (const g of groups.values()) {
    if (g.meshes.length < 2) { g.geos.forEach((x) => x.dispose()); continue; }
    const merged = mergeGeometries(g.geos);
    g.geos.forEach((x) => x.dispose());
    if (!merged) continue;
    const mesh = new THREE.Mesh(merged, g.mat);
    mesh.castShadow = g.cast;
    mesh.receiveShadow = g.receive;
    // Switch the originals off rather than removing them or hiding them: hiding would also hide
    // children that were kept, while layers are checked object by object.
    for (const m of g.meshes) m.layers.disableAll();
    root.add(mesh);
  }
}

/** What makes two plain materials draw the same, or null for a material with its own shader changes. */
function materialKey(m: THREE.Material): string | null {
  if (Object.prototype.hasOwnProperty.call(m, 'onBeforeCompile')) return null;
  const x = m as THREE.Material & { color?: THREE.Color; emissive?: THREE.Color; emissiveIntensity?: number; map?: THREE.Texture | null; gradientMap?: THREE.Texture | null; roughness?: number; metalness?: number };
  return [m.type, x.color?.getHexString(), x.emissive?.getHexString(), x.emissiveIntensity, x.map?.uuid, x.gradientMap?.uuid, x.roughness, x.metalness,
    m.side, m.transparent, m.opacity, m.depthWrite, m.vertexColors, m.alphaTest, m.blending, (m as THREE.MeshBasicMaterial).fog, m.toneMapped].join('|');
}

/**
 * Many parts of the stadium make their own material of the same colour (each post, roof and frame),
 * which would keep them in separate draw calls. Swap each still mesh's material for the first one that
 * looks exactly the same, so batching can merge them.
 */
function shareMaterials(root: THREE.Object3D, keep: THREE.Object3D[]): void {
  const first = new Map<string, THREE.Material>();
  const dropped = new Set<THREE.Material>();
  const visit = (o: THREE.Object3D): void => {
    if (keep.includes(o)) return;
    const m = o as THREE.Mesh;
    if (m.isMesh && !m.userData.dynamic && !Array.isArray(m.material)) {
      const key = materialKey(m.material);
      if (key) {
        const same = first.get(key);
        if (!same) first.set(key, m.material);
        else if (same !== m.material) { dropped.add(m.material); m.material = same; }
      }
    }
    for (const c of o.children) visit(c);
  };
  visit(root);
  // Anything still using a dropped material (a kept or moving part) keeps it.
  root.traverse((o) => { const mat = (o as THREE.Mesh).material; if (mat && !Array.isArray(mat)) dropped.delete(mat); });
  for (const m of dropped) m.dispose();
}
