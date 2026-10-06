import { describe, expect, it } from 'vitest';
import { IDLE_INPUT, MatchSim } from '../game/sim';
import { TutorialCoach } from '../game/tutorial';
import type { InputState } from '../game/input';
import { team } from './helpers';

/** A learner who does what each card asks: run to the star, pass to the team-mate, score, try a trick. */
function learner(sim: MatchSim, coach: TutorialCoach, t: number): InputState {
  const hero = coach.hero, b = sim.ball;
  const towards = (x: number, z: number) => {
    const dx = x - hero.pos.x, dz = z - hero.pos.z, l = Math.hypot(dx, dz) || 1;
    return { moveX: dx / l, moveZ: dz / l };
  };
  if (coach.praise || b.owner !== hero) return IDLE_INPUT;
  switch (coach.step) {
    case 'move': return coach.marker ? { ...IDLE_INPUT, ...towards(coach.marker.x, coach.marker.z) } : IDLE_INPUT;
    case 'pass': { const m = coach.mate!; return { ...IDLE_INPUT, ...towards(m.pos.x, m.pos.z), pass: t % 20 === 0 }; }
    case 'shoot': {
      const gx = sim.goalX(0);
      const close = Math.abs(gx - hero.pos.x) < sim.length * 0.3;
      return { ...IDLE_INPUT, ...towards(gx, 0), shootHeld: close && t % 60 < 40 };
    }
    case 'trick': return { ...IDLE_INPUT, trick: t % 30 === 0 };
    default: return IDLE_INPUT;
  }
}

describe('first-time tutorial', () => {
  it('walks a learner through running, passing, scoring and a trick', () => {
    const sim = new MatchSim({ home: team('h', 'Learners', 'U8'), away: team('a', 'Keepers', 'U8'), difficulty: 'easy', halfSeconds: 600, humanSide: 0, mode: 'tutorial' });
    const coach = new TutorialCoach(sim);
    const seen: string[] = [coach.step];
    for (let t = 0; t < 60 * 180 && coach.step !== 'done'; t++) {
      sim.step(1 / 60, learner(sim, coach, t));
      coach.update(1 / 60, sim.events);
      sim.events.length = 0;
      if (seen[seen.length - 1] !== coach.step) seen.push(coach.step);
    }
    expect(seen).toEqual(['move', 'pass', 'shoot', 'trick', 'done']);
  });

  it('only ever has the learner, one team-mate and a keeper on the pitch, and no clock', () => {
    const sim = new MatchSim({ home: team('h', 'Learners', 'U8'), away: team('a', 'Keepers', 'U8'), difficulty: 'easy', halfSeconds: 600, humanSide: 0, mode: 'tutorial' });
    new TutorialCoach(sim);
    expect(sim.teamOf(0).length).toBe(2);
    expect(sim.teamOf(1).map((p) => p.isKeeper)).toEqual([true]);
    for (let i = 0; i < 60 * 20; i++) { sim.step(1 / 60, IDLE_INPUT); sim.events.length = 0; }
    expect(sim.clock).toBeLessThanOrEqual(1);
    expect(sim.phase).not.toBe('fulltime');
  });
});
