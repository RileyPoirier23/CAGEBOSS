/**
 * Rankings (champion + top 15 per division, pound-for-pound) driven by
 * results, and belts (undisputed, interim, symbolic).
 */
import type { Belt, Bout, GameState, Fighter, RankMove } from '../core/types';
import { ensureCareer } from '../core/career';
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

/** Ranked spots per division (the champion sits above them). */
export const RANKED = 15;

/**
 * Ranking points. Seeded once from quality & record, after that they move with
 * results (rankingsOnBout), inactivity and injuries (rankingsWeekly).
 */
export function rankPoints(s: GameState, f: Fighter): number {
  const c = ensureCareer(s);
  if (c.rp[f.id] === undefined) c.rp[f.id] = Math.round(rankScore(s, f) * 10) / 10;
  return c.rp[f.id];
}

function rankable(s: GameState, f: Fighter): boolean {
  return isOurs(f) && f.legal !== 'banned' && f.legal !== 'jailed';
}

/** The wall as it stands: [champion or '', #1 .. #15]. */
function wallOf(s: GameState, div: string): string[] {
  return [undisputed(s, div)?.holder ?? '', ...(s.rankings[div] ?? [])];
}

/**
 * Re-sort every division by ranking points (ties keep the old order) and
 * rebuild the pound-for-pound list. Returns who moved since the last call.
 */
export function computeRankings(s: GameState): RankMove[] {
  const c = ensureCareer(s);
  const moves: RankMove[] = [];
  for (const div of s.divisionsOpen) {
    const before = c.wall[div] ?? wallOf(s, div);
    const prev = s.rankings[div] ?? [];
    const champ = undisputed(s, div)?.holder;
    const pool = Object.values(s.fighters).filter((f) => f.division === div && f.id !== champ && rankable(s, f));
    const idx = (id: string) => {
      const i = prev.indexOf(id);
      return i < 0 ? 99 : i;
    };
    pool.sort((a, b) => rankPoints(s, b) - rankPoints(s, a) || idx(a.id) - idx(b.id));
    s.rankings[div] = pool.slice(0, RANKED).map((f) => f.id);
    const after = wallOf(s, div);
    c.wall[div] = after;
    const pos = (list: string[], id: string): number | null => {
      const i = list.indexOf(id);
      return i < 0 ? null : i;
    };
    for (const id of new Set([...before, ...after])) {
      if (!id) continue;
      const from = pos(before, id);
      const to = pos(after, id);
      if (from !== to) moves.push({ id, div, from, to });
    }
  }
  // pound for pound: points, belts and actual ability
  const p4p = Object.values(s.fighters).filter((f) => rankable(s, f) && s.divisionsOpen.includes(f.division));
  const score = (f: Fighter) => {
    const belt = undisputed(s, f.division);
    return rankPoints(s, f) + (belt?.holder === f.id ? 22 + belt.defenses * 3 : 0) + overall(f.skills) * 0.5;
  };
  c.p4p = p4p.sort((a, b) => score(b) - score(a)).slice(0, RANKED).map((f) => f.id);
  return moves;
}

/** Results move the wall: beat a ranked opponent and climb, upsets leapfrog, losses drop. */
export function rankingsOnBout(s: GameState, bout: Bout): void {
  const r = bout.result;
  const A = s.fighters[bout.a];
  const B = s.fighters[bout.b];
  if (!r || !A || !B) return;
  const c = ensureCareer(s);
  const pa = rankPoints(s, A);
  const pb = rankPoints(s, B);
  if (!r.winner || !r.loser) {
    c.rp[A.id] = pa + 0.5;
    c.rp[B.id] = pb + 0.5;
    return;
  }
  const W = s.fighters[r.winner];
  const L = s.fighters[r.loser];
  if (!W || !L) return;
  const pos = (f: Fighter) => rankOf(s, f.id) ?? RANKED + 1;
  const rw = pos(W);
  const rl = pos(L);
  const pw = rankPoints(s, W);
  const pl = rankPoints(s, L);
  const finish = r.method === 'KO' || r.method === 'TKO' || r.method === 'SUB';
  const gain = 5 + (finish ? 2 : 0) + (bout.title ? 4 : 0) + (bout.position === 0 ? 1 : 0) + Math.max(0, RANKED + 1 - rl) * 0.9;
  const loss = 4 + (r.method === 'KO' || r.method === 'TKO' ? 2 : 0) + (rw > rl ? 3 : 0);
  let nw = pw + gain;
  let nl = pl - loss;
  if (rl < rw) {
    // upset: the winner takes (at least) the loser's spot
    nw = Math.max(nw, pl + 1.5);
    nl = Math.min(nl, nw - 1.5);
  }
  c.rp[W.id] = Math.round(nw * 10) / 10;
  c.rp[L.id] = Math.round(nl * 10) / 10;
}

/** Weekly drift: inactivity and long injuries slide you down; ability slowly pulls you back. */
export function rankingsWeekly(s: GameState): void {
  const c = ensureCareer(s);
  for (const id of Object.keys(c.rp)) {
    const f = s.fighters[id];
    if (!f || f.status === 'retired' || (f.promotion !== 'us' && f.status !== 'free-agent')) {
      delete c.rp[id];
      continue;
    }
    if (!isOurs(f)) continue;
    let p = c.rp[id];
    if (s.week - f.lastFightWeek > 26) p -= 0.5;
    if (f.injuries.some((i) => i.until > s.week + 6)) p -= 0.3;
    if (f.legal === 'suspended' || f.legal === 'jailed' || f.legal === 'banned') p -= 1;
    p += (rankScore(s, f) - p) * 0.03;
    c.rp[id] = Math.round(p * 100) / 100;
  }
}

export function p4pRank(s: GameState, id: string): number | null {
  const i = ensureCareer(s).p4p.indexOf(id);
  return i < 0 ? null : i + 1;
}

/** "the number 4 ranked lightweight" / "the lightweight champion" / null when unranked. */
export function rankPhrase(s: GameState, id: string): string | null {
  const f = s.fighters[id];
  if (!f) return null;
  const r = rankOf(s, id);
  if (r === null) return null;
  const div = divisionName(f.division).toLowerCase();
  return r === 0 ? `the ${div} champion` : `the number ${r} ranked ${div}`;
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
