import { describe, expect, it } from "vitest";
import { itemSets, SET_PREFIX } from "./itemsets";
import type { ChampionData } from "./types";

const st = (key: string, name: string, core: number[]) => ({
  key, name, role: "tank" as const, damage: "magic" as const, core: [], tierKey: "main",
  build: { core, third: [3065, core[0]], boots: 3111, late: [3109] },
});
const champ: ChampionData = { key: 12, name: "亞歷斯塔", icon: "", tiers: {}, play: [], styles: [st("0", "坦克", [3084, 3083]), st("1", "坦克輸出", [3084, 2502])] };

describe("itemSets", () => {
  it("one set per style, the chosen one first, ours by title and uid", () => {
    const sets = itemSets(champ, "1");
    expect(sets.map((s) => s.title)).toEqual([`${SET_PREFIX}亞歷斯塔 坦克輸出`, `${SET_PREFIX}亞歷斯塔 坦克`]);
    expect(sets.map((s) => s.sortrank)).toEqual([0, 1]);
    expect(sets[0].associatedChampions).toEqual([12]);
    expect(sets[0].uid).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-8[0-9a-f]{3}-[0-9a-f]{12}$/);
  });
  it("blocks in build order, no item twice", () => {
    const [s] = itemSets(champ, null);
    expect(s.blocks.map((b) => [b.type, b.items.map((i) => i.id)])).toEqual([
      ["核心裝（照順序做）", ["3084", "3083"]], ["第三件（擇一）", ["3065"]], ["鞋子", ["3111"]], ["後期（看局勢）", ["3109"]]]);
  });
  it("four sets at most: the chosen style and the next most played", () => {
    const many = { ...champ, styles: ["0", "1", "2", "3", "4", "5"].map((k) => st(k, `玩法${k}`, [3084, 3083])) };
    expect(itemSets(many, "5").map((s) => s.title.split(" ").pop())).toEqual(["玩法5", "玩法0", "玩法1", "玩法2"]);
  });
  it("nothing without a key or builds", () => {
    expect(itemSets({ ...champ, key: null }, null)).toEqual([]);
    expect(itemSets({ ...champ, styles: [] }, null)).toEqual([]);
  });
});
