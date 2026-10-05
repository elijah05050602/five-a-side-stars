import type { MatchSim, SimEvent } from '../game/sim';
import { TUTORIAL_STEPS, type TutorialCoach, type TutorialStep } from '../game/tutorial';
import { getSettings } from '../data/storage';
import { controlsSentence, firstKey, getControls, moveKeysLabel } from '../data/controls';
import { badgeSvg } from './kitPreview';

export interface HudRefs {
  joystickZone: HTMLElement;
  joystickKnob: HTMLElement;
  btnShoot: HTMLElement;
  btnPass: HTMLElement;
  btnSprint: HTMLElement;
  btnSwitch: HTMLElement;
  btnTrick: HTMLElement;
  update(sim: MatchSim, events: SimEvent[]): void;
  destroy(): void;
}

function fmtClock(sim: MatchSim): string {
  if (sim.mode === 'training') {
    const left = Math.max(0, sim.config.halfSeconds - sim.clock);
    return `${Math.floor(left / 60)}:${String(Math.floor(left % 60)).padStart(2, '0')}`;
  }
  // Show the match as a 40-minute game, 20 per half, whatever the real length.
  const perHalf = sim.config.halfSeconds;
  const total = perHalf * 2;
  const shown = Math.min(40, Math.floor((sim.clock / total) * 40));
  const secs = Math.floor(((sim.clock / total) * 40 * 60) % 60);
  return `${String(shown).padStart(2, '0')}:${String(secs).padStart(2, '0')}`;
}

const PENS_SHOWN = 5;

function pensDots(res: boolean[]): string {
  const n = Math.max(PENS_SHOWN, res.length);
  let out = '';
  for (let i = 0; i < n; i++) out += res[i] === undefined ? '<i class="pen pen-todo"></i>' : res[i] ? '<i class="pen pen-goal">⚽</i>' : '<i class="pen pen-miss">✕</i>';
  return out;
}

export function renderHud(root: HTMLElement, sim: MatchSim, cb: { onPause(): void; onResume(): void; onQuit(): void; onFinish(): void }, coach?: TutorialCoach): HudRefs {
  const [home, away] = sim.teams;
  const mode = sim.mode;
  root.innerHTML = `
    <div class="hud hud-${mode}">
      ${coach ? `<div class="tut-card card" id="tut-card"></div><button class="btn btn-ghost tut-skip" id="tut-skip">Skip<span class="tut-skip-long"> tutorial</span> ⏭</button>` : ''}
      <div class="scoreboard">
        ${mode === 'training' ? `
        <div class="sb-team sb-home">${badgeSvg(home.badge, 30)}<span class="sb-name">${esc(home.short)}</span></div>
        <div class="sb-score sb-points"><span id="sb-h">0</span><small>pts</small></div>
        <div class="sb-team sb-away"><span class="sb-name">🎯</span></div>
        <div class="sb-clock"><span id="sb-clock">0:00</span><span class="sb-half" id="sb-half">left</span></div>` : `
        <div class="sb-team sb-home">${badgeSvg(home.badge, 30)}<span class="sb-name">${esc(home.short)}</span></div>
        <div class="sb-score"><span id="sb-h">0</span><span class="sb-dash">–</span><span id="sb-a">0</span></div>
        <div class="sb-team sb-away"><span class="sb-name">${esc(away.short)}</span>${badgeSvg(away.badge, 30)}</div>
        <div class="sb-clock"><span id="sb-clock">00:00</span><span class="sb-half" id="sb-half">${mode === 'shootout' ? 'penalties' : '1st half'}</span></div>`}
      </div>
      ${mode === 'shootout' ? `<div class="pens-board"><div class="pens-line"><span class="pens-name">${esc(home.short)}</span><span id="pens-h"></span></div><div class="pens-line"><span class="pens-name">${esc(away.short)}</span><span id="pens-a"></span></div></div>` : ''}
      <div class="hud-tip" id="hud-tip"></div>
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
      <div class="touch-controls ${getControls().touch.leftHanded ? 'is-lefty' : ''}" style="--tc-size:${getControls().touch.size};--tc-opacity:${getControls().touch.opacity}">
        <div class="joystick" id="joy"><div class="joy-knob" id="joy-knob"></div></div>
        <div class="action-buttons">
          <button class="abtn abtn-trick" id="btn-trick">Trick</button>
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
  const tip = q('hud-tip');
  const pensH = root.querySelector<HTMLElement>('#pens-h');
  const pensA = root.querySelector<HTMLElement>('#pens-a');
  let bannerTimer = 0;
  let lastPhase = '';
  let lastPens = -1;
  let lastTaking: number | null = null;
  pauseBtn.addEventListener('click', () => cb.onPause());
  const tutCard = root.querySelector<HTMLElement>('#tut-card');
  root.querySelector('#tut-skip')?.addEventListener('click', () => cb.onQuit());
  let tutKey = '';
  const renderTutorial = (c: TutorialCoach) => {
    const key = `${c.step}|${c.praise}`;
    if (!tutCard || key === tutKey) return;
    tutKey = key;
    const dots = TUTORIAL_STEPS.map((_, i) => `<i class="tut-dot ${i < c.index ? 'is-done' : i === c.index ? 'is-now' : ''}"></i>`).join('');
    if (c.step === 'done') {
      tutCard.hidden = true;
      overlay.hidden = false;
      overlay.innerHTML = `
        <div class="card overlay-card">
          <h2>You're ready! ⭐</h2>
          <p class="muted">Run, pass, shoot and show off your tricks. Corners, throw-ins and free kicks work the same way: aim, then pass or shoot.</p>
          <div class="row">
            <button class="btn btn-primary" id="tut-play">Play a match ⚽</button>
            <button class="btn btn-ghost" id="tut-lobby">Back to the lobby</button>
          </div>
        </div>`;
      overlay.querySelector('#tut-play')!.addEventListener('click', () => cb.onFinish());
      overlay.querySelector('#tut-lobby')!.addEventListener('click', () => cb.onQuit());
      root.querySelector<HTMLElement>('#tut-skip')!.hidden = true;
      return;
    }
    const t = TUTORIAL_TEXT()[c.step];
    tutCard.innerHTML = c.praise
      ? `<div class="tut-dots">${dots}</div><p class="tut-praise">${esc(c.praise)}</p>`
      : `<div class="tut-dots">${dots}</div><h3>${t.title}</h3><p>${touch ? t.touch : t.keys}</p>`;
  };

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
          ${mode === 'tutorial'
            ? '<p class="muted">Learning the ropes. Carry on, or skip and go straight to the lobby.</p>'
            : mode === 'shootout'
            ? '<p class="muted">Taking a penalty: hold shoot to power up, aim with the stick, release to kick. In goal: push left or right to dive.</p>'
            : mode === 'training'
              ? '<p class="muted">Collect the ball, run at goal and hold shoot to power up. Hard shots that fly in are worth 2 points.</p>'
              : s.config.humanSide2 != null
                ? `<p class="muted"><strong>Player 1:</strong> ${esc(controlsSentence('p1'))}.<br/><strong>Player 2:</strong> ${esc(controlsSentence('p2'))}.</p>`
                : `<p class="muted">${esc(controlsSentence('solo'))}. Hold shoot to power up, then let go. A controller works too. The orange ring and arrow mark your player; the small rings show each team's colour.</p>`}
          <div class="row">
            <button class="btn btn-primary" id="ov-resume">Keep playing</button>
            <button class="btn btn-ghost" id="ov-quit">${mode === 'tutorial' ? 'Skip tutorial' : 'Quit match'}</button>
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
          <h2>${mode === 'training' ? "Time's up!" : mode === 'shootout' ? 'Shoot-out over!' : 'Full time!'}</h2>
          <p class="score-big">${mode === 'training' ? `${s.trainingPoints} points` : `${esc(home.short)} ${s.score[0]} – ${s.score[1]} ${esc(away.short)}`}</p>
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
    btnTrick: q('btn-trick'),
    update(s, events) {
      sbH.textContent = String(s.score[0]);
      if (mode !== 'training') sbA.textContent = String(s.score[1]);
      clock.textContent = fmtClock(s);
      if (mode === 'match') halfEl.textContent = s.half === 1 ? '1st half' : '2nd half';
      if (s.shootout && pensH && pensA) {
        const so = s.shootout;
        const n = so.results[0].length + so.results[1].length;
        if (n !== lastPens) { lastPens = n; pensH.innerHTML = pensDots(so.results[0]); pensA.innerHTML = pensDots(so.results[1]); }
        if (so.taking !== lastTaking || s.phase === 'setpiece') {
          lastTaking = so.taking;
          const human = s.isHuman(so.taking);
          const humanKeeper = s.isHuman((1 - so.taking) as 0 | 1);
          tip.textContent = s.phase === 'setpiece' ? (human ? `${esc(s.teams[so.taking].short)} to take: hold shoot, aim, release!` : humanKeeper ? 'You are in goal: push left or right to dive!' : `${s.teams[so.taking].short} to take…`) : '';
        }
      }
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
          showBanner(`<div class="goal-text">GOAL!</div><div class="goal-sub">${esc(ev.player.name)} #${ev.player.number}${own ? ' (own goal)' : ''} · ${esc(team.name)}</div><div class="commentary">${own ? 'Oh no, into their own net!' : pickLine(GOAL_LINES)}</div>`, 3000);
          confetti(root, team.kit.shirt, team.kit.shirt2);
        } else if (ev.type === 'save') {
          showBanner(`<div class="save-text">${pickLine(SAVE_LINES)} Great save, ${esc(ev.player?.name ?? 'keeper')}!</div>`, 1200);
        } else if (ev.type === 'miss') {
          showBanner(`<div class="save-text">${pickLine(MISS_LINES)}</div>`, 1200);
        } else if (ev.type === 'foul') {
          const victimTeam = s.teams[1 - ev.side!];
          showBanner(ev.kind === 'penalty'
            ? `<div class="goal-text goal-text-small">PENALTY!</div><div class="goal-sub">${esc(victimTeam.name)} to take it</div>`
            : `<div class="save-text">Foul! Free kick to ${esc(victimTeam.name)}</div>`, 1800);
        } else if (ev.type === 'kickoff' && s.clock > 0.1) {
          showBanner(`<div class="save-text">Kick off!</div>`, 900);
        } else if (ev.type === 'restart') {
          const team = s.teams[ev.side!];
          const what = ev.kind === 'corner' ? 'Corner' : ev.kind === 'goalkick' ? 'Goal kick' : 'Throw-in';
          showBanner(`<div class="save-text">${what} to ${esc(team.name)}</div>`, 1400);
        } else if (ev.type === 'trick' && ev.ok) {
          showBanner(ev.kind === 'nutmeg'
            ? `<div class="goal-text goal-text-small">NUTMEG!</div><div class="goal-sub">${esc(ev.player?.name ?? '')} through the legs!</div>`
            : `<div class="save-text">Step-over! ${esc(ev.player?.name ?? '')} sends them the wrong way!</div>`, 1300);
        }
      }
      if (mode === 'match') {
        // Coach the human taker through their own set pieces.
        const sp = s.phase === 'setpiece' ? s.setPiece : null;
        const mine = sp && sp.placed && (sp.taker === s.controlled || sp.taker === s.controlled2) ? sp : null;
        const keys = mine && sp!.taker === s.controlled2 ? tipKeys('p2') : touch ? TOUCH_TIP_KEYS : tipKeys(s.config.humanSide2 != null ? 'p1' : 'solo');
        const text = !mine ? '' : mine.kind === 'throwin' ? `Throw-in: aim, then ${keys.pass} to throw it to a team-mate`
          : mine.kind === 'corner' ? `Corner: hold ${keys.shoot} to cross it into the box, or ${keys.pass} for a short one`
          : mine.kind === 'goalkick' ? `Goal kick: hold ${keys.shoot} to boot it, or ${keys.pass} to a team-mate`
          : mine.kind === 'freekick' ? `Free kick: aim, then hold ${keys.shoot} to shoot or ${keys.pass} to pass`
          : `Penalty: aim, hold ${keys.shoot} and let go!`;
        if (tip.textContent !== text) tip.textContent = text;
      }
      if (s.phase !== lastPhase) {
        lastPhase = s.phase;
        if (!(coach && coach.step === 'done')) renderOverlay(s);
      }
      if (coach) renderTutorial(coach);
    },
    destroy() {
      window.clearTimeout(bannerTimer);
      root.innerHTML = '';
    },
  };
}

const touch = typeof window !== 'undefined' && window.matchMedia('(pointer: coarse)').matches;
const tipKeys = (profile: 'solo' | 'p1' | 'p2') => ({ shoot: firstKey(profile, 'shoot'), pass: firstKey(profile, 'pass') });
const TOUCH_TIP_KEYS = { shoot: 'Shoot', pass: 'Pass' };

const kbd = (a: 'shoot' | 'pass' | 'trick') => `<kbd>${esc(firstKey('solo', a))}</kbd>`;
/** Built on demand so the cards show the player's own key bindings. */
const TUTORIAL_TEXT = (): Record<Exclude<TutorialStep, 'done'>, { title: string; keys: string; touch: string }> => ({
  move: { title: '1. Run with the ball', keys: `Use <kbd>${esc(moveKeysLabel('solo'))}</kbd> or the stick to dribble to the yellow star.`, touch: 'Drag the joystick to dribble to the yellow star.' },
  pass: { title: '2. Pass to your team-mate', keys: `Point towards your team-mate and press ${kbd('pass')} to pass.`, touch: 'Point the joystick towards your team-mate and tap <b>Pass</b>.' },
  shoot: { title: '3. Score a goal!', keys: `Run at goal, hold ${kbd('shoot')} to power up, then let go to shoot.`, touch: 'Run at goal, hold <b>Shoot</b> to power up, then let go.' },
  trick: { title: '4. Show off a trick', keys: `Press ${kbd('trick')} for a step-over. With a defender right in front, it's a nutmeg!`, touch: 'Tap <b>Trick</b> for a step-over. With a defender right in front, it\'s a nutmeg!' },
});

const GOAL_LINES = ['What a strike!', 'Top corner!', 'The keeper had no chance!', 'Cool as you like!', 'Smashed it!', 'Into the net!', 'Goal of the season?', 'Brilliant finish!'];
const SAVE_LINES = ['What a stop!', 'Fingertips!', 'Safe hands!', 'Denied!'];
const MISS_LINES = ['Over the bar!', 'Just wide!', 'Unlucky!', 'Next time!'];
const pickLine = (lines: string[]) => lines[Math.floor(Math.random() * lines.length)];

function confetti(root: HTMLElement, c1: string, c2: string): void {
  if (getSettings().reduceMotion) return;
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
