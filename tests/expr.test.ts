import { describe, it, expect } from 'vitest';
import { evaluate, parseStatement, parse } from '../src/storylets/expr';

describe('storylet expressions', () => {
  it('does arithmetic and logic', () => {
    expect(evaluate('1 + 2 * 3', {})).toBe(7);
    expect(evaluate('(1 + 2) * 3', {})).toBe(9);
    expect(evaluate('a > 3 && b == "x"', { a: 5, b: 'x' })).toBe(true);
    expect(evaluate('!flag || n <= 0', { flag: true, n: 0 })).toBe(true);
    expect(evaluate('c ? 1 : 2', { c: false })).toBe(2);
  });
  it('reads nested fields and calls functions', () => {
    const env = { subject: { skills: { heart: 70 } }, max: Math.max };
    expect(evaluate('subject.skills.heart', env)).toBe(70);
    expect(evaluate('max(1, subject.skills.heart)', env)).toBe(70);
  });
  it('treats an empty condition as true', () => {
    expect(evaluate(undefined, {})).toBe(true);
  });
  it('parses statements', () => {
    const st = parseStatement('fans += 3');
    expect(st).toBeTruthy();
  });
  it('rejects garbage', () => {
    expect(() => parse('1 +* 2')).toThrow();
  });
});
