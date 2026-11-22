// The shapes the overlay works with. Screen positions are in the 1920 × 1080 reference frame the screens were drawn in;
// the stage scales it to the real screen (the game's pick screen scales the same way at 16:9).

import type { Stat } from "./shards";

export type Tier = "S" | "A" | "B" | "C";
export type Rarity = "銀" | "金" | "稜鏡";
export type Mode = "穩" | "均衡" | "貪";

export interface Rect { x: number; y: number; w: number; h: number }

/** One augment on offer: its id once the card is read, where the card and its reroll button sit. */
export interface Offer {
  id: number | null;          // null: the card is not recognised yet (or it is a shard)
  shard?: Stat | null;        // a 能力值加成 card: its stat (null: a shard of a stat not known); absent for augments
  card: Rect;
  reroll: Rect | null;        // null: no reroll button (none left)
}

/** What the game shows right now, as the app reads it (Rust in the app, a sample in the browser). */
export interface GameState {
  phase: "idle" | "champ-select" | "in-game" | "augment-pick";
  champion: string | null;    // Morellonomicon's champion id (DrMundo)
  round: Rarity | null;       // the rarity of this pick round
  offers: Offer[];
  shift: boolean;             // Shift held
  hover: number | null;       // the offer under the cursor
  shop?: Rect | null;         // the shop window while it is open (the reader finds it wherever it was dragged)
}

export interface Settings {
  styleKey: string | null;    // the picked play style; null: the champion's main style
  mode: Mode;
  useTiers: boolean;          // 英雄的強化分級
  useSynergy: boolean;        // 和已拿強化搭配 (no data yet)
  rerollBelow: Tier;          // tiers below this one may be marked for a reroll
  showHint: boolean;          // 怎麼玩、核心裝 (the right panel)
  onlyOnShift: boolean;       // the verdicts show only while Shift is held
  itemSets: boolean;          // write the champion's builds into the client as item sets (the shop's recommended tab)
  panelScale: number;         // the side panels' size (1: as drawn; they still shrink to fit beside four cards at 1)
  /** where the player dragged the side panels: [dx, dy] from their place beside the cards, in 1920 × 1080 pixels */
  panelOffsets: { left?: [number, number]; right?: [number, number]; toggle?: [number, number] };
}

export const DEFAULT_SETTINGS: Settings = {
  styleKey: null, mode: "均衡", useTiers: true, useSynergy: true,
  rerollBelow: "B", showHint: true, onlyOnShift: false, itemSets: true, panelScale: 1, panelOffsets: {},
};

// ---- the data built by tools/build_data.py from Morellonomicon ----
export interface AugmentInfo { name: string; rarity: Rarity | string; icon: string }
/** [augment id, tier, reason, when], in the order Morellonomicon ranks them for the style */
export type TierRow = [number, Tier, string, string];
export type Role = "tank" | "fighter" | "mage" | "marksman" | "assassin" | "support";
export type Damage = "phys" | "magic";
/** A play style: one of the champion's builds (Morellonomicon's item-builds), ranked by the closest tier list (tierKey).
 * The panel groups the styles by role and damage (styles.ts); core, third, boots and late are the build path it shows. */
export interface StyleData {
  key: string; name: string; role: Role; damage: Damage; core: CoreItem[]; tierKey: string; build?: Build;
  third?: CoreItem[];         // the third item's choices (at most three)
  late?: CoreItem[];          // the late items (at most three)
  boots?: CoreItem | null;    // the style's boots
  warn?: "few" | "weak" | ""; // few: few games behind it, weak: it loses; either way its result is not sure
}
/** The build's whole item list (ids), for the item set written into the client: core first, then the third item's
 * choices, the boots and the late items. */
export interface Build { core: number[]; third: number[]; boots: number | null; late: number[] }
/** 怎麼玩: one core ability, from the champion note's one-line play summary */
export interface PlayRow { key: string; title: string; detail: string; icon: string }
export interface CoreItem { id: number; name: string; icon: string }
export interface ChampionData {
  key: number | null; name: string; icon: string; styles: StyleData[];
  tiers: Record<string, TierRow[]>;   // main, and ad / ap / onhit where Morellonomicon ranks them apart
  play: PlayRow[];
}
export interface GameData {
  patch: string;
  source: string;
  augments: Record<string, AugmentInfo>;
  champions: Record<string, ChampionData>;
}
