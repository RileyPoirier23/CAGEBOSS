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

  constructor(
    private str: string,
    private opts: TextOpts = {},
  ) {
    super();
    this.face = opts.small ? SMALL_FACE : MAIN_FACE;
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
    const face = this.face;
    const atlas = atlasFor(face);
    const color = this.opts.color ?? 0xe6dcc4;
    const scale = this.opts.scale ?? 1;
    const text = normalizeText(this.str ?? '');
    let lines = this.opts.width ? wrapText(face, text, Math.floor(this.opts.width / scale)) : text.split('\n');
    if (this.opts.maxLines && lines.length > this.opts.maxLines) {
      lines = lines.slice(0, this.opts.maxLines);
      lines[lines.length - 1] = lines[lines.length - 1].replace(/.{0,3}$/, '...');
    }
    this.lines = lines;
    const lh = face.lineHeight + (this.opts.lineGap ?? 0);
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
              s.y = (li * lh + offset) * scale;
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
    this.textWidth = (this.opts.width ? Math.floor(this.opts.width / scale) : maxW) * scale;
    this.textHeight = (lines.length * lh - (lh - face.cellHeight + 2)) * scale;
  }
}

export function measure(text: string, small = false): number {
  return measureLine(small ? SMALL_FACE : MAIN_FACE, text);
}

export function wrap(text: string, width: number, small = false): string[] {
  return wrapText(small ? SMALL_FACE : MAIN_FACE, text, width);
}

export function lineHeight(small = false): number {
  return (small ? SMALL_FACE : MAIN_FACE).lineHeight;
}

/** Colour markup helper. */
export function col(c: number, s: string): string {
  return `{#${c.toString(16).padStart(6, '0')}}${s}{/}`;
}
