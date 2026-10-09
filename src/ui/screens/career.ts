import { AGE_STATS } from '../../data/ageGroups';
import { getCareer, getHall, getTeam, retireCareer, saveTeam, setCareer } from '../../data/storage';
import { scrapbookHtml } from './hallOfFame';
import { cabinetHtml } from './cabinet';
import { POSITION_LABELS } from '../../data/types';
import { STAR_CAP, skillKeys, skillLabel, starsText } from '../../data/skills';
import { CAREER_AGES, SEASONS_PER_YEAR, SEASON_NAMES, STAR_MILESTONES, TRAINING_STEP, TWISTS, advanceCareer, canPickSignature, canTrain, pickSignature, cupWaiting, joinClub, signTriallist, stayAtClub, careerAge, careerNudge, careerPlayoff, careerRival, careerSeasonOutcome, careerSeasonOver, careerStar, freshSeasonStats, pickStar, playoffWaiting, seasonName, statRows, trainStar, yourTierIds, type GrowthEvent } from '../../game/career';
import { recordCareer } from '../../data/progress';
import { computeTable, nextFixture, tierInfo } from '../../game/league';
import { clubById, seasonIndex, tierOf } from '../../game/careerWorld';
import { CUP_ROUNDS, cupName, cupOver, yourTie, type CupTie } from '../../game/careerCup';
import { esc } from '../hud';
import { badgeSvg, kitChip } from '../kitPreview';
import { careerTableNote, nextMatchHtml, playNextMatch, tableCard } from './leagueParts';
import { matchPreview } from '../../game/news';
import { goalText } from '../../game/seasonGoals';
import { previewHtml } from './newsParts';
import { ladderHtml, openClubPage, seasonAwardsHtml, statsHtml, teamStatsHtml, worldLookup } from './worldParts';
import { awardsFor } from '../../game/seasonAwards';
import { topBar, wire, ordinal, growthList, stickerBanner } from './shared';
import type { Player, Position, SkillKey, Team } from '../../data/types';
import { SIGNATURE_AT, SIGNATURE_IDS, superLook, type SignatureId, type SuperKind } from '../../game/supers';
import type { CareerState } from '../../game/career';
import type { Router } from '../screens';
import { askConfirm } from '../dialog';

/** Everyone in the squad as a button, to pick (or re-pick) the career's Star. */
function starPicker(c: CareerState, you: Team): string {
  const lost = c.starPicked; // picked before, but that player has left the squad
  return `<div class="card star-pick">
    <h3>🌟 ${lost ? 'Pick a new Star' : 'Who is your Star?'}</h3>
    <p class="muted">${lost ? 'Your Star has left the squad.' : 'Your Star is the player this career follows.'} You still play every match with the whole team, but your Star wears a gold star, earns training points to spend, and collects milestones.</p>
    <div class="star-pick-grid">${you.players.map((p) => `<button class="btn star-pick-btn ${p.id === c.starId ? 'is-suggested' : ''}" data-star="${esc(p.id)}">${kitChip(p.position === 'GK' ? you.keeperKit : you.kit, 36)}<span><strong>${esc(p.name)}</strong> #${p.number}<br/><span class="chip chip-pos chip-${p.position.toLowerCase()}">${POSITION_LABELS[p.position]}</span></span></button>`).join('')}</div>
  </div>`;
}

/** After moving up: who moved on, and three triallists to choose one from. */
function trialCard(c: CareerState, you: Team): string {
  const t = c.trialDay!;
  const cap = STAR_CAP[careerAge(c)];
  return `<div class="card star-pick trial-card">
    <h3>🏟️ Trial Day</h3>
    ${t.left.length ? `<p>${t.left.map((l) => `👋 <strong>${esc(l.name)}</strong> (#${l.number}) has moved to another club. Good luck, ${esc(l.name)}!`).join('<br/>')}</p>` : '<p>Everyone is staying for another year!</p>'}
    <p class="muted">Three youngsters have come for a trial. Pick one to join the squad.</p>
    <div class="stat-cards">${t.players.map((p) => `<div class="card player-stat-card">
      <div class="psc-top">${kitChip(p.position === 'GK' ? you.keeperKit : you.kit, 36)}<div><strong>${esc(p.name)}</strong> <span class="muted">#${p.number}</span><br/><span class="chip chip-pos chip-${p.position.toLowerCase()}">${POSITION_LABELS[p.position]}</span></div></div>
      <div class="psc-skills">${skillKeys(p.position).map((k) => { const l = skillLabel(p.position, k); return `<span title="${esc(l.label)}">${l.emoji} <span class="stars">${starsText(p.skills[k], cap)}</span></span>`; }).join('')}</div>
      <button class="btn btn-primary" data-sign="${esc(p.id)}">✍️ Sign ${esc(p.name)}</button>
    </div>`).join('')}</div>
  </div>`;
}

/** The yearly cup: the draw round by round, with your tie to play (or its shoot-out). */
function cupCard(c: CareerState, you: Team): string {
  const cup = c.cup!;
  const name = (id: string) => (id === you.id ? you.name : clubById(c.world, id)?.team.name ?? '');
  const badge = (id: string) => { const t = id === you.id ? you : clubById(c.world, id)?.team; return t ? badgeSvg(t.badge, 22) : ''; };
  const tie = yourTie(cup, you.id);
  const over = cupOver(cup);
  const winner = over ? cup.rounds[CUP_ROUNDS.length - 1][0].winnerId : null;
  const side = (t: CupTie, id: string) => `<span class="cup-side ${id === you.id ? 'is-you' : ''} ${t.winnerId === id ? 'is-through' : t.winnerId ? 'is-out' : ''}">${badge(id)} ${esc(name(id))}</span>`;
  const rounds = cup.rounds.map((r, i) => `<div class="cup-round"><h4>${CUP_ROUNDS[i]}${r.length > 1 ? 's' : ''}</h4>${r.map((t) => `<div class="cup-tie">${side(t, t.homeId)}<strong class="cup-score">${t.score ? `${t.score[0]}–${t.score[1]}` : 'v'}${t.pens ? `<small> (${t.pens[0]}–${t.pens[1]} pens)</small>` : ''}</strong>${side(t, t.awayId)}</div>`).join('')}</div>`).join('');
  const opp = tie ? (tie.homeId === you.id ? tie.awayId : tie.homeId) : '';
  return `<div class="card cup-card">
    <h3>🏆 ${esc(cupName(cup))}</h3>
    <p class="muted small">Eight clubs, one match a round. A draw goes to penalties. The league waits for the cup.</p>
    ${winner ? `<p class="cup-result">${winner === you.id ? `🏆 <strong>Cup winners!</strong> ${esc(you.name)} won the ${esc(cupName(cup))}!` : `${esc(name(winner))} won the cup.`}</p>` : cup.out ? '<p class="cup-result">Out of the cup this time. On with the league!</p>' : ''}
    <div class="cup-bracket">${rounds}</div>
    ${tie ? `<div class="cup-next"><span class="muted">${CUP_ROUNDS[cup.round]}${clubById(c.world, opp)?.team.id === c.world.rivalId ? ' · 🔥 against your rival!' : ''}</span>
      <p><strong>${esc(you.name)}</strong> v <strong>${esc(name(opp))}</strong> <span class="muted small">(Tier ${tierOf(c.world, opp)})</span></p>
      ${tie.score ? '<button class="btn btn-primary btn-big" id="k-cup-pens">🥅 Penalty shoot-out!</button>' : `<button class="btn btn-primary btn-big" id="k-cup">⚽ Play the ${CUP_ROUNDS[cup.round].toLowerCase()}</button>`}</div>` : ''}
  </div>`;
}

/** Transfer offers after moving up an age group: join one of the clubs, or stay and be captain. */
function offersCard(c: CareerState, you: Team): string {
  const star = careerStar(c, you)!;
  const w = c.world;
  return `<div class="card star-pick offers-card">
    <h3>✈️ Transfer window!</h3>
    <p>Other clubs have seen what <strong>${esc(star.name)}</strong> can do. ${esc(star.name)} can join one of them (on their own: the team-mates stay at ${esc(you.name)}), or stay and be made captain.</p>
    <div class="stat-cards">${c.offers!.map((o) => {
      const club = clubById(w, o.clubId);
      if (!club) return '';
      return `<div class="card player-stat-card offer">
        <div class="psc-top">${badgeSvg(club.team.badge, 40)}<div><strong>${esc(club.team.name)}</strong><br/><span class="muted small">Tier ${club.tier} · ${esc(tierInfo(club.tier).name)}</span>${o.clubId === w.rivalId ? '<br/><span class="chip chip-rival">🔥 Your rival</span>' : ''}</div></div>
        <p class="small">${esc(o.why)}</p>
        <div class="row"><button class="btn btn-ghost" data-club="${esc(o.clubId)}">📋 Club page</button><button class="btn btn-primary" data-join="${esc(o.clubId)}">✈️ Join</button></div>
      </div>`;
    }).join('')}</div>
    <button class="btn btn-blue btn-big" id="k-stay">🛡️ Stay at ${esc(you.name)} and be captain</button>
  </div>`;
}

/** The Star's card: training points to spend, ratings with progress to the next star, and milestones. */
/** The super each position is best known for, to show off a signature. */
const SIGNATURE_SHOWN: Record<Position, SuperKind> = { ATT: 'rocket', WING: 'turbo', MID: 'magic', DEF: 'slide', GK: 'gloves' };

function signatureHtml(c: CareerState, star: Player): string {
  if (!canPickSignature(c)) return `<p class="muted small sig-locked">🌠 Reach ${SIGNATURE_AT} milestones (Legend in the Making) to unlock a signature super.</p>`;
  const kind = SIGNATURE_SHOWN[star.position];
  return `<div class="sig-pick"><h4>🌠 Signature super</h4>
    <p class="muted small">${star.signature ? `Your supers glow in ${esc(star.name)}'s own colour. Change it any time.` : `Legend in the Making! Pick how ${esc(star.name)}'s supers look and sound.`}</p>
    <div class="pills">${SIGNATURE_IDS.map((id) => { const look = superLook(kind, { signature: id }); return `<button class="pill sig-pill ${star.signature === id ? 'is-active' : ''}" style="--sig:${look.css}" data-signature="${id}" aria-pressed="${star.signature === id}">${look.icon} ${esc(look.name)}</button>`; }).join('')}</div></div>`;
}

function starCard(c: CareerState, you: Team, justGrew: GrowthEvent[]): string {
  const star = careerStar(c, you)!;
  const cap = STAR_CAP[careerAge(c)];
  const st = c.careerStats[star.id] ?? freshSeasonStats();
  const pts = c.trainingPoints;
  return `<div class="card star-card">
    <div class="psc-top">${kitChip(star.position === 'GK' ? you.keeperKit : you.kit, 48)}<div><span class="muted small">🌟 Your Star</span><br/><strong class="star-name">${esc(star.name)}</strong> <span class="muted">#${star.number}</span> <span class="chip chip-pos chip-${star.position.toLowerCase()}">${POSITION_LABELS[star.position]}</span></div>
      <div class="star-points ${pts ? 'has-points' : ''}"><strong>${pts}</strong><span>training point${pts === 1 ? '' : 's'}</span></div></div>
    <p class="muted small">${pts ? `Tap ➕ to train a rating. ${Math.round(1 / TRAINING_STEP)} points make a new star.` : 'Play matches to earn training points: 1 for playing, 1 for a win, 1 for Player of the Match, and 1 for every milestone.'}</p>
    ${justGrew.length ? `<p class="star-grew">⭐ ${justGrew.map((g) => `${esc(g.label)} is now ${g.stars} stars!`).join(' ')}</p>` : ''}
    <div class="skills star-skills">${skillKeys(star.position).map((k) => {
      const l = skillLabel(star.position, k);
      const full = star.skills[k] >= cap;
      const xp = full ? 1 : Math.min(1, star.xp?.[k] ?? 0);
      return `<div class="skill-row"><span class="skill-name">${l.emoji} ${esc(l.label)}</span>
        <span class="stars" title="${star.skills[k]} of ${cap}">${starsText(star.skills[k], cap)}</span>
        <span class="row star-train"><span class="xp-bar" title="${full ? 'Full for this age group' : 'Progress to the next star'}"><i style="width:${Math.round(xp * 100)}%"></i></span>
        <button class="btn btn-icon" data-train="${k}" aria-label="Train ${esc(l.label)}" ${canTrain(c, star, k) ? '' : 'disabled'}>➕</button></span></div>`;
    }).join('')}</div>
    <p class="muted small">Ratings stop at ${cap} stars in the ${esc(AGE_STATS[careerAge(c)].label)}. Moving up an age group lets them grow again.</p>
    <div class="psc-stats"><span><strong>${st.played}</strong> played</span><span><strong>${st.goals}</strong> goals</span><span><strong>${st.assists}</strong> assists</span>${star.position === 'GK' ? `<span><strong>${st.saves}</strong> saves</span>` : `<span><strong>${st.tackles}</strong> tackles</span>`}<span><strong>${st.motm}</strong> 🏆</span></div>
    <h4>Milestones <span class="muted small">${c.milestones.length} of ${STAR_MILESTONES.length}</span></h4>
    <div class="milestones">${STAR_MILESTONES.map((m) => { const got = c.milestones.includes(m.id); return `<span class="milestone ${got ? 'is-got' : ''}" title="${esc(m.name)}: ${esc(m.how)}">${m.emoji}<small>${esc(m.name)}</small></span>`; }).join('')}</div>
    ${signatureHtml(c, star)}
  </div>`;
}

export function renderCareer(root: HTMLElement, router: Router, justGrew: GrowthEvent[] = []): void {
  const c = getCareer();
  const you = c && getTeam(c.teamId);
  if (!c || !you) {
    if (c) setCareer(null); // the team was deleted
    router.go({ name: 'setup', mode: 'career' });
    return;
  }
  const age = careerAge(c);
  const star = careerStar(c, you);
  const choosing = !star || !c.starPicked;
  const offering = !c.done && !choosing && !!c.offers?.length;
  const trial = !c.done && !choosing && !offering && !!c.trialDay;
  const cupDay = !c.done && !choosing && !offering && !trial && cupWaiting(c, you);
  const tier = tierInfo(c.league.tier);
  const table = computeTable(c.league, you);
  const over = !c.done && careerSeasonOver(c);
  const next = c.done ? null : nextFixture(c.league, you);
  const outcome = over ? careerSeasonOutcome(c, you) : null;
  const lastSeason = c.season === SEASONS_PER_YEAR;
  const lastYear = c.year === CAREER_AGES.length;
  const pending = c.pendingGrowth;
  if (pending.length) { c.pendingGrowth = []; setCareer(c); }
  const w = c.world;
  const po = over ? careerPlayoff(c, you) : null;
  const poWaiting = over && playoffWaiting(c, you);
  const rival = careerRival(c);
  const outcomeText = outcome
    ? (outcome.position === 1 ? `🥇 Champions of the ${tier.name}! ` : `You finished ${ordinal(outcome.position)} in the ${tier.name}. `)
      + (po && poWaiting ? (po.up ? `That means a play-off against ${po.opponent.team.name} for a place in the ${tierInfo(c.league.tier - 1).name}! ` : `That means a play-off against ${po.opponent.team.name} to stay in the ${tier.name}! `) : '')
      + (outcome.playoff === 'won' ? (po?.up ? 'You won the play-off! ' : 'You won the play-off and stay up! ') : outcome.playoff === 'lost' ? 'The play-off did not go your way. ' : '')
      + (outcome.outcome === 'promoted' ? `Up to Tier ${c.league.tier - 1} next season! ` : outcome.outcome === 'relegated' ? `Down to Tier ${c.league.tier + 1} next season, you will bounce back. ` : '')
      + (outcome.topScorer ? `Top scorer: ${outcome.topScorer.name} with ${outcome.topScorer.goals}. ` : '')
      + (lastSeason ? (lastYear ? 'That was the last season of the Under 10s: the career is complete!' : `That was the last season of the year: next up, the ${AGE_STATS[CAREER_AGES[c.year]].label}!`) : '')
    : '';
  const si = seasonIndex(c.year, c.season);
  const freshSeason = !c.done && c.league.round === 0 && c.history.length > 0;
  const summer = freshSeason && c.season === 1;
  const news = freshSeason ? w.news.filter((n) => n.at === si - 1) : [];
  const yourIds = computeTable(c.league, you).map((row) => row.team.id);
  const clubs = worldLookup(w, you);
  const h2h = rival ? w.h2h[rival.team.id] : undefined;
  const rivalNext = !!next && !!rival && (next.home.id === rival.team.id || next.away.id === rival.team.id);
  const opponentId = next ? (next.youAreHome ? next.away.id : next.home.id) : '';
  const previewFor = (opp: Team, youAreHome: boolean, playoff?: 'up' | 'stay') => {
    const club = clubById(w, opp.id);
    return previewHtml(matchPreview({
      you, opponent: opp, youAreHome, table: yourIds, forms: { you: w.you.form, opponent: club?.rec.form ?? '' }, tally: c.league.tally,
      opponentStar: club?.starId, yourStar: c.starId, h2h: w.h2h[opp.id], rival: opp.id === w.rivalId,
      round: c.league.round + 1, rounds: c.league.rounds.length, playoff,
    }));
  };
  const preview = choosing || trial || offering || cupDay || c.done ? '' : next ? previewFor(next.youAreHome ? next.away : next.home, next.youAreHome) : po && poWaiting ? previewFor(po.opponent.team, true, po.up ? 'up' : 'stay') : '';
  const goalsDone = c.goals.filter((g) => g.done).length;
  const goalsCard = c.done || !c.goals.length ? '' : `<div class="card goals-card">
    <h3>🎯 Season goals <span class="muted small">${goalsDone} of ${c.goals.length} done · 1 training point each</span></h3>
    <ul class="plain-list season-goals">${c.goals.map((g) => {
      const t = goalText(g, star?.name ?? '');
      return `<li class="${g.done ? 'is-done' : ''}"><span class="sg-level sg-${g.level}">${['Easy', 'Medium', 'Hard'][g.level]}</span><span class="sg-text">${t.emoji} ${esc(t.text)}</span>${g.done ? '<span class="sg-tick">✅</span>' : g.target > 1 ? `<span class="sg-count">${g.progress}/${g.target}</span>` : ''}${g.target > 1 && !g.done ? `<span class="xp-bar"><i style="width:${Math.round((g.progress / g.target) * 100)}%"></i></span>` : ''}</li>`;
    }).join('')}</ul>
    ${goalsDone === c.goals.length ? '<p><strong>🧹 Clean sweep!</strong> Every goal done this season.</p>' : ''}
  </div>`;
  let tab: 'table' | 'stats' | 'tiers' = 'table';
  let statScope: 'season' | 'career' = 'season';
  const tabs = () => `<div class="pills table-tabs">${(['table', 'stats', 'tiers'] as const).map((t) => `<button class="pill ${t === tab ? 'is-active' : ''}" data-tab="${t}">${t === 'table' ? '📋 Table' : t === 'stats' ? '📊 Stats' : '🪜 All leagues'}</button>`).join('')}</div>`;
  const tableArea = () => {
    if (tab === 'table') return tableCard(table, c.league.tier, careerTableNote(c.league.tier), false, { tap: true, playoffs: true, rivalId: rival?.team.id, tabs: tabs() });
    if (tab === 'tiers') return `<div class="card table-card">${tabs()}${ladderHtml(c, you, table.map((row) => ({ id: row.team.id, pts: row.points })))}<p class="muted small">Tap a club to see its page.</p></div>`;
    const season = statScope === 'season';
    return `<div class="card table-card">${tabs()}
      <div class="pills"><button class="pill ${season ? 'is-active' : ''}" data-stat="season">This season</button><button class="pill ${season ? '' : 'is-active'}" data-stat="career">Whole career</button></div>
      ${statsHtml(season ? c.league.tally : w.tally, season ? yourTierIds(c, you) : null, clubs, you)}
      <h4>Teams</h4>${teamStatsHtml(yourIds, c.league.rounds, clubs, you, (id) => (id === you.id ? w.you : clubById(w, id)?.rec))}
    </div>`;
  };
  const hallCount = getHall().length;
  const sum = Object.values(c.careerStats);
  const totals = { played: Math.max(0, ...sum.map((x) => x.played)), goals: sum.reduce((n, x) => n + x.goals, 0) };
  let scope: 'season' | 'career' = 'season';
  const cards = () => statRows(c, you, scope).map(({ player: p, stats: st }) => {
    return `<div class="card player-stat-card ${p.starter ? '' : 'is-sub'}">
      <div class="psc-top">${kitChip(p.position === 'GK' ? you.keeperKit : you.kit, 36)}<div>${p.id === c.starId ? '🌟 ' : ''}<strong>${esc(p.name)}</strong> <span class="muted">#${p.number}</span><br/><span class="chip chip-pos chip-${p.position.toLowerCase()}">${POSITION_LABELS[p.position]}</span></div></div>
      <div class="psc-skills">${skillKeys(p.position).map((k) => { const l = skillLabel(p.position, k); return `<span title="${esc(l.label)}">${l.emoji} <span class="stars">${starsText(p.skills[k], STAR_CAP[age])}</span></span>`; }).join('')}</div>
      <div class="psc-stats">
        <span><strong>${st.played}</strong> played</span>
        ${p.position === 'GK' ? `<span><strong>${st.saves}</strong> saves</span><span><strong>${st.cleanSheets}</strong> clean sheets</span>` : `<span><strong>${st.goals}</strong> goals</span><span><strong>${st.assists}</strong> assists</span>`}
        <span><strong>${p.position === 'GK' ? st.passes : st.tackles}</strong> ${p.position === 'GK' ? 'kicks' : 'tackles'}</span>
        <span><strong>${st.motm}</strong> 🏆</span>
      </div>
    </div>`;
  }).join('');
  root.innerHTML = `
    <div class="screen career">
      ${topBar('Career')}
      <div class="tier-banner career-banner">
        <span class="tier-num">Year ${c.year} · ${esc(AGE_STATS[age].label)}${c.twist ? ` · ${TWISTS[c.twist].emoji} ${esc(TWISTS[c.twist].name)}` : ''}${c.legacy ? ` · 👪 Legacy ${'⭐'.repeat(Math.min(5, c.legacy.level))} · Coach ${esc(c.legacy.coach)}` : ''}</span>
        <h2>${esc(you.name)}</h2>
        <p>${c.done ? 'Career complete! 🎓' : `${esc(seasonName(c))} season (${c.season} of ${SEASONS_PER_YEAR}) · ${esc(tier.name)} (Tier ${c.league.tier})`}</p>
        ${rival ? `<button class="t-link rival-line" data-club="${esc(rival.team.id)}">🔥 Rival: ${badgeSvg(rival.team.badge, 18)} <strong>${esc(rival.team.name)}</strong> <span class="small">(Tier ${tierOf(w, rival.team.id)}${h2h ? ` · won ${h2h.w}, drawn ${h2h.d}, lost ${h2h.l}` : ''})</span></button>` : ''}
        <div class="tier-ladder">${CAREER_AGES.map((a, i) => `<span class="rung rung-wide ${a === age && !c.done ? 'is-here' : ''} ${(i < c.year - 1 || c.done) && !(c.twist === 'late' && i < 2) ? 'is-reached' : ''}">${a}</span>`).join('')}</div>
      </div>
      ${pending.length ? `<div class="card outcome-card"><h3>🎒 Moving up to the ${esc(AGE_STATS[age].label)}!</h3><p class="muted">Bigger pitch, longer matches and a higher star cap. Saved-up progress turns into stars:</p>${growthList(pending)}</div>` : ''}
      ${outcome ? `<div class="card outcome-card outcome-${outcome.outcome}"><h3>Season over</h3><p>${esc(outcomeText)}</p>${seasonAwardsHtml(outcome.awards, clubs, you, c.starId)}</div>` : ''}
      ${news.length ? `<div class="card news-card"><h3>${summer ? '☀️ Summer News' : '📰 League news'}</h3><ul class="plain-list">${news.map((n) => `<li>${n.emoji} ${esc(n.text)}</li>`).join('')}</ul>${summer && w.ladder ? `<details><summary>Last season's final tables</summary><div class="ladder">${w.ladder.map((ids, i) => `<div class="ladder-tier"><h4>Tier ${i + 1} · ${esc(tierInfo(i + 1).name)}</h4><ol>${ids.map((id) => `<li class="${id === you.id ? 'is-you' : ''}">${esc(clubs(id)?.name ?? '')}</li>`).join('')}</ol></div>`).join('')}</div></details>` : ''}</div>` : ''}
      ${choosing && !c.done ? starPicker(c, you) : ''}
      ${offering ? offersCard(c, you) : ''}
      ${trial ? trialCard(c, you) : ''}
      ${c.cup && !choosing ? cupCard(c, you) : ''}
      ${star && !choosing ? starCard(c, you, justGrew) : ''}
      ${preview}
      ${choosing ? '' : goalsCard}
      ${choosing ? '' : cabinetHtml(c)}
      ${c.done ? `<div class="card trophy-card"><div class="trophy">🎓</div><h2>All grown up!</h2><p class="muted">${esc(you.name)} played ${totals.played} matches from the Under 5s to the Under 10s, scored ${totals.goals} goals and won ${c.titles} mini-season title${c.titles === 1 ? '' : 's'}. What a journey.</p></div>` : ''}
      <div class="league-body">
        ${c.done ? '' : `<div class="table-area">${tableArea()}</div>`}
        <div class="card next-card">
          ${choosing && !c.done ? '<p class="muted">Pick your Star to kick off.</p>' : offering ? '<p class="muted">Choose: join a new club, or stay and be captain.</p>' : trial ? '<p class="muted">Sign a new player to kick off.</p>' : cupDay ? '<p class="muted">🏆 Cup day! Play your cup tie first, then the league carries on.</p>' : next ? nextMatchHtml(next, `Match ${c.league.round + 1} of ${c.league.rounds.length}`, 'k-play', (rivalNext ? '<span class="chip chip-rival">🔥 Rival match!</span>' : '') + (c.goals.length ? `<span class="muted small">🎯 ${goalsDone} of ${c.goals.length} season goals done</span>` : '')) : po && poWaiting ? `
            <span class="muted">${po.up ? '🎟️ Play-off to go up' : '🛟 Play-off to stay up'}</span>
            <div class="fx-team is-you">${badgeSvg(you.badge, 40)}<span class="fx-name">${esc(you.name)}</span></div>
            <div class="vs-mid">VS</div>
            <div class="fx-team">${badgeSvg(po.opponent.team.badge, 40)}<span class="fx-name">${esc(po.opponent.team.name)}</span></div>
            <p class="muted small">${esc(po.opponent.team.name)} finished ${po.up ? '5th in the' : '2nd in the'} ${esc(tierInfo(po.opponent.tier).name)}. One match: win it and ${po.up ? 'you go up' : 'you stay up'}! A draw goes to penalties.</p>
            ${w.playoff && w.playoff.won === null ? '<button class="btn btn-primary btn-big" id="k-pens">🥅 Penalty shoot-out!</button>' : '<button class="btn btn-primary btn-big" id="k-playoff">⚽ Play the play-off</button>'}` : c.done ? '<button class="btn btn-primary btn-big" id="k-new">🌱 Start a new career</button>' : `
            <button class="btn btn-primary btn-big" id="k-next">${lastSeason ? (lastYear ? '🎓 Finish the career' : `🎒 Move up to ${CAREER_AGES[c.year]}`) : '▶️ Next mini season'}</button>`}
          <button class="btn btn-blue" id="k-edit">👕 Team looks</button>
          ${c.history.length ? `<details class="history"><summary>Past seasons</summary><ul class="plain-list muted">${c.history.map((h) => `<li>${esc(h.age)} ${esc(SEASON_NAMES[(h.miniSeason - 1) % SEASONS_PER_YEAR])}: ${ordinal(h.position)} in ${esc(tierInfo(h.tier).name)}${h.playoff ? ` (play-off ${h.playoff})` : ''}${h.topScorer ? ` · top scorer ${esc(h.topScorer.name)} (${h.topScorer.goals})` : ''}</li>`).join('')}</ul></details>` : ''}
          ${hallCount ? `<button class="btn btn-ghost" id="k-hall">🏛️ Hall of Fame <span class="muted small">(${hallCount})</span></button>` : ''}
          <button class="btn btn-ghost" id="k-quit">🏛️ Retire this career</button>
        </div>
      </div>
      ${c.scrapbook.length ? `<details class="card scrap-card" ${c.done ? 'open' : ''}><summary><strong>📖 Scrapbook</strong> <span class="muted small">${c.scrapbook.length} big moment${c.scrapbook.length === 1 ? '' : 's'}</span></summary>${scrapbookHtml(c.scrapbook)}</details>` : ''}
      <div class="card stat-cards-wrap">
        <div class="row space-between">
          <h3>Player cards</h3>
          <div class="pills"><button class="pill is-active" data-scope="season">This season</button><button class="pill" data-scope="career">Whole career</button></div>
        </div>
        <div class="stat-cards" id="k-cards">${cards()}</div>
      </div>
    </div>`;
  wire(root, () => router.go({ name: 'menu' }));
  const area = root.querySelector<HTMLElement>('.table-area');
  const redrawTable = () => { if (area) area.innerHTML = tableArea(); };
  area?.addEventListener('click', (e) => {
    const el = (e.target as HTMLElement).closest<HTMLElement>('[data-tab], [data-stat]');
    if (!el) return;
    if (el.dataset.tab) tab = el.dataset.tab as typeof tab;
    if (el.dataset.stat) statScope = el.dataset.stat as typeof statScope;
    redrawTable();
    root.querySelector<HTMLElement>(el.dataset.tab ? `[data-tab="${tab}"]` : `[data-stat="${statScope}"]`)?.focus();
  });
  root.querySelector('.screen')?.addEventListener('click', (e) => {
    const el = (e.target as HTMLElement).closest<HTMLElement>('[data-club]');
    if (el) openClubPage(c, you, el.dataset.club!);
  });
  const playoffStart = (mode: 'match' | 'shootout') => {
    if (!po) return;
    playNextMatch(router, { home: you, away: po.opponent.team, youAreHome: true }, { halfSeconds: mode === 'shootout' ? 60 : c.halfSeconds, career: true, cpuLevel: po.cpuLevel, starId: c.starId, big: 'playoff', mode });
  };
  const cupStart = (mode: 'match' | 'shootout') => {
    const tie = c.cup && yourTie(c.cup, you.id);
    const opp = tie && clubById(w, tie.homeId === you.id ? tie.awayId : tie.homeId);
    if (!tie || !opp) return;
    const home = tie.homeId === you.id;
    playNextMatch(router, { home: home ? you : opp.team, away: home ? opp.team : you, youAreHome: home }, { halfSeconds: mode === 'shootout' ? 60 : c.halfSeconds, career: true, cpuLevel: tierInfo(opp.tier).level + careerNudge(c, opp.team.id), starId: c.starId, big: c.cup!.round === CUP_ROUNDS.length - 1 ? 'cup-final' : 'cup', mode });
  };
  root.querySelector('#k-cup')?.addEventListener('click', () => cupStart('match'));
  root.querySelector('#k-cup-pens')?.addEventListener('click', () => cupStart('shootout'));
  root.querySelector('#k-playoff')?.addEventListener('click', () => playoffStart('match'));
  root.querySelector('#k-pens')?.addEventListener('click', () => playoffStart('shootout'));
  root.querySelectorAll<HTMLElement>('[data-scope]').forEach((b) => b.addEventListener('click', () => {
    scope = b.dataset.scope as 'season' | 'career';
    root.querySelectorAll('[data-scope]').forEach((x) => x.classList.toggle('is-active', x === b));
    root.querySelector('#k-cards')!.innerHTML = cards();
  }));
  root.querySelector('#k-play')?.addEventListener('click', () => playNextMatch(router, next!, { halfSeconds: c.halfSeconds, career: true, cpuLevel: tier.level + careerNudge(c, opponentId), starId: c.starId, ...(rivalNext ? { big: 'rival' as const } : {}) }));
  root.querySelectorAll<HTMLElement>('[data-star]').forEach((b) => b.addEventListener('click', () => {
    if (!pickStar(c, you, b.dataset.star!)) return;
    setCareer(c);
    renderCareer(root, router);
  }));
  root.querySelectorAll<HTMLElement>('[data-signature]').forEach((b) => b.addEventListener('click', () => {
    if (!pickSignature(c, you, b.dataset.signature as SignatureId)) return;
    saveTeam(you);
    setCareer(c);
    renderCareer(root, router);
    root.querySelector<HTMLElement>(`[data-signature="${b.dataset.signature}"]`)?.focus();
  }));
  root.querySelector('#k-stay')?.addEventListener('click', () => {
    const milestones = stayAtClub(c, you);
    setCareer(c);
    const stickers = recordCareer({ starMilestones: c.milestones.length });
    renderCareer(root, router);
    const note = (milestones.length ? `<div class="star-note"><h3>©️ Captain!</h3><p>${esc(careerStar(c, you)?.name ?? '')} is the new captain of ${esc(you.name)}. <span class="muted">(+1 point)</span></p></div>` : '') + stickerBanner(stickers);
    if (note) root.querySelector('.career-banner')?.insertAdjacentHTML('afterend', `<div class="card outcome-card">${note}</div>`);
  });
  root.querySelectorAll<HTMLElement>('[data-join]').forEach((b) => b.addEventListener('click', async () => {
    const club = clubById(c.world, b.dataset.join!);
    const star = careerStar(c, you);
    if (!club || !star) return;
    const rivals = club.team.id === c.world.rivalId;
    if (!(await askConfirm({ title: `Join ${club.team.name}?`, body: `${star.name} moves to ${club.team.name} and plays for them from now on. ${you.name} stay in My Teams${rivals ? ', and become your new rivals' : ''}.`, yes: 'Join', no: 'Not yet' }))) return;
    const fresh = joinClub(c, you, club.team.id);
    if (!fresh) return;
    saveTeam(you);
    saveTeam(fresh);
    setCareer(c);
    const stickers = recordCareer({ joined: true });
    renderCareer(root, router);
    root.querySelector('.career-banner')?.insertAdjacentHTML('afterend', `<div class="card outcome-card"><h3>✈️ Welcome to ${esc(fresh.name)}!</h3><p>${esc(star.name)} pulls on a new shirt. A new club, a new tier, a new adventure.</p>${stickerBanner(stickers)}</div>`);
  }));
  root.querySelectorAll<HTMLElement>('[data-sign]').forEach((b) => b.addEventListener('click', () => {
    if (!signTriallist(c, you, b.dataset.sign!)) return;
    saveTeam(you);
    setCareer(c);
    renderCareer(root, router);
  }));
  root.querySelectorAll<HTMLElement>('[data-train]').forEach((b) => b.addEventListener('click', () => {
    const grew = trainStar(c, you, b.dataset.train as SkillKey);
    if (!grew) return;
    saveTeam(you);
    setCareer(c);
    const stickers = grew.length ? recordCareer({ starUp: true, fiveStar: grew.some((g) => g.stars >= 5) }) : [];
    renderCareer(root, router, grew);
    if (stickers.length) root.querySelector('.star-card')?.insertAdjacentHTML('beforeend', stickerBanner(stickers));
    root.querySelector<HTMLElement>(`[data-train="${b.dataset.train}"]`)?.focus();
  }));
  root.querySelector('#k-next')?.addEventListener('click', () => {
    const adv = advanceCareer(c, you);
    saveTeam(you);
    setCareer(c);
    const playoff = adv.record.playoff === 'won' ? (adv.record.outcome === 'promoted' ? 'up' : 'stayed') : null;
    const stickers = recordCareer({ champion: adv.record.position === 1, movedUp: adv.movedUp, finished: adv.finished, starUp: c.pendingGrowth.length > 0, tierTitle: adv.titleTier, allTheWayUp: adv.allTheWayUp, everyYear: adv.everyYear, playoff, twistDone: adv.finished ? c.twist : null, starAward: !!adv.awards?.some((a) => a.playerId === c.starId), seasonAwards: awardsFor(adv.record.awards, you.id).map((a) => a.id), loyal: adv.finished && c.starPicked && c.moves === 0, starMilestones: adv.milestones.length ? c.milestones.length : 0 });
    renderCareer(root, router);
    const awards = adv.awards?.length ? `<div class="awards-night"><h3>🎤 Awards Night: ${esc(adv.record.age)}</h3><ul class="plain-list">${adv.awards.map((a) => `<li class="${a.playerId === c.starId ? 'is-star' : ''}"><span class="aw-emoji">${a.emoji}</span><span><strong>${esc(a.title)}</strong><br/>${a.playerId === c.starId ? '🌟 ' : ''}${esc(a.name)} <span class="muted small">${esc(a.line)}</span></span></li>`).join('')}</ul></div>` : '';
    const note = awards + (adv.milestones.length ? `<div class="star-note"><h3>🌟 Milestone!</h3><ul class="plain-list">${adv.milestones.map((m) => `<li>${m.emoji} <strong>${esc(m.name)}</strong>: ${esc(m.how)} <span class="muted">(+1 point)</span></li>`).join('')}</ul></div>` : '') + stickerBanner(stickers);
    if (note) root.querySelector('.career-banner')?.insertAdjacentHTML('afterend', `<div class="card outcome-card">${note}</div>`);
  });
  root.querySelector('#k-hall')?.addEventListener('click', () => router.go({ name: 'hall' }));
  root.querySelector('#k-edit')?.addEventListener('click', () => router.go({ name: 'builder', teamId: you.id }));
  root.querySelector('#k-new')?.addEventListener('click', () => router.go({ name: 'setup', homeId: you.id, mode: 'career' }));
  root.querySelector('#k-quit')?.addEventListener('click', async () => {
    if (!(await askConfirm({ title: 'Retire this career?', body: 'It goes into the Hall of Fame, with its Star, trophies and scrapbook, and you can start a new one.\n\nThe team stays in My Teams.', yes: 'Retire career', no: 'Keep playing' }))) return;
    const kept = retireCareer();
    const stickers = kept ? recordCareer({ hall: getHall().length }) : [];
    router.go(kept ? { name: 'hall' } : { name: 'menu' });
    if (stickers.length) document.querySelector('.hof-banner')?.insertAdjacentHTML('afterend', `<div class="card outcome-card">${stickerBanner(stickers)}</div>`);
  });
}
