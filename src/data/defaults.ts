import { BADGE_ICONS, type AgeGroup, type Badge, type Kit, type Player, type Position, type Team } from './types';
import { randomSkills } from './skills';
import { FORMATIONS, applyFormation } from './formations';

export const SKIN_TONES = ['#f6d7c3', '#eab98f', '#d49a6a', '#a86b3c', '#7a4a26', '#4a2d17'];
export const HAIR_COLOURS = ['#2b1b0e', '#5a3a1a', '#a0522d', '#d9a441', '#f2e2a0', '#1b1b1b', '#c0392b'];
export const BOOT_COLOURS = ['#222222', '#ffffff', '#e63946', '#3da5f4', '#ffd23f', '#ff6fb5', '#2eb872', '#ff7a00'];
export const KIT_COLOURS = [
  '#e63946', '#f4a261', '#ffd23f', '#2eb872', '#1d8f5a', '#3da5f4', '#1b4fd8', '#6a4c93',
  '#ff6fb5', '#ffffff', '#1b2a41', '#8d99ae', '#111111', '#00c2cb', '#ff7a00', '#7bd389',
];

const FIRST_NAMES = ['Ava', 'Leo', 'Mia', 'Noah', 'Zoe', 'Kai', 'Isla', 'Max', 'Ruby', 'Finn', 'Nia', 'Theo', 'Elsie', 'Omar', 'Lily', 'Jude', 'Amara', 'Ezra', 'Freya', 'Sami', 'Priya', 'Luca', 'Hana', 'Rafa'];
const TEAM_WORDS_A = ['Rocket', 'Thunder', 'Sunny', 'Lightning', 'Mighty', 'Flying', 'Super', 'Wild', 'Golden', 'Blue', 'Red', 'Green', 'Comet', 'Jolly'];
const TEAM_WORDS_B = ['Lions', 'Foxes', 'Tigers', 'Stars', 'Rovers', 'Dragons', 'Owls', 'Sharks', 'Bees', 'Wolves', 'Eagles', 'Pandas', 'Otters', 'Penguins'];

export function uid(): string {
  return Math.random().toString(36).slice(2, 10) + Date.now().toString(36).slice(-4);
}

export function pick<T>(arr: T[]): T {
  return arr[Math.floor(Math.random() * arr.length)];
}

export function randomTeamName(): string {
  return `${pick(TEAM_WORDS_A)} ${pick(TEAM_WORDS_B)}`;
}

export function randomPlayerName(): string {
  return pick(FIRST_NAMES);
}

export function shortCode(name: string): string {
  // Letters and digits only, counted by character: an emoji in the name would be cut in half on the scoreboard.
  const words = name.trim().split(/\s+/).map((w) => Array.from(w).filter((c) => /[\p{L}\p{N}]/u.test(c))).filter((w) => w.length > 0);
  const code = words.length >= 2 ? words.slice(0, 3).map((w) => w[0]).join('') : (words[0] ?? ['T', 'M']).slice(0, 3).join('');
  return code.toUpperCase().padEnd(3, 'X');
}

export function makePlayer(position: Position, number: number, name = randomPlayerName(), starter = true, ageGroup: AgeGroup = 'U8'): Player {
  return {
    id: uid(), name, number, position, skin: pick(SKIN_TONES), hair: pick(HAIR_COLOURS),
    hairStyle: pick(['short', 'short', 'spiky', 'spiky', 'long', 'long', 'curly', 'afro', 'buns', 'bald'] as Player['hairStyle'][]),
    build: pick(['regular', 'regular', 'small', 'tall', 'sturdy'] as Player['build'][]), boots: pick(BOOT_COLOURS), bootStyle: pick(['classic', 'classic', 'stripes', 'toecap', 'twotone'] as Player['bootStyle'][]),
    special: 'none', starter, skills: randomSkills(position, ageGroup),
  };
}

export function makeBadge(colour1: string, colour2: string, icon = pick(BADGE_ICONS), shape: Badge['shape'] = 'shield'): Badge {
  return { shape, icon, colour1, colour2 };
}

/** The five who start: flagged starters first, always with exactly one keeper. */
export function startingFive(team: Team): Player[] {
  const starters = team.players.filter((p) => p.starter);
  const pool = [...starters, ...team.players.filter((p) => !p.starter)];
  const gk = pool.find((p) => p.position === 'GK') ?? pool[0];
  const rest = pool.filter((p) => p !== gk && p.position !== 'GK');
  const extraGk = pool.filter((p) => p !== gk && p.position === 'GK');
  const five = [gk, ...rest, ...extraGk].slice(0, 5);
  return five;
}

export function defaultSquad(ageGroup: AgeGroup = 'U8'): Player[] {
  const used = new Set<string>();
  const nextName = () => {
    let n = randomPlayerName();
    let guard = 0;
    while (used.has(n) && guard++ < 20) n = randomPlayerName();
    used.add(n);
    return n;
  };
  return [
    makePlayer('GK', 1, nextName(), true, ageGroup),
    makePlayer('DEF', 4, nextName(), true, ageGroup),
    makePlayer('DEF', 5, nextName(), true, ageGroup),
    makePlayer('ATT', 7, nextName(), true, ageGroup),
    makePlayer('ATT', 9, nextName(), true, ageGroup),
  ];
}

export function makeKit(shirt: string, shirt2: string, shorts: string, socks: string, pattern: Kit['pattern'] = 'plain'): Kit {
  return { pattern, shirt, shirt2, shorts, socks };
}

export function makeTeam(partial: Partial<Team> & { name: string; ageGroup: AgeGroup }): Team {
  const name = partial.name;
  return {
    id: partial.id ?? uid(),
    name,
    short: partial.short ?? shortCode(name),
    ageGroup: partial.ageGroup,
    badge: partial.badge ?? makeBadge(partial.kit?.shirt ?? '#e63946', partial.kit?.shirt2 ?? '#ffffff'),
    kit: partial.kit ?? makeKit('#e63946', '#ffffff', '#1b2a41', '#e63946', 'plain'),
    awayKit: partial.awayKit ?? awayKitFor(partial.kit ?? makeKit('#e63946', '#ffffff', '#1b2a41', '#e63946', 'plain')),
    keeperKit: partial.keeperKit ?? makeKit('#ffd23f', '#111111', '#111111', '#ffd23f', 'plain'),
    players: partial.players ?? defaultSquad(partial.ageGroup),
    createdAt: partial.createdAt ?? Date.now(),
  };
}

/** A sensible away kit: the home second colour as the shirt, or white. */
export function awayKitFor(home: Kit): Kit {
  const shirt = home.shirt2 !== home.shirt ? home.shirt2 : '#ffffff';
  return makeKit(shirt === '#ffffff' && home.shirt === '#ffffff' ? '#1b2a41' : shirt, home.shirt, home.shorts === '#ffffff' ? '#1b2a41' : '#ffffff', shirt, 'plain');
}

/** Teams every player gets to start with. */
export function starterTeams(): Team[] {
  return [
    makeTeam({
      id: 'starter-rockets',
      name: 'Rocket Rovers',
      ageGroup: 'U8',
      kit: makeKit('#e63946', '#ffffff', '#1b2a41', '#e63946', 'stripes'),
      keeperKit: makeKit('#2eb872', '#111111', '#111111', '#2eb872', 'plain'),
      badge: makeBadge('#e63946', '#ffffff', '🚀'),
      players: [
        makePlayer('GK', 1, 'Sami'), makePlayer('DEF', 4, 'Ava'), makePlayer('DEF', 5, 'Kai'), makePlayer('ATT', 7, 'Mia'), makePlayer('ATT', 9, 'Leo'),
        makePlayer('ATT', 11, 'Nia', false),
      ],
    }),
    makeTeam({
      id: 'starter-sharks',
      name: 'Sunny Sharks',
      ageGroup: 'U8',
      kit: makeKit('#3da5f4', '#ffd23f', '#ffffff', '#3da5f4', 'hoops'),
      keeperKit: makeKit('#ff7a00', '#111111', '#111111', '#ff7a00', 'plain'),
      badge: makeBadge('#3da5f4', '#ffd23f', '🦈'),
      players: [
        makePlayer('GK', 1, 'Zoe'), makePlayer('DEF', 2, 'Finn'), makePlayer('DEF', 6, 'Omar'), makePlayer('ATT', 8, 'Theo'), makePlayer('ATT', 10, 'Isla'),
      ],
    }),
  ];
}

/** A fresh computer-controlled opponent in the same age group with a kit that contrasts with ours. */
export function generateOpponent(ageGroup: AgeGroup, avoidKit: Kit): Team {
  const palette = KIT_COLOURS.filter((c) => c !== avoidKit.shirt && c !== avoidKit.shirt2 && c !== '#ffffff' && c !== '#111111');
  const shirt = pick(palette);
  const shirt2 = pick(['#ffffff', '#111111', '#ffd23f'].filter((c) => c !== shirt));
  const team = makeTeam({
    name: randomTeamName(),
    ageGroup,
    kit: makeKit(shirt, shirt2, pick(['#ffffff', '#111111', '#1b2a41']), shirt, pick(['plain', 'stripes', 'hoops', 'halves', 'sash', 'chevron'])),
    badge: makeBadge(shirt, shirt2),
    keeperKit: makeKit(pick(['#2eb872', '#ffd23f', '#6a4c93', '#00c2cb']), '#111111', '#111111', '#111111', 'plain'),
  });
  // Computer teams line up in all sorts of ways.
  applyFormation(team, pick(FORMATIONS).id);
  for (const p of team.players) p.skills = randomSkills(p.position, ageGroup);
  return team;
}
