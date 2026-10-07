/**
 * Save / load. 3 manual slots + an autosave slot (written each week).
 * Ironman careers only ever use the autosave slot. Saves can be exported
 * to / imported from JSON files.
 */
import type { GameState } from './types';
import { fmtDate } from './time';
import LZString from 'lz-string';
import { ensureCareer } from './career';

export const SAVE_VERSION = 1;
export type SlotId = '1' | '2' | '3' | 'auto';
export const SLOTS: SlotId[] = ['auto', '1', '2', '3'];

export interface SaveMeta {
  slot: SlotId;
  name: string;
  week: number;
  date: string;
  act: number;
  mode: string;
  difficulty: string;
  seed: number;
  cash: number;
  savedAt: number;
  ending: string | null;
}

export interface SaveFile {
  kind: 'cageboss-save';
  version: number;
  meta: SaveMeta;
  state: GameState;
}

export interface KV {
  getItem(k: string): string | null;
  setItem(k: string, v: string): void;
  removeItem(k: string): void;
}

class MemoryKV implements KV {
  private m = new Map<string, string>();
  getItem(k: string) {
    return this.m.has(k) ? this.m.get(k)! : null;
  }
  setItem(k: string, v: string) {
    this.m.set(k, v);
  }
  removeItem(k: string) {
    this.m.delete(k);
  }
}

let kv: KV = typeof localStorage !== 'undefined' ? localStorage : new MemoryKV();
export function setStorage(s: KV): void {
  kv = s;
}

const key = (slot: SlotId) => `cageboss.save.${slot}`;

export function makeSave(state: GameState, slot: SlotId): SaveFile {
  return {
    kind: 'cageboss-save',
    version: SAVE_VERSION,
    meta: {
      slot,
      name: state.promotion.name,
      week: state.week,
      date: fmtDate(state.week),
      act: state.act,
      mode: state.mode,
      difficulty: state.difficulty,
      seed: state.seed,
      cash: state.promotion.cash,
      savedAt: Date.now(),
      ending: state.ending,
    },
    state,
  };
}

export function saveToSlot(state: GameState, slot: SlotId): boolean {
  if (state.difficulty === 'ironman' && slot !== 'auto') return false;
  try {
    const save = makeSave(state, slot);
    kv.setItem(key(slot), 'lz:' + LZString.compressToUTF16(JSON.stringify(save)));
    kv.setItem(key(slot) + '.meta', JSON.stringify(save.meta));
    return true;
  } catch (e) {
    console.warn('Save failed', e);
    return false;
  }
}

function decode(raw: string): string {
  return raw.startsWith('lz:') ? LZString.decompressFromUTF16(raw.slice(3)) ?? '' : raw;
}

export function parseSave(text: string): SaveFile {
  const data = JSON.parse(decode(text));
  if (!data || data.kind !== 'cageboss-save' || !data.state) throw new Error('Not a CAGE BOSS save file');
  if (data.version > SAVE_VERSION) throw new Error('Save is from a newer version');
  return migrate(data as SaveFile);
}

export function loadFromSlot(slot: SlotId): GameState | null {
  const raw = kv.getItem(key(slot));
  if (!raw) return null;
  try {
    return parseSave(raw).state;
  } catch (e) {
    console.warn('Load failed', e);
    return null;
  }
}

export function slotMeta(slot: SlotId): SaveMeta | null {
  const metaRaw = kv.getItem(key(slot) + '.meta');
  if (metaRaw) {
    try {
      return JSON.parse(metaRaw) as SaveMeta;
    } catch {
      /* fall through */
    }
  }
  const raw = kv.getItem(key(slot));
  if (!raw) return null;
  try {
    return (JSON.parse(decode(raw)) as SaveFile).meta;
  } catch {
    return null;
  }
}

export function deleteSlot(slot: SlotId): void {
  kv.removeItem(key(slot));
  kv.removeItem(key(slot) + '.meta');
}

export function exportSave(state: GameState): string {
  return JSON.stringify(makeSave(state, 'auto'), null, 1);
}

function migrate(save: SaveFile): SaveFile {
  // Version 1 is current; future migrations go here.
  // career progression (added later): old saves get a fresh career block
  ensureCareer(save.state);
  return save;
}

/** Simple settings persistence (separate from saves). */
export function loadJSON<T>(k: string, fallback: T): T {
  try {
    const raw = kv.getItem(k);
    return raw ? { ...fallback, ...JSON.parse(raw) } : fallback;
  } catch {
    return fallback;
  }
}

export function storeJSON(k: string, v: unknown): void {
  try {
    kv.setItem(k, JSON.stringify(v));
  } catch {
    /* storage unavailable */
  }
}
