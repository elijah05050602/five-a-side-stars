"""
Record Goal Rush!'s spoken commentary with the Kokoro text-to-speech model
(Apache-2.0, runs offline) and pack every clip into one small audio sprite.

Usage (from the repo root):
  python3 -m pip install kokoro-onnx soundfile
  curl -LO https://github.com/thewh1teagle/kokoro-onnx/releases/download/model-files-v1.0/kokoro-v1.0.onnx
  curl -LO https://github.com/thewh1teagle/kokoro-onnx/releases/download/model-files-v1.0/voices-v1.0.bin
  python3 tools/audio/build_commentary.py kokoro-v1.0.onnx voices-v1.0.bin

Reads tools/audio/commentary_script.json and writes public/audio/commentary.mp3
plus public/audio/commentary.json, which maps each line key to its clips as
[start, duration] in seconds.

To sound like a live commentator rather than a reader, each line is split into
phrases and spoken one phrase at a time: '...' becomes a dramatic beat, each
sentence gets a short breath after it, and excited phrases (ending in '!') are
spoken quicker, a touch higher and louder. The sprite then gets a broadcast
treatment (rumble cut, presence lift, compression).
"""
import json
import re
import os
import subprocess
import sys
import tempfile

import numpy as np
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
LIFT = 1.045  # excited phrases are resampled this much faster: about +0.75 semitones, a little more urgency


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


def speak(k, text):
    """Voice one line phrase by phrase with commentator pacing."""
    sr = 24000
    pieces = []
    for phrase, pause in phrases(text):
        excited = phrase.rstrip('.').endswith('!')
        spoken = phrase[:-3] + ',' if phrase.endswith('...') else phrase  # a comma keeps the voice hanging, not finished
        audio, sr = k.create(spoken, voice=VOICE, speed=1.14 if excited else 1.04, lang='en-us')
        audio = trim(np.asarray(audio, dtype=np.float32), sr)
        if excited:
            n = int(len(audio) / LIFT)
            audio = np.interp(np.linspace(0, len(audio) - 1, n), np.arange(len(audio)), audio).astype(np.float32)
            audio *= 0.95 / (np.max(np.abs(audio)) or 1)
        else:
            audio *= 0.72 / (np.max(np.abs(audio)) or 1)
        pieces += [audio, np.zeros(int(pause * sr), dtype=np.float32)]
    return np.concatenate(pieces), sr


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
            audio, sr = speak(k, text)
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
        json.dump({'voice': VOICE, 'clips': index}, f, separators=(',', ':'))
    print(f'{len(full) / sr:.1f}s of audio, {os.path.getsize(dest) // 1024} KB, {sum(len(v) for v in index.values())} clips')


if __name__ == '__main__':
    main(sys.argv[1] if len(sys.argv) > 1 else 'kokoro-v1.0.onnx', sys.argv[2] if len(sys.argv) > 2 else 'voices-v1.0.bin')
