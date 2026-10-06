import { describe, expect, it } from 'vitest';
import { TRACKS, trackFor } from '../game/music';

describe('music tracks', () => {
  it('plays the home theme on the menu and the anthem on every other screen', () => {
    expect(trackFor('menu')).toBe('home');
    for (const s of ['teams', 'builder', 'setup', 'results', 'tournament', 'league', 'career', 'album', 'parents', 'controls', 'club']) expect(trackFor(s)).toBe('pages');
  });

  it('uses a different file for the homepage', () => {
    expect(TRACKS.home.file).not.toBe(TRACKS.pages.file);
    for (const t of Object.values(TRACKS)) expect(t.loop).toBeGreaterThan(30);
  });
});
