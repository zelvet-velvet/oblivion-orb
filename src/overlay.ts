// Draws the overlay from the game state, the data and the settings, in the 1920 × 1080 frame the screens were drawn in
// (oblivion-orb-folio Spec/Screens.md: 主畫面, 玩法選單, Shift 重點, 邏輯設定). Everything is redrawn on each change; it is small.

import { bestFrame, brackets, plate, tile, toggle, TEAL, VERDICT_INK, WHY_INK, GOLD } from "./art";
import { rankOffers, styleOf, type Verdict } from "./rank";
import type { ChampionHint, GameData, GameState, Mode, Settings, Tier } from "./types";

export interface UiState { listOpen: boolean; settingsOpen: boolean }
export interface View { data: GameData; state: GameState; settings: Settings; hint: ChampionHint | null; ui: UiState }
export type Action =
  | { type: "toggle-list" } | { type: "pick-style"; key: string } | { type: "mode"; mode: Mode }
  | { type: "open-settings" } | { type: "close-settings" } | { type: "setting"; key: keyof Settings; value: unknown };

const DIM = "#A09B8C";
const MODE_LINE: Record<Mode, string> = { 穩: "穩：先拿馬上有效的", 均衡: "均衡：穩的和上限高的各半", 貪: "貪：上限高、要慢慢疊的往前" };
const esc = (s: string) => s.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!);
const box = (x: number, y: number, w: number, h: number, extra = "", attrs = "") =>
  `<div class="abs ${extra}" style="left:${x}px;top:${y}px;width:${w}px;height:${h}px" ${attrs}>`;

export function verdicts(v: View): Verdict[] {
  return rankOffers(v.data, v.state.champion, v.settings,
    v.state.offers.map((o) => ({ id: o.id, canReroll: o.reroll !== null })), v.state.round);
}

function hintBar(h: ChampionHint): string {
  const W = 680, H = 96;
  return box(960 - W / 2, 56, W, H, "plate") + plate(W, H)
    + `<img class="abs hint-ic" src="${esc(h.icon)}" alt="">`
    + `<div class="abs hint-line">${esc(h.line)}</div><div class="abs hint-look">${esc(h.look)}</div></div>`;
}

function stylePanel(v: View): string {
  const champ = v.state.champion ? v.data.champions[v.state.champion] : undefined;
  const style = styleOf(v.data, v.state.champion, v.settings.styleKey);
  const X = 64, Y = 264, W = 360, H = 304;
  let s = box(X, Y, W, H, "plate") + plate(W, H)
    + `<div class="abs panel-title">玩法</div>`
    + `<div class="abs label" style="left:28px;top:184px">取向</div>`
    + `<div class="abs mode-line">${MODE_LINE[v.settings.mode]}</div>`
    + `<button class="abs btn" style="left:${W - 24 - 112}px;top:20px;width:112px;height:40px" data-act="open-settings" data-hit>${plate(112, 40)}<span>設定</span></button>`;
  const multi = (champ?.styles.length ?? 0) > 1;
  s += `<button class="abs style-row" style="left:16px;top:76px;width:328px;height:88px" ${multi ? 'data-act="toggle-list" data-hit' : "disabled"}>`
    + plate(328, 88, TEAL, 0.9)
    + (champ?.icon ? `<img class="abs style-ic" src="${esc(champ.icon)}" alt="">` : "")
    + `<span class="abs style-name">${esc(style?.name ?? "沒有資料")}</span>`
    + `<span class="abs style-sub">${multi ? "點此換玩法" : champ ? "這隻英雄只有一種玩法" : "等待選角"}</span>`
    + (multi ? `<span class="abs style-caret">▾</span>` : "") + `</button>`;
  (["穩", "均衡", "貪"] as Mode[]).forEach((m, j) => {
    const on = v.settings.mode === m;
    s += `<button class="abs chip${on ? " on" : ""}" style="left:${28 + j * 104}px;top:212px;width:96px;height:44px" data-act="mode" data-mode="${m}" data-hit>`
      + plate(96, 44, on ? TEAL : GOLD, on ? 0.9 : 0.65) + `<span>${m}</span></button>`;
  });
  s += `</div>`;
  if (v.ui.listOpen && champ) {
    const LY = Y + 76 + 88 + 8, RH = 80;
    s += box(X + 16, LY, 328, champ.styles.length * RH + 16, "list");
    champ.styles.forEach((st, k) => {
      const on = st.key === style?.key;
      s += `<button class="abs list-row${on ? " on" : ""}" style="left:8px;top:${8 + k * RH}px;width:312px;height:${RH}px" data-act="pick-style" data-key="${esc(st.key)}" data-hit>`
        + `<span class="list-name">${esc(st.name)}</span>${on ? `<span class="list-tick">✓</span>` : ""}</button>`;
    });
    s += `</div>`;
  }
  return s;
}

function verdictPlate(x: number, y: number, w: number, v: Verdict): string {
  const H = 92;
  if (v.tier == null)
    return box(x, y, w, H, "plate verdict") + plate(w, H, "#7E868E", 0.4)
      + `<div class="verdict-group"><div class="words"><div class="v-label" style="color:${DIM}">${v.label}</div><div class="v-why" style="color:#7F878E">${esc(v.why)}</div></div></div></div>`;
  const t = v.tier as Tier;
  return box(x, y, w, H, "plate verdict") + plate(w, H, tileLine(t), t === "C" ? 0.55 : 0.9)
    + `<div class="verdict-group">${tile(t, 56)}<div class="words">`
    + `<div class="v-label" style="color:${VERDICT_INK[t]}">${v.label}</div>`
    + `<div class="v-why" style="color:${v.reroll ? "#FFB27A" : WHY_INK[t]}">${esc(v.why)}</div>`
    + `</div></div></div>`;
}
const tileLine = (t: Tier) => ({ S: "#D9C2FF", A: "#F7D688", B: "#E2BC6C", C: "#7E868E" })[t];

function shiftNote(v: View, i: number, vd: Verdict): string {
  const o = v.state.offers[i], W = 400, H = 184;
  const x = o.card.x + o.card.w + 24, y = o.card.y + 216;
  const champ = v.state.champion ? v.data.champions[v.state.champion] : undefined;
  if (vd.tier == null) return "";
  const t = vd.tier;
  return box(x, y, W, H, "plate note") + plate(W, H, tileLine(t), 0.9)
    + `<div class="abs" style="left:20px;top:20px">${tile(t, 52)}</div>`
    + `<div class="abs note-title" style="color:${VERDICT_INK[t]}">${vd.label}${champ ? `，對${esc(champ.name)}` : ""}</div>`
    + `<div class="abs note-why" style="color:${WHY_INK[t]}">${esc(vd.why)}</div>`
    + `<div class="abs note-close">放開 Shift 收起</div></div>`;
}

function settingsPanel(s: Settings): string {
  const W = 640, X = 960 - W / 2, Y = 196;
  const rows: [string, keyof Settings | null, "toggle" | "seg" | null][] = [
    ["排序依據", null, null], ["英雄的強化分級", "useTiers", "toggle"], ["和已拿強化搭配", "useSynergy", "toggle"], ["重骰留到稜鏡輪", "saveRerollForPrismatic", "toggle"],
    ["可重骰門檻", null, null], ["rerollBelow", "rerollBelow", "seg"],
    ["顯示", null, null], ["英雄特殊玩法提示", "showHint", "toggle"], ["只在按住 Shift 時顯示建議", "onlyOnShift", "toggle"]];
  let y = 96, body = "";
  for (const [label, key, kind] of rows) {
    if (!kind) { body += `<div class="abs s-head" style="top:${y + 8}px">${label}</div>`; y += 36; continue; }
    if (kind === "seg") {
      const below = s.rerollBelow, worse = (["S", "A", "B", "C"] as Tier[]).slice((["S", "A", "B", "C"] as Tier[]).indexOf(below) + 1);
      body += `<div class="abs s-row" style="top:${y}px"><span>${worse.length ? `${worse.join("、")} 級標成可重骰` : "不標可重骰"}</span><div class="seg">`;
      for (const t of ["S", "A", "B", "C"] as Tier[])
        body += `<button class="seg-b${t === below ? " on" : ""}" data-act="setting" data-key="rerollBelow" data-value="${t}" data-hit>${plate(54, 40, t === below ? TEAL : GOLD, t === below ? 0.9 : 0.65)}<span>${t}</span></button>`;
      body += `</div></div>`;
    } else {
      const on = Boolean(s[key!]);
      body += `<button class="abs s-row" style="top:${y}px" data-act="setting" data-key="${key}" data-value="${!on}" data-hit><span>${label}</span>${toggle(on)}</button>`;
    }
    y += 56;
  }
  // Riot's disclaimer (required in the app's about box)
  body += `<div class="abs s-legal" style="top:${y + 12}px">遺忘寶珠 · Oblivion Orb isn't endorsed by Riot Games and doesn't reflect the views or opinions of Riot Games or anyone officially involved in producing or managing Riot Games properties. Riot Games, and all associated properties are trademarks or registered trademarks of Riot Games, Inc.</div>`;
  const H = y + 12 + 72 + 20;
  return `<div class="abs veil-all" data-act="close-settings" data-hit></div>`
    + box(X, Y, W, H, "plate settings") + plate(W, H)
    + `<div class="abs s-title">建議邏輯</div><div class="abs s-sub">選強化時隨時可改，馬上重排；按 Esc 關閉</div>`
    + `<button class="abs s-close" data-act="close-settings" data-hit>✕</button>` + body + `</div>`;
}

export function render(root: HTMLElement, v: View): void {
  const st = v.state;
  const showPick = st.phase === "augment-pick" && st.offers.length > 0;
  let html = "";
  if (v.settings.showHint && v.hint && st.champion) html += hintBar(v.hint);
  // the play style is set in champ select and shown again at each pick; never over live play
  if (st.champion && (showPick || st.phase === "champ-select")) html += stylePanel(v);
  if (showPick) {
    const vds = verdicts(v);
    const showVerdicts = !v.settings.onlyOnShift || st.shift;
    let bottom = 0;
    st.offers.forEach((o, i) => {
      const vd = vds[i];
      if (vd.best) html += box(o.card.x - 24, o.card.y - 24, o.card.w + 48, o.card.h + 48, "deco") + bestFrame(o.card.w, o.card.h) + `</div>`;
      if (vd.reroll && o.reroll) {
        html += box(o.card.x, o.card.y, o.card.w, o.card.h, "veil") + `</div>`;
        html += box(o.reroll.x - 24, o.reroll.y - 24, o.reroll.w + 48, o.reroll.h + 48, "deco") + brackets(o.reroll.w, o.reroll.h) + `</div>`;
      }
      const y = (o.reroll ? o.reroll.y + o.reroll.h : o.card.y + o.card.h + 72) + 16;
      if (showVerdicts) html += verdictPlate(o.card.x, y, o.card.w, vd);
      bottom = Math.max(bottom, y + 92);
    });
    if (!st.shift) html += `<div class="abs shift-hint" style="top:${bottom + 28}px">按住 Shift 看重點</div>`;
    if (st.shift && st.hover != null && vds[st.hover]) html += shiftNote(v, st.hover, vds[st.hover]);
  }
  if (v.ui.settingsOpen) html += settingsPanel(v.settings);
  root.innerHTML = html;
}

