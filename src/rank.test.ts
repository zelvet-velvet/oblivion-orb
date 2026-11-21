import { describe, expect, it } from "vitest";
import { rankOffers } from "./rank";
import { DEFAULT_SETTINGS, type GameData } from "./types";

const data: GameData = {
  patch: "test", source: "test", augments: {},
  champions: {
    DrMundo: {
      key: 36, name: "蒙多醫生", icon: "", styles: [
        { key: "main", name: "主流", tiers: [[1, "S", "技能增傷，Q 吃得到", ""], [2, "S", "第二個 S", ""], [3, "B", "疊生命，但 Q 沒加成", ""],
          [4, "C", "Q 用不到", ""], [5, "C", "更不合", ""], [6, "A", "很合", ""]] },
        { key: "tank", name: "坦克", tiers: [[3, "S", "堆生命", ""], [1, "C", "坦克用不到", ""]] },
      ],
    },
  },
};
const offer = (id: number | null, canReroll = true) => ({ id, canReroll });
const S = DEFAULT_SETTINGS;

describe("rankOffers", () => {
  it("marks the best and the card to reroll, with the verdict and why", () => {
    const v = rankOffers(data, "DrMundo", S, [offer(3), offer(1), offer(4)]);
    expect(v.map((x) => x.tier)).toEqual(["B", "S", "C"]);
    expect(v.map((x) => x.label)).toEqual(["還行", "最合", "不合"]);
    expect(v.map((x) => x.best)).toEqual([false, true, false]);
    expect(v.map((x) => x.reroll)).toEqual([false, false, true]);
    expect(v[1].why).toBe("技能增傷，Q 吃得到");
  });

  it("follows the picked play style", () => {
    const v = rankOffers(data, "DrMundo", { ...S, styleKey: "tank" }, [offer(3), offer(1), offer(4)]);
    expect(v.map((x) => x.tier)).toEqual(["S", "C", null]);
    expect(v[0].best).toBe(true);
    expect(v[1].reroll).toBe(true);
    expect(v[2].label).toBe("未評分");
  });

  it("breaks a tie by Morellonomicon's order and marks one best only", () => {
    const v = rankOffers(data, "DrMundo", S, [offer(2), offer(1), offer(3)]);
    expect(v.map((x) => x.best)).toEqual([false, true, false]);
  });

  it("marks one reroll at most, the weakest", () => {
    const v = rankOffers(data, "DrMundo", S, [offer(4), offer(5), offer(6)]);
    expect(v.map((x) => x.reroll)).toEqual([false, true, false]);
    expect(v[2].best).toBe(true);
  });

  it("marks no best when everything is C, and still a reroll", () => {
    const v = rankOffers(data, "DrMundo", S, [offer(4), offer(5)]);
    expect(v.some((x) => x.best)).toBe(false);
    expect(v[1].reroll).toBe(true);
  });

  it("never marks a reroll when the button is gone, or when saving it for the prismatic round", () => {
    expect(rankOffers(data, "DrMundo", S, [offer(1), offer(4, false)]).some((x) => x.reroll)).toBe(false);
    const saving = { ...S, saveRerollForPrismatic: true };
    expect(rankOffers(data, "DrMundo", saving, [offer(1), offer(4)], "金").some((x) => x.reroll)).toBe(false);
    expect(rankOffers(data, "DrMundo", saving, [offer(1), offer(4)], "稜鏡")[1].reroll).toBe(true);
  });

  it("respects the reroll threshold", () => {
    const v = rankOffers(data, "DrMundo", { ...S, rerollBelow: "A" }, [offer(1), offer(3)]);
    expect(v[1].reroll).toBe(true);
    const w = rankOffers(data, "DrMundo", { ...S, rerollBelow: "C" }, [offer(1), offer(4)]);
    expect(w.some((x) => x.reroll)).toBe(false);
  });

  it("says when a card or a champion is unknown, without guessing", () => {
    const v = rankOffers(data, "DrMundo", S, [offer(null), offer(1)]);
    expect(v[0]).toMatchObject({ tier: null, label: "未辨識", best: false, reroll: false });
    const u = rankOffers(data, "Nobody", S, [offer(1)]);
    expect(u[0]).toMatchObject({ tier: null, label: "未評分" });
  });
});
