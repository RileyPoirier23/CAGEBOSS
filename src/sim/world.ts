/**
 * The world around the promotion: rival promotions, the combat-sports
 * ratings chart & TV offers, the corporate owner, act progression, endings.
 */
import type { GameState, RatingsRow } from '../core/types';
import { content } from '../core/content';
import { Rng } from '../core/rng';
import { clamp } from '../core/format';
import { CAREER_WEEKS } from '../core/time';
import { overall, fullName, addCareerLog } from './fighters';
import { adjustMeter, adjustHidden, sumRecord, scale } from './econ';
import { addNews } from './news';
import { activateRulesForAct } from './rules';
import { memoDoc } from './docs';
import { ensureDivisionBelts, beltsOf, vacateBelt } from './rankings';

// ---------------------------------------------------------------- rivals

export function weeklyRivals(s: GameState, rng: Rng): void {
  const aggr = s.sandbox?.rivalAggression ?? 1;
  for (const def of content().rivals) {
    const r = s.rivals[def.id];
    if (!r) continue;
    if (!r.alive) {
      if (!r.mergedInto && def.enterAct <= s.act && s.week > 0 && !s.flags['rival_dead_' + def.id] && !s.flags['rival_entered_' + def.id]) {
        r.alive = true;
        s.flags['rival_entered_' + def.id] = 1;
        addNews(s, { tags: ['rival_enters', 'business'], vars: { rival: def.name, owner: def.owner, promotion: s.promotion.name }, weight: 6, tone: -0.3 });
      }
      continue;
    }
    const roster = Object.values(s.fighters).filter((f) => f.promotion === def.id && f.status === 'active');
    const quality = roster.length ? roster.reduce((t, f) => t + overall(f.skills) + f.starPower * 0.5, 0) / roster.length : 30;
    r.strength = clamp(r.strength * 0.95 + (quality - 30) * 0.05 + roster.length * 0.02, 0, 100);
    // business
    const revenue = (r.strength * 2500 + roster.length * 400) * scale(s);
    const costs = roster.reduce((t, f) => t + (f.contract?.purse ?? 3000), 0) / 3 + 20000 * scale(s);
    r.cash += revenue - costs + (def.type === 'foreign' ? 60000 * scale(s) : 0);
    // events, sometimes counter-programmed on your dates
    const ourNext = s.events.find((e) => e.status === 'scheduled' && e.week > s.week);
    if (ourNext && rng.chance(def.aggression * 0.15 * aggr)) r.lastEventWeek = ourNext.week;
    // signings: free agents
    if (rng.chance(0.3 * def.aggression * aggr)) {
      const fa = Object.values(s.fighters)
        .filter((f) => f.status === 'free-agent' && !f.legend && s.week - (f.retiredWeek ?? -99) > 0)
        .sort((a, b) => overall(b.skills) + b.starPower - (overall(a.skills) + a.starPower));
      const pick = fa[rng.int(0, Math.min(4, fa.length - 1))];
      if (pick && r.cash > 0) {
        pick.promotion = def.id;
        pick.status = 'active';
        pick.contract = { boutsLeft: 4, purse: Math.round(5000 * scale(s)), winBonus: 0, champClause: false, exclusive: true, signedWeek: s.week };
        addCareerLog(pick, `Signed with ${def.name}.`);
      }
    }
    // rivals' fighters age out / get cut back into free agency
    for (const f of roster) {
      if (f.contract && rng.chance(0.012)) {
        f.promotion = null;
        f.status = 'free-agent';
        f.contract = null;
      }
    }
    // collapse / merger
    if (r.cash < -2_000_000 * scale(s) && rng.chance(0.2)) {
      const stronger = content().rivals.filter((x) => x.id !== def.id && s.rivals[x.id]?.alive);
      r.alive = false;
      s.flags['rival_dead_' + def.id] = 1;
      if (stronger.length && rng.chance(0.4)) {
        const into = rng.pick(stronger);
        r.mergedInto = into.id;
        for (const f of roster) f.promotion = into.id;
        addNews(s, { tags: ['rival_merger', 'business'], vars: { rival: def.name, into: into.name, promotion: s.promotion.name }, weight: 6, tone: 0 });
      } else {
        for (const f of roster) {
          f.promotion = null;
          f.status = 'free-agent';
          f.contract = null;
        }
        addNews(s, { tags: ['rival_collapse', 'business'], vars: { rival: def.name, promotion: s.promotion.name }, weight: 7, tone: 0.5 });
        adjustMeter(s, 'fans', 2);
      }
    }
  }
}

// ---------------------------------------------------------------- market & TV

export function weeklyMarket(s: GameState, rng: Rng, ourBuys: number | null): void {
  const rows: RatingsRow[] = [];
  for (const c of content().competitors) {
    const st = s.market.competitors[c.id];
    if (!st) continue;
    st.buzz = clamp(st.buzz + rng.gauss() * c.volatility * 0.15 + (c.buzz - st.buzz) * 0.05, 3, 100);
    if (rng.chance(0.35)) {
      st.lastBuys = Math.round(Math.pow(st.buzz, 1.7) * rng.float(3, 9) * (1 + s.week / 520));
      st.lastWeek = s.week;
      rows.push({ id: c.id, name: c.name, sport: c.sport, buys: st.lastBuys });
    }
  }
  for (const def of content().rivals) {
    const r = s.rivals[def.id];
    if (r?.alive && rng.chance(0.4)) rows.push({ id: def.id, name: def.name, sport: 'MMA', buys: Math.round(Math.pow(r.strength, 1.6) * rng.float(2, 6)) });
  }
  if (ourBuys !== null) rows.push({ id: 'us', name: s.promotion.name, sport: 'MMA', buys: Math.round(ourBuys) });
  rows.sort((a, b) => b.buys - a.buys);
  if (rows.length) {
    s.market.chart.push({ week: s.week, rows });
    if (s.market.chart.length > 26) s.market.chart.shift();
  }
  if (ourBuys !== null) {
    const rank = rows.findIndex((r) => r.id === 'us');
    // finishing high on the chart impresses networks; getting beaten by slap fighting does not
    adjustMeter(s, 'network', rank === 0 ? 2 : rank <= 2 ? 0.8 : rank >= 5 ? -1.2 : 0);
    if (rank === 0) s.stats.chartTops = (s.stats.chartTops ?? 0) + 1;
    const slap = rows.findIndex((r) => r.id === 'slap_league');
    if (slap >= 0 && slap < rank) s.flags.lost_to_slap = (Number(s.flags.lost_to_slap) || 0) + 1;
  }
  // TV offers
  s.market.tvOffers = s.market.tvOffers.filter((o) => o.expires >= s.week);
  const tv = s.promotion.tv;
  const expiring = !tv || tv.until - s.week < 10;
  if ((expiring || rng.chance(0.03)) && rng.chance(0.25)) {
    const nets = content().networks.filter((n) => n.minAct <= s.act && n.tier >= (tv?.tier ?? 0) - (expiring ? 1 : 0) && n.id !== tv?.network);
    const eligible = nets.filter((n) => s.meters.network + s.meters.fans / 2 >= n.tier * 22);
    if (eligible.length) {
      const n = rng.pick(eligible);
      if (!s.market.tvOffers.some((o) => o.network === n.id)) {
        const per = Math.round((n.basePerEvent * (0.6 + s.meters.network / 120 + s.meters.fans / 250)) / 1000) * 1000;
        s.market.tvOffers.push({ network: n.id, perEvent: per, tier: n.tier, weeks: 104, ppv: n.ppv, expires: s.week + 4 });
        addNews(s, { tags: ['tv_offer', 'business'], vars: { network: n.name, promotion: s.promotion.name }, weight: 3, tone: 0.3 });
      }
    }
  }
  if (tv && s.week >= tv.until) {
    addNews(s, { tags: ['tv_expired', 'business'], vars: { network: content().networks.find((n) => n.id === tv.network)?.name ?? tv.network, promotion: s.promotion.name }, weight: 5, tone: -0.4 });
    s.promotion.tv = s.act <= 1 ? { network: 'public_access', tier: 0, perEvent: 4000, until: s.week + 52, ppv: false } : null;
  }
}

export function acceptTvOffer(s: GameState, network: string): boolean {
  const o = s.market.tvOffers.find((x) => x.network === network);
  if (!o) return false;
  s.promotion.tv = { network: o.network, tier: o.tier, perEvent: o.perEvent, until: s.week + o.weeks, ppv: o.ppv };
  s.market.tvOffers = s.market.tvOffers.filter((x) => x !== o);
  adjustMeter(s, 'network', 8);
  const n = content().networks.find((x) => x.id === network);
  addNews(s, { tags: ['tv_deal', 'business'], vars: { network: n?.name ?? network, promotion: s.promotion.name, amount: o.perEvent }, weight: 8, tone: 0.8 });
  s.log.push({ week: s.week, kind: 'tv', text: `Signed a TV deal with ${n?.name ?? network}.` });
  if (o.tier >= 1) s.flags.cable_deal = 1;
  if (o.tier >= 3) s.flags.major_network = 1;
  // PPV on numbered events from now on
  for (const e of s.events) if (e.status === 'scheduled' && e.number !== null) e.ppv = o.ppv;
  return true;
}

// ---------------------------------------------------------------- owner

export function weeklyOwner(s: GameState, rng: Rng): void {
  if (s.sandbox?.noOwner) return;
  if (s.week % 13 !== 12) return;
  const q = Math.floor(s.week / 13);
  const met = s.owner.revenueQ >= s.owner.target;
  s.owner.results.push({ q, target: s.owner.target, actual: s.owner.revenueQ, met });
  if (met) {
    adjustHidden(s, 'patience', 8 + (s.owner.revenueQ > s.owner.target * 1.4 ? 6 : 0));
    s.owner.audit = Math.max(0, s.owner.audit - 1);
    s.desk.queue.push(memoDoc(s, 'MEMO: QUARTERLY RESULTS', `Targets met. The board is "cautiously pleased", which is the nicest thing they have ever said. Next quarter's target has been raised, because of course it has.`));
  } else {
    adjustHidden(s, 'patience', -12);
    s.owner.memos++;
    if (s.owner.memos >= 2) s.owner.audit = Math.min(3, s.owner.audit + 1);
    const msg = s.owner.audit >= 3
      ? 'The board requests your presence in the boardroom. Bring a lawyer. Or a priest.'
      : s.owner.audit >= 1
        ? 'Missed target. Auditors from corporate will be "embedded" in your office. They have already eaten your yogurt.'
        : 'Revenue fell short of target. Please explain, in writing, using small words. -The Board';
    s.desk.queue.push(memoDoc(s, 'MEMO: MISSED TARGET', msg));
  }
  // next target: grow from what you actually did, with the act's ambitions on top
  const actual = s.owner.results[s.owner.results.length - 1].actual;
  const growth = met ? rng.float(1.03, 1.1) : rng.float(0.92, 1.0);
  s.owner.target = Math.round(Math.max(s.owner.target * (met ? 1.02 : 0.95), actual * growth) / 1000) * 1000;
  s.owner.revenueQ = 0;
}

// ---------------------------------------------------------------- acts

export const ACT_WEEKS = [0, 0, 78, 200, 310, 416];

export function checkActProgress(s: GameState): number | null {
  if (s.mode === 'sandbox' && s.sandbox?.scenario !== 'tiny') return null;
  const next = s.act + 1;
  if (next > 5) return null;
  const w = s.week;
  let go = false;
  switch (s.act) {
    case 1:
      go = (w >= 52 && !!s.flags.cable_deal) || w >= 104;
      break;
    case 2:
      go = (w >= 180 && s.meters.fans >= 65) || w >= 220;
      break;
    case 3:
      go = w >= 310;
      break;
    case 4:
      go = w >= 416;
      break;
  }
  if (!go) return null;
  advanceAct(s, next);
  return next;
}

export function advanceAct(s: GameState, act: number): void {
  s.act = act;
  activateRulesForAct(s, act, true);
  for (const v of content().venues) if (v.unlockAct <= act && !v.special && !s.venuesUnlocked.includes(v.id)) s.venuesUnlocked.push(v.id);
  for (const d of content().divisions) if (d.openAct <= act && !s.divisionsOpen.includes(d.id)) s.divisionsOpen.push(d.id);
  ensureDivisionBelts(s);
  // marquee debuts for this act
  for (const f of Object.values(s.fighters)) if (f.status === 'prospect' && !f.legend && f.marquee) f.status = 'free-agent';
  if (act === 4 && !s.owner.sold) {
    s.owner.sold = true;
    s.owner.name = 'OmniVore Global Entertainment & Defense';
    s.owner.target = Math.round(s.owner.target * 1.5);
    s.hidden.patience = 55;
    addNews(s, { tags: ['sale', 'business'], vars: { promotion: s.promotion.name, owner: s.owner.name }, text: `${s.promotion.name.toUpperCase()} SOLD FOR BILLIONS TO ${s.owner.name.toUpperCase()}; PRESIDENT KEEPS JOB, LOSES PARKING SPACE`, weight: 10, tone: 0.3 });
    s.president.wealth += Math.round(2_000_000 + s.promotion.valuation * 0.02);
  }
  const def = content().acts.find((a) => a.act === act);
  s.log.push({ week: s.week, kind: 'act', text: `Act ${act}: ${def?.name ?? ''}` });
  s.flags.actIntro = act;
}

// ---------------------------------------------------------------- endings

export function checkEndings(s: GameState): string | null {
  if (s.ending) return s.ending;
  const sb = s.sandbox;
  // instant fail states
  if (s.flags.indicted || s.hidden.heat >= 100) return setEnding(s, 'indicted');
  if (s.promotion.cash < -1_500_000 * Math.max(1, scale(s) * 0.5)) {
    s.flags.broke_weeks = (Number(s.flags.broke_weeks) || 0) + 1;
    if (Number(s.flags.broke_weeks) >= 8) return setEnding(s, 'bankrupt');
  } else s.flags.broke_weeks = 0;
  if (!sb?.noOwner && s.hidden.patience <= 0) return setEnding(s, 'forced_out');
  for (const id of ['desert', 'politics', 'slap_forever', 'secret_ref']) if (s.flags['ending_' + id]) return setEnding(s, id);
  // career end
  if (s.week >= CAREER_WEEKS && !sb?.infinite) return setEnding(s, finalEnding(s));
  return null;
}

export function finalEnding(s: GameState): string {
  const fair = Number(s.flags.fairpay) || 0;
  const under = Number(s.flags.underpay) || 0;
  if (s.flags.ref_license) return 'secret_ref';
  if (s.meters.fighters >= 65 && fair > under) return 'fighters_promoter';
  if (s.president.wealth > 25_000_000 && s.meters.fighters < 40) return 'billion_ghost';
  if (s.meters.fans >= 65 && s.promotion.valuation > 500_000_000) return 'legend';
  return 'survivor';
}

function setEnding(s: GameState, id: string): string {
  s.ending = id;
  s.endingWeek = s.week;
  s.phase = 'ended';
  return id;
}

// ---------------------------------------------------------------- misc yearly

export function hallOfFame(s: GameState): string[] {
  const out: string[] = [];
  for (const f of Object.values(s.fighters)) {
    if (f.status !== 'retired' || f.hallOfFame) continue;
    if (f.record.w >= 18 && f.titleDefenses >= 2 && s.week - (f.retiredWeek ?? 0) >= 52) {
      f.hallOfFame = true;
      out.push(fullName(f));
      addNews(s, { tags: ['hall_of_fame'], vars: { fighter: fullName(f), promotion: s.promotion.name }, weight: 4, tone: 0.5 });
    }
  }
  return out;
}

export function releaseFighter(s: GameState, id: string): void {
  const f = s.fighters[id];
  if (!f) return;
  for (const b of beltsOf(s, f.id)) vacateBelt(s, b, 'released');
  f.promotion = null;
  f.status = 'free-agent';
  f.contract = null;
  addCareerLog(f, `Released by ${s.promotion.name}.`);
}

export function totalIncome(s: GameState, weeks: number): number {
  return s.ledger.slice(-weeks).reduce((t, l) => t + sumRecord(l.income), 0);
}
