import './style.css';
import { MatchScene } from './game/MatchScene';
import { recordResult } from './data/progress';
import { getSettings, getTeams, loadSave, requestPersistentStorage, updateSettings } from './data/storage';
import { generateOpponent } from './data/defaults';
import { applyMotionSetting, watchMotionSetting } from './ui/motion';
import { music, trackFor } from './game/music';
import { unlockAudio } from './game/audio';
import { preloadCommentary } from './game/voice';
import { loadPlayerAsset } from './game/playerAsset';
import { gameRenderer, showDrawError } from './game/renderer';
import { canLeaveScreen, finishMatch, goBack, leaveScreen, playAhead, renderScreen, type Router, type Screen, type StartOptions } from './ui/screens';
import { armBack, initBackButton } from './ui/backButton';

// Straight away rather than on 'load': the service worker then stores every file of the game while
// this first visit is still open, so one visit is enough to play offline.
if (import.meta.env.PROD && 'serviceWorker' in navigator) {
  navigator.serviceWorker.register('./sw.js').catch(() => { /* offline play is a bonus, not a requirement */ });
}

/** The match canvas, looked up each time: it is swapped for a fresh one if its WebGL context is lost. */
const canvas = (): HTMLCanvasElement => document.getElementById('game-canvas') as HTMLCanvasElement;
const ui = document.getElementById('ui') as HTMLElement;
let match: MatchScene | null = null;
/** Where the player is: a screen, or in a match. */
let current: Screen['name'] | 'match' = 'menu';

loadSave();
applyMotionSetting();
watchMotionSetting();
// An installed game asks the browser to keep its save even when space runs low (in a tab, the Parents Zone offers it).
if (window.matchMedia?.('(display-mode: standalone), (display-mode: fullscreen)').matches) void requestPersistentStorage();
// Fetch the kid model now so the first match and the team builder start with it ready.
loadPlayerAsset().catch(() => { /* PlayerModel falls back to the procedural kid */ });
// Music (and fetching the commentator's clips) can only start after a tap or key press.
unlockAudio(() => { music.start(); void preloadCommentary(); });
// Fetch the home theme behind the loading screen so it starts on the very first tap.
music.preload('home');

/**
 * Clear the way for a match: the old screen and its listeners go, the pitch comes up and the music
 * drops. Returns the shared renderer, or null (with a message on screen) when the pitch cannot be drawn.
 */
function enterMatch(): ReturnType<typeof gameRenderer> {
  leaveScreen();
  if (match) { match.dispose(); match = null; }
  ui.innerHTML = '';
  ui.className = 'match-ui';
  const renderer = gameRenderer();
  if (!renderer) { showDrawError(ui); return null; }
  canvas().classList.add('is-live');
  document.body.classList.add('in-match');
  music.setQuiet(true);
  current = 'match';
  armBack();
  return renderer;
}

const router: Router = {
  go(screen: Screen) {
    // A screen with unsaved changes (the team builder) asks first, and may keep the player there.
    if (!canLeaveScreen()) return;
    if (match) { match.dispose(); match = null; }
    canvas().classList.remove('is-live');
    document.body.classList.remove('in-match');
    music.setQuiet(false);
    music.setTrack(trackFor(screen.name));
    music.start(); // in case it never got going (no-op when already playing, or switched off)
    current = screen.name;
    if (screen.name !== 'menu') armBack();
    renderScreen(ui, screen, router);
  },
  startMatch(o: StartOptions) {
    const renderer = enterMatch();
    if (!renderer) return;
    const mode = o.mode ?? 'match';
    // The rest of the league round (or the other cup semi) is played in the background meanwhile.
    const ahead = playAhead(o);
    match = new MatchScene(renderer, ui, { home: o.home, away: o.away, difficulty: o.difficulty, halfSeconds: o.halfSeconds, humanSide: 0, humanSide2: o.twoPlayer && mode !== 'training' ? 1 : null, mode, cpuLevel: o.cpuLevel, assist: getSettings().beginnerHelp, supers: mode === 'match' && getSettings().supers !== 'off' },
      (result) => {
        match = null;
        const stickers = recordResult(result);
        // Usually ready long before the whistle; otherwise this shows for the moment it takes.
        ui.className = 'screen-root';
        ui.innerHTML = '<div class="screen"><p class="muted">Full time! Adding up the results…</p></div>';
        void ahead.catch(() => ({})).then((a) => router.go(finishMatch(result, o, stickers, a)));
      },
      () => { match = null; router.go(o.tournament ? { name: 'tournament', state: o.tournament } : o.league ? { name: 'league' } : o.career ? { name: 'career' } : { name: 'menu' }); },
      { weather: o.weather });
    // `?debug` exposes the running match so screenshot scripts can poke at it.
    if (location.search.includes('debug')) (window as unknown as { __match?: MatchScene }).__match = match;
  },
  startTutorial() {
    // A short guided kick-about with your first team. Finishing or skipping both count as done.
    const home = getTeams()[0];
    const away = generateOpponent(home.ageGroup, home.kit);
    const leave = (next: Screen) => { match = null; updateSettings({ tutorialDone: true }); router.go(next); };
    const renderer = enterMatch();
    if (!renderer) return;
    match = new MatchScene(renderer, ui, { home, away, difficulty: 'easy', halfSeconds: 600, humanSide: 0, mode: 'tutorial' },
      () => leave({ name: 'setup', homeId: home.id }),
      () => leave({ name: 'menu' }));
  },
};

// The phone's Back button pauses (or resumes) a match and otherwise goes back a screen, like the screen's own back pill.
const onLobby = () => current === 'menu';
initBackButton(() => {
  if (match) { match.sim.togglePause(); return true; }
  if (onLobby()) return false;
  goBack();
  return !onLobby();
});

// Going into the background (a call, another app, a switched tab) pauses the match, so nobody comes
// back to a goal they missed. The pause card is waiting when they return.
document.addEventListener('visibilitychange', () => {
  if (document.hidden && match && match.sim.phase !== 'paused') match.sim.togglePause();
});

// First visit: straight into the tutorial (with a skip button). Everyone else lands on the menu.
if (getSettings().tutorialDone) router.go({ name: 'menu' });
else router.startTutorial();

// Once the player model is in (or after a few seconds anyway), and not so fast that nobody can read it,
// the loading screen turns into a big Play button. Browsers only allow sound after a tap, so that
// tap is what starts the music the moment the game opens.
const boot = document.getElementById('boot');
if (boot) {
  const wait = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));
  const lift = () => {
    boot.classList.add('is-gone');
    setTimeout(() => boot.remove(), 600);
  };
  Promise.all([wait(1400), Promise.race([loadPlayerAsset().catch(() => undefined), wait(4000)])]).then(() => {
    if (location.search.includes('debug')) return lift();
    const play = document.createElement('button');
    play.className = 'boot-play';
    play.type = 'button';
    play.textContent = '▶ TAP TO PLAY';
    boot.querySelector('.boot-bar')?.replaceWith(play);
    boot.classList.add('is-ready');
    play.focus();
    // Lift on click (it follows touchend), so the same tap does not also press a menu button underneath.
    const go = () => { boot.removeEventListener('click', go); window.removeEventListener('keydown', go); lift(); };
    boot.addEventListener('click', go);
    window.addEventListener('keydown', go);
  });
}
