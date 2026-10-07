import { describe, it, expect } from 'vitest';
import { content as loadTestContent } from './setup';
loadTestContent();
import { Rng } from '../src/core/rng';
import { content } from '../src/core/content';
import { generateFighter } from '../src/sim/generate';
import {
  createFighterGame, fm, me, doAction, endWeek, acceptOffer, fightThisWeek, doWeighIn, fightEvent, afterFight, resolveEvent, fightReadySkills,
  resolveDoc, trainSkill, bareknuckle,
} from '../src/sim/fighter';
import { runBout, applyBout } from '../src/sim/events';
import { simulateFight } from '../src/sim/fight';

describe('fighter mode', () => {
  it('plays 40 weeks: train, fight, get ranked, survive controversy', () => {
    const look = generateFighter(new Rng(1), content().names, { division: 'light', tier: 'prospect' }).look;
    const s = createFighterGame({ seed: 11, first: 'Test', last: 'Dummy', nick: 'Crash', gender: 'M', culture: 'mexico', division: 'light', archetype: 'wrestler', look });
    expect(s.mode).toBe('fighter');
    expect(fm(s).offers.length).toBeGreaterThan(0);
    const rng = new Rng(99);
    let fights = 0;
    for (let w = 0; w < 40; w++) {
      while (fm(s).pending.length) resolveEvent(s, fm(s).pending[0].id === 'jimmy' ? 'no' : fm(s).pending[0].choices[0].id, rng);
      if (!fm(s).fight && fm(s).offers.length) acceptOffer(s, 0);
      if (fightThisWeek(s)) {
        doWeighIn(s, 'easy', rng);
        const ev = fightEvent(s, rng);
        const backup = { ...me(s).skills };
        me(s).skills = fightReadySkills(s);
        for (const b of ev.card) {
          runBout(s, ev, b, rng, false, { plan: () => 'pressure', cornerAid: () => 0.8 });
          applyBout(s, ev, b, rng);
        }
        me(s).skills = backup;
        afterFight(s, ev, rng);
        fights++;
      }
      doAction(s, 'train', 'wrestling', rng);
      doAction(s, 'rest', null, rng);
      doAction(s, 'work', null, rng);
      endWeek(s, rng);
    }
    expect(fights).toBeGreaterThan(2);
    expect(fm(s).history.length).toBe(fights);
    const f = me(s);
    expect(f.record.w + f.record.l + f.record.d).toBe(fights);
  });

  it('climbs amateur -> regional -> Only Fighters, does paperwork and bareknuckle', () => {
    const look = generateFighter(new Rng(2), content().names, { division: 'welter', tier: 'prospect' }).look;
    const s = createFighterGame({ seed: 21, first: 'Lad', last: 'Climber', nick: '', gender: 'M', culture: 'uk', division: 'welter', archetype: 'striker', look });
    expect(fm(s).tier).toBe('amateur');
    expect(fm(s).ladder.length).toBe(7);
    const rng = new Rng(7);
    const tiers = new Set<string>();
    for (let w = 0; w < 150 && fm(s).tier !== 'of'; w++) {
      while (fm(s).pending.length) resolveEvent(s, fm(s).pending[0].id === 'jimmy' ? 'no' : fm(s).pending[0].choices[0].id, rng);
      for (const d of fm(s).inbox.slice()) resolveDoc(s, d.id, d.fault ? 'dispute' : 'sign', d.fault ? [d.fault] : [], rng);
      if (!fm(s).fight && fm(s).offers.length) acceptOffer(s, 0);
      if (fightThisWeek(s)) {
        doWeighIn(s, 'easy', rng);
        const ev = fightEvent(s, rng);
        for (const b of ev.card) {
          runBout(s, ev, b, rng, false, {});
          applyBout(s, ev, b, rng);
        }
        afterFight(s, ev, rng);
      }
      tiers.add(fm(s).tier);
      trainSkill(s, 'striking', rng, 1);
      if (w % 5 === 0) bareknuckle(s, rng);
      doAction(s, 'rest', null, rng);
      doAction(s, 'rest', null, rng);
      endWeek(s, rng);
    }
    expect(tiers.has('regional')).toBe(true);
    expect(fm(s).tier).toBe('of');
    expect(me(s).promotion).toBe('us');
    expect(fm(s).bk.w + fm(s).bk.l).toBeGreaterThan(0);
  });

  it('gameplans change how the fight goes', () => {
    const rng = new Rng(5);
    const a = generateFighter(rng, content().names, { division: 'light', tier: 'contender' });
    const b = generateFighter(rng, content().names, { division: 'light', tier: 'contender' });
    const opts = { rounds: 3 as const, judges: content().officials.filter((o) => o.role === 'judge').slice(0, 3), referee: content().officials.find((o) => o.role === 'referee')! };
    let tdW = 0;
    let tdP = 0;
    for (let i = 0; i < 60; i++) {
      tdW += simulateFight(a, b, { ...opts, plan: (sd) => (sd === 0 ? 'wrestle' : 'balanced') }, new Rng(100 + i)).stats.takedowns[0];
      tdP += simulateFight(a, b, { ...opts, plan: (sd) => (sd === 0 ? 'legs' : 'balanced') }, new Rng(100 + i)).stats.takedowns[0];
    }
    expect(tdW).toBeGreaterThan(tdP);
  });

  it('re-simulating with a later plan change keeps earlier rounds identical', () => {
    const rng = new Rng(8);
    const a = generateFighter(rng, content().names, { division: 'welter', tier: 'contender' });
    const b = generateFighter(rng, content().names, { division: 'welter', tier: 'contender' });
    const opts = { rounds: 3 as const, judges: content().officials.filter((o) => o.role === 'judge').slice(0, 3), referee: content().officials.find((o) => o.role === 'referee')!, ticker: content().templates.ticker };
    const r1 = simulateFight(a, b, { ...opts, plan: () => 'balanced' }, new Rng(42));
    const r2 = simulateFight(a, b, { ...opts, plan: (sd, round) => (sd === 0 && round >= 2 ? 'wrestle' : 'balanced'), cornerAid: (sd, round) => (sd === 0 && round === 1 ? 1 : undefined) }, new Rng(42));
    const round1 = (r: typeof r1) => JSON.stringify((r.ticker ?? []).filter((l) => l.round === 1));
    expect(round1(r2)).toBe(round1(r1));
  });
});
