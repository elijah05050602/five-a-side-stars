import type { Badge } from '../data/types';
import { esc } from './hud';
import { showNotice } from './dialog';

/** Logos are shrunk to this many pixels square so a save file stays small. */
const LOGO_PX = 160;

/** Read a picked image file and return it as a small square data URL (cover-fit). */
export async function fileToLogo(file: File): Promise<string> {
  const url = URL.createObjectURL(file);
  try {
    const img = await new Promise<HTMLImageElement>((resolve, reject) => {
      const i = new Image();
      i.onload = () => resolve(i);
      i.onerror = () => reject(new Error('That file does not look like a picture.'));
      i.src = url;
    });
    const c = document.createElement('canvas');
    c.width = LOGO_PX; c.height = LOGO_PX;
    const ctx = c.getContext('2d')!;
    const s = Math.min(img.naturalWidth, img.naturalHeight);
    const sx = (img.naturalWidth - s) / 2, sy = (img.naturalHeight - s) / 2;
    ctx.imageSmoothingQuality = 'high';
    ctx.drawImage(img, sx, sy, s, s, 0, 0, LOGO_PX, LOGO_PX);
    // WebP keeps transparency and is far smaller; browsers without it fall back to PNG.
    const webp = c.toDataURL('image/webp', 0.86);
    return webp.startsWith('data:image/webp') ? webp : c.toDataURL('image/png');
  } finally {
    URL.revokeObjectURL(url);
  }
}

/**
 * Markup for an upload button (with its hidden file input) and, when a logo is
 * set, a remove button. `key` tells the wiring which team the buttons belong to.
 */
export function logoControls(badge: Badge, key = '', label = '📷 Upload logo'): string {
  return `<span class="logo-controls">
    <input type="file" accept="image/*" class="logo-input" data-logo-input="${esc(key)}" hidden />
    <button type="button" class="btn btn-ghost btn-small" data-logo-upload="${esc(key)}" title="Use your own picture as the club logo">${badge.image ? '📷 Change logo' : label}</button>
    ${badge.image ? `<button type="button" class="btn btn-ghost btn-small" data-logo-remove="${esc(key)}" title="Go back to the drawn badge">✕ Remove logo</button>` : ''}
  </span>`;
}

/**
 * Wire every logo control inside `root`. `resolve(key)` returns the badge to
 * change; `onChange(key)` runs after it changed so the caller can save and redraw.
 */
export function wireLogoControls(root: HTMLElement, resolve: (key: string) => Badge | undefined, onChange: (key: string) => void): void {
  root.querySelectorAll<HTMLButtonElement>('[data-logo-upload]').forEach((btn) => {
    const key = btn.dataset.logoUpload ?? '';
    const input = root.querySelector<HTMLInputElement>(`[data-logo-input="${CSS.escape(key)}"]`);
    if (!input) return;
    btn.addEventListener('click', () => input.click());
    input.addEventListener('change', async () => {
      const file = input.files?.[0];
      input.value = '';
      const badge = resolve(key);
      if (!file || !badge) return;
      if (file.size > 12 * 1024 * 1024) { void showNotice({ icon: '🖼️', title: 'Picture too big', body: 'That picture is very big. Please pick one under 12 MB.' }); return; }
      try {
        const image = await fileToLogo(file);
        // Left the screen while the picture was being shrunk: drop it rather than redraw a screen that has gone.
        if (!btn.isConnected) return;
        badge.image = image;
        onChange(key);
      } catch (e) {
        void showNotice({ icon: '😕', title: 'That picture did not work', body: (e as Error).message || 'Sorry, that picture could not be used.' });
      }
    });
  });
  root.querySelectorAll<HTMLButtonElement>('[data-logo-remove]').forEach((btn) => {
    btn.addEventListener('click', () => {
      const key = btn.dataset.logoRemove ?? '';
      const badge = resolve(key);
      if (!badge) return;
      delete badge.image;
      onChange(key);
    });
  });
}
