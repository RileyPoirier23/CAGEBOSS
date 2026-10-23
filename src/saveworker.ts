/** Compresses saves off the main thread (core/save.ts saveToSlotSoon; started by main.ts). */
import LZString from 'lz-string';

self.onmessage = (e: MessageEvent<{ id: number; json: string }>) => {
  const { id, json } = e.data;
  try {
    self.postMessage({ id, lz: LZString.compressToUTF16(json) });
  } catch {
    self.postMessage({ id, lz: null });
  }
};
