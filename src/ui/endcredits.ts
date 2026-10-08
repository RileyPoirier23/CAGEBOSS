/**
 * The end of Road To Champion: the credits roll, a thank-you, then the memorial.
 * None of it can be skipped: everybody who finishes the road sees her.
 *
 *   In Memoriam: Yvette Collette (August 20th 1953 - October 7th 2026).
 *   Grandmother, Sister, Wife and Mother.
 *
 * The portrait is her real photo, in black and white and reduced to pixels to sit in the game's
 * style, in front of a soft pixel backdrop (public/memorial/memere_portrait.png). Her photo is
 * not redrawn or generated; only the room behind her is.
 */
import { Assets, Container, Graphics, Sprite, type Texture, type Ticker } from 'pixi.js';
import type { Game } from './app';
import { PAL } from '../art/palette';
import { W, H, text, button } from './kit';
import { setMusicContext } from '../audio/music';
import { FRIENDS, ARTISTS, SUPPORTERS } from './creditsdata';

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
  ['Han "The Pride Of The Maritimes" Tibular', 'n'],
  ['Uncle Ray, and his soup', 'n'],
  ['Tyler "Trust Fund" Vance', 'n'],
  ['Gordon Vance, landlord', 'n'],
  ['Mateo, age twelve and three-quarters', 'n'],
  ['Wyatt "LeproClepto" Smitt', 'n'],
  ['Zac "The Attacker" Buna', 'n'],
  ['Spadam "The White Beast" Biggs', 'n'],
  ['"Dirty" Daniel Stinkovich, the worst referee alive', 'n'],
  ['Xavier "Allstar" Cockett', 'n'],
  ['Bradie, against all advice', 'n'],
  ['Jimmy Quavo, vitamins', 'n'],
  ['1ton', 'n'],
  ['Dane Whyte', 'n'],
  ['The Juiced Butler', 'n'],
  ['Lon Anik  •  Blow Hogan  •  Sandwich Cormier', 'n'],
  ['', 'n'],
  ['The real ones', 's'],
  ['These friends asked to be in the game.', 'n'],
  ['Thank you for that, and for everything else.', 'n'],
  ...FRIENDS.map(([real, as]): [string, Kind] => [real === as ? real : `${real}  as  ${as}`, 'b']),
  ['', 'n'],
  ['Original soundtrack by local artists', 's'],
  ...ARTISTS.map(([name, real]): [string, Kind] => [real && real !== name ? `${name}  (${real})` : name, 'b']),
  ['Hope Nikku  •  FTB VON  •  prod. Miler', 'n'],
  ['Thank you for letting me put your songs in this.', 'n'],
  ['Every walkout in here is yours.', 'n'],
  ['', 'n'],
  ['Supporters', 's'],
  ...(SUPPORTERS.length ? SUPPORTERS.map((n): [string, Kind] => [n, 'n']) : [['Your name could be here (SUPPORT THE DEV, on the title screen).', 'n'] as [string, Kind]]),
  ['Thank you for keeping a solo dev going.', 'n'],
  ['', 'n'],
  ['Find me', 's'],
  ['Instagram: @506clicks  •  @rpoirier07', 'n'],
  ['TikTok: iheartgrannies69  •  Discord: gldmonkey', 'n'],
  ['', 'n'],
  ['Made in Moncton, New Brunswick', 's'],
  ['506clicks.ca', 'n'],
  ['', 'n'],
  ["Ray's Boxing & Soup is still open.", 'g'],
  ['The soup is still free.', 'g'],
];

const THANKS = 'From a bingo-hall smoker to the biggest fight in the world. Thank you for playing CAGE BOSS: every fight, every bad contract, every bowl of soup. It means more than you know.';

/**
 * Credits roll, thank-you, memorial. `done` when the player leaves the memorial.
 * The end of the road: nothing skippable. From the CREDITS menu (`menu`): you can skip ahead,
 * but only as far as the memorial. Everybody sees her.
 */
export function openEndCredits(g: Game, done: () => void, opts: { menu?: boolean } = {}): void {
  const root = new Container();
  const wrap = g.modal(root, { dim: 1 });
  root.addChild(new Graphics().rect(0, 0, W, H).fill(0x060508));
  setMusicContext('title');
  // no Esc / back out of this one (from the menu, Esc skips ahead to the memorial)
  const popKeys = g.pushKeyHandler((e) => {
    if (opts.menu && e.type === 'keydown' && (e.key === 'Escape' || e.key === 'Backspace' || e.key === 'Enter')) toMemorial();
    return e.key === 'Escape' || e.key === 'Backspace' || (!!opts.menu && e.key === 'Enter');
  });
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
  const showMemorial = () => {
    stage = 'memorial';
    t = 0;
    skip?.destroy();
    skip = null;
    memorial = buildMemorial(g, () => {
      g.app.ticker.remove(tick);
      pop();
      g.closeModal(wrap);
      done();
    }, opts.menu ? 4 : 8);
    memorial.alpha = 0;
    root.addChild(memorial);
  };
  /** Menu version: jump to the memorial (never past it). */
  const toMemorial = () => {
    if (stage === 'memorial') return;
    roll.visible = false;
    thanks?.destroy({ children: true });
    thanks = null;
    showMemorial();
  };
  let skip: Container | null = opts.menu ? button('SKIP TO THE END', W - 92, H - 16, 86, 12, toMemorial, { small: true, fill: 0x2a262c }) : null;
  if (skip) root.addChild(skip);
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
        showMemorial();
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
  // her portrait, framed like a photo on the left
  const px = 32;
  const py = 42;
  const pw = 129;
  const ph = 140;
  c.addChild(new Graphics().rect(px, py, pw, ph).fill(0x0c0b0e).rect(px, py, pw, ph).stroke({ color: 0x8a8478, width: 1, alignment: 1 }));
  const photo = new Sprite();
  photo.position.set(px + 2, py + 2);
  c.addChild(photo);
  Assets.load(`${import.meta.env.BASE_URL}memorial/memere_portrait.png`).then((tex: Texture) => {
    if (photo.destroyed) return;
    tex.source.scaleMode = 'nearest';
    photo.texture = tex;
  }).catch(() => {});
  // the words, on the right
  const tx = 182;
  const tw = W - tx - 24;
  const line = (s: string, y: number, color: number, o: { scale?: number; small?: boolean; maxLines?: number } = {}) =>
    c.addChild(text(s, tx, y, { width: tw, color, scale: o.scale, small: o.small, maxLines: o.maxLines }));
  line('IN MEMORIAM', 30, 0x8a8478, { small: true });
  line('YVETTE COLLETTE', 41, 0xeee8dc, { scale: 2 });
  line('August 20th 1953  -  October 7th 2026', 64, 0xb8b2a6);
  line('Grandmother, Sister, Wife and Mother.', 80, 0xeee8dc);
  c.addChild(new Graphics().rect(tx, 96, 60, 1).fill(0x5a5650));
  line('John 14:27', 104, 0x8a8478, { small: true });
  line('"Peace I leave with you; my peace I give to you. Not as the world gives do I give to you. Let not your hearts be troubled, neither let them be afraid."', 114, 0xd8d2c6, { maxLines: 5 });
  line("I love you memere, I'll keep making you proud", 190, PAL.gold);
  const btn = button('CONTINUE', W / 2 - 40, H - 26, 80, 13, close, { small: true, fill: 0x2a262c });
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
