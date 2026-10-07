import * as THREE from 'three';
import { BallModel } from './BallModel';
import { Input, PressLatch, type InputState } from './input';
import { CAMERA_HEIGHT_SCALE, getControls } from '../data/controls';
import { buildPitch, pitchExtras } from './Pitch';
import { Crowd } from './Crowd';
import { Commentator } from './commentary';
import { Weather, resolveConditions, type Conditions, type WeatherChoice } from './Weather';
import { toonMaterial } from './toon';
import { PlayerModel, type AnimState } from './PlayerModel';
import { clearPlayerAtlasCache } from './playerAtlas';
import { clearFaceCache, type Expression } from './playerFace';
import { CROWD_SHOT_AT, DIVE_RECOVER, MatchSim, RUNOFF_END, RUNOFF_SIDE, type PlayerMatchStats, type SimConfig, type SimPlayer, type Side, type SimEvent } from './sim';
import { renderHud, type HudRefs } from '../ui/hud';
import { Sfx } from './sfx';
import { Commentary } from './voice';
import { music } from './music';
import { getSettings } from '../data/storage';
import { TutorialCoach } from './tutorial';
import { batchStatic } from './batchStatic';
import { graphicsProfile, type GraphicsProfile } from './graphics';
import { EXPOSURE, TONE_MAPPING, disposeObject } from './renderer';
import { BallTrail, Puffs, SuperAura } from './effects';
import { SUPERS, type SuperKind } from './supers';
import { P1_RING, P2_RING, teamRingColours } from './ringColours';

/** Whether the touch buttons are showing (the same test the CSS uses). */
const TOUCH_SCREEN = typeof matchMedia === 'function' && matchMedia('(pointer: coarse)').matches;

export type SimMode = NonNullable<SimConfig['mode']>;

export interface SceneOptions {
  /** Weather and time of day; 'random' picks for you. */
  weather?: WeatherChoice;
  /** A career match: the id of the player's Star, who wears a gold star over their head. */
  starId?: string;
}

/**
 * Instant replays show this many frames (60 a second) of play before a goal and this many after it, so the ball
 * is seen hitting the net. The last REPLAY_SLOW frames before the goal, and the goal, play in slow motion; the
 * build-up before them at normal speed.
 */
const REPLAY_BEFORE = 210;
const REPLAY_AFTER = 45;
const REPLAY_SLOW = 90;

/** One recorded frame of the match, used for the instant replay. */
interface ReplayFrame {
  players: { x: number; z: number; facing: number; speed: number; kick: number; dive: number; diveDir: number; stun: number; recover: number }[];
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
}

/**
 * Owns the Three.js scene for one match: builds the pitch and players from the
 * sim, runs the fixed-step loop, follows the action with the camera and drives
 * the HUD. Call dispose() when leaving the match. The renderer is borrowed (one
 * for the app's lifetime, see renderer.ts), so it is set up afresh here and
 * left for the next match afterwards.
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
  private readonly voice = new Commentary();
  readonly conditions: Conditions;
  private readonly weather: Weather;
  private readonly pitch: THREE.Group;
  private readonly sun: THREE.DirectionalLight;
  private readonly extras: ReturnType<typeof pitchExtras>;
  /** Rolling record of the last few seconds, oldest first. */
  private readonly history: ReplayFrame[] = [];
  private replay: { frames: ReplayFrame[]; t: number; wait: number; slowFrom: number; hold: number } | null = null;
  /** Frames filmed since the latest goal, for the end of its replay. */
  private afterGoal = 0;
  /** The team-mate waving for a pass, chosen afresh every so often. */
  private caller: SimPlayer | null = null;
  private callTimer = 0;
  /** The fans have had their moment on camera for this goal (so the second roar plays once). */
  private celebrated = false;
  private raf = 0;
  private last = 0;
  private acc = 0;
  /** Taps read on frames that ran no sim step, kept for the next step that does. */
  private readonly latches = [new PressLatch(), new PressLatch()] as const;
  private readonly camTarget = new THREE.Vector3();
  private readonly camPos = new THREE.Vector3();
  private readonly camLook = new THREE.Vector3();
  private disposed = false;
  private readonly onResize = () => this.resize();
  private readonly resizeObserver: ResizeObserver | null;
  /** Upright screens can look up the pitch instead of across it; `dir` is the way "up" points along x. */
  private upfield = false;
  private upDir: 1 | -1 = 1;
  /** First-time tutorial coach and its glowing star, when this is the tutorial. */
  private readonly coach: TutorialCoach | null = null;
  private readonly marker = new THREE.Group();
  private readonly gfx: GraphicsProfile;
  /** The streak behind a rocket of a shot and the dust and grass puffs; none of it when motion is calm. */
  private readonly trail: BallTrail;
  private readonly puffs = new Puffs();
  private readonly calm = getSettings().reduceMotion;
  /** Players already puffed for the tackle or dive they are in. */
  private readonly puffed = new Set<SimPlayer>();
  /**
   * Super skills. Play freezes while the cutscene runs, then goes into slow motion for a moment as the
   * super lets rip. If a cutscene ever fails, the rest of the match's supers just show their banner.
   */
  private readonly aura: SuperAura;
  private cut: { t: number; dur: number; p: SimPlayer; kind: SuperKind; from: THREE.Vector3; look: THREE.Vector3; angle: number } | null = null;
  private slowmo = 0;
  private cutsBroken = false;
  private readonly superMode = getSettings().supers;
  private trailColour: number | null = null;
  /** Current render resolution; Auto graphics nudges it down while frames are slow. */
  private pixelRatio: number;
  private prCeiling = Infinity;
  private lastAdaptUp = false;
  private frameMs = 16.7;
  private adaptTimer = -3;

  constructor(renderer: THREE.WebGLRenderer, uiRoot: HTMLElement, config: SimConfig, private readonly onFinish: (r: MatchResult) => void, private readonly onQuit: () => void, options: SceneOptions = {}) {
    this.sim = new MatchSim(config);
    this.conditions = resolveConditions(options.weather ?? 'random');
    this.commentator = new Commentator(this.conditions);
    this.commentator.onSay = (key, score) => this.voice.say(key, score);
    this.voice.load();
    music.preloadJingles();
    this.sfx.setWeather(this.conditions.weather);
    const twoPlayer = config.humanSide2 != null;
    // Two players: the first gamepad joins player 1 and the second joins player 2.
    const controls = getControls();
    this.input = new Input(twoPlayer ? controls.keys.p1 : controls.keys.solo, twoPlayer ? 0 : 'any', controls.pad);
    this.input2 = twoPlayer ? new Input(controls.keys.p2, 1, controls.pad) : null;
    this.renderer = renderer;
    // The Graphics setting (Auto picks Low on phones) trades detail for a smooth frame rate.
    const gfx = graphicsProfile();
    this.gfx = gfx;
    this.pixelRatio = Math.min(window.devicePixelRatio, gfx.maxPixelRatio);
    // Everything the match relies on is set here, whatever the last match (or Auto graphics) left behind.
    renderer.setPixelRatio(this.pixelRatio);
    renderer.shadowMap.enabled = gfx.shadowMap;
    renderer.shadowMap.type = THREE.PCFShadowMap;
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    renderer.toneMapping = TONE_MAPPING;
    renderer.toneMappingExposure = EXPOSURE;
    renderer.setClearColor(0x000000, 1);
    renderer.info.reset();
    this.scene.background = new THREE.Color('#8fd3ff');
    this.scene.fog = new THREE.Fog('#8fd3ff', 70, 130);
    this.camera = new THREE.PerspectiveCamera(42, 1, 0.1, 200);

    const sun = new THREE.DirectionalLight(0xffffff, 2.2);
    this.sun = sun;
    sun.position.set(-12, 30, 18);
    sun.castShadow = gfx.shadowMap;
    sun.shadow.mapSize.set(gfx.shadowSize, gfx.shadowSize);
    const sc = sun.shadow.camera;
    sc.left = -this.sim.length / 2 - 6; sc.right = this.sim.length / 2 + 6;
    sc.top = this.sim.width / 2 + 6; sc.bottom = -this.sim.width / 2 - 6;
    sc.near = 1; sc.far = 80;
    sun.shadow.bias = -0.0005;
    // A cool rim light from behind the camera's far side lifts faces and shirt numbers off the grass.
    const rim = new THREE.DirectionalLight(0xbfe3ff, 0.9);
    rim.position.set(14, 10, -18);
    const sky = new THREE.HemisphereLight(0xdff3ff, 0x3b7f4e, 1.25);
    this.scene.add(sun, rim, sky);

    const runoff = this.sim.mode === 'match';
    const pitch = buildPitch({ sceneryShadows: gfx.sceneryShadows, pbr: gfx.pbrGround, length: this.sim.length, width: this.sim.width, goalWidth: this.sim.goalWidth, goalHeight: this.sim.goalHeight, goalDepth: this.sim.goalDepth, runoffSide: runoff ? RUNOFF_SIDE : 0, runoffEnd: runoff ? RUNOFF_END : 0 });
    this.scene.add(pitch);
    this.pitch = pitch;
    this.extras = pitchExtras(pitch);
    // The weather restyles the sun and the sky light; the rim light keeps its own colour and angle.
    this.weather = new Weather(this.scene, { length: this.sim.length, width: this.sim.width }, this.conditions, gfx, { sun, sky });
    if (gfx.batchScenery) batchStatic(pitch, [...this.extras.nets.map((n) => n.group), this.extras.scoreboard.group]);
    this.extras.scoreboard.set(this.sim.teams[0].short, this.sim.teams[1].short, 0, 0);

    this.crowd = new Crowd(this.sim, { lite: gfx.liteCrowd });
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
      if (p.side === 0 && options.starId && p.info.id === options.starId) m.setStar(true);
      this.models.set(p, m);
      this.scene.add(m.group);
    }
    this.ball = new BallModel(this.sim.ball.radius);
    this.scene.add(this.ball.group);
    this.trail = new BallTrail(this.sim.ball.radius);
    this.scene.add(this.trail.group, this.puffs.group);
    this.aura = new SuperAura(0.6 + 0.5 * this.sim.stats.scale);
    this.scene.add(this.aura.group);
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
      onCamera: () => this.updateView(),
    }, this.coach ?? undefined);
    this.input.attachJoystick(this.hud.joystickZone, this.hud.joystickBase, this.hud.joystickKnob);
    this.input.attachButton(this.hud.btnShoot, 'shoot');
    this.input.attachButton(this.hud.btnPass, 'pass');
    this.input.attachButton(this.hud.btnSprint, 'sprint');
    this.input.attachButton(this.hud.btnSwitch, 'switch');
    this.input.attachButton(this.hud.btnTrick, 'trick');
    this.input.attachButton(this.hud.btnLob, 'lob');

    window.addEventListener('resize', this.onResize);
    window.addEventListener('orientationchange', this.onResize);
    window.visualViewport?.addEventListener('resize', this.onResize);
    // Phones report the new size late after a turn, so also watch the canvas itself.
    this.resizeObserver = typeof ResizeObserver === 'undefined' ? null : new ResizeObserver(this.onResize);
    this.resizeObserver?.observe(renderer.domElement);
    this.resize();
    this.camTarget.set(0, 0, 0);
    this.camPos.copy(this.cameraGoal(this.camTarget));
    this.camera.position.copy(this.camPos);
    this.camLook.set(0, 0.5, 0);
    this.last = performance.now();
    this.sfx.start(this.conditions.weather);
    this.raf = requestAnimationFrame(this.frame);
  }

  /**
   * Auto graphics: when frames keep running slow (under about 40 a second), draw at a lower
   * resolution; when they stay smooth for a while, step back up, but never above a level that
   * was already too slow.
   */
  private adapt(ms: number): void {
    // A frame that took no time (or claims to have ended before it began) says nothing about speed.
    if (!this.gfx.adaptive || ms <= 0 || ms > 250 || document.hidden) return;
    this.frameMs += (ms - this.frameMs) * 0.05;
    this.adaptTimer += ms / 1000;
    const slow = this.frameMs > 25, smooth = this.frameMs < 19;
    if (!slow && !smooth) { this.adaptTimer = Math.min(this.adaptTimer, 0); return; }
    if (slow && this.adaptTimer > 2 && this.pixelRatio > this.gfx.minPixelRatio + 0.01) {
      if (this.lastAdaptUp) this.prCeiling = this.pixelRatio - 0.01;
      this.setPixelRatio(Math.max(this.gfx.minPixelRatio, this.pixelRatio - 0.15), false);
    } else if (smooth && this.adaptTimer > 8) {
      const next = Math.min(window.devicePixelRatio, this.gfx.maxPixelRatio, this.pixelRatio + 0.1);
      if (next > this.pixelRatio + 0.01 && next <= this.prCeiling) this.setPixelRatio(next, true);
      else this.adaptTimer = 0;
    }
  }

  private setPixelRatio(pr: number, up: boolean): void {
    this.pixelRatio = pr;
    this.lastAdaptUp = up;
    this.adaptTimer = 0;
    this.frameMs = 16.7;
    this.renderer.setPixelRatio(pr);
    this.resize();
  }

  /** Snapshot the sim for the replay buffer (about five seconds kept). */
  private record(): void {
    const b = this.sim.ball;
    this.history.push({
      players: this.sim.players.map((p) => ({ x: p.pos.x, z: p.pos.z, facing: p.facing, speed: Math.hypot(p.vel.x, p.vel.z), kick: p.kickAnim, dive: p.diveAnim, diveDir: p.diveDir, stun: p.stunAnim, recover: Math.min(1, p.recover / DIVE_RECOVER) })),
      ball: { x: b.pos.x, y: b.y, z: b.pos.z, vx: b.vel.x, vz: b.vel.z },
    });
    if (this.history.length > 300) this.history.shift();
  }

  /** Play the build-up back at normal speed, then the shot and the ball hitting the net slowly. Returns true while the replay has the screen. */
  private runReplay(dt: number, scale: number): boolean {
    const r = this.replay;
    if (!r) return false;
    if (r.wait > 0) { r.wait -= dt; return false; }
    if (!r.frames.length) {
      // Cut the clip now, once the moments after the goal are filmed too.
      r.frames = this.history.slice(-(REPLAY_BEFORE + this.afterGoal));
      r.slowFrom = Math.max(0, r.frames.length - this.afterGoal - REPLAY_SLOW);
    }
    if (r.t === 0) this.hud.setReplay(true);
    const speed = Math.floor(r.t * 60) < r.slowFrom ? 1 : 0.55;
    r.t += dt * speed;
    const idx = Math.min(r.frames.length - 1, Math.floor(r.t * 60));
    const f = r.frames[idx];
    this.sim.players.forEach((p, i) => {
      const m = this.models.get(p)!, fp = f.players[i];
      m.group.position.set(fp.x, 0, fp.z);
      m.setFacing(fp.facing);
      m.animate(dt * speed, { speed: fp.speed, kick: fp.kick, dive: fp.dive, diveDir: fp.diveDir, stun: fp.stun, recover: fp.recover, tackle: 0, scale, wobble: 0, mood: 'focus', gazeX: 0, gazeY: 0, cheer: false });
      m.setSelected(false, 0xffffff);
    });
    this.ball.update(f.ball.x, f.ball.y, f.ball.z, this.sim.ball.radius, f.ball.vx, f.ball.vz, dt * speed);
    this.camTarget.lerp(new THREE.Vector3(THREE.MathUtils.clamp(f.ball.x, -this.sim.length * 0.4, this.sim.length * 0.4), 0, THREE.MathUtils.clamp(f.ball.z, -this.sim.width * 0.25, this.sim.width * 0.25)), 1 - Math.pow(0.02, dt));
    // Hold the last picture a moment before cutting to the celebration.
    if (idx >= r.frames.length - 1 && (r.hold += dt) > 0.4) { this.replay = null; this.hud.setReplay(false); }
    return true;
  }

  private resize(): void {
    const canvas = this.renderer.domElement;
    const w = canvas.clientWidth || window.innerWidth, h = canvas.clientHeight || window.innerHeight;
    if (!w || !h) return;
    this.renderer.setSize(w, h, false);
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();
    this.updateView();
  }

  /** Pick side-on or up-the-pitch for the current screen shape and camera choice. Call after a resize or a camera change. */
  updateView(): void {
    const wasUp = this.upfield, wasDir = this.upDir;
    const so = this.sim.shootout;
    // Look the way the player attacks: behind the penalty taker in a shoot-out, from your own goal otherwise.
    const side = so ? so.taking : (this.sim.config.humanSide ?? 0);
    this.upDir = side === 0 ? 1 : -1;
    this.upfield = this.camera.aspect < 0.9 && getControls().camera.portrait === 'upfield';
    if (wasUp !== this.upfield || wasDir !== this.upDir) {
      // Cut rather than swoop across the pitch.
      this.camPos.copy(this.cameraGoal(this.camTarget));
      this.camLook.set(this.camTarget.x, 0.5, this.camTarget.z);
    }
  }

  /** The stick and keys work in screen directions; turn them into pitch directions for the current view. */
  private toPitch(i: InputState): InputState {
    if (!this.upfield) return i;
    const d = this.upDir;
    return { ...i, moveX: -d * i.moveZ, moveZ: d * i.moveX };
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

  /**
   * Camera sits above and "south" of the focus point, looking down at a tilt. On an upright
   * screen it can instead sit behind the player's own goal, so the pitch runs up the screen.
   * `close` below 1 brings it in (to watch a goal celebration up close).
   */
  /** Now and then the most open team-mate up the pitch from the ball puts an arm up for it. */
  private updateCaller(dt: number): void {
    const sim = this.sim, o = sim.ball.owner;
    this.callTimer -= dt;
    if (sim.phase !== 'play' || !o) { this.caller = null; return; }
    if (this.caller && this.caller.side !== o.side) this.caller = null;
    if (this.callTimer > 0) return;
    this.callTimer = 0.9 + Math.random() * 0.6;
    this.caller = null;
    if (Math.random() < 0.35) return;
    const fwd = sim.goalX(o.side) > 0 ? 1 : -1;
    const clear = 2.2 * sim.stats.scale + 0.5;
    let best = 1.5;
    for (const p of sim.players) {
      if (p.side !== o.side || p === o || p.isKeeper) continue;
      const ahead = (p.pos.x - o.pos.x) * fwd;
      if (ahead <= best) continue;
      const marked = sim.players.some((q) => q.side !== p.side && Math.hypot(q.pos.x - p.pos.x, q.pos.z - p.pos.z) < clear);
      if (!marked) { best = ahead; this.caller = p; }
    }
  }

  private cameraGoal(target: THREE.Vector3, close = 1): THREE.Vector3 {
    const aspect = this.camera.aspect;
    const zoom = CAMERA_HEIGHT_SCALE[getControls().camera.height] * close;
    if (this.upfield) {
      // Fit most of the pitch's width across the narrow screen; the camera slides sideways for the rest.
      const height = ((this.sim.width * 0.5) / Math.max(0.42, aspect) + 2) * zoom;
      return new THREE.Vector3(target.x - this.upDir * height * 0.9, height, target.z);
    }
    // A little more tilt than straight down, so faces, kits and the stand show. A phone on its
    // side is short, so it sits a bit higher to keep both touchlines in view.
    const short = this.renderer.domElement.clientHeight < 520;
    const height = ((this.sim.width * 0.84) / Math.min(short ? 1.6 : 1.9, Math.max(1.0, aspect)) + 4.2) * zoom;
    return new THREE.Vector3(target.x, height, target.z + height * 0.9);
  }

  private frame = (now: number): void => {
    if (this.disposed) return;
    this.raf = requestAnimationFrame(this.frame);
    // The first frame can be stamped up to a second or so before the loop started (the browser dates it
    // to a frame that fell due while the match was being built). Time must never run backwards: a
    // negative step flings the camera far off the pitch.
    const ms = Math.max(0, now - this.last);
    const dt = Math.min(0.1, ms / 1000);
    this.adapt(ms);
    this.last = now;
    if (this.sim.shootout && this.upfield && (this.sim.shootout.taking === 0 ? 1 : -1) !== this.upDir) this.updateView();
    const input = this.latches[0].take(this.toPitch(this.input.poll()));
    const raw2 = this.input2?.poll();
    const input2 = raw2 && this.latches[1].take(this.toPitch(raw2));
    if (input.pause || input2?.pause) this.sim.togglePause();
    // Fixed 60 Hz simulation steps for stable physics. The sim waits while a replay plays.
    const replaying = !!this.replay && this.replay.wait <= 0;
    // Shoot, pass or lob during a replay skips it (taps during a replay are dropped below, so it kicks nothing).
    if (replaying && (input.shoot || input.pass || input.lob || input2?.shoot || input2?.pass || input2?.lob)) { this.replay = null; this.hud.setReplay(false); }
    const cutting = !!this.cut;
    if (this.cut) this.tickCut(dt, input.shoot || input.pass || input.lob || input.trick || !!input2?.shoot || !!input2?.pass || !!input2?.lob || !!input2?.trick);
    // Slow motion just after a super's cutscene: the sim runs at under half speed for a moment.
    this.acc += this.slowmo > 0 ? dt * 0.4 : dt;
    this.slowmo = Math.max(0, this.slowmo - dt);
    const step = 1 / 60;
    let steps = 0;
    while (!replaying && !cutting && this.acc >= step && steps < 8) {
      const once = { shoot: false, pass: false, lob: false, switchPlayer: false, pause: false, trick: false };
      this.sim.step(step, steps === 0 ? input : { ...input, ...once }, input2 ? (steps === 0 ? input2 : { ...input2, ...once }) : undefined);
      const live = this.sim.phase === 'play' || this.sim.phase === 'setpiece' || this.sim.phase === 'kickoff';
      // Keep filming for a moment after a goal, so its replay shows the ball hit the net.
      if (live || (this.replay && !this.replay.frames.length && this.afterGoal < REPLAY_AFTER)) { this.record(); if (!live) this.afterGoal++; }
      this.acc -= step;
      steps++;
      // A super has been called: show its cutscene before it plays out (the sim waits for it).
      if (this.sim.superPending && !this.cut) {
        this.startCut();
        if (this.cut) { this.acc = 0; break; }
      }
    }
    if (replaying || cutting) this.acc = 0;
    // The first step has used the taps (a paused sim steps too, and drops them). Taps during a replay
    // are dropped as well, so they do not take the kick-off the moment it ends.
    if (steps > 0 || replaying || cutting) { this.latches[0].clear(); this.latches[1].clear(); }
    for (const ev of this.sim.events) {
      this.sfx.play(ev);
      if (ev.type === 'fulltime') music.jingle(this.fullTimeJingle());
      this.crowd.onEvent(ev);
      if (!this.calm) this.puffFor(ev);
      if (ev.type === 'goal') {
        this.extras.scoreboard.set(this.sim.teams[0].short, this.sim.teams[1].short, this.sim.score[0], this.sim.score[1]);
        this.extras.nets[ev.side === 0 ? 1 : 0]?.hit(this.sim.ball.pos.z, Math.hypot(this.sim.ball.vel.x, this.sim.ball.vel.z));
        if (this.sim.mode !== 'training' && !getSettings().reduceMotion && this.history.length > 30) { this.replay = { frames: [], t: 0, wait: 1.1, slowFrom: 0, hold: 0 }; this.afterGoal = 0; }
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
    this.effects(dt);
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
    this.updateCaller(dt);
    const sp = this.sim.setPiece;
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
      const st: AnimState = { speed, kick: p.kickAnim, dive: p.diveAnim, diveDir: p.diveDir, stun: p.stunAnim, tackle: p.tackleTimer, scale, wobble, mood, gazeX, gazeY, cheer: celebrating === p.side, stepover: p.trickKind === 'stepover' ? p.trickAnim : 0, stepoverDir: p.trickDir,
        dribble: b.owner === p && !p.isKeeper && this.sim.phase === 'play', recover: Math.min(1, p.recover / DIVE_RECOVER), strafe: -p.vel.x * Math.sin(p.facing) + p.vel.z * Math.cos(p.facing),
        celebrate: celebrating >= 0 ? p.celebrate : null, celebrateT: this.sim.phaseTimer, move: p.move, moveAnim: p.moveAnim, hold: b.owner === p && p.handling,
        kickKind: p.kickKind, charge: p.charge, ready: this.sim.phase === 'kickoff' && b.owner !== p, call: p === this.caller,
        throwIn: this.sim.phase === 'setpiece' && sp?.kind === 'throwin' && sp.taker === p && b.owner === p };
      if (this.cut && p === this.cut.p) {
        // The hero strikes a pose while everyone else is frozen mid-stride.
        st.mood = 'happy';
        if (this.cut.kind === 'rocket') { st.charge = 1; st.kickKind = 'shot'; } else st.cheer = true;
      }
      m.animate(this.cut && p !== this.cut.p ? dt * 0.02 : dt, st);
      const isP1 = p === this.sim.controlled;
      const isP2 = p === this.sim.controlled2;
      m.setSelected(isP1 || isP2 || (this.sim.ball.owner === p && this.sim.config.humanSide === null), isP1 ? P1_RING : isP2 ? P2_RING : 0xffffff);
    }
    this.ball.update(b.pos.x, b.y, b.pos.z, b.radius, b.vel.x, b.vel.z, dt);

    // Camera follows a blend of the ball and the controlled player, clamped to the pitch.
    const c1 = this.sim.controlled, c2 = this.sim.controlled2;
    // The celebration: watch the scorer and the team-mates piling on.
    const hero = this.sim.phase === 'goal' && this.sim.phaseTimer > 0.5 ? this.sim.celebrator : null;
    const focus = hero ? new THREE.Vector3(hero.pos.x, 0, hero.pos.z) : c1 && this.sim.phase !== 'goal'
      ? (c2
        ? new THREE.Vector3(b.pos.x * 0.6 + c1.pos.x * 0.2 + c2.pos.x * 0.2, 0, b.pos.z * 0.6 + c1.pos.z * 0.2 + c2.pos.z * 0.2)
        : new THREE.Vector3(b.pos.x * 0.65 + c1.pos.x * 0.35, 0, b.pos.z * 0.65 + c1.pos.z * 0.35))
      : new THREE.Vector3(b.pos.x, 0, b.pos.z);
    // Set pieces happen out by the lines, so let the camera follow further out for them.
    const wide = this.sim.phase === 'setpiece' ? 1.25 : 1;
    if (!hero) {
      focus.x = THREE.MathUtils.clamp(focus.x, -this.sim.length * 0.32 * wide, this.sim.length * 0.32 * wide);
      focus.z = THREE.MathUtils.clamp(focus.z, -this.sim.width * 0.2 * wide * wide, this.sim.width * 0.2 * wide * wide);
      // On a phone on its side the buttons sit over one bottom corner. Attacking that way, nudge the
      // view towards the goal and the near touchline so the goal comes out from behind them.
      if (c1 && !this.upfield && this.camera.aspect > 1.3 && TOUCH_SCREEN) {
        const buttonsSide = getControls().touch.leftHanded ? -1 : 1;
        const into = THREE.MathUtils.clamp((b.pos.x * buttonsSide) / (this.sim.length * 0.5), 0, 1);
        if (this.sim.goalX(c1.side) * buttonsSide > 0 && into > 0) {
          focus.x += buttonsSide * this.sim.length * 0.08 * into;
          focus.z += this.sim.width * 0.12 * into;
        }
      }
    }
    this.camTarget.lerp(focus, 1 - Math.pow(0.02, dt));
    // After a goal in a match the camera follows the scorer's celebration (after the replay, which
    // plays from 1.1s), then swings round to the scoring team's fans going wild, then back for kick-off.
    const scorer = this.sim.goals[this.sim.goals.length - 1];
    const crowdShot = this.sim.mode === 'match' && this.sim.phase === 'goal' && this.sim.phaseTimer > CROWD_SHOT_AT && scorer
      ? this.crowd.celebrationShot(scorer.side, this.camera.aspect < 0.9) : null;
    if (crowdShot && scorer) {
      this.crowd.celebrate(scorer.side);
      if (!this.celebrated) { this.celebrated = true; this.sfx.play('celebrate'); }
    } else if (this.sim.phase !== 'goal') this.celebrated = false;
    const k = 1 - Math.pow(crowdShot ? 0.01 : 0.02, dt);
    this.camPos.lerp(crowdShot ? crowdShot.pos : this.cameraGoal(this.camTarget, hero ? 0.55 : 1), k);
    this.camLook.lerp(crowdShot ? crowdShot.look : new THREE.Vector3(this.camTarget.x, 0.5, this.camTarget.z), k);
    this.camera.position.copy(this.camPos);
    this.camera.lookAt(this.camLook);
    if (this.cut) this.cutCamera();

    this.renderer.render(this.scene, this.camera);
  };

  /** A super has been called: start its cutscene, or with "No cutscenes" just its banner. */
  private startCut(): void {
    const s = this.sim.superPending;
    if (!s) return;
    try {
      const yours = this.sim.isHuman(s.side);
      const quick = this.superMode === 'quick' || this.cutsBroken;
      this.hud.superStart(s.kind, s.p.info, yours, this.sim.teams[s.side].short, quick);
      if (!this.calm) this.aura.burst(s.p.pos.x, s.p.pos.z, SUPERS[s.kind].hex);
      if (quick) return;
      const from = this.camera.position.clone();
      this.cut = {
        t: 0, dur: this.calm ? 1.2 : yours ? 2.2 : 1.6, p: s.p, kind: s.kind, from, look: this.camLook.clone(),
        angle: Math.atan2(from.z - s.p.pos.z, from.x - s.p.pos.x),
      };
    } catch (e) { this.cutFailed(e); }
  }

  /** Time the cutscene (it waits while the game is paused); a tap skips the rest of it. */
  private tickCut(dt: number, tapped: boolean): void {
    const c = this.cut!;
    if (this.sim.phase === 'paused') return;
    c.t += dt;
    // A hard stop as well, so nothing can ever leave play frozen.
    if (c.t >= c.dur || c.t > 4 || (tapped && c.t > 0.5)) this.endCut();
  }

  private endCut(): void {
    const c = this.cut;
    this.cut = null;
    try { this.hud.superEnd(); } catch { /* the overlay is only decoration */ }
    // The normal camera eases back from wherever the cutscene left it.
    this.camPos.copy(this.camera.position);
    if (c) this.camLook.set(c.p.pos.x, 0.8, c.p.pos.z);
    if (c && !this.calm) { this.slowmo = 0.9; this.sfx.play('superGo'); }
  }

  private cutFailed(e: unknown): void {
    console.warn('Super skill cutscenes switched off for this match after an error', e);
    this.cutsBroken = true;
    this.cut = null;
    try { this.hud.superEnd(); } catch { /* nothing more to undo */ }
  }

  /** The camera swoops down to the hero and circles them, with a shake as the super fires up. */
  private cutCamera(): void {
    const c = this.cut!;
    try {
      const k = 0.7 + 0.5 * this.sim.stats.scale;
      const head = new THREE.Vector3(c.p.pos.x, 0.85 * k, c.p.pos.z);
      if (!this.calm) {
        const u = Math.min(1, c.t / c.dur);
        const a = c.angle + c.t * 0.45;
        const r = (5.2 - 2.3 * u) * k, h = (2.3 - 0.9 * u) * k;
        const orbit = new THREE.Vector3(c.p.pos.x + Math.cos(a) * r, h, c.p.pos.z + Math.sin(a) * r);
        const swoop = 1 - Math.pow(1 - Math.min(1, c.t / 0.45), 3);
        const pos = c.from.clone().lerp(orbit, swoop);
        const look = c.look.clone().lerp(head, swoop);
        const shake = c.t < 0.55 ? 0.12 * k * (1 - c.t / 0.55) : 0;
        pos.x += (Math.random() - 0.5) * shake;
        pos.y += (Math.random() - 0.5) * shake;
        this.camera.position.copy(pos);
        this.camera.lookAt(look);
      }
      const v = head.project(this.camera);
      this.hud.superFocus((v.x + 1) / 2, (1 - v.y) / 2);
    } catch (e) { this.cutFailed(e); }
  }

  /** A fanfare when the player wins (or in two-player and training), a warm "well played" otherwise. */
  private fullTimeJingle(): 'win' | 'draw' {
    const me = this.sim.config.humanSide;
    if (me === null || this.sim.config.humanSide2 != null || this.sim.mode === 'training') return 'win';
    return this.sim.score[me] > this.sim.score[1 - me] ? 'win' : 'draw';
  }

  /** A puff of dust and grass where a ball is struck. */
  private puffFor(ev: SimEvent): void {
    if (ev.type === 'shot') this.puffs.burst(this.sim.ball.pos.x, this.sim.ball.pos.z, 5, 0.45 * this.sim.stats.scale + 0.2);
  }

  /** The ball's streak while a hard shot flies, and puffs as a tackle flies in or a keeper dives. */
  private effects(dt: number): void {
    this.puffs.update(dt);
    const b = this.sim.ball;
    // A Rocket Shot streaks orange and a Magic Pass purple, bigger than the usual gold.
    const colour = b.superShot ? SUPERS.rocket.hex : b.superPass ? SUPERS.magic.hex : null;
    if (colour !== this.trailColour) { this.trailColour = colour; this.trail.setColour(colour); }
    this.trail.update(dt, this.ball.group.position, !this.calm && !b.owner && (colour !== null || Math.hypot(b.vel.x, b.vel.z) > this.sim.stats.power * 1.05));
    // While a super lasts (a dash, a slide, the gloves), its glow stays with the player.
    const lasting = this.sim.players.find((p) => p.superKind && p.superTime > 0 && p.superKind !== 'rocket' && p.superKind !== 'magic');
    this.aura.follow(lasting?.pos.x ?? 0, lasting?.pos.z ?? 0, !!lasting && !this.calm);
    this.aura.update(dt);
    if (lasting && !this.calm && (lasting.superKind === 'turbo' || lasting.superKind === 'bulldozer') && Math.hypot(lasting.vel.x, lasting.vel.z) > 1) {
      this.puffs.burst(lasting.pos.x, lasting.pos.z, 1, 0.35 * this.sim.stats.scale + 0.2); // dust kicked up behind them
    }
    if (this.calm) return;
    for (const p of this.sim.players) {
      const busy = p.tackleTimer > 0.25 || p.diveAnim > 0.4;
      if (busy && !this.puffed.has(p)) {
        this.puffed.add(p);
        this.puffs.burst(p.pos.x, p.pos.z, p.diveAnim > 0.4 ? 7 : 4, 0.5 * this.sim.stats.scale + 0.2);
      } else if (!busy) this.puffed.delete(p);
    }
  }

  dispose(): void {
    if (this.disposed) return;
    this.disposed = true;
    cancelAnimationFrame(this.raf);
    window.removeEventListener('resize', this.onResize);
    window.removeEventListener('orientationchange', this.onResize);
    window.visualViewport?.removeEventListener('resize', this.onResize);
    this.resizeObserver?.disconnect();
    this.input.dispose();
    this.input2?.dispose();
    this.sfx.dispose();
    this.voice.dispose();
    this.weather.dispose();
    this.hud.destroy();
    this.models.forEach((m) => m.dispose());
    this.crowd.dispose();
    // The crowd frees its own meshes but not the textures it borrows from caches (kit shirts, the fans'
    // faces): this frees their GPU copies too, and they are uploaded again if the next match wants them.
    disposeObject(this.crowd.group);
    // The grass, boards, scoreboard, nets and merged stadium; then the ball, the tutorial star and the sun's shadow map.
    disposeObject(this.pitch);
    this.ball.dispose();
    disposeObject(this.trail.group);
    disposeObject(this.puffs.group);
    disposeObject(this.aura.group);
    disposeObject(this.marker);
    this.sun.dispose();
    // Nobody is wearing a kit or pulling a face now: free the cached ones, bar any still held.
    clearPlayerAtlasCache();
    clearFaceCache();
    // The renderer outlives the match: let go of this scene's draw lists and blank the canvas.
    this.renderer.renderLists.dispose();
    this.renderer.info.reset();
    this.renderer.clear();
  }
}

export type { Side };

