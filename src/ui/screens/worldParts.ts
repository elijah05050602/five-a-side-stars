/** The league's stats pages, every tier's table and the club pages, shared by the career and League mode. */
import { STAR_CAP, skillKeys, skillLabel, starsText } from '../../data/skills';
import { POSITION_LABELS, type Team } from '../../data/types';
import { CAREER_AGES, SEASON_NAMES, SEASONS_PER_YEAR, type CareerState } from '../../game/career';
import { activeIds, clubById, tierOf, tierTable, type ClubRecord, type CareerWorld } from '../../game/careerWorld';
import { tierInfo, type LeagueFixture, type LeagueState, type Tally } from '../../game/league';
import { openPop } from '../dialog';
import { esc } from '../hud';
import { badgeSvg } from '../kitPreview';
import { ordinal } from './shared';

/** Last five results as ticks, dashes and crosses, oldest first. */
export const formIcons = (form: string): string => [...form].map((r) => (r === 'W' ? '✅' : r === 'D' ? '➖' : '❌')).join('') || '–';

/** Names and badges for the clubs a tally mentions. */
export type ClubLookup = (id: string) => Team | undefined;

export const worldLookup = (w: CareerWorld, you: Team): ClubLookup => (id) => (id === you.id ? you : clubById(w, id)?.team);
export const leagueLookup = (ls: LeagueState, you: Team): ClubLookup => (id) => (id === you.id ? you : ls.teams.find((t) => t.id === id));

function leaders(rows: [string, Tally][], value: (t: Tally) => number, clubs: ClubLookup, you: Team, show: (t: Tally) => string, n: number, keepers = false): string {
  const list = rows.filter(([, t]) => (keepers ? t.gk : true) && value(t) > 0).sort((a, b) => value(b[1]) - value(a[1]) || a[1].name.localeCompare(b[1].name)).slice(0, n);
  if (!list.length) return '<p class="muted small">Nobody yet. Play a match!</p>';
  return `<ol class="leader-list">${list.map(([, t]) => {
    const club = clubs(t.club);
    return `<li class="${t.club === you.id ? 'is-you' : ''}"><span class="leader-who">${club ? badgeSvg(club.badge, 18) : ''} <strong>${esc(t.name)}</strong> <span class="muted small">${esc(club?.name ?? '')}</span></span><span class="leader-val">${show(t)}</span></li>`;
  }).join('')}</ol>`;
}

/** Top scorers, best keepers and most Player of the Match awards, for the players of the given clubs. */
export function statsHtml(tally: Record<string, Tally>, clubIds: string[] | null, clubs: ClubLookup, you: Team): string {
  const rows = Object.entries(tally).filter(([, t]) => !clubIds || clubIds.includes(t.club));
  return `<div class="stats-grid">
    <div><h4>👟 Top scorers</h4>${leaders(rows, (t) => t.g, clubs, you, (t) => `${t.g} goal${t.g === 1 ? '' : 's'}`, 5)}</div>
    <div><h4>🧤 Best keepers</h4>${leaders(rows, (t) => t.cs * 1000 + t.sv, clubs, you, (t) => `${t.cs} clean sheet${t.cs === 1 ? '' : 's'}, ${t.sv} saves`, 3, true)}</div>
    <div><h4>🏆 Player of the Match</h4>${leaders(rows, (t) => t.motm, clubs, you, (t) => `${t.motm} ×`, 3)}</div>
    <div><h4>🤝 Assists</h4>${leaders(rows, (t) => t.a, clubs, you, (t) => `${t.a}`, 3)}</div>
  </div>`;
}

/** One line per club: goals for and against, and (in a career) form, biggest win and longest winning run. */
export function teamStatsHtml(ids: string[], rounds: LeagueFixture[][], clubs: ClubLookup, you: Team, records?: (id: string) => ClubRecord | undefined): string {
  const gfga = new Map(ids.map((id) => [id, [0, 0]]));
  for (const r of rounds) for (const f of r) {
    if (!f.score) continue;
    const h = gfga.get(f.homeId), a = gfga.get(f.awayId);
    if (h) { h[0] += f.score[0]; h[1] += f.score[1]; }
    if (a) { a[0] += f.score[1]; a[1] += f.score[0]; }
  }
  return `<div class="table-scroll"><table class="league-table team-stats">
    <thead><tr><th>Team</th><th title="Goals scored">GF</th><th title="Goals let in">GA</th>${records ? '<th>Form</th><th>Biggest win</th><th title="Most wins in a row">Best run</th>' : ''}</tr></thead>
    <tbody>${ids.map((id) => {
      const t = clubs(id);
      const rec = records?.(id);
      const [gf, ga] = gfga.get(id) ?? [0, 0];
      return `<tr class="${id === you.id ? 'is-you' : ''}"><td class="t-name">${t ? badgeSvg(t.badge, 18) : ''} ${esc(t?.name ?? '')}</td><td>${gf}</td><td>${ga}</td>${records ? `<td class="form">${formIcons(rec?.form ?? '')}</td><td>${rec?.big ? `${rec.big[0]}–${rec.big[1]} <span class="muted small">v ${esc(rec.big[2])}</span>` : '–'}</td><td>${rec?.bestRun ?? 0}</td>` : ''}</tr>`;
    }).join('')}</tbody></table></div>`;
}

/** Every tier's table this mini season, so you can see how the other leagues are going. */
export function ladderHtml(c: CareerState, you: Team, yourTable: { id: string; pts: number }[]): string {
  const w = c.world;
  const yours = tierOf(w, you.id);
  return `<div class="ladder">${w.tiers.map((t) => {
    const table = t.tier === yours ? yourTable : tierTable(w, activeIds(t), t.rounds, you.name);
    const rested = t.resting ? clubById(w, t.resting) : null;
    return `<div class="ladder-tier ${t.tier === yours ? 'is-yours' : ''}">
      <h4>Tier ${t.tier} · ${esc(tierInfo(t.tier).name)}</h4>
      <ol>${table.map((row, i) => {
        const team = row.id === you.id ? you : clubById(w, row.id)?.team;
        const mark = i === 0 ? 'is-up' : (i === 1 && t.tier > 1) || (i === 4 && t.tier < 5) ? 'is-playoff' : i === table.length - 1 && t.tier < 5 ? 'is-down' : '';
        return `<li class="${mark} ${row.id === you.id ? 'is-you' : ''}"><button class="t-link" data-club="${esc(row.id)}">${team ? badgeSvg(team.badge, 18) : ''} ${esc(team?.name ?? '')}${row.id === w.rivalId ? ' 🔥' : ''}</button><span class="muted small">${row.pts} pts</span></li>`;
      }).join('')}</ol>
      ${rested ? `<p class="muted small">😴 ${esc(rested.team.name)} are resting.</p>` : ''}
    </div>`;
  }).join('')}</div>`;
}

/** A club's fixtures this mini season, from your league or its own tier. */
function clubFixtures(c: CareerState, id: string): LeagueFixture[] {
  const t = c.world.tiers[tierOf(c.world, id) - 1];
  const rounds = t.members.includes(c.teamId) ? c.league.rounds : t.rounds;
  return rounds.flat().filter((f) => f.score && (f.homeId === id || f.awayId === id));
}

const seasonLabel = (si: number): string => `${CAREER_AGES[Math.min(CAREER_AGES.length, Math.ceil(si / SEASONS_PER_YEAR)) - 1]} ${SEASON_NAMES[(si - 1) % SEASONS_PER_YEAR]}`;

/** A club's page as a pop-up: squad, player to watch, this season's results, your record against it, and its past seasons. */
export function openClubPage(c: CareerState, you: Team, id: string): void {
  const w = c.world;
  const club = clubById(w, id);
  const team = id === you.id ? you : club?.team;
  if (!team) return;
  const cap = STAR_CAP[team.ageGroup];
  const name = (x: string) => (x === you.id ? you.name : clubById(w, x)?.team.name ?? '');
  const star = club ? team.players.find((p) => p.id === club.starId) : undefined;
  const results = clubFixtures(c, id).map((f) => {
    const home = f.homeId === id;
    const [gf, ga] = home ? f.score! : [f.score![1], f.score![0]];
    return `<li>${gf > ga ? '✅' : gf < ga ? '❌' : '➖'} ${gf}–${ga} ${home ? 'v' : 'at'} ${esc(name(home ? f.awayId : f.homeId))}</li>`;
  });
  const h = w.h2h[id];
  const preview = `<div class="club-page">
    <div class="row club-head">${badgeSvg(team.badge, 48)}<div><strong>${esc(team.name)}</strong><br/><span class="muted small">Tier ${tierOf(w, id)} · ${esc(tierInfo(tierOf(w, id)).name)}</span>${id === w.rivalId ? '<br/><span class="chip chip-rival">🔥 Your rival</span>' : ''}</div></div>
    ${star ? `<p>⭐ Player to watch: <strong>${esc(star.name)}</strong> #${star.number} <span class="muted small">${POSITION_LABELS[star.position]}</span></p><div class="psc-skills">${skillKeys(star.position).map((k) => { const l = skillLabel(star.position, k); return `<span title="${esc(l.label)}">${l.emoji} <span class="stars">${starsText(star.skills[k], cap)}</span></span>`; }).join('')}</div>` : ''}
    ${club ? `<p class="small">${h ? `Your record against them: <strong>${h.w}</strong> won, <strong>${h.d}</strong> drawn, <strong>${h.l}</strong> lost (${h.gf}–${h.ga} in goals).` : 'You have not played them yet.'}</p>` : ''}
    <h4>Squad</h4>
    <ul class="plain-list squad-list">${team.players.map((p) => `<li>#${p.number} ${esc(p.name)} <span class="chip chip-pos chip-${p.position.toLowerCase()}">${POSITION_LABELS[p.position]}</span>${club && p.id === club.starId ? ' ⭐' : ''}</li>`).join('')}</ul>
    <h4>This season</h4>
    ${results.length ? `<ul class="plain-list">${results.join('')}</ul>` : '<p class="muted small">No matches yet.</p>'}
    ${club?.rec.p ? `<p class="small">All career: ${club.rec.w} won, ${club.rec.d} drawn, ${club.rec.l} lost · form ${formIcons(club.rec.form)}</p>` : ''}
    ${club?.past.length ? `<h4>Past seasons</h4><ul class="plain-list muted small">${club.past.slice(-6).reverse().map(([si, tier, pos]) => `<li>${esc(seasonLabel(si))}: ${pos ? `${ordinal(pos)} in the ${esc(tierInfo(tier).name)}` : `rested (${esc(tierInfo(tier).name)})`}</li>`).join('')}</ul>` : ''}
  </div>`;
  void openPop<void>({ icon: '📋', title: team.name, tone: 'oops', preview, buttons: [{ label: 'Close', value: undefined, kind: 'primary' }], focus: 0, cancel: undefined });
}

/** A League mode team's page: squad and this season's results. */
export function openLeagueTeamPage(ls: LeagueState, you: Team, id: string): void {
  const team = id === you.id ? you : ls.teams.find((t) => t.id === id);
  if (!team) return;
  const name = (x: string) => (x === you.id ? you.name : ls.teams.find((t) => t.id === x)?.name ?? '');
  const results = ls.rounds.flat().filter((f) => f.score && (f.homeId === id || f.awayId === id)).map((f) => {
    const home = f.homeId === id;
    const [gf, ga] = home ? f.score! : [f.score![1], f.score![0]];
    return `<li>${gf > ga ? '✅' : gf < ga ? '❌' : '➖'} ${gf}–${ga} ${home ? 'v' : 'at'} ${esc(name(home ? f.awayId : f.homeId))}</li>`;
  });
  const preview = `<div class="club-page">
    <div class="row club-head">${badgeSvg(team.badge, 48)}<div><strong>${esc(team.name)}</strong><br/><span class="muted small">${esc(tierInfo(ls.tier).name)}</span></div></div>
    <h4>Squad</h4>
    <ul class="plain-list squad-list">${team.players.map((p) => `<li>#${p.number} ${esc(p.name)} <span class="chip chip-pos chip-${p.position.toLowerCase()}">${POSITION_LABELS[p.position]}</span></li>`).join('')}</ul>
    <h4>This season</h4>
    ${results.length ? `<ul class="plain-list">${results.join('')}</ul>` : '<p class="muted small">No matches yet.</p>'}
  </div>`;
  void openPop<void>({ icon: '📋', title: team.name, tone: 'oops', preview, buttons: [{ label: 'Close', value: undefined, kind: 'primary' }], focus: 0, cancel: undefined });
}
