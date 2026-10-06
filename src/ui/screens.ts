import { AGE_STATS } from '../data/ageGroups';
import { soundSettings, wireSoundSettings } from './soundSettings';
import { graphicsSettings, wireGraphicsSettings } from './graphicsSettings';
import { applyVolumes } from '../game/audio';
import { BOOT_COLOURS, HAIR_COLOURS, KIT_COLOURS, SKIN_TONES, generateOpponent, makePlayer, makeTeam, randomPlayerName, randomTeamName, shortCode } from '../data/defaults';
import { cupInProgress, deleteTeam, exportSave, getCareer, getLeague, getSettings, getTeam, getTeams, getTournament, hasBackup, importSave, requestPersistentStorage, resetAll, restoreBackup, saveTeam, setCareer, setLeague, setTournament, updateSettings, type MotionChoice } from '../data/storage';
import { AGE_GROUPS, BADGE_ICONS, BADGE_SHAPES, BOOT_STYLES, BOOT_STYLE_LABELS, BUILDS, HAIR_STYLES, HAIR_STYLE_LABELS, KIT_PATTERNS, POSITIONS, POSITION_LABELS, SPECIALS, type AgeGroup, type BadgeShape, type BootStyle, type Build, type Difficulty, type FormationId, type HairStyle, type Kit, type Position, type SkillKey, type Special, type Team } from '../data/types';
import { STAR_BUDGET, STAR_CAP, fitSkills, randomSkills, skillKeys, skillLabel, starsLeft, starsText, totalStars } from '../data/skills';
import { CAREER_AGES, SEASONS_PER_YEAR, SEASON_NAMES, advanceCareer, applyCareerMatch, careerAge, careerSeasonOutcome, careerSeasonOver, createCareer, playerOfTheMatch, seasonName, statRows, type GrowthEvent } from '../game/career';
import { kitsClash } from '../game/kitTexture';
import { FORMATIONS, applyFormation, assignSlots, canPlay, formationById, formationFor, swapPlayers } from '../data/formations';
import { wireDragSwap } from './dragSwap';
import './club.css';
import { CLUB_COLOURS, CLUB_LOGO_URL, CLUB_NAME, CLUB_TEAM_ID, ensureClubTeam, resetClubTeam } from '../data/club';
import { contrastColour } from '../game/playerAtlas';
import type { MatchResult, SimMode } from '../game/MatchScene';
import { WEATHER_CHOICES, type WeatherChoice } from '../game/Weather';
import { STICKERS, getProgress, lockedIcons, recordCareer, recordSeason, recordTrophy, unlockedIcons, type Sticker } from '../data/progress';
import { TIERS, applyLeagueResult, computeTable, createLeague, nextFixture, nextSeason, roundJobs, seasonOutcome, seasonOver, tierInfo, yourPosition } from '../game/league';
import { applyResult, createTournament, cupAheadRequest, currentFixture, humanStillIn, teamById, type Fixture, type TournamentState } from '../game/tournament';
import { inBackground, type CupAhead, type SimOutcome } from '../game/background';
import { esc } from './hud';
import { badgeSvg, kitChip } from './kitPreview';
import { KitPreview3D } from './preview3d';
import { downloadTeamSheet } from './teamSheet';
import { logoControls, wireLogoControls } from './logoUpload';
import { isNameOk } from '../data/wordFilter';
import { music } from '../game/music';
import { applyMotionSetting } from './motion';
import pkg from '../../package.json';
import { dock, pageHead, shellBar, wireShell, type ShellTab } from './shell';
import { controlsSentence, resetControls } from '../data/controls';
import { renderControls } from './controlsScreen';
import { colourName } from './colourNames';

export interface StartOptions {
  home: Team;
  away: Team;
  difficulty: Difficulty;
  halfSeconds: number;
  twoPlayer?: boolean;
  mode?: SimMode;
  tournament?: TournamentState;
  /** League match: the result feeds the saved league table. */
  league?: boolean;
  /** Career match: the result feeds the career and grows the players. */
  career?: boolean;
  cpuLevel?: number;
  /** Weather and time of day for the match; 'random' or missing picks for you. */
  weather?: WeatherChoice;
}

export interface Router {
  go(screen: Screen): void;
  startMatch(o: StartOptions): void;
  /** The guided first-time kick-about. */
  startTutorial(): void;
}

export type SetupMode = Exclude<SimMode, 'tutorial'> | 'tournament' | 'league' | 'career';

export type Screen =
  | { name: 'menu' }
  | { name: 'teams' }
  | { name: 'builder'; teamId?: string }
  | { name: 'setup'; homeId?: string; mode?: SetupMode }
  | { name: 'results'; result: MatchResult; summary: ResultSummary; tournament?: TournamentState; league?: boolean; career?: boolean }
  /** The cup in the save when no state is given. */
  | { name: 'tournament'; state?: TournamentState }
  | { name: 'league' }
  | { name: 'career' }
  | { name: 'album' }
  | { name: 'parents' }
  | { name: 'controls' }
  | { name: 'club' };

let cleanup: (() => void) | null = null;
/** Set by a screen with unsaved changes: returns false to stay put. */
let leaveGuard: (() => boolean) | null = null;

/** Tear down the current screen (its window listeners included). Matches call this before they start. */
export function leaveScreen(): void {
  cleanup?.();
  cleanup = null;
  onEscape = null;
  leaveGuard = null;
}

/** False when the current screen has unsaved changes and the player chose to stay. */
export function canLeaveScreen(): boolean {
  return !leaveGuard || leaveGuard();
}

/** The phone's Back button: do what the screen's own back button does. False when there is nowhere to go back to. */
export function goBack(): boolean {
  if (!onEscape) return false;
  onEscape();
  return true;
}

export function renderScreen(root: HTMLElement, screen: Screen, router: Router): void {
  leaveScreen();
  currentRouter = router;
  root.innerHTML = '';
  root.className = 'screen-root';
  switch (screen.name) {
    case 'menu': return renderMenu(root, router);
    case 'teams': return renderTeams(root, router);
    case 'builder': return renderBuilder(root, router, screen.teamId);
    case 'setup': return renderSetup(root, router, screen.homeId, screen.mode ?? 'match');
    case 'results': return renderResults(root, router, screen.result, screen.summary, screen.tournament, screen.league, screen.career);
    case 'tournament': {
      const state = screen.state ?? getTournament();
      if (!state) return router.go({ name: 'setup', mode: 'tournament' });
      return renderTournament(root, router, state);
    }
    case 'league': return renderLeague(root, router);
    case 'career': return renderCareer(root, router);
    case 'album': return renderAlbum(root, router);
    case 'parents': return renderParents(root, router);
    case 'controls': cleanup = renderControls(root, router, wire); return;
    case 'club': return renderClub(root, router);
  }
}

let currentRouter: Router;
let onEscape: (() => void) | null = null;
window.addEventListener('keydown', (e) => {
  if (e.key !== 'Escape' || !onEscape || document.body.classList.contains('in-match')) return;
  e.preventDefault();
  // Esc in a text box just leaves the box, so a half-typed name is not thrown away with the screen.
  const t = e.target as HTMLElement | null;
  if (t && (t instanceof HTMLInputElement || t instanceof HTMLTextAreaElement || t instanceof HTMLSelectElement || t.isContentEditable)) { t.blur(); return; }
  onEscape();
});

function topBar(title: string, tab: ShellTab = 'none', backLabel = 'Lobby', extra = ''): string {
  return shellBar(tab) + pageHead(title, backLabel, extra);
}

/** aria-pressed for a pill, tile or swatch that shows the current choice. */
const pressed = (on: boolean): string => `aria-pressed="${on}"`;

const BADGE_SHAPE_LABELS: Record<BadgeShape, string> = { shield: 'Shield', circle: 'Circle', diamond: 'Diamond', hex: 'Hexagon' };

/** A selector that finds the same control again after a redraw: its id, or its data attributes. */
function focusKey(el: Element | null): string | null {
  if (!(el instanceof HTMLElement || el instanceof SVGElement) || !el.closest('#ui')) return null;
  if (el.id) return `#${CSS.escape(el.id)}`;
  const attrs = [...el.attributes].filter((a) => a.name.startsWith('data-')).map((a) => `[${a.name}="${CSS.escape(a.value)}"]`).join('');
  return attrs ? `${el.tagName.toLowerCase()}${attrs}` : null;
}

/** Put keyboard focus back on the control the player was using before a redraw. */
function restoreFocus(root: HTMLElement, key: string | null): void {
  if (!key) return;
  root.querySelector<HTMLElement | SVGElement>(key)?.focus({ preventScroll: true });
}

function wire(root: HTMLElement, back: () => void): void {
  // The heading's back pill and any "Done" button at the bottom do the same thing.
  root.querySelectorAll('[data-back]').forEach((b) => b.addEventListener('click', back));
  wireShell(root, currentRouter);
  onEscape = back;
}

// ---------- Main menu ----------

function renderMenu(root: HTMLElement, router: Router): void {
  const league = getLeague();
  const career = getCareer();
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
          </div>
        </div>
      </div>
      ${hasKeyboard ? dock() : '<footer class="dock dock-touch"><button class="dock-chip dock-link" id="m-howto">🎓 How to play</button><button class="dock-chip dock-link" data-nav="controls">🎮 Controls</button><button class="dock-chip dock-link dock-club" data-club>🦊 Davao Strikers</button><button class="dock-chip dock-parents" data-nav="parents">🛡️ Parents Zone 🔒</button></footer>'}
      <p class="version">Goal Rush! v${pkg.version} · works offline once loaded · no accounts, no adverts</p>
    </div>`;
  wireShell(root, router);
  onEscape = null;
  root.querySelector('#m-play')!.addEventListener('click', () => router.go({ name: 'setup' }));
  root.querySelector('#m-cup')!.addEventListener('click', () => router.go(cup ? { name: 'tournament' } : { name: 'setup', mode: 'tournament' }));
  root.querySelector('#m-league')!.addEventListener('click', () => router.go(league ? { name: 'league' } : { name: 'setup', mode: 'league' }));
  root.querySelector('#m-career')!.addEventListener('click', () => router.go(career ? { name: 'career' } : { name: 'setup', mode: 'career' }));
  root.querySelector('#m-pens')!.addEventListener('click', () => router.go({ name: 'setup', mode: 'shootout' }));
  root.querySelector('#m-train')!.addEventListener('click', () => router.go({ name: 'setup', mode: 'training' }));
  root.querySelector('#m-teams')!.addEventListener('click', () => router.go({ name: 'teams' }));
  root.querySelector('#m-album')!.addEventListener('click', () => router.go({ name: 'album' }));
  root.querySelector('#m-howto')!.addEventListener('click', () => router.startTutorial());
  root.querySelector('[data-club]')?.addEventListener('click', () => router.go({ name: 'club' }));
  // Space kicks off from the lobby (never mid-match: Space is the shoot key there).
  const onKey = (e: KeyboardEvent) => { if (e.code === 'Space' && !(e.target instanceof HTMLButtonElement) && !document.body.classList.contains('in-match')) { e.preventDefault(); router.go({ name: 'setup' }); } };
  window.addEventListener('keydown', onKey);
  cleanup = () => window.removeEventListener('keydown', onKey);
}

// ---------- Davao Strikers FC ----------

/** The club page: play as Davao Strikers FC U7 in any mode. The team is an ordinary saved team, so all of it stays editable. */
function renderClub(root: HTMLElement, router: Router): void {
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
  root.querySelector('#c-reset')!.addEventListener('click', () => {
    if (!confirm(`Put ${CLUB_NAME}'s squad, kits and badge back the way the club made them? Your changes to this team will be lost.`)) return;
    resetClubTeam();
    renderClub(root, router);
  });
}

// ---------- Teams list ----------

function renderTeams(root: HTMLElement, router: Router): void {
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
  root.querySelectorAll<HTMLElement>('[data-delete]').forEach((b) => b.addEventListener('click', () => {
    const t = getTeam(b.dataset.delete!);
    if (!t) return;
    const inLeague = getLeague()?.teamId === t.id;
    const inCareer = getCareer()?.teamId === t.id;
    const extra = inLeague ? ' Your league with this team will end too.' : inCareer ? ' Your career with this team will end too.' : '';
    if (!confirm(`Delete ${t.name}? This cannot be undone.${extra}`)) return;
    if (inLeague) setLeague(null);
    if (inCareer) setCareer(null);
    deleteTeam(t.id);
    renderTeams(root, router);
  }));
}

// ---------- Team builder ----------

function renderBuilder(root: HTMLElement, router: Router, teamId?: string): void {
  const existing = teamId ? getTeam(teamId) : undefined;
  const team: Team = existing ? structuredClone(existing) : makeTeam({ name: randomTeamName(), ageGroup: 'U8' });
  for (const p of team.players) p.skills = fitSkills(p, team.ageGroup, !team.career);
  // Leaving with unsaved changes asks first (the back pill, Esc, the phone's Back button and the top tabs all come here).
  const saved = JSON.stringify(team);
  leaveGuard = () => JSON.stringify(team) === saved || confirm('Leave without saving? Your changes to this team will be lost.');
  // A career team grows up one age group a year, and a league team plays in its league's age group.
  const ageLock = team.career ? 'Career teams move up an age group by themselves at the end of each year.'
    : existing && getLeague()?.teamId === team.id ? 'This team is playing in a league. Leave the league to change its age group.' : '';
  let step: 0 | 1 | 2 = 0;
  let kitTab: 'kit' | 'awayKit' | 'keeperKit' = 'kit';
  /** Which outfield kit the squad step's preview wears. */
  let squadKit: 'kit' | 'awayKit' = 'kit';
  let selectedPlayer = 0;
  /** A player tapped on the little pitch, waiting for a second tap to swap with. */
  let picked: string | null = null;
  let preview: KitPreview3D | null = null;

  const render = () => {
    const focused = focusKey(document.activeElement);
    preview?.dispose();
    preview = null;
    const stats = AGE_STATS[team.ageGroup];
    root.innerHTML = `
      <div class="screen builder">
        ${topBar(existing ? 'Edit Team' : 'Create Team', 'squad', 'Squad')}
        <nav class="steps">
          ${['Club Badge', 'Kits & Boots', 'Squad Lineup'].map((s, i) => `<button class="step ${i === step ? 'is-active' : ''} ${i < step ? 'is-done' : ''}" data-step="${i}"><span class="step-num">${i < step ? '✓' : i + 1}</span>${s}</button>`).join('')}
        </nav>
        <div class="builder-body">
          <div class="builder-form" id="form"></div>
          <div class="builder-preview card">
            <canvas id="preview" class="preview-canvas"></canvas>
            ${kitStrip()}
            <div class="preview-caption">
              <div id="preview-badge">${badgeSvg(team.badge, 64)}</div>
              <strong>${esc(team.name)}</strong>
              <span class="chip chip-age">${team.ageGroup}</span>
              <p class="muted">${esc(stats.blurb)}</p>
            </div>
          </div>
        </div>
        <footer class="builder-footer">
          ${step > 0 ? '<button class="btn btn-ghost" id="b-prev">Back</button>' : '<span></span>'}
          <span class="row">
            ${step === 2 ? '<button class="btn btn-ghost" id="b-sheet" title="Download a team sheet to print">🖨️ Team sheet</button>' : ''}
            ${step < 2 ? '<button class="btn btn-primary" id="b-next">Next step →</button>' : '<button class="btn btn-primary" id="b-save">Save squad lineup ⚽</button>'}
          </span>
        </footer>
      </div>`;
    wire(root, () => router.go({ name: 'teams' }));
    root.querySelectorAll<HTMLElement>('[data-step]').forEach((b) => b.addEventListener('click', () => { step = Number(b.dataset.step) as 0 | 1 | 2; render(); }));
    root.querySelector('#b-prev')?.addEventListener('click', () => { step = (step - 1) as 0 | 1 | 2; render(); });
    root.querySelector('#b-next')?.addEventListener('click', () => { if (validate()) { step = (step + 1) as 0 | 1 | 2; render(); } });
    root.querySelector('#b-sheet')?.addEventListener('click', async (e) => {
      if (!validate()) return;
      const btn = e.currentTarget as HTMLButtonElement;
      btn.disabled = true; btn.textContent = 'Drawing…';
      try { await downloadTeamSheet({ ...team, short: shortCode(team.name) }); } catch { alert('Sorry, the team sheet could not be made on this device.'); }
      btn.disabled = false; btn.textContent = '🖨️ Team sheet';
    });
    root.querySelector('#b-save')?.addEventListener('click', () => {
      if (!validate()) return;
      team.short = shortCode(team.name);
      saveTeam(team);
      leaveGuard = null;
      router.go({ name: 'teams' });
    });
    const form = root.querySelector<HTMLElement>('#form')!;
    if (step === 0) renderBadgeStep(form);
    else if (step === 1) renderKits(form);
    else renderSquad(form);
    const canvas = root.querySelector<HTMLCanvasElement>('#preview')!;
    const shownPlayer = step === 2 ? team.players[Math.min(selectedPlayer, team.players.length - 1)] : team.players.find((p) => p.position !== 'GK')!;
    preview = new KitPreview3D(canvas, shownPlayer, shownKitFor(shownPlayer), stats.scale);
    wireKitStrip();
    restoreFocus(root, focused);
  };

  /** The kit the preview wears: the one being edited on the kits step, otherwise the player's own. */
  const shownKitFor = (pl: Team['players'][number]): Kit => step === 1 ? team[kitTab] : pl.position === 'GK' ? team.keeperKit : team[squadKit];
  const kitSlot = (): 'kit' | 'awayKit' | 'keeperKit' => {
    if (step === 1) return kitTab;
    const pl = team.players[Math.min(selectedPlayer, team.players.length - 1)];
    return step === 2 && pl.position === 'GK' ? 'keeperKit' : squadKit;
  };

  /** All three kits side by side under the preview; tap one to see it on the player. */
  const kitStrip = (): string => {
    const on = kitSlot();
    const kits: ['kit' | 'awayKit' | 'keeperKit', string][] = [['kit', 'Home'], ['awayKit', 'Away'], ['keeperKit', 'Keeper']];
    return `<div class="kit-strip" role="group" aria-label="Kits">${kits.map(([k, label]) => `<button class="kit-strip-btn ${on === k ? 'is-active' : ''}" data-kitshow="${k}" title="${label} kit">${kitChip(team[k], 40)}<small>${label}</small></button>`).join('')}</div>`;
  };
  const wireKitStrip = () => {
    root.querySelectorAll<HTMLElement>('[data-kitshow]').forEach((b) => b.addEventListener('click', () => {
      const k = b.dataset.kitshow as 'kit' | 'awayKit' | 'keeperKit';
      if (step === 1) { kitTab = k; render(); return; }
      if (k === 'keeperKit') {
        // Show the keeper kit on the keeper.
        const gk = team.players.findIndex((x) => x.position === 'GK');
        if (gk >= 0) { selectedPlayer = gk; step = 2; render(); }
        return;
      }
      squadKit = k;
      const pl = team.players[Math.min(selectedPlayer, team.players.length - 1)];
      if (step === 2 && pl.position === 'GK') selectedPlayer = Math.max(0, team.players.findIndex((x) => x.position !== 'GK'));
      render();
    }));
  };
  const refreshKitStrip = () => {
    const el = root.querySelector('.kit-strip');
    if (el) { el.outerHTML = kitStrip(); wireKitStrip(); }
  };

  const validate = (): boolean => {
    team.name = team.name.trim() || randomTeamName();
    if (!isNameOk(team.name)) { alert("Let's pick a different team name, that one is not allowed."); step = 0; render(); return false; }
    const rude = team.players.find((p) => !isNameOk(p.name));
    if (rude) { alert(`Let's pick a different name for player #${rude.number}, that one is not allowed.`); step = 2; render(); return false; }
    const starters = team.players.filter((p) => p.starter);
    if (starters.length !== 5) { alert(`Pick exactly 5 starters (you have ${starters.length}). The rest are subs.`); step = 2; render(); return false; }
    if (!starters.some((p) => p.position === 'GK')) { alert('One of your starters must be the keeper.'); step = 2; render(); return false; }
    if (!team.career) {
      const greedy = team.players.find((p) => starsLeft(p.skills, team.ageGroup, p.position) < 0);
      if (greedy) { alert(`${greedy.name} has ${-starsLeft(greedy.skills, team.ageGroup, greedy.position)} too many stars for the ${AGE_STATS[team.ageGroup].label}. Take some off.`); step = 2; render(); return false; }
    }
    const nums = new Set<number>();
    for (const p of team.players) {
      p.name = p.name.trim() || randomPlayerName();
      if (nums.has(p.number)) { alert(`Two players have number ${p.number}. Give each player their own number.`); step = 2; render(); return false; }
      nums.add(p.number);
    }
    return true;
  };

  const renderBadgeStep = (form: HTMLElement) => {
    const focused = focusKey(document.activeElement);
    form.innerHTML = `
      <label class="field"><span>Team name</span>
        <div class="row"><input id="f-name" maxlength="24" value="${esc(team.name)}" /><button class="btn btn-blue btn-icon" id="f-dice" title="Random name" aria-label="Random team name">🎲</button></div>
      </label>
      <div class="field"><span>Age group</span>
        <div class="pills">${AGE_GROUPS.map((a) => `<button class="pill ${a === team.ageGroup ? 'is-active' : ''}" data-age="${a}" ${pressed(a === team.ageGroup)} ${ageLock ? 'disabled' : ''}>${a}</button>`).join('')}</div>
        <p class="muted" id="f-age-blurb">${esc(AGE_STATS[team.ageGroup].label)}: ${esc(AGE_STATS[team.ageGroup].blurb)}</p>
        ${ageLock ? `<p class="muted small">🔒 ${esc(ageLock)}</p>` : ''}
      </div>
      <div class="field"><span>Club badge</span>
        <div class="badge-row">
          <div class="pills">${BADGE_SHAPES.map((sh) => `<button class="pill pill-badge ${team.badge.shape === sh ? 'is-active' : ''}" data-shape="${sh}" aria-label="${BADGE_SHAPE_LABELS[sh]} badge" ${pressed(team.badge.shape === sh)}>${badgeSvg({ ...team.badge, shape: sh }, 36)}</button>`).join('')}</div>
        </div>
        <div class="row logo-row">${logoControls(team.badge)}<span class="muted small">${team.badge.image ? 'Your logo fills the badge shape.' : 'Got a real club logo? Upload a picture and it fills the badge. It stays on this device.'}</span></div>
        ${team.badge.image ? '' : `<div class="icon-grid">${[...BADGE_ICONS, ...unlockedIcons()].map((ic) => `<button class="icon-tile ${team.badge.icon === ic ? 'is-active' : ''}" data-icon="${ic}" ${pressed(team.badge.icon === ic)}>${ic}</button>`).join('')}${lockedIcons().map((l) => `<button class="icon-tile is-locked" disabled title="Unlock with the ${esc(l.sticker.name)} sticker: ${esc(l.sticker.how)}">${l.icon}<small>🔒</small></button>`).join('')}</div>
        <p class="muted small">🔒 icons unlock when you earn stickers.</p>
        <div class="row">
          <div class="field"><span>Badge colour 1</span><div class="swatches">${KIT_COLOURS.map((c) => `<button class="swatch ${team.badge.colour1 === c ? 'is-active' : ''}" style="background:${c}" data-badge="colour1" data-colour="${c}" aria-label="Badge colour 1: ${colourName(c)}" ${pressed(team.badge.colour1 === c)}></button>`).join('')}</div></div>
        </div>
        <div class="row">
          <div class="field"><span>Badge colour 2</span><div class="swatches">${KIT_COLOURS.map((c) => `<button class="swatch ${team.badge.colour2 === c ? 'is-active' : ''}" style="background:${c}" data-badge="colour2" data-colour="${c}" aria-label="Badge colour 2: ${colourName(c)}" ${pressed(team.badge.colour2 === c)}></button>`).join('')}</div></div>
        </div>`}
      </div>`;
    wireLogoControls(form, () => team.badge, () => { renderBadgeStep(form); const el = root.querySelector('#preview-badge'); if (el) el.innerHTML = badgeSvg(team.badge, 64); });
    // Redraw in place; focus stays on the tapped control (no jumping to the name box, which would pop up a phone keyboard).
    const refreshBadge = () => { renderBadgeStep(form); const el = root.querySelector('#preview-badge'); if (el) el.innerHTML = badgeSvg(team.badge, 64); };
    form.querySelectorAll<HTMLElement>('[data-shape]').forEach((b) => b.addEventListener('click', () => { team.badge.shape = b.dataset.shape as BadgeShape; refreshBadge(); }));
    form.querySelectorAll<HTMLElement>('[data-icon]').forEach((b) => b.addEventListener('click', () => { team.badge.icon = b.dataset.icon!; refreshBadge(); }));
    form.querySelectorAll<HTMLElement>('[data-badge]').forEach((b) => b.addEventListener('click', () => { team.badge[b.dataset.badge as 'colour1' | 'colour2'] = b.dataset.colour!; refreshBadge(); }));
    const name = form.querySelector<HTMLInputElement>('#f-name')!;
    name.addEventListener('input', () => { team.name = name.value; updateCaption(); });
    form.querySelector('#f-dice')!.addEventListener('click', () => { team.name = randomTeamName(); name.value = team.name; updateCaption(); });
    form.querySelectorAll<HTMLElement>('[data-age]').forEach((b) => b.addEventListener('click', () => {
      if (ageLock) return;
      team.ageGroup = b.dataset.age as AgeGroup;
      // Stars follow the age group: nothing above its cap, nothing over its budget.
      for (const p of team.players) p.skills = fitSkills(p, team.ageGroup, !team.career);
      render();
    }));
    restoreFocus(form, focused);
  };

  const updateCaption = () => {
    const cap = root.querySelector('.preview-caption strong');
    if (cap) cap.textContent = team.name || 'Your team';
  };

  const renderKits = (form: HTMLElement) => {
    const focused = focusKey(document.activeElement);
    const kit = team[kitTab];
    const swatches = (key: keyof Kit, label: string) => `
      <div class="field"><span>${label}</span>
        <div class="swatches">${KIT_COLOURS.map((c) => `<button class="swatch ${kit[key] === c ? 'is-active' : ''}" style="background:${c}" data-key="${key}" data-colour="${c}" aria-label="${esc(label)}: ${colourName(c)}" ${pressed(kit[key] === c)}></button>`).join('')}</div>
      </div>`;
    const clashGk = kitTab !== 'awayKit' && kitsClash(team.kit, team.keeperKit);
    const clashAway = kitTab !== 'keeperKit' && kitsClash(team.kit, team.awayKit);
    // With both shirt colours the same a pattern is invisible, so the tiles borrow a contrasting colour to show what each one looks like.
    const tileKit = (p: Kit['pattern']): Kit => ({ ...kit, pattern: p, shirt2: kit.shirt2 === kit.shirt ? contrastColour(kit.shirt) : kit.shirt2 });
    form.innerHTML = `
      <div class="tabs">
        <button class="tab ${kitTab === 'kit' ? 'is-active' : ''}" data-tab="kit" ${pressed(kitTab === 'kit')}>Home kit</button>
        <button class="tab ${kitTab === 'awayKit' ? 'is-active' : ''}" data-tab="awayKit" ${pressed(kitTab === 'awayKit')}>Away kit</button>
        <button class="tab ${kitTab === 'keeperKit' ? 'is-active' : ''}" data-tab="keeperKit" ${pressed(kitTab === 'keeperKit')}>Keeper kit</button>
      </div>
      <div class="field"><span>Pattern</span>
        <div class="patterns">${KIT_PATTERNS.map((p) => `<button class="pattern-tile ${kit.pattern === p ? 'is-active' : ''}" data-pattern="${p}" ${pressed(kit.pattern === p)}>${kitChip(tileKit(p), 44)}<small>${p}</small></button>`).join('')}</div>
      </div>
      ${swatches('shirt', 'Shirt')}
      ${swatches('shirt2', kit.pattern === 'plain' ? 'Second colour (collar and cuffs)' : 'Second colour (collar and pattern)')}
      ${swatches('shorts', 'Shorts')}
      ${swatches('socks', 'Socks')}
      ${clashGk ? '<p class="warn">⚠️ The keeper kit looks a lot like the home kit. Pick a different shirt colour so the keeper stands out.</p>' : ''}
      ${clashAway ? '<p class="warn">⚠️ The away kit looks a lot like the home kit. The away kit is used when two teams clash, so make it different.</p>' : ''}`;
    form.querySelectorAll<HTMLElement>('[data-tab]').forEach((b) => b.addEventListener('click', () => { kitTab = b.dataset.tab as 'kit' | 'awayKit' | 'keeperKit'; render(); }));
    form.querySelectorAll<HTMLElement>('[data-pattern]').forEach((b) => b.addEventListener('click', () => {
      kit.pattern = b.dataset.pattern as Kit['pattern'];
      // A pattern needs a second colour to show up.
      if (kit.pattern !== 'plain' && kit.shirt2 === kit.shirt) kit.shirt2 = contrastColour(kit.shirt) === '#ffffff' ? '#ffffff' : '#1b2a41';
      refreshKit(form);
    }));
    form.querySelectorAll<HTMLElement>('[data-colour]').forEach((b) => b.addEventListener('click', () => { (kit as unknown as Record<string, string>)[b.dataset.key!] = b.dataset.colour!; refreshKit(form); }));
    restoreFocus(form, focused);
  };

  const refreshKit = (form: HTMLElement) => {
    const kit = team[kitTab];
    const num = team.players.find((p) => (kitTab === 'keeperKit' ? p.position === 'GK' : p.position !== 'GK'))?.number ?? 7;
    preview?.setKit(kit, num);
    // Re-render just the form so the active states update without rebuilding the 3D view.
    renderKits(form);
    refreshKitStrip();
  };

  const renderSquad = (form: HTMLElement) => {
    const focused = focusKey(document.activeElement);
    selectedPlayer = Math.min(selectedPlayer, team.players.length - 1);
    const p = team.players[selectedPlayer];
    const taken = new Set(team.players.filter((x) => x !== p).map((x) => x.number));
    const starters = team.players.filter((x) => x.starter).length;
    form.innerHTML = `
      ${formationField()}
      <p class="muted">Squad of ${team.players.length} (5 to 8). Starters: ${starters} of 5. Tap a player to edit them, or drag one onto another to swap them.</p>
      <div class="squad-row squad-row-${team.players.length > 5 ? 'wide' : 'five'}">
        ${team.players.map((pl, i) => `
          <button class="player-card ${i === selectedPlayer ? 'is-active' : ''} ${pl.starter ? '' : 'is-sub'} ${picked === pl.id ? 'is-picked' : ''}" data-player="${i}" data-swap="${pl.id}" data-swap-label="${pl.number} ${esc(pl.name)}" ${pressed(i === selectedPlayer)}>
            ${kitChip(pl.position === 'GK' ? team.keeperKit : team[squadKit], 40)}
            <span class="pc-number">${pl.number}</span>
            <span class="pc-name">${esc(pl.name)}</span>
            <span class="chip chip-pos chip-${pl.position.toLowerCase()}">${POSITION_LABELS[pl.position]}</span>
            ${alsoText(pl)}
            <span class="pc-stars">★ ${totalStars(pl.skills, pl.position)}</span>
            ${pl.starter ? '' : '<span class="chip chip-sub">Sub</span>'}
          </button>`).join('')}
        ${team.players.length < 8 ? '<button class="player-card player-card-add" id="p-add"><span class="plus">+</span><span>Add player</span></button>' : ''}
      </div>
      <div class="card player-edit">
        <div class="row space-between">
          <label class="toggle"><input type="checkbox" id="p-starter" ${p.starter ? 'checked' : ''}/> Starts the match</label>
          ${team.players.length > 5 ? '<button class="btn btn-ghost" id="p-remove">Remove player</button>' : ''}
        </div>
        <label class="field"><span>Name</span><div class="row"><input id="p-name" maxlength="14" value="${esc(p.name)}" /><button class="btn btn-blue btn-icon" id="p-dice" title="Random name" aria-label="Random player name">🎲</button></div></label>
        <div class="field"><span>Shirt number</span>
          <div class="row"><button class="btn btn-ghost btn-icon" id="p-num-down" aria-label="Lower shirt number">−</button><input id="p-num" type="number" min="1" max="99" value="${p.number}" aria-label="Shirt number" /><button class="btn btn-ghost btn-icon" id="p-num-up" aria-label="Higher shirt number">+</button></div>
          <p class="muted">Taken: ${[...taken].sort((a, b) => a - b).join(', ')}</p>
        </div>
        <div class="field"><span>Position</span>
          <div class="pills">${POSITIONS.map((pos) => `<button class="pill ${p.position === pos ? 'is-active' : ''}" data-pos="${pos}" ${pressed(p.position === pos)}>${POSITION_LABELS[pos]}</button>`).join('')}</div>
        </div>
        <div class="field"><span>Can also play <small class="muted">tap every position that suits ${esc(p.name || 'them')}</small></span>
          <div class="pills">${POSITIONS.filter((pos) => pos !== 'GK' && pos !== p.position).map((pos) => `<button class="pill pill-also ${canPlay(p).includes(pos) ? 'is-active' : ''}" data-also="${pos}" aria-pressed="${canPlay(p).includes(pos)}">${canPlay(p).includes(pos) ? '✓ ' : '+ '}${POSITION_LABELS[pos]}</button>`).join('')}</div>
        </div>
        ${skillsField(p, team)}
        <div class="field"><span>Special</span>
          <div class="pills">${SPECIALS.map((sp) => `<button class="pill ${p.special === sp.id ? 'is-active' : ''}" data-special="${sp.id}" title="${esc(sp.blurb)}" ${pressed(p.special === sp.id)}>${sp.label}</button>`).join('')}</div>
        </div>
        <div class="field"><span>Skin</span><div class="swatches">${SKIN_TONES.map((c) => `<button class="swatch round ${p.skin === c ? 'is-active' : ''}" style="background:${c}" data-skin="${c}" aria-label="Skin: ${colourName(c)}" ${pressed(p.skin === c)}></button>`).join('')}</div></div>
        <div class="field"><span>Hair style</span><div class="pills">${HAIR_STYLES.map((h) => `<button class="pill ${p.hairStyle === h ? 'is-active' : ''}" data-hairstyle="${h}" ${pressed(p.hairStyle === h)}>${HAIR_STYLE_LABELS[h]}</button>`).join('')}</div></div>
        <div class="field"><span>Build</span><div class="pills">${BUILDS.map((b) => `<button class="pill ${(p.build ?? 'regular') === b ? 'is-active' : ''}" data-build="${b}" ${pressed((p.build ?? 'regular') === b)}>${b[0].toUpperCase() + b.slice(1)}</button>`).join('')}</div></div>
        <div class="field"><span>Hair colour</span><div class="swatches">${HAIR_COLOURS.map((c) => `<button class="swatch round ${p.hair === c ? 'is-active' : ''}" style="background:${c}" data-hair="${c}" aria-label="Hair: ${colourName(c)}" ${pressed(p.hair === c)}></button>`).join('')}</div></div>
        <div class="field"><span>Boots</span><div class="swatches">${BOOT_COLOURS.map((c) => `<button class="swatch ${p.boots === c ? 'is-active' : ''}" style="background:${c}" data-boots="${c}" aria-label="Boots: ${colourName(c)}" ${pressed(p.boots === c)}></button>`).join('')}</div>
          <div class="pills">${BOOT_STYLES.map((b) => `<button class="pill ${(p.bootStyle ?? 'classic') === b ? 'is-active' : ''}" data-bootstyle="${b}" ${pressed((p.bootStyle ?? 'classic') === b)}>${BOOT_STYLE_LABELS[b]}</button>`).join('')}</div></div>
      </div>`;
    form.querySelector('#p-add')?.addEventListener('click', () => {
      const used = new Set(team.players.map((x) => x.number));
      let n = 2; while (used.has(n)) n++;
      team.players.push(makePlayer(team.players.length % 2 ? 'DEF' : 'ATT', n, randomPlayerName(), false, team.ageGroup));
      selectedPlayer = team.players.length - 1;
      render();
    });
    form.querySelector('#p-remove')?.addEventListener('click', () => {
      team.players.splice(selectedPlayer, 1);
      selectedPlayer = Math.max(0, selectedPlayer - 1);
      render();
    });
    form.querySelector<HTMLInputElement>('#p-starter')!.addEventListener('change', (e) => { p.starter = (e.target as HTMLInputElement).checked; renderSquad(form); });
    form.querySelectorAll<HTMLElement>('[data-special]').forEach((b) => b.addEventListener('click', () => { p.special = b.dataset.special as Special; renderSquad(form); }));
    form.querySelectorAll<HTMLElement>('[data-star-up]').forEach((b) => b.addEventListener('click', () => {
      const k = b.dataset.starUp as SkillKey;
      if (p.skills[k] < STAR_CAP[team.ageGroup] && starsLeft(p.skills, team.ageGroup, p.position) > 0) p.skills[k]++;
      renderSquad(form);
    }));
    form.querySelectorAll<HTMLElement>('[data-star-down]').forEach((b) => b.addEventListener('click', () => {
      const k = b.dataset.starDown as SkillKey;
      if (p.skills[k] > 1) p.skills[k]--;
      renderSquad(form);
    }));
    form.querySelector('#p-spread')?.addEventListener('click', () => { p.skills = randomSkills(p.position, team.ageGroup); renderSquad(form); });
    form.querySelectorAll<HTMLElement>('[data-hairstyle]').forEach((b) => b.addEventListener('click', () => { p.hairStyle = b.dataset.hairstyle as HairStyle; preview?.setLook(p.skin, p.hair, p.hairStyle, p.boots); renderSquad(form); }));
    form.querySelectorAll<HTMLElement>('[data-boots]').forEach((b) => b.addEventListener('click', () => { p.boots = b.dataset.boots!; preview?.setLook(p.skin, p.hair, p.hairStyle, p.boots); renderSquad(form); }));
    form.querySelectorAll<HTMLElement>('[data-bootstyle]').forEach((b) => b.addEventListener('click', () => { p.bootStyle = b.dataset.bootstyle as BootStyle; preview?.setLook(p.skin, p.hair, p.hairStyle, p.boots, p.bootStyle); renderSquad(form); }));
    form.querySelectorAll<HTMLElement>('[data-build]').forEach((b) => b.addEventListener('click', () => { p.build = b.dataset.build as Build; preview?.setBuild(p.build); renderSquad(form); }));
    form.querySelectorAll<HTMLElement>('[data-player]').forEach((b) => b.addEventListener('click', () => {
      // With someone picked on the pitch, tapping a card swaps them; otherwise it opens that player.
      if (picked && picked !== b.dataset.swap) { swapById(picked, b.dataset.swap!); return; }
      picked = null;
      selectedPlayer = Number(b.dataset.player);
      render();
    }));
    form.querySelectorAll<SVGGElement>('[data-pick]').forEach((g) => {
      const pick = () => {
        const id = g.dataset.pick!;
        if (picked && picked !== id) { swapById(picked, id); return; }
        picked = picked === id ? null : id;
        const i = team.players.findIndex((x) => x.id === id);
        if (i >= 0) selectedPlayer = i;
        render();
      };
      g.addEventListener('click', pick);
      // The dots are focusable buttons, so Enter and Space pick them too.
      g.addEventListener('keydown', (e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); pick(); } });
    });
    const nameEl = form.querySelector<HTMLInputElement>('#p-name')!;
    nameEl.addEventListener('input', () => { p.name = nameEl.value; form.querySelectorAll('.pc-name')[selectedPlayer].textContent = p.name; });
    form.querySelector('#p-dice')!.addEventListener('click', () => { p.name = randomPlayerName(); nameEl.value = p.name; form.querySelectorAll('.pc-name')[selectedPlayer].textContent = p.name; });
    const numEl = form.querySelector<HTMLInputElement>('#p-num')!;
    const setNum = (n: number, writeBack = true) => {
      n = Math.max(1, Math.min(99, Math.round(n) || 1));
      p.number = n;
      if (writeBack) numEl.value = String(n);
      form.querySelectorAll('.pc-number')[selectedPlayer].textContent = String(n);
      numEl.classList.toggle('is-invalid', taken.has(n));
      preview?.setKit(shownKitFor(p), n);
    };
    // Follow the typing, but only tidy the box up once it is done, so it can be cleared to type a new number.
    numEl.addEventListener('input', () => { if (numEl.value.trim() !== '') setNum(Number(numEl.value), false); });
    numEl.addEventListener('change', () => setNum(Number(numEl.value)));
    form.querySelector('#p-num-down')!.addEventListener('click', () => setNum(p.number - 1));
    form.querySelector('#p-num-up')!.addEventListener('click', () => setNum(p.number + 1));
    form.querySelectorAll<HTMLElement>('[data-also]').forEach((b) => b.addEventListener('click', () => {
      const pos = b.dataset.also as Position;
      const now = canPlay(p);
      const next = now.includes(pos) ? now.filter((x) => x !== pos) : [...now, pos];
      p.positions = next.length ? next : [p.position];
      renderSquad(form);
    }));
    form.querySelectorAll<HTMLElement>('[data-pos]').forEach((b) => b.addEventListener('click', () => {
      const pos = b.dataset.pos as Position;
      // Their main position changes; the others they can play stay ticked.
      const also = canPlay(p).filter((x) => x !== p.position && x !== pos);
      p.positions = [pos, ...also];
      if (pos === 'GK') {
        // Only one keeper: the old keeper swaps into this player's old position.
        const oldGk = team.players.find((x) => x.position === 'GK' && x !== p);
        if (oldGk) oldGk.position = p.position === 'GK' ? 'DEF' : p.position;
      } else if (p.position === 'GK') {
        // Keep a keeper on the team: make the first other player the keeper.
        const other = team.players.find((x) => x !== p)!;
        other.position = 'GK';
      }
      p.position = pos;
      // If the starters now fit a formation, switch to it so the pitch matches what they picked.
      const fits = formationFor(team);
      if (fits) team.formation = fits;
      // A new position rates different things: keep everyone inside the budget for theirs.
      for (const x of team.players) x.skills = fitSkills(x, team.ageGroup, !team.career);
      render();
    }));
    form.querySelectorAll<HTMLElement>('[data-formation]').forEach((b) => b.addEventListener('click', () => {
      applyFormation(team, b.dataset.formation as FormationId);
      for (const x of team.players) x.skills = fitSkills(x, team.ageGroup, !team.career);
      render();
    }));
    form.querySelectorAll<HTMLElement>('[data-skin]').forEach((b) => b.addEventListener('click', () => { p.skin = b.dataset.skin!; preview?.setLook(p.skin, p.hair); renderSquad(form); }));
    form.querySelectorAll<HTMLElement>('[data-hair]').forEach((b) => b.addEventListener('click', () => { p.hair = b.dataset.hair!; preview?.setLook(p.skin, p.hair); renderSquad(form); }));
    restoreFocus(form, focused);
  };

  /** Swap two players by id (dragged or tapped on the line-up), keeping the open player open. */
  const swapById = (fromId: string, toId: string) => {
    const a = team.players.find((x) => x.id === fromId);
    const b = team.players.find((x) => x.id === toId);
    picked = null;
    if (!a || !b) { render(); return; }
    const open = team.players[selectedPlayer];
    swapPlayers(team, a, b);
    selectedPlayer = Math.max(0, team.players.indexOf(open));
    // Someone who swapped into or out of goal rates different things: keep the stars inside the budget.
    for (const x of team.players) x.skills = fitSkills(x, team.ageGroup, !team.career);
    render();
  };

  /** Formation picker with a little pitch showing who stands where. Drag (or tap two) players to swap them. */
  const formationField = (): string => {
    const f = formationById(team.formation);
    const five = team.players.filter((x) => x.starter);
    const subs = team.players.filter((x) => !x.starter);
    const slots = assignSlots(five.filter((x) => x.position !== 'GK'), f);
    const gk = five.find((x) => x.position === 'GK');
    const pickedPlayer = team.players.find((x) => x.id === picked);
    // The pitch is drawn sideways: our goal on the left, attacking to the right.
    const dot = (px: number, py: number, pl: Team['players'][number], cls: string, title: string) =>
      `<g class="fm-dot ${cls} ${picked === pl.id ? 'is-picked' : ''}" transform="translate(${px.toFixed(1)} ${py.toFixed(1)})" data-swap="${pl.id}" data-swap-label="${pl.number} ${esc(pl.name)}" data-pick="${pl.id}" role="button" tabindex="0"><title>${esc(title)}</title><circle r="11"/><text y="4" text-anchor="middle">${pl.number}</text><text y="22" text-anchor="middle" class="fm-name">${esc(Array.from(pl.name).slice(0, 9).join(''))}</text></g>`;
    const onPitch = (x: number, z: number) => [x * 2 * 200, (z + 0.5) * 110] as const;
    const outOf = (pl: Team['players'][number], pos: Team['players'][number]['position']) => canPlay(pl).includes(pos) ? '' : ' (out of position)';
    const dots = [
      ...(gk ? [dot(...onPitch(0.04, 0), gk, 'fm-gk', `${gk.name}: Keeper${outOf(gk, 'GK')}`)] : []),
      ...[...slots].map(([pl, sl]) => dot(...onPitch(sl.x, sl.z), pl, `fm-${sl.pos.toLowerCase()}${outOf(pl, sl.pos) ? ' is-out' : ''}`, `${pl.name}: ${POSITION_LABELS[sl.pos]}${outOf(pl, sl.pos)}`)),
      ...subs.map((pl, i) => dot(28 + i * 48, 140, pl, 'fm-sub', `${pl.name}: sub`)),
    ].join('');
    const height = subs.length ? 180 : 126;
    return `
      <div class="field formation-field"><span>Formation <small class="muted">${esc(f.shape)} · ${esc(f.blurb)}</small></span>
        <div class="formation-row">
          <div class="pills formation-pills">${FORMATIONS.map((x) => `<button class="pill ${x.id === f.id ? 'is-active' : ''}" data-formation="${x.id}" title="${esc(x.blurb)}" ${pressed(x.id === f.id)}><strong>${esc(x.name)}</strong> <small>${x.shape}</small></button>`).join('')}</div>
          <svg class="formation-pitch" viewBox="-14 -8 228 ${height}" aria-label="${esc(f.name)} formation" data-swap-instant>
            <rect x="-8" y="0" width="216" height="110" rx="6" class="fm-grass"/>
            <line x1="200" y1="0" x2="200" y2="110" class="fm-line"/><circle cx="200" cy="55" r="16" class="fm-line"/>
            <rect x="-8" y="30" width="34" height="50" class="fm-line"/>
            ${subs.length ? '<rect x="-8" y="122" width="216" height="46" rx="6" class="fm-bench"/><text x="200" y="143" text-anchor="end" class="fm-bench-label">SUBS</text>' : ''}
            ${dots}
          </svg>
        </div>
        <p class="muted small fm-hint">${pickedPlayer ? `Now tap the player to swap with ${esc(pickedPlayer.name)}, or tap ${esc(pickedPlayer.name)} again to cancel.` : 'Drag a player onto another to swap places (or tap one, then the other). Drag a sub onto the pitch to bring them on. Picking a formation moves your starters into its positions, choosing the spots they can play first.'}</p>
      </div>`;
  };

  /** "Also WING · ATT" under a player card: the other positions they can play. */
  const alsoText = (pl: Team['players'][number]): string => {
    const also = canPlay(pl).filter((x) => x !== pl.position);
    return also.length ? `<span class="pc-also">also ${also.join(' · ')}</span>` : '';
  };

  render();
  const unwireDrag = wireDragSwap(root, swapById);
  cleanup = () => { preview?.dispose(); preview = null; unwireDrag(); };
}

/** Star ratings for one player: spend the age group's budget, or just read them on a career team. */
function skillsField(p: Team['players'][number], team: Team): string {
  const cap = STAR_CAP[team.ageGroup];
  const left = starsLeft(p.skills, team.ageGroup, p.position);
  const rows = skillKeys(p.position).map((k) => {
    const label = skillLabel(p.position, k);
    return `
    <div class="skill-row">
      <span class="skill-name" title="${esc(label.blurb)}">${label.emoji} ${label.label}</span>
      <span class="stars" aria-label="${p.skills[k]} of ${cap} stars">${starsText(p.skills[k], cap)}</span>
      ${team.career ? `<span class="muted small xp">${Math.round(((p.xp?.[k] ?? 0) * 100))}% to next</span>` : `
      <span class="row skill-btns">
        <button class="btn btn-ghost btn-icon" data-star-down="${k}" ${p.skills[k] <= 1 ? 'disabled' : ''} aria-label="Fewer ${label.label} stars">−</button>
        <button class="btn btn-blue btn-icon" data-star-up="${k}" ${p.skills[k] >= cap || left <= 0 ? 'disabled' : ''} aria-label="More ${label.label} stars">+</button>
      </span>`}
    </div>`;
  }).join('');
  const note = team.career
    ? 'Career players earn stars by playing: goals, passes, tackles and saves all count.'
    : left > 0 ? `${left} star${left === 1 ? '' : 's'} left to spend.` : left === 0 ? 'All stars spent!' : `${-left} too many stars for this age group.`;
  return `
    <div class="field skills-field"><span>Stars <small class="muted">(${AGE_STATS[team.ageGroup].label}: up to ${cap} per stat, ${STAR_BUDGET[team.ageGroup]} in total)</small></span>
      <div class="skills">${rows}</div>
      <div class="row space-between"><p class="muted small ${left < 0 ? 'is-over' : ''}">${note}</p>${team.career ? '' : '<button class="btn btn-ghost" id="p-spread">🎲 Spread stars</button>'}</div>
    </div>`;
}

// ---------- Match setup ----------

const MODE_INFO: Record<SetupMode, { title: string; go: string; blurb: string }> = {
  match: { title: 'Match Setup', go: '⚽ Kick Off!', blurb: '' },
  tournament: { title: 'Tournament', go: '🏆 Start the cup!', blurb: 'Four teams, two semi-finals and a final. Win both of your games to lift the trophy. Draws go to penalties!' },
  shootout: { title: 'Penalty Shoot-out', go: '🥅 Start the shoot-out!', blurb: 'Best of five penalties each, then sudden death. Hold shoot to power up and aim with the stick. In goal, move to dive!' },
  training: { title: 'Shooting Training', go: '🎯 Start training!', blurb: 'Just you, a keeper and a bag of balls. Score as many as you can before the time runs out. Rocket shots count double!' },
  career: { title: 'Career', go: '🌱 Start in the Under 5s!', blurb: 'Take a team all the way from the Under 5s to the Under 10s. Every year has four mini seasons of five matches. Your players start tiny and grow by playing: goals, passes, tackles and saves all earn stars. Pick the team whose name, kits and kids you want to take on the journey; a copy starts at U5 so your original is untouched.' },
  league: { title: 'League', go: '📋 Start in Tier 5!', blurb: 'Five leagues, from the Acorn League at Tier 5 up to the Star Premier League at Tier 1. Play five matches a season: finish in the top two to go up, bottom to go down. The teams get tougher every tier. Your league is saved, so you can come back any time.' },
};

function renderSetup(root: HTMLElement, router: Router, homeId?: string, mode: SetupMode = 'match'): void {
  const teams = getTeams();
  const settings = getSettings();
  let home = (homeId && getTeam(homeId)) || teams[0];
  let opponentId: string | 'cpu' = 'cpu';
  let cpu = generateOpponent(home.ageGroup, home.kit);
  let difficulty: Difficulty = settings.difficulty;
  let halfSeconds = mode === 'training' ? 90 : settings.halfLengthSeconds;
  let twoPlayer = false;
  let weather: WeatherChoice = 'random';
  const solo = mode === 'training' || mode === 'league' || mode === 'career';
  const hasKeyboard = window.matchMedia('(pointer: fine)').matches && !solo;
  const info = MODE_INFO[mode];
  const lengthLabel = mode === 'training' ? 'Time' : mode === 'shootout' ? '' : 'Half length';
  const lengths = mode === 'training' ? [60, 90, 120, 180] : [60, 120, 180, 300];
  /** A two-player cup needs a second saved team of the same age group: pick the first, or go back to one player. */
  const pickSecondTeam = () => {
    const other = teams.find((t) => t.id !== home.id && t.ageGroup === home.ageGroup);
    if (other) { opponentId = other.id; return; }
    twoPlayer = false;
    opponentId = 'cpu';
    alert('Make a second team of the same age group first, then you can both play in the cup.');
  };

  const render = () => {
    const focused = focusKey(document.activeElement);
    const away = opponentId === 'cpu' ? cpu : getTeam(opponentId) ?? cpu;
    const sameAge = teams.filter((t) => t.id !== home.id && t.ageGroup === home.ageGroup);
    const [homeK, awayK, swapped] = resolveKits(home, away);
    root.innerHTML = `
      <div class="screen setup">
        ${topBar(info.title, mode === 'tournament' ? 'cup' : mode === 'league' ? 'league' : 'none')}
        ${info.blurb ? `<p class="mode-blurb">${esc(info.blurb)}</p>` : ''}
        <div class="vs ${solo || mode === 'tournament' ? 'vs-solo' : ''}">
          <div class="card vs-card">
            <span class="muted">Your team</span>
            <div class="row">${badgeSvg(home.badge, 64)}${kitChip(homeK.kit, 64)}</div>
            <h3>${esc(home.name)}</h3>
            <span class="chip chip-age">${home.ageGroup}</span>
            <select id="s-home">${teams.map((t) => `<option value="${t.id}" ${t.id === home.id ? 'selected' : ''}>${esc(t.name)} (${t.ageGroup})</option>`).join('')}</select>
          </div>
          ${solo ? '' : mode === 'tournament' ? `<div class="vs-mid">+</div><div class="card vs-card"><span class="muted">${twoPlayer ? 'Player 2 and two more teams' : 'Three computer teams'}</span><div class="row cup-marks">🛡️ 🛡️ 🛡️</div><h3>${twoPlayer ? `${esc(away.name)} + 2 surprise teams` : 'Surprise opponents'}</h3><span class="chip chip-age">${home.ageGroup}</span>${twoPlayer ? `<select id="s-away">${sameAge.map((t) => `<option value="${t.id}" ${t.id === opponentId ? 'selected' : ''}>${esc(t.name)}</option>`).join('')}</select>` : ''}</div>` : `<div class="vs-mid">VS</div>
          <div class="card vs-card">
            <span class="muted">${twoPlayer ? 'Player 2' : 'Opponent (computer)'}</span>
            <div class="row">${badgeSvg(away.badge, 64)}${kitChip(awayK.kit, 64)}</div>
            <h3>${esc(away.name)}</h3>
            <span class="chip chip-age">${away.ageGroup}</span>
            <select id="s-away">
              <option value="cpu" ${opponentId === 'cpu' ? 'selected' : ''}>Random ${home.ageGroup} team</option>
              ${sameAge.map((t) => `<option value="${t.id}" ${t.id === opponentId ? 'selected' : ''}>${esc(t.name)}</option>`).join('')}
            </select>
            <div class="row"><button class="btn btn-ghost" id="s-reroll">🎲 New opponent</button>${logoControls(away.badge, 'away', '📷 Their logo')}</div>
          </div>`}
        </div>
        <div class="card options">
          ${hasKeyboard ? `<div class="field"><span>Players</span>
            <div class="pills"><button class="pill ${!twoPlayer ? 'is-active' : ''}" data-players="1" ${pressed(!twoPlayer)}>1 player</button><button class="pill ${twoPlayer ? 'is-active' : ''}" data-players="2" ${pressed(twoPlayer)}>2 players, one keyboard</button></div>
            ${twoPlayer ? `<p class="muted">Player 1: ${esc(controlsSentence('p1'))}.<br/>Player 2: ${esc(controlsSentence('p2'))}.<br/>Plug in two controllers and each player gets one. <button class="link-btn" data-nav="controls">Change controls</button></p>` : ''}
          </div>` : ''}
          ${mode === 'career' ? `<div class="field"><span>The journey</span><div class="age-ladder">${CAREER_AGES.map((a) => `<span class="rung-age">${a}</span>`).join('<span class="rung-arrow">→</span>')}</div><p class="muted small">${SEASONS_PER_YEAR} mini seasons a year · promotion and relegation between tiers carry over · stars grow up to each age group's cap.</p></div>` : mode === 'league' ? `<div class="field"><span>Tiers</span><ol class="tier-list">${TIERS.map((t) => `<li><strong>Tier ${t.tier}</strong> ${esc(t.name)}</li>`).join('')}</ol></div>` : `<div class="field"><span>Computer difficulty</span>
            <div class="pills">${(['easy', 'normal', 'hard'] as Difficulty[]).map((d) => `<button class="pill ${d === difficulty ? 'is-active' : ''}" data-diff="${d}" ${pressed(d === difficulty)}>${d[0].toUpperCase() + d.slice(1)}</button>`).join('')}</div>
          </div>`}
          ${lengthLabel ? `<div class="field"><span>${lengthLabel}</span>
            <div class="pills">${lengths.map((s) => `<button class="pill ${s === halfSeconds ? 'is-active' : ''}" data-len="${s}" ${pressed(s === halfSeconds)}>${s >= 60 && s % 60 === 0 ? `${s / 60} min` : `${s} s`}</button>`).join('')}</div>
          </div>` : ''}
          ${mode === 'tournament' || mode === 'league' || mode === 'career' ? '' : `<div class="field"><span>Weather</span>
            <div class="pills">${WEATHER_CHOICES.map((w) => `<button class="pill ${w.id === weather ? 'is-active' : ''}" data-weather="${w.id}" ${pressed(w.id === weather)}>${w.label}</button>`).join('')}</div>
          </div>`}
        </div>
        ${swapped && !solo && mode !== 'tournament' ? `<p class="warn">👕 The kits clash, so ${esc(swapped)} will wear their away kit.</p>` : ''}
        <button class="btn btn-primary btn-big btn-kickoff" id="s-go">${info.go}</button>
      </div>`;
    wire(root, () => router.go({ name: 'menu' }));
    root.querySelector<HTMLSelectElement>('#s-home')!.addEventListener('change', (e) => {
      home = getTeam((e.target as HTMLSelectElement).value) ?? home;
      cpu = generateOpponent(home.ageGroup, home.kit);
      opponentId = 'cpu';
      // A two-player cup keeps Player 2 in it with a saved team of the new age group.
      if (twoPlayer && mode === 'tournament') pickSecondTeam();
      render();
    });
    root.querySelector<HTMLSelectElement>('#s-away')?.addEventListener('change', (e) => { opponentId = (e.target as HTMLSelectElement).value; render(); });
    wireLogoControls(root, () => away.badge, () => { if (opponentId !== 'cpu') saveTeam(away); render(); });
    root.querySelector('#s-reroll')?.addEventListener('click', () => { cpu = generateOpponent(home.ageGroup, home.kit); opponentId = 'cpu'; render(); });
    root.querySelectorAll<HTMLElement>('[data-diff]').forEach((b) => b.addEventListener('click', () => { difficulty = b.dataset.diff as Difficulty; render(); }));
    root.querySelectorAll<HTMLElement>('[data-players]').forEach((b) => b.addEventListener('click', () => {
      twoPlayer = b.dataset.players === '2';
      if (twoPlayer && mode === 'tournament' && opponentId === 'cpu') pickSecondTeam();
      render();
    }));
    root.querySelectorAll<HTMLElement>('[data-len]').forEach((b) => b.addEventListener('click', () => { halfSeconds = Number(b.dataset.len); render(); }));
    root.querySelectorAll<HTMLElement>('[data-weather]').forEach((b) => b.addEventListener('click', () => { weather = b.dataset.weather as WeatherChoice; render(); }));
    root.querySelector('#s-go')!.addEventListener('click', () => {
      if (mode !== 'training') updateSettings({ difficulty, halfLengthSeconds: halfSeconds });
      const awayTeam = opponentId === 'cpu' ? cpu : getTeam(opponentId) ?? cpu;
      if (mode === 'tournament') {
        if (cupInProgress() && !confirm('Start a new cup? The cup you are playing now will end.')) return;
        const state = createTournament(home, difficulty, halfSeconds, twoPlayer, twoPlayer ? awayTeam : undefined);
        setTournament(state);
        router.go({ name: 'tournament', state });
        return;
      }
      if (mode === 'league') {
        if (getLeague() && !confirm('Start a new league career? Your current league will be deleted.')) return;
        setLeague(createLeague(home, halfSeconds));
        router.go({ name: 'league' });
        return;
      }
      if (mode === 'career') {
        if (getCareer() && !confirm('Start a new career? Your current career will be deleted (the team stays in My Teams).')) return;
        const { career, team } = createCareer(home, halfSeconds);
        saveTeam(team);
        setCareer(career);
        recordCareer({ started: true });
        router.go({ name: 'career' });
        return;
      }
      const [h, a] = resolveKits(home, awayTeam);
      router.startMatch({ home: h, away: a, difficulty, halfSeconds, twoPlayer, weather, mode: mode === 'training' ? 'training' : mode === 'shootout' ? 'shootout' : 'match' });
    });
    restoreFocus(root, focused);
  };
  render();
}

/** Automatic clash check: if the home kits look alike, the away side wears its away kit (or the home side does). */
export function resolveKits(home: Team, away: Team): [Team, Team, string | null] {
  if (!kitsClash(home.kit, away.kit)) return [home, away, null];
  if (!kitsClash(home.kit, away.awayKit)) return [home, { ...away, kit: away.awayKit }, away.name];
  if (!kitsClash(home.awayKit, away.kit)) return [{ ...home, kit: home.awayKit }, away, home.name];
  return [home, { ...away, kit: away.awayKit }, away.name];
}

// ---------- Results ----------

function pensRow(res: boolean[], total: number): string {
  return `<span class="pens-row">${Array.from({ length: Math.max(total, res.length) }, (_, i) => res[i] === undefined ? '<i class="pen pen-todo"></i>' : res[i] ? '<i class="pen pen-goal">⚽</i>' : '<i class="pen pen-miss">✕</i>').join('')}</span>`;
}

function stickerBanner(stickers: Sticker[]): string {
  if (!stickers.length) return '';
  return `<div class="new-stickers">${stickers.map((s) => `<div class="sticker sticker-new"><span class="sticker-emoji">${s.emoji}</span><strong>${esc(s.name)}</strong><small>New sticker!</small></div>`).join('')}</div>`;
}

/** What the results screen shows beyond the score, worked out once when the match finished. */
export interface ResultSummary {
  stickers: Sticker[];
  /** Where the league or career table stands after this match. */
  tableNote?: string;
  /** Stars the career players earned in this match. */
  growth?: GrowthEvent[];
}

/** Computer matches played in the background during the player's own (see playAhead). */
export interface Ahead {
  /** The rest of a league round: which round, and one result per fixture (null for the player's own). */
  round?: { index: number; outcomes: (SimOutcome | null)[] };
  cup?: CupAhead;
}

/** Start the computer matches that finish alongside this one (the rest of the league round, the other cup semi) while it is played. */
export function playAhead(o: StartOptions): Promise<Ahead> {
  const career = o.career ? getCareer() : null;
  const ls = o.league ? getLeague() : career?.league ?? null;
  const you = ls && getTeam(o.league ? ls.teamId : career!.teamId);
  if (ls && you) {
    const index = ls.round;
    return inBackground({ kind: 'round', jobs: roundJobs(ls, you) }).then((res) => (res.kind === 'round' ? { round: { index, outcomes: res.outcomes } } : {}));
  }
  const cup = o.tournament && cupAheadRequest(o.tournament);
  if (cup) return inBackground(cup).then((res) => (res.kind === 'cup' ? { cup: res.ahead } : {}));
  return Promise.resolve({});
}

/**
 * Record a finished match everywhere it counts (the cup bracket, the league table, the career and the
 * players' stars) and build its results screen. Runs exactly once per match, when it ends, never on a redraw.
 */
export function finishMatch(r: MatchResult, o: StartOptions, stickers: Sticker[], ahead: Ahead = {}): Screen {
  const summary: ResultSummary = { stickers: [...stickers] };
  if (o.tournament) {
    applyResult(o.tournament, r, ahead.cup);
    setTournament(o.tournament);
  }
  if (o.career) {
    const c = getCareer();
    const you = c && getTeam(c.teamId);
    if (c && you && !c.done) {
      const others = ahead.round?.index === c.league.round ? ahead.round.outcomes : undefined;
      const s = applyCareerMatch(c, you, r, others);
      saveTeam(you);
      setCareer(c);
      const motm3 = Object.values(c.careerStats).some((st) => st.motm >= 3);
      const boot = Object.values(c.seasonStats).some((st) => st.goals >= 8);
      summary.stickers.push(...recordCareer({ starUp: s.growth.length > 0, fiveStar: s.fiveStar, motm3, goldenBoot: boot }));
      summary.tableNote = `${careerAge(c)} · ${seasonName(c)} season · match ${Math.min(c.league.round, c.league.rounds.length)} of ${c.league.rounds.length} · you are ${ordinal(yourPosition(c.league, you))}`;
      summary.growth = s.growth;
    }
  }
  if (o.league) {
    const ls = getLeague();
    const you = ls && getTeam(ls.teamId);
    if (ls && you) {
      const others = ahead.round?.index === ls.round ? ahead.round.outcomes : undefined;
      applyLeagueResult(ls, you, r, others);
      setLeague(ls);
      summary.tableNote = `${tierInfo(ls.tier).name} · round ${Math.min(ls.round, ls.rounds.length)} of ${ls.rounds.length} played · you are ${ordinal(yourPosition(ls, you))}`;
    }
  }
  return { name: 'results', result: r, summary, tournament: o.tournament, league: o.league, career: o.career };
}

function renderResults(root: HTMLElement, router: Router, r: MatchResult, summary: ResultSummary, tournament?: TournamentState, league?: boolean, career?: boolean): void {
  const [h, a] = r.score;
  const stickers = summary.stickers;
  const leagueNote = summary.tableNote ? `<p class="muted">${esc(summary.tableNote)}</p>` : '';
  const growthNote = growthList(summary.growth ?? []);
  let headline = h === a ? "It's a draw!" : h > a ? `${r.home.name} win!` : `${r.away.name} win!`;
  if (r.mode === 'training') headline = r.trainingPoints >= 10 ? 'Sharp shooting!' : r.trainingPoints >= 5 ? 'Nice work!' : 'Keep practising!';
  if (r.mode === 'shootout') headline = h > a ? `${r.home.name} win the shoot-out!` : `${r.away.name} win the shoot-out!`;
  if (tournament && h === a && r.mode === 'match') headline = 'All square! Penalties decide it.';
  const motm = r.mode === 'match' ? playerOfTheMatch(r) : null;
  const best = getProgress().trainingBest;
  const soLen = r.shootout ? Math.max(5, r.shootout[0].length, r.shootout[1].length) : 0;
  root.innerHTML = `
    <div class="screen results">
      ${topBar(r.mode === 'training' ? 'Training over' : r.mode === 'shootout' ? 'Shoot-out over' : 'Full Time', tournament ? 'cup' : league ? 'league' : 'none')}
      <div class="card results-card">
        <h2>${esc(headline)}</h2>
        ${r.mode === 'training' ? `
          <div class="training-score"><span class="score-big">${r.trainingPoints}</span><span class="muted">points</span></div>
          <p class="muted">${r.goals.length} goals scored · best ever ${best} points</p>` : `
          <div class="result-line">
            <div class="result-team">${badgeSvg(r.home.badge, 64)}<span>${esc(r.home.name)}</span></div>
            <div class="score-big">${h} – ${a}</div>
            <div class="result-team">${badgeSvg(r.away.badge, 64)}<span>${esc(r.away.name)}</span></div>
          </div>`}
        ${r.shootout ? `<div class="pens">${pensRow(r.shootout[0], soLen)}${pensRow(r.shootout[1], soLen)}</div>` : ''}
        ${r.mode === 'match' ? `<ul class="goals-list">
          ${r.goals.length === 0 ? '<li class="muted">No goals this time. The keepers were on fire!</li>' : ''}
          ${r.goals.map((g) => `<li>${g.side === 0 ? '⚽ ' : ''}<strong>${esc(g.scorer.name)}</strong> #${g.scorer.number}${g.ownGoal ? ' (og)' : ''} <span class="muted">${g.minute}'</span>${g.side === 1 ? ' ⚽' : ''}</li>`).join('')}
        </ul>` : ''}
        ${motm ? `<div class="motm">🏆 Player of the match: <strong>${esc(motm.name)}</strong> #${motm.number}</div>` : ''}
        ${leagueNote}
        ${growthNote}
        ${stickerBanner(stickers)}
        <div class="row">
          ${tournament ? `<button class="btn btn-primary btn-big" id="r-cup">${tournament.needsShootout ? '🥅 Penalty shoot-out!' : '🏆 Back to the cup'}</button>` : league ? '<button class="btn btn-primary btn-big" id="r-league">📋 Back to the league</button>' : career ? '<button class="btn btn-primary btn-big" id="r-career">🌱 Back to the career</button>' : `<button class="btn btn-primary btn-big" id="r-again">Play again</button>`}
          <button class="btn btn-ghost btn-big" id="r-menu">Main menu</button>
        </div>
      </div>
    </div>`;
  wire(root, () => router.go({ name: 'menu' }));
  root.querySelector('#r-again')?.addEventListener('click', () => router.go({ name: 'setup', homeId: r.home.id, mode: r.mode === 'tutorial' ? 'match' : r.mode }));
  root.querySelector('#r-cup')?.addEventListener('click', () => {
    if (tournament!.needsShootout) {
      const f = currentFixture(tournament!)!;
      router.startMatch({ home: f.home, away: f.away, difficulty: tournament!.difficulty, halfSeconds: 60, twoPlayer: tournament!.twoPlayer, mode: 'shootout', tournament });
    } else router.go({ name: 'tournament', state: tournament! });
  });
  root.querySelector('#r-league')?.addEventListener('click', () => router.go({ name: 'league' }));
  root.querySelector('#r-career')?.addEventListener('click', () => router.go({ name: 'career' }));
  root.querySelector('#r-menu')!.addEventListener('click', () => router.go({ name: 'menu' }));
}

function growthList(events: GrowthEvent[]): string {
  if (!events.length) return '';
  return `<div class="growth"><h3>⭐ Growing up!</h3><ul class="plain-list">${events.map((g) => `<li><strong>${esc(g.name)}</strong>: ${esc(g.label)} is now <span class="stars">${starsText(g.stars, g.stars)}</span></li>`).join('')}</ul></div>`;
}

function ordinal(n: number): string {
  const s = ['th', 'st', 'nd', 'rd'], v = n % 100;
  return n + (s[(v - 20) % 10] ?? s[v] ?? s[0]);
}

// ---------- League ----------

function renderLeague(root: HTMLElement, router: Router): void {
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
  const stickers = outcome ? recordSeason(outcome) : [];
  const outcomeText = outcome
    ? outcome.outcome === 'champion' ? `🏆 Champions of the ${info.name}! You are league legends.`
      : outcome.outcome === 'promoted' ? `⬆️ You finished ${ordinal(outcome.position)}: promoted to Tier ${ls.tier - 1}, the ${tierInfo(ls.tier - 1).name}!`
        : outcome.outcome === 'relegated' ? `⬇️ You finished ${ordinal(outcome.position)}: down to Tier ${ls.tier + 1}, the ${tierInfo(ls.tier + 1).name}. You will bounce back!`
          : outcome.position === 1 ? `🥇 You won the ${info.name}! Already at the top, so one more season to defend it.` : `You finished ${ordinal(outcome.position)}: staying in the ${info.name} for another season.`
    : '';
  root.innerHTML = `
    <div class="screen league">
      ${topBar('League', 'league')}
      <div class="tier-banner tier-${ls.tier}">
        <span class="tier-num">Tier ${ls.tier}</span>
        <h2>${esc(info.name)}</h2>
        <p>${esc(info.blurb)} · Season ${ls.season}</p>
        <div class="tier-ladder">${TIERS.map((t) => `<span class="rung ${t.tier === ls.tier ? 'is-here' : ''} ${t.tier >= ls.bestTier && t.tier !== ls.tier ? 'is-reached' : ''}" title="${esc(t.name)}">${t.tier}</span>`).join('')}</div>
      </div>
      ${outcome ? `<div class="card outcome-card outcome-${outcome.outcome}"><h3>Season over</h3><p>${esc(outcomeText)}</p>${stickerBanner(stickers)}</div>` : ''}
      <div class="league-body">
        <div class="card table-card">
          <table class="league-table">
            <thead><tr><th>#</th><th>Team</th><th>P</th><th>W</th><th>D</th><th>L</th><th>GD</th><th>Pts</th></tr></thead>
            <tbody>
              ${table.map((row, i) => `<tr class="${row.isYou ? 'is-you' : ''} ${i < 2 && ls.tier > 1 ? 'is-up' : ''} ${i === table.length - 1 && ls.tier < 5 ? 'is-down' : ''}">
                <td>${i + 1}</td><td class="t-name">${badgeSvg(row.team.badge, 22)} ${esc(row.team.name)}${row.isYou ? '' : ` <span class="logo-mini">${logoControls(row.team.badge, row.team.id, '📷')}</span>`}</td><td>${row.played}</td><td>${row.won}</td><td>${row.drawn}</td><td>${row.lost}</td><td>${row.gf - row.ga > 0 ? '+' : ''}${row.gf - row.ga}</td><td><strong>${row.points}</strong></td>
              </tr>`).join('')}
            </tbody>
          </table>
          <p class="muted small">${ls.tier > 1 ? 'Top two go up.' : 'Top of the tree!'} ${ls.tier < 5 ? 'Bottom team goes down.' : ''}</p>
        </div>
        <div class="card next-card">
          ${next ? `
            <span class="muted">Round ${ls.round + 1} of ${ls.rounds.length}</span>
            <div class="fx-team ${next.youAreHome ? 'is-you' : ''}">${badgeSvg(next.home.badge, 40)}<span class="fx-name">${esc(next.home.name)}</span></div>
            <div class="vs-mid">VS</div>
            <div class="fx-team ${!next.youAreHome ? 'is-you' : ''}">${badgeSvg(next.away.badge, 40)}<span class="fx-name">${esc(next.away.name)}</span></div>
            <button class="btn btn-primary btn-big" id="l-play">⚽ Play next match</button>` : `
            <button class="btn btn-primary btn-big" id="l-next">${outcome?.outcome === 'promoted' ? '⬆️ Start next season' : outcome?.outcome === 'relegated' ? '🔁 Start next season' : '▶️ Start next season'}</button>`}
          ${ls.history.length ? `<details class="history"><summary>Past seasons</summary><ul class="plain-list muted">${ls.history.map((h) => `<li>Season ${h.season}: ${ordinal(h.position)} in ${esc(tierInfo(h.tier).name)} (${h.outcome})</li>`).join('')}</ul></details>` : ''}
          <button class="btn btn-ghost" id="l-quit">Leave this league</button>
        </div>
      </div>
    </div>`;
  wire(root, () => router.go({ name: 'menu' }));
  wireLogoControls(root, (key) => ls.teams.find((t) => t.id === key)?.badge, () => { setLeague(ls); renderLeague(root, router); });
  root.querySelector('#l-play')?.addEventListener('click', () => {
    // The human always controls the home side of the sim, so put your team there; the table flips the score when you were away.
    const [h, a] = resolveKits(next!.youAreHome ? next!.home : next!.away, next!.youAreHome ? next!.away : next!.home);
    router.startMatch({ home: h, away: a, difficulty: 'normal', halfSeconds: ls.halfSeconds, mode: 'match', league: true, cpuLevel: info.level });
  });
  root.querySelector('#l-next')?.addEventListener('click', () => { setLeague(nextSeason(ls, you)); renderLeague(root, router); });
  root.querySelector('#l-quit')?.addEventListener('click', () => {
    if (confirm('Leave this league? Your table and tier will be deleted.')) { setLeague(null); router.go({ name: 'menu' }); }
  });
}

// ---------- Career ----------

function renderCareer(root: HTMLElement, router: Router): void {
  const c = getCareer();
  const you = c && getTeam(c.teamId);
  if (!c || !you) {
    if (c) setCareer(null); // the team was deleted
    router.go({ name: 'setup', mode: 'career' });
    return;
  }
  const age = careerAge(c);
  const tier = tierInfo(c.league.tier);
  const table = computeTable(c.league, you);
  const over = !c.done && careerSeasonOver(c);
  const next = c.done ? null : nextFixture(c.league, you);
  const outcome = over ? careerSeasonOutcome(c, you) : null;
  const lastSeason = c.season === SEASONS_PER_YEAR;
  const lastYear = c.year === CAREER_AGES.length;
  const pending = c.pendingGrowth;
  if (pending.length) { c.pendingGrowth = []; setCareer(c); }
  const outcomeText = outcome
    ? (outcome.position === 1 ? `🥇 Champions of the ${tier.name}! ` : `You finished ${ordinal(outcome.position)} in the ${tier.name}. `)
      + (outcome.outcome === 'promoted' ? `Up to Tier ${c.league.tier - 1} next season! ` : outcome.outcome === 'relegated' ? `Down to Tier ${c.league.tier + 1} next season, you will bounce back. ` : '')
      + (outcome.topScorer ? `Top scorer: ${outcome.topScorer.name} with ${outcome.topScorer.goals}. ` : '')
      + (lastSeason ? (lastYear ? 'That was the last season of the Under 10s: the career is complete!' : `That was the last season of the year: next up, the ${AGE_STATS[CAREER_AGES[c.year]].label}!`) : '')
    : '';
  const sum = Object.values(c.careerStats);
  const totals = { played: Math.max(0, ...sum.map((x) => x.played)), goals: sum.reduce((n, x) => n + x.goals, 0) };
  let scope: 'season' | 'career' = 'season';
  const cards = () => statRows(c, you, scope).map(({ player: p, stats: st }) => {
    return `<div class="card player-stat-card ${p.starter ? '' : 'is-sub'}">
      <div class="psc-top">${kitChip(p.position === 'GK' ? you.keeperKit : you.kit, 36)}<div><strong>${esc(p.name)}</strong> <span class="muted">#${p.number}</span><br/><span class="chip chip-pos chip-${p.position.toLowerCase()}">${POSITION_LABELS[p.position]}</span></div></div>
      <div class="psc-skills">${skillKeys(p.position).map((k) => { const l = skillLabel(p.position, k); return `<span title="${esc(l.label)}">${l.emoji} <span class="stars">${starsText(p.skills[k], STAR_CAP[age])}</span></span>`; }).join('')}</div>
      <div class="psc-stats">
        <span><strong>${st.played}</strong> played</span>
        ${p.position === 'GK' ? `<span><strong>${st.saves}</strong> saves</span><span><strong>${st.cleanSheets}</strong> clean sheets</span>` : `<span><strong>${st.goals}</strong> goals</span><span><strong>${st.assists}</strong> assists</span>`}
        <span><strong>${p.position === 'GK' ? st.passes : st.tackles}</strong> ${p.position === 'GK' ? 'kicks' : 'tackles'}</span>
        <span><strong>${st.motm}</strong> 🏆</span>
      </div>
    </div>`;
  }).join('');
  root.innerHTML = `
    <div class="screen career">
      ${topBar('Career')}
      <div class="tier-banner career-banner">
        <span class="tier-num">Year ${c.year} · ${esc(AGE_STATS[age].label)}</span>
        <h2>${esc(you.name)}</h2>
        <p>${c.done ? 'Career complete! 🎓' : `${esc(seasonName(c))} season (${c.season} of ${SEASONS_PER_YEAR}) · ${esc(tier.name)} (Tier ${c.league.tier})`}</p>
        <div class="tier-ladder">${CAREER_AGES.map((a, i) => `<span class="rung rung-wide ${a === age && !c.done ? 'is-here' : ''} ${i < c.year - 1 || c.done ? 'is-reached' : ''}">${a}</span>`).join('')}</div>
      </div>
      ${pending.length ? `<div class="card outcome-card"><h3>🎒 Moving up to the ${esc(AGE_STATS[age].label)}!</h3><p class="muted">Bigger pitch, longer matches and a higher star cap. Saved-up progress turns into stars:</p>${growthList(pending)}</div>` : ''}
      ${outcome ? `<div class="card outcome-card outcome-${outcome.outcome}"><h3>Season over</h3><p>${esc(outcomeText)}</p></div>` : ''}
      ${c.done ? `<div class="card trophy-card"><div class="trophy">🎓</div><h2>All grown up!</h2><p class="muted">${esc(you.name)} played ${totals.played} matches from the Under 5s to the Under 10s, scored ${totals.goals} goals and won ${c.titles} mini-season title${c.titles === 1 ? '' : 's'}. What a journey.</p></div>` : ''}
      <div class="league-body">
        ${c.done ? '' : `<div class="card table-card">
          <table class="league-table">
            <thead><tr><th>#</th><th>Team</th><th>P</th><th>W</th><th>D</th><th>L</th><th>GD</th><th>Pts</th></tr></thead>
            <tbody>
              ${table.map((row, i) => `<tr class="${row.isYou ? 'is-you' : ''} ${i < 2 && c.league.tier > 1 ? 'is-up' : ''} ${i === table.length - 1 && c.league.tier < 5 ? 'is-down' : ''}">
                <td>${i + 1}</td><td class="t-name">${badgeSvg(row.team.badge, 22)} ${esc(row.team.name)}</td><td>${row.played}</td><td>${row.won}</td><td>${row.drawn}</td><td>${row.lost}</td><td>${row.gf - row.ga > 0 ? '+' : ''}${row.gf - row.ga}</td><td><strong>${row.points}</strong></td>
              </tr>`).join('')}
            </tbody>
          </table>
          <p class="muted small">${c.league.tier > 1 ? 'Top two go up a tier.' : 'Top of the tree!'} ${c.league.tier < 5 ? 'Bottom team goes down.' : ''}</p>
        </div>`}
        <div class="card next-card">
          ${next ? `
            <span class="muted">Match ${c.league.round + 1} of ${c.league.rounds.length}</span>
            <div class="fx-team ${next.youAreHome ? 'is-you' : ''}">${badgeSvg(next.home.badge, 40)}<span class="fx-name">${esc(next.home.name)}</span></div>
            <div class="vs-mid">VS</div>
            <div class="fx-team ${!next.youAreHome ? 'is-you' : ''}">${badgeSvg(next.away.badge, 40)}<span class="fx-name">${esc(next.away.name)}</span></div>
            <button class="btn btn-primary btn-big" id="k-play">⚽ Play next match</button>` : c.done ? '<button class="btn btn-primary btn-big" id="k-new">🌱 Start a new career</button>' : `
            <button class="btn btn-primary btn-big" id="k-next">${lastSeason ? (lastYear ? '🎓 Finish the career' : `🎒 Move up to ${CAREER_AGES[c.year]}`) : '▶️ Next mini season'}</button>`}
          <button class="btn btn-blue" id="k-edit">👕 Team looks</button>
          ${c.history.length ? `<details class="history"><summary>Past seasons</summary><ul class="plain-list muted">${c.history.map((h) => `<li>${esc(h.age)} ${esc(SEASON_NAMES[(h.miniSeason - 1) % SEASONS_PER_YEAR])}: ${ordinal(h.position)} in ${esc(tierInfo(h.tier).name)}${h.topScorer ? ` · top scorer ${esc(h.topScorer.name)} (${h.topScorer.goals})` : ''}</li>`).join('')}</ul></details>` : ''}
          <button class="btn btn-ghost" id="k-quit">Leave this career</button>
        </div>
      </div>
      <div class="card stat-cards-wrap">
        <div class="row space-between">
          <h3>Player cards</h3>
          <div class="pills"><button class="pill is-active" data-scope="season">This season</button><button class="pill" data-scope="career">Whole career</button></div>
        </div>
        <div class="stat-cards" id="k-cards">${cards()}</div>
      </div>
    </div>`;
  wire(root, () => router.go({ name: 'menu' }));
  root.querySelectorAll<HTMLElement>('[data-scope]').forEach((b) => b.addEventListener('click', () => {
    scope = b.dataset.scope as 'season' | 'career';
    root.querySelectorAll('[data-scope]').forEach((x) => x.classList.toggle('is-active', x === b));
    root.querySelector('#k-cards')!.innerHTML = cards();
  }));
  root.querySelector('#k-play')?.addEventListener('click', () => {
    // The human always controls the home side of the sim, so put your team there; the table flips the score when you were away.
    const [h, a] = resolveKits(next!.youAreHome ? next!.home : next!.away, next!.youAreHome ? next!.away : next!.home);
    router.startMatch({ home: h, away: a, difficulty: 'normal', halfSeconds: c.halfSeconds, mode: 'match', career: true, cpuLevel: tier.level });
  });
  root.querySelector('#k-next')?.addEventListener('click', () => {
    const adv = advanceCareer(c, you);
    saveTeam(you);
    setCareer(c);
    recordCareer({ champion: adv.record.position === 1, movedUp: adv.movedUp, finished: adv.finished, starUp: c.pendingGrowth.length > 0 });
    renderCareer(root, router);
  });
  root.querySelector('#k-edit')?.addEventListener('click', () => router.go({ name: 'builder', teamId: you.id }));
  root.querySelector('#k-new')?.addEventListener('click', () => router.go({ name: 'setup', homeId: you.id, mode: 'career' }));
  root.querySelector('#k-quit')?.addEventListener('click', () => {
    if (confirm('Leave this career? Your seasons and stats will be deleted. The team stays in My Teams.')) { setCareer(null); router.go({ name: 'menu' }); }
  });
}


// ---------- Tournament ----------

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

function renderTournament(root: HTMLElement, router: Router, s: TournamentState): void {
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

// ---------- Sticker album ----------

function renderAlbum(root: HTMLElement, router: Router): void {
  const p = getProgress();
  root.innerHTML = `
    <div class="screen album">
      ${topBar('Sticker Album', 'album')}
      <div class="card stats-card">
        <div class="stat"><strong>${p.played}</strong><span>matches</span></div>
        <div class="stat"><strong>${p.won}</strong><span>wins</span></div>
        <div class="stat"><strong>${p.goalsFor}</strong><span>goals</span></div>
        <div class="stat"><strong>${p.trophies}</strong><span>trophies</span></div>
        <div class="stat"><strong>${p.trainingBest}</strong><span>training best</span></div>
      </div>
      <p class="muted album-count">${p.stickers.length} of ${STICKERS.length} stickers collected</p>
      <div class="sticker-grid">
        ${STICKERS.map((s) => {
          const got = p.stickers.includes(s.id);
          return `<div class="sticker ${got ? 'is-got' : 'is-missing'}">
            <span class="sticker-emoji">${got ? s.emoji : '❔'}</span>
            <strong>${esc(s.name)}</strong>
            <small>${esc(s.how)}</small>
            ${s.unlocks ? `<span class="sticker-unlock">${got ? 'Unlocked badge' : 'Unlocks badge'} ${s.unlocks}</span>` : ''}
          </div>`;
        }).join('')}
      </div>
    </div>`;
  wire(root, () => router.go({ name: 'menu' }));
}

// ---------- Parents ----------

const NUMBER_WORDS = ['zero', 'one', 'two', 'three', 'four', 'five', 'six', 'seven', 'eight', 'nine', 'ten', 'eleven', 'twelve', 'thirteen', 'fourteen', 'fifteen', 'sixteen', 'seventeen', 'eighteen', 'nineteen'];
/** Wrong answers in a row at the Parents gate, and when it opens again after too many. */
let gateMisses = 0;
let gateLockedUntil = 0;

function renderParents(root: HTMLElement, router: Router, wrong = false): void {
  // A sum written in words keeps young children out of the grown-up settings: a new one after every try,
  // and a short wait after three misses so it cannot simply be guessed.
  const a = 12 + Math.floor(Math.random() * 8), b = 3 + Math.floor(Math.random() * 7);
  const wait = Math.ceil((gateLockedUntil - Date.now()) / 1000);
  root.innerHTML = `
    <div class="screen parents">
      ${topBar('Parents Zone')}
      <div class="card gate-card">
        <h2>Grown-ups only</h2>
        ${wait > 0 ? `<p class="warn">Too many tries. Ask a grown-up, and try again in ${wait} seconds.</p>` : `
        <p class="muted">To open the settings, answer this in numbers: what is <strong>${NUMBER_WORDS[a]} times ${NUMBER_WORDS[b]}</strong>?</p>
        <form class="row" id="gate">
          <input type="number" inputmode="numeric" id="gate-answer" placeholder="?" autocomplete="off" aria-label="Answer" />
          <button class="btn btn-primary" type="submit">Open</button>
        </form>
        ${wrong ? '<p class="warn" role="alert">Not quite. Ask a grown-up to help!</p>' : ''}`}
      </div>
    </div>`;
  wire(root, () => router.go({ name: 'menu' }));
  if (wait > 0) {
    const timer = window.setTimeout(() => renderParents(root, router), wait * 1000);
    cleanup = () => window.clearTimeout(timer);
    return;
  }
  const input = root.querySelector<HTMLInputElement>('#gate-answer')!;
  input.focus();
  root.querySelector('#gate')!.addEventListener('submit', (e) => {
    e.preventDefault();
    if (Number(input.value) === a * b) { gateMisses = 0; renderParentSettings(root, router); return; }
    if (++gateMisses >= 3) { gateMisses = 0; gateLockedUntil = Date.now() + 30_000; }
    renderParents(root, router, true);
  });
}

const MOTION_CHOICES: { id: MotionChoice; label: string }[] = [{ id: 'auto', label: 'Follow this device' }, { id: 'reduce', label: 'Calm' }, { id: 'full', label: 'Full' }];

/** Put the settings that live outside the screens (volumes, music, motion) into effect after the save changed under them. */
function applySavedSettings(): void {
  applyVolumes();
  music.refresh();
  applyMotionSetting();
}

function renderParentSettings(root: HTMLElement, router: Router): void {
  const s = getSettings();
  const p = getProgress();
  root.innerHTML = `
    <div class="screen parents">
      ${topBar('Parents Zone')}
      <div class="card">
        <h2>Settings</h2>
        ${soundSettings()}
        <div class="field"><span>Motion</span>
          <div class="pills">${MOTION_CHOICES.map((m) => `<button class="pill ${s.motion === m.id ? 'is-active' : ''}" data-motion="${m.id}" ${pressed(s.motion === m.id)}>${m.label}</button>`).join('')}</div>
          <p class="muted small">Calm means no confetti, no wobbling and no goal replays.${s.motion === 'auto' ? ` This device asks for ${s.reduceMotion ? 'calm' : 'full'} motion.` : ''}</p>
        </div>
        ${graphicsSettings()}
      </div>
      <div class="card">
        <h2>Keep the save safe</h2>
        <p class="muted">Teams, stickers, the league and the career are saved in this browser only, and browsers can clear them (Safari does after about a week without a visit, unless the game is on the Home Screen). Save a backup file now and then; it also moves a save to another device.</p>
        <div class="row">
          <button class="btn btn-blue" id="pa-export">⬇️ Save a backup file</button>
          <button class="btn btn-ghost" id="pa-import">⬆️ Load a backup file</button>
          <input type="file" id="pa-import-file" accept=".json,application/json" hidden />
          <button class="btn btn-ghost" id="pa-persist">🔒 Ask this browser to keep the save</button>
          ${hasBackup() ? '<button class="btn btn-ghost" id="pa-undo">↩️ Put back the save from before the last reset, repair or loaded file</button>' : ''}
        </div>
        <p class="muted small" id="pa-save-note" aria-live="polite"></p>
      </div>
      <div class="card">
        <h2>About this game</h2>
        <p class="muted">Goal Rush! is a five-a-side football game for children aged 7 and up. Players build a team and play short matches against the computer, or against a friend on the same keyboard.</p>
        <ul class="muted plain-list">
          <li><strong>Privacy:</strong> nothing leaves this device. There are no accounts, no chat, no adverts, no in-app purchases and no tracking. Teams, settings and stickers are saved in this browser's local storage only.</li>
          <li><strong>Names:</strong> children type their own team and player names. A small word filter blocks the obvious rude words; nothing is shared with anyone.</li>
          <li><strong>Logos:</strong> a club logo picture can be uploaded for any team. It is shrunk and kept in this browser only; it is never sent anywhere.</li>
          <li><strong>Offline:</strong> once loaded, the game keeps working without an internet connection. On a phone or tablet you can add it to the home screen.</li>
          <li><strong>Play time:</strong> a match lasts two to ten minutes depending on the half length chosen on the setup screen.</li>
        </ul>
        <p class="muted">Played so far: ${p.played} matches, ${p.won} wins, ${p.stickers.length} stickers.</p>
      </div>
      <div class="card">
        <h2>Start again</h2>
        <p class="muted">This deletes every team, the sticker album, the league, the career and the settings on this device, and puts the controls back to normal. The old save stays in the backup slot until the next reset, so it can be put back from the card above.</p>
        <form class="row" id="pa-reset-form">
          <label class="field"><span>Type RESET to confirm</span><input id="pa-reset-word" autocomplete="off" autocapitalize="characters" spellcheck="false" /></label>
          <button class="btn btn-ghost" id="pa-reset" type="submit" disabled>Reset everything</button>
        </form>
      </div>
    </div>`;
  wire(root, () => router.go({ name: 'menu' }));
  wireSoundSettings(root);
  wireGraphicsSettings(root);
  root.querySelectorAll<HTMLElement>('[data-motion]').forEach((b) => b.addEventListener('click', () => {
    updateSettings({ motion: b.dataset.motion as MotionChoice });
    applyMotionSetting();
    renderParentSettings(root, router);
    root.querySelector<HTMLElement>(`[data-motion="${b.dataset.motion}"]`)?.focus();
  }));
  const note = root.querySelector<HTMLElement>('#pa-save-note')!;
  root.querySelector('#pa-export')!.addEventListener('click', () => {
    const blob = new Blob([exportSave()], { type: 'application/json' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `goal-rush-save-${new Date().toISOString().slice(0, 10)}.json`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    window.setTimeout(() => URL.revokeObjectURL(a.href), 10_000);
    note.textContent = 'Backup file saved. Keep it somewhere safe.';
  });
  const file = root.querySelector<HTMLInputElement>('#pa-import-file')!;
  root.querySelector('#pa-import')!.addEventListener('click', () => file.click());
  file.addEventListener('change', async () => {
    const f = file.files?.[0];
    file.value = '';
    if (!f) return;
    if (f.size > 20 * 1024 * 1024) { alert('That file is too big to be a Goal Rush! save.'); return; }
    if (!confirm('Load this backup? It replaces the save on this device now (which goes to the backup slot, so it can be put back).')) return;
    const result = importSave(await f.text());
    if (!result.ok) { alert(result.reason); return; }
    applySavedSettings();
    router.go({ name: 'menu' });
  });
  root.querySelector('#pa-persist')!.addEventListener('click', async () => {
    note.textContent = (await requestPersistentStorage())
      ? 'This browser will keep the save, even when space runs low.'
      : 'This browser decides for itself when to clear saves. A backup file is the safest way to keep it.';
  });
  root.querySelector('#pa-undo')?.addEventListener('click', () => {
    if (!confirm('Put back the save from before the last reset, repair or loaded file? The save on this device now goes to the backup slot.')) return;
    if (!restoreBackup()) { alert('There is no backup to put back.'); return; }
    applySavedSettings();
    router.go({ name: 'menu' });
  });
  const word = root.querySelector<HTMLInputElement>('#pa-reset-word')!;
  const resetBtn = root.querySelector<HTMLButtonElement>('#pa-reset')!;
  word.addEventListener('input', () => { resetBtn.disabled = word.value.trim().toUpperCase() !== 'RESET'; });
  root.querySelector('#pa-reset-form')!.addEventListener('submit', (e) => {
    e.preventDefault();
    if (word.value.trim().toUpperCase() !== 'RESET') return;
    resetAll();
    resetControls();
    applySavedSettings();
    router.go({ name: 'menu' });
  });
}
