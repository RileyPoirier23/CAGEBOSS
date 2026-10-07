/**
 * Rulebook: which rules are active and the merged parameters the desk
 * documents are checked against. Rules unlock by act or via storylets.
 */
import type { GameState } from '../core/types';
import { content, type RuleDef } from '../core/content';
import { addNews } from './news';

export function ruleDef(id: string): RuleDef | undefined {
  return content().rules.find((r) => r.id === id);
}

export function activateRule(s: GameState, id: string, announce = true): boolean {
  if (s.rules.active.includes(id)) return false;
  const r = ruleDef(id);
  if (!r) return false;
  s.rules.active.push(id);
  if (r.params) Object.assign(s.rules.params, r.params);
  if (announce && r.announce) addNews(s, { tags: ['notice', 'rule'], text: r.announce, vars: {}, weight: 4, tone: 0 });
  s.log.push({ week: s.week, kind: 'rule', text: `New rule: ${r.title}` });
  return true;
}

export function activateRulesForAct(s: GameState, act: number, announce = true): string[] {
  const out: string[] = [];
  const strict = s.sandbox?.strictness ?? 1;
  for (const r of content().rules) {
    // strict commissions bring rules in an act early; lax ones delay them
    const effectiveAct = r.act === 0 ? 0 : Math.round(r.act - (strict - 1));
    if (effectiveAct <= act && activateRule(s, r.id, announce)) out.push(r.id);
  }
  return out;
}

export function ruleActive(s: GameState, id: string): boolean {
  return s.rules.active.includes(id);
}

export function param<T = number>(s: GameState, key: string, fallback: T): T {
  const v = s.rules.params[key];
  return (v === undefined ? fallback : v) as T;
}

// ---------------------------------------------------------------- desk schedule (Papers, Please-style)

/** Story triggers that bring a rule in early (a reaction to what happened). */
const REACTIVE: Record<string, (s: GameState) => boolean> = {
  // you cleared a fighter with a bad medical
  unsafe_medical: (s) => s.week >= 6 && Object.keys(s.flags).some((k) => k.startsWith('unsafe_')),
  // you waved fighters through who missed weight
  weight_waivers: (s) => s.week >= 6 && (s.stats.weightWaivers ?? 0) >= 2,
  // doping busts or covered-up tests
  doping: (s) => s.rules.active.includes('drug_program') && (s.stats.dopingBusts ?? 0) + (Number(s.flags.covered_tests) || 0) >= 2,
};

/**
 * Morning rule activation: rules unlock on their career week (career/tiny
 * starts) or early when a story trigger fires. Returns the newly active ids.
 */
export function activateScheduledRules(s: GameState): string[] {
  const out: string[] = [];
  for (const r of content().rules) {
    if (s.rules.active.includes(r.id)) continue;
    const byWeek = r.week !== undefined && s.week >= r.week;
    const byStory = !!r.reactive && !!REACTIVE[r.reactive]?.(s);
    if ((byWeek || byStory) && activateRule(s, r.id, s.week > 0)) {
      s.flags['rule_week_' + r.id] = s.week;
      out.push(r.id);
    }
  }
  return out;
}

/** Rules that went live this week (rulebook 'NEW' tabs). */
export function rulesNewThisWeek(s: GameState): string[] {
  return s.rules.active.filter((id) => s.flags['rule_week_' + id] === s.week);
}

export function rulebookPages(s: GameState): { page: string; rules: RuleDef[] }[] {
  const pages: { page: string; rules: RuleDef[] }[] = [];
  for (const id of s.rules.active) {
    const r = ruleDef(id);
    if (!r) continue;
    let p = pages.find((x) => x.page === r.page);
    if (!p) pages.push((p = { page: r.page, rules: [] }));
    p.rules.push(r);
  }
  return pages;
}
