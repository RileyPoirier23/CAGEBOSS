/**
 * Side-on arena for spectating fights. Skeletal fighters (rig.ts) trade
 * shots at real striking range: lunges, recoils, clinches against the fence,
 * takedowns and ground work, knockdowns and KOs. Pixel crowd, octagon fence,
 * spotlights, sweat/blood/impact particles, HP bars and the round clock.
 * Also: the between-round corner cutaway and the ring-card walk.
 */
import { Container, Graphics } from 'pixi.js';
import type { Fighter, TickerLine, CornerReport } from '../core/types';
import { PAL, shade, lerpColor } from '../art/palette';
import { text } from './kit';
import { PixelText } from './text';
import { portrait } from './sprites';
import { sfx } from '../audio/sfx';
import { Rig, Pose, POSES, drawRig, lerpRig, lookFor, stanceGuard, Look2 } from './rig';

export const AW = 480;
export const AH = 150;
const FLOOR = 136;
const CAGE_L = 34;
const CAGE_R = 446;

interface Part {
  x: number;
  y: number;
  vx: number;
  vy: number;
  life: number;
  c: number;
  s: number;
  grav: number;
}

interface FState {
  rig: Rig;
  pose: Pose;
  poseT: number;
  x: number;
  lunge: number;
  recoil: number;
  facing: 1 | -1;
}

export class ArenaView extends Container {
  private bg = new Graphics();
  private crowd = new Graphics();
  private lights = new Graphics();
  private fighters = new Graphics();
  private fx = new Graphics();
  private front = new Graphics();
  private hud = new Container();
  private hudG = new Graphics();
  private clock: PixelText;
  private callout: PixelText;
  private parts: Part[] = [];
  private t = 0;
  private L: [Look2, Look2];
  private F: [FState, FState];
  private center = AW / 2;
  private drift = 0;
  hp: [number, number] = [100, 100];
  intensity = 1;
  flash = 0;
  shakeT = 0;
  round = 1;
  sec = 0;
  calloutT = 0;
  ground: 'stand' | 'clinch' | 'atop' | 'btop' = 'stand';
  winnerSide = -1;
  finished = false;

  constructor(
    public A: Fighter,
    public B: Fighter,
    public rounds: number,
  ) {
    super();
    this.L = [lookFor(A, 0), lookFor(B, 1)];
    this.F = [
      { rig: { ...POSES.guard }, pose: 'guard', poseT: 0, x: AW / 2 - 24, lunge: 0, recoil: 0, facing: 1 },
      { rig: { ...POSES.guard }, pose: 'guard', poseT: 0, x: AW / 2 + 24, lunge: 0, recoil: 0, facing: -1 },
    ];
    this.addChild(this.bg, this.crowd, this.lights, this.fighters, this.fx, this.front, this.hudG, this.hud);
    this.drawBg();
    this.hud.addChild(text(`${A.first[0]}. ${A.last}`, 6, 3, { color: PAL.bone }));
    this.hud.addChild(text(`${B.first[0]}. ${B.last}`, AW - 126, 3, { color: PAL.bone, width: 120, align: 'right' }));
    this.clock = text('R1 5:00', 0, 3, { width: AW, align: 'center', color: PAL.gold });
    this.callout = text('', 0, 46, { width: AW, align: 'center', color: PAL.gold, scale: 2, shadow: PAL.ink });
    this.hud.addChild(this.clock, this.callout);
  }

  private drawBg(): void {
    const g = this.bg;
    g.clear();
    // arena darkness with a warm gradient toward the cage
    for (let y = 0; y < AH; y += 2) g.rect(0, y, AW, 2).fill(lerpColor(0x0c090d, 0x1d151b, y / AH));
    // rafters & lighting rig
    g.rect(0, 14, AW, 2).fill(0x2a2228);
    for (let i = 0; i < 10; i++) {
      g.rect(18 + i * 48, 10, 12, 5).fill(0x3a3032);
      g.rect(21 + i * 48, 15, 6, 2).fill(0xe8d8a0);
    }
    // the canvas (mat) in perspective
    g.poly([CAGE_L - 20, FLOOR + 14, CAGE_R + 20, FLOOR + 14, CAGE_R - 4, FLOOR - 10, CAGE_L + 4, FLOOR - 10]).fill(0xc9c3b6);
    g.poly([CAGE_L - 20, FLOOR + 14, CAGE_R + 20, FLOOR + 14, AW, AH, 0, AH]).fill(0x1a1416);
    // mat logo & centre circle
    g.ellipse(AW / 2, FLOOR + 2, 70, 9).stroke({ color: 0xa83232, width: 2, alpha: 0.6 });
    g.ellipse(AW / 2, FLOOR + 2, 40, 5).fill({ color: 0xa83232, alpha: 0.25 });
    // sponsor decals on the mat
    g.rect(80, FLOOR + 6, 40, 4).fill({ color: 0x2a4a86, alpha: 0.35 });
    g.rect(360, FLOOR + 6, 40, 4).fill({ color: 0x2a4a86, alpha: 0.35 });
    // back fence: posts + chain-link mesh
    const top = 46;
    g.rect(CAGE_L, top, CAGE_R - CAGE_L, 3).fill(0x2a2a30);
    g.rect(CAGE_L, FLOOR - 12, CAGE_R - CAGE_L, 3).fill(0x1d1d22);
    for (let x = CAGE_L; x <= CAGE_R; x += 82) {
      g.rect(x - 2, top - 2, 5, FLOOR - top - 8).fill(0x111114);
      g.rect(x - 3, top - 4, 7, 4).fill(0x3a3a42);
    }
    for (let y = top + 3; y < FLOOR - 12; y += 4) {
      for (let x = CAGE_L + ((y >> 2) % 2) * 2; x < CAGE_R; x += 4) g.rect(x, y, 1, 1).fill(0x44444e);
    }
    // padding on top rail
    g.rect(CAGE_L, top - 1, CAGE_R - CAGE_L, 2).fill(0x8a1e1e);
  }

  private drawCrowd(): void {
    const g = this.crowd;
    g.clear();
    for (let r = 0; r < 4; r++) {
      const y = 22 + r * 7;
      for (let x = (r % 2) * 4; x < AW; x += 8) {
        const n = Math.sin(x * 12.9898 + r * 78.233) * 43758.5453;
        const v = n - Math.floor(n);
        const excite = this.intensity >= 3 ? Math.round(Math.abs(Math.sin(this.t * 9 + x)) * -2) : 0;
        const head = lerpColor(0x1e171c, 0x4a3a40, v * 0.7);
        g.circle(x + 3, y + excite, 2.5).fill(head);
        g.rect(x, y + 2 + excite, 7, 5).fill(shade(head, -0.2));
        if (this.intensity >= 2 && v > 0.93) g.rect(x + 2, y - 4 + excite, 2, 4).fill(shade(head, 0.2)); // fist up
        if (v > 0.97 && Math.sin(this.t * 2 + x) > 0) g.rect(x + 3, y - 2, 1, 2).fill(0xbfd8ff); // phone screen
      }
    }
    if (this.intensity >= 2 && Math.random() < 0.06 * this.intensity) {
      const fx = Math.random() * AW;
      g.circle(fx, 24 + Math.random() * 20, 2).fill(0xffffff);
    }
    // spotlights over the cage
    const l = this.lights;
    l.clear();
    l.poly([AW / 2 - 30, 16, AW / 2 + 30, 16, AW / 2 + 150, FLOOR, AW / 2 - 150, FLOOR]).fill({ color: 0xfff2d0, alpha: 0.05 + this.intensity * 0.01 });
    l.ellipse(AW / 2 + this.drift, FLOOR + 1, 110, 10).fill({ color: 0xfff2d0, alpha: 0.08 });
  }

  // ------------------------------------------------------------ cues

  private setPose(i: 0 | 1, p: Pose, dur = 0.35): void {
    this.F[i].pose = p;
    this.F[i].poseT = dur;
  }

  private handPos(i: 0 | 1, which: 'haF' | 'haB' | 'ftB' | 'knB' | 'elB' = 'haF'): [number, number] {
    const f = this.F[i];
    const j = f.rig[which];
    return [f.x + (f.lunge + j[0]) * f.facing, FLOOR + j[1]];
  }

  private burst(x: number, y: number, n: number, color: number, speed = 70, life = 0.35, size = 2, grav = 220): void {
    for (let k = 0; k < n; k++) {
      this.parts.push({ x, y, vx: (Math.random() - 0.5) * speed * 2, vy: -Math.random() * speed, life: life * (0.6 + Math.random() * 0.6), c: color, s: size, grav });
    }
  }

  private impact(attacker: 0 | 1, joint: 'haF' | 'haB' | 'ftB' | 'knB' | 'elB', big: boolean, bloody: boolean): void {
    const def = (1 - attacker) as 0 | 1;
    this.F[attacker].lunge = 7;
    this.F[def].recoil = big ? 9 : 5;
    const [x, y] = this.handPos(attacker, joint);
    this.burst(x, y, big ? 16 : 7, big ? PAL.gold : 0xffffff, big ? 110 : 60, 0.3, big ? 2 : 1);
    this.burst(x, y, 4, 0xbfe0ff, 40, 0.5, 1, 120); // sweat
    if (bloody) this.burst(x, y, 6, 0xa01818, 45, 0.9, 2);
    if (big) this.shakeT = 0.25;
  }

  cue(line: TickerLine): void {
    this.round = line.round;
    this.sec = line.t;
    this.hp = [line.hp[0], line.hp[1]];
    this.intensity = Math.max(1, line.intensity);
    const prevGround = this.ground;
    this.ground = line.pos;
    if (prevGround !== this.ground && (this.ground === 'stand')) {
      this.setPose(0, 'guard', 0);
      this.setPose(1, 'guard', 0);
    }
    const a = line.side;
    if (a < 0) {
      if (line.act === 'bell') sfx('bell');
      if (line.act === 'standup') this.showCallout('STAND UP!');
      return;
    }
    const A = a as 0 | 1;
    const D = (1 - a) as 0 | 1;
    const ground = this.ground === 'atop' || this.ground === 'btop';
    const bloody = this.hp[D] < 55 && Math.random() < 0.5;
    const sig = (A === 0 ? this.A : this.B).anim?.signature ?? [];
    switch (line.act) {
      case 'jab':
        this.setPose(A, 'jab', 0.22);
        this.setPose(D, Math.random() < 0.3 ? 'slip' : 'hurt', 0.2);
        this.impact(A, 'haF', false, false);
        sfx('punch');
        break;
      case 'punch': {
        const p: Pose = Math.random() < 0.35 ? 'hook' : Math.random() < 0.25 ? 'uppercut' : Math.random() < 0.2 ? 'body' : 'cross';
        if (ground) {
          this.setPose(A, 'topPunch', 0.25);
          this.impact(A, 'haB', false, bloody);
        } else {
          this.setPose(A, p, 0.3);
          this.setPose(D, 'hurt', 0.28);
          this.impact(A, 'haB', line.intensity >= 2, bloody);
        }
        sfx('punch');
        break;
      }
      case 'elbow':
        this.setPose(A, ground ? 'topPunch' : 'elbow', 0.3);
        this.setPose(D, 'hurt', 0.3);
        this.impact(A, 'elB', line.intensity >= 2, true);
        sfx('punch');
        break;
      case 'legkick':
        this.setPose(A, 'legkick', 0.35);
        this.impact(A, 'ftB', false, false);
        sfx('kick');
        break;
      case 'kick':
        this.setPose(A, 'bodykick', 0.38);
        this.setPose(D, 'hurt', 0.3);
        this.impact(A, 'ftB', line.intensity >= 2, false);
        sfx('kick');
        break;
      case 'headkick':
        this.setPose(A, 'headkick', 0.45);
        this.setPose(D, 'rocked', 0.5);
        this.impact(A, 'ftB', true, bloody);
        sfx('kick');
        break;
      case 'knee':
        this.setPose(A, sig.includes('flyingKnee') && Math.random() < 0.5 ? 'flyknee' : 'knee', 0.35);
        this.setPose(D, 'hurt', 0.3);
        this.impact(A, 'knB', line.intensity >= 2, bloody);
        sfx('kick');
        break;
      case 'rocked':
        this.setPose(D, 'rocked', 0.9);
        sfx('crowd');
        break;
      case 'kd':
        this.setPose(A, Math.random() < 0.5 ? 'hook' : 'cross', 0.35);
        this.setPose(D, 'down', 1.6);
        this.impact(A, 'haB', true, true);
        this.flash = 0.25;
        this.showCallout('KNOCKDOWN!');
        sfx('roar');
        break;
      case 'ko':
        this.setPose(A, Math.random() < 0.4 ? 'headkick' : 'hook', 0.6);
        this.setPose(D, 'ko', 9999);
        this.impact(A, Math.random() < 0.4 ? 'ftB' : 'haB', true, true);
        this.F[D].recoil = 22;
        this.flash = 0.6;
        this.winnerSide = A;
        this.finished = true;
        this.showCallout('KNOCKOUT!');
        sfx('roar');
        break;
      case 'tko':
        this.setPose(D, ground ? 'bottom' : 'down', 9999);
        this.setPose(A, 'celebrate', 9999);
        this.winnerSide = A;
        this.finished = true;
        this.showCallout("IT'S STOPPED!");
        sfx('roar');
        break;
      case 'gnp':
        this.setPose(A, 'topPunch', 0.25);
        this.impact(A, 'haB', false, bloody);
        sfx('punch');
        break;
      case 'td':
        this.setPose(A, 'shoot', 0.3);
        this.setPose(D, 'lifted', 0.25);
        this.burst(this.center, FLOOR, 10, 0xd8d0c0, 50, 0.4, 2, 60); // mat dust
        this.shakeT = 0.15;
        sfx('thud');
        break;
      case 'sprawl':
        this.setPose(D, 'shoot', 0.35);
        this.setPose(A, 'sprawl', 0.5);
        break;
      case 'sub':
        this.setPose(A, ground ? (this.isTop(A) ? 'top' : 'bottomSub') : 'clinch', 0.8);
        break;
      case 'tap':
        this.setPose(A, this.isTop(A) ? 'top' : 'bottomSub', 9999);
        this.winnerSide = A;
        this.finished = true;
        this.showCallout('TAP! TAP! TAP!');
        sfx('roar');
        break;
      case 'sweep':
        this.burst(this.center, FLOOR, 8, 0xd8d0c0, 40, 0.4, 2, 60);
        sfx('thud');
        break;
      case 'clinch':
      case 'ctrl':
        break;
      case 'taunt':
        this.setPose(A, 'taunt', 1.0);
        break;
      case 'cut':
        this.burst(this.F[D].x + 6 * this.F[D].facing, FLOOR - 74, 10, 0xa01818, 50, 1.0, 2);
        break;
      case 'injury':
        this.showCallout('INJURY!');
        sfx('snap');
        break;
      case 'foul':
        this.showCallout('FOUL!');
        this.setPose(D, 'hurt', 0.8);
        break;
      case 'stool':
        this.showCallout('RETIRED ON THE STOOL');
        this.finished = true;
        break;
      case 'stop':
        this.finished = true;
        break;
      case 'escape':
      case 'getup':
        break;
    }
    if (sig.length && ['punch', 'kick', 'headkick', 'knee', 'elbow'].includes(line.act) && line.intensity >= 2 && Math.random() < 0.35) {
      const name = sig[Math.floor(Math.random() * sig.length)];
      if (name === 'spinningElbow' || name === 'spinningBackfist') this.setPose(A, 'spin', 0.4);
      this.showCallout(name.replace(/([A-Z])/g, ' $1').toUpperCase() + '!');
    }
  }

  private isTop(i: 0 | 1): boolean {
    return (this.ground === 'atop' && i === 0) || (this.ground === 'btop' && i === 1);
  }

  showCallout(s: string): void {
    this.callout.setText(s);
    this.calloutT = 1.3;
  }

  // ------------------------------------------------------------ frame

  update(dt: number): void {
    this.t += dt;
    this.drawCrowd();
    // the action drifts around the cage; clinches end up on the fence
    const ground = this.ground === 'atop' || this.ground === 'btop';
    const targetCenter =
      this.ground === 'clinch' ? (Math.sin(this.round * 1.7) > 0 ? CAGE_R - 40 : CAGE_L + 40) : ground ? AW / 2 + Math.sin(this.round * 2.3) * 60 : AW / 2 + Math.sin(this.t * 0.35) * 70;
    this.center += (targetCenter - this.center) * Math.min(1, dt * 1.5);
    this.drift = this.center - AW / 2;
    const gap = this.ground === 'clinch' ? 12 : ground ? 0 : 23 + Math.sin(this.t * 1.3) * 3;
    for (const i of [0, 1] as const) {
      const f = this.F[i];
      const side = i === 0 ? -1 : 1;
      let tx = this.center + side * gap;
      if (ground) {
        const top = this.isTop(i);
        // top fighter postured between the bottom fighter's legs
        const topIdx = this.ground === 'atop' ? 0 : 1;
        f.facing = (top ? (topIdx === 0 ? 1 : -1) : topIdx === 0 ? -1 : 1) as 1 | -1;
        tx = top ? this.center - 18 * f.facing : this.center - 22 * f.facing;
      } else f.facing = i === 0 ? 1 : -1;
      if (this.F[1 - i].pose === 'ko' && f.pose === 'celebrate') tx = this.center + side * 40;
      f.x += (tx - f.x) * Math.min(1, dt * 8);
      f.lunge *= Math.pow(0.001, dt);
      f.recoil *= Math.pow(0.003, dt);
      if (f.poseT > 0) {
        f.poseT -= dt;
        if (f.poseT <= 0 && f.pose !== 'ko') f.pose = 'guard';
      }
      let pose = f.pose;
      if (ground && !['ko', 'tap', 'celebrate', 'topPunch', 'bottomSub', 'top'].includes(pose)) pose = this.isTop(i) ? 'top' : 'bottom';
      if (ground && pose === 'bottomSub' && this.isTop(i)) pose = 'top';
      if (this.ground === 'clinch' && pose === 'guard') pose = 'clinch';
      if (this.winnerSide === i && this.finished && f.poseT <= 0) pose = 'celebrate';
      const target = pose === 'guard' ? stanceGuard(this.L[i], this.t + i * 1.3) : POSES[pose as Pose] ?? POSES.guard;
      f.rig = lerpRig(f.rig, target, Math.min(1, dt * (f.poseT > 0 ? 22 : 12)));
    }
    // draw fighters: back one first; defenders slightly behind attackers
    const g = this.fighters;
    g.clear();
    const shake = this.shakeT > 0 ? Math.round((Math.random() - 0.5) * 4) : 0;
    this.shakeT -= dt;
    // shadows
    for (const f of this.F) g.ellipse(f.x, FLOOR + 1, 16, 3).fill({ color: 0x000000, alpha: 0.35 });
    const order: (0 | 1)[] = ground ? (this.isTop(0) ? [1, 0] : [0, 1]) : this.F[0].poseT > this.F[1].poseT ? [1, 0] : [0, 1];
    for (const i of order) {
      const f = this.F[i];
      const x = f.x + (f.lunge - f.recoil) * f.facing + shake;
      drawRig(g, f.rig, Math.round(x), FLOOR, f.facing, this.L[i]);
    }
    // particles
    const p = this.fx;
    p.clear();
    this.parts = this.parts.filter((s) => (s.life -= dt) > 0);
    for (const s of this.parts) {
      s.x += s.vx * dt;
      s.y += s.vy * dt;
      s.vy += s.grav * dt;
      if (s.y > FLOOR + 6 && s.c === 0xa01818) {
        s.vy = 0;
        s.vx = 0;
        s.grav = 0;
      }
      p.rect(Math.round(s.x), Math.round(s.y), s.s, s.s).fill(s.c);
    }
    // front fence posts (in front of the fighters, faint)
    const fr = this.front;
    fr.clear();
    fr.rect(CAGE_L - 6, 40, 6, FLOOR - 26).fill({ color: 0x0c0c0e, alpha: 0.9 });
    fr.rect(CAGE_R, 40, 6, FLOOR - 26).fill({ color: 0x0c0c0e, alpha: 0.9 });
    // HUD
    const h = this.hudG;
    h.clear();
    h.rect(4, 13, 140, 6).fill(PAL.ink).rect(5, 14, Math.round((138 * this.hp[0]) / 100), 4).fill(this.hp[0] > 40 ? PAL.moss : PAL.blood);
    h.rect(AW - 144, 13, 140, 6).fill(PAL.ink).rect(AW - 5 - Math.round((138 * this.hp[1]) / 100), 14, Math.round((138 * this.hp[1]) / 100), 4).fill(this.hp[1] > 40 ? PAL.moss : PAL.blood);
    h.rect(4, 20, 10, 2).fill(this.L[0].trunks).rect(AW - 14, 20, 10, 2).fill(this.L[1].trunks);
    if (this.flash > 0) {
      h.rect(0, 0, AW, AH).fill({ color: 0xffffff, alpha: Math.min(0.5, this.flash) });
      this.flash -= dt;
    }
    const left = Math.max(0, 300 - this.sec);
    this.clock.setText(`R${this.round}/${this.rounds}  ${Math.floor(left / 60)}:${String(Math.floor(left % 60)).padStart(2, '0')}`);
    if (this.calloutT > 0) {
      this.calloutT -= dt;
      this.callout.alpha = Math.min(1, this.calloutT * 2);
    } else this.callout.alpha = 0;
  }
}

/** Corner cutaway between rounds: split screen of both corners. */
export function cornerView(A: Fighter, B: Fighter, reports: CornerReport[], round: number): Container {
  const c = new Container();
  const g = new Graphics();
  g.rect(0, 0, AW, AH).fill(0x18141a);
  g.rect(AW / 2 - 1, 0, 2, AH).fill(PAL.ink);
  c.addChild(g);
  c.addChild(text(`END OF ROUND ${round}`, 0, 3, { width: AW, align: 'center', color: PAL.gold }));
  ([A, B] as Fighter[]).forEach((f, i) => {
    const rep = reports.find((r) => r.side === i);
    const ox = i === 0 ? 0 : AW / 2;
    const corner = new Graphics();
    corner.rect(ox + 6, 14, AW / 2 - 12, AH - 18).fill(i === 0 ? 0x2a1818 : 0x18202e);
    // corner post & pads
    corner.rect(ox + (i === 0 ? 8 : AW / 2 - 14), 14, 6, AH - 18).fill(i === 0 ? 0x8a1e1e : 0x1e3a8a);
    c.addChild(corner);
    const wounds = {
      cuts: Math.min(3, Math.ceil((rep?.cut ?? 0) / 3)),
      swelling: Math.min(3, Math.round((100 - (rep?.hp ?? 100)) / 28)),
      blackEye: (rep?.hp ?? 100) < 55 ? 1 : 0,
      bandages: (rep?.cut ?? 0) > 0 ? 1 : 0,
      noseBleed: (rep?.hp ?? 100) < 45,
    };
    const p = portrait({ id: f.id, look: f.look, gender: f.gender, age: f.age, damage: f.damage, wounds, variant: 'corner' }, 64);
    p.position.set(ox + 18, 20);
    c.addChild(p);
    // seated fighter, cutman crouched in front, coach behind the fence
    const st = new Graphics();
    const L = lookFor(f, i as 0 | 1);
    st.rect(ox + 140, 92, 26, 4).fill(0x3a3030);
    st.rect(ox + 144, 96, 3, 10).fill(0x2a2020).rect(ox + 159, 96, 3, 10).fill(0x2a2020);
    drawRig(st, POSES.stool, ox + 152, 108, i === 0 ? 1 : -1, L, 0.85);
    const cut: Look2 = { ...L, trunks: 0x2a2a2a, trim: 0x444444, glove: 0xe0e0e0, hairStyle: 0, beard: 3, build: 2, skin: 0xc08e64 };
    drawRig(st, POSES.clinch, ox + (i === 0 ? 186 : 118), 108, i === 0 ? -1 : 1, cut, 0.7);
    c.addChild(st);
    c.addChild(text(f.last.toUpperCase(), ox + 88, 18, { color: PAL.bone }));
    c.addChild(text(`HP ${rep?.hp ?? '?'}  ${rep?.scoreGuess ?? ''}${rep?.injury ? '  • ' + rep.injury.toUpperCase() : ''}`, ox + 88, 28, { small: true, color: rep && rep.hp < 40 ? PAL.blood : PAL.ash, width: AW / 2 - 96 }));
    c.addChild(text(`COACH: "${rep?.coach ?? 'Breathe.'}"`, ox + 10, 110, { small: true, width: AW / 2 - 20, color: PAL.bone, maxLines: 3 }));
    c.addChild(text(`CUTMAN ${f.cutman.name.toUpperCase()} (${f.cutman.rating}): ${rep?.cutman ?? ''}`, ox + 10, 128, { small: true, width: AW / 2 - 20, color: PAL.ash, maxLines: 3 }));
    if (rep?.quit) c.addChild(text('NOT COMING OUT!', ox + 88, 40, { color: PAL.blood }));
  });
  return c;
}

/** Ring-card walk between rounds. */
export class RingCardWalk extends Container {
  private g = new Graphics();
  private cardLabel: PixelText;
  t = 0;
  private L: Look2 = { skin: 0xdcae88, hairStyle: 5, hairColor: 0x6b4527, beard: 0, build: 0, trunks: 0x1a1a1a, trim: 0xc4a04a, glove: 0xdcae88, stance: 'upright', female: true, tattoo: 0 };
  constructor(round: number) {
    super();
    this.addChild(this.g);
    this.cardLabel = text(`ROUND ${round}`, 0, 0, { color: PAL.ink });
    this.addChild(this.cardLabel);
  }
  update(dt: number): boolean {
    this.t += dt;
    const x = -30 + this.t * 130;
    const g = this.g;
    g.clear();
    const step = Math.floor(this.t * 6) % 2 === 0 ? POSES.walk1 : POSES.walk2;
    const rig: Rig = { ...step, haB: [2, -96], elB: [0, -82], haF: [8, -96], elF: [8, -82] };
    g.ellipse(x, FLOOR + 1, 12, 2).fill({ color: 0, alpha: 0.35 });
    drawRig(g, rig, Math.round(x), FLOOR, 1, this.L);
    g.rect(Math.round(x - 14), FLOOR - 112, 36, 15).fill(0xf0eadc).stroke({ color: PAL.ink, width: 1 });
    this.cardLabel.position.set(Math.round(x - 11), FLOOR - 108);
    return x < AW + 40;
  }
}
