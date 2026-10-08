/**
 * Cutscenes: little pixel-art scenes for the story (and weigh-in face-offs and pressers).
 * A cutscene is a list of shots; each shot is a location, a cast standing in it, and lines of
 * dialogue (typewriter text, a name tag, the speaker bobbing). Optional choices at the end.
 * Characters are drawn with the fight rig, so fighters look like themselves.
 *
 *   playCutscene(g, scene, (choice) => ...)
 */
import { Container, Graphics, type Ticker } from 'pixi.js';
import type { Game } from './app';
import type { Fighter } from '../core/types';
import { PAL } from '../art/palette';
import { W, H, text, button, box } from './kit';
import { POSES, drawRig, lookFor, type Look2, type Pose } from './rig';
import { input } from '../core/input';
import { sfx } from '../audio/sfx';

export type Bg = 'gym' | 'street' | 'office' | 'presser' | 'stage' | 'cage' | 'lot' | 'booth' | 'landlord' | 'black';

export interface Actor {
  id: string;
  /** a fighter (drawn as himself), or a fixed look */
  fighter?: Fighter;
  look?: Look2;
  /** street clothes over a fighter's look */
  clothes?: { top: number; bottom: number };
  name: string;
  x: number;
  facing: 1 | -1;
  pose?: Pose;
  scale?: number;
  /** walk in from off-screen */
  enter?: 'left' | 'right';
}
export interface Line {
  who: string | null;
  text: string;
  /** pose changes as the line starts */
  poses?: Record<string, Pose>;
  shake?: boolean;
  flash?: boolean;
  sfx?: 'punch' | 'thud' | 'roar' | 'crowd' | 'bell' | 'snap' | 'click' | 'cash' | 'whoosh';
}
export interface Shot {
  bg: Bg;
  cast: Actor[];
  lines: Line[];
  /** a caption over the shot ("ONE WEEK LATER") */
  caption?: string;
}
export interface Cutscene {
  title?: string;
  shots: Shot[];
  choices?: { id: string; label: string }[];
}

// ------------------------------------------------------------ the regular cast

const base = (o: Partial<Look2>): Look2 => ({ skin: 0xd8a07a, hairStyle: 1, hairColor: 0x2a1a10, beard: 0, build: 1, trunks: 0x222222, trim: 0x222222, glove: 0xd8a07a, stance: 'upright', female: false, tattoo: 0, ...o });
export const CAST: Record<string, Look2> = {
  // Uncle Ray: 70, grey ponytail and beard, cardigan over a stained apron, forearms like hams
  ray: base({ skin: 0xd09a74, hairStyle: 3, hairColor: 0xb4afa6, beard: 3, build: 2, brows: 1, outfit: { top: 0x6a5a48, bottom: 0x3a3632, shirt: 0xd8d0bc, bulk: 2, hands: 0xd09a74 } }),
  // Dane Whyte: bald, black shirt, black suit, no tie, permanently on the phone
  dane: base({ skin: 0xe2b392, hairStyle: 0, beard: 0, build: 2, outfit: { top: 0x15151a, bottom: 0x15151a, shirt: 0x202024, bulk: 2, hands: 0xe2b392 } }),
  // Gordon Vance: the landlord. Silver side-part, navy three-piece, red tie, a clipboard he never reads
  gordon: base({ skin: 0xe8c0a0, hairStyle: 2, hairColor: 0xc8c4bc, beard: 0, build: 1, outfit: { top: 0x1c2848, bottom: 0x1c2848, shirt: 0xeeeeee, tie: 0x9a2020, bulk: 1, hands: 0xe8c0a0 } }),
  // Bradie: curly mop, blue Only Fighters hoodie
  bradie: base({ skin: 0xe8c0a0, hairStyle: 8, hairColor: 0xe0d4b0, beard: 1, build: 1, outfit: { top: 0x2aa0d8, bottom: 0x2a2a30, bulk: 1, hands: 0xe8c0a0 } }),
  // the Lounge producer: black tee, headset
  producer: base({ skin: 0x8a5a3a, hairStyle: 1, hairColor: 0x101010, beard: 2, build: 1, outfit: { top: 0x18181c, bottom: 0x3a3a44, mic: true, bulk: 0, shortSleeves: true, hands: 0x8a5a3a } }),
  // Jimmy Quavo: the guy in the parking lot. Tracksuit, beanie
  jimmy: base({ skin: 0xc68a5e, hairStyle: 0, beard: 2, build: 1, outfit: { top: 0x101014, bottom: 0x101014, patch: 0xf2f2f2, bulk: 1, hands: 0xc68a5e } }),
  // Mateo: twelve, in a hoodie three sizes too big
  mateo: base({ skin: 0xb07a52, hairStyle: 1, hairColor: 0x1a1412, beard: 0, build: 0, outfit: { top: 0xb8733a, bottom: 0x2a2a44, bulk: 2, hands: 0xb07a52 } }),
  // a regional promoter: slicked hair, a shirt you can hear
  promoter: base({ skin: 0xe0a882, hairStyle: 2, hairColor: 0x161412, beard: 1, build: 2, outfit: { top: 0xb8402a, bottom: 0x2a2a30, shirt: 0xf0e0a0, bulk: 2, hands: 0xe0a882 } }),
  // a reporter
  reporter: base({ skin: 0xe0b090, hairStyle: 4, hairColor: 0x6a3a1a, beard: 0, build: 0, female: true, outfit: { top: 0x6a4c72, bottom: 0x222228, mic: true, hands: 0xe0b090 } }),
};

// ------------------------------------------------------------ backgrounds

const FLOOR = 196;

function drawBg(g: Graphics, bg: Bg): void {
  g.clear();
  const sky = (a: number, b: number, h = FLOOR) => {
    for (let y = 0; y < h; y += 2) g.rect(0, y, W, 2).fill(lerp(a, b, y / h));
  };
  switch (bg) {
    case 'gym': {
      // brick wall
      g.rect(0, 0, W, FLOOR).fill(0x4a2a24);
      for (let y = 0; y < FLOOR; y += 8) for (let x = (y / 8) % 2 ? -10 : 0; x < W; x += 20) g.rect(x + 1, y + 1, 18, 6).fill(((x * 7 + y * 13) % 5) ? 0x5c3229 : 0x52302a);
      // window with rain light
      g.rect(30, 30, 90, 70).fill(0x1a2230).rect(30, 30, 90, 70).stroke({ color: 0x2a2a30, width: 4 }).rect(74, 30, 2, 70).fill(0x2a2a30).rect(30, 64, 90, 2).fill(0x2a2a30);
      // the sign
      g.rect(150, 24, 180, 26).fill(0x1a1416).rect(150, 24, 180, 26).stroke({ color: 0xc4a04a, width: 2 });
      // heavy bags
      for (const bx of [170, 240]) {
        g.rect(bx + 9, 50, 2, 26).fill(0x6a6a70);
        g.roundRect(bx, 76, 20, 60, 6).fill(0x8e2f2f).rect(bx + 3, 80, 3, 52).fill(0xa84a40);
      }
      // stove + the soup pot
      g.rect(360, 150, 90, 46).fill(0x3a3a40).rect(360, 150, 90, 4).fill(0x5a5a62);
      g.roundRect(372, 118, 64, 34, 4).fill(0x8a8a90).rect(372, 118, 64, 5).fill(0xb0b0b6).rect(366, 126, 6, 4).fill(0x6a6a70).rect(436, 126, 6, 4).fill(0x6a6a70);
      // poster
      g.rect(300, 70, 40, 54).fill(0xd8d0b8).rect(304, 76, 32, 20).fill(0x8e2f2f).rect(304, 100, 32, 3).fill(0x5a5650).rect(304, 106, 24, 3).fill(0x5a5650);
      // floor: old mats
      g.rect(0, FLOOR, W, H - FLOOR).fill(0x2a3a4a);
      for (let x = 0; x < W; x += 60) g.rect(x, FLOOR, 1, H - FLOOR).fill(0x1a2a3a);
      break;
    }
    case 'street': {
      sky(0x0a0c18, 0x1a1830);
      // buildings
      g.rect(0, 40, 140, FLOOR - 40).fill(0x18161e).rect(330, 30, 150, FLOOR - 30).fill(0x16141c);
      for (let y = 50; y < FLOOR - 20; y += 16) for (let x = 10; x < 130; x += 22) if ((x + y) % 3) g.rect(x, y, 10, 8).fill(0x3a3428);
      // the gym front
      g.rect(140, 70, 190, FLOOR - 70).fill(0x3a2220);
      g.rect(170, 110, 60, FLOOR - 110).fill(0x1a1416).rect(240, 110, 70, 50).fill(0x2a3a4a);
      g.rect(150, 78, 170, 22).fill(0x101014);
      // sidewalk + road
      g.rect(0, FLOOR, W, 10).fill(0x3a3a40).rect(0, FLOOR + 10, W, H - FLOOR - 10).fill(0x1a1a20);
      for (let x = 0; x < W; x += 40) g.rect(x, FLOOR + 30, 20, 2).fill(0x8a8460);
      // the white sports car
      g.roundRect(330, FLOOR - 4, 120, 26, 8).fill(0xeeeeee).rect(352, FLOOR - 16, 60, 14).fill(0xd8d8d8).rect(358, FLOOR - 14, 22, 10).fill(0x2a3a4a).rect(384, FLOOR - 14, 22, 10).fill(0x2a3a4a);
      g.circle(352, FLOOR + 22, 9).fill(0x101010).circle(430, FLOOR + 22, 9).fill(0x101010).circle(352, FLOOR + 22, 4).fill(0x8a8a90).circle(430, FLOOR + 22, 4).fill(0x8a8a90);
      break;
    }
    case 'office': {
      sky(0x0c1020, 0x1c2440);
      // skyline in the window
      g.rect(20, 20, 300, 150).fill(0x101830);
      for (let i = 0; i < 18; i++) {
        const bh = 40 + ((i * 37) % 90);
        g.rect(24 + i * 16, 170 - bh, 14, bh).fill(0x0a1020);
        for (let y = 175 - bh; y < 166; y += 7) if ((i + y) % 3) g.rect(27 + i * 16, y, 3, 3).fill(0x8a7a40);
      }
      g.rect(20, 20, 300, 150).stroke({ color: 0x2a2a34, width: 4 });
      // the belt in its case
      g.rect(350, 60, 100, 70).fill(0x14141a).rect(350, 60, 100, 70).stroke({ color: 0x4a4a54, width: 2 });
      g.rect(362, 90, 76, 14).fill(0x1a1a1a).roundRect(386, 82, 28, 30, 4).fill(0xc4a04a).rect(394, 90, 12, 14).fill(0xe8d080);
      // desk
      g.rect(0, FLOOR, W, H - FLOOR).fill(0x2a1e18);
      g.rect(250, FLOOR - 40, 200, 40).fill(0x4a3226).rect(250, FLOOR - 40, 200, 4).fill(0x6a4a36);
      break;
    }
    case 'presser':
    case 'stage': {
      sky(0x08080c, 0x18141c);
      // the backdrop: sponsor grid
      g.rect(30, 20, 420, 130).fill(0x101014);
      for (let y = 26; y < 146; y += 20) for (let x = 36; x < 444; x += 52) g.rect(x, y, 44, 12).fill([0x8e2f2f, 0x2a4a86, 0x2a2a30, 0xc4a04a][((x + y) / 4) % 4 | 0]);
      if (bg === 'presser') {
        g.rect(40, FLOOR - 34, 400, 34).fill(0x1a1a20).rect(40, FLOOR - 34, 400, 3).fill(0x3a3a44);
        for (const mx of [110, 240, 370]) g.rect(mx, FLOOR - 52, 3, 18).fill(0x2a2a30).circle(mx + 1, FLOOR - 54, 4).fill(0x4a4a50);
      } else {
        // the scale
        g.rect(226, FLOOR - 70, 28, 70).fill(0x3a3a44).rect(220, FLOOR - 76, 40, 10).fill(0x5a5a64).rect(214, FLOOR - 4, 52, 4).fill(0x5a5a64);
      }
      g.rect(0, FLOOR, W, H - FLOOR).fill(0x14141a);
      // crowd silhouettes
      for (let x = 0; x < W; x += 9) g.circle(x + 4, H - 18 + ((x * 7) % 5), 6).fill(0x08080a);
      break;
    }
    case 'cage': {
      sky(0x0a080c, 0x1a1418);
      for (let x = 0; x < W; x += 6) g.circle(x + 3, 120 + ((x * 13) % 9), 4).fill(0x14101a);
      g.rect(0, 130, W, 70).fill({ color: 0x000000, alpha: 0.3 });
      // fence
      for (let y = 30; y < FLOOR; y += 5) for (let x = (y / 5) % 2 ? 2 : 0; x < W; x += 5) g.rect(x, y, 1, 1).fill(0x3a3a44);
      g.rect(0, 30, W, 4).fill(0x8e2f2f);
      for (const px of [10, 240, 470]) g.rect(px - 3, 30, 6, FLOOR - 30).fill(0x101014);
      g.rect(0, FLOOR, W, H - FLOOR).fill(0xcfc8b9).rect(0, FLOOR, W, 2).fill(0x8a8274);
      g.ellipse(W / 2, FLOOR + 14, 120, 10).stroke({ color: 0xa83232, width: 2, alpha: 0.6 });
      break;
    }
    case 'lot': {
      sky(0x06070c, 0x121420);
      g.rect(0, FLOOR, W, H - FLOOR).fill(0x1c1c22);
      for (let x = 20; x < W; x += 90) g.rect(x, FLOOR + 6, 50, 2).fill(0xc8c8a0);
      // street lamp cone
      g.rect(80, 30, 4, FLOOR - 30).fill(0x2a2a30).rect(80, 30, 30, 4).fill(0x2a2a30);
      g.poly([108, 34, 60, FLOOR + 30, 170, FLOOR + 30]).fill({ color: 0xffe8a0, alpha: 0.12 });
      // a car and a dumpster
      g.roundRect(300, FLOOR - 26, 130, 30, 6).fill(0x2a2a34).rect(320, FLOOR - 40, 80, 16).fill(0x24242c);
      g.rect(20, FLOOR - 40, 50, 40).fill(0x2a4a3a).rect(18, FLOOR - 44, 54, 6).fill(0x1a3a2a);
      break;
    }
    case 'booth': {
      sky(0x120c14, 0x1c1420);
      g.rect(150, 40, 180, 70).fill(0x2a1a2a).rect(160, 50, 160, 14).fill(0xc4a04a);
      // couch
      g.roundRect(120, FLOOR - 50, 240, 50, 8).fill(0x5a2a3a).rect(120, FLOOR - 66, 240, 20).fill(0x6a3a4a);
      g.rect(0, FLOOR, W, H - FLOOR).fill(0x1a1018);
      g.circle(440, 40, 4).fill(0xff2020);
      break;
    }
    case 'landlord': {
      g.rect(0, 0, W, FLOOR).fill(0x3a2618);
      for (let x = 0; x < W; x += 30) g.rect(x, 0, 2, FLOOR).fill(0x2a1a10);
      // framed buildings
      for (const [x, y] of [[40, 40], [110, 50], [330, 36], [400, 52]] as [number, number][]) {
        g.rect(x, y, 50, 40).fill(0xc4a04a).rect(x + 4, y + 4, 42, 32).fill(0x8aa2b8);
        g.rect(x + 12, y + 14, 10, 22).fill(0x3a3a44).rect(x + 26, y + 10, 12, 26).fill(0x4a4a54);
      }
      g.rect(0, FLOOR, W, H - FLOOR).fill(0x2a1a10);
      g.rect(140, FLOOR - 36, 200, 36).fill(0x5a3a22).rect(140, FLOOR - 36, 200, 4).fill(0x7a5a3a);
      break;
    }
    case 'black':
      g.rect(0, 0, W, H).fill(0x060508);
      break;
  }
}

function lerp(a: number, b: number, t: number): number {
  const ar = (a >> 16) & 255, ag = (a >> 8) & 255, ab = a & 255;
  const br = (b >> 16) & 255, bg = (b >> 8) & 255, bb = b & 255;
  return (Math.round(ar + (br - ar) * t) << 16) | (Math.round(ag + (bg - ag) * t) << 8) | Math.round(ab + (bb - ab) * t);
}

/** Text drawn on the set itself (signs). */
function setDressing(c: Container, bg: Bg): void {
  if (bg === 'gym') c.addChild(text("RAY'S BOXING & SOUP", 150, 33, { width: 180, align: 'center', color: PAL.gold, small: true }));
  if (bg === 'street') c.addChild(text('BOXING & SOUP', 150, 85, { width: 170, align: 'center', color: 0xff6a6a, small: true }));
  if (bg === 'booth') c.addChild(text('THE LOUNGE: CONFESSIONAL', 160, 54, { width: 160, align: 'center', color: PAL.ink, small: true }));
  if (bg === 'office') c.addChild(text('CBFC', 362, 66, { width: 76, align: 'center', color: PAL.gold, small: true }));
}

// ------------------------------------------------------------ player

/** Play a cutscene. `done(choice)` when it's over (choice id, or null). */
export function playCutscene(g: Game, scene: Cutscene, done: (choice: string | null) => void): void {
  const root = new Container();
  const wrap = g.modal(root, { dim: 1 });
  const world = new Container();
  root.addChild(world);
  const bgG = new Graphics();
  const dress = new Container();
  const fx = new Graphics();
  const actorsG = new Graphics();
  world.addChild(bgG, dress, actorsG, fx);
  // letterbox
  root.addChild(new Graphics().rect(0, 0, W, 14).fill(0x000000).rect(0, H - 12, W, 12).fill(0x000000));
  const ui = new Container();
  root.addChild(ui);
  let shotIdx = -1;
  let lineIdx = -1;
  let shown = 0;
  let t = 0;
  let titleT = scene.title ? 2.2 : 0;
  let shake = 0;
  let flash = 0;
  let finished = false;
  type Live = Actor & { cx: number; look2: Look2 };
  let cast: Live[] = [];
  const lookOf = (a: Actor): Look2 => {
    if (a.look) return a.look;
    const L = lookFor(a.fighter!, a.x < W / 2 ? 0 : 1);
    return a.clothes ? { ...L, outfit: { top: a.clothes.top, bottom: a.clothes.bottom, bulk: 1, hands: L.skin } } : L;
  };
  const startShot = (i: number) => {
    shotIdx = i;
    lineIdx = -1;
    const s = scene.shots[i];
    drawBg(bgG, s.bg);
    dress.removeChildren().forEach((c) => c.destroy());
    setDressing(dress, s.bg);
    cast = s.cast.map((a) => ({ ...a, cx: a.enter === 'left' ? -40 : a.enter === 'right' ? W + 40 : a.x, look2: lookOf(a) }));
    if (s.caption) {
      const cap = text(s.caption, 0, 18, { width: W, align: 'center', color: PAL.gold, small: true });
      dress.addChild(cap);
    }
    nextLine();
  };
  const dialog = new Container();
  ui.addChild(dialog);
  const drawDialog = () => {
    dialog.removeChildren().forEach((c) => c.destroy({ children: true }));
    const s = scene.shots[shotIdx];
    const ln = s?.lines[lineIdx];
    if (!ln) return;
    const bx = 16;
    const by = H - 64;
    dialog.addChild(box(W - 32, 50, 0x0c0a0e, PAL.slate, { bevel: true })).position.set(bx, by);
    const who = ln.who ? cast.find((c) => c.id === ln.who)?.name ?? ln.who : null;
    if (who) {
      const tag = text(who.toUpperCase(), 0, 0, { small: true, color: PAL.ink });
      const tw = tag.textWidth + 10;
      dialog.addChild(new Graphics().rect(bx + 8, by - 8, tw, 10).fill(PAL.gold));
      tag.position.set(bx + 13, by - 6);
      dialog.addChild(tag);
    }
    const body = ln.text.slice(0, Math.floor(shown));
    dialog.addChild(text(body, bx + 10, by + 8, { width: W - 52, color: ln.who ? PAL.bone : PAL.fog, maxLines: 4 }));
    if (shown >= ln.text.length && Math.floor(t * 3) % 2 === 0) dialog.addChild(text('>', W - 32, by + 38, { small: true, color: PAL.gold }));
  };
  const nextLine = () => {
    const s = scene.shots[shotIdx];
    lineIdx++;
    shown = 0;
    if (lineIdx >= s.lines.length) {
      if (shotIdx + 1 < scene.shots.length) return startShot(shotIdx + 1);
      return end();
    }
    const ln = s.lines[lineIdx];
    for (const [id, p] of Object.entries(ln.poses ?? {})) {
      const a = cast.find((c) => c.id === id);
      if (a) a.pose = p;
    }
    if (ln.shake) shake = 0.4;
    if (ln.flash) flash = 0.35;
    if (ln.sfx) sfx(ln.sfx);
  };
  const choicesBox = new Container();
  ui.addChild(choicesBox);
  const end = () => {
    if (finished) return;
    finished = true;
    dialog.removeChildren().forEach((c) => c.destroy({ children: true }));
    skipBtn.visible = false;
    const ch = scene.choices ?? [];
    if (!ch.length) return close(null);
    const bh = 14 + ch.length * 17;
    choicesBox.addChild(box(W - 120, bh, 0x0c0a0e, PAL.gold, { bevel: true })).position.set(60, H - 20 - bh);
    ch.forEach((c, i) => choicesBox.addChild(button(c.label, 68, H - 20 - bh + 7 + i * 17, W - 136, 14, () => { sfx('click'); close(c.id); }, { small: true, fill: i === 0 ? PAL.moss : PAL.steel })));
  };
  const close = (choice: string | null) => {
    g.app.ticker.remove(tick);
    popKeys();
    g.closeModal(wrap);
    done(choice);
  };
  const advance = () => {
    if (titleT > 0) {
      titleT = 0;
      return;
    }
    if (finished) return;
    const ln = scene.shots[shotIdx]?.lines[lineIdx];
    if (ln && shown < ln.text.length) shown = ln.text.length;
    else nextLine();
  };
  const skipBtn = button('SKIP', W - 44, 1, 40, 11, () => {
    // skipping still lands on the choices
    shotIdx = scene.shots.length - 1;
    end();
  }, { small: true, fill: PAL.shadow });
  root.addChild(skipBtn);
  const hit = new Graphics().rect(0, 0, W, H).fill({ color: 0, alpha: 0.001 });
  hit.eventMode = 'static';
  hit.on('pointertap', advance);
  root.addChildAt(hit, 1);
  const popKeys = g.pushKeyHandler((e) => {
    if (e.type !== 'keydown') return true;
    if (e.key === 'Enter' || e.key === ' ') advance();
    return true;
  });
  const titleC = new Container();
  root.addChild(titleC);
  if (scene.title) {
    titleC.addChild(new Graphics().rect(0, 0, W, H).fill(0x060508));
    titleC.addChild(text(scene.title, 0, H / 2 - 8, { width: W, align: 'center', color: PAL.gold, scale: 2 }));
  }
  startShot(0);
  const tick = (tk: Ticker) => {
    const dt = Math.min(0.05, tk.deltaMS / 1000);
    t += dt;
    if (input.buttonPressed('A')) advance();
    if (titleT > 0) {
      titleT -= dt;
      titleC.alpha = Math.min(1, titleT / 0.4);
      return;
    }
    titleC.visible = false;
    const ln = scene.shots[shotIdx]?.lines[lineIdx];
    if (ln && !finished) {
      shown = Math.min(ln.text.length, shown + dt * 55);
    }
    // actors: walk in, bob while talking
    actorsG.clear();
    for (const a of cast) {
      a.cx += (a.x - a.cx) * Math.min(1, dt * 3);
      const walking = Math.abs(a.x - a.cx) > 2;
      const talking = ln?.who === a.id && shown < (ln?.text.length ?? 0);
      const rig = walking ? (Math.floor(t * 6) % 2 ? POSES.walk1 : POSES.walk2) : POSES[a.pose ?? 'stand'];
      const bob = talking ? Math.round(Math.sin(t * 14)) : 0;
      actorsG.ellipse(a.cx, FLOOR + 1, 16 * (a.scale ?? 1.3), 3).fill({ color: 0, alpha: 0.35 });
      drawRig(actorsG, rig, Math.round(a.cx), FLOOR + bob, walking ? (a.x > a.cx ? 1 : -1) : a.facing, a.look2, a.scale ?? 1.3);
    }
    // camera: a slow push in; shake on impacts
    const z = 1 + Math.min(0.04, t * 0.004);
    world.scale.set(z);
    world.position.set(-(W * (z - 1)) / 2 + (shake > 0 ? (Math.random() - 0.5) * 6 : 0), -(H * (z - 1)) / 2);
    shake = Math.max(0, shake - dt);
    // ambient: rain on the street and the lot, steam off the soup, camera flashes at the presser
    fx.clear();
    const bg = scene.shots[shotIdx]?.bg;
    if (bg === 'street' || bg === 'lot') for (let k = 0; k < 60; k++) fx.rect(((k * 97 + t * 220) % W), ((k * 53 + t * 320) % H), 1, 4).fill({ color: 0x8aa2b8, alpha: 0.5 });
    if (bg === 'gym') for (let k = 0; k < 4; k++) fx.circle(400 + Math.sin(t * 1.5 + k) * 6, 110 - ((t * 14 + k * 9) % 36), 3).fill({ color: 0xffffff, alpha: 0.15 });
    if ((bg === 'presser' || bg === 'stage') && Math.random() < dt * 3) fx.rect(Math.random() * W, H - 40 + Math.random() * 20, 6, 6).fill(0xffffff);
    if (flash > 0) {
      fx.rect(0, 0, W, H).fill({ color: 0xffffff, alpha: Math.min(0.6, flash) });
      flash -= dt;
    }
    drawDialog();
  };
  g.app.ticker.add(tick);
  wrap.once('destroyed', () => {
    g.app.ticker.remove(tick);
    popKeys();
  });
}
