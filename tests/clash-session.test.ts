import { describe, expect, it } from 'vitest';
import { ClashSession } from '../src/clash/session';
import { createAi, resetAi } from '../src/clash/ai';
import { createMatch } from '../src/clash/sim';
import { emptyInput } from '../src/clash/types';
import type { InputFrame, MatchConfig } from '../src/clash/types';

function config(over: Partial<MatchConfig> = {}): MatchConfig {
  return {
    stageId: 'rooftop',
    mode: 'casual',
    seed: 4242,
    stocks: 3,
    timerTicks: 4 * 60 * 60,
    gearBuffs: false,
    playerChar: 'kestrel',
    cpuChar: 'mireille',
    cpuLevel: 3,
    modern: false,
    gear: [{}, {}],
    training: false,
    ...over,
  };
}

function inputAt(t: number, salt = 0): InputFrame {
  const i = emptyInput();
  const n = t + salt;
  if (n % 84 < 42) i.right = true;
  else i.left = true;
  if (n % 41 === 0) {
    i.jump = true;
    i.jumpPressed = true;
  }
  if (n % 27 === 0) {
    i.light = true;
    i.lightPressed = true;
  }
  if (n % 103 === 0) {
    i.heavy = true;
    i.heavyPressed = true;
  }
  if (n % 67 === 0) {
    i.dodge = true;
    i.dodgePressed = true;
  }
  if (n % 151 === 0) {
    i.drive = true;
    i.drivePressed = true;
  }
  return i;
}

describe('universe clash session', () => {
  it('is deterministic with two CPU brains on the same seed', () => {
    const cfg = config();
    const a = new ClashSession(cfg, { spectator: true, seed: cfg.seed, cpuLevel: 3, read: 0.4 });
    const b = new ClashSession(cfg, { spectator: true, seed: cfg.seed, cpuLevel: 3, read: 0.4 });
    for (let t = 0; t < 420; t++) {
      a.step(emptyInput());
      b.step(emptyInput());
    }
    expect(JSON.stringify(a.match)).toBe(JSON.stringify(b.match));
    expect(JSON.stringify(a.brains)).toBe(JSON.stringify(b.brains));
    expect(a.match.tick).toBeGreaterThan(0);
  });

  it('gives rival memory to the CPU side only', () => {
    const solo = new ClashSession(config(), { localSide: 0, read: 0.8 });
    expect(solo.brains[0].read).toBe(0);
    expect(solo.brains[1].read).toBe(0.8);

    const flipped = new ClashSession(config(), { localSide: 1, read: 0.35 });
    expect(flipped.brains[0].read).toBe(0.35);
    expect(flipped.brains[1].read).toBe(0);

    const watch = new ClashSession(config(), { spectator: true, read: 0.65 });
    expect(watch.brains[0].read).toBe(0.65);
    expect(watch.brains[1].read).toBe(0.65);
  });

  it('clamps and keeps the read on an AI brain through a reset', () => {
    const brain = createAi(0, 9, 12, 4);
    expect(brain.level).toBe(5);
    expect(brain.read).toBe(1);
    resetAi(brain, 2, 99);
    expect(brain.level).toBe(2);
    expect(brain.seed).toBe(99);
    expect(brain.read).toBe(1);
    resetAi(brain, 2, 99, 0.25);
    expect(brain.read).toBe(0.25);
  });

  it('rolls back to a snapshot and replays the same inputs to the same state', () => {
    const session = new ClashSession(config(), { localSide: 0, cpu: false });
    const pairs = new Map<number, [InputFrame, InputFrame]>();
    for (let t = 0; t < 180; t++) {
      const local = inputAt(t);
      const p2 = inputAt(t, 19);
      pairs.set(t, [local, p2]);
      session.setP2(p2);
      session.step(local);
    }
    const finalState = JSON.stringify(session.match);
    const finalTick = session.match.tick;
    expect(finalTick).toBe(180);

    session.rollback(60, pairs);
    expect(session.match.tick).toBe(60);
    for (let t = 60; t < 180; t++) {
      const pair = pairs.get(t)!;
      session.setP2(pair[1]);
      session.step(pair[0]);
    }
    expect(session.match.tick).toBe(finalTick);
    expect(JSON.stringify(session.match)).toBe(finalState);
  });

  it('replays from a stamped input log', () => {
    const session = new ClashSession(config({ seed: 808 }), { localSide: 0, cpu: false });
    const pairs = new Map<number, [InputFrame, InputFrame]>();
    for (let t = 0; t < 90; t++) {
      const local = inputAt(t, 3);
      const p2 = inputAt(t, 29);
      pairs.set(t, [local, p2]);
      session.setP2(p2);
      session.step(local);
    }
    const finalState = JSON.stringify(session.match);
    session.replay(30, pairs);
    expect(session.match.tick).toBe(30);
    for (let t = 30; t < 90; t++) {
      const pair = pairs.get(t)!;
      session.setP2(pair[1]);
      session.step(pair[0]);
    }
    expect(JSON.stringify(session.match)).toBe(finalState);
  });

  it('restarts from the opening rules, not the end-of-match clock', () => {
    const cfg = config({ timerTicks: 90 * 60 });
    const session = new ClashSession(cfg, { cpu: false });
    for (let t = 0; t < 160; t++) session.step(inputAt(t));
    expect(session.match.timer).toBeLessThan(cfg.timerTicks);
    session.restart();
    expect(session.match.tick).toBe(0);
    expect(session.match.phase).toBe('intro');
    expect(session.match.timer).toBe(cfg.timerTicks);
    expect(session.match.fighters[0].stocks).toBe(cfg.stocks);
    expect(session.events).toHaveLength(0);
    expect(JSON.stringify(session.match)).toBe(
      JSON.stringify(createMatch({ ...cfg, cpuLevel: session.brains[0].level })),
    );
  });

  it('keeps a bounded snapshot ring', () => {
    const session = new ClashSession(config(), { spectator: true, cpuLevel: 1 });
    for (let t = 0; t < 240; t++) session.step(emptyInput());
    expect(session.history.size).toBeLessThanOrEqual(150);
    expect(session.snapshotAt(session.match.tick - 1)).not.toBeNull();
    expect(session.snapshotAt(0)).toBeNull();
    expect(session.snapshotAt(120)).not.toBeNull();
  });

  it('keeps the match serialisable (rollback state is plain data)', () => {
    const session = new ClashSession(config(), { spectator: true, cpuLevel: 3 });
    for (let t = 0; t < 200; t++) session.step(emptyInput());
    const snap = session.snapshotAt(session.match.tick - 10)!;
    const copy = JSON.parse(JSON.stringify(snap));
    expect(copy.match.tick).toBe(snap.match.tick);
    expect(copy.brains).toHaveLength(2);
  });
});
