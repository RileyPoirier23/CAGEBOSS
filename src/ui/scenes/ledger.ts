/**
 * End of Week Ledger (and a mid-week peek): income/expense breakdown, the
 * President's personal page, meter changes, owner target progress.
 */
import { Container, Graphics } from 'pixi.js';
import { Scene, fullBg } from '../app';
import type { Game } from '../app';
import { PAL, meterColor, shade } from '../../art/palette';
import { W, H, text, button, box, paper } from '../kit';
import { openWindow } from '../widgets';
import { money, signed } from '../../core/format';
import { fmtDate } from '../../core/time';
import { endWeek, startWeek, type WeekReport } from '../../sim/week';
import { sumRecord } from '../../sim/econ';
import { METER_KEYS, type LedgerWeek } from '../../core/types';
import { routePhase } from '../flow';
import { sfx } from '../../audio/sfx';
import { content } from '../../core/content';

function page(title: string, rows: Record<string, number>, w: number, color: number): Container {
  const c = new Container();
  c.addChild(text(title, 0, 0, { color: PAL.blood }));
  let y = 12;
  const entries = Object.entries(rows).filter(([, v]) => Math.round(v) !== 0).sort((a, b) => Math.abs(b[1]) - Math.abs(a[1]));
  for (const [k, v] of entries.slice(0, 13)) {
    c.addChild(text(k, 0, y, { small: true, color: PAL.ink, width: w - 60 }));
    c.addChild(text(money(v, false), w - 64, y, { small: true, color, width: 60, align: 'right' }));
    y += 8;
  }
  if (!entries.length) c.addChild(text('(nothing)', 0, y, { small: true, color: PAL.grey }));
  c.addChild(new Graphics().rect(0, Math.max(y, 22) + 2, w - 4, 1).fill(PAL.ink));
  c.addChild(text('TOTAL', 0, Math.max(y, 22) + 5, { small: true, color: PAL.ink }));
  c.addChild(text(money(sumRecord(rows), false), w - 64, Math.max(y, 22) + 5, { small: true, color, width: 60, align: 'right' }));
  return c;
}

export function drawLedgerBook(g: Game, l: LedgerWeek, prev: LedgerWeek | null, x: number, y: number): Container {
  const s = g.state!;
  const c = new Container();
  c.position.set(x, y);
  c.addChild(box(396, 190, PAL.woodDark, PAL.ink, { shadow: true }));
  c.addChild(paper(192, 182, 'cream', 21)).position.set(4, 4);
  c.addChild(paper(192, 182, 'cream', 22)).position.set(200, 4);
  c.addChild(new Graphics().rect(197, 4, 2, 182).fill(shade(PAL.woodDark, -0.3)));
  const left = page('INCOME', l.income, 184, PAL.moss);
  left.position.set(10, 8);
  c.addChild(left);
  const right = page('EXPENSES', l.expenses, 184, PAL.blood);
  right.position.set(206, 8);
  c.addChild(right);
  const net = sumRecord(l.income) - sumRecord(l.expenses);
  c.addChild(text(`NET THIS WEEK: ${net >= 0 ? '+' : ''}${money(net, false)}`, 10, 138, { color: net >= 0 ? PAL.moss : PAL.blood }));
  c.addChild(text(`CASH ${money(l.cash)}   VALUATION ${money(l.valuation)}`, 10, 150, { small: true, color: PAL.ink }));
  c.addChild(text(`OWNER Q-TARGET ${money(s.owner.target)}  SO FAR ${money(s.owner.revenueQ)}`, 10, 159, { small: true, color: s.owner.revenueQ >= s.owner.target ? PAL.moss : PAL.ember }));
  // personal page
  c.addChild(text('PERSONAL', 206, 120, { small: true, color: PAL.plum }));
  let py = 128;
  for (const [k, v] of Object.entries(l.personal).slice(0, 5)) {
    c.addChild(text(`${k}: ${money(v)}`, 206, py, { small: true, color: v < 0 ? PAL.blood : PAL.ink }));
    py += 7;
  }
  c.addChild(text(`YOUR WEALTH ${money(l.wealth)}`, 206, 168, { small: true, color: PAL.ink }));
  // meters
  METER_KEYS.forEach((k, i) => {
    const v = l.meters[k];
    const d = prev ? v - prev.meters[k] : 0;
    const mx = 10 + i * 31;
    c.addChild(text(k.slice(0, 4).toUpperCase(), mx, 172, { small: true, color: PAL.ink }));
    c.addChild(box(28, 4, PAL.ink)).position.set(mx, 179);
    c.addChild(box(Math.max(1, Math.round((26 * v) / 100)), 2, meterColor(v))).position.set(mx + 1, 180);
    if (Math.abs(d) >= 0.5) c.addChild(text(signed(d), mx + 20, 172, { small: true, color: d > 0 ? PAL.moss : PAL.blood }));
  });
  return c;
}

export class LedgerScene extends Scene {
  private report: WeekReport | null = null;
  private quip = '';

  enter(): void {
    const s = this.g.state!;
    if (s.phase === 'ledger') {
      this.report = endWeek(s);
      if (!s.ending) startWeek(s);
      this.g.autosave();
      const q = content().templates.ledgerQuips;
      if (q.length) this.quip = q[s.week % q.length];
      sfx('cash');
    }
    super.enter();
  }

  build(): void {
    const s = this.g.state!;
    const r = this.root;
    r.addChild(fullBg(0x241b16));
    const l = s.ledger[s.ledger.length - 1];
    const prev = s.ledger[s.ledger.length - 2] ?? null;
    r.addChild(text(`END OF WEEK LEDGER  •  ${l ? fmtDate(l.week) : ''}`, 8, 6, { color: PAL.gold }));
    if (l) r.addChild(drawLedgerBook(this.g, l, prev, 8, 18));
    const side = new Container();
    side.position.set(410, 18);
    side.addChild(text('THIS WEEK', 0, 0, { small: true, color: PAL.gold }));
    let y = 10;
    const notes = this.report?.notes ?? [];
    for (const n of notes.slice(0, 12)) {
      const t = text('• ' + n, 0, y, { small: true, width: 66, color: PAL.bone });
      side.addChild(t);
      y += t.textHeight + 3;
    }
    if (!notes.length) side.addChild(text('Quiet week. Enjoy it.', 0, y, { small: true, width: 66, color: PAL.ash }));
    r.addChild(side);
    if (this.quip) r.addChild(text(this.quip, 8, 212, { small: true, width: 396, color: PAL.ash }));
    const actLine = this.report?.act ? `ACT ${this.report.act} BEGINS: ${content().acts.find((a) => a.act === this.report!.act)?.name ?? ''}` : '';
    if (actLine) r.addChild(text(actLine, 8, 226, { color: PAL.gold }));
    r.addChild(button(s.ending ? 'SEE HOW IT ENDS →' : 'NEXT WEEK →', W - 120, H - 26, 110, 18, () => routePhase(this.g), { fill: PAL.blood }));
  }

  onKey(e: KeyboardEvent): boolean {
    if (e.key === 'Enter') {
      routePhase(this.g);
      return true;
    }
    return false;
  }
}

export function openLedgerPeek(g: Game): void {
  const s = g.state!;
  const win = openWindow(g, 'Ledger (this week so far)', 420, 230);
  const cur: LedgerWeek = {
    week: s.week, income: s.current.income, expenses: s.current.expenses, personal: s.current.personal, cash: s.promotion.cash,
    wealth: s.president.wealth, valuation: s.promotion.valuation, meters: s.meters,
  };
  win.body.addChild(drawLedgerBook(g, cur, s.ledger[s.ledger.length - 1] ?? null, 8, 2));
  // cash history sparkline
  const hist = s.ledger.slice(-52);
  if (hist.length > 1) {
    const g2 = new Graphics();
    const max = Math.max(...hist.map((h) => h.cash));
    const min = Math.min(0, ...hist.map((h) => h.cash));
    hist.forEach((h, i) => {
      const x = 8 + (i * 396) / 52;
      const y = 206 - ((h.cash - min) / Math.max(1, max - min)) * 12;
      if (i === 0) g2.moveTo(x, y);
      else g2.lineTo(x, y);
    });
    g2.stroke({ color: PAL.gold, width: 1 });
    win.body.addChild(g2);
  }
}
