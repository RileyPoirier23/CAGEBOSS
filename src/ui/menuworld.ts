/**
 * The title screen's world: one long street at night that scrolls past forever, built out of
 * MMA culture. The arena with its marquee, a wall of fight-poster parodies, the podcast studio,
 * the gas station that's out of cardio, the sauna, the calf-kick clinic, the track, the phone
 * booth, the referee who will not stop it, the horror movie about scorecards, Snap Down City,
 * and the guy nobody has heard of. The famous quotes stay as words, in speech bubbles.
 *
 * buildStreet() returns one copy of the strip (STREET_W wide) and an update() for the moving
 * parts; the title lays two copies end to end and scrolls them.
 */
import { Container, Graphics } from 'pixi.js';
import { PAL, shade } from '../art/palette';
import { text } from './kit';
import { POSES, drawRig, type Look2, type Pose } from './rig';
import type { PixelText } from './text';

export const STREET_W = 1840;
/** the sidewalk line everybody stands on */
const GROUND = 224;

const MARQUEE = [
  "TONIGHT: TWO GUYS YOU HAVEN'T HEARD OF",
  'TONIGHT: LATE REPLACEMENT VS LATER REPLACEMENT',
  'TONIGHT: 4 OZ GLOVES, 0 OZ OF CARDIO',
  'TONIGHT: KEEP IT ON THE FEET!!! (THEY WILL NOT)',
  'TONIGHT: SOMEBODY MISSES WEIGHT BY 9 LBS',
  'NOW SHOWING: A REF WHO WILL NOT STOP IT',
  'SOLD OUT: ALL 41 SEATS',
  'TONIGHT: EYE POKE. PAUSE. EYE POKE.',
  'TONIGHT: HEAVYWEIGHTS. BRING A DEFIBRILLATOR.',
  'TONIGHT: DAD BOD VS DAD BOD (CO-MAIN)',
  'BMF TITLE ON THE LINE (BRING MONEY FAST)',
  'NO REFUNDS. NO REGRETS. SOME REGRETS.',
  'TONIGHT: WE GO TO THE SCORECARDS (GOD HELP US)',
  "TONIGHT: IT'S TIIIIIIIIIIME!",
];

const look = (o: Partial<Look2>): Look2 => ({ skin: 0xd8a07a, hairStyle: 1, hairColor: 0x2a1a10, beard: 0, build: 1, trunks: 0x222222, trim: 0x222222, glove: 0x8e1e1e, stance: 'upright', female: false, tattoo: 0, ...o });

export interface Street {
  node: Container;
  update: (t: number, dt: number) => void;
}

export function buildStreet(seed = 0): Street {
  const c = new Container();
  const g = new Graphics();
  const figs = new Graphics();
  c.addChild(g);
  const words = new Container();
  const top = new Graphics();
  c.addChild(figs, top, words);
  const say = (s: string, x: number, y: number, o: Parameters<typeof text>[3] = {}) => {
    const t = text(s, x, y, { small: true, ...o });
    words.addChild(t);
    return t;
  };
  /** a speech bubble with a tail pointing down-left or down-right at (tx, ty) */
  const bubble = (s: string, x: number, y: number, w: number, tx: number, ty: number) => {
    const t = text(s, x + 5, y + 4, { small: true, color: PAL.ink, width: w - 10, align: 'center' });
    const h = t.textHeight + 8;
    top.roundRect(x, y, w, h, 4).fill(0xf6f2e8).stroke({ color: 0x1a1418, width: 1 });
    const bx = Math.max(x + 6, Math.min(x + w - 14, tx - 4));
    top.poly([bx, y + h - 1, bx + 9, y + h - 1, tx, ty]).fill(0xf6f2e8);
    words.addChild(t);
  };
  const fig = (pose: Pose, x: number, facing: 1 | -1, L: Look2, scale = 0.62, y = GROUND) => {
    figs.ellipse(x, y + 1, 12 * scale, 2).fill({ color: 0x000000, alpha: 0.4 });
    drawRig(figs, POSES[pose], x, y, facing, L, scale);
  };
  const bricks = (x: number, y: number, w: number, h: number, base: number) => {
    g.rect(x, y, w, h).fill(base);
    for (let yy = y; yy < y + h; yy += 6) for (let xx = x + ((yy / 6) % 2 ? -6 : 0); xx < x + w; xx += 12) g.rect(Math.max(x, xx + 1), yy + 1, Math.min(10, x + w - xx - 1), 4).fill(shade(base, ((xx * 7 + yy * 3) % 5) * 0.02 + 0.04));
  };
  const lamp = (x: number) => {
    g.rect(x, 120, 2, GROUND - 120).fill(0x24222a).rect(x - 8, 118, 18, 3).fill(0x24222a).rect(x - 8, 121, 6, 2).fill(0xffe8a0);
    g.poly([x - 8, 123, x - 3, 123, x + 18, GROUND, x - 30, GROUND]).fill({ color: 0xffe8a0, alpha: 0.06 });
  };

  // ------------------------------------------------ sky line behind it all (part of the strip)
  let r = 11 + seed;
  const rnd = () => ((r = (r * 16807) % 2147483647) / 2147483647);
  for (let x = 0; x < STREET_W; ) {
    const bw = 18 + Math.floor(rnd() * 30);
    const bh = 40 + Math.floor(rnd() * 60);
    g.rect(x, 150 - bh, bw, bh + 10).fill(0x1c1922);
    for (let wy = 156 - bh; wy < 150; wy += 7) for (let wx = x + 3; wx < x + bw - 3; wx += 5) if (rnd() < 0.2) g.rect(wx, wy, 2, 2).fill(0x5a4a3a);
    x += bw + 1;
  }
  // the sidewalk and the road
  g.rect(0, GROUND, STREET_W, 8).fill(0x2e2a33).rect(0, GROUND, STREET_W, 1).fill(0x46404c);
  for (let x = 0; x < STREET_W; x += 32) g.rect(x, GROUND + 1, 1, 7).fill(0x24212a);
  g.rect(0, GROUND + 8, STREET_W, 40).fill(0x151218);
  for (let x = 10; x < STREET_W; x += 60) g.rect(x, GROUND + 26, 26, 2).fill(0x4a4430);

  // ================================================ 1. THE ARENA (0..230)
  g.rect(10, 70, 210, GROUND - 70).fill(0x2b2530).rect(10, 70, 210, 3).fill(0x3c3442);
  for (let i = 0; i < 5; i++) g.rect(20 + i * 40, 80, 28, 34).fill(0x221d27);
  g.rect(70, 150, 90, GROUND - 150).fill(0x1b1720);
  for (let i = 0; i < 3; i++) g.rect(78 + i * 28, 158, 20, GROUND - 158).fill(0x3a3122);
  g.rect(60, 142, 110, 8).fill(PAL.blood).rect(60, 148, 110, 2).fill(shade(PAL.blood, -0.4));
  g.rect(20, 118, 190, 20).fill(PAL.night).rect(20, 118, 190, 20).stroke({ color: PAL.gold, width: 1 });
  const marquee = say(MARQUEE[seed % MARQUEE.length], 22, 125, { width: 186, align: 'center', color: PAL.gold, maxLines: 1 });
  say('CAGE BOSS ARENA', 10, 60, { width: 210, align: 'center', color: 0xff6a6a });
  const bulbs = new Graphics();
  c.addChildAt(bulbs, 1);
  // a ticket queue: two fans and a scalper
  fig('stand' as Pose, 190, -1, look({ skin: 0xe0b090, hairStyle: 2, outfit: { top: 0x8e2f2f, bottom: 0x2a2a44, bulk: 1, hands: 0xe0b090 } }));
  fig('stand' as Pose, 214, -1, look({ skin: 0x9a6844, hairStyle: 0, outfit: { top: 0x2a4a86, bottom: 0x222228, bulk: 1, hands: 0x9a6844 } }));
  lamp(236);

  // ================================================ 2. THE POSTER WALL (250..470)
  bricks(250, 96, 220, GROUND - 96, 0x4a2c26);
  const poster = (x: number, w: number, h: number, bgc: number, title: string, sub: string, a: Look2, b: Look2, tcol: number = 0xffffff) => {
    const y = 104;
    g.rect(x + 2, y + 2, w, h).fill({ color: 0x000000, alpha: 0.35 }).rect(x, y, w, h).fill(bgc);
    g.poly([x, y + h * 0.55, x + w, y + h * 0.45, x + w, y + h, x, y + h]).fill({ color: 0x000000, alpha: 0.35 });
    // face to face, like every fight poster since 1993
    drawRig(figs, POSES.guard, x + w * 0.3, y + h - 10, 1, a, 0.5);
    drawRig(figs, POSES.guard, x + w * 0.7, y + h - 10, -1, b, 0.5);
    say(title, x, y + 3, { width: w, align: 'center', color: tcol, maxLines: 2 });
    say(sub, x, y + h - 9, { width: w, align: 'center', color: PAL.gold, maxLines: 1 });
    g.rect(x + w / 2 - 1, y - 1, 3, 3).fill(0xc8c8c8).rect(x + 3, y + h - 3, 4, 4).fill({ color: 0xd8d0b8, alpha: 0.6 }); // the staple, a torn corner
  };
  poster(258, 68, 92, 0x7a1414, 'CBFC 69: NICE', 'LIVE ON PPV', look({ trunks: 0xf2f2f2, skin: 0xe8c0a0, hairStyle: 0 }), look({ trunks: 0x1f3a6e, skin: 0x8a5a3a, hairStyle: 2, beard: 2 }));
  poster(330 + 2 * 6, 64, 92, 0x141420, 'BAD BLOOD II', 'NOBODY ASKED', look({ trunks: 0x1e7a3c, skin: 0xc68a5e, hairStyle: 3, beard: 1 }), look({ trunks: 0xc8202a, skin: 0xf0cfae, hairStyle: 2, hairColor: 0x8c3a22 }), 0xff4a4a);
  poster(412, 52, 92, 0x2a3a5a, 'SOUP WARS', 'MONCTON', look({ trunks: 0x8e2f2f, skin: 0xe8c0a0, hairStyle: 9, hairColor: 0x3b2a1e }), look({ trunks: 0xf2f0ea, skin: 0xe8c0a0, hairStyle: 2, hairColor: 0xe0d4b0 }), PAL.gold);
  say('POST NO BILLS', 260, 206, { color: 0xb8a890 });

  // ================================================ 3. THE PODCAST (480..640)
  g.rect(480, 90, 160, GROUND - 90).fill(0x1e1c24).rect(480, 90, 160, 3).fill(0x2e2c36);
  g.rect(492, 112, 136, 80).fill(0x101418).rect(492, 112, 136, 80).stroke({ color: 0x3a3a44, width: 2 });
  // inside: the screen, the mics, the host in headphones
  g.rect(560, 118, 60, 34).fill(0x0a2a3a).rect(562, 120, 56, 30).fill(0x14485a);
  say('PULL THAT UP', 560, 124, { width: 60, align: 'center', color: 0xd8f0ff });
  say('JAMIE', 560, 133, { width: 60, align: 'center', color: 0xd8f0ff });
  g.rect(500, 172, 120, 6).fill(0x5a3a22);
  for (const mx of [530, 590]) g.rect(mx, 156, 2, 16).fill(0x2a2a30).roundRect(mx - 3, 150, 8, 9, 3).fill(0x3a3a44);
  fig('stool' as Pose, 520, 1, look({ skin: 0xe2b392, hairStyle: 0, beard: 1, build: 2, outfit: { top: 0x18181c, bottom: 0x2a2a30, bulk: 2, shortSleeves: true, hands: 0xe2b392 } }), 0.5, 192);
  figs.rect(511, 152, 14, 3).fill(0x101014); // the headphones
  g.circle(626, 104, 3).fill(0xff2020);
  say('ON AIR', 596, 99, { color: 0xff4a4a });
  bubble("IT'S ENTIRELY POSSIBLE", 492, 196, 104, 516, 186);
  say('EP. 2,212: ELK MEAT', 480, 82, { width: 160, align: 'center', color: PAL.ash });
  lamp(652);

  // ================================================ 4. THE GAS STATION (660..820)
  g.rect(660, 120, 160, 8).fill(0xc8202a).rect(660, 128, 160, 3).fill(0x8e1414);
  g.rect(672, 131, 6, GROUND - 131).fill(0x8a8a90).rect(802, 131, 6, GROUND - 131).fill(0x8a8a90);
  g.rect(720, 166, 26, GROUND - 166).fill(0xd8d8d4).rect(724, 172, 18, 14).fill(0x1a2a1a).rect(746, 176, 6, 2).fill(0x2a2a30).rect(750, 176, 2, 22).fill(0x2a2a30);
  say('E', 724, 175, { width: 18, align: 'center', color: 0xff4040 });
  g.rect(690, 90, 110, 26).fill(0x101014).rect(690, 90, 110, 26).stroke({ color: PAL.gold, width: 1 });
  say('CARDIO $9.99/GAL', 690, 95, { width: 110, align: 'center', color: PAL.gold });
  say('SOLD OUT SINCE ROUND 2', 690, 105, { width: 110, align: 'center', color: 0xff6a6a });
  // a fighter hands on knees by the pump, gas tank empty
  fig('doubled', 776, -1, look({ trunks: 0x2a4a86, skin: 0xe0b090, hairStyle: 1 }));
  lamp(830);

  // ================================================ 5. THE SAUNA (840..980)
  g.rect(840, 100, 140, GROUND - 100).fill(0x5a3a26);
  for (let x = 842; x < 980; x += 8) g.rect(x, 100, 1, GROUND - 100).fill(0x4a2e1c);
  g.rect(870, 140, 40, GROUND - 140).fill(0x3a2416).rect(874, 146, 32, 20).fill({ color: 0xffe0b0, alpha: 0.5 }).circle(902, 186, 2).fill(PAL.gold);
  say('SAUNA', 840, 108, { width: 140, align: 'center', color: 0xffd8a0 });
  say('WEIGH-INS FRIDAY. GOD SPEED.', 840, 118, { width: 140, align: 'center', color: PAL.ash });
  // steam, a fighter in a towel and garbage bags
  for (let k = 0; k < 6; k++) g.circle(890 + (k % 3) * 8, 136 - k * 5, 4 + (k % 2)).fill({ color: 0xffffff, alpha: 0.08 });
  fig('walk1', 940, -1, look({ skin: 0xf0a882, hairStyle: 0, build: 1, outfit: { top: 0x1a1a1a, bottom: 0xf2f2f2, bulk: 2, hands: 0xf0a882, shortSleeves: true } }));
  bubble('MY BALLS WAS HOT', 916, 136, 64, 940, 172);

  // ================================================ 6. THE CALF-KICK CLINIC (990..1130)
  g.rect(990, 112, 140, GROUND - 112).fill(0xd8d8d0).rect(990, 112, 140, 4).fill(0x8e2f2f);
  g.rect(1004, 140, 50, 40).fill(0x8aa2b8).rect(1004, 140, 50, 40).stroke({ color: 0x8a8a90, width: 2 });
  g.rect(1072, 150, 34, GROUND - 150).fill(0x6a7a8a);
  g.rect(1054, 120, 22, 22).fill(0xc8202a).rect(1063, 124, 4, 14).fill(0xffffff).rect(1058, 129, 14, 4).fill(0xffffff);
  say('CALF KICK CLINIC', 990, 100, { width: 140, align: 'center', color: 0xff6a6a });
  say("WALK-INS WELCOME (YOU CAN'T)", 990, 186, { width: 140, align: 'center', color: PAL.ink });
  // a man on crutches, one leg the colour of a plum
  fig('hurt', 1116, -1, look({ trunks: 0x1e7a3c, skin: 0xc68a5e, hairStyle: 2, beard: 2 }));
  figs.rect(1105, 182, 2, 42).fill(0x9a9aa0).rect(1124, 182, 2, 42).fill(0x9a9aa0).rect(1110, 206, 6, 8).fill(0x6a2a6a);
  lamp(1140);

  // ================================================ 7. THE TRACK (1150..1300): the back-pedal
  g.rect(1150, 150, 150, GROUND - 150).fill(0x1a3a2a);
  g.ellipse(1225, 200, 66, 16).stroke({ color: 0xc87a4a, width: 3 }).ellipse(1225, 200, 54, 11).stroke({ color: 0xc87a4a, width: 1 });
  for (let k = 0; k < 8; k++) g.rect(1166 + k * 16, GROUND - 3, 4, 2).fill(0xd8d0b8);
  say('THE TRACK  •  BACKWARDS LANE', 1150, 138, { width: 150, align: 'center', color: PAL.bone });
  fig('block', 1180, 1, look({ trunks: 0xf2c12e, skin: 0xe8c0a0, hairStyle: 4, hairColor: 0x3a2418 }));
  fig('walk2', 1260, 1, look({ trunks: 0x8e2f2f, skin: 0x8a5a3a, hairStyle: 0 }));
  bubble("I CAN'T LET YOU GET CLOSE", 1214, 150, 82, 1262, 172);

  // ================================================ 8. THE PHONE BOOTH (1310..1410)
  g.rect(1330, 120, 46, GROUND - 120).fill(0xb82020).rect(1334, 128, 38, 80).fill({ color: 0x8aa2b8, alpha: 0.35 });
  for (let y = 134; y < 208; y += 10) g.rect(1334, y, 38, 1).fill(0x8e1414);
  g.rect(1330, 116, 46, 8).fill(0x8e1414);
  say('PHONE', 1330, 117, { width: 46, align: 'center', color: 0xffffff });
  fig('stand' as Pose, 1353, 1, look({ skin: 0xdcae88, hairStyle: 2, hairColor: 0x1a1412, beard: 1, outfit: { top: 0x101014, bottom: 0x2a2a30, bulk: 1, hands: 0xdcae88 } }), 0.6);
  // the map pin
  g.circle(1400, 112, 9).fill(0xe02020).poly([1393, 116, 1407, 116, 1400, 130]).fill(0xe02020).circle(1400, 112, 3).fill(0xffffff);
  bubble('SEND ME LOCATION', 1376, 136, 60, 1362, 168);

  // ================================================ 9. THE REF (1420..1560): will not stop it
  g.rect(1420, 140, 140, 6).fill(0x8e2f2f);
  for (let x = 1420; x < 1560; x += 4) g.rect(x, 146, 1, GROUND - 146).fill(0x3a3a44);
  fig('top', 1470, 1, look({ trunks: 0x1f3a6e, skin: 0xe0b090, hairStyle: 2 }), 0.6);
  fig('bottom', 1498, -1, look({ trunks: 0xc8202a, skin: 0xb07a52, hairStyle: 0 }), 0.6);
  // the ref in a lawn chair with popcorn
  g.rect(1526, 200, 24, 3).fill(0x3a8a4a).rect(1528, 203, 2, 21).fill(0x9a9aa0).rect(1546, 203, 2, 21).fill(0x9a9aa0).rect(1546, 180, 3, 22).fill(0x3a8a4a);
  fig('stool' as Pose, 1538, -1, look({ skin: 0xf0cfae, hairStyle: 0, build: 2, outfit: { top: 0x141418, bottom: 0x1c1c22, bulk: 2, shortSleeves: true, hands: 0x4a7ad8 } }), 0.55, 204);
  g.rect(1524, 180, 8, 9).fill(0xe02020).rect(1524, 177, 8, 4).fill(0xfff2c8);
  say("HE'S INTELLIGENTLY DEFENDING", 1420, 128, { width: 140, align: 'center', color: PAL.bone });
  lamp(1570);

  // ================================================ 10. THE BILLBOARD (1580..1720): a horror movie
  g.rect(1640, 168, 4, GROUND - 168).fill(0x24222a).rect(1680, 168, 4, GROUND - 168).fill(0x24222a);
  g.rect(1586, 84, 128, 86).fill(0x0c0a0e).rect(1586, 84, 128, 86).stroke({ color: 0x3a3a44, width: 2 });
  say('THE SCORECARDS', 1586, 90, { width: 128, align: 'center', color: 0xe02020 });
  for (let k = 0; k < 9; k++) g.rect(1600 + k * 12, 99, 2, 4 + (k % 3) * 3).fill(0xa01818); // dripping
  // three judges in sunglasses, a single scorecard
  for (let k = 0; k < 3; k++) {
    const jx = 1608 + k * 30;
    g.circle(jx + 6, 122, 7).fill(0xe0b090).rect(jx, 120, 12, 3).fill(0x0a0a0a).rect(jx - 2, 129, 16, 22).fill(0x1a1a24);
  }
  g.rect(1690, 120, 18, 24).fill(0xf2f2f2);
  say('10-8', 1690, 128, { width: 18, align: 'center', color: PAL.ink });
  say('ROUND 2 WAS "CLOSE". IN THEATRES NEVER', 1586, 154, { width: 128, align: 'center', color: PAL.ash, maxLines: 2 });

  // ================================================ 11. SNAP DOWN CITY + THE BMF BELT (1720..1840)
  g.rect(1740, 160, 3, GROUND - 160).fill(0x8a8a90).rect(1752, 160, 3, GROUND - 160).fill(0x8a8a90);
  g.roundRect(1726, 136, 44, 30, 3).fill(0x1e6a3a).roundRect(1726, 136, 44, 30, 3).stroke({ color: 0xf2f2f2, width: 1 });
  say('SNAP DOWN CITY', 1728, 140, { width: 40, align: 'center', color: 0xffffff });
  say('POP: YOU', 1728, 157, { width: 40, align: 'center', color: 0xd8f0d8 });
  // the BMF belt on a pedestal, under a light
  g.rect(1790, 196, 30, GROUND - 196).fill(0x3a3a44).rect(1786, 194, 38, 3).fill(0x5a5a64);
  g.rect(1788, 182, 34, 8).fill(0x1a1a1a).roundRect(1798, 176, 14, 18, 3).fill(PAL.gold).rect(1802, 181, 6, 8).fill(0xfff0a0);
  g.poly([1805, 100, 1780, 196, 1830, 196]).fill({ color: 0xffe8a0, alpha: 0.07 });
  say('BMF', 1780, 166, { width: 50, align: 'center', color: PAL.gold });

  // ------------------------------------------------ the moving parts
  let mIdx = seed % MARQUEE.length;
  let mT = 0;
  let flick = 1;
  const update = (t: number, dt: number) => {
    mT += dt;
    if (mT > 4.2) {
      mT = 0;
      mIdx = (mIdx + 1) % MARQUEE.length;
      (marquee as PixelText).setText(MARQUEE[mIdx]);
    }
    marquee.alpha = mT < 0.25 ? (Math.floor(mT * 16) % 2 ? 1 : 0.2) : 1;
    if (Math.random() < 0.02) flick = flick ? 0 : 1;
    bulbs.clear();
    for (let i = 0; i < 19; i++) {
      const on = (Math.floor(t * 6) + i) % 3 !== 0 && (flick || i % 5);
      bulbs.rect(22 + i * 10, 115, 2, 2).fill(on ? PAL.gold : 0x4a3a20).rect(22 + i * 10, 139, 2, 2).fill(on ? PAL.gold : 0x4a3a20);
    }
    // the ON AIR light breathes
    bulbs.circle(626, 104, 3).fill({ color: 0xff2020, alpha: 0.5 + 0.5 * Math.sin(t * 3) });
  };
  return { node: c, update };
}
