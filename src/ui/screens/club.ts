import { POSITION_LABELS } from '../../data/types';
import { canPlay } from '../../data/formations';
import { CLUB_COLOURS, CLUB_LOGO_URL, CLUB_NAME, CLUB_TEAM_ID, ensureClubTeam, resetClubTeam } from '../../data/club';
import { esc } from '../hud';
import { kitChip } from '../kitPreview';
import '../club.css';
import { topBar, wire } from './shared';
import type { Router, SetupMode } from '../screens';
import { askConfirm } from '../dialog';

/** The club page: play as Davao Strikers FC U7 in any mode. The team is an ordinary saved team, so all of it stays editable. */
export function renderClub(root: HTMLElement, router: Router): void {
  const team = ensureClubTeam();
  const order = [...team.players].sort((a, b) => Number(b.starter) - Number(a.starter));
  root.innerHTML = `
    <div class="screen club">
      ${topBar(CLUB_NAME)}
      <div class="card club-hero" style="--club-orange:${CLUB_COLOURS.orange};--club-navy:${CLUB_COLOURS.navy};--club-cream:${CLUB_COLOURS.cream}">
        <img class="club-logo" src="${CLUB_LOGO_URL}" alt="${esc(CLUB_NAME)} logo" width="512" height="512" />
        <div class="club-text">
          <small>Official club of Goal Rush!</small>
          <h2>${esc(team.name)} <span class="chip chip-age">${team.ageGroup}</span></h2>
          <p>Play as the club's Under 7s in their orange and navy kit. Change names, numbers, positions, looks and stars any time in Edit squad.</p>
          <div class="row club-kits">${kitChip(team.kit, 48)}${kitChip(team.awayKit, 48)}${kitChip(team.keeperKit, 48)}</div>
        </div>
      </div>
      <div class="club-squad">
        ${order.map((pl) => `
          <div class="card club-player ${pl.starter ? '' : 'is-sub'}">
            <span class="club-num">${pl.number}</span>
            <span class="club-name"><strong>${esc(pl.name)}</strong><small>${canPlay(pl).map((x) => POSITION_LABELS[x]).join(' / ')}</small></span>
            ${pl.starter ? '' : '<span class="chip chip-sub">Sub</span>'}
          </div>`).join('')}
      </div>
      <div class="club-actions">
        <button class="btn btn-primary btn-big" data-club-go="match">⚽ Play a match</button>
        <button class="btn btn-blue" data-club-go="tournament">🏆 Cup</button>
        <button class="btn btn-blue" data-club-go="league">📋 League</button>
        <button class="btn btn-blue" data-club-go="shootout">🥅 Penalties</button>
        <button class="btn btn-ghost" id="c-edit">✏️ Edit squad</button>
        <button class="btn btn-ghost" id="c-reset" title="Put the club's squad, kits and badge back">↺ Reset to club squad</button>
      </div>
    </div>`;
  wire(root, () => router.go({ name: 'menu' }));
  root.querySelectorAll<HTMLElement>('[data-club-go]').forEach((b) => b.addEventListener('click', () => {
    const mode = b.dataset.clubGo as SetupMode;
    router.go({ name: 'setup', homeId: CLUB_TEAM_ID, mode });
  }));
  root.querySelector('#c-edit')!.addEventListener('click', () => router.go({ name: 'builder', teamId: CLUB_TEAM_ID }));
  root.querySelector('#c-reset')!.addEventListener('click', async () => {
    if (!(await askConfirm({ tone: 'warn', icon: '🔄', title: `Put ${CLUB_NAME} back?`, body: "The squad, kits and badge go back the way the club made them.\n\nYour changes to this team will be lost.", yes: 'Put it back', no: 'Keep my changes' }))) return;
    resetClubTeam();
    renderClub(root, router);
  });
}
