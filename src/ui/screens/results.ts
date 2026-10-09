import { getCareer, getLeague, getTeam, saveTeam, setCareer, setLeague, setTournament } from '../../data/storage';
import { applyCareerMatch, applyCupMatch, applyPlayoffMatch, careerPlayoff, cupResultNote, careerAge, careerStar, playerOfTheMatch, seasonName, type CareerMatchSummary, type GrowthEvent, type StarMilestone } from '../../game/career';
import type { MatchResult } from '../../game/MatchScene';
import { getProgress, recordCareer, type Sticker } from '../../data/progress';
import { applyLeagueResult, roundJobs, tierInfo, yourPosition } from '../../game/league';
import { applyResult, cupAheadRequest, currentFixture, type TournamentState } from '../../game/tournament';
import { inBackground, type CupAhead, type SimOutcome } from '../../game/background';
import { cupTrophy, finalTrophy, leagueTrophy, playoffTrophy, type TrophyWin } from '../../game/trophy';
import { aroundTheLeague, matchReport, type MatchReport } from '../../game/news';
import { reportHtml } from './newsParts';
import { goalText } from '../../game/seasonGoals';
import { esc } from '../hud';
import { badgeSvg } from '../kitPreview';
import { topBar, wire, ordinal, stickerBanner, growthList } from './shared';
import type { Router, Screen, StartOptions } from '../screens';

function pensRow(res: boolean[], total: number): string {
  return `<span class="pens-row">${Array.from({ length: Math.max(total, res.length) }, (_, i) => res[i] === undefined ? '<i class="pen pen-todo"></i>' : res[i] ? '<i class="pen pen-goal">⚽</i>' : '<i class="pen pen-miss">✕</i>').join('')}</span>`;
}

/** What the results screen shows beyond the score, worked out once when the match finished. */
export interface ResultSummary {
  stickers: Sticker[];
  /** Where the league or career table stands after this match. */
  tableNote?: string;
  /** Stars the career players earned in this match. */
  growth?: GrowthEvent[];
  /** What the career's Star earned in this match. */
  star?: { name: string; points: number; milestones: StarMilestone[] };
  /** The Gazette's front page (league and career matches). */
  report?: MatchReport;
  /** Season goals done in this match, and whether that made a clean sweep. */
  goals?: { emoji: string; text: string }[];
  sweep?: boolean;
  /** A drawn play-off: the shoot-out to play next. */
  shootout?: StartOptions;
}

/** Computer matches played in the background during the player's own (see playAhead). */
export interface Ahead {
  /** The rest of a league round: which round, and one result per fixture (null for the player's own). */
  round?: { index: number; outcomes: (SimOutcome | null)[] };
  cup?: CupAhead;
}

/** Start the computer matches that finish alongside this one (the rest of the league round, the other cup semi) while it is played. */
export function playAhead(o: StartOptions): Promise<Ahead> {
  const career = o.career ? getCareer() : null;
  const ls = o.league ? getLeague() : career?.league ?? null;
  const you = ls && getTeam(o.league ? ls.teamId : career!.teamId);
  if (ls && you) {
    const index = ls.round;
    return inBackground({ kind: 'round', jobs: roundJobs(ls, you) }).then((res) => (res.kind === 'round' ? { round: { index, outcomes: res.outcomes } } : {}));
  }
  const cup = o.tournament && cupAheadRequest(o.tournament);
  if (cup) return inBackground(cup).then((res) => (res.kind === 'cup' ? { cup: res.ahead } : {}));
  return Promise.resolve({});
}

/**
 * Whether this match wins a trophy, worked out at the final whistle so the winners can lift it on the
 * pitch before the results screen. Reads the save but changes nothing (finishMatch records the result).
 */
export function trophyFor(o: StartOptions, r: MatchResult, ahead: Ahead = {}): TrophyWin | null {
  if (o.tournament) return cupTrophy(o.tournament, r);
  const career = o.career ? getCareer() : null;
  if (career?.done) return null;
  const ls = o.league ? getLeague() : career?.league ?? null;
  const you = ls && getTeam(o.league ? ls.teamId : career!.teamId);
  if (!ls || !you) return null;
  if (career && o.big === 'cup-final') return finalTrophy(you, r);
  if (career && o.big === 'playoff') {
    const po = careerPlayoff(career, you);
    return po ? playoffTrophy(career.league.tier, po.up, career.world.playoff, you, r) : null;
  }
  return leagueTrophy(ls, you, r, ahead.round?.index === ls.round ? ahead.round.outcomes : undefined);
}

/**
 * Record a finished match everywhere it counts (the cup bracket, the league table, the career and the
 * players' stars) and build its results screen. Runs exactly once per match, when it ends, never on a redraw.
 */
export function finishMatch(r: MatchResult, o: StartOptions, stickers: Sticker[], ahead: Ahead = {}): Screen {
  const summary: ResultSummary = { stickers: [...stickers] };
  if (o.tournament) {
    applyResult(o.tournament, r, ahead.cup);
    setTournament(o.tournament);
  }
  if (o.career) {
    const c = getCareer();
    const you = c && getTeam(c.teamId);
    if (c && you && !c.done) {
      const playoff = o.big === 'playoff';
      const cupTie = o.big === 'cup' || o.big === 'cup-final';
      const others = ahead.round?.index === c.league.round ? ahead.round.outcomes : undefined;
      const cupDone = cupTie ? applyCupMatch(c, you, r) : null;
      const s: CareerMatchSummary | null = cupTie ? cupDone : playoff ? applyPlayoffMatch(c, you, r) : applyCareerMatch(c, you, r, others);
      saveTeam(you);
      setCareer(c);
      if (s) {
        const motm3 = Object.values(c.careerStats).some((st) => st.motm >= 3);
        const boot = Object.values(c.seasonStats).some((st) => st.goals >= 8);
        summary.stickers.push(...recordCareer({ starUp: s.growth.length > 0, fiveStar: s.fiveStar, motm3, goldenBoot: boot, starMilestones: s.milestones.length ? c.milestones.length : 0, rivalWins: s.rivalWin ? c.world.rivalWins : 0, sweep: s.sweep }));
        const star = careerStar(c, you);
        if (s.goalsDone?.length) { summary.goals = s.goalsDone.map((g) => goalText(g, star?.name ?? '')); summary.sweep = s.sweep; }
        summary.growth = s.growth;
        if (star && s.points > 0) summary.star = { name: star.name, points: s.points, milestones: s.milestones };
      }
      const played = c.league.rounds[c.league.round - 1];
      const name = (id: string) => (id === you.id ? you.name : c.league.teams.find((t) => t.id === id)?.name ?? '');
      summary.report = matchReport(r, you.id, r.mode === 'match' ? playerOfTheMatch(r) : null, playoff || cupTie || !played ? [] : aroundTheLeague(played, you.id, name));
      if (summary.report.hero) summary.stickers.push(...recordCareer({ headline: true }));
      const po = c.world.playoff;
      if (cupTie) {
        const note = cupResultNote(c, you, !!cupDone?.cupDone);
        summary.tableNote = note.text;
        if (note.won) summary.stickers.push(...recordCareer({ cupWon: true }));
        if (note.pens && r.mode === 'match') summary.shootout = { ...o, mode: 'shootout', halfSeconds: 60 };
      } else if (playoff && po) {
        summary.tableNote = po.won === null ? 'All square in the play-off! Penalties decide it.' : po.won ? (po.up ? '🎟️ Play-off won: you are going up!' : '🛟 Play-off won: you are staying up!') : (po.up ? 'Play-off lost. Next season you go again!' : 'Play-off lost: down a tier next season. You will bounce back!');
        if (po.won === null && r.mode === 'match') summary.shootout = { ...o, mode: 'shootout', halfSeconds: 60 };
      } else summary.tableNote = `${careerAge(c)} · ${seasonName(c)} season · match ${Math.min(c.league.round, c.league.rounds.length)} of ${c.league.rounds.length} · you are ${ordinal(yourPosition(c.league, you))}`;
    }
  }
  if (o.league) {
    const ls = getLeague();
    const you = ls && getTeam(ls.teamId);
    if (ls && you) {
      const others = ahead.round?.index === ls.round ? ahead.round.outcomes : undefined;
      applyLeagueResult(ls, you, r, others);
      setLeague(ls);
      const name = (id: string) => (id === you.id ? you.name : ls.teams.find((t) => t.id === id)?.name ?? '');
      summary.report = matchReport(r, you.id, playerOfTheMatch(r), aroundTheLeague(ls.rounds[ls.round - 1] ?? [], you.id, name));
      if (summary.report.hero) summary.stickers.push(...recordCareer({ headline: true }));
      summary.tableNote = `${tierInfo(ls.tier).name} · round ${Math.min(ls.round, ls.rounds.length)} of ${ls.rounds.length} played · you are ${ordinal(yourPosition(ls, you))}`;
    }
  }
  return { name: 'results', result: r, summary, tournament: o.tournament, league: o.league, career: o.career };
}

export function renderResults(root: HTMLElement, router: Router, r: MatchResult, summary: ResultSummary, tournament?: TournamentState, league?: boolean, career?: boolean): void {
  const [h, a] = r.score;
  const stickers = summary.stickers;
  const leagueNote = summary.tableNote ? `<p class="muted">${esc(summary.tableNote)}</p>` : '';
  const growthNote = growthList(summary.growth ?? []);
  const sn = summary.star;
  const starNote = sn ? `<div class="star-note"><h3>🌟 ${esc(sn.name)} earned ${sn.points} training point${sn.points === 1 ? '' : 's'}</h3>${sn.milestones.length ? `<ul class="plain-list">${sn.milestones.map((m) => `<li>${m.emoji} <strong>${esc(m.name)}</strong>: ${esc(m.how)} <span class="muted">(+1 point)</span></li>`).join('')}</ul>` : ''}<p class="muted small">Spend them on the career screen.</p></div>` : '';
  let headline = h === a ? "It's a draw!" : h > a ? `${r.home.name} win!` : `${r.away.name} win!`;
  if (r.mode === 'training') headline = r.trainingPoints >= 10 ? 'Sharp shooting!' : r.trainingPoints >= 5 ? 'Nice work!' : 'Keep practising!';
  if (r.mode === 'shootout') headline = h > a ? `${r.home.name} win the shoot-out!` : `${r.away.name} win the shoot-out!`;
  if (tournament && h === a && r.mode === 'match') headline = 'All square! Penalties decide it.';
  const motm = r.mode === 'match' ? playerOfTheMatch(r) : null;
  const best = getProgress().trainingBest;
  const soLen = r.shootout ? Math.max(5, r.shootout[0].length, r.shootout[1].length) : 0;
  root.innerHTML = `
    <div class="screen results">
      ${topBar(r.mode === 'training' ? 'Training over' : r.mode === 'shootout' ? 'Shoot-out over' : 'Full Time', tournament ? 'cup' : league ? 'league' : 'none')}
      <div class="card results-card">
        <h2>${esc(headline)}</h2>
        ${r.mode === 'training' ? `
          <div class="training-score"><span class="score-big">${r.trainingPoints}</span><span class="muted">points</span></div>
          <p class="muted">${r.goals.length} goals scored · best ever ${best} points</p>` : `
          <div class="result-line">
            <div class="result-team">${badgeSvg(r.home.badge, 64)}<span>${esc(r.home.name)}</span></div>
            <div class="score-big">${h} – ${a}</div>
            <div class="result-team">${badgeSvg(r.away.badge, 64)}<span>${esc(r.away.name)}</span></div>
          </div>`}
        ${r.shootout ? `<div class="pens">${pensRow(r.shootout[0], soLen)}${pensRow(r.shootout[1], soLen)}</div>` : ''}
        ${r.mode === 'match' ? `<ul class="goals-list">
          ${r.goals.length === 0 ? '<li class="muted">No goals this time. The keepers were on fire!</li>' : ''}
          ${r.goals.map((g) => `<li>${g.side === 0 ? '⚽ ' : ''}<strong>${esc(g.scorer.name)}</strong> #${g.scorer.number}${g.ownGoal ? ' (og)' : ''} <span class="muted">${g.minute}'</span>${g.side === 1 ? ' ⚽' : ''}</li>`).join('')}
        </ul>` : ''}
        ${motm ? `<div class="motm">🏆 Player of the match: <strong>${esc(motm.name)}</strong> #${motm.number}</div>` : ''}
        ${summary.report ? reportHtml(summary.report) : ''}
        ${leagueNote}
        ${starNote}
        ${summary.goals?.length ? `<div class="star-note goals-note"><h3>🎯 Season goal${summary.goals.length === 1 ? '' : 's'} done!</h3><ul class="plain-list">${summary.goals.map((g) => `<li>${g.emoji} ${esc(g.text)} <span class="muted">(+1 point)</span></li>`).join('')}</ul>${summary.sweep ? '<p><strong>🧹 Clean sweep!</strong> All three goals done this season.</p>' : ''}</div>` : ''}
        ${growthNote}
        ${stickerBanner(stickers)}
        <div class="row">
          ${summary.shootout ? '<button class="btn btn-primary btn-big" id="r-pens">🥅 Penalty shoot-out!</button>' : tournament ? `<button class="btn btn-primary btn-big" id="r-cup">${tournament.needsShootout ? '🥅 Penalty shoot-out!' : '🏆 Back to the cup'}</button>` : league ? '<button class="btn btn-primary btn-big" id="r-league">📋 Back to the league</button>' : career ? '<button class="btn btn-primary btn-big" id="r-career">🌱 Back to the career</button>' : `<button class="btn btn-primary btn-big" id="r-again">Play again</button>`}
          <button class="btn btn-ghost btn-big" id="r-menu">Main menu</button>
        </div>
      </div>
    </div>`;
  wire(root, () => router.go({ name: 'menu' }));
  root.querySelector('#r-again')?.addEventListener('click', () => router.go({ name: 'setup', homeId: r.home.id, mode: r.mode === 'tutorial' ? 'match' : r.mode }));
  root.querySelector('#r-cup')?.addEventListener('click', () => {
    if (tournament!.needsShootout) {
      const f = currentFixture(tournament!)!;
      router.startMatch({ home: f.home, away: f.away, difficulty: tournament!.difficulty, halfSeconds: 60, twoPlayer: tournament!.twoPlayer, mode: 'shootout', tournament });
    } else router.go({ name: 'tournament', state: tournament! });
  });
  root.querySelector('#r-pens')?.addEventListener('click', () => router.startMatch(summary.shootout!));
  root.querySelector('#r-league')?.addEventListener('click', () => router.go({ name: 'league' }));
  root.querySelector('#r-career')?.addEventListener('click', () => router.go({ name: 'career' }));
  root.querySelector('#r-menu')!.addEventListener('click', () => router.go({ name: 'menu' }));
}
