/**
 * The game's own pop-up boxes, in place of the browser's plain confirm() and alert(): a comic card
 * with an icon badge, a title, a line or two of text and big pill buttons, over a dimmed screen.
 * Built on <dialog> with showModal(), so focus stays inside, the screen behind cannot be tapped and
 * screen readers hear it as a dialog. Esc, a tap on the dim backdrop and the phone's Back button all
 * pick the safe answer, and the safe button has focus first, so an accidental Enter never deletes.
 */
import { audioContext, channelBus, channelLevel, tone } from '../game/audio';
import { esc } from './hud';

/** danger: deleting something. warn: losing changes. oops: something to fix. grown-up: the Parents Zone (calmer, no bounce). */
export type PopTone = 'danger' | 'warn' | 'oops' | 'grown-up';

export interface PopButton<T> {
  label: string;
  value: T;
  /** danger is red with white text; primary is yellow; ghost is white. */
  kind: 'danger' | 'primary' | 'ghost';
}

export interface PopOptions<T> {
  icon: string;
  title: string;
  /** Plain text, escaped here. A blank line starts a new paragraph. */
  body?: string;
  tone: PopTone;
  /** Trusted markup shown between the title and the text: a team badge or a player card. Escape names before passing them in. */
  preview?: string;
  buttons: PopButton<T>[];
  /** The button with focus when the box opens. */
  focus: number;
  /** The answer for Esc, a backdrop tap or the Back button. */
  cancel: T;
}

let dialog: HTMLDialogElement | null = null;
/** Closes the open box with the given answer. */
let settle: ((value: unknown) => void) | null = null;
let cancelValue: unknown = null;

function el(): HTMLDialogElement {
  if (dialog) return dialog;
  const d = document.createElement('dialog');
  d.className = 'pop';
  d.addEventListener('cancel', (e) => { e.preventDefault(); settle?.(cancelValue); });
  // A tap on the dim backdrop lands on the <dialog> itself, not the card inside it.
  d.addEventListener('click', (e) => { if (e.target === d) settle?.(cancelValue); });
  // Keys belong to the box while it is up: Esc must not also go back a screen, nor Space kick off from the lobby.
  d.addEventListener('keydown', (e) => { if (e.key !== 'Tab') e.stopPropagation(); });
  document.body.appendChild(d);
  dialog = d;
  return d;
}

/** A soft pop as the box appears, on the sound-effects channel. */
function popSound(): void {
  try {
    if (!channelLevel('sfx')) return;
    const c = audioContext();
    if (!c) return;
    tone(c, channelBus('sfx'), c.currentTime, { freq: 420, freqEnd: 760, gain: 0.12, decay: 0.12 });
  } catch { /* no sound is fine */ }
}

/** Show a box and wait for the answer. A box already open is answered with its safe choice first. */
export function openPop<T>(o: PopOptions<T>): Promise<T> {
  settle?.(cancelValue);
  const d = el();
  const back = document.activeElement instanceof HTMLElement ? document.activeElement : null;
  const paras = (o.body ?? '').split(/\n\s*\n/).filter((p) => p.trim()).map((p) => `<p>${esc(p.trim())}</p>`).join('');
  d.dataset.tone = o.tone;
  d.setAttribute('aria-labelledby', 'pop-title');
  d.setAttribute('aria-describedby', 'pop-body');
  d.innerHTML = `
    <span class="pop-badge" aria-hidden="true">${o.icon}</span>
    <div class="pop-card">
      <h2 id="pop-title">${esc(o.title)}</h2>
      ${o.preview ? `<div class="pop-preview">${o.preview}</div>` : ''}
      <div id="pop-body" class="pop-body">${paras}</div>
      <div class="pop-actions">
        ${o.buttons.map((b, i) => `<button type="button" class="btn ${b.kind === 'danger' ? 'btn-danger' : b.kind === 'primary' ? 'btn-primary' : 'btn-ghost'}" data-pop="${i}">${esc(b.label)}</button>`).join('')}
      </div>
    </div>`;
  return new Promise<T>((resolve) => {
    cancelValue = o.cancel;
    settle = (value) => {
      settle = null;
      if (d.open) d.close();
      if (back?.isConnected) back.focus({ preventScroll: true });
      resolve(value as T);
    };
    d.querySelectorAll<HTMLButtonElement>('[data-pop]').forEach((b) => b.addEventListener('click', () => settle?.(o.buttons[Number(b.dataset.pop)].value)));
    d.showModal();
    d.querySelector<HTMLButtonElement>(`[data-pop="${o.focus}"]`)?.focus();
    if (o.tone !== 'grown-up') popSound();
  });
}

/** An "are you sure?" box: true for the yes button, false for the safe one (or Esc, backdrop, Back). */
export function askConfirm(o: { icon?: string; title: string; body?: string; yes: string; no: string; tone?: PopTone; preview?: string }): Promise<boolean> {
  const tone = o.tone ?? 'danger';
  return openPop<boolean>({
    icon: o.icon ?? (tone === 'danger' ? '🗑️' : tone === 'grown-up' ? '💾' : '⚠️'),
    title: o.title, body: o.body, tone, preview: o.preview,
    // The yes button is red for deleting, yellow otherwise. The safe one is first in reading order on phones (see .pop-actions).
    buttons: [{ label: o.yes, value: true, kind: tone === 'danger' ? 'danger' : 'primary' }, { label: o.no, value: false, kind: 'ghost' }],
    focus: 1,
    cancel: false,
  });
}

/** An "oops" or "sorry" message with one button. */
export function showNotice(o: { icon?: string; title: string; body?: string; ok?: string; tone?: PopTone }): Promise<void> {
  const tone = o.tone ?? 'oops';
  return openPop<void>({
    icon: o.icon ?? (tone === 'grown-up' ? 'ℹ️' : '🙈'),
    title: o.title, body: o.body, tone,
    buttons: [{ label: o.ok ?? 'OK', value: undefined, kind: 'primary' }],
    focus: 0,
    cancel: undefined,
  });
}

/** The phone's Back button: answer an open box with its safe choice. True when there was one. */
export function closePop(): boolean {
  if (!settle) return false;
  settle(cancelValue);
  return true;
}
