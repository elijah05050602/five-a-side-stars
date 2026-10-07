import { beforeEach, describe, expect, it } from 'vitest';
import { defaultControls, getControls, resetControls, saveControls, type ControlsConfig } from '../data/controls';

describe('controls', () => {
  beforeEach(() => resetControls());

  it('every default key and button does only one job per keyboard', () => {
    const c = defaultControls();
    for (const group of [['solo'], ['p1', 'p2']] as const) {
      const keys = group.flatMap((p) => Object.entries(c.keys[p]).filter(([a]) => a !== 'pause').flatMap(([, k]) => k));
      expect(new Set(keys).size).toBe(keys.length);
    }
    const pad = Object.values(c.pad).flat();
    expect(new Set(pad).size).toBe(pad.length);
  });

  it('an older save gets Lob keys, minus any the player already uses elsewhere', () => {
    const old = defaultControls() as unknown as { keys: Record<string, Record<string, string[]>>; pad: Record<string, number[]> };
    for (const p of ['solo', 'p1', 'p2']) delete old.keys[p].lob;
    delete old.pad.lob;
    old.keys.solo.trick = ['KeyV'];
    old.pad.trick = [3];
    saveControls(old as unknown as ControlsConfig); // loads it through the same clean-up as a saved file
    const c = getControls();
    expect(c.keys.solo.lob).toEqual(['KeyS']);
    expect(c.keys.p1.lob).toEqual(['KeyV', 'KeyR']);
    expect(c.pad.lob).toEqual([]);
  });

  it('an older save gets the Subs key and button, unless the player already uses them', () => {
    const old = defaultControls() as unknown as { keys: Record<string, Record<string, string[]>>; pad: Record<string, number[]> };
    for (const p of ['solo', 'p1', 'p2']) delete old.keys[p].subs;
    delete old.pad.subs;
    old.keys.p1.trick = ['KeyB'];
    saveControls(old as unknown as ControlsConfig);
    const c = getControls();
    expect(c.keys.solo.subs).toEqual(['KeyB']);
    expect(c.keys.p1.subs).toEqual([]);
    expect(c.keys.p2.subs).toEqual(['KeyM', 'Numpad3']);
    expect(c.pad.subs).toEqual([8]);
  });

  it('pass is D and lob is S for one player, and an untouched older save moves over to them', () => {
    const d = defaultControls();
    expect(d.keys.solo.pass[0]).toBe('KeyD');
    expect(d.keys.solo.lob[0]).toBe('KeyS');
    const old = defaultControls();
    old.keys.solo = {
      up: ['ArrowUp', 'KeyW'], down: ['ArrowDown', 'KeyS'], left: ['ArrowLeft', 'KeyA'], right: ['ArrowRight', 'KeyD'],
      shoot: ['Space', 'KeyX', 'KeyK'], pass: ['KeyZ', 'Enter', 'KeyJ'], lob: ['KeyV', 'KeyI'], sprint: ['ShiftLeft', 'ShiftRight', 'KeyL'],
      switch: ['KeyQ', 'KeyE'], trick: ['KeyC', 'KeyU'], pause: ['Escape', 'KeyP'],
    } as typeof d.keys.solo; // saved before Subs had a key
    old.camera = { height: 'high', portrait: 'upfield' };
    saveControls(old);
    expect(getControls().keys.solo).toEqual(d.keys.solo);
    expect(getControls().camera.height).toBe('high');
    // Keys someone chose themselves are left alone.
    old.keys.solo.pass = ['KeyM'];
    saveControls(old);
    expect(getControls().keys.solo.pass).toEqual(['KeyM']);
  });

  it('keeps a saved camera choice, and an older save or a broken one falls back to the normal camera', () => {
    const c = defaultControls();
    c.camera = { height: 'sky', portrait: 'side' };
    saveControls(c);
    expect(getControls().camera).toEqual({ height: 'sky', portrait: 'side' });
    const old = defaultControls() as unknown as Record<string, unknown>;
    delete old.camera;
    saveControls(old as unknown as ControlsConfig);
    expect(getControls().camera).toEqual({ height: 'mid', portrait: 'upfield' });
    saveControls({ ...defaultControls(), camera: { height: 'moon', portrait: 'diagonal' } } as unknown as ControlsConfig);
    expect(getControls().camera).toEqual({ height: 'mid', portrait: 'upfield' });
  });
});
