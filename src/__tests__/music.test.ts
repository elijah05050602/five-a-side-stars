import { describe, expect, it } from 'vitest';
import { TRACKS, trackFor } from '../game/music';

describe('music tracks', () => {
  it('plays the matchday groove from match preparation onwards and the home theme elsewhere', () => {
    for (const s of ['setup', 'results']) expect(trackFor(s)).toBe('matchday');
    for (const s of ['menu', 'teams', 'builder', 'tournament', 'league', 'career', 'album', 'parents', 'controls', 'club']) expect(trackFor(s)).toBe('home');
  });

  it('uses a different file for match days', () => {
    expect(TRACKS.home.file).not.toBe(TRACKS.matchday.file);
    for (const t of Object.values(TRACKS)) expect(t.loop).toBeGreaterThan(30);
  });
});
