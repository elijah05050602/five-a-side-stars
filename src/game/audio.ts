import { getSettings } from '../data/storage';
import { loadPlayerAsset } from './playerAsset';

/**
 * One shared Web Audio context for music, effects, the crowd and the
 * commentator, with a compressor on the end so a goal roar on top of the tune
 * never clips. Each kind of sound has its own volume bus, set from the settings.
 * Browsers only let audio start after a tap or key press, so `audioContext()`
 * is called from gestures and `resume()` is retried on every call. While the
 * page is hidden the context sleeps (see watchPage), and while music,
 * commentary and effects are all switched off it is never started at all.
 */
let ctx: AudioContext | null = null;
let master: GainNode | null = null;
let noiseBuf: AudioBuffer | null = null;
let quietTimer = 0;

export type AudioChannel = 'music' | 'voice' | 'sfx';
const buses: Partial<Record<AudioChannel, GainNode>> = {};
const buffers = new Map<string, Promise<AudioBuffer | null>>();

/** Is any of music, commentary and effects switched on? With all three off the game leaves the device's audio alone. */
export function soundOn(): boolean {
  const s = getSettings();
  return s.music || s.commentary || s.sound;
}

/**
 * iPhones mute Web Audio when the ring/silent switch is on, which reads as "no
 * music". Declaring a playback session (Safari 17+) lets the game play like a
 * video does, but that also stops other audio such as a parent's podcast, so
 * it is only declared while some sound is switched on and handed back
 * ('auto') once everything is off.
 */
function setSession(type: 'playback' | 'auto'): void {
  const session = (navigator as unknown as { audioSession?: { type: string } }).audioSession;
  if (session && session.type !== type) try { session.type = type; } catch { /* older browsers */ }
}

export function audioContext(): AudioContext | null {
  try {
    if (!ctx) {
      // Everything switched off: no context at all, so a muted game never takes over the audio.
      if (!soundOn()) return null;
      const Ctor = window.AudioContext || (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
      if (!Ctor) return null;
      setSession('playback');
      ctx = new Ctor();
      const comp = ctx.createDynamicsCompressor();
      comp.threshold.value = -12;
      comp.knee.value = 20;
      comp.ratio.value = 6;
      comp.attack.value = 0.004;
      comp.release.value = 0.25;
      master = ctx.createGain();
      master.gain.value = 0.9;
      master.connect(comp).connect(ctx.destination);
      watchPage();
    }
    wake();
    return ctx;
  } catch {
    return null;
  }
}

/** Start the context again if it has stopped, unless the page is hidden or every sound is switched off. */
function wake(): void {
  // iPhones report 'interrupted' (not 'suspended') after a call or app switch.
  if (!ctx || ctx.state === 'running' || ctx.state === 'closed' || document.hidden || !soundOn()) return;
  setSession('playback');
  void ctx.resume().catch(() => undefined);
}

function sleep(): void {
  if (ctx && ctx.state !== 'closed') void ctx.suspend().catch(() => undefined);
}

/**
 * A hidden page draws no frames, so a match stands still, but its looping
 * crowd would keep droning at its last level (a goal roar from a background
 * tab) and the menu music would keep playing. So the context sleeps while the
 * page is hidden or being left, and wakes when it is shown again; if the phone
 * wants a tap for that, the listeners in unlockAudio() catch the next one.
 */
function watchPage(): void {
  document.addEventListener('visibilitychange', () => (document.hidden ? sleep() : wake()));
  window.addEventListener('pagehide', sleep);
  window.addEventListener('pageshow', wake);
}

const UNLOCK_EVENTS = ['pointerdown', 'pointerup', 'touchend', 'click', 'keydown'] as const;

/**
 * Browsers only start audio from a real tap or key press, and phones count a
 * finger lifting (touchend / pointerup / click) rather than touching down. So
 * listen to all of them and keep listening until the context is really
 * running, calling `onRunning` each time a gesture gets it going. When the
 * game comes back from the background (phones suspend the audio on a call or
 * app switch, and it sleeps while hidden) the next tap starts it again if
 * waking it without one did not work. While every sound is switched off taps
 * do nothing; applyVolumes() starts the audio when one is switched back on.
 */
export function unlockAudio(onRunning: () => void): void {
  let armed = false;
  const tryUnlock = () => {
    if (!soundOn()) return;
    const c = audioContext();
    if (!c) return;
    // Older iPhones only unlock audio once a sound actually starts inside the gesture.
    if (c.state !== 'running') {
      const blip = c.createBufferSource();
      blip.buffer = c.createBuffer(1, 1, c.sampleRate);
      blip.connect(c.destination);
      blip.start();
    }
    onRunning();
    const done = () => {
      if (c.state !== 'running' || !armed) return;
      armed = false;
      for (const ev of UNLOCK_EVENTS) window.removeEventListener(ev, tryUnlock, true);
    };
    done();
    if (c.state !== 'running') void c.resume().then(() => { done(); if (c.state === 'running') onRunning(); }, () => undefined);
  };
  const arm = () => {
    if (armed) return;
    armed = true;
    for (const ev of UNLOCK_EVENTS) window.addEventListener(ev, tryUnlock, { capture: true, passive: true });
  };
  arm();
  let watched: AudioContext | null = null;
  const watch = () => {
    // If the audio stops later (a phone call, the app going to the background),
    // the next tap starts it again.
    if (!ctx || watched === ctx) return;
    watched = ctx;
    ctx.addEventListener('statechange', () => { if (ctx && ctx.state !== 'running' && ctx.state !== 'closed') arm(); });
  };
  for (const ev of UNLOCK_EVENTS) window.addEventListener(ev, watch, { capture: true, passive: true });
  document.addEventListener('visibilitychange', () => {
    if (!document.hidden && ctx && ctx.state !== 'running') arm();
  });
}

/** Where every sound plugs in. Only valid after audioContext() returned a context. */
export function masterBus(): GainNode {
  return master!;
}

/** The volume a channel should play at right now: its on/off switch times its slider. */
export function channelLevel(ch: AudioChannel): number {
  const s = getSettings();
  if (ch === 'music') return s.music ? s.musicVolume : 0;
  if (ch === 'voice') return s.commentary ? s.voiceVolume : 0;
  return s.sound ? s.sfxVolume : 0;
}

/** The gain node for music, commentary or effects. Only valid after audioContext() returned a context. */
export function channelBus(ch: AudioChannel): GainNode {
  let g = buses[ch];
  if (!g) {
    g = ctx!.createGain();
    g.gain.value = channelLevel(ch);
    g.connect(master!);
    buses[ch] = g;
  }
  return g;
}

/**
 * Re-read the sound settings, gliding each bus to its new level. Switching a
 * sound on wakes the audio (making the context if it is the first one);
 * switching the last one off lets the buses fade, then puts the context to
 * sleep and hands the audio session back. Call it straight from the tap or
 * slider that changed the setting (the sound mixer, the console bar's sound
 * button, Reset), since phones only start audio inside a gesture.
 */
export function applyVolumes(): void {
  const c = soundOn() ? audioContext() : ctx;
  if (!c) return;
  for (const ch of Object.keys(buses) as AudioChannel[]) buses[ch]!.gain.setTargetAtTime(channelLevel(ch), c.currentTime, 0.05);
  window.clearTimeout(quietTimer);
  if (!soundOn()) quietTimer = window.setTimeout(() => { if (!soundOn()) { sleep(); setSession('auto'); } }, 400);
}

let modelWait: Promise<void> | null = null;
let endModelWait = (): void => undefined;

/**
 * Downloads that are not needed yet (the commentator's clips, the full-time
 * jingles) wait for the player model to load, or fail to. On a first visit the
 * tutorial starts at once and "Tap to Play" waits for the model, so they would
 * only slow it down. `now` ends the wait, for a sound that is wanted already.
 */
export function afterPlayerModel(now = false): Promise<void> {
  if (!modelWait) {
    modelWait = new Promise<void>((resolve) => {
      endModelWait = resolve;
      loadPlayerAsset().then(() => resolve(), () => resolve());
    });
  }
  if (now) endModelWait();
  return modelWait;
}

/**
 * Fetch and decode a file from public/ once; resolves null if it cannot be
 * loaded or played. `rate` is for a file recorded below the context's rate:
 * see decode().
 */
export function loadAudio(path: string, rate?: number): Promise<AudioBuffer | null> {
  let p = buffers.get(path);
  if (!p) {
    const c = audioContext();
    if (!c) return Promise.resolve(null);
    const loading: Promise<AudioBuffer | null> = fetch(`${import.meta.env.BASE_URL}${path}`)
      .then((r) => (r.ok ? r.arrayBuffer() : Promise.reject(new Error(r.statusText))))
      .then((data) => decode(c, data, rate))
      .catch(() => { if (buffers.get(path) === loading) buffers.delete(path); return null; });
    buffers.set(path, loading);
    p = loading;
  }
  return p;
}

/**
 * Forget a decoded file so its memory can go once nothing is playing it. The
 * next loadAudio() of it fetches it again (from the cache) and decodes it.
 */
export function releaseAudio(path: string): void {
  buffers.delete(path);
}

/**
 * decodeAudioData turns a file into 32-bit samples at its context's rate (44.1
 * or 48 kHz), which for a file recorded lower is mostly wasted memory: the
 * 24 kHz commentary would take about 135 MB at 48 kHz. Given `rate`, the file
 * is decoded by an offline context at that rate instead, and playback
 * resamples it on the fly. Browsers that cannot do that (old Safari only makes
 * offline contexts from 44.1 kHz up) decode with the main context as before.
 */
function decode(c: AudioContext, data: ArrayBuffer, rate?: number): Promise<AudioBuffer> {
  const Offline = window.OfflineAudioContext || (window as unknown as { webkitOfflineAudioContext?: typeof OfflineAudioContext }).webkitOfflineAudioContext;
  if (rate && rate < c.sampleRate && Offline) {
    try {
      const offline = new Offline(1, 1, rate);
      // Decoding takes the bytes, so keep a copy for the main context in case this way fails.
      const copy = data.slice(0);
      return decodeWith(offline, data).catch(() => decodeWith(c, copy));
    } catch { /* no offline context at this rate */ }
  }
  return decodeWith(c, data);
}

function decodeWith(c: BaseAudioContext, data: ArrayBuffer): Promise<AudioBuffer> {
  return new Promise<AudioBuffer>((resolve, reject) => {
    // Old Safari only calls back; newer browsers also return a promise, which would report the failure a second time.
    (c.decodeAudioData(data, resolve, reject) as Promise<AudioBuffer> | undefined)?.catch(() => undefined);
  });
}

/** Two seconds of white noise, shared by the crowd, rain, drums and ball thumps. */
export function noiseBuffer(c: AudioContext): AudioBuffer {
  if (noiseBuf && noiseBuf.sampleRate === c.sampleRate) return noiseBuf;
  const len = c.sampleRate * 2;
  noiseBuf = c.createBuffer(1, len, c.sampleRate);
  const d = noiseBuf.getChannelData(0);
  for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
  return noiseBuf;
}

export const midiToHz = (midi: number): number => 440 * Math.pow(2, (midi - 69) / 12);

/** A gain node with an attack/decay envelope already scheduled, returned so a source can be plugged in. */
export function envelope(c: AudioContext, out: AudioNode, at: number, peak: number, attack: number, decay: number): GainNode {
  const g = c.createGain();
  g.gain.setValueAtTime(0.0001, at);
  g.gain.exponentialRampToValueAtTime(Math.max(0.0002, peak), at + Math.max(0.002, attack));
  g.gain.exponentialRampToValueAtTime(0.0001, at + attack + decay);
  g.connect(out);
  return g;
}

/** A filtered burst of noise: the building block for claps, thumps, hats and the crowd. */
export function noiseBurst(c: AudioContext, out: AudioNode, at: number, opts: { gain: number; attack?: number; decay: number; type?: BiquadFilterType; freq: number; freqEnd?: number; q?: number }): void {
  const src = c.createBufferSource();
  src.buffer = noiseBuffer(c);
  src.loop = true;
  src.loopStart = Math.random() * 1.5;
  src.loopEnd = src.loopStart + 0.5;
  const f = c.createBiquadFilter();
  f.type = opts.type ?? 'bandpass';
  f.Q.value = opts.q ?? 1;
  f.frequency.setValueAtTime(opts.freq, at);
  if (opts.freqEnd) f.frequency.exponentialRampToValueAtTime(opts.freqEnd, at + (opts.attack ?? 0.005) + opts.decay);
  const g = envelope(c, out, at, opts.gain, opts.attack ?? 0.005, opts.decay);
  src.connect(f).connect(g);
  src.start(at);
  src.stop(at + (opts.attack ?? 0.005) + opts.decay + 0.05);
}

/** A single oscillator note with an envelope and an optional pitch slide. */
export function tone(c: AudioContext, out: AudioNode, at: number, opts: { freq: number; freqEnd?: number; type?: OscillatorType; gain: number; attack?: number; decay: number; detune?: number }): OscillatorNode {
  const o = c.createOscillator();
  o.type = opts.type ?? 'sine';
  if (opts.detune) o.detune.value = opts.detune;
  o.frequency.setValueAtTime(opts.freq, at);
  if (opts.freqEnd) o.frequency.exponentialRampToValueAtTime(Math.max(20, opts.freqEnd), at + (opts.attack ?? 0.005) + opts.decay);
  const g = envelope(c, out, at, opts.gain, opts.attack ?? 0.005, opts.decay);
  o.connect(g);
  o.start(at);
  o.stop(at + (opts.attack ?? 0.005) + opts.decay + 0.05);
  return o;
}
