import type { MatchSim, SimEvent, SimPlayer, V2 } from './sim';

export type TutorialStep = 'move' | 'pass' | 'shoot' | 'trick' | 'done';
export const TUTORIAL_STEPS: Exclude<TutorialStep, 'done'>[] = ['move', 'pass', 'shoot', 'trick'];

const PRAISE: Record<Exclude<TutorialStep, 'done'>, string> = {
  move: 'Nice running!',
  pass: 'Great pass!',
  shoot: 'GOAL! What a strike!',
  trick: 'Silky skills!',
};

/**
 * The first-time kick-about: you, one team-mate and a keeper who lets most shots
 * in. Each step waits for the learner to do the thing (run to the star, pass,
 * score, try a trick) and fetches the ball back whenever it runs away.
 */
export class TutorialCoach {
  step: TutorialStep = 'move';
  /** Where the glowing star sits (null = no star this step). */
  marker: V2 | null = null;
  /** A short cheer shown after a step is done, before the next one starts. */
  praise = '';
  private praiseTimer = 0;
  private looseTimer = 0;
  private keeperTimer = 0;

  constructor(private readonly sim: MatchSim) {
    const L = sim.length, W = sim.width;
    const hero = this.hero;
    hero.pos = { x: -L * 0.3, z: 0 };
    hero.facing = 0;
    const mate = this.mate;
    if (mate) { mate.home = { x: -L * 0.12, z: -W * 0.32 }; mate.pos = { ...mate.home }; }
    this.giveBall();
    this.marker = { x: -L * 0.04, z: W * 0.06 };
  }

  get hero(): SimPlayer { return this.sim.tutorialHero!; }
  get mate(): SimPlayer | undefined { return this.sim.teamOf(0).find((p) => p !== this.hero && !p.isKeeper); }
  /** 0-based index of the current step, for the progress dots. */
  get index(): number { return this.step === 'done' ? TUTORIAL_STEPS.length : TUTORIAL_STEPS.indexOf(this.step); }

  /** Call once a frame after the sim has stepped, with that frame's events. */
  update(dt: number, events: SimEvent[]): void {
    const sim = this.sim;
    if (this.step === 'done' || sim.phase === 'paused') return;
    if (this.praiseTimer > 0) {
      this.praiseTimer -= dt;
      if (this.praiseTimer <= 0) this.next();
      else if (sim.phase === 'goal' && this.praiseTimer < 0.4) this.giveBall();
      return;
    }
    const hero = this.hero, b = sim.ball;
    switch (this.step) {
      case 'move':
        if (this.marker && Math.hypot(hero.pos.x - this.marker.x, hero.pos.z - this.marker.z) < 1.1) this.done();
        break;
      case 'pass':
        if (b.owner && b.owner === this.mate && b.lastKick === hero) this.done();
        break;
      case 'shoot':
        if (events.some((e) => e.type === 'goal' && e.side === 0)) this.done();
        break;
      case 'trick':
        if (events.some((e) => e.type === 'trick' && e.player === hero.info)) this.done();
        break;
    }
    if (this.praiseTimer > 0) return;
    // Fetch the ball back if it gets away: the keeper has it, it stopped out of reach, or a goal came at the wrong time.
    const keeperHas = b.owner?.isKeeper ?? false;
    this.keeperTimer = keeperHas ? this.keeperTimer + dt : 0;
    const loose = b.owner === null && Math.hypot(b.vel.x, b.vel.z) < 1;
    this.looseTimer = loose ? this.looseTimer + dt : 0;
    if (this.keeperTimer > 0.7 || this.looseTimer > 1.5 || (sim.phase === 'goal' && sim.phaseTimer > 1.2)) this.giveBall();
  }

  /** Skip straight to the end (used by tests). */
  finish(): void { this.step = 'done'; this.marker = null; }

  private done(): void {
    if (this.step === 'done') return;
    this.praise = PRAISE[this.step];
    this.praiseTimer = this.step === 'shoot' ? 1.8 : 1.2;
    this.marker = null;
  }

  private next(): void {
    const i = TUTORIAL_STEPS.indexOf(this.step as Exclude<TutorialStep, 'done'>);
    this.praise = '';
    const upcoming: TutorialStep = i + 1 < TUTORIAL_STEPS.length ? TUTORIAL_STEPS[i + 1] : 'done';
    this.step = upcoming;
    const sim = this.sim, L = sim.length, W = sim.width, hero = this.hero;
    if (this.step === 'pass') {
      // The team-mate jogs to a spot ahead and to the side; the star shows where.
      const mate = this.mate;
      if (mate) {
        const side = hero.pos.z > 0 ? -1 : 1;
        mate.home = { x: Math.min(hero.pos.x + L * 0.2, L * 0.25), z: side * W * 0.18 };
        this.marker = { ...mate.home };
      }
    } else if (this.step === 'shoot' || this.step === 'trick') {
      const mate = this.mate;
      if (mate) mate.home = { x: -L * 0.1, z: -W * 0.35 };
    }
    if (this.step === 'done') return;
    if (this.sim.ball.owner !== hero && this.step !== 'shoot') this.giveBall();
    if (this.step === 'shoot' && this.sim.ball.owner !== this.mate) this.giveBall();
  }

  /** Put the ball at the learner's feet and carry on. */
  private giveBall(): void {
    const sim = this.sim, hero = this.hero, b = sim.ball;
    if (sim.phase === 'goal') {
      // Back out of the net: start again from the edge of the area.
      hero.pos = { x: sim.length * 0.12, z: 0 };
      hero.vel = { x: 0, z: 0 };
      hero.facing = 0;
    }
    b.owner = hero;
    b.pos = { x: hero.pos.x + Math.cos(hero.facing) * 0.4, z: hero.pos.z + Math.sin(hero.facing) * 0.4 };
    b.vel = { x: 0, z: 0 }; b.vy = 0; b.y = 0;
    b.lastTouch = hero;
    hero.kickCooldown = 0;
    sim.phase = 'play';
    this.looseTimer = 0;
    this.keeperTimer = 0;
  }
}
