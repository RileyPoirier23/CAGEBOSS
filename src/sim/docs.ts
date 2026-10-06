/**
 * Desk documents (Papers, Please-style inspection). Each document carries
 * fields; some are generated with planted discrepancies against the
 * fighter's file card ("file.*"), the rulebook ("rule.*") or the calendar
 * ("cal.*"). The player finds them by comparing two fields, then stamps.
 */
import type { DeskDoc, DocField, DocType, Fighter, GameState, Violation, Bout, FightEvent } from '../core/types';
import { content } from '../core/content';
import { Rng, hashString } from '../core/rng';
import { money } from '../core/format';
import { fmtDate, fmtFightDate } from '../core/time';
import { fullName, isOurs, isBooked } from './fighters';
import { param, ruleActive } from './rules';
import { DIVISION_LIMITS, divisionName } from './divisions';
import { upcomingEvents } from './events';
import { scale } from './econ';

let docSeq = 0;
function newId(s: GameState, type: string): string {
  return `d${s.week}_${type}_${(s.stats.docSeq = (s.stats.docSeq ?? 0) + 1)}_${docSeq++ % 7}`;
}

export function sigOf(f: { id: string }, variant = 0): string {
  return 'sig:' + (hashString(f.id + (variant ? ':forged' + variant : '')) % 100000);
}

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

export function ruleRefs(s: GameState): Record<string, string> {
  const banned = param<string[]>(s, 'bannedSubstances', []);
  return {
    'rule.registry': content().managers.filter((m) => m.licensed).map((m) => `${m.name}: ${m.license}`).join('\n'),
    'rule.exclusive': 'Exclusivity clause REQUIRED',
    'rule.doctors': content().docs.doctors.filter((d) => d.real).map((d) => `${d.name} ${d.license}`).join('\n'),
    'rule.scans': param<string[]>(s, 'requiredScans', ['Blood Panel']).join(', '),
    'rule.validity': `${param(s, 'medicalValidityWeeks', 26)} weeks`,
    'rule.tolerance': `${param(s, 'weightTolerance', 1)} lb over limit (non-title)`,
    'rule.banned': banned.join(', ') || 'N/A',
    'rule.picogram': `${param(s, 'picogramLimit', 100)} pg/mL`,
    'rule.strikes': `Max ${param(s, 'maxStrikes', 2)} whereabouts strikes`,
    'rule.bannedCats': param<string[]>(s, 'bannedSponsorCategories', []).join(', ') || 'None',
    'rule.cap': money(param(s, 'expenseCap', 3000), false) + ' per item; no luxuries',
    'rule.bannedReporters': content().reporters.filter((r) => s.media.reporters[r.id]?.banned).map((r) => r.name).join(', ') || 'None',
    'rule.outlets': content().outlets.map((o) => o.name).join(', '),
    'rule.court': 'No fights on/after a court date that week',
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
  };
}

function finalize(s: GameState, d: DeskDoc): DeskDoc {
  // snapshot every rule value referenced by a violation or field so later rule changes don't alter this doc
  Object.assign(d.refs, ruleRefs(s));
  return d;
}

// ---------------------------------------------------------------- generators

type Gen = (s: GameState, rng: Rng, ft: Fighter, bad: boolean) => DeskDoc | null;

const genBout: Gen = (s, rng, ft, bad) => {
  const d = base(s, 'bout', 'BOUT AGREEMENT', ft);
  const mgr = content().managers.find((m) => m.id === ft.manager);
  const next = nextBoutFor(s, ft.id);
  let name = fullName(ft);
  let division = divisionName(ft.division);
  let purse = ft.contract?.purse ?? 5000;
  let sig = sigOf(ft);
  let license = mgr?.licensed ? mgr.license : 'PENDING';
  let exclusive = 'Included';
  const opts: string[] = ['name', 'division', 'purse', 'sig', 'exclusive'];
  if (mgr && !mgr.licensed) opts.length = 0; // genuinely unlicensed manager is already a violation
  if (ft.medSuspUntil > s.week && next && next.ev.week < ft.medSuspUntil) opts.push('susp');
  const v: Violation[] = [];
  if (mgr && !mgr.licensed && ruleActive(s, 'manager_license')) {
    v.push({ rule: 'manager_license', a: 'doc.license', b: 'rule.registry', text: `${mgr.name} is not a licensed manager.` });
  } else if (bad) {
    const kind = rng.pick(opts.length ? opts : ['purse']);
    switch (kind) {
      case 'name':
        name = misspell(name, rng);
        v.push({ rule: 'contract_basics', a: 'doc.name', b: 'file.name', text: 'Name on the agreement does not match the file.' });
        break;
      case 'division': {
        const other = ['light', 'welter', 'feather', 'middle', 'bantam'].filter((x) => x !== ft.division);
        division = divisionName(rng.pick(other));
        v.push({ rule: 'contract_basics', a: 'doc.division', b: 'file.division', text: 'Weight class does not match the fighter on file.' });
        break;
      }
      case 'purse':
        purse = Math.round((purse * rng.float(1.2, 2.2)) / 500) * 500;
        v.push({ rule: 'contract_basics', a: 'doc.purse', b: 'file.purse', text: 'The purse was inflated above what you agreed.' });
        break;
      case 'sig':
        sig = sigOf(ft, rng.int(1, 9));
        v.push({ rule: 'contract_basics', a: 'doc.sig', b: 'file.sig', text: 'The signature is forged.' });
        break;
      case 'exclusive':
        if (ruleActive(s, 'exclusivity')) {
          exclusive = 'Omitted';
          v.push({ rule: 'exclusivity', a: 'doc.exclusive', b: 'rule.exclusive', text: 'Exclusivity clause is missing.' });
        } else {
          purse = Math.round((purse * 1.6) / 500) * 500;
          v.push({ rule: 'contract_basics', a: 'doc.purse', b: 'file.purse', text: 'The purse was inflated above what you agreed.' });
        }
        break;
      case 'susp':
        v.push({ rule: 'ko_suspension', a: 'doc.date', b: 'file.suspension', text: 'The fighter is still on medical suspension for that date.' });
        break;
    }
  }
  if (!bad && mgr && mgr.licensed && rng.chance(0.1)) license = mgr.license; // noise
  d.fields = [
    f('doc.name', 'Fighter', name),
    f('doc.division', 'Weight class', division),
    f('doc.purse', 'Show purse', money(purse, false)),
    f('doc.bonus', 'Win bonus', money(ft.contract?.winBonus ?? purse, false)),
    f('doc.date', 'Bout date', next ? `${fmtFightDate(next.ev.week)} (${next.ev.name})` : 'TBD'),
    f('doc.manager', 'Representative', mgr?.name ?? ft.manager),
    f('doc.license', 'Rep. license #', license),
    f('doc.exclusive', 'Exclusivity', exclusive),
    f('doc.sig', 'Fighter signature', sig, 'sig'),
  ];
  d.violations = v;
  d.meta = { purse, boutWeek: next?.ev.week ?? null };
  d.fine = 'THE FIGHTER AGREES TO BE PUNCHED IN EXCHANGE FOR MONEY. THE PROMOTION RETAINS ALL RIGHTS TO THE FIGHTER\'S NAME, LIKENESS, VOICE, SHADOW AND SOUL, IN PERPETUITY, THROUGHOUT THE UNIVERSE.';
  return finalize(s, d);
};

const genMedical: Gen = (s, rng, ft, bad) => {
  const d = base(s, 'medical', 'MEDICAL CLEARANCE', ft);
  const docs = content().docs.doctors;
  const real = docs.filter((x) => x.real);
  const fakes = docs.filter((x) => !x.real);
  let doctor = rng.pick(real.length ? real : docs);
  const required = param<string[]>(s, 'requiredScans', ['Blood Panel']);
  let scans = required.slice();
  if (rng.chance(0.4)) scans.push(rng.pick(content().docs.scans.filter((x) => !scans.includes(x))) ?? 'EKG');
  const validity = param(s, 'medicalValidityWeeks', 26);
  const next = nextBoutFor(s, ft.id);
  const fightWeek = next?.ev.week ?? s.week + 3;
  let issued = s.week - rng.int(0, Math.max(1, validity - 6));
  let expires = issued + validity;
  const v: Violation[] = [];
  if (bad) {
    const opts = ['doctor', 'expired', 'scan'];
    if (ft.medSuspUntil > s.week) opts.push('susp');
    const kind = rng.pick(opts);
    if (kind === 'doctor' && fakes.length) {
      doctor = rng.pick(fakes);
      v.push({ rule: 'medical_basic', a: 'doc.license', b: 'rule.doctors', text: `${doctor.name} is not on the physician registry.` });
    } else if (kind === 'expired') {
      issued = fightWeek - validity - rng.int(1, 6);
      expires = issued + validity;
      v.push({ rule: 'medical_basic', a: 'doc.expires', b: 'cal.fight', text: 'The clearance expires before fight night.' });
    } else if (kind === 'scan' && required.length) {
      const missing = rng.pick(required);
      scans = scans.filter((x) => x !== missing);
      v.push({ rule: required.includes('MRI') && missing === 'MRI' ? 'mri_required' : 'medical_basic', a: 'doc.scans', b: 'rule.scans', text: `Required scan missing: ${missing}.` });
    } else {
      v.push({ rule: 'ko_suspension', a: 'doc.result', b: 'file.suspension', text: 'Fighter was cleared while still on medical suspension.' });
    }
  }
  d.fields = [
    f('doc.name', 'Patient', fullName(ft)),
    f('doc.doctor', 'Physician', doctor.name),
    f('doc.license', 'License #', doctor.license),
    f('doc.issued', 'Exam date', fmtDate(issued)),
    f('doc.expires', 'Valid until', fmtDate(expires)),
    f('doc.scans', 'Scans', scans.join(', ')),
    f('doc.result', 'Result', 'CLEARED TO COMPETE'),
  ];
  d.refs['cal.fight'] = next ? fmtFightDate(next.ev.week) + ' (' + fmtDate(next.ev.week) + ')' : 'Next card: ' + fmtDate(fightWeek);
  d.violations = v;
  d.meta = { expires };
  d.fine = 'PATIENT REPORTS "FEELING GREAT". PATIENT ALSO REPORTS BEING ABLE TO "TAKE A BULLET". NOTED.';
  return finalize(s, d);
};

const genDrug: Gen = (s, rng, ft, bad) => {
  if (!ruleActive(s, 'drug_program')) return null;
  const d = base(s, 'drug', 'ANTI-DOPING LAB REPORT', ft);
  const banned = param<string[]>(s, 'bannedSubstances', []);
  const limit = param(s, 'picogramLimit', 100);
  const maxStrikes = param(s, 'maxStrikes', 2);
  const legal = content().docs.substances.filter((x) => !banned.includes(x.code));
  let found = rng.sample(legal, rng.int(0, 2)).map((x) => x.code);
  let pg = rng.int(0, Math.floor(limit * 0.7));
  let tue = 'None';
  let strikes = rng.int(0, Math.max(0, maxStrikes - 1));
  const v: Violation[] = [];
  const cheater = ft.traits.includes('Gym Rat') || ft.hiddenTraits.length > 0;
  if (bad || (cheater && rng.chance(0.08))) {
    const kind = rng.pick(['banned', 'pg', ruleActive(s, 'whereabouts') ? 'strikes' : 'banned']);
    if (kind === 'banned' && banned.length) {
      found = [...found, rng.pick(banned)];
      v.push({ rule: 'drug_program', a: 'doc.substances', b: 'rule.banned', text: 'A banned substance was detected with no TUE.' });
    } else if (kind === 'pg') {
      pg = rng.int(limit + 5, limit * 4);
      v.push({ rule: 'drug_program', a: 'doc.pg', b: 'rule.picogram', text: 'Metabolite level is above the picogram threshold.' });
    } else {
      strikes = maxStrikes + rng.int(0, 1);
      v.push({ rule: 'whereabouts', a: 'doc.strikes', b: 'rule.strikes', text: 'Too many whereabouts failures.' });
    }
  } else if (rng.chance(0.15) && banned.length) {
    // legit TUE: banned substance with an exemption attached (valid!)
    found = [...found, rng.pick(banned)];
    tue = 'TUE-' + rng.int(1000, 9999) + ' (APPROVED)';
  }
  d.fields = [
    f('doc.name', 'Athlete', fullName(ft)),
    f('doc.sample', 'Sample ID', 'S' + rng.int(100000, 999999), 'barcode'),
    f('doc.substances', 'Detected', found.join(', ') || 'Nothing of note'),
    f('doc.pg', 'Metabolite', `${pg} pg/mL`),
    f('doc.tue', 'Exemption', tue),
    f('doc.strikes', 'Whereabouts', `${strikes} strike(s)`),
  ];
  d.violations = v;
  d.meta = { severity: pg > limit * 2 ? 2 : 1 };
  d.fine = 'SAMPLE COLLECTED AT 6:02 AM. ATHLETE DESCRIBED COLLECTION AGENT AS "A VAMPIRE" AND "MY ARCH NEMESIS".';
  return finalize(s, d);
};

const genVisa: Gen = (s, rng, ft, bad) => {
  if (!ruleActive(s, 'visa_rules')) return null;
  const d = base(s, 'visa', 'WORK VISA APPLICATION', ft);
  const countries = content().docs.countries;
  const dest = rng.pick(countries);
  const next = nextBoutFor(s, ft.id);
  const evWeek = next?.ev.week ?? s.week + 4;
  let passportExp = evWeek + rng.int(20, 300);
  let visaType = 'Athlete Work Visa (P-1)';
  let arrests = ft.legalRecord.length ? ft.legalRecord.join('; ') : 'None';
  const v: Violation[] = [];
  if (bad) {
    const opts = ['passport', 'tourist'];
    if (ft.legalRecord.length && dest.blocksArrests) opts.push('arrest');
    if (ft.legalRecord.length) opts.push('hidden');
    const kind = rng.pick(opts);
    if (kind === 'passport') {
      passportExp = evWeek - rng.int(1, 8);
      v.push({ rule: 'visa_rules', a: 'doc.passport', b: 'cal.event', text: 'Passport expires before the event.' });
    } else if (kind === 'tourist') {
      visaType = 'Tourist Visa (B-2)';
      v.push({ rule: 'visa_rules', a: 'doc.visa', b: 'rule.visa', text: 'A tourist visa does not allow paid work.' });
    } else if (kind === 'arrest') {
      v.push({ rule: 'visa_rules', a: 'doc.country', b: 'file.arrests', text: `${dest.name} denies entry to applicants with that record.` });
    } else {
      arrests = 'None';
      v.push({ rule: 'visa_rules', a: 'doc.arrests', b: 'file.arrests', text: 'The application hides a prior arrest.' });
    }
  } else if (ft.legalRecord.length && dest.blocksArrests) {
    // would be invalid; choose a lenient destination instead
    const lax = countries.filter((c) => !c.blocksArrests);
    if (lax.length) Object.assign(dest, rng.pick(lax));
  }
  d.fields = [
    f('doc.name', 'Applicant', fullName(ft)),
    f('doc.nationality', 'Nationality', ft.country),
    f('doc.country', 'Destination', dest.name),
    f('doc.visa', 'Visa type', visaType),
    f('doc.passport', 'Passport expires', fmtDate(passportExp)),
    f('doc.arrests', 'Prior arrests', arrests),
  ];
  d.refs['cal.event'] = fmtDate(evWeek);
  d.refs['rule.visa'] = 'Paid fighters need an Athlete Work Visa';
  d.violations = v;
  return finalize(s, d);
};

const genSponsor: Gen = (s, rng, ft, bad) => {
  const d = base(s, 'sponsor', 'SPONSOR PATCH AGREEMENT', ft);
  const bannedCats = param<string[]>(s, 'bannedSponsorCategories', []);
  const pool = content().sponsors;
  const existing = s.sponsorDeals.filter((x) => x.fighter === ft.id).map((x) => pool.find((p) => p.id === x.sponsor)?.category);
  let sp = rng.pick(pool.filter((p) => !bannedCats.includes(p.category) && !existing.includes(p.category)).length ? pool.filter((p) => !bannedCats.includes(p.category) && !existing.includes(p.category)) : pool);
  const v: Violation[] = [];
  if (bad) {
    const bannedPool = pool.filter((p) => bannedCats.includes(p.category));
    if (bannedPool.length && rng.chance(0.6)) {
      sp = rng.pick(bannedPool);
      v.push({ rule: bannedCats.includes('crypto') && sp.category === 'crypto' ? 'crypto_ban' : 'betting_ban', a: 'doc.category', b: 'rule.bannedCats', text: `${sp.category} sponsors are banned.` });
    } else if (existing.length) {
      const cat = existing[0];
      const dup = pool.filter((p) => p.category === cat);
      if (dup.length) sp = rng.pick(dup);
      v.push({ rule: 'sponsor_conflicts', a: 'doc.category', b: 'file.sponsor', text: 'The fighter already has an exclusive sponsor in that category.' });
    } else {
      // create a conflict on file for next time; this doc is valid
    }
  }
  const amount = Math.round(sp.weekly * scale(s) * rng.float(2, 6));
  d.fields = [
    f('doc.name', 'Athlete', fullName(ft)),
    f('doc.sponsor', 'Sponsor', sp.name),
    f('doc.category', 'Category', sp.category),
    f('doc.amount', 'Fee to promotion', money(amount, false)),
    f('doc.blurb', 'Tagline', sp.blurb),
  ];
  d.violations = v;
  d.meta = { sponsor: sp.id, amount };
  return finalize(s, d);
};

const genExpense: Gen = (s, rng, ft, bad) => {
  const d = base(s, 'expense', 'CAMP EXPENSE REPORT', ft);
  const cap = param(s, 'expenseCap', 3000);
  const items = content().docs.expenseItems;
  const normal = items.filter((x) => !x.absurd);
  const absurd = items.filter((x) => x.absurd);
  const lines = rng.sample(normal, rng.int(3, 5)).map((x) => ({ item: x.item, amt: Math.min(cap, rng.int(x.low, x.high)) }));
  const v: Violation[] = [];
  let total = lines.reduce((t, l) => t + l.amt, 0);
  const shady = ft.moneyIQ < 35 || content().managers.find((m) => m.id === ft.manager)?.shady! > 60;
  if (bad || (shady && rng.chance(0.25))) {
    const kind = rng.pick(['absurd', 'cap', 'total']);
    if (kind === 'absurd' && absurd.length) {
      const a = rng.pick(absurd);
      lines.push({ item: a.item, amt: rng.int(a.low, a.high) });
      total = lines.reduce((t, l) => t + l.amt, 0);
      v.push({ rule: 'expense_policy', a: 'doc.items', b: 'rule.cap', text: `"${a.item}" is not a camp expense (${a.absurd}).` });
    } else if (kind === 'cap') {
      lines[0].amt = cap + rng.int(300, 2500);
      total = lines.reduce((t, l) => t + l.amt, 0);
      v.push({ rule: 'expense_policy', a: 'doc.items', b: 'rule.cap', text: 'A line item is over the per-item cap.' });
    } else {
      total = total + rng.int(5, 40) * 100;
      v.push({ rule: 'expense_policy', a: 'doc.total', b: 'doc.items', text: 'The total does not add up. Somebody padded it.' });
    }
  }
  d.fields = [
    f('doc.name', 'Fighter', fullName(ft)),
    f('doc.items', 'Items', lines.map((l) => `${l.item}  ${money(l.amt, false)}`).join('\n')),
    f('doc.total', 'TOTAL CLAIMED', money(total, false)),
    f('doc.manager', 'Submitted by', content().managers.find((m) => m.id === ft.manager)?.name ?? 'Fighter'),
  ];
  d.violations = v;
  d.meta = { total, honest: lines.reduce((t, l) => t + Math.min(l.amt, cap), 0) };
  return finalize(s, d);
};

const genPress: Gen = (s, rng, _ft, bad) => {
  if (!ruleActive(s, 'press_creds')) return null;
  const reps = content().reporters;
  if (!reps.length) return null;
  const rep = rng.pick(reps);
  const d = base(s, 'press', 'PRESS CREDENTIAL REQUEST', null);
  const outlets = content().outlets;
  let outletName = outlets.find((o) => o.id === rep.outlet)?.name ?? 'Freelance';
  let name = rep.name;
  let photo = rep.id;
  const visitor = rep.id;
  const v: Violation[] = [];
  const banned = s.media.reporters[rep.id]?.banned;
  if (banned) {
    if (rng.chance(0.5)) {
      name = misspell(rep.name, rng) + ' (definitely different guy)';
      photo = rep.id;
      v.push({ rule: 'press_creds', a: 'doc.photo', b: 'file.photo', text: `That's ${rep.name}. Banned. Wearing a fake moustache.` });
    } else v.push({ rule: 'press_creds', a: 'doc.name', b: 'rule.bannedReporters', text: `${rep.name} is on the banned list.` });
  } else if (bad) {
    if (rng.chance(0.5)) {
      outletName = rng.pick(['MMA Truth Bombs Dot Biz', 'Real Fight Newz (Real)', 'Big Dave\'s Fight Blog', 'The Daily Grapple (Unaffiliated)']);
      v.push({ rule: 'press_creds', a: 'doc.outlet', b: 'rule.outlets', text: 'That outlet is not recognised.' });
    } else {
      const other = rng.pick(reps.filter((r) => r.id !== rep.id));
      photo = other.id;
      v.push({ rule: 'press_creds', a: 'doc.photo', b: 'file.photo', text: 'The credential photo is someone else.' });
    }
  }
  d.fields = [
    f('doc.name', 'Name', name),
    f('doc.outlet', 'Outlet', outletName),
    f('doc.cred', 'Credential #', 'PR-' + rng.int(10000, 99999)),
    f('doc.photo', 'Photo', 'face:' + photo, 'photo'),
  ];
  d.refs['file.photo'] = 'face:' + visitor;
  d.refs['file.name'] = rep.name;
  d.violations = v;
  d.meta = { reporter: rep.id };
  return finalize(s, d);
};

const genPolice: Gen = (s, rng, ft, _bad) => {
  const c = s.legal.cases.find((x) => x.who === ft.id && x.status === 'bail');
  if (!c || !ruleActive(s, 'court_dates')) return null;
  const d = base(s, 'police', 'COURT NOTICE (CARBON COPY)', ft);
  const charge = content().charges.find((x) => x.id === c.charge);
  const next = nextBoutFor(s, ft.id);
  const v: Violation[] = [];
  if (next && Math.abs(next.ev.week - c.courtWeek) <= 0) v.push({ rule: 'court_dates', a: 'doc.court', b: 'file.fight', text: 'Court date clashes with the booked fight.' });
  if (next && c.noTravel && next.ev.region !== 'mojave') v.push({ rule: 'court_dates', a: 'doc.travel', b: 'file.fight', text: 'No-travel order: fighter cannot leave the jurisdiction for that card.' });
  d.fields = [
    f('doc.name', 'Defendant', fullName(ft)),
    f('doc.charge', 'Charge', charge?.name ?? c.charge),
    f('doc.bail', 'Bail posted', money(c.bail, false)),
    f('doc.court', 'Court date', fmtDate(c.courtWeek)),
    f('doc.travel', 'Travel', c.noTravel ? 'NO-TRAVEL ORDER' : 'Permitted'),
    f('doc.monitor', 'Ankle monitor', c.monitor ? 'YES' : 'No'),
  ];
  d.violations = v;
  d.meta = { caseId: c.id };
  d.fine = 'APPROVE = KEEP FIGHTER ON THE CARD. DENY = PULL FIGHTER FROM THE CARD.';
  return finalize(s, d);
};

const GENERATORS: Partial<Record<DocType, Gen>> = {
  bout: genBout, medical: genMedical, drug: genDrug, visa: genVisa, sponsor: genSponsor, expense: genExpense, press: genPress, police: genPolice,
};

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
  const wa = Math.round(weigh(A) * 10) / 10;
  const wb = Math.round(weigh(B) * 10) / 10;
  const v: Violation[] = [];
  let missedBy: string | null = null;
  if (wa > limit + tol) {
    v.push({ rule: 'weigh_tolerance', a: 'doc.weightA', b: 'rule.tolerance', text: `${A.last} missed weight by ${(wa - limit).toFixed(1)} lbs.` });
    missedBy = A.id;
  } else if (wb > limit + tol) {
    v.push({ rule: 'weigh_tolerance', a: 'doc.weightB', b: 'rule.tolerance', text: `${B.last} missed weight by ${(wb - limit).toFixed(1)} lbs.` });
    missedBy = B.id;
  }
  d.fields = [
    f('doc.bout', 'Bout', `${fullName(A)} vs ${fullName(B)}`),
    f('doc.class', 'Division', `${divisionName(b.division)} (${limit} lbs)${b.title ? ' - TITLE' : ''}`),
    f('doc.weightA', A.last, `${wa.toFixed(1)} lbs`),
    f('doc.weightB', B.last, `${wb.toFixed(1)} lbs`),
    f('doc.event', 'Event', ev.name),
  ];
  d.refs['file.limit'] = `${limit} lbs`;
  d.violations = v;
  d.meta = { eventId: ev.id, boutId: b.id, missedBy, weightA: wa, weightB: wb, limit };
  d.fine = 'APPROVE = FIGHT AS IS  /  DENY = CANCEL BOUT  /  ESCALATE = CATCHWEIGHT + 25% PURSE FINE  /  BURY = "THE SCALE WAS BROKEN"';
  return finalize(s, d);
}

export function memoDoc(s: GameState, title: string, body: string): DeskDoc {
  const d = base(s, 'memo', title, null);
  d.fields = [f('doc.from', 'From', s.owner.name), f('doc.body', 'Memo', body)];
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

/** Generate this week's routine paperwork. */
export function generateWeekDocs(s: GameState, rng: Rng): DeskDoc[] {
  const out: DeskDoc[] = [];
  const roster = Object.values(s.fighters).filter(isOurs);
  if (!roster.length) return out;
  const count = Math.min(9, 2 + s.act + rng.int(0, 2) + (s.difficulty === 'fightweek' ? 1 : 0));
  const badRate = { easy: 0.25, normal: 0.33, fightweek: 0.42, ironman: 0.38 }[s.difficulty] + s.act * 0.02;
  const types: DocType[] = ['bout', 'bout', 'medical', 'medical', 'expense', 'sponsor'];
  if (ruleActive(s, 'drug_program')) types.push('drug', 'drug');
  if (ruleActive(s, 'visa_rules')) types.push('visa');
  if (ruleActive(s, 'press_creds')) types.push('press');
  // booked fighters generate bout/medical paperwork first
  const booked = roster.filter((x) => isBooked(s, x.id));
  for (let i = 0; i < count; i++) {
    const type = rng.pick(types);
    const ft = (type === 'bout' || type === 'medical' || type === 'visa') && booked.length ? rng.pick(booked) : rng.pick(roster);
    if (out.some((d) => d.subject === ft.id && d.type === type)) continue;
    const g = GENERATORS[type];
    const doc = g?.(s, rng, ft, rng.chance(type === 'drug' ? badRate * 0.3 : badRate));
    if (doc) out.push(doc);
  }
  // court notices for fighters on bail with fights booked
  for (const c of s.legal.cases.filter((x) => x.status === 'bail' && x.who !== 'president')) {
    const ft = s.fighters[c.who];
    if (ft && isBooked(s, ft.id) && !out.some((d) => d.type === 'police' && d.subject === ft.id)) {
      const doc = genPolice(s, rng, ft, false);
      if (doc) out.push(doc);
    }
  }
  return out;
}

export function makeDoc(s: GameState, type: DocType, ft: Fighter, bad: boolean, rng: Rng): DeskDoc | null {
  return GENERATORS[type]?.(s, rng, ft, bad) ?? null;
}

/** Is this pair of field keys a real discrepancy on the doc? */
export function checkPair(d: DeskDoc, a: string, b: string): Violation | null {
  return d.violations.find((v) => (v.a === a && v.b === b) || (v.a === b && v.b === a)) ?? null;
}

export function fieldValue(d: DeskDoc, key: string): string {
  return d.fields.find((x) => x.key === key)?.value ?? d.refs[key] ?? '';
}
