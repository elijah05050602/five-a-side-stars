import './style.css';
import { MatchScene } from './game/MatchScene';
import { recordResult } from './data/progress';
import { loadSave } from './data/storage';
import { renderScreen, type Router, type Screen, type StartOptions } from './ui/screens';

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
  startMatch(o: StartOptions) {
    if (match) match.dispose();
    ui.innerHTML = '';
    ui.className = 'match-ui';
    canvas.classList.add('is-live');
    document.body.classList.add('in-match');
    const mode = o.mode ?? 'match';
    match = new MatchScene(canvas, ui, { home: o.home, away: o.away, difficulty: o.difficulty, halfSeconds: o.halfSeconds, humanSide: 0, humanSide2: o.twoPlayer && mode !== 'training' ? 1 : null, mode },
      (result) => {
        match = null;
        const stickers = recordResult(result);
        router.go({ name: 'results', result, stickers, tournament: o.tournament });
      },
      () => { match = null; router.go(o.tournament ? { name: 'tournament', state: o.tournament } : { name: 'menu' }); });
  },
};

router.go({ name: 'menu' });
