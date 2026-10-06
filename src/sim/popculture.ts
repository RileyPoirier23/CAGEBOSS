/**
 * Pop-culture parody bank (data/documents/popculture.json): {pop_movie},
 * {pop_musician}, {pop_food}... placeholders anywhere in game text resolve to
 * a parody name ("Rocko IV", "Bud Slight", "MrBeef").
 */
import { content } from '../core/content';

let salt = 0;

function pickIdx(n: number, seed: number): number {
  let h = (seed ^ 0x9e3779b9) >>> 0;
  h = Math.imul(h ^ (h >>> 16), 0x85ebca6b) >>> 0;
  h = Math.imul(h ^ (h >>> 13), 0xc2b2ae35) >>> 0;
  return ((h ^ (h >>> 16)) >>> 0) % n;
}

export function popKinds(): string[] {
  return Object.keys(content().popculture ?? {});
}

/** A parody name of the given kind ('' = any kind). Deterministic for a given seed. */
export function popRef(kind: string, seed: number): string {
  const bank = content().popculture ?? {};
  const kinds = kind && bank[kind]?.length ? [kind] : Object.keys(bank).filter((k) => bank[k].length);
  if (!kinds.length) return kind || 'something';
  const k = kinds[pickIdx(kinds.length, seed)];
  const list = bank[k];
  return list[pickIdx(list.length, seed * 31 + 7)].parody;
}

/**
 * Replace {pop}, {pop_movie} etc. Each occurrence gets its own pick. Pass a
 * seed for deterministic output (save/replay-stable text); omitted = varies.
 */
export function expandPop(text: string, seed?: number): string {
  if (!text.includes('{pop')) return text;
  let i = 0;
  const base = seed ?? ++salt * 2654435761;
  return text.replace(/\{pop(?:_(\w+))?\}/g, (_m, kind: string | undefined) => popRef(kind ?? '', (base + ++i * 7919) >>> 0));
}
