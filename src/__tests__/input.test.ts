import { describe, expect, it } from 'vitest';
import { PressLatch, type InputState } from '../game/input';
import { IDLE_INPUT } from '../game/sim';

/**
 * The match loop in miniature: a screen drawing at `hz`, the sim stepping at 60 Hz, and a pass
 * tapped every seventh frame. Returns the share of taps a sim step saw.
 */
function tapsSeen(hz: number, latch: PressLatch | null): number {
  let acc = 0, taps = 0, seen = 0;
  for (let frame = 0; frame < 2000; frame++) {
    const tapped = frame % 7 === 3;
    if (tapped) taps++;
    const polled: InputState = { ...IDLE_INPUT, pass: tapped };
    const input = latch ? latch.take(polled) : polled;
    acc += 1 / hz;
    let steps = 0;
    while (acc >= 1 / 60) {
      if (steps === 0 && input.pass) seen++;
      acc -= 1 / 60;
      steps++;
    }
    if (steps > 0) latch?.clear();
  }
  return seen / taps;
}

describe('taps on fast screens', () => {
  it('used to lose taps read on frames that ran no sim step', () => {
    expect(tapsSeen(144, null)).toBeLessThan(0.6);
  });

  it('keeps every tap until a sim step uses it', () => {
    for (const hz of [60, 90, 120, 144, 240]) expect(tapsSeen(hz, new PressLatch())).toBe(1);
  });

  it('gives each tap to one step only', () => {
    const latch = new PressLatch();
    expect(latch.take({ ...IDLE_INPUT, shoot: true }).shoot).toBe(true);
    expect(latch.take({ ...IDLE_INPUT }).shoot).toBe(true); // no step ran in between
    latch.clear();
    expect(latch.take({ ...IDLE_INPUT }).shoot).toBe(false);
  });
});
