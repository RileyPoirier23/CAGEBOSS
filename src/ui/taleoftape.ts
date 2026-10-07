/**
 * Tale of the tape: the broadcast graphic before the walkouts. Both fighters' photos at the
 * sides, the numbers down the middle, odds at the bottom. Fades in, holds, fades out.
 */
import { Container, Graphics } from 'pixi.js';
import type { Fighter } from '../core/types';
import { PAL } from '../art/palette';
import { text } from './kit';
import { fighterPortrait } from './sprites';
import { record, heightStr } from '../core/format';
import { quickOdds, oddsString } from '../sim/fight';
import { divisionName } from '../sim/divisions';

const HOLD = 5.5;

export class TaleOfTape extends Container {
  t = 0;

  constructor(A: Fighter, B: Fighter, aw: number, title: string, weightA: number, weightB: number, ranks: [string, string] = ['NR', 'NR']) {
    super();
    const w = 300;
    const x0 = Math.round((aw - w) / 2);
    const y0 = 16;
    const g = new Graphics()
      .rect(x0, y0, w, 112).fill({ color: 0x0a0a10, alpha: 0.92 })
      .rect(x0, y0, w, 12).fill(0xa01818)
      .rect(x0, y0 + 12, w, 1).fill(PAL.gold)
      .rect(x0 + 2, y0 + 14, 3, 96).fill(0x9e2a2a)
      .rect(x0 + w - 5, y0 + 14, 3, 96).fill(0x284a86);
    this.addChild(g);
    this.addChild(text(title.toUpperCase(), x0, y0 + 3, { small: true, width: w, align: 'center', color: 0xffffff }));
    const pa = fighterPortrait(A, 64);
    pa.position.set(x0 + 8, y0 + 18);
    const pb = fighterPortrait(B, 64);
    pb.position.set(x0 + w - 72, y0 + 18);
    this.addChild(pa, pb);
    this.addChild(text(A.last.toUpperCase(), x0 + 8, y0 + 84, { color: PAL.bone, width: 64, align: 'center', maxLines: 1 }));
    this.addChild(text(B.last.toUpperCase(), x0 + w - 72, y0 + 84, { color: PAL.bone, width: 64, align: 'center', maxLines: 1 }));
    this.addChild(text(`"${A.nick}"`, x0 + 4, y0 + 95, { small: true, color: PAL.gold, width: 72, align: 'center', maxLines: 1 }));
    this.addChild(text(`"${B.nick}"`, x0 + w - 76, y0 + 95, { small: true, color: PAL.gold, width: 72, align: 'center', maxLines: 1 }));
    const p = quickOdds(A, B);
    const rows: [string, string, string][] = [
      ['RECORD', record(A.record), record(B.record)],
      ['RANK', ranks[0], ranks[1]],
      ['AGE', String(A.age), String(B.age)],
      ['HEIGHT', heightStr(A.height), heightStr(B.height)],
      ['WEIGHT', `${weightA} LBS`, `${weightB} LBS`],
      ['REACH', `${Math.round(A.reach / 2.54)}"`, `${Math.round(B.reach / 2.54)}"`],
      ['STANCE', A.stance.toUpperCase(), B.stance.toUpperCase()],
      ['FROM', A.country.toUpperCase(), B.country.toUpperCase()],
      ['ODDS', oddsString(p), oddsString(1 - p)],
    ];
    const cx = x0 + 78;
    const cw = w - 156;
    rows.forEach(([label, a, b], i) => {
      const y = y0 + 18 + i * 11;
      if (i % 2 === 0) this.addChild(new Graphics().rect(cx, y - 1, cw, 10).fill({ color: 0xffffff, alpha: 0.05 }));
      this.addChild(text(a, cx + 2, y + 1, { small: true, color: PAL.bone, width: cw / 2 - 18, maxLines: 1 }));
      this.addChild(text(label, cx, y + 1, { small: true, color: PAL.gold, width: cw, align: 'center' }));
      this.addChild(text(b, cx + cw / 2 + 16, y + 1, { small: true, color: PAL.bone, width: cw / 2 - 18, align: 'right', maxLines: 1 }));
    });
    this.addChild(text(divisionName(A.division).toUpperCase(), cx, y0 + 104, { small: true, color: PAL.ash, width: cw, align: 'center' }));
    this.alpha = 0;
  }

  /** false once it has finished fading out */
  update(dt: number): boolean {
    this.t += dt;
    this.alpha = this.t < 0.4 ? this.t / 0.4 : this.t < HOLD ? 1 : Math.max(0, 1 - (this.t - HOLD) / 0.5);
    return this.t < HOLD + 0.5;
  }
}
