import { AGE_STATS } from '../data/ageGroups';
import { BOOT_COLOURS, HAIR_COLOURS, KIT_COLOURS, SKIN_TONES, generateOpponent, makePlayer, makeTeam, randomPlayerName, randomTeamName, shortCode, startingFive } from '../data/defaults';
import { deleteTeam, getSettings, getTeam, getTeams, resetAll, saveTeam, updateSettings } from '../data/storage';
import { AGE_GROUPS, BADGE_ICONS, BADGE_SHAPES, HAIR_STYLES, KIT_PATTERNS, SPECIALS, type AgeGroup, type BadgeShape, type Difficulty, type HairStyle, type Kit, type Position, type Special, type Team } from '../data/types';
import { kitsClash } from '../game/kitTexture';
import type { MatchResult } from '../game/MatchScene';
import { esc } from './hud';
import { badgeSvg, kitChip } from './kitPreview';
import { KitPreview3D } from './preview3d';

export interface Router {
  go(screen: Screen): void;
  startMatch(home: Team, away: Team, difficulty: Difficulty, halfSeconds: number): void;
}

export type Screen =
  | { name: 'menu' }
  | { name: 'teams' }
  | { name: 'builder'; teamId?: string }
  | { name: 'setup'; homeId?: string }
  | { name: 'results'; result: MatchResult }
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
    case 'setup': return renderSetup(root, router, screen.homeId);
    case 'results': return renderResults(root, router, screen.result);
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
        <button class="btn btn-blue btn-big" id="m-teams">👕 My Teams</button>
        <button class="btn btn-ghost btn-big" id="m-parents">🛡️ Parents</button>
      </div>
      <p class="hint">Keyboard: arrows or WASD to run · Space shoot · Z pass · Shift sprint · Q switch</p>
    </div>`;
  root.querySelector('#m-play')!.addEventListener('click', () => router.go({ name: 'setup' }));
  root.querySelector('#m-teams')!.addEventListener('click', () => router.go({ name: 'teams' }));
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
          ${step < 2 ? '<button class="btn btn-primary" id="b-next">Next →</button>' : '<button class="btn btn-primary" id="b-save">Save team ✓</button>'}
        </footer>
      </div>`;
    wire(root, () => router.go({ name: 'teams' }));
    root.querySelectorAll<HTMLElement>('[data-step]').forEach((b) => b.addEventListener('click', () => { step = Number(b.dataset.step) as 0 | 1 | 2; render(); }));
    root.querySelector('#b-prev')?.addEventListener('click', () => { step = (step - 1) as 0 | 1 | 2; render(); });
    root.querySelector('#b-next')?.addEventListener('click', () => { if (validate()) { step = (step + 1) as 0 | 1 | 2; render(); } });
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
        <div class="icon-grid">${BADGE_ICONS.map((ic) => `<button class="icon-tile ${team.badge.icon === ic ? 'is-active' : ''}" data-icon="${ic}">${ic}</button>`).join('')}</div>
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

function renderSetup(root: HTMLElement, router: Router, homeId?: string): void {
  const teams = getTeams();
  const settings = getSettings();
  let home = (homeId && getTeam(homeId)) || teams[0];
  let opponentId: string | 'cpu' = 'cpu';
  let cpu = generateOpponent(home.ageGroup, home.kit);
  let difficulty: Difficulty = settings.difficulty;
  let halfSeconds = settings.halfLengthSeconds;

  const render = () => {
    const away = opponentId === 'cpu' ? cpu : getTeam(opponentId) ?? cpu;
    const sameAge = teams.filter((t) => t.id !== home.id && t.ageGroup === home.ageGroup);
    const [homeK, awayK, swapped] = resolveKits(home, away);
    root.innerHTML = `
      <div class="screen setup">
        ${topBar('Match Setup')}
        <div class="vs">
          <div class="card vs-card">
            <span class="muted">Your team</span>
            <div class="row">${badgeSvg(home.badge, 64)}${kitChip(homeK.kit, 64)}</div>
            <h3>${esc(home.name)}</h3>
            <span class="chip chip-age">${home.ageGroup}</span>
            <select id="s-home">${teams.map((t) => `<option value="${t.id}" ${t.id === home.id ? 'selected' : ''}>${esc(t.name)} (${t.ageGroup})</option>`).join('')}</select>
          </div>
          <div class="vs-mid">VS</div>
          <div class="card vs-card">
            <span class="muted">Opponent (computer)</span>
            <div class="row">${badgeSvg(away.badge, 64)}${kitChip(awayK.kit, 64)}</div>
            <h3>${esc(away.name)}</h3>
            <span class="chip chip-age">${away.ageGroup}</span>
            <select id="s-away">
              <option value="cpu" ${opponentId === 'cpu' ? 'selected' : ''}>Random ${home.ageGroup} team</option>
              ${sameAge.map((t) => `<option value="${t.id}" ${t.id === opponentId ? 'selected' : ''}>${esc(t.name)}</option>`).join('')}
            </select>
            <button class="btn btn-ghost" id="s-reroll">🎲 New opponent</button>
          </div>
        </div>
        <div class="card options">
          <div class="field"><span>Computer difficulty</span>
            <div class="pills">${(['easy', 'normal', 'hard'] as Difficulty[]).map((d) => `<button class="pill ${d === difficulty ? 'is-active' : ''}" data-diff="${d}">${d[0].toUpperCase() + d.slice(1)}</button>`).join('')}</div>
          </div>
          <div class="field"><span>Half length</span>
            <div class="pills">${[60, 120, 180, 300].map((s) => `<button class="pill ${s === halfSeconds ? 'is-active' : ''}" data-len="${s}">${s / 60} min</button>`).join('')}</div>
          </div>
        </div>
        ${swapped ? `<p class="warn">👕 The kits clash, so ${esc(swapped)} will wear their away kit.</p>` : ''}
        <button class="btn btn-primary btn-big btn-kickoff" id="s-go">⚽ Kick Off!</button>
      </div>`;
    wire(root, () => router.go({ name: 'menu' }));
    root.querySelector<HTMLSelectElement>('#s-home')!.addEventListener('change', (e) => {
      home = getTeam((e.target as HTMLSelectElement).value) ?? home;
      cpu = generateOpponent(home.ageGroup, home.kit);
      opponentId = 'cpu';
      render();
    });
    root.querySelector<HTMLSelectElement>('#s-away')!.addEventListener('change', (e) => { opponentId = (e.target as HTMLSelectElement).value; render(); });
    root.querySelector('#s-reroll')!.addEventListener('click', () => { cpu = generateOpponent(home.ageGroup, home.kit); opponentId = 'cpu'; render(); });
    root.querySelectorAll<HTMLElement>('[data-diff]').forEach((b) => b.addEventListener('click', () => { difficulty = b.dataset.diff as Difficulty; render(); }));
    root.querySelectorAll<HTMLElement>('[data-len]').forEach((b) => b.addEventListener('click', () => { halfSeconds = Number(b.dataset.len); render(); }));
    root.querySelector('#s-go')!.addEventListener('click', () => {
      updateSettings({ difficulty, halfLengthSeconds: halfSeconds });
      const awayTeam = opponentId === 'cpu' ? cpu : getTeam(opponentId) ?? cpu;
      const [h, a] = resolveKits(home, awayTeam);
      router.startMatch(h, a, difficulty, halfSeconds);
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

function renderResults(root: HTMLElement, router: Router, r: MatchResult): void {
  const [h, a] = r.score;
  const headline = h === a ? "It's a draw!" : h > a ? `${r.home.name} win!` : `${r.away.name} win!`;
  const motm = pickPlayerOfTheMatch(r);
  root.innerHTML = `
    <div class="screen results">
      ${topBar('Full Time')}
      <div class="card results-card">
        <h2>${esc(headline)}</h2>
        <div class="result-line">
          <div class="result-team">${badgeSvg(r.home.badge, 64)}<span>${esc(r.home.name)}</span></div>
          <div class="score-big">${h} – ${a}</div>
          <div class="result-team">${badgeSvg(r.away.badge, 64)}<span>${esc(r.away.name)}</span></div>
        </div>
        <ul class="goals-list">
          ${r.goals.length === 0 ? '<li class="muted">No goals this time. The keepers were on fire!</li>' : ''}
          ${r.goals.map((g) => `<li>${g.side === 0 ? '⚽ ' : ''}<strong>${esc(g.scorer.name)}</strong> #${g.scorer.number}${g.ownGoal ? ' (og)' : ''} <span class="muted">${g.minute}'</span>${g.side === 1 ? ' ⚽' : ''}</li>`).join('')}
        </ul>
        ${motm ? `<div class="motm">🏆 Player of the match: <strong>${esc(motm.name)}</strong> #${motm.number}</div>` : ''}
        <div class="row">
          <button class="btn btn-primary btn-big" id="r-again">Play again</button>
          <button class="btn btn-ghost btn-big" id="r-menu">Main menu</button>
        </div>
      </div>
    </div>`;
  wire(root, () => router.go({ name: 'menu' }));
  root.querySelector('#r-again')!.addEventListener('click', () => router.go({ name: 'setup', homeId: r.home.id }));
  root.querySelector('#r-menu')!.addEventListener('click', () => router.go({ name: 'menu' }));
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
  const s = getSettings();
  root.innerHTML = `
    <div class="screen parents">
      ${topBar('Parents')}
      <div class="card">
        <label class="toggle"><input type="checkbox" id="pa-sound" ${s.sound ? 'checked' : ''}/> Sound effects</label>
        <p class="muted">Everything in this game stays on this device. There are no accounts, no chat, no adverts and nothing to buy. Teams are saved in this browser only.</p>
        <button class="btn btn-ghost" id="pa-reset">Reset all teams and settings</button>
      </div>
    </div>`;
  wire(root, () => router.go({ name: 'menu' }));
  root.querySelector<HTMLInputElement>('#pa-sound')!.addEventListener('change', (e) => updateSettings({ sound: (e.target as HTMLInputElement).checked }));
  root.querySelector('#pa-reset')!.addEventListener('click', () => {
    if (confirm('Delete every team you have made and start again?')) { resetAll(); router.go({ name: 'menu' }); }
  });
  void deleteTeam;
}
