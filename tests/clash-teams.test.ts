import { describe, expect, it } from 'vitest';
import { createMatch, stepMatch, checksumMatch } from '../src/clash/sim';
import { ClashSession } from '../src/clash/session';
import type { MatchConfig, MatchFormat } from '../src/clash/types';
import { emptyInput } from '../src/clash/types';

function config(format: MatchFormat, seed = 7): MatchConfig {
  return {
    stageId: 'rooftop',
    mode: 'casual',
    seed,
    stocks: 2,
    timerTicks: 60 * 60 * 3,
    gearBuffs: false,
    playerChar: 'kestrel',
    cpuChar: 'mireille',
    cpuLevel: 4,
    modern: false,
    gear: [{}, {}, {}, {}],
    training: false,
    format,
    chars: ['kestrel', 'mireille', 'pip', 'brickhouse'],
  };
}

describe('team formats', () => {
  it('seats four fighters in 2v2 and free-for-all', () => {
    const tag = createMatch(config('2v2'));
    expect(tag.fighters.length).toBe(4);
    expect(tag.fighters.map((f) => f.team)).toEqual([0, 1, 0, 1]);
    const ffa = createMatch(config('ffa'));
    expect(ffa.fighters.map((f) => f.team)).toEqual([0, 1, 2, 3]);
    expect(createMatch({ ...config('1v1'), chars: undefined }).fighters.length).toBe(2);
  });

  it('partners cannot hit each other', () => {
    const m = createMatch(config('2v2'));
    for (let i = 0; i < 130; i++) stepMatch(m, [emptyInput(), emptyInput(), emptyInput(), emptyInput()]);
    expect(m.phase).toBe('fight');
    // Put the partner where the jab lands and the foes far away.
    const [p1, foe, ally, foe2] = m.fighters;
    ally.x = p1.x + 60;
    ally.y = p1.y;
    foe.x = 1250;
    foe2.x = 1250;
    const press = { ...emptyInput(), light: true, lightPressed: true };
    stepMatch(m, [press, emptyInput(), emptyInput(), emptyInput()]);
    for (let i = 0; i < 30; i++) stepMatch(m, [emptyInput(), emptyInput(), emptyInput(), emptyInput()]);
    expect(ally.hp).toBe(ally.hpMax);
    expect(m.stats.hits[0]).toBe(0);
  });

  it('a 2v2 against the CPU ends with one team out of stocks', () => {
    const s = new ClashSession(config('2v2'), { spectator: true, cpuLevel: 4 });
    for (let i = 0; i < 60 * 60 * 3 + 600 && !s.over; i++) s.step(emptyInput());
    expect(s.over).toBe(true);
    const m = s.match;
    expect([0, 1]).toContain(m.winner);
    const losers = m.fighters.filter((f) => f.team !== m.winner);
    const alive = losers.some((f) => f.stocks > 0);
    // Either the losing team is out of stocks or the clock decided it.
    expect(!alive || m.timer <= 0).toBe(true);
  });

  it('a free-for-all leaves one team standing', () => {
    const s = new ClashSession(config('ffa', 11), { spectator: true, cpuLevel: 4 });
    for (let i = 0; i < 60 * 60 * 3 + 600 && !s.over; i++) s.step(emptyInput());
    expect(s.over).toBe(true);
    const m = s.match;
    expect(m.winner).toBeGreaterThanOrEqual(0);
    const standing = new Set(m.fighters.filter((f) => f.stocks > 0).map((f) => f.team));
    expect(standing.size <= 1 || m.timer <= 0).toBe(true);
  });

  it('four seats stay deterministic under the rollback core', () => {
    const a = new ClashSession(config('ffa', 3), { spectator: true, cpuLevel: 3 });
    const b = new ClashSession(config('ffa', 3), { spectator: true, cpuLevel: 3 });
    for (let i = 0; i < 900; i++) {
      a.step(emptyInput());
      b.step(emptyInput());
    }
    expect(checksumMatch(a.match)).toBe(checksumMatch(b.match));
  });
});
