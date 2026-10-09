import { describe, expect, it } from 'vitest';
import { cabinetHtml } from '../ui/screens/cabinet';
import { createCareer } from '../game/career';
import { team } from './helpers';

describe('the trophy cabinet', () => {
  it('fills its shelves from the career: titles, cups, play-offs and awards', () => {
    const { career: c } = createCareer(team('src', 'Shelf Fillers', 'U8'), 60);
    expect(cabinetHtml(c)).toContain('0 trophies');
    expect(cabinetHtml(c)).not.toContain('<details class="card cabinet-card" open');
    c.history.push({ season: 1, tier: 5, position: 1, outcome: 'promoted', year: 1, miniSeason: 1, age: 'U5', topScorer: null });
    c.history.push({ season: 2, tier: 4, position: 2, outcome: 'promoted', year: 1, miniSeason: 2, age: 'U5', topScorer: null, playoff: 'won' });
    c.cupRuns.push({ age: 'U5', reached: 3 }, { age: 'U6', reached: 1 });
    c.awards.push({ age: 'U5', awards: [{ id: 'golden-boot', emoji: '👟', title: 'Golden Boot', playerId: c.starId, name: '<Mia>', line: '9 goals' }] });
    const html = cabinetHtml(c);
    expect(html).toContain('4 trophies');
    expect(html).toContain('🌰');
    expect(html).toContain('Acorn League, U5 Autumn');
    expect(html).toContain('U5 Cup');
    expect(html).toContain('🎟️');
    expect(html).toContain('Golden Boot: &lt;Mia&gt; (U5)');
    expect(html).toContain('is-star');
  });
});
