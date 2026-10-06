import { describe, it, expect } from 'vitest';
import { newGame } from './setup';
import { simulateFight } from '../src/sim/fight';
import { content } from '../src/core/content';
import { Rng } from '../src/core/rng';

describe('fight sim', () => {
  it('produces a sane mix of outcomes', () => {
    const s = newGame(5);
    const fs = Object.values(s.fighters).filter((f) => f.promotion === 'us');
    const offs = content().officials;
    const judges = offs.filter((o) => o.role === 'judge').slice(0, 3);
    const referee = offs.find((o) => o.role === 'referee')!;
    const rng = new Rng(11);
    const methods: Record<string, number> = {};
    for (let i = 0; i < 600; i++) {
      const a = fs[i % fs.length];
      const b = fs[(i * 7 + 3) % fs.length];
      if (a === b) continue;
      const r = simulateFight(a, b, { rounds: i % 4 === 0 ? 5 : 3, judges, referee, ticker: content().templates.ticker }, rng);
      methods[r.method] = (methods[r.method] ?? 0) + 1;
      expect(r.round).toBeGreaterThanOrEqual(1);
      expect(r.damage.every((d) => Number.isFinite(d))).toBe(true);
      if (r.winner) expect([a.id, b.id]).toContain(r.winner);
    }
    const total = Object.values(methods).reduce((a, b) => a + b, 0);
    const share = (m: string) => (methods[m] ?? 0) / total;
    expect(share('DEC')).toBeGreaterThan(0.15);
    expect(share('DEC')).toBeLessThan(0.65);
    expect(share('KO') + share('TKO')).toBeGreaterThan(0.15);
    expect(share('SUB')).toBeGreaterThan(0.05);
  });
});
