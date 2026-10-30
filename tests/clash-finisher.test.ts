import { describe, expect, it } from 'vitest';
import { createMatch, stepMatch } from '../src/clash/sim';
import { emptyInput } from '../src/clash/types';
import type { InputFrame, MatchConfig } from '../src/clash/types';

function config(over: Partial<MatchConfig> = {}): MatchConfig {
  return {
    stageId: 'rooftop',
    mode: 'casual',
    seed: 12,
    stocks: 3,
    timerTicks: 60 * 60 * 4,
    gearBuffs: false,
    playerChar: 'kestrel',
    cpuChar: 'mireille',
    cpuLevel: 3,
    modern: false,
    gear: [{}, {}],
    training: false,
    unlocked: [3, 3],
    ...over,
  };
}

function press(keys: (keyof InputFrame)[]): InputFrame {
  const f = emptyInput();
  for (const k of keys) (f[k] as boolean) = true;
  return f;
}

function lastStock(cfg = config()) {
  const m = createMatch(cfg);
  for (let i = 0; i < 130; i++) stepMatch(m, emptyInput(), emptyInput());
  const [p, o] = m.fighters;
  Object.assign(p, { x: 705, y: 650, vx: 0, vy: 0, state: 'idle', grounded: true, platform: 0, facing: 1, hp: 100, drive: 6 });
  Object.assign(o, { x: 800, y: 650, vx: 0, vy: 0, state: 'idle', grounded: true, platform: 0, facing: -1, hp: 1, stocks: 1, invuln: 0 });
  return m;
}

describe('finishers', () => {
  it('fires the built-in sSig finisher on a last-stock kill', () => {
    const m = lastStock();
    stepMatch(m, press(['right', 'heavy', 'heavyPressed']), emptyInput());
    for (let i = 0; i < 40 && m.phase !== 'finisher'; i++) stepMatch(m, emptyInput(), emptyInput());
    expect(m.phase).toBe('finisher');
    expect(m.finisher?.kind).toBe('crush');
    expect(m.finisher?.name).toBe('Red, White and Through');
    expect(m.fighters[1].state).toBe('ko');
    expect(m.fighters[0].state).toBe('idle');
  });

  it('only offers finishers the level has unlocked', () => {
    const m = lastStock(config({ unlocked: [1, 1] }));
    stepMatch(m, press(['right', 'heavy', 'heavyPressed']), emptyInput());
    for (let i = 0; i < 40 && m.phase === 'fight'; i++) stepMatch(m, emptyInput(), emptyInput());
    expect(m.phase).toBe('ko');
    expect(m.finisher).toBeNull();
  });

  it('plays the Finisher Builder panel on a signature kill and lets the loser skip it', () => {
    const m = lastStock(config({ custom: [{ name: 'Test Panel', parts: { opener: 'lift', beat: 'slam', punchline: 'panel' } }, null] }));
    stepMatch(m, press(['heavy', 'heavyPressed']), emptyInput());
    for (let i = 0; i < 40 && m.phase !== 'finisher'; i++) stepMatch(m, emptyInput(), emptyInput());
    expect(m.phase).toBe('finisher');
    expect(m.finisher?.kind).toBe('custom');
    expect(m.finisher?.duration).toBe(260);
    for (let i = 0; i < 20; i++) stepMatch(m, emptyInput(), emptyInput());
    stepMatch(m, emptyInput(), press(['lightPressed']));
    expect(m.finisher?.skipped).toBe(false);
    for (let i = 0; i < 20; i++) stepMatch(m, emptyInput(), emptyInput());
    stepMatch(m, emptyInput(), press(['lightPressed']));
    expect(m.finisher?.skipped).toBe(true);
    stepMatch(m, emptyInput(), emptyInput());
    expect(m.phase).toBe('over');
    expect(m.winner).toBe(0);
  });

  it('Null\'s super corrupts the HUD and armour breaks to a heavy', () => {
    const m = lastStock(config({ playerChar: 'null', cpuChar: 'kestrel', unlocked: [1, 1] }));
    m.fighters[1].hp = 100;
    m.fighters[1].stocks = 3;
    stepMatch(m, press(['superPressed']), emptyInput());
    for (let i = 0; i < 90; i++) stepMatch(m, emptyInput(), emptyInput());
    expect(m.uiCorrupt).toBeGreaterThan(0);
  });
});
