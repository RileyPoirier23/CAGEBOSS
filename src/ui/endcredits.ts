/**
 * The end of Road To Champion: the credits roll, a thank-you, then the memorial.
 * None of it can be skipped: everybody who finishes the road sees her.
 *
 *   In Memoriam: Yvette Collette (August 20th 1953 - October 7th 2026).
 *   Grandmother, Wife and Mother.
 *
 * The portrait is her real photo with the background removed, in black and white, reduced to
 * pixels and set in a headshot medallion to sit in the game's style (public/memorial/memere.png).
 * Nothing in it is redrawn or generated.
 */
import { Assets, Container, Graphics, Sprite, type Texture, type Ticker } from 'pixi.js';
import type { Game } from './app';
import { PAL } from '../art/palette';
import { W, H, text, button } from './kit';
import { setMusicContext } from '../audio/music';

type Kind = 'h' | 'n' | 'g' | 's' | 'b';
const ROLL: [string, Kind][] = [
  ['CAGE BOSS', 'h'],
  ['ROAD TO CHAMPION', 'g'],
  ['', 'n'],
  ['A 506CLICKS GAME', 's'],
  ['', 'n'],
  ['Game design, idea, story, art and everything else', 's'],
  ['Riley "Monkey Man" Poirier', 'b'],
  ['506Clicks', 'b'],
  ['', 'n'],
  ['Starring', 's'],
  ['You', 'n'],
  ['Uncle Ray, and his soup', 'n'],
  ['Tyler "Trust Fund" Vance', 'n'],
  ['Bradie, against all advice', 'n'],
  ['Dane Whyte', 'n'],
  ['The Juiced Butler', 'n'],
  ['Lon Anik  •  Blow Hogan  •  Sandwich Cormier', 'n'],
  ['', 'n'],
  ['Original soundtrack by local artists', 's'],
  ['SANDO', 'n'],
  ['SANDO x RUIN', 'n'],
  ['RUIN143', 'n'],
  ['Zuddha', 'n'],
  ['F.O.K. ft. Hope Nikku', 'n'],
  ['EYE-V', 'n'],
  ['', 'n'],
  ['Made in Moncton, New Brunswick', 's'],
  ['506clicks.ca', 'n'],
  ['', 'n'],
  ["Ray's Boxing & Soup is still open.", 'g'],
  ['The soup is still free.', 'g'],
];

const THANKS = 'From a bingo-hall smoker to the CBFC belt. Thank you for playing CAGE BOSS: every fight, every bad contract, every bowl of soup. It means more than you know.';

/** Credits roll, thank-you, memorial. Nothing skippable. `done` when the player leaves the memorial. */
export function openEndCredits(g: Game, done: () => void): void {
  const root = new Container();
  const wrap = g.modal(root, { dim: 1 });
  root.addChild(new Graphics().rect(0, 0, W, H).fill(0x060508));
  setMusicContext('title');
  // no Esc / back out of this one
  const popKeys = g.pushKeyHandler((e) => e.key === 'Escape' || e.key === 'Backspace');
  g.cutscene = true;
  const pop = () => {
    popKeys();
    g.cutscene = false;
  };
  const roll = new Container();
  root.addChild(roll);
  let y = 0;
  for (const [s, kind] of ROLL) {
    if (!s) {
      y += 14;
      continue;
    }
    const color = kind === 'h' ? PAL.blood : kind === 'g' || kind === 'b' ? PAL.gold : kind === 's' ? PAL.ash : PAL.bone;
    roll.addChild(text(s, 0, y, { width: W, align: 'center', color, scale: kind === 'h' ? 3 : 1, small: kind === 's' }));
    y += kind === 'h' ? 30 : kind === 's' ? 10 : 12;
  }
  const rollH = y;
  roll.y = H;
  let stage: 'roll' | 'thanks' | 'memorial' = 'roll';
  let t = 0;
  let thanks: Container | null = null;
  let memorial: Container | null = null;
  const tick = (tk: Ticker) => {
    const dt = Math.min(0.05, tk.deltaMS / 1000);
    t += dt;
    if (stage === 'roll') {
      roll.y -= dt * 20;
      if (roll.y < -rollH) {
        roll.visible = false;
        stage = 'thanks';
        t = 0;
        thanks = new Container();
        thanks.addChild(text('THANK YOU FOR PLAYING', 0, 98, { width: W, align: 'center', color: PAL.gold, scale: 2 }));
        thanks.addChild(text(THANKS, 60, 124, { width: W - 120, align: 'center', color: PAL.bone, maxLines: 4 }));
        thanks.addChild(text('Riley & 506Clicks', 0, 160, { width: W, align: 'center', color: PAL.ash, small: true }));
        thanks.alpha = 0;
        root.addChild(thanks);
      }
    } else if (stage === 'thanks' && thanks) {
      // fade in, hold, fade out
      thanks.alpha = t < 1.5 ? t / 1.5 : t < 7 ? 1 : Math.max(0, 1 - (t - 7) / 1.5);
      if (t > 8.8) {
        thanks.destroy({ children: true });
        thanks = null;
        stage = 'memorial';
        t = 0;
        memorial = buildMemorial(g, () => {
          g.app.ticker.remove(tick);
          pop();
          g.closeModal(wrap);
          done();
        }, 8);
        memorial.alpha = 0;
        root.addChild(memorial);
      }
    } else if (memorial) {
      memorial.alpha = Math.min(1, t / 3);
    }
  };
  g.app.ticker.add(tick);
  wrap.once('destroyed', () => {
    g.app.ticker.remove(tick);
    pop();
  });
}

/** In Memoriam. `waitSec`: how long before CONTINUE appears. */
export function buildMemorial(g: Game, close: () => void, waitSec = 0): Container {
  const c = new Container();
  c.addChild(new Graphics().rect(0, 0, W, H).fill(0x060508));
  // her headshot medallion, centred at the top
  const size = 104;
  const photo = new Sprite();
  photo.position.set(Math.round((W - size) / 2), 10);
  c.addChild(photo);
  Assets.load(`${import.meta.env.BASE_URL}memorial/memere.png`).then((tex: Texture) => {
    if (photo.destroyed) return;
    tex.source.scaleMode = 'nearest';
    photo.texture = tex;
  }).catch(() => {});
  const col = (s: string, y: number, color: number, o: { scale?: number; small?: boolean; maxLines?: number; x?: number; w?: number } = {}) =>
    c.addChild(text(s, o.x ?? 0, y, { width: o.w ?? W, align: 'center', color, scale: o.scale, small: o.small, maxLines: o.maxLines }));
  col('IN MEMORIAM', 120, 0x8a8478, { small: true });
  col('YVETTE COLLETTE', 130, 0xeee8dc, { scale: 2 });
  col('August 20th 1953  -  October 7th 2026', 152, 0xb8b2a6);
  col('Grandmother, Wife and Mother.', 165, 0xeee8dc);
  c.addChild(new Graphics().rect(W / 2 - 30, 180, 60, 1).fill(0x5a5650));
  col('John 14:27', 186, 0x8a8478, { small: true });
  col('"Peace I leave with you; my peace I give to you. Not as the world gives do I give to you. Let not your hearts be troubled, neither let them be afraid."', 196, 0xd8d2c6, { x: 50, w: W - 100, maxLines: 4 });
  col("I love you memere, I'll keep making you proud", 236, PAL.gold);
  const btn = button('CONTINUE', W / 2 - 40, H - 18, 80, 13, close, { small: true, fill: 0x2a262c });
  btn.visible = waitSec <= 0;
  c.addChild(btn);
  if (waitSec > 0) {
    let t = 0;
    const tk = (x: Ticker) => {
      t += x.deltaMS / 1000;
      if (t >= waitSec) {
        btn.visible = true;
        g.app.ticker.remove(tk);
      }
    };
    g.app.ticker.add(tk);
    c.once('destroyed', () => g.app.ticker.remove(tk));
  }
  return c;
}

/** The memorial on its own (CREDITS, once you've finished the road). */
export function openMemorial(g: Game): void {
  const root = new Container();
  const wrap = g.modal(root, { dim: 1 });
  root.addChild(buildMemorial(g, () => g.closeModal(wrap)));
}
