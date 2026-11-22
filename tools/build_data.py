#!/usr/bin/env python3
"""Build the overlay's game data from the Morellonomicon repo (a sibling folder, or --from).

    python3 -I tools/build_data.py [--from ../Morellonomicon]

Reads Morellonomicon's `_data/augment-tiers.json` (each champion's augment tiers and reasons, per play style),
`_data/item-builds.json` (core items, and each build's whole item list for the client's item sets), and its augment, champion and item notes (names, icons; the champion's numeric key,
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


def tier_rows(data, style):
    """A tier list's rows as dicts: Morellonomicon writes format 2 (each row [id, tier, value, score, reason index, when?], the
    reasons once in `reasons`); older files have dicts. Only the id, tier, reason and when are kept below."""
    if data.get("format", 1) < 2:
        return style["tiers"]
    reasons = data["reasons"]
    return [{"id": r[0], "tier": r[1], "reason": reasons[r[4]], "when": r[5] if len(r) > 5 else ""} for r in style["tiers"]]


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
    item_names, item_tags = {}, {}
    for p in (mn / "道具").glob("*.md"):
        fm = frontmatter(p)
        if str(fm.get("id", "")).isdigit():
            item_names[int(fm["id"])] = fm.get("name", "")
            item_tags[int(fm["id"])] = fm.get("tags", []) or []
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
        item = lambda i: {"id": i, "name": item_names.get(i, ""), "icon": f"https://ddragon.leagueoflegends.com/cdn/{ver}/img/item/{i}.png" if ver else ""}
        tiers = {key: [[r["id"], r["tier"], r.get("reason", ""), r.get("when", "")] for r in tier_rows(data, st) if r.get("tier") in TIERS]
                 for key, st in styles.items()}   # each list already in the order Morellonomicon ranks them

        def build_damage(st):
            n = st.get("name", "").replace("魔法彎刀", "")   # the item's name, not a damage type
            if "AP" in n or "法" in n:
                return "magic"
            if "AD" in n or "暴擊" in n or "穿甲" in n:
                return "phys"
            tags = [t for c in st.get("core", []) for t in item_tags.get(c["id"], [])]
            ap, ad = tags.count("SpellDamage"), tags.count("Damage")
            return "magic" if ap > ad else "phys" if ad > ap else damage_of(note, "main")

        def build_role(st, dmg):
            n = st.get("name", "")
            # a hybrid style's noun is its last word (坦克輔助 is a support, 法術戰士 a fighter): those first
            for words, role in ((("坦克輸出", "法術戰士"), "fighter"), (("坦克輔助",), "support"), (("坦克",), "tank"), (("刺客",), "assassin"), (("射手",), "marksman"), (("輔助", "補師"), "support"),
                                (("法師", "法術"), "mage"), (("戰士", "輸出", "斬殺", "連招", "消耗", "穿甲"), "fighter")):
                if any(w in n for w in words):
                    return role
            if "特效" in n:
                return "mage" if dmg == "magic" else "marksman"
            return ROLE.get(first_role, "fighter")

        out_styles = []
        if b:   # the play styles are the champion's builds; each ranks augments by its own tier list (Morellonomicon keys one per
            # play style when our crawl splits the games by style), else the closest one (ap / ad / main, from resg.top's totals)
            # styles with a list of their own, most played first: (name, damage, role)
            listed = [(x.get("name"), build_damage(x), build_role(x, build_damage(x))) for x in b if x.get("name") in tiers]
            for k, st in enumerate(b):   # all of them: the app shows four as tiles and the rest under 更多玩法
                dmg = build_damage(st)
                close = "ap" if dmg == "magic" else "ad"
                # a rare style has no list of its own: the most played style with one of the same role and damage, else damage
                role = build_role(st, dmg)
                guard = {"tank", "support"}   # a damage style takes a damage style's list before a tank's
                same = (next((n for n, d, r in listed if d == dmg and r == role), None)
                        or next((n for n, d, r in listed if d == dmg and (r in guard) == (role in guard)), None)
                        or next((n for n, d, _ in listed if d == dmg), None))
                tk = (st.get("name") if st.get("name") in tiers else same if same else close if close in tiers
                      else "main" if "main" in tiers else next(iter(tiers)))
                ids = ([c["id"] for c in st.get("core", [])] + [c["id"] for c in st.get("third", [])[:1]])[:3]
                # the whole build, for the item set written into the client (the shop's recommended tab): ids only
                ids_of = lambda rows: [r["id"] for r in rows or [] if isinstance(r, dict) and r.get("id")]
                full = {"core": ids_of(st.get("core")), "third": ids_of(st.get("third")),
                        "boots": (st.get("boots") or {}).get("id"), "late": ids_of(st.get("late"))}
                boots = full["boots"]
                out_styles.append({"key": str(k), "name": st.get("name", ""), "role": build_role(st, dmg), "damage": dmg,
                                   "core": [item(i) for i in ids], "tierKey": tk, "build": full,
                                   "boots": item(boots) if boots else None,
                                   "warn": st.get("warn", "")})   # few: few games, weak: losing; the result is not sure
        else:   # no builds: the tier lists are the styles
            for key, st in styles.items():
                out_styles.append({"key": key, "name": first_role if key == "main" and first_role else st.get("name", key),
                                   "role": "mage" if key == "ap" else ROLE.get(first_role, "fighter"), "damage": damage_of(note, key),
                                   "core": [], "tierKey": key})
        champions[cid] = {"key": note.get("key"), "name": note.get("name", cid), "icon": note.get("icon", ""), "styles": out_styles,
                          "tiers": tiers, "play": play_rows(note)}

    out = {"patch": data.get("patch", ""), "source": data.get("source", ""), "augments": augments, "champions": champions}
    OUT.parent.mkdir(parents=True, exist_ok=True)
    OUT.write_text(json.dumps(out, ensure_ascii=False, separators=(",", ":")), encoding="utf-8")
    print(f"{OUT.relative_to(ROOT)}: patch {out['patch']}, {len(champions)} champions, {len(augments)} augments, "
          f"{OUT.stat().st_size // 1024} KB")
    return 0


if __name__ == "__main__":
    sys.exit(main())
