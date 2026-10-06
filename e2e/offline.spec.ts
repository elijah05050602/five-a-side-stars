import { expect, test } from '@playwright/test';

/** What the game's service worker has stored so far: how many files, under which version. */
const stored = () => (async () => {
  if (!navigator.serviceWorker.controller) return 0;
  const name = (await caches.keys()).find((k) => k.startsWith('goalrush-'));
  return name ? (await (await caches.open(name)).keys()).length : 0;
})();

test('one visit is enough to play offline, sound included', async ({ page, context }) => {
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(String(e)));
  await page.goto('/?debug');
  // The service worker takes over only once every file of the game is stored.
  await expect.poll(() => page.evaluate(stored), { timeout: 90_000 }).toBeGreaterThan(15);
  await context.setOffline(true);
  await page.reload();
  // First visit: the tutorial runs, with its Skip button, and the lobby comes next.
  await page.getByText('Skip tutorial').click();
  await expect(page.locator('#ui h1').first()).toContainText('GOAL');
  const sound = await page.evaluate(async () => {
    const res = await fetch('audio/commentary.mp3');
    return { ok: res.ok, bytes: (await res.arrayBuffer()).byteLength };
  });
  expect(sound.ok).toBe(true);
  expect(sound.bytes).toBeGreaterThan(1_000_000);
  // Nothing comes from another site: the font is part of the game.
  const fonts = await page.evaluate(() => [...document.styleSheets].map((s) => s.href ?? '').filter((h) => h && !h.startsWith(location.origin)));
  expect(fonts).toEqual([]);
  expect(errors).toEqual([]);
});
