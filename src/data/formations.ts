import type { FormationId, Player, Position, Team } from './types';

/** One outfield spot. x is how far up from our own goal line (0.5 is halfway), z is across the pitch (-0.5..0.5). */
export interface Slot { pos: Exclude<Position, 'GK'>; x: number; z: number }

export interface Formation { id: FormationId; name: string; shape: string; blurb: string; slots: Slot[] }

/** Ways to line up the four outfield players in front of the keeper. */
export const FORMATIONS: Formation[] = [
  {
    id: 'box', name: 'Box', shape: '2-2', blurb: 'Two at the back, two up top. Simple and solid.',
    slots: [{ pos: 'DEF', x: 0.25, z: -0.24 }, { pos: 'DEF', x: 0.25, z: 0.24 }, { pos: 'ATT', x: 0.42, z: -0.18 }, { pos: 'ATT', x: 0.42, z: 0.18 }],
  },
  {
    id: 'diamond', name: 'Diamond', shape: '1-2-1', blurb: 'A defender, two wingers flying down the sides and a striker.',
    slots: [{ pos: 'DEF', x: 0.22, z: 0 }, { pos: 'WING', x: 0.34, z: -0.36 }, { pos: 'WING', x: 0.34, z: 0.36 }, { pos: 'ATT', x: 0.44, z: 0 }],
  },
  {
    id: 'pyramid', name: 'Pyramid', shape: '2-1-1', blurb: 'Two defenders, a midfielder to link it up and one striker.',
    slots: [{ pos: 'DEF', x: 0.22, z: -0.22 }, { pos: 'DEF', x: 0.22, z: 0.22 }, { pos: 'MID', x: 0.33, z: 0 }, { pos: 'ATT', x: 0.44, z: 0 }],
  },
  {
    id: 'arrow', name: 'Arrow', shape: '1-1-2', blurb: 'One defender, a midfielder and two strikers. Goals galore!',
    slots: [{ pos: 'DEF', x: 0.22, z: 0 }, { pos: 'MID', x: 0.32, z: 0 }, { pos: 'ATT', x: 0.43, z: -0.18 }, { pos: 'ATT', x: 0.43, z: 0.18 }],
  },
  {
    id: 'engine', name: 'Engine Room', shape: '1-2-1', blurb: 'Two busy midfielders boss the middle of the pitch.',
    slots: [{ pos: 'DEF', x: 0.22, z: 0 }, { pos: 'MID', x: 0.32, z: -0.2 }, { pos: 'MID', x: 0.32, z: 0.2 }, { pos: 'ATT', x: 0.44, z: 0 }],
  },
  {
    id: 'wings', name: 'Wide Attack', shape: '1-3', blurb: 'A winger on each side and a striker in the middle. All-out attack!',
    slots: [{ pos: 'DEF', x: 0.24, z: 0 }, { pos: 'WING', x: 0.4, z: -0.36 }, { pos: 'ATT', x: 0.44, z: 0 }, { pos: 'WING', x: 0.4, z: 0.36 }],
  },
  {
    id: 'wall', name: 'Wall', shape: '3-1', blurb: 'Three defenders keep it tight and one striker waits for the break.',
    slots: [{ pos: 'DEF', x: 0.22, z: -0.3 }, { pos: 'DEF', x: 0.2, z: 0 }, { pos: 'DEF', x: 0.22, z: 0.3 }, { pos: 'ATT', x: 0.42, z: 0 }],
  },
];

export const formationById = (id?: FormationId): Formation => FORMATIONS.find((f) => f.id === id) ?? FORMATIONS[0];

/** Closeness of one position to another, so a midfielder fills a winger's spot before a defender does. */
const NEAR: Record<Exclude<Position, 'GK'>, Exclude<Position, 'GK'>[]> = {
  DEF: ['DEF', 'MID', 'WING', 'ATT'],
  MID: ['MID', 'WING', 'DEF', 'ATT'],
  WING: ['WING', 'MID', 'ATT', 'DEF'],
  ATT: ['ATT', 'WING', 'MID', 'DEF'],
};

/**
 * Match outfield players to a formation's spots: first everyone already in the right
 * position, then the closest fit. Returns each player's slot (players beyond the slots get none).
 */
export function assignSlots<T extends { info: Pick<Player, 'position'> } | Pick<Player, 'position'>>(players: T[], formation: Formation): Map<T, Slot> {
  const posOf = (p: T): Position => ('info' in p ? p.info.position : p.position);
  const out = new Map<T, Slot>();
  const free = [...players];
  const open = [...formation.slots];
  for (let rank = 0; rank < 4 && free.length && open.length; rank++) {
    for (const slot of [...open]) {
      const want = NEAR[slot.pos][rank];
      const i = free.findIndex((p) => (posOf(p) === 'GK' ? 'ATT' : posOf(p)) === want);
      if (i < 0) continue;
      out.set(free[i], slot);
      free.splice(i, 1);
      open.splice(open.indexOf(slot), 1);
    }
  }
  return out;
}

/** Pick a formation for a team: the outfield starters take the positions it asks for. */
export function applyFormation(team: Team, id: FormationId): void {
  team.formation = id;
  const outfield = team.players.filter((p) => p.starter && p.position !== 'GK');
  const slots = assignSlots(outfield, formationById(id));
  slots.forEach((slot, p) => { p.position = slot.pos; });
}

/** The formation whose spots exactly fit the outfield starters' positions, if there is one. */
export function formationFor(team: Team): FormationId | null {
  const key = (ps: string[]) => [...ps].sort().join(',');
  const want = key(team.players.filter((p) => p.starter && p.position !== 'GK').map((p) => p.position));
  const current = formationById(team.formation);
  if (key(current.slots.map((s) => s.pos)) === want) return current.id;
  return FORMATIONS.find((f) => key(f.slots.map((s) => s.pos)) === want)?.id ?? null;
}
