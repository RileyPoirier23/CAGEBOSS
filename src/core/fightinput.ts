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
  | 'lead' | 'rear' | 'kick' | 'block' | 'grab' | 'feint' | 'body' | 'taunt' | 'dodge'
  | 'evadeUp' | 'evadeDown' | 'evadeAway' | 'evadeToward'
  | 'getupLeft' | 'getupRight';

/** Buttons on the on-screen touch fight pad (src/ui/fightpad.ts). */
export type TouchFightButton = 'LEAD' | 'REAR' | 'KICK' | 'BLOCK' | 'GRAB' | 'EVADE' | 'BODY' | 'FEINT' | 'TAUNT' | 'UPL' | 'UPR';

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
  feint: { pad: ['Y'], keys: ['KeyU'], touch: ['FEINT'] },
  // everybody has his own: the bird, come-on-then, hands down, chest pound...
  taunt: { pad: ['X'], keys: ['KeyT'], touch: ['TAUNT'] },
  // hold to send strikes to the body (the stick also works: down + punch)
  body: { pad: ['LT'], keys: ['KeyO'], touch: ['BODY'] },
  // tap with the stick pointed = head movement that way (alone: pull). Pads flick the right stick instead.
  dodge: { keys: ['KeyH'], touch: ['EVADE'] },
  // right-stick flicks are read from the stick; these are the digital equivalents
  evadeUp: { keys: ['ArrowUp'] },
  evadeDown: { keys: ['ArrowDown'] },
  evadeAway: { keys: [] }, // arrows are resolved against facing, see sampleFight()
  evadeToward: { keys: [] },
  getupLeft: { pad: ['LT'], keys: ['KeyQ'], touch: ['UPL'] },
  getupRight: { pad: ['RT'], keys: ['KeyE'], touch: ['UPR'] },
};

export const FIGHT_ACTIONS: Record<FightButton, FightActionInfo> = {
  lead: { label: 'Lead hand', help: 'Tap = light, hold = heavy. Push the stick AS you press (walking doesn\'t count): neutral jab, toward/up hook, down body jab, down+toward uppercut. Clinch: short hooks' },
  rear: { label: 'Rear hand', help: 'Push the stick AS you press: neutral straight, toward hook, up overhand, down body shot, down+toward uppercut, away spinning backfist. Clinch: heavy = elbow' },
  kick: { label: 'Kick', help: 'Push the stick AS you kick: neutral body, up head, down leg, toward front kick, away spinning kick. Clinch: knees (up = head from the plum). Ground: pass / sweep / stand' },
  block: { label: 'Block / parry', help: 'Hold to block (head high; body and legs leak through), tap just before a punch lands to parry' },
  grab: { label: 'Grab', help: 'Hold = clinch (push toward = shoot). Press when he shoots = sprawl. Clinch: up plum, toward underhooks, down trip, away break. Ground: + stick = submission' },
  feint: { label: 'Feint', help: 'Fake a strike: a good one makes him flinch and opens a counter. Block while holding a punch = it never comes out' },
  taunt: { label: 'Taunt', help: 'Your own taunt (some flip him off). Gets a breath back and gets in his head: he comes forward reckless. Hands are down while you do it' },
  body: { label: 'Body modifier', help: 'Hold with a punch to go to the body (jab, straight, hook). Same as stick down' },
  dodge: { label: 'Dodge', help: 'Point the stick and tap: slip (up), roll (down), pull (away), lean (toward). Alone: pull' },
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
  dirFresh: 0.2, // a toward/away held longer than this is walking, not a strike modifier
  dirGrace: 0.07, // a direction pushed this soon after a punch or DODGE press still picks the move (J + D, H + W together)
  subKeep: 0.25, // submissions: the stick may sit in neutral this long between quarter turns (keyboard taps)
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
  lead: ['Comma'], rear: ['Period'], kick: ['Slash'], block: ['ShiftRight'], grab: ['Enter'], feint: ['Quote'], body: ['Semicolon'], taunt: ['Backslash'], dodge: ['KeyP'],
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
  // head movement: right stick; DODGE (key / touch EVADE) goes the way the move stick points, alone it pulls
  let look = padList.length && pad !== -1 ? inp.stick('right', pad) : { x: 0, y: 0 };
  if (held.has('dodge')) {
    const m = Math.hypot(move.x, move.y);
    look = m > 0.3 ? { x: move.x / m, y: move.y / m } : { x: -facing, y: 0 };
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
  /** when the stick last went back to neutral during a submission (-1 = it's deflected) */
  private subLostT = -1;
  private subAccum = 0;
  private subTurns = 0;
  private mashTimes: number[] = [];
  private lastGetup: { side: 'left' | 'right'; t: number } | null = null;
  private lastDir8: Dir8 = 'neutral';
  private dir8Since = 0;

  /** Remap one action. */
  bind(action: FightButton, b: FightBinding): void {
    this.bindings[action] = { pad: b.pad?.slice(), keys: b.keys?.slice(), touch: b.touch?.slice() };
  }

  /** Seconds a button has been held (0 if up, or if the press was already used up) — for charge meters. */
  heldFor(b: FightButton): number {
    const p = this.presses.get(b);
    return p && !p.fired ? this.t - p.t : 0;
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
    this.subLostT = -1;
    this.subAccum = this.subTurns = 0;
    this.mashTimes = [];
    this.lastGetup = null;
    this.lastDir8 = 'neutral';
    this.dir8Since = 0;
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
    const raw8 = stickDir8(s.move, ctx.facing);
    const turned = raw8 !== this.lastDir8;
    if (turned) {
      this.lastDir8 = raw8;
      this.dir8Since = this.t;
    }
    // standing, a sideways direction only picks the strike if it was just pushed: walking in and pressing lead is still a jab
    const stale = !ctx.grounded && !ctx.clinch && this.t - this.dir8Since > T.dirFresh;
    const dir8: Dir8 = stale ? (raw8 === 'toward' || raw8 === 'away' ? 'neutral' : raw8 === 'upToward' || raw8 === 'upAway' ? 'up' : raw8) : raw8;
    const pressDir: Dir = stale && (moveDir === 'toward' || moveDir === 'away') ? 'neutral' : moveDir;
    for (const b of s.held) if (!this.prevHeld.has(b)) this.presses.set(b, { t: this.t, dir: pressDir, dir8, body: s.held.has('body'), pressure: s.pressure[b] ?? 1, analog: !!s.analog?.has(b) });
    // pressed J a hair before D: a direction that arrives just after the press still picks the punch
    if (turned && raw8 !== 'neutral') {
      for (const hand of ['lead', 'rear'] as const) {
        const p = this.presses.get(hand);
        if (p && !p.fired && s.held.has(hand) && p.t < this.t && this.t - p.t <= T.dirGrace + 1e-9) {
          p.dir8 = dir8;
          p.dir = pressDir;
        }
      }
    }
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
          // a jump of more than three eighths of a turn (up, then straight down through the middle) has no
          // direction: it moves the anchor but doesn't count, so wiggling up and down is not a roll
          if (Math.abs(d) > Math.PI * 0.75) d = 0;
          this.subAccum += d;
          while (Math.abs(this.subAccum) >= Math.PI / 2) {
            const dir = this.subAccum > 0 ? 1 : -1;
            this.subAccum -= dir * (Math.PI / 2);
            this.subTurns += dir;
            out.push({ type: 'subTurn', dir, turns: this.subTurns, role });
          }
        }
        this.subAngle = a;
        this.subLostT = -1;
      } else if (this.subAngle !== null) {
        // keyboard taps (W, D, S, A) pass through neutral: keep the last angle for a moment
        if (this.subLostT < 0) this.subLostT = this.t;
        else if (this.t - this.subLostT > T.subKeep) this.subAngle = null;
      }
      if (down('kick') || down('grab')) {
        this.mashTimes.push(this.t);
        out.push({ type: 'mash', rate: this.mashRate(), role });
      }
      return this.finish(s, out);
    }
    this.subAngle = null;
    this.subLostT = -1;
    this.subAccum = this.subTurns = 0;

    // a block pressed while a punch is held calls the punch off (the hold feint)
    if (down('block')) {
      for (const hand of ['lead', 'rear'] as const) {
        const p = this.presses.get(hand);
        if (p && s.held.has(hand)) p.fired = true;
      }
    }

    // punches resolve on release: hold time = weight, press-time stick = type
    for (const hand of ['lead', 'rear'] as const) {
      if (!up(hand)) continue;
      const p = this.presses.get(hand);
      if (!p || p.fired) continue;
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
      if (down('grab')) out.push(ctx.beingShot ? { type: 'sprawl' } : { type: 'clinchMove', move: moveDir === 'up' ? 'plum' : moveDir === 'toward' ? 'under' : moveDir === 'down' ? 'trip' : moveDir === 'away' ? 'break' : 'pummel' });
    } else {
      if (down('kick')) out.push({ type: 'kick', level: pressDir === 'up' ? 'head' : pressDir === 'down' ? 'low' : pressDir === 'toward' ? 'front' : pressDir === 'away' ? 'spin' : 'body' });

      // clinch / shoot on hold; while he's shooting, the press itself is the sprawl (no waiting for the release)
      const g = this.presses.get('grab');
      if (g && down('grab') && ctx.beingShot) {
        g.fired = true;
        out.push({ type: 'sprawl' });
      }
      if (g && s.held.has('grab') && !g.fired && this.t - g.t >= T.grabHold) {
        g.fired = true;
        out.push(g.dir === 'toward' || (moveDir === 'toward' && this.dir8Since > g.t) ? { type: 'shoot' } : { type: 'clinch' });
      }

      // head movement: DODGE (+ the stick), a right-stick flick, or the digital evade buttons
      const dg = this.presses.get('dodge');
      if (dg && (s.held.has('dodge') || up('dodge'))) {
        // DODGE goes the way the stick points. Pressed a hair before the stick (H and W together), it waits
        // a moment for the direction; with none (or a quick tap already let go) it's a pull.
        const pointed = s.held.has('dodge') && Math.hypot(s.move.x, s.move.y) > 0.3;
        if (!dg.fired && this.t - dg.t > T.dirGrace + T.flickTime) dg.fired = true; // held since before (down on the mat): not a dodge
        if (!dg.fired && (pointed || !s.held.has('dodge') || this.t - dg.t >= T.dirGrace - 1e-9)) {
          dg.fired = true;
          const d = pointed ? stickDir(s.move, ctx.facing, 0.3) : 'away';
          out.push({ type: 'evade', kind: d === 'up' ? 'slip' : d === 'down' ? 'roll' : d === 'away' ? 'pull' : 'lean', source: 'flick' });
        }
        // (while it's held the dodge stands in for the right stick: no flick from it)
        this.lookFired = true;
      } else {
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

// ------------------------------------------------------------ haptics

export type FightHaptic = 'land' | 'landBig' | 'hurt' | 'hurtBig' | 'blocked' | 'parried' | 'charged' | 'kd' | 'heartbeat';
/** Pad rumble per moment: [strong, weak, ms]. */
const HAPTIC_PAD: Record<FightHaptic, [number, number, number]> = {
  land: [0.15, 0.1, 40], landBig: [0.6, 0.4, 120], hurt: [0.35, 0.2, 90], hurtBig: [0.9, 0.6, 220],
  blocked: [0.2, 0.1, 60], parried: [0.2, 0.1, 60], charged: [0.12, 0.05, 30], kd: [1, 0.7, 400], heartbeat: [0.08, 0, 40],
};
/** Phone buzz per moment (ms, or an on/off/on pattern). */
const HAPTIC_TOUCH: Record<FightHaptic, number | number[]> = {
  land: 10, landBig: 35, hurt: [30, 40, 30], hurtBig: 60, blocked: [10, 30, 10], parried: [10, 30, 10], kd: 250, charged: 8, heartbeat: 15,
};
/** when the phone last buzzed (ms): a flurry is one buzz every 60 ms at most, not a constant drone */
let lastBuzz = -1e9;

/**
 * Feel the fight: what you landed, what landed on you, a blocked or parried shot, a loaded heavy,
 * a knockdown, your heart when you're hurt or gassed. Pads rumble; phones buzz. on = the Vibration setting.
 * pad = whose controller (two-player fights; -1 = none, a keyboard player): left out, the pad in use (or the phone).
 */
export function fightHaptic(inp: Input, kind: FightHaptic, on = true, pad?: number): void {
  if (!on) return;
  if (inp.lastDevice === 'touch' && pad === undefined) {
    const now = performance.now();
    if (now - lastBuzz < 60) return;
    lastBuzz = now;
    try {
      navigator.vibrate?.(HAPTIC_TOUCH[kind]);
    } catch {
      /* no vibration motor */
    }
    return;
  }
  const r = HAPTIC_PAD[kind];
  inp.rumble(r[0], r[1], r[2], pad);
}

/** Rumble scaled to how big a hit was (0..1). Light hits are ignored. */
export function rumbleForHit(inp: Input, power: number): void {
  if (power < 0.35) return;
  fightHaptic(inp, power >= 0.7 ? 'hurtBig' : 'hurt');
}
