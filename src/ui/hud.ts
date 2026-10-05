import type { MatchSim, SimEvent } from '../game/sim';
import { badgeSvg } from './kitPreview';

export interface HudRefs {
  joystickZone: HTMLElement;
  joystickKnob: HTMLElement;
  btnShoot: HTMLElement;
  btnPass: HTMLElement;
  btnSprint: HTMLElement;
  btnSwitch: HTMLElement;
  update(sim: MatchSim, events: SimEvent[]): void;
  destroy(): void;
}

function fmtClock(sim: MatchSim): string {
  // Show the match as a 40-minute game, 20 per half, whatever the real length.
  const perHalf = sim.config.halfSeconds;
  const total = perHalf * 2;
  const shown = Math.min(40, Math.floor((sim.clock / total) * 40));
  const secs = Math.floor(((sim.clock / total) * 40 * 60) % 60);
  return `${String(shown).padStart(2, '0')}:${String(secs).padStart(2, '0')}`;
}

export function renderHud(root: HTMLElement, sim: MatchSim, cb: { onPause(): void; onResume(): void; onQuit(): void; onFinish(): void }): HudRefs {
  const [home, away] = sim.teams;
  root.innerHTML = `
    <div class="hud">
      <div class="scoreboard">
        <div class="sb-team sb-home">${badgeSvg(home.badge, 30)}<span class="sb-name">${esc(home.short)}</span></div>
        <div class="sb-score"><span id="sb-h">0</span><span class="sb-dash">–</span><span id="sb-a">0</span></div>
        <div class="sb-team sb-away"><span class="sb-name">${esc(away.short)}</span>${badgeSvg(away.badge, 30)}</div>
        <div class="sb-clock"><span id="sb-clock">00:00</span><span class="sb-half" id="sb-half">1st half</span></div>
      </div>
      <button class="hud-pause" id="hud-pause" aria-label="Pause">❚❚</button>
      <div class="hud-player-box hud-player-box-p2" id="hud-player-box-2" style="display:none">
        <div class="hud-player hud-player-p2" id="hud-player-2"></div>
        <div class="bar"><span class="bar-label">Sprint</span><div class="bar-track"><div class="bar-fill bar-stamina" id="bar-stamina-2"></div></div></div>
        <div class="bar"><span class="bar-label">Power</span><div class="bar-track"><div class="bar-fill bar-power" id="bar-power-2"></div></div></div>
      </div>
      <div class="hud-player-box" id="hud-player-box">
        <div class="hud-player" id="hud-player"></div>
        <div class="bar"><span class="bar-label">Sprint</span><div class="bar-track"><div class="bar-fill bar-stamina" id="bar-stamina"></div></div></div>
        <div class="bar"><span class="bar-label">Power</span><div class="bar-track"><div class="bar-fill bar-power" id="bar-power"></div></div></div>
      </div>
      <div class="hud-banner" id="hud-banner"></div>
      <div class="touch-controls">
        <div class="joystick" id="joy"><div class="joy-knob" id="joy-knob"></div></div>
        <div class="action-buttons">
          <button class="abtn abtn-switch" id="btn-switch">Switch</button>
          <button class="abtn abtn-sprint" id="btn-sprint">Sprint</button>
          <button class="abtn abtn-pass" id="btn-pass">Pass</button>
          <button class="abtn abtn-shoot" id="btn-shoot">Shoot</button>
        </div>
      </div>
      <div class="overlay" id="overlay" hidden></div>
    </div>`;
  const q = <T extends HTMLElement>(id: string) => root.querySelector<T>(`#${id}`)!;
  const sbH = q('sb-h'), sbA = q('sb-a'), clock = q('sb-clock'), halfEl = q('sb-half');
  const banner = q('hud-banner');
  const overlay = q('overlay');
  const playerLabel = q('hud-player');
  const playerBox = q('hud-player-box');
  const barStamina = q('bar-stamina');
  const barPower = q('bar-power');
  const playerBox2 = q('hud-player-box-2');
  const playerLabel2 = q('hud-player-2');
  const barStamina2 = q('bar-stamina-2');
  const barPower2 = q('bar-power-2');
  const pauseBtn = q<HTMLButtonElement>('hud-pause');
  let bannerTimer = 0;
  let lastPhase = '';
  pauseBtn.addEventListener('click', () => cb.onPause());

  const showBanner = (html: string, ms: number) => {
    banner.innerHTML = html;
    banner.classList.add('show');
    window.clearTimeout(bannerTimer);
    bannerTimer = window.setTimeout(() => banner.classList.remove('show'), ms);
  };

  const renderOverlay = (s: MatchSim) => {
    if (s.phase === 'paused') {
      overlay.hidden = false;
      overlay.innerHTML = `
        <div class="card overlay-card">
          <h2>Paused</h2>
          ${s.config.humanSide2 != null
            ? '<p class="muted"><strong>Player 1:</strong> WASD to move, hold Space to shoot, Z to pass, left Shift to sprint, Q to switch.<br/><strong>Player 2:</strong> arrows to move, hold Enter to shoot, / to pass, right Shift to sprint, . to switch.</p>'
            : '<p class="muted">Arrow keys or WASD to move. Hold Space to power up a shot and release to shoot, Z to pass, Shift to sprint, Q to switch player.</p>'}
          <div class="row">
            <button class="btn btn-primary" id="ov-resume">Keep playing</button>
            <button class="btn btn-ghost" id="ov-quit">Quit match</button>
          </div>
        </div>`;
      overlay.querySelector('#ov-resume')!.addEventListener('click', () => cb.onResume());
      overlay.querySelector('#ov-quit')!.addEventListener('click', () => cb.onQuit());
    } else if (s.phase === 'halftime') {
      overlay.hidden = false;
      overlay.innerHTML = `<div class="card overlay-card"><h2>Half time</h2><p class="score-big">${s.score[0]} – ${s.score[1]}</p><p class="muted">Have an orange slice! Second half coming up.</p></div>`;
    } else if (s.phase === 'fulltime') {
      overlay.hidden = false;
      overlay.innerHTML = `
        <div class="card overlay-card">
          <h2>Full time!</h2>
          <p class="score-big">${esc(home.short)} ${s.score[0]} – ${s.score[1]} ${esc(away.short)}</p>
          <button class="btn btn-primary" id="ov-finish">See the results</button>
        </div>`;
      overlay.querySelector('#ov-finish')!.addEventListener('click', () => cb.onFinish());
    } else {
      overlay.hidden = true;
      overlay.innerHTML = '';
    }
  };

  return {
    joystickZone: q('joy'),
    joystickKnob: q('joy-knob'),
    btnShoot: q('btn-shoot'),
    btnPass: q('btn-pass'),
    btnSprint: q('btn-sprint'),
    btnSwitch: q('btn-switch'),
    update(s, events) {
      sbH.textContent = String(s.score[0]);
      sbA.textContent = String(s.score[1]);
      clock.textContent = fmtClock(s);
      halfEl.textContent = s.half === 1 ? '1st half' : '2nd half';
      if (s.controlled) {
        playerLabel.textContent = `#${s.controlled.info.number} ${s.controlled.info.name}`;
        playerBox.style.display = '';
        barStamina.style.width = `${Math.round(s.controlled.stamina * 100)}%`;
        barPower.style.width = `${Math.round(s.controlled.charge * 100)}%`;
        barPower.parentElement!.parentElement!.classList.toggle('is-charging', s.controlled.charge > 0);
      } else playerBox.style.display = 'none';
      if (s.controlled2) {
        playerLabel2.textContent = `P2 · #${s.controlled2.info.number} ${s.controlled2.info.name}`;
        playerBox2.style.display = '';
        barStamina2.style.width = `${Math.round(s.controlled2.stamina * 100)}%`;
        barPower2.style.width = `${Math.round(s.controlled2.charge * 100)}%`;
      } else playerBox2.style.display = 'none';
      for (const ev of events) {
        if (ev.type === 'goal' && ev.player) {
          const team = s.teams[ev.side!];
          const own = s.goals[s.goals.length - 1]?.ownGoal;
          showBanner(`<div class="goal-text">GOAL!</div><div class="goal-sub">${esc(ev.player.name)} #${ev.player.number}${own ? ' (own goal)' : ''} · ${esc(team.name)}</div>`, 3000);
          confetti(root, team.kit.shirt, team.kit.shirt2);
        } else if (ev.type === 'save') {
          showBanner(`<div class="save-text">Great save, ${esc(ev.player?.name ?? 'keeper')}!</div>`, 1200);
        } else if (ev.type === 'foul') {
          const victimTeam = s.teams[1 - ev.side!];
          showBanner(ev.kind === 'penalty'
            ? `<div class="goal-text goal-text-small">PENALTY!</div><div class="goal-sub">${esc(victimTeam.name)} to take it</div>`
            : `<div class="save-text">Foul! Free kick to ${esc(victimTeam.name)}</div>`, 1800);
        } else if (ev.type === 'kickoff' && s.clock > 0.1) {
          showBanner(`<div class="save-text">Kick off!</div>`, 900);
        }
      }
      if (s.phase !== lastPhase) {
        lastPhase = s.phase;
        renderOverlay(s);
      }
    },
    destroy() {
      window.clearTimeout(bannerTimer);
      root.innerHTML = '';
    },
  };
}

function confetti(root: HTMLElement, c1: string, c2: string): void {
  const layer = document.createElement('div');
  layer.className = 'confetti';
  for (let i = 0; i < 40; i++) {
    const p = document.createElement('i');
    p.style.left = `${Math.random() * 100}%`;
    p.style.background = i % 3 === 0 ? '#ffd23f' : i % 2 ? c1 : c2;
    p.style.animationDelay = `${Math.random() * 0.6}s`;
    p.style.animationDuration = `${1.6 + Math.random()}s`;
    p.style.transform = `rotate(${Math.random() * 360}deg)`;
    layer.appendChild(p);
  }
  root.appendChild(layer);
  window.setTimeout(() => layer.remove(), 3000);
}

export function esc(s: string): string {
  return s.replace(/[&<>"']/g, (ch) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[ch]!);
}
