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
