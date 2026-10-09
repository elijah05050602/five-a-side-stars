import { getLeague, getTeam, setLeague } from '../../data/storage';
import { recordSeason } from '../../data/progress';
import { TIERS, computeTable, nextFixture, nextSeason, seasonOutcome, seasonOver, tierInfo } from '../../game/league';
import { esc } from '../hud';
import { wireLogoControls } from '../logoUpload';
import { nextMatchHtml, playNextMatch, tableCard } from './leagueParts';
import { formFrom, matchPreview } from '../../game/news';
import { previewHtml } from './newsParts';
import { leagueLookup, openLeagueTeamPage, seasonAwardsHtml, statsHtml, teamStatsHtml } from './worldParts';
import { topBar, wire, ordinal, stickerBanner } from './shared';
import type { Router } from '../screens';
import { askConfirm } from '../dialog';

export function renderLeague(root: HTMLElement, router: Router): void {
  const ls = getLeague();
  const you = ls && getTeam(ls.teamId);
  if (!ls || !you) {
    if (ls) setLeague(null); // the team was deleted
    router.go({ name: 'setup', mode: 'league' });
    return;
  }
  const info = tierInfo(ls.tier);
  const table = computeTable(ls, you);
  const over = seasonOver(ls);
  const next = nextFixture(ls, you);
  const outcome = over ? seasonOutcome(ls, you) : null;
  const stickers = outcome ? recordSeason(outcome, you.id) : [];
  const outcomeText = outcome
    ? outcome.outcome === 'champion' ? `🏆 Champions of the ${info.name}! You are league legends.`
      : outcome.outcome === 'promoted' ? `⬆️ You finished ${ordinal(outcome.position)}: promoted to Tier ${ls.tier - 1}, the ${tierInfo(ls.tier - 1).name}!`
        : outcome.outcome === 'relegated' ? `⬇️ You finished ${ordinal(outcome.position)}: down to Tier ${ls.tier + 1}, the ${tierInfo(ls.tier + 1).name}. You will bounce back!`
          : outcome.position === 1 ? `🥇 You won the ${info.name}! Already at the top, so one more season to defend it.` : `You finished ${ordinal(outcome.position)}: staying in the ${info.name} for another season.`
    : '';
  const preview = next ? (() => {
    const opp = next.youAreHome ? next.away : next.home;
    return previewHtml(matchPreview({ you, opponent: opp, youAreHome: next.youAreHome, table: table.map((r) => r.team.id), forms: { you: formFrom(ls.rounds, you.id), opponent: formFrom(ls.rounds, opp.id) }, tally: ls.tally ?? {}, round: ls.round + 1, rounds: ls.rounds.length }));
  })() : '';
  let tab: 'table' | 'stats' = 'table';
  const tabs = () => `<div class="pills table-tabs"><button class="pill ${tab === 'table' ? 'is-active' : ''}" data-tab="table">📋 Table</button><button class="pill ${tab === 'stats' ? 'is-active' : ''}" data-tab="stats">📊 Stats</button></div>`;
  const ids = table.map((row) => row.team.id);
  const tableArea = () => (tab === 'table'
    ? tableCard(table, ls.tier, 'Top two go up.', true, { tap: true, tabs: tabs() })
    : `<div class="card table-card">${tabs()}${statsHtml(ls.tally ?? {}, ids, leagueLookup(ls, you), you)}<h4>Teams</h4>${teamStatsHtml(ids, ls.rounds, leagueLookup(ls, you), you)}</div>`);
  root.innerHTML = `
    <div class="screen league">
      ${topBar('League', 'league')}
      <div class="tier-banner tier-${ls.tier}">
        <span class="tier-num">Tier ${ls.tier}</span>
        <h2>${esc(info.name)}</h2>
        <p>${esc(info.blurb)} · Season ${ls.season}</p>
        <div class="tier-ladder">${TIERS.map((t) => `<span class="rung ${t.tier === ls.tier ? 'is-here' : ''} ${t.tier >= ls.bestTier && t.tier !== ls.tier ? 'is-reached' : ''}" title="${esc(t.name)}">${t.tier}</span>`).join('')}</div>
      </div>
      ${outcome ? `<div class="card outcome-card outcome-${outcome.outcome}"><h3>Season over</h3><p>${esc(outcomeText)}</p>${seasonAwardsHtml(outcome.awards, leagueLookup(ls, you), you)}${stickerBanner(stickers)}</div>` : ''}
      ${preview}
      <div class="league-body">
        <div class="table-area">${tableArea()}</div>
        <div class="card next-card">
          ${next ? nextMatchHtml(next, `Round ${ls.round + 1} of ${ls.rounds.length}`, 'l-play') : `
            <button class="btn btn-primary btn-big" id="l-next">${outcome?.outcome === 'promoted' ? '⬆️ Start next season' : outcome?.outcome === 'relegated' ? '🔁 Start next season' : '▶️ Start next season'}</button>`}
          ${ls.history.length ? `<details class="history"><summary>Past seasons</summary><ul class="plain-list muted">${ls.history.map((h) => `<li>Season ${h.season}: ${ordinal(h.position)} in ${esc(tierInfo(h.tier).name)} (${h.outcome})</li>`).join('')}</ul></details>` : ''}
          <button class="btn btn-ghost" id="l-quit">Leave this league</button>
        </div>
      </div>
    </div>`;
  wire(root, () => router.go({ name: 'menu' }));
  const area = root.querySelector<HTMLElement>('.table-area')!;
  area.addEventListener('click', (e) => {
    const el = e.target as HTMLElement;
    const t = el.closest<HTMLElement>('[data-tab]');
    if (t) { tab = t.dataset.tab as typeof tab; area.innerHTML = tableArea(); wireLogos(); area.querySelector<HTMLElement>(`[data-tab="${tab}"]`)?.focus(); return; }
    const club = el.closest<HTMLElement>('[data-club]');
    if (club) openLeagueTeamPage(ls, you, club.dataset.club!);
  });
  const wireLogos = () => wireLogoControls(area, (key) => ls.teams.find((t) => t.id === key)?.badge, () => { setLeague(ls); renderLeague(root, router); });
  wireLogos();
  root.querySelector('#l-play')?.addEventListener('click', () => playNextMatch(router, next!, { halfSeconds: ls.halfSeconds, league: true, cpuLevel: info.level }));
  root.querySelector('#l-next')?.addEventListener('click', () => { setLeague(nextSeason(ls, you)); renderLeague(root, router); });
  root.querySelector('#l-quit')?.addEventListener('click', async () => {
    if (await askConfirm({ title: 'Leave this league?', body: 'Your table and tier will be deleted.', yes: 'Leave league', no: 'Stay in it' })) { setLeague(null); router.go({ name: 'menu' }); }
  });
}
