/* UNIVERSE CLASH - the store's fine print.
   Everything a regulator would ask about lives here: a fixed catalogue so
   every pack item can also be bought outright, per-item odds that can be
   printed, pity counters that are shown and honoured, regional rules (no
   paid random items in Belgium), the age gate, the weekly free pack and
   salvage. Pure functions over the profile; no DOM, no clock unless passed. */

import type { CharId, GearItem, GearStats, Rarity, Slot } from './types';
import { CHAR_IDS, RARITIES, SLOTS } from './types';
import { charDef } from './characters';
import {
  PACKS,
  RARITY_LEVEL_RANGE,
  makeGear,
  rarityFromPack,
  statBudget,
  type ClashProfile,
  type PackOpenResult,
} from './profile';

export const PITY = { legendary: 20, mythic: 60 };

export const RARITY_CAP: Record<Rarity, number> = { common: 5, rare: 10, epic: 15, legendary: 20, mythic: 20 };

/** Direct price of a catalogue piece, by rarity. Commons also sell for coins' little sibling: nothing, they are coins too. */
export const DIRECT_PRICE: Record<Rarity, number> = { common: 150, rare: 400, epic: 900, legendary: 2500, mythic: 6000 };

export const SALVAGE_VALUE: Record<Rarity, number> = { common: 30, rare: 100, epic: 300, legendary: 800, mythic: 2000 };

export interface Region {
  id: string;
  name: string;
  packs: boolean;
  age: number;
  note: string;
}

export const REGIONS: Region[] = [
  { id: 'global', name: 'Global', packs: true, age: 16, note: 'Odds printed per item. Every pack item is sold directly for coins.' },
  { id: 'be', name: 'Belgium', packs: false, age: 16, note: 'Paid random items are not sold in Belgium. Every item is sold directly.' },
  { id: 'br', name: 'Brazil', packs: true, age: 18, note: 'Pack sales require age 18+.' },
  { id: 'kr', name: 'South Korea', packs: true, age: 16, note: 'Odds are itemised; mislabelled odds carry treble damages.' },
  { id: 'cn', name: 'China', packs: true, age: 16, note: 'Per-item odds disclosed, as required since 2017.' },
];

export function regionById(id: string): Region {
  return REGIONS.find((r) => r.id === id) ?? REGIONS[0];
}

const GEAR_NAMES: Record<Slot, string[]> = {
  head: ['Cowl', 'Visor', 'Crown', 'Mask', 'Helm'],
  torso: ['Plate', 'Jacket', 'Harness', 'Mantle', 'Carapace'],
  arms: ['Bracers', 'Gauntlets', 'Wraps', 'Sleeves', 'Claws'],
  legs: ['Greaves', 'Boots', 'Treads', 'Shin Guards', 'Striders'],
  aura: ['Halo', 'Static', 'Ember', 'Ink Wash', 'Swarm'],
};

const STAT_ORDER: (keyof GearStats)[] = ['strength', 'guard', 'drive', 'vigor'];

const EPITHET: Record<CharId, string> = {
  kestrel: 'the Capital',
  mireille: 'the Scroll',
  brickhouse: 'the Cabinet',
  halo: 'the Crypt',
  pip: 'the Soundstage',
  oyelaran: 'the Hangar',
  queen: 'the Hive',
  null: 'the Void',
};

export interface CatalogItem {
  id: string;
  char: CharId;
  slot: Slot;
  rarity: Rarity;
  name: string;
  level: number;
  stats: Partial<GearStats>;
  visual: number;
  modifier?: string;
}

const MODS = [
  'sSig travels 15% farther',
  'nSig charges 20% faster',
  'dSig knockback +8%',
  'Recovery rises 10% higher',
  'Chase dodge refunds a full pip',
  'Lights gain 2 ticks of cancel window',
];

/** Every character x slot x rarity, one fixed piece each: 200 items, all directly purchasable. */
export function buildCatalog(): CatalogItem[] {
  const out: CatalogItem[] = [];
  CHAR_IDS.forEach((char, ci) => {
    SLOTS.forEach((slot, si) => {
      RARITIES.forEach((rarity, ri) => {
        const [lo, hi] = RARITY_LEVEL_RANGE[rarity];
        const level = Math.round((lo + hi) / 2);
        const budget = statBudget(rarity, level);
        const stats: Partial<GearStats> = {};
        const lines = rarity === 'common' ? 1 : rarity === 'rare' ? 2 : 3;
        for (let i = 0; i < lines; i++) {
          const key = STAT_ORDER[(ci + si + i + ri) % 4];
          stats[key] = (stats[key] ?? 0) + Math.max(1, Math.round(budget * (i === 0 ? 1 : 0.45)));
        }
        out.push({
          id: `${char}.${slot}.${rarity}`,
          char,
          slot,
          rarity,
          name: `${rarity === 'common' ? '' : rarity[0].toUpperCase() + rarity.slice(1) + ' '}${GEAR_NAMES[slot][(ci + ri) % 5]} of ${EPITHET[char]}`,
          level,
          stats,
          visual: (ci + si + ri) % 6,
          modifier: ri >= 3 ? MODS[(ci + si) % MODS.length] : undefined,
        });
      });
    });
  });
  return out;
}

export const CATALOG: CatalogItem[] = buildCatalog();

export function catalogItem(id: string): CatalogItem | undefined {
  return CATALOG.find((c) => c.id === id);
}

/** Per-item odds for a pack slot: the rarity share divided by the items of that rarity in the pool. */
export function perItemOdds(packId: string, rarity: Rarity): number {
  const pack = PACKS.find((p) => p.id === packId);
  if (!pack) return 0;
  const total = RARITIES.reduce((a, r) => a + pack.odds[r], 0) || 1;
  const share = pack.odds[rarity] / total;
  const n = CATALOG.filter((c) => c.rarity === rarity).length || 1;
  return (share / n) * 100;
}

function rarityRank(r: Rarity): number {
  return RARITIES.indexOf(r);
}

/** A pack opening that honours the pity counters. Same contract as profile.openPack otherwise. */
export function openPackWithPity(p: ClashProfile, packId: string, rng: () => number): PackOpenResult | null {
  const pack = PACKS.find((x) => x.id === packId);
  if (!pack) return null;
  if (p.coins < pack.price) return null;
  p.coins -= pack.price;
  p.packsOpened++;
  const items: GearItem[] = [];
  let best: Rarity = 'common';
  for (let i = 0; i < pack.cards; i++) {
    let rarity = rarityFromPack(rng(), pack.odds);
    if (pack.minRarity && rarityRank(rarity) < rarityRank(pack.minRarity)) rarity = pack.minRarity;
    p.pity.legendary++;
    p.pity.mythic++;
    if (p.pity.mythic >= PITY.mythic) rarity = 'mythic';
    else if (p.pity.legendary >= PITY.legendary && rarityRank(rarity) < rarityRank('legendary')) rarity = 'legendary';
    if (rarityRank(rarity) >= rarityRank('legendary')) p.pity.legendary = 0;
    if (rarity === 'mythic') p.pity.mythic = 0;
    if (rarityRank(rarity) > rarityRank(best)) best = rarity;
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

export function buyCatalog(p: ClashProfile, id: string): { ok: boolean; item?: GearItem; reason?: string } {
  const c = catalogItem(id);
  if (!c) return { ok: false, reason: 'Not in the catalogue.' };
  const price = DIRECT_PRICE[c.rarity];
  if (p.coins < price) return { ok: false, reason: `Need ${price} coins.` };
  p.coins -= price;
  const item: GearItem = {
    uid: `${c.id}#${p.inventory.length}${Math.floor(Math.random() * 1e6).toString(36)}`,
    char: c.char,
    slot: c.slot,
    rarity: c.rarity,
    name: c.name,
    level: c.level,
    stats: { ...c.stats },
    visual: c.visual,
    modifier: c.modifier,
  };
  p.inventory.push(item);
  return { ok: true, item };
}

export function salvage(p: ClashProfile, uid: string): number {
  const i = p.inventory.findIndex((x) => x.uid === uid);
  if (i < 0) return 0;
  const item = p.inventory[i];
  p.inventory.splice(i, 1);
  for (const ch of CHAR_IDS) {
    const look = p.loadouts[ch];
    if (!look) continue;
    for (const slot of SLOTS) if (look[slot]?.uid === uid) delete look[slot];
  }
  const v = SALVAGE_VALUE[item.rarity];
  p.coins += v;
  return v;
}

/** ISO week key, so the free pack resets on a calendar the player can predict. */
export function weekKey(now = Date.now()): string {
  const d = new Date(now);
  const start = new Date(d.getFullYear(), 0, 1);
  return `${d.getFullYear()}-${Math.floor((d.getTime() - start.getTime()) / 6048e5)}`;
}

export function claimWeekly(p: ClashProfile, rng: () => number, now = Date.now()): GearItem[] | null {
  const key = weekKey(now);
  if (p.weekly === key) return null;
  p.weekly = key;
  const items: GearItem[] = [];
  for (let i = 0; i < 3; i++) {
    const r = rarityFromPack(rng(), PACKS[0].odds);
    const [lo, hi] = RARITY_LEVEL_RANGE[r];
    const char = CHAR_IDS[Math.floor(rng() * CHAR_IDS.length)];
    items.push(makeGear(char, r, lo + Math.floor(rng() * (hi - lo + 1)), rng));
  }
  p.inventory.push(...items);
  return items;
}

/** Levels 1 / 15 / 30 unlock a character's three finishers. */
export function finishersUnlocked(level: number): number {
  return level >= 30 ? 3 : level >= 15 ? 2 : 1;
}

export const LEVEL_TRACK: [number, string][] = [
  [5, 'Alternate palette'],
  [10, 'Taunt'],
  [15, 'Second finisher'],
  [20, 'Universe-styled victory pose'],
  [30, 'Third finisher'],
  [40, 'Break impact-frame variant'],
  [50, 'Prestige border + guaranteed Mythic piece'],
];

export function charLine(id: CharId): string {
  return charDef(id).gearLine;
}
