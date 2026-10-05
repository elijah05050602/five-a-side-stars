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
}

export type Phase = 'kickoff' | 'play' | 'goal' | 'halftime' | 'fulltime' | 'paused';

export interface GoalEvent { side: Side; scorer: Player; minute: number; ownGoal: boolean }

export interface SimEvent {
  type: 'goal' | 'kickoff' | 'halftime' | 'fulltime' | 'save' | 'kick' | 'whistle';
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
  easy: { speed: 0.85, think: 0.55, accuracy: 0.6, tackle: 0.6, shootRange: 0.3 },
  normal: { speed: 1.0, think: 0.35, accuracy: 0.8, tackle: 0.9, shootRange: 0.38 },
  hard: { speed: 1.08, think: 0.2, accuracy: 1.0, tackle: 1.2, shootRange: 0.45 },
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
    this.ball = { pos: v(), y: 0, vel: v(), vy: 0, radius: 0.08 + 0.04 * this.stats.scale, spin: 0, owner: null, lastTouch: null };
    const diff = DIFF[config.difficulty];
    ([0, 1] as Side[]).forEach((side) => {
      const team = this.teams[side];
      const isCpu = config.humanSide !== side;
      team.players.slice(0, 5).forEach((info) => {
        const p: SimPlayer = {
          id: info.id, side, info, pos: v(), vel: v(), facing: side === 0 ? 0 : Math.PI,
          radius: 0.28 * this.stats.scale + 0.08, home: v(), kickCooldown: 0, think: Math.random() * 0.3,
          aiTarget: v(), kickAnim: 0, diveAnim: 0, diveDir: 1, distanceRun: 0, isKeeper: info.position === 'GK',
          speedMul: isCpu ? diff.speed : 1,
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
    else if (this.phase === 'play' || this.phase === 'kickoff') { this.lastPhase = this.phase; this.phase = 'paused'; }
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
    const halfEnd = this.config.halfSeconds * this.half;
    if (this.clock >= halfEnd && this.ballIsCalm()) {
      if (this.half === 1) { this.phase = 'halftime'; this.phaseTimer = 0; this.events.push({ type: 'halftime' }); }
      else { this.phase = 'fulltime'; this.events.push({ type: 'fulltime' }); }
      return;
    }
    this.updateControlledSelection(input);
    for (const p of this.players) {
      p.kickCooldown = Math.max(0, p.kickCooldown - dt);
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
    const want = v(input.moveX, input.moveZ);
    const sprint = input.sprint ? 1.28 : 1;
    const l = len(want);
    const target = l > 0.05 ? v(want.x * this.stats.speed * sprint, want.z * this.stats.speed * sprint) : v();
    this.steer(p, target, 22);
    if (l > 0.05) p.facing = Math.atan2(want.z, want.x);
    if (this.ball.owner === p) {
      if (input.shoot) this.shoot(p, l > 0.05 ? want : null);
      else if (input.pass) this.pass(p, l > 0.05 ? want : null);
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
        if (dGoal < range && angleClear && (pressure > 1.2 || dGoal < range * 0.6)) {
          this.shoot(p, null);
          return;
        }
        if (pressure < 1.6 * this.stats.scale + 0.6) {
          const mate = this.bestPassTarget(p, null);
          if (mate && Math.random() < 0.8) {
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
      this.moveTowards(p, p.aiTarget, 0.95);
      return;
    }

    if (p.think <= 0) {
      p.think = isCpuTeam ? diff.think : 0.25;
      const chaser = this.nearestOutfield(mates, b.pos);
      const ballLoose = b.owner === null;
      if ((ballLoose || oppHasBall) && chaser === p && this.phase !== 'kickoff') {
        // Chase the ball (lead it a little).
        p.aiTarget = v(b.pos.x + b.vel.x * 0.25, b.pos.z + b.vel.z * 0.25);
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
        // Mark the nearest opponent if they are close to our goal.
        const danger = opps.filter((o) => !o.isKeeper && Math.abs(o.pos.x - own) < this.length * 0.4);
        const m = this.nearest(danger, p.pos);
        if (m && p.info.position === 'DEF' && dist(m.pos, p.pos) < 5) {
          p.aiTarget = v(m.pos.x + (own - m.pos.x) * 0.25, m.pos.z + (0 - m.pos.z) * 0.25);
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
        const mate = this.bestPassTarget(p, null) ?? this.nearestOutfield(this.teamOf(p.side), p.pos);
        if (mate) this.pass(p, v(mate.pos.x - p.pos.x, mate.pos.z - p.pos.z), 1.1);
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
    } else if (b.owner === null && dist(b.pos, p.pos) < 3.5 * this.stats.scale && Math.abs(b.pos.x - own) < 5) {
      // Come and collect a loose ball near the goal.
      targetX = b.pos.x; targetZ = b.pos.z;
    }
    const speed = p.diveAnim > 0 ? 1.6 : 1.1;
    this.moveTowards(p, v(targetX, targetZ), speed);
    p.facing = Math.atan2(b.pos.z - p.pos.z, b.pos.x - p.pos.x);
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
    const friction = onGround ? 2.6 : 0.4;
    const drag = 0.06;
    const newSpeed = Math.max(0, speed - (friction + drag * speed) * dt);
    if (speed > 1e-4) b.vel = v((b.vel.x / speed) * newSpeed, (b.vel.z / speed) * newSpeed);
    b.pos.x += b.vel.x * dt;
    b.pos.z += b.vel.z * dt;
    b.spin += newSpeed * dt / b.radius;
    // Rebound boards all round the pitch, with a gap for each goal mouth.
    const L = this.length / 2, W = this.width / 2, r = b.radius;
    if (b.pos.z > W - r) { b.pos.z = W - r; b.vel.z = -Math.abs(b.vel.z) * 0.7; }
    if (b.pos.z < -W + r) { b.pos.z = -W + r; b.vel.z = Math.abs(b.vel.z) * 0.7; }
    const inMouth = Math.abs(b.pos.z) < this.goalWidth / 2 - r && b.y < this.goalHeight - r;
    if (!inMouth) {
      if (b.pos.x > L - r) { b.pos.x = L - r; b.vel.x = -Math.abs(b.vel.x) * 0.7; }
      if (b.pos.x < -L + r) { b.pos.x = -L + r; b.vel.x = Math.abs(b.vel.x) * 0.7; }
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
    if (b.owner) {
      const o = b.owner;
      // Tackles: an opponent close to the ball may win it.
      for (const p of this.players) {
        if (p.side === o.side || p.kickCooldown > 0) continue;
        const d = dist(p.pos, b.pos);
        if (d < controlR * 0.9) {
          const isCpu = p.side !== this.config.humanSide;
          const diff = DIFF[this.config.difficulty];
          const base = p.isKeeper ? 0.9 : 0.5;
          const chance = base * (isCpu ? diff.tackle : 1 / (DIFF[this.config.difficulty].tackle)) * (0.6 + this.stats.control * 0.6);
          if (this.pressureTimer <= 0) {
            this.pressureTimer = 0.45;
            if (Math.random() < chance * 0.9) {
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
      // Fast balls are harder to bring under control; keepers are better at it.
      const skill = best.isKeeper ? 0.9 : this.stats.control;
      const hard = ballSpeed > 6 * (0.5 + skill);
      if (hard && Math.random() > skill * 0.8) {
        // Fluffed touch: ball deflects.
        b.vel = v(b.vel.x * 0.45 + rand(-1.5, 1.5), b.vel.z * 0.45 + rand(-1.5, 1.5));
        if (b.vy < 0) b.vy = 0;
        best.kickCooldown = 0.25;
        b.lastTouch = best;
        return;
      }
      if (best.isKeeper && ballSpeed > 4) this.events.push({ type: 'save', side: best.side, player: best.info });
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
    p.kickCooldown = 0.35;
    p.kickAnim = 1;
    p.facing = Math.atan2(n.z, n.x);
    if (this.phase === 'kickoff') this.phase = 'play';
    this.events.push({ type: 'kick', side: p.side, player: p.info });
  }

  shoot(p: SimPlayer, aim: V2 | null): void {
    const goal = v(this.goalX(p.side), 0);
    const isCpu = p.side !== this.config.humanSide;
    const acc = isCpu ? DIFF[this.config.difficulty].accuracy : 1;
    // Aim at a corner, with a wobble that shrinks with control.
    const spread = (1 - this.stats.control) * 1.4 + (isCpu ? (1 - acc) * 1.2 : 0.2);
    const targetZ = clamp(rand(-this.goalWidth / 2, this.goalWidth / 2) * 0.7 + rand(-spread, spread), -this.goalWidth, this.goalWidth);
    let dir = v(goal.x - p.pos.x, targetZ - p.pos.z);
    if (aim) {
      // The human's stick biases the shot direction.
      const a = norm(aim);
      const g = norm(dir);
      dir = norm(v(g.x * 0.55 + a.x * 0.45, g.z * 0.55 + a.z * 0.45));
    }
    const d = dist(p.pos, goal);
    const power = this.stats.power * clamp(0.75 + d / this.length, 0.8, 1.15);
    const loft = power * rand(0.08, 0.22);
    this.kick(p, dir, power, loft);
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
    const speed = clamp(4 + d * 0.75, 5, this.stats.power * 0.8) * speedMul;
    this.kick(p, dir, speed, 0);
  }

  private checkGoal(): void {
    const b = this.ball;
    const L = this.length / 2;
    if (Math.abs(b.pos.x) > L + b.radius && Math.abs(b.pos.z) < this.goalWidth / 2 && b.y < this.goalHeight) {
      const scoringSide: Side = b.pos.x > 0 ? 0 : 1; // ball in +x goal means home scored
      const touch = b.lastTouch ?? this.teamOf(scoringSide)[0];
      const ownGoal = touch.side !== scoringSide;
      const scorer = ownGoal ? touch.info : touch.info;
      this.score[scoringSide]++;
      this.goals.push({ side: scoringSide, scorer, minute: this.minute, ownGoal });
      this.phase = 'goal';
      this.phaseTimer = 0;
      b.owner = null;
      this.events.push({ type: 'goal', side: scoringSide, player: scorer });
    }
  }
}
