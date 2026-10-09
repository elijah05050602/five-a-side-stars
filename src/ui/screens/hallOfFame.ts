/** The Hall of Fame: every retired or finished career, side by side, each with its Star card and scrapbook. */
import { getHall } from '../../data/storage';
import { STICKERS } from '../../data/progress';
import { skillLabel, starsText } from '../../data/skills';
import { POSITION_LABELS } from '../../data/types';
import { AGE_STATS } from '../../data/ageGroups';
import { STAR_MILESTONES } from '../../game/career';
import { scrapWhen, type HallEntry, type ScrapLine } from '../../game/hallOfFame';
import { tierInfo } from '../../game/league';
import { openPop } from '../dialog';
import { esc } from '../hud';
import { badgeSvg } from '../kitPreview';
import { ordinal, topBar, wire } from './shared';
import type { Router } from '../screens';

/** The tier champion badge for each tier, Tier 1 first. */
const tierEmoji = (tier: number): string => STICKERS.find((s) => s.id === `tier${tier}-champ`)?.emoji ?? '🏆';

/** A scrapbook as a timeline, oldest first, one heading per mini season. */
export function scrapbookHtml(lines: ScrapLine[]): string {
  if (!lines.length) return '<p class="muted small">Nothing in the scrapbook yet. Play a match!</p>';
  let last = '';
  return `<ol class="scrapbook">${lines.map((l) => {
    const when = scrapWhen(l.at);
    const head = when !== last ? `<li class="sb-when">${esc(when)}</li>` : '';
    last = when;
    return `${head}<li class="sb-line"><span class="sb-emoji" aria-hidden="true">${esc(l.emoji)}</span><span>${esc(l.text)}</span></li>`;
  }).join('')}</ol>`;
}

function trophyRow(e: HallEntry): string {
  const won = e.tierTitles.map((n, i) => (n ? `<span class="hof-tier" title="${esc(tierInfo(i + 1).name)}: ${n}">${tierEmoji(i + 1)}${n > 1 ? `<small>×${n}</small>` : ''}</span>` : '')).join('');
  return won || '<span class="muted small">No titles yet</span>';
}

function cardHtml(e: HallEntry, i: number): string {
  const s = e.star;
  const keeper = s?.position === 'GK';
  return `<div class="card hof-card ${e.finished ? 'is-finished' : ''}">
    <div class="hof-head">${badgeSvg(e.team.badge, 44)}<div><span class="muted small">Career ${e.no}</span><br/><strong>${esc(e.team.name)}</strong></div>
      <span class="chip ${e.finished ? 'chip-done' : ''}">${e.finished ? '🎓 Finished' : `Retired at ${esc(e.age)}`}</span></div>
    ${s ? `<div class="hof-star"><span class="hof-face" style="--skin:${s.skin};--hair:${s.hair}" aria-hidden="true"><i></i></span><div><span class="muted small">🌟 Star</span><br/><strong>${esc(s.name)}</strong> <span class="muted">#${s.number}</span> <span class="chip chip-pos chip-${s.position.toLowerCase()}">${POSITION_LABELS[s.position]}</span></div></div>
      <div class="psc-skills">${Object.entries(s.skills).map(([k, n]) => { const l = skillLabel(s.position, k as never); return `<span title="${esc(l.label)}">${l.emoji} <span class="stars">${starsText(n, 5)}</span></span>`; }).join('')}</div>` : ''}
    <div class="psc-stats"><span><strong>${e.totals.played}</strong> played</span>${keeper ? `<span><strong>${e.totals.saves}</strong> saves</span><span><strong>${e.totals.cleanSheets}</strong> clean sheets</span>` : `<span><strong>${e.totals.goals}</strong> goals</span><span><strong>${e.totals.assists}</strong> assists</span>`}<span><strong>${e.totals.motm}</strong> 🏆</span></div>
    <p class="hof-trophies">${trophyRow(e)}</p>
    <p class="small">${e.titles} title${e.titles === 1 ? '' : 's'} · ${e.seasons} mini season${e.seasons === 1 ? '' : 's'} · ${e.milestones.length} of ${STAR_MILESTONES.length} milestones${e.playoffsWon ? ` · ${e.playoffsWon} play-off${e.playoffsWon === 1 ? '' : 's'} won` : ''}</p>
    ${e.best ? `<p class="small muted">Best season: ${esc(e.best.when)}, ${ordinal(e.best.position)} in the ${esc(tierInfo(e.best.tier).name)}</p>` : ''}
    ${e.rival ? `<p class="small muted">🔥 v ${esc(e.rival.name)}: won ${e.rival.w}, drew ${e.rival.d}, lost ${e.rival.l}</p>` : ''}
    <button class="btn btn-blue" data-book="${i}">📖 Scrapbook</button>
  </div>`;
}

function openScrapbook(e: HallEntry): void {
  const got = STAR_MILESTONES.filter((m) => e.milestones.includes(m.id));
  const preview = `<div class="hof-book">
    ${got.length ? `<div class="milestones">${got.map((m) => `<span class="milestone is-got" title="${esc(m.how)}">${m.emoji}<small>${esc(m.name)}</small></span>`).join('')}</div>` : ''}
    ${scrapbookHtml(e.scrapbook)}
  </div>`;
  void openPop<void>({ icon: '📖', title: `${e.team.name}: Career ${e.no}`, tone: 'oops', preview, buttons: [{ label: 'Close', value: undefined, kind: 'primary' }], focus: 0, cancel: undefined });
}

export function renderHallOfFame(root: HTMLElement, router: Router): void {
  const hall = getHall();
  root.innerHTML = `
    <div class="screen hall">
      ${topBar('Hall of Fame')}
      <div class="tier-banner hof-banner">
        <span class="tier-num">🏛️ ${hall.length} career${hall.length === 1 ? '' : 's'}</span>
        <h2>Hall of Fame</h2>
        <p>Every career you finish or retire is kept here, with its Star, its trophies and its scrapbook.</p>
      </div>
      ${hall.length ? `<div class="hof-grid">${hall.map(cardHtml).join('')}</div>` : `<div class="card"><p>No careers here yet. Play a career from the ${esc(AGE_STATS.U5.label)} to the ${esc(AGE_STATS.U10.label)}, or retire one, and it goes up on the wall.</p><button class="btn btn-primary" id="h-career">🌱 Go to Career</button></div>`}
    </div>`;
  wire(root, () => router.go({ name: 'menu' }));
  root.querySelectorAll<HTMLElement>('[data-book]').forEach((b) => b.addEventListener('click', () => openScrapbook(hall[Number(b.dataset.book)])));
  root.querySelector('#h-career')?.addEventListener('click', () => router.go({ name: 'career' }));
}
