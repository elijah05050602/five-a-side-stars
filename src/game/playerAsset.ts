import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { clone as cloneSkeleton } from 'three/examples/jsm/utils/SkeletonUtils.js';

/**
 * The rigged kid model (public/models/player.glb, CC0, see LICENSE.md there).
 * Loaded once and cloned per player; each clone gets its own skeleton and mixer.
 */
export interface PlayerAsset {
  scene: THREE.Group;
  clips: Map<string, THREE.AnimationClip>;
  /** Height of the model in its own units, feet to the top of the head. */
  height: number;
}

let pending: Promise<PlayerAsset> | null = null;
let loaded: PlayerAsset | null = null;

export function playerAssetUrl(): string {
  return `${import.meta.env.BASE_URL}models/player.glb`;
}

/** Starts loading (idempotent). Call early so the model is ready before the first match. */
export function loadPlayerAsset(): Promise<PlayerAsset> {
  if (pending) return pending;
  pending = new GLTFLoader().loadAsync(playerAssetUrl()).then((gltf) => {
    const scene = gltf.scene;
    scene.updateMatrixWorld(true);
    const box = new THREE.Box3().setFromObject(scene);
    const clips = new Map<string, THREE.AnimationClip>();
    for (const c of gltf.animations) clips.set(c.name, c);
    loaded = { scene, clips, height: box.max.y - box.min.y };
    return loaded;
  });
  return pending;
}

export function playerAssetNow(): PlayerAsset | null {
  return loaded;
}

/** A deep clone with its own bones, so animating one player never moves another. */
export function cloneRig(asset: PlayerAsset): THREE.Group {
  return cloneSkeleton(asset.scene) as THREE.Group;
}
