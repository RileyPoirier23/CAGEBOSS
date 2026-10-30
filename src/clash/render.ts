/* UNIVERSE CLASH - the camera and the splatter.
   The sim runs at a fixed 60 Hz. This file renders at whatever the display
   gives us, interpolating between the last two simulated positions. All
   particles and camera shake live here, never in MatchState. */

import type { Fighter, MatchEvent, MatchState, StageDef } from './types';
import { charDef } from './characters';
import { stageById } from './stages';
import {
  ART_DEFAULT,
  ArtOpts,
  ScarMark,
  drawBurst,
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
  hash,
  rand,
} from './art';

export interface RenderOpts {
  outline: number;
  shadow: number;
  pattern: boolean;
  blood: number;
  particles: number;
  impactFrames: number;
  shake: number;
  lite: boolean;
  /** Backing-store multiplier. 1 = native resolution, 0.6 = cheaper. */
  resolutionScale: number;
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
};

interface Particle {
  x: number;
  y: number;
  vx: number;
  vy: number;
  life: number;
  maxLife: number;
  size: number;
  color: string;
  kind: 'blood' | 'dust' | 'spark' | 'paper' | 'ember';
  grav: number;
  spin: number;
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
  private backdropWarm = new Set<string>();
  private freeze: HTMLCanvasElement | null = null;

  constructor(canvas: HTMLCanvasElement) {
    this.canvas = canvas;
    const ctx = canvas.getContext('2d', { alpha: false });
    if (!ctx) throw new Error('2D canvas unavailable');
    this.ctx = ctx;
    this.resize();
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
  }

  /** Give the renderer a stage's backdrop ahead of the first frame. */
  warm(stage: StageDef): void {
    if (this.backdropWarm.has(stage.id)) return;
    this.backdropWarm.add(stage.id);
    // stageBackdrop is cached in art.ts; drawing it once off-screen is enough.
    void stage;
  }

  addEvent(e: MatchEvent, m: MatchState): void {
    const char = e.char ? charDef(e.char) : null;
    const color = e.color ?? (char ? charDef(e.char!).art.accent : '#d8242c');
    if (e.type === 'hit' || e.type === 'perfect' || e.type === 'clash' || e.type === 'shield') {
      const tier = e.tier ?? 0;
      const x = e.x ?? 800;
      const y = e.y ?? 550;
      if (e.type === 'hit') {
        const scale = 1 + Math.min(1.3, (e.value ?? 6) / 18);
        this.burst(x, y, e.seed ?? 1, color, tier, scale, m);
        if (tier > 0 && this.opts.impactFrames > 0) {
          this.impacts.push({
            tier,
            ticks: tier >= 3 ? 9 : tier === 2 ? 6 : 4,
            max: tier >= 3 ? 9 : tier === 2 ? 6 : 4,
            x,
            y,
            seed: e.seed ?? 1,
            text: e.text ?? '',
            color,
          });
          if (tier >= 2) this.flash = Math.max(this.flash, 0.85);
          this.cam.shake = Math.max(this.cam.shake, (tier >= 3 ? 22 : tier === 2 ? 14 : 8) * this.opts.shake);
          this.freeze = null;
        }
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
        this.burst(x, y, e.seed ?? 1, e.type === 'perfect' ? '#f7c948' : e.type === 'clash' ? '#ffffff' : '#31d3d9', 1, 0.9, m);
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
          color: i % 5 === 0 ? '#d8242c' : '#8f1218',
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
        this.scars.push({ x: e.x ?? 800, y: 650, seed: e.seed ?? 1, kind: 'crack', theme: m.stageId });
      }
    } else if (e.type === 'scar') {
      const stage = stageById(m.stageId);
      const kind = e.value === 2 ? 'blood' : e.value === 3 ? 'burn' : 'crack';
      this.scars.push({
        x: e.x ?? 800,
        y: Math.min(650, e.y ?? 650),
        seed: e.seed ?? 1,
        kind: kind as ScarMark['kind'],
        theme: stage.theme,
      });
      if (this.scars.length > 60) this.scars.splice(0, this.scars.length - 60);
    } else if (e.type === 'burnout' || e.type === 'burst') {
      this.burst(e.x ?? 800, e.y ?? 500, e.seed ?? 1, '#d8242c', 1, 1.2, m);
      this.cam.shake = Math.max(this.cam.shake, 8 * this.opts.shake);
    } else if (e.type === 'impact' || e.type === 'throw') {
      this.burst(e.x ?? 800, e.y ?? 500, e.seed ?? 1, '#f7c948', 0, 0.8, m);
    }
  }

  private burst(x: number, y: number, seed: number, color: string, tier: number, scale: number, m: MatchState): void {
    void m;
    if (this.opts.particles <= 0) return;
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
        kind: 'spark',
        grav: 0.18,
        spin: 0,
      });
    }
    this.rings.push({ x, y, radius: 8 * scale, life: 16 + tier * 4, maxLife: 16 + tier * 4, color, width: 2 + tier * 2 });
  }

  /** Draw one display frame. `alpha` is the interpolation between the last ticks. */
  render(m: MatchState, alpha: number, now: number): void {
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

    ctx.save();
    ctx.translate(w / 2 + shakeX, h / 2 + shakeY);
    ctx.scale(k, k);
    ctx.translate(-this.cam.x, -this.cam.y);

    const artOpts: ArtOpts = {
      outline: Math.max(0, this.opts.outline),
      shadow: this.opts.shadow,
      pattern: this.opts.pattern,
      lite: this.opts.lite,
    };
    drawStageBack(ctx, stage);
    drawPlatforms(ctx, m, stage, m.tick, artOpts);
    for (const scar of this.scars) drawScar(ctx, scar, m.tick);
    for (const item of m.items) drawItem(ctx, item, m.tick, artOpts);
    for (const trap of m.traps) drawTrap(ctx, trap, m.tick, artOpts);

    const items = m.items.filter((i) => i.heldBy >= 0);
    const fighters = [...m.fighters].sort((a, b) => a.y - b.y);
    for (const f of fighters) {
      const ix = f.px + (f.x - f.px) * alpha;
      const iy = f.py + (f.y - f.py) * alpha;
      if (f.state === 'super') {
        drawSuperAura(ctx, { ...f, x: ix, y: iy }, m.tick, charDef(f.char).art.accent);
      }
      const ghost = this.ghostFor(f);
      if (ghost) {
        ctx.save();
        ctx.globalAlpha = 0.18;
        drawFighter(ctx, { ...f, x: ix - f.facing * 18, y: iy, flash: 0 }, { ...artOpts, tick: m.tick, held: null });
        ctx.restore();
      }
      drawFighter(
        ctx,
        { ...f, x: ix, y: iy },
        { ...artOpts, tick: m.tick, held: items.find((i) => i.heldBy === f.side)?.kind ?? null },
      );
    }
    for (const p of m.projectiles) drawProjectile(ctx, p, m.tick, artOpts);
    this.drawParticles(ctx, dt);
    drawStageFront(ctx, stage, m.tick, artOpts);
    ctx.restore();

    // Floating text is screen space so it stays legible under camera zoom.
    this.drawFloats(ctx, k, shakeX, shakeY);
    this.drawImpact(ctx, m, w, h, now);
    if (this.flash > 0) {
      ctx.globalAlpha = Math.min(0.8, this.flash);
      ctx.fillStyle = '#fff7e6';
      ctx.fillRect(0, 0, w, h);
      ctx.globalAlpha = 1;
      this.flash = Math.max(0, this.flash - dt * 3.2);
    }
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

  private ghostFor(f: Fighter): boolean {
    if (f.state === 'attack' && f.moveFrame > 0 && f.moveFrame < 8) return true;
    if (f.state === 'dodge' && f.stateTicks < 4) return true;
    if (f.state === 'hitstun' && f.hitstun > 30) return true;
    return false;
  }

  private updateCamera(m: MatchState, alpha: number, dt: number): void {
    const f0 = m.fighters[0];
    const f1 = m.fighters[1];
    const x0 = f0.px + (f0.x - f0.px) * alpha;
    const x1 = f1.px + (f1.x - f1.px) * alpha;
    const y0 = f0.py + (f0.y - f0.py) * alpha;
    const y1 = f1.py + (f1.y - f1.py) * alpha;
    let midX = (x0 + x1) / 2;
    let midY = (y0 + y1) / 2 - 60;
    let spreadX = Math.abs(x0 - x1);
    let spreadY = Math.abs(y0 - y1);
    let wantZoom = 1.08;

    if (m.phase === 'intro') {
      const p = 1 - Math.max(0, m.introTicks) / 120;
      wantZoom = 1.34 - p * 0.32;
      midX = 800;
      midY = 470;
    } else if (m.phase === 'finisher' && m.finisher) {
      const winner = m.fighters[m.finisher.winner];
      const loser = m.fighters[m.finisher.loser];
      midX = (winner.x + loser.x) / 2;
      midY = Math.min(winner.y, loser.y) - 110;
      wantZoom = 1.5;
    } else if (m.phase === 'ko') {
      wantZoom = 1.16;
    }
    if (m.dramatic > 0 && (m.dramaticSide === 0 || m.dramaticSide === 1)) {
      const f = m.fighters[m.dramaticSide];
      midX = f.x;
      midY = f.y - 90;
      wantZoom = 1.3;
    }
    if (spreadX > 700) wantZoom = Math.min(wantZoom, Math.max(0.7, 1.1 - (spreadX - 700) / 1500));
    if (spreadY > 300) wantZoom = Math.min(wantZoom, Math.max(0.78, 1.05 - (spreadY - 300) / 1600));
    if (midY < 300) midY += 40;
    const halfW = 800 / wantZoom;
    const minX = 300 + halfW * 0.55;
    const maxX = 1300 - halfW * 0.55;
    midX = minX <= maxX ? Math.max(minX, Math.min(maxX, midX)) : 800;
    midY = Math.max(320, Math.min(560, midY));

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

  private drawParticles(ctx: CanvasRenderingContext2D, dt: number): void {
    const step = dt * 60;
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

  private drawImpact(ctx: CanvasRenderingContext2D, m: MatchState, w: number, h: number, now: number): void {
    void now;
    if (this.impacts.length === 0 || this.opts.impactFrames <= 0) return;
    const imp = this.impacts[this.impacts.length - 1];
    const progress = 1 - imp.ticks / imp.max;
    const strength = imp.tier >= 3 ? 1 : imp.tier >= 2 ? 0.8 : 0.45;
    const k = Math.min(w / 1600, h / 900) * this.cam.zoom;
    const cx = w / 2 + (imp.x - this.cam.x) * k + this.cam.shakeX * this.opts.shake;
    const cy = h / 2 + (imp.y - this.cam.y) * k + this.cam.shakeY * this.opts.shake;

    ctx.save();
    if (imp.tier >= 2) {
      if (!this.freeze) {
        this.freeze = document.createElement('canvas');
        this.freeze.width = this.canvas.width;
        this.freeze.height = this.canvas.height;
        this.freeze.getContext('2d')?.drawImage(this.canvas, 0, 0);
      }
      const snap = this.freeze;
      const fctx = snap.getContext('2d');
      if (fctx) {
        ctx.setTransform(1, 0, 0, 1, 0, 0);
        ctx.globalAlpha = 0.9;
        ctx.drawImage(snap, 0, 0);
        ctx.globalCompositeOperation = 'saturation';
        ctx.fillStyle = '#808080';
        ctx.fillRect(0, 0, this.canvas.width, this.canvas.height);
        if (imp.tier >= 3) {
          ctx.globalCompositeOperation = 'difference';
          ctx.fillStyle = '#ffffff';
          ctx.fillRect(0, 0, this.canvas.width, this.canvas.height);
          ctx.globalCompositeOperation = 'color';
          ctx.fillStyle = '#d8242c';
          ctx.fillRect(0, 0, this.canvas.width, this.canvas.height);
        } else {
          ctx.globalCompositeOperation = 'color';
          ctx.fillStyle = '#8f1218';
          ctx.globalAlpha = 0.5;
          ctx.fillRect(0, 0, this.canvas.width, this.canvas.height);
        }
      }
      ctx.globalCompositeOperation = 'source-over';
      ctx.globalAlpha = 1;
      ctx.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
    }

    // Speed lines from the impact point.
    const lines = imp.tier >= 3 ? 34 : imp.tier === 2 ? 22 : 12;
    ctx.save();
    ctx.translate(cx, cy);
    ctx.strokeStyle = imp.tier >= 2 ? '#f7c948' : '#efe6d2';
    for (let i = 0; i < lines; i++) {
      const a = rand(imp.seed, i) * Math.PI * 2;
      const inner = 26 + rand(imp.seed + 1, i) * 40;
      const outer = inner + 30 + rand(imp.seed + 2, i) * 140 * strength;
      ctx.globalAlpha = (1 - progress) * 0.65;
      ctx.lineWidth = 1.5 + rand(imp.seed + 3, i) * 3;
      ctx.beginPath();
      ctx.moveTo(Math.cos(a) * inner, Math.sin(a) * inner);
      ctx.lineTo(Math.cos(a) * outer, Math.sin(a) * outer);
      ctx.stroke();
    }
    ctx.restore();

    // Ink burst.
    const burstR = (24 + progress * 90) * (imp.tier >= 2 ? 1.4 : 1);
    drawBurst(ctx, cx, cy, imp.seed, imp.tier >= 2 ? '#f7c948' : '#efe6d2', burstR, 1 - progress * 0.8, imp.tier >= 3 ? 16 : 10);
    drawInkSplash(ctx, cx, cy, imp.seed + 4, imp.tier >= 2 ? '#d8242c' : '#12100f', 1 + progress * 1.4, (1 - progress) * 0.8);

    // Panel caption for tier 3.
    if (imp.tier >= 3) {
      ctx.save();
      ctx.globalAlpha = Math.min(1, imp.ticks / 3);
      ctx.fillStyle = '#12100f';
      ctx.fillRect(0, h * 0.38, w, h * 0.24);
      ctx.fillStyle = '#efe6d2';
      ctx.font = '900 46px Impact, "Arial Black", sans-serif';
      ctx.textAlign = 'center';
      ctx.fillText(imp.text.toUpperCase(), w / 2, h * 0.49);
      ctx.fillStyle = '#d8242c';
      ctx.fillRect(0, h * 0.38, w, 5);
      ctx.fillRect(0, h * 0.62 - 5, w, 5);
      ctx.restore();
    }
    ctx.restore();
    void m;
  }

  tickImpacts(): void {
    for (let i = this.impacts.length - 1; i >= 0; i--) {
      const imp = this.impacts[i];
      imp.ticks--;
      if (imp.ticks <= 0) {
        this.impacts.splice(i, 1);
        this.freeze = null;
      }
    }
  }

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
    this.freeze = null;
    this.cam = { x: 800, y: 470, zoom: 1, tx: 800, ty: 470, tzoom: 1, shakeX: 0, shakeY: 0, shake: 0 };
  }
}
