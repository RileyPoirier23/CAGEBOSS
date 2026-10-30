/* UNIVERSE CLASH - the camera and the splatter.
   The sim runs at a fixed 60 Hz. This file renders at whatever the display
   gives us, interpolating between the last two simulated positions. All
   particles and camera shake live here, never in MatchState.

   Three impact-frame tiers (Crack / Shatter / Break), the finisher
   cinematics, the KO comic panel, the Universe Clash stage blend and the
   training overlays were ported from Inkbreak. */

import type { CharId, Fighter, MatchEvent, MatchState, PoseName, StageDef } from './types';
import { charDef, moveOf } from './characters';
import { stageById } from './stages';
import { CHARGE_MAX, hitboxOf, hurtboxOf } from './sim';
import {
  ArtOpts,
  ScarMark,
  drawBurst,
  drawCharacter,
  drawFighter,
  drawInkSplash,
  drawItem,
  drawPlatforms,
  drawProjectile,
  drawScar,
  drawStageBack,
  drawStageFront,
  drawSuperAura,
  drawTrap,
  rand,
  stageBackdrop,
  STAGE_X,
  STAGE_Y,
} from './art';

export interface RenderOpts {
  outline: number;
  shadow: number;
  pattern: boolean;
  blood: number;
  particles: number;
  /** 0 off, 1 Crack only, 2 all three tiers. */
  impactFrames: number;
  shake: number;
  lite: boolean;
  /** Backing-store multiplier. 1 = native resolution, 0.6 = cheaper. */
  resolutionScale: number;
  /** Blood that lands stays on the stage for the whole set. */
  persistentScars: boolean;
}

export const DEFAULT_RENDER: RenderOpts = {
  outline: 2,
  shadow: 0.34,
  pattern: true,
  blood: 1,
  particles: 1,
  impactFrames: 2,
  shake: 1,
  lite: false,
  resolutionScale: 1,
  persistentScars: false,
};

/** What the app layers on top of the match: training tools, the ghost, net stats. */
export interface RenderExtras {
  training?: { hitboxes: boolean; frameData: boolean; dodgeViz: boolean };
  ghost?: Fighter | null;
  names?: [string, string];
  /** Spectator Canvas line, drawn along the bottom. */
  spectator?: string | null;
}

/* The per-universe look, keyed by the art pattern a character carries. */
export type Treatment = 'none' | 'pixel' | 'oldink' | 'noir' | 'toon' | 'grit' | 'hive' | 'glitch';

export function treatmentOf(id: CharId): Treatment {
  const p = charDef(id).art.pattern ?? 'none';
  switch (p) {
    case 'pixel': return 'pixel';
    case 'sepia': return 'oldink';
    case 'noir': return 'noir';
    case 'toon': return 'toon';
    case 'military': return 'grit';
    case 'organic': return 'hive';
    case 'glitch': return 'glitch';
    default: return 'none';
  }
}

interface Particle {
  x: number;
  y: number;
  vx: number;
  vy: number;
  life: number;
  maxLife: number;
  size: number;
  color: string;
  kind: 'blood' | 'dust' | 'spark' | 'paper' | 'ember' | 'hex' | 'brush';
  grav: number;
  spin: number;
  text?: string;
}

interface FloatText {
  x: number;
  y: number;
  vy: number;
  life: number;
  maxLife: number;
  text: string;
  color: string;
  size: number;
  stroke: string;
}

interface Ring {
  x: number;
  y: number;
  radius: number;
  life: number;
  maxLife: number;
  color: string;
  width: number;
}

interface Impact {
  tier: number;
  ticks: number;
  max: number;
  x: number;
  y: number;
  seed: number;
  text: string;
  color: string;
  /** attacker / victim sides for the Break panel */
  a: 0 | 1;
  b: 0 | 1;
  finisher: boolean;
}

interface KoPanel {
  ticks: number;
  text: string;
  sub: string;
  side: 0 | 1;
}

interface Camera {
  x: number;
  y: number;
  zoom: number;
  tx: number;
  ty: number;
  tzoom: number;
  shakeX: number;
  shakeY: number;
  shake: number;
}

interface DrawnFighter {
  f: Fighter;
  x: number;
  y: number;
}

const FLOOR_Y = 650;

export class ClashRenderer {
  readonly canvas: HTMLCanvasElement;
  private ctx: CanvasRenderingContext2D;
  private w = 1;
  private h = 1;
  private dpr = 1;
  private cam: Camera = { x: 800, y: 470, zoom: 1, tx: 800, ty: 470, tzoom: 1, shakeX: 0, shakeY: 0, shake: 0 };
  private particles: Particle[] = [];
  private floats: FloatText[] = [];
  private rings: Ring[] = [];
  private impacts: Impact[] = [];
  private scars: ScarMark[] = [];
  private opts: RenderOpts = { ...DEFAULT_RENDER };
  private lastNow = 0;
  private time = 0;
  private flash = 0;
  private desat = 0;
  private koPanel: KoPanel | null = null;
  private backdropWarm = new Set<string>();
  /** Offscreen canvases: silhouettes for the impact frames, the blended backdrop. */
  private off: HTMLCanvasElement;
  private blend: HTMLCanvasElement;
  private blendKey = '';
  private noise: HTMLCanvasElement;
  private drawn: DrawnFighter[] = [];
  private worldK = 1;
  private worldSX = 0;
  private worldSY = 0;

  constructor(canvas: HTMLCanvasElement) {
    this.canvas = canvas;
    const ctx = canvas.getContext('2d', { alpha: false });
    if (!ctx) throw new Error('2D canvas unavailable');
    this.ctx = ctx;
    this.off = document.createElement('canvas');
    this.blend = document.createElement('canvas');
    this.noise = document.createElement('canvas');
    this.buildNoise();
    this.resize();
  }

  private buildNoise(): void {
    this.noise.width = 128;
    this.noise.height = 128;
    const c = this.noise.getContext('2d');
    if (!c) return;
    const img = c.createImageData(128, 128);
    for (let i = 0; i < img.data.length; i += 4) {
      const v = 90 + rand(i, 7) * 120;
      img.data[i] = img.data[i + 1] = img.data[i + 2] = v;
      img.data[i + 3] = 255;
    }
    c.putImageData(img, 0, 0);
  }

  setOptions(opts: Partial<RenderOpts>): void {
    this.opts = { ...this.opts, ...opts };
    if (this.opts.impactFrames <= 0) this.impacts = [];
  }

  getOptions(): RenderOpts {
    return { ...this.opts };
  }

  setScars(scars: ScarMark[]): void {
    this.scars = scars.slice(-60);
  }

  getScars(): ScarMark[] {
    return this.scars;
  }

  clearScars(): void {
    this.scars = [];
  }

  resize(): void {
    const scale = Math.max(0.35, Math.min(2, this.opts.resolutionScale));
    const dpr = Math.min(2, (window.devicePixelRatio || 1) * scale);
    const rect = this.canvas.getBoundingClientRect();
    const w = Math.max(320, Math.round(rect.width || window.innerWidth));
    const h = Math.max(200, Math.round(rect.height || window.innerHeight));
    this.dpr = dpr;
    this.w = w;
    this.h = h;
    this.canvas.width = Math.round(w * dpr);
    this.canvas.height = Math.round(h * dpr);
    this.ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    this.ctx.imageSmoothingEnabled = true;
    this.off.width = this.canvas.width;
    this.off.height = this.canvas.height;
    this.blendKey = '';
  }

  /** Give the renderer a stage's backdrop ahead of the first frame. */
  warm(stage: StageDef): void {
    if (this.backdropWarm.has(stage.id)) return;
    this.backdropWarm.add(stage.id);
    void stage;
  }

  /* ---------------------------------------------------------------- events -- */

  addEvent(e: MatchEvent, m: MatchState): void {
    const char = e.char ? charDef(e.char) : null;
    const color = e.color ?? (char ? charDef(e.char!).art.accent : '#d8242c');
    if (e.type === 'hit' || e.type === 'perfect' || e.type === 'clash' || e.type === 'shield') {
      const tier = e.tier ?? 0;
      const x = e.x ?? 800;
      const y = e.y ?? 550;
      if (e.type === 'hit') {
        const scale = 1 + Math.min(1.3, (e.value ?? 6) / 18);
        this.burst(x, y, e.seed ?? 1, color, tier, scale, e.char ?? null);
        this.pushImpact(tier, x, y, e.seed ?? 1, e.text ?? '', color, e.side ?? 0, e.other ?? 1, false);
        if (e.value) {
          this.floats.push({
            x, y: y - 12, vy: -1.1, life: 42, maxLife: 42,
            text: String(Math.round(e.value)),
            color: tier >= 2 ? '#f7c948' : '#efe6d2',
            size: tier >= 3 ? 42 : tier === 2 ? 32 : 22,
            stroke: '#12100f',
          });
        }
      } else {
        this.burst(x, y, e.seed ?? 1, e.type === 'perfect' ? '#f7c948' : e.type === 'clash' ? '#ffffff' : '#31d3d9', 1, 0.9, null);
        this.rings.push({ x, y, radius: 12, life: 24, maxLife: 24, color: e.type === 'perfect' ? '#f7c948' : '#21d7e8', width: 5 });
        this.cam.shake = Math.max(this.cam.shake, 6 * this.opts.shake);
        if (e.text) {
          this.floats.push({
            x, y: y - 16, vy: -0.8, life: 50, maxLife: 50,
            text: e.text, color: '#f7c948', size: 16, stroke: '#12100f',
          });
        }
      }
    } else if (e.type === 'blood') {
      if (this.opts.blood <= 0) return;
      const victim = e.side !== undefined ? charDef(m.fighters[e.side].char) : null;
      const bloodColor = victim ? bloodOf(victim.id) : '#8f1218';
      const n = Math.round((6 + Math.min(14, (e.value ?? 6) * 0.6)) * this.opts.blood);
      for (let i = 0; i < n; i++) {
        const a = rand(e.seed ?? 1, i) * Math.PI * 2;
        const s = 1.6 + rand((e.seed ?? 1) + 1, i) * 5.2;
        this.particles.push({
          x: e.x ?? 800, y: e.y ?? 550,
          vx: (e.vx ?? 0) * 0.6 + Math.cos(a) * s,
          vy: (e.vy ?? 0) * 0.6 + Math.sin(a) * s - 1.5,
          life: 55 + rand((e.seed ?? 1) + 2, i) * 40,
          maxLife: 90,
          size: 1.6 + rand((e.seed ?? 1) + 3, i) * 4.2,
          color: i % 5 === 0 ? '#d8242c' : bloodColor,
          kind: 'blood',
          grav: 0.32,
          spin: 0,
        });
      }
    } else if (e.type === 'land') {
      const n = Math.round(4 * this.opts.particles);
      for (let i = 0; i < n; i++) {
        const a = -Math.PI / 2 + (rand(e.seed ?? 1, i) - 0.5) * 2.2;
        this.particles.push({
          x: (e.x ?? 800) + (rand((e.seed ?? 1) + 4, i) - 0.5) * 30,
          y: (e.y ?? 650) - 2,
          vx: Math.cos(a) * (1 + rand((e.seed ?? 1) + 5, i) * 2),
          vy: Math.sin(a) * (0.5 + rand((e.seed ?? 1) + 6, i)),
          life: 22 + rand((e.seed ?? 1) + 7, i) * 16,
          maxLife: 38,
          size: 2 + rand((e.seed ?? 1) + 8, i) * 4,
          color: '#cbb995',
          kind: 'dust',
          grav: 0.02,
          spin: 0,
        });
      }
    } else if (e.type === 'dodge' || e.type === 'gc' || e.type === 'chase') {
      this.rings.push({ x: e.x ?? 800, y: e.y ?? 550, radius: 10, life: 16, maxLife: 16, color: '#21d7e8', width: 3 });
    } else if (e.type === 'super' || e.type === 'comeback') {
      const f = e.side !== undefined ? m.fighters[e.side] : m.fighters[0];
      this.flash = Math.max(this.flash, 0.55);
      this.cam.shake = Math.max(this.cam.shake, 12 * this.opts.shake);
      if (f) {
        this.rings.push({ x: f.x, y: f.y - 70, radius: 30, life: 40, maxLife: 40, color: '#f7c948', width: 8 });
        for (let i = 0; i < 22; i++) {
          const a = rand(e.seed ?? 1, i) * Math.PI * 2;
          this.particles.push({
            x: f.x, y: f.y - 70,
            vx: Math.cos(a) * (3 + rand((e.seed ?? 1) + 1, i) * 5),
            vy: Math.sin(a) * (3 + rand((e.seed ?? 1) + 2, i) * 5),
            life: 30 + rand((e.seed ?? 1) + 3, i) * 30,
            maxLife: 60,
            size: 2 + rand((e.seed ?? 1) + 4, i) * 4,
            color: i % 2 === 0 ? '#f7c948' : charDef(f.char).art.accent,
            kind: 'spark',
            grav: 0.04,
            spin: 0,
          });
        }
      }
    } else if (e.type === 'finisher') {
      this.flash = 1;
      this.cam.shake = Math.max(this.cam.shake, 26 * this.opts.shake);
      this.pushImpact(3, e.x ?? 800, e.y ?? 500, e.seed ?? 1, e.text ?? 'FINISHER', '#d8242c', e.side ?? 0, e.other ?? 1, true);
      this.rings.push({ x: e.x ?? 800, y: e.y ?? 500, radius: 40, life: 70, maxLife: 70, color: '#ffffff', width: 12 });
      for (let i = 0; i < 40; i++) {
        const a = rand(e.seed ?? 1, i) * Math.PI * 2;
        this.particles.push({
          x: e.x ?? 800, y: e.y ?? 500,
          vx: Math.cos(a) * (4 + rand((e.seed ?? 1) + 1, i) * 9),
          vy: Math.sin(a) * (4 + rand((e.seed ?? 1) + 2, i) * 9),
          life: 40 + rand((e.seed ?? 1) + 3, i) * 50,
          maxLife: 90,
          size: 2 + rand((e.seed ?? 1) + 4, i) * 5,
          color: i % 3 === 0 ? '#d8242c' : i % 3 === 1 ? '#f7c948' : '#efe6d2',
          kind: 'paper',
          grav: 0.06,
          spin: rand((e.seed ?? 1) + 9, i) * 0.3,
        });
      }
    } else if (e.type === 'ringout' || e.type === 'ko') {
      this.cam.shake = Math.max(this.cam.shake, 16 * this.opts.shake);
      this.flash = Math.max(this.flash, 0.35);
      this.rings.push({ x: e.x ?? 800, y: e.y ?? 600, radius: 30, life: 40, maxLife: 40, color: '#d8242c', width: 8 });
      if (e.type === 'ringout') {
        this.scars.push({ x: e.x ?? 800, y: FLOOR_Y, seed: e.seed ?? 1, kind: 'crack', theme: m.stageId });
        this.pushImpact(2, e.x ?? 800, e.y ?? 600, e.seed ?? 1, 'RING OUT', '#d8242c', e.other ?? 0, e.side ?? 1, false);
        this.koPanel = { ticks: 36, text: 'RING OUT', sub: 'BLAST ZONE', side: e.side ?? 1 };
      } else if (m.phase !== 'finisher') {
        this.koPanel = { ticks: 36, text: 'K.O.', sub: (e.text ?? '').toUpperCase(), side: e.side ?? 1 };
      }
    } else if (e.type === 'scar') {
      const stage = stageById(m.stageId);
      const kind = e.value === 2 ? 'blood' : e.value === 3 ? 'burn' : 'crack';
      this.scars.push({
        x: e.x ?? 800,
        y: Math.min(FLOOR_Y, e.y ?? FLOOR_Y),
        seed: e.seed ?? 1,
        kind: kind as ScarMark['kind'],
        theme: stage.theme,
      });
      if (this.scars.length > 60) this.scars.splice(0, this.scars.length - 60);
    } else if (e.type === 'burnout' || e.type === 'burst') {
      this.burst(e.x ?? 800, e.y ?? 500, e.seed ?? 1, '#d8242c', 1, 1.2, null);
      this.cam.shake = Math.max(this.cam.shake, 8 * this.opts.shake);
    } else if (e.type === 'impact' || e.type === 'throw') {
      this.burst(e.x ?? 800, e.y ?? 500, e.seed ?? 1, '#f7c948', 0, 0.8, null);
    }
  }

  private pushImpact(tier: number, x: number, y: number, seed: number, text: string, color: string, a: 0 | 1, b: 0 | 1, finisher: boolean): void {
    if (tier <= 0 || this.opts.impactFrames <= 0) return;
    if (this.opts.impactFrames === 1 && tier > 1) tier = 1;
    const max = tier >= 3 ? 4 : tier === 2 ? 3 : 2;
    this.impacts.push({ tier, ticks: max, max, x, y, seed, text, color, a, b, finisher });
    if (tier >= 2) this.desat = 20;
    this.cam.shake = Math.max(this.cam.shake, (tier >= 3 ? 22 : tier === 2 ? 16 : 10) * this.opts.shake);
  }

  private burst(x: number, y: number, seed: number, color: string, tier: number, scale: number, who: CharId | null): void {
    if (this.opts.particles <= 0) return;
    const treat = who ? treatmentOf(who) : 'none';
    const n = Math.round((4 + tier * 6) * this.opts.particles);
    for (let i = 0; i < n; i++) {
      const a = rand(seed, i) * Math.PI * 2;
      const speed = (1.5 + rand(seed + 1, i) * 5) * scale;
      this.particles.push({
        x, y,
        vx: Math.cos(a) * speed,
        vy: Math.sin(a) * speed - 1,
        life: 18 + rand(seed + 2, i) * 26,
        maxLife: 44,
        size: (1.4 + rand(seed + 3, i) * 4) * scale,
        color: i % 4 === 0 ? '#12100f' : i % 4 === 1 ? '#efe6d2' : color,
        kind: treat === 'glitch' ? 'hex' : treat === 'oldink' ? 'brush' : 'spark',
        grav: 0.18,
        spin: 0,
        text: treat === 'glitch' ? ((rand(seed + 4, i) * 65535) | 0).toString(16).toUpperCase().padStart(4, '0') : undefined,
      });
    }
    this.rings.push({ x, y, radius: 8 * scale, life: 16 + tier * 4, maxLife: 16 + tier * 4, color, width: 2 + tier * 2 });
  }

  /* ---------------------------------------------------------------- frame --- */

  /** Draw one display frame. `alpha` is the interpolation between the last ticks. */
  render(m: MatchState, alpha: number, now: number, extras: RenderExtras = {}): void {
    const dt = this.lastNow ? Math.min(0.05, (now - this.lastNow) / 1000) : 1 / 60;
    this.lastNow = now;
    this.time += dt;
    const ctx = this.ctx;
    const w = this.w;
    const h = this.h;
    ctx.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
    ctx.fillStyle = '#12100f';
    ctx.fillRect(0, 0, w, h);

    const stage = stageById(m.stageId);
    this.updateCamera(m, alpha, dt);
    const k = Math.min(w / 1600, h / 900) * this.cam.zoom;
    const shakeX = this.cam.shakeX * this.opts.shake;
    const shakeY = this.cam.shakeY * this.opts.shake;
    this.worldK = k;
    this.worldSX = w / 2 + shakeX;
    this.worldSY = h / 2 + shakeY;

    ctx.save();
    this.worldTransform(ctx);

    const artOpts: ArtOpts = {
      outline: Math.max(0, this.opts.outline),
      shadow: this.opts.shadow,
      pattern: this.opts.pattern,
      lite: this.opts.lite,
    };
    this.drawBackdrop(ctx, m, stage);
    drawPlatforms(ctx, m, stage, m.tick, artOpts);
    for (const scar of this.scars) drawScar(ctx, scar, m.tick);
    for (const item of m.items) drawItem(ctx, item, m.tick, artOpts);
    for (const trap of m.traps) drawTrap(ctx, trap, m.tick, artOpts);

    const items = m.items.filter((i) => i.heldBy >= 0);
    const fighters = [...m.fighters].sort((a, b) => a.y - b.y);
    this.drawn = [];
    for (const f of fighters) {
      const ix = f.px + (f.x - f.px) * alpha;
      const iy = f.py + (f.y - f.py) * alpha;
      this.drawn.push({ f, x: ix, y: iy });
    }
    if (m.phase === 'finisher' && m.finisher) {
      ctx.restore();
      this.drawFinisher(ctx, m, artOpts, w, h);
      this.drawFloats(ctx, k, shakeX, shakeY);
      this.drawFlash(ctx, w, h, dt);
      this.drawLetterbox(ctx, w, h);
      return;
    }
    if (extras.ghost) {
      ctx.save();
      ctx.globalAlpha = 0.3;
      drawFighter(ctx, { ...extras.ghost, flash: 0 }, { ...artOpts, tick: m.tick, held: null });
      ctx.restore();
    }
    for (const d of this.drawn) {
      const f = d.f;
      if (f.state === 'super') {
        ctx.save();
        drawSuperAura(ctx, { ...f, x: d.x, y: d.y }, m.tick, charDef(f.char).art.accent);
        ctx.restore();
      }
      const ghost = this.ghostFor(f);
      if (ghost) {
        ctx.save();
        ctx.globalAlpha = 0.18;
        drawFighter(ctx, { ...f, x: d.x - f.facing * 18, y: d.y, flash: 0 }, { ...artOpts, tick: m.tick, held: null });
        ctx.restore();
      }
      if (f.state === 'attack' && f.move === 'super' && f.char === 'mireille') {
        // Nine Afterimages: eight copies of one mistake.
        for (let i = 0; i < 8; i++) {
          ctx.save();
          ctx.globalAlpha = 0.28;
          drawFighter(ctx, { ...f, x: d.x + (i - 4) * 60, y: d.y, flash: 0 }, { ...artOpts, tick: m.tick + i * 3, held: null });
          ctx.restore();
        }
      }
      // Every rig draw is fenced: a transform that leaks out of one fighter would move the next.
      ctx.save();
      drawFighter(
        ctx,
        { ...f, x: d.x, y: d.y },
        { ...artOpts, tick: m.tick, held: items.find((i) => i.heldBy === f.side)?.kind ?? null },
      );
      ctx.restore();
      this.drawFighterTags(ctx, f, d.x, d.y, m);
    }
    for (const p of m.projectiles) drawProjectile(ctx, p, m.tick, artOpts);
    this.drawParticles(ctx, dt, m);
    drawStageFront(ctx, stage, m.tick, artOpts);
    if (extras.training) this.drawTraining(ctx, m, extras.training);
    ctx.restore();

    // Floating text is screen space so it stays legible under camera zoom.
    this.drawFloats(ctx, k, shakeX, shakeY);
    if (this.desat > 0) {
      ctx.save();
      ctx.globalCompositeOperation = 'saturation';
      ctx.fillStyle = `rgba(128,128,128,${Math.min(1, this.desat / 20)})`;
      ctx.fillRect(0, 0, w, h);
      ctx.restore();
      this.desat = Math.max(0, this.desat - dt * 60);
    }
    this.drawImpact(ctx, m, w, h, artOpts);
    this.drawKoPanel(ctx, m, w, h, extras.names);
    if (extras.training?.frameData) this.drawFrameData(ctx, m, w, h);
    if (extras.spectator) {
      ctx.save();
      ctx.font = `bold ${Math.round(h * 0.02)}px Impact, "Arial Black", sans-serif`;
      ctx.fillStyle = '#f7c948';
      ctx.textAlign = 'center';
      ctx.fillText('SPECTATOR CANVAS // ' + extras.spectator.toUpperCase(), w / 2, h - 16);
      ctx.restore();
    }
    this.drawFlash(ctx, w, h, dt);
    this.drawLetterbox(ctx, w, h);
  }

  private worldTransform(ctx: CanvasRenderingContext2D): void {
    ctx.translate(this.worldSX, this.worldSY);
    ctx.scale(this.worldK, this.worldK);
    ctx.translate(-this.cam.x, -this.cam.y);
  }

  private drawFlash(ctx: CanvasRenderingContext2D, w: number, h: number, dt: number): void {
    if (this.flash > 0) {
      ctx.globalAlpha = Math.min(0.8, this.flash);
      ctx.fillStyle = '#fff7e6';
      ctx.fillRect(0, 0, w, h);
      ctx.globalAlpha = 1;
      this.flash = Math.max(0, this.flash - dt * 3.2);
    }
  }

  private drawLetterbox(ctx: CanvasRenderingContext2D, w: number, h: number): void {
    // Letterbox bars keep the 16:9 arena honest on odd screens.
    const aspect = w / h;
    if (aspect > 16 / 9 + 0.05) {
      const bar = (w - h * (16 / 9)) / 2;
      ctx.fillStyle = '#12100f';
      ctx.fillRect(0, 0, bar, h);
      ctx.fillRect(w - bar, 0, bar, h);
    } else if (aspect < 16 / 9 - 0.05) {
      const bar = (h - w / (16 / 9)) / 2;
      ctx.fillStyle = '#12100f';
      ctx.fillRect(0, 0, w, bar);
      ctx.fillRect(0, h - bar, w, bar);
    }
  }

  /* ---------------------------------------------------------- stage blend --- */

  /** Universe Clash: a foreign fighter's treatment bleeds into the stage backdrop. */
  private drawBackdrop(ctx: CanvasRenderingContext2D, m: MatchState, stage: StageDef): void {
    const a = charDef(m.fighters[0].char).universe;
    const b = charDef(m.fighters[1].char).universe;
    const foreign = a !== b ? (a !== stage.universe ? m.fighters[0].char : b !== stage.universe ? m.fighters[1].char : null) : null;
    const treat: Treatment = foreign ? treatmentOf(foreign) : 'none';
    // Parallax: the backdrop drifts a little slower than the platforms so the
    // skyline sits behind the fight instead of on it.
    ctx.save();
    ctx.translate((this.cam.x - 800) * 0.16, (this.cam.y - 470) * 0.1);
    if (treat === 'none') {
      drawStageBack(ctx, stage);
      ctx.restore();
      return;
    }
    // The blended backdrop is cached in stage space per stage / treatment, so
    // the camera pans and zooms across it like the plain one. Glitch re-slices
    // itself every few frames.
    const key = `${stage.id}|${treat}|${treat === 'glitch' ? Math.floor(this.time * 6) : 0}`;
    if (this.blendKey !== key) {
      this.blendKey = key;
      const base = stageBackdrop(stage);
      this.blend.width = base.width;
      this.blend.height = base.height;
      const g = this.blend.getContext('2d');
      if (!g) {
        ctx.restore();
        return;
      }
      g.setTransform(1, 0, 0, 1, 0, 0);
      g.drawImage(base, 0, 0);
      this.applyTreatment(g, this.blend, treat, base.width, base.height);
    }
    ctx.drawImage(this.blend, STAGE_X, STAGE_Y);
    ctx.restore();
  }

  private applyTreatment(g: CanvasRenderingContext2D, c: HTMLCanvasElement, treat: Treatment, W: number, H: number): void {
    // Works in the canvas's own pixel space (stage space for the backdrop).
    g.save();
    g.setTransform(1, 0, 0, 1, 0, 0);
    const wash = (op: GlobalCompositeOperation, color: string, alpha = 1) => {
      g.globalCompositeOperation = op;
      g.globalAlpha = alpha;
      g.fillStyle = color;
      g.fillRect(0, 0, W, H);
      g.globalAlpha = 1;
      g.globalCompositeOperation = 'source-over';
    };
    if (treat === 'pixel') {
      const t2 = document.createElement('canvas');
      t2.width = Math.ceil(W / 8);
      t2.height = Math.ceil(H / 8);
      const tc = t2.getContext('2d');
      if (tc) {
        tc.drawImage(c, 0, 0, t2.width, t2.height);
        g.imageSmoothingEnabled = false;
        g.drawImage(t2, 0, 0, W, H);
        g.imageSmoothingEnabled = true;
      }
      // Crush to a short palette: posterise the luminance with a scanline wash.
      for (let y = 0; y < H; y += 4) {
        g.fillStyle = 'rgba(0,0,0,0.16)';
        g.fillRect(0, y, W, 1);
      }
    } else if (treat === 'oldink') {
      // Washed sepia: pull the colour out, tint the greys, then lay paper over it.
      wash('saturation', '#7a6a50');
      wash('color', '#a8803f', 0.55);
      wash('multiply', '#e7d4ad', 0.9);
      g.globalAlpha = 0.16;
      g.globalCompositeOperation = 'multiply';
      for (let y = 0; y < H; y += 128) for (let x = 0; x < W; x += 128) g.drawImage(this.noise, x, y);
      g.globalAlpha = 1;
      g.globalCompositeOperation = 'source-over';
      // Brush edge: a ragged ink border that reads as a scroll.
      g.fillStyle = 'rgba(40,24,8,0.5)';
      for (let i = 0; i < 40; i++) {
        const t = i / 40;
        g.fillRect(0, t * H, 14 + rand(i, 3) * 26, H / 40 + 1);
        g.fillRect(W - 14 - rand(i, 4) * 26, t * H, 40, H / 40 + 1);
      }
    } else if (treat === 'noir') {
      // Mignola: no colour, two values, black shapes cut across the set.
      wash('saturation', '#888');
      wash('multiply', '#5a5a66', 0.6);
      g.fillStyle = '#07060a';
      for (let i = 0; i < 7; i++) {
        const x0 = (i * W) / 6 + rand(i, 11) * 90;
        g.beginPath();
        g.moveTo(x0, 0);
        g.lineTo(x0 + 140 + rand(i, 12) * 80, 0);
        g.lineTo(x0 + 30 + rand(i, 13) * 60, H);
        g.lineTo(x0 - 60, H);
        g.fill();
      }
      wash('overlay', '#2b1e3a', 0.35);
    } else if (treat === 'toon') {
      // Saturday morning: everything louder, a warm key light, outlines softened.
      wash('saturation', '#ff0040', 0.55);
      wash('overlay', '#ffd166', 0.3);
      wash('screen', '#ffb3c6', 0.08);
    } else if (treat === 'grit') {
      g.globalAlpha = 0.4;
      g.globalCompositeOperation = 'multiply';
      for (let y = 0; y < H; y += 128) for (let x = 0; x < W; x += 128) g.drawImage(this.noise, x, y);
      g.globalAlpha = 1;
      g.globalCompositeOperation = 'source-over';
      wash('saturation', '#6b705c', 0.7);
      wash('multiply', '#8b8f78', 0.45);
    } else if (treat === 'hive') {
      // Oily iridescence: hue bands that slide across the set.
      for (let i = 0; i < 9; i++) {
        g.globalCompositeOperation = 'overlay';
        g.fillStyle = `hsla(${(i * 40 + 200) % 360} 90% 55% / 0.35)`;
        g.beginPath();
        g.moveTo(0, (i * H) / 8 - 80);
        g.lineTo(W, (i * H) / 8 + 60);
        g.lineTo(W, ((i + 1) * H) / 8 + 60);
        g.lineTo(0, ((i + 1) * H) / 8 - 80);
        g.fill();
      }
      g.globalCompositeOperation = 'source-over';
      wash('multiply', '#3b2a4a', 0.4);
    } else if (treat === 'glitch') {
      for (let i = 0; i < 14; i++) {
        const y = rand(i, Math.floor(this.time * 6)) * H;
        const hh = 6 + rand(i + 50, Math.floor(this.time * 6)) * 40;
        g.drawImage(c, 0, y, c.width, hh, (rand(i + 90, 1) - 0.5) * 90, y, W, hh);
      }
      wash('screen', '#00ffcc', 0.08);
      wash('difference', '#ff00aa', 0.06);
    }
    g.restore();
  }

  /* --------------------------------------------------------------- fighters -- */

  private ghostFor(f: Fighter): boolean {
    if (f.state === 'attack' && f.moveFrame > 0 && f.moveFrame < 8) return true;
    if (f.state === 'dodge' && f.stateTicks < 4) return true;
    if (f.state === 'hitstun' && f.hitstun > 30) return true;
    return false;
  }

  /** Small world-space tags: armour ring, confuse timer, parry window, full charge. */
  private drawFighterTags(ctx: CanvasRenderingContext2D, f: Fighter, x: number, y: number, m: MatchState): void {
    void m;
    const armored = f.armorStock > 0 || (f.state === 'attack' && f.move !== null && moveOf(f.char, f.move).armor && f.moveFrame < moveOf(f.char, f.move).startup + moveOf(f.char, f.move).active);
    if (armored) {
      ctx.save();
      ctx.strokeStyle = f.armorStock > 0 ? '#ffe24a' : '#ffb000';
      ctx.lineWidth = 3;
      ctx.setLineDash([8, 6]);
      ctx.beginPath();
      ctx.arc(x, y - 70, 70, 0, Math.PI * 2);
      ctx.stroke();
      ctx.restore();
    }
    if (f.confuse > 0) {
      ctx.save();
      ctx.fillStyle = '#29f0ff';
      ctx.font = 'bold 16px "Cascadia Mono", Consolas, monospace';
      ctx.textAlign = 'center';
      ctx.fillText('L<->R ' + (f.confuse / 60).toFixed(1), x, y - 165);
      ctx.restore();
    }
    if (f.state === 'parry' && f.parryTicks <= 6) {
      ctx.save();
      ctx.strokeStyle = '#3ee6a0';
      ctx.lineWidth = 4;
      ctx.beginPath();
      ctx.arc(x + f.facing * 30, y - 80, 32, 0, Math.PI * 2);
      ctx.stroke();
      ctx.restore();
    }
    if (f.charging && f.charge >= CHARGE_MAX) {
      ctx.save();
      ctx.strokeStyle = '#ffffff';
      ctx.lineWidth = 3;
      ctx.beginPath();
      ctx.arc(x, y - 72, 80 + Math.sin(this.time * 20) * 6, 0, Math.PI * 2);
      ctx.stroke();
      ctx.restore();
    }
  }

  /** Draw every fighter as a flat silhouette in `color`, screen space. */
  private silhouettes(ctx: CanvasRenderingContext2D, color: string, artOpts: ArtOpts, tick: number, scale = 1, squash?: { side: 0 | 1; sx: number; sy: number }): void {
    const off = this.off;
    const o = off.getContext('2d');
    if (!o) return;
    o.setTransform(1, 0, 0, 1, 0, 0);
    o.clearRect(0, 0, off.width, off.height);
    o.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
    o.translate(this.worldSX, this.worldSY);
    o.scale(this.worldK * scale, this.worldK * scale);
    o.translate(-this.cam.x, -this.cam.y);
    for (const d of this.drawn) {
      o.save();
      if (squash && d.f.side === squash.side) {
        o.translate(d.x, d.y);
        o.scale(squash.sx, squash.sy);
        o.translate(-d.x, -d.y);
      }
      drawFighter(o, { ...d.f, x: d.x, y: d.y, flash: 0 }, { ...artOpts, outline: 0, tick, held: null });
      o.restore();
    }
    o.setTransform(1, 0, 0, 1, 0, 0);
    o.globalCompositeOperation = 'source-in';
    o.fillStyle = color;
    o.fillRect(0, 0, off.width, off.height);
    o.globalCompositeOperation = 'source-over';
    ctx.save();
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.drawImage(off, 0, 0);
    ctx.restore();
  }

  /* ----------------------------------------------------------------- camera -- */

  private updateCamera(m: MatchState, alpha: number, dt: number): void {
    const f0 = m.fighters[0];
    const f1 = m.fighters[1];
    const x0 = f0.px + (f0.x - f0.px) * alpha;
    const x1 = f1.px + (f1.x - f1.px) * alpha;
    const y0 = f0.py + (f0.y - f0.py) * alpha;
    const y1 = f1.py + (f1.y - f1.py) * alpha;
    let midX = (x0 + x1) / 2;
    let midY = (y0 + y1) / 2 - 60;
    const spreadX = Math.abs(x0 - x1);
    const spreadY = Math.abs(y0 - y1);
    let wantZoom = 1.3;

    if (m.phase === 'intro') {
      const p = 1 - Math.max(0, m.introTicks) / 120;
      wantZoom = 1.5 - p * 0.2;
      midX = 800;
      midY = 470;
    } else if (m.phase === 'finisher' && m.finisher) {
      midX = m.finisher.x;
      midY = m.finisher.y - 90;
      wantZoom = 1.45;
    } else if (m.phase === 'ko') {
      wantZoom = 1.34;
    }
    if (m.dramatic > 0 && (m.dramaticSide === 0 || m.dramaticSide === 1)) {
      const f = m.fighters[m.dramaticSide];
      midX = f.x;
      midY = f.y - 90;
      wantZoom = 1.3;
    }
    if (m.phase !== 'finisher') {
      // Pull back only as far as it takes to keep both fighters on screen.
      if (spreadX > 520) wantZoom = Math.min(wantZoom, Math.max(0.82, 1.3 - (spreadX - 520) / 1400));
      if (spreadY > 240) wantZoom = Math.min(wantZoom, Math.max(0.86, 1.3 - (spreadY - 240) / 1200));
      if (midY < 300) midY += 40;
      const halfW = 800 / wantZoom;
      const minX = 300 + halfW * 0.55;
      const maxX = 1300 - halfW * 0.55;
      midX = minX <= maxX ? Math.max(minX, Math.min(maxX, midX)) : 800;
      midY = Math.max(320, Math.min(560, midY));
    }

    const cam = this.cam;
    cam.tx = midX;
    cam.ty = midY;
    cam.tzoom = wantZoom;
    const ease = 1 - Math.pow(0.002, dt);
    cam.x += (cam.tx - cam.x) * ease;
    cam.y += (cam.ty - cam.y) * ease;
    cam.zoom += (cam.tzoom - cam.zoom) * (1 - Math.pow(0.008, dt));

    cam.shake = Math.max(0, cam.shake - dt * 60);
    const s = cam.shake;
    cam.shakeX = s > 0.2 ? Math.sin(this.time * 83.1) * s + Math.sin(this.time * 47.7) * s * 0.4 : 0;
    cam.shakeY = s > 0.2 ? Math.cos(this.time * 71.3) * s * 0.8 : 0;
  }

  /* -------------------------------------------------------------- particles -- */

  private drawParticles(ctx: CanvasRenderingContext2D, dt: number, m: MatchState): void {
    const step = dt * 60;
    const main = m.platforms[0];
    for (let i = this.particles.length - 1; i >= 0; i--) {
      const p = this.particles[i];
      p.life -= step;
      p.x += p.vx * step;
      p.y += p.vy * step;
      p.vy += p.grav * step;
      p.vx *= 0.994;
      p.spin += 0.1 * step;
      if (p.life <= 0) {
        this.particles.splice(i, 1);
        continue;
      }
      // Blood that reaches the floor becomes a Stage Scar.
      if (p.kind === 'blood' && p.vy > 0 && p.y >= main.y - 2 && p.y <= main.y + 18 && p.x > main.x && p.x < main.x + main.w) {
        this.scars.push({ x: p.x, y: main.y, seed: (p.x * 13 + p.y * 7) | 0, kind: 'blood', theme: m.stageId });
        if (this.scars.length > 60) this.scars.splice(0, this.scars.length - 60);
        this.particles.splice(i, 1);
        continue;
      }
      const a = Math.min(1, p.life / Math.min(24, p.maxLife));
      ctx.save();
      ctx.globalAlpha = a;
      if (p.kind === 'blood') {
        ctx.fillStyle = p.color;
        ctx.beginPath();
        ctx.ellipse(p.x, p.y, p.size, p.size * 0.7, Math.atan2(p.vy, p.vx), 0, Math.PI * 2);
        ctx.fill();
      } else if (p.kind === 'paper') {
        ctx.translate(p.x, p.y);
        ctx.rotate(p.spin);
        ctx.fillStyle = p.color;
        ctx.fillRect(-p.size, -p.size * 0.6, p.size * 2, p.size * 1.2);
      } else if (p.kind === 'hex') {
        ctx.fillStyle = '#29f0ff';
        ctx.font = '11px "Cascadia Mono", Consolas, monospace';
        ctx.fillText(p.text ?? '0000', p.x, p.y);
      } else if (p.kind === 'brush') {
        ctx.strokeStyle = p.color;
        ctx.lineWidth = 3;
        ctx.beginPath();
        ctx.moveTo(p.x, p.y);
        ctx.lineTo(p.x - p.vx * 3, p.y - p.vy * 3);
        ctx.stroke();
      } else {
        ctx.fillStyle = p.color;
        ctx.globalAlpha = a * 0.8;
        ctx.beginPath();
        ctx.arc(p.x, p.y, p.size, 0, Math.PI * 2);
        ctx.fill();
      }
      ctx.restore();
    }
    for (let i = this.rings.length - 1; i >= 0; i--) {
      const r = this.rings[i];
      r.life -= step;
      r.radius += step * 4.5;
      if (r.life <= 0) {
        this.rings.splice(i, 1);
        continue;
      }
      ctx.save();
      ctx.globalAlpha = Math.min(0.8, r.life / r.maxLife);
      ctx.strokeStyle = r.color;
      ctx.lineWidth = Math.max(1, r.width * (r.life / r.maxLife));
      ctx.beginPath();
      ctx.arc(r.x, r.y, r.radius, 0, Math.PI * 2);
      ctx.stroke();
      ctx.restore();
    }
    if (this.particles.length > 700) this.particles.splice(0, this.particles.length - 700);
  }

  private drawFloats(ctx: CanvasRenderingContext2D, k: number, sx: number, sy: number): void {
    const w = this.w;
    const h = this.h;
    for (let i = this.floats.length - 1; i >= 0; i--) {
      const f = this.floats[i];
      f.life--;
      f.y += f.vy;
      if (f.life <= 0) {
        this.floats.splice(i, 1);
        continue;
      }
      const x = w / 2 + (f.x - this.cam.x) * k + sx;
      const y = h / 2 + (f.y - this.cam.y) * k + sy;
      const a = Math.min(1, f.life / 12);
      ctx.save();
      ctx.globalAlpha = a;
      ctx.font = `900 ${Math.max(10, f.size * k * 0.72)}px Impact, "Arial Black", sans-serif`;
      ctx.textAlign = 'center';
      ctx.lineWidth = 4;
      ctx.strokeStyle = f.stroke;
      ctx.strokeText(f.text, x, y);
      ctx.fillStyle = f.color;
      ctx.fillText(f.text, x, y);
      ctx.restore();
    }
  }

  /* ---------------------------------------------------------- impact frames -- */

  /** Crack / Shatter / Break. They never stack: the highest tier on screen wins. */
  private drawImpact(ctx: CanvasRenderingContext2D, m: MatchState, w: number, h: number, artOpts: ArtOpts): void {
    if (this.impacts.length === 0 || this.opts.impactFrames <= 0) return;
    const imp = this.impacts.slice().sort((a, b) => b.tier - a.tier)[0];
    const frame = imp.max - imp.ticks; // 0 .. max-1
    const k = this.worldK;
    const cx = this.worldSX + (imp.x - this.cam.x) * k;
    const cy = this.worldSY + (imp.y - this.cam.y) * k;

    ctx.save();
    if (imp.tier === 1) {
      // CRACK: one white frame, ink silhouettes, burst lines.
      ctx.fillStyle = '#ffffff';
      ctx.fillRect(0, 0, w, h);
      this.silhouettes(ctx, '#12100f', artOpts, m.tick);
      ctx.strokeStyle = '#12100f';
      ctx.lineWidth = 4 * k;
      ctx.beginPath();
      for (let i = 0; i < 18; i++) {
        const a = (i / 18) * Math.PI * 2 + rand(imp.seed, i) * 0.2;
        ctx.moveTo(cx + Math.cos(a) * 30 * k, cy + Math.sin(a) * 30 * k);
        ctx.lineTo(cx + Math.cos(a) * (120 + (i % 3) * 60) * k, cy + Math.sin(a) * (120 + (i % 3) * 60) * k);
      }
      ctx.stroke();
      ctx.fillStyle = '#ffffff';
      ctx.beginPath();
      ctx.arc(cx, cy, 34 * k, 0, Math.PI * 2);
      ctx.fill();
      ctx.stroke();
    } else if (imp.tier === 2) {
      // SHATTER: a negative frame, then charcoal force lines.
      if (frame === 0) {
        ctx.globalCompositeOperation = 'difference';
        ctx.fillStyle = '#ffffff';
        ctx.fillRect(0, 0, w, h);
        ctx.globalCompositeOperation = 'source-over';
      } else {
        ctx.fillStyle = '#1b1b1b';
        ctx.fillRect(0, 0, w, h);
        this.silhouettes(ctx, '#e8e8e8', artOpts, m.tick);
        ctx.strokeStyle = 'rgba(230,230,230,0.9)';
        ctx.lineWidth = 2;
        for (let i = 0; i < 70; i++) {
          const a = rand(imp.seed + frame, i) * Math.PI * 2;
          const r0 = (40 + rand(imp.seed + 1, i) * 60) * k;
          const r1 = r0 + (200 + rand(imp.seed + 2, i) * 500) * k;
          ctx.beginPath();
          ctx.moveTo(cx + Math.cos(a) * r0, cy + Math.sin(a) * r0);
          ctx.lineTo(cx + Math.cos(a) * r1 + (rand(imp.seed + 3, i) - 0.5) * 20, cy + Math.sin(a) * r1);
          ctx.stroke();
        }
        ctx.fillStyle = '#ffffff';
        ctx.beginPath();
        ctx.arc(cx, cy, 40 * k, 0, Math.PI * 2);
        ctx.fill();
      }
    } else {
      // BREAK: black burst, white squash, a one-panel comic in the attacker's style, a wipe.
      const atk = m.fighters[imp.a];
      const style = charDef(atk.char).breakStyle;
      if (frame === 0) {
        ctx.fillStyle = '#000000';
        ctx.fillRect(0, 0, w, h);
        this.silhouettes(ctx, '#ffffff', artOpts, m.tick);
        ctx.fillStyle = '#ffffff';
        ctx.beginPath();
        ctx.arc(cx, cy, 60 * k, 0, Math.PI * 2);
        ctx.fill();
      } else if (frame === 1) {
        ctx.fillStyle = '#ffffff';
        ctx.fillRect(0, 0, w, h);
        this.silhouettes(ctx, '#000000', artOpts, m.tick, 1.08, { side: imp.b, sx: 1.15, sy: 0.55 });
      } else if (frame === 2) {
        ctx.fillStyle = style.bg;
        ctx.fillRect(0, 0, w, h);
        ctx.save();
        ctx.translate(w / 2, h / 2);
        ctx.rotate(-0.04);
        ctx.translate(-w / 2, -h / 2);
        ctx.strokeStyle = style.ink;
        ctx.lineWidth = 10;
        ctx.strokeRect(w * 0.08, h * 0.1, w * 0.84, h * 0.8);
        ctx.fillStyle = style.ink;
        for (let y = h * 0.12; y < h * 0.9; y += 14) {
          for (let x = w * 0.1; x < w * 0.9; x += 14) {
            ctx.beginPath();
            ctx.arc(x, y, 2 + 2 * Math.abs(Math.sin(x * 0.01 + y * 0.013)), 0, Math.PI * 2);
            ctx.fill();
          }
        }
        ctx.save();
        ctx.translate(this.worldSX, this.worldSY);
        ctx.scale(k * 1.2, k * 1.2);
        ctx.translate(-this.cam.x, -this.cam.y);
        for (const d of this.drawn) drawFighter(ctx, { ...d.f, x: d.x, y: d.y, flash: 0 }, { ...artOpts, tick: m.tick, held: null });
        ctx.restore();
        ctx.font = `900 ${Math.round(h * 0.16)}px Impact, "Arial Black", sans-serif`;
        ctx.fillStyle = style.ink;
        ctx.strokeStyle = style.bg;
        ctx.lineWidth = 8;
        ctx.textAlign = 'center';
        ctx.strokeText(style.caption, w / 2, h * 0.3);
        ctx.fillText(style.caption, w / 2, h * 0.3);
        ctx.fillStyle = style.bg;
        ctx.fillRect(w * 0.1, h * 0.78, w * 0.5, h * 0.09);
        ctx.strokeStyle = style.ink;
        ctx.lineWidth = 4;
        ctx.strokeRect(w * 0.1, h * 0.78, w * 0.5, h * 0.09);
        ctx.fillStyle = style.ink;
        ctx.font = `bold ${Math.round(h * 0.045)}px Georgia, serif`;
        ctx.textAlign = 'left';
        ctx.fillText(imp.text.toUpperCase(), w * 0.12, h * 0.845);
        ctx.restore();
        ctx.globalCompositeOperation = 'lighter';
        ctx.globalAlpha = 0.25;
        ctx.fillStyle = '#f00';
        ctx.fillRect(4, 0, w, h);
        ctx.fillStyle = '#00f';
        ctx.fillRect(-4, 0, w, h);
        ctx.globalAlpha = 1;
        ctx.globalCompositeOperation = 'source-over';
      } else {
        const wipe = 0.5 * w;
        ctx.fillStyle = style.bg;
        ctx.beginPath();
        ctx.moveTo(wipe, 0);
        ctx.lineTo(w, 0);
        ctx.lineTo(w, h);
        ctx.lineTo(wipe - w * 0.3, h);
        ctx.fill();
      }
    }
    ctx.restore();
  }

  tickImpacts(): void {
    for (let i = this.impacts.length - 1; i >= 0; i--) {
      const imp = this.impacts[i];
      imp.ticks--;
      if (imp.ticks <= 0) this.impacts.splice(i, 1);
    }
    if (this.koPanel) {
      this.koPanel.ticks--;
      if (this.koPanel.ticks <= 0) this.koPanel = null;
    }
  }

  /* --------------------------------------------------------------- KO panel -- */

  private drawKoPanel(ctx: CanvasRenderingContext2D, m: MatchState, w: number, h: number, names?: [string, string]): void {
    const kp = this.koPanel;
    if (!kp || m.phase === 'finisher') return;
    const f = m.fighters[kp.side];
    const k = this.worldK;
    const x = this.worldSX + (f.x - this.cam.x) * k;
    const y = this.worldSY + (f.y - 60 - this.cam.y) * k;
    const age = 36 - kp.ticks;
    ctx.save();
    ctx.globalAlpha = Math.min(1, age / 4);
    ctx.fillStyle = 'rgba(0,0,0,0.35)';
    ctx.fillRect(0, 0, w, h);
    const pw = w * 0.5;
    const ph = h * 0.42;
    const px = Math.max(20, Math.min(w - pw - 20, x - pw / 2));
    const py = Math.max(20, Math.min(h - ph - 20, y - ph / 2));
    ctx.fillStyle = '#efe6d2';
    ctx.strokeStyle = '#12100f';
    ctx.lineWidth = 8;
    ctx.fillRect(px, py, pw, ph);
    ctx.strokeRect(px, py, pw, ph);
    ctx.fillStyle = '#12100f';
    for (let yy = py + 10; yy < py + ph; yy += 12) {
      for (let xx = px + 10; xx < px + pw; xx += 12) {
        ctx.beginPath();
        ctx.arc(xx, yy, 1.6, 0, Math.PI * 2);
        ctx.fill();
      }
    }
    const s = h / 720;
    ctx.fillStyle = '#f7c948';
    ctx.fillRect(px + 14, py + 14, pw * 0.55, 36 * s);
    ctx.strokeStyle = '#12100f';
    ctx.lineWidth = 3;
    ctx.strokeRect(px + 14, py + 14, pw * 0.55, 36 * s);
    ctx.fillStyle = '#12100f';
    ctx.textAlign = 'left';
    ctx.font = `900 ${Math.round(h * 0.11)}px Impact, "Arial Black", sans-serif`;
    ctx.fillText(kp.text, px + 24, py + ph * 0.7);
    ctx.font = `bold ${Math.round(h * 0.028)}px Georgia, serif`;
    const who = names ? names[kp.side] : `P${kp.side + 1}`;
    ctx.fillText(`${who} // ${kp.sub}`, px + 22, py + 14 + 26 * s);
    ctx.restore();
  }

  /* -------------------------------------------------------------- finisher --- */

  /** The finisher cinematic. Staging per kind; the fighters are posed through their state. */
  private drawFinisher(ctx: CanvasRenderingContext2D, m: MatchState, artOpts: ArtOpts, w: number, h: number): void {
    const fin = m.finisher;
    if (!fin) return;
    const A = m.fighters[fin.winner];
    const Bf = m.fighters[fin.loser];
    const ca = charDef(A.char);
    const cb = charDef(Bf.char);
    const t = fin.ticks;
    const K = (a: number, b: number): number => Math.max(0, Math.min(1, (t - a) / (b - a)));
    const blood = bloodOf(cb.id);
    const bx = fin.x;
    const by = fin.y;
    const face = A.facing;
    const tick = m.tick;

    const winnerAt = (x: number, y: number, pose: Partial<Fighter>): void => {
      ctx.save();
      drawFighter(ctx, { ...A, x, y, flash: 0, state: 'attack', move: 'nSig', moveFrame: 10, ...pose }, { ...artOpts, tick, held: null });
      ctx.restore();
    };
    // The loser is posed by name: 'idle' while still standing, 'hurt' once limp. The KO pose
    // rolls the rig below its feet, which is wrong for a body that is being lifted or crushed.
    const loserAt = (x: number, y: number, poseName: PoseName, tx?: (c: CanvasRenderingContext2D) => void): void => {
      ctx.save();
      if (tx) tx(ctx);
      drawCharacter(ctx, cb, x, y, Bf.facing, poseName, { ...artOpts, tick, phase: 0.6, alpha: 1, held: null });
      ctx.restore();
    };
    const spill = (n: number, spread: number): void => {
      if (this.opts.blood <= 0) return;
      for (let i = 0; i < n; i++) {
        this.particles.push({
          x: bx + (rand(t, i) - 0.5) * spread,
          y: by - 50 + (rand(t + 1, i) - 0.5) * spread,
          vx: (rand(t + 2, i) - 0.5) * 10,
          vy: -rand(t + 3, i) * 10,
          life: 90, maxLife: 90,
          size: 2 + rand(t + 4, i) * 4,
          color: blood, kind: 'blood', grav: 0.32, spin: 0,
        });
      }
    };
    const kick = (amount: number): void => { this.cam.shake = Math.max(this.cam.shake, amount * this.opts.shake); };
    const upright = (c: CanvasRenderingContext2D, x: number, y: number, rot: number, sx = 1, sy = 1): void => {
      c.translate(x, y - 70);
      c.rotate(rot);
      c.scale(sx, sy);
      c.translate(-x, -(y - 70));
    };

    ctx.save();
    this.worldTransform(ctx);
    const stage = stageById(m.stageId);
    this.drawBackdrop(ctx, m, stage);
    drawPlatforms(ctx, m, stage, tick, artOpts);
    for (const scar of this.scars) drawScar(ctx, scar, tick);

    const kind = fin.kind;
    if (kind === 'floorpunch') {
      const k = K(20, 80);
      winnerAt(bx - 60 * face, by, { moveFrame: Math.round(4 + 10 * k) });
      ctx.save();
      ctx.beginPath();
      ctx.rect(-2000, -2000, 6000, by + 2002);
      ctx.clip();
      loserAt(bx, by + 150 * K(60, 120), 'hurt');
      ctx.restore();
      if (t === 60) { this.scars.push({ x: bx, y: FLOOR_Y, seed: t * 31, kind: 'crack', theme: m.stageId }); spill(40, 80); kick(20); }
    } else if (kind === 'bloodname') {
      winnerAt(bx - 90 * face, by, { state: 'attack', move: 'sLight', moveFrame: 6 });
      loserAt(bx, by, 'hurt', (c) => upright(c, bx, by, Math.PI / 2 - 0.2));
      const name = cb.name.toUpperCase();
      const n = Math.floor(K(30, 200) * name.length);
      ctx.font = 'italic 900 70px Georgia, serif';
      ctx.fillStyle = blood;
      ctx.textAlign = 'center';
      ctx.fillText(name.slice(0, n), bx, by - 140);
      if (t % 8 === 0 && t > 30 && t < 200) spill(6, 60);
    } else if (kind === 'spriteburst') {
      if (t < 50) {
        winnerAt(bx - 50 * face, by, { state: 'attack', move: 'nSig', moveFrame: 12 });
        loserAt(bx, by - 80 * K(0, 50), 'hurt');
      } else {
        const k = K(50, 200);
        const colors = [cb.art.primary, cb.art.skin, cb.art.accent, cb.art.secondary];
        for (let i = 0; i < 40; i++) {
          const r1 = rand(i, 1); const r2 = rand(i, 2); const r3 = rand(i, 3);
          const x = bx + (r1 - 0.5) * 60 + (r1 - 0.5) * 600 * k;
          const y = by - 50 + (r2 - 0.5) * 90 - 300 * k * (1 - k) * 4 * r3 + 400 * k * k;
          ctx.fillStyle = colors[i % 4];
          const s = 8 + r3 * 10;
          ctx.fillRect(x, y, s, s);
          ctx.strokeStyle = '#12100f';
          ctx.lineWidth = 2;
          ctx.strokeRect(x, y, s, s);
        }
      }
    } else if (kind === 'shadowvanish') {
      const k = K(20, 160);
      ctx.fillStyle = '#000';
      ctx.beginPath();
      ctx.ellipse(bx, by, 40 + 260 * k, 20 + 130 * k, 0, 0, Math.PI * 2);
      ctx.fill();
      winnerAt(bx - 120 * face, by, { state: 'attack', move: 'dSig', moveFrame: 20 });
      ctx.save();
      ctx.globalAlpha = 1 - K(120, 200);
      loserAt(bx, by + 80 * k, 'hurt', (c) => upright(c, bx, by + 80 * k, 0, 1 - 0.6 * k, 1));
      ctx.restore();
    } else if (kind === 'paperflat') {
      const k = K(30, 70);
      winnerAt(bx - 60 * face, by, { state: 'attack', move: 'dSig', moveFrame: Math.round(8 + 12 * k) });
      const sway = Math.sin(t * 0.15) * 30 * K(70, 100);
      loserAt(bx + sway, by + 200 * K(90, 240), 'hurt', (c) => upright(c, bx + sway, by + 200 * K(90, 240), K(70, 240) * 0.2, 1 + 0.3 * k, Math.max(0.06, 1 - k)));
      if (t === 70) spill(20, 60);
    } else if (kind === 'headshot') {
      winnerAt(bx - 260 * face, by, { state: 'attack', move: 'sSig', moveFrame: 14 });
      if (t > 40 && t < 48) {
        ctx.strokeStyle = '#fff';
        ctx.lineWidth = 4;
        ctx.beginPath();
        ctx.moveTo(bx - 240 * face, by - 70);
        ctx.lineTo(bx, by - 90);
        ctx.stroke();
      }
      const k = K(44, 120);
      if (t < 44) loserAt(bx, by, 'idle');
      else loserAt(bx, by, 'hurt', (c) => upright(c, bx, by, -face * 1.4 * k));
      if (t === 44) { spill(50, 40); kick(14); }
    } else if (kind === 'cocoon') {
      const k = K(20, 120);
      winnerAt(bx - 90 * face, by, { state: 'attack', move: 'throw', moveFrame: 4 });
      const fall = 500 * K(140, 240) * K(140, 240);
      loserAt(bx, by + fall, 'hurt');
      ctx.fillStyle = cb.art.accent;
      ctx.strokeStyle = '#12100f';
      ctx.lineWidth = 3;
      ctx.beginPath();
      ctx.ellipse(bx, by - 50 + fall, 36 * k, 70 * k, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.stroke();
      for (let i = 0; i < 8 * k; i++) {
        ctx.beginPath();
        ctx.ellipse(bx, by - 50 + fall + (i - 4) * 14, 36 * k, 6, 0, 0, Math.PI * 2);
        ctx.stroke();
      }
    } else if (kind === 'wireframe') {
      winnerAt(bx - 120 * face, by, { state: 'attack', move: 'nSig', moveFrame: 16 });
      const k = K(20, 200);
      ctx.save();
      ctx.globalAlpha = 1 - K(160, 240);
      loserAt(bx, by, 'hurt');
      if (k > 0.2) {
        ctx.globalCompositeOperation = 'source-atop';
        ctx.fillStyle = `rgba(0,255,204,${Math.min(0.8, k)})`;
        ctx.fillRect(bx - 120, by - 200, 240, 220);
      }
      ctx.restore();
      if (k > 0.3) {
        ctx.font = '12px "Cascadia Mono", Consolas, monospace';
        ctx.fillStyle = '#29f0ff';
        for (let i = 0; i < 30 * k; i++) {
          const r1 = rand(i, 9); const r2 = rand(i, 10);
          ctx.fillText('free(0x' + ((r1 * 65535) | 0).toString(16) + ')', bx + (r1 - 0.5) * 300, by - 200 + r2 * 260 + (t % 60) * 2);
        }
      }
    } else if (kind === 'skyslam') {
      const k = K(10, 90);
      const up = -700 * k;
      winnerAt(bx - 10 * face, by + up, { state: 'attack', move: 'recovery', moveFrame: 8, grounded: false });
      loserAt(bx, by + up - 90, 'hurt', (c) => upright(c, bx, by + up - 90, 3));
      if (t > 120) {
        const k2 = K(120, 160);
        loserAt(bx, by + 20 * k2 - 600 * (1 - k2), 'hurt', (c) => upright(c, bx, by + 20 * k2 - 600 * (1 - k2), Math.PI / 2, 1, 1 - 0.5 * k2));
        if (t === 160) { spill(40, 100); kick(18); }
      }
    } else if (kind === 'inkdrown') {
      const k = K(20, 180);
      winnerAt(bx - 120 * face, by, { state: 'attack', move: 'nSig', moveFrame: 16 });
      loserAt(bx, by, 'hurt');
      ctx.fillStyle = ca.art.ink;
      ctx.beginPath();
      ctx.ellipse(bx, by, 60 + 200 * k, 10 + 20 * k, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillRect(bx - 80, by - 130 * k, 160, 130 * k + 10);
    } else if (kind === 'crush') {
      const k = K(30, 70);
      winnerAt(bx - 110 * face, by, { state: 'attack', move: 'super', moveFrame: 20 });
      if (k < 1) loserAt(bx, by, 'idle');
      else loserAt(bx, by, 'hurt', (c) => upright(c, bx, by, 0, 1.4, 0.08));
      const oy = by - 500 * (1 - k) - 90;
      ctx.fillStyle = ca.art.accent;
      ctx.strokeStyle = '#12100f';
      ctx.lineWidth = 4;
      ctx.fillRect(bx - 70, oy, 140, 90);
      ctx.strokeRect(bx - 70, oy, 140, 90);
      if (t === 70) { spill(60, 120); kick(22); }
    } else if (kind === 'split') {
      winnerAt(bx - 110 * face, by, { state: 'attack', move: 'sSig', moveFrame: 16 });
      const k = K(40, 160);
      ctx.save();
      ctx.beginPath();
      ctx.rect(-3000, -3000, 3000 + bx, 6000);
      ctx.clip();
      loserAt(bx - 60 * k, by + 20 * k, 'hurt', (c) => upright(c, bx - 60 * k, by + 20 * k, -0.6 * k));
      ctx.restore();
      ctx.save();
      ctx.beginPath();
      ctx.rect(bx, -3000, 3000, 6000);
      ctx.clip();
      loserAt(bx + 60 * k, by + 20 * k, 'hurt', (c) => upright(c, bx + 60 * k, by + 20 * k, 0.6 * k));
      ctx.restore();
      if (t === 40) spill(60, 60);
      if (t > 40 && t % 6 === 0 && t < 120) spill(4, 30);
    } else {
      // Custom-built: opener (0-60), beat (60-180), punchline (180-end).
      const parts = fin.parts ?? { opener: 'lift', beat: 'punches', punchline: 'panel' };
      const ko = K(0, 60);
      let lx = bx;
      let ly = by;
      let rot = 0;
      if (parts.opener === 'lift') {
        ly = by - 90 * ko;
        winnerAt(bx - 40 * face, by, { state: 'attack', move: 'nSig', moveFrame: Math.round(2 + 12 * ko) });
      } else if (parts.opener === 'drag') {
        lx = bx - 120 * ko * face;
        rot = 1.2 * ko;
        winnerAt(lx - 70 * face, by, { state: 'attack', move: 'throw', moveFrame: 4 });
      } else {
        winnerAt(bx - 60 * face, by, { state: 'attack', move: 'throw', moveFrame: 3 });
      }
      if (t >= 60 && t < 180) {
        if ((t - 60) % 20 === 0) { spill(10, 60); kick(10); }
        winnerAt(bx - 50 * face, by, { state: 'attack', move: parts.beat === 'slam' ? 'dSig' : parts.beat === 'stomp' ? 'pound' : 'nLight', moveFrame: 4 + ((t - 60) % 20) });
        rot = parts.beat === 'slam' ? 1.5 : 0;
      }
      loserAt(lx, ly, t < 60 ? 'idle' : 'hurt', (c) => upright(c, lx, ly, rot));
      if (t >= 180) {
        const kp = K(180, fin.duration);
        ctx.restore();
        ctx.save();
        if (parts.punchline === 'zoom') {
          this.worldTransform(ctx);
          ctx.translate(bx, by - 60);
          ctx.scale(1 + kp, 1 + kp);
          ctx.translate(-bx, -by + 60);
          loserAt(lx, ly, 'hurt', (c) => upright(c, lx, ly, rot));
        } else if (parts.punchline === 'panel') {
          ctx.strokeStyle = '#12100f';
          ctx.lineWidth = 10;
          ctx.strokeRect(w * 0.1, h * 0.12, w * 0.8, h * 0.76);
          ctx.fillStyle = '#f7c948';
          ctx.fillRect(w * 0.12, h * 0.14, w * 0.4, h * 0.08);
          ctx.fillStyle = '#12100f';
          ctx.font = `bold ${Math.round(h * 0.045)}px Georgia, serif`;
          ctx.textAlign = 'left';
          ctx.fillText(fin.name.toUpperCase(), w * 0.14, h * 0.2);
        } else {
          ctx.fillStyle = '#12100f';
          ctx.fillRect(0, 0, w * kp, h);
        }
        ctx.restore();
        ctx.save();
        this.worldTransform(ctx);
      }
    }
    this.drawParticles(ctx, 1 / 60, m);
    ctx.restore();

    // Letterbox and the caption strip.
    ctx.save();
    ctx.fillStyle = '#000';
    ctx.fillRect(0, 0, w, h * 0.09);
    ctx.fillRect(0, h * 0.91, w, h * 0.09);
    ctx.fillStyle = '#efe6d2';
    ctx.font = `900 ${Math.round(h * 0.04)}px Impact, "Arial Black", sans-serif`;
    ctx.textAlign = 'center';
    ctx.fillText(fin.name.toUpperCase(), w / 2, h * 0.955);
    ctx.font = `${Math.round(h * 0.02)}px "Bahnschrift", "Segoe UI", sans-serif`;
    ctx.fillStyle = '#cbb995';
    ctx.fillText(`${ca.name.toUpperCase()} // ${fin.condition.toUpperCase()}`, w / 2, h * 0.045);
    if (t > 30 && t < fin.duration - 10 && !fin.skipped) ctx.fillText('LOSER: ANY BUTTON TO SKIP', w / 2, h * 0.985);
    ctx.restore();
  }

  /* --------------------------------------------------------------- training -- */

  private drawTraining(ctx: CanvasRenderingContext2D, m: MatchState, tr: { hitboxes: boolean; dodgeViz: boolean }): void {
    ctx.save();
    ctx.font = '13px "Cascadia Mono", Consolas, monospace';
    ctx.textAlign = 'left';
    if (tr.hitboxes) {
      for (const f of m.fighters) {
        const hb = hurtboxOf(f);
        ctx.strokeStyle = f.invuln > 0 ? '#3ee6a0' : '#2bb0ff';
        ctx.lineWidth = 2;
        ctx.strokeRect(hb.x, hb.y, hb.w, hb.h);
        if ((f.state === 'attack' || f.state === 'super') && f.move) {
          const md = moveOf(f.char, f.move);
          if (f.moveFrame >= md.startup && f.moveFrame < md.startup + md.active) {
            const r = hitboxOf(f, md);
            ctx.fillStyle = 'rgba(255,40,40,0.35)';
            ctx.fillRect(r.x, r.y, r.w, r.h);
            ctx.strokeStyle = '#f33';
            ctx.strokeRect(r.x, r.y, r.w, r.h);
          }
        }
      }
      for (const p of m.projectiles) {
        ctx.strokeStyle = '#f90';
        ctx.strokeRect(p.x - p.radius, p.y - p.radius, p.radius * 2, p.radius * 2);
      }
      for (const t of m.traps) {
        ctx.strokeStyle = t.arm > 0 ? '#999' : '#f90';
        ctx.beginPath();
        ctx.arc(t.x, t.y, t.radius, 0, Math.PI * 2);
        ctx.stroke();
      }
    }
    if (tr.dodgeViz) {
      for (const f of m.fighters) {
        if (f.invuln > 0 && f.invuln < 60) {
          ctx.strokeStyle = '#3ee6a0';
          ctx.lineWidth = 3;
          ctx.beginPath();
          ctx.arc(f.x, f.y - 70, 60, 0, Math.PI * 2 * Math.min(1, f.invuln / 18));
          ctx.stroke();
          ctx.fillStyle = '#3ee6a0';
          ctx.fillText('INV ' + f.invuln, f.x + 40, f.y - 110);
        }
        if (f.dodgeCooldown > 0) {
          ctx.fillStyle = '#ffb000';
          ctx.fillText('dodge cd ' + (f.dodgeCooldown / 60).toFixed(1) + 's', f.x - 30, f.y + 16);
        }
        if (f.chaseWindow > 0) {
          ctx.fillStyle = '#ff6a00';
          ctx.fillText('CHASE ' + f.chaseWindow, f.x - 20, f.y + 30);
        }
        if (f.gcWindow > 0) {
          ctx.fillStyle = '#21d7e8';
          ctx.fillText('GC ' + f.gcWindow, f.x - 14, f.y + 44);
        }
      }
    }
    ctx.restore();
  }

  private drawFrameData(ctx: CanvasRenderingContext2D, m: MatchState, w: number, h: number): void {
    const s = h / 720;
    ctx.save();
    ctx.font = `${13 * s}px "Cascadia Mono", Consolas, monospace`;
    ctx.textAlign = 'left';
    m.fighters.forEach((f, i) => {
      const md = (f.state === 'attack' || f.state === 'super') && f.move ? moveOf(f.char, f.move) : null;
      const x = i === 0 ? 20 * s : w - 320 * s;
      const y = h - 130 * s;
      ctx.fillStyle = 'rgba(0,0,0,0.6)';
      ctx.fillRect(x, y, 300 * s, 110 * s);
      ctx.fillStyle = '#efe6d2';
      const lines = [
        `state ${f.state}${f.move ? ' ' + f.move : ''}  frame ${f.moveFrame}`,
        md ? `${md.name}: startup ${md.startup} active ${md.active} recovery ${md.recovery}` : f.charging ? `charging ${f.charge}/${CHARGE_MAX}` : '-',
        `chase ${f.chaseWindow}  gc ${f.gcWindow}  hitstun ${f.state === 'hitstun' ? f.hitstun : 0}`,
        `drive ${f.drive.toFixed(2)}/6  burnout ${f.burnout}  inv ${f.invuln}`,
        `x ${Math.round(f.x)} y ${Math.round(f.y)} vx ${f.vx.toFixed(1)} vy ${f.vy.toFixed(1)} jumps ${f.jumps}`,
        `combo ${m.combo[i].hits} / ${Math.round(m.combo[i].damage)}`,
      ];
      lines.forEach((l, k) => ctx.fillText(l, x + 8, y + 18 * s + k * 16 * s));
    });
    ctx.restore();
  }

  /* ---------------------------------------------------------------- misc ----- */

  /** A quick full-screen flash for title transitions or a finisher panel. */
  flashNow(amount = 0.6): void {
    this.flash = Math.max(this.flash, amount);
  }

  screenPos(x: number, y: number): { x: number; y: number; k: number } {
    const k = Math.min(this.w / 1600, this.h / 900) * this.cam.zoom;
    return {
      x: this.w / 2 + (x - this.cam.x) * k + this.cam.shakeX * this.opts.shake,
      y: this.h / 2 + (y - this.cam.y) * k + this.cam.shakeY * this.opts.shake,
      k,
    };
  }

  /** Used by the title screen for an attract-mode stage. */
  renderAttract(m: MatchState, now: number): void {
    this.render(m, 1, now);
  }

  reset(): void {
    this.particles = [];
    this.floats = [];
    this.rings = [];
    this.impacts = [];
    this.flash = 0;
    this.desat = 0;
    this.koPanel = null;
    this.blendKey = '';
    this.cam = { x: 800, y: 470, zoom: 1, tx: 800, ty: 470, tzoom: 1, shakeX: 0, shakeY: 0, shake: 0 };
  }
}

/** Each universe bleeds its own colour. */
export function bloodOf(id: CharId): string {
  switch (charDef(id).universe) {
    case 'oldink': return '#7a1a12';
    case 'arcade': return '#ff2a2a';
    case 'chapel': return '#8f0f1f';
    case 'saturday': return '#e63946';
    case 'blacksite': return '#4a0a0a';
    case 'hive': return '#5ad15a';
    case 'glitch': return '#ff00aa';
    default: return '#8f1218';
  }
}
