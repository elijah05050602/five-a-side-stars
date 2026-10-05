import { getSettings } from '../data/storage';

/** Tiny synthesised sound effects, so the game needs no audio files. */
export class Sfx {
  private ctx: AudioContext | null = null;
  private lastKick = 0;

  private ensure(): AudioContext | null {
    if (!getSettings().sound) return null;
    try {
      if (!this.ctx) this.ctx = new (window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext)();
      if (this.ctx.state === 'suspended') void this.ctx.resume();
      return this.ctx;
    } catch {
      return null;
    }
  }

  play(kind: string): void {
    const ctx = this.ensure();
    if (!ctx) return;
    const t = ctx.currentTime;
    const tone = (freq: number, dur: number, type: OscillatorType, gain: number, start = 0, slide = 1) => {
      const o = ctx.createOscillator();
      const g = ctx.createGain();
      o.type = type;
      o.frequency.setValueAtTime(freq, t + start);
      o.frequency.exponentialRampToValueAtTime(Math.max(30, freq * slide), t + start + dur);
      g.gain.setValueAtTime(gain, t + start);
      g.gain.exponentialRampToValueAtTime(0.0001, t + start + dur);
      o.connect(g).connect(ctx.destination);
      o.start(t + start);
      o.stop(t + start + dur + 0.02);
    };
    switch (kind) {
      case 'kick':
        if (t - this.lastKick < 0.08) return;
        this.lastKick = t;
        tone(180, 0.09, 'triangle', 0.25, 0, 0.4);
        break;
      case 'save':
        tone(300, 0.12, 'square', 0.08, 0, 0.6);
        break;
      case 'goal':
        [523, 659, 784, 1047].forEach((f, i) => tone(f, 0.25, 'square', 0.08, i * 0.12));
        tone(80, 0.5, 'sawtooth', 0.1, 0, 0.5);
        break;
      case 'kickoff':
      case 'halftime':
      case 'fulltime':
        tone(1600, 0.35, 'square', 0.06, 0, 1.02);
        if (kind !== 'kickoff') tone(1600, 0.35, 'square', 0.06, 0.4, 1.02);
        if (kind === 'fulltime') tone(1600, 0.6, 'square', 0.06, 0.8, 1.02);
        break;
      default:
        break;
    }
  }
}
