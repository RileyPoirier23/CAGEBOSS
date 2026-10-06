/**
 * Converts procedural pixel buffers into cached Pixi textures/sprites.
 */
import { Sprite, Texture, Container, Graphics, Rectangle } from 'pixi.js';
import type { Fighter } from '../core/types';
import type { ReporterDef } from '../core/content';
import { drawPortrait, drawSignature, drawBarcode, PixelBuf, PortraitInput, PortraitVariant, P } from '../art/portrait';
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

export function portraitTexture(inp: PortraitInput): Texture {
  const w = inp.wounds;
  const key = `p:${inp.id}:${inp.variant}:${inp.attire}:${inp.age}:${Math.floor((inp.damage ?? 0) / 20)}:${JSON.stringify(inp.look)}:${w ? `${w.cuts}${w.blackEye}${w.swelling}${w.bandages}${w.noseBleed ? 1 : 0}` : ''}:${inp.accent ?? ''}`;
  const hit = cache.get(key);
  if (hit) return hit;
  return bufToTexture(drawPortrait(inp), key);
}

/** A framed portrait sprite. size: 64 (2x), 32 (1x) or 24 (cropped). */
export function portrait(inp: PortraitInput, size: 64 | 32 | 24 = 64, frame = true): Container {
  const c = new Container();
  const tex = portraitTexture(inp);
  let sp: Sprite;
  if (size === 24) {
    const sub = new Texture({ source: tex.source, frame: new Rectangle(4, 3, 24, 24) });
    sp = new Sprite(sub);
  } else {
    sp = new Sprite(tex);
    sp.scale.set(size / P);
  }
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
  return portrait({ id: r.id, look: r.look, gender: r.gender, age: 40, variant: 'reporter', attire: 'suit' }, size);
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
    head: h % 4, skin: (h >> 3) % 6, hair: kind === 'exec' ? (h >> 5) % 3 : (h >> 5) % 8, hairColor: (h >> 8) % 8, beard: (h >> 11) % 5,
    brows: (h >> 13) % 3, eyes: (h >> 15) % 3, nose: (h >> 17) % 2, ears: 0, scar: 0, tattoo: kind === 'manager' ? (h >> 19) % 3 : 0, build: (h >> 21) % 3,
  };
  const attire = kind === 'cop' ? 'jersey' : kind === 'fan' ? 'hoodie' : kind === 'doctor' ? 'shirt' : 'suit';
  const accent = kind === 'cop' ? 0x2c3a5a : kind === 'exec' ? PAL.steel : kind === 'lawyer' ? PAL.plum : undefined;
  return portrait({ id: seed, look, gender: (h >> 23) % 4 === 0 ? 'W' : 'M', age: 30 + ((h >> 4) % 30), variant: kind === 'cop' ? 'mugshot' : 'reporter', attire, accent }, size);
}
