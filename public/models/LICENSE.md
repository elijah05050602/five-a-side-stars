# Player model credit

`player.glb` is built from the **KayKit Character Pack: Adventurers** by
Kay Lousberg (https://kaylousberg.itch.io/kaykit-adventurers), released under
**CC0 1.0 Universal** (public domain, no attribution required).
Source: https://github.com/KayKit-Game-Assets/KayKit-Character-Pack-Adventures-1.0

Changes made for Goal Rush! (formerly Five-a-Side Stars) (see `tools/build-player-model.mjs`):

- Rogue body with the Rogue, Mage and Knight heads on the shared rig
- weapons, capes, hats and the pack texture removed
- UVs remapped to a simple colour grid so the game can paint kit colours
- modelled eyes and eyebrows removed; the face is a flat-mapped patch the game paints
- scarf, belt buckle, hip pouches and the ragged tunic hem cut away; the belt ring becomes the
  shorts' waistband, and the legs are mapped as strips so shorts, socks and boots can be painted
  at exact heights
- every opening left by the cuts (neck, eye sockets, brow slots, waist) is capped so the
  outline hull never shows through; eye sockets map onto the painted face's eyes
- only the animations the game uses are kept; geometry is quantised

Thank you Kay for making these free for everyone.
