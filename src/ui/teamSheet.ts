import { startingFive } from '../data/defaults';
import { POSITION_LABELS, type Team } from '../data/types';
import { badgeSvg, kitChip } from './kitPreview';

function svgToImage(svg: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error('svg'));
    img.src = `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`;
  });
}

function roundRect(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number): void {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}

/** Draw a printable A4-ish team sheet for the team and return it as a PNG blob. */
export async function renderTeamSheet(team: Team): Promise<Blob> {
  const W = 1240, H = 1754;
  const canvas = document.createElement('canvas');
  canvas.width = W; canvas.height = H;
  const ctx = canvas.getContext('2d')!;
  const font = (px: number, weight = 700) => `${weight} ${px}px Fredoka, "Segoe UI", Arial, sans-serif`;
  const starters = startingFive(team);
  const subs = team.players.filter((p) => !starters.includes(p));

  ctx.fillStyle = '#ffffff';
  ctx.fillRect(0, 0, W, H);
  // Header band in the kit colours.
  ctx.fillStyle = team.kit.shirt;
  ctx.fillRect(0, 0, W, 300);
  ctx.fillStyle = team.kit.shirt2;
  ctx.fillRect(0, 300, W, 18);
  const [badge, kit, gkKit] = await Promise.all([svgToImage(badgeSvg(team.badge, 200)), svgToImage(kitChip(team.kit, 160)), svgToImage(kitChip(team.keeperKit, 100))]);
  ctx.drawImage(badge, 70, 50, 200, 200);
  ctx.drawImage(kit, W - 250, 70, 160, 160);
  ctx.drawImage(gkKit, W - 370, 130, 100, 100);
  ctx.fillStyle = '#ffffff';
  ctx.shadowColor = 'rgba(0,0,0,0.35)'; ctx.shadowBlur = 8;
  ctx.font = font(84);
  ctx.fillText(team.name, 300, 150, 560);
  ctx.font = font(40, 600);
  ctx.fillText(`${team.ageGroup} · Goal Rush! team sheet`, 300, 215, 560);
  ctx.shadowBlur = 0;

  // Title row
  ctx.fillStyle = '#1b2a41';
  ctx.font = font(48);
  ctx.fillText('Starting five', 80, 400);
  let y = 440;
  const row = (p: Team['players'][number], sub: boolean) => {
    roundRect(ctx, 80, y, W - 160, 96, 20);
    ctx.fillStyle = sub ? '#f1f5f9' : '#eafaf1';
    ctx.fill();
    // Number circle
    ctx.beginPath(); ctx.arc(150, y + 48, 36, 0, Math.PI * 2);
    ctx.fillStyle = p.position === 'GK' ? team.keeperKit.shirt : team.kit.shirt; ctx.fill();
    ctx.fillStyle = '#ffffff'; ctx.font = font(36); ctx.textAlign = 'center';
    ctx.fillText(String(p.number), 150, y + 61);
    ctx.textAlign = 'left';
    ctx.fillStyle = '#1b2a41'; ctx.font = font(42);
    ctx.fillText(p.name, 220, y + 62, 520);
    ctx.font = font(30, 600); ctx.fillStyle = '#475569';
    const pos = p.position === 'GK' ? 'Goalkeeper' : POSITION_LABELS[p.position];
    ctx.fillText(pos, 780, y + 60);
    const special = p.special !== 'none' ? `★ ${p.special}` : '';
    ctx.fillText(special, 1000, y + 60);
    y += 112;
  };
  starters.forEach((p) => row(p, false));
  if (subs.length) {
    y += 30;
    ctx.fillStyle = '#1b2a41'; ctx.font = font(48);
    ctx.fillText('Substitutes', 80, y + 20);
    y += 60;
    subs.forEach((p) => row(p, true));
  }
  // Coach's notes box
  y += 30;
  const boxH = Math.max(160, H - 140 - y);
  roundRect(ctx, 80, y, W - 160, boxH, 20);
  ctx.strokeStyle = '#cbd5e1'; ctx.lineWidth = 4; ctx.stroke();
  ctx.fillStyle = '#475569'; ctx.font = font(34, 600);
  ctx.fillText("Coach's notes", 110, y + 56);
  ctx.strokeStyle = '#e2e8f0'; ctx.lineWidth = 2;
  for (let ly = y + 110; ly < y + boxH - 20; ly += 60) { ctx.beginPath(); ctx.moveTo(110, ly); ctx.lineTo(W - 110, ly); ctx.stroke(); }
  ctx.fillStyle = '#94a3b8'; ctx.font = font(26, 600); ctx.textAlign = 'center';
  ctx.fillText('Made with Goal Rush! ⚽', W / 2, H - 50);
  ctx.textAlign = 'left';
  return new Promise((resolve, reject) => canvas.toBlob((b) => (b ? resolve(b) : reject(new Error('png'))), 'image/png'));
}

/** Render the sheet and hand it to the browser as a download (or open it, on devices that cannot download). */
export async function downloadTeamSheet(team: Team): Promise<void> {
  const blob = await renderTeamSheet(team);
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `${team.name.replace(/[^a-z0-9]+/gi, '-').toLowerCase()}-team-sheet.png`;
  document.body.appendChild(a);
  a.click();
  a.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 10000);
}
