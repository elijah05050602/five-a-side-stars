/**
 * A small, friendly name filter. Kids type team and player names, so we block
 * the obvious rude words and nothing else, including l33t spellings (sh1t),
 * masks (f*ck), stretched letters (fuuuck) and spaced-out letters (f u c k).
 * It is deliberately short: false positives on innocent names are worse than
 * a missed word, and everything stays on the device anyway.
 *
 * A name is checked word by word, and a listed word only blocks a word that is
 * exactly it, or it plus a common ending (dicks, pissed, dickhead). So nothing
 * is found across a gap ("Smash It", "Minh Ho") or inside a longer name
 * ("Dickson", "Scunthorpe", "Nigel"), apart from the few words in ANYWHERE.
 */

// Rude words, blocked on their own or with one of the ENDINGS.
const STEMS = [
  'fuck', 'fuk', 'fck', 'fcuk', 'phuck', 'phuk', 'shit', 'shite', 'sht', 'shyt', 'bullshit', 'dipshit', 'horseshit', 'gobshite',
  'cunt', 'twat', 'wank', 'piss', 'prick', 'dick', 'cock', 'cocksucker', 'tosser', 'bollock', 'bastard', 'bitch', 'slut', 'skank',
  'whore', 'whoring', 'douche', 'douchebag', 'crap', 'ass', 'arse', 'arsed', 'dumbass', 'jackass', 'fatass',
  'boob', 'titty', 'titties', 'pussy', 'pussies', 'penis', 'vagina', 'dildo', 'porn', 'porno', 'jizz', 'rape', 'raped', 'raping', 'rapist',
  'nigger', 'nigga', 'niggaz', 'faggot', 'retard', 'spastic', 'tranny', 'chink', 'gook', 'wetback', 'raghead', 'towelhead', 'nazi', 'hitler',
];
// Short or mild words, blocked only on their own or with an s, so names built around them stay fine.
// The second line is Tagalog and Bisaya, for the club in Davao.
const WHOLE = [
  'fag', 'tit', 'hoe', 'cum', 'clit', 'spaz', 'poo', 'poop', 'damn', 'hell', 'sex', 'sexy', 'gay', 'kys', 'stfu', 'wtf', 'fuc',
  'puta', 'gago', 'pakyu', 'kantot', 'punyeta', 'tarantado', 'ulol', 'yawa', 'bilat', 'iyot',
];
// Never part of an innocent word, so blocked inside one too ("superbitches").
const ANYWHERE = ['fuck', 'bitch', 'whore', 'faggot', 'dildo'];
// Rude only together. The spaces are optional ("killyourself", "tangina mo").
const PHRASES = [
  'kill yourself', 'kill yourselves', 'kill urself', 'knob head', 'knob end', 'bell end', 'blow job', 'hand job',
  'putang ina', 'putang ina mo', 'tang ina', 'tang ina mo',
];
const ENDINGS = ['s', 'es', 'y', 'ie', 'ies', 'ed', 'er', 'ers', 'ing', 'head', 'heads', 'face', 'faces', 'hole', 'holes'];
// Real names and innocent words that read as a listed word once stretched letters and endings are allowed for.
const ALLOW = new Set(['dickie', 'dicky', 'dickes', 'cocky', 'cocker', 'cockers', 'asser', 'assy', 'aass', 'tiit', 'tiits', 'poos', 'shiting', 'rapped', 'rapping']);

// What can stand in for a letter, l33t style. A look-alike only counts where it makes a listed word, so "fvck" is caught and "Vic" is untouched.
const LEET: Record<string, string> = { a: '4@', b: '8', e: '3€', g: '9', i: '1!|', l: '1|£', o: '0', s: '5$', t: '7+', u: 'v' };
// Masks stand in for any one letter: f*ck, sh#t, b_tch.
const MASKS = '*#_';
// Letters that do not split into a base letter and an accent.
const LETTERS: Record<string, string> = { ø: 'o', đ: 'd', ð: 'd', ł: 'l', ß: 'ss', æ: 'ae', œ: 'oe', þ: 'th', ı: 'i', ħ: 'h' };

/**
 * Listed words as a pattern. Each letter takes one character of the name: the letter, a look-alike
 * or a mask. Extra copies of a real letter may follow ("fuuuck"), but the list itself is never
 * collapsed: "boob" needs two o's, so Bob is fine. Endings are not stretched, so "assess" is fine.
 */
const oneOf = (words: string[], { masks = MASKS, stretch = true } = {}) =>
  words.map((w) => w.replace(/(.)\1*/g, (run, c: string) => {
    const looks = c + (LEET[c] ?? '');
    return `[${looks}${masks}]{${run.length}}${stretch ? `[${looks}]*` : ''}`;
  })).join('|');
const PLURAL = oneOf(['s'], { stretch: false });

const WORD = new RegExp(`^(?:(?:${oneOf(STEMS)})(?:${oneOf(ENDINGS, { stretch: false })})?|(?:${oneOf(WHOLE)})(?:${PLURAL})?)$`);
const INSIDE = new RegExp(oneOf(ANYWHERE, { masks: '' }));
const PHRASE = new RegExp(`^(?:${oneOf(PHRASES.map((p) => p.replace(/ /g, '')))})(?:${PLURAL})?$`);
const UNMASKED = new RegExp(`[^${MASKS}]`);

// Three ways to read a name: as typed (sh1t, f*ck), with digits as gaps (Tits4Ever), and plain letters only (Shit!).
const LOOKS = Object.values(LEET).join('');
const READINGS = [LOOKS + MASKS, LOOKS.replace(/\d/g, '') + MASKS, ''].map((extra) => new RegExp(`[^a-z${extra}]+`));

function normalise(name: string): string {
  // Plain lower-case letters: fancy fonts (𝐅𝐔𝐂𝐊) and accents ("Zoë", "Phúc") come off, invisible characters go.
  return name.normalize('NFKD').toLowerCase().replace(/[øđðłßæœþıħ]/g, (c) => LETTERS[c]).replace(/[\p{M}\p{Cf}]/gu, '');
}

/** The words of a name, with runs of single letters joined up ("f u c k", "f.u.c.k"). */
function words(name: string, gaps: RegExp): string[] {
  const out: string[] = [];
  let letters = '';
  for (const part of name.split(gaps)) {
    const w = part.replace(/^[!|]+|[!|]+$/g, ''); // "Goal!" ends in punctuation, not an i
    if (w.length === 1) letters += w;
    else if (w) {
      if (letters) out.push(letters);
      letters = '';
      out.push(w);
    }
  }
  if (letters) out.push(letters);
  return out;
}

const rude = (w: string) => UNMASKED.test(w) && !ALLOW.has(w) && (WORD.test(w) || INSIDE.test(w));

/** A phrase starting at word i, with or without the spaces: "kill yourself", "killyourself", "kill your self". */
function phraseAt(ws: string[], i: number): boolean {
  let joined = '';
  for (let j = i; j < Math.min(ws.length, i + 4); j++) if (PHRASE.test((joined += ws[j]))) return true;
  return false;
}

/** True when a name is fine to show. */
export function isNameOk(name: string): boolean {
  const n = normalise(name);
  return READINGS.every((gaps) => {
    const ws = words(n, gaps);
    return ws.every((w, i) => !rude(w) && !phraseAt(ws, i));
  });
}
