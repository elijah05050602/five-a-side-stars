# Five-a-Side Stars

A top-down 3D 5-a-side football browser game for kids aged 7 and up. You build
grassroots youth teams in age groups U5 to U10, give the players names, numbers
and kits, and play short matches against the computer.

Built with Three.js, TypeScript and Vite. Teams are saved on the device with
localStorage. There is no server and no account.

## Run it

```bash
npm install
npm run dev      # dev server with hot reload
npm run build    # type-check and build to dist/
npm run preview  # serve the built game
```

## Ways to play

- **Quick Match**: one match against the computer (or a friend on the same keyboard).
- **Tournament**: a four-team cup with two semi-finals and a final. Draws go to penalties.
- **League**: a saved career through five tiers, from the Acorn League (Tier 5) up to the Star Premier League (Tier 1). Five matches a season, top two go up, bottom goes down, and the computer teams get stronger every tier.
- **Penalties**: a best-of-five shoot-out, then sudden death. You take and save.
- **Training**: just you and a keeper; score as many as you can before time runs out (rocket shots count double).
- **Sticker album**: finish matches, win cups and hit milestones to collect stickers; some unlock extra badge icons.
- **Team sheet**: from the squad step of the team builder, download a printable PNG team sheet.

## Parents and privacy

Everything stays on the device: no accounts, no chat, no adverts, no purchases
and no tracking. Teams, settings and stickers live in the browser's
localStorage. A small word filter keeps rude words out of team and player
names. The Parents screen (behind a quick multiplication sum) has toggles for
sound, music and reduce motion, and a reset button. Once loaded, the game
works offline and can be added to a phone or tablet home screen.

## Controls

| Action | Keyboard | Touch |
| --- | --- | --- |
| Move | Arrow keys or WASD | Left joystick |
| Shoot | Hold Space or X, release to shoot | Shoot button (hold for power) |
| Pass | Z or Enter | Pass button |
| Sprint | Shift | Sprint button |
| Switch player | Q | Switch button |
| Pause | Esc or P | Pause button |

Two players on one keyboard: player 1 uses WASD, Space (shoot), Z (pass), left
Shift (sprint) and Q (switch); player 2 uses the arrow keys, Enter, `/`, right
Shift and `.`.

## Age groups

U5 to U10 are the age groups of the teams **in the game**, not of the player at
the keyboard. The age group changes player size, speed, shot power, ball
control, keeper reach, pitch size and match length. See
`src/data/ageGroups.ts`.

## Credits

The kids on the pitch are built from the
[KayKit Character Pack: Adventurers](https://kaylousberg.itch.io/kaykit-adventurers)
by Kay Lousberg (CC0, public domain). The game repaints the model with each
team's kit; see `public/models/LICENSE.md` and `tools/build-player-model.mjs`.
