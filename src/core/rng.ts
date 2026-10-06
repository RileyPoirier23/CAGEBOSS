/**
 * Seeded RNG (mulberry32). The whole game state carries a single uint32 `rng`
 * field; every random draw goes through an Rng bound to that state so that
 * same seed + same choices = same outcome.
 */

export function mulberry32Step(s: number): [number, number] {
  s = (s + 0x6d2b79f5) | 0;
  let t = s;
  t = Math.imul(t ^ (t >>> 15), t | 1);
  t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
  const out = ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  return [s >>> 0, out];
}

/** Hash a string to a uint32 (FNV-1a). Useful for deriving sub-seeds. */
export function hashString(str: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < str.length; i++) {
    h ^= str.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return h >>> 0;
}

export class Rng {
  constructor(public state: number) {
    this.state = state >>> 0;
  }

  static fromSeed(seed: number | string): Rng {
    const s = typeof seed === 'string' ? hashString(seed) : seed >>> 0;
    return new Rng(s);
  }

  /** Derive an independent generator (does not advance this one). */
  fork(label: string | number): Rng {
    return new Rng((this.state ^ hashString(String(label))) >>> 0);
  }

  next(): number {
    const [s, v] = mulberry32Step(this.state);
    this.state = s;
    return v;
  }

  /** Integer in [min, max] inclusive. */
  int(min: number, max: number): number {
    return min + Math.floor(this.next() * (max - min + 1));
  }

  float(min: number, max: number): number {
    return min + this.next() * (max - min);
  }

  chance(p: number): boolean {
    return this.next() < p;
  }

  pick<T>(arr: readonly T[]): T {
    if (arr.length === 0) throw new Error('Rng.pick on empty array');
    return arr[Math.floor(this.next() * arr.length)];
  }

  /** Pick using weights; returns index. */
  weightedIndex(weights: readonly number[]): number {
    let total = 0;
    for (const w of weights) total += Math.max(0, w);
    if (total <= 0) return -1;
    let r = this.next() * total;
    for (let i = 0; i < weights.length; i++) {
      r -= Math.max(0, weights[i]);
      if (r < 0) return i;
    }
    return weights.length - 1;
  }

  weighted<T>(items: readonly T[], weightOf: (t: T) => number): T | undefined {
    const i = this.weightedIndex(items.map(weightOf));
    return i < 0 ? undefined : items[i];
  }

  shuffle<T>(arr: T[]): T[] {
    for (let i = arr.length - 1; i > 0; i--) {
      const j = Math.floor(this.next() * (i + 1));
      [arr[i], arr[j]] = [arr[j], arr[i]];
    }
    return arr;
  }

  sample<T>(arr: readonly T[], n: number): T[] {
    return this.shuffle(arr.slice()).slice(0, n);
  }

  /** Approximately normal (sum of 3 uniforms), mean 0, sd ~1. */
  gauss(): number {
    return (this.next() + this.next() + this.next() - 1.5) * 2;
  }

  id(prefix = ''): string {
    return prefix + Math.floor(this.next() * 0xffffffff).toString(36);
  }
}

/** Run `fn` with an Rng bound to `holder.rng`, writing back the advanced state. */
export function withRng<T>(holder: { rng: number }, fn: (rng: Rng) => T): T {
  const rng = new Rng(holder.rng);
  const out = fn(rng);
  holder.rng = rng.state;
  return out;
}
