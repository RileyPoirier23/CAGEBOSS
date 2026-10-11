/**
 * Controller support for the existing (mouse-driven) game: a pixel virtual cursor
 * that the left stick drives, dispatching the same DOM pointer / wheel / key events
 * a mouse and keyboard would, so every Pixi button, drag and scroll box just works.
 *
 *   Left stick   move cursor (accelerates; slows over buttons; hold L3 for precision)
 *   D-pad        nudge 1 px (repeats when held)
 *   A            click / hold to drag          B     back (Escape)
 *   X            Space (inspect / continue)    Y     Enter (confirm / next)
 *   LB / RB      previous / next item (arrow up / down)
 *   LT / RT      scroll up / down (analog)     Right stick  scroll
 *   Menu         game menu / settings          View  controls help
 *
 * The cursor shows while a pad is the last-used device and hides as soon as the
 * mouse or a finger moves. Fighter Mode (or any scene reading `input` directly)
 * calls setPadUiMode('game') to switch the cursor off.
 */
import { Container, Graphics, UPDATE_PRIORITY } from 'pixi.js';
import type { Game } from './app';
import { PAL } from '../art/palette';
import { W, H, text, box } from './kit';
import { input, Input, type PadButton } from '../core/input';
import { padGlyph } from './glyphs';

export type PadUiMode = 'cursor' | 'game';

let mode: PadUiMode = 'cursor';
/** 'cursor' = virtual mouse (menus / desk), 'game' = the scene reads `input` itself. */
export function setPadUiMode(m: PadUiMode): void {
  mode = m;
}
export function getPadUiMode(): PadUiMode {
  return mode;
}

export interface ControllerHooks {
  /** Menu button with no modal open */
  onMenu?: () => void;
  /** Y on the help overlay */
  onFightLab?: () => void;
}

const ARROW = [
  '1...........',
  '11..........',
  '121.........',
  '1221........',
  '12221.......',
  '122221......',
  '1222221.....',
  '12222221....',
  '122222221...',
  '1222211111..',
  '1221221.....',
  '121.1221....',
  '11..1221....',
  '1....1221...',
  '.....111....',
];
const HAND = [
  '...11.......',
  '..1221......',
  '..1221......',
  '..122111....',
  '..12212111..',
  '111221212121',
  '122122222221',
  '122222222221',
  '.12222222221',
  '..1222222221',
  '..122222221.',
  '...12222221.',
  '...1111111..',
];

function sprite(rows: string[], dark: number, light: number): Graphics {
  const g = new Graphics();
  rows.forEach((row, y) => {
    for (let x = 0; x < row.length; x++) {
      if (row[x] === '1') g.rect(x, y, 1, 1).fill(dark);
      else if (row[x] === '2') g.rect(x, y, 1, 1).fill(light);
    }
  });
  return g;
}

const HELP_ROWS: [PadButton | 'LStick' | 'RStick' | 'DPad', string][] = [
  ['LStick', 'Move cursor (L3 = precise)'],
  ['DPad', 'Nudge cursor'],
  ['A', 'Click / hold to drag'],
  ['B', 'Back / close'],
  ['X', 'Inspect / continue (Space)'],
  ['Y', 'Confirm / next (Enter)'],
  ['LB', 'Previous item'],
  ['RB', 'Next item'],
  ['LT', 'Scroll up'],
  ['RT', 'Scroll down'],
  ['RStick', 'Scroll'],
  ['Menu', 'Game menu / settings'],
  ['View', 'This help'],
];

export class VirtualCursor {
  layer = new Container();
  x = W / 2;
  y = H / 2;
  private arrow = sprite(ARROW, PAL.ink, PAL.bone);
  private hand = sprite(HAND, PAL.ink, PAL.gold);
  private help: Container | null = null;
  private held = 0;
  private dpadT = 0;
  private wheelAcc = 0;
  private dragging = false;
  private overTarget = false;
  private lastSent = { x: -1, y: -1 };
  private hoverT = 0;
  private visible = false;

  constructor(private g: Game, private hooks: ControllerHooks = {}) {
    this.hand.x = -4;
    this.layer.addChild(this.arrow, this.hand);
    this.layer.eventMode = 'none';
    this.hand.visible = false;
    this.layer.visible = false;
  }

  private get canvas(): HTMLCanvasElement {
    return this.g.app.canvas;
  }

  private client(x: number, y: number): { clientX: number; clientY: number } {
    const r = this.canvas.getBoundingClientRect();
    return { clientX: r.left + ((Math.floor(x) + 0.5) * r.width) / W, clientY: r.top + ((Math.floor(y) + 0.5) * r.height) / H };
  }

  private pointer(type: 'pointermove' | 'pointerdown' | 'pointerup', buttons: number): void {
    const c = this.client(this.x, this.y);
    const ev = new PointerEvent(type, {
      bubbles: true, cancelable: true, composed: true, ...c,
      pointerId: 1, pointerType: 'mouse', isPrimary: true,
      button: type === 'pointermove' ? -1 : 0, buttons,
    });
    this.canvas.dispatchEvent(ev);
  }

  private wheel(dy: number, dx = 0): void {
    const c = this.client(this.x, this.y);
    this.canvas.dispatchEvent(new WheelEvent('wheel', { bubbles: true, cancelable: true, ...c, deltaX: dx, deltaY: dy, deltaMode: 0 }));
  }

  key(key: string, code: string): void {
    const o = { key, code, bubbles: true, cancelable: true };
    window.dispatchEvent(new KeyboardEvent('keydown', o));
    window.dispatchEvent(new KeyboardEvent('keyup', o));
  }

  private setVisible(v: boolean): void {
    if (v === this.visible) return;
    this.visible = v;
    this.layer.visible = v;
    document.body.classList.toggle('pad-cursor', v);
    if (v) this.sendMove(true);
    else if (this.dragging) {
      this.dragging = false;
      this.pointer('pointerup', 0);
    }
  }

  private sendMove(force = false): void {
    const px = Math.floor(this.x);
    const py = Math.floor(this.y);
    this.layer.position.set(px, py);
    if (!force && px === this.lastSent.x && py === this.lastSent.y) return;
    this.lastSent = { x: px, y: py };
    this.pointer('pointermove', this.dragging ? 1 : 0);
    this.updateHover();
  }

  /** What's under the cursor? Hand over clickables, and slow down there (aim assist). */
  private updateHover(): void {
    const px = Math.floor(this.x);
    const py = Math.floor(this.y);
    let t: Container | null = null;
    try {
      t = this.g.app.renderer.events.rootBoundary.hitTest(px, py);
    } catch {
      t = null;
    }
    let over = false;
    for (let n: Container | null = t; n; n = n.parent) {
      if (n.cursor === 'pointer' || n.cursor === 'grab' || n.cursor === 'grabbing') {
        over = true;
        break;
      }
    }
    this.overTarget = over;
    this.arrow.visible = !over;
    this.hand.visible = over;
  }

  /** DOM text field under the cursor (name entry etc.)? Focus it instead of clicking the canvas. */
  private domInputAt(): HTMLElement | null {
    const c = this.client(this.x, this.y);
    const el = document.elementFromPoint(c.clientX, c.clientY) as HTMLElement | null;
    return el && (el.tagName === 'INPUT' || el.tagName === 'TEXTAREA') ? el : null;
  }

  update(dt: number): void {
    const usingPad = input.lastDevice === 'gamepad' && mode === 'cursor';
    this.setVisible(usingPad);
    if (mode !== 'cursor' || !input.connected) return;

    if (this.help) {
      if (input.buttonPressed('B') || input.buttonPressed('View') || input.buttonPressed('A')) this.toggleHelp();
      else if (input.buttonPressed('Y') && this.hooks.onFightLab) {
        this.toggleHelp();
        this.hooks.onFightLab();
      }
      return;
    }

    // ---- movement
    const s = input.stick('left');
    const mag = Math.hypot(s.x, s.y);
    if (mag > 0) {
      this.held += dt;
      const accel = Math.min(1, this.held / 0.55);
      let speed = (70 + 290 * accel) * Math.pow(mag, 1.6);
      if (this.overTarget) speed *= 0.55;
      if (input.button('LS')) speed *= 0.3;
      this.x += (s.x / mag) * speed * dt * Math.min(1, mag);
      this.y += (s.y / mag) * speed * dt * Math.min(1, mag);
    } else this.held = 0;
    const dx = (input.button('Right') ? 1 : 0) - (input.button('Left') ? 1 : 0);
    const dy = (input.button('Down') ? 1 : 0) - (input.button('Up') ? 1 : 0);
    if (dx || dy) {
      if (input.buttonPressed('Right') || input.buttonPressed('Left') || input.buttonPressed('Up') || input.buttonPressed('Down')) {
        this.x += dx;
        this.y += dy;
        this.dpadT = 0;
      } else {
        this.dpadT += dt;
        if (this.dpadT > 0.3) {
          this.x += dx * 45 * dt;
          this.y += dy * 45 * dt;
        }
      }
    }
    this.x = Math.max(0, Math.min(W - 1, this.x));
    this.y = Math.max(0, Math.min(H - 1, this.y));
    if (usingPad) {
      this.sendMove();
      // the scene can change under a still cursor
      this.hoverT += dt;
      if (this.hoverT > 0.15) {
        this.hoverT = 0;
        this.updateHover();
      }
    }

    // ---- buttons
    if (input.buttonPressed('A')) {
      const el = this.domInputAt();
      if (el) {
        el.focus();
        el.click();
      } else {
        this.dragging = true;
        this.pointer('pointerdown', 1);
      }
    }
    if (input.buttonReleased('A') && this.dragging) {
      this.dragging = false;
      this.pointer('pointerup', 0);
    }
    const active = document.activeElement as HTMLElement | null;
    const typing = active && (active.tagName === 'INPUT' || active.tagName === 'TEXTAREA');
    if (input.buttonPressed('B')) {
      if (typing) active!.blur();
      else if (!this.dragging) this.key('Escape', 'Escape');
    }
    if (!typing) {
      if (input.buttonPressed('X')) this.key(' ', 'Space');
      if (input.buttonPressed('Y')) this.key('Enter', 'Enter');
      if (input.buttonPressed('LB')) this.key('ArrowUp', 'ArrowUp');
      if (input.buttonPressed('RB')) this.key('ArrowDown', 'ArrowDown');
    }
    if (input.buttonPressed('Menu')) {
      if (this.g.modals.length) this.key('Escape', 'Escape');
      else this.hooks.onMenu?.();
    }
    if (input.buttonPressed('View')) this.toggleHelp();

    // ---- scrolling: triggers + right stick, analog speed
    const r = input.stick('right');
    const v = input.trigger('RT') - input.trigger('LT') + r.y;
    if (Math.abs(v) > 0.05) {
      this.wheelAcc += Math.abs(v) * 11 * dt;
      if (this.wheelAcc >= 1 || input.buttonPressed('LT') || input.buttonPressed('RT')) {
        this.wheelAcc = Math.max(0, this.wheelAcc - 1);
        this.wheel(Math.sign(v) * 100);
      }
    } else this.wheelAcc = 0.99; // first push scrolls immediately
  }

  toggleHelp(): void {
    if (this.help) {
      this.help.destroy({ children: true });
      this.help = null;
      return;
    }
    const c = new Container();
    const w = 190;
    const h = 22 + HELP_ROWS.length * 12 + 14;
    c.addChild(new Graphics().rect(0, 0, W, H).fill({ color: 0x000000, alpha: 0.55 }));
    const panel = new Container();
    panel.addChild(box(w, h, PAL.night, PAL.ash, { shadow: true }));
    panel.addChild(text('CONTROLLER', 8, 6, { color: PAL.gold }));
    HELP_ROWS.forEach(([b, label], i) => {
      const gl = padGlyph(b);
      gl.position.set(8 + Math.max(0, 15 - Math.ceil(gl.width)) / 2, 20 + i * 12);
      panel.addChild(gl, text(label, 30, 22 + i * 12, { small: true, color: PAL.bone }));
    });
    const foot = new Container();
    const yb = padGlyph('Y');
    foot.addChild(yb, text('Fight controls lab', 13, 2, { small: true, color: PAL.ash }));
    foot.position.set(8, h - 12);
    if (this.hooks.onFightLab) panel.addChild(foot);
    panel.position.set(Math.floor((W - w) / 2), Math.floor((H - h) / 2));
    c.addChild(panel);
    this.help = c;
    this.layer.parent?.addChildAt(c, this.layer.parent.getChildIndex(this.layer));
  }
}

/** Wire the controller into the game: cursor layer, per-frame polling, toasts, rumble. */
export function installController(g: Game, hooks: ControllerHooks = {}): VirtualCursor {
  input.start();
  const vc = new VirtualCursor(g, hooks);
  g.app.stage.addChild(vc.layer);
  // keep the cursor above anything added to the stage later
  g.app.stage.on('childAdded', () => {
    if (g.app.stage.children[g.app.stage.children.length - 1] !== vc.layer) g.app.stage.addChild(vc.layer);
  });
  g.app.ticker.add((t) => {
    input.update();
    vc.update(t.deltaMS / 1000);
  }, undefined, UPDATE_PRIORITY.HIGH);

  input.on('connect', (e) => {
    g.toast(`${Input.padName(e.button)} connected. VIEW = controls`, PAL.gold, { background: true });
    if (input.lastDevice !== 'gamepad') {
      // treat plugging in as intent to use it
      vc.x = W / 2;
      vc.y = H / 2;
    }
  });
  input.on('disconnect', () => g.toast('Controller disconnected', PAL.ember, { background: true }));

  // big screen shakes become rumble
  g.onShake = (mag, dur) => {
    if (!g.settings.reduceShake && input.lastDevice === 'gamepad') input.rumble(Math.min(1, mag / 6), Math.min(1, mag / 4), Math.round(dur * 1000));
  };
  return vc;
}
