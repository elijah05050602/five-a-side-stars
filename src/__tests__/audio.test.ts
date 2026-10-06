/**
 * How the game drives Web Audio, checked against a small stand-in for the
 * browser: a fake AudioContext that records what is scheduled, a fake page
 * (window, document) to hide and show, and a fake fetch. Each test loads the
 * audio modules afresh, so one test's context never leaks into the next.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

// The player model's download, which the commentary and the jingles wait for. A test can hold it back.
const model = vi.hoisted(() => ({ ready: Promise.resolve() as Promise<unknown> }));
vi.mock('../game/playerAsset', () => ({ loadPlayerAsset: () => model.ready }));

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

/** Serve a recording of the given length and an index built for a recording of `indexFor` seconds (none: an old index). */
function serveSprite(seconds = 705.24, indexFor: number | undefined = 705.24): void {
  files['audio/commentary.json'] = () => ({ voice: 'test', ...(indexFor === undefined ? {} : { duration: indexFor }), clips: CLIPS });
  files['audio/commentary.mp3'] = () => fakeMp3(seconds);
}

/** Serve the commentary, but hold the recording back until the returned function is called. */
function holdSprite(): () => void {
  serveSprite();
  let release = () => undefined as void;
  files['audio/commentary.mp3'] = () => new Promise((resolve) => { release = () => resolve(fakeMp3(705.24)); });
  return () => release();
}

/** What the commentator has started saying: each sprite source as its cue's key, when it starts and when it is told to stop. */
function said(c: FakeContext): { key: string | undefined; at: number; stop: number | null }[] {
  const keyAt = new Map<number, string>();
  for (const [key, clips] of Object.entries(CLIPS)) for (const [start] of clips) keyAt.set(start, key);
  return c.sources.filter((s) => s.buffer?.sampleRate === 24000 && s.startedAt !== null).map((s) => ({ key: keyAt.get(s.offset), at: s.startedAt!, stop: s.stoppedAt }));
}

function setHidden(hidden: boolean): void {
  doc.hidden = hidden;
  doc.visibilityState = hidden ? 'hidden' : 'visible';
  doc.dispatchEvent(new Event('visibilitychange'));
}

/** Let promise callbacks (fetches, decodes) run. */
async function settle(): Promise<void> { for (let i = 0; i < 50; i++) await Promise.resolve(); }

beforeEach(() => {
  vi.resetModules();
  model.ready = Promise.resolve();
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

describe('commentary: getting the clips', () => {
  it('commentary switched on mid-match: the next line fetches the clips and is spoken when they arrive', async () => {
    const { updateSettings } = await import('../data/storage');
    updateSettings({ commentary: false });
    serveSprite();
    const { Commentary } = await import('../game/voice');
    const v = new Commentary();
    v.load(); // the match starts with commentary off
    await settle();
    expect(fetched).toEqual([]);
    updateSettings({ commentary: true }); // switched on from the pause screen
    v.say('save');
    await settle();
    expect(said(FakeContext.made[0]).map((s) => s.key)).toEqual(['save']);
  });

  it('switching commentary on in the sound mixer fetches the clips straight away', async () => {
    const { updateSettings } = await import('../data/storage');
    updateSettings({ commentary: false });
    serveSprite();
    const { wireSoundSettings } = await import('../ui/soundSettings');
    type Input = { checked: boolean; value: string; disabled: boolean; on: Record<string, () => void>; addEventListener(type: string, fn: () => void): void };
    const inputs = new Map<string, Input>();
    const root = {
      querySelector(sel: string): Input {
        if (!inputs.has(sel)) inputs.set(sel, { checked: false, value: '100', disabled: false, on: {}, addEventListener(type, fn) { this.on[type] = fn; } });
        return inputs.get(sel)!;
      },
    };
    wireSoundSettings(root as unknown as HTMLElement);
    const box = inputs.get('[data-mix-on="voice"]')!;
    box.checked = true;
    box.on.change();
    await settle();
    expect(fetched.filter((u) => u.endsWith('commentary.mp3'))).toHaveLength(1);
    const { Commentary } = await import('../game/voice');
    const v = new Commentary();
    v.say('quietAttack'); // even chatter is spoken now: the clips are already here
    expect(said(FakeContext.made[0]).map((s) => s.key)).toEqual(['quietAttack']);
  });

  it('after a failed download a later line tries again, but not more than every ten seconds', async () => {
    vi.useFakeTimers();
    const { Commentary } = await import('../game/voice');
    const v = new Commentary();
    const tries = () => fetched.filter((u) => u.endsWith('commentary.json')).length;
    v.load(); // nothing is served yet: the download fails
    await settle();
    expect(tries()).toBe(1);
    serveSprite();
    v.say('save'); // too soon to ask again
    await settle();
    expect(tries()).toBe(1);
    vi.advanceTimersByTime(10_000);
    v.say('save');
    await settle();
    expect(tries()).toBe(2);
    expect(said(FakeContext.made[0]).map((s) => s.key)).toEqual(['save']);
  });

  it('a line said while the clips are on their way is spoken when they arrive, if it is still fresh', async () => {
    vi.useFakeTimers();
    const release = holdSprite();
    const { Commentary } = await import('../game/voice');
    const v = new Commentary();
    v.load();
    await settle();
    v.say('quietAttack'); // chatter is not kept for later
    v.say('kickoffFirst');
    await settle();
    release();
    await settle();
    expect(said(FakeContext.made[0]).map((s) => s.key)).toEqual(['kickoffFirst']);
  });

  it('refuses a recording that does not match its index, and stays silent rather than say the wrong lines', async () => {
    vi.useFakeTimers();
    serveSprite(690, 705.24); // a new recording with the index of an old one, from a stale cache
    const { Commentary, preloadCommentary } = await import('../game/voice');
    expect(await preloadCommentary()).toBeNull();
    const v = new Commentary();
    v.say('goalOpener', [1, 0]);
    vi.advanceTimersByTime(60_000);
    v.say('save');
    await settle();
    expect(said(FakeContext.made[0])).toEqual([]);
    // Nothing is fetched again for this visit (the same cache would give the same pair)...
    expect(fetched.filter((u) => u.endsWith('commentary.mp3'))).toHaveLength(1);
    // ...and the refused recording's samples are let go.
    const { loadAudio } = await import('../game/audio');
    void loadAudio('audio/commentary.mp3', 24000);
    expect(fetched.filter((u) => u.endsWith('commentary.mp3'))).toHaveLength(2);
  });

  it('allows the few hundredths of a second MP3 decoders differ by', async () => {
    serveSprite(705.17, 705.24); // Chromium trims the encoder delay and padding: ffprobe says 705.24 s
    const { preloadCommentary } = await import('../game/voice');
    expect(await preloadCommentary()).not.toBeNull();
  });

  it('an index from before lengths were stored is used only if every cue lies inside the recording', async () => {
    serveSprite(20, undefined); // the last cue in CLIPS ends at 25 s
    const voice = await import('../game/voice');
    expect(await voice.preloadCommentary()).toBeNull();
    expect(voice.spriteMatches({ clips: CLIPS }, 30)).toBe(true);
  });

  it('a line said too long before the clips arrive is not spoken late', async () => {
    vi.useFakeTimers();
    const release = holdSprite();
    const { Commentary } = await import('../game/voice');
    const v = new Commentary();
    v.load();
    v.say('save');
    await settle();
    vi.advanceTimersByTime(2000);
    release();
    await settle();
    expect(said(FakeContext.made[0])).toEqual([]);
  });
});

describe('commentary: who speaks when', () => {
  /** A commentator with the clips loaded, on a context whose clock the test moves. */
  async function ready() {
    serveSprite();
    const { Commentary } = await import('../game/voice');
    const v = new Commentary();
    v.load();
    await settle();
    const c = FakeContext.made[0];
    const at = (t: number) => { c.currentTime = t; };
    return { v, c, at };
  }
  /** The fade a line was given: the time its gain was sent towards silence. */
  const fadedAt = (src: FakeSource) => ([...src.outputs][0] as FakeGain).gain.events.find((e) => e.type === 'target' && e.value === 0)?.time;
  const lineSources = (c: FakeContext) => c.sources.filter((s) => s.buffer?.sampleRate === 24000);

  it('a bigger moment cuts in: the line being spoken fades out quickly and stops', async () => {
    const { v, c, at } = await ready();
    at(10);
    v.say('quietAttack'); // chatter, 1.5 s
    at(10.5);
    v.say('goalOpener', [1, 0]);
    const [chatter, goal, score] = lineSources(c);
    expect(fadedAt(chatter)).toBe(10.5);
    expect(chatter.stoppedAt).toBeCloseTo(10.7);
    expect(said(c).map((s) => s.key)).toEqual(['quietAttack', 'goalOpener', 'score_1_0']);
    expect(goal.startedAt).toBeCloseTo(10.52);
    expect(score.startedAt).toBeCloseTo(10.52 + 3 + 0.08);
  });

  it('chatter is dropped while anything is being spoken', async () => {
    const { v, c, at } = await ready();
    at(1);
    v.say('save');
    at(1.4);
    v.say('quietAttack');
    expect(said(c).map((s) => s.key)).toEqual(['save']);
    at(2.6); // the save line is over: chatter is spoken into the silence
    v.say('quietAttack');
    expect(said(c).map((s) => s.key)).toEqual(['save', 'quietAttack']);
  });

  it('a goal at the whistle: the full-time call waits for the goal call instead of being dropped', async () => {
    const { v, c, at } = await ready();
    at(20);
    v.say('goalOpener', [1, 0]); // goal 3 s + score 1 s: until 24.1
    at(21);
    v.say('fulltimeWin', [1, 0]);
    expect(said(c).map((s) => s.key)).toEqual(['goalOpener', 'score_1_0', 'fulltimeWin', 'score_1_0']);
    const [goal, goalScore, fulltime, finalScore] = lineSources(c);
    expect(goal.stoppedAt).toBeNull();
    expect(goalScore.stoppedAt).toBeNull();
    expect(fulltime.startedAt).toBeCloseTo(20.02 + 3 + 0.08 + 1 + 0.05);
    expect(finalScore.startedAt).toBeCloseTo(fulltime.startedAt! + 2.5 + 0.08);
  });

  it('one line waits at most: a newer one takes its place, unless the waiting one matters more', async () => {
    const { v, c, at } = await ready();
    at(30);
    v.say('goalOpener', [1, 0]);
    at(31);
    v.say('kickoffFirst'); // waits
    at(31.5);
    v.say('fulltimeWin', [2, 1]); // newer and bigger: takes the kick-off line's place
    at(32);
    v.say('save'); // the full-time call keeps its place
    expect(said(c).map((s) => s.key)).toEqual(['goalOpener', 'score_1_0', 'kickoffFirst', 'fulltimeWin', 'score_2_1']);
    const [, , kickoff, fulltime] = lineSources(c);
    // The kick-off line was stopped before it ever started.
    expect(kickoff.stoppedAt!).toBeLessThan(kickoff.startedAt!);
    expect(fulltime.stoppedAt).toBeNull();
  });

  it('a cut-in silences every line still sounding, not just the newest one', async () => {
    const { v, c, at } = await ready();
    at(40);
    v.say('save'); // 1.5 s
    at(41);
    v.say('foul'); // waits for the save line, starting at 41.57
    at(41.2);
    v.say('goalOpener', [1, 0]);
    const [save, foul, goal] = lineSources(c);
    expect(fadedAt(save)).toBe(41.2);
    expect(save.stoppedAt).toBeCloseTo(41.4);
    expect(foul.stoppedAt).toBeCloseTo(41.4);
    expect(goal.startedAt).toBeCloseTo(41.22);
  });

  it('leaving the match fades the commentator out instead of stopping dead', async () => {
    const { v, c, at } = await ready();
    at(50);
    v.say('goalOpener', [2, 1]);
    at(51);
    v.say('kickoffFirst');
    at(51.5);
    v.dispose();
    const all = lineSources(c);
    expect(all).toHaveLength(3); // the goal call, its score call and the waiting kick-off line
    for (const src of all) {
      expect(fadedAt(src)).toBe(51.5);
      expect(src.stoppedAt).toBeCloseTo(51.7);
    }
    v.say('save'); // nothing more after the match is gone
    expect(lineSources(c)).toHaveLength(3);
  });
});

describe('first visit: the player model comes first', () => {
  /** Hold the player model back, with ways to let it load or fail. */
  function holdModel(): { load: () => void; fail: () => void } {
    const m = { load: () => undefined as void, fail: () => undefined as void };
    model.ready = new Promise((resolve, reject) => { m.load = () => resolve({}); m.fail = () => reject(new Error('no model')); });
    return m;
  }
  const got = () => fetched.map((u) => u.replace(/^\//, '')).sort();

  it('the commentary waits for the player model before downloading', async () => {
    const m = holdModel();
    serveSprite();
    const { Commentary, preloadCommentary } = await import('../game/voice');
    void preloadCommentary(); // the first tap
    new Commentary().load(); // the tutorial starts straight away
    await settle();
    expect(fetched).toEqual([]);
    m.load();
    await settle();
    expect(got()).toEqual(['audio/commentary.json', 'audio/commentary.mp3']);
  });

  it('a player model that fails to load does not hold the commentary up', async () => {
    const m = holdModel();
    serveSprite();
    const { preloadCommentary } = await import('../game/voice');
    const loading = preloadCommentary();
    m.fail();
    expect(await loading).not.toBeNull();
  });

  it('a line that wants speaking ends the wait, and is spoken when the clips arrive', async () => {
    holdModel();
    serveSprite();
    const { Commentary } = await import('../game/voice');
    const v = new Commentary();
    v.load();
    await settle();
    expect(fetched).toEqual([]);
    v.say('kickoffFirst'); // the model is still loading, but the kick-off line wants the clips now
    await settle();
    expect(said(FakeContext.made[0]).map((s) => s.key)).toEqual(['kickoffFirst']);
  });

  it('the full-time jingles wait for it too, but play on cue if full time comes first', async () => {
    const m = holdModel();
    files['audio/win.mp3'] = () => fakeMp3(7.69, 2);
    files['audio/draw.mp3'] = () => fakeMp3(7.11, 2);
    const { music } = await import('../game/music');
    music.preloadJingles();
    await settle();
    expect(fetched).toEqual([]);
    music.jingle('win');
    await settle();
    expect(got()).toEqual(['audio/win.mp3']);
    m.load();
    await settle();
    expect(got()).toEqual(['audio/draw.mp3', 'audio/win.mp3']);
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
