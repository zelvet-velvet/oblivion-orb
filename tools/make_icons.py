#!/usr/bin/env python3
"""Draw the app icon (遺忘寶珠 as 32 × 32 pixel art: a violet orb with an upright gold band, a tilted gold ring round it,
in a dark green swirl) and write src-tauri/icons/.

    python3 -I tools/make_icons.py

The art is drawn once at 32 × 32; the larger icons are it scaled by whole numbers (pixels stay square), 16 is it halved,
48 is it tripled and halved. Standard library only: PNGs by hand (zlib), the ICO holding the PNGs.
"""
import math
import struct
import zlib
from pathlib import Path

OUT = Path(__file__).resolve().parent.parent / "src-tauri" / "icons"

N = 32
C = (N - 1) / 2
OUTLINE = (14, 7, 24)
PURPLE = [(30, 14, 52), (48, 24, 82), (70, 38, 116), (100, 62, 160), (146, 104, 210), (200, 170, 245), (244, 236, 255)]
GOLD = [(84, 58, 24), (138, 98, 44), (196, 152, 82), (238, 202, 124), (255, 240, 190)]
GREEN = [(8, 40, 28), (16, 78, 50), (30, 128, 78), (62, 190, 112)]
RIM = (70, 170, 150)     # the glow, reflected on the orb's lower right
ORB_R = 10.2
RING = (14.6, 4.6, -26)  # the big ring: half axes and turn in degrees
BAND = (4.2, ORB_R - 0.4, 18)


def turn(x, y, deg):
    t = math.radians(deg)
    dx, dy = x - C, y - C
    return dx * math.cos(t) + dy * math.sin(t), -dx * math.sin(t) + dy * math.cos(t)


def on_ellipse(x, y, a, b, deg, width):
    """(on the line, front half, inside) for the ellipse a × b turned deg, `width` pixels thick, sampled 3 × 3."""
    hits = front = inside = 0
    for sx in (-0.33, 0, 0.33):
        for sy in (-0.33, 0, 0.33):
            xr, yr = turn(x + sx, y + sy, deg)
            r = math.hypot(xr / a, yr / b)
            if abs(math.hypot(xr, yr) * (1 - 1 / max(r, 1e-6))) < width / 2:
                hits += 1
                front += yr > 0
                inside += r < 1
    return hits >= 4, front >= 4, inside >= 4


def pixel(x, y):
    """The art's colour at (x, y), or None outside the icon."""
    d = math.hypot(x - C, y - C)
    col = None
    if d <= 15.6:   # the green swirl: spiral arms, a lit rim, dark right round the orb
        swirl = (math.degrees(math.atan2(y - C, x - C)) + d * 22) % 120
        g = 3 if swirl < 22 else 2 if swirl < 50 else 1
        if d > 14.8:
            g = 3 if swirl < 22 else 1
        if d < ORB_R + 2.2:
            g = 1 if swirl < 22 else 0
        col = GREEN[g]
    ring, front, inside = on_ellipse(x, y, *RING, 1.9)
    if ring and not front:   # the ring's back half, behind the orb
        col = GOLD[1] if inside else GOLD[0]
    if d <= ORB_R + 0.7:
        col = OUTLINE
    if d <= ORB_R - 0.3:     # the orb, lit from the upper left
        ld = math.hypot(x - C + 3.6, y - C + 3.8) / (ORB_R * 1.55)
        i = 6 if ld < 0.07 else 5 if ld < 0.16 else 4 if ld < 0.30 else 3 if ld < 0.48 else 2 if ld < 0.68 else 1
        col = PURPLE[i]
        if d > ORB_R - 1.6 and (x - C) + (y - C) > 6:
            col = RIM
        band, _, _ = on_ellipse(x, y, *BAND, 1.6)   # an upright gold band down the orb's near side, with studs
        if band and turn(x, y, BAND[2])[0] > 0:
            col = GOLD[3] if i >= 4 else GOLD[2] if i >= 2 else GOLD[1]
        xr, yr = turn(x, y, BAND[2])
        for sy in (-6.5, 0, 6.5):
            if math.hypot(xr - BAND[0] * math.sqrt(max(0, 1 - (sy / BAND[1]) ** 2)), yr - sy) < 0.9:
                col = GOLD[4]
    if ring and front:       # the ring's front half, over the orb: lit inside, darker on its outer edge
        col = GOLD[4] if inside and y < C else GOLD[3] if inside else GOLD[2]
        xr, yr = turn(x, y, RING[2])
        if math.hypot(xr / RING[0], yr / RING[1]) > 1.04:
            col = GOLD[1]
    return col


ART = [[pixel(x, y) for x in range(N)] for y in range(N)]


def rgba(c):
    return (*c, 255) if c else (0, 0, 0, 0)


def scaled(k):
    """The art k times larger, nearest neighbour: rows of RGBA tuples."""
    return [[rgba(ART[y // k][x // k]) for x in range(N * k)] for y in range(N * k)]


def halved(img):
    """Each 2 × 2 block averaged (colour weighted by alpha)."""
    out = []
    for y in range(0, len(img), 2):
        row = []
        for x in range(0, len(img[0]), 2):
            px = [img[y][x], img[y][x + 1], img[y + 1][x], img[y + 1][x + 1]]
            a = sum(p[3] for p in px)
            row.append(tuple(round(sum(p[i] * p[3] for p in px) / a) for i in range(3)) + (a // 4,) if a else (0, 0, 0, 0))
        out.append(row)
    return out


def png(img):
    n = len(img)
    raw = b"".join(b"\x00" + b"".join(bytes(p) for p in row) for row in img)
    chunk = lambda t, d: struct.pack(">I", len(d)) + t + d + struct.pack(">I", zlib.crc32(t + d) & 0xFFFFFFFF)
    return b"\x89PNG\r\n\x1a\n" + chunk(b"IHDR", struct.pack(">IIBBBBB", n, n, 8, 6, 0, 0, 0)) + chunk(b"IDAT", zlib.compress(raw, 9)) + chunk(b"IEND", b"")


def ico(images):
    head = struct.pack("<HHH", 0, 1, len(images))
    offset = 6 + 16 * len(images)
    entries, data = b"", b""
    for n, p in images:
        entries += struct.pack("<BBBBHHII", n % 256, n % 256, 0, 0, 1, 32, len(p), offset + len(data))
        data += p
    return head + entries + data


def main():
    OUT.mkdir(parents=True, exist_ok=True)
    sizes = {16: png(halved(scaled(1))), 32: png(scaled(1)), 48: png(halved(scaled(3))), 128: png(scaled(4)), 256: png(scaled(8))}
    (OUT / "32x32.png").write_bytes(sizes[32])
    (OUT / "128x128.png").write_bytes(sizes[128])
    (OUT / "icon.png").write_bytes(sizes[256])
    (OUT / "icon.ico").write_bytes(ico([(n, sizes[n]) for n in (16, 32, 48, 256)]))
    print("icons written to", OUT)


if __name__ == "__main__":
    main()
