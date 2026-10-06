/**
 * Game shell: Pixi application at 480x270 integer-scaled to the window,
 * scene manager with a modal stack, settings, toasts and screen shake.
 */
import { Application, Container, TextureStyle, Graphics, Ticker } from 'pixi.js';
import type { GameState } from '../core/types';
import { loadJSON, storeJSON, saveToSlot } from '../core/save';
import { setColorblind, PAL } from '../art/palette';
import { setMuted, setMusic, setVolumes, sfx } from '../audio/sfx';
import { W, H, tooltip, clearChildren, dimmer, box, text } from './kit';
import { bus } from '../core/events';

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
}

const DEFAULT_SETTINGS: Settings = {
  textSpeed: 2,
  uiScale: 0,
  colorblind: false,
  reduceShake: false,
  mute: false,
  music: false,
  sfxVolume: 0.5,
  fightSpeed: 2,
  clockSpeed: 1,
};

export abstract class Scene {
  root = new Container();
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
  toastLayer = new Container();
  tipLayer = new Container();
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
    this.stage.addChild(this.sceneLayer, this.modalLayer, this.toastLayer);
    this.app.stage.addChild(this.tipLayer);
    tooltip.attach(this.tipLayer);
    this.app.stage.eventMode = 'static';
    this.app.stage.hitArea = { contains: () => true };
    this.app.stage.on('globalpointermove', (e) => tooltip.move(e.global.x, e.global.y));
    this.applySettings();
    window.addEventListener('resize', () => this.resize());
    this.resize();
    window.addEventListener('keydown', (e) => this.handleKey(e));
    this.app.ticker.add((t: Ticker) => this.tick(t.deltaMS / 1000));
    // unlock audio on first interaction
    const unlock = () => {
      setMusic(this.settings.music);
      window.removeEventListener('pointerdown', unlock);
    };
    window.addEventListener('pointerdown', unlock);
  }

  resize(): void {
    const s = this.settings.uiScale || Math.max(1, Math.floor(Math.min(window.innerWidth / W, window.innerHeight / H)));
    this.scale = s;
    const c = this.app.canvas;
    c.style.width = W * s + 'px';
    c.style.height = H * s + 'px';
    bus.emit('resize', s);
  }

  applySettings(): void {
    setColorblind(this.settings.colorblind);
    setMuted(this.settings.mute);
    setVolumes(this.settings.sfxVolume, 0.25);
    setMusic(this.settings.music);
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
    scene.enter();
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

  toast(msg: string, color: number = PAL.bone): void {
    const t = text(msg, 4, 3, { color, width: 200 });
    const w = t.textWidth + 8;
    const h = t.textHeight + 7;
    const c = new Container();
    c.addChild(box(w, h, PAL.night, PAL.ash, { shadow: true }));
    c.addChild(t);
    c.x = W - w - 4;
    c.y = H - 4 - h - this.toasts.length * (h + 2);
    this.toastLayer.addChild(c);
    this.toasts.push({ node: c, t: 2.6 });
  }

  autosave(): void {
    if (this.state) saveToSlot(this.state, 'auto');
  }

  private tick(dt: number): void {
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
