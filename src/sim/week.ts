/**
 * The weekly loop. Pure-ish functions over GameState shared by the UI and the
 * headless simulator:
 *
 *   startWeek(s)            -> morning paper, desk queue, storylets, negotiations
 *   stampDoc(s, id, stamp)  -> desk decisions (player or bot)
 *   resolveStorylet(...)    -> storylet choices (see storylets/engine)
 *   [fight night]           -> events.ts runBout/applyBout/finalizeEvent
 *   endWeek(s)              -> money, upkeep, world, acts, endings, week++
 *
 *   simulateWeek(s, policy) runs all of the above with a bot policy.
 */
import type { GameState, DeskDoc, Stamp, FightEvent, Fighter } from '../core/types';
import { Rng, withRng } from '../core/rng';
import { clamp } from '../core/format';
import { content } from '../core/content';
import { generateWeekDocs, weighInDoc, checkPair, memoDoc } from './docs';
import { buildPaper, addNews } from './news';
import { selectWeek, expirePending, resolveStorylet, def as storyDef, availableChoices, trigger } from '../storylets/engine';
import { weeklyContracts, makeOffer } from './contracts';
import { weeklyLegal, decideBail } from './legal';
import { weeklyRivals, weeklyMarket, weeklyOwner, checkActProgress, checkEndings, hallOfFame } from './world';
import {
  scheduleEvents, eventThisWeek, autoFixCard, runEventHeadless, cardProblems, renumber, autoCard,
} from './events';
import { weeklyExpenses, closeLedger, driftMeters, adjustMeter, adjustHidden, spend, earn, scale } from './econ';
import { upkeepWeek, ageFighter, retirementChance, retire, isChamp, fullName, addCareerLog, overall } from './fighters';
import { computeRankings, auditBelts, beltsOf, vacateBelt } from './rankings';
import { spawnProspects } from './newgame';
import { DAY_MINUTES } from '../core/time';

// ---------------------------------------------------------------- start

export function startWeek(s: GameState): void {
  withRng(s, (rng) => {
    s.desk.minutes = 0;
    s.media.paper = buildPaper(s, rng);
    // roll over unprocessed paperwork
    for (const d of s.desk.queue) {
      if (d.type === 'memo' || d.type === 'letter') continue;
      d.overdue++;
    }
    const stale = s.desk.queue.filter((d) => d.overdue >= 2 && d.type !== 'bail');
    for (const d of stale) expireDoc(s, d, rng);
    s.desk.queue = s.desk.queue.filter((d) => !stale.includes(d));
    s.desk.queue.push(...generateWeekDocs(s, rng));
    // fight week: weigh-in sheets for the main card
    const ev = eventThisWeek(s);
    if (ev) {
      autoFixCard(s, ev);
      ev.card
        .filter((b) => b.status === 'scheduled')
        .sort((a, b) => a.position - b.position)
        .slice(0, 5)
        .forEach((b) => s.desk.queue.push(weighInDoc(s, ev, b, rng)));
    }
    weeklyContracts(s, rng);
    selectWeek(s, rng);
    if (s.flags.actIntro) {
      trigger(s, 'act' + s.flags.actIntro + '_intro', rng);
      delete s.flags.actIntro;
    }
  });
  s.phase = 'paper';
}

// ---------------------------------------------------------------- desk

export interface StampResult {
  correct: boolean;
  deliberate: boolean;
  citation: string | null;
  text: string;
}

export const DOC_MINUTES = 12;
export const COMPARE_MINUTES = 4;

export function spendMinutes(s: GameState, m: number): void {
  s.desk.minutes = Math.min(DAY_MINUTES + 120, s.desk.minutes + m);
}

/** Compare two fields while inspecting. Records a found discrepancy on the doc. */
export function compareFields(s: GameState, docId: string, a: string, b: string): { found: boolean; text: string } {
  const d = s.desk.queue.find((x) => x.id === docId);
  if (!d) return { found: false, text: '' };
  spendMinutes(s, COMPARE_MINUTES);
  const v = checkPair(d, a, b);
  if (!v) return { found: false, text: 'No discrepancy.' };
  const flagged = String(d.meta.flagged ?? '');
  if (!flagged.split('|').includes(v.rule + ':' + v.a)) d.meta.flagged = (flagged ? flagged + '|' : '') + v.rule + ':' + v.a;
  return { found: true, text: v.text };
}

function citationFine(s: GameState): number {
  const mult = { easy: 0.5, normal: 1, fightweek: 1.6, ironman: 1.2 }[s.difficulty];
  return Math.round(2500 * Math.max(1, scale(s) * 0.7) * mult);
}

function cite(s: GameState, reason: string): string {
  const thisWeek = s.desk.citations.filter((c) => c.week === s.week);
  const warning = thisWeek.length === 0 && s.difficulty !== 'fightweek';
  const fine = warning ? 0 : citationFine(s);
  s.desk.citations.push({ week: s.week, reason, fine, warning });
  if (fine) spend(s, 'citations', fine);
  adjustHidden(s, 'patience', warning ? -0.5 : -1.5);
  s.stats.citations = (s.stats.citations ?? 0) + 1;
  return reason;
}

/** Stamp a document. Applies its consequences and returns the verdict. */
export function stampDoc(s: GameState, docId: string, stamp: Stamp, rngIn?: Rng): StampResult {
  const d = s.desk.queue.find((x) => x.id === docId);
  if (!d) return { correct: true, deliberate: false, citation: null, text: '' };
  const rng = rngIn ?? new Rng(s.rng);
  spendMinutes(s, stamp === 'escalate' ? 20 : 5);
  const invalid = d.violations.length > 0;
  const flagged = !!d.meta.flagged;
  let correct = true;
  let deliberate = false;
  let citation: string | null = null;
  let text = '';
  const subj = d.subject ? s.fighters[d.subject] : null;

  if (d.type === 'memo' || d.type === 'letter') {
    text = 'Filed.';
  } else if (d.type === 'bail') {
    // bail tickets are resolved in the Bail Office; stamping defaults to cheapest option
    const caseId = String(d.meta.caseId);
    text = decideBail(s, caseId, { pay: stamp === 'approve' ? 'promotion' : 'none', lawyer: 'public' });
  } else if (d.type === 'weighin') {
    text = resolveWeighIn(s, d, stamp, rng);
    correct = !invalid ? stamp === 'approve' || stamp === 'escalate' : stamp !== 'approve' || flagged;
    deliberate = invalid && (stamp === 'bury' || (stamp === 'approve' && flagged));
    if (invalid && stamp === 'approve' && !flagged) citation = cite(s, 'Approved a fighter who missed weight');
    if (!invalid && stamp === 'deny') citation = cite(s, 'Cancelled a bout that made weight');
  } else {
    switch (stamp) {
      case 'approve':
        if (invalid) {
          correct = false;
          if (flagged) {
            deliberate = true;
            text = 'You knowingly approved it. Nobody will ever find out. (Somebody will find out.)';
          } else {
            citation = cite(s, `Approved an invalid ${docName(d.type)}: ${d.violations[0].text}`);
            text = 'Approved.';
          }
          applyInvalidApproval(s, d, rng);
        } else {
          text = 'Approved.';
          applyApproval(s, d);
        }
        break;
      case 'deny':
        if (!invalid) {
          correct = false;
          citation = cite(s, `Wrongly denied a valid ${docName(d.type)}`);
          if (subj) {
            subj.morale = clamp(subj.morale - 6, 0, 100);
            subj.beefWithYou = clamp(subj.beefWithYou + 4, 0, 100);
          }
          text = 'Denied. That one was actually fine.';
        } else text = flagged ? 'Denied, with cause.' : 'Denied.';
        applyDenial(s, d, invalid, rng);
        break;
      case 'escalate': {
        const fee = Math.round(1500 * Math.max(1, scale(s) * 0.5));
        spend(s, 'legal review', fee);
        text = invalid ? 'Legal confirms the problem and kills it. Lawyers bill you anyway.' : 'Legal reviews it, finds nothing, bills you anyway.';
        if (invalid) applyDenial(s, d, true, rng);
        else applyApproval(s, d);
        s.stats.escalations = (s.stats.escalations ?? 0) + 1;
        if ((s.stats.escalations ?? 0) % 6 === 0) adjustHidden(s, 'patience', -1);
        break;
      }
      case 'bury':
        deliberate = true;
        correct = !invalid ? false : true;
        text = invalid ? 'It goes in the shredder drawer. Problem solved. For now.' : 'You buried a perfectly good document. Bold.';
        s.flags.buried = (Number(s.flags.buried) || 0) + 1;
        adjustHidden(s, 'chaos', 1.5);
        if (invalid) {
          adjustHidden(s, 'heat', 2);
          applyInvalidApproval(s, d, rng);
          s.storylets.scheduled.push({ id: 'buried_doc_surfaces', week: s.week + rng.int(8, 30), roles: d.subject ? { subject: d.subject } : {}, vars: { doc: docName(d.type) } });
        } else if (subj) subj.morale = clamp(subj.morale - 4, 0, 100);
        break;
    }
  }
  if (deliberate) s.stats.ruleBreaks = (s.stats.ruleBreaks ?? 0) + 1;
  s.desk.log.push({ week: s.week, docId: d.id, type: d.type, stamp, correct, deliberate });
  if (s.desk.log.length > 200) s.desk.log.splice(0, s.desk.log.length - 200);
  s.desk.queue = s.desk.queue.filter((x) => x !== d);
  s.stats.docs = (s.stats.docs ?? 0) + 1;
  if (correct) s.stats.docsCorrect = (s.stats.docsCorrect ?? 0) + 1;
  if (rngIn === undefined) s.rng = rng.state;
  return { correct, deliberate, citation, text };
}

function docName(t: string): string {
  return ({ bout: 'bout agreement', medical: 'medical', drug: 'drug test', visa: 'visa', weighin: 'weigh-in', sponsor: 'sponsor deal', police: 'court notice', expense: 'expense report', press: 'press credential' } as Record<string, string>)[t] ?? t;
}

function applyApproval(s: GameState, d: DeskDoc): void {
  const subj = d.subject ? s.fighters[d.subject] : null;
  switch (d.type) {
    case 'sponsor': {
      const sp = String(d.meta.sponsor);
      earn(s, 'sponsors', Number(d.meta.amount) || 0);
      if (subj) s.sponsorDeals.push({ sponsor: sp, weekly: 0, until: s.week + 26, fighter: subj.id });
      adjustMeter(s, 'sponsors', 0.6);
      break;
    }
    case 'expense':
      spend(s, 'camp expenses', Number(d.meta.total) || 0);
      if (subj) subj.morale = clamp(subj.morale + 2, 0, 100);
      break;
    case 'press':
      adjustMeter(s, 'media', 0.4);
      break;
    case 'bout':
      if (subj) subj.morale = clamp(subj.morale + 1, 0, 100);
      break;
  }
}

function applyInvalidApproval(s: GameState, d: DeskDoc, rng: Rng): void {
  const subj = d.subject ? s.fighters[d.subject] : null;
  switch (d.type) {
    case 'bout':
      if (d.violations.some((v) => v.b === 'file.purse') && subj?.contract) {
        const inflated = Number(d.meta.purse) || subj.contract.purse;
        spend(s, 'purse overpayment', Math.max(0, inflated - subj.contract.purse));
      }
      if (d.violations.some((v) => v.rule === 'manager_license')) adjustMeter(s, 'commission', -2);
      break;
    case 'medical':
      adjustMeter(s, 'commission', -1.5);
      if (subj) s.flags['unsafe_' + subj.id] = s.week;
      adjustHidden(s, 'heat', 1);
      break;
    case 'drug':
      adjustHidden(s, 'heat', 3);
      adjustHidden(s, 'chaos', 2);
      s.flags.covered_tests = (Number(s.flags.covered_tests) || 0) + 1;
      if (subj && rng.chance(0.3)) s.storylets.scheduled.push({ id: 'doping_whistleblower', week: s.week + rng.int(4, 20), roles: { subject: subj.id }, vars: {} });
      break;
    case 'expense':
      spend(s, 'camp expenses', Number(d.meta.total) || 0);
      break;
    case 'sponsor':
      earn(s, 'sponsors', Number(d.meta.amount) || 0);
      adjustMeter(s, 'commission', -1);
      if (rng.chance(0.4)) spend(s, 'commission fines', Math.round(5000 * scale(s)));
      break;
    case 'press':
      adjustMeter(s, 'media', -1);
      s.flags.press_infiltrated = 1;
      break;
    case 'visa':
      if (subj && rng.chance(0.5)) {
        subj.injuries.push({ name: 'stuck at customs', until: s.week + 2 });
        addNews(s, { tags: ['customs'], vars: { fighter: fullName(subj) }, text: `${subj.last.toUpperCase()} DETAINED AT CUSTOMS FOR 14 HOURS; ASKED TO 'EXPLAIN THE KNIVES'`, weight: 4, tone: -0.3 });
      }
      break;
    case 'police':
      if (subj) {
        s.flags['missed_court_' + subj.id] = 1;
        adjustMeter(s, 'commission', -2);
        adjustHidden(s, 'heat', 2);
      }
      break;
  }
}

function applyDenial(s: GameState, d: DeskDoc, invalid: boolean, rng: Rng): void {
  const subj = d.subject ? s.fighters[d.subject] : null;
  switch (d.type) {
    case 'bout':
    case 'medical':
    case 'police':
    case 'visa':
      if (subj) pullFromCard(s, subj.id, d.type === 'medical' ? 'failed medical paperwork' : d.type === 'police' ? 'court conflict' : 'paperwork');
      if (subj && d.type === 'medical' && invalid) subj.medSuspUntil = Math.max(subj.medSuspUntil, s.week + 2);
      break;
    case 'drug':
      if (subj && invalid) {
        const weeks = 26 * (Number(d.meta.severity) || 1) + rng.int(0, 26);
        subj.legal = 'suspended';
        subj.legalUntil = s.week + weeks;
        pullFromCard(s, subj.id, 'failed drug test');
        for (const b of beltsOf(s, subj.id)) vacateBelt(s, b, 'failed drug test');
        addCareerLog(subj, `Suspended ${weeks} weeks for a failed drug test.`);
        addNews(s, { tags: ['doping', 'scandal'], vars: { fighter: fullName(subj), last: subj.last, weeks }, weight: 7, tone: -0.4 });
        adjustMeter(s, 'commission', 2);
        adjustMeter(s, 'media', 1);
        s.stats.dopingBusts = (s.stats.dopingBusts ?? 0) + 1;
      }
      break;
    case 'press':
      if (!invalid) adjustMeter(s, 'media', -1.5);
      break;
  }
}

export function pullFromCard(s: GameState, fighterId: string, reason: string): void {
  for (const ev of s.events) {
    if (ev.status !== 'scheduled') continue;
    for (const b of ev.card) {
      if (b.status === 'scheduled' && (b.a === fighterId || b.b === fighterId)) {
        b.status = 'cancelled';
        ev.notes.push(`${s.fighters[fighterId]?.last ?? '?'} pulled (${reason}).`);
      }
    }
    renumber(ev);
  }
}

function resolveWeighIn(s: GameState, d: DeskDoc, stamp: Stamp, rng: Rng): string {
  const ev = s.events.find((e) => e.id === d.meta.eventId);
  const b = ev?.card.find((x) => x.id === d.meta.boutId);
  if (!ev || !b || b.status !== 'scheduled') return 'That bout is no longer on the card.';
  const missedBy = d.meta.missedBy ? String(d.meta.missedBy) : null;
  const offender = missedBy ? s.fighters[missedBy] : null;
  if (offender) {
    offender.weightMisses++;
    if (!offender.traits.includes('Weight Misser') && offender.weightMisses >= 3) offender.traits.push('Weight Misser');
  }
  switch (stamp) {
    case 'approve':
      if (missedBy) {
        adjustMeter(s, 'commission', -3);
        s.stats.weightWaivers = (s.stats.weightWaivers ?? 0) + 1;
        return 'The fight goes on as scheduled. The commission inspector writes something angry in a notebook.';
      }
      return 'Both fighters on weight. Faceoff time.';
    case 'deny':
      b.status = 'cancelled';
      renumber(ev);
      if (missedBy && offender) {
        addNews(s, { tags: ['weight_miss'], vars: { fighter: fullName(offender), last: offender.last, event: ev.name }, weight: 4, tone: -0.2 });
        return `Bout cancelled. ${offender.last} is "devastated" (eating a burrito).`;
      }
      adjustMeter(s, 'fighters', -1);
      return 'You cancelled a bout where both fighters made weight. The locker room is confused.';
    case 'escalate':
      if (missedBy) {
        b.catchweight = true;
        b.missedBy = missedBy;
        b.finePct = 25;
        if (b.title && offender && isChamp(s, offender.id)) {
          for (const bl of beltsOf(s, offender.id)) vacateBelt(s, bl, 'missed weight');
        }
        if (b.title) b.title = null;
        return `Catchweight bout. ${offender?.last ?? 'The offender'} forfeits 25% of the purse${b.title === null ? ' and the title is off the line' : ''}.`;
      }
      return 'Legal confirms both made weight. Billable hours: plenty.';
    case 'bury':
      if (missedBy) {
        adjustHidden(s, 'heat', 2);
        adjustHidden(s, 'chaos', 2);
        if (rng.chance(0.35)) s.storylets.scheduled.push({ id: 'scale_scandal', week: s.week + rng.int(1, 6), roles: { subject: missedBy }, vars: {} });
        return '"The scale was broken." The official weight is now magically on the limit.';
      }
      return 'You buried a clean weigh-in sheet. The commission will want that.';
  }
  return '';
}

function expireDoc(s: GameState, d: DeskDoc, rng: Rng): void {
  s.desk.log.push({ week: s.week, docId: d.id, type: d.type, stamp: 'expired', correct: false, deliberate: false });
  const subj = d.subject ? s.fighters[d.subject] : null;
  switch (d.type) {
    case 'bout':
    case 'medical':
    case 'visa':
      if (subj) pullFromCard(s, subj.id, 'paperwork never processed');
      break;
    case 'sponsor':
      adjustMeter(s, 'sponsors', -1.5);
      break;
    case 'expense':
      if (subj) subj.morale = clamp(subj.morale - 5, 0, 100);
      break;
    case 'drug':
      adjustMeter(s, 'commission', -2);
      break;
    default:
      break;
  }
  cite(s, `Let a ${docName(d.type)} rot in the inbox`);
  void rng;
}

// ---------------------------------------------------------------- end

export interface WeekReport {
  notes: string[];
  act: number | null;
  ending: string | null;
}

export function endWeek(s: GameState): WeekReport {
  const notes: string[] = [];
  let newAct: number | null = null;
  withRng(s, (rng) => {
    // unattended storylets resolve with their default choice
    expirePending(s, rng);
    // unattended bail tickets & expired weigh-ins
    for (const d of s.desk.queue.filter((x) => x.type === 'weighin')) stampDoc(s, d.id, 'approve', rng);
    // event this week not yet run (skip / headless)
    const ev = eventThisWeek(s);
    if (ev && ev.status === 'scheduled') runEventHeadless(s, ev, rng);
    const lastEv = s.events.find((e) => e.week === s.week && e.status === 'done');
    weeklyMarket(s, rng, lastEv?.fin ? lastEv.fin.ppvBuys || Math.round((lastEv.fin.attendance * 6 + (s.promotion.tv ? (s.promotion.tv.tier + 1) * 15000 : 0)) / 10) : null);
    weeklyExpenses(s);
    // side venture income
    if (s.promotion.sideVenture) earn(s, 'side venture', Math.round((s.promotion.sideVenture === 'energy' ? 9000 : s.promotion.sideVenture === 'reality' ? 14000 : 6000) * scale(s) * (0.5 + rng.next())));
    // fighters
    for (const f of Object.values(s.fighters)) {
      if (f.status === 'retired' && !f.legend) continue;
      notes.push(...upkeepWeek(s, f, rng));
      if (f.promotion === 'us' && f.morale < 20 && f.loyalty < 25 && rng.chance(0.02)) {
        s.storylets.scheduled.push({ id: 'holdout_threat', week: s.week + 1, roles: { subject: f.id }, vars: {} });
      }
    }
    notes.push(...weeklyLegal(s, rng));
    weeklyRivals(s, rng);
    weeklyOwner(s, rng);
    // yearly cycle
    if (s.week > 0 && s.week % 52 === 51) yearlyCycle(s, rng, notes);
    // new prospects each month
    if (s.week % 4 === 0) {
      spawnProspects(s, rng, rng.int(3, 6));
      // old unsigned fighters fade away
      for (const f of Object.values(s.fighters)) if (f.status === 'free-agent' && f.age >= 38 && rng.chance(0.1)) retire(s, f);
      pruneFighters(s);
    }
    notes.push(...auditBelts(s));
    // replenish the schedule
    s.week += 1;
    scheduleEvents(s, rng);
    for (const e of s.events) if (e.status === 'scheduled' && e.week > s.week && cardProblems(s, e).length) autoFixCard(s, e);
    for (const e of s.events) if (e.status === 'scheduled' && e.card.filter((b) => b.status === 'scheduled').length < 4) autoCard(s, e, rng);
    s.week -= 1;
    driftMeters(s);
    computeRankings(s);
    closeLedger(s);
    s.week += 1;
    newAct = checkActProgress(s);
    if (newAct) notes.push(`ACT ${newAct} BEGINS`);
    // trim old events
    if (s.events.length > 60) s.events = s.events.filter((e) => e.status === 'scheduled' || s.week - e.week < 52);
  });
  const ending = checkEndings(s);
  s.phase = ending ? 'ended' : 'paper';
  return { notes, act: newAct, ending };
}

/** Forget fighters nobody will ever care about again (keeps saves small). */
export function pruneFighters(s: GameState): void {
  const content_ = content();
  const authored = new Set(content_.roster.map((f) => f.id));
  const referenced = new Set<string>();
  for (const e of s.events) for (const b of e.card) {
    referenced.add(b.a);
    referenced.add(b.b);
  }
  for (const b of Object.values(s.belts)) for (const h of b.history) referenced.add(h.holder);
  for (const c of s.legal.cases) referenced.add(c.who);
  for (const n of s.negotiations) referenced.add(n.fighter);
  for (const p of s.storylets.pending) Object.values(p.roles).forEach((x) => referenced.add(x));
  for (const p of s.storylets.scheduled) Object.values(p.roles).forEach((x) => referenced.add(x));
  const keep = (f: Fighter) => authored.has(f.id) || referenced.has(f.id) || f.hallOfFame || !!f.marquee;
  // free-agent pool: keep the 160 most interesting unsigned fighters
  const fas = Object.values(s.fighters).filter((f) => f.status === 'free-agent' && !keep(f));
  if (fas.length > 160) {
    fas.sort((a, b) => overall(b.skills) + b.potential / 2 + b.starPower - (overall(a.skills) + a.potential / 2 + a.starPower));
    for (const f of fas.slice(160)) delete s.fighters[f.id];
  }
  for (const f of Object.values(s.fighters)) {
    if (keep(f)) continue;
    if (f.status === 'retired' && s.week - (f.retiredWeek ?? 0) > 52) delete s.fighters[f.id];
  }
}

function yearlyCycle(s: GameState, rng: Rng, notes: string[]): void {
  for (const f of Object.values(s.fighters)) {
    if (f.status === 'retired') {
      f.age++;
      continue;
    }
    ageFighter(f, rng);
    if (f.status === 'prospect' && !f.marquee) continue;
    const p = retirementChance(f, isChamp(s, f.id));
    if (rng.chance(p)) {
      const ours = f.promotion === 'us';
      for (const b of beltsOf(s, f.id)) vacateBelt(s, b, 'retired');
      retire(s, f);
      if (ours) {
        notes.push(`${fullName(f)} retires.`);
        addNews(s, { tags: ['retirement'], vars: { fighter: fullName(f), last: f.last, age: f.age, record: `${f.record.w}-${f.record.l}` }, weight: 3 + f.starPower / 20, tone: 0 });
      }
    }
  }
  notes.push(...hallOfFame(s).map((n) => `${n} enters the Hall of Fame.`));
  s.stats.years = (s.stats.years ?? 0) + 1;
}

// ---------------------------------------------------------------- headless

export interface Policy {
  name: string;
  stamp(s: GameState, d: DeskDoc, rng: Rng): Stamp;
  inspect(s: GameState, d: DeskDoc, rng: Rng): boolean;
  choose(s: GameState, iid: string, options: number[], rng: Rng): number;
  negotiate(s: GameState, negId: string, rng: Rng): void;
  weekly(s: GameState, rng: Rng): void;
  bonuses?(s: GameState, ev: FightEvent): string[];
}

/** Run a full week with a bot policy. */
export function simulateWeek(s: GameState, policy: Policy): WeekReport {
  startWeek(s);
  s.phase = 'desk';
  withRng(s, (rng) => {
    policy.weekly(s, rng);
    // storylets (may spawn more; loop until settled)
    for (let guard = 0; guard < 10 && s.storylets.pending.length; guard++) {
      for (const inst of s.storylets.pending.slice()) {
        const opts = availableChoices(s, inst, rng);
        resolveStorylet(s, inst.iid, policy.choose(s, inst.iid, opts, rng), rng);
      }
    }
    // paperwork
    for (const d of s.desk.queue.slice()) {
      if (d.type === 'bail') {
        decideBail(s, String(d.meta.caseId), policy.name === 'chaos' ? { pay: 'none', lawyer: 'public' } : { pay: 'promotion', lawyer: policy.name === 'greedy' ? 'public' : 'mid' });
        s.desk.queue = s.desk.queue.filter((x) => x !== d);
        continue;
      }
      if (policy.inspect(s, d, rng)) for (const v of d.violations) compareFields(s, d.id, v.a, v.b);
      stampDoc(s, d.id, policy.stamp(s, d, rng), rng);
    }
    for (const n of s.negotiations.slice()) policy.negotiate(s, n.id, rng);
    const ev = eventThisWeek(s);
    if (ev) runEventHeadless(s, ev, rng, policy.bonuses ? (e) => policy.bonuses!(s, e) : undefined);
  });
  return endWeek(s);
}

export { makeOffer, storyDef, overall, content, memoDoc };
