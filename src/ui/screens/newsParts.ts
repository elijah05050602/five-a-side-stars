/** The Goal Rush Gazette cards: the preview before a match and the front page after it. */
import type { MatchPreview, MatchReport, PreviewSide } from '../../game/news';
import { esc } from '../hud';
import { badgeSvg } from '../kitPreview';
import { formIcons } from './worldParts';
import { ordinal } from './shared';

const masthead = (label: string) => `<div class="gazette-mast"><span>📰 The Goal Rush Gazette</span><span class="muted small">${esc(label)}</span></div>`;

function sideHtml(s: PreviewSide): string {
  return `<div class="gz-side">
    ${badgeSvg(s.team.badge, 40)}
    <strong>${esc(s.team.name)}</strong>
    <span class="muted small">${s.position ? `${ordinal(s.position)} in the table` : ''}</span>
    <span class="gz-form" title="Last five results">${formIcons(s.form)}</span>
    ${s.watch ? `<span class="small">⭐ Watch: <strong>${esc(s.watch.name)}</strong> #${s.watch.number}<br/><span class="muted">${esc(s.watch.why)}</span></span>` : ''}
  </div>`;
}

/** The preview before a match. */
export function previewHtml(p: MatchPreview): string {
  return `<div class="card gazette ${p.rival ? 'is-rival' : ''}">
    ${masthead('Match preview')}
    <h3 class="gz-head">${esc(p.headline)}</h3>
    <div class="gz-sides">${sideHtml(p.home)}<span class="gz-vs">VS</span>${sideHtml(p.away)}</div>
    ${p.h2h ? `<p class="small gz-h2h">Last meetings: you won ${p.h2h.w}, drew ${p.h2h.d}, lost ${p.h2h.l}.</p>` : ''}
  </div>`;
}

/** The front page after a match. */
export function reportHtml(r: MatchReport): string {
  return `<div class="gazette gazette-front">
    ${masthead('Full-time report')}
    <h3 class="gz-head">${esc(r.headline)}</h3>
    <p class="gz-stand">${esc(r.standfirst)}</p>
    ${r.motm ? `<p class="small">🏆 Player of the Match: <strong>${esc(r.motm.name)}</strong> <span class="muted">(${esc(r.motm.team)})</span></p>` : ''}
    ${r.around.length ? `<div class="gz-around"><h4>Around the league</h4><ul class="plain-list small">${r.around.map((a) => `<li>${esc(a.home)} <strong>${a.score[0]}–${a.score[1]}</strong> ${esc(a.away)}</li>`).join('')}</ul></div>` : ''}
  </div>`;
}
