import { describe, expect, it } from 'vitest';
import {
  DEFAULT_OPTIONS,
  MAX_GEAR_LEVEL,
  MAX_LEVEL,
  PACKS,
  RARITY_ODDS,
  addScars,
  addXp,
  buyDirect,
  defaultProfile,
  equipGear,
  levelForXp,
  levelProgress,
  loadProfile,
  loadoutStats,
  makeGear,
  openPack,
  recordMatch,
  saveProfile,
  setFinisher,
  totalGear,
  unequipGear,
  unlockedFinisher,
  upgradeCost,
  upgradeGear,
  xpForLevel,
} from '../src/clash/profile';
import { createMatch } from '../src/clash/sim';
import { CHAR_IDS, RARITIES, SLOTS } from '../src/clash/types';
import type { MatchConfig } from '../src/clash/types';

function lcg(seed: number): () => number {
  let s = seed >>> 0;
  return () => {
    s = (s * 1664525 + 1013904223) >>> 0;
    return s / 0x100000000;
  };
}

function memoryStorage(): {
  getItem(k: string): string | null;
  setItem(k: string, v: string): void;
  removeItem(k: string): void;
  data: Map<string, string>;
} {
  const data = new Map<string, string>();
  return {
    data,
    getItem: (k) => data.get(k) ?? null,
    setItem: (k, v) => void data.set(k, v),
    removeItem: (k) => void data.delete(k),
  };
}

function config(over: Partial<MatchConfig> = {}): MatchConfig {
  return {
    stageId: 'rooftop',
    mode: 'casual',
    seed: 1234,
    stocks: 3,
    timerTicks: 4 * 60 * 60,
    gearBuffs: false,
    playerChar: 'kestrel',
    cpuChar: 'mireille',
    cpuLevel: 3,
    modern: false,
    gear: [{}, {}],
    training: false,
    ...over,
  };
}

describe('universe clash profile', () => {
  it('starts a clean profile with every fighter and slot populated', () => {
    const p = defaultProfile(1000);
    expect(p.version).toBeGreaterThanOrEqual(2);
    expect(p.coins).toBeGreaterThan(0);
    for (const id of CHAR_IDS) {
      expect(p.xp[id]).toBe(0);
      expect(p.loadouts[id]).toEqual({});
      expect(p.rivals[id].matches).toBe(0);
      for (const slot of SLOTS) expect(p.loadouts[id][slot]).toBeUndefined();
    }
    expect(p.options).toEqual(DEFAULT_OPTIONS);
    expect(p.createdAt).toBe(1000);
  });

  it('levels at a rising cost and stops at 50', () => {
    expect(xpForLevel(1)).toBe(0);
    expect(xpForLevel(2)).toBe(80);
    expect(levelForXp(0)).toBe(1);
    expect(levelForXp(79)).toBe(1);
    expect(levelForXp(80)).toBe(2);
    expect(levelForXp(xpForLevel(MAX_LEVEL))).toBe(MAX_LEVEL);
    expect(levelForXp(9999999)).toBe(MAX_LEVEL);
    expect(levelProgress(xpForLevel(MAX_LEVEL)).pct).toBe(1);

    const p = defaultProfile();
    addXp(p, 'kestrel', 79);
    expect(levelForXp(p.xp.kestrel)).toBe(1);
    const res = addXp(p, 'kestrel', 1);
    expect(res.level).toBe(2);
    expect(res.levels).toBe(1);
    addXp(p, 'kestrel', 1e9);
    expect(p.xp.kestrel).toBe(xpForLevel(MAX_LEVEL));
    expect(addXp(p, 'kestrel', 50).levels).toBe(0);
  });

  it('prints odds that add up to 100 for the shop and every pack', () => {
    const total = RARITIES.reduce((a, r) => a + RARITY_ODDS[r], 0);
    expect(total).toBe(100);
    for (const pack of PACKS) {
      expect(pack.cards).toBeGreaterThan(0);
      expect(pack.price).toBeGreaterThan(0);
      const sum = RARITIES.reduce((a, r) => a + pack.odds[r], 0);
      expect(sum).toBe(100);
      if (pack.minRarity) expect(RARITIES.indexOf(pack.minRarity)).toBeGreaterThan(0);
    }
  });

  it('opens the same pack twice from the same seed', () => {
    const a = defaultProfile();
    const b = defaultProfile();
    a.coins = 1000;
    b.coins = 1000;
    const resA = openPack(a, 'universe', lcg(77));
    const resB = openPack(b, 'universe', lcg(77));
    expect(resA).not.toBeNull();
    expect(resB).not.toBeNull();
    expect(JSON.stringify(resA)).toBe(JSON.stringify(resB));
    expect(a.coins).toBe(b.coins);
    expect(resA!.items).toHaveLength(8);
    expect(a.inventory).toHaveLength(8);
    expect(a.packsOpened).toBe(1);
    expect(a.coins).toBe(1000 - 420 + resA!.coins);
    for (const item of resA!.items) {
      expect(RARITIES.indexOf(item.rarity)).toBeGreaterThanOrEqual(RARITIES.indexOf('rare'));
      expect(item.level).toBeGreaterThanOrEqual(1);
      expect(item.level).toBeLessThanOrEqual(MAX_GEAR_LEVEL);
    }
  });

  it('refuses a pack or offer the wallet cannot cover', () => {
    const p = defaultProfile();
    p.coins = 10;
    expect(openPack(p, 'street', lcg(1))).toBeNull();
    expect(p.inventory).toHaveLength(0);
    expect(buyDirect(p, 'direct_kestrel_cape').ok).toBe(false);
    expect(p.coins).toBe(10);
    expect(openPack(p, 'nope', lcg(1))).toBeNull();
  });

  it('buys a direct offer and equips it', () => {
    const p = defaultProfile();
    p.coins = 1000;
    const before = p.coins;
    const res = buyDirect(p, 'direct_kestrel_cape');
    expect(res.ok).toBe(true);
    expect(res.item?.uid).toBe('direct_kestrel_cape');
    expect(p.coins).toBe(before - 620);
    expect(totalGear(p)).toBe(1);

    expect(equipGear(p, 'direct_kestrel_cape').ok).toBe(true);
    expect(p.loadouts.kestrel.aura?.uid).toBe('direct_kestrel_cape');
    const stats = loadoutStats(p, 'kestrel');
    expect(stats.strength).toBeGreaterThan(0);
    expect(stats.vigor).toBeGreaterThan(0);

    unequipGear(p, 'kestrel', 'aura');
    expect(p.loadouts.kestrel.aura).toBeUndefined();
    expect(loadoutStats(p, 'kestrel').strength).toBe(0);
  });

  it('upgrades gear with coins and stops at level 20', () => {
    const p = defaultProfile();
    const item = makeGear('mireille', 'epic', 5, lcg(9), 'arms');
    p.inventory.push(item);
    p.coins = 100000;
    const coins = p.coins;
    const cost = upgradeCost(item);
    expect(upgradeGear(p, item.uid).ok).toBe(true);
    expect(item.level).toBe(6);
    expect(p.coins).toBe(coins - cost);

    item.level = MAX_GEAR_LEVEL;
    expect(upgradeGear(p, item.uid).ok).toBe(false);
    p.coins = 0;
    item.level = 10;
    expect(upgradeGear(p, item.uid).ok).toBe(false);
    expect(upgradeGear(p, 'ghost').ok).toBe(false);
  });

  it('saves, loads and migrates a profile without losing the vault', () => {
    const p = defaultProfile(5000);
    p.coins = 321;
    p.selected = 'null';
    p.xp.null = 240;
    p.inventory.push(makeGear('null', 'legendary', 12, lcg(3), 'head'));
    p.options = { ...p.options, blood: 0.2, vsync: true };
    setFinisher(p, 'null', 'glitch_out');
    const store = memoryStorage();
    expect(saveProfile(p, store)).toBe(true);
    const loaded = loadProfile(store);
    expect(loaded.coins).toBe(321);
    expect(loaded.selected).toBe('null');
    expect(loaded.xp.null).toBe(240);
    expect(loaded.inventory).toHaveLength(1);
    expect(loaded.options.blood).toBe(0.2);
    expect(loaded.options.vsync).toBe(true);
    expect(unlockedFinisher(loaded, 'null')).toBe('glitch_out');

    const old = JSON.parse(store.getItem('universeclash.profile.v2')!) as Record<string, unknown>;
    old.version = 1;
    delete old.finishers;
    old.rivals = { null: { char: 'null', matches: 3, wins: 2, losses: 1, last: 'win', note: 'read', dodge: 0.9, attack: 0.5, air: 0.4 } };
    old.inventory = [{ uid: 'bad' }, ...(old.inventory as unknown[])];
    store.setItem('universeclash.profile.v2', JSON.stringify(old));
    const migrated = loadProfile(store);
    expect(migrated.version).toBeGreaterThanOrEqual(2);
    expect(migrated.finishers).toEqual({});
    expect(migrated.inventory).toHaveLength(1);
    expect(migrated.rivals.null.dodge).toBe(0.9);
    expect(migrated.rivals.kestrel.matches).toBe(0);

    store.setItem('universeclash.profile.v2', '{not json');
    expect(loadProfile(store).coins).toBeGreaterThan(0);
  });

  it('records a match into xp, coins, records and rival memory', () => {
    const p = defaultProfile();
    const m = createMatch(config());
    m.stats.damage[0] = 120;
    m.stats.hits[0] = 9;
    m.stats.maxCombo[0] = 6;
    m.stats.perfectParries[0] = 2;
    m.stats.dodgeAttempts[0] = 8;
    m.tick = 600;

    const before = p.coins;
    const reward = recordMatch(p, m, 0, 'kestrel', 'mireille', 'casual', true, lcg(5));
    expect(reward.xp).toBeGreaterThan(45);
    expect(reward.coins).toBeGreaterThan(30);
    expect(p.coins).toBe(before + reward.coins);
    expect(p.records.casual.wins).toBe(1);
    expect(p.records.casual.matches).toBe(1);
    expect(p.records.casual.streak).toBe(1);
    expect(p.perChar.kestrel.wins).toBe(1);
    expect(p.perChar.kestrel.damage).toBe(120);
    expect(p.rivals.mireille.matches).toBe(1);
    expect(p.rivals.mireille.last).toBe('win');
    expect(p.rivals.mireille.note.length).toBeGreaterThan(0);
    expect(reward.item).not.toBeNull();
    expect(p.inventory).toContain(reward.item);

    const training = defaultProfile();
    const tr = recordMatch(training, m, 0, 'kestrel', 'mireille', 'training', true, lcg(5));
    expect(tr.coins).toBe(0);
    expect(training.records.casual.matches).toBe(0);
    expect(training.rivals.mireille.matches).toBe(0);
    expect(tr.xp).toBeLessThan(reward.xp);
  });

  it('keeps the last 60 stage scars', () => {
    const p = defaultProfile();
    const scar = (i: number) => ({ x: i, y: 10, seed: i, kind: 'crack' as const, theme: 'rooftop' });
    addScars(p, 'rooftop', Array.from({ length: 70 }, (_, i) => scar(i)));
    expect(p.scars.rooftop).toHaveLength(60);
    expect(p.scars.rooftop[59].x).toBe(69);
  });
});
