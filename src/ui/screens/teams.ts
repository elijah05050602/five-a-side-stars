import { deleteTeam, getCareer, getHall, getLeague, getTeam, getTeams, retireCareer, setLeague } from '../../data/storage';
import { recordCareer } from '../../data/progress';
import { esc } from '../hud';
import { badgeSvg, kitChip } from '../kitPreview';
import { askConfirm } from '../dialog';
import { topBar, wire } from './shared';
import type { Router } from '../screens';

export function renderTeams(root: HTMLElement, router: Router): void {
  const teams = getTeams();
  root.innerHTML = `
    <div class="screen">
      ${topBar('My Squad', 'squad')}
      <div class="team-grid">
        ${teams.map((t) => `
          <div class="card team-card" data-id="${t.id}">
            <div class="team-card-top">${badgeSvg(t.badge, 56)}${kitChip(t.kit, 48)}<span class="chip chip-age">${t.ageGroup}</span>${t.career ? '<span class="chip chip-career">🌱 Career</span>' : ''}</div>
            <h3>${esc(t.name)}</h3>
            <p class="muted">${t.players.length} players: ${t.players.map((p) => esc(p.name)).join(', ')}</p>
            <div class="row">
              <button class="btn btn-primary" data-play="${t.id}">Play</button>
              <button class="btn btn-blue" data-edit="${t.id}">Edit</button>
              <button class="btn btn-ghost btn-icon team-delete" data-delete="${t.id}" title="Delete ${esc(t.name)}" aria-label="Delete ${esc(t.name)}">🗑️</button>
            </div>
          </div>`).join('')}
        <button class="card team-card team-card-new" id="t-new"><span class="plus">+</span><span>Create Team</span></button>
      </div>
    </div>`;
  wire(root, () => router.go({ name: 'menu' }));
  root.querySelectorAll<HTMLElement>('[data-edit]').forEach((b) => b.addEventListener('click', () => router.go({ name: 'builder', teamId: b.dataset.edit })));
  root.querySelectorAll<HTMLElement>('[data-play]').forEach((b) => b.addEventListener('click', () => router.go({ name: 'setup', homeId: b.dataset.play })));
  root.querySelector('#t-new')!.addEventListener('click', () => router.go({ name: 'builder' }));
  root.querySelectorAll<HTMLElement>('[data-delete]').forEach((b) => b.addEventListener('click', async () => {
    const t = getTeam(b.dataset.delete!);
    if (!t) return;
    const inLeague = getLeague()?.teamId === t.id;
    const inCareer = getCareer()?.teamId === t.id;
    const extra = inLeague ? '\n\nYour league with this team will end too.' : inCareer ? '\n\nYour career with this team will end too. It stays in the Hall of Fame.' : '';
    const sure = await askConfirm({
      title: `Delete ${t.name}?`, body: `This team will be gone for good.${extra}`, yes: 'Yes, delete', no: 'Keep it',
      preview: `${badgeSvg(t.badge, 44)}${kitChip(t.kit, 36)}<strong>${esc(t.name)}</strong>`,
    });
    if (!sure || !getTeam(t.id)) return;
    if (inLeague) setLeague(null);
    // The career is kept in the Hall of Fame before its team goes.
    if (inCareer && retireCareer()) recordCareer({ hall: getHall().length });
    deleteTeam(t.id);
    renderTeams(root, router);
  }));
}
