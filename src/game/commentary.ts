import type { MatchSim, SimEvent, SimPlayer, Side, TrickKind } from './sim';
import type { SuperKind } from './supers';

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
  header: boolean;
}

const pickFrom = (lines: string[], rng: () => number) => lines[Math.floor(rng() * lines.length) % lines.length];

/** Replace {name}-style tokens. */
function fill(line: string, vars: Record<string, string | number>): string {
  return line.replace(/\{(\w+)\}/g, (_, k: string) => String(vars[k] ?? ''));
}

export const LINES = {
  kickoffFirst: ['And we are off! {home} against {away}.', 'The whistle goes and {home} get us started!', 'Here we go! {home} versus {away}.', 'Kick off! Big match, this one.'],
  kickoffSecond: ['Second half under way. It is {score}.', 'Back out for the second half, {score} so far.', 'Orange slices eaten, here comes the second half!', 'Second half! Who is going to grab it?'],
  kickoffAfterGoal: ['{team} get us going again.', 'Back to the centre, {team} to restart.', 'Deep breaths, {team}. Off we go again.', 'Can {team} hit straight back?', 'Right, {team} go again!'],
  goalOpener: ['GOAL! {scorer} opens the scoring for {team}!', '{scorer} puts {team} in front! 1-0!', 'First goal of the game, and it is {scorer}!', 'GOAL! {scorer} gets the first goal for {team}!', '{scorer} breaks the deadlock! 1-0 to {team}!'],
  goalEqualiser: ['{scorer} levels it up! {score}!', 'All square again! {scorer} scores for {team}.', 'Equaliser! {team} are back in it thanks to {scorer}.', 'GOAL! {team} are level! {scorer}, {score}!', 'They have done it! {scorer} with the equaliser! {score}.'],
  goalLead: ['{scorer} makes it {score}! {team} lead!', 'Another one for {team}! {scorer} scores!', '{team} pull ahead, {scorer} with the goal.', 'GOAL! {scorer} puts {team} in front, {score}!'],
  goalExtend: ['{scorer} again! {team} are running away with this, {score}.', 'That is {score}! {scorer} adds another for {team}.', 'The scoreboard says {score}. {team} are flying!', '{scorer} scores! This is a goal party for {team}, {score}!', 'Yet another one! {scorer} makes it {score}!'],
  goalReply: ['{team} pull one back! {scorer} with the goal, {score}.', '{scorer} gives {team} hope! {score}.', 'Game on? {scorer} scores for {team}. {score}.', '{team} are not giving up! {scorer} scores, {score}.', 'Back in it! {scorer} for {team}, {score}.'],
  goalBrace: ['Two for {scorer}! What a game they are having.', '{scorer} doubles up! {score}.', '{scorer} cannot stop scoring! That is two!', 'Again! {scorer} with their second!'],
  goalHatTrick: ['HAT-TRICK! {scorer} has three! Someone give them the ball to keep!', 'Three goals for {scorer}! A hat-trick hero!', 'One, two... THREE! {scorer} has a hat-trick!'],
  goalLate: ['Late drama! {scorer} scores for {team} with the clock nearly up! {score}!', 'Right at the death! {scorer} makes it {score}!', 'Last-gasp goal! {scorer} for {team}! {score}!', 'Just in time! {scorer} scores! {score}!'],
  goalOwn: ['Oh no! Into their own net. {score}.', 'Unlucky! {scorer} turns it into their own goal. {score}.', 'That one went the wrong way for {scorer}. {score}.', 'Oh! Into their own goal from {scorer}. They will want to forget that. {score}.'],
  goalPenalty: ['{scorer} steps up and SCORES from the spot! {score}.', 'Cool as a cucumber from the penalty spot, {scorer}! {score}.'],
  goalLongRange: ['From miles out! {scorer} with a screamer for {team}! {score}.', 'What a hit! {scorer} from distance! {score}!', '{scorer} hits it from way back! GOAL! {score}!', 'What a strike from {scorer}! From nearly halfway! {score}!'],
  goalTraining: ['In it goes!', 'Lovely finish!', 'That is the spot!', 'Keeper beaten!', 'Back of the net!'],
  goalRocket: ['ROCKET! Two points for that one!', 'Smashed it! A two-pointer!', 'BOOM! Two points! What power!'],
  goalShootout: ['{scorer} scores! {score} in the shoot-out.', 'Tucked away by {scorer}. {score}.', 'No mistake from {scorer}! {score}.', '{scorer} scores! Nerves of steel. {score}.'],
  save: ['Great save by {keeper}!', '{keeper} gets a hand to it!', 'Super stop from {keeper}!', 'Safe hands, {keeper}!', '{keeper} says no!', 'Saved! What reflexes from {keeper}!', '{keeper} has got it! Superb!'],
  saveFromShooter: ['{keeper} keeps out {shooter}!', '{shooter} shoots, {keeper} saves!', 'Denied! {keeper} stops {shooter} in their tracks.', '{shooter} thought they had scored, but {keeper} saves!', '{shooter} goes for goal... saved by {keeper}!'],
  missWide: ['{shooter} drags it wide!', 'Just past the post from {shooter}!', 'Wide! {shooter} will want that one again.', 'So close, {shooter}!', 'Inches wide from {shooter}!', 'Just past the post, {shooter}. So near!'],
  missOver: ['Over the bar from {shooter}!', '{shooter} leans back and it sails over.', 'Up and over! Unlucky, {shooter}.', '{shooter} sends it into the crowd!', 'A bit too high from {shooter}.'],
  missBar: ['Off the crossbar! {shooter} so nearly scored!', 'CLANG! {shooter} hits the bar!', 'The bar is still shaking! {shooter} was inches away.', 'The crossbar! How did that stay out, {shooter}?'],
  missPost: ['Off the post! {shooter} is so unlucky!', 'Post! {shooter} hits the woodwork!', 'Off the post! So close, {shooter}!', 'Woodwork! Unlucky, {shooter}.'],
  missGathered: ['{keeper} gathers it comfortably.', 'Straight at {keeper}, who holds on.', 'Easy for {keeper}.', 'Comfortable for {keeper}.', 'Easy catch for {keeper}.'],
  shootoutMiss: ['Missed! {shooter} will be kicking themselves.', 'Wide from the spot! {shooter} looks gutted.', 'Saved or missed, it does not count! Pressure on.', 'Kept out! {shooter} misses and the shoot-out is alive!'],
  foul: ['Foul by {offender}! Free kick to {team}.', 'The referee spots a foul by {offender}. Free kick.', 'Ooh, a trip by {offender}. {team} have a free kick.', 'The referee stops it. Foul by {offender}, free kick to {team}.', 'A foul by {offender}. Play nice, everyone! Free kick.'],
  penalty: ['PENALTY to {team}! {offender} gave that away.', 'Penalty! The referee points to the spot for {team}.', 'In the box! PENALTY to {team}! {offender} brought them down.'],
  halftimeLevel: ['Half time and it is level at {score}. All to play for!', 'Half time, {score}. Nothing between these two.', 'Half time at {score}. It could go either way!'],
  halftimeLead: ['Half time: {leader} lead {score}.', '{leader} go in at half time {score} up.', 'Half time, {leader} lead {score}. Time for a drink and a team talk.'],
  fulltimeDraw: ['Full time! It finishes {score}. A draw, and a point each.', 'The whistle goes: {score}. Honours even.', 'Full time, {score}. Nobody could split them today.'],
  fulltimeWin: ['Full time! {winner} win it {score}!', 'That is that! {winner} take the three points, {score}.', 'It is all over, and {winner} have done it! {score}.', 'There is the whistle! {winner} win {score}!'],
  fulltimeThrashing: ['Full time, and what a performance by {winner}! {score}!', 'A rout! {winner} win {score}!', 'Full time! What a goal fest from {winner}, {score}!'],
  shootoutOver: ['The shoot-out is over! {winner} win it {score}!', '{winner} hold their nerve! {score} on penalties.'],
  trainingOver: ['Time is up! {points} points. Nice shooting!', 'That is the session done: {points} points on the board.'],
  quietPossession: ['{team} passing it around nicely.', '{owner} looking for a pass.', 'Patient stuff from {team}.', '{team} building from the back.', 'Pass and pass. Lovely and calm from {team}.', '{team} keeping it nice and simple.', '{owner} looking for the right pass.'],
  quietAttack: ['{team} pushing forward now.', '{owner} driving at the defence!', 'Here come {team}!', '{owner} has space to run into.', '{team} into the box now!', '{team} are on the attack!'],
  quietDefence: ['{team} have it deep in their own half.', '{owner} looking for a way out of there.', 'Careful, {team}, the ball is near your own goal.', '{team} under a bit of pressure here.', 'Clear it, {team}! Get it out of there!'],
  quietLoose: ['The ball is loose in the middle!', 'Everybody chasing the ball!', 'Scrappy stuff in midfield.', 'Fifty-fifty ball!', 'Ping pong in the middle!'],
  quietKeeper: ['{keeper} has not had much to do yet.', 'Quiet afternoon so far for {keeper} in goal.', '{keeper} is just watching at the moment.', 'Quiet game so far for {keeper}.'],
  quietRain: ['The rain is really coming down now.', 'Slippery out there in the rain!', 'Puddles forming, but nobody is going home.'],
  quietSnow: ['Snow on the pitch! Lovely stuff.', 'Hats and gloves weather today.', 'The orange ball would be handy in this snow.'],
  quietNight: ['Floodlights on, and it looks magical out there.', 'A night game under the lights!'],
  quietSunset: ['What a sunset over the pitch.', 'Golden evening for a game of football.'],
  lastMinute: ['One minute left! Is there time for one more?', 'Into the final minute!', 'Last minute! Come on!', 'Not long to go now!'],
  twoPlayer: ['Two players, one keyboard. Who is bossing it?', 'Sibling rivalry, is it?'],
  restartCorner: ['Corner to {team}!', '{team} win a corner!', 'Corner for {team}. Everybody into the box!'],
  restartThrowIn: ['Throw-in to {team}.', 'Out it goes, throw-in to {team}.', 'Throw-in. Both hands, nice and high!'],
  restartGoalKick: ['Goal kick to {team}.', 'It has gone out. Goal kick.', 'Back to the keeper for a {team} goal kick.'],
  trickNutmeg: ['NUTMEG! {owner} puts it through the legs!', 'Through the legs! Cheeky from {owner}!', 'That is a nutmeg from {owner}! Lovely!'],
  trickSkill: ['What skill from {owner}!', '{owner} with the step-over, and away!', 'Fancy feet from {owner}!'],
  trickFail: ['{owner} tried the trick, not this time.', 'Too fancy, {owner}! Lost it.', 'Nice try, {owner}!'],
  tackle: ['Great tackle by {owner}!', '{owner} wins it back!', 'Strong challenge, and {team} have it!', 'Perfect timing on the tackle from {owner}!'],
  interception: ['Intercepted by {owner}!', '{owner} reads it and cuts it out!', '{owner} pinches the pass!'],
  goalHeader: ['A HEADER! {scorer} nods it in for {team}! {score}.', 'Up goes {scorer} and heads it in! {score}.', 'With the head! What a header from {scorer}! {score}.'],
  goalComeback: ['What a comeback! {scorer} makes it {score}!', '{team} were two down, and now it is level! {scorer}! {score}!'],
  goalTurnaround: ['{team} have turned it around! {scorer} puts them in front, {score}!', '{team} were losing, and now they lead! {scorer}! {score}!'],
  goalTapIn: ['Tapped in by {scorer}! {score}.', 'Right in front of goal, {scorer} makes no mistake! {score}.'],
  missSitter: ['How did {shooter} not score that?', 'From there, {shooter}? They will want that one again!', 'Oh no! What a chance for {shooter}!'],
  // Only for goals that really went there (see placement()).
  goalTopCorner: ['Into the top corner! {scorer}! {score}.', 'Top corner from {scorer}! The keeper had no chance! {score}.', 'Right into the top corner! What a strike, {scorer}! {score}.'],
  goalBottomCorner: ['Bottom corner! {scorer} picks the spot! {score}.', 'Low and into the corner from {scorer}! {score}.', 'Tucked into the bottom corner by {scorer}! {score}.'],
  goalRoof: ['Into the roof of the net! {scorer}! {score}.', '{scorer} smashes it into the roof of the net! {score}!'],
  goalLowMiddle: ['Straight down the middle from {scorer}! {score}.', 'Under the keeper and in! {scorer}! {score}.', '{scorer} slides it through the middle! {score}.'],
  goalPenaltyCorner: ['{scorer} runs up... GOAL! Right in the corner! {score}.', 'From the spot, {scorer} picks the corner! {score}.'],
  quietChasing: ['Time is running out for {team}. They need a goal!', 'Come on, {team}! Can they find a way back?'],
  // One group per skill move (see TRICK_LINE); the step-over keeps trickSkill.
  trickDragback: ['Drag-back from {owner}, and they turn away!', '{owner} rolls it back! Lovely!'],
  trickCruyff: ['A Cruyff turn from {owner}! Sent them the wrong way!', 'Cruyff turn! Brilliant from {owner}!'],
  trickRoulette: ['Round and round goes {owner}! A roulette!', '{owner} spins away! What a roulette!'],
  trickElastico: ['Elastico from {owner}! Out and back in!', 'Ooh, the elastico! Fancy from {owner}!'],
  trickRainbow: ['Rainbow flick from {owner}! Right over their head!', 'Up and over! A rainbow flick from {owner}!'],
  trickSwerve: ['Body swerve from {owner}! Wobbled right past!', 'A little shimmy from {owner}, and away!'],
  // Spoken over a super skill's cutscene. The ticker shows the super's own line (SUPERS in supers.ts), so these are never shown.
  superRocket: ['ROCKET SHOT! Look at it fly!', 'Here it comes... a ROCKET!'],
  superTurbo: ['Turbo Dash! Nobody can catch them!', 'Whoosh! Turbo time!'],
  superMagic: ['A Magic Pass! Nobody can cut it out!', 'Ooh, that is a Magic Pass! Right on the money!'],
  superBulldozer: ['BULLDOZER! Out of the way!', 'Full Bulldozer! Nobody is stopping that!'],
  superSlide: ['Super Slide! What a tackle!', 'Whoa! A Super Slide wins it back!'],
  superGloves: ['Giant Gloves! Good luck scoring now!', 'Look at the size of those gloves!'],
} as const;

export type LineKey = keyof typeof LINES;

export function line(key: LineKey, vars: Record<string, string | number> = {}, rng: () => number = Math.random): string {
  return fill(pickFrom([...LINES[key]], rng), vars);
}

/** Where a goal went in, from the height and the across-the-goal position where it crossed the line. */
export type Placement = 'topCorner' | 'bottomCorner' | 'roof' | 'lowMiddle' | 'plain';

export function placement(at: { y: number; z: number }, dims: { goalWidth: number; goalHeight: number; radius: number }): Placement {
  const corner = Math.abs(at.z) > dims.goalWidth * 0.28;
  const high = at.y > dims.goalHeight * 0.55;
  const low = at.y < Math.max(dims.radius * 1.6, dims.goalHeight * 0.25);
  if (high) return corner ? 'topCorner' : 'roof';
  if (low && corner) return 'bottomCorner';
  if (low && Math.abs(at.z) < dims.goalWidth * 0.15) return 'lowMiddle';
  return 'plain';
}

/** The line group for each skill move; any other move (the step-over) is trickSkill. */
const TRICK_LINE: Partial<Record<TrickKind, LineKey>> = {
  dragback: 'trickDragback', cruyff: 'trickCruyff', roulette: 'trickRoulette', elastico: 'trickElastico', rainbow: 'trickRainbow', feint: 'trickSwerve',
};

/** The spoken line for each super skill. */
const SUPER_LINE: Record<SuperKind, LineKey> = {
  rocket: 'superRocket', turbo: 'superTurbo', magic: 'superMagic', bulldozer: 'superBulldozer', slide: 'superSlide', gloves: 'superGloves',
};

const PLACEMENT_LINE: Record<Exclude<Placement, 'plain'>, LineKey> = { topCorner: 'goalTopCorner', bottomCorner: 'goalBottomCorner', roof: 'goalRoof', lowMiddle: 'goalLowMiddle' };

export const scoreText = (s: readonly [number, number]) => `${s[0]}-${s[1]}`;

/**
 * Pick the right line for a goal from the score after it, who scored and how.
 * `scorerGoals` counts this goal, `minute` is on the 0..40 shown clock.
 */
export interface GoalInfo {
  score: readonly [number, number]; side: Side; scorer: string; team: string; ownGoal: boolean; minute: number; scorerGoals: number;
  penalty?: boolean; longRange?: boolean; mode: 'match' | 'shootout' | 'training'; rocket?: boolean;
  header?: boolean; closeRange?: boolean;
  /** Where it went in; the corner lines are only said when it really went there. */
  placement?: Placement;
  /** The most goals the scoring side had been behind by before this goal. */
  wasDown?: number;
}

/** Which kind of goal line fits, from the score after it, who scored and how. */
export function goalKey(o: GoalInfo, rng: () => number = Math.random): LineKey {
  const spot = o.placement && o.placement !== 'plain' ? PLACEMENT_LINE[o.placement] : null;
  if (o.mode === 'training') return o.rocket ? 'goalRocket' : spot && rng() < 0.5 ? spot : 'goalTraining';
  if (o.mode === 'shootout') return 'goalShootout';
  if (o.ownGoal) return 'goalOwn';
  if (o.scorerGoals === 3) return 'goalHatTrick';
  const us = o.score[o.side], them = o.score[1 - o.side];
  if ((o.wasDown ?? 0) >= 2 && us === them) return 'goalComeback';
  if ((o.wasDown ?? 0) >= 1 && us === them + 1) return 'goalTurnaround';
  if (o.minute >= 37) return 'goalLate';
  if (o.penalty) return o.placement === 'topCorner' || o.placement === 'bottomCorner' ? 'goalPenaltyCorner' : 'goalPenalty';
  if (o.header) return 'goalHeader';
  if (o.longRange) return 'goalLongRange';
  if (o.scorerGoals === 2 && rng() < 0.6) return 'goalBrace';
  if (spot && rng() < 0.5) return spot;
  if (o.closeRange && rng() < 0.5) return 'goalTapIn';
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
  /** The most goals each side has been behind by so far. */
  private readonly down: [number, number] = [0, 0];
  private clock = 0;
  private lastChatter = -99;
  private ownerSide: Side | null = null;
  private lastKick: { side: Side; at: number } | null = null;
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
        this.watch = { side: ev.side!, shooterName: ev.player?.name ?? 'the striker', flightId: b.flightId, from: { x: b.pos.x, z: b.pos.z }, age: 0, header: !!ev.header };
        this.lastKick = { side: ev.side!, at: this.clock };
        return null;
      }
      case 'kick': {
        if (ev.side !== undefined) this.lastKick = { side: ev.side, at: this.clock };
        return null;
      }
      case 'restart': {
        if (sim.mode !== 'match' || ev.side === undefined) return null;
        const chance = ev.kind === 'corner' ? 0.75 : ev.kind === 'goalkick' ? 0.35 : ev.kind === 'throwin' ? 0.25 : 0;
        if (rng() >= chance || (ev.kind !== 'corner' && !this.chatterDue(8))) return null;
        const key: LineKey = ev.kind === 'corner' ? 'restartCorner' : ev.kind === 'goalkick' ? 'restartGoalKick' : 'restartThrowIn';
        return this.say(key, { team: this.teamName(sim, ev.side) });
      }
      case 'trick': {
        if (sim.mode !== 'match' && sim.mode !== 'training') return null;
        const owner = ev.player?.name ?? 'the dribbler';
        if (ev.ok && ev.kind === 'nutmeg') return this.say('trickNutmeg', { owner });
        if (rng() >= (ev.ok ? 0.5 : 0.35) || !this.chatterDue(12)) return null;
        return this.say(ev.ok ? TRICK_LINE[ev.kind as TrickKind] ?? 'trickSkill' : 'trickFail', { owner });
      }
      case 'super': {
        // Spoken only: the cutscene already puts the super's own line on the ticker.
        if (ev.superKind) this.onSay?.(SUPER_LINE[ev.superKind]);
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
        const dist = w ? Math.abs(sim.goalX(g.side) - w.from.x) : 0;
        const longRange = !!w && dist > sim.length * 0.4;
        const closeRange = !!w && dist < sim.length * 0.12 && Math.abs(w.from.z) < sim.goalWidth;
        const rocket = sim.mode === 'training' && Math.hypot(sim.ball.vel.x, sim.ball.vel.z) > sim.stats.power * 0.95;
        const info: GoalInfo = { score: sim.score, side: g.side, scorer: g.scorer.name, team: this.teamName(sim, g.side), ownGoal: g.ownGoal, minute: g.minute, scorerGoals: n, penalty: sim.ball.penaltyShot && sim.mode === 'match', longRange, mode: sim.mode === 'tutorial' ? 'training' : sim.mode, rocket, header: !!w?.header && !g.ownGoal, closeRange, wasDown: this.down[g.side], placement: g.at ? placement(g.at, { goalWidth: sim.goalWidth, goalHeight: sim.goalHeight, radius: sim.ball.radius }) : undefined };
        for (const s of [0, 1] as const) this.down[s] = Math.max(this.down[s], sim.score[1 - s] - sim.score[s]);
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
          const near = Math.abs(sim.goalX(w.side) - w.from.x) < sim.length * 0.12 && Math.abs(w.from.z) < sim.goalWidth;
          if (near && (kind === 'wide' || kind === 'over') && rng() < 0.7) return this.say('missSitter', { shooter: w.shooterName });
          const key: LineKey = kind === 'wide' ? 'missWide' : kind === 'over' ? 'missOver' : kind === 'bar' ? 'missBar' : kind === 'post' ? 'missPost' : 'missGathered';
          return this.say(key, { shooter: w.shooterName, keeper });
        }
      }
    }
    this.clock += dt;
    if (sim.phase !== 'play' || sim.mode !== 'match') { this.ownerSide = null; return null; }
    const won = this.wonBall(sim);
    if (won) return won;
    if (!this.saidLastMinute && sim.half === 2 && sim.minute >= 39) { this.saidLastMinute = true; this.quiet = 0; return this.say('lastMinute', {}); }
    this.quiet += dt;
    if (this.quiet < 18 + rng() * 10) return null;
    this.quiet = 0;
    return this.quietLine(sim);
  }

  /** A tackle or an interception: the ball changes team without a shot or a restart. Said now and then, never back to back. */
  private wonBall(sim: MatchSim): string | null {
    const owner = sim.ball.owner;
    if (!owner) return null;
    const before = this.ownerSide;
    this.ownerSide = owner.side;
    if (before === null || before === owner.side || owner.isKeeper) return null;
    if (this.quiet < 3 || this.rng() >= 0.3 || !this.chatterDue(15)) return null;
    this.quiet = 0;
    const passed = this.lastKick && this.lastKick.side === before && this.clock - this.lastKick.at < 2.5;
    return this.say(passed ? 'interception' : 'tackle', { owner: owner.info.name, team: this.teamName(sim, owner.side) });
  }

  /** Small talk about the play (tackles, tricks, throw-ins) is rationed so it never crowds out the rest. */
  private chatterDue(gap: number): boolean {
    if (this.clock - this.lastChatter < gap) return false;
    this.lastChatter = this.clock;
    return true;
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
    const behind = sim.score[1 - owner.side] - sim.score[owner.side];
    if (behind > 0 && sim.half === 2 && sim.minute >= 30 && roll < 0.6) return this.say('quietChasing', vars);
    if (towardGoal < sim.length * 0.3) return this.say('quietAttack', vars);
    if (towardGoal > sim.length * 0.7) return this.say('quietDefence', vars);
    return this.say('quietPossession', vars);
  }
}
