/**
 * What's on the TV in the cutscenes when it isn't fight footage: the two shows that are always
 * on somewhere in Moncton at four o'clock. FAMILY FEUDIN' (a survey board, a host with a
 * moustache and a stack of cue cards, a family that keeps getting the big red X) and JUDGE JUDGY
 * (a bob with bangs, a lace collar, a gavel, a bailiff, and no patience at all).
 *
 * Ray keeps them on at the gym for Marie. They were her shows.
 *
 * drawShow() draws one animated frame into a screen rectangle (any size: the little TV on the
 * gym wall or the full close-up); showLabels() adds the words for the close-up.
 */
import { Container, Graphics } from 'pixi.js';
import { PAL } from '../art/palette';
import { text } from './kit';

export type TvShow = 'feud' | 'judge';

const SURVEY = [['MOUTHGUARD', 38], ['SOUP', 22], ['A LAWYER', 14], ['YOUR COUSIN', 11], ['ICE', 9], ['A CHAIR', 6]] as const;
/** how many answers are up at time t (the board fills, a strike, then it starts again) */
const revealed = (t: number) => Math.floor((t % 12) / 1.4);
const strike = (t: number) => (t % 12) > 9.4 && (t % 12) < 10.4;
const pointing = (t: number) => (t % 7) > 4.2;

export function drawShow(g: Graphics, show: TvShow, x: number, y: number, w: number, h: number, t: number): void {
  const u = w / 64; // one "pixel" of the little TV
  const px = (v: number) => Math.max(1, Math.round(v * u));
  if (show === 'feud') {
    // the studio: deep blue, a frame of marquee bulbs chasing round
    g.rect(x, y, w, h).fill(0x14206a);
    for (let k = 0; k < 18; k++) {
      const on = (k + Math.floor(t * 6)) % 3 === 0;
      const bx = x + (k / 18) * w;
      g.rect(bx, y, px(1.4), px(1.4)).fill(on ? 0xffe890 : 0x6a5a2a).rect(bx, y + h - px(1.4), px(1.4), px(1.4)).fill(on ? 0xffe890 : 0x6a5a2a);
    }
    // the board
    const bx = x + w * 0.2, by = y + h * 0.1, bw = w * 0.6, bh = h * 0.5;
    g.rect(bx - px(1), by - px(1), bw + px(2), bh + px(2)).fill(0xc4a04a).rect(bx, by, bw, bh).fill(0x0a123a);
    const n = revealed(t);
    for (let i = 0; i < 6; i++) {
      const c = i % 2, r = Math.floor(i / 2);
      const sx = bx + px(1) + c * (bw / 2), sy = by + px(1) + r * (bh / 3);
      const sw = bw / 2 - px(2), sh = bh / 3 - px(2);
      // answers are ranked down the left column, then the right
      const rank = c * 3 + r;
      if (rank < n) {
        g.rect(sx, sy, sw, sh).fill(0x3a6ad8).rect(sx + px(1), sy + sh / 2 - px(0.6), sw * 0.6, Math.max(1, px(1.2))).fill(0xf2f2f2);
        g.rect(sx + sw - px(5), sy, px(5), sh).fill(0x1e3a9a);
      } else {
        g.rect(sx, sy, sw, sh).fill(0x1e2a6a);
        g.circle(sx + sw / 2, sy + sh / 2, Math.max(1, sh * 0.3)).fill(0x2a4ab8);
      }
    }
    // the floor and two family podiums
    g.rect(x, y + h * 0.66, w, h * 0.34).fill(0x2a1a4a);
    for (const [fx, col] of [[0.06, 0xc83a3a], [0.74, 0x3a6ad8]] as [number, number][]) {
      g.rect(x + w * fx, y + h * 0.74, w * 0.2, h * 0.26).fill(col).rect(x + w * fx, y + h * 0.74, w * 0.2, px(1)).fill(0xffe890);
      for (let k = 0; k < 3; k++) g.circle(x + w * (fx + 0.04 + k * 0.06), y + h * 0.7, px(1.6)).fill([0xe8c0a0, 0x8a5a3a, 0xd8a07a][k]);
    }
    // the host: bald, a big moustache, a sharp suit, cue cards; he leans in for SURVEY SAYS
    const lean = strike(t) ? px(1) : Math.round(Math.sin(t * 2) * u * 0.5);
    const hx = x + w * 0.5 + lean, hy = y + h * 0.62;
    g.rect(hx - px(4), hy, px(8), h - (hy - y)).fill(0x2a2a34).rect(hx - px(1), hy, px(2), px(5)).fill(0xc83a3a);
    g.circle(hx, hy - px(3), px(3.4)).fill(0x5a3a26).rect(hx - px(2.4), hy - px(2.6), px(4.8), px(1.2)).fill(0x141010);
    g.rect(hx + px(4), hy + px(2), px(3), px(4)).fill(0x5a8ad8);
    // the big red X
    if (strike(t)) {
      const cx = x + w / 2, cy = y + h * 0.35, s = h * 0.3;
      g.poly([cx - s, cy - s, cx - s + px(4), cy - s, cx + s, cy + s, cx + s - px(4), cy + s]).fill(0xe02020);
      g.poly([cx + s, cy - s, cx + s - px(4), cy - s, cx - s, cy + s, cx - s + px(4), cy + s]).fill(0xe02020);
    }
  } else {
    // the courtroom: wood panelling and the seal
    g.rect(x, y, w, h).fill(0x6a4026);
    for (let k = 0; k < 8; k++) g.rect(x + (k / 8) * w, y, px(0.6), h * 0.6).fill(0x5a3420);
    g.circle(x + w * 0.26, y + h * 0.24, h * 0.13).fill(0xc4a04a).circle(x + w * 0.26, y + h * 0.24, h * 0.09).fill(0x8a6a2a).circle(x + w * 0.26, y + h * 0.24, h * 0.04).fill(0xc4a04a); // the seal
    g.rect(x + w * 0.1, y + h * 0.06, px(1), h * 0.4).fill(0x3a2a1a).rect(x + w * 0.1, y + h * 0.06, px(5), px(3)).fill(0x2a4a86); // the flags
    g.rect(x + w * 0.74, y + h * 0.06, px(1), h * 0.4).fill(0x3a2a1a).rect(x + w * 0.74, y + h * 0.06, px(5), px(3)).fill(0xc83a3a).rect(x + w * 0.74 + px(2), y + h * 0.06, px(1), px(3)).fill(0xf2f2f2);
    // the judge: a bob with bangs, a lace collar, the black robe; leans in and points
    const jx = x + w / 2, jy = y + h * 0.36;
    const lean = pointing(t) ? px(1) : 0;
    g.rect(jx - px(6), jy + px(3), px(12), px(10)).fill(0x141418);
    g.poly([jx - px(3), jy + px(3), jx + px(3), jy + px(3), jx, jy + px(6)]).fill(0xf2f2f2);
    g.circle(jx, jy + lean, px(3.4)).fill(0xe8c4a0);
    // the face: a look over the glasses that has ended careers
    g.rect(jx - px(1.6), jy + px(0.2) + lean, px(1), px(0.8)).fill(0x2a1a14).rect(jx + px(0.8), jy + px(0.2) + lean, px(1), px(0.8)).fill(0x2a1a14);
    g.rect(jx - px(2.2), jy - px(0.4) + lean, px(2), px(0.4)).fill(0x5a2a1a).rect(jx + px(0.4), jy - px(0.6) + lean, px(2), px(0.4)).fill(0x5a2a1a);
    g.rect(jx - px(0.9), jy + px(1.8) + lean, px(1.8), px(0.6)).fill(0xa83a3a);
    g.rect(jx - px(4), jy - px(4) + lean, px(8), px(3)).fill(0x5a2a1a).rect(jx - px(4), jy - px(2) + lean, px(1.6), px(5)).fill(0x5a2a1a).rect(jx + px(2.4), jy - px(2) + lean, px(1.6), px(5)).fill(0x5a2a1a);
    if (pointing(t)) g.rect(jx + px(5), jy + px(5), px(6), px(1.4)).fill(0x141418).rect(jx + px(11), jy + px(5), px(1.6), px(1.4)).fill(0xe8c4a0);
    // the bench, and the gavel coming down every couple of seconds
    g.rect(x + w * 0.18, y + h * 0.56, w * 0.64, h * 0.12).fill(0x8a5a32).rect(x + w * 0.18, y + h * 0.56, w * 0.64, px(1)).fill(0xa87a4a);
    const down = (t % 2.2) < 0.25;
    const gx = jx - px(9), gy = y + h * 0.56 - (down ? px(2) : px(6));
    g.rect(gx, gy, px(4), px(2)).fill(0x5a3018).rect(gx + px(1.5), gy + px(2), px(1), px(3)).fill(0x5a3018);
    // the bailiff, arms folded, seen it all
    g.rect(x + w * 0.86, y + h * 0.46, px(6), h * 0.4).fill(0x3a4a6a).circle(x + w * 0.86 + px(3), y + h * 0.42, px(2.8)).fill(0x5a3a26);
    g.rect(x + w * 0.86 - px(0.4), y + h * 0.5, px(6.8), px(1.6)).fill(0x2a3a5a).rect(x + w * 0.86 + px(1), y + h * 0.56, px(4), px(1)).fill(0xc4a04a); // folded arms, a badge
    // the two lecterns: plaintiff, defendant
    g.rect(x, y + h * 0.7, w, h * 0.3).fill(0x4a2e1a);
    for (const fx of [0.12, 0.62]) {
      g.circle(x + w * (fx + 0.12), y + h * 0.72, px(2.6)).fill(fx < 0.5 ? 0xe0b090 : 0xb07a52);
      g.rect(x + w * (fx + 0.12) - px(2.6), y + h * 0.72 - px(2.8), px(5.2), px(1.8)).fill(fx < 0.5 ? 0xb8b0a0 : 0x1a1412); // a perm, a fade
      g.rect(x + w * fx, y + h * 0.78, w * 0.24, h * 0.22).fill(0x8a5a32).rect(x + w * fx, y + h * 0.78, w * 0.24, px(1)).fill(0xa87a4a);
    }
    // a speech bubble when she points (the words only fit on the close-up)
    if (pointing(t) && w < 120) g.roundRect(jx + px(8), y + px(2), px(14), px(8), px(2)).fill(0xf2f2f2);
  }
  // scanlines and a little glass glare
  for (let sy = y; sy < y + h; sy += Math.max(2, px(1.6))) g.rect(x, sy, w, 1).fill({ color: 0x000000, alpha: 0.18 });
  g.poly([x + w * 0.62, y, x + w * 0.74, y, x + w * 0.5, y + h, x + w * 0.38, y + h]).fill({ color: 0xffffff, alpha: 0.04 });
}

/** The words on the close-up (titles, the board, the lower third). `update(t)` animates them. */
export function showLabels(show: TvShow, x: number, y: number, w: number, h: number): { c: Container; update: (t: number) => void } {
  const c = new Container();
  if (show === 'feud') {
    c.addChild(text("FAMILY FEUDIN'", x, y + h + 4, { width: w, align: 'center', color: PAL.gold }));
    const bx = x + w * 0.2, by = y + h * 0.1, bw = w * 0.6, bh = h * 0.5;
    const answers = SURVEY.map(([a, n], rank) => {
      const col = Math.floor(rank / 3), row = rank % 3;
      const t = text(`${a}`, bx + 6 + col * (bw / 2), by + 4 + row * (bh / 3) + bh / 6 - 6, { small: true, color: PAL.ink, width: bw / 2 - 24, maxLines: 1 });
      const nTxt = text(String(n), bx + col * (bw / 2) + bw / 2 - 18, by + 4 + row * (bh / 3) + bh / 6 - 6, { small: true, color: PAL.bone });
      c.addChild(t, nTxt);
      return [t, nTxt];
    });
    const q = text('"NAME SOMETHING YOU BRING TO A FIGHT"', x, y + h * 0.62, { width: w, align: 'center', small: true, color: PAL.bone });
    const says = text('SURVEY SAYS...', x, y + h * 0.62, { width: w, align: 'center', color: PAL.gold });
    c.addChild(q, says);
    return {
      c,
      update: (t) => {
        const n = revealed(t);
        answers.forEach(([a, b], i) => (a.visible = b.visible = i < n));
        says.visible = strike(t);
        q.visible = !says.visible;
      },
    };
  }
  c.addChild(text('JUDGE JUDGY', x, y + h + 4, { width: w, align: 'center', color: PAL.gold }));
  const lower = new Graphics().rect(x, y + h - 20, w, 20).fill({ color: 0x0a0a14, alpha: 0.85 }).rect(x, y + h - 20, 4, 20).fill(0xc4a04a);
  c.addChild(lower);
  c.addChild(text('PLAINTIFF SAYS THE GYM SOUP WAS "TOO HOT".', x + 8, y + h - 17, { small: true, color: PAL.bone, width: w - 12, maxLines: 1 }));
  c.addChild(text('DEFENDANT SAYS "IT\'S SOUP".', x + 8, y + h - 9, { small: true, color: PAL.ash, width: w - 12, maxLines: 1 }));
  const bubble = new Container();
  bubble.addChild(new Graphics().roundRect(0, 0, 112, 30, 4).fill(0xf2f2f2).poly([10, 30, 22, 30, 6, 38]).fill(0xf2f2f2));
  bubble.addChild(text("Don't spit in my soup and tell me it's seasoning!", 5, 4, { small: true, color: PAL.ink, width: 104, maxLines: 3 }));
  bubble.position.set(x + w / 2 + 22, y + 6);
  c.addChild(bubble);
  return { c, update: (t) => (bubble.visible = pointing(t)) };
}
