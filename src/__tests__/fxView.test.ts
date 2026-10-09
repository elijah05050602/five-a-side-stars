import { describe, expect, it } from 'vitest';
import { lastingSuper, puffsFor, startedSupers, type FxPlayer } from '../game/fxView';

const at = (x: number, superKind: FxPlayer['superKind'] = null): FxPlayer => ({ x, z: 0, speed: 3, superKind, puff: 0 });

describe('super effects in goal replays', () => {
  it('keeps the glow on the player whose super lasts, wherever they are in the frame', () => {
    expect(lastingSuper([at(0), at(5, 'turbo')])).toBe(1);
    // A Rocket Shot or Magic Pass streaks the ball instead, so no one glows.
    expect(lastingSuper([at(0, 'rocket'), at(5, 'magic')])).toBe(-1);
    expect(lastingSuper([at(0), at(5)])).toBe(-1);
  });

  it('bursts again only where a super starts during the clip', () => {
    expect(startedSupers([at(0), at(5)], [at(0), at(6, 'bulldozer')])).toEqual([1]);
    expect(startedSupers([at(0), at(5, 'bulldozer')], [at(0), at(6, 'bulldozer')])).toEqual([]);
    expect(startedSupers([at(0, 'turbo')], [at(1)])).toEqual([]);
  });

  it('kicks up more dust for a dive than for a tackle', () => {
    expect(puffsFor(0, 0.5)).toBe(7);
    expect(puffsFor(0.5, 0)).toBe(4);
    expect(puffsFor(0.1, 0.1)).toBe(0);
  });
});
