#!/usr/bin/env python3
"""Draw the app icon (a violet orb in a lilac ring on the client's near-black) and write src-tauri/icons/.

    python3 -I tools/make_icons.py

Standard library only: PNGs by hand (zlib), the ICO holding the PNGs.
"""
import math
import struct
import zlib
from pathlib import Path

OUT = Path(__file__).resolve().parent.parent / "src-tauri" / "icons"


def pixel(x, y, n):
    """RGBA at (x, y) of an n × n icon, 4× supersampled."""
    acc = [0.0, 0.0, 0.0, 0.0]
    for sx in range(4):
        for sy in range(4):
            u = (x + (sx + 0.5) / 4) / n * 2 - 1
            v = (y + (sy + 0.5) / 4) / n * 2 - 1
            r = math.hypot(u, v)
            if r > 0.98:
                continue
            if r > 0.84:     # the lilac ring
                c = (217, 194, 255)
            elif r > 0.76:   # the dark gap
                c = (10, 14, 22)
            else:            # the orb, lit from the top left
                lit = max(0.0, 1 - math.hypot(u + 0.3, v + 0.35) / 1.1)
                c = (int(40 + 150 * lit), int(24 + 110 * lit), int(90 + 160 * lit))
            acc[0] += c[0]; acc[1] += c[1]; acc[2] += c[2]; acc[3] += 255
    k = 16
    return bytes(int(a / k) for a in acc)


def png(n):
    raw = b"".join(b"\x00" + b"".join(pixel(x, y, n) for x in range(n)) for y in range(n))
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
    sizes = {n: png(n) for n in (16, 32, 48, 128, 256)}
    (OUT / "32x32.png").write_bytes(sizes[32])
    (OUT / "128x128.png").write_bytes(sizes[128])
    (OUT / "icon.png").write_bytes(sizes[256])
    (OUT / "icon.ico").write_bytes(ico([(n, sizes[n]) for n in (16, 32, 48, 256)]))
    print("icons written to", OUT)


if __name__ == "__main__":
    main()
