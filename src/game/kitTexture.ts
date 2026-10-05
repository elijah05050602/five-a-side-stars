import * as THREE from 'three';
import type { Kit } from '../data/types';

const cache = new Map<string, THREE.CanvasTexture>();

/**
 * Draws a shirt texture: the kit pattern plus the shirt number on the back.
 * The texture wraps around a cylinder, so u=0..1 goes once around the body;
 * the number sits in the half that faces away from the player's facing direction.
 */
export function kitTexture(kit: Kit, number: number): THREE.CanvasTexture {
  const key = `${kit.pattern}|${kit.shirt}|${kit.shirt2}|${number}`;
  const hit = cache.get(key);
  if (hit) return hit;
  const size = 256;
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext('2d')!;
  ctx.fillStyle = kit.shirt;
  ctx.fillRect(0, 0, size, size);
  ctx.fillStyle = kit.shirt2;
  switch (kit.pattern) {
    case 'stripes': {
      const n = 8;
      const w = size / n;
      for (let i = 0; i < n; i += 2) ctx.fillRect(i * w, 0, w, size);
      break;
    }
    case 'hoops': {
      const n = 6;
      const h = size / n;
      for (let i = 1; i < n; i += 2) ctx.fillRect(0, i * h, size, h);
      break;
    }
    case 'halves':
      // front half one colour, back half the other, split down the sides
      ctx.fillRect(0, 0, size / 4, size);
      ctx.fillRect((size * 3) / 4, 0, size / 4, size);
      break;
    case 'sash':
      ctx.beginPath();
      ctx.moveTo(size * 0.55, 0);
      ctx.lineTo(size * 0.8, 0);
      ctx.lineTo(size * 0.3, size);
      ctx.lineTo(size * 0.05, size);
      ctx.closePath();
      ctx.fill();
      // wrap the sash across the seam
      ctx.beginPath();
      ctx.moveTo(size * 1.55, 0);
      ctx.lineTo(size * 1.8, 0);
      ctx.lineTo(size * 1.3, size);
      ctx.lineTo(size * 1.05, size);
      ctx.closePath();
      ctx.fill();
      break;
    default:
      break;
  }
  // Collar stripe at the top
  ctx.fillStyle = 'rgba(0,0,0,0.12)';
  ctx.fillRect(0, 0, size, 10);
  // Number on the back (back = u around 0.5 for our cylinder orientation)
  const text = String(number);
  const numberColour = contrast(kit.shirt);
  ctx.font = `bold ${size * 0.5}px Fredoka, "Arial Rounded MT Bold", Arial, sans-serif`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.lineWidth = 14;
  ctx.strokeStyle = numberColour === '#ffffff' ? '#1b2a41' : '#ffffff';
  ctx.strokeText(text, size * 0.5, size * 0.48);
  ctx.fillStyle = numberColour;
  ctx.fillText(text, size * 0.5, size * 0.48);
  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.wrapS = THREE.RepeatWrapping;
  tex.anisotropy = 4;
  cache.set(key, tex);
  return tex;
}

/** White or navy, whichever reads better on the given colour. */
export function contrast(hex: string): string {
  const c = hex.replace('#', '');
  const r = parseInt(c.slice(0, 2), 16), g = parseInt(c.slice(2, 4), 16), b = parseInt(c.slice(4, 6), 16);
  const lum = (0.299 * r + 0.587 * g + 0.114 * b) / 255;
  return lum > 0.6 ? '#1b2a41' : '#ffffff';
}

/** Rough perceptual distance between two kits, used to warn when they clash. */
export function kitsClash(a: Kit, b: Kit): boolean {
  const d = (x: string, y: string) => {
    const p = x.replace('#', ''), q = y.replace('#', '');
    let s = 0;
    for (let i = 0; i < 3; i++) s += Math.abs(parseInt(p.slice(i * 2, i * 2 + 2), 16) - parseInt(q.slice(i * 2, i * 2 + 2), 16));
    return s;
  };
  return d(a.shirt, b.shirt) < 160;
}
