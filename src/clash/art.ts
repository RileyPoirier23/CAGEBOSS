/* UNIVERSE CLASH - the ink.
   Everything here is Canvas 2D vector art: flat cel fills, one hard shadow,
   a single black outline. No sprites, no gradients in the character work.
   The sim never imports this file; it is pure presentation. */

import type {
  CharArt,
  CharDef,
  CharId,
  Platform,
  Projectile,
  StageDef,
  Trap,
  WorldItem,
  Fighter,
  PoseName,
  MatchState,
  MatchEvent,
} from './types';
import { charDef } from './characters';

const TAU = Math.PI * 2;

export interface ArtOpts {
  /** 0 = no outline, 1 = clean, 2 = heavy */
  outline: number;
  /** 0..1 opacity of the one hard shadow */
  shadow: number;
  /** patterns / halftone on clothing */
  pattern: boolean;
  /** skips costly particles and secondary details */
  lite: boolean;
}

export const ART_DEFAULT: ArtOpts = { outline: 2, shadow: 0.32, pattern: true, lite: false };

/* --------------------------------------------------------------- canvas -- */

export function makeCanvas(w: number, h: number): HTMLCanvasElement {
  const c = document.createElement('canvas');
  c.width = Math.max(1, Math.round(w));
  c.height = Math.max(1, Math.round(h));
  return c;
}

export function ctxOf(c: HTMLCanvasElement): CanvasRenderingContext2D {
  const ctx = c.getContext('2d');
  if (!ctx) throw new Error('canvas 2d unavailable');
  return ctx;
}

export function hash(n: number): number {
  let x = Math.imul(n | 0, 0x9e3779b1) ^ 0x85ebca6b;
  x ^= x >>> 13;
  x = Math.imul(x, 0xc2b2ae35);
  x ^= x >>> 16;
  return (x >>> 0) / 0x100000000;
}

export function rand(seed: number, i: number): number {
  return hash(Math.imul(seed | 0, 374761393) + Math.imul(i | 0, 668265263));
}

function inkWidth(opts: ArtOpts, scale = 1): number {
  return opts.outline <= 0 ? 0 : (opts.outline >= 2 ? 4.4 : 3) * scale;
}

/* --------------------------------------------------------------- shapes -- */

function poly(ctx: CanvasRenderingContext2D, pts: [number, number][], fill: string, lw = 0, ink = '#12100f'): void {
  ctx.beginPath();
  ctx.moveTo(pts[0][0], pts[0][1]);
  for (let i = 1; i < pts.length; i++) ctx.lineTo(pts[i][0], pts[i][1]);
  ctx.closePath();
  ctx.fillStyle = fill;
  ctx.fill();
  if (lw > 0) {
    ctx.lineWidth = lw;
    ctx.strokeStyle = ink;
    ctx.lineJoin = 'round';
    ctx.stroke();
  }
}

function circle(ctx: CanvasRenderingContext2D, x: number, y: number, r: number, fill: string, lw = 0, ink = '#12100f'): void {
  ctx.beginPath();
  ctx.arc(x, y, r, 0, TAU);
  ctx.fillStyle = fill;
  ctx.fill();
  if (lw > 0) {
    ctx.lineWidth = lw;
    ctx.strokeStyle = ink;
    ctx.stroke();
  }
}

function ellipse(ctx: CanvasRenderingContext2D, x: number, y: number, rx: number, ry: number, fill: string, lw = 0, ink = '#12100f'): void {
  ctx.beginPath();
  ctx.ellipse(x, y, rx, ry, 0, 0, TAU);
  ctx.fillStyle = fill;
  ctx.fill();
  if (lw > 0) {
    ctx.lineWidth = lw;
    ctx.strokeStyle = ink;
    ctx.stroke();
  }
}

/** A limb: thick round-capped stroke, ink casing first, colour second. */
function limb(
  ctx: CanvasRenderingContext2D,
  x0: number, y0: number, x1: number, y1: number,
  r: number, fill: string, lw: number, ink: string,
): void {
  ctx.lineCap = 'round';
  if (lw > 0) {
    ctx.beginPath();
    ctx.moveTo(x0, y0);
    ctx.lineTo(x1, y1);
    ctx.lineWidth = r * 2 + lw;
    ctx.strokeStyle = ink;
    ctx.stroke();
  }
  ctx.beginPath();
  ctx.moveTo(x0, y0);
  ctx.lineTo(x1, y1);
  ctx.lineWidth = r * 2 - 0.5;
  ctx.strokeStyle = fill;
  ctx.stroke();
}

/** A limb with one hard shadow tone laid along the side away from the key light. */
function limbShaded(
  ctx: CanvasRenderingContext2D,
  x0: number, y0: number, x1: number, y1: number,
  r: number, fill: string, shade: string, lw: number, ink: string,
): void {
  limb(ctx, x0, y0, x1, y1, r, fill, lw, ink);
  const dx = x1 - x0;
  const dy = y1 - y0;
  const len = Math.hypot(dx, dy) || 1;
  let px = -dy / len;
  let py = dx / len;
  if (px > 0) {
    px = -px;
    py = -py;
  }
  const off = r * 0.5;
  const a = ctx.globalAlpha;
  ctx.globalAlpha = a * 0.6;
  ctx.beginPath();
  ctx.moveTo(x0 + px * off, y0 + py * off);
  ctx.lineTo(x1 + px * off, y1 + py * off);
  ctx.lineWidth = r * 0.85;
  ctx.lineCap = 'round';
  ctx.strokeStyle = shade;
  ctx.stroke();
  ctx.globalAlpha = a;
}

/** A closed fist: a rounded block with a knuckle line. */
function fist(ctx: CanvasRenderingContext2D, x: number, y: number, r: number, fill: string, lw: number, ink: string): void {
  ctx.save();
  ctx.translate(x, y);
  ctx.beginPath();
  ctx.roundRect(-r, -r * 0.85, r * 2, r * 1.7, r * 0.5);
  ctx.fillStyle = fill;
  ctx.fill();
  if (lw > 0) {
    ctx.lineWidth = lw;
    ctx.strokeStyle = ink;
    ctx.stroke();
    ctx.lineWidth = Math.max(1, lw * 0.6);
    ctx.beginPath();
    ctx.moveTo(-r * 0.45, -r * 0.2);
    ctx.lineTo(r * 0.55, -r * 0.2);
    ctx.stroke();
  }
  ctx.restore();
}

/** A boot with the toe forward (+x in body space) and a cuff above the ankle. */
function boot(ctx: CanvasRenderingContext2D, x: number, y: number, r: number, fill: string, cuff: string, lw: number, ink: string): void {
  ctx.beginPath();
  ctx.moveTo(x - r * 0.95, y - r * 0.95);
  ctx.lineTo(x + r * 0.5, y - r * 0.95);
  ctx.quadraticCurveTo(x + r * 2.0, y - r * 0.85, x + r * 2.0, y + r * 0.05);
  ctx.lineTo(x + r * 1.8, y + r * 0.35);
  ctx.lineTo(x - r * 1.05, y + r * 0.35);
  ctx.closePath();
  ctx.fillStyle = fill;
  ctx.fill();
  if (lw > 0) {
    ctx.lineWidth = lw;
    ctx.lineJoin = 'round';
    ctx.strokeStyle = ink;
    ctx.stroke();
  }
  ctx.fillStyle = cuff;
  ctx.fillRect(x - r * 0.95, y - r * 1.35, r * 1.5, r * 0.55);
}

function xt(x: number, len: number, a: number): number {
  return x + Math.sin(a) * len;
}

function yt(y: number, len: number, a: number): number {
  return y + Math.cos(a) * len;
}

function band(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, fill: string, lw: number, ink: string): void {
  poly(ctx, [
    [x - w / 2, y],
    [x + w / 2, y],
    [x + w / 2 * 0.88, y + h],
    [x - w / 2 * 0.88, y + h],
  ], fill, lw, ink);
}

/* --------------------------------------------------------------- poses --- */

export interface LimbAngles {
  shoulder: number;
  elbow: number;
}

export interface Pose {
  /** 0..1, how low the hips sit */
  crouch: number;
  /** torso lean, radians (positive = toward facing) */
  lean: number;
  twist: number;
  headTilt: number;
  backArm: LimbAngles;
  frontArm: LimbAngles;
  backLeg: LimbAngles;
  frontLeg: LimbAngles;
  /** body rotation for dives / KOs / rolls */
  roll: number;
  /** whole-body vertical offset (for hops) */
  hop: number;
  /** extra reach: stretches the torso upward for rising attacks */
  stretch: number;
}

const ZERO_POSE: Pose = {
  crouch: 0,
  lean: 0,
  twist: 0,
  headTilt: 0,
  backArm: { shoulder: -0.18, elbow: -0.85 },
  frontArm: { shoulder: 0.22, elbow: -0.95 },
  backLeg: { shoulder: -0.16, elbow: 0.14 },
  frontLeg: { shoulder: 0.14, elbow: 0.08 },
  roll: 0,
  hop: 0,
  stretch: 0,
};

function basePose(): Pose {
  return {
    ...ZERO_POSE,
    backArm: { ...ZERO_POSE.backArm },
    frontArm: { ...ZERO_POSE.frontArm },
    backLeg: { ...ZERO_POSE.backLeg },
    frontLeg: { ...ZERO_POSE.frontLeg },
  };
}

/** Pose for a named move frame. `p` is 0..1 through startup+active+recovery. */
export function poseFor(name: PoseName, p: number, tick: number): Pose {
  const q = basePose();
  const punch = Math.sin(Math.min(1, p * 1.5) * Math.PI);
  switch (name) {
    case 'idle': {
      const b = Math.sin(tick * 0.09) * 0.035;
      q.frontArm = { shoulder: 0.34, elbow: -1.05 };
      q.backArm = { shoulder: -0.22, elbow: -0.7 };
      q.frontLeg = { shoulder: 0.16, elbow: 0.05 + b };
      q.backLeg = { shoulder: -0.18, elbow: 0.12 + b };
      q.lean = 0.02;
      return q;
    }
    case 'guard':
      q.frontArm = { shoulder: 0.75, elbow: -1.7 };
      q.backArm = { shoulder: 0.2, elbow: -1.9 };
      q.crouch = 0.1;
      q.lean = 0.06;
      return q;
    case 'run': {
      const s = tick * 0.34;
      q.frontLeg = { shoulder: 0.62 * Math.sin(s), elbow: 0.5 + 0.4 * Math.sin(s) };
      q.backLeg = { shoulder: -0.62 * Math.sin(s), elbow: 0.5 - 0.4 * Math.sin(s) };
      q.frontArm = { shoulder: -0.9 * Math.sin(s) + 0.2, elbow: -1.1 };
      q.backArm = { shoulder: 0.9 * Math.sin(s) - 0.1, elbow: -1.0 };
      q.lean = 0.26;
      q.headTilt = -0.1;
      return q;
    }
    case 'jump':
      q.frontLeg = { shoulder: 0.55, elbow: 0.9 };
      q.backLeg = { shoulder: -0.35, elbow: 1.2 };
      q.frontArm = { shoulder: 1.6, elbow: -0.4 };
      q.backArm = { shoulder: -0.8, elbow: -0.3 };
      q.lean = 0.12;
      return q;
    case 'fall':
      q.frontLeg = { shoulder: 0.42, elbow: 0.5 };
      q.backLeg = { shoulder: -0.3, elbow: 0.8 };
      q.frontArm = { shoulder: 2.1, elbow: -0.2 };
      q.backArm = { shoulder: 1.7, elbow: -0.4 };
      q.lean = -0.08;
      return q;
    case 'crouch':
      q.crouch = 0.55;
      q.lean = 0.24;
      q.frontLeg = { shoulder: 0.9, elbow: 1.8 };
      q.backLeg = { shoulder: -0.5, elbow: 1.7 };
      q.frontArm = { shoulder: 0.6, elbow: -1.4 };
      q.backArm = { shoulder: 0.1, elbow: -1.2 };
      return q;
    case 'punch':
      q.frontArm = { shoulder: 1.47, elbow: -0.08 };
      q.backArm = { shoulder: -0.6, elbow: -1.7 };
      q.lean = 0.2;
      q.frontLeg = { shoulder: 0.34, elbow: 0.12 };
      q.backLeg = { shoulder: -0.42, elbow: 0.22 };
      q.twist = 0.12;
      return q;
    case 'cross':
      q.backArm = { shoulder: 1.5, elbow: -0.12 };
      q.frontArm = { shoulder: 0.35, elbow: -1.6 };
      q.lean = 0.28;
      q.twist = -0.22;
      q.frontLeg = { shoulder: 0.4, elbow: 0.15 };
      q.backLeg = { shoulder: -0.45, elbow: 0.3 };
      return q;
    case 'hook':
      q.frontArm = { shoulder: 1.1, elbow: -1.5 };
      q.backArm = { shoulder: 0.2, elbow: -1.6 };
      q.lean = 0.2;
      q.twist = -0.3;
      return q;
    case 'uppercut':
      q.frontArm = { shoulder: 2.75, elbow: 0.05 };
      q.backArm = { shoulder: -0.7, elbow: -1.3 };
      q.lean = -0.12;
      q.crouch = 0.18;
      q.stretch = 0.08;
      return q;
    case 'kick':
      q.frontLeg = { shoulder: 1.55, elbow: 0.05 };
      q.backLeg = { shoulder: -0.1, elbow: 0.12 };
      q.backArm = { shoulder: -1.1, elbow: -0.2 };
      q.frontArm = { shoulder: 0.5, elbow: -1.4 };
      q.lean = -0.24;
      return q;
    case 'lowKick':
      q.frontLeg = { shoulder: 0.95, elbow: 0.05 };
      q.backLeg = { shoulder: -0.18, elbow: 0.55 };
      q.crouch = 0.22;
      q.lean = 0.1;
      return q;
    case 'sweep':
      q.crouch = 0.5;
      q.frontLeg = { shoulder: 1.5, elbow: 0.05 };
      q.backLeg = { shoulder: -0.4, elbow: 1.9 };
      q.frontArm = { shoulder: 1.1, elbow: -0.2 };
      q.backArm = { shoulder: -0.6, elbow: -0.6 };
      q.lean = -0.1;
      return q;
    case 'slam': {
      const down = Math.min(1, p * 1.7);
      q.frontArm = { shoulder: 2.7 - down * 2.9, elbow: -0.1 };
      q.backArm = { shoulder: 2.5 - down * 2.8, elbow: -0.1 };
      q.crouch = down * 0.3;
      q.lean = down * 0.28;
      return q;
    }
    case 'dash':
      q.lean = 0.55;
      q.frontArm = { shoulder: -0.9, elbow: -0.35 };
      q.backArm = { shoulder: -1.2, elbow: -0.25 };
      q.frontLeg = { shoulder: 0.5, elbow: 0.6 };
      q.backLeg = { shoulder: -0.7, elbow: 0.7 };
      q.headTilt = -0.22;
      return q;
    case 'cast':
      q.frontArm = { shoulder: 1.35, elbow: 0.15 };
      q.backArm = { shoulder: 0.75, elbow: -0.25 };
      q.lean = -0.05;
      q.crouch = 0.08;
      return q;
    case 'shoot':
      q.frontArm = { shoulder: 1.55, elbow: 0.02 };
      q.backArm = { shoulder: 0.3, elbow: -1.4 };
      q.lean = 0.12;
      q.twist = 0.18;
      return q;
    case 'dive':
      q.roll = 0.75;
      q.frontArm = { shoulder: 2.3, elbow: -0.2 };
      q.backArm = { shoulder: 2.0, elbow: -0.3 };
      q.frontLeg = { shoulder: 0.2, elbow: 0.1 };
      q.backLeg = { shoulder: -0.3, elbow: 0.4 };
      return q;
    case 'rise':
      q.frontArm = { shoulder: 2.9, elbow: -0.1 };
      q.backArm = { shoulder: 2.6, elbow: -0.15 };
      q.frontLeg = { shoulder: 0.1, elbow: 0.5 };
      q.backLeg = { shoulder: -0.1, elbow: 0.7 };
      q.stretch = 0.16;
      q.lean = -0.05;
      return q;
    case 'spin':
      q.roll = p * TAU;
      q.frontArm = { shoulder: 1.6, elbow: -0.1 };
      q.backArm = { shoulder: 1.3, elbow: -0.1 };
      return q;
    case 'grab':
      q.frontArm = { shoulder: 1.5, elbow: 0.35 };
      q.backArm = { shoulder: 1.3, elbow: 0.3 };
      q.lean = 0.18;
      return q;
    case 'throw':
      q.frontArm = { shoulder: 2.0, elbow: 0.05 };
      q.backArm = { shoulder: 0.4, elbow: -1.2 };
      q.lean = 0.32;
      q.twist = -0.2;
      return q;
    case 'dodge':
      q.roll = 0.55;
      q.crouch = 0.45;
      q.frontArm = { shoulder: -0.3, elbow: -1.7 };
      q.backArm = { shoulder: -0.6, elbow: -1.5 };
      q.frontLeg = { shoulder: 0.9, elbow: 1.5 };
      q.backLeg = { shoulder: -0.4, elbow: 1.6 };
      return q;
    case 'parry':
      q.frontArm = { shoulder: 1.15, elbow: -1.9 };
      q.backArm = { shoulder: 1.0, elbow: -2.0 };
      q.crouch = 0.12;
      q.lean = -0.08;
      return q;
    case 'hit':
      q.lean = -0.4;
      q.headTilt = 0.3;
      q.frontArm = { shoulder: 1.4, elbow: -0.8 };
      q.backArm = { shoulder: 0.8, elbow: -0.5 };
      q.frontLeg = { shoulder: 0.55, elbow: 0.3 };
      q.backLeg = { shoulder: -0.15, elbow: 0.25 };
      return q;
    case 'hurt':
      q.lean = -0.55;
      q.headTilt = 0.45;
      q.frontArm = { shoulder: 1.1, elbow: -1.1 };
      q.backArm = { shoulder: 0.9, elbow: -0.9 };
      q.frontLeg = { shoulder: 0.7, elbow: 0.45 };
      q.backLeg = { shoulder: -0.05, elbow: 0.2 };
      return q;
    case 'ko':
      q.roll = -1.4;
      q.frontArm = { shoulder: 2.4, elbow: 0.3 };
      q.backArm = { shoulder: 2.2, elbow: 0.5 };
      q.frontLeg = { shoulder: 0.5, elbow: 0.1 };
      q.backLeg = { shoulder: -0.3, elbow: 0.4 };
      return q;
    case 'super':
      q.frontArm = { shoulder: 2.4, elbow: -0.15 };
      q.backArm = { shoulder: 2.1, elbow: -0.25 };
      q.frontLeg = { shoulder: 0.35, elbow: 0.1 };
      q.backLeg = { shoulder: -0.45, elbow: 0.15 };
      q.stretch = 0.1;
      q.lean = -0.1;
      return q;
    case 'taunt':
      q.frontArm = { shoulder: 2.6, elbow: 0.3 };
      q.backArm = { shoulder: 0.3, elbow: -0.4 };
      q.lean = -0.1;
      return q;
    case 'item':
      q.frontArm = { shoulder: 1.55, elbow: 0.1 };
      q.backArm = { shoulder: 0.1, elbow: -1.2 };
      q.lean = 0.1;
      return q;
    case 'pound':
      q.frontArm = { shoulder: 1.55, elbow: 0.4 };
      q.backArm = { shoulder: 1.35, elbow: 0.4 };
      q.crouch = 0.2;
      q.lean = 0.3;
      return q;
    // Finisher beats: the winner's frames are posed, not borrowed from moves.
    case 'lift':
      // Both arms locked overhead, legs braced wide, chest open.
      q.frontArm = { shoulder: 3.0, elbow: 0.05 };
      q.backArm = { shoulder: 2.95, elbow: -0.05 };
      q.frontLeg = { shoulder: 0.5, elbow: 0.2 };
      q.backLeg = { shoulder: -0.5, elbow: 0.2 };
      q.crouch = 0.14;
      q.lean = -0.12;
      q.stretch = 0.08;
      return q;
    case 'heave':
      // Dragging something heavy: low, leaning in, arms out front.
      q.frontArm = { shoulder: 1.5, elbow: 0.2 };
      q.backArm = { shoulder: 1.35, elbow: 0.3 };
      q.frontLeg = { shoulder: 0.7, elbow: 0.5 };
      q.backLeg = { shoulder: -0.6, elbow: 0.1 };
      q.crouch = 0.35;
      q.lean = 0.42;
      return q;
    case 'victory':
      // One fist to the sky, the other on the hip, chin up.
      q.frontArm = { shoulder: 2.95, elbow: 0.1 };
      q.backArm = { shoulder: 0.95, elbow: -2.2 };
      q.frontLeg = { shoulder: 0.28, elbow: 0.05 };
      q.backLeg = { shoulder: -0.3, elbow: 0.1 };
      q.lean = -0.08;
      q.headTilt = -0.18;
      q.stretch = 0.05;
      return q;
    case 'limp':
      // Dead weight: everything hangs, head lolls.
      q.frontArm = { shoulder: 0.15, elbow: 0.1 };
      q.backArm = { shoulder: -0.1, elbow: 0.05 };
      q.frontLeg = { shoulder: 0.1, elbow: 0.15 };
      q.backLeg = { shoulder: -0.05, elbow: 0.1 };
      q.headTilt = 0.9;
      q.lean = 0.1;
      return q;
    default:
      return q;
  }
}

/** Map a live fighter to a pose and a phase through the current action. */
export function fighterPose(f: Fighter, tick: number): { pose: Pose; name: PoseName } {
  if (f.state === 'hitstun') return { pose: poseFor('hurt', 0, tick), name: 'hurt' };
  if (f.state === 'ko') return { pose: poseFor('ko', 0, tick), name: 'ko' };
  if (f.state === 'dodge') {
    const p = Math.min(1, f.stateTicks / 16);
    return { pose: poseFor(f.grounded ? 'dodge' : 'dive', p, tick), name: 'dodge' };
  }
  if (f.state === 'parry') return { pose: poseFor('parry', 0, tick), name: 'parry' };
  if (f.state === 'grab') return { pose: poseFor('grab', 0, tick), name: 'grab' };
  if (f.state === 'grabbed') return { pose: poseFor('hurt', 0, tick), name: 'hurt' };
  if (f.state === 'super') {
    const md = charDef(f.char).moves.super;
    const p = Math.min(1, f.moveFrame / Math.max(1, md.startup + md.active + md.recovery));
    return { pose: poseFor('super', p, tick), name: 'super' };
  }
  if (f.state === 'attack' && f.move) {
    const md = charDef(f.char).moves[f.move];
    const total = md.startup + md.active + md.recovery;
    const p = Math.min(1, f.moveFrame / Math.max(1, total));
    return { pose: poseFor(md.pose, p, tick), name: md.pose };
  }
  if (f.state === 'jump') return { pose: poseFor('jump', 0, tick), name: 'jump' };
  if (f.state === 'fall') return { pose: poseFor('fall', 0, tick), name: 'fall' };
  if (f.state === 'land') return { pose: poseFor('crouch', 0, tick), name: 'crouch' };
  if (f.state === 'run') return { pose: poseFor('run', 0, tick), name: 'run' };
  if (f.state === 'respawn') return { pose: poseFor('fall', 0, tick), name: 'fall' };
  if (f.state === 'victory') return { pose: poseFor('taunt', 0, tick), name: 'taunt' };
  if (f.finalStand) return { pose: poseFor('guard', 0, tick), name: 'guard' };
  return { pose: poseFor('idle', 0, tick), name: 'idle' };
}

/* ---------------------------------------------------------------- body ---- */

interface Joint {
  x: number;
  y: number;
}

function legJoints(hip: Joint, a: LimbAngles, thigh: number, shin: number): { knee: Joint; ankle: Joint } {
  const knee = { x: hip.x + Math.sin(a.shoulder) * thigh, y: hip.y + Math.cos(a.shoulder) * thigh };
  const ankle = {
    x: knee.x + Math.sin(a.shoulder + a.elbow) * shin,
    y: knee.y + Math.cos(a.shoulder + a.elbow) * shin,
  };
  return { knee, ankle };
}

function armJoints(shoulder: Joint, a: LimbAngles, upper: number, fore: number): { elbow: Joint; hand: Joint } {
  const elbow = { x: shoulder.x + Math.sin(a.shoulder) * upper, y: shoulder.y + Math.cos(a.shoulder) * upper };
  const hand = {
    x: elbow.x + Math.sin(a.shoulder + a.elbow) * fore,
    y: elbow.y + Math.cos(a.shoulder + a.elbow) * fore,
  };
  return { elbow, hand };
}

function patternOverlay(
  ctx: CanvasRenderingContext2D,
  art: CharArt,
  path: () => void,
  w: number,
  h: number,
  opts: ArtOpts,
): void {
  if (!opts.pattern || art.pattern === 'none' || art.pattern === 'noir') return;
  ctx.save();
  path();
  ctx.clip();
  ctx.globalAlpha = 0.5;
  if (art.pattern === 'pixel') {
    const s = Math.max(5, w / 9);
    for (let y = -h; y < h; y += s) {
      for (let x = -w; x < w; x += s) {
        if ((Math.round(x / s) + Math.round(y / s)) % 3 === 0) {
          ctx.fillStyle = art.secondaryShade;
          ctx.fillRect(x, y, s * 0.62, s * 0.62);
        }
      }
    }
  } else if (art.pattern === 'halftone' || art.pattern === 'toon') {
    const s = Math.max(5, w / 12);
    ctx.fillStyle = art.ink;
    for (let y = -h; y < h; y += s) {
      for (let x = -w; x < w; x += s) {
        const r = (Math.sin(x * 0.5 + y) + 1) * s * 0.09;
        ctx.beginPath();
        ctx.arc(x + (Math.round(y / s) % 2) * s * 0.5, y, r, 0, TAU);
        ctx.fill();
      }
    }
  } else if (art.pattern === 'sepia') {
    ctx.globalAlpha = 0.2;
    ctx.fillStyle = '#7a5a33';
    ctx.fillRect(-w * 2, -h * 2, w * 4, h * 4);
    ctx.globalAlpha = 0.32;
    ctx.strokeStyle = art.secondaryShade;
    ctx.lineWidth = 2;
    for (let i = 0; i < 7; i++) {
      ctx.beginPath();
      ctx.moveTo(-w, -h + i * h * 0.3);
      ctx.bezierCurveTo(-w * 0.3, -h + i * h * 0.3 + 12, w * 0.4, -h + i * h * 0.3 - 10, w, -h + i * h * 0.3 + 4);
      ctx.stroke();
    }
  } else if (art.pattern === 'military') {
    ctx.globalAlpha = 0.4;
    ctx.fillStyle = art.secondaryShade;
    for (let i = 0; i < 5; i++) {
      const x = -w + ((i * 37) % (w * 2));
      const y = -h + ((i * 53) % (h * 2));
      ctx.fillRect(x, y, w * 0.24, h * 0.09);
    }
  } else if (art.pattern === 'organic') {
    ctx.globalAlpha = 0.4;
    ctx.strokeStyle = art.secondaryShade;
    ctx.lineWidth = 2.5;
    for (let i = 0; i < 5; i++) {
      ctx.beginPath();
      ctx.ellipse(0, -h * 0.15 + i * h * 0.14, w * 0.85, h * 0.07, 0, 0, Math.PI);
      ctx.stroke();
    }
  } else if (art.pattern === 'glitch') {
    ctx.globalAlpha = 0.55;
    ctx.fillStyle = art.accent;
    for (let i = 0; i < 6; i++) {
      ctx.fillRect(-w + ((i * 41) % (w * 2)), -h + ((i * 67) % (h * 2)), w * 0.35, 2.5);
    }
  }
  ctx.restore();
}

function drawHair(ctx: CanvasRenderingContext2D, art: CharArt, cx: number, cy: number, r: number, ink: number): void {
  ctx.fillStyle = art.hair;
  ctx.strokeStyle = art.ink;
  ctx.lineWidth = ink;
  ctx.lineJoin = 'round';
  const style = art.hair as string;
  if (style === 'short') {
    ctx.beginPath();
    ctx.arc(cx, cy - r * 0.08, r * 1.02, Math.PI * 1.02, Math.PI * 2.02);
    ctx.lineTo(cx + r * 0.5, cy - r * 0.55);
    ctx.lineTo(cx - r * 0.5, cy - r * 0.55);
    ctx.closePath();
    ctx.fill();
    if (ink > 0) ctx.stroke();
  } else if (style === 'flow') {
    ctx.beginPath();
    ctx.moveTo(cx - r * 0.95, cy - r * 0.3);
    ctx.bezierCurveTo(cx - r * 1.5, cy - r * 1.9, cx + r * 0.9, cy - r * 1.9, cx + r * 0.8, cy - r * 0.5);
    ctx.bezierCurveTo(cx + r * 0.2, cy - r * 0.8, cx - r * 0.2, cy - r * 0.7, cx - r * 0.4, cy - r * 0.2);
    ctx.closePath();
    ctx.fill();
    if (ink > 0) ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(cx - r * 0.6, cy - r * 1.2);
    ctx.quadraticCurveTo(cx - r * 2.3, cy - r * 0.2, cx - r * 1.6, cy + r * 1.1);
    ctx.quadraticCurveTo(cx - r * 1.5, cy - r * 0.2, cx - r * 0.2, cy - r * 0.75);
    ctx.fillStyle = art.hair;
    ctx.fill();
    if (ink > 0) ctx.stroke();
  } else if (style === 'block') {
    ctx.fillRect(cx - r, cy - r * 1.35, r * 2, r * 1.35);
    if (ink > 0) ctx.strokeRect(cx - r, cy - r * 1.35, r * 2, r * 1.35);
    ctx.fillStyle = art.secondary;
    ctx.fillRect(cx - r * 0.95, cy - r * 1.5, r * 1.9, r * 0.38);
  } else if (style === 'hood') {
    ctx.beginPath();
    ctx.moveTo(cx - r * 1.25, cy + r * 0.7);
    ctx.quadraticCurveTo(cx - r * 1.5, cy - r * 1.7, cx, cy - r * 1.55);
    ctx.quadraticCurveTo(cx + r * 1.5, cy - r * 1.7, cx + r * 1.25, cy + r * 0.7);
    ctx.closePath();
    ctx.fillStyle = art.secondaryShade;
    ctx.fill();
    if (ink > 0) ctx.stroke();
    ctx.fillStyle = art.ink;
    ctx.beginPath();
    ctx.ellipse(cx, cy + r * 0.08, r * 0.83, r * 0.9, 0, 0, TAU);
    ctx.fill();
    ctx.strokeStyle = art.accent;
    ctx.lineWidth = r * 0.14;
    ctx.beginPath();
    ctx.moveTo(cx - r * 0.75, cy - r * 0.2);
    ctx.lineTo(cx + r * 0.75, cy - r * 0.2);
    ctx.stroke();
  } else if (style === 'toon') {
    ctx.beginPath();
    ctx.arc(cx, cy - r * 0.2, r * 1.12, Math.PI, TAU);
    ctx.fill();
    if (ink > 0) ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(cx - r * 0.95, cy - r * 0.8);
    ctx.quadraticCurveTo(cx - r * 0.6, cy - r * 2.1, cx + r * 0.3, cy - r * 1.7);
    ctx.quadraticCurveTo(cx - r * 0.2, cy - r * 1.25, cx + r * 0.1, cy - r * 0.8);
    ctx.fillStyle = art.hair;
    ctx.fill();
    if (ink > 0) ctx.stroke();
  } else if (style === 'beret') {
    ctx.beginPath();
    ctx.ellipse(cx - r * 0.08, cy - r * 0.95, r * 1.15, r * 0.55, -0.18, 0, TAU);
    ctx.fillStyle = art.secondaryShade;
    ctx.fill();
    if (ink > 0) ctx.stroke();
    ctx.fillStyle = art.accent;
    circle(ctx, cx + r * 0.16, cy - r * 1.48, r * 0.12, art.accent, ink * 0.5, art.ink);
  } else if (style === 'crown') {
    ctx.beginPath();
    ctx.moveTo(cx - r * 1.05, cy - r * 0.75);
    for (let i = 0; i < 5; i++) {
      ctx.lineTo(cx - r * 1.0 + i * r * 0.5, cy - r * (1.5 + (i % 2) * 0.55));
      ctx.lineTo(cx - r * 0.8 + i * r * 0.5, cy - r * 0.72);
    }
    ctx.lineTo(cx + r * 0.9, cy - r * 0.35);
    ctx.lineTo(cx - r * 0.9, cy - r * 0.35);
    ctx.closePath();
    ctx.fillStyle = art.secondary;
    ctx.fill();
    if (ink > 0) ctx.stroke();
    ctx.fillStyle = art.accent;
    circle(ctx, cx - r * 0.52, cy - r * 0.55, r * 0.13, art.accent, ink * 0.4, art.ink);
    circle(ctx, cx + r * 0.52, cy - r * 0.55, r * 0.13, art.accent, ink * 0.4, art.ink);
  } else if (style === 'glitch') {
    ctx.fillStyle = art.primaryShade;
    ctx.fillRect(cx - r * 0.9, cy - r * 1.2, r * 1.8, r * 0.85);
    ctx.fillStyle = art.secondary;
    ctx.fillRect(cx - r * 0.7, cy - r * 1.42, r * 1.1, r * 0.24);
    ctx.fillStyle = art.accent;
    ctx.fillRect(cx + r * 0.2, cy - r * 1.1, r * 0.8, r * 0.12);
  }
}

function drawFace(ctx: CanvasRenderingContext2D, art: CharArt, cx: number, cy: number, r: number, ink: number): void {
  const eyeY = cy + r * 0.02;
  const eyeX = r * 0.36;
  const eyeR = r * 0.16;
  if (art.face === 'visor' || art.face === 'helmet') {
    const plate = art.face === 'visor' ? art.secondaryShade : art.primaryShade;
    ctx.beginPath();
    ctx.roundRect(cx - r * 0.82, cy - r * 0.45, r * 1.64, r * 0.85, r * 0.25);
    ctx.fillStyle = plate;
    ctx.fill();
    if (ink > 0) {
      ctx.lineWidth = ink;
      ctx.strokeStyle = art.ink;
      ctx.stroke();
    }
    ctx.fillStyle = art.glow ?? art.accent;
    if (art.face === 'visor') {
      ctx.fillRect(cx - r * 0.6, eyeY - r * 0.12, r * 1.2, r * 0.22);
    } else {
      ctx.fillRect(cx - r * 0.52, eyeY - r * 0.1, r * 0.42, r * 0.18);
      ctx.fillRect(cx + r * 0.1, eyeY - r * 0.1, r * 0.42, r * 0.18);
    }
    ctx.fillStyle = art.ink;
    ctx.fillRect(cx - r * 0.3, cy + r * 0.5, r * 0.6, r * 0.08);
    return;
  }
  if (art.face === 'mask') {
    ctx.fillStyle = art.ink;
    ctx.beginPath();
    ctx.ellipse(cx, cy + r * 0.02, r * 0.82, r * 0.9, 0, 0, TAU);
    ctx.fill();
    ctx.fillStyle = art.glow ?? art.secondary;
    ellipse(ctx, cx - eyeX, eyeY, eyeR * 0.8, eyeR * 0.55, art.glow ?? art.secondary);
    ellipse(ctx, cx + eyeX, eyeY, eyeR * 0.8, eyeR * 0.55, art.glow ?? art.secondary);
    ctx.fillStyle = art.accent;
    ctx.fillRect(cx - r * 0.28, cy + r * 0.46, r * 0.56, r * 0.09);
    return;
  }
  if (art.face === 'skull') {
    ctx.fillStyle = art.skin;
    ctx.beginPath();
    ctx.ellipse(cx, cy, r * 0.92, r * 1.05, 0, 0, TAU);
    ctx.fill();
    if (ink > 0) {
      ctx.lineWidth = ink;
      ctx.strokeStyle = art.ink;
      ctx.stroke();
    }
    ctx.fillStyle = art.ink;
    ellipse(ctx, cx - eyeX, eyeY, eyeR * 1.35, eyeR * 1.15, art.ink);
    ellipse(ctx, cx + eyeX, eyeY, eyeR * 1.35, eyeR * 1.15, art.ink);
    ctx.fillStyle = art.glow ?? art.accent;
    circle(ctx, cx - eyeX, eyeY, eyeR * 0.45, art.glow ?? art.accent);
    circle(ctx, cx + eyeX, eyeY, eyeR * 0.45, art.glow ?? art.accent);
    ctx.fillStyle = art.ink;
    ctx.fillRect(cx - r * 0.12, cy + r * 0.42, r * 0.24, r * 0.42);
    for (let i = 0; i < 4; i++) ctx.fillRect(cx - r * 0.5 + i * r * 0.3, cy + r * 0.62, r * 0.06, r * 0.2);
    return;
  }
  // Eyes: hard ink strokes, one catchlight.
  ctx.fillStyle = art.ink;
  if (art.face === 'toon') {
    ellipse(ctx, cx - eyeX, eyeY, eyeR * 1.25, eyeR * 1.7, '#f7f1df');
    ellipse(ctx, cx + eyeX, eyeY, eyeR * 1.25, eyeR * 1.7, '#f7f1df');
    circle(ctx, cx - eyeX + eyeR * 0.25, eyeY, eyeR * 0.6, art.ink);
    circle(ctx, cx + eyeX + eyeR * 0.25, eyeY, eyeR * 0.6, art.ink);
  } else {
    ctx.fillRect(cx - eyeX - eyeR * 0.7, eyeY - eyeR * 0.18, eyeR * 1.4, eyeR * 0.34);
    ctx.fillRect(cx + eyeX - eyeR * 0.7, eyeY - eyeR * 0.18, eyeR * 1.4, eyeR * 0.34);
  }
  // Brow shadow, nose tick, mouth.
  ctx.strokeStyle = art.ink;
  ctx.lineWidth = Math.max(1, r * 0.09);
  ctx.beginPath();
  ctx.moveTo(cx - eyeX - eyeR * 0.8, eyeY - eyeR * 0.7);
  ctx.lineTo(cx - eyeX + eyeR * 0.55, eyeY - eyeR * 0.5);
  ctx.moveTo(cx + eyeX - eyeR * 0.55, eyeY - eyeR * 0.5);
  ctx.lineTo(cx + eyeX + eyeR * 0.8, eyeY - eyeR * 0.7);
  ctx.stroke();
  ctx.beginPath();
  ctx.moveTo(cx + r * 0.04, eyeY + r * 0.12);
  ctx.lineTo(cx + r * 0.14, eyeY + r * 0.38);
  ctx.lineTo(cx - r * 0.02, eyeY + r * 0.4);
  ctx.stroke();
  ctx.beginPath();
  if (art.face === 'square') {
    ctx.moveTo(cx - r * 0.34, cy + r * 0.55);
    ctx.lineTo(cx + r * 0.4, cy + r * 0.52);
  } else {
    ctx.arc(cx, cy + r * 0.36, r * 0.34, 0.15, Math.PI - 0.15);
  }
  ctx.stroke();
  if (art.face === 'square' || art.face === 'long') {
    ctx.fillStyle = art.ink;
    ctx.fillRect(cx + r * 0.52, cy + r * 0.34, r * 0.16, r * 0.24);
  }
}

function drawHead(
  ctx: CanvasRenderingContext2D,
  art: CharArt,
  cx: number,
  cy: number,
  r: number,
  ink: number,
): void {
  const face = art.face;
  // Neck
  limb(ctx, cx - r * 0.25, cy + r * 0.8, cx, cy + r * 1.4, r * 0.3, art.skinShade, ink * 0.8, art.ink);
  // Skull / jaw shape.
  ctx.beginPath();
  if (face === 'square') {
    ctx.roundRect(cx - r * 0.92, cy - r * 0.95, r * 1.84, r * 1.8, r * 0.32);
  } else if (face === 'long') {
    ctx.ellipse(cx, cy - r * 0.05, r * 0.82, r * 1.18, 0, 0, TAU);
  } else if (face === 'round' || face === 'toon') {
    ctx.arc(cx, cy, r * (face === 'toon' ? 1.08 : 0.98), 0, TAU);
  } else if (face === 'helmet') {
    ctx.roundRect(cx - r * 1.02, cy - r * 1.02, r * 2.04, r * 2.04, r * 0.4);
  } else if (face === 'skull') {
    ctx.ellipse(cx, cy, r * 0.92, r * 1.05, 0, 0, TAU);
  } else if (face === 'visor') {
    ctx.roundRect(cx - r * 0.95, cy - r * 0.95, r * 1.9, r * 1.9, r * 0.55);
  } else {
    ctx.arc(cx, cy, r * 1.0, 0, TAU);
  }
  ctx.fillStyle = art.skin;
  ctx.fill();
  if (ink > 0) {
    ctx.lineWidth = ink;
    ctx.strokeStyle = art.ink;
    ctx.stroke();
  }
  // One hard shadow on the face, always camera-left.
  ctx.save();
  ctx.beginPath();
  ctx.rect(cx - r * 1.3, cy - r * 1.3, r * 0.8, r * 2.6);
  ctx.clip();
  ctx.globalAlpha = 0.22;
  ctx.fillStyle = art.skinShade;
  ctx.beginPath();
  ctx.ellipse(cx, cy, r, r * 1.02, 0, 0, TAU);
  ctx.fill();
  ctx.restore();
  drawHair(ctx, art, cx, cy, r, ink);
  drawFace(ctx, art, cx, cy, r, ink);
}

function drawCape(ctx: CanvasRenderingContext2D, art: CharArt, sx: number, sy: number, h: number, tick: number, ink: number): void {
  const sway = Math.sin(tick * 0.11) * 0.18;
  ctx.beginPath();
  ctx.moveTo(sx - h * 0.1, sy);
  ctx.quadraticCurveTo(sx - h * 0.36 + sway * 40, sy + h * 0.2, sx - h * 0.3 + sway * 55, sy + h * 0.58);
  ctx.quadraticCurveTo(sx - h * 0.12, sy + h * 0.52, sx - h * 0.02, sy + h * 0.42);
  ctx.quadraticCurveTo(sx + h * 0.04, sy + h * 0.24, sx + h * 0.08, sy);
  ctx.closePath();
  ctx.fillStyle = art.accent;
  ctx.fill();
  if (ink > 0) {
    ctx.lineWidth = ink;
    ctx.strokeStyle = art.ink;
    ctx.stroke();
  }
  ctx.globalAlpha = 0.25;
  ctx.fillStyle = art.ink;
  ctx.beginPath();
  ctx.moveTo(sx - h * 0.12, sy);
  ctx.quadraticCurveTo(sx - h * 0.28, sy + h * 0.3, sx - h * 0.2, sy + h * 0.5);
  ctx.lineTo(sx - h * 0.06, sy + h * 0.42);
  ctx.closePath();
  ctx.fill();
  ctx.globalAlpha = 1;
}

function drawWings(ctx: CanvasRenderingContext2D, art: CharArt, sx: number, sy: number, h: number, tick: number, ink: number): void {
  const flap = Math.sin(tick * 0.3) * 0.22;
  for (const dir of [-1, 1]) {
    ctx.beginPath();
    ctx.moveTo(sx + dir * h * 0.05, sy);
    ctx.quadraticCurveTo(sx + dir * h * 0.4, sy - h * 0.18 - flap * 30, sx + dir * h * 0.48, sy + h * 0.06);
    ctx.quadraticCurveTo(sx + dir * h * 0.3, sy + h * 0.02, sx + dir * h * 0.4, sy + h * 0.24);
    ctx.quadraticCurveTo(sx + dir * h * 0.2, sy + h * 0.16, sx + dir * h * 0.18, sy + h * 0.3);
    ctx.quadraticCurveTo(sx + dir * h * 0.1, sy + h * 0.12, sx + dir * h * 0.04, sy + h * 0.08);
    ctx.closePath();
    ctx.fillStyle = art.secondaryShade;
    ctx.globalAlpha = 0.82;
    ctx.fill();
    ctx.globalAlpha = 1;
    if (ink > 0) {
      ctx.lineWidth = ink * 0.7;
      ctx.strokeStyle = art.ink;
      ctx.stroke();
    }
    ctx.strokeStyle = art.secondary;
    ctx.lineWidth = 1.4;
    for (let i = 1; i < 4; i++) {
      ctx.beginPath();
      ctx.moveTo(sx + dir * h * 0.08, sy + h * 0.04);
      ctx.lineTo(sx + dir * (h * 0.12 + i * h * 0.09), sy + h * (0.02 + i * 0.045));
      ctx.stroke();
    }
  }
}

function drawTail(ctx: CanvasRenderingContext2D, art: CharArt, hx: number, hy: number, h: number, tick: number, ink: number): void {
  const sway = Math.sin(tick * 0.08) * 0.16;
  ctx.beginPath();
  ctx.moveTo(hx - h * 0.06, hy);
  ctx.bezierCurveTo(hx - h * 0.3, hy + h * 0.05, hx - h * 0.34 + sway * 40, hy + h * 0.3, hx - h * 0.18 + sway * 50, hy + h * 0.42);
  ctx.lineWidth = Math.max(4, h * 0.055);
  ctx.strokeStyle = art.ink;
  ctx.stroke();
  ctx.lineWidth = Math.max(2.5, h * 0.04);
  ctx.strokeStyle = art.primaryShade;
  ctx.stroke();
  // Stinger
  poly(ctx, [
    [hx - h * 0.18 + sway * 50, hy + h * 0.42],
    [hx - h * 0.3 + sway * 54, hy + h * 0.5],
    [hx - h * 0.15 + sway * 48, hy + h * 0.5],
  ], art.accent, ink * 0.6, art.ink);
}

/* ------------------------------------------------------------ character --- */

export interface CharacterOpts extends ArtOpts {
  tick: number;
  phase: number;
  flash?: number;
  alpha?: number;
  held?: string | null;
}

export function drawCharacter(
  ctx: CanvasRenderingContext2D,
  def: CharDef,
  x: number,
  y: number,
  facing: 1 | -1,
  poseName: PoseName,
  opts: CharacterOpts,
): void {
  const art = def.art;
  const tick = opts.tick;
  const pose = poseFor(poseName, opts.phase, tick);
  // Comic proportions: about six heads tall, shoulders two and a half heads
  // wide, limbs thick enough to hold a flat colour and one shade tone.
  const H = 144 * art.scale;
  const bulk = art.bulk;
  const ink = inkWidth(opts, 1.15);
  const hipH = H * 0.43;
  const thigh = H * 0.235;
  const shin = H * 0.2;
  const torsoH = H * 0.31 * (1 + pose.stretch);
  const shoulderW = H * 0.27 * bulk;
  const hipW = H * 0.16 * bulk;
  const upperArm = H * 0.165;
  const foreArm = H * 0.15;
  const headR = H * 0.098 * art.head;
  const limbR = H * 0.056 * bulk;
  const armR = H * 0.047 * bulk;
  const lean = pose.lean;
  const bodyRot = pose.roll;

  // Hard ground shadow, drawn outside the mirror.
  if (opts.shadow > 0) {
    ctx.save();
    ctx.globalAlpha = opts.shadow;
    ctx.fillStyle = '#12100f';
    ctx.beginPath();
    ctx.ellipse(x + 9, y + 2, H * 0.22, H * 0.038, -0.06, 0, TAU);
    ctx.fill();
    ctx.globalAlpha = 1;
    ctx.restore();
  }

  ctx.save();
  ctx.globalAlpha = opts.alpha ?? 1;
  // Hit flash: the whole figure goes to paper for a few ticks. A filter keeps it
  // on the figure alone; a composite fill would bleach the backdrop behind it.
  if ((opts.flash ?? 0) > 0) {
    const k = Math.min(1, (opts.flash ?? 0) / 8);
    ctx.filter = `brightness(${(1 + k * 1.4).toFixed(2)}) saturate(${(1 - k * 0.8).toFixed(2)})`;
  }
  ctx.translate(x, y);
  ctx.scale(facing, 1);
  if (bodyRot) {
    ctx.translate(0, -H * 0.4);
    ctx.rotate(bodyRot);
    ctx.translate(0, H * 0.4);
  }

  // Base hip. Crouch lowers it and bends legs; the feet then set the floor.
  const hipY = -hipH * (1 - 0.42 * pose.crouch) + pose.hop;
  const hip: Joint = { x: 0, y: hipY };
  const backLeg = legJoints({ x: -hipW * 0.32, y: hipY }, pose.backLeg, thigh, shin);
  const frontLeg = legJoints({ x: hipW * 0.32, y: hipY }, pose.frontLeg, thigh, shin);
  const grounded = poseName !== 'ko' && poseName !== 'dive' && poseName !== 'dodge' && poseName !== 'spin';
  let lift = 0;
  if (grounded) {
    const lowest = Math.max(backLeg.ankle.y, frontLeg.ankle.y);
    lift = -lowest;
  } else {
    lift = hipH * 0.05;
  }
  const oy = lift; // add to every point
  const hipP = { x: hip.x, y: hipY + oy };

  // Torso orientation comes from lean; shoulders sit at the top of it.
  const shoulderCX = Math.sin(lean) * torsoH * 0.55;
  const shoulderCY = hipP.y - Math.cos(lean) * torsoH;
  const axisX = shoulderCX - hipP.x;
  const axisY = shoulderCY - hipP.y;
  const axisLen = Math.hypot(axisX, axisY) || 1;
  const perpX = -axisY / axisLen;
  const perpY = axisX / axisLen;
  const twist = pose.twist;
  const backShoulder = {
    x: shoulderCX - perpX * shoulderW * (0.5 + twist * 0.2),
    y: shoulderCY - perpY * shoulderW * (0.5 + twist * 0.2),
  };
  const frontShoulder = {
    x: shoulderCX + perpX * shoulderW * (0.5 - twist * 0.2),
    y: shoulderCY + perpY * shoulderW * (0.5 - twist * 0.2),
  };
  const backArm = armJoints(backShoulder, {
    shoulder: pose.backArm.shoulder + lean * 0.5,
    elbow: pose.backArm.elbow,
  }, upperArm, foreArm);
  const frontArm = armJoints(frontShoulder, {
    shoulder: pose.frontArm.shoulder + lean * 0.5,
    elbow: pose.frontArm.elbow,
  }, upperArm, foreArm);

  // Hair / head position.
  const neck = { x: shoulderCX + Math.sin(lean + pose.headTilt) * headR * 0.25, y: shoulderCY - Math.cos(lean + pose.headTilt) * headR * 0.95 };
  const head = {
    x: neck.x + Math.sin(lean + pose.headTilt) * headR * 1.05,
    y: neck.y - Math.cos(lean + pose.headTilt) * headR * 1.05,
  };

  // Behind the body.
  if (art.cape) drawCape(ctx, art, backShoulder.x, backShoulder.y, H, tick, ink);
  if (art.wings) drawWings(ctx, art, backShoulder.x, backShoulder.y, H, tick, ink);
  if (art.tail) drawTail(ctx, art, hipP.x, hipP.y, H, tick, ink);

  // Back leg.
  const trouser = art.primaryShade;
  limb(ctx, -hipW * 0.32, hipY + oy, backLeg.knee.x, backLeg.knee.y, limbR * 0.95, trouser, ink, art.ink);
  limb(ctx, backLeg.knee.x, backLeg.knee.y, backLeg.ankle.x, backLeg.ankle.y, limbR * 0.84, trouser, ink, art.ink);
  boot(ctx, backLeg.ankle.x, backLeg.ankle.y, limbR * 0.95, art.secondaryShade, art.primaryShade, ink * 0.9, art.ink);

  // Back arm: the whole limb sits in the shade tone.
  limb(ctx, backShoulder.x, backShoulder.y, backArm.elbow.x, backArm.elbow.y, armR * 0.95, art.skinShade, ink, art.ink);
  limb(ctx, backArm.elbow.x, backArm.elbow.y, backArm.hand.x, backArm.hand.y, armR * 0.84, art.skinShade, ink, art.ink);
  fist(ctx, backArm.hand.x, backArm.hand.y, armR * 1.2, art.secondaryShade, ink * 0.9, art.ink);

  // Torso: waist to shoulders, one flat colour, one hard shade.
  ctx.beginPath();
  ctx.moveTo(hipP.x - hipW * 0.5, hipP.y);
  ctx.lineTo(hipP.x + hipW * 0.5, hipP.y);
  ctx.lineTo(frontShoulder.x + perpX * shoulderW * 0.06, frontShoulder.y + perpY * shoulderW * 0.06);
  ctx.quadraticCurveTo(shoulderCX, shoulderCY - torsoH * 0.06, backShoulder.x, backShoulder.y);
  ctx.closePath();
  ctx.fillStyle = art.primary;
  ctx.fill();
  if (ink > 0) {
    ctx.lineWidth = ink;
    ctx.strokeStyle = art.ink;
    ctx.stroke();
  }
  // Hard shade along the back edge.
  ctx.save();
  ctx.beginPath();
  ctx.moveTo(hipP.x - hipW * 0.5, hipP.y);
  ctx.lineTo(hipP.x - hipW * 0.08, hipP.y);
  ctx.lineTo(backShoulder.x + perpX * shoulderW * 0.62, backShoulder.y + perpY * shoulderW * 0.62);
  ctx.lineTo(backShoulder.x - perpX * shoulderW * 0.2, backShoulder.y);
  ctx.closePath();
  ctx.globalAlpha = 0.42;
  ctx.fillStyle = art.primaryShade;
  ctx.fill();
  ctx.restore();
  patternOverlay(ctx, art, () => {
    ctx.beginPath();
    ctx.moveTo(hipP.x - hipW * 0.5, hipP.y);
    ctx.lineTo(hipP.x + hipW * 0.5, hipP.y);
    ctx.lineTo(frontShoulder.x, frontShoulder.y);
    ctx.lineTo(backShoulder.x, backShoulder.y);
    ctx.closePath();
  }, hipW, torsoH, opts);
  // Belt / waistband and chest emblem.
  band(ctx, hipP.x, hipP.y - H * 0.02, hipW * 1.02, H * 0.035, art.secondary, ink * 0.8, art.ink);
  circle(ctx, shoulderCX + perpX * shoulderW * 0.12, shoulderCY + torsoH * 0.34, H * 0.03, art.accent, ink * 0.7, art.ink);
  if (art.halo) {
    ctx.globalAlpha = 0.85;
    ctx.lineWidth = Math.max(2, H * 0.022);
    ctx.strokeStyle = art.secondary;
    ctx.beginPath();
    ctx.ellipse(head.x, head.y - headR * 1.7, headR * 0.95, headR * 0.28, 0.08, 0, TAU);
    ctx.stroke();
    ctx.globalAlpha = 1;
  }

  // Shoulder caps: the mass that makes the silhouette read as a hero.
  circle(ctx, backShoulder.x, backShoulder.y, armR * 1.25, art.primaryShade, ink, art.ink);
  circle(ctx, frontShoulder.x, frontShoulder.y, armR * 1.3, art.primary, ink, art.ink);
  ctx.save();
  ctx.globalAlpha = (opts.alpha ?? 1) * 0.5;
  ctx.fillStyle = art.primaryShade;
  ctx.beginPath();
  ctx.arc(frontShoulder.x, frontShoulder.y, armR * 1.3, Math.PI * 0.55, Math.PI * 1.45);
  ctx.fill();
  ctx.restore();

  // Front leg: flat colour with one hard shade along its back edge.
  limbShaded(ctx, hipW * 0.32, hipY + oy, frontLeg.knee.x, frontLeg.knee.y, limbR, art.primary, art.primaryShade, ink, art.ink);
  limbShaded(ctx, frontLeg.knee.x, frontLeg.knee.y, frontLeg.ankle.x, frontLeg.ankle.y, limbR * 0.88, art.primary, art.primaryShade, ink, art.ink);
  boot(ctx, frontLeg.ankle.x, frontLeg.ankle.y, limbR, art.secondary, art.primaryShade, ink, art.ink);

  // Front arm.
  limbShaded(ctx, frontShoulder.x, frontShoulder.y, frontArm.elbow.x, frontArm.elbow.y, armR, art.skin, art.skinShade, ink, art.ink);
  limbShaded(ctx, frontArm.elbow.x, frontArm.elbow.y, frontArm.hand.x, frontArm.hand.y, armR * 0.86, art.skin, art.skinShade, ink, art.ink);
  fist(ctx, frontArm.hand.x, frontArm.hand.y, armR * 1.3, art.secondary, ink, art.ink);
  if (art.extraArms) {
    // Two smaller chitin arms folded beneath the ribs.
    for (const side of [-1, 1]) {
      const sx = shoulderCX + side * shoulderW * 0.36;
      const sy = shoulderCY + torsoH * 0.42;
      const a1 = 0.9 + side * 0.25 + Math.sin(tick * 0.06 + side) * 0.1;
      const ex = sx + Math.sin(a1) * upperArm * 0.62;
      const ey = sy + Math.cos(a1) * upperArm * 0.62;
      const a2 = a1 + 1.5;
      const hx = ex + Math.sin(a2) * foreArm * 0.6;
      const hy = ey + Math.cos(a2) * foreArm * 0.6;
      limb(ctx, sx, sy, ex, ey, armR * 0.62, art.primaryShade, ink * 0.7, art.ink);
      limb(ctx, ex, ey, hx, hy, armR * 0.5, art.primaryShade, ink * 0.7, art.ink);
      circle(ctx, hx, hy, armR * 0.58, art.accent, ink * 0.6, art.ink);
    }
  }

  // Head last, so the jaw sits over the chest.
  drawHead(ctx, art, head.x, head.y, headR, ink);

  // Held item.
  if (opts.held) {
    ctx.save();
    ctx.translate(frontArm.hand.x, frontArm.hand.y);
    ctx.rotate(-0.25);
    ctx.fillStyle = art.ink;
    ctx.fillRect(-7, -22, 14, 30);
    ctx.fillStyle = art.secondary;
    ctx.fillRect(-4, -18, 8, 22);
    ctx.restore();
  }

  ctx.globalAlpha = 1;
  ctx.restore();
}

export interface FighterArtOpts extends ArtOpts {
  tick: number;
  held?: string | null;
}

export function drawFighter(
  ctx: CanvasRenderingContext2D,
  f: Fighter,
  opts: FighterArtOpts,
): void {
  const def = charDef(f.char);
  const p = fighterPose(f, opts.tick);
  let phase = 0;
  if ((f.state === 'attack' || f.state === 'super') && f.move) {
    const md = def.moves[f.move];
    phase = Math.min(1, f.moveFrame / Math.max(1, md.startup + md.active + md.recovery));
  } else if (f.state === 'dodge') {
    phase = Math.min(1, f.stateTicks / 16);
  }
  const blink = f.invuln > 0 && f.state === 'respawn' && Math.floor(opts.tick / 4) % 2 === 0;
  let alpha = blink ? 0.35 : 1;
  if (f.state === 'ko' && f.stocks <= 0) alpha = 0.85;
  if (f.confuse > 0) {
    ctx.save();
    ctx.globalAlpha = 0.18;
    ctx.fillStyle = '#ff2e63';
    ctx.beginPath();
    ctx.ellipse(f.x, f.y - 70, 58, 92, 0, 0, TAU);
    ctx.fill();
    ctx.restore();
  }
  if (f.superFree && f.hp > 0) {
    ctx.save();
    ctx.globalAlpha = 0.22 + Math.sin(opts.tick * 0.2) * 0.08;
    ctx.strokeStyle = '#f7c948';
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.ellipse(f.x, f.y - 70, 64, 102, 0, 0, TAU);
    ctx.stroke();
    ctx.restore();
  }
  drawCharacter(ctx, def, f.x, f.y, f.facing, p.name, {
    ...opts,
    phase,
    alpha,
    flash: f.flash,
    held: f.state === 'grab' ? null : opts.held ?? null,
  });
  if (f.armorStock > 0 && f.char === 'brickhouse') {
    ctx.save();
    ctx.globalAlpha = 0.5;
    ctx.fillStyle = '#31d3d9';
    ctx.font = '700 10px monospace';
    ctx.fillText('ARMOUR', f.x - 26, f.y - 176);
    ctx.restore();
  }
}

/* ------------------------------------------------------------- portraits -- */

export function drawPortrait(
  ctx: CanvasRenderingContext2D,
  id: CharId,
  w: number,
  h: number,
  tick: number,
  opts: ArtOpts,
  pose: PoseName = 'idle',
  crop: 'full' | 'bust' = 'full',
  facing: 1 | -1 = 1,
): void {
  const def = charDef(id);
  // Two flat tones and a hard edge instead of a gradient: it prints.
  ctx.fillStyle = def.art.secondaryShade;
  ctx.fillRect(0, 0, w, h);
  ctx.fillStyle = def.art.secondary;
  ctx.beginPath();
  ctx.arc(w * 0.5, h * 0.44, Math.max(w, h) * 0.42, 0, TAU);
  ctx.fill();
  // Halftone dots.
  ctx.save();
  ctx.globalAlpha = 0.2;
  ctx.fillStyle = def.art.ink;
  const gap = Math.max(5, w / 22);
  for (let y = 0; y < h; y += gap) {
    for (let x = (Math.floor(y / gap) % 2) * gap * 0.5; x < w; x += gap) {
      const r = (1 - y / h) * gap * 0.22;
      ctx.beginPath();
      ctx.arc(x, y, r, 0, TAU);
      ctx.fill();
    }
  }
  ctx.restore();
  // Radiating ink rays.
  ctx.save();
  ctx.globalAlpha = 0.16;
  ctx.strokeStyle = def.art.ink;
  ctx.lineWidth = Math.max(5, w / 45);
  for (let i = 0; i < 14; i++) {
    const a = (i / 14) * TAU + tick * 0.0008;
    ctx.beginPath();
    ctx.moveTo(w / 2, h * 0.48);
    ctx.lineTo(w / 2 + Math.cos(a) * w, h * 0.48 + Math.sin(a) * w);
    ctx.stroke();
  }
  ctx.restore();
  ctx.save();
  if (crop === 'bust') {
    // Head and shoulders fill the frame; the figure's head sits near y = -135 at scale 1.
    const fit = (h / 150) * 1.95;
    ctx.translate(w / 2 - facing * w * 0.04, h * 0.5 + 132 * fit * def.art.scale);
    ctx.scale(fit, fit);
  } else {
    const fit = Math.min((h * 0.92) / 150, (w * 0.94) / 110);
    ctx.translate(w / 2, h * 0.97);
    ctx.scale(fit, fit);
  }
  drawCharacter(ctx, def, 0, 0, facing, pose, {
    ...opts,
    tick,
    phase: 0,
  });
  ctx.restore();
  // Ground plate.
  ctx.fillStyle = def.art.ink;
  ctx.globalAlpha = 0.28;
  ctx.fillRect(0, h - Math.max(3, h * 0.035), w, Math.max(3, h * 0.035));
  ctx.globalAlpha = 1;
}

/* ---------------------------------------------------------------- stage --- */

export const STAGE_W = 2400;
export const STAGE_H = 1600;
export const STAGE_X = -400;
export const STAGE_Y = -500;

interface Palette {
  sky: string;
  sky2: string;
  far: string;
  near: string;
  floor: string;
  floorTop: string;
  support: string;
  accent: string;
  light: string;
  ink: string;
}

const PALETTES: Record<string, Palette> = {
  rooftop: {
    sky: '#e9dcc2', sky2: '#cfd9dd', far: '#a9b6b8', near: '#6f7f83',
    floor: '#4b4a46', floorTop: '#8e8a7c', support: '#3a3936',
    accent: '#d8242c', light: '#f7c948', ink: '#12100f',
  },
  scroll: {
    sky: '#e8d9b8', sky2: '#d6c39b', far: '#b8a37c', near: '#7d6746',
    floor: '#6d5334', floorTop: '#a18152', support: '#4e3a23',
    accent: '#9e2b25', light: '#f0dfab', ink: '#211a15',
  },
  cabinet: {
    sky: '#1b1430', sky2: '#2c1d52', far: '#493074', near: '#2b1a4b',
    floor: '#241b3b', floorTop: '#6a4bb0', support: '#160f2a',
    accent: '#31d3d9', light: '#f24b8b', ink: '#0c0818',
  },
  crypt: {
    sky: '#1d2220', sky2: '#2d3430', far: '#4b5650', near: '#323b37',
    floor: '#3a403c', floorTop: '#69736b', support: '#222724',
    accent: '#a51f26', light: '#d8c98d', ink: '#080b0a',
  },
  soundstage: {
    sky: '#d9cdbb', sky2: '#b9a88c', far: '#8e7b63', near: '#5d4c39',
    floor: '#6b5844', floorTop: '#b59a73', support: '#3f3123',
    accent: '#d8242c', light: '#f7e3a8', ink: '#1b1510',
  },
  hangar: {
    sky: '#202b30', sky2: '#33434a', far: '#52656b', near: '#37474d',
    floor: '#3b474b', floorTop: '#718084', support: '#202a2d',
    accent: '#d7a63c', light: '#dce7e4', ink: '#0d1214',
  },
};

function paletteFor(stage: StageDef): Palette {
  return PALETTES[stage.theme] ?? PALETTES.rooftop;
}

function htDots(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, color: string, gap: number, alpha: number): void {
  ctx.save();
  ctx.globalAlpha = alpha;
  ctx.fillStyle = color;
  for (let yy = y; yy < y + h; yy += gap) {
    for (let xx = x + (Math.floor((yy - y) / gap) % 2) * gap * 0.5; xx < x + w; xx += gap) {
      ctx.beginPath();
      ctx.arc(xx, yy, gap * 0.16, 0, TAU);
      ctx.fill();
    }
  }
  ctx.restore();
}

function skyBand(ctx: CanvasRenderingContext2D, p: Palette): void {
  ctx.fillStyle = p.sky;
  ctx.fillRect(STAGE_X, STAGE_Y, STAGE_W, STAGE_H);
  ctx.fillStyle = p.sky2;
  ctx.beginPath();
  ctx.moveTo(STAGE_X, 250);
  ctx.lineTo(STAGE_X + STAGE_W, 120);
  ctx.lineTo(STAGE_X + STAGE_W, 560);
  ctx.lineTo(STAGE_X, 640);
  ctx.closePath();
  ctx.fill();
  htDots(ctx, STAGE_X, -160, STAGE_W, 620, p.ink, 9, 0.08);
}

/* Rooftop: a parade that will not stop for the fight. */
function paintRooftop(ctx: CanvasRenderingContext2D, p: Palette): void {
  skyBand(ctx, p);
  // Sun.
  circle(ctx, 1210, 120, 96, p.light, 6, p.ink);
  ctx.save();
  ctx.globalAlpha = 0.14;
  for (let i = 0; i < 10; i++) {
    ctx.fillStyle = p.ink;
    ctx.fillRect(940 + i * 60, 40, 26, 230);
  }
  ctx.restore();
  // Clouds: flat cut-outs with one shade band.
  for (let i = 0; i < 6; i++) {
    const cx = STAGE_X + 120 + i * 430 + rand(41, i) * 160;
    const cy = 90 + rand(42, i) * 170;
    const cw = 140 + rand(43, i) * 120;
    ctx.fillStyle = '#fbf6ea';
    ctx.beginPath();
    ctx.ellipse(cx, cy, cw * 0.5, 30, 0, 0, TAU);
    ctx.ellipse(cx - cw * 0.22, cy - 16, cw * 0.28, 28, 0, 0, TAU);
    ctx.ellipse(cx + cw * 0.2, cy - 12, cw * 0.3, 26, 0, 0, TAU);
    ctx.fill();
    ctx.strokeStyle = p.ink;
    ctx.lineWidth = 3;
    ctx.stroke();
    ctx.fillStyle = p.sky2;
    ctx.globalAlpha = 0.6;
    ctx.fillRect(cx - cw * 0.5, cy + 14, cw, 14);
    ctx.globalAlpha = 1;
  }
  // Haze layer: a pale, outline-free skyline a long way off.
  ctx.save();
  ctx.globalAlpha = 0.55;
  ctx.fillStyle = p.sky2;
  for (let i = 0; i < 26; i++) {
    const bw = 60 + rand(51, i) * 90;
    const bh = 90 + rand(52, i) * 260;
    const bx = STAGE_X + i * 96 - 30;
    ctx.fillRect(bx, 560 - bh, bw, bh + 300);
    if (rand(53, i) > 0.6) ctx.fillRect(bx + bw * 0.45, 560 - bh - 50, 6, 50);
  }
  ctx.restore();
  // Mid skyline: proper ink, lit windows, rooftop clutter.
  for (let i = 0; i < 17; i++) {
    const bw = 110 + rand(31, i) * 110;
    const bh = 150 + rand(32, i) * 330;
    const bx = STAGE_X + i * 150 - 40;
    const by = 660 - bh;
    ctx.fillStyle = i % 3 === 0 ? p.far : p.near;
    ctx.fillRect(bx, by, bw, bh + 200);
    ctx.strokeStyle = p.ink;
    ctx.lineWidth = 4;
    ctx.strokeRect(bx, by, bw, bh + 200);
    // One hard shade down the camera-left face.
    ctx.fillStyle = p.ink;
    ctx.globalAlpha = 0.16;
    ctx.fillRect(bx, by, Math.min(28, bw * 0.22), bh + 200);
    ctx.globalAlpha = 1;
    // Rooftop clutter: a stair box, an antenna, a vent.
    const r = rand(33, i);
    if (r < 0.4) {
      ctx.fillStyle = p.near;
      ctx.fillRect(bx + bw * 0.55, by - 34, 44, 34);
      ctx.strokeRect(bx + bw * 0.55, by - 34, 44, 34);
    } else if (r < 0.7) {
      ctx.beginPath();
      ctx.moveTo(bx + bw * 0.3, by);
      ctx.lineTo(bx + bw * 0.3, by - 90);
      ctx.moveTo(bx + bw * 0.3 - 14, by - 70);
      ctx.lineTo(bx + bw * 0.3 + 14, by - 70);
      ctx.stroke();
    }
    // Windows: a warm lit grid with a few dark ones, not an ink grid.
    for (let wy = by + 24; wy < 620; wy += 34) {
      for (let wx = bx + 18; wx < bx + bw - 18; wx += 30) {
        const lit = rand(i * 97 + wy, wx);
        ctx.globalAlpha = lit > 0.55 ? 0.9 : 0.28;
        ctx.fillStyle = lit > 0.55 ? p.light : p.ink;
        ctx.fillRect(wx, wy, 12, 18);
      }
    }
    ctx.globalAlpha = 1;
    if (i % 4 === 1) {
      // Water tower.
      ctx.strokeStyle = p.ink;
      ctx.lineWidth = 5;
      ctx.beginPath();
      ctx.moveTo(bx + 30, by);
      ctx.lineTo(bx + 44, by - 60);
      ctx.moveTo(bx + 90, by);
      ctx.lineTo(bx + 76, by - 60);
      ctx.stroke();
      ctx.fillStyle = p.near;
      ctx.beginPath();
      ctx.roundRect(bx + 26, by - 118, 68, 62, 14);
      ctx.fill();
      ctx.strokeStyle = p.ink;
      ctx.lineWidth = 4;
      ctx.stroke();
    }
  }
  // Parade balloons.
  const balloon = (x: number, y: number, c: string, kind: number): void => {
    ctx.strokeStyle = p.ink;
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.moveTo(x, y + 40);
    ctx.quadraticCurveTo(x - 20, y + 130, x + 8, y + 230);
    ctx.stroke();
    ctx.fillStyle = c;
    if (kind === 0) {
      ctx.beginPath();
      ctx.ellipse(x, y, 42, 34, 0, 0, TAU);
      ctx.fill();
      circle(ctx, x + 28, y + 18, 15, c, 4, p.ink);
      poly(ctx, [[x - 14, y + 8], [x - 4, y + 4], [x - 8, y + 16]], p.light, 3, p.ink);
    } else {
      ctx.beginPath();
      ctx.roundRect(x - 34, y - 26, 68, 54, 24);
      ctx.fill();
      circle(ctx, x, y + 4, 11, p.light, 4, p.ink);
    }
    ctx.lineWidth = 4;
    ctx.strokeStyle = p.ink;
    ctx.beginPath();
    ctx.ellipse(x, y, 42, 34, 0, 0, TAU);
    ctx.stroke();
  };
  balloon(470, 160, p.accent, 0);
  balloon(1760, 100, p.light, 1);
  balloon(1560, 260, p.far, 0);
  // Rooftop plant and billboard in the near layer.
  ctx.fillStyle = p.near;
  ctx.fillRect(1250, 350, 420, 250);
  ctx.strokeStyle = p.ink;
  ctx.lineWidth = 5;
  ctx.strokeRect(1250, 350, 420, 250);
  ctx.fillStyle = p.light;
  ctx.fillRect(1272, 372, 376, 206);
  ctx.fillStyle = p.ink;
  ctx.font = '900 76px "Bangers", Impact, sans-serif';
  ctx.textAlign = 'center';
  ctx.fillText('PARADE', 1460, 470);
  ctx.font = '900 34px "Bangers", Impact, sans-serif';
  ctx.fillText('DO NOT STOP', 1460, 520);
  ctx.textAlign = 'left';
  ctx.strokeStyle = p.ink;
  ctx.lineWidth = 6;
  ctx.beginPath();
  ctx.moveTo(1270, 600);
  ctx.lineTo(1270, 700);
  ctx.moveTo(1650, 600);
  ctx.lineTo(1650, 700);
  ctx.stroke();
  // Front ledge shadows.
  ctx.fillStyle = p.ink;
  ctx.globalAlpha = 0.18;
  ctx.fillRect(STAGE_X, 660, STAGE_W, 300);
  ctx.globalAlpha = 1;
}

/* Old Ink: wet brush, red sun, one bridge. */
function paintScroll(ctx: CanvasRenderingContext2D, p: Palette): void {
  skyBand(ctx, p);
  circle(ctx, 1240, 190, 120, p.accent, 5, p.ink);
  // Mountain layers, each a brush-shaped polygon.
  for (let layer = 0; layer < 3; layer++) {
    const y = 500 + layer * 70;
    const col = layer === 0 ? p.far : layer === 1 ? p.near : p.ink;
    ctx.globalAlpha = layer === 2 ? 0.5 : 0.75;
    ctx.beginPath();
    ctx.moveTo(STAGE_X, y + 100);
    for (let i = 0; i <= 10; i++) {
      const x = STAGE_X + (i / 10) * STAGE_W;
      const peak = y - 170 - rand(layer * 13 + 2, i) * 220;
      ctx.lineTo(x, peak);
      ctx.quadraticCurveTo(x + 100, y - 40, x + 160, y + 30);
    }
    ctx.lineTo(STAGE_X + STAGE_W, y + 260);
    ctx.lineTo(STAGE_X, y + 260);
    ctx.closePath();
    ctx.fillStyle = col;
    ctx.fill();
  }
  ctx.globalAlpha = 1;
  // Mist bands.
  for (let i = 0; i < 5; i++) {
    ctx.fillStyle = p.light;
    ctx.globalAlpha = 0.36;
    ctx.beginPath();
    ctx.ellipse(300 + i * 430, 520 + (i % 2) * 60, 350, 34, -0.05, 0, TAU);
    ctx.fill();
  }
  ctx.globalAlpha = 1;
  // Bridge posts and rails behind the main platform.
  for (const x of [180, 2100]) {
    ctx.fillStyle = p.near;
    ctx.fillRect(x, 250, 90, 460);
    ctx.strokeStyle = p.ink;
    ctx.lineWidth = 5;
    ctx.strokeRect(x, 250, 90, 460);
    ctx.fillStyle = p.ink;
    for (let i = 0; i < 5; i++) ctx.fillRect(x + 12, 290 + i * 76, 66, 10);
  }
  // Lanterns.
  for (const [x, y] of [[420, 260], [1180, 220], [1840, 300]]) {
    ctx.strokeStyle = p.ink;
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.moveTo(x, 100);
    ctx.lineTo(x, y);
    ctx.stroke();
    circle(ctx, x, y + 18, 26, p.accent, 4, p.ink);
    ctx.fillStyle = p.light;
    ctx.fillRect(x - 8, y + 4, 16, 28);
  }
  // Ink splashes at the edges.
  for (let i = 0; i < 9; i++) {
    ctx.globalAlpha = 0.12;
    circle(ctx, STAGE_X + rand(7, i) * STAGE_W, 130 + rand(8, i) * 420, 10 + rand(9, i) * 26, p.ink);
  }
  ctx.globalAlpha = 1;
}

/* Chrome Arcade: a cabinet that swallowed a street. */
function paintCabinet(ctx: CanvasRenderingContext2D, p: Palette): void {
  ctx.fillStyle = p.sky;
  ctx.fillRect(STAGE_X, STAGE_Y, STAGE_W, STAGE_H);
  // Pixel grid horizon.
  ctx.strokeStyle = p.accent;
  ctx.globalAlpha = 0.35;
  ctx.lineWidth = 2;
  for (let i = 0; i < 22; i++) {
    ctx.beginPath();
    ctx.moveTo(800, 540);
    ctx.lineTo(STAGE_X + i * 120, 760);
    ctx.stroke();
  }
  for (let i = 0; i < 8; i++) {
    ctx.beginPath();
    ctx.moveTo(STAGE_X, 540 + i * 34);
    ctx.lineTo(STAGE_X + STAGE_W, 540 + i * 34);
    ctx.stroke();
  }
  ctx.globalAlpha = 1;
  // Pixel skyline.
  for (let i = 0; i < 18; i++) {
    const bw = 80 + Math.floor(rand(11, i) * 90);
    const bh = 120 + Math.floor(rand(12, i) * 300);
    const bx = STAGE_X + i * 138;
    const by = 640 - bh;
    ctx.fillStyle = i % 2 ? p.far : p.near;
    ctx.fillRect(bx, by, bw, bh + 120);
    ctx.strokeStyle = p.ink;
    ctx.lineWidth = 3;
    ctx.strokeRect(bx, by, bw, bh + 120);
    ctx.fillStyle = p.accent;
    ctx.globalAlpha = 0.55;
    for (let wy = by + 18; wy < 620; wy += 26) {
      for (let wx = bx + 10; wx < bx + bw - 10; wx += 22) {
        if (rand(i * 31 + wx, wy) > 0.5) ctx.fillRect(wx, wy, 8, 10);
      }
    }
    ctx.globalAlpha = 1;
  }
  // Giant cabinet marquee.
  ctx.fillStyle = p.near;
  ctx.fillRect(150, -60, 2100, 330);
  ctx.strokeStyle = p.ink;
  ctx.lineWidth = 8;
  ctx.strokeRect(150, -60, 2100, 330);
  ctx.fillStyle = p.light;
  ctx.fillRect(190, -30, 2020, 270);
  ctx.fillStyle = p.ink;
  ctx.font = '900 180px "Bangers", Impact, sans-serif';
  ctx.textAlign = 'center';
  ctx.fillText('INSERT COIN', 1200, 150);
  ctx.fillStyle = p.accent;
  ctx.font = '900 46px monospace';
  ctx.fillText('1 PLAYER       2 PLAYERS', 1200, 218);
  ctx.textAlign = 'left';
  // Bezel sides.
  ctx.fillStyle = p.ink;
  ctx.fillRect(STAGE_X, 270, 540, 800);
  ctx.fillRect(1460, 270, 540, 800);
  ctx.strokeStyle = p.accent;
  ctx.lineWidth = 5;
  for (let i = 0; i < 6; i++) {
    ctx.beginPath();
    ctx.moveTo(80, 340 + i * 110);
    ctx.lineTo(520, 340 + i * 110);
    ctx.moveTo(1580, 340 + i * 110);
    ctx.lineTo(2020, 340 + i * 110);
    ctx.stroke();
  }
  // Scanlines.
  ctx.globalAlpha = 0.12;
  ctx.fillStyle = '#000';
  for (let y = STAGE_Y; y < STAGE_Y + STAGE_H; y += 6) ctx.fillRect(STAGE_X, y, STAGE_W, 2);
  ctx.globalAlpha = 1;
}

/* Chapel Noir: vaults, candles, one very red window. */
function paintCrypt(ctx: CanvasRenderingContext2D, p: Palette): void {
  ctx.fillStyle = p.sky;
  ctx.fillRect(STAGE_X, STAGE_Y, STAGE_W, STAGE_H);
  // Stone courses.
  ctx.strokeStyle = p.ink;
  ctx.globalAlpha = 0.24;
  ctx.lineWidth = 2;
  for (let y = -240; y < 680; y += 74) {
    ctx.beginPath();
    ctx.moveTo(STAGE_X, y);
    ctx.lineTo(STAGE_X + STAGE_W, y);
    ctx.stroke();
    for (let x = STAGE_X + ((y / 74) % 2) * 60; x < STAGE_X + STAGE_W; x += 120) {
      ctx.beginPath();
      ctx.moveTo(x, y);
      ctx.lineTo(x, y + 74);
      ctx.stroke();
    }
  }
  ctx.globalAlpha = 1;
  // Three gothic arches.
  for (let i = 0; i < 3; i++) {
    const cx = 340 + i * 660;
    const top = 20;
    ctx.beginPath();
    ctx.moveTo(cx - 220, 640);
    ctx.lineTo(cx - 220, top + 160);
    ctx.quadraticCurveTo(cx - 220, top, cx, top);
    ctx.quadraticCurveTo(cx + 220, top, cx + 220, top + 160);
    ctx.lineTo(cx + 220, 640);
    ctx.closePath();
    ctx.fillStyle = i === 1 ? '#141a17' : p.near;
    ctx.fill();
    ctx.strokeStyle = p.ink;
    ctx.lineWidth = 7;
    ctx.stroke();
    // Stained glass in the middle arch.
    if (i === 1) {
      for (let s = 0; s < 8; s++) {
        const gx = cx - 150 + (s % 4) * 80;
        const gy = 120 + Math.floor(s / 4) * 170;
        ctx.fillStyle = s % 3 === 0 ? p.accent : s % 3 === 1 ? p.light : '#335f6e';
        ctx.globalAlpha = 0.72;
        ctx.beginPath();
        ctx.moveTo(gx, gy);
        ctx.lineTo(gx + 68, gy);
        ctx.lineTo(gx + 68, gy + 150);
        ctx.lineTo(gx, gy + 150);
        ctx.closePath();
        ctx.fill();
        ctx.strokeStyle = p.ink;
        ctx.lineWidth = 3;
        ctx.stroke();
        ctx.globalAlpha = 1;
      }
    }
  }
  // Candles.
  for (let i = 0; i < 10; i++) {
    const x = 120 + i * 210 + (i % 2) * 40;
    const y = 560 + (i % 3) * 18;
    ctx.fillStyle = p.light;
    ctx.fillRect(x, y, 10, 42);
    circle(ctx, x + 5, y - 6, 5 + (i % 2), '#ffcf66', 2, p.ink);
    ctx.globalAlpha = 0.12;
    circle(ctx, x + 5, y - 6, 36, '#ffcf66');
    ctx.globalAlpha = 1;
  }
  // Pews.
  for (let i = 0; i < 3; i++) {
    const y = 600 + i * 42;
    ctx.fillStyle = p.near;
    ctx.fillRect(80, y, 620 - i * 60, 24);
    ctx.strokeStyle = p.ink;
    ctx.lineWidth = 3;
    ctx.strokeRect(80, y, 620 - i * 60, 24);
    ctx.fillStyle = p.ink;
    ctx.fillRect(110 + i * 20, y + 20, 16, 40);
    ctx.fillStyle = p.near;
  }
  // Hanging censers.
  for (const [x, len] of [[430, 280], [1200, 220], [1740, 310]]) {
    ctx.strokeStyle = p.ink;
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.moveTo(x, 0);
    ctx.lineTo(x, len);
    ctx.stroke();
    circle(ctx, x, len + 18, 22, p.accent, 4, p.ink);
    ctx.globalAlpha = 0.2;
    circle(ctx, x, len + 18, 52, p.light);
    ctx.globalAlpha = 1;
  }
  ctx.globalAlpha = 0.2;
  ctx.fillStyle = p.ink;
  ctx.fillRect(STAGE_X, 620, STAGE_W, 300);
  ctx.globalAlpha = 1;
}

/* Soundstage 6: everything is painted, including the sky. */
function paintSoundstage(ctx: CanvasRenderingContext2D, p: Palette): void {
  skyBand(ctx, p);
  // Painted backdrop cloth.
  ctx.fillStyle = '#cbbfa9';
  ctx.fillRect(STAGE_X, -200, STAGE_W, 800);
  ctx.strokeStyle = p.ink;
  ctx.globalAlpha = 0.25;
  ctx.lineWidth = 3;
  for (let x = STAGE_X; x < STAGE_X + STAGE_W; x += 90) {
    ctx.beginPath();
    ctx.moveTo(x, -200);
    ctx.lineTo(x, 600);
    ctx.stroke();
  }
  ctx.globalAlpha = 1;
  // Painted moon and skyline flat.
  circle(ctx, 1230, 240, 150, p.light, 5, p.ink);
  ctx.fillStyle = '#a39074';
  for (let i = 0; i < 8; i++) {
    const bx = 250 + i * 270;
    const bh = 100 + (i % 3) * 90;
    ctx.fillRect(bx, 620 - bh, 190, bh);
    ctx.strokeStyle = p.ink;
    ctx.lineWidth = 3;
    ctx.strokeRect(bx, 620 - bh, 190, bh);
  }
  // Studio lights on stands.
  for (let i = 0; i < 4; i++) {
    const x = 180 + i * 560;
    ctx.strokeStyle = p.ink;
    ctx.lineWidth = 7;
    ctx.beginPath();
    ctx.moveTo(x, 640);
    ctx.lineTo(x, 150);
    ctx.stroke();
    ctx.fillStyle = p.ink;
    ctx.save();
    ctx.translate(x, 140);
    ctx.rotate(i % 2 ? 0.4 : -0.3);
    ctx.fillRect(-44, -30, 88, 60);
    ctx.fillStyle = p.light;
    ctx.fillRect(-32, -20, 64, 40);
    ctx.restore();
    ctx.globalAlpha = 0.12;
    ctx.fillStyle = p.light;
    ctx.beginPath();
    ctx.moveTo(x, 160);
    ctx.lineTo(x - 130, 700);
    ctx.lineTo(x + 130, 700);
    ctx.closePath();
    ctx.fill();
    ctx.globalAlpha = 1;
  }
  // Cameras and cables.
  for (const [x, flip] of [[300, 1], [1780, -1]]) {
    ctx.fillStyle = p.near;
    ctx.fillRect(x - 30, 570, 60, 90);
    ctx.fillStyle = p.ink;
    ctx.fillRect(x - 50, 540, 100, 50);
    ctx.fillStyle = p.sky2;
    ctx.beginPath();
    ctx.arc(x + flip * 52, 565, 18, 0, TAU);
    ctx.fill();
    ctx.strokeStyle = p.ink;
    ctx.lineWidth = 4;
    ctx.stroke();
    ctx.strokeStyle = p.ink;
    ctx.lineWidth = 5;
    ctx.beginPath();
    ctx.moveTo(x, 640);
    ctx.bezierCurveTo(x + 100 * flip, 700, x + 60 * flip, 780, x + 260 * flip, 740);
    ctx.stroke();
  }
  // Director's chair.
  ctx.fillStyle = p.accent;
  ctx.fillRect(1540, 600, 90, 40);
  ctx.strokeStyle = p.ink;
  ctx.lineWidth = 4;
  ctx.strokeRect(1540, 600, 90, 40);
  ctx.strokeRect(1540, 520, 90, 44);
  ctx.beginPath();
  ctx.moveTo(1550, 560);
  ctx.lineTo(1558, 640);
  ctx.moveTo(1620, 560);
  ctx.lineTo(1612, 640);
  ctx.stroke();
  ctx.fillStyle = p.ink;
  ctx.font = '900 28px "Bangers", Impact, sans-serif';
  ctx.fillText('DIR', 1556, 550);
  // Floor line / tape marks.
  ctx.globalAlpha = 0.2;
  ctx.strokeStyle = p.ink;
  ctx.lineWidth = 2;
  for (let x = STAGE_X; x < STAGE_X + STAGE_W; x += 160) {
    ctx.beginPath();
    ctx.moveTo(x, 700);
    ctx.lineTo(x + 70, 640);
    ctx.stroke();
  }
  ctx.globalAlpha = 1;
}

/* Hangar 9: cold steel and no insignia. */
function paintHangar(ctx: CanvasRenderingContext2D, p: Palette): void {
  ctx.fillStyle = p.sky;
  ctx.fillRect(STAGE_X, STAGE_Y, STAGE_W, STAGE_H);
  // Corrugated ribs.
  for (let i = 0; i < 18; i++) {
    const x = STAGE_X + i * 140;
    ctx.fillStyle = i % 2 ? p.sky2 : p.near;
    ctx.fillRect(x, -500, 70, 1200);
    ctx.strokeStyle = p.ink;
    ctx.globalAlpha = 0.3;
    ctx.lineWidth = 2;
    ctx.strokeRect(x, -500, 70, 1200);
    ctx.globalAlpha = 1;
  }
  // Ceiling truss.
  ctx.strokeStyle = p.ink;
  ctx.lineWidth = 8;
  for (let i = 0; i < 8; i++) {
    ctx.beginPath();
    ctx.moveTo(STAGE_X + i * 340, -120);
    ctx.lineTo(STAGE_X + i * 340 + 170, -20);
    ctx.lineTo(STAGE_X + i * 340 + 340, -120);
    ctx.stroke();
  }
  ctx.beginPath();
  ctx.moveTo(STAGE_X, -110);
  ctx.lineTo(STAGE_X + STAGE_W, -110);
  ctx.stroke();
  // Floodlights.
  for (const [x, y] of [[360, 140], [1200, 90], [1880, 170]]) {
    ctx.strokeStyle = p.ink;
    ctx.lineWidth = 5;
    ctx.beginPath();
    ctx.moveTo(x, -110);
    ctx.lineTo(x, y);
    ctx.stroke();
    ctx.fillStyle = p.ink;
    ctx.fillRect(x - 52, y, 104, 50);
    ctx.fillStyle = p.light;
    ctx.fillRect(x - 42, y + 8, 84, 34);
    ctx.globalAlpha = 0.1;
    ctx.beginPath();
    ctx.moveTo(x - 42, y + 42);
    ctx.lineTo(x - 220, 700);
    ctx.lineTo(x + 220, 700);
    ctx.lineTo(x + 42, y + 42);
    ctx.closePath();
    ctx.fillStyle = p.light;
    ctx.fill();
    ctx.globalAlpha = 1;
  }
  // Plane silhouette.
  ctx.fillStyle = p.near;
  ctx.beginPath();
  ctx.moveTo(780, 450);
  ctx.lineTo(1500, 400);
  ctx.lineTo(1680, 440);
  ctx.lineTo(1500, 500);
  ctx.lineTo(820, 520);
  ctx.closePath();
  ctx.fill();
  ctx.strokeStyle = p.ink;
  ctx.lineWidth = 5;
  ctx.stroke();
  ctx.beginPath();
  ctx.moveTo(1080, 430);
  ctx.lineTo(1180, 300);
  ctx.lineTo(1300, 310);
  ctx.lineTo(1240, 440);
  ctx.closePath();
  ctx.fill();
  ctx.stroke();
  ctx.beginPath();
  ctx.moveTo(1050, 500);
  ctx.lineTo(980, 580);
  ctx.lineTo(1120, 560);
  ctx.closePath();
  ctx.fill();
  ctx.stroke();
  // Crates.
  for (let i = 0; i < 5; i++) {
    const x = 240 + i * 460;
    const y = 600 - (i % 2) * 40;
    ctx.fillStyle = p.near;
    ctx.fillRect(x, y, 120, 100);
    ctx.strokeStyle = p.ink;
    ctx.lineWidth = 4;
    ctx.strokeRect(x, y, 120, 100);
    ctx.beginPath();
    ctx.moveTo(x, y);
    ctx.lineTo(x + 120, y + 100);
    ctx.moveTo(x + 120, y);
    ctx.lineTo(x, y + 100);
    ctx.stroke();
    ctx.fillStyle = p.accent;
    ctx.globalAlpha = 0.7;
    ctx.fillRect(x + 8, y + 8, 46, 12);
    ctx.globalAlpha = 1;
  }
  // Hazard stripes at the base.
  ctx.save();
  ctx.beginPath();
  ctx.rect(STAGE_X, 700, STAGE_W, 60);
  ctx.clip();
  for (let x = STAGE_X; x < STAGE_X + STAGE_W; x += 46) {
    poly(ctx, [[x, 760], [x + 24, 700], [x + 60, 700], [x + 36, 760]], p.accent);
  }
  ctx.restore();
  ctx.globalAlpha = 0.35;
  ctx.fillStyle = p.ink;
  ctx.fillRect(STAGE_X, 700, STAGE_W, 400);
  ctx.globalAlpha = 1;
}

/* ------------------------------------------------------------ backdrops --- */

const backdropCache = new Map<string, HTMLCanvasElement>();

export function stageBackdrop(stage: StageDef): HTMLCanvasElement {
  const hit = backdropCache.get(stage.id);
  if (hit) return hit;
  const c = makeCanvas(STAGE_W, STAGE_H);
  const ctx = ctxOf(c);
  ctx.translate(-STAGE_X, -STAGE_Y);
  const p = paletteFor(stage);
  switch (stage.theme) {
    case 'scroll':
      paintScroll(ctx, p);
      break;
    case 'cabinet':
      paintCabinet(ctx, p);
      break;
    case 'crypt':
      paintCrypt(ctx, p);
      break;
    case 'soundstage':
      paintSoundstage(ctx, p);
      break;
    case 'hangar':
      paintHangar(ctx, p);
      break;
    default:
      paintRooftop(ctx, p);
      break;
  }
  backdropCache.set(stage.id, c);
  return c;
}

export function drawStageBack(ctx: CanvasRenderingContext2D, stage: StageDef): void {
  const p = paletteFor(stage);
  ctx.fillStyle = p.sky;
  ctx.fillRect(STAGE_X, STAGE_Y, STAGE_W, STAGE_H);
  ctx.drawImage(stageBackdrop(stage), STAGE_X, STAGE_Y);
}

export function drawStageFront(
  ctx: CanvasRenderingContext2D,
  stage: StageDef,
  tick: number,
  opts: ArtOpts,
): void {
  const p = paletteFor(stage);
  ctx.save();
  if (stage.theme === 'scroll') {
    for (let i = 0; i < 4; i++) {
      const x = ((tick * (0.18 + i * 0.05) + i * 560) % (STAGE_W + 800)) - 400;
      ctx.globalAlpha = 0.14;
      ellipse(ctx, x, 470 + i * 44, 330, 26, p.light);
    }
  } else if (stage.theme === 'rooftop') {
    for (let i = 0; i < 12; i++) {
      const x = (rand(41, i) * 2200 - 200 + tick * (0.4 + rand(42, i) * 0.6)) % 2200 - 200;
      const y = 80 + rand(43, i) * 420 + Math.sin(tick * 0.02 + i) * 20;
      ctx.globalAlpha = 0.55;
      ctx.fillStyle = i % 3 === 0 ? p.accent : i % 3 === 1 ? p.light : p.sky2;
      ctx.fillRect(x, y, 7, 11);
    }
  } else if (stage.theme === 'cabinet') {
    ctx.globalAlpha = 0.16;
    ctx.fillStyle = '#000';
    for (let y = Math.floor(tick / 2) % 6; y < STAGE_Y + STAGE_H; y += 6) ctx.fillRect(STAGE_X, y, STAGE_W, 2);
  } else if (stage.theme === 'crypt') {
    for (let i = 0; i < 9; i++) {
      const x = 120 + rand(51, i) * 2000;
      const y = 220 + rand(52, i) * 420 + Math.sin(tick * 0.012 + i) * 16;
      ctx.globalAlpha = 0.2;
      circle(ctx, x, y, 2 + rand(53, i) * 2, p.light);
    }
    ctx.globalAlpha = 0.1 + Math.sin(tick * 0.09) * 0.02;
    ctx.fillStyle = p.accent;
    ctx.fillRect(200, 80, 1000, 700);
  } else if (stage.theme === 'soundstage') {
    for (let i = 0; i < 7; i++) {
      const x = 240 + i * 300;
      ctx.globalAlpha = 0.06;
      ctx.fillStyle = p.light;
      ctx.beginPath();
      ctx.moveTo(x, 170);
      ctx.lineTo(x - 170, 720);
      ctx.lineTo(x + 170, 720);
      ctx.closePath();
      ctx.fill();
    }
  } else if (stage.theme === 'hangar') {
    for (let i = 0; i < 5; i++) {
      const y = 640 + i * 18;
      const x = ((tick * 0.5 + i * 380) % 2200) - 300;
      ctx.globalAlpha = 0.1;
      ellipse(ctx, x, y, 170, 18, p.light);
    }
  }
  ctx.globalAlpha = 1;
  if (!opts.lite) {
    // Paper grain over the whole stage.
    ctx.globalAlpha = 0.05;
    ctx.fillStyle = p.ink;
    for (let i = 0; i < 160; i++) {
      const x = STAGE_X + rand(61, i) * STAGE_W;
      const y = STAGE_Y + rand(62, i) * STAGE_H;
      ctx.fillRect(x, y, 2 + rand(63, i) * 3, 1.5);
    }
  }
  ctx.restore();
}

/* ------------------------------------------------------------ platforms --- */

export interface ScarMark {
  x: number;
  y: number;
  seed: number;
  kind: 'crack' | 'blood' | 'burn' | 'hole';
  theme: string;
}

function platformSurface(theme: string, p: Palette): string {
  switch (theme) {
    case 'scroll':
      return '#9a7b4b';
    case 'cabinet':
      return '#5d43a0';
    case 'crypt':
      return '#79837b';
    case 'soundstage':
      return '#b39870';
    case 'hangar':
      return '#7a898d';
    default:
      return '#8f8a7a';
  }
}

export function drawPlatforms(
  ctx: CanvasRenderingContext2D,
  m: MatchState,
  stage: StageDef,
  tick: number,
  opts: ArtOpts,
): void {
  const p = paletteFor(stage);
  const top = platformSurface(stage.theme, p);
  const ink = inkWidth(opts, 1.1);
  for (let i = 0; i < m.platforms.length; i++) {
    const pl = m.platforms[i];
    const gone = pl.off && pl.off > 0;
    ctx.save();
    if (gone) {
      ctx.globalAlpha = 0.12 + (Math.floor(tick / 4) % 2) * 0.08;
    }
    if (!pl.soft) {
      // Main slab: two flat tones, one ink casing, feet into the dark.
      ctx.fillStyle = p.floor;
      ctx.fillRect(pl.x - 18, pl.y, pl.w + 36, Math.max(pl.h, 120));
      ctx.fillStyle = top;
      ctx.fillRect(pl.x, pl.y, pl.w, 20);
      ctx.strokeStyle = p.ink;
      ctx.lineWidth = ink;
      ctx.strokeRect(pl.x, pl.y, pl.w, Math.max(pl.h, 120));
      ctx.beginPath();
      ctx.moveTo(pl.x, pl.y + 20);
      ctx.lineTo(pl.x + pl.w, pl.y + 20);
      ctx.stroke();
      // Texture: bolts / bricks / planks.
      ctx.globalAlpha = gone ? 0.3 : 0.4;
      ctx.fillStyle = p.ink;
      for (let x = pl.x + 26; x < pl.x + pl.w - 10; x += 78) {
        if (stage.theme === 'scroll') {
          ctx.fillRect(x, pl.y + 28, 3, 64);
        } else if (stage.theme === 'cabinet') {
          ctx.fillRect(x, pl.y + 30, 26, 4);
          ctx.fillRect(x + 8, pl.y + 50, 26, 4);
        } else if (stage.theme === 'crypt') {
          ctx.strokeStyle = p.ink;
          ctx.lineWidth = 2;
          ctx.strokeRect(x, pl.y + 30, 64, 26);
        } else if (stage.theme === 'hangar') {
          ctx.fillRect(x, pl.y + 34, 12, 12);
        } else {
          ctx.fillRect(x, pl.y + 34, 4, 4);
          ctx.fillRect(x + 20, pl.y + 52, 4, 4);
        }
      }
      ctx.globalAlpha = 1;
      // Supports.
      ctx.fillStyle = p.support;
      const legs = [pl.x + 80, pl.x + pl.w / 2, pl.x + pl.w - 80];
      for (const lx of legs) {
        ctx.fillRect(lx - 18, pl.y + 110, 36, 320);
        ctx.strokeStyle = p.ink;
        ctx.lineWidth = 3;
        ctx.strokeRect(lx - 18, pl.y + 110, 36, 320);
      }
    } else {
      // Soft platform: a shelf with themed brackets.
      ctx.fillStyle = p.floorTop;
      ctx.fillRect(pl.x, pl.y, pl.w, Math.max(12, pl.h));
      ctx.fillStyle = top;
      ctx.fillRect(pl.x, pl.y, pl.w, Math.max(5, pl.h * 0.35));
      ctx.strokeStyle = p.ink;
      ctx.lineWidth = ink * 0.8;
      ctx.strokeRect(pl.x, pl.y, pl.w, Math.max(12, pl.h));
      ctx.fillStyle = p.support;
      if (!gone) {
        const bx = pl.x + pl.w * 0.2;
        const bx2 = pl.x + pl.w * 0.8;
        ctx.fillRect(bx, pl.y + 8, 7, 40);
        ctx.fillRect(bx2, pl.y + 8, 7, 40);
        if (stage.theme === 'scroll') {
          ctx.strokeStyle = p.ink;
          ctx.lineWidth = 2;
          ctx.beginPath();
          ctx.moveTo(pl.x - 10, pl.y - 180);
          ctx.lineTo(bx + 3, pl.y + 6);
          ctx.moveTo(pl.x + pl.w + 10, pl.y - 180);
          ctx.lineTo(bx2 + 3, pl.y + 6);
          ctx.stroke();
        }
      }
      // Hanging vines / chains / cables.
      if (stage.theme === 'rooftop' || stage.theme === 'hangar') {
        ctx.strokeStyle = p.ink;
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.moveTo(pl.x + pl.w * 0.5, pl.y + 12);
        ctx.quadraticCurveTo(pl.x + pl.w * 0.4, pl.y + 50, pl.x + pl.w * 0.55, pl.y + 90);
        ctx.stroke();
      }
    }
    ctx.restore();
  }
  // Stage marks on the surface.
  ctx.save();
  ctx.globalAlpha = 0.16;
  ctx.strokeStyle = p.ink;
  ctx.lineWidth = 2;
  for (const sx of [420, 700, 1000, 1280]) {
    ctx.beginPath();
    ctx.moveTo(sx, 650);
    ctx.lineTo(sx + 26, 650);
    ctx.stroke();
  }
  ctx.restore();
}

export function drawScar(ctx: CanvasRenderingContext2D, scar: ScarMark, tick: number): void {
  const p = PALETTES[scar.theme] ?? PALETTES.rooftop;
  ctx.save();
  ctx.translate(scar.x, scar.y);
  if (scar.kind === 'crack') {
    ctx.strokeStyle = p.ink;
    ctx.lineWidth = 3;
    ctx.globalAlpha = 0.7;
    ctx.beginPath();
    let x = 0;
    let y = 0;
    ctx.moveTo(x, y);
    for (let i = 0; i < 6; i++) {
      x += (rand(scar.seed, i) - 0.5) * 54;
      y += 12 + rand(scar.seed + 1, i) * 20;
      ctx.lineTo(x, y);
    }
    ctx.stroke();
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.moveTo(10, 14);
    ctx.lineTo(40, 36);
    ctx.stroke();
  } else if (scar.kind === 'blood') {
    ctx.globalAlpha = 0.62;
    ctx.fillStyle = '#8f1218';
    for (let i = 0; i < 9; i++) {
      const a = rand(scar.seed, i) * TAU;
      const d = 8 + rand(scar.seed + 3, i) * 52;
      circle(ctx, Math.cos(a) * d, Math.sin(a) * d * 0.35, 2 + rand(scar.seed + 5, i) * 7, '#8f1218');
    }
    ctx.globalAlpha = 0.4;
    ctx.fillStyle = '#d8242c';
    ellipse(ctx, 0, 0, 22, 6, '#d8242c');
  } else if (scar.kind === 'burn') {
    ctx.globalAlpha = 0.55;
    ctx.fillStyle = p.ink;
    for (let i = 0; i < 8; i++) {
      const a = (i / 8) * TAU;
      const d = 12 + rand(scar.seed, i) * 30;
      poly(ctx, [[0, 0], [Math.cos(a - 0.3) * d, Math.sin(a - 0.3) * d * 0.4], [Math.cos(a + 0.2) * d, Math.sin(a + 0.2) * d * 0.4]], p.ink);
    }
  } else {
    ctx.globalAlpha = 0.6;
    ctx.fillStyle = p.ink;
    ellipse(ctx, 0, 0, 20, 8, p.ink);
    ctx.globalAlpha = 0.25;
    ctx.strokeStyle = '#fff';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.ellipse(0, 0, 26, 11, 0, 0, TAU);
    ctx.stroke();
  }
  ctx.restore();
  void tick;
}

/* ------------------------------------------------------------- entities --- */

export function drawItem(ctx: CanvasRenderingContext2D, item: WorldItem, tick: number, opts: ArtOpts): void {
  ctx.save();
  ctx.translate(item.x, item.y);
  if (item.spin) ctx.rotate(Math.sin(tick * 0.25) * 0.4 + item.spin);
  const ink = inkWidth(opts, 0.7);
  ctx.lineWidth = ink;
  ctx.strokeStyle = '#12100f';
  if (item.kind === 'chair') {
    ctx.fillStyle = '#8a5a36';
    ctx.fillRect(-22, -58, 44, 10);
    ctx.fillRect(-22, -58, 8, 58);
    ctx.fillRect(14, -48, 8, 48);
    ctx.fillRect(-22, -26, 44, 8);
    ctx.strokeRect(-22, -58, 44, 10);
    ctx.strokeRect(-22, -58, 8, 58);
  } else if (item.kind === 'inkstone') {
    ctx.fillStyle = '#3b3b40';
    ctx.beginPath();
    ctx.roundRect(-20, -28, 40, 28, 6);
    ctx.fill();
    ctx.stroke();
    ctx.fillStyle = '#1b1b20';
    ctx.beginPath();
    ctx.ellipse(0, -20, 11, 6, 0, 0, TAU);
    ctx.fill();
  } else if (item.kind === 'token') {
    circle(ctx, 0, -16, 16, '#f7c948', ink, '#12100f');
    ctx.fillStyle = '#12100f';
    ctx.font = '900 16px monospace';
    ctx.textAlign = 'center';
    ctx.fillText('25', 0, -10);
    ctx.textAlign = 'left';
  } else if (item.kind === 'censer') {
    circle(ctx, 0, -16, 14, '#c9a24a', ink, '#12100f');
    ctx.strokeStyle = '#12100f';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(0, -30);
    ctx.lineTo(0, -52);
    ctx.stroke();
    ctx.fillStyle = '#e8ddc2';
    ctx.beginPath();
    ctx.arc(0, -16, 7, 0, Math.PI);
    ctx.fill();
  } else if (item.kind === 'anvil') {
    poly(ctx, [[-26, -30], [26, -30], [18, -18], [12, -14], [12, 0], [-12, 0], [-12, -14], [-18, -18]], '#4a5054', ink, '#12100f');
    ctx.fillStyle = '#2a2e31';
    ctx.fillRect(-8, -14, 16, 10);
  } else {
    // Crate / generic.
    ctx.fillStyle = '#7d6338';
    ctx.fillRect(-24, -42, 48, 42);
    ctx.strokeRect(-24, -42, 48, 42);
    ctx.beginPath();
    ctx.moveTo(-24, -42);
    ctx.lineTo(24, 0);
    ctx.moveTo(24, -42);
    ctx.lineTo(-24, 0);
    ctx.stroke();
  }
  ctx.restore();
}

export function drawTrap(ctx: CanvasRenderingContext2D, t: Trap, tick: number, opts: ArtOpts): void {
  ctx.save();
  ctx.translate(t.x, t.y);
  const ink = inkWidth(opts, 0.8);
  const pulse = 0.75 + Math.sin(tick * 0.2 + t.id) * 0.2;
  ctx.lineWidth = ink;
  ctx.strokeStyle = '#12100f';
  if (t.kind === 'sigil') {
    ctx.globalAlpha = 0.8;
    ctx.strokeStyle = t.char === 'halo' ? '#d8c98d' : '#f7c948';
    ctx.lineWidth = 4;
    ctx.beginPath();
    ctx.ellipse(0, 0, t.radius, t.radius * 0.32, 0, 0, TAU);
    ctx.stroke();
    ctx.beginPath();
    ctx.ellipse(0, 0, t.radius * 0.62, t.radius * 0.2, 0, 0, TAU);
    ctx.stroke();
    ctx.beginPath();
    for (let i = 0; i < 8; i++) {
      const a = (i / 8) * TAU + tick * 0.02;
      const x = Math.cos(a) * t.radius * 0.9;
      const y = Math.sin(a) * t.radius * 0.3;
      ctx.moveTo(x, y - 8);
      ctx.lineTo(x + Math.cos(a) * 10, y + Math.sin(a) * 10);
    }
    ctx.stroke();
    ctx.fillStyle = '#f7c948';
    ctx.globalAlpha = 0.2;
    ctx.beginPath();
    ctx.ellipse(0, 0, t.radius, t.radius * 0.32, 0, 0, TAU);
    ctx.fill();
  } else if (t.kind === 'pillar') {
    ctx.globalAlpha = 0.3 + Math.sin(tick * 0.3) * 0.1;
    ctx.fillStyle = '#f7e3a8';
    ctx.fillRect(-t.radius * 0.5, -430, t.radius, 430);
    ctx.globalAlpha = 0.7;
    ctx.fillStyle = '#fff';
    ctx.fillRect(-t.radius * 0.18, -430, t.radius * 0.36, 430);
    ctx.globalAlpha = 1;
    ctx.strokeStyle = '#f7c948';
    ctx.lineWidth = 3;
    ctx.strokeRect(-t.radius * 0.5, -430, t.radius, 430);
  } else if (t.kind === 'egg') {
    ctx.scale(1, 1.2);
    ellipse(ctx, 0, -20, 20, 27, '#d8c98d', ink, '#12100f');
    ctx.fillStyle = '#78d6c0';
    for (let i = 0; i < 4; i++) {
      circle(ctx, -10 + i * 7, -22 + (i % 2) * 8, 3, '#78d6c0');
    }
    ctx.globalAlpha = 0.4;
    ctx.strokeStyle = '#12100f';
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.moveTo(-14, -10);
    ctx.lineTo(-4, -24);
    ctx.lineTo(6, -12);
    ctx.lineTo(16, -26);
    ctx.stroke();
  } else if (t.kind === 'turret') {
    ctx.fillStyle = '#c47d1b';
    ctx.fillRect(-20, -44, 40, 44);
    ctx.strokeRect(-20, -44, 40, 44);
    ctx.fillStyle = '#23b5a6';
    ctx.fillRect(-14, -38, 28, 18);
    ctx.fillStyle = '#12100f';
    ctx.fillRect(-6, -36, 5, 5);
    ctx.fillRect(3, -36, 5, 5);
    ctx.fillStyle = '#7d8b92';
    ctx.fillRect(-4, -56, 8, 16);
    ctx.beginPath();
    ctx.moveTo(-8, -56);
    ctx.lineTo(8, -56);
    ctx.stroke();
    if (t.arm <= 0) {
      ctx.fillStyle = '#f7c948';
      ctx.globalAlpha = pulse;
      circle(ctx, 0, -60, 4, '#f7c948');
    }
  } else if (t.kind === 'airstrike') {
    const blink = Math.floor(tick / 3) % 2 === 0;
    ctx.globalAlpha = blink ? 0.35 : 0.16;
    ctx.strokeStyle = '#d8242c';
    ctx.lineWidth = 4;
    ctx.beginPath();
    ctx.ellipse(0, 0, t.radius, t.radius * 0.34, 0, 0, TAU);
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(-t.radius, 0);
    ctx.lineTo(t.radius, 0);
    ctx.moveTo(0, -t.radius * 0.34);
    ctx.lineTo(0, t.radius * 0.34);
    ctx.stroke();
    ctx.globalAlpha = 1;
    ctx.fillStyle = '#d8242c';
    ctx.font = '900 20px "Bangers", Impact, sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText('!', 0, -12);
    ctx.textAlign = 'left';
  } else {
    ctx.globalAlpha = 0.6;
    circle(ctx, 0, 0, t.radius, '#d8242c', ink, '#12100f');
    ctx.fillStyle = '#12100f';
    ctx.font = '900 14px monospace';
    ctx.textAlign = 'center';
    ctx.fillText('BREACH', 0, 4);
    ctx.textAlign = 'left';
  }
  ctx.restore();
}

export function drawProjectile(ctx: CanvasRenderingContext2D, p: Projectile, tick: number, opts: ArtOpts): void {
  ctx.save();
  ctx.translate(p.x, p.y);
  const ink = inkWidth(opts, 0.7);
  ctx.lineWidth = ink;
  ctx.strokeStyle = '#12100f';
  const angle = Math.atan2(p.vy, p.vx);
  if (p.kind === 'shockwave') {
    ctx.rotate(angle);
    ctx.strokeStyle = '#12100f';
    ctx.lineWidth = 5;
    ctx.beginPath();
    ctx.arc(0, 0, p.radius, -0.7, 0.7);
    ctx.stroke();
    ctx.strokeStyle = '#f7c948';
    ctx.lineWidth = 3;
    ctx.stroke();
    ctx.globalAlpha = 0.4;
    ctx.fillStyle = '#f7c948';
    ctx.beginPath();
    ctx.arc(0, 0, p.radius * 0.7, -0.6, 0.6);
    ctx.fill();
  } else if (p.kind === 'pellet') {
    ctx.rotate(angle);
    ctx.fillStyle = '#d7a63c';
    ctx.fillRect(-10, -2, 20, 4);
    ctx.globalAlpha = 0.3;
    ctx.fillStyle = '#fff';
    ctx.fillRect(-22, -1, 10, 2);
  } else if (p.kind === 'acid') {
    ctx.fillStyle = '#c8f05a';
    ctx.beginPath();
    ctx.ellipse(0, 0, p.radius, p.radius * 0.72, angle, 0, TAU);
    ctx.fill();
    ctx.strokeStyle = '#4c6b1a';
    ctx.lineWidth = 2;
    ctx.stroke();
    ctx.globalAlpha = 0.5;
    circle(ctx, -4, -3, 3, '#fff');
  } else if (p.kind === 'swarm') {
    const wing = Math.sin(tick * 0.6 + p.id) * 4;
    ctx.fillStyle = '#78d6c0';
    ellipse(ctx, 0, 0, 5, 3, '#78d6c0', 1, '#12100f');
    ctx.globalAlpha = 0.7;
    ctx.strokeStyle = '#f7c948';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(-2, 0);
    ctx.lineTo(-7, -wing);
    ctx.moveTo(2, 0);
    ctx.lineTo(7, wing);
    ctx.stroke();
  } else if (p.kind === 'breach') {
    ctx.rotate(angle);
    ctx.fillStyle = '#5d6b3c';
    ctx.fillRect(-12, -7, 24, 14);
    ctx.fillStyle = '#d8242c';
    ctx.fillRect(-4, -4, 8, 8);
    ctx.globalAlpha = 0.3;
    circle(ctx, 0, 0, 18, '#f7c948');
  } else if (p.kind === 'crankshot') {
    ctx.rotate(angle);
    ctx.fillStyle = '#7d8b92';
    ctx.fillRect(-10, -6, 20, 12);
    ctx.fillStyle = '#31d3d9';
    ctx.fillRect(-2, -8, 8, 16);
  } else {
    circle(ctx, 0, 0, p.radius, '#d8242c', ink, '#12100f');
    ctx.fillStyle = '#f7c948';
    circle(ctx, 0, 0, p.radius * 0.45, '#f7c948');
  }
  ctx.restore();
}

/* -------------------------------------------------------------- effects --- */

export function drawInkSplash(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  seed: number,
  color: string,
  scale: number,
  alpha: number,
): void {
  ctx.save();
  ctx.translate(x, y);
  ctx.globalAlpha = alpha;
  ctx.fillStyle = color;
  for (let i = 0; i < 11; i++) {
    const a = rand(seed, i) * TAU;
    const d = rand(seed + 7, i) * 34 * scale;
    const r = (1.5 + rand(seed + 13, i) * 7) * scale;
    circle(ctx, Math.cos(a) * d, Math.sin(a) * d * 0.72, r, color);
  }
  ellipse(ctx, 0, 0, 16 * scale, 9 * scale, color);
  ctx.restore();
}

export function drawBurst(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  seed: number,
  color: string,
  radius: number,
  alpha: number,
  spikes = 12,
): void {
  ctx.save();
  ctx.translate(x, y);
  ctx.globalAlpha = alpha;
  ctx.fillStyle = color;
  ctx.beginPath();
  for (let i = 0; i < spikes * 2; i++) {
    const a = (i / (spikes * 2)) * TAU + rand(seed, i) * 0.2;
    const r = (i % 2 === 0 ? radius : radius * 0.55) * (0.7 + rand(seed + 5, i) * 0.5);
    const px = Math.cos(a) * r;
    const py = Math.sin(a) * r;
    if (i === 0) ctx.moveTo(px, py);
    else ctx.lineTo(px, py);
  }
  ctx.closePath();
  ctx.fill();
  ctx.globalAlpha = alpha * 0.65;
  ctx.strokeStyle = '#12100f';
  ctx.lineWidth = 3;
  ctx.stroke();
  ctx.restore();
}

export function drawSuperAura(
  ctx: CanvasRenderingContext2D,
  f: Fighter,
  tick: number,
  color: string,
): void {
  ctx.save();
  ctx.translate(f.x, f.y - 70);
  const spin = tick * 0.08;
  ctx.globalAlpha = 0.55;
  ctx.strokeStyle = color;
  ctx.lineWidth = 4;
  for (let i = 0; i < 3; i++) {
    ctx.beginPath();
    ctx.ellipse(0, 0, 74 + i * 12, 100 + i * 14, spin + i * 0.6, 0, Math.PI * 1.7);
    ctx.stroke();
  }
  ctx.globalAlpha = 0.2;
  ctx.fillStyle = color;
  ctx.beginPath();
  ctx.ellipse(0, 0, 88, 116, 0, 0, TAU);
  ctx.fill();
  ctx.restore();
}





