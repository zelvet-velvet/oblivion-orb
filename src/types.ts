// The shapes the overlay works with. Screen positions are in the 1920 × 1080 reference frame the screens were drawn in;
// the stage scales it to the real screen (the game's pick screen scales the same way at 16:9).

import type { Stat } from "./shards";

/** S 頭獎！, A 首選, B 可考慮, C 不合, D 垃圾 (tools/build_data.py splits Morellonomicon's C into B, C and D) */
export type Marks = "always" | "hover-hide" | "shift";
export type Tier = "S" | "A" | "B" | "C" | "D";
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
  showHint: boolean;          // 怎麼玩、核心裝 (the right panel)
  friends: boolean;           // 有朋友 / 沒朋友qq: the 可考慮 card's reroll tag reads 問朋友 or 沒興趣
  /** when the pick's marks (the best card's frame, the verdict plates, the reroll tags) show, all together: always; not
   * while the cursor is on any card (the game's tooltip opens there); or only while Shift is held */
  marks: Marks;
  itemSets: boolean;          // write the champion's builds into the client as item sets (the shop's recommended tab)
  panelScale: number;         // the side panels' size (1: as drawn; they still shrink to fit beside four cards at 1)
  /** where the player dragged the side panels: [dx, dy] from their place beside the cards, in 1920 × 1080 pixels */
  panelOffsets: { left?: [number, number]; right?: [number, number]; toggle?: [number, number]; settings?: [number, number] };
}

export const DEFAULT_SETTINGS: Settings = {
  styleKey: null, mode: "均衡", useTiers: true, useSynergy: true,
  showHint: true, friends: true, marks: "hover-hide", itemSets: true, panelScale: 1, panelOffsets: {},
};

// ---- the data built by tools/build_data.py from Morellonomicon ----
export interface AugmentInfo {
  name: string; rarity: Rarity | string; icon: string;
  /** the verdict across all champions and its most common reason: shown as 通用 where the champion has no tier for it */
  general?: [Tier, string];
  /** why it has no tier anywhere (目前停用, 沒有對局資料) */
  off?: string;
}
/** [augment id, tier, reason, when], in the order Morellonomicon ranks them for the style */
export type TierRow = [number, Tier, string, string];
export type Role = "tank" | "fighter" | "mage" | "marksman" | "assassin" | "support";
export type Damage = "phys" | "magic";
/** A play style: a role and damage (AP 刺客, AD 戰士, 坦克) with its build (Morellonomicon's item-builds), ranked by its own
 * tier list (tierKey). core, boots and late are the build path the right panel shows. */
export interface StyleData {
  key: string; name: string; role: Role; damage: Damage; core: CoreItem[]; tierKey: string; build?: Build;
  late?: LateItem[];          // items four to six, by need (at most five)
  boots?: CoreItem | null;    // the style's boots
  share?: number;             // how many of the champion's players play it (0-1)
  warn?: "few" | "weak" | ""; // few: few games behind it, weak: it loses; either way its result is not sure
}
/** The build's whole item list (ids), for the item set written into the client: the three core items, another core, the
 * boots and items four to six. */
export interface Build { core: number[]; alt?: number[]; boots: number | null; late: number[] }
/** 怎麼玩: one core ability, from the champion note's one-line play summary */
export interface PlayRow { key: string; title: string; detail: string; icon: string }
export interface CoreItem { id: number; name: string; icon: string }
/** An item four to six: what it adds (輸出, 生存, 穿透, 重創, 功能, 機動), or when to buy it (敵方回血多時) */
export interface LateItem extends CoreItem { need?: string; when?: string }
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
