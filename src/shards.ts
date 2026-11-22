// The 能力值加成 cards: stat shards (魔法攻擊碎片 +15 魔攻, 不屈碎片 +10 物防 +10 魔防, …) the game offers between augment
// picks. They are no augments, so Morellonomicon has no tier for them; they are rated here from the play style's role and
// damage type: a stat the style's build is made of is 很合, one it can use 還行, one it never uses 不合. Never S: a shard is
// a few points of one stat.

import type { Damage, Role, Tier } from "./types";

export type Stat =
  | "ap" | "ad" | "as" | "crit" | "haste" | "magicpen" | "lethality" | "resist" | "armor" | "mr" | "hp" | "ms" | "vamp"
  | "tenacity";

/** Words in the card's name, most specific first (加速 alone would also be in 移動速度). */
const WORDS: [Stat, string[]][] = [
  ["magicpen", ["魔法穿透", "魔穿"]],
  ["lethality", ["物理穿透", "穿甲", "致命"]],
  ["ap", ["魔法攻擊", "魔攻"]],
  ["as", ["攻擊速度", "攻速"]],
  ["ad", ["物理攻擊", "物攻"]],
  ["crit", ["暴擊"]],
  ["ms", ["移動速度", "跑速", "移速"]],
  ["haste", ["技能加速", "加速"]],
  ["resist", ["不屈", "屈"]],
  ["armor", ["物理防禦", "物防", "護甲"]],
  ["mr", ["魔法防禦", "魔防", "魔抗"]],
  ["hp", ["生命", "血量"]],
  ["vamp", ["吸血"]],
  ["tenacity", ["韌性"]],
];

/** The shard's name as the game writes it, for the plate and the log. */
export const SHARD_NAME: Record<Stat, string> = {
  ap: "魔法攻擊碎片", ad: "物理攻擊碎片", as: "攻擊速度碎片", crit: "暴擊碎片", haste: "技能加速碎片", magicpen: "魔法穿透碎片",
  lethality: "物理穿透碎片", resist: "不屈碎片", armor: "物理防禦碎片", mr: "魔法防禦碎片", hp: "生命碎片", ms: "移動速度碎片",
  vamp: "吸血碎片", tenacity: "韌性碎片",
};

/**
 * What the OCR read, as a shard: undefined when it is no shard (an augment), null when it is a shard of a stat not known
 * here. A shard's name ends in 碎片; the OCR may miss a character of it, so 碎 or 片 at the end is enough.
 */
export function shardOf(read: string): Stat | null | undefined {
  const r = read.replace(/[\s\p{P}\p{S}a-zA-Z0-9]/gu, "");
  if (!r.includes("碎片") && !/[碎片]$/.test(r)) return undefined;
  return WORDS.find(([, words]) => words.some((w) => r.includes(w)))?.[0] ?? null;
}

const DEALS: Role[] = ["mage", "assassin", "marksman", "fighter"];

/** The shard's tier and a short why for a style of this role and damage type. */
export function shardTier(stat: Stat, role: Role, damage: Damage): [Tier, string] {
  const magic = damage === "magic", phys = damage === "phys";
  const r = (...roles: Role[]) => roles.includes(role);
  switch (stat) {
    case "ap":
      return magic && r("mage", "assassin", "support") ? ["A", "魔攻吃滿"] : magic ? ["B", "有魔攻加成"] : ["C", "用不到魔攻"];
    case "magicpen":
      return magic && r("mage", "assassin") ? ["A", "法術穿透多打傷害"] : magic ? ["B", "魔法傷害吃得到"] : ["C", "用不到魔穿"];
    case "ad":
      return phys && r("marksman", "assassin", "fighter") ? ["A", "物攻吃滿"] : phys ? ["B", "有物攻加成"] : ["C", "用不到物攻"];
    case "lethality":
      return phys && r("assassin", "marksman") ? ["A", "穿甲多打傷害"] : phys && DEALS.includes(role) ? ["B", "物理傷害吃得到"] : ["C", "用不到穿甲"];
    case "as":
      return r("marksman") ? ["A", "普攻手要攻速"] : phys && r("fighter") ? ["B", "普攻也打傷害"] : ["C", "不靠普攻"];
    case "crit":
      return phys && r("marksman") ? ["A", "暴擊流"] : ["C", "不走暴擊"];
    case "haste":
      return r("mage", "support") ? ["A", "技能流要加速"] : ["B", "技能多放幾次"];
    case "hp":
      return r("tank", "fighter") ? ["A", "前排要血"] : ["B", "多點血好活"];
    case "resist":
      return r("tank", "fighter") ? ["A", "雙抗都加"] : ["B", "雙抗好活"];
    case "armor":
      return r("tank") ? ["A", "坦克堆抗"] : r("fighter") ? ["B", "前排有用"] : ["C", "輸出位用處小"];
    case "mr":
      return r("tank") ? ["A", "坦克堆抗"] : r("fighter") ? ["B", "前排有用"] : ["C", "輸出位用處小"];
    case "ms":
      return ["B", "跑速大家都用"];
    case "vamp":
      return r("fighter") ? ["A", "邊打邊回"] : r("marksman", "assassin") ? ["B", "能回一點"] : ["C", "回不了多少"];
    case "tenacity":
      return r("tank", "fighter") ? ["B", "前排少被控"] : ["C", "用處小"];
  }
}
