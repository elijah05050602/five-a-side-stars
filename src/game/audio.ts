import { getSettings } from '../data/storage';

/**
 * One shared Web Audio context for music, effects, the crowd and the
 * commentator, with a compressor on the end so a goal roar on top of the tune
 * never clips. Each kind of sound has its own volume bus, set from the settings.
 * Browsers only let audio start after a tap or key press, so `audioContext()`
 * is called from gestures and `resume()` is retried on every call.
 */
let ctx: AudioContext | null = null;
let master: GainNode | null = null;
let noiseBuf: AudioBuffer | null = null;

export type AudioChannel = 'music' | 'voice' | 'sfx';
const buses: Partial<Record<AudioChannel, GainNode>> = {};
const buffers = new Map<string, Promise<AudioBuffer | null>>();

export function audioContext(): AudioContext | null {
  try {
    if (!ctx) {
      const Ctor = window.AudioContext || (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
      if (!Ctor) return null;
      // iPhones mute Web Audio when the ring/silent switch is on, which reads as "no music".
      // Declaring a playback session (Safari 17+) lets the game play like a video does.
      const session = (navigator as unknown as { audioSession?: { type: string } }).audioSession;
      if (session) try { session.type = 'playback'; } catch { /* older browsers */ }
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
    }
    // iPhones report 'interrupted' (not 'suspended') after a call or app switch.
    if (ctx.state !== 'running' && ctx.state !== 'closed') void ctx.resume().catch(() => undefined);
    return ctx;
  } catch {
    return null;
  }
}

const UNLOCK_EVENTS = ['pointerdown', 'pointerup', 'touchend', 'click', 'keydown'] as const;

/**
 * Browsers only start audio from a real tap or key press, and phones count a
 * finger lifting (touchend / pointerup / click) rather than touching down. So
 * listen to all of them and keep listening until the context is really
 * running, calling `onRunning` each time a gesture gets it going. Also wake
 * the audio again when the game comes back from the background (phones
 * suspend it on a call or app switch).
 */
export function unlockAudio(onRunning: () => void): void {
  let armed = false;
  const tryUnlock = () => {
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
    if (document.visibilityState !== 'visible' || !ctx) return;
    if (ctx.state !== 'running') { void ctx.resume().catch(() => undefined); arm(); }
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

/** Re-read the volume settings, gliding each bus to its new level. */
export function applyVolumes(): void {
  if (!ctx) return;
  for (const ch of Object.keys(buses) as AudioChannel[]) buses[ch]!.gain.setTargetAtTime(channelLevel(ch), ctx.currentTime, 0.05);
}

/** Fetch and decode a file from public/ once; resolves null if it cannot be loaded or played. */
export function loadAudio(path: string): Promise<AudioBuffer | null> {
  let p = buffers.get(path);
  if (!p) {
    const c = audioContext();
    if (!c) return Promise.resolve(null);
    p = fetch(`${import.meta.env.BASE_URL}${path}`)
      .then((r) => (r.ok ? r.arrayBuffer() : Promise.reject(new Error(r.statusText))))
      .then((data) => new Promise<AudioBuffer>((resolve, reject) => { void c.decodeAudioData(data, resolve, reject); }))
      .catch(() => { buffers.delete(path); return null; });
    buffers.set(path, p);
  }
  return p;
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
