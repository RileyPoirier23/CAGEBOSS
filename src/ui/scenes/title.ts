/**
 * Title screen: a rain-soaked arena facade at night with a flickering marquee.
 */
import { FMCreateScene } from './fmcreate';
import { Container, Graphics } from 'pixi.js';
import { Scene, fullBg } from '../app';
import { PAL, shade } from '../../art/palette';
import { W, H, text, button } from '../kit';
import { sfx } from '../../audio/sfx';
import type { PixelText } from '../text';
import { openSettings } from './settings';
import { openHelp } from '../help';
import { QuickFightScene } from './quickfight';
import { openAchievements, hasAchievement } from '../achievements';
import { alertBox } from '../widgets';
import { maybeWhatsNew } from '../whatsnew';
import { openLoad, latestSave, continueLatest } from './loadmenu';
import { NewGameScene } from './newgame';
import { openCredits } from './credits';
import { desktop } from '../../desktop';

interface Drop {
  x: number;
  y: number;
  v: number;
  l: number;
}

const MARQUEE = [
  "TONIGHT: TWO GUYS YOU HAVEN'T HEARD OF",
  'TONIGHT: LATE REPLACEMENT VS LATER REPLACEMENT',
  'TONIGHT: 4 OZ GLOVES, 0 OZ OF CARDIO',
  'TONIGHT: KEEP IT ON THE FEET!!! (THEY WILL NOT)',
  'TONIGHT: CALF KICKS. JUST CALF KICKS.',
  'TONIGHT: SOMEBODY MISSES WEIGHT BY 9 LBS',
  'NOW SHOWING: A REF WHO WILL NOT STOP IT',
  'TONIGHT: SHORT NOTICE, LONG HOSPITAL STAY',
  'TONIGHT: WHO THE F*** IS THAT GUY?',
  'TONIGHT: PULL THAT UP, JAMIE',
  'SOLD OUT: ALL 41 SEATS',
  'TONIGHT: EYE POKE. PAUSE. EYE POKE.',
  'TONIGHT: THE JUDGES ARE DRUNK (ALLEGEDLY)',
  'TONIGHT: HEAVYWEIGHTS. BRING A DEFIBRILLATOR.',
  'TONIGHT: DAD BOD VS DAD BOD (CO-MAIN)',
  'BMF TITLE ON THE LINE (BRING MONEY FAST)',
  'NO REFUNDS. NO REGRETS. SOME REGRETS.',
  'TONIGHT: WE GO TO THE SCORECARDS (GOD HELP US)',
  'SUNDAY: COMMISSION HEARING. OPEN BAR.',
  "TONIGHT: IT'S TIIIIIIIIIIME!",
];

/** Channel-guide tiles drifting across the sky, like the home screen on a streaming box. */
const TILES: [string, string, number][] = [
  ['PULL THAT UP JAMIE', 'PODCAST', 0x2b3a67], ['SEND ME LOCATION', 'LIVE', 0x6b1e1e], ['MY BALLS WAS HOT', 'CLASSIC', 0x3d2a52],
  ["I'M NOT SURPRISED MF", 'PPV', 0x1f4d3a], ['THE SMESH', 'NEW', 0x5a3a1a], ['WHO THE F IS THAT GUY', 'PPV', 0x5c1f3a],
  ['KEEP IT ON THE FEET', 'LIVE', 0x2a4a5a], ['4 OZ GLOVES', 'DOC', 0x40402a], ['CALF KICK SEASON', 'NEW', 0x4a2a2a],
  ['BRING BACK SOCCER KICKS', 'RETRO', 0x2a3a2a], ['SCORECARDS (HORROR)', 'MOVIE', 0x3a2a4a], ['THE BMF BELT', 'PPV', 0x5a4a1a],
  ['STANDUP? STAND UP!', 'LIVE', 0x1f3a5c], ['TAPPED TO STRIKES', 'CLIP', 0x3a1f1f], ['SNAP DOWN CITY', 'NEW', 0x2a2a4a],
  ['DO YOU KNOW WHO I AM', 'DRAMA', 0x4a1f3a], ['LEG DAY: THE MOVIE', 'MOVIE', 0x1f4a4a], ['SPINNING SH*T', 'CLIP', 0x4a3a2a],
  ['PAY THE FIGHTERS', 'DOC', 0x3a3a3a], ['GAS TANK EMPTY', 'LIVE', 0x5a2a1a], ['ROUND 6?', 'MYSTERY', 0x2a2a2a],
];

export class TitleScene extends Scene {
  music = 'title' as const;
  private rain = new Graphics();
  private drops: Drop[] = [];
  private marquee = new Graphics();
  private t = 0;
  private flicker = 1;
  private marqueeText: PixelText | null = null;
  private marqueeIdx = Math.floor(Math.random() * MARQUEE.length);
  private marqueeT = 0;
  private tiles = new Container();
  private tileRows: { node: Container; speed: number; width: number }[] = [];

  build(): void {
    const r = this.root;
    this.rain = new Graphics();
    this.marquee = new Graphics();
    r.addChild(fullBg(0x15121a));
    r.addChild(this.drawFacade());
    r.addChild(this.buildTiles());
    r.addChild(this.marquee);
    r.addChild(this.rain);
    if (!this.drops.length)
      for (let i = 0; i < 140; i++)
        this.drops.push({ x: Math.random() * W, y: Math.random() * H, v: 160 + Math.random() * 120, l: 3 + Math.random() * 4 });

    const title = text('CAGE BOSS', 0, 28, { scale: 4, width: W, align: 'center', color: PAL.blood, shadow: PAL.ink });
    r.addChild(title);
    r.addChild(text('A PROMOTER SIMULATOR OF DUBIOUS ETHICS', 0, 64, { small: true, width: W, align: 'center', color: PAL.ash }));

    const menu = new Container();
    const last = latestSave();
    const items: [string, () => void][] = [
      ...(last ? [['CONTINUE', () => continueLatest(this.g)] as [string, () => void]] : []),
      ['NEW CAREER', () => this.g.goto(new NewGameScene(this.g, 'career'))],
      ['ROAD TO CHAMPION', () => this.g.goto(new FMCreateScene(this.g))],
      [hasAchievement('rtc_epilogue') ? 'LEGACY MODE' : 'LEGACY MODE (LOCKED)', () => (hasAchievement('rtc_epilogue') ? this.g.goto(new FMCreateScene(this.g, true)) : alertBox(this.g, 'Legacy Mode', 'Finish Road To Champion to unlock Legacy Mode: the fighter career with the script torn up.'))],
      ['QUICK FIGHT', () => this.g.goto(new QuickFightScene(this.g))],
      ['SANDBOX', () => this.g.goto(new NewGameScene(this.g, 'sandbox'))],
      ['LOAD', () => openLoad(this.g)],
      ['HELP', () => openHelp(this.g)],
      ['ACHIEVEMENTS', () => openAchievements(this.g)],
      ['SETTINGS', () => openSettings(this.g)],
      ['CREDITS', () => openCredits(this.g)],
    ];
    if (desktop) items.push(['QUIT GAME', () => desktop!.quit()]);
    items.forEach(([label, fn], i) => {
      menu.addChild(button(label, 0, i * 14, 116, 12, fn, { fill: label === 'CONTINUE' ? PAL.moss : label === 'HELP' ? PAL.shadow : PAL.night, border: label === 'HELP' || label === 'CONTINUE' ? PAL.gold : PAL.ash }));
    });
    menu.x = Math.floor((W - 116) / 2);
    menu.y = Math.max(80, H - 14 - items.length * 14);
    r.addChild(menu);
    r.addChild(text(`V${__APP_VERSION__}  •  M = MUTE  •  ALL CHARACTERS ARE FICTIONAL. ANY RESEMBLANCE IS A LAWSUIT WAITING TO HAPPEN.`, 0, H - 9, { small: true, width: W, align: 'center', color: PAL.grey }));
    setTimeout(() => maybeWhatsNew(this.g), 400);
  }

  private drawFacade(): Container {
    const c = new Container();
    const g = new Graphics();
    // sky gradient bands
    for (let i = 0; i < 6; i++) g.rect(0, i * 14, W, 14).fill(shade(0x15121a, i * 0.03));
    // distant skyline
    let x = 0;
    let s = 7;
    const rnd = () => ((s = (s * 16807) % 2147483647) / 2147483647);
    while (x < W) {
      const bw = 14 + Math.floor(rnd() * 26);
      const bh = 30 + Math.floor(rnd() * 50);
      g.rect(x, 110 - bh, bw, bh).fill(0x1f1b24);
      for (let wy = 110 - bh + 4; wy < 106; wy += 6)
        for (let wx = x + 3; wx < x + bw - 3; wx += 5) if (rnd() < 0.25) g.rect(wx, wy, 2, 2).fill(0x5a4a3a);
      x += bw + 2;
    }
    // arena building
    g.rect(60, 92, 360, 130).fill(0x2b2530);
    g.rect(60, 92, 360, 4).fill(0x3c3442);
    for (let i = 0; i < 9; i++) g.rect(72 + i * 40, 100, 28, 40).fill(0x221d27);
    // entrance & awning
    g.rect(170, 170, 140, 52).fill(0x1b1720);
    g.rect(160, 160, 160, 10).fill(PAL.blood);
    g.rect(160, 168, 160, 2).fill(shade(PAL.blood, -0.4));
    for (let i = 0; i < 4; i++) g.rect(182 + i * 32, 178, 20, 44).fill(0x3a3122);
    // ground & puddles
    g.rect(0, 222, W, 48).fill(0x141116);
    g.rect(40, 236, 90, 3).fill(0x2a2433);
    g.rect(300, 246, 120, 3).fill(0x2a2433);
    g.rect(200, 256, 60, 2).fill(0x3b2a2a);
    c.addChild(g);
    // marquee board
    const board = new Graphics();
    board.rect(120, 76, 240, 20).fill(PAL.night).stroke({ color: PAL.gold, width: 1 });
    c.addChild(board);
    this.marqueeText = text(MARQUEE[this.marqueeIdx], 120, 83, { small: true, width: 240, align: 'center', color: PAL.gold, maxLines: 1 });
    c.addChild(this.marqueeText);
    return c;
  }

  private buildTiles(): Container {
    this.tiles = new Container();
    this.tileRows = [];
    const order = [...TILES].sort(() => Math.random() - 0.5);
    for (let row = 0; row < 2; row++) {
      const strip = new Container();
      let x = 0;
      // each strip is laid out twice so it can wrap seamlessly
      for (let rep = 0; rep < 2; rep++) {
        order.slice(row * 10, row * 10 + 11).forEach(([label, tag, col]) => {
          const t = new Container();
          const w = 74;
          t.addChild(new Graphics().rect(0, 0, w, 26).fill(col).rect(0, 0, w, 26).stroke({ color: 0x000000, width: 1, alpha: 0.6 }).rect(0, 20, w, 6).fill({ color: 0x000000, alpha: 0.35 }));
          t.addChild(text(label, 3, 3, { small: true, color: 0xffffff, width: w - 6, maxLines: 2 }));
          t.addChild(text(tag, 3, 21, { small: true, color: tag === 'LIVE' ? 0xff6060 : PAL.gold }));
          t.position.set(x, 0);
          strip.addChild(t);
          x += w + 4;
        });
      }
      strip.position.set(-(row * 37), 4 + row * 30);
      this.tiles.addChild(strip);
      this.tileRows.push({ node: strip, speed: row === 0 ? 7 : 11, width: x / 2 });
    }
    // dim it so it reads as a backdrop behind the logo
    this.tiles.alpha = 0.15;
    return this.tiles;
  }

  update(dt: number): void {
    this.t += dt;
    const g = this.rain;
    g.clear();
    for (const d of this.drops) {
      d.y += d.v * dt;
      d.x -= d.v * dt * 0.15;
      if (d.y > H) {
        d.y = -10;
        d.x = Math.random() * (W + 40);
      }
      g.rect(Math.round(d.x), Math.round(d.y), 1, Math.round(d.l)).fill({ color: 0x8aa2b8, alpha: 0.45 });
    }
    // channel tiles drift; second row the other way
    this.tileRows.forEach((r, i) => {
      r.node.x += (i === 0 ? -1 : 1) * r.speed * dt;
      if (r.node.x < -r.width) r.node.x += r.width;
      if (r.node.x > 0) r.node.x -= r.width;
    });
    // the marquee changes its mind every few seconds, with a blink between messages
    this.marqueeT += dt;
    if (this.marqueeText && this.marqueeT > 4.2) {
      this.marqueeT = 0;
      this.marqueeIdx = (this.marqueeIdx + 1) % MARQUEE.length;
      this.marqueeText.setText(MARQUEE[this.marqueeIdx]);
    }
    if (this.marqueeText) this.marqueeText.alpha = this.marqueeT < 0.25 ? (Math.floor(this.marqueeT * 16) % 2 ? 1 : 0.2) : 1;
    // flickering marquee bulbs
    if (Math.random() < 0.02) this.flicker = this.flicker ? 0 : 1;
    const m = this.marquee;
    m.clear();
    for (let i = 0; i < 24; i++) {
      const on = (Math.floor(this.t * 6) + i) % 3 !== 0 && (this.flicker || i % 5);
      m.rect(122 + i * 10, 73, 2, 2).fill(on ? PAL.gold : 0x4a3a20);
      m.rect(122 + i * 10, 97, 2, 2).fill(on ? PAL.gold : 0x4a3a20);
    }
    if (Math.random() < 0.002) sfx('thud');
  }
}
