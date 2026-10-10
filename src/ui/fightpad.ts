/**
 * On-screen touch fight pad (phones / tablets, added by the fight scenes): a floating
 * virtual stick on the left, the buttons in an arc under the right thumb. The layout is
 * data (FIGHT_PAD_LAYOUT) in 480x270 game pixels; state() feeds sampleFight().
 *
 * The pad follows the fight (setMode): the clinch turns KICK into KNEE and GRAB into TIE,
 * the ground into MOVE / SUB, a submission into two MASH buttons (roll the stick to
 * fight it), and a knockdown swaps everything for two big GET UP buttons to alternate.
 */
import { Container, Graphics, type FederatedPointerEvent } from 'pixi.js';
import { PAL } from '../art/palette';
import { text, W, H } from './kit';
import { AH } from './arena';
import type { TouchFightButton, TouchPadState } from '../core/fightinput';

/** What the fight is doing, as far as the pad cares. */
export type PadMode = 'stand' | 'clinch' | 'ground' | 'sub' | 'down';

export interface FightPadButton {
  id: TouchFightButton;
  x: number;
  y: number;
  r: number;
  color: number;
  /** the label in each mode; a mode it isn't listed for hides the button */
  labels: Partial<Record<PadMode, string>>;
}

export interface FightPadLayout {
  stick: { x: number; y: number; r: number; zone: { x: number; y: number; w: number; h: number } };
  buttons: FightPadButton[];
}

export const FIGHT_PAD_LAYOUT: FightPadLayout = {
  // the live fight HUD keeps x 0..120 and 330..480 of its panel clear for the thumbs
  stick: { x: 58, y: H - 54, r: 28, zone: { x: 0, y: AH - 40, w: 122, h: H - AH + 40 } },
  buttons: [
    { id: 'LEAD', x: W - 100, y: H - 62, r: 17, color: PAL.steel, labels: { stand: 'LEAD', clinch: 'LEAD', ground: 'LEAD' } },
    { id: 'REAR', x: W - 58, y: H - 82, r: 17, color: PAL.blood, labels: { stand: 'REAR', clinch: 'REAR', ground: 'REAR' } },
    { id: 'KICK', x: W - 22, y: H - 50, r: 16, color: PAL.moss, labels: { stand: 'KICK', clinch: 'KNEE', ground: 'MOVE', sub: 'MASH' } },
    { id: 'BLOCK', x: W - 134, y: H - 28, r: 16, color: PAL.slate, labels: { stand: 'BLOCK', clinch: 'BLOCK', ground: 'BLOCK' } },
    { id: 'GRAB', x: W - 92, y: H - 20, r: 16, color: PAL.ember, labels: { stand: 'GRAB', clinch: 'TIE', ground: 'SUB', sub: 'MASH' } },
    { id: 'EVADE', x: W - 50, y: H - 17, r: 14, color: PAL.plum, labels: { stand: 'DODGE' } },
    { id: 'BODY', x: W - 140, y: H - 70, r: 12, color: PAL.gold, labels: { stand: 'BODY', clinch: 'BODY' } },
    { id: 'FEINT', x: W - 104, y: H - 104, r: 12, color: PAL.shadow, labels: { stand: 'FEINT' } },
    // knocked down: alternate the two, in rhythm, to beat the count
    { id: 'UPL', x: 64, y: H - 56, r: 30, color: PAL.gold, labels: { down: 'GET UP' } },
    { id: 'UPR', x: W - 64, y: H - 56, r: 30, color: PAL.gold, labels: { down: 'GET UP' } },
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
  /** pressed since the last state(): a tap shorter than a frame still counts as one frame held */
  private fresh = new Set<TouchFightButton>();
  private gfx = new Graphics();
  private labels = new Container();
  private mode: PadMode = 'stand';

  constructor(public layout: FightPadLayout = FIGHT_PAD_LAYOUT) {
    super();
    this.addChild(this.gfx, this.labels);
    this.eventMode = 'static';
    this.hitArea = { contains: (x: number, y: number) => this.hit(x, y) !== null };
    this.on('pointerdown', (e: FederatedPointerEvent) => this.down(e));
    this.on('globalpointermove', (e: FederatedPointerEvent) => this.move(e));
    this.on('pointerup', (e: FederatedPointerEvent) => this.up(e));
    this.on('pointerupoutside', (e: FederatedPointerEvent) => this.up(e));
    this.buildLabels();
    this.draw();
  }

  state(): TouchPadState {
    const held = new Set([...this.st.held, ...this.fresh]);
    this.fresh.clear();
    return { stick: { ...this.st.stick }, held };
  }

  /** Relabel / show the buttons for what the fight is doing. */
  setMode(mode: PadMode): void {
    if (mode === this.mode) return;
    this.mode = mode;
    // buttons that just went away let go (a held block shouldn't stick through a knockdown)
    for (const [ptr, id] of [...this.btnPtr]) {
      if (this.visible_(id)) continue;
      this.btnPtr.delete(ptr);
      this.st.held.delete(id);
      this.fresh.delete(id);
    }
    if (mode === 'down' && this.stickPtr !== null) {
      this.stickPtr = null;
      this.st.stick = { x: 0, y: 0 };
    }
    this.buildLabels();
    this.draw();
  }

  private visible_(id: TouchFightButton): boolean {
    return !!this.layout.buttons.find((b) => b.id === id)?.labels[this.mode];
  }

  private shown(): FightPadButton[] {
    return this.layout.buttons.filter((b) => b.labels[this.mode]);
  }

  private buildLabels(): void {
    this.labels.removeChildren().forEach((c) => c.destroy());
    for (const b of this.shown()) {
      const t = text(b.labels[this.mode]!, 0, 0, { small: b.r < 20, color: PAL.bone, shadow: PAL.ink });
      t.x = Math.round(b.x - t.textWidth / 2);
      t.y = Math.round(b.y - (b.r < 20 ? 2 : 3));
      this.labels.addChild(t);
    }
    const hint = this.mode === 'sub' ? 'ROLL THE STICK' : this.mode === 'down' ? 'ALTERNATE LEFT / RIGHT' : '';
    // under the arena's submission bar / GET UP! meter
    if (hint) this.labels.addChild(text(hint, 0, this.mode === 'sub' ? 41 : 98, { small: true, color: PAL.gold, width: W, align: 'center', shadow: PAL.ink }));
  }

  private hit(x: number, y: number): 'stick' | TouchFightButton | null {
    // nearest button within reach (fat thumbs land between two)
    let best: TouchFightButton | null = null;
    let bestD = Infinity;
    for (const b of this.shown()) {
      const d = Math.hypot(x - b.x, y - b.y) - b.r;
      if (d <= 4 && d < bestD) {
        best = b.id;
        bestD = d;
      }
    }
    if (best) return best;
    if (this.mode === 'down') return null;
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
      this.fresh.add(h);
      try {
        navigator.vibrate?.(8);
      } catch {
        /* no haptics */
      }
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
    if (this.mode !== 'down') {
      const s = this.layout.stick;
      const cx = this.stickPtr !== null ? this.stickOrigin.x : s.x;
      const cy = this.stickPtr !== null ? this.stickOrigin.y : s.y;
      pixelCircle(g, Math.round(cx), Math.round(cy), s.r, PAL.night, 0.5);
      pixelCircle(g, Math.round(cx), Math.round(cy), s.r - 2, 0x000000, 0.25);
      pixelCircle(g, Math.round(cx + this.st.stick.x * s.r * 0.7), Math.round(cy + this.st.stick.y * s.r * 0.7), 11, PAL.ash, 0.75);
    }
    for (const b of this.shown()) {
      const on = this.st.held.has(b.id);
      pixelCircle(g, b.x, b.y + 1, b.r, 0x000000, 0.4);
      pixelCircle(g, b.x, b.y + (on ? 1 : 0), b.r, b.color, on ? 0.95 : 0.7);
    }
  }
}
