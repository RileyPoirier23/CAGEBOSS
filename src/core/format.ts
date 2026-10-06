/** Number & text formatting helpers. */
export function money(n: number, short = true): string {
  const neg = n < 0;
  const a = Math.abs(Math.round(n));
  let s: string;
  if (short && a >= 1_000_000_000) s = (a / 1_000_000_000).toFixed(a >= 10_000_000_000 ? 1 : 2) + 'B';
  else if (short && a >= 1_000_000) s = (a / 1_000_000).toFixed(a >= 10_000_000 ? 1 : 2) + 'M';
  else if (short && a >= 10_000) s = Math.round(a / 1000) + 'K';
  else s = a.toLocaleString('en-US');
  return (neg ? '-$' : '$') + s;
}

export function signed(n: number): string {
  return (n >= 0 ? '+' : '') + Math.round(n);
}

export function pct(n: number): string {
  return Math.round(n * 100) + '%';
}

export function clamp(v: number, lo: number, hi: number): number {
  return v < lo ? lo : v > hi ? hi : v;
}

export function cap(s: string): string {
  return s.charAt(0).toUpperCase() + s.slice(1);
}

export function plural(n: number, word: string, pluralWord = word + 's'): string {
  return `${n} ${n === 1 ? word : pluralWord}`;
}

export function record(r: { w: number; l: number; d: number; nc: number }): string {
  return `${r.w}-${r.l}${r.d ? '-' + r.d : ''}${r.nc ? ` (${r.nc} NC)` : ''}`;
}

export function heightStr(cm: number): string {
  const inches = Math.round(cm / 2.54);
  return `${Math.floor(inches / 12)}'${inches % 12}"`;
}

export function compact(n: number): string {
  if (n >= 1_000_000) return (n / 1_000_000).toFixed(1).replace(/\.0$/, '') + 'M';
  if (n >= 1_000) return (n / 1_000).toFixed(1).replace(/\.0$/, '') + 'K';
  return String(Math.round(n));
}
