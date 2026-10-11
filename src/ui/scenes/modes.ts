/**
 * MODES: the walkout tunnel. Five cards, one per way to play, each with its own little picture:
 * the promoter's desk, Uncle Ray's soup pot, Allstar's cowboy hat, a face-off in the cage, and a
 * sandbox with a very small octagon in it.
 */
import { Container, Graphics } from 'pixi.js';
import { hint } from '../hints';
import { Scene, fullBg } from '../app';
import { PAL } from '../../art/palette';
import { W, H, text, button, box } from '../kit';
import { POSES, drawRig, type Look2 } from '../rig';
import { CAST } from '../cutscene';
import { sfx } from '../../audio/sfx';
import { hasAchievement } from '../achievements';
import { alertBox } from '../widgets';
import { NewGameScene } from './newgame';
import { FMCreateScene } from './fmcreate';
import { QuickFightScene } from './quickfight';
import { TitleScene } from './title';

const look = (o: Partial<Look2>): Look2 => ({ skin: 0xd8a07a, hairStyle: 1, hairColor: 0x2a1a10, beard: 0, build: 1, trunks: 0x222222, trim: 0x222222, glove: 0x8e1e1e, stance: 'upright', female: false, tattoo: 0, ...o });
const HAN = look({ skin: 0xe8c0a0, hairStyle: 9, hairColor: 0x3b2a1e, beard: 5, trunks: 0x8e2f2f, trim: 0xc4a04a, glove: 0x8e1e1e });

interface Mode {
  id: string;
  title: string;
  tag: string;
  desc: string;
  bg: number;
  locked?: string;
  go: () => void;
  art: (g: Graphics, w: number, h: number) => void;
}

const CW = 88;
const CH = 186;
const ART_H = 82;

export class ModesScene extends Scene {
  music = 'title' as const;
  private t = 0;
  private lights = new Graphics();

  build(): void {
    const r = this.root;
    r.addChild(fullBg(0x0c0b10));
    r.addChild(this.tunnel());
    this.lights = new Graphics();
    r.addChild(this.lights);
    r.addChild(text('MODES', 0, 10, { scale: 2, width: W, align: 'center', color: PAL.gold, shadow: 0x000000 }));
    r.addChild(text('PICK HOW YOU WANT TO GET HURT', 0, 30, { small: true, width: W, align: 'center', color: PAL.ash }));
    r.addChild(button('< BACK', 8, 8, 52, 14, () => this.back(), { small: true, fill: PAL.shadow, border: PAL.gold }));
    const legacy = hasAchievement('rtc_epilogue');
    const modes: Mode[] = [
      {
        id: 'career', title: 'PROMOTER', tag: 'NEW CAREER', bg: 0x2a2030,
        desc: 'Run the promotion. Sign fighters, catch the bad paperwork, book the cards, keep the commission off your back.',
        go: () => this.g.goto(new NewGameScene(this.g, 'career')),
        art: (g, w, h) => {
          // the office: skyline window, the promoter behind his desk, a stamp, a stack of contracts
          g.rect(0, 0, w, h).fill(0x141a30);
          for (let k = 0; k < 7; k++) g.rect(4 + k * 12, 40 - ((k * 13) % 22), 10, 30).fill(0x0a1020);
          drawRig(g, POSES.taunt, w / 2, h - 6, 1, CAST.dane, 0.62);
          g.rect(6, h - 30, w - 12, 24).fill(0x4a3226).rect(6, h - 30, w - 12, 3).fill(0x6a4a36);
          g.rect(14, h - 38, 18, 8).fill(0xf2ead6).rect(16, h - 41, 18, 8).fill(0xe8e0d0);
          g.rect(60, h - 42, 6, 8).fill(0x6a4a2a).rect(57, h - 35, 12, 4).fill(0x8e2f2f);
        },
      },
      {
        id: 'rtc', title: 'ROAD TO CHAMPION', tag: 'THE STORY', bg: 0x3a1e18,
        desc: 'Han "The Pride Of The Maritimes" Tibular, Uncle Ray\'s Boxing & Soup, and the long road to the CBFC.',
        go: () => this.g.goto(new FMCreateScene(this.g)),
        art: (g, w, h) => {
          // the gym: bricks, a heavy bag, Han, and the soup
          g.rect(0, 0, w, h).fill(0x4a2a24);
          for (let y = 0; y < h; y += 6) for (let x = (y / 6) % 2 ? -5 : 0; x < w; x += 10) g.rect(x + 1, y + 1, 8, 4).fill(0x55302a);
          g.rect(13, 0, 1, 14).fill(0x6a6a70).roundRect(8, 14, 12, 36, 4).fill(0x8e2f2f);
          drawRig(g, POSES.guard, 40, h - 4, 1, HAN, 0.66);
          g.rect(58, h - 24, 26, 20).fill(0x3a3a40).roundRect(60, h - 38, 22, 15, 3).fill(0x9a9aa0).rect(76, h - 46, 2, 12).fill(0xb0b0b6);
          for (let k = 0; k < 3; k++) g.circle(66 + k * 5, h - 44 - k * 4, 2).fill({ color: 0xffffff, alpha: 0.15 });
          g.rect(0, h - 4, w, 4).fill(0x2a3a4a);
        },
      },
      {
        id: 'legacy', title: 'LEGACY MODE', tag: 'NO SCRIPT', bg: 0x1e2a1e,
        locked: legacy ? undefined : 'FINISH ROAD TO CHAMPION',
        desc: 'The fighter career with the script torn up. Allstar is starting a league, and you\'re his first signing.',
        go: () => (legacy ? this.g.goto(new FMCreateScene(this.g, true)) : alertBox(this.g, 'Legacy Mode', 'Finish Road To Champion to unlock Legacy Mode: the fighter career with the script torn up.')),
        art: (g, w, h) => {
          // a dusty arena at sunset, Allstar in his hat, a belt over his shoulder
          for (let y = 0; y < h; y += 2) g.rect(0, y, w, 2).fill(y < 40 ? 0x8a4a2a + (y >> 3) * 0x020000 : 0x3a2a1a);
          g.circle(w / 2, 40, 14).fill(0xe8a040);
          g.rect(0, 40, w, h - 40).fill(0x4a3420);
          drawRig(g, POSES.taunt, w / 2, h - 4, 1, CAST.xavier, 0.66);
          g.rect(w / 2 - 10, h - 46, 22, 5).fill(0x1a1a1a).roundRect(w / 2 - 3, h - 49, 9, 10, 2).fill(PAL.gold);
        },
      },
      {
        id: 'quick', title: 'QUICK FIGHT', tag: 'ONE FIGHT', bg: 0x1e2236,
        desc: 'Pick two fighters and go. Play the computer, or a friend on the same keyboard or a second controller.',
        go: () => this.g.goto(new QuickFightScene(this.g)),
        art: (g, w, h) => {
          // the cage: lights, the fence, a jab and a block
          g.rect(0, 0, w, h).fill(0x141018);
          for (const lx of [16, 44, 72]) g.poly([lx, 0, lx - 14, h, lx + 14, h]).fill({ color: 0xfff2c8, alpha: 0.05 });
          for (let y = 10; y < h - 8; y += 4) for (let x = (y / 4) % 2 ? 2 : 0; x < w; x += 4) g.rect(x, y, 1, 1).fill(0x3a3a44);
          g.rect(0, h - 8, w, 8).fill(0xcfc8b9);
          drawRig(g, POSES.jab, 30, h - 6, 1, look({ trunks: 0xc8202a, skin: 0xe8c0a0, hairStyle: 2 }), 0.6);
          drawRig(g, POSES.block, 60, h - 6, -1, look({ trunks: 0x1f3a6e, skin: 0x8a5a3a, hairStyle: 0, beard: 2 }), 0.6);
        },
      },
      {
        id: 'sandbox', title: 'SANDBOX', tag: 'NO RULES', bg: 0x2a2a1a,
        desc: 'The promoter game with the guard rails off. Every fighter, any card, nobody to answer to.',
        go: () => this.g.goto(new NewGameScene(this.g, 'sandbox')),
        art: (g, w, h) => {
          // an actual sandbox: a wooden frame, a bucket, a spade, a very small octagon
          g.rect(0, 0, w, h).fill(0x6aa0c8);
          g.circle(70, 14, 7).fill(0xffe890);
          g.rect(0, 46, w, h - 46).fill(0x3a7a3a);
          g.rect(6, 52, w - 12, 26).fill(0xe8d090).rect(6, 52, w - 12, 3).fill(0x8a5a2a).rect(6, 52, 3, 26).fill(0x8a5a2a).rect(w - 9, 52, 3, 26).fill(0x8a5a2a);
          g.poly([34, 56, 50, 56, 56, 62, 56, 70, 50, 76, 34, 76, 28, 70, 28, 62]).stroke({ color: 0x3a3a44, width: 1 }).fill({ color: 0xcfc8b9, alpha: 0.6 });
          drawRig(g, POSES.celebrate, 42, 72, 1, look({ trunks: 0xc4a04a, skin: 0xd8a07a }), 0.22);
          g.rect(64, 60, 10, 10).fill(0xc8202a).rect(63, 59, 12, 2).fill(0xe04040);
          g.rect(16, 44, 2, 20).fill(0x8a6a4a).poly([13, 62, 21, 62, 19, 70, 15, 70]).fill(0x8a8a90);
        },
      },
    ];
    const x0 = Math.round((W - (modes.length * CW + (modes.length - 1) * 6)) / 2);
    modes.forEach((m, i) => r.addChild(this.card(m, x0 + i * (CW + 6), 46)));
    r.addChild(text(hint('ESC = BACK', '{B} = BACK'), 0, H - 10, { small: true, width: W, align: 'center', color: PAL.grey }));
  }

  private card(m: Mode, x: number, y: number): Container {
    const c = new Container();
    c.position.set(x, y);
    c.addChild(box(CW, CH, m.bg, m.locked ? PAL.grey : PAL.gold, { bevel: true }));
    const art = new Graphics();
    m.art(art, CW - 6, ART_H);
    art.position.set(3, 3);
    const mask = new Graphics().rect(3, 3, CW - 6, ART_H).fill(0xffffff);
    art.mask = mask;
    c.addChild(art, mask);
    c.addChild(new Graphics().rect(3, 3 + ART_H, CW - 6, 1).fill(m.locked ? PAL.grey : PAL.gold));
    c.addChild(text(m.tag, 0, ART_H + 8, { small: true, width: CW, align: 'center', color: m.locked ? PAL.grey : PAL.ember }));
    c.addChild(text(m.title, 4, ART_H + 17, { width: CW - 8, align: 'center', color: m.locked ? PAL.ash : PAL.bone, maxLines: 2 }));
    c.addChild(text(m.desc, 6, ART_H + 40, { small: true, width: CW - 12, color: m.locked ? PAL.grey : PAL.ash, maxLines: 7 }));
    if (m.locked) {
      c.addChild(new Graphics().rect(3, 3, CW - 6, ART_H).fill({ color: 0x000000, alpha: 0.6 }));
      // the padlock
      const pl = new Graphics().roundRect(CW / 2 - 9, 30, 18, 14, 2).fill(PAL.gold).rect(CW / 2 - 6, 22, 2, 9).fill(PAL.gold).rect(CW / 2 + 4, 22, 2, 9).fill(PAL.gold).rect(CW / 2 - 6, 20, 12, 3).fill(PAL.gold).rect(CW / 2 - 1, 35, 2, 5).fill(0x3a2a14);
      c.addChild(pl);
      c.addChild(text(m.locked, 4, 50, { small: true, width: CW - 8, align: 'center', color: PAL.bone, maxLines: 2 }));
    }
    c.addChild(button(m.locked ? 'LOCKED' : 'PLAY', 8, CH - 20, CW - 16, 14, () => { sfx('click'); m.go(); }, { small: true, fill: m.locked ? PAL.shadow : PAL.moss, border: m.locked ? PAL.grey : PAL.gold }));
    // the whole card is the button
    const hit = new Graphics().rect(0, 0, CW, CH - 24).fill({ color: 0, alpha: 0.001 });
    hit.eventMode = 'static';
    hit.cursor = 'pointer';
    hit.on('pointerover', () => (c.y = y - 2));
    hit.on('pointerout', () => (c.y = y));
    hit.on('pointertap', () => { sfx('click'); m.go(); });
    c.addChild(hit);
    return c;
  }

  /** The walkout tunnel: concrete, cables, banners, and the light at the end of it. */
  private tunnel(): Graphics {
    const g = new Graphics();
    const vx = W / 2, vy = 120;
    g.rect(0, 0, W, H).fill(0x15141a);
    // the far end: the arena light
    g.rect(vx - 40, vy - 30, 80, 60).fill(0xfff2c8);
    g.rect(vx - 40, vy - 30, 80, 60).fill({ color: 0xffd890, alpha: 0.6 });
    // walls, ceiling, floor in perspective
    g.poly([0, 0, vx - 40, vy - 30, vx - 40, vy + 30, 0, H]).fill(0x24222a);
    g.poly([W, 0, vx + 40, vy - 30, vx + 40, vy + 30, W, H]).fill(0x24222a);
    g.poly([0, 0, W, 0, vx + 40, vy - 30, vx - 40, vy - 30]).fill(0x1a1920);
    g.poly([0, H, W, H, vx + 40, vy + 30, vx - 40, vy + 30]).fill(0x2e2a30);
    // ribs of the tunnel
    for (let k = 1; k < 6; k++) {
      const f = k / 6;
      const x1 = vx - 40 - (vx - 40) * (1 - f), y1 = vy - 30 - (vy - 30) * (1 - f);
      g.rect(x1, y1, (vx - x1) * 2, 2).fill({ color: 0x000000, alpha: 0.3 });
      g.rect(x1, y1, 2, (vy - y1) * 2).fill({ color: 0x000000, alpha: 0.3 });
      g.rect(W - x1 - 2, y1, 2, (vy - y1) * 2).fill({ color: 0x000000, alpha: 0.3 });
    }
    // the light spilling down the floor
    g.poly([vx - 40, vy + 30, vx + 40, vy + 30, vx + 160, H, vx - 160, H]).fill({ color: 0xffe8b0, alpha: 0.08 });
    // banners on the walls
    g.poly([18, 40, 52, 52, 52, 150, 18, 160]).fill(0x5a1414);
    g.poly([W - 18, 40, W - 52, 52, W - 52, 150, W - 18, 160]).fill(0x14285a);
    return g;
  }

  private back(): void {
    sfx('click');
    this.g.goto(new TitleScene(this.g));
  }

  onKey(e: KeyboardEvent): boolean {
    if (e.type === 'keydown' && (e.key === 'Escape' || e.key === 'Backspace') && !this.g.modals.length) {
      this.back();
      return true;
    }
    return false;
  }

  update(dt: number): void {
    this.t += dt;
    // the arena lights at the end of the tunnel sweep
    const l = this.lights;
    l.clear();
    for (let k = 0; k < 3; k++) {
      const a = Math.sin(this.t * 0.7 + k * 2.1) * 0.5;
      const x = W / 2 + Math.sin(a) * 30;
      l.poly([x - 3, 92, x + 3, 92, x + 60 * Math.sin(a + 0.4), 40, x + 60 * Math.sin(a - 0.4) - 10, 40]).fill({ color: 0xfff2c8, alpha: 0.05 });
    }
  }
}
