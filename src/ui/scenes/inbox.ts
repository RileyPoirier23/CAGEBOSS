/**
 * Inbox: messages from the owners, citations, TV offers, sponsor & rival news.
 */
import { Container } from 'pixi.js';
import type { Game } from '../app';
import { PAL } from '../../art/palette';
import { W, H, text, button, box, ScrollBox, clickable, paper } from '../kit';
import { openWindow } from '../widgets';
import { content } from '../../core/content';
import { money } from '../../core/format';
import { fmtDate } from '../../core/time';
import { acceptTvOffer } from '../../sim/world';
import { sfx } from '../../audio/sfx';

export function openInbox(g: Game, onClose: () => void): void {
  const s = g.state!;
  let tab: 'mail' | 'offers' | 'citations' | 'log' = s.market.tvOffers.length ? 'offers' : 'mail';
  const win = openWindow(g, 'Inbox', W - 40, H - 30, { onClose });
  const draw = () => {
    win.body.removeChildren().forEach((c) => c.destroy({ children: true }));
    (['mail', 'offers', 'citations', 'log'] as const).forEach((t, i) =>
      win.body.addChild(button(t.toUpperCase(), 4 + i * 60, 0, 58, 12, () => { tab = t; draw(); }, { small: true, fill: tab === t ? PAL.gold : PAL.slate, textColor: tab === t ? PAL.ink : PAL.bone })));
    const sb = new ScrollBox(W - 52, H - 64);
    sb.position.set(4, 16);
    let y = 0;
    const add = (c: Container, h: number) => {
      c.y = y;
      sb.content.addChild(c);
      y += h + 3;
    };
    if (tab === 'mail') {
      if (!s.inbox.length) add(text('No mail. Suspicious.', 0, 0, { color: PAL.ash }), 10);
      for (const m of s.inbox.slice().reverse()) {
        m.read = true;
        const c = paper(W - 60, 10, 'white', 2);
        const t = text(`${fmtDate(m.week)}  FROM: ${m.from}\n${m.subject}\n\n${m.body}`, 4, 4, { width: W - 70, color: PAL.ink, small: true });
        const p = paper(W - 60, t.textHeight + 8, 'white', 2);
        p.addChild(t);
        c.destroy();
        add(p, t.textHeight + 8);
      }
    } else if (tab === 'offers') {
      if (!s.market.tvOffers.length) add(text('No TV offers on the table. Make the product better (or the network meter higher).', 0, 0, { color: PAL.ash, width: W - 60 }), 20);
      for (const o of s.market.tvOffers) {
        const n = content().networks.find((x) => x.id === o.network);
        const c = new Container();
        c.addChild(box(W - 60, 34, 0x2a2630, PAL.sky));
        c.addChild(text(`${n?.name ?? o.network}  (tier ${o.tier})`, 4, 3, { color: PAL.sky }));
        c.addChild(text(`${money(o.perEvent)} per event for ${o.weeks} weeks${o.ppv ? ' + PPV rights' : ''}. Expires ${fmtDate(o.expires)}.`, 4, 14, { small: true, color: PAL.bone }));
        c.addChild(text(n?.blurb ?? '', 4, 22, { small: true, color: PAL.ash, width: 300 }));
        c.addChild(button('SIGN IT', W - 120, 10, 50, 14, () => { acceptTvOffer(s, o.network); sfx('cash'); draw(); }, { fill: PAL.moss }));
        add(c, 34);
      }
      const tv = s.promotion.tv;
      add(text(`Current deal: ${tv ? `${content().networks.find((x) => x.id === tv.network)?.name ?? tv.network} - ${money(tv.perEvent)}/event until ${fmtDate(tv.until)}${tv.ppv ? ' (PPV)' : ''}` : 'NONE'}`, 0, 0, { color: PAL.gold, width: W - 60 }), 12);
    } else if (tab === 'citations') {
      const cs = s.desk.citations.slice().reverse().slice(0, 40);
      if (!cs.length) add(text('No citations. Teacher\'s pet.', 0, 0, { color: PAL.ash }), 10);
      for (const c of cs) add(text(`${fmtDate(c.week)}  ${c.warning ? 'WARNING' : '-' + money(c.fine)}  ${c.reason}`, 0, 0, { small: true, color: c.warning ? PAL.ash : PAL.blood, width: W - 60 }), 8);
    } else {
      for (const l of s.log.slice().reverse().slice(0, 80)) add(text(`${fmtDate(l.week)}  ${l.text}`, 0, 0, { small: true, color: PAL.bone, width: W - 60 }), 8);
    }
    win.body.addChild(sb);
    sb.refresh();
  };
  draw();
}

export function openTvOffer(g: Game, network: string, onDone: () => void): void {
  const s = g.state!;
  const o = s.market.tvOffers.find((x) => x.network === network);
  const n = content().networks.find((x) => x.id === network);
  if (!o || !n) return onDone();
  const win = openWindow(g, 'TV offer', 300, 130, { onClose: onDone, paper: 'gloss' });
  win.body.addChild(text(`${n.name} wants you.`, 6, 4, { color: PAL.ink }));
  win.body.addChild(text(`${money(o.perEvent)} per event, ${o.weeks} weeks${o.ppv ? ', PPV rights included' : ''}.\n${n.blurb}`, 6, 16, { width: 288, color: PAL.ink, small: true }));
  const cur = s.promotion.tv;
  win.body.addChild(text(`Your current deal: ${cur ? `${money(cur.perEvent)}/event` : 'none'}`, 6, 56, { small: true, color: PAL.slate }));
  win.body.addChild(button('SIGN', 6, 80, 80, 16, () => { acceptTvOffer(s, network); sfx('cash'); win.close(); }, { fill: PAL.moss }));
  win.body.addChild(button('DECLINE', 92, 80, 80, 16, () => { s.market.tvOffers = s.market.tvOffers.filter((x) => x !== o); win.close(); }, { fill: PAL.blood }));
}
