#!/usr/bin/env python3
"""Build small WebP copies of the shop logos for the map, menus and static pages.

Logos are displayed at 34–76 CSS pixels, but the originals in images/logos/ are
often 400–1000 pixels wide. Each thumbnail is written to
images/logos/thumbs/<name>.webp at up to 128 pixels on its longest side (enough
for 2x screens). The browser tries the thumbnail first and falls back to the
original PNG, so a logo without a thumbnail still appears.

Requires Pillow:  python3 -m pip install pillow
Run after adding or replacing logos:  python3 scripts/build_logo_thumbs.py
"""

from __future__ import annotations

import argparse
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
LOGO_DIR = ROOT / "images" / "logos"
THUMB_DIR = LOGO_DIR / "thumbs"
SOURCE_SUFFIXES = {".png", ".jpg", ".jpeg", ".webp", ".gif"}


def build(max_side: int, quality: int, force: bool) -> int:
    try:
        from PIL import Image
    except ImportError:
        print("Pillow is required: python3 -m pip install pillow", file=sys.stderr)
        return 2

    THUMB_DIR.mkdir(parents=True, exist_ok=True)
    written = skipped = failed = 0
    before = after = 0
    for source in sorted(LOGO_DIR.iterdir()):
        if not source.is_file() or source.suffix.lower() not in SOURCE_SUFFIXES:
            continue
        target = THUMB_DIR / f"{source.stem}.webp"
        if not force and target.exists() and target.stat().st_mtime >= source.stat().st_mtime:
            skipped += 1
            continue
        try:
            with Image.open(source) as image:
                image = image.convert("RGBA")
                image.thumbnail((max_side, max_side), Image.LANCZOS)
                image.save(target, "WEBP", quality=quality, method=6)
        except Exception as error:  # A damaged logo should not stop the rest.
            failed += 1
            print(f"Skipped {source.name}: {error}", file=sys.stderr)
            continue
        written += 1
        before += source.stat().st_size
        after += target.stat().st_size

    # Remove thumbnails whose original logo was deleted.
    stems = {path.stem for path in LOGO_DIR.iterdir() if path.suffix.lower() in SOURCE_SUFFIXES}
    removed = 0
    for thumb in THUMB_DIR.glob("*.webp"):
        if thumb.stem not in stems:
            thumb.unlink()
            removed += 1

    print(f"Thumbnails written: {written}, unchanged: {skipped}, failed: {failed}, removed: {removed}")
    if written:
        print(f"Written logos: {before / 1024:.0f} KB of originals -> {after / 1024:.0f} KB of thumbnails")
    return 1 if failed else 0


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument("--size", type=int, default=128, help="longest side in pixels (default 128)")
    parser.add_argument("--quality", type=int, default=76, help="WebP quality 1-100 (default 76)")
    parser.add_argument("--force", action="store_true", help="rebuild every thumbnail")
    args = parser.parse_args()
    return build(args.size, args.quality, args.force)


if __name__ == "__main__":
    raise SystemExit(main())
