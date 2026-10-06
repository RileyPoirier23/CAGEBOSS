/**
 * Procedural pixel portraits. Drawn on a 32x32 grid into an RGBA buffer
 * (pure, testable), then upscaled for 64x64 display or cropped to 24x24.
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

export const P = 32;

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

/** Head outline: half-width per row for each head shape (rows 0..17 from top of head). */
const HEADS: number[][] = [
  [3, 5, 6, 6, 7, 7, 7, 7, 7, 7, 7, 7, 6, 6, 5, 5, 4, 3], // oval
  [4, 6, 7, 7, 7, 7, 7, 7, 7, 7, 7, 7, 7, 7, 6, 6, 5, 4], // square jaw
  [3, 5, 6, 7, 7, 7, 7, 7, 7, 6, 6, 6, 5, 5, 4, 4, 3, 2], // long / pointed chin
  [4, 6, 7, 7, 8, 8, 8, 8, 8, 8, 8, 7, 7, 7, 6, 6, 5, 4], // wide / round
];

export function drawPortrait(inp: PortraitInput): PixelBuf {
  const b = new PixelBuf(P, P);
  const look = inp.look;
  const seed = hashString(inp.id);
  const rnd = (n: number) => ((seed >>> (n % 24)) ^ (seed * (n + 7))) & 0xffff;
  const skin = SKIN_TONES[look.skin % SKIN_TONES.length];
  const skinD = shade(skin, -0.18);
  const skinDD = shade(skin, -0.35);
  const skinL = shade(skin, 0.12);
  const age = inp.age;
  const grey = Math.max(0, Math.min(1, (age - 36) / 14));
  const hairC = lerpColor(HAIR_COLORS[look.hairColor % HAIR_COLORS.length], 0x9a9790, grey);
  const variant = inp.variant ?? 'plain';
  const w = inp.wounds;
  const swell = w?.swelling ?? 0;
  const build = look.build + (age > 38 ? 1 : 0);

  // ------------------------------------------------ background
  if (variant === 'mugshot') {
    b.rect(0, 0, P, P, 0x8d8f93);
    for (let y = 2; y < P; y += 4) b.hline(0, P - 1, y, 0x6b6e73);
    for (let y = 2; y < P; y += 8) b.hline(0, 3, y + 1, 0x3e4045);
    b.rect(0, 26, P, 6, 0x2b2b2e);
  } else if (variant === 'press') {
    for (let y = 0; y < P; y++) b.hline(0, P - 1, y, lerpColor(inp.accent ?? PAL.steel, PAL.ink, y / P));
    for (let i = 0; i < 6; i++) b.set(3 + (rnd(i) % 26), 2 + (rnd(i + 9) % 10), PAL.bone, 120);
  } else if (variant === 'corner') {
    b.rect(0, 0, P, P, 0x2a2228);
    b.rect(0, 20, P, 12, 0x3a2f2a);
  } else if (variant === 'reporter') {
    b.rect(0, 0, P, P, 0x3b3640);
    for (let x = 0; x < P; x += 6) b.rect(x, 0, 3, P, 0x413b46);
  } else {
    const bg = inp.accent ?? 0x3a3441;
    b.rect(0, 0, P, P, bg);
    b.rect(0, 0, P, 2, shade(bg, 0.08));
  }

  // ------------------------------------------------ shoulders / torso
  const attire = inp.attire ?? (variant === 'reporter' ? 'suit' : variant === 'mugshot' ? 'shirt' : 'shirtless');
  const sw = 10 + build * 2;
  for (let y = 25; y < P; y++) {
    const half = Math.min(15, sw + (y - 25));
    for (let x = 16 - half; x < 16 + half; x++) {
      let c = skin;
      if (attire === 'shirt') c = 0xd9d4c4;
      if (attire === 'hoodie') c = inp.accent ?? 0x4a4f5a;
      if (attire === 'jersey') c = inp.accent ?? PAL.blood;
      if (attire === 'suit') c = 0x2a2a32;
      if (attire === 'shirtless' && (x === 16 - half || x === 16 + half - 1)) c = skinD;
      b.set(x, y, c);
    }
  }
  if (attire === 'suit') {
    for (let y = 25; y < P; y++) {
      b.set(15, y, 0xe8e3d6);
      b.set(16, y, 0xe8e3d6);
    }
    for (let y = 26; y < P; y++) b.set(16, y, inp.accent ?? PAL.blood); // tie
  }
  if (attire === 'shirtless') {
    // pecs line
    b.hline(10, 14, 29, skinD);
    b.hline(18, 22, 29, skinD);
    if (look.tattoo >= 2) for (let i = 0; i < 5; i++) b.set(8 + (rnd(i) % 4), 26 + (rnd(i + 3) % 5), shade(skin, -0.5));
  }
  if (variant === 'belt') {
    b.rect(4, 27, 24, 3, PAL.gold);
    b.rect(13, 26, 6, 5, shade(PAL.gold, 0.2));
    b.set(15, 28, PAL.blood);
    b.set(16, 28, PAL.blood);
  }

  // ------------------------------------------------ neck
  const neckW = 3 + build;
  for (let y = 21; y < 26; y++) for (let x = 16 - neckW; x < 16 + neckW; x++) b.set(x, y, y === 21 ? skinDD : skinD);
  if (look.tattoo === 1 || look.tattoo === 3) {
    b.set(16 - neckW + 1, 23, shade(skin, -0.55));
    b.set(16 - neckW + 2, 24, shade(skin, -0.55));
    b.set(16 - neckW + 1, 25, shade(skin, -0.55));
  }

  // ------------------------------------------------ head
  const shape = HEADS[look.head % HEADS.length];
  const top = 5;
  const extra = (build >= 2 ? 1 : 0) + (swell >= 2 ? 1 : 0);
  for (let r = 0; r < shape.length; r++) {
    const hw = shape[r] + (r > 9 ? extra : 0);
    const y = top + r;
    for (let x = 16 - hw; x < 16 + hw; x++) {
      const edge = x === 16 - hw || x === 16 + hw - 1;
      b.set(x, y, edge ? skinD : skin);
    }
  }
  // cheek shading / jowls
  for (let r = 11; r < 16; r++) {
    const hw = shape[r] + extra;
    b.set(16 - hw + 1, top + r, skinD);
    b.set(16 + hw - 2, top + r, skinD);
  }

  // ------------------------------------------------ ears (cauliflower grows with damage)
  const cauli = Math.min(3, look.ears + Math.floor((inp.damage ?? 0) / 40));
  const earY = top + 7;
  const hwEar = shape[7] + extra;
  for (const side of [-1, 1]) {
    const ex = side < 0 ? 16 - hwEar - 1 : 16 + hwEar;
    const h = 4 + (cauli >= 2 ? 1 : 0);
    for (let j = 0; j < h; j++) {
      b.set(ex, earY + j, skinD);
      if (cauli >= 1) b.set(ex + side, earY + j, j % 2 ? skinDD : skinD);
      if (cauli >= 3 && j > 0 && j < h - 1) b.set(ex + side * 2, earY + j, skinDD);
    }
  }

  // ------------------------------------------------ hair
  const recede = age >= 33 && inp.gender === 'M' ? Math.min(3, Math.floor((age - 31) / 4)) : 0;
  const hairTop = (r: number) => shape[r];
  const hairStyle = look.hair;
  const drawCap = (rows: number, startRow = 0) => {
    for (let r = startRow; r < rows; r++) {
      const hw = hairTop(r);
      for (let x = 16 - hw; x < 16 + hw; x++) {
        if (r >= rows - 1 - recede && Math.abs(x - 16) < 3 + recede) continue;
        b.set(x, top + r, r === 0 ? shade(hairC, 0.1) : hairC);
      }
    }
  };
  switch (hairStyle) {
    case 0: // bald: shine
      b.set(13, top + 1, skinL);
      b.set(14, top + 1, skinL);
      b.set(12, top + 2, skinL);
      break;
    case 1: // buzz
      for (let r = 0; r < 3; r++) {
        const hw = hairTop(r);
        for (let x = 16 - hw; x < 16 + hw; x++) if ((x + r) % 2 === 0 || r === 0) b.set(x, top + r, shade(hairC, 0.15));
      }
      break;
    case 2: // short
      drawCap(4);
      break;
    case 3: // swept
      drawCap(4);
      for (let x = 10; x < 20; x++) b.set(x, top - 1, hairC);
      b.set(20, top, hairC);
      break;
    case 4: // mohawk
      for (let y = top - 3; y < top + 4; y++) for (let x = 14; x < 18; x++) b.set(x, y, hairC);
      break;
    case 5: // long
      drawCap(4);
      for (let y = top + 3; y < top + 16; y++) {
        b.set(16 - shape[6] - 1, y, hairC);
        b.set(16 + shape[6], y, hairC);
        if (inp.gender === 'W') {
          b.set(16 - shape[6] - 2, y, hairC);
          b.set(16 + shape[6] + 1, y, hairC);
        }
      }
      break;
    case 6: // braids / cornrows
      for (let r = 0; r < 5; r++) {
        const hw = hairTop(r);
        for (let x = 16 - hw; x < 16 + hw; x++) if (x % 2 === 0) b.set(x, top + r, hairC);
      }
      if (inp.gender === 'W') for (let y = top + 4; y < top + 18; y++) b.set(16 + shape[6] + 1, y, y % 2 ? hairC : shade(hairC, 0.15));
      break;
    case 7: // bun / ponytail
      drawCap(3);
      b.rect(14, top - 3, 4, 3, hairC);
      if (inp.gender === 'W') for (let y = top + 2; y < top + 12; y++) b.set(16 + shape[4] + 1, y, hairC);
      break;
  }

  // ------------------------------------------------ face
  const eyeY = top + 8;
  const browY = eyeY - 2;
  const browC = grey > 0.5 ? 0x8a8780 : shade(hairC, -0.1);
  const browW = look.brows === 2 ? 3 : 2;
  b.hline(11, 11 + browW, browY - (look.brows === 0 ? 0 : 0), browC);
  b.hline(21 - browW, 21, browY, browC);
  if (look.brows === 2) {
    b.set(12, browY - 1, browC);
    b.set(20, browY - 1, browC);
  }
  // eyes
  const eyeC = 0x1c1714;
  const eyeL = 12;
  const eyeR = 19;
  b.set(eyeL, eyeY, eyeC);
  b.set(eyeL + 1, eyeY, eyeC);
  b.set(eyeR, eyeY, eyeC);
  b.set(eyeR + 1, eyeY, eyeC);
  if (look.eyes === 1) {
    b.set(eyeL, eyeY - 1, skinD);
    b.set(eyeR + 1, eyeY - 1, skinD);
  } else if (look.eyes === 2) {
    b.set(eyeL + 1, eyeY, 0xe8e3d6);
    b.set(eyeR + 1, eyeY, 0xe8e3d6);
  }
  // eyebrow cut scar (fighter staple)
  if (look.scar >= 1) b.set(eyeR + 1, browY, skinL);
  if (look.scar >= 2) {
    b.set(eyeL, browY + 1, 0xc98a7a);
    b.set(eyeL - 1, browY, 0xc98a7a);
  }
  if (look.scar >= 3) for (let i = 0; i < 4; i++) b.set(9 + i, eyeY + 3 + i, 0xb07a6c);

  // nose
  const noseY = eyeY + 2;
  const broken = look.nose === 2 || (inp.damage ?? 0) > 85;
  const nx = broken ? 17 : 16;
  b.set(nx, noseY, skinD);
  b.set(nx, noseY + 1, skinD);
  b.set(broken ? nx - 1 : nx, noseY + 2, skinD);
  if (look.nose === 1) {
    b.set(nx - 1, noseY + 2, skinDD);
    b.set(nx + 1, noseY + 2, skinDD);
  } else {
    b.set(nx - 1, noseY + 3, skinDD);
    b.set(nx + 1, noseY + 3, skinDD);
  }
  // mouth
  const mouthY = noseY + 5;
  b.hline(14, 18, mouthY, shade(skin, -0.45));
  if (variant === 'mugshot') b.set(18, mouthY - 1, shade(skin, -0.45));

  // beard
  const beardC = lerpColor(hairC, 0x9a9790, grey * 0.8);
  if (look.beard === 1) {
    // stubble
    for (let y = mouthY - 1; y < top + 17; y++) for (let x = 11; x < 22; x++) if ((x + y) % 2 === 0 && b.get(x, y) === skin) b.set(x, y, shade(skin, -0.25));
  } else if (look.beard === 2) {
    // goatee
    b.hline(14, 18, mouthY - 1, beardC);
    for (let y = mouthY + 1; y < top + 17; y++) b.hline(15, 17, y, beardC);
  } else if (look.beard === 3) {
    // full beard
    for (let y = mouthY - 2; y < top + 18; y++) {
      const r = y - top;
      const hw = (shape[Math.min(17, r)] ?? 3) + (r > 9 ? extra : 0);
      for (let x = 16 - hw; x < 16 + hw; x++) if (y !== mouthY || Math.abs(x - 16) > 2) b.set(x, y, beardC);
    }
  } else if (look.beard === 4) {
    // moustache
    b.hline(13, 19, mouthY - 1, beardC);
    b.set(13, mouthY, beardC);
    b.set(19, mouthY, beardC);
  }
  // face tattoo
  if (look.tattoo === 3) {
    b.set(eyeR + 2, eyeY + 2, shade(skin, -0.6));
    b.set(eyeR + 2, eyeY + 3, shade(skin, -0.6));
  }

  // ------------------------------------------------ wounds
  if (w) {
    if (swell >= 1) {
      // puffy cheekbones
      b.set(eyeL - 1, eyeY + 1, shade(skin, 0.1));
      b.set(eyeL, eyeY + 1, lerpColor(skin, 0xb06a6a, 0.35));
      if (swell >= 2) {
        b.set(eyeR + 2, eyeY + 1, lerpColor(skin, 0xb06a6a, 0.4));
        b.set(eyeR + 1, eyeY + 1, lerpColor(skin, 0xb06a6a, 0.3));
        b.set(eyeR + 1, eyeY - 1, lerpColor(skin, 0xb06a6a, 0.35));
      }
      if (swell >= 3) {
        // eye swollen shut
        b.set(eyeR, eyeY, lerpColor(skin, 0x8a4a5a, 0.6));
        b.set(eyeR + 1, eyeY, lerpColor(skin, 0x8a4a5a, 0.6));
      }
    }
    if (w.blackEye >= 1) {
      const c = lerpColor(skin, 0x3a2340, 0.55);
      b.set(eyeL - 1, eyeY, c);
      b.set(eyeL, eyeY + 1, c);
      b.set(eyeL + 1, eyeY + 1, c);
      b.set(eyeL + 2, eyeY, c);
      if (w.blackEye >= 2) {
        b.set(eyeR - 1, eyeY, c);
        b.set(eyeR, eyeY + 1, c);
        b.set(eyeR + 1, eyeY + 1, c);
        b.set(eyeR + 2, eyeY, c);
      }
    }
    if (w.noseBleed) {
      b.set(nx, noseY + 4, 0x9c1f1f);
      b.set(nx - 1, noseY + 4, 0xb02828);
      b.set(nx, mouthY + 1, 0x8e1c1c);
    }
    const cutC = 0xb3202a;
    if (w.cuts >= 1) {
      b.set(eyeR + 1, browY - 1, cutC);
      b.set(eyeR + 2, browY, cutC);
      b.set(eyeR + 2, browY + 1, 0x8e1c1c);
    }
    if (w.cuts >= 2) {
      b.set(eyeL - 1, browY, cutC);
      b.set(eyeL, browY - 1, cutC);
    }
    if (w.cuts >= 3) {
      b.set(15, top + 2, cutC);
      b.set(16, top + 3, cutC);
      b.set(17, top + 3, 0x8e1c1c);
    }
    // bandages: butterfly strips / gauze over cuts
    const band = 0xe6d8b8;
    const bandD = 0xc8b48c;
    if (w.bandages >= 1) {
      b.hline(eyeR, eyeR + 3, browY - 1, band);
      b.hline(eyeR, eyeR + 3, browY, bandD);
    }
    if (w.bandages >= 2) {
      b.hline(eyeL - 2, eyeL + 1, browY - 1, band);
      b.set(eyeL - 1, browY, bandD);
    }
    if (w.bandages >= 3) {
      // gauze on the forehead with an X of tape
      b.rect(13, top + 2, 6, 3, 0xf0eadc);
      b.set(13, top + 2, bandD);
      b.set(18, top + 4, bandD);
      b.set(18, top + 2, bandD);
      b.set(13, top + 4, bandD);
    }
  }
  return b;
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
