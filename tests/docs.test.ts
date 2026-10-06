import { describe, it, expect } from 'vitest';
import { newGame } from './setup';
import { Rng } from '../src/core/rng';
import { content } from '../src/core/content';
import type { DeskDoc, DocType, Fighter, GameState } from '../src/core/types';
import {
  makeDoc, FORGERIES, validateDoc, activeOn, checkPair, fixDoc, canBeShady, generateWeekDocs, tutorialDocs, deskTypes, forgeriesFor,
} from '../src/sim/docs';
import { activateRule } from '../src/sim/rules';
import { isOurs } from '../src/sim/fighters';
import { simulateWeek, compareFields, stampDoc } from '../src/sim/week';
import { POLICIES } from '../src/sim/policies';
import { interrogate, deskTally } from '../src/sim/deskops';

function allRules(s: GameState): void {
  for (const r of content().rules) activateRule(s, r.id, false);
}

/** a generated (non-parody) fighter of ours with clean natural paperwork */
function cleanFighter(s: GameState, shady = true): Fighter {
  const pool = Object.values(s.fighters).filter(isOurs).filter((f) => {
    const mgr = content().managers.find((m) => m.id === f.manager);
    return canBeShady(f) === shady && !!mgr?.licensed && f.medSuspUntil <= s.week && !f.legalRecord.length && f.contract;
  });
  expect(pool.length).toBeGreaterThan(0);
  return pool[0];
}

/** every violation must point at fields the player can actually click */
function clickable(d: DeskDoc, key: string): boolean {
  if (key === 'win.face') return true;
  if (key.endsWith('*')) return d.fields.some((f) => f.key.startsWith(key.slice(0, -1)));
  return d.fields.some((f) => f.key === key) || key in d.refs;
}

describe('desk documents: rule checks', () => {
  it('honest documents pass every active rule', () => {
    const s = newGame(11);
    allRules(s);
    const ft = cleanFighter(s);
    const rng = new Rng(5);
    for (const type of ['bout', 'medical', 'expense', 'drug', 'sponsor', 'visa'] as DocType[]) {
      for (let i = 0; i < 25; i++) {
        const d = makeDoc(s, type, ft, false, rng);
        if (!d) continue;
        if (d.meta.forgery) continue; // the occasional real cheater on a drug test
        expect(d.violations, `${type}: ${JSON.stringify(d.violations)}`).toEqual([]);
      }
    }
  });

  it('every forgery is caught by the rule it breaks, on clickable fields', () => {
    const s = newGame(12);
    allRules(s);
    const ft = cleanFighter(s);
    // give the fighter a record and a sponsor so record-based forgeries are possible
    ft.legalRecord = ['DUI (2019)'];
    const sp = content().sponsors.find((x) => !['betting', 'crypto'].includes(x.category))!;
    s.sponsorDeals.push({ sponsor: sp.id, weekly: 0, until: 99, fighter: ft.id });
    const rng = new Rng(9);
    let tested = 0;
    for (const g of FORGERIES) {
      for (let i = 0; i < 6; i++) {
        const d = makeDoc(s, g.type, ft, true, rng, g.kind);
        expect(d, g.kind).toBeTruthy();
        const want = g.kind === 'bannedcat' ? ['betting_ban', 'crypto_ban'] : g.kind === 'scan' ? ['medical_basic', 'mri_required', 'eye_exam'] : [g.rule];
        expect(d!.violations.some((v) => want.includes(v.rule)), `${g.kind} -> ${JSON.stringify(d!.violations)}`).toBe(true);
        for (const v of d!.violations) {
          expect(clickable(d!, v.a), `${g.kind}: ${v.a}`).toBe(true);
          expect(clickable(d!, v.b), `${g.kind}: ${v.b}`).toBe(true);
          expect(checkPair(d!, v.a.replace('*', '0'), v.b.replace('*', '0'))).toBeTruthy();
        }
        tested++;
      }
    }
    expect(tested).toBe(FORGERIES.length * 6);
  });

  it('re-validating is stable and fixing an honest mistake makes the document valid', () => {
    const s = newGame(13);
    allRules(s);
    const ft = cleanFighter(s);
    const rng = new Rng(3);
    for (const g of FORGERIES.filter((x) => x.fixable)) {
      const d = makeDoc(s, g.type, ft, true, rng, g.kind)!;
      expect(validateDoc(d, activeOn(s))).toEqual(d.violations);
      expect(fixDoc(s, d)).toBe(true);
      expect(d.violations, g.kind).toEqual([]);
    }
  });

  it('rules not yet in force are not enforced', () => {
    const s = newGame(14);
    const ft = cleanFighter(s);
    const d = makeDoc(s, 'bout', ft, true, new Rng(1), 'exclusive')!;
    // exclusivity is not active in week 1
    expect(d.violations.some((v) => v.rule === 'exclusivity')).toBe(false);
    expect(forgeriesFor(s, 'bout', d.facts!, ft).every((g) => ['contract_basics', 'purse_match'].includes(g.rule))).toBe(true);
  });

  it('parody / marquee fighters are never cast as forgers or dopers', () => {
    const s = newGame(15);
    allRules(s);
    const parody = Object.values(s.fighters).find((f) => f.parody || f.marquee);
    expect(parody).toBeTruthy();
    expect(canBeShady(parody!)).toBe(false);
    const rng = new Rng(2);
    for (const type of ['bout', 'medical', 'expense', 'drug'] as DocType[]) {
      for (let i = 0; i < 40; i++) {
        const d = makeDoc(s, type, parody!, true, rng);
        const g = FORGERIES.find((x) => x.kind === d?.meta.forgery && x.type === type);
        if (g) expect(g.crime, g.kind).toBe(false);
      }
    }
  });

  it('expense totals use a wildcard pair against any line item', () => {
    const s = newGame(16);
    allRules(s);
    const d = makeDoc(s, 'expense', cleanFighter(s), true, new Rng(4), 'sum')!;
    expect(checkPair(d, 'doc.total', 'doc.item1')).toBeTruthy();
    expect(checkPair(d, 'doc.item2', 'doc.total')).toBeTruthy();
    expect(checkPair(d, 'doc.total', 'rule.cap')).toBeNull();
  });
});

describe('desk progression', () => {
  it('week 1 is bout agreements only, with a welcome bulletin', () => {
    const s = newGame(21);
    const docs = generateWeekDocs(s, new Rng(1));
    expect(docs[0].type).toBe('memo');
    expect(docs[0].meta.bulletin).toBe(true);
    expect(docs.filter((d) => d.type !== 'memo').every((d) => d.type === 'bout')).toBe(true);
    expect(deskTypes(s)).not.toContain('medical');
  });

  it('new document types arrive on schedule with a bulletin', () => {
    const s = newGame(22);
    const seen: Record<string, number> = {};
    for (let w = 0; w < 18 && !s.ending; w++) {
      simulateWeek(s, POLICIES.balanced);
      for (const t of deskTypes(s)) if (seen[t] === undefined) seen[t] = s.week;
    }
    expect(seen.medical).toBeLessThanOrEqual(3);
    expect(seen.expense).toBeLessThanOrEqual(4);
    expect(seen.drug).toBeLessThanOrEqual(11);
    expect(s.rules.active).toContain('fighter_license');
    expect(s.stats.bulletins ?? 0).toBeGreaterThan(5);
  });

  it('the tutorial day has one clean and one obviously bad agreement', () => {
    const s = newGame(23);
    const [clean, dodgy] = tutorialDocs(s, new Rng(1));
    expect(clean.violations).toEqual([]);
    expect(dodgy.violations.length).toBe(1);
    expect(dodgy.violations[0].rule).toBe('purse_match');
  });
});

describe('desk consequences', () => {
  it('flag, deny and get paid; approving a flagged fake is deliberate', () => {
    const s = newGame(31);
    const ft = cleanFighter(s);
    const d = makeDoc(s, 'bout', ft, true, new Rng(7), 'purse')!;
    s.desk.queue.push(d);
    const v = d.violations[0];
    expect(compareFields(s, d.id, v.b, v.a).found).toBe(true);
    const cash = s.promotion.cash;
    const r = stampDoc(s, d.id, 'deny');
    expect(r.correct).toBe(true);
    expect(s.promotion.cash).toBeGreaterThan(cash);
    expect(deskTally(s).caught).toBe(1);
  });

  it('first mistakes of the day are warnings, then fines', () => {
    const s = newGame(32);
    const ft = cleanFighter(s);
    const rng = new Rng(8);
    for (let i = 0; i < 3; i++) {
      const d = makeDoc(s, 'bout', ft, false, rng)!;
      s.desk.queue.push(d);
      stampDoc(s, d.id, 'deny', rng);
    }
    const t = deskTally(s);
    expect(t.citations).toBe(3);
    expect(t.warnings).toBe(2);
    expect(t.fines).toBeGreaterThan(0);
  });

  it('interrogating a parody fighter never produces a bribe', () => {
    const s = newGame(33);
    allRules(s);
    const parody = Object.values(s.fighters).find((f) => f.parody || f.marquee)!;
    const rng = new Rng(4);
    for (let i = 0; i < 30; i++) {
      const d = makeDoc(s, 'bout', parody, true, rng, 'name')!;
      s.desk.queue.push(d);
      const v = d.violations[0];
      compareFields(s, d.id, v.a, v.b);
      const r = interrogate(s, d.id, rng)!;
      expect(r.outcome).not.toBe('bribe');
    }
  });
});
