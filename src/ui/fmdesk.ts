/**
 * Fighter Mode paperwork: the same inspection as the career desk, from the other side of
 * the table. The document sits in the middle, your reference (what you agreed, your file,
 * the Commission rules) on the right. INSPECT (I): click a line on the document, then the
 * line it should match. Find the problem, then stamp: SIGN (A) or DISPUTE (D).
 * Every stamp prints a notice slip; click it to read the whole thing.
 */
import { Container, Graphics, type Ticker } from 'pixi.js';
import type { Game } from './app';
import type { DeskDoc, DocType, GameState } from '../core/types';
import { PAL, shade } from '../art/palette';
import { W, H, text, button, box, paper } from './kit';
import { Inspector, renderDoc, fieldNode } from './docview';
import { alertBox } from './widgets';
import { sfx } from '../audio/sfx';
import { Rng } from '../core/rng';
import { fm, resolveDoc, comparePair, type FMDoc } from '../sim/fighter';

const DOC_X = 122;
const DOC_Y = 40;
const DOC_W = 240;
const REF_X = 368;
const REF_W = 108;

const TYPE_FOR: Record<FMDoc['kind'], DocType> = {
  bout: 'bout', statement: 'expense', medical: 'medical', sponsor: 'sponsor', ofdeal: 'letter', bkdeal: 'police',
};

function asDeskDoc(d: FMDoc): DeskDoc {
  return {
    id: d.id, type: TYPE_FOR[d.kind], title: d.title.toUpperCase(), subject: null, refs: {}, violations: [], week: d.week, overdue: 0, meta: {},
    fields: [{ key: 'doc.from', label: 'From', value: d.from }, ...d.fields.map((f, i) => ({ key: 'doc.' + i, label: f.label, value: f.value, kind: f.kind }))],
  };
}

export function openFMDesk(g: Game, onDone: () => void): void {
  const s: GameState = g.state!;
  const st = fm(s);
  const ins = new Inspector();
  let cur: FMDoc | null = st.inbox[0] ?? null;
  let found: { a: string; b: string; text: string } | null = null;
  let msg: { text: string; color: number; t: number } | null = null;
  let slip: { title: string; body: string; good: boolean; node: Container | null; t: number } | null = null;
  let stamping: { t: number; ink: Container } | null = null;

  const frame = new Container();
  const wrap = g.modal(frame, { dim: 0.85 });
  const bg = new Container();
  const layer = new Container();
  const strings = new Graphics();
  frame.addChild(bg, layer, strings);

  // kitchen table: wall, fridge with bills on it, the table
  const wall = new Graphics().rect(0, 0, W, 34).fill(0x3a3430);
  for (let x = 0; x < W; x += 12) wall.rect(x, 0, 1, 34).fill(0x332d2a);
  wall.rect(0, 30, W, 4).fill(0x241f1c);
  wall.rect(W - 60, 2, 40, 28).fill(0xd8d8d0).stroke({ color: 0x8a8a84, width: 1 }); // fridge
  wall.rect(W - 54, 6, 8, 6).fill(PAL.blood).rect(W - 42, 8, 10, 7).fill(0xf0e070).rect(W - 30, 5, 6, 9).fill(PAL.sky);
  wall.rect(0, 34, W, H - 34).fill(0x6a4a30);
  for (let y = 36; y < H; y += 6) wall.rect(0, y, W, 1).fill(shade(0x6a4a30, (y % 18) / 180 - 0.05));
  bg.addChild(wall);
  bg.addChild(text('THE KITCHEN TABLE  •  YOUR PAPERWORK', 6, 6, { color: PAL.gold }));
  bg.addChild(text('Read it like your purse depends on it. It does.', 6, 18, { small: true, color: PAL.ash }));

  const docNodeRef: { node: Container | null } = { node: null };

  const draw = () => {
    layer.removeChildren().forEach((c) => c.destroy({ children: true }));
    ins.clear();
    ins.onCompare = (a, b) => compare(a, b);
    ins.onChange = () => drawStrings();
    // ------------------------------------------------ inbox tray (left)
    const tray = new Container();
    tray.position.set(4, DOC_Y);
    tray.addChild(box(112, 150, 0x2a1f18, 0x4a3628));
    tray.addChild(text(`INBOX (${st.inbox.length})`, 6, 4, { small: true, color: PAL.gold }));
    st.inbox.slice(0, 9).forEach((d, i) => {
      const on = d === cur;
      const it = button(d.title.length > 20 ? d.title.slice(0, 19) + '…' : d.title, 4, 14 + i * 15, 104, 13, () => {
        cur = d;
        found = null;
        ins.selected = null;
        draw();
      }, { small: true, fill: on ? PAL.gold : d.kind === 'medical' ? 0x6a2a2a : d.kind === 'ofdeal' || d.kind === 'bkdeal' ? 0x1f5a7a : PAL.slate });
      tray.addChild(it);
    });
    if (!st.inbox.length) tray.addChild(text('Empty. Enjoy it.', 6, 16, { small: true, color: PAL.ash }));
    layer.addChild(tray);

    // ------------------------------------------------ the document (centre) + reference card (right)
    if (cur) {
      const dd = asDeskDoc(cur);
      const node = renderDoc(dd, DOC_W, ins, 3);
      node.position.set(DOC_X, DOC_Y);
      layer.addChild(node);
      docNodeRef.node = node;
      const ref = new Container();
      let y = 14;
      const rows: Container[] = [];
      cur.ref.lines.forEach((l, i) => {
        const { node: fnode, h } = fieldNode('ref.' + i, l.label, l.value, REF_W - 6, ins, { labelW: 40, small: true, kind: l.kind === 'sig' ? 'sig' : undefined });
        fnode.position.set(3, y);
        rows.push(fnode);
        y += h + 2;
      });
      ref.addChild(paper(REF_W, Math.max(60, y + 4), 'manila', 7));
      ref.addChild(box(REF_W, 11, PAL.woodDark));
      ref.addChild(text(cur.ref.title.length > 24 ? cur.ref.title.slice(0, 23) + '…' : cur.ref.title, 3, 3, { small: true, color: PAL.bone }));
      rows.forEach((r) => ref.addChild(r));
      ref.position.set(REF_X, DOC_Y);
      layer.addChild(ref);
      // full title of the reference card (it can be long)
      layer.addChild(text(cur.ref.title, REF_X, DOC_Y + Math.max(60, y + 4) + 4, { small: true, color: PAL.ash, width: REF_W }));
    } else docNodeRef.node = null;

    // ------------------------------------------------ controls
    const ctl = new Container();
    ctl.position.set(4, DOC_Y + 156);
    ctl.addChild(box(112, 70, 0x2a1f18, 0x4a3628));
    ctl.addChild(button(ins.active ? 'INSPECTING (I)' : 'INSPECT (I)', 4, 4, 104, 14, () => toggleInspect(), { small: true, fill: ins.active ? PAL.gold : PAL.steel, disabled: !cur }));
    ctl.addChild(button('SIGN IT (A)', 4, 21, 104, 14, () => stamp('sign'), { small: true, fill: PAL.moss, disabled: !cur }));
    ctl.addChild(button(cur?.kind === 'sponsor' ? 'TURN DOWN (D)' : 'DISPUTE (D)', 4, 38, 104, 14, () => stamp('dispute'), { small: true, fill: PAL.blood, disabled: !cur }));
    ctl.addChild(button('DONE (ESC)', 4, 55, 104, 12, () => close(), { small: true, fill: PAL.shadow }));
    layer.addChild(ctl);

    // ------------------------------------------------ strip (what the inspection says)
    let line = msg?.text ?? '';
    let color = msg?.color ?? PAL.bone;
    if (!line && found) {
      line = 'DISCREPANCY: ' + found.text;
      color = PAL.blood;
    } else if (!line && ins.active) {
      line = ins.selected ? 'Now click the line it should match on the reference card.' : 'INSPECT: click a line on the document, then the line it should match.';
      color = PAL.gold;
    } else if (!line && cur) {
      line = 'Press INSPECT (I) to compare lines. Sign it (A) if it matches what you agreed; dispute it (D) if it does not.';
      color = PAL.ash;
    }
    if (line) {
      const t = text(line, 4, 3, { small: true, width: 236, color, maxLines: 3 });
      const sb = new Container();
      sb.addChild(box(244, t.textHeight + 7, PAL.ink, color));
      sb.addChild(t);
      sb.position.set(DOC_X - 2, H - t.textHeight - 9);
      layer.addChild(sb);
    }
    if (slip) layer.addChild(drawSlip());
    drawStrings();
  };

  const drawStrings = () => {
    strings.clear();
    if (ins.active) {
      for (const sp of ins.spots.values()) {
        if (sp.node.destroyed) continue;
        const bb = sp.node.getBounds();
        strings.rect(bb.x, bb.y, bb.width, bb.height).stroke({ color: PAL.gold, width: 1, alpha: 0.25 });
      }
      if (ins.selected) {
        const sp = ins.spots.get(ins.selected);
        if (sp && !sp.node.destroyed) {
          const bb = sp.node.getBounds();
          strings.rect(bb.x - 1, bb.y - 1, bb.width + 2, bb.height + 2).fill({ color: 0xf0e060, alpha: 0.2 }).stroke({ color: PAL.gold, width: 1 });
        }
      }
    }
    if (found) {
      const a = ins.center(found.a);
      const b = ins.center(found.b);
      if (a && b) strings.moveTo(a.x, a.y).lineTo(b.x, b.y).stroke({ color: PAL.blood, width: 2, alpha: 0.85 });
      for (const k of [found.a, found.b]) {
        const sp = ins.spots.get(k);
        if (!sp || sp.node.destroyed) continue;
        const bb = sp.node.getBounds();
        strings.rect(bb.x - 1, bb.y - 1, bb.width + 2, bb.height + 2).fill({ color: 0xff3030, alpha: 0.16 }).stroke({ color: PAL.blood, width: 1 });
      }
    }
  };

  const labelOf = (key: string): { side: 'doc' | 'ref'; label: string } | null => {
    if (!cur) return null;
    if (key.startsWith('doc.')) {
      const i = Number(key.slice(4));
      return Number.isNaN(i) ? { side: 'doc', label: 'From' } : { side: 'doc', label: cur.fields[i]?.label ?? '' };
    }
    if (key.startsWith('ref.')) return { side: 'ref', label: cur.ref.lines[Number(key.slice(4))]?.label ?? '' };
    return null;
  };

  const compare = (a: string, b: string) => {
    if (!cur) return;
    const A = labelOf(a);
    const B = labelOf(b);
    if (!A || !B) return;
    const docL = A.side === 'doc' ? A : B.side === 'doc' ? B : null;
    const refL = A.side === 'ref' ? A : B.side === 'ref' ? B : null;
    const problem = docL && refL ? comparePair(cur, docL.label, refL.label) : null;
    if (problem) {
      found = { a, b, text: problem };
      msg = null;
      sfx('bad');
      sfx('stamp');
      g.shake(1, 0.15);
    } else {
      sfx('click');
      msg = { text: docL && refL ? 'No discrepancy.' : 'Compare a line on the document with a line on the reference card.', color: PAL.ash, t: 1.6 };
    }
    draw();
  };

  const toggleInspect = () => {
    if (!cur) return;
    ins.active = !ins.active;
    ins.selected = null;
    sfx('click');
    draw();
  };

  const stamp = (action: 'sign' | 'dispute') => {
    if (!cur || stamping) return;
    const d = cur;
    const flagged = found && d.fault ? [d.fault] : [];
    const rng = new Rng(s.rng);
    const res = resolveDoc(s, d.id, action, flagged, rng);
    s.rng = rng.state;
    sfx('stamp');
    sfx('thud');
    g.shake(2, 0.12);
    // ink on the paper
    const node = docNodeRef.node;
    if (node && !node.destroyed) {
      const col = action === 'sign' ? PAL.moss : PAL.blood;
      const label = action === 'sign' ? 'SIGNED' : d.kind === 'sponsor' ? 'DECLINED' : 'DISPUTED';
      const ink = new Container();
      const t = text(label, 6, 5, { scale: 2, color: col });
      ink.addChild(new Graphics().rect(0, 0, t.textWidth + 12, 24).stroke({ color: col, width: 2 }));
      ink.addChild(t);
      ink.pivot.set((t.textWidth + 12) / 2, 12);
      ink.position.set(DOC_W / 2 + rng.int(-30, 30), 50 + rng.int(0, 30));
      ink.rotation = -0.25 + rng.next() * 0.2;
      ink.alpha = 0.9;
      node.addChild(ink);
      stamping = { t: 0, ink };
    }
    const title = res.good ? 'NOTICE' : d.kind === 'medical' || d.kind === 'bout' ? 'COMMISSION NOTICE' : 'BAD NEWS';
    setTimeout(() => {
      stamping = null;
      cur = st.inbox[0] ?? null;
      found = null;
      ins.selected = null;
      slip = { title, body: res.text || 'Filed.', good: res.good, node: null, t: 0 };
      sfx(res.good ? 'good' : 'citation');
      draw();
      g.autosave();
    }, 650);
  };

  /** The notice prints out above the strip. Click it to read the whole thing. */
  const drawSlip = (): Container => {
    const sl = slip!;
    const w = 150;
    const c = new Container();
    const body = text(sl.body, 6, 22, { small: true, width: w - 12, color: PAL.ink, maxLines: 4 });
    const more = text('CLICK TO READ IT ALL', 6, 0, { small: true, color: sl.good ? PAL.moss : PAL.blood });
    const h = 30 + body.textHeight + 10;
    more.y = h - 12;
    c.addChild(paper(w, h, sl.good ? 'white' : 'pink', 77));
    c.addChild(box(w, 10, sl.good ? PAL.moss : PAL.blood));
    c.addChild(text(sl.title, 4, 2, { small: true, color: PAL.bone }));
    c.addChild(text(sl.good ? 'FILED' : 'CONSEQUENCES', 6, 13, { small: true, color: sl.good ? PAL.moss : PAL.blood }));
    c.addChild(body, more);
    c.eventMode = 'static';
    c.cursor = 'pointer';
    c.on('pointertap', () => {
      const full = slip;
      slip = null;
      draw();
      if (full) alertBox(g, full.title, full.body);
    });
    c.position.set(DOC_X + (DOC_W - w) / 2, H - h - 34 + Math.round(Math.max(0, 1 - sl.t * 4) * (h + 24)));
    c.rotation = 0.015;
    sl.node = c;
    return c;
  };

  let closed = false;
  const close = () => {
    if (closed) return;
    closed = true;
    g.closeModal(wrap);
  };

  const popKeys = g.pushKeyHandler((e) => {
    if (g.modals[g.modals.length - 1] !== wrap) return false;
    const k = e.key.toLowerCase();
    if (k === 'i') toggleInspect();
    else if (k === 'a') stamp('sign');
    else if (k === 'd') stamp('dispute');
    else if (k === 'escape') close();
    else return false;
    return true;
  });
  const tick = (t: Ticker) => {
    const dt = t.deltaMS / 1000;
    if (stamping) stamping.t += dt;
    if (msg) {
      msg.t -= dt;
      if (msg.t <= 0) {
        msg = null;
        draw();
      }
    }
    if (slip?.node && !slip.node.destroyed && slip.t < 0.3) {
      slip.t += dt;
      const h = slip.node.height;
      slip.node.y = H - h - 34 + Math.round(Math.max(0, 1 - slip.t * 4) * (h + 24));
    }
  };
  g.app.ticker.add(tick);
  wrap.once('destroyed', () => {
    g.app.ticker.remove(tick);
    popKeys();
    onDone();
  });
  draw();
  if (!cur) msg = { text: 'Nothing to sign. Enjoy it while it lasts.', color: PAL.ash, t: 99 };
}
