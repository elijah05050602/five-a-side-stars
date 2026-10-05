import * as THREE from 'three';

let gradient: THREE.DataTexture | null = null;

/** A four-step gradient so toon materials shade in flat bands like a cartoon. */
export function toonGradient(): THREE.DataTexture {
  if (gradient) return gradient;
  const data = new Uint8Array([70, 70, 70, 255, 140, 140, 140, 255, 205, 205, 205, 255, 255, 255, 255, 255]);
  gradient = new THREE.DataTexture(data, 4, 1, THREE.RGBAFormat);
  gradient.minFilter = THREE.NearestFilter;
  gradient.magFilter = THREE.NearestFilter;
  gradient.needsUpdate = true;
  return gradient;
}

export function toonMaterial(opts: { color?: THREE.ColorRepresentation; map?: THREE.Texture | null }): THREE.MeshToonMaterial {
  return new THREE.MeshToonMaterial({ color: opts.color ?? 0xffffff, map: opts.map ?? null, gradientMap: toonGradient() });
}

const outlineMat = new THREE.MeshBasicMaterial({ color: 0x12203a, side: THREE.BackSide });

/**
 * Cartoon outline: a slightly bigger copy of the mesh drawn inside-out in a
 * dark colour. Added as a child so it follows every animation.
 */
export function addOutline(mesh: THREE.Mesh, thickness = 0.03): void {
  const o = new THREE.Mesh(mesh.geometry, outlineMat);
  // Scale relative to the mesh's own size so thin and fat parts get a similar line.
  mesh.geometry.computeBoundingSphere();
  const r = mesh.geometry.boundingSphere?.radius ?? 1;
  const k = 1 + thickness / Math.max(0.05, r);
  o.scale.setScalar(k);
  o.castShadow = false;
  o.receiveShadow = false;
  mesh.add(o);
}

const smoothed = new WeakSet<THREE.BufferGeometry>();

/**
 * Low-poly models have split (flat) normals, and pushing an inverted hull out
 * along those opens cracks at every hard edge, which show as dark wedges. This
 * builds an 'outlineNormal' attribute averaged over all vertices that share a
 * position, pooled across the given meshes so parts that meet (the head and its
 * face patch) agree along their seam. Geometries are shared between clones, so
 * each is only processed once.
 */
export function smoothOutlineNormals(meshes: THREE.Mesh[]): void {
  const todo = meshes.map((m) => m.geometry).filter((g, i, all) => !smoothed.has(g) && all.indexOf(g) === i);
  if (!todo.length) return;
  const sums = new Map<string, THREE.Vector3>();
  const key = (p: THREE.BufferAttribute | THREE.InterleavedBufferAttribute, i: number) => `${p.getX(i).toFixed(3)},${p.getY(i).toFixed(3)},${p.getZ(i).toFixed(3)}`;
  for (const g of todo) {
    const pos = g.getAttribute('position'), nor = g.getAttribute('normal');
    if (!pos || !nor) continue;
    for (let i = 0; i < pos.count; i++) {
      const k = key(pos, i);
      const acc = sums.get(k) ?? sums.set(k, new THREE.Vector3()).get(k)!;
      acc.x += nor.getX(i); acc.y += nor.getY(i); acc.z += nor.getZ(i);
    }
  }
  for (const g of todo) {
    const pos = g.getAttribute('position'), nor = g.getAttribute('normal');
    if (!pos || !nor) continue;
    const out = new Float32Array(pos.count * 3);
    const v = new THREE.Vector3();
    for (let i = 0; i < pos.count; i++) {
      v.copy(sums.get(key(pos, i))!);
      if (v.lengthSq() < 1e-8) v.set(nor.getX(i), nor.getY(i), nor.getZ(i));
      v.normalize();
      out[i * 3] = v.x; out[i * 3 + 1] = v.y; out[i * 3 + 2] = v.z;
    }
    g.setAttribute('outlineNormal', new THREE.BufferAttribute(out, 3));
    smoothed.add(g);
  }
}

/**
 * Outline for a skinned mesh: the same mesh drawn again inside-out, with every
 * vertex pushed out along its (skinned) normal in the vertex shader, so the
 * line follows the animation and stays an even thickness. Uses the smoothed
 * 'outlineNormal' attribute when the geometry has one (see smoothOutlineNormals).
 */
export function addSkinnedOutline(mesh: THREE.SkinnedMesh, thickness = 0.03): THREE.SkinnedMesh {
  // A toon material with only emissive colour: constant dark, and its vertex shader skins normals.
  const mat = new THREE.MeshToonMaterial({ color: 0x000000, emissive: 0x12203a, side: THREE.BackSide });
  const smooth = !!mesh.geometry.getAttribute('outlineNormal');
  mat.onBeforeCompile = (shader) => {
    shader.uniforms.uOutline = { value: thickness };
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', `#include <common>\nuniform float uOutline;${smooth ? '\nattribute vec3 outlineNormal;' : ''}`)
      .replace('#include <beginnormal_vertex>', smooth ? 'vec3 objectNormal = vec3( outlineNormal );' : '#include <beginnormal_vertex>')
      .replace('#include <skinning_vertex>', '#include <skinning_vertex>\ntransformed += normalize(objectNormal) * uOutline;');
  };
  const o = new THREE.SkinnedMesh(mesh.geometry, mat);
  o.bind(mesh.skeleton, mesh.bindMatrix);
  o.castShadow = false;
  o.receiveShadow = false;
  o.frustumCulled = false;
  mesh.add(o);
  return o;
}
