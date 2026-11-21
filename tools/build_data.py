#!/usr/bin/env python3
"""Build the overlay's game data from the Morellonomicon repo (a sibling folder, or --from).

    python3 -I tools/build_data.py [--from ../Morellonomicon]

Reads Morellonomicon's `_data/augment-tiers.json` (each champion's augment tiers and reasons, per play style) and its
augment and champion notes (name, rarity, icon; the champion's numeric key for the client's champion ids), and writes
`src/data/game-data.json`. Augment win rates never leave Morellonomicon: of each tier row only the tier, the reason and the
row's order are kept. Standard library only.
"""
import argparse
import json
import re
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
OUT = ROOT / "src" / "data" / "game-data.json"
TIERS = "SABC"


def frontmatter(path):
    """The flat `key: value` lines between the first two `---` of a note, values read as JSON where they parse."""
    text = path.read_text(encoding="utf-8")
    m = re.match(r"---\n(.*?)\n---", text, re.S)
    out = {}
    for line in (m.group(1).splitlines() if m else []):
        k, sep, v = line.partition(":")
        if not sep or not re.fullmatch(r"[a-z_]+", k):
            continue
        v = v.strip()
        try:
            out[k] = json.loads(v)
        except ValueError:
            out[k] = v
    return out


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--from", dest="src", default=str(ROOT.parent / "Morellonomicon"))
    args = ap.parse_args()
    mn = Path(args.src)
    tiers_path = mn / "_data" / "augment-tiers.json"
    if not tiers_path.exists():
        print(f"no {tiers_path}: clone Morellonomicon next to this repo or pass --from", file=sys.stderr)
        return 1
    data = json.loads(tiers_path.read_text(encoding="utf-8"))

    augments = {}
    for p in (mn / "強化").glob("*.md"):
        fm = frontmatter(p)
        if str(fm.get("id", "")).isdigit():
            augments[str(fm["id"])] = {"name": fm.get("name", ""), "rarity": fm.get("rarity", ""), "icon": fm.get("icon", "")}
    champ_notes = {}
    for p in (mn / "英雄").glob("*.md"):
        fm = frontmatter(p)
        if fm.get("type") == "champion" and fm.get("id"):
            champ_notes[fm["id"]] = fm

    champions = {}
    for cid, styles in sorted(data["champions"].items()):
        note = champ_notes.get(cid, {})
        out_styles = []
        for key, st in styles.items():
            rows = [r for r in st["tiers"] if r.get("tier") in TIERS]   # already in the order Morellonomicon ranks them
            out_styles.append({"key": key, "name": st.get("name", key),
                               "tiers": [[r["id"], r["tier"], r.get("reason", ""), r.get("when", "")] for r in rows]})
        out_styles.sort(key=lambda s: s["key"] != "main")   # the main style first
        champions[cid] = {"key": note.get("key"), "name": note.get("name", cid), "icon": note.get("icon", ""), "styles": out_styles}

    out = {"patch": data.get("patch", ""), "source": data.get("source", ""), "augments": augments, "champions": champions}
    OUT.parent.mkdir(parents=True, exist_ok=True)
    OUT.write_text(json.dumps(out, ensure_ascii=False, separators=(",", ":")), encoding="utf-8")
    print(f"{OUT.relative_to(ROOT)}: patch {out['patch']}, {len(champions)} champions, {len(augments)} augments, "
          f"{OUT.stat().st_size // 1024} KB")
    return 0


if __name__ == "__main__":
    sys.exit(main())
