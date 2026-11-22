import { describe, expect, it } from "vitest";
import { panelsOpen } from "./overlay";
import { groupStyles, groupWarn } from "./styles";
import type { GameState, StyleData } from "./types";

const base: GameState = { phase: "in-game", champion: "Ekko", round: null, offers: [], shift: false, hover: null };
const card = { id: 1, card: { x: 432, y: 193, w: 320, h: 526 }, reroll: null };

describe("panelsOpen", () => {
  it("in game: closed, open at a pick and in the shop", () => {
    expect(panelsOpen(base, { settingsOpen: false })).toBe(false);
    expect(panelsOpen({ ...base, phase: "augment-pick", offers: [card] }, { settingsOpen: false })).toBe(true);
    expect(panelsOpen({ ...base, shop: { x: 481, y: 133, w: 1047, h: 747 } }, { settingsOpen: false })).toBe(true);
  });
  it("the toggle wins until the game opens or closes something", () => {
    expect(panelsOpen(base, { settingsOpen: false, panels: "open" })).toBe(true);
    expect(panelsOpen({ ...base, phase: "augment-pick", offers: [card] }, { settingsOpen: false, panels: "closed" })).toBe(false);
  });
  it("always open in champ select, never outside a game", () => {
    expect(panelsOpen({ ...base, phase: "champ-select" }, { settingsOpen: false, panels: "closed" })).toBe(true);
    expect(panelsOpen({ ...base, phase: "idle" }, { settingsOpen: false, panels: "open" })).toBe(false);
  });
});

describe("groupStyles", () => {
  const sty = (key: string, role: StyleData["role"], damage: StyleData["damage"], warn: StyleData["warn"] = ""): StyleData =>
    ({ key, name: key, role, damage, core: [], tierKey: "main", warn });
  const all = [sty("海妖特效", "marksman", "phys"), sty("魔法彎刀戰士", "fighter", "phys"), sty("AD 特效", "marksman", "phys"),
               sty("AP 刺客", "assassin", "magic", "few"), sty("爆發法師", "mage", "magic", "weak")];
  it("one group per role and damage, in the order of its most played build; rare builds stay", () => {
    const g = groupStyles(all);
    expect(g.map((x) => x.label)).toEqual(["AD 射手", "AD 戰士", "AP 刺客", "AP 法師"]);
    expect(g[0].styles.map((s) => s.key)).toEqual(["海妖特效", "AD 特效"]);
  });
  it("a group is marked only when all its builds are unsure", () => {
    const g = groupStyles(all);
    expect(g.map(groupWarn)).toEqual(["", "", "few", "weak"]);
  });
});
