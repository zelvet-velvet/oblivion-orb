// The overlay's drawn parts as SVG, the same drawing as the screens (oblivion-orb-folio, Tools/screens/overlay_mock.py):
// the client's flat plate with one hairline, the tier nameplate framed in the rarity metal of the fit, the Hextech frame
// round the best card, the ember tag under the reroll worth taking, role glyphs and damage pills.

import type { Damage, Role, Tier } from "./types";

export const GOLD = "#C8AA6E";
export const TEAL = "#0AC8B9";
export const EMBER = "#FF8A3D";
export const INK = "#F0E6D2";
export const DIM = "#A09B8C";
/** The game's own tooltip colours: AP purple-blue, AD orange. */
export const AP_COL = "#8B7CFF";
export const AD_COL = "#FF8C34";
export const DMG: Record<Damage, [string, string]> = { phys: ["物理", AD_COL], magic: ["魔法", AP_COL] };

/** The rarity metal of each tier (S prismatic, A and B gold, C dim silver): frame stops, inner edge, letter, face. */
export const METAL: Record<Tier, { stops: [number, string][]; edge: string; ink: string; face: string; glow: [string, number, number] }> = {
  S: { stops: [[0, "#F6C6FF"], [0.33, "#B9A4FF"], [0.66, "#8FE3FF"], [1, "#F9E7A8"]], edge: "#FFFFFF", ink: "#EBDDFF", face: "#17112A", glow: ["#C9A8FF", 0.85, 12] },
  A: { stops: [[0, "#FBE3A0"], [0.5, "#C9963E"], [1, "#F2CF7E"]], edge: "#FFF4D0", ink: "#F7D688", face: "#1D150A", glow: ["#F2C66A", 0.55, 9] },
  B: { stops: [[0, "#E8C77E"], [0.5, "#A87A2E"], [1, "#D9B064"]], edge: "#F6E2B0", ink: "#E2BC6C", face: "#1A1309", glow: ["#E2B060", 0.45, 8] },
  C: { stops: [[0, "#8C949C"], [0.5, "#565D64"], [1, "#7A8189"]], edge: "#AEB5BC", ink: "#9AA2AA", face: "#14171B", glow: ["#9AA2AA", 0.25, 6] },
};
export const VERDICT_INK: Record<Tier, string> = { S: "#FFFFFF", A: "#FFF1CC", B: "#F7E6BE", C: "#C3C9CF" };
export const WHY_INK: Record<Tier, string> = { S: "#E3D4FF", A: "#E8D3A0", B: "#D9C394", C: "#9AA2AA" };
export const EMBER_TXT = "#FFB27A";

let uid = 0;
const svg = (w: number, h: number, body: string, defs = "") =>
  `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}" viewBox="0 0 ${w} ${h}" aria-hidden="true"><defs>${defs}</defs>${body}</svg>`;
const chamfer = (x: number, y: number, w: number, h: number, c: number) =>
  `${x + c},${y} ${x + w - c},${y} ${x + w},${y + c} ${x + w},${y + h - c} ${x + w - c},${y + h} ${x + c},${y + h} ${x},${y + h - c} ${x},${y + c}`;
const stops = (st: [number, string][]) => st.map(([o, c]) => `<stop offset="${o}" stop-color="${c}"/>`).join("");
const blur = (id: string, sd: number) => `<filter id="${id}" x="-50%" y="-50%" width="200%" height="200%"><feGaussianBlur stdDeviation="${sd}"/></filter>`;

/** The client's plate: flat near-black, one hairline, the corners cut a little. */
export function plate(w: number, h: number, line = GOLD, opacity = 0.65): string {
  return svg(w, h, `<polygon points="${chamfer(0.75, 0.75, w - 1.5, h - 1.5, 6)}" fill="#0A0E16" fill-opacity="0.94" stroke="${line}" stroke-opacity="${opacity}" stroke-width="1.5"/>`);
}

/** A plate framed like the game's augment cards: a thick frame in the tier's rarity metal round a flat dark face. */
export function rarityPlate(tier: Tier, w: number, h: number, k = 8, r = 10): string {
  const M = METAL[tier], id = `rf${uid++}`, ir = Math.max(r - k / 2, 3);
  return svg(w, h,
    `<rect x="0" y="0" width="${w}" height="${h}" rx="${r}" fill="url(#${id})"/>`
    + `<rect x=".75" y=".75" width="${w - 1.5}" height="${h - 1.5}" rx="${r - 0.5}" fill="none" stroke="#000" stroke-opacity=".45" stroke-width="1.5"/>`
    + `<rect x="${k}" y="${k}" width="${w - 2 * k}" height="${h - 2 * k}" rx="${ir}" fill="${M.face}"/>`
    + `<rect x="${k - 0.75}" y="${k - 0.75}" width="${w - 2 * k + 1.5}" height="${h - 2 * k + 1.5}" rx="${ir}" fill="none" stroke="${M.edge}" stroke-opacity=".7" stroke-width="1.5"/>`,
    `<linearGradient id="${id}" x1="0" y1="0" x2="1" y2="1">${stops(M.stops)}</linearGradient>`);
}

/** The glow behind a nameplate, in its metal; `g` px of room round it. */
export function plateGlow(tier: Tier, w: number, h: number, g = 22): string {
  const [col, op, sw] = METAL[tier].glow, id = `pg${uid++}`;
  return svg(w + 2 * g, h + 2 * g, `<rect x="${g}" y="${g}" width="${w}" height="${h}" rx="10" fill="none" stroke="${col}" stroke-width="${sw}" opacity="${op}" filter="url(#${id})"/>`, blur(id, 7));
}

/** The tier as a small flat tile (for the banner): a dark frame, a thin metal line, the letter. */
export function tile(tier: Tier, size = 56): string {
  const M = METAL[tier], k = Math.round(size * 0.13), r = size * 0.24;
  return svg(size + 2, size + 2,
    `<rect x="1" y="1" width="${size}" height="${size}" rx="${r}" fill="#0B0E15" stroke="#04050A"/>`
    + `<rect x="${1 + k}" y="${1 + k}" width="${size - 2 * k}" height="${size - 2 * k}" rx="${r - k * 0.7}" fill="${M.face}" stroke="${M.ink}" stroke-width="1.6"/>`
    + `<text x="${size / 2 + 1}" y="${size / 2 + 1}" text-anchor="middle" dominant-baseline="central" font-family="Bahnschrift, 'Segoe UI', sans-serif" font-weight="700" font-size="${Math.round(size * 0.45)}" fill="${M.ink}">${tier}</text>`);
}

/** The best card's Hextech frame: a chamfered lilac line with a soft glow, heavy corner filigree, a gem top and foot.
 *  The card (w × h) sits `m` px in. */
export function hextechFrame(w: number, h: number, m = 34): string {
  const W = w + 2 * m, H = h + 2 * m, L = "#E3D4FF", G = "#B48CFF", ch = 18, id = `hg${uid++}`;
  const outer = chamfer(m - 9, m - 9, w + 18, h + 18, ch);
  let b = `<polygon points="${outer}" fill="none" stroke="${G}" stroke-width="10" opacity=".55" filter="url(#${id})"/>`
    + `<polygon points="${outer}" fill="none" stroke="${L}" stroke-width="3.5"/>`
    + `<polygon points="${chamfer(m - 15, m - 15, w + 30, h + 30, ch + 5)}" fill="none" stroke="${L}" stroke-opacity=".5" stroke-width="1.5"/>`;
  for (const [sx, sy] of [[0, 0], [1, 0], [0, 1], [1, 1]]) {
    const X = sx === 0 ? m - 15 : m + w + 15, Y = sy === 0 ? m - 15 : m + h + 15, dx = sx === 0 ? 1 : -1, dy = sy === 0 ? 1 : -1;
    const path = `M${X + dx * 4},${Y + dy * 58} L${X + dx * 4},${Y + dy * 12} L${X + dx * 12},${Y + dy * 4} L${X + dx * 58},${Y + dy * 4}`;
    b += `<path d="${path}" fill="none" stroke="${G}" stroke-width="10" opacity=".5" filter="url(#${id})"/>`
      + `<path d="${path}" fill="none" stroke="${L}" stroke-width="6" stroke-linejoin="miter"/>`
      + `<rect x="${X + dx * 18 - 6}" y="${Y + dy * 18 - 6}" width="12" height="12" fill="${L}" transform="rotate(45 ${X + dx * 18} ${Y + dy * 18})"/>`;
  }
  for (const gy of [m - 9, m + h + 9]) {
    const gx = W / 2;
    b += `<polygon points="${gx},${gy - 16} ${gx + 20},${gy} ${gx},${gy + 16} ${gx - 20},${gy}" fill="${G}" opacity=".6" filter="url(#${id})"/>`
      + `<polygon points="${gx},${gy - 15} ${gx + 19},${gy} ${gx},${gy + 15} ${gx - 19},${gy}" fill="#0B0F1A" stroke="${L}" stroke-width="3"/>`
      + `<polygon points="${gx},${gy - 7} ${gx + 9},${gy} ${gx},${gy + 7} ${gx - 9},${gy}" fill="${L}"/>`;
  }
  return svg(W, H, b, blur(id, 6));
}

/** The ember tag hanging under the reroll worth taking, its notch pointing up at the button. */
export function rerollTag(w = 156, h = 42): string {
  const TAG = "#B8400F", EDGE = "#FF9A55";
  return svg(w, h,
    `<path d="M${w / 2 - 9},9 L${w / 2},0 L${w / 2 + 9},9" fill="${TAG}" stroke="${EDGE}" stroke-width="1.5"/>`
    + `<rect x=".75" y="8.75" width="${w - 1.5}" height="${h - 9.5}" rx="6" fill="${TAG}" stroke="${EDGE}" stroke-width="1.5"/>`
    + `<rect x="${w / 2 - 8}" y="8" width="16" height="3" fill="${TAG}"/>`);
}

/** A plain role glyph. */
export function roleIcon(kind: Role, s = 40, col = INK): string {
  const sw = (k: number) => `stroke="${col}" stroke-width="${s * k}" stroke-linecap="round" stroke-linejoin="round" fill="none"`;
  const body: Record<Role, string> = {
    tank: `<path d="M${s / 2},${s * 0.08} L${s * 0.86},${s * 0.22} V${s * 0.5} Q${s * 0.86},${s * 0.8} ${s / 2},${s * 0.94} Q${s * 0.14},${s * 0.8} ${s * 0.14},${s * 0.5} V${s * 0.22} Z" ${sw(0.08)}/><path d="M${s / 2},${s * 0.24} V${s * 0.78}" ${sw(0.06)} stroke-opacity=".6"/>`,
    fighter: `<path d="M${s * 0.2},${s * 0.8} L${s * 0.8},${s * 0.2}" ${sw(0.09)}/><path d="M${s * 0.2},${s * 0.52} L${s * 0.48},${s * 0.8}" ${sw(0.08)}/>`,
    mage: `<path d="M${s / 2},${s * 0.1} L${s * 0.6},${s * 0.4} L${s * 0.9},${s / 2} L${s * 0.6},${s * 0.6} L${s / 2},${s * 0.9} L${s * 0.4},${s * 0.6} L${s * 0.1},${s / 2} L${s * 0.4},${s * 0.4} Z" ${sw(0.07)}/>`,
    marksman: `<path d="M${s * 0.15},${s * 0.85} L${s * 0.85},${s * 0.15}" ${sw(0.07)}/><path d="M${s * 0.6},${s * 0.15} H${s * 0.85} V${s * 0.4}" ${sw(0.07)}/><path d="M${s * 0.15},${s * 0.65} V${s * 0.85} H${s * 0.35}" ${sw(0.07)}/>`,
    assassin: `<path d="M${s * 0.25},${s * 0.75} L${s * 0.8},${s * 0.2} L${s * 0.72},${s * 0.42} Z" ${sw(0.07)}/><path d="M${s * 0.18},${s * 0.62} L${s * 0.38},${s * 0.82}" ${sw(0.08)}/>`,
    support: `<path d="M${s / 2},${s * 0.85} C${s * 0.1},${s * 0.55} ${s * 0.15},${s * 0.15} ${s / 2},${s * 0.35} C${s * 0.85},${s * 0.15} ${s * 0.9},${s * 0.55} ${s / 2},${s * 0.85} Z" ${sw(0.07)}/>`,
  };
  return svg(s, s, body[kind]);
}

/** The damage type spelled out: an outlined pill in AP's or AD's colour. */
export function dmgPill(d: Damage): string {
  const [label, col] = DMG[d];
  return `<span class="pill" style="color:${col};border-color:${col}">${label}</span>`;
}

/** The gear for settings. */
export function gear(s = 22, col = DIM): string {
  const c = s / 2, r1 = s * 0.3, r2 = s * 0.44, n = 8, pts: string[] = [];
  for (let k = 0; k < n * 2; k++) {
    const a = (Math.PI * k) / n, r = k % 2 === 0 ? r2 : r1;
    for (const d of [-0.16, 0.16]) pts.push(`${(c + r * Math.cos(a + d)).toFixed(1)},${(c + r * Math.sin(a + d)).toFixed(1)}`);
  }
  return svg(s, s, `<polygon points="${pts.join(" ")}" fill="none" stroke="${col}" stroke-width="${s * 0.07}" stroke-linejoin="round"/><circle cx="${c}" cy="${c}" r="${s * 0.13}" fill="none" stroke="${col}" stroke-width="${s * 0.07}"/>`);
}

/** A switch: teal when on. */
export function toggle(on: boolean): string {
  const w = 60, h = 32;
  return svg(w, h, `<rect x="1" y="1" width="${w - 2}" height="${h - 2}" rx="${h / 2 - 1}" fill="${on ? "#0A5F5A" : "#1A1F2A"}" stroke="${on ? TEAL : "#785A28"}" stroke-width="2"/>`
    + `<circle cx="${on ? w - h / 2 : h / 2}" cy="${h / 2}" r="${h / 2 - 6}" fill="${on ? "#F0E6D2" : "#5B5A56"}"/>`);
}

/** Text with AP and AD in the game's colours. */
export function richApAd(text: string): string {
  return text.replace(/[&<>]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;" })[c]!)
    .replace(/\bAP\b/g, `<b style="color:${AP_COL}">AP</b>`).replace(/\bAD\b/g, `<b style="color:${AD_COL}">AD</b>`);
}

