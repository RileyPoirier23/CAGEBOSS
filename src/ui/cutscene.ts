/**
 * Cutscenes: little pixel-art scenes for the story (and weigh-in face-offs and pressers).
 * A cutscene is a list of shots; each shot is a location, a cast standing in it, and lines of
 * dialogue (typewriter text, a name tag, the speaker bobbing). Optional choices at the end.
 * Characters are drawn with the fight rig, so fighters look like themselves.
 *
 *   playCutscene(g, scene, (choice) => ...)
 */
import { Container, Graphics, type Ticker } from 'pixi.js';
import type { Game } from './app';
import type { Fighter } from '../core/types';
import { PAL } from '../art/palette';
import { W, H, text, button, box } from './kit';
import { POSES, drawRig, lookFor, type Look2, type Pose } from './rig';
import { input } from '../core/input';
import { sfx } from '../audio/sfx';

export type Bg = 'gym' | 'tv' | 'street' | 'bingo' | 'hotel' | 'locker' | 'office' | 'presser' | 'stage' | 'cage' | 'lot' | 'booth' | 'landlord' | 'black';

export interface Actor {
  id: string;
  /** a fighter (drawn as himself), or a fixed look */
  fighter?: Fighter;
  look?: Look2;
  /** street clothes over a fighter's look */
  clothes?: { top: number; bottom: number };
  name: string;
  x: number;
  facing: 1 | -1;
  pose?: Pose;
  scale?: number;
  /** walk in from off-screen */
  enter?: 'left' | 'right';
}
export interface Line {
  who: string | null;
  text: string;
  /** pose changes as the line starts */
  poses?: Record<string, Pose>;
  shake?: boolean;
  flash?: boolean;
  sfx?: 'punch' | 'thud' | 'roar' | 'crowd' | 'bell' | 'snap' | 'click' | 'cash' | 'whoosh';
}
export interface Shot {
  bg: Bg;
  cast: Actor[];
  lines: Line[];
  /** a caption over the shot ("ONE WEEK LATER") */
  caption?: string;
  /** what's on the TV (the 'tv' set) */
  tv?: 'beast' | 'zac' | 'tape';
}
export interface Cutscene {
  title?: string;
  shots: Shot[];
  choices?: { id: string; label: string }[];
}

// ------------------------------------------------------------ the regular cast

const base = (o: Partial<Look2>): Look2 => ({ skin: 0xd8a07a, hairStyle: 1, hairColor: 0x2a1a10, beard: 0, build: 1, trunks: 0x222222, trim: 0x222222, glove: 0xd8a07a, stance: 'upright', female: false, tattoo: 0, ...o });
export const CAST: Record<string, Look2> = {
  // Uncle Ray: 70, grey ponytail and beard, cardigan over a stained apron, forearms like hams
  ray: base({ skin: 0xd09a74, hairStyle: 3, hairColor: 0xb4afa6, beard: 3, build: 2, brows: 1, outfit: { top: 0x6a5a48, bottom: 0x3a3632, shirt: 0xd8d0bc, bulk: 2, hands: 0xd09a74 } }),
  // Dane Whyte: bald, black shirt, black suit, no tie, permanently on the phone
  dane: base({ skin: 0xe2b392, hairStyle: 0, beard: 0, build: 2, outfit: { top: 0x15151a, bottom: 0x15151a, shirt: 0x202024, bulk: 2, hands: 0xe2b392 } }),
  // Gordon Vance: the landlord. Silver side-part, navy three-piece, red tie, a clipboard he never reads
  gordon: base({ skin: 0xe8c0a0, hairStyle: 2, hairColor: 0xc8c4bc, beard: 0, build: 1, outfit: { top: 0x1c2848, bottom: 0x1c2848, shirt: 0xeeeeee, tie: 0x9a2020, bulk: 1, hands: 0xe8c0a0 } }),
  // Bradie: curly mop, blue Only Fighters hoodie
  bradie: base({ skin: 0xe8c0a0, hairStyle: 8, hairColor: 0xe0d4b0, beard: 1, build: 1, outfit: { top: 0x2aa0d8, bottom: 0x2a2a30, bulk: 1, hands: 0xe8c0a0 } }),
  // the Lounge producer: black tee, headset
  producer: base({ skin: 0x8a5a3a, hairStyle: 1, hairColor: 0x101010, beard: 2, build: 1, outfit: { top: 0x18181c, bottom: 0x3a3a44, mic: true, bulk: 0, shortSleeves: true, hands: 0x8a5a3a } }),
  // Jimmy Quavo: the guy in the parking lot. Tracksuit, beanie
  jimmy: base({ skin: 0xc68a5e, hairStyle: 0, beard: 2, build: 1, outfit: { top: 0x101014, bottom: 0x101014, patch: 0xf2f2f2, bulk: 1, hands: 0xc68a5e } }),
  // Mateo: twelve, in a hoodie three sizes too big
  mateo: base({ skin: 0xb07a52, hairStyle: 1, hairColor: 0x1a1412, beard: 0, build: 0, outfit: { top: 0xb8733a, bottom: 0x2a2a44, bulk: 2, hands: 0xb07a52 } }),
  // a regional promoter: slicked hair, a shirt you can hear
  promoter: base({ skin: 0xe0a882, hairStyle: 2, hairColor: 0x161412, beard: 1, build: 2, outfit: { top: 0xb8402a, bottom: 0x2a2a30, shirt: 0xf0e0a0, bulk: 2, hands: 0xe0a882 } }),
  // Xavier "Allstar" Cockett: cowboy hat, big beard, pearl-snap shirt, boots
  xavier: base({ skin: 0xdcae88, hairStyle: 2, hairColor: 0x3b2a1e, beard: 3, build: 1, hat: 1, outfit: { top: 0xc8b8a0, bottom: 0x2a3a5a, bulk: 1, hands: 0xdcae88 } }),
  // "Dirty" Daniel Stinkovich: curly mop, a bit pudgy, glasses, referee black
  daniel: base({ skin: 0xf0cfae, hairStyle: 8, hairColor: 0x3b2a1e, beard: 0, build: 2, glasses: 2, outfit: { top: 0x141418, bottom: 0x1c1c22, bulk: 2, shortSleeves: true, hands: 0xf0cfae, patch: 0xd8d8d8 } }),
  // Zac's manager: Lenny Pratt. Bad suit, worse intentions
  lenny: base({ skin: 0xe0b090, hairStyle: 3, hairColor: 0x1a1412, beard: 4, build: 2, outfit: { top: 0x5a4a2a, bottom: 0x3a3020, shirt: 0xd8c890, tie: 0x8a6a1a, bulk: 2, hands: 0xe0b090 } }),
  // a reporter
  reporter: base({ skin: 0xe0b090, hairStyle: 4, hairColor: 0x6a3a1a, beard: 0, build: 0, female: true, outfit: { top: 0x6a4c72, bottom: 0x222228, mic: true, hands: 0xe0b090 } }),
};

// ------------------------------------------------------------ backgrounds

const FLOOR = 196;

function drawBg(g: Graphics, bg: Bg, tv?: Shot['tv']): void {
  g.clear();
  const sky = (a: number, b: number, h = FLOOR) => {
    for (let y = 0; y < h; y += 2) g.rect(0, y, W, 2).fill(lerp(a, b, y / h));
  };
  /** a hanging lamp with a cone of warm light under it */
  const lamp = (x: number, y = 0, len = 40, a = 0.1, col = 0xffe2a0) => {
    g.rect(x, y, 1, len).fill(0x1a1a1e);
    g.poly([x - 7, y + len, x + 8, y + len, x + 5, y + len - 6, x - 4, y + len - 6]).fill(0x2a2a30);
    g.poly([x - 6, y + len, x + 7, y + len, x + 70, FLOOR + 20, x - 69, FLOOR + 20]).fill({ color: col, alpha: a });
    g.rect(x - 2, y + len, 5, 2).fill(0xfff2c8);
  };
  const bricks = (c1: number, c2: number, c3: number, h = FLOOR) => {
    g.rect(0, 0, W, h).fill(c1);
    for (let y = 0; y < h; y += 8) for (let x = (y / 8) % 2 ? -10 : 0; x < W; x += 20) g.rect(x + 1, y + 1, 18, 6).fill(((x * 7 + y * 13) % 5) ? c2 : c3);
  };
  const poster = (x: number, y: number, w: number, h: number, paper: number, ink: number) => {
    g.rect(x, y, w, h).fill(paper).rect(x + 3, y + 4, w - 6, Math.round(h * 0.45)).fill(ink);
    for (let k = 0; k < 3; k++) g.rect(x + 3, y + Math.round(h * 0.55) + k * 5, w - 6 - k * 6, 2).fill(0x5a5650);
    g.rect(x + w / 2 - 1, y - 1, 3, 3).fill(0xc8c8c8); // the pin
  };
  switch (bg) {
    case 'gym':
    case 'tv': {
      bricks(0x4a2a24, 0x5c3229, 0x52302a);
      // the window: rain light and a streetlight outside
      g.rect(24, 26, 96, 74).fill(0x141c2a);
      for (let k = 0; k < 14; k++) g.rect(28 + ((k * 23) % 88), 30 + ((k * 37) % 64), 1, 5).fill(0x4a6280);
      g.rect(24, 26, 96, 74).stroke({ color: 0x2a2a30, width: 4 }).rect(71, 26, 2, 74).fill(0x2a2a30).rect(24, 62, 96, 2).fill(0x2a2a30);
      g.rect(20, 100, 104, 4).fill(0x3a3a40);
      // the sign
      g.rect(150, 18, 180, 26).fill(0x1a1416).rect(150, 18, 180, 26).stroke({ color: 0xc4a04a, width: 2 });
      // the TV above the soup counter (Spadam on it, if you look closely)
      g.rect(352, 40, 72, 46).fill(0x101014).rect(356, 44, 64, 38).fill(0x1a2a3a);
      g.rect(358, 70, 60, 10).fill(0x2a3a4a).rect(380, 50, 6, 20).fill(0xe8d4b8).rect(392, 54, 5, 16).fill(0xd8b090);
      g.rect(386, 86, 4, 10).fill(0x2a2a30);
      // heavy bags on chains
      for (const bx of [170, 236]) {
        g.rect(bx + 9, 44, 2, 30).fill(0x6a6a70);
        g.roundRect(bx, 74, 20, 62, 6).fill(0x8e2f2f).rect(bx + 3, 78, 3, 54).fill(0xa84a40).rect(bx, 96, 20, 3).fill(0x5a1a1a).rect(bx, 118, 20, 3).fill(0x5a1a1a);
      }
      // posters: Ray in '87, the Golden Gloves, and the CBFC (the tall one is the White Beast)
      poster(286, 56, 38, 52, 0xd8d0b8, 0x8e2f2f);
      poster(120, 116, 30, 40, 0xe2dccc, 0x2a4a86);
      g.rect(300, 116, 30, 44).fill(0xd8d0b8).rect(303, 119, 24, 26).fill(0x14141a).rect(312, 121, 6, 22).fill(0xe8d4b8).rect(310, 121, 10, 6).fill(0x6a4527);
      // the ring apron in the back, ropes red-white-blue
      g.rect(0, 150, 140, 12).fill(0x2a2a34);
      for (const [y, c] of [[128, 0xa83232], [136, 0xd8d8d8], [144, 0x2a4a86]] as [number, number][]) g.rect(0, y, 140, 2).fill(c);
      g.rect(136, 120, 6, 42).fill(0x6a6a70);
      // stove + the soup pot, ladle in it
      g.rect(352, 150, 98, 46).fill(0x3a3a40).rect(352, 150, 98, 4).fill(0x5a5a62);
      g.roundRect(370, 118, 64, 34, 4).fill(0x8a8a90).rect(370, 118, 64, 5).fill(0xb0b0b6).rect(364, 126, 6, 4).fill(0x6a6a70).rect(434, 126, 6, 4).fill(0x6a6a70);
      g.rect(418, 104, 3, 18).fill(0x9a9aa0).rect(414, 102, 10, 3).fill(0x9a9aa0);
      g.rect(452, 160, 22, 36).fill(0x5a3a22).rect(452, 160, 22, 3).fill(0x7a5a3a); // the donation stool
      // floor: old blue mats with tape seams, a mop bucket
      g.rect(0, FLOOR, W, H - FLOOR).fill(0x2a3a4a);
      for (let x = 0; x < W; x += 60) g.rect(x, FLOOR, 1, H - FLOOR).fill(0x1a2a3a);
      g.rect(0, FLOOR + 14, W, 1).fill(0x34485a);
      g.rect(130, FLOOR - 18, 18, 18).fill(0xc4a04a).rect(130, FLOOR - 18, 18, 3).fill(0xe0c060).rect(138, FLOOR - 48, 2, 32).fill(0x8a6a4a);
      lamp(200, 0, 14, 0.07);
      lamp(400, 0, 14, 0.06);
      if (bg === 'tv') {
        // close on the TV: a frame inside the frame
        g.rect(0, 0, W, H).fill({ color: 0x000000, alpha: 0.55 });
        g.rect(110, 26, 260, 150).fill(0x0c0c10).rect(118, 32, 244, 132).fill(0x1a2632);
        for (let y = 32; y < 164; y += 3) g.rect(118, y, 244, 1).fill({ color: 0x000000, alpha: 0.25 });
        // what's on: a little cage, two little men
        g.rect(118, 32, 244, 108).fill(0x2a1e2a);
        for (let x = 118; x < 362; x += 4) g.rect(x, 50, 1, 80).fill(0x3a3a48);
        g.rect(118, 128, 244, 12).fill(0xcfc8b9);
        const mini = (o: Partial<Look2>): Look2 => base({ trunks: 0x8e2f2f, trim: 0xd8d8d8, glove: 0x8e1e1e, ...o });
        if (tv === 'zac') {
          drawRig(g, POSES.top, 230, 128, 1, mini({ skin: 0xf0cfae, hairStyle: 2, hairColor: 0x8c3a22, beard: 1 }), 0.75);
          drawRig(g, POSES.bottomSub, 262, 128, -1, mini({ skin: 0xc08e64, hairStyle: 1, trunks: 0x2a4a86, glove: 0x1e3a7a }), 0.75);
        } else {
          // the White Beast: six foot seven, long brown hair, a knee
          drawRig(g, POSES.knee, 220, 128, 1, mini({ skin: 0xf0cfae, hairStyle: 9, hairColor: 0x3b2a1e, beard: 3, trunks: 0xe8e8e4, build: 2 }), 0.9);
          drawRig(g, POSES.doubled, 262, 128, -1, mini({ skin: tv === 'tape' ? 0xdcae88 : 0x9a6844, hairStyle: 2, trunks: 0x2a4a86, glove: 0x1e3a7a }), 0.72);
          // the referee, curly mop and glasses, already raising a hand
          drawRig(g, POSES.celebrate, 310, 128, -1, mini({ skin: 0xf0cfae, hairStyle: 8, hairColor: 0x3b2a1e, build: 2, glasses: 2, outfit: { top: 0x141418, bottom: 0x1c1c22, bulk: 2, shortSleeves: true, hands: 0x4a7ad8 } }), 0.6);
        }
        for (let y = 32; y < 164; y += 3) g.rect(118, y, 244, 1).fill({ color: 0x000000, alpha: 0.22 });
        g.rect(118, 140, 244, 24).fill(0x8e2f2f).rect(118, 140, 60, 24).fill(0xc4a04a);
        g.rect(232, 176, 16, 14).fill(0x1a1a1e);
      }
      break;
    }
    case 'street': {
      sky(0x0a0c18, 0x1a1830);
      // buildings with lit windows
      g.rect(0, 40, 140, FLOOR - 40).fill(0x18161e).rect(330, 30, 150, FLOOR - 30).fill(0x16141c);
      for (let y = 50; y < FLOOR - 20; y += 16) for (let x = 10; x < 130; x += 22) g.rect(x, y, 10, 8).fill((x + y) % 3 ? 0x3a3428 : 0x8a7a40);
      for (let y = 44; y < FLOOR - 30; y += 18) for (let x = 340; x < 470; x += 24) g.rect(x, y, 12, 9).fill((x * y) % 7 ? 0x2a2620 : 0x7a6a3a);
      // the gym front: brick, a door with a bell, the window with the soup sign
      g.rect(140, 70, 190, FLOOR - 70).fill(0x3a2220);
      for (let y = 72; y < FLOOR; y += 8) for (let x = 140 + ((y / 8) % 2 ? 0 : 10); x < 330; x += 20) g.rect(x, y, 18, 6).fill(0x44282a);
      g.rect(170, 110, 60, FLOOR - 110).fill(0x1a1416).rect(176, 116, 48, 30).fill(0x2a3a4a).circle(220, 156, 2).fill(0xc4a04a);
      g.rect(240, 110, 76, 52).fill(0x2a3a4a).rect(244, 114, 68, 44).fill(0x34485a);
      g.rect(150, 78, 170, 22).fill(0x101014);
      g.rect(140, 100, 190, 4).fill(0x8e2f2f).poly([140, 104, 330, 104, 322, 112, 148, 112]).fill(0x6a1e1e); // the awning
      // sidewalk, curb, road, a puddle
      g.rect(0, FLOOR, W, 10).fill(0x3a3a40).rect(0, FLOOR + 10, W, H - FLOOR - 10).fill(0x1a1a20);
      for (let x = 0; x < W; x += 40) g.rect(x, FLOOR + 30, 20, 2).fill(0x8a8460);
      g.ellipse(250, FLOOR + 20, 34, 4).fill(0x2a3a52);
      // the white sports car
      g.roundRect(330, FLOOR - 4, 120, 26, 8).fill(0xeeeeee).rect(352, FLOOR - 16, 60, 14).fill(0xd8d8d8).rect(358, FLOOR - 14, 22, 10).fill(0x2a3a4a).rect(384, FLOOR - 14, 22, 10).fill(0x2a3a4a);
      g.circle(352, FLOOR + 22, 9).fill(0x101010).circle(430, FLOOR + 22, 9).fill(0x101010).circle(352, FLOOR + 22, 4).fill(0x8a8a90).circle(430, FLOOR + 22, 4).fill(0x8a8a90);
      g.rect(444, FLOOR + 2, 6, 4).fill(0xffe8a0);
      break;
    }
    case 'bingo': {
      // a church-basement bingo hall turned fight night: wood panelling, the number board, folding chairs
      g.rect(0, 0, W, FLOOR).fill(0x5a4026);
      for (let x = 0; x < W; x += 16) g.rect(x, 0, 1, FLOOR).fill(0x4a321e);
      g.rect(0, 108, W, 4).fill(0x3a2616);
      g.rect(100, 14, 280, 64).fill(0x101014).rect(100, 14, 280, 64).stroke({ color: 0x6a5a3a, width: 3 });
      for (let r = 0; r < 5; r++) for (let c = 0; c < 15; c++) g.rect(108 + c * 18, 20 + r * 11, 14, 8).fill((r * 7 + c * 3) % 5 === 0 ? 0xffd860 : 0x2a2a20);
      // a little cage (one wobbly panel) and a banner
      g.rect(150, 116, 180, 6).fill(0x8e2f2f);
      for (let x = 150; x < 330; x += 4) g.rect(x, 122, 1, 60).fill(0x3a3a40);
      g.rect(210, 122, 1, 60).fill(0x6a6a70).rect(270, 126, 1, 56).fill(0x6a6a70);
      // folding chairs
      for (let x = 12; x < W; x += 40) if (x < 140 || x > 340) g.rect(x, FLOOR - 26, 22, 3).fill(0x8a8a90).rect(x, FLOOR - 46, 22, 20).fill(0x6a6a72).rect(x + 2, FLOOR - 23, 2, 23).fill(0x5a5a60).rect(x + 18, FLOOR - 23, 2, 23).fill(0x5a5a60);
      g.rect(0, FLOOR, W, H - FLOOR).fill(0x8a7a5a);
      for (let x = 0; x < W; x += 24) for (let y = FLOOR; y < H; y += 12) g.rect(x + ((y / 12) % 2 ? 12 : 0), y, 11, 11).fill(0x9a8a6a);
      lamp(120, 0, 10, 0.08);
      lamp(360, 0, 10, 0.08);
      break;
    }
    case 'hotel': {
      // the fighters' hotel lobby: carpet with a pattern only a hotel could love, a lounge, a lamp
      g.rect(0, 0, W, FLOOR).fill(0x3a2a34);
      for (let x = 0; x < W; x += 40) g.rect(x, 0, 20, FLOOR).fill(0x42303c);
      g.rect(0, 120, W, 3).fill(0xc4a04a);
      g.rect(60, 30, 90, 60).fill(0xc4a04a).rect(64, 34, 82, 52).fill(0x5a7a8a).rect(64, 66, 82, 20).fill(0x3a5a4a); // a painting of a lake
      g.rect(330, 30, 90, 60).fill(0xc4a04a).rect(334, 34, 82, 52).fill(0x8a5a3a).circle(375, 58, 12).fill(0xd8a040);
      // a booth table with a menu on it
      g.roundRect(170, FLOOR - 56, 140, 40, 6).fill(0x6a2a3a).rect(170, FLOOR - 70, 140, 16).fill(0x7a3a4a);
      g.rect(200, FLOOR - 30, 80, 6).fill(0x2a1a14).rect(236, FLOOR - 24, 8, 24).fill(0x2a1a14);
      g.rect(226, FLOOR - 36, 24, 6).fill(0xe8e0d0);
      g.rect(0, FLOOR, W, H - FLOOR).fill(0x5a2a2a);
      for (let x = 0; x < W; x += 16) for (let y = FLOOR; y < H; y += 8) g.rect(x + ((y / 8) % 2 ? 8 : 0), y + 2, 4, 4).fill(0x7a3a2a);
      lamp(240, 0, 30, 0.1);
      break;
    }
    case 'locker': {
      // concrete, lockers, a bench, a whiteboard with somebody's gameplan
      g.rect(0, 0, W, FLOOR).fill(0x4a4e54);
      for (let y = 0; y < FLOOR; y += 24) g.rect(0, y, W, 1).fill(0x3e4248);
      for (let x = 10; x < 300; x += 32) {
        g.rect(x, 40, 30, 150).fill(0x2a4a6a).rect(x, 40, 30, 150).stroke({ color: 0x1a2a3a, width: 1 });
        for (let k = 0; k < 4; k++) g.rect(x + 8, 50 + k * 3, 14, 1).fill(0x1a2a3a);
        g.rect(x + 24, 110, 3, 8).fill(0xb0b0b6);
      }
      g.rect(320, 40, 140, 80).fill(0xe8e8e4).rect(320, 40, 140, 80).stroke({ color: 0x8a8a90, width: 3 });
      g.rect(332, 54, 60, 2).fill(0x2a4a86).rect(332, 64, 90, 2).fill(0x8e2f2f).rect(332, 74, 50, 2).fill(0x2a4a86).circle(430, 90, 10).stroke({ color: 0x8e2f2f, width: 2 });
      g.rect(40, FLOOR - 24, 400, 6).fill(0x8a6a4a).rect(60, FLOOR - 18, 4, 18).fill(0x3a3a40).rect(416, FLOOR - 18, 4, 18).fill(0x3a3a40);
      g.rect(0, FLOOR, W, H - FLOOR).fill(0x5a5e64);
      for (let x = 0; x < W; x += 30) g.rect(x, FLOOR, 1, H - FLOOR).fill(0x4a4e54);
      lamp(150, 0, 20, 0.08, 0xd8ecff);
      lamp(360, 0, 20, 0.08, 0xd8ecff);
      break;
    }
    case 'office': {
      sky(0x0c1020, 0x1c2440);
      // skyline in the window, with a moon
      g.rect(20, 20, 300, 150).fill(0x101830).circle(270, 50, 10).fill(0xe8e4d0);
      for (let i = 0; i < 18; i++) {
        const bh = 40 + ((i * 37) % 90);
        g.rect(24 + i * 16, 170 - bh, 14, bh).fill(0x0a1020);
        for (let y = 175 - bh; y < 166; y += 7) if ((i + y) % 3) g.rect(27 + i * 16, y, 3, 3).fill(0x8a7a40);
      }
      g.rect(20, 20, 300, 150).stroke({ color: 0x2a2a34, width: 4 }).rect(168, 20, 4, 150).fill(0x2a2a34);
      // the belt in its case, a framed fight poster, a fridge of energy drinks
      g.rect(350, 50, 100, 70).fill(0x14141a).rect(350, 50, 100, 70).stroke({ color: 0x4a4a54, width: 2 });
      g.rect(362, 80, 76, 14).fill(0x1a1a1a).roundRect(386, 72, 28, 30, 4).fill(0xc4a04a).rect(394, 80, 12, 14).fill(0xe8d080);
      g.rect(456, 60, 22, 136).fill(0x2a2a30).rect(458, 64, 18, 128).fill(0x3a5a3a);
      for (let y = 70; y < 190; y += 12) for (let x = 460; x < 474; x += 5) g.rect(x, y, 3, 8).fill(0x8aff6a);
      // desk with a phone (always ringing) and a nameplate
      g.rect(0, FLOOR, W, H - FLOOR).fill(0x2a1e18);
      g.rect(250, FLOOR - 40, 200, 40).fill(0x4a3226).rect(250, FLOOR - 40, 200, 4).fill(0x6a4a36);
      g.rect(270, FLOOR - 48, 18, 8).fill(0x101014).rect(400, FLOOR - 46, 34, 6).fill(0xc4a04a);
      lamp(330, 0, 22, 0.08);
      break;
    }
    case 'presser':
    case 'stage': {
      sky(0x08080c, 0x18141c);
      // the step-and-repeat: sponsor grid with a lit edge
      g.rect(30, 16, 420, 134).fill(0x101014).rect(30, 16, 420, 2).fill(0x3a3a44);
      for (let y = 22; y < 146; y += 20) for (let x = 36; x < 444; x += 52) g.rect(x, y, 44, 12).fill([0x8e2f2f, 0x2a4a86, 0x2a2a30, 0xc4a04a][((x + y) / 4) % 4 | 0]);
      // truss and stage lights
      g.rect(0, 6, W, 4).fill(0x2a2a30);
      for (const lx of [60, 160, 320, 420]) g.rect(lx - 5, 10, 10, 8).fill(0x1a1a1e).circle(lx, 18, 3).fill(0xfff2c8);
      if (bg === 'presser') {
        g.rect(40, FLOOR - 34, 400, 34).fill(0x1a1a20).rect(40, FLOOR - 34, 400, 3).fill(0x3a3a44).rect(180, FLOOR - 28, 120, 22).fill(0x8e2f2f);
        for (const mx of [110, 240, 370]) {
          g.rect(mx, FLOOR - 52, 3, 18).fill(0x2a2a30).circle(mx + 1, FLOOR - 54, 4).fill(0x4a4a50);
          g.rect(mx + 14, FLOOR - 44, 5, 10).fill(0x8ab8d8).rect(mx + 14, FLOOR - 46, 5, 2).fill(0x2a4a86); // water
        }
      } else {
        // the scale, and the belt on its table
        g.rect(226, FLOOR - 70, 28, 70).fill(0x3a3a44).rect(220, FLOOR - 76, 40, 10).fill(0x5a5a64).rect(214, FLOOR - 4, 52, 4).fill(0x5a5a64).rect(230, FLOOR - 72, 20, 4).fill(0x8aff6a);
        g.rect(340, FLOOR - 26, 70, 26).fill(0x1a1a20).rect(354, FLOOR - 32, 42, 8).fill(0x1a1a1a).roundRect(368, FLOOR - 36, 14, 14, 3).fill(0xc4a04a);
      }
      g.rect(0, FLOOR, W, H - FLOOR).fill(0x14141a);
      // the crowd and their phones
      for (let x = 0; x < W; x += 9) g.circle(x + 4, H - 18 + ((x * 7) % 5), 6).fill(0x08080a);
      for (let k = 0; k < 12; k++) g.rect((k * 41) % W, H - 30 - ((k * 13) % 6), 3, 4).fill(0xd8e8ff);
      break;
    }
    case 'cage': {
      sky(0x0a080c, 0x1a1418);
      // the arena: tiers of crowd, the big screen, light rigs
      for (let r = 0; r < 4; r++) for (let x = 0; x < W; x += 6) g.circle(x + 3 + (r % 2) * 3, 70 + r * 16 + ((x * 13) % 7), 3.4).fill(r % 2 ? 0x14101a : 0x1a1420);
      g.rect(170, 8, 140, 50).fill(0x101014).rect(174, 12, 132, 42).fill(0x2a1a2a).rect(174, 40, 132, 14).fill(0x8e2f2f);
      for (const lx of [40, 120, 360, 440]) g.poly([lx, 0, lx - 30, 150, lx + 30, 150]).fill({ color: 0xfff2c8, alpha: 0.05 });
      g.rect(0, 130, W, 70).fill({ color: 0x000000, alpha: 0.3 });
      // fence with padded posts
      for (let y = 30; y < FLOOR; y += 5) for (let x = (y / 5) % 2 ? 2 : 0; x < W; x += 5) g.rect(x, y, 1, 1).fill(0x3a3a44);
      g.rect(0, 30, W, 4).fill(0x8e2f2f);
      for (const px of [10, 240, 470]) g.rect(px - 4, 30, 8, FLOOR - 30).fill(0x101014).rect(px - 4, 30, 8, 30).fill(0x2a2a30);
      g.rect(0, FLOOR, W, H - FLOOR).fill(0xcfc8b9).rect(0, FLOOR, W, 2).fill(0x8a8274);
      g.ellipse(W / 2, FLOOR + 14, 120, 10).stroke({ color: 0xa83232, width: 2, alpha: 0.6 });
      for (let k = 0; k < 6; k++) g.circle(100 + k * 60, FLOOR + 8 + (k % 3) * 6, 2).fill({ color: 0x8e2f2f, alpha: 0.4 }); // somebody bled
      break;
    }
    case 'lot': {
      sky(0x06070c, 0x121420);
      // the back of the arena: a loading dock, a fire door with a red light
      g.rect(0, 60, 260, FLOOR - 60).fill(0x1a1a20).rect(160, 110, 50, FLOOR - 110).fill(0x2a2a30).circle(185, 104, 2).fill(0xff3030);
      for (let y = 66; y < FLOOR; y += 10) g.rect(0, y, 140, 1).fill(0x24242a);
      g.rect(0, FLOOR, W, H - FLOOR).fill(0x1c1c22);
      for (let x = 20; x < W; x += 90) g.rect(x, FLOOR + 6, 50, 2).fill(0xc8c8a0);
      // street lamp cone
      g.rect(300, 30, 4, FLOOR - 30).fill(0x2a2a30).rect(300, 30, 30, 4).fill(0x2a2a30);
      g.poly([328, 34, 270, FLOOR + 30, 390, FLOOR + 30]).fill({ color: 0xffe8a0, alpha: 0.12 });
      // a car, a dumpster
      g.roundRect(360, FLOOR - 26, 110, 30, 6).fill(0x2a2a34).rect(380, FLOOR - 40, 70, 16).fill(0x24242c);
      g.rect(20, FLOOR - 40, 50, 40).fill(0x2a4a3a).rect(18, FLOOR - 44, 54, 6).fill(0x1a3a2a);
      break;
    }
    case 'booth': {
      sky(0x120c14, 0x1c1420);
      g.rect(150, 40, 180, 70).fill(0x2a1a2a).rect(160, 50, 160, 14).fill(0xc4a04a);
      // a velvet curtain, the couch, a ring light, the camera's red light
      for (let x = 0; x < 120; x += 8) g.rect(x, 0, 6, FLOOR).fill(0x4a1a24);
      for (let x = 360; x < W; x += 8) g.rect(x, 0, 6, FLOOR).fill(0x4a1a24);
      g.circle(400, 70, 18).stroke({ color: 0xfff2e0, width: 3 });
      g.roundRect(120, FLOOR - 50, 240, 50, 8).fill(0x5a2a3a).rect(120, FLOOR - 66, 240, 20).fill(0x6a3a4a);
      g.rect(0, FLOOR, W, H - FLOOR).fill(0x1a1018);
      g.circle(440, 40, 4).fill(0xff2020);
      break;
    }
    case 'landlord': {
      g.rect(0, 0, W, FLOOR).fill(0x3a2618);
      for (let x = 0; x < W; x += 30) g.rect(x, 0, 2, FLOOR).fill(0x2a1a10);
      // framed buildings (and the one he knocked down, framed like a trophy)
      for (const [x, y] of [[40, 40], [110, 50], [330, 36], [400, 52]] as [number, number][]) {
        g.rect(x, y, 50, 40).fill(0xc4a04a).rect(x + 4, y + 4, 42, 32).fill(0x8aa2b8);
        g.rect(x + 12, y + 14, 10, 22).fill(0x3a3a44).rect(x + 26, y + 10, 12, 26).fill(0x4a4a54);
      }
      g.rect(200, 30, 80, 56).fill(0xe8d080).rect(206, 36, 68, 44).fill(0x8a7a6a).rect(214, 64, 52, 16).fill(0x5a4a3a);
      g.rect(0, FLOOR, W, H - FLOOR).fill(0x2a1a10);
      g.rect(140, FLOOR - 36, 200, 36).fill(0x5a3a22).rect(140, FLOOR - 36, 200, 4).fill(0x7a5a3a);
      g.rect(160, FLOOR - 42, 30, 6).fill(0xe8e0d0).rect(300, FLOOR - 46, 6, 10).fill(0x2a2a30); // the clipboard, a pen stand
      lamp(240, 0, 18, 0.08);
      break;
    }
    case 'black':
      g.rect(0, 0, W, H).fill(0x060508);
      break;
  }
}

function lerp(a: number, b: number, t: number): number {
  const ar = (a >> 16) & 255, ag = (a >> 8) & 255, ab = a & 255;
  const br = (b >> 16) & 255, bg = (b >> 8) & 255, bb = b & 255;
  return (Math.round(ar + (br - ar) * t) << 16) | (Math.round(ag + (bg - ag) * t) << 8) | Math.round(ab + (bb - ab) * t);
}

/** Text drawn on the set itself (signs). */
function setDressing(c: Container, bg: Bg): void {
  if (bg === 'gym') c.addChild(text("RAY'S BOXING & SOUP", 150, 27, { width: 180, align: 'center', color: PAL.gold, small: true }));
  if (bg === 'bingo') c.addChild(text('FIGHT NIGHT  •  BINGO RESUMES AT 9', 150, 114, { width: 180, align: 'center', color: PAL.bone, small: true }));
  if (bg === 'locker') c.addChild(text('HANDS UP. CHIN DOWN. EAT SOMETHING.', 322, 104, { width: 136, align: 'center', color: 0x2a4a86, small: true, maxLines: 2 }));
  if (bg === 'street') c.addChild(text('BOXING & SOUP', 150, 85, { width: 170, align: 'center', color: 0xff6a6a, small: true }));
  if (bg === 'booth') c.addChild(text('THE LOUNGE: CONFESSIONAL', 160, 54, { width: 160, align: 'center', color: PAL.ink, small: true }));
  if (bg === 'office') c.addChild(text('CBFC', 362, 66, { width: 76, align: 'center', color: PAL.gold, small: true }));
}

// ------------------------------------------------------------ player

/** Play a cutscene. `done(choice)` when it's over (choice id, or null). */
export function playCutscene(g: Game, scene: Cutscene, done: (choice: string | null) => void): void {
  const root = new Container();
  const wrap = g.modal(root, { dim: 1 });
  const world = new Container();
  root.addChild(world);
  const bgG = new Graphics();
  const dress = new Container();
  const fx = new Graphics();
  const actorsG = new Graphics();
  world.addChild(bgG, dress, actorsG, fx);
  // letterbox
  root.addChild(new Graphics().rect(0, 0, W, 14).fill(0x000000).rect(0, H - 12, W, 12).fill(0x000000));
  const ui = new Container();
  root.addChild(ui);
  const capLayer = new Container();
  ui.addChild(capLayer);
  let shotIdx = -1;
  let lineIdx = -1;
  let shown = 0;
  let t = 0;
  let titleT = scene.title ? 2.2 : 0;
  let shake = 0;
  let flash = 0;
  let finished = false;
  type Live = Actor & { cx: number; look2: Look2 };
  let cast: Live[] = [];
  const lookOf = (a: Actor): Look2 => {
    if (a.look) return a.look;
    const L = lookFor(a.fighter!, a.x < W / 2 ? 0 : 1);
    return a.clothes ? { ...L, outfit: { top: a.clothes.top, bottom: a.clothes.bottom, bulk: 1, hands: L.skin } } : L;
  };
  /** Set the stage for a shot. `instant`: nobody walks in (going back to it). */
  const setupShot = (i: number, instant = false) => {
    shotIdx = i;
    lineIdx = -1;
    const s = scene.shots[i];
    drawBg(bgG, s.bg, s.tv);
    dress.removeChildren().forEach((c) => c.destroy());
    setDressing(dress, s.bg);
    capLayer.removeChildren().forEach((c) => c.destroy());
    cast = s.cast.map((a) => ({ ...a, cx: instant ? a.x : a.enter === 'left' ? -40 : a.enter === 'right' ? W + 40 : a.x, look2: lookOf(a) }));
    if (s.caption) {
      // captions sit in the letterbox band
      const cap = text(s.caption, 0, 4, { width: W, align: 'center', color: PAL.gold, small: true });
      capLayer.addChild(cap);
    }
  };
  const startShot = (i: number) => {
    setupShot(i);
    nextLine();
  };
  /** The poses as they stand at this line of the shot (for going back). */
  const reapplyPoses = () => {
    const s = scene.shots[shotIdx];
    for (const a of cast) a.pose = s.cast.find((x) => x.id === a.id)?.pose;
    for (let k = 0; k <= lineIdx && k < s.lines.length; k++) for (const [id, p] of Object.entries(s.lines[k].poses ?? {})) {
      const a = cast.find((c) => c.id === id);
      if (a) a.pose = p;
    }
  };
  /** One line back (from the choices, back to the last line). */
  const back = () => {
    if (titleT > 0) return;
    if (finished) {
      if (!scene.choices?.length) return;
      finished = false;
      choicesBox.removeChildren().forEach((c) => c.destroy({ children: true }));
      skipBtn.visible = true;
      lineIdx = scene.shots[shotIdx].lines.length - 1;
    } else if (lineIdx > 0) lineIdx--;
    else if (shotIdx > 0) {
      setupShot(shotIdx - 1, true);
      lineIdx = scene.shots[shotIdx].lines.length - 1;
    } else return;
    shown = 1e9;
    reapplyPoses();
    sfx('click');
  };
  const dialog = new Container();
  ui.addChild(dialog);
  const drawDialog = () => {
    dialog.removeChildren().forEach((c) => c.destroy({ children: true }));
    const s = scene.shots[shotIdx];
    const ln = s?.lines[lineIdx];
    navBack.visible = navNext.visible = false;
    if (!ln || finished || titleT > 0) {
      // on the choices: BACK still goes back to the last line
      navBack.visible = finished && !!scene.choices?.length;
      if (navBack.visible) navBack.position.set(W - 104, 4);
      return;
    }
    navBack.position.set(W - 104, H - 27);
    const bx = 16;
    const by = H - 64;
    dialog.addChild(box(W - 32, 50, 0x0c0a0e, PAL.slate, { bevel: true })).position.set(bx, by);
    const who = ln.who ? cast.find((c) => c.id === ln.who)?.name ?? ln.who : null;
    if (who) {
      const tag = text(who.toUpperCase(), 0, 0, { small: true, color: PAL.ink });
      const tw = tag.textWidth + 10;
      dialog.addChild(new Graphics().rect(bx + 8, by - 8, tw, 10).fill(PAL.gold));
      tag.position.set(bx + 13, by - 6);
      dialog.addChild(tag);
    }
    const body = ln.text.slice(0, Math.floor(shown));
    dialog.addChild(text(body, bx + 10, by + 8, { width: W - 52, color: ln.who ? PAL.bone : PAL.fog, maxLines: 4 }));
    // back / next (persistent buttons: the dialog itself is redrawn every frame)
    navBack.visible = !(shotIdx === 0 && lineIdx === 0);
    navNext.visible = true;
    navNext.alpha = shown >= ln.text.length && Math.floor(t * 3) % 2 === 0 ? 1 : 0.75;
  };
  const nextLine = () => {
    const s = scene.shots[shotIdx];
    lineIdx++;
    shown = 0;
    if (lineIdx >= s.lines.length) {
      if (shotIdx + 1 < scene.shots.length) return startShot(shotIdx + 1);
      return end();
    }
    const ln = s.lines[lineIdx];
    for (const [id, p] of Object.entries(ln.poses ?? {})) {
      const a = cast.find((c) => c.id === id);
      if (a) a.pose = p;
    }
    if (ln.shake) shake = 0.4;
    if (ln.flash) flash = 0.35;
    if (ln.sfx) sfx(ln.sfx);
  };
  const navBack = button('< BACK', W - 104, H - 27, 40, 10, () => back(), { small: true, fill: PAL.shadow });
  const navNext = button('NEXT >', W - 60, H - 27, 40, 10, () => advance(), { small: true, fill: PAL.moss });
  ui.addChild(navBack, navNext);
  const choicesBox = new Container();
  ui.addChild(choicesBox);
  const end = () => {
    if (finished) return;
    finished = true;
    dialog.removeChildren().forEach((c) => c.destroy({ children: true }));
    skipBtn.visible = false;
    const ch = scene.choices ?? [];
    if (!ch.length) return close(null);
    const bh = 14 + ch.length * 17;
    choicesBox.addChild(box(W - 120, bh, 0x0c0a0e, PAL.gold, { bevel: true })).position.set(60, H - 20 - bh);
    ch.forEach((c, i) => choicesBox.addChild(button(c.label, 68, H - 20 - bh + 7 + i * 17, W - 136, 14, () => { sfx('click'); close(c.id); }, { small: true, fill: i === 0 ? PAL.moss : PAL.steel })));
  };
  const close = (choice: string | null) => {
    g.app.ticker.remove(tick);
    popKeys();
    g.closeModal(wrap);
    done(choice);
  };
  const advance = () => {
    if (titleT > 0) {
      titleT = 0;
      return;
    }
    if (finished) return;
    const ln = scene.shots[shotIdx]?.lines[lineIdx];
    if (ln && shown < ln.text.length) shown = ln.text.length;
    else nextLine();
  };
  const skipBtn = button('SKIP', W - 44, 1, 40, 11, () => {
    // skipping still lands on the choices (and BACK still works from there)
    setupShot(scene.shots.length - 1, true);
    lineIdx = scene.shots[shotIdx].lines.length - 1;
    reapplyPoses();
    end();
  }, { small: true, fill: PAL.shadow });
  root.addChild(skipBtn);
  const hit = new Graphics().rect(0, 0, W, H).fill({ color: 0, alpha: 0.001 });
  hit.eventMode = 'static';
  hit.on('pointertap', advance);
  root.addChildAt(hit, 1);
  const popKeys = g.pushKeyHandler((e) => {
    if (e.type !== 'keydown') return true;
    if (e.key === 'Enter' || e.key === ' ' || e.key === 'ArrowRight') advance();
    if (e.key === 'ArrowLeft' || e.key === 'Backspace') back();
    return true;
  });
  const titleC = new Container();
  root.addChild(titleC);
  if (scene.title) {
    titleC.addChild(new Graphics().rect(0, 0, W, H).fill(0x060508));
    titleC.addChild(text(scene.title, 0, H / 2 - 8, { width: W, align: 'center', color: PAL.gold, scale: 2 }));
  }
  startShot(0);
  const tick = (tk: Ticker) => {
    const dt = Math.min(0.05, tk.deltaMS / 1000);
    t += dt;
    if (input.buttonPressed('A') || input.buttonPressed('RB')) advance();
    if (input.buttonPressed('LB') || input.buttonPressed('X')) back();
    if (titleT > 0) {
      titleT -= dt;
      titleC.alpha = Math.min(1, titleT / 0.4);
      return;
    }
    titleC.visible = false;
    const ln = scene.shots[shotIdx]?.lines[lineIdx];
    if (ln && !finished) {
      shown = Math.min(ln.text.length, shown + dt * 55);
    }
    // actors: walk in, bob while talking
    actorsG.clear();
    for (const a of cast) {
      a.cx += (a.x - a.cx) * Math.min(1, dt * 3);
      const walking = Math.abs(a.x - a.cx) > 2;
      const talking = ln?.who === a.id && shown < (ln?.text.length ?? 0);
      const rig = walking ? (Math.floor(t * 6) % 2 ? POSES.walk1 : POSES.walk2) : POSES[a.pose ?? 'stand'];
      const bob = talking ? Math.round(Math.sin(t * 14)) : 0;
      actorsG.ellipse(a.cx, FLOOR + 1, 16 * (a.scale ?? 1.3), 3).fill({ color: 0, alpha: 0.35 });
      drawRig(actorsG, rig, Math.round(a.cx), FLOOR + bob, walking ? (a.x > a.cx ? 1 : -1) : a.facing, a.look2, a.scale ?? 1.3);
    }
    // camera: a slow push in; shake on impacts
    const z = 1 + Math.min(0.04, t * 0.004);
    world.scale.set(z);
    world.position.set(-(W * (z - 1)) / 2 + (shake > 0 ? (Math.random() - 0.5) * 6 : 0), -(H * (z - 1)) / 2);
    shake = Math.max(0, shake - dt);
    // ambient: rain on the street and the lot, steam off the soup, camera flashes at the presser
    fx.clear();
    const bg = scene.shots[shotIdx]?.bg;
    if (bg === 'street' || bg === 'lot') for (let k = 0; k < 60; k++) fx.rect(((k * 97 + t * 220) % W), ((k * 53 + t * 320) % H), 1, 4).fill({ color: 0x8aa2b8, alpha: 0.5 });
    if (bg === 'gym' || bg === 'tv') for (let k = 0; k < 4; k++) fx.circle(400 + Math.sin(t * 1.5 + k) * 6, 110 - ((t * 14 + k * 9) % 36), 3).fill({ color: 0xffffff, alpha: 0.15 });
    if ((bg === 'presser' || bg === 'stage') && Math.random() < dt * 3) fx.rect(Math.random() * W, H - 40 + Math.random() * 20, 6, 6).fill(0xffffff);
    if (flash > 0) {
      fx.rect(0, 0, W, H).fill({ color: 0xffffff, alpha: Math.min(0.6, flash) });
      flash -= dt;
    }
    drawDialog();
  };
  g.app.ticker.add(tick);
  wrap.once('destroyed', () => {
    g.app.ticker.remove(tick);
    popKeys();
  });
}
