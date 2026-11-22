// The champion's builds as League client item sets: in champ select they are written into the client (through its own
// local API, by the app), so the in-game shop lists them in its item-set menu. One set per play style, the chosen style
// first. The app keeps only ours: every set titled "遺忘寶珠 · …" is replaced on each write, the player's own are kept.

import type { ChampionData } from "./types";

export const SET_PREFIX = "遺忘寶珠 · ";

/** One item set as the client stores it (the app adds the map). */
export interface ItemSet {
  title: string; type: "custom"; map: "any"; mode: "any"; sortrank: number; startedFrom: "blank"; uid: string;
  associatedChampions: number[]; associatedMaps: number[]; preferredItemSlots: never[];
  blocks: { type: string; items: { id: string; count: number }[]; showIfSummonerSpell: ""; hideIfSummonerSpell: "" }[];
}

const block = (type: string, ids: (number | null | undefined)[], seen: Set<number>) => {
  const items = ids.filter((i): i is number => i != null && !seen.has(i)).map((i) => (seen.add(i), { id: String(i), count: 1 }));
  return items.length ? [{ type, items, showIfSummonerSpell: "" as const, hideIfSummonerSpell: "" as const }] : [];
};

/** A uid shaped like the client's own (a UUID), the same for the same champion and place, never one of the player's. */
const uid = (key: number, n: number) => `0b11b10b-0000-4000-8000-${(key * 16 + n).toString(16).padStart(12, "0")}`;

/** The sets for this champion, the chosen style (styleKey, else the first) on top. None when it has no key or builds. */
export function itemSets(champ: ChampionData, styleKey: string | null): ItemSet[] {
  if (champ.key == null) return [];
  const styles = champ.styles.filter((s) => s.build && s.build.core.length);
  const chosen = styles.find((s) => s.key === styleKey) ?? styles[0];
  // the chosen style and the next three most played: the shop's item-set menu stays short
  const ordered = chosen ? [chosen, ...styles.filter((s) => s !== chosen)].slice(0, 4) : [];
  return ordered.map((st, rank) => {
    const b = st.build!, seen = new Set<number>();
    return {
      title: `${SET_PREFIX}${champ.name} ${st.name}`, type: "custom", map: "any", mode: "any", sortrank: rank,
      startedFrom: "blank", uid: uid(champ.key!, rank),
      associatedChampions: [champ.key!], associatedMaps: [], preferredItemSlots: [],
      blocks: [...block("核心裝（照順序做）", b.core, seen), ...block("鞋子", [b.boots], seen),
               ...block("第四到六件（依需要挑）", b.late, seen), ...block("另一種核心", b.alt ?? [], seen)],
    };
  });
}
