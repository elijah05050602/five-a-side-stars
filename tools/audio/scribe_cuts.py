"""
Line boundaries for split_elevenlabs.py from a Scribe transcript of a take.

Scribe on an eleven_v3 generation returns the prompt's words, tags and
"[long pause]" markers with times. Each boundary is [end of the last word of a
line, start of the first sound of the next], where an audible tag such as
[gasps] or [laughs] counts as sound.

Usage: python3 tools/audio/scribe_cuts.py words.json   # prints the take's entry for commentary_cuts.json
"""
import json
import sys

AUDIBLE = ('[gasps]', '[laughs]', '[sighs]', '[chuckles]')


def hints(path):
    w = [x for x in json.load(open(path))['words'] if x.get('type') == 'word']
    out = []
    for i, x in enumerate(w):
        if x['text'] != '[long':
            continue
        a = next(y['end'] for y in reversed(w[:i]) if not y['text'].startswith('[') or y['text'] in AUDIBLE)
        j = i + 2 if i + 1 < len(w) and w[i + 1]['text'].startswith('pause') else i + 1
        b = next(y['start'] for y in w[j:] if not y['text'].startswith('[') or y['text'] in AUDIBLE)
        out.append([round(a, 3), round(b, 3)])
    return out


if __name__ == '__main__':
    print(json.dumps(hints(sys.argv[1])))
