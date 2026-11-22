import { describe, expect, it } from "vitest";
import { rankOffers } from "./rank";
import { shardOf, shardTier } from "./shards";
import { DEFAULT_SETTINGS, type GameData } from "./types";

describe("shardOf", () => {
  it("reads the shard names the OCR returned in a real game", () => {
    expect(["技能加速碎片", "不屈碎片", "物理防禦碎片", "暴擊碎片", "魔法攻擊碎片", "魔法穿透碎片"].map(shardOf))
      .toEqual(["haste", "resist", "armor", "crit", "ap", "magicpen"]);
  });
  it("forgives a misread character", () => {
    expect(shardOf("h屈碎片")).toBe("resist");
    expect(shardOf("魔法攻擊碎")).toBe("ap");
  });
  it("tells augments and unknown shards apart", () => {
    expect(shardOf("寶石手套")).toBeUndefined();
    expect(shardOf("")).toBeUndefined();
    expect(shardOf("神秘碎片")).toBeNull();
  });
  it("does not take 移動速度 for 技能加速", () => {
    expect(shardOf("移動速度碎片")).toBe("ms");
  });
});

describe("shardTier", () => {
  it("follows the style's damage and role", () => {
    expect(shardTier("ap", "mage", "magic")[0]).toBe("A");
    expect(shardTier("ap", "marksman", "phys")[0]).toBe("C");
    expect(shardTier("resist", "tank", "magic")[0]).toBe("A");
    expect(shardTier("crit", "marksman", "phys")[0]).toBe("A");
  });
});

describe("rankOffers with shards", () => {
  const data: GameData = {
    patch: "t", source: "t", augments: {},
    champions: { Ekko: { key: 245, name: "艾克", icon: "", play: [], tiers: {},
      styles: [{ key: "0", name: "刺客", role: "assassin", damage: "magic", core: [], tierKey: "main" }] } },
  };
  it("marks the best shard and one to reroll", () => {
    const v = rankOffers(data, "Ekko", DEFAULT_SETTINGS, [
      { id: null, canReroll: true, shard: "armor" }, { id: null, canReroll: true, shard: "ap" }, { id: null, canReroll: true, shard: null },
    ]);
    expect(v.map((x) => x.tier)).toEqual(["C", "A", null]);
    expect(v.map((x) => x.best)).toEqual([false, true, false]);
    expect(v.map((x) => x.reroll)).toEqual([true, false, false]);
    expect(v[1].name).toBe("魔法攻擊碎片");
  });
});
