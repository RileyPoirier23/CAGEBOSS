/* UNIVERSE CLASH - the session.
   A fixed 60 Hz loop with a snapshot ring. Local play uses the same path a
   rollback netcode match would: inputs are stamped by tick, every simulated
   tick is captured, and a late input can restore a snapshot and replay.
   Nothing here touches the DOM. */

import { AiBrain, aiInput, createAi, resetAi } from './ai';
import { cloneMatch, createMatch, drainEvents, stepMatch, TICK_RATE } from './sim';
import type { CharId, InputFrame, MatchConfig, MatchEvent, MatchState } from './types';
import { emptyInput } from './types';

export interface SessionOptions {
  localSide?: 0 | 1;
  cpu?: boolean;
  spectator?: boolean;
  cpuLevel?: number;
  seed?: number;
  /** favour the CPU's dodge/parry reads (rival memory). 0..1 */
  read?: number;
}

export interface SessionSnapshot {
  tick: number;
  match: MatchState;
  brains: [AiBrain, AiBrain];
}

export interface AdvanceResult {
  alpha: number;
  ticks: number;
  events: MatchEvent[];
}

export class ClashSession {
  match: MatchState;
  brains: [AiBrain, AiBrain];
  localSide: 0 | 1;
  cpuEnabled: boolean;
  spectator: boolean;
  read: number;
  /** The opening rules, kept so a restart does not inherit the end-of-match clock. */
  config: MatchConfig;
  events: MatchEvent[] = [];
  history = new Map<number, SessionSnapshot>();
  private accumulator = 0;
  private p2: InputFrame | null = null;

  constructor(config: MatchConfig, opts: SessionOptions = {}) {
    this.match = createMatch(config);
    this.config = {
      ...config,
      gear: [config.gear[0], config.gear[1]],
    };
    this.localSide = opts.localSide ?? 0;
    this.cpuEnabled = opts.cpu ?? true;
    this.spectator = opts.spectator ?? false;
    this.read = Math.max(0, Math.min(1, opts.read ?? 0));
    const seed = opts.seed ?? config.seed;
    const read = this.read;
    const ai0 = opts.spectator || this.localSide === 1;
    const ai1 = opts.spectator || this.localSide === 0;
    this.brains = [
      createAi(0, opts.cpuLevel ?? config.cpuLevel, seed + 17, ai0 ? read : 0),
      createAi(1, opts.cpuLevel ?? config.cpuLevel, seed + 29, ai1 ? read : 0),
    ];
    this.capture();
  }

  get tick(): number {
    return this.match.tick;
  }

  get over(): boolean {
    return this.match.phase === 'over';
  }

  setP2(input: InputFrame | null): void {
    this.p2 = input;
  }

  /** Inputs for this tick. The CPU side reads the match, never the clock. */
  inputs(localInput: InputFrame): [InputFrame, InputFrame] {
    let i0: InputFrame;
    let i1: InputFrame;
    if (this.spectator) {
      i0 = aiInput(this.brains[0], this.match);
      i1 = aiInput(this.brains[1], this.match);
    } else if (this.localSide === 1) {
      i0 = this.cpuEnabled ? aiInput(this.brains[0], this.match) : emptyInput();
      i1 = localInput;
    } else {
      i0 = localInput;
      i1 = this.cpuEnabled ? aiInput(this.brains[1], this.match) : (this.p2 ?? emptyInput());
    }
    return [i0, i1];
  }

  /** Simulate one tick. Returns the events produced by it. */
  step(localInput: InputFrame): MatchEvent[] {
    if (this.match.phase === 'over') return [];
    const [i0, i1] = this.inputs(localInput);
    this.capture();
    stepMatch(this.match, i0, i1);
    const ev = drainEvents(this.match);
    this.events.push(...ev);
    if (this.events.length > 400) this.events.splice(0, this.events.length - 400);
    return ev;
  }

  /** Real-time advance with interpolation alpha. */
  advance(dt: number, localInput: InputFrame): AdvanceResult {
    this.accumulator += Math.min(0.25, Math.max(0, dt));
    const step = 1 / TICK_RATE;
    let ticks = 0;
    const events: MatchEvent[] = [];
    while (this.accumulator >= step && ticks < 6) {
      events.push(...this.step(localInput));
      this.accumulator -= step;
      ticks++;
      if (this.match.phase === 'over') break;
    }
    return { alpha: this.accumulator / step, ticks, events };
  }

  /** Stop the accumulator from dumping a long pause into the sim. */
  dropAccumulator(): void {
    this.accumulator = 0;
  }

  capture(): SessionSnapshot {
    const snap: SessionSnapshot = {
      tick: this.match.tick,
      match: cloneMatch(this.match),
      brains: [
        { ...this.brains[0], lastHeavy: this.brains[0].lastHeavy },
        { ...this.brains[1], lastHeavy: this.brains[1].lastHeavy },
      ],
    };
    this.history.set(this.match.tick, snap);
    while (this.history.size > 150) {
      const first = this.history.keys().next();
      if (first.done) break;
      this.history.delete(first.value);
    }
    return snap;
  }

  restore(snap: SessionSnapshot): void {
    this.match = cloneMatch(snap.match);
    this.brains = [
      { ...snap.brains[0] },
      { ...snap.brains[1] },
    ];
    this.accumulator = 0;
  }

  snapshotAt(tick: number): SessionSnapshot | null {
    return this.history.get(tick) ?? null;
  }

  /** Roll back to the newest snapshot at or before `tick`, then replay. */
  rollback(tick: number, inputs: Map<number, [InputFrame, InputFrame]>): void {
    let best: SessionSnapshot | null = null;
    for (const [t, s] of this.history) {
      if (t <= tick && (!best || t > best.tick)) best = s;
    }
    if (!best) return;
    this.restore(best);
    while (this.match.tick < tick && this.match.phase !== 'over') {
      const pair = inputs.get(this.match.tick);
      if (!pair) break;
      this.capture();
      stepMatch(this.match, pair[0], pair[1]);
      drainEvents(this.match);
    }
  }

  /** A local prediction check: rollback and replay a list of stamped inputs. */
  replay(fromTick: number, inputs: Map<number, [InputFrame, InputFrame]>): void {
    this.rollback(fromTick, inputs);
  }

  restart(cpuLevel?: number): void {
    const cfg: MatchConfig = {
      ...this.config,
      cpuLevel: cpuLevel ?? this.brains[0].level,
      gear: [this.config.gear[0], this.config.gear[1]],
    };
    this.match = createMatch(cfg);
    resetAi(this.brains[0], cfg.cpuLevel, cfg.seed + 17, this.read);
    resetAi(this.brains[1], cfg.cpuLevel, cfg.seed + 29, this.read);
    this.history.clear();
    this.events = [];
    this.capture();
  }

  /** Build a fresh session from a match (used by rematches). */
  static fromMatch(match: MatchState, localSide: 0 | 1 = 0, cpu = true, level = 3): ClashSession {
    const cfg: MatchConfig = {
      stageId: match.stageId,
      mode: match.mode,
      seed: match.seed,
      stocks: match.fighters[0].stocks,
      timerTicks: match.timer,
      gearBuffs: match.gearBuffs,
      playerChar: match.fighters[0].char,
      cpuChar: match.fighters[1].char,
      cpuLevel: level,
      modern: false,
      gear: [match.fighters[0].gear, match.fighters[1].gear],
      training: match.training,
    };
    return new ClashSession(cfg, { localSide, cpu: cpu ? true : false, cpuLevel: level });
  }

  /** A tiny presentation helper: who is currently ahead on stocks/damage. */
  leader(): 0 | 1 | -1 {
    const [a, b] = this.match.fighters;
    if (a.stocks !== b.stocks) return a.stocks > b.stocks ? 0 : 1;
    if (a.hp !== b.hp) return a.hp > b.hp ? 0 : 1;
    return -1;
  }

  setChars(player: CharId, cpu: CharId): void {
    const m = this.match;
    if (m.fighters[0].char === player && m.fighters[1].char === cpu) return;
    const cfg: MatchConfig = {
      ...this.config,
      playerChar: player,
      cpuChar: cpu,
      gear: [m.fighters[0].gear, m.fighters[1].gear],
    };
    this.config = cfg;
    this.match = createMatch(cfg);
    this.history.clear();
    this.capture();
  }
}

export { TICK_RATE };
