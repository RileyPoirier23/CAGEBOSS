/**
 * Converts procedural pixel buffers into cached Pixi textures/sprites.
 */
import { Sprite, Texture, Container, Graphics, Rectangle } from 'pixi.js';
import type { Fighter } from '../core/types';
import type { ReporterDef } from '../core/content';
import { drawPortrait, drawSignature, drawBarcode, halfSize, PixelBuf, PortraitInput, PortraitVariant } from '../art/portrait';
import { PAL } from '../art/palette';

const cache = new Map<string, Texture>();

function bufToTexture(buf: PixelBuf, key: string): Texture {
  const hit = cache.get(key);
  if (hit) return hit;
  const c = document.createElement('canvas');
  c.width = buf.w;
  c.height = buf.h;
  const ctx = c.getContext('2d')!;
  const img = ctx.createImageData(buf.w, buf.h);
  img.data.set(buf.data);
  ctx.putImageData(img, 0, 0);
  const t = Texture.from(c);
  t.source.scaleMode = 'nearest';
  cache.set(key, t);
  if (cache.size > 600) {
    const k = cache.keys().next().value as string;
    cache.get(k)?.destroy(true);
    cache.delete(k);
  }
  return t;
}

export function portraitInputForFighter(f: Fighter, variant: PortraitVariant = 'plain'): PortraitInput {
  return {
    id: f.id,
    look: f.look,
    gender: f.gender,
    age: f.age,
    damage: f.damage,
    wounds: f.wounds,
    variant,
    attire: variant === 'mugshot' ? 'shirt' : variant === 'press' ? 'hoodie' : 'shirtless',
  };
}

/** Portrait texture: 64px master, or a box-filtered 32px version for small slots. */
export function portraitTexture(inp: PortraitInput, half = false): Texture {
  const w = inp.wounds;
  const key = `p:${half ? 'h' : 'f'}:${inp.id}:${inp.variant}:${inp.attire}:${inp.gender}:${inp.age}:${Math.floor((inp.damage ?? 0) / 20)}:${JSON.stringify(inp.look)}:${w ? `${w.cuts}${w.blackEye}${w.swelling}${w.bandages}${w.noseBleed ? 1 : 0}` : ''}:${inp.accent ?? ''}`;
  const hit = cache.get(key);
  if (hit) return hit;
  const buf = drawPortrait(inp);
  return bufToTexture(half ? halfSize(buf) : buf, key);
}

/** A framed portrait sprite. size: 64 (2x), 32 (1x) or 24 (cropped). */
export function portrait(inp: PortraitInput, size: 64 | 32 | 24 = 64, frame = true): Container {
  const c = new Container();
  let sp: Sprite;
  if (size === 24) {
    const tex = portraitTexture(inp, true);
    const sub = new Texture({ source: tex.source, frame: new Rectangle(4, 3, 24, 24) });
    sp = new Sprite(sub);
  } else sp = new Sprite(portraitTexture(inp, size === 32));
  if (frame) {
    const g = new Graphics().rect(-1, -1, size + 2, size + 2).fill(PAL.ink);
    c.addChild(g);
  }
  c.addChild(sp);
  return c;
}

export function fighterPortrait(f: Fighter, size: 64 | 32 | 24 = 64, variant: PortraitVariant = 'plain'): Container {
  return portrait(portraitInputForFighter(f, variant), size);
}

export function reporterPortrait(r: ReporterDef, size: 64 | 32 | 24 = 64): Container {
  return portrait({ id: r.id, look: r.look, gender: r.gender, age: (r as { age?: number }).age ?? 40, variant: 'reporter', attire: 'suit' }, size);
}

export function signatureSprite(seed: string): Sprite {
  const t = bufToTexture(drawSignature(seed), 'sig:' + seed);
  return new Sprite(t);
}

export function barcodeSprite(seed: string): Sprite {
  return new Sprite(bufToTexture(drawBarcode(seed), 'bar:' + seed));
}

/** Generic NPC portrait (managers, cops, execs) from a seed. */
export function npcPortrait(seed: string, kind: 'cop' | 'exec' | 'manager' | 'lawyer' | 'fan' | 'doctor', size: 64 | 32 | 24 = 64): Container {
  let h = 0;
  for (let i = 0; i < seed.length; i++) h = (h * 31 + seed.charCodeAt(i)) >>> 0;
  const look = {
    head: h % 4, skin: (h >>> 3) % 6, hair: kind === 'exec' ? (h >>> 5) % 3 : (h >>> 5) % 8, hairColor: (h >>> 8) % 8, beard: (h >>> 11) % 5,
    brows: (h >>> 13) % 3, eyes: (h >>> 15) % 3, nose: (h >>> 17) % 2, ears: 0, scar: 0, tattoo: kind === 'manager' ? (h >>> 19) % 3 : 0, build: (h >>> 21) % 3,
  };
  const attire = kind === 'cop' ? 'jersey' : kind === 'fan' ? 'hoodie' : kind === 'doctor' ? 'shirt' : 'suit';
  const accent = kind === 'cop' ? 0x2c3a5a : kind === 'exec' ? PAL.steel : kind === 'lawyer' ? PAL.plum : undefined;
  return portrait({ id: seed, look, gender: (h >>> 23) % 4 === 0 ? 'W' : 'M', age: 30 + ((h >>> 4) % 30), variant: kind === 'cop' ? 'mugshot' : 'reporter', attire, accent }, size);
}

/** Recurring named characters (storylets use portrait: 'npc:<key>'). */
export const NAMED_NPCS: Record<string, Omit<PortraitInput, 'id'>> = {
  // Jimmy Quavo: the steroid guy. Abibas tracksuit, beanie, eyes that never blink.
  jimmy_quavo: {
    look: { head: 0, skin: 2, hair: 0, hairColor: 0, beard: 1, brows: 2, eyes: 1, nose: 1, ears: 1, scar: 1, tattoo: 0, build: 1, beanie: 1, glasses: 0 },
    gender: 'M', age: 34, variant: 'reporter', attire: 'tracksuit',
  },
  // Bradie "Biggest Bird" Taylor: Only Fighters CEO, curly mess, permanently stoned.
  bradie_taylor: {
    look: { head: 1, skin: 1, hair: 8, hairColor: 3, beard: 1, brows: 0, eyes: 2, nose: 2, ears: 2, scar: 1, tattoo: 0, build: 1, stoned: 1 },
    gender: 'M', age: 41, variant: 'reporter', attire: 'hoodie', accent: 0x2aa0d8,
  },
  // Road To Champion's cast.
  // Uncle Ray: seventy, grey ponytail and a big grey beard, a nose that lost to Butch in '87.
  uncle_ray: {
    look: { head: 2, skin: 1, hair: 7, hairColor: 7, beard: 3, brows: 1, eyes: 0, nose: 2, ears: 2, scar: 1, tattoo: 0, build: 2 },
    gender: 'M', age: 70, variant: 'reporter', attire: 'shirt', accent: 0x6a5a48,
  },
  // Dane Whyte: the CBFC boss. Bald, black suit, no tie, permanently on the phone.
  dane_whyte: {
    look: { head: 1, skin: 0, hair: 0, hairColor: 0, beard: 0, brows: 2, eyes: 1, nose: 1, ears: 0, scar: 0, tattoo: 0, build: 2 },
    gender: 'M', age: 54, variant: 'reporter', attire: 'suit', accent: 0x15151a,
  },
  // Gordon Vance: the landlord (Tyler's dad). Silver side-part, navy three-piece.
  gordon_vance: {
    look: { head: 3, skin: 0, hair: 3, hairColor: 6, beard: 0, brows: 0, eyes: 2, nose: 0, ears: 0, scar: 0, tattoo: 0, build: 1, widow: 1 },
    gender: 'M', age: 58, variant: 'reporter', attire: 'suit', accent: 0x1c2848,
  },
  // the Lounge producer: headset, black tee, no sleep since 2019
  lounge_producer: {
    look: { head: 0, skin: 4, hair: 1, hairColor: 0, beard: 2, brows: 1, eyes: 2, nose: 1, ears: 0, scar: 0, tattoo: 0, build: 1, glasses: 2 },
    gender: 'M', age: 33, variant: 'reporter', attire: 'jersey', accent: 0x18181c,
  },
  // Xavier "Allstar" Cockett: cowboy hat, big beard, a pearl-snap shirt (played by Xavier Hockett)
  xavier_cockett: {
    look: { head: 1, skin: 1, hair: 2, hairColor: 1, beard: 3, brows: 1, eyes: 1, nose: 1, ears: 0, scar: 0, tattoo: 0, build: 1, hat: 1 },
    gender: 'M', age: 29, variant: 'reporter', attire: 'shirt',
  },
  // "Dirty" Daniel Stinkovich: curly mop, a bit pudgy, glasses on the job, referee black (played by Daniel Reed)
  dirty_daniel: {
    look: { head: 0, skin: 0, hair: 8, hairColor: 1, beard: 0, brows: 0, eyes: 2, nose: 1, ears: 0, scar: 0, tattoo: 0, build: 2, glasses: 2 },
    gender: 'M', age: 31, variant: 'reporter', attire: 'jersey', accent: 0x141418,
  },
  // Lenny Pratt: Zac's manager. Mustard suit, slick hair, a moustache he thinks is charming
  lenny_pratt: {
    look: { head: 2, skin: 1, hair: 3, hairColor: 0, beard: 4, brows: 2, eyes: 2, nose: 1, ears: 0, scar: 0, tattoo: 0, build: 2 },
    gender: 'M', age: 52, variant: 'reporter', attire: 'suit', accent: 0x8a6a1a,
  },
  // Mateo: twelve, a hoodie three sizes too big, a fighter's stare
  mateo: {
    look: { head: 0, skin: 3, hair: 2, hairColor: 0, beard: 0, brows: 2, eyes: 0, nose: 0, ears: 0, scar: 0, tattoo: 0, build: 0 },
    gender: 'M', age: 18, variant: 'reporter', attire: 'hoodie', accent: 0xb8733a,
  },
};

export function namedPortrait(key: string, size: 64 | 32 | 24 = 64): Container | null {
  const n = NAMED_NPCS[key];
  return n ? portrait({ id: 'npc_' + key, ...n }, size) : null;
}
