// Starts the overlay. In the app (Tauri) Rust sends "game-reading" (phase and champion), "pick" (the augment cards the
// reader sees: their names and where they sit) and "pointer" (Shift and the cursor),
// and the window lets clicks through except over the overlay's own controls (their rects go to Rust as hit regions).
// In a browser it shows a sample
// (?sample=mundo | kaisa | unknown, with &open=settings or &shift=<card>) over a drawn game screen.

import dataJson from "./data/game-data.json";
import { gameLayer, SAMPLES } from "./mock";
import { makeNameMatcher } from "./names";
import { itemSets } from "./itemsets";
import { SHARD_NAME, shardOf } from "./shards";
import { autoOpen, panelsOpen, render, type Action, type UiState } from "./overlay";
import { DEFAULT_SETTINGS, type GameData, type GameState, type Mode, type Rect, type Settings } from "./types";

const data = dataJson as unknown as GameData;
const inApp = "__TAURI_INTERNALS__" in window;
const stage = document.getElementById("stage")!;
const KEY = "oblivion-orb.settings";
const LAST_CHAMP = "oblivion-orb.last-champion";

function loadSettings(): Settings {
  try {
    const { onlyOnShift, ...saved } = JSON.parse(localStorage.getItem(KEY) ?? "{}");
    // the old 只在按住 Shift 時顯示建議 toggle is the 建議標示 choice 按 Shift 顯示
    return { ...DEFAULT_SETTINGS, ...(onlyOnShift && !saved.marks && { marks: "shift" }), ...saved };
  } catch { return { ...DEFAULT_SETTINGS }; }
}
function saveSettings() { try { localStorage.setItem(KEY, JSON.stringify(settings)); } catch { /* private mode: settings last the session */ } }

let settings = loadSettings();
const ui: UiState = { settingsOpen: false };
let state: GameState = { phase: "idle", champion: null, round: null, offers: [], shift: false, hover: null };
let scale = 1, offX = 0, offY = 0;

function fit() {
  scale = Math.min(innerWidth / 1920, innerHeight / 1080);
  offX = (innerWidth - 1920 * scale) / 2; offY = (innerHeight - 1080 * scale) / 2;
  for (const el of [stage, document.getElementById("game")]) if (el) el.style.transform = `translate(${offX}px, ${offY}px) scale(${scale})`;
}

let lastLine = "";
function draw() {
  render(stage, { data, state, settings, ui, redraw: draw });
  if (inApp) { void sendHitRegions(); void pageLog(); scheduleItemSets(); }
}

// in champ select, the champion's builds go into the client as item sets (the shop lists them in game): once the
// champion and the style have stayed the same for a moment, so a bench swap or a style click writes once, not per change
let setsWritten = "", setsTimer = 0;
function scheduleItemSets() {
  const champ = state.champion ? data.champions[state.champion] : undefined;
  const want = state.phase === "champ-select" && settings.itemSets && champ ? `${state.champion}|${settings.styleKey}` : "";
  if (!want || want === setsWritten) { clearTimeout(setsTimer); setsTimer = 0; return; }
  if (setsTimer) return;
  setsTimer = window.setTimeout(async () => {
    setsTimer = 0;
    const now = state.phase === "champ-select" && settings.itemSets && state.champion ? `${state.champion}|${settings.styleKey}` : "";
    if (now !== want) { scheduleItemSets(); return; }
    const sets = itemSets(data.champions[state.champion!], settings.styleKey);
    setsWritten = want;
    if (!sets.length) return;
    const { invoke } = await import("@tauri-apps/api/core");
    await invoke("write_item_sets", { sets });
  }, 1500);
}

/** What the page shows, into the app's reader.log when it changes. */
async function pageLog() {
  const champ = state.champion ? (data.champions[state.champion] ? state.champion : `${state.champion} (no data)`) : "none";
  const cards = state.offers.map((o) => o.shard !== undefined ? (o.shard ? SHARD_NAME[o.shard] : "unknown shard")
    : o.id != null ? data.augments[String(o.id)]?.name ?? o.id : "unread").join(", ");
  const line = `${state.phase} · champion ${champ}${state.offers.length ? ` · ${state.offers.length} cards: ${cards}` : ""}`
    + ` · ${stage.querySelectorAll(".np").length} plates · window ${innerWidth}x${innerHeight}`;
  if (line === lastLine) return;
  lastLine = line;
  const { invoke } = await import("@tauri-apps/api/core");
  await invoke("page_log", { line });
}

/** The rects (in window pixels) where the overlay takes the mouse; everywhere else clicks go to the game. While a panel
 * is dragged the whole window takes it, so the drag never slips into the game, not even a fast one. */
async function sendHitRegions() {
  const rects: Rect[] = drag ? [{ x: 0, y: 0, w: innerWidth, h: innerHeight }] : [...stage.querySelectorAll<HTMLElement>("[data-hit]")].map((el) => {
    const r = el.getBoundingClientRect();
    return { x: r.left, y: r.top, w: r.width, h: r.height };
  });
  const { invoke } = await import("@tauri-apps/api/core");
  await invoke("set_hit_regions", { rects, scaleFactor: devicePixelRatio });
}

function act(a: Action) {
  switch (a.type) {
    case "pick-style": settings = { ...settings, styleKey: a.key }; break;
    case "mode": settings = { ...settings, mode: a.mode }; break;
    case "open-settings": ui.settingsOpen = true; break;
    case "close-settings": ui.settingsOpen = false; break;
    case "setting": settings = { ...settings, [a.key]: a.value }; break;
  }
  saveSettings(); draw();
}

stage.addEventListener("click", (e) => {
  const el = (e.target as HTMLElement).closest<HTMLElement>("[data-act]");
  if (!el) return;
  const t = el.dataset.act!;
  if (t === "mode") act({ type: "mode", mode: el.dataset.mode as Mode });
  else if (t === "pick-style") act({ type: "pick-style", key: el.dataset.key! });
  else if (t === "setting") {
    const raw = el.dataset.value!;
    act({ type: "setting", key: el.dataset.key as keyof Settings,
          value: el.dataset.num != null ? Number(raw) : raw === "true" ? true : raw === "false" ? false : raw });
  } else act({ type: t } as Action);
});
addEventListener("keydown", (e) => {
  if (e.key === "Escape" && ui.settingsOpen) { ui.settingsOpen = false; draw(); }
});

// dragging a side panel by its title row; double-click puts it back beside the cards
type PanelKey = "left" | "right" | "toggle";
let drag: { key: PanelKey; x: number; y: number; from: [number, number] } | null = null;
stage.addEventListener("pointerdown", (e) => {
  const el = (e.target as HTMLElement).closest<HTMLElement>("[data-drag]");
  if (!el || e.button !== 0) return;
  const key = el.dataset.drag as PanelKey;
  drag = { key, x: e.clientX, y: e.clientY, from: settings.panelOffsets[key] ?? [0, 0] };
  e.preventDefault(); draw();
});
addEventListener("pointermove", (e) => {
  if (!drag) return;
  const dx = Math.round(drag.from[0] + (e.clientX - drag.x) / scale), dy = Math.round(drag.from[1] + (e.clientY - drag.y) / scale);
  const clamp = (v: number, m: number) => Math.max(-m, Math.min(m, v));
  settings = { ...settings, panelOffsets: { ...settings.panelOffsets, [drag.key]: [clamp(dx, 1700), clamp(dy, 900)] } };
  draw();
});
addEventListener("pointerup", (e) => {
  if (!drag) return;
  // the toggle orb: a click (it barely moved) opens or closes the panels; a drag only moves it
  if (drag.key === "toggle" && Math.abs(e.clientX - drag.x) + Math.abs(e.clientY - drag.y) < 5) {
    settings = { ...settings, panelOffsets: { ...settings.panelOffsets, toggle: drag.from } };
    ui.panels = panelsOpen(state, ui) ? "closed" : "open";
  }
  drag = null; saveSettings(); draw();
});
stage.addEventListener("dblclick", (e) => {
  const el = (e.target as HTMLElement).closest<HTMLElement>("[data-drag]");
  if (!el) return;
  const { [el.dataset.drag as PanelKey]: _, ...rest } = settings.panelOffsets;
  settings = { ...settings, panelOffsets: rest }; saveSettings(); draw();
});
addEventListener("resize", () => { fit(); draw(); });

function setState(next: GameState) {
  if (next.champion !== state.champion) settings = { ...settings, styleKey: null };
  // a pick or the shop opening shows the panels again even if the toggle closed them, and closes them after
  if (autoOpen(next) !== autoOpen(state)) ui.panels = null;
  if (next.phase !== "in-game" && next.phase !== "augment-pick") ui.panels = null;
  state = next; draw();
}

interface Reading { phase: "idle" | "champ-select" | "in-game"; champion: string | null; championKey: number | null; test: boolean; fullscreen: boolean }
interface Pointer { shift: boolean; x: number; y: number }
interface PickCard { name: string; card: Rect; reroll: Rect | null }
interface Pick { open: boolean; cards: PickCard[] }
const byKey = new Map(Object.entries(data.champions).map(([id, c]) => [c.key, id]));
const matchName = makeNameMatcher(data.augments);
/** A rect in the window's CSS pixels, into the 1920 × 1080 frame the overlay draws in. */
const toFrame = (r: Rect): Rect => ({ x: (r.x - offX) / scale, y: (r.y - offY) / scale, w: r.w / scale, h: r.h / scale });

if (inApp) {
  void (async () => {
    const { listen } = await import("@tauri-apps/api/event");
    await listen<Reading>("game-reading", ({ payload: r }) => {
      let champion = r.champion ?? (r.championKey != null ? byKey.get(r.championKey) ?? null : null);
      // the test mode with no champion seen since the app started: the last one from an earlier run, else the sample's
      if (champion) localStorage.setItem(LAST_CHAMP, champion);
      else if (r.test) champion = localStorage.getItem(LAST_CHAMP) ?? "DrMundo";
      ui.test = r.test;
      ui.fullscreen = r.fullscreen;
      // the offers stay as they are until the card reader sends them
      setState({ ...state, phase: state.phase === "augment-pick" && r.phase === "in-game" ? state.phase : r.phase, champion });
    });
    let lastUnread = "";
    await listen<Pick>("pick", async ({ payload: p }) => {
      if (!p.open) {
        lastUnread = "";
        if (state.phase === "augment-pick") setState({ ...state, phase: "in-game", offers: [], hover: null });
        return;
      }
      const offers = p.cards.map((c) => {
        const shard = shardOf(c.name);   // a 能力值加成 card, or undefined for an augment
        return { id: shard === undefined ? matchName(c.name) : null, ...(shard !== undefined && { shard }),
                 card: toFrame(c.card), reroll: c.reroll ? toFrame(c.reroll) : null };
      });
      setState({ ...state, phase: "augment-pick", offers });
      // the cards whose name matched nothing: the reader reads them again, another way each time, until one matches
      const unread = offers.map((o) => (o.shard === undefined ? o.id == null : o.shard === null));
      if (unread.join() !== lastUnread) {
        lastUnread = unread.join();
        const { invoke } = await import("@tauri-apps/api/core");
        await invoke("set_unread", { cards: unread });
      }
    });
    await listen<Rect | null>("shop", ({ payload: r }) => setState({ ...state, shop: r ? toFrame(r) : null }));
    await listen<Pointer>("pointer", ({ payload: p }) => {
      const x = (p.x - offX) / scale, y = (p.y - offY) / scale;
      const i = state.offers.findIndex((o) => x >= o.card.x && x <= o.card.x + o.card.w && y >= o.card.y && y <= o.card.y + o.card.h);
      const hover = i >= 0 ? i : null;   // the game opens its tooltip on plain hover, so we follow it too
      if (p.shift !== state.shift || hover !== state.hover) setState({ ...state, shift: p.shift, hover });
    });
  })();
} else {
  // the browser: a sample over a drawn game screen; Shift and the cursor as in the app
  document.body.classList.add("browser");
  const name = new URLSearchParams(location.search).get("sample") ?? "mundo";
  const sample = SAMPLES[name] ?? SAMPLES.mundo;
  const game = document.createElement("div");
  game.id = "game"; game.innerHTML = gameLayer(data, sample.state);
  document.body.insertBefore(game, stage);
  const bar = document.createElement("div");
  bar.className = "mock-bar"; bar.textContent = `sample: ${name} · ${Object.keys(SAMPLES).map((k) => `?sample=${k}`).join(" ")} · patch ${data.patch}`;
  document.body.append(bar);
  state = structuredClone(sample.state);
  // &open=settings opens the settings; &shift=0..2 holds Shift over that card; &champ=Belveth another champion, &style=<key>
  // one of its play styles (for screenshots)
  const q = new URLSearchParams(location.search);
  if (q.get("open") === "settings") ui.settingsOpen = true;
  if (q.get("champ") && data.champions[q.get("champ")!]) state = { ...state, champion: q.get("champ") };
  if (q.get("style") != null) settings = { ...settings, styleKey: q.get("style") };
  if (q.get("shift") != null) state = { ...state, shift: true, hover: Number(q.get("shift")) };
  const setShift = (on: boolean) => { if (state.shift !== on) setState({ ...state, shift: on }); };
  addEventListener("keydown", (e) => { if (e.key === "Shift") setShift(true); });
  // R: the first card rerolled into another of the champion's augments, to see the plate turn over
  addEventListener("keydown", (e) => {
    const rows = state.champion ? Object.values(data.champions[state.champion]?.tiers ?? {})[0] : undefined;
    if (e.key.toLowerCase() !== "r" || !rows?.length || !state.offers.length) return;
    const id = rows[Math.floor(Math.random() * rows.length)][0];
    setState({ ...state, offers: state.offers.map((o, i) => (i === 0 ? { ...o, id, shard: undefined, reroll: null } : o)) });
  });
  addEventListener("keyup", (e) => { if (e.key === "Shift") setShift(false); });
  addEventListener("blur", () => setShift(false));
  addEventListener("mousemove", (e) => {
    const x = (e.clientX - offX) / scale, y = (e.clientY - offY) / scale;
    const i = state.offers.findIndex((o) => x >= o.card.x && x <= o.card.x + o.card.w && y >= o.card.y && y <= o.card.y + o.card.h);
    const hover = i < 0 ? null : i;
    if (hover !== state.hover) setState({ ...state, hover });
  });
}
fit();
draw();
