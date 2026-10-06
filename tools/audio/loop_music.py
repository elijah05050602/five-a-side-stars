"""
Turn a generated music track into the menu's seamless loop.

The menu music is an ElevenLabs Music (eleven_music_v2_5) instrumental a few
seconds longer than the loop. This finds its tempo, picks the longest whole
number of bars that leaves room for a crossfade, and blends the extra tail into
the start, so playing [0, loop length) on repeat never clicks or skips a beat.

Usage (from the repo root):
  python3 -m pip install librosa soundfile
  python3 tools/audio/loop_music.py generated.mp3 public/audio/music-home.mp3

Prints the loop length; it must match LOOP_SECONDS in src/game/music.ts.

The full-time jingles are the closing seconds of a generated sting, starting on
a beat so they open with a hit and keeping the track's own ending:
  python3 tools/audio/loop_music.py --sting 7.5 generated_win.mp3 public/audio/win.mp3
"""
import subprocess
import sys

import librosa
import numpy as np
import soundfile as sf

SR = 44100
FADE = 3.0  # seconds of crossfade at the loop point


def main(src, dest):
    y, _ = librosa.load(src, sr=SR, mono=False)
    y = np.atleast_2d(y)
    mono = y.mean(axis=0)
    tempo, beats = librosa.beat.beat_track(y=mono, sr=SR, units='time')
    # The tracker's tempo is only roughly right, and a loop of many bars needs
    # it exact: pick the tempo at which the rhythm 16 bars later lines up best.
    hop = 128
    onset = librosa.onset.onset_strength(y=mono, sr=SR, hop_length=hop)
    fps = SR / hop
    guess = float(np.atleast_1d(tempo)[0])

    def match(bpm):
        lag = int(round(16 * 4 * 60 / bpm * fps))
        return np.corrcoef(onset[:-lag], onset[lag:])[0, 1]
    bpm = max(np.arange(guess - 3, guess + 3, 0.01), key=match)
    bar = 4 * 60 / bpm
    first = float(beats[0]) if len(beats) else 0.0
    # Ignore a fade-out at the end: stop where the level drops 9 dB under the norm.
    step = SR // 10
    rms = librosa.feature.rms(y=mono, frame_length=step * 2, hop_length=step)[0]
    db = 20 * np.log10(rms / rms.max() + 1e-9)
    loud = np.where(db > np.median(db) - 9)[0]
    usable = (loud[-1] + 1) * step / SR
    bars = int((usable - first - FADE) // bar)
    loop = bars * bar
    a, n, f = int(first * SR), int(loop * SR), int(FADE * SR)
    body = y[:, a:a + n].copy()
    tail = y[:, a + n:a + n + f]
    ramp = np.sin(np.linspace(0, np.pi / 2, f)) ** 2  # equal-power-ish fade
    body[:, :f] = body[:, :f] * ramp + tail * (1 - ramp)
    body *= 0.95 / (np.abs(body).max() or 1)
    tmp = dest + '.wav'
    sf.write(tmp, body.T, SR)
    subprocess.run(['ffmpeg', '-y', '-loglevel', 'error', '-i', tmp, '-codec:a', 'libmp3lame', '-b:a', '96k', dest], check=True)
    subprocess.run(['rm', tmp], check=True)
    print(f'{bpm:.2f} bpm, {bars} bars, loop {loop:.3f}s (first beat at {first:.2f}s, usable to {usable:.1f}s)')


def sting(seconds, src, dest):
    y, _ = librosa.load(src, sr=SR, mono=False)
    y = np.atleast_2d(y)
    _, beats = librosa.beat.beat_track(y=y.mean(axis=0), sr=SR, units='time')
    want = y.shape[1] / SR - seconds
    start = float(beats[np.argmin(np.abs(beats - want))]) if len(beats) else want
    clip = y[:, int(start * SR):].copy()
    f = int(0.02 * SR)
    clip[:, :f] *= np.linspace(0, 1, f)
    clip *= 0.95 / (np.abs(clip).max() or 1)
    tmp = dest + '.wav'
    sf.write(tmp, clip.T, SR)
    subprocess.run(['ffmpeg', '-y', '-loglevel', 'error', '-i', tmp, '-codec:a', 'libmp3lame', '-b:a', '96k', dest], check=True)
    subprocess.run(['rm', tmp], check=True)
    print(f'sting from {start:.2f}s, {clip.shape[1] / SR:.1f}s long')


if __name__ == '__main__':
    if sys.argv[1] == '--sting':
        sting(float(sys.argv[2]), sys.argv[3], sys.argv[4])
    else:
        main(sys.argv[1], sys.argv[2])
