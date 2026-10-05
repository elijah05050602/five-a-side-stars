import * as THREE from 'three';
import { BallModel } from './BallModel';
import { Input, P1_KEYS, P2_KEYS, SOLO_KEYS } from './input';
import { buildPitch, pitchExtras } from './Pitch';
import { Crowd } from './Crowd';
import { Commentator } from './commentary';
import { Weather, resolveConditions, type Conditions, type WeatherChoice } from './Weather';
import { toonMaterial } from './toon';
import { PlayerModel, type AnimState } from './PlayerModel';
import type { Expression } from './playerFace';
import type { Kit } from '../data/types';
import { MatchSim, RUNOFF_END, RUNOFF_SIDE, type PlayerMatchStats, type SimConfig, type SimPlayer, type Side } from './sim';
import { renderHud, type HudRefs } from '../ui/hud';
import { Sfx } from './sfx';
import { getSettings } from '../data/storage';
import { TutorialCoach } from './tutorial';

export type SimMode = NonNullable<SimConfig['mode']>;

export interface SceneOptions {
  /** Weather and time of day; 'random' picks for you. */
  weather?: WeatherChoice;
}

/** One recorded frame of the match, used for the instant replay. */
interface ReplayFrame {
  players: { x: number; z: number; facing: number; speed: number; kick: number; dive: number; diveDir: number; stun: number }[];
  ball: { x: number; y: number; z: number; vx: number; vz: number };
}

export interface MatchResult {
  mode: SimMode;
  score: [number, number];
  goals: MatchSim['goals'];
  home: SimConfig['home'];
  away: SimConfig['away'];
  stats: { touches: [number, number]; distance: [number, number] };
  /** What each starter did, by player id. */
  players: Record<string, PlayerMatchStats>;
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
  private readonly crowd: Crowd;
  private readonly commentator: Commentator;
  readonly conditions: Conditions;
  private readonly weather: Weather;
  private readonly extras: ReturnType<typeof pitchExtras>;
  /** Rolling record of the last few seconds, oldest first. */
  private readonly history: ReplayFrame[] = [];
  private replay: { frames: ReplayFrame[]; t: number; wait: number } | null = null;
  private raf = 0;
  private last = 0;
  private acc = 0;
  private readonly camTarget = new THREE.Vector3();
  private readonly camPos = new THREE.Vector3();
  private readonly camLook = new THREE.Vector3();
  private disposed = false;
  private readonly onResize = () => this.resize();
  /** First-time tutorial coach and its glowing star, when this is the tutorial. */
  private readonly coach: TutorialCoach | null = null;
  private readonly marker = new THREE.Group();

  constructor(canvas: HTMLCanvasElement, uiRoot: HTMLElement, config: SimConfig, private readonly onFinish: (r: MatchResult) => void, private readonly onQuit: () => void, options: SceneOptions = {}) {
    this.sim = new MatchSim(config);
    this.conditions = resolveConditions(options.weather ?? 'random');
    this.commentator = new Commentator(this.conditions);
    this.sfx.setWeather(this.conditions.weather);
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

    const runoff = this.sim.mode === 'match';
    const pitch = buildPitch({ length: this.sim.length, width: this.sim.width, goalWidth: this.sim.goalWidth, goalHeight: this.sim.goalHeight, goalDepth: this.sim.goalDepth, runoffSide: runoff ? RUNOFF_SIDE : 0, runoffEnd: runoff ? RUNOFF_END : 0 });
    this.scene.add(pitch);
    this.extras = pitchExtras(pitch);
    this.weather = new Weather(this.scene, { length: this.sim.length, width: this.sim.width }, this.conditions, touch);
    this.extras.scoreboard.set(this.sim.teams[0].short, this.sim.teams[1].short, 0, 0);

    this.crowd = new Crowd(this.sim, { touch });
    this.crowd.setConditions({ night: this.conditions.time === 'night', weather: this.conditions.weather });
    this.scene.add(this.crowd.group);
    // Dev builds only: lets a test script poke the crowd (window.__crowd.onEvent({ type: 'goal', side: 0 })).
    if (import.meta.env.DEV) (window as unknown as { __crowd: Crowd }).__crowd = this.crowd;

    const ringColours = teamRingColours(this.sim.teams[0].kit, this.sim.teams[1].kit);
    for (const p of this.sim.players) {
      const team = this.sim.teams[p.side];
      const kit = p.isKeeper ? team.keeperKit : team.kit;
      const m = new PlayerModel(p.info, kit, this.sim.stats.scale);
      m.setTeamColour(ringColours[p.side]);
      this.models.set(p, m);
      this.scene.add(m.group);
    }
    this.ball = new BallModel(this.sim.ball.radius);
    this.scene.add(this.ball.group);
    if (this.sim.mode === 'tutorial') {
      this.coach = new TutorialCoach(this.sim);
      const gold = new THREE.MeshBasicMaterial({ color: 0xffd23f, transparent: true, opacity: 0.85, side: THREE.DoubleSide });
      const ring = new THREE.Mesh(new THREE.RingGeometry(0.75, 1.0, 40), gold);
      ring.rotation.x = -Math.PI / 2;
      ring.position.y = 0.02;
      const star = new THREE.Mesh(new THREE.OctahedronGeometry(0.45), toonMaterial({ color: 0xffd23f }));
      star.position.y = 2.1;
      star.name = 'star';
      this.marker.add(ring, star);
      this.marker.visible = false;
      this.scene.add(this.marker);
    }

    this.hud = renderHud(uiRoot, this.sim, {
      onPause: () => this.sim.togglePause(),
      onResume: () => this.sim.togglePause(),
      onQuit: () => { this.dispose(); this.onQuit(); },
      onFinish: () => { const r = this.result(); this.dispose(); this.onFinish(r); },
    }, this.coach ?? undefined);
    this.input.attachJoystick(this.hud.joystickZone, this.hud.joystickKnob);
    this.input.attachButton(this.hud.btnShoot, 'shoot');
    this.input.attachButton(this.hud.btnPass, 'pass');
    this.input.attachButton(this.hud.btnSprint, 'sprint');
    this.input.attachButton(this.hud.btnSwitch, 'switch');
    this.input.attachButton(this.hud.btnTrick, 'trick');

    window.addEventListener('resize', this.onResize);
    this.resize();
    this.camTarget.set(0, 0, 0);
    this.camPos.copy(this.cameraGoal(this.camTarget));
    this.camera.position.copy(this.camPos);
    this.camLook.set(0, 0.5, 0);
    this.last = performance.now();
    this.sfx.start(this.conditions.weather);
    this.raf = requestAnimationFrame(this.frame);
  }

  /** Snapshot the sim for the replay buffer (about three seconds kept). */
  private record(): void {
    const b = this.sim.ball;
    this.history.push({
      players: this.sim.players.map((p) => ({ x: p.pos.x, z: p.pos.z, facing: p.facing, speed: Math.hypot(p.vel.x, p.vel.z), kick: p.kickAnim, dive: p.diveAnim, diveDir: p.diveDir, stun: p.stunAnim })),
      ball: { x: b.pos.x, y: b.y, z: b.pos.z, vx: b.vel.x, vz: b.vel.z },
    });
    if (this.history.length > 170) this.history.shift();
  }

  /** Play the last two and a half seconds back slowly. Returns true while the replay has the screen. */
  private runReplay(dt: number, scale: number): boolean {
    const r = this.replay;
    if (!r) return false;
    if (r.wait > 0) { r.wait -= dt; return false; }
    const speed = 0.6;
    if (r.t === 0) this.hud.setReplay(true);
    r.t += dt * speed;
    const idx = Math.min(r.frames.length - 1, Math.floor(r.t * 60));
    const f = r.frames[idx];
    this.sim.players.forEach((p, i) => {
      const m = this.models.get(p)!, fp = f.players[i];
      m.group.position.set(fp.x, 0, fp.z);
      m.setFacing(fp.facing);
      m.animate(dt * speed, { speed: fp.speed, kick: fp.kick, dive: fp.dive, diveDir: fp.diveDir, stun: fp.stun, tackle: 0, scale, wobble: 0, mood: 'focus', gazeX: 0, gazeY: 0, cheer: false });
      m.setSelected(false, 0xffffff);
    });
    this.ball.update(f.ball.x, f.ball.y, f.ball.z, this.sim.ball.radius, f.ball.vx, f.ball.vz, dt * speed);
    this.camTarget.lerp(new THREE.Vector3(THREE.MathUtils.clamp(f.ball.x, -this.sim.length * 0.4, this.sim.length * 0.4), 0, THREE.MathUtils.clamp(f.ball.z, -this.sim.width * 0.25, this.sim.width * 0.25)), 1 - Math.pow(0.02, dt));
    if (idx >= r.frames.length - 1) { this.replay = null; this.hud.setReplay(false); }
    return true;
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
      players: this.sim.playerStats(),
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
    // Fixed 60 Hz simulation steps for stable physics. The sim waits while a replay plays.
    const replaying = !!this.replay && this.replay.wait <= 0;
    this.acc += dt;
    const step = 1 / 60;
    let steps = 0;
    while (!replaying && this.acc >= step && steps < 8) {
      const once = { shoot: false, pass: false, switchPlayer: false, pause: false, trick: false };
      this.sim.step(step, steps === 0 ? input : { ...input, ...once }, input2 ? (steps === 0 ? input2 : { ...input2, ...once }) : undefined);
      if (this.sim.phase === 'play' || this.sim.phase === 'setpiece' || this.sim.phase === 'kickoff') this.record();
      this.acc -= step;
      steps++;
    }
    if (replaying) this.acc = 0;
    for (const ev of this.sim.events) {
      this.sfx.play(ev);
      this.crowd.onEvent(ev);
      if (ev.type === 'goal') {
        this.extras.scoreboard.set(this.sim.teams[0].short, this.sim.teams[1].short, this.sim.score[0], this.sim.score[1]);
        this.extras.nets[ev.side === 0 ? 1 : 0]?.hit(this.sim.ball.pos.z, Math.hypot(this.sim.ball.vel.x, this.sim.ball.vel.z));
        if (this.sim.mode !== 'training' && !getSettings().reduceMotion && this.history.length > 30) this.replay = { frames: this.history.slice(-125), t: 0, wait: 1.1 };
      }
    }
    if (this.coach) {
      this.coach.update(dt, this.sim.events);
      const m = this.coach.marker;
      this.marker.visible = m !== null;
      if (m) {
        this.marker.position.set(m.x, 0, m.z);
        const star = this.marker.getObjectByName('star')!;
        star.rotation.y = now / 400;
        star.position.y = 2.1 + Math.sin(now / 250) * 0.15;
      }
    }
    const lines = this.commentator.onEvents(this.sim, this.sim.events);
    this.hud.update(this.sim, this.sim.events, lines);
    this.sim.events.length = 0;
    const quip = this.commentator.onFrame(this.sim, replaying ? 0 : dt);
    if (quip) this.hud.say(quip);
    this.sfx.update(dt, this.sim);
    this.weather.update(dt);
    this.crowd.update(dt);
    for (const n of this.extras.nets) n.update(dt);

    // Sync models
    const b = this.sim.ball;
    const scale = this.sim.stats.scale;
    if (this.runReplay(dt, scale)) {
      const goal = this.cameraGoal(this.camTarget);
      this.camPos.lerp(goal, 1 - Math.pow(0.02, dt));
      this.camera.position.copy(this.camPos);
      this.camera.lookAt(this.camTarget.x, 0.5, this.camTarget.z);
      this.renderer.render(this.scene, this.camera);
      return;
    }
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
      const st: AnimState = { speed, kick: p.kickAnim, dive: p.diveAnim, diveDir: p.diveDir, stun: p.stunAnim, tackle: p.tackleTimer, scale, wobble, mood, gazeX, gazeY, cheer: celebrating === p.side, stepover: p.trickKind === 'stepover' ? p.trickAnim : 0, stepoverDir: p.trickDir };
      m.animate(dt, st);
      const isP1 = p === this.sim.controlled;
      const isP2 = p === this.sim.controlled2;
      m.setSelected(isP1 || isP2 || (this.sim.ball.owner === p && this.sim.config.humanSide === null), isP1 ? 0xff8a00 : isP2 ? 0x00e5ff : 0xffffff);
    }
    this.ball.update(b.pos.x, b.y, b.pos.z, b.radius, b.vel.x, b.vel.z, dt);

    // Camera follows a blend of the ball and the controlled player, clamped to the pitch.
    const c1 = this.sim.controlled, c2 = this.sim.controlled2;
    const focus = c1 && this.sim.phase !== 'goal'
      ? (c2
        ? new THREE.Vector3(b.pos.x * 0.6 + c1.pos.x * 0.2 + c2.pos.x * 0.2, 0, b.pos.z * 0.6 + c1.pos.z * 0.2 + c2.pos.z * 0.2)
        : new THREE.Vector3(b.pos.x * 0.65 + c1.pos.x * 0.35, 0, b.pos.z * 0.65 + c1.pos.z * 0.35))
      : new THREE.Vector3(b.pos.x, 0, b.pos.z);
    // Set pieces happen out by the lines, so let the camera follow further out for them.
    const wide = this.sim.phase === 'setpiece' ? 1.25 : 1;
    focus.x = THREE.MathUtils.clamp(focus.x, -this.sim.length * 0.32 * wide, this.sim.length * 0.32 * wide);
    focus.z = THREE.MathUtils.clamp(focus.z, -this.sim.width * 0.2 * wide * wide, this.sim.width * 0.2 * wide * wide);
    this.camTarget.lerp(focus, 1 - Math.pow(0.02, dt));
    // After a goal in a match (and after the replay, which plays from 1.1s), swing round to the
    // scoring team's fans going wild, then back for kick-off.
    const scorer = this.sim.goals[this.sim.goals.length - 1];
    const crowdShot = this.sim.mode === 'match' && this.sim.phase === 'goal' && this.sim.phaseTimer > 1.2 && scorer
      ? this.crowd.celebrationShot(scorer.side) : null;
    const k = 1 - Math.pow(crowdShot ? 0.01 : 0.02, dt);
    this.camPos.lerp(crowdShot ? crowdShot.pos : this.cameraGoal(this.camTarget), k);
    this.camLook.lerp(crowdShot ? crowdShot.look : new THREE.Vector3(this.camTarget.x, 0.5, this.camTarget.z), k);
    this.camera.position.copy(this.camPos);
    this.camera.lookAt(this.camLook);

    this.renderer.render(this.scene, this.camera);
  };

  dispose(): void {
    if (this.disposed) return;
    this.disposed = true;
    cancelAnimationFrame(this.raf);
    window.removeEventListener('resize', this.onResize);
    this.input.dispose();
    this.input2?.dispose();
    this.sfx.dispose();
    this.weather.dispose();
    this.hud.destroy();
    this.models.forEach((m) => m.dispose());
    this.crowd.dispose();
    this.renderer.dispose();
    this.renderer.clear();
  }
}

export type { Side };

/**
 * One identifying colour per team for the rings under the feet: the shirt colour, unless the two
 * shirts are too alike, in which case the away side falls back to its shorts or second colour.
 */
function teamRingColours(home: Kit, away: Kit): [THREE.Color, THREE.Color] {
  const far = (a: THREE.Color, b: THREE.Color) => Math.hypot(a.r - b.r, a.g - b.g, a.b - b.b) > 0.45;
  const h = new THREE.Color(home.shirt);
  const candidates = [away.shirt, away.shorts, away.shirt2, '#ffffff', '#1b2a41'].map((c) => new THREE.Color(c));
  const a = candidates.find((c) => far(c, h)) ?? candidates[0];
  return [h, a];
}
