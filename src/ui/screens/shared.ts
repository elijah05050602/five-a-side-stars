/** What every screen shares: the current screen's state, the top bar, back wiring and small markup helpers. */
import { starsText } from '../../data/skills';
import type { GrowthEvent } from '../../game/career';
import type { Sticker } from '../../data/progress';
import { esc } from '../hud';
import { pageHead, shellBar, wireShell, type ShellTab } from '../shell';
import type { Router } from '../screens';

/** What the current screen left behind: its window listeners, its back action, its unsaved-changes check, and the router. */
export const state: { cleanup: (() => void) | null; onEscape: (() => void) | null; leaveGuard: (() => boolean | Promise<boolean>) | null; router: Router } = {
  cleanup: null,
  onEscape: null,
  /** Set by a screen with unsaved changes: returns (or resolves to) false to stay put. */
  leaveGuard: null,
  router: null as unknown as Router,
};

window.addEventListener('keydown', (e) => {
  if (e.key !== 'Escape' || !state.onEscape || document.body.classList.contains('in-match')) return;
  e.preventDefault();
  // Esc in a text box just leaves the box, so a half-typed name is not thrown away with the screen.
  const t = e.target as HTMLElement | null;
  if (t && (t instanceof HTMLInputElement || t instanceof HTMLTextAreaElement || t instanceof HTMLSelectElement || t.isContentEditable)) { t.blur(); return; }
  state.onEscape();
});

export function topBar(title: string, tab: ShellTab = 'none', backLabel = 'Lobby', extra = ''): string {
  return shellBar(tab) + pageHead(title, backLabel, extra);
}

/** aria-pressed for a pill, tile or swatch that shows the current choice. */
export const pressed = (on: boolean): string => `aria-pressed="${on}"`;

/** A selector that finds the same control again after a redraw: its id, or its data attributes. */
export function focusKey(el: Element | null): string | null {
  if (!(el instanceof HTMLElement || el instanceof SVGElement) || !el.closest('#ui')) return null;
  if (el.id) return `#${CSS.escape(el.id)}`;
  const attrs = [...el.attributes].filter((a) => a.name.startsWith('data-')).map((a) => `[${a.name}="${CSS.escape(a.value)}"]`).join('');
  return attrs ? `${el.tagName.toLowerCase()}${attrs}` : null;
}

/** Put keyboard focus back on the control the player was using before a redraw. */
export function restoreFocus(root: HTMLElement, key: string | null): void {
  if (!key) return;
  root.querySelector<HTMLElement | SVGElement>(key)?.focus({ preventScroll: true });
}

export function wire(root: HTMLElement, back: () => void): void {
  // The heading's back pill and any "Done" button at the bottom do the same thing.
  root.querySelectorAll('[data-back]').forEach((b) => b.addEventListener('click', back));
  wireShell(root, state.router);
  state.onEscape = back;
}

export function stickerBanner(stickers: Sticker[]): string {
  if (!stickers.length) return '';
  return `<div class="new-stickers">${stickers.map((s) => `<div class="sticker sticker-new"><span class="sticker-emoji">${s.emoji}</span><strong>${esc(s.name)}</strong><small>New sticker!</small></div>`).join('')}</div>`;
}

export function growthList(events: GrowthEvent[]): string {
  if (!events.length) return '';
  return `<div class="growth"><h3>⭐ Growing up!</h3><ul class="plain-list">${events.map((g) => `<li><strong>${esc(g.name)}</strong>: ${esc(g.label)} is now <span class="stars">${starsText(g.stars, g.stars)}</span></li>`).join('')}</ul></div>`;
}

export function ordinal(n: number): string {
  const s = ['th', 'st', 'nd', 'rd'], v = n % 100;
  return n + (s[(v - 20) % 10] ?? s[v] ?? s[0]);
}
