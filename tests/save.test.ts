import { describe, it, expect, afterEach } from 'vitest';
import LZString from 'lz-string';
import { newGame } from './setup';
import { saveToSlot, saveToSlotSoon, loadFromSlot, slotMeta, flushSaves, setAsyncCompressor, setStorage, type KV } from '../src/core/save';

function memoryKV(): KV & { m: Map<string, string> } {
  const m = new Map<string, string>();
  return { m, getItem: (k) => m.get(k) ?? null, setItem: (k, v) => void m.set(k, v), removeItem: (k) => void m.delete(k) };
}

/** a compressor whose answers the test releases by hand */
function slowCompressor() {
  const jobs: { json: string; ok: (lz: string) => void; fail: () => void }[] = [];
  setAsyncCompressor((json) => new Promise((ok, fail) => jobs.push({ json, ok, fail })));
  return jobs;
}
const tick = () => new Promise((r) => setTimeout(r, 0));

describe('background autosave', () => {
  afterEach(() => setAsyncCompressor(null));

  it('loads the newest save while it is still compressing, then writes it', async () => {
    const kv = memoryKV();
    setStorage(kv);
    const s = newGame(5);
    saveToSlot(s, 'auto');
    const jobs = slowCompressor();
    s.week = 7;
    expect(saveToSlotSoon(s, 'auto')).toBe(true);
    expect(loadFromSlot('auto')!.week).toBe(7);
    expect(slotMeta('auto')!.week).toBe(7);
    expect(JSON.parse(LZString.decompressFromUTF16(kv.getItem('cageboss.save.auto')!.slice(3))!).meta.week).toBe(0);
    jobs[0].ok(LZString.compressToUTF16(jobs[0].json));
    await tick();
    expect(kv.getItem('cageboss.save.auto')!.startsWith('lz:')).toBe(true);
    expect(loadFromSlot('auto')!.week).toBe(7);
  });

  it('a newer save wins over an older one that finishes later', async () => {
    const kv = memoryKV();
    setStorage(kv);
    const s = newGame(6);
    const jobs = slowCompressor();
    s.week = 1;
    saveToSlotSoon(s, 'auto');
    s.week = 2;
    saveToSlotSoon(s, 'auto');
    jobs[1].ok(LZString.compressToUTF16(jobs[1].json));
    await tick();
    jobs[0].ok(LZString.compressToUTF16(jobs[0].json));
    await tick();
    expect(loadFromSlot('auto')!.week).toBe(2);
  });

  it('writes on the spot when the worker fails, and flushes when the app goes away', async () => {
    const kv = memoryKV();
    setStorage(kv);
    const s = newGame(7);
    const jobs = slowCompressor();
    s.week = 3;
    saveToSlotSoon(s, 'auto');
    jobs[0].fail();
    await tick();
    expect(kv.getItem('cageboss.save.auto.meta')).toContain('"week":3');
    s.week = 4;
    saveToSlotSoon(s, 'auto');
    flushSaves();
    expect(kv.getItem('cageboss.save.auto.meta')).toContain('"week":4');
    jobs[1].ok('garbage'); // too late: already written
    await tick();
    expect(loadFromSlot('auto')!.week).toBe(4);
  });
});
