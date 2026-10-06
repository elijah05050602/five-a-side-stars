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
