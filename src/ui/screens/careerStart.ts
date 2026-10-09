import { HAIR_COLOURS, SKIN_TONES, generateOpponent, genderOfName, makePlayer, randomPlayerName } from '../../data/defaults';
import { CLUB_TEAM_ID, davaoStrikersTeam } from '../../data/club';
import { getCareer, getHall, getSettings, getTeam, getTeams, retireCareer, saveTeam, setCareer, updateSettings } from '../../data/storage';
import { GENDERS, HAIR_STYLES, HAIR_STYLE_LABELS, POSITIONS, POSITION_LABELS, type Gender, type HairStyle, type Player, type Position, type Team } from '../../data/types';
import { isNameOk } from '../../data/wordFilter';
import { recordCareer } from '../../data/progress';
import { CAREER_AGES, LEGACY_RELATIONS, SEASONS_PER_YEAR, TWISTS, TWIST_IDS, careerStar, createCareer, legacyAfter, nextGeneration, type LegacyRelation, type Twist } from '../../game/career';
import { esc } from '../hud';
import { badgeSvg, kitChip } from '../kitPreview';
import { topBar, wire, pressed, focusKey, restoreFocus } from './shared';
import type { Router } from '../screens';
import { askConfirm } from '../dialog';

type StarChoice = 'existing' | 'create';
type TeamChoice = 'random' | 'club' | 'mine';

/**
 * Starting a career: first your Star (a player from one of your teams, or one you make
 * up), then the team they play for (a random team, Davao Strikers, or one of your own).
 */
export function renderCareerStart(root: HTMLElement, router: Router, homeId?: string): void {
  const settings = getSettings();
  const mine = getTeams().filter((t) => !t.career && t.id !== CLUB_TEAM_ID);
  // One copy of the club team for both steps, so picking a club player and the club team is the same kid.
  const club = getTeam(CLUB_TEAM_ID) ?? davaoStrikersTeam();
  const sources = [...mine, club];
  let starChoice: StarChoice = 'existing';
  let sourceId = (homeId && sources.find((t) => t.id === homeId)?.id) || sources[0].id;
  let playerId = '';
  const made: Player = makePlayer('ATT', 10, randomPlayerName(), true, 'U5');
  let teamChoice: TeamChoice = homeId && mine.some((t) => t.id === homeId) ? 'mine' : 'random';
  let random = generateOpponent('U5', club.kit);
  let mineId = (homeId && mine.find((t) => t.id === homeId)?.id) || mine[0]?.id || '';
  let help = settings.beginnerHelp;
  let halfSeconds = settings.halfLengthSeconds;
  let twist: Twist | null = null;
  // After a finished career, the next generation can start at the same club.
  const finished = getCareer();
  const oldTeam = finished?.done ? getTeam(finished.teamId) : undefined;
  const oldStar = finished && oldTeam ? careerStar(finished, oldTeam) : undefined;
  let legacyOn = !!oldTeam;
  let relation: LegacyRelation = 'cousin';
  const heirs = oldTeam ? nextGeneration(oldTeam) : null;

  const source = () => sources.find((t) => t.id === sourceId) ?? sources[0];
  const team = (): Team => (legacyOn && heirs ? heirs : teamChoice === 'club' || twist === 'town' ? club : teamChoice === 'mine' ? mine.find((t) => t.id === mineId) ?? random : random);
  const star = (): Player | null => (starChoice === 'create' || legacyOn ? made : source().players.find((p) => p.id === playerId) ?? null);

  const playerTile = (t: Team, p: Player) => `<button class="btn star-pick-btn ${p.id === playerId ? 'is-suggested' : ''}" data-player="${esc(p.id)}" ${pressed(p.id === playerId)}>${kitChip(p.position === 'GK' ? t.keeperKit : t.kit, 36)}<span><strong>${esc(p.name)}</strong> #${p.number}<br/><span class="chip chip-pos chip-${p.position.toLowerCase()}">${POSITION_LABELS[p.position]}</span></span></button>`;
  const teamTile = (id: TeamChoice, t: Team, label: string) => `<button class="card team-choice ${teamChoice === id ? 'is-active' : ''}" data-team="${id}" ${pressed(teamChoice === id)}>
      <span class="muted small">${label}</span><span class="row">${badgeSvg(t.badge, 48)}${kitChip(t.kit, 48)}</span><strong>${esc(t.name)}</strong></button>`;

  const render = () => {
    const focused = focusKey(document.activeElement);
    const s = star();
    const t = team();
    const ready = !!s && isNameOk(s.name) && s.name.trim().length > 0;
    root.innerHTML = `
      <div class="screen setup career-start">
        ${topBar('Career')}
        <p class="mode-blurb">Grow up from the Under 5s to the Under 10s: four mini seasons a year, five matches each. You play every match with the whole team, and your Star earns training points and milestones along the way.</p>
        ${oldTeam ? `<div class="card options legacy-card">
          <h3>👪 Legacy start</h3>
          <div class="pills"><button class="pill ${legacyOn ? 'is-active' : ''}" data-legacy="1" ${pressed(legacyOn)}>👪 Next generation at ${esc(oldTeam.name)}</button><button class="pill ${!legacyOn ? 'is-active' : ''}" data-legacy="0" ${pressed(!legacyOn)}>🌱 A brand new career</button></div>
          ${legacyOn ? `<p>${oldStar ? `<strong>${esc(oldStar.name)}</strong> hangs up their boots and becomes the coach (a bonus training point every mini season). ` : ''}A new squad of Under 5s starts at ${esc(oldTeam.name)}, and the club remembers what it won.</p>
          ${oldStar ? `<div class="field"><span>Your new Star is ${esc(oldStar.name)}'s</span><div class="pills">${(Object.keys(LEGACY_RELATIONS) as LegacyRelation[]).map((r) => `<button class="pill ${relation === r ? 'is-active' : ''}" data-relation="${r}" ${pressed(relation === r)}>${LEGACY_RELATIONS[r]}</button>`).join('')}</div></div>` : ''}` : ''}
        </div>` : ''}
        <div class="card options">
          <h3>1. Your Star</h3>
          ${legacyOn ? '' : `<div class="pills"><button class="pill ${starChoice === 'existing' ? 'is-active' : ''}" data-star="existing" ${pressed(starChoice === 'existing')}>👟 Choose a player</button><button class="pill ${starChoice === 'create' ? 'is-active' : ''}" data-star="create" ${pressed(starChoice === 'create')}>✏️ Create your own</button></div>`}
          ${starChoice === 'existing' && !legacyOn ? `
            <label class="field"><span>From the team</span><select id="c-source">${sources.map((x) => `<option value="${esc(x.id)}" ${x.id === sourceId ? 'selected' : ''}>${esc(x.name)}</option>`).join('')}</select></label>
            <div class="star-pick-grid">${source().players.map((p) => playerTile(source(), p)).join('')}</div>
            ${s ? '' : '<p class="muted small">Tap a player to make them your Star.</p>'}` : `
            <label class="field"><span>Name</span><div class="row"><input id="c-name" maxlength="14" value="${esc(made.name)}" /><button class="btn btn-blue btn-icon" id="c-dice" title="Random name" aria-label="Random player name">🎲</button></div></label>
            <p class="warn" id="c-name-warn" ${made.name.trim() && !isNameOk(made.name) ? '' : 'hidden'}>Let's pick a different name, that one is not allowed.</p>
            <div class="field"><span>Shirt number</span><input id="c-number" type="number" min="1" max="99" value="${made.number}" /></div>
            <div class="field"><span>Position</span><div class="pills">${POSITIONS.map((pos) => `<button class="pill ${made.position === pos ? 'is-active' : ''}" data-pos="${pos}" ${pressed(made.position === pos)}>${POSITION_LABELS[pos]}</button>`).join('')}</div></div>
            <div class="field"><span>Boy or girl</span><div class="pills">${GENDERS.map((g) => `<button class="pill ${made.gender === g ? 'is-active' : ''}" data-gender="${g}" ${pressed(made.gender === g)}>${g === 'boy' ? 'Boy' : 'Girl'}</button>`).join('')}</div></div>
            <div class="field"><span>Skin</span><div class="swatches">${SKIN_TONES.map((c) => `<button class="swatch round ${made.skin === c ? 'is-active' : ''}" style="background:${c}" data-skin="${c}" aria-label="Skin tone" ${pressed(made.skin === c)}></button>`).join('')}</div></div>
            <div class="field"><span>Hair style</span><div class="pills">${HAIR_STYLES.map((h) => `<button class="pill ${made.hairStyle === h ? 'is-active' : ''}" data-hairstyle="${h}" ${pressed(made.hairStyle === h)}>${HAIR_STYLE_LABELS[h]}</button>`).join('')}</div></div>
            <div class="field"><span>Hair colour</span><div class="swatches">${HAIR_COLOURS.map((c) => `<button class="swatch round ${made.hair === c ? 'is-active' : ''}" style="background:${c}" data-hair="${c}" aria-label="Hair colour" ${pressed(made.hair === c)}></button>`).join('')}</div></div>`}
        </div>
        ${legacyOn ? '' : `<div class="card options">
          <h3>2. Your team</h3>
          <div class="team-choices">
            ${teamTile('random', random, '🎲 Random team')}
            ${teamTile('club', club, '🦊 Davao Strikers')}
            ${mine.length ? teamTile('mine', mine.find((x) => x.id === mineId) ?? mine[0], '👕 One of my teams') : ''}
          </div>
          ${teamChoice === 'random' ? '<button class="btn btn-ghost" id="c-reroll">🎲 Another random team</button>' : ''}
          ${teamChoice === 'mine' ? `<label class="field"><span>Which team</span><select id="c-mine">${mine.map((x) => `<option value="${esc(x.id)}" ${x.id === mineId ? 'selected' : ''}>${esc(x.name)}</option>`).join('')}</select></label>` : ''}
          <p class="muted small">${s ? `${esc(s.name)} ${source().players.includes(s) && source() === t ? `starts the career with ${esc(t.name)}` : `joins ${esc(t.name)} as a starter`}.` : ''} A copy of the team starts in the Under 5s, so the original is untouched.</p>
        </div>
        <div class="card options twist-card">
          <h3>3. How to start</h3>
          <div class="pills"><button class="pill ${!twist ? 'is-active' : ''}" data-twist="" ${pressed(!twist)}>🌱 The usual way</button>${TWIST_IDS.map((id) => `<button class="pill ${twist === id ? 'is-active' : ''}" data-twist="${id}" ${pressed(twist === id)}>${TWISTS[id].emoji} ${esc(TWISTS[id].name)}</button>`).join('')}</div>
          <p class="muted small">${twist ? `${esc(TWISTS[twist].blurb)} Finish it for its own sticker.` : 'Start in the Under 5s in the Acorn League. Want a different story? Try a twist.'}</p>
        </div>`}
        <div class="card options">
          <div class="field"><span>The journey</span><div class="age-ladder">${CAREER_AGES.map((a) => `<span class="rung-age">${a}</span>`).join('<span class="rung-arrow">→</span>')}</div><p class="muted small">${SEASONS_PER_YEAR} mini seasons a year · promotion and relegation between tiers carry over · stars grow up to each age group's cap.</p></div>
          <div class="field"><span>Computer difficulty</span>
            <div class="pills"><button class="pill ${help ? 'is-active' : ''}" data-help="1" ${pressed(help)}>🐣 Starter</button><button class="pill ${!help ? 'is-active' : ''}" data-help="0" ${pressed(!help)}>Normal</button></div>
          </div>
          <div class="field"><span>Half length</span>
            <div class="pills">${[60, 120, 180, 300].map((n) => `<button class="pill ${n === halfSeconds ? 'is-active' : ''}" data-len="${n}" ${pressed(n === halfSeconds)}>${n / 60} min</button>`).join('')}</div>
          </div>
        </div>
        <button class="btn btn-primary btn-big btn-kickoff" id="c-go" ${ready ? '' : 'disabled'}>${twist ? TWISTS[twist].emoji : '🌱'} Start in the ${twist === 'late' ? 'Under 7s' : 'Under 5s'}!</button>
      </div>`;
    wire(root, () => router.go({ name: 'menu' }));
    root.querySelectorAll<HTMLElement>('[data-star]').forEach((b) => b.addEventListener('click', () => { starChoice = b.dataset.star as StarChoice; render(); }));
    root.querySelector<HTMLSelectElement>('#c-source')?.addEventListener('change', (e) => { sourceId = (e.target as HTMLSelectElement).value; playerId = ''; render(); });
    root.querySelectorAll<HTMLElement>('[data-player]').forEach((b) => b.addEventListener('click', () => { playerId = b.dataset.player!; render(); }));
    const name = root.querySelector<HTMLInputElement>('#c-name');
    name?.addEventListener('input', () => {
      made.name = name.value;
      made.gender = undefined;
      root.querySelector('#c-name-warn')!.toggleAttribute('hidden', !made.name.trim() || isNameOk(made.name));
      root.querySelector<HTMLButtonElement>('#c-go')!.disabled = !made.name.trim() || !isNameOk(made.name);
    });
    name?.addEventListener('change', render);
    root.querySelector('#c-dice')?.addEventListener('click', () => { made.name = randomPlayerName(made.gender); render(); });
    const num = root.querySelector<HTMLInputElement>('#c-number');
    num?.addEventListener('change', () => { const n = Math.round(Number(num.value)); made.number = Number.isFinite(n) ? Math.max(1, Math.min(99, n)) : 10; render(); });
    root.querySelectorAll<HTMLElement>('[data-pos]').forEach((b) => b.addEventListener('click', () => { made.position = b.dataset.pos as Position; render(); }));
    root.querySelectorAll<HTMLElement>('[data-gender]').forEach((b) => b.addEventListener('click', () => { made.gender = b.dataset.gender as Gender; render(); }));
    root.querySelectorAll<HTMLElement>('[data-skin]').forEach((b) => b.addEventListener('click', () => { made.skin = b.dataset.skin!; render(); }));
    root.querySelectorAll<HTMLElement>('[data-hairstyle]').forEach((b) => b.addEventListener('click', () => { made.hairStyle = b.dataset.hairstyle as HairStyle; render(); }));
    root.querySelectorAll<HTMLElement>('[data-hair]').forEach((b) => b.addEventListener('click', () => { made.hair = b.dataset.hair!; render(); }));
    root.querySelectorAll<HTMLElement>('[data-team]').forEach((b) => b.addEventListener('click', () => { teamChoice = b.dataset.team as TeamChoice; if (teamChoice !== 'club' && twist === 'town') twist = null; render(); }));
    root.querySelectorAll<HTMLElement>('[data-legacy]').forEach((b) => b.addEventListener('click', () => { legacyOn = b.dataset.legacy === '1'; render(); }));
    root.querySelectorAll<HTMLElement>('[data-relation]').forEach((b) => b.addEventListener('click', () => {
      relation = b.dataset.relation as LegacyRelation;
      if (relation !== 'cousin') { made.gender = relation === 'brother' ? 'boy' : 'girl'; if (genderOfName(made.name) && genderOfName(made.name) !== made.gender) made.name = randomPlayerName(made.gender); }
      render();
    }));
    root.querySelectorAll<HTMLElement>('[data-twist]').forEach((b) => b.addEventListener('click', () => { twist = (b.dataset.twist || null) as Twist | null; if (twist === 'town') teamChoice = 'club'; render(); }));
    root.querySelector('#c-reroll')?.addEventListener('click', () => { random = generateOpponent('U5', club.kit); render(); });
    root.querySelector<HTMLSelectElement>('#c-mine')?.addEventListener('change', (e) => { mineId = (e.target as HTMLSelectElement).value; render(); });
    root.querySelectorAll<HTMLElement>('[data-help]').forEach((b) => b.addEventListener('click', () => { help = b.dataset.help === '1'; render(); }));
    root.querySelectorAll<HTMLElement>('[data-len]').forEach((b) => b.addEventListener('click', () => { halfSeconds = Number(b.dataset.len); render(); }));
    root.querySelector('#c-go')!.addEventListener('click', async () => {
      const chosen = star();
      if (!chosen || !chosen.name.trim() || !isNameOk(chosen.name)) return;
      if (getCareer() && !(await askConfirm({ tone: 'warn', title: 'Start a new career?', body: 'Your current career goes into the Hall of Fame, with its Star, trophies and scrapbook.\n\nThe team stays in My Teams.', yes: 'Start new career', no: 'Keep my career' }))) return;
      updateSettings({ beginnerHelp: help, halfLengthSeconds: halfSeconds });
      const legacy = legacyOn && finished && oldTeam ? legacyAfter(finished, oldTeam, relation) : null;
      if (getCareer() && retireCareer()) recordCareer({ hall: getHall().length });
      const { career, team: you } = createCareer(team(), halfSeconds, { ...chosen, name: chosen.name.trim() }, legacy ? null : twist, legacy);
      saveTeam(you);
      setCareer(career);
      recordCareer({ started: true, legacy: legacy?.level });
      router.go({ name: 'career' });
    });
    restoreFocus(root, focused);
  };
  render();
}

