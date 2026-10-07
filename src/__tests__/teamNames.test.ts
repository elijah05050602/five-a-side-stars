import { describe, expect, it } from 'vitest';
import { generateOpponent, makeKit } from '../data/defaults';
import { KIT_COLOUR_WORDS, TEAM_NAME_MAX, makeTeamName } from '../data/teamNames';
import { seedRandom } from './setup';

const colourWords = new Set(Object.values(KIT_COLOUR_WORDS));
const colourIn = (name: string) => name.split(' ').find((w) => colourWords.has(w));

describe('made-up team names', () => {
  it('are never too long for the league table', () => {
    seedRandom(7);
    for (let i = 0; i < 2000; i++) expect(makeTeamName(i % 2 ? '#e63946' : undefined).name.length).toBeLessThanOrEqual(TEAM_NAME_MAX);
  });

  it('come in lots of different styles, not just "Colour Animal"', () => {
    seedRandom(3);
    const names = Array.from({ length: 300 }, () => makeTeamName('#3da5f4').name);
    expect(new Set(names).size).toBeGreaterThan(200);
    expect(names.some((n) => n.startsWith('The '))).toBe(true);
    expect(names.some((n) => n.startsWith('FC ') || n.startsWith('Sporting ') || n.startsWith('Dynamo '))).toBe(true);
    expect(names.some((n) => / (United|Athletic|Rovers|Rangers|Wanderers|Town|City|Albion|Juniors|Stars)$/.test(n))).toBe(true);
    expect(names.filter((n) => colourIn(n)).length).toBeLessThan(names.length / 4);
  });

  it('only say a colour that the shirt really is', () => {
    seedRandom(11);
    for (const [hex, word] of Object.entries(KIT_COLOUR_WORDS)) {
      for (let i = 0; i < 60; i++) {
        const c = colourIn(makeTeamName(hex).name);
        if (c) expect(c).toBe(word);
      }
    }
    for (let i = 0; i < 300; i++) expect(colourIn(makeTeamName().name)).toBeUndefined();
  });

  it('give computer teams a badge that matches their name and kit colour', () => {
    seedRandom(5);
    for (let i = 0; i < 200; i++) {
      const t = generateOpponent('U8', makeKit('#e63946', '#ffffff', '#1b2a41', '#e63946'));
      const c = colourIn(t.name);
      if (c) expect(c).toBe(KIT_COLOUR_WORDS[t.kit.shirt]);
      if (t.name.endsWith(' Sharks')) expect(t.badge.icon).toBe('🦈');
      if (t.name === 'The Thunderbolts') expect(t.badge.icon).toBe('⚡');
    }
  });
});
