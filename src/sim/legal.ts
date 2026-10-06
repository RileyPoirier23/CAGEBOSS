/**
 * Legal system: arrests, the Bail Office, lawyers, court dates and verdicts.
 */
import type { GameState, LegalCase } from '../core/types';
import { content } from '../core/content';
import { Rng } from '../core/rng';
import { clamp } from '../core/format';
import { fullName, addCareerLog } from './fighters';
import { addNews } from './news';
import { spend, personal, scale, adjustMeter, adjustHidden } from './econ';
import { bailDoc } from './docs';

export const LAWYERS = {
  public: { name: 'Public Defender (overworked)', fee: 0, skill: 0.15 },
  mid: { name: 'Saul Goodenough & Associates', fee: 15000, skill: 0.35 },
  shark: { name: 'Barry "The Shark" Finkelstein', fee: 60000, skill: 0.6 },
} as const;

export function lawyerFee(s: GameState, l: keyof typeof LAWYERS): number {
  return Math.round(LAWYERS[l].fee * Math.max(1, scale(s) * 0.6));
}

export function arrest(s: GameState, who: string, chargeId: string, rng: Rng): LegalCase | null {
  const charge = content().charges.find((c) => c.id === chargeId) ?? content().charges[0];
  if (!charge) return null;
  if (s.legal.cases.some((c) => c.who === who && c.status !== 'closed')) return null;
  const bail = Math.round(rng.int(charge.bail[0], charge.bail[1]) / 500) * 500;
  const c: LegalCase = {
    id: 'case' + s.week + '_' + s.legal.cases.length,
    who,
    charge: charge.id,
    week: s.week,
    bail,
    bailPaid: null,
    lawyer: null,
    courtWeek: s.week + rng.int(5, 14),
    status: 'custody',
    noTravel: charge.severity >= 3 && rng.chance(0.6),
    monitor: charge.severity >= 4 && rng.chance(0.5),
  };
  s.legal.cases.push(c);
  if (who === 'president') {
    adjustHidden(s, 'heat', 12);
    addNews(s, { tags: ['president_arrest', 'scandal'], vars: { president: s.president.name, charge: charge.name, promotion: s.promotion.name }, weight: 10, tone: -1 });
  } else {
    const f = s.fighters[who];
    if (f) {
      f.legal = 'arrested';
      f.legalRecord.push(charge.name);
      addCareerLog(f, `Arrested: ${charge.name}.`);
      addNews(s, { tags: ['arrest', 'scandal', charge.serious ? 'serious' : 'legal'], vars: { fighter: fullName(f), last: f.last, charge: charge.name, promotion: s.promotion.name }, weight: 7 + charge.severity, tone: -0.6 });
    }
    adjustMeter(s, 'sponsors', -charge.severity);
    adjustHidden(s, 'chaos', 2);
  }
  s.desk.queue.push(bailDoc(s, c.id));
  s.stats.arrests = (s.stats.arrests ?? 0) + 1;
  return c;
}

export interface BailChoice {
  pay: 'promotion' | 'personal' | 'none';
  lawyer: keyof typeof LAWYERS;
}

/** Player's decision at the Bail Office window. */
export function decideBail(s: GameState, caseId: string, choice: BailChoice): string {
  const c = s.legal.cases.find((x) => x.id === caseId);
  if (!c || c.status !== 'custody') return '';
  const f = c.who === 'president' ? null : s.fighters[c.who];
  const fee = lawyerFee(s, choice.lawyer);
  c.lawyer = choice.lawyer;
  if (fee) {
    if (choice.pay === 'personal') personal(s, 'legal fees', -fee);
    else spend(s, 'legal', fee);
  }
  c.bailPaid = choice.pay;
  let msg: string;
  if (choice.pay === 'none') {
    c.status = 'bail';
    if (f) {
      f.legal = 'jailed';
      f.morale = clamp(f.morale - 20, 0, 100);
      f.loyalty = clamp(f.loyalty - 15, 0, 100);
      f.beefWithYou = clamp(f.beefWithYou + 15, 0, 100);
    }
    adjustMeter(s, 'fighters', -3);
    msg = f ? `${fullName(f)} sits in county until the court date. ${f.first} is not happy with you.` : 'You sit in a cell. Your lawyer brings you a protein bar.';
  } else {
    if (choice.pay === 'promotion') spend(s, 'bail', c.bail);
    else personal(s, 'bail', -c.bail);
    c.status = 'bail';
    if (f) {
      f.legal = 'bail';
      f.loyalty = clamp(f.loyalty + (choice.pay === 'personal' ? 12 : 6), 0, 100);
      f.morale = clamp(f.morale + 5, 0, 100);
    }
    if (choice.pay === 'promotion') adjustMeter(s, 'media', -1);
    msg = f ? `${fullName(f)} walks out with ${LAWYERS[choice.lawyer].name}. Court date is set.` : `You're out. ${LAWYERS[choice.lawyer].name} says "don't say anything to anyone." You immediately go on a podcast.`;
  }
  s.stats.bailPaid = (s.stats.bailPaid ?? 0) + (choice.pay === 'none' ? 0 : c.bail);
  return msg;
}

/** Weekly progression: court dates produce verdicts. */
export function weeklyLegal(s: GameState, rng: Rng): string[] {
  const notes: string[] = [];
  for (const c of s.legal.cases) {
    if (c.status === 'closed') continue;
    // unresolved custody after a week: default to public defender, no bail
    if (c.status === 'custody' && s.week - c.week >= 1) decideBail(s, c.id, { pay: 'none', lawyer: 'public' });
    if (s.week < c.courtWeek) continue;
    const charge = content().charges.find((x) => x.id === c.charge);
    const sev = charge?.severity ?? 2;
    const skill = LAWYERS[c.lawyer ?? 'public'].skill;
    const roll = rng.next() + skill - sev * 0.08;
    let outcome: LegalCase['outcome'];
    if (roll > 0.95) outcome = 'acquitted';
    else if (roll > 0.75) outcome = 'dropped';
    else if (roll > 0.45) outcome = 'plea';
    else if (roll > 0.2 || sev <= 2) outcome = 'probation';
    else outcome = 'jail';
    c.outcome = outcome;
    c.status = 'closed';
    if (c.who === 'president') {
      if (outcome === 'jail') {
        s.flags.president_jailed = 1;
        adjustHidden(s, 'heat', 25);
      }
      addNews(s, { tags: ['president_verdict'], vars: { president: s.president.name, outcome: outcome!, charge: charge?.name ?? '' }, weight: 8, tone: outcome === 'acquitted' || outcome === 'dropped' ? 0.2 : -0.8 });
      notes.push(`Your case: ${outcome}.`);
      continue;
    }
    const f = s.fighters[c.who];
    if (!f) continue;
    switch (outcome) {
      case 'acquitted':
      case 'dropped':
        f.legal = 'free';
        f.legalUntil = -1;
        break;
      case 'plea':
      case 'probation':
        f.legal = 'probation';
        f.legalUntil = s.week + rng.int(26, 78);
        break;
      case 'jail':
        f.legal = 'jailed';
        f.legalUntil = s.week + sev * rng.int(6, 14);
        break;
    }
    addCareerLog(f, `Court verdict on ${charge?.name ?? 'charges'}: ${outcome}.`);
    addNews(s, { tags: ['verdict', 'legal'], vars: { fighter: fullName(f), last: f.last, outcome: outcome!, charge: charge?.name ?? '' }, weight: 6, tone: outcome === 'jail' ? -0.5 : 0 });
    notes.push(`${fullName(f)}: ${outcome}.`);
  }
  // sentences & probation ending
  for (const f of Object.values(s.fighters)) {
    if ((f.legal === 'jailed' || f.legal === 'probation' || f.legal === 'suspended') && f.legalUntil >= 0 && s.week >= f.legalUntil) {
      if (f.legal === 'jailed' && s.legal.cases.some((c) => c.who === f.id && c.status !== 'closed')) continue;
      f.legal = 'free';
      f.legalUntil = -1;
      addCareerLog(f, 'Legal status cleared.');
    }
  }
  return notes;
}

export function openCase(s: GameState, who: string): LegalCase | undefined {
  return s.legal.cases.find((c) => c.who === who && c.status !== 'closed');
}
