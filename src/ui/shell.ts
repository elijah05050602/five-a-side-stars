import { cupInProgress, getLeague, getSettings, updateSettings } from '../data/storage';
import { music } from '../game/music';
import { applyVolumes } from '../game/audio';
import { esc } from './hud';
import type { Router } from './screens';

/** Which console tab lights up. */
export type ShellTab = 'lobby' | 'squad' | 'cup' | 'league' | 'album' | 'none';

const TABS: { id: ShellTab; label: string; icon: string }[] = [
  { id: 'lobby', label: 'Lobby', icon: '⚽' },
  { id: 'squad', label: 'Squad', icon: '👕' },
  { id: 'cup', label: 'Cup', icon: '🏆' },
  { id: 'league', label: 'League', icon: '📋' },
  { id: 'album', label: 'Stickers', icon: '📒' },
];

/** The arcade console bar that tops every screen outside a match: logo pill, tabs, sound and parents. */
export function shellBar(active: ShellTab): string {
  const s = getSettings();
  const league = getLeague();
  const season = league ? `Tier ${league.tier} · S${league.season}` : 'Season 1';
  return `
    <header class="shell">
      <div class="shell-brand">
        <span class="shell-logo"><span class="shell-ball">⚽</span>GOAL RUSH!</span>
        <span class="shell-season">${esc(season)}</span>
      </div>
      <nav class="shell-nav" aria-label="Main">
        ${TABS.map((t) => `<button class="shell-tab ${t.id === active ? 'is-active' : ''}" data-nav="${t.id}"><span class="shell-tab-icon">${t.icon}</span>${t.label}${t.id === 'league' && league ? '<span class="shell-live">LIVE</span>' : ''}</button>`).join('')}
      </nav>
      <div class="shell-tools">
        <button class="shell-icon" data-sound aria-label="${s.sound || s.music || s.commentary ? 'Mute sound' : 'Turn sound on'}" title="Sound">${s.sound || s.music || s.commentary ? '🔊' : '🔇'}</button>
        <button class="shell-icon" data-nav="controls" aria-label="Controls" title="Controls">🎮</button>
        <button class="shell-icon shell-icon-parents" data-nav="parents" aria-label="Parents zone" title="Parents zone">🛡️</button>
      </div>
    </header>`;
}

/** Page heading row under the console bar: a "back to" pill and the screen title. */
export function pageHead(title: string, backLabel = 'Lobby', extra = ''): string {
  return `<div class="page-head"><button class="btn btn-ghost btn-back" data-back><span class="btn-back-arrow">←</span> ${esc(backLabel)}</button><h1 class="page-title">${esc(title)}</h1>${extra}</div>`;
}

/** The lobby's bottom dock: How to play, Controls, the club and the Parents Zone, plus key hints for keyboard players. */
export function dock(keyboard: boolean): string {
  const links = '<button class="dock-chip dock-link" id="m-howto">🎓 How to play</button><button class="dock-chip dock-link" data-nav="controls">🎮 Controls</button><button class="dock-chip dock-link dock-club" data-club>🦊 Davao Strikers</button><button class="dock-chip dock-parents" data-nav="parents">🛡️ Parents Zone 🔒</button>';
  return keyboard ? `
    <footer class="dock">
      <div class="dock-keys"><kbd>SPACE</kbd> Kick off <span class="dock-dot">·</span> <kbd>ESC</kbd> Back</div>
      <div class="dock-right"><span class="dock-chip dock-offline">● PLAYS OFFLINE</span>${links}</div>
    </footer>` : `<footer class="dock dock-touch">${links}</footer>`;
}

export function wireShell(root: HTMLElement, router: Router): void {
  root.querySelectorAll<HTMLElement>('[data-nav]').forEach((b) => b.addEventListener('click', () => {
    switch (b.dataset.nav as ShellTab | 'parents' | 'controls') {
      case 'lobby': return router.go({ name: 'menu' });
      case 'squad': return router.go({ name: 'teams' });
      case 'cup': return router.go(cupInProgress() ? { name: 'tournament' } : { name: 'setup', mode: 'tournament' });
      case 'league': return router.go(getLeague() ? { name: 'league' } : { name: 'setup', mode: 'league' });
      case 'album': return router.go({ name: 'album' });
      case 'parents': return router.go({ name: 'parents' });
      case 'controls': return router.go({ name: 'controls' });
    }
  }));
  root.querySelector<HTMLElement>('[data-sound]')?.addEventListener('click', (e) => {
    const s = getSettings();
    const on = !(s.sound || s.music || s.commentary);
    updateSettings({ sound: on, music: on, commentary: on });
    applyVolumes();
    music.refresh();
    const btn = e.currentTarget as HTMLElement;
    btn.textContent = on ? '🔊' : '🔇';
    btn.setAttribute('aria-label', on ? 'Mute sound' : 'Turn sound on');
  });
}
