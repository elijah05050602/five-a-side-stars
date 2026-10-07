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
  expect(dialogs.some((d) => d.startsWith('Leave without saving'))).toBe(true);
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
  expect(errors).toEqual([]);
});

test('full time works from the keyboard and the results follow', async ({ page }) => {
  const errors: string[] = [];
  await toLobby(page, errors);
  await page.locator('#m-play').click();
  await page.locator('#s-go').click();
  await expect.poll(() => page.evaluate(() => !!(window as DebugWindow).__match)).toBe(true);
  await page.evaluate(() => { const s = (window as DebugWindow).__match!.sim; s.half = 2; s.clock = s.config.halfSeconds * 2 - 0.2; });
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

test('a goal carries into the net, and its replay films the net from the goal line', async ({ page }) => {
  const errors: string[] = [];
  await toLobby(page, errors);
  await page.locator('#m-play').click();
  await page.locator('#s-go').click();
  await expect.poll(() => page.evaluate(() => !!(window as DebugWindow).__match)).toBe(true);
  type GoalWindow = Window & { __match: { replay: { goalCam: boolean } | null; sim: {
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
  await expect.poll(() => page.evaluate(() => !!(window as unknown as GoalWindow).__match.replay?.goalCam), { timeout: 60000 }).toBe(true);
  await expect.poll(() => page.evaluate(() => (window as unknown as GoalWindow).__match.replay), { timeout: 60000 }).toBe(null);
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
