import { Game } from './ui/app';
import { TitleScene } from './ui/scenes/title';
import { loadBrowserContent } from './content.browser';
import { makeDoc } from './sim/docs';
import { Rng } from './core/rng';

async function boot() {
  loadBrowserContent();
  const game = new Game();
  await game.init(document.getElementById('game')!);
  (window as any).__game = game; // debug / automated testing hook
  (window as any).__sim = { makeDoc, Rng };
  game.goto(new TitleScene(game));
}

boot().catch((e) => {
  console.error(e);
  document.body.innerHTML = `<pre style="color:#e6dcc4;padding:20px">CAGE BOSS failed to start:\n${String(e?.stack ?? e)}</pre>`;
});
