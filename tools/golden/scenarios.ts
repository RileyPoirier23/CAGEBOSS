/**
 * Golden scenarios: the same code runs in Node (the TypeScript game) and in Godot (translated
 * by tools/gdport). Their JSON results must match exactly, or the port has a bug.
 *
 *   npm run golden          (writes port/godot/tests/golden/*.json from Node and compares with Godot)
 */
import { Rng, hashString } from '../../src/core/rng';
import { content } from '../../src/core/content';
import { globalEnv, eligible } from '../../src/storylets/engine';
import { createNewGame } from '../../src/sim/newgame';
import { simulateWeek, startWeek } from '../../src/sim/week';
import { POLICIES } from '../../src/sim/policies';
import { simulateFight } from '../../src/sim/fight';
import { generateFighter } from '../../src/sim/generate';
import { LiveFight, LiveAI } from '../../src/sim/live';
import {
  createFighterGame, me, doAction, endWeek, acceptOffer, fightThisWeek, doWeighIn, fightEvent, afterFight, resolveEvent, resolveDoc, fightReadySkills,
} from '../../src/sim/fighter';
import { fmx, answerStory } from '../../src/sim/fmstory';
import { runBout, applyBout } from '../../src/sim/events';

export const SCENARIOS = ['rng', 'content', 'generate', 'newgame', 'eligible', 'startweek', 'weeks', 'fights', 'live', 'road'];

function newGame(seed: number) {
  return createNewGame({ seed, mode: 'career', difficulty: 'normal', promotionName: 'Test FC', presidentName: 'Test Boss' });
}

export function runScenario(name: string): unknown {
  switch (name) {
    case 'rng': {
      const r = new Rng(hashString('cage boss'));
      const out: number[] = [hashString('Spadam Biggs')];
      for (let i = 0; i < 2000; i++) out.push(r.next());
      out.push(r.int(1, 100), r.float(2, 5), r.gauss());
      const arr = ['a', 'b', 'c', 'd', 'e', 'f'];
      return { out, shuffled: r.shuffle(arr.slice()), pick: r.pick(arr), id: r.id('x'), w: r.weightedIndex([1, 5, 0, 3]) };
    }
    case 'content': {
      const c = content();
      return { divisions: c.divisions, rules: c.rules.length, roster: c.roster.length, names: Object.keys(c.names), storylets: c.storylets.length, first: c.roster[0] };
    }
    case 'generate': {
      const out: unknown[] = [];
      for (let i = 1; i <= 25; i++) out.push(generateFighter(new Rng(i), content().names, { division: i % 2 ? 'light' : 'welter', tier: i % 3 ? 'prospect' : 'gatekeeper' }));
      return out;
    }
    case 'newgame':
      return newGame(77);
    case 'eligible': {
      const s = newGame(77);
      const rng = new Rng(3);
      const base = globalEnv(s, rng);
      const cache = new Map<string, Record<string, any>>();
      const out: unknown[] = [];
      for (const d of content().storylets) out.push([d.id, eligible(s, d, rng, base, cache), rng.state]);
      return out;
    }
    case 'startweek': {
      const s = newGame(77);
      startWeek(s);
      return s;
    }
    case 'weeks': {
      const s = newGame(77);
      const trail: unknown[] = [];
      for (let i = 0; i < 20; i++) {
        simulateWeek(s, POLICIES.balanced);
        trail.push({ week: s.week, cash: s.promotion.cash, rng: s.rng, meters: s.meters });
      }
      return { trail, state: s };
    }
    case 'fights': {
      const s = newGame(5);
      const fs = Object.values(s.fighters).filter((f) => f.promotion === 'us');
      const offs = content().officials;
      const judges = offs.filter((o) => o.role === 'judge').slice(0, 3);
      const referee = offs.find((o) => o.role === 'referee')!;
      const rng = new Rng(11);
      const out: unknown[] = [];
      for (let i = 0; i < 200; i++) {
        const a = fs[i % fs.length];
        const b = fs[(i * 7 + 3) % fs.length];
        if (a === b) continue;
        const r = simulateFight(a, b, { rounds: i % 4 === 0 ? 5 : 3, judges, referee, ticker: content().templates.ticker }, rng);
        out.push(r);
      }
      return out;
    }
    case 'live': {
      const s = createFighterGame({ seed: 7, first: 'Test', last: 'Guy', nick: '', gender: 'M', culture: 'us_urban', division: 'light', archetype: 'striker', look: { head: 0, skin: 1, hair: 1, hairColor: 1, beard: 0, brows: 0, eyes: 0, nose: 0, ears: 0, scar: 0, tattoo: 0, build: 1 } });
      const f = me(s);
      const opp = Object.values(s.fighters).find((x) => x.division === f.division && x.id !== f.id)!;
      const out: unknown[] = [];
      for (let seed = 1; seed <= 4; seed++) {
        const L = new LiveFight(f, opp, fightReadySkills(s), opp.skills, 3, seed);
        const ai: [LiveAI, LiveAI] = [new LiveAI(0, seed * 3), new LiveAI(1, seed * 5)];
        let steps = 0;
        let evs = 0;
        while (L.phase !== 'over' && steps < 100000) {
          if (L.phase === 'break') L.nextRound([0.5, 0.5]);
          const a = ai[0].update(L, 1 / 30);
          const b = ai[1].update(L, 1 / 30);
          L.update(1 / 30, [a.intents, b.intents], [a.move, b.move]);
          evs += L.events.length;
          L.events.length = 0;
          steps++;
        }
        out.push({ steps, evs, result: L.result, hp: [L.F[0].hp, L.F[1].hp], x: [L.F[0].x, L.F[1].x] });
      }
      return out;
    }
    case 'road': {
      const look = generateFighter(new Rng(1), content().names, { division: 'light', tier: 'prospect' }).look;
      const s = createFighterGame({ seed: 33, first: 'Han', last: 'Tibular', nick: 'The Pride Of The Maritimes', gender: 'M', culture: 'canada', division: 'light', archetype: 'striker', look, han: true });
      const st = fmx(s);
      const rng = new Rng(3);
      for (let w = 0; w < 900 && !st.story?.seen.includes('e_end'); w++) {
        for (const k of Object.keys(me(s).skills) as (keyof ReturnType<typeof me>['skills'])[]) me(s).skills[k] = 97;
        for (const m of st.moments ?? []) if (m.kind === 'story' && m.choices) answerStory(s, m.id, m.choices[0].id);
        st.moments = [];
        while (st.pending.length) resolveEvent(s, st.pending[0].id === 'jimmy' ? 'no' : st.pending[0].choices[0].id, rng);
        for (const d of st.inbox.slice()) resolveDoc(s, d.id, d.fault ? 'dispute' : 'sign', d.fault ? [d.fault] : [], rng);
        if (!st.fight && st.offers.length) acceptOffer(s, 0);
        if (fightThisWeek(s)) {
          doWeighIn(s, 'easy', rng);
          const ev = fightEvent(s, rng);
          for (const b of ev.card) {
            runBout(s, ev, b, rng, false, {});
            applyBout(s, ev, b, rng);
          }
          afterFight(s, ev, rng);
        }
        for (const k of Object.keys(st.body) as (keyof typeof st.body)[]) st.body[k] = 100;
        st.energy = 100;
        doAction(s, 'rest', null, rng);
        endWeek(s, rng);
      }
      return { week: s.week, seen: st.story?.seen, flags: st.story?.flags, history: st.history, money: st.money, rng: s.rng };
    }
  }
  return null;
}
