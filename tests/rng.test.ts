import { describe, it, expect } from 'vitest';
import { Rng, hashString } from '../src/core/rng';

describe('Rng', () => {
  it('is deterministic for a seed', () => {
    const a = new Rng(42);
    const b = new Rng(42);
    for (let i = 0; i < 100; i++) expect(a.next()).toBe(b.next());
  });
  it('stays in range', () => {
    const r = new Rng(7);
    for (let i = 0; i < 2000; i++) {
      const v = r.next();
      expect(v).toBeGreaterThanOrEqual(0);
      expect(v).toBeLessThan(1);
      const n = r.int(3, 9);
      expect(n).toBeGreaterThanOrEqual(3);
      expect(n).toBeLessThanOrEqual(9);
    }
  });
  it('round-trips its state', () => {
    const r = new Rng(99);
    r.next();
    const copy = new Rng(r.state);
    expect(copy.next()).toBe(r.next());
  });
  it('hashes strings stably', () => {
    expect(hashString('cage boss')).toBe(hashString('cage boss'));
    expect(hashString('a')).not.toBe(hashString('b'));
  });
});
