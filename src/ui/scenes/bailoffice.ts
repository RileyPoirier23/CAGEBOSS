/**
 * The Bail Office: a jail visitor window. Review the charge sheet, pick a
 * lawyer, check the court date against the fight schedule, decide who pays
 * (or let them sit), then spin it to the press.
 */
import { Container, Graphics } from 'pixi.js';
import type { Game } from '../app';
import type { DeskDoc } from '../../core/types';
import { PAL } from '../../art/palette';
import { W, H, text, button, box, paper } from '../kit';
import { fighterPortrait, npcPortrait } from '../sprites';
import { content } from '../../core/content';
import { money, clamp } from '../../core/format';
import { fmtDate, fmtFightDate } from '../../core/time';
import { LAWYERS, lawyerFee, decideBail } from '../../sim/legal';
import { upcomingEvents } from '../../sim/events';
import { adjustMeter } from '../../sim/econ';
import { sfx } from '../../audio/sfx';
import { alertBox } from '../widgets';

export function openBailOffice(g: Game, doc: DeskDoc, onDone: () => void): void {
  const s = g.state!;
  const c = s.legal.cases.find((x) => x.id === doc.meta.caseId);
  if (!c || c.status !== 'custody') {
    s.desk.queue = s.desk.queue.filter((d) => d !== doc);
    onDone();
    return;
  }
  const f = c.who === 'president' ? null : s.fighters[c.who];
  const charge = content().charges.find((x) => x.id === c.charge);
  let lawyer: keyof typeof LAWYERS = 'mid';
  const frame = new Container();
  const wrap = g.modal(frame, { dim: 0.7 });
  const close = () => {
    g.closeModal(wrap);
    onDone();
  };
  const draw = () => {
    frame.removeChildren().forEach((x) => x.destroy({ children: true }));
    frame.addChild(box(W - 20, H - 20, 0x2b2d33, PAL.ink, { bevel: true })).position.set(10, 10);
    frame.addChild(text('COUNTY DETENTION CENTER  •  VISITOR WINDOW 3', 16, 15, { small: true, color: PAL.gold }));
    // the glass
    const glass = new Graphics();
    glass.rect(16, 24, 150, 120).fill(0x3e4a52).stroke({ color: 0x6b7a84, width: 2 });
    for (let i = 0; i < 6; i++) glass.moveTo(20 + i * 24, 26).lineTo(30 + i * 24, 142).stroke({ color: 0x8aa2b8, width: 1, alpha: 0.15 });
    frame.addChild(glass);
    const por = f ? fighterPortrait(f, 64, 'mugshot') : npcPortrait('president' + s.president.name, 'exec', 64);
    por.position.set(59, 40);
    frame.addChild(por);
    frame.addChild(text(f ? `${f.first} "${f.nick}" ${f.last}` : `${s.president.name} (YOU)`, 16, 108, { width: 150, align: 'center', color: PAL.bone }));
    frame.addChild(text(f ? `"${pickLine(f.id)}"` : '"I want my phone call. And a Red Bull."', 16, 120, { width: 150, align: 'center', small: true, color: PAL.ash }));
    // charge sheet
    const sheet = paper(290, 92, 'carbon', 3);
    sheet.position.set(176, 24);
    frame.addChild(sheet);
    sheet.addChild(text('CHARGE SHEET', 6, 4, { small: true, color: PAL.blood }));
    sheet.addChild(text(charge?.name ?? c.charge, 6, 12, { color: PAL.ink }));
    sheet.addChild(text(charge?.desc ?? '', 6, 24, { small: true, width: 278, color: PAL.ink }));
    sheet.addChild(text(`BAIL: ${money(c.bail, false)}`, 6, 52, { color: PAL.ink }));
    sheet.addChild(text(`COURT DATE: ${fmtDate(c.courtWeek)}`, 6, 63, { color: PAL.ink }));
    sheet.addChild(text(`${c.noTravel ? 'NO-TRAVEL ORDER  ' : ''}${c.monitor ? 'ANKLE MONITOR' : ''}`, 6, 75, { small: true, color: PAL.blood }));
    // schedule check
    const fights = f ? upcomingEvents(s).filter((e) => e.card.some((b) => b.status === 'scheduled' && (b.a === f.id || b.b === f.id))) : [];
    const sched = paper(290, 26, 'white', 4);
    sched.position.set(176, 118);
    frame.addChild(sched);
    if (fights.length) {
      const e = fights[0];
      const clash = e.week >= c.courtWeek && e.week - c.courtWeek < 1;
      sched.addChild(text(`BOOKED: ${e.name} - ${fmtFightDate(e.week)}`, 4, 4, { small: true, color: PAL.ink }));
      sched.addChild(text(clash ? 'CONFLICT WITH COURT DATE!' : 'No clash with the court date (yet).', 4, 14, { small: true, color: clash ? PAL.blood : PAL.moss }));
    } else sched.addChild(text('Not booked on any upcoming card.', 4, 9, { small: true, color: PAL.grey }));
    // lawyers
    frame.addChild(text('LAWYER', 16, 150, { small: true, color: PAL.gold }));
    (Object.keys(LAWYERS) as (keyof typeof LAWYERS)[]).forEach((k, i) => {
      const L = LAWYERS[k];
      frame.addChild(button(`${L.name}  ${lawyerFee(s, k) ? money(lawyerFee(s, k)) : 'FREE'}`, 16 + i * 152, 158, 148, 14, () => {
        lawyer = k;
        draw();
      }, { small: true, fill: lawyer === k ? PAL.gold : PAL.slate, textColor: lawyer === k ? PAL.ink : PAL.bone }));
    });
    frame.addChild(text(`Promotion cash ${money(s.promotion.cash)}  •  Your money ${money(s.president.wealth)}`, 16, 178, { small: true, color: PAL.ash }));
    frame.addChild(text('WHO PAYS THE BAIL?', 16, 190, { small: true, color: PAL.gold }));
    const decide = (pay: 'promotion' | 'personal' | 'none') => {
      const msg = decideBail(s, c.id, { pay, lawyer });
      s.desk.queue = s.desk.queue.filter((d) => d !== doc);
      sfx(pay === 'none' ? 'bad' : 'cash');
      spin(msg);
    };
    frame.addChild(button('PROMOTION PAYS', 16, 198, 140, 16, () => decide('promotion'), { fill: PAL.steel }));
    frame.addChild(button('PAY FROM MY POCKET', 160, 198, 140, 16, () => decide('personal'), { fill: PAL.moss }));
    frame.addChild(button('LET THEM SIT', 304, 198, 140, 16, () => decide('none'), { fill: PAL.blood }));
    frame.addChild(text('Paying personally builds loyalty. Letting them sit saves money and makes enemies. The cheap lawyer loses more often.', 16, 220, { small: true, width: W - 40, color: PAL.ash }));
  };
  const spin = (msg: string) => {
    frame.removeChildren().forEach((x) => x.destroy({ children: true }));
    const bw = 360;
    frame.addChild(box(bw, 150, PAL.night, PAL.gold, { shadow: true, bevel: true })).position.set((W - bw) / 2, 50);
    const x0 = (W - bw) / 2 + 8;
    frame.addChild(text(msg, x0, 58, { width: bw - 16, color: PAL.bone }));
    frame.addChild(text('Reporters are outside. How do you spin it?', x0, 96, { color: PAL.gold }));
    const opts: [string, () => void][] = [
      ['"No comment." (walk past them)', () => adjustMeter(s, 'media', -1)],
      ['"He\'s innocent until proven guilty." (defend)', () => { adjustMeter(s, 'fighters', 2); adjustMeter(s, 'media', -1); adjustMeter(s, 'sponsors', -1); }],
      ['"Look, the kid made a mistake. We\'ll handle it." (contrite)', () => { adjustMeter(s, 'media', 2); adjustMeter(s, 'sponsors', 1); }],
      ['Make a joke about it (fans love it, everyone else doesn\'t)', () => { adjustMeter(s, 'fans', 2); adjustMeter(s, 'media', -2); adjustMeter(s, 'commission', -1); }],
      ['Throw them under the bus', () => { adjustMeter(s, 'fighters', -3); adjustMeter(s, 'sponsors', 2); if (f) f.loyalty = clamp(f.loyalty - 20, 0, 100); }],
    ];
    if (charge?.serious) opts.splice(3, 1); // no jokes on serious charges
    opts.forEach(([label, fn], i) =>
      frame.addChild(button(label, x0, 108 + i * 15, bw - 16, 13, () => {
        fn();
        close();
        if (charge?.serious) alertBox(g, 'Note', 'This was a serious incident. The promotion has referred it to the appropriate authorities and support services.');
      }, { small: true, align: 'left' })),
    );
  };
  draw();
}

const LINES = [
  'It wasn\'t me. It was my cousin. Who looks exactly like me.',
  'Can you get me out before the weigh-ins?',
  'They took my shoelaces, boss. MY SHOELACES.',
  'I want to speak to my manager. No, my OTHER manager.',
  'Is this gonna affect my bonus?',
  'The cop started it. Spiritually.',
  'Bro I\'m trending right now, right?',
  'They have no evidence. Except the video. And the witnesses.',
];
function pickLine(id: string): string {
  let h = 0;
  for (const ch of id) h = (h * 31 + ch.charCodeAt(0)) >>> 0;
  return LINES[h % LINES.length];
}
