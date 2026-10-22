import { Game } from './ui/app';
import { TitleScene } from './ui/scenes/title';
import { loadBrowserContent } from './content.browser';
import { makeDoc } from './sim/docs';
import { Rng } from './core/rng';
import { lookFor, drawRig, POSES } from './ui/rig';
import { fighterPortrait } from './ui/sprites';
import { openRoster } from './ui/scenes/roster';
import { openRankings } from './ui/scenes/rankings';
import { openInbox } from './ui/scenes/inbox';
import { openChart } from './ui/scenes/chart';
import { openCorkboard } from './ui/scenes/corkboard';
import { openSettings } from './ui/scenes/settings';
import { openCredits } from './ui/scenes/credits';
import { openGameMenu } from './ui/scenes/gamemenu';
import { openJukebox } from './ui/scenes/jukebox';
import { openLoad } from './ui/scenes/loadmenu';
import { openLedgerPeek } from './ui/scenes/ledger';
import { openNegotiation } from './ui/scenes/negotiation';
import { openFighterEditor } from './ui/scenes/editor_fighter';
import { openFightLab } from './ui/scenes/fightlab';
import { installTouch, attachTouchCanvas } from './ui/touch';
import { installController } from './ui/controller';
import { installNative, importLegacySaves } from './native';
import { platform } from './core/platform';
import { installSaveFiles, syncPlatformAchievements } from './desktopsync';
import { FMHubScene } from './ui/scenes/fmhub';
import { DeskScene } from './ui/scenes/desk';
import { setAsyncCompressor, flushSaves } from './core/save';

/** The autosave's compression on a worker; anything wrong with it and saves stay on the main thread. */
function installSaveWorker(): void {
  let w: Worker;
  try {
    w = new Worker(new URL('./saveworker.ts', import.meta.url), { type: 'module' });
  } catch {
    return;
  }
  let n = 0;
  const waiting = new Map<number, { ok: (lz: string) => void; fail: () => void }>();
  const failAll = () => {
    setAsyncCompressor(null);
    for (const p of waiting.values()) p.fail();
    waiting.clear();
  };
  w.onerror = failAll;
  w.onmessage = (e: MessageEvent<{ id: number; lz: string | null }>) => {
    const p = waiting.get(e.data.id);
    waiting.delete(e.data.id);
    if (p) (e.data.lz !== null ? p.ok(e.data.lz) : p.fail());
  };
  setAsyncCompressor(
    (json) =>
      new Promise<string>((ok, fail) => {
        const id = ++n;
        waiting.set(id, { ok, fail });
        w.postMessage({ id, json });
        // a worker that never answers: fall back to writing it here
        setTimeout(() => {
          if (waiting.delete(id)) fail();
        }, 15000);
      }),
  );
  // leaving the app (home button, app switcher, closing the tab): write what's still queued
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'hidden') flushSaves();
  });
  window.addEventListener('pagehide', () => flushSaves());
}

async function boot() {
  await importLegacySaves(); // Android: saves from the old (Godot) app, before anything reads storage
  installSaveWorker();
  installSaveFiles(); // desktop: saves mirrored to files (Steam Cloud syncs those)
  syncPlatformAchievements();
  loadBrowserContent();
  const game = new Game();
  document.body.dataset.platform = platform;
  installTouch(); // before Pixi's event system, so pinch-zoom can claim the second finger
  await game.init(document.getElementById('game')!);
  attachTouchCanvas(game.app.canvas);
  // leaving the app (home button, app switcher, closing the tab): phones may never come back, so
  // the week so far is saved too, not just what was already queued
  const keepWeek = () => {
    if (game.scene instanceof FMHubScene || game.scene instanceof DeskScene) game.autosave();
    flushSaves();
  };
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'hidden') keepWeek();
  });
  window.addEventListener('pagehide', keepWeek);
  // Phones drop the WebGL context under memory pressure (or after a long freeze): the canvas goes
  // black and never comes back. Keep the week (between screens the state is whole) and restart.
  game.app.canvas.addEventListener('webglcontextlost', (e) => {
    e.preventDefault();
    if (game.scene instanceof FMHubScene || game.scene instanceof DeskScene) game.autosave();
    flushSaves();
    setTimeout(() => location.reload(), 200);
  });
  const pad = installController(game, {
    // Menu button: the in-career menu on the desk, settings anywhere else
    onMenu: () =>
      game.state?.phase === 'desk' && !(game.scene instanceof TitleScene)
        ? openGameMenu(game, () => game.scene?.refresh())
        : openSettings(game),
    onFightLab: () => openFightLab(game),
  });
  void installNative({ onBack: () => pad.key('Escape', 'Escape') });
  (window as any).__game = game; // debug / automated testing hook
  (window as any).__pad = pad;
  (window as any).__sim = { makeDoc, Rng, lookFor, drawRig, POSES, fighterPortrait };
  (window as any).__open = {
    roster: openRoster, rankings: openRankings, inbox: openInbox, chart: openChart, corkboard: openCorkboard, settings: openSettings,
    credits: openCredits, gamemenu: openGameMenu, jukebox: openJukebox, load: openLoad, ledger: openLedgerPeek, negotiation: openNegotiation,
    editor: openFighterEditor, fightlab: openFightLab,
  };
  game.goto(new TitleScene(game));
  if (new URLSearchParams(location.search).has('fightlab')) openFightLab(game);
}

boot().catch((e) => {
  console.error(e);
  document.body.innerHTML = `<pre style="color:#e6dcc4;padding:20px">CAGE BOSS failed to start:\n${String(e?.stack ?? e)}</pre>`;
});
