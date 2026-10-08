/**
 * Desktop extras (the Electron build only; a no-op in the browser and on mobile):
 *
 *  - Save files on disk. Every save, setting and achievement is also written as a file in the
 *    game's user-data folder (`saves/`), and those files win at startup. That folder is what
 *    Steam Auto-Cloud syncs, so cloud saves need no extra code: see docs/STEAM.md.
 *  - Steam achievements. When the desktop shell has Steam running (steamworks.js installed and
 *    an App ID configured), every achievement unlocked in-game is unlocked on Steam too.
 */
import { setStorage, type KV } from './core/save';

interface DesktopFiles {
  readAll: () => Record<string, string>;
  write: (key: string, value: string) => void;
  remove: (key: string) => void;
}
interface DesktopBridge {
  files?: DesktopFiles;
  achievement?: (id: string) => void;
  steam?: () => Promise<boolean>;
}
const bridge = (): DesktopBridge | null => (typeof window !== 'undefined' ? ((window as unknown as { cagebossDesktop?: DesktopBridge }).cagebossDesktop ?? null) : null);

/** Mirror storage to files on disk (call first thing at boot). */
export function installSaveFiles(): void {
  const files = bridge()?.files;
  if (!files || typeof localStorage === 'undefined') return;
  // the files win: they may have come down from Steam Cloud since this machine last played
  try {
    for (const [k, v] of Object.entries(files.readAll())) if (k.startsWith('cageboss.')) localStorage.setItem(k, v);
    // anything only in local storage (saves from before the files existed) gets a file now
    for (let i = 0; i < localStorage.length; i++) {
      const k = localStorage.key(i);
      if (k?.startsWith('cageboss.')) files.write(k, localStorage.getItem(k) ?? '');
    }
  } catch (e) {
    console.warn('Save files unavailable', e);
    return;
  }
  const kv: KV = {
    getItem: (k) => localStorage.getItem(k),
    setItem: (k, v) => {
      localStorage.setItem(k, v);
      if (k.startsWith('cageboss.')) files.write(k, v);
    },
    removeItem: (k) => {
      localStorage.removeItem(k);
      if (k.startsWith('cageboss.')) files.remove(k);
    },
  };
  setStorage(kv);
}

/** Achievements earned before Steam was there (or offline) get unlocked on Steam at boot. */
export function syncPlatformAchievements(): void {
  const b = bridge();
  if (!b?.achievement) return;
  try {
    const have = JSON.parse(localStorage.getItem('cageboss.achievements') ?? '{}') as Record<string, number>;
    for (const id of Object.keys(have)) b.achievement(id);
  } catch {
    /* nothing to sync */
  }
}

/** Unlock an achievement on the platform too (Steam), if there is one. */
export function platformAchievement(id: string): void {
  try {
    bridge()?.achievement?.(id);
  } catch {
    /* no Steam: the in-game list is the whole story */
  }
}
