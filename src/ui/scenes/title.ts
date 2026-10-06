/**
 * Title screen: a rain-soaked arena facade at night with a flickering marquee.
 */
import { Container, Graphics } from 'pixi.js';
import { Scene, fullBg } from '../app';
import { PAL, shade } from '../../art/palette';
import { W, H, text, button } from '../kit';
import { sfx } from '../../audio/sfx';
import { openSettings } from './settings';
import { openLoad } from './loadmenu';
import { NewGameScene } from './newgame';
import { openCredits } from './credits';

interface Drop {
  x: number;
  y: number;
  v: number;
  l: number;
}

export class TitleScene extends Scene {
  private rain = new Graphics();
  private drops: Drop[] = [];
  private marquee = new Graphics();
  private t = 0;
  private flicker = 1;

  build(): void {
    const r = this.root;
    r.addChild(fullBg(0x15121a));
    r.addChild(this.drawFacade());
    r.addChild(this.marquee);
    r.addChild(this.rain);
    if (!this.drops.length)
      for (let i = 0; i < 140; i++)
        this.drops.push({ x: Math.random() * W, y: Math.random() * H, v: 160 + Math.random() * 120, l: 3 + Math.random() * 4 });

    const title = text('CAGE BOSS', 0, 28, { scale: 4, width: W, align: 'center', color: PAL.blood, shadow: PAL.ink });
    r.addChild(title);
    r.addChild(text('A PROMOTER SIMULATOR OF DUBIOUS ETHICS', 0, 64, { small: true, width: W, align: 'center', color: PAL.ash }));

    const menu = new Container();
    const items: [string, () => void][] = [
      ['NEW CAREER', () => this.g.goto(new NewGameScene(this.g, 'career'))],
      ['SANDBOX', () => this.g.goto(new NewGameScene(this.g, 'sandbox'))],
      ['LOAD', () => openLoad(this.g)],
      ['SETTINGS', () => openSettings(this.g)],
      ['CREDITS', () => openCredits(this.g)],
    ];
    items.forEach(([label, fn], i) => {
      menu.addChild(button(label, 0, i * 17, 96, 14, fn, { fill: PAL.night, border: PAL.ash }));
    });
    menu.x = Math.floor((W - 96) / 2);
    menu.y = 150;
    r.addChild(menu);
    r.addChild(text('v0.1  •  M = MUTE  •  ALL CHARACTERS ARE FICTIONAL. ANY RESEMBLANCE IS A LAWSUIT WAITING TO HAPPEN.', 0, H - 9, { small: true, width: W, align: 'center', color: PAL.grey }));
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
    c.addChild(text('TONIGHT: TWO GUYS YOU HAVEN\'T HEARD OF', 120, 83, { small: true, width: 240, align: 'center', color: PAL.gold }));
    return c;
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
