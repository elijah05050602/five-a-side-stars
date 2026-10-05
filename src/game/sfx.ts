import { getSettings } from '../data/storage';
import { audioContext, masterBus, midiToHz, noiseBuffer, noiseBurst, tone } from './audio';
import type { MatchSim, SimEvent } from './sim';

/**
 * Match sounds made entirely in code: a crowd that murmurs, holds its breath
 * when the ball nears a goal and roars at a goal; a referee's pea whistle;
 * ball thumps; rain and wind for bad weather. No audio files are needed.
 */
export class Sfx {
  private ctx: AudioContext | null = null;
  private bus: GainNode | null = null;
  private crowd: { gain: GainNode; filter: BiquadFilterNode; hum: GainNode } | null = null;
  private lastKick = 0;
  private excitement = 0;
  private running = false;
  private whistleTimer = 0;

  private ensure(): AudioContext | null {
    if (!getSettings().sound) return null;
    const c = audioContext();
    if (!c) return null;
    if (!this.ctx) {
      this.ctx = c;
      this.bus = c.createGain();
      this.bus.gain.value = 1;
      this.bus.connect(masterBus());
    }
    return c;
  }

  /** Start the crowd bed. Safe to call before any gesture: it retries on the first event. */
  start(weather: 'clear' | 'cloudy' | 'rain' | 'snow' = 'clear'): void {
    const c = this.ensure();
    if (!c || this.running) return;
    this.running = true;
    const bus = this.bus!;
    const t = c.currentTime;
    // Crowd: looping noise through a band-pass whose centre rises with excitement,
    // plus a low hum so it reads as people rather than hiss.
    const src = c.createBufferSource();
    src.buffer = noiseBuffer(c);
    src.loop = true;
    const filter = c.createBiquadFilter();
    filter.type = 'bandpass';
    filter.frequency.value = 420;
    filter.Q.value = 0.6;
    const gain = c.createGain();
    gain.gain.setValueAtTime(0.0001, t);
    gain.gain.exponentialRampToValueAtTime(0.05, t + 2);
    src.connect(filter).connect(gain).connect(bus);
    src.start(t);
    // Slow swell so the crowd breathes.
    const lfo = c.createOscillator();
    lfo.frequency.value = 0.13;
    const lfoGain = c.createGain();
    lfoGain.gain.value = 0.012;
    lfo.connect(lfoGain).connect(gain.gain);
    lfo.start(t);
    const hum = c.createGain();
    hum.gain.value = 0.03;
    const humSrc = c.createBufferSource();
    humSrc.buffer = noiseBuffer(c);
    humSrc.loop = true;
    humSrc.loopStart = 0.7;
    const humFilter = c.createBiquadFilter();
    humFilter.type = 'lowpass';
    humFilter.frequency.value = 180;
    humSrc.connect(humFilter).connect(hum).connect(bus);
    humSrc.start(t);
    this.crowd = { gain, filter, hum };

    if (weather === 'rain' || weather === 'snow') {
      // Rain is bright hiss; snow is a soft wind.
      const wsrc = c.createBufferSource();
      wsrc.buffer = noiseBuffer(c);
      wsrc.loop = true;
      wsrc.loopStart = 1.1;
      const wf = c.createBiquadFilter();
      wf.type = weather === 'rain' ? 'highpass' : 'lowpass';
      wf.frequency.value = weather === 'rain' ? 2500 : 300;
      const wg = c.createGain();
      wg.gain.setValueAtTime(0.0001, t);
      wg.gain.exponentialRampToValueAtTime(weather === 'rain' ? 0.035 : 0.05, t + 3);
      wsrc.connect(wf).connect(wg).connect(bus);
      wsrc.start(t);
      if (weather === 'snow') {
        const gust = c.createOscillator();
        gust.frequency.value = 0.07;
        const gg = c.createGain();
        gg.gain.value = 0.02;
        gust.connect(gg).connect(wg.gain);
        gust.start(t);
      }
    }
  }

  /**
   * Called every frame. The crowd gets louder and higher as the ball nears a
   * goal, and settles again when play is quiet.
   */
  update(dt: number, sim: MatchSim): void {
    if (!this.running) { this.start(this.pendingWeather); if (!this.running) return; }
    const c = this.ctx!;
    const b = sim.ball;
    const nearGoal = 1 - Math.min(1, (sim.length / 2 - Math.abs(b.pos.x)) / (sim.length * 0.3));
    const speed = Math.min(1, Math.hypot(b.vel.x, b.vel.z) / 10);
    const want = sim.phase === 'goal' ? 1 : sim.phase === 'play' ? Math.max(nearGoal * 0.7, speed * 0.35) : 0.1;
    // Rises fast, falls slowly, like a real crowd.
    this.excitement += (want - this.excitement) * (want > this.excitement ? 3 : 0.6) * dt;
    const e = this.excitement;
    if (this.crowd) {
      const t = c.currentTime;
      this.crowd.gain.gain.setTargetAtTime(0.04 + e * 0.11, t, 0.15);
      this.crowd.filter.frequency.setTargetAtTime(400 + e * 700, t, 0.2);
      this.crowd.hum.gain.setTargetAtTime(0.03 + e * 0.03, t, 0.2);
    }
    this.whistleTimer = Math.max(0, this.whistleTimer - dt);
  }

  /** 0..1 how worked up the crowd is right now (drives the fans in the stand too). */
  get level(): number { return this.excitement; }

  private pendingWeather: 'clear' | 'cloudy' | 'rain' | 'snow' = 'clear';
  setWeather(w: 'clear' | 'cloudy' | 'rain' | 'snow'): void { this.pendingWeather = w; }

  play(ev: SimEvent | string): void {
    const c = this.ensure();
    if (!c) return;
    const kind = typeof ev === 'string' ? ev : ev.type;
    const out = this.bus!;
    const t = c.currentTime;
    switch (kind) {
      case 'kick':
        if (t - this.lastKick < 0.08) return;
        this.lastKick = t;
        this.thump(t, 0.5);
        break;
      case 'touch':
        // A soft tap for each dribbling touch.
        if (t - this.lastKick < 0.12) return;
        this.lastKick = t;
        this.thump(t, 0.16);
        break;
      case 'shot':
        this.thump(t, 1);
        // A shot gets the crowd up on its feet.
        this.excitement = Math.max(this.excitement, 0.75);
        noiseBurst(c, out, t + 0.05, { gain: 0.08, attack: 0.15, decay: 0.6, freq: 500, freqEnd: 900, q: 0.7 });
        break;
      case 'save':
        this.ooh(t, 1);
        this.clap(t + 0.5, 6, 0.09);
        break;
      case 'miss':
        this.ooh(t, 0);
        break;
      case 'goal':
        this.roar(t);
        break;
      case 'foul':
        this.whistle(t, [0.14, 0.14]);
        this.groan(t + 0.1);
        break;
      case 'whistle':
      case 'kickoff':
        this.whistle(t, [0.45]);
        break;
      case 'halftime':
        this.whistle(t, [0.35, 0.35]);
        break;
      case 'fulltime':
        this.whistle(t, [0.3, 0.3, 0.9]);
        this.clap(t + 1.2, 18, 0.1);
        break;
      default:
        break;
    }
  }

  /** Ball struck: a low thud with a leathery click. Power 0..1. */
  private thump(t: number, power: number): void {
    const c = this.ctx!, out = this.bus!;
    tone(c, out, t, { freq: 150 + power * 60, freqEnd: 45, type: 'sine', gain: 0.35 + power * 0.25, attack: 0.003, decay: 0.09 + power * 0.06 });
    noiseBurst(c, out, t, { gain: 0.12 + power * 0.12, decay: 0.03 + power * 0.03, freq: 1800 + power * 1500, q: 0.8 });
  }

  /** The referee's pea whistle: two close tones with a fast flutter, one peep per entry in `peeps`. */
  private whistle(t: number, peeps: number[]): void {
    if (this.whistleTimer > 0) return;
    this.whistleTimer = 0.3;
    const c = this.ctx!, out = this.bus!;
    let at = t + 0.02;
    for (const dur of peeps) {
      const g = c.createGain();
      g.gain.setValueAtTime(0.0001, at);
      g.gain.exponentialRampToValueAtTime(0.16, at + 0.02);
      g.gain.setValueAtTime(0.16, at + dur - 0.03);
      g.gain.exponentialRampToValueAtTime(0.0001, at + dur + 0.04);
      const bp = c.createBiquadFilter();
      bp.type = 'bandpass';
      bp.frequency.value = 2300;
      bp.Q.value = 2;
      bp.connect(g).connect(out);
      for (const f of [2210, 2340, 2290]) {
        const o = c.createOscillator();
        o.type = 'square';
        o.frequency.value = f;
        o.connect(bp);
        o.start(at);
        o.stop(at + dur + 0.05);
      }
      // The pea: a quick flutter of the volume.
      const flutter = c.createOscillator();
      flutter.frequency.value = 38;
      const fg = c.createGain();
      fg.gain.value = 0.09;
      flutter.connect(fg).connect(g.gain);
      flutter.start(at);
      flutter.stop(at + dur + 0.05);
      at += dur + 0.12;
    }
  }

  /** The crowd goes "ooooh" after a near miss (up = a rising, hopeful ooh for a save). */
  private ooh(t: number, up: number): void {
    const c = this.ctx!, out = this.bus!;
    this.excitement = Math.max(this.excitement, 0.6);
    // Voices through a formant-ish band-pass so it sounds like a vowel, not a synth.
    const bp = c.createBiquadFilter();
    bp.type = 'lowpass';
    bp.frequency.setValueAtTime(up ? 700 : 900, t);
    bp.frequency.exponentialRampToValueAtTime(up ? 1200 : 400, t + 0.9);
    bp.connect(out);
    const g = c.createGain();
    g.gain.value = 0.06;
    g.connect(bp);
    for (let i = 0; i < 6; i++) {
      tone(c, g, t + i * 0.02, { freq: midiToHz(50 + (i % 3) * 7) * (1 + (i - 3) * 0.01), freqEnd: midiToHz(up ? 55 + (i % 3) * 7 : 46 + (i % 3) * 7), type: 'sawtooth', gain: 0.5, attack: 0.2, decay: 0.8, detune: (i - 3) * 11 });
    }
    noiseBurst(c, out, t, { gain: 0.1, attack: 0.2, decay: 0.8, freq: up ? 600 : 500, freqEnd: up ? 1000 : 350, q: 0.8 });
  }

  /** A grumble from the stands after a foul. */
  private groan(t: number): void {
    const c = this.ctx!, out = this.bus!;
    noiseBurst(c, out, t, { gain: 0.08, attack: 0.1, decay: 0.7, freq: 350, freqEnd: 220, q: 0.9 });
    for (let i = 0; i < 4; i++) tone(c, out, t + i * 0.03, { freq: midiToHz(43 + i), freqEnd: midiToHz(39 + i), type: 'sawtooth', gain: 0.02, attack: 0.15, decay: 0.6, detune: i * 7 });
  }

  /** Applause: a scatter of short noise taps. */
  private clap(t: number, taps: number, gain: number): void {
    const c = this.ctx!, out = this.bus!;
    for (let i = 0; i < taps; i++) {
      const at = t + i * 0.11 + Math.random() * 0.05;
      noiseBurst(c, out, at, { gain: gain * (0.7 + Math.random() * 0.5), decay: 0.06, freq: 1500 + Math.random() * 900, q: 1.2 });
      if (i % 2 === 0) noiseBurst(c, out, at + 0.02, { gain: gain * 0.5, decay: 0.05, freq: 2600, q: 1.5 });
    }
  }

  /** GOAL: a roar that swells and hangs, a drum, singing and a short fanfare. */
  private roar(t: number): void {
    const c = this.ctx!, out = this.bus!;
    this.excitement = 1;
    noiseBurst(c, out, t, { gain: 0.34, attack: 0.25, decay: 3.2, freq: 450, freqEnd: 1300, q: 0.5 });
    noiseBurst(c, out, t + 0.1, { gain: 0.16, attack: 0.4, decay: 2.6, freq: 1800, freqEnd: 2600, q: 0.7 });
    // The "heyyy": a cluster of voices sliding up a tone and holding.
    const voices = c.createGain();
    voices.gain.value = 0.045;
    const lp = c.createBiquadFilter();
    lp.type = 'lowpass';
    lp.frequency.value = 1100;
    voices.connect(lp).connect(out);
    for (let i = 0; i < 8; i++) {
      const base = midiToHz(55 + [0, 4, 7, 12][i % 4]);
      tone(c, voices, t + 0.05 + i * 0.02, { freq: base * 0.94, freqEnd: base, type: 'sawtooth', gain: 0.5, attack: 0.3, decay: 1.8, detune: (i - 4) * 10 });
    }
    // Drums: boom, boom, boom-boom.
    for (const d of [0, 0.42, 0.84, 1.05]) {
      tone(c, out, t + 0.15 + d, { freq: 110, freqEnd: 38, type: 'sine', gain: 0.5, attack: 0.004, decay: 0.28 });
      noiseBurst(c, out, t + 0.15 + d, { gain: 0.12, decay: 0.08, freq: 900, q: 0.8 });
    }
    // A bright three-note fanfare over the top.
    for (const [i, m] of [72, 76, 79, 84].entries()) {
      tone(c, out, t + 0.9 + i * 0.13, { freq: midiToHz(m), type: 'square', gain: 0.05, attack: 0.01, decay: i === 3 ? 0.7 : 0.18 });
      tone(c, out, t + 0.9 + i * 0.13, { freq: midiToHz(m - 12), type: 'triangle', gain: 0.06, attack: 0.01, decay: i === 3 ? 0.7 : 0.18 });
    }
    this.clap(t + 1.6, 22, 0.08);
  }

  dispose(): void {
    if (this.ctx && this.bus) {
      const t = this.ctx.currentTime;
      this.bus.gain.setTargetAtTime(0, t, 0.3);
      const bus = this.bus;
      window.setTimeout(() => bus.disconnect(), 1500);
    }
    this.running = false;
    this.crowd = null;
  }
}
