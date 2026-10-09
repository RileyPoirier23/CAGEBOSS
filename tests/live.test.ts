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
    const seen = { gpos: new Set<string>(), ties: new Set<string>(), subs: new Set<string>(), ev: new Set<string>() };
    for (let seed = 1; seed <= 30; seed++) {
      const L = new LiveFight(f, opp, fightReadySkills(s), opp.skills, 3, seed);
      const ai: [LiveAI, LiveAI] = [new LiveAI(0, seed * 3), new LiveAI(1, seed * 5)];
      let steps = 0;
      while (L.phase !== 'over' && steps < 100000) {
        if (L.phase === 'break') L.nextRound([0.5, 0.5]);
        const a = ai[0].update(L, 1 / 30);
        const b = ai[1].update(L, 1 / 30);
        L.update(1 / 30, [a.intents, b.intents], [a.move, b.move]);
        if (L.pos === 'ground') seen.gpos.add(L.gpos);
        if (L.pos === 'clinch' && L.clinch.dom >= 0) seen.ties.add(L.clinch.tie);
        if (L.sub) seen.subs.add(L.sub.name);
        for (const e of L.events) seen.ev.add(e.type);
        L.events.length = 0;
        steps++;
      }
      expect(L.result).not.toBeNull();
      const r = L.toResult(['a', 'b', 'c'], 'ref');
      expect(r.round).toBeGreaterThanOrEqual(1);
      methods[r.method + r.round] = (methods[r.method + r.round] ?? 0) + 1;
    }
    console.log(methods, [...seen.gpos], [...seen.ties], [...seen.subs], [...seen.ev].sort().join(' '));
    // the clinch and ground games actually get played: ties change hands, positions get passed
    expect(seen.ties.size).toBeGreaterThanOrEqual(2);
    expect(seen.gpos.size).toBeGreaterThanOrEqual(3);
    expect(seen.ev.has('pass')).toBe(true);
    // MMA knockdowns: the man standing jumps on him to finish it
    if (seen.ev.has('kd')) expect(seen.ev.has('pounce')).toBe(true);
  });

  it('submissions follow position and direction', () => {
    const s = createFighterGame({ seed: 9, first: 'Test', last: 'Guy', nick: '', gender: 'M', culture: 'us_urban', division: 'light', archetype: 'grappler', look: { head: 0, skin: 1, hair: 1, hairColor: 1, beard: 0, brows: 0, eyes: 0, nose: 0, ears: 0, scar: 0, tattoo: 0, build: 1 } as never });
    const f = me(s);
    const opp = Object.values(s.fighters).find((x) => x.division === f.division && x.id !== f.id)!;
    const cases: [string, 0 | 1, 'neutral' | 'up' | 'down' | 'toward' | 'away', string | null][] = [
      ['back', 0, 'neutral', 'rear-naked choke'], ['mount', 0, 'up', 'arm-triangle choke'], ['side', 0, 'up', 'north-south choke'],
      ['guard', 1, 'neutral', 'triangle choke'], ['guard', 1, 'down', 'heel hook'], ['half', 0, 'up', "d'arce choke"], ['mount', 1, 'neutral', null],
    ];
    for (const [gpos, who, dir, want] of cases) {
      const L = new LiveFight(f, opp, f.skills, opp.skills, 3, 3);
      L.pos = 'ground';
      L.top = 0;
      L.gpos = gpos as never;
      L.update(0.01, who === 0 ? [[{ type: 'subAttempt', dir }], []] : [[], [{ type: 'subAttempt', dir }]], [0, 0]);
      expect(L.sub?.name ?? null).toBe(want);
    }
  });

  it('a pass moves the top man up a position, a recovery takes it back', () => {
    const s = createFighterGame({ seed: 11, first: 'Test', last: 'Guy', nick: '', gender: 'M', culture: 'us_urban', division: 'light', archetype: 'grappler', look: { head: 0, skin: 1, hair: 1, hairColor: 1, beard: 0, brows: 0, eyes: 0, nose: 0, ears: 0, scar: 0, tattoo: 0, build: 1 } as never });
    const f = me(s);
    const opp = Object.values(s.fighters).find((x) => x.division === f.division && x.id !== f.id)!;
    const L = new LiveFight(f, opp, f.skills, opp.skills, 3, 3);
    L.pos = 'ground';
    L.top = 0;
    L.gpos = 'guard';
    for (let k = 0; k < 40 && L.gpos === 'guard'; k++) L.update(0.2, [[{ type: 'ground', move: 'advance' }], []], [0, 0]);
    expect(L.gpos).toBe('half');
    for (let k = 0; k < 60 && (L.gpos as string) === 'half'; k++) L.update(0.2, [[], [{ type: 'ground', move: 'reverse' }]], [0, 0]);
    expect(L.gpos).toBe('guard');
  });

  it('boss-fight rules: Wyatt survives until his round-3 DQ, Zac\'s fight has no grappling, Daniel never calls Spadam', () => {
    const s = createFighterGame({ seed: 12, first: 'Han', last: 'Tibular', nick: '', gender: 'M', culture: 'canada', division: 'light', archetype: 'striker', look: { head: 0, skin: 1, hair: 1, hairColor: 1, beard: 0, brows: 0, eyes: 0, nose: 0, ears: 0, scar: 0, tattoo: 0, build: 1 } as never });
    const f = me(s);
    const opp = Object.values(s.fighters).find((x) => x.division === f.division && x.id !== f.id)!;
    const run = (rules: LiveFight['rules'], seed: number, strong = false) => {
      const sk = strong ? { ...f.skills, striking: 99, power: 99 } : fightReadySkills(s);
      const L = new LiveFight(f, opp, sk, opp.skills, 3, seed);
      L.rules = rules;
      const ai: [LiveAI, LiveAI] = [new LiveAI(0, seed * 3, strong ? 'pressure' : 'balanced'), new LiveAI(1, seed * 5)];
      let steps = 0;
      let tds = 0;
      while (L.phase !== 'over' && steps < 100000) {
        if (L.phase === 'break') L.nextRound([0.5, 0.5]);
        const a = ai[0].update(L, 1 / 30);
        const b = ai[1].update(L, 1 / 30);
        L.update(1 / 30, [a.intents, b.intents], [a.move, b.move]);
        if (L.pos !== 'stand') tds++;
        L.events.length = 0;
        steps++;
      }
      return { L, tds };
    };
    for (let seed = 1; seed <= 6; seed++) {
      // Wyatt: nothing ends it early (even a 99-power fighter), round 3 ends in his DQ
      const w = run({ protectUntil: 4, dq: { side: 1, round: 3, at: 95, text: 'split punch' } }, seed, true);
      expect(w.L.result?.method).toBe('DQ');
      expect(w.L.result?.round).toBe(3);
      expect(w.L.result?.winner).toBe(0);
      // Zac: stand and bang only
      const z = run({ noGrappling: true }, seed);
      expect(z.tds).toBe(0);
      // Spadam (side 1) with Daniel: his fouls are never penalized; the other side's always are
      const d = run({ bought: 1 }, seed);
      expect(d.L.fouls.filter((x) => x.side === 1).every((x) => !x.penalized)).toBe(true);
      expect(d.L.fouls.filter((x) => x.side === 0).every((x) => x.penalized)).toBe(true);
    }
  });
});
