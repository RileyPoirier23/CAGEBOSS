/**
 * The trophy case: one little object for every achievement, standing on a shelf. Each is drawn
 * in a 24x28 box (bottom = the shelf). Locked ones are drawn as dark silhouettes, so you can
 * see the shape of what you haven't won yet.
 */
import { Graphics } from 'pixi.js';
import { PAL } from '../art/palette';

type Draw = (r: (x: number, y: number, w: number, h: number, c: number) => void, o: (x: number, y: number, rad: number, c: number) => void, p: (pts: number[], c: number) => void) => void;

const GOLD = PAL.gold, LITE = 0xfff0a0, WOOD = 0x6a4a2a, DARK = 0x1a1a1e, RED = 0xb82020, WHITE = 0xf2f2f2, GREY = 0x8a8a90, SKIN = 0xe0b090;

/** a little trophy cup: the base, the stem, the cup */
const cup = (r: Parameters<Draw>[0], col = GOLD) => {
  r(6, 24, 12, 4, WOOD);
  r(10, 18, 4, 6, col);
  r(5, 8, 14, 10, col);
  r(3, 9, 2, 6, col);
  r(19, 9, 2, 6, col);
  r(7, 9, 3, 7, LITE);
};

const ART: Record<string, Draw> = {
  // ---------------- the fighter
  fm_first_w: (r, o) => { r(6, 24, 12, 4, WOOD); r(6, 8, 11, 12, RED); r(4, 12, 3, 6, RED); r(7, 20, 9, 4, WHITE); r(8, 9, 3, 3, 0xe04a4a); o(19, 21, 2, 0x8e0e0e); },
  fm_ko: (r, o, p) => { r(9, 20, 6, 4, GREY); r(8, 24, 8, 4, DARK); o(12, 12, 8, 0xd8e8f0); r(10, 12, 4, 7, 0x8a8a70); p([6, 6, 12, 12, 9, 13, 15, 18], DARK); p([18, 4, 13, 10, 16, 11], DARK); },
  fm_sub: (r) => { r(6, 24, 12, 4, WOOD); r(8, 12, 4, 12, GOLD); r(8, 8, 10, 5, GOLD); r(16, 6, 4, 4, GOLD); r(2, 6, 2, 2, LITE); r(2, 10, 3, 1, LITE); r(20, 2, 1, 3, LITE); },
  fm_dec: (r) => { r(4, 4, 16, 20, WHITE); r(4, 4, 16, 3, 0x2a4a86); r(6, 10, 4, 4, DARK); r(12, 10, 2, 4, DARK); r(15, 10, 4, 4, DARK); r(6, 17, 12, 1, GREY); r(6, 20, 9, 1, GREY); r(3, 24, 2, 4, WOOD); r(19, 24, 2, 4, WOOD); },
  fm_pro: (r, o) => { r(3, 3, 18, 22, WOOD); r(5, 5, 14, 18, 0xf2ead6); r(7, 8, 10, 1, GREY); r(7, 11, 10, 1, GREY); r(7, 14, 7, 1, GREY); o(15, 19, 3, RED); r(10, 25, 4, 3, WOOD); },
  fm_first_belt: (r) => { r(2, 14, 20, 6, 0x5a3a1a); r(7, 10, 10, 14, GOLD); r(9, 13, 6, 8, LITE); r(9, 24, 6, 4, WOOD); },
  fm_lounge: (r) => { r(2, 14, 20, 10, 0x6a2a3a); r(2, 10, 20, 6, 0x7a3a4a); r(1, 12, 3, 12, 0x5a1a2a); r(20, 12, 3, 12, 0x5a1a2a); r(3, 24, 2, 4, DARK); r(19, 24, 2, 4, DARK); r(11, 2, 2, 8, GREY); r(10, 0, 4, 3, DARK); },
  fm_show: (r, o, p) => { r(6, 24, 12, 4, WOOD); r(10, 18, 4, 6, GOLD); p([7, 4, 17, 4, 21, 9, 21, 14, 17, 19, 7, 19, 3, 14, 3, 9], GOLD); p([9, 7, 15, 7, 18, 10, 18, 13, 15, 16, 9, 16, 6, 13, 6, 10], 0x8e2f2f); },
  fm_champ: (r) => { r(0, 2, 24, 26, 0x2a3a4a); r(1, 3, 22, 24, 0x101820); r(2, 13, 20, 6, 0x1a1a1a); r(7, 8, 10, 15, GOLD); r(9, 11, 6, 9, LITE); r(10, 13, 4, 4, RED); r(1, 3, 3, 24, 0x3a5a6a); },
  fm_streak5: (r, o, p) => { r(6, 24, 12, 4, WOOD); p([12, 2, 19, 14, 17, 22, 7, 22, 5, 14, 9, 8, 10, 13], 0xe8742a); p([12, 9, 15, 16, 14, 22, 10, 22, 9, 16], LITE); for (let k = 0; k < 5; k++) r(6 + k * 3, 25, 1, 2, GOLD); },
  fm_10w: (r) => { r(2, 24, 20, 4, WOOD); r(3, 4, 4, 20, GOLD); r(1, 4, 3, 3, GOLD); r(10, 4, 11, 20, GOLD); r(13, 7, 5, 14, 0x3a2a14); r(4, 5, 1, 18, LITE); },
  fm_reader: (r, o) => { r(3, 6, 14, 18, WHITE); for (let k = 0; k < 5; k++) r(5, 9 + k * 3, 10, 1, GREY); o(15, 13, 6, GOLD); o(15, 13, 4, 0xbcd8e8); r(19, 18, 3, 8, WOOD); r(3, 24, 14, 4, WOOD); },
  fm_binding: (r, o) => { r(2, 8, 12, 16, 0xf2ead6); r(4, 11, 8, 1, GREY); r(4, 14, 8, 1, GREY); r(4, 18, 6, 1, 0x2a4a86); o(18, 22, 5, DARK); r(14, 14, 2, 2, GREY); r(15, 16, 2, 2, GREY); r(16, 18, 2, 2, GREY); r(2, 24, 12, 4, WOOD); },
  fm_rap: (r) => { r(2, 6, 20, 20, 0xd8b878); r(2, 4, 8, 3, 0xd8b878); r(3, 8, 18, 2, 0xf2ead6); r(3, 11, 18, 2, 0xf2ead6); r(3, 14, 18, 2, 0xf2ead6); r(6, 18, 12, 5, RED); r(2, 26, 20, 2, WOOD); },
  fm_jerky: (r, o) => { r(4, 6, 16, 20, 0x8ab8c8); r(5, 7, 14, 18, 0x4a6a7a); r(3, 4, 18, 3, GREY); r(9, 10, 3, 14, 0x7a3a1a); r(13, 12, 3, 12, 0x6a2a14); r(6, 26, 12, 2, WOOD); r(15, 8, 3, 3, 0xe8d020); },
  fm_creator: (r, o) => { o(12, 9, 8, LITE); o(12, 9, 5, DARK); r(9, 5, 6, 9, 0x2a2a34); r(10, 6, 4, 7, 0x2aa0d8); r(11, 17, 2, 9, GREY); r(7, 26, 10, 2, DARK); },
  fm_bk: (r) => { r(6, 24, 12, 4, WOOD); r(6, 8, 12, 14, SKIN); r(6, 8, 12, 2, WHITE); r(6, 13, 12, 2, WHITE); r(6, 18, 12, 2, WHITE); r(7, 10, 2, 2, 0xb82020); r(17, 4, 4, 5, WHITE); },
  fm_media: (r) => { r(9, 2, 7, 10, GREY); r(10, 3, 5, 8, 0x5a5a64); r(8, 12, 9, 6, RED); r(11, 18, 3, 6, DARK); r(7, 24, 11, 4, DARK); },
  fm_rich: (r) => { for (let k = 0; k < 5; k++) r(3, 10 + k * 3, 18, 3, k % 2 ? 0x4a8a4a : 0x5a9a5a); r(10, 10, 4, 15, 0xc8a050); r(5, 24, 14, 4, WOOD); r(8, 6, 2, 3, LITE); },
  // ---------------- Road To Champion
  rtc_soup: (r) => { r(3, 12, 18, 12, GOLD); r(3, 12, 18, 3, LITE); r(1, 14, 2, 3, GOLD); r(21, 14, 2, 3, GOLD); r(15, 2, 2, 12, GREY); r(13, 1, 6, 2, GREY); r(6, 6, 1, 4, 0xd8d8d8); r(9, 4, 1, 5, 0xd8d8d8); r(4, 24, 16, 4, WOOD); },
  rtc_rival: (r, o) => { r(1, 14, 22, 7, WHITE); r(5, 10, 13, 5, 0xd8d8d8); r(6, 11, 5, 3, 0x2a3a4a); r(12, 11, 5, 3, 0x2a3a4a); o(6, 21, 3, DARK); o(18, 21, 3, DARK); r(14, 3, 9, 6, RED); r(15, 5, 7, 2, WHITE); r(2, 25, 20, 3, WOOD); },
  rtc_epilogue: (r) => { r(11, 0, 2, 3, GREY); r(8, 2, 1, 6, 0xe8e0c8); r(15, 2, 1, 6, 0xe8e0c8); r(3, 7, 8, 10, 0x8e2f2f); r(13, 7, 8, 10, 0x8e2f2f); r(4, 17, 6, 4, 0xd8c8a8); r(14, 17, 6, 4, 0xd8c8a8); r(5, 9, 2, 2, 0xb84a4a); r(6, 24, 12, 4, WOOD); },
  // ---------------- Legacy Mode
  leg_start: (r) => { r(4, 4, 16, 20, 0xf2ead6); r(6, 7, 12, 1, GREY); r(6, 10, 12, 1, GREY); r(6, 13, 8, 1, GREY); r(4, 24, 16, 4, WOOD); r(10, 4, 2, 20, 0x1a1418); },
  leg_chaos: (r, o, p) => { p([8, 26, 16, 26, 13, 10, 11, 10], 0xe8742a); r(9, 18, 6, 2, WHITE); r(4, 8, 16, 3, 0x8a5a2a); r(8, 3, 8, 6, 0x8a5a2a); r(8, 7, 8, 1, 0x3a2414); r(6, 26, 12, 2, DARK); },
  // ---------------- the promoter
  c_first_event: (r) => { r(2, 9, 20, 11, 0xe8c050); r(2, 9, 20, 2, RED); r(15, 9, 1, 11, 0x8a6a2a); r(4, 13, 9, 1, DARK); r(4, 16, 6, 1, DARK); r(4, 24, 16, 4, WOOD); },
  c_ten_events: (r, o) => { o(12, 12, 9, GOLD); for (let k = 0; k < 8; k++) { const a = (k * Math.PI) / 4; r(Math.round(12 + Math.cos(a) * 9) - 2, Math.round(12 + Math.sin(a) * 9) - 2, 4, 4, GOLD); } o(12, 12, 4, 0x3a2a14); r(6, 24, 12, 4, WOOD); },
  c_ppv: (r) => { r(2, 5, 20, 16, 0x5a3a22); r(4, 7, 13, 12, 0x2a4a3a); r(18, 8, 3, 2, GREY); r(18, 12, 3, 2, GREY); r(9, 9, 3, 8, 0x8aff6a); r(7, 10, 7, 2, 0x8aff6a); r(7, 14, 7, 2, 0x8aff6a); r(6, 21, 2, 4, DARK); r(16, 21, 2, 4, DARK); r(8, 1, 1, 4, GREY); r(15, 1, 1, 4, GREY); r(4, 25, 16, 3, WOOD); },
  c_sellout: (r) => { r(1, 8, 22, 12, RED); r(2, 9, 20, 10, 0xd83030); r(4, 11, 16, 2, WHITE); r(4, 15, 12, 2, WHITE); r(5, 20, 2, 6, GREY); r(17, 20, 2, 6, GREY); r(3, 26, 18, 2, DARK); },
  c_presented: (r) => { r(7, 5, 10, 19, 0x1a1a24); r(7, 5, 10, 2, GREY); r(8, 9, 8, 10, 0x8aff6a); r(10, 11, 4, 6, 0x1a1a24); r(5, 24, 14, 4, WOOD); },
  c_act2: (r, o) => { o(12, 14, 10, 0xbcd8e8); o(12, 14, 9, 0x2a3a44); r(8, 16, 8, 4, 0x5a3014); r(10, 14, 4, 2, 0x5a3014); r(6, 17, 2, 1, 0x5a3014); r(16, 17, 2, 1, 0x5a3014); r(9, 12, 1, 2, 0x5a3014); r(14, 12, 1, 2, 0x5a3014); r(1, 24, 22, 4, WOOD); },
  c_act3: (r) => { r(8, 2, 8, 22, GOLD); r(5, 10, 4, 14, GOLD); r(15, 8, 4, 16, GOLD); for (let y = 4; y < 22; y += 4) r(10, y, 4, 2, 0x8a6a2a); r(9, 3, 2, 19, LITE); r(4, 24, 16, 4, WOOD); },
  c_rich: (r) => { r(2, 20, 9, 5, GOLD); r(13, 20, 9, 5, GOLD); r(7, 15, 10, 5, GOLD); r(3, 20, 2, 1, LITE); r(8, 15, 2, 1, LITE); r(14, 20, 2, 1, LITE); r(2, 25, 20, 3, WOOD); },
  c_clean: (r) => { r(9, 2, 6, 10, WOOD); r(7, 0, 10, 3, 0x8a6a4a); r(4, 12, 16, 6, 0x2a2a30); r(3, 18, 18, 2, 0x5a1a1a); r(3, 22, 18, 5, 0xf2ead6); r(5, 23, 14, 3, 0x2a8a3a); },
  c_ending: (r) => { r(11, 4, 2, 22, WOOD); r(2, 6, 12, 5, 0xf2ead6); r(10, 13, 12, 5, 0xf2ead6); r(2, 6, 2, 5, DARK); r(20, 13, 2, 5, DARK); r(4, 8, 7, 1, GREY); r(12, 15, 7, 1, GREY); r(6, 26, 12, 2, 0x3a5a3a); },
};

/** Draw achievement `id`'s object with its bottom-centre at (cx, by). */
export function drawTrophy(g: Graphics, id: string, cx: number, by: number, locked: boolean, scale = 1): void {
  const x0 = cx - 12 * scale, y0 = by - 28 * scale;
  const col = (c: number) => (locked ? 0x3a302a : c);
  const r = (x: number, y: number, w: number, h: number, c: number) => {
    if (w > 0 && h > 0) g.rect(x0 + x * scale, y0 + y * scale, w * scale, h * scale).fill({ color: col(c), alpha: locked ? 0.7 : 1 });
  };
  const o = (x: number, y: number, rad: number, c: number) => {
    if (rad > 0) g.circle(x0 + x * scale, y0 + y * scale, rad * scale).fill({ color: col(c), alpha: locked ? 0.7 : 1 });
  };
  const p = (pts: number[], c: number) => g.poly(pts.map((v, i) => (i % 2 ? y0 : x0) + v * scale)).fill({ color: col(c), alpha: locked ? 0.7 : 1 });
  const art = ART[id];
  if (art) art(r, o, p);
  else cup(r);
}
