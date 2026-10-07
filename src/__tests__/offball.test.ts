import { describe, expect, it } from 'vitest';
import { IDLE_INPUT, MatchSim, type SimPlayer } from '../game/sim';
import type { InputState } from '../game/input';
import { cpuMatch, runUntil, team } from './helpers';
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

  // Set scenes: the human (home, attacking +x) has the ball on the halfway line, facing forward.
  const still = (p: SimPlayer, x: number, z: number) => { p.pos = { x, z }; p.vel = { x: 0, z: 0 }; p.aiTarget = { x, z }; p.think = 0; };
  function scene(mates: [number, number][], opps: [number, number][] = [], seed = 1) {
    seedRandom(seed);
    const sim = cpuMatch({ humanSide: 0, halfSeconds: 120 });
    runUntil(sim, (s) => s.phase === 'play');
    const [me, ...others] = sim.teamOf(0).filter((p) => !p.isKeeper);
    const them = sim.teamOf(1).filter((p) => !p.isKeeper);
    still(me, 0, 0);
    me.facing = 0;
    others.forEach((p, i) => still(p, ...(mates[i] ?? [-sim.length * 0.3, (i - 1) * 3])));
    const spots = them.map((_, i) => opps[i] ?? [-sim.length * 0.4, sim.width * 0.4 - i]);
    them.forEach((o, k) => still(o, spots[k][0], spots[k][1]));
    sim.controlledBy[0] = me;
    const b = sim.ball;
    b.owner = me; b.pos = { x: me.radius + b.radius, z: 0 }; b.vel = { x: 0, z: 0 }; b.y = 0; b.vy = 0;
    /** Step with the opponents frozen where they were put, and the human standing on the ball. */
    const run = (seconds: number, input: Partial<InputState> = {}, each?: () => void) => {
      for (let i = 0; i < seconds * 60; i++) {
        them.forEach((o, k) => { o.pos = { x: spots[k][0], z: spots[k][1] }; o.vel = { x: 0, z: 0 }; });
        sim.step(1 / 60, { ...IDLE_INPUT, ...input });
        sim.events.length = 0;
        each?.();
      }
    };
    return { sim, me, others, them, run };
  }
  const laneClear = (from: SimPlayer, to: SimPlayer, opps: SimPlayer[]) => opps.every((o) => {
    const d = Math.hypot(to.pos.x - from.pos.x, to.pos.z - from.pos.z);
    const nx = (to.pos.x - from.pos.x) / d, nz = (to.pos.z - from.pos.z) / d;
    const rx = o.pos.x - from.pos.x, rz = o.pos.z - from.pos.z;
    const along = rx * nx + rz * nz;
    return along <= 0 || along >= d || Math.abs(rx * nz - rz * nx) > 1.1;
  });

  it('move out from behind a defender so the pass is on', () => {
    const { others, me, them, run } = scene([[7, 0]], [[3.5, 0]]);
    expect(laneClear(me, others[0], them)).toBe(false);
    run(1.5);
    expect(laneClear(me, others[0], them)).toBe(true);
  });

  it('spread out instead of standing together', () => {
    const { others, run } = scene([[6, 3], [6.3, 3.2], [-4, -4]]);
    run(1.5);
    expect(Math.hypot(others[0].pos.x - others[1].pos.x, others[0].pos.z - others[1].pos.z)).toBeGreaterThan(2.5);
  });

  it('come short to help when the human is under pressure', () => {
    const { sim, others, me, them, run } = scene([[sim0Far(), 6], [-sim0Far(), -6], [-sim0Far(), 6]], [[-0.9, 0.3]]);
    const helper = others.reduce((a, p) => (Math.hypot(p.pos.x, p.pos.z) < Math.hypot(a.pos.x, a.pos.z) ? p : a));
    run(2);
    expect(Math.hypot(helper.pos.x - me.pos.x, helper.pos.z - me.pos.z)).toBeLessThan(5.5);
    expect(laneClear(me, helper, them)).toBe(true);
    expect(sim.phase).toBe('play');
  });
  function sim0Far(): number { return 9; }

  it('the front players run in behind the defence', () => {
    let deepest = -99;
    const { others, run } = scene([[4, 3], [4, -3], [-3, 0]], [[6, 2], [6, -2], [5, 0]], 3);
    const front = others.filter((p) => p.role === 'ATT' || p.role === 'WING');
    expect(front.length).toBeGreaterThan(0);
    run(6, {}, () => { for (const p of front) deepest = Math.max(deepest, p.pos.x); });
    expect(deepest).toBeGreaterThan(6 + 1.5);
  });

  it('wait for a pass the human is lining up', () => {
    const { others, run } = scene([[8, 0], [-4, 6], [-4, -6]]);
    others[0].vel = { x: 0, z: 3 };
    run(0.4, { moveX: 1, passHeld: true });
    expect(Math.hypot(others[0].vel.x, others[0].vel.z)).toBeLessThan(0.3);
  });

  it('pick up a different attacker each while the human closes down the dribbler', () => {
    seedRandom(2);
    const sim = cpuMatch({ humanSide: 0, halfSeconds: 120 });
    runUntil(sim, (s) => s.phase === 'play');
    const [me, ...mine] = sim.teamOf(0).filter((p) => !p.isKeeper);
    const [carrier, ...attackers] = sim.teamOf(1).filter((p) => !p.isKeeper);
    const L = sim.length;
    const at = (p: SimPlayer, x: number, z: number) => { p.pos = { x, z }; p.vel = { x: 0, z: 0 }; p.think = 0; };
    const theirs: [number, number][] = [[-L * 0.2, 0], [-L * 0.3, 4], [-L * 0.3, -4], [L * 0.1, 0]];
    for (let i = 0; i < 120; i++) {
      at(carrier, theirs[0][0], theirs[0][1]);
      attackers.forEach((o, k) => at(o, ...theirs[k + 1]));
      sim.ball.owner = carrier; sim.ball.pos = { x: carrier.pos.x - carrier.radius - sim.ball.radius, z: 0 }; sim.ball.vel = { x: 0, z: 0 };
      sim.controlledBy[0] = me;
      at(me, carrier.pos.x - 1.5, 0);
      if (i === 0) mine.forEach((p, k) => at(p, -L * 0.25, -5 + k * 5));
      sim.step(1 / 60, IDLE_INPUT);
      sim.events.length = 0;
    }
    // Each attacker in our half (other than the dribbler) has their own marker close by, goal-side.
    const inHalf = attackers.filter((o) => o.pos.x < 0);
    for (const o of inHalf) {
      const markers = mine.filter((p) => Math.hypot(p.pos.x - o.pos.x, p.pos.z - o.pos.z) < 2.5);
      expect(markers.length).toBe(1);
      expect(markers[0].pos.x).toBeLessThan(o.pos.x);
    }
  });
});
