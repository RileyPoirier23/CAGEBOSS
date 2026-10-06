/**
 * PPV / TV ratings chart: your events vs rival promotions and other combat
 * sports (boxing, influencer boxing, pro wrestling, bare-knuckle, slap...).
 */
import type { Game } from '../app';
import { PAL } from '../../art/palette';
import { W, H, text, box, ScrollBox } from '../kit';
import { openWindow } from '../widgets';
import { fmtDate } from '../../core/time';
import { compact } from '../../core/format';
import { content } from '../../core/content';

export function openChart(g: Game): void {
  const s = g.state!;
  const win = openWindow(g, 'Combat sports ratings', W - 40, H - 30);
  const sb = new ScrollBox(W - 52, H - 50);
  sb.position.set(4, 2);
  let y = 0;
  const charts = s.market.chart.slice().reverse().slice(0, 10);
  if (!charts.length) sb.content.addChild(text('No ratings yet. Run an event.', 0, 0, { color: PAL.ash }));
  for (const ch of charts) {
    sb.content.addChild(text(`WEEK OF ${fmtDate(ch.week).toUpperCase()}`, 0, y, { small: true, color: PAL.gold }));
    y += 9;
    const max = Math.max(1, ...ch.rows.map((r) => r.buys));
    ch.rows.slice(0, 8).forEach((r, i) => {
      const us = r.id === 'us';
      sb.content.addChild(text(`${i + 1}. ${r.name}`, 0, y, { small: true, color: us ? PAL.gold : PAL.bone, width: 150, maxLines: 1 }));
      sb.content.addChild(text(r.sport, 152, y, { small: true, color: PAL.ash }));
      sb.content.addChild(box(Math.max(2, Math.round((180 * r.buys) / max)), 5, us ? PAL.gold : r.sport === 'MMA' ? PAL.steel : PAL.slate)).position.set(230, y);
      sb.content.addChild(text(compact(r.buys * 1000).replace(/K$/, 'K'), 414, y, { small: true, color: PAL.ash }));
      y += 8;
    });
    y += 6;
  }
  sb.content.addChild(text('Competitors: ' + content().competitors.map((c) => `${c.name} (${c.sport}) - ${c.blurb}`).join('  •  '), 0, y, { small: true, width: W - 64, color: PAL.grey }));
  win.body.addChild(sb);
  sb.refresh();
}
