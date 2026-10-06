/**
 * The President's desk: the core of the game.
 *
 *  - Top: office window (visitors stand there), wall clock, calendar, nav.
 *  - Left: manila file card for the current document's subject + desk props
 *          (rulebook, phone, cash box).
 *  - Centre: the active document.
 *  - Right: the inbox queue (documents, calls, visitors, negotiations, offers)
 *          and the stamp rack.
 *  - INSPECT mode: click two fields to compare them (Papers, Please-style).
 */
import { Container, Graphics } from 'pixi.js';
import { Scene } from '../app';
import { PAL, C, shade, meterColor } from '../../art/palette';
import { W, H, text, button, box, clickable, ScrollBox, hoverTip, paper } from '../kit';
import type { DeskDoc, Stamp, StoryletInstance, Negotiation } from '../../core/types';
import { Inspector, renderDoc, renderFileCard, ruleField, PAGE_RULE_KEYS } from '../docview';
import { stampDoc, compareFields, spendMinutes } from '../../sim/week';
import { fmtClock, fmtDate, DAY_MINUTES, fmtFightDate } from '../../core/time';
import { money } from '../../core/format';
import { rulebookPages } from '../../sim/rules';
import { def } from '../../storylets/engine';
import { playStorylet } from '../dialog';
import { fighterPortrait, reporterPortrait, npcPortrait } from '../sprites';
import { content } from '../../core/content';
import { sfx } from '../../audio/sfx';
import { eventThisWeek, upcomingEvents } from '../../sim/events';
import { routePhase } from '../flow';
import { confirm } from '../widgets';
import { openBailOffice } from './bailoffice';
import { openNegotiation } from './negotiation';
import { openRoster } from './roster';
import { openCorkboard } from './corkboard';
import { openRankings } from './rankings';
import { openInbox, openTvOffer } from './inbox';
import { openGameMenu } from './gamemenu';
import { openLedgerPeek } from './ledger';
import { Rng } from '../../core/rng';
import { METER_KEYS } from '../../core/types';
import { openChart } from './chart';

type QueueItem =
  | { kind: 'doc'; id: string; doc: DeskDoc }
  | { kind: 'story'; id: string; inst: StoryletInstance }
  | { kind: 'neg'; id: string; neg: Negotiation }
  | { kind: 'tv'; id: string; network: string };

const STAMP_FILL: Record<Stamp, () => number> = {
  approve: () => C.approve,
  deny: () => C.deny,
  escalate: () => C.escalate,
  bury: () => C.bury,
};

export class DeskScene extends Scene {
  private ins = new Inspector();
  private selected: string | null = null;
  private rulebookOpen = false;
  private rulePage = 0;
  private message: { text: string; color: number; t: number } | null = null;
  private stringLayer = new Graphics();
  private clockText: ReturnType<typeof text> | null = null;
  private clockHand = new Graphics();
  private stampFx: { node: Container; t: number } | null = null;
  private lastFound: [string, string] | null = null;
  private dayOverShown = false;
  private queueScroll = 0;

  build(): void {
    const s = this.g.state!;
    const r = this.root;
    this.stringLayer = new Graphics();
    this.clockHand = new Graphics();
    this.ins.clear();
    this.ins.onCompare = (a, b) => this.compare(a, b);
    this.ins.onChange = () => this.drawStrings();

    // ---------------------------------------------------------- office wall
    const wall = new Graphics();
    wall.rect(0, 0, W, 80).fill(0x3a3036);
    for (let x = 0; x < W; x += 16) wall.rect(x, 0, 1, 80).fill(0x342b31);
    wall.rect(0, 76, W, 4).fill(0x241d22);
    r.addChild(wall);
    // window / doorway where visitors stand
    const win = new Graphics();
    win.rect(6, 4, 190, 70).fill(0x1d2430);
    win.rect(6, 4, 190, 70).stroke({ color: 0x6b5a4a, width: 2, alignment: 1 });
    win.rect(100, 4, 2, 70).fill(0x6b5a4a);
    // city lights in the window
    for (let i = 0; i < 30; i++) win.rect(8 + ((i * 37) % 186), 40 + ((i * 13) % 30), 2, 2).fill(i % 3 ? 0x4a5a6a : 0x8a7a4a);
    r.addChild(win);
    this.drawVisitor(r);

    // clock
    const clock = new Graphics();
    clock.circle(222, 22, 15).fill(PAL.bone).stroke({ color: PAL.ink, width: 2 });
    r.addChild(clock);
    r.addChild(this.clockHand);
    this.clockText = text(fmtClock(s.desk.minutes), 204, 42, { small: true, color: PAL.bone });
    r.addChild(this.clockText);
    // calendar + cash
    const cal = paper(70, 34, 'white', 2);
    cal.position.set(246, 6);
    r.addChild(cal);
    r.addChild(text(fmtDate(s.week).split(',')[0], 250, 9, { color: PAL.blood }));
    r.addChild(text(`WEEK ${s.week + 1} / ACT ${s.act}`, 250, 20, { small: true, color: PAL.ink }));
    const ev = eventThisWeek(s);
    const nextEv = upcomingEvents(s)[0];
    r.addChild(text(ev ? 'FIGHT WEEK!' : nextEv ? `Next: ${fmtFightDate(nextEv.week)}` : 'No events', 250, 29, { small: true, color: ev ? PAL.blood : PAL.slate }));
    const cash = clickable(new Container(), () => openLedgerPeek(this.g), 'Ledger');
    cash.addChild(box(70, 34, PAL.ink, PAL.gold));
    cash.addChild(text('CASH', 4, 3, { small: true, color: PAL.gold }));
    cash.addChild(text(money(s.promotion.cash), 4, 12, { color: s.promotion.cash < 0 ? PAL.blood : PAL.bone }));
    cash.addChild(text('YOU: ' + money(s.president.wealth), 4, 24, { small: true, color: PAL.ash }));
    cash.position.set(320, 6);
    r.addChild(cash);
    // meters strip
    const ms = new Container();
    ms.position.set(320, 44);
    METER_KEYS.forEach((k, i) => {
      const x = (i % 3) * 24;
      const y = Math.floor(i / 3) * 14;
      const v = s.meters[k];
      const m = new Container();
      m.addChild(text(k.slice(0, 3).toUpperCase(), 0, 0, { small: true, color: PAL.ash }));
      m.addChild(box(22, 4, PAL.ink)).position.set(0, 7);
      m.addChild(box(Math.max(1, Math.round((20 * v) / 100)), 2, meterColor(v))).position.set(1, 8);
      m.position.set(x, y);
      hoverTip(m, `${k.toUpperCase()}: ${Math.round(v)}/100`);
      ms.addChild(m);
    });
    r.addChild(ms);
    // nav
    const nav: [string, () => void, string][] = [
      ['ROSTER', () => openRoster(this.g, () => this.refresh()), 'Filing cabinet: fighter dossiers, scouting, free agents'],
      ['CARDS', () => openCorkboard(this.g, () => this.refresh()), 'Matchmaking corkboard'],
      ['RANKS', () => openRankings(this.g), 'Rankings wall & belts'],
      ['RATINGS', () => openChart(this.g), 'PPV & TV ratings vs other combat sports'],
      ['INBOX', () => openInbox(this.g, () => this.refresh()), 'Messages, offers, citations'],
      ['MENU', () => openGameMenu(this.g, () => this.refresh()), 'Save / load / settings'],
    ];
    nav.forEach(([label, fn, tip], i) => r.addChild(button(label, 396 + (i % 2) * 42, 4 + Math.floor(i / 2) * 15, 40, 13, fn, { small: true, fill: PAL.shadow, tooltip: tip })));
    const unread = s.inbox.filter((m) => !m.read).length + s.market.tvOffers.length;
    if (unread) r.addChild(text(String(unread), 474, 34, { small: true, color: PAL.gold }));
    r.addChild(button(ev ? 'END DAY → FIGHT NIGHT' : 'END DAY →', 396, 50, 82, 22, () => this.endDay(), { fill: PAL.blood, small: true }));

    // ---------------------------------------------------------- desk surface
    const desk = new Graphics();
    desk.rect(0, 80, W, H - 80).fill(PAL.wood);
    for (let y = 82; y < H; y += 5) desk.rect(0, y, W, 1).fill(shade(PAL.wood, (y % 15) / 150 - 0.04));
    r.addChild(desk);

    const item = this.currentItem();
    const doc = item?.kind === 'doc' ? item.doc : null;

    // file card (left)
    const fc = renderFileCard(doc, 114, this.ins);
    fc.position.set(4, 84);
    r.addChild(fc);
    // desk props under the file card
    const props = new Container();
    props.position.set(4, 228);
    const rb = clickable(new Container(), () => {
      this.rulebookOpen = !this.rulebookOpen;
      sfx('paper');
      this.refresh();
    }, 'Rulebook (R)');
    rb.addChild(box(40, 36, 0x2d3a52, PAL.ink, { bevel: true }));
    rb.addChild(text('RULE\nBOOK', 6, 8, { small: true, color: PAL.gold }));
    props.addChild(rb);
    const phone = new Container();
    phone.addChild(box(36, 22, 0x2b2b2b, PAL.ink, { bevel: true }));
    phone.addChild(box(28, 6, 0x1a1a1a)).position.set(4, 2);
    const ringing = s.storylets.pending.some((p) => def(p.id)?.scenes[0]?.type === 'phone');
    phone.addChild(text(ringing ? 'RING!' : 'PHONE', 4, 12, { small: true, color: ringing ? PAL.blood : PAL.ash }));
    phone.position.set(44, 14);
    props.addChild(phone);
    hoverTip(phone, ringing ? 'Someone is calling. Pick it up from the inbox.' : 'Nobody is calling. Enjoy it.');
    const insBtn = button(this.ins.active ? 'INSPECTING' : 'INSPECT (I)', 44, 0, 70, 12, () => this.toggleInspect(), {
      small: true, fill: this.ins.active ? PAL.gold : PAL.shadow, textColor: this.ins.active ? PAL.ink : PAL.bone,
      tooltip: 'Inspect mode: click two fields (document, file card or rulebook) to compare them.',
    });
    props.addChild(insBtn);
    r.addChild(props);

    // centre: document / item
    const centre = new Container();
    centre.position.set(122, 84);
    r.addChild(centre);
    if (item?.kind === 'doc') {
      const dv = renderDoc(item.doc, 240, this.ins, s.week);
      centre.addChild(dv);
      if (dv.height > 182) {
        const sc = Math.max(0.6, 182 / dv.height);
        dv.scale.set(1);
        // too tall: allow scrolling via a scroll box
        centre.removeChild(dv);
        const sb = new ScrollBox(244, 182);
        sb.content.addChild(dv);
        centre.addChild(sb);
        sb.refresh();
        void sc;
      }
    } else if (item) {
      centre.addChild(this.itemCard(item));
    } else {
      const empty = paper(240, 120, 'white', 9);
      empty.addChild(text('INBOX ZERO.\n\nNo paperwork, no calls, no problems.\n(That never lasts.)\n\nBuild cards on the corkboard, scout fighters in the filing cabinet, or end the day.', 8, 10, { width: 224, color: PAL.ink }));
      centre.addChild(empty);
    }

    // rulebook overlay
    if (this.rulebookOpen) r.addChild(this.drawRulebook());

    // right: queue + stamps
    r.addChild(this.drawQueue());
    if (item?.kind === 'doc') r.addChild(this.drawStamps(item.doc));

    // message bar
    if (this.message) {
      const m = new Container();
      const t = text(this.message.text, 4, 3, { width: 236, color: this.message.color });
      m.addChild(box(244, t.textHeight + 7, PAL.ink, this.message.color));
      m.addChild(t);
      m.position.set(120, H - t.textHeight - 9);
      r.addChild(m);
    }
    r.addChild(this.stringLayer);
    this.drawStrings();
    this.updateClock();
  }

  private drawVisitor(r: Container): void {
    const s = this.g.state!;
    const item = this.currentItem();
    let por: Container | null = null;
    let caption = '';
    if (item?.kind === 'doc' && item.doc.subject && s.fighters[item.doc.subject]) {
      const f = s.fighters[item.doc.subject];
      por = fighterPortrait(f, 64, item.doc.type === 'bail' ? 'mugshot' : 'plain');
      caption = `${f.first} ${f.last}`;
    } else if (item?.kind === 'doc' && item.doc.type === 'press' && item.doc.meta.reporter) {
      const rep = content().reporters.find((x) => x.id === item.doc.meta.reporter);
      if (rep) {
        por = reporterPortrait(rep, 64);
        caption = 'Someone with a lanyard';
      }
    } else if (item?.kind === 'story') {
      const d = def(item.inst.id);
      const sc = d?.scenes[0];
      if (sc && sc.type === 'visit') {
        const role = sc.portrait ?? Object.keys(d!.roles ?? {})[0];
        const id = role ? item.inst.roles[role] : undefined;
        if (id && s.fighters[id]) por = fighterPortrait(s.fighters[id], 64);
        else if (id) {
          const rep = content().reporters.find((x) => x.id === id);
          if (rep) por = reporterPortrait(rep, 64);
        }
        if (!por) por = npcPortrait(item.inst.id, 'manager', 64);
        caption = 'Waiting at your door';
      }
    } else if (item?.kind === 'neg') {
      const f = s.fighters[item.neg.fighter];
      if (f) {
        por = fighterPortrait(f, 64);
        caption = 'Here to talk money';
      }
    }
    if (por) {
      por.position.set(70, 8);
      r.addChild(por);
      r.addChild(text(caption, 8, 66, { small: true, color: PAL.bone }));
    } else {
      r.addChild(text('(the hallway is mercifully empty)', 10, 34, { small: true, color: PAL.grey }));
    }
  }

  private items(): QueueItem[] {
    const s = this.g.state!;
    const out: QueueItem[] = [];
    for (const inst of s.storylets.pending) out.push({ kind: 'story', id: inst.iid, inst });
    for (const d of s.desk.queue) out.push({ kind: 'doc', id: d.id, doc: d });
    for (const n of s.negotiations) out.push({ kind: 'neg', id: n.id, neg: n });
    for (const o of s.market.tvOffers) out.push({ kind: 'tv', id: 'tv:' + o.network, network: o.network });
    return out;
  }

  private currentItem(): QueueItem | null {
    const items = this.items();
    if (!items.length) return null;
    const hit = items.find((i) => i.id === this.selected);
    if (hit) return hit;
    // prefer documents for the centre view
    const doc = items.find((i) => i.kind === 'doc' && i.doc.type !== 'bail');
    const first = doc ?? items[0];
    this.selected = first.id;
    return first;
  }

  private drawQueue(): Container {
    const s = this.g.state!;
    const c = new Container();
    c.position.set(366, 84);
    const items = this.items();
    c.addChild(box(110, 108, 0x2a1f18, PAL.woodDark));
    c.addChild(text(`INBOX (${items.length})`, 4, 3, { small: true, color: PAL.gold }));
    const sb = new ScrollBox(106, 92);
    sb.position.set(2, 12);
    items.forEach((it, i) => {
      const label = this.itemLabel(it);
      const sel = it.id === this.selected;
      const row = clickable(new Container(), () => this.selectItem(it));
      row.addChild(box(100, 12, sel ? PAL.slate : shade(0x2a1f18, 0.08)));
      row.addChild(box(3, 12, label.color));
      row.addChild(text(label.text, 6, 3, { small: true, color: PAL.bone, width: 92, maxLines: 1 }));
      row.position.set(0, i * 13);
      sb.content.addChild(row);
    });
    c.addChild(sb);
    sb.scrollTo(this.queueScroll);
    void s;
    return c;
  }

  private itemLabel(it: QueueItem): { text: string; color: number } {
    const s = this.g.state!;
    switch (it.kind) {
      case 'doc': {
        const subj = it.doc.subject ? s.fighters[it.doc.subject]?.last ?? '' : '';
        const name = { bout: 'Bout agmt', medical: 'Medical', drug: 'Drug test', visa: 'Visa', weighin: 'Weigh-in', sponsor: 'Sponsor', police: 'Court', expense: 'Expenses', press: 'Press cred', memo: 'MEMO', letter: 'Letter', bail: 'BAIL!' }[it.doc.type];
        return { text: `${it.doc.overdue ? '! ' : ''}${name} ${subj}`, color: it.doc.type === 'bail' ? PAL.blood : it.doc.type === 'memo' ? PAL.ash : PAL.paper };
      }
      case 'story': {
        const d = def(it.inst.id);
        const t = d?.scenes[0]?.type ?? 'visit';
        const icon = t === 'phone' ? '☎' : t === 'visit' ? 'DOOR:' : t === 'memo' ? 'MEMO:' : '';
        return { text: `${icon === '☎' ? 'CALL:' : icon} ${d?.title ?? it.inst.id}`, color: t === 'phone' ? PAL.ember : PAL.gold };
      }
      case 'neg':
        return { text: `$$ ${s.fighters[it.neg.fighter]?.last ?? '?'} (${it.neg.kind})`, color: PAL.moss };
      case 'tv':
        return { text: `TV OFFER: ${content().networks.find((n) => n.id === it.network)?.name ?? it.network}`, color: PAL.sky };
    }
  }

  private selectItem(it: QueueItem): void {
    this.selected = it.id;
    this.ins.selected = null;
    this.lastFound = null;
    sfx('paper');
    if (it.kind === 'story') {
      spendMinutes(this.g.state!, 20);
      playStorylet(this.g, it.inst, (res) => {
        if (res) this.flash(res, PAL.bone);
        this.selected = null;
        this.g.autosave();
        this.refresh();
      });
      return;
    }
    if (it.kind === 'doc' && it.doc.type === 'bail') {
      openBailOffice(this.g, it.doc, () => {
        this.selected = null;
        this.refresh();
      });
      return;
    }
    if (it.kind === 'neg') {
      openNegotiation(this.g, it.neg.id, () => {
        this.selected = null;
        this.refresh();
      });
      return;
    }
    if (it.kind === 'tv') {
      openTvOffer(this.g, it.network, () => {
        this.selected = null;
        this.refresh();
      });
      return;
    }
    spendMinutes(this.g.state!, 2);
    this.refresh();
  }

  private itemCard(it: QueueItem): Container {
    const c = paper(240, 80, 'white', 4);
    c.addChild(text(this.itemLabel(it).text, 8, 8, { width: 224, color: PAL.ink }));
    c.addChild(text('Click it in the inbox to deal with it.', 8, 30, { small: true, color: PAL.grey }));
    return c;
  }

  private drawStamps(d: DeskDoc): Container {
    const c = new Container();
    c.position.set(366, 196);
    c.addChild(box(110, 70, 0x2a1f18, PAL.woodDark));
    const stamps: [Stamp, string, string][] = [
      ['approve', 'APPROVE', 'A'],
      ['deny', 'DENY', 'D'],
      ['escalate', 'ESCALATE', 'E'],
      ['bury', 'BURY', 'B'],
    ];
    const labels = d.type === 'weighin'
      ? { approve: 'FIGHT AS IS', deny: 'CANCEL BOUT', escalate: 'CATCHWEIGHT', bury: '"SCALE BROKE"' }
      : d.type === 'police'
        ? { approve: 'KEEP ON CARD', deny: 'PULL FROM CARD', escalate: 'ESCALATE', bury: 'BURY' }
        : d.type === 'memo'
          ? { approve: 'FILE IT', deny: 'SHRED', escalate: 'FWD LEGAL', bury: 'BURY' }
          : null;
    stamps.forEach(([st, label, key], i) => {
      const b = button(`${labels ? labels[st] : label} (${key})`, 4, 4 + i * 16, 102, 14, () => this.stamp(st), {
        fill: STAMP_FILL[st](),
        small: true,
        tooltip: {
          approve: 'Accept the document as valid.',
          deny: 'Reject it. Correct if you found a discrepancy.',
          escalate: 'Send to legal: always "safe" but costs a fee and time, and the board hates overuse.',
          bury: 'Make it disappear. Deliberate. Tracked. It may resurface.',
        }[st],
      });
      c.addChild(b);
    });
    return c;
  }

  private drawRulebook(): Container {
    const s = this.g.state!;
    const pages = rulebookPages(s);
    const c = new Container();
    c.position.set(10, 84);
    const bw = 354;
    const bh = 182;
    c.addChild(box(bw, bh, 0x2d3a52, PAL.ink, { shadow: true }));
    c.addChild(paper(bw - 8, bh - 22, 'white', 5)).position.set(4, 18);
    c.addChild(text('THE RULEBOOK', 6, 4, { color: PAL.gold }));
    c.addChild(button('X', bw - 14, 3, 11, 11, () => {
      this.rulebookOpen = false;
      this.refresh();
    }, { small: true, fill: PAL.blood }));
    // tabs
    pages.forEach((p, i) => {
      const t = button(p.page.split(' ')[0].toUpperCase(), 80 + i * 34, 4, 33, 11, () => {
        this.rulePage = i;
        this.refresh();
      }, { small: true, fill: i === this.rulePage ? PAL.gold : PAL.slate, textColor: i === this.rulePage ? PAL.ink : PAL.bone });
      c.addChild(t);
    });
    const page = pages[Math.min(this.rulePage, pages.length - 1)];
    if (!page) return c;
    const sb = new ScrollBox(bw - 12, bh - 28);
    sb.position.set(8, 22);
    let y = 0;
    for (const rule of page.rules) {
      const t = text(rule.title.toUpperCase(), 0, y, { color: PAL.blood, small: true });
      sb.content.addChild(t);
      y += 8;
      const body = text(rule.text, 0, y, { width: bw - 24, color: PAL.ink, small: true });
      sb.content.addChild(body);
      y += body.textHeight + 5;
    }
    const item = this.currentItem();
    const refs = item?.kind === 'doc' ? item.doc.refs : {};
    for (const key of PAGE_RULE_KEYS[page.page] ?? []) {
      const val = refs[key] ?? '(open a document to cross-reference)';
      const { node, h } = ruleField(key, val, bw - 24, refs[key] ? this.ins : null);
      node.y = y;
      sb.content.addChild(node);
      y += h + 3;
    }
    c.addChild(sb);
    sb.refresh();
    return c;
  }

  private toggleInspect(): void {
    this.ins.active = !this.ins.active;
    this.ins.selected = null;
    sfx('click');
    this.refresh();
  }

  private compare(a: string, b: string): void {
    const s = this.g.state!;
    const item = this.currentItem();
    if (item?.kind !== 'doc') return;
    const r = compareFields(s, item.doc.id, a, b);
    if (r.found) {
      sfx('bad');
      this.lastFound = [a, b];
      this.flash('DISCREPANCY: ' + r.text, PAL.blood);
      this.g.shake(1, 0.15);
    } else {
      sfx('click');
      this.lastFound = null;
      this.flash('No discrepancy.', PAL.ash);
    }
    this.refresh();
  }

  private drawStrings(): void {
    const g = this.stringLayer;
    g.clear();
    if (!this.ins.active) return;
    // highlight hovered/selected field
    if (this.ins.selected) {
      const sp = this.ins.spots.get(this.ins.selected);
      if (sp && !sp.node.destroyed) {
        const p = sp.node.getGlobalPosition();
        g.rect(p.x - 1, p.y - 1, sp.w + 2, sp.h + 2).stroke({ color: PAL.gold, width: 1 });
      }
    }
    // outline all inspectable fields faintly
    for (const sp of this.ins.spots.values()) {
      if (sp.node.destroyed) continue;
      const p = sp.node.getGlobalPosition();
      g.rect(p.x, p.y, sp.w, sp.h).stroke({ color: PAL.gold, width: 1, alpha: 0.25 });
    }
    if (this.lastFound) {
      const a = this.ins.center(this.lastFound[0]);
      const b = this.ins.center(this.lastFound[1]);
      if (a && b) {
        g.moveTo(a.x, a.y).lineTo(b.x, b.y).stroke({ color: PAL.blood, width: 2 });
        for (const k of this.lastFound) {
          const sp = this.ins.spots.get(k)!;
          const p = sp.node.getGlobalPosition();
          g.rect(p.x - 1, p.y - 1, sp.w + 2, sp.h + 2).stroke({ color: PAL.blood, width: 1 });
        }
      }
    }
  }

  private stamp(st: Stamp): void {
    const s = this.g.state!;
    const item = this.currentItem();
    if (item?.kind !== 'doc') return;
    if (item.doc.type === 'bail') return this.selectItem(item);
    const rng = new Rng(s.rng);
    const res = stampDoc(s, item.doc.id, st, rng);
    s.rng = rng.state;
    sfx('stamp');
    this.g.shake(2, 0.12);
    // stamp graphic
    const fx = new Container();
    const label = { approve: 'APPROVED', deny: 'DENIED', escalate: 'ESCALATED', bury: 'BURIED' }[st];
    const col = STAMP_FILL[st]();
    const t = text(label, 6, 5, { scale: 2, color: col });
    fx.addChild(new Graphics().rect(0, 0, t.textWidth + 12, 24).stroke({ color: col, width: 2 }));
    fx.addChild(t);
    fx.pivot.set((t.textWidth + 12) / 2, 12);
    fx.position.set(242, 150);
    fx.rotation = -0.2;
    this.stampFx = { node: fx, t: 0.7 };
    if (res.citation) {
      sfx('citation');
      const cit = s.desk.citations[s.desk.citations.length - 1];
      this.flash(`CITATION${cit?.warning ? ' (WARNING)' : ` -${money(cit?.fine ?? 0)}`}: ${res.citation}`, PAL.blood);
    } else this.flash(res.text || label, res.correct ? PAL.bone : PAL.ember);
    this.selected = null;
    this.lastFound = null;
    this.ins.selected = null;
    this.refresh();
    this.root.addChild(fx);
  }

  private flash(msg: string, color: number): void {
    this.message = { text: msg, color, t: 5 };
  }

  private endDay(): void {
    const s = this.g.state!;
    const left = s.desk.queue.filter((d) => d.type !== 'memo').length + s.storylets.pending.length;
    const go = () => {
      const ev = eventThisWeek(s);
      s.phase = ev ? 'fightnight' : 'ledger';
      this.g.autosave();
      routePhase(this.g);
    };
    if (left > 0) confirm(this.g, `${left} item(s) still on your desk. Unprocessed paperwork rolls over (and can cause problems). Calls & visitors get a default response. End the day anyway?`, go, 'END DAY', 'KEEP WORKING');
    else go();
  }

  private updateClock(): void {
    const s = this.g.state!;
    const m = s.desk.minutes;
    this.clockText?.setText(fmtClock(m));
    this.clockText?.setColor(m > DAY_MINUTES - 60 ? PAL.blood : PAL.bone);
    const g = this.clockHand;
    g.clear();
    const hours = (9 + m / 60) % 12;
    const ha = (hours / 12) * Math.PI * 2 - Math.PI / 2;
    const ma = ((m % 60) / 60) * Math.PI * 2 - Math.PI / 2;
    g.moveTo(222, 22).lineTo(222 + Math.cos(ha) * 7, 22 + Math.sin(ha) * 7).stroke({ color: PAL.ink, width: 2 });
    g.moveTo(222, 22).lineTo(222 + Math.cos(ma) * 11, 22 + Math.sin(ma) * 11).stroke({ color: PAL.blood, width: 1 });
  }

  update(dt: number): void {
    const s = this.g.state;
    if (!s) return;
    if (!this.g.modals.length && !this.rulebookOpen) {
      s.desk.minutes += dt * 1.5 * (this.g.settings.clockSpeed || 1);
      if (s.desk.minutes >= DAY_MINUTES && !this.dayOverShown) {
        this.dayOverShown = true;
        sfx('bell');
        this.flash('6:00 PM. The day is over. Whatever is left rolls over.', PAL.gold);
        const ev = eventThisWeek(s);
        setTimeout(() => {
          if (this.g.scene !== this) return;
          s.phase = ev ? 'fightnight' : 'ledger';
          this.g.autosave();
          routePhase(this.g);
        }, 1600);
      }
    }
    this.updateClock();
    if (this.message) {
      this.message.t -= dt;
      if (this.message.t <= 0) {
        this.message = null;
        this.refresh();
      }
    }
    if (this.stampFx) {
      this.stampFx.t -= dt;
      if (!this.stampFx.node.destroyed) this.stampFx.node.alpha = Math.min(1, this.stampFx.t * 2);
      if (this.stampFx.t <= 0 || this.stampFx.node.destroyed) {
        if (!this.stampFx.node.destroyed) this.stampFx.node.destroy({ children: true });
        this.stampFx = null;
      }
    }
  }

  onKey(e: KeyboardEvent): boolean {
    const k = e.key.toLowerCase();
    if (k === 'i' || k === ' ') this.toggleInspect();
    else if (k === 'r') {
      this.rulebookOpen = !this.rulebookOpen;
      this.refresh();
    } else if (k === 'a') this.stamp('approve');
    else if (k === 'd') this.stamp('deny');
    else if (k === 'e') this.stamp('escalate');
    else if (k === 'b') this.stamp('bury');
    else if (k === 'arrowdown' || k === 'j' || k === 'arrowup' || k === 'k') {
      const items = this.items();
      const idx = items.findIndex((x) => x.id === this.selected);
      const n = items[(idx + (k === 'arrowup' || k === 'k' ? -1 : 1) + items.length) % items.length];
      if (n) this.selectItem(n);
    } else return false;
    return true;
  }
}
