/**
 * Media-panel rankings and belts (undisputed, interim, symbolic).
 */
import type { Belt, GameState, Fighter } from '../core/types';
import { Rng, hashString } from '../core/rng';
import { overall, isOurs, fullName, addCareerLog } from './fighters';
import { divisionName } from './divisions';

export function undisputed(s: GameState, division: string): Belt | undefined {
  return Object.values(s.belts).find((b) => b.division === division && !b.interim && !b.symbolic && !b.retired);
}

export function interim(s: GameState, division: string): Belt | undefined {
  return Object.values(s.belts).find((b) => b.division === division && b.interim && !b.retired);
}

export function beltsOf(s: GameState, fighterId: string): Belt[] {
  return Object.values(s.belts).filter((b) => b.holder === fighterId && !b.retired);
}

export function champOf(s: GameState, division: string): Fighter | null {
  const b = undisputed(s, division);
  return b?.holder ? s.fighters[b.holder] ?? null : null;
}

export function rankScore(s: GameState, f: Fighter): number {
  const fights = f.record.w + f.record.l;
  const winRate = (f.record.w + 1) / (fights + 2);
  return overall(f.skills) * 0.55 + winRate * 25 + f.streak * 2.5 + f.hype * 0.12 + f.starPower * 0.06;
}

/** Recompute rankings. Media meter adds panel noise and favouritism toward hype. */
export function computeRankings(s: GameState): void {
  const rng = new Rng(hashString('rank' + s.week) ^ s.seed);
  const noise = 6 - s.meters.media / 25; // hostile media = noisier panel
  for (const div of s.divisionsOpen) {
    const champ = undisputed(s, div)?.holder;
    const pool = Object.values(s.fighters).filter((f) => isOurs(f) && f.division === div && f.id !== champ);
    const scored = pool.map((f) => ({ f, sc: rankScore(s, f) + rng.gauss() * noise }));
    scored.sort((a, b) => b.sc - a.sc);
    s.rankings[div] = scored.slice(0, 15).map((x) => x.f.id);
  }
}

export function rankOf(s: GameState, id: string): number | null {
  const f = s.fighters[id];
  if (!f) return null;
  if (undisputed(s, f.division)?.holder === id) return 0;
  const r = s.rankings[f.division]?.indexOf(id) ?? -1;
  return r >= 0 ? r + 1 : null;
}

export function rankLabel(s: GameState, id: string): string {
  const r = rankOf(s, id);
  if (r === 0) return 'CHAMP';
  if (r === null) return 'NR';
  return '#' + r;
}

let beltSeq = 0;
export function newBelt(s: GameState, opts: Partial<Belt> & { name: string }): Belt {
  const id = 'belt_' + (opts.division ?? 'sym') + '_' + s.week + '_' + beltSeq++ + Object.keys(s.belts).length;
  const b: Belt = {
    id,
    name: opts.name,
    division: opts.division ?? null,
    holder: opts.holder ?? null,
    interim: !!opts.interim,
    symbolic: !!opts.symbolic,
    createdWeek: s.week,
    defenses: 0,
    design: opts.design ?? { plate: 0, strap: 0, gem: 0 },
    history: opts.holder ? [{ holder: opts.holder, week: s.week }] : [],
  };
  s.belts[id] = b;
  return b;
}

export function ensureDivisionBelts(s: GameState): void {
  for (const div of s.divisionsOpen) {
    if (!undisputed(s, div)) newBelt(s, { name: `${divisionName(div)} Championship`, division: div, design: { plate: 0, strap: 0, gem: 0 } });
  }
}

export function awardBelt(s: GameState, belt: Belt, fighterId: string): void {
  const prev = belt.holder;
  belt.holder = fighterId;
  belt.defenses = 0;
  belt.history.push({ holder: fighterId, week: s.week });
  const f = s.fighters[fighterId];
  if (f) {
    addCareerLog(f, `Won the ${belt.name}${prev && s.fighters[prev] ? ' from ' + fullName(s.fighters[prev]) : ''}.`);
    f.hype = Math.min(100, f.hype + 15);
  }
  // interim winner becoming undisputed -> retire interim
  if (!belt.interim && belt.division) {
    const intB = interim(s, belt.division);
    if (intB && intB.holder === fighterId) intB.retired = true;
  }
}

export function vacateBelt(s: GameState, belt: Belt, reason: string): void {
  const f = belt.holder ? s.fighters[belt.holder] : null;
  if (f) addCareerLog(f, `Vacated / stripped of the ${belt.name} (${reason}).`);
  belt.holder = null;
  belt.defenses = 0;
}

/** Clean up belts whose holders left / retired. Returns notes. */
export function auditBelts(s: GameState): string[] {
  const notes: string[] = [];
  for (const b of Object.values(s.belts)) {
    if (b.retired || !b.holder) continue;
    const f = s.fighters[b.holder];
    if (!f || f.status === 'retired' || f.promotion !== 'us') {
      notes.push(`${b.name} vacated${f ? ' by ' + fullName(f) : ''}.`);
      vacateBelt(s, b, f?.status === 'retired' ? 'retired' : 'left the promotion');
      if (b.interim) b.retired = true;
    }
  }
  return notes;
}
