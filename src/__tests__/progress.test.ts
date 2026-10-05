import { describe, expect, it } from 'vitest';
import { getProgress, recordResult, recordSeason, recordTrophy } from '../data/progress';
import { resetAll } from '../data/storage';
import type { GoalEvent } from '../game/sim';
import type { MatchResult } from '../game/MatchScene';
import { team } from './helpers';

const home = team('h', 'Home');
const away = team('a', 'Away');

function match(score: [number, number], goals: GoalEvent[] = [], extra: Partial<MatchResult> = {}): MatchResult {
  return { mode: 'match', score, goals, home, away, stats: { touches: [0, 0], distance: [0, 0] }, shootout: null, trainingPoints: 0, twoPlayer: false, ...extra };
}
const goal = (side: 0 | 1, scorer = side === 0 ? home.players[3] : away.players[3], minute = 10): GoalEvent => ({ side, scorer, minute, ownGoal: false });

describe('progress and stickers', () => {
  it('counts matches, goals and results', () => {
    resetAll();
    recordResult(match([2, 1], [goal(0), goal(1), goal(0)]));
    recordResult(match([0, 0]));
    recordResult(match([0, 3], [goal(1), goal(1), goal(1)]));
    expect(getProgress()).toMatchObject({ played: 3, won: 1, drawn: 1, lost: 1, goalsFor: 2, goalsAgainst: 4 });
  });

  it('awards first match, first win, clean sheet and comeback stickers', () => {
    resetAll();
    const first = recordResult(match([1, 0], [goal(0)])).map((s) => s.id);
    expect(first).toEqual(expect.arrayContaining(['first-match', 'first-win', 'clean-sheet']));
    expect(first).not.toContain('comeback');
    const comeback = recordResult(match([2, 1], [goal(1), goal(0), goal(0)])).map((s) => s.id);
    expect(comeback).toEqual(['comeback']);
  });

  it('a hat-trick needs one player to score three', () => {
    resetAll();
    const star = home.players[4];
    const spread = recordResult(match([3, 0], [goal(0, home.players[3]), goal(0, star), goal(0, star)])).map((s) => s.id);
    expect(spread).not.toContain('hat-trick');
    const treble = recordResult(match([3, 0], [goal(0, star), goal(0, star), goal(0, star)])).map((s) => s.id);
    expect(treble).toEqual(['hat-trick']);
  });

  it('training and shoot-outs keep their own records', () => {
    resetAll();
    expect(recordResult(match([0, 0], [], { mode: 'training', trainingPoints: 7 }))).toEqual([]);
    expect(getProgress().trainingBest).toBe(7);
    expect(getProgress().played).toBe(0);
    expect(recordResult(match([0, 0], [], { mode: 'training', trainingPoints: 12 })).map((s) => s.id)).toEqual(['training-10']);
    expect(recordResult(match([4, 3], [], { mode: 'shootout' })).map((s) => s.id)).toEqual(['shootout']);
    expect(getProgress().shootoutsWon).toBe(1);
  });

  it('league and cup wins add their stickers once', () => {
    resetAll();
    expect(recordSeason({ season: 1, tier: 5, position: 1, outcome: 'promoted' }).map((s) => s.id)).toEqual(['promoted']);
    expect(recordSeason({ season: 2, tier: 4, position: 2, outcome: 'promoted' })).toEqual([]);
    expect(recordSeason({ season: 3, tier: 1, position: 1, outcome: 'champion' }).map((s) => s.id)).toEqual(['league-champ']);
    expect(recordTrophy().map((s) => s.id)).toEqual(['trophy']);
    expect(recordTrophy()).toEqual([]);
    expect(getProgress().trophies).toBe(2);
  });
});
