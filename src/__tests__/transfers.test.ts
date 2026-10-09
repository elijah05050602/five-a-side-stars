import { describe, expect, it } from 'vitest';
import { SEASONS_PER_YEAR, TRAINING, advanceCareer, applyCareerMatch, careerStar, createCareer, joinClub, pickStar, stayAtClub, transferOffers, type CareerState } from '../game/career';
import { WORLD_CLUBS, clubById, isDavao, tierOf } from '../game/careerWorld';
import { getCareer, reloadSave, resetAll, saveTeam, setCareer } from '../data/storage';
import { recordCareer } from '../data/progress';
import { startingFive } from '../data/defaults';
import { nextFixture } from '../game/league';
import { freshMatchStats } from '../game/sim';
import type { MatchResult } from '../game/MatchScene';
import type { SimOutcome } from '../game/background';
import type { Team } from '../data/types';
import { team } from './helpers';
import { seedRandom } from './setup';

const KEY = 'five-a-side-stars:v1';

function result(you: Team, opponent: Team, gf: number, ga: number): MatchResult {
  const players = Object.fromEntries(startingFive(you).map((p) => [p.id, { ...freshMatchStats(), goals: p.position === 'ATT' ? gf : 0 }]));
  return { mode: 'match', score: [gf, ga], goals: [], home: you, away: opponent, stats: { touches: [0, 0], distance: [0, 0] }, players, shootout: null, trainingPoints: 0, twoPlayer: false };
}
const draws = (): SimOutcome[] => [0, 1, 2].map(() => ({ score: [1, 1], pens: null }));

/** A career one year in, at the transfer window. */
function aYearIn(name = 'Movers'): { c: CareerState; you: Team } {
  const { career: c, team: you } = createCareer(team('src', name, 'U8'), 60);
  pickStar(c, you, you.players.find((p) => p.position === 'ATT')!.id);
  for (let s = 0; s < SEASONS_PER_YEAR; s++) {
    while (nextFixture(c.league, you)) {
      const f = nextFixture(c.league, you)!;
      applyCareerMatch(c, you, result(you, f.youAreHome ? f.away : f.home, 1, 1), draws());
    }
    advanceCareer(c, you);
  }
  return { c, you };
}

const total = (c: CareerState) => c.world.tiers.reduce((n, t) => n + t.members.length, 0);

describe('transfers', () => {
  it('brings one to three offers from clubs in your tier or higher when moving up an age group', () => {
    for (let i = 0; i < 6; i++) {
      seedRandom(100 + i);
      const { c, you } = aYearIn();
      expect(c.year).toBe(2);
      expect(c.offers!.length).toBeGreaterThanOrEqual(1);
      expect(c.offers!.length).toBeLessThanOrEqual(3);
      for (const o of c.offers!) {
        const club = clubById(c.world, o.clubId)!;
        expect(club.tier).toBeLessThanOrEqual(tierOf(c.world, you.id));
        expect(o.why.length).toBeGreaterThan(10);
      }
      expect(new Set(c.offers!.map((o) => o.clubId)).size).toBe(c.offers!.length);
    }
  });

  it('staying makes the Star captain, and the Trial Day carries on', () => {
    seedRandom(7);
    const { c, you } = aYearIn();
    const before = c.trainingPoints;
    const got = stayAtClub(c, you);
    expect(got.map((m) => m.id)).toEqual(['captain']);
    expect(c.milestones).toContain('captain');
    expect(c.trainingPoints - before).toBe(TRAINING.milestone);
    expect(c.offers).toBeNull();
    expect(c.trialDay).not.toBeNull();
    expect(c.scrapbook.some((l) => l.emoji === '🛡️')).toBe(true);
    // Staying again later is not a second captaincy.
    c.offers = [{ clubId: c.world.clubs[0].team.id, why: 'again' }];
    expect(stayAtClub(c, you)).toEqual([]);
  });

  it('joining moves the Star alone to the new club, in its tier, and the old club stays in the world', () => {
    seedRandom(11);
    const { c, you } = aYearIn();
    const star = careerStar(c, you)!;
    const offer = c.offers![0];
    const club = clubById(c.world, offer.clubId)!;
    const oldTier = tierOf(c.world, you.id);
    const newTier = club.tier;
    const mates = club.team.players.length;
    const fresh = joinClub(c, you, offer.clubId)!;
    expect(fresh.id).toBe(offer.clubId);
    expect(c.teamId).toBe(fresh.id);
    expect(fresh.career).toBe(true);
    expect(fresh.ageGroup).toBe('U6');
    expect(careerStar(c, fresh)?.id).toBe(star.id);
    expect(fresh.players.find((p) => p.id === star.id)!.starter).toBe(true);
    expect(fresh.players.filter((p) => p.starter)).toHaveLength(5);
    expect(fresh.players.length).toBeGreaterThanOrEqual(mates);
    expect(new Set(fresh.players.map((p) => p.number)).size).toBe(fresh.players.length);
    // The Star left the old squad, which still has five starters, and the old club plays on in the world.
    expect(you.players.some((p) => p.id === star.id)).toBe(false);
    expect(you.players.filter((p) => p.starter)).toHaveLength(5);
    const oldClub = c.world.clubs.find((x) => x.team.name === you.name)!;
    expect(oldClub.team.id).not.toBe(you.id);
    expect(tierOf(c.world, oldClub.team.id)).toBe(oldTier);
    expect(clubById(c.world, fresh.id)).toBeUndefined();
    expect(tierOf(c.world, fresh.id)).toBe(newTier);
    expect(c.world.clubs).toHaveLength(WORLD_CLUBS);
    expect(total(c)).toBe(WORLD_CLUBS + 1);
    expect(c.league.tier).toBe(newTier);
    expect(c.league.round).toBe(0);
    expect(c.trialDay).toBeNull();
    expect(c.offers).toBeNull();
    expect(c.moves).toBe(1);
    expect(c.scrapbook.some((l) => l.emoji === '✈️')).toBe(true);
    // The career carries on with the new club.
    while (nextFixture(c.league, fresh)) {
      const f = nextFixture(c.league, fresh)!;
      applyCareerMatch(c, fresh, result(fresh, f.youAreHome ? f.away : f.home, 2, 0), draws());
    }
    expect(c.careerStats[star.id].played).toBeGreaterThan(20);
    advanceCareer(c, fresh);
    expect(total(c)).toBe(WORLD_CLUBS + 1);
  });

  it('joining your rival makes your old club the new rival', () => {
    for (let seed = 0; seed < 80; seed++) {
      seedRandom(seed);
      const { c, you } = aYearIn();
      const offer = c.offers!.find((o) => o.clubId === c.world.rivalId);
      if (!offer) continue;
      joinClub(c, you, offer.clubId);
      expect(clubById(c.world, c.world.rivalId)!.team.name).toBe(you.name);
      return;
    }
    throw new Error('no rival offer in 80 careers');
  });

  it('Davao Strikers can ask at the step up to the Under 7s, and only then', () => {
    let seen = false;
    for (let seed = 0; seed < 40 && !seen; seed++) {
      seedRandom(seed);
      const { c, you } = aYearIn();
      c.year = 3; // as if moving up to the Under 7s
      seen = transferOffers(c, you).some((o) => isDavao(clubById(c.world, o.clubId)!));
      c.year = 2;
      expect(transferOffers(c, you).some((o) => isDavao(clubById(c.world, o.clubId)!))).toBe(false);
    }
    expect(seen).toBe(true);
  });

  it('loads a save from before transfers with no offers, and drops an offer from a club that is gone', () => {
    resetAll();
    seedRandom(3);
    const { c, you } = aYearIn('Saved Movers');
    saveTeam(you);
    setCareer(c);
    const save = JSON.parse(localStorage.getItem(KEY)!);
    delete save.career.offers;
    localStorage.setItem(KEY, JSON.stringify(save));
    reloadSave();
    expect(getCareer()!.offers).toBeNull();
    expect(getCareer()!.moves).toBe(0);
    const again = JSON.parse(localStorage.getItem(KEY)!);
    again.career.offers = [{ clubId: 'nobody', why: 'gone' }, { clubId: c.world.clubs[0].team.id, why: 'still here' }];
    localStorage.setItem(KEY, JSON.stringify(again));
    reloadSave();
    expect(getCareer()!.offers).toEqual([{ clubId: c.world.clubs[0].team.id, why: 'still here' }]);
  });

  it('gives New Adventure for joining a club, and Loyal Club for a whole career at one club', () => {
    resetAll();
    expect(recordCareer({ joined: true }).map((s) => s.id)).toEqual(['new-adventure']);
    expect(recordCareer({ loyal: false })).toEqual([]);
    expect(recordCareer({ loyal: true }).map((s) => s.id)).toEqual(['loyal-club']);
  });
});
