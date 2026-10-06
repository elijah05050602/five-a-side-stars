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
"""
import json
import os
import subprocess
import sys
import tempfile

import numpy as np
import soundfile as sf
from kokoro_onnx import Kokoro

HERE = os.path.dirname(__file__)
OUT = os.path.join(HERE, '..', '..', 'public', 'audio')
VOICE = 'bf_emma'  # a bright British voice, the clearest of Kokoro's English voices
GAP = 0.25  # silence between clips in the sprite
PAD = 0.06  # extra room either side of each clip, covering MP3 encoder delay

WORDS = ['nil', 'one', 'two', 'three', 'four', 'five', 'six', 'seven', 'eight', 'nine']


def score_lines():
    """'It's two one.' style score calls, leader first, up to 9 goals."""
    out = {}
    for a in range(10):
        for b in range(a + 1):
            text = f"It's {WORDS[a]} all." if a == b and a > 0 else "It's nil nil." if a == b else f"It's {WORDS[a]}, {WORDS[b]}."
            out[f'score_{a}_{b}'] = [text]
    return out


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
            excited = '!' in text
            audio, sr = k.create(text, voice=VOICE, speed=1.12 if excited else 1.02, lang='en-gb')
            audio = trim(np.asarray(audio, dtype=np.float32), sr)
            audio *= 0.9 / (np.max(np.abs(audio)) or 1)
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
    subprocess.run(['ffmpeg', '-y', '-loglevel', 'error', '-i', tmp, '-ac', '1', '-codec:a', 'libmp3lame', '-b:a', '40k', dest], check=True)
    os.unlink(tmp)
    with open(os.path.join(OUT, 'commentary.json'), 'w') as f:
        json.dump({'voice': VOICE, 'clips': index}, f, separators=(',', ':'))
    print(f'{len(full) / sr:.1f}s of audio, {os.path.getsize(dest) // 1024} KB, {sum(len(v) for v in index.values())} clips')


if __name__ == '__main__':
    main(sys.argv[1] if len(sys.argv) > 1 else 'kokoro-v1.0.onnx', sys.argv[2] if len(sys.argv) > 2 else 'voices-v1.0.bin')
