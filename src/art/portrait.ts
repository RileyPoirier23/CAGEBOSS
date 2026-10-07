/**
 * Procedural pixel portraits. Drawn on a 64x64 grid into an RGBA buffer
 * (pure, testable); box-filtered down for 32px slots, cropped for 24px.
 *
 * Layers: background variant, shoulders, neck, head shape, ears (cauliflower
 * grows with damage), hair (recedes / greys with age), brows, eyes, nose
 * (can break), mouth, beard, scars, tattoos, and post-fight wounds:
 * cuts, black eyes, swelling, bandages, nose bleeds.
 */
import type { Look, Wounds } from '../core/types';
import { SKIN_TONES, HAIR_COLORS, PAL, shade, lerpColor } from './palette';
import { hashString } from '../core/rng';

export type PortraitVariant = 'plain' | 'mugshot' | 'press' | 'belt' | 'corner' | 'reporter';

export interface PortraitInput {
  id: string;
  look: Look;
  gender: 'M' | 'W';
  age: number;
  damage?: number; // career damage 0..100 (cauliflower, nose)
  wounds?: Wounds;
  variant?: PortraitVariant;
  attire?: 'shirtless' | 'shirt' | 'suit' | 'hoodie' | 'jersey';
  accent?: number; // jersey / background accent colour
}



export class PixelBuf {
  data: Uint8ClampedArray;
  constructor(
    public w: number,
    public h: number,
  ) {
    this.data = new Uint8ClampedArray(w * h * 4);
  }
  set(x: number, y: number, c: number, a = 255): void {
    x = Math.round(x);
    y = Math.round(y);
    if (x < 0 || y < 0 || x >= this.w || y >= this.h) return;
    const i = (y * this.w + x) * 4;
    if (a < 255) {
      const t = a / 255;
      this.data[i] = this.data[i] * (1 - t) + ((c >> 16) & 255) * t;
      this.data[i + 1] = this.data[i + 1] * (1 - t) + ((c >> 8) & 255) * t;
      this.data[i + 2] = this.data[i + 2] * (1 - t) + (c & 255) * t;
      this.data[i + 3] = 255;
      return;
    }
    this.data[i] = (c >> 16) & 255;
    this.data[i + 1] = (c >> 8) & 255;
    this.data[i + 2] = c & 255;
    this.data[i + 3] = 255;
  }
  get(x: number, y: number): number {
    if (x < 0 || y < 0 || x >= this.w || y >= this.h) return -1;
    const i = (y * this.w + x) * 4;
    if (this.data[i + 3] === 0) return -1;
    return (this.data[i] << 16) | (this.data[i + 1] << 8) | this.data[i + 2];
  }
  rect(x: number, y: number, w: number, h: number, c: number): void {
    for (let j = 0; j < h; j++) for (let i = 0; i < w; i++) this.set(x + i, y + j, c);
  }
  hline(x0: number, x1: number, y: number, c: number): void {
    for (let x = x0; x <= x1; x++) this.set(x, y, c);
  }
}

// ------------------------------------------------------------------ helpers

/** 4x4 ordered-dither threshold (0..1). */
const BAYER = [0, 8, 2, 10, 12, 4, 14, 6, 3, 11, 1, 9, 15, 7, 13, 5];
const bayer = (x: number, y: number) => (BAYER[(y & 3) * 4 + (x & 3)] + 0.5) / 16;

/**
 * Pick from a ramp (dark..light). Flat cel bands like Papers, Please; only a
 * thin dithered seam where two bands meet so it doesn't look airbrushed.
 */
function ramp(cols: number[], v: number, x: number, y: number): number {
  const t = Math.max(0, Math.min(0.999, v)) * (cols.length - 1);
  const i = Math.floor(t);
  const f = t - i;
  if (f > 0.42 && f < 0.58) return (x + y) % 2 ? cols[Math.min(cols.length - 1, i + 1)] : cols[i];
  return f >= 0.5 ? cols[Math.min(cols.length - 1, i + 1)] : cols[i];
}

/** Head shapes: half-widths at crown / temple / cheek / jaw / chin (fractions of face height). */
const HEAD_SHAPES = [
  { crown: 10, temple: 13, cheek: 13, jaw: 11, chin: 5 }, // oval
  { crown: 11, temple: 13, cheek: 14, jaw: 13, chin: 7 }, // square jaw
  { crown: 10, temple: 12, cheek: 12, jaw: 9, chin: 4 }, // long / pointed
  { crown: 11, temple: 14, cheek: 15, jaw: 13, chin: 6 }, // wide / round
];

export const P = 64;
const CX = 32;

/**
 * Procedural portrait, 64x64. Papers-Please-ish: limited ramps, ordered
 * dithering for lighting (key light from the upper left), dark outlines,
 * plenty of small facial detail, and everything a fight does to a face.
 */
export function drawPortrait(inp: PortraitInput): PixelBuf {
  const b = new PixelBuf(P, P);
  const look = inp.look;
  const seed = hashString(inp.id);
  const rnd = (n: number) => (((seed >>> (n % 24)) ^ Math.imul(seed, n * 2654435761 + 7)) >>> 0) & 0xffff;
  const variant = inp.variant ?? 'plain';
  const female = inp.gender === 'W';
  const age = inp.age;
  const w = inp.wounds;
  const swell = w?.swelling ?? 0;
  const build = Math.min(3, look.build + (age > 38 ? 1 : 0));
  const grey = Math.max(0, Math.min(1, (age - 36) / 14));
  const skin = SKIN_TONES[look.skin % SKIN_TONES.length];
  const SK = [shade(skin, -0.42), shade(skin, -0.26), shade(skin, -0.12), skin, shade(skin, 0.1), shade(skin, 0.2)];
  const SKL = [shade(skin, -0.24), skin, shade(skin, 0.12)]; // flat 3-tone lighting (shadow / base / light)
  const OUT = shade(skin, -0.62);
  const hairBase = lerpColor(HAIR_COLORS[look.hairColor % HAIR_COLORS.length], 0xa8a59e, grey);
  const HR = [shade(hairBase, -0.35), shade(hairBase, -0.18), hairBase, shade(hairBase, 0.15)];
  const attire = inp.attire ?? (variant === 'reporter' ? 'suit' : variant === 'mugshot' ? 'shirt' : 'shirtless');
  const accent = inp.accent ?? (variant === 'press' ? PAL.steel : 0x3a3441);

  // ------------------------------------------------------------ background
  if (variant === 'mugshot') {
    b.rect(0, 0, P, P, 0x8d8f93);
    for (let y = 4; y < P; y += 6) {
      b.hline(0, P - 1, y, 0x74777c);
      b.hline(0, 5, y, 0x3e4045);
    }
    for (let y = 1; y < P; y += 12) b.hline(0, 9, y + 3, 0x2e3035);
    b.rect(0, 56, P, 8, 0x2b2b2e);
  } else if (variant === 'press' || variant === 'belt') {
    for (let y = 0; y < P; y++) for (let x = 0; x < P; x++) b.set(x, y, ramp([shade(accent, -0.55), shade(accent, -0.35), shade(accent, -0.15)], 1 - y / P, x, y));
    // step-and-repeat logo blocks
    for (let i = 0; i < 9; i++) {
      const lx = ((i % 3) * 24 + (Math.floor(i / 3) % 2) * 12) - 4;
      const ly = 4 + Math.floor(i / 3) * 14;
      b.rect(lx, ly, 14, 5, shade(accent, -0.05));
      b.hline(lx + 2, lx + 10, ly + 2, shade(accent, 0.25));
    }
    if (variant === 'belt') for (let i = 0; i < 14; i++) b.set(rnd(i) % P, rnd(i + 30) % 40, 0xf0d890, 160); // confetti
  } else if (variant === 'corner') {
    b.rect(0, 0, P, P, 0x1e181e);
    for (let y = 0; y < 44; y += 3) for (let x = (y / 3) % 2 ? 1 : 0; x < P; x += 3) b.set(x, y, 0x34303a); // cage mesh
    b.rect(0, 44, P, 20, 0x2a2224);
    b.rect(52, 0, 6, 44, 0x8a1e1e); // corner pad
  } else if (variant === 'reporter') {
    b.rect(0, 0, P, P, 0x34303a);
    for (let x = 0; x < P; x += 10) b.rect(x, 0, 5, P, 0x3b3642);
    b.rect(0, 0, P, 3, 0x46404e);
  } else {
    for (let y = 0; y < P; y++) for (let x = 0; x < P; x++) {
      const d = Math.hypot(x - 32, y - 26) / 46;
      b.set(x, y, ramp([shade(accent, -0.35), shade(accent, -0.18), accent], 1 - d, x, y));
    }
  }

  // ------------------------------------------------------------ geometry
  const base = HEAD_SHAPES[look.head % HEAD_SHAPES.length];
  const jw = (rnd(31) % 3) - 1; // jitter so no two faces share a skull
  const shape = { crown: base.crown + (rnd(33) % 2), temple: base.temple + jw, cheek: base.cheek + jw, jaw: base.jaw + ((rnd(35) % 3) - 1), chin: base.chin + ((rnd(37) % 3) - 1) };
  const fat = (build >= 2 ? 1 : 0) + (swell >= 2 ? 1 : 0);
  const top = 9; // crown
  const chinY = 45 + (look.head === 2 ? 1 : 0);
  const faceH = chinY - top;
  /** half-width of the head at row y (0 outside). */
  const hwAt = (y: number): number => {
    const t = (y - top) / faceH;
    if (t < 0 || t > 1) return 0;
    let hw: number;
    if (t < 0.12) hw = shape.crown * Math.sqrt(t / 0.12) * 0.9 + 2;
    else if (t < 0.32) hw = shape.crown + (shape.temple - shape.crown) * ((t - 0.12) / 0.2);
    else if (t < 0.6) hw = shape.temple + (shape.cheek - shape.temple) * ((t - 0.32) / 0.28);
    else if (t < 0.86) hw = shape.cheek + (shape.jaw - shape.cheek) * ((t - 0.6) / 0.26);
    else hw = shape.jaw + (shape.chin - shape.jaw) * ((t - 0.86) / 0.14);
    if (t > 0.55) hw += fat;
    return Math.max(1, Math.round(hw));
  };
  const inHead = (x: number, y: number) => {
    const hw = hwAt(y);
    return hw > 0 && x >= CX - hw && x < CX + hw;
  };
  const eyeY = top + Math.round(faceH * 0.46) + ((rnd(41) % 3) - 1);
  const browY = eyeY - 4 - (rnd(43) % 2);
  const noseY = eyeY + 6 + (rnd(45) % 3);
  const mouthY = Math.min(chinY - 5, noseY + 5 + (rnd(47) % 2));
  const spread = 6 + (rnd(49) % 3 === 0 ? 1 : 0) - (rnd(51) % 4 === 0 ? 1 : 0);
  const eyeL = CX - spread - 1; // left eye centre
  const eyeR = CX + spread;

  // ------------------------------------------------------------ long hair behind the head
  const hs = look.hair;
  const recede = age >= 33 && !female ? Math.min(4, Math.floor((age - 31) / 3)) : 0;
  if (hs === 5 || (female && (hs === 6 || hs === 7))) {
    const len = female ? 58 : 50;
    for (let y = top + 4; y < len; y++) {
      const hw = Math.max(hwAt(Math.min(y, chinY)), shape.temple) + 3;
      for (let x = CX - hw; x < CX + hw; x++) {
        const v = 0.35 + 0.4 * (1 - (x - (CX - hw)) / (2 * hw)) + ((x * 7 + rnd(x)) % 5 === 0 ? 0.2 : 0);
        b.set(x, y, ramp(HR, v - (y - top) / 160, x, y));
      }
    }
  }

  // ------------------------------------------------------------ shoulders, chest, attire
  const neckW = 6 + build * 2 + (female ? -1 : 0);
  const shoulderY = 52;
  for (let y = shoulderY - 4; y < P; y++) {
    // trapezius slope into shoulders
    const t = Math.min(1, (y - (shoulderY - 4)) / 8);
    const half = Math.round(neckW + (22 + build * 3 - neckW) * Math.sqrt(t));
    for (let x = CX - half; x < CX + half; x++) {
      const nx = (x - CX) / half;
      const v = 0.62 - nx * 0.28 - (y - shoulderY) / 50;
      let c: number;
      if (attire === 'shirtless') c = ramp(SKL, v, x, y);
      else if (attire === 'suit') c = ramp([0x16161c, 0x20202a, 0x2c2c38], v, x, y);
      else if (attire === 'shirt') c = ramp([0xa8a296, 0xc8c2b4, 0xe2ddd0], v, x, y);
      else if (attire === 'hoodie') c = ramp([shade(accent, -0.45), shade(accent, -0.25), accent], v, x, y);
      else c = ramp([shade(accent, -0.4), shade(accent, -0.2), accent, shade(accent, 0.15)], v, x, y); // jersey
      b.set(x, y, c);
    }
    b.set(CX - half - 1, y, 0x0c0a0c);
    b.set(CX + half, y, 0x0c0a0c);
  }
  if (attire === 'shirtless') {
    // collarbones, pecs, deltoids, chest hair
    for (let i = 0; i < 9; i++) {
      b.set(CX - 4 - i, shoulderY + 1 + (i > 5 ? 1 : 0), SK[4]);
      b.set(CX + 3 + i, shoulderY + 1 + (i > 5 ? 1 : 0), SK[4]);
      b.set(CX - 4 - i, shoulderY + 2 + (i > 5 ? 1 : 0), SK[1]);
      b.set(CX + 3 + i, shoulderY + 2 + (i > 5 ? 1 : 0), SK[1]);
    }
    b.set(CX, shoulderY + 3, SK[1]);
    for (let i = 0; i < 10; i++) {
      b.set(CX - 3 - i, 61 - Math.floor(i / 4), SK[1]);
      b.set(CX + 2 + i, 61 - Math.floor(i / 4), SK[1]);
    }
    for (let y = shoulderY + 4; y < P; y++) b.set(CX, y, SK[2]);
    if (!female && look.beard >= 3 && rnd(5) % 2) for (let i = 0; i < 18; i++) b.set(CX - 6 + (rnd(i + 40) % 12), shoulderY + 5 + (rnd(i + 60) % 8), HR[1]);
    if (female) {
      // sports bra
      for (let y = 58; y < P; y++) b.hline(CX - 14, CX + 13, y, y === 58 ? 0x121214 : 0x26262c);
      b.hline(CX - 12, CX - 8, 55, 0x26262c);
      b.hline(CX + 7, CX + 11, 55, 0x26262c);
    }
    if (look.tattoo >= 2) {
      // shoulder / chest piece
      for (let i = 0; i < 22; i++) {
        const tx = CX - 20 + (rnd(i) % 9);
        const ty = shoulderY + 1 + (rnd(i + 11) % 9);
        b.set(tx, ty, shade(skin, -0.55));
      }
    }
  } else if (attire === 'suit') {
    // shirt V, lapels, tie
    for (let y = shoulderY - 3; y < P; y++) {
      const v = Math.max(1, 6 - Math.floor((y - shoulderY + 3) / 2));
      b.hline(CX - v, CX + v - 1, y, 0xe8e3d6);
      b.set(CX - v - 1, y, 0x0e0e12);
      b.set(CX + v, y, 0x0e0e12);
    }
    for (let y = shoulderY - 1; y < P; y++) {
      const tw = y < shoulderY + 1 ? 1 : 2;
      b.hline(CX - tw, CX + tw - 1, y, inp.accent ?? PAL.blood);
    }
    b.hline(CX - 1, CX, shoulderY - 2, shade(inp.accent ?? PAL.blood, -0.3));
  } else if (attire === 'shirt') {
    for (let y = shoulderY - 3; y < shoulderY + 3; y++) {
      b.set(CX - 5 + (y - shoulderY + 3), y, 0x8a8478);
      b.set(CX + 4 - (y - shoulderY + 3), y, 0x8a8478);
    }
    for (let y = shoulderY + 3; y < P; y += 3) b.set(CX, y, 0x6a655a); // buttons
  } else if (attire === 'hoodie') {
    for (let y = shoulderY - 4; y < shoulderY + 1; y++) b.hline(CX - neckW - 3, CX + neckW + 2, y, shade(accent, -0.35)); // hood bunched
    b.rect(CX - 4, shoulderY + 2, 1, 7, 0xe0dccf);
    b.rect(CX + 3, shoulderY + 2, 1, 7, 0xe0dccf);
  } else if (attire === 'jersey') {
    b.rect(CX - 3, shoulderY + 3, 6, 6, shade(accent, 0.35));
    b.hline(CX - neckW, CX + neckW - 1, shoulderY - 3, shade(accent, 0.3));
  }
  if (variant === 'belt') {
    // championship belt slung over the shoulder
    for (let i = 0; i < 30; i++) {
      const bx = CX - 18 + i;
      const by = 63 - Math.floor(i * 0.42);
      b.set(bx, by, 0x2a1c10);
      b.set(bx, by - 1, 0x3a2614);
      b.set(bx, by - 2, 0x2a1c10);
    }
    for (let y = 50; y < 61; y++) for (let x = CX - 6; x < CX + 7; x++) {
      const d = Math.hypot(x - CX, y - 55) / 7;
      b.set(x, y, ramp([0x7a5a1c, 0xb8902e, 0xe0c060, 0xfff0b0], 1 - d + (x < CX ? 0.1 : -0.05), x, y));
    }
    b.rect(CX - 1, 53, 3, 4, PAL.blood);
    b.set(CX, 54, 0xff8080);
  }

  // ------------------------------------------------------------ neck
  for (let y = chinY - 6; y < shoulderY - 1; y++) {
    for (let x = CX - neckW; x < CX + neckW; x++) {
      const nx = (x - CX) / neckW;
      const v = 0.5 - nx * 0.3 - (y < chinY + 2 ? 0.25 : 0);
      b.set(x, y, ramp(SKL, v, x, y));
    }
    b.set(CX - neckW - 1, y, OUT);
    b.set(CX + neckW, y, OUT);
  }
  if (!female && build >= 1) for (let y = chinY + 2; y < chinY + 5; y++) b.set(CX, y + 1, SK[2]); // adam's apple
  if (look.tattoo === 1 || look.tattoo === 3) {
    for (let i = 0; i < 7; i++) b.set(CX - neckW + 1 + (i % 3), chinY + 1 + i, shade(skin, -0.58));
  }

  // ------------------------------------------------------------ ears (cauliflower grows with damage)
  const cauli = Math.min(3, look.ears + Math.floor((inp.damage ?? 0) / 40));
  const earTop = eyeY - 3;
  for (const side of [-1, 1]) {
    const hw = hwAt(earTop + 3);
    const ex = side < 0 ? CX - hw - 1 : CX + hw;
    const eh = 9 + (cauli >= 2 ? 1 : 0);
    for (let j = 0; j < eh; j++) {
      const wdt = j === 0 || j === eh - 1 ? 2 : 3 + (cauli >= 1 ? 1 : 0) + (cauli >= 3 && j > 2 && j < eh - 2 ? 1 : 0);
      for (let k = 0; k < wdt; k++) {
        const x = ex + side * k;
        const lumpy = cauli >= 2 && (j + k) % 3 === 0;
        b.set(x, earTop + j, k === wdt - 1 ? OUT : lumpy ? SK[1] : k === 1 && j > 2 && j < eh - 2 ? SK[1] : SK[side < 0 ? 3 : 2]);
      }
    }
  }

  // ------------------------------------------------------------ head (lit from upper left)
  for (let y = top; y <= chinY; y++) {
    const hw = hwAt(y);
    for (let x = CX - hw; x < CX + hw; x++) {
      const nx = (x - CX + 0.5) / hw; // -1..1
      const ny = (y - top) / faceH; // 0..1
      let v = 0.66 - nx * 0.3 - Math.max(0, ny - 0.75) * 0.9 - Math.abs(nx) ** 3 * 0.35;
      // cheekbone highlight & under-cheek hollow
      if (ny > 0.5 && ny < 0.58 && Math.abs(nx) > 0.45 && Math.abs(nx) < 0.8) v += 0.12;
      if (ny > 0.64 && ny < 0.74 && Math.abs(nx) > 0.5) v -= 0.12;
      b.set(x, y, ramp(SKL, v, x, y));
    }
    b.set(CX - hw - 1, y, OUT);
    b.set(CX + hw, y, OUT);
  }
  b.hline(CX - hwAt(chinY) - 1, CX + hwAt(chinY), chinY + 1, OUT);
  for (let x = CX - hwAt(top); x < CX + hwAt(top); x++) b.set(x, top - 1, OUT);
  // jaw shadow onto the neck
  for (let x = CX - neckW; x < CX + neckW; x++) b.set(x, chinY + 1, SK[0]);

  // ------------------------------------------------------------ hair (front)
  /** Hair cap: the head silhouette pushed up by `vol` px, down to a hairline `rows` below the crown. */
  const capRows = (rows: number, rec = recede, vol = 3, sideburns = true, pattern = 0) => {
    for (let y = top - vol; y < browY + 1; y++) {
      const outer = hwAt(Math.min(chinY, Math.max(top, y + vol))) + 1;
      const inner = hwAt(Math.max(top, y));
      for (let x = CX - outer; x < CX + outer; x++) {
        const dx = Math.abs(x - CX + 0.5);
        const r = y - top;
        let hairline = rows - (dx < 3 + rec * 2 ? rec * 2 : 0) - (dx > inner - 4 ? -2 : 0);
        if (look.widow) hairline += dx < 1.5 ? 4 : dx < 3 ? 2 : dx < 7 ? -2 : 0; // sharp widow's peak, deep temples
        if (sideburns && dx > inner - 3 && y < eyeY - 2) hairline = 99; // temples & sideburns
        if (r >= hairline) continue;
        if (y >= top && r >= rows && !(sideburns && dx > inner - 3)) continue;
        if (pattern === 1 && (x + y) % 2 === 1 && y > top) continue; // buzz fuzz
        const nx = (x - CX) / outer;
        const strand = ((x * 7 + Math.floor(y / 2) * 3 + (rnd(x & 15) & 3)) % 6 === 0) ? 0.12 : 0;
        b.set(x, y, ramp(HR, 0.5 - nx * 0.3 + strand - (y - (top - vol)) / 120, x, y));
      }
      // dark outline on the hair silhouette above the head
      if (y < top) {
        b.set(CX - outer - 1, y, shade(HR[0], -0.4));
        b.set(CX + outer, y, shade(HR[0], -0.4));
      }
    }
    // crown outline
    for (let x = CX - hwAt(top + 1) - 1; x <= CX + hwAt(top + 1); x++) if (b.get(x, top - vol - 1) !== -1) b.set(x, top - vol - 1, shade(HR[0], -0.4));
  };
  switch (hs) {
    case 0: // bald: shine + stubble shadow
      b.set(CX - 6, top + 2, SK[5]);
      b.set(CX - 5, top + 2, SK[5]);
      b.set(CX - 7, top + 3, SK[5]);
      b.set(CX - 6, top + 3, SK[4]);
      break;
    case 1: // buzz cut: dithered fuzz
      capRows(6, Math.floor(recede / 2), 1, true, 1);
      break;
    case 2: // short
      capRows(7);
      break;
    case 3: // swept / quiff
      capRows(7, recede, 4);
      for (let x = CX - 9; x < CX + 8; x++) for (let y = top - 4; y < top - 1; y++) if (y > top - 4 || x > CX - 5) b.set(x, y, ramp(HR, 0.6 - (x - CX) / 20, x, y));
      for (let y = top; y < top + 5; y++) b.set(CX + 7 + Math.floor((y - top) / 2), y, HR[1]);
      break;
    case 4: // mohawk
      for (let y = top - 9; y < top + 8; y++) for (let x = CX - 3; x < CX + 3; x++) b.set(x, y, ramp(HR, 0.7 - (x - CX + 3) / 8 + ((x + y) % 4 === 0 ? 0.2 : 0), x, y));
      for (let y = top - 9; y < top + 8; y++) {
        b.set(CX - 4, y, shade(HR[0], -0.4));
        b.set(CX + 3, y, shade(HR[0], -0.4));
      }
      for (let y = top; y < top + 6; y++) for (let x = CX - hwAt(y); x < CX + hwAt(y); x++) if (Math.abs(x - CX) > 3 && (x + y) % 3 === 0) b.set(x, y, HR[0]);
      break;
    case 5: // long
      capRows(8, female ? 0 : recede, 3);
      for (let y = top + 6; y < top + 26; y++) {
        const hw = hwAt(Math.min(chinY, y));
        b.set(CX - hw, y, HR[1]);
        b.set(CX - hw + 1, y, HR[2]);
        b.set(CX + hw - 1, y, HR[1]);
        if (female) {
          b.set(CX - hw + 2, y, HR[2]);
          b.set(CX + hw - 2, y, HR[1]);
        }
      }
      break;
    case 6: // braids / cornrows
      for (let y = top - 2; y < top + 8; y++) {
        const hw = hwAt(Math.min(chinY, Math.max(top, y + 2))) + 1;
        for (let x = CX - hw; x < CX + hw; x++) {
          const lane = (x - CX + 32) % 4;
          if (lane === 0) continue;
          b.set(x, y, (y + (lane === 2 ? 1 : 0)) % 2 ? HR[2] : HR[1]);
        }
      }
      if (female) for (let y = top + 6; y < 60; y++) b.set(CX + hwAt(Math.min(y, chinY)) + 1, y, y % 2 ? HR[2] : HR[0]);
      break;
    case 7: // man bun / ponytail
      capRows(6, 0, 2);
      for (let y = top - 7; y < top - 1; y++) for (let x = CX - 3; x < CX + 4; x++) if (Math.hypot(x - CX, y - (top - 4)) < 3.6) b.set(x, y, ramp(HR, 0.6 - (x - CX) / 8, x, y));
      break;
  }
  // grey temples on older men
  if (grey > 0.3 && hs !== 0) for (let y = eyeY - 6; y < eyeY; y++) {
    b.set(CX - hwAt(y), y, 0xb8b5ae);
    b.set(CX + hwAt(y) - 1, y, 0xb8b5ae);
  }

  // ------------------------------------------------------------ brows
  const browC = grey > 0.5 ? 0x9a978f : shade(hairBase, -0.15);
  const thick = look.brows === 2 ? 2 : 1;
  const angry = variant === 'mugshot' || look.brows === 2;
  for (const [cx, dir] of [[eyeL, -1], [eyeR, 1]] as const) {
    for (let i = -3; i <= 3; i++) {
      const tilt = angry ? Math.round((i * dir) / 3) : i * dir > 2 ? 1 : 0;
      for (let t = 0; t < thick; t++) b.set(cx + i, browY + tilt + t, browC);
    }
    if (female) b.set(cx + 4 * dir, browY + 1, browC);
  }
  // brow ridge shadow
  for (let i = -3; i <= 3; i++) {
    b.set(eyeL + i, browY + thick + 1, SK[2]);
    b.set(eyeR + i, browY + thick + 1, SK[2]);
  }

  // ------------------------------------------------------------ eyes
  const IRIS = [0x3a2a1c, 0x4a3420, 0x2c4a6a, 0x3a5a3a, 0x5a4428][rnd(3) % 5];
  const drawEye = (cx: number, shut: boolean, squint: boolean) => {
    // socket shadow
    for (let i = -3; i <= 3; i++) b.set(cx + i, eyeY - 2, SK[1]);
    if (shut) {
      for (let i = -3; i <= 3; i++) b.set(cx + i, eyeY, OUT);
      b.set(cx - 3, eyeY - 1, SK[1]);
      return;
    }
    // sclera
    for (let i = -2; i <= 2; i++) b.set(cx + i, eyeY, 0xe8e2d6);
    if (!squint) for (let i = -1; i <= 1; i++) b.set(cx + i, eyeY - 1, 0xe8e2d6);
    // iris + pupil + glint
    b.set(cx, eyeY, IRIS);
    b.set(cx + 1, eyeY, IRIS);
    if (!squint) b.set(cx, eyeY - 1, IRIS);
    b.set(cx, eyeY, 0x0e0a08);
    if (!squint) b.set(cx + 1, eyeY - 1, 0xffffff);
    // lids
    for (let i = -3; i <= 3; i++) b.set(cx + i, eyeY - (squint ? 1 : 2), OUT);
    b.set(cx - 3, eyeY, OUT);
    b.set(cx + 3, eyeY, SK[1]);
    for (let i = -2; i <= 2; i++) b.set(cx + i, eyeY + 1, SK[1]);
    if (female) {
      b.set(cx - 4, eyeY - 2, OUT);
      b.set(cx + 4, eyeY - 2, OUT);
    }
  };
  const tired = variant === 'corner';
  drawEye(eyeL, false, look.eyes === 1 || tired);
  drawEye(eyeR, swell >= 3, look.eyes === 1 || tired);
  if (look.eyes === 2) {
    // heavy-lidded / sleepy
    for (let i = -2; i <= 2; i++) {
      b.set(eyeL + i, eyeY - 1, SK[2]);
      b.set(eyeR + i, eyeY - 1, SK[2]);
    }
  }
  // under-eye bags with age
  if (age > 34) for (let i = -2; i <= 2; i++) {
    b.set(eyeL + i, eyeY + 2, SK[2]);
    b.set(eyeR + i, eyeY + 2, SK[2]);
  }
  // crow's feet, forehead lines
  if (age > 38) {
    b.set(eyeL - 5, eyeY - 1, SK[1]);
    b.set(eyeL - 5, eyeY + 1, SK[1]);
    b.set(eyeR + 5, eyeY - 1, SK[1]);
    b.set(eyeR + 5, eyeY + 1, SK[1]);
  }
  if (age > 42 && hs !== 4) for (let i = -6; i <= 6; i++) if (i % 4) b.set(CX + i, browY - 4 - (Math.abs(i) > 3 ? 1 : 0), SK[2]);

  // ------------------------------------------------------------ nose
  const broken = look.nose === 2 || (inp.damage ?? 0) > 85;
  const nx0 = CX - 1 + (broken ? 1 : 0);
  for (let y = browY + 3; y < noseY; y++) {
    const kink = broken && y > browY + 5 ? 1 : 0;
    b.set(nx0 + kink - 1, y, SK[2]); // bridge shadow side
    b.set(nx0 + kink, y, SK[4]); // bridge highlight
  }
  const wide = look.nose === 1 ? 1 : 0;
  for (let i = -2 - wide; i <= 2 + wide; i++) b.set(nx0 + i, noseY, i < 0 ? SK[2] : SK[3]);
  b.set(nx0 - 2 - wide, noseY + 1, SK[1]);
  b.set(nx0 + 2 + wide, noseY + 1, SK[1]);
  b.set(nx0 - 1, noseY + 1, OUT); // nostrils
  b.set(nx0 + 1, noseY + 1, OUT);
  b.set(nx0 + 1, noseY - 1, SK[5]); // tip glint
  for (let i = -2 - wide; i <= 2 + wide; i++) b.set(nx0 + i, noseY + 2, SK[2]); // under-nose shadow
  // nasolabial folds (deepen with age)
  const fold = age > 30 ? 2 : 1;
  for (let i = 0; i < 3 + fold; i++) {
    b.set(nx0 - 4 - wide - Math.floor(i / 2), noseY + 1 + i, SK[2 - (age > 40 ? 1 : 0)]);
    b.set(nx0 + 4 + wide + Math.floor(i / 2), noseY + 1 + i, SK[2 - (age > 40 ? 1 : 0)]);
  }

  // ------------------------------------------------------------ mouth & expression
  const lipD = lerpColor(shade(skin, -0.35), 0x8a3a3a, female ? 0.45 : 0.18);
  const lipL = lerpColor(shade(skin, -0.05), 0xb05a5a, female ? 0.35 : 0.1);
  const mw = (female ? 4 : 4 + (build >= 2 ? 1 : 0)) + (rnd(53) % 3 === 0 ? 1 : 0) - (rnd(55) % 4 === 0 ? 1 : 0);
  const expr = variant === 'mugshot' ? 'frown' : variant === 'corner' ? 'open' : variant === 'belt' ? 'grin' : variant === 'press' ? (rnd(9) % 2 ? 'smirk' : 'flat') : 'flat';
  for (let i = -mw; i <= mw; i++) {
    let dy = 0;
    if (expr === 'frown' && Math.abs(i) >= mw - 1) dy = 1;
    if ((expr === 'grin' || expr === 'smirk') && (expr === 'grin' ? Math.abs(i) >= mw - 1 : i >= mw - 1)) dy = -1;
    b.set(CX + i, mouthY + dy, OUT);
    if (Math.abs(i) < mw) b.set(CX + i, mouthY - 1 + dy, lipD); // upper lip
    if (Math.abs(i) < mw - 1) b.set(CX + i, mouthY + 1, lipL); // lower lip
  }
  if (expr === 'open') {
    for (let i = -2; i <= 2; i++) b.set(CX + i, mouthY + 1, 0x2a0e10);
    b.hline(CX - 1, CX + 1, mouthY + 2, 0x2a0e10);
  }
  if (expr === 'grin') for (let i = -mw + 2; i <= mw - 2; i++) b.set(CX + i, mouthY + 1, 0xeee8dc); // teeth
  // chin dimple / shadow
  b.hline(CX - 2, CX + 1, mouthY + 3, SK[2]);
  if (look.head === 1) b.set(CX, chinY - 2, SK[1]);

  // ------------------------------------------------------------ beard & stubble
  const beardC = lerpColor(hairBase, 0xa8a59e, grey * 0.8);
  const BR = [shade(beardC, -0.35), shade(beardC, -0.12), beardC];
  const jawRows = (from: number, fn: (x: number, y: number) => void) => {
    for (let y = from; y <= chinY; y++) for (let x = CX - hwAt(y); x < CX + hwAt(y); x++) fn(x, y);
  };
  if (!female) {
    if (look.beard === 1) {
      jawRows(noseY + 2, (x, y) => {
        if (Math.abs(x - CX) < mw + 1 && Math.abs(y - mouthY) <= 1) return;
        if ((x * 3 + y * 7) % 4 === 0) b.set(x, y, shade(b.get(x, y) < 0 ? skin : b.get(x, y), -0.3));
      });
    } else if (look.beard === 2) {
      // goatee + moustache
      for (let i = -mw; i <= mw; i++) b.set(CX + i, mouthY - 2, BR[1]);
      jawRows(mouthY + 2, (x, y) => {
        const half = Math.max(1, 4 - Math.floor((y - mouthY - 2) / 2));
        if (Math.abs(x - CX + 0.5) <= half) b.set(x, y, ramp(BR, 0.55 - (x - CX) / 10 + ((x + y) % 3 === 0 ? 0.2 : 0), x, y));
      });
      for (let y = mouthY; y <= mouthY + 1; y++) {
        b.set(CX - mw - 1, y, BR[1]);
        b.set(CX + mw, y, BR[1]);
      }
    } else if (look.beard === 3) {
      // full beard
      jawRows(eyeY + 4, (x, y) => {
        const rel = (x - CX) / hwAt(y);
        const side = Math.abs(rel) > 0.62 || y > mouthY - 3;
        if (!side) return;
        if (Math.abs(x - CX) <= mw && Math.abs(y - mouthY) <= 1) return;
        b.set(x, y, ramp(BR, 0.55 - rel * 0.25 + ((x * 5 + y * 3) % 4 === 0 ? 0.25 : 0), x, y));
      });
      for (let i = -mw - 1; i <= mw + 1; i++) b.set(CX + i, mouthY - 2, BR[1]);
      for (let y = chinY + 1; y < chinY + 4; y++) for (let x = CX - 6 + (y - chinY); x < CX + 6 - (y - chinY); x++) b.set(x, y, BR[(x + y) % 2]);
    } else if (look.beard === 4) {
      // moustache (handlebar if the seed says so)
      for (let i = -mw - 1; i <= mw + 1; i++) {
        b.set(CX + i, mouthY - 2, BR[2]);
        b.set(CX + i, mouthY - 1, BR[1]);
      }
      if (rnd(4) % 2) {
        b.set(CX - mw - 2, mouthY, BR[1]);
        b.set(CX + mw + 2, mouthY, BR[1]);
        b.set(CX - mw - 2, mouthY + 1, BR[0]);
        b.set(CX + mw + 2, mouthY + 1, BR[0]);
      }
    }
  }

  // ------------------------------------------------------------ scars, face tattoos, freckles
  if (look.scar >= 1) for (let i = 0; i < 3; i++) b.set(eyeR + 2 + i, browY - 1 + i, SK[5]);
  if (look.scar >= 2) for (let i = 0; i < 4; i++) b.set(eyeL - 1, browY - 2 + i, lerpColor(SK[4], 0xc98a7a, 0.5));
  if (look.scar >= 3) for (let i = 0; i < 7; i++) b.set(eyeL - 4 + i, eyeY + 4 + Math.floor(i / 2), lerpColor(SK[3], 0xb07a6c, 0.6));
  if (look.tattoo === 3) {
    // teardrop / face ink
    b.set(eyeR + 3, eyeY + 3, shade(skin, -0.65));
    b.set(eyeR + 3, eyeY + 4, shade(skin, -0.65));
    b.set(eyeR + 2, eyeY + 4, shade(skin, -0.5));
  }
  if (look.skin <= 1 && rnd(12) % 3 === 0) for (let i = 0; i < 8; i++) b.set(CX - 8 + (rnd(i + 70) % 16), noseY - 2 + (rnd(i + 80) % 3), shade(skin, -0.2)); // freckles

  // ------------------------------------------------------------ fight damage
  if (w) {
    const BRUISE = [lerpColor(skin, 0x2a1838, 0.6), lerpColor(skin, 0x4a2848, 0.45), lerpColor(skin, 0x8a5a6a, 0.3)];
    if (w.blackEye >= 1) {
      const eyes = w.blackEye >= 2 ? [eyeL, eyeR] : [eyeL];
      for (const cx of eyes) {
        for (let y = eyeY - 3; y <= eyeY + 3; y++) for (let x = cx - 4; x <= cx + 4; x++) {
          const d = Math.hypot((x - cx) / 4.4, (y - eyeY - 0.5) / 3.4);
          if (d > 1) continue;
          const cur = b.get(x, y);
          if (cur === 0xe8e2d6 || cur === IRIS || cur === 0x0e0a08 || cur === 0xffffff) continue;
          b.set(x, y, ramp(BRUISE, d, x, y));
        }
      }
    }
    if (swell >= 1) {
      // puffy cheekbone / brow
      for (let y = eyeY + 2; y < eyeY + 6; y++) for (let x = eyeR + 1; x < eyeR + 6; x++) if (Math.hypot(x - eyeR - 3, y - eyeY - 3.5) < 2.6) b.set(x, y, lerpColor(SK[4], 0xc07070, 0.3));
      if (swell >= 2) {
        for (let x = eyeL - 3; x <= eyeL + 3; x++) b.set(x, browY - 1, lerpColor(SK[4], 0xb06070, 0.35));
        b.set(CX + hwAt(eyeY + 4), eyeY + 4, OUT); // cheek bulges past the outline
      }
      if (swell >= 3) for (let x = eyeR - 3; x <= eyeR + 3; x++) b.set(x, eyeY - 1, lerpColor(skin, 0x7a3a50, 0.55));
    }
    if (w.noseBleed) {
      b.set(nx0 - 1, noseY + 2, 0x9c1f1f);
      b.set(nx0 - 1, noseY + 3, 0x8e1c1c);
      b.set(nx0 + 1, noseY + 2, 0xb02828);
      b.set(nx0 - 1, mouthY - 1, 0x8e1c1c);
      b.set(nx0 - 2, mouthY + 2, 0x7a1414);
      b.set(nx0 - 2, mouthY + 4, 0x7a1414);
    }
    const CUT = [0x6a0e14, 0xa01c24, 0xd03a3a];
    const cut = (x: number, y: number, len: number, drip: number) => {
      for (let i = 0; i < len; i++) {
        b.set(x + i, y - Math.floor(i / 2), CUT[1]);
        b.set(x + i, y - Math.floor(i / 2) + 1, CUT[0]);
      }
      b.set(x, y - 1, CUT[2]);
      for (let d = 0; d < drip; d++) b.set(x + 1, y + 2 + d, d % 2 ? CUT[0] : CUT[1]);
    };
    if (w.cuts >= 1) cut(eyeR + 1, browY, 4, 4);
    if (w.cuts >= 2) cut(eyeL - 3, browY - 1, 3, 3);
    if (w.cuts >= 3) cut(CX - 2, top + 5, 5, 6);
    // bandages: butterfly strips, gauze with an X of tape, stitches
    const BAND = [0xc8b48c, 0xe6d8b8, 0xf4ecd8];
    if (w.bandages >= 1) {
      for (let i = 0; i < 5; i++) {
        b.set(eyeR + i, browY - 1 - Math.floor(i / 3), BAND[1]);
        b.set(eyeR + i, browY - Math.floor(i / 3), BAND[0]);
      }
      b.set(eyeR + 1, browY + 1, 0x2a2a2a); // stitch
      b.set(eyeR + 3, browY, 0x2a2a2a);
    }
    if (w.bandages >= 2) for (let i = 0; i < 4; i++) {
      b.set(eyeL - 4 + i, browY - 2, BAND[2]);
      b.set(eyeL - 4 + i, browY - 1, BAND[0]);
    }
    if (w.bandages >= 3) {
      for (let y = top + 3; y < top + 8; y++) for (let x = CX - 5; x < CX + 5; x++) b.set(x, y, ramp(BAND, 0.8 - (x - CX + 5) / 14, x, y));
      for (let i = 0; i < 10; i++) {
        b.set(CX - 5 + i, top + 3 + Math.floor(i / 2), 0xb8a888);
        b.set(CX + 4 - i, top + 3 + Math.floor(i / 2), 0xb8a888);
      }
      b.set(CX, top + 5, 0xb04040); // seep
    }
  }
  if (variant === 'corner') {
    // sweat beads + vaseline sheen
    for (let i = 0; i < 6; i++) b.set(CX - 10 + (rnd(i + 90) % 20), top + 4 + (rnd(i + 99) % 18), 0xd8ecff);
    for (let x = eyeL - 3; x <= eyeR + 3; x++) if (x % 2) b.set(x, browY - 2, SK[5]);
  }

  // ------------------------------------------------------------ accessories
  if (look.glasses === 1) {
    // dark shades
    for (const cx of [eyeL, eyeR]) for (let y = eyeY - 2; y <= eyeY + 2; y++) for (let x = cx - 4; x <= cx + 3; x++) {
      const edge = y === eyeY - 2;
      b.set(x, y, edge ? 0x050505 : (x + y) % 5 === 0 ? 0x3a3a4a : 0x101014);
    }
    b.hline(eyeL + 4, eyeR - 5, eyeY - 1, 0x050505);
    b.set(eyeL - 2, eyeY - 1, 0x5a5a6a);
    b.set(eyeR - 2, eyeY - 1, 0x5a5a6a);
  } else if (look.glasses === 2) {
    for (const cx of [eyeL, eyeR]) {
      b.hline(cx - 4, cx + 3, eyeY - 3, 0x1a1a1a);
      b.hline(cx - 4, cx + 3, eyeY + 2, 0x1a1a1a);
      for (let y = eyeY - 3; y <= eyeY + 2; y++) {
        b.set(cx - 4, y, 0x1a1a1a);
        b.set(cx + 3, y, 0x1a1a1a);
      }
    }
    b.hline(eyeL + 4, eyeR - 5, eyeY - 2, 0x1a1a1a);
  }
  if ((variant === 'press' || variant === 'belt') && !female && rnd(21) % 4 === 0) {
    // gold chain
    for (let i = -9; i <= 9; i++) b.set(CX + i, shoulderY + 3 + Math.round((i * i) / 20), (i % 2 ? 0xe0c060 : 0xa8862a));
  }
  if (female && rnd(23) % 3 === 0) {
    // stud earrings
    b.set(CX - hwAt(earTop + 6) - 2, earTop + 8, 0xe8e0c0);
    b.set(CX + hwAt(earTop + 6) + 1, earTop + 8, 0xe8e0c0);
  }
  return b;
}

/** Box-filter a portrait down by 2x (keeps it crisp-ish for small slots). */
export function halfSize(src: PixelBuf): PixelBuf {
  const out = new PixelBuf(src.w >> 1, src.h >> 1);
  for (let y = 0; y < out.h; y++) for (let x = 0; x < out.w; x++) {
    let r = 0, g = 0, bl = 0, n = 0;
    for (let dy = 0; dy < 2; dy++) for (let dx = 0; dx < 2; dx++) {
      const c = src.get(x * 2 + dx, y * 2 + dy);
      if (c < 0) continue;
      r += (c >> 16) & 255;
      g += (c >> 8) & 255;
      bl += c & 255;
      n++;
    }
    if (n) out.set(x, y, (Math.round(r / n) << 16) | (Math.round(g / n) << 8) | Math.round(bl / n));
  }
  return out;
}

/** Simple squiggly signature from a seed (doc fields 'sig:12345'). */
export function drawSignature(seedStr: string, w = 40, h = 10): PixelBuf {
  const b = new PixelBuf(w, h);
  const seed = hashString(seedStr);
  let y = h / 2;
  let s = seed;
  const ink = 0x1b2a6a;
  for (let x = 1; x < w - 1; x++) {
    s = (s * 1103515245 + 12345) & 0x7fffffff;
    const dy = ((s >> 8) % 5) - 2;
    y = Math.max(1, Math.min(h - 2, y + dy * 0.8));
    b.set(x, Math.round(y), ink);
    if (((s >> 4) & 7) === 0) b.set(x, Math.round(y) - 1, ink);
    if (x < 8 && ((s >> 3) & 3) === 0) b.set(x, Math.round(y) + 1, ink);
  }
  // loop flourish
  const lx = 4 + (seed % 6);
  for (let i = 0; i < 4; i++) b.set(lx + i, 1 + (i % 2), ink);
  return b;
}

/** Barcode pattern for lab printouts. */
export function drawBarcode(seedStr: string, w = 40, h = 8): PixelBuf {
  const b = new PixelBuf(w, h);
  let s = hashString(seedStr);
  for (let x = 0; x < w; x++) {
    s = (s * 1103515245 + 12345) & 0x7fffffff;
    if ((s >> 7) % 3 !== 0) for (let y = 0; y < h; y++) b.set(x, y, 0x111111);
  }
  return b;
}
