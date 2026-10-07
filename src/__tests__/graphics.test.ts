import { describe, expect, it } from 'vitest';
import { getSettings, reloadSave, resetAll, updateSettings } from '../data/storage';
import { graphicsProfile } from '../game/graphics';

describe('graphics quality', () => {
  it('defaults to Auto, which adapts its resolution', () => {
    resetAll();
    expect(getSettings().graphics).toBe('auto');
    expect(graphicsProfile().adaptive).toBe(true);
  });

  it('keeps High as the full original look', () => {
    const high = graphicsProfile('high');
    expect(high).toMatchObject({ adaptive: false, maxPixelRatio: 2, shadowMap: true, shadowSize: 2048, sceneryShadows: true, playerOutlines: true, liteCrowd: false, spotlights: true, pbrGround: true, batchScenery: false, netDetail: 'cloth', netCols: 16 });
  });

  it('makes Low the lightest choice', () => {
    const low = graphicsProfile('low'), medium = graphicsProfile('medium');
    expect(low.maxPixelRatio).toBeLessThan(medium.maxPixelRatio);
    expect(low).toMatchObject({ shadowMap: false, spotlights: false, liteCrowd: true, batchScenery: true, netDetail: 'dent' });
  });

  it('remembers the choice in the save', () => {
    resetAll();
    updateSettings({ graphics: 'low' });
    reloadSave();
    expect(getSettings().graphics).toBe('low');
    expect(graphicsProfile().tier).toBe('low');
  });

  it('gives old saves without the setting Auto', () => {
    resetAll();
    const raw = JSON.parse(localStorage.getItem('five-a-side-stars:v1')!);
    delete raw.settings.graphics;
    localStorage.setItem('five-a-side-stars:v1', JSON.stringify(raw));
    reloadSave();
    expect(getSettings().graphics).toBe('auto');
  });
});
