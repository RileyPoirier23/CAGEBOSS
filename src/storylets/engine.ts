/**
 * Storylet engine: eligibility, role binding, weighted fresh selection,
 * effects, follow-up scheduling and text templating.
 */
import type { GameState, StoryletDef, StoryletInstance, Fighter, ChoiceDef, MeterKey } from '../core/types';
import { expandPop } from '../sim/popculture';
import { METER_KEYS } from '../core/types';
import { content } from '../core/content';
import { Rng } from '../core/rng';
import { money, clamp } from '../core/format';
import { evaluate, parseStatement, type Env } from './expr';
import { isChamp, fullName, pronouns, isBooked, addTrait, removeTrait, retire as retireFighter, addCareerLog, computeStarPower, isInjured } from '../sim/fighters';
import { rankOf, beltsOf, vacateBelt, newBelt } from '../sim/rankings';
import { adjustMeter, adjustHidden, earn, spend, personal, scale } from '../sim/econ';
import { addNews, fillTemplate } from '../sim/news';
import { activateRule } from '../sim/rules';
import { arrest as legalArrest } from '../sim/legal';
import { makeContract, sign as signFighter } from '../sim/newgame';
import { divisionName } from '../sim/divisions';

/** Categories that must never cast a real-person parody in a role. */
export const SERIOUS_CATEGORIES = new Set(['legal', 'doping', 'speech']);
const SPECIAL_CATEGORIES = new Set(['fightnight', 'presser']);

let defsById: Map<string, StoryletDef> | null = null;
let defsRef: StoryletDef[] | null = null;
export function defs(): Map<string, StoryletDef> {
  const list = content().storylets;
  if (defsRef !== list || !defsById) {
    defsRef = list;
    defsById = new Map(list.map((d) => [d.id, d]));
  }
  return defsById;
}

export function def(id: string): StoryletDef | undefined {
  return defs().get(id);
}

// ---------------------------------------------------------------- views

export function fighterView(s: GameState, f: Fighter): Record<string, any> {
  const p = pronouns(f);
  const r = rankOf(s, f.id);
  return {
    id: f.id, name: fullName(f), first: f.first, last: f.last, nick: f.nick, gender: f.gender, age: f.age,
    division: f.division, divisionName: divisionName(f.division), traits: [...f.traits, ...f.hiddenTraits], visibleTraits: f.traits,
    styles: f.styles, hype: f.hype, star: f.starPower, morale: f.morale, loyalty: f.loyalty, legal: f.legal, damage: f.damage,
    addiction: f.addiction, moneyIQ: f.moneyIQ, debt: f.finances.debt, spending: f.finances.spending, followers: f.social.followers,
    streaming: f.streaming, champ: isChamp(s, f.id), rank: r === null ? 99 : r, ours: f.promotion === 'us' && f.status === 'active',
    status: f.status, promotion: f.promotion ?? '', marquee: f.marquee?.archetype ?? '', archetype: f.marquee?.archetype ?? '',
    parody: !!f.parody, legend: !!f.legend, record: f.record, wins: f.record.w, losses: f.record.l, streak: f.streak, koLosses: f.koLosses,
    injured: isInjured(f, s.week), booked: isBooked(s, f.id), purse: f.contract?.purse ?? 0, boutsLeft: f.contract?.boutsLeft ?? 0,
    beef: f.beefWithYou, rivals: f.rivals, kids: f.family.kids, married: !!f.family.spouse, country: f.country, hometown: f.hometown,
    vices: f.vices, business: f.business, gym: f.gym, coach: f.coach, managerId: f.manager, manager: content().managers.find((m) => m.id === f.manager)?.name ?? f.manager, skills: f.skills,
    weightMisses: f.weightMisses, cutman: f.cutman.name, cutmanRating: f.cutman.rating, scout: f.scout,
    weeksSinceFight: s.week - f.lastFightWeek, titleDefenses: f.titleDefenses,
    he: p.he, his: p.his, him: p.him, He: p.He, His: p.His, man: p.man,
  };
}

function reporterView(s: GameState, id: string): Record<string, any> | null {
  const r = content().reporters.find((x) => x.id === id);
  if (!r) return null;
  const st = s.media.reporters[id] ?? { rel: 0, banned: false, memory: [], scoops: 0 };
  const o = content().outlets.find((x) => x.id === r.outlet);
  const p = pronouns(r);
  return {
    id, name: r.name, first: r.name.split(' ')[0], last: r.name.split(' ').slice(-1)[0], outlet: o?.name ?? r.outlet, outletType: o?.type ?? '',
    rel: st.rel, banned: st.banned, nemesis: !!r.nemesis, traits: r.traits, personality: r.personality, scoops: st.scoops,
    he: p.he, his: p.his, him: p.him, He: p.He, His: p.His,
  };
}

function rivalView(s: GameState, id: string): Record<string, any> | null {
  const d = content().rivals.find((x) => x.id === id);
  const st = s.rivals[id];
  if (!d || !st) return null;
  return { id, name: d.name, short: d.short, owner: d.owner, type: d.type, cash: st.cash, strength: st.strength, alive: st.alive, relationship: st.relationship };
}

function sponsorView(id: string): Record<string, any> | null {
  const d = content().sponsors.find((x) => x.id === id);
  return d ? { id, name: d.name, category: d.category, tier: d.tier, weekly: d.weekly, blurb: d.blurb } : null;
}

function outletView(id: string): Record<string, any> | null {
  const d = content().outlets.find((x) => x.id === id);
  return d ? { id, name: d.name, type: d.type, bias: d.bias } : null;
}

export function roleView(s: GameState, type: string, id: string): Record<string, any> | null {
  switch (type) {
    case 'reporter': return reporterView(s, id);
    case 'rival': return rivalView(s, id);
    case 'sponsor': return sponsorView(id);
    case 'outlet': return outletView(id);
    default: {
      const f = s.fighters[id];
      return f ? fighterView(s, f) : null;
    }
  }
}

export function globalEnv(s: GameState, rng: Rng): Env {
  const env: Env = {
    meters: { ...s.meters },
    heat: s.hidden.heat,
    patience: s.hidden.patience,
    chaos: s.hidden.chaos,
    cash: s.promotion.cash,
    wealth: s.president.wealth,
    valuation: s.promotion.valuation,
    debt: s.promotion.debt,
    act: s.act,
    week: s.week,
    year: Math.floor(s.week / 52) + 1,
    flags: s.flags,
    scale: scale(s),
    tv: s.promotion.tv ? s.promotion.tv.tier : -1,
    ppv: !!s.promotion.tv?.ppv,
    venture: s.promotion.sideVenture ?? '',
    sold: s.owner.sold,
    audit: s.owner.audit,
    mode: s.mode,
    difficulty: s.difficulty,
    president: { ...s.president },
    promotion: s.promotion.name,
    rosterSize: Object.values(s.fighters).filter((f) => f.promotion === 'us' && f.status === 'active').length,
    eventSoon: s.events.some((e) => e.status === 'scheduled' && e.week - s.week <= 1),
    eventThisWeek: s.events.some((e) => e.status === 'scheduled' && e.week === s.week),
    rivalsAlive: Object.values(s.rivals).filter((r) => r.alive).length,
    openCases: s.legal.cases.filter((c) => c.status !== 'closed').length,
    womenOpen: s.divisionsOpen.some((d) => d.startsWith('w')),
    flag: (k: string) => s.flags[k] ?? 0,
    rand: (a: number, b: number) => rng.int(Math.round(a), Math.round(b)),
    chance: (p: number) => rng.chance(p),
    min: Math.min,
    max: Math.max,
    abs: Math.abs,
    round: Math.round,
    floor: Math.floor,
    seen: (id: string) => s.storylets.history[id]?.count ?? 0,
    since: (id: string) => (s.storylets.history[id] ? s.week - s.storylets.history[id].last : 9999),
    ruleActive: (id: string) => s.rules.active.includes(id),
    countTrait: (t: string) => Object.values(s.fighters).filter((f) => f.promotion === 'us' && f.status === 'active' && f.traits.includes(t)).length,
  };
  for (const k of METER_KEYS) env[k] = s.meters[k];
  return env;
}

// ---------------------------------------------------------------- binding

interface Candidate {
  id: string;
  view: Record<string, any>;
}

function candidatesFor(s: GameState, type: string, viewCache: Map<string, Record<string, any>>): Candidate[] {
  const fv = (f: Fighter) => {
    let v = viewCache.get(f.id);
    if (!v) viewCache.set(f.id, (v = fighterView(s, f)));
    return { id: f.id, view: v };
  };
  switch (type) {
    case 'fighter':
      return Object.values(s.fighters).filter((f) => f.promotion === 'us' && f.status === 'active').map(fv);
    case 'champ':
      return Object.values(s.fighters).filter((f) => f.promotion === 'us' && f.status === 'active' && isChamp(s, f.id)).map(fv);
    case 'anyFighter':
      return Object.values(s.fighters).filter((f) => f.status === 'active' || f.status === 'free-agent').map(fv);
    case 'freeAgent':
      return Object.values(s.fighters).filter((f) => f.status === 'free-agent').map(fv);
    case 'legend':
      return Object.values(s.fighters).filter((f) => f.status === 'retired').map(fv);
    case 'reporter':
      return content().reporters.map((r) => ({ id: r.id, view: reporterView(s, r.id)! }));
    case 'rival':
      return Object.keys(s.rivals).filter((id) => s.rivals[id].alive).map((id) => ({ id, view: rivalView(s, id)! }));
    case 'sponsor':
      return content().sponsors.map((x) => ({ id: x.id, view: sponsorView(x.id)! }));
    case 'outlet':
      return content().outlets.map((x) => ({ id: x.id, view: outletView(x.id)! }));
  }
  return [];
}

/** Follow-ups keep their cast even if role filters no longer match. */
const strictPresetSkip = new Set<string>();

/** Try to bind all roles. Returns null if any role can't be cast. */
export function bindRoles(
  s: GameState, d: StoryletDef, rng: Rng, base: Env, preset: Record<string, string> = {}, viewCache = new Map<string, Record<string, any>>(), existenceOnly = false,
): Record<string, string> | null {
  const roles: Record<string, string> = {};
  const env: Env = { ...base };
  const serious = SERIOUS_CATEGORIES.has(d.category) || !!d.tags?.includes('serious');
  for (const [name, rd] of Object.entries(d.roles ?? {})) {
    if (preset[name]) {
      const v = roleView(s, rd.type, preset[name]);
      if (!v) return null;
      if (rd.where && !existenceOnly) {
        env.f = v;
        env.r = v;
        let ok = false;
        try {
          ok = !!evaluate(rd.where, env);
        } catch {
          ok = false;
        }
        delete env.f;
        delete env.r;
        if (!ok && !strictPresetSkip.has(d.id)) return null;
      }
      roles[name] = preset[name];
      env[name] = v;
      continue;
    }
    let cands = candidatesFor(s, rd.type, viewCache).filter((c) => !Object.values(roles).includes(c.id));
    if (serious) cands = cands.filter((c) => !c.view.parody);
    const ok: Candidate[] = [];
    for (const c of cands) {
      env.f = c.view;
      env.r = c.view;
      let pass = false;
      try {
        pass = !!evaluate(rd.where, env);
      } catch {
        pass = false;
      }
      if (pass) {
        ok.push(c);
        if (existenceOnly) break;
      }
    }
    delete env.f;
    delete env.r;
    if (!ok.length) return null;
    let pick: Candidate;
    if (existenceOnly) pick = ok[0];
    else {
      pick = rng.weighted(ok, (c) => {
        let w = 1;
        if (rd.prefer) {
          env.f = c.view;
          try {
            w = Math.max(0.01, Number(evaluate(rd.prefer, env)) || 0.01);
          } catch {
            w = 1;
          }
          delete env.f;
        }
        // personal storylet history: spread stories around the roster
        const f = s.fighters[c.id];
        if (f) {
          const recent = Object.values(f.storyHistory).filter((wk) => s.week - wk < 26).length;
          w /= 1 + recent * 0.8;
          if (f.storyHistory[d.id] !== undefined) w *= 0.3;
          if (f.marquee) w *= 1.4;
        }
        return w;
      })!;
    }
    roles[name] = pick.id;
    env[name] = pick.view;
  }
  return roles;
}

export function rolesEnv(s: GameState, d: StoryletDef, roles: Record<string, string>): Env {
  const env: Env = {};
  for (const [name, id] of Object.entries(roles)) {
    const type = d.roles?.[name]?.type ?? 'fighter';
    const v = roleView(s, type, id);
    if (v) env[name] = v;
  }
  return env;
}

// ---------------------------------------------------------------- eligibility

function onCooldown(s: GameState, d: StoryletDef): boolean {
  const h = s.storylets.history[d.id];
  if (!h) return false;
  if (d.oncePerCareer) return true;
  return s.week - h.last < (d.cooldownWeeks ?? 26);
}

function actOk(s: GameState, d: StoryletDef): boolean {
  return !d.acts || d.acts.includes(s.act);
}

const roleNamesCache = new WeakMap<StoryletDef, Set<string>>();
function usesRoles(d: StoryletDef): boolean {
  let set = roleNamesCache.get(d);
  if (!set) roleNamesCache.set(d, (set = new Set(Object.keys(d.roles ?? {}))));
  if (!d.conditions || !set.size) return false;
  for (const name of set) if (new RegExp('\\b' + name + '\\b').test(d.conditions)) return true;
  return false;
}

/** Is a storylet eligible right now (random selection)? */
export function eligible(s: GameState, d: StoryletDef, rng: Rng, base: Env, viewCache: Map<string, Record<string, any>>): Record<string, string> | null {
  if (d.followupOnly || SPECIAL_CATEGORIES.has(d.category)) return null;
  if (!actOk(s, d) || onCooldown(s, d)) return null;
  const roleConds = usesRoles(d);
  if (!roleConds) {
    try {
      if (!evaluate(d.conditions, base)) return null;
    } catch {
      return null;
    }
  }
  const roles = bindRoles(s, d, rng, base, {}, viewCache);
  if (!roles) return null;
  if (roleConds) {
    try {
      if (!evaluate(d.conditions, { ...base, ...rolesEnv(s, d, roles) })) return null;
    } catch {
      return null;
    }
  }
  return roles;
}

// ---------------------------------------------------------------- instantiate

export function instantiate(
  s: GameState, d: StoryletDef, roles: Record<string, string>, rng: Rng, source: StoryletInstance['source'], vars: Record<string, number | string> = {}, eventId?: string,
): StoryletInstance {
  const env = { ...globalEnv(s, rng), ...rolesEnv(s, d, roles) };
  const v: Record<string, number | string> = { ...vars };
  for (const [k, expr] of Object.entries(d.vars ?? {})) {
    if (v[k] !== undefined) continue;
    try {
      v[k] = evaluate(expr, { ...env, vars: v });
    } catch {
      v[k] = 0;
    }
  }
  const inst: StoryletInstance = {
    iid: 'st' + s.storylets.seq++,
    id: d.id,
    week: s.week,
    roles,
    vars: v,
    source,
    status: 'pending',
    eventId,
  };
  s.storylets.pending.push(inst);
  const h = (s.storylets.history[d.id] ??= { count: 0, first: s.week, last: s.week });
  h.count++;
  h.last = s.week;
  (s.storylets.categoryLog[d.category] ??= []).push(s.week);
  const log = s.storylets.categoryLog[d.category];
  if (log.length > 30) log.splice(0, log.length - 30);
  for (const id of Object.values(roles)) {
    const f = s.fighters[id];
    if (f) f.storyHistory[d.id] = s.week;
  }
  return inst;
}

/** How many random storylets fire this week. */
export function weeklyQuota(s: GameState, rng: Rng): number {
  const freq = s.sandbox?.scandalFreq ?? 1;
  const base = 1.4 + s.hidden.chaos / 40 + (s.act >= 2 ? 0.4 : 0);
  const n = Math.round((base + rng.float(-0.6, 0.9)) * freq);
  return clamp(n, freq > 0 ? 1 : 0, 5);
}

/** Pick and instantiate this week's random storylets. */
/** Balance instrumentation (tools/sim.ts): how often each storylet was eligible. */
export const STORYLET_STATS: { on: boolean; eligible: Record<string, number> } = { on: false, eligible: {} };

export function selectWeek(s: GameState, rng: Rng, quota = weeklyQuota(s, rng), stats?: Record<string, number>): StoryletInstance[] {
  const out: StoryletInstance[] = [];
  const base = globalEnv(s, rng);
  const viewCache = new Map<string, Record<string, any>>();
  // 1) follow-ups that are due
  const due = s.storylets.scheduled.filter((x) => x.week <= s.week);
  s.storylets.scheduled = s.storylets.scheduled.filter((x) => x.week > s.week);
  for (const fu of due) {
    const d = def(fu.id);
    if (!d) continue;
    // roles must still resolve; conditions are re-checked
    const roles = bindRoles(s, d, rng, base, fu.roles, viewCache);
    if (!roles) continue;
    try {
      if (!evaluate(d.conditions, { ...base, ...rolesEnv(s, d, roles) })) continue;
    } catch {
      continue;
    }
    out.push(instantiate(s, d, roles, rng, 'followup', fu.vars));
  }
  // 2) random storylets
  const candidates: { d: StoryletDef; roles: Record<string, string>; w: number }[] = [];
  for (const d of content().storylets) {
    const roles = eligible(s, d, rng, base, viewCache);
    if (!roles) continue;
    if (stats) stats[d.id] = (stats[d.id] ?? 0) + 1;
    if (STORYLET_STATS.on) STORYLET_STATS.eligible[d.id] = (STORYLET_STATS.eligible[d.id] ?? 0) + 1;
    const h = s.storylets.history[d.id];
    const fresh = !h ? 3.5 : 1 / (1 + h.count * 0.9);
    const recentCat = (s.storylets.categoryLog[d.category] ?? []).filter((wk) => s.week - wk < 4).length;
    const catDamp = 1 / (1 + recentCat * 0.7);
    const scandal = ['legal', 'speech', 'doping', 'president', 'weird'].includes(d.category) ? 0.7 + s.hidden.chaos / 60 : 1;
    candidates.push({ d, roles, w: (d.weight ?? 10) * fresh * catDamp * scandal });
  }
  const perCat: Record<string, number> = {};
  for (let i = 0; i < quota && candidates.length; i++) {
    const idx = rng.weightedIndex(candidates.map((c) => c.w));
    if (idx < 0) break;
    const c = candidates.splice(idx, 1)[0];
    if ((perCat[c.d.category] ?? 0) >= 2) {
      i--;
      continue;
    }
    // a fighter shouldn't star in two stories the same week
    const busy = new Set(out.flatMap((o) => Object.values(o.roles)));
    if (Object.values(c.roles).some((id) => busy.has(id) && s.fighters[id])) {
      i--;
      continue;
    }
    perCat[c.d.category] = (perCat[c.d.category] ?? 0) + 1;
    out.push(instantiate(s, c.d, c.roles, rng, 'random'));
  }
  return out;
}

/** Fire one storylet from a special category (fight night, press conference). */
export function fireCategory(
  s: GameState, category: string, rng: Rng, extraEnv: Env = {}, preset: Record<string, string> = {}, eventId?: string, exclude: string[] = [],
): StoryletInstance | null {
  const base = { ...globalEnv(s, rng), ...extraEnv };
  const viewCache = new Map<string, Record<string, any>>();
  const cands: { d: StoryletDef; roles: Record<string, string>; w: number }[] = [];
  for (const d of content().storylets) {
    if (d.category !== category || d.followupOnly || exclude.includes(d.id)) continue;
    if (!actOk(s, d) || onCooldown(s, d)) continue;
    const roles = bindRoles(s, d, rng, base, preset, viewCache);
    if (!roles) continue;
    try {
      if (!evaluate(d.conditions, { ...base, ...rolesEnv(s, d, roles) })) continue;
    } catch {
      continue;
    }
    const h = s.storylets.history[d.id];
    if (STORYLET_STATS.on) STORYLET_STATS.eligible[d.id] = (STORYLET_STATS.eligible[d.id] ?? 0) + 1;
    cands.push({ d, roles, w: (d.weight ?? 10) * (!h ? 3 : 1 / (1 + h.count)) });
  }
  const pick = rng.weighted(cands, (c) => c.w);
  if (!pick) return null;
  return instantiate(s, pick.d, pick.roles, rng, category === 'presser' ? 'presser' : 'fightnight', {}, eventId);
}

/** Directly start a storylet by id (system triggers). */
export function trigger(s: GameState, id: string, rng: Rng, preset: Record<string, string> = {}, vars: Record<string, number | string> = {}): StoryletInstance | null {
  const d = def(id);
  if (!d) return null;
  const base = globalEnv(s, rng);
  const roles = bindRoles(s, d, rng, base, preset);
  if (!roles) return null;
  return instantiate(s, d, roles, rng, 'system', vars);
}

// ---------------------------------------------------------------- text

export function renderText(s: GameState, inst: StoryletInstance, text: string): string {
  const d = def(inst.id);
  const env: Env = { ...rolesEnv(s, d ?? ({} as StoryletDef), inst.roles), vars: inst.vars, ...inst.vars };
  const first = d && (d.roles?.subject ? 'subject' : Object.keys(d.roles ?? {})[0]);
  const p = first && env[first] && env[first].he ? env[first] : { he: 'he', his: 'his', him: 'him', He: 'He', His: 'His', man: 'man' };
  env.he = p.he;
  env.his = p.his;
  env.him = p.him;
  env.He = p.He;
  env.His = p.His;
  env.president = s.president.name;
  env.presidentLast = s.president.name.split(' ').slice(-1)[0];
  env.promotion = s.promotion.name;
  env.owner = s.owner.name;
  const out = text.replace(/\{(\$?)([a-zA-Z_][a-zA-Z0-9_.]*)\}/g, (m, dollar: string, path: string) => {
    if (path.startsWith('pop')) return m;
    let v: any = env;
    for (const part of path.split('.')) v = v === undefined || v === null ? undefined : v[part];
    if (v === undefined || v === null) return m;
    if (dollar) return money(Number(v));
    return String(v);
  });
  let h = 0;
  for (const ch of inst.id) h = (h * 31 + ch.charCodeAt(0)) >>> 0;
  return expandPop(out, h + (inst.week ?? 0));
}

export function availableChoices(s: GameState, inst: StoryletInstance, rng = new Rng(s.rng)): number[] {
  const d = def(inst.id);
  if (!d) return [];
  const env = { ...globalEnv(s, rng), ...rolesEnv(s, d, inst.roles), vars: inst.vars, ...inst.vars };
  const out: number[] = [];
  d.choices.forEach((c, i) => {
    let ok = true;
    try {
      ok = !!evaluate(c.if, env);
    } catch {
      ok = false;
    }
    if (ok) out.push(i);
  });
  if (!out.length && d.choices.length) out.push(d.choices.length - 1);
  return out;
}

// ---------------------------------------------------------------- effects

export interface EffectCtx {
  s: GameState;
  inst: StoryletInstance;
  d: StoryletDef;
  rng: Rng;
  notes: string[];
}

function roleFighter(ctx: EffectCtx, role: any): Fighter | null {
  const id = typeof role === 'string' ? (ctx.inst.roles[role] ?? role) : role?.id;
  return id ? ctx.s.fighters[id] ?? null : null;
}

function roleId(ctx: EffectCtx, role: any): string | null {
  if (typeof role === 'string') return ctx.inst.roles[role] ?? role;
  return role?.id ?? null;
}

export function effectFunctions(ctx: EffectCtx): Env {
  const { s, rng } = ctx;
  const newsVars = () => {
    const v: Record<string, string | number> = { promotion: s.promotion.name, president: s.president.name, ...ctx.inst.vars };
    for (const [name, id] of Object.entries(ctx.inst.roles)) {
      const type = ctx.d.roles?.[name]?.type ?? 'fighter';
      const view = roleView(s, type, id);
      if (view) {
        v[name] = view.name;
        if (view.last) v[name + 'Last'] = view.last;
        if (view.outlet) v[name + 'Outlet'] = view.outlet;
      }
    }
    return v;
  };
  return {
    follow: (id: string, weeks: number) => {
      s.storylets.scheduled.push({ id, week: s.week + Math.max(1, Math.round(weeks ?? 1)), roles: { ...ctx.inst.roles }, vars: { ...ctx.inst.vars } });
    },
    addTrait: (role: any, t: string) => {
      const f = roleFighter(ctx, role);
      if (f) addTrait(f, t);
    },
    removeTrait: (role: any, t: string) => {
      const f = roleFighter(ctx, role);
      if (f) removeTrait(f, t);
    },
    reveal: (role: any) => {
      const f = roleFighter(ctx, role);
      if (f) {
        f.traits.push(...f.hiddenTraits.filter((t) => !f.traits.includes(t)));
        f.hiddenTraits = [];
      }
    },
    arrest: (role: any, charge: string) => {
      const f = roleFighter(ctx, role);
      if (f && !f.parody) legalArrest(s, f.id, charge, rng);
    },
    arrestPresident: (charge: string) => legalArrest(s, 'president', charge, rng),
    injure: (role: any, weeks: number, name?: string) => {
      const f = roleFighter(ctx, role);
      if (f) f.injuries.push({ name: name ?? 'training injury', until: s.week + Math.round(weeks) });
    },
    suspend: (role: any, weeks: number) => {
      const f = roleFighter(ctx, role);
      if (f) {
        f.legal = 'suspended';
        f.legalUntil = s.week + Math.round(weeks);
      }
    },
    unsuspend: (role: any) => {
      const f = roleFighter(ctx, role);
      if (f && f.legal === 'suspended') {
        f.legal = 'free';
        f.legalUntil = -1;
      }
    },
    release: (role: any) => {
      const f = roleFighter(ctx, role);
      if (f) {
        for (const b of beltsOf(s, f.id)) vacateBelt(s, b, 'released');
        f.promotion = null;
        f.status = 'free-agent';
        f.contract = null;
        addCareerLog(f, `Released by ${s.promotion.name}.`);
      }
    },
    retire: (role: any) => {
      const f = roleFighter(ctx, role);
      if (f) {
        for (const b of beltsOf(s, f.id)) vacateBelt(s, b, 'retired');
        retireFighter(s, f);
      }
    },
    comeback: (role: any) => {
      const f = roleFighter(ctx, role);
      if (f) {
        f.status = 'active';
        f.promotion = 'us';
        f.contract = makeContract(s, f, rng);
        addCareerLog(f, `Came out of retirement at ${f.age}.`);
      }
    },
    sign: (role: any) => {
      const f = roleFighter(ctx, role);
      if (f) signFighter(s, f, makeContract(s, f, rng));
    },
    toRival: (fighterRole: any, rivalRole: any) => {
      const f = roleFighter(ctx, fighterRole);
      const rid = roleId(ctx, rivalRole);
      if (f && rid && s.rivals[rid]) {
        for (const b of beltsOf(s, f.id)) vacateBelt(s, b, 'left for ' + rid);
        f.promotion = rid;
        f.contract = { boutsLeft: 4, purse: Math.round((f.contract?.purse ?? 10000) * 1.5), winBonus: 0, champClause: false, exclusive: true, signedWeek: s.week };
        addCareerLog(f, `Signed with ${content().rivals.find((r) => r.id === rid)?.name ?? rid}.`);
      }
    },
    strip: (role: any) => {
      const f = roleFighter(ctx, role);
      if (f) for (const b of beltsOf(s, f.id)) vacateBelt(s, b, 'stripped');
    },
    interimBelt: (role: any) => {
      const f = roleFighter(ctx, role);
      if (f) newBelt(s, { name: `Interim ${divisionName(f.division)} Championship`, division: f.division, interim: true });
    },
    symbolicBelt: (name: string, role: any) => {
      const f = roleFighter(ctx, role);
      newBelt(s, { name, symbolic: true, holder: f?.id ?? null, division: f?.division ?? null, design: { plate: rng.int(0, 3), strap: rng.int(0, 3), gem: rng.int(0, 3) } });
    },
    pay: (role: any, amount: number) => {
      const f = roleFighter(ctx, role);
      spend(s, 'fighter payments', amount);
      if (f) {
        f.morale = clamp(f.morale + Math.min(15, amount / (2000 * scale(s))), 0, 100);
        f.finances.debt = Math.max(0, f.finances.debt - amount * 0.5);
      }
    },
    raise: (role: any, pct: number) => {
      const f = roleFighter(ctx, role);
      if (f?.contract) f.contract.purse = Math.round((f.contract.purse * (1 + pct / 100)) / 500) * 500;
    },
    scout: (role: any, level: number) => {
      const f = roleFighter(ctx, role);
      if (f) f.scout = Math.max(f.scout, Math.min(3, level));
    },
    heal: (role: any) => {
      const f = roleFighter(ctx, role);
      if (f) f.injuries = [];
    },
    news: (tag: string, tone?: number, weight?: number) => {
      addNews(s, { tags: [tag], vars: newsVars(), weight: weight ?? 5, tone: tone ?? -0.2 });
    },
    headline: (text: string, tone?: number) => {
      addNews(s, { tags: ['storylet'], text: fillTemplate(renderText(s, ctx.inst, text), newsVars()), vars: newsVars(), weight: 6, tone: tone ?? 0 });
    },
    rule: (id: string) => activateRule(s, id, true),
    cite: (reason: string, amount: number) => {
      s.desk.citations.push({ week: s.week, reason, fine: amount, warning: false });
      spend(s, 'citations', amount);
    },
    spend: (cat: string, amt: number) => spend(s, cat, Math.round(amt)),
    earn: (cat: string, amt: number) => earn(s, cat, Math.round(amt)),
    ban: (role: any) => {
      const id = roleId(ctx, role);
      if (id && s.media.reporters[id]) s.media.reporters[id].banned = true;
    },
    unban: (role: any) => {
      const id = roleId(ctx, role);
      if (id && s.media.reporters[id]) s.media.reporters[id].banned = false;
    },
    unlockVenue: (id: string) => {
      if (!s.venuesUnlocked.includes(id)) s.venuesUnlocked.push(id);
    },
    venture: (id: string) => {
      s.promotion.sideVenture = id;
    },
    tvOffer: (network: string, perEvent: number, weeks: number) => {
      const n = content().networks.find((x) => x.id === network);
      if (n) s.market.tvOffers.push({ network, perEvent: Math.round(perEvent || n.basePerEvent), tier: n.tier, weeks: weeks || 104, ppv: n.ppv, expires: s.week + 4 });
    },
    sponsorDeal: (sponsorRole: any, weeks: number, fighterRole?: any) => {
      const id = roleId(ctx, sponsorRole);
      const sp = content().sponsors.find((x) => x.id === id);
      const f = fighterRole ? roleFighter(ctx, fighterRole) : null;
      if (sp) s.sponsorDeals.push({ sponsor: sp.id, weekly: Math.round(sp.weekly * scale(s)), until: s.week + (weeks || 26), fighter: f?.id ?? null });
    },
    dropSponsor: (sponsorRole: any) => {
      const id = roleId(ctx, sponsorRole);
      s.sponsorDeals = s.sponsorDeals.filter((x) => x.sponsor !== id);
    },
    dropSponsors: (n: number) => {
      s.sponsorDeals.splice(0, Math.min(s.sponsorDeals.length, n));
    },
    message: (subject: string, body: string) => {
      s.inbox.push({ id: 'm' + s.storylets.seq++, week: s.week, from: s.owner.name, subject: renderText(s, ctx.inst, subject), body: renderText(s, ctx.inst, body), read: false });
    },
    log: (text: string) => s.log.push({ week: s.week, kind: 'story', text: renderText(s, ctx.inst, text) }),
    rivalry: (r1: any, r2: any) => {
      const a = roleFighter(ctx, r1);
      const b = roleFighter(ctx, r2);
      if (a && b) {
        if (!a.rivals.includes(b.id)) a.rivals.push(b.id);
        if (!b.rivals.includes(a.id)) b.rivals.push(a.id);
        a.hype = clamp(a.hype + 5, 0, 100);
        b.hype = clamp(b.hype + 5, 0, 100);
      }
    },
    endGame: (id: string) => {
      s.ending = id;
      s.endingWeek = s.week;
    },
    lifestyle: (n: number) => {
      s.president.lifestyle = clamp(Math.round(n), 0, 2);
    },
    unlockDivisions: (gender: string) => {
      for (const d of content().divisions) if (d.gender === gender && !s.divisionsOpen.includes(d.id)) s.divisionsOpen.push(d.id);
    },
    reporterRel: (role: any, delta: number) => {
      const id = roleId(ctx, role);
      if (id && s.media.reporters[id]) s.media.reporters[id].rel = clamp(s.media.reporters[id].rel + delta, -100, 100);
    },
    meter: (key: string, delta: number) => {
      if ((METER_KEYS as readonly string[]).includes(key)) adjustMeter(s, key as MeterKey, delta);
      else if (key === 'heat' || key === 'patience' || key === 'chaos') adjustHidden(s, key, delta);
    },
    setFlag: (key: string, value: number | string | boolean) => {
      s.flags[key] = value;
    },
    addFlag: (key: string, delta: number) => {
      s.flags[key] = (Number(s.flags[key]) || 0) + delta;
    },
    allFighters: (key: string, delta: number) => {
      for (const f of Object.values(s.fighters)) {
        if (f.promotion !== 'us' || f.status !== 'active') continue;
        if (key === 'morale') f.morale = clamp(f.morale + delta, 0, 100);
        if (key === 'loyalty') f.loyalty = clamp(f.loyalty + delta, 0, 100);
      }
    },
  };
}

const FIGHTER_FIELDS: Record<string, (f: Fighter, op: string, v: number | string) => void> = {};
function numField(get: (f: Fighter) => number, set: (f: Fighter, v: number) => void, lo = 0, hi = 100) {
  return (f: Fighter, op: string, v: number | string) => {
    const cur = get(f);
    const n = Number(v);
    const next = op === '=' ? n : op === '+=' ? cur + n : op === '-=' ? cur - n : cur * n;
    set(f, clamp(next, lo, hi));
  };
}
FIGHTER_FIELDS.morale = numField((f) => f.morale, (f, v) => (f.morale = v));
FIGHTER_FIELDS.loyalty = numField((f) => f.loyalty, (f, v) => (f.loyalty = v));
FIGHTER_FIELDS.hype = numField((f) => f.hype, (f, v) => (f.hype = v));
FIGHTER_FIELDS.star = numField((f) => f.starPower, (f, v) => (f.starPower = v));
FIGHTER_FIELDS.beef = numField((f) => f.beefWithYou, (f, v) => (f.beefWithYou = v));
FIGHTER_FIELDS.addiction = numField((f) => f.addiction, (f, v) => (f.addiction = v));
FIGHTER_FIELDS.damage = numField((f) => f.damage, (f, v) => (f.damage = v));
FIGHTER_FIELDS.moneyIQ = numField((f) => f.moneyIQ, (f, v) => (f.moneyIQ = v));
FIGHTER_FIELDS.debt = numField((f) => f.finances.debt, (f, v) => (f.finances.debt = v), 0, 1e9);
FIGHTER_FIELDS.followers = numField((f) => f.social.followers, (f, v) => (f.social.followers = Math.round(v)), 0, 1e10);
FIGHTER_FIELDS.weightMisses = numField((f) => f.weightMisses, (f, v) => (f.weightMisses = v), 0, 99);
FIGHTER_FIELDS.streaming = (f, _op, v) => (f.streaming = !!v);
FIGHTER_FIELDS.purse = (f, op, v) => {
  if (!f.contract) return;
  const n = Number(v);
  const cur = f.contract.purse;
  f.contract.purse = Math.max(500, Math.round((op === '=' ? n : op === '+=' ? cur + n : op === '-=' ? cur - n : cur * n) / 100) * 100);
};
FIGHTER_FIELDS.legal = (f, _op, v) => (f.legal = String(v) as Fighter['legal']);

export function applyStatement(ctx: EffectCtx, src: string, env: Env): void {
  const st = parseStatement(src);
  const { s } = ctx;
  if (st.kind === 'call') {
    st.call!(env);
    return;
  }
  const path = st.target!;
  const v = st.value!(env);
  const op = st.op!;
  const n = Number(v) || 0;
  const delta = op === '+=' ? n : op === '-=' ? -n : null;
  const root = path[0];
  if (path.length === 1) {
    if ((METER_KEYS as readonly string[]).includes(root)) {
      const k = root as MeterKey;
      if (delta !== null) adjustMeter(s, k, delta);
      else if (op === '=') s.meters[k] = clamp(n, 0, 100);
      else s.meters[k] = clamp(s.meters[k] * n, 0, 100);
      return;
    }
    if (root === 'heat' || root === 'patience' || root === 'chaos') {
      if (delta !== null) adjustHidden(s, root, delta);
      else s.hidden[root] = clamp(op === '=' ? n : s.hidden[root] * n, 0, 100);
      return;
    }
    if (root === 'cash') {
      const amt = delta !== null ? delta : op === '=' ? n - s.promotion.cash : s.promotion.cash * (n - 1);
      if (amt >= 0) earn(s, 'storylines', Math.round(amt));
      else spend(s, 'storylines', Math.round(-amt));
      return;
    }
    if (root === 'wealth') {
      const amt = delta !== null ? delta : op === '=' ? n - s.president.wealth : s.president.wealth * (n - 1);
      personal(s, 'side deals', Math.round(amt));
      return;
    }
    if (root === 'debt') {
      s.promotion.debt = Math.max(0, delta !== null ? s.promotion.debt + delta : n);
      return;
    }
    // bare identifier: treat as a flag
    setFlag(s, root, op, v);
    return;
  }
  if (root === 'flag' || root === 'flags') {
    setFlag(s, path.slice(1).join('.'), op, v);
    return;
  }
  if (root === 'vars') {
    const k = path[1];
    const cur = Number(ctx.inst.vars[k]) || 0;
    ctx.inst.vars[k] = op === '=' ? v : op === '+=' ? cur + n : op === '-=' ? cur - n : cur * n;
    return;
  }
  if (root === 'president') {
    const k = path[1] as keyof GameState['president'];
    const cur = s.president[k] as unknown;
    if (typeof cur === 'number') (s.president as any)[k] = Math.max(0, op === '=' ? n : op === '+=' ? cur + n : op === '-=' ? cur - n : cur * n);
    else (s.president as any)[k] = v;
    return;
  }
  if (root === 'promotion') {
    const k = path[1];
    if (k === 'staff') s.promotion.staff = Math.max(0, op === '=' ? n : s.promotion.staff + (delta ?? 0));
    if (k === 'name') s.promotion.name = String(v);
    return;
  }
  // role fields
  const roleIdV = ctx.inst.roles[root];
  if (roleIdV) {
    const type = ctx.d.roles?.[root]?.type ?? 'fighter';
    const field = path[1];
    if (type === 'reporter') {
      const r = s.media.reporters[roleIdV];
      if (r && field === 'rel') r.rel = clamp(op === '=' ? n : r.rel + (delta ?? 0), -100, 100);
      if (r && field === 'banned') r.banned = !!v;
      return;
    }
    if (type === 'rival') {
      const r = s.rivals[roleIdV];
      if (!r) return;
      if (field === 'strength') r.strength = clamp(op === '=' ? n : r.strength + (delta ?? 0), 0, 100);
      if (field === 'cash') r.cash = op === '=' ? n : r.cash + (delta ?? 0);
      if (field === 'relationship') r.relationship = clamp(op === '=' ? n : r.relationship + (delta ?? 0), -100, 100);
      if (field === 'alive') r.alive = !!v;
      return;
    }
    const f = s.fighters[roleIdV];
    if (!f) return;
    if (FIGHTER_FIELDS[field]) {
      FIGHTER_FIELDS[field](f, op, v);
      if (field === 'hype') f.starPower = computeStarPower(s, f);
      return;
    }
    if (field in f.skills || (path[1] === 'skills' && path[2])) {
      const sk = (path[1] === 'skills' ? path[2] : field) as keyof Fighter['skills'];
      const cur = f.skills[sk];
      f.skills[sk] = clamp(Math.round(op === '=' ? n : cur + (delta ?? 0)), 1, 99);
      return;
    }
  }
}

function setFlag(s: GameState, key: string, op: string, v: unknown): void {
  const cur = Number(s.flags[key]) || 0;
  const n = Number(v);
  if (op === '=') s.flags[key] = v as number | string | boolean;
  else if (op === '+=') s.flags[key] = cur + n;
  else if (op === '-=') s.flags[key] = cur - n;
  else s.flags[key] = cur * n;
}

/** Resolve a pending storylet with a choice. Returns the result text. */
export function resolveStorylet(s: GameState, iid: string, choiceIdx: number, rng: Rng): string {
  const inst = s.storylets.pending.find((x) => x.iid === iid);
  if (!inst) return '';
  const d = def(inst.id);
  if (!d) {
    inst.status = 'resolved';
    return '';
  }
  const avail = availableChoices(s, inst, rng);
  const idx = avail.includes(choiceIdx) ? choiceIdx : avail[avail.length - 1];
  const choice: ChoiceDef | undefined = d.choices[idx];
  const ctx: EffectCtx = { s, inst, d, rng, notes: [] };
  if (choice) {
    const env: Env = { ...globalEnv(s, rng), ...rolesEnv(s, d, inst.roles), vars: inst.vars, ...inst.vars, ...effectFunctions(ctx) };
    for (const eff of choice.effects ?? []) {
      try {
        applyStatement(ctx, eff, env);
      } catch (e) {
        console.warn(`Storylet ${d.id} effect failed: ${eff}`, e);
      }
    }
  }
  inst.status = 'resolved';
  inst.choice = idx;
  inst.resultText = choice?.result ? renderText(s, inst, choice.result) : '';
  s.storylets.pending = s.storylets.pending.filter((x) => x !== inst);
  s.storylets.resolved.push(inst);
  if (s.storylets.resolved.length > 40) s.storylets.resolved.splice(0, s.storylets.resolved.length - 40);
  s.stats.storyletsResolved = (s.stats.storyletsResolved ?? 0) + 1;
  return inst.resultText;
}

/** Default choice when the player ignores a storylet. */
export function defaultChoice(d: StoryletDef): number {
  const i = d.choices.findIndex((c) => (c as ChoiceDef & { default?: boolean }).default);
  return i >= 0 ? i : d.choices.length - 1;
}

export function expirePending(s: GameState, rng: Rng, filter?: (i: StoryletInstance) => boolean): void {
  for (const inst of s.storylets.pending.slice()) {
    if (filter && !filter(inst)) continue;
    const d = def(inst.id);
    resolveStorylet(s, inst.iid, d ? defaultChoice(d) : 0, rng);
    inst.status = 'expired';
  }
}
