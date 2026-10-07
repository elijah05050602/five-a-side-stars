/** Keyboard + touch input, merged into one simple state the match reads each frame. */
export interface InputState {
  moveX: number; // -1..1, world x (towards the right goal)
  moveZ: number; // -1..1, world z (down the screen)
  shoot: boolean; // pressed this frame
  shootHeld: boolean; // still held (hold to power up a shot)
  pass: boolean; // pressed this frame
  passHeld: boolean; // still held (hold for a longer pass)
  lob: boolean; // pressed this frame: lofted pass or cross
  sprint: boolean;
  switchPlayer: boolean; // pressed this frame
  pause: boolean; // pressed this frame
  subs: boolean; // pressed this frame: open the subs card
  trick: boolean; // pressed this frame: step-over or nutmeg
}

import { getControls, type KeyMap, type PadMap } from '../data/controls';
import { getSettings } from '../data/storage';

export type { KeyMap } from '../data/controls';

/** Which gamepad drives this input: any connected pad, the nth connected pad (0 = first), or none. */
export type PadSlot = 'any' | number | null;

const STICK_DEAD = 0.25;

/** The presses that count once, on the frame they happen. */
const ONE_SHOT = ['shoot', 'pass', 'lob', 'switchPlayer', 'trick'] as const;

/**
 * Keeps a tap until a sim step uses it. The sim steps 60 times a second but the screen may draw
 * 120 or 144 frames, so most frames run no step at all, and a tap read on one of those used to be
 * lost: about half of them at 120 Hz.
 */
export class PressLatch {
  private readonly held = new Set<(typeof ONE_SHOT)[number]>();

  /** Add this frame's taps to the ones still waiting, and mark them all on `s` (a fresh state from poll()). */
  take(s: InputState): InputState {
    for (const k of ONE_SHOT) {
      if (s[k]) this.held.add(k);
      else if (this.held.has(k)) s[k] = true;
    }
    return s;
  }

  /** A step has used the taps, or they should not count (while paused or during a replay). */
  clear(): void {
    this.held.clear();
  }
}

export class Input {
  private keys = new Set<string>();
  private pressed = new Set<string>();
  private touchMove = { x: 0, z: 0, active: false };
  private touchPressed = new Set<string>();
  private touchHeld = new Set<string>();
  private cleanup: (() => void)[] = [];
  private padWas = new Set<number>();

  constructor(private readonly map: KeyMap = getControls().keys.solo, private readonly pad: PadSlot = 'any', private readonly padMap: PadMap = getControls().pad) {
    const down = (e: KeyboardEvent) => {
      if (e.repeat) return;
      const k = e.code;
      this.keys.add(k);
      this.pressed.add(k);
      if (['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'Space', 'Slash', 'Quote', 'Tab'].includes(k) || Object.values(this.map).some((l) => l.includes(k))) e.preventDefault();
    };
    const up = (e: KeyboardEvent) => this.keys.delete(e.code);
    const blur = () => this.keys.clear();
    window.addEventListener('keydown', down);
    window.addEventListener('keyup', up);
    window.addEventListener('blur', blur);
    this.cleanup.push(() => {
      window.removeEventListener('keydown', down);
      window.removeEventListener('keyup', up);
      window.removeEventListener('blur', blur);
    });
  }

  /**
   * Attach the floating joystick. A touch anywhere in `zone` (the left part of the screen) brings
   * `base` to the thumb, unless it landed on the pad at home; on release the pad slides back.
   */
  attachJoystick(zone: HTMLElement, base: HTMLElement, knob: HTMLElement): void {
    let id: number | null = null;
    let ox = 0;
    let oy = 0;
    // The knob travels about a third of the pad's width, so it scales with the touch size setting.
    let radius = 48;
    const start = (e: PointerEvent) => {
      if (id !== null) return;
      id = e.pointerId;
      base.style.transition = 'none';
      base.style.transform = '';
      const r = base.getBoundingClientRect();
      ox = r.left + r.width / 2;
      oy = r.top + r.height / 2;
      radius = r.width * 0.34;
      if (Math.hypot(e.clientX - ox, e.clientY - oy) > r.width / 2) {
        // Keep the whole pad inside the zone so it never slides under the edge of the screen.
        const z = zone.getBoundingClientRect();
        const half = r.width / 2;
        const cx = Math.min(Math.max(e.clientX, z.left + half), z.right - half);
        const cy = Math.min(Math.max(e.clientY, z.top + half), z.bottom - half);
        base.style.transform = `translate(${cx - ox}px, ${cy - oy}px)`;
        ox = cx;
        oy = cy;
      }
      try { zone.setPointerCapture(e.pointerId); } catch { /* a pointer the browser no longer knows: the touch still counts */ }
      move(e);
    };
    const move = (e: PointerEvent) => {
      if (e.pointerId !== id) return;
      let dx = e.clientX - ox;
      let dy = e.clientY - oy;
      const len = Math.hypot(dx, dy);
      if (len > radius) {
        dx = (dx / len) * radius;
        dy = (dy / len) * radius;
      }
      knob.style.transform = `translate(${dx}px, ${dy}px)`;
      const dead = 8;
      if (len < dead) {
        this.touchMove = { x: 0, z: 0, active: true };
      } else {
        this.touchMove = { x: dx / radius, z: dy / radius, active: true };
      }
    };
    const end = (e: PointerEvent) => {
      if (e.pointerId !== id) return;
      id = null;
      knob.style.transform = 'translate(0, 0)';
      base.style.transition = getSettings().reduceMotion ? 'none' : 'transform 0.2s ease-out';
      base.style.transform = '';
      this.touchMove = { x: 0, z: 0, active: false };
    };
    zone.addEventListener('pointerdown', start);
    zone.addEventListener('pointermove', move);
    zone.addEventListener('pointerup', end);
    zone.addEventListener('pointercancel', end);
    this.cleanup.push(() => {
      zone.removeEventListener('pointerdown', start);
      zone.removeEventListener('pointermove', move);
      zone.removeEventListener('pointerup', end);
      zone.removeEventListener('pointercancel', end);
    });
  }

  /** Attach a touch button that maps to an action name. */
  attachButton(el: HTMLElement, action: 'shoot' | 'pass' | 'lob' | 'sprint' | 'switch' | 'trick'): void {
    const down = (e: PointerEvent) => {
      e.preventDefault();
      try { el.setPointerCapture(e.pointerId); } catch { /* as for the joystick */ }
      el.classList.add('is-down');
      this.touchPressed.add(action);
      this.touchHeld.add(action);
    };
    const up = () => {
      el.classList.remove('is-down');
      this.touchHeld.delete(action);
    };
    el.addEventListener('pointerdown', down);
    el.addEventListener('pointerup', up);
    el.addEventListener('pointercancel', up);
    this.cleanup.push(() => {
      el.removeEventListener('pointerdown', down);
      el.removeEventListener('pointerup', up);
      el.removeEventListener('pointercancel', up);
    });
  }

  /** Gamepads this input listens to right now. */
  private pads(): Gamepad[] {
    if (this.pad === null || typeof navigator === 'undefined' || !navigator.getGamepads) return [];
    const all = [...navigator.getGamepads()].filter((g): g is Gamepad => !!g && g.connected);
    if (this.pad === 'any') return all;
    const g = all[this.pad];
    return g ? [g] : [];
  }

  /** Read this frame's input, then clear one-shot presses. */
  poll(): InputState {
    const m = this.map;
    const pm = this.padMap;
    // Gamepad buttons held this frame, and which of those were not held last frame.
    const padNow = new Set<number>();
    let sx = 0;
    let sz = 0;
    for (const g of this.pads()) {
      g.buttons.forEach((b, i) => { if (b.pressed || b.value > 0.5) padNow.add(i); });
      const ax = g.axes[0] ?? 0;
      const az = g.axes[1] ?? 0;
      if (Math.hypot(ax, az) > Math.hypot(sx, sz)) { sx = ax; sz = az; }
    }
    const padHit = new Set([...padNow].filter((b) => !this.padWas.has(b)));
    this.padWas = padNow;
    const held = (codes: string[]) => codes.some((c) => this.keys.has(c));
    const hit = (codes: string[]) => codes.some((c) => this.pressed.has(c));
    const padHeld = (a: keyof PadMap) => pm[a].some((b) => padNow.has(b));
    const padPress = (a: keyof PadMap) => pm[a].some((b) => padHit.has(b));
    let x = 0;
    let z = 0;
    if (held(m.left) || padHeld('left')) x -= 1;
    if (held(m.right) || padHeld('right')) x += 1;
    if (held(m.up) || padHeld('up')) z -= 1;
    if (held(m.down) || padHeld('down')) z += 1;
    const stick = Math.hypot(sx, sz);
    if (stick > STICK_DEAD) {
      // Rescale past the dead zone so a light push still walks.
      const k = Math.min(1, (stick - STICK_DEAD) / (1 - STICK_DEAD)) / stick;
      x = sx * k;
      z = sz * k;
    }
    if (this.touchMove.active) {
      x = this.touchMove.x;
      z = this.touchMove.z;
    }
    const len = Math.hypot(x, z);
    if (len > 1) {
      x /= len;
      z /= len;
    }
    const state: InputState = {
      moveX: x,
      moveZ: z,
      shoot: hit(m.shoot) || padPress('shoot') || this.touchPressed.has('shoot'),
      shootHeld: held(m.shoot) || padHeld('shoot') || this.touchHeld.has('shoot'),
      pass: hit(m.pass) || padPress('pass') || this.touchPressed.has('pass'),
      passHeld: held(m.pass) || padHeld('pass') || this.touchHeld.has('pass'),
      lob: hit(m.lob) || padPress('lob') || this.touchPressed.has('lob'),
      sprint: held(m.sprint) || padHeld('sprint') || this.touchHeld.has('sprint'),
      switchPlayer: hit(m.switch) || padPress('switch') || this.touchPressed.has('switch'),
      pause: hit(m.pause) || padPress('pause'),
      subs: hit(m.subs) || padPress('subs'),
      trick: hit(m.trick) || padPress('trick') || this.touchPressed.has('trick'),
    };
    this.pressed.clear();
    this.touchPressed.clear();
    return state;
  }

  dispose(): void {
    this.cleanup.forEach((fn) => fn());
    this.cleanup = [];
  }
}
