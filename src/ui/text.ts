/**
 * Pixel text rendering. Glyphs from fontdata.ts are rasterised once into an
 * atlas texture; text blocks are containers of tinted glyph sprites, so every
 * character lands on the pixel grid.
 */
import { Container, Rectangle, Sprite, Texture } from 'pixi.js';
import {
  FontFace, MAIN_FACE, SMALL_FACE, charWidth, glyphFor, normalizeText, wrapText, measureLine,
} from '../art/fontdata';

interface Atlas {
  base: Texture;
  glyphs: Map<string, Texture>;
}

const atlases = new Map<string, Atlas>();

/**
 * HD small text: the renderer draws at the integer window scale, so "small"
 * text is drawn with the main face at ~2/3 size, landing on whole device
 * pixels. That keeps the pixel look but gives fine print real lowercase,
 * descenders and readable letterforms instead of a 3x5 caps face.
 */
const SMALL_NOMINAL = 2 / 3;
const SMALL_LH = 7;
let resolution = 1;
const live = new Set<PixelText>();

export function setTextResolution(r: number): void {
  if (Math.abs(r - resolution) < 1e-6) return;
  resolution = r;
  for (const t of [...live]) {
    if (t.destroyed) live.delete(t);
    else t.rebuild();
  }
}

/** Actual small-text glyph pixel size in logical units (whole device pixels, never larger than nominal). */
function smallK(): number {
  const px = Math.floor(resolution * SMALL_NOMINAL + 1e-6);
  return px >= 1 ? px / resolution : 0;
}

function buildAtlas(face: FontFace): Atlas {
  const chars = Object.keys(face.glyphs);
  const cellW = 8;
  const cols = 16;
  const rows = Math.ceil(chars.length / cols);
  const canvas = document.createElement('canvas');
  canvas.width = cols * cellW;
  canvas.height = rows * (face.cellHeight + 1);
  const ctx = canvas.getContext('2d')!;
  ctx.fillStyle = '#ffffff';
  const rects = new Map<string, Rectangle>();
  chars.forEach((ch, i) => {
    const g = face.glyphs[ch];
    const ox = (i % cols) * cellW;
    const oy = Math.floor(i / cols) * (face.cellHeight + 1);
    g.forEach((row, y) => {
      for (let x = 0; x < row.length; x++) if (row[x] === '#') ctx.fillRect(ox + x, oy + y, 1, 1);
    });
    rects.set(ch, new Rectangle(ox, oy, g[0].length, face.cellHeight));
  });
  const base = Texture.from(canvas);
  base.source.scaleMode = 'nearest';
  const glyphs = new Map<string, Texture>();
  rects.forEach((r, ch) => glyphs.set(ch, new Texture({ source: base.source, frame: r })));
  return { base, glyphs };
}

function atlasFor(face: FontFace): Atlas {
  let a = atlases.get(face.name);
  if (!a) atlases.set(face.name, (a = buildAtlas(face)));
  return a;
}

export type Align = 'left' | 'center' | 'right';

export interface TextOpts {
  color?: number;
  small?: boolean;
  scale?: number;
  width?: number; // wrap width in px (unscaled)
  align?: Align;
  lineGap?: number;
  maxLines?: number;
  shadow?: number; // shadow colour
}

export class PixelText extends Container {
  lines: string[] = [];
  textWidth = 0;
  textHeight = 0;
  private face: FontFace;
  private hd = false;

  constructor(
    private str: string,
    private opts: TextOpts = {},
  ) {
    super();
    this.face = MAIN_FACE;
    this.build();
    if (opts.small) {
      live.add(this);
      this.on('destroyed', () => live.delete(this));
    }
  }

  rebuild(): void {
    this.removeChildren().forEach((c) => c.destroy());
    this.build();
  }

  setText(s: string): void {
    if (s === this.str) return;
    this.str = s;
    this.removeChildren().forEach((c) => c.destroy());
    this.build();
  }

  setColor(c: number): void {
    this.opts.color = c;
    this.removeChildren().forEach((ch) => ch.destroy());
    this.build();
  }

  private build(): void {
    const small = !!this.opts.small;
    const k = small ? smallK() : 1;
    this.hd = small && k > 0;
    this.face = small && !this.hd ? SMALL_FACE : MAIN_FACE;
    const face = this.face;
    const atlas = atlasFor(face);
    const color = this.opts.color ?? 0xe6dcc4;
    // glyph pixel size in logical units; layout (wrapping) always uses the nominal size
    const scale = (this.opts.scale ?? 1) * (this.hd ? k : 1);
    const layoutScale = (this.opts.scale ?? 1) * (this.hd ? SMALL_NOMINAL : 1);
    let text = normalizeText(this.str ?? '');
    // single-line small text reads as a label: keep the small-caps look
    if (small && !this.opts.width) text = upperKeepMarkup(text);
    let lines = this.opts.width ? wrapText(face, text, Math.floor(this.opts.width / layoutScale)) : text.split('\n');
    if (this.opts.maxLines && lines.length > this.opts.maxLines) {
      lines = lines.slice(0, this.opts.maxLines);
      lines[lines.length - 1] = lines[lines.length - 1].replace(/.{0,3}$/, '...');
    }
    this.lines = lines;
    // line height in glyph pixels (small HD text keeps the old 7px logical pitch)
    const lh = this.hd ? (SMALL_LH + (this.opts.lineGap ?? 0)) / k : face.lineHeight + (this.opts.lineGap ?? 0);
    let curColor = color;
    let maxW = 0;
    const layers: [number, number][] = this.opts.shadow !== undefined ? [[1, this.opts.shadow], [0, -1]] : [[0, -1]];
    for (const [offset, shadowColor] of layers) {
      curColor = color;
      lines.forEach((line, li) => {
        const lineW = measureLine(face, line);
        maxW = Math.max(maxW, lineW);
        let x = 0;
        const boxW = this.opts.width ? Math.floor(this.opts.width / scale) : lineW;
        const rowY = this.hd ? Math.round(li * lh * k * resolution) / resolution / scale : li * lh;
        if (this.opts.align === 'center') x = Math.floor((boxW - lineW) / 2);
        else if (this.opts.align === 'right') x = boxW - lineW;
        let i = 0;
        let first = true;
        while (i < line.length) {
          if (line[i] === '{') {
            const m = /^\{#([0-9a-fA-F]{6})\}/.exec(line.slice(i));
            if (m) {
              curColor = parseInt(m[1], 16);
              i += m[0].length;
              continue;
            }
            if (line.startsWith('{/}', i)) {
              curColor = color;
              i += 3;
              continue;
            }
          }
          const ch = line[i];
          if (!first) x += face.letterSpacing;
          first = false;
          if (ch !== ' ') {
            const key = face.upperOnly ? ch.toUpperCase() : ch;
            const tex = atlas.glyphs.get(key) ?? atlas.glyphs.get('?');
            if (tex) {
              const s = new Sprite(tex);
              s.x = (x + offset) * scale;
              s.y = (rowY + offset) * scale;
              s.scale.set(scale);
              s.tint = shadowColor >= 0 ? shadowColor : curColor;
              this.addChild(s);
            }
          }
          x += ch === ' ' ? face.spaceWidth : charWidth(face, glyphFor(face, ch) ? ch : '?');
          i++;
        }
      });
    }
    if (this.hd) {
      this.textWidth = this.opts.width ? this.opts.width : Math.ceil(maxW * scale);
      this.textHeight = Math.max(0, lines.length * SMALL_LH - 2) * (this.opts.scale ?? 1);
    } else {
      this.textWidth = (this.opts.width ? Math.floor(this.opts.width / scale) : maxW) * scale;
      this.textHeight = (lines.length * lh - (lh - face.cellHeight + 2)) * scale;
    }
  }
}

function upperKeepMarkup(s: string): string {
  return s.replace(/(\{#[0-9a-fA-F]{6}\}|\{\/\})|([^{]+|\{)/g, (_m, tag, txt) => tag ?? txt.toUpperCase());
}

/** Layout width of a single line. Small text measures as an (upper-cased) label at nominal size. */
export function measure(text: string, small = false): number {
  if (!small) return measureLine(MAIN_FACE, text);
  return Math.ceil(measureLine(MAIN_FACE, upperKeepMarkup(normalizeText(text))) * SMALL_NOMINAL);
}

export function wrap(text: string, width: number, small = false): string[] {
  if (!small) return wrapText(MAIN_FACE, text, width);
  return wrapText(MAIN_FACE, text, Math.floor(width / SMALL_NOMINAL));
}

export function lineHeight(small = false): number {
  return small ? SMALL_LH : MAIN_FACE.lineHeight;
}

/** Colour markup helper. */
export function col(c: number, s: string): string {
  return `{#${c.toString(16).padStart(6, '0')}}${s}{/}`;
}
