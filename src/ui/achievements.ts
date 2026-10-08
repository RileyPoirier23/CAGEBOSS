/**
 * Achievements UI: remembers unlocks across saves, plays the congratulations screen when
 * something new is earned, and the TROPHY CASE (title menu, in-game menus).
 */
import { Container, Graphics, type Ticker } from 'pixi.js';
import type { Game } from './app';
import { PAL } from '../art/palette';
import { W, H, text, button, box } from './kit';
import { drawTrophy } from './trophyart';
import { loadJSON, storeJSON } from '../core/save';
import { ACHIEVEMENTS, earned, type Achievement } from '../sim/achievements';
import { sfx } from '../audio/sfx';
import { platformAchievement } from '../desktopsync';

const KEY = 'cageboss.achievements';
const unlocked = (): Record<string, number> => loadJSON<Record<string, number>>(KEY, {});
/** Has this achievement ever been unlocked (any save)? */
export const hasAchievement = (id: string): boolean => !!unlocked()[id];

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
  for (const a of fresh) {
    have[a.id] = Date.now();
    platformAchievement(a.id);
  }
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

/**
 * The trophy case: every achievement is an object on a shelf in a lit glass cabinet. The ones
 * you have are lit up; the ones you don't are silhouettes. Pick one to read its plaque.
 */
export function openAchievements(g: Game): void {
  const have = unlocked();
  const root = new Container();
  const wrap = g.modal(root, { dim: 1 });
  const got = ACHIEVEMENTS.filter((a) => have[a.id]).length;
  // the room: dark panelled wall, a rug
  const room = new Graphics().rect(0, 0, W, H).fill(0x22160f);
  for (let x = 0; x < W; x += 24) room.rect(x, 0, 1, H).fill(0x1a100a);
  room.rect(0, H - 12, W, 12).fill(0x3a1a1a);
  root.addChild(room);
  root.addChild(text('TROPHY CASE', 16, 8, { scale: 2, color: PAL.gold, shadow: 0x000000 }));
  root.addChild(text(`${got} / ${ACHIEVEMENTS.length} WON`, W - 160, 13, { width: 100, align: 'right', small: true, color: PAL.bone }));
  root.addChild(button('CLOSE', W - 54, 9, 44, 14, () => g.closeModal(wrap), { small: true, fill: PAL.shadow, border: PAL.gold }));
  // the cabinet
  const CX = 14, CY = 30, CW = W - 28, ROW = 44;
  const cab = new Graphics();
  cab.rect(CX - 4, CY - 4, CW + 8, ROW * 4 + 10).fill(0x5a3a20).rect(CX - 4, CY - 4, CW + 8, 3).fill(0x7a5a3a);
  cab.rect(CX, CY, CW, ROW * 4 + 2).fill(0x120c0a);
  // back light
  for (let k = 0; k < 6; k++) cab.rect(CX, CY + k * 3, CW, 3).fill({ color: 0xffe8b0, alpha: 0.05 - k * 0.008 });
  root.addChild(cab);
  const rows: { label: string; items: Achievement[]; at?: number }[][] = [
    [{ label: 'THE FIGHTER', items: ACHIEVEMENTS.filter((a) => a.mode === 'fighter').slice(0, 10) }],
    [{ label: 'THE FIGHTER (CONT.)', items: ACHIEVEMENTS.filter((a) => a.mode === 'fighter').slice(10) }],
    [{ label: 'ROAD TO CHAMPION', items: ACHIEVEMENTS.filter((a) => a.mode === 'rtc') }, { label: 'LEGACY MODE', items: ACHIEVEMENTS.filter((a) => a.mode === 'legacy'), at: 6 }],
    [{ label: 'THE PROMOTER', items: ACHIEVEMENTS.filter((a) => a.mode === 'career') }],
  ];
  const slotW = CW / 10;
  const glow = new Graphics();
  const art = new Graphics();
  const sel = new Graphics();
  root.addChild(glow, sel, art);
  const order: { a: Achievement; x: number; y: number }[] = [];
  rows.forEach((groups, ri) => {
    const shelfY = CY + (ri + 1) * ROW - 6;
    // a glass shelf with a brass edge
    cab.rect(CX, shelfY, CW, 2).fill({ color: 0xd8f0ff, alpha: 0.35 }).rect(CX, shelfY + 2, CW, 5).fill(0x3a2414);
    for (const grp of groups) {
      const start = grp.at ?? 0;
      root.addChild(text(grp.label, CX + start * slotW + 3, shelfY + 2, { small: true, color: 0xc8a060, maxLines: 1 }));
      grp.items.forEach((a, k) => {
        const x = CX + (start + k) * slotW + slotW / 2;
        order.push({ a, x, y: shelfY });
        const lit = !!have[a.id];
        if (lit) glow.ellipse(x, shelfY - 12, 18, 16).fill({ color: 0xffe0a0, alpha: 0.07 });
        drawTrophy(art, a.id, x, shelfY, !lit, 1.2);
        const hit = new Graphics().rect(x - slotW / 2, shelfY - ROW + 6, slotW, ROW - 6).fill({ color: 0, alpha: 0.001 });
        hit.eventMode = 'static';
        hit.cursor = 'pointer';
        hit.on('pointerover', () => pick(order.findIndex((o) => o.a === a)));
        hit.on('pointertap', () => pick(order.findIndex((o) => o.a === a)));
        root.addChild(hit);
      });
    }
  });
  // the plaque: the one you're looking at
  const plaque = new Container();
  plaque.position.set(CX, CY + ROW * 4 + 10);
  root.addChild(plaque);
  let cur = 0;
  const pick = (i: number) => {
    if (i < 0 || i >= order.length) return;
    if (i !== cur) sfx('click');
    cur = i;
    const { a, x, y } = order[i];
    const lit = !!have[a.id];
    sel.clear();
    sel.poly([x - 4, CY, x + 4, CY, x + slotW / 2, y, x - slotW / 2, y]).fill({ color: 0xfff2c8, alpha: 0.1 });
    sel.rect(x - slotW / 2 + 1, y - ROW + 7, slotW - 2, ROW - 7).stroke({ color: PAL.gold, width: 1, alpha: 0.7 });
    plaque.removeChildren().forEach((c) => c.destroy({ children: true }));
    plaque.addChild(box(CW, 46, 0x2a1a10, 0xc8a060, { bevel: true }));
    const big = new Graphics();
    drawTrophy(big, a.id, 26, 42, !lit, 1.35);
    plaque.addChild(big);
    plaque.addChild(text(lit ? a.name : `${a.name}  (NOT YET)`, 56, 6, { color: lit ? PAL.gold : PAL.ash }));
    plaque.addChild(text(a.desc, 56, 18, { small: true, color: PAL.bone, width: CW - 66, maxLines: 2 }));
    const when = lit ? `WON ${new Date(have[a.id]).toLocaleDateString()}` : 'LOCKED';
    plaque.addChild(text(when, 56, 35, { small: true, color: lit ? 0x8ad87a : PAL.grey }));
  };
  pick(Math.max(0, order.findIndex((o) => !have[o.a.id])));
  const popKeys = g.pushKeyHandler((e) => {
    if (e.type !== 'keydown') return false;
    if (e.key === 'ArrowRight') pick(cur + 1);
    else if (e.key === 'ArrowLeft') pick(cur - 1);
    else if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
      const { x, y } = order[cur];
      const want = y + (e.key === 'ArrowDown' ? ROW : -ROW);
      const cands = order.map((o, i) => ({ i, d: Math.abs(o.x - x) + (o.y === want ? 0 : 1e6) })).sort((p, q) => p.d - q.d);
      if (cands[0] && cands[0].d < 1e6) pick(cands[0].i);
    } else return false;
    return true;
  });
  wrap.once('destroyed', popKeys);
}
