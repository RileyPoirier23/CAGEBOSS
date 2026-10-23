/**
 * COMING SOON: the next game in the Boss series. A card with a few screenshots to flip through
 * and a short preview clip (played over the canvas, since the game draws to one). Pops up once
 * per version after What's New, and lives in the title menu after that.
 */
import { Assets, Sprite, Texture } from 'pixi.js';
import type { Game } from './app';
import { PAL } from '../art/palette';
import { text, button, box } from './kit';
import { openWindow } from './widgets';
import { loadJSON, storeJSON } from '../core/save';

const BASE = () => `${import.meta.env.BASE_URL}driveboss/`;

/** The screenshots, in order, and a line under each. */
const SHOTS: { file: string; caption: string }[] = [
  { file: 'shot_garage.png', caption: 'COVINGTON AUTO. YOUR DEAD FATHER\'S GARAGE, AND NOW A GANG\'S FRONT.' },
  { file: 'shot_night.png', caption: 'EIGHT YEARS, EIGHT WINTERS, ONE CITY THAT GETS A REAL ONE.' },
  { file: 'shot_crash.png', caption: 'POLICE, FIRE AND EMS ROLL UP ON WHATEVER YOU DID.' },
  { file: 'shot_counter.png', caption: 'A TIM BURTONS ON EVERY CORNER. RUN THE COUNTER BY DAY: STAMP IT, FAIL IT, OR SWAP THE VIN.' },
];

let shownThisSession = false;

/**
 * Once per version, after What's New has had its turn: it waits until nothing else is open, and
 * only pops up while `here()` (the title screen is still showing); left early, it tries again
 * next time.
 */
export function maybeComingSoon(g: Game, here: () => boolean = () => true): void {
  if (shownThisSession) return;
  shownThisSession = true;
  const seen = loadJSON<string>('cageboss-comingsoon-driveboss', '');
  if (seen === __APP_VERSION__) return;
  const go = (): void => {
    if (!here()) {
      shownThisSession = false;
      return;
    }
    if (g.modals.length) {
      setTimeout(go, 500);
      return;
    }
    storeJSON('cageboss-comingsoon-driveboss', __APP_VERSION__);
    openComingSoon(g);
  };
  go();
}

export function openComingSoon(g: Game): void {
  const w = 340;
  const h = 232;
  const win = openWindow(g, 'Coming soon from 506Studios', w, h);
  const b = win.body;
  b.addChild(text('DRIVEBOSS', 0, 2, { scale: 2, width: w, align: 'center', color: PAL.gold, shadow: PAL.ink }));
  b.addChild(text('FAST & FURIOUS MEETS PAPERS, PLEASE. SET IN A CITY THAT GETS A REAL WINTER.', 0, 20, { small: true, width: w, align: 'center', color: PAL.bone }));

  // the picture frame: 320 x 120 (the shots are 16:9, letterboxed in it)
  const fx = 10;
  const fy = 32;
  const fw = 320;
  const fh = 120;
  const frame = box(fw + 2, fh + 2, PAL.ink, PAL.ash);
  frame.position.set(fx - 1, fy - 1);
  b.addChild(frame);
  const pic = new Sprite();
  pic.position.set(fx, fy);
  b.addChild(pic);
  const caption = text('', 0, fy + fh + 4, { small: true, width: w, align: 'center', color: PAL.ash, maxLines: 2 });
  b.addChild(caption);
  const counter = text('', 0, fy + fh + 26, { small: true, width: w, align: 'center', color: PAL.grey });
  b.addChild(counter);

  let i = 0;
  const textures = new Map<string, Texture>();
  const show = (k: number) => {
    i = (k + SHOTS.length) % SHOTS.length;
    const s = SHOTS[i];
    caption.setText(s.caption);
    counter.setText(`${i + 1} / ${SHOTS.length}`);
    const put = (tex: Texture) => {
      if (pic.destroyed) return;
      tex.source.scaleMode = 'nearest';
      pic.texture = tex;
      const sc = Math.min(fw / tex.width, fh / tex.height);
      pic.scale.set(sc);
      pic.position.set(fx + Math.round((fw - tex.width * sc) / 2), fy + Math.round((fh - tex.height * sc) / 2));
    };
    const have = textures.get(s.file);
    if (have) put(have);
    else Assets.load(`${BASE()}${s.file}`).then((tex: Texture) => { textures.set(s.file, tex); if (SHOTS[i].file === s.file) put(tex); }).catch(() => {});
  };
  show(0);
  b.addChild(button('<', fx, fy + 48, 12, 24, () => show(i - 1), { small: true, fill: PAL.shadow }));
  b.addChild(button('>', fx + fw - 12, fy + 48, 12, 24, () => show(i + 1), { small: true, fill: PAL.shadow }));

  const y = h - 32;
  b.addChild(button('WATCH THE PREVIEW', 10, y, 150, 14, () => playPreview(), { small: true, fill: PAL.blood, border: PAL.gold }));
  b.addChild(button('BACK TO THE CAGE', w - 160, y, 150, 14, () => win.close(), { small: true, fill: PAL.moss }));
}

/** The clip, over the whole page: the game draws to a canvas, so the video sits on top of it. */
function playPreview(): void {
  if (typeof document === 'undefined') return;
  const old = document.getElementById('driveboss-preview');
  if (old) old.remove();
  const wrap = document.createElement('div');
  wrap.id = 'driveboss-preview';
  wrap.style.cssText = 'position:fixed;inset:0;background:#000;z-index:1000;display:flex;align-items:center;justify-content:center;cursor:pointer';
  const video = document.createElement('video');
  video.style.cssText = 'max-width:100%;max-height:100%;image-rendering:pixelated';
  video.autoplay = true;
  video.playsInline = true;
  video.controls = false;
  for (const [src, type] of [['preview.webm', 'video/webm'], ['preview.mp4', 'video/mp4']]) {
    const s = document.createElement('source');
    s.src = `${BASE()}${src}`;
    s.type = type;
    video.appendChild(s);
  }
  const hint = document.createElement('div');
  hint.textContent = 'DRIVEBOSS - COMING SOON - CLICK TO CLOSE';
  hint.style.cssText = 'position:absolute;bottom:12px;left:0;right:0;text-align:center;color:#d9a441;font:12px monospace;letter-spacing:2px';
  wrap.appendChild(video);
  wrap.appendChild(hint);
  const done = () => wrap.remove();
  wrap.addEventListener('click', done);
  video.addEventListener('ended', done);
  video.addEventListener('error', done);
  document.body.appendChild(wrap);
  void video.play().catch(() => {});
}
