import * as THREE from 'three';
import type { Kit } from '../data/types';

/**
 * The player model's UVs point at cells on an 8x4 grid (see tools/build-player-model.mjs).
 * This paints that grid with a kit and a look, so one small texture recolours the whole kid.
 */
const CELL: Record<string, [number, number]> = {
  skin: [0, 0], hair: [1, 0], eyes: [2, 0], brow: [3, 0],
  shirt: [0, 1], shirt2: [1, 1], shorts: [2, 1], socks: [3, 1], belt: [4, 1], buckle: [5, 1],
};
const C = 64; // pixels per cell

export interface LookColours { skin: string; hair: string; boots: string; bald?: boolean }

const cache = new Map<string, THREE.CanvasTexture>();

export function playerAtlas(kit: Kit, look: LookColours): THREE.CanvasTexture {
  const key = `${kit.pattern}|${kit.shirt}|${kit.shirt2}|${kit.shorts}|${kit.socks}|${look.skin}|${look.hair}|${look.boots}|${look.bald ? 1 : 0}`;
  const hit = cache.get(key);
  if (hit) return hit;
  const canvas = document.createElement('canvas');
  canvas.width = C * 8; canvas.height = C * 4;
  const ctx = canvas.getContext('2d')!;
  const fill = (cell: string, colour: string) => { const [x, y] = CELL[cell]; ctx.fillStyle = colour; ctx.fillRect(x * C, y * C, C, C); };
  fill('skin', look.skin);
  fill('hair', look.bald ? look.skin : look.hair);
  fill('brow', look.hair);
  fill('eyes', '#1b2a41');
  fill('shirt', kit.shirt);
  fill('shirt2', kit.shirt2);
  fill('shorts', kit.shorts);
  fill('belt', shade(kit.shorts, 0.72));
  fill('buckle', '#e9eef5');
  // Socks cell: the upper part of the cell lands on the ankle, the lower part on the boot.
  fill('socks', kit.socks);
  { const [x, y] = CELL.socks; ctx.fillStyle = look.boots; ctx.fillRect(x * C, y * C + C / 2, C, C / 2); }
  // Kit pattern inside the shirt cell. The chest spans the cell left to right, top to bottom.
  const [sx, sy] = CELL.shirt;
  ctx.save();
  ctx.translate(sx * C, sy * C);
  ctx.fillStyle = kit.shirt2;
  switch (kit.pattern) {
    case 'stripes': for (let i = 0; i < 4; i++) ctx.fillRect(i * (C / 4), 0, C / 8, C); break;
    case 'hoops': for (let i = 0; i < 3; i++) ctx.fillRect(0, C * 0.2 + i * (C / 4), C, C / 8); break;
    case 'halves': ctx.fillRect(0, 0, C / 2, C); break;
    case 'sash': ctx.beginPath(); ctx.moveTo(C * 0.45, 0); ctx.lineTo(C * 0.8, 0); ctx.lineTo(C * 0.35, C); ctx.lineTo(0, C); ctx.closePath(); ctx.fill(); break;
    case 'chevron': ctx.beginPath(); ctx.moveTo(0, C * 0.15); ctx.lineTo(C / 2, C * 0.55); ctx.lineTo(C, C * 0.15); ctx.lineTo(C, C * 0.4); ctx.lineTo(C / 2, C * 0.8); ctx.lineTo(0, C * 0.4); ctx.closePath(); ctx.fill(); break;
    default: break;
  }
  ctx.restore();
  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.flipY = false;
  // No mipmaps: averaging neighbouring cells would bleed colours between body parts.
  tex.generateMipmaps = false;
  tex.minFilter = THREE.LinearFilter;
  tex.magFilter = THREE.LinearFilter;
  cache.set(key, tex);
  return tex;
}

/** Darkens or lightens a hex colour: k < 1 darker, k > 1 lighter. */
function shade(hex: string, k: number): string {
  const c = new THREE.Color(hex);
  c.multiplyScalar(k);
  return `#${c.getHexString()}`;
}

let numberCache = new Map<string, THREE.CanvasTexture>();
/** The shirt number for the little plate on a player's back. */
export function numberTexture(n: number, colour: string): THREE.CanvasTexture {
  const key = `${n}|${colour}`;
  const hit = numberCache.get(key);
  if (hit) return hit;
  const canvas = document.createElement('canvas');
  canvas.width = 128; canvas.height = 128;
  const ctx = canvas.getContext('2d')!;
  ctx.clearRect(0, 0, 128, 128);
  ctx.font = `bold ${n >= 10 ? 92 : 108}px "Baloo 2", "Nunito", system-ui, sans-serif`;
  ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
  ctx.lineWidth = 10; ctx.strokeStyle = 'rgba(0,0,0,0.35)'; ctx.lineJoin = 'round';
  ctx.strokeText(String(n), 64, 70);
  ctx.fillStyle = colour;
  ctx.fillText(String(n), 64, 70);
  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  numberCache.set(key, tex);
  return tex;
}

/** White or dark, whichever reads better on the shirt. */
export function contrastColour(hex: string): string {
  const c = new THREE.Color(hex);
  const lum = 0.2126 * c.r + 0.7152 * c.g + 0.0722 * c.b;
  return lum > 0.45 ? '#1b2a41' : '#ffffff';
}

export function clearPlayerAtlasCache(): void {
  cache.forEach((t) => t.dispose()); cache.clear();
  numberCache.forEach((t) => t.dispose()); numberCache = new Map();
}
