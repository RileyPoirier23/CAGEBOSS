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
  | 'taunt' | 'stool' | 'walk1' | 'walk2' | 'block' | 'slip' | 'lifted';

const P = (o: Partial<Record<Joint, [number, number]>>, base?: Rig): Rig => ({ ...(base ?? GUARD), ...o } as Rig);

export const GUARD: Rig = {
  head: [5, -76], neck: [3, -67], shF: [7, -64], elF: [15, -55], haF: [20, -66], shB: [-2, -64], elB: [6, -53], haB: [11, -64],
  hip: [0, -40], knF: [9, -21], ftF: [15, 0], knB: [-6, -21], ftB: [-13, 0],
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

/** Render a rig. x,y = feet position; facing 1 right / -1 left. */
export function drawRig(g: Graphics, rig: Rig, x: number, y: number, facing: 1 | -1, L: Look2, scale = 1): void {
  const tx = (p: [number, number]): [number, number] => [Math.round(x + p[0] * facing * scale), Math.round(y + p[1] * scale)];
  const OUT = 0x120d10;
  const skin = L.skin;
  const skinB = shade(skin, -0.22); // far limbs
  const skinL = shade(skin, 0.1);
  const w = (L.build === 2 ? 9 : L.build === 1 ? 7.5 : 6.5) * scale;
  const limb = (a: Joint, b: Joint, width: number, color: number) => {
    const [x1, y1] = tx(rig[a]);
    const [x2, y2] = tx(rig[b]);
    g.moveTo(x1, y1).lineTo(x2, y2).stroke({ color, width, cap: 'round' });
  };
  const outline = (a: Joint, b: Joint, width: number) => limb(a, b, width + 2 * scale, OUT);
  // ---- far side (back arm & back leg)
  outline('hip', 'knB', w);
  outline('knB', 'ftB', w * 0.8);
  limb('hip', 'knB', w, skinB);
  {
    const [bx1, by1] = tx(rig.hip);
    const [bx2, by2] = tx(rig.knB);
    g.moveTo(bx1, by1).lineTo(bx1 + (bx2 - bx1) * 0.55, by1 + (by2 - by1) * 0.55).stroke({ color: shade(L.trunks, -0.25), width: w + 1, cap: 'round' });
  }
  limb('knB', 'ftB', w * 0.8, skinB);
  const [fbx, fby] = tx(rig.ftB);
  g.rect(fbx - 3 * scale, fby - 2 * scale, 7 * scale, 3 * scale).fill(skinB);
  outline('shB', 'elB', w * 0.75);
  outline('elB', 'haB', w * 0.7);
  limb('shB', 'elB', w * 0.75, skinB);
  limb('elB', 'haB', w * 0.7, skinB);
  // ---- torso
  const [nx, ny] = tx(rig.neck);
  const [hx, hy] = tx(rig.hip);
  const tw = (L.build === 2 ? 15 : L.build === 1 ? 12.5 : 11) * scale;
  g.moveTo(nx, ny).lineTo(hx, hy).stroke({ color: OUT, width: tw + 2 * scale, cap: 'round' });
  g.moveTo(nx, ny).lineTo(hx, hy).stroke({ color: skin, width: tw, cap: 'round' });
  // chest highlight / abs shading
  const mx = (nx + hx) / 2;
  const my = (ny + hy) / 2;
  g.circle(Math.round(mx + 2 * facing * scale), Math.round(my - 6 * scale), Math.max(1, 2.5 * scale)).fill(skinL);
  if (L.build === 2) g.circle(Math.round(mx + 3 * facing * scale), Math.round(my + 5 * scale), 4 * scale).fill(shade(skin, 0.04));
  if (L.female) g.moveTo(nx, ny + 3 * scale).lineTo(mx, my).stroke({ color: 0x2a2a2a, width: tw * 0.9 });
  if (L.tattoo >= 2) g.rect(Math.round(mx - 2 * scale), Math.round(my - 4 * scale), 3 * scale, 5 * scale).fill(shade(skin, -0.45));
  // trunks
  g.moveTo(hx, hy - 4 * scale).lineTo(hx, hy + 5 * scale).stroke({ color: OUT, width: tw + 4 * scale, cap: 'butt' });
  g.moveTo(hx, hy - 3 * scale).lineTo(hx, hy + 4 * scale).stroke({ color: L.trunks, width: tw + 2 * scale, cap: 'butt' });
  g.moveTo(hx - tw / 2, hy - 3 * scale).lineTo(hx + tw / 2, hy - 3 * scale).stroke({ color: L.trim, width: 1.5 * scale });
  // ---- near leg
  outline('hip', 'knF', w);
  outline('knF', 'ftF', w * 0.8);
  limb('hip', 'knF', w, L.trunks);
  limb('knF', 'ftF', w * 0.8, skin);
  // thigh in trunks then skin from mid-thigh
  const [kx, ky] = tx(rig.knF);
  g.moveTo(hx + (kx - hx) * 0.55, hy + (ky - hy) * 0.55).lineTo(kx, ky).stroke({ color: skin, width: w, cap: 'round' });
  g.moveTo(hx, hy).lineTo(hx + (kx - hx) * 0.55, hy + (ky - hy) * 0.55).stroke({ color: L.trunks, width: w + 1, cap: 'round' });
  const [ffx, ffy] = tx(rig.ftF);
  g.rect(ffx - 3 * scale, ffy - 2 * scale, 8 * scale, 3 * scale).fill(skin);
  // ---- head
  const [hdx, hdy] = tx(rig.head);
  const hr = 7 * scale;
  g.circle(hdx, hdy, hr + 1 * scale).fill(OUT);
  g.circle(hdx, hdy, hr).fill(skin);
  // jaw shadow & ear
  g.circle(hdx - 2 * facing * scale, hdy + 1 * scale, 2 * scale).fill(shade(skin, -0.15));
  // eye & brow
  g.rect(Math.round(hdx + 3 * facing * scale - (facing < 0 ? 2 * scale : 0)), Math.round(hdy - 2 * scale), 2 * scale, 2 * scale).fill(0x1c1714);
  // hair
  const hc = L.hairColor;
  const arc = (r: number, a0: number, a1: number, color: number, width: number) => {
    g.moveTo(hdx + Math.cos(a0) * r, hdy + Math.sin(a0) * r);
    g.arc(hdx, hdy, r, a0, a1).stroke({ color, width });
  };
  switch (L.hairStyle) {
    case 0:
      g.circle(Math.round(hdx - 1 * facing * scale), Math.round(hdy - 4 * scale), 1.5 * scale).fill(shade(skin, 0.25));
      break;
    case 1:
      arc(hr, Math.PI * 1.05, Math.PI * 1.95, hc, 2 * scale);
      break;
    case 4:
      g.rect(Math.round(hdx - 2 * scale), Math.round(hdy - hr - 4 * scale), 4 * scale, 6 * scale).fill(hc);
      break;
    case 5:
    case 6:
      arc(hr, Math.PI * 0.95, Math.PI * 2.05, hc, 3.5 * scale);
      g.moveTo(hdx - 5 * facing * scale, hdy).lineTo(hdx - 8 * facing * scale, hdy + 10 * scale).stroke({ color: hc, width: 3 * scale, cap: 'round' });
      break;
    case 7:
      arc(hr, Math.PI * 1.0, Math.PI * 2.0, hc, 3 * scale);
      g.circle(Math.round(hdx - 6 * facing * scale), Math.round(hdy - 6 * scale), 3 * scale).fill(hc);
      break;
    default:
      arc(hr, Math.PI * 1.0, Math.PI * 2.0, hc, 3 * scale);
  }
  if (L.beard === 3) arc(hr - 1 * scale, Math.PI * 0.1, Math.PI * 0.9, hc, 3 * scale);
  else if (L.beard === 2 || L.beard === 4) g.rect(Math.round(hdx + (facing > 0 ? 1 : -4) * scale), Math.round(hdy + 3 * scale), 3 * scale, 3 * scale).fill(hc);
  // ---- near arm with glove
  outline('shF', 'elF', w * 0.75);
  outline('elF', 'haF', w * 0.7);
  limb('shF', 'elF', w * 0.75, skin);
  limb('elF', 'haF', w * 0.7, skin);
  // gloves (far one first, darker)
  const [gbx, gby] = tx(rig.haB);
  g.circle(gbx, gby, 4 * scale).fill(OUT);
  g.circle(gbx, gby, 3.2 * scale).fill(shade(L.glove, -0.2));
  const [gfx, gfy] = tx(rig.haF);
  g.circle(gfx, gfy, 4.4 * scale).fill(OUT);
  g.circle(gfx, gfy, 3.6 * scale).fill(L.glove);
  g.rect(gfx - 1 * scale, gfy - 2 * scale, 2 * scale, 1 * scale).fill(shade(L.glove, 0.35));
}

export function trunksFor(corner: 0 | 1): number {
  return corner === 0 ? 0x9e2a2a : 0x284a86;
}

export { PAL };
