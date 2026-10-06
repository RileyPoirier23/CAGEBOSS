import { Game } from './ui/app';
import { TitleScene } from './ui/scenes/title';
import { loadBrowserContent } from './content.browser';
import { makeDoc } from './sim/docs';
import { Rng } from './core/rng';
import { lookFor, drawRig, POSES } from './ui/rig';
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

async function boot() {
  loadBrowserContent();
  const game = new Game();
  await game.init(document.getElementById('game')!);
  (window as any).__game = game; // debug / automated testing hook
  (window as any).__sim = { makeDoc, Rng, lookFor, drawRig, POSES };
  (window as any).__open = {
    roster: openRoster, rankings: openRankings, inbox: openInbox, chart: openChart, corkboard: openCorkboard, settings: openSettings,
    credits: openCredits, gamemenu: openGameMenu, jukebox: openJukebox, load: openLoad, ledger: openLedgerPeek, negotiation: openNegotiation,
    editor: openFighterEditor,
  };
  game.goto(new TitleScene(game));
}

boot().catch((e) => {
  console.error(e);
  document.body.innerHTML = `<pre style="color:#e6dcc4;padding:20px">CAGE BOSS failed to start:\n${String(e?.stack ?? e)}</pre>`;
});
