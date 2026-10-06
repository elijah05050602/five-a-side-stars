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
