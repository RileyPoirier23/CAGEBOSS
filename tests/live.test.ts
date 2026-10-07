import { describe, it, expect } from 'vitest';
import { content as loadTestContent } from './setup';
import { LiveFight, LiveAI } from '../src/sim/live';
import { createFighterGame, me, fightReadySkills } from '../src/sim/fighter';

loadTestContent();

describe('hands-on fight engine', () => {
  it('AI vs AI fights always finish with a sane result', () => {
    const s = createFighterGame({ seed: 7, first: 'Test', last: 'Guy', nick: '', gender: 'M', culture: 'us_urban', division: 'light', archetype: 'striker', look: { head: 0, skin: 1, hair: 1, hairColor: 1, beard: 0, brows: 0, eyes: 0, nose: 0, ears: 0, scar: 0, tattoo: 0, build: 1 } as never });
    const f = me(s);
    const opp = Object.values(s.fighters).find((x) => x.division === f.division && x.id !== f.id)!;
    const methods: Record<string, number> = {};
    for (let seed = 1; seed <= 30; seed++) {
      const L = new LiveFight(f, opp, fightReadySkills(s), opp.skills, 3, seed);
      const ai: [LiveAI, LiveAI] = [new LiveAI(0, seed * 3), new LiveAI(1, seed * 5)];
      let steps = 0;
      while (L.phase !== 'over' && steps < 100000) {
        if (L.phase === 'break') L.nextRound([0.5, 0.5]);
        const a = ai[0].update(L, 1 / 30);
        const b = ai[1].update(L, 1 / 30);
        L.update(1 / 30, [a.intents, b.intents], [a.move, b.move]);
        L.events.length = 0;
        steps++;
      }
      expect(L.result).not.toBeNull();
      const r = L.toResult(['a', 'b', 'c'], 'ref');
      expect(r.round).toBeGreaterThanOrEqual(1);
      methods[r.method + r.round] = (methods[r.method + r.round] ?? 0) + 1;
    }
    console.log(methods);
  });
});
