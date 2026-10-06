import { makeKit, makePlayer, makeTeam } from './defaults';
import { DAVAO_STRIKERS_CREST } from './clubBadge';
import { getTeam, saveTeam } from './storage';
import type { Player, Position, Team } from './types';

/** Davao Strikers FC: Goal Rush! is the club's official game, and its U7 squad comes ready to play. */
export const CLUB_TEAM_ID = 'club-davao-strikers-u7';
export const CLUB_NAME = 'Davao Strikers FC';
/** The full logo, for the loading screen and the club page. */
export const CLUB_LOGO_URL = './art/davao-strikers.jpg';

/** Club colours, picked from the logo. */
export const CLUB_COLOURS = { orange: '#f26a1b', navy: '#13233a', cream: '#efe3c4', gold: '#f2a03d' };

interface ClubPlayer { name: string; number: number; positions: Position[]; starter: boolean; look: Pick<Player, 'skin' | 'hair' | 'hairStyle' | 'build' | 'boots' | 'bootStyle'> }

/** The U7 squad: name, number and the positions each kid plays, main position first. */
const SQUAD: ClubPlayer[] = [
  { name: 'Ragnar', number: 19, positions: ['GK'], starter: true, look: { skin: '#d49a6a', hair: '#1b1b1b', hairStyle: 'short', build: 'tall', boots: '#ff7a00', bootStyle: 'toecap' } },
  { name: 'Elijah', number: 8, positions: ['DEF', 'WING'], starter: true, look: { skin: '#eab98f', hair: '#2b1b0e', hairStyle: 'spiky', build: 'regular', boots: '#3da5f4', bootStyle: 'stripes' } },
  { name: 'Baby Girl', number: 22, positions: ['WING', 'DEF'], starter: true, look: { skin: '#d49a6a', hair: '#1b1b1b', hairStyle: 'buns', build: 'small', boots: '#ff6fb5', bootStyle: 'twotone' } },
  { name: 'Sage', number: 12, positions: ['WING', 'ATT'], starter: true, look: { skin: '#eab98f', hair: '#5a3a1a', hairStyle: 'long', build: 'regular', boots: '#ffffff', bootStyle: 'classic' } },
  { name: 'Liam', number: 21, positions: ['ATT', 'DEF'], starter: true, look: { skin: '#a86b3c', hair: '#1b1b1b', hairStyle: 'short', build: 'sturdy', boots: '#222222', bootStyle: 'stripes' } },
  { name: 'Randall', number: 10, positions: ['ATT', 'WING'], starter: false, look: { skin: '#d49a6a', hair: '#2b1b0e', hairStyle: 'curly', build: 'regular', boots: '#ffd23f', bootStyle: 'classic' } },
];

/** A fresh copy of the club's U7 team, exactly as the club sent it. Everything stays editable. */
export function davaoStrikersTeam(): Team {
  const { orange, navy, cream } = CLUB_COLOURS;
  const team = makeTeam({
    id: CLUB_TEAM_ID,
    name: CLUB_NAME,
    short: 'DSF',
    ageGroup: 'U7',
    badge: { shape: 'circle', icon: '🦊', colour1: orange, colour2: navy, image: DAVAO_STRIKERS_CREST },
    kit: makeKit(orange, navy, navy, orange, 'plain'),
    awayKit: makeKit(navy, orange, cream, navy, 'sash'),
    keeperKit: makeKit(cream, navy, navy, cream, 'plain'),
    players: SQUAD.map((c) => ({
      ...makePlayer(c.positions[0], c.number, c.name, c.starter, 'U7'),
      ...c.look,
      positions: [...c.positions],
    })),
  });
  // Elijah at the back, Baby Girl and Sage on the wings, Liam up top.
  team.formation = 'diamond';
  return team;
}

/** The saved club team, made the first time someone opens the club page. */
export function ensureClubTeam(): Team {
  const saved = getTeam(CLUB_TEAM_ID);
  if (saved) return saved;
  const team = davaoStrikersTeam();
  saveTeam(team);
  return team;
}

/** Put the club's squad, kits and badge back the way the club sent them. */
export function resetClubTeam(): Team {
  const team = davaoStrikersTeam();
  saveTeam(team);
  return team;
}
