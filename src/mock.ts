// The sample the screens were drawn with: Dr. Mundo, a gold round, three cards. Used in the browser (npm run dev), so the
// overlay can be seen and tried without the game. Shift and the cursor work as in the app.

import type { ChampionHint, GameData, GameState, Offer } from "./types";

const CARD = { y: 264, w: 300, h: 448 }, REROLL = { y: 736, w: 184, h: 48 };
export const sampleOffers = (ids: (number | null)[]): Offer[] =>
  ids.map((id, k) => {
    const x = 470 + k * 340;
    return { id, card: { x, ...CARD }, reroll: { x: x + (CARD.w - REROLL.w) / 2, ...REROLL } };
  });

export const SAMPLES: Record<string, { state: GameState; hint: ChampionHint | null }> = {
  mundo: {
    state: { phase: "augment-pick", champion: "DrMundo", round: "金", offers: sampleOffers([1353, 3075, 3071]), shift: false, hover: null },
    hint: { icon: "https://ddragon.leagueoflegends.com/cdn/16.23.1/img/spell/DrMundoQ.png", line: "Q 不吃 AP、AD、生命", look: "找增傷、穿透類強化" },
  },
  kaisa: {   // two play styles, to try the style list
    state: { phase: "augment-pick", champion: "Kaisa", round: "稜鏡", offers: sampleOffers([1015, 3078, 1134]), shift: false, hover: null },
    hint: null,
  },
  unknown: {   // a card not read yet and a pick with no reroll left
    state: { phase: "augment-pick", champion: "DrMundo", round: "金",
      offers: sampleOffers([1353, null, 3071]).map((o) => ({ ...o, reroll: null })), shift: false, hover: null },
    hint: null,
  },
};

/** The game's own pick screen, drawn behind the overlay in the browser only. */
export function gameLayer(data: GameData, s: GameState): string {
  const champ = s.champion ? data.champions[s.champion] : undefined;
  const splash = champ ? `https://ddragon.leagueoflegends.com/cdn/img/champion/splash/${s.champion}_0.jpg` : "";
  let h = (splash ? `<img class="abs g-splash" src="${splash}" alt="">` : "") + `<div class="abs g-dim"></div><div class="abs g-title">選擇一個強化</div>`;
  for (const o of s.offers) {
    const a = o.id != null ? data.augments[String(o.id)] : undefined;
    h += `<div class="abs g-card" style="left:${o.card.x}px;top:${o.card.y}px;width:${o.card.w}px;height:${o.card.h}px">`
      + (a ? `<img src="${a.icon}" alt=""><div class="g-rar">${a.rarity}</div><div class="g-name">${a.name}</div>` : `<div class="g-name" style="margin-top:200px">？</div>`) + `</div>`;
    if (o.reroll) h += `<div class="abs g-reroll" style="left:${o.reroll.x}px;top:${o.reroll.y}px;width:${o.reroll.w}px;height:${o.reroll.h}px">↻&nbsp;&nbsp;重骰</div>`;
  }
  return h;
}
