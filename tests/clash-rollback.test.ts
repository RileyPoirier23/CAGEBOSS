import { describe, expect, it } from 'vitest';
import { NetSim, Rollback, packInput, unpackInput } from '../src/clash/rollback';
import { ClashSession } from '../src/clash/session';
import { checksumMatch, createMatch } from '../src/clash/sim';
import { CHAR_IDS, emptyInput } from '../src/clash/types';
import type { CharId, InputFrame, MatchConfig } from '../src/clash/types';

function config(a: CharId, b: CharId, seed = 31): MatchConfig {
  return {
    stageId: 'rooftop',
    mode: 'casual',
    seed,
    stocks: 2,
    timerTicks: 60 * 60 * 2,
    gearBuffs: false,
    playerChar: a,
    cpuChar: b,
    cpuLevel: 4,
    modern: false,
    gear: [{}, {}],
    training: false,
  };
}

function inputAt(t: number, salt: number): InputFrame {
  const i = emptyInput();
  const n = t + salt;
  if (n % 84 < 42) i.right = true; else i.left = true;
  if (n % 41 === 0) { i.jump = true; i.jumpPressed = true; }
  if (n % 27 === 0) { i.light = true; i.lightPressed = true; }
  if (n % 103 === 0) { i.heavy = true; i.heavyPressed = true; }
  if (n % 67 === 0) { i.dodge = true; i.dodgePressed = true; }
  return i;
}

describe('input packing', () => {
  it('round-trips every flag', () => {
    const i = emptyInput();
    i.left = true; i.heavy = true; i.superPressed = true; i.drive = true; i.jumpPressed = true;
    expect(unpackInput(packInput(i))).toEqual(i);
    expect(packInput(emptyInput())).toBe(0);
  });
});

describe('rollback core', () => {
  it('re-simulates a late input to the same state as knowing it on time', () => {
    const honest = new Rollback(createMatch(config('kestrel', 'null')), { delay: 1 });
    const late = new Rollback(createMatch(config('kestrel', 'null')), { delay: 1 });
    const pending: [number, number][] = [];
    for (let t = 0; t < 400; t++) {
      const a = packInput(inputAt(t, 0));
      const b = packInput(inputAt(t, 9));
      honest.addInput(0, honest.stampTick, a);
      honest.addInput(1, honest.stampTick, b);
      honest.step();
      // the late peer only learns player 1's input five ticks after the fact
      late.addInput(0, late.stampTick, a);
      pending.push([late.stampTick, b]);
      late.step();
      while (pending.length && pending[0][0] <= late.tick - 5) {
        const [tk, v] = pending.shift()!;
        late.addInput(1, tk, v);
      }
    }
    for (const [tk, v] of pending) late.addInput(1, tk, v);
    expect(late.rollbacks).toBeGreaterThan(0);
    expect(late.tick).toBe(honest.tick);
    expect(checksumMatch(late.state)).toBe(checksumMatch(honest.state));
    expect(JSON.stringify(late.state)).toBe(JSON.stringify(honest.state));
    expect(late.confirmed).toBe(late.tick);
  });

  it('exports a replay that re-simulates to the same checksum', () => {
    const cfg = config('pip', 'queen', 77);
    const live = new ClashSession(cfg, { localSide: 0, cpu: true, cpuLevel: 4, delay: 1 });
    for (let t = 0; t < 600; t++) live.step(inputAt(t, 3));
    const rep = live.exportReplay();
    const back = new ClashSession(rep.cfg, { localSide: 0, cpu: false, delay: 0 });
    const cursor = { i: 0 };
    while (back.tick < rep.ticks) back.stepReplay(rep.inputs, cursor);
    expect(checksumMatch(back.match)).toBe(checksumMatch(live.match));
  });
});

describe('netplay simulation', () => {
  it('keeps two peers in sync across a jittery wire', () => {
    const cfg = config('brickhouse', 'halo', 5);
    const net = new NetSim(() => createMatch(cfg), { delay: 2, ping: 120, jitter: 40 });
    let now = 0;
    for (let t = 0; t < 900; t++) {
      net.localInput(0, inputAt(t, 1), now);
      net.localInput(1, inputAt(t, 23), now);
      now += 1000 / 60;
      net.deliver(now);
      net.advance();
    }
    for (let i = 0; i < 60; i++) { now += 50; net.deliver(now); net.advance(); }
    expect(net.desync).toBe(false);
    expect(net.peers[0].rollbacks + net.peers[1].rollbacks).toBeGreaterThan(0);
    expect(Math.abs(net.peers[0].tick - net.peers[1].tick)).toBeLessThan(30);
    const c = Math.min(net.peers[0].confirmed, net.peers[1].confirmed);
    expect(net.peers[0].checksumAt(c)).toBe(net.peers[1].checksumAt(c));
  });
});

describe('every pairing is deterministic', () => {
  it('replays identically for all 64 matchups', () => {
    for (const a of CHAR_IDS) {
      for (const b of CHAR_IDS) {
        const cfg = config(a, b, 1000 + CHAR_IDS.indexOf(a) * 8 + CHAR_IDS.indexOf(b));
        const x = new ClashSession(cfg, { spectator: true, cpuLevel: 5, delay: 1 });
        const y = new ClashSession(cfg, { spectator: true, cpuLevel: 5, delay: 1 });
        for (let t = 0; t < 700; t++) { x.step(emptyInput()); y.step(emptyInput()); }
        expect(checksumMatch(x.match)).toBe(checksumMatch(y.match));
      }
    }
  });
});
