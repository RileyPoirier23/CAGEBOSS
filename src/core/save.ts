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
/** Slot ids: career uses auto/1/2/3; Road To Champion r-prefixed (rauto, r1..), Legacy Mode l-prefixed. */
export type SlotId = string;
export const SLOTS: SlotId[] = ['auto', '1', '2', '3'];
export type SaveFamily = 'career' | 'rtc' | 'legacy';
export const FAMILY_NAME: Record<SaveFamily, string> = { career: 'Promoter career', rtc: 'Road To Champion', legacy: 'Legacy Mode' };
/** The four slots (autosave first) for one kind of game. */
export function slotsFor(f: SaveFamily): SlotId[] {
  const p = f === 'career' ? '' : f === 'rtc' ? 'r' : 'l';
  return SLOTS.map((x) => p + x);
}
export function familyOf(state: GameState): SaveFamily {
  if (state.mode !== 'fighter') return 'career';
  return (state as GameState & { fm?: { legacy?: boolean } }).fm?.legacy ? 'legacy' : 'rtc';
}
export const autoSlot = (state: GameState): SlotId => slotsFor(familyOf(state))[0];
export const isAutoSlot = (slot: SlotId): boolean => slot.endsWith('auto');
/** Every slot of every kind (for "has this person ever saved anything"). */
export const ALL_SLOTS: SlotId[] = [...slotsFor('career'), ...slotsFor('rtc'), ...slotsFor('legacy')];

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
  /** fighter modes: record and where you fight */
  record?: string;
  league?: string;
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
  const fmx = (state as GameState & { fm?: { player: string; money: number; tier: string; stage?: number; circuit?: { name: string }[] } }).fm;
  if (state.mode === 'fighter' && fmx) {
    const f = state.fighters[fmx.player];
    const r = f?.record;
    return {
      kind: 'cageboss-save',
      version: SAVE_VERSION,
      meta: {
        slot, name: f ? `${f.first} "${f.nick}" ${f.last}`.replace(' "" ', ' ') : 'Fighter', week: state.week, date: fmtDate(state.week), act: state.act, mode: state.mode,
        difficulty: state.difficulty, seed: state.seed, cash: fmx.money, savedAt: Date.now(), ending: state.ending,
        record: r ? `${r.w}-${r.l}${r.d ? '-' + r.d : ''}` : '', league: fmx.circuit?.[Math.min(fmx.stage ?? 0, fmx.circuit.length - 1)]?.name ?? fmx.tier,
      },
      state,
    };
  }
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
  if (state.difficulty === 'ironman' && !isAutoSlot(slot)) return false;
  try {
    const save = makeSave(state, slot);
    queued.delete(slot); // this write wins over a background one still on its way
    writeSlot(slot, LZString.compressToUTF16(JSON.stringify(save)), JSON.stringify(save.meta));
    return true;
  } catch (e) {
    console.warn('Save failed', e);
    return false;
  }
}

function writeSlot(slot: SlotId, lz: string, meta: string): void {
  kv.setItem(key(slot), 'lz:' + lz);
  kv.setItem(key(slot) + '.meta', meta);
}

/**
 * Compressing a save (a megabyte of JSON) takes a phone a second or more. The browser build
 * hands it to a worker (main.ts) so END WEEK doesn't freeze the screen; without one (tests,
 * Godot) saves are written on the spot.
 */
let compressAsync: ((json: string) => Promise<string>) | null = null;
export function setAsyncCompressor(fn: ((json: string) => Promise<string>) | null): void {
  compressAsync = fn;
}
/** background saves not written yet: the JSON, so loading the slot meanwhile gets the newest */
const queued = new Map<SlotId, { json: string; meta: string }>();

/** Write the background saves now (the app is going away: a phone may kill it before the worker answers). */
export function flushSaves(): void {
  for (const [slot, job] of [...queued]) {
    queued.delete(slot);
    try {
      writeSlot(slot, LZString.compressToUTF16(job.json), job.meta);
    } catch (e) {
      console.warn('Save failed', e);
    }
  }
}

/** saveToSlot, compressed off the main thread when the build can (the autosave). */
export function saveToSlotSoon(state: GameState, slot: SlotId): boolean {
  if (!compressAsync) return saveToSlot(state, slot);
  if (state.difficulty === 'ironman' && !isAutoSlot(slot)) return false;
  try {
    const save = makeSave(state, slot);
    const job = { json: JSON.stringify(save), meta: JSON.stringify(save.meta) };
    queued.set(slot, job);
    const done = (lz: string | null) => {
      if (queued.get(slot) !== job) return; // a newer save of this slot took over
      queued.delete(slot);
      try {
        writeSlot(slot, lz ?? LZString.compressToUTF16(job.json), job.meta);
      } catch (e) {
        console.warn('Save failed', e);
      }
    };
    compressAsync(job.json).then(done, () => done(null));
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
  const q = queued.get(slot);
  const raw = q ? q.json : kv.getItem(key(slot));
  if (!raw) return null;
  try {
    return parseSave(raw).state;
  } catch (e) {
    console.warn('Load failed', e);
    return null;
  }
}

export function slotMeta(slot: SlotId): SaveMeta | null {
  const metaRaw = queued.get(slot)?.meta ?? kv.getItem(key(slot) + '.meta');
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
  queued.delete(slot);
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
    if (!raw) return fallback;
    const v = JSON.parse(raw);
    // objects are merged over the defaults; anything else (a version string, a list) is the value
    const isObj = (x: unknown) => !!x && typeof x === 'object' && !Array.isArray(x);
    return (isObj(fallback) && isObj(v) ? { ...fallback, ...v } : v) as T;
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
