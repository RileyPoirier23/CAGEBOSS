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
import { installNative } from './native';
import { platform } from './core/platform';

async function boot() {
  loadBrowserContent();
  const game = new Game();
  document.body.dataset.platform = platform;
  installTouch(); // before Pixi's event system, so pinch-zoom can claim the second finger
  await game.init(document.getElementById('game')!);
  attachTouchCanvas(game.app.canvas);
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
