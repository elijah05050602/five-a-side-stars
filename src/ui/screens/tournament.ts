import { getTeam, saveTeam, setTournament } from '../../data/storage';
import type { Team } from '../../data/types';
import { recordTrophy } from '../../data/progress';
import { currentFixture, humanStillIn, teamById, type Fixture, type TournamentState } from '../../game/tournament';
import { esc } from '../hud';
import { badgeSvg } from '../kitPreview';
import { logoControls, wireLogoControls } from '../logoUpload';
import { resolveKits } from './setup';
import { topBar, wire, stickerBanner } from './shared';
import type { Router } from '../screens';

function fixtureCard(f: Fixture, label: string, humanId: string): string {
  const side = (t: Team, score: number | null, pens: number | null, won: boolean) => `
    <div class="fx-team ${won ? 'is-winner' : ''} ${t.id === humanId ? 'is-you' : ''}">
      ${badgeSvg(t.badge, 40)}<span class="fx-name">${esc(t.name)}</span>
      ${t.id === humanId ? '' : `<span class="logo-mini">${logoControls(t.badge, t.id, '📷')}</span>`}
      <span class="fx-score">${score === null ? '' : score}${pens !== null ? `<small>(${pens})</small>` : ''}</span>
    </div>`;
  return `<div class="card fixture">
    <span class="fx-label">${label}</span>
    ${side(f.home, f.score?.[0] ?? null, f.pens?.[0] ?? null, f.winnerId === f.home.id)}
    ${side(f.away, f.score?.[1] ?? null, f.pens?.[1] ?? null, f.winnerId === f.away.id)}
  </div>`;
}

export function renderTournament(root: HTMLElement, router: Router, s: TournamentState): void {
  const you = teamById(s, s.humanTeamId)!;
  const champion = s.stage === 'done' ? teamById(s, s.final?.winnerId ?? null) : null;
  const youWon = champion?.id === s.humanTeamId;
  const stillIn = humanStillIn(s);
  const stickers = youWon && !s.trophyRecorded ? recordTrophy() : [];
  if (youWon && !s.trophyRecorded) { s.trophyRecorded = true; setTournament(s); }
  const next = currentFixture(s);
  const nextLabel = s.stage === 'semi' ? '⚽ Play your semi-final' : '⚽ Play the final!';
  root.innerHTML = `
    <div class="screen tournament ${youWon ? 'is-champion' : ''}">
      ${topBar(`${you.ageGroup} Cup`, 'cup')}
      <div class="cup-hero"><div><h2>${s.stage === 'done' ? 'Final whistle!' : s.stage === 'semi' ? 'Semi-finals' : 'The Final'}</h2><p>${s.stage === 'done' ? 'The cup has been lifted. Fancy another go?' : 'Four teams, two semis and a final. Draws go to penalties!'}</p></div></div>
      ${s.stage === 'done' ? `<div class="card trophy-card">
          <div class="trophy">${youWon ? '🏆' : '🥈'}</div>
          <h2>${youWon ? `${esc(you.name)} are the champions!` : stillIn ? 'So close! Runners-up this time.' : `${esc(champion?.name ?? 'Someone')} lifted the cup.`}</h2>
          <p class="muted">${youWon ? 'What a team. The trophy goes in the cabinet!' : 'Shake hands, heads up, and go again next time.'}</p>
          ${stickerBanner(stickers)}
        </div>` : ''}
      <div class="bracket">
        <div class="bracket-col">
          ${fixtureCard(s.semis[0], 'Semi-final 1', s.humanTeamId)}
          ${fixtureCard(s.semis[1], 'Semi-final 2', s.humanTeamId)}
        </div>
        <div class="bracket-col bracket-final">
          ${s.final ? fixtureCard(s.final, 'Final', s.humanTeamId) : '<div class="card fixture fixture-empty"><span class="fx-label">Final</span><p class="muted">Winners of the semi-finals</p></div>'}
        </div>
      </div>
      <div class="row">
        ${next && s.stage !== 'done' ? `<button class="btn btn-primary btn-big" id="c-play">${nextLabel}</button>` : '<button class="btn btn-primary btn-big" id="c-new">🏆 New tournament</button>'}
        <button class="btn btn-ghost btn-big" id="c-menu">Main menu</button>
      </div>
    </div>`;
  wire(root, () => router.go({ name: 'menu' }));
  wireLogoControls(root, (key) => teamById(s, key)?.badge, (key) => { const t = teamById(s, key); if (t && getTeam(t.id)) saveTeam(t); setTournament(s); renderTournament(root, router, s); });
  root.querySelector('#c-play')?.addEventListener('click', () => {
    const f = currentFixture(s)!;
    const [h, a] = resolveKits(f.home, f.away);
    router.startMatch({ home: h, away: a, difficulty: s.difficulty, halfSeconds: s.halfSeconds, twoPlayer: s.twoPlayer && getTeam(f.away.id) !== undefined, mode: 'match', tournament: s });
  });
  root.querySelector('#c-new')?.addEventListener('click', () => router.go({ name: 'setup', homeId: s.humanTeamId, mode: 'tournament' }));
  root.querySelector('#c-menu')?.addEventListener('click', () => router.go({ name: 'menu' }));
}
