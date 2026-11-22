// The play styles in groups: one group per role and damage (AP 刺客, AD 戰士), the choice that moves the augment ranking; the
// builds of a group differ mostly in their items. Rare and losing builds stay in their group, marked (少見, 偏弱).

import type { Damage, Role, StyleData } from "./types";

export const ROLE_WORD: Record<Role, string> = { tank: "坦克", fighter: "戰士", mage: "法師", marksman: "射手", assassin: "刺客", support: "輔助" };
export const DMG_WORD: Record<Damage, string> = { phys: "AD", magic: "AP" };

export interface StyleGroup { key: string; role: Role; damage: Damage; label: string; styles: StyleData[] }

/** The styles grouped by role and damage, the groups in the order of their most played build, each group's builds most played
 * first (the data's order). */
export function groupStyles(styles: StyleData[]): StyleGroup[] {
  const groups = new Map<string, StyleGroup>();
  for (const st of styles) {
    const key = `${st.damage}:${st.role}`;
    if (!groups.has(key)) groups.set(key, { key, role: st.role, damage: st.damage, label: `${DMG_WORD[st.damage]} ${ROLE_WORD[st.role]}`, styles: [] });
    groups.get(key)!.styles.push(st);
  }
  return [...groups.values()];
}

/** A group's mark when every build in it is unsure: 偏弱 when the most played one loses, else 少見. */
export function groupWarn(g: StyleGroup): "few" | "weak" | "" {
  if (!g.styles.every((s) => s.warn)) return "";
  return g.styles[0].warn === "weak" ? "weak" : "few";
}
