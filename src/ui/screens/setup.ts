import { generateOpponent } from '../../data/defaults';
import { cupInProgress, getCareer, getLeague, getSettings, getTeam, getTeams, saveTeam, setCareer, setLeague, setTournament, updateSettings } from '../../data/storage';
import type { Difficulty, Team } from '../../data/types';
import { CAREER_AGES, SEASONS_PER_YEAR, createCareer } from '../../game/career';
import { kitsClash } from '../../game/kitTexture';
import { WEATHER_CHOICES, type WeatherChoice } from '../../game/Weather';
import { recordCareer } from '../../data/progress';
import { TIERS, createLeague } from '../../game/league';
import { createTournament } from '../../game/tournament';
import { esc } from '../hud';
import { badgeSvg, kitChip } from '../kitPreview';
import { logoControls, wireLogoControls } from '../logoUpload';
import { controlsSentence } from '../../data/controls';
import { topBar, wire, pressed, focusKey, restoreFocus } from './shared';
import type { Router, SetupMode } from '../screens';

const MODE_INFO: Record<SetupMode, { title: string; go: string; blurb: string }> = {
  match: { title: 'Match Setup', go: '⚽ Kick Off!', blurb: '' },
  tournament: { title: 'Tournament', go: '🏆 Start the cup!', blurb: 'Four teams, two semi-finals and a final. Win both of your games to lift the trophy. Draws go to penalties!' },
  shootout: { title: 'Penalty Shoot-out', go: '🥅 Start the shoot-out!', blurb: 'Best of five penalties each, then sudden death. Hold shoot to power up and aim with the stick. In goal, move to dive!' },
  training: { title: 'Shooting Training', go: '🎯 Start training!', blurb: 'Just you, a keeper and a bag of balls. Score as many as you can before the time runs out. Rocket shots count double!' },
  career: { title: 'Career', go: '🌱 Start in the Under 5s!', blurb: 'Take a team all the way from the Under 5s to the Under 10s. Every year has four mini seasons of five matches. Your players start tiny and grow by playing: goals, passes, tackles and saves all earn stars. Pick the team whose name, kits and kids you want to take on the journey; a copy starts at U5 so your original is untouched. Then choose your Star: the player the career follows, who earns training points and milestones while you play with the whole team.' },
  league: { title: 'League', go: '📋 Start in Tier 5!', blurb: 'Five leagues, from the Acorn League at Tier 5 up to the Star Premier League at Tier 1. Play five matches a season: finish in the top two to go up, bottom to go down. The teams get tougher every tier. Your league is saved, so you can come back any time.' },
};

export function renderSetup(root: HTMLElement, router: Router, homeId?: string, mode: SetupMode = 'match'): void {
  const teams = getTeams();
  const settings = getSettings();
  let home = (homeId && getTeam(homeId)) || teams[0];
  let opponentId: string | 'cpu' = 'cpu';
  let cpu = generateOpponent(home.ageGroup, home.kit);
  let difficulty: Difficulty = settings.difficulty;
  let halfSeconds = mode === 'training' ? 90 : settings.halfLengthSeconds;
  let twoPlayer = false;
  let weather: WeatherChoice = 'random';
  let help = settings.beginnerHelp;
  // League and career strength grows with the tiers, so there Starter is the only choice besides Normal.
  const tiered = mode === 'league' || mode === 'career';
  const levels: ('starter' | Difficulty)[] = tiered ? ['starter', 'normal'] : ['starter', 'easy', 'normal', 'hard'];
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
          ${mode === 'career' ? `<div class="field"><span>The journey</span><div class="age-ladder">${CAREER_AGES.map((a) => `<span class="rung-age">${a}</span>`).join('<span class="rung-arrow">→</span>')}</div><p class="muted small">${SEASONS_PER_YEAR} mini seasons a year · promotion and relegation between tiers carry over · stars grow up to each age group's cap.</p></div>` : mode === 'league' ? `<div class="field"><span>Tiers</span><ol class="tier-list">${TIERS.map((t) => `<li><strong>Tier ${t.tier}</strong> ${esc(t.name)}</li>`).join('')}</ol></div>` : ''}
          <div class="field"><span>Computer difficulty</span>
            <div class="pills">${levels.map((d) => { const on = d === (help ? 'starter' : tiered ? 'normal' : difficulty); return `<button class="pill ${on ? 'is-active' : ''}" data-diff="${d}" ${pressed(on)}>${d === 'starter' ? '🐣 Starter' : d[0].toUpperCase() + d.slice(1)}</button>`; }).join('')}</div>
            ${help ? '<p class="muted small">🐣 Starter, for the youngest players: a slower computer team, and help aiming shots.</p>' : ''}
          </div>
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
    root.querySelectorAll<HTMLElement>('[data-diff]').forEach((b) => b.addEventListener('click', () => {
      // Starter is beginner help on an Easy computer team (MatchConfig.assist).
      help = b.dataset.diff === 'starter';
      if (!help && !tiered) difficulty = b.dataset.diff as Difficulty;
      render();
    }));
    root.querySelectorAll<HTMLElement>('[data-players]').forEach((b) => b.addEventListener('click', () => {
      twoPlayer = b.dataset.players === '2';
      if (twoPlayer && mode === 'tournament' && opponentId === 'cpu') pickSecondTeam();
      render();
    }));
    root.querySelectorAll<HTMLElement>('[data-len]').forEach((b) => b.addEventListener('click', () => { halfSeconds = Number(b.dataset.len); render(); }));
    root.querySelectorAll<HTMLElement>('[data-weather]').forEach((b) => b.addEventListener('click', () => { weather = b.dataset.weather as WeatherChoice; render(); }));
    root.querySelector('#s-go')!.addEventListener('click', () => {
      updateSettings({ beginnerHelp: help });
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
