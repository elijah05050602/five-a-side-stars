import { AGE_STATS, type AgeStats } from '../data/ageGroups';
import type { Difficulty, Player, Team } from '../data/types';
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
  /** Time remaining before this player may take the ball again after kicking. */
  kickCooldown: number;
  /** Decision timer for AI. */
  think: number;
  aiTarget: V2;
  /** Animation hooks. */
  kickAnim: number;
  diveAnim: number;
  diveDir: number;
  distanceRun: number;
  isKeeper: boolean;
  speedMul: number;
  tackleTimer: number;
  /** Seconds this player has held the ball in the current spell. */
  holdTime: number;
  /** 0..1 sprint energy (human-controlled player only). */
  stamina: number;
  /** 0..1 shot power being charged while the shoot button is held. */
  charge: number;
}

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
}

export type Phase = 'kickoff' | 'play' | 'setpiece' | 'goal' | 'halftime' | 'fulltime' | 'paused';

export interface SetPiece {
  kind: 'freekick' | 'penalty';
  /** Team taking the kick. */
  side: Side;
  taker: SimPlayer;
  spot: V2;
  timer: number;
}

export interface GoalEvent { side: Side; scorer: Player; minute: number; ownGoal: boolean }

export interface SimEvent {
  type: 'goal' | 'kickoff' | 'halftime' | 'fulltime' | 'save' | 'kick' | 'shot' | 'foul' | 'whistle';
  kind?: 'freekick' | 'penalty';
  side?: Side;
  player?: Player;
}

export interface SimConfig {
  home: Team;
  away: Team;
  difficulty: Difficulty;
  halfSeconds: number;
  /** Which side the human controls; null = watch the computer play itself. */
  humanSide: Side | null;
}

const DIFF = {
  easy: { speed: 0.85, think: 0.55, accuracy: 0.6, tackle: 0.6, humanTackle: 1.3, shootRange: 0.3 },
  normal: { speed: 1.0, think: 0.35, accuracy: 0.8, tackle: 0.9, humanTackle: 0.85, shootRange: 0.38 },
  hard: { speed: 1.08, think: 0.2, accuracy: 1.0, tackle: 1.2, humanTackle: 0.6, shootRange: 0.45 },
} as const;

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
  controlled: SimPlayer | null = null;
  events: SimEvent[] = [];
  setPiece: SetPiece | null = null;
  fouls: [number, number] = [0, 0];
  private switchHold = 0;
  private lastPhase: Phase = 'kickoff';
  private pressureTimer = 0;

  constructor(readonly config: SimConfig) {
    this.teams = [config.home, config.away];
    this.stats = AGE_STATS[config.home.ageGroup];
    this.length = this.stats.pitch.length;
    this.width = this.stats.pitch.width;
    this.goalWidth = this.stats.goalWidth;
    this.goalHeight = 1.0 + 0.6 * this.stats.scale;
    this.goalDepth = 1.2;
    this.ball = { pos: v(), y: 0, vel: v(), vy: 0, radius: 0.08 + 0.04 * this.stats.scale, spin: 0, owner: null, lastTouch: null, lastKick: null, flightId: 0, keeperTried: -1 };
    const diff = DIFF[config.difficulty];
    ([0, 1] as Side[]).forEach((side) => {
      const team = this.teams[side];
      const isCpu = config.humanSide !== side;
      team.players.slice(0, 5).forEach((info) => {
        const p: SimPlayer = {
          id: info.id, side, info, pos: v(), vel: v(), facing: side === 0 ? 0 : Math.PI,
          radius: 0.28 * this.stats.scale + 0.08, home: v(), kickCooldown: 0, think: Math.random() * 0.3,
          aiTarget: v(), kickAnim: 0, diveAnim: 0, diveDir: 1, distanceRun: 0, isKeeper: info.position === 'GK',
          speedMul: isCpu ? diff.speed : 1, tackleTimer: 0, holdTime: 0, stamina: 1, charge: 0,
        };
        this.players.push(p);
      });
    });
    this.setupKickoff(0);
  }

  get humanTeam(): SimPlayer[] { return this.players.filter((p) => p.side === this.config.humanSide); }
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
      let defI = 0, attI = 0;
      team.forEach((p) => {
        if (p.isKeeper) p.home = v(own + dir * 0.6, 0);
        else if (p.info.position === 'DEF') { p.home = v(own + dir * L * 0.25, (defI === 0 ? -1 : 1) * W * 0.24); defI++; }
        else { p.home = v(own + dir * L * 0.42, (attI === 0 ? -1 : 1) * W * 0.18); attI++; }
        p.pos = v(p.home.x, p.home.z);
        p.vel = v();
        p.facing = s === 0 ? 0 : Math.PI;
        p.kickCooldown = 0;
        p.kickAnim = 0;
        p.diveAnim = 0;
      });
      if (s === side) {
        // One attacker stands on the ball, the other just behind.
        const atts = team.filter((p) => p.info.position === 'ATT');
        if (atts[0]) { atts[0].pos = v(-dir * 0.4, 0); this.ball.owner = atts[0]; }
        if (atts[1]) atts[1].pos = v(-dir * 2.2, W * 0.1);
      }
    });
    this.phase = 'kickoff';
    this.phaseTimer = 0;
    this.setPiece = null;
    if (this.config.humanSide !== null) {
      const human = this.humanTeam;
      const owner = this.ball.owner as SimPlayer | null;
      this.controlled = owner && owner.side === this.config.humanSide
        ? owner
        : human.find((p) => p.info.position === 'ATT') ?? human[0];
    }
    this.events.push({ type: 'kickoff', side });
  }

  togglePause(): void {
    if (this.phase === 'paused') this.phase = this.lastPhase;
    else if (this.phase === 'play' || this.phase === 'kickoff' || this.phase === 'setpiece') { this.lastPhase = this.phase; this.phase = 'paused'; }
  }

  /** Advance the simulation. dt is seconds (call with a fixed step). */
  step(dt: number, input: InputState): void {
    if (this.phase === 'paused' || this.phase === 'fulltime') return;
    if (this.phase === 'goal') {
      this.phaseTimer += dt;
      // Celebrating players mill about
      if (this.phaseTimer > 3.2) {
        const conceded = (1 - this.goals[this.goals.length - 1].side) as Side;
        this.setupKickoff(conceded);
      }
      return;
    }
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
      // Nobody may steal the ball while the taker lines it up.
      if (this.ball.owner !== sp.taker && sp.timer < 8) { this.ball.owner = sp.taker; this.ball.pos = v(sp.spot.x, sp.spot.z); this.ball.vel = v(); }
      if (sp.timer > 8) this.pass(sp.taker, null); // taker dawdled: the referee hurries them up
    }
    const halfEnd = this.config.halfSeconds * this.half;
    if (this.clock >= halfEnd && this.ballIsCalm()) {
      if (this.half === 1) { this.phase = 'halftime'; this.phaseTimer = 0; this.events.push({ type: 'halftime' }); }
      else { this.phase = 'fulltime'; this.events.push({ type: 'fulltime' }); }
      return;
    }
    this.updateControlledSelection(input);
    for (const p of this.players) {
      p.kickCooldown = Math.max(0, p.kickCooldown - dt);
      p.tackleTimer = Math.max(0, p.tackleTimer - dt);
      p.holdTime = this.ball.owner === p ? p.holdTime + dt : 0;
      if (p !== this.controlled) p.stamina = Math.min(1, p.stamina + dt / 4);
      p.kickAnim = Math.max(0, p.kickAnim - dt * 4);
      p.diveAnim = Math.max(0, p.diveAnim - dt * 1.4);
      if (p === this.controlled) this.driveHuman(p, input, dt);
      else this.driveAI(p, dt);
    }
    this.integratePlayers(dt);
    this.integrateBall(dt);
    this.resolvePossession(dt);
    this.checkGoal();
  }

  private ballIsCalm(): boolean {
    // Don't blow the whistle mid-shot: wait until the ball is slow or owned.
    return this.ball.owner !== null || len(this.ball.vel) < 3;
  }

  // ---------- human ----------

  private updateControlledSelection(input: InputState): void {
    if (this.config.humanSide === null) return;
    const team = this.humanTeam;
    const outfield = team.filter((p) => !p.isKeeper);
    const b = this.ball;
    if (b.owner && b.owner.side === this.config.humanSide) {
      this.controlled = b.owner; // always control the player on the ball (keeper included)
      return;
    }
    if (input.switchPlayer && this.controlled) {
      const i = outfield.indexOf(this.controlled);
      this.controlled = outfield[(i + 1) % outfield.length];
      this.switchHold = 1.0;
      return;
    }
    this.switchHold = Math.max(0, this.switchHold - 1 / 60);
    if (this.switchHold > 0) return;
    // Auto-select the outfield player closest to where the ball is heading.
    const ahead = v(b.pos.x + b.vel.x * 0.4, b.pos.z + b.vel.z * 0.4);
    let best = this.controlled && !this.controlled.isKeeper ? this.controlled : outfield[0];
    let bestD = best ? dist(best.pos, ahead) - 0.8 : Infinity; // hysteresis favours current
    for (const p of outfield) {
      const d = dist(p.pos, ahead);
      if (d < bestD) { best = p; bestD = d; }
    }
    this.controlled = best;
  }

  private driveHuman(p: SimPlayer, input: InputState, _dt: number): void {
    if (this.phase === 'setpiece' && this.setPiece) {
      this.steer(p, v(), 30);
      if (p !== this.setPiece.taker) return;
      // The taker may turn and kick, but not run off with the ball.
      const aimV = v(input.moveX, input.moveZ);
      if (len(aimV) > 0.05) p.facing = Math.atan2(aimV.z, aimV.x);
      if (input.shootHeld) p.charge = Math.min(1, p.charge + _dt / 0.7);
      else if (p.charge > 0) { this.shoot(p, len(aimV) > 0.05 ? aimV : null, 0.7 + 0.45 * p.charge); p.charge = 0; }
      else if (input.pass && this.setPiece.kind === 'freekick') this.pass(p, len(aimV) > 0.05 ? aimV : null);
      return;
    }
    const want = v(input.moveX, input.moveZ);
    const l = len(want);
    const sprinting = input.sprint && l > 0.05 && p.stamina > 0.02;
    p.stamina = clamp(p.stamina + (sprinting ? -_dt / 3 : _dt / 5), 0, 1);
    const sprint = sprinting ? 1.18 : 1;
    const dribble = this.ball.owner === p ? 0.88 : 1;
    const max = this.stats.speed * sprint * dribble;
    const target = l > 0.05 ? v(want.x * max, want.z * max) : v();
    this.steer(p, target, 22);
    if (l > 0.05) p.facing = Math.atan2(want.z, want.x);
    if (this.ball.owner === p) {
      if (input.shootHeld) {
        p.charge = Math.min(1, p.charge + _dt / 0.7);
      } else if (p.charge > 0) {
        // Released: a tap is a quick medium shot, a full hold is a rocket.
        this.shoot(p, l > 0.05 ? want : null, 0.7 + 0.45 * p.charge);
        p.charge = 0;
      } else if (input.pass) {
        this.pass(p, l > 0.05 ? want : null);
      }
    } else {
      p.charge = 0;
    }
  }

  // ---------- AI ----------

  private driveAI(p: SimPlayer, dt: number): void {
    const diff = DIFF[this.config.difficulty];
    const isCpuTeam = p.side !== this.config.humanSide;
    p.think -= dt;
    const b = this.ball;
    const dir = p.side === 0 ? 1 : -1;
    const own = this.ownGoalX(p.side);
    const mates = this.teamOf(p.side);
    const opps = this.teamOf((1 - p.side) as Side);

    if (p.isKeeper) {
      this.driveKeeper(p, dt);
      return;
    }
    if (this.phase === 'setpiece' && this.setPiece) {
      const sp = this.setPiece;
      if (p !== sp.taker) { this.steer(p, v(), 30); return; }
      this.steer(p, v(), 30);
      p.facing = Math.atan2(0 - p.pos.z, this.goalX(p.side) - p.pos.x);
      if (sp.timer < 1.6) return;
      if (sp.kind === 'penalty') { this.shoot(p, null, rand(0.95, 1.15)); return; }
      const goal = v(this.goalX(p.side), 0);
      if (dist(p.pos, goal) < this.length * 0.4 && Math.abs(p.pos.z) < this.width * 0.35) { this.shoot(p, null, 1.05); return; }
      const mate = this.bestPassTarget(p, null);
      if (mate) this.pass(p, v(mate.pos.x - p.pos.x, mate.pos.z - p.pos.z)); else this.shoot(p, null, 1);
      return;
    }

    const teamHasBall = b.owner !== null && b.owner.side === p.side;
    const oppHasBall = b.owner !== null && b.owner.side !== p.side;

    if (b.owner === p) {
      // Carrier: make decisions a few times a second.
      if (p.think <= 0) {
        p.think = isCpuTeam ? diff.think : 0.3;
        const goal = v(this.goalX(p.side), 0);
        const dGoal = dist(p.pos, goal);
        const nearestOpp = this.nearest(opps, p.pos);
        const pressure = nearestOpp ? dist(nearestOpp.pos, p.pos) : 99;
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
        const tight = pressure < 1.3 * this.stats.scale + 0.45;
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
        p.aiTarget = v(p.pos.x + aim.x * 3, p.pos.z + aim.z * 3);
      }
      this.moveTowards(p, p.aiTarget, 0.88);
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
        const up = dir * (p.info.position === 'ATT' ? 5 : 2) * this.stats.scale;
        p.aiTarget = v(
          clamp(carrier.pos.x + up, -this.length / 2 + 2, this.length / 2 - 2),
          clamp(sideSign * this.width * 0.28 + (carrier.pos.z * 0.2), -this.width / 2 + 1, this.width / 2 - 1),
        );
        if (p.info.position === 'DEF') p.aiTarget.x = clamp(p.home.x + (b.pos.x - p.home.x) * 0.5, -this.length / 2 + 2, this.length / 2 - 2);
      } else {
        // Defend: drop between the ball and our goal, near the formation spot.
        const toBall = v(b.pos.x - p.home.x, b.pos.z - p.home.z);
        const shift = p.info.position === 'DEF' ? 0.35 : 0.55;
        p.aiTarget = v(p.home.x + toBall.x * shift, p.home.z + toBall.z * shift);
        const carrier = b.owner;
        const inOurHalf = carrier !== null && (carrier.pos.x - 0) * dir < 0;
        if (carrier && inOurHalf && p.info.position === 'DEF') {
          // Get goal-side of the dribbler and close them down.
          const toGoal = norm(v(own - carrier.pos.x, 0 - carrier.pos.z));
          const gap = dist(carrier.pos, p.pos) < 4 ? 0.6 : 1.6;
          p.aiTarget = v(carrier.pos.x + toGoal.x * gap, carrier.pos.z + toGoal.z * gap + (p.home.z >= 0 ? 0.4 : -0.4));
        } else if (carrier && inOurHalf) {
          // Attackers drop back to the halfway line to help.
          p.aiTarget = v(clamp(carrier.pos.x + dir * 3, -this.length / 2 + 2, this.length / 2 - 2), p.home.z * 0.6 + carrier.pos.z * 0.3);
        } else {
          // Mark the nearest opponent if they are close to our goal.
          const danger = opps.filter((o) => !o.isKeeper && Math.abs(o.pos.x - own) < this.length * 0.4);
          const m = this.nearest(danger, p.pos);
          if (m && p.info.position === 'DEF' && dist(m.pos, p.pos) < 5) {
            p.aiTarget = v(m.pos.x + (own - m.pos.x) * 0.25, m.pos.z + (0 - m.pos.z) * 0.25);
          }
        }
      }
      if (this.phase === 'kickoff' && !(this.kickoffSide === p.side && this.ball.owner === null)) {
        // Hold formation until the ball moves.
        p.aiTarget = v(p.home.x, p.home.z);
      }
    }
    this.moveTowards(p, p.aiTarget, 1);
  }

  private driveKeeper(p: SimPlayer, dt: number): void {
    const b = this.ball;
    const own = this.ownGoalX(p.side);
    const dir = p.side === 0 ? 1 : -1;
    const reach = this.stats.keeperReach;
    if (b.owner === p) {
      // Hold for a moment, then throw to the most open team-mate.
      p.think -= dt;
      if (p.think <= 0) {
        const mate = this.bestPassTarget(p, null);
        const opps = this.teamOf((1 - p.side) as Side);
        const presser = this.nearest(opps, p.pos);
        const mateMarked = mate ? dist(this.nearest(opps, mate.pos)?.pos ?? v(99, 99), mate.pos) < 2.5 : true;
        if (mate && !mateMarked) {
          this.pass(p, v(mate.pos.x - p.pos.x, mate.pos.z - p.pos.z), 1.1);
        } else {
          // Big clearance upfield, away from whoever is closest.
          const awayZ = presser ? Math.sign(p.pos.z - presser.pos.z) || 1 : (Math.random() < 0.5 ? -1 : 1);
          this.kick(p, v(dir, awayZ * rand(0.2, 0.6)), this.stats.power * 0.95, this.stats.power * 0.35);
        }
        p.think = 1;
      }
      this.steer(p, v(), 20);
      return;
    }
    const toGoal = b.vel.x * dir < -0.5; // ball travelling towards our goal
    const towardsUs = Math.abs(b.pos.x - own) < this.length * 0.5;
    let targetZ = clamp(b.pos.z * 0.6, -this.goalWidth / 2 + 0.3, this.goalWidth / 2 - 0.3);
    let targetX = own + dir * 0.7;
    const t = toGoal ? Math.abs((p.pos.x - b.pos.x) / (b.vel.x || 1e-6)) : 99;
    if (toGoal && t < 1.4 && towardsUs) {
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
        const out = clamp(Math.abs(b.owner.pos.x - own) * 0.45, 0.7, 2.6);
        targetX = own + dir * out;
        targetZ = clamp(b.owner.pos.z * 0.5, -this.goalWidth / 2, this.goalWidth / 2);
      }
    } else if (b.owner === null && len(b.vel) < 4 && dist(b.pos, p.pos) < 3 * this.stats.scale && Math.abs(b.pos.x - own) < 4.5) {
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
    const max = this.stats.speed * speedMul * p.speedMul * (p.isKeeper ? 0.95 : 1);
    const slow = Math.min(1, d / 0.8);
    const n = norm(to);
    this.steer(p, v(n.x * max * slow, n.z * max * slow), 18);
    if (d > 0.2 && !p.isKeeper) p.facing = Math.atan2(n.z, n.x);
  }

  private integratePlayers(dt: number): void {
    const L = this.length / 2 - 0.3, W = this.width / 2 - 0.3;
    for (const p of this.players) {
      p.pos.x += p.vel.x * dt;
      p.pos.z += p.vel.z * dt;
      p.distanceRun += len(p.vel) * dt;
      // Keep inside the boards (keepers may stand inside the goal mouth).
      const extra = p.isKeeper ? this.goalDepth * 0.5 : 0;
      p.pos.x = clamp(p.pos.x, -L - extra, L + extra);
      p.pos.z = clamp(p.pos.z, -W, W);
    }
    if (this.phase === 'setpiece' && this.setPiece) {
      const sp = this.setPiece;
      const centre = sp.kind === 'penalty' ? v(this.goalX(sp.side), 0) : sp.spot;
      const radius = sp.kind === 'penalty' ? this.width * 0.26 + 0.8 : 3;
      const defendingKeeper = this.teamOf((1 - sp.side) as Side).find((k) => k.isKeeper);
      for (const p of this.players) {
        if (p === sp.taker || p === defendingKeeper) continue;
        if (sp.kind === 'freekick' && p.side === sp.side) continue;
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
          const push = (min - d) / 2;
          const n = norm(v(b.pos.x - a.pos.x, b.pos.z - a.pos.z));
          a.pos.x -= n.x * push; a.pos.z -= n.z * push;
          b.pos.x += n.x * push; b.pos.z += n.z * push;
        }
      }
    }
  }

  private integrateBall(dt: number): void {
    const b = this.ball;
    if (b.owner) {
      // Glue the ball just in front of the dribbler's feet.
      const o = b.owner;
      const ahead = 0.3 * this.stats.scale + 0.15;
      const target = v(o.pos.x + Math.cos(o.facing) * ahead, o.pos.z + Math.sin(o.facing) * ahead);
      b.vel = v((target.x - b.pos.x) * 18, (target.z - b.pos.z) * 18);
      b.pos.x += b.vel.x * dt;
      b.pos.z += b.vel.z * dt;
      b.y = Math.max(0, b.y - 6 * dt);
      b.vy = 0;
      b.spin += len(o.vel) * dt / b.radius;
      return;
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
    // Rebound boards all round the pitch, with a gap for each goal mouth.
    const L = this.length / 2, W = this.width / 2, r = b.radius;
    if (b.pos.z > W - r) { b.pos.z = W - r; b.vel.z = -Math.abs(b.vel.z) * 0.55; }
    if (b.pos.z < -W + r) { b.pos.z = -W + r; b.vel.z = Math.abs(b.vel.z) * 0.55; }
    const inMouth = Math.abs(b.pos.z) < this.goalWidth / 2 - r && b.y < this.goalHeight - r;
    if (!inMouth) {
      if (b.pos.x > L - r) { b.pos.x = L - r; b.vel.x = -Math.abs(b.vel.x) * 0.55; }
      if (b.pos.x < -L + r) { b.pos.x = -L + r; b.vel.x = Math.abs(b.vel.x) * 0.55; }
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
      // Tackles: an opponent close to the ball may win it.
      for (const p of this.players) {
        if (p.side === o.side || p.kickCooldown > 0) continue;
        const d = dist(p.pos, b.pos);
        if (d < controlR * 0.95) {
          const isCpu = p.side !== this.config.humanSide;
          const diff = DIFF[this.config.difficulty];
          const base = p.isKeeper ? 0.95 : 0.5;
          // Tackling head-on is much easier than chasing from behind.
          const toBall = norm(v(b.pos.x - p.pos.x, b.pos.z - p.pos.z));
          const facingDot = toBall.x * Math.cos(o.facing) + toBall.z * Math.sin(o.facing);
          const angle = facingDot < 0 ? 1 : 0.35; // negative = we are in front of the dribbler
          const chance = base * angle * (isCpu ? diff.tackle : diff.humanTackle) * (0.6 + this.stats.control * 0.6);
          if (p.tackleTimer <= 0) {
            p.tackleTimer = 0.45;
            const won = Math.random() < chance;
            if (!won && facingDot >= 0 && len(p.vel) > 2.5 && this.phase === 'play' && Math.random() < 0.28) {
              this.awardFoul(p, o);
              return;
            }
            if (won) {
              // Ball changes hands and squirts loose a little.
              b.owner = null;
              o.kickCooldown = 0.5;
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
      const reach = p.isKeeper ? (p.diveAnim > 0 ? this.stats.keeperReach : this.stats.keeperReach * 0.55) : controlR;
      const maxHeight = p.isKeeper ? this.goalHeight : 0.6 * this.stats.scale + 0.2;
      if (d < reach && b.y < maxHeight && d < bd) { bd = d; best = p; }
    }
    if (best) {
      const ballSpeed = len(b.vel);
      if (best.isKeeper && ballSpeed > 3.5) {
        // One save attempt per shot, judged at the ball's closest approach. Comfortable
        // balls are caught; the rest is a dive whose odds fall with distance and shot speed.
        if (b.keeperTried === b.flightId) return;
        const reach = this.stats.keeperReach;
        const easy = reach * 0.5;
        const rel = v(b.pos.x - best.pos.x, b.pos.z - best.pos.z);
        const closing = rel.x * b.vel.x + rel.z * b.vel.z < 0;
        if (closing && bd > easy * 0.6) return; // still getting closer: wait for the nearest point
        b.keeperTried = b.flightId;
        const speedFactor = clamp(1.5 - (0.7 * ballSpeed) / this.stats.power, 0.4, 1);
        const pSave = bd < easy ? 0.97 * Math.max(speedFactor, 0.75) : clamp(1 - (bd - easy) / (reach - easy), 0, 1) * speedFactor;
        if (Math.random() > pSave) return; // beaten
        this.events.push({ type: 'save', side: best.side, player: best.info });
        const dir = best.side === 0 ? 1 : -1; // away from our own goal
        if (bd > easy || ballSpeed > this.stats.power * 1.05) {
          // Parry: the ball flies back out towards the pitch, not into the net.
          const sideways = Math.sign(b.pos.z - best.pos.z) || (Math.random() < 0.5 ? -1 : 1);
          b.vel = v(dir * ballSpeed * rand(0.15, 0.35), sideways * ballSpeed * rand(0.45, 0.7));
          b.vy = rand(1, 3);
          best.kickCooldown = 0.35;
          best.diveAnim = Math.max(best.diveAnim, 0.9);
          best.diveDir = sideways;
          b.lastTouch = best;
          return;
        }
      } else {
        // Fast balls are harder to bring under control.
        const skill = this.stats.control;
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
      b.owner = best;
      b.lastTouch = best;
      b.vy = 0; b.y = 0;
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
    if (penalty && victim.isKeeper) taker = this.teamOf(side).find((m) => m.info.position === 'ATT') ?? victim;
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
    this.setPiece = { kind: penalty ? 'penalty' : 'freekick', side, taker, spot, timer: 0 };
    this.phase = 'setpiece';
    if (this.config.humanSide === side) this.controlled = taker;
    this.events.push({ type: 'foul', side: offender.side, player: offender.info, kind: penalty ? 'penalty' : 'freekick' });
  }

  shoot(p: SimPlayer, aim: V2 | null, powerMul = 1): void {
    const goal = v(this.goalX(p.side), 0);
    const isCpu = p.side !== this.config.humanSide;
    const acc = isCpu ? DIFF[this.config.difficulty].accuracy : 1;
    // Aim at a corner, with a wobble that shrinks with control.
    const spread = (1 - this.stats.control) * 0.9 + (isCpu ? (1 - acc) * 0.8 : 0.15);
    const targetZ = clamp(rand(-this.goalWidth / 2, this.goalWidth / 2) * 0.75 + rand(-spread, spread), -this.goalWidth * 0.6, this.goalWidth * 0.6);
    let dir = v(goal.x - p.pos.x, targetZ - p.pos.z);
    if (aim) {
      // The human's stick biases the shot direction.
      const a = norm(aim);
      const g = norm(dir);
      dir = norm(v(g.x * 0.55 + a.x * 0.45, g.z * 0.55 + a.z * 0.45));
    }
    const d = dist(p.pos, goal);
    const power = this.stats.power * clamp(0.75 + d / this.length, 0.8, 1.15) * powerMul;
    const loft = power * rand(0.06, 0.2) * (powerMul > 1 ? 1.3 : 1);
    this.kick(p, dir, power, loft);
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
    const wobble = (1 - this.stats.control) * 0.35;
    const a = Math.atan2(dir.z, dir.x) + rand(-wobble, wobble);
    dir = v(Math.cos(a), Math.sin(a));
    const speed = clamp(3.5 + d * 0.65, 4.5, this.stats.power * 0.72) * speedMul;
    this.kick(p, dir, speed, 0);
  }

  private checkGoal(): void {
    const b = this.ball;
    const L = this.length / 2;
    if (Math.abs(b.pos.x) > L + b.radius && Math.abs(b.pos.z) < this.goalWidth / 2 && b.y < this.goalHeight) {
      const scoringSide: Side = b.pos.x > 0 ? 0 : 1; // ball in +x goal means home scored
      // Deflections off a defender or keeper still count for the shooter.
      const touch = b.lastKick ?? b.lastTouch ?? this.teamOf(scoringSide)[0];
      const ownGoal = touch.side !== scoringSide;
      const scorer = touch.info;
      this.score[scoringSide]++;
      this.goals.push({ side: scoringSide, scorer, minute: this.minute, ownGoal });
      this.phase = 'goal';
      this.phaseTimer = 0;
      b.owner = null;
      this.events.push({ type: 'goal', side: scoringSide, player: scorer });
    }
  }
}
