/**
 * Contract negotiations: renewals, free-agent signings and holdouts, with
 * rival promotions bidding against you.
 */
import type { GameState, Negotiation, Fighter } from '../core/types';
import { content } from '../core/content';
import { Rng } from '../core/rng';
import { clamp } from '../core/format';
import { marketPurse, fullName, addCareerLog, isChamp, pronounize } from './fighters';
import { adjustMeter } from './econ';
import { beltsOf, vacateBelt } from './rankings';
import { addNews } from './news';
import { sign } from './newgame';

export type Offer = NonNullable<Negotiation['offer']>;

export function askFor(s: GameState, f: Fighter, rng: Rng): Offer {
  const mp = marketPurse(s, f);
  const greed = (f.traits.includes('Mercenary') ? 0.25 : 0) + (f.traits.includes('Diva') ? 0.15 : 0) + (f.traits.includes('Business Savvy') ? 0.1 : 0) - (f.traits.includes('Loyal') ? 0.1 : 0);
  const purse = Math.round((mp * (1.05 + greed + rng.float(0, 0.2))) / 500) * 500;
  return { purse, winBonus: Math.round((purse * (f.marquee ? 0.6 : 1)) / 500) * 500, bouts: rng.int(3, 5), champClause: isChamp(s, f.id) || rng.chance(0.4) };
}

export function openNegotiation(s: GameState, f: Fighter, kind: Negotiation['kind'], rng: Rng): Negotiation | null {
  if (s.negotiations.some((n) => n.fighter === f.id)) return null;
  const ask = askFor(s, f, rng);
  const aliveRivals = content().rivals.filter((r) => s.rivals[r.id]?.alive);
  let rivalBid: string | null = null;
  let rivalPurse = 0;
  if (aliveRivals.length && f.starPower > 30 && rng.chance(0.25 + f.starPower / 200 - f.loyalty / 300)) {
    const r = rng.weighted(aliveRivals, (x) => x.aggression * (s.sandbox?.rivalAggression ?? 1))!;
    rivalBid = r.id;
    rivalPurse = Math.round((ask.purse * rng.float(1.05, r.type === 'foreign' ? 2.2 : 1.5)) / 500) * 500;
  }
  const n: Negotiation = {
    id: 'neg' + s.week + '_' + f.id,
    fighter: f.id,
    kind,
    ask,
    offer: null,
    round: 0,
    patience: f.traits.includes('Loyal') ? 3 : f.traits.includes('Mercenary') || f.traits.includes('Hothead') ? 1 : 2,
    rivalBid,
    rivalPurse,
    week: s.week,
    expires: s.week + 3,
  };
  s.negotiations.push(n);
  return n;
}

function offerValue(o: Offer): number {
  return o.purse + o.winBonus * 0.45 + (o.champClause ? o.purse * 0.05 : 0) - Math.max(0, o.bouts - 4) * o.purse * 0.04;
}

export type OfferResult = { outcome: 'accepted' | 'countered' | 'walked'; text: string };

/** Make an offer. The fighter accepts, counters or walks. */
export function makeOffer(s: GameState, negId: string, offer: Offer, rng: Rng): OfferResult {
  const n = s.negotiations.find((x) => x.id === negId);
  if (!n) return { outcome: 'walked', text: 'Negotiation not found.' };
  const f = s.fighters[n.fighter];
  n.offer = offer;
  n.round++;
  const askV = offerValue(n.ask);
  const offV = offerValue(offer);
  const loyaltyDiscount = f.loyalty / 400 + (f.traits.includes('Loyal') ? 0.08 : 0) - (f.traits.includes('Mercenary') ? 0.06 : 0);
  const rivalV = n.rivalBid ? n.rivalPurse * 1.35 : 0;
  const threshold = Math.max(askV * (0.95 - loyaltyDiscount), rivalV * (0.9 + (f.traits.includes('Mercenary') ? 0.15 : 0) - f.loyalty / 300));
  if (offV >= threshold) {
    acceptOffer(s, n, offer);
    return { outcome: 'accepted', text: `${fullName(f)} signs! ${pronounize(rng.pick(ACCEPT_LINES), f)}` };
  }
  n.patience--;
  if (offV < askV * 0.6) n.patience--; // insulting lowball
  if (n.patience <= 0) {
    walk(s, n, rng);
    return { outcome: 'walked', text: `${fullName(f)} walks away from the table. ${pronounize(rng.pick(WALK_LINES), f)}` };
  }
  // counter: meet partway
  const k = f.moneyIQ > 60 ? 0.25 : 0.4;
  n.ask = {
    purse: Math.round((n.ask.purse - (n.ask.purse - offer.purse) * k) / 500) * 500,
    winBonus: Math.round((n.ask.winBonus - (n.ask.winBonus - offer.winBonus) * k) / 500) * 500,
    bouts: n.ask.bouts,
    champClause: n.ask.champClause,
  };
  return { outcome: 'countered', text: `${f.first}'s camp counters at ${n.ask.purse.toLocaleString()} show / ${n.ask.winBonus.toLocaleString()} win. ${pronounize(rng.pick(COUNTER_LINES), f)}` };
}

export function acceptOffer(s: GameState, n: Negotiation, offer: Offer): void {
  const f = s.fighters[n.fighter];
  const market = marketPurse(s, f);
  sign(s, f, { boutsLeft: offer.bouts, purse: offer.purse, winBonus: offer.winBonus, champClause: offer.champClause, exclusive: true, signedWeek: s.week });
  const fairness = offer.purse / Math.max(1, market);
  f.morale = clamp(f.morale + (fairness - 1) * 30, 0, 100);
  f.loyalty = clamp(f.loyalty + (fairness >= 1 ? 6 : -4), 0, 100);
  adjustMeter(s, 'fighters', fairness >= 1.1 ? 1 : fairness < 0.8 ? -1.5 : 0);
  s.flags.underpay = (Number(s.flags.underpay) || 0) + (fairness < 0.8 ? 1 : 0);
  s.flags.fairpay = (Number(s.flags.fairpay) || 0) + (fairness >= 1.05 ? 1 : 0);
  s.stats.signings = (s.stats.signings ?? 0) + 1;
  addCareerLog(f, `Signed a ${offer.bouts}-fight deal with ${s.promotion.name}.`);
  s.negotiations = s.negotiations.filter((x) => x !== n);
}

export function walk(s: GameState, n: Negotiation, rng: Rng): void {
  const f = s.fighters[n.fighter];
  s.negotiations = s.negotiations.filter((x) => x !== n);
  if (n.kind === 'signing') return;
  for (const b of beltsOf(s, f.id)) vacateBelt(s, b, 'contract dispute');
  if (n.rivalBid && s.rivals[n.rivalBid]?.alive) {
    f.promotion = n.rivalBid;
    f.status = 'active';
    f.contract = { boutsLeft: 4, purse: n.rivalPurse, winBonus: 0, champClause: false, exclusive: true, signedWeek: s.week };
    const r = content().rivals.find((x) => x.id === n.rivalBid);
    addCareerLog(f, `Signed with ${r?.name ?? 'a rival promotion'}.`);
    addNews(s, { tags: ['defection', 'business'], vars: { fighter: fullName(f), rival: r?.name ?? 'a rival', promotion: s.promotion.name }, weight: 4 + f.starPower / 15, tone: -0.4 });
    adjustMeter(s, 'fans', -f.starPower / 25);
    s.stats.defections = (s.stats.defections ?? 0) + 1;
  } else {
    f.promotion = null;
    f.status = 'free-agent';
    f.contract = null;
    addCareerLog(f, 'Became a free agent.');
  }
  adjustMeter(s, 'fighters', -0.5);
  void rng;
}

/** Weekly: open renewals for expiring deals and time out stale negotiations. */
export function weeklyContracts(s: GameState, rng: Rng): void {
  for (const f of Object.values(s.fighters)) {
    if (f.promotion !== 'us' || f.status !== 'active' || !f.contract) continue;
    if (f.contract.boutsLeft <= 0) openNegotiation(s, f, 'renewal', rng);
  }
  for (const n of s.negotiations.slice()) {
    if (s.week > n.expires) {
      if (n.kind === 'renewal' || n.kind === 'holdout') walk(s, n, rng);
      else s.negotiations = s.negotiations.filter((x) => x !== n);
    }
  }
}

const ACCEPT_LINES = [
  '{His} manager immediately asks for an advance.',
  '{He} celebrates by financing a Dodge Charger at 29% APR.',
  'Ink\'s dry. {He}\'s already posting about "betting on myself".',
  '{His} mom cries. {His} manager cries harder (10%).',
  '{He} signs it with a gel pen he brought from home.',
];
const COUNTER_LINES = [
  '"We both know what {he}\'s worth."',
  '{His} manager taps the table twice, like that means something.',
  '"My guy sells tickets. Your guy sells... paperwork."',
  '"Let\'s be real, the other league called."',
];
const WALK_LINES = [
  '{His} manager says "you\'ll regret this" and steals a pen.',
  '{He} posts a crying-laughing emoji with your logo.',
  '{He}\'s going to "bet on himself" somewhere else.',
  '"It was never about the money." (It was about the money.)',
];
