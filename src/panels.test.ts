import { describe, expect, it } from "vitest";
import { panelsOpen } from "./overlay";
import type { GameState } from "./types";

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
  it("in champ select by the setting (off by default), never outside a game", () => {
    expect(panelsOpen({ ...base, phase: "champ-select" }, { settingsOpen: false, panels: "closed" }, true)).toBe(true);
    expect(panelsOpen({ ...base, phase: "champ-select" }, { settingsOpen: false, panels: "open" })).toBe(false);
    expect(panelsOpen({ ...base, phase: "idle" }, { settingsOpen: false, panels: "open" })).toBe(false);
  });
});
