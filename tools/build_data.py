#!/usr/bin/env python3
"""Build the overlay's game data from the Morellonomicon repo (a sibling folder, or --from).

    python3 -I tools/build_data.py [--from ../Morellonomicon]

Reads Morellonomicon's `_data/augment-tiers.json` (each champion's augment tiers and reasons, per play style),
`_data/item-builds.json` (core items), and its augment, champion and item notes (names, icons; the champion's numeric key,
roles, damage, skills and its one-line play summary `soul`), and writes `src/data/game-data.json`. Augment win rates never leave Morellonomicon: of each tier row only the tier, the reason and the
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
    item_names = {}
    for p in (mn / "道具").glob("*.md"):
        fm = frontmatter(p)
        if str(fm.get("id", "")).isdigit():
            item_names[int(fm["id"])] = fm.get("name", "")
    builds = json.loads((mn / "_data" / "item-builds.json").read_text(encoding="utf-8")).get("champions", {})
    champ_notes = {}
    for p in (mn / "英雄").glob("*.md"):
        fm = frontmatter(p)
        if fm.get("type") == "champion" and fm.get("id"):
            champ_notes[fm["id"]] = fm

    def dd_version(icon):
        m = re.search(r"/cdn/([0-9.]+)/", icon or "")
        return m.group(1) if m else ""

    def play_rows(note):
        """The note's `soul` ("Q 遠遠丟刀消耗，越肉越痛；R 回大量血加速，站著不怕打。") as rows: key, title, detail, icon."""
        icons = {sk.get("key"): sk.get("icon", "") for sk in note.get("skills", []) if isinstance(sk, dict)}
        rows = []
        for part in re.split(r"[；;]", str(note.get("soul", ""))):
            part = part.strip().rstrip("。")
            m = re.match(r"([PQWER])\s*(.+)", part)
            if not m:
                continue
            key, text = m.groups()
            title, _, detail = text.partition("，")
            rows.append({"key": key, "title": title, "detail": detail, "icon": icons.get(key, "")})
        return rows

    def damage_of(note, key):
        if key == "ap":
            return "magic"
        if key in ("ad", "onhit"):
            return "phys"
        kinds = [d for sk in note.get("skills", []) if isinstance(sk, dict) for d in sk.get("damage", [])]
        if note.get("damage_type") == "物理" or (kinds and kinds.count("物理") > kinds.count("魔法")):
            return "phys"
        return "magic"

    ROLE = {"坦克": "tank", "戰士": "fighter", "法師": "mage", "射手": "marksman", "刺客": "assassin", "輔助": "support"}

    champions = {}
    for cid, styles in sorted(data["champions"].items()):
        note = champ_notes.get(cid, {})
        roles = note.get("roles", []) or []
        first_role = roles[0] if roles else ""
        ver = dd_version(note.get("icon", ""))
        b = (builds.get(cid) or {}).get("styles") or []

        def core_for(key):
            """The build that matches the augment style: an AP style takes the build named for magic (法), an AD or on-hit
            style one that is not; otherwise the first build. Its core items, then its first third item."""
            if not b:
                return []
            magic = [s for s in b if "法" in s.get("name", "")]
            other = [s for s in b if "法" not in s.get("name", "")]
            pick = (magic or b)[0] if key == "ap" else (other or b)[0] if key in ("ad", "onhit") else b[0]
            ids = ([c["id"] for c in pick.get("core", [])] + [c["id"] for c in pick.get("third", [])[:1]])[:3]
            return [{"id": i, "name": item_names.get(i, ""), "icon": f"https://ddragon.leagueoflegends.com/cdn/{ver}/img/item/{i}.png" if ver else ""}
                    for i in ids]
        out_styles = []
        for key, st in styles.items():
            rows = [r for r in st["tiers"] if r.get("tier") in TIERS]   # already in the order Morellonomicon ranks them
            role = "mage" if key == "ap" else ROLE.get(first_role, "fighter")
            name = first_role if key == "main" and first_role else st.get("name", key)
            out_styles.append({"key": key, "name": name, "role": role, "damage": damage_of(note, key), "core": core_for(key),
                               "tiers": [[r["id"], r["tier"], r.get("reason", ""), r.get("when", "")] for r in rows]})
        out_styles.sort(key=lambda s: s["key"] != "main")   # the main style first
        champions[cid] = {"key": note.get("key"), "name": note.get("name", cid), "icon": note.get("icon", ""), "styles": out_styles,
                          "play": play_rows(note)}

    out = {"patch": data.get("patch", ""), "source": data.get("source", ""), "augments": augments, "champions": champions}
    OUT.parent.mkdir(parents=True, exist_ok=True)
    OUT.write_text(json.dumps(out, ensure_ascii=False, separators=(",", ":")), encoding="utf-8")
    print(f"{OUT.relative_to(ROOT)}: patch {out['patch']}, {len(champions)} champions, {len(augments)} augments, "
          f"{OUT.stat().st_size // 1024} KB")
    return 0


if __name__ == "__main__":
    sys.exit(main())
