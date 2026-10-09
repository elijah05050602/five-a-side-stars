/** The trophy cabinet on the career screen: shelves of titles, cups, play-offs and awards that fill up over a career. */
import { STICKERS } from '../../data/progress';
import { SEASON_NAMES, SEASONS_PER_YEAR, type CareerState } from '../../game/career';
import { CUP_ROUNDS } from '../../game/careerCup';
import { tierInfo } from '../../game/league';
import { esc } from '../hud';

const tierEmoji = (tier: number): string => STICKERS.find((s) => s.id === `tier${tier}-champ`)?.emoji ?? '🏆';

interface Item { emoji: string; label: string; star?: boolean }

const item = (i: Item) => `<li class="cab-item ${i.star ? 'is-star' : ''}" title="${esc(i.label)}"><span class="cab-emoji" aria-hidden="true">${i.emoji}</span><small>${esc(i.label)}</small></li>`;

function shelf(title: string, items: Item[], empty: string): string {
  return `<div class="cab-shelf"><h4>${esc(title)} <span class="muted small">${items.length || ''}</span></h4>
    ${items.length ? `<ul class="cab-row">${items.map(item).join('')}</ul>` : `<p class="muted small cab-empty">${esc(empty)}</p>`}</div>`;
}

export function cabinetHtml(c: CareerState): string {
  const when = (age: string, mini: number) => `${age} ${SEASON_NAMES[(mini - 1) % SEASONS_PER_YEAR]}`;
  const titles: Item[] = c.history.filter((h) => h.position === 1).map((h) => ({ emoji: tierEmoji(h.tier), label: `${tierInfo(h.tier).name}, ${when(h.age, h.miniSeason)}` }));
  const cups: Item[] = c.cupRuns.filter((r) => r.reached === 3).map((r) => ({ emoji: '🏵️', label: `${r.age} Cup` }));
  const bestRun = Math.max(-1, ...c.cupRuns.map((r) => r.reached));
  const playoffs: Item[] = c.history.filter((h) => h.playoff === 'won').map((h) => (h.outcome === 'promoted' ? { emoji: '🎟️', label: `Up, ${when(h.age, h.miniSeason)}` } : { emoji: '🛟', label: `Stayed up, ${when(h.age, h.miniSeason)}` }));
  const awards: Item[] = c.awards.flatMap((n) => n.awards.map((a) => ({ emoji: a.emoji, label: `${a.title}: ${a.name} (${n.age})`, star: a.playerId === c.starId })));
  const count = titles.length + cups.length + playoffs.length + awards.length;
  return `<details class="card cabinet-card" ${count ? 'open' : ''}>
    <summary><strong>🏆 Trophy cabinet</strong> <span class="muted small">${count} ${count === 1 ? 'trophy' : 'trophies'}</span></summary>
    ${shelf('League titles', titles, 'Win a mini season to put the first one here.')}
    ${shelf('Cups', cups, bestRun >= 0 && bestRun < CUP_ROUNDS.length ? `Best cup run so far: the ${CUP_ROUNDS[bestRun].toLowerCase()}.` : 'The cup comes before the 3rd mini season of every year.')}
    ${shelf('Play-offs', playoffs, 'Win a play-off to go up, or to stay up.')}
    ${shelf('Awards', awards, 'Awards night is at the end of every year.')}
  </details>`;
}
