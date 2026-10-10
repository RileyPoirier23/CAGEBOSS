/**
 * Fighter Mode training mini games (the score scales the gains and the weight burned).
 *
 *  JUMP ROPE: the rope comes round on a beat that speeds up; press when the marker
 *  crosses the line. Miss and you trip (and look stupid).
 *  TYRE & SLEDGEHAMMER: hold to raise the hammer while the power needle sweeps,
 *  release when it's in the green. Ten swings.
 *
 * Controls: A / Space / click. B / Esc skips (scores 40%).
 */
import { Container, Graphics, type Ticker } from 'pixi.js';
import type { Game } from './app';
import { PAL } from '../art/palette';
import { W, H, text, box } from './kit';
import { input } from '../core/input';
import { setPadUiMode } from './controller';
import { prompt } from './glyphs';
import { sfx } from '../audio/sfx';
import { isTouchDevice } from '../core/platform';

interface Run {
  frame: Container;
  g: Graphics;
  dyn: Container;
  finish: (score: number) => void;
}

function shell(g: Game, title: string, help: string, done: (score: number) => void, step: (r: Run, dt: number, press: boolean, held: boolean, release: boolean) => void): void {
  const frame = new Container();
  const wrap = g.modal(frame, { dim: 0.85 });
  setPadUiMode('game');
  const bw = 320;
  const bh = 190;
  const bx = (W - bw) / 2;
  const by = (H - bh) / 2;
  frame.addChild(box(bw, bh, PAL.night, PAL.gold, { bevel: true })).position.set(bx, by);
  frame.addChild(text(title, bx + 8, by + 6, { color: PAL.gold }));
  frame.addChild(text(help, bx + 8, by + 18, { small: true, width: bw - 16, color: PAL.ash }));
  frame.addChild(prompt({ pad: 'B', key: 'Esc' }, 'SKIP', bx + bw - 50, by + 6, PAL.ash));
  const gfx = new Graphics();
  gfx.position.set(bx, by);
  frame.addChild(gfx);
  const dyn = new Container();
  dyn.position.set(bx, by);
  frame.addChild(dyn);
  // mouse / touch: the whole panel is the button
  let mouseDown = false;
  let mousePress = false;
  let mouseRelease = false;
  const hit = new Graphics().rect(bx, by + 30, bw, bh - 30).fill({ color: 0, alpha: 0.001 });
  hit.eventMode = 'static';
  hit.on('pointerdown', () => { mouseDown = true; mousePress = true; });
  hit.on('pointerup', () => { if (mouseDown) mouseRelease = true; mouseDown = false; });
  hit.on('pointerupoutside', () => { if (mouseDown) mouseRelease = true; mouseDown = false; });
  frame.addChild(hit);
  const keys = new Set<string>();
  let keyPress = false;
  let keyRelease = false;
  let skip = false;
  const kd = (e: KeyboardEvent) => {
    if (e.code === 'Escape') skip = true;
    if ((e.code === 'Space' || e.code === 'Enter') && !keys.has(e.code)) { keys.add(e.code); keyPress = true; }
    e.preventDefault();
  };
  const ku = (e: KeyboardEvent) => {
    if (keys.delete(e.code)) keyRelease = true;
  };
  window.addEventListener('keydown', kd, true);
  window.addEventListener('keyup', ku, true);
  let closed = false;
  const run: Run = {
    frame, g: gfx, dyn,
    finish: (score: number) => {
      if (closed) return;
      closed = true;
      cleanup();
      g.closeModal(wrap);
      done(Math.max(0, Math.min(1, score)));
    },
  };
  let wait = 0.4; // swallow the click that opened it
  const tick = (t: Ticker) => {
    const dt = Math.min(0.05, t.deltaMS / 1000);
    if (wait > 0) {
      wait -= dt;
      mousePress = keyPress = mouseRelease = keyRelease = false;
      return;
    }
    if (skip || input.buttonPressed('B')) return run.finish(0.4);
    const press = mousePress || keyPress || input.buttonPressed('A');
    const held = mouseDown || keys.size > 0 || input.button('A');
    const release = mouseRelease || keyRelease || input.buttonReleased('A');
    mousePress = keyPress = mouseRelease = keyRelease = false;
    step(run, dt, press, held, !!release);
  };
  const cleanup = () => {
    g.app.ticker.remove(tick);
    window.removeEventListener('keydown', kd, true);
    window.removeEventListener('keyup', ku, true);
    setPadUiMode('cursor');
  };
  g.app.ticker.add(tick);
  wrap.once('destroyed', () => {
    // closed from outside (Esc / B): counts as a skip
    if (!closed) {
      closed = true;
      cleanup();
      done(0.4);
    }
  });
}

/** A little skipping fighter. */
function drawJumper(gfx: Graphics, cx: number, floor: number, jump: number, ropeAng: number, tripped: boolean): void {
  const y = floor - jump;
  const skin = 0xc98d5e;
  // rope: an ellipse round the body, front half drawn last
  const rx = 16;
  const ry = 26;
  const ropeY = y - 22;
  const pts: [number, number][] = [];
  for (let i = 0; i <= 24; i++) {
    const a = ropeAng + (i / 24) * Math.PI;
    pts.push([cx + Math.cos(a) * rx * 0.25, ropeY + Math.sin(a) * ry]);
  }
  if (!tripped) for (const [x, yy] of pts) gfx.rect(Math.round(x + Math.sin(ropeAng) * 10), Math.round(yy), 1, 1).fill(PAL.bone);
  // body
  gfx.rect(cx - 3, y - 44, 7, 7).fill(skin); // head
  gfx.rect(cx - 4, y - 36, 9, 14).fill(skin); // torso
  gfx.rect(cx - 4, y - 23, 9, 5).fill(PAL.blood); // shorts
  if (tripped) {
    gfx.rect(cx - 12, floor - 3, 26, 3).fill(skin);
  } else {
    gfx.rect(cx - 3, y - 18, 3, 16).fill(skin).rect(cx + 1, y - 18, 3, 16).fill(skin); // legs
    gfx.rect(cx - 8, y - 34, 4, 3).fill(skin).rect(cx + 5, y - 34, 4, 3).fill(skin); // hands on the handles
  }
  gfx.rect(cx - 14, floor + 1, 30, 2).fill({ color: 0x000000, alpha: 0.4 });
}

export function openJumpRope(g: Game, done: (score: number) => void): void {
  const N = 20;
  let beat = 0; // beats spawned
  let t = 0;
  let period = 0.75;
  let hits = 0;
  let judged = 0;
  let jump = 0;
  let trip = 0;
  let flash = '';
  let flashT = 0;
  const notes: { t: number; judged: boolean }[] = [];
  const lineX = 70;
  const speed = 110; // px / s
  shell(g, 'JUMP ROPE', `Press when the marker hits the line. It speeds up. ${isTouchDevice() ? '(tap)' : '(A / SPACE / click)'}`, done, (r, dt, press) => {
    t += dt;
    // spawn beats ahead of time so they scroll in from the right
    while (beat < N && notes.length < 6) {
      const at = (notes.length ? notes[notes.length - 1].t : t + 1.2) + period;
      notes.push({ t: at, judged: false });
      beat++;
      period = Math.max(0.38, period * 0.965);
    }
    if (press) {
      // nearest unjudged note
      const n = notes.find((x) => !x.judged);
      const err = n ? Math.abs(n.t - t) : 9;
      if (n && err < 0.16) {
        n.judged = true;
        judged++;
        hits += err < 0.07 ? 1 : 0.7;
        jump = 1;
        flash = err < 0.07 ? 'PERFECT' : 'GOOD';
        flashT = 0.4;
        sfx('click');
      } else if (trip <= 0) {
        flash = 'EARLY';
        flashT = 0.3;
      }
    }
    for (const n of notes) {
      if (!n.judged && t - n.t > 0.16) {
        n.judged = true;
        judged++;
        trip = 0.6;
        flash = 'TRIPPED!';
        flashT = 0.5;
        sfx('thud');
      }
    }
    while (notes.length && notes[0].judged && t - notes[0].t > 0.3) notes.shift();
    jump = Math.max(0, jump - dt * 4);
    trip = Math.max(0, trip - dt);
    flashT -= dt;
    // draw
    const gfx = r.g;
    gfx.clear();
    gfx.rect(10, 150, 300, 6).fill(0x2a2430);
    gfx.rect(lineX, 140, 2, 26).fill(PAL.gold);
    for (const n of notes) {
      if (n.judged) continue;
      const x = lineX + (n.t - t) * speed;
      if (x < 300) gfx.rect(Math.round(x) - 3, 147, 6, 12).fill(PAL.sky);
    }
    drawJumper(gfx, 200, 128, Math.sin(Math.min(1, jump) * Math.PI) * 10, t * (Math.PI * 2) / period, trip > 0);
    r.dyn.removeChildren().forEach((c) => c.destroy());
    r.dyn.addChild(text(`${judged}/${N}`, 270, 36, { small: true, color: PAL.bone }));
    if (flashT > 0) r.dyn.addChild(text(flash, 140, 60, { color: flash === 'TRIPPED!' ? PAL.blood : PAL.gold }));
    if (judged >= N) r.finish(hits / N);
  });
}

export function openTyreChop(g: Game, done: (score: number) => void): void {
  const N = 10;
  let swings = 0;
  let total = 0;
  let raise = 0; // 0..1 while held
  let needle = 0;
  let dir = 1;
  let zone = 0.65 + Math.random() * 0.2;
  let slam = 0;
  let flash = '';
  let flashT = 0;
  shell(g, 'TYRE & SLEDGEHAMMER', `Hold to raise the hammer, release when the needle is in the green. ${isTouchDevice() ? '(hold a finger down)' : '(A / SPACE / click)'}`, done, (r, dt, _press, held, release) => {
    const speed = 1.3 + swings * 0.12;
    if (held) {
      raise = Math.min(1, raise + dt * 3);
      needle += dir * dt * speed;
      if (needle > 1) { needle = 1; dir = -1; }
      if (needle < 0) { needle = 0; dir = 1; }
    }
    if (release && raise > 0.2) {
      const err = Math.abs(needle - zone);
      const sc = err < 0.05 ? 1 : err < 0.12 ? 0.7 : err < 0.22 ? 0.35 : 0.1;
      total += sc;
      swings++;
      slam = 0.35;
      flash = sc >= 1 ? 'CRUNCH!' : sc >= 0.7 ? 'SOLID' : sc >= 0.35 ? 'MEH' : 'WHIFF';
      flashT = 0.5;
      sfx(sc >= 0.7 ? 'kick' : 'thud');
      g.shake(sc >= 1 ? 2 : 1, 0.1);
      raise = 0;
      needle = 0;
      dir = 1;
      zone = 0.35 + Math.random() * 0.5;
    }
    slam = Math.max(0, slam - dt);
    flashT -= dt;
    const gfx = r.g;
    gfx.clear();
    // tyre
    gfx.ellipse(200, 150, 34, 10).fill(0x111114).ellipse(200, 150, 18, 5).fill(0x2a2a30);
    // fighter + hammer: arm angle from raise / slam
    const skin = 0xc98d5e;
    const ang = slam > 0 ? 0.2 : -1.9 * raise + 0.4; // radians from horizontal toward the tyre
    const sx = 158;
    const sy = 104;
    gfx.rect(sx - 4, sy - 22, 8, 8).fill(skin).rect(sx - 5, sy - 14, 10, 18).fill(skin).rect(sx - 5, sy + 4, 10, 6).fill(PAL.blood);
    gfx.rect(sx - 4, sy + 10, 3, 22).fill(skin).rect(sx + 1, sy + 10, 3, 22).fill(skin);
    const hx = sx + Math.cos(ang) * 42;
    const hy = sy - 6 + Math.sin(-ang) * -42;
    for (let i = 0; i < 40; i++) gfx.rect(Math.round(sx + (hx - sx) * (i / 40)), Math.round(sy - 6 + (hy - sy + 6) * (i / 40)), 2, 2).fill(0x8a6a3a);
    gfx.rect(Math.round(hx) - 5, Math.round(hy) - 4, 10, 8).fill(0x55555c);
    // power meter
    gfx.rect(20, 50, 12, 110).fill(0x221e26);
    gfx.rect(20, 50 + Math.round((1 - zone - 0.06) * 110), 12, 13).fill(PAL.moss);
    gfx.rect(16, 50 + Math.round((1 - needle) * 110) - 1, 20, 2).fill(PAL.gold);
    r.dyn.removeChildren().forEach((c) => c.destroy());
    r.dyn.addChild(text(`${swings}/${N}`, 270, 36, { small: true, color: PAL.bone }));
    if (flashT > 0) r.dyn.addChild(text(flash, 220, 80, { color: flash === 'WHIFF' ? PAL.blood : PAL.gold }));
    if (swings >= N) r.finish(total / N);
  });
}
