import { BADGE_ICONS, type AgeGroup, type Badge, type Gender, type Kit, type Player, type Position, type Team } from './types';
import { randomSkills } from './skills';
import { FORMATIONS, applyFormation } from './formations';
import { isNameOk } from './wordFilter';

export const SKIN_TONES = ['#f6d7c3', '#eab98f', '#d49a6a', '#a86b3c', '#7a4a26', '#4a2d17'];
export const HAIR_COLOURS = ['#2b1b0e', '#5a3a1a', '#a0522d', '#d9a441', '#f2e2a0', '#1b1b1b', '#c0392b'];
export const BOOT_COLOURS = ['#222222', '#ffffff', '#e63946', '#3da5f4', '#ffd23f', '#ff6fb5', '#2eb872', '#ff7a00'];
export const KIT_COLOURS = [
  '#e63946', '#f4a261', '#ffd23f', '#2eb872', '#1d8f5a', '#3da5f4', '#1b4fd8', '#6a4c93',
  '#ff6fb5', '#ffffff', '#1b2a41', '#8d99ae', '#111111', '#00c2cb', '#ff7a00', '#7bd389',
];

export const FIRST_NAMES = ['Ava', 'Leo', 'Mia', 'Noah', 'Zoe', 'Kai', 'Isla', 'Max', 'Ruby', 'Finn', 'Nia', 'Theo', 'Elsie', 'Omar', 'Lily', 'Jude', 'Amara', 'Ezra', 'Freya', 'Sami', 'Priya', 'Luca', 'Hana', 'Rafa'];
export const TEAM_WORDS_A = ['Rocket', 'Thunder', 'Sunny', 'Lightning', 'Mighty', 'Flying', 'Super', 'Wild', 'Golden', 'Blue', 'Red', 'Green', 'Comet', 'Jolly'];
export const TEAM_WORDS_B = ['Lions', 'Foxes', 'Tigers', 'Stars', 'Rovers', 'Dragons', 'Owls', 'Sharks', 'Bees', 'Wolves', 'Eagles', 'Pandas', 'Otters', 'Penguins'];

export function uid(): string {
  return Math.random().toString(36).slice(2, 10) + Date.now().toString(36).slice(-4);
}

export function pick<T>(arr: T[]): T {
  return arr[Math.floor(Math.random() * arr.length)];
}

export function randomTeamName(): string {
  return `${pick(TEAM_WORDS_A)} ${pick(TEAM_WORDS_B)}`;
}

/** The made-up names that are girls' names; the rest of FIRST_NAMES are boys'. */
const GIRL_NAMES = new Set(['Ava', 'Mia', 'Zoe', 'Isla', 'Ruby', 'Nia', 'Elsie', 'Lily', 'Amara', 'Freya', 'Priya', 'Hana']);

/** Boy or girl for one of the made-up names; nothing for a name someone typed. */
export function genderOfName(name: string): Gender | undefined {
  return FIRST_NAMES.includes(name) ? (GIRL_NAMES.has(name) ? 'girl' : 'boy') : undefined;
}

export function randomPlayerName(gender?: Gender): string {
  return pick(gender ? FIRST_NAMES.filter((n) => genderOfName(n) === gender) : FIRST_NAMES);
}

/** The hair a made-up player starts with. Every style stays open to everyone in the builder. */
const STARTING_HAIR: Record<Gender | 'any', Player['hairStyle'][]> = {
  any: ['short', 'short', 'spiky', 'spiky', 'long', 'long', 'curly', 'afro', 'buns', 'bald'],
  boy: ['short', 'short', 'spiky', 'spiky', 'curly', 'afro', 'bald', 'long'],
  girl: ['long', 'long', 'buns', 'buns', 'curly', 'afro', 'short', 'spiky'],
};

/** The three letters on the scoreboard: the initials, or the start of a one-word name, but never a rude word. */
export function shortCode(name: string): string {
  // Letters and digits only, counted by character: an emoji in the name would be cut in half on the scoreboard.
  const words = name.trim().split(/\s+/).map((w) => Array.from(w).filter((c) => /[\p{L}\p{N}]/u.test(c))).filter((w) => w.length > 0);
  const first = words[0] ?? ['T', 'M'];
  const tries = [words.length >= 2 ? words.slice(0, 3).map((w) => w[0]) : first.slice(0, 3), first.slice(0, 3)];
  // Initials can spell what the name doesn't ("Fire And Glory", or "Super Eagles" padded out to SEX):
  // then try the start of the first word, then its first letter with any two letters that follow.
  const letters = words.flat().slice(0, 12);
  for (let i = 1; i < letters.length; i++) for (let j = i + 1; j < letters.length; j++) tries.push([letters[0], letters[i], letters[j]]);
  const code = (t: string[]) => Array.from(t.join('').toUpperCase()).slice(0, 3).join('').padEnd(3, 'X');
  return code(tries.find((t) => isNameOk(code(t))) ?? ['T', 'M']);
}

export function makePlayer(position: Position, number: number, name = randomPlayerName(), starter = true, ageGroup: AgeGroup = 'U8', gender = genderOfName(name)): Player {
  return {
    id: uid(), name, number, position, gender, skin: pick(SKIN_TONES), hair: pick(HAIR_COLOURS),
    hairStyle: pick(STARTING_HAIR[gender ?? 'any']),
    build: pick(['regular', 'regular', 'small', 'tall', 'sturdy'] as Player['build'][]), boots: pick(BOOT_COLOURS), bootStyle: pick(['classic', 'classic', 'stripes', 'toecap', 'twotone'] as Player['bootStyle'][]),
    special: 'none', starter, skills: randomSkills(position, ageGroup),
  };
}

export function makeBadge(colour1: string, colour2: string, icon = pick(BADGE_ICONS), shape: Badge['shape'] = 'shield'): Badge {
  return { shape, icon, colour1, colour2 };
}

/** Run `fn` with Math.random replaced by a generator seeded from `seed`, so it makes the same things every time. */
function seeded<T>(seed: string, fn: () => T): T {
  let h = 2166136261;
  for (let i = 0; i < seed.length; i++) h = Math.imul(h ^ seed.charCodeAt(i), 16777619);
  const real = Math.random;
  Math.random = () => {
    h = (h + 0x6d2b79f5) | 0;
    let t = Math.imul(h ^ (h >>> 15), 1 | h);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
  try { return fn(); } finally { Math.random = real; }
}

/**
 * Two subs, a defender and an attacker, for a computer team that has only its starting five. They are made
 * for the match and never saved, and are the same two every time for the same team. Their ratings are the
 * team's outfield average, so bringing them on keeps the team as strong as it was.
 */
export function extraSubs(team: Team): Player[] {
  const outfield = team.players.filter((p) => p.position !== 'GK');
  const taken = new Set(team.players.map((p) => p.number));
  const names = new Set(team.players.map((p) => p.name));
  return seeded(team.id, () => (['DEF', 'ATT'] as Position[]).map((position) => {
    let name = randomPlayerName();
    for (let guard = 0; names.has(name) && guard < 30; guard++) name = randomPlayerName();
    names.add(name);
    let number = 12;
    while (taken.has(number)) number++;
    taken.add(number);
    const p = makePlayer(position, number, name, false, team.ageGroup);
    p.id = `sub-${team.id}-${position}`;
    if (outfield.length) for (const k of Object.keys(p.skills) as (keyof Player['skills'])[]) {
      p.skills[k] = Math.round(outfield.reduce((n, q) => n + (q.skills?.[k] ?? p.skills[k]), 0) / outfield.length);
    }
    return p;
  }));
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
