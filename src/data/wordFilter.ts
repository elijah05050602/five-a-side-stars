/**
 * A small, friendly name filter. Kids type team and player names, so we block
 * the obvious rude words (including l33t spellings) and nothing else. It is
 * deliberately short: false positives on innocent names are worse than a
 * missed word, and everything stays on the device anyway.
 */

// Long words are matched anywhere; short words only as whole words so that
// "class", "bass" or "Scunthorpe" are fine.
const ANYWHERE = ['fuck', 'shit', 'bitch', 'cunt', 'wank', 'bollock', 'bastard', 'nigg', 'fagg', 'retard', 'spastic', 'twat', 'arsehole', 'asshole', 'dickhead', 'motherf', 'bellend', 'slut', 'whore', 'pussy', 'penis', 'vagina', 'boob', 'nazi', 'hitler'];
const WHOLE = ['ass', 'arse', 'fag', 'dick', 'cock', 'tit', 'tits', 'piss', 'crap', 'sex', 'sexy', 'damn', 'hell', 'poo', 'wee', 'bum', 'willy', 'cum', 'hoe', 'ho', 'gay', 'kys', 'stfu', 'wtf', 'fk', 'fck', 'fuk', 'fuc', 'sht', 'shyt'];

const LEET: Record<string, string> = { '0': 'o', '1': 'i', '3': 'e', '4': 'a', '5': 's', '7': 't', '8': 'b', '@': 'a', '$': 's', '!': 'i', '+': 't', '€': 'e', '£': 'l' };

// Innocent words that happen to contain a rude one.
const ALLOW = ['scunthorpe', 'penistone', 'cockburn', 'assassin', 'classic', 'cockatoo', 'cocktail', 'peacock', 'shitake', 'shiitake', 'bassett', 'arsenal', 'hancock', 'dickens', 'dickinson', 'sussex', 'essex', 'middlesex', 'wessex'];
const dedup = (x: string) => x.replace(/(.)\1+/g, '$1');

function normalise(s: string): string {
  const mapped = s.toLowerCase().replace(/[0134578@$!+€£]/g, (c) => LEET[c] ?? c).normalize('NFKD').replace(/[̀-ͯ]/g, '');
  // Collapse repeated letters ("fuuuck") and drop anything that is not a letter or a space.
  return mapped.replace(/[^a-z ]+/g, ' ').replace(/(.)\1{2,}/g, '$1$1').replace(/\s+/g, ' ').trim();
}

/** True when a name is fine to show. */
export function isNameOk(name: string): boolean {
  let n = normalise(name);
  if (!n) return true;
  for (const a of ALLOW) n = n.split(a).join(' ');
  const squashed = n.replace(/ /g, '');
  if (ANYWHERE.some((w) => squashed.includes(w) || dedup(squashed).includes(dedup(w)))) return false;
  const words = n.split(' ');
  if (WHOLE.some((w) => words.includes(w))) return false;
  return true;
}
