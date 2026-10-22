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

import { STRIKE_REACH, ARENA_L, subFor, groundGoal, CLINCH_MOVE_NAME, type LiveEvent } from '../src/sim/live';
import type { FightIntent } from '../src/core/fightinput';

describe('a smarter CPU, and no one-button wins', () => {
  const s = createFighterGame({ seed: 7, first: 'Test', last: 'Guy', nick: '', gender: 'M', culture: 'us_urban', division: 'light', archetype: 'striker', look: { head: 0, skin: 1, hair: 1, hairColor: 1, beard: 0, brows: 0, eyes: 0, nose: 0, ears: 0, scar: 0, tattoo: 0, build: 1 } as never });
  const f = me(s);
  const opp = Object.values(s.fighters).find((x) => x.division === f.division && x.id !== f.id)!;
  const setup = (seed = 3, iqB?: number) => new LiveFight(f, opp, fightReadySkills(s), iqB === undefined ? opp.skills : { ...opp.skills, fightIQ: iqB }, 3, seed);
  /** run frames with these intents on the first one, nothing after; returns every event */
  const run = (L: LiveFight, first: [FightIntent[], FightIntent[]], frames: number, moves: [number, number] = [0, 0]) => {
    const evs: LiveEvent[] = [];
    for (let k = 0; k < frames; k++) {
      L.update(1 / 30, k === 0 ? first : [[], []], moves);
      evs.push(...L.events);
      L.events.length = 0;
    }
    return evs;
  };
  const P = (punch: 'jab' | 'straight' | 'overhand' | 'hook', weight: 'light' | 'medium' | 'heavy' = 'medium', hand: 'lead' | 'rear' = 'lead'): FightIntent => ({ type: 'punch', hand, punch, weight, hold: 0.1, pressure: 1, grounded: false });

  it('the CPU throws what reaches', () => {
    expect(STRIKE_REACH.jab).toBe(56);
    expect(STRIKE_REACH['front kick']).toBe(60);
    expect(STRIKE_REACH['spinning backfist']).toBe(48);
    const looping = new Set(['overhand', 'uppercut', 'spinning backfist']);
    let thrown = 0;
    let missed = 0;
    for (let seed = 1; seed <= 30; seed++) {
      const L = setup(seed);
      const ai: [LiveAI, LiveAI] = [new LiveAI(0, seed * 3), new LiveAI(1, seed * 5)];
      let steps = 0;
      while (L.phase !== 'over' && steps < 100000) {
        if (L.phase === 'break') L.nextRound([0.5, 0.5]);
        const a = ai[0].update(L, 1 / 30);
        const b = ai[1].update(L, 1 / 30);
        L.update(1 / 30, [a.intents, b.intents], [a.move, b.move]);
        for (const e of L.events) {
          if (e.type === 'punch' && e.name && looping.has(e.name) && L.pos === 'stand') thrown++;
          if (e.type === 'miss' && e.name && looping.has(e.name)) missed++;
        }
        ai[0].noteEvents(L);
        ai[1].noteEvents(L);
        L.events.length = 0;
        steps++;
      }
    }
    expect(thrown).toBeGreaterThan(30);
    expect(missed / thrown).toBeLessThan(0.4);
  });

  it('parry has a cooldown, evades back to back come later, pull needs room', () => {
    const L = setup(3);
    run(L, [[{ type: 'parry' }], []], 1);
    expect(L.F[0].parryT).toBeGreaterThan(0);
    run(L, [[], []], 7); // 0.25 s later
    run(L, [[{ type: 'parry' }], []], 1);
    expect(L.F[0].parryT).toBe(0);
    // three evades 0.2 s apart: each starts later in its window
    const E = setup(4);
    const ev: FightIntent = { type: 'evade', kind: 'slip', source: 'button' };
    run(E, [[ev], []], 6);
    run(E, [[ev], []], 6);
    run(E, [[ev], []], 1);
    expect(E.F[0].evade?.t ?? 0).toBeGreaterThanOrEqual(0.2);
    // back on the fence, pulling away goes nowhere: the jab lands
    const W = setup(5);
    W.F[0].x = ARENA_L;
    W.F[1].x = ARENA_L + 50;
    expect(W.onWall(0)).toBe(true);
    const evs = run(W, [[{ type: 'evade', kind: 'pull', source: 'button' }], [P('jab')]], 10);
    expect(evs.some((e) => e.type === 'hit' && e.side === 1)).toBe(true);
    expect(evs.some((e) => e.type === 'evade' && e.big)).toBe(false);
    // off the fence the same pull makes him miss
    const O = setup(5);
    O.F[0].x = 200;
    O.F[1].x = 250;
    const evo = run(O, [[{ type: 'evade', kind: 'pull', source: 'button' }], [P('jab')]], 10);
    expect(evo.some((e) => e.type === 'miss' && e.side === 1)).toBe(true);
    expect(evo.some((e) => e.type === 'hit' && e.side === 1)).toBe(false);
  });

  it('a blocked body kick can get caught (and a catch is never a takedown)', () => {
    let caught = 0;
    let tds = 0;
    for (let seed = 1; seed <= 300; seed++) {
      const L = setup(seed);
      L.F[0].x = 230;
      const evs = run(L, [[{ type: 'kick', level: 'body' }], [{ type: 'block', phase: 'start' }]], 15);
      for (const e of evs) {
        if (e.type === 'catch') {
          caught++;
          expect(e.side).toBe(1);
          expect(e.name).toBe('kick');
          expect(L.F[0].stun).toBeGreaterThan(0);
        }
        if (e.type === 'td') tds++;
      }
    }
    expect(caught).toBeGreaterThanOrEqual(1);
    expect(tds).toBe(0);
  });

  it('a sharp shot stops a looping one', () => {
    const L = setup(6);
    L.F[0].x = 200;
    L.F[1].x = 248;
    const evs = run(L, [[], [P('overhand', 'heavy', 'rear')]], 1);
    expect(L.F[1].act?.wind).toBeCloseTo(0.345);
    evs.push(...run(L, [[P('straight', 'medium', 'rear')], []], 14));
    expect(evs.some((e) => e.type === 'interrupt' && e.side === 0 && e.name === 'overhand')).toBe(true);
    expect(evs.some((e) => (e.type === 'hit' || e.type === 'counter' || e.type === 'miss') && e.side === 1)).toBe(false);
    // told right after the hit that did it
    const k = evs.findIndex((e) => e.type === 'interrupt');
    expect(evs[k - 1].type === 'hit' && evs[k - 1].side === 0).toBe(true);
    // a flicked jab doesn't stop anything: the overhand still comes
    const J = setup(6);
    J.F[0].x = 200;
    J.F[1].x = 248;
    const evj = run(J, [[], [P('overhand', 'heavy', 'rear')]], 1);
    evj.push(...run(J, [[P('jab', 'light')], []], 14));
    expect(evj.some((e) => e.type === 'interrupt')).toBe(false);
    expect(evj.some((e) => (e.type === 'hit' || e.type === 'counter' || e.type === 'miss' || e.type === 'block') && e.side === 1)).toBe(true);
  });

  it('he times a jab on a rhythm', () => {
    const early = [0, 0];
    const late = [0, 0];
    for (const seed of [1, 2, 4, 6]) {
      const L = setup(seed, 90);
      L.rules.noGrappling = true;
      // a durable jabber: this is about the read, not about him getting knocked out
      L.F[0].sk = { ...L.F[0].sk, chin: 99, heart: 99 };
      const ai = new LiveAI(1, 9);
      let t = 0;
      let next = 0.3;
      for (let k = 0; k < 600 && !L.result; k++) {
        const mine: FightIntent[] = [];
        if (t >= next) {
          mine.push(P('jab', 'light'));
          next += 0.6;
        }
        if (L.F[0].down > 0) mine.push({ type: 'getup', side: 'left', rhythm: 1 });
        const d = L.dist;
        const b = ai.update(L, 1 / 30);
        L.update(1 / 30, [mine, b.intents], [d > 52 ? 1 : d < 48 ? -1 : 0, b.move]);
        for (const e of L.events) {
          if (e.side !== 0 || e.name !== 'jab') continue;
          const bucket = t < 5 ? early : t >= 10 ? late : null;
          if (!bucket) continue;
          if (e.type === 'punch') bucket[1]++;
          if (e.type === 'hit' || e.type === 'counter') bucket[0]++;
        }
        ai.noteEvents(L);
        L.events.length = 0;
        L.F[0].hp = Math.max(L.F[0].hp, 60);
        t += 1 / 30;
      }
      expect(L.result).toBeNull();
      expect(ai.readNote).toBe('jab');
      expect(ai.readN).toBeGreaterThanOrEqual(1);
    }
    expect(late[1]).toBeGreaterThan(20);
    expect(late[0] / late[1]).toBeLessThan(early[0] / early[1]);
  });

  it('the CPU sees an opening before it punishes it, and a plain whiff costs a sharp shot, not a haymaker', () => {
    /** side 0 opens the window (a whiffed heavy hook from 50 px, or a jab into side 1's parry); returns side 1's answer and how long it took */
    const answer = (seed: number, parried: boolean) => {
      const L = setup(seed, 85);
      L.F[0].x = 200;
      L.F[1].x = 250;
      const ai = new LiveAI(1, seed);
      // nothing else on his mind: only the counter can answer
      (ai as unknown as { think: number }).think = 9;
      let t = 0;
      let opened = -1;
      for (let k = 0; k < 30; k++) {
        const b = ai.update(L, 1 / 30);
        const p = b.intents.find((x) => x.type === 'punch');
        if (p && p.type === 'punch') return { weight: p.weight, after: t - opened, stuck: L.F[0].stun };
        L.update(1 / 30, k === 0 ? [[P(parried ? 'jab' : 'hook', parried ? 'medium' : 'heavy')], parried ? [{ type: 'parry' }] : []] : [[], b.intents], [0, 0]);
        L.events.length = 0;
        t += 1 / 30;
        if (opened < 0 && L.F[1].counterT > 0) opened = t;
      }
      return null;
    };
    let heavy = 0;
    for (const seed of [1, 2, 3, 4, 5, 6]) {
      const w = answer(seed, false);
      expect(w).not.toBeNull();
      // he waits 0.25 - 0.15 * 0.85 = 0.1225 s from when he first sees it (the update after it opens): 0.09 s of fight at the least
      expect(w!.after).toBeGreaterThanOrEqual(0.085);
      // a whiff: the stumble is all but over by then, so a medium shot
      expect(w!.weight).toBe('medium');
      // a parried hand leaves him stuck for longer: while he still is, that one gets everything
      const p = answer(seed, true);
      expect(p).not.toBeNull();
      expect(p!.weight).toBe(p!.stuck > 0.2 ? 'heavy' : 'medium');
      if (p!.weight === 'heavy') heavy++;
    }
    expect(heavy).toBeGreaterThan(0);
  });

  it('he reads a habit at any frame rate', () => {
    // a slow phone: the fight runs at the 0.05 s frame clamp
    const L = setup(2, 90);
    L.rules.noGrappling = true;
    L.F[0].sk = { ...L.F[0].sk, chin: 99, heart: 99 };
    const ai = new LiveAI(1, 9);
    let t = 0;
    let next = 0.3;
    while (t < 20 && !L.result) {
      const mine: FightIntent[] = [];
      if (t >= next) {
        mine.push(P('jab', 'light'));
        next += 0.6;
      }
      if (L.F[0].down > 0) mine.push({ type: 'getup', side: 'left', rhythm: 1 });
      const d = L.dist;
      const b = ai.update(L, 0.05);
      L.update(0.05, [mine, b.intents], [d > 52 ? 1 : d < 48 ? -1 : 0, b.move]);
      ai.noteEvents(L);
      L.events.length = 0;
      L.F[0].hp = Math.max(L.F[0].hp, 60);
      t += 0.05;
    }
    expect(ai.readNote).toBe('jab');
    expect(ai.readN).toBeGreaterThanOrEqual(1);
  });

  it('a man already getting up covers and pulls guard when he gets jumped', () => {
    const kd = (getup: number) => {
      const L = setup(9);
      (L as unknown as { knockdown: (i: 0 | 1) => void }).knockdown(0);
      expect(L.F[1].down).toBeGreaterThan(0);
      L.F[1].getup = getup;
      run(L, [[P('straight', 'heavy', 'rear')], []], 1);
      expect(L.pos).toBe('ground');
      expect(L.top).toBe(0);
      return L;
    };
    const covered = kd(0.7);
    expect(covered.gpos).toBe('guard');
    expect(covered.F[1].stun).toBeLessThan(0.7);
    expect(kd(0.4).gpos).toBe('half');
    expect(['mount', 'side']).toContain(kd(0).gpos);
  });

  it('pushing back into the fence circles you off it', () => {
    const L = setup(10);
    L.F[0].x = ARENA_L;
    const evs = run(L, [[], []], 18, [-1, 0]);
    expect(evs.some((e) => e.type === 'pivot' && e.side === 0 && e.name === 'escape')).toBe(true);
    expect(L.F[0].x).toBeGreaterThan(ARENA_L + 15);
    // walking in on the circle, the other man can cut it off (and he's never stuck there for good)
    let cut = 0;
    for (let seed = 1; seed <= 40; seed++) {
      const C = setup(seed, 99);
      C.F[0].x = ARENA_L;
      C.F[1].x = ARENA_L + 45;
      cut += run(C, [[], []], 8, [-1, -1]).filter((e) => e.type === 'pivot' && e.name === 'cutoff').length;
    }
    expect(cut).toBeGreaterThan(0);
    // the circle is over when the round is: no slide carries across the bell (or onto the mat and back up)
    const R = setup(5);
    R.F[0].x = ARENA_L;
    R.F[1].x = ARENA_L + 50;
    R.clock = 0.25;
    expect(run(R, [[], []], 12, [-1, 0]).some((e) => e.type === 'pivot' && e.name === 'escape')).toBe(true);
    expect(R.phase).toBe('break');
    R.nextRound([0.5, 0.5]);
    run(R, [[], []], 10);
    expect([R.F[0].x, R.F[1].x]).toEqual([170, 310]);
    const G = setup(5);
    G.F[0].x = ARENA_L;
    G.F[1].x = ARENA_L + 50;
    run(G, [[], []], 7, [-1, 0]);
    G.pos = 'ground';
    run(G, [[], []], 5);
    G.pos = 'stand';
    G.F[0].x = 200;
    G.F[1].x = 250;
    run(G, [[], []], 10);
    expect([G.F[0].x, G.F[1].x]).toEqual([200, 250]);
  });

  it('a pressure fighter walks him onto the fence, and the fence work happens', () => {
    // two balanced men keep to the middle; a pressure plan (the CPU's from round 2 in a career fight) backs a man up
    let standT = 0;
    let wallT = 0;
    let spells = 0;
    let spellT = 0;
    let pin = 0;
    const evs: Record<string, number> = {};
    for (let seed = 1; seed <= 20; seed++) {
      const L = setup(seed);
      const ai: [LiveAI, LiveAI] = [new LiveAI(0, seed * 3), new LiveAI(1, seed * 5, 'pressure')];
      let steps = 0;
      while (L.phase !== 'over' && steps < 100000) {
        if (L.phase === 'break') L.nextRound([0.5, 0.5]);
        const a = ai[0].update(L, 1 / 30);
        const b = ai[1].update(L, 1 / 30);
        L.update(1 / 30, [a.intents, b.intents], [a.move, b.move]);
        for (const e of L.events) evs[e.type] = (evs[e.type] ?? 0) + 1;
        ai[0].noteEvents(L);
        ai[1].noteEvents(L);
        L.events.length = 0;
        if (L.pos === 'stand' && L.F.every((x) => x.down <= 0)) {
          standT++;
          if (L.onWall(0) || L.onWall(1)) {
            wallT++;
            pin++;
          } else if (pin > 0) {
            spells++;
            spellT += pin;
            pin = 0;
          }
        }
        steps++;
      }
    }
    expect(wallT / standT).toBeGreaterThan(0.01);
    expect(wallT / standT).toBeLessThan(0.09);
    expect(spellT / Math.max(1, spells) / 30).toBeLessThan(5);
    expect(evs.pivot ?? 0).toBeGreaterThan(0);
    expect(evs.fence ?? 0).toBeGreaterThan(0);
  });

  it('the HUD helpers: submissions, ground goals, clinch names', () => {
    const cases: [string, 0 | 1, 'neutral' | 'up' | 'down' | 'toward' | 'away', string | null][] = [
      ['back', 0, 'neutral', 'rear-naked choke'], ['mount', 0, 'up', 'arm-triangle choke'], ['side', 0, 'up', 'north-south choke'],
      ['guard', 1, 'neutral', 'triangle choke'], ['guard', 1, 'down', 'heel hook'], ['half', 0, 'up', "d'arce choke"], ['mount', 1, 'neutral', null],
    ];
    for (const [gpos, who, dir, want] of cases) expect(subFor(who === 0, gpos as never, dir)).toBe(want);
    expect(groundGoal(true, 'half', 'toward')).toBe('pass to side control');
    expect(groundGoal(true, 'back', 'toward')).toBe('');
    expect(groundGoal(true, 'guard', 'up')).toBe('stand up');
    expect(groundGoal(true, 'side', 'up')).toBe('take the back');
    expect(groundGoal(true, 'mount', 'down')).toBe('pressure');
    expect(groundGoal(false, 'half', 'toward')).toBe('sweep');
    expect(groundGoal(false, 'side', 'toward')).toBe('recover half guard');
    expect(groundGoal(false, 'guard', 'away')).toBe('');
    expect(groundGoal(false, 'mount', 'up')).toBe('stand up');
    expect(groundGoal(false, 'back', 'neutral')).toBe('frame');
    expect(Object.keys(CLINCH_MOVE_NAME).sort()).toEqual(['break', 'plum', 'pummel', 'trip', 'under']);
    // the progress bar's label follows what each man last worked on
    const L = setup(3);
    L.pos = 'ground';
    L.top = 0;
    L.gpos = 'half';
    expect(L.working()).toEqual({ top: '', bottom: '' });
    run(L, [[{ type: 'ground', move: 'advance' }], [{ type: 'ground', move: 'reverse' }]], 1);
    expect(L.working()).toEqual({ top: 'pass to side control', bottom: 'recover full guard' });
    // a change of position wipes both labels: after a recovery the top man's goal from the old spot is gone,
    // and after a sweep the new top man isn't shown the old top man's goal
    for (const [gpos, move] of [['side', 'reverse'], ['half', 'advance']] as const) {
      const W = new LiveFight(f, opp, fightReadySkills(s), { ...opp.skills, grappling: 99, wrestling: 99 }, 3, 1);
      W.pos = 'ground';
      W.top = 0;
      W.gpos = gpos;
      run(W, [[{ type: 'ground', move: 'advance' }], []], 1);
      expect(W.working().top).not.toBe('');
      for (let k = 0; k < 300 && W.pos === 'ground' && W.top === 0 && W.gpos === gpos; k++) run(W, [[], k % 6 === 0 ? [{ type: 'ground', move }] : []], 1);
      expect(W.pos).toBe('ground');
      expect([W.top, W.gpos]).not.toEqual([0, gpos]);
      expect(W.working()).toEqual({ top: '', bottom: '' });
    }
  });
});
