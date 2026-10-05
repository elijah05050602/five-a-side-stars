/**
 * One shared Web Audio context for music, effects and the crowd, with a
 * compressor on the end so a goal roar on top of the tune never clips.
 * Browsers only let audio start after a tap or key press, so `audioContext()`
 * is called from gestures and `resume()` is retried on every call.
 */
let ctx: AudioContext | null = null;
let master: GainNode | null = null;
let noiseBuf: AudioBuffer | null = null;

export function audioContext(): AudioContext | null {
  try {
    if (!ctx) {
      const Ctor = window.AudioContext || (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
      if (!Ctor) return null;
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
    if (ctx.state === 'suspended') void ctx.resume();
    return ctx;
  } catch {
    return null;
  }
}

/** Where every sound plugs in. Only valid after audioContext() returned a context. */
export function masterBus(): GainNode {
  return master!;
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
