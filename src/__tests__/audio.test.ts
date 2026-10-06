/**
 * How the game drives Web Audio, checked against a small stand-in for the
 * browser: a fake AudioContext that records what is scheduled, a fake page
 * (window, document) to hide and show, and a fake fetch. Each test loads the
 * audio modules afresh, so one test's context never leaks into the next.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

// ---------- a minimal Web Audio stand-in ----------

class FakeParam {
  readonly events: { type: string; value: number; time: number }[] = [];
  constructor(public value = 1) {}
  setValueAtTime(value: number, time: number) { this.events.push({ type: 'set', value, time }); this.value = value; return this; }
  setTargetAtTime(value: number, time: number) { this.events.push({ type: 'target', value, time }); return this; }
  linearRampToValueAtTime(value: number, time: number) { this.events.push({ type: 'linear', value, time }); return this; }
  exponentialRampToValueAtTime(value: number, time: number) { this.events.push({ type: 'exp', value, time }); return this; }
  cancelScheduledValues(time: number) { this.events.push({ type: 'cancel', value: 0, time }); return this; }
}

class FakeNode {
  readonly outputs = new Set<unknown>();
  disconnected = false;
  connect<T>(node: T): T { this.outputs.add(node); return node; }
  disconnect(): void { this.outputs.clear(); this.disconnected = true; }
}

class FakeGain extends FakeNode { readonly gain = new FakeParam(1); }

class FakeFilter extends FakeNode { type = 'lowpass'; readonly frequency = new FakeParam(350); readonly Q = new FakeParam(1); }

class FakeCompressor extends FakeNode {
  readonly threshold = new FakeParam(); readonly knee = new FakeParam(); readonly ratio = new FakeParam(); readonly attack = new FakeParam(); readonly release = new FakeParam();
}

class FakeBuffer {
  constructor(readonly numberOfChannels: number, readonly length: number, readonly sampleRate: number) {}
  get duration(): number { return this.length / this.sampleRate; }
  getChannelData(): Float32Array { return new Float32Array(this.length); }
}

class FakeSource extends FakeNode {
  buffer: FakeBuffer | null = null;
  loop = false; loopStart = 0; loopEnd = 0;
  startedAt: number | null = null; offset = 0; playFor: number | undefined;
  stoppedAt: number | null = null;
  onended: (() => void) | null = null;
  start(when = 0, offset = 0, duration?: number): void { this.startedAt = when; this.offset = offset; this.playFor = duration; }
  stop(when = 0): void { this.stoppedAt = when; }
}

class FakeOscillator extends FakeSource { type = 'sine'; readonly frequency = new FakeParam(440); readonly detune = new FakeParam(0); }

/** Decodes a fake MP3 (its bytes say how long it is and how many channels it has) at a context's rate; a length of 0 fails. */
function fakeDecode(rate: number, data: ArrayBuffer, ok: (b: FakeBuffer) => void, fail?: (e: unknown) => void): Promise<FakeBuffer> {
  const [seconds, channels] = new Float64Array(data);
  if (!(seconds > 0)) { fail?.(new Error('bad audio')); return Promise.reject(new Error('bad audio')); }
  const b = new FakeBuffer(channels, Math.round(seconds * rate), rate);
  ok(b);
  return Promise.resolve(b);
}

class FakeContext extends EventTarget {
  static made: FakeContext[] = [];
  state: 'suspended' | 'running' | 'closed' | 'interrupted' = 'suspended';
  currentTime = 0;
  readonly sampleRate = 48000;
  readonly destination = new FakeNode();
  readonly sources: FakeSource[] = [];
  readonly gains: FakeGain[] = [];
  /** How many times resume() and suspend() were asked for. */
  resumes = 0; suspends = 0;
  constructor() { super(); FakeContext.made.push(this); }
  private set(state: FakeContext['state']): void { if (this.state !== state) { this.state = state; this.dispatchEvent(new Event('statechange')); } }
  resume(): Promise<void> { this.resumes++; this.set('running'); return Promise.resolve(); }
  suspend(): Promise<void> { this.suspends++; this.set('suspended'); return Promise.resolve(); }
  createGain(): FakeGain { const g = new FakeGain(); this.gains.push(g); return g; }
  createBufferSource(): FakeSource { const s = new FakeSource(); this.sources.push(s); return s; }
  createOscillator(): FakeOscillator { const o = new FakeOscillator(); this.sources.push(o); return o; }
  createBiquadFilter(): FakeFilter { return new FakeFilter(); }
  createDynamicsCompressor(): FakeCompressor { return new FakeCompressor(); }
  createBuffer(channels: number, length: number, rate: number): FakeBuffer { return new FakeBuffer(channels, length, rate); }
  decodeAudioData(data: ArrayBuffer, ok: (b: FakeBuffer) => void, fail?: (e: unknown) => void): Promise<FakeBuffer> { return fakeDecode(this.sampleRate, data, ok, fail); }
  /** Sources started and not (yet) told to stop. */
  live(): FakeSource[] { return this.sources.filter((s) => s.startedAt !== null && s.stoppedAt === null); }
}

// ---------- a fake page ----------

let doc: EventTarget & { hidden: boolean; visibilityState: string };
let win: EventTarget & { [name: string]: unknown };
let files: Record<string, () => unknown>;
let fetched: string[];

function setHidden(hidden: boolean): void {
  doc.hidden = hidden;
  doc.visibilityState = hidden ? 'hidden' : 'visible';
  doc.dispatchEvent(new Event('visibilitychange'));
}

/** Let promise callbacks (fetches, decodes) run. */
async function settle(): Promise<void> { for (let i = 0; i < 10; i++) await Promise.resolve(); }

beforeEach(() => {
  vi.resetModules();
  FakeContext.made = [];
  // Timers are looked up when called, so vi.useFakeTimers() reaches them too.
  win = Object.assign(new EventTarget(), {
    AudioContext: FakeContext,
    setTimeout: (fn: () => void, ms?: number) => setTimeout(fn, ms),
    clearTimeout: (id: ReturnType<typeof setTimeout>) => clearTimeout(id),
  } as { [name: string]: unknown });
  doc = Object.assign(new EventTarget(), { hidden: false, visibilityState: 'visible' });
  vi.stubGlobal('window', win);
  vi.stubGlobal('document', doc);
  vi.stubGlobal('navigator', {});
  files = {};
  fetched = [];
  vi.stubGlobal('fetch', async (url: string) => {
    fetched.push(url);
    const body = files[url.replace(/^\//, '')];
    if (!body) return { ok: false, statusText: 'Not Found' };
    return { ok: true, json: async () => body(), arrayBuffer: async () => body() };
  });
});

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

describe('audio context and the page', () => {
  it('sleeps while the page is hidden or being left, and wakes when it is shown again', async () => {
    const { audioContext } = await import('../game/audio');
    const c = audioContext() as unknown as FakeContext;
    expect(c.state).toBe('running');
    setHidden(true);
    expect(c.state).toBe('suspended');
    // Nothing wakes it while hidden, not even a sound asking for the context.
    audioContext();
    expect(c.state).toBe('suspended');
    setHidden(false);
    expect(c.state).toBe('running');
    win.dispatchEvent(new Event('pagehide'));
    expect(c.state).toBe('suspended');
    win.dispatchEvent(new Event('pageshow'));
    expect(c.state).toBe('running');
  });

  it('a tap starts the audio again when waking it without one did not work', async () => {
    const { audioContext, unlockAudio } = await import('../game/audio');
    let started = 0;
    unlockAudio(() => started++);
    const c = audioContext() as unknown as FakeContext;
    // A phone that only resumes inside a gesture: the visible event's resume does nothing.
    c.resume = () => Promise.resolve();
    setHidden(true);
    setHidden(false);
    expect(c.state).toBe('suspended');
    c.resume = FakeContext.prototype.resume;
    win.dispatchEvent(new Event('touchend'));
    await settle();
    expect(c.state).toBe('running');
    expect(started).toBeGreaterThan(0);
  });

  it('with every sound switched off, a tap never starts the audio or claims the playback session', async () => {
    const session = { type: 'auto' };
    vi.stubGlobal('navigator', { audioSession: session });
    const { updateSettings } = await import('../data/storage');
    updateSettings({ music: false, commentary: false, sound: false });
    const { audioContext, unlockAudio } = await import('../game/audio');
    let started = 0;
    unlockAudio(() => started++);
    for (const ev of ['pointerdown', 'pointerup', 'touchend', 'click', 'keydown']) win.dispatchEvent(new Event(ev));
    expect(audioContext()).toBeNull();
    expect(FakeContext.made).toHaveLength(0);
    expect(started).toBe(0);
    expect(session.type).toBe('auto');
  });

  it('sleeps once everything is switched off and wakes when one sound is switched back on', async () => {
    vi.useFakeTimers();
    const session = { type: 'auto' };
    vi.stubGlobal('navigator', { audioSession: session });
    const { updateSettings } = await import('../data/storage');
    const { applyVolumes, audioContext, channelBus, unlockAudio } = await import('../game/audio');
    unlockAudio(() => undefined);
    const c = audioContext() as unknown as FakeContext;
    const music = channelBus('music') as unknown as FakeGain;
    expect(c.state).toBe('running');
    expect(session.type).toBe('playback');
    // The console bar's sound button turns all three off.
    updateSettings({ music: false, commentary: false, sound: false });
    applyVolumes();
    expect(music.gain.events.at(-1)).toMatchObject({ type: 'target', value: 0 });
    expect(c.state).toBe('running'); // the buses fade first
    vi.advanceTimersByTime(500);
    expect(c.state).toBe('suspended');
    expect(session.type).toBe('auto');
    // Taps, coming back to the page and sounds asking for the context leave it asleep.
    win.dispatchEvent(new Event('pointerdown'));
    win.dispatchEvent(new Event('click'));
    setHidden(true);
    setHidden(false);
    audioContext();
    expect(c.state).toBe('suspended');
    // Switching one back on (from its tap) wakes it.
    updateSettings({ sound: true });
    applyVolumes();
    expect(c.state).toBe('running');
    expect(session.type).toBe('playback');
    vi.advanceTimersByTime(1000);
    expect(c.state).toBe('running');
  });

  it('switching a sound on for the first time makes the context inside that tap', async () => {
    const { updateSettings } = await import('../data/storage');
    updateSettings({ music: false, commentary: false, sound: false });
    const { applyVolumes, audioContext } = await import('../game/audio');
    expect(audioContext()).toBeNull();
    updateSettings({ commentary: true });
    applyVolumes();
    expect(FakeContext.made).toHaveLength(1);
    expect(FakeContext.made[0].state).toBe('running');
  });

  it('wakes from an iPhone interruption (a call) on the next tap', async () => {
    const { audioContext, unlockAudio } = await import('../game/audio');
    unlockAudio(() => undefined);
    const c = audioContext() as unknown as FakeContext;
    win.dispatchEvent(new Event('pointerdown')); // lets unlockAudio watch the context
    c.state = 'interrupted';
    c.dispatchEvent(new Event('statechange'));
    win.dispatchEvent(new Event('click'));
    expect(c.state).toBe('running');
  });
});
