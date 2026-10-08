import { describe, it, expect, beforeEach } from 'vitest';
import { Input, applyDeadzone } from '../src/core/input';
import { FightInput, stickDir, type FightButton, type FightContext, type FightSample, type FightIntent } from '../src/core/fightinput';

// ------------------------------------------------------------ fake gamepad

const fake = {
  id: 'Xbox Wireless Controller (STANDARD GAMEPAD Vendor: 045e)',
  index: 0,
  connected: true,
  mapping: 'standard',
  axes: [0, 0, 0, 0],
  buttons: Array.from({ length: 17 }, () => ({ pressed: false, value: 0 })),
};
let pads: (typeof fake | null)[] = [fake];
Object.defineProperty(globalThis.navigator, 'getGamepads', { configurable: true, value: () => pads });
const setBtn = (i: number, v: number) => (fake.buttons[i] = { pressed: v > 0.5, value: v });

describe('input', () => {
  beforeEach(() => {
    pads = [fake];
    fake.axes = [0, 0, 0, 0];
    fake.buttons.forEach((_, i) => setBtn(i, 0));
  });

  it('radial deadzone rescales from the edge', () => {
    expect(applyDeadzone(0.1, 0.1, 0.2)).toEqual({ x: 0, y: 0 });
    const v = applyDeadzone(1, 0, 0.2);
    expect(v.x).toBeCloseTo(1);
    expect(applyDeadzone(0.6, 0, 0.2).x).toBeCloseTo(0.5);
  });

  it('reports press edges once, held state, actions and hot-plug', () => {
    const inp = new Input();
    const events: string[] = [];
    inp.on('connect', () => events.push('connect'));
    inp.on('disconnect', () => events.push('disconnect'));
    inp.on('press', (e) => events.push(`press:${e.button}:${e.actions.join(',')}`));
    inp.update();
    expect(inp.connected).toBe(true);
    setBtn(0, 1);
    inp.update();
    expect(inp.pressed('confirm')).toBe(true);
    expect(inp.lastDevice).toBe('gamepad');
    inp.update();
    expect(inp.pressed('confirm')).toBe(false);
    expect(inp.down('confirm')).toBe(true);
    setBtn(0, 0);
    inp.update();
    expect(inp.released('confirm')).toBe(true);
    pads = [];
    inp.update();
    expect(inp.connected).toBe(false);
    expect(events).toEqual(['connect', 'press:A:confirm', 'disconnect']);
  });

  it('triggers are analog with hysteresis; sticks get the deadzone', () => {
    const inp = new Input();
    setBtn(7, 0.4);
    inp.update();
    expect(inp.button('RT')).toBe(false);
    expect(inp.trigger('RT')).toBeGreaterThan(0.3);
    setBtn(7, 0.6);
    inp.update();
    expect(inp.buttonPressed('RT')).toBe(true);
    setBtn(7, 0.4); // above the release threshold: still down
    inp.update();
    expect(inp.button('RT')).toBe(true);
    fake.axes = [0.1, 0.05, 0, 0.9];
    inp.update();
    expect(inp.stick('left')).toEqual({ x: 0, y: 0 });
    expect(inp.stick('look').y).toBeGreaterThan(0.8);
  });

  it('rebinding an action', () => {
    const inp = new Input();
    inp.bind('confirm', [{ pad: 'X' }]);
    inp.update();
    setBtn(2, 1);
    inp.update();
    expect(inp.pressed('confirm')).toBe(true);
    expect(inp.getBindings('confirm')).toEqual([{ pad: 'X' }]);
  });
});

// ------------------------------------------------------------ fight interpreter

const DT = 1 / 60;
function sample(held: FightButton[] = [], move = { x: 0, y: 0 }, look = { x: 0, y: 0 }, pressure: Partial<Record<FightButton, number>> = {}): FightSample {
  return { held: new Set(held), move, look, pressure };
}
function run(fi: FightInput, s: FightSample, seconds: number, ctx: FightContext): FightIntent[] {
  const out: FightIntent[] = [];
  for (let t = 0; t < seconds - 1e-9; t += DT) out.push(...fi.update(s, DT, ctx));
  return out;
}

describe('fight input', () => {
  const ctx: FightContext = { facing: 1 };

  it('stick directions are relative to facing', () => {
    expect(stickDir({ x: 1, y: 0 }, 1)).toBe('toward');
    expect(stickDir({ x: 1, y: 0 }, -1)).toBe('away');
    expect(stickDir({ x: 0, y: 1 }, 1)).toBe('down');
    expect(stickDir({ x: 0.2, y: 0.1 }, 1)).toBe('neutral');
  });

  it('tap = light jab, long hold with stick toward = heavy hook, down+toward = uppercut, down = body, up = overhand', () => {
    const fi = new FightInput();
    run(fi, sample(['lead']), 0.08, ctx);
    const a = run(fi, sample(), DT, ctx);
    expect(a).toMatchObject([{ type: 'punch', hand: 'lead', punch: 'jab', weight: 'light' }]);

    const left: FightContext = { facing: -1 };
    run(fi, sample(['rear'], { x: -1, y: 0 }), 0.5, left);
    expect(run(fi, sample(), DT, left)).toMatchObject([{ type: 'punch', hand: 'rear', punch: 'hook', weight: 'heavy' }]);

    run(fi, sample(['rear'], { x: 0.8, y: 0.8 }), 0.25, ctx);
    expect(run(fi, sample(), DT, ctx)).toMatchObject([{ punch: 'uppercut', weight: 'medium' }]);
    run(fi, sample(['rear'], { x: 0, y: 1 }), 0.25, ctx);
    expect(run(fi, sample(), DT, ctx)).toMatchObject([{ punch: 'bodyStraight', weight: 'medium' }]);
    run(fi, sample(['rear'], { x: 0, y: -1 }), 0.05, ctx);
    expect(run(fi, sample(), DT, ctx)).toMatchObject([{ punch: 'overhand', weight: 'light' }]);
    run(fi, sample(['lead'], { x: 0, y: -1 }), 0.05, ctx);
    expect(run(fi, sample(), DT, ctx)).toMatchObject([{ punch: 'hook', weight: 'light' }]);
  });

  it('block: the guard comes up on press (a press also parries); release drops it', () => {
    const fi = new FightInput();
    const tap = [...run(fi, sample(['block']), 0.06, ctx), ...run(fi, sample(), DT, ctx)];
    expect(tap).toEqual([{ type: 'parry' }, { type: 'block', phase: 'start' }, { type: 'block', phase: 'end' }]);
    const hold = [...run(fi, sample(['block']), 0.4, ctx), ...run(fi, sample(), DT, ctx)];
    expect(hold).toEqual([{ type: 'parry' }, { type: 'block', phase: 'start' }, { type: 'block', phase: 'end' }]);
  });

  it('grab: hold = clinch / shoot (toward), tap while being shot = sprawl', () => {
    const fi = new FightInput();
    expect(run(fi, sample(['grab']), 0.4, ctx)).toEqual([{ type: 'clinch' }]);
    run(fi, sample(), DT, ctx);
    expect(run(fi, sample(['grab'], { x: 1, y: 0 }), 0.4, ctx)).toEqual([{ type: 'shoot' }]);
    run(fi, sample(), DT, ctx);
    const shot = { facing: 1 as const, beingShot: true };
    expect([...run(fi, sample(['grab']), 0.1, shot), ...run(fi, sample(), DT, shot)]).toEqual([{ type: 'sprawl' }]);
  });

  it('right-stick flick = head movement; a slow push is not a flick', () => {
    const fi = new FightInput();
    run(fi, sample(), 0.1, ctx);
    expect(run(fi, sample([], undefined, { x: 0, y: 1 }), 0.1, ctx)).toEqual([{ type: 'evade', kind: 'roll', source: 'flick' }]);
    run(fi, sample(), 0.1, ctx);
    expect(run(fi, sample([], undefined, { x: -1, y: 0 }), 0.1, ctx)).toEqual([{ type: 'evade', kind: 'pull', source: 'flick' }]);
    run(fi, sample(), 0.1, ctx);
    const slow: FightIntent[] = [];
    for (let i = 0; i <= 30; i++) slow.push(...fi.update(sample([], undefined, { x: 0, y: -i / 30 }), DT, ctx));
    expect(slow).toEqual([]);
  });

  it('kick level by stick; on the ground the same button picks a position move', () => {
    const fi = new FightInput();
    expect(run(fi, sample(['kick'], { x: 0, y: -1 }), DT, ctx)).toEqual([{ type: 'kick', level: 'head' }]);
    run(fi, sample(), DT, ctx);
    const g = { facing: 1 as const, grounded: true };
    expect(run(fi, sample(['kick'], { x: 1, y: 0 }), DT, g)).toEqual([{ type: 'ground', move: 'advance' }]);
    run(fi, sample(), DT, g);
    expect(run(fi, sample(['kick'], { x: 0, y: -1 }), DT, g)).toEqual([{ type: 'ground', move: 'standup' }]);
  });

  it('submission: stick rotation counts quarter turns, presses count as mashing', () => {
    const fi = new FightInput();
    const sub: FightContext = { facing: 1, submission: 'defend' };
    const out: FightIntent[] = [];
    for (let i = 0; i <= 33; i++) { // a touch over one full turn
      const a = (i / 32) * Math.PI * 2;
      out.push(...fi.update(sample([], { x: Math.cos(a), y: Math.sin(a) }), DT, sub));
    }
    expect(out.filter((i) => i.type === 'subTurn')).toHaveLength(4);
    for (let i = 0; i < 5; i++) {
      out.push(...run(fi, sample(['kick']), DT, sub), ...run(fi, sample(), DT, sub));
    }
    const mash = out.filter((i) => i.type === 'mash');
    expect(mash).toHaveLength(5);
    expect(fi.submissionState.mashRate).toBe(5);
  });

  it('get-up: alternating triggers in rhythm, the same trigger twice fumbles', () => {
    const fi = new FightInput();
    const kd: FightContext = { facing: 1, knockedDown: true };
    const press = (b: FightButton, gap: number) => [...run(fi, sample([b]), DT, kd), ...run(fi, sample(), gap, kd)];
    const out = [...press('getupLeft', 0.3), ...press('getupRight', 0.3), ...press('getupRight', 0.3)];
    expect(out[0]).toMatchObject({ type: 'getup', side: 'left' });
    expect(out[1]).toMatchObject({ type: 'getup', side: 'right', rhythm: 1 });
    expect(out[2]).toEqual({ type: 'getupFumble' });
  });

  it('remapping is data', () => {
    const fi = new FightInput();
    fi.bind('lead', { pad: ['X'], keys: ['KeyF'] });
    expect(fi.bindings.lead.pad).toEqual(['X']);
  });
});
