"""
Render Goal Rush!'s music with real sampled instruments.

The tunes are written here as note lists (the same anthem the game used to
play on oscillators, re-arranged for a brass section, piano, strings, bass and
a drum kit) and played through the GeneralUser GS SoundFont with TinySoundFont.
A small synthetic hall reverb is added with numpy and the result is encoded to
MP3 with ffmpeg.

Usage (from the repo root):
  python3 -m pip install tinysoundfont numpy --no-deps
  curl -LO https://raw.githubusercontent.com/mrbumpy409/GeneralUser-GS/main/GeneralUser-GS.sf2
  python3 tools/audio/compose_music.py path/to/GeneralUser-GS.sf2

Writes public/audio/menu.mp3 (a seamless loop), win.mp3 and draw.mp3.
"""
import os
import random
import subprocess
import sys
import tempfile
import wave

import numpy as np
import tinysoundfont

SR = 44100
OUT = os.path.join(os.path.dirname(__file__), '..', '..', 'public', 'audio')

# GM programs and drum keys.
BRASS, TRUMPET, PIANO, STRINGS, BASS, GLOCK, TIMPANI, ORCH_HIT = 61, 56, 0, 48, 33, 9, 47, 55
KICK, SNARE, CLAP, HAT, OPEN_HAT, CRASH, TAMB, TOM_LO, TOM_HI = 36, 38, 39, 42, 46, 49, 54, 45, 50


class Score:
    def __init__(self, bpm):
        self.beat = 60.0 / bpm
        self.events = []  # (time, order, kind, chan, key, vel)

    def note(self, chan, key, beat, length, vel):
        t0 = beat * self.beat
        t1 = (beat + length) * self.beat
        vel = max(1, min(127, int(vel + random.uniform(-6, 6))))
        self.events.append((t0, 1, 'on', chan, key, vel))
        self.events.append((t1, 0, 'off', chan, key, 0))

    def hit(self, key, beat, vel):
        self.note(9, key, beat, 0.25, vel)


def render(score, programs, seconds, gain_db=-8.0):
    synth = tinysoundfont.Synth(gain=gain_db, samplerate=SR)
    sfid = synth.sfload(SF2)
    for chan, prog in programs.items():
        synth.program_select(chan, sfid, 128 if chan == 9 else 0, prog, chan == 9)
    synth.control_change(9, 7, 110)
    total = int(seconds * SR)
    out = np.zeros((total, 2), dtype=np.float32)
    pos = 0
    for (t, _, kind, chan, key, vel) in sorted(score.events):
        at = min(total, int(t * SR))
        if at > pos:
            buf = synth.generate(at - pos)
            out[pos:at] = np.frombuffer(buf, dtype=np.float32).reshape(-1, 2)
            pos = at
        if kind == 'on':
            synth.noteon(chan, key, vel)
        else:
            synth.noteoff(chan, key)
    if pos < total:
        out[pos:] = np.frombuffer(synth.generate(total - pos), dtype=np.float32).reshape(-1, 2)
    return out


def reverb(x, seconds=1.6, wet=0.18):
    """A cheap hall: convolve with exponentially decaying stereo noise."""
    n = int(seconds * SR)
    rng = np.random.default_rng(7)
    env = np.exp(-np.linspace(0, 7, n)).astype(np.float32)
    out = np.empty_like(x)
    size = 1
    while size < len(x) + n:
        size *= 2
    for ch in range(2):
        ir = rng.standard_normal(n).astype(np.float32) * env
        ir[: int(0.012 * SR)] = 0  # pre-delay
        ir /= np.sqrt(np.sum(ir ** 2))
        y = np.fft.irfft(np.fft.rfft(x[:, ch], size) * np.fft.rfft(ir, size), size)[: len(x)]
        out[:, ch] = x[:, ch] + wet * y
    return out


def write_mp3(x, name, kbps=112):
    peak = np.max(np.abs(x)) or 1
    x = x * (0.89 / peak)
    pcm = (np.clip(x, -1, 1) * 32767).astype('<i2')
    with tempfile.NamedTemporaryFile(suffix='.wav', delete=False) as f:
        tmp = f.name
    with wave.open(tmp, 'wb') as w:
        w.setnchannels(2)
        w.setsampwidth(2)
        w.setframerate(SR)
        w.writeframes(pcm.tobytes())
    os.makedirs(OUT, exist_ok=True)
    dest = os.path.join(OUT, name)
    subprocess.run(['ffmpeg', '-y', '-loglevel', 'error', '-i', tmp, '-codec:a', 'libmp3lame', '-b:a', f'{kbps}k', dest], check=True)
    os.unlink(tmp)
    print(name, f'{len(x) / SR:.2f}s', f'{os.path.getsize(dest) // 1024} KB')


# ---------------------------------------------------------------- the anthem
# Chords per bar (from the original oscillator tune) and its lead melody,
# one entry per eighth note, 0 = rest/hold.
C, G, Am, F, Dm, Em = [60, 64, 67], [59, 62, 67], [57, 60, 64], [57, 60, 65], [57, 62, 65], [59, 64, 67]
CHORDS = [C, G, Am, F, C, G, F, G, Am, F, C, G, Am, F, G, G]
ROOTS = [48, 43, 45, 41, 48, 43, 41, 43, 45, 41, 48, 43, 45, 41, 43, 43]
LEAD = [
    76, 79, 76, 72, 74, 76, 0, 0,
    74, 0, 71, 74, 79, 0, 0, 0,
    81, 0, 79, 76, 72, 74, 76, 0,
    77, 0, 76, 74, 72, 0, 0, 0,
    76, 79, 76, 72, 74, 76, 79, 0,
    81, 0, 79, 0, 83, 0, 0, 0,
    81, 79, 77, 76, 74, 0, 76, 0,
    74, 0, 0, 0, 71, 0, 0, 0,
    84, 0, 83, 81, 76, 0, 0, 0,
    81, 0, 79, 77, 72, 0, 0, 0,
    79, 76, 79, 76, 84, 0, 0, 0,
    83, 0, 81, 79, 74, 0, 0, 0,
    84, 0, 83, 81, 76, 0, 79, 0,
    81, 79, 77, 0, 81, 79, 77, 0,
    79, 0, 0, 81, 83, 0, 0, 0,
    86, 0, 0, 0, 84, 0, 0, 0,
]


def anthem():
    s = Score(bpm=128)
    bars = 32  # the 16-bar tune twice: first with a lighter band, then everyone in
    for bar in range(bars):
        b0 = bar * 4
        i = bar % 16
        chord, root = CHORDS[i], ROOTS[i]
        big = bar >= 16
        section_b = i >= 8
        # Lead: brass section, with a trumpet on top the second time round.
        for step in range(8):
            m = LEAD[i * 8 + step]
            if not m:
                continue
            hold = 1
            while hold < 4 and LEAD[(i * 8 + step + hold) % len(LEAD)] == 0:
                hold += 1
            at = b0 + step * 0.5
            s.note(0, m - 12, at, hold * 0.5 * 0.92, 92 if big else 84)
            if big:
                s.note(1, m, at, hold * 0.5 * 0.9, 78)
        # Piano: off-beat stabs for bounce.
        for off in (0.5, 1.5, 2.5, 3.5):
            for n in chord:
                s.note(2, n, b0 + off, 0.3, 62 if not section_b else 70)
        # Strings: a held chord, louder the second time.
        for n in chord:
            s.note(3, n - 12 if n > 64 else n, b0, 3.9, 58 if big else 44)
        # Bass: driving eighths, root and octave.
        for step in range(8):
            n = root - 12 + (12 if step % 4 == 3 else 0)
            if step == 6:
                n = root - 12 + 7
            s.note(4, n, b0 + step * 0.5, 0.45, 96 if step % 2 == 0 else 80)
        # Drums.
        fill = i in (7, 15)
        for beat in range(4):
            if beat in (0, 2) or big or section_b:
                s.hit(KICK, b0 + beat, 112 if beat == 0 else 100)
            if beat in (1, 3) and not (fill and beat == 3):
                s.hit(SNARE, b0 + beat, 104)
                s.hit(CLAP, b0 + beat, 90 if big else 70)
            for h in (0, 0.5):
                s.hit(OPEN_HAT if (h and section_b and beat == 3) else HAT, b0 + beat + h, 70 if h else 56)
            if big:
                s.hit(TAMB, b0 + beat + 0.5, 50)
        if fill:
            for k, t in enumerate((3.0, 3.25, 3.5, 3.75)):
                s.hit(SNARE if k < 2 else TOM_HI if k == 2 else TOM_LO, b0 + t, 92 + k * 8)
        if i in (0, 8):
            s.hit(CRASH, b0, 96)
        # A glockenspiel sparkle echoing the tune in the big section.
        if big and section_b:
            m = LEAD[i * 8]
            if m:
                s.note(5, m + 12, b0, 0.5, 60)
    progs = {0: BRASS, 1: TRUMPET, 2: PIANO, 3: STRINGS, 4: BASS, 5: GLOCK, 9: 0}
    loop = bars * 4 * s.beat
    x = render(s, progs, loop + 3.0)
    x = reverb(x)
    # Fold the ring-out past the loop point back onto the start so it loops seamlessly.
    n = int(round(loop * SR))
    tail = x[n:]
    y = x[:n].copy()
    y[: len(tail)] += tail
    write_mp3(y, 'menu.mp3', kbps=112)
    print('menu loop samples', n, 'seconds', n / SR)


def fanfare(name, happy):
    s = Score(bpm=120)
    if happy:
        # Da-da-da DAAA, then a big C major chord with timpani roll and cymbal.
        for k, (n, at, ln) in enumerate([(67, 0, 0.3), (67, 0.33, 0.3), (67, 0.66, 0.3), (72, 1.0, 1.0), (71, 2.0, 0.5), (72, 2.5, 0.5), (76, 3.0, 3.0)]):
            s.note(0, n, at, ln, 110)
            s.note(1, n - 12, at, ln, 96)
        for n in (48, 55, 60, 64, 67):
            s.note(2, n, 3.0, 3.0, 96)
            s.note(3, n, 3.0, 3.2, 80)
        s.note(4, 36, 3.0, 2.5, 110)
        for k in range(10):
            s.note(5, 36, 2.0 + k * 0.1, 0.1, 60 + k * 5)
        for at in (0, 0.33, 0.66):
            s.hit(SNARE, at, 90)
        s.hit(CRASH, 1.0, 100)
        s.hit(KICK, 1.0, 110)
        s.hit(CRASH, 3.0, 120)
        s.hit(KICK, 3.0, 120)
        seconds = 6.5
    else:
        # A warm, gentle "well played": no sad trombones for a seven-year-old.
        for n, at, ln in [(72, 0, 0.5), (71, 0.5, 0.5), (69, 1.0, 0.5), (67, 1.5, 1.0), (65, 2.5, 0.5), (67, 3.0, 2.0)]:
            s.note(0, n - 12, at, ln, 92)
        for n in (53, 57, 60):
            s.note(3, n, 1.5, 1.4, 70)
        for n in (48, 55, 60, 64):
            s.note(2, n, 3.0, 2.0, 80)
            s.note(3, n, 3.0, 2.2, 70)
        s.note(4, 36, 3.0, 2.0, 96)
        s.hit(CRASH, 3.0, 70)
        seconds = 5.5
    progs = {0: BRASS if happy else 60, 1: TRUMPET, 2: PIANO, 3: STRINGS, 4: BASS, 5: TIMPANI, 9: 0}
    x = reverb(render(s, progs, seconds), wet=0.22)
    fade = int(0.6 * SR)
    x[-fade:] *= np.linspace(1, 0, fade)[:, None]
    write_mp3(x, name, kbps=96)


if __name__ == '__main__':
    SF2 = sys.argv[1] if len(sys.argv) > 1 else 'GeneralUser-GS.sf2'
    random.seed(11)
    anthem()
    fanfare('win.mp3', True)
    fanfare('draw.mp3', False)
