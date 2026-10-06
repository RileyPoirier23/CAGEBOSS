import { describe, it, expect } from 'vitest';
import { newGame } from './setup';
import { runBout } from '../src/sim/events';
import { commentate, boothOpen, butlerIntro, butlerDecision, butlerFinish } from '../src/sim/commentary';
import { expandPop } from '../src/sim/popculture';
import { Rng } from '../src/core/rng';

const unresolved = /\{[a-zA-Z_]+\}/;

describe('broadcast', () => {
  it('commentary, announcer and decision reads have no unfilled placeholders', () => {
    const s = newGame(21);
    for (const ev of s.events.slice(0, 3)) {
      for (const b of ev.card) {
        runBout(s, ev, b, new Rng(b.position + 5), true);
        const lines = commentate(s, ev, b, b.result!.ticker ?? [], 9);
        const open = boothOpen(s, ev, b, 3);
        const intro = butlerIntro(s, ev, b, 4);
        const end = ['DEC', 'DRAW'].includes(b.result!.method) ? butlerDecision(s, ev, b, 5).lines : butlerFinish(s, b, 5);
        for (const l of [...lines, ...open]) expect(l.text).not.toMatch(unresolved);
        for (const l of [...intro, ...end]) expect(l.text).not.toMatch(unresolved);
        expect(lines.some((l) => l.speaker)).toBe(true);
        expect(intro.length).toBeGreaterThan(6);
      }
    }
  });
  it('expands pop-culture placeholders', () => {
    newGame(1);
    const t = expandPop('{pop_movie} and {pop_food} and {pop}', 5);
    expect(t).not.toMatch(/\{pop/);
  });
});
