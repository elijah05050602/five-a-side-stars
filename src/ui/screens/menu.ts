import { cupInProgress, getCareer, getHall, getLeague, getTeams } from '../../data/storage';
import { careerAge, seasonName } from '../../game/career';
import { STICKERS, getProgress } from '../../data/progress';
import { esc } from '../hud';
import { version } from '../../../package.json';
import { dock, shellBar, wireShell } from '../shell';
import { state } from './shared';
import type { Router } from '../screens';

export function renderMenu(root: HTMLElement, router: Router): void {
  const league = getLeague();
  const career = getCareer();
  const hall = getHall().length;
  const cup = cupInProgress();
  const progress = getProgress();
  const teams = getTeams();
  const hasKeyboard = window.matchMedia('(pointer: fine)').matches;
  root.className = 'screen-root lobby-root';
  root.innerHTML = `
    <div class="lobby-bg" aria-hidden="true"><span class="spark s1">⭐</span><span class="spark s2">✨</span><span class="spark s3">⚡</span><span class="spark s4">⭐</span></div>
    <div class="screen lobby">
      ${shellBar('lobby')}
      <div class="hero">
        <h1 class="title"><span class="title-goal">GOAL</span><span class="title-rush">RUSH!</span></h1>
        <div class="ribbon"><span>★</span> BUILD YOUR SQUAD • RULE THE PITCH <span>★</span></div>
      </div>
      <div class="stage">
        <div class="mascot">
          <div class="mascot-pod"><img src="./art/mascot.jpg" alt="" width="512" height="512" /></div>
          <div class="mascot-chip"><span class="mascot-num">${teams.length}</span><span><strong>${teams.length === 1 ? 'Team ready' : 'Teams ready'}</strong><small>${esc(teams[0]?.name ?? 'Create a team')}</small></span></div>
        </div>
        <div class="portals">
          <button class="launcher" id="m-play">
            <span class="launcher-bolt">⚡</span>
            <span class="launcher-text"><small>Play now</small><strong>QUICK MATCH</strong><span>Against the computer, or a friend on the same keyboard</span></span>
            <span class="launcher-go">KICK OFF ⚽</span>
          </button>
          <div class="portal-grid">
            <button class="portal portal-gold" id="m-cup"><span class="portal-icon">🏆</span><span class="portal-text"><small>Four-team cup</small><strong>TOURNAMENT</strong><span>${cup ? 'Carry on your cup' : 'Two semis and a final'}</span></span></button>
            <button class="portal portal-green" id="m-league"><span class="portal-icon">📋</span><span class="portal-text"><small>${league ? `Tier ${league.tier} · season ${league.season}` : 'Five tiers to climb'}</small><strong>LEAGUE</strong><span>${league ? 'Carry on your season' : 'Start in the Acorn League'}</span></span></button>
            <button class="portal portal-green" id="m-career"><span class="portal-icon">🌱</span><span class="portal-text"><small>${career ? (career.done ? 'Career finished' : `${careerAge(career)} · ${esc(seasonName(career))}`) : 'U5 to U10'}</small><strong>CAREER</strong><span>${career ? 'Carry on growing your team' : 'Grow your players year by year'}</span></span></button>
            <button class="portal portal-sky" id="m-pens"><span class="portal-icon">🥅</span><span class="portal-text"><small>Shoot-out</small><strong>PENALTIES</strong><span>Best of five, then sudden death</span></span></button>
            <button class="portal portal-sky" id="m-train"><span class="portal-icon">🎯</span><span class="portal-text"><small>Skill challenge</small><strong>TRAINING</strong><span>Score as many as you can</span></span></button>
            <button class="portal portal-white" id="m-teams"><span class="portal-icon">👕</span><span class="portal-text"><small>Locker room</small><strong>MY SQUAD</strong><span>Badges, kits and players</span></span></button>
            <button class="portal portal-white" id="m-album"><span class="portal-icon">📒</span><span class="portal-text"><small>Collector · ${progress.stickers.length} / ${STICKERS.length}</small><strong>STICKERS</strong><span class="mini-bar"><i style="width:${Math.round((progress.stickers.length / STICKERS.length) * 100)}%"></i></span></span></button>
            <button class="portal portal-gold" id="m-hall"><span class="portal-icon">🏛️</span><span class="portal-text"><small>${hall ? `${hall} career${hall === 1 ? '' : 's'}` : 'Your careers'}</small><strong>HALL OF FAME</strong><span>Stars, trophies and scrapbooks</span></span></button>
          </div>
        </div>
      </div>
      ${dock(hasKeyboard)}
      <p class="version">Goal Rush! v${version} · works offline once loaded · no accounts, no adverts</p>
    </div>`;
  wireShell(root, router);
  state.onEscape = null;
  root.querySelector('#m-play')!.addEventListener('click', () => router.go({ name: 'setup' }));
  root.querySelector('#m-cup')!.addEventListener('click', () => router.go(cup ? { name: 'tournament' } : { name: 'setup', mode: 'tournament' }));
  root.querySelector('#m-league')!.addEventListener('click', () => router.go(league ? { name: 'league' } : { name: 'setup', mode: 'league' }));
  root.querySelector('#m-career')!.addEventListener('click', () => router.go(career ? { name: 'career' } : { name: 'setup', mode: 'career' }));
  root.querySelector('#m-pens')!.addEventListener('click', () => router.go({ name: 'setup', mode: 'shootout' }));
  root.querySelector('#m-train')!.addEventListener('click', () => router.go({ name: 'setup', mode: 'training' }));
  root.querySelector('#m-teams')!.addEventListener('click', () => router.go({ name: 'teams' }));
  root.querySelector('#m-album')!.addEventListener('click', () => router.go({ name: 'album' }));
  root.querySelector('#m-hall')!.addEventListener('click', () => router.go({ name: 'hall' }));
  root.querySelector('#m-howto')!.addEventListener('click', () => router.startTutorial());
  root.querySelector('[data-club]')?.addEventListener('click', () => router.go({ name: 'club' }));
  // Space kicks off from the lobby (never mid-match: Space is the shoot key there).
  const onKey = (e: KeyboardEvent) => { if (e.code === 'Space' && !(e.target instanceof HTMLButtonElement) && !document.body.classList.contains('in-match')) { e.preventDefault(); router.go({ name: 'setup' }); } };
  window.addEventListener('keydown', onKey);
  state.cleanup = () => window.removeEventListener('keydown', onKey);
}
