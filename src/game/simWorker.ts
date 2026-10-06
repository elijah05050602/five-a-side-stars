import { runBackground, type BackgroundRequest } from './background';

/** Plays computer-vs-computer matches off the main thread (see background.ts). */
const scope = self as unknown as { onmessage: ((e: MessageEvent<BackgroundRequest>) => void) | null; postMessage(message: unknown): void };
scope.onmessage = (e) => scope.postMessage(runBackground(e.data));
