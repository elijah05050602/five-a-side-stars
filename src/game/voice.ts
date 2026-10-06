import { getSettings } from '../data/storage';
import { audioContext, channelBus, loadAudio } from './audio';
import type { LineKey } from './commentary';

/**
 * The spoken commentator. Every clip lives in one small audio sprite
 * (public/audio/commentary.mp3, built by tools/audio/split_elevenlabs.py)
 * with an index of where each line starts. Clips are generic ("What a save!")
 * so they suit any team; the ticker still shows the full line with names.
 * After a goal, at half time and at full time a score call follows ("It's two,
 * one."). Big moments cut in over chatter; chatter waits its turn or is dropped.
 */
type Clip = [start: number, duration: number];
interface Sprite { clips: Partial<Record<string, Clip[]>> }

/** How much a line matters: a higher one interrupts a lower one already playing. */
export function priority(key: LineKey): number {
  if (key.startsWith('goal') || key === 'penalty' || key === 'shootoutOver' || key.startsWith('fulltime')) return 3;
  if (key.startsWith('save') || key.startsWith('miss') || key === 'shootoutMiss' || key === 'foul' || key.startsWith('halftime') || key.startsWith('kickoff') || key === 'trainingOver' || key === 'lastMinute') return 2;
  return 1;
}

/** The sprite key for a score call, leader first: [2, 3] says "three, two". */
export function scoreClip(score: readonly [number, number]): string | null {
  const hi = Math.max(score[0], score[1]), lo = Math.min(score[0], score[1]);
  return hi <= 9 ? `score_${hi}_${lo}` : null;
}

/** Pick a clip index without repeating the last one for that key. */
export function pickClip(count: number, last: number | undefined, rng: () => number = Math.random): number {
  if (count <= 1) return 0;
  const i = Math.floor(rng() * (count - (last === undefined ? 0 : 1)));
  return last !== undefined && i >= last ? i + 1 : i;
}

/**
 * A recorded line to fall back on for a newer situation that has no clips of
 * its own in the sprite yet. Lines with no fallback are just shown, not spoken.
 */
export const FALLBACK: Partial<Record<LineKey, LineKey>> = {
  goalHeader: 'goalLead', goalComeback: 'goalEqualiser', goalTurnaround: 'goalLead', goalTapIn: 'goalLead', missSitter: 'missWide',
};

/**
 * The sprite's own sample rate (SR in tools/audio/split_elevenlabs.py). Decoded
 * at this rate rather than the context's, its 705 s take about 68 MB instead
 * of 124 MB at 44.1 kHz or 135 MB at 48 kHz.
 */
const SPRITE_RATE = 24000;

let spritePromise: Promise<{ sprite: Sprite; buffer: AudioBuffer } | null> | null = null;

/** Fetch the clips (once). Called on the first tap so the opening kick-off line is ready in time. */
export function preloadCommentary(): Promise<{ sprite: Sprite; buffer: AudioBuffer } | null> {
  if (!getSettings().commentary || !audioContext()) return Promise.resolve(null);
  if (!spritePromise) {
    spritePromise = Promise.all([
      fetch(`${import.meta.env.BASE_URL}audio/commentary.json`).then((r) => (r.ok ? (r.json() as Promise<Sprite>) : null)).catch(() => null),
      loadAudio('audio/commentary.mp3', SPRITE_RATE),
    ]).then(([sprite, buffer]) => (sprite && buffer ? { sprite, buffer } : null));
    void spritePromise.then((got) => { if (!got) spritePromise = null; });
  }
  return spritePromise;
}

export class Commentary {
  private sprite: Sprite | null = null;
  private buffer: AudioBuffer | null = null;
  private playing: { srcs: AudioBufferSourceNode[]; gain: GainNode; prio: number; until: number } | null = null;
  private readonly last = new Map<string, number>();
  private disposed = false;
  private pending: { key: LineKey; score?: readonly [number, number]; at: number } | null = null;

  /** Start fetching the clips. Silent until they arrive; nothing breaks if they never do. */
  load(): void {
    if (this.buffer) return;
    void preloadCommentary().then((got) => {
      if (this.disposed || !got) return;
      this.sprite = got.sprite;
      this.buffer = got.buffer;
      // Lines said while the clips were still on their way: speak the latest important one if it is fresh.
      const p = this.pending;
      this.pending = null;
      if (p && performance.now() - p.at < 1500) this.say(p.key, p.score);
    });
  }

  /** Speak a line for this commentary key, then the score if one is given. */
  say(key: LineKey, score?: readonly [number, number]): void {
    if (!getSettings().commentary) return;
    if (!this.sprite || !this.buffer) {
      if (priority(key) >= 2) this.pending = { key, score: score && [score[0], score[1]], at: performance.now() };
      return;
    }
    const c = audioContext();
    if (!c) return;
    const clips = this.sprite.clips[key]?.length ? this.sprite.clips[key] : this.sprite.clips[FALLBACK[key] ?? ''];
    if (!clips?.length) return;
    const prio = priority(key);
    const now = c.currentTime;
    if (this.playing && this.playing.until > now) {
      if (prio <= this.playing.prio) {
        // Chatter never queues. An important line waits for the one before it if it is nearly done.
        if (prio === 1 || this.playing.until - now > 0.8) return;
      } else {
        this.playing.gain.gain.setTargetAtTime(0, now, 0.04);
        for (const src of this.playing.srcs) src.stop(now + 0.2);
        this.playing = null;
      }
    }
    const start = this.playing && this.playing.until > now ? this.playing.until + 0.05 : now + 0.02;
    const i = pickClip(clips.length, this.last.get(key));
    this.last.set(key, i);
    const gain = c.createGain();
    gain.connect(channelBus('voice'));
    const srcs = [this.play(c, gain, clips[i], start)];
    let until = start + clips[i][1];
    const sc = score && scoreClip(score);
    const scoreClips = sc ? this.sprite.clips[sc] : undefined;
    if (scoreClips?.length) {
      srcs.push(this.play(c, gain, scoreClips[0], until + 0.08));
      until += 0.08 + scoreClips[0][1];
    }
    this.playing = { srcs, gain, prio, until };
  }

  dispose(): void {
    this.disposed = true;
    for (const src of this.playing?.srcs ?? []) { try { src.stop(); } catch { /* already stopped */ } }
    this.playing = null;
  }

  private play(c: AudioContext, out: AudioNode, [offset, dur]: Clip, at: number): AudioBufferSourceNode {
    const src = c.createBufferSource();
    src.buffer = this.buffer;
    src.connect(out);
    src.start(at, Math.max(0, offset), dur);
    return src;
  }
}
