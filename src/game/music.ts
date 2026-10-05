import { getSettings } from '../data/storage';
import { audioContext, masterBus, midiToHz, noiseBurst, tone } from './audio';

/**
 * The menu tune: a bouncy football-anthem loop made from oscillators and
 * noise, so no audio files are needed. Chords, a lead, an oom-pah bass and a
 * drum kit, in two eight-bar sections. Starts on the first tap or key press
 * (browsers require a gesture) and fades right down during a match.
 */
const BPM = 132;
const STEPS_PER_BAR = 8; // eighth notes

// Chords per bar: [root midi, third, fifth] in a comfortable register.
const C = [60, 64, 67], G = [59, 62, 67], Am = [57, 60, 64], F = [57, 60, 65];
const CHORDS = [C, G, Am, F, C, G, F, G, Am, F, C, G, Am, F, G, G];
const ROOTS = [48, 43, 45, 41, 48, 43, 41, 43, 45, 41, 48, 43, 45, 41, 43, 43];

// Lead melody, one entry per eighth note, 0 = rest or hold the previous note.
const LEAD = [
  76, 79, 76, 72, 74, 76, 0, 0,
  74, 0, 71, 74, 79, 0, 0, 0,
  81, 0, 79, 76, 72, 74, 76, 0,
  77, 0, 76, 74, 72, 0, 0, 0,
  76, 79, 76, 72, 74, 76, 79, 0,
  81, 0, 79, 0, 83, 0, 0, 0,
  81, 79, 77, 76, 74, 0, 76, 0,
  74, 0, 0, 0, 71, 0, 0, 0,
  84, 0, 83, 81, 76, 0, 0, 0,
  81, 0, 79, 77, 72, 0, 0, 0,
  79, 76, 79, 76, 84, 0, 0, 0,
  83, 0, 81, 79, 74, 0, 0, 0,
  84, 0, 83, 81, 76, 0, 79, 0,
  81, 79, 77, 0, 81, 79, 77, 0,
  79, 0, 0, 81, 83, 0, 0, 0,
  86, 0, 0, 0, 84, 0, 0, 0,
];

class Music {
  private ctx: AudioContext | null = null;
  private bus: GainNode | null = null;
  private timer = 0;
  private nextTime = 0;
  private step = 0;
  private playing = false;
  private quiet = false;

  private get level(): number { return this.quiet ? 0.0 : 0.55; }

  /** Call from a user gesture. Does nothing when music is off in the settings. */
  start(): void {
    if (this.playing || !getSettings().music) return;
    const c = audioContext();
    if (!c) return;
    if (!this.ctx) {
      this.ctx = c;
      this.bus = c.createGain();
      this.bus.gain.value = 0;
      this.bus.connect(masterBus());
    }
    this.bus!.gain.setTargetAtTime(this.level, c.currentTime, 0.4);
    this.playing = true;
    this.nextTime = c.currentTime + 0.05;
    this.timer = window.setInterval(() => this.schedule(), 90);
  }

  stop(): void {
    if (!this.playing) return;
    this.playing = false;
    window.clearInterval(this.timer);
    if (this.ctx && this.bus) this.bus.gain.setTargetAtTime(0, this.ctx.currentTime, 0.3);
  }

  /** Fade right down during a match so the crowd and the whistle carry the mood. */
  setQuiet(quiet: boolean): void {
    this.quiet = quiet;
    if (this.playing && this.ctx && this.bus) this.bus.gain.setTargetAtTime(this.level, this.ctx.currentTime, 0.6);
  }

  /** Apply a settings change immediately. */
  refresh(): void {
    if (getSettings().music) this.start(); else this.stop();
  }

  private schedule(): void {
    const c = this.ctx!;
    const stepDur = 60 / BPM / 2;
    while (this.nextTime < c.currentTime + 0.3) {
      if (!this.quiet) this.playStep(this.step % LEAD.length, this.nextTime, stepDur);
      this.nextTime += stepDur;
      this.step++;
    }
  }

  private playStep(i: number, at: number, stepDur: number): void {
    const c = this.ctx!, out = this.bus!;
    const bar = Math.floor(i / STEPS_PER_BAR), beat = i % STEPS_PER_BAR;
    const chord = CHORDS[bar], root = ROOTS[bar];
    const sectionB = bar >= 8;

    // Lead: hold a note for as long as the rests that follow it (up to four steps).
    const m = LEAD[i];
    if (m) {
      let hold = 1;
      while (hold < 4 && LEAD[(i + hold) % LEAD.length] === 0) hold++;
      const dur = stepDur * hold * 0.92;
      tone(c, out, at, { freq: midiToHz(m), type: 'square', gain: 0.07, attack: 0.01, decay: dur });
      tone(c, out, at, { freq: midiToHz(m), type: 'triangle', gain: 0.1, attack: 0.01, decay: dur, detune: 6 });
    }
    // Chords: a soft pad on beats 1 and 3, stabs on the off-beats in section B.
    if (beat === 0 || beat === 4 || (sectionB && (beat === 3 || beat === 7))) {
      const stab = sectionB && beat % 2 === 1;
      for (const n of chord) tone(c, out, at, { freq: midiToHz(n), type: 'triangle', gain: stab ? 0.05 : 0.04, attack: stab ? 0.01 : 0.06, decay: stab ? stepDur * 0.6 : stepDur * 1.8 });
    }
    // Bass: oom-pah, root then the fifth an octave up.
    if (beat % 2 === 0) {
      const n = beat % 4 === 0 ? root : root + 7;
      tone(c, out, at, { freq: midiToHz(n), type: 'sawtooth', gain: 0.09, attack: 0.01, decay: stepDur * 1.2 });
      tone(c, out, at, { freq: midiToHz(n - 12), type: 'sine', gain: 0.12, attack: 0.01, decay: stepDur * 1.1 });
    }
    // Drums.
    if (beat === 0 || beat === 4 || (sectionB && beat === 7)) tone(c, out, at, { freq: 120, freqEnd: 40, type: 'sine', gain: 0.4, attack: 0.003, decay: 0.16 });
    if (beat === 2 || beat === 6) {
      noiseBurst(c, out, at, { gain: 0.16, decay: 0.12, freq: 1800, q: 0.7 });
      tone(c, out, at, { freq: 210, freqEnd: 150, type: 'triangle', gain: 0.12, attack: 0.003, decay: 0.1 });
      if (sectionB) noiseBurst(c, out, at + 0.012, { gain: 0.1, decay: 0.07, freq: 2600, q: 1.4 });
    }
    noiseBurst(c, out, at, { gain: beat % 2 === 1 ? 0.045 : 0.025, decay: beat % 2 === 1 ? 0.07 : 0.035, type: 'highpass', freq: 7000, q: 0.5 });
  }
}

export const music = new Music();
