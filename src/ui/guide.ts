/**
 * The tutorial engine. Lessons (src/ui/guidelessons.ts) play as picture cards: every step shows
 * a screenshot of the screen it explains (src/ui/guidepics.ts + public/tutorial/, made by
 * tools/tutorial/capture.cjs) or a diagram drawn here, with animated marks over it (pulsing
 * boxes, a finger or mouse pointer tapping, arrows, the red string), next to the step's text
 * in the player's own words (keyboard, controller or touch).
 *
 *   maybeLesson(g, 'cards', { over: true })   // the first visit to a screen: shows the lesson once
 *   openLesson(g, 'desk', { mode: 'list' })   // replay from the TUTORIALS list
 *   openTutorials(g)                           // the TUTORIALS list
 *
 * A promoter or fighter career asks once (FIRST DAY ON THE JOB?) and remembers each lesson in
 * the save (s.flags.tut_<key>); Quick Fight and the title screen remember them per machine
 * (cageboss.guide). Settings → 'Offer the tutorial' off = no lessons pop up anywhere.
 */
import { Assets, Container, Graphics, Rectangle, Sprite, type FederatedPointerEvent, type Texture, type Ticker } from 'pixi.js';
import type { Game } from './app';
import { PAL } from '../art/palette';
import { W, H, SW, OX, text, box, button, Button, ScrollBox, clickable, clearChildren } from './kit';
import type { PixelText } from './text';
import { isConsole, isTouchDevice } from '../core/platform';
import { input } from '../core/input';
import { getPadUiMode, setPadUiMode } from './controller';
import { padGlyph, keyGlyph, type GlyphName } from './glyphs';
import { openWindow } from './widgets';
import { openHelp, type HelpTopic } from './help';
import { loadJSON, storeJSON } from '../core/save';
import { sfx } from '../audio/sfx';
import { npcPortrait } from './sprites';
import { POSES, drawRig, type Look2, type Rig } from './rig';
import { fightPadLayout } from './fightpad';
import {
  GROUPS, FIGHT_LESSONS, DIR_SETS, lessonByKey, stepText, tokenGlyphs, fightTouch, parsePose, isDiagram,
  type CtlMode, type Lesson, type LessonGroup, type DirName, type DiagramPadMode,
} from './guidelessons';
import { PICS, type PicInfo, type PicMark } from './guidepics';

// ------------------------------------------------------------ storage

interface GuideStore {
  seen: Record<string, number>;
}
const STORE_KEY = 'cageboss.guide';

function guideStore(): GuideStore {
  const st = loadJSON<GuideStore>(STORE_KEY, { seen: {} });
  if (!st.seen || typeof st.seen !== 'object') st.seen = {};
  return st;
}

/** Seen anywhere on this machine (finished or closed at any step). */
export function seenLesson(key: string): boolean {
  return !!guideStore().seen[key];
}

/** Has this machine ever opened a lesson? (the title screen's 'NEW? START HERE') */
export function seenAny(): boolean {
  return Object.keys(guideStore().seen).length > 0;
}

/** A lesson was shown: remember it here and in the career. */
export function markSeen(g: Game, key: string): void {
  const st = guideStore();
  st.seen[key] = Date.now();
  storeJSON(STORE_KEY, st);
  const s = g.state;
  if (s && (s.mode === 'career' || s.mode === 'fighter')) s.flags['tut_' + key] = 1;
}

// ------------------------------------------------------------ who's holding what

/** Keyboard + mouse, controller (or a console), or a touch screen: the words and pictures follow it. */
export function ctlMode(): CtlMode {
  if (isTouchDevice()) return 'touch';
  if (isConsole || input.lastDevice === 'gamepad') return 'pad';
  return 'kb';
}

// ------------------------------------------------------------ when lessons run

const globalRule = (g: Game, key: string): boolean => g.settings.tutorial !== false && !seenLesson(key);

/** Should this lesson pop up on its own now? */
export function lessonDue(g: Game, key: string): boolean {
  const L = lessonByKey(key);
  if (!L) return false;
  const s = g.state;
  const careerRule = (mode: string): boolean => !!s && s.mode === mode && s.flags.tutorial === 'on' && !s.flags['tut_' + key];
  if (L.mode === 'career') return careerRule('career');
  if (L.mode === 'fighter') return careerRule('fighter');
  if (L.mode === 'fight') return s?.mode === 'fighter' ? careerRule('fighter') : globalRule(g, key);
  return globalRule(g, key);
}

/** A career that hasn't said yes or no to lessons yet (it gets the offer first). */
function undecided(g: Game, L: Lesson): boolean {
  const s = g.state;
  if (!s || s.flags.tutorial !== undefined || s.flags['tut_' + L.key]) return false;
  return (L.mode === 'career' && s.mode === 'career') || (L.mode === 'fighter' && s.mode === 'fighter');
}

/** One card at a time: the lesson (or offer) on screen, and the ones waiting for it. */
let cardOpen: string | null = null;
const waiting: { key: string; go: () => void }[] = [];

function nextWaiting(): void {
  const w = waiting.shift();
  if (w) setTimeout(w.go, 300);
}

export interface MaybeOpts {
  /** open on top of the window that is up now (a dialog, a mini game) instead of waiting for the screen to be clear */
  over?: boolean;
  delay?: number;
  onDone?: () => void;
}

/**
 * Show a lesson if it's due. Normal lessons wait until no window is open (the owner's
 * check-in, the week report, cutscenes), however long that takes; `over` lessons open on top
 * of the window that was up when they were asked for, and give up if it closed.
 */
export function maybeLesson(g: Game, key: string, opts: MaybeOpts = {}): void {
  const L = lessonByKey(key);
  if (!L || (!lessonDue(g, key) && !undecided(g, L))) return;
  const s = g.state;
  const scene = g.scene;
  const under = opts.over ? (g.modals[g.modals.length - 1] ?? null) : null;
  const gone = (): boolean => g.state !== s || g.scene !== scene || (!!under && (under.destroyed || !g.modals.includes(under)));
  const go = (): void => {
    if (gone()) return;
    if (cardOpen) {
      if (cardOpen !== key && !waiting.some((w) => w.key === key)) waiting.push({ key, go });
      return;
    }
    if (!opts.over && g.modals.length) {
      setTimeout(go, 400);
      return;
    }
    if (undecided(g, L)) {
      offer(g, go);
      return;
    }
    if (lessonDue(g, key)) openLesson(g, key, { mode: 'auto', onDone: opts.onDone });
  };
  setTimeout(go, opts.delay ?? (opts.over ? 350 : 1200));
}

/** Before every hands-on fight: the next fighting lesson that's due (one per fight). */
export function nextFightLesson(g: Game): boolean {
  if (cardOpen) return false;
  for (const k of FIGHT_LESSONS) {
    if (lessonDue(g, k)) {
      openLesson(g, k, { mode: 'auto' });
      return true;
    }
  }
  return false;
}

/** Settings → REPLAY: every lesson again in this career. */
export function resetLessons(g: Game, keys: string[]): void {
  const s = g.state;
  if (!s) return;
  for (const k of keys) delete s.flags['tut_' + k];
  delete s.flags.tut_docs;
  s.flags.tutorial = 'on';
}

/** STOP LESSONS: off for this career, or (outside a career) off on this machine. */
function stopLessons(g: Game): void {
  const s = g.state;
  if (s && (s.mode === 'career' || s.mode === 'fighter')) s.flags.tutorial = 'off';
  else {
    g.settings.tutorial = false;
    g.applySettings();
  }
  g.toast('Lessons off. MENU > TUTORIALS has every one.', PAL.ash, { small: true });
}

// ------------------------------------------------------------ the offer (a new career's first lesson)

function offer(g: Game, then: () => void): void {
  const s = g.state!;
  if (g.settings.tutorial === false) {
    s.flags.tutorial = 'off';
    return;
  }
  cardOpen = '#offer';
  const frame = new Container();
  const wrap = g.modal(frame, { dim: 0.7 });
  const bw = 290;
  const fighter = s.mode === 'fighter';
  const body = fighter
    ? "I'm your coach (for now). First time you hit each part of the week, and your first fights, I'll show you how it works, with pictures. Skip any time: MENU > TUTORIALS has them all."
    : "I'm your assistant. The first time you reach each part of the job I'll show you how it works, with pictures. A minute each. Skip any time: MENU > TUTORIALS has every lesson.";
  const t = text(body, 0, 0, { small: true, width: bw - 54, color: PAL.bone });
  const bh = Math.max(74, t.textHeight + 54);
  const bx = Math.round((W - bw) / 2);
  const by = Math.round((H - bh) / 2);
  frame.addChild(box(bw, bh, PAL.night, PAL.gold, { bevel: true })).position.set(bx, by);
  const por = npcPortrait(fighter ? 'coach' : 'assistant', 'manager', 32);
  por.position.set(bx + 8, by + 8);
  frame.addChild(por);
  frame.addChild(text(fighter ? 'FIRST DAY IN THE GYM?' : 'FIRST DAY ON THE JOB?', bx + 46, by + 8, { color: PAL.gold }));
  t.position.set(bx + 46, by + 22);
  frame.addChild(t);
  frame.addChild(button('SHOW ME THE ROPES', bx + 46, by + bh - 24, 116, 16, () => {
    s.flags.tutorial = 'on';
    g.closeModal(wrap);
    then();
  }, { small: true, fill: PAL.moss }));
  frame.addChild(button("I'VE GOT THIS", bx + bw - 96, by + bh - 24, 88, 16, () => {
    s.flags.tutorial = 'off';
    g.closeModal(wrap);
    g.toast('No lessons. MENU > TUTORIALS has every one, any time.', PAL.ash, { small: true });
  }, { small: true, fill: PAL.shadow }));
  wrap.once('destroyed', () => {
    if (cardOpen === '#offer') cardOpen = null;
    nextWaiting();
  });
}

// ------------------------------------------------------------ pictures

const texCache = new Map<string, Texture | null>();
const texWait = new Map<string, Promise<void>>();

function loadPic(file: string): Promise<void> {
  if (texCache.has(file)) return Promise.resolve();
  let p = texWait.get(file);
  if (!p) {
    p = Assets.load(`${import.meta.env.BASE_URL}tutorial/${file}`)
      .then((tex: Texture) => {
        texCache.set(file, tex);
      })
      .catch(() => {
        texCache.set(file, null);
      });
    texWait.set(file, p);
  }
  return p;
}

/** The screenshot for this device (phones fall back to the PC one and the other way round). */
export function picInfo(name: string, phone: boolean): PicInfo | null {
  const e = PICS[name];
  if (!e) return null;
  return (phone ? (e.phone ?? e.pc) : (e.pc ?? e.phone)) ?? null;
}

/** Start loading every screenshot a lesson uses. */
function preload(L: Lesson, phone: boolean): Promise<void> {
  const jobs: Promise<void>[] = [];
  for (const st of L.steps) {
    const info = st.pic && !isDiagram(st.pic) ? picInfo(st.pic, phone) : null;
    if (info) jobs.push(loadPic(info.file));
  }
  return Promise.all(jobs).then(() => undefined);
}

// ------------------------------------------------------------ marks over the pictures

/** 'X' ink, 'W' white: the mouse pointer (tip at 0,0). */
const ARROW_BMP = [
  'X..........',
  'XX.........',
  'XWX........',
  'XWWX.......',
  'XWWWX......',
  'XWWWWX.....',
  'XWWWWWX....',
  'XWWWWWWX...',
  'XWWWWWWWX..',
  'XWWWWXXXXX.',
  'XWXWWX.....',
  'XX.XWWX....',
  'X...XWWX...',
  '....XWWX...',
  '.....XX....',
];
/** A gloved fingertip (tip at 4,0). */
const FINGER_BMP = [
  '...XXX....',
  '..XWWWX...',
  '..XWWWX...',
  '..XWWWX...',
  '..XWWWXXX.',
  '..XWWWXWWX',
  'XXXWWWXWWX',
  'XWXWWWWWWX',
  'XWWWWWWWWX',
  'XWWWWWWWWX',
  '.XWWWWWWX.',
  '.XWWWWWWX.',
  '..XWWWWX..',
  '..XXXXXX..',
];

function bitmap(rows: string[], white: number): Graphics {
  const g = new Graphics();
  rows.forEach((r, y) => {
    for (let x = 0; x < r.length; x++) {
      if (r[x] === 'X') g.rect(x, y, 1, 1).fill(PAL.ink);
      else if (r[x] === 'W') g.rect(x, y, 1, 1).fill(white);
    }
  });
  return g;
}

/** The pointer for this device: a fingertip, a mouse arrow, or the pad's A button in a bubble. */
function pointerNode(ctl: CtlMode): Container {
  const c = new Container();
  if (ctl === 'touch') {
    const f = bitmap(FINGER_BMP, PAL.bone);
    f.x = -4;
    c.addChild(f);
  } else if (ctl === 'kb') c.addChild(bitmap(ARROW_BMP, 0xffffff));
  else {
    const b = new Graphics().roundRect(-7, -17, 15, 13, 3).fill(PAL.ink).stroke({ color: PAL.gold, width: 1 });
    b.poly([-2, -4, 3, -4, 0, -1]).fill(PAL.ink);
    c.addChild(b);
    const a = padGlyph('A');
    a.position.set(-4, -15);
    c.addChild(a);
  }
  return c;
}

/** A 1 px frame drawn as four filled edges (crisp at any position). */
function edges(g: Graphics, x: number, y: number, w: number, h: number, color: number, alpha: number): void {
  g.rect(x, y, w, 1).fill({ color, alpha });
  g.rect(x, y + h - 1, w, 1).fill({ color, alpha });
  g.rect(x, y + 1, 1, h - 2).fill({ color, alpha });
  g.rect(x + w - 1, y + 1, 1, h - 2).fill({ color, alpha });
}

/** A gold arrow pointing at (x,y), its tail toward `dir` ('l' = it comes from the right, pointing left). */
function arrowAt(g: Graphics, x: number, y: number, dir: string, bob: number): void {
  // unit vector the arrow points along, and its perpendicular
  const ux = dir === 'l' ? -1 : dir === 'r' ? 1 : 0;
  const uy = dir === 'u' ? -1 : dir === 'd' ? 1 : 0;
  const px = -uy;
  const py = ux;
  const tx = x - ux * (2 + bob);
  const ty = y - uy * (2 + bob);
  for (let pass = 0; pass < 2; pass++) {
    const col = pass === 0 ? PAL.ink : PAL.gold;
    const o = pass === 0 ? 1 : 0;
    g.poly([
      tx + o, ty + o,
      tx - ux * 5 + px * 5 + o, ty - uy * 5 + py * 5 + o,
      tx - ux * 5 - px * 5 + o, ty - uy * 5 - py * 5 + o,
    ]).fill(col);
    g.moveTo(tx - ux * 5 + o, ty - uy * 5 + o).lineTo(tx - ux * 12 + o, ty - uy * 12 + o).stroke({ color: col, width: 3 });
  }
}

interface MarkView {
  node: Container;
  update: (t: number) => void;
}

/**
 * The marks of one picture, drawn over it at scale k (picture pixels -> screen). They play in
 * order: slot 1, then 1+2, then 1+2+3, then start over.
 */
function markView(marks: PicMark[], k: number, ctl: CtlMode, pw: number, ph: number): MarkView {
  const node = new Container();
  const fx = new Graphics();
  node.addChild(fx);
  let maxSlot = 1;
  for (const m of marks) maxSlot = Math.max(maxSlot, m.n ?? 1);
  const T = 1.2 + 0.9 * maxSlot;
  const P = (v: number): number => Math.round(v * k);
  const top = new Container();
  // per mark: its pointer, label tag, number badge, legend rows (made once, moved / shown each frame)
  const parts = marks.map((m) => {
    const out: { ptr: Container | null; tag: Container | null; badge: Container | null; rows: Container[]; panel: Container | null } = { ptr: null, tag: null, badge: null, rows: [], panel: null };
    const X = P(m.x);
    const Y = P(m.y);
    if (m.k === 'tap' || m.k === 'hold' || m.k === 'swipe') {
      out.ptr = pointerNode(m.k === 'swipe' && ctl === 'pad' ? 'kb' : ctl);
      top.addChild(out.ptr);
    }
    const label = m.k === 'hold' ? (m.label ?? 'HOLD') : m.label;
    if (label) {
      const t = text(label, 2, 1, { small: true, color: PAL.gold });
      const tag = new Container();
      tag.addChild(box(t.textWidth + 4, 7, PAL.ink));
      tag.addChild(t);
      const wTag = t.textWidth + 4;
      let tx = X;
      let ty = Y - 9;
      if (m.k === 'box') {
        ty = Y - 9 >= 0 ? Y - 9 : Y + P(m.h ?? 0) + 2;
      } else if (m.k === 'tap' || m.k === 'hold' || m.k === 'swipe') {
        tx = X - Math.round(wTag / 2);
        ty = Y - 20 >= 0 ? Y - 20 : Y + 16;
      }
      tag.position.set(Math.max(0, Math.min(Math.round(pw * k) - wTag, tx)), Math.max(0, Math.min(Math.round(ph * k) - 7, ty)));
      top.addChild(tag);
      out.tag = tag;
    }
    if (maxSlot > 1 && m.k !== 'line') {
      const b = new Container();
      b.addChild(new Graphics().circle(3.5, 3.5, 3.5).fill(PAL.gold).stroke({ color: PAL.ink, width: 1 }));
      const d = text(String(m.n ?? 1), 2, 1, { small: true, color: PAL.ink });
      d.x = Math.round(3.5 - d.textWidth / 2);
      b.addChild(d);
      const bx = m.k === 'box' || m.k === 'legend' ? X - 4 : X - 11;
      const by = m.k === 'box' || m.k === 'legend' ? Y - 4 : Y - 11;
      b.position.set(Math.max(0, bx), Math.max(0, by));
      top.addChild(b);
      out.badge = b;
    }
    if (m.k === 'legend' && m.items && ctl !== 'touch') {
      const panel = new Container();
      const bg = new Graphics();
      panel.addChild(bg);
      let wMax = 0;
      m.items.forEach(([tok, lab], i) => {
        const row = new Container();
        let x = 0;
        for (const gname of tokenGlyphs(tok, ctl)) {
          const gl = ctl === 'pad' ? padGlyph(gname as GlyphName) : keyGlyph(gname);
          gl.x = x;
          row.addChild(gl);
          x += Math.ceil(gl.width) + 2;
        }
        const lt = text(lab, x + 2, 2, { small: true, color: PAL.bone });
        row.addChild(lt);
        row.position.set(5, 5 + i * 13);
        wMax = Math.max(wMax, x + 2 + lt.textWidth);
        panel.addChild(row);
        out.rows.push(row);
      });
      const hh = 5 + m.items.length * 13 + 2;
      bg.rect(0, 0, wMax + 10, hh).fill({ color: PAL.ink, alpha: 0.85 });
      edges(bg, 0, 0, wMax + 10, hh, PAL.gold, 1);
      panel.position.set(X, Y);
      top.addChild(panel);
      out.panel = panel;
    }
    return out;
  });
  node.addChild(top);
  const update = (t: number): void => {
    const ct = t % T;
    fx.clear();
    marks.forEach((m, idx) => {
      const n = m.n ?? 1;
      const lt = ct - (n - 1) * 0.9;
      const on = lt >= 0;
      const p = parts[idx];
      if (p.tag) p.tag.visible = on;
      if (p.badge) p.badge.visible = on;
      if (p.ptr) p.ptr.visible = on;
      if (p.panel) p.panel.visible = on;
      if (!on) return;
      const X = P(m.x);
      const Y = P(m.y);
      const pulse = 0.45 + 0.55 * (0.5 + 0.5 * Math.sin(lt * Math.PI * 2));
      if (m.k === 'box') {
        const w = Math.max(2, P(m.w ?? 4));
        const h = Math.max(2, P(m.h ?? 4));
        edges(fx, X - 1, Y - 1, w + 2, h + 2, PAL.ink, pulse);
        edges(fx, X, Y, w, h, PAL.gold, pulse);
        edges(fx, X + 1, Y + 1, w - 2, h - 2, PAL.ink, pulse * 0.6);
      } else if (m.k === 'tap' || m.k === 'hold') {
        const ptr = p.ptr!;
        const inT = Math.min(1, lt / 0.3);
        const down = lt >= 0.3 && (m.k === 'hold' || lt < 0.55);
        if (ctl === 'pad') {
          ptr.position.set(X, Y + Math.round((1 - inT) * 4));
          ptr.scale.set(lt < 0.3 ? 0.6 + 0.4 * inT : 1);
          ptr.alpha = inT;
          fx.circle(X, Y, 2).fill(PAL.gold);
        } else {
          ptr.position.set(X + Math.round((1 - inT) * 14) + (down ? 1 : 0), Y + Math.round((1 - inT) * 14) + (down ? 1 : 0));
          ptr.alpha = 1;
        }
        if (lt >= 0.3 && lt < 0.65) {
          const r = 0.3 + ((lt - 0.3) / 0.35);
          fx.circle(X, Y, 2 + 7 * Math.min(1, r - 0.3)).stroke({ color: PAL.gold, width: 1, alpha: Math.max(0, 1 - (lt - 0.3) / 0.35) });
        }
        if (m.k === 'hold' && lt >= 0.3) {
          const f = Math.min(1, (lt - 0.3) / 1);
          fx.circle(X, Y, 8).stroke({ color: PAL.ink, width: 3, alpha: 0.6 });
          // (a new path at the arc's start: arc() alone would draw a line from the last point)
          if (f > 0.01) fx.moveTo(X, Y - 8).arc(X, Y, 8, -Math.PI / 2, -Math.PI / 2 + Math.PI * 2 * f).stroke({ color: PAL.gold, width: 2 });
        }
      } else if (m.k === 'arrow') {
        arrowAt(fx, X, Y, m.dir ?? 'l', Math.round(Math.sin(lt * Math.PI * 6) + 1));
      } else if (m.k === 'line') {
        const f = Math.min(1, lt / 0.4);
        const X2 = P(m.x2 ?? m.x);
        const Y2 = P(m.y2 ?? m.y);
        fx.moveTo(X, Y).lineTo(X + (X2 - X) * f, Y + (Y2 - Y) * f).stroke({ color: 0xd8423a, width: 2 });
        fx.circle(X, Y, 2).fill(0xd8423a);
        if (f >= 1) fx.circle(X2, Y2, 2).fill(0xd8423a);
      } else if (m.k === 'swipe') {
        const X2 = P(m.x2 ?? m.x);
        const Y2 = P(m.y2 ?? m.y);
        const f = Math.max(0, Math.min(1, (lt - 0.15) / 0.6));
        const cx = X + (X2 - X) * f;
        const cy = Y + (Y2 - Y) * f;
        for (let j = 1; j <= 4; j++) {
          const fj = Math.max(0, f - j * 0.08);
          fx.circle(X + (X2 - X) * fj, Y + (Y2 - Y) * fj, 2).fill({ color: PAL.gold, alpha: 0.5 - j * 0.1 });
        }
        fx.circle(X, Y, 3).stroke({ color: PAL.gold, width: 1, alpha: 0.6 });
        p.ptr!.position.set(Math.round(cx), Math.round(cy));
      } else if (m.k === 'legend') {
        p.rows.forEach((r, j) => (r.visible = lt >= j * 0.4));
      }
    });
  };
  update(0);
  return { node, update };
}

// ------------------------------------------------------------ diagrams (drawn, not screenshots)

const RED: Look2 = { skin: 0xc68a5e, hairStyle: 1, hairColor: 0x2a1a10, beard: 0, build: 1, trunks: 0x8e1e1e, trim: 0xe8e8e8, glove: 0x8e1e1e, stance: 'bouncy', female: false, tattoo: 0 };
const BLUE: Look2 = { skin: 0x8a5a3a, hairStyle: 0, hairColor: 0x101010, beard: 1, build: 1, trunks: 0x1e3a7a, trim: 0xf2c12e, glove: 0x1e3a7a, stance: 'bouncy', female: false, tattoo: 0 };

interface Diagram {
  node: Container;
  w: number;
  h: number;
  update: (t: number) => void;
}

const DIRV: Record<DirName, [number, number]> = {
  centre: [0, 0], up: [0, -1], toward: [1, 0], down: [0, 1], downToward: [0.71, 0.71], away: [-1, 0],
};

function pixelDisk(g: Graphics, cx: number, cy: number, r: number, color: number): void {
  for (let y = -r; y <= r; y++) {
    const w = Math.round(Math.sqrt(r * r - y * y));
    g.rect(cx - w, cy + y, w * 2, 1).fill(color);
  }
}

/** The badge in a diagram's corner: the button(s) that do it, on whatever the player is holding. */
function badgeNode(tokens: string[], ctl: CtlMode, padMode: DiagramPadMode, extraTouch: string[]): Container {
  const c = new Container();
  let x = 0;
  if (ctl === 'touch') {
    const layout = fightPadLayout(SW);
    const ids = tokens.map((t) => fightTouch(t)).concat(extraTouch);
    for (const id of ids) {
      const b = layout.buttons.find((bb) => bb.id === id);
      if (!b) continue;
      const lab = b.labels[padMode] ?? b.labels.stand ?? id;
      const t = text(lab, 0, 0, { small: true, color: PAL.bone });
      const r = Math.max(8, Math.ceil(t.textWidth / 2) + 3);
      const g = new Graphics();
      pixelDisk(g, x + r, r, r, b.color);
      c.addChild(g);
      t.position.set(x + r - Math.round(t.textWidth / 2), r - 2);
      c.addChild(t);
      x += r * 2 + 3;
    }
  } else {
    for (const tok of tokens) {
      for (const gname of tokenGlyphs(tok, ctl)) {
        const gl = ctl === 'pad' ? padGlyph(gname as GlyphName) : keyGlyph(gname);
        gl.scale.set(2);
        gl.position.set(x, 0);
        c.addChild(gl);
        x += Math.ceil(gl.width) + 3;
      }
    }
  }
  return c;
}

function dirsDiagram(name: string, ctl: CtlMode): Diagram | null {
  const set = DIR_SETS[name];
  if (!set) return null;
  const DW = 300;
  const DH = 180;
  const c = new Container();
  c.addChild(box(DW, DH, 0x15121a, PAL.slate));
  const cx = 150;
  const cy = 88;
  const g = new Graphics();
  c.addChild(g);
  // the stick (or the keys) in the middle
  if (ctl === 'touch') {
    pixelDisk(g, cx, cy, 14, PAL.slate);
    pixelDisk(g, cx, cy, 12, 0x2a2630);
    pixelDisk(g, cx, cy, 6, PAL.bone);
  } else if (ctl === 'pad') {
    const st = padGlyph(set.rstick ? 'RStick' : 'LStick');
    st.scale.set(2);
    st.position.set(cx - 9, cy - 9);
    c.addChild(st);
  } else {
    const keys: [string, number, number][] = set.rstick
      ? [['↑', 0, -1], ['←', -1, 0], ['↓', 0, 1], ['→', 1, 0]]
      : [['W', 0, -1], ['A', -1, 0], ['S', 0, 1], ['D', 1, 0]];
    for (const [lab, dx, dy] of keys) {
      const kg = keyGlyph(lab);
      kg.position.set(cx - 4 + dx * 11, cy - 4 + dy * 10);
      c.addChild(kg);
    }
  }
  const labels: PixelText[] = [];
  for (const [dir, lab] of set.dirs) {
    let t: PixelText;
    if (dir === 'centre') {
      const what = ctl === 'kb' ? 'NO DIRECTION' : 'STICK CENTRED';
      t = text(`${what}: ${lab}`, 10, DH - 14, { small: true, width: DW - 20, align: 'center', color: PAL.bone, maxLines: 1 });
    } else {
      const [vx, vy] = DIRV[dir];
      const x0 = cx + vx * 19;
      const y0 = cy + vy * 19;
      const x1 = cx + vx * 40;
      const y1 = cy + vy * 40;
      g.moveTo(x0, y0).lineTo(x1, y1).stroke({ color: PAL.gold, width: 2 });
      // the head
      const px = -vy;
      const py = vx;
      g.poly([x1 + vx * 4, y1 + vy * 4, x1 - vx * 2 + px * 4, y1 - vy * 2 + py * 4, x1 - vx * 2 - px * 4, y1 - vy * 2 - py * 4]).fill(PAL.gold);
      if (dir === 'up') {
        t = text(lab, cx - 70, 0, { small: true, width: 140, align: 'center', color: PAL.bone, maxLines: 2 });
        t.y = Math.round(y1 - 7 - t.textHeight);
      } else if (dir === 'down') {
        t = text(lab, cx - 70, Math.round(y1 + 8), { small: true, width: 140, align: 'center', color: PAL.bone, maxLines: 2 });
      } else if (dir === 'toward') {
        t = text(lab, Math.round(x1 + 8), 0, { small: true, width: DW - Math.round(x1 + 8) - 6, color: PAL.bone, maxLines: 3 });
        t.y = Math.round(cy - t.textHeight / 2);
      } else if (dir === 'away') {
        const w = Math.round(x1 - 8) - 6;
        t = text(lab, 6, 0, { small: true, width: w, align: 'right', color: PAL.bone, maxLines: 3 });
        t.y = Math.round(cy - t.textHeight / 2);
      } else {
        t = text(lab, Math.round(x1 + 6), Math.round(y1 - 2), { small: true, width: 104, color: PAL.bone, maxLines: 2 });
      }
    }
    c.addChild(t);
    labels.push(t);
  }
  const touchExtra = set.rstick ? ['EVADE'] : [];
  const badge = badgeNode(set.badge, ctl, set.pad, touchExtra);
  badge.position.set(6, 6);
  c.addChild(badge);
  if (set.badge.length || (ctl === 'touch' && touchExtra.length)) {
    const plus = text('+ DIRECTION', Math.ceil(badge.width) + 10, ctl === 'touch' ? 10 : 6, { small: true, color: PAL.ash });
    c.addChild(plus);
  }
  c.addChild(text('TOWARD = AT HIM', DW - 74, 6, { small: true, color: PAL.ash, width: 68, align: 'right' }));
  let lit = -1;
  const update = (t: number): void => {
    const i = Math.floor(t / 0.8) % labels.length;
    if (i === lit) return;
    if (lit >= 0) labels[lit].setColor(PAL.bone);
    labels[i].setColor(PAL.gold);
    lit = i;
  };
  update(0);
  return { node: c, w: DW, h: DH, update };
}

function poseDiagram(pic: string, ctl: CtlMode): Diagram | null {
  const p = parsePose(pic);
  if (!p) return null;
  const poses = POSES as unknown as Record<string, Rig | undefined>;
  const red = poses[p.red];
  const blue = poses[p.blue];
  if (!red || !blue) return null;
  const DW = 300;
  const DH = 124;
  const c = new Container();
  c.addChild(box(DW, DH, 0x15121a, PAL.slate));
  const g = new Graphics();
  g.rect(1, 104, DW - 2, DH - 105).fill(0x3a3a42).rect(1, 104, DW - 2, 1).fill(0x5a5a62);
  for (let x = 8; x < DW - 2; x += 10) g.rect(x, 2, 1, 102).fill({ color: 0x2a2a32, alpha: 0.8 });
  if (p.ground) {
    drawRig(g, blue, 150, 112, 1, { ...BLUE, faceUp: true }, 1.25);
    drawRig(g, red, 150, 112, 1, RED, 1.25);
  } else {
    drawRig(g, red, 126, 112, 1, RED, 1.25);
    drawRig(g, blue, 174, 112, -1, BLUE, 1.25);
  }
  c.addChild(g);
  if (p.badge) {
    const b = badgeNode([p.badge], ctl, p.pad, []);
    b.position.set(6, 6);
    c.addChild(b);
    // what the button is called here (KICK is KNEE in the clinch, REAR an elbow or a punch on the mat...)
    if (ctl !== 'touch') {
      const pb = fightPadLayout(SW).buttons.find((bb) => bb.id === fightTouch(p.badge));
      const name = pb ? (pb.labels[p.pad] ?? pb.labels.stand ?? '') : '';
      if (name) c.addChild(text('= ' + name, Math.ceil(b.width) + 10, 10, { small: true, color: PAL.ash }));
    }
  }
  c.addChild(text('YOU', 6, DH - 12, { small: true, color: 0xd86a5a }));
  return { node: c, w: DW, h: DH, update: () => {} };
}

function diagram(pic: string, ctl: CtlMode): Diagram | null {
  if (pic.startsWith('dirs:')) return dirsDiagram(pic.slice(5), ctl);
  return poseDiagram(pic, ctl);
}

// ------------------------------------------------------------ the lesson card

export interface LessonOpts {
  /** auto = popped up on its own (STOP LESSONS, GOT IT, then 'your turn'); list = opened from TUTORIALS */
  mode?: 'auto' | 'list';
  onDone?: () => void;
}

/** Fit text into a box: the first face that fits, else the last one cut to the lines that fit. */
function fitText(str: string, x: number, y: number, w: number, h: number, faces: boolean[], color: number): PixelText {
  for (const small of faces) {
    const t = text(str, x, y, { small, width: w, color });
    if (t.textHeight <= h) return t;
    t.destroy({ children: true });
  }
  const small = faces[faces.length - 1];
  const lh = small ? 7 : 10;
  return text(str, x, y, { small, width: w, color, maxLines: Math.max(1, Math.floor((h + 3) / lh)) });
}

/** A picture (screenshot or diagram) fitted into a frame: whole-pixel scale when it fits, else shrunk smooth. */
interface Shown {
  node: Container;
  /** the picture's top-left inside the frame, and its scale */
  ox: number;
  oy: number;
  k: number;
  update: (t: number) => void;
}

function showPicture(pic: string, ctl: CtlMode, phone: boolean, fw: number, fh: number, allowUp: boolean): Shown | 'loading' | null {
  if (isDiagram(pic)) {
    const d = diagram(pic, ctl);
    if (!d) return null;
    const k = Math.min(1, (fw - 4) / d.w, (fh - 4) / d.h);
    d.node.scale.set(k);
    const ox = Math.round((fw - d.w * k) / 2);
    const oy = Math.round((fh - d.h * k) / 2);
    d.node.position.set(ox, oy);
    return { node: d.node, ox, oy, k, update: d.update };
  }
  const info = picInfo(pic, phone);
  if (!info) return null;
  if (!texCache.has(info.file)) return 'loading';
  const tex = texCache.get(info.file);
  if (!tex) return null;
  // whole pixels when it fits (2x, 3x for small crops), else shrunk smooth to fit
  const fit = Math.min(fw / info.w, fh / info.h);
  const k = fit >= 1 ? (allowUp ? Math.floor(fit) : 1) : fit;
  tex.source.scaleMode = k === Math.floor(k) ? 'nearest' : 'linear';
  const c = new Container();
  const sp = new Sprite(tex);
  sp.width = Math.round(info.w * k);
  sp.height = Math.round(info.h * k);
  c.addChild(sp);
  const mv = markView(info.marks, k, ctl, info.w, info.h);
  c.addChild(mv.node);
  const ox = Math.round((fw - info.w * k) / 2);
  const oy = Math.round((fh - info.h * k) / 2);
  c.position.set(ox, oy);
  return { node: c, ox, oy, k, update: mv.update };
}

/** Open a lesson card now. */
export function openLesson(g: Game, key: string, opts: LessonOpts = {}): void {
  const L = lessonByKey(key);
  if (!L) return;
  const mode = opts.mode ?? 'auto';
  const touch = isTouchDevice();
  const ctl = ctlMode();
  cardOpen = key;
  const root = new Container();
  root.x = touch ? -OX : 0;
  const wrap = g.modal(root, { dim: 0.78, fit: false });
  const padUi = getPadUiMode();
  setPadUiMode('cursor');
  const N = L.steps.length;
  let i = 0;
  let t = 0;
  let upd: ((t: number) => void) | null = null;
  let byPlayer = false;
  let zoomWrap: Container | null = null;
  let zoomUpd: ((t: number) => void) | null = null;

  // geometry: PC / console the 480 design; phones the whole (wider) screen
  const CW = touch ? SW - 8 : 472;
  const RX = touch ? SW - 14 : 470; // right edge of the text
  const barY = touch ? 236 : 244;
  const barH = touch ? 26 : 16;
  const textBottom = barY - 4;
  const sideFW = touch ? Math.max(280, Math.min(340, SW - 8 - 24 - 170)) : 340;
  const wideFW = touch ? SW - 12 : 468;

  const finish = (how: 'done' | 'esc' | 'skip' | 'stop' | 'list'): void => {
    if (byPlayer) return;
    byPlayer = true;
    if (how === 'stop') stopLessons(g);
    g.closeModal(wrap);
    opts.onDone?.();
    if (how === 'done' && mode === 'auto' && L.tryIt) {
      const tryIt = L.tryIt;
      setTimeout(() => nudge(g, tryIt), 250);
    }
  };
  const next = (): void => {
    if (i < N - 1) {
      i++;
      sfx('paper');
      render();
    } else finish('done');
  };
  const back = (): void => {
    if (i <= 0) return;
    i--;
    sfx('paper');
    render();
  };

  const zoom = (pic: string): void => {
    if (zoomWrap) return;
    const zr = new Container();
    zr.x = -OX;
    zoomWrap = g.modal(zr, { dim: 0.92, fit: false });
    const shown = showPicture(pic, ctl, touch, SW - 4, H - 4, true);
    if (!shown || shown === 'loading') {
      g.closeModal(zoomWrap);
      zoomWrap = null;
      return;
    }
    // a screenshot that only fits 1:1 still grows to fill the screen (smooth), so the zoom is a zoom
    if (shown.k === 1 && !isDiagram(pic)) {
      const info = picInfo(pic, touch)!;
      const k = Math.min((SW - 8) / info.w, (H - 8) / info.h);
      if (k > 1.15) {
        shown.node.destroy({ children: true });
        const big = new Container();
        const tex = texCache.get(info.file)!;
        tex.source.scaleMode = 'linear';
        const sp = new Sprite(tex);
        sp.width = Math.round(info.w * k);
        sp.height = Math.round(info.h * k);
        big.addChild(sp);
        const mv = markView(info.marks, k, ctl, info.w, info.h);
        big.addChild(mv.node);
        big.position.set(Math.round((SW - info.w * k) / 2), Math.round((H - info.h * k) / 2));
        zr.addChild(big);
        zoomUpd = mv.update;
        finishZoom(zr);
        return;
      }
    }
    shown.node.position.set(shown.node.x + 2, shown.node.y + 2);
    zr.addChild(shown.node);
    zoomUpd = shown.update;
    finishZoom(zr);
  };
  const finishZoom = (zr: Container): void => {
    zr.addChild(text(touch ? 'TAP TO CLOSE' : 'CLICK TO CLOSE', SW - 70, H - 10, { small: true, color: PAL.ash, width: 64, align: 'right' }));
    const hit = new Graphics().rect(0, 0, SW, H).fill({ color: 0, alpha: 0.001 });
    hit.eventMode = 'static';
    hit.on('pointertap', () => closeZoom(true));
    zr.addChild(hit);
  };
  const closeZoom = (redraw = false): void => {
    if (!zoomWrap) return;
    const z = zoomWrap;
    zoomWrap = null;
    zoomUpd = null;
    g.closeModal(z);
    // the zoom may have switched the shared texture to smooth scaling: draw the step again
    if (redraw && !wrap.destroyed) render(true);
  };

  const render = (keepTime = false): void => {
    clearChildren(root);
    upd = null;
    if (!keepTime) t = 0; // the marks start over with every step
    const st = L.steps[i];
    const body = stepText(st, ctl);
    const card = box(CW, 262, PAL.night, PAL.gold, { bevel: true });
    card.position.set(4, 4);
    root.addChild(card);
    root.addChild(text(L.title, 10, 8, { color: PAL.gold, width: RX - 10 - 50, maxLines: 1 }));
    root.addChild(text(touch ? `${i + 1}/${N}` : `STEP ${i + 1}/${N}`, RX - 50, 9, { small: true, color: PAL.ash, width: 50, align: 'right' }));

    // the picture decides the layout: beside the text, above it, or none
    const pic = st.pic ?? '';
    let kind: 'side' | 'wide' | 'none' = 'none';
    let shown: Shown | 'loading' | null = null;
    let fx = 0;
    let fy = 0;
    let fw = 0;
    let fh = 0;
    if (pic) {
      const info = isDiagram(pic) ? null : picInfo(pic, touch);
      const failed = info ? texCache.has(info.file) && !texCache.get(info.file) : false;
      if (isDiagram(pic) || (info && !failed)) {
        // beside the text or above it: whichever shows the picture bigger (beside on a tie)
        const sideK = info ? Math.min(sideFW / info.w, 204 / info.h, 1) : 1;
        const wideK = info ? Math.min(wideFW / info.w, 152 / info.h, 1) : 0;
        kind = wideK > sideK ? 'wide' : 'side';
        if (kind === 'side') {
          fx = 10;
          fy = 22;
          fw = sideFW;
          fh = 204;
        } else {
          fx = 6;
          fy = 20;
          fw = wideFW;
          fh = 152;
        }
        shown = showPicture(pic, ctl, touch, fw, fh, true);
        if (!shown) kind = 'none';
      }
    }
    if (kind !== 'none') {
      const fr = new Container();
      fr.position.set(fx, fy);
      fr.addChild(box(fw, fh, 0x0c0a10, PAL.slate));
      if (shown === 'loading') {
        fr.addChild(text('LOADING...', 0, Math.round(fh / 2 - 3), { small: true, color: PAL.ash, width: fw, align: 'center' }));
        const info = picInfo(pic, touch)!;
        const at = i;
        void loadPic(info.file).then(() => {
          if (!wrap.destroyed && at === i) render();
        });
      } else if (shown) {
        fr.addChild(shown.node);
        upd = shown.update;
        if (touch && !isDiagram(pic)) fr.addChild(text('TAP TO ZOOM', fw - 64, fh - 9, { small: true, color: PAL.ash, width: 60, align: 'right' }));
      }
      // phones: swipe the picture for the next / last step, tap it to zoom
      fr.eventMode = 'static';
      fr.hitArea = new Rectangle(0, 0, fw, fh);
      let downX: number | null = null;
      fr.on('pointerdown', (e: FederatedPointerEvent) => {
        downX = e.global.x;
      });
      const up = (e: FederatedPointerEvent): void => {
        if (downX === null) return;
        const dx = e.global.x - downX;
        downX = null;
        if (dx < -30) next();
        else if (dx > 30) back();
        else if (touch && shown && shown !== 'loading') zoom(pic);
      };
      fr.on('pointerup', up);
      fr.on('pointerupoutside', up);
      root.addChild(fr);
    }

    // the words
    const pref = [false, true];
    if (kind === 'side') {
      const tx = 10 + fw + 8;
      const tw = RX - tx;
      const tt = text(st.title, tx, 24, { color: PAL.gold, width: tw, maxLines: 2 });
      root.addChild(tt);
      const by = 24 + tt.textHeight + 6;
      root.addChild(fitText(body, tx, by, tw, textBottom - by, pref, PAL.bone));
    } else if (kind === 'wide') {
      const tt = text(st.title, 10, fy + fh + 4, { color: PAL.gold, width: RX - 10, maxLines: 1 });
      root.addChild(tt);
      const by = fy + fh + 4 + 12;
      root.addChild(fitText(body, 10, by, RX - 10, textBottom - by, pref, PAL.bone));
    } else {
      const tt = text(st.title, 10, 24, { color: PAL.gold, width: RX - 10, maxLines: 1 });
      root.addChild(tt);
      root.addChild(fitText(body, 10, 40, RX - 10, textBottom - 40, [false, true], PAL.bone));
    }

    // the bottom bar
    const last = i === N - 1;
    root.addChild(button(mode === 'list' ? 'ALL LESSONS' : 'STOP LESSONS', 10, barY, touch ? 84 : 72, barH, () => finish(mode === 'list' ? 'list' : 'stop'), { small: true, fill: PAL.shadow, tooltip: mode === 'list' ? 'Back to the list' : 'No more lessons pop up (MENU > TUTORIALS still has them all)' }));
    if (mode === 'auto' && !last) root.addChild(button('SKIP', touch ? 98 : 86, barY, touch ? 52 : 40, barH, () => finish('skip'), { small: true, fill: PAL.shadow, tooltip: 'Skip this lesson' }));
    const dots = new Graphics();
    const dcx = touch ? Math.round(SW / 2) : 240;
    const dx0 = dcx - Math.round((N * 8 - 4) / 2);
    for (let d = 0; d < N; d++) dots.rect(dx0 + d * 8, 0, 4, 4).fill(d === i ? PAL.gold : PAL.slate);
    dots.y = barY + Math.round(barH / 2) - 2;
    root.addChild(dots);
    const nextW = touch ? 96 : 62;
    const nextX = RX - nextW + (touch ? 0 : -4);
    if (i > 0) root.addChild(button(touch ? '< BACK' : '← BACK', nextX - 4 - 52, barY, 52, barH, () => back(), { small: true, fill: PAL.shadow }));
    root.addChild(button(last ? (mode === 'list' ? 'DONE' : 'GOT IT') : touch ? 'NEXT >' : 'NEXT →', nextX, barY, nextW, barH, () => next(), { small: !touch, fill: PAL.moss, border: touch ? PAL.gold : undefined }));
  };

  const tick = (tk: Ticker): void => {
    t += tk.deltaMS / 1000;
    upd?.(t);
    zoomUpd?.(t);
  };
  g.app.ticker.add(tick);

  const popKeys = g.pushKeyHandler((e) => {
    const topM = g.modals[g.modals.length - 1];
    if (zoomWrap && topM === zoomWrap) {
      e.preventDefault();
      closeZoom(true);
      return true;
    }
    if (topM !== wrap) return false;
    e.preventDefault();
    if (e.repeat) return true;
    const k = e.key;
    if (k === 'Enter' || k === ' ' || k === 'ArrowRight' || k === 'ArrowDown') next();
    else if (k === 'ArrowLeft' || k === 'ArrowUp') back();
    else if (k === 'Escape') finish('esc');
    return true;
  });

  wrap.once('destroyed', () => {
    g.app.ticker.remove(tick);
    popKeys();
    closeZoom();
    setPadUiMode(padUi);
    markSeen(g, key);
    if (cardOpen === key) cardOpen = null;
    nextWaiting();
  });

  void preload(L, touch);
  render();
}

// ------------------------------------------------------------ 'your turn': point at the real thing

/** Find a button by its label ('PREFIX*' = starts with) in the top window, else on the screen. */
function findButton(g: Game, target: string): Button | null {
  const prefix = target.endsWith('*') ? target.slice(0, -1) : null;
  const walk = (c: Container): Button | null => {
    if (!c.visible) return null;
    for (const ch of c.children) {
      if (ch instanceof Button && ch.visible && (prefix !== null ? ch.labelText.startsWith(prefix) : ch.labelText === target)) return ch;
      if (ch instanceof Container && ch.children.length) {
        const hit = walk(ch);
        if (hit) return hit;
      }
    }
    return null;
  };
  const topM = g.modals[g.modals.length - 1];
  return (topM ? walk(topM) : null) ?? (g.scene ? walk(g.scene.root) : null);
}

/**
 * A bobbing gold arrow and a pulsing box on a real button (or any rectangle), with a little
 * 'YOUR TURN' tag. Gone on the next tap / click / key, after 10 s, or when the screen changes.
 */
export function nudge(g: Game, target: string | (() => Rectangle | null), label = 'YOUR TURN', opts: { forever?: boolean } = {}): () => void {
  const scene = g.scene;
  let rectOf: () => Rectangle | null;
  if (typeof target === 'function') rectOf = target;
  else if (target === '@bout') {
    rectOf = () => {
      const sc = g.scene as unknown as { guideRect?: (what: string) => Rectangle | null } | null;
      return sc?.guideRect ? sc.guideRect('bout') : null;
    };
  } else {
    const b = findButton(g, target);
    rectOf = () => (b && !b.destroyed && b.visible ? b.getBounds().rectangle : null);
  }
  if (!rectOf()) return () => {};
  // a window opening over the screen hides what it points at: the nudge goes too
  const baseModals = g.modals.length;
  const layer = g.feedbackLayer;
  const c = new Container();
  c.eventMode = 'none';
  const gfx = new Graphics();
  c.addChild(gfx);
  const tl = text(label, 2, 1, { small: true, color: PAL.ink });
  const tag = new Container();
  tag.addChild(box(tl.textWidth + 4, 7, PAL.gold));
  tag.addChild(tl);
  c.addChild(tag);
  layer.addChild(c);
  let t = 0;
  let done = false;
  const stop = (): void => {
    if (done) return;
    done = true;
    g.app.ticker.remove(tick);
    g.app.stage.off('pointerdown', stop);
    window.removeEventListener('keydown', stop, true);
    if (!c.destroyed) c.destroy({ children: true });
  };
  const tick = (tk: Ticker): void => {
    t += tk.deltaMS / 1000;
    const r = rectOf();
    if (g.scene !== scene || !r || g.modals.length > baseModals || (!opts.forever && t > 10)) return stop();
    const p = layer.toLocal({ x: r.x, y: r.y });
    const x = Math.round(p.x);
    const y = Math.round(p.y);
    const w = Math.round(r.width);
    const h = Math.round(r.height);
    const a = 0.55 + 0.45 * Math.sin(t * Math.PI * 2);
    gfx.clear();
    edges(gfx, x - 3, y - 3, w + 6, h + 6, PAL.ink, a);
    edges(gfx, x - 2, y - 2, w + 4, h + 4, PAL.gold, a);
    edges(gfx, x - 1, y - 1, w + 2, h + 2, PAL.gold, a);
    const bob = Math.round(Math.sin(t * Math.PI * 6) * 2 + 2);
    // the arrow comes from the left if there's room, else from above, else from the right
    const leftRoom = x + OX > 40;
    if (leftRoom) {
      arrowAt(gfx, x - 4, y + Math.round(h / 2), 'r', bob);
      tag.position.set(x - 20 - bob - tag.width, y + Math.round(h / 2) - 3);
      if (tag.x < -OX + 2) tag.position.set(x - 4 - tag.width, y - 12);
    } else if (y > 24) {
      arrowAt(gfx, x + Math.round(w / 2), y - 4, 'd', bob);
      tag.position.set(x + Math.round(w / 2) + 6, y - 18);
    } else {
      arrowAt(gfx, x + w + 4, y + Math.round(h / 2), 'l', bob);
      tag.position.set(x + w + 20 + bob, y + Math.round(h / 2) - 3);
    }
  };
  g.app.ticker.add(tick);
  if (!opts.forever) {
    g.app.stage.on('pointerdown', stop);
    window.addEventListener('keydown', stop, true);
  }
  return stop;
}

// ------------------------------------------------------------ the TUTORIALS list

const HELP_FOR: Record<LessonGroup, HelpTopic> = { start: 'start', promoter: 'desk', rtc: 'rtc', fighting: 'fight', quick: 'fight' };

/** Every lesson, any time: MENU > TUTORIALS, the title screen's TUTORIALS & HELP. */
export function openTutorials(g: Game, group?: LessonGroup): void {
  const s = g.state;
  let cur: LessonGroup = group ?? (s?.mode === 'career' ? 'promoter' : s?.mode === 'fighter' ? 'rtc' : 'start');
  const touch = isTouchDevice();
  const win = openWindow(g, 'Tutorials: how to play', 440, 236);
  const side = new Container();
  win.body.addChild(side);
  const sb = new ScrollBox(316, 204);
  sb.position.set(122, 4);
  win.body.addChild(sb);
  const draw = (): void => {
    clearChildren(side);
    GROUPS.forEach(([id, label], gi) => {
      const on = id === cur;
      side.addChild(button(label, 4, 4 + gi * 20, 112, 16, () => {
        cur = id;
        sb.scrollTo(0);
        draw();
      }, { small: true, fill: on ? PAL.gold : PAL.shadow, textColor: on ? PAL.ink : PAL.bone }));
    });
    side.addChild(text('Step-by-step, with pictures of the real screens. Lessons also pop up the first time you get somewhere.', 6, 4 + GROUPS.length * 20 + 6, { small: true, width: 108, color: PAL.ash, maxLines: 8 }));
    clearChildren(sb.content);
    const keys = GROUPS.find(([id]) => id === cur)?.[2] ?? [];
    const rh = touch ? 34 : 30;
    keys.forEach((k, ri) => {
      const L = lessonByKey(k);
      if (!L) return;
      const row = clickable(new Container(), () => openLesson(g, k, { mode: 'list', onDone: () => { if (!win.frame.destroyed) draw(); } }));
      row.addChild(box(312, rh - 2, ri % 2 ? 0x2a2630 : 0x24212a, PAL.shadow));
      row.addChild(text(L.title, 6, 4, { color: PAL.bone, width: 236, maxLines: 1 }));
      row.addChild(text(L.blurb, 6, touch ? 18 : 17, { small: true, color: PAL.ash, width: 236, maxLines: 1 }));
      row.addChild(text(`${L.steps.length} STEPS`, 246, touch ? 18 : 17, { small: true, color: PAL.ash, width: 60, align: 'right' }));
      const done = seenLesson(k) || !!(s && s.flags['tut_' + k]);
      row.addChild(text(done ? '✓' : 'NEW', 246, 4, { color: done ? PAL.moss : PAL.gold, small: !done, width: 60, align: 'right' }));
      row.position.set(0, ri * rh);
      sb.content.addChild(row);
    });
    sb.refresh();
  };
  win.body.addChild(button('HELP PAGES: EVERY RULE & MOVE', 122, 212, 200, 14, () => openHelp(g, HELP_FOR[cur]), { small: true, fill: PAL.shadow, border: PAL.gold }));
  draw();
}
