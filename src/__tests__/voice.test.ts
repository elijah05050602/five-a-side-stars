import { describe, expect, it } from 'vitest';
import { Commentator, LINES, type LineKey } from '../game/commentary';
import { FALLBACK, pickClip, priority, scoreClip } from '../game/voice';
import { IDLE_INPUT } from '../game/sim';
import { cpuMatch } from './helpers';
import spriteJson from '../../public/audio/commentary.json';

const sprite = spriteJson as unknown as { duration: number; clips: Record<string, [number, number][]> };

describe('recorded commentary', () => {
  it('has a spoken clip for every line it can say', () => {
    for (const key of Object.keys(LINES) as LineKey[]) {
      // A line with no recording yet plays its fallback's clip.
      const fallback = FALLBACK[key];
      expect(sprite.clips[key]?.length || (fallback && sprite.clips[fallback]?.length), key).toBeGreaterThan(0);
      if (fallback) expect(sprite.clips[fallback]?.length, fallback).toBeGreaterThan(0);
    }
  });

  it('has a score call for every score up to nine goals', () => {
    for (let a = 0; a <= 9; a++) for (let b = 0; b <= 9; b++) expect(sprite.clips[scoreClip([a, b])!], `${a}-${b}`).toBeDefined();
    expect(scoreClip([10, 2])).toBeNull();
  });

  it('stores the length of the recording it indexes, and every clip ends inside it', () => {
    // ffprobe's length of public/audio/commentary.mp3; the game refuses a recording that differs by more than half a second.
    expect(sprite.duration).toBeCloseTo(890.06, 2);
    for (const [key, clips] of Object.entries(sprite.clips)) for (const [start, d] of clips) expect(start + d, key).toBeLessThan(sprite.duration);
  });

  it('clips do not overlap', () => {
    const all = Object.values(sprite.clips).flat().sort((x, y) => x[0] - y[0]);
    for (let i = 1; i < all.length; i++) expect(all[i][0]).toBeGreaterThanOrEqual(all[i - 1][0] + all[i - 1][1] - 0.001);
    for (const [, d] of all) expect(d).toBeGreaterThan(0.3);
  });

  it('says scores leader first', () => {
    expect(scoreClip([1, 3])).toBe('score_3_1');
    expect(scoreClip([2, 2])).toBe('score_2_2');
  });

  it('goals outrank saves, which outrank chatter', () => {
    expect(priority('goalOpener')).toBeGreaterThan(priority('save'));
    expect(priority('missBar')).toBeGreaterThan(priority('quietAttack'));
    expect(priority('fulltimeWin')).toBe(priority('goalLate'));
  });

  it('never picks the same clip twice in a row', () => {
    for (let last = 0; last < 4; last++) for (const r of [0, 0.3, 0.6, 0.99]) expect(pickClip(4, last, () => r)).not.toBe(last);
    expect(pickClip(1, 0)).toBe(0);
  });

  it('the commentator reports what it says, with the score after goals and at full time', () => {
    const sim = cpuMatch({ halfSeconds: 12 });
    const c = new Commentator({ weather: 'clear', time: 'day' }, () => 0);
    const heard: { key: LineKey; score?: readonly [number, number] }[] = [];
    c.onSay = (key, score) => heard.push({ key, score: score && [score[0], score[1]] });
    let guard = 0;
    while (sim.phase !== 'fulltime' && guard++ < 60 * 60) {
      sim.step(1 / 60, IDLE_INPUT);
      c.onEvents(sim, sim.events);
      sim.events.length = 0;
      c.onFrame(sim, 1 / 60);
    }
    expect(heard[0].key).toBe('kickoffFirst');
    const last = heard[heard.length - 1];
    expect(last.key).toMatch(/^fulltime/);
    expect(last.score).toEqual([sim.score[0], sim.score[1]]);
    expect(heard.filter((h) => h.key.startsWith('goal')).every((h) => h.score)).toBe(true);
  });
});
