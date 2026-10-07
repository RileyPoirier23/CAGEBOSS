/**
 * Desk documents (Papers, Please-style inspection).
 *
 * Every document is built in three steps:
 *   1. FACTS: typed claims on the paper + the values on record (file card,
 *      calendar, rulebook) for the document's subject.
 *   2. FORGERY (sometimes): one claim is tampered with. Each forgery kind
 *      belongs to the rule it breaks and only appears once that rule is live.
 *   3. CHECK: the rule checks (RULE_CHECKS) derive the violations from the
 *      facts and the active rules. Violations are never hand-planted, so a
 *      document is invalid exactly when an active rule says so.
 *
 * The player finds a violation by comparing its two fields (doc.* / file.* /
 * cal.* / rule.* / id.* / win.face) in inspect mode, then stamps.
 */
import type { DeskDoc, DocField, DocType, Fighter, GameState, Violation, Bout, FightEvent, DocFact } from '../core/types';
import { content } from '../core/content';
import { Rng, hashString } from '../core/rng';
import { money } from '../core/format';
import { fmtDate, fmtFightDate, dateOf } from '../core/time';
import { fullName, isOurs, isBooked } from './fighters';
import { param, ruleActive, activateScheduledRules, ruleDef } from './rules';
import { DIVISION_LIMITS, divisionName } from './divisions';
import { upcomingEvents, eventThisWeek } from './events';
import { scale } from './econ';

type Facts = Record<string, DocFact>;

let docSeq = 0;
function newId(s: GameState, type: string): string {
  return `d${s.week}_${type}_${(s.stats.docSeq = (s.stats.docSeq ?? 0) + 1)}_${docSeq++ % 7}`;
}

export function sigOf(f: { id: string }, variant = 0): string {
  return 'sig:' + (hashString(f.id + (variant ? ':forged' + variant : '')) % 100000);
}

/** Commission licence number of a fighter (stable). */
export function fighterLicenceNo(f: { id: string }): string {
  return 'FL-' + ((hashString(f.id + ':lic') % 90000) + 10000);
}

/** Real-person parodies (and marquee/legend characters) are never cast as crooks, cheats or dopers. */
export function canBeShady(f: Fighter | null | undefined): boolean {
  return !!f && !f.parody && !f.marquee && !f.legend;
}

const MONTHS = ['JAN', 'FEB', 'MAR', 'APR', 'MAY', 'JUN', 'JUL', 'AUG', 'SEP', 'OCT', 'NOV', 'DEC'];
const MONTH_LEN = [31, 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];

/** Absolute day number (week * 7 + weekday, Monday = 0) formatted as a date. */
export function fmtDay(day: number): string {
  const week = Math.floor(day / 7);
  const d = dateOf(week);
  let dd = d.day + (day - week * 7);
  let m = d.month;
  let y = d.year;
  while (dd > MONTH_LEN[m]) {
    dd -= MONTH_LEN[m];
    m++;
    if (m > 11) {
      m = 0;
      y++;
    }
  }
  return `${MONTHS[m]} ${dd}, Y${y}`;
}

/** Saturday (fight night) of a week as an absolute day. */
export const fightDayOf = (week: number) => week * 7 + 5;

function misspell(name: string, rng: Rng): string {
  const parts = name.split(' ');
  const i = parts.length - 1;
  const w = parts[i];
  if (w.length < 4) return name + 'e';
  const ops = [
    () => w.slice(0, -1),
    () => w.slice(0, 2) + w[3] + w[2] + w.slice(4),
    () => w + rng.pick(['e', 'h', 's']),
    () => w.replace(/[aeiou]/, (m) => ({ a: 'e', e: 'a', i: 'y', o: 'u', u: 'o' } as Record<string, string>)[m]),
  ];
  parts[i] = rng.pick(ops)();
  if (parts[i] === w) parts[i] = w + 'z';
  return parts.join(' ');
}

/** Change one or two digits of a licence-style code ('AC-10417' -> 'AC-10471'). */
function tweakCode(code: string, rng: Rng): string {
  const m = code.match(/^(.*?)(\d+)$/);
  if (!m) return code + '1';
  const digits = m[2].split('');
  if (digits.length >= 2 && rng.chance(0.5)) {
    const i = rng.int(0, digits.length - 2);
    if (digits[i] !== digits[i + 1]) {
      [digits[i], digits[i + 1]] = [digits[i + 1], digits[i]];
      return m[1] + digits.join('');
    }
  }
  const i = rng.int(1, digits.length - 1);
  digits[i] = String((Number(digits[i]) + rng.int(1, 8)) % 10);
  return m[1] + digits.join('');
}

function f(key: string, label: string, value: string, kind?: DocField['kind']): DocField {
  return { key, label, value, kind };
}

function nextBoutFor(s: GameState, id: string): { ev: FightEvent; bout: Bout } | null {
  for (const ev of upcomingEvents(s)) {
    const bout = ev.card.find((b) => b.status === 'scheduled' && (b.a === id || b.b === id));
    if (bout) return { ev, bout };
  }
  return null;
}

/** Shared 'file card' facts for a fighter (what's on record). */
export function fileCard(s: GameState, ft: Fighter): Record<string, string> {
  const mgr = content().managers.find((m) => m.id === ft.manager);
  const next = nextBoutFor(s, ft.id);
  const openCase = s.legal.cases.find((c) => c.who === ft.id && c.status !== 'closed');
  return {
    'file.name': fullName(ft),
    'file.division': divisionName(ft.division),
    'file.limit': `${DIVISION_LIMITS[ft.division]} lbs`,
    'file.purse': ft.contract ? money(ft.contract.purse, false) : 'N/A',
    'file.bonus': ft.contract ? money(ft.contract.winBonus, false) : 'N/A',
    'file.sig': sigOf(ft),
    'file.manager': mgr ? mgr.name : ft.manager,
    'file.suspension': ft.medSuspUntil > s.week ? `Until ${fmtDate(ft.medSuspUntil)}` : 'None',
    'file.court': openCase ? fmtDate(openCase.courtWeek) : 'None',
    'file.arrests': ft.legalRecord.length ? ft.legalRecord.join('; ') : 'None',
    'file.country': ft.country,
    'file.fight': next ? `${fmtFightDate(next.ev.week)} (${next.ev.name})` : 'Not booked',
    'file.sponsor': s.sponsorDeals.filter((d) => d.fighter === ft.id).map((d) => content().sponsors.find((x) => x.id === d.sponsor)?.category ?? '').join(', ') || 'None',
  };
}

const medMaxDays = (s: GameState) => param(s, 'medicalMaxDays', ruleActive(s, 'medical_validity') ? 60 : 90);
const drugMaxDays = (s: GameState) => param(s, 'drugMaxDays', 30);
const PANEL = ['Steroids', 'EPO', 'Stimulants', 'Diuretics', 'Peptides'];
const requiredPanel = (s: GameState) => param<string[]>(s, 'requiredPanel', ['Steroids', 'EPO', 'Stimulants']);

export function ruleRefs(s: GameState): Record<string, string> {
  const banned = param<string[]>(s, 'bannedSubstances', []);
  return {
    'rule.registry': content().managers.filter((m) => m.licensed).map((m) => `${m.name}: ${m.license}`).join('\n'),
    'rule.exclusive': 'Exclusivity clause REQUIRED',
    'rule.doctors': content().docs.doctors.filter((d) => d.real).map((d) => `${d.name} ${d.license}`).join('\n'),
    'rule.scans': param<string[]>(s, 'requiredScans', ['Blood Panel']).join(', '),
    'rule.validity': `Exam no more than ${medMaxDays(s)} days before fight night`,
    'rule.tolerance': `${param(s, 'weightTolerance', 1)} lb over limit (non-title)`,
    'rule.banned': banned.join(', ') || 'N/A',
    'rule.picogram': `${param(s, 'picogramLimit', 100)} pg/mL`,
    'rule.panel': requiredPanel(s).join(', '),
    'rule.drugdays': `Sample no more than ${drugMaxDays(s)} days before fight night`,
    'rule.strikes': `Max ${param(s, 'maxStrikes', 2)} whereabouts strikes`,
    'rule.bannedCats': param<string[]>(s, 'bannedSponsorCategories', []).join(', ') || 'None',
    'rule.cap': money(param(s, 'expenseCap', 3000), false) + ' per item; no luxuries',
    'rule.bannedReporters': content().reporters.filter((r) => s.media.reporters[r.id]?.banned).map((r) => r.name).join(', ') || 'None',
    'rule.outlets': content().outlets.map((o) => o.name).join(', '),
    'rule.court': 'No fights on/after a court date that week',
    'rule.visa': 'Paid fighters need an Athlete Work Visa (P-1)',
    'rule.licence': 'Photo = face at the door; licence # = agreement; valid on bout date',
  };
}

function base(s: GameState, type: DocType, title: string, subject: Fighter | null): DeskDoc {
  return {
    id: newId(s, type),
    type,
    title,
    subject: subject?.id ?? null,
    fields: [],
    refs: subject ? fileCard(s, subject) : {},
    violations: [],
    week: s.week,
    overdue: 0,
    meta: {},
    facts: {},
  };
}

// ---------------------------------------------------------------- rule checks

type On = (rule: string) => boolean;
type Check = (F: Facts, on: On) => Violation[];

const num = (v: DocFact | undefined) => (typeof v === 'number' ? v : Number(v) || 0);
const str = (v: DocFact | undefined) => (v === null || v === undefined ? '' : String(v));
const arr = <T = string>(v: DocFact | undefined): T[] => (Array.isArray(v) ? (v as T[]) : []);
const V = (rule: string, a: string, b: string, text: string): Violation => ({ rule, a, b, text });

/** Which rule requires a scan (MRI/eye exam came in later). */
function scanRule(scan: string): string {
  return scan === 'MRI' ? 'mri_required' : scan === 'Eye Exam' ? 'eye_exam' : 'medical_basic';
}

export const RULE_CHECKS: Partial<Record<DocType, Check>> = {
  bout: (F, on) => {
    const v: Violation[] = [];
    if (on('contract_basics')) {
      if (F.name !== F.recName) v.push(V('contract_basics', 'doc.name', 'file.name', 'The name on the agreement does not match the file.'));
      if (F.division !== F.recDivision) v.push(V('contract_basics', 'doc.division', 'file.division', 'Weight class does not match the division on file.'));
      if (F.sig !== F.recSig) v.push(V('contract_basics', 'doc.sig', 'file.sig', 'The signature does not match the one on file. Forged.'));
    }
    if (on('purse_match')) {
      if (num(F.purse) !== num(F.recPurse)) v.push(V('purse_match', 'doc.purse', 'file.purse', `Show purse says ${money(num(F.purse), false)}; you agreed ${money(num(F.recPurse), false)}.`));
      if (num(F.bonus) !== num(F.recBonus)) v.push(V('purse_match', 'doc.bonus', 'file.bonus', `Win bonus says ${money(num(F.bonus), false)}; you agreed ${money(num(F.recBonus), false)}.`));
    }
    if (on('manager_license')) {
      if (!F.regLicense) v.push(V('manager_license', 'doc.license', 'rule.registry', `${str(F.rep)} is not on the licensed rep registry.`));
      else if (F.repLicense !== F.regLicense) v.push(V('manager_license', 'doc.license', 'rule.registry', `Rep. licence # does not match the registry (${str(F.regLicense)}).`));
    }
    if (on('exclusivity') && F.exclusive === false) v.push(V('exclusivity', 'doc.exclusive', 'rule.exclusive', 'The exclusivity clause is missing.'));
    if (on('ko_suspension') && num(F.boutWeek) >= 0 && num(F.boutWeek) < num(F.suspUntil)) v.push(V('ko_suspension', 'doc.date', 'file.suspension', 'The bout is before the medical suspension ends.'));
    if (on('fighter_license') && F.hasId) {
      if (num(F.idPhoto) !== 0) v.push(V('fighter_license', 'id.photo', 'win.face', 'The licence photo is not the person at your door.'));
      if (F.idNumber !== F.flicense) v.push(V('fighter_license', 'id.number', 'doc.flicense', 'Licence # on the card does not match the agreement.'));
      if (num(F.boutDay) >= 0 && num(F.idExpires) < num(F.boutDay)) v.push(V('fighter_license', 'id.expires', 'doc.date', 'The fighter licence expires before the bout.'));
    }
    return v;
  },
  medical: (F, on) => {
    const v: Violation[] = [];
    if (on('medical_basic')) {
      if (!F.regLicense) v.push(V('medical_basic', 'doc.license', 'rule.doctors', `${str(F.doctor)} is not on the physician registry.`));
      else if (F.docLicense !== F.regLicense) v.push(V('medical_basic', 'doc.license', 'rule.doctors', `Licence # does not match the registry entry for ${str(F.doctor)}.`));
      const gap = num(F.fightDay) - num(F.examDay);
      if (gap > num(F.maxDays)) v.push(V('medical_basic', 'doc.issued', 'cal.fight', `The exam was ${gap} days before fight night (max ${num(F.maxDays)}).`));
    }
    const scans = arr(F.scans);
    for (const req of arr(F.required)) {
      const rule = scanRule(req);
      if (!scans.includes(req) && on(rule)) v.push(V(rule, 'doc.scans', 'rule.scans', `Required scan missing: ${req}.`));
    }
    if (on('ko_suspension') && num(F.fightWeek) < num(F.suspUntil)) v.push(V('ko_suspension', 'doc.result', 'file.suspension', 'Cleared to fight while still on medical suspension.'));
    return v;
  },
  expense: (F, on) => {
    const v: Violation[] = [];
    const amts = arr<number>(F.amts);
    const rcpts = arr<number>(F.receipts);
    const items = arr(F.items);
    const absurd = arr(F.absurd);
    if (on('expense_policy')) {
      const sum = amts.reduce((t, x) => t + x, 0);
      if (num(F.total) !== sum) v.push(V('expense_policy', 'doc.total', 'doc.item*', `The items add up to ${money(sum, false)}, not ${money(num(F.total), false)}.`));
      amts.forEach((a, i) => {
        if (rcpts[i] !== a) v.push(V('expense_policy', `doc.item${i}`, `doc.rcpt${i}`, `Line ${i + 1} claims ${money(a, false)}; the receipt says ${money(rcpts[i] ?? 0, false)}.`));
      });
    }
    if (on('expense_cap')) {
      amts.forEach((a, i) => {
        if (absurd[i]) v.push(V('expense_cap', `doc.item${i}`, 'rule.cap', `"${items[i]}" is not a camp expense (${absurd[i]}).`));
        else if (a > num(F.cap)) v.push(V('expense_cap', `doc.item${i}`, 'rule.cap', `Line ${i + 1} is over the ${money(num(F.cap), false)} per-item cap.`));
      });
    }
    return v;
  },
  drug: (F, on) => {
    const v: Violation[] = [];
    if (on('drug_program')) {
      const panel = arr(F.panel);
      const missing = arr(F.requiredPanel).filter((x) => !panel.includes(x));
      if (missing.length) v.push(V('drug_program', 'doc.panel', 'rule.panel', `Incomplete panel: no ${missing.join(', ')} test.`));
      const gap = num(F.fightDay) - num(F.collectedDay);
      if (gap > num(F.maxDays)) v.push(V('drug_program', 'doc.collected', 'cal.fight', `Sample is ${gap} days old by fight night (max ${num(F.maxDays)}).`));
      const banned = arr(F.banned);
      const hit = arr(F.found).filter((x) => banned.includes(x));
      if (hit.length && !F.tue) v.push(V('drug_program', 'doc.substances', 'rule.banned', `Banned substance ${hit[0]} detected with no exemption.`));
      if (num(F.pg) > num(F.pgLimit)) v.push(V('drug_program', 'doc.pg', 'rule.picogram', 'Metabolite level is over the picogram limit.'));
    }
    if (on('whereabouts') && num(F.strikes) > num(F.maxStrikes)) v.push(V('whereabouts', 'doc.strikes', 'rule.strikes', 'Too many whereabouts strikes: that is a failed test.'));
    return v;
  },
  sponsor: (F, on) => {
    const v: Violation[] = [];
    const cat = str(F.category);
    if (arr(F.bannedCats).includes(cat)) {
      const rule = cat === 'crypto' && on('crypto_ban') ? 'crypto_ban' : 'betting_ban';
      if (on(rule)) v.push(V(rule, 'doc.category', 'rule.bannedCats', `${cat} sponsors are banned.`));
    }
    if (on('sponsor_conflicts') && arr(F.fileCats).includes(cat)) v.push(V('sponsor_conflicts', 'doc.category', 'file.sponsor', `The fighter already wears a ${cat} sponsor.`));
    return v;
  },
  visa: (F, on) => {
    const v: Violation[] = [];
    if (!on('visa_rules')) return v;
    if (num(F.passportDay) < num(F.eventDay)) v.push(V('visa_rules', 'doc.passport', 'cal.event', 'The passport expires before the event.'));
    if (F.visaType !== 'Athlete Work Visa (P-1)') v.push(V('visa_rules', 'doc.visa', 'rule.visa', 'A tourist visa does not allow paid work.'));
    if (F.arrests !== F.recArrests) v.push(V('visa_rules', 'doc.arrests', 'file.arrests', 'The application hides a prior arrest.'));
    else if (F.destBlocks && F.recArrests !== 'None') v.push(V('visa_rules', 'doc.country', 'file.arrests', `${str(F.dest)} denies entry to anyone with that record.`));
    return v;
  },
  press: (F, on) => {
    const v: Violation[] = [];
    if (!on('press_creds')) return v;
    if (F.banned) {
      if (F.name !== F.realName) v.push(V('press_creds', 'doc.name', 'file.name', `That's ${str(F.realName)} in a fake moustache. Banned.`));
      else v.push(V('press_creds', 'doc.name', 'rule.bannedReporters', `${str(F.realName)} is on the banned list.`));
    }
    if (!F.outletOk) v.push(V('press_creds', 'doc.outlet', 'rule.outlets', 'That outlet is not accredited.'));
    if (F.photo !== F.visitor) v.push(V('press_creds', 'doc.photo', 'win.face', 'The credential photo is someone else.'));
    return v;
  },
  police: (F, on) => {
    const v: Violation[] = [];
    if (!on('court_dates') || num(F.boutWeek) < 0) return v;
    if (num(F.boutWeek) === num(F.courtWeek)) v.push(V('court_dates', 'doc.court', 'file.fight', 'Court date clashes with the booked fight.'));
    if (F.noTravel && F.region !== 'mojave') v.push(V('court_dates', 'doc.travel', 'file.fight', 'No-travel order: the fighter cannot leave the jurisdiction for that card.'));
    return v;
  },
  weighin: (F, on) => {
    const v: Violation[] = [];
    if (!on('weigh_tolerance') && !on('tighter_weighins')) return v;
    const max = num(F.limit) + num(F.tol);
    if (num(F.weightA) > max) v.push(V('weigh_tolerance', 'doc.weightA', 'rule.tolerance', `${str(F.lastA)} missed weight by ${(num(F.weightA) - num(F.limit)).toFixed(1)} lbs.`));
    else if (num(F.weightB) > max) v.push(V('weigh_tolerance', 'doc.weightB', 'rule.tolerance', `${str(F.lastB)} missed weight by ${(num(F.weightB) - num(F.limit)).toFixed(1)} lbs.`));
    return v;
  },
};

/** Derive a document's violations from its facts and the active rules. */
export function validateDoc(d: DeskDoc, on: On): Violation[] {
  const chk = RULE_CHECKS[d.type];
  if (!chk || !d.facts) return d.violations;
  return chk(d.facts, on);
}

export const activeOn = (s: GameState): On => (rule) => ruleActive(s, rule);

// ---------------------------------------------------------------- forgeries

interface Ctx {
  s: GameState;
  rng: Rng;
  ft: Fighter | null;
}

export interface Forgery {
  kind: string;
  type: DocType;
  rule: string;
  /** fraud/doping/forgery: only generated fighters (never parodies) */
  crime: boolean;
  /** an honest mistake the visitor can fix when asked */
  fixable: boolean;
  /** extra availability check */
  when?: (F: Facts, c: Ctx) => boolean;
  apply: (F: Facts, c: Ctx) => void;
}

export const FORGERIES: Forgery[] = [
  // bout agreements
  { kind: 'name', type: 'bout', rule: 'contract_basics', crime: false, fixable: true, apply: (F, c) => (F.name = misspell(str(F.name), c.rng)) },
  {
    kind: 'division', type: 'bout', rule: 'contract_basics', crime: false, fixable: true,
    apply: (F, c) => (F.division = divisionName(c.rng.pick(['light', 'welter', 'feather', 'middle', 'bantam'].filter((x) => divisionName(x) !== F.recDivision)))),
  },
  { kind: 'sig', type: 'bout', rule: 'contract_basics', crime: true, fixable: false, apply: (F, c) => (F.sig = sigOf({ id: c.ft?.id ?? 'x' }, c.rng.int(1, 9))) },
  { kind: 'purse', type: 'bout', rule: 'purse_match', crime: true, fixable: true, apply: (F, c) => (F.purse = Math.round((num(F.recPurse) * c.rng.float(1.2, 2.2)) / 500) * 500 + 500) },
  { kind: 'bonus', type: 'bout', rule: 'purse_match', crime: false, fixable: true, apply: (F, c) => (F.bonus = num(F.recBonus) + c.rng.int(1, 6) * 500) },
  { kind: 'replicense', type: 'bout', rule: 'manager_license', crime: true, fixable: false, when: (F) => !!F.regLicense && F.regLicense !== 'N/A (self)', apply: (F, c) => (F.repLicense = tweakCode(str(F.regLicense), c.rng)) },
  { kind: 'exclusive', type: 'bout', rule: 'exclusivity', crime: false, fixable: true, apply: (F) => (F.exclusive = false) },
  { kind: 'idphoto', type: 'bout', rule: 'fighter_license', crime: true, fixable: false, when: (F) => !!F.hasId, apply: (F, c) => (F.idPhoto = c.rng.int(1, 5)) },
  { kind: 'idexpired', type: 'bout', rule: 'fighter_license', crime: false, fixable: true, when: (F) => !!F.hasId && num(F.boutDay) >= 0, apply: (F, c) => (F.idExpires = num(F.boutDay) - c.rng.int(3, 80)) },
  { kind: 'idnumber', type: 'bout', rule: 'fighter_license', crime: false, fixable: true, when: (F) => !!F.hasId, apply: (F, c) => (F.flicense = tweakCode(str(F.idNumber), c.rng)) },
  // medicals
  {
    kind: 'doctor', type: 'medical', rule: 'medical_basic', crime: true, fixable: false,
    apply: (F, c) => {
      const fake = c.rng.pick(content().docs.doctors.filter((x) => !x.real));
      if (!fake) return;
      F.doctor = fake.name;
      F.docLicense = fake.license;
      F.regLicense = '';
    },
  },
  { kind: 'doclicense', type: 'medical', rule: 'medical_basic', crime: true, fixable: false, apply: (F, c) => (F.docLicense = tweakCode(str(F.regLicense), c.rng)) },
  { kind: 'stale', type: 'medical', rule: 'medical_basic', crime: false, fixable: false, apply: (F, c) => (F.examDay = num(F.fightDay) - num(F.maxDays) - c.rng.int(4, 60)) },
  {
    kind: 'scan', type: 'medical', rule: 'medical_basic', crime: false, fixable: true,
    apply: (F, c) => {
      const req = arr(F.required).filter((x) => c.s && ruleActive(c.s, scanRule(x)));
      const missing = c.rng.pick(req.length ? req : arr(F.required));
      F.scans = arr(F.scans).filter((x) => x !== missing);
    },
  },
  // camp expenses
  { kind: 'sum', type: 'expense', rule: 'expense_policy', crime: true, fixable: true, apply: (F, c) => (F.total = num(F.total) + c.rng.int(3, 40) * 100) },
  {
    kind: 'receipt', type: 'expense', rule: 'expense_policy', crime: true, fixable: true,
    apply: (F, c) => {
      const amts = arr<number>(F.amts).slice();
      const i = c.rng.int(0, amts.length - 1);
      amts[i] += c.rng.int(2, 15) * 100;
      F.amts = amts;
      F.total = amts.reduce((t, x) => t + x, 0);
    },
  },
  {
    kind: 'luxury', type: 'expense', rule: 'expense_cap', crime: true, fixable: true,
    apply: (F, c) => {
      const a = c.rng.pick(content().docs.expenseItems.filter((x) => x.absurd));
      if (!a) return;
      const amt = Math.round(c.rng.int(a.low, a.high) / 10) * 10;
      F.items = [...arr(F.items), a.item];
      F.amts = [...arr<number>(F.amts), amt];
      F.receipts = [...arr<number>(F.receipts), amt];
      F.absurd = [...arr(F.absurd), a.absurd ?? 'Luxury'];
      F.total = num(F.total) + amt;
    },
  },
  {
    kind: 'cap', type: 'expense', rule: 'expense_cap', crime: false, fixable: false,
    apply: (F, c) => {
      const amts = arr<number>(F.amts).slice();
      const rc = arr<number>(F.receipts).slice();
      const extra = num(F.cap) + c.rng.int(3, 25) * 100 - amts[0];
      amts[0] += extra;
      rc[0] += extra;
      F.amts = amts;
      F.receipts = rc;
      F.total = num(F.total) + extra;
    },
  },
  // anti-doping
  { kind: 'banned', type: 'drug', rule: 'drug_program', crime: true, fixable: false, when: (F) => arr(F.banned).length > 0, apply: (F, c) => { F.found = [...arr<string>(F.found), c.rng.pick(arr<string>(F.banned))]; F.tue = false; } },
  { kind: 'pg', type: 'drug', rule: 'drug_program', crime: true, fixable: false, apply: (F, c) => (F.pg = c.rng.int(num(F.pgLimit) + 5, num(F.pgLimit) * 4)) },
  {
    kind: 'panel', type: 'drug', rule: 'drug_program', crime: false, fixable: true,
    apply: (F, c) => {
      const miss = c.rng.pick(arr(F.requiredPanel));
      F.panel = arr(F.panel).filter((x) => x !== miss);
    },
  },
  { kind: 'drugstale', type: 'drug', rule: 'drug_program', crime: false, fixable: false, apply: (F, c) => (F.collectedDay = num(F.fightDay) - num(F.maxDays) - c.rng.int(5, 40)) },
  { kind: 'strikes', type: 'drug', rule: 'whereabouts', crime: true, fixable: false, apply: (F, c) => (F.strikes = num(F.maxStrikes) + c.rng.int(1, 2)) },
  // sponsors
  {
    kind: 'bannedcat', type: 'sponsor', rule: 'betting_ban', crime: false, fixable: false,
    when: (F) => arr(F.bannedCats).length > 0 && content().sponsors.some((p) => arr(F.bannedCats).includes(p.category)),
    apply: (F, c) => setSponsor(F, c.rng.pick(content().sponsors.filter((p) => arr(F.bannedCats).includes(p.category)))),
  },
  {
    kind: 'conflict', type: 'sponsor', rule: 'sponsor_conflicts', crime: false, fixable: false,
    when: (F) => arr(F.fileCats).length > 0,
    apply: (F, c) => {
      const dup = content().sponsors.filter((p) => arr(F.fileCats).includes(p.category));
      if (dup.length) setSponsor(F, c.rng.pick(dup));
    },
  },
  // visas
  { kind: 'passport', type: 'visa', rule: 'visa_rules', crime: false, fixable: false, apply: (F, c) => (F.passportDay = num(F.eventDay) - c.rng.int(3, 60)) },
  { kind: 'tourist', type: 'visa', rule: 'visa_rules', crime: false, fixable: true, apply: (F) => (F.visaType = 'Tourist Visa (B-2)') },
  { kind: 'hidden', type: 'visa', rule: 'visa_rules', crime: true, fixable: false, when: (F) => F.recArrests !== 'None', apply: (F) => (F.arrests = 'None') },
  // press
  {
    kind: 'outlet', type: 'press', rule: 'press_creds', crime: false, fixable: false,
    apply: (F, c) => {
      F.outlet = c.rng.pick(['MMA Truth Bombs Dot Biz', 'Real Fight Newz (Real)', "Big Dave's Fight Blog", 'The Daily Grapple (Unaffiliated)', 'OnlyFights Premium']);
      F.outletOk = false;
    },
  },
  {
    kind: 'pressphoto', type: 'press', rule: 'press_creds', crime: false, fixable: false,
    apply: (F, c) => {
      const other = c.rng.pick(content().reporters.filter((r) => r.id !== F.visitor));
      if (other) F.photo = other.id;
    },
  },
];

function setSponsor(F: Facts, sp: { id: string; name: string; category: string; blurb: string } | undefined): void {
  if (!sp) return;
  F.sponsorId = sp.id;
  F.sponsor = sp.name;
  F.category = sp.category;
  F.blurb = sp.blurb;
}

export function forgeriesFor(s: GameState, type: DocType, F: Facts, ft: Fighter | null): Forgery[] {
  const shady = ft ? canBeShady(ft) : true;
  return FORGERIES.filter((g) => {
    if (g.type !== type) return false;
    const rule = g.kind === 'bannedcat' ? (arr(F.bannedCats).includes('crypto') ? 'crypto_ban' : 'betting_ban') : g.rule;
    if (!ruleActive(s, rule)) return false;
    if (g.crime && !shady) return false;
    if (g.kind === 'scan' && !arr(F.required).some((x) => ruleActive(s, scanRule(x)))) return false;
    return !g.when || g.when(F, { s, rng: new Rng(1), ft });
  });
}

// ---------------------------------------------------------------- document kinds

interface Kind {
  title: string;
  /** honest facts; null = no doc this time */
  facts: (s: GameState, rng: Rng, ft: Fighter) => Facts | null;
  render: (F: Facts, s: GameState) => { fields: DocField[]; refs?: Record<string, string>; meta?: DeskDoc['meta']; fine?: string };
}

const KINDS: Partial<Record<DocType, Kind>> = {
  bout: {
    title: 'BOUT AGREEMENT',
    facts: (s, rng, ft) => {
      const mgr = content().managers.find((m) => m.id === ft.manager);
      const next = nextBoutFor(s, ft.id);
      const purse = ft.contract?.purse ?? 5000;
      const bonus = ft.contract?.winBonus ?? purse;
      const lic = fighterLicenceNo(ft);
      const boutWeek = next?.ev.week ?? -1;
      return {
        name: fullName(ft), recName: fullName(ft),
        division: divisionName(ft.division), recDivision: divisionName(ft.division),
        purse, recPurse: purse, bonus, recBonus: bonus,
        sig: sigOf(ft), recSig: sigOf(ft),
        boutWeek, boutDay: boutWeek >= 0 ? fightDayOf(boutWeek) : -1, event: next?.ev.name ?? '',
        suspUntil: ft.medSuspUntil,
        // self-represented fighters sign for themselves: no rep licence needed
        rep: mgr ? mgr.name : 'Self-represented', regLicense: !mgr ? 'N/A (self)' : mgr.licensed ? mgr.license : '', repLicense: !mgr ? 'N/A (self)' : mgr.licensed ? mgr.license : 'PENDING',
        exclusive: true,
        hasId: ruleActive(s, 'fighter_license'),
        idNumber: lic, flicense: lic, idPhoto: 0,
        idExpires: (boutWeek >= 0 ? fightDayOf(boutWeek) : s.week * 7) + rng.int(20, 320),
      };
    },
    render: (F, s) => {
      const fields = [
        f('doc.name', 'Fighter', str(F.name)),
        f('doc.division', 'Weight class', str(F.division)),
        f('doc.purse', 'Show purse', money(num(F.purse), false)),
        f('doc.bonus', 'Win bonus', money(num(F.bonus), false)),
        f('doc.date', 'Bout date', num(F.boutWeek) >= 0 ? `${fmtFightDate(num(F.boutWeek))}, Y${dateOf(num(F.boutWeek)).year} (${str(F.event)})` : 'TBD'),
        f('doc.manager', 'Representative', str(F.rep)),
      ];
      if (ruleActive(s, 'manager_license')) fields.push(f('doc.license', 'Rep. licence #', str(F.repLicense)));
      if (F.hasId) fields.push(f('doc.flicense', 'Fighter licence #', str(F.flicense)));
      if (ruleActive(s, 'exclusivity')) fields.push(f('doc.exclusive', 'Exclusivity', F.exclusive ? 'Included' : 'Omitted'));
      fields.push(f('doc.sig', 'Fighter signature', str(F.sig), 'sig'));
      const refs: Record<string, string> = {};
      if (F.hasId) {
        refs['id.name'] = str(F.recName);
        refs['id.number'] = str(F.idNumber);
        refs['id.expires'] = fmtDay(num(F.idExpires));
        refs['id.photo'] = 'photo:' + num(F.idPhoto);
      }
      return {
        fields, refs,
        meta: { purse: num(F.purse), boutWeek: num(F.boutWeek) >= 0 ? num(F.boutWeek) : null },
        fine: "THE FIGHTER AGREES TO BE PUNCHED IN EXCHANGE FOR MONEY. THE PROMOTION RETAINS ALL RIGHTS TO THE FIGHTER'S NAME, LIKENESS, VOICE, SHADOW AND SOUL, IN PERPETUITY, THROUGHOUT THE UNIVERSE.",
      };
    },
  },
  medical: {
    title: 'MEDICAL CLEARANCE',
    facts: (s, rng, ft) => {
      const real = content().docs.doctors.filter((x) => x.real);
      const doctor = rng.pick(real.length ? real : content().docs.doctors);
      const required = param<string[]>(s, 'requiredScans', ['Blood Panel']);
      const scans = required.slice();
      const extra = content().docs.scans.filter((x) => !scans.includes(x));
      if (extra.length && rng.chance(0.4)) scans.push(rng.pick(extra));
      const next = nextBoutFor(s, ft.id);
      const fightWeek = next?.ev.week ?? s.week + 3;
      const fightDay = fightDayOf(fightWeek);
      const maxDays = medMaxDays(s);
      // exam sometime in the window, never in the future
      const latest = Math.min(s.week * 7, fightDay - 1);
      // (a fight far in the future gets a post-dated exam slot: still inside the window)
      const examDay = Math.max(fightDay - maxDays + rng.int(1, 5), latest - rng.int(0, Math.max(0, Math.min(maxDays - 6, latest - (fightDay - maxDays)))));
      return {
        name: fullName(ft), doctor: doctor.name, docLicense: doctor.license, regLicense: doctor.real ? doctor.license : '',
        examDay, fightDay, fightWeek, event: next?.ev.name ?? '', maxDays, scans, required, suspUntil: ft.medSuspUntil,
      };
    },
    render: (F) => ({
      fields: [
        f('doc.name', 'Patient', str(F.name)),
        f('doc.doctor', 'Physician', str(F.doctor)),
        f('doc.license', 'Licence #', str(F.docLicense)),
        f('doc.issued', 'Exam date', fmtDay(num(F.examDay))),
        f('doc.scans', 'Scans', arr(F.scans).join(', ')),
        f('doc.result', 'Result', 'CLEARED TO COMPETE'),
      ],
      refs: { 'cal.fight': `${fmtDay(num(F.fightDay))}${F.event ? ' (' + str(F.event) + ')' : ' (next card)'}` },
      meta: { fightWeek: num(F.fightWeek) },
      fine: 'PATIENT REPORTS "FEELING GREAT". PATIENT ALSO REPORTS BEING ABLE TO "TAKE A BULLET". NOTED.',
    }),
  },
  expense: {
    title: 'CAMP EXPENSE REPORT',
    facts: (s, rng, ft) => {
      const cap = param(s, 'expenseCap', 3000);
      const normal = content().docs.expenseItems.filter((x) => !x.absurd);
      const picks = rng.sample(normal, rng.int(3, 4));
      const amts = picks.map((x) => Math.round(Math.min(cap, rng.int(x.low, x.high)) / 10) * 10);
      return {
        name: fullName(ft), manager: content().managers.find((m) => m.id === ft.manager)?.name ?? 'Fighter',
        items: picks.map((x) => x.item), amts, receipts: amts.slice(), absurd: picks.map(() => ''), total: amts.reduce((t, x) => t + x, 0), cap,
      };
    },
    render: (F) => {
      const items = arr(F.items);
      const amts = arr<number>(F.amts);
      const fields = [f('doc.name', 'Fighter', str(F.name))];
      items.forEach((it, i) => fields.push(f(`doc.item${i}`, `${i + 1}. ${it}`, money(amts[i], false))));
      fields.push(f('doc.total', 'TOTAL CLAIMED', money(num(F.total), false)));
      const refs: Record<string, string> = {};
      arr<number>(F.receipts).forEach((r, i) => (refs[`doc.rcpt${i}`] = money(r, false)));
      return { fields, refs, meta: { total: num(F.total), honest: amts.reduce((t, x) => t + x, 0) }, fine: 'SUBMITTED BY ' + str(F.manager).toUpperCase() + '. RECEIPTS STAPLED BELOW. SOME OF THEM ARE NAPKINS.' };
    },
  },
  drug: {
    title: 'ANTI-DOPING LAB REPORT',
    facts: (s, rng, ft) => {
      if (!ruleActive(s, 'drug_program')) return null;
      const banned = param<string[]>(s, 'bannedSubstances', []);
      const pgLimit = param(s, 'picogramLimit', 100);
      const legal = content().docs.substances.filter((x) => !banned.includes(x.code));
      const req = requiredPanel(s);
      const panel = PANEL.filter((p) => req.includes(p) || rng.chance(0.3));
      const next = nextBoutFor(s, ft.id);
      const fightWeek = next?.ev.week ?? s.week + 3;
      const fightDay = fightDayOf(fightWeek);
      const maxDays = drugMaxDays(s);
      const latest = Math.min(s.week * 7, fightDay - 1);
      const collectedDay = Math.max(fightDay - maxDays + rng.int(1, 3), latest - rng.int(0, Math.max(0, Math.min(maxDays - 4, latest - (fightDay - maxDays)))));
      const F: Facts = {
        name: fullName(ft), sample: 'S' + rng.int(100000, 999999), panel, requiredPanel: req, collectedDay, fightDay, event: next?.ev.name ?? '', maxDays,
        found: rng.sample(legal, rng.int(0, 2)).map((x) => x.code), banned, tue: false, pg: rng.int(0, Math.floor(pgLimit * 0.7)), pgLimit,
        strikes: rng.int(0, Math.max(0, param(s, 'maxStrikes', 2))), maxStrikes: param(s, 'maxStrikes', 2),
      };
      if (banned.length && rng.chance(0.12)) {
        // legit TUE: banned substance with an approved exemption (valid!)
        F.found = [...arr(F.found), rng.pick(banned)];
        F.tue = true;
      }
      return F;
    },
    render: (F) => ({
      fields: [
        f('doc.name', 'Athlete', str(F.name)),
        f('doc.sample', 'Sample ID', str(F.sample), 'barcode'),
        f('doc.collected', 'Collected', fmtDay(num(F.collectedDay))),
        f('doc.panel', 'Panel tested', arr(F.panel).join(', ')),
        f('doc.substances', 'Detected', arr(F.found).join(', ') || 'Nothing of note'),
        f('doc.pg', 'Metabolite', `${num(F.pg)} pg/mL`),
        f('doc.tue', 'Exemption', F.tue ? 'TUE-' + (hashString(str(F.sample)) % 9000 + 1000) + ' (APPROVED)' : 'None'),
        f('doc.strikes', 'Whereabouts', `${num(F.strikes)} strike(s)`),
      ],
      refs: { 'cal.fight': `${fmtDay(num(F.fightDay))}${F.event ? ' (' + str(F.event) + ')' : ' (next card)'}` },
      meta: { severity: num(F.pg) > num(F.pgLimit) * 2 ? 2 : 1 },
      fine: 'SAMPLE COLLECTED AT 6:02 AM. ATHLETE DESCRIBED COLLECTION AGENT AS "A VAMPIRE" AND "MY ARCH NEMESIS".',
    }),
  },
  sponsor: {
    title: 'SPONSOR PATCH AGREEMENT',
    facts: (s, rng, ft) => {
      const bannedCats = param<string[]>(s, 'bannedSponsorCategories', []);
      const pool = content().sponsors;
      const fileCats = s.sponsorDeals.filter((x) => x.fighter === ft.id).map((x) => pool.find((p) => p.id === x.sponsor)?.category ?? '').filter(Boolean);
      const ok = pool.filter((p) => !bannedCats.includes(p.category) && !fileCats.includes(p.category));
      const sp = rng.pick(ok.length ? ok : pool);
      const F: Facts = { name: fullName(ft), bannedCats, fileCats, amount: 0 };
      setSponsor(F, sp);
      F.amount = Math.round(sp.weekly * scale(s) * rng.float(2, 6));
      return F;
    },
    render: (F) => ({
      fields: [
        f('doc.name', 'Athlete', str(F.name)),
        f('doc.sponsor', 'Sponsor', str(F.sponsor)),
        f('doc.category', 'Category', str(F.category)),
        f('doc.amount', 'Fee to promotion', money(num(F.amount), false)),
        f('doc.blurb', 'Tagline', str(F.blurb)),
      ],
      meta: { sponsor: str(F.sponsorId), amount: num(F.amount) },
    }),
  },
  visa: {
    title: 'WORK VISA APPLICATION',
    facts: (s, rng, ft) => {
      if (!ruleActive(s, 'visa_rules')) return null;
      const countries = content().docs.countries;
      const rec = ft.legalRecord.length ? ft.legalRecord.join('; ') : 'None';
      const pool = rec !== 'None' ? countries.filter((c) => !c.blocksArrests) : countries;
      const dest = rng.pick(pool.length ? pool : countries);
      const next = nextBoutFor(s, ft.id);
      const evWeek = next?.ev.week ?? s.week + 4;
      return {
        name: fullName(ft), nationality: ft.country, dest: dest.name, destBlocks: dest.blocksArrests, visaType: 'Athlete Work Visa (P-1)',
        eventDay: fightDayOf(evWeek), passportDay: fightDayOf(evWeek) + rng.int(20, 900), arrests: rec, recArrests: rec,
      };
    },
    render: (F) => ({
      fields: [
        f('doc.name', 'Applicant', str(F.name)),
        f('doc.nationality', 'Nationality', str(F.nationality)),
        f('doc.country', 'Destination', str(F.dest)),
        f('doc.visa', 'Visa type', str(F.visaType)),
        f('doc.passport', 'Passport expires', fmtDay(num(F.passportDay))),
        f('doc.arrests', 'Prior arrests', str(F.arrests)),
      ],
      refs: { 'cal.event': fmtDay(num(F.eventDay)) },
    }),
  },
};

function assemble(s: GameState, type: DocType, ft: Fighter | null, F: Facts, honest: Facts | null, forgery: Forgery | null): DeskDoc {
  const k = KINDS[type]!;
  const d = base(s, type, k.title, ft);
  d.facts = F;
  applyRender(s, d);
  if (forgery) {
    d.meta.forgery = forgery.kind;
    d.meta.fixable = forgery.fixable;
    const fix: Facts = {};
    for (const key of Object.keys(F)) if (JSON.stringify(F[key]) !== JSON.stringify(honest![key])) fix[key] = honest![key];
    d.meta.fix = JSON.stringify(fix);
  }
  d.violations = validateDoc(d, activeOn(s));
  return d;
}

/** (Re)build fields/refs/meta of a doc from its facts. */
export function applyRender(s: GameState, d: DeskDoc): void {
  const k = KINDS[d.type];
  if (!k || !d.facts) return;
  const r = k.render(d.facts, s);
  d.fields = r.fields;
  Object.assign(d.refs, ruleRefs(s), r.refs ?? {});
  Object.assign(d.meta, r.meta ?? {});
  if (r.fine) d.fine = r.fine;
}

/** Undo the forgery (the visitor fixed it): restore honest facts and re-check. */
export function fixDoc(s: GameState, d: DeskDoc): boolean {
  if (!d.facts || typeof d.meta.fix !== 'string') return false;
  Object.assign(d.facts, JSON.parse(d.meta.fix) as Facts);
  delete d.meta.fix;
  delete d.meta.forgery;
  applyRender(s, d);
  d.violations = validateDoc(d, activeOn(s));
  return true;
}

/**
 * Build one document. `bad` asks for a forgery (if one is possible);
 * `force` picks a specific forgery kind (tests, tutorial).
 */
export function makeDoc(s: GameState, type: DocType, ft: Fighter, bad: boolean, rng: Rng, force?: string, prefer?: string[]): DeskDoc | null {
  if (type === 'press') return genPress(s, rng, bad, force);
  if (type === 'police') return genPolice(s, rng, ft);
  const k = KINDS[type];
  if (!k) return null;
  const honest = k.facts(s, rng, ft);
  if (!honest) return null;
  const F: Facts = JSON.parse(JSON.stringify(honest));
  let forgery: Forgery | null = null;
  if (bad || force) {
    const opts = forgeriesFor(s, type, F, ft);
    const forced = force ? FORGERIES.find((g) => g.kind === force && g.type === type) ?? null : null;
    const preferred = prefer ? opts.filter((g) => prefer.includes(g.rule)) : [];
    forgery = forced ?? (preferred.length && rng.chance(0.7) ? rng.pick(preferred) : opts.length ? rng.pick(opts) : null);
    forgery?.apply(F, { s, rng, ft });
  } else if (type === 'drug' && canBeShady(ft) && (ft.traits.includes('Gym Rat') || ft.hiddenTraits.length > 0) && rng.chance(0.06)) {
    // a real cheater pops on a routine test
    const g = FORGERIES.find((x) => x.kind === 'banned' || x.kind === 'pg');
    if (g && (!g.when || g.when(F, { s, rng, ft }))) {
      g.apply(F, { s, rng, ft });
      forgery = g;
    }
  }
  return assemble(s, type, ft, F, honest, forgery);
}

function genPress(s: GameState, rng: Rng, bad: boolean, force?: string): DeskDoc | null {
  if (!ruleActive(s, 'press_creds')) return null;
  const reps = content().reporters;
  if (!reps.length) return null;
  const rep = rng.pick(reps);
  const d = base(s, 'press', 'PRESS CREDENTIAL REQUEST', null);
  const banned = !!s.media.reporters[rep.id]?.banned;
  const F: Facts = {
    name: rep.name, realName: rep.name, outlet: content().outlets.find((o) => o.id === rep.outlet)?.name ?? 'Freelance', outletOk: true,
    cred: 'PR-' + rng.int(10000, 99999), photo: rep.id, visitor: rep.id, banned,
  };
  if (banned && rng.chance(0.5)) F.name = misspell(rep.name, rng) + ' (different guy)';
  let forgery: Forgery | null = null;
  if (!banned && (bad || force)) {
    const opts = forgeriesFor(s, 'press', F, null);
    forgery = (force ? FORGERIES.find((g) => g.kind === force) : null) ?? (opts.length ? rng.pick(opts) : null);
    forgery?.apply(F, { s, rng, ft: null });
  }
  d.facts = F;
  d.fields = [
    f('doc.name', 'Name', str(F.name)),
    f('doc.outlet', 'Outlet', str(F.outlet)),
    f('doc.cred', 'Credential #', str(F.cred)),
    f('doc.photo', 'Photo', 'face:' + str(F.photo), 'photo'),
  ];
  Object.assign(d.refs, ruleRefs(s), { 'file.name': rep.name });
  d.meta = { reporter: rep.id, ...(forgery ? { forgery: forgery.kind, fixable: false } : {}) };
  d.violations = validateDoc(d, activeOn(s));
  return d;
}

function genPolice(s: GameState, _rng: Rng, ft: Fighter): DeskDoc | null {
  const c = s.legal.cases.find((x) => x.who === ft.id && x.status === 'bail');
  if (!c || !ruleActive(s, 'court_dates')) return null;
  const d = base(s, 'police', 'COURT NOTICE (CARBON COPY)', ft);
  const charge = content().charges.find((x) => x.id === c.charge);
  const next = nextBoutFor(s, ft.id);
  d.facts = { boutWeek: next?.ev.week ?? -1, courtWeek: c.courtWeek, noTravel: !!c.noTravel, region: next?.ev.region ?? 'mojave' };
  d.fields = [
    f('doc.name', 'Defendant', fullName(ft)),
    f('doc.charge', 'Charge', charge?.name ?? c.charge),
    f('doc.bail', 'Bail posted', money(c.bail, false)),
    f('doc.court', 'Court date', fmtDate(c.courtWeek)),
    f('doc.travel', 'Travel', c.noTravel ? 'NO-TRAVEL ORDER' : 'Permitted'),
    f('doc.monitor', 'Ankle monitor', c.monitor ? 'YES' : 'No'),
  ];
  Object.assign(d.refs, ruleRefs(s));
  d.violations = validateDoc(d, activeOn(s));
  d.meta = { caseId: c.id };
  d.fine = 'APPROVE = KEEP FIGHTER ON THE CARD. DENY = PULL FIGHTER FROM THE CARD.';
  return d;
}

// ---------------------------------------------------------------- weigh-ins

function weighFacts(d: DeskDoc, s: GameState, ev: FightEvent, b: Bout, wa: number, wb: number): void {
  const A = s.fighters[b.a];
  const B = s.fighters[b.b];
  const limit = DIVISION_LIMITS[b.division] ?? 155;
  const tol = b.title ? 0 : param(s, 'weightTolerance', 1);
  d.facts = { weightA: wa, weightB: wb, limit, tol, lastA: A.last, lastB: B.last };
  d.fields = [
    f('doc.bout', 'Bout', `${fullName(A)} vs ${fullName(B)}`),
    f('doc.class', 'Division', `${divisionName(b.division)} (${limit} lbs)${b.title ? ' - TITLE' : ''}`),
    f('doc.weightA', A.last, `${wa.toFixed(1)} lbs`),
    f('doc.weightB', B.last, `${wb.toFixed(1)} lbs`),
    f('doc.event', 'Event', ev.name),
  ];
  d.violations = validateDoc(d, activeOn(s));
  const missedBy = d.violations.length ? (d.violations[0].a === 'doc.weightA' ? A.id : B.id) : null;
  Object.assign(d.meta, { eventId: ev.id, boutId: b.id, missedBy, weightA: wa, weightB: wb, limit });
}

/** Weigh-in sheet for a bout (fight week). */
export function weighInDoc(s: GameState, ev: FightEvent, b: Bout, rng: Rng): DeskDoc {
  const A = s.fighters[b.a];
  const B = s.fighters[b.b];
  const d = base(s, 'weighin', 'OFFICIAL WEIGH-IN SHEET', A);
  const limit = DIVISION_LIMITS[b.division] ?? 155;
  const tol = b.title ? 0 : param(s, 'weightTolerance', 1);
  const weigh = (ft: Fighter) => {
    const miss = ft.skills.weightCut / 260 + ft.weightMisses * 0.05 + (ft.addiction > 50 ? 0.05 : 0);
    if (rng.chance(miss)) return limit + tol + rng.int(1, 7) + rng.pick([0, 0.2, 0.4, 0.6, 0.8]);
    return limit + (rng.chance(0.4) ? Math.min(tol, rng.pick([0, 0.2, 0.4, 0.6, 0.8])) : -rng.pick([0, 0.4, 0.8, 1.2]));
  };
  d.refs['file.limit'] = `${limit} lbs`;
  Object.assign(d.refs, ruleRefs(s));
  weighFacts(d, s, ev, b, Math.round(weigh(A) * 10) / 10, Math.round(weigh(B) * 10) / 10);
  d.fine = 'APPROVE = FIGHT AS IS  /  DENY = CANCEL BOUT  /  ESCALATE = CATCHWEIGHT + 25% PURSE FINE  /  BURY = "THE SCALE WAS BROKEN"';
  return d;
}

/** Sauna + spit cup: re-weigh the fighter who missed. Returns the new weight or null. */
export function reweigh(s: GameState, d: DeskDoc, rng: Rng): { made: boolean; who: string; weight: number } | null {
  if (d.type !== 'weighin' || !d.meta.missedBy || d.meta.reweighed) return null;
  const ev = s.events.find((e) => e.id === d.meta.eventId);
  const b = ev?.card.find((x) => x.id === d.meta.boutId);
  if (!ev || !b) return null;
  const isA = d.meta.missedBy === b.a;
  const cur = Number(isA ? d.meta.weightA : d.meta.weightB);
  const limit = Number(d.meta.limit);
  const tol = b.title ? 0 : param(s, 'weightTolerance', 1);
  const over = cur - limit - tol;
  const made = rng.chance(over <= 1 ? 0.7 : over <= 2.5 ? 0.4 : 0.12);
  const nw = Math.round((made ? limit + tol - rng.pick([0, 0.2, 0.4]) : cur - rng.pick([0.4, 0.8, 1.2])) * 10) / 10;
  d.meta.reweighed = true;
  weighFacts(d, s, ev, b, isA ? nw : Number(d.meta.weightA), isA ? Number(d.meta.weightB) : nw);
  return { made, who: s.fighters[isA ? b.a : b.b]?.last ?? '?', weight: nw };
}

// ---------------------------------------------------------------- memos

export function memoDoc(s: GameState, title: string, body: string, from?: string): DeskDoc {
  const d = base(s, 'memo', title, null);
  d.fields = [f('doc.from', 'From', from ?? s.owner.name), f('doc.body', 'Memo', body)];
  return d;
}

/** Bail Office ticket: handled in its own scene. */
export function bailDoc(s: GameState, caseId: string): DeskDoc {
  const c = s.legal.cases.find((x) => x.id === caseId)!;
  const ft = c.who === 'president' ? null : s.fighters[c.who];
  const d = base(s, 'bail', 'BAIL OFFICE: CUSTODY NOTICE', ft ?? null);
  const charge = content().charges.find((x) => x.id === c.charge);
  d.fields = [
    f('doc.name', 'In custody', ft ? fullName(ft) : s.president.name + ' (YOU)'),
    f('doc.charge', 'Charge', charge?.name ?? c.charge),
    f('doc.bail', 'Bail set at', money(c.bail, false)),
    f('doc.court', 'Court date', fmtDate(c.courtWeek)),
    f('doc.desc', 'Details', charge?.desc ?? ''),
  ];
  d.meta = { caseId };
  return d;
}

// ---------------------------------------------------------------- the day's paperwork

/** Doc types that rules have brought onto the desk so far. */
export function deskTypes(s: GameState): DocType[] {
  const out = new Set<DocType>();
  for (const id of s.rules.active) for (const t of ruleDef(id)?.docTypes ?? []) out.add(t as DocType);
  return [...out];
}

const TYPE_WEIGHT: Partial<Record<DocType, number>> = { bout: 3, medical: 2.2, expense: 1.6, sponsor: 1.2, drug: 1.8, visa: 1, press: 1 };

/** How many routine documents land on the desk today. Grows over the career. */
export function docsPerDay(s: GameState): number {
  const ramp = 3 + Math.floor(s.week / 2);
  const diff = s.difficulty === 'fightweek' ? 1 : s.difficulty === 'easy' ? -1 : 0;
  return Math.max(2, Math.min(9 + Math.min(3, s.act - 1), ramp + diff + Math.max(0, s.act - 1)));
}

const BULLETIN_DOC_NAMES: Partial<Record<DocType, string>> = {
  bout: 'bout agreements', medical: 'medical clearances', expense: 'camp expense reports', sponsor: 'sponsor patches', drug: 'lab reports',
  visa: 'work visas', press: 'press credentials', police: 'court notices', weighin: 'weigh-in sheets',
};

/** The morning bulletin listing rules that start today. */
export function bulletinDoc(s: GameState, ruleIds: string[]): DeskDoc | null {
  const lines = ruleIds.map((id) => ruleDef(id)).filter((r) => r && (r.bulletin || r.title)).map((r) => '- ' + (r!.bulletin ?? `NEW RULE: ${r!.title}. ${r!.text}`));
  if (!lines.length) return null;
  const n = (s.stats.bulletins = (s.stats.bulletins ?? 0) + 1);
  const d = memoDoc(s, `COMMISSION BULLETIN #${n}`, lines.join('\n') + '\n(Rulebook updated. New pages are marked NEW.)', 'Athletic Commission');
  d.meta.bulletin = true;
  d.meta.rules = ruleIds.join(',');
  return d;
}

/** Generate this morning's paperwork (and any bulletin for rules starting today). */
export function generateWeekDocs(s: GameState, rng: Rng): DeskDoc[] {
  const out: DeskDoc[] = [];
  const fresh = activateScheduledRules(s);
  const todays = s.week === 0 ? s.rules.active.filter((id) => ruleDef(id)?.week === 0 && id !== 'weigh_tolerance') : fresh.slice();
  // weigh-in sheets are introduced on the first fight week
  if (eventThisWeek(s) && !s.flags.weighin_intro) {
    s.flags.weighin_intro = 1;
    if (ruleActive(s, 'weigh_tolerance') && !todays.includes('weigh_tolerance')) todays.push('weigh_tolerance');
  }
  const bulletin = bulletinDoc(s, todays);
  if (bulletin) out.push(bulletin);
  const roster = Object.values(s.fighters).filter(isOurs);
  if (!roster.length) return out;
  const count = docsPerDay(s) + rng.int(0, 1);
  const badRate = { easy: 0.25, normal: 0.33, fightweek: 0.42, ironman: 0.38 }[s.difficulty] + s.act * 0.02;
  const types = deskTypes(s).filter((t) => TYPE_WEIGHT[t]);
  if (!types.length) return out;
  const freshTypes = new Set(fresh.flatMap((id) => ruleDef(id)?.docTypes ?? []));
  const booked = roster.filter((x) => isBooked(s, x.id));
  const queue: DocType[] = [];
  // a new document type always shows up on its first day (twice: one to learn on)
  for (const t of types) if (freshTypes.has(t)) queue.push(t, t);
  while (queue.length < count) queue.push(rng.weighted(types, (t) => TYPE_WEIGHT[t] ?? 1) ?? 'bout');
  let tries = 0;
  for (const type of queue) {
    if (out.length - (bulletin ? 1 : 0) >= Math.max(count, queue.length) || tries++ > 40) break;
    const pool = (type === 'bout' || type === 'medical' || type === 'visa' || type === 'drug') && booked.length ? booked : roster;
    let ft = rng.pick(pool);
    if (out.some((d) => d.subject === ft.id && d.type === type)) ft = rng.pick(roster);
    if (out.some((d) => d.subject === ft.id && d.type === type)) continue;
    const isFresh = freshTypes.has(type) || fresh.some((id) => ruleDef(id)?.docTypes.includes(type));
    // the last document of a clean day is a dud more often than not: every shift has a catch in it
    const lastCall = out.length - (bulletin ? 1 : 0) === queue.length - 1 && !out.some((d) => d.violations.length);
    const bad = rng.chance(lastCall ? 0.8 : isFresh ? 0.55 : type === 'drug' ? badRate * 0.5 : badRate);
    const doc = makeDoc(s, type, ft, bad, rng, undefined, isFresh ? fresh : undefined);
    if (doc) out.push(doc);
  }
  // court notices for fighters on bail with fights booked
  for (const c of s.legal.cases.filter((x) => x.status === 'bail' && x.who !== 'president')) {
    const ft = s.fighters[c.who];
    if (ft && isBooked(s, ft.id) && !out.some((d) => d.type === 'police' && d.subject === ft.id)) {
      const doc = genPolice(s, rng, ft);
      if (doc) out.push(doc);
    }
  }
  return out;
}

/** The tutorial's scripted first day: one clean agreement, one with a very obvious problem. */
export function tutorialDocs(s: GameState, rng: Rng): DeskDoc[] {
  const roster = Object.values(s.fighters).filter(isOurs).filter((f) => f.contract);
  const pick = roster.filter(canBeShady);
  const a = (pick[0] ?? roster[0]) as Fighter | undefined;
  const b = (pick[1] ?? roster[1] ?? a) as Fighter | undefined;
  if (!a || !b) return [];
  const clean = makeDoc(s, 'bout', a, false, rng)!;
  const dodgy = makeDoc(s, 'bout', b, false, rng)!;
  // inflate the purse tenfold: hard to miss
  dodgy.facts!.purse = Math.round((num(dodgy.facts!.recPurse) * 10) / 500) * 500;
  dodgy.meta.forgery = 'purse';
  dodgy.meta.fixable = false;
  applyRender(s, dodgy);
  dodgy.violations = validateDoc(dodgy, activeOn(s));
  clean.meta.tutorial = 'clean';
  dodgy.meta.tutorial = 'dodgy';
  return [clean, dodgy];
}

/** Is this pair of field keys a real discrepancy on the doc? ('doc.item*' matches any line item.) */
export function checkPair(d: DeskDoc, a: string, b: string): Violation | null {
  const m = (pat: string, k: string) => (pat.endsWith('*') ? k.startsWith(pat.slice(0, -1)) : pat === k);
  return d.violations.find((v) => (m(v.a, a) && m(v.b, b)) || (m(v.a, b) && m(v.b, a))) ?? null;
}

export function fieldValue(d: DeskDoc, key: string): string {
  return d.fields.find((x) => x.key === key)?.value ?? d.refs[key] ?? '';
}
