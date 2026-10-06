import { getSettings } from '../data/storage';
import { audioContext, channelBus, loadAudio } from './audio';

/**
 * Background music: ElevenLabs Music loops, the home theme on the menu pages
 * and a matchday groove from match preparation onwards (made by tools/audio/loop_music.py, see tools/audio/README-elevenlabs.md),
 * crossfading as you move between screens, plus short jingles at full time.
 * Starts on the first tap or key press (browsers require a gesture; the loading
 * screen asks for one) and fades right down during a match.
 */
export type Track = 'home' | 'matchday';

/** Loop lengths printed by loop_music.py; each file is a little longer for the crossfade. */
export const TRACKS: Record<Track, { file: string; loop: number }> = {
  // The home theme, a samba-pop carnival anthem, on the menu and every page around it.
  home: { file: 'audio/music-home.mp3', loop: 58.071 },
  // A laid-back funk-pop groove from match preparation onwards (team sheet, then results).
  matchday: { file: 'audio/music-matchday.mp3', loop: 55.203 },
};

/** Which loop a screen plays: the matchday groove on match preparation and results, the home theme everywhere else. */
export function trackFor(screen: string): Track {
  return screen === 'setup' || screen === 'results' ? 'matchday' : 'home';
}

export type Jingle = 'win' | 'draw';

class Music {
  private ctx: AudioContext | null = null;
  private bus: GainNode | null = null;
  private playing = false;
  private quiet = false;
  private want: Track = 'home';
  private current: { track: Track; src: AudioBufferSourceNode; gain: GainNode } | null = null;

  private get level(): number { return this.quiet ? 0.0 : 1; }

  /** Call from a user gesture. Does nothing when music is off in the settings. */
  start(): void {
    if (this.playing || !getSettings().music) return;
    const c = audioContext();
    if (!c) return;
    if (!this.ctx) {
      this.ctx = c;
      this.bus = c.createGain();
      this.bus.gain.value = 0;
      this.bus.connect(channelBus('music'));
    }
    this.bus!.gain.setTargetAtTime(this.level, c.currentTime, 0.4);
    this.playing = true;
    this.switchTo(this.want);
  }

  stop(): void {
    if (!this.playing) return;
    this.playing = false;
    if (this.ctx && this.bus) this.bus.gain.setTargetAtTime(0, this.ctx.currentTime, 0.3);
    this.fadeOut(1.5);
  }

  /** Pick the loop for the screen being shown; crossfades if music is playing. */
  setTrack(track: Track): void {
    this.want = track;
    if (this.playing) this.switchTo(track);
  }

  /** Fetch a loop ahead of time (e.g. behind the loading screen) so it starts on the first tap. */
  preload(track: Track = this.want): void {
    if (getSettings().music) void loadAudio(TRACKS[track].file);
  }

  /** Fade right down during a match so the crowd and the commentator carry the mood. */
  setQuiet(quiet: boolean): void {
    this.quiet = quiet;
    if (this.playing && this.ctx && this.bus) this.bus.gain.setTargetAtTime(this.level, this.ctx.currentTime, 0.6);
  }

  /** Apply a settings change immediately. */
  refresh(): void {
    if (getSettings().music) this.start(); else this.stop();
  }

  /** A short recorded fanfare, played over everything (used at full time). */
  jingle(kind: Jingle): void {
    if (!getSettings().music) return;
    const c = audioContext();
    if (!c) return;
    void loadAudio(`audio/${kind}.mp3`).then((buf) => {
      if (!buf) return;
      const src = c.createBufferSource();
      src.buffer = buf;
      const g = c.createGain();
      g.gain.value = 0.9;
      src.connect(g).connect(channelBus('music'));
      src.start();
    });
  }

  /** Fetch the jingles ahead of full time so they play on cue. */
  preloadJingles(): void {
    if (!getSettings().music || !audioContext()) return;
    void loadAudio('audio/win.mp3');
    void loadAudio('audio/draw.mp3');
  }

  private switchTo(track: Track): void {
    if (this.current?.track === track) return;
    void loadAudio(TRACKS[track].file).then((buf) => {
      // Only start it if this is still the loop we want and nothing has beaten us to it.
      if (!buf || !this.playing || this.want !== track || this.current?.track === track) return;
      this.fadeOut(1.2);
      this.playLoop(track, buf);
    });
  }

  private fadeOut(seconds: number): void {
    const cur = this.current, c = this.ctx;
    this.current = null;
    if (!cur || !c) return;
    cur.gain.gain.cancelScheduledValues(c.currentTime);
    cur.gain.gain.setValueAtTime(cur.gain.gain.value, c.currentTime);
    cur.gain.gain.linearRampToValueAtTime(0.0001, c.currentTime + seconds);
    cur.src.stop(c.currentTime + seconds + 0.05);
  }

  private playLoop(track: Track, buf: AudioBuffer): void {
    const c = this.ctx!;
    const src = c.createBufferSource();
    src.buffer = buf;
    src.loop = true;
    src.loopStart = 0;
    src.loopEnd = Math.min(buf.duration, TRACKS[track].loop || buf.duration);
    const gain = c.createGain();
    gain.gain.setValueAtTime(0.0001, c.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.8, c.currentTime + 1.2);
    src.connect(gain).connect(this.bus!);
    src.start();
    this.current = { track, src, gain };
  }
}

export const music = new Music();
