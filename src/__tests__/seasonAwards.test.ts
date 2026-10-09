import { describe, expect, it } from 'vitest';
import { seasonAwards } from '../game/seasonAwards';
import { createLeague, seasonOutcome, tallyMatch, nextFixture, type Tally } from '../game/league';
import { advanceCareer, applyCareerMatch, careerSeasonOver, createCareer, pickStar } from '../game/career';
import { recordCareer, recordSeason } from '../data/progress';
import { getCareer, getLeague, reloadSave, resetAll, saveTeam, setCareer, setLeague } from '../data/storage';
import { startingFive } from '../data/defaults';
import { freshMatchStats } from '../game/sim';
import type { MatchResult } from '../game/MatchScene';
import type { Team } from '../data/types';
import { team } from './helpers';

const KEY = 'five-a-side-stars:v1';
const row = (over: Partial<Tally>): Tally => ({ club: 'a', name: 'X', gk: false, p: 10, g: 0, a: 0, sv: 0, cs: 0, motm: 0, ...over });

/** The career team wins 2-0 with every starter doing a bit. */
function win(you: Team, opponent: Team): MatchResult {
  const players = Object.fromEntries(startingFive(you).map((p) => [p.id, { ...freshMatchStats(), goals: p.position === 'ATT' ? 1 : 0, assists: p.position === 'MID' ? 1 : 0, passes: 5, saves: p.position === 'GK' ? 3 : 0 }]));
  return { mode: 'match', score: [2, 0], goals: [], home: you, away: opponent, stats: { touches: [0, 0], distance: [0, 0] }, players, shootout: null, trainingPoints: 0, twoPlayer: false };
}

describe('end-of-season awards', () => {
  it('picks the Golden Boot and the best midfielder, defender and keeper, with clean sheets first at the back', () => {
    const tally: Record<string, Tally> = {
      striker: row({ name: 'Sam', pos: 'ATT', g: 9, a: 1 }),
      mid: row({ name: 'Mo', pos: 'MID', g: 2, a: 6 }),
      wing: row({ name: 'Wren', pos: 'WING', g: 3, a: 2 }),
      def1: row({ name: 'Dee', pos: 'DEF', g: 3, cs: 2 }),
      def2: row({ name: 'Rio', pos: 'DEF', g: 0, cs: 5, club: 'b' }),
      gk1: row({ name: 'Kit', gk: true, pos: 'GK', sv: 40, cs: 1 }),
      gk2: row({ name: 'Ana', gk: true, pos: 'GK', sv: 12, cs: 4 }),
    };
    const got = seasonAwards(tally);
    expect(got.map((a) => [a.id, a.name])).toEqual([['golden-boot', 'Sam'], ['best-mid', 'Mo'], ['best-def', 'Rio'], ['best-keeper', 'Ana']]);
    expect(got.find((a) => a.id === 'best-keeper')!.line).toBe('4 clean sheets, 12 saves');
    expect(got.find((a) => a.id === 'best-def')!.club).toBe('b');
    // Only the clubs in this league, and a tally from before positions were kept has only keepers to place.
    expect(seasonAwards(tally, ['b']).map((a) => a.id)).toEqual(['best-def']);
    expect(seasonAwards({ old: row({ g: 2 }), k: row({ gk: true, cs: 1 }) }).map((a) => a.id)).toEqual(['golden-boot', 'best-keeper']);
    expect(seasonAwards({})).toEqual([]);
  });

  it('counts a clean sheet for everyone who played, and where they played', () => {
    const home = team('h', 'Home'), away = team('a', 'Away');
    const lines = Object.fromEntries([...home.players, ...away.players].map((p) => [p.id, { g: 0, a: 0, sv: 0 }]));
    const tally: Record<string, Tally> = {};
    tallyMatch([tally], home, away, [1, 0], lines);
    const def = home.players.find((p) => p.position === 'DEF')!;
    expect(tally[def.id]).toMatchObject({ cs: 1, pos: 'DEF' });
    expect(tally[away.players[0].id].cs).toBe(0);
  });

  it('are given in league mode at the end of the season, with stickers for your players', () => {
    resetAll();
    const you = team('you', 'Award Hunters');
    const ls = createLeague(you, 60);
    const mid = you.players[1];
    ls.tally = {
      [you.players[0].id]: row({ club: you.id, name: 'A', gk: true, pos: 'GK', cs: 3 }),
      [mid.id]: row({ club: you.id, name: 'B', pos: 'MID', a: 4 }),
      x: row({ club: ls.teams[0].id, name: 'C', pos: 'ATT', g: 7 }),
    };
    const rec = seasonOutcome(ls, you);
    expect(rec.awards!.map((a) => a.id)).toEqual(['golden-boot', 'best-mid', 'best-keeper']);
    expect(recordSeason(rec, you.id).map((s) => s.id).filter((id) => id.startsWith('season'))).toEqual(['season-mid', 'season-keeper']);
    expect(recordCareer({ seasonAwards: ['golden-boot', 'best-mid', 'best-def', 'best-keeper'] }).map((s) => s.id)).toEqual(['season-boot', 'season-def', 'award-sweep']);
  });

  it('are given at the end of every career mini season, and the Star earns milestones for them', () => {
    const src = team('src', 'Clean Sheeters', 'U8');
    const { career: c, team: you } = createCareer(src, 60);
    const def = startingFive(you).find((p) => p.position === 'DEF')!;
    pickStar(c, you, def.id);
    while (!careerSeasonOver(c)) {
      const f = nextFixture(c.league, you)!;
      applyCareerMatch(c, you, win(you, f.youAreHome ? f.away : f.home), [0, 1, 2].map(() => ({ score: [1, 1], pens: null })));
    }
    const adv = advanceCareer(c, you);
    expect(adv.record.awards!.find((a) => a.id === 'best-def')).toMatchObject({ playerId: def.id, club: you.id });
    expect(adv.milestones.map((m) => m.id)).toContain('best-def');
    expect(c.history[0].awards!.length).toBeGreaterThan(0);
    expect(c.scrapbook.some((l) => l.text.includes("league's Best Defender"))).toBe(true);
  });

  it('loads saves from before the awards, and leaves out an award it cannot read', () => {
    resetAll();
    const you = team('you', 'Old League');
    saveTeam(you);
    const ls = createLeague(you, 60);
    ls.history = [{ season: 1, tier: 5, position: 3, outcome: 'stayed' }, { season: 2, tier: 5, position: 1, outcome: 'promoted', awards: [{ id: 'golden-boot', playerId: 'p', name: 'Mia', club: you.id, line: '9 goals' }, { id: 'best-dancer', playerId: 'p', name: 'Mia', club: you.id, line: '' }] as never }];
    ls.tally = { p: { ...row({ club: you.id, pos: 'Striker' as never }) } };
    setLeague(ls);
    const { career, team: ct } = createCareer(team('src', 'Old Career'), 60);
    saveTeam(ct);
    career.history = [{ ...career.history[0], season: 1, tier: 5, position: 2, outcome: 'stayed', year: 1, miniSeason: 1, age: 'U5', topScorer: null, awards: 'lots' as never }];
    setCareer(career);
    localStorage.setItem(KEY, localStorage.getItem(KEY)!);
    reloadSave();
    const back = getLeague()!;
    expect(back.history[0].awards).toBeUndefined();
    expect(back.history[1].awards).toEqual([{ id: 'golden-boot', playerId: 'p', name: 'Mia', club: you.id, line: '9 goals' }]);
    expect(back.tally.p.pos).toBeUndefined();
    expect(getCareer()!.history[0].awards).toEqual([]);
  });
});
