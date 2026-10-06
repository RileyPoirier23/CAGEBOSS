/**
 * Fighter helpers: naming, pronouns, availability, scouting fog, aging /
 * prime-age progression, retirement, healing (cutman-driven) and vices.
 */
import type { Fighter, GameState, Skills } from '../core/types';
import { hashString, Rng } from '../core/rng';
import { clamp } from '../core/format';

export const fullName = (f: Fighter) => `${f.first} ${f.last}`;
export const nickName = (f: Fighter) => (f.nick ? `${f.first} "${f.nick}" ${f.last}` : fullName(f));
export const shortName = (f: Fighter) => f.last;

export function pronouns(f: { gender: 'M' | 'W' }): { he: string; his: string; him: string; He: string; His: string; man: string } {
  return f.gender === 'W'
    ? { he: 'she', his: 'her', him: 'her', He: 'She', His: 'Her', man: 'woman' }
    : { he: 'he', his: 'his', him: 'him', He: 'He', His: 'His', man: 'man' };
}

export function pronounize(text: string, f: { gender: 'M' | 'W' }): string {
  const p = pronouns(f);
  return text.replace(/\{(he|his|him|He|His|man)\}/g, (_, k: keyof typeof p) => p[k]);
}

export function isOurs(f: Fighter): boolean {
  return f.promotion === 'us' && f.status === 'active';
}

export function ourFighters(s: GameState): Fighter[] {
  return Object.values(s.fighters).filter(isOurs);
}

export function isInjured(f: Fighter, week: number): boolean {
  return f.injuries.some((i) => i.until > week) || f.medSuspUntil > week;
}

export function legalBlocked(f: Fighter): boolean {
  return f.legal === 'arrested' || f.legal === 'jailed' || f.legal === 'suspended' || f.legal === 'banned';
}

/** Can be booked on a card happening in `week`. */
export function isAvailable(s: GameState, f: Fighter, week: number): boolean {
  if (!isOurs(f)) return false;
  if (legalBlocked(f)) return false;
  if (f.injuries.some((i) => i.until > week)) return false;
  if (f.medSuspUntil > week) return false;
  if (f.contract && f.contract.boutsLeft <= 0) return false;
  if (!s.divisionsOpen.includes(f.division)) return false;
  return true;
}

export function isBooked(s: GameState, id: string): boolean {
  return s.events.some((e) => e.status === 'scheduled' && e.card.some((b) => b.status === 'scheduled' && (b.a === id || b.b === id)));
}

export const SKILL_WEIGHTS: Record<keyof Skills, number> = {
  striking: 0.18, power: 0.12, wrestling: 0.14, grappling: 0.12, cardio: 0.1, chin: 0.1, fightIQ: 0.12, durability: 0.06, heart: 0.06, weightCut: 0,
};

export function overall(sk: Skills): number {
  let t = 0;
  for (const k in SKILL_WEIGHTS) t += sk[k as keyof Skills] * SKILL_WEIGHTS[k as keyof Skills];
  return Math.round(t);
}

// ---------------------------------------------------------------- scouting fog

export const SCOUT_ERROR = [16, 9, 4, 0];
export const SCOUT_COST = [0, 2500, 12000, 30000];
export const SCOUT_LABEL = ['Rumours', 'Tape study', 'Scout sent', 'Full workup'];

export function effectiveScout(f: Fighter): number {
  return f.promotion === 'us' ? Math.max(1, f.scout) : f.scout;
}

function fog(f: Fighter, key: string): number {
  return ((hashString(f.id + ':' + key) % 2001) / 1000 - 1); // -1..1, stable per fighter
}

/** The skill value the player sees (true value + stable scouting error). */
export function seenSkill(f: Fighter, key: keyof Skills): number {
  const err = SCOUT_ERROR[effectiveScout(f)];
  return clamp(Math.round(f.skills[key] + fog(f, key) * err), 1, 99);
}

export function seenOverall(f: Fighter): number {
  const err = SCOUT_ERROR[effectiveScout(f)];
  return clamp(Math.round(overall(f.skills) + fog(f, 'ovr') * err * 0.7), 1, 99);
}

export function grade(v: number): string {
  if (v >= 90) return 'A+';
  if (v >= 82) return 'A';
  if (v >= 75) return 'B+';
  if (v >= 68) return 'B';
  if (v >= 60) return 'C+';
  if (v >= 52) return 'C';
  if (v >= 44) return 'D';
  return 'F';
}

export function seenPotential(f: Fighter): string {
  const sc = effectiveScout(f);
  if (sc === 0) return '??';
  const err = SCOUT_ERROR[sc] * 1.2;
  const p = f.potential + fog(f, 'pot') * err;
  if (sc === 3) return grade(f.potential);
  const lo = grade(p - err);
  const hi = grade(p + err);
  return lo === hi ? lo : `${lo}~${hi}`;
}

export function visibleTraits(f: Fighter): string[] {
  return effectiveScout(f) >= 3 ? [...f.traits, ...f.hiddenTraits] : f.traits;
}

export function moneyRead(f: Fighter): string {
  const sc = effectiveScout(f);
  if (sc < 2) return 'Unknown';
  const v = f.moneyIQ + (sc === 2 ? fog(f, 'money') * 15 : 0);
  return v >= 75 ? 'Trustworthy' : v >= 50 ? 'Mostly fine' : v >= 30 ? 'Keep an eye on it' : 'Do NOT give this person cash';
}

// ---------------------------------------------------------------- star power & value

export function isChamp(s: GameState, id: string): boolean {
  return Object.values(s.belts).some((b) => b.holder === id && !b.retired);
}

export function computeStarPower(s: GameState, f: Fighter): number {
  const followers = Math.log10(Math.max(10, f.social.followers));
  const winRate = (f.record.w + 1) / (f.record.w + f.record.l + 2);
  const champ = isChamp(s, f.id) ? 18 : 0;
  const marquee = f.marquee ? 10 : 0;
  const sp = f.hype * 0.45 + followers * 5 + winRate * 18 + champ + marquee + Math.max(0, f.streak) * 2 - 10;
  return clamp(Math.round(sp), 0, 100);
}

/** What a fighter would ask per fight right now. */
export function marketPurse(s: GameState, f: Fighter): number {
  const ovr = overall(f.skills);
  const base = 500 + Math.pow(Math.max(0, ovr - 35), 1.8) * 4 + Math.pow(f.starPower, 2) * 0.8;
  const actMult = [1, 1, 1.8, 3.5, 6, 9][s.act] ?? 1;
  const greed = s.sandbox?.greed ?? 1;
  const merc = f.traits.includes('Mercenary') ? 1.25 : f.traits.includes('Loyal') ? 0.9 : 1;
  const champ = isChamp(s, f.id) ? 1.6 : 1;
  return Math.round((base * actMult * greed * merc * champ) / 500) * 500;
}

// ---------------------------------------------------------------- weekly upkeep

/** Heal visible wounds. Better cutmen = faster, cleaner healing. */
export function healWeek(f: Fighter, rng: Rng): void {
  const w = f.wounds;
  const p = 0.35 + f.cutman.rating / 140;
  const dec = (v: number) => (v > 0 && rng.chance(p) ? v - 1 : v);
  w.cuts = dec(w.cuts);
  w.swelling = dec(dec(w.swelling));
  w.blackEye = dec(w.blackEye);
  w.noseBleed = false;
  if (w.cuts === 0) w.bandages = Math.max(0, w.bandages - (rng.chance(p) ? 2 : 1));
}

export function woundScore(f: Fighter): number {
  const w = f.wounds;
  return w.cuts * 3 + w.swelling * 2 + w.blackEye * 2 + w.bandages + (w.noseBleed ? 1 : 0);
}

export function upkeepWeek(s: GameState, f: Fighter, rng: Rng): string[] {
  const notes: string[] = [];
  healWeek(f, rng);
  f.injuries = f.injuries.filter((i) => i.until > s.week);
  f.hype = clamp(f.hype - (s.week - f.lastFightWeek > 16 ? 0.6 : 0.15), 0, 100);
  f.morale = clamp(f.morale + (f.morale < 50 ? 0.4 : -0.2), 0, 100);
  // vice spiral
  const party = f.traits.includes('Party Animal') || f.hiddenTraits.includes('Party Animal');
  const prone = f.traits.includes('Addictive Personality') || f.hiddenTraits.includes('Addictive Personality');
  const sober = f.traits.includes('Sober') || f.traits.includes('Reformed');
  if (sober) f.addiction = Math.max(0, f.addiction - 1.5);
  else if (prone || (party && f.vices.length)) {
    const drift = (f.morale < 40 ? 0.9 : 0.25) + (f.finances.spending === 'lavish' ? 0.2 : 0) - (f.traits.includes('Family First') ? 0.2 : 0);
    f.addiction = clamp(f.addiction + drift * rng.float(0, 1.4) - 0.15, 0, 100);
    if (f.addiction > 60) {
      f.skills.cardio = clamp(f.skills.cardio - (rng.chance(0.1) ? 1 : 0), 10, 99);
      if (!f.traits.includes('Addictive Personality') && f.hiddenTraits.includes('Addictive Personality')) {
        f.hiddenTraits = f.hiddenTraits.filter((t) => t !== 'Addictive Personality');
        f.traits.push('Addictive Personality');
        notes.push(`${fullName(f)}'s partying is no longer a secret.`);
      }
    }
  }
  // money management: lavish spenders burn cash, low money-IQ fighters pile up debt
  if (f.contract) {
    const leak = (100 - f.moneyIQ) / 100;
    if (rng.chance(0.03 * leak)) f.finances.debt += Math.round(rng.int(1, 10) * 2000 * leak);
    if (f.moneyIQ > 70 && f.finances.debt > 0 && rng.chance(0.05)) f.finances.debt = Math.max(0, f.finances.debt - 5000);
  }
  // social following grows with hype, faster for streamers
  const growth = 1 + (f.hype / 100) * 0.004 + (f.streaming ? 0.003 : 0);
  f.social.followers = Math.round(f.social.followers * growth);
  return notes;
}

/** Yearly aging: skills move toward/away from the fighter's prime. */
export function ageFighter(f: Fighter, rng: Rng): void {
  f.age += 1;
  const gap = f.age - f.primeAge;
  const gymRat = f.traits.includes('Gym Rat') ? 1.3 : 1;
  const lazy = f.traits.includes('Lazy') || f.hiddenTraits.includes('Lazy') ? 0.55 : 1;
  const physical: (keyof Skills)[] = ['power', 'cardio', 'chin', 'durability'];
  for (const key of Object.keys(f.skills) as (keyof Skills)[]) {
    if (key === 'weightCut') {
      if (gap > 0) f.skills.weightCut = clamp(f.skills.weightCut + rng.int(0, 3), 1, 99);
      continue;
    }
    let v = f.skills[key];
    if (gap < -1) {
      const room = Math.max(0, f.potential - v);
      v += (rng.float(0, 2.5) + room / 9) * gymRat * lazy;
      v = Math.min(v, f.potential + 2);
    } else if (gap <= 1) {
      v += rng.int(-1, 1) + (key === 'fightIQ' ? 1 : 0);
    } else {
      const decline = (gap - 1) * 0.9 + rng.float(0, 2);
      const mult = physical.includes(key) ? 1.35 : key === 'fightIQ' ? 0.25 : 0.8;
      v -= decline * mult * (f.traits.includes('Gym Rat') ? 0.85 : 1);
      if (key === 'fightIQ' && gap < 6) v += rng.int(0, 1);
    }
    if (key === 'chin' || key === 'durability') v -= f.damage / 45;
    f.skills[key] = clamp(Math.round(v), 10, 99);
  }
}

export function retirementChance(f: Fighter, champ: boolean): number {
  if (f.legend || f.status === 'retired') return 0;
  const over = f.age - f.primeAge;
  let p = over > 4 ? 0.12 + (over - 4) * 0.06 : f.age > 38 ? 0.15 : 0.005;
  if (f.damage > 70) p += 0.2;
  if (f.koLosses >= 3) p += 0.08;
  if (f.streak <= -3) p += 0.12;
  if (f.traits.includes('Family First') || f.traits.includes('Devout')) p += 0.03;
  if (champ) p *= 0.4;
  if (f.traits.includes('Mercenary')) p *= 0.7;
  return clamp(p, 0, 0.9);
}

export function retire(s: GameState, f: Fighter): void {
  f.status = 'retired';
  f.legend = true;
  f.retiredWeek = s.week;
  f.contract = null;
  f.promotion = null;
  f.careerLog.push(`Retired at ${f.age} with a record of ${f.record.w}-${f.record.l}.`);
}

export function addCareerLog(f: Fighter, line: string): void {
  f.careerLog.push(line);
  if (f.careerLog.length > 20) f.careerLog.splice(0, f.careerLog.length - 20);
}

export function addTrait(f: Fighter, t: string): void {
  if (!f.traits.includes(t)) f.traits.push(t);
  f.hiddenTraits = f.hiddenTraits.filter((x) => x !== t);
}

export function removeTrait(f: Fighter, t: string): void {
  f.traits = f.traits.filter((x) => x !== t);
}

export function hasTrait(f: Fighter, t: string): boolean {
  return f.traits.includes(t);
}
