import { describe, expect, it } from "vitest";
import { rankOffers, shortWhy } from "./rank";
import { DEFAULT_SETTINGS, type GameData } from "./types";

const data: GameData = {
  patch: "test", source: "test",
  augments: {
    "7": { name: "通用卡", rarity: "金", icon: "", general: ["B", "大家都能用"] },
    "8": { name: "停用卡", rarity: "金", icon: "", off: "目前停用" },
  },
  champions: {
    DrMundo: {
      key: 36, name: "蒙多醫生", icon: "", play: [],
      styles: [
        { key: "0", name: "坦克輸出", role: "fighter", damage: "magic", core: [], tierKey: "main" },
        { key: "1", name: "坦克", role: "tank", damage: "magic", core: [], tierKey: "tank" },
      ],
      tiers: {
        main: [[1, "S", "技能增傷，Q 吃得到", ""], [2, "S", "第二個 S", ""], [3, "B", "疊生命，但 Q 沒加成", ""],
               [4, "C", "Q 用不到", ""], [5, "D", "更不合", ""], [6, "A", "很合", ""]],
        tank: [[3, "S", "堆生命", ""], [1, "C", "坦克用不到", ""]],
      },
    },
  },
};
const offer = (id: number | null, canReroll = true) => ({ id, canReroll });
const S = DEFAULT_SETTINGS;

describe("rankOffers", () => {
  it("gives each card its verdict and why, frames the best, tags the 不合 one to reroll", () => {
    const v = rankOffers(data, "DrMundo", S, [offer(3), offer(1), offer(4)]);
    expect(v.map((x) => x.tier)).toEqual(["B", "S", "C"]);
    expect(v.map((x) => x.label)).toEqual(["可考慮", "頭獎！", "不合"]);
    expect(v.map((x) => x.best)).toEqual([false, true, false]);
    expect(v.map((x) => x.reroll)).toEqual([false, false, true]);
    expect(v.map((x) => x.tryReroll)).toEqual([true, false, false]);
    expect(v[1].why).toBe("技能增傷，Q 吃得到");
  });

  it("follows the picked play style", () => {
    const v = rankOffers(data, "DrMundo", { ...S, styleKey: "1" }, [offer(3), offer(1), offer(4)]);
    expect(v.map((x) => x.tier)).toEqual(["S", "C", null]);
    expect(v[0].best).toBe(true);
    expect(v[1].reroll).toBe(true);
    expect(v[2].label).toBe("未評分");
  });

  it("breaks a tie by Morellonomicon's order and frames one best only, while both keep their verdict", () => {
    const v = rankOffers(data, "DrMundo", S, [offer(2), offer(1), offer(3)]);
    expect(v.map((x) => x.best)).toEqual([false, true, false]);
    expect(v.map((x) => x.label)).toEqual(["頭獎！", "頭獎！", "可考慮"]);
  });

  it("tags every 不合 and 垃圾 card that can be rerolled, never 可考慮 or better", () => {
    const v = rankOffers(data, "DrMundo", S, [offer(4), offer(5), offer(6)]);
    expect(v.map((x) => x.label)).toEqual(["不合", "垃圾", "首選"]);
    expect(v.map((x) => x.reroll)).toEqual([true, true, false]);
    expect(v[2].best).toBe(true);
  });

  it("frames no card while bad ones can still be rerolled; the least bad once none can", () => {
    const v = rankOffers(data, "DrMundo", S, [offer(4), offer(5)]);
    expect(v.some((x) => x.best)).toBe(false);
    expect(v.map((x) => x.reroll)).toEqual([true, true]);
    const w = rankOffers(data, "DrMundo", S, [offer(5, false), offer(4, false)]);
    expect(w.map((x) => x.best)).toEqual([false, true]);
    expect(w.some((x) => x.reroll)).toBe(false);
  });

  it("never tags a reroll when the button is gone", () => {
    expect(rankOffers(data, "DrMundo", S, [offer(1), offer(4, false), offer(3, false)]).some((x) => x.reroll || x.tryReroll)).toBe(false);
  });

  it("rates a card the champion has no tier for by its verdict across all champions, marked 通用", () => {
    const v = rankOffers(data, "DrMundo", S, [offer(7), offer(4), offer(8)]);
    expect(v[0]).toMatchObject({ tier: "B", label: "可考慮", why: "通用：大家都能用", general: true, tryReroll: true });
    expect(v[0].best).toBe(true);
    expect(v[2]).toMatchObject({ tier: null, label: "未評分", why: "目前停用" });
    expect(rankOffers(data, "Nobody", S, [offer(7)])[0]).toMatchObject({ tier: "B", general: true });
    // the champion's own 可考慮 goes before a 通用 one
    expect(rankOffers(data, "DrMundo", S, [offer(7), offer(3)]).map((x) => x.best)).toEqual([false, true]);
  });

  it("says when a card or a champion is unknown, without guessing", () => {
    const v = rankOffers(data, "DrMundo", S, [offer(null), offer(1)]);
    expect(v[0]).toMatchObject({ tier: null, label: "未辨識", best: false, reroll: false });
    const u = rankOffers(data, "Nobody", S, [offer(1)]);
    expect(u[0]).toMatchObject({ tier: null, label: "未評分" });
  });
});

describe("shortWhy", () => {
  it("keeps the first phrase, cut to fit the plate", () => {
    expect(shortWhy("肉更肉，傷害少一點")).toBe("肉更肉");
    expect(shortWhy("技能接普攻，技能後普攻加攻速、傷害")).toBe("技能接普攻");
    expect(shortWhy("有短冷卻技能，技能傷害、急速大增")).toBe("有短冷卻技能");
    expect(shortWhy("全能吸血全能吸血全能吸血")).toBe("全能吸血全能吸血");
    expect(shortWhy("Q 打到就回血")).toBe("Q 打到就回血");
  });
});
