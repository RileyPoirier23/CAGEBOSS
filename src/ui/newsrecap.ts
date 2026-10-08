/**
 * TV news recap after an event: "SportsCentral" with Stephen A. Shouty and
 * Michael Biscuit. Results board, Play of the Night replay, hot takes, the
 * ratings, and a headline crawl along the bottom.
 */
import { eventSponsors, eventCanvas } from '../sim/sponsorship';
import { Container, Graphics } from 'pixi.js';
import type { Game } from './app';
import type { Bout, EventFinancials, FightEvent, TickerLine } from '../core/types';
import { PAL } from '../art/palette';
import { W, H, text, box, button } from './kit';
import type { PixelText } from './text';
import { reporterPortrait } from './sprites';
import { ArenaView } from './arena';
import { content } from '../core/content';
import { Rng } from '../core/rng';
import { money } from '../core/format';
import { boutTitle, boutLabel } from '../sim/events';
import { quickOdds } from '../sim/fight';
import { expandPop } from '../sim/popculture';
import { sfx } from '../audio/sfx';

const SX = 16;
const SY = 8;
const SW = W - 32;
const SH = 222;

export class NewsRecap extends Container {
  private screen = new Container();
  private seg = new Container();
  private crawlText: PixelText;
  private crawlW = 0;
  private crawlX = 0;
  private replay: { arena: ArenaView; lines: TickerLine[]; i: number; t: number } | null = null;
  private segIdx = 0;
  private rng: Rng;
  private bubble: { node: PixelText; full: string; shown: number } | null = null;
  private speakerHi = new Graphics();

  constructor(
    private g: Game,
    private ev: FightEvent,
    private fin: EventFinancials,
    private onDone: () => void,
  ) {
    super();
    const s = g.state!;
    this.rng = new Rng((s.rng ^ 0x5c3a) >>> 0);
    // the TV set
    const tv = new Graphics();
    tv.rect(0, 0, W, H).fill(0x0c0a0e);
    tv.roundRect(SX - 8, SY - 6, SW + 16, SH + 12, 6).fill(0x1a1a1e).stroke({ color: 0x2c2c32, width: 2 });
    tv.rect(SX, SY, SW, SH).fill(0x0e1a34);
    // studio: gradient & light bars
    for (let y = 0; y < SH; y += 3) tv.rect(SX, SY + y, SW, 3).fill({ color: 0x1c3a6e, alpha: 0.5 * (1 - y / SH) });
    for (let i = 0; i < 6; i++) tv.rect(SX + 20 + i * 76, SY + 6, 40, 2).fill({ color: 0x8ab4ff, alpha: 0.35 });
    // anchor desk
    tv.poly([SX + 30, SY + 176, SX + SW - 30, SY + 176, SX + SW - 10, SY + 206, SX + 10, SY + 206]).fill(0x101826).stroke({ color: 0xc4a04a, width: 1 });
    this.addChild(tv);
    this.addChild(this.screen);
    // anchors
    const anchors = ['wspn_stephen', 'wspn_mike'].map((id) => content().reporters.find((r) => r.id === id)).filter(Boolean);
    anchors.forEach((a, i) => {
      const p = reporterPortrait(a!, 64);
      p.position.set(i === 0 ? SX + 34 : SX + SW - 98, SY + 116);
      this.screen.addChild(p);
      this.screen.addChild(text(a!.name.toUpperCase(), i === 0 ? SX + 30 : SX + SW - 104, SY + 182, { small: true, width: 72, align: 'center', color: PAL.gold }));
    });
    this.screen.addChild(this.speakerHi);
    // show bug & crawl bar
    const show = this.rng.pick(content().templates.recap?.show ?? ['SPORTSCENTRAL']);
    const bug = new Graphics().rect(SX + 6, SY + 6, 120, 12).fill(0xa01818);
    this.screen.addChild(bug);
    this.screen.addChild(text(show, SX + 9, SY + 9, { small: true, color: 0xffffff }));
    this.screen.addChild(new Graphics().rect(SX, SY + SH - 14, SW, 14).fill(0x0a0a10).rect(SX, SY + SH - 14, 40, 14).fill(0xa01818));
    this.screen.addChild(text('NEWS', SX + 6, SY + SH - 10, { small: true, color: 0xffffff }));
    const crawl = new Container();
    crawl.mask = new Graphics().rect(SX + 42, SY + SH - 14, SW - 44, 14).fill(0xffffff);
    this.screen.addChild(crawl.mask as Graphics);
    this.crawlText = text(this.crawlLine(), 0, SY + SH - 10, { small: true, color: PAL.bone });
    crawl.addChild(this.crawlText);
    this.screen.addChild(crawl);
    this.crawlW = this.crawlText.textWidth;
    this.crawlX = SX + SW;
    this.screen.addChild(this.seg);
    this.addChild(button('NEXT ▶', W - 76, H - 20, 64, 14, () => this.next(), { small: true, fill: PAL.steel }));
    this.addChild(button('SKIP NEWS', 12, H - 20, 64, 14, () => this.onDone(), { small: true }));
    this.showSegment();
  }

  private crawlLine(): string {
    const s = this.g.state!;
    const parts = this.ev.card.filter((b) => b.status === 'done' && b.result).sort((a, b) => a.position - b.position).map((b) => {
      const r = b.result!;
      const w = r.winner ? s.fighters[r.winner] : null;
      const l = r.loser ? s.fighters[r.loser] : null;
      return w && l ? `${w.last.toUpperCase()} def. ${l.last.toUpperCase()} (${r.method}${r.method === 'DEC' ? '' : ', R' + r.round})` : `${boutTitle(s, b).toUpperCase()}: ${r.method}`;
    });
    const extra = (content().templates.misc?.slowNews ?? []).slice();
    if (extra.length) parts.push(expandPop(this.rng.pick(extra)).toUpperCase());
    parts.push(`${this.ev.name.toUpperCase()}: ${this.fin.attendance.toLocaleString()} FANS, ${money(this.fin.gate)} GATE`);
    return parts.join('   •   ') + '   •   ';
  }

  private fill(t: string, b: Bout | null): string {
    const s = this.g.state!;
    const r = b?.result;
    const rival = s.market?.chart?.length ? s.market.chart[s.market.chart.length - 1].rows.find((x) => x.id !== 'us')?.name ?? 'the competition' : 'the competition';
    const v: Record<string, string> = {
      event: this.ev.name, venue: content().venues.find((x) => x.id === this.ev.venue)?.name ?? this.ev.venue,
      winner: r?.winner ? s.fighters[r.winner]?.last ?? '' : '', loser: r?.loser ? s.fighters[r.loser]?.last ?? '' : '',
      buys: this.fin.ppvBuys ? this.fin.ppvBuys.toLocaleString() : `${Math.round(this.fin.attendance * 14).toLocaleString()} viewers`,
      promotion: s.promotion.name, president: s.president.name.split(' ').slice(-1)[0], rival,
    };
    return expandPop(t.replace(/\{(\w+)\}/g, (m, k) => v[k] ?? m));
  }

  private talk(who: 0 | 1, line: string): void {
    const hi = this.speakerHi;
    hi.clear();
    const x = who === 0 ? SX + 32 : SX + SW - 100;
    hi.rect(x, SY + 114, 68, 68).stroke({ color: PAL.gold, width: 2 });
    const bx = who === 0 ? SX + 104 : SX + 18;
    const t = text('', bx + 6, SY + 128, { width: SW - 136, color: PAL.bone, maxLines: 4 });
    this.seg.addChild(new Graphics().roundRect(bx, SY + 122, SW - 122, 44, 4).fill({ color: 0x0a0a10, alpha: 0.85 }).stroke({ color: who === 0 ? 0xc85a5a : 0x6f9fd8, width: 1 }));
    this.seg.addChild(t);
    this.bubble = { node: t, full: line, shown: 0 };
  }

  private bestBout(): Bout | null {
    const done = this.ev.card.filter((b) => b.status === 'done' && b.result);
    if (!done.length) return null;
    const score = (b: Bout) => {
      const r = b.result!;
      return r.fotn + (['KO', 'TKO'].includes(r.method) ? 30 : r.method === 'SUB' ? 22 : 0) + (b.position === 0 ? 10 : 0) - r.round * 2;
    };
    return done.slice().sort((a, b) => score(b) - score(a))[0];
  }

  private showSegment(): void {
    const s = this.g.state!;
    const rc = content().templates.recap ?? {};
    const pick = (k: string, b: Bout | null) => this.fill(this.rng.pick(rc[k] ?? ['...']), b);
    this.seg.removeChildren().forEach((c) => c.destroy({ children: true }));
    if (this.replay) {
      this.replay.arena.destroy({ children: true });
      this.replay = null;
    }
    const main = this.ev.card.filter((b) => b.status === 'done' && b.result).sort((a, b) => a.position - b.position)[0] ?? null;
    switch (this.segIdx) {
      case 0: {
        this.seg.addChild(text(this.ev.name.toUpperCase(), SX, SY + 40, { width: SW, align: 'center', scale: 2, color: PAL.gold, shadow: PAL.ink }));
        this.seg.addChild(text('THE RESULTS • THE DRAMA • THE YELLING', SX, SY + 64, { width: SW, align: 'center', small: true, color: PAL.ash }));
        this.talk(0, pick('open', main));
        sfx('crowd');
        break;
      }
      case 1: {
        // results board
        const board = new Graphics().rect(SX + 70, SY + 24, SW - 140, 92).fill({ color: 0x0a0a10, alpha: 0.8 }).stroke({ color: PAL.gold, width: 1 });
        this.seg.addChild(board);
        this.seg.addChild(text('RESULTS', SX + 76, SY + 28, { small: true, color: PAL.gold }));
        const done = this.ev.card.filter((b) => b.status === 'done' && b.result).sort((a, b) => a.position - b.position).slice(0, 7);
        done.forEach((b, i) => {
          const r = b.result!;
          const w = r.winner ? s.fighters[r.winner] : null;
          const l = r.loser ? s.fighters[r.loser] : null;
          const line = w && l ? `${w.last} def. ${l.last}` : boutTitle(s, b);
          this.seg.addChild(text(line, SX + 76, SY + 38 + i * 11, { small: true, color: i === 0 ? PAL.bone : PAL.fog, width: 190, maxLines: 1 }));
          this.seg.addChild(text(`${r.method}${r.method === 'DEC' || r.method === 'DRAW' ? ` (${r.detail})` : ` R${r.round} ${r.time}`}${r.robbery ? ' ROBBERY?' : ''}`, SX + 270, SY + 38 + i * 11, { small: true, color: r.robbery ? PAL.blood : PAL.ash, width: SW - 350, maxLines: 1 }));
        });
        if (main?.result) {
          const r = main.result;
          const upset = r.winner && (r.winner === main.a ? 1 - quickOdds(s.fighters[main.a], s.fighters[main.b]) : quickOdds(s.fighters[main.a], s.fighters[main.b])) > 0.62;
          const k = r.robbery ? 'robbery_take' : main.title ? 'champ_take' : upset ? 'upset_take' : ['KO', 'TKO'].includes(r.method) ? 'ko_take' : r.method === 'SUB' ? 'sub_take' : 'dec_take';
          this.talk(0, pick(k, main));
        }
        break;
      }
      case 2: {
        const best = this.bestBout();
        if (best?.result) {
          const A = s.fighters[best.a];
          const B = s.fighters[best.b];
          this.seg.addChild(text('PLAY OF THE NIGHT', SX, SY + 22, { width: SW, align: 'center', color: PAL.gold }));
          this.seg.addChild(text(`${boutTitle(s, best)}  •  ${boutLabel(s, best)}`, SX, SY + 32, { width: SW, align: 'center', small: true, color: PAL.ash }));
          if (A && B) {
            const arena = new ArenaView(A, B, best.rounds, { event: this.ev.name, sponsors: eventSponsors(this.g.state!, this.ev), canvas: eventCanvas(this.g.state!, this.ev) });
            arena.scale.set(0.5);
            arena.position.set(Math.round(W / 2 - (480 * 0.5) / 2), SY + 42);
            const m = new Graphics().rect(arena.x, arena.y, 480 * 0.5, 150 * 0.5).fill(0xffffff);
            arena.mask = m;
            this.seg.addChild(m, arena);
            arena.setMode('tv');
            this.replay = { arena, lines: replayLines(best), i: 0, t: 0.6 };
          }
          const r = best.result;
          const k = ['KO', 'TKO'].includes(r.method) ? 'ko_take' : r.method === 'SUB' ? 'sub_take' : r.robbery ? 'robbery_take' : 'dec_take';
          this.talk(0, pick(k, best));
        } else this.talk(0, 'No play of the night. Nobody played. Everybody got paid. Disgusting.');
        break;
      }
      case 3: {
        this.seg.addChild(text('BY THE NUMBERS', SX, SY + 26, { width: SW, align: 'center', color: PAL.gold }));
        const rows = [
          ['ATTENDANCE', this.fin.attendance.toLocaleString()],
          ['GATE', money(this.fin.gate)],
          [this.fin.ppvBuys ? 'PPV BUYS' : 'TV VIEWERS', this.fin.ppvBuys ? this.fin.ppvBuys.toLocaleString() : Math.round(this.fin.attendance * 14).toLocaleString()],
          ['BONUSES PAID', money(this.fin.bonuses)],
        ];
        rows.forEach(([k, v], i) => {
          this.seg.addChild(text(k, SX + 120, SY + 42 + i * 14, { small: true, color: PAL.ash }));
          this.seg.addChild(text(v, SX + 230, SY + 40 + i * 14, { color: PAL.bone }));
        });
        const chart = s.market?.chart?.[s.market.chart.length - 1];
        const ourRank = chart ? chart.rows.findIndex((r) => r.id === 'us') : -1;
        this.talk(1, pick(ourRank === 0 ? 'ratings_good' : 'ratings_bad', main) + ' ' + pick('biscuit', main));
        break;
      }
      default: {
        this.seg.addChild(text('THANKS FOR WATCHING', SX, SY + 50, { width: SW, align: 'center', scale: 2, color: PAL.gold, shadow: PAL.ink }));
        this.talk(0, pick('signoff', main));
      }
    }
  }

  private next(): void {
    sfx('click');
    this.segIdx++;
    if (this.segIdx > 4) return this.onDone();
    this.showSegment();
  }

  update(dt: number): void {
    // crawl
    this.crawlX -= dt * 40;
    if (this.crawlX < SX + 42 - this.crawlW) this.crawlX = SX + SW;
    this.crawlText.x = Math.round(this.crawlX);
    // typewriter
    const b = this.bubble;
    if (b && !b.node.destroyed && b.shown < b.full.length) {
      b.shown = Math.min(b.full.length, b.shown + dt * 70);
      b.node.setText(b.full.slice(0, Math.floor(b.shown)));
    }
    // replay loop (slow motion)
    const rp = this.replay;
    if (rp && !rp.arena.destroyed) {
      rp.arena.update(dt * 0.7);
      rp.t -= dt;
      if (rp.t <= 0) {
        if (rp.i >= rp.lines.length) {
          rp.arena.destroy({ children: true });
          this.replay = null;
          this.segIdx--;
          this.next(); // restart the segment = loop the replay
          return;
        }
        rp.arena.cue(rp.lines[rp.i++]);
        rp.t = rp.i >= rp.lines.length ? 2.4 : 0.75;
      }
    }
  }
}

/** A short staged replay of how a bout ended, for the highlight package. */
function replayLines(b: Bout): TickerLine[] {
  const r = b.result!;
  const w: 0 | 1 = r.winner === b.b ? 1 : 0;
  const L = (act: string, side: 0 | 1 | -1, intensity: number, pos: TickerLine['pos'] = 'stand', hp: [number, number] = [70, 70]): TickerLine => ({ round: r.round, t: 200, text: '', side, intensity, act, pos, hp });
  const top: TickerLine['pos'] = w === 0 ? 'atop' : 'btop';
  switch (r.method) {
    case 'KO':
      return [L('jab', w, 1), L('punch', (1 - w) as 0 | 1, 1), L('legkick', w, 1), L('punch', w, 2), L('rocked', w, 2), L('ko', w, 3)];
    case 'TKO':
    case 'DOC':
      return [L('punch', w, 2), L('kd', w, 3), L('td', w, 2, top), L('gnp', w, 2, top), L('gnp', w, 2, top), L('tko', w, 3, top)];
    case 'SUB':
      return [L('jab', w, 1), L('td', w, 2, top), L('gnp', w, 1, top), L('sub', w, 2, top), L('tap', w, 3, top)];
    default:
      return [L('jab', w, 1), L('legkick', w, 1), L('punch', (1 - w) as 0 | 1, 1), L('kick', w, 2), L('td', w, 2, top), L('ctrl', w, 1, top)];
  }
}
