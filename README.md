# Goal Rush!

Goal Rush! is a top-down 3D five-a-side football browser game for kids aged 7 and up. You build
grassroots youth teams in age groups U5 to U10, give the players names, numbers
and kits, and play short matches against the computer.

Built with Three.js, TypeScript and Vite. Teams are saved on the device with
localStorage. There is no server and no account.

## Run it

```bash
npm install
npm run dev        # dev server with hot reload
npm run build      # type-check and build to dist/
npm run preview    # serve the built game
npm test           # unit tests: saves, league, cup, career, tutorial, match engine, audio, the player model
npm run lint       # ESLint
npm run e2e        # browser tests on the built game (npm run build first; needs Playwright's Chromium)
```

CI runs the type check, lint, unit tests, build and browser tests on every pull request, and the
Pages workflow runs the tests again before it deploys.

## Ways to play

- **Quick Match**: one match against the computer (or a friend on the same keyboard).
- **Tournament**: a four-team cup with two semi-finals and a final. Draws go to penalties. The cup is saved, so you can leave and carry on later; in a two-player cup both players can reach the final.
- **League**: a saved career through five tiers, from the Acorn League (Tier 5) up to the Star Premier League (Tier 1). Five matches a season, top two go up, bottom goes down, and the computer teams get stronger every tier.
- **Career**: take one team from the Under 5s to the Under 10s, four mini seasons a year; players earn stars by playing.
- **🐣 Starter**: the first difficulty, before Easy, for the youngest players. The computer team plays slower and gentler, and your shots are steered between the posts (the keeper can still save them). League and career setups offer it too, and it stays picked until another difficulty is chosen.
- **Penalties**: a best-of-five shoot-out, then sudden death. You take and save.
- **Training**: just you and a keeper; score as many as you can before time runs out (rocket shots count double).
- **Player stats**: seven star ratings per player. Outfielders have Speed, Dribbling, Passing, Shooting, Tackling, Stamina and Strength; keepers have Speed, Handling, Diving, Reflexes, Positioning, Kicking and Strength. The age group caps the stars and sets the budget to share out.
- **Dribbling**: the ball is not stuck to your boots. Each touch knocks it a little ahead (further when sprinting, closer with good Dribbling), so a defender can nip in between touches.
- **Sticker album**: finish matches, win cups and hit milestones to collect stickers; some unlock extra badge icons, and those rare ones shine once collected.
- **Boy or girl**: each player can be a boy or a girl. Girls' faces get eyelashes, and made-up players get a matching name and starting hairstyle; every hairstyle stays open to everyone.
- **Goal celebrations and effects**: confetti in the scoring team's colours and a pop on the scoreboard; big shots leave a streak, and shots, tackles and dives kick up puffs of dust and grass (none of these when motion is set to calm). Floodlights glow at night.
- **Davao Strikers FC**: Goal Rush! is the club's official football game. The 🦊 Davao Strikers chip on the lobby opens the club page, where you play as their Under 7s (club badge, orange and navy kits, the real squad) in any mode. It is an ordinary saved team, so everything stays editable, and Reset puts the club's squad back.
- **Positions and line-ups**: a player can be good in more than one position (tick "Can also play"), and formations put players in spots they can play first. On the squad step, drag a player onto another (or tap one, then the other) to swap them, or drag a sub onto the pitch to bring them on.
- **Team sheet**: from the squad step of the team builder, download a printable PNG team sheet.
- **Weather and time of day**: pick sunny, cloudy, rain, snow, sunset or a night game under floodlights on the setup screen, or let the game surprise you.
- **🔁 Subs**: a team with more than five players can swap anyone on the pitch for anyone on the bench while the ball is out of play (a throw-in, corner, goal kick or free kick, after a goal, at a kick-off or at half time). Tap Subs, then drag a sub onto a player (or tap one, then the other). A sub picked while the ball is in play comes on at the next stoppage. There is no limit, and players can go back on. Players slowly tire as they run (good Stamina tires slower, and the bench refills energy), and a tired player is a little slower. Computer teams get two subs if they have only five, and make up to two changes a half in the second half. Everyone who gets on the pitch counts for player of the match and career growth.
- **⭐ Super skills**: in a match, a star meter fills with play (shots, skill moves and saves fill it faster). When it is full, the Trick button becomes the Super button, and the super depends on the player's position: a striker's 🚀 Rocket Shot, a winger's ⚡ Turbo Dash, a midfielder's or keeper's 🌈 Magic Pass that nobody can cut out, a defender's 💪 Bulldozer run. Without the ball it is a 🛡️ Super Slide tackle, or 🧤 Giant Gloves for your keeper. Play freezes for a short cutscene (letterbox bars, a camera swoop, a pillar of light and a banner; a tap skips it), then the super plays out in slow motion. Computer teams get supers too, but never on Starter, and only Hard uses Rocket Shots and Giant Gloves. The Parents Zone can turn the cutscenes or the supers off, and if anything in them ever fails, they switch themselves off for that match and play carries on.
- **Ball and net**: a goal carries on into the net, which stretches round the ball at the back or the side and lets it drop to the grass; the posts and crossbar are solid, so shots rebound off them or go in off the post.
- **Commentary and replays**: a commentator who knows the score, calls shots wide, over or off the bar, and an instant replay of every goal: the build-up at normal speed, then the shot and the ball bulging the net in slow motion, filmed from beside the goal. Press shoot, pass or lob to skip it (off when motion is set to calm).

While you play a league or career match (or a cup semi-final), the other computer matches are
played in a background worker, so the table is ready the moment the final whistle goes.

## Sound

- **Music and commentary** are recordings made with [ElevenLabs](https://elevenlabs.io): a home
  theme for the menus, a matchday groove from match preparation on, win and draw jingles, and the
  commentator (the "Connor" voice), all in `public/audio/`. The commentary is one MP3 of all the
  lines with a cue sheet (`commentary.json`). How they were made, and the terms they follow, are in
  `tools/audio/README-elevenlabs.md` and `public/audio/LICENSE.md`.
- **Effects** are made in code with the Web Audio API: a crowd that murmurs, holds its breath when
  the ball nears a goal and roars at a goal, the referee's whistle, ball thumps, applause, rain and
  wind. See `src/game/sfx.ts` and `src/game/audio.ts`.

Music, commentary and effects each have an on/off switch and a volume slider (the Parents Zone and
the pause screen), and changes apply straight away, even mid-match. When the game goes into the
background the sound stops and a match pauses.

## Parents and privacy

Everything stays on the device: no accounts, no chat, no adverts, no purchases and no tracking,
and the game loads nothing from other websites (the Fredoka font is part of the game). Teams,
settings and stickers live in the browser's localStorage. A word filter keeps rude words out of
team and player names. The Parents Zone (behind a sum written in words) has:

- music, commentary and effects switches and volumes, motion (follow this device, calm or full)
  and graphics quality;
- **save a backup file / load a backup file**, which also moves a save to another device, and a
  button that asks the browser to keep the save even when space runs low (browsers can clear
  site data; Safari does after about a week without a visit unless the game is on the Home Screen);
- a reset (type RESET to confirm). The save from before the last reset, repair or loaded file is
  kept and can be put back.

If a save cannot be read in full, the game mends or leaves out only the broken part and keeps a copy
of the original. Once it has finished loading the first time, the game works offline and can be
added to a phone or tablet home screen.

## Controls

| Action | Keyboard | Touch |
| --- | --- | --- |
| Move | Arrow keys | Left joystick |
| Shoot | Hold Space or A, release to shoot | Shoot button (hold for power) |
| Pass | D, Z or Enter | Pass button |
| Lob pass / cross | S or V | Lob button |
| Sprint | Shift | Sprint button |
| Switch player | Q | Switch button |
| Pause | Esc or P | Pause button |
| Subs | B (player 2: M) | Subs button |

Two players on one keyboard: player 1 uses WASD, Space (shoot), Z (pass), left
Shift (sprint) and Q (switch); player 2 uses the arrow keys, Enter, `/`, right
Shift and `.`. Game controllers work too. On the Controls screen every key and controller button
can be changed, and the touch buttons can be made bigger, more see-through or swapped round for
left-handed players.

The menus work with the keyboard (Tab, Enter, Esc) and a controller (d-pad and A on the pause and
full-time cards). The phone's Back button goes back a screen, and pauses or resumes a match.

## Accessibility

Focus moves to each new screen's heading and the tab title names the screen; choices say whether
they are selected; colour swatches have names; goals, half time and full time are announced to
screen readers. Text on coloured buttons and cards meets WCAG AA contrast, controls are at least
44 px, pinch zoom works, and the motion setting follows the device's reduce-motion switch unless a
grown-up picks calm or full.

## Age groups

U5 to U10 are the age groups of the teams **in the game**, not of the player at
the keyboard. The age group changes player size, speed, shot power, ball
control, keeper reach, pitch size and match length. See
`src/data/ageGroups.ts`.

## Look and feel

The UI follows a Google Stitch design kit: Fredoka type, a sunshine-yellow
primary, comic-ink navy outlines with hard drop shadows, pill buttons and
20px cards. The tokens and component rules are in `docs/design-system.md`;
the shared markup helpers (console bar, page heading, lobby dock) live in
`src/ui/shell.ts` and the styles in `src/style.css`. Stadium and mascot art
from the kit is in `public/art/`.

## Working on it

- **The player model** is built by `tools/build-player-model.mjs` from the KayKit pack (the
  header has the steps). It remaps the UVs to the colour grid the game paints by default; a test
  checks the shipped `public/models/player.glb` has the face material and remapped UVs.
- **Offline caching** is generated at build time: the service worker's file list and cache
  version come from the built files' contents, so there is no version number to bump by hand.
- **Audio** tools live in `tools/audio/` (see its README).
- Notes for AI coding assistants are in `CLAUDE.md`.

## Credits

The kids on the pitch are built from the
[KayKit Character Pack: Adventurers](https://kaylousberg.itch.io/kaykit-adventurers)
by Kay Lousberg (CC0, public domain). The game repaints the model with each
team's kit; see `public/models/LICENSE.md` and `tools/build-player-model.mjs`.
Music and commentary were made with ElevenLabs (see `public/audio/LICENSE.md`). The Fredoka
typeface is by the Fredoka Project Authors, under the SIL Open Font License 1.1. The Davao
Strikers FC name and crest belong to the club. The code is MIT licensed (see `LICENSE`).
