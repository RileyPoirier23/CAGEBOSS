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

import { adaptEvade, type FightRead } from '../src/sim/live';

describe('the final round: a fight that reads itself', () => {
  const fresh = (): FightRead => ({ hook: 0, straight: 0, kick: 0, body: 0, shoot: 0, blocked: 0 });
  const mk = (seed = 3) => {
    const s = createFighterGame({ seed, first: 'Test', last: 'Guy', nick: '', gender: 'M', culture: 'us_urban', division: 'light', archetype: 'striker', look: { head: 0, skin: 1, hair: 1, hairColor: 1, beard: 0, brows: 0, eyes: 0, nose: 0, ears: 0, scar: 0, tattoo: 0, build: 1 } as never });
    const f = me(s);
    const opp = Object.values(s.fighters).find((x) => x.division === f.division && x.id !== f.id)!;
    return new LiveFight(f, opp, fightReadySkills(s), opp.skills, 3, seed);
  };

  it('hooks that keep landing get rolled under; kicks that keep landing get checked', () => {
    const none = fresh();
    const hooks = { ...fresh(), hook: 4 };
    const kicks = { ...fresh(), kick: 4 };
    let rollsNone = 0;
    let rollsHooks = 0;
    let checksNone = 0;
    let checksKicks = 0;
    for (let k = 0; k < 200; k++) {
      const r = k / 200;
      if (adaptEvade('hook', none, r, 0.5) === 'roll') rollsNone++;
      if (adaptEvade('hook', hooks, r, 0.5) === 'roll') rollsHooks++;
      if (adaptEvade('legkick', none, r, 0.5) === 'pull') checksNone++;
      if (adaptEvade('legkick', kicks, r, 0.5) === 'pull') checksKicks++;
    }
    expect(rollsHooks).toBeGreaterThan(rollsNone);
    expect(checksKicks).toBeGreaterThan(checksNone);
  });

  it('the AI tallies what lands on it and how its own shots do', () => {
    const L = mk();
    const ai = new LiveAI(1, 9);
    L.events.push({ type: 'hit', side: 0, name: 'hook', target: 'head' }, { type: 'hit', side: 0, name: 'body shot', target: 'body' }, { type: 'td', side: 0 },
      { type: 'hit', side: 1, name: 'jab', target: 'head' }, { type: 'miss', side: 1, name: 'jab' }, { type: 'block', side: 0, name: 'cross' });
    ai.noteEvents(L);
    expect(ai.read.hook).toBe(1);
    expect(ai.read.body).toBe(1);
    expect(ai.read.shoot).toBe(1);
    expect(ai.read.blocked).toBe(1);
    expect(ai.mine.jab).toEqual({ t: 2, l: 1 });
    expect(ai.mine.cross).toEqual({ t: 1, l: 0 });
  });

  it('every knockdown makes the next one easier, and a knockdown round is a 10-8', () => {
    const L = mk();
    expect(L.F[1].frail).toBe(1);
    (L as unknown as { knockdown: (i: 0 | 1) => void }).knockdown(0);
    expect(L.F[1].frail).toBeGreaterThan(1);
    expect(L.rkd[0][0]).toBe(1);
    L.rpts[0] = [14, 8];
    const { rounds } = L.cards();
    expect(rounds[0].every(([a, b]) => a === 10 && b === 8)).toBe(true);
    // the same points with no knockdown is a 10-9
    L.rkd[0] = [0, 0];
    expect(L.cards().rounds[0].every(([a, b]) => a === 10 && b === 9)).toBe(true);
  });

  it('a fight still finishes sanely with the AI reading it', () => {
    const L = mk(11);
    const ai: [LiveAI, LiveAI] = [new LiveAI(0, 31, 'pressure'), new LiveAI(1, 37, 'counter')];
    let steps = 0;
    const moods = new Set<string>();
    while (L.phase !== 'over' && steps < 100000) {
      if (L.phase === 'break') L.nextRound([0.5, 0.5]);
      const a = ai[0].update(L, 1 / 30);
      const b = ai[1].update(L, 1 / 30);
      L.update(1 / 30, [a.intents, b.intents], [a.move, b.move]);
      ai[0].noteEvents(L);
      ai[1].noteEvents(L);
      moods.add(ai[0].mood).add(ai[1].mood);
      L.events.length = 0;
      steps++;
    }
    expect(L.result).not.toBeNull();
    expect(ai[0].read.hook + ai[0].read.straight + ai[0].read.kick + ai[0].read.body + ai[1].read.hook + ai[1].read.straight + ai[1].read.kick + ai[1].read.body).toBeGreaterThan(0);
    expect(moods.size).toBeGreaterThanOrEqual(1);
  });

  it('he hunts a hurt man, rests on an empty tank, and chases the cards late', () => {
    const L = mk(5);
    const ai = new LiveAI(1, 41);
    L.F[0].hp = 20;
    ai.update(L, 1 / 30);
    expect(ai.mood).toBe('hunt');
    L.F[0].hp = 90;
    L.F[1].gas = 10;
    ai.update(L, 1 / 30);
    expect(ai.mood).toBe('rest');
    L.F[1].gas = 80;
    L.round = 3;
    L.clock = 20;
    L.rpts = [[20, 2], [20, 2], [20, 2]];
    L.rkd = [[0, 0], [0, 0], [0, 0]];
    ai.update(L, 1 / 30);
    expect(ai.mood).toBe('urgent');
    L.F[1].gas = 30;
    L.rpts = [[2, 20], [2, 20], [2, 20]];
    ai.update(L, 1 / 30);
    expect(ai.mood).toBe('cruise');
  });
});
