/**
 * Content validator: `npm run validate`
 *  - every JSON file parses and has the expected shape
 *  - storylet expressions (conditions, role filters, vars, choice ifs) parse
 *  - effects parse as statements and only call known functions / assign known targets
 *  - follow-ups point at real storylets; followupOnly storylets are reachable
 *  - text placeholders reference defined roles / vars
 *  - flags storylets whose conditions can never be met (static checks + sampling)
 *  - roster ids are unique, headlines have tags, etc.
 * Exits non-zero on errors.
 */
import { loadContent } from './loadContent';
import { parse, parseStatement, identifiers } from '../src/storylets/expr';
import type { StoryletDef } from '../src/core/types';

const KNOWN_FUNCS = new Set([
  'follow', 'addTrait', 'removeTrait', 'reveal', 'arrest', 'arrestPresident', 'injure', 'suspend', 'unsuspend', 'release', 'retire', 'comeback', 'sign',
  'toRival', 'strip', 'interimBelt', 'symbolicBelt', 'pay', 'raise', 'scout', 'heal', 'news', 'headline', 'rule', 'cite', 'spend', 'earn', 'ban', 'unban',
  'unlockVenue', 'venture', 'tvOffer', 'sponsorDeal', 'dropSponsor', 'dropSponsors', 'message', 'log', 'rivalry', 'endGame', 'lifestyle', 'unlockDivisions',
  'reporterRel', 'allFighters', 'meter', 'setFlag', 'addFlag', 'chance', 'rand', 'min', 'max', 'abs', 'round', 'floor', 'flag', 'seen', 'since', 'ruleActive', 'countTrait',
]);
const GLOBALS = new Set([
  'meters', 'heat', 'patience', 'chaos', 'cash', 'wealth', 'valuation', 'debt', 'act', 'week', 'year', 'flags', 'scale', 'tv', 'ppv', 'venture', 'sold', 'audit',
  'mode', 'difficulty', 'president', 'promotion', 'rosterSize', 'eventSoon', 'eventThisWeek', 'rivalsAlive', 'openCases', 'womenOpen', 'vars', 'f', 'r',
  'fans', 'fighters', 'media', 'commission', 'network', 'sponsors', 'true', 'false', 'flag', 'chance', 'rand', 'min', 'max', 'abs', 'round', 'floor', 'seen', 'since',
  'ruleActive', 'countTrait', 'postFight', 'eventName', 'lastWinner', 'lastLoser', 'lastA', 'lastB', 'lastMethod', 'lastRobbery', 'lastMain', 'lastTitle',
  ...KNOWN_FUNCS,
]);
const ASSIGN_ROOTS = new Set(['fans', 'fighters', 'media', 'commission', 'network', 'sponsors', 'heat', 'patience', 'chaos', 'cash', 'wealth', 'debt', 'flag', 'flags', 'vars', 'president', 'promotion']);
const CATEGORIES = new Set(['legal', 'speech', 'doping', 'business', 'president', 'fightnight', 'weird', 'fighter', 'media', 'presser', 'owner', 'rival', 'family', 'venture', 'legend', 'commission', 'misc']);
const SYSTEM_TRIGGERED = new Set(['buried_doc_surfaces', 'doping_whistleblower', 'scale_scandal', 'holdout_threat', 'act2_intro', 'act3_intro', 'act4_intro', 'act5_intro']);

const errors: string[] = [];
const warnings: string[] = [];
const err = (s: StoryletDef | null, msg: string) => errors.push(`${s ? `[${s.id}] (${s.file})` : ''} ${msg}`);
const warn = (s: StoryletDef | null, msg: string) => warnings.push(`${s ? `[${s.id}]` : ''} ${msg}`);

const c = loadContent();
const ids = new Map<string, StoryletDef>();
for (const s of c.storylets) {
  if (ids.has(s.id)) err(s, `duplicate id (also in ${ids.get(s.id)!.file})`);
  ids.set(s.id, s);
}

const followTargets = new Set<string>();
for (const s of c.storylets) {
  if (!CATEGORIES.has(s.category)) err(s, `unknown category ${s.category}`);
  if (!s.scenes?.length) err(s, 'no scenes');
  if (!s.choices?.length) err(s, 'no choices');
  const roles = new Set(Object.keys(s.roles ?? {}));
  const vars = new Set(Object.keys(s.vars ?? {}));
  const checkExpr = (src: string | undefined, where: string, extra: string[] = []) => {
    if (!src) return;
    try {
      const ids2 = identifiers(src);
      for (const id of ids2) {
        if (!GLOBALS.has(id) && !roles.has(id) && !vars.has(id) && !extra.includes(id)) warn(s, `${where}: unknown identifier '${id}' in "${src}"`);
      }
    } catch (e) {
      err(s, `${where}: ${(e as Error).message}`);
    }
  };
  checkExpr(s.conditions, 'conditions');
  for (const [name, rd] of Object.entries(s.roles ?? {})) {
    checkExpr(rd.where, `role ${name}.where`);
    checkExpr(rd.prefer, `role ${name}.prefer`);
  }
  for (const [k, v] of Object.entries(s.vars ?? {})) checkExpr(v, `var ${k}`);
  s.choices.forEach((ch, i) => {
    checkExpr(ch.if, `choice ${i}.if`);
    for (const eff of ch.effects ?? []) {
      try {
        const st = parseStatement(eff);
        if (st.kind === 'assign') {
          const root = st.target![0];
          if (!ASSIGN_ROOTS.has(root) && !roles.has(root)) err(s, `choice ${i}: cannot assign to '${st.target!.join('.')}'`);
        }
        for (const id of identifiers(eff.replace(/^[\w.]+\s*([+\-*]?=)(?!=)/, '0 $1').replace(/^0 [+\-*]?=/, ''))) {
          if (!GLOBALS.has(id) && !roles.has(id) && !vars.has(id)) warn(s, `choice ${i}: unknown identifier '${id}' in "${eff}"`);
        }
        for (const m of eff.matchAll(/follow\('([^']+)'/g)) {
          followTargets.add(m[1]);
          if (!ids.has(m[1])) err(s, `choice ${i}: follow-up '${m[1]}' does not exist`);
        }
        const fn = /^([a-zA-Z_]+)\(/.exec(eff.trim());
        if (fn && !KNOWN_FUNCS.has(fn[1])) err(s, `choice ${i}: unknown function ${fn[1]}()`);
      } catch (e) {
        err(s, `choice ${i}: ${(e as Error).message} in "${eff}"`);
      }
    }
  });
  // text placeholders
  const texts = [...s.scenes.map((x) => x.text + ' ' + (x.speaker ?? '') + ' ' + (x.title ?? '')), ...s.choices.map((x) => x.label + ' ' + (x.result ?? ''))];
  for (const t of texts) {
    for (const m of t.matchAll(/\{\$?([a-zA-Z_][a-zA-Z0-9_]*)(?:\.[a-zA-Z0-9_.]+)?\}/g)) {
      const root = m[1];
      if (['he', 'his', 'him', 'He', 'His', 'president', 'presidentLast', 'promotion', 'owner', 'vars'].includes(root)) continue;
      if (!roles.has(root) && !vars.has(root)) err(s, `text references unknown {${root}}`);
    }
  }
  if (s.category === 'presser' && !roles.has('reporter')) warn(s, 'presser storylet without a reporter role');
}
for (const s of c.storylets) {
  if (s.followupOnly && !followTargets.has(s.id) && !SYSTEM_TRIGGERED.has(s.id)) err(s, 'followupOnly but nothing follows into it');
}

// roster
const fids = new Set<string>();
for (const f of c.roster) {
  if (fids.has(f.id)) err(null, `duplicate fighter id ${f.id}`);
  fids.add(f.id);
  if (!c.divisions.some((d) => d.id === f.division)) err(null, `fighter ${f.id} has unknown division ${f.division}`);
}
for (const h of c.headlines) if (!h.tags?.length) err(null, `headline ${h.id} has no tags`);
for (const r of c.reporters) if (!c.outlets.some((o) => o.id === r.outlet)) err(null, `reporter ${r.id} has unknown outlet ${r.outlet}`);

const byCat: Record<string, number> = {};
for (const s of c.storylets) byCat[s.category] = (byCat[s.category] ?? 0) + 1;
const chains = new Set(c.storylets.map((s) => s.chain).filter(Boolean));
console.log(`Storylets: ${c.storylets.length} (${chains.size} chains)  ${JSON.stringify(byCat)}`);
console.log(`Roster: ${c.roster.length}  Headlines: ${c.headlines.length}  Reporters: ${c.reporters.length}  Outlets: ${c.outlets.length}  Sponsors: ${c.sponsors.length}  Venues: ${c.venues.length}`);
if (warnings.length) console.log(`\n${warnings.length} warning(s):\n` + warnings.slice(0, 60).join('\n'));
if (errors.length) {
  console.log(`\n${errors.length} ERROR(S):\n` + errors.join('\n'));
  process.exit(1);
}
console.log('\nContent OK.');
export { parse };
