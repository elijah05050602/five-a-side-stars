/**
 * Made-up team names for computer teams and the team builder's dice.
 *
 * Seven styles so a league doesn't read like a list of "Colour Animal": "Mighty Otters", "Red Foxes",
 * "Puddleby Pandas", "Hillside United", "FC Pebbleton", "The Thunderbolts" and "Comet City".
 * The towns are made up, so no real club is copied. Every word here, every name they make and every
 * scoreboard code is checked by the name filter in `wordFilter.test.ts`.
 */

/** Long names squash the league table on a phone. */
export const TEAM_NAME_MAX = 18;

/** Team animals and the badge icon that goes with each. */
export const TEAM_MASCOTS: Record<string, string> = {
  Lions: '🦁', Foxes: '🦊', Tigers: '🐯', Dragons: '🐉', Owls: '🦉', Sharks: '🦈', Bees: '🐝', Wolves: '🐺',
  Eagles: '🦅', Pandas: '🐼', Otters: '🦦', Penguins: '🐧', Pumas: '🐆', Badgers: '🦡', Dolphins: '🐬', Bears: '🐻',
  Rhinos: '🦏', Zebras: '🦓', Koalas: '🐨', Frogs: '🐸', Hedgehogs: '🦔', Turtles: '🐢', Robins: '🐦', Unicorns: '🦄',
  Dinos: '🦖', Monkeys: '🐒', Parrots: '🦜', Squirrels: '🐿️', Beavers: '🦫', Octopuses: '🐙', Hawks: '🦅', Bulls: '🐂',
};

/** Words that go in front of an animal. Colours are kept apart so they only show up on a matching kit. */
export const TEAM_ADJECTIVES = [
  'Rocket', 'Thunder', 'Sunny', 'Lightning', 'Mighty', 'Flying', 'Super', 'Wild', 'Golden', 'Comet', 'Jolly', 'Speedy',
  'Brave', 'Bouncy', 'Happy', 'Zippy', 'Turbo', 'Cosmic', 'Snowy', 'Stormy', 'Rainbow', 'Lucky', 'Daring', 'Dazzling',
];

/** The colour word for each kit colour, used only when the team's shirt is that colour. */
export const KIT_COLOUR_WORDS: Record<string, string> = {
  '#e63946': 'Red', '#f4a261': 'Amber', '#ffd23f': 'Yellow', '#2eb872': 'Green', '#1d8f5a': 'Green', '#3da5f4': 'Blue',
  '#1b4fd8': 'Blue', '#6a4c93': 'Purple', '#ff6fb5': 'Pink', '#1b2a41': 'Navy', '#8d99ae': 'Silver', '#00c2cb': 'Teal',
  '#ff7a00': 'Orange', '#7bd389': 'Lime', '#ffffff': 'White', '#111111': 'Black',
};

/** Made-up towns. */
export const TEAM_TOWNS = [
  'Puddleby', 'Mapleton', 'Brookfield', 'Pebbleton', 'Oakvale', 'Hillside', 'Riverside', 'Meadowbank', 'Fernhill', 'Willowby',
  'Cloverdale', 'Kitebrook', 'Pinewood', 'Honeyford', 'Rosebank', 'Kettleby', 'Sandcove', 'Daisyfield', 'Bramblewood', 'Puffin Bay',
];

/** What comes after a town: "Hillside United". */
export const TEAM_CLUB_WORDS = ['United', 'Athletic', 'Rovers', 'Rangers', 'Wanderers', 'Town', 'City', 'Albion', 'Juniors', 'Stars'];

/** What comes before a town: "FC Pebbleton". */
export const TEAM_CLUB_PREFIXES = ['FC', 'Sporting', 'Dynamo'];

/** One bold word: "The Thunderbolts", with its badge icon. */
export const TEAM_BOLD_WORDS: Record<string, string> = {
  Thunderbolts: '⚡', Hurricanes: '🌀', Comets: '☄️', Rockets: '🚀', Meteors: '🌠', Tornadoes: '🌪️', Volcanoes: '🌋',
  Rainbows: '🌈', Jets: '✈️', Blizzards: '❄️', Firebirds: '🔥', Galaxies: '🌌', Wildcats: '🐱', Sunbeams: '☀️',
};

/** A big thing and a club word: "Comet City", with its badge icon. */
export const TEAM_THINGS: Record<string, string> = {
  Comet: '☄️', Rocket: '🚀', Thunder: '⚡', Galaxy: '🌌', Volcano: '🌋', Rainbow: '🌈', Meteor: '🌠', Storm: '🌩️', Planet: '🪐', Sunshine: '☀️',
};

/** What comes after a big thing: "Galaxy United". */
export const TEAM_THING_SUFFIXES = ['City', 'United', 'Town', 'Athletic'];

export interface TeamName {
  name: string;
  /** A badge icon that fits the name, when there is one. */
  icon?: string;
}

const pick = <T>(arr: readonly T[]): T => arr[Math.floor(Math.random() * arr.length)];
const mascots = Object.keys(TEAM_MASCOTS);

/** An animal, starting with the same letter as `word` half the time ("Puddleby Pandas"). */
function mascotFor(word: string): string {
  const same = mascots.filter((m) => m[0] === word[0]);
  return same.length && Math.random() < 0.5 ? pick(same) : pick(mascots);
}

type Style = (shirt?: string) => TeamName | null;

/** The seven styles. Each one makes a name and, where it can, a badge icon to match. */
const [adjective, colour, townMascot, townClub, prefixTown, bold, thing]: Style[] = [
  () => { const a = pick(TEAM_ADJECTIVES); const m = mascotFor(a); return { name: `${a} ${m}`, icon: TEAM_MASCOTS[m] }; },
  (shirt) => {
    const colour = shirt ? KIT_COLOUR_WORDS[shirt.toLowerCase()] : undefined;
    if (!colour) return null;
    const m = mascotFor(colour);
    return { name: `${colour} ${m}`, icon: TEAM_MASCOTS[m] };
  },
  () => { const t = pick(TEAM_TOWNS); const m = mascotFor(t); return { name: `${t} ${m}`, icon: TEAM_MASCOTS[m] }; },
  () => ({ name: `${pick(TEAM_TOWNS)} ${pick(TEAM_CLUB_WORDS)}` }),
  () => ({ name: `${pick(TEAM_CLUB_PREFIXES)} ${pick(TEAM_TOWNS)}` }),
  () => { const w = pick(Object.keys(TEAM_BOLD_WORDS)); return { name: `The ${w}`, icon: TEAM_BOLD_WORDS[w] }; },
  () => { const t = pick(Object.keys(TEAM_THINGS)); return { name: `${t} ${pick(TEAM_THING_SUFFIXES)}`, icon: TEAM_THINGS[t] }; },
];

/** The styles with the most names come up most, so the small ones ("The Comets") don't keep repeating. */
const STYLES: Style[] = [adjective, adjective, adjective, colour, townMascot, townMascot, townMascot, townClub, townClub, prefixTown, bold, thing];

/**
 * A made-up team name in one of seven styles, never longer than TEAM_NAME_MAX.
 * Pass the shirt colour and the name may say it ("Red Foxes"); a colour word never goes on another colour's kit.
 */
export function makeTeamName(shirt?: string): TeamName {
  for (let i = 0; i < 50; i++) {
    const n = pick(STYLES)(shirt);
    if (n && n.name.length <= TEAM_NAME_MAX) return n;
  }
  return { name: 'Mighty Otters', icon: TEAM_MASCOTS.Otters };
}

/** Every name the styles can make (any length, any colour), for the tests. */
export function allTeamNames(): string[] {
  const colours = [...new Set(Object.values(KIT_COLOUR_WORDS))];
  return [
    ...[...TEAM_ADJECTIVES, ...colours, ...TEAM_TOWNS].flatMap((w) => mascots.map((m) => `${w} ${m}`)),
    ...TEAM_TOWNS.flatMap((t) => TEAM_CLUB_WORDS.map((c) => `${t} ${c}`)),
    ...TEAM_CLUB_PREFIXES.flatMap((p) => TEAM_TOWNS.map((t) => `${p} ${t}`)),
    ...Object.keys(TEAM_BOLD_WORDS).map((w) => `The ${w}`),
    ...Object.keys(TEAM_THINGS).flatMap((t) => TEAM_THING_SUFFIXES.map((s) => `${t} ${s}`)),
  ];
}
