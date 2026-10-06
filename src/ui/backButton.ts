/**
 * The phone's Back button (and the browser's). The game is a single page, so it keeps one
 * spare history entry on top: Back pops it, the game goes back a screen (or pauses the match)
 * and puts the spare back. On the lobby there is nowhere to go back to, so the spare is not
 * put back and the next Back leaves the game as usual.
 */
let armed = false;

/** `onBack` handles a Back press; it returns true while the game still wants the next one. */
export function initBackButton(onBack: () => boolean): void {
  window.addEventListener('popstate', () => {
    armed = false;
    if (onBack()) armBack();
  });
}

/** Make sure the next Back press comes to the game rather than leaving it. */
export function armBack(): void {
  if (armed) return;
  try {
    history.pushState({ goalRush: true }, '');
    armed = true;
  } catch {
    /* history is unavailable (a sandboxed frame): Back simply leaves */
  }
}
