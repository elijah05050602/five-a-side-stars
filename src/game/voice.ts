import { getSettings } from '../data/storage';
import { afterPlayerModel, audioContext, channelBus, loadAudio, releaseAudio } from './audio';
import type { LineKey } from './commentary';

/**
 * The spoken commentator. Every clip lives in one small audio sprite
 * (public/audio/commentary.mp3, built by tools/audio/split_elevenlabs.py)
 * with an index of where each line starts. Clips are generic ("What a save!")
 * so they suit any team; the ticker still shows the full line with names.
 * After a goal, at half time and at full time a score call follows ("It's two,
 * one."). A bigger moment cuts in over a smaller one; any other important line
 * waits for the one being spoken (one line waits at most, and a newer line
 * takes its place unless the waiting one matters more); chatter is only spoken
 * into silence.
 */
type Clip = [start: number, duration: number];
/** commentary.json: where each clip lies in the recording, and how long the recording it was built for is (s). */
interface Sprite { duration?: number; clips: Partial<Record<string, Clip[]>> }
/** A line (and its score call) scheduled on the context: being spoken, or waiting for the one before it. */
interface Spoken { srcs: AudioBufferSourceNode[]; gain: GainNode; prio: number; until: number }

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
  // Not recorded yet (voice is on hold): a plain goal call, never one that names a corner.
  goalRoof: 'goalLead', goalLowMiddle: 'goalLead',
};

/**
 * The sprite's own sample rate (SR in tools/audio/split_elevenlabs.py). Decoded
 * at this rate rather than the context's, its 705 s take about 68 MB instead
 * of 124 MB at 44.1 kHz or 135 MB at 48 kHz.
 */
const SPRITE_RATE = 24000;
/** After a failed download, how long (ms) before a line may try again, so an offline phone is not asked for every line. */
const RETRY_MS = 10000;
/** How far (s) a decoded recording's length may stray from the one its index was built for: MP3 decoders differ by a few frames. */
const LENGTH_SLACK = 0.5;

interface Loaded { sprite: Sprite; buffer: AudioBuffer }
let spritePromise: Promise<Loaded | null> | null = null;
/** The clips once they have arrived, for a Commentary to pick up straight away. */
let loaded: Loaded | null = null;
let retryAt = -Infinity;
/** The index and the recording turned out not to belong together: silent until the next visit. */
let mismatched = false;

/**
 * True when the index belongs to this recording. They are separate files, so
 * a stale cache can pair an old index with a new recording (or the other way
 * round), and then every cue would point into the wrong line.
 */
export function spriteMatches(sprite: Sprite, seconds: number): boolean {
  if (typeof sprite.duration === 'number') return Math.abs(sprite.duration - seconds) <= LENGTH_SLACK;
  // An index from before the length was stored: at least every cue must lie inside the recording.
  return Object.values(sprite.clips).every((clips) => (clips ?? []).every(([start, dur]) => start + dur <= seconds));
}

/**
 * Fetch the clips (once). Called on the first tap so the opening kick-off line
 * is ready in time, when a match starts, when commentary is switched on, and
 * by a line that finds the clips missing (commentary was off when the match
 * started, or a download failed: that is tried again at most every ten seconds).
 * The download waits for the player model (see afterPlayerModel) unless `now`
 * says the clips are wanted already, as they are by a line.
 * An index and recording that do not match are refused: wrong lines are worse
 * than none, and asking again would only bring the same pair from the cache.
 */
export function preloadCommentary(now = false): Promise<Loaded | null> {
  if (!getSettings().commentary || mismatched || !audioContext()) return Promise.resolve(null);
  if (now) void afterPlayerModel(true);
  if (!spritePromise) {
    if (performance.now() < retryAt) return Promise.resolve(null);
    spritePromise = afterPlayerModel().then(() => Promise.all([
      fetch(`${import.meta.env.BASE_URL}audio/commentary.json`).then((r) => (r.ok ? (r.json() as Promise<Sprite>) : null)).catch(() => null),
      loadAudio('audio/commentary.mp3', SPRITE_RATE),
    ])).then(([sprite, buffer]) => {
      if (!sprite || !buffer) return null;
      if (spriteMatches(sprite, buffer.duration)) return { sprite, buffer };
      mismatched = true;
      releaseAudio('audio/commentary.mp3');
      return null;
    });
    void spritePromise.then((got) => {
      if (got) loaded = got;
      else { spritePromise = null; retryAt = performance.now() + RETRY_MS; }
    });
  }
  return spritePromise;
}

export class Commentary {
  private ctx: AudioContext | null = null;
  private sprite: Sprite | null = null;
  private buffer: AudioBuffer | null = null;
  /** The line being spoken, then at most one waiting for it. Any of their sources may still sound. */
  private lines: Spoken[] = [];
  private readonly last = new Map<string, number>();
  private disposed = false;
  private loading = false;
  private pending: { key: LineKey; score?: readonly [number, number]; at: number } | null = null;

  /**
   * Start fetching the clips (straight away if `now`, else once the player
   * model is in). Silent until they arrive; nothing breaks if they never do.
   * say() calls it again, with `now`, while they are missing.
   */
  load(now = false): void {
    if (this.buffer || this.disposed) return;
    if (loaded) { this.sprite = loaded.sprite; this.buffer = loaded.buffer; return; }
    const download = preloadCommentary(now);
    if (this.loading) return;
    this.loading = true;
    void download.then((got) => {
      this.loading = false;
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
    if (this.disposed || !getSettings().commentary) return;
    // Commentary switched on mid-match, or the clips failed to arrive: pick them up or fetch them now.
    this.load(true);
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
    this.ctx = c;
    this.lines = this.lines.filter((l) => l.until > now);
    const [speaking, waiting] = this.lines;
    let start = now + 0.02;
    if (speaking) {
      if (prio > speaking.prio) {
        // A bigger moment cuts in over the line being spoken and the one waiting behind it.
        for (const l of this.lines) this.cut(l, now);
        this.lines = [];
      } else if (prio === 1 || (waiting && waiting.prio > prio)) {
        // Chatter is only spoken into silence, and a waiting line that matters more keeps its place.
        return;
      } else {
        // Wait for the line being spoken (a goal at the whistle still gets its final score), taking
        // the place of any line already waiting, so the commentary never falls far behind the play.
        if (waiting) this.cut(waiting, now);
        this.lines = [speaking];
        start = speaking.until + 0.05;
      }
    }
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
    this.lines.push({ srcs, gain, prio, until });
  }

  dispose(): void {
    this.disposed = true;
    this.pending = null;
    // A quick fade rather than stopping dead, which clicks.
    if (this.ctx) for (const l of this.lines) this.cut(l, this.ctx.currentTime);
    this.lines = [];
  }

  /** Fade a line out quickly and stop it, whether it is being spoken or still waiting to start. */
  private cut(l: Spoken, now: number): void {
    l.gain.gain.setTargetAtTime(0, now, 0.04);
    for (const src of l.srcs) { try { src.stop(now + 0.2); } catch { /* already stopped */ } }
  }

  private play(c: AudioContext, out: AudioNode, [offset, dur]: Clip, at: number): AudioBufferSourceNode {
    const src = c.createBufferSource();
    src.buffer = this.buffer;
    src.connect(out);
    src.start(at, Math.max(0, offset), dur);
    return src;
  }
}
