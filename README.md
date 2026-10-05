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
