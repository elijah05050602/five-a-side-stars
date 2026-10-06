import type { MatchSim, SimEvent, SimPlayer, Side } from './sim';

/**
 * A match commentator: turns simulation events into short, kid-friendly
 * lines that know the score, the clock and who did what. Also watches each
 * shot so a miss can be called "wide", "over" or "off the bar", and fills
 * quiet spells with a line about the play. Everything here is plain data
 * and arithmetic so it can be unit tested without a browser.
 */
export type MissKind = 'wide' | 'over' | 'bar' | 'post' | 'gathered';

export interface ShotWatch {
  side: Side;
  shooterName: string;
  flightId: number;
  from: { x: number; z: number };
  age: number;
}

const pickFrom = (lines: string[], rng: () => number) => lines[Math.floor(rng() * lines.length) % lines.length];

/** Replace {name}-style tokens. */
function fill(line: string, vars: Record<string, string | number>): string {
  return line.replace(/\{(\w+)\}/g, (_, k: string) => String(vars[k] ?? ''));
}

export const LINES = {
  kickoffFirst: ['And we are off! {home} against {away}.', 'The whistle goes and {home} get us started!', 'Here we go! {home} versus {away}.', 'Kick off! Big match, this one.'],
  kickoffSecond: ['Second half under way. It is {score}.', 'Back out for the second half, {score} so far.', 'Orange slices eaten, here comes the second half!'],
  kickoffAfterGoal: ['{team} get us going again.', 'Back to the centre, {team} to restart.', 'Deep breaths, {team}. Off we go again.'],
  goalOpener: ['GOAL! {scorer} opens the scoring for {team}!', '{scorer} puts {team} in front! 1-0!', 'First goal of the game, and it is {scorer}!'],
  goalEqualiser: ['{scorer} levels it up! {score}!', 'All square again! {scorer} scores for {team}.', 'Equaliser! {team} are back in it thanks to {scorer}.'],
  goalLead: ['{scorer} makes it {score}! {team} lead!', 'Another one for {team}! {scorer} scores!', '{team} pull ahead, {scorer} with the goal.'],
  goalExtend: ['{scorer} again! {team} are running away with this, {score}.', 'That is {score}! {scorer} adds another for {team}.', 'The scoreboard says {score}. {team} are flying!'],
  goalReply: ['{team} pull one back! {scorer} with the goal, {score}.', '{scorer} gives {team} hope! {score}.', 'Game on? {scorer} scores for {team}. {score}.'],
  goalBrace: ['Two for {scorer}! What a game they are having.', '{scorer} doubles up! {score}.'],
  goalHatTrick: ['HAT-TRICK! {scorer} has three! Someone give them the ball to keep!', 'Three goals for {scorer}! A hat-trick hero!'],
  goalLate: ['Late drama! {scorer} scores for {team} with the clock nearly up! {score}!', 'Right at the death! {scorer} makes it {score}!'],
  goalOwn: ['Oh no! Into their own net. {score}.', 'Unlucky! {scorer} turns it into their own goal. {score}.', 'That one went the wrong way for {scorer}. {score}.'],
  goalPenalty: ['{scorer} steps up and SCORES from the spot! {score}.', 'Cool as a cucumber from the penalty spot, {scorer}! {score}.'],
  goalLongRange: ['From miles out! {scorer} with a screamer for {team}! {score}.', 'What a hit! {scorer} from distance! {score}!'],
  goalTraining: ['In it goes!', 'Lovely finish!', 'That is the spot!', 'Keeper beaten!', 'Bottom corner!'],
  goalRocket: ['ROCKET! Two points for that one!', 'Smashed it! A two-pointer!'],
  goalShootout: ['{scorer} scores! {score} in the shoot-out.', 'Tucked away by {scorer}. {score}.', 'No mistake from {scorer}! {score}.'],
  save: ['Great save by {keeper}!', '{keeper} gets a hand to it!', 'Super stop from {keeper}!', 'Safe hands, {keeper}!', '{keeper} says no!'],
  saveFromShooter: ['{keeper} keeps out {shooter}!', '{shooter} shoots, {keeper} saves!', 'Denied! {keeper} stops {shooter} in their tracks.'],
  missWide: ['{shooter} drags it wide!', 'Just past the post from {shooter}!', 'Wide! {shooter} will want that one again.', 'So close, {shooter}!'],
  missOver: ['Over the bar from {shooter}!', '{shooter} leans back and it sails over.', 'Up and over! Unlucky, {shooter}.'],
  missBar: ['Off the crossbar! {shooter} so nearly scored!', 'CLANG! {shooter} hits the bar!', 'The bar is still shaking! {shooter} was inches away.'],
  missPost: ['Off the post! {shooter} is so unlucky!', 'Post! {shooter} hits the woodwork!'],
  missGathered: ['{keeper} gathers it comfortably.', 'Straight at {keeper}, who holds on.', 'Easy for {keeper}.'],
  shootoutMiss: ['Missed! {shooter} will be kicking themselves.', 'Wide from the spot! {shooter} looks gutted.', 'Saved or missed, it does not count! Pressure on.'],
  foul: ['Foul by {offender}! Free kick to {team}.', 'The referee spots a foul by {offender}. Free kick.', 'Ooh, a trip by {offender}. {team} have a free kick.'],
  penalty: ['PENALTY to {team}! {offender} gave that away.', 'Penalty! The referee points to the spot for {team}.'],
  halftimeLevel: ['Half time and it is level at {score}. All to play for!', 'Half time, {score}. Nothing between these two.'],
  halftimeLead: ['Half time: {leader} lead {score}.', '{leader} go in at half time {score} up.'],
  fulltimeDraw: ['Full time! It finishes {score}. A draw, and a point each.', 'The whistle goes: {score}. Honours even.'],
  fulltimeWin: ['Full time! {winner} win it {score}!', 'That is that! {winner} take the three points, {score}.', 'It is all over, and {winner} have done it! {score}.'],
  fulltimeThrashing: ['Full time, and what a performance by {winner}! {score}!', 'A rout! {winner} win {score}!'],
  shootoutOver: ['The shoot-out is over! {winner} win it {score}!', '{winner} hold their nerve! {score} on penalties.'],
  trainingOver: ['Time is up! {points} points. Nice shooting!', 'That is the session done: {points} points on the board.'],
  quietPossession: ['{team} passing it around nicely.', '{owner} looking for a pass.', 'Patient stuff from {team}.', '{team} building from the back.'],
  quietAttack: ['{team} pushing forward now.', '{owner} driving at the defence!', 'Here come {team}!', '{owner} has space to run into.'],
  quietDefence: ['{team} have it deep in their own half.', '{owner} looking for a way out of there.', 'Careful, {team}, the ball is near your own goal.'],
  quietLoose: ['The ball is loose in the middle!', 'Everybody chasing the ball!', 'Scrappy stuff in midfield.'],
  quietKeeper: ['{keeper} has not had much to do yet.', 'Quiet afternoon so far for {keeper} in goal.'],
  quietRain: ['The rain is really coming down now.', 'Slippery out there in the rain!', 'Puddles forming, but nobody is going home.'],
  quietSnow: ['Snow on the pitch! Lovely stuff.', 'Hats and gloves weather today.', 'The orange ball would be handy in this snow.'],
  quietNight: ['Floodlights on, and it looks magical out there.', 'A night game under the lights!'],
  quietSunset: ['What a sunset over the pitch.', 'Golden evening for a game of football.'],
  lastMinute: ['One minute left! Is there time for one more?', 'Into the final minute!'],
  twoPlayer: ['Two players, one keyboard. Who is bossing it?', 'Sibling rivalry, is it?'],
} as const;

export type LineKey = keyof typeof LINES;

export function line(key: LineKey, vars: Record<string, string | number> = {}, rng: () => number = Math.random): string {
  return fill(pickFrom([...LINES[key]], rng), vars);
}

export const scoreText = (s: readonly [number, number]) => `${s[0]}-${s[1]}`;

/**
 * Pick the right line for a goal from the score after it, who scored and how.
 * `scorerGoals` counts this goal, `minute` is on the 0..40 shown clock.
 */
export interface GoalInfo {
  score: readonly [number, number]; side: Side; scorer: string; team: string; ownGoal: boolean; minute: number; scorerGoals: number;
  penalty?: boolean; longRange?: boolean; mode: 'match' | 'shootout' | 'training'; rocket?: boolean;
}

/** Which kind of goal line fits, from the score after it, who scored and how. */
export function goalKey(o: GoalInfo, rng: () => number = Math.random): LineKey {
  if (o.mode === 'training') return o.rocket ? 'goalRocket' : 'goalTraining';
  if (o.mode === 'shootout') return 'goalShootout';
  if (o.ownGoal) return 'goalOwn';
  if (o.scorerGoals === 3) return 'goalHatTrick';
  if (o.minute >= 37) return 'goalLate';
  if (o.penalty) return 'goalPenalty';
  if (o.longRange) return 'goalLongRange';
  if (o.scorerGoals === 2 && rng() < 0.6) return 'goalBrace';
  const us = o.score[o.side], them = o.score[1 - o.side];
  if (us + them === 1) return 'goalOpener';
  if (us === them) return 'goalEqualiser';
  if (us < them) return 'goalReply';
  if (us - them >= 3) return 'goalExtend';
  return 'goalLead';
}

/**
 * Pick the right line for a goal from the score after it, who scored and how.
 * `scorerGoals` counts this goal, `minute` is on the 0..40 shown clock.
 */
export function goalLine(o: GoalInfo, rng: () => number = Math.random): string {
  return line(goalKey(o, rng), { score: scoreText(o.score), scorer: o.scorer, team: o.team }, rng);
}

/**
 * Decide what became of a shot from where the ball is now. `dir` is the
 * attacking direction (+1 for home). Returns null while the shot is still live.
 */
export function classifyShot(b: { x: number; y: number; z: number; vx: number; ownerIsKeeper: boolean; ownerSide: Side | null }, dims: { halfLength: number; goalWidth: number; goalHeight: number; radius: number }, dir: 1 | -1, side: Side): MissKind | null {
  if (b.ownerSide !== null) return b.ownerIsKeeper && b.ownerSide !== side ? 'gathered' : null;
  const atLine = b.x * dir >= dims.halfLength - dims.radius - 0.08;
  const comingBack = b.vx * dir < 0;
  if (!atLine || !comingBack) return null;
  const inMouth = Math.abs(b.z) < dims.goalWidth / 2 - dims.radius;
  if (inMouth) {
    if (b.y >= dims.goalHeight + dims.radius) return 'over';
    if (b.y >= dims.goalHeight - dims.radius - 0.05) return 'bar';
    return null; // it is in the goal, the goal event will say so
  }
  return Math.abs(b.z) < dims.goalWidth / 2 + 0.35 ? 'post' : 'wide';
}

export interface Conditions { weather: 'clear' | 'cloudy' | 'rain' | 'snow'; time: 'day' | 'sunset' | 'night' }

export class Commentator {
  private watch: ShotWatch | null = null;
  private quiet = 12;
  private saidLastMinute = false;
  private afterGoal = false;
  private saidTwoPlayer = false;
  private lastSaveShooter: string | null = null;
  private readonly goalsBy = new Map<string, number>();
  /** Told about every line said, with the score when the line calls for it, so a voice can speak it. */
  onSay: ((key: LineKey, score?: readonly [number, number]) => void) | null = null;

  constructor(private readonly conditions: Conditions = { weather: 'clear', time: 'day' }, private readonly rng: () => number = Math.random) {}

  private teamName(sim: MatchSim, side: Side): string { return sim.teams[side].name; }

  private say(key: LineKey, vars: Record<string, string | number>, score?: readonly [number, number]): string {
    this.onSay?.(key, score);
    return line(key, vars, this.rng);
  }

  /** One line per event (or null), in the order the events came. */
  onEvents(sim: MatchSim, events: SimEvent[]): (string | null)[] {
    const out: (string | null)[] = [];
    for (const ev of events) {
      const l = this.onEvent(sim, ev);
      if (l) this.quiet = 0;
      out.push(l);
    }
    return out;
  }

  private onEvent(sim: MatchSim, ev: SimEvent): string | null {
    const rng = this.rng;
    switch (ev.type) {
      case 'kickoff': {
        if (sim.mode !== 'match') return null;
        if (this.afterGoal) { this.afterGoal = false; return this.say('kickoffAfterGoal', { team: this.teamName(sim, ev.side ?? 0) }); }
        if (sim.half === 2) return this.say('kickoffSecond', { score: scoreText(sim.score) });
        return this.say('kickoffFirst', { home: sim.teams[0].name, away: sim.teams[1].name });
      }
      case 'shot': {
        const b = sim.ball;
        this.watch = { side: ev.side!, shooterName: ev.player?.name ?? 'the striker', flightId: b.flightId, from: { x: b.pos.x, z: b.pos.z }, age: 0 };
        return null;
      }
      case 'save': {
        const shooter = this.watch && this.watch.side !== ev.side ? this.watch.shooterName : null;
        this.lastSaveShooter = shooter;
        this.watch = null;
        return shooter ? this.say('saveFromShooter', { keeper: ev.player?.name ?? 'the keeper', shooter }) : this.say('save', { keeper: ev.player?.name ?? 'the keeper' });
      }
      case 'miss': {
        // Shoot-out only: the sim raises this when a penalty is missed or saved.
        const shooter = this.watch?.shooterName ?? 'the taker';
        this.watch = null;
        return this.say('shootoutMiss', { shooter });
      }
      case 'goal': {
        const g = sim.goals[sim.goals.length - 1];
        const w = this.watch;
        this.watch = null;
        if (!g) return null;
        this.afterGoal = true;
        const key = g.scorer.id;
        const n = g.ownGoal ? 0 : (this.goalsBy.get(key) ?? 0) + 1;
        if (!g.ownGoal) this.goalsBy.set(key, n);
        const longRange = !!w && Math.abs(sim.goalX(g.side) - w.from.x) > sim.length * 0.4;
        const rocket = sim.mode === 'training' && Math.hypot(sim.ball.vel.x, sim.ball.vel.z) > sim.stats.power * 0.95;
        const info: GoalInfo = { score: sim.score, side: g.side, scorer: g.scorer.name, team: this.teamName(sim, g.side), ownGoal: g.ownGoal, minute: g.minute, scorerGoals: n, penalty: sim.ball.penaltyShot && sim.mode === 'match', longRange, mode: sim.mode === 'tutorial' ? 'training' : sim.mode, rocket };
        const scoreCall = info.mode === 'match' ? sim.score : undefined;
        return this.say(goalKey(info, rng), { score: scoreText(info.score), scorer: info.scorer, team: info.team }, scoreCall);
      }
      case 'foul': {
        const team = this.teamName(sim, (1 - ev.side!) as Side);
        const offender = ev.player?.name ?? 'someone';
        return this.say(ev.kind === 'penalty' ? 'penalty' : 'foul', { team, offender });
      }
      case 'halftime': {
        const [h, a] = sim.score;
        if (h === a) return this.say('halftimeLevel', { score: scoreText(sim.score) }, sim.score);
        const leader = h > a ? 0 : 1;
        return this.say('halftimeLead', { leader: this.teamName(sim, leader), score: leader === 0 ? `${h}-${a}` : `${a}-${h}` }, sim.score);
      }
      case 'fulltime': {
        const [h, a] = sim.score;
        if (sim.mode === 'training') return this.say('trainingOver', { points: sim.trainingPoints });
        if (sim.mode === 'shootout') return this.say('shootoutOver', { winner: this.teamName(sim, h > a ? 0 : 1), score: h > a ? `${h}-${a}` : `${a}-${h}` });
        if (h === a) return this.say('fulltimeDraw', { score: scoreText(sim.score) }, sim.score);
        const winner = h > a ? 0 : 1;
        const score = winner === 0 ? `${h}-${a}` : `${a}-${h}`;
        return this.say(Math.abs(h - a) >= 4 ? 'fulltimeThrashing' : 'fulltimeWin', { winner: this.teamName(sim, winner), score }, sim.score);
      }
      default:
        return null;
    }
  }

  /** Call every frame: resolves watched shots and fills quiet spells. */
  onFrame(sim: MatchSim, dt: number): string | null {
    const rng = this.rng;
    if (this.watch && sim.mode !== 'shootout') {
      const w = this.watch;
      w.age += dt;
      const b = sim.ball;
      if (b.flightId !== w.flightId || w.age > 3.5 || sim.phase === 'goal') { this.watch = null; }
      else {
        const dir: 1 | -1 = w.side === 0 ? 1 : -1;
        const kind = classifyShot({ x: b.pos.x, y: b.y, z: b.pos.z, vx: b.vel.x, ownerIsKeeper: !!b.owner?.isKeeper, ownerSide: b.owner ? b.owner.side : null }, { halfLength: sim.length / 2, goalWidth: sim.goalWidth, goalHeight: sim.goalHeight, radius: b.radius }, dir, w.side);
        if (kind) {
          this.watch = null;
          this.quiet = 0;
          const keeper = sim.teamOf((1 - w.side) as Side).find((p) => p.isKeeper)?.info.name ?? 'the keeper';
          if (kind === 'gathered' && this.lastSaveShooter === w.shooterName) { this.lastSaveShooter = null; return null; }
          const key: LineKey = kind === 'wide' ? 'missWide' : kind === 'over' ? 'missOver' : kind === 'bar' ? 'missBar' : kind === 'post' ? 'missPost' : 'missGathered';
          return this.say(key, { shooter: w.shooterName, keeper });
        }
      }
    }
    if (sim.phase !== 'play' || sim.mode !== 'match') return null;
    if (!this.saidLastMinute && sim.half === 2 && sim.minute >= 39) { this.saidLastMinute = true; this.quiet = 0; return this.say('lastMinute', {}); }
    this.quiet += dt;
    if (this.quiet < 18 + rng() * 10) return null;
    this.quiet = 0;
    return this.quietLine(sim);
  }

  private quietLine(sim: MatchSim): string {
    const rng = this.rng;
    const roll = rng();
    if (!this.saidTwoPlayer && sim.config.humanSide2 != null && roll < 0.5) { this.saidTwoPlayer = true; return this.say('twoPlayer', {}); }
    if (roll < 0.22) {
      if (this.conditions.weather === 'rain') return this.say('quietRain', {});
      if (this.conditions.weather === 'snow') return this.say('quietSnow', {});
      if (this.conditions.time === 'night') return this.say('quietNight', {});
      if (this.conditions.time === 'sunset') return this.say('quietSunset', {});
    }
    const owner: SimPlayer | null = sim.ball.owner;
    if (!owner) return this.say('quietLoose', {});
    const team = this.teamName(sim, owner.side);
    const vars = { team, owner: owner.info.name };
    const towardGoal = (sim.goalX(owner.side) - owner.pos.x) * (owner.side === 0 ? 1 : -1);
    if (roll > 0.85) {
      const keeper = sim.teamOf(owner.side).find((p) => p.isKeeper);
      if (keeper) return this.say('quietKeeper', { keeper: keeper.info.name });
    }
    if (towardGoal < sim.length * 0.3) return this.say('quietAttack', vars);
    if (towardGoal > sim.length * 0.7) return this.say('quietDefence', vars);
    return this.say('quietPossession', vars);
  }
}
