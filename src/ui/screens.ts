import { AGE_STATS } from '../data/ageGroups';
import { BOOT_COLOURS, HAIR_COLOURS, KIT_COLOURS, SKIN_TONES, generateOpponent, makePlayer, makeTeam, randomPlayerName, randomTeamName, shortCode, startingFive } from '../data/defaults';
import { deleteTeam, getLeague, getSettings, getTeam, getTeams, resetAll, saveTeam, setLeague, updateSettings } from '../data/storage';
import { AGE_GROUPS, BADGE_ICONS, BADGE_SHAPES, HAIR_STYLES, KIT_PATTERNS, SPECIALS, type AgeGroup, type BadgeShape, type Difficulty, type HairStyle, type Kit, type Position, type Special, type Team } from '../data/types';
import { kitsClash } from '../game/kitTexture';
import type { MatchResult, SimMode } from '../game/MatchScene';
import { STICKERS, getProgress, lockedIcons, recordSeason, recordTrophy, unlockedIcons, type Sticker } from '../data/progress';
import { TIERS, applyLeagueResult, computeTable, createLeague, nextFixture, nextSeason, seasonOutcome, seasonOver, tierInfo, yourPosition } from '../game/league';
import { applyResult, createTournament, currentFixture, humanStillIn, teamById, type Fixture, type TournamentState } from '../game/tournament';
import { esc } from './hud';
import { badgeSvg, kitChip } from './kitPreview';
import { KitPreview3D } from './preview3d';
import { downloadTeamSheet } from './teamSheet';
import { isNameOk } from '../data/wordFilter';
import { music } from '../game/music';
import { applyMotionSetting } from './motion';
import pkg from '../../package.json';

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
  cpuLevel?: number;
}

export interface Router {
  go(screen: Screen): void;
  startMatch(o: StartOptions): void;
}

export type SetupMode = SimMode | 'tournament' | 'league';

export type Screen =
  | { name: 'menu' }
  | { name: 'teams' }
  | { name: 'builder'; teamId?: string }
  | { name: 'setup'; homeId?: string; mode?: SetupMode }
  | { name: 'results'; result: MatchResult; stickers?: Sticker[]; tournament?: TournamentState; league?: boolean }
  | { name: 'tournament'; state: TournamentState }
  | { name: 'league' }
  | { name: 'album' }
  | { name: 'parents' };

let cleanup: (() => void) | null = null;

export function renderScreen(root: HTMLElement, screen: Screen, router: Router): void {
  cleanup?.();
  cleanup = null;
  root.innerHTML = '';
  root.className = 'screen-root';
  switch (screen.name) {
    case 'menu': return renderMenu(root, router);
    case 'teams': return renderTeams(root, router);
    case 'builder': return renderBuilder(root, router, screen.teamId);
    case 'setup': return renderSetup(root, router, screen.homeId, screen.mode ?? 'match');
    case 'results': return renderResults(root, router, screen.result, screen.stickers ?? [], screen.tournament, screen.league);
    case 'tournament': return renderTournament(root, router, screen.state);
    case 'league': return renderLeague(root, router);
    case 'album': return renderAlbum(root, router);
    case 'parents': return renderParents(root, router);
  }
}

function topBar(title: string): string {
  return `<header class="topbar"><button class="btn btn-back" data-back aria-label="Back">←</button><h1>${esc(title)}</h1></header>`;
}

function wire(root: HTMLElement, back: () => void): void {
  root.querySelector('[data-back]')?.addEventListener('click', back);
}

// ---------- Main menu ----------

function renderMenu(root: HTMLElement, router: Router): void {
  root.innerHTML = `
    <div class="screen menu">
      <div class="logo"><span class="logo-ball">⚽</span><h1>Five-a-Side<br/>Stars</h1><p class="tagline">Build your team. Play the match. Score the winner!</p></div>
      <div class="menu-buttons">
        <button class="btn btn-primary btn-big" id="m-play">⚡ Quick Match</button>
        <div class="menu-row">
          <button class="btn btn-yellow" id="m-cup">🏆 Tournament</button>
          <button class="btn btn-yellow" id="m-league">📋 League${getLeague() ? ` <span class="pill-badge">Tier ${getLeague()!.tier}</span>` : ''}</button>
        </div>
        <div class="menu-row">
          <button class="btn btn-blue" id="m-pens">🥅 Penalties</button>
          <button class="btn btn-blue" id="m-train">🎯 Training</button>
        </div>
        <div class="menu-row">
          <button class="btn btn-ghost" id="m-teams">👕 My Teams</button>
          <button class="btn btn-ghost" id="m-album">📒 Stickers <span class="pill-badge">${getProgress().stickers.length}/${STICKERS.length}</span></button>
        </div>
        <button class="btn btn-ghost" id="m-parents">🛡️ Parents</button>
      </div>
      <p class="hint">Keyboard: arrows or WASD to run · hold Space to shoot · Z pass · Shift sprint · Q switch</p>
      <p class="version">v${pkg.version} · works offline once loaded · no accounts, no adverts</p>
    </div>`;
  root.querySelector('#m-play')!.addEventListener('click', () => router.go({ name: 'setup' }));
  root.querySelector('#m-cup')!.addEventListener('click', () => router.go({ name: 'setup', mode: 'tournament' }));
  root.querySelector('#m-league')!.addEventListener('click', () => router.go(getLeague() ? { name: 'league' } : { name: 'setup', mode: 'league' }));
  root.querySelector('#m-pens')!.addEventListener('click', () => router.go({ name: 'setup', mode: 'shootout' }));
  root.querySelector('#m-train')!.addEventListener('click', () => router.go({ name: 'setup', mode: 'training' }));
  root.querySelector('#m-teams')!.addEventListener('click', () => router.go({ name: 'teams' }));
  root.querySelector('#m-album')!.addEventListener('click', () => router.go({ name: 'album' }));
  root.querySelector('#m-parents')!.addEventListener('click', () => router.go({ name: 'parents' }));
}

// ---------- Teams list ----------

function renderTeams(root: HTMLElement, router: Router): void {
  const teams = getTeams();
  root.innerHTML = `
    <div class="screen">
      ${topBar('My Teams')}
      <div class="team-grid">
        ${teams.map((t) => `
          <div class="card team-card" data-id="${t.id}">
            <div class="team-card-top">${badgeSvg(t.badge, 56)}${kitChip(t.kit, 48)}<span class="chip chip-age">${t.ageGroup}</span></div>
            <h3>${esc(t.name)}</h3>
            <p class="muted">${t.players.length} players: ${t.players.map((p) => esc(p.name)).join(', ')}</p>
            <div class="row">
              <button class="btn btn-primary" data-play="${t.id}">Play</button>
              <button class="btn btn-blue" data-edit="${t.id}">Edit</button>
            </div>
          </div>`).join('')}
        <button class="card team-card team-card-new" id="t-new"><span class="plus">+</span><span>Create Team</span></button>
      </div>
    </div>`;
  wire(root, () => router.go({ name: 'menu' }));
  root.querySelectorAll<HTMLElement>('[data-edit]').forEach((b) => b.addEventListener('click', () => router.go({ name: 'builder', teamId: b.dataset.edit })));
  root.querySelectorAll<HTMLElement>('[data-play]').forEach((b) => b.addEventListener('click', () => router.go({ name: 'setup', homeId: b.dataset.play })));
  root.querySelector('#t-new')!.addEventListener('click', () => router.go({ name: 'builder' }));
}

// ---------- Team builder ----------

function renderBuilder(root: HTMLElement, router: Router, teamId?: string): void {
  const existing = teamId ? getTeam(teamId) : undefined;
  const team: Team = existing ? structuredClone(existing) : makeTeam({ name: randomTeamName(), ageGroup: 'U8' });
  let step: 0 | 1 | 2 = 0;
  let kitTab: 'kit' | 'awayKit' | 'keeperKit' = 'kit';
  let selectedPlayer = 0;
  let preview: KitPreview3D | null = null;

  const render = () => {
    preview?.dispose();
    preview = null;
    const stats = AGE_STATS[team.ageGroup];
    root.innerHTML = `
      <div class="screen builder">
        ${topBar(existing ? 'Edit Team' : 'Create Team')}
        <nav class="steps">
          ${['1. Club', '2. Kits', '3. Squad'].map((s, i) => `<button class="step ${i === step ? 'is-active' : ''}" data-step="${i}">${s}</button>`).join('')}
        </nav>
        <div class="builder-body">
          <div class="builder-form" id="form"></div>
          <div class="builder-preview card">
            <canvas id="preview" class="preview-canvas"></canvas>
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
            ${step < 2 ? '<button class="btn btn-primary" id="b-next">Next →</button>' : '<button class="btn btn-primary" id="b-save">Save team ✓</button>'}
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
      router.go({ name: 'teams' });
    });
    const form = root.querySelector<HTMLElement>('#form')!;
    if (step === 0) renderClub(form);
    else if (step === 1) renderKits(form);
    else renderSquad(form);
    const canvas = root.querySelector<HTMLCanvasElement>('#preview')!;
    const shownPlayer = step === 2 ? team.players[Math.min(selectedPlayer, team.players.length - 1)] : team.players.find((p) => p.position !== 'GK')!;
    const shownKit = step === 1 ? team[kitTab] : shownPlayer.position === 'GK' ? team.keeperKit : team.kit;
    preview = new KitPreview3D(canvas, shownPlayer, shownKit, stats.scale);
  };

  const validate = (): boolean => {
    team.name = team.name.trim() || randomTeamName();
    if (!isNameOk(team.name)) { alert("Let's pick a different team name, that one is not allowed."); step = 0; render(); return false; }
    const rude = team.players.find((p) => !isNameOk(p.name));
    if (rude) { alert(`Let's pick a different name for player #${rude.number}, that one is not allowed.`); step = 2; render(); return false; }
    const starters = team.players.filter((p) => p.starter);
    if (starters.length !== 5) { alert(`Pick exactly 5 starters (you have ${starters.length}). The rest are subs.`); step = 2; render(); return false; }
    if (!starters.some((p) => p.position === 'GK')) { alert('One of your starters must be the keeper.'); step = 2; render(); return false; }
    const nums = new Set<number>();
    for (const p of team.players) {
      p.name = p.name.trim() || randomPlayerName();
      if (nums.has(p.number)) { alert(`Two players have number ${p.number}. Give each player their own number.`); step = 2; render(); return false; }
      nums.add(p.number);
    }
    return true;
  };

  const renderClub = (form: HTMLElement) => {
    form.innerHTML = `
      <label class="field"><span>Team name</span>
        <div class="row"><input id="f-name" maxlength="24" value="${esc(team.name)}" /><button class="btn btn-blue btn-icon" id="f-dice" title="Random name">🎲</button></div>
      </label>
      <div class="field"><span>Age group</span>
        <div class="pills">${AGE_GROUPS.map((a) => `<button class="pill ${a === team.ageGroup ? 'is-active' : ''}" data-age="${a}">${a}</button>`).join('')}</div>
        <p class="muted" id="f-age-blurb">${esc(AGE_STATS[team.ageGroup].label)}: ${esc(AGE_STATS[team.ageGroup].blurb)}</p>
      </div>
      <div class="field"><span>Club badge</span>
        <div class="badge-row">
          <div class="pills">${BADGE_SHAPES.map((sh) => `<button class="pill pill-badge ${team.badge.shape === sh ? 'is-active' : ''}" data-shape="${sh}">${badgeSvg({ ...team.badge, shape: sh }, 36)}</button>`).join('')}</div>
        </div>
        <div class="icon-grid">${[...BADGE_ICONS, ...unlockedIcons()].map((ic) => `<button class="icon-tile ${team.badge.icon === ic ? 'is-active' : ''}" data-icon="${ic}">${ic}</button>`).join('')}${lockedIcons().map((l) => `<button class="icon-tile is-locked" disabled title="Unlock with the ${esc(l.sticker.name)} sticker: ${esc(l.sticker.how)}">${l.icon}<small>🔒</small></button>`).join('')}</div>
        <p class="muted small">🔒 icons unlock when you earn stickers.</p>
        <div class="row">
          <div class="field"><span>Badge colour 1</span><div class="swatches">${KIT_COLOURS.map((c) => `<button class="swatch ${team.badge.colour1 === c ? 'is-active' : ''}" style="background:${c}" data-badge="colour1" data-colour="${c}"></button>`).join('')}</div></div>
        </div>
        <div class="row">
          <div class="field"><span>Badge colour 2</span><div class="swatches">${KIT_COLOURS.map((c) => `<button class="swatch ${team.badge.colour2 === c ? 'is-active' : ''}" style="background:${c}" data-badge="colour2" data-colour="${c}"></button>`).join('')}</div></div>
        </div>
      </div>`;
    const refreshBadge = () => { renderClub(form); const el = root.querySelector('#preview-badge'); if (el) el.innerHTML = badgeSvg(team.badge, 64); const n = form.querySelector<HTMLInputElement>('#f-name'); if (n) n.focus({ preventScroll: true }); };
    form.querySelectorAll<HTMLElement>('[data-shape]').forEach((b) => b.addEventListener('click', () => { team.badge.shape = b.dataset.shape as BadgeShape; refreshBadge(); }));
    form.querySelectorAll<HTMLElement>('[data-icon]').forEach((b) => b.addEventListener('click', () => { team.badge.icon = b.dataset.icon!; refreshBadge(); }));
    form.querySelectorAll<HTMLElement>('[data-badge]').forEach((b) => b.addEventListener('click', () => { team.badge[b.dataset.badge as 'colour1' | 'colour2'] = b.dataset.colour!; refreshBadge(); }));
    const name = form.querySelector<HTMLInputElement>('#f-name')!;
    name.addEventListener('input', () => { team.name = name.value; updateCaption(); });
    form.querySelector('#f-dice')!.addEventListener('click', () => { team.name = randomTeamName(); name.value = team.name; updateCaption(); });
    form.querySelectorAll<HTMLElement>('[data-age]').forEach((b) => b.addEventListener('click', () => { team.ageGroup = b.dataset.age as AgeGroup; render(); }));
  };

  const updateCaption = () => {
    const cap = root.querySelector('.preview-caption strong');
    if (cap) cap.textContent = team.name || 'Your team';
  };

  const renderKits = (form: HTMLElement) => {
    const kit = team[kitTab];
    const swatches = (key: keyof Kit, label: string) => `
      <div class="field"><span>${label}</span>
        <div class="swatches">${KIT_COLOURS.map((c) => `<button class="swatch ${kit[key] === c ? 'is-active' : ''}" style="background:${c}" data-key="${key}" data-colour="${c}" aria-label="${c}"></button>`).join('')}</div>
      </div>`;
    const clashGk = kitsClash(team.kit, team.keeperKit);
    const clashAway = kitsClash(team.kit, team.awayKit);
    form.innerHTML = `
      <div class="tabs">
        <button class="tab ${kitTab === 'kit' ? 'is-active' : ''}" data-tab="kit">Home kit</button>
        <button class="tab ${kitTab === 'awayKit' ? 'is-active' : ''}" data-tab="awayKit">Away kit</button>
        <button class="tab ${kitTab === 'keeperKit' ? 'is-active' : ''}" data-tab="keeperKit">Keeper kit</button>
      </div>
      <div class="field"><span>Pattern</span>
        <div class="patterns">${KIT_PATTERNS.map((p) => `<button class="pattern-tile ${kit.pattern === p ? 'is-active' : ''}" data-pattern="${p}">${kitChip({ ...kit, pattern: p }, 44)}<small>${p}</small></button>`).join('')}</div>
      </div>
      ${swatches('shirt', 'Shirt')}
      ${swatches('shirt2', 'Second colour')}
      ${swatches('shorts', 'Shorts')}
      ${swatches('socks', 'Socks')}
      ${clashGk ? '<p class="warn">⚠️ The keeper kit looks a lot like the home kit. Pick a different shirt colour so the keeper stands out.</p>' : ''}
      ${clashAway ? '<p class="warn">⚠️ The away kit looks a lot like the home kit. The away kit is used when two teams clash, so make it different.</p>' : ''}`;
    form.querySelectorAll<HTMLElement>('[data-tab]').forEach((b) => b.addEventListener('click', () => { kitTab = b.dataset.tab as 'kit' | 'awayKit' | 'keeperKit'; render(); }));
    form.querySelectorAll<HTMLElement>('[data-pattern]').forEach((b) => b.addEventListener('click', () => { kit.pattern = b.dataset.pattern as Kit['pattern']; refreshKit(form); }));
    form.querySelectorAll<HTMLElement>('[data-colour]').forEach((b) => b.addEventListener('click', () => { (kit as unknown as Record<string, string>)[b.dataset.key!] = b.dataset.colour!; refreshKit(form); }));
  };

  const refreshKit = (form: HTMLElement) => {
    const kit = team[kitTab];
    const num = team.players.find((p) => (kitTab === 'keeperKit' ? p.position === 'GK' : p.position !== 'GK'))?.number ?? 7;
    preview?.setKit(kit, num);
    // Re-render just the form so the active states update without rebuilding the 3D view.
    renderKits(form);
  };

  const renderSquad = (form: HTMLElement) => {
    selectedPlayer = Math.min(selectedPlayer, team.players.length - 1);
    const p = team.players[selectedPlayer];
    const taken = new Set(team.players.filter((x) => x !== p).map((x) => x.number));
    const starters = team.players.filter((x) => x.starter).length;
    form.innerHTML = `
      <p class="muted">Squad of ${team.players.length} (5 to 8). Starters: ${starters} of 5. Tap a player to edit them.</p>
      <div class="squad-row squad-row-${team.players.length > 5 ? 'wide' : 'five'}">
        ${team.players.map((pl, i) => `
          <button class="player-card ${i === selectedPlayer ? 'is-active' : ''} ${pl.starter ? '' : 'is-sub'}" data-player="${i}">
            ${kitChip(pl.position === 'GK' ? team.keeperKit : team.kit, 40)}
            <span class="pc-number">${pl.number}</span>
            <span class="pc-name">${esc(pl.name)}</span>
            <span class="chip chip-pos chip-${pl.position.toLowerCase()}">${pl.position === 'GK' ? 'Keeper' : pl.position === 'DEF' ? 'Defender' : 'Attacker'}</span>
            ${pl.starter ? '' : '<span class="chip chip-sub">Sub</span>'}
          </button>`).join('')}
        ${team.players.length < 8 ? '<button class="player-card player-card-add" id="p-add"><span class="plus">+</span><span>Add player</span></button>' : ''}
      </div>
      <div class="card player-edit">
        <div class="row space-between">
          <label class="toggle"><input type="checkbox" id="p-starter" ${p.starter ? 'checked' : ''}/> Starts the match</label>
          ${team.players.length > 5 ? '<button class="btn btn-ghost" id="p-remove">Remove player</button>' : ''}
        </div>
        <label class="field"><span>Name</span><div class="row"><input id="p-name" maxlength="14" value="${esc(p.name)}" /><button class="btn btn-blue btn-icon" id="p-dice" title="Random name">🎲</button></div></label>
        <div class="field"><span>Shirt number</span>
          <div class="row"><button class="btn btn-ghost btn-icon" id="p-num-down">−</button><input id="p-num" type="number" min="1" max="99" value="${p.number}" /><button class="btn btn-ghost btn-icon" id="p-num-up">+</button></div>
          <p class="muted">Taken: ${[...taken].sort((a, b) => a - b).join(', ')}</p>
        </div>
        <div class="field"><span>Position</span>
          <div class="pills">${(['GK', 'DEF', 'ATT'] as Position[]).map((pos) => `<button class="pill ${p.position === pos ? 'is-active' : ''}" data-pos="${pos}">${pos === 'GK' ? 'Keeper' : pos === 'DEF' ? 'Defender' : 'Attacker'}</button>`).join('')}</div>
        </div>
        <div class="field"><span>Special</span>
          <div class="pills">${SPECIALS.map((sp) => `<button class="pill ${p.special === sp.id ? 'is-active' : ''}" data-special="${sp.id}" title="${esc(sp.blurb)}">${sp.label}</button>`).join('')}</div>
        </div>
        <div class="field"><span>Skin</span><div class="swatches">${SKIN_TONES.map((c) => `<button class="swatch round ${p.skin === c ? 'is-active' : ''}" style="background:${c}" data-skin="${c}"></button>`).join('')}</div></div>
        <div class="field"><span>Hair style</span><div class="pills">${HAIR_STYLES.map((h) => `<button class="pill ${p.hairStyle === h ? 'is-active' : ''}" data-hairstyle="${h}">${h[0].toUpperCase() + h.slice(1)}</button>`).join('')}</div></div>
        <div class="field"><span>Hair colour</span><div class="swatches">${HAIR_COLOURS.map((c) => `<button class="swatch round ${p.hair === c ? 'is-active' : ''}" style="background:${c}" data-hair="${c}"></button>`).join('')}</div></div>
        <div class="field"><span>Boots</span><div class="swatches">${BOOT_COLOURS.map((c) => `<button class="swatch ${p.boots === c ? 'is-active' : ''}" style="background:${c}" data-boots="${c}"></button>`).join('')}</div></div>
      </div>`;
    form.querySelector('#p-add')?.addEventListener('click', () => {
      const used = new Set(team.players.map((x) => x.number));
      let n = 2; while (used.has(n)) n++;
      team.players.push(makePlayer(team.players.length % 2 ? 'DEF' : 'ATT', n, randomPlayerName(), false));
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
    form.querySelectorAll<HTMLElement>('[data-hairstyle]').forEach((b) => b.addEventListener('click', () => { p.hairStyle = b.dataset.hairstyle as HairStyle; preview?.setLook(p.skin, p.hair, p.hairStyle, p.boots); renderSquad(form); }));
    form.querySelectorAll<HTMLElement>('[data-boots]').forEach((b) => b.addEventListener('click', () => { p.boots = b.dataset.boots!; preview?.setLook(p.skin, p.hair, p.hairStyle, p.boots); renderSquad(form); }));
    form.querySelectorAll<HTMLElement>('[data-player]').forEach((b) => b.addEventListener('click', () => { selectedPlayer = Number(b.dataset.player); render(); }));
    const nameEl = form.querySelector<HTMLInputElement>('#p-name')!;
    nameEl.addEventListener('input', () => { p.name = nameEl.value; form.querySelectorAll('.pc-name')[selectedPlayer].textContent = p.name; });
    form.querySelector('#p-dice')!.addEventListener('click', () => { p.name = randomPlayerName(); nameEl.value = p.name; form.querySelectorAll('.pc-name')[selectedPlayer].textContent = p.name; });
    const numEl = form.querySelector<HTMLInputElement>('#p-num')!;
    const setNum = (n: number) => {
      n = Math.max(1, Math.min(99, Math.round(n) || 1));
      p.number = n;
      numEl.value = String(n);
      form.querySelectorAll('.pc-number')[selectedPlayer].textContent = String(n);
      numEl.classList.toggle('is-invalid', taken.has(n));
      preview?.setKit(p.position === 'GK' ? team.keeperKit : team.kit, n);
    };
    numEl.addEventListener('input', () => setNum(Number(numEl.value)));
    form.querySelector('#p-num-down')!.addEventListener('click', () => setNum(p.number - 1));
    form.querySelector('#p-num-up')!.addEventListener('click', () => setNum(p.number + 1));
    form.querySelectorAll<HTMLElement>('[data-pos]').forEach((b) => b.addEventListener('click', () => {
      const pos = b.dataset.pos as Position;
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
      render();
    }));
    form.querySelectorAll<HTMLElement>('[data-skin]').forEach((b) => b.addEventListener('click', () => { p.skin = b.dataset.skin!; preview?.setLook(p.skin, p.hair); renderSquad(form); }));
    form.querySelectorAll<HTMLElement>('[data-hair]').forEach((b) => b.addEventListener('click', () => { p.hair = b.dataset.hair!; preview?.setLook(p.skin, p.hair); renderSquad(form); }));
  };

  render();
  cleanup = () => { preview?.dispose(); preview = null; };
}

// ---------- Match setup ----------

const MODE_INFO: Record<SetupMode, { title: string; go: string; blurb: string }> = {
  match: { title: 'Match Setup', go: '⚽ Kick Off!', blurb: '' },
  tournament: { title: 'Tournament', go: '🏆 Start the cup!', blurb: 'Four teams, two semi-finals and a final. Win both of your games to lift the trophy. Draws go to penalties!' },
  shootout: { title: 'Penalty Shoot-out', go: '🥅 Start the shoot-out!', blurb: 'Best of five penalties each, then sudden death. Hold shoot to power up and aim with the stick. In goal, move to dive!' },
  training: { title: 'Shooting Training', go: '🎯 Start training!', blurb: 'Just you, a keeper and a bag of balls. Score as many as you can before the time runs out. Rocket shots count double!' },
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
  const hasKeyboard = window.matchMedia('(pointer: fine)').matches && mode !== 'training' && mode !== 'league';
  const info = MODE_INFO[mode];
  const lengthLabel = mode === 'training' ? 'Time' : mode === 'shootout' ? '' : 'Half length';
  const lengths = mode === 'training' ? [60, 90, 120, 180] : [60, 120, 180, 300];

  const render = () => {
    const away = opponentId === 'cpu' ? cpu : getTeam(opponentId) ?? cpu;
    const sameAge = teams.filter((t) => t.id !== home.id && t.ageGroup === home.ageGroup);
    const [homeK, awayK, swapped] = resolveKits(home, away);
    root.innerHTML = `
      <div class="screen setup">
        ${topBar(info.title)}
        ${info.blurb ? `<p class="mode-blurb">${esc(info.blurb)}</p>` : ''}
        <div class="vs ${mode === 'training' || mode === 'tournament' || mode === 'league' ? 'vs-solo' : ''}">
          <div class="card vs-card">
            <span class="muted">Your team</span>
            <div class="row">${badgeSvg(home.badge, 64)}${kitChip(homeK.kit, 64)}</div>
            <h3>${esc(home.name)}</h3>
            <span class="chip chip-age">${home.ageGroup}</span>
            <select id="s-home">${teams.map((t) => `<option value="${t.id}" ${t.id === home.id ? 'selected' : ''}>${esc(t.name)} (${t.ageGroup})</option>`).join('')}</select>
          </div>
          ${mode === 'training' || mode === 'league' ? '' : mode === 'tournament' ? `<div class="vs-mid">+</div><div class="card vs-card"><span class="muted">${twoPlayer ? 'Player 2 and two more teams' : 'Three computer teams'}</span><div class="row cup-marks">🛡️ 🛡️ 🛡️</div><h3>${twoPlayer ? `${esc(away.name)} + 2 surprise teams` : 'Surprise opponents'}</h3><span class="chip chip-age">${home.ageGroup}</span>${twoPlayer ? `<select id="s-away">${sameAge.map((t) => `<option value="${t.id}" ${t.id === opponentId ? 'selected' : ''}>${esc(t.name)}</option>`).join('')}</select>` : ''}</div>` : `<div class="vs-mid">VS</div>
          <div class="card vs-card">
            <span class="muted">${twoPlayer ? 'Player 2' : 'Opponent (computer)'}</span>
            <div class="row">${badgeSvg(away.badge, 64)}${kitChip(awayK.kit, 64)}</div>
            <h3>${esc(away.name)}</h3>
            <span class="chip chip-age">${away.ageGroup}</span>
            <select id="s-away">
              <option value="cpu" ${opponentId === 'cpu' ? 'selected' : ''}>Random ${home.ageGroup} team</option>
              ${sameAge.map((t) => `<option value="${t.id}" ${t.id === opponentId ? 'selected' : ''}>${esc(t.name)}</option>`).join('')}
            </select>
            <button class="btn btn-ghost" id="s-reroll">🎲 New opponent</button>
          </div>`}
        </div>
        <div class="card options">
          ${hasKeyboard ? `<div class="field"><span>Players</span>
            <div class="pills"><button class="pill ${!twoPlayer ? 'is-active' : ''}" data-players="1">1 player</button><button class="pill ${twoPlayer ? 'is-active' : ''}" data-players="2">2 players, one keyboard</button></div>
            ${twoPlayer ? '<p class="muted">Player 1: WASD, Space, Z, left Shift. Player 2: arrows, Enter, /, right Shift.</p>' : ''}
          </div>` : ''}
          ${mode === 'league' ? `<div class="field"><span>Tiers</span><ol class="tier-list">${TIERS.map((t) => `<li><strong>Tier ${t.tier}</strong> ${esc(t.name)}</li>`).join('')}</ol></div>` : `<div class="field"><span>Computer difficulty</span>
            <div class="pills">${(['easy', 'normal', 'hard'] as Difficulty[]).map((d) => `<button class="pill ${d === difficulty ? 'is-active' : ''}" data-diff="${d}">${d[0].toUpperCase() + d.slice(1)}</button>`).join('')}</div>
          </div>`}
          ${lengthLabel ? `<div class="field"><span>${lengthLabel}</span>
            <div class="pills">${lengths.map((s) => `<button class="pill ${s === halfSeconds ? 'is-active' : ''}" data-len="${s}">${s >= 60 && s % 60 === 0 ? `${s / 60} min` : `${s} s`}</button>`).join('')}</div>
          </div>` : ''}
        </div>
        ${swapped && mode !== 'training' && mode !== 'tournament' && mode !== 'league' ? `<p class="warn">👕 The kits clash, so ${esc(swapped)} will wear their away kit.</p>` : ''}
        <button class="btn btn-primary btn-big btn-kickoff" id="s-go">${info.go}</button>
      </div>`;
    wire(root, () => router.go({ name: 'menu' }));
    root.querySelector<HTMLSelectElement>('#s-home')!.addEventListener('change', (e) => {
      home = getTeam((e.target as HTMLSelectElement).value) ?? home;
      cpu = generateOpponent(home.ageGroup, home.kit);
      opponentId = 'cpu';
      render();
    });
    root.querySelector<HTMLSelectElement>('#s-away')?.addEventListener('change', (e) => { opponentId = (e.target as HTMLSelectElement).value; render(); });
    root.querySelector('#s-reroll')?.addEventListener('click', () => { cpu = generateOpponent(home.ageGroup, home.kit); opponentId = 'cpu'; render(); });
    root.querySelectorAll<HTMLElement>('[data-diff]').forEach((b) => b.addEventListener('click', () => { difficulty = b.dataset.diff as Difficulty; render(); }));
    root.querySelectorAll<HTMLElement>('[data-players]').forEach((b) => b.addEventListener('click', () => {
      twoPlayer = b.dataset.players === '2';
      // A two-player cup needs a second saved team of the same age; pick the first one.
      if (twoPlayer && mode === 'tournament' && opponentId === 'cpu') opponentId = sameAge[0]?.id ?? 'cpu';
      if (twoPlayer && mode === 'tournament' && opponentId === 'cpu') { twoPlayer = false; alert('Make a second team of the same age group first, then you can both play in the cup.'); }
      render();
    }));
    root.querySelectorAll<HTMLElement>('[data-len]').forEach((b) => b.addEventListener('click', () => { halfSeconds = Number(b.dataset.len); render(); }));
    root.querySelector('#s-go')!.addEventListener('click', () => {
      if (mode !== 'training') updateSettings({ difficulty, halfLengthSeconds: halfSeconds });
      const awayTeam = opponentId === 'cpu' ? cpu : getTeam(opponentId) ?? cpu;
      if (mode === 'tournament') {
        const state = createTournament(home, difficulty, halfSeconds, twoPlayer, twoPlayer ? awayTeam : undefined);
        router.go({ name: 'tournament', state });
        return;
      }
      if (mode === 'league') {
        if (getLeague() && !confirm('Start a new league career? Your current league will be deleted.')) return;
        setLeague(createLeague(home, halfSeconds));
        router.go({ name: 'league' });
        return;
      }
      const [h, a] = resolveKits(home, awayTeam);
      router.startMatch({ home: h, away: a, difficulty, halfSeconds, twoPlayer, mode: mode === 'training' ? 'training' : mode === 'shootout' ? 'shootout' : 'match' });
    });
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

function renderResults(root: HTMLElement, router: Router, r: MatchResult, stickers: Sticker[], tournament?: TournamentState, league?: boolean): void {
  const [h, a] = r.score;
  if (tournament) applyResult(tournament, r);
  let leagueNote = '';
  if (league) {
    const ls = getLeague();
    const you = ls && getTeam(ls.teamId);
    if (ls && you) {
      applyLeagueResult(ls, you, r);
      setLeague(ls);
      leagueNote = `<p class="muted">${esc(tierInfo(ls.tier).name)} · round ${Math.min(ls.round, ls.rounds.length)} of ${ls.rounds.length} played · you are ${ordinal(yourPosition(ls, you))}</p>`;
    }
  }
  let headline = h === a ? "It's a draw!" : h > a ? `${r.home.name} win!` : `${r.away.name} win!`;
  if (r.mode === 'training') headline = r.trainingPoints >= 10 ? 'Sharp shooting!' : r.trainingPoints >= 5 ? 'Nice work!' : 'Keep practising!';
  if (r.mode === 'shootout') headline = h > a ? `${r.home.name} win the shoot-out!` : `${r.away.name} win the shoot-out!`;
  if (tournament && h === a && r.mode === 'match') headline = 'All square! Penalties decide it.';
  const motm = r.mode === 'match' ? pickPlayerOfTheMatch(r) : null;
  const best = getProgress().trainingBest;
  const soLen = r.shootout ? Math.max(5, r.shootout[0].length, r.shootout[1].length) : 0;
  root.innerHTML = `
    <div class="screen results">
      ${topBar(r.mode === 'training' ? 'Training over' : r.mode === 'shootout' ? 'Shoot-out over' : 'Full Time')}
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
        ${stickerBanner(stickers)}
        <div class="row">
          ${tournament ? `<button class="btn btn-primary btn-big" id="r-cup">${tournament.needsShootout ? '🥅 Penalty shoot-out!' : '🏆 Back to the cup'}</button>` : league ? '<button class="btn btn-primary btn-big" id="r-league">📋 Back to the league</button>' : `<button class="btn btn-primary btn-big" id="r-again">Play again</button>`}
          <button class="btn btn-ghost btn-big" id="r-menu">Main menu</button>
        </div>
      </div>
    </div>`;
  wire(root, () => router.go({ name: 'menu' }));
  root.querySelector('#r-again')?.addEventListener('click', () => router.go({ name: 'setup', homeId: r.home.id, mode: r.mode }));
  root.querySelector('#r-cup')?.addEventListener('click', () => {
    if (tournament!.needsShootout) {
      const f = currentFixture(tournament!)!;
      router.startMatch({ home: f.home, away: f.away, difficulty: tournament!.difficulty, halfSeconds: 60, twoPlayer: tournament!.twoPlayer, mode: 'shootout', tournament });
    } else router.go({ name: 'tournament', state: tournament! });
  });
  root.querySelector('#r-league')?.addEventListener('click', () => router.go({ name: 'league' }));
  root.querySelector('#r-menu')!.addEventListener('click', () => router.go({ name: 'menu' }));
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
      ${topBar('League')}
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
                <td>${i + 1}</td><td class="t-name">${badgeSvg(row.team.badge, 22)} ${esc(row.team.name)}</td><td>${row.played}</td><td>${row.won}</td><td>${row.drawn}</td><td>${row.lost}</td><td>${row.gf - row.ga > 0 ? '+' : ''}${row.gf - row.ga}</td><td><strong>${row.points}</strong></td>
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
  root.querySelector('#l-play')?.addEventListener('click', () => {
    const [h, a] = resolveKits(next!.home, next!.away);
    router.startMatch({ home: h, away: a, difficulty: 'normal', halfSeconds: ls.halfSeconds, mode: 'match', league: true, cpuLevel: info.level });
  });
  root.querySelector('#l-next')?.addEventListener('click', () => { setLeague(nextSeason(ls, you)); renderLeague(root, router); });
  root.querySelector('#l-quit')?.addEventListener('click', () => {
    if (confirm('Leave this league? Your table and tier will be deleted.')) { setLeague(null); router.go({ name: 'menu' }); }
  });
}

// ---------- Tournament ----------

function fixtureCard(f: Fixture, label: string, humanId: string): string {
  const side = (t: Team, score: number | null, pens: number | null, won: boolean) => `
    <div class="fx-team ${won ? 'is-winner' : ''} ${t.id === humanId ? 'is-you' : ''}">
      ${badgeSvg(t.badge, 40)}<span class="fx-name">${esc(t.name)}</span>
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
  if (youWon) s.trophyRecorded = true;
  const next = currentFixture(s);
  const nextLabel = s.stage === 'semi' ? '⚽ Play your semi-final' : '⚽ Play the final!';
  root.innerHTML = `
    <div class="screen tournament ${youWon ? 'is-champion' : ''}">
      ${topBar(`${esc(you.ageGroup)} Cup`)}
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
      ${topBar('Sticker Album')}
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

function pickPlayerOfTheMatch(r: MatchResult) {
  const counts = new Map<string, { n: number; p: MatchResult['goals'][number]['scorer'] }>();
  for (const g of r.goals) {
    if (g.ownGoal) continue;
    const e = counts.get(g.scorer.id) ?? { n: 0, p: g.scorer };
    e.n++;
    counts.set(g.scorer.id, e);
  }
  let best: { n: number; p: MatchResult['goals'][number]['scorer'] } | null = null;
  for (const e of counts.values()) if (!best || e.n > best.n) best = e;
  if (best) return best.p;
  // No goals: the home keeper kept a clean sheet.
  return startingFive(r.home).find((p) => p.position === 'GK') ?? null;
}

// ---------- Parents ----------

function renderParents(root: HTMLElement, router: Router): void {
  // A tiny sum keeps little ones out of the grown-up settings.
  const a = 3 + Math.floor(Math.random() * 6), b = 2 + Math.floor(Math.random() * 7);
  root.innerHTML = `
    <div class="screen parents">
      ${topBar('Parents')}
      <div class="card gate-card">
        <h2>Grown-ups only</h2>
        <p class="muted">To open the settings, answer this: what is <strong>${a} × ${b}</strong>?</p>
        <form class="row" id="gate">
          <input type="number" inputmode="numeric" id="gate-answer" placeholder="?" autocomplete="off" />
          <button class="btn btn-primary" type="submit">Open</button>
        </form>
        <p class="warn" id="gate-wrong" hidden>Not quite. Ask a grown-up to help!</p>
      </div>
    </div>`;
  wire(root, () => router.go({ name: 'menu' }));
  const input = root.querySelector<HTMLInputElement>('#gate-answer')!;
  input.focus();
  root.querySelector('#gate')!.addEventListener('submit', (e) => {
    e.preventDefault();
    if (Number(input.value) === a * b) renderParentSettings(root, router);
    else { root.querySelector<HTMLElement>('#gate-wrong')!.hidden = false; input.value = ''; input.focus(); }
  });
}

function renderParentSettings(root: HTMLElement, router: Router): void {
  const s = getSettings();
  const p = getProgress();
  root.innerHTML = `
    <div class="screen parents">
      ${topBar('Parents')}
      <div class="card">
        <h2>Settings</h2>
        <label class="toggle"><input type="checkbox" id="pa-sound" ${s.sound ? 'checked' : ''}/> Sound effects</label>
        <label class="toggle"><input type="checkbox" id="pa-music" ${s.music ? 'checked' : ''}/> Music</label>
        <label class="toggle"><input type="checkbox" id="pa-motion" ${s.reduceMotion ? 'checked' : ''}/> Reduce motion (no confetti or wobbling, calmer animations)</label>
      </div>
      <div class="card">
        <h2>About this game</h2>
        <p class="muted">Five-a-Side Stars is a football game for children aged 7 and up. Players build a team and play short matches against the computer, or against a friend on the same keyboard.</p>
        <ul class="muted plain-list">
          <li><strong>Privacy:</strong> nothing leaves this device. There are no accounts, no chat, no adverts, no in-app purchases and no tracking. Teams, settings and stickers are saved in this browser's local storage only.</li>
          <li><strong>Names:</strong> children type their own team and player names. A small word filter blocks the obvious rude words; nothing is shared with anyone.</li>
          <li><strong>Offline:</strong> once loaded, the game keeps working without an internet connection. On a phone or tablet you can add it to the home screen.</li>
          <li><strong>Play time:</strong> a match lasts two to ten minutes depending on the half length chosen on the setup screen.</li>
        </ul>
        <p class="muted">Played so far: ${p.played} matches, ${p.won} wins, ${p.stickers.length} stickers.</p>
      </div>
      <div class="card">
        <h2>Start again</h2>
        <p class="muted">This deletes every team, the sticker album and the settings on this device. It cannot be undone.</p>
        <button class="btn btn-ghost" id="pa-reset">Reset everything</button>
      </div>
    </div>`;
  wire(root, () => router.go({ name: 'menu' }));
  root.querySelector<HTMLInputElement>('#pa-sound')!.addEventListener('change', (e) => updateSettings({ sound: (e.target as HTMLInputElement).checked }));
  root.querySelector<HTMLInputElement>('#pa-music')!.addEventListener('change', (e) => { updateSettings({ music: (e.target as HTMLInputElement).checked }); music.refresh(); });
  root.querySelector<HTMLInputElement>('#pa-motion')!.addEventListener('change', (e) => { updateSettings({ reduceMotion: (e.target as HTMLInputElement).checked }); applyMotionSetting(); });
  root.querySelector('#pa-reset')!.addEventListener('click', () => {
    if (confirm('Delete every team, sticker and setting on this device and start again?')) { resetAll(); music.refresh(); router.go({ name: 'menu' }); }
  });
  void deleteTeam;
}
