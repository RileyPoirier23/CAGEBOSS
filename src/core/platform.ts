/**
 * Which shell is the game running in? Detected once at startup.
 *
 *  desktop  Electron build (the `cagebossDesktop` preload bridge exists)
 *  ios      Capacitor iOS app
 *  android  Capacitor Android app
 *  xbox     the UWP / WebView2 host in platforms/xbox (it injects `cagebossHost`),
 *           or an Xbox user agent
 *  playstation  the native PlayStation runtime host (it injects `cagebossHost` with
 *           platform 'playstation')
 *  web      anything else (a browser, desktop or mobile)
 *
 * `?platform=xbox|playstation|ios|android|web` in the URL overrides detection (handy for testing
 * the console / phone layouts in a desktop browser).
 */
export type Platform = 'desktop' | 'web' | 'ios' | 'android' | 'xbox' | 'playstation';

interface HostInfo {
  platform?: string;
}

function detect(): Platform {
  const g = globalThis as {
    cagebossDesktop?: unknown;
    cagebossHost?: HostInfo;
    Capacitor?: { isNativePlatform?: () => boolean; getPlatform?: () => string };
    location?: Location;
    navigator?: Navigator;
  };
  try {
    const q = new URLSearchParams(g.location?.search ?? '').get('platform');
    if (q === 'desktop' || q === 'web' || q === 'ios' || q === 'android' || q === 'xbox' || q === 'playstation') return q;
  } catch {
    /* no URL (tests) */
  }
  if (g.cagebossDesktop) return 'desktop';
  if (g.cagebossHost?.platform === 'xbox') return 'xbox';
  if (g.cagebossHost?.platform === 'playstation') return 'playstation';
  const cap = g.Capacitor;
  if (cap?.isNativePlatform?.()) {
    const p = cap.getPlatform?.();
    if (p === 'ios' || p === 'android') return p;
  }
  if (/Xbox/i.test(g.navigator?.userAgent ?? '')) return 'xbox';
  return 'web';
}

export const platform: Platform = detect();

/** Consoles: the shell owns the window (no quit, no fullscreen toggle), and no keyboard or mouse prompts anywhere. */
export const isConsole = platform === 'xbox' || platform === 'playstation';
/** Which pad the button names and glyphs follow. */
export const padStyle: 'xbox' | 'playstation' = platform === 'playstation' ? 'playstation' : 'xbox';
export const isNativeMobile = platform === 'ios' || platform === 'android';
/** Electron only: the game can quit itself and toggle fullscreen. */
export const canQuit = platform === 'desktop';

/** Touch-first device (phone / tablet), native or in a mobile browser. */
export function isTouchDevice(): boolean {
  if (isNativeMobile) return true;
  try {
    return matchMedia('(pointer: coarse)').matches && (navigator.maxTouchPoints ?? 0) > 0;
  } catch {
    return false;
  }
}

/** A TV is on the other end: show the TV-safe margin setting and 10-foot hints. */
export const isTenFoot = isConsole;
