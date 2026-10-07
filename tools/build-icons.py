"""Builds the home-screen icons and favicons from the Goal Rush! key art.

Run from the repo root (needs Pillow):

    python3 tools/build-icons.py

It writes into public/:
- icon-192.png, icon-512.png: the logo, the kicker and the ball, as a rounded
  tile with a navy outline (desktop installs and the "any" manifest icons).
- icon-maskable-192.png, icon-maskable-512.png: the kicker and the ball edge to
  edge, with no words, so Android can cut it into a circle or squircle and the
  face and ball stay inside the safe zone.
- apple-touch-icon.png (180): the logo tile edge to edge; iOS rounds the corners.
- favicon-16.png, favicon-32.png: a tight crop of the kicker and the ball,
  which still reads in a browser tab.

The Davao Strikers FC crest is left out on purpose.
"""

from pathlib import Path

from PIL import Image, ImageDraw

ROOT = Path(__file__).resolve().parent.parent
PUBLIC = ROOT / "public"
NAVY = (0x1B, 0x2A, 0x41, 255)

# Squares cut from public/art/keyart.jpg (1376x768): left, top, right, bottom.
LOGO_CROP = (316, 20, 1064, 768)  # "GOAL RUSH!" over the kicker and the ball
MASKABLE_CROP = (405, 195, 978, 768)  # under the logo, kicker and ball centred
FAVICON_CROP = (470, 205, 990, 725)  # face and ball only


def crop(art: Image.Image, box: tuple[int, int, int, int], size: int) -> Image.Image:
    return art.crop(box).resize((size, size), Image.LANCZOS).convert("RGBA")


def rounded_tile(art: Image.Image, size: int) -> Image.Image:
    """The logo crop as a rounded tile with the design system's navy outline."""
    scale = 4  # draw big and shrink, for smooth corners
    big = size * scale
    radius = round(big * 0.2)
    border = max(round(big * 0.025), scale * 2)
    pad = border // 2
    tile = crop(art, LOGO_CROP, big)
    mask = Image.new("L", (big, big), 0)
    ImageDraw.Draw(mask).rounded_rectangle((pad, pad, big - 1 - pad, big - 1 - pad), radius, fill=255)
    out = Image.new("RGBA", (big, big), (0, 0, 0, 0))
    out.paste(tile, (0, 0), mask)
    ImageDraw.Draw(out).rounded_rectangle(
        (pad, pad, big - 1 - pad, big - 1 - pad), radius, outline=NAVY, width=border
    )
    return out.resize((size, size), Image.LANCZOS)


def main() -> None:
    art = Image.open(PUBLIC / "art" / "keyart.jpg").convert("RGB")
    for size in (192, 512):
        rounded_tile(art, size).save(PUBLIC / f"icon-{size}.png", optimize=True)
        crop(art, MASKABLE_CROP, size).convert("RGB").save(PUBLIC / f"icon-maskable-{size}.png", optimize=True)
    crop(art, LOGO_CROP, 180).convert("RGB").save(PUBLIC / "apple-touch-icon.png", optimize=True)
    for size in (16, 32):
        crop(art, FAVICON_CROP, size).convert("RGB").save(PUBLIC / f"favicon-{size}.png", optimize=True)


if __name__ == "__main__":
    main()
