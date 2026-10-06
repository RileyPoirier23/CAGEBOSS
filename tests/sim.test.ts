import { describe, it, expect } from 'vitest';
import { newGame } from './setup';
import { simulateWeek } from '../src/sim/week';
import { POLICIES } from '../src/sim/policies';
import { makeSave, parseSave, exportSave } from '../src/core/save';
import { makeDoc } from '../src/sim/docs';
import { Rng } from '../src/core/rng';

describe('simulation', () => {
  it('is deterministic for a seed', () => {
    const a = newGame(77);
    const b = newGame(77);
    for (let i = 0; i < 20; i++) {
      simulateWeek(a, POLICIES.balanced);
      simulateWeek(b, POLICIES.balanced);
    }
    expect(a.promotion.cash).toBe(b.promotion.cash);
    expect(JSON.stringify(a.stats)).toBe(JSON.stringify(b.stats));
    expect(a.rng).toBe(b.rng);
  });

  it('round-trips a save', () => {
    const s = newGame(3);
    for (let i = 0; i < 6; i++) simulateWeek(s, POLICIES.balanced);
    const back = parseSave(exportSave(s)).state;
    expect(back.week).toBe(s.week);
    expect(back.promotion.cash).toBe(s.promotion.cash);
    expect(Object.keys(back.fighters).length).toBe(Object.keys(s.fighters).length);
    expect(makeSave(s, 'auto').meta.name).toBe('Test FC');
  });

  it('plays a whole career to an ending', () => {
    const s = newGame(123);
    for (let w = 0; w < 52 * 12 && !s.ending; w++) simulateWeek(s, POLICIES.balanced);
    expect(s.ending).toBeTruthy();
  });

  it('every policy survives a year without exceptions', () => {
    for (const p of Object.keys(POLICIES)) {
      const s = newGame(9);
      for (let w = 0; w < 52 && !s.ending; w++) simulateWeek(s, POLICIES[p]);
      expect(s.week).toBeGreaterThan(10);
    }
  });

  it('bad documents carry discoverable violations', () => {
    const s = newGame(4);
    const ft = Object.values(s.fighters).find((f) => f.promotion === 'us')!;
    const rng = new Rng(1);
    let found = 0;
    for (const type of ['bout', 'medical', 'expense', 'sponsor'] as const) {
      for (let i = 0; i < 8; i++) {
        const d = makeDoc(s, type, ft, true, rng);
        if (d && d.violations.length) found++;
      }
    }
    expect(found).toBeGreaterThan(10);
  });
});
