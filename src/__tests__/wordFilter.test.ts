import { describe, expect, it } from 'vitest';
import { isNameOk } from '../data/wordFilter';
import { FIRST_NAMES, shortCode } from '../data/defaults';
import { KIT_COLOUR_WORDS, TEAM_ADJECTIVES, TEAM_BOLD_WORDS, TEAM_CLUB_PREFIXES, TEAM_CLUB_WORDS, TEAM_MASCOTS, TEAM_THINGS, TEAM_THING_SUFFIXES, TEAM_TOWNS, allTeamNames } from '../data/teamNames';
import { CLUB_NAME, davaoStrikersTeam } from '../data/club';

/** The names in a list that the filter blocks. For innocent names this should be empty. */
const blocked = (names: string[]) => names.filter((n) => !isNameOk(n));
/** The names in a list that the filter lets through. For rude names this should be empty. */
const allowed = (names: string[]) => names.filter((n) => isNameOk(n));

/** The ways kids disguise a word: CAPS, MiXeD case, l33t, a mask, stretched letters and spaced-out letters. */
function disguises(word: string): string[] {
  const leet = word.replace(/[aeiost]/g, (c) => ({ a: '4', e: '3', i: '1', o: '0', s: '5', t: '7' })[c]!);
  const v = word.search(/[aeiou]/);
  const masked = word.slice(0, v) + '*' + word.slice(v + 1);
  const stretched = word.slice(0, v) + word[v].repeat(4) + word.slice(v + 1);
  const mixed = [...word].map((c, i) => (i % 2 ? c.toUpperCase() : c)).join('');
  return [word, word.toUpperCase(), mixed, leet, masked, stretched, [...word].join(' '), [...word].join('.')];
}

// Common first names from around the world, Davao first. Every one must pass.
const WORLD_NAMES = [
  // Filipino, with the nicknames kids actually go by.
  'Jose', 'Maria', 'Dante', 'Bong', 'Jun-Jun', 'Junjun', 'Kiko', 'Nonoy', 'Juan', 'Pedro', 'Ramon', 'Rodrigo', 'Jericho', 'Angelo', 'Paolo', 'Miguel', 'Andres', 'Emilio',
  'Jhon', 'Jay-ar', 'Jaypee', 'Kristine', 'Princess', 'Ligaya', 'Mayumi', 'Tala', 'Dalisay', 'Bituin', 'Inday', 'Dodong', 'Totoy', 'Jojo', 'Nene', 'Neneng', 'Bebang',
  'Pinky', 'Dong', 'Ding', 'Tonton', 'Bongbong', 'Popoy', 'Bunso', 'Dindo', 'Rey', 'Arnel', 'Rowena', 'Maricel', 'Marites', 'Lapu-Lapu', 'Baby Girl', 'Boboy', 'Tita', 'Tito',
  'Joshua', 'Christian', 'Gabriel', 'Althea', 'Kyla', 'Jessa', 'Hazel', 'Jerome', 'Alvin', 'Noel', 'Carlo', 'MJ', 'AJ', 'JC',
  // Indonesian and Malay.
  'Putri', 'Ayu', 'Budi', 'Siti', 'Nur', 'Wayan',
  // Vietnamese, Chinese, Korean, Japanese and Thai.
  'Minh Ho', 'Ho', 'Nguyen', 'Nguyễn', 'Phuc', 'Phúc', 'Hanh Phuc', 'Phuong', 'Thi', 'Duc', 'Đức', 'Bich', 'Bích', 'Dung', 'Hung', 'Cuc', 'Linh', 'Trang', 'Thao', 'Bao', 'Tuan', 'Vu', 'Le',
  'Tran Van Duc', 'Pham Thi Lan', 'Le Hoang', 'Vo Thi Sau', 'Huynh', 'Ngo', 'Duong', 'Bui',
  'Wei', 'Li', 'Jun', 'Ming', 'Xiao', 'Hui', 'Jing', 'Lei', 'Shiting', 'Shi Ting', 'Zihan', 'Haoran', 'Xinyi', 'Fu', 'Shi', 'Kok', 'Ka-Wing',
  'Min-ho', 'Ji-hoon', 'Seo-yeon', 'Jae-bum', 'Bum-soo', 'Dong-hyun', 'Suk', 'Sung', 'Haruto', 'Yuto', 'Sota', 'Hina', 'Sakura', 'Kenta', 'Yoshitaka', 'Fukuda', 'Somchai', 'Ploy', 'Poon',
  // South Asian, Arabic and Turkish.
  'Aarav', 'Vivaan', 'Aditya', 'Arjun', 'Ananya', 'Diya', 'Ishaan', 'Rohan', 'Harshit', 'Shital', 'Pooja', 'Ravi', 'Sanjay', 'Deepak', 'Lakshmi', 'Saanvi', 'Kapoor',
  'Muhammad', 'Ahmed', 'Ali', 'Omar', 'Fatima', 'Aisha', 'Hassan', 'Hussein', 'Yusuf', 'Ibrahim', 'Zainab', 'Maryam', 'Nazir', 'Nazia', 'Nazim', 'Khadija', 'Bilal', 'Asma', 'Assia',
  'Ufuk', 'Cuma', 'Cumali', 'Emre', 'Elif',
  // African and Pacific.
  'Kwame', 'Kofi', 'Ama', 'Chidi', 'Ngozi', 'Amara', 'Thabo', 'Lindiwe', 'Sipho', 'Nwankwo', 'Femi', 'Tunde', 'Abebe', 'Zola', 'Chiamaka', 'Shittu', 'Apenisa', 'Sione', 'Tevita',
  // European and American.
  'Oliver', 'George', 'Harry', 'Jack', 'Charlie', 'Olivia', 'Amelia', 'Emily', 'Sophie', 'Nigel', 'Nigella', 'Bob', 'Bobby', 'Dickie', 'Dicky', 'Willy', 'Willie', 'Randy', 'Fanny',
  'Cassie', 'Massimo', 'Santiago', 'Mateo', 'Sofia', 'Valentina', 'Diego', 'Alejandro', 'Camila', 'Kike', 'Chloé', 'Léa', 'Hugo', 'François', 'Renée', 'Amélie', 'Jürgen', 'Lukas',
  'Søren', 'Bjørn', 'Astrid', 'Tiit', 'Łukasz', 'Zofia', 'João', 'Thiago', 'Fagner', 'Seán', 'Siobhán', 'Niamh', 'Saoirse', 'Zoë', 'Noa', 'Yael', 'Asser',
  'Isabella', 'Mason', 'Ethan', 'Grace', 'William', 'Pablo', 'Lucía', 'Ivan', 'Olga', 'Dmitri', 'Anastasia', 'Nikos', 'Eleni',
  // The club's own squad.
  'Ragnar', 'Elijah', 'Sage', 'Liam', 'Randall',
];

// Footballers and clubs kids name their teams after.
const FOOTBALL = [
  'Messi', 'Ronaldo', 'Mbappé', 'Haaland', 'Neymar', 'Salah', 'Kane', 'Bellingham', 'Saka', 'Son Heung-min', 'Pedri', 'Gavi', 'Lamine Yamal', 'Vinícius', 'Modrić', 'Hakimi',
  'Cha Bum-kun', 'Fernando Torres', 'Azkals', 'Filipinas', 'Davao Aguilas', 'Kaya FC', CLUB_NAME, 'Arsenal', 'Hotspur', 'Hull City', 'Scunthorpe United', 'Middlesbrough',
  'Sheffield Wednesday', 'Crystal Palace', 'Bayern', 'Juventus', 'Ajax', 'Boca Juniors', 'Real Sociedad', 'Lazio', 'FK Bodø/Glimt', 'FK Partizan', 'FC Barcelona', 'A.S. Roma',
  'PSG', 'Fenerbahçe', 'Beşiktaş', 'Kashima Antlers',
];

// Words and places with a rude word inside them: the Scunthorpe problem.
const SCUNTHORPE = [
  'Scunthorpe', 'Penistone', 'Cockburn', 'Assassin', 'Assassins', 'Classic', 'Cockatoo', 'Cocktail', 'Peacock', 'Shiitake', 'Bassett', 'Hancock', 'Dickens', 'Dickinson', 'Dickson',
  'Sussex', 'Essex', 'Middlesex', 'Hitchcock', 'Woodcock', 'Grape', 'Therapist', 'Analyst', 'Cocker Spaniels', 'Cockerel', 'Cocky', 'Prickly Pears', 'Pussycats', 'Assess',
  'Saltwater Sharks', 'Swanky', 'Snigger', 'Retardant', 'Cummings', 'Hoey', 'Hooey', 'Bummer', 'Shell', 'Hello', 'Sexton', 'Winnie the Pooh', 'Titans', 'Petit', 'Scrap', 'Bass',
  'Clitheroe', 'Glass', 'Sassy', 'Passion', 'Rapper', 'Rapping', 'Gaylord', 'Marvin Gaye', 'Lady Gaga', 'Tanga', 'Bobo', 'Leche Flan', 'Paki', 'Yawar', 'Kiyotaka', 'Putra', 'Door Knobs',
  'Bell Tower', 'Killer Whales',
];

describe('innocent names pass', () => {
  it('lets through the names and teams the old filter wrongly blocked', () => {
    expect(blocked(['Bob', 'Bobby', 'Nigel', 'Nigella', 'Nigeria', 'Nazia', 'Nazir', 'Nazim', 'Fagan', 'Minh Ho', 'Wee Rangers', 'Smash It', 'Turbo Boots', 'Robo Bears'])).toEqual([]);
  });

  it('passes every name and team the game makes up itself', () => {
    const teams = allTeamNames();
    const words = [
      ...TEAM_ADJECTIVES, ...Object.values(KIT_COLOUR_WORDS), ...Object.keys(TEAM_MASCOTS), ...TEAM_TOWNS, ...TEAM_CLUB_WORDS,
      ...TEAM_CLUB_PREFIXES, ...Object.keys(TEAM_BOLD_WORDS), ...Object.keys(TEAM_THINGS), ...TEAM_THING_SUFFIXES,
    ];
    const players = FIRST_NAMES.flatMap((f) => [f, ...Object.keys(TEAM_MASCOTS).map((m) => `${f} ${m}`)]);
    expect(teams.length).toBeGreaterThan(1000);
    expect(blocked([...FIRST_NAMES, ...words, ...teams, ...players])).toEqual([]);
  });

  it('passes the club squad', () => {
    expect(blocked([CLUB_NAME, ...davaoStrikersTeam().players.map((p) => p.name)])).toEqual([]);
  });

  it(`passes ${WORLD_NAMES.length} common first names from around the world`, () => {
    expect(blocked(WORLD_NAMES)).toEqual([]);
    expect(blocked(WORLD_NAMES.map((n) => n.toUpperCase()))).toEqual([]);
  });

  it('passes footballers and clubs', () => {
    expect(blocked(FOOTBALL)).toEqual([]);
  });

  it('passes words and places with a rude word hidden inside', () => {
    expect(blocked(SCUNTHORPE)).toEqual([]);
  });

  it('is not thrown by numbers, punctuation and decoration', () => {
    expect(blocked(['Goal Rush!', 'Go Team!', 'Smash It!', 'SmashIt', '#1 Stars', '*Super Stars*', '***', 'Team 7', 'U10 Lions', 'Under 7s', 'Class of 2018', 'J.R. Smith', "O'Brien", ''])).toEqual([]);
  });
});

describe('rude names are blocked', () => {
  it('blocks the words the old filter missed, however they are disguised', () => {
    const words = ['dicks', 'cocks', 'asses', 'hoes', 'pissed', 'fuck', 'shit', 'bitch', 'porn', 'dildo', 'prick', 'knobhead', 'tosser', 'rape', 'kill yourself'];
    expect(allowed(words.flatMap(disguises))).toEqual([]);
    expect(allowed(['f*ck', 'sh*t', 'b*tch', 'fvck'])).toEqual([]);
  });

  it('blocks a rude word with a common ending, but only as a whole word', () => {
    expect(allowed([
      'dick', 'dickhead', 'dickheads', 'cock', 'ass', 'asshole', 'arsehole', 'hoe', 'piss', 'pissing', 'pisshead', 'fucker', 'fucking', 'shits', 'shitty', 'shithead', 'bitches', 'bitchy',
      'porno', 'dildos', 'pricks', 'knobheads', 'tossers', 'raped', 'raping', 'rapist', 'wanker', 'wankers', 'twats', 'cunts', 'sluts', 'boobs', 'boobies', 'tits', 'titties', 'nazis',
    ])).toEqual([]);
    expect(allowed(['Rocket Dicks', 'Super Fuckers', 'Smash Shit', 'Tits4Ever', 'Ass_Kickers', 'Ass-Kickers', 'son of a bitch'])).toEqual([]);
    expect(blocked(['Dickson', 'Smash It', 'Saltwater', 'Bobby'])).toEqual([]);
  });

  it('sees through l33t, masks, stretched letters, accents and spaced-out letters', () => {
    expect(allowed([
      'sh1t', '$h!t', '$#!+', '5hit', 'Sh1t!', 'SHIT!', 'b!tch', 'b**ch', 'a55', '@ss', 'a$$', 'a**hole', 'd1ck', 'c0ck', 'pr1ck', 'p0rn', 'd1ld0', 'kn0bhead', 'r4pe', '80085',
      'f**k', 'f***', 'fuuuuck', 'shiiiit', 'diiiick', 'f u c k', 'F.U.C.K', 'f-u-c-k', 'f_u_c_k', 'fück', 'shït', 'ｆｕｃｋ', '𝐅𝐔𝐂𝐊', '𝕊ℍ𝕀𝕋', 'fu\u200bck', 'phuck', 'fcuk', 'cvnt', 'pvssy',
    ])).toEqual([]);
  });

  it('blocks a few rude phrases, with or without the spaces', () => {
    expect(allowed([
      'kill yourself', 'KILL YOURSELF', 'killyourself', 'kill your self', 'go kill yourself', 'kill urself', 'k1ll y0urself', 'kys', 'KYS', 'k y s',
      'knob head', 'knob end', 'bell end', 'blow job', 'putang ina', 'putangina', 'Putang Ina Mo', 'tang ina', 'tangina', 'tangina mo', 'tanginamo',
    ])).toEqual([]);
  });

  it('blocks the common Tagalog and Bisaya swear words', () => {
    expect(allowed(['gago', 'puta', 'pakyu', 'kantot', 'punyeta', 'tarantado', 'ulol', 'yawa', 'bilat', 'iyot', 'GAGO KA'])).toEqual([]);
  });

  it('keeps the old blocks on slurs and mild words', () => {
    expect(allowed(['nigger', 'nigga', 'faggot', 'fag', 'retard', 'spastic', 'nazi', 'hitler', 'crap', 'damn', 'hell', 'poo', 'sex', 'sexy', 'cum', 'tit', 'stfu', 'wtf', 'fck'])).toEqual([]);
  });
});

describe('judgement calls', () => {
  it('lets Phuc, a common Vietnamese name, through but not phuck or phuk', () => {
    expect(isNameOk('Phuc')).toBe(true);
    expect(isNameOk('Nguyen Xuan Phuc')).toBe(true);
    expect(allowed(['phuck', 'phuk', 'phucking'])).toEqual([]);
  });

  it('blocks Dick on its own, but not Dickson, Dickens, Dickie or Dicky', () => {
    expect(isNameOk('Dick')).toBe(false);
    expect(blocked(['Dickson', 'Dickens', 'Dickinson', 'Dickie', 'Dicky'])).toEqual([]);
  });

  it('passes the mild Tagalog words for "stupid" and the ones that are also names', () => {
    expect(blocked(['Tanga', 'Bobo', 'Gaga', 'Lady Gaga', 'Leche Flan', 'Paki'])).toEqual([]);
  });
});

describe('short codes on the scoreboard', () => {
  it('keeps the usual initials and starts of names', () => {
    expect(['Rocket Rovers', 'Davao Strikers', 'Red Owls Rule OK', 'Thunder', 'Jo', '⚽ Stars', 'Straße', ''].map(shortCode)).toEqual(['RRX', 'DSX', 'ROR', 'THU', 'JOX', 'STA', 'STR', 'TMX']);
  });

  it('skips a leading The or FC', () => {
    expect(['The Thunderbolts', 'FC Pebbleton', 'the comets', 'The', 'FC', 'Sporting Oakvale'].map(shortCode)).toEqual(['THU', 'PEB', 'COM', 'THE', 'FCX', 'SOX']);
  });

  it('never spells a rude word, even when the name is fine', () => {
    const teams = allTeamNames();
    expect(teams.map(shortCode).filter((c) => !isNameOk(c))).toEqual([]);
    const names = ['Super Eagles', 'Sunny Eagles', 'Fire And Glory', 'Gold And Yellow', 'Tigers In Training', 'Titans', 'Assassins', 'Fuchsia', 'Cumbria', 'Poole', 'Sexton'];
    expect(blocked(names)).toEqual([]);
    expect(names.map(shortCode)).toEqual(['SUP', 'SUN', 'FIR', 'GOL', 'TIG', 'TIA', 'ASA', 'FUH', 'CUB', 'POL', 'SET']);
  });

  it('is always three characters', () => {
    expect(['ßß', 'ß', 'Æsir', '😀😀', 'A B C D E'].map((n) => Array.from(shortCode(n)).length)).toEqual([3, 3, 3, 3, 3]);
  });
});
