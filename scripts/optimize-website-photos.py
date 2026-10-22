#!/usr/bin/env python3
"""Rebuild the website's resized WebP photos without modifying the originals."""

import argparse
from pathlib import Path
import shutil
import subprocess

ROOT = Path(__file__).resolve().parents[1]
PHOTOS = [
    ("Photo Sep 29 2026, 3 41 52 PM.jpg", "799-hillclimb", [480, 960, 1280, 1600, 2400]),
    ("Photo Sep 29 2026, 3 41 39 PM.jpg", "799-photo-main", [480, 960]),
    ("Photo Oct 27 2025, 11 10 32 PM.png", "799-photo-stack", [480, 960]),
    ("Photo Sep 19 2026, 2 46 03 AM.jpg", "799-on-course", [480, 960, 1600]),
    ("1941e4db-29a9-4813-ac8b-b8f86df2e811.jpeg", "799-competition", [480, 799]),
    ("a5d096db-f541-457d-ac89-d2df047f120a.jpeg", "799-detail", [480, 960, 1600]),
    ("e9ee6d74-9040-49bf-b16d-97f670637a02.jpeg", "799-course", [480, 960, 1600]),
    ("dba5a1b8-66a4-4d04-a174-c47dbdeb0c5e.jpeg", "michael-white", [960, 1920]),
]


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--srgb-profile", type=Path, help="Path to an sRGB ICC profile")
    args = parser.parse_args()
    magick = shutil.which("magick")
    if not magick:
        parser.error("ImageMagick 7 with WebP support is required (magick command).")
    profile = args.srgb_profile or next(
        (path for path in [Path("/usr/share/color/icc/sRGB.icc"),
                           Path("/usr/share/color/icc/ghostscript/srgb.icc")]
         if path.is_file()), None
    )
    if not profile or not profile.is_file():
        parser.error("Supply an sRGB ICC profile with --srgb-profile.")
    destination = ROOT / "images" / "optimized"
    destination.mkdir(parents=True, exist_ok=True)
    for original, name, widths in PHOTOS:
        for width in widths:
            target = destination / f"{name}-{width}.webp"
            subprocess.run([
                magick, str(ROOT / "images" / original), "-auto-orient",
                "-profile", str(profile), "-resize", f"{width}x>", "-strip",
                "-define", "webp:method=6", "-quality", "84", str(target),
            ], check=True)
        print(f"{name}: {', '.join(map(str, widths))} px")


if __name__ == "__main__":
    main()
