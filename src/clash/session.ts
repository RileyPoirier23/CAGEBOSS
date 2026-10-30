/* UNIVERSE CLASH - the session.
   A fixed 60 Hz match on top of the rollback core. Local play, the CPU, the
   attract mode and replays all go through the same path: inputs are stamped
   by tick, every simulated tick is snapshotted, and a late input can restore
   a snapshot and replay. Nothing here touches the DOM. */

import { AiBrain, aiInput, createAi, resetAi } from './ai';
import { Rollback, packInput, type ReplayFile } from './rollback';
import { createMatch, TICK_RATE } from './sim';
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
  /** Ticks of input buffering. 0 = low latency, 1 = default. */
  delay?: number;
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

const HISTORY = 150;

export class ClashSession {
  core: Rollback;
  brains: [AiBrain, AiBrain];
  localSide: 0 | 1;
  cpuEnabled: boolean;
  spectator: boolean;
  read: number;
  delay: number;
  /** The opening rules, kept so a restart does not inherit the end-of-match clock. */
  config: MatchConfig;
  events: MatchEvent[] = [];
  history = new Map<number, SessionSnapshot>();
  private accumulator = 0;
  private p2: InputFrame | null = null;

  constructor(config: MatchConfig, opts: SessionOptions = {}) {
    this.config = {
      ...config,
      gear: [config.gear[0], config.gear[1]],
    };
    this.delay = Math.max(0, Math.min(8, opts.delay ?? 0));
    this.core = new Rollback(createMatch(config), { delay: this.delay, maxRollback: HISTORY });
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

  get match(): MatchState {
    return this.core.state;
  }

  get tick(): number {
    return this.core.state.tick;
  }

  get over(): boolean {
    return this.core.state.phase === 'over';
  }

  get rollbacks(): number {
    return this.core.rollbacks;
  }

  get resimFrames(): number {
    return this.core.resimFrames;
  }

  get confirmed(): number {
    return this.core.confirmed;
  }

  setP2(input: InputFrame | null): void {
    this.p2 = input;
  }

  /** Inputs for this tick. The CPU side reads the match, never the clock. */
  inputs(localInput: InputFrame): [InputFrame, InputFrame] {
    const m = this.core.state;
    let i0: InputFrame;
    let i1: InputFrame;
    if (this.spectator) {
      i0 = aiInput(this.brains[0], m);
      i1 = aiInput(this.brains[1], m);
    } else if (this.localSide === 1) {
      i0 = this.cpuEnabled ? aiInput(this.brains[0], m) : emptyInput();
      i1 = localInput;
    } else {
      i0 = localInput;
      i1 = this.cpuEnabled ? aiInput(this.brains[1], m) : (this.p2 ?? emptyInput());
    }
    return [i0, i1];
  }

  private stepCore(): MatchEvent[] {
    const ev = this.core.step();
    this.capture();
    this.events.push(...ev);
    if (this.events.length > 400) this.events.splice(0, this.events.length - 400);
    return ev;
  }

  /** Simulate one tick. Returns the events produced by it. */
  step(localInput: InputFrame): MatchEvent[] {
    if (this.over) return [];
    const [i0, i1] = this.inputs(localInput);
    const t = this.core.stampTick;
    this.core.addInput(0, t, packInput(i0));
    this.core.addInput(1, t, packInput(i1));
    return this.stepCore();
  }

  /** Simulate one tick of a replay: feed every logged input due by now, then step. */
  stepReplay(log: ReplayFile['inputs'], cursor: { i: number }): MatchEvent[] {
    if (this.over) return [];
    const t = this.core.stampTick;
    while (cursor.i < log.length && log[cursor.i][0] <= t) {
      const [tick, player, packed] = log[cursor.i++];
      this.core.addInput(player as 0 | 1, tick, packed);
    }
    return this.stepCore();
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
      if (this.over) break;
    }
    return { alpha: this.accumulator / step, ticks, events };
  }

  /** Stop the accumulator from dumping a long pause into the sim. */
  dropAccumulator(): void {
    this.accumulator = 0;
  }

  /** The state one tick back, for render interpolation. */
  get prevState(): MatchState {
    return this.core.prevState;
  }

  capture(): SessionSnapshot {
    const tick = this.core.state.tick;
    const snap: SessionSnapshot = {
      tick,
      match: this.core.snaps.get(tick) ?? this.core.state,
      brains: [{ ...this.brains[0] }, { ...this.brains[1] }],
    };
    this.history.set(tick, snap);
    while (this.history.size > HISTORY) {
      const first = this.history.keys().next();
      if (first.done) break;
      this.history.delete(first.value);
    }
    return snap;
  }

  snapshotAt(tick: number): SessionSnapshot | null {
    return this.history.get(tick) ?? null;
  }

  /** Stand on the snapshot at `tick` and forget everything after it. */
  rollback(tick: number, _inputs?: Map<number, [InputFrame, InputFrame]>): void {
    void _inputs;
    let best: SessionSnapshot | null = null;
    for (const [t, s] of this.history) {
      if (t <= tick && (!best || t > best.tick)) best = s;
    }
    if (!best) return;
    if (!this.core.rewindTo(best.tick)) return;
    this.brains = [{ ...best.brains[0] }, { ...best.brains[1] }];
    for (const t of Array.from(this.history.keys())) if (t > best.tick) this.history.delete(t);
    this.accumulator = 0;
  }

  /** A local prediction check: rollback and replay a list of stamped inputs. */
  replay(fromTick: number, inputs: Map<number, [InputFrame, InputFrame]>): void {
    this.rollback(fromTick, inputs);
  }

  exportReplay(): ReplayFile {
    return this.core.exportReplay(this.config);
  }

  restart(cpuLevel?: number): void {
    const cfg: MatchConfig = {
      ...this.config,
      cpuLevel: cpuLevel ?? this.brains[0].level,
      gear: [this.config.gear[0], this.config.gear[1]],
    };
    this.core = new Rollback(createMatch(cfg), { delay: this.delay, maxRollback: HISTORY });
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
    this.core = new Rollback(createMatch(cfg), { delay: this.delay, maxRollback: HISTORY });
    this.history.clear();
    this.capture();
  }
}

export { TICK_RATE };
