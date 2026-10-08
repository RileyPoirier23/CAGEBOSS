/**
 * Fighter Mode controls (groundwork). A remappable, data-driven action table plus an
 * interpreter that turns raw input (pad / keyboard / touch fight pad) into fight
 * intents in the spirit of a real 2D boxing game: light / medium / heavy punches by
 * hold time, punch type by stick direction, block vs parry by timing, head movement
 * by right-stick flick, kicks by level, clinch / shoot / sprawl, ground positions,
 * submission rotation + mashing, and the alternate-trigger get-up.
 *
 * No fight gameplay lives here: the fight scene owns a FightInput, feeds it a
 * FightContext each frame and acts on the FightIntent[] it returns.
 *
 *   const fi = new FightInput();
 *   ticker: const intents = fi.update(sampleFight(input, fi.bindings, touchPad?.state()), dt, ctx);
 *
 * Directions are relative to the fighter: "toward" = toward the opponent (ctx.facing),
 * "up" = stick up. Screen y grows downward, as in the Gamepad API.
 */
import type { Input, PadButton } from './input';

// ------------------------------------------------------------ action table

export type FightButton =
  | 'lead' | 'rear' | 'kick' | 'block' | 'grab' | 'feint' | 'body' | 'taunt'
  | 'evadeUp' | 'evadeDown' | 'evadeAway' | 'evadeToward'
  | 'getupLeft' | 'getupRight';

/** Buttons on the on-screen touch fight pad (src/ui/fightpad.ts). */
export type TouchFightButton = 'LEAD' | 'REAR' | 'KICK' | 'BLOCK' | 'GRAB' | 'EVADE' | 'BODY';

export interface FightBinding {
  pad?: PadButton[];
  /** KeyboardEvent.code values */
  keys?: string[];
  touch?: TouchFightButton[];
}

export interface FightActionInfo {
  label: string;
  /** one line for the controls screen */
  help: string;
}

/** Default bindings (Xbox layout / keyboard / touch). Copy before editing. */
export const DEFAULT_FIGHT_BINDINGS: Record<FightButton, FightBinding> = {
  lead: { pad: ['RB'], keys: ['KeyJ'], touch: ['LEAD'] },
  rear: { pad: ['RT'], keys: ['KeyK'], touch: ['REAR'] },
  kick: { pad: ['A'], keys: ['KeyL'], touch: ['KICK'] },
  block: { pad: ['LB'], keys: ['ShiftLeft', 'KeyI'], touch: ['BLOCK'] },
  grab: { pad: ['B'], keys: ['Space'], touch: ['GRAB'] },
  feint: { pad: ['Y'], keys: ['KeyU'] },
  // everybody has his own: the bird, come-on-then, hands down, chest pound...
  taunt: { pad: ['X'], keys: ['KeyT'] },
  // hold to send strikes to the body (the stick also works: down + punch)
  body: { pad: ['LT'], keys: ['KeyO'], touch: ['BODY'] },
  // right-stick flicks are read from the stick; these are the digital equivalents
  evadeUp: { keys: ['ArrowUp'] },
  evadeDown: { keys: ['ArrowDown'] },
  evadeAway: { keys: [] }, // arrows are resolved against facing, see sampleFight()
  evadeToward: { keys: [] },
  getupLeft: { pad: ['LT'], keys: ['KeyQ'] },
  getupRight: { pad: ['RT'], keys: ['KeyE'] },
};

export const FIGHT_ACTIONS: Record<FightButton, FightActionInfo> = {
  lead: { label: 'Lead hand', help: 'Tap = light, hold = heavy. Neutral jab, toward/up hook, down body jab, down+toward uppercut. Clinch: short hooks' },
  rear: { label: 'Rear hand', help: 'Neutral straight, toward hook, up overhand, down body shot, down+toward uppercut, away spinning backfist. Clinch: heavy = elbow' },
  kick: { label: 'Kick', help: 'Neutral body, up head, down leg, toward front kick, away spinning kick. Clinch: knees (up = head from the plum). Ground: pass / sweep / stand' },
  block: { label: 'Block / parry', help: 'Hold to block (head high; body and legs leak through), tap just before a punch lands to parry' },
  grab: { label: 'Grab', help: 'Hold = clinch (toward = shoot). Tap = sprawl. Clinch: up plum, toward underhooks, down trip, away break. Ground: + stick = submission' },
  feint: { label: 'Feint', help: 'Fake a strike: a good one makes him flinch and opens a counter' },
  taunt: { label: 'Taunt', help: 'Your own taunt (some flip him off). Gets a breath back and gets in his head: he comes forward reckless. Hands are down while you do it' },
  body: { label: 'Body modifier', help: 'Hold with a punch to go to the body (jab, straight, hook). Same as stick down' },
  evadeUp: { label: 'Slip', help: 'Right stick flick up (or arrow)' },
  evadeDown: { label: 'Roll / duck', help: 'Right stick flick down' },
  evadeAway: { label: 'Pull', help: 'Right stick flick away from the opponent' },
  evadeToward: { label: 'Lean in', help: 'Right stick flick toward the opponent' },
  getupLeft: { label: 'Get up (L)', help: 'Knocked down: alternate LT / RT in rhythm' },
  getupRight: { label: 'Get up (R)', help: 'Knocked down: alternate LT / RT in rhythm' },
};

/** Timing / threshold tuning (seconds, stick units). */
export const FIGHT_TUNING = {
  tapMax: 0.16, // shorter press = light
  mediumMax: 0.42, // up to here = medium, beyond = heavy
  parryWindow: 0.15, // block pressed this long without release = a block rather than a parry
  grabHold: 0.25, // grab held this long = clinch / shoot; shorter = tap (sprawl)
  dir: 0.5, // stick deflection that counts as a direction
  flickLow: 0.3, // stick must start near centre...
  flickHigh: 0.75, // ...and reach here...
  flickTime: 0.14, // ...within this long to count as a flick
  mashWindow: 1, // presses counted over this window for mash rate
  getupMin: 0.16, // ideal alternate-trigger interval
  getupMax: 0.5,
};

// ------------------------------------------------------------ context + intents

export interface FightContext {
  /** +1 = opponent is to the right, -1 = to the left */
  facing: 1 | -1;
  grounded?: boolean;
  /** tied up in the clinch: grab taps fight for position, kicks are knees */
  clinch?: boolean;
  /** opponent is shooting a takedown on us (sprawl window) */
  beingShot?: boolean;
  submission?: 'attack' | 'defend' | null;
  knockedDown?: boolean;
}

export type Dir = 'neutral' | 'up' | 'down' | 'toward' | 'away';
export type PunchType = 'jab' | 'straight' | 'hook' | 'uppercut' | 'overhand' | 'bodyJab' | 'bodyStraight' | 'bodyHook' | 'spinBackfist';
/** 8-way stick direction (relative to the opponent), for strike selection. */
export type Dir8 = Dir | 'downToward' | 'upToward' | 'downAway' | 'upAway';
export type Weight = 'light' | 'medium' | 'heavy';

export type FightIntent =
  | { type: 'punch'; hand: 'lead' | 'rear'; punch: PunchType; weight: Weight; hold: number; pressure: number; grounded: boolean }
  | { type: 'parry' }
  | { type: 'block'; phase: 'start' | 'end' }
  | { type: 'evade'; kind: 'slip' | 'roll' | 'pull' | 'lean'; source: 'flick' | 'button' }
  | { type: 'kick'; level: 'low' | 'body' | 'head' | 'front' | 'spin' }
  | { type: 'clinch' }
  | { type: 'clinchMove'; move: 'plum' | 'under' | 'pummel' | 'trip' | 'break' }
  | { type: 'shoot' }
  | { type: 'sprawl' }
  | { type: 'feint' }
  | { type: 'taunt' }
  | { type: 'ground'; move: 'advance' | 'reverse' | 'standup' | 'base' }
  | { type: 'subAttempt'; dir: Dir }
  | { type: 'subTurn'; dir: 1 | -1; turns: number; role: 'attack' | 'defend' }
  | { type: 'mash'; rate: number; role: 'attack' | 'defend' }
  | { type: 'getup'; side: 'left' | 'right'; rhythm: number }
  | { type: 'getupFumble' };

/** One frame of raw fight input, from any device. */
export interface FightSample {
  move: { x: number; y: number };
  look: { x: number; y: number };
  held: Set<FightButton>;
  /** analog pressure 0..1 for buttons on triggers (1 for digital) */
  pressure: Partial<Record<FightButton, number>>;
  /** buttons currently driven by an analog trigger */
  analog?: Set<FightButton>;
}

export interface TouchPadState {
  stick: { x: number; y: number };
  held: Set<TouchFightButton>;
}

/** Classify a stick vector relative to the fighter. */
export function stickDir(v: { x: number; y: number }, facing: 1 | -1, threshold = FIGHT_TUNING.dir): Dir {
  const rx = v.x * facing;
  if (Math.hypot(rx, v.y) < threshold) return 'neutral';
  if (Math.abs(v.y) >= Math.abs(rx)) return v.y < 0 ? 'up' : 'down';
  return rx > 0 ? 'toward' : 'away';
}

export function stickDir8(v: { x: number; y: number }, facing: 1 | -1, threshold = FIGHT_TUNING.dir): Dir8 {
  const rx = v.x * facing;
  if (Math.hypot(rx, v.y) < threshold) return 'neutral';
  const diag = 0.38;
  if (Math.abs(rx) > diag && Math.abs(v.y) > diag) {
    if (v.y > 0) return rx > 0 ? 'downToward' : 'downAway';
    return rx > 0 ? 'upToward' : 'upAway';
  }
  return stickDir(v, facing, threshold);
}

/**
 * Directional strikes (UFC style): the stick when the button goes down picks the shot.
 *   neutral: jab / straight      toward: lead hook / rear hook       up: lead hook / overhand
 *   down: body jab / body straight      down+toward: uppercuts      away: pull-counter jab / spinning backfist
 * Holding the body modifier sends jabs, straights and hooks downstairs.
 */
export function punchFor(hand: 'lead' | 'rear', d: Dir8, body: boolean): PunchType {
  let p: PunchType;
  if (d === 'downToward' || d === 'downAway') p = 'uppercut';
  else if (d === 'down') p = hand === 'lead' ? 'bodyJab' : 'bodyStraight';
  else if (d === 'toward' || d === 'upToward') p = 'hook';
  else if (d === 'up') p = hand === 'lead' ? 'hook' : 'overhand';
  else if (d === 'away' || d === 'upAway') p = hand === 'lead' ? 'jab' : 'spinBackfist';
  else p = hand === 'lead' ? 'jab' : 'straight';
  if (body) p = p === 'jab' ? 'bodyJab' : p === 'straight' ? 'bodyStraight' : p === 'hook' ? 'bodyHook' : p;
  return p;
}

export function weightFor(hold: number): Weight {
  return hold < FIGHT_TUNING.tapMax ? 'light' : hold < FIGHT_TUNING.mediumMax ? 'medium' : 'heavy';
}

/**
 * Which part of the keyboard a player uses. 'full' = everything (one player); in 2-player
 * versus on one keyboard, 'left' = WASD + J K L... (no arrow keys) and 'right' = the arrow keys
 * plus P2_KEYS; 'none' = controller only.
 */
export type KeyboardShare = 'full' | 'left' | 'right' | 'none';
/** Player 2's half of a shared keyboard: arrows to move, the keys around Enter to fight. */
export const P2_KEYS: Partial<Record<FightButton, string[]>> = {
  lead: ['Comma'], rear: ['Period'], kick: ['Slash'], block: ['ShiftRight'], grab: ['Enter'], feint: ['Quote'], body: ['Semicolon'], taunt: ['Backslash'],
  getupLeft: ['BracketLeft'], getupRight: ['BracketRight'],
};

/** Build a FightSample from the shared Input (+ the optional touch fight pad). pad = which controller (-1 = none). */
export function sampleFight(inp: Input, binds: Record<FightButton, FightBinding>, touch?: TouchPadState | null, facing: 1 | -1 = 1, pad?: number, kb: KeyboardShare = 'full'): FightSample {
  const held = new Set<FightButton>();
  const analog = new Set<FightButton>();
  const pressure: Partial<Record<FightButton, number>> = {};
  for (const [name, b] of Object.entries(binds) as [FightButton, FightBinding][]) {
    let p = 0;
    for (const pb of b.pad ?? []) {
      if (pb === 'LT' || pb === 'RT') {
        const v = inp.trigger(pb, pad);
        if (inp.button(pb, pad)) {
          p = Math.max(p, Math.max(v, 0.5));
          analog.add(name);
        }
      } else if (inp.button(pb, pad)) p = 1;
    }
    const keys = kb === 'full' || kb === 'left' ? b.keys ?? [] : kb === 'right' ? P2_KEYS[name] ?? [] : [];
    for (const k of keys) if (kb === 'left' && /^Arrow/.test(k) ? false : inp.key(k)) p = 1;
    for (const t of b.touch ?? []) if (touch?.held.has(t)) p = 1;
    if (p > 0) {
      held.add(name);
      pressure[name] = p;
    }
  }
  // arrow keys left/right = pull / lean depending on which way we face
  const left = kb === 'full' && inp.key('ArrowLeft');
  const right = kb === 'full' && inp.key('ArrowRight');
  if (left || right) held.add((right ? 1 : -1) * facing > 0 ? 'evadeToward' : 'evadeAway');
  // movement: left stick, else WASD, else the touch stick
  let move = { x: 0, y: 0 };
  const padList = inp.padList();
  if (padList.length && pad !== -1) move = inp.stick('left', pad);
  if (!move.x && !move.y && kb !== 'none') {
    const r = kb === 'right';
    const kx = (inp.key(r ? 'ArrowRight' : 'KeyD') ? 1 : 0) - (inp.key(r ? 'ArrowLeft' : 'KeyA') ? 1 : 0);
    const ky = (inp.key(r ? 'ArrowDown' : 'KeyS') ? 1 : 0) - (inp.key(r ? 'ArrowUp' : 'KeyW') ? 1 : 0);
    if (kx || ky) move = { x: kx / Math.hypot(kx, ky), y: ky / Math.hypot(kx, ky) };
  }
  if (!move.x && !move.y && touch) move = { ...touch.stick };
  // head movement: right stick; the touch EVADE button flicks in the touch stick's direction
  let look = padList.length && pad !== -1 ? inp.stick('right', pad) : { x: 0, y: 0 };
  if (touch?.held.has('EVADE') && Math.hypot(touch.stick.x, touch.stick.y) > 0.3) {
    const m = Math.hypot(touch.stick.x, touch.stick.y);
    look = { x: touch.stick.x / m, y: touch.stick.y / m };
  }
  return { move, look, held, pressure, analog };
}

// ------------------------------------------------------------ interpreter

interface Press {
  t: number;
  dir: Dir;
  dir8: Dir8;
  /** body modifier held when the button went down */
  body: boolean;
  pressure: number;
  analog: boolean;
  fired?: boolean;
}

export class FightInput {
  bindings: Record<FightButton, FightBinding> = cloneBindings(DEFAULT_FIGHT_BINDINGS);
  t = 0;
  private prevHeld = new Set<FightButton>();
  private presses = new Map<FightButton, Press>();
  private blocking = false;
  private lookLowT = -1;
  private lookFired = false;
  private subAngle: number | null = null;
  private subAccum = 0;
  private subTurns = 0;
  private mashTimes: number[] = [];
  private lastGetup: { side: 'left' | 'right'; t: number } | null = null;

  /** Remap one action. */
  bind(action: FightButton, b: FightBinding): void {
    this.bindings[action] = { pad: b.pad?.slice(), keys: b.keys?.slice(), touch: b.touch?.slice() };
  }

  /** Seconds a button has been held (0 if up) — for charge meters. */
  heldFor(b: FightButton): number {
    const p = this.presses.get(b);
    return p ? this.t - p.t : 0;
  }

  get isBlocking(): boolean {
    return this.blocking;
  }

  /** Submission state since the hold began: quarter turns and current mash rate. */
  get submissionState(): { turns: number; mashRate: number } {
    return { turns: this.subTurns, mashRate: this.mashRate() };
  }

  /**
   * Treat whatever is held right now as already down (no press edges), e.g. the
   * button that opened the fight screen. Call with the first sample.
   */
  prime(s: FightSample): void {
    this.prevHeld = new Set(s.held);
  }

  reset(): void {
    this.prevHeld.clear();
    this.presses.clear();
    this.blocking = false;
    this.subAngle = null;
    this.subAccum = this.subTurns = 0;
    this.mashTimes = [];
    this.lastGetup = null;
  }

  private mashRate(): number {
    const from = this.t - FIGHT_TUNING.mashWindow;
    this.mashTimes = this.mashTimes.filter((x) => x >= from);
    return this.mashTimes.length / FIGHT_TUNING.mashWindow;
  }

  update(s: FightSample, dt: number, ctx: FightContext): FightIntent[] {
    this.t += dt;
    const out: FightIntent[] = [];
    const T = FIGHT_TUNING;
    const moveDir = stickDir(s.move, ctx.facing);
    const down = (b: FightButton) => s.held.has(b) && !this.prevHeld.has(b);
    const up = (b: FightButton) => !s.held.has(b) && this.prevHeld.has(b);

    // track press starts (direction is read when the button goes down)
    const dir8 = stickDir8(s.move, ctx.facing);
    for (const b of s.held) if (!this.prevHeld.has(b)) this.presses.set(b, { t: this.t, dir: moveDir, dir8, body: s.held.has('body'), pressure: s.pressure[b] ?? 1, analog: !!s.analog?.has(b) });
    for (const b of s.held) {
      const p = this.presses.get(b);
      if (p) p.pressure = Math.max(p.pressure, s.pressure[b] ?? 1);
    }

    if (ctx.knockedDown) {
      // alternate LT / RT in rhythm to beat the count
      for (const side of ['left', 'right'] as const) {
        const b: FightButton = side === 'left' ? 'getupLeft' : 'getupRight';
        if (!down(b)) continue;
        const last = this.lastGetup;
        if (last && last.side === side) out.push({ type: 'getupFumble' });
        else {
          const dtp = last ? this.t - last.t : T.getupMin;
          const rhythm = dtp < T.getupMin ? dtp / T.getupMin : dtp <= T.getupMax ? 1 : Math.max(0, 1 - (dtp - T.getupMax) / T.getupMax);
          out.push({ type: 'getup', side, rhythm: Math.round(rhythm * 100) / 100 });
        }
        this.lastGetup = { side, t: this.t };
      }
      return this.finish(s, out);
    }
    this.lastGetup = null;

    if (ctx.submission) {
      const role = ctx.submission;
      // stick rotation: count quarter turns of the left stick
      if (Math.hypot(s.move.x, s.move.y) > 0.6) {
        const a = Math.atan2(s.move.y, s.move.x);
        if (this.subAngle !== null) {
          let d = a - this.subAngle;
          if (d > Math.PI) d -= Math.PI * 2;
          if (d < -Math.PI) d += Math.PI * 2;
          this.subAccum += d;
          while (Math.abs(this.subAccum) >= Math.PI / 2) {
            const dir = this.subAccum > 0 ? 1 : -1;
            this.subAccum -= dir * (Math.PI / 2);
            this.subTurns += dir;
            out.push({ type: 'subTurn', dir, turns: this.subTurns, role });
          }
        }
        this.subAngle = a;
      } else this.subAngle = null;
      if (down('kick') || down('grab')) {
        this.mashTimes.push(this.t);
        out.push({ type: 'mash', rate: this.mashRate(), role });
      }
      return this.finish(s, out);
    }
    this.subAngle = null;
    this.subAccum = this.subTurns = 0;

    // punches resolve on release: hold time = weight, press-time stick = type
    for (const hand of ['lead', 'rear'] as const) {
      if (!up(hand)) continue;
      const p = this.presses.get(hand);
      if (!p) continue;
      const hold = this.t - p.t;
      const punch = punchFor(hand, p.dir8, p.body);
      // a hard trigger squeeze bumps the weight one step
      let weight = weightFor(hold);
      if (p.analog && p.pressure >= 0.95 && hold >= T.tapMax * 0.6 && weight !== 'heavy') weight = weight === 'light' ? 'medium' : 'heavy';
      out.push({ type: 'punch', hand, punch, weight, hold: round3(hold), pressure: round3(p.pressure), grounded: !!ctx.grounded });
    }

    // block / parry
    // the guard comes up the instant you press (a well-timed press also parries)
    if (down('block')) out.push({ type: 'parry' });
    if (s.held.has('block') && !this.blocking) {
      this.blocking = true;
      out.push({ type: 'block', phase: 'start' });
    }
    if (!s.held.has('block') && this.blocking) {
      this.blocking = false;
      out.push({ type: 'block', phase: 'end' });
    }

    if (down('feint')) out.push({ type: 'feint' });
    if (down('taunt')) out.push({ type: 'taunt' });

    if (ctx.grounded) {
      if (down('kick')) {
        const move = moveDir === 'toward' ? 'advance' : moveDir === 'away' ? 'reverse' : moveDir === 'up' ? 'standup' : 'base';
        out.push({ type: 'ground', move });
      }
      if (down('grab')) out.push({ type: 'subAttempt', dir: moveDir });
    } else if (ctx.clinch) {
      // in the clinch: kicks are knees (up = to the head), grab taps fight for the tie-up
      if (down('kick')) out.push({ type: 'kick', level: moveDir === 'up' ? 'head' : moveDir === 'down' ? 'low' : 'body' });
      if (down('grab')) out.push({ type: 'clinchMove', move: moveDir === 'up' ? 'plum' : moveDir === 'toward' ? 'under' : moveDir === 'down' ? 'trip' : moveDir === 'away' ? 'break' : 'pummel' });
    } else {
      if (down('kick')) out.push({ type: 'kick', level: moveDir === 'up' ? 'head' : moveDir === 'down' ? 'low' : moveDir === 'toward' ? 'front' : moveDir === 'away' ? 'spin' : 'body' });

      // clinch / shoot on hold, sprawl on a tap while being shot
      const g = this.presses.get('grab');
      if (g && s.held.has('grab') && !g.fired && this.t - g.t >= T.grabHold) {
        g.fired = true;
        out.push(g.dir === 'toward' || moveDir === 'toward' ? { type: 'shoot' } : { type: 'clinch' });
      }
      if (up('grab') && g && !g.fired && ctx.beingShot) out.push({ type: 'sprawl' });

      // head movement: right stick flick, or the digital evade buttons
      const mag = Math.hypot(s.look.x, s.look.y);
      if (mag < T.flickLow) {
        this.lookLowT = this.t;
        this.lookFired = false;
      } else if (mag >= T.flickHigh && !this.lookFired && this.lookLowT >= 0 && this.t - this.lookLowT <= T.flickTime + dt) {
        this.lookFired = true;
        const d = stickDir(s.look, ctx.facing, 0.3);
        const kind = d === 'up' ? 'slip' : d === 'down' ? 'roll' : d === 'away' ? 'pull' : 'lean';
        out.push({ type: 'evade', kind, source: 'flick' });
      }
      const evBtn: [FightButton, 'slip' | 'roll' | 'pull' | 'lean'][] = [['evadeUp', 'slip'], ['evadeDown', 'roll'], ['evadeAway', 'pull'], ['evadeToward', 'lean']];
      for (const [b, kind] of evBtn) if (down(b)) out.push({ type: 'evade', kind, source: 'button' });
    }
    return this.finish(s, out);
  }

  private finish(s: FightSample, out: FightIntent[]): FightIntent[] {
    for (const b of this.prevHeld) if (!s.held.has(b)) this.presses.delete(b);
    this.prevHeld = new Set(s.held);
    return out;
  }
}

function round3(x: number): number {
  return Math.round(x * 1000) / 1000;
}

export function cloneBindings(b: Record<FightButton, FightBinding>): Record<FightButton, FightBinding> {
  const out = {} as Record<FightButton, FightBinding>;
  for (const [k, v] of Object.entries(b) as [FightButton, FightBinding][]) out[k] = { pad: v.pad?.slice(), keys: v.keys?.slice(), touch: v.touch?.slice() };
  return out;
}

/** Rumble scaled to how big a hit was (0..1). Light hits are ignored. */
export function rumbleForHit(inp: Input, power: number): void {
  if (power < 0.35) return;
  inp.rumble(Math.min(1, power), Math.min(1, power * 0.6), 80 + Math.round(power * 220));
}
