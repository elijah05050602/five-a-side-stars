import { describe, expect, it } from 'vitest';
import { aroundTheLeague, formFrom, matchPreview, matchReport, type PreviewInput } from '../game/news';
import type { MatchResult } from '../game/MatchScene';
import type { GoalEvent } from '../game/sim';
import { team } from './helpers';

const you = team('you', 'Little Lions');
const them = team('them', 'Puddle Pirates');

const input = (over: Partial<PreviewInput> = {}): PreviewInput => ({
  you, opponent: them, youAreHome: true, table: ['x', 'you', 'them', 'y', 'z', 'w'], forms: { you: 'WDL', opponent: 'DLD' }, tally: {}, round: 3, rounds: 5, ...over,
});

function match(score: [number, number], goals: GoalEvent[], mode: MatchResult['mode'] = 'match'): MatchResult {
  return { mode, score, goals, home: you, away: them, stats: { touches: [0, 0], distance: [0, 0] }, players: {}, shootout: null, trainingPoints: 0, twoPlayer: false };
}
const goal = (side: 0 | 1, n = 3, minute = 10, extra: Partial<GoalEvent> = {}): GoalEvent => ({ side, scorer: (side === 0 ? you : them).players[n], minute, ownGoal: false, ...extra });

describe('the Goal Rush Gazette', () => {
  it('previews a match with both sides, their form, places and who to watch', () => {
    const p = matchPreview(input({ tally: { [them.players[3].id]: { club: 'them', name: them.players[3].name, gk: false, p: 2, g: 3, a: 0, sv: 0, cs: 0, motm: 0 } } }));
    expect(p.home.team).toBe(you);
    expect(p.home.position).toBe(2);
    expect(p.away.position).toBe(3);
    expect(p.away.form).toBe('DLD');
    expect(p.away.watch).toMatchObject({ name: them.players[3].name, why: '3 goals this season' });
    expect(p.home.watch).not.toBeNull();
    expect(p.headline.length).toBeGreaterThan(5);
    // The same match always reads the same, however often the screen is drawn.
    expect(matchPreview(input()).headline).toBe(matchPreview(input()).headline);
  });

  it('picks the headline from what is going on', () => {
    expect(matchPreview(input({ rival: true })).headline).toContain('🔥');
    expect(matchPreview(input({ table: ['you', 'them', 'x', 'y', 'z', 'w'] })).headline).toContain('🏆');
    expect(matchPreview(input({ forms: { you: 'D', opponent: 'DWWW' } })).headline).toBe('Puddle Pirates have won three in a row. Can Little Lions stop them?');
    expect(matchPreview(input({ round: 5 })).headline).toContain('📣');
    expect(matchPreview(input({ round: 1, table: ['x', 'y', 'z', 'w', 'you', 'them'] })).headline).toContain('🌱');
    expect(matchPreview(input({ playoff: 'up' })).headline).toContain('Play-off');
    expect(matchPreview(input({ h2h: { w: 0, d: 0, l: 2, gf: 0, ga: 4 } })).headline).toContain('Revenge');
    expect(matchPreview(input({ h2h: { w: 1, d: 1, l: 0, gf: 3, ga: 2 } })).h2h).toEqual({ w: 1, d: 1, l: 0 });
  });

  it('writes the front page from the best thing that happened, your way round', () => {
    expect(matchReport(match([3, 0], [goal(0), goal(0), goal(0)]), 'you', null).headline).toContain('Hat-trick');
    expect(matchReport(match([2, 1], [goal(1), goal(0, 3), goal(0, 4)]), 'you', null).headline).toMatch(/comeback|never gave up/);
    expect(matchReport(match([1, 0], [goal(0, 3, 5, { super: true })]), 'you', null).headline).toContain('⚡');
    expect(matchReport(match([4, 0], [goal(0, 3), goal(0, 4), goal(0, 3), goal(0, 2)]), 'you', null).headline).toContain('💥');
    expect(matchReport(match([2, 0], [goal(0, 3), goal(0, 4)]), 'you', null).headline).toMatch(/Clean sheet|Nothing gets past/);
    expect(matchReport(match([0, 0], []), 'you', null).headline).toContain('🤝');
    expect(matchReport(match([0, 2], [goal(1), goal(1)]), 'you', null).standfirst).toContain('Next time');
    expect(matchReport(match([4, 3], [], 'shootout'), 'you', null).headline).toContain('🥅');
    // Away from home, the score is turned round.
    const away = { ...match([0, 2], [goal(1), goal(1)]), home: them, away: you };
    expect(matchReport(away, 'you', null).headline).not.toContain('win this one');
    expect(matchReport(match([1, 0], [goal(0)]), 'you', you.players[3]).motm).toEqual({ name: you.players[3].name, team: 'Little Lions' });
  });

  it('lists the rest of the round, and works out form from a season', () => {
    const round = [
      { homeId: 'you', awayId: 'them', score: [1, 0] as [number, number] },
      { homeId: 'a', awayId: 'b', score: [2, 2] as [number, number] },
      { homeId: 'c', awayId: 'd', score: null },
    ];
    expect(aroundTheLeague(round, 'you', (id) => id.toUpperCase())).toEqual([{ home: 'A', away: 'B', score: [2, 2] }]);
    expect(formFrom([[round[0]], [{ homeId: 'them', awayId: 'you', score: [3, 1] }], [{ homeId: 'you', awayId: 'x', score: [0, 0] }]], 'you')).toBe('WLD');
  });
});
