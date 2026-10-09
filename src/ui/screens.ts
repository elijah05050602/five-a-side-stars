import { getTournament } from '../data/storage';
import type { Difficulty, Team } from '../data/types';
import type { MatchResult, SimMode } from '../game/MatchScene';
import type { WeatherChoice } from '../game/Weather';
import type { TournamentState } from '../game/tournament';
import { renderControls } from './controlsScreen';
import { state, wire } from './screens/shared';
import type { ResultSummary } from './screens/results';
import { renderMenu } from './screens/menu';
import { renderClub } from './screens/club';
import { renderTeams } from './screens/teams';
import { renderBuilder } from './screens/builder';
import { renderSetup } from './screens/setup';
import { renderResults } from './screens/results';
import { renderLeague } from './screens/league';
import { renderCareer } from './screens/career';
import { renderTournament } from './screens/tournament';
import { renderAlbum } from './screens/album';
import { renderParents } from './screens/parents';
import { renderHallOfFame } from './screens/hallOfFame';

export { finishMatch, playAhead, trophyFor, type Ahead, type ResultSummary } from './screens/results';
export { resolveKits } from './screens/setup';

export interface StartOptions {
  home: Team;
  away: Team;
  difficulty: Difficulty;
  halfSeconds: number;
  twoPlayer?: boolean;
  mode?: SimMode;
  tournament?: TournamentState;
  /** League match: the result feeds the saved league table. */
  league?: boolean;
  /** Career match: the result feeds the career and grows the players. */
  career?: boolean;
  /** Career match: the Star's player id, marked with a gold star on the pitch. */
  starId?: string;
  cpuLevel?: number;
  /** A big career match: your rival (a cup-sized crowd), a play-off (a final-sized one, recorded as the play-off), or a tie in the yearly cup (recorded in the cup). */
  big?: 'rival' | 'playoff' | 'cup' | 'cup-final';
  /** Weather and time of day for the match; 'random' or missing picks for you. */
  weather?: WeatherChoice;
}

export interface Router {
  go(screen: Screen): void;
  startMatch(o: StartOptions): void;
  /** The guided first-time kick-about. */
  startTutorial(): void;
}

export type SetupMode = Exclude<SimMode, 'tutorial'> | 'tournament' | 'league' | 'career';

export type Screen =
  | { name: 'menu' }
  | { name: 'teams' }
  | { name: 'builder'; teamId?: string }
  | { name: 'setup'; homeId?: string; mode?: SetupMode }
  | { name: 'results'; result: MatchResult; summary: ResultSummary; tournament?: TournamentState; league?: boolean; career?: boolean }
  /** The cup in the save when no state is given. */
  | { name: 'tournament'; state?: TournamentState }
  | { name: 'league' }
  | { name: 'career' }
  | { name: 'album' }
  | { name: 'parents' }
  | { name: 'controls' }
  | { name: 'club' }
  | { name: 'hall' };


/** Tear down the current screen (its window listeners included). Matches call this before they start. */
export function leaveScreen(): void {
  state.cleanup?.();
  state.cleanup = null;
  state.onEscape = null;
  state.leaveGuard = null;
}

/** False when the current screen has unsaved changes and the player chose to stay. A screen that asks first answers with a Promise. */
export function canLeaveScreen(): boolean | Promise<boolean> {
  return !state.leaveGuard || state.leaveGuard();
}

/** The phone's Back button: do what the screen's own back button does. False when there is nowhere to go back to. */
export function goBack(): boolean {
  if (!state.onEscape) return false;
  state.onEscape();
  return true;
}

export function renderScreen(root: HTMLElement, screen: Screen, router: Router): void {
  leaveScreen();
  state.router = router;
  root.innerHTML = '';
  root.className = 'screen-root';
  drawScreen(root, screen, router);
  // A new screen: name it in the tab, and start keyboard and screen-reader users at its heading.
  const heading = root.querySelector<HTMLElement>('h1');
  const title = heading?.textContent?.replace(/\s+/g, ' ').trim();
  document.title = title && screen.name !== 'menu' ? `${title} · Goal Rush!` : 'Goal Rush!';
  if (heading && !root.contains(document.activeElement)) {
    heading.tabIndex = -1;
    heading.focus({ preventScroll: true });
  }
}

function drawScreen(root: HTMLElement, screen: Screen, router: Router): void {
  switch (screen.name) {
    case 'menu': return renderMenu(root, router);
    case 'teams': return renderTeams(root, router);
    case 'builder': return renderBuilder(root, router, screen.teamId);
    case 'setup': return renderSetup(root, router, screen.homeId, screen.mode ?? 'match');
    case 'results': return renderResults(root, router, screen.result, screen.summary, screen.tournament, screen.league, screen.career);
    case 'tournament': {
      const cup = screen.state ?? getTournament();
      if (!cup) return router.go({ name: 'setup', mode: 'tournament' });
      return renderTournament(root, router, cup);
    }
    case 'league': return renderLeague(root, router);
    case 'career': return renderCareer(root, router);
    case 'album': return renderAlbum(root, router);
    case 'parents': return renderParents(root, router);
    case 'controls': state.cleanup = renderControls(root, router, wire); return;
    case 'club': return renderClub(root, router);
    case 'hall': return renderHallOfFame(root, router);
  }
}
