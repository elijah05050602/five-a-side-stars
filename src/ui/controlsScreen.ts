import {
  ACTIONS, ACTION_LABELS, CAMERA_HEIGHTS, CAMERA_HEIGHT_LABELS, KEY_SLOTS, PAD_SLOTS, PORTRAIT_VIEW_LABELS, bindKey, bindPad, clearSlot, getControls, keyLabel, padLabel, resetControls, saveControls,
  type Action, type CameraHeight, type ControlsConfig, type KeyProfile, type PortraitView,
} from '../data/controls';
import { esc, touchControlsHtml } from './hud';
import { pageHead, shellBar } from './shell';
import type { Router } from './screens';

type Tab = 'keyboard' | 'pad' | 'touch' | 'camera';

/** What the screen is waiting for: a key or button for one slot. */
type Capture = { kind: 'key'; profile: KeyProfile; action: Action; slot: number } | { kind: 'pad'; action: Action; slot: number };

const PROFILE_LABELS: Record<KeyProfile, string> = { solo: '1 player', p1: '2 players: Player 1', p2: '2 players: Player 2' };
/** Short lower-case name for notes, e.g. "shoot". */
const short = (a: Action) => ACTION_LABELS[a].replace(/ \(.*\)$/, '').toLowerCase();
const ACTION_ICONS: Record<Action, string> = { up: '⬆️', down: '⬇️', left: '⬅️', right: '➡️', shoot: '🥅', pass: '👟', lob: '🌈', sprint: '⚡', switch: '🔄', trick: '✨', pause: '⏸️' };

let tab: Tab = window.matchMedia('(pointer: coarse)').matches ? 'touch' : 'keyboard';
let profile: KeyProfile = 'solo';

/**
 * The controls screen: remap keyboard keys per player and gamepad buttons, and resize the touch controls.
 * Every change saves straight away. Returns a cleanup for the screen router.
 */
export function renderControls(root: HTMLElement, router: Router, wire: (root: HTMLElement, back: () => void) => void): () => void {
  let capture: Capture | null = null;
  let note = '';
  let raf = 0;
  const c: ControlsConfig = structuredClone(getControls());
  const commit = () => saveControls(c);

  const slotBtn = (label: string | null, data: string, listening: boolean) =>
    `<button class="bind ${label ? '' : 'bind-empty'} ${listening ? 'is-listening' : ''}" ${data}>${listening ? 'Press…' : label ? esc(label) : '+'}</button>`;

  const keyRows = () => ACTIONS.map((a) => {
    const list = c.keys[profile][a];
    const slots = Array.from({ length: KEY_SLOTS }, (_, i) => {
      const listening = capture?.kind === 'key' && capture.action === a && capture.slot === i;
      // Only one empty slot is offered, after the last key.
      if (i > list.length) return '<span class="bind-gap"></span>';
      return slotBtn(list[i] ? keyLabel(list[i]) : null, `data-key="${a}" data-slot="${i}"`, listening);
    }).join('');
    return `<div class="bind-row"><span class="bind-action"><span class="bind-icon">${ACTION_ICONS[a]}</span>${ACTION_LABELS[a]}</span><span class="bind-slots">${slots}</span></div>`;
  }).join('');

  const padRows = () => ACTIONS.map((a) => {
    const list = c.pad[a];
    const slots = Array.from({ length: PAD_SLOTS }, (_, i) => {
      const listening = capture?.kind === 'pad' && capture.action === a && capture.slot === i;
      if (i > list.length) return '<span class="bind-gap"></span>';
      return slotBtn(list[i] != null ? padLabel(list[i]) : null, `data-pad="${a}" data-slot="${i}"`, listening);
    }).join('');
    return `<div class="bind-row" data-pad-row="${a}"><span class="bind-action"><span class="bind-icon">${ACTION_ICONS[a]}</span>${ACTION_LABELS[a]}</span><span class="bind-slots">${slots}</span></div>`;
  }).join('');

  const padStatus = () => {
    const pads = [...(navigator.getGamepads?.() ?? [])].filter((g): g is Gamepad => !!g && g.connected);
    if (!pads.length) return '<p class="pad-status pad-none">🎮 No controller found. Plug one in (or pair it) and press any button.</p>';
    return `<p class="pad-status pad-ok">🎮 ${pads.map((g, i) => `<span><strong>${i === 0 ? 'Player 1' : i === 1 ? 'Player 2' : `Pad ${i + 1}`}:</strong> ${esc(g.id.replace(/\s*\(.*\)\s*$/, '') || 'Controller')}</span>`).join(' ')}</p>`;
  };

  const touchPanel = () => `
    <div class="touch-settings">
      <label class="range-field"><span>Button size</span><input type="range" id="tc-size" min="0.8" max="1.4" step="0.05" value="${c.touch.size}" /><output>${Math.round(c.touch.size * 100)}%</output></label>
      <label class="range-field"><span>See-through</span><input type="range" id="tc-opacity" min="0.4" max="1" step="0.05" value="${c.touch.opacity}" /><output>${Math.round(c.touch.opacity * 100)}%</output></label>
      <label class="toggle"><input type="checkbox" id="tc-lefty" ${c.touch.leftHanded ? 'checked' : ''}/> Left-handed: joystick on the right, buttons on the left</label>
    </div>
    <div class="touch-preview" aria-hidden="true">
      ${touchControlsHtml(c.touch, true)}
    </div>`;

  const cameraPanel = () => `
    <div class="touch-settings">
      <div class="cam-row"><span class="cam-label">📷 Camera height</span><div class="pills">${CAMERA_HEIGHTS.map((h) => `<button class="pill ${h === c.camera.height ? 'is-active' : ''}" data-cam-height="${h}">${CAMERA_HEIGHT_LABELS[h]}</button>`).join('')}</div></div>
      <p class="muted">Higher shows more of the pitch and both goals; lower shows the players up close.</p>
      <div class="cam-row"><span class="cam-label">📱 Phone held upright</span><div class="pills">${(['upfield', 'side'] as PortraitView[]).map((v) => `<button class="pill ${v === c.camera.portrait ? 'is-active' : ''}" data-cam-view="${v}">${PORTRAIT_VIEW_LABELS[v]}</button>`).join('')}</div></div>
      <p class="muted">Up the pitch turns the view so you attack up the screen and can see the goal ahead. Side on keeps the usual sideways view. You can change both from the pause menu too.</p>
    </div>`;

  const render = () => {
    root.innerHTML = `
      <div class="screen controls-screen">
        ${shellBar('none')}
        ${pageHead('Controls')}
        <div class="pills controls-tabs" role="tablist">
          <button class="pill ${tab === 'keyboard' ? 'is-active' : ''}" data-tab="keyboard">⌨️ Keyboard</button>
          <button class="pill ${tab === 'pad' ? 'is-active' : ''}" data-tab="pad">🎮 Controller</button>
          <button class="pill ${tab === 'touch' ? 'is-active' : ''}" data-tab="touch">👆 Touch screen</button>
          <button class="pill ${tab === 'camera' ? 'is-active' : ''}" data-tab="camera">📷 Camera</button>
        </div>
        <div class="card controls-card">
          ${tab === 'keyboard' ? `
            <div class="pills">${(['solo', 'p1', 'p2'] as KeyProfile[]).map((p) => `<button class="pill ${p === profile ? 'is-active' : ''}" data-profile="${p}">${PROFILE_LABELS[p]}</button>`).join('')}</div>
            <p class="muted">Tap a box, then press the key you want. <kbd>Esc</kbd> cancels, <kbd>Backspace</kbd> clears the box.${profile !== 'solo' ? ' Player 1 and Player 2 share the keyboard, so a key can only do one job.' : ''}</p>
            <div class="bind-list">${keyRows()}</div>`
          : tab === 'pad' ? `
            <div id="pad-status">${padStatus()}</div>
            <p class="muted">The left stick always moves your player. Tap a box, then press a button on the controller. <kbd>Esc</kbd> cancels. In a two-player match the first controller is Player 1 and the second is Player 2. Buttons light up when you press them.</p>
            <div class="bind-list">${padRows()}</div>`
          : tab === 'touch' ? touchPanel() : cameraPanel()}
          <p class="controls-note" role="status">${esc(note)}</p>
        </div>
        <div class="row controls-actions">
          <button class="btn btn-ghost" id="ctl-reset">↺ Reset ${tab === 'keyboard' ? 'keyboard' : tab === 'pad' ? 'controller' : tab === 'touch' ? 'touch' : 'camera'} to defaults</button>
          <button class="btn btn-ghost" id="ctl-reset-all">Reset all controls</button>
          <button class="btn btn-primary" data-back>Done</button>
        </div>
      </div>`;
    wire(root, () => { if (capture) { capture = null; render(); } else router.go({ name: 'menu' }); });
    root.querySelectorAll<HTMLElement>('[data-tab]').forEach((b) => b.addEventListener('click', () => { tab = b.dataset.tab as Tab; capture = null; note = ''; render(); }));
    root.querySelectorAll<HTMLElement>('[data-profile]').forEach((b) => b.addEventListener('click', () => { profile = b.dataset.profile as KeyProfile; capture = null; note = ''; render(); }));
    root.querySelectorAll<HTMLElement>('[data-key]').forEach((b) => b.addEventListener('click', () => {
      capture = { kind: 'key', profile, action: b.dataset.key as Action, slot: Number(b.dataset.slot) };
      note = `Press a key for ${short(capture.action)}…`;
      render();
    }));
    root.querySelectorAll<HTMLElement>('[data-pad]').forEach((b) => b.addEventListener('click', () => {
      capture = { kind: 'pad', action: b.dataset.pad as Action, slot: Number(b.dataset.slot) };
      padBaseline = heldButtons();
      note = `Press a controller button for ${short(capture.action)}…`;
      render();
    }));
    root.querySelector('#ctl-reset')!.addEventListener('click', () => {
      const d = resetControls();
      // resetControls clears everything; put back the parts this tab is not resetting.
      if (tab === 'keyboard') c.keys = d.keys; else if (tab === 'pad') c.pad = d.pad; else if (tab === 'touch') c.touch = d.touch; else c.camera = d.camera;
      commit();
      capture = null;
      note = 'Back to the default controls.';
      render();
    });
    root.querySelector('#ctl-reset-all')!.addEventListener('click', () => {
      Object.assign(c, resetControls());
      capture = null;
      note = 'Every control is back to normal.';
      render();
    });
    const size = root.querySelector<HTMLInputElement>('#tc-size');
    const opacity = root.querySelector<HTMLInputElement>('#tc-opacity');
    const lefty = root.querySelector<HTMLInputElement>('#tc-lefty');
    const preview = root.querySelector<HTMLElement>('.tc-preview');
    const onTouch = () => {
      c.touch = { size: Number(size!.value), opacity: Number(opacity!.value), leftHanded: lefty!.checked };
      commit();
      preview!.style.setProperty('--tc-size', String(c.touch.size));
      preview!.style.setProperty('--tc-opacity', String(c.touch.opacity));
      preview!.classList.toggle('is-lefty', c.touch.leftHanded);
      size!.nextElementSibling!.textContent = `${Math.round(c.touch.size * 100)}%`;
      opacity!.nextElementSibling!.textContent = `${Math.round(c.touch.opacity * 100)}%`;
    };
    root.querySelectorAll<HTMLElement>('[data-cam-height]').forEach((b) => b.addEventListener('click', () => { c.camera.height = b.dataset.camHeight as CameraHeight; commit(); render(); }));
    root.querySelectorAll<HTMLElement>('[data-cam-view]').forEach((b) => b.addEventListener('click', () => { c.camera.portrait = b.dataset.camView as PortraitView; commit(); render(); }));
    size?.addEventListener('input', onTouch);
    opacity?.addEventListener('input', onTouch);
    lefty?.addEventListener('change', onTouch);
  };

  const describe = (moved: { profile: KeyProfile; action: Action }[] | Action[]) => moved.length
    ? ` (taken from ${moved.map((m) => typeof m === 'string' ? short(m) : `${m.profile !== profile ? (m.profile === 'p1' ? 'Player 1 ' : 'Player 2 ') : ''}${short(m.action)}`).join(', ')})`
    : '';

  // Keyboard capture runs before the screen's own Escape-to-go-back handler.
  const onKey = (e: KeyboardEvent) => {
    if (!capture) return;
    e.preventDefault();
    e.stopImmediatePropagation();
    if (e.repeat) return;
    if (e.code === 'Escape') { capture = null; note = 'Cancelled.'; return render(); }
    if (capture.kind === 'pad') return;
    const { profile: p, action, slot } = capture;
    if (e.code === 'Backspace' || e.code === 'Delete') {
      clearSlot(c.keys[p][action], slot);
      note = `Cleared a key from ${short(action)}.`;
    } else {
      const moved = bindKey(c, p, action, slot, e.code);
      note = `${keyLabel(e.code)} now does ${short(action)}${describe(moved)}.`;
    }
    commit();
    capture = null;
    render();
  };
  window.addEventListener('keydown', onKey, true);

  const heldButtons = () => {
    const held = new Set<number>();
    for (const g of navigator.getGamepads?.() ?? []) g?.buttons.forEach((b, i) => { if (b.pressed || b.value > 0.5) held.add(i); });
    return held;
  };
  let padBaseline = new Set<number>();
  let padCount = -1;
  const loop = () => {
    raf = requestAnimationFrame(loop);
    if (tab !== 'pad') return;
    const pads = [...(navigator.getGamepads?.() ?? [])].filter((g) => g?.connected).length;
    if (pads !== padCount) {
      padCount = pads;
      const el = root.querySelector('#pad-status');
      if (el) el.innerHTML = padStatus();
    }
    const held = heldButtons();
    // Light up every row whose button is held, so players can test their layout.
    root.querySelectorAll<HTMLElement>('[data-pad-row]').forEach((row) => row.classList.toggle('is-live', c.pad[row.dataset.padRow as Action].some((b) => held.has(b))));
    if (capture?.kind !== 'pad') return;
    const fresh = [...held].find((b) => !padBaseline.has(b));
    padBaseline = held;
    if (fresh == null) return;
    const { action, slot } = capture;
    const moved = bindPad(c, action, slot, fresh);
    note = `${padLabel(fresh)} now does ${short(action)}${describe(moved)}.`;
    commit();
    capture = null;
    render();
  };
  raf = requestAnimationFrame(loop);

  render();
  return () => {
    window.removeEventListener('keydown', onKey, true);
    cancelAnimationFrame(raf);
  };
}
