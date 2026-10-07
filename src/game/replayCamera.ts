/**
 * Where the goal replay's camera stands for its slow-motion part: up behind the net the ball went into,
 * looking back out at the shot coming in, the way TV shows a goal again. No Three.js, so it can be tested.
 */
export interface GoalCamShot {
  pos: { x: number; y: number; z: number };
  look: { x: number; y: number; z: number };
  /** Vertical field of view in degrees. */
  fov: number;
}

export interface GoalCamPitch { length: number; goalHeight: number; goalDepth: number; runoffEnd: number }

/**
 * `goalSign` is +1 for the goal at +x and -1 for the one at -x. `ball` is where the ball is in the replay
 * now and `push` runs 0..1 through the slow motion, so the shot slowly pushes in as the ball arrives.
 */
export function goalCamShot(pitch: GoalCamPitch, goalSign: 1 | -1, ball: { x: number; y: number; z: number }, aspect: number, push: number): GoalCamShot {
  const line = goalSign * pitch.length / 2;
  // Just behind the back of the net, high enough that the crossbar stays below the picture.
  const back = Math.min(pitch.goalDepth + 0.35, pitch.runoffEnd + 0.6);
  const ballZ = Math.max(-3, Math.min(3, ball.z));
  const pos = { x: line + goalSign * back, y: pitch.goalHeight + 1.6, z: ballZ * 0.25 + 0.5 };
  // Look between the goalmouth and the ball, so both the shot and the net are in the picture.
  const look = { x: ball.x * 0.7 + line * 0.3, y: Math.max(0.4, ball.y * 0.5), z: ballZ * 0.7 };
  // An upright screen is narrow, so it needs a wider lens to see the shot come in.
  const base = aspect < 0.9 ? 62 : 46;
  const p = Math.max(0, Math.min(1, push));
  return { pos, look, fov: base * (1 - 0.2 * p * p) };
}
