import { describe, it, expect } from 'vitest';
import { newGame } from './setup';
import { simulateFight } from '../src/sim/fight';
import { generateFighter } from '../src/sim/generate';
import { runBout } from '../src/sim/events';
import { commentate, boothOpen } from '../src/sim/commentary';
import { stepMomentum, momLead, MOM_W } from '../src/sim/momentum';
import { lineBeat, talkBeat, blocksAction, nextRoundIndex } from '../src/ui/watchpace';
import { content, type OfficialDef } from '../src/core/content';
import { Rng, hashString } from '../src/core/rng';
import { SKILL_KEYS, type Fighter, type FightResult, type TickerLine } from '../src/core/types';

// ------------------------------------------------------------------ fixtures
// Fighters, officials and ticker banks built here (not from the data files), so the frozen values below
// only change when the fight sim itself does.
const STYLES = ['Wrestler', 'Muay Thai', 'Boxer', 'Kickboxer', 'Pressure Striker', 'Brawler', 'Counter Striker', 'Sub Hunter', 'Leg Locker', 'Judoka', 'Ground & Pound', 'Boring But Effective', 'Showboat'];
const off = (id: string, role: 'judge' | 'referee', bias: string): OfficialDef => ({ id, name: id.toUpperCase(), role, bias, fouls: 'fair', standups: 'fair', desc: '' });
const JUDGES = [off('j1', 'judge', 'fair'), off('j2', 'judge', 'striking'), off('j3', 'judge', 'grappling')];
const REFS = [off('r1', 'referee', 'early'), off('r2', 'referee', 'fair'), off('r3', 'referee', 'late')];

/** Every key has the same five lines (any key, so every say() makes its one draw). */
function bank(withHold = false): Record<string, string[]> {
  const lines = [0, 1, 2, 3, 4].map((i) => `#${i} {a} vs {b} in {r}${withHold ? ' {hold}' : ''}`);
  return new Proxy({} as Record<string, string[]>, { get: (_t, k) => lines.map((l) => String(k) + l) });
}

function fights(withHold = false): FightResult[] {
  newGame(1);
  const base = generateFighter(new Rng(1), content().names, { division: 'light', tier: 'contender' });
  const mk = (r: Rng, id: string, last: string): Fighter => {
    const f: Fighter = { ...base, id, first: 'Test', last, gender: 'M', styles: [r.pick(STYLES), r.pick(STYLES)], traits: r.chance(0.2) ? ['Hothead'] : [], reach: r.int(168, 198), addiction: 0, cutman: { name: 'Cut', rating: r.int(30, 95) }, skills: { ...base.skills } };
    for (const k of SKILL_KEYS) f.skills[k] = r.int(35, 95);
    return f;
  };
  const out: FightResult[] = [];
  const ticker = bank(withHold);
  for (let seed = 1; seed <= 50; seed++) {
    const r = new Rng(seed * 7919);
    const a = mk(r, 'fa', 'Alpha');
    const b = mk(r, 'fb', 'Bravo');
    out.push(simulateFight(a, b, { rounds: seed % 4 === 0 ? 5 : 3, judges: JUDGES, referee: REFS[seed % 3], ticker, keepTicker: true }, new Rng(seed)));
  }
  return out;
}

/** Outcome, and every line's act, key, side, time, position, intensity and hp (no text, no presentation fields). */
const outcome = (res: FightResult) => {
  const tk = res.ticker ?? [];
  const w = res.winner === 'fa' ? 0 : res.winner === 'fb' ? 1 : -1;
  return `${res.method}|${res.round}|${res.time}|${w}|${hashString(tk.map((l) => `${l.round}.${l.t}.${l.side}.${l.act}.${l.key}.${l.pos}.${l.intensity}.${l.hp.join('/')}`).join(','))}`;
};
const textHash = (res: FightResult) => String(hashString((res.ticker ?? []).map((l) => l.text).join('\n')));

// Frozen from the sim before the no-repeat ticker picks and the presentation fields went in: they may change
// the words, never the fight.
const FROZEN_OUTCOMES = [
  'DOC|1|5:00|0|2322126821', 'DEC|3|5:00|1|123257966', 'KO|2|4:27|1|533983884', 'SUB|2|1:44|0|3185191437', 'DEC|3|5:00|1|2519481290',
  'DEC|3|5:00|0|53484849', 'KO|3|2:48|1|2958531721', 'SUB|4|4:14|1|2213366919', 'KO|1|3:07|1|3371345938', 'KO|3|0:39|1|2554429336',
  'KO|2|1:37|0|948261425', 'SUB|1|1:06|1|2045291383', 'KO|1|0:39|0|2112538767', 'SUB|1|3:10|1|2602529821', 'KO|1|3:28|1|2874666025',
  'TKO|4|3:52|0|509787842', 'DEC|3|5:00|0|1117243050', 'DEC|3|5:00|0|2310258996', 'DEC|3|5:00|0|68705051', 'TKO|3|2:23|1|1730132017',
  'DEC|3|5:00|1|167264876', 'DEC|3|5:00|0|4164852766', 'DEC|3|5:00|0|1593212201', 'SUB|2|3:08|0|3511328825', 'DEC|3|5:00|0|3647628214',
  'TKO|3|1:17|0|1332519508', 'KO|1|3:07|1|1298535075', 'KO|2|4:23|1|3191480404', 'KO|1|2:46|0|1130109180', 'DEC|3|5:00|1|2037562664',
  'DEC|3|5:00|0|947337473', 'KO|1|3:41|1|293460169', 'DEC|3|5:00|1|2302980146', 'SUB|3|4:32|0|4093296603', 'KO|3|2:11|0|1924875239',
  'KO|2|2:00|1|3390838072', 'KO|1|1:13|0|482832489', 'DEC|3|5:00|1|1779715341', 'DEC|3|5:00|0|3565151889', 'TKO|4|0:40|1|931462552',
  'TKO|3|2:55|0|2504920977', 'TKO|2|4:34|1|2231176399', 'DEC|3|5:00|1|781700731', 'KO|2|2:21|1|3611227984', 'DEC|3|5:00|1|3445350298',
  'SUB|2|1:26|0|3673586946', 'TKO|3|1:38|1|1977154780', 'KO|2|2:57|1|3316916820', 'KO|1|4:13|1|2906779291', 'TKO|3|4:23|1|1134063218',
];
// Frozen once the no-repeat picks were in, before the presentation fields: those must not touch the words.
const FROZEN_TEXT = [
  '1875943430', '345436442', '2428286665', '2294422976', '3135530760', '3620874410', '3421826777', '402570787',
  '2546005776', '3121843642', '2360616817', '174278138', '4079075533', '2685870412', '1635953944', '1669326652',
  '631544274', '99205466', '3869306577', '3276821033', '1665163753', '1866362093', '1885409526', '3121846180',
  '2147044781', '1860189648', '1974521371', '1724996948', '3279353957', '316577085', '1522159012', '2115529900',
  '3779193072', '1588915261', '129181021', '2976142069', '1606350499', '1407669975', '2068360253', '3795523914',
  '4110123451', '1468828073', '1152516590', '3662636352', '1179148303', '2362966352', '3236993777', '2845281593',
  '2846223452', '3014956247',
];

const L = (o: Partial<TickerLine>): TickerLine => ({ round: 1, t: 0, text: '', side: 0, intensity: 1, act: 'jab', pos: 'stand', hp: [100, 100], ...o });

// ------------------------------------------------------------------ pacing
describe('watch pacing', () => {
  it('beats follow fight time, big moments linger', () => {
    const a = L({ t: 40 });
    expect(lineBeat(L({ intensity: 3 }), L({ t: 0 }))).toBe(1.6);
    expect(lineBeat(a, L({ t: 40 }))).toBeCloseTo(0.55);
    expect(lineBeat(a, L({ t: 50 }))).toBeCloseTo(0.75 + 0.5 * 0.55);
    expect(lineBeat(a, L({ t: 75 }))).toBeCloseTo(1.3);
    expect(lineBeat(a, L({ round: 2, t: 10 }))).toBeCloseTo(1.3);
    expect(lineBeat(a, undefined)).toBeCloseTo(1.3);
    expect(talkBeat(L({ text: 'x'.repeat(55) }))).toBeCloseTo(1.9);
  });

  it('only the finish, decision and round-end booth lines hold the action', () => {
    const b = (key: string) => L({ speaker: 'lon', key, act: 'talk', side: -1 });
    expect(blocksAction(b('booth:finish_ko'))).toBe(true);
    expect(blocksAction(b('booth:finish_sub'))).toBe(true);
    expect(blocksAction(b('booth:decision'))).toBe(true);
    expect(blocksAction(b('booth:robbery'))).toBe(true);
    expect(blocksAction(b('booth:round_end'))).toBe(true);
    expect(blocksAction(b('booth:hurt'))).toBe(false);
    expect(blocksAction(b('booth:lull'))).toBe(false);
    expect(blocksAction(L({ key: 'knockdown' }))).toBe(false);
  });

  it('NEXT ROUND goes to the bell, but never past a finish', () => {
    const booth = (round: number) => L({ round, speaker: 'lon', act: 'talk', side: -1, key: 'booth:lull' });
    const lines = [
      L({ key: 'opening', act: 'idle', side: -1 }), L({ key: 'land_jab', t: 10 }), booth(1), L({ key: 'land_cross', t: 30 }),
      L({ key: 'round_end', act: 'bell', side: -1, t: 300 }), L({ speaker: 'lon', act: 'talk', side: -1, key: 'booth:round_end' }),
      L({ round: 2, key: 'round_start', act: 'idle', side: -1 }), L({ round: 2, key: 'land_jab', t: 12 }), L({ round: 2, key: 'land_cross', t: 30 }), booth(2),
      L({ round: 2, key: 'land_hook', t: 44 }), L({ round: 2, key: 'rocked', act: 'rocked', t: 44 }), L({ round: 2, key: 'ko_punch', act: 'ko', t: 51, intensity: 3 }),
      L({ round: 2, speaker: 'lon', act: 'talk', side: -1, key: 'booth:finish_ko' }),
    ];
    expect(nextRoundIndex(lines, 0)).toBe(4);
    expect(nextRoundIndex(lines, 4)).toBe(4);
    // round 2 ends in a knockout: stop three action lines before it (the cross, the hook, the rocked man)
    expect(nextRoundIndex(lines, 6)).toBe(8);
    expect(nextRoundIndex(lines, 10)).toBe(10);
    expect(nextRoundIndex(lines, 13)).toBe(13);
    // a fight that just stops (an injury) with no finish act: the same three-line run-up
    const hurt = lines.slice(0, 11).concat([L({ round: 2, key: 'injury_knee', act: 'injury', t: 50, intensity: 3 })]);
    expect(nextRoundIndex(hurt, 6)).toBe(8);
  });
});

// ------------------------------------------------------------------ the watched sim
describe('watched sim: words and pictures, never the outcome', () => {
  let cache: FightResult[] | null = null;
  const all = () => (cache = cache ?? fights());

  it('outcomes and every line\'s act and key match the sim before the change', () => {
    expect(all().map(outcome)).toEqual(FROZEN_OUTCOMES);
  });

  it('the presentation fields leave the words alone', () => {
    expect(all().map(textHash)).toEqual(FROZEN_TEXT);
  });

  it('a template bank is used up before any line repeats', () => {
    for (const r of all()) {
      const seen = new Map<string, string[]>();
      for (const l of r.ticker ?? []) {
        const k = l.key ?? '';
        // a spent bank starts over, except the variant just said: it can't come straight back
        let s = seen.get(k) ?? [];
        if (s.length >= 5) s = [s[s.length - 1]];
        const v = l.text.split(' ')[0];
        expect(s).not.toContain(v);
        s.push(v);
        seen.set(k, s);
      }
    }
  });

  it('carries stamina, ground position, the clinch tie, the fence and who leads', () => {
    let fence = 0;
    let lead = 0;
    let ties = 0;
    for (const r of all()) {
      for (const l of r.ticker ?? []) {
        expect(l.st).toBeDefined();
        expect(l.st![0]).toBeGreaterThanOrEqual(0);
        expect(l.st![0]).toBeLessThanOrEqual(100);
        const down = l.pos === 'atop' || l.pos === 'btop';
        if (down) expect(l.gpos).toBeDefined();
        else expect(l.gpos).toBeUndefined();
        if (l.tie) {
          expect(l.pos).toBe('clinch');
          ties++;
        }
        if (l.fence !== undefined) {
          expect(down).toBe(false);
          fence++;
        }
        if (l.lead !== undefined) lead++;
      }
    }
    expect(fence).toBeGreaterThan(0);
    expect(lead).toBeGreaterThan(0);
    expect(ties).toBeGreaterThan(0);
  });

  it('ground position climbs the ladder: never more than two rungs between ground lines', () => {
    const RANK: Record<string, number> = { guard: 0, half: 1, side: 2, mount: 3, back: 4 };
    let moves = 0;
    for (const r of fights(true)) {
      let prev: TickerLine | null = null;
      for (const l of r.ticker ?? []) {
        const down = l.pos === 'atop' || l.pos === 'btop';
        // a sweep puts the other man on top: a new ladder
        if (down && prev && prev.pos === l.pos && prev.gpos !== l.gpos) {
          moves++;
          const a = prev.gpos!;
          const b = l.gpos!;
          // the back hangs off side control and mount; a man taking it for the rear-naked choke, or
          // escaping it back to guard, makes one move
          const backTake = b === 'back' && l.key === 'sub_attempt' && /Rear-Naked/.test(l.text);
          const backOut = a === 'back' && b === 'guard' && l.key === 'escape';
          const branch = b === 'back' && (a === 'side' || a === 'mount');
          if (!backTake && !backOut && !branch) expect(Math.abs(RANK[a] - RANK[b])).toBeLessThanOrEqual(2);
        }
        prev = down ? l : null;
      }
    }
    expect(moves).toBeGreaterThan(10);
  });
});

// ------------------------------------------------------------------ momentum
describe('momentum', () => {
  it('builds with the shots, swings to the other man, and starts level each round', () => {
    const m: [number, number] = [0, 0];
    const seq = [
      L({ key: 'opening', act: 'idle', side: -1 }),
      L({ key: 'land_cross', side: 0 }), L({ key: 'land_hook', side: 0 }), L({ key: 'land_headkick', side: 0, act: 'headkick' }),
      L({ key: 'knockdown', side: 1, act: 'kd', intensity: 3 }), L({ key: 'rocked', side: 1, act: 'rocked' }), L({ key: 'land_combo', side: 1 }),
      L({ key: 'gnp_elbow', side: 1, act: 'gnp', pos: 'btop' }), L({ key: 'sub_attempt', side: 1, act: 'sub', pos: 'btop' }), L({ key: 'sweep', side: 1, act: 'sweep', pos: 'btop' }),
    ];
    const leads: number[] = [];
    for (const l of seq) {
      stepMomentum(m, l);
      leads.push(momLead(m));
    }
    expect(leads[3]).toBeGreaterThanOrEqual(0.45);
    expect(leads[9]).toBeLessThanOrEqual(-0.45);
    // booth chatter doesn't move it
    const before = [m[0], m[1]];
    stepMomentum(m, L({ speaker: 'blow', key: 'booth:hurt', act: 'talk', side: 1 }));
    expect([m[0], m[1]]).toEqual(before);
    stepMomentum(m, L({ round: 2, key: 'round_start', act: 'idle', side: -1 }));
    expect(m).toEqual([0, 0]);
    expect(momLead(m)).toBe(0);
    expect(MOM_W.knockdown).toBe(5);
  });
});

// ------------------------------------------------------------------ the booth
describe('the booth', () => {
  it('has momentum calls, and the thin ticker banks are filled out', () => {
    newGame(1);
    const c = content().commentary;
    for (const sp of ['lon', 'blow', 'dc']) {
      const lines = c.booth[sp].momentum ?? [];
      expect(lines.length).toBeGreaterThanOrEqual(6);
      for (const l of lines) expect(l.replace(/\{(x|y|r)\}/g, '')).not.toMatch(/\{\w+\}/);
    }
    expect(c.fallback.momentum).toEqual(['hurt']);
    const tk = content().templates.ticker;
    for (const k of ['clinch', 'break_clinch', 'gnp', 'getup', 'escape', 'sprawl']) expect(tk[k].length).toBeGreaterThanOrEqual(6);
  });

  it('credits the man who won the round, not the red corner', () => {
    const s = newGame(21);
    const lon = content().commentary.booth.lon;
    const keep = lon.round_end;
    lon.round_end = ['ROUND CHECK {x}'];
    let checked = 0;
    try {
      for (const ev of s.events.slice(0, 3)) {
        for (const b of ev.card) {
          runBout(s, ev, b, new Rng(b.position + 5), true);
          const res = b.result!;
          const out = commentate(s, ev, b, res.ticker ?? [], 9);
          for (let i = 1; i < out.length; i++) {
            const l = out[i];
            if (!/^ROUND CHECK/i.test(l.text)) continue;
            const rs = res.roundScores![l.round - 1];
            const a = rs.filter((sc) => sc[0] > sc[1]).length;
            const bb = rs.filter((sc) => sc[1] > sc[0]).length;
            if (a === bb) continue;
            const winner = s.fighters[a > bb ? b.a : b.b];
            expect(l.text.toLowerCase()).toBe(`round check ${winner.last}`.toLowerCase());
            checked++;
          }
        }
      }
    } finally {
      lon.round_end = keep;
    }
    expect(checked).toBeGreaterThan(0);
  });

  it('remembers what it said earlier on the card, and a re-sim with the same memory says the same', () => {
    const s = newGame(21);
    const ev = s.events[0];
    const avoid = new Set<string>();
    let fresh = 0;
    let dup = 0;
    const heard = new Set<string>();
    for (const b of ev.card) {
      runBout(s, ev, b, new Rng(b.position + 5), true);
      const before = new Set(avoid);
      const lines = [...boothOpen(s, ev, b, 3, avoid), ...commentate(s, ev, b, b.result!.ticker ?? [], 9, avoid)];
      // Fighter Mode re-sims pass a copy of the memory as it was: the same lines come out
      const copy = new Set(before);
      const again = [...boothOpen(s, ev, b, 3, copy), ...commentate(s, ev, b, b.result!.ticker ?? [], 9, copy)];
      expect(again.map((l) => l.text)).toEqual(lines.map((l) => l.text));
      for (const l of lines) {
        if (!l.speaker) continue;
        if (heard.has(l.text)) dup++;
        else fresh++;
        heard.add(l.text);
      }
    }
    expect(dup / (dup + fresh)).toBeLessThan(0.05);
  });
});
