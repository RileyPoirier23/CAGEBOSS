/**
 * The weekly front-page headline: MMA meme culture & shitposting mixed with
 * your roster's actual week (results, upsets, belts, rankings moves,
 * controversies, contender series signings, the owner, 1ton).
 *
 * Templates live in data/career/frontpage.json (tools/career_src.py). Recently
 * used templates are tracked in career.headlines so the paper never repeats
 * itself. Crime / doping / DUI / bar-fight / weigh-in towel headlines only ever
 * cast GENERATED fighters, never the parodies of real people.
 */
import type { Fighter, GameState, NewsItem, Story } from '../core/types';
import type { FrontPageDef } from '../core/content';
import { content } from '../core/content';
import type { Rng } from '../core/rng';
import { ensureCareer } from '../core/career';
import { fullName } from './fighters';
import { divisionName } from './divisions';
import { quickOdds } from './fight';
import { expandPop } from './popculture';
import { isMexican } from './oneton';

/** May this fighter appear in crime / doping / scandal jokes? Only made-up people. */
export function crimeSafe(f: Fighter | undefined | null): f is Fighter {
  return !!f && !f.parody && !f.marquee && !f.legend;
}

const RECENT = 150;
const methodWord = (m: string) => ({ KO: 'KO', TKO: 'TKO', SUB: 'SUBMISSION', DEC: 'DECISION', DQ: 'DQ', DOC: 'DOCTOR STOPPAGE' } as Record<string, string>)[m] ?? m;

interface Fact {
  kind: string;
  vars: Record<string, string | number>;
  w: number;
  news?: NewsItem; // the wire story this replaces (dropped from the inside pages)
}

function findByName(s: GameState, name: unknown): Fighter | undefined {
  if (typeof name !== 'string') return undefined;
  return Object.values(s.fighters).find((f) => fullName(f) === name);
}

/** Everything newsworthy about the promotion's last week. */
function facts(s: GameState, items: NewsItem[], rng: Rng): Fact[] {
  const c = ensureCareer(s);
  const out: Fact[] = [];
  const last = s.week - 1;
  // last week's event
  const ev = s.events.filter((e) => e.status === 'done' && e.week >= last - 1 && e.week < s.week).sort((a, b) => b.week - a.week)[0];
  if (ev) {
    const done = ev.card.filter((b) => b.status === 'done' && b.result?.winner && b.result.loser).sort((a, b) => a.position - b.position);
    for (const b of done) {
      const r = b.result!;
      const W = s.fighters[r.winner!];
      const L = s.fighters[r.loser!];
      if (!W || !L) continue;
      const vars = { winner: W.last, loser: L.last, method: methodWord(r.method), event: ev.name, round: r.round };
      if (b.title) {
        const belt = s.belts[b.title];
        const changed = belt?.history.length && belt.history[belt.history.length - 1].holder === W.id && belt.history[belt.history.length - 1].week === ev.week && belt.history.length > 1;
        out.push({ kind: changed ? 'title' : 'defense', vars: { ...vars, belt: belt?.name ?? 'title' }, w: changed ? 7 : 4 });
      }
      const odds = quickOdds(s.fighters[b.a], s.fighters[b.b]);
      const winP = r.winner === b.a ? odds : 1 - odds;
      if (winP < 0.36 && b.position <= 4) out.push({ kind: 'upset', vars, w: 5 });
      if (b.position === 0) out.push({ kind: 'result', vars, w: 3 });
    }
  }
  // rankings movers from the last event
  if (c.moves.week >= last - 1 && c.moves.list.length) {
    const ups = c.moves.list.filter((m) => m.to !== null && m.to > 0 && (m.from === null || m.from - m.to >= 2)).sort((a, b) => ((b.from ?? 16) - b.to!) - ((a.from ?? 16) - a.to!));
    const downs = c.moves.list.filter((m) => m.from !== null && m.from > 0 && m.to !== null && m.to - m.from >= 3);
    const pack = (m: (typeof ups)[number]) => {
      const f = s.fighters[m.id];
      return f ? { fighter: f.last, rank: m.to ?? 'NR', old: m.from ?? 'NR', div: divisionName(m.div).toUpperCase() } : null;
    };
    const up = ups[0] && pack(ups[0]);
    if (up) out.push({ kind: 'rank_up', vars: up, w: 3 });
    const down = downs.length ? pack(rng.pick(downs)) : null;
    if (down) out.push({ kind: 'rank_drop', vars: down, w: 1.5 });
  }
  if (c.p4p.length && rng.chance(0.2)) {
    const f = s.fighters[c.p4p[0]];
    if (f) out.push({ kind: 'p4p', vars: { fighter: f.last }, w: 1 });
  }
  // real controversies: arrests (made-up fighters, non-serious charges only)
  for (const lc of s.legal.cases.filter((x) => x.week >= last && x.who !== 'president')) {
    const f = s.fighters[lc.who];
    const ch = content().charges.find((x) => x.id === lc.charge);
    if (!crimeSafe(f) || !ch || ch.serious) continue;
    const kind = ch.id === 'dui' ? 'dui' : ch.id === 'bar_fight' || ch.id === 'assault_fan' ? 'bar_fight' : 'arrest';
    const news = items.find((n) => n.tags.includes('arrest') && n.vars.last === f.last);
    out.push({ kind, vars: { fighter: f.last, charge: ch.name.toUpperCase(), city: f.hometown.split('|')[0].toUpperCase() }, w: 5, news });
  }
  for (const n of items) {
    if (n.tags.includes('weight_miss')) {
      const f = findByName(s, n.vars.fighter);
      if (crimeSafe(f)) out.push({ kind: 'weight_miss', vars: { fighter: f.last }, w: 3, news: n });
    }
    if (n.tags.includes('doping')) {
      const f = findByName(s, n.vars.fighter);
      if (crimeSafe(f)) out.push({ kind: 'failed_test', vars: { fighter: f.last, weeks: n.vars.weeks ?? 26 }, w: 5, news: n });
    }
  }
  // tabloid nonsense about a made-up fighter (no legal consequences, just embarrassment)
  const gens = Object.values(s.fighters).filter((f) => f.promotion === 'us' && f.status === 'active' && crimeSafe(f));
  if (gens.length && rng.chance(0.3)) {
    const f = rng.pick(gens);
    out.push({ kind: 'tabloid', vars: { fighter: f.last, city: f.hometown.split('|')[0].toUpperCase() }, w: 1.2 });
  }
  // contender series signing
  const signed = c.contender.signed.map((id) => s.fighters[id]).filter((f) => f?.contract && f.contract.signedWeek >= last);
  if (signed.length) out.push({ kind: 'contender', vars: { fighter: signed[0].last }, w: 3 });
  if (c.owner.visits > 1 && rng.chance(0.12)) out.push({ kind: 'owner', vars: {}, w: 1 });
  const mex = Object.values(s.fighters).filter((f) => (f.status === 'active' || f.status === 'free-agent') && isMexican(f));
  if (rng.chance(0.12)) out.push({ kind: 'oneton', vars: { mex: mex.length ? rng.pick(mex).last : 'A MEXICAN FIGHTER' }, w: 1 });
  // the internet, always
  out.push({ kind: 'meme', vars: {}, w: 4.5 });
  if (gens.length) out.push({ kind: 'meme_g', vars: {}, w: 0.8 });
  return out;
}

function pickTemplate(s: GameState, kind: string, rng: Rng): FrontPageDef | null {
  const c = ensureCareer(s);
  const all = content().career.frontpage.filter((t) => t.kind === kind);
  if (!all.length) return null;
  const recent = new Set(c.headlines);
  const fresh = all.filter((t) => !recent.has(t.id));
  if (fresh.length) return rng.pick(fresh);
  // everything used recently: the one used longest ago
  return all.slice().sort((a, b) => c.headlines.indexOf(a.id) - c.headlines.indexOf(b.id))[0];
}

/** The lead story for this week's paper (and which wire item it replaces). */
export function frontPage(s: GameState, items: NewsItem[], rng: Rng): { story: Story; replaces: NewsItem | null } | null {
  const c = ensureCareer(s);
  if (!content().career.frontpage.length) return null;
  const fs = facts(s, items, rng);
  const lastKind = c.headlines.length ? (c.headlines[c.headlines.length - 1].match(/^fp_(.+)_\d+$/)?.[1] ?? '') : '';
  const roster = Object.values(s.fighters).filter((f) => f.promotion === 'us' && f.status === 'active');
  const gens = roster.filter(crimeSafe);
  for (let tries = 0; tries < 6; tries++) {
    const fact = rng.weighted(fs, (f) => f.w * (f.kind === lastKind ? 0.3 : 1));
    if (!fact) return null;
    const t = pickTemplate(s, fact.kind, rng);
    if (!t) {
      fs.splice(fs.indexOf(fact), 1);
      continue;
    }
    const pair = rng.sample(roster, 2);
    const vars: Record<string, string | number> = {
      a: pair[0]?.last ?? 'SOME GUY', b: pair[1]?.last ?? 'SOME OTHER GUY', g: gens.length ? rng.pick(gens).last : 'A JOURNEYMAN',
      promotion: s.promotion.name, president: s.president.name, owner: c.owner.person, company: s.owner.name,
      ...fact.vars,
    };
    const fill = (x: string) => expandPop(x.replace(/\{(\w+)\}/g, (m, k) => (vars[k] !== undefined ? String(vars[k]) : m)));
    const headline = fill(t.text).toUpperCase();
    if (/\{\w+\}/.test(headline)) {
      fs.splice(fs.indexOf(fact), 1);
      continue;
    }
    c.headlines.push(t.id);
    if (c.headlines.length > RECENT) c.headlines.splice(0, c.headlines.length - RECENT);
    const body = t.body ? fill(t.body) : '';
    return { story: { outlet: 'The Daily Clinch', headline, body }, replaces: fact.news ?? null };
  }
  return null;
}
