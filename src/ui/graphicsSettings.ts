import { getSettings, updateSettings } from '../data/storage';
import { autoTier, GRAPHICS_LABELS, type GraphicsQuality } from '../game/graphics';

const CHOICES: GraphicsQuality[] = ['auto', 'low', 'medium', 'high'];

/**
 * Graphics quality pills. Auto picks Low on phones, Medium on tablets and High on computers,
 * and lowers the resolution further if a match runs slowly. High is the full original look.
 */
export function graphicsSettings(inMatch = false): string {
  const current = getSettings().graphics ?? 'auto';
  const auto = autoTier();
  return `
    <div class="cam-row gfx-row">
      <span class="cam-label">✨ Graphics</span>
      <div class="pills">${CHOICES.map((q) => `<button class="pill ${q === current ? 'is-active' : ''}" data-gfx="${q}">${q === 'auto' ? `Auto (${auto[0].toUpperCase()}${auto.slice(1)})` : GRAPHICS_LABELS[q]}</button>`).join('')}</div>
    </div>
    <p class="muted gfx-note">If the game feels slow or jumpy, pick Low.${inMatch ? ' Changes start from the next match.' : ''}</p>`;
}

export function wireGraphicsSettings(root: HTMLElement): void {
  root.querySelectorAll<HTMLElement>('[data-gfx]').forEach((b) => b.addEventListener('click', () => {
    updateSettings({ graphics: b.dataset.gfx as GraphicsQuality });
    root.querySelectorAll<HTMLElement>('[data-gfx]').forEach((x) => x.classList.toggle('is-active', x === b));
  }));
}
