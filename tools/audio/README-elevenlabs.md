# Recording the game's audio with ElevenLabs

The shipped commentary and music were generated with ElevenLabs. The older free
pipeline (`build_commentary.py` with Kokoro, `compose_music.py` with a
SoundFont) still works if the audio ever needs rebuilding without an account.

## Commentary

1. `python3 tools/audio/split_elevenlabs.py plan > batches.json` lists 17
   prompts of up to ten lines each, joined by `[long pause]`.
2. Record each prompt with model `eleven_v3`, voice Connor
   (`xtw8E1CXDMtNKx4sgP7u`), one take, and save it as `takes/take_<n>.mp3`.
   Record them one or two at a time: firing many at once got some refused.
3. Transcribe each take with Scribe (`eleven_scribe_v1`) and run
   `python3 tools/audio/scribe_cuts.py words.json` on its word list. That
   prints, for every pair of neighbouring lines, the end time of the last word
   of one line and the start time of the first sound of the next (audible tags
   such as [gasps] or [laughs] count as sound): the take's entry in
   `commentary_cuts.json`. Takes without an
   entry are cut at their longest silences, which is fine for the short score
   calls but not for lines with a dramatic beat in them.
4. `python3 tools/audio/split_elevenlabs.py build batches.json takes/ tools/audio/commentary_cuts.json`
   writes `public/audio/commentary.mp3` and `.json`.

## Music

`eleven_music_v2_5`, instrumental:

- **home** (the homepage, 64 s, then `python3 tools/audio/loop_music.py raw.mp3 public/audio/music-home.mp3`
  and copy the printed loop length into `TRACKS` in `src/game/music.ts`):
  "Energetic, sunny football carnival anthem for the home screen of a kids'
  football video game. 124 BPM samba-pop groove: punchy surdo and stadium kick
  drums, shakers, timbales and claps, a bouncy slap bass, bright funky electric
  guitar strums, and a big catchy trumpet and saxophone horn-section melody that
  kids would hum, with stadium crowd "olé" whoops in the background. Joyful,
  confident, festive and full of energy from the first second, steady groove all
  the way through, no slow intro, no fade out, crisp modern production.
  Instrumental, no vocals."
- **matchday** (match preparation and results, `music-matchday.mp3`, same steps):
  "Laid-back, playful funky groove for the team-building and kit-picking
  screens of a kids' football video game. 100 BPM feel-good funk-pop: tight
  crisp drums with a head-nodding backbeat, warm clavinet and wah electric
  guitar, a round bouncy bass line, light marimba and glockenspiel hooks,
  finger snaps and handclaps. Cheerful, cool and relaxed but still upbeat, like
  getting ready in the locker room with your friends. Steady groove all the way
  through, no slow intro, no fade out, crisp modern production. Instrumental,
  no vocals."
- **win** (cut with `loop_music.py --sting 7.5`): "Short triumphant victory fanfare sting for a kids' football game:
  bright brass and electric guitar flourish over a big stadium drum fill, cymbal
  crash and cheering crowd, ending on a held major chord. Joyful, celebratory,
  128 BPM pop-rock. Instrumental."
- **draw** (cut with `loop_music.py --sting 7`): "Short friendly good-game sting for a kids' football game: warm,
  light-hearted brass and synth phrase with a gentle drum roll and soft clap,
  ending on a bright but relaxed major chord. Cheerful, playful, not sad, 128
  BPM pop. Instrumental."

Each loop costs about 960 credits for 64 s. After changing any file in `public/audio/`, bump `VERSION` in `public/sw.js` so
phones fetch the new audio instead of their cached copy.

## Adding lines later

Add the new lines to `commentary_elevenlabs.json`, then
`python3 tools/audio/split_elevenlabs.py plan batches.json > more.json` keeps
the recorded batches as they are and appends batches for only the new lines.
Record those (`take_17.mp3` onwards), add their Scribe boundaries to
`commentary_cuts.json`, and run `build more.json takes/ ...` as above. Until a
situation is recorded, `FALLBACK` in `src/game/voice.ts` speaks a similar line
for big moments, and chatter is shown on the ticker without a voice. Each take
of ten lines costs about 600 credits on eleven_v3.
