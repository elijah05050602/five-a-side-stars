import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import * as THREE from 'three';
import { TextureCache, disposeObject, releaseTexture, shared } from '../game/renderer';
import { PlayerModel } from '../game/PlayerModel';
import { clearPlayerAtlasCache } from '../game/playerAtlas';
import { clearFaceCache } from '../game/playerFace';
import { makeKit, makePlayer } from '../data/defaults';

/** Anything with a dispose event, and whether it has fired. */
function watch<T extends THREE.EventDispatcher<{ dispose: object }>>(x: T): T & { disposed: boolean } {
  const w = x as T & { disposed: boolean };
  if (w.disposed === undefined) {
    w.disposed = false;
    w.addEventListener('dispose', () => { w.disposed = true; });
  }
  return w;
}
const texture = () => watch(new THREE.Texture());

describe('texture cache', () => {
  it('paints each key once and hands the same texture to everyone who asks', () => {
    const cache = new TextureCache<THREE.Texture>(2);
    let painted = 0;
    const make = () => { painted++; return texture(); };
    const a = cache.acquire('a', make);
    expect(cache.acquire('a', make)).toBe(a);
    expect(painted).toBe(1);
  });

  it('never disposes a texture someone holds, however many others come and go', () => {
    const cache = new TextureCache<THREE.Texture>(2);
    const held = cache.acquire('held', texture) as ReturnType<typeof texture>;
    for (let i = 0; i < 50; i++) releaseTexture(cache.acquire(`k${i}`, texture));
    expect(held.disposed).toBe(false);
    expect(cache.size).toBe(3); // the held one and two spares
  });

  it('keeps only the most recently used spares and disposes older ones', () => {
    const cache = new TextureCache<THREE.Texture>(2);
    const t = ['a', 'b', 'c', 'd'].map((k) => cache.acquire(k, texture) as ReturnType<typeof texture>);
    t.forEach((x) => releaseTexture(x));
    expect(t.map((x) => x.disposed)).toEqual([true, true, false, false]);
    // Using c again makes it the newest spare, so d is the next to go.
    releaseTexture(cache.acquire('c', texture));
    releaseTexture(cache.acquire('e', texture));
    expect(t[2].disposed).toBe(false);
    expect(t[3].disposed).toBe(true);
  });

  it('counts holds, so a texture two kids share lasts until both let go', () => {
    const cache = new TextureCache<THREE.Texture>(0);
    const a = cache.acquire('a', texture) as ReturnType<typeof texture>;
    cache.acquire('a', texture);
    releaseTexture(a);
    expect(a.disposed).toBe(false);
    releaseTexture(a);
    expect(a.disposed).toBe(true);
  });

  it('clearIdle disposes every texture nobody holds and keeps the rest', () => {
    const cache = new TextureCache<THREE.Texture>(10);
    const held = cache.acquire('held', texture) as ReturnType<typeof texture>;
    const spare = cache.acquire('spare', texture) as ReturnType<typeof texture>;
    releaseTexture(spare);
    cache.clearIdle();
    expect(spare.disposed).toBe(true);
    expect(held.disposed).toBe(false);
    expect(cache.size).toBe(1);
  });

  it('ignores textures it did not make and releases with no hold left', () => {
    const cache = new TextureCache<THREE.Texture>(0);
    const a = cache.acquire('a', texture);
    const b = cache.acquire('b', texture) as ReturnType<typeof texture>;
    releaseTexture(new THREE.Texture());
    releaseTexture(null);
    releaseTexture(undefined);
    releaseTexture(a);
    releaseTexture(a);
    expect(b.disposed).toBe(false);
    // a went with its last hold, so asking again paints a new one.
    expect(cache.acquire('a', texture)).not.toBe(a);
  });
});

describe('disposeObject', () => {
  it('frees geometry, materials and their textures, skeletons, instances and shadow maps', () => {
    const map = texture();
    const geo = watch(new THREE.BoxGeometry());
    const mat = watch(new THREE.MeshToonMaterial({ map }));
    const root = new THREE.Group();
    root.add(new THREE.Mesh(geo, mat));
    const skinned = new THREE.SkinnedMesh(watch(new THREE.BoxGeometry()), watch(new THREE.MeshBasicMaterial()));
    const skeleton = new THREE.Skeleton([new THREE.Bone()]);
    skeleton.computeBoneTexture();
    const bones = watch(skeleton.boneTexture!);
    skinned.bind(skeleton);
    const crowd = watch(new THREE.InstancedMesh(new THREE.BoxGeometry(), new THREE.MeshBasicMaterial(), 4));
    const sun = new THREE.DirectionalLight();
    const shadowMap = watch(new THREE.WebGLRenderTarget(4, 4));
    sun.shadow.map = shadowMap;
    root.add(skinned, crowd, sun);
    disposeObject(root);
    expect([geo, mat, map, bones, crowd, shadowMap].map((x) => x.disposed)).toEqual([true, true, true, true, true, true]);
  });

  it('leaves shared geometry, materials and textures for their other users', () => {
    const gradient = shared(texture());
    const geo = shared(watch(new THREE.BoxGeometry()));
    const outline = shared(watch(new THREE.MeshBasicMaterial({ map: texture() })));
    const own = watch(new THREE.MeshToonMaterial({ gradientMap: gradient }));
    const root = new THREE.Group();
    root.add(new THREE.Mesh(geo, own), new THREE.Mesh(geo, outline));
    disposeObject(root);
    expect(own.disposed).toBe(true);
    expect(gradient.disposed).toBe(false);
    expect(geo.disposed).toBe(false);
    expect(outline.disposed).toBe(false);
    expect((outline.map as ReturnType<typeof texture>).disposed).toBe(false);
  });
});

describe('a kid\'s cached textures', () => {
  // Just enough of a canvas for the painting code, which only ever draws.
  const ctx = new Proxy({}, { get: () => () => ({ addColorStop() { /* a gradient */ } }), set: () => true });
  beforeAll(() => { (globalThis as { document?: unknown }).document = { createElement: () => ({ width: 0, height: 0, getContext: () => ctx }) }; });
  afterAll(() => { delete (globalThis as { document?: unknown }).document; });
  type Kid = { material: THREE.MeshToonMaterial; faceMat: THREE.MeshToonMaterial; updateFace(mood: string, gx: number, gy: number, dt: number): void };
  const kid = (m: PlayerModel) => m as unknown as Kid;
  const red = makeKit('#e63946', '#ffffff', '#1b2a41', '#e63946', 'stripes');
  const blue = makeKit('#3da5f4', '#ffd23f', '#ffffff', '#3da5f4', 'hoops');

  it('are handed back however often the kit, look and face change', async () => {
    const m = new PlayerModel(makePlayer('ATT', 7, 'Mia'), red, 1);
    // The model file cannot load here, so the stand-in kid is built as well.
    await new Promise((r) => setTimeout(r, 0));
    const worn = new Set<ReturnType<typeof texture>>();
    const note = () => { worn.add(watch(kid(m).material.map!)); worn.add(watch(kid(m).faceMat.map!)); };
    note();
    m.setKit(blue, 9); note();
    m.setLook('#a86b3c', '#d35400', 'curly', '#ffffff', 'stripes'); note();
    for (const [mood, gx] of [['happy', 0], ['focus', 0.5], ['neutral', -1], ['focus', 0.5]] as const) { kid(m).updateFace(mood, gx, 0, 0.016); note(); }
    m.setKit(blue, 9); note();
    expect(worn.size).toBeGreaterThan(5);
    m.dispose();
    clearPlayerAtlasCache();
    clearFaceCache();
    expect([...worn].filter((t) => !t.disposed)).toHaveLength(0);
  });

  it('stay while another kid in the same kit and look still wears them', () => {
    const sam = makePlayer('DEF', 4, 'Sam');
    const a = new PlayerModel(sam, red, 1);
    const b = new PlayerModel(sam, red, 1);
    const atlas = watch(kid(a).material.map!);
    expect(kid(b).material.map).toBe(atlas);
    a.dispose();
    clearPlayerAtlasCache();
    expect(atlas.disposed).toBe(false);
    b.dispose();
    clearPlayerAtlasCache();
    expect(atlas.disposed).toBe(true);
  });
});
