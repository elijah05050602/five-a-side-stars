import { STICKERS, getProgress } from '../../data/progress';
import { esc } from '../hud';
import { topBar, wire } from './shared';
import type { Router } from '../screens';

export function renderAlbum(root: HTMLElement, router: Router): void {
  const p = getProgress();
  root.innerHTML = `
    <div class="screen album">
      ${topBar('Sticker Album', 'album')}
      <div class="card stats-card">
        <div class="stat"><strong>${p.played}</strong><span>matches</span></div>
        <div class="stat"><strong>${p.won}</strong><span>wins</span></div>
        <div class="stat"><strong>${p.goalsFor}</strong><span>goals</span></div>
        <div class="stat"><strong>${p.trophies}</strong><span>trophies</span></div>
        <div class="stat"><strong>${p.trainingBest}</strong><span>training best</span></div>
      </div>
      <p class="muted album-count">${p.stickers.length} of ${STICKERS.length} stickers collected</p>
      <div class="sticker-grid">
        ${STICKERS.map((s) => {
          const got = p.stickers.includes(s.id);
          return `<div class="sticker ${got ? 'is-got' : 'is-missing'}${got && s.unlocks ? ' is-shiny' : ''}">
            <span class="sticker-emoji">${got ? s.emoji : '❔'}</span>
            <strong>${esc(s.name)}</strong>
            <small>${esc(s.how)}</small>
            ${s.unlocks ? `<span class="sticker-unlock">${got ? 'Unlocked badge' : 'Unlocks badge'} ${s.unlocks}</span>` : ''}
          </div>`;
        }).join('')}
      </div>
    </div>`;
  wire(root, () => router.go({ name: 'menu' }));
}
