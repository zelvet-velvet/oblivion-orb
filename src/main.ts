// Starts the overlay. In the app (Tauri) Rust sends "game-reading" (phase and champion) and "pointer" (Shift and the cursor),
// and the window lets clicks through except over the overlay's own controls (their rects go to Rust as hit regions).
// The augment cards are not read yet (screen capture is the next step), so in the app the overlay shows in champ select. In a browser it shows a sample
// (?sample=mundo | kaisa | unknown) over a drawn game screen.

import dataJson from "./data/game-data.json";
import { gameLayer, SAMPLES } from "./mock";
import { render, type Action, type UiState } from "./overlay";
import { DEFAULT_SETTINGS, type ChampionHint, type GameData, type GameState, type Mode, type Rect, type Settings } from "./types";

const data = dataJson as unknown as GameData;
const inApp = "__TAURI_INTERNALS__" in window;
const stage = document.getElementById("stage")!;
const KEY = "oblivion-orb.settings";

function loadSettings(): Settings {
  try { return { ...DEFAULT_SETTINGS, ...JSON.parse(localStorage.getItem(KEY) ?? "{}") }; } catch { return { ...DEFAULT_SETTINGS }; }
}
function saveSettings() { try { localStorage.setItem(KEY, JSON.stringify(settings)); } catch { /* private mode: settings last the session */ } }

let settings = loadSettings();
const ui: UiState = { listOpen: false, settingsOpen: false };
let state: GameState = { phase: "idle", champion: null, round: null, offers: [], shift: false, hover: null };
let hint: ChampionHint | null = null;
let scale = 1, offX = 0, offY = 0;

function fit() {
  scale = Math.min(innerWidth / 1920, innerHeight / 1080);
  offX = (innerWidth - 1920 * scale) / 2; offY = (innerHeight - 1080 * scale) / 2;
  for (const el of [stage, document.getElementById("game")]) if (el) el.style.transform = `translate(${offX}px, ${offY}px) scale(${scale})`;
}

function draw() {
  render(stage, { data, state, settings, hint, ui });
  if (inApp) void sendHitRegions();
}

/** The rects (in window pixels) where the overlay takes the mouse; everywhere else clicks go to the game. */
async function sendHitRegions() {
  const rects: Rect[] = [...stage.querySelectorAll<HTMLElement>("[data-hit]")].map((el) => {
    const r = el.getBoundingClientRect();
    return { x: r.left, y: r.top, w: r.width, h: r.height };
  });
  const { invoke } = await import("@tauri-apps/api/core");
  await invoke("set_hit_regions", { rects, scaleFactor: devicePixelRatio });
}

function act(a: Action) {
  switch (a.type) {
    case "toggle-list": ui.listOpen = !ui.listOpen; break;
    case "pick-style": settings = { ...settings, styleKey: a.key }; ui.listOpen = false; break;
    case "mode": settings = { ...settings, mode: a.mode }; break;
    case "open-settings": ui.settingsOpen = true; ui.listOpen = false; break;
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
    act({ type: "setting", key: el.dataset.key as keyof Settings, value: raw === "true" ? true : raw === "false" ? false : raw });
  } else act({ type: t } as Action);
});
addEventListener("keydown", (e) => { if (e.key === "Escape" && (ui.settingsOpen || ui.listOpen)) { ui.settingsOpen = ui.listOpen = false; draw(); } });
addEventListener("resize", () => { fit(); draw(); });

function setState(next: GameState) {
  if (next.champion !== state.champion) { settings = { ...settings, styleKey: null }; ui.listOpen = false; }
  state = next; draw();
}

interface Reading { phase: "idle" | "champ-select" | "in-game"; champion: string | null; championKey: number | null }
interface Pointer { shift: boolean; x: number; y: number }
const byKey = new Map(Object.entries(data.champions).map(([id, c]) => [c.key, id]));

if (inApp) {
  void (async () => {
    const { listen } = await import("@tauri-apps/api/event");
    await listen<Reading>("game-reading", ({ payload: r }) => {
      const champion = r.champion ?? (r.championKey != null ? byKey.get(r.championKey) ?? null : null);
      // the offers stay as they are until the card reader sends them
      setState({ ...state, phase: state.phase === "augment-pick" && r.phase === "in-game" ? state.phase : r.phase, champion });
    });
    await listen<Pointer>("pointer", ({ payload: p }) => {
      const x = (p.x - offX) / scale, y = (p.y - offY) / scale;
      const i = state.offers.findIndex((o) => x >= o.card.x && x <= o.card.x + o.card.w && y >= o.card.y && y <= o.card.y + o.card.h);
      const hover = p.shift && i >= 0 ? i : null;
      if (p.shift !== state.shift || hover !== state.hover) setState({ ...state, shift: p.shift, hover });
    });
  })();
} else {
  // the browser: a sample over a drawn game screen; Shift and the cursor as in the app
  document.body.classList.add("browser");
  const name = new URLSearchParams(location.search).get("sample") ?? "mundo";
  const sample = SAMPLES[name] ?? SAMPLES.mundo;
  hint = sample.hint;
  const game = document.createElement("div");
  game.id = "game"; game.innerHTML = gameLayer(data, sample.state);
  document.body.insertBefore(game, stage);
  const bar = document.createElement("div");
  bar.className = "mock-bar"; bar.textContent = `sample: ${name} · ${Object.keys(SAMPLES).map((k) => `?sample=${k}`).join(" ")} · patch ${data.patch}`;
  document.body.append(bar);
  state = structuredClone(sample.state);
  const setShift = (on: boolean) => { if (state.shift !== on) setState({ ...state, shift: on }); };
  addEventListener("keydown", (e) => { if (e.key === "Shift") setShift(true); });
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
