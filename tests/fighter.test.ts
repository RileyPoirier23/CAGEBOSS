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
import { fmx, answerStory } from '../src/sim/fmstory';
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
    const am = fm(s).amateur ?? { w: 0, l: 0, d: 0, nc: 0 };
    expect(f.record.w + f.record.l + f.record.d + f.record.nc + am.w + am.l + am.d + am.nc).toBe(fights);
  });

  it('climbs local -> regional -> the Lounge (PFL) -> CBFC, does paperwork and bareknuckle', () => {
    const look = generateFighter(new Rng(2), content().names, { division: 'welter', tier: 'prospect' }).look;
    const s = createFighterGame({ seed: 21, first: 'Lad', last: 'Climber', nick: '', gender: 'M', culture: 'uk', division: 'welter', archetype: 'striker', look });
    expect(fm(s).tier).toBe('amateur');
    expect(fm(s).ladder.length).toBe(7);
    const rng = new Rng(7);
    const tiers = new Set<string>();
    for (let w = 0; w < 400 && fm(s).tier !== 'of'; w++) {
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
    if (process.env.STORYDBG) console.log(s.week, fm(s).tier, fm(s).ladder.slice(0, 6), fm(s).ladder.indexOf(fm(s).player), fm(s).history.slice(-6).map((h) => h.opp + ':' + h.result + ':' + h.title), JSON.stringify((fm(s) as any).story?.flags));
    expect(tiers.has('regional')).toBe(true);
    expect(tiers.has('pfl')).toBe(true);
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

describe('road to champion story & legacy mode', () => {
  const look = () => generateFighter(new Rng(1), content().names, { division: 'light', tier: 'prospect' }).look;
  it('a new Road To Champion career has the story, the rival as local champ, and the first contract to sign', () => {
    const s = createFighterGame({ seed: 31, first: 'Story', last: 'Mode', nick: 'Soup', gender: 'M', culture: 'mexico', division: 'light', archetype: 'striker', look: look() });
    const st = fm(s);
    expect(st.story?.rival).toBe('rival');
    expect(st.ladder[0]).toBe('rival');
    expect(st.moments?.[0]?.kind).toBe('signing');
    expect(st.moments?.some((m) => m.kind === 'story')).toBe(true);
    expect(st.legacy).toBeFalsy();
  });
  it('the whole road: chapters, the grudge match, the title, the credits, the rematch', () => {
    const s = createFighterGame({ seed: 33, first: 'Han', last: 'Tibular', nick: 'The Pride Of The Maritimes', gender: 'M', culture: 'canada', division: 'light', archetype: 'striker', look: look(), han: true });
    const st = fmx(s);
    const rng = new Rng(3);
    const why: string[] = [];
    for (let w = 0; w < 900 && !st.story?.seen.includes('e_end'); w++) {
      // a fighter who's very, very good (this tests the story, not the balance)
      for (const k of Object.keys(me(s).skills) as (keyof ReturnType<typeof me>['skills'])[]) me(s).skills[k] = 97;
      for (const m of st.moments ?? []) if (m.kind === 'story' && m.choices) answerStory(s, m.id, m.choices[0].id);
      st.moments = [];
      while (st.pending.length) resolveEvent(s, st.pending[0].id === 'jimmy' ? 'no' : st.pending[0].choices[0].id, rng);
      for (const d of st.inbox.slice()) resolveDoc(s, d.id, d.fault ? 'dispute' : 'sign', d.fault ? [d.fault] : [], rng);
      if (!st.fight && st.offers.length) {
        why.push(st.offers[0].why);
        acceptOffer(s, 0);
      }
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
    const seen = st.story!.seen;
    if (process.env.STORYDBG) console.log(s.week, seen.join(' '), JSON.stringify(st.story!.flags));
    for (const id of ['c1_open', 'c1_tv', 'c1_allstar', 'c1_landlord', 'c1_mateo', 'c1_vance_booked', 'c2_signed', 'c2_wyatt', 'c2_jimmy', 'c2_wyatt_booked', 'c2_wyatt_done',
      'c3_lounge', 'c3_zac', 'c3_spadam', 'c3_confessional', 'c3_zac_booked', 'c3_zac_done', 'c4_cbfc', 'c4_grudge_booked', 'c4_champ', 'e_plaque', 'e_rematch_booked',
      'c5_callout', 'c5_tape', 'c5_superfight', 'c5_presser', 'c5_won', 'e_end']) expect(seen, id).toContain(id);
    expect(st.story!.flags.grudgeDone).toBe(1);
    expect(why.some((x) => x.startsWith('TITLE DEFENCE'))).toBe(true);
    expect(why.some((x) => x.startsWith('SUPERFIGHT'))).toBe(true);
    expect(st.story!.flags.rematchDone).toBe(1);
    expect(st.story!.gymSaved).toBe(true);
    // the bosses: Wyatt gets himself disqualified in round 3, the Lounge final has no takedowns, the Beast falls
    const wy = st.history.find((h) => h.opp === 'wyatt' && h.title);
    expect(wy?.method).toMatch(/^DQ/);
    expect(wy?.round).toBe(3);
    expect(st.history.some((h) => h.opp === 'spadam' && h.result === 'W')).toBe(true);
    expect(me(s).division).toBe('welter');
    expect(st.partner?.stage).toBe(99);
    for (let n = 1; n <= 5; n++) expect(st.story!.flags['chShown' + n], 'chapter ' + n).toBe(1);
  });
  it('Legacy Mode skips the story and can start in the CBFC', () => {
    const s = createFighterGame({ seed: 32, first: 'Legacy', last: 'Mode', nick: 'Chaos', gender: 'M', culture: 'mexico', division: 'light', archetype: 'wrestler', look: look(), legacy: true, startTier: 'of' });
    const st = fm(s);
    expect(st.legacy).toBe(true);
    expect(st.tier).toBe('of');
    expect(st.story).toBeUndefined();
    expect(st.money).toBeGreaterThanOrEqual(10000);
    expect(st.moments?.filter((m) => m.kind === 'signing').length).toBe(1);
  });
});
