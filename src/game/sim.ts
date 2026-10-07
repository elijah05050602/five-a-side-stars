import { AGE_STATS, type AgeStats } from '../data/ageGroups';
import type { Difficulty, Player, Position, SkillKey, Team } from '../data/types';
import { extraSubs, startingFive } from '../data/defaults';
import { assignSlots, canPlay, formationById } from '../data/formations';
import { averageStars, skillMul } from '../data/skills';
import type { InputState } from './input';
import { SUPER_FILL, SUPER_TIME, type SuperKind } from './supers';
import { frameHit, netPresses, roofHeight, type GoalShape } from './goalFrame';
import { flightStep, GRASS_FRICTION, GRAVITY, heightAt, launchForCarry, vyForHeight } from './flight';

/** Horizontal vector helpers (x along the pitch, z across it). */
export interface V2 { x: number; z: number }
const v = (x = 0, z = 0): V2 => ({ x, z });
const len = (a: V2) => Math.hypot(a.x, a.z);
const dist = (a: V2, b: V2) => Math.hypot(a.x - b.x, a.z - b.z);
const norm = (a: V2): V2 => { const l = len(a); return l > 1e-6 ? v(a.x / l, a.z / l) : v(); };
const clamp = (n: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, n));
const rand = (lo: number, hi: number) => lo + Math.random() * (hi - lo);
/** Roughly a bell curve, mean 0 and spread 1, never beyond 3. */
const randn = () => (Math.random() + Math.random() + Math.random() - 1.5) * 2;

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
  /** Sideways speed a keeper launched the current dive at; the dive is committed, so this never changes mid-air. */
  diveSpeed: number;
  /** Seconds left getting back up after a dive (a keeper cannot move until it reaches 0). */
  recover: number;
  /** The dive is a last-moment lunge after misreading the shot, a little less likely to save it. */
  lateDive: boolean;
  distanceRun: number;
  isKeeper: boolean;
  speedMul: number;
  tackleTimer: number;
  /** Seconds this player has held the ball in the current spell. */
  holdTime: number;
  /** Seconds before a dribbler can take their next touch. */
  touchTimer: number;
  /** How far the current dribbling touch pops the ball off the feet, in metres. */
  touchPop: number;
  /** A pass or trick pressed while the ball was out of reach, played as soon as it is back. */
  queued: 'pass' | 'lob' | 'trick' | null;
  /** Which way the player is trying to run (the stick, or the AI's target); dribbling touches go this way. */
  runDir: V2;
  /** 0..1 sprint energy (human-controlled player only). */
  stamina: number;
  /** 0..1 energy for the whole match: it drains with running (slower with good Stamina) and refills on the bench. */
  energy: number;
  /** 0..1 shot power being charged while the shoot button is held. */
  /** How far off a keeper's read of the current shot is (metres), and which shot (ball flight) it is for. */
  misread: number;
  readFlight: number;
  charge: number;
  kickKind: KickKind;
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
  /** While a goal stands: how this kid celebrates it, or takes it badly. */
  celebrate: Celebration | null;
  /** A one-off move for the model (a keeper's catch or throw, a header, a first touch off a high ball), 1 fading to 0. */
  move: MoveKind | null;
  moveAnim: number;
  /** A keeper who has the ball in their hands (not at their feet from a team-mate's pass back). */
  handling: boolean;
  /**
   * A human keeper carrying the ball in their hands to the edge of the box: 0 = not at the line,
   * 1 = stopped at the line by a push, 2 = the stick was let go, so the next push out drops it to their feet.
   */
  edgeHold: 0 | 1 | 2;
  /** The super skill this player is doing, and the seconds of it left. */
  superKind: SuperKind | null;
  superTime: number;
  mul: SkillMuls;
  match: PlayerMatchStats;
}

export type TrickKind = 'stepover' | 'nutmeg';
/** Goal celebrations: a knee slide or aeroplane run for the scorer, a huddle for the team, and gloom for the other side. */
export type Celebration = 'slide' | 'plane' | 'huddle' | 'slump' | 'sit';
/** One-off moves the models act out: keeper handling, headers and first touches off a high ball. */
export type MoveKind = 'catchHigh' | 'catchChest' | 'scoop' | 'throw' | 'punt' | 'header' | 'diveHeader' | 'headTrap' | 'chestTrap' | 'thighTrap' | 'hop' | 'throwIn';
/** What the last kick was, so the model can swing the leg to match: a big boot for a shot, a quick side-foot for a pass, a scoop for a lob. */
export type KickKind = 'pass' | 'shot' | 'lob' | 'boot';
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
  /** Team-mate the current pass or lob is meant for, who runs to meet it. */
  receiver: SimPlayer | null;
  /** The current flight is a lob or cross, which checks up when it lands. */
  lofted: boolean;
  /** Team-mate whose completed pass set up the current possession; credited with an assist on a goal. */
  assist: SimPlayer | null;
  /** Where the ball was last kicked from: a keeper has longer to read a shot from far out. */
  kickedFrom: V2;
  /** A Rocket Shot in flight (harder to save), or a Magic Pass (nobody can cut it out). */
  superShot: boolean;
  superPass: boolean;
  /** The goal the ball went into through its mouth (1 at +x, -1 at -x), or 0 while it is out on the pitch or outside the netting. */
  inGoal: -1 | 0 | 1;
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

export interface GoalEvent {
  side: Side; scorer: Player; minute: number; ownGoal: boolean;
  /** Where the ball crossed the goal line: its height, and how far across the goal (0 is the middle). */
  at?: { y: number; z: number };
}

export interface SimEvent {
  type: 'goal' | 'kickoff' | 'halftime' | 'fulltime' | 'save' | 'kick' | 'touch' | 'shot' | 'foul' | 'whistle' | 'miss' | 'restart' | 'trick' | 'super' | 'sub';
  /** foul: the set piece awarded; restart: corner, throw-in or goal kick; trick: the skill move. */
  kind?: SetPieceKind | TrickKind;
  side?: Side;
  player?: Player;
  /** trick: whether it beat the defender. */
  ok?: boolean;
  /** shot: it was a header. */
  header?: boolean;
  /** super: which one. */
  superKind?: SuperKind;
  /** sub: the player who went off (`player` came on). */
  off?: Player;
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
  /** Beginner help: a gentler computer team, and the humans' shots are steered towards the goal. */
  assist?: boolean;
  /** Super skills are on (a live match only; matches played in the background leave them off). */
  supers?: boolean;
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

export const IDLE_INPUT: InputState = { moveX: 0, moveZ: 0, shoot: false, shootHeld: false, pass: false, lob: false, sprint: false, switchPlayer: false, pause: false, trick: false, subs: false };

/** Grass between the lines and the boards, so the ball can go out for throw-ins, corners and goal kicks. */
export const RUNOFF_SIDE = 1.2;
export const RUNOFF_END = 1.6;
/**
 * The net, per kilogram of ball: how stiff the netting is, how much it soaks up, how far it can stretch
 * before it goes taut, and how quickly it grips the ball's sideways speed. A full-power U10 shot
 * stretches the back of the net about 0.4 m and the ball drops out of it; a tap-in barely moves it.
 */
const NET_STIFF = 400;
const NET_DAMP = 22;
export const NET_GIVE = 0.55;
/** How far a shot's height strays, as a share of the bar's height (see shotLoft). */
export const SHOT_STRAY = 0.85;
const NET_GRIP = 3;
/** How much speed the ball keeps off a post or the crossbar. */
const POST_BOUNCE = 0.6;
/** Seconds between dribbling touches. */
export const DRIBBLE_STRIDE = 0.38;
/** Seconds a kick-off taker may wait before the ball is played to a team-mate for them. */
const KICKOFF_WAIT = 8;
/** Seconds a keeper may hold the ball in their hands before it is lobbed up to the halfway line for them. */
export const KEEPER_HOLD_LIMIT = 3;
/** Seconds a match goal stands before kick-off: the players celebrate, then the camera visits the fans. */
export const GOAL_HOLD = 6;
/** When the camera leaves the players' celebration for the fans. */
export const CROWD_SHOT_AT = 3.4;
/** Seconds the scorer runs before dropping into a knee slide. */
export const SLIDE_AT = 1.25;
/** A header's pace as a share of a shot's. */
const HEADER_POWER = 0.62;
/** A high ball above this (times the age scale) is headed rather than chested. */
const HEAD_HEIGHT = 0.8;
/** A lower cross than this can still be met with a diving header. */
const DIVE_HEAD_HEIGHT = 0.35;
/** A dive lasts 1 / DIVE_RATE seconds: DIVE_AIR seconds of it in the air, the rest lying on the grass. */
const DIVE_RATE = 2;
const DIVE_AIR = 0.32;
/** Share of the dive animation spent in the air. */
export const DIVE_AIR_SHARE = DIVE_AIR * DIVE_RATE;
/** Seconds a keeper with average Reflexes takes to get back up after a dive. */
export const DIVE_RECOVER = 0.35;
/** Share of a whole match's energy an average player running at an average rate uses up. */
const ENERGY_DRAIN = 0.9;
/** Pace lost with no energy left (a full bar loses none). */
export const TIRED_SLOWDOWN = 0.08;
/** The computer brings a player off below this energy, and makes at most this many changes a half. */
const CPU_SUB_ENERGY = 0.5;
const CPU_SUBS_PER_HALF = 2;

const DIFF = {
  easy: { speed: 0.85, think: 0.55, accuracy: 0.6, tackle: 0.6, humanTackle: 1.3, shootRange: 0.34 },
  normal: { speed: 1.0, think: 0.35, accuracy: 0.8, tackle: 0.9, humanTackle: 0.85, shootRange: 0.43 },
  hard: { speed: 1.08, think: 0.2, accuracy: 1.0, tackle: 1.2, humanTackle: 0.6, shootRange: 0.5 },
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
  /** The length of the step being run, for the helpers that change things at a rate (steering, the switch hold). */
  private stepDt = 1 / 60;
  /**
   * A newly picked player whose human has not touched the stick yet runs for them (presses the ball,
   * gets back), so a turnover never leaves the new defender standing still waiting for input.
   */
  private assist: [boolean, boolean] = [false, false];
  /** Which side had the ball last frame, to spot the moment the other team wins it. */
  private lastOwnerSide: Side | null = null;
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
  /** The kid leading the goal celebration (null when there is none). */
  celebrator: SimPlayer | null = null;
  private celebrationSpot: V2 = v();
  /** Each side's star meter, 0 to 1. Full means a super skill is ready. */
  superMeter: [number, number] = [0, 0];
  /** A super that has been called. It plays out on the next step, so a cutscene can show it first. */
  superPending: { p: SimPlayer; kind: SuperKind; side: Side } | null = null;
  /** Each side's players waiting on the bench (a live match only). */
  readonly bench: [Player[], Player[]] = [[], []];
  /** Energy of the players on the bench, by player id (missing means full). */
  private readonly benchEnergy = new Map<string, number>();
  /** Subs picked but waiting for the ball to go dead: the index of the spot in teamOf(side), and who comes on there. */
  readonly pendingSubs: [Map<number, Player>, Map<number, Player>] = [new Map(), new Map()];
  /** What players did before they went off, by player id (handed back if they come on again). */
  private readonly offStats = new Map<string, PlayerMatchStats>();
  /** Seconds each player has spent on the pitch, by player id. */
  private readonly secondsOn = new Map<string, number>();
  /** Changes the computer has made this half, per side. */
  private cpuSubsMade: [number, number] = [0, 0];

  constructor(readonly config: SimConfig) {
    this.teams = [config.home, config.away];
    this.stats = AGE_STATS[config.home.ageGroup];
    this.length = this.stats.pitch.length;
    this.width = this.stats.pitch.width;
    this.goalWidth = this.stats.goalWidth;
    this.goalHeight = 1.0 + 0.6 * this.stats.scale;
    this.goalDepth = 1.2;
    this.ball = { pos: v(), y: 0, vel: v(), vy: 0, radius: 0.12 + 0.05 * this.stats.scale, spin: 0, owner: null, lastTouch: null, lastKick: null, flightId: 0, keeperTried: -1, penaltyShot: false, wasPass: false, receiver: null, lofted: false, assist: null, kickedFrom: v(), superShot: false, superPass: false, inGoal: 0 };
    // Beginner help (Starter) starts from an Easy computer team, whatever was picked before, and then it runs and
    // thinks slower, tackles and saves softer, and shoots worse from closer in. League play keeps its tier's strength.
    const base = config.cpuLevel !== undefined ? diffForLevel(config.cpuLevel) : DIFF[config.assist ? 'easy' : config.difficulty];
    this.diff = config.assist ? { speed: base.speed * 0.85, think: base.think + 0.3, accuracy: base.accuracy * 0.7, tackle: base.tackle * 0.6, humanTackle: base.humanTackle * 1.3, shootRange: base.shootRange * 0.85 } : base;
    ([0, 1] as Side[]).forEach((side) => {
      const team = this.teams[side];
      const five = startingFive(team);
      // Everyone else waits on the bench. A computer team with only its five gets two subs made up for the match.
      if (this.mode === 'match') {
        const rest = team.players.filter((pl) => !five.includes(pl));
        this.bench[side] = rest.length || this.isHuman(side) ? rest : extraSubs(team);
      }
      // Tutorial: you and one team-mate against a lone keeper.
      const tutorialPair = five.filter((pl) => pl.position !== 'GK').sort((a, b) => (a.position === 'ATT' ? 0 : 1) - (b.position === 'ATT' ? 0 : 1)).slice(0, 2);
      five.forEach((info) => {
        if ((config.mode === 'training' || config.mode === 'tutorial') && side === 1 && info.position !== 'GK') return;
        if (config.mode === 'tutorial' && side === 0 && !tutorialPair.includes(info)) return;
        const mul = skillMuls(info, config.home.ageGroup);
        const p: SimPlayer = {
          id: info.id, side, info, pos: v(), vel: v(), facing: side === 0 ? 0 : Math.PI,
          radius: 0.28 * this.stats.scale + 0.08, home: v(), role: info.position, slot: v(info.position === 'GK' ? 0.03 : 0.33, 0), kickCooldown: 0, think: Math.random() * 0.3,
          aiTarget: v(), kickAnim: 0, diveAnim: 0, stunAnim: 0, diveDir: 1, diveSpeed: 0, recover: 0, lateDive: false, distanceRun: 0, isKeeper: info.position === 'GK',
          speedMul: this.speedMulFor(info, side, mul), tackleTimer: 0, holdTime: 0, touchTimer: 0, touchPop: 0, queued: null, runDir: v(side === 0 ? 1 : -1, 0), stamina: 1, energy: 1, charge: 0, misread: 0, readFlight: -1, kickKind: 'pass', penaltyGuess: 0,
          trickAnim: 0, trickKind: null, trickDir: 1, trickCooldown: 0, trickBoost: 0,
          celebrate: null, move: null, moveAnim: 0, handling: false, edgeHold: 0, superKind: null, superTime: 0,
          mul, match: freshMatchStats(),
        };
        this.players.push(p);
        this.sides[side].push(p);
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
    this.celebrator = null;
    this.players.forEach((p, i) => {
      p.pos = v(-dir * 2 + (i % 5) * 0.8 * -dir, -3 + (i % 3) * 3);
      p.vel = v(); p.kickCooldown = 0; p.charge = 0; p.diveAnim = 0; p.recover = 0; p.kickAnim = 0; p.penaltyGuess = 0;
      p.celebrate = null; p.move = null; p.moveAnim = 0; p.handling = false;
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
  /** Each side's players, listed once (nobody changes sides); the AI asks for them many times a step. Do not modify. */
  private readonly sides: [SimPlayer[], SimPlayer[]] = [[], []];
  teamOf(side: Side): SimPlayer[] { return this.sides[side]; }
  goalX(side: Side): number { return side === 0 ? this.length / 2 : -this.length / 2; } // the goal this side attacks
  ownGoalX(side: Side): number { return -this.goalX(side); }
  get minute(): number { return Math.floor((this.clock / (this.config.halfSeconds * 2)) * 40); }

  /** Put everyone in formation. `side` takes the kickoff. */
  setupKickoff(side: Side): void {
    this.kickoffSide = side;
    // Subs waiting for a stoppage come on now, straight into their spots (after a goal, or at half time).
    if (this.mode === 'match' && this.clock > 0) {
      if (this.phase === 'halftime') {
        this.cpuSubsMade = [0, 0];
        for (const p of this.players) p.energy = Math.min(1, p.energy + 0.15); // a rest and an orange slice
      }
      this.cpuSubs();
      this.applySubs(false);
    }
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
        p.recover = 0;
        p.celebrate = null;
        p.move = null;
        p.moveAnim = 0;
        p.handling = false;
      });
      if (s === side) {
        // The furthest forward stands on the ball, the next just behind.
        const atts = this.forwards(team);
        if (atts[0]) { atts[0].pos = v(-dir * 0.4, 0); this.ball.owner = atts[0]; }
        if (atts[1]) atts[1].pos = v(-dir * 2.2, W * 0.1);
      }
    });
    // Target practice has no kick-off: you can run with it straight away. In a match the taker must pass or shoot first.
    this.phase = this.mode === 'training' ? 'play' : 'kickoff';
    this.phaseTimer = 0;
    this.setPiece = null;
    this.celebrator = null;
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
    else if (this.phase === 'play' || this.phase === 'kickoff' || this.phase === 'setpiece' || this.phase === 'goal' || this.phase === 'halftime') { this.lastPhase = this.phase; this.phase = 'paused'; }
  }

  /** Paused, or the phase that was paused. */
  private get livePhase(): Phase { return this.phase === 'paused' ? this.lastPhase : this.phase; }

  /** The ball is out of play, so a sub can come on now (or, after a goal or at half time, at the kick-off). */
  ballDead(): boolean {
    const ph = this.livePhase;
    return ph === 'kickoff' || ph === 'goal' || ph === 'halftime' || (ph === 'setpiece' && this.setPiece?.kind !== 'penalty');
  }

  /** Whether this side can make subs at all: a live match with someone on the bench. */
  canSub(side: Side): boolean { return this.mode === 'match' && !this.shootout && this.bench[side].length > 0; }

  /** A player's energy, on the pitch or on the bench. */
  energyOf(id: string): number {
    return this.players.find((p) => p.id === id)?.energy ?? this.benchEnergy.get(id) ?? 1;
  }

  /**
   * Pick a side's line-up: `lineup[i]` is who should be in teamOf(side)[i]'s spot. Players from the bench
   * come on at the next stoppage (straight away if the ball is already dead). Picking the player who is
   * there already cancels a sub that was waiting.
   */
  requestSubs(side: Side, lineup: string[]): void {
    if (!this.canSub(side)) return;
    const team = this.teamOf(side);
    const pending = this.pendingSubs[side];
    pending.clear();
    const used = new Set<string>();
    lineup.forEach((id, i) => {
      const p = team[i];
      if (!p || id === p.id || used.has(id)) return;
      const info = this.bench[side].find((b) => b.id === id);
      if (!info) return;
      used.add(id);
      pending.set(i, info);
    });
    if (!pending.size || !this.ballDead() || this.livePhase === 'goal' || this.livePhase === 'halftime') return; // those wait for the kick-off
    if (this.livePhase === 'kickoff') this.phaseTimer = 0;
    this.applySubs(this.livePhase === 'setpiece');
  }

  /** Bring on every sub that is waiting. `runOn`: they run on from the bench (a set piece) rather than appear in their spot (a kick-off). */
  private applySubs(runOn: boolean): void {
    for (const side of [0, 1] as Side[]) {
      const pending = this.pendingSubs[side];
      if (!pending.size) continue;
      const team = this.teamOf(side);
      for (const [i, info] of pending) if (team[i] && this.bench[side].includes(info)) this.swapIn(team[i], info, runOn);
      pending.clear();
    }
  }

  /** Where a sub steps on: the near touchline, just inside their own half by the team's bench. */
  benchSpot(side: Side): V2 {
    return v((side === 0 ? -1 : 1) * 1.2, this.width / 2 + 0.5);
  }

  /** `info` comes on in `p`'s place. The spot in the formation (and the keeper's gloves) stay; the person changes. */
  private swapIn(p: SimPlayer, info: Player, runOn: boolean): void {
    const off = p.info;
    const side = p.side;
    this.offStats.set(off.id, p.match);
    this.benchEnergy.set(off.id, p.energy);
    this.bench[side] = [...this.bench[side].filter((b) => b !== info), off];
    p.info = info;
    p.id = info.id;
    p.mul = skillMuls(info, this.config.home.ageGroup);
    p.speedMul = this.speedMulFor(info, side, p.mul);
    p.match = this.offStats.get(info.id) ?? freshMatchStats();
    this.offStats.delete(info.id);
    p.energy = this.benchEnergy.get(info.id) ?? 1;
    this.benchEnergy.delete(info.id);
    p.stamina = 1; p.charge = 0; p.kickAnim = 0; p.diveAnim = 0; p.stunAnim = 0; p.recover = 0; p.trickAnim = 0; p.trickKind = null; p.trickBoost = 0;
    p.celebrate = null; p.move = null; p.moveAnim = 0; p.queued = null; p.superKind = null; p.superTime = 0; p.holdTime = 0;
    if (this.superPending?.p === p) { this.superPending = null; this.superMeter[side] = 1; }
    const b = this.ball;
    if (b.assist === p) b.assist = null;
    if (b.receiver === p) b.receiver = null;
    const sp = this.livePhase === 'setpiece' ? this.setPiece : null;
    if (runOn && sp) {
      // The referee waits while the new player runs on from the bench. If they are taking it, they walk over to the ball.
      const from = this.benchSpot(side);
      p.pos = v(from.x, from.z);
      p.vel = v();
      p.handling = false;
      const run = clamp(dist(from, sp.taker === p ? sp.stand : p.home) / (this.stats.speed * 0.9) + 0.3, 1.5, 5);
      if (sp.taker === p) {
        if (b.owner === p) b.owner = null;
        sp.placed = false;
      }
      sp.wait = Math.max(sp.wait, sp.timer + run);
    }
    this.events.push({ type: 'sub', side, player: info, off });
  }

  /** The computer brings off tired players for fresher ones, at half time and at stoppages in the second half. */
  private cpuSubs(): void {
    if (this.mode !== 'match' || this.half !== 2) return;
    for (const side of [0, 1] as Side[]) {
      if (this.isHuman(side) || !this.bench[side].length) continue;
      const team = this.teamOf(side);
      const pending = this.pendingSubs[side];
      const tired = team.map((p, i) => ({ p, i })).filter(({ p, i }) => p.energy < CPU_SUB_ENERGY && !pending.has(i)).sort((a, c) => a.p.energy - c.p.energy);
      for (const { p, i } of tired) {
        if (this.cpuSubsMade[side] >= CPU_SUBS_PER_HALF) break;
        const taken = new Set([...pending.values()]);
        const fresh = this.bench[side].filter((b) => !taken.has(b) && (this.benchEnergy.get(b.id) ?? 1) > 0.7 && (p.isKeeper ? b.position === 'GK' : b.position !== 'GK'));
        // Someone who plays that position if possible, then whoever has the most left in their legs.
        const score = (b: Player) => (canPlay(b).includes(p.role) ? 1 : 0) + (this.benchEnergy.get(b.id) ?? 1) * 0.5;
        const pickOne = fresh.sort((a, c) => score(c) - score(a))[0];
        if (!pickOne) continue;
        pending.set(i, pickOne);
        this.cpuSubsMade[side]++;
      }
    }
  }

  /** Running pace from the Speed stars, the Speedy perk and the difficulty. */
  private speedMulFor(info: Player, side: Side, mul: SkillMuls): number {
    return (this.isHuman(side) ? 1 : this.diff.speed) * (info.special === 'speedy' ? 1.12 : 1) * mul.speed;
  }

  /** Energy drains with running and refills on the bench; the clock on each player's time on the pitch ticks. */
  private tire(dt: number): void {
    if (this.mode !== 'match') return;
    const match = this.config.halfSeconds * 2;
    for (const p of this.players) {
      this.secondsOn.set(p.id, (this.secondsOn.get(p.id) ?? 0) + dt);
      const effort = 0.25 + 0.75 * Math.min(1, len(p.vel) / this.stats.speed);
      p.energy = Math.max(0, p.energy - (dt * effort * ENERGY_DRAIN) / match / p.mul.stamina);
    }
    for (const side of [0, 1] as Side[]) for (const b of this.bench[side]) {
      const e = this.benchEnergy.get(b.id);
      if (e !== undefined && e < 1) this.benchEnergy.set(b.id, Math.min(1, e + (dt * 3) / match));
    }
  }

  /** Advance the simulation. dt is seconds (call with a fixed step). */
  step(dt: number, input: InputState, input2?: InputState): void {
    this.stepDt = dt;
    if (this.phase === 'paused' || this.phase === 'fulltime') return;
    if ((this.pendingSubs[0].size || this.pendingSubs[1].size) && (this.phase === 'kickoff' || (this.phase === 'setpiece' && this.setPiece?.kind !== 'penalty'))) {
      if (this.phase === 'kickoff') this.phaseTimer = 0; // time for the new player to settle before the kick-off is taken for them
      this.applySubs(this.phase === 'setpiece');
    }
    if (this.phase === 'goal') {
      this.phaseTimer += dt;
      this.stepCelebration(dt);
      // The ball carries on into the net, and the net catches it.
      if (!this.ball.owner) this.integrateBall(dt);
      // A match goal holds a little longer so the camera can watch the players and then the fans celebrate (MatchScene).
      if (this.phaseTimer > (this.mode === 'training' ? 1.6 : this.mode === 'match' && !this.shootout ? GOAL_HOLD : 3.2)) {
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
    this.tire(dt);
    this.pressureTimer -= dt;
    if (this.phase === 'kickoff') {
      // The taker has to pass or shoot to start play. If nobody does, the ball is played to a team-mate for them.
      this.phaseTimer += dt;
      const taker = this.ball.owner;
      if (!taker) { if (this.phaseTimer > 4) this.phase = 'play'; }
      else if (this.phaseTimer > KICKOFF_WAIT) this.pass(taker, null, 1, false);
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
    const eventsBefore = this.events.length;
    if (this.supersOn) this.safely(() => {
      if (this.superPending) {
        const s = this.superPending;
        this.superPending = null;
        if (this.phase === 'play') this.runSuper(s.p, s.kind);
        else this.superMeter[s.side] = 1; // the whistle went first: keep it for later
      }
      // With a full meter, the trick button calls the super instead.
      for (const hs of [0, 1] as Side[]) if (inputs[hs]?.trick && this.callSuper(hs)) inputs[hs] = { ...inputs[hs]!, trick: false };
      this.cpuSupers();
    });
    for (const p of this.players) {
      p.kickCooldown = Math.max(0, p.kickCooldown - dt);
      p.tackleTimer = Math.max(0, p.tackleTimer - dt);
      p.touchTimer = Math.max(0, p.touchTimer - dt);
      p.stunAnim = Math.max(0, p.stunAnim - dt * 1.5);
      p.holdTime = this.ball.owner === p ? p.holdTime + dt : 0;
      if (this.controlledBy[p.side] !== p) p.stamina = Math.min(1, p.stamina + dt / 4);
      p.kickAnim = Math.max(0, p.kickAnim - dt * 4);
      this.tickMove(p, dt);
      this.tickDive(p, dt);
      p.trickAnim = Math.max(0, p.trickAnim - dt * 2.2);
      p.trickBoost = Math.max(0, p.trickBoost - dt);
      p.trickCooldown = Math.max(0, p.trickCooldown - dt);
      if (p.trickAnim <= 0) p.trickKind = null;
      if (p.superKind) {
        p.superTime = Math.max(0, p.superTime - dt);
        if (p.superTime <= 0) p.superKind = null;
        else if (p.superKind === 'slide' && this.supersOn) { this.safely(() => this.superSlide(p)); continue; }
      }
      if (this.keeperCommitted(p)) continue; // mid-dive or getting up: no steering until back on their feet
      if (p.isKeeper && p.handling && this.ball.owner === p && this.phase === 'play' && p.holdTime > KEEPER_HOLD_LIMIT) {
        this.keeperAutoLob(p);
        continue;
      }
      const inp = inputs[p.side];
      if (inp && this.controlledBy[p.side] === p && !this.assisting(p, inp)) this.driveHuman(p, inp, dt);
      else this.driveAI(p, dt);
    }
    this.integratePlayers(dt);
    if (this.supersOn) this.safely(() => this.bulldoze());
    this.keepHandsInBox();
    this.keepKeeperOutOfNet();
    this.updateFacing(dt);
    this.integrateBall(dt);
    this.keepHeldBallOutOfNet();
    this.settleDeadBall(dt);
    this.resolvePossession(dt);
    this.checkGoal();
    this.checkOut();
    if (this.ball.owner) {
      this.lastOwnerSide = this.ball.owner.side;
      this.ball.superShot = false;
      this.ball.superPass = false;
    }
    if (this.supersOn) this.safely(() => this.fillSupers(dt, eventsBefore));
  }

  /** Set if super skill code ever fails: they switch off for the rest of the match, and the match carries on. */
  private supersBroken = false;
  get supersOn(): boolean { return !!this.config.supers && this.mode === 'match' && !this.supersBroken; }

  private safely(fn: () => void): void {
    try { fn(); } catch (e) {
      this.supersBroken = true;
      this.superPending = null;
      for (const p of this.players) { p.superKind = null; p.superTime = 0; }
      console.warn('Super skills switched off for this match after an error', e);
    }
  }

  /** The super a side would do right now, and who does it; null when there is nothing to do. */
  superFor(side: Side): { p: SimPlayer; kind: SuperKind } | null {
    if (!this.supersOn || this.phase !== 'play' || this.superPending) return null;
    const o = this.ball.owner;
    const p = this.controlledBy[side] ?? (o && o.side === side ? o : this.nearestOutfield(this.teamOf(side), this.ball.pos));
    if (!p) return null;
    if (o === p) {
      const byPosition: Record<Position, SuperKind> = { ATT: 'rocket', WING: 'turbo', MID: 'magic', DEF: 'bulldozer', GK: 'magic' };
      return { p, kind: p.isKeeper ? 'magic' : byPosition[p.info.position] };
    }
    if (o && o.side !== side) {
      if (!p.isKeeper && !(o.isKeeper && o.handling) && dist(p.pos, o.pos) < 7) return { p, kind: 'slide' };
      const keeper = this.teamOf(side).find((q) => q.isKeeper);
      return keeper ? { p: keeper, kind: 'gloves' } : null;
    }
    return !o && !p.isKeeper ? { p, kind: 'turbo' } : null;
  }

  superReady(side: Side): boolean { return this.superMeter[side] >= 1 && this.superFor(side) !== null; }

  /** Spend a full meter on a super. It plays out next step. */
  private callSuper(side: Side): boolean {
    if (this.superMeter[side] < 1) return false;
    const s = this.superFor(side);
    if (!s) return false;
    this.superMeter[side] = 0;
    this.superPending = { ...s, side };
    this.events.push({ type: 'super', side, player: s.p.info, superKind: s.kind });
    return true;
  }

  /** How strong the computer side is, 0 (Easy) to 1 (Hard). */
  private cpuLevel(): number {
    return this.config.cpuLevel ?? { easy: 0, normal: 0.5, hard: 1 }[this.config.difficulty];
  }

  /** The meter fills with time on the ball and a bit more for shots, skill moves and saves. A computer team's fills slower. */
  private fillSupers(dt: number, from: number): void {
    const rate = (side: Side) => (this.isHuman(side) ? 1 : this.config.assist ? 0 : 0.45 + 0.45 * this.cpuLevel());
    const add = (side: Side, n: number) => { this.superMeter[side] = Math.min(1, this.superMeter[side] + n * rate(side)); };
    if (this.phase === 'play' && !this.superPending) for (const side of [0, 1] as Side[]) add(side, dt / SUPER_FILL);
    for (let i = from; i < this.events.length; i++) {
      const e = this.events[i];
      if (e.side === undefined) continue;
      if (e.type === 'shot') add(e.side, 0.05);
      else if (e.type === 'trick' && e.ok) add(e.side, 0.1);
      else if (e.type === 'save') add(e.side, 0.12);
      else if (e.type === 'goal') add((1 - e.side) as Side, 0.3); // a lift for the team that conceded
    }
  }

  /** The computer uses its super when it is worth it. Rocket Shots and Giant Gloves wait for Hard, so young players are not swamped. */
  private cpuSupers(): void {
    for (const side of [0, 1] as Side[]) {
      if (this.isHuman(side) || this.superMeter[side] < 1 || this.superPending) continue;
      const s = this.superFor(side);
      if (!s) continue;
      const b = this.ball;
      let go: boolean;
      if (s.kind === 'rocket') go = this.cpuLevel() >= 0.8 && Math.abs(this.goalX(side) - b.pos.x) < this.length * 0.4;
      else if (s.kind === 'gloves') go = this.cpuLevel() >= 0.8 && Math.abs(this.ownGoalX(side) - b.pos.x) < this.length * 0.3;
      else if (s.kind === 'slide') go = dist(s.p.pos, b.pos) < 4;
      else go = Math.random() < this.stepDt * 0.5;
      if (go) this.callSuper(side);
    }
  }

  private runSuper(p: SimPlayer, kind: SuperKind): void {
    const b = this.ball;
    p.superKind = kind;
    p.superTime = SUPER_TIME[kind];
    if (kind === 'rocket' || kind === 'magic') {
      p.superTime = 0.5; // long enough for the effects to see it
      if (b.owner !== p) return;
      if (kind === 'rocket') {
        // Low and hard into the corner away from the keeper. It can still be saved, just not often.
        const keeper = this.teamOf((1 - p.side) as Side).find((q) => q.isKeeper);
        const corner = (keeper && keeper.pos.z > 0 ? -1 : 1) * this.goalWidth * 0.36;
        this.kick(p, v(this.goalX(p.side) - p.pos.x, corner - p.pos.z), this.stats.power * 1.6, this.stats.power * 0.05);
        p.kickKind = 'shot';
        p.match.shots++;
        b.superShot = true;
        this.events.push({ type: 'shot', side: p.side, player: p.info });
      } else {
        this.pass(p, v(this.goalX(p.side) - p.pos.x, 0), 1.15, false);
        b.superPass = true;
      }
    } else if (kind === 'slide') p.tackleTimer = 0.8;
  }

  /** Super Slide: a flying tackle at the ball that always wins it, unless it is in the keeper's hands. */
  private superSlide(p: SimPlayer): void {
    const b = this.ball, o = b.owner;
    if (o === p || (o && o.side === p.side)) { p.superTime = 0; p.superKind = null; return; }
    this.moveTowards(p, o ? o.pos : b.pos, 1.9);
    if (dist(p.pos, b.pos) > 0.5 * this.stats.scale + 0.55 || b.y > 0.6 * this.stats.scale + 0.3) return;
    p.superTime = 0;
    p.superKind = null;
    if (o && o.isKeeper && o.handling) return;
    if (o) { o.stunAnim = 1; o.kickCooldown = 0.7; }
    b.owner = p;
    b.lastTouch = p;
    b.assist = null;
    b.wasPass = false;
    b.vel = v(p.vel.x, p.vel.z);
    p.holdTime = 0;
    p.match.tackles++;
  }

  /** A Bulldozer knocks anyone in the way aside. */
  private bulldoze(): void {
    for (const p of this.players) {
      if (p.superKind !== 'bulldozer') continue;
      for (const q of this.players) {
        if (q.side === p.side) continue;
        const d = dist(p.pos, q.pos), reach = p.radius + q.radius + 0.2;
        if (d >= reach || (q.isKeeper && q.handling)) continue;
        const n = d > 1e-3 ? norm(v(q.pos.x - p.pos.x, q.pos.z - p.pos.z)) : v(0, 1);
        q.pos.x += n.x * (reach - d + 0.3);
        q.pos.z += n.z * (reach - d + 0.3);
        q.vel = v(n.x * 3, n.z * 3);
        q.stunAnim = 1;
        q.kickCooldown = Math.max(q.kickCooldown, 0.6);
      }
    }
  }

  /** A keeper's reach: the Super keeper perk, Diving stars and Giant Gloves. */
  private reachOf(p: SimPlayer): number {
    return this.stats.keeperReach * (p.info.special === 'keeper' ? 1.25 : 1) * p.mul.reach * (p.superKind === 'gloves' ? 1.6 : 1);
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
      this.tickMove(p, dt);
      this.tickDive(p, dt);
      if (this.keeperCommitted(p)) continue;
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
    if (Math.abs(z) > 0.6 && this.ball.owner !== p && len(this.ball.vel) > 3) this.startDive(p, Math.sign(z), this.goalWidth * 0.4);
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
    const ownerSide = b.owner ? b.owner.side : null;
    const turnover = ownerSide !== null && ownerSide !== side && this.lastOwnerSide === side;
    if (turnover) {
      // The other team has just won it: hand over to the best defender at once, with no hold-over
      // from an earlier switch and no favour for the kid who was just tackled.
      this.switchHolds[side] = 0;
      const fresh = outfield.filter((p) => p.stunAnim <= 0.2 && p.kickCooldown <= 0);
      const pool = fresh.length ? fresh : outfield;
      const pick = this.nearest(pool, v(b.pos.x + b.vel.x * 0.4, b.pos.z + b.vel.z * 0.4)) ?? current;
      this.select(side, pick);
      return;
    }
    if (input.switchPlayer && current) {
      // Jump to the team-mate nearest the ball (other than the current one) and keep them long
      // enough to actually use them before the automatic pick takes over again.
      const others = outfield.filter((p) => p !== current);
      const target = others.length ? this.nearest(others, b.pos) : current;
      this.select(side, target ?? current);
      this.switchHolds[side] = 2.5;
      return;
    }
    this.switchHolds[side] = Math.max(0, this.switchHolds[side] - this.stepDt);
    if (this.switchHolds[side] > 0) return;
    // Auto-select the outfield player closest to where the ball is heading.
    const ahead = v(b.pos.x + b.vel.x * 0.4, b.pos.z + b.vel.z * 0.4);
    let best = current && !current.isKeeper ? current : outfield[0];
    let bestD = best ? dist(best.pos, ahead) - 0.8 : Infinity; // hysteresis favours current
    for (const p of outfield) {
      const d = dist(p.pos, ahead);
      if (d < bestD) { best = p; bestD = d; }
    }
    this.select(side, best);
  }

  /** Hands the human a new player; if it is a different one, the computer keeps them moving until the stick is touched. */
  private select(side: Side, p: SimPlayer | null): void {
    if (p && p !== this.controlledBy[side]) {
      this.assist[side] = true;
      p.think = 0; // decide where to run straight away, not on a stale plan
    }
    this.controlledBy[side] = p;
  }

  /** The keeper's box: the D drawn round their own goal. */
  boxRadius(): number { return this.width * 0.26; }
  inOwnBox(p: SimPlayer): boolean {
    return Math.hypot(p.pos.x - this.ownGoalX(p.side), p.pos.z) <= this.boxRadius() + 0.05;
  }

  /**
   * A keeper with the ball in their hands cannot carry it out of the box. The first push out stops them
   * on the line; let go of the stick and push out again, and they drop it to their feet to dribble on.
   */
  private keeperEdge(p: SimPlayer, want: V2, target: V2): V2 {
    const own = this.ownGoalX(p.side);
    const r = Math.hypot(p.pos.x - own, p.pos.z);
    const out = r > 1e-3 ? v((p.pos.x - own) / r, p.pos.z / r) : v(p.side === 0 ? 1 : -1, 0);
    const push = want.x * out.x + want.z * out.z; // how hard the stick points out of the box
    const line = this.boxRadius() - 0.1;
    const atLine = r >= line - 0.15;
    if (p.edgeHold === 1 && push < 0.25) p.edgeHold = 2; // stick let go (or turned back in): ready for a deliberate second push
    if (r < line - 1.5) p.edgeHold = 0; // walked well back inside: start over
    if (!atLine || push < 0.35) return target;
    if (p.edgeHold === 2) {
      // Second push: drop it to the feet and play on like an outfield player.
      p.handling = false;
      p.edgeHold = 0;
      this.ball.vy = 0;
      return target;
    }
    p.edgeHold = 1;
    // Stopped at the line: only the part of the run along the edge is allowed.
    const along = target.x * out.x + target.z * out.z;
    const outV = p.vel.x * out.x + p.vel.z * out.z;
    if (outV > 0) p.vel = v(p.vel.x - out.x * outV, p.vel.z - out.z * outV);
    return along > 0 ? v(target.x - out.x * along, target.z - out.z * along) : target;
  }

  /** Never let a keeper with the ball in their hands drift over the edge of the box. */
  private keepHandsInBox(): void {
    const o = this.ball.owner;
    if (!o || !o.isKeeper || !o.handling || this.phase !== 'play') return;
    const own = this.ownGoalX(o.side);
    const r = Math.hypot(o.pos.x - own, o.pos.z);
    const line = this.boxRadius() - 0.1;
    if (r <= line) return;
    o.pos = v(own + ((o.pos.x - own) / r) * line, (o.pos.z / r) * line);
  }

  /** How far in front of their own goal line a keeper on the ball must stay, so the ball they hold never crosses it. */
  private keeperLineGap(): number { return 0.42 * this.stats.scale + 0.05 + this.ball.radius + 0.1; }

  /** A keeper on the ball cannot be bumped (or walk) back into their own net. */
  private keepKeeperOutOfNet(): void {
    const o = this.ball.owner;
    if (!o || !o.isKeeper || this.phase !== 'play') return;
    const own = this.ownGoalX(o.side);
    const dir = o.side === 0 ? 1 : -1; // pointing out of their goal, up the pitch
    const minX = own + dir * this.keeperLineGap();
    if ((o.pos.x - minX) * dir >= 0) return;
    o.pos.x = minX;
    if (o.vel.x * dir < 0) o.vel = v(0, o.vel.z);
  }

  /** And the ball in a keeper's possession stays on the pitch side of their goal line, whichever way they face. */
  private keepHeldBallOutOfNet(): void {
    const b = this.ball, o = b.owner;
    if (!o || !o.isKeeper || this.phase !== 'play') return;
    const own = this.ownGoalX(o.side);
    const dir = o.side === 0 ? 1 : -1;
    const minX = own + dir * (b.radius + 0.1);
    if ((b.pos.x - minX) * dir >= 0) return;
    b.pos.x = minX;
    if (b.vel.x * dir < 0) b.vel = v(0, b.vel.z);
  }

  /** Held it too long: the keeper punts a lob to the team-mate nearest the halfway line. */
  private keeperAutoLob(p: SimPlayer): void {
    let mate: SimPlayer | null = null, best = Infinity;
    for (const m of this.teamOf(p.side)) {
      if (m === p || m.isKeeper || m.stunAnim > 0) continue;
      const score = Math.abs(m.pos.x) + Math.abs(m.pos.z - p.pos.z) * 0.3;
      if (score < best) { best = score; mate = m; }
    }
    this.ball.y = 0; // dropped from the hands and volleyed
    this.lob(p, null, mate ?? v(0, p.pos.z * 0.5));
    this.setMove(p, 'punt');
    p.think = 1;
  }

  /** The human has not steered their newly picked player yet, so the computer runs them meanwhile. */
  private assisting(p: SimPlayer, input: InputState): boolean {
    const side = p.side;
    if (!this.assist[side]) return false;
    if (this.ball.owner === p || this.phase !== 'play' || Math.hypot(input.moveX, input.moveZ) > 0.15) {
      this.assist[side] = false;
      return false;
    }
    return true;
  }

  private driveHuman(p: SimPlayer, input: InputState, _dt: number): void {
    if (this.phase === 'kickoff' && this.ball.owner === p) {
      // Kick-off: no running with it. Turn to aim, then pass, lob or shoot to get the game going.
      this.steer(p, v(), 30);
      const aimV = v(input.moveX, input.moveZ);
      const aim = len(aimV) > 0.05 ? aimV : null;
      if (aim) p.facing = Math.atan2(aimV.z, aimV.x);
      if (input.shootHeld) p.charge = Math.min(1, p.charge + _dt / 0.7);
      else if (p.charge > 0) { this.shoot(p, aim, 0.85 + 0.45 * p.charge); p.charge = 0; }
      else if (input.pass) this.pass(p, aim, 1, false);
      else if (input.lob) this.lob(p, aim);
      return;
    }
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
      else if (input.lob && sp.kind !== 'penalty') this.takeSetPieceLob(p, sp.kind, aim);
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
    let target = l > 0.05 ? v(want.x * max, want.z * max) : v();
    if (p.isKeeper && p.handling && this.ball.owner === p) target = this.keeperEdge(p, want, target);
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
        else if (input.lob) p.queued = 'lob';
        else if (input.trick) p.queued = 'trick';
      } else if (p.charge > 0) {
        // Released: a tap is a quick medium shot, a full hold is a rocket.
        this.shoot(p, l > 0.05 ? want : null, 0.85 + 0.45 * p.charge);
        p.charge = 0;
      } else if (input.pass || p.queued === 'pass') {
        this.pass(p, l > 0.05 ? want : null);
      } else if (input.lob || p.queued === 'lob') {
        this.lob(p, l > 0.05 ? want : null);
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
        if (p.holdTime > 0.8 && human && human !== p) this.pass(p, v(human.pos.x - p.pos.x, human.pos.z - p.pos.z), 1, false);
        this.steer(p, v(), 20);
      } else this.moveTowards(p, p.home, 0.8);
      return;
    }

    const teamHasBall = b.owner !== null && b.owner.side === p.side;
    const oppHasBall = b.owner !== null && b.owner.side !== p.side;

    if (b.owner === p && this.phase === 'kickoff') {
      // Kick-off taker: stands on the ball until they pass it (or shoot, if nobody is free).
      this.steer(p, v(), 30);
      if (p.think <= 0) {
        p.think = isCpuTeam ? diff.think : 0.3;
        const mate = this.bestPassTarget(p, null);
        if (mate) this.pass(p, v(mate.pos.x - p.pos.x, mate.pos.z - p.pos.z), 1, false);
        else if (this.phaseTimer > 1.5) this.shoot(p, null, 1);
      }
      return;
    }
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
        if (dGoal < range && angleClear && (pressure < 1.6 || dGoal < range * 0.6 || p.holdTime > 1.5)) {
          this.shoot(p, null, rand(0.85, 1.1));
          return;
        }
        const tight = pressure < 1.3 * this.stats.scale + 0.7;
        // Out wide near the box: lob a cross in to a team-mate making a run.
        if (!angleClear && dGoal < this.length * 0.45 && Math.random() < (tight ? 0.6 : 0.3)) {
          const spot = v(goal.x - Math.sign(goal.x) * (this.width * 0.26 + 0.6), 0);
          if (Math.abs(p.pos.z) > this.width * 0.25 && this.crossTarget(p, spot, null)) {
            this.lob(p, null);
            return;
          }
        }
        // Now and then a cornered dribbler tries a step-over or a nutmeg instead of passing.
        if (tight && p.trickCooldown <= 0 && Math.random() < (isCpuTeam ? 0.02 + 0.025 * diff.accuracy : 0.03)) {
          this.trick(p, null);
          const g = norm(v(goal.x - p.pos.x, goal.z - p.pos.z));
          p.aiTarget = v(p.pos.x + g.x * 3, p.pos.z + g.z * 3);
          return;
        }
        if (tight || p.holdTime > 0.7) {
          // Hemmed in near our own goal, the keeper is sometimes the way out.
          const backOk = tight && Math.abs(p.pos.x - own) < this.length * 0.35 && Math.random() < 0.3;
          const mate = this.bestPassTarget(p, null, false, backOk);
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
      if (ballLoose && b.wasPass && b.receiver === p) {
        // The pass is meant for us: go and meet it.
        p.aiTarget = this.interceptPoint(p);
      } else if ((ballLoose || oppHasBall) && chaser === p && this.phase !== 'kickoff') {
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
    const hands = p.handling;
    if (mate && !mateMarked && !pressed) {
      this.pass(p, v(mate.pos.x - p.pos.x, mate.pos.z - p.pos.z), 1.1);
      // From the hands it is thrown overarm, dropping a little way out and bouncing on.
      if (hands) { this.setMove(p, 'throw'); this.ball.vy = 1.2; }
    } else {
      // Big clearance upfield, away from whoever is closest.
      const awayZ = presser ? Math.sign(p.pos.z - presser.pos.z) || 1 : (Math.random() < 0.5 ? -1 : 1);
      this.keeperBoot(p, v(dir, awayZ * rand(0.2, 0.6)), rand(0.9, 1));
      if (hands) this.setMove(p, 'punt'); // dropped from the hands and volleyed
    }
  }

  /**
   * A keeper's dive is committed: they launch sideways at a speed picked for the
   * distance they need, fly for a moment, land, and then have to get up before
   * they can move again. Nothing changes direction once they leave the ground.
   */
  private startDive(p: SimPlayer, dir: number, need: number, late = false, short = false): void {
    if (p.diveAnim > 0 || p.recover > 0) return;
    p.diveAnim = 1;
    p.lateDive = late;
    p.diveDir = dir;
    const top = this.stats.speed * 1.9 * p.speedMul;
    p.diveSpeed = clamp(need / (DIVE_AIR * 0.6), this.stats.speed * 0.5, top);
    if (!late) return;
    // A last-moment lunge after a misread. Yours usually gets there (always on the easier levels, less often on Hard,
    // so the computer still scores some). The computer's gets there now and then on Normal and about half the time on
    // Hard; otherwise it stretches out but stops just short of the ball's path, so young players see the keeper try
    // and still score (the save odds give it a small chance of a fingertip).
    const reaches = this.isHuman(p.side) ? clamp(0.35 + 0.5 * this.diff.humanTackle, 0.5, 1) : clamp((this.diff.tackle - 0.6) * 0.9, 0, 0.6);
    if (!short && Math.random() < reaches) p.diveSpeed *= rand(0.8, 1.05);
    else p.diveSpeed = (Math.max(0, need - (p.radius + this.ball.radius) - 0.1) * rand(0.5, 0.9)) / (DIVE_AIR * 0.6);
  }

  /** Starts a one-off move for the model to act out. */
  private setMove(p: SimPlayer, kind: MoveKind): void {
    p.move = kind;
    p.moveAnim = 1;
  }

  private tickMove(p: SimPlayer, dt: number): void {
    // Catches and throws take about half a second; first touches and headers a little less.
    p.moveAnim = Math.max(0, p.moveAnim - dt * (p.move === 'diveHeader' ? 1.4 : p.move === 'hop' ? 3.2 : p.move === 'catchHigh' || p.move === 'throw' || p.move === 'punt' ? 1.9 : 2.6));
    if (p.moveAnim <= 0) p.move = null;
  }

  /**
   * After a goal: the scorer runs off to celebrate (a knee slide or an aeroplane run), team-mates
   * chase them into a huddle, and the other side trudge back with their heads down while their
   * keeper sits on the grass. Kick-off puts everyone back, so this never affects play.
   */
  private startCelebration(side: Side, scorer: SimPlayer | null): void {
    const team = this.teamOf(side);
    const hero = scorer && !scorer.isKeeper ? scorer : this.forwards(team)[0] ?? team[0];
    this.celebrator = hero ?? null;
    if (!hero) return;
    const goalX = this.goalX(side);
    // A run away from the goal and towards the near touchline, where the camera watches from.
    const away = norm(v(-Math.sign(goalX) * 0.6, 0.8));
    const runFor = this.stats.speed * SLIDE_AT;
    this.celebrationSpot = v(clamp(hero.pos.x + away.x * runFor, -this.length * 0.42, this.length * 0.42), clamp(hero.pos.z + away.z * runFor, -this.width * 0.4, this.width * 0.4));
    for (const p of this.players) {
      p.move = null; p.moveAnim = 0; p.handling = false; p.charge = 0;
      if (p.side === side) p.celebrate = p === hero ? (this.goals.length % 2 ? 'slide' : 'plane') : 'huddle';
      else p.celebrate = p.isKeeper ? 'sit' : 'slump';
    }
  }

  private stepCelebration(dt: number): void {
    const hero = this.celebrator;
    if (!hero || this.mode === 'training' || this.mode === 'tutorial') return;
    const t = this.phaseTimer;
    const run = this.stats.speed;
    const spot = this.celebrationSpot;
    const mates = this.teamOf(hero.side).filter((m) => m !== hero && !m.isKeeper);
    for (const p of this.players) {
      this.tickDive(p, dt);
      if (this.keeperCommitted(p)) { /* a keeper still finishing a dive */ }
      else if (p === hero && p.celebrate === 'slide') {
        if (t < SLIDE_AT) this.steer(p, this.towards(p.pos, spot, run * 1.05), 12);
        else { const k = Math.exp(-2.4 * dt); p.vel = v(p.vel.x * k, p.vel.z * k); } // sliding on the knees, slowing down
      } else if (p === hero) {
        // Aeroplane: swoop round the spot in a wide curve, arms out.
        const to = v(spot.x - p.pos.x, spot.z - p.pos.z);
        const a = Math.atan2(to.z, to.x) + (len(to) < 3 ? 1.35 : 0.5);
        this.steer(p, v(Math.cos(a) * run * 0.85, Math.sin(a) * run * 0.85), 6);
      } else if (p.celebrate === 'huddle' && !p.isKeeper) {
        // Chase the scorer and pile round them.
        const i = mates.indexOf(p);
        const ang = (i / Math.max(1, mates.length)) * Math.PI * 2 + 0.6;
        const ring = 0.55 * this.stats.scale + 0.35;
        const target = v(hero.pos.x + Math.cos(ang) * ring, hero.pos.z + Math.sin(ang) * ring);
        const d = dist(p.pos, target);
        this.steer(p, d > 0.2 ? this.towards(p.pos, target, Math.min(run * 1.3, d * 4)) : v(), 14);
        if (d < 1.2) p.facing = Math.atan2(hero.pos.z - p.pos.z, hero.pos.x - p.pos.x);
      } else if (p.celebrate === 'slump') {
        // Trudge back towards your own half.
        const target = v(this.ownGoalX(p.side) * 0.25, p.pos.z * 0.8);
        const d = dist(p.pos, target);
        this.steer(p, d > 0.5 && t > 0.5 ? this.towards(p.pos, target, run * 0.22) : v(), 6);
      } else this.steer(p, v(), 20);
      p.pos.x += p.vel.x * dt;
      p.pos.z += p.vel.z * dt;
      const sp = len(p.vel);
      if (sp > 0.4 && !p.isKeeper && !(p.celebrate === 'huddle' && dist(p.pos, hero.pos) < 1.4)) {
        // Face where they are going, turning smoothly (a slider keeps facing the way they slid).
        const want = Math.atan2(p.vel.z, p.vel.x);
        const d = Math.atan2(Math.sin(want - p.facing), Math.cos(want - p.facing));
        p.facing += clamp(d, -8 * dt, 8 * dt);
      }
    }
  }

  private towards(from: V2, to: V2, speed: number): V2 {
    const n = norm(v(to.x - from.x, to.z - from.z));
    return v(n.x * speed, n.z * speed);
  }

  /** Runs the dive clock, and starts the get-up when a dive ends. */
  private tickDive(p: SimPlayer, dt: number): void {
    if (p.diveAnim > 0) {
      p.diveAnim = Math.max(0, p.diveAnim - dt * DIVE_RATE);
      if (p.diveAnim === 0 && p.isKeeper) p.recover = DIVE_RECOVER / Math.sqrt(p.mul.save);
    } else p.recover = Math.max(0, p.recover - dt);
  }

  /** True while a keeper is in the air, on the ground or getting up, moving only as the dive carries them. */
  private keeperCommitted(p: SimPlayer): boolean {
    if (!p.isKeeper || (p.diveAnim <= 0 && p.recover <= 0)) return false;
    const airborne = p.diveAnim > 1 - DIVE_AIR_SHARE;
    if (airborne) {
      // Fastest at take-off, easing as they come down.
      const k = (p.diveAnim - (1 - DIVE_AIR_SHARE)) / DIVE_AIR_SHARE;
      p.vel = v(0, p.diveDir * p.diveSpeed * (0.4 + 0.6 * k));
    } else this.steer(p, v(), 40); // landed: a short skid, then still
    return true;
  }

  /**
   * How far off a keeper's read of a shot can be. Young players want to score: on Starter and Easy the computer's
   * keeper often guesses wrong and yours hardly ever; Hard reads nearly everything. Two humans, or two computer
   * teams, get the same keepers.
   */
  private keeperMisread(p: SimPlayer): number {
    const w = this.goalWidth;
    return this.isHuman(p.side) ? w * clamp(0.2 - 0.06 * (this.diff.humanTackle - 0.85), 0.12, 0.24) : w * clamp(0.42 - 0.2 * this.diff.tackle, 0.14, 0.36);
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
    // A team-mate's pass back is not a shot: go and meet it rather than diving at it.
    const backPass = b.owner === null && b.wasPass && b.lastKick !== null && b.lastKick.side === p.side;
    if (backPass && b.receiver === p) {
      const meet = this.interceptPoint(p);
      this.moveTowards(p, v(own + clamp((meet.x - own) * dir, -0.3, 5) * dir, clamp(meet.z, -this.goalWidth, this.goalWidth)), 1.1);
      p.facing = Math.atan2(b.pos.z - p.pos.z, b.pos.x - p.pos.x);
      return;
    }
    const toGoal = b.vel.x * dir < -0.5 && !backPass; // ball travelling towards our goal
    const towardsUs = Math.abs(b.pos.x - own) < this.length * 0.5;
    // Positioning: a good keeper follows the ball across the goal and narrows the angle.
    let targetZ = clamp(b.pos.z * clamp(0.6 * p.mul.angle, 0.3, 0.85), -this.goalWidth / 2 + 0.3, this.goalWidth / 2 - 0.3);
    let targetX = own + dir * 0.7;
    let rush = false;
    const t = toGoal ? Math.abs((p.pos.x - b.pos.x) / (b.vel.x || 1e-6)) : 99;
    if (b.penaltyShot && toGoal) {
      // Penalty: commit to a side at the kick and dive that way (usually the right one).
      const predZ = b.pos.z + b.vel.z * t;
      if (p.penaltyGuess === 0) {
        const right = Math.random() < (this.isHuman((1 - p.side) as Side) ? 0.5 : 0.55);
        p.penaltyGuess = (Math.sign(predZ) || 1) * (right ? 1 : -1);
      }
      targetZ = p.penaltyGuess * this.goalWidth * 0.4;
      if (t < 0.5) this.startDive(p, p.penaltyGuess, Math.abs(predZ - p.pos.z));
    } else if (toGoal && t < 1.4 && towardsUs) {
      // Predict where the ball crosses the keeper's line and go there. Keepers read a shot imperfectly: the guess is
      // off by up to keeperMisread(), so a misread shot goes past them, never through.
      if (p.readFlight !== b.flightId) {
        p.readFlight = b.flightId;
        // The computer's keeper is rarely spot on, more so on the easier levels, so young players' shots go in beside
        // them (not through them). Yours reads it anywhere from perfectly to a little off.
        const least = this.isHuman(p.side) ? 0 : clamp(0.4 - 0.3 * this.diff.tackle, 0, 0.3);
        // A shot from far out gives the keeper time to read it: from beyond about a third of the pitch the guess gets
        // much better, most of all on Hard, so long shots are a real test and only good close-range ones go in easily.
        const out = Math.abs(b.kickedFrom.x - this.ownGoalX(p.side)) / this.length;
        const sharpest = this.isHuman(p.side) ? 0.6 : clamp(1.15 - 0.65 * this.diff.tackle, 0.3, 0.8);
        const far = clamp(1 - (out - 0.3) * 2.5, sharpest, 1);
        p.misread = (Math.random() < 0.5 ? -1 : 1) * rand(least, 1) * this.keeperMisread(p) * far;
      }
      const predZ = b.pos.z + b.vel.z * t + p.misread;
      targetZ = clamp(predZ, -this.goalWidth / 2 - 0.4, this.goalWidth / 2 + 0.4);
      // A long shot gives a keeper time to walk to the wrong spot. They see their mistake at the last moment and
      // throw themselves at it, rather than standing still as it goes by (whether the dive gets there is down to the
      // save odds). A Rocket Shot is too quick for that.
      const trueZ = b.pos.z + b.vel.z * t;
      if (b.superShot) {
        // A Rocket Shot is too quick: the keeper is caught flat-footed, then throws a dive that falls short.
        targetZ = p.pos.z;
        if (t < 0.3) this.startDive(p, Math.sign(trueZ - p.pos.z) || 1, Math.abs(trueZ - p.pos.z), true, true);
      }
      const late = !b.superShot && t < 0.35 && Math.abs(trueZ - p.pos.z) > p.radius + b.radius && Math.abs(trueZ) < this.goalWidth / 2 + 0.3;
      if (late) this.startDive(p, Math.sign(trueZ - p.pos.z) || 1, Math.abs(trueZ - p.pos.z), true);
      else if (!b.superShot && Math.abs(predZ - p.pos.z) > reach * 0.45 && t < 0.45) this.startDive(p, Math.sign(predZ - p.pos.z) || 1, Math.abs(predZ - p.pos.z));
    } else if (this.phase !== 'setpiece' && b.owner && b.owner.side !== p.side && Math.abs(b.owner.pos.x - own) < 6 && Math.abs(b.owner.pos.z) < this.goalWidth) {
      // A dribbler is bearing down on goal: come out to narrow the angle if no defender is on them.
      const defender = this.nearest(this.teamOf(p.side).filter((m) => !m.isKeeper), b.owner.pos);
      if (!defender || dist(defender.pos, b.owner.pos) > 1.5) {
        const out = clamp(Math.abs(b.owner.pos.x - own) * 0.45 * p.mul.angle, 0.7, 2.6 * p.mul.angle);
        targetX = own + dir * out;
        targetZ = clamp(b.owner.pos.z * 0.5, -this.goalWidth / 2, this.goalWidth / 2);
        // Close in: rush out and smother a ball knocked too far ahead, so walking it in is hard.
        if (dist(b.pos, p.pos) < 2.6 * this.stats.scale + 1.5 && Math.abs(b.pos.x - own) < 5) { targetX = b.pos.x; targetZ = b.pos.z; rush = true; }
      }
    } else if (this.mode !== 'tutorial' && b.owner === null && len(b.vel) < 4 && dist(b.pos, p.pos) < 3 * this.stats.scale && Math.abs(b.pos.x - own) < 4.5) {
      // Come and collect a slow loose ball near the goal if we are closest to it.
      const opp = this.nearest(this.teamOf((1 - p.side) as Side), b.pos);
      if (!opp || dist(opp.pos, b.pos) > dist(p.pos, b.pos)) { targetX = b.pos.x; targetZ = b.pos.z; }
    }
    const speed = rush ? 1.35 : 1.1;
    this.moveTowards(p, v(targetX, targetZ), speed);
    p.facing = Math.atan2(b.pos.z - p.pos.z, b.pos.x - p.pos.x);
  }

  /** Earliest point on the ball's path that this player can reach. */
  private interceptPoint(p: SimPlayer): V2 {
    const b = this.ball;
    const speed = len(b.vel);
    if (speed < 0.5) return v(b.pos.x, b.pos.z);
    if (b.y > 0.3 || b.vy > 1) {
      // In the air (a lob or a cross): run to where it will come down.
      const t = (b.vy + Math.sqrt(b.vy * b.vy + 2 * 9.81 * b.y)) / 9.81;
      return v(b.pos.x + b.vel.x * t * 0.95, b.pos.z + b.vel.z * t * 0.95);
    }
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

  /**
   * Team-mate who is most open and furthest forward, within passing distance.
   * With `backToKeeper`, an outfield player in their own half may also roll it back to their keeper.
   */
  private bestPassTarget(from: SimPlayer, aim: V2 | null, lofted = false, backToKeeper = false): SimPlayer | null {
    const keeper = backToKeeper && !lofted && !from.isKeeper ? this.teamOf(from.side).find((m) => m.isKeeper && m !== from) : undefined;
    const ownHalf = Math.abs(from.pos.x - this.ownGoalX(from.side)) < this.length * 0.5;
    const mates = this.teamOf(from.side).filter((m) => m !== from && (!m.isKeeper || (m === keeper && ownHalf)));
    const opps = this.teamOf((1 - from.side) as Side);
    const dir = from.side === 0 ? 1 : -1;
    let best: SimPlayer | null = null, bestScore = -Infinity;
    for (const m of mates) {
      const d = dist(m.pos, from.pos);
      if (d < (lofted ? 3.5 : 1.5) || d > this.length * (lofted ? 0.75 : 0.6)) continue;
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
      // A lofted ball sails over anyone in the lane, so only the receiver's space matters.
      let score = openness - (lofted ? 0 : blocked * 12) - d * 0.3 + (m.pos.x - from.pos.x) * dir * (lofted ? 1 : 0.6);
      // The keeper is the safe ball, not the first choice, unless the stick points straight at them.
      if (m.isKeeper) score -= aim ? 4 : 8;
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
    const step = accel * this.stepDt;
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
   * a little for tiredness (see `energy`).
   */
  pace(p: SimPlayer): number {
    const boost = p.superKind === 'turbo' ? 1.5 : p.superKind === 'bulldozer' ? 1.25 : 1;
    return p.speedMul * boost * (1 - TIRED_SLOWDOWN * (1 - p.energy));
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
   * One dribbling touch: the ball pops a little way off the boot and comes back
   * to the feet over the next stride, so it is always under control but never
   * glued on. It pops further at a sprint and stays closer with good Dribbling,
   * and little ones are a bit wilder with it. A defender can nick it at the pop.
   */
  private dribbleTouch(o: SimPlayer, speed: number): void {
    const base = this.stats.speed * o.speedMul;
    const sprintF = clamp(1 + (speed / base - 0.88) * 2.5, 0.6, 1.5);
    o.touchPop = (0.12 + 0.3 * this.stats.scale) * (1.35 - 0.5 * this.stats.control) * sprintF * o.mul.touchDist * rand(0.85, 1.15);
    o.touchTimer = DRIBBLE_STRIDE;
    this.ball.lastTouch = o;
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
    const x0 = this.ball.pos.x;
    this.moveBall(dt, x0);
    this.goalEntry(x0);
  }

  private moveBall(dt: number, x0: number): void {
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
      // A keeper holding it has it tucked in at the chest; anyone else has it just ahead of their feet.
      const ahead = o.isKeeper && o.handling ? 0.42 * this.stats.scale + 0.05 : 0.3 * this.stats.scale + 0.15;
      const feet = v(o.pos.x + Math.cos(o.facing) * ahead, o.pos.z + Math.sin(o.facing) * ahead);
      const toFeet = dist(b.pos, feet);
      // Keepers hold it, set-piece takers and kick-off takers stand on it, and a kid
      // who stops with the ball nearby traps it under their foot.
      const held = (o.isKeeper && o.handling) || this.phase === 'setpiece' || this.phase === 'kickoff';
      if (held || (speed < 0.9 && toFeet < this.footReach() * 1.6)) {
        const gain = held ? 18 : 9;
        b.vel = v((feet.x - b.pos.x) * gain, (feet.z - b.pos.z) * gain);
        b.pos.x += b.vel.x * dt;
        b.pos.z += b.vel.z * dt;
        // A keeper with it in their hands holds it to the chest; everyone else has it at their feet.
        if (o.isKeeper && o.handling) b.y += (this.handHeight() - b.y) * Math.min(1, dt * 14);
        else b.y = Math.max(0, b.y - 6 * dt);
        b.vy = 0;
        b.spin += len(b.vel) * dt / b.radius;
        return;
      }
      // Dribbling: each touch pops the ball just ahead, and it comes back to the feet over the stride.
      if (o.touchTimer <= 0 && b.y < 0.3) this.dribbleTouch(o, speed);
      const phase = 1 - o.touchTimer / DRIBBLE_STRIDE; // 0 at the touch, 1 back at the feet
      const pop = o.touchPop * Math.sin(Math.PI * clamp(phase, 0, 1));
      const target = v(feet.x + Math.cos(o.facing) * pop, feet.z + Math.sin(o.facing) * pop);
      // Carried along at the dribbler's pace plus a soft spring rather than glue, so it trails a little on turns.
      b.vel = v(o.vel.x + (target.x - b.pos.x) * 12, o.vel.z + (target.z - b.pos.z) * 12);
      b.pos.x += b.vel.x * dt;
      b.pos.z += b.vel.z * dt;
      // Brought down off the chest or thigh, it drops to the feet.
      if (b.y > 0) { b.vy -= 9.81 * dt; b.y = Math.max(0, b.y + b.vy * dt); }
      if (b.y <= 0) b.vy = 0;
      b.spin += len(b.vel) * dt / b.radius;
      return;
    }
    // Free ball: gravity, bounce (a dropping lob checks up as it lands), rolling friction and air drag, from flight.ts.
    const speed = len(b.vel);
    // The grass inside the goal is long, and the net holds it.
    const newSpeed = flightStep(b, speed, dt, b.inGoal ? 6 : GRASS_FRICTION).speed;
    if (speed > 1e-4) b.vel = v((b.vel.x / speed) * newSpeed, (b.vel.z / speed) * newSpeed);
    b.pos.x += b.vel.x * dt;
    b.pos.z += b.vel.z * dt;
    b.spin += newSpeed * dt / b.radius;
    this.goalEntry(x0);
    // Rebound boards all round, set back from the lines in a match so the ball can go out of play.
    const L = this.length / 2, W = this.width / 2, r = b.radius;
    const sideBoard = W + (this.mode === 'match' ? RUNOFF_SIDE : 0), endBoard = L + (this.mode === 'match' ? RUNOFF_END : 0);
    if (b.pos.z > sideBoard - r) { b.pos.z = sideBoard - r; b.vel.z = -Math.abs(b.vel.z) * 0.55; }
    if (b.pos.z < -sideBoard + r) { b.pos.z = -sideBoard + r; b.vel.z = Math.abs(b.vel.z) * 0.55; }
    // The end boards, except across the goal mouth. A ball in the goal has the net to stop it.
    const inMouth = Math.abs(b.pos.z) < this.goalWidth / 2 - r && b.y < this.goalHeight - r;
    if (!inMouth && !b.inGoal) {
      if (b.pos.x > endBoard - r) { b.pos.x = endBoard - r; b.vel.x = -Math.abs(b.vel.x) * 0.55; }
      if (b.pos.x < -endBoard + r) { b.pos.x = -endBoard + r; b.vel.x = Math.abs(b.vel.x) * 0.55; }
    }
    this.goalFrame(dt);
  }

  /** The size of the goals, for goalFrame.ts. */
  get goalShape(): GoalShape {
    return { halfLength: this.length / 2, width: this.goalWidth, height: this.goalHeight, depth: this.goalDepth };
  }

  /**
   * Keep track of whether the ball is in a goal: it is once it crosses the line through the goal mouth
   * (or is found wholly inside the netting), and stops being once it is back out on the pitch.
   */
  private goalEntry(x0: number): void {
    const b = this.ball, g = this.goalShape, r = b.radius;
    const sx = b.inGoal || (b.pos.x >= 0 ? 1 : -1);
    const d = sx * b.pos.x - g.halfLength;
    if (b.inGoal) { if (d < -r) b.inGoal = 0; return; }
    if (d <= 0) return;
    const crossed = sx * x0 - g.halfLength <= 0 && Math.abs(b.pos.z) < g.width / 2 && b.y < g.height;
    const wholly = Math.abs(b.pos.z) < g.width / 2 - r && b.y < roofHeight(g, d) - r && d < g.depth - r;
    if (crossed || wholly) {
      b.inGoal = sx;
      // Where it crossed the line, back along this step's flight.
      const f = crossed && b.pos.x !== x0 ? clamp((sx * g.halfLength - x0) / (b.pos.x - x0), 0, 1) : 1;
      this.crossedAt = { y: Math.max(0, b.y - b.vy * this.stepDt * (1 - f)), z: b.pos.z - b.vel.z * this.stepDt * (1 - f) };
    }
  }

  /** Where the ball last went over a goal line into the goal (for the goal event). */
  private crossedAt: { y: number; z: number } | null = null;

  /**
   * The posts, the crossbar and the net. The ball bounces off the frame, and sinks into the netting,
   * which slows it, goes taut, and lets it drop. From outside, the netting stops it the same way.
   */
  private goalFrame(dt: number): void {
    const b = this.ball, g = this.goalShape, r = b.radius;
    const sx = b.inGoal || (b.pos.x >= 0 ? 1 : -1);
    let d = sx * b.pos.x - g.halfLength;
    if (d < -1) return;
    let vd = sx * b.vel.x, vz = b.vel.z, vy = b.vy;
    const hit = frameHit(g, d, b.y, b.pos.z, r);
    if (hit) {
      d += hit.nd * hit.depth; b.y += hit.ny * hit.depth; b.pos.z += hit.nz * hit.depth;
      const vn = vd * hit.nd + vy * hit.ny + vz * hit.nz;
      if (vn < 0) {
        // Off the woodwork: the speed into the post bounces back, and a little of the rest is lost.
        const tn = vn * (1 + POST_BOUNCE);
        vd = (vd - tn * hit.nd) * 0.9; vy = (vy - tn * hit.ny) * 0.9; vz = (vz - tn * hit.nz) * 0.9;
      }
    }
    for (const p of netPresses(g, d, b.y, b.pos.z, r, b.inGoal === sx)) {
      // The netting pushes back like a spring, and soaks up speed.
      let vn = vd * p.nd + vy * p.ny + vz * p.nz;
      const push = (NET_STIFF * p.depth + NET_DAMP * vn) * dt;
      vd -= p.nd * push; vy -= p.ny * push; vz -= p.nz * push;
      vn -= push;
      // It grips the ball too, so it drops instead of sliding along.
      const grip = Math.exp(-NET_GRIP * dt);
      vd = p.nd * vn + (vd - p.nd * vn) * grip; vy = p.ny * vn + (vy - p.ny * vn) * grip; vz = p.nz * vn + (vz - p.nz * vn) * grip;
      // Stretched as far as it goes: the net is taut.
      if (p.depth > NET_GIVE) {
        const over = p.depth - NET_GIVE;
        d -= p.nd * over; b.y -= p.ny * over; b.pos.z -= p.nz * over;
        if (vn > 0) { vd -= p.nd * vn; vy -= p.ny * vn; vz -= p.nz * vn; }
      }
    }
    // A goal is a goal: the ball stays in the net until the kick-off.
    if (b.inGoal && this.phase === 'goal' && d < r) { d = r; vd = Math.max(0, vd); }
    if (b.y < 0) { b.y = 0; vy = Math.max(0, vy); }
    b.pos.x = sx * (d + g.halfLength);
    b.vel = v(sx * vd, vz);
    b.vy = vy;
  }

  private resolvePossession(dt: number): void {
    const b = this.ball;
    if (this.phase === 'goal') return;
    const controlR = 0.5 * this.stats.scale + 0.25;
    if (this.phase === 'setpiece') return;
    if (b.owner) {
      const o = b.owner;
      if (o.isKeeper && (o.handling || this.inOwnBox(o)) && this.phase !== 'kickoff') return; // nobody tackles a keeper in their own box; outside it they are fair game
      if (this.mode === 'tutorial') return; // nobody tackles while you learn
      if (o.superKind === 'turbo' || o.superKind === 'bulldozer') return; // too quick, or too strong, to tackle
      // Between touches the ball is away from the dribbler's feet, and anyone can nick it.
      const exposed = dist(o.pos, b.pos) > this.touchRange(o) + 0.15;
      for (const p of this.players) {
        if (p.side === o.side || p.kickCooldown > 0) continue;
        const d = dist(p.pos, b.pos);
        if (exposed && p.tackleTimer <= 0) {
          const kr = this.reachOf(p);
          const reach = p.isKeeper ? kr * 0.75 : controlR;
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
              if (p.isKeeper) { p.handling = this.inOwnBox(p); if (p.handling) this.setMove(p, 'scoop'); }
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
            // Beaten head-on: the dribbler hops over the outstretched leg.
            if (!won && facingDot < 0 && !o.move) this.setMove(o, 'hop');
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
    // Whatever the save roll said, a shot never passes through a keeper's body: one that runs into it bounces off,
    // back out towards the pitch. (A keeper can move into its path after the save was judged.)
    for (const k of this.players) {
      if (this.mode === 'tutorial' || !k.isKeeper || !b.lastKick || b.lastKick.side === k.side || b.y > 1.7 * this.stats.scale) continue;
      // Until the save is judged, a keeper who can take the ball gets the chance to catch it below.
      if (b.keeperTried !== b.flightId && k.kickCooldown <= 0) continue;
      const rel = v(b.pos.x - k.pos.x, b.pos.z - k.pos.z);
      if (len(rel) >= k.radius + b.radius || len(b.vel) < 3.5 || rel.x * b.vel.x + rel.z * b.vel.z >= 0) continue;
      const n = norm(rel), along = b.vel.x * n.x + b.vel.z * n.z, away = k.side === 0 ? 1 : -1;
      b.vel = v(Math.abs(b.vel.x - 2 * along * n.x) * 0.45 * away, (b.vel.z - 2 * along * n.z) * 0.45);
      b.vy = Math.max(b.vy, rand(0.5, 2));
      b.lastTouch = k;
      b.keeperTried = b.flightId;
      k.kickCooldown = 0.3;
      k.match.saves++;
      this.events.push({ type: 'save', side: k.side, player: k.info });
      return;
    }
    // Loose ball: the closest eligible player within reach controls it.
    let best: SimPlayer | null = null, bd = Infinity;
    for (const p of this.players) {
      if (p.kickCooldown > 0) continue;
      if (b.superPass && b.lastKick && p.side !== b.lastKick.side) continue; // a Magic Pass cannot be cut out
      const d = dist(p.pos, b.pos);
      const kr = this.reachOf(p);
      const reach = p.isKeeper ? (p.diveAnim > 0 ? kr : p.recover > 0 ? kr * 0.35 : kr * 0.55) : controlR;
      // The intended receiver of a lob can chest or head it down; everyone else needs it at their feet.
      const meantFor = b.wasPass && b.receiver === p;
      const maxHeight = p.isKeeper ? this.goalHeight : (meantFor && b.lofted ? 1.3 : 0.6) * this.stats.scale + 0.2;
      // In a 50/50 the stronger kid gets there first.
      // The player a pass is meant for is already attacking the ball, so wins a close call.
      const eff = (p.isKeeper ? d : d / Math.sqrt(p.mul.strength)) * (meantFor ? 0.6 : 1);
      if (d < reach && b.y < maxHeight && eff < bd) { bd = eff; best = p; }
    }
    if (best) {
      const ballSpeed = len(b.vel);
      const ownPass = b.lastKick !== null && b.lastKick.side === best.side && b.wasPass;
      if (best.isKeeper && ballSpeed > 3.5 && !ownPass) {
        // One save attempt per shot, judged at the ball's closest approach. Comfortable
        // balls are caught; the rest is a dive whose odds fall with distance and shot speed.
        if (b.keeperTried === b.flightId) return;
        const reach = this.reachOf(best);
        const easy = reach * 0.5;
        const rel = v(b.pos.x - best.pos.x, b.pos.z - best.pos.z);
        const closing = rel.x * b.vel.x + rel.z * b.vel.z < 0;
        if (closing && bd > easy * 0.6) return; // still getting closer: wait for the nearest point
        b.keeperTried = b.flightId;
        const speedFactor = clamp(1.5 - (0.7 * ballSpeed) / this.stats.power, 0.4, 1);
        let pSave = bd < easy ? 0.97 * Math.max(speedFactor, 0.75) : clamp(1 - (bd - easy) / (reach - easy), 0, 1) * speedFactor;
        if (b.penaltyShot) pSave *= bd < easy ? 0.6 : 0.45; // even a keeper who guessed right can be beaten
        pSave *= best.mul.save;
        // A last-moment lunge after a misread is a little less likely to get there than a set keeper.
        if (best.lateDive && best.diveAnim > 0) pSave *= this.isHuman(best.side) ? 0.85 : 0.8;
        if (best.superKind === 'gloves') pSave = Math.min(1, pSave * 1.4 + 0.2);
        if (b.superShot) pSave *= best.superKind === 'gloves' ? 0.75 : 0.35;
        // A shot from close in leaves the keeper little time, so it is much harder to stop than one from distance.
        const from = b.lastKick ? dist(b.lastKick.pos, best.pos) : 10;
        pSave *= clamp(0.25 + (from / Math.max(ballSpeed, 1)) * 1.4, 0.4, 1);
        // Difficulty, kept generous because young players want to score: on Starter and Easy the computer's keeper is
        // very beatable and yours is sharper; Hard is close to the full keeper. Two humans, or two computer teams,
        // keep the same keeper strength on both sides.
        pSave *= this.isHuman(best.side) ? clamp(0.75 + 0.2 * this.diff.humanTackle, 0.85, 1.1) : clamp(0.3 + 0.45 * this.diff.tackle, 0.45, 0.85);
        if (this.mode === 'tutorial') pSave *= 0.4; // the tutorial keeper lets most shots in
        // A ball whose path runs into the keeper's body is always stopped: a fluffed save bounces off it, never through.
        // (Judged on the path, since the save is judged a moment before the ball arrives.)
        const along = (rel.x * b.vel.x + rel.z * b.vel.z) / Math.max(ballSpeed, 1e-6);
        const passBy = Math.sqrt(Math.max(0, bd * bd - along * along));
        // The body is as wide as the keeper drawn on screen, and as tall: a ball over their head is not blocked.
        const blocked = this.mode !== 'tutorial' && passBy < best.radius + b.radius && b.y < 1.7 * this.stats.scale;
        const fluffed = Math.random() > pSave;
        if (fluffed && !blocked) return; // beaten
        best.match.saves++;
        this.events.push({ type: 'save', side: best.side, player: best.info });
        const dir = best.side === 0 ? 1 : -1; // away from our own goal
        // Good Handling catches more; the rest are parried.
        if (fluffed || bd > easy * best.mul.catch || ballSpeed > this.stats.power * 1.05 * best.mul.catch) {
          // Parry: the ball flies back out towards the pitch, not into the net.
          let sideways = Math.sign(b.pos.z - best.pos.z) || (Math.random() < 0.5 ? -1 : 1);
          if (this.mode === 'match' && Math.abs(b.pos.z) > this.goalWidth * 0.3 && Math.random() < 0.4) {
            // A shot heading for the corner is tipped round the post, out over the goal line for a corner. (Only a
            // wide one: tipping a central shot backwards would knock it into the keeper's own net.)
            sideways = Math.sign(b.pos.z);
            b.vel = v(-dir * ballSpeed * rand(0.25, 0.4), sideways * ballSpeed * rand(0.5, 0.7));
          } else b.vel = v(dir * ballSpeed * rand(0.15, 0.35), sideways * ballSpeed * rand(0.45, 0.7));
          b.vy = rand(1, 3);
          best.kickCooldown = 0.35;
          this.startDive(best, sideways, 0.3);
          b.lastTouch = best;
          return;
        }
      } else {
        // Fast balls are harder to bring under control.
        const skill = clamp(this.stats.control + best.mul.touch, 0.05, 0.98); // Dribbling: a soft first touch
        // A team-mate's pass is weighted to be taken, so it can come in firmer than a loose ball.
        const meant = b.wasPass && b.lastKick?.side === best.side;
        const hard = ballSpeed > 7 * (0.5 + skill) * (meant ? 1.4 : 1);
        if (hard && Math.random() < (1 - skill) * 0.6) {
          // Fluffed touch: ball deflects.
          b.vel = v(b.vel.x * 0.45 + rand(-1.5, 1.5), b.vel.z * 0.45 + rand(-1.5, 1.5));
          if (b.vy < 0) b.vy = 0;
          best.kickCooldown = 0.25;
          b.lastTouch = best;
          return;
        }
      }
      const sc = this.stats.scale;
      // A cross met in the air in the box is headed at goal: a leap for a high one, a diving header for one at waist height.
      if (!best.isKeeper && b.lofted && b.y > DIVE_HEAD_HEIGHT * sc + 0.1 && this.canHead(best)) { this.header(best, b.y < HEAD_HEIGHT * sc + 0.1); return; }
      // A pass that reaches a team-mate counts, and sets up a possible assist.
      const from = b.lastKick;
      if (from && from.side === best.side && from !== best && b.wasPass) { from.match.passes++; b.assist = from; }
      else if (!from || from.side !== best.side) b.assist = null;
      b.wasPass = false;
      b.receiver = null;
      b.owner = best;
      b.lastTouch = best;
      if (best.isKeeper) {
        // Keepers take shots and crosses in their hands (high, at the chest, or scooped off the grass), but a team-mate's pass back stays at their feet.
        // Outside their own box a keeper is just another outfield player: no hands.
        best.handling = !ownPass && this.inOwnBox(best);
        if (best.handling) this.setMove(best, b.y > 0.9 * sc + 0.45 ? 'catchHigh' : b.y > 0.25 || ballSpeed > 6 ? 'catchChest' : 'scoop');
      } else if (b.y > HEAD_HEIGHT * sc + 0.1) this.setMove(best, 'headTrap');
      else if (b.y > 0.5 * sc + 0.1) this.setMove(best, 'chestTrap');
      else if (b.y > 0.2 * sc + 0.08) this.setMove(best, 'thighTrap');
      // The ball drops from wherever it was met (the chest, a thigh) to the feet.
      b.vy = 0;
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
    // Struck off the ground (a punt from the hands, a volley off a first touch): flatter, so it lands where it would have from the grass.
    b.vy = loft > 0 && b.y > 0.05 ? loft - b.y / ((2 * loft) / 9.81) : loft;
    b.lastTouch = p;
    b.lastKick = p;
    b.kickedFrom = v(p.pos.x, p.pos.z);
    b.flightId++;
    b.penaltyShot = false;
    b.wasPass = false;
    b.receiver = null;
    b.lofted = false;
    b.superShot = false;
    b.superPass = false;
    p.kickCooldown = 0.35;
    p.kickAnim = 1;
    p.kickKind = 'pass';
    p.handling = false;
    p.edgeHold = 0;
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
  /** Where a keeper holds a caught ball, out in front of their tummy (the models are drawn 1.35 times life size, with big heads). */
  private handHeight(): number { return 0.8 * this.stats.scale; }

  /** True once the whole ball is over a touchline, or over a goal line anywhere but into the goal. */
  isOut(): boolean {
    const b = this.ball;
    const L = this.length / 2, W = this.width / 2, r = b.radius;
    if (Math.abs(b.pos.z) > W + r) return true;
    return Math.abs(b.pos.x) > L + r && !b.inGoal;
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
    this.cpuSubs();
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
        if (shot) this.shoot(p, aim, 0.85 + 0.45 * charge); else this.pass(p, aim);
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
    this.ball.vy = 1.2; // released overhead and up, not flattened like a kick off the ground
    p.kickAnim = 0; // thrown, not kicked
    this.setMove(p, 'throwIn');
    this.ball.wasPass = mate !== null;
    this.ball.receiver = mate;
    this.ball.y = Math.max(this.ball.y, this.throwHeight());
    // Released over the line, so the ball does not count as out again before it has moved.
    this.ball.pos.z = clamp(this.ball.pos.z, -this.width / 2, this.width / 2);
  }

  /** Corner: a lofted cross into the box, like the Lob button from out wide. A charged corner is whipped in a little longer. */
  private cross(p: SimPlayer, aim: V2 | null, powerMul: number): void {
    this.lob(p, aim);
    const b = this.ball;
    b.vel = v(b.vel.x * powerMul, b.vel.z * powerMul);
  }

  /** Goal kick booted upfield (where the stick points, or straight ahead). */
  private longKick(p: SimPlayer, aim: V2 | null, powerMul: number): void {
    const dir = p.side === 0 ? 1 : -1;
    const to = aim ?? v(dir, rand(-0.35, 0.35));
    this.keeperBoot(p, to, 0.6 + 0.4 * clamp((powerMul - 0.75) / 0.35, 0, 1));
  }

  /**
   * A keeper's goal kick or punt. At full reach the first bounce lands by Strength: about 40% of the pitch from
   * their own line for a weak kicker, halfway for an average one, 60-65% for the strongest. Passing decides how
   * far it strays sideways, and it checks up as it lands like a lob.
   */
  private keeperBoot(p: SimPlayer, to: V2, reach: number): void {
    const n = norm(to);
    const share = clamp(0.5 + (p.mul.strength - 1) * 0.34 + rand(-0.03, 0.03), 0.36, 0.66);
    const along = share * this.length * reach - Math.abs(p.pos.x - this.ownGoalX(p.side));
    const carry = Math.max(4, along / Math.max(0.5, Math.abs(n.x)));
    const stray = 0.12 * p.mul.passWobble;
    const a = Math.atan2(n.z, n.x) + rand(-stray, stray);
    const { speed, vy } = launchForCarry(carry, (GRAVITY * clamp(0.8 + carry * 0.03, 1, 1.8)) / 2, this.stats.power * 2);
    // A punt is dropped from the hands and met low, so it flies just like a kick off the grass.
    this.ball.y = 0;
    this.kick(p, v(Math.cos(a), Math.sin(a)), speed, vy);
    this.ball.lofted = true;
    p.kickKind = 'boot';
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

  /** Match stats by player id for everyone who played, subs included (for player of the match and career growth). */
  playerStats(): Record<string, PlayerMatchStats> {
    const out: Record<string, PlayerMatchStats> = {};
    for (const [id, m] of this.offStats) out[id] = { ...m };
    for (const p of this.players) out[p.id] = { ...p.match };
    return out;
  }

  /** How much of the match each player was on the pitch for, 0 to 1, by player id. */
  playedShare(): Record<string, number> {
    const out: Record<string, number> = {};
    const match = this.config.halfSeconds * 2;
    for (const [id, s] of this.secondsOn) out[id] = clamp(s / match, 0, 1);
    return out;
  }

  shoot(p: SimPlayer, aim: V2 | null, powerMul = 1): void {
    const goal = v(this.goalX(p.side), 0);
    const isCpu = !this.isHuman(p.side);
    const acc = isCpu ? this.diff.accuracy : 1;
    // Beginner help steers a human's shot: less wobble, a lighter pull from the stick, and between the posts.
    const help = !isCpu && !!this.config.assist;
    // Aim at a corner, with a wobble that shrinks with control.
    const spread = ((1 - this.stats.control) * 0.9 + (isCpu ? (1 - acc) * 0.8 : 0.15)) * p.mul.spread * (help ? 0.4 : 1);
    const penalty = this.setPiece?.kind === 'penalty' && this.setPiece.taker === p;
    const wide = this.goalWidth * (help ? 0.4 : 0.6);
    let targetZ = clamp(rand(-this.goalWidth / 2, this.goalWidth / 2) * 0.75 + rand(-spread, spread), -wide, wide);
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
      const pull = help ? 0.2 : 0.45;
      dir = norm(v(g.x * (1 - pull) + a.x * pull, g.z * (1 - pull) + a.z * pull));
    }
    if (help) {
      // ...and wherever the stick points, the shot crosses the line between the posts.
      const run = goal.x - p.pos.x;
      const cross = dir.x * run > 0 ? p.pos.z + (dir.z / dir.x) * run : targetZ;
      dir = norm(v(run, clamp(cross, -wide, wide) - p.pos.z));
    }
    const d = dist(p.pos, goal);
    const power = this.stats.power * clamp(0.85 + d / this.length, 0.95, 1.25) * powerMul * (p.info.special === 'power' ? 1.18 : 1) * p.mul.power;
    this.kick(p, dir, power, this.shotLoft(p, dir, goal.x, power, powerMul, isCpu, help, penalty));
    p.kickKind = 'shot';
    p.match.shots++;
    this.ball.penaltyShot = penalty;
    this.events.push({ type: 'shot', side: p.side, player: p.info });
  }

  /**
   * How high a shot is struck. A tap is a low drive and a full charge rises towards the top of the goal (the
   * computer mixes the two). Then it strays up or down: more for harder hits and from further out, and by level.
   * Your shots on Starter never go over the bar; on Easy, Normal and Hard they stray more (0.4, 0.7, 1.0). The
   * computer's stray comes from its accuracy, so a weak team skies more. The upward speed comes from running the
   * flight ahead, so a long, hard shot rises and dips, and a soft one from far out loops down onto the bounce.
   */
  private shotLoft(p: SimPlayer, dir: V2, goalX: number, power: number, powerMul: number, isCpu: boolean, help: boolean, penalty: boolean): number {
    const run = Math.abs(goalX - p.pos.x) / Math.max(0.2, Math.abs(norm(dir).x));
    const r = this.ball.radius, bar = this.goalHeight;
    const charge = isCpu ? Math.random() : clamp((powerMul - 0.85) / 0.45, 0, 1);
    let y = r + (bar * 0.72 - r) * charge * rand(0.75, 1);
    const level = isCpu ? 0.5 + 1.25 * (1 - this.diff.accuracy) : help ? 0 : 0.4 + 0.6 * this.cpuLevel();
    const far = clamp((run / (this.length * 0.5)) ** 1.5, 0.1, 1.8);
    y += randn() * level * (0.08 + 0.5 * charge * charge) * far * bar * SHOT_STRAY * (penalty ? 0.4 : 1);
    const cap = help ? bar - r - 0.15 * this.stats.scale - 0.1 : Infinity;
    y = clamp(y, r, cap);
    const maxVy = Math.max(3, power * 0.6);
    let vy = vyForHeight(run, power, y, maxVy);
    if (help) {
      // Starter: the run-ahead can land a touch high, so bring it down until it passes under the bar.
      for (let i = 0; i < 20 && vy > 0 && (heightAt(run, power, vy) ?? 0) > cap; i++) vy = Math.max(0, vy - 0.15);
    }
    return vy;
  }

  /** A high ball dropping in the box is met with a header at goal. */
  private canHead(p: SimPlayer): boolean {
    if (this.phase !== 'play' || this.mode === 'tutorial') return false;
    const gx = this.goalX(p.side);
    const toGoal = Math.abs(gx - p.pos.x);
    return toGoal < this.width * 0.26 + 2.2 * this.stats.scale + 1 && toGoal > 0.8 && Math.abs(p.pos.z) < this.goalWidth * 1.5;
  }

  /** A header: weaker than a shot and aimed down, but straight off the cross with no time for the keeper to set. */
  private header(p: SimPlayer, diving: boolean): void {
    const b = this.ball;
    const from = b.lastKick;
    if (from && from.side === p.side && from !== p && b.wasPass) { from.match.passes++; b.assist = from; }
    else b.assist = null;
    const goal = v(this.goalX(p.side), 0);
    const spread = ((1 - this.stats.control) * 0.9 + 0.35) * p.mul.spread;
    const targetZ = clamp(rand(-this.goalWidth / 2, this.goalWidth / 2) * 0.7 + rand(-spread, spread), -this.goalWidth * 0.6, this.goalWidth * 0.6);
    const power = this.stats.power * HEADER_POWER * Math.sqrt(p.mul.power) * (0.9 + 0.2 * p.mul.strength);
    const dir = v(goal.x - p.pos.x, targetZ - p.pos.z);
    p.facing = Math.atan2(dir.z, dir.x); // turn the head (and the body after it) towards goal
    this.kick(p, dir, power, -0.6);
    p.kickCooldown = 0.5;
    this.setMove(p, diving ? 'diveHeader' : 'header');
    p.match.shots++;
    this.events.push({ type: 'shot', side: p.side, player: p.info, header: true });
  }

  pass(p: SimPlayer, aim: V2 | null, speedMul = 1, backToKeeper = true): void {
    const mate = this.bestPassTarget(p, aim, false, backToKeeper);
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
    // Friction slows a rolling ball by about 3.4 m/s each second: kick it hard enough to reach the receiver still moving briskly.
    const arrive = this.stats.power * 0.45;
    const speed = clamp(Math.sqrt(arrive * arrive + 2 * 3.4 * d), this.stats.power * 0.6, this.stats.power * 0.95) * speedMul;
    this.kick(p, dir, speed, 0);
    this.ball.wasPass = true;
    this.ball.receiver = mate;
  }

  /**
   * Lob pass or cross: a lofted ball over the defenders' heads that drops at a
   * team-mate (forward runners first), or where the stick points. Nobody can
   * cut it out in the air, but it is slower to arrive and less exact than a pass.
   */
  /** `forced` picks the receiver (or a spot on the pitch) instead of the usual choice. */
  lob(p: SimPlayer, aim: V2 | null, forced?: SimPlayer | V2): void {
    const goal = v(this.goalX(p.side), 0);
    // Out wide in the final third it is a cross into the box; anywhere else a lofted pass.
    const crossing = !forced && Math.abs(p.pos.z) > this.width * 0.25 && Math.abs(p.pos.x - goal.x) < this.length * 0.4;
    const spot = v(goal.x - Math.sign(goal.x) * (this.width * 0.26 + 0.6), 0);
    let mate = crossing ? this.crossTarget(p, spot, aim) : null;
    if (!crossing) mate = forced ? ('info' in forced ? forced : null) : this.bestPassTarget(p, aim, true);
    let to: V2;
    if (forced && !mate) {
      to = v((forced as V2).x - p.pos.x, (forced as V2).z - p.pos.z);
    } else if (crossing && !mate && !aim) {
      to = v(spot.x - p.pos.x, spot.z - p.pos.z); // nobody there yet: put it on the penalty spot for a runner
    } else if (mate) {
      // Aim where the receiver will be when it drops.
      const t0 = this.lobFlightTime(dist(p.pos, mate.pos));
      to = v(mate.pos.x + mate.vel.x * t0 * 0.8 - p.pos.x, mate.pos.z + mate.vel.z * t0 * 0.8 - p.pos.z);
    } else {
      const dir = aim ? norm(aim) : v(Math.cos(p.facing), Math.sin(p.facing));
      const d = 6 + 6 * this.stats.scale;
      to = v(dir.x * d, dir.z * d);
    }
    const d = Math.max(2, len(to));
    const t = this.lobFlightTime(d);
    // A pass lands a little short so it bounces on to the receiver; a cross drops just beyond them, to be met
    // at chest or head height over the marker. The flight is run ahead with the sim's own physics, so it lands there.
    const carry = crossing && mate ? d + 0.4 * this.stats.scale + 0.3 : d * 0.9;
    const { speed, vy } = launchForCarry(carry, (GRAVITY * t) / 2, this.stats.power * 1.1);
    const wobble = (1 - this.stats.control) * 0.3 * p.mul.passWobble;
    const a = Math.atan2(to.z, to.x) + rand(-wobble, wobble);
    this.kick(p, v(Math.cos(a), Math.sin(a)), speed, vy);
    p.kickKind = 'lob';
    this.ball.wasPass = true;
    this.ball.receiver = mate;
    this.ball.lofted = true;
  }

  /** For a cross: the team-mate best placed to attack the ball around the penalty spot (and roughly where the stick points). */
  private crossTarget(p: SimPlayer, spot: V2, aim: V2 | null): SimPlayer | null {
    let best: SimPlayer | null = null, bestD = this.width * 0.45;
    for (const m of this.teamOf(p.side)) {
      if (m === p || m.isKeeper) continue;
      const lane = norm(v(m.pos.x - p.pos.x, m.pos.z - p.pos.z));
      if (aim && lane.x * aim.x + lane.z * aim.z < 0.2) continue;
      const d = dist(m.pos, spot);
      if (d < bestD) { bestD = d; best = m; }
    }
    return best;
  }

  /** Seconds a lob spends in the air: longer balls go higher. */
  private lobFlightTime(d: number): number { return clamp(0.55 + d * 0.035, 0.65, 1.25); }

  /** A human taker pressed lob at a set piece. */
  private takeSetPieceLob(p: SimPlayer, kind: SetPieceKind, aim: V2 | null): void {
    if (kind === 'throwin') this.throwIn(p, aim, 0.5);
    else if (kind === 'corner') this.cross(p, aim, 1);
    else this.lob(p, aim);
  }

  private checkGoal(): void {
    if (this.phase === 'setpiece') return; // a dead ball cannot go in
    const b = this.ball;
    const L = this.length / 2;
    if (b.inGoal && Math.abs(b.pos.x) > L + b.radius) {
      const scoringSide: Side = b.pos.x > 0 ? 0 : 1; // ball in +x goal means home scored
      // Deflections off a defender or keeper still count for the shooter.
      const touch = b.owner ?? b.lastKick ?? b.lastTouch ?? this.teamOf(scoringSide)[0];
      const ownGoal = touch.side !== scoringSide;
      const scorer = touch.info;
      this.goals.push({ side: scoringSide, scorer, minute: this.minute, ownGoal, at: this.crossedAt ?? { y: b.y, z: b.pos.z } });
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
      if (this.mode === 'match' || this.shootout) this.startCelebration(scoringSide, ownGoal ? null : touch);
      this.events.push({ type: 'goal', side: scoringSide, player: scorer });
    }
  }
}
