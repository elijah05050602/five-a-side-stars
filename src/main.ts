import './style.css';
import { MatchScene } from './game/MatchScene';
import { recordResult } from './data/progress';
import { getSettings, getTeams, loadSave, updateSettings } from './data/storage';
import { generateOpponent } from './data/defaults';
import { applyMotionSetting } from './ui/motion';
import { music } from './game/music';
import { loadPlayerAsset } from './game/playerAsset';
import { renderScreen, type Router, type Screen, type StartOptions } from './ui/screens';

const canvas = document.getElementById('game-canvas') as HTMLCanvasElement;
const ui = document.getElementById('ui') as HTMLElement;
let match: MatchScene | null = null;

loadSave();
applyMotionSetting();
// Fetch the kid model now so the first match and the team builder start with it ready.
loadPlayerAsset().catch(() => { /* PlayerModel falls back to the procedural kid */ });
// Music can only start after a tap or key press.
const startMusic = () => { music.start(); window.removeEventListener('pointerdown', startMusic); window.removeEventListener('keydown', startMusic); };
window.addEventListener('pointerdown', startMusic);
window.addEventListener('keydown', startMusic);
if (import.meta.env.PROD && 'serviceWorker' in navigator) {
  window.addEventListener('load', () => { navigator.serviceWorker.register('./sw.js').catch(() => { /* offline play is a bonus, not a requirement */ }); });
}

const router: Router = {
  go(screen: Screen) {
    if (match) { match.dispose(); match = null; }
    canvas.classList.remove('is-live');
    document.body.classList.remove('in-match');
    music.setQuiet(false);
    renderScreen(ui, screen, router);
  },
  startMatch(o: StartOptions) {
    if (match) match.dispose();
    ui.innerHTML = '';
    ui.className = 'match-ui';
    canvas.classList.add('is-live');
    document.body.classList.add('in-match');
    music.setQuiet(true);
    const mode = o.mode ?? 'match';
    match = new MatchScene(canvas, ui, { home: o.home, away: o.away, difficulty: o.difficulty, halfSeconds: o.halfSeconds, humanSide: 0, humanSide2: o.twoPlayer && mode !== 'training' ? 1 : null, mode, cpuLevel: o.cpuLevel },
      (result) => {
        match = null;
        const stickers = recordResult(result);
        router.go({ name: 'results', result, stickers, tournament: o.tournament, league: o.league, career: o.career });
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
    if (match) match.dispose();
    ui.innerHTML = '';
    ui.className = 'match-ui';
    canvas.classList.add('is-live');
    document.body.classList.add('in-match');
    music.setQuiet(true);
    match = new MatchScene(canvas, ui, { home, away, difficulty: 'easy', halfSeconds: 600, humanSide: 0, mode: 'tutorial' },
      () => leave({ name: 'setup', homeId: home.id }),
      () => leave({ name: 'menu' }));
  },
};

// First visit: straight into the tutorial (with a skip button). Everyone else lands on the menu.
if (getSettings().tutorialDone) router.go({ name: 'menu' });
else router.startTutorial();
