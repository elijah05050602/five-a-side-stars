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
- **Career**: take one team from the Under 5s to the Under 10s, four mini seasons a year; players earn stars by playing. The career has its own world of 30 clubs that stay all career, spread over the five tiers and growing up a year with you. Champions go up, the bottom club goes down, and 2nd and 5th play a one-match play-off (a draw goes to penalties). You get a rival club, and a Stats tab shows top scorers, best keepers and every team's form; tap any club to see its page.
- **📰 The Goal Rush Gazette**: before every league and career match a newspaper preview says what is at stake, with both teams' form, places, who to watch and your record against them (and a 🔥 for rival day). After the match a front page gives the headline (hat-trick, super goal, comeback, big win, clean sheet, shoot-out), Player of the Match, and the rest of the round. Between seasons the career shows the league news: promotions, play-offs, rests, Trial Day signings and who left.
- **🎯 Season goals**: every career mini season sets three goals (easy, medium and hard) picked to suit your Star, like "Mia scores 3 goals", "Keep 2 clean sheets", "Beat your rival" or "Win a match by 3". Each one done is a training point, and all three is a 🧹 Clean Sweep sticker.
- **🏆 The yearly cup**: between the 2nd and 3rd mini seasons of every career year, eight clubs from the world (you, and seven from your tier and the tiers either side) play a knockout cup: quarter-finals, semi-finals and a final, one match a round, with penalties after a draw. The league waits for your cup run, the other ties are worked out at once, and a cup final fills the stands like a final. Winning it earns the 🏵️ Cup Winners sticker (with a count), and three cups make you 🫅 Cup Kings.
- **🎤 Awards night**: at the end of every career year the squad's best are named: 🌟 Player of the Year, 👟 Golden Boot, 🧤 Best Keeper, 💫 Goal of the Year (a super-skill goal) and 🌱 Best Young Player (that year's Trial Day signing). Player of the Year for your Star is a milestone, and any award for the Star earns the 🎤 Award Night sticker.
- **🏅 End-of-season awards**: at the end of every League mode season and every career mini season, the whole league's best are named: 👟 Golden Boot, 🎯 Best Midfielder, 🛡️ Best Defender and 🧤 Best Goalkeeper (clean sheets count most for the last two). Each one your players win earns a sticker, and winning all four earns 🏅 Award Sweep. A career Star earns a milestone for each award, and Award Collector for three.
- **🎲 Twist starts**: a career can start the usual way or with a twist: 🐭 Underdogs (team-mates a star weaker), 🧤 Keeper's Journey (your Star in goal), 🦊 Town Team (Davao Strikers), ⏰ Start Late (from the Under 7s, four years) or 🏰 Big Club (from the Thunder League). Finishing each one earns its own sticker.
- **👪 Legacy careers**: after a finished career, the next generation can start at the same club. The old Star becomes the coach (an extra training point every mini season), the new Star is their little brother, little sister or cousin, and the trophy cabinet remembers what the club won before. The third and fourth generations earn the Family Club and Family Tree stickers.
- **🌠 Signature super**: once the career Star reaches Legend in the Making (eight milestones), you pick how their supers look: 🔥 Blazing, 🌩️ Thunder or 🌌 Galaxy. The super works the same, but its name, icon and glow are the Star's own.
- **🏆 Trophy cabinet**: the career screen keeps shelves of every league title (with its tier badge), cup, play-off win and award, filling up across the career.
- **✈️ Transfers**: each time the career moves up an age group, one to three clubs from your tier or higher may ask for your Star (more after a good year; your rival and clubs you keep beating are keener, and Davao Strikers may ask at the step up to the Under 7s). Join one and the Star moves on alone, the career carries on with the new club in its tier, and your old club stays in the world (joining your rival makes your old club the new rival). Or stay and be made ©️ captain. Joining earns the ✈️ New Adventure sticker, and finishing a career at the same club all the way earns 🛡️ Loyal Club.
- **🏛️ Hall of Fame and scrapbook**: every career keeps a scrapbook of its big moments (a first goal, a title, a play-off, a new rival, a Trial Day signing), shown as a timeline on the career screen. When a career is finished, retired, or replaced by a new one, it goes into the Hall of Fame with its Star card, trophies, totals, best season, rival record and scrapbook. The Hall keeps the last 20 careers, and three of them earn the 🏛️ Hall of Famer sticker.
- **🌟 Star milestones**: your career Star has 24 milestones to reach, from a first goal to 100 goals (or saves for a keeper), 25 assists, 10 skill moves, a super-skill goal, top scorer in a mini season and a match in the Star Premier League. Each one is a training point; 16 earns the 🌌 Living Legend sticker and all 24 the 🪐 Greatest of All Time. Making the Gazette headline 10 times earns 📰 Front Page.
- **League stats**: League mode's table has a Stats tab too, and tapping a team shows its squad and results.
- **🐣 Starter**: the first difficulty, before Easy, for the youngest players. The computer team plays slower and gentler, and your shots are steered between the posts (the keeper can still save them). League and career setups offer it too, and it stays picked until another difficulty is chosen.
- **Penalties**: a best-of-five shoot-out, then sudden death. You take and save.
- **Training**: just you and a keeper; score as many as you can before time runs out (rocket shots count double).
- **Player stats**: seven star ratings per player. Outfielders have Speed, Dribbling, Passing, Shooting, Tackling, Stamina and Strength; keepers have Speed, Handling, Diving, Reflexes, Positioning, Kicking and Strength. The age group caps the stars and sets the budget to share out.
- **Dribbling**: the ball is not stuck to your boots. Each touch knocks it a little ahead (further when sprinting, closer with good Dribbling), so a defender can nip in between touches.
- **Skill moves**: the Trick button picks a move from the stick and the defenders. Pull back for a drag-back or a Cruyff turn, push sideways for an elastico or, with a defender in the way, a roulette spin. With a defender right in front it is a nutmeg, or (from the Under 8s up) sometimes a rainbow flick over their head; otherwise a step-over or a body swerve. Computer players try them too.
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
- **Commentary and replays**: a commentator who knows the score, calls shots wide, over or off the bar, and an instant replay of every goal: the build-up at normal speed, then the shot and the ball hitting the net in slow motion. Press shoot, pass or lob to skip it (off when motion is set to calm).

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
