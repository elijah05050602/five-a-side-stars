// @ts-ignore The project has no Node typings (tsconfig types: vite/client); vitest runs this file in Node.
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { CELL } from '../game/playerAtlas';

/**
 * Checks public/models/player.glb (built by tools/build-player-model.mjs) against what the game
 * needs from it. The file is read directly, without three.js: GLB header, JSON chunk, BIN chunk.
 */
interface Accessor { bufferView?: number; byteOffset?: number; componentType: number; normalized?: boolean; count: number; type: string; sparse?: unknown }
interface TextureTransform { offset?: [number, number]; rotation?: number; scale?: [number, number] }
interface Material { name?: string; pbrMetallicRoughness?: { baseColorTexture?: { extensions?: { KHR_texture_transform?: TextureTransform } } } }
interface Primitive { attributes: Record<string, number>; indices?: number; material?: number; mode?: number }
interface Gltf {
  extensionsRequired?: string[];
  nodes: { name?: string; mesh?: number }[];
  meshes: { name?: string; primitives: Primitive[] }[];
  materials?: Material[];
  images?: unknown[];
  skins?: { joints: number[] }[];
  animations?: { name?: string }[];
  accessors: Accessor[];
  bufferViews: { buffer: number; byteOffset?: number; byteLength: number; byteStride?: number }[];
}
interface Glb { json: Gltf; bin: DataView }

function readGlb(bytes: Uint8Array): Glb {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  if (view.getUint32(0, true) !== 0x46546c67 || view.getUint32(4, true) !== 2) throw new Error('not a glTF 2.0 binary');
  const end = Math.min(view.getUint32(8, true), bytes.byteLength);
  let json: Gltf | undefined, bin: DataView | undefined;
  for (let at = 12; at + 8 <= end; ) {
    const length = view.getUint32(at, true), type = view.getUint32(at + 4, true);
    if (type === 0x4e4f534a) json = JSON.parse(new TextDecoder().decode(bytes.subarray(at + 8, at + 8 + length))) as Gltf;
    else if (type === 0x004e4942) bin = new DataView(bytes.buffer, bytes.byteOffset + at + 8, length);
    at += 8 + length;
  }
  if (!json || !bin) throw new Error('GLB without a JSON or a BIN chunk');
  // Only quantised attributes and texture transforms are decoded here (the game's GLTFLoader has no
  // Draco or meshopt decoder either).
  const unread = (json.extensionsRequired ?? []).filter((e) => e !== 'KHR_mesh_quantization' && e !== 'KHR_texture_transform');
  if (unread.length) throw new Error(`cannot read ${unread.join(', ')}`);
  return { json, bin };
}

const COMPONENTS: Record<string, number> = { SCALAR: 1, VEC2: 2, VEC3: 3, VEC4: 4 };
const BYTES: Record<number, number> = { 5120: 1, 5121: 1, 5122: 2, 5123: 2, 5125: 4, 5126: 4 };

/** An accessor's elements. Normalised integers (KHR_mesh_quantization) come back in their float range. */
function readAccessor({ json, bin }: Glb, index: number): number[][] {
  const a = json.accessors[index];
  if (a.bufferView === undefined || a.sparse) throw new Error(`accessor ${index} is sparse or has no buffer view`);
  const bv = json.bufferViews[a.bufferView];
  if (bv.buffer !== 0) throw new Error(`accessor ${index} is not in the GLB's own buffer`);
  const n = COMPONENTS[a.type], size = BYTES[a.componentType];
  const stride = bv.byteStride ?? n * size;
  const start = (bv.byteOffset ?? 0) + (a.byteOffset ?? 0);
  const read = (at: number): number => {
    switch (a.componentType) {
      case 5120: return a.normalized ? Math.max(bin.getInt8(at) / 127, -1) : bin.getInt8(at);
      case 5121: return a.normalized ? bin.getUint8(at) / 255 : bin.getUint8(at);
      case 5122: return a.normalized ? Math.max(bin.getInt16(at, true) / 32767, -1) : bin.getInt16(at, true);
      case 5123: return a.normalized ? bin.getUint16(at, true) / 65535 : bin.getUint16(at, true);
      case 5125: return bin.getUint32(at, true);
      case 5126: return bin.getFloat32(at, true);
      default: throw new Error(`accessor ${index} has unknown component type ${a.componentType}`);
    }
  };
  return Array.from({ length: a.count }, (_, i) => Array.from({ length: n }, (_, c) => read(start + i * stride + c * size)));
}

/** The material's KHR_texture_transform, if any, applied as three.js's GLTFLoader does (T * R * S). */
function textureUV(material: Material | undefined): (uv: number[]) => [number, number] {
  const t = material?.pbrMetallicRoughness?.baseColorTexture?.extensions?.KHR_texture_transform;
  const [ox, oy] = t?.offset ?? [0, 0], [sx, sy] = t?.scale ?? [1, 1];
  const c = Math.cos(t?.rotation ?? 0), s = Math.sin(t?.rotation ?? 0);
  return ([u, v]) => [ox + c * sx * u + s * sy * v, oy - s * sx * u + c * sy * v];
}

const glb = readGlb(readFileSync(new URL('../../public/models/player.glb', import.meta.url)) as Uint8Array);
const { json } = glb;
const materialOf = (p: Primitive): Material | undefined => (p.material === undefined ? undefined : json.materials?.[p.material]);
const HEADS = ['Head_plain', 'Head_short', 'Head_long'];
/** Every clip PlayerModel plays: the locomotion clips (clipName) and the one-shots (startOneShot). */
const CLIPS = ['Idle', 'Walking_A', 'Running_B', 'Cheer', 'Dodge_Left', 'Dodge_Right', 'Hit_A', 'PickUp', 'Throw', 'Sit_Floor_Down'];

describe('player model file', () => {
  it('gives every head a face patch, so the faces can react', () => {
    expect((json.materials ?? []).map((m) => m.name)).toContain('face');
    for (const name of HEADS) {
      const node = json.nodes.find((n) => n.name === name);
      expect(node?.mesh, name).toBeDefined();
      expect(json.meshes[node!.mesh!].primitives.some((p) => materialOf(p)?.name === 'face'), name).toBe(true);
    }
  });

  it('embeds no images, since the game paints its own textures', () => {
    expect(json.images ?? []).toHaveLength(0);
  });

  it('has the heads and the chest bone the game looks up', () => {
    const names = json.nodes.map((n) => n.name);
    for (const name of HEADS) expect(names, name).toContain(name);
    const joints = (json.skins ?? []).flatMap((s) => s.joints.map((j) => json.nodes[j].name));
    expect(joints).toContain('chest');
  });

  it('has every clip the game plays', () => {
    const clips = (json.animations ?? []).map((a) => a.name);
    for (const name of CLIPS) expect(clips, name).toContain(name);
  });

  it('keeps every kit-painted triangle inside the cells playerAtlas paints', () => {
    // The atlas is an 8x4 grid of cells (u across, v down); unpainted cells are transparent black.
    const painted = new Set(Object.values(CELL).map(([col, row]) => `${col},${row}`));
    // Quantised UVs can sit a hair past a cell's edge; within half an atlas pixel (cells are 96 px) counts as on it.
    const EDGE = 0.5 / 96;
    const cells = (lo: number, hi: number): number[] => {
      const first = Math.floor(lo + EDGE), last = Math.max(first, Math.ceil(hi - EDGE) - 1);
      return Array.from({ length: last - first + 1 }, (_, i) => first + i);
    };
    const stray: Record<string, number> = {};
    let checked = 0;
    for (const node of json.nodes) {
      if (node.mesh === undefined) continue;
      for (const prim of json.meshes[node.mesh].primitives) {
        const material = materialOf(prim);
        if (material?.name === 'face') continue; // drawn with the face texture, not the atlas
        expect(prim.mode ?? 4, `${node.name} draws triangles`).toBe(4);
        expect(prim.attributes.TEXCOORD_0, `${node.name} has UVs`).toBeDefined();
        const uv = readAccessor(glb, prim.attributes.TEXCOORD_0).map(textureUV(material));
        const index = prim.indices === undefined ? uv.map((_, i) => i) : readAccessor(glb, prim.indices).map(([i]) => i);
        for (let t = 0; t + 2 < index.length; t += 3) {
          const corners = [uv[index[t]], uv[index[t + 1]], uv[index[t + 2]]];
          const us = corners.map(([u]) => u * 8), vs = corners.map(([, v]) => v * 4);
          // Every cell under the triangle's bounding box must be painted.
          for (const col of cells(Math.min(...us), Math.max(...us))) {
            for (const row of cells(Math.min(...vs), Math.max(...vs))) {
              const label = `${node.name} in cell ${col},${row}`;
              if (!painted.has(`${col},${row}`)) stray[label] = (stray[label] ?? 0) + 1;
            }
          }
          checked++;
        }
      }
    }
    expect(checked).toBeGreaterThan(0);
    expect(stray, 'triangles that reach a cell the atlas leaves blank').toEqual({});
  });
});
