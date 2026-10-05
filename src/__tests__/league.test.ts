import { describe, expect, it } from 'vitest';
import { PROMOTED, RELEGATED, TEAMS_PER_LEAGUE, TIERS, applyLeagueResult, computeTable, createLeague, nextFixture, nextSeason, seasonOutcome, seasonOver, tierInfo, yourPosition, type LeagueState } from '../game/league';
import type { MatchResult } from '../game/MatchScene';
import { team } from './helpers';

const you = team('you', 'Your Team');

function result(home: LeagueState['teams'][number], away: LeagueState['teams'][number], score: [number, number]): MatchResult {
  return { mode: 'match', score, goals: [], home, away, stats: { touches: [0, 0], distance: [0, 0] }, shootout: null, trainingPoints: 0, twoPlayer: false };
}

/** Hand-write every fixture's score so the table is predictable. */
function fillRound(s: LeagueState, round: number, scoreFor: (homeId: string, awayId: string) => [number, number]): void {
  for (const f of s.rounds[round]) f.score = scoreFor(f.homeId, f.awayId);
}

describe('league fixtures', () => {
  it('builds a single round robin: five rounds, everyone plays everyone once', () => {
    const s = createLeague(you, 120);
    expect(s.teams).toHaveLength(TEAMS_PER_LEAGUE - 1);
    expect(s.rounds).toHaveLength(TEAMS_PER_LEAGUE - 1);
    const ids = [you.id, ...s.teams.map((t) => t.id)];
    const seen = new Set<string>();
    for (const round of s.rounds) {
      expect(round).toHaveLength(TEAMS_PER_LEAGUE / 2);
      const inRound = round.flatMap((f) => [f.homeId, f.awayId]);
      expect(new Set(inRound).size).toBe(TEAMS_PER_LEAGUE);
      for (const f of round) {
        const key = [f.homeId, f.awayId].sort().join('|');
        expect(seen.has(key)).toBe(false);
        seen.add(key);
      }
    }
    expect(seen.size).toBe((ids.length * (ids.length - 1)) / 2);
    expect(s.tier).toBe(5);
    expect(s.season).toBe(1);
    expect(seasonOver(s)).toBe(false);
  });

  it('opponents are the same age group and have different names', () => {
    const s = createLeague(team('u6', 'Minis', 'U6'), 60);
    expect(s.teams.every((t) => t.ageGroup === 'U6')).toBe(true);
    expect(new Set(s.teams.map((t) => t.name)).size).toBe(s.teams.length);
  });

  it('tier info is a scale from easy to hard', () => {
    expect(TIERS.map((t) => t.tier)).toEqual([5, 4, 3, 2, 1]);
    for (let i = 1; i < TIERS.length; i++) expect(TIERS[i].level).toBeGreaterThan(TIERS[i - 1].level);
    expect(tierInfo(99).tier).toBe(5);
  });
});

describe('league results', () => {
  it('records the player\'s score the right way round when they were away', () => {
    const s = createLeague(you, 120);
    const nf = nextFixture(s, you)!;
    const r = nf.youAreHome ? result(you, nf.away, [3, 1]) : result(nf.home, you, [1, 3]);
    applyLeagueResult(s, you, r);
    expect(nf.fixture.score).toEqual(nf.youAreHome ? [3, 1] : [1, 3]);
    // The rest of the round was simulated and the league moved on.
    expect(s.rounds[0].every((f) => f.score !== null)).toBe(true);
    expect(s.round).toBe(1);
    const row = computeTable(s, you).find((x) => x.isYou)!;
    expect(row).toMatchObject({ played: 1, won: 1, gf: 3, ga: 1, points: 3 });
  });

  it('ignores a result for a fixture that already has a score', () => {
    const s = createLeague(you, 120);
    const nf = nextFixture(s, you)!;
    nf.fixture.score = [2, 2];
    applyLeagueResult(s, you, result(nf.home, nf.away, [9, 0]));
    expect(nf.fixture.score).toEqual([2, 2]);
    expect(s.round).toBe(0);
  });

  it('a full season ends after five rounds', () => {
    const s = createLeague(you, 120);
    for (let i = 0; i < 5; i++) {
      const nf = nextFixture(s, you)!;
      applyLeagueResult(s, you, result(nf.home, nf.away, [1, 0]));
    }
    expect(seasonOver(s)).toBe(true);
    expect(nextFixture(s, you)).toBeNull();
    const rows = computeTable(s, you);
    expect(rows.reduce((n, r) => n + r.played, 0)).toBe(TEAMS_PER_LEAGUE * 5);
  });
});

describe('league table', () => {
  it('sorts by points, then goal difference, then goals scored', () => {
    const s = createLeague(you, 120);
    const [a, b] = s.teams;
    // Round 0: you lose heavily to whoever you play, everyone else draws 2-2.
    fillRound(s, 0, (h, aw) => (h === you.id ? [0, 4] : aw === you.id ? [4, 0] : [2, 2]));
    const rows = computeTable(s, you);
    expect(rows[rows.length - 1].isYou).toBe(true);
    expect(rows[0].points).toBe(3);
    // Draws rank below the winner, and among draws, more goals scored wins.
    fillRound(s, 1, (h, aw) => (h === a.id || aw === a.id ? [3, 3] : [0, 0]));
    const after = computeTable(s, you);
    const rowA = after.find((r) => r.team.id === a.id)!;
    const rowB = after.find((r) => r.team.id === b.id)!;
    if (rowA.points === rowB.points && rowA.gf - rowA.ga === rowB.gf - rowB.ga) expect(rowA.gf).toBeGreaterThanOrEqual(rowB.gf);
    expect(after.every((r, i) => i === 0 || after[i - 1].points >= r.points)).toBe(true);
  });

  it('promotes the top two and relegates the bottom one', () => {
    const s = createLeague(you, 120, 3);
    for (const round of s.rounds) for (const f of round) f.score = f.homeId === you.id ? [5, 0] : f.awayId === you.id ? [0, 5] : [1, 1];
    expect(yourPosition(s, you)).toBe(1);
    expect(seasonOutcome(s, you).outcome).toBe('promoted');
    const next = nextSeason(s, you);
    expect(next.tier).toBe(2);
    expect(next.season).toBe(2);
    expect(next.history).toHaveLength(1);
    expect(next.bestTier).toBe(2);

    for (const round of s.rounds) for (const f of round) f.score = f.homeId === you.id ? [0, 5] : f.awayId === you.id ? [5, 0] : [1, 1];
    expect(yourPosition(s, you)).toBe(TEAMS_PER_LEAGUE);
    expect(seasonOutcome(s, you).outcome).toBe('relegated');
    expect(nextSeason(s, you).tier).toBe(4);
    expect(PROMOTED).toBe(2);
    expect(RELEGATED).toBe(1);
  });

  it('cannot fall out of tier 5 and winning tier 1 makes you champion', () => {
    const bottom = createLeague(you, 120, 5);
    for (const round of bottom.rounds) for (const f of round) f.score = f.homeId === you.id ? [0, 5] : f.awayId === you.id ? [5, 0] : [1, 1];
    expect(seasonOutcome(bottom, you).outcome).toBe('stayed');
    expect(nextSeason(bottom, you).tier).toBe(5);

    const top = createLeague(you, 120, 1);
    for (const round of top.rounds) for (const f of round) f.score = f.homeId === you.id ? [5, 0] : f.awayId === you.id ? [0, 5] : [1, 1];
    expect(seasonOutcome(top, you).outcome).toBe('champion');
    expect(nextSeason(top, you).tier).toBe(1);
  });
});
