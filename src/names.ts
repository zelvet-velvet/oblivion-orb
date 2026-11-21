// Matches a card name read by the OCR to an augment. Exact after dropping spaces and punctuation; otherwise the closest
// name within a small edit distance (a character or two misread); otherwise nothing, so the card shows 未辨識 rather
// than a wrong verdict.

import type { AugmentInfo } from "./types";

const clean = (s: string) => s.replace(/[\s\p{P}\p{S}]/gu, "");

function distance(a: readonly string[], b: readonly string[]): number {
  const d = Array.from({ length: a.length + 1 }, (_, i) => [i, ...Array(b.length).fill(0)]);
  for (let j = 1; j <= b.length; j++) d[0][j] = j;
  for (let i = 1; i <= a.length; i++)
    for (let j = 1; j <= b.length; j++)
      d[i][j] = Math.min(d[i - 1][j] + 1, d[i][j - 1] + 1, d[i - 1][j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
  return d[a.length][b.length];
}

export function makeNameMatcher(augments: Record<string, AugmentInfo>) {
  const byName = new Map<string, number>();
  for (const [id, a] of Object.entries(augments)) {
    const n = clean(a.name);
    if (n && !byName.has(n)) byName.set(n, Number(id));
  }
  const names = [...byName.keys()].map((n) => [n, [...n]] as const);
  return (read: string): number | null => {
    const r = clean(read);
    if (!r) return null;
    const exact = byName.get(r);
    if (exact !== undefined) return exact;
    const rc = [...r], limit = rc.length <= 3 ? 1 : 2;
    let best: string | null = null, bestD = Infinity, tie = false;
    for (const [n, nc] of names) {
      if (Math.abs(nc.length - rc.length) > limit) continue;
      const dd = distance(rc, nc);
      if (dd < bestD) { best = n; bestD = dd; tie = false; } else if (dd === bestD) tie = true;
    }
    return best !== null && bestD <= limit && !tie ? byName.get(best)! : null;
  };
}
