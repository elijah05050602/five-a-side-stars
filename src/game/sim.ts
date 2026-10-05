import { AGE_STATS, type AgeStats } from '../data/ageGroups';
import type { Difficulty, Player, Position, SkillKey, Team } from '../data/types';
import { startingFive } from '../data/defaults';
import { assignSlots, formationById } from '../data/formations';
import { averageStars, skillMul } from '../data/skills';
import type { InputState } from './input';

/** Horizontal vector helpers (x along the pitch, z across it). */
export interface V2 { x: number; z: number }
const v = (x = 0, z = 0): V2 => ({ x, z });
const len = (a: V2) => Math.hypot(a.x, a.z);
const dist = (a: V2, b: V2) => Math.hypot(a.x - b.x, a.z - b.z);
const norm = (a: V2): V2 => { const l = len(a); return l > 1e-6 ? v(a.x / l, a.z / l) : v(); };
const clamp = (n: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, n));
const rand = (lo: number, hi: number) => lo + Math.random() * (hi - lo);

export type Side = 0 | 1; // 0 = home (attacks +x), 1 = away (attacks -x)

/** What one player did in a match; feeds player of the match and career growth. */
export interface PlayerMatchStats {
  goals: number;
  assists: number;
  shots: number;
  /** Passes that reached a team-mate. */
  passes: number;
  /** Tackles that won the ball. */
  tackles: number;
  saves: number;
}

export const freshMatchStats = (): PlayerMatchStats => ({ goals: 0, assists: 0, shots: 0, passes: 0, tackles: 0, saves: 0 });

/** Star ratings turned into multipliers on the age-group base values. */
export interface SkillMuls {
  /** Running speed (Speed). */
  speed: number;
  /** Shot power (Shooting). */
  power: number;
  /** Shot wobble: below 1 is straighter (Shooting). */
  spread: number;
  /** Pass wobble: below 1 is tidier (Passing / Kicking). */
  passWobble: number;
  /** Added to the age's control value for first touches and tricks (Dribbling). */
  touch: number;
  /** How far each dribbling touch pushes the ball: below 1 keeps it closer (Dribbling). */
  touchDist: number;
  /** Chance of winning a tackle (Tackling). */
  tackle: number;
  /** How long sprinting lasts and how much pace is kept late on (Stamina). */
  stamina: number;
  /** Holding off tackles, winning bumps and the length of a keeper's boot (Strength). */
  strength: number;
  /** Keeper reach when diving (Diving). */
  reach: number;
  /** Keeper's chance of getting to a shot in time (Reflexes). */
  save: number;
  /** Keeper's chance of catching rather than parrying (Handling). */
  catch: number;
  /** How well the keeper narrows the angle, 1 is the age's normal (Positioning). */
  angle: number;
}

export interface SimPlayer {
  id: string;
  side: Side;
  info: Player;
  pos: V2;
  vel: V2;
  facing: number; // radians, 0 = +x
  radius: number;
  /** Home spot in the formation (absolute world coords). */
  home: V2;
  /** The job this player does in the team's formation (their spot's position, which can differ from their own). */
  role: Position;
  /** Their formation spot: x up from our own goal line as a share of the pitch length, z across it as a share of the width. */
  slot: V2;
  /** Time remaining before this player may take the ball again after kicking. */
  kickCooldown: number;
  /** Decision timer for AI. */
  think: number;
  aiTarget: V2;
  /** Animation hooks. */
  kickAnim: number;
  diveAnim: number;
  /** 1 right after being tackled off the ball, fading to 0. */
  stunAnim: number;
  diveDir: number;
  distanceRun: number;
  isKeeper: boolean;
  speedMul: number;
  tackleTimer: number;
  /** Seconds this player has held the ball in the current spell. */
  holdTime: number;
  /** Seconds before a dribbler can take their next touch. */
  touchTimer: number;
  /** A pass or trick pressed while the ball was out of reach, played as soon as it is back. */
  queued: 'pass' | 'trick' | null;
  /** Which way the player is trying to run (the stick, or the AI's target); dribbling touches go this way. */
  runDir: V2;
  /** 0..1 sprint energy (human-controlled player only). */
  stamina: number;
  /** 0..1 shot power being charged while the shoot button is held. */
  charge: number;
  /** Which way the keeper has committed to for a penalty (0 = not yet). */
  penaltyGuess: number;
  /** 1 when a skill move starts, fading to 0 (drives the animation). */
  trickAnim: number;
  trickKind: TrickKind | null;
  /** Which way a step-over feints: -1 or 1 across the kid's body. */
  trickDir: number;
  /** Seconds before another skill move is allowed. */
  trickCooldown: number;
  /** Seconds of burst left after a skill move that worked. */
  trickBoost: number;
  mul: SkillMuls;
  match: PlayerMatchStats;
}

export type TrickKind = 'stepover' | 'nutmeg';
/** Restarts after the ball goes out of play, plus the two the referee gives for fouls. */
export type SetPieceKind = 'freekick' | 'penalty' | 'corner' | 'throwin' | 'goalkick';

export interface SimBall {
  pos: V2;
  y: number;
  vel: V2;
  vy: number;
  radius: number;
  spin: number;
  /** Player currently dribbling the ball, if any. */
  owner: SimPlayer | null;
  lastTouch: SimPlayer | null;
  /** Last player who deliberately kicked the ball (decides who scored). */
  lastKick: SimPlayer | null;
  /** Increments on every kick so a keeper gets one attempt per shot. */
  flightId: number;
  /** flightId the keeper has already tried (and failed) to save. */
  keeperTried: number;
  /** True while the ball is in flight from a penalty kick (keepers find these harder). */
  penaltyShot: boolean;
  /** The last kick was a pass (so a team-mate collecting it completes it). */
  wasPass: boolean;
  /** Team-mate whose completed pass set up the current possession; credited with an assist on a goal. */
  assist: SimPlayer | null;
}

export type Phase = 'kickoff' | 'play' | 'setpiece' | 'goal' | 'halftime' | 'fulltime' | 'paused';

export interface SetPiece {
  kind: SetPieceKind;
  /** Team taking the kick. */
  side: Side;
  taker: SimPlayer;
  spot: V2;
  timer: number;
  /** Seconds the ball rolls dead and the taker walks over before it is placed (0 for fouls). */
  wait: number;
  /** Where the taker stands and which way they face once the ball is placed. */
  stand: V2;
  face: number;
  placed: boolean;
  /** Where the other players head while it is set up (players not listed stand still). */
  targets: Map<SimPlayer, V2>;
}

export interface GoalEvent { side: Side; scorer: Player; minute: number; ownGoal: boolean }

export interface SimEvent {
  type: 'goal' | 'kickoff' | 'halftime' | 'fulltime' | 'save' | 'kick' | 'touch' | 'shot' | 'foul' | 'whistle' | 'miss' | 'restart' | 'trick';
  /** foul: the set piece awarded; restart: corner, throw-in or goal kick; trick: the skill move. */
  kind?: SetPieceKind | TrickKind;
  side?: Side;
  player?: Player;
  /** trick: whether it beat the defender. */
  ok?: boolean;
}

export interface SimConfig {
  home: Team;
  away: Team;
  difficulty: Difficulty;
  halfSeconds: number;
  /** Which side player 1 controls; null = watch the computer play itself. */
  humanSide: Side | null;
  /** Second player on the same keyboard, if any. */
  humanSide2?: Side | null;
  /** match (default), a penalty shoot-out, target practice against a lone keeper, or the first-time tutorial. */
  mode?: 'match' | 'shootout' | 'training' | 'tutorial';
  /**
   * Fine-grained computer strength for league play: 0 is a touch below Easy,
   * 1 is a touch above Hard. When set it overrides `difficulty`.
   */
  cpuLevel?: number;
}

export interface Shootout {
  /** Side taking the current penalty. */
  taking: Side;
  /** Penalties taken so far by each side, true = scored. */
  results: [boolean[], boolean[]];
  /** Set once the current kick has been resolved, until the next penalty is set up. */
  resolved: boolean;
  timer: number;
  kicked: boolean;
}

export const IDLE_INPUT: InputState = { moveX: 0, moveZ: 0, shoot: false, shootHeld: false, pass: false, sprint: false, switchPlayer: false, pause: false, trick: false };

/** Grass between the lines and the boards, so the ball can go out for throw-ins, corners and goal kicks. */
export const RUNOFF_SIDE = 1.2;
export const RUNOFF_END = 1.6;

const DIFF = {
  easy: { speed: 0.85, think: 0.55, accuracy: 0.6, tackle: 0.6, humanTackle: 1.3, shootRange: 0.3 },
  normal: { speed: 1.0, think: 0.35, accuracy: 0.8, tackle: 0.9, humanTackle: 0.85, shootRange: 0.38 },
  hard: { speed: 1.08, think: 0.2, accuracy: 1.0, tackle: 1.2, humanTackle: 0.6, shootRange: 0.45 },
} as const;

type DiffSettings = { speed: number; think: number; accuracy: number; tackle: number; humanTackle: number; shootRange: number };

/** Blend the Easy/Normal/Hard presets into a continuous strength scale. */
function diffForLevel(level: number): DiffSettings {
  const t = Math.max(-0.15, Math.min(1.15, level));
  const [a, b, u] = t < 0.5 ? [DIFF.easy, DIFF.normal, t * 2] : [DIFF.normal, DIFF.hard, (t - 0.5) * 2];
  const mix = (k: keyof DiffSettings) => a[k] + (b[k] - a[k]) * u;
  return { speed: mix('speed'), think: mix('think'), accuracy: mix('accuracy'), tackle: mix('tackle'), humanTackle: mix('humanTackle'), shootRange: mix('shootRange') };
}

/**
 * Stars become small multipliers around the age group's average, so a team of
 * ordinary players feels exactly like the age group alone. Outfield players
 * and keepers rate different things (see skillKeys in skills.ts).
 */
export function skillMuls(info: Player, age: Team['ageGroup']): SkillMuls {
  const avg = averageStars(age);
  const s = (k: SkillKey) => (Number.isFinite(info.skills?.[k]) ? info.skills[k] : avg);
  const m = (k: SkillKey, per: number) => skillMul(s(k), age, per);
  return {
    speed: clamp(m('speed', 0.05), 0.8, 1.2),
    power: clamp(m('shooting', 0.03), 0.88, 1.12),
    spread: clamp(m('shooting', -0.14), 0.4, 1.6),
    passWobble: clamp(m('passing', -0.15), 0.4, 1.6),
    touch: 0.05 * (s('control') - avg),
    touchDist: clamp(m('control', -0.1), 0.65, 1.4),
    tackle: clamp(m('tackling', 0.11), 0.6, 1.5),
    stamina: clamp(m('stamina', 0.15), 0.6, 1.5),
    strength: clamp(m('strength', 0.1), 0.7, 1.35),
    reach: clamp(m('diving', 0.07), 0.75, 1.3),
    save: clamp(m('reflexes', 0.06), 0.75, 1.25),
    catch: clamp(m('handling', 0.12), 0.6, 1.5),
    angle: clamp(m('positioning', 0.15), 0.6, 1.5),
  };
}

export class MatchSim {
  readonly stats: AgeStats;
  readonly length: number;
  readonly width: number;
  readonly goalWidth: number;
  readonly goalHeight: number;
  readonly goalDepth: number;
  readonly players: SimPlayer[] = [];
  readonly ball: SimBall;
  readonly teams: [Team, Team];
  score: [number, number] = [0, 0];
  goals: GoalEvent[] = [];
  phase: Phase = 'kickoff';
  /** Match clock in seconds, counts up through both halves. */
  clock = 0;
  half: 1 | 2 = 1;
  phaseTimer = 0;
  kickoffSide: Side = 0;
  /** The player each side's human is controlling (null for computer sides). */
  controlledBy: [SimPlayer | null, SimPlayer | null] = [null, null];
  events: SimEvent[] = [];
  private switchHolds: [number, number] = [0, 0];
  setPiece: SetPiece | null = null;
  fouls: [number, number] = [0, 0];
  shootout: Shootout | null = null;
  private readonly diff: DiffSettings;
  /** Training: points scored (a normal goal is 1, a rocket is 2). */
  trainingPoints = 0;
  get mode(): 'match' | 'shootout' | 'training' | 'tutorial' { return this.config.mode ?? 'match'; }
  private lastPhase: Phase = 'kickoff';
  /** Tutorial: the one player the learner controls the whole way through. */
  tutorialHero: SimPlayer | null = null;
  private pressureTimer = 0;

  constructor(readonly config: SimConfig) {
    this.teams = [config.home, config.away];
    this.stats = AGE_STATS[config.home.ageGroup];
    this.length = this.stats.pitch.length;
    this.width = this.stats.pitch.width;
    this.goalWidth = this.stats.goalWidth;
    this.goalHeight = 1.0 + 0.6 * this.stats.scale;
    this.goalDepth = 1.2;
    this.ball = { pos: v(), y: 0, vel: v(), vy: 0, radius: 0.12 + 0.05 * this.stats.scale, spin: 0, owner: null, lastTouch: null, lastKick: null, flightId: 0, keeperTried: -1, penaltyShot: false, wasPass: false, assist: null };
    this.diff = config.cpuLevel !== undefined ? diffForLevel(config.cpuLevel) : DIFF[config.difficulty];
    const diff = this.diff;
    ([0, 1] as Side[]).forEach((side) => {
      const team = this.teams[side];
      const isCpu = !this.isHuman(side);
      const five = startingFive(team);
      // Tutorial: you and one team-mate against a lone keeper.
      const tutorialPair = five.filter((pl) => pl.position !== 'GK').sort((a, b) => (a.position === 'ATT' ? 0 : 1) - (b.position === 'ATT' ? 0 : 1)).slice(0, 2);
      five.forEach((info) => {
        if ((config.mode === 'training' || config.mode === 'tutorial') && side === 1 && info.position !== 'GK') return;
        if (config.mode === 'tutorial' && side === 0 && !tutorialPair.includes(info)) return;
        const mul = skillMuls(info, config.home.ageGroup);
        const p: SimPlayer = {
          id: info.id, side, info, pos: v(), vel: v(), facing: side === 0 ? 0 : Math.PI,
          radius: 0.28 * this.stats.scale + 0.08, home: v(), role: info.position, slot: v(info.position === 'GK' ? 0.03 : 0.33, 0), kickCooldown: 0, think: Math.random() * 0.3,
          aiTarget: v(), kickAnim: 0, diveAnim: 0, stunAnim: 0, diveDir: 1, distanceRun: 0, isKeeper: info.position === 'GK',
          speedMul: (isCpu ? diff.speed : 1) * (info.special === 'speedy' ? 1.12 : 1) * mul.speed, tackleTimer: 0, holdTime: 0, touchTimer: 0, queued: null, runDir: v(side === 0 ? 1 : -1, 0), stamina: 1, charge: 0, penaltyGuess: 0,
          trickAnim: 0, trickKind: null, trickDir: 1, trickCooldown: 0, trickBoost: 0,
          mul, match: freshMatchStats(),
        };
        this.players.push(p);
      });
      // Line the outfield players up in the team's formation.
      const outfield = this.players.filter((p) => p.side === side && !p.isKeeper);
      assignSlots(outfield, formationById(team.formation)).forEach((slot, p) => { p.role = slot.pos; p.slot = v(slot.x, slot.z); });
    });
    if (config.mode === 'shootout') {
      this.shootout = { taking: 0, results: [[], []], resolved: false, timer: 0, kicked: false };
      this.setupPenalty(0);
    } else if (config.mode === 'tutorial') {
      this.setupKickoff(0);
      this.tutorialHero = this.ball.owner ?? this.teamOf(0).find((p) => !p.isKeeper) ?? null;
      this.phase = 'play';
    } else {
      this.setupKickoff(config.mode === 'training' && config.humanSide !== null ? config.humanSide : 0);
    }
  }

  /** Shoot-out: everyone to the centre, the next taker on the spot, the keeper on the line. */
  private setupPenalty(side: Side): void {
    const so = this.shootout!;
    so.taking = side;
    so.resolved = false;
    so.kicked = false;
    so.timer = 0;
    const dir = side === 0 ? 1 : -1;
    const goal = v(this.goalX(side), 0);
    const spot = v(goal.x - dir * (this.width * 0.26 + 0.6), 0);
    const takers = this.teamOf(side).filter((p) => !p.isKeeper);
    const taker = takers[so.results[side].length % takers.length];
    const keeper = this.teamOf((1 - side) as Side).find((p) => p.isKeeper) ?? this.teamOf((1 - side) as Side)[0];
    this.players.forEach((p, i) => {
      p.pos = v(-dir * 2 + (i % 5) * 0.8 * -dir, -3 + (i % 3) * 3);
      p.vel = v(); p.kickCooldown = 0; p.charge = 0; p.diveAnim = 0; p.kickAnim = 0; p.penaltyGuess = 0;
    });
    taker.pos = v(spot.x - dir * 0.5, 0);
    taker.facing = side === 0 ? 0 : Math.PI;
    keeper.pos = v(this.ownGoalX((1 - side) as Side) + (-dir) * 0.4, 0);
    const b = this.ball;
    b.owner = taker; b.pos = v(spot.x, spot.z); b.vel = v(); b.vy = 0; b.y = 0; b.lastKick = null;
    this.setPiece = { kind: 'penalty', side, taker, spot, timer: 0, wait: 0, stand: v(taker.pos.x, taker.pos.z), face: taker.facing, placed: true, targets: new Map() };
    this.phase = 'setpiece';
    this.controlledBy = [null, null];
    if (this.isHuman(side)) this.controlledBy[side] = taker;
    if (this.isHuman((1 - side) as Side)) this.controlledBy[(1 - side) as Side] = keeper;
    this.events.push({ type: 'whistle' });
  }

  private shootoutScore(): [number, number] {
    const so = this.shootout!;
    return [so.results[0].filter(Boolean).length, so.results[1].filter(Boolean).length];
  }

  /** True when the shoot-out is decided (best of five, then sudden death). */
  private shootoutDecided(): boolean {
    const so = this.shootout!;
    const [a, b] = this.shootoutScore();
    const [ta, tb] = [so.results[0].length, so.results[1].length];
    if (ta < 5 || tb < 5) {
      const leftA = Math.max(0, 5 - ta), leftB = Math.max(0, 5 - tb);
      return a + leftA < b || b + leftB < a; // cannot be caught
    }
    return ta === tb && a !== b;
  }

  private resolveShootoutKick(scored: boolean): void {
    const so = this.shootout!;
    if (so.resolved) return;
    so.resolved = true;
    so.timer = 0;
    so.results[so.taking].push(scored);
    this.score = this.shootoutScore();
    if (!scored) this.events.push({ type: 'miss', side: so.taking });
  }

  isHuman(side: Side): boolean { return this.config.humanSide === side || this.config.humanSide2 === side; }
  /** Player 1's controlled player (what the main HUD shows). */
  get controlled(): SimPlayer | null { return this.config.humanSide === null ? null : this.controlledBy[this.config.humanSide]; }
  get controlled2(): SimPlayer | null { return this.config.humanSide2 == null ? null : this.controlledBy[this.config.humanSide2]; }
  teamOf(side: Side): SimPlayer[] { return this.players.filter((p) => p.side === side); }
  goalX(side: Side): number { return side === 0 ? this.length / 2 : -this.length / 2; } // the goal this side attacks
  ownGoalX(side: Side): number { return -this.goalX(side); }
  get minute(): number { return Math.floor((this.clock / (this.config.halfSeconds * 2)) * 40); }

  /** Put everyone in formation. `side` takes the kickoff. */
  setupKickoff(side: Side): void {
    this.kickoffSide = side;
    this.ball.pos = v();
    this.ball.vel = v();
    this.ball.y = 0;
    this.ball.vy = 0;
    this.ball.owner = null;
    const L = this.length, W = this.width;
    ([0, 1] as Side[]).forEach((s) => {
      const dir = s === 0 ? 1 : -1; // attacking direction
      const own = this.ownGoalX(s);
      const team = this.teamOf(s);
      team.forEach((p) => {
        if (p.isKeeper) p.home = v(own + dir * 0.6, 0);
        else p.home = v(own + dir * L * p.slot.x, dir * W * p.slot.z);
        p.pos = v(p.home.x, p.home.z);
        p.vel = v();
        p.facing = s === 0 ? 0 : Math.PI;
        p.kickCooldown = 0;
        p.kickAnim = 0;
        p.diveAnim = 0;
      });
      if (s === side) {
        // The furthest forward stands on the ball, the next just behind.
        const atts = this.forwards(team);
        if (atts[0]) { atts[0].pos = v(-dir * 0.4, 0); this.ball.owner = atts[0]; }
        if (atts[1]) atts[1].pos = v(-dir * 2.2, W * 0.1);
      }
    });
    this.phase = 'kickoff';
    this.phaseTimer = 0;
    this.setPiece = null;
    for (const hs of [0, 1] as Side[]) {
      if (!this.isHuman(hs)) { this.controlledBy[hs] = null; continue; }
      const human = this.teamOf(hs);
      const owner = this.ball.owner as SimPlayer | null;
      this.controlledBy[hs] = owner && owner.side === hs ? owner : this.forwards(human)[0] ?? human[0];
    }
    this.events.push({ type: 'kickoff', side });
  }

  /** Outfield players, the most attacking first (strikers, then wingers, midfielders, defenders). */
  private forwards(team: SimPlayer[]): SimPlayer[] {
    const rank: Record<Position, number> = { ATT: 0, WING: 1, MID: 2, DEF: 3, GK: 4 };
    return team.filter((p) => !p.isKeeper).sort((a, b) => rank[a.role] - rank[b.role] || b.slot.x - a.slot.x);
  }

  togglePause(): void {
    if (this.phase === 'paused') this.phase = this.lastPhase;
    else if (this.phase === 'play' || this.phase === 'kickoff' || this.phase === 'setpiece') { this.lastPhase = this.phase; this.phase = 'paused'; }
  }

  /** Advance the simulation. dt is seconds (call with a fixed step). */
  step(dt: number, input: InputState, input2?: InputState): void {
    if (this.phase === 'paused' || this.phase === 'fulltime') return;
    if (this.phase === 'goal') {
      this.phaseTimer += dt;
      if (this.phaseTimer > (this.mode === 'training' ? 1.6 : 3.2)) {
        if (this.shootout) this.advanceShootout();
        else if (this.mode === 'tutorial') return; // the coach puts the ball back
        else if (this.mode === 'training') this.setupKickoff(this.config.humanSide ?? 0);
        else {
          const conceded = (1 - this.goals[this.goals.length - 1].side) as Side;
          this.setupKickoff(conceded);
        }
      }
      return;
    }
    if (this.shootout) { this.stepShootout(dt, input, input2); return; }
    if (this.phase === 'halftime') {
      this.phaseTimer += dt;
      if (this.phaseTimer > 3.5) { this.half = 2; this.setupKickoff(1); }
      return;
    }
    this.clock += dt;
    this.pressureTimer -= dt;
    if (this.phase === 'kickoff') {
      this.phaseTimer += dt;
      if (this.phaseTimer > 4) this.phase = 'play';
    }
    if (this.phase === 'setpiece' && this.setPiece) {
      const sp = this.setPiece;
      sp.timer += dt;
      if (sp.timer >= sp.wait) {
        if (!sp.placed) this.placeSetPiece(sp);
        // Nobody may steal the ball while the taker lines it up.
        if (this.ball.owner !== sp.taker && sp.timer < sp.wait + 8) { this.ball.owner = sp.taker; this.ball.pos = v(sp.spot.x, sp.spot.z); this.ball.vel = v(); }
        if (sp.timer > sp.wait + 8) this.autoTake(sp.taker); // taker dawdled: the referee hurries them up
      }
    }
    const halfEnd = this.config.halfSeconds * this.half;
    if (this.mode === 'tutorial') this.clock = Math.min(this.clock, 1); // no clock in the tutorial
    if (this.mode === 'training' && this.clock >= this.config.halfSeconds) { this.phase = 'fulltime'; this.events.push({ type: 'fulltime' }); return; }
    if (this.mode !== 'training' && this.mode !== 'tutorial' && this.clock >= halfEnd && this.ballIsCalm()) {
      if (this.half === 1) { this.phase = 'halftime'; this.phaseTimer = 0; this.events.push({ type: 'halftime' }); }
      else { this.phase = 'fulltime'; this.events.push({ type: 'fulltime' }); }
      return;
    }
    const inputs: [InputState | null, InputState | null] = [null, null];
    if (this.config.humanSide !== null) inputs[this.config.humanSide] = input;
    if (this.config.humanSide2 != null) inputs[this.config.humanSide2] = input2 ?? IDLE_INPUT;
    for (const hs of [0, 1] as Side[]) if (inputs[hs]) this.updateControlledSelection(inputs[hs]!, hs);
    for (const p of this.players) {
      p.kickCooldown = Math.max(0, p.kickCooldown - dt);
      p.tackleTimer = Math.max(0, p.tackleTimer - dt);
      p.touchTimer = Math.max(0, p.touchTimer - dt);
      p.stunAnim = Math.max(0, p.stunAnim - dt * 1.5);
      p.holdTime = this.ball.owner === p ? p.holdTime + dt : 0;
      if (this.controlledBy[p.side] !== p) p.stamina = Math.min(1, p.stamina + dt / 4);
      p.kickAnim = Math.max(0, p.kickAnim - dt * 4);
      p.diveAnim = Math.max(0, p.diveAnim - dt * 1.4);
      p.trickAnim = Math.max(0, p.trickAnim - dt * 2.2);
      p.trickBoost = Math.max(0, p.trickBoost - dt);
      p.trickCooldown = Math.max(0, p.trickCooldown - dt);
      if (p.trickAnim <= 0) p.trickKind = null;
      const inp = inputs[p.side];
      if (inp && this.controlledBy[p.side] === p) this.driveHuman(p, inp, dt);
      else this.driveAI(p, dt);
    }
    this.integratePlayers(dt);
    this.updateFacing(dt);
    this.integrateBall(dt);
    this.settleDeadBall(dt);
    this.resolvePossession(dt);
    this.checkGoal();
    this.checkOut();
  }

  /**
   * Where players look. Whoever has the ball faces the way they dribble;
   * everyone else faces where they are running, or watches the ball when they
   * are standing or jogging. Turns are rate-limited so heads do not snap.
   */
  private updateFacing(dt: number): void {
    const b = this.ball;
    for (const p of this.players) {
      if (p.isKeeper || b.owner === p || p.diveAnim > 0) continue;
      const speed = len(p.vel);
      const want = speed > 1.6
        ? Math.atan2(p.vel.z, p.vel.x)
        : Math.atan2(b.pos.z - p.pos.z, b.pos.x - p.pos.x);
      let d = want - p.facing;
      d = Math.atan2(Math.sin(d), Math.cos(d));
      const maxTurn = 14 * dt;
      p.facing += clamp(d, -maxTurn, maxTurn);
    }
  }

  /** One penalty: set piece, kick, then wait for a goal, a save or the ball to die. */
  private stepShootout(dt: number, input: InputState, input2?: InputState): void {
    const so = this.shootout!;
    so.timer += dt;
    const inputs: [InputState | null, InputState | null] = [null, null];
    if (this.config.humanSide !== null) inputs[this.config.humanSide] = input;
    if (this.config.humanSide2 != null) inputs[this.config.humanSide2] = input2 ?? IDLE_INPUT;
    if (this.phase === 'setpiece' && this.setPiece) {
      this.setPiece.timer += dt;
      if (this.ball.owner !== this.setPiece.taker && this.setPiece.timer < 8) { this.ball.owner = this.setPiece.taker; this.ball.pos = v(this.setPiece.spot.x, this.setPiece.spot.z); this.ball.vel = v(); }
      if (this.setPiece.timer > 8) this.shoot(this.setPiece.taker, null, 1);
    }
    if (this.phase === 'play' && !so.kicked) { so.kicked = true; so.timer = 0; }
    const defending = (1 - so.taking) as Side;
    for (const p of this.players) {
      p.kickCooldown = Math.max(0, p.kickCooldown - dt);
      p.kickAnim = Math.max(0, p.kickAnim - dt * 4);
      p.diveAnim = Math.max(0, p.diveAnim - dt * 1.4);
      const inp = inputs[p.side];
      const keeper = p.isKeeper && p.side === defending;
      const taker = this.setPiece?.taker === p || (so.kicked && this.ball.lastKick === p);
      if (!keeper && !taker) { this.steer(p, v(), 30); continue; }
      if (inp && this.controlledBy[p.side] === p) {
        if (keeper) this.driveHumanKeeper(p, inp);
        else this.driveHuman(p, inp, dt);
      } else if (keeper) this.driveKeeper(p, dt);
      else this.driveAI(p, dt);
    }
    this.integratePlayers(dt);
    this.updateFacing(dt);
    this.integrateBall(dt);
    this.resolvePossession(dt);
    this.checkGoal();
    if (this.phase === 'goal') return; // checkGoal recorded it
    if (so.kicked && !so.resolved) {
      const b = this.ball;
      const dir = so.taking === 0 ? 1 : -1;
      const dead = (b.owner && b.owner.isKeeper) || (len(b.vel) < 0.8 && b.y < 0.05) || b.vel.x * dir < -1 || so.timer > 4.5 || this.isOut();
      if (dead) { this.resolveShootoutKick(false); this.phase = 'goal'; this.phaseTimer = 1.6; }
    }
  }

  /** The human keeper slides along the goal line and dives with the stick. */
  private driveHumanKeeper(p: SimPlayer, input: InputState): void {
    const own = this.ownGoalX(p.side);
    const dir = p.side === 0 ? 1 : -1;
    const z = input.moveZ;
    this.steer(p, v(0, z * this.stats.speed * 1.4), 30);
    p.pos.x = own + dir * 0.4;
    p.pos.z = clamp(p.pos.z, -this.goalWidth / 2 - 0.3, this.goalWidth / 2 + 0.3);
    p.facing = dir > 0 ? 0 : Math.PI;
    if (Math.abs(z) > 0.6 && p.diveAnim <= 0 && this.ball.owner !== p && len(this.ball.vel) > 3) { p.diveAnim = 1; p.diveDir = Math.sign(z); }
  }

  private advanceShootout(): void {
    const so = this.shootout!;
    if (!so.resolved) this.resolveShootoutKick(this.goals.length > 0 && this.goals[this.goals.length - 1].side === so.taking);
    if (this.shootoutDecided()) { this.phase = 'fulltime'; this.events.push({ type: 'fulltime' }); return; }
    this.setupPenalty((1 - so.taking) as Side);
  }

  private ballIsCalm(): boolean {
    // Don't blow the whistle mid-shot: wait until the ball is slow or owned.
    return this.ball.owner !== null || len(this.ball.vel) < 3;
  }

  // ---------- human ----------

  private updateControlledSelection(input: InputState, side: Side): void {
    const team = this.teamOf(side);
    const outfield = team.filter((p) => !p.isKeeper);
    const b = this.ball;
    const current = this.controlledBy[side];
    if (this.mode === 'tutorial' && this.tutorialHero) {
      this.controlledBy[side] = this.tutorialHero; // one player to learn with
      return;
    }
    if (this.phase === 'setpiece' && this.setPiece?.side === side) {
      this.controlledBy[side] = this.setPiece.taker; // you take your own throw-ins, corners and goal kicks
      return;
    }
    if (b.owner && b.owner.side === side) {
      this.controlledBy[side] = b.owner; // always control the player on the ball (keeper included)
      return;
    }
    if (input.switchPlayer && current) {
      // Jump to the team-mate nearest the ball (other than the current one) and keep them long
      // enough to actually use them before the automatic pick takes over again.
      const others = outfield.filter((p) => p !== current);
      const target = others.length ? this.nearest(others, b.pos) : current;
      this.controlledBy[side] = target ?? current;
      this.switchHolds[side] = 2.5;
      return;
    }
    this.switchHolds[side] = Math.max(0, this.switchHolds[side] - 1 / 60);
    if (this.switchHolds[side] > 0) return;
    // Auto-select the outfield player closest to where the ball is heading.
    const ahead = v(b.pos.x + b.vel.x * 0.4, b.pos.z + b.vel.z * 0.4);
    let best = current && !current.isKeeper ? current : outfield[0];
    let bestD = best ? dist(best.pos, ahead) - 0.8 : Infinity; // hysteresis favours current
    for (const p of outfield) {
      const d = dist(p.pos, ahead);
      if (d < bestD) { best = p; bestD = d; }
    }
    this.controlledBy[side] = best;
  }

  private driveHuman(p: SimPlayer, input: InputState, _dt: number): void {
    const sp = this.phase === 'setpiece' ? this.setPiece : null;
    if (sp && p === sp.taker) {
      if (sp.timer < sp.wait) { this.moveTowards(p, sp.stand, 1.1); return; } // walking over to the ball
      this.steer(p, v(), 30);
      // The taker may turn and kick, but not run off with the ball.
      const aimV = v(input.moveX, input.moveZ);
      const aim = len(aimV) > 0.05 ? aimV : null;
      if (aim) p.facing = Math.atan2(aimV.z, aimV.x);
      if (input.shootHeld) p.charge = Math.min(1, p.charge + _dt / 0.7);
      else if (p.charge > 0) { this.takeSetPiece(p, sp.kind, aim, true, p.charge); p.charge = 0; }
      else if (input.pass && sp.kind !== 'penalty') this.takeSetPiece(p, sp.kind, aim, false, 0);
      return;
    }
    // Everyone else can move about while a set piece is lined up (the ball is out of bounds to them).
    const want = v(input.moveX, input.moveZ);
    const l = len(want);
    const sprinting = input.sprint && l > 0.05 && p.stamina > 0.02;
    p.stamina = clamp(p.stamina + (sprinting ? -_dt / (3 * p.mul.stamina) : (_dt / 5) * p.mul.stamina), 0, 1);
    const sprint = sprinting ? 1.18 : 1;
    const dribble = this.ball.owner === p && p.trickBoost <= 0 ? 0.88 : 1;
    const max = this.stats.speed * sprint * dribble * this.pace(p) * this.trickPace(p);
    const target = l > 0.05 ? v(want.x * max, want.z * max) : v();
    if (l > 0.05) p.runDir = norm(want);
    this.steer(p, target, 22);
    if (l > 0.05 && this.ball.owner === p) p.facing = Math.atan2(want.z, want.x); // off the ball, updateFacing decides
    if (this.ball.owner === p) {
      // The ball is a step or two ahead between touches: a kick waits until it is back in range.
      const inReach = this.canKick(p);
      if (input.shootHeld) {
        p.charge = Math.min(1, p.charge + _dt / 0.7);
      } else if (!inReach) {
        if (input.pass) p.queued = 'pass';
        else if (input.trick) p.queued = 'trick';
      } else if (p.charge > 0) {
        // Released: a tap is a quick medium shot, a full hold is a rocket.
        this.shoot(p, l > 0.05 ? want : null, 0.7 + 0.45 * p.charge);
        p.charge = 0;
      } else if (input.pass || p.queued === 'pass') {
        this.pass(p, l > 0.05 ? want : null);
      } else if (input.trick || p.queued === 'trick') {
        this.trick(p, l > 0.05 ? want : null);
      }
      if (inReach) p.queued = null;
    } else {
      p.charge = 0;
      p.queued = null;
    }
  }

  // ---------- AI ----------

  private driveAI(p: SimPlayer, dt: number): void {
    const diff = this.diff;
    const isCpuTeam = !this.isHuman(p.side);
    p.think -= dt;
    const b = this.ball;
    const dir = p.side === 0 ? 1 : -1;
    const own = this.ownGoalX(p.side);
    const mates = this.teamOf(p.side);
    const opps = this.teamOf((1 - p.side) as Side);

    if (this.phase === 'setpiece' && this.setPiece) {
      const sp = this.setPiece;
      if (p !== sp.taker) {
        if (p.isKeeper) { this.driveKeeper(p, dt); return; }
        const t = sp.targets.get(p);
        if (t) this.moveTowards(p, t, 0.9); else this.steer(p, v(), 30);
        return;
      }
      if (sp.timer < sp.wait) { this.moveTowards(p, sp.stand, 1.1); return; }
      this.steer(p, v(), 30);
      if (sp.kind === 'penalty' || sp.kind === 'freekick') p.facing = Math.atan2(0 - p.pos.z, this.goalX(p.side) - p.pos.x);
      if (sp.timer < sp.wait + (sp.kind === 'throwin' ? 1.0 : sp.kind === 'goalkick' ? 1.2 : 1.6)) return;
      this.autoTake(p);
      return;
    }
    if (p.isKeeper) {
      this.driveKeeper(p, dt);
      return;
    }
    if (this.mode === 'tutorial') {
      // The tutorial team-mate waits on their spot and gives the ball straight back.
      if (b.owner === p) {
        const human = this.controlledBy[p.side];
        if (p.holdTime > 0.8 && human && human !== p) this.pass(p, v(human.pos.x - p.pos.x, human.pos.z - p.pos.z));
        this.steer(p, v(), 20);
      } else this.moveTowards(p, p.home, 0.8);
      return;
    }

    const teamHasBall = b.owner !== null && b.owner.side === p.side;
    const oppHasBall = b.owner !== null && b.owner.side !== p.side;

    if (b.owner === p) {
      // Carrier: make decisions a few times a second, when the ball is at their feet.
      if (!this.canKick(p)) {
        // Between touches: run on to the ball.
        const ahead = norm(v(p.aiTarget.x - b.pos.x, p.aiTarget.z - b.pos.z));
        this.moveTowards(p, v(b.pos.x + ahead.x * 0.3, b.pos.z + ahead.z * 0.3), (p.trickBoost > 0 ? 1 : 0.88) * this.trickPace(p));
        return;
      }
      if (p.think <= 0) {
        p.think = isCpuTeam ? diff.think : 0.3;
        const goal = v(this.goalX(p.side), 0);
        const dGoal = dist(p.pos, goal);
        const nearestOpp = this.nearest(opps, p.pos);
        const pressureNow = nearestOpp ? dist(nearestOpp.pos, p.pos) : 99;
        // Look a little ahead: a sprinter 2 m away is a problem in a third of a second.
        const pressureSoon = nearestOpp ? dist(v(nearestOpp.pos.x + nearestOpp.vel.x * 0.4, nearestOpp.pos.z + nearestOpp.vel.z * 0.4), v(p.pos.x + p.vel.x * 0.4, p.pos.z + p.vel.z * 0.4)) : 99;
        const pressure = Math.min(pressureNow, pressureSoon);
        const range = this.length * (isCpuTeam ? diff.shootRange : 0.38);
        const angleClear = Math.abs(p.pos.z) < this.width * 0.35;
        if (this.phase === 'kickoff') {
          const mate = this.bestPassTarget(p, null);
          if (mate) this.pass(p, v(mate.pos.x - p.pos.x, mate.pos.z - p.pos.z));
          return;
        }
        if (dGoal < range && angleClear && (pressure < 1.6 || dGoal < range * 0.6 || p.holdTime > 1.5)) {
          this.shoot(p, null, rand(0.85, 1.1));
          return;
        }
        const tight = pressure < 1.3 * this.stats.scale + 0.7;
        // Now and then a cornered dribbler tries a step-over or a nutmeg instead of passing.
        if (tight && p.trickCooldown <= 0 && Math.random() < (isCpuTeam ? 0.02 + 0.025 * diff.accuracy : 0.03)) {
          this.trick(p, null);
          const g = norm(v(goal.x - p.pos.x, goal.z - p.pos.z));
          p.aiTarget = v(p.pos.x + g.x * 3, p.pos.z + g.z * 3);
          return;
        }
        if (tight || p.holdTime > 0.7) {
          const mate = this.bestPassTarget(p, null);
          const forward = mate ? (mate.pos.x - p.pos.x) * (p.side === 0 ? 1 : -1) : -99;
          const worthIt = mate !== null && (tight ? Math.random() < 0.8 : forward > 3 && Math.random() < 0.35);
          if (worthIt && mate) {
            this.pass(p, v(mate.pos.x - p.pos.x, mate.pos.z - p.pos.z));
            return;
          }
        }
        // Dribble towards goal, steering around the nearest opponent.
        let aim = norm(v(goal.x - p.pos.x, goal.z - p.pos.z));
        if (nearestOpp && pressure < 3) {
          const away = norm(v(p.pos.x - nearestOpp.pos.x, p.pos.z - nearestOpp.pos.z));
          aim = norm(v(aim.x + away.x * 0.9, aim.z + away.z * 0.9));
        }
        // Stay inside the lines now that the ball can go out.
        p.aiTarget = v(clamp(p.pos.x + aim.x * 3, -this.length / 2 + 0.9, this.length / 2 - 0.9), clamp(p.pos.z + aim.z * 3, -this.width / 2 + 1.1, this.width / 2 - 1.1));
      }
      this.moveTowards(p, p.aiTarget, (p.trickBoost > 0 ? 1 : 0.88) * this.trickPace(p));
      return;
    }

    if (p.think <= 0) {
      p.think = isCpuTeam ? diff.think : 0.25;
      const chaser = this.nearestOutfield(mates, b.pos);
      const ballLoose = b.owner === null;
      if ((ballLoose || oppHasBall) && chaser === p && this.phase !== 'kickoff') {
        // Chase the ball: run to the point where we can meet it.
        p.aiTarget = oppHasBall ? v(b.pos.x + b.vel.x * 0.6, b.pos.z + b.vel.z * 0.6) : this.interceptPoint(p);
      } else if (teamHasBall) {
        // Support: push up and offer a passing lane.
        const carrier = b.owner!;
        const sideSign = p.home.z >= 0 ? 1 : -1;
        const up = dir * ({ ATT: 5, WING: 4.5, MID: 3, DEF: 2, GK: 2 } as Record<Position, number>)[p.role] * this.stats.scale;
        // Wingers hug the touchline to stretch the play; everyone else offers a lane inside.
        const lane = p.role === 'WING' ? 0.4 : p.role === 'MID' ? 0.18 : 0.28;
        p.aiTarget = v(
          clamp(carrier.pos.x + up, -this.length / 2 + 2, this.length / 2 - 2),
          clamp(sideSign * this.width * lane + (carrier.pos.z * 0.2), -this.width / 2 + 1, this.width / 2 - 1),
        );
        if (p.role === 'DEF') p.aiTarget.x = clamp(p.home.x + (b.pos.x - p.home.x) * 0.5, -this.length / 2 + 2, this.length / 2 - 2);
      } else {
        // Defend: drop between the ball and our goal, near the formation spot.
        const toBall = v(b.pos.x - p.home.x, b.pos.z - p.home.z);
        const shift = p.role === 'DEF' ? 0.35 : p.role === 'MID' ? 0.45 : 0.55;
        p.aiTarget = v(p.home.x + toBall.x * shift, p.home.z + toBall.z * shift);
        const carrier = b.owner;
        const inOurHalf = carrier !== null && (carrier.pos.x - 0) * dir < 0;
        if (carrier && inOurHalf && p.role === 'DEF') {
          // Get goal-side of the dribbler and close them down.
          const toGoal = norm(v(own - carrier.pos.x, 0 - carrier.pos.z));
          const gap = dist(carrier.pos, p.pos) < 4 ? 0.6 : 1.6;
          p.aiTarget = v(carrier.pos.x + toGoal.x * gap, carrier.pos.z + toGoal.z * gap + (p.home.z >= 0 ? 0.4 : -0.4));
        } else if (carrier && inOurHalf && p.role === 'MID') {
          // Midfielders get back between the ball and our goal to cut out the pass.
          p.aiTarget = v(clamp(carrier.pos.x - dir * 2, -this.length / 2 + 2, this.length / 2 - 2), p.home.z * 0.4 + carrier.pos.z * 0.5);
        } else if (carrier && inOurHalf) {
          // Attackers drop back to the halfway line to help; wingers stay out wide.
          p.aiTarget = v(clamp(carrier.pos.x + dir * 3, -this.length / 2 + 2, this.length / 2 - 2), p.role === 'WING' ? p.home.z * 0.85 : p.home.z * 0.6 + carrier.pos.z * 0.3);
        } else {
          // Mark the nearest opponent if they are close to our goal.
          const danger = opps.filter((o) => !o.isKeeper && Math.abs(o.pos.x - own) < this.length * 0.4);
          const m = this.nearest(danger, p.pos);
          if (m && p.role === 'DEF' && dist(m.pos, p.pos) < 5) {
            p.aiTarget = v(m.pos.x + (own - m.pos.x) * 0.25, m.pos.z + (0 - m.pos.z) * 0.25);
          }
        }
      }
      if (this.phase === 'kickoff' && !(this.kickoffSide === p.side && this.ball.owner === null)) {
        // Hold formation until the ball moves.
        p.aiTarget = v(p.home.x, p.home.z);
      }
    }
    const chaser = oppHasBall && this.nearestOutfield(this.teamOf(p.side), b.pos) === p;
    this.moveTowards(p, p.aiTarget, chaser ? 1.12 : 1);
  }

  /** Keeper with the ball (or taking a goal kick): roll it to an open team-mate, or boot it upfield. */
  private keeperDistribute(p: SimPlayer, pressed: boolean): void {
    const opps = this.teamOf((1 - p.side) as Side);
    const dir = p.side === 0 ? 1 : -1;
    const presser = this.nearest(opps, p.pos);
    const mate = this.bestPassTarget(p, null);
    const mateMarked = mate ? dist(this.nearest(opps, mate.pos)?.pos ?? v(99, 99), mate.pos) < 3 : true;
    if (mate && !mateMarked && !pressed) {
      this.pass(p, v(mate.pos.x - p.pos.x, mate.pos.z - p.pos.z), 1.1);
    } else {
      // Big clearance upfield, away from whoever is closest.
      const awayZ = presser ? Math.sign(p.pos.z - presser.pos.z) || 1 : (Math.random() < 0.5 ? -1 : 1);
      const boot = Math.sqrt(p.mul.strength); // Strength: a longer clearance
      this.kick(p, v(dir, awayZ * rand(0.2, 0.6)), this.stats.power * 0.95 * boot, this.stats.power * 0.35 * boot);
    }
  }

  private driveKeeper(p: SimPlayer, dt: number): void {
    const b = this.ball;
    const own = this.ownGoalX(p.side);
    const dir = p.side === 0 ? 1 : -1;
    const reach = this.stats.keeperReach;
    if (b.owner === p) {
      // Hold for a moment, then throw to the most open team-mate. Pressed keepers release at once.
      p.think -= dt;
      const opps = this.teamOf((1 - p.side) as Side);
      const presser = this.nearest(opps, p.pos);
      const pressed = presser !== null && dist(presser.pos, p.pos) < 3.5;
      if (pressed) p.think = Math.min(p.think, 0.15);
      if (p.think <= 0) {
        this.keeperDistribute(p, pressed);
        p.think = 1;
      }
      this.steer(p, v(), 20);
      return;
    }
    const toGoal = b.vel.x * dir < -0.5; // ball travelling towards our goal
    const towardsUs = Math.abs(b.pos.x - own) < this.length * 0.5;
    // Positioning: a good keeper follows the ball across the goal and narrows the angle.
    let targetZ = clamp(b.pos.z * clamp(0.6 * p.mul.angle, 0.3, 0.85), -this.goalWidth / 2 + 0.3, this.goalWidth / 2 - 0.3);
    let targetX = own + dir * 0.7;
    const t = toGoal ? Math.abs((p.pos.x - b.pos.x) / (b.vel.x || 1e-6)) : 99;
    if (b.penaltyShot && toGoal) {
      // Penalty: commit to a side at the kick and dive that way (usually the right one).
      const predZ = b.pos.z + b.vel.z * t;
      if (p.penaltyGuess === 0) {
        const right = Math.random() < (this.isHuman((1 - p.side) as Side) ? 0.5 : 0.55);
        p.penaltyGuess = (Math.sign(predZ) || 1) * (right ? 1 : -1);
      }
      targetZ = p.penaltyGuess * this.goalWidth * 0.4;
      if (p.diveAnim <= 0 && t < 0.7) { p.diveAnim = 1; p.diveDir = p.penaltyGuess; }
    } else if (toGoal && t < 1.4 && towardsUs) {
      // Predict where the ball crosses the keeper's line and go there.
      const predZ = b.pos.z + b.vel.z * t;
      targetZ = clamp(predZ, -this.goalWidth / 2 - 0.4, this.goalWidth / 2 + 0.4);
      if (Math.abs(predZ - p.pos.z) > reach * 0.45 && p.diveAnim <= 0 && t < 0.8) {
        p.diveAnim = 1;
        p.diveDir = Math.sign(predZ - p.pos.z) || 1;
      }
    } else if (this.phase !== 'setpiece' && b.owner && b.owner.side !== p.side && Math.abs(b.owner.pos.x - own) < 6 && Math.abs(b.owner.pos.z) < this.goalWidth) {
      // A dribbler is bearing down on goal: come out to narrow the angle if no defender is on them.
      const defender = this.nearest(this.teamOf(p.side).filter((m) => !m.isKeeper), b.owner.pos);
      if (!defender || dist(defender.pos, b.owner.pos) > 1.5) {
        const out = clamp(Math.abs(b.owner.pos.x - own) * 0.45 * p.mul.angle, 0.7, 2.6 * p.mul.angle);
        targetX = own + dir * out;
        targetZ = clamp(b.owner.pos.z * 0.5, -this.goalWidth / 2, this.goalWidth / 2);
      }
    } else if (this.mode !== 'tutorial' && b.owner === null && len(b.vel) < 4 && dist(b.pos, p.pos) < 3 * this.stats.scale && Math.abs(b.pos.x - own) < 4.5) {
      // Come and collect a slow loose ball near the goal if we are closest to it.
      const opp = this.nearest(this.teamOf((1 - p.side) as Side), b.pos);
      if (!opp || dist(opp.pos, b.pos) > dist(p.pos, b.pos)) { targetX = b.pos.x; targetZ = b.pos.z; }
    }
    const speed = p.diveAnim > 0 ? 1.6 : 1.1;
    this.moveTowards(p, v(targetX, targetZ), speed);
    p.facing = Math.atan2(b.pos.z - p.pos.z, b.pos.x - p.pos.x);
  }

  /** Earliest point on the ball's path that this player can reach. */
  private interceptPoint(p: SimPlayer): V2 {
    const b = this.ball;
    const speed = len(b.vel);
    if (speed < 0.5) return v(b.pos.x, b.pos.z);
    const dir = norm(b.vel);
    const run = this.stats.speed * p.speedMul;
    const decel = 3.2;
    for (let t = 0.05; t <= 2.5; t += 0.1) {
      const sp = Math.max(0, speed - decel * t);
      const travelled = (speed + sp) / 2 * Math.min(t, speed / decel);
      const pt = v(b.pos.x + dir.x * travelled, b.pos.z + dir.z * travelled);
      if (dist(p.pos, pt) <= run * t + 0.3) return pt;
    }
    const stopD = (speed * speed) / (2 * decel);
    return v(b.pos.x + dir.x * stopD, b.pos.z + dir.z * stopD);
  }

  private nearest(list: SimPlayer[], pos: V2): SimPlayer | null {
    let best: SimPlayer | null = null, bd = Infinity;
    for (const p of list) { const d = dist(p.pos, pos); if (d < bd) { bd = d; best = p; } }
    return best;
  }
  private nearestOutfield(list: SimPlayer[], pos: V2): SimPlayer | null {
    return this.nearest(list.filter((p) => !p.isKeeper), pos);
  }

  /** Team-mate who is most open and furthest forward, within passing distance. */
  private bestPassTarget(from: SimPlayer, aim: V2 | null): SimPlayer | null {
    const mates = this.teamOf(from.side).filter((m) => m !== from && !m.isKeeper);
    const opps = this.teamOf((1 - from.side) as Side);
    const dir = from.side === 0 ? 1 : -1;
    let best: SimPlayer | null = null, bestScore = -Infinity;
    for (const m of mates) {
      const d = dist(m.pos, from.pos);
      if (d < 1.5 || d > this.length * 0.6) continue;
      const lane = norm(v(m.pos.x - from.pos.x, m.pos.z - from.pos.z));
      let blocked = 0;
      for (const o of opps) {
        const rel = v(o.pos.x - from.pos.x, o.pos.z - from.pos.z);
        const along = rel.x * lane.x + rel.z * lane.z;
        if (along > 0 && along < d) {
          const perp = Math.abs(rel.x * lane.z - rel.z * lane.x);
          if (perp < 1.2) blocked += 1;
        }
      }
      const openness = opps.reduce((acc, o) => acc + Math.min(dist(o.pos, m.pos), 6), 0);
      let score = openness - blocked * 12 - d * 0.3 + (m.pos.x - from.pos.x) * dir * 0.6;
      if (aim) {
        const dot = lane.x * aim.x + lane.z * aim.z;
        score += dot * 15; // strongly prefer the direction the human is pointing
        if (dot < 0.2) score -= 20;
      }
      if (score > bestScore) { bestScore = score; best = m; }
    }
    return best;
  }

  // ---------- movement ----------

  private steer(p: SimPlayer, targetVel: V2, accel: number): void {
    const dx = targetVel.x - p.vel.x, dz = targetVel.z - p.vel.z;
    const d = Math.hypot(dx, dz);
    const step = accel / 60;
    if (d <= step) p.vel = v(targetVel.x, targetVel.z);
    else p.vel = v(p.vel.x + (dx / d) * step, p.vel.z + (dz / d) * step);
  }

  private moveTowards(p: SimPlayer, target: V2, speedMul: number): void {
    const to = v(target.x - p.pos.x, target.z - p.pos.z);
    const d = len(to);
    const max = this.stats.speed * speedMul * this.pace(p) * (p.isKeeper ? 0.95 : 1);
    const slow = Math.min(1, d / 0.8);
    const n = norm(to);
    if (d > 0.05) p.runDir = n;
    this.steer(p, v(n.x * max * slow, n.z * max * slow), 18);
    if (d > 0.2 && !p.isKeeper && this.ball.owner === p) p.facing = Math.atan2(n.z, n.x); // others look via updateFacing
  }

  /**
   * Running pace multiplier: Speed stars, the Speedy perk and difficulty, less
   * a little tiredness as the match wears on. Good Stamina keeps more of it.
   */
  pace(p: SimPlayer): number {
    const late = this.mode === 'match' ? clamp(this.clock / (this.config.halfSeconds * 2), 0, 1) : 0;
    return p.speedMul * (1 - (0.05 * late) / p.mul.stamina);
  }

  /** How far a foot reaches from the body to play the ball. */
  private footReach(): number { return 0.3 * this.stats.scale + 0.25; }
  /** Centre-to-centre distance at which a dribbler takes their next touch. */
  private touchRange(p: SimPlayer): number { return p.radius + this.ball.radius + 0.1; }

  /** The ball is close enough to the dribbler's feet to shoot, pass or trick. */
  canKick(p: SimPlayer): boolean {
    const b = this.ball;
    if (b.owner !== p || p.isKeeper || this.phase === 'setpiece' || this.phase === 'kickoff') return b.owner === p;
    return dist(p.pos, b.pos) < this.touchRange(p) + 0.35 * this.stats.scale + 0.15;
  }

  /**
   * One dribbling touch: knock the ball ahead so the dribbler runs on to it.
   * It travels further at a sprint and stays closer with good Dribbling, and
   * little ones are a bit wilder with it. The gap is what a defender can nick.
   */
  private dribbleTouch(o: SimPlayer, dir: V2, speed: number): void {
    const b = this.ball;
    const base = this.stats.speed * o.speedMul;
    const sprintF = clamp(1 + (speed / base - 0.88) * 2.5, 0.55, 1.6);
    // A stretch to steer a ball that is already out in front is a gentler nudge.
    const already = Math.max(0, dist(o.pos, b.pos) - this.touchRange(o));
    const gap = Math.max(0.08, (0.3 + 0.35 * this.stats.scale) * (1.35 - 0.5 * this.stats.control) * sprintF * o.mul.touchDist - already);
    const decel = 3.2 + 0.06 * speed;
    const kickSpeed = speed + Math.sqrt(2 * decel * gap);
    const wobble = (1 - this.stats.control) * 0.3 * o.mul.touchDist;
    const a = Math.atan2(dir.z, dir.x) + rand(-wobble, wobble);
    b.vel = v(Math.cos(a) * kickSpeed, Math.sin(a) * kickSpeed);
    b.lastTouch = o;
    o.touchTimer = 0.2;
    o.kickAnim = Math.max(o.kickAnim, 0.3);
    this.events.push({ type: 'touch', side: o.side, player: o.info });
  }

  private integratePlayers(dt: number): void {
    // Players may step just over the lines (to take a throw-in or a corner), but not into the boards.
    const out = this.mode === 'match' ? 0.6 : -0.3;
    const L = this.length / 2 + out, W = this.width / 2 + out;
    for (const p of this.players) {
      p.pos.x += p.vel.x * dt;
      p.pos.z += p.vel.z * dt;
      p.distanceRun += len(p.vel) * dt;
      // Keep inside the boards (keepers may stand inside the goal mouth).
      const extra = p.isKeeper ? this.goalDepth * 0.5 : 0;
      p.pos.x = clamp(p.pos.x, -L - extra, L + extra);
      p.pos.z = clamp(p.pos.z, -W, W);
    }
    if (this.phase === 'kickoff') {
      // The receiving team waits outside the centre circle until the ball is kicked.
      const radius = 3 * Math.max(0.8, this.stats.scale) + 0.5;
      for (const p of this.players) {
        if (p.side === this.kickoffSide) continue;
        const d = len(p.pos);
        if (d < radius) {
          const n = d > 1e-3 ? norm(p.pos) : v(p.side === 0 ? -1 : 1, 0);
          const stepOut = Math.min(radius - d, 7 * dt);
          p.pos.x += n.x * stepOut; p.pos.z += n.z * stepOut;
        }
      }
    }
    if (this.phase === 'setpiece' && this.setPiece) {
      const sp = this.setPiece;
      // Opponents keep their distance: out of the box for penalties and goal kicks, a few steps back otherwise.
      const box = this.width * 0.26 + 0.8;
      const centre = sp.kind === 'penalty' ? v(this.goalX(sp.side), 0) : sp.kind === 'goalkick' ? v(this.ownGoalX(sp.side), 0) : sp.spot;
      const radius = sp.kind === 'penalty' || sp.kind === 'goalkick' ? box : sp.kind === 'throwin' ? 2 : 3;
      const defendingKeeper = this.teamOf((1 - sp.side) as Side).find((k) => k.isKeeper);
      for (const p of this.players) {
        if (p === sp.taker || p === defendingKeeper) continue;
        if (sp.kind !== 'penalty' && p.side === sp.side) continue;
        const d = dist(p.pos, centre);
        if (d < radius) {
          const n = d > 1e-3 ? norm(v(p.pos.x - centre.x, p.pos.z - centre.z)) : v(sp.side === 0 ? -1 : 1, 0);
          const stepOut = Math.min(radius - d, 7 * dt);
          p.pos.x += n.x * stepOut; p.pos.z += n.z * stepOut;
          p.pos.x = clamp(p.pos.x, -L, L); p.pos.z = clamp(p.pos.z, -W, W);
        }
      }
    }
    // Push overlapping players apart.
    for (let i = 0; i < this.players.length; i++) {
      for (let j = i + 1; j < this.players.length; j++) {
        const a = this.players[i], b = this.players[j];
        const d = dist(a.pos, b.pos);
        const min = a.radius + b.radius;
        if (d < min && d > 1e-4) {
          // The stronger kid gives less ground in a bump.
          const overlap = min - d;
          const share = b.mul.strength / (a.mul.strength + b.mul.strength);
          const n = norm(v(b.pos.x - a.pos.x, b.pos.z - a.pos.z));
          a.pos.x -= n.x * overlap * share; a.pos.z -= n.z * overlap * share;
          b.pos.x += n.x * overlap * (1 - share); b.pos.z += n.z * overlap * (1 - share);
        }
      }
    }
  }

  private integrateBall(dt: number): void {
    const b = this.ball;
    if (b.owner && this.phase === 'setpiece' && this.setPiece?.kind === 'throwin' && this.setPiece.taker === b.owner) {
      // Throw-in: the ball is held up over the taker's head.
      const o = b.owner;
      b.pos = v(o.pos.x + Math.cos(o.facing) * 0.08, o.pos.z + Math.sin(o.facing) * 0.08);
      b.vel = v(); b.vy = 0;
      b.y = Math.min(b.y + 8 * dt, this.throwHeight());
      return;
    }
    if (b.owner) {
      const o = b.owner;
      const speed = len(o.vel);
      const ahead = 0.3 * this.stats.scale + 0.15;
      const feet = v(o.pos.x + Math.cos(o.facing) * ahead, o.pos.z + Math.sin(o.facing) * ahead);
      const toFeet = dist(b.pos, feet);
      // Keepers hold it, set-piece takers and kick-off takers stand on it, and a kid
      // who stops with the ball nearby traps it under their foot.
      const held = o.isKeeper || this.phase === 'setpiece' || this.phase === 'kickoff';
      if (held || (speed < 0.9 && toFeet < this.footReach() * 1.6)) {
        const gain = held ? 18 : 9;
        b.vel = v((feet.x - b.pos.x) * gain, (feet.z - b.pos.z) * gain);
        b.pos.x += b.vel.x * dt;
        b.pos.z += b.vel.z * dt;
        b.y = Math.max(0, b.y - 6 * dt);
        b.vy = 0;
        b.spin += len(b.vel) * dt / b.radius;
        return;
      }
      // Dribbling: the ball rolls free between touches.
      const want = o.runDir;
      const d = dist(o.pos, b.pos);
      const along = b.vel.x * want.x + b.vel.z * want.z;
      const ballSpeed = len(b.vel);
      const offLine = ballSpeed > 0.3 && along < ballSpeed * 0.85; // rolling a different way from the run
      // A touch when the run catches the ball up, or a longer stretch to steer it round a turn.
      const catchUp = d < this.touchRange(o) && along < speed * 1.05;
      const turn = offLine && d < this.touchRange(o) + 0.35 * this.stats.scale + 0.15;
      if (o.touchTimer <= 0 && b.y < 0.3 && (catchUp || turn)) {
        this.dribbleTouch(o, want, speed);
      } else if (d > 1.6 + 1.6 * this.stats.scale) {
        // Knocked too far, or the dribbler ran off without it: it is anyone's ball.
        b.owner = null;
      }
    }
    // Free ball: gravity, bounce, rolling friction and air drag.
    b.vy -= 9.81 * dt;
    b.y += b.vy * dt;
    if (b.y <= 0) {
      b.y = 0;
      if (b.vy < -0.5) b.vy = -b.vy * 0.55; else b.vy = 0;
    }
    const speed = len(b.vel);
    const onGround = b.y < 0.01;
    const friction = onGround ? 3.2 : 0.4;
    const drag = 0.06;
    const newSpeed = Math.max(0, speed - (friction + drag * speed) * dt);
    if (speed > 1e-4) b.vel = v((b.vel.x / speed) * newSpeed, (b.vel.z / speed) * newSpeed);
    b.pos.x += b.vel.x * dt;
    b.pos.z += b.vel.z * dt;
    b.spin += newSpeed * dt / b.radius;
    // Rebound boards all round, set back from the lines in a match so the ball can go out of play.
    const L = this.length / 2, W = this.width / 2, r = b.radius;
    const sideBoard = W + (this.mode === 'match' ? RUNOFF_SIDE : 0), endBoard = L + (this.mode === 'match' ? RUNOFF_END : 0);
    if (b.pos.z > sideBoard - r) { b.pos.z = sideBoard - r; b.vel.z = -Math.abs(b.vel.z) * 0.55; }
    if (b.pos.z < -sideBoard + r) { b.pos.z = -sideBoard + r; b.vel.z = Math.abs(b.vel.z) * 0.55; }
    const inMouth = Math.abs(b.pos.z) < this.goalWidth / 2 - r && b.y < this.goalHeight - r;
    if (!inMouth) {
      if (b.pos.x > endBoard - r) { b.pos.x = endBoard - r; b.vel.x = -Math.abs(b.vel.x) * 0.55; }
      if (b.pos.x < -endBoard + r) { b.pos.x = -endBoard + r; b.vel.x = Math.abs(b.vel.x) * 0.55; }
    } else {
      // Inside the goal: the net catches it.
      const back = L + this.goalDepth - r;
      if (b.pos.x > back) { b.pos.x = back; b.vel.x = -Math.abs(b.vel.x) * 0.2; b.vel.z *= 0.3; }
      if (b.pos.x < -back) { b.pos.x = -back; b.vel.x = Math.abs(b.vel.x) * 0.2; b.vel.z *= 0.3; }
      // Posts: clamp z inside the goal once past the line.
      if (Math.abs(b.pos.x) > L) {
        const gz = this.goalWidth / 2 - r;
        if (b.pos.z > gz) { b.pos.z = gz; b.vel.z = -Math.abs(b.vel.z) * 0.4; }
        if (b.pos.z < -gz) { b.pos.z = -gz; b.vel.z = Math.abs(b.vel.z) * 0.4; }
      }
    }
    // Crossbar: a ball above goal height at the line bounces back.
    if (Math.abs(b.pos.x) > L - r && Math.abs(b.pos.x) < L + r && Math.abs(b.pos.z) < this.goalWidth / 2 && b.y >= this.goalHeight - r && b.y < this.goalHeight + r) {
      b.vel.x *= -0.6; b.vy = -Math.abs(b.vy) * 0.5;
    }
  }

  private resolvePossession(dt: number): void {
    const b = this.ball;
    if (this.phase === 'goal') return;
    const controlR = 0.5 * this.stats.scale + 0.25;
    if (this.phase === 'setpiece') return;
    if (b.owner) {
      const o = b.owner;
      if (o.isKeeper && this.phase !== 'kickoff') return; // a keeper holding the ball cannot be tackled
      if (this.mode === 'tutorial') return; // nobody tackles while you learn
      // Between touches the ball is away from the dribbler's feet, and anyone can nick it.
      const exposed = dist(o.pos, b.pos) > this.touchRange(o) + 0.15;
      for (const p of this.players) {
        if (p.side === o.side || p.kickCooldown > 0) continue;
        const d = dist(p.pos, b.pos);
        if (exposed && p.tackleTimer <= 0) {
          const kr = this.stats.keeperReach * (p.info.special === 'keeper' ? 1.25 : 1) * p.mul.reach;
          const reach = p.isKeeper ? kr * 0.55 : controlR;
          if (d < reach && b.y < 0.6 * this.stats.scale + 0.2) {
            const isCpu = !this.isHuman(p.side);
            p.tackleTimer = isCpu ? 0.3 : 0.4;
            const chance = (p.isKeeper ? 0.9 * p.mul.catch : 0.45 * p.mul.tackle) * (isCpu ? this.diff.tackle : this.diff.humanTackle) * (0.7 + this.stats.control * 0.4);
            if (Math.random() < chance) {
              // Nicked off the dribbler's toe.
              if (!p.isKeeper) p.match.tackles++;
              b.assist = null;
              b.wasPass = false;
              b.owner = p;
              b.lastTouch = p;
              b.vel = v(p.vel.x, p.vel.z);
              o.kickCooldown = 0.4;
              p.holdTime = 0;
              p.think = p.isKeeper ? 0.8 : 0.1;
              return;
            }
          }
          continue;
        }
        if (d < controlR * 0.95) {
          const isCpu = !this.isHuman(p.side);
          const diff = this.diff;
          const base = p.isKeeper ? 0.95 : 0.5;
          // Tackling head-on is much easier than chasing from behind.
          const toBall = norm(v(b.pos.x - p.pos.x, b.pos.z - p.pos.z));
          const facingDot = toBall.x * Math.cos(o.facing) + toBall.z * Math.sin(o.facing);
          const angle = facingDot < 0 ? 1 : isCpu ? 0.35 : 0.22; // negative = we are in front of the dribbler
          // Strength: a strong dribbler shrugs off a weak tackler, and the other way round.
          const bump = clamp(1 + (p.mul.strength - o.mul.strength) * 0.8, 0.6, 1.4);
          const chance = base * angle * (isCpu ? diff.tackle : diff.humanTackle) * (0.6 + this.stats.control * 0.6) * p.mul.tackle * bump;
          if (p.tackleTimer <= 0) {
            p.tackleTimer = isCpu ? 0.45 : 0.6;
            const won = Math.random() < chance;
            if (!won && facingDot >= 0 && len(p.vel) > 2.5 && this.phase === 'play' && Math.random() < 0.28) {
              this.awardFoul(p, o);
              return;
            }
            if (won) {
              // Ball changes hands and squirts loose a little.
              p.match.tackles++;
              b.assist = null;
              b.owner = null;
              o.kickCooldown = 0.5;
              o.stunAnim = 1;
              const n = norm(v(p.pos.x - o.pos.x, p.pos.z - o.pos.z));
              b.vel = v(n.x * 2.5 + p.vel.x * 0.5, n.z * 2.5 + p.vel.z * 0.5);
              b.lastTouch = p;
              return;
            }
          }
        }
      }
      return;
    }
    // Loose ball: the closest eligible player within reach controls it.
    let best: SimPlayer | null = null, bd = Infinity;
    for (const p of this.players) {
      if (p.kickCooldown > 0) continue;
      const d = dist(p.pos, b.pos);
      const kr = this.stats.keeperReach * (p.info.special === 'keeper' ? 1.25 : 1) * p.mul.reach;
      const reach = p.isKeeper ? (p.diveAnim > 0 ? kr : kr * 0.55) : controlR;
      const maxHeight = p.isKeeper ? this.goalHeight : 0.6 * this.stats.scale + 0.2;
      // In a 50/50 the stronger kid gets there first.
      const eff = p.isKeeper ? d : d / Math.sqrt(p.mul.strength);
      if (d < reach && b.y < maxHeight && eff < bd) { bd = eff; best = p; }
    }
    if (best) {
      const ballSpeed = len(b.vel);
      if (best.isKeeper && ballSpeed > 3.5) {
        // One save attempt per shot, judged at the ball's closest approach. Comfortable
        // balls are caught; the rest is a dive whose odds fall with distance and shot speed.
        if (b.keeperTried === b.flightId) return;
        const reach = this.stats.keeperReach * (best.info.special === 'keeper' ? 1.25 : 1) * best.mul.reach;
        const easy = reach * 0.5;
        const rel = v(b.pos.x - best.pos.x, b.pos.z - best.pos.z);
        const closing = rel.x * b.vel.x + rel.z * b.vel.z < 0;
        if (closing && bd > easy * 0.6) return; // still getting closer: wait for the nearest point
        b.keeperTried = b.flightId;
        const speedFactor = clamp(1.5 - (0.7 * ballSpeed) / this.stats.power, 0.4, 1);
        let pSave = bd < easy ? 0.97 * Math.max(speedFactor, 0.75) : clamp(1 - (bd - easy) / (reach - easy), 0, 1) * speedFactor;
        if (b.penaltyShot) pSave *= bd < easy ? 0.6 : 0.45; // even a keeper who guessed right can be beaten
        pSave *= best.mul.save;
        if (this.mode === 'tutorial') pSave *= 0.4; // the tutorial keeper lets most shots in
        if (Math.random() > pSave) return; // beaten
        best.match.saves++;
        this.events.push({ type: 'save', side: best.side, player: best.info });
        const dir = best.side === 0 ? 1 : -1; // away from our own goal
        // Good Handling catches more; the rest are parried.
        if (bd > easy * best.mul.catch || ballSpeed > this.stats.power * 1.05 * best.mul.catch) {
          // Parry: the ball flies back out towards the pitch, not into the net.
          let sideways = Math.sign(b.pos.z - best.pos.z) || (Math.random() < 0.5 ? -1 : 1);
          if (this.mode === 'match' && Math.random() < 0.4) {
            // Tipped round the post: out over the goal line for a corner.
            sideways = Math.sign(b.pos.z) || sideways;
            b.vel = v(-dir * ballSpeed * rand(0.25, 0.4), sideways * ballSpeed * rand(0.5, 0.7));
          } else b.vel = v(dir * ballSpeed * rand(0.15, 0.35), sideways * ballSpeed * rand(0.45, 0.7));
          b.vy = rand(1, 3);
          best.kickCooldown = 0.35;
          best.diveAnim = Math.max(best.diveAnim, 0.9);
          best.diveDir = sideways;
          b.lastTouch = best;
          return;
        }
      } else {
        // Fast balls are harder to bring under control.
        const skill = clamp(this.stats.control + best.mul.touch, 0.05, 0.98); // Dribbling: a soft first touch
        const hard = ballSpeed > 7 * (0.5 + skill);
        if (hard && Math.random() < (1 - skill) * 0.6) {
          // Fluffed touch: ball deflects.
          b.vel = v(b.vel.x * 0.45 + rand(-1.5, 1.5), b.vel.z * 0.45 + rand(-1.5, 1.5));
          if (b.vy < 0) b.vy = 0;
          best.kickCooldown = 0.25;
          b.lastTouch = best;
          return;
        }
      }
      // A pass that reaches a team-mate counts, and sets up a possible assist.
      const from = b.lastKick;
      if (from && from.side === best.side && from !== best && b.wasPass) { from.match.passes++; b.assist = from; }
      else if (!from || from.side !== best.side) b.assist = null;
      b.wasPass = false;
      b.owner = best;
      b.lastTouch = best;
      b.vy = 0; b.y = 0;
      // A controlled first touch: the ball is cushioned to the receiver's pace.
      b.vel = v(best.vel.x, best.vel.z);
      best.touchTimer = 0;
      best.think = best.isKeeper ? 0.8 : 0.1;
      if (this.phase === 'kickoff' && best.side !== this.kickoffSide) this.phase = 'play';
    }
    void dt;
  }

  private kick(p: SimPlayer, dir: V2, speed: number, loft: number): void {
    const b = this.ball;
    const n = norm(dir);
    b.owner = null;
    b.vel = v(n.x * speed, n.z * speed);
    b.vy = loft;
    b.lastTouch = p;
    b.lastKick = p;
    b.flightId++;
    b.penaltyShot = false;
    b.wasPass = false;
    p.kickCooldown = 0.35;
    p.kickAnim = 1;
    p.facing = Math.atan2(n.z, n.x);
    if (this.phase === 'kickoff') this.phase = 'play';
    if (this.phase === 'setpiece') { this.phase = 'play'; this.setPiece = null; }
    this.events.push({ type: 'kick', side: p.side, player: p.info });
  }

  /** A clumsy tackle from behind: free kick, or a penalty inside the D. */
  private awardFoul(offender: SimPlayer, victim: SimPlayer): void {
    const side = victim.side;
    const goal = v(this.goalX(side), 0);
    const penalty = dist(victim.pos, goal) < this.width * 0.26;
    this.fouls[offender.side]++;
    const dir = side === 0 ? 1 : -1;
    const spot = penalty ? v(goal.x - dir * (this.width * 0.26 + 0.6), 0) : v(victim.pos.x, victim.pos.z);
    let taker = victim;
    if (penalty && victim.isKeeper) taker = this.forwards(this.teamOf(side))[0] ?? victim;
    const b = this.ball;
    b.owner = taker;
    b.pos = v(spot.x, spot.z);
    b.vel = v(); b.vy = 0; b.y = 0;
    taker.pos = v(spot.x - dir * 0.5, spot.z);
    taker.vel = v();
    taker.facing = side === 0 ? 0 : Math.PI;
    taker.kickCooldown = 0;
    taker.charge = 0;
    offender.kickCooldown = 1;
    for (const q of this.players) q.think = 0.2;
    const targets = new Map<SimPlayer, V2>();
    if (!penalty && dist(spot, goal) < this.length * 0.42) {
      // Close to goal: the two nearest defenders make a wall between the ball and the goal.
      const toGoal = norm(v(goal.x - spot.x, goal.z - spot.z));
      const across = v(-toGoal.z, toGoal.x);
      const gap = 3.2;
      const defenders = this.teamOf(offender.side).filter((q) => !q.isKeeper).sort((a, c) => dist(a.pos, spot) - dist(c.pos, spot)).slice(0, 2);
      defenders.forEach((q, i) => {
        const off = (i === 0 ? -1 : 1) * (q.radius + 0.04);
        targets.set(q, v(spot.x + toGoal.x * gap + across.x * off, spot.z + toGoal.z * gap + across.z * off));
      });
    }
    this.setPiece = { kind: penalty ? 'penalty' : 'freekick', side, taker, spot, timer: 0, wait: 0, stand: v(taker.pos.x, taker.pos.z), face: taker.facing, placed: true, targets };
    this.phase = 'setpiece';
    if (this.isHuman(side)) this.controlledBy[side] = taker;
    this.events.push({ type: 'foul', side: offender.side, player: offender.info, kind: penalty ? 'penalty' : 'freekick' });
  }

  // ---------- out of play and restarts ----------

  /** How high a throw-in is held: just over the kid's head. */
  private throwHeight(): number { return 1.75 * this.stats.scale + 0.15; }

  /** True once the whole ball is over a touchline, or over a goal line anywhere but into the goal. */
  isOut(): boolean {
    const b = this.ball;
    const L = this.length / 2, W = this.width / 2, r = b.radius;
    if (Math.abs(b.pos.z) > W + r) return true;
    const intoGoal = Math.abs(b.pos.z) < this.goalWidth / 2 && b.y < this.goalHeight;
    return Math.abs(b.pos.x) > L + r && !intoGoal;
  }

  /** Ball out: training goes back to the centre, a match gets a throw-in, corner or goal kick. */
  private checkOut(): void {
    if (this.phase !== 'play' || !this.isOut()) return;
    if (this.mode === 'training') { this.setupKickoff(this.config.humanSide ?? 0); return; }
    if (this.mode !== 'match') return; // the tutorial coach fetches the ball itself
    const b = this.ball;
    const last = b.lastTouch ?? b.owner;
    b.owner = null;
    // Let it roll on a touch so everyone sees it go out.
    b.vel = v(b.vel.x * 0.35, b.vel.z * 0.35);
    const L = this.length / 2, W = this.width / 2;
    const sz = Math.sign(b.pos.z) || 1;
    if (Math.abs(b.pos.x) > L + b.radius) {
      const sx = Math.sign(b.pos.x);
      const defending: Side = sx > 0 ? 1 : 0; // the side whose goal line it crossed
      if (last && last.side === defending) {
        const side = (1 - defending) as Side;
        this.awardRestart('corner', side, v(sx * (L - 0.25), sz * (W - 0.25)));
      } else {
        this.awardRestart('goalkick', defending, v(this.ownGoalX(defending) + -sx * 1.3, 0));
      }
    } else {
      const side: Side = last ? ((1 - last.side) as Side) : b.pos.x > 0 ? 1 : 0;
      this.awardRestart('throwin', side, v(clamp(b.pos.x, -L + 0.8, L - 0.8), sz * W));
    }
  }

  private awardRestart(kind: 'corner' | 'throwin' | 'goalkick', side: Side, spot: V2): void {
    const team = this.teamOf(side);
    const opps = this.teamOf((1 - side) as Side);
    const dir = side === 0 ? 1 : -1;
    const outfield = team.filter((q) => !q.isKeeper);
    const keeper = team.find((q) => q.isKeeper);
    const taker = kind === 'goalkick' && keeper ? keeper : this.nearest(outfield.length ? outfield : team, spot)!;
    const goalX = this.goalX(side);
    const targets = new Map<SimPlayer, V2>();
    let face: number;
    let stand: V2;
    if (kind === 'throwin') {
      const sz = Math.sign(spot.z);
      face = Math.atan2(-sz, 0);
      stand = v(spot.x, spot.z + sz * 0.3);
      // Two team-mates come short to offer an easy throw.
      const mates = outfield.filter((q) => q !== taker).sort((a, c) => dist(a.pos, spot) - dist(c.pos, spot));
      const offers = [v(spot.x + dir * this.width * 0.2, spot.z - sz * this.width * 0.22), v(spot.x - dir * this.width * 0.12, spot.z - sz * this.width * 0.34)];
      mates.slice(0, 2).forEach((q, i) => targets.set(q, v(clamp(offers[i].x, -this.length / 2 + 1, this.length / 2 - 1), offers[i].z)));
    } else if (kind === 'corner') {
      const sz = Math.sign(spot.z);
      const pen = v(goalX - dir * (this.width * 0.26 + 0.6), 0);
      face = Math.atan2(pen.z - spot.z, pen.x - spot.x);
      stand = v(spot.x - Math.cos(face) * 0.45, spot.z - Math.sin(face) * 0.45);
      // Attackers fill the box: near post, the penalty spot, the edge. Defenders pick them up goal-side.
      const W = this.width;
      const runs = [v(goalX - dir * W * 0.16, sz * W * 0.08), v(goalX - dir * W * 0.3, -sz * W * 0.05), v(goalX - dir * W * 0.48, sz * W * 0.12)];
      const attackers = outfield.filter((q) => q !== taker);
      attackers.forEach((q, i) => targets.set(q, runs[i % runs.length]));
      const defenders = opps.filter((q) => !q.isKeeper);
      defenders.forEach((q, i) => {
        const mark = runs[i % runs.length];
        targets.set(q, i < attackers.length ? v(mark.x + dir * 0.7, mark.z * 0.8) : v(goalX - dir * 0.9, sz * this.goalWidth * 0.6));
      });
    } else {
      face = dir > 0 ? 0 : Math.PI;
      stand = v(spot.x - dir * 0.45, spot.z);
      // Team-mates spread out to their formation spots for the kick.
      for (const q of outfield) targets.set(q, v(q.home.x, q.home.z));
    }
    for (const q of this.players) { q.think = 0.2; q.charge = 0; }
    this.setPiece = { kind, side, taker, spot, timer: 0, wait: 0.9, stand, face, placed: false, targets };
    this.phase = 'setpiece';
    if (this.isHuman(side)) this.controlledBy[side] = taker;
    this.events.push({ type: 'restart', kind, side });
  }

  /** The dead ball stops rolling and stays near the line while the taker walks over. */
  private settleDeadBall(dt: number): void {
    const sp = this.setPiece;
    if (this.phase !== 'setpiece' || !sp || sp.placed || this.ball.owner) return;
    const b = this.ball;
    const k = Math.max(0, 1 - 6 * dt);
    b.vel = v(b.vel.x * k, b.vel.z * k);
    const lim = (n: number, line: number) => clamp(n, -line - 0.45, line + 0.45);
    b.pos.z = lim(b.pos.z, this.width / 2);
    if (Math.abs(b.pos.z) > this.goalWidth / 2 + 0.3 || b.y >= this.goalHeight) b.pos.x = lim(b.pos.x, this.length / 2);
  }

  /** Put the ball on the spot and the taker behind it. */
  private placeSetPiece(sp: SetPiece): void {
    const t = sp.taker;
    t.pos = v(sp.stand.x, sp.stand.z);
    t.vel = v();
    t.facing = sp.face;
    t.kickCooldown = 0;
    t.charge = 0;
    const b = this.ball;
    b.owner = t;
    b.pos = v(sp.spot.x, sp.spot.z);
    b.vel = v(); b.vy = 0; b.y = 0;
    sp.placed = true;
  }

  /** The computer's choice at a set piece (also used when a human taker runs out of time). */
  private autoTake(p: SimPlayer): void {
    const sp = this.setPiece;
    if (!sp) return;
    switch (sp.kind) {
      case 'penalty': this.shoot(p, null, rand(0.95, 1.15)); return;
      case 'freekick': {
        const goal = v(this.goalX(p.side), 0);
        if (dist(p.pos, goal) < this.length * 0.4 && Math.abs(p.pos.z) < this.width * 0.35) { this.shoot(p, null, 1.05); return; }
        const mate = this.bestPassTarget(p, null);
        if (mate) this.pass(p, v(mate.pos.x - p.pos.x, mate.pos.z - p.pos.z)); else this.shoot(p, null, 1);
        return;
      }
      case 'throwin': this.throwIn(p, null, -1); return;
      case 'corner': this.cross(p, null, rand(0.9, 1.1)); return;
      case 'goalkick': this.keeperDistribute(p, false); return;
    }
  }

  /** A human taker pressed shoot (released after charging) or pass at a set piece. */
  private takeSetPiece(p: SimPlayer, kind: SetPieceKind, aim: V2 | null, shot: boolean, charge: number): void {
    switch (kind) {
      case 'penalty':
      case 'freekick':
        if (shot) this.shoot(p, aim, 0.7 + 0.45 * charge); else this.pass(p, aim);
        return;
      case 'throwin': this.throwIn(p, aim, shot ? charge : -1); return;
      case 'corner':
        if (shot) this.cross(p, aim, 0.85 + 0.3 * charge); else this.pass(p, aim);
        return;
      case 'goalkick':
        if (shot) this.longKick(p, aim, 0.75 + 0.35 * charge); else this.pass(p, aim, 1.1);
        return;
    }
  }

  /** Throw-in from over the head: to a team-mate, or (charge >= 0) a long throw where the stick points. */
  private throwIn(p: SimPlayer, aim: V2 | null, charge: number): void {
    const long = charge >= 0;
    const mate = long ? null : this.bestPassTarget(p, aim);
    let dir: V2;
    let d: number;
    if (mate) {
      const lead = v(mate.pos.x + mate.vel.x * 0.3, mate.pos.z + mate.vel.z * 0.3);
      dir = v(lead.x - p.pos.x, lead.z - p.pos.z);
      d = len(dir);
    } else {
      dir = aim ?? v(Math.cos(p.facing), Math.sin(p.facing));
      d = long ? (5 + 6 * charge) * p.mul.strength : 5; // Strength: a longer long throw
    }
    const wobble = (1 - this.stats.control) * 0.3;
    const a = Math.atan2(dir.z, dir.x) + rand(-wobble, wobble);
    const speed = clamp(1.8 + d * 0.55, 3, this.stats.power * 0.55 * (long ? p.mul.strength : 1));
    this.kick(p, v(Math.cos(a), Math.sin(a)), speed, 1.2);
    p.kickAnim = 0; // thrown, not kicked
    this.ball.y = Math.max(this.ball.y, this.throwHeight());
  }

  /** Corner cross into the box: to the best-placed team-mate, or where the stick points. */
  private cross(p: SimPlayer, aim: V2 | null, powerMul: number): void {
    const dir = p.side === 0 ? 1 : -1;
    let target = v(this.goalX(p.side) - dir * (this.width * 0.26 + 0.6), 0);
    const runner = this.nearest(this.teamOf(p.side).filter((m) => m !== p && !m.isKeeper), target);
    if (runner) target = v(runner.pos.x + runner.vel.x * 0.4, runner.pos.z + runner.vel.z * 0.4);
    let to = v(target.x - p.pos.x, target.z - p.pos.z);
    const d = len(to);
    if (aim) { const a = norm(aim); to = v(a.x * d, a.z * d); }
    const wobble = (1 - this.stats.control) * 0.25;
    const ang = Math.atan2(to.z, to.x) + rand(-wobble, wobble);
    const speed = clamp(2.5 + d * 0.62, 5, this.stats.power * 0.8) * powerMul;
    this.kick(p, v(Math.cos(ang), Math.sin(ang)), speed, 1.4);
  }

  /** Goal kick booted upfield (where the stick points, or straight ahead). */
  private longKick(p: SimPlayer, aim: V2 | null, powerMul: number): void {
    const dir = p.side === 0 ? 1 : -1;
    const to = aim ?? v(dir, rand(-0.35, 0.35));
    const boot = Math.sqrt(p.mul.strength); // Strength: a longer goal kick
    this.kick(p, to, this.stats.power * 0.95 * powerMul * boot, this.stats.power * 0.33 * powerMul * boot);
  }

  // ---------- skill moves ----------

  /** Running pace while a trick plays: slower during the feint, a burst once it has worked. */
  private trickPace(p: SimPlayer): number {
    if (p.trickBoost > 0) return 1.22;
    if (p.trickKind === 'stepover' && p.trickAnim > 0.45) return 0.7;
    return 1;
  }

  /**
   * The trick button. With a defender right in front it is a nutmeg: the ball goes
   * through their legs and the dribbler runs round to collect it. Otherwise it is a
   * step-over that sends nearby defenders the wrong way. Both can fail, more often
   * for the little age groups.
   */
  trick(p: SimPlayer, aim: V2 | null): void {
    const b = this.ball;
    if (b.owner !== p || p.isKeeper || p.trickCooldown > 0 || this.phase === 'setpiece') return;
    p.trickCooldown = 1.1;
    p.trickAnim = 1;
    const fwd = aim ? norm(aim) : v(Math.cos(p.facing), Math.sin(p.facing));
    const across = v(-fwd.z, fwd.x);
    const skill = clamp(this.stats.control + p.mul.touch, 0.05, 0.98);
    const opps = this.teamOf((1 - p.side) as Side).filter((o) => !o.isKeeper);
    const reach = 1.1 * this.stats.scale + 0.7;
    let victim: SimPlayer | null = null;
    let bestAlong = Infinity;
    for (const o of opps) {
      const rel = v(o.pos.x - p.pos.x, o.pos.z - p.pos.z);
      const along = rel.x * fwd.x + rel.z * fwd.z;
      const perp = Math.abs(rel.x * across.x + rel.z * across.z);
      if (along > 0.1 && along < reach && perp < 0.75 && along < bestAlong) { bestAlong = along; victim = o; }
    }
    if (victim) {
      p.trickKind = 'nutmeg';
      p.kickAnim = 0.7; // a little poke
      p.facing = Math.atan2(fwd.z, fwd.x);
      const ok = Math.random() < 0.35 + 0.5 * skill;
      b.owner = null;
      b.lastTouch = p;
      b.vy = 0;
      p.kickCooldown = 0.3;
      if (ok) {
        // Through the legs, and the defender spins round looking for it.
        const pace = 3 + 2.5 * this.stats.scale;
        b.vel = v(fwd.x * pace, fwd.z * pace);
        victim.kickCooldown = 1;
        victim.tackleTimer = Math.max(victim.tackleTimer, 1);
        victim.stunAnim = 0.8;
        victim.think = 0.6;
        p.trickBoost = 0.7;
      } else {
        // Off the shins: the ball pops loose.
        b.vel = v(-fwd.x * 1.5 + rand(-1.5, 1.5), -fwd.z * 1.5 + rand(-1.5, 1.5));
      }
      this.events.push({ type: 'trick', kind: 'nutmeg', side: p.side, player: p.info, ok });
      return;
    }
    p.trickKind = 'stepover';
    p.trickDir = Math.random() < 0.5 ? -1 : 1;
    const ok = Math.random() < 0.45 + 0.45 * skill;
    const near = opps.filter((o) => dist(o.pos, p.pos) < 2.4 * this.stats.scale + 0.8);
    if (ok) {
      // Defenders lean the way of the feint and cannot tackle for a moment.
      for (const o of near) {
        o.vel = v(across.x * p.trickDir * 2.6, across.z * p.trickDir * 2.6);
        o.tackleTimer = Math.max(o.tackleTimer, 0.8);
        o.think = 0.6;
      }
      p.trickBoost = 0.6;
    }
    this.events.push({ type: 'trick', kind: 'stepover', side: p.side, player: p.info, ok: ok && near.length > 0 });
  }

  /** Each starter's match stats by player id (for player of the match and career growth). */
  playerStats(): Record<string, PlayerMatchStats> {
    const out: Record<string, PlayerMatchStats> = {};
    for (const p of this.players) out[p.id] = { ...p.match };
    return out;
  }

  shoot(p: SimPlayer, aim: V2 | null, powerMul = 1): void {
    const goal = v(this.goalX(p.side), 0);
    const isCpu = !this.isHuman(p.side);
    const acc = isCpu ? this.diff.accuracy : 1;
    // Aim at a corner, with a wobble that shrinks with control.
    const spread = ((1 - this.stats.control) * 0.9 + (isCpu ? (1 - acc) * 0.8 : 0.15)) * p.mul.spread;
    const penalty = this.setPiece?.kind === 'penalty' && this.setPiece.taker === p;
    let targetZ = clamp(rand(-this.goalWidth / 2, this.goalWidth / 2) * 0.75 + rand(-spread, spread), -this.goalWidth * 0.6, this.goalWidth * 0.6);
    if (penalty) {
      // Penalties go for a corner; the wobble can still send one wide.
      const corner = (Math.random() < 0.5 ? -1 : 1) * (this.goalWidth / 2) * rand(0.55, 0.95);
      targetZ = corner + rand(-spread, spread) * 0.6;
    }
    let dir = v(goal.x - p.pos.x, targetZ - p.pos.z);
    if (aim) {
      // The human's stick biases the shot direction.
      const a = norm(aim);
      const g = norm(dir);
      dir = norm(v(g.x * 0.55 + a.x * 0.45, g.z * 0.55 + a.z * 0.45));
    }
    const d = dist(p.pos, goal);
    const power = this.stats.power * clamp(0.75 + d / this.length, 0.8, 1.15) * powerMul * (p.info.special === 'power' ? 1.18 : 1) * p.mul.power;
    const loft = power * rand(0.06, 0.2) * (powerMul > 1 ? 1.3 : 1);
    this.kick(p, dir, power, loft);
    p.match.shots++;
    this.ball.penaltyShot = penalty;
    this.events.push({ type: 'shot', side: p.side, player: p.info });
  }

  pass(p: SimPlayer, aim: V2 | null, speedMul = 1): void {
    const mate = this.bestPassTarget(p, aim);
    let dir: V2;
    let d: number;
    if (mate) {
      // Lead the receiver a little.
      const lead = v(mate.pos.x + mate.vel.x * 0.35, mate.pos.z + mate.vel.z * 0.35);
      dir = v(lead.x - p.pos.x, lead.z - p.pos.z);
      d = len(dir);
    } else {
      dir = aim ? aim : v(Math.cos(p.facing), Math.sin(p.facing));
      d = 6;
    }
    const wobble = (1 - this.stats.control) * 0.35 * p.mul.passWobble;
    const a = Math.atan2(dir.z, dir.x) + rand(-wobble, wobble);
    dir = v(Math.cos(a), Math.sin(a));
    const speed = clamp(3.5 + d * 0.65, 4.5, this.stats.power * 0.72) * speedMul;
    this.kick(p, dir, speed, 0);
    this.ball.wasPass = true;
  }

  private checkGoal(): void {
    if (this.phase === 'setpiece') return; // a dead ball cannot go in
    const b = this.ball;
    const L = this.length / 2;
    if (Math.abs(b.pos.x) > L + b.radius && Math.abs(b.pos.z) < this.goalWidth / 2 && b.y < this.goalHeight) {
      const scoringSide: Side = b.pos.x > 0 ? 0 : 1; // ball in +x goal means home scored
      // Deflections off a defender or keeper still count for the shooter.
      const touch = b.owner ?? b.lastKick ?? b.lastTouch ?? this.teamOf(scoringSide)[0];
      const ownGoal = touch.side !== scoringSide;
      const scorer = touch.info;
      this.goals.push({ side: scoringSide, scorer, minute: this.minute, ownGoal });
      if (!ownGoal && this.mode === 'match') {
        touch.match.goals++;
        const a = b.assist;
        if (a && a.side === scoringSide && a !== touch) a.match.assists++;
      }
      b.assist = null;
      if (this.shootout) {
        this.resolveShootoutKick(scoringSide === this.shootout.taking);
      } else if (this.mode === 'training') {
        const rocket = len(b.vel) > this.stats.power * 0.95;
        this.trainingPoints += rocket ? 2 : 1;
        this.score[0] = this.trainingPoints;
      } else {
        this.score[scoringSide]++;
      }
      this.phase = 'goal';
      this.phaseTimer = 0;
      b.owner = null;
      this.events.push({ type: 'goal', side: scoringSide, player: scorer });
    }
  }
}
