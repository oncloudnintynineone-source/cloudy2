#!/usr/bin/env python3
"""Derive the Web Push notification icon + badge assets from public/icon.svg.

The app tile (public/icon.svg) is a near-white rounded square, which reads as a
blank/opaque square on Android's light notification surface (and as a filled
square in the status-bar badge slot). For notifications we want a brand-blue
background with the whole cloud+movement mark recolored white, plus a white
silhouette badge for the status bar.

This script rewrites icon.svg textually and rasterizes the two variants with
rsvg-convert (librsvg) — no extra Python deps. Re-run it after the brand icon
changes:

    python3 scripts/gen-notification-icons.py

Outputs (committed alongside the other public/ icons):
  public/notification-icon.svg        source variant (blue tile + white mark)
  public/notification-icon-192x192.png  notification `icon` (avatar, >=3x DPR)
  public/notification-badge.svg       source variant (white mark on transparent)
  public/notification-badge-96x96.png   notification `badge` (status bar)

The blue background reuses the cloud's own linear gradient
(paint1_linear_3196_2101: #0C69D5 -> #06376F), so the avatar stays in the
logo's color family. The background is a full-bleed square (no baked corners):
Android circle-crops it into the "blue disc" look, while an unmasked render
still shows a clean tile with no white halo.
"""

from __future__ import annotations

import re
import subprocess
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
ICON_SVG = ROOT / "public" / "icon.svg"

BG_GRADIENT_ID = "paint1_linear_3196_2101"

ICON_TARGET = ROOT / "public" / "notification-icon-192x192.png"
BADGE_TARGET = ROOT / "public" / "notification-badge-96x96.png"


def split_body(source: str) -> str:
    """Return everything between the <svg ...> opening tag and its </svg>."""
    close = source.find(">")
    if close < 0 or not source.startswith("<svg"):
        raise SystemExit("icon.svg does not start with an <svg> tag")
    end = source.rfind("</svg>")
    if end < 0:
        raise SystemExit("icon.svg has no closing </svg>")
    return source[close + 1 : end]


def recolor_white(content: str) -> str:
    """Force every painted element white (drops per-path colors incl. fills)."""
    return re.sub(r'fill="[^"]*"', 'fill="#FFFFFF"', content)


def drop_shadow(content: str) -> str:
    """Remove the drop-shadow filter wrapper so white-on-blue stays clean."""
    return re.sub(r'\s*filter="url\(#[^"]+\)"', "", content)


def remove_plate_rect(content: str) -> str:
    """Strip the background <rect .../> so the badge gets a transparent canvas."""
    m = re.search(r"<rect\b[^>]*/>", content)
    if not m:
        raise SystemExit("no background <rect/> found in icon.svg")
    return content[: m.start()] + content[m.end() :]


def swap_plate_rect(content: str) -> str:
    """Replace the light plate with a full-bleed square in the cloud's blue gradient."""
    m = re.search(r"<rect\b[^>]*/>", content)
    if not m:
        raise SystemExit("no background <rect/> found in icon.svg")
    rect = f'<rect width="512" height="512" fill="url(#{BG_GRADIENT_ID})"/>'
    return content[: m.start()] + rect + content[m.end() :]


def main() -> None:
    source = ICON_SVG.read_text(encoding="utf-8")
    body = split_body(source)

    def assemble(body_content: str, *, include_plate: bool) -> str:
        if include_plate:
            body_content = swap_plate_rect(body_content)
        else:
            body_content = remove_plate_rect(body_content)
        return f'<svg xmlns="http://www.w3.org/2000/svg" width="512" height="512" viewBox="0 0 512 512">{body_content}</svg>'

    icon_svg = assemble(recolor_white(drop_shadow(body)), include_plate=True)
    badge_svg = assemble(recolor_white(drop_shadow(body)), include_plate=False)

    (ROOT / "public" / "notification-icon.svg").write_text(icon_svg, encoding="utf-8")
    (ROOT / "public" / "notification-badge.svg").write_text(badge_svg, encoding="utf-8")

    for src, out, size in (
        (ROOT / "public" / "notification-icon.svg", ICON_TARGET, 192),
        (ROOT / "public" / "notification-badge.svg", BADGE_TARGET, 96),
    ):
        subprocess.run(
            ["rsvg-convert", "-w", str(size), "-h", str(size), "-o", str(out), str(src)],
            check=True,
        )
        print(f"wrote {out.relative_to(ROOT)} ({size}x{size})")


if __name__ == "__main__":
    try:
        main()
    except (OSError, subprocess.CalledProcessError) as exc:
        print(f"failed: {exc}", file=sys.stderr)
        sys.exit(1)
