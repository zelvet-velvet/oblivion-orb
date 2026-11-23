#!/usr/bin/env python3
"""Build the overlay's game data from the Morellonomicon repo (a sibling folder, or --from).

    python3 -I tools/build_data.py [--from ../Morellonomicon]

Reads Morellonomicon's `_data/augment-tiers.json` (each champion's augment tiers and reasons, per play style),
`_data/item-builds.json` (each play style's build: three core items, another core, boots, items four to six by need), and its augment, champion and item notes (names, icons; the champion's numeric key,
roles, damage, skills and its one-line play summary `soul`), and writes `src/data/game-data.json`. Augment win rates never leave Morellonomicon: of each tier row only the tier, the reason and the
row's order are kept. Morellonomicon's C (a champion's bottom 55 % of a rarity) is split here by the games, into the overlay's
B 可考慮 (about the champion's average or better), C 不合 (clearly worse) and D 垃圾 (far worse, or an augment clearly worse
on nearly every champion); only the letter leaves, never the number. Standard library only.
"""
import argparse
import json
import re
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
OUT = ROOT / "src" / "data" / "game-data.json"
TIERS = "SABC"
# Morellonomicon's C rows, by the row's value (the augment's result on the champion against the champion's own, a share):
FINE = -0.02        # above this, about as good as the champion's average: 可考慮 (B)
TRASH = -0.05       # at or below this, far worse: 垃圾 (D); in between 不合 (C)
TRASH_SHARE = 0.9   # an augment clearly worse (FINE or below) in this share of all lists is 垃圾 wherever it is clearly worse


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
    return [{"id": r[0], "tier": r[1], "value": r[2], "reason": reasons[r[4]], "when": r[5] if len(r) > 5 else ""} for r in style["tiers"]]


def grade(row, trash_ids):
    """The overlay's letter for a row: S, A and B stay; a C becomes B, C or D by its value (see FINE, TRASH)."""
    if row["tier"] != "C" or "value" not in row:
        return row["tier"]
    v = row["value"]
    if v > FINE:
        return "B"
    return "D" if v <= TRASH or row["id"] in trash_ids else "C"


def trash_augments(data):
    """The augments clearly worse (value FINE or below) in TRASH_SHARE of every champion's lists, or more."""
    seen, bad = {}, {}
    for styles in data["champions"].values():
        for st in styles.values():
            for r in tier_rows(data, st):
                if "value" in r:
                    seen[r["id"]] = seen.get(r["id"], 0) + 1
                    bad[r["id"]] = bad.get(r["id"], 0) + (r["value"] <= FINE)
    return {i for i, n in seen.items() if n >= 50 and bad[i] / n >= TRASH_SHARE}


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

    trash = trash_augments(data)
    champions = {}
    for cid, styles in sorted(data["champions"].items()):
        note = champ_notes.get(cid, {})
        roles = note.get("roles", []) or []
        first_role = roles[0] if roles else ""
        ver = dd_version(note.get("icon", ""))
        b = (builds.get(cid) or {}).get("styles") or []
        item = lambda i: {"id": i, "name": item_names.get(i, ""), "icon": f"https://ddragon.leagueoflegends.com/cdn/{ver}/img/item/{i}.png" if ver else ""}
        tiers = {key: [[r["id"], grade(r, trash), r.get("reason", ""), r.get("when", "")] for r in tier_rows(data, st) if r.get("tier") in TIERS]
                 for key, st in styles.items()}   # each list already in the order Morellonomicon ranks them

        def build_damage(st):
            """A style is a role and damage (Morellonomicon's build_tiers.py): "AP 刺客", "AD 戰士"; 坦克 and 輔助 take their core's."""
            n = st.get("name", "")
            if n.startswith("AP"):
                return "magic"
            if n.startswith("AD"):
                return "phys"
            tags = [t for c in st.get("core", []) for t in item_tags.get(c["id"], [])]
            ap, ad = tags.count("SpellDamage"), tags.count("Damage")
            return "magic" if ap > ad else "phys" if ad > ap else damage_of(note, "main")

        def build_role(st, dmg):
            n = st.get("name", "")
            for word, role in (("坦克", "tank"), ("輔助", "support"), ("刺客", "assassin"), ("射手", "marksman"), ("法師", "mage"),
                               ("戰士", "fighter"), ("暴擊", "marksman")):
                if word in n:
                    return role
            if "特效" in n:   # AP 特效 (Gwen) fights like a mage, AD 特效 (Master Yi) like a marksman
                return "mage" if dmg == "magic" else "marksman"
            return ROLE.get(first_role, "fighter")

        out_styles = []
        if b:   # the play styles are the champion's builds, a role and damage each, most played first; each ranks augments by its
            # own tier list (Morellonomicon keys one per style), else the most played list of its role and damage, else its damage's
            listed = [(x.get("name"), build_damage(x), build_role(x, build_damage(x))) for x in b if x.get("name") in tiers]
            ids_of = lambda rows: [r["id"] for r in rows or [] if isinstance(r, dict) and r.get("id")]
            for k, st in enumerate(b):
                dmg = build_damage(st)
                role = build_role(st, dmg)
                close = "ap" if dmg == "magic" else "ad"
                guard = {"tank", "support"}   # a damage style takes a damage style's list before a tank's
                same = (next((n for n, d, r in listed if d == dmg and r == role), None)
                        or next((n for n, d, r in listed if d == dmg and (r in guard) == (role in guard)), None)
                        or next((n for n, d, _ in listed if d == dmg), None))
                tk = (st.get("name") if st.get("name") in tiers else same if same else close if close in tiers
                      else "main" if "main" in tiers else next(iter(tiers)))
                alt = (st.get("alts") or [[]])[0]
                # the whole build, for the item set written into the client (the shop's recommended tab): ids only
                full = {"core": ids_of(st.get("core")), "alt": ids_of(alt), "boots": (st.get("boots") or {}).get("id"),
                        "late": ids_of(st.get("late"))}
                # items four to six with what each adds (輸出, 生存 …) or when to buy it (敵方回血多時)
                late = [{**item(o["id"]), "need": o.get("need", ""), "when": o.get("when", "")} for o in st.get("late") or []]
                out_styles.append({"key": str(k), "name": st.get("name", ""), "role": role, "damage": dmg, "tierKey": tk, "build": full,
                                   "core": [item(i) for i in full["core"]], "boots": item(full["boots"]) if full["boots"] else None,
                                   "late": late, "share": st.get("share", 0),
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
