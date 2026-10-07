/**
 * On-screen touch fight pad for Fighter Mode (off until a fight scene adds it):
 * a floating virtual stick on the left, six buttons on the right. The layout is
 * data (FIGHT_PAD_LAYOUT) in 480x270 game pixels; state() feeds sampleFight().
 */
import { Container, Graphics, type FederatedPointerEvent } from 'pixi.js';
import { PAL } from '../art/palette';
import { text, W, H } from './kit';
import type { TouchFightButton, TouchPadState } from '../core/fightinput';

export interface FightPadLayout {
  stick: { x: number; y: number; r: number; zone: { x: number; y: number; w: number; h: number } };
  buttons: { id: TouchFightButton; label: string; x: number; y: number; r: number; color: number }[];
}

export const FIGHT_PAD_LAYOUT: FightPadLayout = {
  stick: { x: 52, y: H - 52, r: 26, zone: { x: 0, y: H / 2 - 20, w: W * 0.4, h: H / 2 + 20 } },
  buttons: [
    { id: 'LEAD', label: 'LEAD', x: W - 96, y: H - 70, r: 15, color: PAL.steel },
    { id: 'REAR', label: 'REAR', x: W - 58, y: H - 82, r: 15, color: PAL.blood },
    { id: 'KICK', label: 'KICK', x: W - 26, y: H - 56, r: 14, color: PAL.moss },
    { id: 'BLOCK', label: 'BLOCK', x: W - 120, y: H - 32, r: 14, color: PAL.slate },
    { id: 'GRAB', label: 'GRAB', x: W - 78, y: H - 30, r: 14, color: PAL.ember },
    { id: 'EVADE', label: 'DODGE', x: W - 36, y: H - 22, r: 13, color: PAL.plum },
  ],
};

function pixelCircle(g: Graphics, cx: number, cy: number, r: number, color: number, alpha: number): void {
  for (let y = -r; y <= r; y++) {
    const w = Math.round(Math.sqrt(r * r - y * y));
    g.rect(cx - w, cy + y, w * 2, 1).fill({ color, alpha });
  }
}

export class TouchFightPad extends Container {
  private st: TouchPadState = { stick: { x: 0, y: 0 }, held: new Set() };
  private stickPtr: number | null = null;
  private stickOrigin = { x: 0, y: 0 };
  private btnPtr = new Map<number, TouchFightButton>();
  private gfx = new Graphics();

  constructor(public layout: FightPadLayout = FIGHT_PAD_LAYOUT) {
    super();
    this.addChild(this.gfx);
    for (const b of layout.buttons) {
      const t = text(b.label, 0, 0, { small: true, color: PAL.bone });
      t.x = Math.round(b.x - t.textWidth / 2);
      t.y = Math.round(b.y - 2);
      this.addChild(t);
    }
    this.eventMode = 'static';
    this.hitArea = { contains: (x: number, y: number) => this.hit(x, y) !== null };
    this.on('pointerdown', (e: FederatedPointerEvent) => this.down(e));
    this.on('globalpointermove', (e: FederatedPointerEvent) => this.move(e));
    this.on('pointerup', (e: FederatedPointerEvent) => this.up(e));
    this.on('pointerupoutside', (e: FederatedPointerEvent) => this.up(e));
    this.draw();
  }

  state(): TouchPadState {
    return { stick: { ...this.st.stick }, held: new Set(this.st.held) };
  }

  private hit(x: number, y: number): 'stick' | TouchFightButton | null {
    for (const b of this.layout.buttons) if (Math.hypot(x - b.x, y - b.y) <= b.r + 3) return b.id;
    const z = this.layout.stick.zone;
    if (x >= z.x && y >= z.y && x < z.x + z.w && y < z.y + z.h) return 'stick';
    return null;
  }

  private down(e: FederatedPointerEvent): void {
    const p = this.toLocal(e.global);
    const h = this.hit(p.x, p.y);
    if (h === 'stick' && this.stickPtr === null) {
      this.stickPtr = e.pointerId;
      this.stickOrigin = { x: p.x, y: p.y }; // floating stick: centre where the thumb lands
      this.st.stick = { x: 0, y: 0 };
    } else if (h && h !== 'stick') {
      this.btnPtr.set(e.pointerId, h);
      this.st.held.add(h);
    }
    this.draw();
  }

  private move(e: FederatedPointerEvent): void {
    if (e.pointerId !== this.stickPtr) return;
    const p = this.toLocal(e.global);
    const r = this.layout.stick.r;
    let dx = (p.x - this.stickOrigin.x) / r;
    let dy = (p.y - this.stickOrigin.y) / r;
    const m = Math.hypot(dx, dy);
    if (m > 1) {
      dx /= m;
      dy /= m;
    }
    this.st.stick = { x: dx, y: dy };
    this.draw();
  }

  private up(e: FederatedPointerEvent): void {
    if (e.pointerId === this.stickPtr) {
      this.stickPtr = null;
      this.st.stick = { x: 0, y: 0 };
    }
    const b = this.btnPtr.get(e.pointerId);
    if (b) {
      this.btnPtr.delete(e.pointerId);
      if (![...this.btnPtr.values()].includes(b)) this.st.held.delete(b);
    }
    this.draw();
  }

  private draw(): void {
    const g = this.gfx.clear();
    const s = this.layout.stick;
    const cx = this.stickPtr !== null ? this.stickOrigin.x : s.x;
    const cy = this.stickPtr !== null ? this.stickOrigin.y : s.y;
    pixelCircle(g, Math.round(cx), Math.round(cy), s.r, PAL.night, 0.45);
    pixelCircle(g, Math.round(cx + this.st.stick.x * s.r * 0.7), Math.round(cy + this.st.stick.y * s.r * 0.7), 10, PAL.ash, 0.7);
    for (const b of this.layout.buttons) {
      const on = this.st.held.has(b.id);
      pixelCircle(g, b.x, b.y + 1, b.r, 0x000000, 0.35);
      pixelCircle(g, b.x, b.y + (on ? 1 : 0), b.r, b.color, on ? 0.95 : 0.6);
    }
  }
}
