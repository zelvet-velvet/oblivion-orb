// Draws the overlay from the game state, the data and the settings, in the 1920 × 1080 frame the screens were drawn in
// (oblivion-orb-folio Spec/Screens.md: 主畫面, 懸停, Shift 重點, 邏輯設定). Everything anchors to the cards' positions, so
// whatever the reader finds, the marks follow. Everything is redrawn on each change; it is small.

import {
  DIM, EMBER_TXT, METAL, VERDICT_INK, WHY_INK, TEAL, GOLD, orbIcon,
  gear, hextechFrame, plate, plateGlow, rarityPlate, rerollTag, richApAd, roleIcon, dmgPill, tile, toggle,
} from "./art";
import { rankOffers, shortWhy, styleOf, type Verdict } from "./rank";
import type { ChampionData, CoreItem, GameData, GameState, Mode, Offer, Settings, Tier } from "./types";

export interface UiState {
  settingsOpen: boolean; test?: boolean; fullscreen?: boolean;
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
export interface View { data: GameData; state: GameState; settings: Settings; ui: UiState }
export type Action =
  | { type: "pick-style"; key: string } | { type: "mode"; mode: Mode }
  | { type: "open-settings" } | { type: "close-settings" } | { type: "setting"; key: keyof Settings; value: unknown };

const MODE_LINE: Record<Mode, string> = { 貪: "貪：上限高、要慢慢疊的往前", 均衡: "均衡：穩的和上限高的各半", 穩: "穩：先拿馬上有效的" };
const esc = (s: string) => s.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!);
const box = (x: number, y: number, w: number, h: number, cls = "", attrs = "", style = "") =>
  `<div class="abs ${cls}" style="left:${x}px;top:${y}px;width:${w}px;height:${h}px;${style}" ${attrs}>`;
/** A side panel w wide in `room` pixels: its scale (1, or less when four cards leave too little room) and that style. */
function fitIn(room: number, w: number): [number, string] {
  const k = Math.max(0.5, Math.min(1, room / w));
  return [k, k < 1 ? `transform:scale(${k.toFixed(3)});transform-origin:0 0` : ""];
}

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

/** The orb on the screen's left edge in game: click to open or close the panels, drag to move it. */
function toggleButton(open: boolean, offset: [number, number] = [0, 0]): string {
  const S = 48, X = 14 + offset[0], Y = 220 + offset[1];
  return box(X, Y, S, S, `toggle${open ? " on" : ""}`, `data-drag="toggle" data-hit title="${open ? "收起" : "展開"}遺忘寶珠（可拖曳）"`)
    + plate(S, S, open ? TEAL : GOLD, open ? 0.9 : 0.7)
    + `<span class="toggle-orb">${orbIcon(2)}</span></div>`;
}

/** The panel's title row: drag it to move the panel, double-click it to put the panel back beside the cards. */
const dragHandle = (key: "left" | "right", w: number) =>
  `<div class="abs drag" style="left:0;top:0;width:${w}px;height:60px" data-drag="${key}" data-hit title="拖曳移動，按兩下回到原位"></div>`;

// ---- left: 玩法 (the choice) ----
function leftPanel(v: View, champ: ChampionData, span: Span): string {
  const style = styleOf(v.data, v.state.champion, v.settings.styleKey);
  const styles = champ.styles.slice(0, 4), rows = Math.ceil(styles.length / 2);   // up to four builds, two per row
  const W = 320, P = 14, TH = 128, GAP = 10;
  const [k, fit] = fitIn(span.left - 28, W), X = Math.round(span.left - 16 - W * k);
  const tilesH = rows * TH + (rows - 1) * GAP;
  const H = 68 + tilesH + 10 + 20 + 16 + 26 + 40 + 20;
  const [dx, dy] = v.settings.panelOffsets.left ?? [0, 0];
  const Y = Math.max(k < 1 ? 200 : 344, Math.round((span.top + span.bottom) / 2 - H * k / 2)) + dy;
  const half = Math.floor((W - 2 * P - GAP) / 2);
  let s = box(X + dx, Y, W, H, "plate", "", fit) + plate(W, H) + dragHandle("left", W - P - 36 - 8)
    + `<div class="abs panel-title" style="left:${P}px">玩法</div>`
    + `<button class="abs gear" style="left:${W - P - 36}px;top:16px" data-act="open-settings" data-hit aria-label="建議邏輯">${plate(36, 36)}${gear(22)}</button>`;
  styles.forEach((st, k) => {
    const on = st.key === style?.key, auto = on && v.settings.styleKey == null;
    // a lone tile on its row (one style, or the third of three) spans the row
    const tw = styles.length === 1 || (k === styles.length - 1 && k % 2 === 0) ? W - 2 * P : half;
    const tx = P + (k % 2) * (half + GAP), ty = 68 + Math.floor(k / 2) * (TH + GAP);
    s += `<button class="abs tile${on ? " on" : ""}" style="left:${tx}px;top:${ty}px;width:${tw}px;height:${TH}px" data-act="pick-style" data-key="${esc(st.key)}" data-hit>`
      + plate(tw, TH, on ? TEAL : GOLD, on ? 0.9 : 0.65)
      + (auto ? `<span class="auto">自動</span>` : "")
      + `<span class="role">${roleIcon(st.role, 40, on ? "#F0E6D2" : DIM)}</span>`
      + `<span class="tile-name">${esc(st.name)}</span>${dmgPill(st.damage)}</button>`;
  });
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
function rightPanel(champ: ChampionData, core: CoreItem[], span: Span, offset: [number, number] = [0, 0]): string {
  const W = 360, P = 24;
  const [k, fit] = fitIn(1920 - 12 - span.right - 16, W), X = span.right + 16;
  const playH = champ.play.length ? champ.play.length * 56 + (champ.play.length - 1) * 14 : 0;
  const H = 78 + (champ.play.length ? 30 + playH + 28 : 0) + (core.length ? 30 + 88 + 24 : 0) + 22 + 22;
  const Y = Math.round((span.top + span.bottom) / 2 - H * k / 2) + offset[1];
  let s = box(X + offset[0], Y, W, H, "plate", "", fit) + plate(W, H) + dragHandle("right", W) + `<div class="abs panel-title" style="left:${P}px">${esc(champ.name)}</div>`;
  let y = 78;
  if (champ.play.length) {
    s += `<div class="abs label" style="left:${P}px;top:${y}px">怎麼玩</div>`; y += 30;
    champ.play.forEach((r, k) => {
      s += `<div class="abs play" style="left:${P}px;top:${y}px;width:${W - 2 * P}px">`
        + (r.icon ? `<span class="play-ic"><img src="${esc(r.icon)}" alt=""><b>${esc(r.key)}</b></span>` : `<span class="play-ic key">${esc(r.key)}</span>`)
        + `<span class="play-t">${esc(r.title)}</span><span class="play-d">${richApAd(r.detail)}</span></div>`;
      y += 56 + (k < champ.play.length - 1 ? 14 : 0);
    });
    s += `<div class="abs rule" style="left:${P}px;top:${y + 14}px;width:${W - 2 * P}px"></div>`;
    y += 28;
  }
  if (core.length) {
    s += `<div class="abs label" style="left:${P}px;top:${y}px">核心裝</div>`; y += 30;
    const cw = Math.floor((W - 2 * P) / core.length);
    core.forEach((it, k) => {
      s += `<div class="abs core" style="left:${P + k * cw}px;top:${y}px;width:${cw}px">`
        + (it.icon ? `<img src="${esc(it.icon)}" alt="">` : "") + `<span>${esc(it.name)}</span></div>`;
    });
    y += 88 + 24;
  }
  s += `<div class="abs foot" style="left:${P}px;top:${y}px">按住 Shift 看重點</div>`;
  return s + `</div>`;
}

// ---- on the cards ----
function nameplate(o: Offer, vd: Verdict): string {
  // in the card's empty lower part, under the game's longest text (y 597 of a 526-tall card from 193)
  const PW = o.card.w - 60, PH = 92, X = o.card.x + 30, Y = o.card.y + Math.round(o.card.h * 0.768);
  if (vd.tier == null)
    return box(X, Y, PW, PH, "np unrated") + `<div class="np-l">${vd.label}</div><div class="np-s">${esc(vd.why)}</div></div>`;
  const t = vd.tier as Tier, M = METAL[t];
  const why = shortWhy(vd.why);   // the reroll is said by the tag under its button
  return box(X - 22, Y - 22, PW + 44, PH + 44, "deco") + plateGlow(t, PW, PH) + `</div>`
    + box(X, Y, PW, PH, "np") + rarityPlate(t, PW, PH)
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
  return box(X, Y, W, H, "plate banner") + plate(W, H, t ? METAL[t].ink : DIM, 0.8)
    + (t ? `<div class="abs" style="left:24px;top:36px">${tile(t, 58)}</div>` : "")
    + `<div class="abs b-head" style="left:${tx}px;color:${t ? VERDICT_INK[t] : DIM}">${esc(head)}</div>`
    + `<div class="abs b-why" style="left:${tx}px;color:${t ? WHY_INK[t] : DIM}">${richApAd(vd.why)}</div>`
    + `<div class="abs b-foot">${v.state.shift ? "放開 Shift 收起" : "按住 Shift 看它吃什麼數值"}</div></div>`;
}

function settingsPanel(s: Settings): string {
  const W = 640, X = 960 - W / 2, Y = 196;
  const rows: [string, keyof Settings | null, "toggle" | "seg" | null][] = [
    ["排序依據", null, null], ["英雄的強化分級", "useTiers", "toggle"], ["和已拿強化搭配", "useSynergy", "toggle"],
    ["可重骰門檻", null, null], ["rerollBelow", "rerollBelow", "seg"],
    ["顯示", null, null], ["怎麼玩、核心裝", "showHint", "toggle"], ["只在按住 Shift 時顯示建議", "onlyOnShift", "toggle"]];
  let y = 96, body = "";
  for (const [label, key, kind] of rows) {
    if (!kind) { body += `<div class="abs s-head" style="top:${y + 8}px">${label}</div>`; y += 36; continue; }
    if (kind === "seg") {
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
    + box(X, Y, W, H, "plate settings") + plate(W, H)
    + `<div class="abs s-title">建議邏輯</div><div class="abs s-sub">選強化時隨時可改，馬上重排；按 Esc 關閉</div>`
    + `<button class="abs s-close" data-act="close-settings" data-hit aria-label="關閉">✕</button>` + body + `</div>`;
}

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
  if (champ && inGame) html += toggleButton(open, v.settings.panelOffsets.toggle);
  // the panels: in champ select; in game at each pick, in the shop, or when the toggle opened them
  if (champ && open) {
    html += leftPanel(v, champ, span);
    if (v.settings.showHint) html += rightPanel(champ, styleOf(v.data, st.champion, v.settings.styleKey)?.core ?? [], span, v.settings.panelOffsets.right);
  }
  if (pick) {
    const vds = verdicts(v);
    const showPlates = !v.settings.onlyOnShift || st.shift;
    st.offers.forEach((o, i) => {
      const vd = vds[i];
      if (vd.best) html += box(o.card.x - 34, o.card.y - 34, o.card.w + 68, o.card.h + 68, "deco") + hextechFrame(o.card.w, o.card.h) + `</div>`;
      if (showPlates) html += nameplate(o, vd);
      // the tag hangs where the game's tooltip opens, so it hides while a card is hovered
      if (vd.reroll && o.reroll && st.hover == null) {
        const tw = 156, th = 42, x = o.reroll.x + o.reroll.w / 2 - tw / 2, y = o.reroll.y + o.reroll.h + 4;
        html += box(x, y, tw, th, "deco tag") + rerollTag(tw, th) + `<span>↻ 建議重骰</span></div>`;
      }
    });
    if (st.hover != null && vds[st.hover]) html += banner(v, vds[st.hover]);
  }
  if (v.ui.settingsOpen) html += settingsPanel(v.settings);
  if (v.ui.fullscreen && st.phase === "champ-select")
    html += `<div class="abs fullscreen-warn"><b>遊戲是全螢幕模式</b>遺忘寶珠在遊戲裡會看不到強化卡。請在遊戲裡到 設定 › 影像 › 視窗模式，改成「無邊框」。</div>`;
  if (v.ui.test) html += `<div class="abs test-badge">測試模式 · 從系統匣關閉</div>`;
  root.innerHTML = html;
}
