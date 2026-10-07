/**
 * The live Bleeter feed in the corner of the fight view: newest on top, two at most,
 * each one slides in, sits for a few seconds, then fades.
 */
import { Container, Graphics } from 'pixi.js';
import { PAL } from '../art/palette';
import { text } from './kit';
import type { Bleet } from '../sim/bleets';

const W = 142;
const LIFE = 7;
const KIND_COLOR = { fighter: PAL.gold, media: 0x6f9fd8, fan: PAL.ash } as const;

export class BleetFeed extends Container {
  private items: { node: Container; t: number; h: number }[] = [];
  private header: Container;

  constructor() {
    super();
    this.header = new Container();
    this.header.addChild(new Graphics().rect(0, 0, W, 9).fill({ color: 0x1d9bf0, alpha: 0.9 }));
    this.header.addChild(text('BLEETER  •  LIVE', 3, 2, { small: true, color: 0xffffff }));
    this.header.alpha = 0;
    this.addChild(this.header);
  }

  push(b: Bleet): void {
    const c = new Container();
    const body = text(b.text, 4, 9, { small: true, color: PAL.bone, width: W - 8, maxLines: 3 });
    const h = body.textHeight + 13;
    c.addChild(new Graphics().rect(0, 0, W, h).fill({ color: 0x0b0d12, alpha: 0.88 }).rect(0, 0, 2, h).fill(KIND_COLOR[b.kind]));
    c.addChild(text(b.handle, 4, 2, { small: true, color: KIND_COLOR[b.kind], width: W - 30, maxLines: 1 }));
    c.addChild(text(b.kind === 'media' ? 'PRESS' : b.kind === 'fighter' ? 'PRO' : '', W - 26, 2, { small: true, color: PAL.grey }));
    c.addChild(body);
    c.alpha = 0;
    this.addChild(c);
    this.items.unshift({ node: c, t: 0, h });
    while (this.items.length > 2) this.items.pop()!.node.destroy({ children: true });
  }

  update(dt: number): void {
    let y = 11;
    for (const it of this.items) {
      it.t += dt;
      const a = Math.min(1, it.t * 4, (LIFE - it.t) * 1.5);
      it.node.alpha = Math.max(0, a);
      // slide down into place
      it.node.y += (y - it.node.y) * Math.min(1, dt * 10);
      it.node.x = Math.round((1 - Math.min(1, it.t * 4)) * 10);
      y += it.h + 2;
    }
    for (const it of this.items.filter((i) => i.t > LIFE)) it.node.destroy({ children: true });
    this.items = this.items.filter((i) => i.t <= LIFE);
    const want = this.items.length ? 1 : 0;
    this.header.alpha += (want - this.header.alpha) * Math.min(1, dt * 5);
  }
}
