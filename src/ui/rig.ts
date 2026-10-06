/**
 * Skeletal 2D fighter rig. Poses are joint sets (facing right, origin at the
 * feet, y up = negative). Fighters tween between poses and are rendered as
 * outlined, shaded limbs so the action reads like an actual fight.
 */
import { Graphics } from 'pixi.js';
import type { Fighter } from '../core/types';
import { SKIN_TONES, HAIR_COLORS, shade, lerpColor, PAL } from '../art/palette';

export type Joint = 'head' | 'neck' | 'shF' | 'elF' | 'haF' | 'shB' | 'elB' | 'haB' | 'hip' | 'knF' | 'ftF' | 'knB' | 'ftB';
export type Rig = Record<Joint, [number, number]>;
export const JOINTS: Joint[] = ['head', 'neck', 'shF', 'elF', 'haF', 'shB', 'elB', 'haB', 'hip', 'knF', 'ftF', 'knB', 'ftB'];

export type Pose =
  | 'guard' | 'jab' | 'cross' | 'hook' | 'uppercut' | 'body' | 'legkick' | 'bodykick' | 'headkick' | 'knee' | 'elbow' | 'spin' | 'flyknee'
  | 'shoot' | 'sprawl' | 'clinch' | 'top' | 'topPunch' | 'bottom' | 'bottomSub' | 'hurt' | 'rocked' | 'down' | 'ko' | 'celebrate'
  | 'taunt' | 'stool' | 'walk1' | 'walk2' | 'block' | 'slip' | 'lifted'
  | 'stand' | 'armUp' | 'headDown' | 'refHold' | 'refRaise' | 'mic' | 'point' | 'flex';

const P = (o: Partial<Record<Joint, [number, number]>>, base?: Rig): Rig => ({ ...(base ?? GUARD), ...o } as Rig);

export const GUARD: Rig = {
  head: [5, -76], neck: [3, -67], shF: [7, -64], elF: [15, -55], haF: [20, -66], shB: [-2, -64], elB: [6, -53], haB: [11, -64],
  hip: [0, -40], knF: [9, -21], ftF: [15, 0], knB: [-6, -21], ftB: [-13, 0],
};

const STAND: Rig = {
  head: [2, -77], neck: [1, -67], shF: [5, -64], elF: [7, -52], haF: [8, -41], shB: [-3, -64], elB: [-5, -52], haB: [-5, -41],
  hip: [0, -40], knF: [3, -20], ftF: [5, 0], knB: [-3, -20], ftB: [-5, 0],
};

export const POSES: Record<Pose, Rig> = {
  guard: GUARD,
  block: P({ haF: [13, -72], haB: [8, -72], elF: [12, -60], elB: [6, -60], head: [3, -74] }),
  slip: P({ head: [0, -70], neck: [0, -63], shF: [4, -61], shB: [-5, -61] }),
  jab: P({ elF: [26, -66], haF: [40, -69], head: [7, -75], shF: [10, -64] }),
  cross: P({ neck: [7, -66], head: [10, -74], shF: [10, -63], shB: [4, -64], elB: [22, -66], haB: [40, -69], haF: [14, -70], elF: [12, -58], ftB: [-10, 0], knB: [-2, -20] }),
  hook: P({ neck: [6, -66], head: [8, -74], shB: [2, -65], elB: [24, -66], haB: [34, -72], haF: [14, -70] }),
  uppercut: P({ neck: [6, -63], head: [8, -71], hip: [2, -38], elB: [16, -56], haB: [30, -74], knF: [10, -18], knB: [-4, -18] }),
  body: P({ neck: [8, -60], head: [12, -67], hip: [2, -36], shB: [4, -58], elB: [20, -50], haB: [34, -50], knF: [12, -18], knB: [-4, -18] }),
  legkick: P({ neck: [-1, -67], head: [0, -75], hip: [-2, -40], knB: [18, -30], ftB: [38, -22], haB: [-8, -54], elB: [-6, -50] }),
  bodykick: P({ neck: [-4, -65], head: [-5, -73], hip: [-3, -42], knB: [18, -46], ftB: [40, -50], haB: [-12, -56], elB: [-8, -52] }),
  headkick: P({ neck: [-8, -62], head: [-11, -70], shF: [-3, -60], shB: [-10, -60], hip: [-3, -42], knB: [16, -60], ftB: [38, -80], haB: [-18, -52], elB: [-14, -54], haF: [10, -68] }),
  knee: P({ neck: [7, -66], head: [10, -74], knB: [24, -48], ftB: [10, -26], haF: [32, -72], haB: [30, -66], elF: [20, -66], elB: [18, -62] }),
  elbow: P({ neck: [7, -66], head: [10, -74], shB: [3, -64], elB: [28, -70], haB: [16, -72] }),
  spin: P({ neck: [-2, -67], head: [-4, -75], shB: [6, -64], shF: [-4, -64], elB: [24, -68], haB: [40, -70], haF: [-8, -60], elF: [-6, -56] }),
  flyknee: P({ hip: [6, -56], neck: [10, -82], head: [12, -90], shF: [12, -80], shB: [4, -80], knB: [28, -70], ftB: [12, -48], knF: [6, -36], ftF: [-2, -20], haF: [26, -86], haB: [20, -84], elF: [20, -82], elB: [14, -78] }),
  shoot: P({ hip: [-8, -28], neck: [18, -38], head: [27, -40], shF: [20, -38], shB: [14, -38], elF: [30, -30], haF: [38, -26], elB: [24, -28], haB: [34, -22], knF: [10, -10], ftF: [16, 0], knB: [-20, -14], ftB: [-30, 0] }),
  sprawl: P({ hip: [-22, -16], neck: [8, -26], head: [16, -24], shF: [10, -26], shB: [4, -26], elF: [16, -18], haF: [22, -22], elB: [10, -16], haB: [18, -18], knF: [-30, -8], ftF: [-42, 0], knB: [-34, -6], ftB: [-46, 0] }),
  clinch: P({ neck: [7, -66], head: [12, -73], shF: [10, -64], elF: [20, -66], haF: [27, -72], shB: [3, -64], elB: [16, -60], haB: [25, -66] }),
  top: P({ hip: [-14, -18], neck: [12, -34], head: [20, -38], shF: [14, -34], shB: [8, -34], elF: [22, -24], haF: [28, -16], elB: [16, -24], haB: [22, -14], knF: [-4, -6], ftF: [-12, 0], knB: [-22, -6], ftB: [-30, 0] }),
  topPunch: P({ hip: [-12, -22], neck: [10, -44], head: [14, -52], shF: [12, -44], shB: [6, -44], elF: [20, -36], haF: [26, -30], elB: [18, -28], haB: [26, -12], knF: [-2, -6], ftF: [-10, 0], knB: [-20, -6], ftB: [-28, 0] }),
  bottom: P({ hip: [0, -6], neck: [26, -6], head: [34, -8], shF: [24, -10], shB: [22, -6], elF: [20, -20], haF: [26, -26], elB: [16, -16], haB: [20, -22], knF: [-6, -22], ftF: [10, -30], knB: [-12, -18], ftB: [4, -24] }),
  bottomSub: P({ hip: [0, -8], neck: [24, -6], head: [32, -8], shF: [24, -10], shB: [22, -6], elF: [16, -22], haF: [10, -32], elB: [12, -18], haB: [8, -28], knF: [10, -34], ftF: [26, -40], knB: [-2, -30], ftB: [16, -42] }),
  hurt: P({ neck: [-1, -66], head: [-4, -73], haF: [14, -56], haB: [8, -54], elF: [12, -50], elB: [4, -48], hip: [-2, -40] }),
  rocked: P({ neck: [-4, -62], head: [-8, -68], hip: [-3, -36], haF: [8, -46], haB: [2, -44], elF: [8, -48], elB: [0, -46], knF: [8, -16], knB: [-8, -14], ftF: [10, 0], ftB: [-12, 0] }),
  down: P({ hip: [-6, -8], neck: [-18, -30], head: [-22, -38], shF: [-14, -30], shB: [-20, -28], elF: [-8, -18], haF: [-2, -6], elB: [-24, -16], haB: [-26, -4], knF: [10, -14], ftF: [20, 0], knB: [6, -10], ftB: [16, 0] }),
  ko: P({ hip: [0, -4], neck: [-26, -5], head: [-35, -6], shF: [-24, -6], shB: [-26, -4], elF: [-30, -12], haF: [-40, -14], elB: [-20, -2], haB: [-12, -2], knF: [14, -8], ftF: [28, -2], knB: [12, -4], ftB: [26, -1] }),
  celebrate: P({ elF: [12, -84], haF: [16, -100], elB: [-6, -84], haB: [-10, -100], head: [3, -78] }),
  taunt: P({ elF: [20, -58], haF: [30, -54], elB: [-14, -58], haB: [-24, -54], head: [6, -77] }),
  stool: P({ hip: [0, -26], neck: [2, -52], head: [3, -60], shF: [6, -50], shB: [-2, -50], elF: [16, -38], haF: [22, -32], elB: [-10, -38], haB: [-14, -30], knF: [16, -24], ftF: [16, 0], knB: [12, -22], ftB: [10, 0] }),
  walk1: P({ head: [1, -76], neck: [0, -67], shF: [3, -64], shB: [-3, -64], elF: [6, -52], haF: [8, -42], elB: [-6, -52], haB: [-8, -42], knF: [6, -20], ftF: [10, 0], knB: [-4, -20], ftB: [-8, 0] }),
  walk2: P({ head: [1, -76], neck: [0, -67], shF: [3, -64], shB: [-3, -64], elF: [-4, -52], haF: [-6, -42], elB: [4, -52], haB: [6, -42], knF: [-2, -20], ftF: [-6, 0], knB: [4, -20], ftB: [8, 0] }),
  lifted: P({ hip: [0, -60], neck: [-6, -84], head: [-10, -90], knF: [10, -48], ftF: [16, -34], knB: [4, -44], ftB: [10, -30], haF: [8, -72], haB: [2, -70] }),
  // ---- ceremony / announcer / referee
  stand: STAND,
  armUp: P({ elF: [6, -84], haF: [8, -100], head: [3, -77] }, STAND),
  headDown: P({ head: [5, -71], neck: [3, -64], shF: [5, -61], shB: [-2, -61], haF: [8, -40], haB: [-2, -40], elF: [7, -50], elB: [-3, -50] }, STAND),
  refHold: P({ elF: [12, -56], haF: [20, -54], elB: [-10, -56], haB: [-18, -54] }, STAND),
  refRaise: P({ elF: [12, -82], haF: [18, -100], elB: [-10, -56], haB: [-18, -54] }, STAND),
  mic: P({ elB: [8, -58], haB: [6, -72], head: [3, -77] }, STAND),
  point: P({ elF: [18, -68], haF: [34, -72], elB: [8, -58], haB: [6, -72], head: [5, -77] }, STAND),
  flex: P({ elF: [16, -72], haF: [12, -86], elB: [-12, -72], haB: [-8, -86], head: [2, -78] }, STAND),
};

export interface Look2 {
  skin: number;
  hairStyle: number;
  hairColor: number;
  beard: number;
  build: number;
  trunks: number;
  trim: number;
  glove: number;
  stance: string;
  female: boolean;
  tattoo: number;
  /** clothing for non-fighters (referee, ring announcer, cutmen) */
  outfit?: { top: number; bottom: number; shirt?: number; tie?: number; bulk?: number; mic?: boolean };
}

export function lookFor(f: Fighter, corner: 0 | 1): Look2 {
  return {
    skin: SKIN_TONES[f.look.skin % SKIN_TONES.length],
    hairStyle: f.look.hair,
    hairColor: lerpColor(HAIR_COLORS[f.look.hairColor % HAIR_COLORS.length], 0x9a9790, Math.max(0, Math.min(1, (f.age - 36) / 14))),
    beard: f.look.beard,
    build: f.look.build,
    trunks: corner === 0 ? 0x9e2a2a : 0x284a86,
    trim: corner === 0 ? 0xe8d8b0 : 0xd8e0f0,
    glove: corner === 0 ? 0x6e1a1a : 0x1a2e5a,
    stance:
      f.anim?.stance ??
      (f.styles.includes('Wrestler') || f.styles.includes('Ground & Pound') ? 'wrestler'
        : f.styles.includes('Kickboxer') || f.styles.includes('Muay Thai') ? 'upright'
          : f.styles.includes('Brawler') ? 'brawler'
            : f.styles.includes('Showboat') ? 'handsLow'
              : f.styles.includes('Counter Striker') ? 'sway' : 'bouncy'),
    female: f.gender === 'W',
    tattoo: f.look.tattoo,
  };
}

/** Stance tweaks applied to the guard pose. */
export function stanceGuard(L: Look2, t: number): Rig {
  const r: Rig = { ...GUARD };
  const add = (j: Joint, dx: number, dy: number) => (r[j] = [r[j][0] + dx, r[j][1] + dy]);
  switch (L.stance) {
    case 'wrestler':
    case 'crouch':
      for (const j of ['head', 'neck', 'shF', 'shB', 'elF', 'elB', 'haF', 'haB'] as Joint[]) add(j, 3, 7);
      add('hip', 0, 5);
      add('knF', 3, 3);
      add('knB', -2, 3);
      add('haF', 2, 8);
      add('haB', 2, 6);
      break;
    case 'handsLow':
      add('haF', -2, 18);
      add('haB', -4, 20);
      add('elF', -3, 6);
      add('elB', -3, 6);
      add('head', -1, 0);
      break;
    case 'karate':
      add('ftF', 5, 0);
      add('ftB', -5, 0);
      add('haF', 6, 4);
      add('elF', 4, 2);
      break;
    case 'brawler':
      add('haF', -2, -4);
      add('haB', -4, -4);
      add('elF', 2, 0);
      add('ftF', 2, 0);
      add('ftB', -2, 0);
      break;
    case 'upright':
      add('head', -1, -2);
      add('neck', -1, -2);
      add('ftF', -2, 0);
      break;
  }
  // idle motion
  const bob = L.stance === 'bouncy' || L.stance === 'karate' ? Math.abs(Math.sin(t * 5)) * -3 : Math.sin(t * 2.5) * 1;
  const sway = L.stance === 'sway' ? Math.sin(t * 3) * 3 : 0;
  for (const j of JOINTS) {
    if (j === 'ftF' || j === 'ftB') continue;
    const k = j === 'knF' || j === 'knB' ? 0.5 : 1;
    r[j] = [r[j][0] + (['head', 'neck'].includes(j) ? sway : sway * 0.4), r[j][1] + bob * k];
  }
  // hands breathe
  r.haF = [r.haF[0] + Math.sin(t * 4.2) * 1.2, r.haF[1] + Math.cos(t * 3.1)];
  r.haB = [r.haB[0] + Math.cos(t * 3.7) * 1.2, r.haB[1] + Math.sin(t * 2.9)];
  return r;
}

export function lerpRig(a: Rig, b: Rig, k: number): Rig {
  const r = {} as Rig;
  for (const j of JOINTS) r[j] = [a[j][0] + (b[j][0] - a[j][0]) * k, a[j][1] + (b[j][1] - a[j][1]) * k];
  return r;
}

/**
 * Render a rig as a proper body: tapered, outlined, two-tone muscle shapes
 * (biceps, forearms, quads, calves), a shaped torso with pecs/abs/lats, fight
 * shorts, gloves with cuffs and thumbs, and a head with jaw, nose, ear, eye,
 * brow, mouth and hair. Clothed figures (referee, Juiced Butler) use the same
 * body with shirt / trousers / shoes. x,y = feet; facing 1 right / -1 left.
 * Drawn at sub-pixel precision; the arena pixelates the result.
 */
export function drawRig(g: Graphics, rig: Rig, x: number, y: number, facing: 1 | -1, L: Look2, scale = 1): void {
  type V = [number, number];
  const o = L.outfit;
  const T = (p: V): V => [x + p[0] * facing * scale, y + p[1] * scale];
  const add = (a: V, b: V, k = 1): V => [a[0] + b[0] * k, a[1] + b[1] * k];
  const lerp = (a: V, b: V, t: number): V => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t];
  const OUT = 0x120d10;
  const build = Math.min(3, L.build + (o?.bulk ?? 0) / 2);
  const fem = L.female;
  const skin = L.skin;
  const skinFar = shade(skin, -0.2);
  const s = scale;

  /** Tapered limb polygon (screen space) through a, mid, b with widths. */
  const limbPts = (a: V, b: V, wa: number, wm: number, wb: number, grow = 0): number[] => {
    const A = T(a);
    const B = T(b);
    const dx = B[0] - A[0];
    const dy = B[1] - A[1];
    const len = Math.hypot(dx, dy) || 1;
    const nx = -dy / len;
    const ny = dx / len;
    const M: V = [A[0] + dx * 0.42, A[1] + dy * 0.42];
    const h = (w: number) => ((w + grow) * s) / 2;
    return [
      A[0] + nx * h(wa), A[1] + ny * h(wa), M[0] + nx * h(wm), M[1] + ny * h(wm), B[0] + nx * h(wb), B[1] + ny * h(wb),
      B[0] - nx * h(wb), B[1] - ny * h(wb), M[0] - nx * h(wm), M[1] - ny * h(wm), A[0] - nx * h(wa), A[1] - ny * h(wa),
    ];
  };
  /** Shadow strip along the side of a limb facing away from the light (down/right on screen). */
  const limbShade = (a: V, b: V, wa: number, wm: number, wb: number, color: number) => {
    const A = T(a);
    const B = T(b);
    const dx = B[0] - A[0];
    const dy = B[1] - A[1];
    const len = Math.hypot(dx, dy) || 1;
    let nx = -dy / len;
    let ny = dx / len;
    if (nx + ny < 0) {
      nx = -nx;
      ny = -ny;
    }
    const M: V = [A[0] + dx * 0.42, A[1] + dy * 0.42];
    const h = (w: number, f: number) => (w * s * f) / 2;
    g.poly([
      A[0] + nx * h(wa, 0.15), A[1] + ny * h(wa, 0.15), M[0] + nx * h(wm, 0.15), M[1] + ny * h(wm, 0.15), B[0] + nx * h(wb, 0.15), B[1] + ny * h(wb, 0.15),
      B[0] + nx * h(wb, 1), B[1] + ny * h(wb, 1), M[0] + nx * h(wm, 1), M[1] + ny * h(wm, 1), A[0] + nx * h(wa, 1), A[1] + ny * h(wa, 1),
    ]).fill(color);
  };
  interface Seg { a: V; b: V; wa: number; wm: number; wb: number; color: number; shadow: number }
  /** Outline every segment first, then fill, so joints merge cleanly. */
  const group = (segs: Seg[], joints: { p: V; r: number; color: number }[] = []) => {
    for (const q of segs) g.poly(limbPts(q.a, q.b, q.wa, q.wm, q.wb, 2)).fill(OUT);
    for (const j of joints) g.circle(...T(j.p), (j.r + 1) * s).fill(OUT);
    for (const q of segs) g.poly(limbPts(q.a, q.b, q.wa, q.wm, q.wb)).fill(q.color);
    for (const j of joints) g.circle(...T(j.p), j.r * s).fill(j.color);
    for (const q of segs) limbShade(q.a, q.b, q.wa, q.wm, q.wb, q.shadow);
  };

  // widths
  const bw = build * (fem ? 0.6 : 1);
  const UA = { a: 6.4 + bw, m: 7.6 + bw * 1.4, b: 5 + bw * 0.6 }; // upper arm (bicep bulge)
  const FA = { a: 5.4 + bw * 0.6, m: 5.2 + bw * 0.5, b: 4 }; // forearm
  const TH = { a: 9.5 + bw * 1.3, m: 9.8 + bw * 1.4, b: 6.4 + bw * 0.4 }; // thigh
  const CA = { a: 6 + bw * 0.4, m: 7 + bw * 0.6, b: 3.8 }; // calf
  const armC = o ? o.top : skin;
  const armFarC = o ? shade(o.top, -0.25) : skinFar;
  const legC = o ? o.bottom : skin;
  const legFarC = o ? shade(o.bottom, -0.25) : skinFar;
  const shoe = 0x0c0c0e;

  const foot = (ft: V, kn: V, color: number) => {
    // foot points forward (along facing), heel slightly back
    const f = T(ft);
    const lift = Math.max(0, -ft[1]) > 4; // airborne foot: point the toes along the shin
    const dir: V = lift ? [ft[0] - kn[0], ft[1] - kn[1]] : [1, 0];
    const dl = Math.hypot(dir[0], dir[1]) || 1;
    const ux = (dir[0] / dl) * facing;
    const uy = dir[1] / dl;
    const p = [f[0] - ux * 2 * s, f[1] - 1.5 * s, f[0] + ux * 7 * s, f[1] + uy * 7 * s - 1 * s, f[0] + ux * 7 * s, f[1] + uy * 7 * s + 1 * s, f[0] - ux * 2.5 * s, f[1] + 1.5 * s];
    g.poly(p).fill(OUT).stroke({ color: OUT, width: 2 * s });
    g.poly(p).fill(o ? shoe : color);
    if (!o) g.moveTo(f[0] - ux * 1 * s, f[1] - 1.5 * s).lineTo(f[0] + ux * 1.5 * s, f[1] - 1.5 * s).stroke({ color: 0xe8e0d0, width: 1.2 * s }); // ankle tape
  };
  const glove = (ha: V, el: V, color: number, near: boolean) => {
    const H = T(ha);
    const E = T(el);
    const dx = H[0] - E[0];
    const dy = H[1] - E[1];
    const len = Math.hypot(dx, dy) || 1;
    const ux = dx / len;
    const uy = dy / len;
    if (o) {
      // bare hand (referee / announcer)
      g.circle(H[0], H[1], 3 * s).fill(OUT);
      g.circle(H[0], H[1], 2.2 * s).fill(near ? skin : skinFar);
      if (o.mic && !near) {
        g.rect(H[0] - 1 * s, H[1] - 6 * s, 2 * s, 5 * s).fill(0x1a1a1a);
        g.circle(H[0], H[1] - 7 * s, 2 * s).fill(0x3a3a44);
      }
      return;
    }
    const r = 4.3 * s;
    const C: V = [H[0] + ux * 1 * s, H[1] + uy * 1 * s];
    g.circle(C[0], C[1], r + 1 * s).fill(OUT);
    g.circle(C[0], C[1], r).fill(color);
    g.circle(C[0] - uy * 2.6 * s, C[1] + ux * 2.6 * s, 1.8 * s).fill(OUT); // thumb
    g.circle(C[0] - uy * 2.6 * s, C[1] + ux * 2.6 * s, 1.1 * s).fill(color);
    // cuff / velcro strap
    const cx = H[0] - ux * 3.2 * s;
    const cy = H[1] - uy * 3.2 * s;
    g.moveTo(cx - uy * 3.4 * s, cy + ux * 3.4 * s).lineTo(cx + uy * 3.4 * s, cy - ux * 3.4 * s).stroke({ color: OUT, width: 3.4 * s });
    g.moveTo(cx - uy * 2.6 * s, cy + ux * 2.6 * s).lineTo(cx + uy * 2.6 * s, cy - ux * 2.6 * s).stroke({ color: shade(color, near ? -0.35 : -0.5), width: 2 * s });
    g.circle(C[0] + ux * 1.2 * s - 1 * s, C[1] + uy * 1.2 * s - 1.4 * s, 1.1 * s).fill(shade(color, 0.4)); // shine
  };

  // ------------------------------------------------------------ far leg & far arm
  group(
    [
      { a: rig.hip, b: rig.knB, wa: TH.a, wm: TH.m, wb: TH.b, color: legFarC, shadow: shade(legFarC, -0.18) },
      { a: rig.knB, b: rig.ftB, wa: CA.a, wm: CA.m, wb: CA.b, color: legFarC, shadow: shade(legFarC, -0.18) },
    ],
    [{ p: rig.knB, r: TH.b / 2, color: legFarC }],
  );
  foot(rig.ftB, rig.knB, legFarC);
  if (!o) {
    // far shorts leg
    group([{ a: rig.hip, b: lerp(rig.hip, rig.knB, 0.5), wa: TH.a + 2, wm: TH.m + 2.2, wb: TH.m + 1.6, color: shade(L.trunks, -0.25), shadow: shade(L.trunks, -0.4) }]);
  }
  group(
    [
      { a: rig.shB, b: rig.elB, wa: UA.a, wm: UA.m, wb: UA.b, color: armFarC, shadow: shade(armFarC, -0.18) },
      { a: rig.elB, b: rig.haB, wa: FA.a, wm: FA.m, wb: FA.b, color: armFarC, shadow: shade(armFarC, -0.18) },
    ],
    [{ p: rig.elB, r: UA.b / 2, color: armFarC }, { p: rig.shB, r: UA.a / 2, color: armFarC }],
  );
  glove(rig.haB, rig.elB, shade(L.glove, -0.2), false);

  // ------------------------------------------------------------ torso
  const nk = rig.neck;
  const hp = rig.hip;
  const len = Math.hypot(hp[0] - nk[0], hp[1] - nk[1]) || 1;
  const u: V = [(hp[0] - nk[0]) / len, (hp[1] - nk[1]) / len]; // spine, downward
  const f: V = [-u[1], u[0]].map((v) => -v) as V; // forward (toward facing)
  const tw = (fem ? 11 : 12.5) + build * 2.4;
  const P = (along: number, fwd: number): V => add(add(nk, u, len * along), f, fwd);
  const belly = build >= 2 ? 1.6 : 0;
  const torso: V[] = [
    P(-0.04, tw * 0.15), // throat
    P(0.08, tw * 0.5), // front shoulder
    P(0.3, tw * 0.6 + (fem ? 0.6 : 0)), // chest
    P(0.45, tw * 0.5), // under pec
    P(0.72, tw * 0.42 + belly), // belly
    P(1.02, tw * 0.46), // hip front
    P(1.02, -tw * 0.46), // hip back
    P(0.72, -tw * 0.4), // lower back
    P(0.36, -tw * 0.56), // lats
    P(0.06, -tw * 0.44), // rear shoulder
    P(-0.05, -tw * 0.12), // trap
  ];
  const tp = torso.flatMap((p) => T(p));
  const torsoC = o ? o.top : skin;
  g.poly(tp).fill(torsoC).stroke({ color: OUT, width: 2 * s, join: 'round' });
  // back half in shadow
  g.poly([P(0.1, -tw * 0.05), P(0.05, -tw * 0.42), P(0.36, -tw * 0.54), P(0.72, -tw * 0.38), P(1.0, -tw * 0.44), P(1.0, -tw * 0.08), P(0.5, -tw * 0.1)].flatMap((p) => T(p))).fill(shade(torsoC, -0.16));
  const line = (a: V, b: V, c: number, w = 1) => {
    const A = T(a);
    const B = T(b);
    g.moveTo(A[0], A[1]).lineTo(B[0], B[1]).stroke({ color: c, width: w * s, cap: 'round' });
  };
  if (!o) {
    const dk = shade(skin, -0.28);
    if (!fem) {
      line(P(0.44, tw * 0.48), P(0.4, tw * 0.02), dk); // pec line
      g.circle(...T(P(0.36, tw * 0.44)), 0.9 * s).fill(shade(skin, -0.35)); // nipple
      line(P(0.15, tw * 0.45), P(0.22, tw * 0.1), shade(skin, 0.12), 1.2); // pec highlight
      if (build < 2) for (let i = 0; i < 3; i++) line(P(0.56 + i * 0.11, tw * 0.22), P(0.56 + i * 0.11, tw * 0.42), dk, 0.9); // abs
      else line(P(0.62, tw * 0.3), P(0.8, tw * 0.38), dk, 0.9); // gut fold
      if (L.beard >= 3) g.poly([P(0.22, tw * 0.1), P(0.3, tw * 0.32), P(0.4, tw * 0.12)].flatMap((p) => T(p))).fill(shade(skin, -0.22)); // chest hair
    } else {
      // sports bra
      const bra = [P(0.12, tw * 0.5), P(0.3, tw * 0.62), P(0.46, tw * 0.52), P(0.46, -tw * 0.52), P(0.12, -tw * 0.44)].flatMap((p) => T(p));
      g.poly(bra).fill(0x1c1c22).stroke({ color: OUT, width: 1 * s });
      line(P(0.42, tw * 0.5), P(0.42, -tw * 0.5), L.trim, 1.2);
      for (let i = 0; i < 2; i++) line(P(0.6 + i * 0.12, tw * 0.22), P(0.6 + i * 0.12, tw * 0.38), dk, 0.8);
    }
    g.circle(...T(P(0.86, tw * 0.3)), 0.7 * s).fill(dk); // navel
    if (L.tattoo >= 2) {
      // rib piece: a little script + star
      line(P(0.3, -tw * 0.18), P(0.62, -tw * 0.26), shade(skin, -0.45), 0.8);
      line(P(0.36, -tw * 0.32), P(0.58, -tw * 0.36), shade(skin, -0.45), 0.8);
    }
  } else {
    if (o.shirt !== undefined) {
      line(P(0.0, tw * 0.25), P(0.55, tw * 0.3), o.shirt, 2.6);
      if (o.tie !== undefined) {
        g.circle(...T(P(0.04, tw * 0.28)), 1.6 * s).fill(o.tie); // bow tie
        g.circle(...T(P(0.04, tw * 0.16)), 1.3 * s).fill(o.tie);
      }
      for (let i = 0; i < 3; i++) g.circle(...T(P(0.62 + i * 0.12, tw * 0.3)), 0.6 * s).fill(0x2a2a30); // jacket buttons
    } else {
      line(P(0.02, tw * 0.1), P(0.95, tw * 0.1), shade(o.top, 0.2), 0.8); // ref shirt placket
    }
  }

  // ------------------------------------------------------------ near leg + shorts / trousers
  group(
    [
      { a: rig.hip, b: rig.knF, wa: TH.a, wm: TH.m, wb: TH.b, color: legC, shadow: shade(legC, -0.15) },
      { a: rig.knF, b: rig.ftF, wa: CA.a, wm: CA.m, wb: CA.b, color: legC, shadow: shade(legC, -0.15) },
    ],
    [{ p: rig.knF, r: TH.b / 2, color: legC }],
  );
  if (!o) {
    line(lerp(rig.knF, rig.ftF, 0.3), lerp(rig.knF, rig.ftF, 0.62), shade(skin, 0.1), 1.3); // shin highlight
    line(lerp(rig.hip, rig.knF, 0.62), lerp(rig.hip, rig.knF, 0.9), shade(skin, -0.18), 1); // quad line
  }
  foot(rig.ftF, rig.knF, skin);
  if (!o) {
    // fight shorts: waist block + near leg, waistband trim, side stripe, little logo
    const wb: V[] = [P(0.86, tw * 0.5), P(0.86, -tw * 0.5), P(1.08, -tw * 0.5), P(1.08, tw * 0.5)];
    g.poly(wb.flatMap((p) => T(p))).fill(L.trunks).stroke({ color: OUT, width: 1.6 * s });
    group([{ a: rig.hip, b: lerp(rig.hip, rig.knF, 0.52), wa: TH.a + 2.4, wm: TH.m + 2.6, wb: TH.m + 2, color: L.trunks, shadow: shade(L.trunks, -0.22) }]);
    line(P(0.88, tw * 0.5), P(0.88, -tw * 0.5), L.trim, 1.8); // waistband
    line(lerp(rig.hip, rig.knF, 0.08), lerp(rig.hip, rig.knF, 0.5), L.trim, 1.1); // side stripe
    g.rect(...T(add(lerp(rig.hip, rig.knF, 0.28), f, 2)), 2.2 * s, 1.6 * s).fill(shade(L.trim, -0.1)); // logo patch
  } else {
    line(P(0.9, tw * 0.48), P(0.9, -tw * 0.48), 0x0c0c0e, 1.6); // belt
  }

  // ------------------------------------------------------------ neck & head
  const hd = rig.head;
  group([{ a: lerp(nk, hd, -0.1), b: lerp(nk, hd, 0.75), wa: 6 + build, wm: 5.6 + build, wb: 5.2 + build * 0.5, color: skin, shadow: shade(skin, -0.16) }]);
  const H = T(hd);
  const hr = 7 * s;
  const fx = facing * s; // forward x unit on screen
  // jaw & chin, nose
  const jaw = [H[0] - 3 * fx, H[1] + 4 * s, H[0] + 3 * fx, H[1] + 7 * s, H[0] + 6.6 * fx, H[1] + 5 * s, H[0] + 7.4 * fx, H[1] + 1 * s, H[0] + 2 * fx, H[1] - 2 * s];
  g.circle(H[0], H[1], hr + 1 * s).fill(OUT);
  g.poly(jaw).fill(OUT).stroke({ color: OUT, width: 2 * s, join: 'round' });
  g.circle(H[0], H[1], hr).fill(skin);
  g.poly(jaw).fill(skin);
  // back-of-skull shadow
  g.circle(H[0] - 3.4 * fx, H[1] + 1.4 * s, hr * 0.5).fill(shade(skin, -0.12));
  const nose = [H[0] + 6.8 * fx, H[1] - 1.5 * s, H[0] + 9 * fx, H[1] + 1.6 * s, H[0] + 6.6 * fx, H[1] + 2.2 * s];
  g.poly(nose).fill(skin).stroke({ color: OUT, width: 1 * s, join: 'round' });
  g.poly(nose).fill(skin);
  // ear
  g.ellipse(H[0] - 1.6 * fx, H[1] + 1 * s, 1.2 * s, 1.9 * s).fill(shade(skin, -0.2));
  g.rect(H[0] - 1.6 * fx - 0.4 * s, H[1] + 0.4 * s, 0.8 * s, 1.2 * s).fill(shade(skin, -0.4));
  // eye: white, pupil, lid; brow
  g.rect(H[0] + (facing > 0 ? 3.8 : -5.4) * s, H[1] - 1.8 * s, 1.6 * s, 1.2 * s).fill(0xd6cec2);
  g.rect(H[0] + (facing > 0 ? 4.6 : -5.4) * s, H[1] - 1.8 * s, 0.9 * s, 1.2 * s).fill(0x14100e);
  line([hd[0] + 3.6, hd[1] - 2.1], [hd[0] + 5.6, hd[1] - 2.1], shade(skin, -0.4), 0.7);
  line([hd[0] + 2.6, hd[1] - 3.6], [hd[0] + 6.4, hd[1] - 3.2], shade(L.hairColor, -0.1), 1.3);
  // mouth (+ mouthguard flash for fighters)
  line([hd[0] + 4.6, hd[1] + 3.6], [hd[0] + 6.6, hd[1] + 3.2], shade(skin, -0.5), 0.9);
  if (!o) line([hd[0] + 5.2, hd[1] + 3.4], [hd[0] + 6.4, hd[1] + 3.2], L.trim === 0xe8d8b0 ? 0xd04040 : 0x3a6ad0, 0.7);
  // hair
  const hc = L.hairColor;
  const hcD = shade(hc, -0.25);
  const arcCap = (r: number, a0: number, a1: number, color: number, width: number) => {
    const start = facing > 0 ? a0 : Math.PI - a1;
    const end = facing > 0 ? a1 : Math.PI - a0;
    g.moveTo(H[0] + Math.cos(start) * r, H[1] + Math.sin(start) * r);
    g.arc(H[0], H[1], r, start, end).stroke({ color, width });
  };
  switch (L.hairStyle) {
    case 0:
      g.circle(H[0] - 1 * fx, H[1] - 4.4 * s, 1.4 * s).fill(shade(skin, 0.28)); // bald shine
      break;
    case 1:
      arcCap(hr - 1 * s, Math.PI * 1.05, Math.PI * 1.98, hcD, 2.2 * s);
      break;
    case 4:
      g.poly([H[0] - 3 * fx, H[1] - hr + 1 * s, H[0] + 1 * fx, H[1] - hr - 5 * s, H[0] + 4 * fx, H[1] - hr + 1 * s]).fill(hc).stroke({ color: OUT, width: 1 * s });
      break;
    case 5:
    case 6:
      arcCap(hr - 0.5 * s, Math.PI * 0.95, Math.PI * 2.02, hc, 3.6 * s);
      g.poly([H[0] - 4 * fx, H[1] - 2 * s, H[0] - 7.5 * fx, H[1] - 1 * s, H[0] - 8.5 * fx, H[1] + (fem ? 12 : 8) * s, H[0] - 4.5 * fx, H[1] + (fem ? 11 : 7) * s]).fill(hc).stroke({ color: OUT, width: 1 * s });
      if (L.hairStyle === 6) for (let i = 0; i < 4; i++) line([hd[0] - 6 + i * 2.6, hd[1] - 6.4 + Math.abs(i - 1.5)], [hd[0] - 6.4 + i * 2.6, hd[1] - 3], hcD, 0.7);
      break;
    case 7:
      arcCap(hr - 0.8 * s, Math.PI * 1.0, Math.PI * 2.0, hc, 3 * s);
      g.circle(H[0] - 6 * fx, H[1] - 5.5 * s, 3 * s).fill(OUT);
      g.circle(H[0] - 6 * fx, H[1] - 5.5 * s, 2.3 * s).fill(hc);
      break;
    default:
      arcCap(hr - 0.6 * s, Math.PI * 1.0, Math.PI * 2.02, hc, 3.2 * s);
      g.poly([H[0] - 6.5 * fx, H[1] - 3 * s, H[0] - 7.2 * fx, H[1] + 1.5 * s, H[0] - 4.5 * fx, H[1] - 1 * s]).fill(hc); // sideburn / back
  }
  if (L.beard === 3) {
    g.poly([H[0] - 2.4 * fx, H[1] + 3 * s, H[0] + 3 * fx, H[1] + 7.6 * s, H[0] + 7 * fx, H[1] + 5.4 * s, H[0] + 7.3 * fx, H[1] + 3.6 * s, H[0] + 4.6 * fx, H[1] + 4.4 * s, H[0] + 0.5 * fx, H[1] + 1.4 * s]).fill(hc);
  } else if (L.beard === 2 || L.beard === 4) {
    line([hd[0] + 4.4, hd[1] + 2.6], [hd[0] + 6.8, hd[1] + 2.4], hc, 1.3); // moustache
    if (L.beard === 2) g.circle(H[0] + 5.6 * fx, H[1] + 5.8 * s, 1.4 * s).fill(hc); // goatee
  } else if (L.beard === 1) {
    for (let i = 0; i < 4; i++) g.circle(H[0] + (1 + i * 1.6) * fx, H[1] + (4.4 + (i % 2)) * s, 0.5 * s).fill(shade(skin, -0.32)); // stubble
  }

  // ------------------------------------------------------------ near arm (+ glove)
  group(
    [
      { a: rig.shF, b: rig.elF, wa: UA.a, wm: UA.m, wb: UA.b, color: armC, shadow: shade(armC, -0.15) },
      { a: rig.elF, b: rig.haF, wa: FA.a, wm: FA.m, wb: FA.b, color: armC, shadow: shade(armC, -0.15) },
    ],
    [{ p: rig.elF, r: UA.b / 2, color: armC }, { p: rig.shF, r: UA.a / 2, color: armC }],
  );
  if (!o) {
    line(lerp(rig.shF, rig.elF, 0.25), lerp(rig.shF, rig.elF, 0.6), shade(skin, 0.12), 1.2); // bicep highlight
    if (L.tattoo >= 1) {
      // tribal arm band: two dark rings around the upper arm
      for (const t of [0.34, 0.46]) {
        const A = T(rig.shF);
        const B = T(rig.elF);
        const dx = B[0] - A[0];
        const dy = B[1] - A[1];
        const l = Math.hypot(dx, dy) || 1;
        const c: V = [A[0] + dx * t, A[1] + dy * t];
        const hw = (UA.m * s) / 2;
        g.moveTo(c[0] - (dy / l) * hw, c[1] + (dx / l) * hw).lineTo(c[0] + (dy / l) * hw, c[1] - (dx / l) * hw).stroke({ color: shade(skin, -0.55), width: 1.1 * s });
      }
    }
  }
  glove(rig.haF, rig.elF, L.glove, true);
}

export function trunksFor(corner: 0 | 1): number {
  return corner === 0 ? 0x9e2a2a : 0x284a86;
}

export { PAL };
