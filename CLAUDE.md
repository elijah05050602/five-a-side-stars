# Working on Goal Rush!

A football game for children that runs in the browser, built with Three.js, TypeScript and Vite.
There is no server: teams, settings and stickers live in the browser's localStorage. README.md
says what the game does.

## Before you push

Run what CI runs:

```bash
npm run typecheck && npm run lint && npm test && npm run build && npm run e2e
```

`npm run e2e` serves the built `dist/`, so build first. It needs Playwright's Chromium
(`npx playwright install chromium`).

## Where things are

- `src/game/sim.ts`: the rules and the computer players, at a fixed 60 steps a second. No Three.js
  and no DOM, so it also runs in a worker and in the tests.
- `src/game/MatchScene.ts`: draws a sim and runs the match loop. `src/game/background.ts` and
  `simWorker.ts` play the computer-vs-computer matches off the main thread.
- `src/game/goalFrame.ts`: the posts, crossbar and net, shared by the sim (the ball bounces off the frame and
  sinks into the netting) and the drawn net in `Pitch.ts` (`GoalNet`), which follows the ball, including in replays.
- `src/game/supers.ts`: the super skills' names, colours and timings. Their rules are in `sim.ts` (`superFor`, `runSuper`), and the cutscene is in `MatchScene.ts` (`startCut`). Super code runs inside `safely()` and the cutscene inside try/catch, so a bug there switches supers off for the match instead of stopping it.
- `src/game/league.ts`, `tournament.ts` and `career.ts`: the saved modes.
- `src/ui/screens.ts` routes between screens. Each screen is `src/ui/screens/<name>.ts`, with
  shared helpers in `screens/shared.ts`. The console bar and dock are in `src/ui/shell.ts`, and
  the in-match overlay is in `src/ui/hud.ts`.
- `src/data/`: the save (`storage.ts`), defaults, the name filter (`wordFilter.ts`), progress
  and stickers.
- `tools/`: the player model builder, the audio tools and the service worker plugin.

## Rules

- **Escape what players type.** Every team or player name goes through `esc()` from
  `src/ui/hud.ts` before it goes into an HTML template.
- **Check names with `isNameOk()`** (`src/data/wordFilter.ts`). Anything made from a name, like
  the scoreboard code from `shortCode()`, must pass it too. Add a test to `wordFilter.test.ts` for
  every word you block or allow.
- **Saves are checked on load.** A new field in a team, league, career, cup or the settings needs
  a default and a check in `src/data/storage.ts` (`readSave`, `migrateTeam` and the `is*`
  checks), plus a test in `storage.test.ts` that loads an old save. A save that fails to read is
  kept as the backup, never thrown away.
- **Results are recorded once, in `finishMatch()`** (`src/ui/screens/results.ts`). Drawing a
  screen never changes the save, so drawing the results screen again is always safe.
- **Asset URLs start with `import.meta.env.BASE_URL`.** The game is served from a sub-folder on
  GitHub Pages, and Vite's `base` is `./`.
- **The service worker is generated** at build time from `src/sw-template.js` by
  `tools/sw-precache.ts`, with a version hashed from the built files. There is no version to
  bump, and there must be no `public/sw.js`.
- **One WebGL renderer for matches and one for the team builder's preview**, kept for the whole
  session (`gameRenderer()` in `src/game/renderer.ts`, and `src/ui/preview3d.ts`). Browsers allow
  about 16 contexts, and running out left a blank screen, so never make another
  `THREE.WebGLRenderer`. A match frees its GPU memory with `disposeObject()`; mark anything made
  once and used by many with `shared()`, and hand out cached textures through a `TextureCache`.
- **In `sim.ts`, use `this.stepDt`, not `1/60`.** Taps reach the sim through `PressLatch`
  (`src/game/input.ts`), so a tap on a frame that runs no sim step is not lost.
- **The player model** (`public/models/player.glb`) is built by `tools/build-player-model.mjs`.
  The steps are in its header. Build it with the default UV remap: `playerModel.test.ts` fails on
  a `raw` build.
- **Tests run in Node with a seeded `Math.random`** (`src/__tests__/setup.ts`), so a simulated
  match plays out the same every time. Call `seedRandom(n)` for a different match. WebGL and audio
  are covered by the Playwright tests in `e2e/`.
- **Write British English** in the game, comments and commit messages: colour, centre,
  favourite. In-game text is for children aged 7 and up; the Parents Zone is for grown-ups.
- **Commit subjects say what changed for the player**, for example "Keep rude words off the
  scoreboard's three-letter codes". The body says why.
