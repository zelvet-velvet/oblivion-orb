// Draws the overlay from the game state, the data and the settings, in the 1920 × 1080 frame the screens were drawn in
// (oblivion-orb-folio Spec/Screens.md: 主畫面, 懸停, Shift 重點, 邏輯設定). Everything anchors to the cards' positions, so
// whatever the reader finds, the marks follow. Everything is redrawn on each change; it is small.

import {
  DIM, EMBER_TXT, METAL, VERDICT_INK, WHY_INK, TEAL, GOLD,
  gear, hextechFrame, plate, plateGlow, rarityPlate, rerollTag, richApAd, roleIcon, dmgPill, tile, toggle,
} from "./art";
import { endDraw, FADE, FLIP, imageOk, loaded, motion } from "./motion";
import { rankOffers, shortWhy, styleOf, type Verdict } from "./rank";
import type { ChampionData, CoreItem, GameData, GameState, Mode, Offer, Settings, StyleData, Tier } from "./types";

export interface UiState {
  settingsOpen: boolean; test?: boolean; fullscreen?: boolean;
  moreOpen?: boolean;         // the 更多玩法 list
  /** the toggle button's choice in game: open or closed; null follows the game (open at a pick and in the shop) */
  panels?: "open" | "closed" | null;
}

/** In game, whether the side panels show: the player's choice, else open while a pick or the shop is open. */
export function panelsOpen(st: GameState, ui: UiState): boolean {
  if (st.phase === "champ-select") return true;
  if (st.phase !== "in-game" && st.phase !== "augment-pick") return false;
  return ui.panels ? ui.panels === "open" : autoOpen(st);
}
export const autoOpen = (st: GameState) => (st.phase === "augment-pick" && st.offers.length > 0) || !!st.shop;
/** redraw: called when an image the overlay waits for has come in */
export interface View { data: GameData; state: GameState; settings: Settings; ui: UiState; redraw?: () => void }
export type Action =
  | { type: "pick-style"; key: string } | { type: "mode"; mode: Mode }
  | { type: "open-settings" } | { type: "close-settings" } | { type: "setting"; key: keyof Settings; value: unknown }
  | { type: "open-more" } | { type: "close-more" };

/** A style whose result is not sure, in words (never a number): few games behind it, or it loses. */
export const WARN: Record<string, [string, string]> = {
  few: ["少見", "玩的人少，強弱還不準"], weak: ["偏弱", "照這樣出的人贏得比較少"],
};

const MODE_LINE: Record<Mode, string> = { 貪: "貪：上限高、要慢慢疊的往前", 均衡: "均衡：穩的和上限高的各半", 穩: "穩：先拿馬上有效的" };
const esc = (s: string) => s.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!);
const box = (x: number, y: number, w: number, h: number, cls = "", attrs = "", style = "") =>
  `<div class="abs ${cls}" style="left:${x}px;top:${y}px;width:${w}px;height:${h}px;${style}" ${attrs}>`;
/** A side panel w wide in `room` pixels: its scale (1, or less when four cards leave too little room) times the player's
 * 面板大小, and that style. A bigger panel may reach over the cards; the player can drag it aside. */
function fitIn(room: number, w: number, size = 1): [number, string] {
  const k = Math.max(0.5, Math.min(1, room / w)) * size;
  return [k, k !== 1 ? `transform:scale(${k.toFixed(3)});transform-origin:0 0` : ""];
}

/** The four styles shown as tiles: the most played, with the chosen one in the last tile when it is not among them. */
export function tileStyles(styles: StyleData[], chosen: StyleData | null): StyleData[] {
  const top = styles.slice(0, 4);
  if (chosen && !top.includes(chosen) && top.length === 4) top[3] = chosen;
  return top;
}
const warnTag = (st: StyleData) => st.warn && WARN[st.warn] ? `<span class="warn" title="${WARN[st.warn][1]}">${WARN[st.warn][0]}</span>` : "";

/** Where the cards are: the default pick layout when the reader has not sent any (champ select). */
const DEFAULT_CARDS = { left: 433, right: 1489, top: 193, bottom: 719 };
type Span = typeof DEFAULT_CARDS;
function cardSpan(offers: Offer[]): Span {
  if (!offers.length) return DEFAULT_CARDS;
  return { left: Math.min(...offers.map((o) => o.card.x)), right: Math.max(...offers.map((o) => o.card.x + o.card.w)),
           top: Math.min(...offers.map((o) => o.card.y)), bottom: Math.max(...offers.map((o) => o.card.y + o.card.h)) };
}

export function verdicts(v: View): Verdict[] {
  return rankOffers(v.data, v.state.champion, v.settings, v.state.offers.map((o) => ({ id: o.id, canReroll: o.reroll !== null, shard: o.shard })));
}

/** A slim tab on the screen's left edge in game, only an arrow: click to open or close the panels, drag to move it.
 * Half see-through until the cursor is on it, so it never draws the eye during play. */
function toggleButton(open: boolean, offset: [number, number] = [0, 0]): string {
  const W = 20, H = 56, X = offset[0], Y = 220 + offset[1];
  const arrow = open ? "M12 18 L7 28 L12 38" : "M8 18 L13 28 L8 38";
  return box(X, Y, W, H, "toggle", `data-drag="toggle" data-hit title="${open ? "收起" : "展開"}建議（可拖曳）"`, motion("toggle", "fade", FADE))
    + `<svg width="${W}" height="${H}"><path d="M0 0 H${W - 6} Q${W} 0 ${W} 6 V${H - 6} Q${W} ${H} ${W - 6} ${H} H0 Z" fill="#010A13" fill-opacity="0.55" stroke="${GOLD}" stroke-opacity="0.35"/>`
    + `<path d="${arrow}" fill="none" stroke="#C8AA6E" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg></div>`;
}

/** The panel's title row: drag it to move the panel, double-click it to put the panel back beside the cards. */
const dragHandle = (key: "left" | "right", w: number) =>
  `<div class="abs drag" style="left:0;top:0;width:${w}px;height:60px" data-drag="${key}" data-hit title="拖曳移動，按兩下回到原位"></div>`;

// ---- left: 玩法 (the choice) ----
function leftPanel(v: View, champ: ChampionData, span: Span): string {
  const style = styleOf(v.data, v.state.champion, v.settings.styleKey);
  const styles = tileStyles(champ.styles, style), rows = Math.ceil(styles.length / 2);   // four builds, two per row
  const more = champ.styles.length > 4;
  const W = 320, P = 14, TH = 128, GAP = 10;
  const [k, fit] = fitIn(span.left - 28, W, v.settings.panelScale), X = Math.round(span.left - 16 - W * k);
  const tilesH = rows * TH + (rows - 1) * GAP + (more ? GAP + 36 : 0);
  const H = 68 + tilesH + 10 + 20 + 16 + 26 + 40 + 20;
  const [dx, dy] = v.settings.panelOffsets.left ?? [0, 0];
  const Y = Math.max(k < 1 ? 200 : 344, Math.round((span.top + span.bottom) / 2 - H * k / 2)) + dy;
  const half = Math.floor((W - 2 * P - GAP) / 2);
  let s = box(X + dx, Y, W, H, "plate", "", fit + ";" + motion("left", "fade", FADE)) + plate(W, H) + dragHandle("left", W - P - 36 - 8)
    + `<div class="abs panel-title" style="left:${P}px">玩法</div>`
    + `<button class="abs gear" style="left:${W - P - 36}px;top:16px" data-act="open-settings" data-hit aria-label="建議邏輯">${plate(36, 36)}${gear(22)}</button>`;
  styles.forEach((st, k) => {
    const on = st.key === style?.key, auto = on && v.settings.styleKey == null;
    // a lone tile on its row (one style, or the third of three) spans the row
    const tw = styles.length === 1 || (k === styles.length - 1 && k % 2 === 0) ? W - 2 * P : half;
    const tx = P + (k % 2) * (half + GAP), ty = 68 + Math.floor(k / 2) * (TH + GAP);
    s += `<button class="abs tile${on ? " on" : ""}" style="left:${tx}px;top:${ty}px;width:${tw}px;height:${TH}px" data-act="pick-style" data-key="${esc(st.key)}" data-hit>`
      + plate(tw, TH, on ? TEAL : GOLD, on ? 0.9 : 0.65)
      + (auto ? `<span class="auto">自動</span>` : "") + warnTag(st)
      + `<span class="role">${roleIcon(st.role, 40, on ? "#F0E6D2" : DIM)}</span>`
      + `<span class="tile-name">${esc(st.name)}</span>${dmgPill(st.damage)}</button>`;
  });
  if (more) {   // the rest of the champion's styles, in a list
    const my = 68 + rows * TH + (rows - 1) * GAP + GAP;
    s += `<button class="abs more" style="left:${P}px;top:${my}px;width:${W - 2 * P}px;height:36px" data-act="open-more" data-hit>`
      + plate(W - 2 * P, 36, GOLD, 0.65) + `<span>更多玩法（全部 ${champ.styles.length} 種）</span></button>`;
  }
  s += `<div class="abs auto-line" style="left:${P}px;top:${68 + tilesH + 10}px;width:${W - 2 * P}px">依你選的強化和裝備自動選，點一下可改</div>`;
  const my = 68 + tilesH + 10 + 20 + 16, cw = Math.floor((W - 2 * P - 12) / 3);
  s += `<div class="abs label" style="left:${P}px;top:${my}px">我要</div>`;
  (["貪", "均衡", "穩"] as Mode[]).forEach((m, j) => {
    const on = v.settings.mode === m;
    s += `<button class="abs chip${on ? " on" : ""}" style="left:${P + j * (cw + 6)}px;top:${my + 26}px;width:${cw}px;height:40px" data-act="mode" data-mode="${m}" data-hit title="${MODE_LINE[m]}">`
      + plate(cw, 40, on ? TEAL : GOLD, on ? 0.9 : 0.65) + `<span>${m}</span></button>`;
  });
  return s + `</div>`;
}

// ---- right: the champion (the knowledge) ----
function rightPanel(champ: ChampionData, core: CoreItem[], span: Span, offset: [number, number] = [0, 0], size = 1): string {
  const W = 360, P = 24;
  const [k, fit] = fitIn(1920 - 12 - span.right - 16, W, size), X = span.right + 16;
  const playH = champ.play.length ? champ.play.length * 56 + (champ.play.length - 1) * 14 : 0;
  const H = 78 + (champ.play.length ? 30 + playH + 28 : 0) + (core.length ? 30 + 88 + 24 : 0) + 22 + 22;
  const Y = Math.round((span.top + span.bottom) / 2 - H * k / 2) + offset[1];
  let s = box(X + offset[0], Y, W, H, "plate", "", fit + ";" + motion("right", "fade", FADE)) + plate(W, H) + dragHandle("right", W) + `<div class="abs panel-title" style="left:${P}px">${esc(champ.name)}</div>`;
  let y = 78;
  if (champ.play.length) {
    s += `<div class="abs label" style="left:${P}px;top:${y}px">怎麼玩</div>`; y += 30;
    champ.play.forEach((r, k) => {
      s += `<div class="abs play" style="left:${P}px;top:${y}px;width:${W - 2 * P}px">`
        + (r.icon && imageOk(r.icon) ? `<span class="play-ic"><img src="${esc(r.icon)}" alt=""><b>${esc(r.key)}</b></span>` : `<span class="play-ic key">${esc(r.key)}</span>`)
        + `<span class="play-t">${esc(r.title)}</span><span class="play-d">${richApAd(r.detail)}</span></div>`;
      y += 56 + (k < champ.play.length - 1 ? 14 : 0);
    });
    s += `<div class="abs rule" style="left:${P}px;top:${y + 14}px;width:${W - 2 * P}px"></div>`;
    y += 28;
  }
  if (core.length) {
    s += `<div class="abs label" style="left:${P}px;top:${y}px">核心裝・鞋子</div>`; y += 30;
    const cw = Math.floor((W - 2 * P) / core.length);
    core.forEach((it, k) => {
      s += `<div class="abs core" style="left:${P + k * cw}px;top:${y}px;width:${cw}px">`
        + (it.icon && imageOk(it.icon) ? `<img src="${esc(it.icon)}" alt="">` : `<i class="core-empty"></i>`) + `<span>${esc(it.name)}</span></div>`;
    });
    y += 88 + 24;
  }
  s += `<div class="abs foot" style="left:${P}px;top:${y}px">按住 Shift 看重點</div>`;
  return s + `</div>`;
}

// ---- on the cards ----
function nameplate(o: Offer, vd: Verdict, anim: string, glow: string): string {
  // in the card's empty lower part, under the game's longest text (y 597 of a 526-tall card from 193)
  const PW = o.card.w - 60, PH = 92, X = o.card.x + 30, Y = o.card.y + Math.round(o.card.h * 0.768);
  if (vd.tier == null)
    return box(X, Y, PW, PH, "np unrated", "", anim) + `<div class="np-l">${vd.label}</div><div class="np-s">${esc(vd.why)}</div></div>`;
  const t = vd.tier as Tier, M = METAL[t];
  const why = shortWhy(vd.why);   // the reroll is said by the tag under its button
  return box(X - 22, Y - 22, PW + 44, PH + 44, "deco", "", glow) + plateGlow(t, PW, PH) + `</div>`
    + box(X, Y, PW, PH, "np", "", anim) + rarityPlate(t, PW, PH)
    + `<div class="np-group"><span class="np-letter" style="color:${M.ink}">${t}</span><span class="np-bar" style="background:${M.ink}"></span>`
    + `<span class="np-words"><span class="np-v" style="color:${VERDICT_INK[t]}">${vd.label}</span>`
    + `<span class="np-w" style="color:${vd.reroll ? EMBER_TXT : WHY_INK[t]}">${esc(why)}</span></span></div></div>`;
}

/** Over the cards, the band the game's tooltip never reaches: the hovered card's verdict and its full why. */
function banner(v: View, vd: Verdict): string {
  const champ = v.state.champion ? v.data.champions[v.state.champion] : undefined;
  const a = vd.id != null ? v.data.augments[String(vd.id)] : undefined;
  const W = 760, H = 132, X = 960 - W / 2, Y = 34, t = vd.tier, tx = t ? 100 : 28;
  const head = `${a?.name ?? vd.name ?? "這張卡"} · ${vd.label}${champ ? `，對${champ.name}` : ""}`;
  return box(X, Y, W, H, "plate banner", "", motion("banner", "fade", FADE)) + plate(W, H, t ? METAL[t].ink : DIM, 0.8)
    + (t ? `<div class="abs" style="left:24px;top:36px">${tile(t, 58)}</div>` : "")
    + `<div class="abs b-head" style="left:${tx}px;color:${t ? VERDICT_INK[t] : DIM}">${esc(head)}</div>`
    + `<div class="abs b-why" style="left:${tx}px;color:${t ? WHY_INK[t] : DIM}">${richApAd(vd.why)}</div>`
    + `<div class="abs b-foot">放開 Shift 收起</div></div>`;
}

/** 更多玩法: every style of the champion, most played first; a tap picks it (it takes the last tile) and closes the list. */
function moreList(champ: ChampionData, chosen: StyleData | null): string {
  const W = 560, RH = 52, P = 24, X = 960 - W / 2, Y = 120, n = champ.styles.length;
  const cols = n > 10 ? 2 : 1, rows = Math.ceil(n / cols), cw = Math.floor((W - 2 * P - (cols - 1) * 10) / cols);
  const H = 96 + rows * RH + 64;
  let s = `<div class="abs veil-all" data-act="close-more" data-hit></div>`
    + box(X, Y, W, H, "plate more-list", "", motion("more", "fade", FADE)) + plate(W, H)
    + `<div class="abs s-title" style="left:${P}px">更多玩法</div><div class="abs s-sub" style="left:${P}px">玩最多的在前，點一下改用</div>`
    + `<button class="abs s-close" data-act="close-more" data-hit aria-label="關閉">✕</button>`;
  champ.styles.forEach((st, i) => {
    const on = st === chosen, x = P + Math.floor(i / rows) * (cw + 10), y = 96 + (i % rows) * RH;
    s += `<button class="abs more-row${on ? " on" : ""}" style="left:${x}px;top:${y}px;width:${cw}px;height:${RH - 6}px" data-act="pick-style" data-key="${esc(st.key)}" data-hit>`
      + `<span class="role">${roleIcon(st.role, 28, on ? "#F0E6D2" : DIM)}</span><span class="more-name">${esc(st.name)}</span>${warnTag(st)}</button>`;
  });
  s += `<div class="abs more-foot" style="left:${P}px;top:${96 + rows * RH + 14}px;width:${W - 2 * P}px">少見：${WARN.few[1]}　偏弱：${WARN.weak[1]}</div>`;
  return s + `</div>`;
}

function settingsPanel(s: Settings): string {
  const W = 640, X = 960 - W / 2, Y = 196;
  const rows: [string, keyof Settings | null, "toggle" | "seg" | "size" | null][] = [
    ["排序依據", null, null], ["英雄的強化分級", "useTiers", "toggle"], ["和已拿強化搭配", "useSynergy", "toggle"],
    ["可重骰門檻", null, null], ["rerollBelow", "rerollBelow", "seg"],
    ["顯示", null, null], ["面板大小", "panelScale", "size"], ["怎麼玩、核心裝", "showHint", "toggle"], ["只在按住 Shift 時顯示建議", "onlyOnShift", "toggle"],
    ["商店", null, null], ["選角時把出裝寫進商店的物品組合", "itemSets", "toggle"]];
  let y = 96, body = "";
  for (const [label, key, kind] of rows) {
    if (!kind) { body += `<div class="abs s-head" style="top:${y + 8}px">${label}</div>`; y += 36; continue; }
    if (kind === "size") {   // the side panels' size: their text grows with them
      body += `<div class="abs s-row" style="top:${y}px"><span>${label}</span><div class="seg">`;
      for (const [word, k] of [["小", 0.85], ["中", 1], ["大", 1.2], ["特大", 1.4]] as const) {
        const on = Math.abs(s.panelScale - k) < 0.01;
        body += `<button class="seg-b${on ? " on" : ""}" data-act="setting" data-key="panelScale" data-value="${k}" data-num data-hit>${plate(54, 40, on ? TEAL : GOLD, on ? 0.9 : 0.65)}<span>${word}</span></button>`;
      }
      body += `</div></div>`;
    } else if (kind === "seg") {
      const all: Tier[] = ["S", "A", "B", "C"], below = s.rerollBelow, worse = all.slice(all.indexOf(below) + 1);
      body += `<div class="abs s-row" style="top:${y}px"><span>${worse.length ? `${worse.join("、")} 級標成可重骰` : "不標可重骰"}</span><div class="seg">`;
      for (const t of all)
        body += `<button class="seg-b${t === below ? " on" : ""}" data-act="setting" data-key="rerollBelow" data-value="${t}" data-hit>${plate(54, 40, t === below ? TEAL : GOLD, t === below ? 0.9 : 0.65)}<span>${t}</span></button>`;
      body += `</div></div>`;
    } else {
      const on = Boolean(s[key!]);
      body += `<button class="abs s-row" style="top:${y}px" data-act="setting" data-key="${key}" data-value="${!on}" data-hit><span>${label}</span>${toggle(on)}</button>`;
    }
    y += 56;
  }
  body += `<div class="abs s-legal" style="top:${y + 12}px">遺忘寶珠 · Oblivion Orb isn't endorsed by Riot Games and doesn't reflect the views or opinions of Riot Games or anyone officially involved in producing or managing Riot Games properties. Riot Games, and all associated properties are trademarks or registered trademarks of Riot Games, Inc.</div>`;
  const H = y + 12 + 72 + 20;
  return `<div class="abs veil-all" data-act="close-settings" data-hit></div>`
    + box(X, Y, W, H, "plate settings", "", motion("settings", "fade", FADE)) + plate(W, H)
    + `<div class="abs s-title">建議邏輯</div><div class="abs s-sub">選強化時隨時可改，馬上重排；按 Esc 關閉</div>`
    + `<button class="abs s-close" data-act="close-settings" data-hit aria-label="關閉">✕</button>` + body + `</div>`;
}

/** What each card showed at the last draw of this pick (an augment id or a shard), to see a reroll. */
const cardWas = new Map<number, string>();

export function render(root: HTMLElement, v: View): void {
  const st = v.state;
  const champ = st.champion ? v.data.champions[st.champion] : undefined;
  const pick = st.phase === "augment-pick" && st.offers.length > 0;
  // beside the cards at a pick; beside the shop (and its quick-buy column on the left) while it is open
  const span = pick ? cardSpan(st.offers)
    : st.shop ? { left: st.shop.x - 90, right: st.shop.x + st.shop.w, top: st.shop.y, bottom: st.shop.y + st.shop.h }
    : cardSpan([]);
  let html = "";
  const inGame = st.phase === "in-game" || st.phase === "augment-pick";
  const open = panelsOpen(st, v.ui);
  // the champion's icons load first (from champ select on); until they are in, nothing of the champion shows, so the
  // panels never appear empty and fill in icon by icon
  const ready = !champ || loaded([...champ.play.map((r) => r.icon),
    ...champ.styles.flatMap((s) => [...s.core.map((c) => c.icon), ...(s.boots ? [s.boots.icon] : [])])], v.redraw);
  if (champ && ready && inGame) html += toggleButton(open, v.settings.panelOffsets.toggle);
  // the panels: in champ select; in game at each pick, in the shop, or when the toggle opened them
  if (champ && ready && open) {
    html += leftPanel(v, champ, span);
    const chosen = styleOf(v.data, st.champion, v.settings.styleKey);
    const items = chosen ? [...chosen.core, ...(chosen.boots ? [chosen.boots] : [])] : [];   // the core items, then the boots
    if (v.settings.showHint) html += rightPanel(champ, items, span, v.settings.panelOffsets.right, v.settings.panelScale);
    if (v.ui.moreOpen) html += moreList(champ, chosen);
  }
  if (pick) {
    const vds = verdicts(v);
    // while a card is hovered the game's tooltip opens over the cards (below their names, or above the cards when its
    // text is long): the plates, the best card's frame and the banner step aside; Shift brings the banner back
    const hovering = st.hover != null;
    const showPlates = (!v.settings.onlyOnShift || st.shift) && !hovering;
    st.offers.forEach((o, i) => {
      const vd = vds[i];
      // a card that changed while the pick stays open (a reroll) flips its plate in; otherwise the plates fade in
      const what = o.shard !== undefined ? `shard:${o.shard}` : `id:${o.id}`;
      const rerolled = cardWas.has(i) && cardWas.get(i) !== what;
      cardWas.set(i, what);
      if (vd.best && !hovering)
        html += box(o.card.x - 34, o.card.y - 34, o.card.w + 68, o.card.h + 68, "deco", "", motion(`best:${i}:${what}`, "fade", FADE)) + hextechFrame(o.card.w, o.card.h) + `</div>`;
      if (showPlates)
        html += nameplate(o, vd, motion(`np:${i}:${what}`, rerolled ? "flip" : "fade", rerolled ? FLIP : FADE),
                          motion(`glow:${i}:${what}`, rerolled ? "glow-late" : "fade", rerolled ? FLIP : FADE));
      // the tag hangs where the game's tooltip opens, so it hides while a card is hovered
      if (vd.reroll && o.reroll && st.hover == null) {
        const tw = 156, th = 42, x = o.reroll.x + o.reroll.w / 2 - tw / 2, y = o.reroll.y + o.reroll.h + 4;
        html += box(x, y, tw, th, "deco tag", "", motion(`tag:${i}`, "fade", FADE)) + rerollTag(tw, th) + `<span>↻ 建議重骰</span></div>`;
      }
    });
    // the game's tooltip may open above the cards too (a long text): the banner shows only while Shift is held
    if (st.hover != null && st.shift && vds[st.hover]) html += banner(v, vds[st.hover]);
  }
  if (v.ui.settingsOpen) html += settingsPanel(v.settings);
  if (v.ui.fullscreen && st.phase === "champ-select")
    html += `<div class="abs fullscreen-warn"><b>遊戲是全螢幕模式</b>遺忘寶珠在遊戲裡會看不到強化卡。請在遊戲裡到 設定 › 影像 › 視窗模式，改成「無邊框」。</div>`;
  if (v.ui.test) html += `<div class="abs test-badge">測試模式 · 從系統匣關閉</div>`;
  if (!pick) cardWas.clear();
  root.innerHTML = html;
  endDraw();
}
