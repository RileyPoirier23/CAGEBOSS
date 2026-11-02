/* UNIVERSE CLASH - rollback core.
   Inputs are stamped by tick. A tick is simulated as soon as it is due, with
   any missing input predicted from the last one known; when the real input
   arrives late and differs, the snapshot before that tick is restored and the
   ticks since are re-simulated. `confirmed` is the newest tick whose inputs
   are all known: scars, replays and sync checks only trust ticks up to it.
   Also the replay format: a replay is the input log, nothing else. */

import { checksumMatch, cloneMatch, drainEvents, stepMatch } from './sim';
import type { InputFrame, MatchConfig, MatchEvent, MatchState } from './types';
import { emptyInput } from './types';

/* Inputs travel and are stored as bit masks. Held buttons in the low bits,
   edge (pressed-this-tick) flags above them. */
const HELD: (keyof InputFrame)[] = ['left', 'right', 'up', 'down', 'light', 'heavy', 'dodge', 'jump', 'throw', 'super', 'drive'];
const EDGE: (keyof InputFrame)[] = ['lightPressed', 'heavyPressed', 'dodgePressed', 'jumpPressed', 'throwPressed', 'superPressed', 'drivePressed'];
const EDGE_MASK = ((1 << EDGE.length) - 1) << HELD.length;

export function packInput(i: InputFrame): number {
  let n = 0;
  for (let b = 0; b < HELD.length; b++) if (i[HELD[b]]) n |= 1 << b;
  for (let b = 0; b < EDGE.length; b++) if (i[EDGE[b]]) n |= 1 << (HELD.length + b);
  return n;
}

export function unpackInput(n: number): InputFrame {
  const i = emptyInput();
  for (let b = 0; b < HELD.length; b++) if (n & (1 << b)) (i[HELD[b]] as boolean) = true;
  for (let b = 0; b < EDGE.length; b++) if (n & (1 << (HELD.length + b))) (i[EDGE[b]] as boolean) = true;
  return i;
}

/** A predicted input keeps what was held but never repeats a press. */
function predictFrom(known: number): number {
  return known & ~EDGE_MASK;
}

export interface ReplayFile {
  v: 1;
  cfg: MatchConfig;
  /** [tick, player, packed input] in stamp order. */
  inputs: [number, number, number][];
  ticks: number;
  names?: [string, string];
  when?: string;
}

export interface RollbackOptions {
  /** Local inputs are stamped `delay` ticks ahead so the remote side has time to arrive. */
  delay: number;
  /** Snapshots kept behind the head; a late input older than this is accepted without rollback. */
  maxRollback: number;
}

export class Rollback {
  state: MatchState;
  readonly opts: RollbackOptions;
  /** Input slots per tick, one per fighter side. */
  readonly players: number;
  private inputs = new Map<number, number[]>();
  private known = new Map<number, boolean[]>();
  readonly snaps = new Map<number, MatchState>();
  private events = new Map<number, MatchEvent[]>();
  private checks = new Map<number, number>();
  confirmed: number;
  rollbacks = 0;
  resimFrames = 0;
  lastRollbackTick = -1;
  record: [number, number, number][] = [];
  private prev: MatchState;

  constructor(state: MatchState, opts: Partial<RollbackOptions> = {}) {
    this.state = state;
    this.players = Math.max(2, state.fighters.length);
    this.opts = { delay: 0, maxRollback: 150, ...opts };
    this.confirmed = state.tick;
    this.snaps.set(state.tick, cloneMatch(state));
    this.prev = this.snaps.get(state.tick)!;
    // The first `delay` ticks can never receive a stamped input: they are known-neutral.
    for (let t = state.tick + 1; t <= state.tick + this.opts.delay; t++) {
      for (let p = 0; p < this.players; p++) this.addInput(p, t, 0);
    }
  }

  get tick(): number {
    return this.state.tick;
  }

  /** The tick a local input pressed now should be stamped for. */
  get stampTick(): number {
    return this.state.tick + 1 + this.opts.delay;
  }

  private row(t: number): number[] {
    let r = this.inputs.get(t);
    if (!r) {
      r = new Array<number>(this.players).fill(0);
      this.inputs.set(t, r);
      this.known.set(t, new Array<boolean>(this.players).fill(false));
    }
    return r;
  }

  /** Input for `player` at `tick` becomes known. Returns true if it caused a rollback. */
  addInput(player: number, tick: number, packed: number): boolean {
    if (player < 0 || player >= this.players) return false;
    const r = this.row(tick);
    const k = this.known.get(tick)!;
    if (k[player]) return false;
    const predicted = r[player];
    r[player] = packed;
    k[player] = true;
    this.record.push([tick, player, packed]);
    if (tick <= this.state.tick && predicted !== packed) {
      this.rollbackTo(tick);
      return true;
    }
    this.advanceConfirmed();
    return false;
  }

  private advanceConfirmed(): void {
    while (this.confirmed < this.state.tick && this.allKnown(this.confirmed + 1)) this.confirmed++;
  }

  allKnown(tick: number): boolean {
    const k = this.known.get(tick);
    if (!k) return false;
    for (let p = 0; p < this.players; p++) if (!k[p]) return false;
    return true;
  }

  private lastKnown(player: number, tick: number): number {
    for (let t = tick - 1; t >= tick - 64; t--) {
      const k = this.known.get(t);
      if (k && k[player]) return this.inputs.get(t)![player];
    }
    return 0;
  }

  private inputsFor(tick: number): number[] {
    const r = this.row(tick);
    const k = this.known.get(tick)!;
    const out: number[] = new Array<number>(this.players).fill(0);
    for (let p = 0; p < this.players; p++) {
      if (k[p]) out[p] = r[p];
      else {
        out[p] = predictFrom(this.lastKnown(p, tick));
        r[p] = out[p];
      }
    }
    return out;
  }

  /** Restore the snapshot before `tick` and re-simulate up to where we were. */
  rollbackTo(tick: number): void {
    const snap = this.snaps.get(tick - 1);
    if (!snap) return; // older than the ring: accept the divergence, the sync check will flag it
    const target = this.state.tick;
    this.state = cloneMatch(snap);
    this.rollbacks++;
    this.lastRollbackTick = tick;
    while (this.state.tick < target) {
      this.step();
      this.resimFrames++;
    }
  }

  /** Simulate one tick with whatever is known or predicted for it. */
  step(): MatchEvent[] {
    const t = this.state.tick + 1;
    const packed = this.inputsFor(t);
    this.prev = this.snaps.get(this.state.tick) ?? this.prev;
    stepMatch(this.state, packed.map(unpackInput));
    const ev = drainEvents(this.state);
    this.snaps.set(t, cloneMatch(this.state));
    this.events.set(t, ev);
    this.checks.set(t, checksumMatch(this.state));
    this.advanceConfirmed();
    const old = t - this.opts.maxRollback - 2;
    this.snaps.delete(old);
    const older = old - 600;
    this.inputs.delete(older);
    this.known.delete(older);
    this.events.delete(older);
    this.checks.delete(older);
    return ev;
  }

  /** Drop everything after `tick` and stand on its snapshot. Used by replay scrubbing and tests. */
  rewindTo(tick: number): boolean {
    const snap = this.snaps.get(tick);
    if (!snap) return false;
    this.state = cloneMatch(snap);
    for (const t of Array.from(this.inputs.keys())) if (t > tick) { this.inputs.delete(t); this.known.delete(t); }
    for (const t of Array.from(this.snaps.keys())) if (t > tick) { this.snaps.delete(t); this.events.delete(t); this.checks.delete(t); }
    this.record = this.record.filter((r) => r[0] <= tick);
    this.confirmed = Math.min(this.confirmed, tick);
    return true;
  }

  get prevState(): MatchState {
    return this.snaps.get(this.state.tick - 1) ?? this.prev;
  }

  eventsAt(t: number): MatchEvent[] {
    return this.events.get(t) ?? [];
  }

  checksumAt(t: number): number | undefined {
    return this.checks.get(t);
  }

  exportReplay(cfg: MatchConfig): ReplayFile {
    return {
      v: 1,
      cfg: { ...cfg, gear: cfg.gear.slice() },
      inputs: this.record.filter((r) => r[0] <= this.state.tick),
      ticks: this.state.tick,
    };
  }
}

/* Two peers in one page over a simulated wire. Each peer owns one side's
   input and predicts the other's; inputs arrive after ping/2 +- jitter. The
   wire uses Math.random on purpose: it is the network, not the match. */
export interface NetSimOptions {
  delay: number;
  ping: number;
  jitter: number;
}

interface WirePacket {
  at: number;
  to: 0 | 1;
  p: 0 | 1;
  t: number;
  input: number;
}

export class NetSim {
  readonly opts: NetSimOptions;
  readonly peers: [Rollback, Rollback];
  private wire: WirePacket[] = [];
  desync = false;
  desyncTick = -1;
  sent = 0;
  confirmed = 0;
  stalled: [number, number] = [0, 0];

  constructor(makeState: () => MatchState, opts: Partial<NetSimOptions> = {}) {
    this.opts = { delay: 2, ping: 80, jitter: 20, ...opts };
    this.peers = [
      new Rollback(makeState(), { delay: this.opts.delay, maxRollback: 24 }),
      new Rollback(makeState(), { delay: this.opts.delay, maxRollback: 24 }),
    ];
  }

  /** Peer `p` pressed `input` now: stamp it locally and put it on the wire. */
  localInput(p: 0 | 1, input: InputFrame, now: number): void {
    const peer = this.peers[p];
    const t = peer.stampTick;
    const packed = packInput(input);
    peer.addInput(p, t, packed);
    this.sent++;
    const lat = this.opts.ping / 2 + (Math.random() * 2 - 1) * this.opts.jitter;
    this.wire.push({ at: now + Math.max(0, lat), to: p === 0 ? 1 : 0, p, t, input: packed });
  }

  deliver(now: number): void {
    const keep: WirePacket[] = [];
    for (const m of this.wire) {
      if (m.at <= now) this.peers[m.to].addInput(m.p, m.t, m.input);
      else keep.push(m);
    }
    this.wire = keep;
  }

  /** Advance both peers one tick; a peer too far ahead of its confirmed tick waits. */
  advance(): void {
    for (const side of [0, 1] as const) {
      const peer = this.peers[side];
      if (peer.tick - peer.confirmed < peer.opts.maxRollback - 4) peer.step();
      else this.stalled[side]++;
    }
    const c = Math.min(this.peers[0].confirmed, this.peers[1].confirmed);
    if (c > 0 && !this.desync) {
      const a = this.peers[0].checksumAt(c);
      const b = this.peers[1].checksumAt(c);
      if (a !== undefined && b !== undefined && a !== b) {
        this.desync = true;
        this.desyncTick = c;
      }
    }
    this.confirmed = c;
  }
}
