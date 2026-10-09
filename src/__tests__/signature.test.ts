import { describe, expect, it } from 'vitest';
import { canPickSignature, careerStar, createCareer, pickSignature } from '../game/career';
import { SIGNATURE_AT, SUPERS, superLook } from '../game/supers';
import { getTeam, reloadSave, resetAll, saveTeam } from '../data/storage';
import { team } from './helpers';

const KEY = 'five-a-side-stars:v1';

describe('signature super', () => {
  it('changes how a super looks for the Star, and nothing else', () => {
    expect(superLook('rocket')).toBe(SUPERS.rocket);
    expect(superLook('rocket', {})).toBe(SUPERS.rocket);
    const blaze = superLook('rocket', { signature: 'blaze' });
    expect(blaze.name).toBe('Blazing Rocket Shot');
    expect(blaze.css).not.toBe(SUPERS.rocket.css);
    expect(blaze.line('Mia')).toBe(SUPERS.rocket.line('Mia'));
  });

  it('unlocks at Legend in the Making, and goes in the scrapbook once', () => {
    const src = team('src', 'Sig Stars', 'U8');
    const { career: c, team: you } = createCareer(src, 60, src.players[3]);
    expect(canPickSignature(c)).toBe(false);
    expect(pickSignature(c, you, 'galaxy')).toBe(false);
    c.milestones = ['first-goal', 'hat-trick', 'goals-10', 'goals-25', 'assists-5', 'clean-sheet', 'saves-25', 'tackles-25'].slice(0, SIGNATURE_AT);
    expect(pickSignature(c, you, 'galaxy')).toBe(true);
    expect(careerStar(c, you)!.signature).toBe('galaxy');
    expect(pickSignature(c, you, 'thunder')).toBe(true);
    expect(careerStar(c, you)!.signature).toBe('thunder');
    expect(c.scrapbook.filter((l) => l.text.includes('signature super'))).toHaveLength(1);
  });

  it('keeps a saved signature and drops one it cannot read', () => {
    resetAll();
    const t = team('sig', 'Saved Sigs', 'U8');
    t.players[0].signature = 'blaze';
    saveTeam(t);
    const save = JSON.parse(localStorage.getItem(KEY)!);
    const saved = save.teams.find((x: { id: string }) => x.id === t.id);
    saved.players[1].signature = 'disco';
    localStorage.setItem(KEY, JSON.stringify(save));
    reloadSave();
    const back = getTeam(t.id)!;
    expect(back.players[0].signature).toBe('blaze');
    expect('signature' in back.players[1]).toBe(false);
    expect('signature' in back.players[2]).toBe(false);
  });
});
