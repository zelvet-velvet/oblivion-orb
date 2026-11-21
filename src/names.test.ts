import { describe, expect, it } from "vitest";
import { makeNameMatcher } from "./names";

const augs = {
  "1013": { name: "天界之身", rarity: "金", icon: "" }, "2132": { name: "術士果汁盒", rarity: "金", icon: "" },
  "3132": { name: "沉重王冠", rarity: "金", icon: "" }, "1404": { name: "能力值！", rarity: "銀", icon: "" },
  "2083": { name: "牙仙", rarity: "金", icon: "" }, "1308": { name: "火狐", rarity: "銀", icon: "" },
};
const match = makeNameMatcher(augs);

describe("makeNameMatcher", () => {
  it("matches what Windows' OCR reads, spaces and punctuation aside", () => {
    expect(match("天 界 之 身")).toBe(1013);
    expect(match("術士果汁盒")).toBe(2132);
    expect(match("能力值!")).toBe(1404);
  });
  it("forgives a misread character on a longer name", () => {
    expect(match("術士杲汁盒")).toBe(2132);
    expect(match("沉重王寇")).toBe(3132);
  });
  it("never guesses: nothing for noise, an empty read or a short name with a wrong character", () => {
    expect(match("")).toBeNull();
    expect(match("選擇一個強化")).toBeNull();
    expect(match("牙山")).toBe(2083);
    expect(match("水狐狸")).toBeNull();
  });
});
