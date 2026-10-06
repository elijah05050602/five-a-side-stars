import { getSettings, refreshMotion } from '../data/storage';

/** Mirror the reduce-motion setting onto the body so CSS can calm the animations. */
export function applyMotionSetting(): void {
  refreshMotion();
  document.body.classList.toggle('reduce-motion', getSettings().reduceMotion);
}

/** When the choice is "follow this device", keep following it if the device setting changes while the game is open. */
export function watchMotionSetting(): void {
  window.matchMedia?.('(prefers-reduced-motion: reduce)').addEventListener?.('change', applyMotionSetting);
}
