import * as THREE from 'three';
import type { BootStyle, Kit } from '../data/types';
import { TextureCache } from './renderer';

/**
 * The player model's UVs point at cells on an 8x4 grid (see tools/build-player-model.mjs).
 * This paints that grid with a kit and a look, so one small texture recolours the whole kid.
 * The 'leg' and 'boot' cells are vertical strips (v = top..bottom of the part), so bands of
 * colour land at exact heights: shorts hem, bare leg, sock top, sock, boot, sole.
 */
export const CELL: Record<string, [number, number]> = {
  skin: [0, 0], hair: [1, 0], eyes: [2, 0], brow: [3, 0],
  shirt: [0, 1], shirt2: [1, 1], shorts: [2, 1], leg: [3, 1], boot: [4, 1],
};
const C = 96; // pixels per cell

export interface LookColours { skin: string; hair: string; boots: string; bootStyle?: BootStyle; bald?: boolean }

/** The atlases kids are wearing, plus the last few taken off (each one is a 768x384 canvas). */
const atlases = new TextureCache<THREE.CanvasTexture>(6);

/** The atlas for a kit and look. Each call holds it: hand it back with releaseTexture() once it is not shown. */
export function playerAtlas(kit: Kit, look: LookColours): THREE.CanvasTexture {
  const style = look.bootStyle ?? 'classic';
  const key = `${kit.pattern}|${kit.shirt}|${kit.shirt2}|${kit.shorts}|${kit.socks}|${look.skin}|${look.hair}|${look.boots}|${style}|${look.bald ? 1 : 0}`;
  return atlases.acquire(key, () => paintAtlas(kit, look, style));
}

function paintAtlas(kit: Kit, look: LookColours, style: BootStyle): THREE.CanvasTexture {
  const canvas = document.createElement('canvas');
  canvas.width = C * 8; canvas.height = C * 4;
  const ctx = canvas.getContext('2d')!;
  const fill = (cell: string, colour: string) => { const [x, y] = CELL[cell]; ctx.fillStyle = colour; ctx.fillRect(x * C, y * C, C, C); };
  fill('skin', look.skin);
  fill('hair', look.bald ? look.skin : look.hair);
  fill('brow', look.hair);
  fill('eyes', '#1b2a41');
  fill('shirt', kit.shirt);
  fill('shorts', kit.shorts);

  // Upper leg strip: the shorts reach a little below the hem, then bare leg.
  fill('leg', look.skin);
  {
    const [x, y] = CELL.leg;
    ctx.fillStyle = kit.shorts; ctx.fillRect(x * C, y * C, C, C * 0.66);
    ctx.fillStyle = shade(kit.shorts, 0.8); ctx.fillRect(x * C, y * C + C * 0.62, C, C * 0.04);
  }
  // Foot strip: sock with a white top band, then the boot and its sole. u runs heel..toe.
  {
    const [x, y] = CELL.boot;
    ctx.save();
    ctx.translate(x * C, y * C);
    ctx.fillStyle = kit.socks; ctx.fillRect(0, 0, C, C);
    ctx.fillStyle = '#ffffff'; ctx.fillRect(0, 0, C, C * 0.09);
    const top = C * 0.45;
    ctx.fillStyle = look.boots; ctx.fillRect(0, top, C, C - top);
    const accent = contrastColour(look.boots) === '#ffffff' ? '#ffffff' : '#1b2a41';
    ctx.fillStyle = accent;
    switch (style) {
      case 'stripes':
        for (let i = 0; i < 3; i++) {
          const u = C * (0.32 + i * 0.13);
          ctx.beginPath(); ctx.moveTo(u, top); ctx.lineTo(u + C * 0.07, top); ctx.lineTo(u + C * 0.2, C * 0.9); ctx.lineTo(u + C * 0.13, C * 0.9); ctx.closePath(); ctx.fill();
        }
        break;
      case 'toecap':
        ctx.fillRect(C * 0.74, top, C * 0.26, C - top);
        ctx.fillRect(0, top, C * 0.16, C - top);
        break;
      case 'twotone':
        ctx.fillStyle = shade(look.boots, 0.55);
        ctx.beginPath(); ctx.moveTo(0, top); ctx.lineTo(C * 0.55, top); ctx.lineTo(C * 0.4, C); ctx.lineTo(0, C); ctx.closePath(); ctx.fill();
        ctx.fillStyle = accent; ctx.fillRect(C * 0.47, top, C * 0.05, C - top);
        break;
      default:
        break;
    }
    // Sole, with laces hinted as a light line on top of the foot.
    ctx.fillStyle = look.boots === '#ffffff' ? '#1b2a41' : '#f3f3f3';
    ctx.fillRect(0, C * 0.9, C, C * 0.1);
    ctx.restore();
  }

  // Kit pattern inside the shirt cell. In the model's UVs, v runs down the chest: the top 24% is
  // the rolled collar (the shirt colour with a thin trim at the neck, so it never reads as a scarf), the middle is the shirt, and the bottom 44%
  // is the tunic ring under the waistband, painted as shorts so the shirt reads as tucked in.
  const [sx, sy] = CELL.shirt;
  const T = C * 0.24, H = C * 0.56;
  ctx.save();
  ctx.translate(sx * C, sy * C);
  ctx.fillStyle = kit.shorts; ctx.fillRect(0, H, C, C - H);
  ctx.fillStyle = kit.shirt; ctx.fillRect(0, 0, C, T);
  ctx.fillStyle = kit.shirt2; ctx.fillRect(0, 0, C, T * 0.22);
  ctx.beginPath(); ctx.rect(0, T, C, H - T); ctx.clip();
  ctx.fillStyle = kit.shirt2;
  switch (kit.pattern) {
    case 'stripes': for (let i = 0; i < 4; i++) ctx.fillRect(i * (C / 4) + C / 16, T, C / 8, H - T); break;
    case 'hoops': for (let i = 0; i < 3; i++) ctx.fillRect(0, T + (H - T) * 0.12 + i * ((H - T) / 3), C, (H - T) / 6); break;
    case 'halves': ctx.fillRect(0, T, C / 2, H - T); break;
    case 'sash': ctx.beginPath(); ctx.moveTo(C * 0.45, T); ctx.lineTo(C * 0.8, T); ctx.lineTo(C * 0.35, H); ctx.lineTo(0, H); ctx.closePath(); ctx.fill(); break;
    case 'chevron': ctx.beginPath(); ctx.moveTo(0, T + (H - T) * 0.15); ctx.lineTo(C / 2, T + (H - T) * 0.55); ctx.lineTo(C, T + (H - T) * 0.15); ctx.lineTo(C, T + (H - T) * 0.4); ctx.lineTo(C / 2, T + (H - T) * 0.8); ctx.lineTo(0, T + (H - T) * 0.4); ctx.closePath(); ctx.fill(); break;
    default: break;
  }
  ctx.restore();
  // The torso's u runs round the body and wraps at the back, where triangles spill into the next
  // cell, so the shirt is repeated there.
  ctx.drawImage(canvas, sx * C, sy * C, C, C, (sx + 1) * C, sy * C, C, C);
  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.flipY = false;
  // No mipmaps: averaging neighbouring cells would bleed colours between body parts.
  tex.generateMipmaps = false;
  tex.minFilter = THREE.LinearFilter;
  tex.magFilter = THREE.LinearFilter;
  return tex;
}

/** Darkens or lightens a hex colour: k < 1 darker, k > 1 lighter. */
function shade(hex: string, k: number): string {
  const c = new THREE.Color(hex);
  c.multiplyScalar(k);
  return `#${c.getHexString()}`;
}

const numbers = new TextureCache<THREE.CanvasTexture>(16);
/** The shirt number for the little plate on a player's back. Held like playerAtlas: hand it back with releaseTexture(). */
export function numberTexture(n: number, colour: string): THREE.CanvasTexture {
  return numbers.acquire(`${n}|${colour}`, () => paintNumber(n, colour));
}

function paintNumber(n: number, colour: string): THREE.CanvasTexture {
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
  return tex;
}

/** White or dark, whichever reads better on the colour. */
export function contrastColour(hex: string): string {
  const c = new THREE.Color(hex);
  const lum = 0.2126 * c.r + 0.7152 * c.g + 0.0722 * c.b;
  return lum > 0.45 ? '#1b2a41' : '#ffffff';
}

/** Dispose every atlas and number no kid is wearing. A match calls this when it ends; held ones stay. */
export function clearPlayerAtlasCache(): void {
  atlases.clearIdle();
  numbers.clearIdle();
}
