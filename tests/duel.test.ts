import { describe, it, expect } from 'vitest';
import { content as loadTestContent } from './setup';
import { LiveFight, LiveAI, type LiveEvent } from '../src/sim/live';
import { createFighterGame, me, fightReadySkills } from '../src/sim/fighter';
import type { TickerLine } from '../src/core/types';

loadTestContent();

/** A host fight, and a guest that only ever sees it through snapshots sent as JSON (like the relay does). */
describe('online fights: the guest follows the host from snapshots', () => {
  it("the guest's fight ends with the host's result, cards and stats", () => {
    const s = createFighterGame({ seed: 11, first: 'Test', last: 'Guy', nick: '', gender: 'M', culture: 'us_urban', division: 'light', archetype: 'striker', look: { head: 0, skin: 1, hair: 1, hairColor: 1, beard: 0, brows: 0, eyes: 0, nose: 0, ears: 0, scar: 0, tattoo: 0, build: 1 } as never });
    const f = me(s);
    const opp = Object.values(s.fighters).find((x) => x.division === f.division && x.id !== f.id)!;
    for (let seed = 1; seed <= 6; seed++) {
      const host = new LiveFight(f, opp, fightReadySkills(s), opp.skills, 3, seed);
      // the guest builds the same fight from the same spec, then never runs the engine
      const guest = new LiveFight(f, opp, fightReadySkills(s), opp.skills, 3, seed);
      const ai: [LiveAI, LiveAI] = [new LiveAI(0, seed * 3), new LiveAI(1, seed * 5)];
      const events: LiveEvent[] = [];
      let steps = 0;
      let sentLog = 0;
      while (host.phase !== 'over' && steps < 100000) {
        if (host.phase === 'break') host.nextRound([0.55, 0.55]);
        const a = ai[0].update(host, 1 / 30);
        const b = ai[1].update(host, 1 / 30);
        host.update(1 / 30, [a.intents, b.intents], [a.move, b.move]);
        events.push(...host.events);
        host.events.length = 0;
        // every other tick (the host sends 30 a second), over the wire
        if (steps % 2 === 0 || host.phase !== 'fight') {
          const msg = JSON.parse(JSON.stringify({ s: host.snapshot(), e: events.splice(0), l: host.log.slice(sentLog) }));
          sentLog = host.log.length;
          guest.restore(msg.s);
          guest.log.push(...(msg.l as TickerLine[]));
        }
        steps++;
      }
      const r1 = host.toResult(['a', 'b', 'c'], 'ref');
      const r2 = guest.toResult(['a', 'b', 'c'], 'ref');
      expect(guest.phase).toBe('over');
      // as JSON: what crosses the wire (a play-by-play line's undefined fields don't)
      expect(JSON.parse(JSON.stringify(r2))).toEqual(JSON.parse(JSON.stringify(r1)));
      expect(guest.cards()).toEqual(host.cards());
      // a snapshot is small enough to send 30 times a second
      expect(JSON.stringify(host.snapshot()).length).toBeLessThan(4000);
    }
  });

  it("a snapshot leaves out what the guest already has (the fighters, the dice, the play-by-play)", () => {
    const s = createFighterGame({ seed: 12, first: 'Test', last: 'Guy', nick: '', gender: 'M', culture: 'us_urban', division: 'light', archetype: 'striker', look: { head: 0, skin: 1, hair: 1, hairColor: 1, beard: 0, brows: 0, eyes: 0, nose: 0, ears: 0, scar: 0, tattoo: 0, build: 1 } as never });
    const f = me(s);
    const opp = Object.values(s.fighters).find((x) => x.division === f.division && x.id !== f.id)!;
    const snap = new LiveFight(f, opp, fightReadySkills(s), opp.skills, 3, 1).snapshot() as Record<string, unknown>;
    for (const k of ['A', 'B', 'rng', 'log', 'events', 'rules', 'rounds']) expect(snap, k).not.toHaveProperty(k);
    expect((snap.F as Record<string, unknown>[])[0]).not.toHaveProperty('sk');
  });
});
