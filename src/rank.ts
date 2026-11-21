// Ranks the offered augments for the champion and play style. Tiers, verdicts and reasons only: no win rates exist here
// (tools/build_data.py keeps none). It marks the best card and, at most, one card worth rerolling; the player decides.

import type { GameData, Rarity, Settings, StyleData, Tier } from "./types";

export const TIER_ORDER: Tier[] = ["S", "A", "B", "C"];
export const VERDICT: Record<Tier, string> = { S: "最合", A: "很合", B: "還行", C: "不合" };

export interface Verdict {
  id: number | null;
  tier: Tier | null;          // null: not rated for this champion (or the card is not read)
  label: string;
  why: string;
  best: boolean;
  reroll: boolean;
}

export function styleOf(data: GameData, champion: string | null, key: string | null): StyleData | null {
  const champ = champion ? data.champions[champion] : undefined;
  if (!champ || champ.styles.length === 0) return null;
  return champ.styles.find((s) => s.key === key) ?? champ.styles[0];
}

const rankOf = (t: Tier) => TIER_ORDER.indexOf(t);

/**
 * One verdict per offer. Best: the highest tier, ties broken by Morellonomicon's order; none when nothing is above C.
 * Reroll: the weakest card below `settings.rerollBelow`, only when its reroll button is there and the reroll is not
 * being saved for the prismatic round.
 */
export function rankOffers(
  data: GameData, champion: string | null, settings: Settings,
  offers: { id: number | null; canReroll: boolean }[], round: Rarity | null = null,
): Verdict[] {
  const style = styleOf(data, champion, settings.styleKey);
  const row = new Map<number, { tier: Tier; why: string; order: number }>();
  style?.tiers.forEach(([id, tier, why], order) => row.set(id, { tier, why, order }));

  const out: Verdict[] = offers.map(({ id }) => {
    const r = id != null && settings.useTiers ? row.get(id) : undefined;
    if (id == null) return { id, tier: null, label: "未辨識", why: "還沒看到這張卡", best: false, reroll: false };
    if (!r) return { id, tier: null, label: "未評分", why: style ? "這隻英雄還沒有這張的分級" : "還沒有這隻英雄的資料", best: false, reroll: false };
    return { id, tier: r.tier, label: VERDICT[r.tier], why: r.why, best: false, reroll: false };
  });

  const key = (i: number) => {
    const v = out[i], id = v.id;
    return v.tier == null || id == null ? [99, 1e9] : [rankOf(v.tier), row.get(id)!.order];
  };
  const rated = out.map((_, i) => i).filter((i) => out[i].tier != null);
  if (rated.length === 0) return out;
  const sorted = [...rated].sort((a, b) => key(a)[0] - key(b)[0] || key(a)[1] - key(b)[1]);

  const top = sorted[0];
  if (out[top].tier !== "C") out[top].best = true;

  const saving = settings.saveRerollForPrismatic && round !== null && round !== "稜鏡";
  if (!saving) {
    const below = (t: Tier) => rankOf(t) > rankOf(settings.rerollBelow);
    const worst = [...sorted].reverse().find((i) => offers[i].canReroll && below(out[i].tier!) && !out[i].best);
    if (worst !== undefined) out[worst].reroll = true;
  }
  return out;
}
