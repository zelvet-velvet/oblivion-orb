// Draws the overlay from the game state, the data and the settings, in the 1920 × 1080 frame the screens were drawn in
// (oblivion-orb-folio Spec/Screens.md: 主畫面, 懸停, Shift 重點, 邏輯設定). Everything anchors to the cards' positions, so
// whatever the reader finds, the marks follow. Everything is redrawn on each change; it is small.

import {
  DIM, EMBER_TXT, METAL, VERDICT_INK, WHY_INK, TEAL, GOLD,
  gear, hextechFrame, plate, plateGlow, rarityPlate, rerollTag, richApAd, roleIcon, tile, toggle,
} from "./art";
import { endDraw, FADE, FLIP, imageOk, loaded, motion } from "./motion";
import { rankOffers, shortWhy, styleOf, type Verdict } from "./rank";
import type { ChampionData, CoreItem, GameData, GameState, LateItem, Mode, Offer, Settings, StyleData, Tier } from "./types";

export interface UiState {
  settingsOpen: boolean; test?: boolean; fullscreen?: boolean;
  /** the toggle button's choice in game: open or closed; null follows the game (open at a pick and in the shop) */
  panels?: "open" | "closed" | null;
}

/** Whether the side panels show: in champ select by the 選角時顯示 setting; in game the player's choice, else open
 * while a pick or the shop is open. */
export function panelsOpen(st: GameState, ui: UiState, champSelect = false): boolean {
  if (st.phase === "champ-select") return champSelect;
  if (st.phase !== "in-game" && st.phase !== "augment-pick") return false;
  return ui.panels ? ui.panels === "open" : autoOpen(st);
}
export const autoOpen = (st: GameState) => (st.phase === "augment-pick" && st.offers.length > 0) || !!st.shop;
/** redraw: called when an image the overlay waits for has come in */
export interface View { data: GameData; state: GameState; settings: Settings; ui: UiState; redraw?: () => void }
export type Action =
  | { type: "pick-style"; key: string } | { type: "mode"; mode: Mode }
  | { type: "open-settings" } | { type: "close-settings" } | { type: "setting"; key: keyof Settings; value: unknown };

/** A style whose result is not sure, in words (never a number): few games behind it, or it loses. It is still shown: a rare
 * build the kit supports (Bel'Veth's W scales with AP) is a real choice. */
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

const warnTag = (w: string | undefined) => w && WARN[w] ? `<span class="warn" title="${WARN[w][1]}">${WARN[w][0]}</span>` : "";

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

/** The two side panels' shared scale: one width and one scale (so their text is the same size), the scale the side
 * with less room needs. Each panel is as tall as its content and centred on the screen's height; each keeps its own
 * drag offset. */
const SIDE_W = 360;
interface Side { k: number; fit: string }
function sideFrame(span: Span, size: number): Side {
  const [k, fit] = fitIn(Math.min(span.left - 28, 1920 - 12 - span.right - 16), SIDE_W, size);
  return { k, fit };
}
/** The top of a panel h tall at scale k, centred on the screen's height. */
const midY = (h: number, k: number) => Math.max(12, Math.round(540 - h * k / 2));

/** The panel's title row: drag it to move the panel, double-click it to put the panel back beside the cards. */
const dragHandle = (key: "left" | "right", w: number) =>
  `<div class="abs drag" style="left:0;top:0;width:${w}px;height:60px" data-drag="${key}" data-hit title="拖曳移動，按兩下回到原位"></div>`;

// ---- left: 玩法 (the choice) ----
// One tile per play style, a role and damage (AP 刺客, AD 戰士, 坦克): the choice that moves the augment ranking and the build on
// the right. Most played first, each with how many play it; rare and losing ones marked.
const LEFT = { P: 14, TH: 64, GAP: 8 };
function leftHeight(champ: ChampionData): number {
  const rows = Math.ceil(champ.styles.length / 2);
  return 68 + rows * LEFT.TH + (rows - 1) * LEFT.GAP + 12 + 20 + 16 + 26 + 40 + 20;
}
function leftPanel(v: View, champ: ChampionData, span: Span, side: Side): string {
  const style = styleOf(v.data, v.state.champion, v.settings.styleKey);
  const styles = champ.styles;
  const W = SIDE_W, { P, TH, GAP } = LEFT, inner = W - 2 * P, half = Math.floor((inner - GAP) / 2);
  const tileRows = Math.ceil(styles.length / 2), tilesH = tileRows * TH + (tileRows - 1) * GAP;
  const autoY = 68 + tilesH + 12, modeY = autoY + 20 + 16;
  const { k, fit } = side, H = leftHeight(champ), X = Math.round(span.left - 16 - W * k);
  const [dx, dy] = v.settings.panelOffsets.left ?? [0, 0];
  const Y = midY(H, k) + dy;
  let s = box(X + dx, Y, W, H, "plate", "", fit + ";" + motion("left", "fade", FADE)) + plate(W, H) + dragHandle("left", W - P - 36 - 8)
    + `<div class="abs panel-title" style="left:${P}px">玩法</div>`
    + `<button class="abs gear" style="left:${W - P - 36}px;top:16px" data-act="open-settings" data-hit aria-label="建議邏輯">${plate(36, 36)}${gear(22)}</button>`;
  styles.forEach((st, i) => {
    const on = st === style, auto = on && v.settings.styleKey == null;
    // a lone tile on its row (one style, or the last of an odd number) spans the row
    const tw = styles.length === 1 || (i === styles.length - 1 && i % 2 === 0) ? inner : half;
    const tx = P + (i % 2) * (half + GAP), ty = 68 + Math.floor(i / 2) * (TH + GAP);
    const share = st.share ? `${Math.max(1, Math.round(st.share * 100))}% 玩家` : "";
    s += `<button class="abs group${on ? " on" : ""}" style="left:${tx}px;top:${ty}px;width:${tw}px;height:${TH}px" data-act="pick-style" data-key="${esc(st.key)}" data-hit>`
      + plate(tw, TH, on ? TEAL : GOLD, on ? 0.9 : 0.65)
      + `<span class="role">${roleIcon(st.role, 30, on ? "#F0E6D2" : DIM)}</span>`
      + `<span class="group-words"><span class="group-name">${esc(st.name)}</span><span class="group-n">${auto ? "自動 · " : ""}${share}${warnTag(st.warn)}</span></span></button>`;
  });
  s += `<div class="abs auto-line" style="left:${P}px;top:${autoY}px;width:${inner}px">依你選的強化和裝備自動選，點一下可改</div>`;
  const cw = Math.floor((inner - 12) / 3);
  s += `<div class="abs label" style="left:${P}px;top:${modeY}px">我要</div>`;
  (["貪", "均衡", "穩"] as Mode[]).forEach((m, j) => {
    const on = v.settings.mode === m;
    s += `<button class="abs chip${on ? " on" : ""}" style="left:${P + j * (cw + 6)}px;top:${modeY + 26}px;width:${cw}px;height:40px" data-act="mode" data-mode="${m}" data-hit title="${MODE_LINE[m]}">`
      + plate(cw, 40, on ? TEAL : GOLD, on ? 0.9 : 0.65) + `<span>${m}</span></button>`;
  });
  return s + `</div>`;
}

// ---- right: the champion (the knowledge) ----
/** The chosen build's path, a row each: the three core items in order, the boots, items four to six (by need, two rows of
 * three at most). A row of items four to six shows each one's need under its name. */
function pathRows(st: StyleData | null): [string, (CoreItem | LateItem)[]][] {
  if (!st) return [];
  const late = st.late ?? [];
  const rows: [string, (CoreItem | LateItem)[]][] = [["核心", st.core], ["鞋子", st.boots ? [st.boots] : []], ["4–6 件", late.slice(0, 3)], ["", late.slice(3, 6)]];
  return rows.filter(([, items]) => items.length);
}
const PATH_H = 66, PATH_TALL = 84, PATH_GAP = 8;
function rightHeight(champ: ChampionData, style: StyleData | null): number {
  const playH = champ.play.length ? champ.play.length * 56 + (champ.play.length - 1) * 14 : 0;
  const path = pathRows(style);
  const pathH = path.reduce((h, [, items]) => h + (items.some((it) => "need" in it) ? PATH_TALL : PATH_H), 0) + Math.max(0, path.length - 1) * PATH_GAP;
  return 78 + (champ.play.length ? 30 + playH + 28 : 0) + (path.length ? 30 + pathH + 20 : 0) + 22 + 22;
}
function rightPanel(champ: ChampionData, style: StyleData | null, span: Span, side: Side, offset: [number, number] = [0, 0]): string {
  const W = SIDE_W, P = 24, { k, fit } = side, H = rightHeight(champ, style), X = span.right + 16;
  const path = pathRows(style);
  const Y = midY(H, k) + offset[1];
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
  if (path.length && style) {
    s += `<div class="abs label" style="left:${P}px;top:${y}px">出裝・${esc(style.name)}${warnTag(style.warn).replace('class="warn"', 'class="warn inline"')}</div>`; y += 30;
    const LW = 56, cw = Math.floor((W - 2 * P - LW) / 3);
    path.forEach(([label, items], r) => {
      const tall = items.some((it) => "need" in it);   // items four to six: a line for what each adds
      s += `<div class="abs path-label" style="left:${P}px;top:${y}px;height:${PATH_H}px">${label}${label === "4–6 件" ? "<i>依需要挑</i>" : ""}</div>`;
      items.slice(0, 3).forEach((it, j) => {
        const why = "need" in it ? (it.when || it.need || "") : "";
        s += `<div class="abs core" style="left:${P + LW + j * cw}px;top:${y}px;width:${cw}px" title="${esc(it.name + (why ? `：${why}` : ""))}">`
          + (it.icon && imageOk(it.icon) ? `<img src="${esc(it.icon)}" alt="">` : `<i class="core-empty"></i>`) + `<span>${esc(it.name)}</span>`
          + (tall ? `<small class="need">${esc(why)}</small>` : "") + `</div>`;
      });
      y += (tall ? PATH_TALL : PATH_H) + (r < path.length - 1 ? PATH_GAP : 0);
    });
    y += 20;
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
  const head = `${a?.name ?? vd.name ?? "這張卡"} · ${vd.label}${vd.general ? "（通用，各英雄綜合）" : champ ? `，對${champ.name}` : ""}`;
  return box(X, Y, W, H, "plate banner", "", motion("banner", "fade", FADE)) + plate(W, H, t ? METAL[t].ink : DIM, 0.8)
    + (t ? `<div class="abs" style="left:24px;top:36px">${tile(t, 58)}</div>` : "")
    + `<div class="abs b-head" style="left:${tx}px;color:${t ? VERDICT_INK[t] : DIM}">${esc(head)}</div>`
    + `<div class="abs b-why" style="left:${tx}px;color:${t ? WHY_INK[t] : DIM}">${richApAd(vd.why)}</div>`
    + `<div class="abs b-foot">放開 Shift 收起</div></div>`;
}

const CHOICES = {
  marks: [["一直顯示", "always"], ["滑到卡上隱藏", "hover-hide"], ["按 Shift 顯示", "shift"]],
  friends: [["有朋友", true], ["沒朋友qq", false]],
} as const;

function settingsPanel(s: Settings): string {
  const [dx, dy] = s.panelOffsets.settings ?? [0, 0];
  const W = 640, X = 960 - W / 2 + dx, Y = 196 + dy;
  const rows: [string, keyof Settings | null, "toggle" | "size" | "choice" | null][] = [
    ["排序依據", null, null], ["英雄的強化分級", "useTiers", "toggle"], ["和已拿強化搭配", "useSynergy", "toggle"],
    ["顯示", null, null], ["面板大小", "panelScale", "size"], ["怎麼玩、出裝", "showHint", "toggle"], ["建議標示", "marks", "choice"], ["可考慮的卡", "friends", "choice"],
    ["選角時顯示兩側面板", "champSelect", "toggle"], ["直播、截圖看得到", "streaming", "toggle"],
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
    } else if (kind === "choice") {   // a few named choices: 建議標示; the 可考慮 card's tag (問朋友 with friends, 沒興趣 alone)
      body += `<div class="abs s-row" style="top:${y}px"><span>${label}</span><div class="seg">`;
      for (const [word, value] of CHOICES[key as keyof typeof CHOICES]) {
        const sel = s[key!] === value, w = [...word].reduce((n, c) => n + (c.charCodeAt(0) > 0x2e80 ? 19 : 10), 22);   // Chinese characters, then Latin
        body += `<button class="seg-b${sel ? " on" : ""}" style="width:${w}px" data-act="setting" data-key="${key}" data-value="${value}" data-hit>${plate(w, 40, sel ? TEAL : GOLD, sel ? 0.9 : 0.65)}<span>${word}</span></button>`;
      }
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
    + `<div class="abs drag" style="left:0;top:0;width:${W - 72}px;height:88px" data-drag="settings" data-hit title="拖曳移動，按兩下回到原位"></div>`
    + `<div class="abs s-title">建議邏輯</div><div class="abs s-sub">選強化時隨時可改，馬上重排；按 Esc 關閉</div>`
    + `<button class="abs s-close" data-act="close-settings" data-hit aria-label="關閉">✕</button>` + body + `</div>`;
}

/** What each card showed at the last draw of this pick (an augment id or a shard), to see a reroll. */
const cardWas = new Map<number, string>();

export function render(root: HTMLElement, v: View): void {
  const st = v.state;
  const champ = st.champion ? v.data.champions[st.champion] : undefined;
  const pick = st.phase === "augment-pick" && st.offers.length > 0;
  // beside the cards at a pick; otherwise (the shop open, too) where a pick's cards sit, so they never follow the shop
  const span = cardSpan(pick ? st.offers : []);
  let html = "";
  const inGame = st.phase === "in-game" || st.phase === "augment-pick";
  const open = panelsOpen(st, v.ui, v.settings.champSelect);
  // the champion's icons load first (from champ select on); until they are in, nothing of the champion shows, so the
  // panels never appear empty and fill in icon by icon
  const ready = !champ || loaded([...champ.play.map((r) => r.icon),
    ...champ.styles.flatMap((s) => [...s.core, ...(s.late ?? []), ...(s.boots ? [s.boots] : [])].map((c) => c.icon))], v.redraw);
  if (champ && ready && inGame) html += toggleButton(open, v.settings.panelOffsets.toggle);
  // the panels: in champ select; in game at each pick, in the shop, or when the toggle opened them
  if (champ && ready && open) {
    const chosen = styleOf(v.data, st.champion, v.settings.styleKey);
    const side = sideFrame(span, v.settings.panelScale);
    html += leftPanel(v, champ, span, side);
    if (v.settings.showHint) html += rightPanel(champ, chosen, span, side, v.settings.panelOffsets.right);
  }
  if (pick) {
    const vds = verdicts(v);
    // the marks (the best card's frame, the plates, the reroll tags) show and hide together, by 建議標示: always; not while
    // the cursor is on any card (the game's tooltip opens over the cards there); or only while Shift is held
    const m = v.settings.marks;
    const showMarks = m === "always" || (m === "shift" ? st.shift : st.hover == null);
    st.offers.forEach((o, i) => {
      const vd = vds[i];
      // a card that changed while the pick stays open (a reroll) flips its plate in; otherwise the plates fade in
      const what = o.shard !== undefined ? `shard:${o.shard}` : `id:${o.id}`;
      const rerolled = cardWas.has(i) && cardWas.get(i) !== what;
      cardWas.set(i, what);
      if (vd.best && showMarks)
        html += box(o.card.x - 34, o.card.y - 34, o.card.w + 68, o.card.h + 68, "deco", "", motion(`best:${i}:${what}`, "fade", FADE)) + hextechFrame(o.card.w, o.card.h) + `</div>`;
      if (showMarks)
        html += nameplate(o, vd, motion(`np:${i}:${what}`, rerolled ? "flip" : "fade", rerolled ? FLIP : FADE),
                          motion(`glow:${i}:${what}`, rerolled ? "glow-late" : "fade", rerolled ? FLIP : FADE));
      if ((vd.reroll || vd.tryReroll) && o.reroll && showMarks) {
        const tw = 156, th = 42, x = o.reroll.x + o.reroll.w / 2 - tw / 2, y = o.reroll.y + o.reroll.h + 4;
        html += box(x, y, tw, th, `deco tag${vd.reroll ? "" : " soft"}`, "", motion(`tag:${i}`, "fade", FADE)) + rerollTag(tw, th, !vd.reroll)
          + `<span>${vd.reroll ? "↻ 建議重骰" : v.settings.friends ? "↻ 問朋友" : "↻ 沒興趣"}</span></div>`;
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
