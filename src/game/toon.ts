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

/**
 * Outline for a skinned mesh: the same mesh drawn again inside-out, with every
 * vertex pushed out along its (skinned) normal in the vertex shader, so the
 * line follows the animation and stays an even thickness.
 */
export function addSkinnedOutline(mesh: THREE.SkinnedMesh, thickness = 0.03): THREE.SkinnedMesh {
  // A toon material with only emissive colour: constant dark, and its vertex shader skins normals.
  const mat = new THREE.MeshToonMaterial({ color: 0x000000, emissive: 0x12203a, side: THREE.BackSide });
  mat.onBeforeCompile = (shader) => {
    shader.uniforms.uOutline = { value: thickness };
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', '#include <common>\nuniform float uOutline;')
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
