import type { MatchSim, Side, SimEvent } from '../game/sim';
import { POSITION_LABELS, type Player } from '../data/types';
import { wireDragSwap } from './dragSwap';
import { soundSettings, wireSoundSettings } from './soundSettings';
import { graphicsSettings, wireGraphicsSettings } from './graphicsSettings';
import { TUTORIAL_STEPS, type TutorialCoach, type TutorialStep } from '../game/tutorial';
import { getSettings } from '../data/storage';
import { CAMERA_HEIGHTS, CAMERA_HEIGHT_LABELS, PORTRAIT_VIEW_LABELS, controlsSentence, firstKey, getControls, moveKeysLabel, saveControls, type CameraHeight, type PortraitView } from '../data/controls';
import { badgeSvg } from './kitPreview';
import { SUPERS, type SuperKind } from '../game/supers';

export interface HudRefs {
  joystickZone: HTMLElement;
  joystickBase: HTMLElement;
  joystickKnob: HTMLElement;
  btnShoot: HTMLElement;
  btnPass: HTMLElement;
  btnSprint: HTMLElement;
  btnSwitch: HTMLElement;
  btnTrick: HTMLElement;
  btnLob: HTMLElement;
  /** `lines[i]` is the commentator's line for `events[i]`, or null. */
  update(sim: MatchSim, events: SimEvent[], lines?: (string | null)[]): void;
  /** Show a commentary line in the ticker. */
  say(line: string): void;
  /**
   * Start or end the goal replay: the buttons, bars and scoreboard go, cinema bars and a film look come in,
   * and a tap anywhere skips it. `info` names the scorer for the caption.
   */
  setReplay(on: boolean, info?: ReplayInfo): void;
  /** The replay cuts to its slow-motion close-up: a flash, and the scorer's caption slides in. */
  replayCut(): void;
  /** A super skill's cutscene overlay (or, with `quick`, just its banner for a moment). */
  superStart(kind: SuperKind, who: { number: number; name: string }, yours: boolean, team: string, quick: boolean): void;
  /** Where the hero is on screen, 0..1 across and down, so the glow and speed lines centre on them. */
  superFocus(x: number, y: number): void;
  superEnd(): void;
  /** Open the subs card for a side (the match pauses while it is up). */
  openSubs(side: Side): void;
  destroy(): void;
}

/** Who scored, for the replay's caption. `lite` (Low graphics) leaves out the film grain and colour grade. */
export interface ReplayInfo { name: string; team: string; minute: number; ownGoal: boolean; lite: boolean }

/** What the subs card tells the match. */
export interface SubsCallbacks {
  /** Open the subs card for a side: pause the match and call openSubs. */
  onOpenSubs(side: Side): void;
  /** The line-up picked on the card: `lineup[i]` goes in sim.teamOf(side)[i]'s spot. */
  onSubs(side: Side, lineup: string[]): void;
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

/** Confetti in the scorer's colours and a pop on their score, unless motion is set to calm. */
function celebrate(root: HTMLElement, kit: { shirt: string; shirt2: string }, side: number): void {
  if (getSettings().reduceMotion) return;
  const box = document.createElement('div');
  box.className = 'confetti';
  box.setAttribute('aria-hidden', 'true');
  const colours = [kit.shirt, kit.shirt2, '#ffd23f'];
  for (let i = 0; i < 48; i++) {
    const bit = document.createElement('i');
    bit.style.cssText = `left:${(Math.random() * 100).toFixed(1)}%;background:${colours[i % colours.length]};animation-delay:${(Math.random() * 0.4).toFixed(2)}s;animation-duration:${(1.6 + Math.random() * 1.2).toFixed(2)}s`;
    box.appendChild(bit);
  }
  root.appendChild(box);
  setTimeout(() => box.remove(), 3400);
  const score = root.querySelector<HTMLElement>(side === 0 ? '#sb-h' : '#sb-a');
  if (score) { score.classList.remove('is-pop'); void score.offsetWidth; score.classList.add('is-pop'); }
}

export function renderHud(root: HTMLElement, sim: MatchSim, cb: { onPause(): void; onResume(): void; onQuit(): void; onFinish(): void; onCamera?(): void; onSkipReplay?(): void } & Partial<SubsCallbacks>, coach?: TutorialCoach): HudRefs {
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
      ${mode === 'match' ? '<button class="hud-subs" id="hud-subs" hidden aria-label="Subs"><span aria-hidden="true">🔁</span><span class="hud-subs-txt" aria-hidden="true">Subs</span></button>' : ''}
      <div class="hud-player-box hud-player-box-p2" id="hud-player-box-2" style="display:none">
        <div class="hud-player hud-player-p2" id="hud-player-2"></div>
        <div class="bar"><span class="bar-label">Sprint</span><div class="bar-track"><div class="bar-fill bar-stamina" id="bar-stamina-2"></div></div></div>
        <div class="bar"><span class="bar-label">Power</span><div class="bar-track"><div class="bar-fill bar-power" id="bar-power-2"></div></div></div>
        <div class="bar bar-super-row" id="bar-super-row-2" hidden><span class="bar-label" id="bar-super-label-2">⭐ Super</span><div class="bar-track"><div class="bar-fill bar-super" id="bar-super-2"></div></div></div>
      </div>
      <div class="hud-player-box" id="hud-player-box">
        <div class="hud-player" id="hud-player"></div>
        <div class="bar"><span class="bar-label">Sprint</span><div class="bar-track"><div class="bar-fill bar-stamina" id="bar-stamina"></div></div></div>
        <div class="bar"><span class="bar-label">Power</span><div class="bar-track"><div class="bar-fill bar-power" id="bar-power"></div></div></div>
        <div class="bar bar-super-row" id="bar-super-row" hidden><span class="bar-label" id="bar-super-label">⭐ Super</span><div class="bar-track"><div class="bar-fill bar-super" id="bar-super"></div></div></div>
      </div>
      <div class="super-cut" id="super-cut" hidden>
        <div class="sc-halo"></div><div class="sc-lines"></div><div class="sc-vig"></div><div class="sc-letterbox"></div><div class="sc-flash"></div>
        <div class="sc-burst" aria-hidden="true">SUPER!</div>
        <div class="sc-ban"><div class="sc-a"></div><div class="sc-b"><span class="sc-ico"></span> <span class="sc-name"></span></div><div class="sc-n"></div></div>
      </div>
      <div class="hud-banner" id="hud-banner"></div>
      <div id="hud-live" aria-live="polite" style="position:absolute;width:1px;height:1px;margin:-1px;padding:0;border:0;overflow:hidden;clip-path:inset(50%);white-space:nowrap"></div>
      <div class="replay-frame" id="replay-frame" hidden>
        <div class="rf-grade"></div><div class="rf-grain"></div><div class="rf-vig"></div>
        <div class="rf-bar rf-top"></div><div class="rf-bar rf-bottom"></div>
        <span class="replay-label">REPLAY</span>
        <div class="rf-cap" id="rf-cap"></div>
        <div class="rf-skip"><span class="rf-skip-touch">Tap to skip</span><span class="rf-skip-keys">Press any button to skip</span></div>
        <div class="rf-flash"></div>
        <div class="rf-wipe" aria-hidden="true"></div>
      </div>
      <div class="hud-comm" id="hud-comm"><span class="hud-comm-mic">🎙️</span><span id="hud-comm-text"></span></div>
      ${touchControlsHtml(getControls().touch)}
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
  const btnShoot = q('btn-shoot');
  const btnSprint = q('btn-sprint');
  const btnPass = q('btn-pass');
  const playerBox2 = q('hud-player-box-2');
  const playerLabel2 = q('hud-player-2');
  const barStamina2 = q('bar-stamina-2');
  const barPower2 = q('bar-power-2');
  const pauseBtn = q<HTMLButtonElement>('hud-pause');
  const tip = q('hud-tip');
  const comm = q('hud-comm');
  const commText = q('hud-comm-text');
  const replayFrame = q('replay-frame');
  const replayCap = q('rf-cap');
  const hudEl = root.querySelector<HTMLElement>('.hud')!;
  let replayTimer = 0;
  // While the replay plays, a tap anywhere on it skips it.
  replayFrame.addEventListener('pointerdown', (e) => {
    if (replayFrame.classList.contains('is-out')) return;
    e.preventDefault();
    cb.onSkipReplay?.();
  });
  /** Play a one-off CSS animation again from the start. */
  const replayAnim = (cls: string) => { replayFrame.classList.remove(cls); void replayFrame.offsetWidth; replayFrame.classList.add(cls); };
  const btnTrick = q('btn-trick');
  const superCut = q('super-cut');
  const superRows = [q('bar-super-row'), q('bar-super-row-2')];
  const superBars = [q('bar-super'), q('bar-super-2')];
  const superLabels = [q('bar-super-label'), q('bar-super-label-2')];
  let trickShows: SuperKind | 'trick' = 'trick';
  let superTimer = 0;
  /** The star meters: a bar for keyboard and controller, and the Trick button that turns into the Super button. */
  const showSupers = (sim: MatchSim) => {
    const sides = [sim.config.humanSide, sim.config.humanSide2];
    sides.forEach((side, i) => {
      const on = sim.supersOn && side != null;
      superRows[i].hidden = !on;
      if (!on || side == null) return;
      const ready = sim.superReady(side) ? sim.superFor(side) : null;
      superBars[i].style.width = `${Math.round(sim.superMeter[side] * 100)}%`;
      superRows[i].classList.toggle('is-ready', !!ready);
      const label = ready ? `${SUPERS[ready.kind].icon} ${SUPERS[ready.kind].name}! Press Trick` : '⭐ Super';
      if (superLabels[i].textContent !== label) superLabels[i].textContent = label;
      if (i !== 0) return;
      btnTrick.style.setProperty('--meter', sim.superMeter[side].toFixed(2));
      btnTrick.classList.toggle('has-meter', true);
      const shows = ready ? ready.kind : 'trick';
      if (shows === trickShows) return;
      trickShows = shows;
      btnTrick.classList.toggle('is-super', !!ready);
      btnTrick.setAttribute('aria-label', ready ? `Super: ${SUPERS[ready.kind].name}` : 'Trick');
      btnTrick.innerHTML = ready
        ? `<span class="abtn-ico" aria-hidden="true">${SUPERS[ready.kind].icon}</span><span class="abtn-txt" aria-hidden="true">Super</span>`
        : '<span class="abtn-ico" aria-hidden="true">✨</span><span class="abtn-txt" aria-hidden="true">Trick</span>';
    });
  };
  let commTimer = 0;
  const say = (text: string) => {
    commText.textContent = text;
    comm.classList.remove('show');
    void comm.offsetWidth; // restart the pop-in animation
    comm.classList.add('show');
    window.clearTimeout(commTimer);
    commTimer = window.setTimeout(() => comm.classList.remove('show'), Math.min(7000, 2500 + text.length * 60));
  };
  const live = q('hud-live');
  /** Tell screen-reader users what just happened (goals, half time, full time). */
  const announce = (text: string) => {
    live.textContent = '';
    window.setTimeout(() => { live.textContent = text; }, 60); // a fresh change, so the same words are read again
  };
  const scoreLine = (s: MatchSim) => mode === 'training' ? `${s.trainingPoints} points` : `${home.name} ${s.score[0]}, ${away.name} ${s.score[1]}`;

  // While a card with buttons is up (paused, full time, tutorial done) the keyboard drives the card, not the
  // game: Tab, Enter, Space and the arrows work as on any page. The pause keys still reach the game.
  const pauseKeys = new Set(Object.values(getControls().keys).flatMap((m) => m.pause));
  const cardButtons = () => [...overlay.querySelectorAll<HTMLElement>('button:not([disabled]), input:not([disabled])')];
  const primary = () => overlay.querySelector<HTMLElement>('.btn-primary');
  const onCardKey = (e: KeyboardEvent) => {
    if (overlay.hidden || !cardButtons().length || pauseKeys.has(e.code)) return;
    if (!overlay.contains(document.activeElement)) {
      if (e.key !== 'Tab' && e.key !== 'Enter' && e.key !== ' ') return;
      e.preventDefault();
      primary()?.focus();
    }
    e.stopPropagation();
  };
  window.addEventListener('keydown', onCardKey, true);
  // A controller works the card too: the d-pad or stick moves between buttons, A presses (Start as well, except
  // on the pause card, where Start already means "keep playing").
  let padWas = new Set<number>();
  let stickWas = 0;
  const cardPad = (s: MatchSim) => {
    const btns = overlay.hidden ? [] : cardButtons();
    const pads = typeof navigator !== 'undefined' && navigator.getGamepads ? [...navigator.getGamepads()].filter((g): g is Gamepad => !!g && g.connected) : [];
    const now = new Set<number>();
    let stick = 0;
    for (const g of pads) {
      g.buttons.forEach((b, i) => { if (b.pressed) now.add(i); });
      const ay = g.axes[1] ?? 0, ax = g.axes[0] ?? 0;
      if (Math.abs(ay) > 0.6 || Math.abs(ax) > 0.6) stick = (Math.abs(ay) > Math.abs(ax) ? ay : ax) > 0 ? 1 : -1;
    }
    const hit = (i: number) => now.has(i) && !padWas.has(i);
    const step = hit(12) || hit(14) || (stick < 0 && stickWas >= 0) ? -1 : hit(13) || hit(15) || (stick > 0 && stickWas <= 0) ? 1 : 0;
    padWas = now;
    stickWas = stick;
    if (!btns.length) return;
    const at = btns.indexOf(document.activeElement as HTMLElement);
    if (step) { (btns[(Math.max(0, at) + step + btns.length) % btns.length] ?? btns[0]).focus(); return; }
    if (hit(0) || (hit(9) && s.phase !== 'paused')) (at >= 0 ? btns[at] : primary() ?? btns[0]).click();
  };
  /** Put focus on a new card's main button, so Enter, Space or a controller's A press it straight away. */
  const focusCard = () => primary()?.focus({ preventScroll: true });

  const pensH = root.querySelector<HTMLElement>('#pens-h');
  const pensA = root.querySelector<HTMLElement>('#pens-a');
  let bannerTimer = 0;
  let lastPhase = '';
  let lastPens = -1;
  let lastTaking: number | null = null;
  pauseBtn.addEventListener('click', () => cb.onPause());

  // Subs: a button by Pause (player 1's team), and on the pause card for each player's team.
  const subsBtn = root.querySelector<HTMLButtonElement>('#hud-subs');
  const subsTxt = subsBtn?.querySelector<HTMLElement>('.hud-subs-txt') ?? null;
  subsBtn?.addEventListener('click', () => { if (sim.config.humanSide != null) cb.onOpenSubs?.(sim.config.humanSide); });
  /** The card being shown: whose team, the planned line-up, the player picked by a tap, and whether the pause card opened it. */
  let subs: { side: Side; plan: string[]; picked: string | null; fromPause: boolean; undrag: () => void } | null = null;
  const closeSubs = () => { subs?.undrag(); subs = null; };
  /** Get the subs card ready (it starts from the line-up with any waiting subs on), and draw it now if the match is paused. */
  const openSubsCard = (s: MatchSim, side: Side, fromPause: boolean) => {
    closeSubs();
    const plan = s.teamOf(side).map((p, i) => s.pendingSubs[side].get(i)?.id ?? p.id);
    const card = { side, plan, picked: null, fromPause, undrag: () => {} };
    subs = card;
    // Drop a bench player on a pitch player (or the other way round) to swap them.
    card.undrag = wireDragSwap(overlay, (a, b) => { if (subs === card && planSwap(card.plan, a, b)) { card.picked = null; renderSubs(s, b); } });
    if (s.phase === 'paused') renderSubs(s); // otherwise renderOverlay draws it when the pause takes effect
  };
  /** Swap a player in the line-up with one out of it. Two on the pitch, or two on the bench, do not swap. */
  const planSwap = (plan: string[], a: string, b: string): boolean => {
    const ia = plan.indexOf(a), ib = plan.indexOf(b);
    if ((ia >= 0) === (ib >= 0)) return false;
    if (ia >= 0) plan[ia] = b; else plan[ib] = a;
    return true;
  };
  const renderSubs = (s: MatchSim, focusId?: string) => {
    const c = subs!;
    const side = c.side;
    const team = s.teams[side];
    const onPitch = s.teamOf(side);
    const everyone: Player[] = [...onPitch.map((p) => p.info), ...s.bench[side]];
    const byId = new Map(everyone.map((p) => [p.id, p]));
    const benchNow = everyone.filter((p) => !c.plan.includes(p.id));
    const changes = c.plan.filter((id, i) => id !== onPitch[i].id).length;
    const two = s.config.humanSide2 != null;
    const tile = (pl: Player, where: string, coming: '' | 'on' | 'off', gloves: boolean) => {
      const energy = Math.round(s.energyOf(pl.id) * 100);
      return `<button class="subs-player ${c.picked === pl.id ? 'is-picked' : ''} ${coming ? `is-${coming}` : ''}" data-swap="${esc(pl.id)}" data-swap-instant data-pick="${esc(pl.id)}" data-swap-label="${pl.number} ${esc(pl.name)}" aria-pressed="${c.picked === pl.id}"
        aria-label="${pl.number} ${esc(pl.name)}, ${where}, energy ${energy}%${coming === 'on' ? ', coming on' : coming === 'off' ? ', coming off' : ''}">
        <span class="subs-num" style="background:${esc(team.kit.shirt)}">${pl.number}</span>
        <span class="subs-name">${esc(pl.name)}</span>
        <span class="subs-pos">${where}${gloves && pl.position !== 'GK' ? ' 🧤' : ''}</span>
        <span class="subs-energy" aria-hidden="true"><i class="${energy < 40 ? 'is-low' : ''}" style="width:${energy}%"></i></span>
        ${coming ? `<span class="chip subs-chip">${coming === 'on' ? 'Coming on' : 'Coming off'}</span>` : ''}
      </button>`;
    };
    const status = changes === 0 ? 'Drag a sub from the bench onto a player on the pitch to swap them.'
      : s.ballDead() ? `${changes === 1 ? 'The change happens' : 'The changes happen'} as soon as you press Done.`
        : `The ball is in play, so ${changes === 1 ? 'the sub comes' : 'the subs come'} on when it next goes out.`;
    overlay.hidden = false;
    overlay.innerHTML = `
      <div class="card overlay-card subs-card">
        <h2>🔁 ${two ? `P${side === s.config.humanSide ? 1 : 2} subs` : 'Subs'}</h2>
        <p class="muted subs-status" aria-live="polite">${status}</p>
        <div class="subs-label">On the pitch</div>
        <div class="subs-row subs-pitch">${c.plan.map((id, i) => {
          const p = onPitch[i];
          return tile(byId.get(id)!, POSITION_LABELS[p.isKeeper ? 'GK' : p.role], id !== p.id ? 'on' : '', p.isKeeper);
        }).join('')}</div>
        <div class="subs-hint" aria-hidden="true">⬆️ Drag a sub up onto a player, or tap one and then the other ⬆️</div>
        <div class="subs-label">On the bench</div>
        <div class="subs-row subs-bench">${benchNow.map((pl) => tile(pl, 'Sub', onPitch.some((p) => p.id === pl.id) ? 'off' : '', false)).join('')}</div>
        <div class="row">
          <button class="btn btn-primary" id="subs-done">Done ✅</button>
          <button class="btn btn-ghost" id="subs-cancel">${c.fromPause ? 'Back' : 'Cancel'}</button>
        </div>
      </div>`;
    overlay.querySelectorAll<HTMLElement>('[data-pick]').forEach((b) => b.addEventListener('click', () => {
      const id = b.dataset.pick!;
      if (c.picked === id) c.picked = null;
      else if (c.picked && planSwap(c.plan, c.picked, id)) c.picked = null;
      else c.picked = id;
      renderSubs(s, id);
    }));
    overlay.querySelector('#subs-done')!.addEventListener('click', () => {
      cb.onSubs?.(side, [...c.plan]);
      closeSubs();
      cb.onResume();
    });
    overlay.querySelector('#subs-cancel')!.addEventListener('click', () => {
      const back = c.fromPause;
      closeSubs();
      if (back) renderOverlay(s); else cb.onResume();
    });
    const again = focusId ? [...overlay.querySelectorAll<HTMLElement>('[data-pick]')].find((b) => b.dataset.pick === focusId) : null;
    if (again) again.focus({ preventScroll: true }); else focusCard();
  };
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
      focusCard();
      announce("You're ready! Tutorial complete.");
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

  /** Buttons on the pause card to open each human team's subs card. */
  const subsButtons = (s: MatchSim) => {
    if (mode !== 'match' || !cb.onSubs) return '';
    const sides = [s.config.humanSide, s.config.humanSide2].filter((x): x is Side => x != null && s.canSub(x));
    if (!sides.length) return '';
    const two = s.config.humanSide2 != null;
    return `<div class="row">${sides.map((side) => `<button class="btn btn-ghost" data-subs="${side}">🔁 ${two ? `P${side === s.config.humanSide ? 1 : 2} subs` : 'Make a sub'}${s.pendingSubs[side].size ? ' (ready)' : ''}</button>`).join('')}</div>`;
  };

  const renderOverlay = (s: MatchSim) => {
    if (s.phase !== 'paused') closeSubs();
    if (s.phase === 'paused' && subs) { renderSubs(s); return; }
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
                : touch
                  ? '<p class="muted">Drag the stick to run, hold Shoot to power up, then let go. The orange ring marks your player.</p>'
                  : `<p class="muted">${esc(controlsSentence('solo'))}. Hold shoot to power up, then let go. A controller works too. The orange ring and arrow mark your player; the small rings show each team's colour.</p>`}
          ${subsButtons(s)}
          ${cameraPicker()}
          ${soundSettings()}
          ${graphicsSettings(true)}
          <div class="row">
            <button class="btn btn-primary" id="ov-resume">Keep playing</button>
            <button class="btn btn-ghost" id="ov-quit">${mode === 'tutorial' ? 'Skip tutorial' : 'Quit match'}</button>
          </div>
        </div>`;
      overlay.querySelector('#ov-resume')!.addEventListener('click', () => cb.onResume());
      overlay.querySelectorAll<HTMLElement>('[data-subs]').forEach((b) => b.addEventListener('click', () => openSubsCard(s, Number(b.dataset.subs) as Side, true)));
      wireSoundSettings(overlay);
      wireGraphicsSettings(overlay);
      overlay.querySelectorAll<HTMLElement>('[data-cam-height], [data-cam-view]').forEach((b) => b.addEventListener('click', () => {
        const c = structuredClone(getControls());
        if (b.dataset.camHeight) c.camera.height = b.dataset.camHeight as CameraHeight;
        if (b.dataset.camView) c.camera.portrait = b.dataset.camView as PortraitView;
        saveControls(c);
        const now = getControls().camera;
        overlay.querySelectorAll<HTMLElement>('[data-cam-height]').forEach((x) => x.classList.toggle('is-active', x.dataset.camHeight === now.height));
        overlay.querySelectorAll<HTMLElement>('[data-cam-view]').forEach((x) => x.classList.toggle('is-active', x.dataset.camView === now.portrait));
        cb.onCamera?.();
      }));
      overlay.querySelector('#ov-full')?.addEventListener('click', () => { toggleFullscreen(); });
      overlay.querySelector('#ov-quit')!.addEventListener('click', () => cb.onQuit());
      focusCard();
    } else if (s.phase === 'halftime') {
      overlay.hidden = false;
      overlay.innerHTML = `<div class="card overlay-card"><h2>Half time</h2><p class="score-big">${s.score[0]} – ${s.score[1]}</p><p class="muted">Have an orange slice! Second half coming up.</p></div>`;
      announce(`Half time. ${scoreLine(s)}.`);
    } else if (s.phase === 'fulltime') {
      overlay.hidden = false;
      overlay.innerHTML = `
        <div class="card overlay-card">
          <h2>${mode === 'training' ? "Time's up!" : mode === 'shootout' ? 'Shoot-out over!' : 'Full time!'}</h2>
          ${mode === 'training' ? `<p class="score-big">${s.trainingPoints} points</p>` : `<div class="ft-score">
            <div class="ft-team">${badgeSvg(home.badge, 48)}<span>${esc(home.name)}</span></div>
            <p class="score-big">${s.score[0]} – ${s.score[1]}</p>
            <div class="ft-team">${badgeSvg(away.badge, 48)}<span>${esc(away.name)}</span></div>
          </div>`}
          <button class="btn btn-primary" id="ov-finish">See the results</button>
        </div>`;
      overlay.querySelector('#ov-finish')!.addEventListener('click', () => cb.onFinish());
      focusCard();
      announce(`${mode === 'training' ? "Time's up" : mode === 'shootout' ? 'Shoot-out over' : 'Full time'}. ${scoreLine(s)}.`);
    } else {
      // Focus was on the card's button; give it back to the page so the game keys work again.
      if (overlay.contains(document.activeElement)) (document.activeElement as HTMLElement).blur();
      overlay.hidden = true;
      overlay.innerHTML = '';
    }
  };

  return {
    joystickZone: q('joy-area'),
    joystickBase: q('joy'),
    joystickKnob: q('joy-knob'),
    btnShoot,
    btnPass,
    btnSprint,
    btnSwitch: q('btn-switch'),
    btnTrick: q('btn-trick'),
    btnLob: q('btn-lob'),
    say,
    setReplay(on, info) {
      window.clearTimeout(replayTimer);
      hudEl.classList.toggle('is-replay', on);
      if (on) {
        replayFrame.classList.remove('is-out', 'is-slow');
        replayFrame.classList.toggle('is-lite', !!info?.lite);
        replayCap.innerHTML = info && info.name
          ? `<span class="rf-cap-ball" aria-hidden="true">⚽</span><b>${info.ownGoal ? 'Own goal' : esc(info.name)}</b><span class="rf-cap-sub">${esc(info.team)} · ${info.minute}'</span>`
          : '';
        replayFrame.hidden = false;
        replayAnim('is-in');
        announce('Replay. Tap to skip.');
      } else if (!replayFrame.hidden) {
        // The bars slide away behind a last star wipe, then the frame goes.
        replayFrame.classList.remove('is-in');
        replayAnim('is-out');
        replayTimer = window.setTimeout(() => { replayFrame.hidden = true; replayFrame.classList.remove('is-out', 'is-slow'); }, 500);
      }
    },
    replayCut() { replayAnim('is-slow'); },
    superStart(kind, who, yours, team, quick) {
      const info = SUPERS[kind];
      superCut.style.setProperty('--c', info.css);
      superCut.classList.toggle('is-quick', quick);
      superCut.classList.toggle('is-theirs', !yours);
      superCut.querySelector('.sc-a')!.textContent = yours ? '⭐ SUPER SKILL!' : `😮 ${team} SUPER!`;
      superCut.querySelector('.sc-ico')!.textContent = info.icon;
      superCut.querySelector('.sc-name')!.textContent = info.name.toUpperCase();
      superCut.querySelector('.sc-n')!.textContent = `#${who.number} ${who.name}`;
      // Restart the animations from the top.
      superCut.hidden = true;
      superCut.classList.remove('is-on');
      void superCut.offsetWidth;
      superCut.hidden = false;
      superCut.classList.add('is-on');
      say(info.line(who.name));
      window.clearTimeout(superTimer);
      if (quick) superTimer = window.setTimeout(() => { superCut.hidden = true; superCut.classList.remove('is-on'); }, 1800);
    },
    superFocus(x, y) {
      superCut.style.setProperty('--hx', `${(x * 100).toFixed(1)}%`);
      superCut.style.setProperty('--hy', `${(y * 100).toFixed(1)}%`);
    },
    superEnd() {
      window.clearTimeout(superTimer);
      superCut.hidden = true;
      superCut.classList.remove('is-on');
    },
    openSubs(side) {
      if (sim.canSub(side) && sim.phase !== 'fulltime') openSubsCard(sim, side, false);
    },
    update(s, events, lines) {
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
          tip.textContent = s.phase === 'setpiece' ? (human ? `${s.teams[so.taking].short} to take: hold shoot, aim, release!` : humanKeeper ? 'You are in goal: push left or right to dive!' : `${s.teams[so.taking].short} to take…`) : '';
        }
      }
      if (s.controlled) {
        playerLabel.textContent = `#${s.controlled.info.number} ${s.controlled.info.name}`;
        playerBox.style.display = '';
        barStamina.style.width = `${Math.round(s.controlled.stamina * 100)}%`;
        // One power bar: red while a shot is powered up, blue while a pass is.
        const passing = s.controlled.passCharge > 0;
        barPower.style.width = `${Math.round((passing ? s.controlled.passCharge : s.controlled.charge) * 100)}%`;
        barPower.parentElement!.parentElement!.classList.toggle('is-charging', s.controlled.charge > 0);
        barPower.parentElement!.parentElement!.classList.toggle('is-passing', passing);
        btnShoot.style.setProperty('--charge', s.controlled.charge.toFixed(2));
        btnPass.style.setProperty('--charge', s.controlled.passCharge.toFixed(2));
        btnSprint.style.setProperty('--stamina', s.controlled.stamina.toFixed(2));
      } else playerBox.style.display = 'none';
      if (s.controlled2) {
        playerLabel2.textContent = `P2 · #${s.controlled2.info.number} ${s.controlled2.info.name}`;
        playerBox2.style.display = '';
        barStamina2.style.width = `${Math.round(s.controlled2.stamina * 100)}%`;
        const passing2 = s.controlled2.passCharge > 0;
        barPower2.style.width = `${Math.round((passing2 ? s.controlled2.passCharge : s.controlled2.charge) * 100)}%`;
        barPower2.parentElement!.parentElement!.classList.toggle('is-passing', passing2);
      } else playerBox2.style.display = 'none';
      showSupers(s);
      if (subsBtn && subsTxt) {
        const side = s.config.humanSide;
        const can = side != null && s.canSub(side) && s.phase !== 'fulltime';
        if (subsBtn.hidden === can) subsBtn.hidden = !can;
        if (can) {
          const waiting = s.pendingSubs[side].size > 0;
          subsBtn.classList.toggle('is-waiting', waiting);
          subsBtn.classList.toggle('is-ready', !waiting && s.ballDead() && s.phase !== 'paused');
          const word = waiting ? 'Ready' : 'Subs';
          if (subsTxt.textContent !== word) { subsTxt.textContent = word; subsBtn.setAttribute('aria-label', waiting ? 'Subs: a sub is ready to come on' : 'Subs'); }
        }
      }
      // Subs made this frame: one banner, naming the team when it is the computer's change.
      const changes = events.filter((ev) => ev.type === 'sub' && ev.player && ev.off);
      if (changes.length) {
        const onComes = (ev: SimEvent) => (s.isHuman(ev.side!) ? 'On comes' : `${s.teams[ev.side!].name}: on comes`);
        showBanner(`<div class="save-text">🔁 ${changes.map((ev) => `${esc(onComes(ev))} <strong>${esc(ev.player!.name)}</strong> for ${esc(ev.off!.name)}`).join('<br/>')}</div>`, 2200);
        announce(changes.map((ev) => `${onComes(ev)} ${ev.player!.name} for ${ev.off!.name}.`).join(' '));
      }
      events.forEach((ev, i) => {
        const said = lines?.[i] ?? null;
        if (ev.type === 'goal' && ev.player) {
          const team = s.teams[ev.side!];
          const own = s.goals[s.goals.length - 1]?.ownGoal;
          showBanner(`<div class="goal-text">GOAL!</div><div class="goal-sub">${esc(ev.player.name)} #${ev.player.number}${own ? ' (own goal)' : ''} · ${esc(team.name)}</div><div class="commentary">${esc(said ?? (own ? 'Oh no, into their own net!' : pickLine(GOAL_LINES)))}</div>`, 3000);
          announce(`Goal for ${team.name}! ${ev.player.name}${own ? ', own goal' : ''}. ${scoreLine(s)}.`);
          if (mode !== 'training') celebrate(root, team.kit, ev.side!);
          confetti(root, team.kit.shirt, team.kit.shirt2);
        } else if (ev.type === 'save') {
          showBanner(`<div class="save-text">${pickLine(SAVE_LINES)} Great save, ${esc(ev.player?.name ?? 'keeper')}!</div>`, 1200);
          if (said) say(said);
        } else if (ev.type === 'miss') {
          showBanner(`<div class="save-text">${pickLine(MISS_LINES)}</div>`, 1200);
          if (said) say(said);
        } else if (ev.type === 'foul') {
          const victimTeam = s.teams[1 - ev.side!];
          showBanner(ev.kind === 'penalty'
            ? `<div class="goal-text goal-text-small">PENALTY!</div><div class="goal-sub">${esc(victimTeam.name)} to take it</div>`
            : `<div class="save-text">Foul! Free kick to ${esc(victimTeam.name)}</div>`, 1800);
          if (said) say(said);
        } else if (ev.type === 'kickoff' && s.clock > 0.1) {
          showBanner(`<div class="save-text">Kick off!</div>`, 900);
          if (said) say(said);
        } else if (ev.type === 'restart') {
          const team = s.teams[ev.side!];
          const what = ev.kind === 'corner' ? 'Corner' : ev.kind === 'goalkick' ? 'Goal kick' : 'Throw-in';
          showBanner(`<div class="save-text">${what} to ${esc(team.name)}</div>`, 1400);
          if (said) say(said);
        } else if (ev.type === 'trick' && ev.ok) {
          showBanner(ev.kind === 'nutmeg'
            ? `<div class="goal-text goal-text-small">NUTMEG!</div><div class="goal-sub">${esc(ev.player?.name ?? '')} through the legs!</div>`
            : `<div class="save-text">Step-over! ${esc(ev.player?.name ?? '')} sends them the wrong way!</div>`, 1300);
          if (said) say(said);
        } else if (said) say(said);
      });
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
      cardPad(s);
    },
    destroy() {
      closeSubs();
      window.clearTimeout(bannerTimer);
      window.clearTimeout(commTimer);
      window.removeEventListener('keydown', onCardKey, true);
      root.innerHTML = '';
    },
  };
}

const touch = typeof window !== 'undefined' && window.matchMedia('(pointer: coarse)').matches;

/** Camera height pills, plus the upright-phone view and a full-screen button on touch screens. */
function cameraPicker(): string {
  const cam = getControls().camera;
  const canFull = touch && typeof document !== 'undefined' && document.fullscreenEnabled;
  return `
    <div class="cam-picker">
      <div class="cam-row"><span class="cam-label">📷 Camera</span><div class="pills">${CAMERA_HEIGHTS.map((h) => `<button class="pill ${h === cam.height ? 'is-active' : ''}" data-cam-height="${h}">${CAMERA_HEIGHT_LABELS[h]}</button>`).join('')}</div></div>
      ${touch ? `<div class="cam-row"><span class="cam-label">📱 Phone upright</span><div class="pills">${(['upfield', 'side'] as PortraitView[]).map((v) => `<button class="pill ${v === cam.portrait ? 'is-active' : ''}" data-cam-view="${v}">${PORTRAIT_VIEW_LABELS[v]}</button>`).join('')}</div></div>` : ''}
      ${canFull ? '<button class="btn btn-ghost btn-small" id="ov-full">⛶ Full screen</button>' : ''}
    </div>`;
}

function toggleFullscreen(): void {
  if (document.fullscreenElement) { document.exitFullscreen().catch(() => { /* already out */ }); return; }
  document.documentElement.requestFullscreen({ navigationUI: 'hide' }).catch(() => { /* not allowed here */ });
}
const tipKeys = (profile: 'solo' | 'p1' | 'p2') => ({ shoot: firstKey(profile, 'shoot'), pass: firstKey(profile, 'pass') });
const TOUCH_TIP_KEYS = { shoot: 'Shoot', pass: 'Pass' };

const kbd = (a: 'shoot' | 'pass' | 'trick') => `<kbd>${esc(firstKey('solo', a))}</kbd>`;
/** Built on demand so the cards show the player's own key bindings. */
const TUTORIAL_TEXT = (): Record<Exclude<TutorialStep, 'done'>, { title: string; keys: string; touch: string }> => ({
  move: { title: '1. Run with the ball', keys: `Use <kbd>${esc(moveKeysLabel('solo'))}</kbd> or the stick to dribble to the yellow star.`, touch: 'Drag the joystick to dribble to the yellow star.' },
  pass: { title: '2. Pass to your team-mate', keys: `Point towards your team-mate and press ${kbd('pass')} to pass. Hold it longer for a longer pass.`, touch: 'Point the joystick towards your team-mate and tap <b>Pass</b>. Hold it longer for a longer pass.' },
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

/** The touch buttons in thumb order, biggest first: icon, word and the action they press. */
const TOUCH_BUTTONS = [
  ['shoot', '⚽', 'Shoot'], ['pass', '➡️', 'Pass'], ['sprint', '⚡', 'Sprint'],
  ['lob', '🌈', 'Lob'], ['switch', '🔄', 'Switch'], ['trick', '✨', 'Trick'],
] as const;

/** The joystick and buttons, for a match or (with `preview`) the Controls screen, where they are pictures only. */
export function touchControlsHtml(t: { size: number; opacity: number; leftHanded: boolean }, preview = false): string {
  const id = (name: string) => (preview ? '' : ` id="${name}"`);
  const tag = preview ? 'span' : 'button';
  return `<div class="touch-controls${preview ? ' tc-preview' : ''}${t.leftHanded ? ' is-lefty' : ''}" style="--tc-size:${t.size};--tc-opacity:${t.opacity}">
        <div class="joy-area"${id('joy-area')}><div class="joystick"${id('joy')}><div class="joy-knob"${id('joy-knob')}></div></div></div>
        <div class="action-buttons">
          ${TOUCH_BUTTONS.map(([a, icon, word]) => `<${tag} class="abtn abtn-${a}"${id(`btn-${a}`)}${preview ? '' : ` aria-label="${word}"`}><span class="abtn-ico" aria-hidden="true">${icon}</span><span class="abtn-txt" aria-hidden="true">${word}</span></${tag}>`).join('')}
        </div>
      </div>`;
}
