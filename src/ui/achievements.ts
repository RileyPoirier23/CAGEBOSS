/**
 * Achievements UI: remembers unlocks across saves, plays the congratulations screen when
 * something new is earned, and the ACHIEVEMENTS list (title menu, in-game menus).
 */
import { Container, Graphics, type Ticker } from 'pixi.js';
import type { Game } from './app';
import { PAL } from '../art/palette';
import { W, H, text, button, box, ScrollBox } from './kit';
import { openWindow } from './widgets';
import { loadJSON, storeJSON } from '../core/save';
import { ACHIEVEMENTS, earned, type Achievement } from '../sim/achievements';
import { sfx } from '../audio/sfx';

const KEY = 'cageboss.achievements';
const unlocked = (): Record<string, number> => loadJSON<Record<string, number>>(KEY, {});

function icon(kind: Achievement['icon'], big = false): Graphics {
  const g = new Graphics();
  const k = big ? 2 : 1;
  const r = (x: number, y: number, w: number, h: number, c: number) => g.rect(x * k, y * k, w * k, h * k).fill(c);
  switch (kind) {
    case 'belt': r(0, 4, 14, 6, 0x6a4a2a); r(4, 1, 6, 12, PAL.gold); r(5, 4, 4, 6, 0xfff0a0); break;
    case 'glove': r(2, 1, 9, 8, PAL.blood); r(0, 4, 3, 4, PAL.blood); r(3, 9, 7, 4, PAL.bone); break;
    case 'money': r(0, 3, 14, 8, PAL.moss); r(5, 4, 4, 6, 0xb8e0a0); break;
    case 'paper': r(2, 0, 10, 14, PAL.bone); r(4, 3, 6, 1, PAL.ash); r(4, 6, 6, 1, PAL.ash); r(4, 9, 4, 1, PAL.ash); break;
    case 'skull': r(2, 1, 10, 9, PAL.bone); r(4, 4, 2, 2, PAL.ink); r(8, 4, 2, 2, PAL.ink); r(4, 10, 6, 3, PAL.bone); break;
    case 'star': r(6, 0, 2, 14, PAL.gold); r(0, 6, 14, 2, PAL.gold); r(3, 3, 8, 8, PAL.gold); break;
    case 'soup': r(1, 6, 12, 6, PAL.ash); r(2, 5, 10, 2, PAL.ember); r(5, 1, 1, 4, PAL.fog); r(8, 0, 1, 4, PAL.fog); break;
    case 'mic': r(5, 0, 5, 6, PAL.ash); r(6, 6, 3, 8, PAL.slate); break;
  }
  return g;
}

/** Anything new? Show the congratulations, one at a time (waits for other popups). */
export function checkAchievements(g: Game): void {
  const s = g.state;
  if (!s) return;
  const have = unlocked();
  const fresh = earned(s).filter((a) => !have[a.id]);
  if (!fresh.length) return;
  for (const a of fresh) have[a.id] = Date.now();
  storeJSON(KEY, have);
  const queue = [...fresh];
  const next = () => {
    const a = queue.shift();
    if (!a) return;
    const go = () => (g.modals.length ? setTimeout(go, 500) : congrats(g, a, next));
    go();
  };
  setTimeout(next, 600);
}

/** The congratulations page. */
function congrats(g: Game, a: Achievement, done: () => void): void {
  const root = new Container();
  const wrap = g.modal(root, { dim: 0.85 });
  const bw = 260;
  const bh = 120;
  const bx = (W - bw) / 2;
  const by = (H - bh) / 2;
  const rays = new Graphics();
  root.addChild(rays);
  root.addChild(box(bw, bh, PAL.night, PAL.gold, { bevel: true })).position.set(bx, by);
  root.addChild(text('ACHIEVEMENT UNLOCKED', bx, by + 8, { width: bw, align: 'center', small: true, color: PAL.ember }));
  const ic = icon(a.icon, true);
  ic.position.set(W / 2 - 14, by + 22);
  root.addChild(ic);
  root.addChild(text(a.name, bx, by + 56, { width: bw, align: 'center', color: PAL.gold, scale: 1 }));
  root.addChild(text(a.desc, bx + 12, by + 70, { width: bw - 24, align: 'center', small: true, color: PAL.bone, maxLines: 2 }));
  const n = Object.keys(unlocked()).length;
  root.addChild(text(`${n} / ${ACHIEVEMENTS.length}`, bx, by + 88, { width: bw, align: 'center', small: true, color: PAL.ash }));
  let t = 0;
  const tick = (tk: Ticker) => {
    t += tk.deltaMS / 1000;
    rays.clear();
    for (let k = 0; k < 12; k++) {
      const ang = t * 0.4 + (k * Math.PI) / 6;
      rays.poly([W / 2, H / 2, W / 2 + Math.cos(ang) * 300, H / 2 + Math.sin(ang) * 300, W / 2 + Math.cos(ang + 0.14) * 300, H / 2 + Math.sin(ang + 0.14) * 300]).fill({ color: PAL.gold, alpha: 0.06 });
    }
  };
  g.app.ticker.add(tick);
  wrap.once('destroyed', () => g.app.ticker.remove(tick));
  root.addChild(button('NICE', bx + bw / 2 - 30, by + bh - 20, 60, 14, () => {
    g.closeModal(wrap);
    done();
  }, { small: true, fill: PAL.moss }));
  sfx('roar');
}

/** The list: everything, what you've got, when. */
export function openAchievements(g: Game): void {
  const have = unlocked();
  const win = openWindow(g, `Achievements  ${Object.keys(have).filter((k) => ACHIEVEMENTS.some((a) => a.id === k)).length}/${ACHIEVEMENTS.length}`, 340, 230);
  const sb = new ScrollBox(328, 200);
  sb.position.set(6, 4);
  win.body.addChild(sb);
  const groups: [string, Achievement['mode'][]][] = [['THE FIGHTER', ['fighter']], ['ROAD TO CHAMPION', ['rtc']], ['LEGACY MODE', ['legacy']], ['THE PROMOTER', ['career']]];
  let y = 0;
  for (const [label, modes] of groups) {
    sb.content.addChild(text(label, 0, y, { color: PAL.gold }));
    y += 12;
    for (const a of ACHIEVEMENTS.filter((x) => modes.includes(x.mode))) {
      const got = !!have[a.id];
      const ic = icon(a.icon);
      ic.alpha = got ? 1 : 0.25;
      ic.position.set(2, y + 1);
      sb.content.addChild(ic);
      sb.content.addChild(text(a.name, 22, y, { small: true, color: got ? PAL.bone : PAL.grey }));
      sb.content.addChild(text(a.desc, 22, y + 8, { small: true, color: got ? PAL.ash : PAL.grey, width: 300, maxLines: 1 }));
      y += 19;
    }
    y += 4;
  }
  sb.refresh();
}
