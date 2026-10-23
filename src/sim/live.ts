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
    | 'kd' | 'getup' | 'pounce' | 'ko' | 'tko' | 'clinch' | 'break' | 'knee' | 'shoot' | 'sprawl' | 'td'
    | 'gnp' | 'advance' | 'sweep' | 'standup' | 'sub' | 'tap' | 'escape' | 'bell' | 'rocked' | 'cut'
    | 'tie' | 'pummel' | 'fence' | 'trip' | 'pass' | 'scramble'
    | 'foul' | 'deduction' | 'injury' | 'doctor' | 'taunt'
    | 'catch' | 'interrupt' | 'pivot';
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
  /** a light (flicked) strike: it chips, it doesn't finish */
  light?: boolean;
  /** started inside a counter window: it lands as a counter even if the window shut during the windup */
  counter?: boolean;
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
  /** parrying is a timing skill: after a press, the hands need a moment before the next one */
  parryCd: number;
  /** seconds since the last evade, and how many came back to back (each one starts later and costs more) */
  evadeLast: number;
  evadeChain: number;
  evade: { kind: 'slip' | 'roll' | 'pull' | 'lean'; t: number } | null;
  stun: number;
  /** >0 while on the canvas: seconds of the count elapsed */
  down: number;
  /** seconds left of being wound up by a taunt (comes forward reckless) */
  tilt?: number;
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
  /** the chin goes: every knockdown makes the next one likelier (1 = fresh) */
  frail: number;
  /** on a roll: landing shots in a row hits harder and quicker for a moment (0..1) */
  momentum: number;
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
type KickLevel = 'low' | 'body' | 'head' | 'front' | 'spin';
const KICK: Record<KickLevel, { name: string; reach: number; wind: number; rec: number; dmg: number; target: 'head' | 'body' | 'legs'; heavy: boolean; push?: number }> = {
  low: { name: 'legkick', reach: 52, wind: 0.2, rec: 0.3, dmg: 5.5, target: 'legs', heavy: false },
  body: { name: 'kick', reach: 56, wind: 0.24, rec: 0.34, dmg: 7, target: 'body', heavy: false },
  head: { name: 'headkick', reach: 58, wind: 0.31, rec: 0.42, dmg: 11, target: 'head', heavy: true },
  front: { name: 'front kick', reach: 60, wind: 0.2, rec: 0.3, dmg: 5, target: 'body', heavy: false, push: 18 },
  spin: { name: 'spinning back kick', reach: 56, wind: 0.34, rec: 0.48, dmg: 12, target: 'body', heavy: true },
};
const strikeReach = (): Record<string, number> => {
  const out: Record<string, number> = {};
  for (const k of Object.keys(PUNCH) as PunchType[]) out[PUNCH[k].name] = PUNCH[k].reach;
  for (const k of Object.keys(KICK) as KickLevel[]) out[KICK[k].name] = KICK[k].reach;
  return out;
};
/** How far each standing strike reaches (px), by the name the events carry. */
export const STRIKE_REACH: Record<string, number> = strikeReach();
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

/** The submission on from here for this stick direction (top man / man underneath), or null when there's nothing. */
export function subFor(top: boolean, gpos: GPos, dir: Dir): string | null {
  const table = top ? SUB_TOP[gpos] : SUB_BOT[gpos];
  if (!table) return null;
  return table[dir] ?? table.neutral ?? Object.values(table)[0] ?? null;
}

/** What a ground move (kick button + stick) works toward from here, as the HUD says it; '' when it does nothing. */
export function groundGoal(top: boolean, gpos: GPos, dir: Dir): string {
  if (top) {
    if (dir === 'toward') return gpos === 'back' ? '' : 'pass to ' + GPOS_NAME[NEXT_POS[gpos]];
    if (dir === 'up') return gpos === 'guard' ? 'stand up' : gpos === 'back' ? '' : 'take the back';
    if (dir === 'away') return 'stand up';
    return 'pressure';
  }
  if (dir === 'toward') return gpos === 'guard' || gpos === 'half' ? 'sweep' : 'recover ' + GPOS_NAME[RECOVER[gpos]];
  if (dir === 'away') return gpos === 'guard' ? '' : 'recover ' + GPOS_NAME[RECOVER[gpos]];
  if (dir === 'up') return 'stand up';
  return 'frame';
}

/** The clinch moves as the HUD names them. */
export const CLINCH_MOVE_NAME: Record<'plum' | 'under' | 'pummel' | 'trip' | 'break', string> = {
  plum: 'Thai plum', under: 'double underhooks', pummel: 'pummel', trip: 'trip', break: 'break away',
};

const clamp = (v: number, a: number, b: number) => Math.max(a, Math.min(b, v));
const LINE_KEY: Record<string, string> = {
  td: 'takedown', sprawl: 'takedown', ctrl: 'ground_control', sub: 'sub_attempt', sweep: 'sweep', escape: 'escape', rocked: 'rocked', kd: 'knockdown',
  cut: 'cut', headkick: 'land_headkick', legkick: 'land_legkick', kick: 'land_bodykick', knee: 'clinch_work', elbow: 'clinch_work', clinch: 'clinch_work',
  round_start: 'round_start', bell: 'round_end', tap: 'tap', ko: 'ko_live', tko: 'tko_live', getup: 'standup', standup: 'standup', idle: 'clinch_work',
};

/** Special rules for one fight (the story's boss fights). */
export interface LiveRules {
  /** nobody can be finished before this round: they beat the count, they escape, the doctor waves it on */
  protectUntil?: number;
  /** this side throws a disqualifying blow at this point (round, seconds into it) */
  dq?: { side: Side; round: number; at: number; text: string };
  /** no takedowns, no clinch: stand and bang */
  noGrappling?: boolean;
  /** the referee is bought: this side fouls more and never gets called; the other side always does */
  bought?: Side;
  referee?: string;
  /** knockdowns: 'mma' (no count: jump on him and finish it, or let him up) or 'count' (bareknuckle, amateur smokers) */
  koRules?: 'mma' | 'count';
}

export class LiveFight {
  F: [LiveFighter, LiveFighter];
  rules: LiveRules = {};
  private dqDone = false;
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
  /** per round, per side: knockdowns scored (a round with one is a 10-8 unless the other man answered) */
  rkd: [number, number][] = [[0, 0]];
  result: { winner: Side | -1; method: 'KO' | 'TKO' | 'SUB' | 'DEC' | 'DRAW' | 'NC' | 'DOC' | 'DQ'; detail: string; round: number; time: string } | null = null;
  /** in-fight injuries (fighter side, name, weeks out) and fouls, like the sim keeps */
  injuries: { side: Side; name: string; weeks: number }[] = [];
  fouls: { side: Side; text: string; penalized: boolean }[] = [];
  /** point deductions per round, per side */
  private ded: [number, number][] = [[0, 0]];
  /** a broken hand / bad shin hits softer for the rest of the fight */
  private hurtLimb: [Partial<Record<'lead' | 'rear' | 'legs', boolean>>, Partial<Record<'lead' | 'rear' | 'legs', boolean>>] = [{}, {}];
  /** commentary-ish lines (for the result's ticker) */
  log: TickerLine[] = [];
  /** circling off the cage: how long each man has pushed into it, the wait before he can again, the slide in progress */
  private pivotHold: [number, number] = [0, 0];
  private pivotCd: [number, number] = [0, 0];
  private pivotT: [number, number] = [0, 0];
  private rng: Rng;

  constructor(public A: Fighter, public B: Fighter, skA: Skills, skB: Skills, public rounds: 3 | 5, seed: number) {
    this.rng = new Rng(seed);
    const mk = (f: Fighter, sk: Skills, x: number): LiveFighter => ({
      id: f.id, sk, x, hp: 100, hpMax: 100, body: 100, legs: 100, gas: 100, bpm: 92, exert: 0,
      act: null, block: false, parryT: 0, parryCd: 0, evadeLast: 9, evadeChain: 0, evade: null, stun: 0, down: 0, getup: 0, kdsRound: 0, counterT: 0, buffer: null, comboT: 0, sinceHit: 9, cut: 0, grip: 0,
      frail: 1, momentum: 0,
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

  /** What each man on the ground is working toward right now (his progress bar), '' when nothing. */
  working(): { top: string; bottom: string } {
    if (this.pos !== 'ground') return { top: '', bottom: '' };
    const g = this.gKey;
    const top = g === 'stand' ? 'stand up' : g === 'back' ? (this.gpos === 'mount' ? 'pass to the back' : 'take the back') : g ? 'pass to ' + GPOS_NAME[g as GPos] : '';
    const k = this.sKey;
    const bottom = k === 'sweep' ? 'sweep' : k === 'recover' ? 'recover ' + GPOS_NAME[RECOVER[this.gpos]] : k === 'stand' ? 'stand up' : '';
    return { top, bottom };
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
    this.checkRules();
    this.checkEnd();
  }

  /** Scripted moments (boss fights). */
  private checkRules(): void {
    const d = this.rules.dq;
    if (!d || this.dqDone || this.result || this.round !== d.round) return;
    if (300 - (this.clock / ROUND_SECONDS) * 300 < d.at) return;
    this.dqDone = true;
    const v = (1 - d.side) as Side;
    this.F[d.side].act = null;
    this.F[v].act = null;
    this.F[v].stun = 2;
    this.F[v].hp = Math.max(1, this.F[v].hp - 6);
    this.pos = 'stand';
    this.sub = null;
    this.fouls.push({ side: d.side, text: 'Low blow (intentional)', penalized: true });
    this.ev({ type: 'foul', side: d.side, name: 'LOW BLOW' });
    this.line(d.side, 'foul', d.text, 3);
    this.log[this.log.length - 1].key = 'foul_groin';
    this.line(v, 'stop', `That's it. The referee waves it off: ${this.name(d.side)} is DISQUALIFIED!`, 3);
    this.log[this.log.length - 1].key = 'cannot_continue';
    this.result = { winner: v, method: 'DQ', detail: 'Disqualification (intentional low blow)', round: this.round, time: this.clockElapsed() };
    this.phase = 'over';
    this.ev({ type: 'tko', side: v });
  }

  /** Too early to finish this one (boss fights): he survives instead. */
  private protectedNow(loser: Side): boolean {
    if (!this.rules.protectUntil || this.round >= this.rules.protectUntil) return false;
    const f = this.F[loser];
    f.hp = Math.max(f.hp, 18);
    f.down = 0;
    f.getup = 0;
    f.stun = Math.max(f.stun, 0.8);
    this.sub = null;
    if (this.pos === 'ground') this.pos = 'stand';
    this.fixGap();
    this.ev({ type: 'getup', side: loser });
    this.line(loser, 'getup', `${this.name(loser)} is somehow still in this. He will NOT go away.`, 2);
    return true;
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
    f.parryCd = Math.max(0, f.parryCd - dt);
    f.evadeLast += dt;
    f.grip = Math.max(0, f.grip - dt);
    f.stun = Math.max(0, f.stun - dt);
    f.momentum = Math.max(0, f.momentum - dt * 0.35);
    if (f.tilt) f.tilt = Math.max(0, f.tilt - dt);
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
        if (f.parryCd > 0) return;
        f.parryT = 0.18;
        f.parryCd = 0.45;
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
        this.startAct(f, { kind: 'punch', name: p.name, wind: p.wind * w.wind * tired, rec: p.rec * w.rec * tired, dmg: p.dmg * w.dmg * (0.85 + it.pressure * 0.15), reach: p.reach, target: p.target, heavy: it.weight === 'heavy' || it.punch === 'spinBackfist', hand: it.hand, light: it.weight === 'light' }, p.gas * w.gas);
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
      case 'taunt':
        // showboating: hands down for a beat, a breath back, and it gets in his head
        if (this.pos !== 'stand' || this.dist < 46) return;
        this.startAct(f, { kind: 'feint', name: 'taunt', wind: 0.55, rec: 0.45, dmg: 0, reach: 0, target: 'head', heavy: false }, 0);
        f.block = false;
        f.gas = Math.min(100, f.gas + 4);
        o.tilt = 3 + this.rng.float(0, 1.5) - o.sk.fightIQ / 60;
        this.ev({ type: 'taunt', side: i });
        return;
      case 'evade':
        if (this.pos !== 'stand') return;
        // head movement is timing, not a reflex to mash: back-to-back evades start later (0.32 s of cover, then 0.22, 0.12, none) and cost more
        f.evadeChain = f.evadeLast < 0.7 ? f.evadeChain + 1 : 0;
        f.evadeLast = 0;
        // and a tired man's head moves late
        f.evade = { kind: it.kind, t: f.evadeChain * 0.1 + (f.gas < 20 ? 0.08 : 0) };
        f.gas = Math.max(0, f.gas - 1.5 * (1 + f.evadeChain));
        f.exert += 2;
        if (it.kind === 'pull') this.nudge(i, -14);
        if (it.kind === 'lean') this.nudge(i, 8);
        this.ev({ type: 'evade', side: i, name: it.kind });
        return;
      case 'clinch':
        if (this.pos === 'clinch') return this.clinchMove(i, 'break');
        if (this.pos !== 'stand' || this.dist > 54) return;
        if (this.rules.noGrappling) return this.ev({ type: 'miss', side: i, name: 'STAND AND BANG' });
        f.gas = Math.max(0, f.gas - 3);
        if (this.rng.chance(clamp(0.45 + (f.sk.wrestling - o.sk.wrestling) / 120 + (o.stun > 0 ? 0.3 : 0) + (o.act ? 0.15 : 0), 0.1, 0.9))) {
          this.pos = 'clinch';
          this.clinchT = 0;
          // whoever initiates gets the first tie: a collar tie
          this.clinch = { dom: i, tie: 'collar', fence: -1, idle: 0 };
          this.ev({ type: 'clinch', side: i });
          this.line(i, 'clinch', `${this.name(i)} ties him up with a collar tie.`);
          // tied up with his back already on the cage: it starts there
          const w = this.onWall(0) ? 0 : this.onWall(1) ? 1 : -1;
          if (w >= 0) this.drive((1 - w) as Side, 40);
        } else this.ev({ type: 'miss', side: i, name: 'clinch' });
        return;
      case 'clinchMove':
        if (this.pos !== 'clinch') return;
        return this.clinchMove(i, it.move);
      case 'shoot':
        if (this.pos === 'ground') return;
        if (this.pos === 'stand' && this.dist > 70) return;
        if (this.rules.noGrappling) return this.ev({ type: 'miss', side: i, name: 'STAND AND BANG' });
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
        const name = subFor(isTop, this.gpos, it.dir);
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
      // pinned on the fence, he grabs it to stay up: a foul (and no takedown)
      if (c.fence === 1 - i && this.rng.chance(0.08)) return this.foul((1 - i) as Side, 'fence');
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
    // a new position: both progress bars start over (and so do their labels)
    this.gKey = this.sKey = '';
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
    this.gKey = this.sKey = '';
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
    f.act = { ...a, wind: a.wind * chain, rec: a.rec * chain, t: 0, done: false, counter: f.counterT > 0 };
    f.gas = Math.max(0, f.gas - gas);
    f.exert += gas * 1.4;
    f.block = f.block && a.kind === 'feint';
    if (a.kind !== 'feint' && a.kind !== 'shoot') f.thrown++;
  }

  /** Standing with his back on the cage (pull has nowhere to go, he can only circle off). */
  onWall(i: Side): boolean {
    return i === 0 ? this.F[0].x <= ARENA_L + 6 : this.F[1].x >= ARENA_R - 6;
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
      this.stopPivots();
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
      const o = this.F[(1 - i) as Side];
      // back on the cage: the other man is winning the position
      if (this.onWall(i)) this.score((1 - i) as Side, dt * 0.05);
      // pushing back into the cage means circling off it
      this.pivotCd[i] = Math.max(0, this.pivotCd[i] - dt);
      const into = i === 0 ? moves[0] < -0.5 : moves[1] > 0.5;
      if (this.onWall(i) && !f.act && f.stun <= 0 && into) this.pivotHold[i] += dt;
      else this.pivotHold[i] = 0;
      if (this.pivotHold[i] >= 0.2 - 1e-6 && this.pivotCd[i] <= 0) {
        this.pivotHold[i] = 0;
        this.pivotCd[i] = 1;
        f.gas = Math.max(0, f.gas - 2);
        f.exert += 3;
        // walking in on the pivot, the smarter man cuts him off
        const cut = i === 0 ? moves[1] < -0.3 : moves[0] > 0.3;
        if (cut && this.rng.chance(0.3 + (o.sk.fightIQ - f.sk.fightIQ) / 200)) {
          this.slide(i, 8);
          o.counterT = 0.4;
          this.ev({ type: 'pivot', side: i, name: 'cutoff' });
        } else {
          this.pivotT[i] = 0.4;
          this.ev({ type: 'pivot', side: i, name: 'escape' });
        }
      }
      if (this.pivotT[i] > 0) {
        // the pair turns: both slide toward the middle of the cage for 0.25 s (30 px), then the circle settles
        // (holding back into the cage keeps him circling until it does, so he doesn't walk straight back onto it)
        const before = this.pivotT[i];
        this.pivotT[i] = before - dt > 1e-6 ? before - dt : 0;
        const slid = Math.max(0, before - Math.max(this.pivotT[i], 0.15));
        if (slid > 0) this.slide(i, 120 * slid);
        if (slid > 0 || into) continue;
      }
      if (f.stun > 0.3 || (f.act && f.act.kind !== 'feint')) continue;
      const speed = 90 * (0.55 + f.legs / 220) * (0.6 + f.gas / 250) * (f.block ? 0.6 : 1);
      f.x += clamp(moves[i], -1, 1) * speed * dt;
      if (Math.abs(moves[i]) > 0.2) f.exert += dt * 3;
    }
    this.fixGap();
  }

  /** A circle off the cage in progress ends with the exchange (a clinch, the mat, a knockdown, the bell). */
  private stopPivots(): void {
    this.pivotT[0] = 0;
    this.pivotT[1] = 0;
    this.pivotHold[0] = 0;
    this.pivotHold[1] = 0;
  }

  /** Both men shift off fighter i's wall, toward the middle of the cage. */
  private slide(i: Side, px: number): void {
    const dx = i === 0 ? px : -px;
    this.F[0].x += dx;
    this.F[1].x += dx;
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
      let dodged = (ev.kind === 'slip' && head && (a.name === 'jab' || a.name === 'cross' || a.name === 'overhand' || a.name === 'spinning backfist'))
        || (ev.kind === 'roll' && head && (a.name === 'hook' || a.name === 'overhand' || a.name === 'headkick' || a.name === 'spinning backfist'))
        || (ev.kind === 'lean' && head && (a.name === 'hook' || a.name === 'overhand' || a.name === 'spinning backfist'))
        || (ev.kind === 'pull' && a.name !== 'front kick' && !this.onWall((1 - i) as Side));
      // bad legs: the head moves late
      if (dodged && o.legs < 40 && this.rng.chance(0.3)) dodged = false;
      if (dodged) {
        // leaning in under a looping shot puts you inside, a beat from countering
        o.counterT = ev.kind === 'lean' ? 0.4 : 0.55;
        f.stun = Math.max(f.stun, 0.12);
        this.ev({ type: 'miss', side: i, name: a.name });
        this.ev({ type: 'evade', side: (1 - i) as Side, name: ev.kind, big: true });
        return;
      }
    }
    // accidents happen: eye pokes off a jab, low blows off a front or leg kick, knees to a downed man
    const dirty = this.rules.bought === i ? 6 : 1;
    if (this.pos === 'stand' && this.rng.chance((a.name === 'jab' || a.name === 'cross' ? 0.006 : a.name === 'front kick' || a.name === 'legkick' ? 0.012 : 0) * dirty)) {
      return this.foul(i, a.name === 'jab' || a.name === 'cross' ? 'eyepoke' : 'groin');
    }
    if (o.parryT > 0 && a.target === 'head' && a.kind === 'punch' && o.stun <= 0) {
      f.stun = 0.38;
      o.counterT = 0.6;
      o.parryT = 0;
      this.ev({ type: 'parry', side: (1 - i) as Side, name: a.name });
      return;
    }
    // (0.45: tuned down from 0.62 once the CPU stopped whiffing two thirds of its shots, so fights keep their length)
    let dmg = a.dmg * 0.45 * (0.55 + f.sk.power / 110) * this.gasK(f);
    dmg *= 0.78 + f.body / 450; // a body that's been worked over has no snap left
    dmg *= 1 + f.momentum * 0.1; // on a roll
    if (o.cut >= 2 && a.target === 'head') dmg *= 1.08; // blood in the eye: he doesn't see it coming
    const limb = this.hurtLimb[i];
    if ((a.hand === 'lead' && limb.lead) || (a.hand === 'rear' && limb.rear) || (a.kind === 'kick' && limb.legs)) dmg *= 0.5;
    const counter = f.counterT > 0 || !!a.counter;
    if (counter) {
      dmg *= 1.5;
      f.counterT = 0;
    }
    if (o.stun > 0) dmg *= 1.15;
    // ducking under the hands drops you onto the body shot
    if (o.evade && o.evade.t < 0.32 && o.evade.kind === 'roll' && a.target === 'body') dmg *= 1.3;
    if (this.pos === 'stand' && a.kind === 'punch' && this.dist < a.reach * 0.72 && (a.name === 'jab' || a.name === 'cross')) dmg *= 0.6; // jammed
    if (this.pos === 'stand' && a.push && this.dist <= 44) dmg *= 0.6; // a teep with no room to extend
    if (o.block && o.stun <= 0 && this.pos === 'stand' && a.kind === 'kick' && a.target === 'body' && this.rng.chance(0.12 + o.sk.fightIQ / 500 + o.sk.wrestling / 600)) {
      // he catches the kick: the kicker hops on one leg, wide open, and comes with it
      f.stun = Math.max(f.stun, 0.6);
      o.counterT = 0.8;
      this.nudge(i, this.dist - 40);
      this.ev({ type: 'catch', side: (1 - i) as Side, name: a.name });
      this.line((1 - i) as Side, 'catch', `${this.name((1 - i) as Side)} catches the kick!`, 2);
      return;
    }
    if (o.block && o.stun <= 0) {
      // a high guard covers the head; shots to the body and legs get through more of it
      const through = a.target === 'legs' ? 0.55 : a.target === 'body' ? (a.heavy ? 0.55 : 0.42) : a.heavy ? 0.32 : 0.18;
      dmg *= through * (o.gas < 20 ? 1.25 : 1); // tired arms: the guard gives
      o.gas = Math.max(0, o.gas - 1.5);
      if (a.target === 'legs') {
        f.legs = Math.max(0, f.legs - 2.5); // checked
        // a hard check can break the kicker's shin
        if (a.name === 'legkick' && this.rng.chance(0.02)) {
          if (this.injure(i, 'shin', this.rng.chance(0.25))) return;
        }
      }
      // a heavy shot into a hard elbow or forehead: broken hand
      if (a.kind === 'punch' && a.heavy && this.rng.chance(0.003)) this.injure(i, a.hand === 'lead' ? 'lead hand' : 'rear hand', false);
      this.ev({ type: 'block', side: (1 - i) as Side, name: a.name });
      this.apply(i, a.target, dmg, false, false, undefined, !!a.light);
      return;
    }
    f.landed++;
    f.comboT = 0.45;
    f.momentum = Math.min(1, f.momentum + 0.25);
    if (this.pos === 'clinch') this.clinch.idle = 0;
    // knuckles on skull: hands break
    if (a.kind === 'punch' && a.target === 'head' && a.heavy && this.rng.chance(0.0025)) this.injure(i, a.hand === 'lead' ? 'lead hand' : 'rear hand', false);
    // a heavy body shot cracks ribs
    if (a.target === 'body' && a.heavy && this.rng.chance(0.03)) this.injure((1 - i) as Side, 'ribs', false);
    if (a.push && this.pos === 'stand' && this.dist > 44) {
      // the front kick shoves him off and stops whatever he was winding up (crowded, it's just a push)
      this.nudge((1 - i) as Side, -a.push);
      if (o.act && !o.act.done) o.act = null;
    }
    // beat him to the punch: a clean, solid shot to the head stops whatever he was loading up
    let stopped = '';
    if (o.act && !o.act.done && o.act.kind !== 'shoot' && o.act.wind >= 0.18 && !a.light && (a.heavy || a.dmg >= 4) && a.target === 'head') {
      stopped = o.act.name;
      o.act = null;
      o.stun = Math.max(o.stun, 0.2);
    }
    const at = this.events.length;
    this.apply(i, a.target, dmg, a.heavy || counter, counter, a.name, !!a.light);
    // (told right after the hit itself)
    if (stopped && !this.result) this.events.splice(at + 1, 0, { type: 'interrupt', side: i, name: stopped });
  }

  /** Damage lands. Knockdowns and finishes are decided here. */
  private apply(i: Side, target: 'head' | 'body' | 'legs', dmg: number, big: boolean, counter: boolean, name?: string, light = false): void {
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
      // flicks chip a fresh man, they don't finish him (they still pile up on a hurt one)
      const chip = light && o.stun <= 0;
      const hp0 = o.hp;
      // nowhere to go with your back on the cage: you take them flush
      const k = (1.25 - o.sk.chin / 200) * (this.pos === 'stand' && this.onWall((1 - i) as Side) ? 1.1 : 1);
      o.hp -= dmg * k;
      if (chip) o.hp = Math.max(o.hp, Math.min(hp0, 12));
      o.hpMax = Math.max(35, o.hpMax - dmg * k * 0.18);
      o.stun = Math.max(o.stun, big ? 0.32 : 0.12);
      if (big && this.rng.chance(name === 'elbow' ? 0.3 : 0.12)) {
        o.cut++;
        this.ev({ type: 'cut', side: (1 - i) as Side });
        this.line(i, 'cut', `${this.name((1 - i) as Side)} is cut open.`, 2);
        // a gusher: the referee calls the doctor in
        if (o.cut >= 5 && this.rng.chance(0.25)) return this.doctor((1 - i) as Side, true);
      }
      if (o.hp <= 0) {
        if (o.hp < -12 || o.kdsRound >= 2 || this.pos === 'ground') return this.finish(i, this.pos === 'ground' ? 'TKO' : 'KO', this.pos === 'ground' ? 'ground and pound' : name ?? 'punch');
        return this.knockdown(i);
      }
      if (!chip && this.pos === 'stand' && (big || dmg > 9) && this.rng.chance(clamp(((dmg - 7) / 26 + (1 - o.hp / 100) * 0.22 - o.sk.chin / 500) * o.frail, 0, 0.7))) return this.knockdown(i);
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
    o.frail = Math.min(2.2, o.frail * 1.3); // the next one comes easier
    this.rkd[this.round - 1][i]++;
    o.act = null;
    o.block = false;
    f.act = null; // (kds counts times *this* fighter went down; the cards credit the other man)
    this.score(i, 6);
    this.pos = 'stand';
    this.sub = null;
    this.stopPivots();
    this.ev({ type: 'kd', side: i });
    this.line(i, 'kd', `DOWN GOES ${this.name((1 - i) as Side).toUpperCase()}!`, 3);
    if (o.kdsRound >= 3) this.finish(i, 'TKO', 'three knockdowns');
  }

  /** The man on the canvas has to beat the count: 10 counts, about 7 seconds. */
  private tickCount(dt: number, intents: [FightIntent[], FightIntent[]]): void {
    const mma = (this.rules.koRules ?? 'mma') === 'mma';
    for (const i of [0, 1] as Side[]) {
      const o = this.F[i];
      if (o.down <= 0) continue;
      o.down += dt;
      if (mma) {
        const a = (1 - i) as Side;
        // out cold: there's no count in MMA, the referee dives in
        if (o.hp <= 0 && o.down > 0.6) {
          o.down = 0;
          this.finish(a, 'KO', 'knocked out cold');
          return;
        }
        // the man standing jumps on him: straight to the mount (or side control) to finish it
        if (!this.rules.noGrappling && intents[a].some((it) => it.type === 'punch' || it.type === 'kick' || it.type === 'shoot' || it.type === 'clinch' || it.type === 'ground')) {
          this.pounce(a);
          return;
        }
        for (const it of intents[i]) if (it.type === 'getup') o.getup += 0.09 * (0.4 + it.rhythm) * (0.6 + o.sk.heart / 150) * (0.5 + Math.max(0, o.hp + 20) / 120);
        // nobody followed him down: he gets back to his feet (the referee doesn't count in MMA)
        if (o.getup >= 1 || o.down >= 3.2) {
          o.down = 0;
          o.hp = Math.max(o.hp, 12 + o.sk.heart / 8);
          o.stun = 0.5;
          this.F[a].x = clamp(this.F[a].x + (i === 0 ? 30 : -30), ARENA_L, ARENA_R);
          this.fixGap();
          this.ev({ type: 'getup', side: i });
          this.line(i, 'getup', `${this.name(a)} lets him up. ${this.name(i)} is back on his feet, on wobbly legs.`, 2);
        }
        continue;
      }
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

  /** MMA knockdown: follow him to the mat and finish it. */
  private pounce(a: Side): void {
    const d = (1 - a) as Side;
    const o = this.F[d];
    // how far he'd got with the get-up: a man already working his way up covers and pulls guard
    const cover = o.getup;
    o.down = 0;
    o.getup = 0;
    // he's hurt, not finished: a tough man can survive the storm (heart buys him time)
    o.stun = Math.max(0.7 - cover * 0.4, 0.3);
    o.hp = Math.max(o.hp, 12 + o.sk.heart / 6);
    this.pos = 'ground';
    this.top = a;
    this.gpos = cover >= 0.6 ? 'guard' : cover >= 0.3 ? 'half' : this.rng.chance(0.55) ? 'mount' : 'side';
    this.gprog = this.standProg = 0;
    this.gKey = this.sKey = '';
    this.groundIdle = 0;
    this.F[a].act = null;
    this.ev({ type: 'pounce', side: a });
    this.line(a, 'pounce', `${this.name(a)} jumps on him! ${this.gpos === 'mount' ? 'FULL MOUNT, and the hammers are coming!' : this.gpos === 'side' ? 'Side control, and the hammers are coming!' : `${this.name(d)} covers up and gets to ${GPOS_NAME[this.gpos]}.`}`, 3);
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
    const p = clamp(0.42 + (f.sk.wrestling - o.sk.wrestling) / 90 + (o.stun > 0 ? 0.25 : 0) + (o.act ? 0.12 : 0) - (o.gas > 60 ? 0 : -0.1) + (this.pos === 'clinch' ? 0.1 : 0) - (o.legs < 50 ? -0.08 : 0) + (this.pos === 'stand' && this.onWall((1 - i) as Side) ? 0.1 : 0), 0.08, 0.9);
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
      if (this.sub.prog >= 1) {
        // a late tap (or a stubborn man) leaves something torn
        const n = this.sub.name;
        const def = (1 - this.sub.atk) as Side;
        if (/armbar|kimura|americana|omoplata/.test(n) && this.rng.chance(0.3)) this.injuries.push({ side: def, name: /armbar/.test(n) ? 'elbow ligaments' : 'shoulder', weeks: this.rng.int(6, 12) });
        if (LEG_LOCKS.has(n) && this.rng.chance(0.4)) this.injuries.push({ side: def, name: 'knee ligaments', weeks: this.rng.int(8, 20) });
        return this.finish(this.sub.atk, 'SUB', n);
      }
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
          // the other man on top now: the progress bars (and what they were for) were the old top man's
          this.top = esc;
          this.gpos = 'half';
          this.gprog = this.standProg = 0;
          this.gKey = this.sKey = '';
          this.line(esc, 'sweep', `${this.name(esc)} wins the scramble and comes up on top.`, 2);
          return;
        }
        if (atk === this.top) {
          const from = this.gpos;
          this.gpos = from === 'back' || from === 'mount' ? (this.rng.chance(0.5) ? 'guard' : 'half') : from === 'side' ? 'half' : 'guard';
          if (from !== this.gpos) {
            this.gKey = this.sKey = '';
            this.ev({ type: 'pass', side: atk, name: this.gpos, from });
          }
        } else if (this.gpos === 'guard' && this.rng.chance(0.4)) {
          this.gpos = 'half';
          this.gKey = this.sKey = '';
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
    // the doctor looks at cuts before the bell; a good cutman buys you another round
    for (const i of [0, 1] as Side[]) {
      const c = this.F[i].cut;
      if (this.rules.protectUntil && this.round < this.rules.protectUntil) break; // boss fights: the doctor waves it on
      if (c >= 4 && this.rng.chance(clamp((c - 3) * 0.16 * (1 - aid[i] * 0.6), 0, 0.85))) {
        this.doctor(i, false);
        return;
      }
    }
    this.round++;
    this.rpts.push([0, 0]);
    this.rkd.push([0, 0]);
    this.ded.push([0, 0]);
    this.clock = ROUND_SECONDS;
    this.pos = 'stand';
    this.sub = null;
    this.shooting = -1;
    this.clinch = { dom: -1, tie: 'collar', fence: -1, idle: 0 };
    this.stopPivots();
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
      f.momentum = 0;
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
        const kd = this.rkd[r] ?? [0, 0];
        const sc: [number, number] = Math.abs(diff) < 0.6 ? [10, 10] : diff > 0 ? [10, diff > Math.max(12, nb * 2.5) || (kd[0] > kd[1] && diff > 3) ? 8 : 9] : [diff < -Math.max(12, na * 2.5) || (kd[1] > kd[0] && diff < -3) ? 8 : 9, 10];
        const dd = this.ded[r] ?? [0, 0];
        sc[0] -= dd[0];
        sc[1] -= dd[1];
        per.push(sc);
        totals[j][0] += sc[0];
        totals[j][1] += sc[1];
      }
      rounds.push(per);
    });
    return { totals, rounds };
  }

  private decision(technical = false): void {
    const { totals } = this.cards();
    const votes = totals.map(([a, b]) => (a > b ? 0 : b > a ? 1 : -1));
    const a = votes.filter((v) => v === 0).length;
    const b = votes.filter((v) => v === 1).length;
    const winner: Side | -1 = a >= 2 ? 0 : b >= 2 ? 1 : -1;
    const detail = winner < 0 ? 'split draw' : (winner === 0 ? a : b) === 3 ? 'unanimous' : (winner === 0 ? b : a) === 0 ? 'majority' : 'split';
    this.result = { winner, method: winner < 0 ? 'DRAW' : 'DEC', detail: technical ? `technical ${detail}` : detail, round: this.round, time: technical ? this.clockElapsed() : '5:00' };
    this.phase = 'over';
  }

  /** A foul: the referee calls time, maybe takes a point, and sometimes the other man can't go on. */
  private foul(i: Side, kind: 'eyepoke' | 'groin' | 'fence'): void {
    const o = this.F[(1 - i) as Side];
    const f = this.F[i];
    const label = { eyepoke: 'Eye poke', groin: 'Low blow', fence: 'Grabbing the fence' }[kind];
    const prior = this.fouls.filter((x) => x.side === i).length;
    // a bought referee: his man never gets called, the other man always does
    const bought = this.rules.bought;
    const penalized = bought === i ? false : bought !== undefined ? true : kind === 'fence' ? prior >= 1 : prior >= 1 && this.rng.chance(0.6);
    this.fouls.push({ side: i, text: label, penalized });
    f.act = null;
    o.act = null;
    o.stun = Math.max(o.stun, kind === 'fence' ? 0.2 : 1.6);
    if (kind !== 'fence') o.hp -= 3;
    this.pos = 'stand';
    this.sub = null;
    this.stopPivots();
    this.F[0].x -= 16;
    this.F[1].x += 16;
    this.fixGap();
    this.ev({ type: 'foul', side: i, name: label });
    this.line(i, kind === 'fence' ? 'foul' : 'foul', kind === 'eyepoke' ? `EYE POKE! ${this.name((1 - i) as Side)} can't see. The referee calls time.` : kind === 'groin' ? `LOW BLOW! ${this.name((1 - i) as Side)} is down holding himself. Time out.` : `${this.name(i)} grabs the fence. The referee is not happy.`, 2);
    this.log[this.log.length - 1].key = 'foul_' + kind;
    if (penalized) {
      this.ded[this.round - 1][i] += 1;
      this.ev({ type: 'deduction', side: i, name: label });
      this.line(i, 'foul', `The referee takes a point from ${this.name(i)}.`, 2);
      this.log[this.log.length - 1].key = 'deduction';
    }
    if (bought === i) {
      this.line(-1, 'idle', `${this.rules.referee ?? 'The referee'} saw nothing. He was adjusting his glasses. "Keep it clean, boys," he says, to one of them.`, 2);
      this.log[this.log.length - 1].key = 'ref_blind';
    }
    // sometimes he can't continue (not in the boss fights: those go to the script)
    if (kind !== 'fence' && bought === undefined && !this.rules.protectUntil && this.rng.chance(0.06)) {
      const early = this.round === 1 || (this.round === 2 && this.clock > ROUND_SECONDS / 2);
      this.line((1 - i) as Side, 'stop', `${this.name((1 - i) as Side)} can't continue.`, 3);
      this.log[this.log.length - 1].key = 'cannot_continue';
      if (early) {
        this.result = { winner: -1, method: 'NC', detail: `No Contest (accidental ${label.toLowerCase()})`, round: this.round, time: this.clockElapsed() };
        this.phase = 'over';
      } else this.decision(true);
    }
  }

  /** An injury in the fight. Returns true if it stopped the fight. */
  private injure(i: Side, part: 'lead hand' | 'rear hand' | 'shin' | 'ribs' | 'knee', severe: boolean): boolean {
    const names = { 'lead hand': 'broken hand', 'rear hand': 'broken hand', shin: severe ? 'broken leg' : 'cracked shin', ribs: 'cracked ribs', knee: 'blown knee' };
    if (this.injuries.some((x) => x.side === i && x.name === names[part])) return false;
    const weeks = { 'lead hand': 8, 'rear hand': 8, shin: severe ? 40 : 10, ribs: 6, knee: 26 }[part];
    this.injuries.push({ side: i, name: names[part], weeks: weeks + this.rng.int(0, 4) });
    const f = this.F[i];
    if (part === 'lead hand') this.hurtLimb[i].lead = true;
    if (part === 'rear hand') this.hurtLimb[i].rear = true;
    if (part === 'shin' || part === 'knee') {
      this.hurtLimb[i].legs = true;
      f.legs = Math.max(0, f.legs - 30);
    }
    if (part === 'ribs') {
      f.body = Math.max(0, f.body - 20);
      f.gas = Math.max(0, f.gas - 10);
    }
    this.ev({ type: 'injury', side: i, name: names[part] });
    this.line(i, 'injury', part === 'ribs' ? `That one cracked ${this.name(i)}'s ribs. You can see it in his face.` : severe ? `OH NO. ${this.name(i)}'s leg snapped on the check!` : `${this.name(i)} is shaking out his ${part.replace(/lead |rear /, '')}. Something's broken.`, severe ? 3 : 2);
    this.log[this.log.length - 1].key = severe ? 'limb_snap' : 'injury_' + part.replace(' ', '_');
    if (severe) {
      this.finish((1 - i) as Side, 'TKO', `Injury (${names[part]})`);
      return true;
    }
    return false;
  }

  /** The doctor looks at a cut: mid-round on a gusher, or between rounds. */
  private doctor(i: Side, midRound: boolean): void {
    const c = this.F[i].cut;
    this.ev({ type: 'doctor', side: i });
    this.line(-1, 'doctor', `The referee brings in the doctor to look at ${this.name(i)}'s cut.`, 2);
    if (this.rules.protectUntil && this.round < this.rules.protectUntil) {
      this.line(-1, 'idle', 'The doctor lets it continue. The crowd roars.', 2);
      return;
    }
    if (!midRound || this.rng.chance(clamp((c - 4) * 0.25, 0.15, 0.8))) {
      this.line((1 - i) as Side, 'stop', `The doctor waves it off! ${this.name(i)} can't see out of that eye.`, 3);
      this.log[this.log.length - 1].key = 'doctor';
      this.result = { winner: (1 - i) as Side, method: 'TKO', detail: 'Doctor stoppage (cut)', round: this.round, time: midRound ? this.clockElapsed() : '5:00' };
      this.phase = 'over';
      this.ev({ type: 'tko', side: (1 - i) as Side });
      return;
    }
    this.line(-1, 'idle', 'The doctor lets it continue. The crowd roars.', 2);
    this.F[i].stun = Math.max(this.F[i].stun, 0.4);
  }

  private finish(winner: Side, method: 'KO' | 'TKO' | 'SUB', detail: string): void {
    if (this.result) return;
    if (this.protectedNow((1 - winner) as Side)) return;
    // a knockout costs the loser time off (concussion protocol)
    if (method === 'KO' || (method === 'TKO' && !/Injury|Doctor/.test(detail))) this.injuries.push({ side: (1 - winner) as Side, name: 'concussion', weeks: method === 'KO' ? this.rng.int(6, 10) : this.rng.int(3, 6) });
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
    if (this.rules.protectUntil && this.round < this.rules.protectUntil) return;
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
      injuries: this.injuries.map((x) => ({ fighter: ids[x.side], name: x.name, weeks: x.weeks })),
      fouls: this.fouls.map((x) => ({ fighter: ids[x.side], text: x.text, penalized: x.penalized })),
      pointDeductions: [this.ded.reduce((a, d) => a + d[0], 0), this.ded.reduce((a, d) => a + d[1], 0)],
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
/** What the AI has seen land on it, by family (hooks, straights, kicks, body shots, takedowns). */
export interface FightRead {
  hook: number;
  straight: number;
  kick: number;
  body: number;
  shoot: number;
  /** how often the other man's guard has eaten my shots */
  blocked: number;
}
export const STRIKE_FAMILY = (name: string): keyof FightRead | '' =>
  /hook|uppercut|overhand|backfist/.test(name) ? 'hook' : /jab|cross/.test(name) ? 'straight' : /kick|knee/.test(name) ? 'kick' : '';

/** Which evasion to throw at an incoming strike, given what's been landing: hooks get rolled under, kicks checked, straights slipped. Pure, for the tests. */
export function adaptEvade(name: string, read: FightRead, r: number, iq: number): 'slip' | 'roll' | 'pull' {
  const fam = STRIKE_FAMILY(name);
  const learned = fam === 'hook' ? read.hook : fam === 'kick' ? read.kick : fam === 'straight' ? read.straight : 0;
  const k = Math.min(0.45, learned * 0.12 + iq * 0.1); // the more it's landed, the readier the right answer is
  if (fam === 'hook') return r < 0.35 + k ? 'roll' : 'slip';
  if (fam === 'kick') return r < 0.4 + k ? 'pull' : 'roll';
  if (fam === 'straight') return r < 0.5 + k ? 'slip' : 'pull';
  return r < 0.5 ? 'slip' : 'roll';
}

/** The CPU's menu on the feet (filtered by what reaches from where he stands), when he's resting, and the short shots he steps in behind. */
const AI_PUNCHES: PunchType[] = ['jab', 'jab', 'straight', 'overhand', 'bodyJab', 'hook', 'hook', 'uppercut', 'bodyHook', 'bodyStraight'];
const AI_REST_PUNCHES: PunchType[] = ['jab', 'jab', 'bodyJab'];
const AI_ENTRY_PUNCHES: PunchType[] = ['hook', 'hook', 'uppercut', 'bodyHook', 'overhand'];

/** The CPU's combinations, by style family. Steps are punches, 'kick:<level>', 'feint' or 'shoot'. */
const COMBOS: Record<string, string[][]> = {
  boxer: [['jab', 'straight'], ['jab', 'straight', 'hook'], ['jab', 'jab', 'straight'], ['bodyJab', 'overhand']],
  kicker: [['jab', 'straight', 'kick:low'], ['straight', 'hook', 'kick:body'], ['feint', 'kick:head']],
  brawler: [['hook', 'hook'], ['overhand', 'uppercut']],
  wrestler: [['jab', 'straight', 'shoot']],
  'default': [['jab', 'straight'], ['jab', 'hook']],
};
const STYLE_FAMILY: Record<string, string> = {
  Boxer: 'boxer', 'Pressure Striker': 'boxer', 'Counter Striker': 'boxer',
  Kickboxer: 'kicker', 'Muay Thai': 'kicker', 'Point Fighter': 'kicker',
  Brawler: 'brawler',
  Wrestler: 'wrestler', Judoka: 'wrestler', 'Boring But Effective': 'wrestler',
};
/** How far a combo step reaches, and the name its events carry. */
const stepReach = (step: string): number => (step === 'feint' ? 999 : step === 'shoot' ? 66 : step.startsWith('kick:') ? KICK[step.slice(5) as KickLevel].reach : PUNCH[step as PunchType].reach);
const stepName = (step: string): string => (step === 'feint' || step === 'shoot' ? step : step.startsWith('kick:') ? KICK[step.slice(5) as KickLevel].name : PUNCH[step as PunchType].name);

export class LiveAI {
  private think = 0;
  private want = 50;
  private blockT = 0;
  /** stepping in behind a short shot: walk into its range, then throw it */
  private entry: { punch: PunchType; hand: 'lead' | 'rear'; weight: Weight; t: number } | null = null;
  /** how far away he was when he threw each strike (a shot from out of range says nothing about the shot) */
  private lastThrowD: Record<string, number> = {};
  /** the rest of a combination in progress, the weight of its last shot, the hand that threw the one before */
  private queue: string[] = [];
  private qWeight: Weight = 'heavy';
  private qHand: 'lead' | 'rear' = 'rear';
  /** a combination just ended: give the other man a beat to answer */
  private qTail = false;
  /** a feint just went out: the shot it set up comes next */
  private feintT = 0;
  /** how long his current opening has been there (he has to see it before he can punish it) */
  private openT = 0;
  /** his habits: the strikes he's started lately (name, when), the gaps between them, how he defends (event counts) */
  private hist: [string, number][] = [];
  private gaps: number[] = [];
  private def: Record<string, number> = {};
  private clockT = 0;
  private lastOpAct = '';
  private lastOpT = -9;
  private habit = '';
  /** the strike (by its start time) the rhythm read already has a defence armed for */
  private armed = -9;
  /** back on the fence: what he's doing about it (circle off, tie up, or just stand there), and for how long */
  private wallPlan: '' | 'pivot' | 'clinch' | 'stay' = '';
  private wallT = 0;
  /** the habit he's just read off you (for the HUD: "HE'S READING YOUR JAB"), and a count that ticks once per new read */
  readNote = '';
  readN = 0;
  private rng: Rng;
  /** what's been landing on me, and how my own shots are doing (thrown / landed by name) */
  read: FightRead = { hook: 0, straight: 0, kick: 0, body: 0, shoot: 0, blocked: 0 };
  mine: Record<string, { t: number; l: number }> = {};
  private plan0: GamePlan;
  private lastRound = 1;
  /** the AI's read of the fight this moment, for the booth and the tests */
  mood: 'even' | 'urgent' | 'cruise' | 'rest' | 'hunt' = 'even';
  constructor(public side: Side, seed: number, public plan: GamePlan = 'balanced') {
    this.rng = new Rng(seed);
    this.plan0 = plan;
  }

  /** Read this frame's events: what landed on me, what of mine landed, what got blocked. */
  noteEvents(L: LiveFight): void {
    for (const e of L.events) {
      if (e.type === 'hit' && e.name) {
        if (e.side !== this.side) {
          const fam = STRIKE_FAMILY(e.name);
          if (e.target === 'body') this.read.body++;
          else if (fam) this.read[fam]++;
        } else {
          const m = (this.mine[e.name] ??= { t: 0, l: 0 });
          m.t++;
          m.l++;
        }
      } else if (e.type === 'miss' && e.side === this.side && e.name) {
        // whiffed from out of range: that's the distance's fault, not the punch's
        if ((this.lastThrowD[e.name] ?? 0) <= (STRIKE_REACH[e.name] ?? 999)) (this.mine[e.name] ??= { t: 0, l: 0 }).t++;
      } else if (e.type === 'block' && e.name) {
        if (e.side !== this.side) {
          this.read.blocked++;
          (this.mine[e.name] ??= { t: 0, l: 0 }).t++;
          this.def.block = (this.def.block ?? 0) + 1;
        }
      } else if (e.type === 'td' && e.side !== this.side) this.read.shoot++;
      // how he defends: parries, which way he moves his head, sprawls
      if (e.side !== this.side) {
        if (e.type === 'parry' || e.type === 'sprawl') this.def[e.type] = (this.def[e.type] ?? 0) + 1;
        else if (e.type === 'evade' && !e.big && e.name) this.def['evade:' + e.name] = (this.def['evade:' + e.name] ?? 0) + 1;
      }
    }
  }

  /** Watch what he starts: the last dozen strikes and their rhythm, and the habit if there is one. */
  private watch(L: LiveFight, op: LiveFighter, iq: number, dt: number): void {
    const a = op.act;
    const name = a && a.kind !== 'feint' ? a.name : '';
    let changed = false;
    // a strike he's only just started (it has had one tick, of up to a frame; frames on a slow phone run to 0.05 s and vary)
    if (a && name && name !== this.lastOpAct && a.t <= Math.max(dt, 0.05) + 0.01 && L.pos === 'stand') {
      const gap = this.clockT - this.lastOpT;
      if (gap < 4) {
        this.gaps.push(gap);
        if (this.gaps.length > 6) this.gaps.shift();
      }
      this.lastOpT = this.clockT;
      this.hist.push([name, this.clockT]);
      if (this.hist.length > 12) this.hist.shift();
      changed = true;
    }
    this.lastOpAct = name;
    // old news fades: vary it and he loses the read
    while (this.hist.length && this.clockT - this.hist[0][1] > 20) {
      this.hist.shift();
      changed = true;
    }
    if (!changed) return;
    let best = '';
    let bestN = 0;
    if (this.hist.length >= 6) {
      for (const h of this.hist) {
        let n = 0;
        for (const g of this.hist) if (g[0] === h[0]) n++;
        if (n > bestN) {
          best = h[0];
          bestN = n;
        }
      }
      if (bestN / this.hist.length < 0.5 - 0.15 * iq) best = '';
    }
    this.habit = best;
    if (best && best !== this.readNote) {
      this.readNote = best;
      this.readN++;
    }
  }

  /** A new round: a man who's losing changes something. */
  private rethink(L: LiveFight): void {
    if (L.round === this.lastRound) return;
    this.lastRound = L.round;
    if (L.round < 2) return;
    // a minute in the corner: what he was doing to defend is half forgotten
    for (const k of Object.keys(this.def)) this.def[k] *= 0.5;
    const me = L.F[this.side];
    const { totals } = L.cards();
    const behind = totals.filter(([a, b]) => (this.side === 0 ? a < b : b < a)).length >= 2;
    const ahead = totals.filter(([a, b]) => (this.side === 0 ? a > b : b > a)).length >= 2;
    const sk = me.sk;
    if (behind) {
      if (this.plan === 'counter' || this.plan === 'survive') this.plan = 'pressure';
      else if ((this.plan === 'balanced' || this.plan === 'pressure') && sk.wrestling > sk.striking + 5 && this.read.straight + this.read.hook >= 4) this.plan = 'wrestle';
      else if (this.plan === 'balanced' && this.read.kick >= 3) this.plan = 'pressure';
    } else if (ahead && me.gas < 50 && (this.plan === 'pressure' || this.plan === 'legs')) this.plan = 'counter';
    else if (ahead && this.plan !== this.plan0 && me.gas > 70) this.plan = this.plan0;
  }

  update(L: LiveFight, dt: number): { intents: FightIntent[]; move: number } {
    const me = L.F[this.side];
    const op = L.F[(1 - this.side) as Side];
    const sk = me.sk;
    const out: FightIntent[] = [];
    const toward = this.side === 0 ? 1 : -1;
    const iq = sk.fightIQ / 100;
    this.rethink(L);
    this.clockT += dt;
    this.openT = me.counterT > 0 ? this.openT + dt : 0;
    if (L.pos !== 'stand' || me.down > 0 || op.down > 0) {
      this.entry = null;
      this.queue.length = 0;
      this.feintT = 0;
    }
    // knocked down: beat the count
    if (me.down > 0) {
      if (this.rng.chance(dt * (3 + sk.heart / 25))) out.push({ type: 'getup', side: this.rng.chance(0.5) ? 'left' : 'right', rhythm: this.rng.float(0.5, 1) });
      return { intents: out, move: 0 };
    }
    if (op.down > 0) {
      // he's hurt on the canvas: jump on him (the killer instinct varies)
      if ((L.rules.koRules ?? 'mma') === 'mma' && op.down > 0.25 && this.rng.chance(dt * (2 + sk.fightIQ / 40 + (this.plan === 'pressure' ? 2 : 0)))) out.push({ type: 'shoot' });
      return { intents: out, move: 0 };
    }
    if (L.sub) {
      const atk = L.sub.atk === this.side;
      // defending a hold is instinct: everybody fights hands, the better grappler/wrestler fights them better
      if (this.rng.chance(dt * (atk ? 4 + sk.grappling / 18 : 5.5 + Math.max(sk.grappling, sk.wrestling) / 16))) out.push({ type: 'mash', rate: 6, role: atk ? 'attack' : 'defend' });
      return { intents: out, move: 0 };
    }
    this.watch(L, op, iq, dt);
    // reactive defence: read the other man's strike while it winds up
    if (op.act && !op.act.done && op.act.kind !== 'feint' && op.act.kind !== 'shoot' && op.act.t > 0.04) {
      // the one he's been reading, he sees coming
      const expect = this.habit && op.act.name === this.habit ? 1 + iq : 1;
      if (!this.blockT && this.rng.chance(dt * 9 * (0.25 + iq * 0.7) * ((me.tilt ?? 0) > 0 ? 0.6 : 1) * expect)) {
        const r = this.rng.next();
        // what's been landing is what he's ready for: hooks that keep catching him get rolled under
        const fam = STRIKE_FAMILY(op.act.name);
        const seen = fam === 'hook' ? this.read.hook : fam === 'kick' ? this.read.kick : fam === 'straight' ? this.read.straight : 0;
        const ready = Math.min(0.2, seen * 0.04);
        const bodyKick = op.act.name === 'kick' || op.act.name === 'front kick' || op.act.name === 'spinning back kick';
        if (L.pos === 'stand' && bodyKick) {
          // a body kick he sees coming: elbows down, and a hand ready to catch it
          if (r < 0.6) {
            out.push({ type: 'block', phase: 'start' });
            this.blockT = 0.5;
          } else out.push({ type: 'evade', kind: adaptEvade(op.act.name, this.read, this.rng.next(), iq), source: 'button' });
        } else if (L.pos === 'stand' && r < 0.25 + iq * 0.15 + ready) out.push({ type: 'evade', kind: adaptEvade(op.act.name, this.read, this.rng.next(), iq), source: 'button' });
        else if (r < 0.35 + iq * 0.2 + ready) out.push({ type: 'parry' });
        else {
          out.push({ type: 'block', phase: 'start' });
          this.blockT = 0.5;
        }
      }
    }
    if (op.act?.kind === 'shoot' && !op.act.done && this.rng.chance(dt * 6 * (0.3 + sk.wrestling / 140) * (1 + Math.min(1, this.read.shoot * 0.4)))) out.push({ type: 'sprawl' });
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
    this.want = survive ? 60 : pressure ? 40 : this.plan === 'counter' ? 58 : wrestle ? 52 : 50;
    // the fight as he reads it: a hurt man in front of him, the cards late in the last round, an empty tank
    const hurtOp = op.stun > 0.3 || op.hp < 32;
    const last = L.round >= L.rounds;
    let urgent = false;
    let cruise = false;
    if (last && L.clock < 45 && !hurtOp) {
      const { totals } = L.cards();
      const behind = totals.filter(([a, b]) => (this.side === 0 ? a < b : b < a)).length >= 2;
      const ahead = totals.filter(([a, b]) => (this.side === 0 ? a > b : b > a)).length >= 2;
      urgent = behind && !survive;
      cruise = ahead && me.gas < 45 && me.hp > 40;
    }
    const rest = me.gas < 22 && !hurtOp && !urgent;
    this.mood = hurtOp && !survive ? 'hunt' : urgent ? 'urgent' : cruise ? 'cruise' : rest ? 'rest' : 'even';
    if (urgent) this.want = Math.min(this.want, 42);
    if (cruise) this.want = Math.max(this.want, 64);
    // tired: hold home range and breathe (backing away only walks him onto the fence)
    if (rest) this.want = 50;
    // wound up by a taunt: walks straight in swinging
    const tilted = (me.tilt ?? 0) > 0 && !survive;
    if (tilted) this.want = 38;
    // what he's read off you: wait outside the teep to time it, crowd a man who keeps pulling away
    const parryHappy = (this.def.parry ?? 0) >= 4;
    const pullHappy = (this.def['evade:pull'] ?? 0) >= 4;
    if (this.habit === 'front kick') this.want = Math.max(this.want, 62);
    if (pullHappy) this.want = Math.min(this.want, 40);
    // room behind each man: a pressure fighter walks a man near his fence onto it
    const myRoom = this.side === 0 ? me.x - ARENA_L : ARENA_R - me.x;
    const opRoom = this.side === 0 ? ARENA_R - op.x : op.x - ARENA_L;
    if (pressure && opRoom < 30) this.want -= 6;
    const d = L.dist;
    let move = 0;
    if (me.stun <= 0.2) {
      if (d > this.want + 6) move = toward;
      // too close: back off, but not straight back onto the fence
      else if (d < this.want - 4 && myRoom > 16) move = -toward;
      // a hurt opponent: go get him
      if (op.stun > 0.3 && op.hp < 45 && !survive) move = toward;
      // he's on the fence: stay on him, walk in on the circle and cut it off
      if (pressure && L.onWall((1 - this.side) as Side)) move = toward;
    }
    // on the fence himself: circle off it (the sharper man sees to it at once), tie up if he's a wrestler, or stand there and take it
    if (!L.onWall(this.side)) {
      this.wallPlan = '';
      this.wallT = 0;
    } else {
      this.wallT += dt;
      if (!this.wallPlan || this.wallT > 1.2) {
        this.wallT = 0;
        this.wallPlan = this.rng.chance(0.35 + iq * 0.6 + (rest || survive ? 0.2 : 0)) ? 'pivot' : sk.wrestling > sk.striking ? 'clinch' : 'stay';
      }
    }
    const pivoting = this.wallPlan === 'pivot' && me.stun <= 0.2;
    if (pivoting) {
      // into the cage: the feet turn it into the circle
      move = -toward;
      this.entry = null;
      this.queue.length = 0;
    }
    // hurt: hands up while he's throwing
    if (survive && op.act && !op.act.done && d < 50 && !this.blockT) {
      out.push({ type: 'block', phase: 'start' });
      this.blockT = 0.4;
    }
    // a low fight IQ misjudges the distance by a few pixels
    const slack = 2 + (1 - iq) * 12;
    // free to start something this frame?
    let acted = !!me.act || me.stun > 0;
    // he's figured you out: when the next one is due he holds his own fire, and he's already moving
    let due = false;
    if (this.habit && d < 64 && this.gaps.length >= 2 && this.armed !== this.lastOpT) {
      // his rhythm: the typical gap (the median, so one pause doesn't throw it off)
      let gap = 0;
      for (const g of this.gaps) {
        let n = 0;
        for (const h of this.gaps) if (h <= g) n++;
        if (n * 2 >= this.gaps.length && (gap === 0 || g < gap)) gap = g;
      }
      const since = this.clockT - this.lastOpT;
      due = since > gap - 0.3 && since < gap + 0.2;
      if (!acted && since > gap - 0.12 && since < gap + 0.2 && this.rng.chance(dt * 8 * iq)) {
        this.armed = this.lastOpT;
        const h = this.habit;
        const fam = STRIKE_FAMILY(h);
        if (/kick/.test(h) || /body/.test(h)) {
          // legkicks get checked, body kicks met with the elbows (and maybe caught), body shots covered
          out.push({ type: 'block', phase: 'start' });
          this.blockT = 0.45;
        } else if (fam === 'straight') {
          // parry it or slip it (whichever his hands and his head are ready for)
          const parry = me.parryCd <= 0 && (me.evadeLast < 0.7 || this.rng.chance(0.5));
          out.push(parry ? { type: 'parry' } : { type: 'evade', kind: 'slip', source: 'button' });
        } else out.push({ type: 'evade', kind: 'roll', source: 'button' });
        acted = true;
      }
    }
    // (a human reaction: the opening has to be there a beat before he moves on it, 0.13 s for a sharp man, nearer 0.2 s for a dull one)
    if (!acted && me.counterT > 0 && this.openT >= 0.25 - 0.15 * iq - 1e-6 && d <= 70 && this.rng.chance(dt * 8 * iq)) {
      // an opening (he whiffed, got parried, got his kick caught): make him pay now, not whenever the next thought comes
      if (d <= 56) {
        const c: PunchType = d <= 44 ? 'hook' : d <= 53 ? 'straight' : 'jab';
        // everything on it only while he's well and truly stuck (a parried hand, a caught kick, a spinning miss);
        // a plain whiff costs him a sharp shot, not a haymaker
        this.throwPunch(out, c, c === 'jab' ? 'lead' : 'rear', op.stun > 0.2 ? 'heavy' : 'medium', d);
        this.entry = null;
        this.think = this.rng.float(0.15, 0.3);
        acted = true;
      } else if (!this.entry) this.entry = { punch: 'straight', hand: 'rear', weight: 'heavy', t: me.counterT }; // he pulled out of range: step back in behind it
    }
    if (!acted && op.act && !op.act.done && (op.act.kind === 'punch' || op.act.kind === 'kick') && (iq > 0.8 || this.plan === 'counter' || (this.side === 0 ? L.A : L.B).styles.includes('Counter Striker'))) {
      // he sees the big one loading up and gets there first with something quicker
      const left = op.act.wind - op.act.t;
      const wk = me.gas < 20 ? 1.3 : 1;
      const c: PunchType | null = d <= 53 && left > PUNCH.straight.wind * wk + 0.05 ? 'straight' : d <= 56 && left > PUNCH.jab.wind * wk + 0.05 ? 'jab' : null;
      if (c && this.rng.chance(dt * 6 * iq)) {
        this.throwPunch(out, c, c === 'jab' ? 'lead' : 'rear', 'medium', d);
        this.entry = null;
        this.think = this.rng.float(0.15, 0.3);
        acted = true;
      }
    }
    if (this.habit === 'front kick' && !this.entry && !acted && op.act && op.act.name === 'front kick' && op.act.done) {
      // the teep is coming back: that's the moment to walk in behind it
      this.entry = { punch: 'straight', hand: 'rear', weight: 'medium', t: 0.4 };
    }
    if (this.entry) {
      // stepping in behind a short shot: walk into its range, then throw it
      const e = this.entry;
      e.t -= dt;
      if (e.t <= 0 || me.stun > 0.2) this.entry = null;
      else if (d <= PUNCH[e.punch].reach - 2 && !acted) {
        this.throwPunch(out, e.punch, e.hand, e.weight, d);
        this.entry = null;
        this.think = this.rng.float(0.12, 0.3);
        acted = true;
      } else move = toward;
    }
    if (this.queue.length) {
      // working a combination: the next shot the moment his hands are free, unless it's gone wrong
      const next = this.queue[0];
      if (me.sinceHit < 0.1 || me.gas < 25 || stepReach(next) + slack < d || (next === 'shoot' && L.rules.noGrappling)) {
        this.queue.length = 0;
        this.qTail = true;
      } else if (!acted) {
        this.queue.shift();
        this.comboStep(out, next, d, this.queue.length === 0);
        if (!this.queue.length) this.qTail = true;
        acted = true;
      }
    }
    if (this.qTail && !acted) {
      this.qTail = false;
      this.think = Math.max(this.think, 0.3);
    }
    if (this.feintT > 0) {
      // the feint was the set-up: a flinch, he lets the right hand go; the hands come up, he goes to the body
      // (no reaction and it was just a feint: the next shot waits for the next thought)
      this.feintT -= dt;
      if (!acted && !this.queue.length && (op.stun > 0 || op.block || op.parryT > 0)) {
        const c: PunchType = op.stun > 0 ? 'straight' : d <= 42 ? 'bodyHook' : 'bodyStraight';
        const w: Weight = op.stun > 0 ? 'heavy' : 'medium';
        const hand = c === 'bodyHook' ? 'lead' : 'rear';
        if (PUNCH[c].reach + slack >= d) {
          this.throwPunch(out, c, hand, w, d);
          acted = true;
        } else if (!this.entry) this.entry = { punch: c, hand, weight: w, t: 0.4 };
        this.feintT = 0;
      }
    }
    this.think -= dt;
    if (this.think <= 0 && !acted && !this.entry && !this.queue.length && !due && !pivoting) {
      this.think = this.rng.float(0.18, 0.55) * (pressure ? 0.8 : 1) * (1.25 - iq * 0.4) * (me.gas < 25 ? 1.6 : 1);
      if (tilted) this.think *= 0.7;
      if (urgent || hurtOp) this.think *= 0.7;
      if (cruise) this.think *= 1.6;
      if (rest) this.think *= 1.5;
      const r = this.rng.next();
      const opening = me.counterT > 0 || op.stun > 0;
      const badLeg = me.legs < 35;
      // closer range means more chances to grab: only the grapplers' plans take every one
      const grab = this.plan === 'wrestle' || this.plan === 'grind' || this.plan === 'subhunt' ? 1 : 0.6;
      // pinned (and a wrestler), or hurt with him on a roll: tie him up
      if (d < 54 && !L.rules.noGrappling && (this.wallPlan === 'clinch' || (survive && op.momentum > 0.5))) out.push({ type: 'clinch' });
      else if (wrestle && d < 66 && r < (0.12 + sk.wrestling / 500 + (urgent && sk.wrestling > 55 ? 0.1 : 0)) * grab) out.push({ type: 'shoot' });
      else if (d < 54 && r < (0.09 + (wrestle ? 0.08 : 0) + (sk.wrestling > sk.striking ? 0.04 : 0) + (rest ? 0.08 : 0)) * grab * (sk.wrestling > sk.striking || rest || survive ? 1 : 0.5)) out.push({ type: 'clinch' });
      else if (d < 58 && (r < (rest ? 0.45 : cruise ? 0.5 : 0.75) || opening || urgent) && !(this.plan === 'counter' && !opening && !urgent && r > 0.35)) {
        // a counter puncher who has to lead is in no hurry to lead again
        if (this.plan === 'counter' && !opening) this.think *= 1.4;
        const kick = badLeg ? 0.04 : this.plan === 'legs' ? 0.45 : 0.18 + (sk.striking > 65 ? 0.05 : 0) + (urgent ? 0.08 : 0) + (parryHappy ? 0.12 : 0) + (pullHappy ? 0.15 : 0);
        if (this.rng.chance(kick) && !rest) {
          const kr = this.rng.next();
          // a man coming forward eats a front kick; flashy strikers throw the spinning stuff now and then;
          // behind on the cards, he swings for the head
          let level: KickLevel = badLeg ? 'front' : op.act && d > 50 && kr < 0.2 ? 'front' : this.plan === 'legs' || kr < 0.42 ? 'low' : kr < (urgent ? 0.55 : 0.7) ? 'body' : kr < (urgent ? 0.9 : 0.84) ? 'head' : kr < 0.94 ? 'front' : sk.striking > 72 ? 'spin' : 'body';
          // a man who pulls away gets teeped back to the fence; a man who parries everything gets his legs chopped
          if (pullHappy && kr < 0.5) level = 'front';
          else if (parryHappy && kr < 0.6) level = 'low';
          // too far for that one: the longer kicks
          if (KICK[level].reach + slack < d) level = KICK.body.reach + slack >= d ? 'body' : 'front';
          this.throwKick(out, level, d);
        } else if (!rest && d > 46 && this.rng.chance((pressure ? 0.45 : this.plan === 'counter' ? 0.12 : 0.28) * (0.6 + iq * 0.6))) {
          // step in behind a short shot
          const sp = this.pickPunch(AI_ENTRY_PUNCHES);
          const hand = sp === 'overhand' || sp === 'uppercut' ? 'rear' : this.rng.chance(0.6) ? 'lead' : 'rear';
          this.entry = { punch: sp, hand, weight: opening || hurtOp || this.rng.chance(0.3) ? 'heavy' : 'medium', t: 0.5 };
          return { intents: out, move: toward };
        } else if (this.habit === 'jab' && !rest && this.rng.chance(0.4)) {
          // he's timing your jab: slip it and come back over it with the right hand
          out.push({ type: 'evade', kind: 'slip', source: 'button' });
          this.entry = { punch: 'straight', hand: 'rear', weight: opening ? 'heavy' : 'medium', t: 0.5 };
          return { intents: out, move: toward };
        } else if (parryHappy && !this.feintT && this.rng.chance(0.35)) {
          // he parries everything: show him one upstairs, then go where his hands aren't
          out.push({ type: 'feint' });
          this.feintT = 0.5;
          return { intents: out, move };
        } else {
          // mix it up: work the body when he's covering up, go upstairs when he drops his hands
          const body = (op.block ? 0.45 : op.body < 60 ? 0.3 : this.read.blocked >= 4 ? 0.35 : 0.15) + (parryHappy ? 0.3 : 0);
          // only what reaches from here
          const menu = rest ? AI_REST_PUNCHES : AI_PUNCHES;
          const types: PunchType[] = [];
          for (const t of menu) if (PUNCH[t].reach + slack >= d) types.push(t);
          if (!rest && sk.striking > 75 && PUNCH.spinBackfist.reach + slack >= d) types.push('spinBackfist');
          if (!types.length) types.push('jab');
          let punch = this.pickPunch(types);
          if (this.rng.chance(body) && (punch === 'jab' || punch === 'straight' || punch === 'hook')) {
            const low: PunchType = punch === 'jab' ? 'bodyJab' : punch === 'straight' ? 'bodyStraight' : 'bodyHook';
            if (PUNCH[low].reach + slack >= d) punch = low;
          }
          const weight: Weight = opening || hurtOp || this.rng.chance(0.2 + sk.power / 400 + (urgent ? 0.2 : 0)) ? 'heavy' : rest ? 'light' : this.rng.chance(0.5) ? 'medium' : 'light';
          const lead = punch === 'jab' || punch === 'bodyJab' || (punch === 'hook' && this.rng.chance(0.6)) || (punch === 'bodyHook' && this.rng.chance(0.5));
          // or put punches together: one of his combinations, the ones that have been landing more often
          const combo = me.gas > 40 && this.rng.chance(0.25 + iq * 0.35) ? this.pickCombo(L, d, slack) : null;
          if (combo) {
            this.queue.length = 0;
            const n = Math.min(combo.length, 2 + Math.round(iq * 2));
            for (let k = 1; k < n; k++) this.queue.push(combo[k]);
            this.qWeight = 'heavy';
            this.qHand = 'rear';
            this.comboStep(out, combo[0], d, false);
            return { intents: out, move };
          }
          // a little short from here: the sharper man takes the step that puts it on the button
          if (!rest && PUNCH[punch].reach < d && this.rng.chance(0.5 + iq * 0.5)) {
            this.entry = { punch, hand: lead ? 'lead' : 'rear', weight, t: 0.45 };
            return { intents: out, move: toward };
          }
          this.throwPunch(out, punch, lead ? 'lead' : 'rear', weight, d);
        }
      } else if (r > 0.985 && d > 64 && me.hp > op.hp + 20 && me.gas > 40) out.push({ type: 'taunt' });
      else if (r > (iq > 0.6 ? 0.86 : 0.92)) {
        out.push({ type: 'feint' });
        this.feintT = 0.5;
      }
    }
    return { intents: out, move };
  }

  /** Throw on the feet, and remember from how far (for the learning). */
  private throwPunch(out: FightIntent[], punch: PunchType, hand: 'lead' | 'rear', weight: Weight, d: number): void {
    this.lastThrowD[PUNCH[punch].name] = d;
    out.push({ type: 'punch', hand, punch, weight, hold: 0.2, pressure: 1, grounded: false });
  }

  private throwKick(out: FightIntent[], level: KickLevel, d: number): void {
    this.lastThrowD[KICK[level].name] = d;
    out.push({ type: 'kick', level });
  }

  /** One of his combinations that starts with something that reaches, weighted by how that first shot has been landing. */
  private pickCombo(L: LiveFight, d: number, slack: number): string[] | null {
    let fam = 'default';
    for (const st of (this.side === 0 ? L.A : L.B).styles) {
      if (STYLE_FAMILY[st]) {
        fam = STYLE_FAMILY[st];
        break;
      }
    }
    const list = COMBOS[fam];
    const w: number[] = [];
    let total = 0;
    for (const c of list) {
      let x = 0;
      if (stepReach(c[0]) + slack >= d && !(L.rules.noGrappling && c.includes('shoot'))) {
        const m = this.mine[stepName(c[0])];
        x = m && m.t >= 3 ? 1 + 1.5 * (m.l / m.t) : 1;
      }
      w.push(x);
      total += x;
    }
    if (total <= 0) return null;
    let r = this.rng.next() * total;
    for (let k = 0; k < list.length; k++) {
      if (w[k] <= 0) continue;
      r -= w[k];
      if (r <= 0) return list[k];
    }
    for (let k = list.length - 1; k >= 0; k--) if (w[k] > 0) return list[k];
    return null;
  }

  /** Throw one step of a combination: the set-up shots quick and light, the last one with everything. */
  private comboStep(out: FightIntent[], step: string, d: number, last: boolean): void {
    if (step === 'feint') out.push({ type: 'feint' });
    else if (step === 'shoot') out.push({ type: 'shoot' });
    else if (step.startsWith('kick:')) this.throwKick(out, step.slice(5) as KickLevel, d);
    else {
      const p = step as PunchType;
      const w: Weight = last ? this.qWeight : this.rng.chance(0.6) ? 'light' : 'medium';
      // jabs from the lead, straights from the rear, hooks and uppercuts off whichever hand went last
      const hand = p === 'jab' || p === 'bodyJab' ? 'lead' : p === 'straight' || p === 'bodyStraight' || p === 'overhand' || p === 'spinBackfist' ? 'rear' : this.qHand === 'lead' ? 'rear' : 'lead';
      this.qHand = hand;
      this.throwPunch(out, p, hand, w, d);
    }
  }

  /** What's been working gets thrown more: each punch's weight grows with how often it's landed. */
  private pickPunch(types: PunchType[]): PunchType {
    const w = types.map((t) => {
      const name = PUNCH[t].name;
      const m = this.mine[name];
      return m && m.t >= 3 ? 1 + 1.5 * (m.l / m.t) : 1;
    });
    let x = this.rng.next() * w.reduce((a, b) => a + b, 0);
    for (let i = 0; i < types.length; i++) {
      x -= w[i];
      if (x <= 0) return types[i];
    }
    return types[types.length - 1];
  }
}
