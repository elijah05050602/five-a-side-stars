import { getSettings } from '../data/storage';

/** Mirror the reduce-motion setting onto the body so CSS can calm the animations. */
export function applyMotionSetting(): void {
  document.body.classList.toggle('reduce-motion', getSettings().reduceMotion);
}
