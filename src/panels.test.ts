import { describe, expect, it } from "vitest";
import { panelsOpen, tileStyles } from "./overlay";
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

describe("tileStyles", () => {
  const sty = (key: string): StyleData => ({ key, name: key, role: "mage", damage: "magic", core: [], tierKey: "main" });
  const all = ["0", "1", "2", "3", "4", "5"].map(sty);
  it("the four most played; a chosen style from 更多玩法 takes the last tile", () => {
    expect(tileStyles(all, all[1]).map((s) => s.key)).toEqual(["0", "1", "2", "3"]);
    expect(tileStyles(all, all[5]).map((s) => s.key)).toEqual(["0", "1", "2", "5"]);
    expect(tileStyles(all.slice(0, 2), null).map((s) => s.key)).toEqual(["0", "1"]);
  });
});
