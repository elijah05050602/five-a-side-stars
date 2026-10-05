import './style.css';
import { MatchScene } from './game/MatchScene';
import { loadSave } from './data/storage';
import type { Difficulty, Team } from './data/types';
import { renderScreen, type Router, type Screen } from './ui/screens';

const canvas = document.getElementById('game-canvas') as HTMLCanvasElement;
const ui = document.getElementById('ui') as HTMLElement;
let match: MatchScene | null = null;

loadSave();

const router: Router = {
  go(screen: Screen) {
    if (match) { match.dispose(); match = null; }
    canvas.classList.remove('is-live');
    document.body.classList.remove('in-match');
    renderScreen(ui, screen, router);
  },
  startMatch(home: Team, away: Team, difficulty: Difficulty, halfSeconds: number) {
    if (match) match.dispose();
    ui.innerHTML = '';
    ui.className = 'match-ui';
    canvas.classList.add('is-live');
    document.body.classList.add('in-match');
    match = new MatchScene(canvas, ui, { home, away, difficulty, halfSeconds, humanSide: 0 },
      (result) => { match = null; router.go({ name: 'results', result }); },
      () => { match = null; router.go({ name: 'menu' }); });
  },
};

router.go({ name: 'menu' });
