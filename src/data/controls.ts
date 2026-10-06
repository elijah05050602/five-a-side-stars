/** Remappable controls: keyboard keys per player, gamepad buttons and the on-screen touch layout, saved per browser. */

export type Action = 'up' | 'down' | 'left' | 'right' | 'shoot' | 'pass' | 'lob' | 'sprint' | 'switch' | 'trick' | 'pause';
export const ACTIONS: Action[] = ['up', 'down', 'left', 'right', 'shoot', 'pass', 'lob', 'sprint', 'switch', 'trick', 'pause'];

/** Which physical keys (KeyboardEvent.code) drive each action. */
export type KeyMap = Record<Action, string[]>;
/** Which standard-mapping gamepad buttons drive each action. The left stick always moves too. */
export type PadMap = Record<Action, number[]>;
/** Solo play, or each side of a two-players-on-one-keyboard match. */
export type KeyProfile = 'solo' | 'p1' | 'p2';

export interface TouchLayout {
  /** Size multiplier for the joystick and buttons, 0.8 to 1.4. */
  size: number;
  /** Joystick on the right and buttons on the left. */
  leftHanded: boolean;
  /** How see-through the controls are, 0.4 to 1. */
  opacity: number;
}

/** How high the match camera sits above the action. */
export type CameraHeight = 'low' | 'mid' | 'high' | 'sky';
export const CAMERA_HEIGHTS: CameraHeight[] = ['low', 'mid', 'high', 'sky'];
export const CAMERA_HEIGHT_LABELS: Record<CameraHeight, string> = { low: 'Low', mid: 'Normal', high: 'High', sky: 'Sky' };
/** Distance multiplier for each height: higher sees more of the pitch, lower sees the players up close. */
export const CAMERA_HEIGHT_SCALE: Record<CameraHeight, number> = { low: 0.8, mid: 1, high: 1.25, sky: 1.55 };

/** Which way the pitch runs on a screen taller than it is wide (a phone held upright). */
export type PortraitView = 'upfield' | 'side';
export const PORTRAIT_VIEW_LABELS: Record<PortraitView, string> = { upfield: 'Up the pitch', side: 'Side on' };

export interface CameraView {
  height: CameraHeight;
  portrait: PortraitView;
}

export interface ControlsConfig {
  keys: Record<KeyProfile, KeyMap>;
  pad: PadMap;
  touch: TouchLayout;
  camera: CameraView;
}

/** Slots shown per action on the controls screen. */
export const KEY_SLOTS = 3;
export const PAD_SLOTS = 2;

export const ACTION_LABELS: Record<Action, string> = {
  up: 'Move up', down: 'Move down', left: 'Move left', right: 'Move right',
  shoot: 'Shoot (hold to power up)', pass: 'Pass', lob: 'Lob pass / cross', sprint: 'Sprint', switch: 'Switch player', trick: 'Trick', pause: 'Pause',
};

export function defaultControls(): ControlsConfig {
  return {
    keys: {
      // Single player: arrows and WASD both work, with several shoot and pass keys.
      solo: {
        up: ['ArrowUp', 'KeyW'], down: ['ArrowDown', 'KeyS'], left: ['ArrowLeft', 'KeyA'], right: ['ArrowRight', 'KeyD'],
        shoot: ['Space', 'KeyX', 'KeyK'], pass: ['KeyZ', 'Enter', 'KeyJ'], lob: ['KeyV', 'KeyI'], sprint: ['ShiftLeft', 'ShiftRight', 'KeyL'],
        switch: ['KeyQ', 'KeyE'], trick: ['KeyC', 'KeyU'], pause: ['Escape', 'KeyP'],
      },
      // Two players on one keyboard: player 1 on the left-hand side...
      p1: {
        up: ['KeyW'], down: ['KeyS'], left: ['KeyA'], right: ['KeyD'],
        shoot: ['Space', 'KeyF'], pass: ['KeyZ', 'KeyG'], lob: ['KeyV', 'KeyR'], sprint: ['ShiftLeft'], switch: ['KeyQ'], trick: ['KeyC', 'KeyH'], pause: ['Escape', 'KeyP'],
      },
      // ...and player 2 on the arrow keys.
      p2: {
        up: ['ArrowUp'], down: ['ArrowDown'], left: ['ArrowLeft'], right: ['ArrowRight'],
        shoot: ['Enter', 'Numpad0'], pass: ['Slash', 'NumpadDecimal'], lob: ['Semicolon', 'Numpad2'], sprint: ['ShiftRight', 'ControlRight'], switch: ['Period', 'NumpadEnter'], trick: ['Quote', 'Numpad1'], pause: ['Escape'],
      },
    },
    // Standard mapping: 0 A, 1 B, 2 X, 3 Y, 4 LB, 5 RB, 6 LT, 7 RT, 9 Start, 12-15 d-pad.
    pad: {
      up: [12], down: [13], left: [14], right: [15],
      shoot: [1], pass: [0], lob: [3], sprint: [7, 5], switch: [4], trick: [2], pause: [9],
    },
    touch: { size: 1, leftHanded: false, opacity: 1 },
    camera: { height: 'mid', portrait: 'upfield' },
  };
}

const KEY = 'goal-rush:controls:v1';
let cache: ControlsConfig | null = null;

function cleanList<T>(v: unknown, ok: (x: unknown) => x is T, max: number, fallback: T[]): T[] {
  return Array.isArray(v) ? v.filter(ok).slice(0, max) : fallback;
}

/** Merge a saved file over the defaults so a missing or broken field never breaks the controls. */
function sanitise(raw: unknown): ControlsConfig {
  const d = defaultControls();
  if (!raw || typeof raw !== 'object') return d;
  const r = raw as Partial<ControlsConfig>;
  const isStr = (x: unknown): x is string => typeof x === 'string' && x.length > 0;
  const isBtn = (x: unknown): x is number => Number.isInteger(x) && (x as number) >= 0 && (x as number) < 32;
  for (const p of ['solo', 'p1', 'p2'] as KeyProfile[]) {
    for (const a of ACTIONS) d.keys[p][a] = cleanList(r.keys?.[p]?.[a], isStr, KEY_SLOTS, d.keys[p][a]);
  }
  for (const a of ACTIONS) d.pad[a] = cleanList(r.pad?.[a], isBtn, PAD_SLOTS, d.pad[a]);
  // An action added since the file was saved (like Lob) takes only default keys and buttons nothing else uses.
  for (const p of ['solo', 'p1', 'p2'] as KeyProfile[]) {
    for (const a of ACTIONS) {
      if (Array.isArray(r.keys?.[p]?.[a]) || !r.keys?.[p]) continue;
      const used = new Set(sharingProfiles(p).flatMap((q) => ACTIONS.filter((b) => !(q === p && b === a)).flatMap((b) => d.keys[q][b])));
      d.keys[p][a] = d.keys[p][a].filter((k) => !used.has(k));
    }
  }
  for (const a of ACTIONS) {
    if (Array.isArray(r.pad?.[a]) || !r.pad) continue;
    const used = new Set(ACTIONS.filter((b) => b !== a).flatMap((b) => d.pad[b]));
    d.pad[a] = d.pad[a].filter((b) => !used.has(b));
  }
  const t = r.touch;
  if (t) {
    if (typeof t.size === 'number') d.touch.size = Math.min(1.4, Math.max(0.8, t.size));
    if (typeof t.opacity === 'number') d.touch.opacity = Math.min(1, Math.max(0.4, t.opacity));
    d.touch.leftHanded = t.leftHanded === true;
  }
  const cam = r.camera;
  if (cam) {
    if (CAMERA_HEIGHTS.includes(cam.height)) d.camera.height = cam.height;
    if (cam.portrait === 'upfield' || cam.portrait === 'side') d.camera.portrait = cam.portrait;
  }
  return d;
}

export function getControls(): ControlsConfig {
  if (cache) return cache;
  try {
    const raw = localStorage.getItem(KEY);
    cache = raw ? sanitise(JSON.parse(raw)) : defaultControls();
  } catch {
    cache = defaultControls();
  }
  return cache;
}

export function saveControls(c: ControlsConfig): void {
  cache = sanitise(c);
  try {
    localStorage.setItem(KEY, JSON.stringify(cache));
  } catch {
    /* private mode or quota: the new controls still work for this visit */
  }
}

export function resetControls(): ControlsConfig {
  cache = defaultControls();
  try { localStorage.removeItem(KEY); } catch { /* ignore */ }
  return cache;
}

/** Profiles that share the keyboard with this one, so a key can only do one job across them. */
export function sharingProfiles(p: KeyProfile): KeyProfile[] {
  return p === 'solo' ? ['solo'] : ['p1', 'p2'];
}

/**
 * Bind `code` to `action` in `profile` at `slot`, removing it from every other action that shares the keyboard.
 * Pause may stay on the same key for both players. Returns the actions the key was taken from.
 */
export function bindKey(c: ControlsConfig, profile: KeyProfile, action: Action, slot: number, code: string): { profile: KeyProfile; action: Action }[] {
  const moved: { profile: KeyProfile; action: Action }[] = [];
  for (const p of sharingProfiles(profile)) {
    for (const a of ACTIONS) {
      if (p === profile && a === action) continue;
      if (p !== profile && a === 'pause' && action === 'pause') continue;
      const i = c.keys[p][a].indexOf(code);
      if (i >= 0) { c.keys[p][a].splice(i, 1); moved.push({ profile: p, action: a }); }
    }
  }
  setSlot(c.keys[profile][action], slot, code);
  return moved;
}

export function bindPad(c: ControlsConfig, action: Action, slot: number, button: number): Action[] {
  const moved: Action[] = [];
  for (const a of ACTIONS) {
    if (a === action) continue;
    const i = c.pad[a].indexOf(button);
    if (i >= 0) { c.pad[a].splice(i, 1); moved.push(a); }
  }
  setSlot(c.pad[action], slot, button);
  return moved;
}

function setSlot<T>(list: T[], slot: number, v: T): void {
  const existing = list.indexOf(v);
  if (existing >= 0) list.splice(existing, 1);
  if (slot < list.length) list[slot] = v;
  else list.push(v);
}

export function clearSlot<T>(list: T[], slot: number): void {
  if (slot < list.length) list.splice(slot, 1);
}

const NAMED: Record<string, string> = {
  ArrowUp: '↑', ArrowDown: '↓', ArrowLeft: '←', ArrowRight: '→', Space: 'Space', Enter: 'Enter', Escape: 'Esc',
  ShiftLeft: 'Left Shift', ShiftRight: 'Right Shift', ControlLeft: 'Left Ctrl', ControlRight: 'Right Ctrl', AltLeft: 'Left Alt', AltRight: 'Right Alt',
  Slash: '/', Backslash: '\\', Period: '.', Comma: ',', Semicolon: ';', Quote: "'", BracketLeft: '[', BracketRight: ']', Minus: '-', Equal: '=', Backquote: '`',
  Tab: 'Tab', CapsLock: 'Caps', NumpadEnter: 'Num Enter', NumpadDecimal: 'Num .', NumpadAdd: 'Num +', NumpadSubtract: 'Num -', NumpadMultiply: 'Num *', NumpadDivide: 'Num /',
};

/** A short, readable name for a KeyboardEvent.code. */
export function keyLabel(code: string): string {
  if (NAMED[code]) return NAMED[code];
  if (code.startsWith('Key')) return code.slice(3);
  if (code.startsWith('Digit')) return code.slice(5);
  if (code.startsWith('Numpad')) return `Num ${code.slice(6)}`;
  return code;
}

const PAD_NAMES = ['A', 'B', 'X', 'Y', 'LB', 'RB', 'LT', 'RT', 'Back', 'Start', 'L3', 'R3', 'D-pad ↑', 'D-pad ↓', 'D-pad ←', 'D-pad →', 'Home'];

/** Xbox-style name for a standard-mapping button index. */
export function padLabel(button: number): string {
  return PAD_NAMES[button] ?? `Button ${button}`;
}

/** First key bound to an action, for on-screen hints. */
export function firstKey(profile: KeyProfile, action: Action): string {
  const k = getControls().keys[profile][action][0];
  return k ? keyLabel(k) : '—';
}

/** "W A S D" style text for the move keys of a profile. */
export function moveKeysLabel(profile: KeyProfile): string {
  const m = getControls().keys[profile];
  return [m.up, m.left, m.down, m.right].map((l) => (l[0] ? keyLabel(l[0]) : '?')).join(' ');
}

/** One plain sentence of a profile's main keys, e.g. "W A S D to move, hold Space to shoot, Z to pass...". */
export function controlsSentence(profile: KeyProfile): string {
  const k = (a: Action) => firstKey(profile, a);
  return `${moveKeysLabel(profile)} to move, hold ${k('shoot')} to shoot, ${k('pass')} to pass, ${k('lob')} to lob a cross, ${k('sprint')} to sprint, ${k('switch')} to switch, ${k('trick')} for a trick`;
}
