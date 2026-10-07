/**
 * Fight events: scheduling, automatic matchmaking, running bouts, applying
 * results (records, belts, damage, wounds, suspensions) and event money.
 */
import type { FightOpts } from './fight';
import { feudResult, getFeud } from './feuds';
import type { Bout, FightEvent, GameState, Fighter, EventFinancials } from '../core/types';
import { content } from '../core/content';
import { Rng } from '../core/rng';
import { clamp } from '../core/format';
import { simulateFight, quickOdds } from './fight';
import {
  isAvailable, isBooked, fullName, addCareerLog, computeStarPower, overall, isOurs, marketPurse,
} from './fighters';
import { undisputed, interim, awardBelt, computeRankings, rankingsOnBout, rankPoints, rankOf, rankScore } from './rankings';
import { careerOnEvent } from './career';
import { earn, spend, scale, adjustMeter } from './econ';
import { divisionName } from './divisions';
import { addNews } from './news';

export const MIN_REST_WEEKS = 5;

export function upcomingEvents(s: GameState): FightEvent[] {
  return s.events.filter((e) => e.status === 'scheduled').sort((a, b) => a.week - b.week);
}

export function eventThisWeek(s: GameState): FightEvent | undefined {
  return s.events.find((e) => e.status === 'scheduled' && e.week === s.week);
}

export function cardSize(s: GameState, numbered: boolean): number {
  const base = [0, 6, 8, 10, 12, 13][s.act] ?? 10;
  return numbered ? base + 2 : base;
}

export function pickVenue(s: GameState, numbered: boolean, rng: Rng): string {
  const vs = content().venues.filter((v) => s.venuesUnlocked.includes(v.id) && !v.special);
  if (!vs.length) return content().venues[0]?.id ?? 'vfw_hall';
  const budget = s.promotion.cash * (numbered ? 0.12 : 0.06);
  const draw = s.meters.fans / 100;
  const afford = vs.filter((v) => v.cost <= Math.max(budget, 15000 * scale(s)));
  const pool = afford.length ? afford : [vs.reduce((a, b) => (a.cost < b.cost ? a : b))];
  // bigger shows want bigger rooms; low fan interest wants small rooms
  pool.sort((a, b) => a.capacity - b.capacity);
  const idx = Math.min(pool.length - 1, Math.floor((numbered ? 0.55 : 0.25) * pool.length + draw * pool.length * 0.6));
  return rng.chance(0.25) ? rng.pick(pool).id : pool[idx].id;
}

export function venueRegion(id: string): string {
  return content().venues.find((v) => v.id === id)?.region ?? 'mojave';
}

/** Ensure the schedule always has events planned a few weeks out. */
export function scheduleEvents(s: GameState, rng: Rng): FightEvent[] {
  const created: FightEvent[] = [];
  const horizon = s.week + 6;
  for (let w = s.week + 1; w <= horizon; w++) {
    if (s.events.some((e) => e.week === w && e.status !== 'cancelled')) continue;
    const numbered = w % 4 === 3;
    const fn = w % 4 === 1;
    if (!numbered && !fn) continue;
    if (s.events.some((e) => Math.abs(e.week - w) < 2 && e.status === 'scheduled')) continue;
    const ev = createEvent(s, w, numbered, rng);
    created.push(ev);
  }
  return created;
}

export function createEvent(s: GameState, week: number, numbered: boolean, rng: Rng, venue?: string, name?: string): FightEvent {
  const id = 'ev' + s.eventSeq++;
  const v = venue ?? pickVenue(s, numbered, rng);
  const num = numbered ? ++s.numberedSeq : null;
  const ev: FightEvent = {
    id,
    name: name ?? (numbered ? `${shortPromo(s)} ${num}` : `${shortPromo(s)} Fight Night`),
    number: num,
    week,
    venue: v,
    region: venueRegion(v),
    card: [],
    status: 'scheduled',
    ppv: numbered && !!s.promotion.tv?.ppv,
    notes: [],
  };
  s.events.push(ev);
  autoCard(s, ev, rng);
  if (!numbered && ev.card[0]) ev.name = `${shortPromo(s)} Fight Night: ${boutTitle(s, ev.card[0])}`;
  return ev;
}

export function shortPromo(s: GameState): string {
  const words = s.promotion.name.split(/\s+/).filter(Boolean);
  if (words.length <= 2) return s.promotion.name.toUpperCase();
  return words.map((w) => w[0]).join('').toUpperCase();
}

function recentlyFought(s: GameState, a: string, b: string): boolean {
  return s.events.some(
    (e) => e.status === 'done' && s.week - e.week < 52 && e.card.some((x) => x.status === 'done' && ((x.a === a && x.b === b) || (x.a === b && x.b === a))),
  );
}

export function canFight(s: GameState, a: Fighter, b: Fighter): boolean {
  if (a.id === b.id || a.division !== b.division || a.gender !== b.gender) return false;
  if (a.gym === b.gym && a.loyalty > 30 && b.loyalty > 30) return false; // teammates refuse
  if (a.friends.includes(b.id)) return false;
  if (recentlyFought(s, a.id, b.id)) return false;
  return true;
}

export function makeBout(s: GameState, ev: FightEvent, a: Fighter, b: Fighter, position: number, title: string | null): Bout {
  const purse = (f: Fighter) => f.contract?.purse ?? marketPurse(s, f);
  return {
    id: ev.id + '_b' + (s.stats.boutSeq = (s.stats.boutSeq ?? 0) + 1),
    a: a.id,
    b: b.id,
    division: a.division,
    title,
    rounds: title || position === 0 ? 5 : 3,
    position,
    catchweight: false,
    shortNotice: false,
    status: 'scheduled',
    purse: [purse(a), purse(b)],
    finePct: 0,
    missedBy: null,
    meeting: meetings(s, a.id, b.id) + 1,
  };
}

/** How many completed fights two fighters have had against each other. */
export function meetings(s: GameState, a: string, b: string): number {
  return Math.max(s.fighters[a]?.h2h?.[b] ?? 0, s.fighters[b]?.h2h?.[a] ?? 0);
}

export function roman(n: number): string {
  const t: [number, string][] = [[10, 'X'], [9, 'IX'], [5, 'V'], [4, 'IV'], [1, 'I']];
  let out = '';
  for (const [v, r] of t) while (n >= v) { out += r; n -= v; }
  return out;
}

/** " II", " III"... for rematches, '' for a first meeting. */
export function rematchTag(b: Bout): string {
  return (b.meeting ?? 1) > 1 ? ' ' + roman(b.meeting!) : '';
}

/** Swap one side of a bout for a new fighter (keeps rematch numbering right). */
export function setOpponent(s: GameState, b: Bout, outId: string, inId: string): void {
  if (b.a === outId) b.a = inId;
  else if (b.b === outId) b.b = inId;
  b.pulled = b.pulled?.filter((x) => x !== outId);
  if (b.pulled && !b.pulled.length) delete b.pulled;
  b.meeting = meetings(s, b.a, b.b) + 1;
  b.purse = [s.fighters[b.a].contract?.purse ?? 5000, s.fighters[b.b].contract?.purse ?? 5000];
  b.missedBy = null;
  b.finePct = 0;
  b.catchweight = s.fighters[b.a].division !== s.fighters[b.b].division;
}

/** Fighters eligible to be put on a card for an event in `week`. */
export function bookable(s: GameState, week: number, exclude: Set<string> = new Set()): Fighter[] {
  return Object.values(s.fighters).filter(
    (f) => isAvailable(s, f, week) && !exclude.has(f.id) && !isBooked(s, f.id) && week - f.lastFightWeek >= MIN_REST_WEEKS,
  );
}

/** Build a sensible card: title fights first, then ranked pairings. */
export function autoCard(s: GameState, ev: FightEvent, rng: Rng): void {
  const size = cardSize(s, ev.number !== null);
  const used = new Set<string>(ev.card.flatMap((b) => [b.a, b.b]));
  const pool = bookable(s, ev.week, used);
  const byDiv = new Map<string, Fighter[]>();
  for (const f of pool) {
    if (!byDiv.has(f.division)) byDiv.set(f.division, []);
    byDiv.get(f.division)!.push(f);
  }
  // the rankings decide who's next: title shots go to the highest-ranked available contender
  for (const list of byDiv.values()) list.sort((a, b) => rankPoints(s, b) - rankPoints(s, a));
  const pairs: { a: Fighter; b: Fighter; score: number; title: string | null }[] = [];
  // title fights on numbered events
  if (ev.number !== null) {
    for (const [div, list] of byDiv) {
      const belt = undisputed(s, div);
      if (!belt) continue;
      const champ = belt.holder ? s.fighters[belt.holder] : null;
      if (champ && list.includes(champ)) {
        const contender = list.find((f) => f !== champ && canFight(s, champ, f));
        if (contender) pairs.push({ a: champ, b: contender, score: 200 + champ.starPower + contender.starPower, title: belt.id });
      } else if (!champ && list.length >= 2) {
        const [x, y] = list;
        if (canFight(s, x, y)) pairs.push({ a: x, b: y, score: 150 + x.starPower + y.starPower, title: belt.id });
      }
    }
    pairs.sort((p, q) => q.score - p.score);
    pairs.splice(2); // max two title fights per card
  }
  const taken = new Set<string>([...used, ...pairs.flatMap((p) => [p.a.id, p.b.id])]);
  // regular pairings: adjacent in the rankings
  const divs = rng.shuffle([...byDiv.keys()]);
  let guard = 0;
  while (pairs.length + ev.card.length < size && guard++ < 200) {
    let added = false;
    for (const div of divs) {
      if (pairs.length + ev.card.length >= size) break;
      const list = byDiv.get(div)!.filter((f) => !taken.has(f.id));
      for (let i = 0; i < list.length - 1 && !added; i++) {
        for (let j = i + 1; j < Math.min(list.length, i + 4); j++) {
          if (canFight(s, list[i], list[j])) {
            const odds = quickOdds(list[i], list[j]);
            const comp = 1 - Math.abs(odds - 0.5) * 2;
            pairs.push({ a: list[i], b: list[j], score: list[i].starPower + list[j].starPower + comp * 20 + rng.next() * 10, title: null });
            taken.add(list[i].id);
            taken.add(list[j].id);
            added = true;
            break;
          }
        }
      }
      if (added) break;
    }
    if (!added) break;
  }
  pairs.sort((p, q) => q.score - p.score);
  const start = ev.card.length;
  pairs.forEach((p, i) => ev.card.push(makeBout(s, ev, p.a, p.b, start + i, p.title)));
  renumber(ev);
}

export function renumber(ev: FightEvent): void {
  const live = ev.card.filter((b) => b.status !== 'cancelled');
  live.sort((a, b) => a.position - b.position).forEach((b, i) => {
    b.position = i;
    if (!b.title) b.rounds = i === 0 ? 5 : 3;
  });
}

/** Problems with a scheduled card (injuries, arrests, cut fighters...). */
export function cardProblems(s: GameState, ev: FightEvent): { bout: Bout; fighter: string; reason: string }[] {
  const out: { bout: Bout; fighter: string; reason: string }[] = [];
  for (const b of ev.card) {
    if (b.status !== 'scheduled') continue;
    for (const id of [b.a, b.b]) {
      const f = s.fighters[id];
      if (!f) out.push({ bout: b, fighter: id, reason: 'missing' });
      else if (!isOurs(f)) out.push({ bout: b, fighter: id, reason: 'no longer under contract' });
      else if (f.legal === 'arrested' || f.legal === 'jailed') out.push({ bout: b, fighter: id, reason: 'in custody' });
      else if (f.legal === 'suspended' || f.legal === 'banned') out.push({ bout: b, fighter: id, reason: 'suspended' });
      else if (f.injuries.some((i) => i.until > ev.week)) out.push({ bout: b, fighter: id, reason: 'injured' });
      else if (f.medSuspUntil > ev.week) out.push({ bout: b, fighter: id, reason: 'medically suspended' });
      else if (b.pulled?.includes(id)) out.push({ bout: b, fighter: id, reason: 'missed weight' });
    }
  }
  return out;
}

/**
 * Short-notice replacements for `stay`'s opponent, drawn from our own roster.
 * Same-division fighters first (closest in ranking), then neighbours from the
 * adjacent divisions at catchweight.
 */
export function replacementCandidates(s: GameState, ev: FightEvent, bout: Bout, stay: string): { f: Fighter; catchweight: boolean }[] {
  const keep = s.fighters[stay];
  if (!keep) return [];
  const used = new Set(ev.card.filter((b) => b.status === 'scheduled').flatMap((b) => [b.a, b.b]));
  const pool = Object.values(s.fighters).filter(
    (f) => isAvailable(s, f, ev.week) && !used.has(f.id) && !isBooked(s, f.id) && ev.week - f.lastFightWeek >= 3 && !bout.pulled?.includes(f.id),
  );
  const close = (f: Fighter) => Math.abs(rankScore(s, f) - rankScore(s, keep));
  const same = pool.filter((f) => canFight(s, keep, f)).sort((a, b) => close(a) - close(b));
  const divs = content().divisions;
  const di = divs.findIndex((d) => d.id === keep.division);
  const near = new Set([divs[di - 1]?.id, divs[di + 1]?.id].filter(Boolean) as string[]);
  const cw = pool
    .filter((f) => near.has(f.division) && f.gender === keep.gender && f.id !== keep.id && !f.friends.includes(keep.id))
    .sort((a, b) => close(a) - close(b));
  return [...same.map((f) => ({ f, catchweight: false })), ...cw.map((f) => ({ f, catchweight: true }))];
}

/** Best short-notice replacement opponent for `stay` (who keeps the fight). */
export function findReplacement(s: GameState, ev: FightEvent, bout: Bout, stay: string): Fighter | null {
  return replacementCandidates(s, ev, bout, stay)[0]?.f ?? null;
}

/** Auto-fix a card: replace missing fighters, cancel bouts that can't be saved. */
export function autoFixCard(s: GameState, ev: FightEvent): string[] {
  const notes: string[] = [];
  for (const p of cardProblems(s, ev)) {
    const b = p.bout;
    if (b.status !== 'scheduled') continue;
    const stay = p.fighter === b.a ? b.b : b.a;
    const out = s.fighters[p.fighter];
    const rep = findReplacement(s, ev, b, stay);
    if (rep && cardProblems(s, ev).every((q) => q.bout !== b || q.fighter === p.fighter)) {
      setOpponent(s, b, p.fighter, rep.id);
      b.shortNotice = true;
      notes.push(`${rep.first} ${rep.last} steps in on short notice for ${out ? fullName(out) : 'a missing fighter'} (${p.reason}).`);
    } else {
      b.status = 'cancelled';
      notes.push(`Bout cancelled: ${out ? fullName(out) : '?'} is ${p.reason}.`);
    }
  }
  renumber(ev);
  return notes;
}

// ---------------------------------------------------------------- running bouts

export function officialsFor(s: GameState, ev: FightEvent, rng: Rng) {
  const all = content().officials;
  const judges = all.filter((o) => o.role === 'judge');
  const refs = all.filter((o) => o.role === 'referee');
  // big shows get better officials
  const tierBoost = ev.number !== null ? 0.6 : 0.3;
  const pickWeighted = <T extends { competence?: number }>(arr: T[]) =>
    rng.weighted(arr, (o) => 0.3 + ((o.competence ?? 50) / 100) * tierBoost + (1 - tierBoost) * 0.5)!;
  const js: typeof judges = [];
  const pool = judges.slice();
  while (js.length < 3 && pool.length) {
    const j = pickWeighted(pool);
    js.push(j);
    pool.splice(pool.indexOf(j), 1);
  }
  return { judges: js, referee: pickWeighted(refs) };
}

export function runBout(s: GameState, ev: FightEvent, bout: Bout, rng: Rng, keepTicker = false, extra: Partial<FightOpts> = {}): void {
  const a = s.fighters[bout.a];
  const b = s.fighters[bout.b];
  const off = officialsFor(s, ev, rng);
  const homeSide = a.country === 'USA' && b.country !== 'USA' ? 0 : b.country === 'USA' && a.country !== 'USA' ? 1 : -1;
  bout.result = simulateFight(
    a,
    b,
    {
      rounds: bout.rounds,
      title: !!bout.title,
      judges: off.judges,
      referee: off.referee,
      realism: s.sandbox?.simRealism ?? 1,
      ticker: content().templates.ticker,
      keepTicker,
      homeSide: homeSide as 0 | 1 | -1,
      ...extra,
    },
    rng,
  );
  bout.status = 'done';
}

const methodLabel = (m: string) => ({ KO: 'KO', TKO: 'TKO', SUB: 'submission', DEC: 'decision', DRAW: 'draw', DQ: 'DQ', NC: 'no contest', DOC: 'doctor stoppage' } as Record<string, string>)[m] ?? m;

/** Apply a finished bout's consequences to both fighters, belts and news. */
export function applyBout(s: GameState, ev: FightEvent, bout: Bout, rng: Rng): void {
  const r = bout.result!;
  rankingsOnBout(s, bout); // before records & belts change
  if (r.winner && r.loser) feudResult(s, r.winner, r.loser);
  const A = s.fighters[bout.a];
  const B = s.fighters[bout.b];
  const sides: [Fighter, Fighter] = [A, B];
  const odds = quickOdds(A, B);
  sides.forEach((f, i) => {
    const opp = sides[1 - i];
    f.h2h = f.h2h ?? {};
    f.h2h[opp.id] = (f.h2h[opp.id] ?? 0) + 1;
    const won = r.winner === f.id;
    const lost = r.loser === f.id;
    if (won) {
      f.record.w++;
      f.streak = Math.max(1, f.streak + 1);
      const upset = (i === 0 ? 1 - odds : odds) > 0.62;
      f.hype = clamp(f.hype + 6 + (['KO', 'TKO', 'SUB'].includes(r.method) ? 7 : 0) + (upset ? 8 : 0) + (bout.position === 0 ? 4 : 0), 0, 100);
      f.morale = clamp(f.morale + 10, 0, 100);
      if (rng.chance(0.4)) f.skills.fightIQ = Math.min(99, f.skills.fightIQ + 1);
      addCareerLog(f, `Beat ${fullName(opp)} by ${methodLabel(r.method)} (${r.detail}) at ${ev.name}.`);
    } else if (lost) {
      f.record.l++;
      f.streak = Math.min(-1, f.streak - 1);
      f.hype = clamp(f.hype - 6 - (r.method === 'KO' ? 4 : 0), 0, 100);
      f.morale = clamp(f.morale - 9, 0, 100);
      if (r.method === 'KO' || r.method === 'TKO') f.koLosses++;
      addCareerLog(f, `Lost to ${fullName(opp)} by ${methodLabel(r.method)} (${r.detail}) at ${ev.name}.`);
    } else {
      if (r.method === 'NC') f.record.nc++;
      else f.record.d++;
      f.streak = 0;
      addCareerLog(f, `${r.method === 'NC' ? 'No contest' : 'Draw'} with ${fullName(opp)} at ${ev.name}.`);
    }
    // damage & wounds
    const dmgTaken = r.damage[i];
    f.damage = clamp(f.damage + dmgTaken / 12 + (lost && r.method === 'KO' ? 6 : lost && r.method === 'TKO' ? 3 : 0), 0, 100);
    const cut = r.cuts[i];
    const w = f.wounds;
    w.cuts = clamp(Math.ceil(cut / 3), 0, 3);
    w.swelling = clamp(Math.round(dmgTaken / 28), 0, 3);
    w.blackEye = dmgTaken > 35 ? (dmgTaken > 65 ? 2 : 1) : 0;
    w.noseBleed = dmgTaken > 45 && rng.chance(0.6);
    w.bandages = clamp(w.cuts + (dmgTaken > 40 ? 1 : 0), 0, 3);
    if (dmgTaken > 50 && f.look.nose !== 2 && rng.chance(0.08)) f.look.nose = 2;
    if (rng.chance(0.03 + r.stats.takedowns[1 - i] * 0.01) && f.look.ears < 3) f.look.ears++;
    // injuries & medical suspensions
    for (const inj of r.injuries.filter((x) => x.fighter === f.id)) {
      f.injuries.push({ name: inj.name, until: s.week + inj.weeks });
      addCareerLog(f, `Suffered a ${inj.name} against ${fullName(opp)}.`);
    }
    let susp = 2;
    if (lost && r.method === 'KO') susp = rng.int(9, 13);
    else if (lost && (r.method === 'TKO' || r.method === 'DOC')) susp = rng.int(5, 8);
    else if (dmgTaken > 60) susp = 4;
    f.medSuspUntil = Math.max(f.medSuspUntil, s.week + susp);
    f.lastFightWeek = s.week;
    if (f.contract) f.contract.boutsLeft = Math.max(0, f.contract.boutsLeft - 1);
    f.starPower = computeStarPower(s, f);
    // scouting improves once they fight for us
    if (f.promotion === 'us' && f.scout < 2) f.scout++;
  });
  // rivalries from close or dirty fights
  if ((r.fouls.length || r.robbery || (r.method === 'DEC' && r.detail.includes('Split'))) && rng.chance(0.6)) {
    if (!A.rivals.includes(B.id)) A.rivals.push(B.id);
    if (!B.rivals.includes(A.id)) B.rivals.push(A.id);
  }
  // belts
  if (bout.title) {
    const belt = s.belts[bout.title];
    if (belt) {
      if (r.winner && belt.holder !== r.winner) {
        const prev = belt.holder ? s.fighters[belt.holder] : null;
        awardBelt(s, belt, r.winner);
        const w = s.fighters[r.winner];
        addNews(s, { tags: ['title_change', 'fight'], vars: { winner: fullName(w), loser: prev ? fullName(prev) : fullName(s.fighters[r.loser!]), belt: belt.name, method: methodLabel(r.method), event: ev.name }, weight: 9, tone: 0.5 });
        // an undisputed champ beating the interim champ unifies
        if (!belt.interim && belt.division) {
          const ib = interim(s, belt.division);
          if (ib && (ib.holder === r.loser || ib.holder === r.winner)) ib.retired = true;
        }
      } else if (r.winner && belt.holder === r.winner) {
        belt.defenses++;
        s.fighters[r.winner].titleDefenses++;
        addNews(s, { tags: ['title_defense', 'fight'], vars: { winner: fullName(s.fighters[r.winner]), loser: fullName(s.fighters[r.loser!]), belt: belt.name, method: methodLabel(r.method), event: ev.name }, weight: 6, tone: 0.3 });
      }
    }
  }
  // headline-worthy results
  if (r.robbery) {
    addNews(s, { tags: ['robbery', 'fight'], vars: { winner: fullName(s.fighters[r.winner ?? A.id]), loser: fullName(s.fighters[r.loser ?? B.id]), event: ev.name, judge: r.judges[0] }, weight: 7, tone: -0.4 });
    adjustMeter(s, 'fans', -1);
  } else if (r.method === 'KO' && bout.position <= 2 && r.winner) {
    addNews(s, { tags: ['ko', 'fight'], vars: { winner: fullName(s.fighters[r.winner]), loser: fullName(s.fighters[r.loser!]), event: ev.name, detail: r.detail }, weight: 5, tone: 0.3 });
  } else if (r.method === 'DQ' || r.method === 'NC') {
    addNews(s, { tags: ['fiasco', 'fight'], vars: { a: fullName(A), b: fullName(B), detail: r.detail, event: ev.name }, weight: 5, tone: -0.3 });
  }
  if (r.injuries.some((x) => x.weeks >= 30)) {
    const inj = r.injuries.find((x) => x.weeks >= 30)!;
    addNews(s, { tags: ['injury', 'fight'], vars: { fighter: fullName(s.fighters[inj.fighter]), injury: inj.name, event: ev.name }, weight: 6, tone: -0.2 });
  }
  s.stats.bouts = (s.stats.bouts ?? 0) + 1;
  s.stats['method_' + r.method] = (s.stats['method_' + r.method] ?? 0) + 1;
}

// ---------------------------------------------------------------- money

export function cardDraw(s: GameState, ev: FightEvent): number {
  const live = ev.card.filter((b) => b.status !== 'cancelled').sort((a, b) => a.position - b.position);
  if (!live.length) return 0;
  const sp = (id: string) => s.fighters[id]?.starPower ?? 0;
  const top = live.slice(0, 2).reduce((t, b) => t + Math.max(sp(b.a), sp(b.b)) * 0.7 + Math.min(sp(b.a), sp(b.b)) * 0.3, 0) / 2;
  const depth = live.slice(2).reduce((t, b) => t + (sp(b.a) + sp(b.b)) / 2, 0) / Math.max(1, live.length - 2);
  const titles = live.filter((b) => b.title).length * 8;
  // real beef sells: a rivalry is worth more the hotter the feud is
  const rivalry = Math.max(0, ...live.slice(0, 2).map((b) => {
    const heat = getFeud(s, b.a, b.b)?.heat ?? 0;
    return s.fighters[b.a]?.rivals.includes(b.b) ? 6 + heat / 10 : heat / 12;
  }));
  // ranked match-ups sell: a top-5 clash or a #1 contender fight at the top of the card
  const ranked = Math.max(0, ...live.slice(0, 2).map((b) => {
    const ra = rankOf(s, b.a);
    const rb = rankOf(s, b.b);
    if (ra === null || rb === null) return 0;
    return Math.max(ra, rb) <= 5 ? 4 : Math.max(ra, rb) <= 10 ? 2 : 0;
  }));
  return top * 0.75 + depth * 0.25 + titles + rivalry + ranked;
}

export function estimateFinancials(s: GameState, ev: FightEvent): EventFinancials {
  const v = content().venues.find((x) => x.id === ev.venue);
  const capacity = v?.capacity ?? 1000;
  const draw = cardDraw(s, ev);
  const rivalClash = s.events.length && Object.values(s.rivals).some((r) => r.alive && r.lastEventWeek === ev.week) ? 0.1 : 0;
  const fill = clamp(0.18 + s.meters.fans / 160 + draw / 140 - rivalClash, 0.12, 1);
  const attendance = Math.round(capacity * fill);
  const price = [0, 45, 65, 95, 125, 150][v?.tier ?? 1] ?? 50;
  const gate = Math.round(attendance * price * (0.9 + draw / 300));
  let ppvBuys = 0;
  let ppv = 0;
  if (ev.ppv && s.promotion.tv?.ppv) {
    ppvBuys = Math.round(Math.pow(Math.max(5, draw), 1.9) * 9 * (0.6 + s.meters.fans / 70) * (0.7 + s.meters.network / 150) * (s.promotion.tv.tier + 1) * 0.6);
    ppv = Math.round(ppvBuys * 70 * 0.5);
  }
  const broadcast = s.promotion.tv ? Math.round(s.promotion.tv.perEvent * (0.8 + s.meters.network / 250)) : 0;
  const sponsors = Math.round((2000 + s.meters.sponsors * 250) * scale(s) * (ev.number !== null ? 1.5 : 1));
  const merch = Math.round(attendance * (4 + draw / 12));
  const live = ev.card.filter((b) => b.status !== 'cancelled');
  const purses = live.reduce((t, b) => t + b.purse[0] + b.purse[1], 0);
  const production = Math.round((12000 + live.length * 1500) * scale(s) * (ev.number !== null ? 1.4 : 1));
  return { attendance, gate, ppvBuys, ppv, broadcast, sponsors, merch, purses, bonuses: 0, venue: v?.cost ?? 0, production };
}

export function bonusAmount(s: GameState): number {
  return Math.round(5000 * scale(s) * (s.act >= 3 ? 2 : 1));
}

/** Pick default performance bonuses: best fight + best finish. */
export function defaultBonuses(ev: FightEvent): string[] {
  const done = ev.card.filter((b) => b.status === 'done' && b.result);
  if (!done.length) return [];
  const best = done.slice().sort((a, b) => b.result!.fotn - a.result!.fotn)[0];
  const ids = new Set<string>([best.a, best.b]);
  const finishes = done.filter((b) => ['KO', 'TKO', 'SUB'].includes(b.result!.method) && b !== best);
  finishes.sort((a, b) => b.result!.fotn - a.result!.fotn);
  if (finishes[0]?.result?.winner) ids.add(finishes[0].result.winner);
  return [...ids];
}

export function finalizeEvent(s: GameState, ev: FightEvent, bonusIds: string[]): EventFinancials {
  const fin = estimateFinancials(s, ev);
  // purses: show money + win bonus, weight-miss fines move money from the offender
  let purses = 0;
  for (const b of ev.card) {
    if (b.status !== 'done' || !b.result) continue;
    [b.a, b.b].forEach((id, i) => {
      const f = s.fighters[id];
      let pay = b.purse[i];
      if (b.missedBy === id) pay = Math.round(pay * (1 - b.finePct / 100));
      if (b.result!.winner === id) pay += f?.contract?.winBonus ?? Math.round(b.purse[i] * 0.5);
      purses += pay;
    });
  }
  fin.purses = purses;
  fin.bonuses = bonusIds.length * bonusAmount(s);
  for (const id of bonusIds) {
    const f = s.fighters[id];
    if (f) {
      f.morale = clamp(f.morale + 6, 0, 100);
      f.loyalty = clamp(f.loyalty + 3, 0, 100);
      addCareerLog(f, `Earned a performance bonus at ${ev.name}.`);
    }
  }
  earn(s, 'gate', fin.gate);
  earn(s, 'ppv', fin.ppv);
  earn(s, 'broadcast', fin.broadcast);
  earn(s, 'event sponsors', fin.sponsors);
  earn(s, 'merch', fin.merch);
  spend(s, 'purses', fin.purses);
  spend(s, 'bonuses', fin.bonuses);
  spend(s, 'venue', fin.venue);
  spend(s, 'production', fin.production);
  ev.fin = fin;
  ev.status = 'done';
  // fan reaction to the show
  const avgFotn = ev.card.filter((b) => b.result).reduce((t, b) => t + b.result!.fotn, 0) / Math.max(1, ev.card.filter((b) => b.result).length);
  const titles = ev.card.filter((b) => b.title && b.status === 'done').length;
  adjustMeter(s, 'fans', (avgFotn - 30) / 10 + titles * 0.4 + (ev.number !== null ? 0.3 : 0));
  adjustMeter(s, 'network', (avgFotn - 32) / 20);
  adjustMeter(s, 'fighters', bonusIds.length * 0.4 - 0.3);
  // drop bulky data from older events to keep saves small
  for (const e of s.events) {
    if (e === ev) continue;
    for (const b of e.card) {
      if (!b.result) continue;
      delete b.result.ticker;
      delete b.result.corners;
      delete b.result.roundScores;
      if (s.week - e.week > 8) {
        b.result.fouls = [];
        b.result.injuries = [];
      }
    }
  }
  s.stats.events = (s.stats.events ?? 0) + 1;
  s.stats.ppvBuys = (s.stats.ppvBuys ?? 0) + fin.ppvBuys;
  addNews(s, {
    tags: ['event'],
    vars: { event: ev.name, attendance: fin.attendance.toLocaleString(), venue: content().venues.find((v) => v.id === ev.venue)?.name ?? ev.venue, buys: fin.ppvBuys.toLocaleString() },
    weight: 3,
    tone: avgFotn > 55 ? 0.3 : 0,
  });
  careerOnEvent(s, ev, computeRankings(s));
  return fin;
}

/** Run every remaining bout and finalise (used by headless sim / skip). */
export function runEventHeadless(s: GameState, ev: FightEvent, rng: Rng, bonusPicker?: (ev: FightEvent) => string[], onBout?: (b: Bout) => void): EventFinancials {
  autoFixCard(s, ev);
  const order = ev.card.filter((b) => b.status === 'scheduled').sort((a, b) => b.position - a.position);
  for (const b of order) {
    runBout(s, ev, b, rng, false);
    applyBout(s, ev, b, rng);
    onBout?.(b);
  }
  return finalizeEvent(s, ev, bonusPicker ? bonusPicker(ev) : defaultBonuses(ev));
}

export function boutTitle(s: GameState, b: Bout): string {
  const A = s.fighters[b.a];
  const B = s.fighters[b.b];
  return `${A ? A.last : '?'} vs ${B ? B.last : '?'}${rematchTag(b)}`;
}

export function boutLabel(s: GameState, b: Bout): string {
  const belt = b.title ? s.belts[b.title] : null;
  const m = b.meeting ?? 1;
  const tag = m === 2 ? ' • Rematch (II)' : m === 3 ? ' • Trilogy (III)' : m > 3 ? ` • Part ${roman(m)}` : '';
  return (belt ? belt.name : `${divisionName(b.division)} bout`) + tag;
}

export function purseTotal(b: Bout): number {
  return b.purse[0] + b.purse[1];
}

export { overall };
