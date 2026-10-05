/** Keyboard + touch input, merged into one simple state the match reads each frame. */
export interface InputState {
  moveX: number; // -1..1, world x (towards the right goal)
  moveZ: number; // -1..1, world z (down the screen)
  shoot: boolean; // pressed this frame
  pass: boolean; // pressed this frame
  sprint: boolean;
  switchPlayer: boolean; // pressed this frame
  pause: boolean; // pressed this frame
}

export class Input {
  private keys = new Set<string>();
  private pressed = new Set<string>();
  private touchMove = { x: 0, z: 0, active: false };
  private touchPressed = new Set<string>();
  private touchHeld = new Set<string>();
  private cleanup: (() => void)[] = [];

  constructor() {
    const down = (e: KeyboardEvent) => {
      if (e.repeat) return;
      const k = e.key.toLowerCase();
      this.keys.add(k);
      this.pressed.add(k);
      if (['arrowup', 'arrowdown', 'arrowleft', 'arrowright', ' '].includes(k)) e.preventDefault();
    };
    const up = (e: KeyboardEvent) => this.keys.delete(e.key.toLowerCase());
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

  /** Attach a virtual joystick to an element (bottom-left pad). */
  attachJoystick(zone: HTMLElement, knob: HTMLElement): void {
    let id: number | null = null;
    let ox = 0;
    let oy = 0;
    const radius = 48;
    const start = (e: PointerEvent) => {
      if (id !== null) return;
      id = e.pointerId;
      const r = zone.getBoundingClientRect();
      ox = r.left + r.width / 2;
      oy = r.top + r.height / 2;
      zone.setPointerCapture(e.pointerId);
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
  attachButton(el: HTMLElement, action: 'shoot' | 'pass' | 'sprint' | 'switch'): void {
    const down = (e: PointerEvent) => {
      e.preventDefault();
      el.setPointerCapture(e.pointerId);
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

  /** Read this frame's input, then clear one-shot presses. */
  poll(): InputState {
    const k = this.keys;
    let x = 0;
    let z = 0;
    if (k.has('arrowleft') || k.has('a')) x -= 1;
    if (k.has('arrowright') || k.has('d')) x += 1;
    if (k.has('arrowup') || k.has('w')) z -= 1;
    if (k.has('arrowdown') || k.has('s')) z += 1;
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
      shoot: this.pressed.has(' ') || this.pressed.has('x') || this.pressed.has('k') || this.touchPressed.has('shoot'),
      pass: this.pressed.has('z') || this.pressed.has('shift') || this.pressed.has('j') || this.pressed.has('enter') || this.touchPressed.has('pass'),
      sprint: k.has('shift') || k.has('l') || this.touchHeld.has('sprint'),
      switchPlayer: this.pressed.has('q') || this.pressed.has('e') || this.touchPressed.has('switch'),
      pause: this.pressed.has('escape') || this.pressed.has('p'),
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
