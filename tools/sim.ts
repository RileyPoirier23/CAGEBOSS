/**
 * Headless career simulator & balance report.
 *
 *   npm run sim -- --years 10 --seed 123 --policy balanced
 *   npm run sim -- --years 8 --seeds 5 --policy greedy     (5 seeds from --seed)
 *   npm run sim -- --policy all --seeds 3                   (every policy)
 *   options: --quiet (summary only)  --json out.json
 *
 * Reports the money curve per year, meters, scandal counts, fight outcome mix,
 * endings, and storylet coverage: how often each storylet fired relative to
 * the weeks it was eligible, which never fired, and which fire too often.
 */
import { writeFileSync } from 'node:fs';
import { loadContent } from './loadContent';
import { createNewGame } from '../src/sim/newgame';
import { simulateWeek } from '../src/sim/week';
import { POLICIES } from '../src/sim/policies';
import { STORYLET_STATS } from '../src/storylets/engine';
import { content } from '../src/core/content';
import type { GameState } from '../src/core/types';

const argv = process.argv.slice(2);
const arg = (k: string, d: string) => {
  const i = argv.indexOf('--' + k);
  return i >= 0 && argv[i + 1] && !argv[i + 1].startsWith('--') ? argv[i + 1] : d;
};
const flagOn = (k: string) => argv.includes('--' + k);

const years = Number(arg('years', '10'));
const seed0 = Number(arg('seed', '123'));
const seeds = Number(arg('seeds', '1'));
const policyArg = arg('policy', 'balanced');
const quiet = flagOn('quiet');
const jsonOut = arg('json', '');

loadContent();
const policies = policyArg === 'all' ? Object.keys(POLICIES) : [policyArg];
for (const p of policies) if (!POLICIES[p]) throw new Error(`Unknown policy "${p}". Options: ${Object.keys(POLICIES).join(', ')}, all`);

const money = (n: number) => {
  const a = Math.abs(n);
  const s = a >= 1e9 ? (a / 1e9).toFixed(2) + 'B' : a >= 1e6 ? (a / 1e6).toFixed(1) + 'M' : a >= 1e3 ? (a / 1e3).toFixed(0) + 'K' : a.toFixed(0);
  return (n < 0 ? '-$' : '$') + s;
};
const pad = (s: string | number, n: number) => String(s).padStart(n);

interface RunResult {
  policy: string;
  seed: number;
  weeks: number;
  ending: string | null;
  yearly: { year: number; act: number; cash: number; debt: number; valuation: number; fans: number; fighters: number; media: number; commission: number; network: number; sponsors: number; patience: number; heat: number; roster: number }[];
  stats: Record<string, number>;
  fired: Record<string, number>;
  minCash: number;
}

function snapshot(s: GameState) {
  return {
    year: Math.floor(s.week / 52) + 1, act: s.act, cash: Math.round(s.promotion.cash), debt: Math.round(s.promotion.debt), valuation: s.promotion.valuation,
    fans: Math.round(s.meters.fans), fighters: Math.round(s.meters.fighters), media: Math.round(s.meters.media), commission: Math.round(s.meters.commission),
    network: Math.round(s.meters.network), sponsors: Math.round(s.meters.sponsors), patience: Math.round(s.hidden.patience), heat: Math.round(s.hidden.heat),
    roster: Object.values(s.fighters).filter((f) => f.promotion === 'us' && f.status === 'active').length,
  };
}

function run(policy: string, seed: number): RunResult {
  const s = createNewGame({ seed, mode: 'career', difficulty: 'normal', promotionName: 'Cage Boss FC', presidentName: 'Sim Boss' });
  const yearly: RunResult['yearly'] = [snapshot(s)];
  let minCash = s.promotion.cash;
  for (let w = 0; w < years * 52 && !s.ending; w++) {
    simulateWeek(s, POLICIES[policy]);
    minCash = Math.min(minCash, s.promotion.cash);
    if (s.week % 52 === 0) yearly.push(snapshot(s));
  }
  if (yearly[yearly.length - 1].year !== Math.floor(s.week / 52) + 1 || s.ending) yearly.push(snapshot(s));
  const fired: Record<string, number> = {};
  for (const [id, h] of Object.entries(s.storylets.history)) fired[id] = h.count;
  return { policy, seed, weeks: s.week, ending: s.ending ?? null, yearly, stats: { ...s.stats }, fired, minCash: Math.round(minCash) };
}

STORYLET_STATS.on = true;
const results: RunResult[] = [];
const t0 = Date.now();
for (const p of policies) {
  for (let k = 0; k < seeds; k++) {
    const r = run(p, seed0 + k);
    results.push(r);
    if (!quiet) {
      console.log(`\n=== ${p.toUpperCase()} seed ${r.seed}: ${r.weeks} weeks, ending: ${r.ending ?? '(none yet)'}  min cash ${money(r.minCash)}`);
      console.log(' yr act        cash        debt   valuation  fans figh  med comm  net spon  pat heat roster');
      for (const y of r.yearly) {
        console.log(`${pad(y.year, 3)} ${pad(y.act, 3)} ${pad(money(y.cash), 11)} ${pad(money(y.debt), 11)} ${pad(money(y.valuation), 11)} ${pad(y.fans, 5)} ${pad(y.fighters, 4)} ${pad(y.media, 4)} ${pad(y.commission, 4)} ${pad(y.network, 4)} ${pad(y.sponsors, 4)} ${pad(y.patience, 4)} ${pad(y.heat, 4)} ${pad(y.roster, 6)}`);
      }
      const st = r.stats;
      const yrs = Math.max(1, r.weeks / 52);
      const methods = Object.entries(st).filter(([k]) => k.startsWith('method_')).map(([k, v]) => `${k.slice(7)} ${((v / Math.max(1, st.bouts)) * 100).toFixed(0)}%`).join('  ');
      console.log(` bouts ${st.bouts ?? 0} (${methods})`);
      console.log(` per year: arrests ${((st.arrests ?? 0) / yrs).toFixed(1)}, doping busts ${((st.dopingBusts ?? 0) / yrs).toFixed(1)}, defections ${((st.defections ?? 0) / yrs).toFixed(1)}, signings ${((st.signings ?? 0) / yrs).toFixed(0)}, storylets ${((st.storyletsResolved ?? 0) / yrs).toFixed(0)}, docs ${((st.docs ?? 0) / yrs).toFixed(0)}`);
    }
  }
}

// ------------------------------------------------------------------ storylet coverage
const defs = content().storylets;
const fired: Record<string, number> = {};
const runsFiredIn: Record<string, number> = {};
for (const r of results) for (const [id, n] of Object.entries(r.fired)) {
  fired[id] = (fired[id] ?? 0) + n;
  runsFiredIn[id] = (runsFiredIn[id] ?? 0) + 1;
}
const elig = STORYLET_STATS.eligible;
const randomDefs = defs.filter((d) => !d.followupOnly);
const firedAny = defs.filter((d) => (fired[d.id] ?? 0) > 0);
const never = defs.filter((d) => !(fired[d.id] ?? 0));
const neverEligible = randomDefs.filter((d) => !(elig[d.id] ?? 0));
// repetition: fires / eligible-weeks (only meaningful with a decent sample)
// once-per-career storylets can't repeat, and tiny samples say nothing: need 20+ eligible weeks
const rep = randomDefs
  .filter((d) => !d.oncePerCareer && !['presser', 'fightnight'].includes(d.category) && (elig[d.id] ?? 0) >= 20)
  .map((d) => ({ id: d.id, cat: d.category, fired: fired[d.id] ?? 0, elig: elig[d.id] ?? 0, rate: (fired[d.id] ?? 0) / (elig[d.id] ?? 1) }))
  .sort((a, b) => b.rate - a.rate);
const over = rep.filter((x) => x.rate > 0.4);

console.log(`\n=== STORYLET COVERAGE (${results.length} run${results.length === 1 ? '' : 's'}, ${defs.length} storylets, ${new Set(defs.map((d) => d.chain).filter(Boolean)).size} chains)`);
console.log(` fired at least once: ${firedAny.length}/${defs.length} (${((firedAny.length / defs.length) * 100).toFixed(1)}%)  target >= 85%`);
console.log(` random storylets never eligible: ${neverEligible.length}`);
console.log(` storylets firing in >40% of eligible weeks: ${over.length}  target 0  (random storylets with 20+ eligible weeks; presser/fight-night lines are reporter/context-bound)`);
for (const x of over.slice(0, 15)) console.log(`   ${x.id.padEnd(28)} ${x.cat.padEnd(11)} fired ${x.fired} / eligible ${x.elig} (${(x.rate * 100).toFixed(0)}%)`);
if (!quiet && never.length) {
  const byCat: Record<string, string[]> = {};
  for (const d of never) (byCat[d.category] ??= []).push(d.id);
  console.log(' never fired:');
  for (const [c, ids] of Object.entries(byCat)) console.log(`   ${c} (${ids.length}): ${ids.slice(0, 12).join(', ')}${ids.length > 12 ? ' ...' : ''}`);
}

// ------------------------------------------------------------------ sanity checks
const warnings: string[] = [];
for (const r of results) {
  const last = r.yearly[r.yearly.length - 1];
  if (r.minCash < -2_000_000) warnings.push(`${r.policy}/${r.seed}: cash dipped to ${money(r.minCash)}`);
  if (last.cash > 2e9) warnings.push(`${r.policy}/${r.seed}: cash ballooned to ${money(last.cash)}`);
  if (r.weeks < 104 && r.ending && r.policy !== 'chaos') warnings.push(`${r.policy}/${r.seed}: career ended in under two years (${r.ending}, week ${r.weeks})`);
}
console.log(`\n=== SANITY: ${warnings.length ? warnings.length + ' warning(s)' : 'OK'}`);
for (const w of warnings) console.log('  ! ' + w);
const endings: Record<string, number> = {};
for (const r of results) endings[r.ending ?? 'none'] = (endings[r.ending ?? 'none'] ?? 0) + 1;
console.log(' endings: ' + Object.entries(endings).map(([k, v]) => `${k} x${v}`).join(', '));
console.log(` done in ${((Date.now() - t0) / 1000).toFixed(1)}s`);

if (jsonOut) {
  writeFileSync(jsonOut, JSON.stringify({ results, coverage: { firedAny: firedAny.length, total: defs.length, over, never: never.map((d) => d.id) } }, null, 1));
  console.log(` wrote ${jsonOut}`);
}
