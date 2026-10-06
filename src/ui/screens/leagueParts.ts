/** The parts the league and career screens share: the table, the next match and kicking it off. */
import type { Team } from '../../data/types';
import type { TableRow } from '../../game/league';
import { esc } from '../hud';
import { badgeSvg } from '../kitPreview';
import { logoControls } from '../logoUpload';
import type { Router, StartOptions } from '../screens';
import { resolveKits } from './setup';

/** The table, with the promotion and relegation places marked; with `logos`, the computer teams get a logo button. */
export function tableCard(table: TableRow[], tier: number, upNote: string, logos = false): string {
  return `<div class="card table-card">
          <table class="league-table">
            <thead><tr><th>#</th><th>Team</th><th>P</th><th>W</th><th>D</th><th>L</th><th>GD</th><th>Pts</th></tr></thead>
            <tbody>
              ${table.map((row, i) => `<tr class="${row.isYou ? 'is-you' : ''} ${i < 2 && tier > 1 ? 'is-up' : ''} ${i === table.length - 1 && tier < 5 ? 'is-down' : ''}">
                <td>${i + 1}</td><td class="t-name">${badgeSvg(row.team.badge, 22)} ${esc(row.team.name)}${logos && !row.isYou ? ` <span class="logo-mini">${logoControls(row.team.badge, row.team.id, '📷')}</span>` : ''}</td><td>${row.played}</td><td>${row.won}</td><td>${row.drawn}</td><td>${row.lost}</td><td>${row.gf - row.ga > 0 ? '+' : ''}${row.gf - row.ga}</td><td><strong>${row.points}</strong></td>
              </tr>`).join('')}
            </tbody>
          </table>
          <p class="muted small">${tier > 1 ? upNote : 'Top of the tree!'} ${tier < 5 ? 'Bottom team goes down.' : ''}</p>
        </div>`;
}

export interface NextMatch { home: Team; away: Team; youAreHome: boolean }

/** The next match: both badges with yours marked, and a play button with the given id. */
export function nextMatchHtml(next: NextMatch, label: string, playId: string): string {
  return `
            <span class="muted">${label}</span>
            <div class="fx-team ${next.youAreHome ? 'is-you' : ''}">${badgeSvg(next.home.badge, 40)}<span class="fx-name">${esc(next.home.name)}</span></div>
            <div class="vs-mid">VS</div>
            <div class="fx-team ${!next.youAreHome ? 'is-you' : ''}">${badgeSvg(next.away.badge, 40)}<span class="fx-name">${esc(next.away.name)}</span></div>
            <button class="btn btn-primary btn-big" id="${playId}">⚽ Play next match</button>`;
}

/** Kick off the next match. The human always controls the home side of the sim, so your team goes there; the table flips the score when you were away. */
export function playNextMatch(router: Router, next: NextMatch, o: Pick<StartOptions, 'halfSeconds' | 'cpuLevel' | 'league' | 'career'>): void {
  const [h, a] = resolveKits(next.youAreHome ? next.home : next.away, next.youAreHome ? next.away : next.home);
  router.startMatch({ home: h, away: a, difficulty: 'normal', mode: 'match', ...o });
}
