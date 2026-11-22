// The sample the screens were drawn with: Dr. Mundo, a gold round, three cards. Used in the browser (npm run dev), so the
// overlay can be seen and tried without the game. Shift and the cursor work as in the app.

import type { GameData, GameState, Offer } from "./types";

// the real pick screen, measured on Zaviel's screenshots (1920 × 1080): cards 320 × 526 from y 193, small reroll icons
const CARD = { y: 193, w: 320, h: 526 }, REROLL = { y: 743, w: 68, h: 40 };
export const sampleOffers = (ids: (number | null)[]): Offer[] =>
  ids.map((id, k) => {
    const x = 960 - (ids.length * 368 - 48) / 2 + k * 368;   // centred: three from 432, four (Jhin's band) from 248
    return { id, card: { x, ...CARD }, reroll: { x: x + (CARD.w - REROLL.w) / 2 + 3, ...REROLL } };
  });

export const SAMPLES: Record<string, { state: GameState }> = {
  mundo: {
    state: { phase: "augment-pick", champion: "DrMundo", round: "金", offers: sampleOffers([1013, 1015, 3132]), shift: false, hover: null },
  },
  kaisa: {   // two play styles, to try the style tiles
    state: { phase: "augment-pick", champion: "Kaisa", round: "稜鏡", offers: sampleOffers([1015, 3078, 1134]), shift: false, hover: null },
  },
  jax: {   // seven play styles, AD 戰士 to a rare AP 刺客
    state: { phase: "augment-pick", champion: "Jax", round: "金", offers: sampleOffers([1013, 1015, 3132]), shift: false, hover: null },
  },
  ahri: {   // four play styles
    state: { phase: "augment-pick", champion: "Ahri", round: "金", offers: sampleOffers([1013, 1015, 3132]), shift: false, hover: null },
  },
  jhin: {   // four cards (Jhin's band): the side panels shrink to fit
    state: { phase: "augment-pick", champion: "Jhin", round: "稜鏡", offers: sampleOffers([1048, 1349, 2098, 2099]), shift: false, hover: null },
  },
  shards: {   // a 能力值加成 round: stat shards rated from the play style
    state: { phase: "augment-pick", champion: "Ekko", round: null,
      offers: sampleOffers([null, null, null]).map((o, k) => ({ ...o, shard: (["ap", "resist", "magicpen"] as const)[k] })), shift: false, hover: null },
  },
  shop: {   // in game with the shop open (where Zaviel's screenshot has it): the panels open beside it
    state: { phase: "in-game", champion: "Ekko", round: null, offers: [], shift: false, hover: null,
      shop: { x: 481, y: 133, w: 1047, h: 747 } },
  },
  ingame: {   // in game between picks: the panels closed, only the toggle tab
    state: { phase: "in-game", champion: "Ekko", round: null, offers: [], shift: false, hover: null },
  },
  unknown: {   // a card not read yet and a pick with no reroll left
    state: { phase: "augment-pick", champion: "DrMundo", round: "金",
      offers: sampleOffers([1353, null, 3071]).map((o) => ({ ...o, reroll: null })), shift: false, hover: null },
  },
};

/** The game's own pick screen, drawn behind the overlay in the browser only. */
export function gameLayer(data: GameData, s: GameState): string {
  const champ = s.champion ? data.champions[s.champion] : undefined;
  const splash = champ ? `https://ddragon.leagueoflegends.com/cdn/img/champion/splash/${s.champion}_0.jpg` : "";
  let h = (splash ? `<img class="abs g-splash" src="${splash}" alt="">` : "") + `<div class="abs g-dim"></div><div class="abs g-title">選擇一個強化</div>`;
  if (s.shop) h += `<div class="abs g-card" style="left:${s.shop.x}px;top:${s.shop.y}px;width:${s.shop.w}px;height:${s.shop.h}px"><div class="g-name" style="margin-top:320px">商店</div></div>`;
  for (const o of s.offers) {
    const a = o.id != null ? data.augments[String(o.id)] : undefined;
    h += `<div class="abs g-card" style="left:${o.card.x}px;top:${o.card.y}px;width:${o.card.w}px;height:${o.card.h}px">`
      + (a ? `<img src="${a.icon}" alt=""><div class="g-rar">${a.rarity}</div><div class="g-name">${a.name}</div>` : `<div class="g-name" style="margin-top:200px">？</div>`) + `</div>`;
    if (o.reroll) h += `<div class="abs g-reroll" style="left:${o.reroll.x}px;top:${o.reroll.y}px;width:${o.reroll.w}px;height:${o.reroll.h}px">↻</div>`;
  }
  return h;
}
