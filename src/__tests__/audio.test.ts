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

/** A fake MP3: the bytes just say how long it is and how many channels it has. */
function fakeMp3(seconds: number, channels = 1): ArrayBuffer { return new Float64Array([seconds, channels]).buffer; }

/**
 * Decodes a fake MP3 at a context's rate. Like the real decodeAudioData it
 * takes the bytes (they cannot be decoded twice); a length of 0 fails.
 */
function fakeDecode(rate: number, data: ArrayBuffer, ok: (b: FakeBuffer) => void, fail?: (e: unknown) => void, broken = false): Promise<FakeBuffer> {
  const [seconds, channels] = new Float64Array(data);
  structuredClone(data, { transfer: [data] });
  if (broken || !(seconds > 0)) { fail?.(new Error('bad audio')); return Promise.reject(new Error('bad audio')); }
  const b = new FakeBuffer(channels, Math.round(seconds * rate), rate);
  ok(b);
  return Promise.resolve(b);
}

/** An OfflineAudioContext, only used for decoding at a chosen rate. */
class FakeOffline {
  static made: number[] = [];
  static broken = false;
  readonly sampleRate: number;
  constructor(_channels: number, _length: number, rate: number) { this.sampleRate = rate; FakeOffline.made.push(rate); }
  decodeAudioData(data: ArrayBuffer, ok: (b: FakeBuffer) => void, fail?: (e: unknown) => void): Promise<FakeBuffer> { return fakeDecode(this.sampleRate, data, ok, fail, FakeOffline.broken); }
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

/** A few cues in the shape of public/audio/commentary.json. */
const CLIPS: Record<string, [number, number][]> = {
  kickoffFirst: [[1, 2]], quietAttack: [[4, 1.5], [6, 1.5]], save: [[8, 1.5], [10, 1.5]], foul: [[12, 2]],
  goalOpener: [[15, 3]], fulltimeWin: [[19, 2.5]], score_1_0: [[22, 1]], score_2_1: [[24, 1]],
};

/** Serve the commentary index and a recording of the given length. */
function serveSprite(seconds = 705.24): void {
  files['audio/commentary.json'] = () => ({ voice: 'test', clips: CLIPS });
  files['audio/commentary.mp3'] = () => fakeMp3(seconds);
}

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
  FakeOffline.made = [];
  FakeOffline.broken = false;
  // Timers are looked up when called, so vi.useFakeTimers() reaches them too.
  win = Object.assign(new EventTarget(), {
    AudioContext: FakeContext,
    OfflineAudioContext: FakeOffline,
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

describe('decoding', () => {
  it('decodes the 24 kHz commentary at its own rate: half the memory of the context rate', async () => {
    serveSprite();
    const { preloadCommentary } = await import('../game/voice');
    const b = (await preloadCommentary())!.buffer as unknown as FakeBuffer;
    expect(FakeOffline.made).toEqual([24000]);
    expect(b.sampleRate).toBe(24000);
    expect(b.duration).toBeCloseTo(705.24, 2);
    // 32-bit samples: about 68 MB, where the 48 kHz context would have made about 135 MB.
    expect((b.length * b.numberOfChannels * 4) / 1e6).toBeCloseTo(67.7, 1);
  });

  it('decodes music at the context rate as before', async () => {
    files['audio/music-home.mp3'] = () => fakeMp3(61, 2);
    const { loadAudio } = await import('../game/audio');
    const b = (await loadAudio('audio/music-home.mp3')) as unknown as FakeBuffer;
    expect(b.sampleRate).toBe(48000);
    expect(FakeOffline.made).toEqual([]);
  });

  it('falls back to the main context where an offline context at 24 kHz cannot be made (old Safari)', async () => {
    serveSprite();
    win.OfflineAudioContext = undefined;
    win.webkitOfflineAudioContext = class { constructor() { throw new DOMException('sample rate not supported', 'NotSupportedError'); } };
    const { preloadCommentary } = await import('../game/voice');
    expect(((await preloadCommentary())!.buffer as unknown as FakeBuffer).sampleRate).toBe(48000);
  });

  it('falls back to the main context where there is no offline context at all', async () => {
    serveSprite();
    win.OfflineAudioContext = undefined;
    const { preloadCommentary } = await import('../game/voice');
    expect(((await preloadCommentary())!.buffer as unknown as FakeBuffer).sampleRate).toBe(48000);
  });

  it('decodes a copy with the main context if the offline decode fails', async () => {
    serveSprite();
    FakeOffline.broken = true;
    const { preloadCommentary } = await import('../game/voice');
    expect(FakeOffline.made).toEqual([]);
    expect(((await preloadCommentary())!.buffer as unknown as FakeBuffer).sampleRate).toBe(48000);
    expect(FakeOffline.made).toEqual([24000]);
  });
});

describe('music', () => {
  /** Serve the two loops; each one's bytes arrive only when its gate is opened, so tests can race the switches. */
  function serveLoops(): Record<'home' | 'matchday', () => void> {
    const gates = { home: () => undefined, matchday: () => undefined } as Record<'home' | 'matchday', () => void>;
    for (const [name, seconds] of [['home', 58.071], ['matchday', 55.203]] as const) {
      files[`audio/music-${name}.mp3`] = () => new Promise((resolve) => { gates[name] = () => resolve(fakeMp3(seconds, 2)); });
    }
    return gates;
  }
  /** The loops playing now, by length (58.071 s is the home theme, 55.203 s the matchday groove). */
  const loops = (c: FakeContext) => c.sources.filter((s) => s.loop && s.startedAt !== null && s.stoppedAt === null).map((s) => s.buffer!.duration);
  const fetches = (name: string) => fetched.filter((u) => u.endsWith(`music-${name}.mp3`)).length;

  async function playingHome() {
    const gates = serveLoops();
    const { music } = await import('../game/music');
    const { audioContext } = await import('../game/audio');
    const c = audioContext() as unknown as FakeContext;
    music.setTrack('home');
    music.start();
    await settle();
    gates.home();
    await settle();
    expect(loops(c)).toEqual([58.071]);
    return { gates, music, c };
  }

  it('a switch while a loop is still decoding plays only the loop the screen wants', async () => {
    const gates = serveLoops();
    const { music } = await import('../game/music');
    const { audioContext } = await import('../game/audio');
    const c = audioContext() as unknown as FakeContext;
    music.setTrack('home');
    music.start();
    await settle();
    music.setTrack('matchday'); // on to match preparation before the home theme has arrived
    await settle();
    gates.matchday();
    await settle();
    expect(loops(c)).toEqual([55.203]);
    gates.home(); // arrives late: never starts
    await settle();
    expect(loops(c)).toEqual([55.203]);
  });

  it('switching away and straight back keeps the loop playing and never starts the other', async () => {
    const { gates, music, c } = await playingHome();
    music.setTrack('matchday');
    await settle();
    music.setTrack('home');
    gates.matchday();
    await settle();
    expect(loops(c)).toEqual([58.071]);
  });

  it('keeps only the playing loop decoded, decoding the other again when it is wanted', async () => {
    const { gates, music, c } = await playingHome();
    music.setTrack('matchday');
    await settle();
    gates.matchday();
    await settle();
    expect(loops(c)).toEqual([55.203]); // the home theme is fading out and stopping
    expect(fetches('home')).toBe(1);
    music.setTrack('home'); // back to the menu: the home theme is fetched and decoded again
    await settle();
    expect(fetches('home')).toBe(2);
    gates.home();
    await settle();
    expect(loops(c)).toEqual([58.071]);
    music.setTrack('matchday');
    await settle();
    expect(fetches('matchday')).toBe(2);
  });

  it('music switched off while a loop decodes starts nothing, and lets the decoded loops go', async () => {
    const { updateSettings } = await import('../data/storage');
    const { gates, music, c } = await playingHome();
    updateSettings({ music: false });
    music.refresh();
    expect(loops(c)).toEqual([]);
    updateSettings({ music: true });
    music.refresh();
    await settle();
    expect(fetches('home')).toBe(2); // let go while music was off, so decoded again
    music.setTrack('matchday');
    await settle();
    updateSettings({ music: false });
    music.refresh();
    gates.matchday();
    await settle();
    expect(loops(c)).toEqual([]);
    updateSettings({ music: true });
    music.refresh();
    await settle();
    expect(fetches('matchday')).toBe(2);
  });
});

describe('match sounds', () => {
  it('fades out, then stops and unplugs the looping crowd and weather when the match ends', async () => {
    vi.useFakeTimers();
    const { channelBus } = await import('../game/audio');
    const { Sfx } = await import('../game/sfx');
    const sfx = new Sfx();
    sfx.start('snow');
    const c = FakeContext.made[0];
    const loops = c.live();
    expect(loops).toHaveLength(5); // crowd noise, its swell, the hum, the wind and its gusts
    const bus = c.gains.find((g) => g.outputs.has(channelBus('sfx')))!;
    c.currentTime = 10;
    sfx.dispose();
    expect(bus.gain.events).toContainEqual({ type: 'target', value: 0, time: 10 });
    // Every loop is told to stop once the fade has died away, so none is left running.
    for (const s of loops) expect(s.stoppedAt).toBeGreaterThanOrEqual(11.5);
    expect(c.live()).toHaveLength(0);
    vi.advanceTimersByTime(1500);
    for (const s of loops) expect(s.disconnected).toBe(true);
    expect(bus.disconnected).toBe(true);
    // A late call does not start a new crowd on the old bus.
    sfx.start('rain');
    expect(c.live()).toHaveLength(0);
  });
});
