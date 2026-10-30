/* UNIVERSE CLASH - the long game.
   Levels, gear, packs, rival memory, stage scars and options. Plain data and
   pure functions: no DOM, no localStorage unless a storage object is passed in.
   Ranked never reads gear buffs; that rule lives in the sim, this file just
   keeps the loadout around. */

import type {
  CharId,
  CustomFinisher,
  GearItem,
  GearLook,
  GearStats,
  MatchState,
  Rarity,
  Slot,
} from './types';
import type { ReplayFile } from './rollback';
import { CHAR_IDS, RARITIES, SLOTS } from './types';
import { charDef } from './characters';

export const PROFILE_VERSION = 2;
export const PROFILE_KEY = 'universeclash.profile.v2';
export const MAX_LEVEL = 50;
export const MAX_GEAR_LEVEL = 20;

export interface ClashOptions {
  resolutionScale: number;
  outline: 0 | 1 | 2;
  shadowTone: 0 | 1 | 2;
  blood: number;
  particles: number;
  impactFrames: 0 | 1 | 2;
  vsync: boolean;
  fpsCap: number;
  shake: number;
  muted: boolean;
  volume: number;
  music: number;
  modern: boolean;
  /** Ticks of input buffering: 1 default, 0 low latency. */
  latency: 0 | 1;
  /** Blood and cracks stay on the stage for the whole set. */
  persistentScars: boolean;
  perfOverlay: boolean;
  training: { hitboxes: boolean; frameData: boolean; dodgeViz: boolean; ghost: boolean };
  net: { delay: number; ping: number; jitter: number };
}

export type Action = 'up' | 'down' | 'left' | 'right' | 'jump' | 'light' | 'heavy' | 'dodge' | 'throw' | 'super' | 'drive';
export type KeyMap = Record<Action, string>;

export const DEFAULT_KEYS: [KeyMap, KeyMap] = [
  { up: 'KeyW', down: 'KeyS', left: 'KeyA', right: 'KeyD', jump: 'Space', light: 'KeyJ', heavy: 'KeyK', dodge: 'KeyL', throw: 'KeyE', super: 'KeyI', drive: 'KeyQ' },
  { up: 'ArrowUp', down: 'ArrowDown', left: 'ArrowLeft', right: 'ArrowRight', jump: 'Numpad0', light: 'Numpad1', heavy: 'Numpad2', dodge: 'Numpad3', throw: 'Numpad4', super: 'Numpad5', drive: 'Numpad6' },
];

export const DEFAULT_OPTIONS: ClashOptions = {
  resolutionScale: 1,
  outline: 2,
  shadowTone: 1,
  blood: 0.8,
  particles: 0.8,
  impactFrames: 2,
  vsync: false,
  fpsCap: 0,
  shake: 1,
  muted: false,
  volume: 0.7,
  music: 0.35,
  modern: false,
  latency: 1,
  persistentScars: false,
  perfOverlay: false,
  training: { hitboxes: false, frameData: false, dodgeViz: false, ghost: false },
  net: { delay: 2, ping: 80, jitter: 20 },
};

export interface RivalMemory {
  char: CharId;
  matches: number;
  wins: number;
  losses: number;
  last: 'win' | 'loss' | 'draw' | null;
  note: string;
  /** 0..1: how often this rival dodges when pressured. */
  dodge: number;
  /** 0..1: how often this rival opens with an attack. */
  attack: number;
  /** 0..1: how often this rival jumps into an approach. */
  air: number;
}

export interface ModeRecord {
  wins: number;
  losses: number;
  matches: number;
  streak: number;
  best: number;
}

export interface CharRecord {
  wins: number;
  losses: number;
  kos: number;
  damage: number;
}

export interface ArcadeRecord {
  best: number;
  runs: number;
  cleared: number;
}

export interface ClashProfile {
  version: number;
  name: string;
  xp: Record<CharId, number>;
  coins: number;
  inventory: GearItem[];
  loadouts: Record<CharId, GearLook>;
  selected: CharId;
  selectedStage: string;
  cpuLevel: number;
  stocks: number;
  timer: number;
  gearBuffs: boolean;
  mode: 'casual' | 'ranked' | 'training' | 'local';
  records: Record<'casual' | 'ranked' | 'local', ModeRecord>;
  perChar: Record<CharId, CharRecord>;
  rivals: Record<CharId, RivalMemory>;
  scars: Record<string, import('./art').ScarMark[]>;
  finishers: Partial<Record<CharId, string>>;
  options: ClashOptions;
  arcade: ArcadeRecord;
  packsOpened: number;
  createdAt: number;
  lastPlayed: number;
  /* The long-game fields ported from Inkbreak. */
  pity: { legendary: number; mythic: number };
  region: string;
  ageOk: boolean;
  weekly: string;
  replays: ReplayFile[];
  /** Chapters cleared in Story. */
  story: number;
  rift: { day: string; wins: number };
  ranked: { mmr: number; w: number; l: number };
  custom: Partial<Record<CharId, CustomFinisher>>;
  keys: [KeyMap, KeyMap];
}

export interface SaveLike {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
  removeItem?(key: string): void;
}

/* ------------------------------------------------------------- progress --- */

export function xpForLevel(level: number): number {
  const lv = Math.max(1, Math.min(MAX_LEVEL, Math.floor(level)));
  let total = 0;
  for (let i = 1; i < lv; i++) total += 80 + (i - 1) * 30;
  return total;
}

export function levelForXp(xp: number): number {
  let lv = 1;
  while (lv < MAX_LEVEL && xp >= xpForLevel(lv + 1)) lv++;
  return lv;
}

export function levelProgress(xp: number): { level: number; into: number; need: number; pct: number } {
  const level = levelForXp(xp);
  const base = xpForLevel(level);
  const next = level >= MAX_LEVEL ? base : xpForLevel(level + 1);
  const need = Math.max(1, next - base);
  return { level, into: Math.max(0, xp - base), need, pct: level >= MAX_LEVEL ? 1 : Math.min(1, (xp - base) / need) };
}

export function addXp(p: ClashProfile, char: CharId, amount: number): { levels: number; level: number } {
  const before = levelForXp(p.xp[char]);
  p.xp[char] = Math.min(xpForLevel(MAX_LEVEL), Math.max(0, p.xp[char] + Math.max(0, Math.round(amount))));
  const after = levelForXp(p.xp[char]);
  return { levels: after - before, level: after };
}

/* ------------------------------------------------------------------ gear --- */

export const RARITY_ODDS: Record<Rarity, number> = {
  common: 54,
  rare: 27,
  epic: 12,
  legendary: 6,
  mythic: 1,
};

export const RARITY_COLOR: Record<Rarity, string> = {
  common: '#6f6658',
  rare: '#246fd8',
  epic: '#7b39b8',
  legendary: '#c58b1a',
  mythic: '#d8242c',
};

export const GEAR_BASE: Record<Rarity, number> = {
  common: 2,
  rare: 4,
  epic: 7,
  legendary: 11,
  mythic: 16,
};

export const RARITY_LEVEL_RANGE: Record<Rarity, [number, number]> = {
  common: [1, 8],
  rare: [3, 12],
  epic: [6, 16],
  legendary: [10, 19],
  mythic: [15, 20],
};

export const SLOT_NAMES: Record<Slot, string> = {
  head: 'HEAD',
  torso: 'TORSO',
  arms: 'ARMS',
  legs: 'LEGS',
  aura: 'AURA',
};

const NOUNS: Record<Slot, string[]> = {
  head: ['Crown', 'Visor', 'Headgear', 'Mask', 'Halo', 'Helmet'],
  torso: ['Jacket', 'Plate', 'Vest', 'Coat', 'Habit', 'Chassis'],
  arms: ['Gauntlets', 'Wraps', 'Bracers', 'Sleeves', 'Claws', 'Cuffs'],
  legs: ['Boots', 'Greaves', 'Trousers', 'Legwraps', 'Stompers', 'Shin Guards'],
  aura: ['Aura', 'Trail', 'Halo', 'Sigil', 'Miasma', 'Afterimage'],
};

const ADJ: Record<Rarity, string[]> = {
  common: ['Scuffed', 'Standard', 'Borrowed', 'Regulation'],
  rare: ['Reinforced', 'Tuned', 'Street', 'Void'],
  epic: ['Orbital', 'Cursed', 'Championship', 'Prototype'],
  legendary: ['Mythic', 'Unbroken', 'Last-Stock', 'Bloodline'],
  mythic: ['Impossible', 'Universe', 'Forbidden', 'Final'],
};

export function rarityFromPack(roll: number, odds: Record<Rarity, number>): Rarity {
  const total = RARITIES.reduce((a, r) => a + (odds[r] ?? 0), 0) || 1;
  let acc = 0;
  for (const r of RARITIES) {
    acc += (odds[r] ?? 0) / total;
    if (roll < acc) return r;
  }
  return 'common';
}

export function rarityFromRoll(roll: number): Rarity {
  return rarityFromPack(roll, RARITY_ODDS);
}

export function statBudget(rarity: Rarity, level: number): number {
  const base = GEAR_BASE[rarity];
  return Math.max(1, Math.round(base * (1 + (level - 1) * 0.09)));
}

const STAT_ORDER: (keyof GearStats)[] = ['strength', 'guard', 'drive', 'vigor'];

export function makeGear(
  char: CharId,
  rarity: Rarity,
  level: number,
  rng: () => number,
  slot?: Slot,
): GearItem {
  const lv = Math.max(1, Math.min(MAX_GEAR_LEVEL, Math.round(level)));
  const s = slot ?? SLOTS[Math.floor(rng() * SLOTS.length)];
  const name = `${ADJ[rarity][Math.floor(rng() * ADJ[rarity].length)]} ${NOUNS[s][Math.floor(rng() * NOUNS[s].length)]}`;
  const budget = statBudget(rarity, lv);
  const stats: Partial<GearStats> = {};
  const main = STAT_ORDER[Math.floor(rng() * STAT_ORDER.length)];
  stats[main] = budget;
  if (rarity !== 'common' && rng() < 0.55) {
    const second = STAT_ORDER[Math.floor(rng() * STAT_ORDER.length)];
    if (second !== main) stats[second] = Math.max(1, Math.round(budget * 0.45));
  }
  const uid = `g${char}${s}${Math.floor(rng() * 1e9).toString(36)}${Math.floor(rng() * 1e6).toString(36)}`;
  return {
    uid,
    char,
    slot: s,
    rarity,
    name,
    level: lv,
    stats,
    visual: Math.floor(rng() * 6),
    modifier: rarity === 'mythic' ? MYTHIC_MODS[Math.floor(rng() * MYTHIC_MODS.length)] : undefined,
  };
}

export const MYTHIC_MODS = [
  'Your first whiff each stock is a feint.',
  'Supers cost one less pip the first time.',
  'Perfect parries leave a one-tick echo.',
];

export function rollGear(char: CharId, rng: () => number, minRarity?: Rarity): GearItem {
  let rarity = rarityFromRoll(rng());
  if (minRarity) {
    const floorIdx = RARITIES.indexOf(minRarity);
    if (RARITIES.indexOf(rarity) < floorIdx) rarity = minRarity;
  }
  const [lo, hi] = RARITY_LEVEL_RANGE[rarity];
  const level = lo + Math.floor(rng() * (hi - lo + 1));
  return makeGear(char, rarity, level, rng);
}

export function gearBuffTotals(item: GearItem): number {
  return Object.values(item.stats).reduce((a, b) => a + (b ?? 0), 0);
}

export function upgradeCost(item: GearItem): number {
  return Math.round(40 + item.level * 18 * (RARITIES.indexOf(item.rarity) + 1));
}

export function upgradeGear(p: ClashProfile, uid: string): { ok: boolean; reason?: string } {
  const item = p.inventory.find((i) => i.uid === uid);
  if (!item) return { ok: false, reason: 'Not in the vault.' };
  if (item.level >= MAX_GEAR_LEVEL) return { ok: false, reason: 'Already maxed.' };
  const cost = upgradeCost(item);
  if (p.coins < cost) return { ok: false, reason: `Need ${cost} coins.` };
  p.coins -= cost;
  item.level++;
  const rarity = item.rarity;
  const budget = statBudget(rarity, item.level) - statBudget(rarity, item.level - 1);
  for (const key of Object.keys(item.stats) as (keyof GearStats)[]) {
    item.stats[key] = (item.stats[key] ?? 0) + Math.max(1, Math.round(budget * ((item.stats[key] ?? 1) > 1 ? 1 : 0.6)));
  }
  return { ok: true };
}

export function loadoutFor(p: ClashProfile, char: CharId): GearLook {
  return p.loadouts[char] ?? {};
}

export function equipGear(p: ClashProfile, uid: string): { ok: boolean; reason?: string } {
  const item = p.inventory.find((i) => i.uid === uid);
  if (!item) return { ok: false, reason: 'Not in the vault.' };
  p.loadouts[item.char] = p.loadouts[item.char] ?? {};
  p.loadouts[item.char][item.slot] = item;
  return { ok: true };
}

export function unequipGear(p: ClashProfile, char: CharId, slot: Slot): void {
  if (p.loadouts[char]) delete p.loadouts[char][slot];
}

/* ----------------------------------------------------------------- packs --- */

export interface PackDef {
  id: string;
  name: string;
  desc: string;
  price: number;
  cards: number;
  minRarity?: Rarity;
  odds: Record<Rarity, number>;
  featured?: string;
}

export const PACKS: PackDef[] = [
  {
    id: 'street',
    name: 'Street Pull',
    desc: 'Five pieces from the back of the van. One is probably a hat.',
    price: 180,
    cards: 5,
    odds: { common: 58, rare: 27, epic: 8, legendary: 6, mythic: 1 },
  },
  {
    id: 'universe',
    name: 'Universe Pull',
    desc: 'Eight pieces, at least one Rare or better. Printed odds, no fine print.',
    price: 420,
    cards: 8,
    minRarity: 'rare',
    odds: { common: 0, rare: 55, epic: 31, legendary: 12, mythic: 2 },
  },
  {
    id: 'laststock',
    name: 'Last Stock Case',
    desc: 'Ten pieces, one guaranteed Legendary. The case is worth more than the contents.',
    price: 900,
    cards: 10,
    minRarity: 'legendary',
    odds: { common: 0, rare: 30, epic: 44, legendary: 22, mythic: 4 },
  },
];

export interface DirectOffer {
  uid: string;
  char: CharId;
  slot: Slot;
  rarity: Rarity;
  level: number;
  name: string;
  price: number;
  stats: Partial<GearStats>;
  blurb: string;
}

export const DIRECT_OFFERS: DirectOffer[] = [
  {
    uid: 'direct_kestrel_cape',
    char: 'kestrel', slot: 'aura', rarity: 'epic', level: 9,
    name: 'Parade Day Aura', price: 620, stats: { strength: 7, vigor: 2 },
    blurb: 'The confetti never lands on him. It files a report.',
  },
  {
    uid: 'direct_mireille_sleeve',
    char: 'mireille', slot: 'arms', rarity: 'epic', level: 10,
    name: 'Ten-Fold Sleeve', price: 660, stats: { strength: 6, drive: 3 },
    blurb: 'One sleeve. Four hundred years of reach.',
  },
  {
    uid: 'direct_brick_torso',
    char: 'brickhouse', slot: 'torso', rarity: 'legendary', level: 13,
    name: 'Continue Screen Plate', price: 980, stats: { guard: 10, vigor: 4 },
    blurb: '9... 8... 7... It still counts.',
  },
  {
    uid: 'direct_halo_head',
    char: 'halo', slot: 'head', rarity: 'epic', level: 8,
    name: 'Borrowed Halo', price: 590, stats: { drive: 7 },
    blurb: 'Not hers. She is holding it for someone.',
  },
  {
    uid: 'direct_pip_legs',
    char: 'pip', slot: 'legs', rarity: 'rare', level: 7,
    name: 'Anvil Insurance', price: 320, stats: { vigor: 5 },
    blurb: 'Covers one (1) anvil. Crank read the policy.',
  },
  {
    uid: 'direct_oyelaran_arms',
    char: 'oyelaran', slot: 'arms', rarity: 'legendary', level: 14,
    name: 'Service Record Wraps', price: 920, stats: { strength: 8, guard: 3 },
    blurb: 'The names are redacted. The grip is not.',
  },
  {
    uid: 'direct_queen_aura',
    char: 'queen', slot: 'aura', rarity: 'legendary', level: 12,
    name: 'Brood Miasma', price: 880, stats: { drive: 8, vigor: 3 },
    blurb: 'It hums when you are not looking.',
  },
  {
    uid: 'direct_null_head',
    char: 'null', slot: 'head', rarity: 'mythic', level: 18,
    name: 'Missing Asset', price: 1600, stats: { strength: 10, drive: 8 },
    blurb: 'The item does not exist. The buff does.',
  },
];

export interface PackOpenResult {
  items: GearItem[];
  coins: number;
  rarity: Rarity;
}

export function openPack(p: ClashProfile, packId: string, rng: () => number): PackOpenResult | null {
  const pack = PACKS.find((x) => x.id === packId);
  if (!pack) return null;
  if (p.coins < pack.price) return null;
  p.coins -= pack.price;
  p.packsOpened++;
  const items: GearItem[] = [];
  let best: Rarity = 'common';
  for (let i = 0; i < pack.cards; i++) {
    let rarity = rarityFromPack(rng(), pack.odds);
    if (pack.minRarity) {
      const floor = RARITIES.indexOf(pack.minRarity);
      if (RARITIES.indexOf(rarity) < floor) rarity = pack.minRarity;
    }
    if (RARITIES.indexOf(rarity) > RARITIES.indexOf(best)) best = rarity;
    const [lo, hi] = RARITY_LEVEL_RANGE[rarity];
    const level = lo + Math.floor(rng() * (hi - lo + 1));
    const char = CHAR_IDS[Math.floor(rng() * CHAR_IDS.length)];
    items.push(makeGear(char, rarity, level, rng));
  }
  const coins = rng() < 0.25 ? Math.round(pack.price * 0.3) : 0;
  p.coins += coins;
  p.inventory.push(...items);
  if (p.inventory.length > 400) p.inventory.splice(0, p.inventory.length - 400);
  return { items, coins, rarity: best };
}

export function buyDirect(p: ClashProfile, uid: string): { ok: boolean; item?: GearItem; reason?: string } {
  const offer = DIRECT_OFFERS.find((o) => o.uid === uid);
  if (!offer) return { ok: false, reason: 'Not in the case.' };
  if (p.coins < offer.price) return { ok: false, reason: `Need ${offer.price} coins.` };
  p.coins -= offer.price;
  const item: GearItem = {
    uid: offer.uid,
    char: offer.char,
    slot: offer.slot,
    rarity: offer.rarity,
    name: offer.name,
    level: offer.level,
    stats: { ...offer.stats },
    visual: 4,
  };
  p.inventory.push(item);
  return { ok: true, item };
}

/* --------------------------------------------------------------- rewards --- */

export interface MatchReward {
  xp: number;
  coins: number;
  item: GearItem | null;
  levelUps: number;
  level: number;
  rivalNote: string;
}

export function matchXp(m: MatchState, side: 0 | 1, won: boolean): number {
  const s = m.stats;
  const dmg = s.damage[side];
  const hits = s.hits[side];
  const kos = s.ringouts[side === 0 ? 1 : 0] + (won ? 1 : 0);
  return Math.round(18 + dmg * 0.32 + hits * 0.6 + kos * 14 + (won ? 45 : 8) + Math.min(30, s.maxCombo[side] * 3));
}

export function matchCoins(m: MatchState, side: 0 | 1, won: boolean): number {
  const s = m.stats;
  return Math.round(12 + s.damage[side] * 0.18 + (won ? 30 : 6) + s.perfectParries[side] * 10 + s.supers[side] * 8);
}

export function rivalNoteFor(m: MatchState, side: 0 | 1): string {
  const s = m.stats;
  if (s.perfectParries[side] >= 2) return 'They will stand still and bait the parry next time.';
  if (s.dodgeAttempts[side] > 18) return 'They dodge on wakeup. Every time.';
  if (s.maxCombo[side] >= 5) return 'They found the loop. Expect it on the first stock.';
  if (s.damage[side] > 240) return 'They are not afraid of the corner. Push them out early.';
  if (s.supers[side] > 0) return 'The comeback super is real. Do not let them breathe.';
  return 'No read yet. They are still playing it straight.';
}

export function recordMatch(
  p: ClashProfile,
  m: MatchState,
  side: 0 | 1,
  char: CharId,
  rival: CharId,
  mode: 'casual' | 'ranked' | 'training' | 'local',
  playerWon: boolean,
  rng: () => number = Math.random,
): MatchReward {
  const won = playerWon;
  const xp = mode === 'training' ? Math.round(matchXp(m, side, won) * 0.35) : matchXp(m, side, won);
  const coins = mode === 'training' ? 0 : matchCoins(m, side, won);
  const lv = addXp(p, char, xp);
  p.coins += coins;
  if (mode === 'ranked') {
    p.ranked.mmr += won ? 18 : -14;
    if (won) p.ranked.w++; else p.ranked.l++;
  }
  if (mode !== 'training') {
    const rec = p.records[mode === 'local' ? 'local' : mode];
    rec.matches++;
    if (won) {
      rec.wins++;
      rec.streak = Math.max(0, rec.streak) + 1;
      rec.best = Math.max(rec.best, rec.streak);
    } else {
      rec.losses++;
      rec.streak = Math.min(0, rec.streak) - 1;
    }
    const cr = p.perChar[char];
    cr.wins += won ? 1 : 0;
    cr.losses += won ? 0 : 1;
    cr.kos += m.stats.ringouts[side === 0 ? 1 : 0];
    cr.damage += m.stats.damage[side];

    const mem = p.rivals[rival] ?? emptyRival(rival);
    p.rivals[rival] = mem;
    mem.matches++;
    mem.wins += won ? 1 : 0;
    mem.losses += won ? 0 : 1;
    mem.last = won ? 'win' : 'loss';
    const attempts = Math.max(1, m.stats.dodgeAttempts[side]);
    mem.dodge = mem.dodge * 0.6 + Math.min(1, attempts / Math.max(1, m.tick / 60)) * 0.4;
    const hits = m.stats.hits[side];
    mem.attack = mem.attack * 0.6 + Math.min(1, hits / Math.max(1, m.tick / 90)) * 0.4;
    mem.air = mem.air * 0.7 + Math.min(1, m.stats.maxCombo[side] / 8) * 0.3;
    mem.note = rivalNoteFor(m, side);
  }

  let item: GearItem | null = null;
  if (mode !== 'training' && (lv.levels > 0 || (won && m.stats.maxCombo[side] >= 5))) {
    item = rollGear(char, rng, lv.levels > 0 ? (lv.levels > 2 ? 'epic' : 'rare') : undefined);
    p.inventory.push(item);
  }
  p.lastPlayed = Date.now();
  return {
    xp,
    coins,
    item,
    levelUps: lv.levels,
    level: lv.level,
    rivalNote: p.rivals[rival]?.note ?? rivalNoteFor(m, side),
  };
}

export function awardArcade(p: ClashProfile, wins: number): void {
  p.arcade.runs++;
  p.arcade.best = Math.max(p.arcade.best, wins);
  p.coins += wins * 24;
  if (wins >= 8) p.arcade.cleared++;
}

/* ------------------------------------------------------------ profile io --- */

function emptyRecord(): ModeRecord {
  return { wins: 0, losses: 0, matches: 0, streak: 0, best: 0 };
}

function emptyCharRecord(): CharRecord {
  return { wins: 0, losses: 0, kos: 0, damage: 0 };
}

function emptyRival(id: CharId): RivalMemory {
  return {
    char: id,
    matches: 0,
    wins: 0,
    losses: 0,
    last: null,
    note: 'No read yet.',
    dodge: 0.2,
    attack: 0.4,
    air: 0.3,
  };
}

export function defaultProfile(now = Date.now()): ClashProfile {
  const xp = {} as Record<CharId, number>;
  const perChar = {} as Record<CharId, CharRecord>;
  const rivals = {} as Record<CharId, RivalMemory>;
  const loadouts = {} as Record<CharId, GearLook>;
  for (const id of CHAR_IDS) {
    xp[id] = 0;
    perChar[id] = emptyCharRecord();
    rivals[id] = emptyRival(id);
    loadouts[id] = {};
  }
  return {
    version: PROFILE_VERSION,
    name: 'CHALLENGER',
    xp,
    coins: 240,
    inventory: [],
    loadouts,
    selected: 'kestrel',
    selectedStage: 'rooftop',
    cpuLevel: 3,
    stocks: 3,
    timer: 4,
    gearBuffs: true,
    mode: 'casual',
    records: { casual: emptyRecord(), ranked: emptyRecord(), local: emptyRecord() },
    perChar,
    rivals,
    scars: {},
    finishers: {},
    options: { ...DEFAULT_OPTIONS },
    arcade: { best: 0, runs: 0, cleared: 0 },
    packsOpened: 0,
    createdAt: now,
    lastPlayed: now,
    pity: { legendary: 0, mythic: 0 },
    region: 'global',
    ageOk: false,
    weekly: '',
    replays: [],
    story: 0,
    rift: { day: '', wins: 0 },
    ranked: { mmr: 1000, w: 0, l: 0 },
    custom: {},
    keys: [{ ...DEFAULT_KEYS[0] }, { ...DEFAULT_KEYS[1] }],
  };
}

export function migrateProfile(raw: unknown): ClashProfile {
  const base = defaultProfile();
  if (!raw || typeof raw !== 'object') return base;
  const p = raw as Partial<ClashProfile>;
  const merged: ClashProfile = {
    ...base,
    ...p,
    options: { ...base.options, ...(p.options ?? {}) },
    records: { ...base.records, ...(p.records ?? {}) },
    xp: { ...base.xp, ...(p.xp ?? {}) },
    perChar: { ...base.perChar, ...(p.perChar ?? {}) },
    rivals: { ...base.rivals, ...(p.rivals ?? {}) },
    loadouts: { ...base.loadouts, ...(p.loadouts ?? {}) },
    scars: { ...base.scars, ...(p.scars ?? {}) },
    finishers: { ...base.finishers, ...(p.finishers ?? {}) },
    arcade: { ...base.arcade, ...(p.arcade ?? {}) },
    inventory: Array.isArray(p.inventory) ? p.inventory.filter(isGearLike) : [],
    pity: { ...base.pity, ...(p.pity ?? {}) },
    rift: { ...base.rift, ...(p.rift ?? {}) },
    ranked: { ...base.ranked, ...(p.ranked ?? {}) },
    custom: { ...base.custom, ...(p.custom ?? {}) },
    replays: Array.isArray(p.replays) ? p.replays.slice(0, 5) : [],
    keys: [
      { ...base.keys[0], ...(p.keys?.[0] ?? {}) },
      { ...base.keys[1], ...(p.keys?.[1] ?? {}) },
    ],
    version: PROFILE_VERSION,
  };
  merged.options.training = { ...base.options.training, ...(p.options?.training ?? {}) };
  merged.options.net = { ...base.options.net, ...(p.options?.net ?? {}) };
  return merged;
}

function isGearLike(x: unknown): x is GearItem {
  if (!x || typeof x !== 'object') return false;
  const g = x as GearItem;
  return typeof g.uid === 'string' && typeof g.name === 'string' && !!g.slot && !!g.rarity && !!g.char;
}

export function loadProfile(storage?: SaveLike): ClashProfile {
  const store = storage ?? safeStorage();
  if (!store) return defaultProfile();
  try {
    const raw = store.getItem(PROFILE_KEY);
    if (!raw) return defaultProfile();
    return migrateProfile(JSON.parse(raw));
  } catch {
    return defaultProfile();
  }
}

export function saveProfile(p: ClashProfile, storage?: SaveLike): boolean {
  const store = storage ?? safeStorage();
  if (!store) return false;
  try {
    store.setItem(PROFILE_KEY, JSON.stringify(p));
    return true;
  } catch {
    return false;
  }
}

function safeStorage(): SaveLike | null {
  try {
    if (typeof localStorage !== 'undefined') return localStorage;
  } catch {
    return null;
  }
  return null;
}

export function wipeProfile(): void {
  const store = safeStorage();
  try {
    store?.removeItem?.(PROFILE_KEY);
  } catch {
    // private mode: nothing to wipe
  }
}

/* --------------------------------------------------------------- helpers --- */

export function charName(id: CharId): string {
  return charDef(id).name;
}

export function totalGear(p: ClashProfile): number {
  return p.inventory.length;
}

export function loadoutStats(p: ClashProfile, char: CharId): GearStats {
  const total: GearStats = { strength: 0, guard: 0, drive: 0, vigor: 0 };
  const look = p.loadouts[char] ?? {};
  for (const slot of SLOTS) {
    const item = look[slot];
    if (!item) continue;
    const scale = 1 + item.level / 100;
    for (const key of Object.keys(item.stats) as (keyof GearStats)[]) {
      total[key] += (item.stats[key] ?? 0) * scale;
    }
  }
  return total;
}

export function unlockedFinisher(p: ClashProfile, char: CharId): string | null {
  return p.finishers[char] ?? null;
}

export function setFinisher(p: ClashProfile, char: CharId, id: string | null): void {
  if (id) p.finishers[char] = id;
  else delete p.finishers[char];
}

export function addScars(
  p: ClashProfile,
  stageId: string,
  scars: import('./art').ScarMark[],
): void {
  const list = p.scars[stageId] ?? [];
  for (const s of scars) list.push(s);
  p.scars[stageId] = list.slice(-60);
}
