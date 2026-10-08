import { AGE_STATS } from '../../data/ageGroups';
import { BOOT_COLOURS, HAIR_COLOURS, KIT_COLOURS, SKIN_TONES, makePlayer, makeTeam, randomPlayerName, randomTeamName, shortCode } from '../../data/defaults';
import { getLeague, getTeam, saveTeam } from '../../data/storage';
import { AGE_GROUPS, BADGE_ICONS, BADGE_SHAPES, BOOT_STYLES, BOOT_STYLE_LABELS, BUILDS, GENDERS, HAIR_STYLES, HAIR_STYLE_LABELS, KIT_PATTERNS, POSITIONS, POSITION_LABELS, SPECIALS, type AgeGroup, type BadgeShape, type BootStyle, type Build, type FormationId, type Gender, type HairStyle, type Kit, type Position, type SkillKey, type Special, type Team } from '../../data/types';
import { STAR_BUDGET, STAR_CAP, fitSkills, randomSkills, skillKeys, skillLabel, starsLeft, starsText, totalStars } from '../../data/skills';
import { kitsClash } from '../../game/kitTexture';
import { FORMATIONS, applyFormation, assignSlots, canPlay, formationById, formationFor, setPosition, swapPlayers } from '../../data/formations';
import { wireDragSwap } from '../dragSwap';
import { contrastColour } from '../../game/playerAtlas';
import { lockedIcons, unlockedIcons } from '../../data/progress';
import { esc } from '../hud';
import { badgeSvg, kitChip } from '../kitPreview';
import { KitPreview3D } from '../preview3d';
import { downloadTeamSheet } from '../teamSheet';
import { logoControls, wireLogoControls } from '../logoUpload';
import { isNameOk } from '../../data/wordFilter';
import { askConfirm, openPop, showNotice } from '../dialog';
import { colourName } from '../colourNames';
import { state, topBar, wire, pressed, focusKey, restoreFocus } from './shared';
import type { Router } from '../screens';

const BADGE_SHAPE_LABELS: Record<BadgeShape, string> = { shield: 'Shield', circle: 'Circle', diamond: 'Diamond', hex: 'Hexagon' };

export function renderBuilder(root: HTMLElement, router: Router, teamId?: string): void {
  const existing = teamId ? getTeam(teamId) : undefined;
  const team: Team = existing ? structuredClone(existing) : makeTeam({ name: randomTeamName(), ageGroup: 'U8' });
  for (const p of team.players) p.skills = fitSkills(p, team.ageGroup, !team.career);
  // Leaving with unsaved changes asks first (the back pill, Esc, the phone's Back button and the top tabs all come here).
  const saved = JSON.stringify(team);
  state.leaveGuard = async () => {
    if (JSON.stringify(team) === saved) return true;
    const choice = await openPop<'leave' | 'save' | 'stay'>({
      icon: '⚠️', tone: 'warn', title: 'Leave without saving?', body: 'Your changes to this team will be lost.',
      buttons: [{ label: 'Leave without saving', value: 'leave', kind: 'ghost' }, { label: 'Save and leave', value: 'save', kind: 'primary' }, { label: 'Stay', value: 'stay', kind: 'ghost' }],
      focus: 2, cancel: 'stay',
    });
    if (choice === 'save') return save();
    return choice === 'leave';
  };
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
      try { await downloadTeamSheet({ ...team, short: shortCode(team.name) }); } catch { void showNotice({ icon: '😕', title: 'No team sheet this time', body: 'Sorry, the team sheet could not be made on this device.' }); }
      btn.disabled = false; btn.textContent = '🖨️ Team sheet';
    });
    root.querySelector('#b-save')?.addEventListener('click', () => { if (save()) router.go({ name: 'teams' }); });
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

  /** Check and save the team. False (with a box saying what to fix) when it isn't ready yet. */
  const save = (): boolean => {
    if (!validate()) return false;
    team.short = shortCode(team.name);
    saveTeam(team);
    state.leaveGuard = null;
    return true;
  };

  /** Go to the step (and player) to fix, then say what is wrong. */
  const oops = (title: string, body: string, at: 0 | 2, player?: number): false => {
    step = at;
    if (player !== undefined && player >= 0) selectedPlayer = player;
    render();
    void showNotice({ title, body, ok: "OK, I'll fix it" });
    return false;
  };

  const validate = (): boolean => {
    team.name = team.name.trim() || randomTeamName(team.kit.shirt);
    if (!isNameOk(team.name)) return oops('Pick another team name', "Let's pick a different team name, that one is not allowed.", 0);
    const rude = team.players.findIndex((p) => !isNameOk(p.name));
    if (rude >= 0) return oops('Pick another name', `Let's pick a different name for player #${team.players[rude].number}, that one is not allowed.`, 2, rude);
    const starters = team.players.filter((p) => p.starter);
    if (starters.length !== 5) return oops('Pick 5 starters', `Pick exactly 5 starters (you have ${starters.length}). The rest are subs.`, 2);
    const keepers = starters.filter((p) => p.position === 'GK').length;
    if (!keepers) return oops('Who is in goal?', 'One of your starters must be the keeper.', 2);
    if (keepers > 1) return oops('Too many keepers', 'Only one keeper can start. Make the other keeper a sub.', 2, team.players.findIndex((p) => p.starter && p.position === 'GK'));
    if (!team.career) {
      const greedy = team.players.findIndex((p) => starsLeft(p.skills, team.ageGroup, p.position) < 0);
      if (greedy >= 0) {
        const g = team.players[greedy];
        return oops('Too many stars', `${g.name} has ${-starsLeft(g.skills, team.ageGroup, g.position)} too many stars for the ${AGE_STATS[team.ageGroup].label}. Take some off.`, 2, greedy);
      }
    }
    const nums = new Set<number>();
    for (const [i, p] of team.players.entries()) {
      p.name = p.name.trim() || randomPlayerName(p.gender);
      if (nums.has(p.number)) return oops('Same shirt number', `Two players have number ${p.number}. Give each player their own number.`, 2, i);
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
    form.querySelector('#f-dice')!.addEventListener('click', () => { team.name = randomTeamName(team.kit.shirt); name.value = team.name; updateCaption(); });
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
        <div class="field"><span>Boy or girl</span><div class="pills">${GENDERS.map((g) => `<button class="pill ${p.gender === g ? 'is-active' : ''}" data-gender="${g}" ${pressed(p.gender === g)}>${g === 'boy' ? '👦 Boy' : '👧 Girl'}</button>`).join('')}</div></div>
        <div class="field"><span>Hair style</span><div class="pills">${HAIR_STYLES.map((h) => `<button class="pill ${p.hairStyle === h ? 'is-active' : ''}" data-hairstyle="${h}" ${pressed(p.hairStyle === h)}>${HAIR_STYLE_LABELS[h]}</button>`).join('')}</div></div>
        <div class="field"><span>Build</span><div class="pills">${BUILDS.map((b) => `<button class="pill ${(p.build ?? 'regular') === b ? 'is-active' : ''}" data-build="${b}" ${pressed((p.build ?? 'regular') === b)}>${b[0].toUpperCase() + b.slice(1)}</button>`).join('')}</div></div>
        <div class="field"><span>Hair colour</span><div class="swatches">${HAIR_COLOURS.map((c) => `<button class="swatch round ${p.hair === c ? 'is-active' : ''}" style="background:${c}" data-hair="${c}" aria-label="Hair: ${colourName(c)}" ${pressed(p.hair === c)}></button>`).join('')}</div></div>
        <div class="field"><span>Boots</span><div class="swatches">${BOOT_COLOURS.map((c) => `<button class="swatch ${p.boots === c ? 'is-active' : ''}" style="background:${c}" data-boots="${c}" aria-label="Boots: ${colourName(c)}" ${pressed(p.boots === c)}></button>`).join('')}</div>
          <div class="pills">${BOOT_STYLES.map((b) => `<button class="pill ${(p.bootStyle ?? 'classic') === b ? 'is-active' : ''}" data-bootstyle="${b}" ${pressed((p.bootStyle ?? 'classic') === b)}>${BOOT_STYLE_LABELS[b]}</button>`).join('')}</div></div>
      </div>`;
    form.querySelector('#p-add')?.addEventListener('click', () => {
      const used = new Set(team.players.map((x) => x.number));
      let n = 2; while (used.has(n)) n++;
      team.players.push(makePlayer(team.players.length % 2 ? 'DEF' : 'ATT', n, undefined, false, team.ageGroup));
      selectedPlayer = team.players.length - 1;
      render();
    });
    form.querySelector('#p-remove')?.addEventListener('click', async () => {
      const shirt = contrastColour(team.kit.shirt);
      const sure = await askConfirm({
        title: `Remove ${p.name}?`, body: 'They will leave your squad.', yes: 'Remove', no: 'Keep them',
        preview: `<span class="pop-num" style="background:${esc(team.kit.shirt)};color:${esc(shirt)}">${p.number}</span><strong>${esc(p.name)}</strong><span class="chip chip-pos chip-${p.position.toLowerCase()}">${POSITION_LABELS[p.position]}</span>`,
      });
      const at = team.players.indexOf(p);
      if (!sure || at < 0 || team.players.length <= 5) return;
      selectedPlayer = at;
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
    form.querySelectorAll<HTMLElement>('[data-gender]').forEach((b) => b.addEventListener('click', () => { p.gender = b.dataset.gender as Gender; preview?.setGender(p.gender); renderSquad(form); }));
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
    form.querySelector('#p-dice')!.addEventListener('click', () => { p.name = randomPlayerName(p.gender); nameEl.value = p.name; form.querySelectorAll('.pc-name')[selectedPlayer].textContent = p.name; });
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
      setPosition(team, p, pos);
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
  state.cleanup = () => { preview?.dispose(); preview = null; unwireDrag(); };
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
