/**
 * Minimal pixel UI toolkit on top of Pixi: panels, paper, buttons, scroll
 * boxes, meters. Everything snaps to integer pixels at 480x270.
 */
import { Container, Graphics, Sprite, Texture, FederatedPointerEvent, FederatedWheelEvent } from 'pixi.js';
import { PAL, C, shade } from '../art/palette';
import { PixelText, TextOpts, measure } from './text';
import { sfx } from '../audio/sfx';

export const W = 480;
export const H = 270;

export function box(
  w: number, h: number, fill: number, border?: number, opts: { alpha?: number; shadow?: boolean; bevel?: boolean } = {},
): Graphics {
  const g = new Graphics();
  if (opts.shadow) g.rect(2, 2, w, h).fill({ color: 0x000000, alpha: 0.35 });
  g.rect(0, 0, w, h).fill({ color: fill, alpha: opts.alpha ?? 1 });
  if (opts.bevel) {
    g.rect(0, 0, w, 1).fill(shade(fill, 0.18));
    g.rect(0, 0, 1, h).fill(shade(fill, 0.12));
    g.rect(0, h - 1, w, 1).fill(shade(fill, -0.3));
    g.rect(w - 1, 0, 1, h).fill(shade(fill, -0.25));
  }
  if (border !== undefined) g.rect(0, 0, w, h).stroke({ color: border, width: 1, alignment: 1 });
  return g;
}

export function text(str: string, x: number, y: number, opts: TextOpts = {}): PixelText {
  const t = new PixelText(str, opts);
  t.x = Math.round(x);
  t.y = Math.round(y);
  return t;
}

// ---------------------------------------------------------------- paper textures

const paperCache = new Map<string, Texture>();

export type PaperKind =
  | 'cream' | 'blue' | 'lab' | 'carbon' | 'news' | 'gloss' | 'pink' | 'yellow' | 'white' | 'manila' | 'cork' | 'green';

const PAPER_BASE: Record<PaperKind, number> = {
  cream: PAL.paper,
  blue: 0xa9b8c4,
  lab: 0xd9d7cf,
  carbon: 0xc9c2d4,
  news: PAL.newsprint,
  gloss: 0xe2dccf,
  pink: 0xd8b5ae,
  yellow: 0xd9c98a,
  white: 0xe3ddd0,
  manila: 0xc9a86a,
  cork: 0x9b7448,
  green: 0xb4c2a2,
};

export function paperTexture(w: number, h: number, kind: PaperKind, seed = 1): Texture {
  const k = `${kind}:${w}x${h}:${seed}`;
  const hit = paperCache.get(k);
  if (hit) return hit;
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  const ctx = c.getContext('2d')!;
  const base = PAPER_BASE[kind];
  ctx.fillStyle = '#' + base.toString(16).padStart(6, '0');
  ctx.fillRect(0, 0, w, h);
  let s = (seed * 9301 + w * 49297 + h * 233) % 233280;
  const rnd = () => ((s = (s * 9301 + 49297) % 233280) / 233280);
  const speck = kind === 'cork' ? 0.12 : 0.035;
  for (let i = 0; i < w * h * speck; i++) {
    const x = Math.floor(rnd() * w);
    const y = Math.floor(rnd() * h);
    const v = rnd();
    const col = v < 0.5 ? shade(base, -0.07 - rnd() * 0.08) : shade(base, 0.05 + rnd() * 0.05);
    ctx.fillStyle = '#' + col.toString(16).padStart(6, '0');
    ctx.fillRect(x, y, 1, 1);
  }
  if (kind === 'blue' || kind === 'lab' || kind === 'green') {
    ctx.fillStyle = '#' + shade(base, -0.08).toString(16).padStart(6, '0');
    for (let y = 14; y < h - 2; y += 9) ctx.fillRect(2, y, w - 4, 1);
  }
  if (kind === 'carbon') {
    ctx.fillStyle = 'rgba(60,40,90,0.08)';
    for (let i = 0; i < 6; i++) ctx.fillRect(Math.floor(rnd() * w), 0, 1 + Math.floor(rnd() * 3), h);
  }
  // edges
  ctx.fillStyle = '#' + shade(base, -0.22).toString(16).padStart(6, '0');
  ctx.fillRect(0, h - 1, w, 1);
  ctx.fillRect(w - 1, 0, 1, h);
  ctx.fillStyle = '#' + shade(base, 0.12).toString(16).padStart(6, '0');
  ctx.fillRect(0, 0, w, 1);
  const tex = Texture.from(c);
  tex.source.scaleMode = 'nearest';
  paperCache.set(k, tex);
  if (paperCache.size > 400) {
    const first = paperCache.keys().next().value as string;
    paperCache.delete(first);
  }
  return tex;
}

export function paper(w: number, h: number, kind: PaperKind = 'cream', seed = 1): Container {
  const c = new Container();
  const sh = new Graphics().rect(2, 2, w, h).fill({ color: 0x000000, alpha: 0.35 });
  c.addChild(sh);
  c.addChild(new Sprite(paperTexture(w, h, kind, seed)));
  return c;
}

// ---------------------------------------------------------------- buttons

export interface ButtonOpts {
  fill?: number;
  textColor?: number;
  border?: number;
  small?: boolean;
  disabled?: boolean;
  tooltip?: string;
  sound?: boolean;
  align?: 'center' | 'left';
}

export class Button extends Container {
  private bg: Graphics;
  private labelNode: PixelText;
  private hovered = false;
  disabled: boolean;

  constructor(
    public labelText: string,
    public w: number,
    public h: number,
    public onClick: () => void,
    public opts: ButtonOpts = {},
  ) {
    super();
    this.disabled = !!opts.disabled;
    this.bg = new Graphics();
    this.addChild(this.bg);
    const small = !!opts.small;
    this.labelNode = new PixelText(labelText, {
      small,
      color: this.disabled ? PAL.grey : (opts.textColor ?? PAL.bone),
      width: opts.align === 'left' ? undefined : w,
      align: opts.align === 'left' ? 'left' : 'center',
      maxLines: 1,
    });
    this.labelNode.x = opts.align === 'left' ? 4 : 0;
    this.labelNode.y = Math.floor((h - (small ? 5 : 7)) / 2);
    this.addChild(this.labelNode);
    this.eventMode = 'static';
    this.cursor = this.disabled ? 'default' : 'pointer';
    this.on('pointerover', () => {
      this.hovered = true;
      this.draw();
      if (opts.tooltip) tooltip.show(opts.tooltip);
    });
    this.on('pointerout', () => {
      this.hovered = false;
      this.draw();
      if (opts.tooltip) tooltip.hide();
    });
    this.on('pointertap', (e: FederatedPointerEvent) => {
      e.stopPropagation();
      if (this.disabled) {
        sfx('error');
        return;
      }
      if (opts.sound !== false) sfx('click');
      tooltip.hide();
      this.onClick();
    });
    this.draw();
  }

  setDisabled(d: boolean): void {
    this.disabled = d;
    this.cursor = d ? 'default' : 'pointer';
    this.labelNode.setColor(d ? PAL.grey : (this.opts.textColor ?? PAL.bone));
    this.draw();
  }

  private draw(): void {
    const fill = this.opts.fill ?? PAL.slate;
    const f = this.disabled ? shade(fill, -0.35) : this.hovered ? shade(fill, 0.15) : fill;
    const g = this.bg;
    g.clear();
    g.rect(1, 1, this.w, this.h).fill({ color: 0x000000, alpha: 0.4 });
    g.rect(0, 0, this.w, this.h).fill(f);
    g.rect(0, 0, this.w, 1).fill(shade(f, 0.2));
    g.rect(0, this.h - 1, this.w, 1).fill(shade(f, -0.35));
    g.rect(0, 0, this.w, this.h).stroke({ color: this.opts.border ?? PAL.ink, width: 1, alignment: 1 });
  }
}

export function button(label: string, x: number, y: number, w: number, h: number, onClick: () => void, opts: ButtonOpts = {}): Button {
  const b = new Button(label, w, h, onClick, opts);
  b.x = x;
  b.y = y;
  return b;
}

/** Auto-sized button. */
export function btn(label: string, x: number, y: number, onClick: () => void, opts: ButtonOpts = {}): Button {
  const w = measure(label, opts.small) + (opts.small ? 8 : 10);
  return button(label, x, y, w, opts.small ? 11 : 14, onClick, opts);
}

/** Make any display object clickable. */
export function clickable<T extends Container>(obj: T, onClick: (e: FederatedPointerEvent) => void, tip?: string): T {
  obj.eventMode = 'static';
  obj.cursor = 'pointer';
  obj.on('pointertap', (e: FederatedPointerEvent) => {
    e.stopPropagation();
    tooltip.hide();
    onClick(e);
  });
  if (tip) {
    obj.on('pointerover', () => tooltip.show(tip));
    obj.on('pointerout', () => tooltip.hide());
  }
  return obj;
}

export function hoverTip<T extends Container>(obj: T, tip: string | (() => string)): T {
  obj.eventMode = obj.eventMode === 'none' || obj.eventMode === 'passive' || !obj.eventMode ? 'static' : obj.eventMode;
  obj.on('pointerover', () => tooltip.show(typeof tip === 'function' ? tip() : tip));
  obj.on('pointerout', () => tooltip.hide());
  return obj;
}

// ---------------------------------------------------------------- meter bar

export function meterBar(w: number, value: number, color: number, h = 4): Graphics {
  const g = new Graphics();
  g.rect(0, 0, w, h).fill(PAL.ink);
  const fillW = Math.max(0, Math.min(w - 2, Math.round(((w - 2) * value) / 100)));
  g.rect(1, 1, fillW, h - 2).fill(color);
  return g;
}

// ---------------------------------------------------------------- scroll box

export class ScrollBox extends Container {
  content = new Container();
  private maskG: Graphics;
  private bar: Graphics;
  scrollY = 0;
  private dragging: { y: number; start: number } | null = null;

  constructor(
    public w: number,
    public h: number,
  ) {
    super();
    this.maskG = new Graphics().rect(0, 0, w, h).fill(0xffffff);
    this.addChild(this.maskG);
    this.addChild(this.content);
    this.content.mask = this.maskG;
    this.bar = new Graphics();
    this.addChild(this.bar);
    this.eventMode = 'static';
    this.hitArea = { contains: (x: number, y: number) => x >= 0 && y >= 0 && x < w && y < h };
    this.on('wheel', (e: FederatedWheelEvent) => {
      this.scrollTo(this.scrollY + Math.sign(e.deltaY) * 20);
      e.stopPropagation();
    });
    this.on('pointerdown', (e: FederatedPointerEvent) => {
      if (e.pointerType === 'touch') this.dragging = { y: e.global.y, start: this.scrollY };
    });
    this.on('globalpointermove', (e: FederatedPointerEvent) => {
      if (this.dragging) this.scrollTo(this.dragging.start - (e.global.y - this.dragging.y));
    });
    this.on('pointerup', () => (this.dragging = null));
    this.on('pointerupoutside', () => (this.dragging = null));
  }

  get contentHeight(): number {
    let maxY = 0;
    for (const c of this.content.children) {
      const b = (c as Container).getLocalBounds?.();
      maxY = Math.max(maxY, c.y + (b ? b.y + b.height : 0));
    }
    return maxY;
  }

  scrollTo(y: number): void {
    const max = Math.max(0, this.contentHeight - this.h + 4);
    this.scrollY = Math.max(0, Math.min(max, Math.round(y)));
    this.content.y = -this.scrollY;
    this.drawBar(max);
  }

  refresh(): void {
    this.scrollTo(this.scrollY);
  }

  private drawBar(max: number): void {
    this.bar.clear();
    if (max <= 0) return;
    const trackH = this.h;
    const thumbH = Math.max(10, Math.round((this.h / (this.h + max)) * trackH));
    const y = Math.round((this.scrollY / max) * (trackH - thumbH));
    this.bar.rect(this.w - 3, 0, 3, trackH).fill({ color: 0x000000, alpha: 0.3 });
    this.bar.rect(this.w - 3, y, 3, thumbH).fill(PAL.ash);
  }
}

// ---------------------------------------------------------------- tooltip

class Tooltip {
  layer: Container | null = null;
  private node: Container | null = null;
  private pos = { x: 0, y: 0 };

  attach(layer: Container): void {
    this.layer = layer;
  }

  move(x: number, y: number): void {
    this.pos = { x, y };
    if (this.node) this.place();
  }

  show(textStr: string): void {
    if (!this.layer) return;
    this.hide();
    const t = new PixelText(textStr, { width: 150, color: PAL.ink });
    const w = Math.min(154, t.textWidth + 6);
    const h = t.textHeight + 7;
    const c = new Container();
    c.addChild(box(w, h, PAL.bone, PAL.ink, { shadow: true }));
    t.x = 3;
    t.y = 3;
    c.addChild(t);
    this.node = c;
    this.layer.addChild(c);
    this.place();
  }

  private place(): void {
    if (!this.node) return;
    const b = this.node.getLocalBounds();
    let x = this.pos.x + 8;
    let y = this.pos.y + 10;
    if (x + b.width > W - 2) x = this.pos.x - b.width - 4;
    if (y + b.height > H - 2) y = this.pos.y - b.height - 4;
    this.node.x = Math.max(1, Math.round(x));
    this.node.y = Math.max(1, Math.round(y));
  }

  hide(): void {
    if (this.node) {
      this.node.destroy({ children: true });
      this.node = null;
    }
  }
}

export const tooltip = new Tooltip();

// ---------------------------------------------------------------- misc helpers

export function hline(w: number, color: number = PAL.ink): Graphics {
  return new Graphics().rect(0, 0, w, 1).fill(color);
}

export function clearChildren(c: Container): void {
  c.removeChildren().forEach((ch) => ch.destroy({ children: true }));
}

/** Simple blocking dim layer for modals. */
export function dimmer(alpha = 0.6, onClick?: () => void): Graphics {
  const g = new Graphics().rect(0, 0, W, H).fill({ color: 0x000000, alpha });
  g.eventMode = 'static';
  if (onClick) g.on('pointertap', onClick);
  return g;
}

export { C, PAL };
