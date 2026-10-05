import * as THREE from 'three';
import { BallModel } from './BallModel';
import { Input } from './input';
import { buildPitch } from './Pitch';
import { PlayerModel } from './PlayerModel';
import { MatchSim, type SimConfig, type SimPlayer, type Side } from './sim';
import { renderHud, type HudRefs } from '../ui/hud';
import { Sfx } from './sfx';

export interface MatchResult {
  score: [number, number];
  goals: MatchSim['goals'];
  home: SimConfig['home'];
  away: SimConfig['away'];
  stats: { touches: [number, number]; distance: [number, number] };
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
  private readonly input = new Input();
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
    this.renderer = new THREE.WebGLRenderer({ canvas, antialias: true, powerPreference: 'high-performance' });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.scene.background = new THREE.Color('#9ad8ff');
    this.scene.fog = new THREE.Fog('#9ad8ff', 60, 120);
    this.camera = new THREE.PerspectiveCamera(42, 1, 0.1, 200);

    const sun = new THREE.DirectionalLight(0xffffff, 2.2);
    sun.position.set(-12, 30, 18);
    sun.castShadow = true;
    sun.shadow.mapSize.set(2048, 2048);
    const sc = sun.shadow.camera;
    sc.left = -this.sim.length / 2 - 6; sc.right = this.sim.length / 2 + 6;
    sc.top = this.sim.width / 2 + 6; sc.bottom = -this.sim.width / 2 - 6;
    sc.near = 1; sc.far = 80;
    sun.shadow.bias = -0.0005;
    this.scene.add(sun, new THREE.HemisphereLight(0xcfe9ff, 0x3b7f4e, 1.1));

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
    return { score: [...this.sim.score] as [number, number], goals: this.sim.goals, home: this.sim.config.home, away: this.sim.config.away, stats: { touches, distance } };
  }

  /** Camera sits above and "south" of the focus point, looking down at a tilt. */
  private cameraGoal(target: THREE.Vector3): THREE.Vector3 {
    const aspect = this.camera.aspect;
    const height = (this.sim.width * 1.05) / Math.min(1.9, Math.max(1.0, aspect)) + 6;
    return new THREE.Vector3(target.x, height, target.z + height * 0.55);
  }

  private frame = (now: number): void => {
    if (this.disposed) return;
    this.raf = requestAnimationFrame(this.frame);
    const dt = Math.min(0.1, (now - this.last) / 1000);
    this.last = now;
    const input = this.input.poll();
    if (input.pause) this.sim.togglePause();
    // Fixed 60 Hz simulation steps for stable physics.
    this.acc += dt;
    const step = 1 / 60;
    let steps = 0;
    while (this.acc >= step && steps < 5) {
      this.sim.step(step, steps === 0 ? input : { ...input, shoot: false, pass: false, switchPlayer: false, pause: false });
      this.acc -= step;
      steps++;
    }
    for (const ev of this.sim.events) this.sfx.play(ev.type);
    this.hud.update(this.sim, this.sim.events);
    this.sim.events.length = 0;

    // Sync models
    const scale = this.sim.stats.scale;
    for (const p of this.sim.players) {
      const m = this.models.get(p)!;
      m.group.position.set(p.pos.x, 0, p.pos.z);
      m.setFacing(p.facing);
      m.animate(Math.hypot(p.vel.x, p.vel.z), p.kickAnim, p.diveAnim, p.diveDir, dt, scale);
      const isControlled = p === this.sim.controlled;
      m.setSelected(isControlled || (this.sim.ball.owner === p && this.sim.config.humanSide === null), isControlled ? 0xffd23f : 0xffffff);
    }
    const b = this.sim.ball;
    this.ball.update(b.pos.x, b.y, b.pos.z, b.radius, b.vel.x, b.vel.z, dt);

    // Camera follows a blend of the ball and the controlled player, clamped to the pitch.
    const focus = this.sim.controlled && this.sim.phase !== 'goal'
      ? new THREE.Vector3((b.pos.x * 0.65 + this.sim.controlled.pos.x * 0.35), 0, (b.pos.z * 0.65 + this.sim.controlled.pos.z * 0.35))
      : new THREE.Vector3(b.pos.x, 0, b.pos.z);
    focus.x = THREE.MathUtils.clamp(focus.x, -this.sim.length * 0.28, this.sim.length * 0.28);
    focus.z = THREE.MathUtils.clamp(focus.z, -this.sim.width * 0.15, this.sim.width * 0.15);
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
    this.hud.destroy();
    this.models.forEach((m) => m.dispose());
    this.renderer.dispose();
    this.renderer.clear();
  }
}

export type { Side };
