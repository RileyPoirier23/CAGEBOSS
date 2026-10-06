/**
 * Desk actions beyond stamping: interrogating the visitor about a flagged
 * discrepancy (excuses, fixes, bribes), second actions (re-weigh, request
 * the missing page) and the end-of-day desk tally.
 */
import type { DeskDoc, GameState } from '../core/types';
import { content } from '../core/content';
import { Rng } from '../core/rng';
import { money } from '../core/format';
import { FORGERIES, canBeShady, fixDoc, reweigh } from './docs';
import { stampDoc, spendMinutes } from './week';
import { personal, adjustHidden, adjustMeter, earn, scale } from './econ';

export interface Reply {
  speaker: string;
  line: string;
  outcome: 'excuse' | 'fix' | 'bribe' | 'silent';
  amount?: number;
}

export const ASK_MINUTES = 8;

function flaggedPairs(d: DeskDoc): string[] {
  return String(d.meta.flagged ?? '').split('|').filter(Boolean);
}

export function isFlagged(d: DeskDoc): boolean {
  return flaggedPairs(d).length > 0;
}

/** Who answers for this document. */
export function speakerFor(s: GameState, d: DeskDoc): string {
  const ft = d.subject ? s.fighters[d.subject] : null;
  const kind = String(d.meta.forgery ?? '');
  if (d.type === 'press') return content().reporters.find((r) => r.id === d.meta.reporter)?.name ?? 'The reporter';
  if (d.type === 'weighin') return s.fighters[String(d.meta.missedBy ?? '')]?.last ?? 'The fighter';
  if (ft && ['purse', 'bonus', 'replicense', 'sum', 'receipt', 'luxury', 'cap'].includes(kind)) {
    const mgr = content().managers.find((m) => m.id === ft.manager);
    if (mgr) return mgr.name;
  }
  return ft ? `${ft.first} ${ft.last}` : 'The visitor';
}

function pool(kind: string, rule: string, which: 'excuse' | 'fix' | 'bribe' | 'clean'): string[] {
  const bank = content().docs.interrogation ?? {};
  return bank[kind]?.[which] ?? bank['rule:' + rule]?.[which] ?? bank.generic?.[which] ?? [];
}

function fill(line: string, vars: Record<string, string>): string {
  return line.replace(/\{(\w+)\}/g, (m, k) => vars[k] ?? m);
}

/** Ask the visitor about the flagged discrepancy. One interview per document. */
export function interrogate(s: GameState, docId: string, rng: Rng): Reply | null {
  const d = s.desk.queue.find((x) => x.id === docId);
  if (!d || !isFlagged(d)) return null;
  const speaker = speakerFor(s, d);
  if (d.meta.asked) return { speaker, line: '"I already told you everything." (They have not.)', outcome: 'silent' };
  d.meta.asked = true;
  spendMinutes(s, ASK_MINUTES);
  const ft = d.subject ? s.fighters[d.subject] : null;
  const shady = d.type === 'press' ? true : canBeShady(ft);
  const kind = String(d.meta.forgery ?? '');
  const forgery = FORGERIES.find((g) => g.kind === kind && g.type === d.type);
  const v = d.violations[0];
  const rule = v?.rule ?? '';
  const mgr = ft ? content().managers.find((m) => m.id === ft.manager) : undefined;
  const vars = { name: ft ? ft.last : speaker, doc: d.title.toLowerCase(), amount: '' };
  // 1) honest mistakes get fixed on the spot (most of the time)
  if (forgery?.fixable && typeof d.meta.fix === 'string' && rng.chance(0.6)) {
    const lines = pool(kind, rule, 'fix');
    fixDoc(s, d);
    d.meta.flagged = '';
    return { speaker, line: fill(lines.length ? rng.pick(lines) : '"My bad. Here, fixed."', vars), outcome: 'fix' };
  }
  // 2) crooks reach for the envelope
  const greed = 0.3 + (mgr ? mgr.shady / 300 : 0) + (ft && ft.moneyIQ < 35 ? 0.1 : 0);
  if (shady && (forgery?.crime || d.type === 'weighin' || d.type === 'drug') && rng.chance(greed)) {
    const amount = Math.round((rng.int(2, 8) * 500 * Math.max(1, scale(s) * 0.6)) / 100) * 100;
    const lines = pool(kind, rule, 'bribe');
    d.meta.bribe = amount;
    vars.amount = money(amount, false);
    return { speaker, line: fill(lines.length ? rng.pick(lines) : '"What if there was an envelope. Hypothetically. With {amount} in it."', vars), outcome: 'bribe', amount };
  }
  // 3) excuses (parody fighters only ever give clean ones)
  const lines = shady ? pool(kind, rule, 'excuse') : pool(kind, rule, 'clean').concat(pool('generic', '', 'clean'));
  return { speaker, line: fill(lines.length ? rng.pick(lines) : '"That\'s... a fair point."', vars), outcome: 'excuse' };
}

/** Take the envelope: the document is approved, your pockets are heavier, the heat rises. */
export function takeBribe(s: GameState, docId: string, rng: Rng): string {
  const d = s.desk.queue.find((x) => x.id === docId);
  if (!d || !d.meta.bribe) return '';
  const amount = Number(d.meta.bribe);
  personal(s, 'envelopes', amount);
  adjustHidden(s, 'heat', 3);
  adjustHidden(s, 'chaos', 1);
  s.stats.bribes = (s.stats.bribes ?? 0) + 1;
  if (rng.chance(0.25)) s.storylets.scheduled.push({ id: 'buried_doc_surfaces', week: s.week + rng.int(6, 24), roles: d.subject ? { subject: d.subject } : {}, vars: { doc: d.title.toLowerCase() } });
  stampDoc(s, docId, 'approve', rng);
  return `${money(amount, false)} goes in your jacket. The document goes through. Nobody saw anything.`;
}

export function refuseBribe(s: GameState, docId: string): string {
  const d = s.desk.queue.find((x) => x.id === docId);
  if (!d) return '';
  delete d.meta.bribe;
  adjustMeter(s, 'commission', 0.4);
  s.stats.bribesRefused = (s.stats.bribesRefused ?? 0) + 1;
  return 'You slide the envelope back. The commission inspector in the hallway nods approvingly.';
}

// ---------------------------------------------------------------- second actions

export interface Secondary {
  id: 'reweigh' | 'request';
  label: string;
  tip: string;
}

export function secondaryAction(d: DeskDoc): Secondary | null {
  if (d.type === 'weighin' && d.meta.missedBy && !d.meta.reweighed) {
    return { id: 'reweigh', label: 'SEND TO RE-WEIGH', tip: 'Sauna, spit cup, two more hours. They might make it. (25 min)' };
  }
  if ((d.type === 'medical' || d.type === 'drug') && !d.meta.requested && d.violations.some((v) => v.a === 'doc.scans' || v.a === 'doc.panel')) {
    return { id: 'request', label: 'REQUEST MISSING PAGE', tip: 'Phone the lab/doctor for the missing page. (20 min)' };
  }
  return null;
}

export function doSecondary(s: GameState, docId: string, rng: Rng): { text: string; fixed: boolean } {
  const d = s.desk.queue.find((x) => x.id === docId);
  if (!d) return { text: '', fixed: false };
  const act = secondaryAction(d);
  if (!act) return { text: 'Nothing to do there.', fixed: false };
  if (act.id === 'reweigh') {
    spendMinutes(s, 25);
    const r = reweigh(s, d, rng);
    if (!r) return { text: 'The scale is unplugged. Again.', fixed: false };
    return r.made
      ? { text: `${r.who} spits into a cup for an hour and hits ${r.weight.toFixed(1)} lbs. ON WEIGHT.`, fixed: true }
      : { text: `${r.who} comes back at ${r.weight.toFixed(1)} lbs, grey and shaking. Still over.`, fixed: false };
  }
  spendMinutes(s, 20);
  d.meta.requested = true;
  if (d.meta.fixable && typeof d.meta.fix === 'string' && rng.chance(0.75)) {
    fixDoc(s, d);
    d.meta.flagged = '';
    return { text: 'The missing page arrives by fax. Signed, dated, legit. The document is complete now.', fixed: true };
  }
  return { text: rng.pick(['They fax over a takeout menu. The page is still missing.', '"The lab is closed for a team-building retreat." Still missing.', 'They send a selfie of the page. Blurry. Still missing.']), fixed: false };
}

// ---------------------------------------------------------------- tally

export interface DeskTally {
  processed: number;
  correct: number;
  caught: number;
  mistakes: number;
  citations: number;
  warnings: number;
  fines: number;
  bounty: number;
  bribes: number;
}

export function deskTally(s: GameState, week = s.week): DeskTally {
  const log = s.desk.log.filter((l) => l.week === week && l.type !== 'memo' && l.type !== 'letter' && l.type !== 'bail');
  const cits = s.desk.citations.filter((c) => c.week === week);
  return {
    processed: log.filter((l) => l.stamp !== 'expired').length,
    correct: log.filter((l) => l.correct).length,
    caught: log.filter((l) => l.caught).length,
    mistakes: log.filter((l) => !l.correct && !l.deliberate).length,
    citations: cits.length,
    warnings: cits.filter((c) => c.warning).length,
    fines: cits.reduce((t, c) => t + c.fine, 0),
    bounty: week === s.week ? (s.current.income['commission bounty'] ?? 0) + (s.current.income['commission commendation'] ?? 0) : 0,
    bribes: week === s.week ? s.current.personal.envelopes ?? 0 : 0,
  };
}

/** End of the desk day: a clean shift earns a commendation from the commission. */
export function closeDeskDay(s: GameState): string | null {
  if (s.flags.desk_closed === s.week) return null;
  s.flags.desk_closed = s.week;
  const t = deskTally(s);
  if (t.processed >= 3 && t.mistakes === 0 && t.citations === 0) {
    const amt = Math.round(1000 * Math.max(1, scale(s) * 0.6));
    earn(s, 'commission commendation', amt);
    adjustMeter(s, 'commission', 1);
    s.stats.perfectDays = (s.stats.perfectDays ?? 0) + 1;
    return `Spotless shift. The Athletic Commission sends a commendation (+${money(amt, false)}).`;
  }
  return null;
}
