import type { MatchSim, SimEvent } from '../game/sim';
import { kitChip } from './kitPreview';

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
        <div class="sb-team sb-home">${kitChip(home.kit)}<span class="sb-name">${esc(home.short)}</span></div>
        <div class="sb-score"><span id="sb-h">0</span><span class="sb-dash">–</span><span id="sb-a">0</span></div>
        <div class="sb-team sb-away"><span class="sb-name">${esc(away.short)}</span>${kitChip(away.kit)}</div>
        <div class="sb-clock"><span id="sb-clock">00:00</span><span class="sb-half" id="sb-half">1st half</span></div>
      </div>
      <button class="hud-pause" id="hud-pause" aria-label="Pause">❚❚</button>
      <div class="hud-player" id="hud-player"></div>
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
          <p class="muted">Arrow keys or WASD to move. Space to shoot, Z to pass, Shift to sprint, Q to switch player.</p>
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
        playerLabel.style.display = '';
      } else playerLabel.style.display = 'none';
      for (const ev of events) {
        if (ev.type === 'goal' && ev.player) {
          const team = s.teams[ev.side!];
          const own = s.goals[s.goals.length - 1]?.ownGoal;
          showBanner(`<div class="goal-text">GOAL!</div><div class="goal-sub">${esc(ev.player.name)} #${ev.player.number}${own ? ' (own goal)' : ''} · ${esc(team.name)}</div>`, 3000);
          confetti(root, team.kit.shirt, team.kit.shirt2);
        } else if (ev.type === 'save') {
          showBanner(`<div class="save-text">Great save, ${esc(ev.player?.name ?? 'keeper')}!</div>`, 1200);
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
