import * as THREE from 'three';

/**
 * Faces are painted, not modelled: the head's front patch has flat UVs (see
 * tools/build-player-model.mjs), so a small canvas gives eyes, brows, cheeks
 * and a mouth that can change with the play. Textures are cached by look.
 */
export type Expression = 'neutral' | 'happy' | 'focus' | 'ouch' | 'sad' | 'blink';

const SIZE = 160;
const cache = new Map<string, THREE.CanvasTexture>();
const NAVY = '#1b2a41';

/**
 * gazeX: -1..1, positive looks towards the kid's own left (the viewer's right
 * when they face you). gazeY: -1 up .. 1 down. Callers quantise both so the
 * cache stays small.
 */
export function faceTexture(skin: string, expr: Expression, gazeX = 0, gazeY = 0): THREE.CanvasTexture {
  const key = `${skin}|${expr}|${gazeX}|${gazeY}`;
  const hit = cache.get(key);
  if (hit) return hit;
  const c = document.createElement('canvas');
  c.width = SIZE; c.height = SIZE;
  const ctx = c.getContext('2d')!;
  ctx.fillStyle = skin;
  ctx.fillRect(0, 0, SIZE, SIZE);
  // Eye centres and mouth height match the face patch's planar UVs.
  const eyes = [0.5 - 0.28, 0.5 + 0.28].map((u) => u * SIZE);
  const eyeY = 0.49 * SIZE;
  const mouthY = 0.8 * SIZE;
  const px = gazeX * 5, py = gazeY * 4;
  ctx.lineCap = 'round'; ctx.lineJoin = 'round';

  const brow = (x: number, tilt: number, lift: number) => {
    // tilt > 0 raises the inner end (sad/worried), < 0 lowers it (focus/anger).
    const inner = x < SIZE / 2 ? 1 : -1;
    ctx.strokeStyle = 'rgba(55,32,14,0.85)'; ctx.lineWidth = 5;
    ctx.beginPath();
    ctx.moveTo(x - 11 * inner, eyeY - 21 - lift - tilt * 4);
    ctx.quadraticCurveTo(x, eyeY - 27 - lift, x + 11 * inner, eyeY - 21 - lift + tilt * 4);
    ctx.stroke();
  };
  const openEye = (x: number, lid = 0) => {
    ctx.fillStyle = '#ffffff';
    ctx.beginPath(); ctx.ellipse(x, eyeY, 11, 13, 0, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = NAVY;
    ctx.beginPath(); ctx.ellipse(x + px, eyeY + 2 + py, 6.5, 8, 0, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = '#ffffff';
    ctx.beginPath(); ctx.arc(x + px + 2.5, eyeY - 2 + py, 2.2, 0, Math.PI * 2); ctx.fill();
    if (lid > 0) {
      // A half-closed lid for a determined look.
      ctx.fillStyle = skin;
      ctx.beginPath(); ctx.ellipse(x, eyeY - 14 + lid * 12, 13, 13, 0, Math.PI, 0); ctx.fill();
      ctx.strokeStyle = NAVY; ctx.lineWidth = 2.5;
      ctx.beginPath(); ctx.moveTo(x - 11, eyeY - 1 + lid * 12 - 12); ctx.lineTo(x + 11, eyeY - 1 + lid * 12 - 12); ctx.stroke();
    }
  };
  const happyEye = (x: number) => {
    ctx.strokeStyle = NAVY; ctx.lineWidth = 5;
    ctx.beginPath(); ctx.arc(x, eyeY + 5, 10, Math.PI * 1.12, Math.PI * 1.88); ctx.stroke();
  };
  const closedEye = (x: number) => {
    ctx.strokeStyle = NAVY; ctx.lineWidth = 4;
    ctx.beginPath(); ctx.moveTo(x - 10, eyeY + 1); ctx.quadraticCurveTo(x, eyeY + 5, x + 10, eyeY + 1); ctx.stroke();
  };
  const squeezedEye = (x: number) => {
    const inner = x < SIZE / 2 ? 1 : -1;
    ctx.strokeStyle = NAVY; ctx.lineWidth = 4;
    ctx.beginPath(); ctx.moveTo(x - 8 * inner, eyeY - 7); ctx.lineTo(x + 6 * inner, eyeY); ctx.lineTo(x - 8 * inner, eyeY + 7); ctx.stroke();
  };
  const cheeks = (a = 0.3) => {
    ctx.fillStyle = `rgba(255,110,120,${a})`;
    for (const x of eyes) { ctx.beginPath(); ctx.ellipse(x + (x < SIZE / 2 ? -14 : 14), eyeY + 22, 11, 7, 0, 0, Math.PI * 2); ctx.fill(); }
  };
  const smile = (w: number, depth: number) => {
    ctx.strokeStyle = '#7a2e2e'; ctx.lineWidth = 4.5;
    ctx.beginPath(); ctx.moveTo(SIZE / 2 - w, mouthY); ctx.quadraticCurveTo(SIZE / 2, mouthY + depth, SIZE / 2 + w, mouthY); ctx.stroke();
  };

  switch (expr) {
    case 'happy':
      eyes.forEach((x) => { happyEye(x); brow(x, 0, 4); });
      cheeks(0.42);
      // Big open grin with a tongue.
      ctx.fillStyle = '#7a2e2e';
      ctx.beginPath(); ctx.moveTo(SIZE / 2 - 18, mouthY - 5); ctx.quadraticCurveTo(SIZE / 2, mouthY + 22, SIZE / 2 + 18, mouthY - 5); ctx.closePath(); ctx.fill();
      ctx.fillStyle = '#ff7f8f';
      ctx.beginPath(); ctx.ellipse(SIZE / 2, mouthY + 9, 8, 5, 0, 0, Math.PI); ctx.fill();
      break;
    case 'focus':
      eyes.forEach((x) => { openEye(x, 0.45); brow(x, -1.2, -2); });
      cheeks(0.2);
      ctx.strokeStyle = '#7a2e2e'; ctx.lineWidth = 4;
      ctx.beginPath(); ctx.moveTo(SIZE / 2 - 9, mouthY + 2); ctx.lineTo(SIZE / 2 + 9, mouthY + 2); ctx.stroke();
      break;
    case 'ouch':
      eyes.forEach((x) => { squeezedEye(x); brow(x, 1, 6); });
      cheeks(0.3);
      ctx.fillStyle = '#7a2e2e';
      ctx.beginPath(); ctx.ellipse(SIZE / 2, mouthY + 2, 7, 9, 0, 0, Math.PI * 2); ctx.fill();
      break;
    case 'sad':
      eyes.forEach((x) => { openEye(x); brow(x, 1.4, 2); });
      ctx.strokeStyle = '#7a2e2e'; ctx.lineWidth = 4.5;
      ctx.beginPath(); ctx.moveTo(SIZE / 2 - 13, mouthY + 6); ctx.quadraticCurveTo(SIZE / 2, mouthY - 6, SIZE / 2 + 13, mouthY + 6); ctx.stroke();
      // A single tear.
      ctx.fillStyle = '#7fd0ff';
      ctx.beginPath(); ctx.ellipse(eyes[1] + 9, eyeY + 20, 3, 5, 0, 0, Math.PI * 2); ctx.fill();
      break;
    case 'blink':
      eyes.forEach((x) => { closedEye(x); brow(x, 0, 0); });
      cheeks();
      smile(11, 9);
      break;
    default:
      eyes.forEach((x) => { openEye(x); brow(x, 0, 0); });
      cheeks();
      smile(11, 9);
      break;
  }
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.flipY = false;
  tex.anisotropy = 2;
  cache.set(key, tex);
  return tex;
}
