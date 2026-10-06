/**
 * Pixel-art button prompt glyphs: Xbox-layout pad buttons (A/B/X/Y, bumpers,
 * triggers, View/Menu, d-pad, sticks) and keyboard keycaps. `prompt()` picks
 * the pad or keyboard glyph from the last device the player touched, so on-screen
 * hints can follow whatever they are holding.
 *
 *   c.addChild(prompt({ pad: 'A', key: 'Enter' }, 'Confirm', x, y));
 */
import { Container, Graphics } from 'pixi.js';
import { PAL } from '../art/palette';
import { text } from './kit';
import { input, type PadButton } from '../core/input';

export type GlyphName = PadButton | 'LStick' | 'RStick' | 'DPad';

const FACE: Partial<Record<PadButton, number>> = {
  A: 0x5f9a3c,
  B: 0xb0443a,
  X: 0x3f6fae,
  Y: 0xc9a13a,
};

const DISK9 = [5, 7, 9, 9, 9, 9, 9, 7, 5];

function disk(g: Graphics, x: number, y: number, color: number, rows = DISK9): void {
  const n = rows.length;
  rows.forEach((w, i) => g.rect(x + (n - w) / 2, y + i, w, 1).fill(color));
}

function centered(c: Container, label: string, w: number, h: number, color: number): void {
  const t = text(label, 0, 0, { small: true, color });
  t.x = Math.floor((w - t.textWidth) / 2);
  t.y = Math.floor((h - 5) / 2);
  c.addChild(t);
}

/** One pad glyph, ~9 px tall. */
export function padGlyph(name: GlyphName): Container {
  const c = new Container();
  const g = new Graphics();
  c.addChild(g);
  switch (name) {
    case 'A':
    case 'B':
    case 'X':
    case 'Y': {
      disk(g, 0, 1, 0x000000); // drop shadow
      disk(g, 0, 0, FACE[name]!);
      g.rect(2, 1, 2, 1).fill({ color: 0xffffff, alpha: 0.35 }); // shine
      centered(c, name, 9, 9, PAL.bone);
      break;
    }
    case 'LB':
    case 'RB': {
      g.rect(1, 0, 13, 8).fill(PAL.slate).rect(0, 1, 15, 6).fill(PAL.slate);
      g.rect(1, 7, 13, 1).fill(PAL.shadow);
      centered(c, name, 15, 8, PAL.bone);
      break;
    }
    case 'LT':
    case 'RT': {
      g.rect(3, 0, 9, 1).fill(PAL.slate).rect(1, 1, 13, 1).fill(PAL.slate).rect(0, 2, 15, 7).fill(PAL.slate);
      g.rect(0, 8, 15, 1).fill(PAL.shadow);
      centered(c, name, 15, 9, PAL.bone);
      break;
    }
    case 'View': {
      disk(g, 0, 0, PAL.slate);
      g.rect(2, 2, 4, 3).stroke({ color: PAL.bone, width: 1, alignment: 1 });
      g.rect(3, 4, 4, 3).fill(PAL.slate).rect(3, 4, 4, 3).stroke({ color: PAL.bone, width: 1, alignment: 1 });
      break;
    }
    case 'Menu': {
      disk(g, 0, 0, PAL.slate);
      for (let i = 0; i < 3; i++) g.rect(2, 2 + i * 2, 5, 1).fill(PAL.bone);
      break;
    }
    case 'Guide': {
      disk(g, 0, 0, PAL.moss);
      centered(c, 'X', 9, 9, PAL.bone);
      break;
    }
    case 'DPad':
    case 'Up':
    case 'Down':
    case 'Left':
    case 'Right': {
      g.rect(3, 0, 3, 9).fill(PAL.slate).rect(0, 3, 9, 3).fill(PAL.slate);
      const hi = PAL.bone;
      if (name === 'Up') g.rect(4, 1, 1, 2).fill(hi);
      if (name === 'Down') g.rect(4, 6, 1, 2).fill(hi);
      if (name === 'Left') g.rect(1, 4, 2, 1).fill(hi);
      if (name === 'Right') g.rect(6, 4, 2, 1).fill(hi);
      if (name === 'DPad') g.rect(4, 4, 1, 1).fill(PAL.shadow);
      break;
    }
    case 'LS':
    case 'RS':
    case 'LStick':
    case 'RStick': {
      disk(g, 0, 0, PAL.shadow);
      disk(g, 1, 1, PAL.slate, [3, 5, 7, 7, 7, 5, 3]);
      centered(c, name[0], 9, 9, PAL.bone);
      break;
    }
  }
  return c;
}

/** Keyboard keycap with a label ("ESC", "ENTER", "A"). */
export function keyGlyph(label: string): Container {
  const c = new Container();
  const t = text(label.toUpperCase(), 3, 2, { small: true, color: PAL.ink });
  const w = Math.max(9, t.textWidth + 6);
  const g = new Graphics()
    .rect(0, 1, w, 8).fill(PAL.grey)
    .rect(0, 0, w, 8).fill(PAL.fog)
    .rect(0, 0, w, 8).stroke({ color: PAL.ash, width: 1, alignment: 1 });
  t.x = Math.floor((w - t.textWidth) / 2);
  c.addChild(g, t);
  return c;
}

export interface PromptSpec {
  pad?: GlyphName;
  key?: string;
}

/**
 * A glyph (pad or key, whichever the player is using) followed by a label.
 * Re-create it when `input.on('device')` fires to keep it in sync.
 */
export function prompt(spec: PromptSpec, label: string, x = 0, y = 0, color: number = PAL.bone): Container {
  const c = new Container();
  const usePad = spec.pad && (input.lastDevice === 'gamepad' || !spec.key);
  const glyph = usePad ? padGlyph(spec.pad!) : spec.key ? keyGlyph(spec.key) : null;
  let gx = 0;
  if (glyph) {
    c.addChild(glyph);
    gx = Math.ceil(glyph.width) + 3;
  }
  if (label) c.addChild(text(label, gx, 2, { small: true, color }));
  c.position.set(Math.round(x), Math.round(y));
  return c;
}
