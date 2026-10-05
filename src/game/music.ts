import { getSettings } from '../data/storage';

/**
 * A cheerful little looping tune made with oscillators, so no audio files are
 * needed. Starts on the first tap or key press (browsers require a gesture)
 * and can be switched off by a parent.
 */
class Music {
  private ctx: AudioContext | null = null;
  private master: GainNode | null = null;
  private timer = 0;
  private nextTime = 0;
  private step = 0;
  private playing = false;
  private quiet = false;

  private readonly bpm = 128;
  // 16 steps per bar, 4 bars. Numbers are MIDI notes, 0 = rest.
  private readonly lead = [
    72, 0, 76, 0, 79, 0, 76, 0, 72, 0, 74, 0, 76, 0, 0, 0,
    74, 0, 77, 0, 81, 0, 77, 0, 74, 0, 76, 0, 77, 0, 0, 0,
    76, 0, 79, 0, 83, 0, 79, 0, 76, 0, 77, 0, 79, 0, 0, 0,
    77, 0, 76, 0, 74, 0, 72, 0, 74, 0, 0, 0, 72, 0, 0, 0,
  ];
  private readonly bass = [
    48, 0, 0, 0, 48, 0, 0, 0, 52, 0, 0, 0, 55, 0, 0, 0,
    50, 0, 0, 0, 50, 0, 0, 0, 53, 0, 0, 0, 57, 0, 0, 0,
    52, 0, 0, 0, 52, 0, 0, 0, 55, 0, 0, 0, 59, 0, 0, 0,
    53, 0, 0, 0, 55, 0, 0, 0, 48, 0, 0, 0, 55, 0, 0, 0,
  ];

  private freq(midi: number): number { return 440 * Math.pow(2, (midi - 69) / 12); }

  /** Call from a user gesture. Does nothing when music is off in the settings. */
  start(): void {
    if (this.playing || !getSettings().music) return;
    try {
      if (!this.ctx) {
        this.ctx = new (window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext)();
        this.master = this.ctx.createGain();
        this.master.connect(this.ctx.destination);
      }
      if (this.ctx.state === 'suspended') void this.ctx.resume();
      this.master!.gain.setTargetAtTime(this.quiet ? 0.035 : 0.07, this.ctx.currentTime, 0.3);
      this.playing = true;
      this.nextTime = this.ctx.currentTime + 0.05;
      this.timer = window.setInterval(() => this.schedule(), 80);
    } catch {
      /* no audio on this device */
    }
  }

  stop(): void {
    if (!this.playing) return;
    this.playing = false;
    window.clearInterval(this.timer);
    if (this.ctx && this.master) this.master.gain.setTargetAtTime(0, this.ctx.currentTime, 0.2);
  }

  /** Turn it down during a match so the whistle and the crowd can be heard. */
  setQuiet(quiet: boolean): void {
    this.quiet = quiet;
    if (this.playing && this.ctx && this.master) this.master.gain.setTargetAtTime(quiet ? 0.035 : 0.07, this.ctx.currentTime, 0.3);
  }

  /** Apply a settings change immediately. */
  refresh(): void {
    if (getSettings().music) this.start(); else this.stop();
  }

  private schedule(): void {
    const ctx = this.ctx!;
    const stepDur = 60 / this.bpm / 4;
    while (this.nextTime < ctx.currentTime + 0.25) {
      const i = this.step % this.lead.length;
      this.note(this.lead[i], this.nextTime, stepDur * 1.6, 'square', 0.5);
      this.note(this.bass[i], this.nextTime, stepDur * 2.5, 'triangle', 0.9);
      if (i % 4 === 0) this.tick(this.nextTime, i % 8 === 0 ? 0.35 : 0.18);
      this.nextTime += stepDur;
      this.step++;
    }
  }

  private note(midi: number, at: number, dur: number, type: OscillatorType, gain: number): void {
    if (!midi) return;
    const ctx = this.ctx!;
    const o = ctx.createOscillator();
    const g = ctx.createGain();
    o.type = type;
    o.frequency.value = this.freq(midi);
    g.gain.setValueAtTime(0.0001, at);
    g.gain.exponentialRampToValueAtTime(gain, at + 0.01);
    g.gain.exponentialRampToValueAtTime(0.0001, at + dur);
    o.connect(g).connect(this.master!);
    o.start(at);
    o.stop(at + dur + 0.02);
  }

  private tick(at: number, gain: number): void {
    const ctx = this.ctx!;
    const o = ctx.createOscillator();
    const g = ctx.createGain();
    o.type = 'triangle';
    o.frequency.setValueAtTime(900, at);
    o.frequency.exponentialRampToValueAtTime(200, at + 0.05);
    g.gain.setValueAtTime(gain, at);
    g.gain.exponentialRampToValueAtTime(0.0001, at + 0.06);
    o.connect(g).connect(this.master!);
    o.start(at);
    o.stop(at + 0.08);
  }
}

export const music = new Music();
