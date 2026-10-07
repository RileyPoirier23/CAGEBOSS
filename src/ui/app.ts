/**
 * Game shell: Pixi application at 480x270 integer-scaled to the window,
 * scene manager with a modal stack, settings, toasts and screen shake.
 */
import { maybeTutorial } from './tutorial';
import { Application, Container, TextureStyle, Graphics, Ticker } from 'pixi.js';
import type { GameState } from '../core/types';
import { loadJSON, storeJSON, saveToSlot, autoSlot } from '../core/save';
import { setColorblind, PAL } from '../art/palette';
import { setMuted, setMusic, setVolumes, sfx, unlock as sfxUnlock } from '../audio/sfx';
import { W, H, tooltip, clearChildren, dimmer, box, text } from './kit';
import { bus } from '../core/events';
import { setTextResolution, setBleep } from './text';
import { desktop } from '../desktop';
import { LoadingScreen } from './loading';
import { configureMusic, setMusicContext, skipTrack, unlockMusic, onTrackChange, type MusicContext } from '../audio/music';

export interface Settings {
  textSpeed: number; // 1 slow .. 3 fast, 4 instant
  uiScale: number; // 0 = auto
  colorblind: boolean;
  reduceShake: boolean;
  mute: boolean;
  music: boolean;
  sfxVolume: number;
  fightSpeed: number; // 1..4
  clockSpeed: number; // multiplier for the desk clock (0 = paused/relaxed)
  fightCam?: 'side' | 'tv' | 'top'; // spectating camera
  musicVolume?: number; // soundtrack volume 0..1
  soundtrackV?: number; // settings migration marker
  intros?: boolean; // Juiced Butler introductions before watched bouts
  bleep?: boolean; // streamer mode: grawlix instead of swears
  fullscreen?: boolean; // desktop build only
  bleets?: boolean; // live Bleeter feed while watching fights
  tutorial?: boolean; // offer the tutorial on new careers
  handsOn?: boolean; // Fighter Mode: control your fighter in real time (default on)
  tvSafe?: number; // TV-safe margin in % of each edge (consoles / TVs)
}

const DEFAULT_SETTINGS: Settings = {
  textSpeed: 2,
  uiScale: 0,
  colorblind: false,
  reduceShake: false,
  mute: false,
  music: true,
  musicVolume: 0.6,
  soundtrackV: 1,
  sfxVolume: 0.5,
  fightSpeed: 2,
  clockSpeed: 1,
};

export abstract class Scene {
  root = new Container();
  /** what the soundtrack should be doing while this scene is up */
  music: MusicContext = 'office';
  /** first visit in a new career shows the tutorial cards for this key */
  tutorialKey?: string;
  constructor(protected g: Game) {}
  abstract build(): void;
  enter(): void {
    this.build();
  }
  exit(): void {}
  update(_dt: number): void {}
  onKey(_e: KeyboardEvent): boolean {
    return false;
  }
  refresh(): void {
    clearChildren(this.root);
    this.build();
  }
}

export class Game {
  app!: Application;
  stage = new Container(); // shaken
  sceneLayer = new Container();
  modalLayer = new Container();
  toastLayer = new Container(); // background notices: under any open window
  feedbackLayer = new Container(); // toasts raised while a window is open (its own feedback)
  tipLayer = new Container();
  loadLayer = new Container();
  private loader: LoadingScreen | null = null;
  scene: Scene | null = null;
  modals: Container[] = [];
  state: GameState | null = null;
  settings: Settings = loadJSON('cageboss.settings', DEFAULT_SETTINGS);
  private shakeT = 0;
  private shakeMag = 0;
  private toasts: { node: Container; t: number }[] = [];
  scale = 1;

  async init(parent: HTMLElement): Promise<void> {
    TextureStyle.defaultOptions.scaleMode = 'nearest';
    this.app = new Application();
    await this.app.init({
      width: W,
      height: H,
      background: PAL.ink,
      antialias: false,
      resolution: 1,
      roundPixels: true,
      preference: 'webgl',
    });
    parent.appendChild(this.app.canvas);
    this.app.stage.addChild(this.stage);
    this.stage.addChild(this.sceneLayer, this.toastLayer, this.modalLayer, this.feedbackLayer);
    this.app.stage.addChild(this.tipLayer, this.loadLayer);
    tooltip.attach(this.tipLayer);
    this.app.stage.eventMode = 'static';
    this.app.stage.hitArea = { contains: () => true };
    this.app.stage.on('globalpointermove', (e) => tooltip.move(e.global.x, e.global.y));
    this.applySettings();
    window.addEventListener('resize', () => this.resize());
    // phones: safe-area insets / rotation change the host box without always firing resize
    if (typeof ResizeObserver !== 'undefined') new ResizeObserver(() => this.resize()).observe(parent);
    this.resize();
    window.addEventListener('keydown', (e) => this.handleKey(e));
    this.app.ticker.add((t: Ticker) => this.tick(t.deltaMS / 1000));
    // browsers only allow audio after the first click / key press
    // (touch only counts as a user gesture on pointerup / touchend, hence the extra events for iOS)
    const gestures = ['pointerdown', 'pointerup', 'touchend', 'click', 'keydown'] as const;
    const unlock = (e: Event) => {
      unlockMusic();
      sfxUnlock();
      if (e.type === 'pointerdown' && (e as PointerEvent).pointerType === 'touch') return; // wait for the pointerup
      gestures.forEach((t) => window.removeEventListener(t, unlock, true));
    };
    gestures.forEach((t) => window.addEventListener(t, unlock, true));
    onTrackChange((t) => {
      if (this.settings.music && !this.settings.mute) this.showNowPlaying(t.title, t.artist);
    });
  }

  resize(): void {
    const c = this.app.canvas;
    // fit inside the host box (it already excludes phone safe-area insets), minus the TV-safe margin
    const host = c.parentElement;
    const safe = 1 - 2 * Math.max(0, Math.min(10, this.settings.tvSafe ?? 0)) / 100;
    const aw = (host?.clientWidth || window.innerWidth) * safe;
    const ah = (host?.clientHeight || window.innerHeight) * safe;
    const dpr = window.devicePixelRatio || 1;
    let s = this.settings.uiScale;
    if (!s) {
      // whole *device* pixels per game pixel keeps nearest-neighbour sharp on high-DPI screens
      const fit = Math.min((aw * dpr) / W, (ah * dpr) / H);
      let dev = Math.max(1, Math.floor(fit + 1e-6));
      // small phones: a whole-pixel fit can waste a third of the screen; fill it instead
      if (dpr >= 2 && matchMedia('(pointer: coarse)').matches && dev / fit < 0.8) dev = Math.floor(fit * 4) / 4;
      s = dev / dpr;
    }
    this.scale = s;
    const res = s * dpr;
    this.app.renderer.resize(W, H, res);
    setTextResolution(res);
    c.style.width = W * s + 'px';
    c.style.height = H * s + 'px';
    bus.emit('resize', s);
  }

  applySettings(): void {
    setBleep(!!this.settings.bleep);
    desktop?.setFullscreen(this.settings.fullscreen !== false);
    // the old chiptune setting defaulted to off; the soundtrack defaults to on
    if (this.settings.soundtrackV !== 1) {
      this.settings.soundtrackV = 1;
      this.settings.music = true;
      this.settings.musicVolume = this.settings.musicVolume ?? 0.6;
    }
    setColorblind(this.settings.colorblind);
    setMuted(this.settings.mute);
    setVolumes(this.settings.sfxVolume, 0.25);
    setMusic(false); // procedural chiptune retired in favour of the soundtrack
    configureMusic({ enabled: this.settings.music, muted: this.settings.mute, volume: this.settings.musicVolume ?? 0.6 });
    storeJSON('cageboss.settings', this.settings);
    if (this.app) this.resize();
  }

  goto(scene: Scene): void {
    this.closeAllModals();
    if (this.scene) {
      this.scene.exit();
      this.sceneLayer.removeChildren();
      this.scene.root.destroy({ children: true });
    }
    tooltip.hide();
    this.scene = scene;
    this.sceneLayer.addChild(scene.root);
    setMusicContext(scene.music);
    scene.enter();
    if (scene.tutorialKey) maybeTutorial(this, scene.tutorialKey);
  }

  /**
   * Show a loading screen, run the (possibly heavy) work once it has painted,
   * keep it up for at least `minTime` seconds, then fade it out.
   */
  loading(label: string, work: () => void, minTime = 0.9): void {
    if (this.loader) this.loader.destroy({ children: true });
    const ls = new LoadingScreen(label);
    this.loader = ls;
    this.loadLayer.addChild(ls);
    const start = performance.now();
    // two frames so the screen is actually visible before we block
    requestAnimationFrame(() => requestAnimationFrame(() => {
      try {
        work();
      } finally {
        const left = Math.max(0, minTime * 1000 - (performance.now() - start));
        setTimeout(() => (ls.done = true), left);
      }
    }));
  }

  /** Push a modal container (gets a dimmer behind it). */
  modal(content: Container, opts: { dim?: number; closeOnDim?: boolean } = {}): Container {
    const wrap = new Container();
    wrap.addChild(dimmer(opts.dim ?? 0.6, opts.closeOnDim ? () => this.closeModal(wrap) : undefined));
    wrap.addChild(content);
    this.modalLayer.addChild(wrap);
    this.modals.push(wrap);
    tooltip.hide();
    return wrap;
  }

  closeModal(which?: Container): void {
    const m = which ?? this.modals[this.modals.length - 1];
    if (!m) return;
    this.modals = this.modals.filter((x) => x !== m);
    this.modalLayer.removeChild(m);
    m.destroy({ children: true });
    tooltip.hide();
  }

  closeAllModals(): void {
    while (this.modals.length) this.closeModal();
  }

  shake(mag = 2, dur = 0.2): void {
    if (this.settings.reduceShake) return;
    this.shakeMag = Math.max(this.shakeMag, mag);
    this.shakeT = Math.max(this.shakeT, dur);
  }

  toast(msg: string, color: number = PAL.bone, opts: { top?: boolean; small?: boolean; background?: boolean } = {}): void {
    const t = text(msg, 4, 3, { color, width: 200, small: opts.small });
    const w = t.textWidth + 8;
    const h = t.textHeight + 7;
    const c = new Container();
    c.addChild(box(w, h, PAL.night, PAL.ash, { shadow: true }));
    c.addChild(t);
    c.x = opts.top ? Math.floor((W - w) / 2) : W - w - 4;
    c.y = opts.top ? 2 : H - 4 - h - this.toasts.length * (h + 2);
    (this.modals.length && !opts.background ? this.feedbackLayer : this.toastLayer).addChild(c);
    this.toasts.push({ node: c, t: 2.6 });
  }

  /** Compact 'NOW PLAYING' tag, bottom-left: fades in, holds ~3s, fades out. One at a time. */
  private nowPlaying: { node: Container; t: number } | null = null;

  private showNowPlaying(title: string, artist: string): void {
    this.nowPlaying?.node.destroy({ children: true });
    const c = new Container();
    const label = text('NOW PLAYING', 13, 2, { small: true, color: PAL.ash });
    const song = text(`${title.toUpperCase()}  -  ${artist.toUpperCase()}`, 13, 9, { small: true, color: PAL.gold, width: 200, maxLines: 1 });
    const w = Math.max(label.textWidth, song.textWidth) + 18;
    const bg = new Graphics()
      .rect(0, 0, w, 17).fill({ color: 0x0a0a10, alpha: 0.85 })
      .rect(0, 0, 2, 17).fill(PAL.gold);
    // tiny equaliser bars
    for (let i = 0; i < 3; i++) bg.rect(5 + i * 2, 6 + (i % 2) * 3, 1, 8 - (i % 2) * 3).fill(PAL.gold);
    c.addChild(bg, label, song);
    c.position.set(4, H - 40); // clear of every screen's bottom button row
    c.alpha = 0;
    this.toastLayer.addChild(c);
    this.nowPlaying = { node: c, t: 0 };
  }

  private tickNowPlaying(dt: number): void {
    const np = this.nowPlaying;
    if (!np) return;
    np.t += dt;
    const IN = 0.35, HOLD = 3, OUT = 0.6;
    const a = np.t < IN ? np.t / IN : np.t < IN + HOLD ? 1 : 1 - (np.t - IN - HOLD) / OUT;
    np.node.alpha = Math.max(0, Math.min(1, a));
    np.node.x = 4 - Math.round((1 - np.node.alpha) * 6);
    if (np.t > IN + HOLD + OUT) {
      np.node.destroy({ children: true });
      this.nowPlaying = null;
    }
  }

  autosave(): void {
    if (this.state) saveToSlot(this.state, autoSlot(this.state));
  }

  private tick(dt: number): void {
    this.tickNowPlaying(dt);
    if (this.loader && !this.loader.update(dt)) {
      this.loader.destroy({ children: true });
      this.loader = null;
    }
    if (this.shakeT > 0) {
      this.shakeT -= dt;
      const m = this.shakeT > 0 ? this.shakeMag : 0;
      this.stage.x = Math.round((Math.random() * 2 - 1) * m);
      this.stage.y = Math.round((Math.random() * 2 - 1) * m);
      if (this.shakeT <= 0) {
        this.shakeMag = 0;
        this.stage.x = this.stage.y = 0;
      }
    }
    for (const t of this.toasts) {
      t.t -= dt;
      if (t.t < 0.4) t.node.alpha = Math.max(0, t.t / 0.4);
    }
    const dead = this.toasts.filter((t) => t.t <= 0);
    if (dead.length) {
      dead.forEach((t) => t.node.destroy({ children: true }));
      this.toasts = this.toasts.filter((t) => t.t > 0);
    }
    this.scene?.update(dt);
  }

  private keyHandlers: ((e: KeyboardEvent) => boolean)[] = [];
  pushKeyHandler(h: (e: KeyboardEvent) => boolean): () => void {
    this.keyHandlers.push(h);
    return () => (this.keyHandlers = this.keyHandlers.filter((x) => x !== h));
  }

  private handleKey(e: KeyboardEvent): void {
    const tag = (e.target as HTMLElement)?.tagName;
    if (tag === 'INPUT' || tag === 'TEXTAREA') return;
    for (let i = this.keyHandlers.length - 1; i >= 0; i--) if (this.keyHandlers[i](e)) return;
    if (e.key === 'n' || e.key === 'N') {
      skipTrack();
      return;
    }
    if (e.key === 'm' || e.key === 'M') {
      this.settings.mute = !this.settings.mute;
      this.applySettings();
      this.toast(this.settings.mute ? 'Muted' : 'Sound on');
      return;
    }
    if (e.key === 'Escape' && this.modals.length) {
      this.closeModal();
      sfx('click');
      return;
    }
    this.scene?.onKey(e);
  }

  overlayRect(): DOMRect {
    return this.app.canvas.getBoundingClientRect();
  }
}

export function fullBg(color: number): Graphics {
  return new Graphics().rect(0, 0, W, H).fill(color);
}

export { clearChildren };
