/**
 * Ending: epilogue newspaper + fates of marquee fighters + stats.
 */
import { Scene, fullBg } from '../app';
import { PAL } from '../../art/palette';
import { W, H, text, button, paper, ScrollBox } from '../kit';
import { content } from '../../core/content';
import { money } from '../../core/format';
import { TitleScene } from './title';
import { fullName } from '../../sim/fighters';
import { hashString } from '../../core/rng';
import { saveToSlot, autoSlot } from '../../core/save';

const FATES_GOOD = ['opened a gym that actually makes money', 'became a beloved commentator', 'retired to a farm and never looks at a cage again', 'got into the Hall of Fame and cried for 40 minutes', 'runs a successful hot sauce empire', 'coaches kids for free on weekends'];
const FATES_BAD = ['is fighting bare-knuckle in a parking lot in Tijuana', 'lost everything in a crypto coin named after themselves', 'hosts a podcast with 11 listeners', 'is suing you. Still.', 'joined a slap league', 'is "between opportunities"'];

export class EndingScene extends Scene {
  build(): void {
    const s = this.g.state!;
    const id = s.ending ?? 'survivor';
    const e = content().endings.find((x) => x.id === id) ?? content().endings[content().endings.length - 1];
    saveToSlot(s, autoSlot(s));
    const r = this.root;
    r.addChild(fullBg(0x1a1418));
    const p = paper(W - 40, H - 30, 'news', 99);
    p.position.set(20, 8);
    r.addChild(p);
    p.addChild(text('THE DAILY CLINCH', 0, 6, { scale: 2, width: W - 40, align: 'center', color: PAL.ink }));
    p.addChild(text('FINAL EDITION', 0, 24, { small: true, width: W - 40, align: 'center', color: PAL.blood }));
    p.addChild(text(e?.headline ?? 'THE END', 10, 34, { width: W - 60, color: PAL.ink }));
    const sb = new ScrollBox(W - 60, H - 110);
    sb.position.set(10, 62);
    let y = 0;
    const add = (str: string, color: number = PAL.ink, small = false) => {
      const t = text(str, 0, y, { width: W - 72, color, small });
      sb.content.addChild(t);
      y += t.textHeight + 6;
    };
    add(`ENDING: ${e?.title ?? id}`, PAL.blood);
    add(e?.text ?? '', PAL.ink);
    add(`${s.promotion.name} - ${Math.floor(s.week / 52)} years, ${s.stats.events ?? 0} events, ${s.stats.bouts ?? 0} fights. Final valuation ${money(s.promotion.valuation)}. Your personal fortune: ${money(s.president.wealth)}.`, PAL.ink, true);
    add(`Arrests: ${s.stats.arrests ?? 0}  •  Doping busts: ${s.stats.dopingBusts ?? 0}  •  Citations: ${s.stats.citations ?? 0}  •  Rules you knowingly broke: ${s.stats.ruleBreaks ?? 0}  •  Fighters who defected: ${s.stats.defections ?? 0}`, PAL.slate, true);
    add('WHERE ARE THEY NOW', PAL.blood);
    const marquee = Object.values(s.fighters).filter((f) => f.marquee).slice(0, 30);
    for (const f of marquee) {
      const h = hashString(f.id + id);
      const good = f.damage < 60 && f.finances.debt < 50000;
      const fate = (good ? FATES_GOOD : FATES_BAD)[h % 6];
      add(`${fullName(f)} (${f.record.w}-${f.record.l}${f.hallOfFame ? ', Hall of Fame' : ''}) ${fate}.`, PAL.ink, true);
    }
    p.addChild(sb);
    sb.refresh();
    r.addChild(button('BACK TO TITLE', W - 120, H - 20, 100, 14, () => {
      this.g.state = null;
      this.g.goto(new TitleScene(this.g));
    }, { fill: PAL.blood }));
  }
}
