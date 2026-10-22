/**
 * Momentum in a watched fight: who has the crowd and the round right now. Each action line adds its
 * weight to the man who did it and everything fades a little with every line, so a flurry builds a
 * lead and a quiet spell lets it go. Shared by the booth (momentum-swing calls) and the watch screen
 * (the tug-of-war bar and the crowd's heat). Presentation only: nothing here feeds back into a fight.
 */
import type { TickerLine } from '../core/types';

/** How much each ticker key swings the fight toward the man who did it. */
export const MOM_W: Record<string, number> = {
  land_jab: 0.5, land_cross: 1, land_hook: 1.3, land_uppercut: 1.3, land_overhand: 1.3, land_combo: 1.3, land_body: 0.8,
  land_legkick: 0.6, land_calfkick: 0.7, land_bodykick: 1,
  land_headkick: 3, land_spinning: 3, land_flying: 3, land_superman: 2, land_knee: 1.2, land_elbow: 1.3,
  rocked: 3, knockdown: 5, takedown: 1.5, sweep: 2, sub_attempt: 2, counter: 2, cut: 1.5,
  gnp: 0.6, gnp_elbow: 1.4, sprawl: 0.6, escape: 1,
};

/** Step momentum m (per side) over one ticker line. Booth lines don't count; a new round starts level. */
export function stepMomentum(m: [number, number], l: TickerLine): void {
  if (l.speaker) return;
  if (l.key === 'opening' || l.key === 'round_start') {
    m[0] = 0;
    m[1] = 0;
    return;
  }
  m[0] *= 0.9;
  m[1] *= 0.9;
  const w = MOM_W[l.key ?? ''] ?? 0;
  if (l.side >= 0 && w > 0) m[l.side as 0 | 1] += w;
}

/** Who has it: +1 all red corner (side 0) .. -1 all blue corner (side 1). */
export function momLead(m: [number, number]): number {
  return (m[0] - m[1]) / (m[0] + m[1] + 3);
}
