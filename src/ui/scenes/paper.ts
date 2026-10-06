/**
 * The Morning Paper: front page + social feed + rule notices. Spins in.
 */
import { Container, Graphics } from 'pixi.js';
import { Scene, fullBg } from '../app';
import { PAL, shade } from '../../art/palette';
import { W, H, text, button, paper, box } from '../kit';
import { fmtDateLong } from '../../core/time';
import { sfx } from '../../audio/sfx';
import { routePhase } from '../flow';
import { compact } from '../../core/format';

export class PaperScene extends Scene {
  private sheet: Container | null = null;
  private t = 0;

  build(): void {
    const s = this.g.state!;
    const r = this.root;
    r.addChild(fullBg(0x2a201a));
    // desk wood grain
    const g = new Graphics();
    for (let y = 0; y < H; y += 6) g.rect(0, y, W, 1).fill(shade(0x2a201a, 0.06));
    r.addChild(g);
    const p = s.media.paper;
    const sheet = new Container();
    const pw = 340;
    const ph = 250;
    sheet.addChild(paper(pw, ph, 'news', s.week));
    // masthead
    sheet.addChild(text('THE DAILY CLINCH', 0, 6, { scale: 2, width: pw, align: 'center', color: PAL.ink }));
    sheet.addChild(new Graphics().rect(6, 24, pw - 12, 1).fill(PAL.ink).rect(6, 26, pw - 12, 1).fill(PAL.ink));
    sheet.addChild(text(`${fmtDateLong(s.week).toUpperCase()}  •  WEEK ${s.week + 1}  •  PRICE: YOUR DIGNITY`, 0, 29, { small: true, width: pw, align: 'center', color: PAL.slate }));
    let y = 38;
    if (p) {
      const lead = text(p.lead.headline.toUpperCase(), 8, y, { width: 220, color: PAL.ink, scale: 1, lineGap: 1 });
      sheet.addChild(lead);
      y += lead.textHeight + 4;
      sheet.addChild(text(p.lead.outlet.toUpperCase(), 8, y, { small: true, color: PAL.blood }));
      y += 8;
      if (p.lead.body) {
        const body = text(p.lead.body, 8, y, { width: 220, color: PAL.shadow, small: true, maxLines: 6 });
        sheet.addChild(body);
        y += body.textHeight + 6;
      }
      sheet.addChild(new Graphics().rect(8, y, 220, 1).fill(PAL.slate));
      y += 4;
      for (const st of p.stories.slice(0, 5)) {
        if (y > ph - 30) break;
        const h = text(st.headline, 8, y, { width: 220, color: PAL.ink, small: true, maxLines: 3 });
        sheet.addChild(h);
        y += h.textHeight + 2;
        sheet.addChild(text('- ' + st.outlet, 8, y, { small: true, color: PAL.grey }));
        y += 10;
      }
      // notices box
      if (p.notices.length) {
        const nb = new Container();
        nb.addChild(box(220, 10 + p.notices.length * 14, shade(PAL.newsprint, -0.1), PAL.ink));
        nb.addChild(text('OFFICIAL NOTICE', 4, 3, { small: true, color: PAL.blood }));
        p.notices.forEach((n, i) => nb.addChild(text(n, 4, 11 + i * 14, { small: true, width: 212, color: PAL.ink, maxLines: 2 })));
        nb.x = 8;
        nb.y = Math.min(y, ph - 12 - (10 + p.notices.length * 14));
        sheet.addChild(nb);
      }
      // social sidebar
      sheet.addChild(new Graphics().rect(234, 38, 1, ph - 46).fill(PAL.slate));
      sheet.addChild(text('THE FEED', 240, 38, { color: PAL.ink }));
      let fy = 50;
      for (const post of p.feed.slice(0, 7)) {
        if (fy > ph - 20) break;
        sheet.addChild(text(post.handle, 240, fy, { small: true, color: PAL.steel }));
        fy += 7;
        const t = text(post.text, 240, fy, { small: true, width: 94, color: PAL.ink, maxLines: 4 });
        sheet.addChild(t);
        fy += t.textHeight + 2;
        sheet.addChild(text('♥ ' + compact(post.likes), 240, fy, { small: true, color: PAL.grey }));
        fy += 10;
      }
    } else {
      sheet.addChild(text('NO PAPER TODAY. THE DELIVERY KID QUIT.', 8, y, { width: 320, color: PAL.ink }));
    }
    sheet.pivot.set(pw / 2, ph / 2);
    sheet.x = W / 2 - 50;
    sheet.y = H / 2;
    this.sheet = sheet;
    r.addChild(sheet);
    // right side info
    const side = new Container();
    side.x = W - 96;
    side.y = 20;
    side.addChild(text(s.promotion.name.toUpperCase(), 0, 0, { small: true, width: 92, color: PAL.gold }));
    side.addChild(text(`ACT ${s.act}`, 0, 20, { color: PAL.bone }));
    side.addChild(text('Grab a coffee.\nThe desk is waiting.', 0, 34, { width: 92, color: PAL.ash, small: true }));
    r.addChild(side);
    r.addChild(button('TO THE DESK →', W - 96, H - 28, 88, 18, () => this.next(), { fill: PAL.blood }));
    this.t = 0;
    sfx('paper');
  }

  update(dt: number): void {
    if (!this.sheet) return;
    this.t = Math.min(1, this.t + dt * 2.2);
    const e = 1 - Math.pow(1 - this.t, 3);
    this.sheet.rotation = (1 - e) * Math.PI * 4 * (this.g.settings.reduceShake ? 0 : 1);
    this.sheet.scale.set(0.1 + 0.9 * e);
  }

  onKey(e: KeyboardEvent): boolean {
    if (e.key === 'Enter' || e.key === ' ') {
      this.next();
      return true;
    }
    return false;
  }

  private next(): void {
    const s = this.g.state!;
    s.phase = 'desk';
    routePhase(this.g);
  }
}
