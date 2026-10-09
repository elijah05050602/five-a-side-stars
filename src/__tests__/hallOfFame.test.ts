import { describe, expect, it } from 'vitest';
import { advanceCareer, applyCareerMatch, applyPlayoffMatch, careerPlayoff, createCareer, pickStar, type CareerState } from '../game/career';
import { HALL_KEEP, SCRAPBOOK_KEEP, addScrap, hallEntry, scrapWhen, type ScrapLine } from '../game/hallOfFame';
import { getCareer, getHall, getTeam, reloadSave, resetAll, retireCareer, saveTeam, setCareer } from '../data/storage';
import { getProgress, recordCareer } from '../data/progress';
import { startingFive } from '../data/defaults';
import { nextFixture } from '../game/league';
import { freshMatchStats } from '../game/sim';
import type { MatchResult } from '../game/MatchScene';
import type { SimOutcome } from '../game/background';
import type { Team } from '../data/types';
import { team } from './helpers';

const KEY = 'five-a-side-stars:v1';

function result(you: Team, opponent: Team, gf: number, ga: number): MatchResult {
  const players = Object.fromEntries(startingFive(you).map((p) => [p.id, { ...freshMatchStats(), goals: p.position === 'ATT' ? gf : 0, saves: p.position === 'GK' ? 3 : 0 }]));
  return { mode: 'match', score: [gf, ga], goals: [], home: you, away: opponent, stats: { touches: [0, 0], distance: [0, 0] }, players, shootout: null, trainingPoints: 0, twoPlayer: false };
}
const draws = (): SimOutcome[] => [0, 1, 2].map(() => ({ score: [1, 1], pens: null }));

function playMatches(c: CareerState, you: Team, n: number, gf = 2, ga = 0): void {
  for (let i = 0; i < n && nextFixture(c.league, you); i++) {
    const f = nextFixture(c.league, you)!;
    applyCareerMatch(c, you, result(you, f.youAreHome ? f.away : f.home, gf, ga), draws());
  }
}

function newCareer(name: string): { c: CareerState; you: Team } {
  const { career: c, team: you } = createCareer(team('src', name, 'U8'), 60);
  pickStar(c, you, you.players.find((p) => p.position === 'ATT')!.id);
  return { c, you };
}

describe('the scrapbook', () => {
  it('writes the big moments of a whole career, oldest first, and keeps where the story started', () => {
    const { c, you } = newCareer('Story Time');
    let seasons = 0;
    while (!c.done && seasons < 30) {
      playMatches(c, you, 5, seasons % 2 ? 0 : 3, seasons % 2 ? 2 : 0);
      const po = careerPlayoff(c, you);
      if (po) applyPlayoffMatch(c, you, result(you, po.opponent.team, 2, 1));
      advanceCareer(c, you);
      if (c.trialDay) c.trialDay = null;
      seasons++;
    }
    const book = c.scrapbook;
    expect(book[0]).toMatchObject({ at: 1, emoji: '🌱' });
    expect(book[0].text).toContain('Story Time');
    expect(book.length).toBeLessThanOrEqual(SCRAPBOOK_KEEP);
    expect(book.some((l) => l.emoji === '🥇' && l.text.includes('Champions of the Acorn League'))).toBe(true);
    expect(book.some((l) => l.text.includes('First Goal'))).toBe(true);
    expect(book[book.length - 1].emoji).toBe('🎓');
    expect(book.every((l, i) => i === 0 || l.at >= book[i - 1].at)).toBe(true);
  });

  it('names the mini season for each line, and drops the oldest middle lines when full', () => {
    expect(scrapWhen(1)).toBe('U5 Autumn');
    expect(scrapWhen(7)).toBe('U6 Spring');
    expect(scrapWhen(24)).toBe('U10 Summer');
    const book: ScrapLine[] = [];
    for (let i = 0; i < SCRAPBOOK_KEEP + 10; i++) addScrap(book, i + 1, '⚽', `Line ${i}`);
    expect(book).toHaveLength(SCRAPBOOK_KEEP);
    expect(book.slice(0, 5).map((l) => l.text)).toEqual(['Line 0', 'Line 1', 'Line 2', 'Line 3', 'Line 4']);
    expect(book[5].text).toBe('Line 15');
    expect(book[book.length - 1].text).toBe(`Line ${SCRAPBOOK_KEEP + 9}`);
  });
});

describe('the Hall of Fame', () => {
  it('sums a career up: Star card, trophies, totals, rival and scrapbook, in a few KB', () => {
    const { c, you } = newCareer('Summed Up');
    playMatches(c, you, 5);
    advanceCareer(c, you);
    const e = hallEntry(c, you, 1, 1000);
    const star = you.players.find((p) => p.id === c.starId)!;
    expect(e).toMatchObject({ no: 1, ended: 1000, finished: false, age: 'U5', seasons: 1, titles: 1, bestTier: 4 });
    expect(e.team.name).toBe('Summed Up');
    expect(e.star).toMatchObject({ name: star.name, number: star.number, position: 'ATT' });
    expect(Object.keys(e.star!.skills)).toHaveLength(7);
    expect(e.tierTitles).toEqual([0, 0, 0, 0, 1]);
    expect(e.totals.goals).toBe(c.careerStats[star.id].goals);
    expect(e.best).toEqual({ when: 'U5 Autumn', tier: 5, position: 1 });
    expect(e.scrapbook.length).toBeGreaterThan(1);
    expect(JSON.stringify(e).length).toBeLessThan(8_000);
  });

  it('keeps a retired career after a reload, but not one that never kicked a ball', () => {
    resetAll();
    const a = newCareer('Never Played');
    saveTeam(a.you);
    setCareer(a.c);
    expect(retireCareer()).toBeNull();
    expect(getCareer()).toBeNull();
    expect(getHall()).toEqual([]);
    const b = newCareer('Retired Rovers');
    playMatches(b.c, b.you, 2);
    saveTeam(b.you);
    setCareer(b.c);
    expect(retireCareer()!.no).toBe(1);
    expect(getCareer()).toBeNull();
    // The team stays in My Teams.
    expect(getTeam(b.you.id)?.name).toBe('Retired Rovers');
    reloadSave();
    expect(getHall().map((e) => e.team.name)).toEqual(['Retired Rovers']);
  });

  it('numbers careers in order and keeps the newest twenty', () => {
    resetAll();
    for (let i = 0; i < HALL_KEEP + 2; i++) {
      const x = newCareer(`Team ${i}`);
      playMatches(x.c, x.you, 1);
      saveTeam(x.you);
      setCareer(x.c);
      retireCareer();
    }
    const hall = getHall();
    expect(hall).toHaveLength(HALL_KEEP);
    expect(hall[0]).toMatchObject({ no: HALL_KEEP + 2 });
    expect(hall[0].team.name).toBe(`Team ${HALL_KEEP + 1}`);
    expect(hall[hall.length - 1].no).toBe(3);
  });

  it('gives the Hall of Famer sticker for the third career', () => {
    resetAll();
    expect(recordCareer({ hall: 2 })).toEqual([]);
    expect(recordCareer({ hall: 3 }).map((s) => s.id)).toEqual(['hall-of-famer']);
    expect(getProgress().stickers).toContain('hall-of-famer');
  });

  it('loads a save from before the Hall of Fame: the career gets a scrapbook from its past seasons', () => {
    resetAll();
    const { c, you } = newCareer('Old Timers');
    playMatches(c, you, 5);
    advanceCareer(c, you);
    saveTeam(you);
    setCareer(c);
    const save = JSON.parse(localStorage.getItem(KEY)!);
    delete save.career.scrapbook;
    delete save.hall;
    localStorage.setItem(KEY, JSON.stringify(save));
    reloadSave();
    expect(getCareer()!.scrapbook).toEqual([{ at: 1, emoji: '🥇', text: 'Champions of the Acorn League!' }]);
    expect(getHall()).toEqual([]);
  });

  it('mends a Hall of Fame entry that has gone wrong, and leaves out one that is not a career', () => {
    resetAll();
    const x = newCareer('Mended');
    playMatches(x.c, x.you, 1);
    saveTeam(x.you);
    setCareer(x.c);
    retireCareer();
    const save = JSON.parse(localStorage.getItem(KEY)!);
    save.hall[0].star.skills.speed = 99;
    save.hall[0].scrapbook.push({ at: 'soon', emoji: '?', text: 3 });
    save.hall[0].tierTitles = 'lots';
    save.hall.push({ nonsense: true }, 'not a career');
    localStorage.setItem(KEY, JSON.stringify(save));
    reloadSave();
    const hall = getHall();
    expect(hall).toHaveLength(1);
    expect(hall[0].star!.skills.speed).toBe(5);
    expect(hall[0].tierTitles).toEqual([0, 0, 0, 0, 0]);
    expect(hall[0].scrapbook.every((l) => typeof l.at === 'number')).toBe(true);
    // Something had to be left out, so the save as it was is kept as the backup.
    expect(localStorage.getItem(`${KEY}:backup`)).not.toBeNull();
  });
});
