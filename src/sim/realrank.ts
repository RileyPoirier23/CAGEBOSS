/**
 * Real-world rankings sync: data/rankings/real_snapshot.json maps the current
 * UFC champions / top 10s to our parody fighters. On a new game the parodies are
 * moved into their real divisions and their ranking points are seeded so the
 * in-game walls (and P4P) start out in the real order. Edit the JSON to resync.
 */
import type { GameState } from '../core/types';
import { content } from '../core/content';
import { ensureCareer } from './career';

/** Returns the real champion's id per division (only parodies that exist in this save). */
export function applyRealRankings(s: GameState): Record<string, string> {
  const snap = content().career.realRankings;
  const champs: Record<string, string> = {};
  if (!snap?.divisions) return champs;
  const divs = new Set(content().divisions.map((d) => d.id));
  const c = ensureCareer(s);
  const seen = new Set<string>();
  for (const [div, d] of Object.entries(snap.divisions)) {
    if (!divs.has(div)) continue;
    [d.champion, ...d.ranked].forEach((e, pos) => {
      const f = e.parody ? s.fighters[e.parody] : null;
      if (!f || f.legend || seen.has(f.id)) return; // fighters ranked in two divisions keep the first
      seen.add(f.id);
      f.division = div;
      c.rp[f.id] = 200 - pos * 6;
      if (pos === 0) champs[div] = f.id;
    });
  }
  return champs;
}
