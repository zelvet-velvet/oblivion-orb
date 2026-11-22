// The overlay's motion. The overlay is redrawn from scratch on every change (a cursor move, Shift), so a plain CSS
// animation would start over on each redraw. Each animated part has a key instead: the first draw that shows it notes
// the time and the animation, later draws carry on where it is (a negative delay), and a part missing from a draw is
// forgotten, so it animates in again when it comes back.

const seen = new Map<string, { t: number; name: string }>();
let drawn = new Set<string>();

export const FADE = 200, FLIP = 460;

/** The style that runs (or carries on) the animation `name`, `ms` long, of the part `key`; "" once it is over. */
export function motion(key: string, name: string, ms: number, now = performance.now()): string {
  drawn.add(key);
  let s = seen.get(key);
  if (!s) seen.set(key, (s = { t: now, name }));
  const age = now - s.t;
  return age < ms ? `animation:${s.name} ${ms}ms cubic-bezier(.2,.7,.3,1) ${-Math.round(age)}ms both;` : "";
}

/** After each draw: forget the parts it did not show. */
export function endDraw(): void {
  for (const k of seen.keys()) if (!drawn.has(k)) seen.delete(k);
  drawn = new Set();
}

// ---- images: shown only once loaded, so a panel never pops in empty and fills in icon by icon ----
const images = new Map<string, "loading" | "ok" | "failed">();
const kept: HTMLImageElement[] = [];   // the decoded images stay in memory, so a redraw paints them at once
const WAIT = 4000;                     // an icon that has not come in by then is left out, the panel shows without it

/** Whether every image is in (or given up on); the ones not asked for yet start loading and call `then` when done. */
export function loaded(urls: string[], then?: () => void): boolean {
  let all = true;
  for (const u of urls) {
    if (!u) continue;
    const s = images.get(u);
    if (s === "loading") all = false;
    if (s) continue;
    all = false;
    images.set(u, "loading");
    const img = new Image();
    kept.push(img);
    // a late image still comes in: it is drawn from the next redraw on
    const done = (ok: boolean) => { if (images.get(u) === "loading" || (ok && images.get(u) === "failed")) { images.set(u, ok ? "ok" : "failed"); then?.(); } };
    const timer = setTimeout(() => done(false), WAIT);
    img.src = u;
    img.decode().then(() => done(true), () => done(false)).finally(() => clearTimeout(timer));
  }
  return all;
}

/** An image that came in (a failed or late one is drawn without). */
export const imageOk = (u: string) => images.get(u) === "ok";
