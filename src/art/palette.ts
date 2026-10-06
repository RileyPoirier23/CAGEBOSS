/**
 * Muted, desaturated 24-colour palette. Semantic colour names resolve through
 * `C` which can be swapped for a colour-blind-friendly variant at runtime.
 */

export const PAL = {
  ink: 0x1b171a,
  night: 0x262128,
  shadow: 0x37313a,
  slate: 0x4c4652,
  grey: 0x6f6974,
  ash: 0x9a939c,
  fog: 0xc3bcbf,
  bone: 0xe6dcc4,
  paper: 0xd6caa8,
  paperDark: 0xb3a685,
  newsprint: 0xb9b6ac,
  wood: 0x5b3e2b,
  woodDark: 0x3d2a1f,
  woodLight: 0x7c573c,
  rust: 0x9c4a35,
  blood: 0x8e2f2f,
  ember: 0xb8733a,
  gold: 0xc4a04a,
  olive: 0x6f7a46,
  moss: 0x4e6a43,
  teal: 0x4c7470,
  steel: 0x4f6582,
  sky: 0x8aa2b8,
  plum: 0x6a4c72,
};

export type PalKey = keyof typeof PAL;

const NORMAL = {
  bg: PAL.ink,
  text: PAL.bone,
  textDark: PAL.ink,
  textDim: PAL.ash,
  accent: PAL.gold,
  approve: PAL.moss,
  deny: PAL.blood,
  escalate: PAL.steel,
  bury: PAL.plum,
  good: PAL.moss,
  bad: PAL.blood,
  warn: PAL.ember,
  highlight: PAL.gold,
  link: PAL.sky,
  meterHigh: PAL.moss,
  meterMid: PAL.gold,
  meterLow: PAL.blood,
};

/** Okabe-Ito inspired substitutions within our muted range. */
const COLORBLIND: typeof NORMAL = {
  ...NORMAL,
  approve: 0x3f6f9a,
  deny: 0xc27a2c,
  good: 0x3f6f9a,
  bad: 0xc27a2c,
  meterHigh: 0x3f6f9a,
  meterLow: 0xc27a2c,
  warn: 0xc9b458,
};

export const C: typeof NORMAL = { ...NORMAL };

export function setColorblind(on: boolean): void {
  Object.assign(C, on ? COLORBLIND : NORMAL);
}

export function hex(c: number): string {
  return '#' + c.toString(16).padStart(6, '0');
}

export function lerpColor(a: number, b: number, t: number): number {
  const ar = (a >> 16) & 255, ag = (a >> 8) & 255, ab = a & 255;
  const br = (b >> 16) & 255, bg = (b >> 8) & 255, bb = b & 255;
  const r = Math.round(ar + (br - ar) * t);
  const g = Math.round(ag + (bg - ag) * t);
  const bl = Math.round(ab + (bb - ab) * t);
  return (r << 16) | (g << 8) | bl;
}

export function shade(c: number, f: number): number {
  return f < 0 ? lerpColor(c, 0x000000, -f) : lerpColor(c, 0xffffff, f);
}

export function meterColor(v: number): number {
  return v >= 60 ? C.meterHigh : v >= 35 ? C.meterMid : C.meterLow;
}

export const SKIN_TONES = [0xf0cfae, 0xdcae88, 0xc08e64, 0x9a6844, 0x75492f, 0x52321f];
export const HAIR_COLORS = [0x1c1714, 0x3b2a1e, 0x6b4527, 0xa8763d, 0xd2b071, 0x8c3a22, 0x8d8a86, 0xd8d4cc];
