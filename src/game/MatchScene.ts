import * as THREE from 'three';
import { BallModel } from './BallModel';
import { Input, P1_KEYS, P2_KEYS, SOLO_KEYS } from './input';
import { buildPitch } from './Pitch';
import { PlayerModel, type AnimState } from './PlayerModel';
import type { Expression } from './playerFace';
import { MatchSim, type SimConfig, type SimPlayer, type Side } from './sim';
import { renderHud, type HudRefs } from '../ui/hud';
import { Sfx } from './sfx';
import { getSettings } from '../data/storage';

export type SimMode = NonNullable<SimConfig['mode']>;

export interface MatchResult {
  mode: SimMode;
  score: [number, number];
  goals: MatchSim['goals'];
  home: SimConfig['home'];
  away: SimConfig['away'];
  stats: { touches: [number, number]; distance: [number, number] };
  /** Penalty-by-penalty record in a shoot-out (true = scored). */
  shootout: [boolean[], boolean[]] | null;
  trainingPoints: number;
  twoPlayer: boolean;
  /** Set by the tournament flow when a drawn match was won on penalties. */
  shootoutWon?: boolean;
}

/**
 * Owns the Three.js scene for one match: builds the pitch and players from the
 * sim, runs the fixed-step loop, follows the action with the camera and drives
 * the HUD. Call dispose() when leaving the match.
 */
export class MatchScene {
  readonly sim: MatchSim;
  private readonly renderer: THREE.WebGLRenderer;
  private readonly scene = new THREE.Scene();
  private readonly camera: THREE.PerspectiveCamera;
  private readonly models = new Map<SimPlayer, PlayerModel>();
  private readonly ball: BallModel;
  private readonly input: Input;
  private readonly input2: Input | null;
  private readonly hud: HudRefs;
  private readonly sfx = new Sfx();
  private raf = 0;
  private last = 0;
  private acc = 0;
  private readonly camTarget = new THREE.Vector3();
  private readonly camPos = new THREE.Vector3();
  private disposed = false;
  private readonly onResize = () => this.resize();

  constructor(canvas: HTMLCanvasElement, uiRoot: HTMLElement, config: SimConfig, private readonly onFinish: (r: MatchResult) => void, private readonly onQuit: () => void) {
    this.sim = new MatchSim(config);
    const twoPlayer = config.humanSide2 != null;
    this.input = new Input(twoPlayer ? P1_KEYS : SOLO_KEYS);
    this.input2 = twoPlayer ? new Input(P2_KEYS) : null;
    this.renderer = new THREE.WebGLRenderer({ canvas, antialias: true, powerPreference: 'high-performance' });
    // Tablets and phones get a lower pixel ratio and a smaller shadow map so the game stays smooth.
    const touch = window.matchMedia('(pointer: coarse)').matches;
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, touch ? 1.5 : 2));
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFShadowMap;
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.15;
    this.scene.background = new THREE.Color('#8fd3ff');
    this.scene.fog = new THREE.Fog('#8fd3ff', 70, 130);
    this.camera = new THREE.PerspectiveCamera(42, 1, 0.1, 200);

    const sun = new THREE.DirectionalLight(0xffffff, 2.2);
    sun.position.set(-12, 30, 18);
    sun.castShadow = true;
    sun.shadow.mapSize.set(touch ? 1024 : 2048, touch ? 1024 : 2048);
    const sc = sun.shadow.camera;
    sc.left = -this.sim.length / 2 - 6; sc.right = this.sim.length / 2 + 6;
    sc.top = this.sim.width / 2 + 6; sc.bottom = -this.sim.width / 2 - 6;
    sc.near = 1; sc.far = 80;
    sun.shadow.bias = -0.0005;
    // A cool rim light from behind the camera's far side lifts faces and shirt numbers off the grass.
    const rim = new THREE.DirectionalLight(0xbfe3ff, 0.9);
    rim.position.set(14, 10, -18);
    this.scene.add(sun, rim, new THREE.HemisphereLight(0xdff3ff, 0x3b7f4e, 1.25));

    this.scene.add(buildPitch({ length: this.sim.length, width: this.sim.width, goalWidth: this.sim.goalWidth, goalHeight: this.sim.goalHeight, goalDepth: this.sim.goalDepth }));

    for (const p of this.sim.players) {
      const team = this.sim.teams[p.side];
      const kit = p.isKeeper ? team.keeperKit : team.kit;
      const m = new PlayerModel(p.info, kit, this.sim.stats.scale);
      this.models.set(p, m);
      this.scene.add(m.group);
    }
    this.ball = new BallModel(this.sim.ball.radius);
    this.scene.add(this.ball.group);

    this.hud = renderHud(uiRoot, this.sim, {
      onPause: () => this.sim.togglePause(),
      onResume: () => this.sim.togglePause(),
      onQuit: () => { this.dispose(); this.onQuit(); },
      onFinish: () => { const r = this.result(); this.dispose(); this.onFinish(r); },
    });
    this.input.attachJoystick(this.hud.joystickZone, this.hud.joystickKnob);
    this.input.attachButton(this.hud.btnShoot, 'shoot');
    this.input.attachButton(this.hud.btnPass, 'pass');
    this.input.attachButton(this.hud.btnSprint, 'sprint');
    this.input.attachButton(this.hud.btnSwitch, 'switch');

    window.addEventListener('resize', this.onResize);
    this.resize();
    this.camTarget.set(0, 0, 0);
    this.camPos.copy(this.cameraGoal(this.camTarget));
    this.camera.position.copy(this.camPos);
    this.last = performance.now();
    this.raf = requestAnimationFrame(this.frame);
  }

  private resize(): void {
    const w = window.innerWidth, h = window.innerHeight;
    this.renderer.setSize(w, h, false);
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();
  }

  private result(): MatchResult {
    const touches: [number, number] = [0, 0];
    const distance: [number, number] = [0, 0];
    for (const p of this.sim.players) distance[p.side] += p.distanceRun;
    return {
      mode: this.sim.mode,
      score: [...this.sim.score] as [number, number],
      goals: this.sim.goals,
      home: this.sim.config.home,
      away: this.sim.config.away,
      stats: { touches, distance },
      shootout: this.sim.shootout ? [[...this.sim.shootout.results[0]], [...this.sim.shootout.results[1]]] : null,
      trainingPoints: this.sim.trainingPoints,
      twoPlayer: this.sim.config.humanSide2 != null,
    };
  }

  /** Camera sits above and "south" of the focus point, looking down at a tilt. */
  private cameraGoal(target: THREE.Vector3): THREE.Vector3 {
    const aspect = this.camera.aspect;
    // A little more tilt than straight down, so faces, kits and the stand show.
    const height = (this.sim.width * 0.84) / Math.min(1.9, Math.max(1.0, aspect)) + 4.2;
    return new THREE.Vector3(target.x, height, target.z + height * 0.9);
  }

  private frame = (now: number): void => {
    if (this.disposed) return;
    this.raf = requestAnimationFrame(this.frame);
    const dt = Math.min(0.1, (now - this.last) / 1000);
    this.last = now;
    const input = this.input.poll();
    const input2 = this.input2?.poll();
    if (input.pause || input2?.pause) this.sim.togglePause();
    // Fixed 60 Hz simulation steps for stable physics.
    this.acc += dt;
    const step = 1 / 60;
    let steps = 0;
    while (this.acc >= step && steps < 8) {
      const once = { shoot: false, pass: false, switchPlayer: false, pause: false };
      this.sim.step(step, steps === 0 ? input : { ...input, ...once }, input2 ? (steps === 0 ? input2 : { ...input2, ...once }) : undefined);
      this.acc -= step;
      steps++;
    }
    for (const ev of this.sim.events) this.sfx.play(ev.type);
    this.hud.update(this.sim, this.sim.events);
    this.sim.events.length = 0;

    // Sync models
    const b = this.sim.ball;
    const scale = this.sim.stats.scale;
    const wobble = getSettings().reduceMotion ? 0 : Math.max(0, 0.75 - this.sim.stats.control) * 2;
    const lastGoal = this.sim.goals[this.sim.goals.length - 1];
    const celebrating = this.sim.phase === 'goal' && lastGoal ? lastGoal.side : -1;
    const sprintSpeed = this.sim.stats.speed * 1.05;
    for (const p of this.sim.players) {
      const m = this.models.get(p)!;
      m.group.position.set(p.pos.x, 0, p.pos.z);
      m.setFacing(p.facing);
      const speed = Math.hypot(p.vel.x, p.vel.z);
      // The face follows the moment: joy or gloom after a goal, a wince when knocked, focus on the ball.
      let mood: Expression = 'neutral';
      if (celebrating >= 0) mood = celebrating === p.side ? 'happy' : 'sad';
      else if (p.stunAnim > 0 || p.diveAnim > 0) mood = 'ouch';
      else if (b.owner === p || speed > sprintSpeed) mood = 'focus';
      // Eyes look at the ball: quantised so the face texture rarely needs repainting.
      const ang = Math.atan2(b.pos.z - p.pos.z, b.pos.x - p.pos.x) - p.facing;
      const ahead = Math.cos(ang) > -0.2;
      const gazeX = ahead ? Math.round(Math.sin(ang) * 2) / 2 : 0;
      const gazeY = ahead && Math.hypot(b.pos.x - p.pos.x, b.pos.z - p.pos.z) < 2.5 * scale ? 0.5 : 0;
      const st: AnimState = { speed, kick: p.kickAnim, dive: p.diveAnim, diveDir: p.diveDir, stun: p.stunAnim, tackle: p.tackleTimer, scale, wobble, mood, gazeX, gazeY, cheer: celebrating === p.side };
      m.animate(dt, st);
      const isP1 = p === this.sim.controlled;
      const isP2 = p === this.sim.controlled2;
      m.setSelected(isP1 || isP2 || (this.sim.ball.owner === p && this.sim.config.humanSide === null), isP1 ? 0xffd23f : isP2 ? 0x00e5ff : 0xffffff);
    }
    this.ball.update(b.pos.x, b.y, b.pos.z, b.radius, b.vel.x, b.vel.z, dt);

    // Camera follows a blend of the ball and the controlled player, clamped to the pitch.
    const c1 = this.sim.controlled, c2 = this.sim.controlled2;
    const focus = c1 && this.sim.phase !== 'goal'
      ? (c2
        ? new THREE.Vector3(b.pos.x * 0.6 + c1.pos.x * 0.2 + c2.pos.x * 0.2, 0, b.pos.z * 0.6 + c1.pos.z * 0.2 + c2.pos.z * 0.2)
        : new THREE.Vector3(b.pos.x * 0.65 + c1.pos.x * 0.35, 0, b.pos.z * 0.65 + c1.pos.z * 0.35))
      : new THREE.Vector3(b.pos.x, 0, b.pos.z);
    focus.x = THREE.MathUtils.clamp(focus.x, -this.sim.length * 0.32, this.sim.length * 0.32);
    focus.z = THREE.MathUtils.clamp(focus.z, -this.sim.width * 0.2, this.sim.width * 0.2);
    this.camTarget.lerp(focus, 1 - Math.pow(0.02, dt));
    const goal = this.cameraGoal(this.camTarget);
    this.camPos.lerp(goal, 1 - Math.pow(0.02, dt));
    this.camera.position.copy(this.camPos);
    this.camera.lookAt(this.camTarget.x, 0.5, this.camTarget.z);

    this.renderer.render(this.scene, this.camera);
  };

  dispose(): void {
    if (this.disposed) return;
    this.disposed = true;
    cancelAnimationFrame(this.raf);
    window.removeEventListener('resize', this.onResize);
    this.input.dispose();
    this.input2?.dispose();
    this.hud.destroy();
    this.models.forEach((m) => m.dispose());
    this.renderer.dispose();
    this.renderer.clear();
  }
}

export type { Side };
