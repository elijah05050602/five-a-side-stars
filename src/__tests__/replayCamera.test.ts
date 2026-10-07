import { describe, expect, it } from 'vitest';
import { goalCamShot } from '../game/replayCamera';

const pitch = { length: 40, goalHeight: 1.6, goalDepth: 1.2, runoffEnd: 1.6 };

describe('the goal replay close-up', () => {
  it('stands behind the net the ball went into, above the bar, looking back out at the pitch', () => {
    for (const sign of [1, -1] as const) {
      const ball = { x: sign * 15, y: 0.4, z: 1 };
      const shot = goalCamShot(pitch, sign, ball, 1.7, 0);
      expect(shot.pos.x * sign).toBeGreaterThan(pitch.length / 2 + pitch.goalDepth);
      expect(shot.pos.y).toBeGreaterThan(pitch.goalHeight);
      // Looking back towards the pitch, not out into the stand.
      expect((shot.look.x - shot.pos.x) * sign).toBeLessThan(0);
    }
  });

  it('pushes in as the ball arrives, and uses a wider lens on an upright phone', () => {
    const ball = { x: 18, y: 0.3, z: 0 };
    const start = goalCamShot(pitch, 1, ball, 1.7, 0), end = goalCamShot(pitch, 1, ball, 1.7, 1);
    expect(end.fov).toBeLessThan(start.fov);
    expect(goalCamShot(pitch, 1, ball, 0.5, 0).fov).toBeGreaterThan(start.fov);
  });
});
