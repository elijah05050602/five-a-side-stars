import { soundSettings, wireSoundSettings } from '../soundSettings';
import { graphicsSettings, wireGraphicsSettings } from '../graphicsSettings';
import { applyVolumes } from '../../game/audio';
import { exportSave, getSettings, hasBackup, importSave, requestPersistentStorage, resetAll, restoreBackup, updateSettings, type MotionChoice } from '../../data/storage';
import { getProgress } from '../../data/progress';
import { music } from '../../game/music';
import { applyMotionSetting } from '../motion';
import { resetControls } from '../../data/controls';
import { state, topBar, wire, pressed } from './shared';
import type { Router } from '../screens';

const NUMBER_WORDS = ['zero', 'one', 'two', 'three', 'four', 'five', 'six', 'seven', 'eight', 'nine', 'ten', 'eleven', 'twelve', 'thirteen', 'fourteen', 'fifteen', 'sixteen', 'seventeen', 'eighteen', 'nineteen'];
/** Wrong answers in a row at the Parents gate, and when it opens again after too many. */
let gateMisses = 0;
let gateLockedUntil = 0;

export function renderParents(root: HTMLElement, router: Router, wrong = false): void {
  // A sum written in words keeps young children out of the grown-up settings: a new one after every try,
  // and a short wait after three misses so it cannot simply be guessed.
  const a = 12 + Math.floor(Math.random() * 8), b = 3 + Math.floor(Math.random() * 7);
  const wait = Math.ceil((gateLockedUntil - Date.now()) / 1000);
  root.innerHTML = `
    <div class="screen parents">
      ${topBar('Parents Zone')}
      <div class="card gate-card">
        <h2>Grown-ups only</h2>
        ${wait > 0 ? `<p class="warn">Too many tries. Ask a grown-up, and try again in ${wait} seconds.</p>` : `
        <p class="muted">To open the settings, answer this in numbers: what is <strong>${NUMBER_WORDS[a]} times ${NUMBER_WORDS[b]}</strong>?</p>
        <form class="row" id="gate">
          <input type="number" inputmode="numeric" id="gate-answer" placeholder="?" autocomplete="off" aria-label="Answer" />
          <button class="btn btn-primary" type="submit">Open</button>
        </form>
        ${wrong ? '<p class="warn" role="alert">Not quite. Ask a grown-up to help!</p>' : ''}`}
      </div>
    </div>`;
  wire(root, () => router.go({ name: 'menu' }));
  if (wait > 0) {
    const timer = window.setTimeout(() => renderParents(root, router), wait * 1000);
    state.cleanup = () => window.clearTimeout(timer);
    return;
  }
  const input = root.querySelector<HTMLInputElement>('#gate-answer')!;
  input.focus();
  root.querySelector('#gate')!.addEventListener('submit', (e) => {
    e.preventDefault();
    if (Number(input.value) === a * b) { gateMisses = 0; renderParentSettings(root, router); return; }
    if (++gateMisses >= 3) { gateMisses = 0; gateLockedUntil = Date.now() + 30_000; }
    renderParents(root, router, true);
  });
}

const MOTION_CHOICES: { id: MotionChoice; label: string }[] = [{ id: 'auto', label: 'Follow this device' }, { id: 'reduce', label: 'Calm' }, { id: 'full', label: 'Full' }];

/** Put the settings that live outside the screens (volumes, music, motion) into effect after the save changed under them. */
function applySavedSettings(): void {
  applyVolumes();
  music.refresh();
  applyMotionSetting();
}

function renderParentSettings(root: HTMLElement, router: Router): void {
  const s = getSettings();
  const p = getProgress();
  root.innerHTML = `
    <div class="screen parents">
      ${topBar('Parents Zone')}
      <div class="card">
        <h2>Settings</h2>
        ${soundSettings()}
        <div class="field"><span>Motion</span>
          <div class="pills">${MOTION_CHOICES.map((m) => `<button class="pill ${s.motion === m.id ? 'is-active' : ''}" data-motion="${m.id}" ${pressed(s.motion === m.id)}>${m.label}</button>`).join('')}</div>
          <p class="muted small">Calm means no confetti, no wobbling and no goal replays.${s.motion === 'auto' ? ` This device asks for ${s.reduceMotion ? 'calm' : 'full'} motion.` : ''}</p>
        </div>
        ${graphicsSettings()}
      </div>
      <div class="card">
        <h2>Keep the save safe</h2>
        <p class="muted">Teams, stickers, the league and the career are saved in this browser only, and browsers can clear them (Safari does after about a week without a visit, unless the game is on the Home Screen). Save a backup file now and then; it also moves a save to another device.</p>
        <div class="row">
          <button class="btn btn-blue" id="pa-export">⬇️ Save a backup file</button>
          <button class="btn btn-ghost" id="pa-import">⬆️ Load a backup file</button>
          <input type="file" id="pa-import-file" accept=".json,application/json" hidden />
          <button class="btn btn-ghost" id="pa-persist">🔒 Ask this browser to keep the save</button>
          ${hasBackup() ? '<button class="btn btn-ghost" id="pa-undo">↩️ Put back the save from before the last reset, repair or loaded file</button>' : ''}
        </div>
        <p class="muted small" id="pa-save-note" aria-live="polite"></p>
      </div>
      <div class="card">
        <h2>About this game</h2>
        <p class="muted">Goal Rush! is a five-a-side football game for children aged 7 and up. Players build a team and play short matches against the computer, or against a friend on the same keyboard.</p>
        <ul class="muted plain-list">
          <li><strong>Privacy:</strong> nothing leaves this device. There are no accounts, no chat, no adverts, no in-app purchases and no tracking. Teams, settings and stickers are saved in this browser's local storage only.</li>
          <li><strong>Names:</strong> children type their own team and player names. A small word filter blocks the obvious rude words; nothing is shared with anyone.</li>
          <li><strong>Logos:</strong> a club logo picture can be uploaded for any team. It is shrunk and kept in this browser only; it is never sent anywhere.</li>
          <li><strong>Offline:</strong> once loaded, the game keeps working without an internet connection. On a phone or tablet you can add it to the home screen.</li>
          <li><strong>Play time:</strong> a match lasts two to ten minutes depending on the half length chosen on the setup screen.</li>
        </ul>
        <p class="muted">Played so far: ${p.played} matches, ${p.won} wins, ${p.stickers.length} stickers.</p>
      </div>
      <div class="card">
        <h2>Start again</h2>
        <p class="muted">This deletes every team, the sticker album, the league, the career and the settings on this device, and puts the controls back to normal. The old save stays in the backup slot until the next reset, so it can be put back from the card above.</p>
        <form class="row" id="pa-reset-form">
          <label class="field"><span>Type RESET to confirm</span><input id="pa-reset-word" autocomplete="off" autocapitalize="characters" spellcheck="false" /></label>
          <button class="btn btn-ghost" id="pa-reset" type="submit" disabled>Reset everything</button>
        </form>
      </div>
    </div>`;
  wire(root, () => router.go({ name: 'menu' }));
  wireSoundSettings(root);
  wireGraphicsSettings(root);
  root.querySelectorAll<HTMLElement>('[data-motion]').forEach((b) => b.addEventListener('click', () => {
    updateSettings({ motion: b.dataset.motion as MotionChoice });
    applyMotionSetting();
    renderParentSettings(root, router);
    root.querySelector<HTMLElement>(`[data-motion="${b.dataset.motion}"]`)?.focus();
  }));
  const note = root.querySelector<HTMLElement>('#pa-save-note')!;
  root.querySelector('#pa-export')!.addEventListener('click', () => {
    const blob = new Blob([exportSave()], { type: 'application/json' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `goal-rush-save-${new Date().toISOString().slice(0, 10)}.json`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    window.setTimeout(() => URL.revokeObjectURL(a.href), 10_000);
    note.textContent = 'Backup file saved. Keep it somewhere safe.';
  });
  const file = root.querySelector<HTMLInputElement>('#pa-import-file')!;
  root.querySelector('#pa-import')!.addEventListener('click', () => file.click());
  file.addEventListener('change', async () => {
    const f = file.files?.[0];
    file.value = '';
    if (!f) return;
    if (f.size > 20 * 1024 * 1024) { alert('That file is too big to be a Goal Rush! save.'); return; }
    if (!confirm('Load this backup? It replaces the save on this device now (which goes to the backup slot, so it can be put back).')) return;
    const result = importSave(await f.text());
    if (!result.ok) { alert(result.reason); return; }
    applySavedSettings();
    router.go({ name: 'menu' });
  });
  root.querySelector('#pa-persist')!.addEventListener('click', async () => {
    note.textContent = (await requestPersistentStorage())
      ? 'This browser will keep the save, even when space runs low.'
      : 'This browser decides for itself when to clear saves. A backup file is the safest way to keep it.';
  });
  root.querySelector('#pa-undo')?.addEventListener('click', () => {
    if (!confirm('Put back the save from before the last reset, repair or loaded file? The save on this device now goes to the backup slot.')) return;
    if (!restoreBackup()) { alert('There is no backup to put back.'); return; }
    applySavedSettings();
    router.go({ name: 'menu' });
  });
  const word = root.querySelector<HTMLInputElement>('#pa-reset-word')!;
  const resetBtn = root.querySelector<HTMLButtonElement>('#pa-reset')!;
  word.addEventListener('input', () => { resetBtn.disabled = word.value.trim().toUpperCase() !== 'RESET'; });
  root.querySelector('#pa-reset-form')!.addEventListener('submit', (e) => {
    e.preventDefault();
    if (word.value.trim().toUpperCase() !== 'RESET') return;
    resetAll();
    resetControls();
    applySavedSettings();
    router.go({ name: 'menu' });
  });
}
