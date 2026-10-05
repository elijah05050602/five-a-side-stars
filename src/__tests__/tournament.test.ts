import { describe, expect, it } from 'vitest';
import { applyResult, createTournament, currentFixture, humanStillIn, simulateFixture, teamById } from '../game/tournament';
import type { MatchResult } from '../game/MatchScene';
import { team } from './helpers';

const you = team('you', 'Your Team');

describe('tournament', () => {
  it('has four teams and puts you in the first semi-final', () => {
    const s = createTournament(you, 'normal', 60);
    expect(s.semis[0].home.id).toBe('you');
    const names = new Set([s.semis[0].away.name, s.semis[1].home.name, s.semis[1].away.name]);
    expect(names.size).toBe(3);
    expect(names.has(you.name)).toBe(false);
    expect(currentFixture(s)).toBe(s.semis[0]);
    expect(humanStillIn(s)).toBe(true);
  });

  it('a win takes you to the final; a drawn match needs a shoot-out first', () => {
    const s = createTournament(you, 'normal', 60);
    const f = s.semis[0];
    const res = (score: [number, number], mode: MatchResult['mode'] = 'match'): MatchResult => ({ mode, score, goals: [], home: f.home, away: f.away, stats: { touches: [0, 0], distance: [0, 0] }, shootout: null, trainingPoints: 0, twoPlayer: false });
    applyResult(s, res([1, 1]));
    expect(s.needsShootout).toBe(true);
    expect(s.stage).toBe('semi');
    applyResult(s, res([3, 2], 'shootout'));
    expect(s.needsShootout).toBe(false);
    expect(s.stage).toBe('final');
    expect(s.final?.home.id).toBe('you');
    expect(s.semis[1].winnerId).not.toBeNull();
    applyResult(s, { ...res([2, 0]), home: s.final!.home, away: s.final!.away });
    expect(s.stage).toBe('done');
    expect(s.final?.winnerId).toBe('you');
    expect(humanStillIn(s)).toBe(true);
    expect(teamById(s, 'you')?.name).toBe('Your Team');
  });

  it('losing the semi lets the computer finish the cup', () => {
    const s = createTournament(you, 'easy', 60);
    const f = s.semis[0];
    applyResult(s, { mode: 'match', score: [0, 2], goals: [], home: f.home, away: f.away, stats: { touches: [0, 0], distance: [0, 0] }, shootout: null, trainingPoints: 0, twoPlayer: false });
    expect(s.stage).toBe('done');
    expect(humanStillIn(s)).toBe(false);
    expect(s.final?.winnerId).not.toBe('you');
  });

  it('a simulated fixture always has a winner', () => {
    const f = { home: team('x', 'X'), away: team('y', 'Y'), score: null, pens: null, winnerId: null };
    simulateFixture(f, 'normal', 30);
    expect(f.score).not.toBeNull();
    expect([f.home.id, f.away.id]).toContain(f.winnerId);
    if (f.score![0] === f.score![1]) expect(f.pens).not.toBeNull();
  });
});
