/**
 * Hands-on fights (Fighter Mode): a small real-time fight engine in the spirit of a 2D
 * boxing game. The scene feeds it FightIntents for each side (the player's from the pad /
 * keyboard via FightInput, the opponent's from LiveAI) plus a move axis, and reads back
 * state and a list of events to animate. No Pixi in here, so it can be tested headless.
 *
 * Side 0 is always on the left, side 1 on the right; they never cross.
 * Rounds are compressed: ROUND_SECONDS of play shows as 5:00 on the clock.
 */
import type { Fighter, FightResult, Skills, TickerLine } from '../core/types';
import type { FightIntent, PunchType, Weight } from '../core/fightinput';
import type { GamePlan } from './fight';
import { Rng } from '../core/rng';

export type Side = 0 | 1;
export type GPos = 'guard' | 'side' | 'mount' | 'back';
export const ROUND_SECONDS = 75;
export const ARENA_L = 60;
export const ARENA_R = 420;
const MIN_GAP = 34;

export interface LiveEvent {
  type:
    | 'punch' | 'kick' | 'hit' | 'miss' | 'block' | 'parry' | 'evade' | 'feint' | 'counter'
    | 'kd' | 'getup' | 'ko' | 'tko' | 'clinch' | 'break' | 'knee' | 'shoot' | 'sprawl' | 'td'
    | 'gnp' | 'advance' | 'sweep' | 'standup' | 'sub' | 'tap' | 'escape' | 'bell' | 'rocked' | 'cut';
  side: Side;
  /** strike name (jab, hook, headkick...) */
  name?: string;
  big?: boolean;
  dmg?: number;
  target?: 'head' | 'body' | 'legs';
}

interface Act {
  kind: 'punch' | 'kick' | 'knee' | 'gnp' | 'shoot' | 'feint';
  name: string;
  t: number;
  wind: number;
  rec: number;
  dmg: number;
  reach: number;
  target: 'head' | 'body' | 'legs';
  heavy: boolean;
  done: boolean;
}

export interface LiveFighter {
  id: string;
  sk: Skills;
  x: number;
  hp: number;
  hpMax: number;
  body: number;
  legs: number;
  gas: number;
  bpm: number;
  exert: number;
  act: Act | null;
  block: boolean;
  parryT: number;
  evade: { kind: 'slip' | 'roll' | 'pull' | 'lean'; t: number } | null;
  stun: number;
  /** >0 while on the canvas: seconds of the count elapsed */
  down: number;
  getup: number;
  kdsRound: number;
  counterT: number;
  sinceHit: number;
  cut: number;
  // stats
  landed: number;
  thrown: number;
  tds: number;
  kds: number;
  dealt: number;
  ctrl: number;
}

const PUNCH: Record<PunchType, { reach: number; wind: number; rec: number; dmg: number; gas: number }> = {
  jab: { reach: 56, wind: 0.09, rec: 0.13, dmg: 3.2, gas: 1.0 },
  straight: { reach: 53, wind: 0.14, rec: 0.2, dmg: 6, gas: 2 },
  hook: { reach: 44, wind: 0.17, rec: 0.24, dmg: 7, gas: 2.4 },
  uppercut: { reach: 40, wind: 0.17, rec: 0.26, dmg: 7.5, gas: 2.4 },
  overhand: { reach: 50, wind: 0.23, rec: 0.3, dmg: 8.5, gas: 3 },
};
const WEIGHT: Record<Weight, { wind: number; dmg: number; gas: number; rec: number }> = {
  light: { wind: 0.8, dmg: 0.7, gas: 0.7, rec: 0.85 },
  medium: { wind: 1, dmg: 1, gas: 1, rec: 1 },
  heavy: { wind: 1.5, dmg: 1.55, gas: 1.6, rec: 1.3 },
};
const KICK = {
  low: { name: 'legkick', reach: 52, wind: 0.2, rec: 0.3, dmg: 5.5, target: 'legs' as const },
  body: { name: 'kick', reach: 56, wind: 0.24, rec: 0.34, dmg: 7, target: 'body' as const },
  head: { name: 'headkick', reach: 58, wind: 0.31, rec: 0.42, dmg: 11, target: 'head' as const },
};
const GPOS_DMG: Record<GPos, number> = { guard: 0.55, side: 0.9, mount: 1.3, back: 1.05 };
const NEXT_POS: Record<GPos, GPos> = { guard: 'side', side: 'mount', mount: 'back', back: 'back' };

const clamp = (v: number, a: number, b: number) => Math.max(a, Math.min(b, v));

export class LiveFight {
  F: [LiveFighter, LiveFighter];
  round = 1;
  clock = ROUND_SECONDS;
  phase: 'fight' | 'break' | 'over' = 'fight';
  pos: 'stand' | 'clinch' | 'ground' = 'stand';
  top: Side = 0;
  gpos: GPos = 'guard';
  gprog = 0;
  standProg = 0;
  clinchT = 0;
  groundIdle = 0;
  sub: { atk: Side; prog: number; name: string } | null = null;
  /** someone just got shot on: sprawl window for the defender */
  shooting: Side | -1 = -1;
  events: LiveEvent[] = [];
  /** per round, per side: points for the cards */
  rpts: [number, number][] = [[0, 0]];
  result: { winner: Side | -1; method: 'KO' | 'TKO' | 'SUB' | 'DEC' | 'DRAW'; detail: string; round: number; time: string } | null = null;
  /** commentary-ish lines (for the result's ticker) */
  log: TickerLine[] = [];
  private rng: Rng;

  constructor(public A: Fighter, public B: Fighter, skA: Skills, skB: Skills, public rounds: 3 | 5, seed: number) {
    this.rng = new Rng(seed);
    const mk = (f: Fighter, sk: Skills, x: number): LiveFighter => ({
      id: f.id, sk, x, hp: 100, hpMax: 100, body: 100, legs: 100, gas: 100, bpm: 92, exert: 0,
      act: null, block: false, parryT: 0, evade: null, stun: 0, down: 0, getup: 0, kdsRound: 0, counterT: 0, sinceHit: 9, cut: 0,
      landed: 0, thrown: 0, tds: 0, kds: 0, dealt: 0, ctrl: 0,
    });
    this.F = [mk(A, skA, 200), mk(B, skB, 280)];
  }

  get dist(): number {
    return this.F[1].x - this.F[0].x;
  }

  /** Game clock as shown (5:00 rounds). */
  clockText(): string {
    const s = Math.max(0, Math.ceil((this.clock / ROUND_SECONDS) * 300));
    return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
  }

  /** What the input interpreter needs to know about one side. */
  context(i: Side): { grounded: boolean; beingShot: boolean; submission: 'attack' | 'defend' | null; knockedDown: boolean } {
    return {
      grounded: this.pos === 'ground',
      beingShot: this.shooting === 1 - i,
      submission: this.sub ? (this.sub.atk === i ? 'attack' : 'defend') : null,
      knockedDown: this.F[i].down > 0,
    };
  }

  private ev(e: LiveEvent): void {
    this.events.push(e);
  }

  private line(side: Side | -1, act: string, text: string, intensity = 1): void {
    const pos = this.pos === 'ground' ? (this.top === 0 ? 'atop' : 'btop') : this.pos;
    this.log.push({ round: this.round, t: Math.round(300 - (this.clock / ROUND_SECONDS) * 300), text, side, intensity, act, pos, hp: [Math.round(this.F[0].hp), Math.round(this.F[1].hp)] });
  }

  private name(i: Side): string {
    return (i === 0 ? this.A : this.B).last;
  }

  /** Advance the fight. `moves` is each side's -1..1 movement along x (screen space). */
  update(dt: number, intents: [FightIntent[], FightIntent[]], moves: [number, number]): void {
    if (this.phase !== 'fight') return;
    this.clock -= dt;
    for (const i of [0, 1] as Side[]) this.tickFighter(i, dt);
    if (this.F.some((f) => f.down > 0)) {
      this.tickCount(dt, intents);
      this.checkEnd();
      return;
    }
    for (const i of [0, 1] as Side[]) for (const it of intents[i]) this.intent(i, it);
    this.move(dt, moves);
    for (const i of [0, 1] as Side[]) this.tickAct(i, dt);
    if (this.pos === 'clinch') this.tickClinch(dt);
    if (this.pos === 'ground') this.tickGround(dt);
    if (this.clock <= 0 && !this.result) this.endRound();
    this.checkEnd();
  }

  private tickFighter(i: Side, dt: number): void {
    const f = this.F[i];
    f.parryT = Math.max(0, f.parryT - dt);
    f.stun = Math.max(0, f.stun - dt);
    f.counterT = Math.max(0, f.counterT - dt);
    f.sinceHit += dt;
    if (f.evade) {
      f.evade.t += dt;
      if (f.evade.t > 0.4) f.evade = null;
    }
    const busy = !!f.act || f.block;
    const cardio = 0.5 + f.sk.cardio / 100;
    f.gas = clamp(f.gas + (busy ? 1.2 : 5.5) * cardio * (0.4 + f.body / 166) * dt - (f.block ? 1.2 * dt : 0), 0, 100);
    if (f.sinceHit > 1.5 && f.down <= 0) f.hp = Math.min(f.hpMax, f.hp + (0.9 + f.sk.heart / 120) * dt);
    f.exert = Math.max(0, f.exert - dt * 9);
    const target = 72 + (100 - f.gas) * 0.85 + f.exert + (100 - f.hp) * 0.2 + (f.down > 0 ? 25 : 0);
    f.bpm += (target - f.bpm) * Math.min(1, dt * 1.5);
  }

  private gasK(f: LiveFighter): number {
    return 0.55 + 0.45 * (f.gas / 100);
  }

  // ------------------------------------------------------------ intents

  private intent(i: Side, it: FightIntent): void {
    const f = this.F[i];
    const o = this.F[(1 - i) as Side];
    if (f.stun > 0.15 && it.type !== 'block' && it.type !== 'mash' && it.type !== 'subTurn') return;
    switch (it.type) {
      case 'block':
        f.block = it.phase === 'start';
        return;
      case 'parry':
        f.parryT = 0.18;
        return;
    }
    if (this.sub) {
      if (it.type === 'mash' || it.type === 'subTurn') {
        const k = it.type === 'mash' ? 0.07 : 0.05;
        const skill = this.sub.atk === i ? f.sk.grappling : (f.sk.grappling + f.sk.wrestling) / 2;
        const push = k * (0.6 + skill / 120) * this.gasK(f);
        this.sub.prog += this.sub.atk === i ? push : -push * 1.05;
        f.gas = Math.max(0, f.gas - 0.6);
        f.exert += 1.5;
      }
      return;
    }
    if (f.act) return; // one thing at a time
    switch (it.type) {
      case 'punch': {
        if (this.pos === 'ground') {
          if (this.top !== i) {
            // punches from the bottom: short and weak
            this.startAct(f, { kind: 'gnp', name: 'punch', wind: 0.14, rec: 0.2, dmg: 2.4, reach: 99, target: 'head', heavy: false }, 1.2);
            return;
          }
          const w = WEIGHT[it.weight];
          this.startAct(f, { kind: 'gnp', name: it.punch === 'uppercut' || it.weight === 'heavy' ? 'elbow' : 'punch', wind: 0.14 * w.wind, rec: 0.18 * w.rec, dmg: 4.2 * w.dmg * GPOS_DMG[this.gpos], reach: 99, target: 'head', heavy: it.weight === 'heavy' }, 1.6 * w.gas);
          return;
        }
        if (this.pos === 'clinch') {
          const knee = it.punch === 'uppercut' || it.hand === 'rear';
          this.startAct(f, knee
            ? { kind: 'knee', name: 'knee', wind: 0.2, rec: 0.25, dmg: it.weight === 'heavy' ? 8 : 5.5, reach: 99, target: it.punch === 'uppercut' && it.weight === 'heavy' ? 'head' : 'body', heavy: it.weight === 'heavy' }
            : { kind: 'punch', name: 'elbow', wind: 0.15, rec: 0.22, dmg: 4.5 * WEIGHT[it.weight].dmg, reach: 99, target: 'head', heavy: it.weight === 'heavy' }, 2.2);
          return;
        }
        const p = PUNCH[it.punch];
        const w = WEIGHT[it.weight];
        const tired = f.gas < 20 ? 1.3 : 1;
        const name = it.punch === 'straight' ? 'cross' : it.punch === 'jab' ? 'jab' : it.punch;
        this.startAct(f, { kind: 'punch', name, wind: p.wind * w.wind * tired, rec: p.rec * w.rec * tired, dmg: p.dmg * w.dmg * (0.85 + it.pressure * 0.15), reach: p.reach, target: 'head', heavy: it.weight === 'heavy' }, p.gas * w.gas);
        this.ev({ type: 'punch', side: i, name, big: it.weight === 'heavy' });
        return;
      }
      case 'kick': {
        if (this.pos !== 'stand') return;
        const k = KICK[it.level];
        const tired = f.gas < 20 ? 1.3 : 1;
        this.startAct(f, { kind: 'kick', name: k.name, wind: k.wind * tired, rec: k.rec * tired, dmg: k.dmg * (0.6 + f.legs / 250), reach: k.reach, target: k.target, heavy: it.level === 'head' }, 3.5);
        this.ev({ type: 'kick', side: i, name: k.name });
        return;
      }
      case 'feint':
        if (this.pos !== 'stand') return;
        this.startAct(f, { kind: 'feint', name: 'feint', wind: 0.08, rec: 0.1, dmg: 0, reach: 0, target: 'head', heavy: false }, 0.3);
        // a good feint draws a reaction: the other man flinches into a block
        if (this.dist < 70 && this.rng.chance(0.35 + (f.sk.fightIQ - o.sk.fightIQ) / 150)) {
          o.stun = Math.max(o.stun, 0.22);
          o.counterT = 0;
          f.counterT = 0.45;
        }
        this.ev({ type: 'feint', side: i });
        return;
      case 'evade':
        if (this.pos !== 'stand') return;
        f.evade = { kind: it.kind, t: 0 };
        f.gas = Math.max(0, f.gas - 1.5);
        f.exert += 2;
        if (it.kind === 'pull') this.nudge(i, -14);
        if (it.kind === 'lean') this.nudge(i, 8);
        this.ev({ type: 'evade', side: i, name: it.kind });
        return;
      case 'clinch':
        if (this.pos === 'clinch') return this.breakClinch(i);
        if (this.pos !== 'stand' || this.dist > 48) return;
        f.gas = Math.max(0, f.gas - 3);
        if (this.rng.chance(clamp(0.45 + (f.sk.wrestling - o.sk.wrestling) / 120 + (o.stun > 0 ? 0.3 : 0) + (o.act ? 0.15 : 0), 0.1, 0.9))) {
          this.pos = 'clinch';
          this.clinchT = 0;
          this.ev({ type: 'clinch', side: i });
          this.line(i, 'clinch', `${this.name(i)} ties him up against the fence.`);
        } else this.ev({ type: 'miss', side: i, name: 'clinch' });
        return;
      case 'shoot':
        if (this.pos === 'ground') return;
        if (this.pos === 'stand' && this.dist > 70) return;
        this.startAct(f, { kind: 'shoot', name: 'shoot', wind: this.pos === 'clinch' ? 0.3 : 0.42, rec: 0.35, dmg: 0, reach: 70, target: 'body', heavy: false }, 5);
        this.shooting = i;
        this.ev({ type: 'shoot', side: i });
        return;
      case 'sprawl':
        if (this.shooting === 1 - i && this.F[1 - i].act?.kind === 'shoot' && !this.F[1 - i].act!.done) {
          const sh = this.F[1 - i];
          sh.act = null;
          sh.stun = 0.6;
          sh.gas = Math.max(0, sh.gas - 6);
          f.counterT = 0.6;
          this.shooting = -1;
          this.score(i, 1.2);
          this.ev({ type: 'sprawl', side: i });
          this.line(i, 'sprawl', `${this.name(i)} sprawls and stuffs it!`, 2);
        }
        return;
      case 'ground':
        if (this.pos !== 'ground') return;
        if (it.move === 'advance' && this.top === i) {
          this.gprog += 0.22 * (0.6 + f.sk.grappling / 120) / (0.6 + o.sk.grappling / 120) * this.gasK(f);
          f.gas = Math.max(0, f.gas - 2);
          if (this.gprog >= 1 && this.gpos !== 'back') {
            this.gprog = 0;
            this.gpos = NEXT_POS[this.gpos];
            this.score(i, 1.5);
            this.ev({ type: 'advance', side: i, name: this.gpos });
            this.line(i, 'ctrl', `${this.name(i)} passes to ${this.gpos === 'side' ? 'side control' : this.gpos}.`, 2);
          }
        } else if (this.top !== i && (it.move === 'standup' || it.move === 'reverse')) {
          const k = it.move === 'standup' ? 0.2 : 0.14;
          this.standProg += k * (0.6 + f.sk.wrestling / 120) / (0.6 + o.sk.wrestling / 120) * this.gasK(f) * (this.gpos === 'guard' ? 1.3 : this.gpos === 'mount' ? 0.6 : 0.85);
          f.gas = Math.max(0, f.gas - 2.5);
          f.exert += 2;
          if (this.standProg >= 1) {
            this.standProg = 0;
            if (it.move === 'reverse' && this.gpos === 'guard') {
              this.top = i;
              this.gpos = 'guard';
              this.score(i, 2);
              this.ev({ type: 'sweep', side: i });
              this.line(i, 'sweep', `${this.name(i)} sweeps! He's on top now.`, 2);
            } else this.standUp(i);
          }
        }
        return;
      case 'subAttempt': {
        if (this.pos !== 'ground') return;
        const isTop = this.top === i;
        if (isTop && this.gpos === 'guard') return; // nothing to grab from inside the guard
        const name = isTop ? (this.gpos === 'back' ? 'rear-naked choke' : this.gpos === 'mount' ? 'armbar' : 'arm-triangle choke') : this.rng.pick(['triangle choke', 'armbar', 'guillotine']);
        const opening = o.stun > 0 || o.hp < 40 ? 0.15 : 0;
        this.sub = { atk: i, prog: 0.3 + opening + (isTop ? 0 : -0.05), name };
        f.gas = Math.max(0, f.gas - 4);
        this.ev({ type: 'sub', side: i, name });
        this.line(i, 'sub', `${this.name(i)} goes for a ${name}!`, 3);
        return;
      }
    }
  }

  private startAct(f: LiveFighter, a: Omit<Act, 't' | 'done'>, gas: number): void {
    f.act = { ...a, t: 0, done: false };
    f.gas = Math.max(0, f.gas - gas);
    f.exert += gas * 1.4;
    f.block = f.block && a.kind === 'feint';
    if (a.kind !== 'feint' && a.kind !== 'shoot') f.thrown++;
  }

  private nudge(i: Side, dx: number): void {
    // dx > 0 = toward the other man
    const f = this.F[i];
    f.x += i === 0 ? dx : -dx;
    this.fixGap();
  }

  private fixGap(): void {
    const [a, b] = this.F;
    a.x = clamp(a.x, ARENA_L, ARENA_R - MIN_GAP);
    b.x = clamp(b.x, ARENA_L + MIN_GAP, ARENA_R);
    if (b.x - a.x < MIN_GAP) {
      const mid = (a.x + b.x) / 2;
      a.x = mid - MIN_GAP / 2;
      b.x = mid + MIN_GAP / 2;
    }
  }

  // ------------------------------------------------------------ movement

  private move(dt: number, moves: [number, number]): void {
    if (this.pos !== 'stand') {
      // tied up or on the mat: they stay together
      const mid = (this.F[0].x + this.F[1].x) / 2;
      const gap = this.pos === 'clinch' ? 26 : 0;
      this.F[0].x += (mid - gap / 2 - this.F[0].x) * Math.min(1, dt * 6);
      this.F[1].x += (mid + gap / 2 - this.F[1].x) * Math.min(1, dt * 6);
      return;
    }
    for (const i of [0, 1] as Side[]) {
      const f = this.F[i];
      if (f.stun > 0.3 || (f.act && f.act.kind !== 'feint')) continue;
      const speed = 70 * (0.55 + f.legs / 220) * (0.6 + f.gas / 250) * (f.block ? 0.6 : 1);
      f.x += clamp(moves[i], -1, 1) * speed * dt;
      if (Math.abs(moves[i]) > 0.2) f.exert += dt * 3;
    }
    this.fixGap();
  }

  // ------------------------------------------------------------ strikes

  private tickAct(i: Side, dt: number): void {
    const f = this.F[i];
    const a = f.act;
    if (!a) return;
    a.t += dt;
    if (!a.done && a.t >= a.wind) {
      a.done = true;
      this.land(i, a);
    }
    if (f.act && a.t >= a.wind + a.rec) f.act = null;
  }

  private land(i: Side, a: Act): void {
    const f = this.F[i];
    const o = this.F[(1 - i) as Side];
    if (a.kind === 'feint') return;
    if (a.kind === 'shoot') return this.resolveShot(i);
    if (a.kind === 'gnp') return this.resolveGnp(i, a);
    // range check on the feet
    if (this.pos === 'stand' && this.dist > a.reach) {
      f.stun = Math.max(f.stun, a.heavy ? 0.25 : 0.08);
      o.counterT = a.heavy ? 0.5 : 0.2;
      this.ev({ type: 'miss', side: i, name: a.name });
      return;
    }
    // defence: evade, parry, block
    const ev = o.evade;
    if (ev && ev.t < 0.32 && this.pos === 'stand') {
      const head = a.target === 'head';
      const dodged = (ev.kind === 'slip' && head && (a.name === 'jab' || a.name === 'cross' || a.name === 'overhand'))
        || (ev.kind === 'roll' && head && (a.name === 'hook' || a.name === 'overhand' || a.name === 'headkick'))
        || ev.kind === 'pull';
      if (dodged) {
        o.counterT = 0.55;
        f.stun = Math.max(f.stun, 0.12);
        this.ev({ type: 'miss', side: i, name: a.name });
        this.ev({ type: 'evade', side: (1 - i) as Side, name: ev.kind, big: true });
        return;
      }
    }
    if (o.parryT > 0 && a.target === 'head' && a.kind === 'punch' && o.stun <= 0) {
      f.stun = 0.38;
      o.counterT = 0.6;
      o.parryT = 0;
      this.ev({ type: 'parry', side: (1 - i) as Side, name: a.name });
      return;
    }
    let dmg = a.dmg * 0.62 * (0.55 + f.sk.power / 110) * this.gasK(f);
    const counter = f.counterT > 0;
    if (counter) {
      dmg *= 1.5;
      f.counterT = 0;
    }
    if (o.stun > 0) dmg *= 1.15;
    if (this.pos === 'stand' && a.kind === 'punch' && this.dist < a.reach * 0.5 && (a.name === 'jab' || a.name === 'cross')) dmg *= 0.6; // jammed
    if (o.block && o.stun <= 0) {
      const through = a.target === 'legs' ? 0.55 : a.heavy ? 0.32 : 0.18;
      dmg *= through;
      o.gas = Math.max(0, o.gas - 1.5);
      if (a.target === 'legs') f.legs = Math.max(0, f.legs - 2.5); // checked
      this.ev({ type: 'block', side: (1 - i) as Side, name: a.name });
      this.apply(i, a.target, dmg, false, false);
      return;
    }
    f.landed++;
    this.apply(i, a.target, dmg, a.heavy || counter, counter, a.name);
  }

  /** Damage lands. Knockdowns and finishes are decided here. */
  private apply(i: Side, target: 'head' | 'body' | 'legs', dmg: number, big: boolean, counter: boolean, name?: string): void {
    const f = this.F[i];
    const o = this.F[(1 - i) as Side];
    o.sinceHit = 0;
    f.dealt += dmg;
    this.score(i, dmg * 0.25);
    if (name) {
      this.ev({ type: counter ? 'counter' : 'hit', side: i, name, big, dmg, target });
      if (big) this.line(i, name === 'headkick' ? 'headkick' : name === 'knee' ? 'knee' : name === 'kick' ? 'kick' : name === 'legkick' ? 'legkick' : 'punch', `${counter ? 'COUNTER! ' : ''}${this.name(i)} lands a big ${name}.`, 2);
    }
    if (target === 'head') {
      const k = 1.25 - o.sk.chin / 200;
      o.hp -= dmg * k;
      o.hpMax = Math.max(35, o.hpMax - dmg * k * 0.18);
      o.stun = Math.max(o.stun, big ? 0.32 : 0.12);
      if (big && this.rng.chance(0.12)) {
        o.cut++;
        this.ev({ type: 'cut', side: (1 - i) as Side });
      }
      if (o.hp <= 0) {
        if (o.hp < -12 || o.kdsRound >= 2 || this.pos === 'ground') return this.finish(i, this.pos === 'ground' ? 'TKO' : 'KO', this.pos === 'ground' ? 'ground and pound' : name ?? 'punch');
        return this.knockdown(i);
      }
      if (this.pos === 'stand' && (big || dmg > 9) && this.rng.chance(clamp((dmg - 7) / 26 + (1 - o.hp / 100) * 0.22 - o.sk.chin / 500, 0, 0.6))) return this.knockdown(i);
      if (big && o.hp < 40 && o.stun < 0.6) {
        o.stun = 0.7;
        this.ev({ type: 'rocked', side: (1 - i) as Side });
        this.line(i, 'rocked', `${this.name((1 - i) as Side)} is ROCKED!`, 3);
      }
    } else if (target === 'body') {
      o.body -= dmg * (1.2 - o.sk.durability / 250);
      o.gas = Math.max(0, o.gas - dmg * 0.8);
      o.hp -= dmg * 0.2;
      if (o.body <= 0) {
        o.body = 18;
        return this.knockdown(i);
      }
    } else {
      o.legs = Math.max(0, o.legs - dmg * 1.1);
      o.hp -= dmg * 0.1;
      if (o.legs < 15 && this.pos === 'stand' && this.rng.chance(0.25)) return this.knockdown(i);
    }
  }

  private knockdown(i: Side): void {
    const o = this.F[(1 - i) as Side];
    const f = this.F[i];
    o.down = 0.001;
    o.getup = 0;
    o.kds++;
    o.kdsRound++;
    o.act = null;
    o.block = false;
    f.act = null; // (kds counts times *this* fighter went down; the cards credit the other man)
    this.score(i, 6);
    this.pos = 'stand';
    this.sub = null;
    this.ev({ type: 'kd', side: i });
    this.line(i, 'kd', `DOWN GOES ${this.name((1 - i) as Side).toUpperCase()}!`, 3);
    if (o.kdsRound >= 3) this.finish(i, 'TKO', 'three knockdowns');
  }

  /** The man on the canvas has to beat the count: 10 counts, about 7 seconds. */
  private tickCount(dt: number, intents: [FightIntent[], FightIntent[]]): void {
    for (const i of [0, 1] as Side[]) {
      const o = this.F[i];
      if (o.down <= 0) continue;
      o.down += dt;
      for (const it of intents[i]) {
        if (it.type === 'getup') o.getup += 0.075 * (0.4 + it.rhythm) * (0.6 + o.sk.heart / 150) * (0.5 + Math.max(0, o.hp + 20) / 120);
        if (it.type === 'getupFumble') o.getup = Math.max(0, o.getup - 0.05);
      }
      if (o.getup >= 1) {
        o.down = 0;
        o.hp = Math.max(o.hp, 18 + o.sk.heart / 6);
        o.stun = 0.4;
        this.F[(1 - i) as Side].x = clamp(this.F[(1 - i) as Side].x + (i === 0 ? 30 : -30), ARENA_L, ARENA_R);
        this.fixGap();
        this.ev({ type: 'getup', side: i });
        this.line(i, 'getup', `${this.name(i)} beats the count!`, 2);
      } else if (o.down >= 7) {
        o.down = 0;
        this.finish((1 - i) as Side, 'KO', 'counted out');
      }
    }
  }

  /** Count shown to the player: 1..10 */
  countOf(i: Side): number {
    return Math.min(10, Math.floor((this.F[i].down / 7) * 10) + 1);
  }

  // ------------------------------------------------------------ clinch & takedowns

  private tickClinch(dt: number): void {
    this.clinchT += dt;
    for (const f of this.F) f.ctrl += dt * 0.3;
    if (this.clinchT > 9) {
      this.pos = 'stand';
      this.F[0].x -= 14;
      this.F[1].x += 14;
      this.fixGap();
      this.ev({ type: 'break', side: 0 });
      this.line(-1, 'idle', 'The referee breaks them up.');
    }
  }

  private breakClinch(i: Side): void {
    const f = this.F[i];
    const o = this.F[(1 - i) as Side];
    if (this.rng.chance(clamp(0.5 + (f.sk.wrestling - o.sk.wrestling) / 120, 0.2, 0.85))) {
      this.pos = 'stand';
      this.nudge(i, -18);
      this.ev({ type: 'break', side: i });
    }
    f.gas = Math.max(0, f.gas - 2);
  }

  private resolveShot(i: Side): void {
    const f = this.F[i];
    const o = this.F[(1 - i) as Side];
    this.shooting = -1;
    if (this.pos === 'stand' && this.dist > 70) {
      this.ev({ type: 'miss', side: i, name: 'shoot' });
      f.stun = 0.4;
      return;
    }
    const p = clamp(0.42 + (f.sk.wrestling - o.sk.wrestling) / 90 + (o.stun > 0 ? 0.25 : 0) + (o.act ? 0.12 : 0) - (o.gas > 60 ? 0 : -0.1) + (this.pos === 'clinch' ? 0.1 : 0) - (o.legs < 50 ? -0.08 : 0), 0.08, 0.9);
    if (this.rng.chance(p)) {
      this.pos = 'ground';
      this.top = i;
      this.gpos = this.rng.chance(0.2) ? 'side' : 'guard';
      this.gprog = 0;
      this.standProg = 0;
      this.groundIdle = 0;
      f.tds++;
      this.score(i, 3);
      o.gas = Math.max(0, o.gas - 5);
      this.ev({ type: 'td', side: i });
      this.line(i, 'td', `${this.name(i)} takes him down!`, 2);
    } else {
      f.stun = 0.45;
      f.gas = Math.max(0, f.gas - 4);
      this.score((1 - i) as Side, 0.8);
      this.ev({ type: 'sprawl', side: (1 - i) as Side });
    }
  }

  private standUp(i: Side): void {
    this.pos = 'stand';
    this.sub = null;
    this.gprog = this.standProg = 0;
    const mid = (this.F[0].x + this.F[1].x) / 2;
    this.F[0].x = mid - 30;
    this.F[1].x = mid + 30;
    this.fixGap();
    this.ev({ type: 'standup', side: i });
    this.line(i, 'getup', `${this.name(i)} gets back to his feet.`);
  }

  // ------------------------------------------------------------ ground

  private resolveGnp(i: Side, a: Act): void {
    const o = this.F[(1 - i) as Side];
    const f = this.F[i];
    if (this.pos !== 'ground') return;
    this.groundIdle = 0;
    let dmg = a.dmg * 0.7 * (0.6 + f.sk.power / 140) * this.gasK(f);
    if (o.block) {
      dmg *= 0.35;
      this.ev({ type: 'block', side: (1 - i) as Side, name: a.name });
    } else f.landed++;
    this.ev({ type: 'gnp', side: i, name: a.name, dmg, big: a.heavy });
    this.apply(i, 'head', dmg, false, false);
  }

  private tickGround(dt: number): void {
    const t = this.F[this.top];
    t.ctrl += dt;
    this.score(this.top, dt * 0.35);
    this.groundIdle += dt;
    if (this.sub) {
      // the hold sinks in on its own a little, faster on a tired man
      const d = this.F[(1 - this.sub.atk) as Side];
      this.sub.prog += dt * (0.02 + (100 - d.gas) / 2500) - dt * 0.035;
      d.gas = Math.max(0, d.gas - dt * 4);
      if (this.sub.prog >= 1) return this.finish(this.sub.atk, 'SUB', this.sub.name);
      if (this.sub.prog <= 0) {
        const esc = (1 - this.sub.atk) as Side;
        this.ev({ type: 'escape', side: esc });
        this.line(esc, 'escape', `${this.name(esc)} escapes!`, 2);
        // a failed sub from the top gives up position
        if (this.sub.atk === this.top) this.gpos = 'guard';
        this.sub = null;
      }
      return;
    }
    if (this.groundIdle > 14) {
      this.line(-1, 'standup', 'The referee stands them up.');
      this.standUp(this.top);
    }
  }

  // ------------------------------------------------------------ scoring & rounds

  private score(i: Side, pts: number): void {
    this.rpts[this.round - 1][i] += pts;
  }

  private endRound(): void {
    this.ev({ type: 'bell', side: 0 });
    this.line(-1, 'bell', `End of round ${this.round}.`);
    if (this.round >= this.rounds) return this.decision();
    this.phase = 'break';
  }

  /** Between rounds (after the corner): recovery, scaled by corner aid (0..1). */
  nextRound(aid: [number, number]): void {
    if (this.phase !== 'break') return;
    this.round++;
    this.rpts.push([0, 0]);
    this.clock = ROUND_SECONDS;
    this.pos = 'stand';
    this.sub = null;
    this.shooting = -1;
    this.F.forEach((f, i) => {
      const a = aid[i];
      f.hp = Math.min(f.hpMax, f.hp + 18 + a * 18);
      f.gas = Math.min(100, f.gas + 35 + a * 15);
      f.body = Math.min(100, f.body + 8);
      f.legs = Math.min(100, f.legs + 6);
      f.act = null;
      f.block = false;
      f.stun = 0;
      f.kdsRound = 0;
      f.evade = null;
      f.x = i === 0 ? 170 : 310;
    });
    this.phase = 'fight';
    this.line(-1, 'round_start', `Round ${this.round}!`);
  }

  /** Per round, per judge: 10-9s from the round points, with a little judging noise. */
  cards(): { totals: [number, number][]; rounds: [number, number][][] } {
    const rounds: [number, number][][] = [];
    const totals: [number, number][] = [[0, 0], [0, 0], [0, 0]];
    this.rpts.forEach(([a, b], r) => {
      const per: [number, number][] = [];
      for (let j = 0; j < 3; j++) {
        const rng = new Rng((r + 1) * 7919 + j * 104729 + Math.round(a * 13 + b * 31));
        const na = a * rng.float(0.85, 1.15);
        const nb = b * rng.float(0.85, 1.15);
        const diff = na - nb;
        const sc: [number, number] = Math.abs(diff) < 0.6 ? [10, 10] : diff > 0 ? [10, diff > Math.max(12, nb * 2.5) ? 8 : 9] : [diff < -Math.max(12, na * 2.5) ? 8 : 9, 10];
        per.push(sc);
        totals[j][0] += sc[0];
        totals[j][1] += sc[1];
      }
      rounds.push(per);
    });
    return { totals, rounds };
  }

  private decision(): void {
    const { totals } = this.cards();
    const votes = totals.map(([a, b]) => (a > b ? 0 : b > a ? 1 : -1));
    const a = votes.filter((v) => v === 0).length;
    const b = votes.filter((v) => v === 1).length;
    const winner: Side | -1 = a >= 2 ? 0 : b >= 2 ? 1 : -1;
    const detail = winner < 0 ? 'split draw' : (winner === 0 ? a : b) === 3 ? 'unanimous' : (winner === 0 ? b : a) === 0 ? 'majority' : 'split';
    this.result = { winner, method: winner < 0 ? 'DRAW' : 'DEC', detail, round: this.round, time: '5:00' };
    this.phase = 'over';
  }

  private finish(winner: Side, method: 'KO' | 'TKO' | 'SUB', detail: string): void {
    if (this.result) return;
    this.result = { winner, method, detail, round: this.round, time: this.clockElapsed() };
    this.phase = 'over';
    this.F[(1 - winner) as Side].down = 0;
    this.ev({ type: method === 'SUB' ? 'tap' : method === 'KO' ? 'ko' : 'tko', side: winner });
    this.line(winner, method === 'SUB' ? 'tap' : method === 'KO' ? 'ko' : 'tko', method === 'SUB' ? `${this.name((1 - winner) as Side)} TAPS!` : `IT'S ALL OVER! ${this.name(winner)} wins by ${method}!`, 3);
  }

  private clockElapsed(): string {
    const s = Math.round(300 - (Math.max(0, this.clock) / ROUND_SECONDS) * 300);
    return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
  }

  /** The doctor or the corner can stop it between rounds. */
  stopBetweenRounds(loser: Side, why: string): void {
    this.result = { winner: (1 - loser) as Side, method: 'TKO', detail: why, round: this.round, time: '5:00' };
    this.phase = 'over';
  }

  private checkEnd(): void {
    // nothing extra: finishes are decided as damage lands
  }

  /** Build a regular FightResult so the rest of the game (records, rankings, news) just works. */
  toResult(judges: string[], referee: string): FightResult {
    const r = this.result!;
    const { totals, rounds } = this.cards();
    const ids = [this.A.id, this.B.id];
    return {
      winner: r.winner < 0 ? null : ids[r.winner],
      loser: r.winner < 0 ? null : ids[1 - r.winner],
      method: r.method,
      detail: r.detail,
      round: r.round,
      time: r.time,
      scores: totals,
      judges,
      referee,
      robbery: false,
      fotn: clamp(Math.round(40 + (this.F[0].kds + this.F[1].kds) * 12 + (this.F[0].dealt + this.F[1].dealt) / 8), 0, 100),
      damage: [Math.round(100 - this.F[0].hp), Math.round(100 - this.F[1].hp)].map((d) => clamp(d, 0, 100)) as [number, number],
      ticker: this.log,
      stats: { strikes: [this.F[0].landed, this.F[1].landed], takedowns: [this.F[0].tds, this.F[1].tds], knockdowns: [this.F[1].kds, this.F[0].kds] },
      injuries: [],
      fouls: [],
      pointDeductions: [0, 0],
      roundScores: rounds,
      cuts: [this.F[0].cut, this.F[1].cut],
    };
  }
}

// ------------------------------------------------------------ AI

/**
 * The opponent (and the player's autopilot). Skill-driven: fight IQ sets reaction time and
 * how often it reads a strike, the gameplan sets range and what it goes for.
 */
export class LiveAI {
  private think = 0;
  private want = 50;
  private blockT = 0;
  private rng: Rng;
  constructor(public side: Side, seed: number, public plan: GamePlan = 'balanced') {
    this.rng = new Rng(seed);
  }

  update(L: LiveFight, dt: number): { intents: FightIntent[]; move: number } {
    const me = L.F[this.side];
    const op = L.F[(1 - this.side) as Side];
    const sk = me.sk;
    const out: FightIntent[] = [];
    const toward = this.side === 0 ? 1 : -1;
    const iq = sk.fightIQ / 100;
    // knocked down: beat the count
    if (me.down > 0) {
      if (this.rng.chance(dt * (3 + sk.heart / 25))) out.push({ type: 'getup', side: this.rng.chance(0.5) ? 'left' : 'right', rhythm: this.rng.float(0.5, 1) });
      return { intents: out, move: 0 };
    }
    if (L.sub) {
      if (this.rng.chance(dt * (4 + sk.grappling / 18))) out.push({ type: 'mash', rate: 6, role: L.sub.atk === this.side ? 'attack' : 'defend' });
      return { intents: out, move: 0 };
    }
    // reactive defence: read the other man's strike while it winds up
    if (op.act && !op.act.done && op.act.kind !== 'feint' && op.act.kind !== 'shoot' && op.act.t > 0.04) {
      if (!this.blockT && this.rng.chance(dt * 9 * (0.25 + iq * 0.7))) {
        const r = this.rng.next();
        if (L.pos === 'stand' && r < 0.25 + iq * 0.15) out.push({ type: 'evade', kind: op.act.name === 'hook' ? 'roll' : op.act.name === 'legkick' ? 'pull' : 'slip', source: 'button' });
        else if (r < 0.35 + iq * 0.2) out.push({ type: 'parry' });
        else {
          out.push({ type: 'block', phase: 'start' });
          this.blockT = 0.5;
        }
      }
    }
    if (op.act?.kind === 'shoot' && !op.act.done && this.rng.chance(dt * 6 * (0.3 + sk.wrestling / 140))) out.push({ type: 'sprawl' });
    if (this.blockT > 0) {
      this.blockT -= dt;
      if (this.blockT <= 0) {
        this.blockT = 0;
        out.push({ type: 'block', phase: 'end' });
      }
    }
    // ground
    if (L.pos === 'ground') {
      this.think -= dt;
      if (this.think <= 0 && !me.act) {
        this.think = this.rng.float(0.25, 0.6) * (1.3 - iq * 0.5);
        const top = L.top === this.side;
        const grap = sk.grappling > sk.striking;
        if (top) {
          const r = this.rng.next();
          if (L.gpos !== 'guard' && grap && r < 0.18) out.push({ type: 'subAttempt' });
          else if (r < (this.plan === 'grind' || grap ? 0.45 : 0.25)) out.push({ type: 'ground', move: 'advance' });
          else out.push({ type: 'punch', hand: 'rear', punch: 'straight', weight: this.rng.chance(0.3) ? 'heavy' : 'medium', hold: 0.2, pressure: 1, grounded: true });
        } else {
          const r = this.rng.next();
          if (L.gpos === 'guard' && sk.grappling > 62 && r < 0.12) out.push({ type: 'subAttempt' });
          else if (r < 0.6) out.push({ type: 'ground', move: sk.grappling > sk.wrestling && L.gpos === 'guard' ? 'reverse' : 'standup' });
          else if (r < 0.8) {
            out.push({ type: 'block', phase: 'start' });
            this.blockT = 0.6;
          }
        }
      }
      return { intents: out, move: 0 };
    }
    // clinch
    if (L.pos === 'clinch') {
      this.think -= dt;
      if (this.think <= 0 && !me.act) {
        this.think = this.rng.float(0.3, 0.7);
        const r = this.rng.next();
        if (r < 0.15 + sk.wrestling / 400) out.push({ type: 'shoot' });
        else if (r < 0.6) out.push({ type: 'punch', hand: 'rear', punch: this.rng.chance(0.3) ? 'uppercut' : 'straight', weight: this.rng.chance(0.4) ? 'heavy' : 'medium', hold: 0.3, pressure: 1, grounded: false });
        else if (r < 0.75) out.push({ type: 'clinch' });
      }
      return { intents: out, move: 0 };
    }
    // range management
    const wrestle = this.plan === 'wrestle' || this.plan === 'grind' || this.plan === 'subhunt' || (this.plan === 'balanced' && sk.wrestling > sk.striking + 8);
    const pressure = this.plan === 'pressure';
    const survive = this.plan === 'survive' || me.hp < 25;
    this.want = survive ? 75 : pressure ? 40 : this.plan === 'counter' ? 58 : wrestle ? 52 : 50;
    const d = L.dist;
    let move = 0;
    if (me.stun <= 0.2) {
      if (d > this.want + 6) move = toward;
      else if (d < this.want - 8) move = -toward;
      // a hurt opponent: go get him
      if (op.stun > 0.3 && op.hp < 45 && !survive) move = toward;
    }
    this.think -= dt;
    if (this.think <= 0 && !me.act && me.stun <= 0) {
      this.think = this.rng.float(0.18, 0.55) * (this.plan === 'counter' ? 1.4 : pressure ? 0.8 : 1) * (1.25 - iq * 0.4) * (me.gas < 25 ? 1.6 : 1);
      const r = this.rng.next();
      const opening = me.counterT > 0 || op.stun > 0;
      if (wrestle && d < 66 && r < 0.12 + sk.wrestling / 500) out.push({ type: 'shoot' });
      else if (d < 46 && r < 0.08 + (wrestle ? 0.08 : 0)) out.push({ type: 'clinch' });
      else if (d < 58 && (r < 0.75 || opening) && !(this.plan === 'counter' && !opening && r > 0.35)) {
        const kick = this.plan === 'legs' ? 0.45 : 0.18 + (sk.striking > 65 ? 0.05 : 0);
        if (this.rng.chance(kick)) out.push({ type: 'kick', level: this.plan === 'legs' || this.rng.chance(0.45) ? 'low' : this.rng.chance(0.75) ? 'body' : 'head' });
        else {
          const types: PunchType[] = d > 50 ? ['jab', 'jab', 'straight', 'overhand'] : ['jab', 'straight', 'hook', 'hook', 'uppercut'];
          const punch = this.rng.pick(types);
          const weight: Weight = opening || this.rng.chance(0.2 + sk.power / 400) ? 'heavy' : this.rng.chance(0.5) ? 'medium' : 'light';
          out.push({ type: 'punch', hand: punch === 'jab' || punch === 'hook' ? 'lead' : 'rear', punch, weight, hold: 0.2, pressure: 1, grounded: false });
        }
      } else if (r > 0.92) out.push({ type: 'feint' });
    }
    return { intents: out, move };
  }
}
