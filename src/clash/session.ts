/* UNIVERSE CLASH - the session.
   A fixed 60 Hz match on top of the rollback core. Local play, the CPU, the
   attract mode and replays all go through the same path: inputs are stamped
   by tick, every simulated tick is snapshotted, and a late input can restore
   a snapshot and replay. Nothing here touches the DOM.

   A session seats as many fighters as the match has. Side 0 is the local
   player unless the session is a spectator feed; side 1 can be a second set
   of keys (local 2P); every other seat is a CPU brain. */

import { AiBrain, aiInput, createAi, resetAi } from './ai';
import { Rollback, packInput, type ReplayFile } from './rollback';
import { createMatch, TICK_RATE } from './sim';
import type { CharId, InputFrame, MatchConfig, MatchEvent, MatchState } from './types';
import { emptyInput } from './types';

export interface SessionOptions {
  localSide?: number;
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
  brains: AiBrain[];
}

export interface AdvanceResult {
  alpha: number;
  ticks: number;
  events: MatchEvent[];
}

const HISTORY = 150;

export class ClashSession {
  core: Rollback;
  brains: AiBrain[];
  localSide: number;
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
      gear: config.gear.slice(),
    };
    this.delay = Math.max(0, Math.min(8, opts.delay ?? 0));
    this.core = new Rollback(createMatch(config), { delay: this.delay, maxRollback: HISTORY });
    this.localSide = opts.localSide ?? 0;
    this.cpuEnabled = opts.cpu ?? true;
    this.spectator = opts.spectator ?? false;
    this.read = Math.max(0, Math.min(1, opts.read ?? 0));
    const seed = opts.seed ?? config.seed;
    const read = this.read;
    this.brains = this.core.state.fighters.map((f) => {
      const ai = opts.spectator || this.localSide !== f.side;
      return createAi(f.side, opts.cpuLevel ?? config.cpuLevel, seed + 17 + f.side * 12, ai ? read : 0);
    });
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

  get players(): number {
    return this.core.players;
  }

  setP2(input: InputFrame | null): void {
    this.p2 = input;
  }

  /** Inputs for this tick, one per side. The CPU seats read the match, never the clock. */
  inputs(localInput: InputFrame): InputFrame[] {
    const m = this.core.state;
    return m.fighters.map((f) => {
      if (this.spectator) return aiInput(this.brains[f.side], m);
      if (f.side === this.localSide) return localInput;
      // Seat 1 is the second set of keys when the CPU is off for it.
      if (f.side === 1 && !this.cpuEnabled) return this.p2 ?? emptyInput();
      if (this.cpuEnabled || f.side !== 1) return aiInput(this.brains[f.side], m);
      return emptyInput();
    });
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
    const all = this.inputs(localInput);
    const t = this.core.stampTick;
    for (let p = 0; p < all.length; p++) this.core.addInput(p, t, packInput(all[p]));
    return this.stepCore();
  }

  /** Simulate one tick of a replay: feed every logged input due by now, then step. */
  stepReplay(log: ReplayFile['inputs'], cursor: { i: number }): MatchEvent[] {
    if (this.over) return [];
    const t = this.core.stampTick;
    while (cursor.i < log.length && log[cursor.i][0] <= t) {
      const [tick, player, packed] = log[cursor.i++];
      this.core.addInput(player, tick, packed);
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
      brains: this.brains.map((b) => ({ ...b })),
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
  rollback(tick: number, _inputs?: Map<number, InputFrame[]>): void {
    void _inputs;
    let best: SessionSnapshot | null = null;
    for (const [t, s] of this.history) {
      if (t <= tick && (!best || t > best.tick)) best = s;
    }
    if (!best) return;
    if (!this.core.rewindTo(best.tick)) return;
    this.brains = best.brains.map((b) => ({ ...b }));
    for (const t of Array.from(this.history.keys())) if (t > best.tick) this.history.delete(t);
    this.accumulator = 0;
  }

  /** A local prediction check: rollback and replay a list of stamped inputs. */
  replay(fromTick: number, inputs: Map<number, InputFrame[]>): void {
    this.rollback(fromTick, inputs);
  }

  exportReplay(): ReplayFile {
    return this.core.exportReplay(this.config);
  }

  restart(cpuLevel?: number): void {
    const cfg: MatchConfig = {
      ...this.config,
      cpuLevel: cpuLevel ?? this.brains[0].level,
      gear: this.config.gear.slice(),
    };
    this.core = new Rollback(createMatch(cfg), { delay: this.delay, maxRollback: HISTORY });
    for (const b of this.brains) resetAi(b, cfg.cpuLevel, cfg.seed + 17 + b.side * 12, this.read);
    this.history.clear();
    this.events = [];
    this.capture();
  }

  /** Build a fresh session from a match (used by rematches). */
  static fromMatch(match: MatchState, localSide = 0, cpu = true, level = 3): ClashSession {
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
      gear: match.fighters.map((f) => f.gear),
      training: match.training,
      format: match.format,
      chars: match.fighters.map((f) => f.char),
    };
    return new ClashSession(cfg, { localSide, cpu: cpu ? true : false, cpuLevel: level });
  }

  /** A tiny presentation helper: which team is ahead on stocks, then health; -1 for level. */
  leader(): number {
    const totals = new Map<number, { stocks: number; hp: number }>();
    for (const f of this.match.fighters) {
      const t = totals.get(f.team) ?? { stocks: 0, hp: 0 };
      t.stocks += f.stocks;
      t.hp += f.hp;
      totals.set(f.team, t);
    }
    let best = -1;
    let bestS = -1;
    let bestH = -1;
    let tie = false;
    for (const [team, t] of totals) {
      if (t.stocks > bestS || (t.stocks === bestS && t.hp > bestH)) {
        best = team;
        bestS = t.stocks;
        bestH = t.hp;
        tie = false;
      } else if (t.stocks === bestS && t.hp === bestH) tie = true;
    }
    return tie ? -1 : best;
  }

  setChars(player: CharId, cpu: CharId): void {
    const m = this.match;
    if (m.fighters[0].char === player && m.fighters[1].char === cpu) return;
    const cfg: MatchConfig = {
      ...this.config,
      playerChar: player,
      cpuChar: cpu,
      gear: m.fighters.map((f) => f.gear),
    };
    this.config = cfg;
    this.core = new Rollback(createMatch(cfg), { delay: this.delay, maxRollback: HISTORY });
    this.history.clear();
    this.capture();
  }
}

export { TICK_RATE };
