# Player model credit

`player.glb` is built from the **KayKit Character Pack: Adventurers** by
Kay Lousberg (https://kaylousberg.itch.io/kaykit-adventurers), released under
**CC0 1.0 Universal** (public domain, no attribution required).
Source: https://github.com/KayKit-Game-Assets/KayKit-Character-Pack-Adventures-1.0

Changes made for Five-a-Side Stars (see `tools/build-player-model.mjs`):

- Rogue body with the Rogue, Mage and Knight heads on the shared rig
- weapons, capes, hats and the pack texture removed
- UVs remapped to a simple colour grid so the game can paint kit colours
- only the animations the game uses are kept; geometry is quantised

Thank you Kay for making these free for everyone.
