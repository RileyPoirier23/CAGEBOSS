/**
 * Bot policies for the headless simulator.
 *   greedy   - maximises money: underpays, buries problems, takes shady deals
 *   balanced - plays like a decent human: inspects, pays fair-ish, picks sensible options
 *   chaos    - random everything
 */
import type { GameState, DeskDoc, Stamp } from '../core/types';
import { Rng } from '../core/rng';
import type { Policy } from './week';
import { makeOffer } from './contracts';
import { def } from '../storylets/engine';
import { acceptTvOffer } from './world';
import { marketPurse, SCOUT_COST, overall, isOurs } from './fighters';
import { spend } from './econ';
import { sign, makeContract } from './newgame';

function pickByHint(s: GameState, iid: string, options: number[], rng: Rng, mode: 'greedy' | 'balanced'): number {
  const inst = s.storylets.pending.find((x) => x.iid === iid);
  const d = inst ? def(inst.id) : undefined;
  if (!d || !options.length) return options[0] ?? 0;
  return rng.weighted(options, (i) => {
    const c = d.choices[i];
    const bot = c.bot ?? 0;
    const ethics = c.ethics ?? 0;
    const costly = (c.effects ?? []).some((e) => /cash\s*-=|spend\(/.test(e)) ? 1 : 0;
    if (mode === 'greedy') return Math.max(0.05, 1 + bot * 1.5 - ethics * 0.6 - costly * 0.5);
    return Math.max(0.05, 1 + bot * 0.6 + ethics * 0.5 - costly * 0.2);
  }) ?? options[0];
}

function tvAndSigning(s: GameState, rng: Rng, greedy: boolean): void {
  // take the best TV offer
  const best = s.market.tvOffers.slice().sort((a, b) => b.tier - a.tier || b.perEvent - a.perEvent)[0];
  if (best && (!s.promotion.tv || best.tier > s.promotion.tv.tier || best.perEvent > s.promotion.tv.perEvent * 1.1 || s.promotion.tv.until - s.week < 8)) acceptTvOffer(s, best.network);
  // keep the roster healthy: sign free agents when thin
  const ours = Object.values(s.fighters).filter(isOurs);
  const target = [0, 48, 70, 110, 150, 170][s.act] ?? 80;
  if (ours.length < target && s.promotion.cash > 0) {
    const fas = Object.values(s.fighters)
      .filter((f) => f.status === 'free-agent' && !f.legend && s.divisionsOpen.includes(f.division) && f.age < 36)
      .sort((a, b) => overall(b.skills) + b.starPower - (overall(a.skills) + a.starPower));
    for (const f of fas.slice(0, rng.int(1, 3))) {
      if (!greedy && f.scout < 2 && s.promotion.cash > SCOUT_COST[2] * 5) {
        spend(s, 'scouting', SCOUT_COST[2]);
        f.scout = 2;
      }
      const c = makeContract(s, f, rng);
      if (greedy) c.purse = Math.round((c.purse * 0.85) / 500) * 500;
      sign(s, f, c);
    }
  }
}

export const greedy: Policy = {
  name: 'greedy',
  inspect: (_s, _d, rng) => rng.chance(0.6),
  stamp: (_s: GameState, d: DeskDoc, rng: Rng): Stamp => {
    if (d.type === 'weighin') return d.violations.length ? (rng.chance(0.5) ? 'approve' : 'escalate') : 'approve';
    if (d.type === 'drug' && d.violations.length) return rng.chance(0.6) ? 'bury' : 'deny';
    if (d.type === 'expense' && d.violations.length) return 'deny';
    if (d.type === 'sponsor') return 'approve';
    if (d.violations.length && d.meta.flagged) return rng.chance(0.3) ? 'approve' : 'deny';
    return d.violations.length ? 'deny' : 'approve';
  },
  choose: (s, iid, options, rng) => pickByHint(s, iid, options, rng, 'greedy'),
  negotiate: (s, negId, rng) => {
    const n = s.negotiations.find((x) => x.id === negId);
    if (!n) return;
    const f = s.fighters[n.fighter];
    const mp = marketPurse(s, f);
    let guard = 0;
    while (s.negotiations.some((x) => x.id === negId) && guard++ < 3) {
      const cur = s.negotiations.find((x) => x.id === negId)!;
      const r = makeOffer(s, negId, { purse: Math.round((Math.min(cur.ask.purse, mp * (0.75 + guard * 0.1))) / 500) * 500, winBonus: Math.round(cur.ask.winBonus * 0.7 / 500) * 500, bouts: 5, champClause: false }, rng);
      if (r.outcome !== 'countered') break;
    }
  },
  weekly: (s, rng) => tvAndSigning(s, rng, true),
  bonuses: () => [],
};

export const balanced: Policy = {
  name: 'balanced',
  inspect: () => true,
  stamp: (_s, d) => {
    if (d.type === 'weighin') return d.violations.length ? 'escalate' : 'approve';
    return d.violations.length ? 'deny' : 'approve';
  },
  choose: (s, iid, options, rng) => pickByHint(s, iid, options, rng, 'balanced'),
  negotiate: (s, negId, rng) => {
    let guard = 0;
    while (s.negotiations.some((x) => x.id === negId) && guard++ < 3) {
      const cur = s.negotiations.find((x) => x.id === negId)!;
      const f = s.fighters[cur.fighter];
      const mp = marketPurse(s, f);
      const purse = Math.round(Math.min(cur.ask.purse, Math.max(mp, cur.ask.purse * (0.85 + guard * 0.06))) / 500) * 500;
      const r = makeOffer(s, negId, { purse, winBonus: cur.ask.winBonus, bouts: cur.ask.bouts, champClause: cur.ask.champClause }, rng);
      if (r.outcome !== 'countered') break;
    }
  },
  weekly: (s, rng) => tvAndSigning(s, rng, false),
};

export const chaos: Policy = {
  name: 'chaos',
  inspect: (_s, _d, rng) => rng.chance(0.3),
  stamp: (_s, _d, rng) => rng.pick(['approve', 'deny', 'escalate', 'bury'] as Stamp[]),
  choose: (_s, _iid, options, rng) => rng.pick(options),
  negotiate: (s, negId, rng) => {
    const n = s.negotiations.find((x) => x.id === negId);
    if (!n || rng.chance(0.3)) return;
    makeOffer(s, negId, { purse: Math.round((n.ask.purse * rng.float(0.5, 1.4)) / 500) * 500, winBonus: n.ask.winBonus, bouts: rng.int(1, 6), champClause: rng.chance(0.5) }, rng);
  },
  weekly: (s, rng) => {
    if (rng.chance(0.5)) tvAndSigning(s, rng, rng.chance(0.5));
  },
};

export const POLICIES: Record<string, Policy> = { greedy, balanced, chaos };
