// The overlay's drawn parts as SVG, the same drawing as the screens (oblivion-orb-folio, Tools/screens/overlay_mock.py):
// the League client's flat plate with one hairline, the tier as the game's augment icon tile, the best card's line and the
// reroll's corner brackets.

import type { Tier } from "./types";

export const GOLD = "#C8AA6E";
export const TEAL = "#0AC8B9";
export const EMBER = "#FF8A3D";

/** The augment icon tile per tier: frame (top, bottom), the thin metal line, the light from its foot, the letter. */
export const TILE: Record<Tier, { frame: [string, string]; line: string; glow: [string, number]; ink: string }> = {
  S: { frame: ["#3B2C60", "#110B20"], line: "#D9C2FF", glow: ["#8A5BFF", 0.95], ink: "#F3EAFF" },
  A: { frame: ["#40301A", "#0F0A05"], line: "#F7D688", glow: ["#D08A28", 0.85], ink: "#FBE3A4" },
  B: { frame: ["#3A2C16", "#0E0904"], line: "#E2BC6C", glow: ["#B5761F", 0.7], ink: "#EED193" },
  C: { frame: ["#2A2F35", "#0B0D10"], line: "#7E868E", glow: ["#3C454E", 0.55], ink: "#97A0A8" },
};
export const VERDICT_INK: Record<Tier, string> = { S: "#F4EEFF", A: "#F6E2B0", B: "#EBD7A8", C: "#A3ABB3" };
export const WHY_INK: Record<Tier, string> = { S: "#C9BCE6", A: "#C4B48F", B: "#BBAA86", C: "#7F878E" };

let uid = 0;
const svg = (w: number, h: number, body: string, defs = "") =>
  `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}" viewBox="0 0 ${w} ${h}" aria-hidden="true"><defs>${defs}</defs>${body}</svg>`;
const chamfer = (x: number, y: number, w: number, h: number, c: number) =>
  `${x + c},${y} ${x + w - c},${y} ${x + w},${y + c} ${x + w},${y + h - c} ${x + w - c},${y + h} ${x + c},${y + h} ${x},${y + h - c} ${x},${y + c}`;

/** The client's plate: flat near-black, one hairline, the corners cut a little. */
export function plate(w: number, h: number, line = GOLD, opacity = 0.65): string {
  return svg(w, h, `<polygon points="${chamfer(0.75, 0.75, w - 1.5, h - 1.5, 6)}" fill="#0A0E16" fill-opacity="0.94" stroke="${line}" stroke-opacity="${opacity}" stroke-width="1.5"/>`);
}

/** The tier as the game's augment icon tile: a thick dark frame tinted by the metal, a thin metal line, the face lit from its foot. */
export function tile(tier: Tier, size = 56): string {
  const T = TILE[tier], id = `t${uid++}`, r = size * 0.24, k = Math.round(size * 0.13 * 10) / 10, pad = 2;
  const W = size + 2 * pad, x = pad, ix = x + k, iw = size - 2 * k, ir = r - k * 0.7;
  const defs = `<linearGradient id="${id}r" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="${T.frame[0]}"/><stop offset="1" stop-color="${T.frame[1]}"/></linearGradient>`
    + `<radialGradient id="${id}f" cx=".5" cy="1.05" r=".8"><stop offset="0" stop-color="${T.glow[0]}" stop-opacity="${T.glow[1]}"/><stop offset="1" stop-color="${T.glow[0]}" stop-opacity="0"/></radialGradient>`;
  const body = `<rect x="${x - 1}" y="${x - 1}" width="${size + 2}" height="${size + 2}" rx="${r + 1}" fill="#04050A"/>`
    + `<rect x="${x}" y="${x}" width="${size}" height="${size}" rx="${r}" fill="url(#${id}r)"/>`
    + `<rect x="${x + 0.5}" y="${x + 0.5}" width="${size - 1}" height="${size - 1}" rx="${r - 0.5}" fill="none" stroke="${T.line}" stroke-opacity=".22"/>`
    + `<rect x="${ix}" y="${ix}" width="${iw}" height="${iw}" rx="${ir}" fill="#07080D"/>`
    + `<rect x="${ix}" y="${ix}" width="${iw}" height="${iw}" rx="${ir}" fill="url(#${id}f)"/>`
    + `<rect x="${ix}" y="${ix}" width="${iw}" height="${iw}" rx="${ir}" fill="none" stroke="${T.line}" stroke-width="1.6"/>`
    + `<text x="${W / 2}" y="${W / 2}" text-anchor="middle" dominant-baseline="central" font-family="Bahnschrift, 'Segoe UI', sans-serif" font-weight="700" font-size="${Math.round(size * 0.45)}" fill="${T.ink}">${tier}</text>`;
  return svg(W, W, body, defs);
}

/** The best card: one lilac line round it, a dark gap, a faint halo. `m` px of room round the card for the halo. */
export function bestFrame(w: number, h: number, m = 24, r = 12): string {
  const L = TILE.S.line, id = `b${uid++}`, W = w + 2 * m, H = h + 2 * m;
  const x = m - 4, y = m - 4, ww = w + 8, hh = h + 8, rr = r + 4;
  const defs = `<filter id="${id}" x="-50%" y="-50%" width="200%" height="200%"><feGaussianBlur stdDeviation="6"/></filter>`;
  return svg(W, H,
    `<rect x="${x}" y="${y}" width="${ww}" height="${hh}" rx="${rr}" fill="none" stroke="${L}" stroke-width="6" opacity=".18" filter="url(#${id})"/>`
    + `<rect x="${m - 1.5}" y="${m - 1.5}" width="${w + 3}" height="${h + 3}" rx="${r + 1.5}" fill="none" stroke="#04050A" stroke-width="2"/>`
    + `<rect x="${x}" y="${y}" width="${ww}" height="${hh}" rx="${rr}" fill="none" stroke="${L}" stroke-width="2.5"/>`, defs);
}

/** Four ember corner brackets just outside a reroll button `w` × `h`, `m` px of room round it. */
export function brackets(w: number, h: number, m = 24): string {
  const g = 6, L = 16, W = w + 2 * m, H = h + 2 * m;
  let body = "";
  for (const [sx, sy] of [[0, 0], [1, 0], [0, 1], [1, 1]]) {
    const cx = sx === 0 ? m - g : m + w + g, cy = sy === 0 ? m - g : m + h + g;
    const dx = sx === 0 ? L : -L, dy = sy === 0 ? L : -L;
    body += `<path d="M${cx},${cy + dy} L${cx},${cy} L${cx + dx},${cy}" fill="none" stroke="${EMBER}" stroke-width="3.5" stroke-linecap="square"/>`;
  }
  return svg(W, H, body);
}

/** A switch: teal when on. */
export function toggle(on: boolean): string {
  const w = 60, h = 32;
  return svg(w, h, `<rect x="1" y="1" width="${w - 2}" height="${h - 2}" rx="${h / 2 - 1}" fill="${on ? "#0A5F5A" : "#1A1F2A"}" stroke="${on ? TEAL : "#785A28"}" stroke-width="2"/>`
    + `<circle cx="${on ? w - h / 2 : h / 2}" cy="${h / 2}" r="${h / 2 - 6}" fill="${on ? "#F0E6D2" : "#5B5A56"}"/>`);
}
