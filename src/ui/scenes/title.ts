/**
 * Title screen: a rainy night street of MMA culture scrolling past forever (src/ui/menuworld.ts),
 * the logo, and a short menu. MODES opens the walkout tunnel; TROPHY CASE the achievements.
 */
import { Container, Graphics } from 'pixi.js';
import { hint } from '../hints';
import { Scene, fullBg } from '../app';
import { PAL } from '../../art/palette';
import { W, H, text, button } from '../kit';
import { sfx } from '../../audio/sfx';
import { openSettings } from './settings';
import { openHelp } from '../help';
import { openAchievements } from '../achievements';
import { maybeWhatsNew } from '../whatsnew';
import { openLoad, latestSave, continueLatest } from './loadmenu';
import { ModesScene } from './modes';
import { buildStreet, STREET_W, type Street } from '../menuworld';
import { openEndCredits } from '../endcredits';
import { openSupport, supportAvailable } from '../support';
import { desktop } from '../../desktop';

interface Drop {
  x: number;
  y: number;
  v: number;
  l: number;
}

export class TitleScene extends Scene {
  music = 'title' as const;
  private rain = new Graphics();
  private drops: Drop[] = [];
  private t = 0;
  private streets: Street[] = [];
  private strip = new Container();
  private far = new Graphics();
  private scroll = 0;

  build(): void {
    const r = this.root;
    this.rain = new Graphics();
    r.addChild(fullBg(0x15121a));
    r.addChild(this.sky());
    // the street: two copies end to end, scrolling forever
    this.strip = new Container();
    this.streets = [buildStreet(0), buildStreet(3)];
    this.streets.forEach((st, i) => {
      st.node.x = i * STREET_W;
      this.strip.addChild(st.node);
    });
    this.strip.x = -this.scroll;
    r.addChild(this.strip);
    r.addChild(this.rain);
    if (!this.drops.length)
      for (let i = 0; i < 140; i++)
        this.drops.push({ x: Math.random() * W, y: Math.random() * H, v: 160 + Math.random() * 120, l: 3 + Math.random() * 4 });

    // the logo and the menu, on a dark glass panel down the left
    const panel = new Graphics();
    panel.rect(0, 0, 176, H).fill(0x0a080e).rect(176, 0, 1, H).fill({ color: PAL.gold, alpha: 0.5 });
    for (let x = 177; x < 200; x++) panel.rect(x, 0, 1, H).fill({ color: 0x0a080e, alpha: 0.5 * (1 - (x - 177) / 23) });
    r.addChild(panel);
    r.addChild(text('CAGE', 14, 14, { scale: 4, color: PAL.blood, shadow: PAL.ink }));
    r.addChild(text('BOSS', 14, 42, { scale: 4, color: PAL.blood, shadow: PAL.ink }));
    r.addChild(text('MMA. MONEY. MAYHEM. SOUP.', 15, 74, { small: true, color: PAL.ash }));

    const menu = new Container();
    const last = latestSave();
    const items: [string, () => void, number?][] = [
      ...(last ? [['CONTINUE', () => continueLatest(this.g), PAL.moss] as [string, () => void, number]] : []),
      ['MODES', () => this.g.goto(new ModesScene(this.g)), PAL.blood],
      ['LOAD', () => openLoad(this.g)],
      ['TROPHY CASE', () => openAchievements(this.g)],
      ['SETTINGS', () => openSettings(this.g)],
      ['HELP', () => openHelp(this.g)],
      // the credits roll, the thank-you, and the memorial
      ['CREDITS', () => openEndCredits(this.g, () => {}, { menu: true })],
    ];
    if (desktop) items.push(['QUIT GAME', () => desktop!.quit()]);
    items.forEach(([label, fn, fill], i) => {
      const big = i < (last ? 2 : 1);
      menu.addChild(button(label, 0, i * 19 + (big ? 0 : 4), 146, big ? 16 : 14, fn, { fill: fill ?? PAL.night, border: big ? PAL.gold : PAL.slate, small: !big }));
    });
    menu.position.set(14, 92);
    r.addChild(menu);
    r.addChild(text(`V${__APP_VERSION__}${hint('  •  M = MUTE', '')}  •  FICTIONAL, EXCEPT THE FRIENDS IN THE CREDITS.`, 14, H - 10, { small: true, color: PAL.grey }));
    // a solo dev: the support screen (desktop and web builds only)
    if (supportAvailable()) r.addChild(button('SUPPORT THE DEV', W - 96, H - 20, 90, 13, () => openSupport(this.g), { small: true, fill: PAL.blood, border: PAL.gold }));
    setTimeout(() => maybeWhatsNew(this.g), 400);
  }

  /** The night sky and a far skyline that drifts slower than the street (parallax). */
  private sky(): Container {
    const c = new Container();
    const g = new Graphics();
    for (let i = 0; i < 10; i++) g.rect(0, i * 14, W, 14).fill(0x15121a + i * 0x010102);
    g.circle(420, 30, 10).fill(0xe8e4d0).circle(424, 27, 9).fill(0x1c1824);
    c.addChild(g);
    this.far = new Graphics();
    let s = 5;
    const rnd = () => ((s = (s * 16807) % 2147483647) / 2147483647);
    for (let x = 0; x < W * 2; ) {
      const bw = 20 + Math.floor(rnd() * 36);
      const bh = 50 + Math.floor(rnd() * 70);
      this.far.rect(x, 140 - bh, bw, bh).fill(0x18151e);
      x += bw;
    }
    c.addChild(this.far);
    return c;
  }

  update(dt: number): void {
    this.t += dt;
    this.scroll = (this.scroll + dt * 16) % STREET_W;
    this.strip.x = -Math.round(this.scroll);
    this.far.x = -Math.round((this.scroll * 0.3) % W);
    for (const st of this.streets) st.update(this.t, dt);
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
    if (Math.random() < 0.002) sfx('thud');
  }
}
