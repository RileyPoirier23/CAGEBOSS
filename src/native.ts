/**
 * Native shell glue (Capacitor iOS / Android, Xbox UWP host). Everything here is a
 * no-op in a browser and in Electron; the Capacitor plugins are loaded lazily so
 * the web / desktop bundles don't pay for them up front.
 */
import { platform, isNativeMobile } from './core/platform';
import { setHostPads, type PadState } from './core/input';

export interface NativeHooks {
  /** Android back button / Xbox B-as-back: behave like Escape */
  onBack: () => void;
}

/**
 * Android: the app was a Godot build before 2.1 (same app id), which kept its localStorage as
 * files. The first launch of this build copies them in (android/.../LegacySavesPlugin.java), so
 * an update keeps your careers. Anything already in this localStorage wins.
 */
export async function importLegacySaves(): Promise<void> {
  if (platform !== 'android') return;
  try {
    const { registerPlugin } = await import('@capacitor/core');
    const plugin = registerPlugin<{ read(): Promise<Record<string, string>>; done(): Promise<void> }>('LegacySaves');
    const old = await plugin.read();
    const keys = Object.keys(old);
    if (!keys.length) return;
    for (const k of keys) if (localStorage.getItem(k) === null) localStorage.setItem(k, old[k]);
    await plugin.done();
  } catch (e) {
    console.warn('Old saves not imported', e);
  }
}

export async function installNative(hooks: NativeHooks): Promise<void> {
  if (isNativeMobile) {
    try {
      const { StatusBar } = await import('@capacitor/status-bar');
      await StatusBar.hide();
    } catch {
      /* plugin missing: Info.plist hides it on iOS anyway */
    }
    try {
      const { App } = await import('@capacitor/app');
      // Android hardware/gesture back: close the top window instead of quitting the app
      await App.addListener('backButton', () => hooks.onBack());
    } catch {
      /* no-op */
    }
  }

  // Xbox host (platforms/xbox): WebView2 web messages
  const wv = (globalThis as { chrome?: { webview?: { addEventListener: (t: string, f: (e: { data: unknown }) => void) => void; postMessage: (m: unknown) => void } } }).chrome?.webview;
  if (wv) {
    wv.addEventListener('message', (e) => {
      const m = e.data as { type?: string; pads?: PadState[] } | null;
      if (!m || typeof m !== 'object') return;
      // the host forwards Windows.Gaming.Input pads if the page can't see them itself
      if (m.type === 'pads' && Array.isArray(m.pads)) setHostPads(m.pads);
      if (m.type === 'back') hooks.onBack();
    });
    if (platform === 'xbox') wv.postMessage({ type: 'ready' });
  }
}
