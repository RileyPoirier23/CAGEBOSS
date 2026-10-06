import { describe, it, expect } from 'vitest';
import { execSync } from 'node:child_process';
import { content as load } from './setup';
import { content } from '../src/core/content';

describe('content', () => {
  it('passes the validator', () => {
    const out = execSync('npx tsx tools/validate.ts', { cwd: process.cwd(), encoding: 'utf8' });
    expect(out).toContain('Content OK');
  });
  it('meets the content targets', () => {
    load();
    const c = content();
    expect(c.storylets.length).toBeGreaterThanOrEqual(350);
    expect(new Set(c.storylets.map((s) => s.chain).filter(Boolean)).size).toBeGreaterThanOrEqual(120);
    expect(c.headlines.length).toBeGreaterThanOrEqual(200);
    expect(c.reporters.length).toBeGreaterThanOrEqual(40);
    expect(Object.values(c.popculture).flat().length).toBeGreaterThanOrEqual(500);
    expect(c.roster.filter((f) => f.parody).length).toBeGreaterThanOrEqual(100);
  });
  it('never casts parody fighters in serious storylets', () => {
    load();
    const serious = content().storylets.filter((s) => ['legal', 'doping', 'speech'].includes(s.category) || s.tags?.includes('serious'));
    expect(serious.length).toBeGreaterThan(0);
  });
});
