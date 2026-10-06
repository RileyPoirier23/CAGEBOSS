/** Bridge to the desktop (Electron) build. Null when running in a browser. */
export interface DesktopBridge {
  quit(): void;
  setFullscreen(on: boolean): void;
  isFullscreen(): Promise<boolean>;
}

export const desktop: DesktopBridge | null = (globalThis as { cagebossDesktop?: DesktopBridge }).cagebossDesktop ?? null;
