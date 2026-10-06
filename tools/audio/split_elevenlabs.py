"""
Split ElevenLabs commentary takes into clips and pack them into the game's
audio sprite.

Each take is one ElevenLabs eleven_v3 generation of several lines from
tools/audio/commentary_elevenlabs.json joined with "[long pause]" (see
`plan` below). The N lines of a take are cut at its N-1 longest silences, and
each clip is checked against its text length so a dropped or merged line is
caught rather than shipped.

Usage (from the repo root):
  python3 tools/audio/split_elevenlabs.py plan > batches.json   # the prompts to record
  python3 tools/audio/split_elevenlabs.py plan batches.json > more.json   # only lines added since
  # record each batch's prompt with voice Connor (xtw8E1CXDMtNKx4sgP7u), save as take_<n>.mp3
  python3 tools/audio/split_elevenlabs.py build batches.json takes/ [hints.json]

hints.json (optional) maps a take number to its line boundaries,
[[end of line 1, start of line 2], ...] in seconds, read off a Scribe
transcript of the take; see split().

Writes public/audio/commentary.mp3 and public/audio/commentary.json.
"""
import json
import os
import re
import subprocess
import sys
import tempfile

import numpy as np
import soundfile as sf

HERE = os.path.dirname(__file__)
OUT = os.path.join(HERE, '..', '..', 'public', 'audio')
SR = 24000
GAP = 0.25  # silence between clips in the sprite
PAD = 0.06  # extra room either side of each clip, covering MP3 encoder delay
PER_BATCH = 10
WORDS = ['nil', 'one', 'two', 'three', 'four', 'five', 'six', 'seven', 'eight', 'nine']


def script():
    with open(os.path.join(HERE, 'commentary_elevenlabs.json')) as f:
        lines = {k: v for k, v in json.load(f).items() if not k.startswith('_')}
    for a in range(10):
        for b in range(a + 1):
            lines[f'score_{a}_{b}'] = [f"[excited] It's {WORDS[a]} all!" if a == b and a > 0 else "It's nil nil." if a == b else f"[excited] It's {WORDS[a]}, {WORDS[b]}!"]
    return lines


def plan(recorded=None):
    """
    The prompts to record. Given the batches already recorded, keeps them as
    they are and adds new batches for only the lines that are not in them, so
    new lines can be recorded without re-recording the old ones.
    """
    old = []
    if recorded:
        with open(recorded) as f:
            old = json.load(f)
    done = {(k, t) for b in old for k, _, t in b['items']}
    items = [(k, i, t) for k, v in script().items() for i, t in enumerate(v) if (k, t) not in done]
    batches = [items[n:n + PER_BATCH] for n in range(0, len(items), PER_BATCH)]
    return old + [{'items': [list(it) for it in b], 'prompt': ' [long pause] '.join(t for _, _, t in b)} for b in batches]


def load(path):
    raw = subprocess.run(['ffmpeg', '-loglevel', 'error', '-i', path, '-f', 'f32le', '-ac', '1', '-ar', str(SR), '-'], capture_output=True, check=True).stdout
    return np.frombuffer(raw, dtype=np.float32).copy()


def spoken_chars(text):
    return len(re.sub(r'\[[^\]]*\]', '', text).strip())


def split(x, n, hints=None):
    """
    Cut a take into n pieces, trimmed. Without hints the cuts are the n-1
    longest silences. With hints (one [end of line, start of next line] pair in
    seconds per boundary, from an ElevenLabs Scribe alignment of the take) each
    cut is the longest silence near that boundary, because v3 sometimes leaves
    a [long pause] shorter than a dramatic beat inside a line.
    """
    hop = int(0.01 * SR)
    frames = len(x) // hop
    rms = np.sqrt(np.mean(x[: frames * hop].reshape(frames, hop) ** 2, axis=1) + 1e-12)
    db = 20 * np.log10(rms / (rms.max() + 1e-12))
    quiet = db < -38
    runs, start = [], None
    for i, q in enumerate(np.append(quiet, False)):
        if q and start is None:
            start = i
        elif not q and start is not None:
            runs.append((start, i))
            start = None
    inner = [r for r in runs if r[0] > 0 and r[1] < frames]
    if hints:
        if len(hints) != n - 1:
            raise ValueError(f'{len(hints)} hints for {n} lines')
        cuts = []
        for a, b in hints:
            lo, hi = int((a - 0.3) * 100), int((b + 0.3) * 100)
            near = [r for r in inner if r[1] > lo and r[0] < hi and (not cuts or r[0] >= cuts[-1][1])]
            if near:
                # the silence that best covers the gap between the two lines
                cuts.append(max(near, key=lambda r: (min(r[1], hi) - max(r[0], lo), r[1] - r[0])))
            else:  # no clean silence: cut at the quietest frame between the words
                f = int(a * 100) + int(np.argmin(db[int(a * 100):max(int(b * 100), int(a * 100) + 1)]))
                cuts.append((f, f + 1))
    else:
        if len(inner) < n - 1:
            raise ValueError(f'only {len(inner)} pauses for {n} lines')
        cuts = sorted(inner, key=lambda r: r[1] - r[0], reverse=True)[: n - 1]
        cuts.sort()
    bounds = [0] + [(a + b) // 2 for a, b in cuts] + [frames]
    pieces = []
    for a, b in zip(bounds, bounds[1:]):
        seg = x[a * hop: b * hop]
        loud = np.where(np.abs(seg) > 0.02 * np.abs(x).max())[0]
        seg = seg[max(0, loud[0] - int(0.03 * SR)): loud[-1] + int(0.08 * SR)] if len(loud) else seg
        pieces.append(seg)
    return pieces, [(b - a) / 100 for a, b in cuts]


def build(batches_path, takes_dir, hints_path=None):
    with open(batches_path) as f:
        batches = json.load(f)
    hints = {}
    if hints_path:
        with open(hints_path) as f:
            hints = json.load(f)
    clips = {}
    for n, batch in enumerate(batches):
        take = os.path.join(takes_dir, f'take_{n}.mp3')
        if not os.path.exists(take):  # not recorded yet: the game falls back for these lines
            print(f'take {n}: missing, skipped')
            continue
        x = load(take)
        pieces, gaps = split(x, len(batch['items']), hints.get(str(n)))
        for (key, i, text), seg in zip(batch['items'], pieces):
            secs = len(seg) / SR
            rate = secs / max(1, spoken_chars(text))
            if rate < 0.025 or (rate > 0.2 and secs > 2.5):
                raise ValueError(f'take {n}: "{text}" came out {secs:.2f}s, the cut is probably wrong (pauses {gaps})')
            clips.setdefault(key, []).append((i, seg))
        print(f'take {n}: {len(pieces)} clips of {min(len(p) for p in pieces) / SR:.1f}-{max(len(p) for p in pieces) / SR:.1f}s, shortest cut pause {min(gaps):.2f}s')
    gap = np.zeros(int(GAP * SR), dtype=np.float32)
    parts, pos, index = [gap], len(gap), {}
    for key, segs in clips.items():
        index[key] = []
        for _, seg in sorted(segs, key=lambda s: s[0]):
            seg = seg * (0.9 / (np.abs(seg).max() or 1))
            index[key].append([round(pos / SR - PAD, 3), round(len(seg) / SR + 2 * PAD, 3)])
            parts += [seg.astype(np.float32), gap]
            pos += len(seg) + len(gap)
    full = np.concatenate(parts)
    with tempfile.NamedTemporaryFile(suffix='.wav', delete=False) as f:
        tmp = f.name
    sf.write(tmp, full, SR)
    dest = os.path.join(OUT, 'commentary.mp3')
    chain = 'highpass=f=80,acompressor=threshold=-18dB:ratio=2.5:attack=5:release=150:makeup=1.5,alimiter=limit=0.95'
    subprocess.run(['ffmpeg', '-y', '-loglevel', 'error', '-i', tmp, '-af', chain, '-ac', '1', '-codec:a', 'libmp3lame', '-b:a', '32k', dest], check=True)
    os.unlink(tmp)
    with open(os.path.join(OUT, 'commentary.json'), 'w') as f:
        json.dump({'voice': 'elevenlabs:Connor', 'clips': index}, f, separators=(',', ':'))
    print(f'{len(full) / SR:.1f}s of audio, {os.path.getsize(dest) // 1024} KB, {sum(len(v) for v in index.values())} clips')


if __name__ == '__main__':
    if sys.argv[1] == 'plan':
        print(json.dumps(plan(sys.argv[2] if len(sys.argv) > 2 else None), indent=1))
    else:
        build(sys.argv[2], sys.argv[3], sys.argv[4] if len(sys.argv) > 4 else None)
