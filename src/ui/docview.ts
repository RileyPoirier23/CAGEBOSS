/**
 * Renders desk documents, file cards and rulebook entries as paper with
 * inspectable fields. Fields register their positions with an Inspector so
 * the desk can draw the "red string" between compared fields.
 */
import { Container, Graphics, FederatedPointerEvent } from 'pixi.js';
import type { DeskDoc, DocType } from '../core/types';
import { PAL, shade } from '../art/palette';
import { text, paper, PaperKind, box } from './kit';
import { signatureSprite, barcodeSprite, reporterPortrait } from './sprites';
import { content } from '../core/content';

export interface FieldSpot {
  key: string;
  label: string;
  node: Container;
  w: number;
  h: number;
}

export class Inspector {
  active = false;
  spots = new Map<string, FieldSpot>();
  selected: string | null = null;
  onCompare: (a: string, b: string) => void = () => {};
  onChange: () => void = () => {};

  register(spot: FieldSpot): void {
    this.spots.set(spot.key, spot);
    const n = spot.node;
    n.eventMode = 'static';
    n.cursor = 'pointer';
    n.on('pointertap', (e: FederatedPointerEvent) => {
      if (!this.active) return;
      e.stopPropagation();
      if (!this.selected) this.selected = spot.key;
      else if (this.selected === spot.key) this.selected = null;
      else {
        const a = this.selected;
        this.selected = null;
        this.onCompare(a, spot.key);
      }
      this.onChange();
    });
  }

  clear(): void {
    this.spots.clear();
    this.selected = null;
  }

  center(key: string): { x: number; y: number } | null {
    const s = this.spots.get(key);
    if (!s || s.node.destroyed) return null;
    const p = s.node.getGlobalPosition();
    return { x: p.x + s.w / 2, y: p.y + s.h / 2 };
  }
}

const PAPER_FOR: Record<DocType, PaperKind> = {
  bout: 'cream', medical: 'blue', drug: 'lab', visa: 'green', weighin: 'white', sponsor: 'gloss', police: 'carbon',
  expense: 'yellow', press: 'pink', memo: 'white', letter: 'cream', bail: 'carbon',
};

const HEADER_FOR: Record<DocType, number> = {
  bout: PAL.wood, medical: PAL.steel, drug: PAL.teal, visa: PAL.moss, weighin: PAL.ink, sponsor: PAL.plum, police: 0x3b3260,
  expense: PAL.ember, press: PAL.rust, memo: PAL.slate, letter: PAL.wood, bail: 0x3b3260,
};

/** Draw a single inspectable field. */
export function fieldNode(
  key: string, label: string, value: string, w: number, ins: Inspector | null, opts: { kind?: string; ink?: number; labelW?: number; small?: boolean } = {},
): { node: Container; h: number } {
  const c = new Container();
  const labelW = opts.labelW ?? 64;
  const lab = text(label.toUpperCase(), 2, 2, { small: true, color: PAL.grey, width: labelW - 4, maxLines: 2 });
  c.addChild(lab);
  let h = 10;
  const valW = w - labelW - 4;
  if (opts.kind === 'sig' && value.startsWith('sig:')) {
    const sp = signatureSprite(value);
    sp.x = labelW;
    sp.y = 0;
    c.addChild(sp);
    h = 11;
  } else if (opts.kind === 'barcode') {
    const sp = barcodeSprite(value);
    sp.x = labelW;
    sp.y = 1;
    c.addChild(sp);
    c.addChild(text(value, labelW + 44, 2, { small: true, color: opts.ink ?? PAL.ink }));
    h = 10;
  } else if (opts.kind === 'photo' && value.startsWith('face:')) {
    const rep = content().reporters.find((r) => r.id === value.slice(5));
    if (rep) {
      const p = reporterPortrait(rep, 24);
      p.x = labelW + 1;
      p.y = 1;
      c.addChild(p);
    }
    h = 27;
  } else {
    const small = opts.small || value.length > 60 || value.includes('\n');
    const t = text(value, labelW, small ? 2 : 1, { small, width: valW, color: opts.ink ?? PAL.ink });
    c.addChild(t);
    h = Math.max(10, t.textHeight + 4);
  }
  const hit = new Graphics().rect(0, 0, w, h).fill({ color: 0xffffff, alpha: 0.001 });
  c.addChildAt(hit, 0);
  if (ins) ins.register({ key, label, node: c, w, h });
  return { node: c, h };
}

export function renderDoc(d: DeskDoc, w: number, ins: Inspector | null, seed = 1): Container {
  const c = new Container();
  const inner = new Container();
  let y = 16;
  const rows: Container[] = [];
  for (const fd of d.fields) {
    const { node, h } = fieldNode(fd.key, fd.label, fd.value, w - 10, ins, { kind: fd.kind, labelW: d.type === 'memo' ? 30 : 64 });
    node.x = 5;
    node.y = y;
    rows.push(node);
    y += h + 2;
  }
  if (d.fine) {
    const fine = text(d.fine, 5, y + 4, { small: true, width: w - 10, color: shade(PAL.grey, 0.1) });
    rows.push(fine);
    y += fine.textHeight + 8;
  }
  if (d.overdue) {
    const od = text('OVERDUE', w - 60, y, { color: PAL.blood, scale: 1 });
    rows.push(od);
    y += 10;
  }
  const h = Math.max(120, y + 6);
  c.addChild(paper(w, h, PAPER_FOR[d.type] ?? 'cream', seed));
  c.addChild(box(w, 12, HEADER_FOR[d.type] ?? PAL.ink));
  c.addChild(text(d.title, 4, 3, { small: true, color: PAL.bone }));
  if (d.type === 'drug') c.addChild(text('LAB #44-B  CHAIN OF CUSTODY: SORTA', w - 100, 3, { small: true, color: PAL.bone }));
  for (const r of rows) inner.addChild(r);
  c.addChild(inner);
  return c;
}

const FILE_LABELS: Record<string, string> = {
  'file.name': 'Name', 'file.division': 'Division', 'file.limit': 'Limit', 'file.purse': 'Agreed purse', 'file.sig': 'Signature',
  'file.manager': 'Manager', 'file.suspension': 'Med. susp.', 'file.court': 'Court date', 'file.arrests': 'Record', 'file.country': 'Country',
  'file.fight': 'Next fight', 'file.sponsor': 'Sponsors', 'file.photo': 'Visitor', 'cal.fight': 'Fight night', 'cal.event': 'Event date',
};

/** The manila file card (what's on record for the doc's subject + calendar). */
export function renderFileCard(d: DeskDoc | null, w: number, ins: Inspector | null): Container {
  const c = new Container();
  const rows: Container[] = [];
  let y = 14;
  if (d) {
    const keys = Object.keys(d.refs).filter((k) => k.startsWith('file.') || k.startsWith('cal.'));
    // keep it relevant: show keys referenced by the doc type
    const wanted = relevantFileKeys(d.type).filter((k) => keys.includes(k));
    for (const k of wanted) {
      const v = d.refs[k];
      const { node, h } = fieldNode(k, FILE_LABELS[k] ?? k, v, w - 6, ins, { kind: k === 'file.sig' ? 'sig' : k === 'file.photo' ? 'photo' : undefined, labelW: 40, small: true });
      node.x = 3;
      node.y = y;
      rows.push(node);
      y += h + 1;
    }
  }
  c.addChild(paper(w, Math.max(60, y + 4), 'manila', 7));
  c.addChild(box(w, 11, PAL.woodDark));
  c.addChild(text(d?.subject || d?.type === 'press' ? 'ON FILE' : 'NO FILE', 3, 3, { small: true, color: PAL.bone }));
  rows.forEach((r) => c.addChild(r));
  return c;
}

export function relevantFileKeys(t: DocType): string[] {
  switch (t) {
    case 'bout': return ['file.name', 'file.division', 'file.purse', 'file.sig', 'file.manager', 'file.suspension', 'file.court'];
    case 'medical': return ['file.name', 'file.suspension', 'cal.fight'];
    case 'drug': return ['file.name'];
    case 'visa': return ['file.name', 'file.country', 'file.arrests', 'cal.event'];
    case 'weighin': return ['file.limit'];
    case 'sponsor': return ['file.name', 'file.sponsor'];
    case 'police': return ['file.name', 'file.fight'];
    case 'expense': return ['file.name', 'file.manager'];
    case 'press': return ['file.photo', 'file.name'];
    default: return [];
  }
}

const RULE_LABELS: Record<string, string> = {
  'rule.registry': 'Licensed reps', 'rule.exclusive': 'Exclusivity', 'rule.doctors': 'Physician registry', 'rule.scans': 'Required scans',
  'rule.validity': 'Medical validity', 'rule.tolerance': 'Weight tolerance', 'rule.banned': 'Banned list', 'rule.picogram': 'Picogram limit',
  'rule.strikes': 'Whereabouts', 'rule.bannedCats': 'Banned sponsors', 'rule.cap': 'Expense cap', 'rule.bannedReporters': 'Banned reporters',
  'rule.outlets': 'Accredited outlets', 'rule.court': 'Court dates', 'rule.visa': 'Visa rule',
};

export const PAGE_RULE_KEYS: Record<string, string[]> = {
  'Bout Agreements': ['rule.registry', 'rule.exclusive'],
  Medicals: ['rule.doctors', 'rule.scans', 'rule.validity'],
  'Weigh-Ins': ['rule.tolerance'],
  Sponsors: ['rule.bannedCats'],
  Expenses: ['rule.cap'],
  'Anti-Doping': ['rule.banned', 'rule.picogram', 'rule.strikes'],
  Media: ['rule.bannedReporters', 'rule.outlets'],
  Legal: ['rule.court'],
  Travel: ['rule.visa'],
};

export function ruleField(key: string, value: string, w: number, ins: Inspector | null): { node: Container; h: number } {
  return fieldNode(key, RULE_LABELS[key] ?? key, value, w, ins, { labelW: 52, small: true });
}
