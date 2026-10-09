import { expect, test, type Page } from '@playwright/test';

/**
 * The game as a child plays it, in a real browser. `?debug` skips the "tap to play" screen and
 * exposes the running match as window.__match so a test can jump to the end of it.
 */
type DebugWindow = Window & { __match?: { sim: { phase: string; half: number; clock: number; config: { halfSeconds: number } } } };

const heading = (page: Page) => page.locator('#ui h1').first();
const inMatch = (page: Page) => page.evaluate(() => document.body.classList.contains('in-match'));

/** Open the game, let the first-visit tutorial start, and skip it to the lobby. */
async function toLobby(page: Page, errors: string[]): Promise<void> {
  page.on('pageerror', (e) => errors.push(String(e)));
  await page.goto('/?debug');
  await page.getByText('Skip tutorial').click();
  await expect(heading(page)).toContainText('GOAL');
}

test('the lobby, the tutorial and the Back button', async ({ page }) => {
  const errors: string[] = [];
  await toLobby(page, errors);
  // "How to play" from the lobby: Space is the shoot key, so it must not jump to Match Setup.
  await page.locator('#m-howto').click();
  await expect.poll(() => inMatch(page)).toBe(true);
  await page.keyboard.down('Space');
  await page.waitForTimeout(300);
  await page.keyboard.up('Space');
  await page.waitForTimeout(500);
  expect(await inMatch(page)).toBe(true);
  // Back pauses the match, and the pause card can be worked from the keyboard.
  await page.goBack();
  await expect(page.locator('#overlay:not([hidden]) h2')).toHaveText('Paused');
  await expect(page.locator('#ov-resume')).toBeFocused();
  await page.locator('#ov-quit').focus();
  await page.keyboard.press('Enter');
  await expect(heading(page)).toContainText('GOAL');
  // The Controls screen's Done button goes back.
  await page.locator('[data-nav="controls"]').first().click();
  await page.getByRole('button', { name: 'Done' }).click();
  await expect(heading(page)).toContainText('GOAL');
  expect(errors).toEqual([]);
});

test('the team builder keeps changes safe and does not use up WebGL', async ({ page }) => {
  const errors: string[] = [];
  // The game asks with its own boxes, never the browser's.
  const dialogs: string[] = [];
  page.on('dialog', async (d) => { dialogs.push(d.message()); await d.dismiss(); });
  await toLobby(page, errors);
  await page.locator('#m-teams').click();
  await page.locator('[data-edit]').first().click();
  await expect(heading(page)).toHaveText('Edit Team');
  await expect(page).toHaveTitle(/^Edit Team/);
  // Esc in the name box stays put; leaving with a changed name asks first.
  await page.locator('#f-name').fill('Changed Name FC');
  await page.keyboard.press('Escape');
  await expect(heading(page)).toHaveText('Edit Team');
  await page.locator('[data-back]').first().click();
  await expect(page.locator('.pop[open] h2')).toHaveText('Leave without saving?');
  await expect(page.getByRole('button', { name: 'Stay' })).toBeFocused();
  await page.getByRole('button', { name: 'Stay' }).click();
  await expect(page.locator('.pop[open]')).toHaveCount(0);
  await expect(heading(page)).toHaveText('Edit Team');
  // Every step change redraws the 3D preview; 24 of them used to cost the game its own WebGL context.
  for (let i = 0; i < 24; i++) await page.locator(`[data-step="${i % 2 ? 0 : 1}"]`).click();
  await page.locator('[data-step="2"]').click();
  await page.locator('#b-save').click();
  await expect(heading(page)).toHaveText('My Squad');
  await page.locator('[data-nav="lobby"]').first().click();
  await page.locator('#m-play').click();
  await page.locator('#s-go').click();
  await expect.poll(() => page.evaluate(() => !!(window as DebugWindow).__match)).toBe(true);
  const lost = await page.evaluate(() => (document.getElementById('game-canvas') as HTMLCanvasElement).getContext('webgl2')?.isContextLost() ?? true);
  expect(lost).toBe(false);
  expect(dialogs).toEqual([]);
  expect(errors).toEqual([]);
});

test('deleting a team or a player asks with the game\'s own box first', async ({ page }) => {
  const errors: string[] = [];
  const dialogs: string[] = [];
  page.on('dialog', async (d) => { dialogs.push(d.message()); await d.dismiss(); });
  await toLobby(page, errors);
  await page.locator('#m-teams').click();
  const teams = page.locator('[data-delete]');
  const count = await teams.count();
  // Keep it, Esc and the phone's Back button all keep the team.
  await teams.first().click();
  const pop = page.locator('.pop[open]');
  await expect(pop.locator('h2')).toHaveText(/^Delete .+\?$/);
  await expect(pop.getByRole('button', { name: 'Keep it' })).toBeFocused();
  await pop.getByRole('button', { name: 'Keep it' }).click();
  await expect(pop).toHaveCount(0);
  await teams.first().click();
  await page.keyboard.press('Escape');
  await expect(pop).toHaveCount(0);
  await expect(heading(page)).toHaveText('My Squad');
  await teams.first().click();
  await page.goBack();
  await expect(pop).toHaveCount(0);
  await expect(heading(page)).toHaveText('My Squad');
  await expect(teams).toHaveCount(count);
  // Yes, delete does.
  await teams.first().click();
  await pop.getByRole('button', { name: 'Yes, delete' }).click();
  await expect(teams).toHaveCount(count - 1);

  // Remove player asks too.
  await page.locator('[data-edit]').first().click();
  await page.locator('[data-step="2"]').click();
  await page.locator('#p-add').click();
  const players = page.locator('.player-card:not(.player-card-add)');
  const squad = await players.count();
  await page.locator('#p-remove').click();
  await expect(pop.locator('h2')).toHaveText(/^Remove .+\?$/);
  await pop.getByRole('button', { name: 'Keep them' }).click();
  await expect(players).toHaveCount(squad);
  await page.locator('#p-remove').click();
  await pop.getByRole('button', { name: 'Remove', exact: true }).click();
  await expect(players).toHaveCount(squad - 1);

  // A name that is not allowed goes back to the first step and says so.
  await page.locator('[data-step="0"]').click();
  await page.locator('#f-name').fill('Dick FC');
  await page.locator('#b-next').click();
  await expect(pop.locator('h2')).toHaveText('Pick another team name');
  await pop.getByRole('button', { name: "OK, I'll fix it" }).click();
  await expect(pop).toHaveCount(0);
  await expect(page.locator('#f-name')).toBeVisible();
  expect(dialogs).toEqual([]);
  expect(errors).toEqual([]);
});

test('full time works from the keyboard and the results follow', async ({ page }) => {
  const errors: string[] = [];
  await toLobby(page, errors);
  await page.locator('#m-play').click();
  await page.locator('#s-go').click();
  await expect.poll(() => page.evaluate(() => !!(window as DebugWindow).__match)).toBe(true);
  await page.evaluate(() => { const s = (window as DebugWindow).__match!.sim; s.phase = 'play'; s.half = 2; s.clock = s.config.halfSeconds * 2 - 0.2; });
  await expect(page.locator('#overlay:not([hidden]) h2')).toHaveText('Full time!');
  await expect(page.locator('#ov-finish')).toBeFocused();
  await page.keyboard.press('Enter');
  await expect(heading(page)).toHaveText('Full Time');
  expect(errors).toEqual([]);
});

test('a super skill plays its cutscene, then the match carries on', async ({ page }) => {
  const errors: string[] = [];
  await toLobby(page, errors);
  await page.locator('#m-play').click();
  await page.locator('#s-go').click();
  await expect.poll(() => page.evaluate(() => !!(window as DebugWindow).__match)).toBe(true);
  type SuperWindow = Window & { __match: { cut: unknown; sim: { phase: string; clock: number; superMeter: number[]; ball: { owner: unknown; pos: unknown }; players: { side: number; isKeeper: boolean; pos: { x: number; z: number }; info: object }[]; goalX: (s: number) => number } } };
  // Put your striker on the ball with a full star meter, then press Trick (C).
  await page.evaluate(() => {
    const s = (window as unknown as SuperWindow).__match.sim;
    s.phase = 'play';
    const p = s.players.find((q) => q.side === 0 && !q.isKeeper)!;
    p.info = { ...p.info, position: 'ATT' };
    p.pos = { x: s.goalX(0) - 9, z: 1 };
    s.ball.pos = { ...p.pos };
    s.ball.owner = p;
    s.superMeter[0] = 1;
  });
  await page.keyboard.press('KeyC');
  await expect(page.locator('#super-cut')).toBeVisible();
  await expect.poll(() => page.evaluate(() => !!(window as unknown as SuperWindow).__match.cut)).toBe(true);
  const frozen = await page.evaluate(() => (window as unknown as SuperWindow).__match.sim.clock);
  // A tap skips the rest of it; play then carries on.
  await page.waitForTimeout(800);
  await page.keyboard.press('KeyX');
  await expect.poll(() => page.evaluate(() => !!(window as unknown as SuperWindow).__match.cut), { timeout: 30000 }).toBe(false);
  await expect(page.locator('#super-cut')).toBeHidden();
  await expect.poll(() => page.evaluate(() => (window as unknown as SuperWindow).__match.sim.clock), { timeout: 30000 }).toBeGreaterThan(frozen + 0.2);
  expect(errors).toEqual([]);
});

test('a goal carries into the net, then its replay plays and hands back to the match', async ({ page }) => {
  const errors: string[] = [];
  await toLobby(page, errors);
  await page.locator('#m-play').click();
  await page.locator('#s-go').click();
  await expect.poll(() => page.evaluate(() => !!(window as DebugWindow).__match)).toBe(true);
  type GoalWindow = Window & { __match: { replay: object | null; sim: {
    phase: string; length: number; goalDepth: number; goalX: (s: number) => number;
    ball: { owner: unknown; pos: { x: number; z: number }; vel: { x: number; z: number }; y: number; vy: number; inGoal: number; lastKick: unknown; lastTouch: unknown };
    players: { side: number; isKeeper: boolean; pos: { x: number; z: number }; kickCooldown: number }[];
  } } };
  // A few seconds of the match to replay, then a firm shot at the empty net.
  await page.waitForTimeout(3000);
  await page.evaluate(() => {
    const s = (window as unknown as GoalWindow).__match.sim, b = s.ball, x = s.goalX(0);
    s.phase = 'play';
    const shooter = s.players.find((p) => p.side === 0 && !p.isKeeper)!;
    for (const p of s.players) { p.pos = { x: -x * 0.3, z: 3 }; p.kickCooldown = 99; }
    b.owner = null; b.lastKick = b.lastTouch = shooter;
    b.pos = { x: x - 6, z: 0 }; b.y = 0.3; b.vy = 2.5; b.vel = { x: 16, z: 0.5 };
  });
  await expect.poll(() => page.evaluate(() => (window as unknown as GoalWindow).__match.sim.phase)).toBe('goal');
  // The ball ends up in the goal, well behind the line, not stuck on it.
  await expect.poll(() => page.evaluate(() => {
    const s = (window as unknown as GoalWindow).__match.sim;
    return s.ball.inGoal === 1 && s.ball.pos.x - s.length / 2 > 0.5;
  })).toBe(true);
  await expect.poll(() => page.evaluate(() => !!(window as unknown as GoalWindow).__match.replay), { timeout: 60000 }).toBe(true);
  // The replay plays on a clean screen in cinema bars.
  await expect(page.locator('#replay-frame')).toBeVisible({ timeout: 60000 });
  await expect(page.locator('#hud-pause')).toBeHidden();
  await expect(page.locator('.scoreboard')).toBeHidden();
  await expect.poll(() => page.evaluate(() => (window as unknown as GoalWindow).__match.replay), { timeout: 60000 }).toBe(null);
  await expect(page.locator('#hud-pause')).toBeVisible();
  await expect(page.locator('#replay-frame')).toBeHidden();
  expect(errors).toEqual([]);
});

test("a super's glow follows its player in the goal replay, not where they stand now", async ({ page }) => {
  const errors: string[] = [];
  await toLobby(page, errors);
  await page.locator('#m-play').click();
  await page.locator('#s-go').click();
  await expect.poll(() => page.evaluate(() => !!(window as DebugWindow).__match)).toBe(true);
  type V = { x: number; z: number };
  type AuraWindow = Window & { __match: {
    replay: { t: number } | null; history: unknown[]; aura: { group: { visible: boolean; position: V } }; models: Map<object, { group: { position: V } }>;
    sim: { phase: string; goalX: (s: number) => number; width: number; ball: { owner: unknown; pos: V; vel: V; y: number; vy: number; lastKick: unknown; lastTouch: unknown };
      players: { side: number; isKeeper: boolean; pos: V; kickCooldown: number; superKind: string | null; superTime: number }[] };
  } };
  // A Turbo Dash lasting the whole clip, then a shot into the empty net.
  await page.evaluate(() => {
    const m = (window as unknown as AuraWindow).__match, s = m.sim;
    s.phase = 'play';
    const p = s.players.find((q) => q.side === 0 && !q.isKeeper)!;
    p.superKind = 'turbo';
    p.superTime = 999;
    m.history.length = 0; // so the whole clip is filmed during the dash
  });
  await page.waitForTimeout(3000);
  await page.evaluate(() => {
    const s = (window as unknown as AuraWindow).__match.sim, b = s.ball, x = s.goalX(0);
    const p = s.players.find((q) => q.side === 0 && !q.isKeeper)!;
    s.phase = 'play';
    for (const q of s.players) { q.pos = { x: -x * 0.3, z: 3 }; q.kickCooldown = 99; }
    b.owner = null; b.lastKick = b.lastTouch = p;
    b.pos = { x: x - 6, z: 0 }; b.y = 0.3; b.vy = 2.5; b.vel = { x: 16, z: 0.5 };
  });
  await expect.poll(() => page.evaluate(() => (window as unknown as AuraWindow).__match.sim.phase)).toBe('goal');
  // Off by the far corner flag while the replay plays: the glow must stay with the player in the clip.
  await page.evaluate(() => {
    const s = (window as unknown as AuraWindow).__match.sim;
    s.players.find((q) => q.side === 0 && !q.isKeeper)!.pos = { x: -s.goalX(0), z: s.width / 2 };
  });
  await expect.poll(() => page.evaluate(() => ((window as unknown as AuraWindow).__match.replay?.t ?? 0) > 0), { timeout: 60000 }).toBe(true);
  const gap = await page.evaluate(() => {
    const m = (window as unknown as AuraWindow).__match;
    const p = m.sim.players.find((q) => q.side === 0 && !q.isKeeper)!;
    const a = m.aura.group, model = m.models.get(p)!.group.position;
    return a.visible ? Math.hypot(a.position.x - model.x, a.position.z - model.z) : -1;
  });
  expect(gap).toBeGreaterThanOrEqual(0);
  expect(gap).toBeLessThan(0.5);
  expect(errors).toEqual([]);
});

test('a tap on the goal replay skips it and kicks nothing', async ({ page }) => {
  const errors: string[] = [];
  await toLobby(page, errors);
  await page.locator('#m-play').click();
  await page.locator('#s-go').click();
  await expect.poll(() => page.evaluate(() => !!(window as DebugWindow).__match)).toBe(true);
  type GoalWindow = Window & { __match: { replay: object | null; sim: {
    phase: string; goalX: (s: number) => number; score: number[];
    ball: { owner: unknown; pos: { x: number; z: number }; vel: { x: number; z: number }; y: number; vy: number; lastKick: unknown; lastTouch: unknown };
    players: { side: number; isKeeper: boolean; pos: { x: number; z: number }; kickCooldown: number }[];
  } } };
  await page.waitForTimeout(3000);
  await page.evaluate(() => {
    const s = (window as unknown as GoalWindow).__match.sim, b = s.ball, x = s.goalX(0);
    s.phase = 'play';
    const shooter = s.players.find((p) => p.side === 0 && !p.isKeeper)!;
    for (const p of s.players) { p.pos = { x: -x * 0.3, z: 3 }; p.kickCooldown = 99; }
    b.owner = null; b.lastKick = b.lastTouch = shooter;
    b.pos = { x: x - 6, z: 0 }; b.y = 0.3; b.vy = 2.5; b.vel = { x: 16, z: 0.5 };
  });
  await expect(page.locator('#replay-frame')).toBeVisible({ timeout: 60000 });
  await expect(page.locator('.replay-label')).toBeVisible();
  await page.mouse.click(550, 310);
  await expect.poll(() => page.evaluate(() => (window as unknown as GoalWindow).__match.replay)).toBe(null);
  await expect(page.locator('#hud-pause')).toBeVisible();
  // Still the one goal, and the match carries on to its kick-off.
  expect(await page.evaluate(() => (window as unknown as GoalWindow).__match.sim.score.join('-'))).toBe('1-0');
  expect(errors).toEqual([]);
});

test('a cup run survives leaving the cup screen', async ({ page }) => {
  const errors: string[] = [];
  await toLobby(page, errors);
  await page.locator('#m-cup').click();
  await page.locator('#s-go').click();
  await expect(heading(page)).toContainText('Cup');
  await page.locator('[data-back]').first().click();
  await expect(page.locator('#m-cup')).toContainText('Carry on your cup');
  await page.locator('#m-cup').click();
  await expect(heading(page)).toContainText('Cup');
  expect(errors).toEqual([]);
});

test('a sub picked on the subs card comes on at the next stoppage', async ({ page }) => {
  const errors: string[] = [];
  await toLobby(page, errors);
  await page.locator('#m-play').click();
  await page.locator('#s-go').click();
  await expect.poll(() => page.evaluate(() => !!(window as DebugWindow).__match)).toBe(true);
  type SubsWindow = Window & { __match: { sim: { phase: string; bench: { name: string }[][]; teamOf: (s: number) => { info: { name: string } }[]; pendingSubs: Map<number, unknown>[] } } };
  const onPitch = () => page.evaluate(() => (window as unknown as SubsWindow).__match.sim.teamOf(0).map((p) => p.info.name));
  const sub = await page.evaluate(() => (window as unknown as SubsWindow).__match.sim.bench[0][0].name);
  // B opens the card and pauses the match; tap the sub, then the player to bring off.
  await page.keyboard.press('KeyB');
  await expect(page.locator('#overlay:not([hidden]) h2')).toContainText('Subs');
  expect(await page.evaluate(() => (window as unknown as SubsWindow).__match.sim.phase)).toBe('paused');
  const off = (await onPitch())[1];
  await page.locator('.subs-bench .subs-player').first().click();
  await page.locator('.subs-pitch .subs-player').nth(1).click();
  await expect(page.locator('.subs-pitch .subs-player').nth(1)).toContainText(sub);
  await expect(page.locator('.subs-bench .subs-player').first()).toContainText(off);
  // Dragging works too, straight away and either way round: put them back, then drag the sub on again.
  await page.locator('.subs-bench .subs-player').first().dragTo(page.locator('.subs-pitch .subs-player').nth(1));
  await expect(page.locator('.subs-pitch .subs-player').nth(1)).toContainText(off);
  await page.locator('.subs-bench .subs-player').first().dragTo(page.locator('.subs-pitch .subs-player').nth(1));
  await expect(page.locator('.subs-pitch .subs-player').nth(1)).toContainText(sub);
  await page.locator('#subs-done').click();
  // The ball was dead for the kick-off, so the sub is on straight away.
  await expect.poll(onPitch).toContain(sub);
  expect(await onPitch()).not.toContain(off);
  await expect(page.locator('#hud-banner')).toContainText(`On comes ${sub} for ${off}`);
  await expect.poll(() => page.evaluate(() => (window as unknown as SubsWindow).__match.sim.phase)).not.toBe('paused');
  expect(errors).toEqual([]);
});

test('the career and the Hall of Fame fit a phone screen', async ({ page }) => {
  const errors: string[] = [];
  await page.setViewportSize({ width: 375, height: 740 });
  // A save with one retired career in the Hall of Fame.
  await page.addInitScript(() => {
    if (localStorage.getItem('five-a-side-stars:v1')) return;
    const entry = {
      no: 1, ended: 1, finished: true, team: { name: 'Puddle Jumpers With A Long Name', badge: { shape: 'shield', icon: '🦊', colour1: '#ff7a00', colour2: '#ffffff' } },
      star: { name: 'Mia', number: 9, position: 'ATT', skin: '#e0ac69', hair: '#3b2a1a', hairStyle: 'short', skills: { speed: 5, control: 4, passing: 3, shooting: 5, tackling: 2, stamina: 4, strength: 3 } },
      age: 'U10', seasons: 24, titles: 6, tierTitles: [1, 1, 2, 1, 1], bestTier: 1, playoffsWon: 2,
      totals: { played: 120, goals: 88, assists: 30, saves: 0, cleanSheets: 20, motm: 25 }, milestones: ['first-goal', 'hat-trick'],
      rival: { name: 'Thunder Cats', w: 5, d: 2, l: 3 }, best: { when: 'U10 Summer', tier: 1, position: 1 },
      scrapbook: [{ at: 1, emoji: '🌱', text: 'Puddle Jumpers kick off in the Acorn League.' }, { at: 2, emoji: '⚽', text: 'Mia: First Goal, against Thunder Cats!' }],
    };
    localStorage.setItem('five-a-side-stars:v1', JSON.stringify({ teams: [], settings: {}, hall: [entry] }));
  });
  page.on('pageerror', (e) => errors.push(String(e)));
  await page.goto('/?debug');
  // A save that is not new skips the first-visit tutorial.
  const skip = page.getByText('Skip tutorial');
  await expect(heading(page).or(skip)).toBeVisible();
  if (await skip.isVisible()) await skip.click();
  await expect(heading(page)).toContainText('GOAL');
  const fits = () => page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth);
  await page.locator('#m-hall').click();
  await expect(heading(page)).toContainText('Hall of Fame');
  await expect(page.locator('.hof-card')).toHaveCount(1);
  await expect(page.locator('.hof-card')).toContainText('Mia');
  expect(await fits()).toBe(true);
  await page.locator('[data-book="0"]').click();
  await expect(page.locator('.scrapbook')).toContainText('First Goal');
  await page.getByRole('button', { name: 'Close' }).click();
  await page.locator('[data-back]').first().click();
  await page.locator('#m-career').click();
  await page.locator('[data-player]').first().click();
  await page.locator('#c-go').click();
  await expect(heading(page)).toContainText('Career');
  await expect(page.locator('#k-hall')).toBeVisible();
  await expect(page.locator('.scrap-card')).toContainText('Scrapbook');
  expect(await fits()).toBe(true);
  expect(errors).toEqual([]);
});
