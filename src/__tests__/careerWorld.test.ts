import { describe, expect, it } from 'vitest';
import { SEASONS_PER_YEAR, advanceCareer, applyCareerMatch, applyPlayoffMatch, careerPlayoff, careerSeasonOutcome, careerSeasonOver, createCareer, playoffWaiting, type CareerState } from '../game/career';
import { WORLD_CLUBS, activeIds, clubById, playOtherTiers, startSeasons, tierOf } from '../game/careerWorld';
import { CLUB_NAME } from '../data/club';
import { startingFive } from '../data/defaults';
import { nextFixture } from '../game/league';
import { freshMatchStats } from '../game/sim';
import type { MatchResult } from '../game/MatchScene';
import type { SimOutcome } from '../game/background';
import type { Team } from '../data/types';
import { team } from './helpers';

function result(you: Team, opponent: Team, gf: number, ga: number, mode: MatchResult['mode'] = 'match'): MatchResult {
  const players = Object.fromEntries(startingFive(you).map((p) => [p.id, { ...freshMatchStats(), goals: p.position === 'ATT' && gf ? 1 : 0, saves: p.position === 'GK' ? 3 : 0 }]));
  return { mode, score: [gf, ga], goals: [], home: you, away: opponent, stats: { touches: [0, 0], distance: [0, 0] }, players, shootout: null, trainingPoints: 0, twoPlayer: false };
}

/** The rest of each round as 1–1 draws, as if played in the background. */
const draws = (): SimOutcome[] => [0, 1, 2].map(() => ({ score: [1, 1], pens: null }));

/** Play a whole mini season with your scores in order (the rest of the league drawing 1–1). */
function playSeason(c: CareerState, you: Team, scores: [number, number][]): void {
  for (const [gf, ga] of scores) {
    const f = nextFixture(c.league, you)!;
    applyCareerMatch(c, you, result(you, f.youAreHome ? f.away : f.home, gf, ga), draws());
  }
}

/** With everyone else drawing 1–1, these finish 2nd (one win, three draws, one loss) and 5th (one big win, a draw, three losses). */
const SECOND: [number, number][] = [[1, 0], [1, 1], [1, 1], [1, 1], [0, 1]];
const FIFTH: [number, number][] = [[3, 0], [1, 1], [0, 1], [0, 1], [0, 1]];
const CHAMPS: [number, number][] = [[2, 0], [2, 0], [2, 0], [2, 0], [2, 0]];

const sizes = (c: CareerState) => c.world.tiers.map((t) => t.members.length);

describe('career world', () => {
  it('makes 30 clubs, six in every tier, with you as the seventh in the Acorn League and a rival nearby', () => {
    const { career: c, team: you } = createCareer(team('src', 'Little Lions', 'U8'), 60);
    const w = c.world;
    expect(w.clubs).toHaveLength(WORLD_CLUBS);
    expect(new Set(w.clubs.map((x) => x.team.name)).size).toBe(WORLD_CLUBS);
    expect(w.clubs.every((x) => x.team.name !== you.name && x.team.ageGroup === 'U5')).toBe(true);
    expect(sizes(c)).toEqual([6, 6, 6, 6, 7]);
    expect(tierOf(w, you.id)).toBe(5);
    // Davao Strikers are one of the clubs when you are not them, wearing their badge without the crest picture.
    const davao = w.clubs.find((x) => x.team.name === CLUB_NAME);
    expect(davao).toBeDefined();
    expect(davao!.team.badge.image).toBeUndefined();
    // Stronger clubs start higher up, give or take a little shuffle.
    const avg = (tier: number) => w.clubs.filter((x) => x.tier === tier).reduce((n, x) => n + x.strength, 0) / 6;
    expect(avg(1)).toBeGreaterThan(avg(5));
    expect([4, 5]).toContain(tierOf(w, w.rivalId));
    // One club in your tier rests, and your league is the other five.
    expect(c.league.teams.map((t) => t.id).sort()).toEqual(activeIds(w.tiers[4]).filter((id) => id !== you.id).sort());
    expect(w.tiers[4].resting).not.toBeNull();
  });

  it('plays every tier round by round, filling the stats pages and your record against each club', () => {
    const { career: c, team: you } = createCareer(team('src', 'Stat Stars', 'U8'), 60);
    playSeason(c, you, CHAMPS);
    expect(careerSeasonOver(c)).toBe(true);
    for (const t of c.world.tiers.slice(0, 4)) {
      expect(t.rounds).toHaveLength(5);
      expect(t.rounds.flat().every((f) => f.score)).toBe(true);
    }
    // Players from the other tiers have scored and kept goal.
    const otherClubs = new Set(c.world.clubs.filter((x) => x.tier < 5).map((x) => x.team.id));
    const rows = Object.values(c.world.tally).filter((t) => otherClubs.has(t.club));
    expect(rows.reduce((n, t) => n + t.g, 0)).toBeGreaterThan(10);
    expect(rows.some((t) => t.gk && t.sv > 0)).toBe(true);
    // The season's tally has your league in it, your players included.
    expect(Object.values(c.league.tally).some((t) => t.club === you.id && t.p === 5)).toBe(true);
    expect(c.world.you).toMatchObject({ p: 5, w: 5, run: 5, bestRun: 5, form: 'WWWWW', big: [2, 0, expect.any(String)] });
    expect(Object.values(c.world.h2h).reduce((n, r) => n + r.w, 0)).toBe(5);
  });

  it('sends champions up and the bottom club down, keeping every tier the same size', () => {
    const { career: c, team: you } = createCareer(team('src', 'Climbers', 'U8'), 60);
    playSeason(c, you, CHAMPS);
    expect(careerPlayoff(c, you)).toBeNull();
    const adv = advanceCareer(c, you);
    expect(adv.record.outcome).toBe('promoted');
    expect(adv.titleTier).toBe(5);
    expect(c.league.tier).toBe(4);
    expect(tierOf(c.world, you.id)).toBe(4);
    expect(sizes(c).reduce((a, b) => a + b, 0)).toBe(WORLD_CLUBS + 1);
    // Every tier still has six places: the swaps are always one for one.
    expect(sizes(c).every((n) => n === 6 || n === 7)).toBe(true);
    expect(c.world.tierTitles).toEqual([0, 0, 0, 0, 1]);
    expect(c.world.ladder).toHaveLength(5);
    expect(c.world.news.some((n) => n.text.includes(you.name) && n.emoji === '⬆️')).toBe(true);
    // Every club has a line for the season just gone.
    expect(c.world.clubs.every((x) => x.past.length === 1)).toBe(true);
  });

  it('puts 2nd place into a play-off that a draw sends to penalties, and winning it goes up', () => {
    const { career: c, team: you } = createCareer(team('src', 'Play-off Pals', 'U8'), 60);
    playSeason(c, you, SECOND);
    expect(careerSeasonOutcome(c, you).position).toBe(2);
    const po = careerPlayoff(c, you)!;
    expect(po.up).toBe(true);
    expect(po.opponent.tier).toBe(4);
    expect(playoffWaiting(c, you)).toBe(true);
    const s = applyPlayoffMatch(c, you, result(you, po.opponent.team, 2, 2))!;
    expect(s.growth).toBeDefined();
    expect(c.world.playoff).toMatchObject({ won: null, score: [2, 2] });
    expect(playoffWaiting(c, you)).toBe(true);
    // Playing the match again does nothing; the shoot-out settles it.
    expect(applyPlayoffMatch(c, you, result(you, po.opponent.team, 5, 0))).toBeNull();
    applyPlayoffMatch(c, you, result(you, po.opponent.team, 4, 3, 'shootout'));
    expect(c.world.playoff).toMatchObject({ won: true, pens: [4, 3] });
    expect(playoffWaiting(c, you)).toBe(false);
    const adv = advanceCareer(c, you);
    expect(adv.record).toMatchObject({ outcome: 'promoted', playoff: 'won' });
    expect(tierOf(c.world, you.id)).toBe(4);
    expect(tierOf(c.world, po.opponent.team.id)).toBe(5);
    expect(c.world.playoff).toBeNull();
  });

  it('puts 5th place into a play-off to stay up, and losing it goes down', () => {
    const { career: c, team: you } = createCareer(team('src', 'Escape Act', 'U8'), 60);
    playSeason(c, you, CHAMPS);
    advanceCareer(c, you);
    playSeason(c, you, FIFTH);
    expect(careerSeasonOutcome(c, you).position).toBe(5);
    const po = careerPlayoff(c, you)!;
    expect(po.up).toBe(false);
    expect(po.opponent.tier).toBe(5);
    applyPlayoffMatch(c, you, result(you, po.opponent.team, 0, 1));
    const adv = advanceCareer(c, you);
    expect(adv.record).toMatchObject({ outcome: 'relegated', playoff: 'lost' });
    expect(tierOf(c.world, you.id)).toBe(5);
    expect(tierOf(c.world, po.opponent.team.id)).toBe(4);
  });

  it('rests a different club each mini season in a tier of seven', () => {
    const { career: c, team: you } = createCareer(team('src', 'Restful', 'U8'), 60);
    const w = c.world;
    const tier = w.tiers[4];
    const rested = new Set<string>();
    for (let si = 2; si <= 7; si++) {
      rested.add(tier.resting!);
      startSeasons(w, you.id, si);
    }
    rested.add(tier.resting!);
    expect(rested.size).toBe(6);
    expect(rested.has(you.id)).toBe(false);
  });

  it('grows the whole world up a year: tiers carry over, squads change, the player to watch stays and grows', () => {
    const { career: c, team: you } = createCareer(team('src', 'Big Kids', 'U8'), 60);
    const stars = new Map(c.world.clubs.map((x) => [x.team.id, { id: x.starId, total: Object.values(clubById(c.world, x.team.id)!.team.players.find((p) => p.id === x.starId)!.skills).reduce((a, b) => a + b, 0) }]));
    for (let s = 0; s < SEASONS_PER_YEAR; s++) {
      playSeason(c, you, SECOND.map(() => [1, 1]));
      const tiersBefore = new Map(c.world.clubs.map((x) => [x.team.id, x.tier]));
      const adv = advanceCareer(c, you);
      if (s < SEASONS_PER_YEAR - 1) continue;
      expect(adv.movedUp).toBe(true);
      // Ageing up moves nobody: only the season's own promotions do, at most one place.
      for (const x of c.world.clubs) expect(Math.abs(x.tier - tiersBefore.get(x.team.id)!)).toBeLessThanOrEqual(1);
    }
    expect(c.world.clubs.every((x) => x.team.ageGroup === 'U6')).toBe(true);
    for (const x of c.world.clubs) {
      const before = stars.get(x.team.id)!;
      expect(x.starId).toBe(before.id);
      const star = x.team.players.find((p) => p.id === x.starId)!;
      expect(Object.values(star.skills).reduce((a, b) => a + b, 0)).toBeGreaterThan(before.total);
    }
    expect(c.league.teams.every((t) => t.ageGroup === 'U6')).toBe(true);
  });

  it('finds a new rival when the old one has been far away for a whole year', () => {
    const { career: c, team: you } = createCareer(team('src', 'Lonely', 'U8'), 60);
    const old = c.world.rivalId;
    // Send the rival to the top tier, swapping with a club there.
    const top = c.world.tiers[0];
    const from = c.world.tiers.find((t) => t.members.includes(old))!;
    const swap = top.members[0];
    top.members[0] = old;
    from.members[from.members.indexOf(old)] = swap;
    clubById(c.world, old)!.tier = 1;
    clubById(c.world, swap)!.tier = from.tier;
    c.league.teams = c.league.teams.map((t) => (t.id === old ? clubById(c.world, swap)!.team : t));
    for (let s = 0; s < SEASONS_PER_YEAR; s++) {
      playSeason(c, you, SECOND.map(() => [1, 1]));
      advanceCareer(c, you);
    }
    if (Math.abs(tierOf(c.world, old) - tierOf(c.world, you.id)) >= 2) {
      expect(c.world.rivalId).not.toBe(old);
      expect(c.world.news.some((n) => n.emoji === '🔥')).toBe(true);
    }
    expect(Math.abs(tierOf(c.world, c.world.rivalId) - tierOf(c.world, you.id))).toBeLessThanOrEqual(3);
  });

  it('plays a whole 120-match career without losing a club, and the save stays small', () => {
    const { career: c, team: you } = createCareer(team('src', 'Long Haul', 'U8'), 60);
    let seasons = 0;
    while (!c.done && seasons < 30) {
      playSeason(c, you, seasons % 3 === 0 ? CHAMPS : seasons % 3 === 1 ? SECOND : FIFTH);
      const po = careerPlayoff(c, you);
      if (po) applyPlayoffMatch(c, you, result(you, po.opponent.team, seasons % 2 ? 2 : 0, 1));
      advanceCareer(c, you);
      seasons++;
      expect(sizes(c).reduce((a, b) => a + b, 0)).toBe(WORLD_CLUBS + 1);
    }
    expect(c.done).toBe(true);
    expect(seasons).toBe(24);
    expect(c.world.clubs.every((x) => x.team.ageGroup === 'U10' && x.past.length === 24)).toBe(true);
    expect(JSON.stringify(c).length).toBeLessThan(400_000);
  });

  it('catches the other tiers up when built in the middle of a season', () => {
    const { career: c, team: you } = createCareer(team('src', 'Catch Up', 'U8'), 60);
    playSeason(c, you, CHAMPS.slice(0, 3));
    for (const t of c.world.tiers.slice(0, 4)) expect(t.rounds.slice(0, 3).flat().every((f) => f.score)).toBe(true);
    // Playing a round again is a no-op.
    const before = JSON.stringify(c.world.tally);
    playOtherTiers(c.world, you.id, 0);
    expect(JSON.stringify(c.world.tally)).toBe(before);
  });
});
