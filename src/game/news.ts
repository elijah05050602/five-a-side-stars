import { startingFive } from '../data/defaults';
import { skillKeys } from '../data/skills';
import type { Player, Team } from '../data/types';
import type { MatchResult } from './MatchScene';
import type { LeagueFixture, Tally } from './league';

/**
 * The Goal Rush Gazette: a newspaper card before every league or career match (what is at stake,
 * both teams' form, who to watch) and a front page after it (a headline from what happened, Player
 * of the Match, and the rest of the round). Everything comes from templates and the match itself:
 * no made-up stories, short words for 7-year-olds. Names are plain text here; the screens escape them.
 */

/** One side of a preview. */
export interface PreviewSide {
  team: Team;
  /** League position now, 1 at the top. */
  position: number;
  /** Last five results, oldest first: W, D or L. */
  form: string;
  watch: { name: string; number: number; why: string } | null;
}

export interface MatchPreview {
  headline: string;
  home: PreviewSide;
  away: PreviewSide;
  /** Your record against the other side, when you have met before. */
  h2h: { w: number; d: number; l: number } | null;
  rival: boolean;
}

export interface PreviewInput {
  you: Team;
  opponent: Team;
  youAreHome: boolean;
  /** The current table, team ids top first. */
  table: string[];
  forms: { you: string; opponent: string };
  /** This season's tally, for whoever is scoring the goals. */
  tally: Record<string, Tally>;
  /** The opponent's player to watch, when the club has one (career). */
  opponentStar?: string;
  /** Your Star (career). */
  yourStar?: string;
  h2h?: { w: number; d: number; l: number; gf: number; ga: number } | null;
  rival?: boolean;
  /** Round number, 1-based, and how many there are. */
  round: number;
  rounds: number;
  /** A play-off rather than a league match. */
  playoff?: 'up' | 'stay';
}

/** A steady pick from a list for this match, so the card says the same thing every time it is drawn. */
function steady<T>(list: T[], key: string): T {
  let h = 0;
  for (const ch of key) h = (h * 31 + ch.charCodeAt(0)) >>> 0;
  return list[h % list.length];
}

const stars = (p: Player) => skillKeys(p.position).reduce((n, k) => n + p.skills[k], 0);

/** Who to watch on a side: the given player, else this season's top scorer, else the best outfield player. */
function watchFor(team: Team, tally: Record<string, Tally>, pick?: string, label = 'one to watch'): PreviewSide['watch'] {
  const given = pick ? team.players.find((p) => p.id === pick) : undefined;
  const goals = (p: Player) => tally[p.id]?.g ?? 0;
  if (given) return { name: given.name, number: given.number, why: goals(given) ? `${goals(given)} goal${goals(given) === 1 ? '' : 's'} this season` : label };
  const scorer = [...team.players].sort((a, b) => goals(b) - goals(a))[0];
  if (scorer && goals(scorer) > 0) return { name: scorer.name, number: scorer.number, why: `${goals(scorer)} goal${goals(scorer) === 1 ? '' : 's'} this season` };
  const best = startingFive(team).filter((p) => p.position !== 'GK').sort((a, b) => stars(b) - stars(a))[0];
  return best ? { name: best.name, number: best.number, why: 'quick feet and a big shot' } : null;
}

const wins = (form: string) => /W{3,}$/.test(form);
const losses = (form: string) => /L{3,}$/.test(form);

/** The preview card for the next match. */
export function matchPreview(i: PreviewInput): MatchPreview {
  // Before a ball is kicked the table is just a list, so no places are given.
  const pos = (t: Team) => (i.round > 1 && !i.playoff ? i.table.indexOf(t.id) + 1 : 0);
  const you: PreviewSide = { team: i.you, position: pos(i.you), form: i.forms.you, watch: watchFor(i.you, i.tally, i.yourStar, '🌟 your Star') };
  const them: PreviewSide = { team: i.opponent, position: pos(i.opponent), form: i.forms.opponent, watch: watchFor(i.opponent, i.tally, i.opponentStar) };
  const a = i.you.name, b = i.opponent.name;
  const key = `${i.you.id}${i.opponent.id}${i.round}`;
  const met = i.h2h && i.h2h.w + i.h2h.d + i.h2h.l > 0 ? i.h2h : null;
  const last = i.rounds;
  let headline: string;
  if (i.playoff) headline = i.playoff === 'up' ? `🎟️ Play-off day! ${a} can go up with one more win!` : `🛟 Play-off day! ${a} fight to stay up!`;
  else if (i.rival) headline = steady([`🔥 Rival day! ${a} take on ${b}!`, `🔥 It's ${a} v ${b}. The big one!`, `🔥 Rival match! Who will win the bragging rights?`], key);
  else if (i.round > 1 && you.position <= 2 && them.position <= 2) headline = steady(['🏆 Top of the table clash!', `🏆 First against second: ${a} v ${b}!`], key);
  else if (wins(them.form)) headline = `${b} have won three in a row. Can ${a} stop them?`;
  else if (wins(you.form)) headline = steady([`${a} are on a roll! Can ${b} stop them?`, `Three wins in a row for ${a}. Make it four?`], key);
  else if (i.round === last) headline = steady(['📣 Final day of the season!', `📣 Last match! Everything to play for.`], key);
  else if (i.round === 1) headline = steady(['🌱 A brand new season kicks off!', `🌱 New season, new start for ${a}!`], key);
  else if (met && met.l > 0 && met.w === 0) headline = `Revenge time? ${b} beat ${a} last time.`;
  else if (losses(you.form)) headline = steady([`Chin up, ${a}! Time to turn it round.`, `${a} want a win today!`], key);
  else if (i.round > 2 && you.position >= i.table.length - 1 && them.position >= i.table.length - 1) headline = '😬 Battle at the bottom!';
  else headline = steady([`${a} v ${b}: who will win?`, i.youAreHome ? `Match day! ${a} host ${b}.` : `Match day! ${a} visit ${b}.`, `Big game for ${a} against ${b}!`, `Boots on! It's ${a} v ${b}.`], key);
  return {
    headline,
    home: i.youAreHome ? you : them,
    away: i.youAreHome ? them : you,
    h2h: met ? { w: met.w, d: met.d, l: met.l } : null,
    rival: !!i.rival,
  };
}

export interface MatchReport {
  headline: string;
  /** A second line under the headline. */
  standfirst: string;
  /** Player of the Match: name and the side they played for. */
  motm: { name: string; team: string } | null;
  /** The headline is about one of your players (a hat-trick, a super goal, a winner). */
  hero: boolean;
  /** The rest of the round, already played. */
  around: { home: string; away: string; score: [number, number] }[];
}

/** The match's last goal was yours, and it broke a tie. */
function lastGoalWinner(r: MatchResult, me: 0 | 1): boolean {
  const last = r.goals[r.goals.length - 1];
  return !!last && last.side === me && !last.ownGoal;
}

/** Your side (0 home, 1 away) in a finished match, from the team id. */
const sideOf = (r: MatchResult, youId: string): 0 | 1 => (r.away.id === youId ? 1 : 0);

/**
 * The front page after a match: a headline from the best thing that happened (shoot-out, super
 * goal, hat-trick, comeback, big win, clean sheet), from your side's point of view.
 */
export function matchReport(r: MatchResult, youId: string, motm: Player | null, around: MatchReport['around'] = []): MatchReport {
  const me = sideOf(r, youId);
  const you = me === 0 ? r.home : r.away, them = me === 0 ? r.away : r.home;
  const [gf, ga] = me === 0 ? r.score : [r.score[1], r.score[0]];
  const key = `${you.id}${them.id}${gf}${ga}${r.goals.length}`;
  const mine = r.goals.filter((g) => g.side === me && !g.ownGoal);
  const perScorer = new Map<string, { name: string; n: number }>();
  for (const g of mine) perScorer.set(g.scorer.id, { name: g.scorer.name, n: (perScorer.get(g.scorer.id)?.n ?? 0) + 1 });
  const hatTrick = [...perScorer.values()].find((s) => s.n >= 3);
  const superGoal = mine.find((g) => g.super);
  let behind = false, h = 0, a = 0;
  for (const g of r.goals) { if (g.side === 0) h++; else a++; if ((me === 0 ? a - h : h - a) > 0) behind = true; }
  const won = gf > ga, lost = gf < ga;
  const late = mine.length ? mine[mine.length - 1] : null;
  let headline: string, standfirst: string, hero = false;
  if (r.mode === 'shootout') {
    headline = won ? steady([`🥅 Spot-kick heroes! ${you.name} win on penalties!`, `🥅 Nerves of steel! ${you.name} win the shoot-out!`], key) : `🥅 Heartbreak on penalties for ${you.name}.`;
    standfirst = `It finished ${gf}–${ga} in the shoot-out.`;
  } else if (hatTrick && won) {
    headline = `🎩 Hat-trick hero ${hatTrick.name}!`;
    hero = true;
    standfirst = `${hatTrick.name} scored ${hatTrick.n} as ${you.name} beat ${them.name} ${gf}–${ga}.`;
  } else if (superGoal && won) {
    headline = steady([`⚡ SUPER! ${superGoal.scorer.name}'s super skill wins it!`, `⚡ What a super goal from ${superGoal.scorer.name}!`], key);
    hero = true;
    standfirst = `${you.name} beat ${them.name} ${gf}–${ga}.`;
  } else if (won && behind) {
    headline = steady([`🔁 What a comeback by ${you.name}!`, `🔁 ${you.name} never gave up!`], key);
    standfirst = `They were behind, but beat ${them.name} ${gf}–${ga}.`;
  } else if (won && gf - ga >= 3) {
    headline = steady([`💥 ${you.name} hit ${gf}!`, `💥 Goal party for ${you.name}!`], key);
    standfirst = `A big ${gf}–${ga} win against ${them.name}.`;
  } else if (won && ga === 0) {
    headline = steady([`🧤 Clean sheet! ${you.name} keep ${them.name} out.`, `🧱 Nothing gets past ${you.name}!`], key);
    standfirst = `${gf}–0, and the defence did not let one in.`;
  } else if (won && gf - ga === 1 && lastGoalWinner(r, me)) {
    headline = steady([`⏱️ ${late!.scorer.name} grabs the winner!`, `⏱️ Winner! ${late!.scorer.name} settles it.`], key);
    hero = true;
    standfirst = `${you.name} beat ${them.name} ${gf}–${ga}.`;
  } else if (won) {
    headline = steady([`✅ Win for ${you.name}!`, `✅ ${you.name} beat ${them.name}!`, `✅ Three points for ${you.name}!`], key);
    standfirst = `It finished ${gf}–${ga}.`;
  } else if (lost) {
    headline = steady([`${them.name} win this one.`, `Not today for ${you.name}.`, `${them.name} take the points.`], key);
    standfirst = ga - gf >= 3 ? `It finished ${gf}–${ga}. Next time!` : `A close one: ${gf}–${ga}. Next time!`;
  } else {
    headline = gf === 0 ? steady(['🤝 All square at 0–0.', `🤝 No goals between ${you.name} and ${them.name}.`], key) : steady([`🤝 Honours even: ${gf}–${ga}!`, `🤝 A point each for ${you.name} and ${them.name}.`], key);
    standfirst = gf === 0 ? 'The keepers were on top today.' : 'Goals at both ends!';
  }
  const motmTeam = motm ? (r.home.players.some((p) => p.id === motm.id) ? r.home : r.away).name : '';
  return { headline, standfirst, hero, motm: motm ? { name: motm.name, team: motmTeam } : null, around };
}

/** The rest of a round as Around the League lines (the player's own match left out). */
export function aroundTheLeague(round: LeagueFixture[], youId: string, name: (id: string) => string): MatchReport['around'] {
  return round.filter((f) => f.score && f.homeId !== youId && f.awayId !== youId).map((f) => ({ home: name(f.homeId), away: name(f.awayId), score: f.score! }));
}

/** Form from a season's fixtures, oldest first: W, D or L for each played match. */
export function formFrom(rounds: LeagueFixture[][], id: string): string {
  let out = '';
  for (const round of rounds) for (const f of round) {
    if (!f.score || (f.homeId !== id && f.awayId !== id)) continue;
    const [gf, ga] = f.homeId === id ? f.score : [f.score[1], f.score[0]];
    out += gf > ga ? 'W' : gf < ga ? 'L' : 'D';
  }
  return out.slice(-5);
}
