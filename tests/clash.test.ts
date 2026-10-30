import { describe, expect, it } from 'vitest';
import { createMatch, stepMatch, cloneMatch, TICK_RATE } from '../src/clash/sim';
import { emptyInput } from '../src/clash/types';
import type { InputFrame, MatchConfig } from '../src/clash/types';

function config(seed = 7): MatchConfig {
  return {
    stageId: 'rooftop',
    mode: 'casual',
    seed,
    stocks: 3,
    timerTicks: 60 * 60 * 4,
    gearBuffs: false,
    playerChar: 'kestrel',
    cpuChar: 'mireille',
    cpuLevel: 3,
    modern: false,
    gear: [{}, {}],
    training: false,
  };
}

function idle(match: ReturnType<typeof createMatch>, ticks: number): void {
  for (let i = 0; i < ticks; i++) stepMatch(match, emptyInput(), emptyInput());
}

function press(base: InputFrame, keys: (keyof InputFrame)[]): InputFrame {
  const f = { ...base };
  for (const k of keys) (f[k] as boolean) = true;
  return f;
}

function ready(): ReturnType<typeof createMatch> {
  const m = createMatch(config());
  idle(m, 130);
  for (const f of m.fighters) {
    f.hp = f.hpMax;
    f.x = f.side === 0 ? 720 : 790;
    f.y = 650;
    f.px = f.x;
    f.py = f.y;
    f.grounded = true;
    f.platform = 0;
    f.state = 'idle';
    f.invuln = 0;
    f.drive = 6;
    f.burnout = 0;
  }
  return m;
}

describe('universe clash fight simulation', () => {
  it('runs at 60 ticks and puts both fighters on the stage', () => {
    expect(TICK_RATE).toBe(60);
    const m = createMatch(config());
    idle(m, 160);
    expect(m.phase).toBe('fight');
    expect(m.fighters[0].grounded).toBe(true);
    expect(m.fighters[1].grounded).toBe(true);
    expect(m.fighters[0].y).toBe(650);
  });

  it('is deterministic under identical inputs', () => {
    const a = createMatch(config(99));
    const b = createMatch(config(99));
    const input = press(emptyInput(), ['right']);
    for (let i = 0; i < 420; i++) {
      stepMatch(a, input, emptyInput());
      stepMatch(b, input, emptyInput());
    }
    expect(JSON.stringify(a)).toBe(JSON.stringify(b));
  });

  it('lands a light attack and builds a combo tally', () => {
    const m = ready();
    stepMatch(m, press(emptyInput(), ['lightPressed']), emptyInput());
    idle(m, 18);
    expect(m.fighters[1].hp).toBeLessThan(m.fighters[1].hpMax);
    expect(m.stats.hits[0]).toBeGreaterThan(0);
    expect(m.combo[0].hits).toBeGreaterThan(0);
  });

  it('does not hit during the first ticks of a dodge', () => {
    const m = ready();
    const before = m.fighters[1].hp;
    stepMatch(m, press(emptyInput(), ['lightPressed']), emptyInput());
    stepMatch(m, emptyInput(), press(emptyInput(), ['dodgePressed', 'dodge']));
    idle(m, 20);
    expect(m.fighters[1].hp).toBe(before);
  });

  it('charges a signature and spends drive for EX', () => {
    const m = ready();
    const start = m.fighters[0].drive;
    const held = press(emptyInput(), ['heavyPressed', 'drive', 'heavy']);
    stepMatch(m, held, emptyInput());
    idle(m, 28);
    expect(m.fighters[0].drive).toBeLessThan(start);
    expect(m.fighters[1].hp).toBeLessThan(m.fighters[1].hpMax);
  });

  it('gives a perfect parry and refunds the pip', () => {
    const m = ready();
    // Parry is a two-button action: dodge and heavy on the same tick.
    const parry = press(emptyInput(), ['dodgePressed', 'heavyPressed', 'dodge', 'heavy']);
    stepMatch(m, parry, emptyInput());
    const driveAfterParry = m.fighters[0].drive;
    expect(driveAfterParry).toBeLessThan(6);
    // Opponent swings into the window.
    m.fighters[1].x = 760;
    m.fighters[1].facing = -1;
    m.fighters[1].state = 'idle';
    stepMatch(m, emptyInput(), press(emptyInput(), ['lightPressed']));
    idle(m, 8);
    expect(m.fighters[1].state).toBe('hitstun');
    expect(m.fighters[0].perfectParry).toBeGreaterThan(0);
    expect(m.stats.perfectParries[0]).toBe(1);
    expect(m.fighters[0].drive).toBeGreaterThan(driveAfterParry);
  });

  it('cancels an air dodge into a ground signature', () => {
    const m = ready();
    m.fighters[0].grounded = false;
    m.fighters[0].y = 500;
    m.fighters[0].jumps = 1;
    stepMatch(m, press(emptyInput(), ['dodgePressed']), emptyInput());
    expect(m.fighters[0].gcWindow).toBeGreaterThan(0);
    idle(m, 4);
    stepMatch(m, press(emptyInput(), ['heavyPressed']), emptyInput());
    expect(m.fighters[0].move).toBe('nSig');
    expect(m.fighters[0].state).toBe('attack');
  });

  it('applies a super flash and an impact frame tier', () => {
    const m = ready();
    stepMatch(m, press(emptyInput(), ['superPressed']), emptyInput());
    expect(m.fighters[0].state).toBe('super');
    expect(m.dramatic).toBeGreaterThan(0);
    idle(m, 60);
    expect(m.stats.supers[0]).toBe(1);
    expect(m.events.some((e) => e.type === 'super')).toBe(true);
  });

  it('rings out a fighter who leaves the blast zone', () => {
    const m = ready();
    m.fighters[1].x = 2000;
    m.fighters[1].grounded = false;
    stepMatch(m, emptyInput(), emptyInput());
    expect(m.fighters[1].stocks).toBe(2);
    expect(m.phase).toBe('ko');
    expect(m.events.some((e) => e.type === 'ringout')).toBe(true);
  });

  it('rolls back by restoring a snapshot and replaying the same tick', () => {
    const m = ready();
    const snapshot = cloneMatch(m);
    const input = press(emptyInput(), ['right']);
    for (let i = 0; i < 30; i++) stepMatch(m, input, emptyInput());
    const replayed = cloneMatch(snapshot);
    for (let i = 0; i < 30; i++) stepMatch(replayed, input, emptyInput());
    expect(JSON.stringify(replayed)).toBe(JSON.stringify(m));
  });
});
