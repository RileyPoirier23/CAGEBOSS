/**
 * Higher level widgets that need the Game (modal windows, confirm dialogs,
 * DOM text inputs, option pickers).
 */
import { Container, Graphics } from 'pixi.js';
import type { Game } from './app';
import { PAL } from '../art/palette';
import { W, H, box, text, button, btn, paper, PaperKind, hoverTip } from './kit';
import { sfx } from '../audio/sfx';

export interface WindowOpts {
  paper?: PaperKind;
  onClose?: () => void;
  noClose?: boolean;
  dim?: number;
  x?: number;
  y?: number;
}

/** A centred modal window; returns the body container (local coords inside frame). */
export function openWindow(g: Game, title: string, w: number, h: number, opts: WindowOpts = {}): { body: Container; close: () => void; frame: Container } {
  const frame = new Container();
  const x = opts.x ?? Math.floor((W - w) / 2);
  const y = opts.y ?? Math.floor((H - h) / 2);
  frame.x = x;
  frame.y = y;
  if (opts.paper) frame.addChild(paper(w, h, opts.paper));
  else frame.addChild(box(w, h, PAL.night, PAL.ash, { shadow: true, bevel: true }));
  const titleBar = box(w, 12, opts.paper ? PAL.ink : PAL.shadow);
  frame.addChild(titleBar);
  frame.addChild(text(title.toUpperCase(), 4, 3, { small: true, color: PAL.bone }));
  const body = new Container();
  body.y = 14;
  frame.addChild(body);
  let closed = false;
  const wrap = g.modal(frame, { dim: opts.dim });
  const close = () => {
    if (closed) return;
    closed = true;
    g.closeModal(wrap);
    opts.onClose?.();
  };
  if (!opts.noClose) frame.addChild(button('X', w - 12, 1, 11, 10, close, { small: true, fill: PAL.blood }));
  return { body, close, frame };
}

export function confirm(g: Game, msg: string, onYes: () => void, yes = 'YES', no = 'NO'): void {
  const t = text(msg, 6, 4, { width: 188, color: PAL.bone });
  const h = t.textHeight + 40;
  const win = openWindow(g, 'Confirm', 200, h, { noClose: true });
  win.body.addChild(t);
  win.body.addChild(button(yes, 30, h - 30, 60, 13, () => { win.close(); onYes(); }, { fill: PAL.moss }));
  win.body.addChild(button(no, 110, h - 30, 60, 13, () => win.close(), { fill: PAL.blood }));
}

export function alertBox(g: Game, title: string, msg: string, onOk?: () => void): void {
  const t = text(msg, 6, 4, { width: 228, color: PAL.bone });
  const h = Math.min(250, t.textHeight + 40);
  const win = openWindow(g, title, 240, h, { noClose: true });
  win.body.addChild(t);
  win.body.addChild(button('OK', 90, h - 30, 60, 13, () => { win.close(); onOk?.(); }, { fill: PAL.slate }));
}

/** Horizontal option selector: [<] value [>] */
export function selector<T>(
  x: number, y: number, w: number, options: { value: T; label: string }[], current: T, onChange: (v: T) => void,
): Container {
  const c = new Container();
  c.x = x;
  c.y = y;
  let idx = Math.max(0, options.findIndex((o) => o.value === current));
  const label = text(options[idx].label, 14, 3, { width: w - 28, align: 'center', color: PAL.bone, maxLines: 1 });
  c.addChild(box(w, 13, PAL.ink, PAL.slate));
  c.addChild(label);
  const set = (d: number) => {
    idx = (idx + d + options.length) % options.length;
    label.setText(options[idx].label);
    onChange(options[idx].value);
  };
  c.addChild(button('<', 0, 0, 12, 13, () => set(-1), { small: true }));
  c.addChild(button('>', w - 12, 0, 12, 13, () => set(1), { small: true }));
  return c;
}

/** Numeric slider made of +/- buttons and a bar. */
export function stepper(x: number, y: number, w: number, value: number, min: number, max: number, step: number, fmt: (v: number) => string, onChange: (v: number) => void): Container {
  const c = new Container();
  c.x = x;
  c.y = y;
  let v = value;
  const bg = box(w, 13, PAL.ink, PAL.slate);
  c.addChild(bg);
  const fill = box(1, 9, PAL.steel);
  fill.x = 14;
  fill.y = 2;
  c.addChild(fill);
  const label = text(fmt(v), 14, 3, { width: w - 28, align: 'center', color: PAL.bone });
  c.addChild(label);
  const redraw = () => {
    label.setText(fmt(v));
    fill.width = Math.max(1, ((w - 28) * (v - min)) / (max - min || 1));
  };
  const set = (d: number) => {
    v = Math.max(min, Math.min(max, Math.round((v + d) / step) * step));
    redraw();
    onChange(v);
  };
  c.addChild(button('-', 0, 0, 12, 13, () => set(-step), { small: true }));
  c.addChild(button('+', w - 12, 0, 12, 13, () => set(step), { small: true }));
  redraw();
  return c;
}

export function checkbox(x: number, y: number, label: string, value: boolean, onChange: (v: boolean) => void, tip?: string): Container {
  let v = value;
  const c = new Container();
  c.x = x;
  c.y = y;
  const g = new Graphics();
  const mark = text('\u2713', 3, 2, { small: true, color: PAL.bone });
  const draw = () => {
    g.clear();
    g.rect(0, 0, 11, 11).fill(v ? PAL.moss : PAL.ink).stroke({ color: PAL.ash, width: 1, alignment: 1 });
    mark.visible = v;
  };
  c.addChild(g, mark);
  c.addChild(text(label, 15, 2, { color: PAL.bone }));
  draw();
  c.eventMode = 'static';
  c.cursor = 'pointer';
  c.on('pointertap', () => {
    v = !v;
    draw();
    sfx('click');
    onChange(v);
  });
  if (tip) hoverTip(c, tip);
  return c;
}

/** DOM text input overlaid on the canvas at game coordinates. */
export function domInput(
  g: Game, x: number, y: number, w: number, h: number, value: string, opts: { multiline?: boolean; maxLength?: number; onChange?: (v: string) => void } = {},
): { el: HTMLInputElement | HTMLTextAreaElement; remove: () => void; value: () => string } {
  const overlay = document.getElementById('dom-overlay')!;
  const el = document.createElement(opts.multiline ? 'textarea' : 'input') as HTMLInputElement | HTMLTextAreaElement;
  el.value = value;
  if (opts.maxLength) el.maxLength = opts.maxLength;
  overlay.appendChild(el);
  const place = () => {
    const r = g.overlayRect();
    const s = r.width / W;
    overlay.style.left = r.left + 'px';
    overlay.style.top = r.top + 'px';
    el.style.left = x * s + 'px';
    el.style.top = y * s + 'px';
    el.style.width = w * s + 'px';
    el.style.height = h * s + 'px';
    el.style.fontSize = Math.max(10, Math.floor(7 * s)) + 'px';
  };
  place();
  const onResize = () => place();
  window.addEventListener('resize', onResize);
  el.addEventListener('input', () => opts.onChange?.(el.value));
  el.addEventListener('keydown', (e) => e.stopPropagation());
  // The input belongs to whatever window (or scene) is on top right now. It goes away with it,
  // and hides while another window covers it, so it never floats over unrelated screens.
  const owner: Container | undefined = g.modals[g.modals.length - 1] ?? g.scene?.root;
  const ownerIsModal = g.modals.length > 0;
  const sync = () => {
    const covered = ownerIsModal ? g.modals[g.modals.length - 1] !== owner : g.modals.length > 0;
    el.style.display = covered ? 'none' : '';
  };
  g.app.ticker.add(sync);
  const remove = () => {
    g.app.ticker.remove(sync);
    window.removeEventListener('resize', onResize);
    el.remove();
  };
  owner?.once('destroyed', remove);
  return {
    el,
    value: () => el.value,
    remove,
  };
}

export function removeAllDomInputs(): void {
  const overlay = document.getElementById('dom-overlay');
  if (overlay) overlay.innerHTML = '';
}

/** Download a text file. */
export function downloadText(name: string, data: string): void {
  const blob = new Blob([data], { type: 'application/json' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = name;
  a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 2000);
}

/** Ask user for a file and read it as text. */
export function pickTextFile(onText: (s: string) => void): void {
  const input = document.createElement('input');
  input.type = 'file';
  input.accept = '.json,application/json';
  input.onchange = () => {
    const f = input.files?.[0];
    if (!f) return;
    f.text().then(onText);
  };
  input.click();
}

export function bigTitle(str: string, y: number, color: number = PAL.bone): Container {
  return text(str, 0, y, { scale: 2, width: W, align: 'center', color, shadow: PAL.ink });
}

export { btn, sfx, H };
