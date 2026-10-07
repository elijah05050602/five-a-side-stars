import { describe, expect, it } from 'vitest';
import { IDLE_INPUT, MatchSim, type SimPlayer } from '../game/sim';
import { team } from './helpers';
import { seedRandom } from './setup';

/** Play seeded matches where the human just runs at the ball and now and then taps Pass, and watch their team-mates. */
function play(seeds: number[], watch: (sim: MatchSim, mates: SimPlayer[]) => void): void {
  for (const age of ['U7', 'U10'] as const) for (const seed of seeds) {
    seedRandom(seed);
    const sim = new MatchSim({ home: team('h', 'Home', age), away: team('a', 'Away', age), difficulty: 'normal', halfSeconds: 60, humanSide: 0 });
    for (let n = 0; sim.phase !== 'fulltime' && n < 60 * 60 * 6; n++) {
      const me = sim.controlledBy[0];
      const input = { ...IDLE_INPUT };
      if (me) {
        const dx = sim.ball.pos.x - me.pos.x, dz = sim.ball.pos.z - me.pos.z, l = Math.hypot(dx, dz) || 1;
        input.moveX = dx / l; input.moveZ = dz / l;
        if (sim.ball.owner === me && Math.random() < 0.02) input.pass = true;
      }
      sim.step(1 / 60, input);
      sim.events.length = 0;
      watch(sim, sim.teamOf(0).filter((p) => !p.isKeeper && p !== sim.controlledBy[0]));
    }
  }
}

describe('team-mates off the ball', () => {
  it('stay on the pitch: nobody but the set-piece taker is over a line for more than half a second', () => {
    const overFor = new Map<SimPlayer, number>();
    let worst = 0;
    play([1, 2, 3], (sim, mates) => {
      for (const p of mates) {
        const over = Math.max(Math.abs(p.pos.x) - sim.length / 2, Math.abs(p.pos.z) - sim.width / 2);
        const counts = over > 0.25 && (sim.phase === 'play' || sim.phase === 'setpiece') && sim.setPiece?.taker !== p;
        const n = counts ? (overFor.get(p) ?? 0) + 1 : 0;
        overFor.set(p, n);
        worst = Math.max(worst, n);
      }
    });
    expect(worst).toBeLessThan(30);
  });
});
