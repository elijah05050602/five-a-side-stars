import { getSettings, updateSettings } from '../data/storage';
import { applyVolumes, type AudioChannel } from '../game/audio';
import { music } from '../game/music';
import { preloadCommentary } from '../game/voice';

/**
 * On/off switches and volume sliders for music, the commentator and sound
 * effects. Shown in the Parents Zone and on the pause screen; changes apply
 * straight away, even mid-match.
 */
const ROWS: { ch: AudioChannel; label: string; on: 'music' | 'commentary' | 'sound'; vol: 'musicVolume' | 'voiceVolume' | 'sfxVolume' }[] = [
  { ch: 'music', label: '🎵 Music', on: 'music', vol: 'musicVolume' },
  { ch: 'voice', label: '🎙️ Commentary', on: 'commentary', vol: 'voiceVolume' },
  { ch: 'sfx', label: '📣 Crowd and effects', on: 'sound', vol: 'sfxVolume' },
];

export function soundSettings(): string {
  const s = getSettings();
  return `
    <div class="sound-mixer">
      ${ROWS.map((r) => `
        <div class="mix-row">
          <label class="mix-toggle"><input type="checkbox" data-mix-on="${r.ch}" ${s[r.on] ? 'checked' : ''}/> ${r.label}</label>
          <input type="range" min="0" max="100" step="5" value="${Math.round(s[r.vol] * 100)}" data-mix-vol="${r.ch}" aria-label="${r.label.replace(/^\S+ /, '')} volume" ${s[r.on] ? '' : 'disabled'}/>
        </div>`).join('')}
    </div>`;
}

export function wireSoundSettings(root: HTMLElement): void {
  for (const r of ROWS) {
    const box = root.querySelector<HTMLInputElement>(`[data-mix-on="${r.ch}"]`);
    const slider = root.querySelector<HTMLInputElement>(`[data-mix-vol="${r.ch}"]`);
    if (!box || !slider) continue;
    box.addEventListener('change', () => {
      updateSettings({ [r.on]: box.checked });
      slider.disabled = !box.checked;
      // From this tap: phones only let the audio start (or wake) inside a gesture.
      applyVolumes();
      if (r.ch === 'music') music.refresh();
      // Fetch the commentator's clips now (perhaps mid-match, from the pause screen) so the next line is spoken.
      if (r.ch === 'voice' && box.checked) void preloadCommentary(true);
    });
    slider.addEventListener('input', () => {
      updateSettings({ [r.vol]: Number(slider.value) / 100 });
      applyVolumes();
    });
  }
}
