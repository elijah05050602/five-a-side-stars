import { AGE_STATS } from '../../data/ageGroups';
import { getCareer, getTeam, saveTeam, setCareer } from '../../data/storage';
import { POSITION_LABELS } from '../../data/types';
import { STAR_CAP, skillKeys, skillLabel, starsText } from '../../data/skills';
import { CAREER_AGES, SEASONS_PER_YEAR, SEASON_NAMES, STAR_MILESTONES, TRAINING_STEP, advanceCareer, canTrain, careerAge, careerSeasonOutcome, careerSeasonOver, careerStar, freshSeasonStats, pickStar, seasonName, statRows, trainStar, type GrowthEvent } from '../../game/career';
import { recordCareer } from '../../data/progress';
import { computeTable, nextFixture, tierInfo } from '../../game/league';
import { esc } from '../hud';
import { kitChip } from '../kitPreview';
import { nextMatchHtml, playNextMatch, tableCard } from './leagueParts';
import { topBar, wire, ordinal, growthList, stickerBanner } from './shared';
import type { SkillKey, Team } from '../../data/types';
import type { CareerState } from '../../game/career';
import type { Router } from '../screens';

/** Everyone in the squad as a button, to pick (or re-pick) the career's Star. */
function starPicker(c: CareerState, you: Team): string {
  const lost = c.starPicked; // picked before, but that player has left the squad
  return `<div class="card star-pick">
    <h3>🌟 ${lost ? 'Pick a new Star' : 'Who is your Star?'}</h3>
    <p class="muted">${lost ? 'Your Star has left the squad.' : 'Your Star is the player this career follows.'} You still play every match with the whole team, but your Star wears a gold star, earns training points to spend, and collects milestones.</p>
    <div class="star-pick-grid">${you.players.map((p) => `<button class="btn star-pick-btn ${p.id === c.starId ? 'is-suggested' : ''}" data-star="${esc(p.id)}">${kitChip(p.position === 'GK' ? you.keeperKit : you.kit, 36)}<span><strong>${esc(p.name)}</strong> #${p.number}<br/><span class="chip chip-pos chip-${p.position.toLowerCase()}">${POSITION_LABELS[p.position]}</span></span></button>`).join('')}</div>
  </div>`;
}

/** The Star's card: training points to spend, ratings with progress to the next star, and milestones. */
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
  const tier = tierInfo(c.league.tier);
  const table = computeTable(c.league, you);
  const over = !c.done && careerSeasonOver(c);
  const next = c.done ? null : nextFixture(c.league, you);
  const outcome = over ? careerSeasonOutcome(c, you) : null;
  const lastSeason = c.season === SEASONS_PER_YEAR;
  const lastYear = c.year === CAREER_AGES.length;
  const pending = c.pendingGrowth;
  if (pending.length) { c.pendingGrowth = []; setCareer(c); }
  const outcomeText = outcome
    ? (outcome.position === 1 ? `🥇 Champions of the ${tier.name}! ` : `You finished ${ordinal(outcome.position)} in the ${tier.name}. `)
      + (outcome.outcome === 'promoted' ? `Up to Tier ${c.league.tier - 1} next season! ` : outcome.outcome === 'relegated' ? `Down to Tier ${c.league.tier + 1} next season, you will bounce back. ` : '')
      + (outcome.topScorer ? `Top scorer: ${outcome.topScorer.name} with ${outcome.topScorer.goals}. ` : '')
      + (lastSeason ? (lastYear ? 'That was the last season of the Under 10s: the career is complete!' : `That was the last season of the year: next up, the ${AGE_STATS[CAREER_AGES[c.year]].label}!`) : '')
    : '';
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
        <span class="tier-num">Year ${c.year} · ${esc(AGE_STATS[age].label)}</span>
        <h2>${esc(you.name)}</h2>
        <p>${c.done ? 'Career complete! 🎓' : `${esc(seasonName(c))} season (${c.season} of ${SEASONS_PER_YEAR}) · ${esc(tier.name)} (Tier ${c.league.tier})`}</p>
        <div class="tier-ladder">${CAREER_AGES.map((a, i) => `<span class="rung rung-wide ${a === age && !c.done ? 'is-here' : ''} ${i < c.year - 1 || c.done ? 'is-reached' : ''}">${a}</span>`).join('')}</div>
      </div>
      ${pending.length ? `<div class="card outcome-card"><h3>🎒 Moving up to the ${esc(AGE_STATS[age].label)}!</h3><p class="muted">Bigger pitch, longer matches and a higher star cap. Saved-up progress turns into stars:</p>${growthList(pending)}</div>` : ''}
      ${outcome ? `<div class="card outcome-card outcome-${outcome.outcome}"><h3>Season over</h3><p>${esc(outcomeText)}</p></div>` : ''}
      ${choosing && !c.done ? starPicker(c, you) : ''}
      ${star && !choosing ? starCard(c, you, justGrew) : ''}
      ${c.done ? `<div class="card trophy-card"><div class="trophy">🎓</div><h2>All grown up!</h2><p class="muted">${esc(you.name)} played ${totals.played} matches from the Under 5s to the Under 10s, scored ${totals.goals} goals and won ${c.titles} mini-season title${c.titles === 1 ? '' : 's'}. What a journey.</p></div>` : ''}
      <div class="league-body">
        ${c.done ? '' : tableCard(table, c.league.tier, 'Top two go up a tier.')}
        <div class="card next-card">
          ${choosing && !c.done ? '<p class="muted">Pick your Star to kick off.</p>' : next ? nextMatchHtml(next, `Match ${c.league.round + 1} of ${c.league.rounds.length}`, 'k-play') : c.done ? '<button class="btn btn-primary btn-big" id="k-new">🌱 Start a new career</button>' : `
            <button class="btn btn-primary btn-big" id="k-next">${lastSeason ? (lastYear ? '🎓 Finish the career' : `🎒 Move up to ${CAREER_AGES[c.year]}`) : '▶️ Next mini season'}</button>`}
          <button class="btn btn-blue" id="k-edit">👕 Team looks</button>
          ${c.history.length ? `<details class="history"><summary>Past seasons</summary><ul class="plain-list muted">${c.history.map((h) => `<li>${esc(h.age)} ${esc(SEASON_NAMES[(h.miniSeason - 1) % SEASONS_PER_YEAR])}: ${ordinal(h.position)} in ${esc(tierInfo(h.tier).name)}${h.topScorer ? ` · top scorer ${esc(h.topScorer.name)} (${h.topScorer.goals})` : ''}</li>`).join('')}</ul></details>` : ''}
          <button class="btn btn-ghost" id="k-quit">Leave this career</button>
        </div>
      </div>
      <div class="card stat-cards-wrap">
        <div class="row space-between">
          <h3>Player cards</h3>
          <div class="pills"><button class="pill is-active" data-scope="season">This season</button><button class="pill" data-scope="career">Whole career</button></div>
        </div>
        <div class="stat-cards" id="k-cards">${cards()}</div>
      </div>
    </div>`;
  wire(root, () => router.go({ name: 'menu' }));
  root.querySelectorAll<HTMLElement>('[data-scope]').forEach((b) => b.addEventListener('click', () => {
    scope = b.dataset.scope as 'season' | 'career';
    root.querySelectorAll('[data-scope]').forEach((x) => x.classList.toggle('is-active', x === b));
    root.querySelector('#k-cards')!.innerHTML = cards();
  }));
  root.querySelector('#k-play')?.addEventListener('click', () => playNextMatch(router, next!, { halfSeconds: c.halfSeconds, career: true, cpuLevel: tier.level, starId: c.starId }));
  root.querySelectorAll<HTMLElement>('[data-star]').forEach((b) => b.addEventListener('click', () => {
    if (!pickStar(c, you, b.dataset.star!)) return;
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
    recordCareer({ champion: adv.record.position === 1, movedUp: adv.movedUp, finished: adv.finished, starUp: c.pendingGrowth.length > 0 });
    renderCareer(root, router);
  });
  root.querySelector('#k-edit')?.addEventListener('click', () => router.go({ name: 'builder', teamId: you.id }));
  root.querySelector('#k-new')?.addEventListener('click', () => router.go({ name: 'setup', homeId: you.id, mode: 'career' }));
  root.querySelector('#k-quit')?.addEventListener('click', () => {
    if (confirm('Leave this career? Your seasons and stats will be deleted. The team stays in My Teams.')) { setCareer(null); router.go({ name: 'menu' }); }
  });
}
