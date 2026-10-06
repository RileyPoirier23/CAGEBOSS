/**
 * Money: promotion cash, president's personal wealth, corporate valuation,
 * meters and the weekly ledger.
 */
import type { GameState, MeterKey } from '../core/types';
import { METER_KEYS } from '../core/types';
import { clamp } from '../core/format';
import { isOurs } from './fighters';

export function earn(s: GameState, cat: string, amt: number): void {
  if (!amt) return;
  s.promotion.cash += amt;
  s.current.income[cat] = (s.current.income[cat] ?? 0) + amt;
  if (amt > 0) s.owner.revenueQ += amt;
}

export function spend(s: GameState, cat: string, amt: number): void {
  if (!amt) return;
  s.promotion.cash -= amt;
  s.current.expenses[cat] = (s.current.expenses[cat] ?? 0) + amt;
}

/** Personal money of the President (positive = income). */
export function personal(s: GameState, cat: string, amt: number): void {
  if (!amt) return;
  s.president.wealth += amt;
  s.current.personal[cat] = (s.current.personal[cat] ?? 0) + amt;
}

/** Scale of the business by act (used for amounts in storylets etc.). */
export function scale(s: GameState): number {
  return [1, 1, 2.2, 5, 10, 16][s.act] ?? 1;
}

/**
 * Meters have diminishing returns: gains shrink as a meter nears 100 and
 * losses bite harder from the top, so nothing sits pinned at 99 for a decade.
 */
export function adjustMeter(s: GameState, key: MeterKey, delta: number): void {
  const v = s.meters[key];
  const k = delta >= 0 ? clamp((100 - v) / 45, 0.12, 1.25) : clamp(v / 50, 0.35, 1.3);
  s.meters[key] = clamp(v + delta * k, 0, 100);
}

export function adjustHidden(s: GameState, key: 'heat' | 'patience' | 'chaos', delta: number): void {
  s.hidden[key] = clamp(s.hidden[key] + delta, 0, 100);
}

/** Corporate valuation: what the owners care about. */
export function computeValuation(s: GameState): number {
  const recent = s.ledger.slice(-26);
  const revenue = recent.reduce((t, l) => t + Object.values(l.income).reduce((a, b) => a + b, 0), 0) * 2;
  const roster = Object.values(s.fighters).filter(isOurs);
  const stars = roster.reduce((t, f) => t + Math.pow(f.starPower, 1.6), 0) * 60 * scale(s);
  const tv = s.promotion.tv ? s.promotion.tv.perEvent * 26 * 2 : 0;
  const goodwill = (s.meters.fans * 2 + s.meters.network + s.meters.sponsors + s.meters.media * 0.5) * 6000 * scale(s);
  const val = revenue * 2.2 + tv + stars + goodwill + s.promotion.cash - s.promotion.debt;
  return Math.max(250000, Math.round(val / 1000) * 1000);
}

export function weeklyExpenses(s: GameState): void {
  spend(s, 'staff', s.promotion.staff);
  if (s.promotion.debt > 0) {
    const pay = Math.min(s.promotion.debt, Math.round(s.promotion.debt * 0.004 + 1500));
    spend(s, 'debt', pay);
    s.promotion.debt -= Math.round(pay * 0.6); // the rest is interest
  }
  const insurance = Math.round(800 * scale(s) + Object.values(s.fighters).filter(isOurs).length * 25 * scale(s));
  spend(s, 'insurance', insurance);
  // the president's personal life
  const life = [1500, 6000, 25000][s.president.lifestyle] ?? 1500;
  personal(s, 'lifestyle', -life);
  if (s.president.kidsSchool) personal(s, 'kids school', -1400);
  if (s.president.marriage === 'separated') personal(s, 'divorce lawyer', -2500);
  if (s.president.vegasDebt > 0) {
    personal(s, 'vegas markers', -Math.min(s.president.vegasDebt, 5000));
    s.president.vegasDebt = Math.max(0, s.president.vegasDebt - 5000);
  }
  // president salary from promotion
  const salary = Math.round(1500 * scale(s));
  spend(s, 'president salary', salary);
  personal(s, 'salary', salary);
  // sponsors
  for (const d of s.sponsorDeals) if (d.until >= s.week) earn(s, 'sponsors', d.weekly);
  s.sponsorDeals = s.sponsorDeals.filter((d) => d.until >= s.week);
}

export function closeLedger(s: GameState): void {
  s.promotion.valuation = computeValuation(s);
  s.ledger.push({
    week: s.week,
    income: s.current.income,
    expenses: s.current.expenses,
    personal: s.current.personal,
    cash: s.promotion.cash,
    wealth: s.president.wealth,
    valuation: s.promotion.valuation,
    meters: { ...s.meters },
  });
  // keep two years of detail; older weeks keep only totals
  const old = s.ledger.length - 104;
  for (let i = Math.max(0, old - 4); i < old; i++) {
    const l = s.ledger[i];
    if (Object.keys(l.income).length > 1) {
      l.income = { total: sumRecord(l.income) };
      l.expenses = { total: sumRecord(l.expenses) };
      l.personal = { total: sumRecord(l.personal) };
    }
  }
  s.current = { income: {}, expenses: {}, personal: {} };
}

export function sumRecord(r: Record<string, number>): number {
  return Object.values(r).reduce((a, b) => a + b, 0);
}

export function lastLedger(s: GameState) {
  return s.ledger[s.ledger.length - 1] ?? null;
}

/** Gentle drift of meters toward neutral; hidden heat cools slowly. */
export function driftMeters(s: GameState): void {
  for (const k of METER_KEYS) {
    const v = s.meters[k];
    const target = 48;
    s.meters[k] = clamp(v + (target - v) * (v > 75 ? 0.03 : 0.015), 0, 100);
  }
  s.hidden.heat = clamp(s.hidden.heat - 0.3, 0, 100);
  s.hidden.chaos = clamp(s.hidden.chaos - 0.2, 0, 100);
}
