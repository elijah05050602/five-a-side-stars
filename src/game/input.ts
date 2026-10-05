/** Keyboard + touch input, merged into one simple state the match reads each frame. */
export interface InputState {
  moveX: number; // -1..1, world x (towards the right goal)
  moveZ: number; // -1..1, world z (down the screen)
  shoot: boolean; // pressed this frame
  shootHeld: boolean; // still held (hold to power up a shot)
  pass: boolean; // pressed this frame
  sprint: boolean;
  switchPlayer: boolean; // pressed this frame
  pause: boolean; // pressed this frame
}

/** Which physical keys (KeyboardEvent.code) drive each action. */
export interface KeyMap {
  up: string[]; down: string[]; left: string[]; right: string[];
  shoot: string[]; pass: string[]; sprint: string[]; switch: string[]; pause: string[];
}

/** Single player: arrows and WASD both work, with several shoot and pass keys. */
export const SOLO_KEYS: KeyMap = {
  up: ['ArrowUp', 'KeyW'], down: ['ArrowDown', 'KeyS'], left: ['ArrowLeft', 'KeyA'], right: ['ArrowRight', 'KeyD'],
  shoot: ['Space', 'KeyX', 'KeyK'], pass: ['KeyZ', 'Enter', 'KeyJ'], sprint: ['ShiftLeft', 'ShiftRight', 'KeyL'],
  switch: ['KeyQ', 'KeyE'], pause: ['Escape', 'KeyP'],
};
/** Two players on one keyboard: player 1 on the left-hand side. */
export const P1_KEYS: KeyMap = {
  up: ['KeyW'], down: ['KeyS'], left: ['KeyA'], right: ['KeyD'],
  shoot: ['Space', 'KeyF'], pass: ['KeyZ', 'KeyG'], sprint: ['ShiftLeft'], switch: ['KeyQ'], pause: ['Escape', 'KeyP'],
};
/** Two players on one keyboard: player 2 on the arrow keys. */
export const P2_KEYS: KeyMap = {
  up: ['ArrowUp'], down: ['ArrowDown'], left: ['ArrowLeft'], right: ['ArrowRight'],
  shoot: ['Enter', 'Numpad0'], pass: ['Slash', 'NumpadDecimal'], sprint: ['ShiftRight', 'ControlRight'], switch: ['Period', 'NumpadEnter'], pause: ['Escape'],
};

export class Input {
  private keys = new Set<string>();
  private pressed = new Set<string>();
  private touchMove = { x: 0, z: 0, active: false };
  private touchPressed = new Set<string>();
  private touchHeld = new Set<string>();
  private cleanup: (() => void)[] = [];

  constructor(private readonly map: KeyMap = SOLO_KEYS) {
    const down = (e: KeyboardEvent) => {
      if (e.repeat) return;
      const k = e.code;
      this.keys.add(k);
      this.pressed.add(k);
      if (['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'Space', 'Slash'].includes(k)) e.preventDefault();
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
    const m = this.map;
    const held = (codes: string[]) => codes.some((c) => this.keys.has(c));
    const hit = (codes: string[]) => codes.some((c) => this.pressed.has(c));
    let x = 0;
    let z = 0;
    if (held(m.left)) x -= 1;
    if (held(m.right)) x += 1;
    if (held(m.up)) z -= 1;
    if (held(m.down)) z += 1;
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
      shoot: hit(m.shoot) || this.touchPressed.has('shoot'),
      shootHeld: held(m.shoot) || this.touchHeld.has('shoot'),
      pass: hit(m.pass) || this.touchPressed.has('pass'),
      sprint: held(m.sprint) || this.touchHeld.has('sprint'),
      switchPlayer: hit(m.switch) || this.touchPressed.has('switch'),
      pause: hit(m.pause),
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
