"""
Record Goal Rush!'s spoken commentary with the Kokoro text-to-speech model
(Apache-2.0, runs offline) and pack every clip into one small audio sprite.

Usage (from the repo root):
  python3 -m pip install kokoro-onnx soundfile pyworld
  curl -LO https://github.com/thewh1teagle/kokoro-onnx/releases/download/model-files-v1.0/kokoro-v1.0.onnx
  curl -LO https://github.com/thewh1teagle/kokoro-onnx/releases/download/model-files-v1.0/voices-v1.0.bin
  python3 tools/audio/build_commentary.py kokoro-v1.0.onnx voices-v1.0.bin

Reads tools/audio/commentary_script.json and writes public/audio/commentary.mp3
plus public/audio/commentary.json, which maps each line key to its clips as
[start, duration] in seconds and records the MP3's length (the game refuses a
recording of another length).

To sound like a live commentator rather than a reader, each line is split into
phrases and spoken one phrase at a time: '...' becomes a dramatic beat, each
sentence gets a short breath after it. Exclamations are re-performed with the
WORLD vocoder: higher, wider-ranging pitch and a brighter, effortful tone, and
for the big moments (goals, saves, near misses) a real shout, with one-word
calls like "Goal!" or "Ohh!" stretched into a rising-and-falling vowel. The sprite then gets a broadcast
treatment (rumble cut, presence lift, compression).
"""
import json
import re
import os
import subprocess
import sys
import tempfile

import numpy as np
import pyworld as pw
import soundfile as sf
from kokoro_onnx import Kokoro

HERE = os.path.dirname(__file__)
OUT = os.path.join(HERE, '..', '..', 'public', 'audio')
VOICE = 'am_fenrir'  # Kokoro's liveliest good-quality male voice: widest pitch range and dynamics of the top-graded ones
GAP = 0.25  # silence between clips in the sprite
PAD = 0.06  # extra room either side of each clip, covering MP3 encoder delay

WORDS = ['nil', 'one', 'two', 'three', 'four', 'five', 'six', 'seven', 'eight', 'nine']


def score_lines():
    """'It's two one.' style score calls, leader first, up to 9 goals."""
    out = {}
    for a in range(10):
        for b in range(a + 1):
            text = f"It's {WORDS[a]} all." if a == b and a > 0 else "It's nil nil." if a == b else f"It's {WORDS[a]}, {WORDS[b]}!"
            out[f'score_{a}_{b}'] = [text]
    return out


BEAT = 0.42  # the pause at '...'
BREATH = 0.16  # the pause between sentences

# Moments that deserve a proper shout: goals, saves, near misses, penalties, the end.
BIG = re.compile(r'^(goal|save|miss(Bar|Post|Wide|Over)|penalty|shootout|fulltime(Win|Thrashing))')
# One-word calls that get a stretched, rising-then-falling vowel: "Gooo-al!", "Ohhh!".
STRETCH = {'goal!', 'scores!', 'post!', 'penalty!', 'ohh!', 'whoa!', 'ooh!', 'wow!', 'clang!', 'rocket!', 'equaliser!'}


def phrases(text):
    """Split a line into (phrase, pause after) pairs."""
    out = []
    for part in re.split(r'(\.\.\.|(?<=[.!?])\s+)', text):
        if part is None or not part.strip():
            continue
        if part == '...':
            if out:
                out[-1] = (out[-1][0] + '...', BEAT)
            continue
        out.append((part.strip(), BREATH))
    if out:
        out[-1] = (out[-1][0], 0.0)
    return out


def intensity(key, phrase):
    """'shout' for the big calls, 'excited' for other exclamations, 'calm' for the rest."""
    if not phrase.rstrip('.').endswith('!'):
        return 'calm'
    if BIG.match(key) and len(phrase.split()) <= 4:
        return 'shout'
    return 'excited'


def perform(x, sr, up, widen, bright, stretch=1.0):
    """
    Re-perform a phrase with the WORLD vocoder: raise and widen the pitch
    contour, brighten the spectrum (more vocal effort), and optionally hold
    the loudest vowel longer with a rise-and-fall, the way a commentator
    stretches "Gooo-al!".
    """
    x = x.astype(np.float64)
    f0, t = pw.harvest(x, sr, f0_floor=60, f0_ceil=400, frame_period=5)
    f0 = pw.stonemask(x, f0, t, sr)
    sp = pw.cheaptrick(x, f0, t, sr)
    ap = pw.d4c(x, f0, t, sr)
    voiced = f0 > 0
    if not voiced.any():
        return x.astype(np.float32)
    lf = np.log2(np.where(voiced, f0, 1))
    mid = np.median(lf[voiced])
    dev = np.clip(lf - mid, -0.6, 0.6)  # ignore tracker octave slips so they are not exaggerated
    f0 = np.where(voiced, 2 ** (mid + dev * widen + up / 12), 0)
    if stretch > 1:
        # The loudest voiced run is the stressed vowel: hold it, rising then falling.
        energy = np.log(sp.sum(axis=1) + 1e-12)
        runs, start = [], None
        for i, v in enumerate(np.append(voiced, False)):
            if v and start is None:
                start = i
            elif not v and start is not None:
                runs.append((start, i))
                start = None
        a, b = max(runs, key=lambda r: energy[r[0]:r[1]].sum())
        a2, b2 = a + (b - a) // 4, b - (b - a) // 4
        if b2 - a2 >= 2:
            n = int((b2 - a2) * stretch)
            idx = np.linspace(a2, b2 - 1, n)
            lo = np.floor(idx).astype(int)
            frac = (idx - lo)[:, None]
            hi = np.minimum(lo + 1, b2 - 1)
            sp_s = sp[lo] * (1 - frac) + sp[hi] * frac
            ap_s = ap[lo] * (1 - frac) + ap[hi] * frac
            arc = 2 ** ((np.sin(np.linspace(0, np.pi, n)) * 3 + np.linspace(0, -1.5, n)) / 12)
            f0_s = np.interp(idx, np.arange(len(f0)), f0) * arc
            f0 = np.concatenate([f0[:a2], f0_s, f0[b2:]])
            sp = np.concatenate([sp[:a2], sp_s, sp[b2:]])
            ap = np.concatenate([ap[:a2], ap_s, ap[b2:]])
    freqs = np.linspace(0, sr / 2, sp.shape[1])
    sp = sp * (1 + bright * np.clip((freqs - 800) / 3000, 0, 1)) ** 2
    y = pw.synthesize(np.ascontiguousarray(f0), np.ascontiguousarray(sp), np.ascontiguousarray(ap), sr, 5)
    return y.astype(np.float32)


def speak(k, key, text):
    """Voice one line phrase by phrase with commentator pacing and excitement."""
    sr = 24000
    pieces = []
    for phrase, pause in phrases(text):
        level = intensity(key, phrase)
        spoken = phrase[:-3] + ',' if phrase.endswith('...') else phrase  # a comma keeps the voice hanging, not finished
        speed = {'shout': 1.12, 'excited': 1.14, 'calm': 1.04}[level]
        audio, sr = k.create(spoken, voice=VOICE, speed=speed, lang='en-us')
        audio = trim(np.asarray(audio, dtype=np.float32), sr)
        if level == 'shout':
            audio = perform(audio, sr, up=4.0, widen=1.6, bright=1.0, stretch=2.6 if phrase.lower() in STRETCH else 1.0)
            peak = 0.98
        elif level == 'excited':
            audio = perform(audio, sr, up=2.0, widen=1.3, bright=0.5)
            peak = 0.9
        else:
            peak = 0.7
        audio = trim(audio, sr)
        audio *= peak / (np.max(np.abs(audio)) or 1)
        pieces += [audio, np.zeros(int(pause * sr), dtype=np.float32)]
    return np.concatenate(pieces), sr


def mp3_seconds(path):
    """The length of an MP3 as ffprobe reports it, to the millisecond."""
    out = subprocess.run(['ffprobe', '-v', 'error', '-show_entries', 'format=duration', '-of', 'csv=p=0', path], capture_output=True, text=True, check=True).stdout
    return round(float(out), 3)


def trim(x, sr, thresh=0.01):
    loud = np.where(np.abs(x) > thresh)[0]
    if len(loud) == 0:
        return x
    a = max(0, loud[0] - int(0.02 * sr))
    b = min(len(x), loud[-1] + int(0.06 * sr))
    return x[a:b]


def main(model, voices):
    with open(os.path.join(HERE, 'commentary_script.json')) as f:
        script = {k: v for k, v in json.load(f).items() if not k.startswith('_')}
    script.update(score_lines())
    k = Kokoro(model, voices)
    sr = 24000
    gap = np.zeros(int(GAP * sr), dtype=np.float32)
    parts = [gap]
    pos = len(gap)
    index = {}
    for key, lines in script.items():
        index[key] = []
        for text in lines:
            audio, sr = speak(k, key, text)
            start = pos / sr
            index[key].append([round(start - PAD, 3), round(len(audio) / sr + 2 * PAD, 3)])
            parts += [audio, gap]
            pos += len(audio) + len(gap)
            print(f'{key:18s} {len(audio) / sr:4.2f}s  {text}')
    full = np.concatenate(parts)
    os.makedirs(OUT, exist_ok=True)
    with tempfile.NamedTemporaryFile(suffix='.wav', delete=False) as f:
        tmp = f.name
    sf.write(tmp, full, sr)
    dest = os.path.join(OUT, 'commentary.mp3')
    # Broadcast voice: cut rumble, lift presence, even out the level. Filters keep the timing, so the index stays exact.
    chain = 'highpass=f=90,equalizer=f=3000:t=q:w=1:g=3,acompressor=threshold=-18dB:ratio=3:attack=5:release=120:makeup=2,alimiter=limit=0.95'
    subprocess.run(['ffmpeg', '-y', '-loglevel', 'error', '-i', tmp, '-af', chain, '-ac', '1', '-codec:a', 'libmp3lame', '-b:a', '40k', dest], check=True)
    os.unlink(tmp)
    with open(os.path.join(OUT, 'commentary.json'), 'w') as f:
        json.dump({'voice': VOICE, 'duration': mp3_seconds(dest), 'clips': index}, f, separators=(',', ':'))
    print(f'{len(full) / sr:.1f}s of audio, {os.path.getsize(dest) // 1024} KB, {sum(len(v) for v in index.values())} clips')


if __name__ == '__main__':
    main(sys.argv[1] if len(sys.argv) > 1 else 'kokoro-v1.0.onnx', sys.argv[2] if len(sys.argv) > 2 else 'voices-v1.0.bin')
