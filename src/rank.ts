// Ranks the offered augments for the champion and play style. Tiers, verdicts and reasons only: no win rates exist here
// (tools/build_data.py keeps none). Each card gets its own verdict, so several can share one (two 首選, three 垃圾); it frames the
// best card and tags every 不合 and 垃圾 card that can still be rerolled. The player decides.

import { SHARD_NAME, shardTier, type Stat } from "./shards";
import type { GameData, Settings, StyleData, Tier } from "./types";

export const TIER_ORDER: Tier[] = ["S", "A", "B", "C", "D"];
/** S a game changer for this champion; A a pick to take; B fine, take it or reroll; C a poor fit; D trash */
export const VERDICT: Record<Tier, string> = { S: "頭獎！", A: "首選", B: "可考慮", C: "不合", D: "垃圾" };
/** The verdicts that ask for a reroll. */
const BAD: Tier[] = ["C", "D"];

export interface Verdict {
  id: number | null;
  name?: string;              // a shard's name (augments are named by their id)
  tier: Tier | null;          // null: not rated for this champion (or the card is not read)
  label: string;
  why: string;
  best: boolean;
  general?: boolean;          // the verdict across all champions (通用): the champion has no tier for this card
  reroll: boolean;            // 不合 or 垃圾 with its reroll button there: 建議重骰
  tryReroll: boolean;         // 可考慮 with its reroll button there: 問朋友 or 沒興趣 (設定), the player's call
}

export function styleOf(data: GameData, champion: string | null, key: string | null): StyleData | null {
  const champ = champion ? data.champions[champion] : undefined;
  if (!champ || champ.styles.length === 0) return null;
  return champ.styles.find((s) => s.key === key) ?? champ.styles[0];
}

const rankOf = (t: Tier) => TIER_ORDER.indexOf(t);

/** A reason short enough for the card's plate: its first phrase, at most `max` characters. The full reason stays for hover. */
export function shortWhy(why: string, max = 8): string {
  const first = why.split(/[，,；;：:。]/)[0].trim();
  return [...first].length <= max ? first : [...first].slice(0, max).join("");
}

/**
 * One verdict per offer. Best (the frame): the highest tier, ties broken by Morellonomicon's order (the offers share a
 * rarity, so the order compares them); when every card is 不合 or 垃圾 only once no card can be rerolled any more, as the
 * pick to make anyway. Reroll: every 不合 and 垃圾 card whose reroll button is there; 頭獎！, 首選 and 可考慮 are the player's
 * call, though a 可考慮 card gets a softer tag (問朋友 or 沒興趣, by the 有朋友 / 沒朋友qq setting). A reroll left unused is lost at the end of the round, so there is no reason to keep one.
 */
export function rankOffers(
  data: GameData, champion: string | null, settings: Settings,
  offers: { id: number | null; canReroll: boolean; shard?: Stat | null }[],
): Verdict[] {
  const style = styleOf(data, champion, settings.styleKey);
  const row = new Map<number, { tier: Tier; why: string; order: number }>();
  const champ = champion ? data.champions[champion] : undefined;
  (style && champ ? champ.tiers[style.tierKey] ?? [] : []).forEach(([id, tier, why], order) => row.set(id, { tier, why, order }));

  const out: Verdict[] = offers.map(({ id, shard }) => {
    if (shard !== undefined) {   // a 能力值加成 card: rated from the style's role and damage, not from Morellonomicon
      const name = shard ? SHARD_NAME[shard] : "能力值碎片";
      if (!shard) return { id, name, tier: null, label: "未評分", why: "還沒有這種碎片的分級", best: false, reroll: false, tryReroll: false };
      if (!style) return { id, name, tier: null, label: "未評分", why: "還沒有這隻英雄的資料", best: false, reroll: false, tryReroll: false };
      const [tier, why] = shardTier(shard, style.role, style.damage);
      return { id, name, tier, label: VERDICT[tier], why, best: false, reroll: false, tryReroll: false };
    }
    const r = id != null && settings.useTiers ? row.get(id) : undefined;
    if (id == null) return { id, tier: null, label: "未辨識", why: "還沒看到這張卡", best: false, reroll: false, tryReroll: false };
    if (!r) {   // the champion has no tier for it (never offered to it, or the champion is not known yet): the verdict across all
      const g = settings.useTiers ? data.augments[String(id)]?.general : undefined;
      if (g) return { id, tier: g[0], label: VERDICT[g[0]], why: `通用：${g[1] || "各英雄綜合"}`, general: true, best: false, reroll: false, tryReroll: false };
      const off = data.augments[String(id)]?.off;
      return { id, tier: null, label: "未評分", why: off ?? (style ? "這隻英雄還沒有這張的分級" : "還沒有這隻英雄的資料"), best: false, reroll: false, tryReroll: false };
    }
    return { id, tier: r.tier, label: VERDICT[r.tier], why: r.why, best: false, reroll: false, tryReroll: false };
  });

  const key = (i: number) => {
    const v = out[i], id = v.id;
    if (v.tier == null) return [99, 1e9];
    // shards and 通用 cards: after the champion's own rows of the same tier, ties to the leftmost
    return [rankOf(v.tier), id == null || v.general ? 1e6 + i : row.get(id)!.order];
  };
  const rated = out.map((_, i) => i).filter((i) => out[i].tier != null);
  if (rated.length === 0) return out;
  const sorted = [...rated].sort((a, b) => key(a)[0] - key(b)[0] || key(a)[1] - key(b)[1]);

  for (const i of rated) {
    if (!offers[i].canReroll) continue;
    if (BAD.includes(out[i].tier!)) out[i].reroll = true;
    else if (out[i].tier === "B") out[i].tryReroll = true;
  }
  const top = sorted[0];
  if (!BAD.includes(out[top].tier!) || !out.some((v) => v.reroll)) out[top].best = true;
  return out;
}
