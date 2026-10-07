/**
 * The President's desk: the core of the game (Papers, Please-style).
 *
 *  - Top: office doorway (the visitor stands there and talks back), wall
 *         clock (shift clock), calendar, cash, meters, nav.
 *  - Left: manila file card (what's on record) + the fighter licence card
 *          stapled to agreements, desk props (rulebook, inspect lamp, calc).
 *  - Centre: the active document; the inspection strip at its foot.
 *  - Right: the inbox queue and the stamp rack.
 *  - INSPECT mode: click a field, then the field it should match (file card,
 *    licence card, rulebook, or the face in the doorway). Matches are
 *    recorded on the document as discrepancies; ask the visitor about them.
 */
import { openReplacementPicker } from '../replace';
import { Container, Graphics } from 'pixi.js';
import { Scene } from '../app';
import { PAL, C, shade, meterColor } from '../../art/palette';
import { W, H, text, button, box, clickable, ScrollBox, hoverTip, paper, makeDraggable } from '../kit';
import type { DeskDoc, Stamp, StoryletInstance, Negotiation } from '../../core/types';
import { Inspector, renderDoc, renderFileCard, renderIdCard, ruleField, PAGE_RULE_KEYS, PAGE_FOR_TYPE, RULE_KEY_RULE } from '../docview';
import { stampDoc, compareFields, spendMinutes } from '../../sim/week';
import { checkPair } from '../../sim/docs';
import { interrogate, takeBribe, refuseBribe, secondaryAction, doSecondary, closeDeskDay, deskTally, type Reply } from '../../sim/deskops';
import { fmtClock, fmtDate, DAY_MINUTES, fmtFightDate } from '../../core/time';
import { money } from '../../core/format';
import { rulebookPages, rulesNewThisWeek } from '../../sim/rules';
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

const STAMP_INK: Record<Stamp, string> = { approve: 'APPROVED', deny: 'DENIED', escalate: 'ESCALATED', bury: 'BURIED' };

/** Centre column geometry. */
const DOC_X = 122;
const DOC_Y = 84;
const DOC_W = 240;
const STRIP_Y = H - 16;

export class DeskScene extends Scene {
  tutorialKey = 'desk';
  ins = new Inspector();
  private selected: string | null = null;
  rulebookOpen = false;
  private rulePage = '';
  private message: { text: string; color: number; t: number } | null = null;
  private stringLayer = new Graphics();
  private clockText: ReturnType<typeof text> | null = null;
  private clockHand = new Graphics();
  private lastFound: [string, string] | null = null;
  /** rulebook window: position + zoom survive refreshes */
  private rb = { x: 244, y: 84, zoom: 1 };
  /** calculator window */
  calcOpen = false;
  private calc = { x: 4, y: 82, display: '0', acc: 0, op: '' as '' | '+' | '-' | '*' | '/', fresh: true };
  private dayOverShown = false;
  private warned = false;
  private queueScroll = 0;
  /** the visitor's latest answer */
  private talk: (Reply & { docId: string }) | null = null;
  /** citation slip printing out of the desk */
  private slip: { node: Container | null; reason: string; fine: number; warning: boolean; t: number } | null = null;
  /** stamp -> ink -> hand the document back */
  private anim: { t: number; node: Container; ink: Container | null; done: () => void } | null = null;
  private docNode: Container | null = null;
  /** for the tutorial / tests: what just happened at the desk */
  lastEvent: { kind: 'compare' | 'stamp' | 'ask' | 'select'; found?: boolean; stamp?: Stamp; correct?: boolean } | null = null;

  enter(): void {
    // the morning bulletin (if any) is the first thing on the desk
    const s = this.g.state!;
    const bulletin = s.desk.queue.find((d) => d.meta.bulletin);
    if (bulletin) this.selected = bulletin.id;
    super.enter();
  }

  build(): void {
    const s = this.g.state!;
    const r = this.root;
    this.stringLayer = new Graphics();
    this.clockHand = new Graphics();
    this.ins.clear();
    this.ins.onCompare = (a, b) => this.compare(a, b);
    this.ins.onChange = () => {
      // highlighting the line items of a camp expense report pulls out the calculator
      const it = this.currentItem();
      if (this.ins.selected?.startsWith('doc.item') && it?.kind === 'doc' && it.doc.type === 'expense' && !this.calcOpen) {
        this.calcOpen = true;
        this.refresh();
        return;
      }
      this.drawStrings();
    };

    // ---------------------------------------------------------- office wall
    const wall = new Graphics();
    wall.rect(0, 0, W, 80).fill(0x3a3036);
    for (let x = 0; x < W; x += 16) wall.rect(x, 0, 1, 80).fill(0x342b31);
    wall.rect(0, 76, W, 4).fill(0x241d22);
    r.addChild(wall);
    // the doorway where visitors stand
    const win = new Graphics();
    win.rect(6, 4, 190, 70).fill(0x1d2430);
    win.rect(6, 4, 190, 70).stroke({ color: 0x6b5a4a, width: 2, alignment: 1 });
    for (let i = 0; i < 30; i++) win.rect(8 + ((i * 37) % 186), 40 + ((i * 13) % 30), 2, 2).fill(i % 3 ? 0x4a5a6a : 0x8a7a4a);
    r.addChild(win);
    this.drawVisitor(r);

    // clock
    const clock = new Graphics();
    clock.circle(222, 22, 15).fill(PAL.bone).stroke({ color: PAL.ink, width: 2 });
    // shift arc: 9am..6pm
    r.addChild(clock);
    r.addChild(this.clockHand);
    this.clockText = text(fmtClock(s.desk.minutes), 204, 42, { small: true, color: PAL.bone });
    r.addChild(this.clockText);
    const left = s.desk.queue.filter((d) => d.type !== 'memo').length;
    r.addChild(text(`${left} DOC${left === 1 ? '' : 'S'} LEFT`, 202, 52, { small: true, color: left ? PAL.ash : PAL.moss }));
    hoverTip(r.children[r.children.length - 1] as Container, 'Shift: 9 AM to 6 PM. Every action costs minutes. Paperwork left at 6 rolls over (and rots).');
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

    // file card (left) + licence card
    const fc = renderFileCard(doc, 114, this.ins, s);
    fc.position.set(4, 84);
    r.addChild(fc);
    if (doc?.type === 'bout') {
      const idc = renderIdCard(doc, doc.subject ? s.fighters[doc.subject] ?? null : null, 114, this.ins);
      if (idc) {
        idc.position.set(4, Math.min(186, 84 + fc.height + 3));
        idc.rotation = -0.02;
        r.addChild(idc);
      }
    }
    r.addChild(this.drawProps());

    // centre: document / item
    const centre = new Container();
    centre.position.set(DOC_X, DOC_Y);
    r.addChild(centre);
    this.docNode = centre;
    if (item?.kind === 'doc') {
      const dv = renderDoc(item.doc, DOC_W, this.ins, s.week);
      if (dv.height > H - DOC_Y - 2) {
        const sb = new ScrollBox(DOC_W + 4, H - DOC_Y - 2);
        sb.content.addChild(dv);
        centre.addChild(sb);
        sb.refresh();
      } else centre.addChild(dv);
    } else if (item) {
      centre.addChild(this.itemCard(item));
    } else {
      const empty = paper(DOC_W, 120, 'white', 9);
      empty.addChild(text('INBOX ZERO.\n\nNo paperwork, no calls, no problems.\n(That never lasts.)\n\nBuild cards on the corkboard, scout fighters in the filing cabinet, or end the day.', 8, 10, { width: 224, color: PAL.ink }));
      centre.addChild(empty);
    }

    // right: queue + stamps
    r.addChild(this.drawQueue());
    if (item?.kind === 'doc') r.addChild(this.drawStamps(item.doc));

    // rulebook & calculator float above everything on the desk
    if (this.rulebookOpen) r.addChild(this.drawRulebook());
    if (this.calcOpen) r.addChild(this.drawCalculator());

    // inspection strip
    const strip = this.drawStrip(doc);
    if (strip) r.addChild(strip);
    if (this.slip) r.addChild(this.drawSlip());
    r.addChild(this.stringLayer);
    this.drawStrings();
    this.updateClock();
  }

  // ------------------------------------------------------------ props

  private drawProps(): Container {
    const props = new Container();
    props.position.set(4, 240);
    const rb = clickable(new Container(), () => this.toggleRulebook(), 'Rulebook (R)');
    rb.addChild(box(36, 26, 0x2d3a52, PAL.ink, { bevel: true }));
    rb.addChild(new Graphics().rect(3, 2, 2, 22).fill(PAL.gold));
    rb.addChild(text('RULE\nBOOK', 8, 5, { small: true, color: PAL.gold }));
    const fresh = rulesNewThisWeek(this.g.state!).length;
    if (fresh) rb.addChild(text('NEW', 22, 19, { small: true, color: PAL.blood }));
    props.addChild(rb);
    const on = this.ins.active;
    const lamp = clickable(new Container(), () => this.toggleInspect(), 'Inspect mode (I / SPACE): click a field, then the field it should match.');
    lamp.addChild(box(46, 26, on ? PAL.gold : PAL.shadow, PAL.ink, { bevel: true }));
    lamp.addChild(new Graphics().circle(8, 13, 5).fill(on ? 0xfff2a0 : 0x5a5246).stroke({ color: PAL.ink, width: 1 }));
    lamp.addChild(text(on ? 'INSPECT\nON' : 'INSPECT\n(I)', 16, 6, { small: true, color: on ? PAL.ink : PAL.bone }));
    lamp.position.set(40, 0);
    props.addChild(lamp);
    const calcBtn = clickable(new Container(), () => this.toggleCalc(), 'Calculator (C): auto-tallies camp expense reports.');
    calcBtn.addChild(box(24, 26, 0x3a3a40, PAL.ink, { bevel: true }));
    calcBtn.addChild(box(18, 5, 0x9aa88a)).position.set(3, 3);
    for (let i = 0; i < 9; i++) calcBtn.addChild(box(4, 3, 0x6a6a72)).position.set(3 + (i % 3) * 6, 11 + Math.floor(i / 3) * 5);
    calcBtn.position.set(90, 0);
    props.addChild(calcBtn);
    return props;
  }

  // ------------------------------------------------------------ the doorway

  private drawVisitor(r: Container): void {
    const s = this.g.state!;
    const item = this.currentItem();
    let por: Container | null = null;
    let caption = '';
    let sub = '';
    if (item?.kind === 'doc' && item.doc.subject && s.fighters[item.doc.subject]) {
      const f = s.fighters[item.doc.subject];
      por = fighterPortrait(f, 64, item.doc.type === 'bail' ? 'mugshot' : 'plain');
      caption = `${f.first} ${f.last}`;
      sub = item.doc.type === 'weighin' ? 'Weigh-in sheet' : `Here about: ${item.doc.title.toLowerCase()}`;
    } else if (item?.kind === 'doc' && item.doc.type === 'press' && item.doc.meta.reporter) {
      const rep = content().reporters.find((x) => x.id === item.doc.meta.reporter);
      if (rep) {
        por = reporterPortrait(rep, 64);
        caption = 'Someone with a lanyard';
        sub = 'Wants a press pass';
      }
    } else if (item?.kind === 'doc' && item.doc.meta.bulletin) {
      por = npcPortrait('commission_runner', 'exec', 64);
      caption = 'Commission runner';
      sub = '"New rules. Sign here. Bye."';
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
        caption = `${f.first} ${f.last}`;
        sub = 'Here to talk money';
      }
    }
    if (!por) {
      r.addChild(text('(the doorway is mercifully empty)', 14, 34, { small: true, color: PAL.grey }));
      return;
    }
    const face = new Container();
    face.addChild(new Graphics().rect(0, 0, 64, 64).fill({ color: 0xffffff, alpha: 0.001 }));
    face.addChild(por);
    face.position.set(12, 7);
    r.addChild(face);
    if (item?.kind === 'doc') this.ins.register({ key: 'win.face', label: 'Face at the door', node: face, w: 64, h: 64 });
    const talk = this.talk && item?.kind === 'doc' && this.talk.docId === item.doc.id ? this.talk : null;
    if (talk) {
      r.addChild(this.drawBubble(talk));
      return;
    }
    r.addChild(text(caption, 82, 8, { small: true, color: PAL.bone, width: 110, maxLines: 2 }));
    if (sub) r.addChild(text(sub, 82, 24, { small: true, color: PAL.ash, width: 110, maxLines: 3 }));
  }

  private drawBubble(talk: Reply & { docId: string }): Container {
    const c = new Container();
    c.position.set(80, 6);
    const bw = 114;
    const name = text(talk.speaker.toUpperCase(), 4, 3, { small: true, color: PAL.blood, width: bw - 8, maxLines: 1 });
    const bribe = talk.outcome === 'bribe';
    const line = text(talk.line, 4, 11, { small: true, color: PAL.ink, width: bw - 8, maxLines: bribe ? 5 : 7 });
    const bh = Math.min(66, 15 + line.textHeight + (bribe ? 15 : 0));
    const g = new Graphics();
    g.roundRect(0, 0, bw, bh, 3).fill(PAL.bone).stroke({ color: PAL.ink, width: 1 });
    g.moveTo(0, 14).lineTo(-6, 20).lineTo(0, 22).fill(PAL.bone);
    c.addChild(g, name, line);
    if (bribe && talk.amount) {
      c.addChild(button(`TAKE ${money(talk.amount)}`, 4, bh - 14, 58, 11, () => this.bribe(true), { small: true, fill: PAL.moss, tooltip: 'Pocket it. The document goes through. Heat goes up. Somebody always remembers.' }));
      c.addChild(button('REFUSE', 66, bh - 14, 44, 11, () => this.bribe(false), { small: true, fill: PAL.blood }));
    }
    return c;
  }

  // ------------------------------------------------------------ queue

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

  /** The document on the desk right now (tutorial hook). */
  currentDoc(): DeskDoc | null {
    const it = this.currentItem();
    return it?.kind === 'doc' ? it.doc : null;
  }

  private drawQueue(): Container {
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
      if (it.kind === 'doc' && String(it.doc.meta.flagged ?? '')) row.addChild(text('!', 95, 3, { small: true, color: PAL.blood }));
      row.position.set(0, i * 13);
      sb.content.addChild(row);
    });
    c.addChild(sb);
    sb.scrollTo(this.queueScroll);
    return c;
  }

  private itemLabel(it: QueueItem): { text: string; color: number } {
    const s = this.g.state!;
    switch (it.kind) {
      case 'doc': {
        const subj = it.doc.subject ? s.fighters[it.doc.subject]?.last ?? '' : '';
        const name = it.doc.meta.bulletin ? 'BULLETIN' : { bout: 'Bout agmt', medical: 'Medical', drug: 'Drug test', visa: 'Visa', weighin: 'Weigh-in', sponsor: 'Sponsor', police: 'Court', expense: 'Expenses', press: 'Press cred', memo: 'MEMO', letter: 'Letter', bail: 'BAIL!' }[it.doc.type];
        return { text: `${it.doc.overdue ? '! ' : ''}${name} ${subj}`, color: it.doc.type === 'bail' || it.doc.meta.bulletin ? PAL.blood : it.doc.type === 'memo' ? PAL.ash : PAL.paper };
      }
      case 'story': {
        const d = def(it.inst.id);
        const t = d?.scenes[0]?.type ?? 'visit';
        const icon = t === 'phone' ? 'CALL:' : t === 'visit' ? 'DOOR:' : t === 'memo' ? 'MEMO:' : '';
        return { text: `${icon} ${d?.title ?? it.inst.id}`, color: t === 'phone' ? PAL.ember : PAL.gold };
      }
      case 'neg':
        return { text: `$$ ${s.fighters[it.neg.fighter]?.last ?? '?'} (${it.neg.kind})`, color: PAL.moss };
      case 'tv':
        return { text: `TV OFFER: ${content().networks.find((n) => n.id === it.network)?.name ?? it.network}`, color: PAL.sky };
    }
  }

  private selectItem(it: QueueItem): void {
    if (this.anim) return;
    this.selected = it.id;
    this.ins.selected = null;
    this.lastFound = null;
    this.lastEvent = { kind: 'select' };
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
    // the rulebook flips to the page for this kind of paper
    const page = PAGE_FOR_TYPE[it.doc.type];
    if (page) this.rulePage = page;
    spendMinutes(this.g.state!, 2);
    this.refresh();
  }

  private itemCard(it: QueueItem): Container {
    const c = paper(DOC_W, 80, 'white', 4);
    c.addChild(text(this.itemLabel(it).text, 8, 8, { width: 224, color: PAL.ink }));
    c.addChild(text('Click it in the inbox to deal with it.', 8, 30, { small: true, color: PAL.grey }));
    return c;
  }

  // ------------------------------------------------------------ stamps

  private stampLabels(d: DeskDoc): Record<Stamp, string> {
    if (d.type === 'weighin') return { approve: 'FIGHT AS IS', deny: 'CANCEL BOUT', escalate: 'CATCHWEIGHT', bury: '"SCALE BROKE"' };
    if (d.type === 'police') return { approve: 'KEEP ON CARD', deny: 'PULL FROM CARD', escalate: 'ESCALATE', bury: 'BURY' };
    return { approve: 'APPROVED', deny: 'DENIED', escalate: 'ESCALATE', bury: 'BURY' };
  }

  private drawStamps(d: DeskDoc): Container {
    const c = new Container();
    c.position.set(366, 196);
    c.addChild(box(110, 70, 0x2a1f18, PAL.woodDark));
    if (d.type === 'memo' || d.type === 'letter') {
      c.addChild(text(d.meta.bulletin ? 'Read it. The rulebook\nhas been updated.' : 'Nothing to inspect.', 6, 6, { small: true, color: PAL.ash, width: 100 }));
      c.addChild(button('FILE IT (A)', 4, 36, 102, 18, () => this.stamp('approve'), { fill: PAL.moss }));
      return c;
    }
    const labels = this.stampLabels(d);
    // two physical rubber stamps
    const block = (st: Stamp, x: number, key: string) => {
      const b = clickable(new Container(), () => this.stamp(st), `${labels[st]} (${key})`);
      const col = STAMP_FILL[st]();
      b.addChild(new Graphics().rect(15, 0, 22, 9).fill(shade(PAL.wood, 0.25)).stroke({ color: PAL.ink, width: 1 })); // handle
      b.addChild(new Graphics().rect(18, -3, 16, 4).fill(shade(PAL.wood, 0.4)));
      b.addChild(box(52, 22, col, PAL.ink, { bevel: true })).position.set(0, 9);
      b.addChild(text(labels[st], 0, 14, { small: true, color: PAL.bone, width: 52, align: 'center', maxLines: 1 }));
      b.addChild(text(key, 0, 22, { small: true, color: shade(col, 0.5), width: 52, align: 'center' }));
      b.position.set(x, 6);
      return b;
    };
    c.addChild(block('approve', 3, 'A'));
    c.addChild(block('deny', 56, 'D'));
    c.addChild(button('ESCALATE (E)', 3, 40, 52, 11, () => this.stamp('escalate'), {
      small: true, fill: STAMP_FILL.escalate(), tooltip: d.type === 'weighin' ? 'Catchweight: the bout goes on, the offender forfeits 25% of the purse.' : 'Send to legal: always "safe" but costs a fee and time, and the board hates overuse.',
    }));
    c.addChild(button('BURY (B)', 56, 40, 51, 11, () => this.stamp('bury'), { small: true, fill: STAMP_FILL.bury(), tooltip: 'Make it disappear. Deliberate. Tracked. It may resurface.' }));
    const sec = secondaryAction(d);
    if (sec) c.addChild(button(sec.label, 3, 54, 104, 12, () => this.secondary(), { small: true, fill: PAL.ember, tooltip: sec.tip }));
    else c.addChild(text(this.ins.active ? 'Inspecting...' : 'I = inspect   R = rulebook', 4, 57, { small: true, color: PAL.grey }));
    return c;
  }

  // ------------------------------------------------------------ rulebook

  private toggleRulebook(): void {
    this.rulebookOpen = !this.rulebookOpen;
    const d = this.currentDoc();
    if (this.rulebookOpen && d && PAGE_FOR_TYPE[d.type]) this.rulePage = PAGE_FOR_TYPE[d.type]!;
    sfx('paper');
    this.refresh();
  }

  private drawRulebook(): Container {
    const s = this.g.state!;
    const pages = rulebookPages(s);
    const fresh = new Set(rulesNewThisWeek(s));
    let idx = Math.max(0, pages.findIndex((p) => p.page === this.rulePage));
    const page = pages[idx];
    this.rulePage = page?.page ?? '';
    const c = new Container();
    c.position.set(this.rb.x, this.rb.y);
    c.scale.set(this.rb.zoom);
    const bw = 232;
    const bh = 182;
    c.addChild(box(bw, bh, 0x2d3a52, PAL.ink, { shadow: true }));
    c.addChild(paper(bw - 8, bh - 30, 'white', 5)).position.set(4, 26);
    // title bar = drag handle
    const handle = new Container();
    handle.addChild(new Graphics().rect(0, 0, 70, 12).fill({ color: 0xffffff, alpha: 0.001 }));
    handle.addChild(text('RULEBOOK', 5, 3, { small: true, color: PAL.gold }));
    c.addChild(handle);
    makeDraggable(handle, c, (x, y) => {
      this.rb.x = x;
      this.rb.y = y;
      this.drawStrings();
    }, { w: bw, h: bh });
    hoverTip(handle, 'Drag me anywhere. +/- or [ ] to zoom.');
    c.addChild(button('X', bw - 13, 2, 11, 10, () => this.toggleRulebook(), { small: true, fill: PAL.blood }));
    c.addChild(button('+', bw - 39, 2, 11, 10, () => this.zoomRulebook(0.25), { small: true, fill: PAL.steel, tooltip: 'Zoom in' }));
    c.addChild(button('-', bw - 26, 2, 11, 10, () => this.zoomRulebook(-0.25), { small: true, fill: PAL.steel, tooltip: 'Zoom out' }));
    // page flipper
    const flip = (d: number) => {
      idx = (idx + d + pages.length) % pages.length;
      this.rulePage = pages[idx]?.page ?? '';
      sfx('paper');
      this.refresh();
    };
    c.addChild(button('<', 4, 13, 12, 11, () => flip(-1), { small: true, fill: PAL.slate }));
    c.addChild(button('>', bw - 16, 13, 12, 11, () => flip(1), { small: true, fill: PAL.slate }));
    const pageNew = page?.rules.some((r) => fresh.has(r.id));
    c.addChild(text(`${(page?.page ?? '').toUpperCase()}  ${idx + 1}/${pages.length}${pageNew ? '  NEW!' : ''}`, 18, 16, { small: true, color: pageNew ? PAL.gold : PAL.bone, width: bw - 36, align: 'center' }));
    if (!page) return c;
    const sb = new ScrollBox(bw - 12, bh - 36);
    sb.position.set(8, 30);
    let y = 0;
    for (const rule of page.rules) {
      const t = text(rule.title.toUpperCase() + (fresh.has(rule.id) ? '  (NEW)' : ''), 0, y, { color: fresh.has(rule.id) ? PAL.rust : PAL.blood, small: true });
      sb.content.addChild(t);
      y += 8;
      const body = text(rule.text, 0, y, { width: bw - 24, color: PAL.ink, small: true });
      sb.content.addChild(body);
      y += body.textHeight + 5;
    }
    const doc = this.currentDoc();
    const refs = doc?.refs ?? {};
    for (const key of (PAGE_RULE_KEYS[page.page] ?? []).filter((k) => !RULE_KEY_RULE[k] || s.rules.active.includes(RULE_KEY_RULE[k]) || (k === 'rule.bannedCats'))) {
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

  private zoomRulebook(d: number): void {
    this.rb.zoom = Math.max(0.75, Math.min(2, this.rb.zoom + d));
    sfx('click');
    this.refresh();
  }

  // ------------------------------------------------------------ calculator
  private calcKey(k: string): void {
    const c = this.calc;
    const cur = () => parseFloat(c.display.replace(/,/g, '')) || 0;
    const apply = () => {
      const v = cur();
      if (c.op === '+') c.acc += v;
      else if (c.op === '-') c.acc -= v;
      else if (c.op === '*') c.acc *= v;
      else if (c.op === '/') c.acc = v ? c.acc / v : NaN;
      else c.acc = v;
    };
    if (/^[0-9]$/.test(k)) {
      c.display = c.fresh || c.display === '0' ? k : (c.display + k).slice(0, 11);
      c.fresh = false;
    } else if (k === '.') {
      if (c.fresh) c.display = '0.';
      else if (!c.display.includes('.')) c.display += '.';
      c.fresh = false;
    } else if (k === 'C') {
      c.display = '0';
      c.acc = 0;
      c.op = '';
      c.fresh = true;
    } else if (k === '=') {
      apply();
      c.op = '';
      c.display = Number.isFinite(c.acc) ? String(Math.round(c.acc * 100) / 100) : 'ERR';
      c.fresh = true;
    } else if (['+', '-', '*', '/'].includes(k)) {
      if (!c.fresh) apply();
      c.op = k as '+' | '-' | '*' | '/';
      c.display = Number.isFinite(c.acc) ? String(Math.round(c.acc * 100) / 100) : 'ERR';
      c.fresh = true;
    }
    sfx('click');
    this.refresh();
  }

  /** Line items of the current camp expense report (if that's what's on the desk). */
  private expenseTally(): { lines: { item: string; amt: number }[]; claimed: number; sum: number; cap: number } | null {
    const d = this.currentDoc();
    if (d?.type !== 'expense') return null;
    const num = (t: string) => Number((t.match(/\$?([\d,]+)\s*$/)?.[1] ?? '0').replace(/,/g, ''));
    const lines = d.fields.filter((f) => f.key.startsWith('doc.item')).map((f) => ({ item: f.label.replace(/^\d+\.\s*/, ''), amt: num(f.value) }));
    const claimed = num(d.fields.find((f) => f.key === 'doc.total')?.value ?? '0');
    const capTxt = d.refs['rule.cap'] ?? '';
    const cap = Number((capTxt.match(/\$?([\d,]+)/)?.[1] ?? '0').replace(/,/g, '')) || 3000;
    return { lines, claimed, sum: lines.reduce((t, l) => t + l.amt, 0), cap };
  }

  private drawCalculator(): Container {
    const c = new Container();
    c.position.set(this.calc.x, this.calc.y);
    const cw = 112;
    const tally = this.expenseTally();
    const ch = tally ? 186 : 118;
    c.addChild(box(cw, ch, 0x2a2a2e, PAL.ink, { shadow: true, bevel: true }));
    const handle = new Container();
    handle.addChild(new Graphics().rect(0, 0, cw - 16, 12).fill({ color: 0xffffff, alpha: 0.001 }));
    handle.addChild(text('CALC-U-LOSER 3000', 4, 3, { small: true, color: PAL.ash }));
    c.addChild(handle);
    makeDraggable(handle, c, (x, y) => {
      this.calc.x = x;
      this.calc.y = y;
    }, { w: cw, h: ch });
    c.addChild(button('X', cw - 13, 2, 11, 9, () => {
      this.calcOpen = false;
      this.refresh();
    }, { small: true, fill: PAL.blood }));
    c.addChild(box(cw - 8, 14, 0x9aa88a, PAL.ink)).position.set(4, 13);
    c.addChild(text(this.calc.display + (this.calc.op ? ' ' + this.calc.op : ''), 6, 16, { width: cw - 14, align: 'right', color: 0x1a2414 }));
    const keys = ['7', '8', '9', '/', '4', '5', '6', '*', '1', '2', '3', '-', 'C', '0', '=', '+'];
    keys.forEach((k, i) => {
      const bx = 4 + (i % 4) * 26;
      const by = 30 + Math.floor(i / 4) * 15;
      c.addChild(button(k === '*' ? 'x' : k, bx, by, 24, 13, () => this.calcKey(k), {
        small: true, fill: /[0-9]/.test(k) ? 0x45454c : k === 'C' ? PAL.blood : k === '=' ? PAL.moss : PAL.slate,
      }));
    });
    c.addChild(button('.', 4, 90, 24, 12, () => this.calcKey('.'), { small: true, fill: 0x45454c }));
    if (!tally) {
      c.addChild(text('Open a camp expense report to auto-tally it.', 32, 91, { small: true, width: cw - 36, color: PAL.grey }));
      return c;
    }
    c.addChild(paper(cw - 8, 80, 'white', 3)).position.set(4, 104);
    let y = 107;
    for (const l of tally.lines.slice(0, 6)) {
      const over = l.amt > tally.cap;
      c.addChild(text(l.item.slice(0, 13), 7, y, { small: true, color: over ? PAL.blood : PAL.ink, maxLines: 1, width: 58 }));
      c.addChild(text(money(l.amt, false), 66, y, { small: true, color: over ? PAL.blood : PAL.ink, width: 38, align: 'right' }));
      y += 7;
    }
    c.addChild(new Graphics().rect(7, y, cw - 14, 1).fill(PAL.ink));
    y += 2;
    c.addChild(text('SUM', 7, y, { small: true, color: PAL.ink }));
    c.addChild(text(money(tally.sum, false), 50, y, { small: true, color: PAL.ink, width: 54, align: 'right' }));
    y += 7;
    c.addChild(text('CLAIMED', 7, y, { small: true, color: PAL.ink }));
    c.addChild(text(money(tally.claimed, false), 50, y, { small: true, color: PAL.ink, width: 54, align: 'right' }));
    y += 9;
    const diff = tally.claimed - tally.sum;
    c.addChild(text(diff === 0 ? 'ADDS UP' : `OFF BY ${money(Math.abs(diff), false)}`, 7, y, { small: true, color: diff === 0 ? PAL.moss : PAL.blood }));
    if (diff !== 0) {
      c.addChild(button('CITE IT', cw - 46, y - 2, 40, 11, () => {
        this.ins.active = true;
        this.compare('doc.total', 'doc.item0');
      }, { small: true, fill: PAL.blood, tooltip: 'Flag the bad total (same as comparing TOTAL with a line item in inspect mode).' }));
    }
    return c;
  }

  private toggleCalc(): void {
    this.calcOpen = !this.calcOpen;
    sfx('click');
    this.refresh();
  }

  // ------------------------------------------------------------ inspection

  private toggleInspect(): void {
    this.ins.active = !this.ins.active;
    this.ins.selected = null;
    sfx('click');
    this.refresh();
  }

  private compare(a: string, b: string): void {
    const s = this.g.state!;
    const d = this.currentDoc();
    if (!d) return;
    const r = compareFields(s, d.id, a, b);
    this.lastEvent = { kind: 'compare', found: r.found };
    if (r.found) {
      sfx('bad');
      sfx('stamp');
      this.lastFound = [a, b];
      this.message = null;
      this.g.shake(1, 0.15);
    } else {
      sfx('click');
      this.lastFound = null;
      this.flash('No discrepancy.', PAL.ash, 1.6);
    }
    this.refresh();
  }

  /** Recorded discrepancies on a doc: [a, b, text]. */
  private flagged(d: DeskDoc): [string, string, string][] {
    return String(d.meta.flagged ?? '').split('|').filter((p) => p.includes('~')).map((p) => {
      const [a, b] = p.split('~');
      return [a, b, checkPair(d, a, b)?.text ?? ''] as [string, string, string];
    }).filter((x) => x[2]);
  }

  private drawStrip(d: DeskDoc | null): Container | null {
    let msg = this.message?.text ?? '';
    let color = this.message?.color ?? PAL.bone;
    let ask = false;
    if (!msg && d) {
      const fl = this.flagged(d);
      if (fl.length) {
        msg = 'DISCREPANCY: ' + fl.map((x) => x[2]).join(' / ');
        color = PAL.blood;
        ask = !d.meta.asked;
      } else if (this.ins.active) {
        msg = this.ins.selected ? 'Now click the field it should match (file card, licence, rulebook or face).' : 'INSPECT: click a field on the document, then the field it should match.';
        color = PAL.gold;
      }
    }
    if (!msg) return null;
    const c = new Container();
    const tw = ask ? 196 : 236;
    const t = text(msg, 4, 3, { small: true, width: tw, color, maxLines: 4 });
    const h = t.textHeight + 7;
    c.addChild(box(244, h, PAL.ink, color));
    c.addChild(t);
    if (ask) c.addChild(button('ASK', 204, Math.floor((h - 11) / 2), 36, 11, () => this.ask(), { small: true, fill: PAL.blood, tooltip: 'Ask the visitor about it. Excuses, fixes, envelopes. (8 min)' }));
    c.position.set(DOC_X - 2, Math.min(STRIP_Y, H - h - 1));
    return c;
  }

  private ask(): void {
    const s = this.g.state!;
    const d = this.currentDoc();
    if (!d) return;
    const rng = new Rng(s.rng);
    const rep = interrogate(s, d.id, rng);
    s.rng = rng.state;
    if (!rep) return;
    this.lastEvent = { kind: 'ask' };
    this.talk = { ...rep, docId: d.id };
    sfx(rep.outcome === 'bribe' ? 'cash' : 'type');
    if (rep.outcome === 'fix') {
      this.lastFound = null;
      this.flash('FIXED: the document has been corrected. Check it again.', PAL.moss);
    }
    this.refresh();
  }

  private bribe(take: boolean): void {
    const s = this.g.state!;
    const d = this.currentDoc();
    if (!d) return;
    if (take) {
      const rng = new Rng(s.rng);
      const msg = takeBribe(s, d.id, rng);
      s.rng = rng.state;
      sfx('cash');
      this.talk = null;
      this.selected = null;
      this.lastFound = null;
      this.flash(msg, PAL.gold, 5);
    } else {
      this.flash(refuseBribe(s, d.id), PAL.bone, 4);
      if (this.talk) this.talk = { ...this.talk, outcome: 'excuse', line: '"Your loss, boss." (pockets the envelope)' };
    }
    this.refresh();
  }

  private secondary(): void {
    const s = this.g.state!;
    const d = this.currentDoc();
    if (!d || this.anim) return;
    const rng = new Rng(s.rng);
    const r = doSecondary(s, d.id, rng);
    s.rng = rng.state;
    sfx(r.fixed ? 'good' : 'paper');
    if (r.fixed) this.lastFound = null;
    this.flash(r.text, r.fixed ? PAL.moss : PAL.ember, 4);
    this.refresh();
  }

  private drawStrings(): void {
    const g = this.stringLayer;
    g.clear();
    const d = this.currentDoc();
    if (this.ins.active) {
      for (const sp of this.ins.spots.values()) {
        if (sp.node.destroyed) continue;
        const bb = sp.node.getBounds();
        g.rect(bb.x, bb.y, bb.width, bb.height).stroke({ color: PAL.gold, width: 1, alpha: 0.25 });
      }
      if (this.ins.selected) {
        const sp = this.ins.spots.get(this.ins.selected);
        if (sp && !sp.node.destroyed) {
          const bb = sp.node.getBounds();
          g.rect(bb.x - 1, bb.y - 1, bb.width + 2, bb.height + 2).fill({ color: 0xf0e060, alpha: 0.2 }).stroke({ color: PAL.gold, width: 1 });
        }
      }
    }
    // recorded discrepancies: red marker on both halves, red string between them
    const pairs: [string, string][] = d ? this.flagged(d).map((x) => [x[0], x[1]]) : [];
    if (this.lastFound && !pairs.some((p) => p[0] === this.lastFound![0] && p[1] === this.lastFound![1])) pairs.push(this.lastFound);
    for (const [ka, kb] of pairs) {
      const a = this.ins.center(ka);
      const b = this.ins.center(kb);
      if (a && b) g.moveTo(a.x, a.y).lineTo(b.x, b.y).stroke({ color: PAL.blood, width: 2, alpha: 0.85 });
      for (const k of [ka, kb]) {
        const sp = this.ins.spots.get(k);
        if (!sp || sp.node.destroyed) continue;
        const bb = sp.node.getBounds();
        g.rect(bb.x - 1, bb.y - 1, bb.width + 2, bb.height + 2).fill({ color: 0xff3030, alpha: 0.16 }).stroke({ color: PAL.blood, width: 1 });
      }
    }
  }

  // ------------------------------------------------------------ stamping

  stamp(st: Stamp): void {
    const s = this.g.state!;
    const d = this.currentDoc();
    if (!d || this.anim) return;
    if (d.type === 'bail') return this.selectItem({ kind: 'doc', id: d.id, doc: d });
    const isMemo = d.type === 'memo' || d.type === 'letter';
    if (isMemo && st !== 'approve') return;
    const rng = new Rng(s.rng);
    const res = stampDoc(s, d.id, st, rng);
    s.rng = rng.state;
    this.lastEvent = { kind: 'stamp', stamp: st, correct: res.correct };
    if (d.type === 'weighin' && st === 'deny' && d.meta.missedBy) {
      const ev = s.events.find((e) => e.id === d.meta.eventId);
      const b = ev?.card.find((x) => x.id === d.meta.boutId);
      if (ev && b && b.status === 'scheduled' && b.pulled?.length) {
        setTimeout(() => openReplacementPicker(this.g, ev, b, String(d.meta.missedBy), 'missed weight', () => this.refresh()), 900);
      }
    }
    // THUNK: ink on the paper
    sfx('stamp');
    sfx('thud');
    this.g.shake(2, 0.12);
    const node = this.docNode;
    if (node && !node.destroyed) {
      const col = STAMP_FILL[st]();
      const label = isMemo ? 'FILED' : STAMP_INK[st];
      const ink = new Container();
      const t = text(label, 6, 5, { scale: 2, color: col });
      ink.addChild(new Graphics().rect(0, 0, t.textWidth + 12, 24).stroke({ color: col, width: 2 }));
      ink.addChild(t);
      ink.pivot.set((t.textWidth + 12) / 2, 12);
      ink.position.set(DOC_W / 2 + rng.int(-30, 30), 40 + rng.int(0, 30));
      ink.rotation = -0.25 + rng.next() * 0.2;
      ink.alpha = 0.9;
      ink.scale.set(1.35);
      node.addChild(ink);
      this.anim = { t: 0, node, ink, done: () => this.afterStamp(res, isMemo, st) };
    } else this.afterStamp(res, isMemo, st);
  }

  private afterStamp(res: ReturnType<typeof stampDoc>, isMemo: boolean, st: Stamp): void {
    const s = this.g.state!;
    this.anim = null;
    this.talk = null;
    this.selected = null;
    this.lastFound = null;
    this.ins.selected = null;
    if (res.citation) {
      sfx('citation');
      const cit = s.desk.citations[s.desk.citations.length - 1];
      this.slip = { node: null, reason: res.citation, fine: cit?.fine ?? 0, warning: !!cit?.warning, t: 0 };
      this.message = null;
    } else if (!isMemo) this.flash(res.text || STAMP_INK[st], res.correct ? PAL.bone : PAL.ember, 3);
    this.refresh();
  }

  private drawSlip(): Container {
    const sl = this.slip!;
    const c = clickable(new Container(), () => {
      this.slip = null;
      this.refresh();
    }, 'Click to file it under "things I will think about later".');
    const w = 150;
    const body = text(sl.reason, 6, 22, { small: true, width: w - 12, color: PAL.ink, maxLines: 4 });
    const foot = text(sl.warning ? 'WARNING. Next time it comes out of your pay.' : `PENALTY: -${money(sl.fine, false)} from your pay`, 6, 0, { small: true, color: sl.warning ? PAL.slate : PAL.blood, width: w - 12 });
    const h = 30 + body.textHeight + foot.textHeight;
    foot.y = h - foot.textHeight - 5;
    c.addChild(paper(w, h, 'pink', 77));
    c.addChild(box(w, 10, PAL.blood));
    c.addChild(text('M.O.A. CITATION', 4, 2, { small: true, color: PAL.bone }));
    c.addChild(text('PROTOCOL VIOLATION', 6, 13, { small: true, color: PAL.blood }));
    c.addChild(body, foot);
    c.position.set(DOC_X + (DOC_W - w) / 2, this.slipY(h) + Math.round(Math.max(0, 1 - sl.t * 4) * (h + 24)));
    c.rotation = 0.015;
    sl.node = c;
    return c;
  }

  /** citation slips print out just above the inspection strip */
  private slipY(h: number): number {
    return H - h - 20;
  }

  private flash(msg: string, color: number, t = 4): void {
    this.message = { text: msg, color, t };
  }

  // ------------------------------------------------------------ day end

  private finishDay(): void {
    const s = this.g.state!;
    const note = closeDeskDay(s);
    const t = deskTally(s);
    this.g.toast(`DESK: ${t.processed} processed, ${t.caught} caught, ${t.citations} citation${t.citations === 1 ? '' : 's'}${note ? '. ' + note : ''}`, note ? PAL.gold : PAL.bone);
    const ev = eventThisWeek(s);
    s.phase = ev ? 'fightnight' : 'ledger';
    this.g.autosave();
    routePhase(this.g);
  }

  endDay(): void {
    const s = this.g.state!;
    const left = s.desk.queue.filter((d) => d.type !== 'memo').length + s.storylets.pending.length;
    if (left > 0) confirm(this.g, `${left} item(s) still on your desk. Unprocessed paperwork rolls over (and can cause problems). Calls & visitors get a default response. End the day anyway?`, () => this.finishDay(), 'END DAY', 'KEEP WORKING');
    else this.finishDay();
  }

  private updateClock(): void {
    const s = this.g.state!;
    const m = s.desk.minutes;
    this.clockText?.setText(fmtClock(m));
    this.clockText?.setColor(m > DAY_MINUTES - 60 ? PAL.blood : PAL.bone);
    const g = this.clockHand;
    g.clear();
    // shift elapsed: a red wedge on the dial
    const start = -Math.PI / 2 + (9 / 12) * Math.PI * 2;
    const frac = Math.min(1, m / DAY_MINUTES);
    if (frac > 0) g.moveTo(222, 22).arc(222, 22, 13, start, start + frac * (9 / 12) * Math.PI * 2).lineTo(222, 22).fill({ color: m > DAY_MINUTES - 60 ? PAL.blood : PAL.ember, alpha: 0.25 });
    const hours = (9 + m / 60) % 12;
    const ha = (hours / 12) * Math.PI * 2 - Math.PI / 2;
    const ma = ((m % 60) / 60) * Math.PI * 2 - Math.PI / 2;
    g.moveTo(222, 22).lineTo(222 + Math.cos(ha) * 7, 22 + Math.sin(ha) * 7).stroke({ color: PAL.ink, width: 2 });
    g.moveTo(222, 22).lineTo(222 + Math.cos(ma) * 11, 22 + Math.sin(ma) * 11).stroke({ color: PAL.blood, width: 1 });
  }

  /** The tutorial pauses the shift clock. */
  clockPaused = false;

  update(dt: number): void {
    const s = this.g.state;
    if (!s) return;
    if (!this.g.modals.length && !this.rulebookOpen && !this.clockPaused) {
      s.desk.minutes += dt * 1.5 * (this.g.settings.clockSpeed || 1);
      if (s.desk.minutes >= DAY_MINUTES - 60 && !this.warned) {
        this.warned = true;
        sfx('bell');
        this.flash('5:00 PM. One hour left in the shift.', PAL.gold, 3);
        this.refresh();
      }
      if (s.desk.minutes >= DAY_MINUTES && !this.dayOverShown) {
        this.dayOverShown = true;
        sfx('bell');
        this.flash('6:00 PM. Shift over. Whatever is left rolls over.', PAL.gold);
        this.refresh();
        setTimeout(() => {
          if (this.g.scene !== this) return;
          this.finishDay();
        }, 1600);
      }
    }
    this.updateClock();
    if (this.anim) {
      const a = this.anim;
      a.t += dt;
      const ink = a.ink;
      if (ink && !ink.destroyed) ink.scale.set(Math.max(1, 1.35 - a.t * 4));
      // hand the document back: it slides up into the doorway
      if (a.t > 0.3 && !a.node.destroyed) {
        const k = Math.min(1, (a.t - 0.3) / 0.3);
        a.node.y = DOC_Y - k * k * 110;
        a.node.alpha = 1 - k * 0.8;
      }
      if (a.t >= 0.6) a.done();
    }
    if (this.message) {
      this.message.t -= dt;
      if (this.message.t <= 0) {
        this.message = null;
        if (!this.anim) this.refresh();
      }
    }
    if (this.slip) {
      this.slip.t += dt;
      const n = this.slip.node;
      if (n && !n.destroyed && this.slip.t < 0.3) {
        const h = n.height;
        n.y = this.slipY(h) + Math.round(Math.max(0, 1 - this.slip.t * 4) * (h + 24));
      }
      if (this.slip.t > 7) {
        this.slip = null;
        if (!this.anim) this.refresh();
      }
    }
  }

  onKey(e: KeyboardEvent): boolean {
    const k = e.key.toLowerCase();
    if (k === 'i' || k === ' ') this.toggleInspect();
    else if (k === 'r') this.toggleRulebook();
    else if (k === 'c') this.toggleCalc();
    else if (this.calcOpen && /^[0-9.+\-*/=]$/.test(e.key)) this.calcKey(e.key);
    else if (this.calcOpen && (k === 'enter' || k === 'backspace' || k === 'delete')) this.calcKey(k === 'enter' ? '=' : 'C');
    else if (this.rulebookOpen && (k === '[' || k === ']')) this.zoomRulebook(k === ']' ? 0.25 : -0.25);
    else if (this.rulebookOpen && (k === 'arrowleft' || k === 'arrowright')) {
      const pages = rulebookPages(this.g.state!);
      const i = pages.findIndex((p) => p.page === this.rulePage);
      this.rulePage = pages[(i + (k === 'arrowright' ? 1 : -1) + pages.length) % pages.length]?.page ?? '';
      this.refresh();
    } else if (k === 'a') this.stamp('approve');
    else if (k === 'd') this.stamp('deny');
    else if (k === 'e') this.stamp('escalate');
    else if (k === 'b') this.stamp('bury');
    else if (k === 'q') this.ask();
    else if (k === 'arrowdown' || k === 'j' || k === 'arrowup' || k === 'k') {
      const items = this.items();
      const idx = items.findIndex((x) => x.id === this.selected);
      const n = items[(idx + (k === 'arrowup' || k === 'k' ? -1 : 1) + items.length) % items.length];
      if (n) this.selectItem(n);
    } else return false;
    return true;
  }
}
