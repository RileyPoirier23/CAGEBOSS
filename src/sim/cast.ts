/**
 * The Road To Champion cast: Han (you), the bosses who hold the belts at every stop, the
 * referee nobody should have hired, and the cowboy who signs you in Legacy Mode.
 *
 * Several of these are the developer's friends, who asked to be in the game (see the credits):
 * Spadam Biggs, "Dirty" Daniel Stinkovich, Xavier "Allstar" Cockett and Zac "The Attacker" Buna.
 *
 *  - Wyatt "LeproClepto" Smitt: regional champion. A leprechaun with a beard to his belt. His
 *    title fight can't be finished early, and in round 3 he gets himself disqualified.
 *  - Zac "The Attacker" Buna: the Lounge champion. A jiu-jitsu wizard whose crooked manager tells
 *    him he's a striker: no grappling in his fight. Afterwards he's your sparring partner.
 *  - Spadam "The White Beast" Biggs: undefeated CBFC welterweight champion, 6'7", 99 overall.
 *    The last fight of the road, a superfight at welterweight, refereed by "Dirty" Daniel.
 */
import type { Fighter, GameState, Skills } from '../core/types';
import type { OfficialDef } from '../core/content';
import { Rng } from '../core/rng';
import { content } from '../core/content';
import { generateFighter } from './generate';
import { loadJSON, storeJSON } from '../core/save';

export const HAN = {
  first: 'Han', last: 'Tibular', nick: 'The Pride Of The Maritimes', gender: 'M' as const, culture: 'canada', division: 'light',
  height: 183, reach: 188, age: 21, hometown: 'Moncton, New Brunswick', country: 'Canada',
  // long brown waves with a middle part, grey-blue eyes, a few freckles, a thin moustache and a chin patch,
  // a gold chain, and a koi on the shoulder
  look: { head: 0, skin: 1, hair: 9, hairColor: 2, beard: 5, brows: 2, eyes: 0, nose: 0, ears: 0, scar: 0, tattoo: 0, build: 1, iris: 5, freckles: 1, chain: 1, inkArt: 1 } as Fighter['look'],
};

export type BossId = 'rival' | 'wyatt' | 'zac' | 'spadam';
export const BOSS_IDS: string[] = ['wyatt', 'zac', 'spadam'];
export const isBoss = (id: string | null | undefined): boolean => !!id && BOSS_IDS.includes(id);

interface BossDef {
  id: string; first: string; last: string; nick: string; division: string; height: number; reach: number; age: number;
  country: string; hometown: string; gym: string; look: Fighter['look']; skills: Partial<Skills>; record: [number, number];
  styles: string[]; traits: string[]; log: string;
}

const BOSSES: Record<string, BossDef> = {
  wyatt: {
    id: 'wyatt', first: 'Wyatt', last: 'Smitt', nick: 'LeproClepto', division: 'light', height: 142, reach: 140, age: 38,
    country: 'Canada', hometown: 'Sussex, New Brunswick (he says Dublin)', gym: 'The Pot O\' Gold Fight Club (a storage unit)',
    look: { head: 1, skin: 0, hair: 2, hairColor: 5, beard: 6, brows: 1, eyes: 2, nose: 1, ears: 1, scar: 1, tattoo: 0, build: 1, hat: 2 },
    skills: { striking: 66, power: 70, wrestling: 58, grappling: 55, cardio: 80, chin: 85, fightIQ: 60, durability: 85, heart: 90, weightCut: 10 },
    record: [12, 0], styles: ['Brawler'], traits: ['Trash Talker', 'Gambler', 'Prankster'],
    log: 'Four foot eight of bad intentions. Has never been finished. Has never been searched at the door either, which explains a lot.',
  },
  zac: {
    id: 'zac', first: 'Zac', last: 'Buna', nick: 'The Attacker', division: 'light', height: 178, reach: 180, age: 26,
    country: 'Canada', hometown: 'Saint John, New Brunswick', gym: 'Whatever gym his manager says this week',
    look: { head: 2, skin: 0, hair: 2, hairColor: 5, beard: 1, brows: 1, eyes: 1, nose: 1, ears: 2, scar: 0, tattoo: 0, build: 1, freckles: 1 },
    skills: { striking: 68, power: 66, wrestling: 80, grappling: 93, cardio: 78, chin: 72, fightIQ: 60, durability: 72, heart: 85, weightCut: 40 },
    record: [15, 2], styles: ['Sub Hunter'], traits: ['Loyal', 'Wholesome'],
    log: 'Black belt in jiu-jitsu at nineteen. His manager tells him he is a kickboxer. He has never read his own contract.',
  },
  spadam: {
    id: 'spadam', first: 'Spadam', last: 'Biggs', nick: 'The White Beast', division: 'welter', height: 201, reach: 208, age: 30,
    country: 'Canada', hometown: 'Halifax, Nova Scotia', gym: 'Beast Mode Kickboxing',
    look: { head: 3, skin: 0, hair: 1, hairColor: 4, beard: 1, brows: 0, eyes: 1, nose: 2, ears: 1, scar: 2, tattoo: 0, build: 2 },
    skills: { striking: 99, power: 99, wrestling: 99, grappling: 99, cardio: 99, chin: 99, fightIQ: 99, durability: 99, heart: 99, weightCut: 30 },
    record: [24, 0], styles: ['Kickboxer', 'Counter Striker'], traits: ['Showman', 'Business Savvy'],
    log: 'Six foot seven. Twenty-four and oh. Kickboxing world champion before he ever set foot in a cage. Has never been taken down. Has never had a point taken off him either, which is a story in itself.',
  },
};

/** Put a boss into the world (once). */
export function makeBoss(s: GameState, id: string, promotion: string): Fighter {
  if (s.fighters[id]) return s.fighters[id];
  const d = BOSSES[id];
  const rng = new Rng(id.length * 7919 + 33);
  const f = generateFighter(rng, content().names, { division: d.division, gender: 'M', tier: 'contender', culture: 'canada', id });
  Object.assign(f, {
    first: d.first, last: d.last, nick: d.nick, height: d.height, reach: d.reach, age: d.age, country: d.country, hometown: d.hometown,
    gym: d.gym, look: { ...d.look }, styles: [...d.styles], traits: [...d.traits], hiddenTraits: [], potential: 99,
    record: { w: d.record[0], l: d.record[1], d: 0, nc: 0 }, streak: d.record[0], status: 'active', promotion, contract: null, hype: 60,
    careerLog: [d.log], injuries: [],
  });
  f.skills = { ...f.skills, ...d.skills };
  s.fighters[id] = f;
  return f;
}

/** A boss as a standalone fighter (Quick Fight). */
export function bossFighter(id: string): Fighter | null {
  const d = BOSSES[id];
  if (!d) return null;
  const tmp = { fighters: {} } as unknown as GameState;
  return makeBoss(tmp, id, 'us');
}

/** Han as a standalone fighter (Quick Fight, after you finish the road). */
export function hanFighter(): Fighter {
  const rng = new Rng(2001);
  const f = generateFighter(rng, content().names, { division: 'light', gender: 'M', tier: 'elite', culture: 'canada', id: 'han' });
  Object.assign(f, {
    first: HAN.first, last: HAN.last, nick: HAN.nick, height: HAN.height, reach: HAN.reach, age: 24, country: HAN.country, hometown: HAN.hometown,
    gym: "Ray's Boxing & Soup", look: { ...HAN.look }, styles: ['Counter Striker'], traits: ['Hungry'], record: { w: 30, l: 1, d: 0, nc: 0 },
  });
  f.skills = { striking: 92, power: 86, wrestling: 84, grappling: 86, cardio: 92, chin: 88, fightIQ: 90, durability: 86, heart: 99, weightCut: 40 };
  return f;
}

// ------------------------------------------------------------------ the worst referee alive

export const DIRTY_DANIEL: OfficialDef = {
  id: 'dirty_daniel', name: '"Dirty" Daniel Stinkovich', role: 'referee', bias: 'late', fouls: 'lenient', standups: 'fast', competence: 4,
  desc: "Curly mop, glasses he only wears while working, and the confidence of a man who has never once been right. Spadam Biggs's favourite referee. Every one of Spadam's fights. Every single one.",
};

// ------------------------------------------------------------------ boss fight rules

export type BossRule = 'leprechaun' | 'standup' | 'dirty' | null;

/** The special rules for a fight against this opponent (only in the story, only for the title). */
export function bossRule(s: GameState, oppId: string, title: boolean): BossRule {
  const st = (s as GameState & { fm?: { legacy?: boolean; story?: unknown } }).fm;
  if (!st || st.legacy || !st.story) return null;
  if (oppId === 'wyatt' && title) return 'leprechaun';
  if (oppId === 'zac' && title) return 'standup';
  if (oppId === 'spadam') return 'dirty';
  return null;
}

// ------------------------------------------------------------------ Quick Fight unlocks

const UNLOCK_KEY = 'cageboss.unlocks';
/** Unlock a boss (or Han) for Quick Fight. Returns true if it's new. */
export function unlockFighter(id: string): boolean {
  const u = loadJSON<Record<string, number>>(UNLOCK_KEY, {});
  if (u[id]) return false;
  u[id] = Date.now();
  storeJSON(UNLOCK_KEY, u);
  return true;
}
export const unlockedFighters = (): string[] => Object.keys(loadJSON<Record<string, number>>(UNLOCK_KEY, {}));
