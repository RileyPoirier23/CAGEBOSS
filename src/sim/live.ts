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
import type { Dir, FightIntent, PunchType, Weight } from '../core/fightinput';
import type { GamePlan } from './fight';
import { Rng } from '../core/rng';

export type Side = 0 | 1;
export type GPos = 'guard' | 'half' | 'side' | 'mount' | 'back';
/** Clinch ties: collar tie (neutral-ish control), double underhooks (body control, drive to the fence), Thai plum (head control, knees). */
export type ClinchTie = 'collar' | 'under' | 'plum';
export const ROUND_SECONDS = 75;
export const ARENA_L = 60;
export const ARENA_R = 420;
const MIN_GAP = 34;

export interface LiveEvent {
  type:
    | 'punch' | 'kick' | 'hit' | 'miss' | 'block' | 'parry' | 'evade' | 'feint' | 'counter'
    | 'kd' | 'getup' | 'ko' | 'tko' | 'clinch' | 'break' | 'knee' | 'shoot' | 'sprawl' | 'td'
    | 'gnp' | 'advance' | 'sweep' | 'standup' | 'sub' | 'tap' | 'escape' | 'bell' | 'rocked' | 'cut'
    | 'tie' | 'pummel' | 'fence' | 'trip' | 'pass' | 'scramble';
  side: Side;
  /** strike name (jab, hook, headkick...) */
  name?: string;
  big?: boolean;
  dmg?: number;
  target?: 'head' | 'body' | 'legs';
  hand?: 'lead' | 'rear';
  /** position before a transition (passes, sweeps) */
  from?: string;
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
  hand?: 'lead' | 'rear';
  /** front kick: shoves the other man back on contact */
  push?: number;
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
  /** a strike pressed while still busy: thrown the moment you're free (so inputs never get eaten) */
  buffer: { it: FightIntent; t: number } | null;
  /** just landed something: the next strike in the combo comes out faster */
  comboT: number;
  sinceHit: number;
  cut: number;
  /** grip-fighting cooldown (clinch moves, ground transitions) */
  grip: number;
  // stats
  landed: number;
  thrown: number;
  tds: number;
  kds: number;
  dealt: number;
  ctrl: number;
}

type PunchSpec = { name: string; reach: number; wind: number; rec: number; dmg: number; gas: number; target: 'head' | 'body' };
const PUNCH: Record<PunchType, PunchSpec> = {
  jab: { name: 'jab', reach: 56, wind: 0.09, rec: 0.13, dmg: 3.2, gas: 1.0, target: 'head' },
  straight: { name: 'cross', reach: 53, wind: 0.14, rec: 0.2, dmg: 6, gas: 2, target: 'head' },
  hook: { name: 'hook', reach: 44, wind: 0.17, rec: 0.24, dmg: 7, gas: 2.4, target: 'head' },
  uppercut: { name: 'uppercut', reach: 40, wind: 0.17, rec: 0.26, dmg: 7.5, gas: 2.4, target: 'head' },
  overhand: { name: 'overhand', reach: 50, wind: 0.23, rec: 0.3, dmg: 8.5, gas: 3, target: 'head' },
  bodyJab: { name: 'body jab', reach: 54, wind: 0.1, rec: 0.16, dmg: 3, gas: 1.1, target: 'body' },
  bodyStraight: { name: 'body shot', reach: 52, wind: 0.16, rec: 0.24, dmg: 6, gas: 2.2, target: 'body' },
  bodyHook: { name: 'body hook', reach: 42, wind: 0.18, rec: 0.26, dmg: 7.5, gas: 2.6, target: 'body' },
  spinBackfist: { name: 'spinning backfist', reach: 48, wind: 0.27, rec: 0.36, dmg: 9.5, gas: 3.4, target: 'head' },
};
const WEIGHT: Record<Weight, { wind: number; dmg: number; gas: number; rec: number }> = {
  light: { wind: 0.8, dmg: 0.7, gas: 0.7, rec: 0.85 },
  medium: { wind: 1, dmg: 1, gas: 1, rec: 1 },
  heavy: { wind: 1.5, dmg: 1.55, gas: 1.6, rec: 1.3 },
};
const KICK: Record<'low' | 'body' | 'head' | 'front' | 'spin', { name: string; reach: number; wind: number; rec: number; dmg: number; target: 'head' | 'body' | 'legs'; heavy: boolean; push?: number }> = {
  low: { name: 'legkick', reach: 52, wind: 0.2, rec: 0.3, dmg: 5.5, target: 'legs', heavy: false },
  body: { name: 'kick', reach: 56, wind: 0.24, rec: 0.34, dmg: 7, target: 'body', heavy: false },
  head: { name: 'headkick', reach: 58, wind: 0.31, rec: 0.42, dmg: 11, target: 'head', heavy: true },
  front: { name: 'front kick', reach: 60, wind: 0.2, rec: 0.3, dmg: 5, target: 'body', heavy: false, push: 18 },
  spin: { name: 'spinning back kick', reach: 56, wind: 0.34, rec: 0.48, dmg: 12, target: 'body', heavy: true },
};
const GPOS_DMG: Record<GPos, number> = { guard: 0.55, half: 0.75, side: 0.9, mount: 1.3, back: 1.05 };
/** Passing order for the man on top. */
const NEXT_POS: Record<GPos, GPos> = { guard: 'half', half: 'side', side: 'mount', mount: 'back', back: 'back' };
/** Where the man underneath gets back to when he recovers. */
const RECOVER: Record<GPos, GPos> = { back: 'guard', mount: 'half', side: 'half', half: 'guard', guard: 'guard' };
/** How hard each position is to get up from (bottom man). */
const STAND_K: Record<GPos, number> = { guard: 1.3, half: 1, side: 0.8, mount: 0.5, back: 0.6 };
export const GPOS_NAME: Record<GPos, string> = { guard: 'full guard', half: 'half guard', side: 'side control', mount: 'mount', back: 'the back' };

/** Submissions by position and stick direction (top man / man underneath). */
const SUB_TOP: Record<GPos, Partial<Record<Dir, string>>> = {
  guard: { down: 'ankle lock', away: 'ankle lock' },
  half: { neutral: 'kimura', toward: 'kimura', up: "d'arce choke", down: 'americana', away: 'kneebar' },
  side: { neutral: 'arm-triangle choke', toward: 'americana', up: 'north-south choke', down: 'kimura', away: 'armbar' },
  mount: { neutral: 'armbar', toward: 'ezekiel choke', up: 'arm-triangle choke', down: 'americana', away: 'armbar' },
  back: { neutral: 'rear-naked choke', toward: 'rear-naked choke', up: 'neck crank', down: 'bow and arrow choke', away: 'armbar' },
};
const SUB_BOT: Partial<Record<GPos, Partial<Record<Dir, string>>>> = {
  guard: { neutral: 'triangle choke', toward: 'armbar', up: 'guillotine', down: 'heel hook', away: 'omoplata' },
  half: { neutral: 'kimura', toward: 'kimura', up: 'guillotine', down: 'kneebar', away: 'heel hook' },
};
/** Starting grip on each hold (higher = closer to the tap). Leg locks are quick but you give up position if they fail. */
const SUB_START: Record<string, number> = {
  'rear-naked choke': 0.36, 'bow and arrow choke': 0.33, 'neck crank': 0.26, armbar: 0.3, 'triangle choke': 0.3, guillotine: 0.28,
  'arm-triangle choke': 0.3, "d'arce choke": 0.28, 'north-south choke': 0.26, 'ezekiel choke': 0.22, kimura: 0.27, americana: 0.28,
  omoplata: 0.22, 'heel hook': 0.34, kneebar: 0.3, 'ankle lock': 0.26,
};
export const LEG_LOCKS = new Set(['heel hook', 'kneebar', 'ankle lock']);

const clamp = (v: number, a: number, b: number) => Math.max(a, Math.min(b, v));
const LINE_KEY: Record<string, string> = {
  td: 'takedown', sprawl: 'takedown', ctrl: 'ground_control', sub: 'sub_attempt', sweep: 'sweep', escape: 'escape', rocked: 'rocked', kd: 'knockdown',
  cut: 'cut', headkick: 'land_headkick', legkick: 'land_legkick', kick: 'land_bodykick', knee: 'clinch_work', elbow: 'clinch_work', clinch: 'clinch_work',
  round_start: 'round_start', bell: 'round_end', tap: 'tap', ko: 'ko_live', tko: 'tko_live', getup: 'standup', standup: 'standup', idle: 'clinch_work',
};

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
  /** what the last tap of each ground progress bar was working toward (switching resets most of it) */
  private gKey = '';
  private sKey = '';
  /** the clinch: who has the better tie (-1 = even), which tie, who is pinned on the fence (-1 = nobody) */
  clinch: { dom: Side | -1; tie: ClinchTie; fence: Side | -1; idle: number } = { dom: -1, tie: 'collar', fence: -1, idle: 0 };
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
      act: null, block: false, parryT: 0, evade: null, stun: 0, down: 0, getup: 0, kdsRound: 0, counterT: 0, buffer: null, comboT: 0, sinceHit: 9, cut: 0, grip: 0,
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
  context(i: Side): { grounded: boolean; clinch: boolean; beingShot: boolean; submission: 'attack' | 'defend' | null; knockedDown: boolean } {
    return {
      grounded: this.pos === 'ground',
      clinch: this.pos === 'clinch',
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
    // the same situation keys the sim uses, so the booth and Bleeter react to hands-on fights too
    const key = /spinning/.test(text) ? 'land_spinning' : act === 'punch' && /body/.test(text) ? 'land_body' : LINE_KEY[act];
    this.log.push({ round: this.round, t: Math.round(300 - (this.clock / ROUND_SECONDS) * 300), text, side, intensity, act, pos, hp: [Math.round(this.F[0].hp), Math.round(this.F[1].hp)], key });
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
    f.comboT = Math.max(0, f.comboT - dt);
    if (f.buffer) {
      f.buffer.t -= dt;
      if (f.buffer.t <= 0) f.buffer = null;
      else if (!f.act && f.stun <= 0.15 && f.down <= 0) {
        const it = f.buffer.it;
        f.buffer = null;
        this.intent(i, it);
      }
    }
    f.parryT = Math.max(0, f.parryT - dt);
    f.grip = Math.max(0, f.grip - dt);
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
    if (f.act) {
      // one thing at a time, but remember the next strike so a quick combo isn't lost
      if (it.type === 'punch' || it.type === 'kick' || it.type === 'feint') f.buffer = { it, t: 0.35 };
      return;
    }
    switch (it.type) {
      case 'punch': {
        if (this.pos === 'ground') {
          if (this.top !== i) {
            // punches from the bottom: short and weak
            this.startAct(f, { kind: 'gnp', name: 'punch', wind: 0.14, rec: 0.2, dmg: 2.4, reach: 99, target: 'head', heavy: false }, 1.2);
            return;
          }
          const w = WEIGHT[it.weight];
          const body = PUNCH[it.punch].target === 'body';
          this.startAct(f, { kind: 'gnp', name: it.punch === 'uppercut' || it.weight === 'heavy' ? 'elbow' : body ? 'body punch' : 'punch', wind: 0.14 * w.wind, rec: 0.18 * w.rec, dmg: 4.2 * w.dmg * GPOS_DMG[this.gpos] * (body ? 0.8 : 1), reach: 99, target: body ? 'body' : 'head', heavy: it.weight === 'heavy' }, 1.6 * w.gas);
          return;
        }
        if (this.pos === 'clinch') {
          // dirty boxing: short hooks, uppercuts, elbows (heavy), body shots
          const body = PUNCH[it.punch].target === 'body';
          const elbow = it.weight === 'heavy' && !body;
          const name = elbow ? 'elbow' : body ? 'body shot' : it.punch === 'uppercut' ? 'uppercut' : 'short hook';
          const dmg = (elbow ? 6 : it.punch === 'uppercut' ? 5 : body ? 4.5 : 3.6) * (it.weight === 'light' ? 0.75 : 1) * this.tieK(i);
          this.startAct(f, { kind: 'punch', name, wind: elbow ? 0.17 : 0.12, rec: elbow ? 0.24 : 0.17, dmg, reach: 99, target: body ? 'body' : 'head', heavy: elbow, hand: it.hand }, elbow ? 2.6 : 1.8);
          this.ev({ type: 'punch', side: i, name, big: elbow, hand: it.hand });
          return;
        }
        const p = PUNCH[it.punch];
        const w = WEIGHT[it.weight];
        const tired = f.gas < 20 ? 1.3 : 1;
        this.startAct(f, { kind: 'punch', name: p.name, wind: p.wind * w.wind * tired, rec: p.rec * w.rec * tired, dmg: p.dmg * w.dmg * (0.85 + it.pressure * 0.15), reach: p.reach, target: p.target, heavy: it.weight === 'heavy' || it.punch === 'spinBackfist', hand: it.hand }, p.gas * w.gas);
        this.ev({ type: 'punch', side: i, name: p.name, big: it.weight === 'heavy', hand: it.hand });
        return;
      }
      case 'kick': {
        if (this.pos === 'clinch') {
          // knees: to the head only from the plum, otherwise the body (or a thigh knee)
          const plum = this.clinch.dom === i && this.clinch.tie === 'plum';
          const target = it.level === 'head' && plum ? 'head' : it.level === 'low' ? 'legs' : 'body';
          const dmg = (target === 'head' ? 10 : target === 'legs' ? 4 : 6.5) * this.tieK(i) * (this.clinch.fence === 1 - i ? 1.1 : 1);
          this.startAct(f, { kind: 'knee', name: 'knee', wind: target === 'head' ? 0.22 : 0.18, rec: 0.26, dmg, reach: 99, target, heavy: target === 'head' }, 3);
          this.ev({ type: 'kick', side: i, name: 'knee', big: target === 'head' });
          return;
        }
        if (this.pos !== 'stand') return;
        const k = KICK[it.level];
        const tired = f.gas < 20 ? 1.3 : 1;
        this.startAct(f, { kind: 'kick', name: k.name, wind: k.wind * tired, rec: k.rec * tired, dmg: k.dmg * (0.6 + f.legs / 250), reach: k.reach, target: k.target, heavy: k.heavy, push: k.push }, it.level === 'spin' ? 4.5 : 3.5);
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
        if (this.pos === 'clinch') return this.clinchMove(i, 'break');
        if (this.pos !== 'stand' || this.dist > 54) return;
        f.gas = Math.max(0, f.gas - 3);
        if (this.rng.chance(clamp(0.45 + (f.sk.wrestling - o.sk.wrestling) / 120 + (o.stun > 0 ? 0.3 : 0) + (o.act ? 0.15 : 0), 0.1, 0.9))) {
          this.pos = 'clinch';
          this.clinchT = 0;
          // whoever initiates gets the first tie: a collar tie
          this.clinch = { dom: i, tie: 'collar', fence: -1, idle: 0 };
          this.ev({ type: 'clinch', side: i });
          this.line(i, 'clinch', `${this.name(i)} ties him up with a collar tie.`);
        } else this.ev({ type: 'miss', side: i, name: 'clinch' });
        return;
      case 'clinchMove':
        if (this.pos !== 'clinch') return;
        return this.clinchMove(i, it.move);
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
        if (this.pos !== 'ground' || f.grip > 0) return;
        f.grip = 0.12;
        return this.top === i ? this.topMove(i, it.move) : this.bottomMove(i, it.move);
      case 'subAttempt': {
        if (this.pos !== 'ground') return;
        const isTop = this.top === i;
        const table = isTop ? SUB_TOP[this.gpos] : SUB_BOT[this.gpos];
        const name = table?.[it.dir] ?? table?.neutral ?? Object.values(table ?? {})[0];
        if (!name) {
          // nothing on from here (flat on your back under side control, mount, back)
          this.ev({ type: 'miss', side: i, name: 'sub' });
          return;
        }
        const opening = o.stun > 0 || o.hp < 40 ? 0.15 : 0;
        const tired = o.gas < 30 ? 0.08 : 0;
        this.sub = { atk: i, prog: (SUB_START[name] ?? 0.28) + opening + tired + (isTop ? 0 : -0.04), name };
        f.gas = Math.max(0, f.gas - 4);
        this.ev({ type: 'sub', side: i, name });
        this.line(i, 'sub', `${this.name(i)} goes for a ${name}!`, 3);
        return;
      }
    }
  }

  /** Damage multiplier from the clinch tie: the man with the better tie hits harder, the tied-up man less. */
  private tieK(i: Side): number {
    const c = this.clinch;
    if (this.pos !== 'clinch' || c.dom < 0) return 1;
    if (c.dom === i) return c.tie === 'plum' ? 1.25 : c.tie === 'under' ? 1.05 : 1.12;
    return c.tie === 'plum' ? 0.65 : 0.8;
  }

  /** Grip fighting in the clinch: plum, underhooks, pummel back to even, trip, break away. */
  private clinchMove(i: Side, move: 'plum' | 'under' | 'pummel' | 'trip' | 'break'): void {
    const f = this.F[i];
    const o = this.F[(1 - i) as Side];
    const c = this.clinch;
    if (f.grip > 0 || f.act) return;
    f.grip = 0.35;
    const cs = (x: LiveFighter) => x.sk.wrestling * 0.55 + x.sk.grappling * 0.2 + x.sk.power * 0.25;
    const edge = (cs(f) - cs(o)) / 110 + (f.gas - o.gas) / 400;
    const mine = c.dom === i;
    const theirs = c.dom === 1 - i;
    f.gas = Math.max(0, f.gas - (move === 'trip' ? 4 : 1.6));
    f.exert += 2;
    c.idle = 0;
    if (move === 'break') {
      const p = clamp(0.5 + edge - (theirs ? (c.tie === 'plum' ? 0.25 : 0.15) : 0) + (mine ? 0.2 : 0) - (c.fence === i ? 0.15 : 0), 0.12, 0.92);
      if (this.rng.chance(p)) {
        this.pos = 'stand';
        this.nudge(i, -18);
        this.ev({ type: 'break', side: i });
        this.line(i, 'idle', `${this.name(i)} breaks free.`);
      } else this.ev({ type: 'miss', side: i, name: 'break' });
      return;
    }
    if (move === 'trip') {
      const bonus = mine ? (c.tie === 'under' ? 0.3 : c.tie === 'collar' ? 0.12 : 0.04) : theirs ? -0.2 : 0;
      const p = clamp(0.22 + edge * 1.2 + bonus + (c.fence === 1 - i ? 0.1 : 0) + (o.gas < 40 ? 0.12 : 0) + (o.stun > 0 ? 0.2 : 0), 0.06, 0.85);
      if (this.rng.chance(p)) {
        this.pos = 'ground';
        this.top = i;
        this.gpos = mine && c.tie === 'under' && this.rng.chance(0.4) ? 'side' : this.rng.chance(0.5) ? 'half' : 'guard';
        this.gprog = this.standProg = 0;
        this.groundIdle = 0;
        this.gKey = this.sKey = '';
        f.tds++;
        this.score(i, 3);
        o.gas = Math.max(0, o.gas - 5);
        this.ev({ type: 'trip', side: i });
        this.ev({ type: 'td', side: i, name: 'trip' });
        this.line(i, 'td', `${this.name(i)} trips him to the mat${this.gpos === 'side' ? ' and lands in side control' : ''}!`, 2);
      } else {
        f.stun = 0.3;
        // a failed trip gives the other man the better position
        if (!theirs) {
          c.dom = (1 - i) as Side;
          c.tie = 'under';
        }
        this.score((1 - i) as Side, 0.6);
        this.ev({ type: 'miss', side: i, name: 'trip' });
      }
      return;
    }
    if (move === 'pummel') {
      // fight hands: break his grip back to even, or win a collar tie from even
      const p = clamp((theirs ? 0.45 : 0.55) + edge, 0.15, 0.9);
      if (!this.rng.chance(p)) return this.ev({ type: 'miss', side: i, name: 'pummel' });
      if (theirs) {
        c.dom = -1;
        this.ev({ type: 'pummel', side: i });
      } else if (!mine) {
        c.dom = i;
        c.tie = 'collar';
        this.ev({ type: 'tie', side: i, name: 'collar' });
      }
      return;
    }
    // plum / underhooks
    if (mine && c.tie === move) {
      if (move === 'under') this.drive(i, 10); // already there: walk him to the fence
      return;
    }
    const p = clamp(0.38 + edge + (mine ? 0.25 : theirs ? -0.18 : 0), 0.08, 0.88);
    if (!this.rng.chance(p)) return this.ev({ type: 'miss', side: i, name: move });
    if (theirs) {
      // you can't jump straight from his plum to yours: first you get back to even
      c.dom = -1;
      this.ev({ type: 'pummel', side: i });
      return;
    }
    c.dom = i;
    c.tie = move;
    this.score(i, 0.6);
    this.ev({ type: 'tie', side: i, name: move });
    this.line(i, 'clinch', move === 'plum' ? `${this.name(i)} locks up the Thai plum.` : `${this.name(i)} gets double underhooks.`);
  }

  /** Walk the clinch toward the other man's side of the cage. */
  private drive(i: Side, dx: number): void {
    const s = i === 0 ? 1 : -1;
    this.F[0].x += s * dx;
    this.F[1].x += s * dx;
    this.clampPair();
  }

  private clampPair(): void {
    const mid = (this.F[0].x + this.F[1].x) / 2;
    const m = clamp(mid, ARENA_L + 14, ARENA_R - 14);
    this.F[0].x += m - mid;
    this.F[1].x += m - mid;
    const c = this.clinch;
    const was = c.fence;
    c.fence = m <= ARENA_L + 16 ? 0 : m >= ARENA_R - 16 ? 1 : -1;
    if (c.fence >= 0 && c.fence !== was) {
      this.ev({ type: 'fence', side: (1 - c.fence) as Side });
      this.line((1 - c.fence) as Side, 'clinch', `${this.name((1 - c.fence) as Side)} pins him against the fence.`);
    }
  }

  // ------------------------------------------------------------ ground transitions

  /** Top man: toward = pass (guard > half > side > mount), up = take the back, away = stand up out of it, down = heavy pressure. */
  private topMove(i: Side, move: 'advance' | 'reverse' | 'standup' | 'base'): void {
    const f = this.F[i];
    const o = this.F[(1 - i) as Side];
    const ratio = ((0.6 + f.sk.grappling / 120) / (0.6 + o.sk.grappling / 120)) * this.gasK(f) * (o.block ? 0.8 : 1);
    if (move === 'base') {
      // posture and weight: drain him, kill his escape
      o.gas = Math.max(0, o.gas - 2.5);
      this.standProg = Math.max(0, this.standProg - 0.12 * ratio);
      f.gas = Math.max(0, f.gas - 1);
      this.score(i, 0.15);
      return;
    }
    let goal: GPos | 'stand' | null;
    if (move === 'reverse') goal = 'stand';
    else if (move === 'standup') goal = this.gpos === 'guard' ? 'stand' : this.gpos === 'back' ? null : 'back';
    else goal = this.gpos === 'back' ? null : NEXT_POS[this.gpos];
    if (!goal) return;
    if (this.gKey !== goal) {
      this.gprog *= 0.4;
      this.gKey = goal;
    }
    const k = goal === 'stand' ? 0.34 : goal === 'back' ? (this.gpos === 'half' ? 0.12 : 0.16) : this.gpos === 'guard' ? 0.2 : 0.22;
    this.gprog += k * ratio;
    f.gas = Math.max(0, f.gas - 2);
    f.exert += 1.5;
    if (this.gprog < 1) return;
    this.gprog = 0;
    this.gKey = '';
    if (goal === 'stand') {
      this.line(i, 'getup', `${this.name(i)} stands up out of it.`);
      return this.standUp(i);
    }
    const from = this.gpos;
    this.gpos = goal;
    this.standProg = 0;
    this.groundIdle = 0;
    this.score(i, goal === 'half' ? 1 : 1.5);
    this.ev({ type: 'pass', side: i, name: goal, from });
    this.line(i, 'ctrl', goal === 'back' ? `${this.name(i)} takes the back!` : `${this.name(i)} passes to ${GPOS_NAME[goal]}.`, 2);
  }

  /** Man underneath: toward = sweep, away = recover guard, up = get back to the feet, down = frame and defend. */
  private bottomMove(i: Side, move: 'advance' | 'reverse' | 'standup' | 'base'): void {
    const f = this.F[i];
    const o = this.F[(1 - i) as Side];
    const ratio = ((0.6 + f.sk.wrestling / 140 + f.sk.grappling / 300) / (0.6 + o.sk.wrestling / 140 + o.sk.grappling / 300)) * this.gasK(f);
    if (move === 'base') {
      // frames and hip escapes: undo his passing work
      this.gprog = Math.max(0, this.gprog - 0.16 * ratio);
      f.gas = Math.max(0, f.gas - 1.4);
      return;
    }
    const goal = move === 'advance' ? (this.gpos === 'guard' || this.gpos === 'half' ? 'sweep' : 'recover') : move === 'reverse' ? 'recover' : 'stand';
    if (goal === 'recover' && this.gpos === 'guard') return;
    if (this.sKey !== goal) {
      this.standProg *= 0.4;
      this.sKey = goal;
    }
    const k = goal === 'sweep' ? (this.gpos === 'guard' ? 0.15 : 0.13) : goal === 'recover' ? (this.gpos === 'back' ? 0.11 : 0.16) : 0.19 * STAND_K[this.gpos];
    this.standProg += k * ratio;
    f.gas = Math.max(0, f.gas - 2.5);
    f.exert += 2;
    if (this.standProg < 1) return;
    this.standProg = 0;
    this.sKey = '';
    if (goal === 'stand') return this.standUp(i);
    const from = this.gpos;
    this.groundIdle = 0;
    if (goal === 'recover') {
      this.gpos = RECOVER[this.gpos];
      this.gprog = 0;
      this.score(i, 0.8);
      this.ev({ type: 'pass', side: (1 - i) as Side, name: this.gpos, from });
      this.line(i, 'escape', `${this.name(i)} recovers ${GPOS_NAME[this.gpos]}.`);
      return;
    }
    this.top = i;
    this.gpos = from === 'guard' && this.rng.chance(0.3) ? 'mount' : 'half';
    this.gprog = 0;
    this.score(i, 2);
    this.ev({ type: 'sweep', side: i, name: this.gpos, from });
    this.line(i, 'sweep', `${this.name(i)} sweeps! He's on top in ${GPOS_NAME[this.gpos]}.`, 2);
  }

  private startAct(f: LiveFighter, a: Omit<Act, 't' | 'done'>, gas: number): void {
    const chain = f.comboT > 0 && (a.kind === 'punch' || a.kind === 'kick' || a.kind === 'knee') ? 0.75 : 1;
    f.act = { ...a, wind: a.wind * chain, rec: a.rec * chain, t: 0, done: false };
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
      if (this.pos === 'clinch') {
        // both men lean on each other; the stronger push (and the man with underhooks) walks the pair
        const c = this.clinch;
        const str = (i: Side) => (0.5 + this.F[i].sk.wrestling / 140) * this.gasK(this.F[i]) * (c.dom === i ? (c.tie === 'under' ? 1.6 : 1.2) : c.dom < 0 ? 1 : 0.6);
        let v = clamp(moves[0], -1, 1) * str(0) + clamp(moves[1], -1, 1) * str(1);
        if (c.dom >= 0 && c.tie === 'under') v += (c.dom === 0 ? 1 : -1) * 0.35;
        this.F[0].x += v * 26 * dt;
        this.F[1].x += v * 26 * dt;
        this.clampPair();
      }
      return;
    }
    for (const i of [0, 1] as Side[]) {
      const f = this.F[i];
      if (f.stun > 0.3 || (f.act && f.act.kind !== 'feint')) continue;
      const speed = 90 * (0.55 + f.legs / 220) * (0.6 + f.gas / 250) * (f.block ? 0.6 : 1);
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
      f.stun = Math.max(f.stun, /spinning/.test(a.name) ? 0.5 : a.heavy ? 0.25 : 0.08);
      o.counterT = a.heavy ? 0.5 : 0.2;
      this.ev({ type: 'miss', side: i, name: a.name });
      return;
    }
    // defence: evade, parry, block
    const ev = o.evade;
    if (ev && ev.t < 0.32 && this.pos === 'stand') {
      const head = a.target === 'head';
      const dodged = (ev.kind === 'slip' && head && (a.name === 'jab' || a.name === 'cross' || a.name === 'overhand' || a.name === 'spinning backfist'))
        || (ev.kind === 'roll' && head && (a.name === 'hook' || a.name === 'overhand' || a.name === 'headkick' || a.name === 'spinning backfist'))
        || (ev.kind === 'pull' && a.name !== 'front kick');
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
    // ducking under the hands drops you onto the body shot
    if (o.evade && o.evade.t < 0.32 && o.evade.kind === 'roll' && a.target === 'body') dmg *= 1.3;
    if (this.pos === 'stand' && a.kind === 'punch' && this.dist < a.reach * 0.5 && (a.name === 'jab' || a.name === 'cross')) dmg *= 0.6; // jammed
    if (o.block && o.stun <= 0) {
      // a high guard covers the head; shots to the body and legs get through more of it
      const through = a.target === 'legs' ? 0.55 : a.target === 'body' ? (a.heavy ? 0.55 : 0.42) : a.heavy ? 0.32 : 0.18;
      dmg *= through;
      o.gas = Math.max(0, o.gas - 1.5);
      if (a.target === 'legs') f.legs = Math.max(0, f.legs - 2.5); // checked
      this.ev({ type: 'block', side: (1 - i) as Side, name: a.name });
      this.apply(i, a.target, dmg, false, false);
      return;
    }
    f.landed++;
    f.comboT = 0.45;
    if (this.pos === 'clinch') this.clinch.idle = 0;
    if (a.push && this.pos === 'stand') {
      // the front kick shoves him off and stops whatever he was winding up
      this.nudge((1 - i) as Side, -a.push);
      if (o.act && !o.act.done) o.act = null;
    }
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
      if (big) this.line(i, name === 'headkick' ? 'headkick' : name === 'knee' ? 'knee' : name === 'elbow' ? 'elbow' : /kick/.test(name) ? (name === 'legkick' ? 'legkick' : 'kick') : 'punch', `${counter ? 'COUNTER! ' : ''}${this.name(i)} lands a big ${name === 'headkick' ? 'head kick' : name === 'legkick' ? 'leg kick' : name}.`, 2);
    }
    if (target === 'head') {
      const k = 1.25 - o.sk.chin / 200;
      o.hp -= dmg * k;
      o.hpMax = Math.max(35, o.hpMax - dmg * k * 0.18);
      o.stun = Math.max(o.stun, big ? 0.32 : 0.12);
      if (big && this.rng.chance(name === 'elbow' ? 0.3 : 0.12)) {
        o.cut++;
        this.ev({ type: 'cut', side: (1 - i) as Side });
        this.line(i, 'cut', `${this.name((1 - i) as Side)} is cut open.`, 2);
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
    const c = this.clinch;
    c.idle += dt;
    for (const f of this.F) f.ctrl += dt * 0.3;
    const dom = c.dom;
    const fence = c.fence;
    if (dom !== -1) {
      this.F[dom].ctrl += dt * 0.5;
      this.score(dom, dt * (fence === 1 - dom ? 0.3 : 0.18));
    }
    // pinned on the fence: carrying his weight wears you down
    if (fence !== -1) this.F[fence].gas = Math.max(0, this.F[fence].gas - dt * 1.6);
    if (c.idle > 6) {
      this.pos = 'stand';
      this.F[0].x -= 14;
      this.F[1].x += 14;
      this.fixGap();
      this.ev({ type: 'break', side: 0 });
      this.line(-1, 'idle', 'The referee breaks them up.');
    }
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
      const r = this.rng.next();
      this.gpos = r < 0.18 ? 'side' : r < 0.45 ? 'half' : 'guard';
      this.gprog = 0;
      this.gKey = this.sKey = '';
      this.standProg = 0;
      this.groundIdle = 0;
      f.tds++;
      this.score(i, 3);
      o.gas = Math.max(0, o.gas - 5);
      this.ev({ type: 'td', side: i });
      this.line(i, 'td', `${this.name(i)} takes him down${this.gpos === 'guard' ? '' : ` into ${GPOS_NAME[this.gpos]}`}!`, 2);
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
    this.ev({ type: 'standup', side: i, name: this.top === i ? 'top' : 'bottom' });
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
      this.sub.prog += dt * (0.02 + (100 - d.gas) / 2500) - dt * 0.05;
      d.gas = Math.max(0, d.gas - dt * 4);
      if (this.sub.prog >= 1) return this.finish(this.sub.atk, 'SUB', this.sub.name);
      if (this.sub.prog <= 0) {
        const esc = (1 - this.sub.atk) as Side;
        this.ev({ type: 'escape', side: esc });
        this.line(esc, 'escape', `${this.name(esc)} escapes!`, 2);
        // a failed sub costs position: from the top he gets back to guard, a missed leg lock is a scramble
        const name = this.sub.name;
        const atk = this.sub.atk;
        this.sub = null;
        this.groundIdle = 0;
        if (LEG_LOCKS.has(name) && this.rng.chance(0.5)) {
          this.ev({ type: 'scramble', side: esc });
          if (this.rng.chance(0.5)) return this.standUp(esc);
          this.top = esc;
          this.gpos = 'half';
          this.line(esc, 'sweep', `${this.name(esc)} wins the scramble and comes up on top.`, 2);
          return;
        }
        if (atk === this.top) {
          const from = this.gpos;
          this.gpos = from === 'back' || from === 'mount' ? (this.rng.chance(0.5) ? 'guard' : 'half') : from === 'side' ? 'half' : 'guard';
          if (from !== this.gpos) this.ev({ type: 'pass', side: atk, name: this.gpos, from });
        } else if (this.gpos === 'guard' && this.rng.chance(0.4)) {
          this.gpos = 'half';
          this.ev({ type: 'pass', side: this.top, name: 'half', from: 'guard' });
        }
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
    this.clinch = { dom: -1, tie: 'collar', fence: -1, idle: 0 };
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
      const atk = L.sub.atk === this.side;
      // defending a hold is instinct: everybody fights hands, the better grappler/wrestler fights them better
      if (this.rng.chance(dt * (atk ? 4 + sk.grappling / 18 : 5.5 + Math.max(sk.grappling, sk.wrestling) / 16))) out.push({ type: 'mash', rate: 6, role: atk ? 'attack' : 'defend' });
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
        this.think = this.rng.float(0.16, 0.42) * (1.3 - iq * 0.5);
        const top = L.top === this.side;
        const grap = sk.grappling > sk.striking;
        const dirs: Dir[] = ['neutral', 'toward', 'up', 'down', 'away'];
        const r = this.rng.next();
        if (top) {
          const subOk = L.gpos !== 'guard' || (sk.grappling > 70 && this.rng.chance(0.15));
          if (subOk && (grap || this.plan === 'subhunt') && r < (this.plan === 'subhunt' ? 0.16 : 0.09) * (op.gas < 40 || op.stun > 0 ? 1.8 : 1)) out.push({ type: 'subAttempt', dir: L.gpos === 'back' ? 'neutral' : this.rng.pick(dirs) });
          else if (r < (this.plan === 'grind' || grap ? 0.55 : 0.32)) {
            // pass toward mount; good grapplers go for the back from side control and mount
            const back = (L.gpos === 'side' || L.gpos === 'mount') && sk.grappling > 60 && this.rng.chance(0.35);
            out.push({ type: 'ground', move: L.gpos === 'back' ? 'base' : back ? 'standup' : 'advance' });
          } else if (r < 0.62) out.push({ type: 'ground', move: 'base' });
          else if (this.plan === 'survive' || (sk.striking > sk.grappling + 15 && L.gpos === 'guard' && r > 0.95)) out.push({ type: 'ground', move: 'reverse' });
          else out.push({ type: 'punch', hand: 'rear', punch: this.rng.chance(0.25) ? 'bodyStraight' : 'straight', weight: this.rng.chance(0.3) ? 'heavy' : 'medium', hold: 0.2, pressure: 1, grounded: true });
        } else {
          const canSub = L.gpos === 'guard' || L.gpos === 'half';
          if (canSub && sk.grappling > 58 && r < 0.1) out.push({ type: 'subAttempt', dir: this.rng.pick(dirs) });
          else if (L.gprog > 0.5 && r < 0.45) out.push({ type: 'ground', move: 'base' });
          else if (r < 0.75) {
            const sweep = canSub && sk.grappling > sk.wrestling;
            const recover = !canSub && this.rng.chance(0.55);
            out.push({ type: 'ground', move: sweep ? 'advance' : recover ? 'reverse' : 'standup' });
          } else if (r < 0.9) {
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
      const c = L.clinch;
      const mine = c.dom === this.side;
      const theirs = c.dom === 1 - this.side;
      const wrestler = sk.wrestling > sk.striking;
      let move = 0;
      // lean on him: the wrestler with the better tie walks him to the fence
      if (mine && (c.tie === 'under' || wrestler)) move = toward;
      else if (theirs) move = toward * 0.6;
      if (this.think <= 0 && !me.act) {
        this.think = this.rng.float(0.22, 0.5) * (1.25 - iq * 0.4);
        const r = this.rng.next();
        if (theirs) {
          if (r < 0.45) out.push({ type: 'clinchMove', move: wrestler || this.rng.chance(0.7) ? 'pummel' : 'break' });
          else if (r < 0.52 && (!wrestler || me.hp < 40)) out.push({ type: 'clinchMove', move: 'break' });
          else out.push({ type: 'punch', hand: 'rear', punch: 'bodyStraight', weight: 'medium', hold: 0.2, pressure: 1, grounded: false });
        } else if (mine) {
          if (c.tie === 'plum') {
            if (r < 0.55) out.push({ type: 'kick', level: this.rng.chance(0.6) ? 'head' : 'body' });
            else if (r < 0.75) out.push({ type: 'punch', hand: 'rear', punch: 'straight', weight: 'heavy', hold: 0.4, pressure: 1, grounded: false });
            else if (r < 0.85) out.push({ type: 'clinchMove', move: 'trip' });
          } else if (c.tie === 'under') {
            if (r < 0.2 + sk.wrestling / 300) out.push({ type: 'clinchMove', move: 'trip' });
            else if (r < 0.55) out.push({ type: 'kick', level: this.rng.chance(0.3) ? 'low' : 'body' });
            else if (r < 0.7) out.push({ type: 'punch', hand: 'lead', punch: 'bodyHook', weight: 'medium', hold: 0.2, pressure: 1, grounded: false });
          } else {
            if (r < 0.4) out.push({ type: 'clinchMove', move: wrestler ? 'under' : 'plum' });
            else if (r < 0.75) out.push({ type: 'punch', hand: this.rng.chance(0.5) ? 'lead' : 'rear', punch: this.rng.chance(0.4) ? 'uppercut' : 'hook', weight: this.rng.chance(0.35) ? 'heavy' : 'medium', hold: 0.3, pressure: 1, grounded: false });
            else if (r < 0.85) out.push({ type: 'kick', level: 'body' });
          }
        } else {
          if (r < 0.45) out.push({ type: 'clinchMove', move: wrestler ? 'under' : this.rng.chance(0.6) ? 'plum' : 'pummel' });
          else if (r < 0.7) out.push({ type: 'punch', hand: 'rear', punch: this.rng.chance(0.3) ? 'uppercut' : 'straight', weight: this.rng.chance(0.4) ? 'heavy' : 'medium', hold: 0.3, pressure: 1, grounded: false });
          else if (r < 0.74 && !wrestler && me.hp < 45) out.push({ type: 'clinchMove', move: 'break' });
          else if (r < 0.88) out.push({ type: 'kick', level: 'body' });
        }
      }
      return { intents: out, move };
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
      else if (d < 54 && r < 0.09 + (wrestle ? 0.08 : 0) + (sk.wrestling > sk.striking ? 0.04 : 0)) out.push({ type: 'clinch' });
      else if (d < 58 && (r < 0.75 || opening) && !(this.plan === 'counter' && !opening && r > 0.35)) {
        const kick = this.plan === 'legs' ? 0.45 : 0.18 + (sk.striking > 65 ? 0.05 : 0);
        if (this.rng.chance(kick)) {
          const kr = this.rng.next();
          // a man coming forward eats a front kick; flashy strikers throw the spinning stuff now and then
          const level = op.act && d > 50 && kr < 0.2 ? 'front' : this.plan === 'legs' || kr < 0.42 ? 'low' : kr < 0.7 ? 'body' : kr < 0.84 ? 'head' : kr < 0.94 ? 'front' : sk.striking > 72 ? 'spin' : 'body';
          out.push({ type: 'kick', level });
        } else {
          // mix it up: work the body when he's covering up, go upstairs when he drops his hands
          const body = op.block ? 0.45 : op.body < 60 ? 0.3 : 0.15;
          const types: PunchType[] = d > 50
            ? ['jab', 'jab', 'straight', 'overhand', 'bodyJab', ...(sk.striking > 75 ? ['spinBackfist' as PunchType] : [])]
            : ['jab', 'straight', 'hook', 'hook', 'uppercut', 'bodyHook', 'bodyStraight'];
          let punch = this.rng.pick(types);
          if (this.rng.chance(body) && (punch === 'jab' || punch === 'straight' || punch === 'hook')) punch = punch === 'jab' ? 'bodyJab' : punch === 'straight' ? 'bodyStraight' : 'bodyHook';
          const weight: Weight = opening || this.rng.chance(0.2 + sk.power / 400) ? 'heavy' : this.rng.chance(0.5) ? 'medium' : 'light';
          const lead = punch === 'jab' || punch === 'bodyJab' || (punch === 'hook' && this.rng.chance(0.6)) || (punch === 'bodyHook' && this.rng.chance(0.5));
          out.push({ type: 'punch', hand: lead ? 'lead' : 'rear', punch, weight, hold: 0.2, pressure: 1, grounded: false });
        }
      } else if (r > 0.92) out.push({ type: 'feint' });
    }
    return { intents: out, move };
  }
}
