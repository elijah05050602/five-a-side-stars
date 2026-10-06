# Music and commentary credits

Everything in this folder was made for Goal Rush! with ElevenLabs
(https://elevenlabs.io) on the project owner's account, 2026-10-06. Use of the
audio follows ElevenLabs' terms for that account: on the free plan that means
non-commercial use with attribution to ElevenLabs (this file is that
attribution); a paid plan adds commercial rights. It is not covered by the
game's MIT licence. The scripts that rebuild it are in `tools/audio/`.

## Music (`music-home.mp3`, `music-pages.mp3`, `win.mp3`, `draw.mp3`)

Generated for the game with **ElevenLabs Music** (`eleven_music_v2_5`,
instrumental). The two `music-*.mp3` tracks are cut to seamless loops by
`tools/audio/loop_music.py`; the prompts are in
`tools/audio/README-elevenlabs.md`.

## Commentary (`commentary.mp3`, `commentary.json`)

Spoken by **ElevenLabs** text-to-speech (`eleven_v3`, voice "Connor - Sports,
Advertisements & Social Media" from the ElevenLabs voice library), from the
performance script in
`tools/audio/commentary_elevenlabs.json` (the [tags] are v3 delivery directions
such as [shouting] or [gasps]). Lines were recorded ten at a time and cut apart
with `tools/audio/split_elevenlabs.py`. The lines were written for the game.
