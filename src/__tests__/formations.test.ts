import { describe, expect, it } from 'vitest';
import { FORMATIONS, applyFormation, assignSlots, formationById, formationFor, setPosition } from '../data/formations';
import { generateOpponent, makeKit, makePlayer } from '../data/defaults';
import { MatchSim } from '../game/sim';
import { cpuMatch, runUntil, team } from './helpers';

describe('formations', () => {
  it('every formation has four outfield spots in our own half', () => {
    for (const f of FORMATIONS) {
      expect(f.slots).toHaveLength(4);
      for (const s of f.slots) { expect(s.x).toBeGreaterThan(0); expect(s.x).toBeLessThan(0.5); expect(Math.abs(s.z)).toBeLessThan(0.5); }
    }
    expect(FORMATIONS.some((f) => f.slots.some((s) => s.pos === 'MID'))).toBe(true);
    expect(FORMATIONS.some((f) => f.slots.some((s) => s.pos === 'WING'))).toBe(true);
  });

  it('puts players in their own position first, then the closest fit', () => {
    const players = [makePlayer('DEF', 2), makePlayer('MID', 3), makePlayer('ATT', 9), makePlayer('ATT', 10)];
    const slots = assignSlots(players, formationById('diamond'));
    expect(slots.get(players[0])!.pos).toBe('DEF');
    expect(slots.get(players[2])!.pos).toBe('ATT');
    // The midfielder and the spare striker both end up on a wing.
    expect(slots.get(players[1])!.pos).toBe('WING');
    expect(slots.get(players[3])!.pos).toBe('WING');
  });

  it('picking a formation moves the starters into its positions, and the positions find the formation again', () => {
    const t = team('h', 'Home');
    applyFormation(t, 'wings');
    const outfield = t.players.filter((p) => p.position !== 'GK').map((p) => p.position).sort();
    expect(outfield).toEqual(['ATT', 'DEF', 'WING', 'WING']);
    expect(t.players.filter((p) => p.position === 'GK')).toHaveLength(1);
    expect(formationFor(t)).toBe('wings');
    // Diamond uses the same positions, so a team on a formation that no longer fits lands on the first match.
    t.formation = 'box';
    expect(formationFor(t)).toBe('diamond');
  });

  it('a sub made into a keeper leaves the starting keeper in goal', () => {
    const t = team('h', 'Home');
    const gk = t.players[0];
    const spare = makePlayer('DEF', 12, 'Spare', false);
    t.players.push(spare);
    setPosition(t, spare, 'GK');
    expect(spare.position).toBe('GK');
    expect(gk.position).toBe('GK');
    expect(gk.starter).toBe(true);
    // Moving the spare keeper back out of goal leaves the starting keeper alone too.
    setPosition(t, spare, 'DEF');
    expect(gk.position).toBe('GK');
    expect(t.players.slice(1, 5).every((p) => p.position !== 'GK')).toBe(true);
  });

  it('a starter made into a keeper swaps places with the starting keeper, and a keeper is always kept', () => {
    const t = team('h', 'Home');
    const [gk, d1] = t.players;
    setPosition(t, d1, 'GK');
    expect(d1.position).toBe('GK');
    expect(gk.position).toBe('DEF');
    // The only starting keeper moving out of goal puts another starter in goal, not a sub.
    t.players.push(makePlayer('ATT', 12, 'Sub', false));
    setPosition(t, d1, 'ATT');
    expect(t.players.filter((p) => p.starter && p.position === 'GK')).toHaveLength(1);
    expect(t.players[5].position).toBe('ATT');
  });

  it('lines each team up in its formation and every formation plays a full match', () => {
    for (const f of FORMATIONS) {
      const home = team('h', 'Home');
      applyFormation(home, f.id);
      const sim = new MatchSim({ home, away: team('a', 'Away', 'U8', '#3da5f4'), difficulty: 'normal', halfSeconds: 10, humanSide: null });
      const mine = sim.players.filter((p) => p.side === 0 && !p.isKeeper);
      for (const p of mine) {
        const slot = f.slots.find((s) => s.pos === p.role && Math.abs(p.home.x - (-sim.length / 2 + sim.length * s.x)) < 1e-6 && Math.abs(p.home.z - sim.width * s.z) < 1e-6);
        expect(slot, `${f.id}: ${p.info.name} as ${p.role}`).toBeTruthy();
      }
      runUntil(sim, (s) => s.phase === 'fulltime');
      expect(sim.phase).toBe('fulltime');
    }
  });

  it('wingers stay wider than strikers on average', () => {
    const home = team('h', 'Home');
    applyFormation(home, 'wings');
    const sim = new MatchSim({ home, away: team('a', 'Away', 'U8', '#3da5f4'), difficulty: 'normal', halfSeconds: 30, humanSide: null });
    let wing = 0, att = 0, n = 0;
    runUntil(sim, (s) => {
      for (const p of s.players.filter((q) => q.side === 0)) {
        if (p.role === 'WING') wing += Math.abs(p.pos.z) / 2;
        if (p.role === 'ATT') att += Math.abs(p.pos.z);
      }
      n++;
      return s.phase === 'halftime' || n > 60 * 30;
    });
    expect(wing / n).toBeGreaterThan(att / n);
  });

  it('computer opponents use a mix of formations and stay playable', () => {
    const seen = new Set<string>();
    for (let i = 0; i < 40; i++) {
      const t = generateOpponent('U8', makeKit('#e63946', '#ffffff', '#1b2a41', '#e63946'));
      seen.add(t.formation ?? 'box');
      expect(formationFor(t)).toBe(t.formation);
    }
    expect(seen.size).toBeGreaterThan(3);
    const sim = cpuMatch();
    expect(sim.players.filter((p) => p.side === 0 && p.role === 'ATT').length).toBe(2);
  });
});
