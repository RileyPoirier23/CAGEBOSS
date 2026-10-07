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
