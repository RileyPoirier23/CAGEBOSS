/**
 * Mini side-on arena for spectating fights: animated pixel fighters driven by
 * the fight sim's ticker cues, a flickering pixel crowd, the cage, hit sparks,
 * HP bars and the round clock. Also draws the between-round corner cutaway
 * and the ring-card walk.
 */
import { Container, Graphics } from 'pixi.js';
import type { Fighter, FightResult, TickerLine, CornerReport } from '../core/types';
import { PAL, SKIN_TONES, HAIR_COLORS, shade, lerpColor } from '../art/palette';
import { text } from './kit';
import { PixelText } from './text';
import { portrait } from './sprites';
import { sfx } from '../audio/sfx';

export type Pose =
  | 'idle' | 'jab' | 'punch' | 'hook' | 'uppercut' | 'kick' | 'legkick' | 'headkick' | 'knee' | 'elbow' | 'shoot' | 'sprawl'
  | 'clinch' | 'top' | 'bottom' | 'sub' | 'hurt' | 'down' | 'ko' | 'celebrate' | 'taunt' | 'stool' | 'walk' | 'spin' | 'flyknee';

interface Look2 {
  skin: number;
  hair: number;
  hairColor: number;
  hairStyle: number;
  build: number;
  shorts: number;
  stance: string;
  female: boolean;
}

export const AW = 480;
export const AH = 150;
const FLOOR = 128;

function lookOf(f: Fighter, corner: 0 | 1): Look2 {
  return {
    skin: SKIN_TONES[f.look.skin % SKIN_TONES.length],
    hair: f.look.hair,
    hairColor: lerpColor(HAIR_COLORS[f.look.hairColor % HAIR_COLORS.length], 0x9a9790, Math.max(0, Math.min(1, (f.age - 36) / 14))),
    hairStyle: f.look.hair,
    build: f.look.build,
    shorts: corner === 0 ? 0xa83232 : 0x2f4f8f,
    stance: f.anim?.stance ?? (f.styles.includes('Wrestler') ? 'wrestler' : f.styles.includes('Kickboxer') || f.styles.includes('Muay Thai') ? 'upright' : f.styles.includes('Brawler') ? 'brawler' : f.styles.includes('Showboat') ? 'handsLow' : f.styles.includes('Counter Striker') ? 'sway' : 'bouncy'),
    female: f.gender === 'W',
  };
}

/** Draw a fighter at feet position (x, y). facing 1 = right. */
export function drawFighter(g: Graphics, x: number, y: number, facing: 1 | -1, pose: Pose, t: number, L: Look2): void {
  const sk = L.skin;
  const skD = shade(sk, -0.2);
  const glove = shade(L.shorts, -0.1);
  const wide = L.build; // 0..2
  const tw = 8 + wide * 2; // torso width
  const R = (dx: number, dy: number, w: number, h: number, c: number) => {
    // dx relative to facing
    const xx = facing === 1 ? x + dx : x - dx - w;
    g.rect(Math.round(xx), Math.round(y + dy), w, h).fill(c);
  };
  const head = (dx: number, dy: number) => {
    R(dx - 3, dy - 6, 7, 7, sk);
    R(dx + 2, dy - 4, 1, 1, 0x1c1714); // eye
    if (L.hairStyle > 0) R(dx - 3, dy - 7, 7, L.hairStyle === 1 ? 1 : 2, L.hairColor);
    if (L.hairStyle === 4) R(dx - 1, dy - 9, 3, 3, L.hairColor);
    if (L.hairStyle === 5 || (L.female && L.hairStyle >= 5)) R(dx - 4, dy - 6, 2, 7, L.hairColor);
    if (L.hairStyle === 7) R(dx - 4, dy - 8, 3, 3, L.hairColor);
  };
  const bob = pose === 'idle' ? (L.stance === 'bouncy' ? Math.round(Math.sin(t * 9) * 1.2) : L.stance === 'sway' ? 0 : Math.round(Math.sin(t * 4) * 0.6)) : 0;
  const sway = L.stance === 'sway' && pose === 'idle' ? Math.round(Math.sin(t * 3) * 2) : 0;
  const crouch = L.stance === 'wrestler' || L.stance === 'crouch' ? 3 : 0;
  const yy = y;
  switch (pose) {
    case 'top': {
      // horizontal on top of opponent
      R(-10, -10, 20, 6, sk);
      R(-12, -8, 6, 6, L.shorts);
      head(12, -6);
      R(6, -4, 3, 6, skD);
      R(-16, -6, 5, 3, skD);
      if (Math.sin(t * 14) > 0) R(10, -2, 4, 3, glove);
      return;
    }
    case 'bottom':
    case 'sub': {
      R(-12, -4, 20, 5, sk);
      R(-14, -4, 6, 5, L.shorts);
      head(10, -1);
      // legs up in guard
      R(-18, -12, 3, 9, skD);
      R(-14, -14, 3, 10, skD);
      if (pose === 'sub') {
        R(-6, -14, 14, 3, skD);
        R(4, -12, 3, 6, glove);
      }
      return;
    }
    case 'down':
    case 'ko': {
      R(-14, -4, 22, 5, sk);
      R(-16, -4, 6, 5, L.shorts);
      head(11, 1);
      R(-20, -3, 5, 3, skD);
      if (pose === 'ko') {
        R(2, -7, 8, 2, skD);
        R(2, 1, 8, 2, skD);
      } else R(4, -6, 3, 4, glove);
      return;
    }
    case 'stool': {
      R(-4, -18, tw, 10, sk);
      R(-5, -8, tw + 2, 4, L.shorts);
      R(-3, -4, 3, 4, skD);
      R(3, -4, 3, 4, skD);
      head(0, -18);
      R(-8, -16, 3, 6, skD);
      R(tw - 2, -16, 3, 6, skD);
      return;
    }
    case 'shoot': {
      R(-6, -14, 16, 7, sk);
      R(-10, -12, 6, 7, L.shorts);
      head(14, -10);
      R(-14, -8, 3, 8, skD);
      R(-8, -5, 3, 5, skD);
      R(8, -8, 4, 3, glove);
      return;
    }
    case 'sprawl': {
      R(-8, -10, 16, 6, sk);
      R(-16, -8, 8, 5, L.shorts);
      head(10, -6);
      R(-24, -6, 9, 3, skD);
      return;
    }
    default:
      break;
  }
  // upright poses
  const hy = yy - 34 + bob + crouch;
  // legs
  const legC = skD;
  const lean = pose === 'hurt' ? -2 : 0;
  if (pose === 'kick' || pose === 'legkick' || pose === 'headkick') {
    const kh = pose === 'legkick' ? -8 : pose === 'kick' ? -16 : -26;
    R(-2, hy + 22 - yy, 3, 12, legC); // standing leg
    R(2, kh, 14, 3, legC); // kicking leg
    R(14, kh - 1, 3, 4, sk);
  } else if (pose === 'knee' || pose === 'flyknee') {
    R(-2, hy + 22 - yy, 3, 12, legC);
    R(3, -18 - (pose === 'flyknee' ? 6 : 0), 4, 8, legC);
  } else if (pose === 'walk') {
    const s = Math.sin(t * 8) * 3;
    R(-2 + s, -12, 3, 12, legC);
    R(2 - s, -12, 3, 12, legC);
  } else {
    const spread = L.stance === 'karate' ? 6 : L.stance === 'wrestler' ? 5 : 3;
    R(-spread + lean, -12 + crouch, 3, 12 - crouch, legC);
    R(spread + lean, -12 + crouch, 3, 12 - crouch, legC);
  }
  // shorts
  R(-tw / 2 + lean + sway, hy + 18 - yy, tw, 5, L.shorts);
  // torso
  R(-tw / 2 + lean + sway, hy + 7 - yy, tw, 11, sk);
  if (L.female) R(-tw / 2 + lean + sway, hy + 8 - yy, tw, 4, 0x2a2a2a);
  // head
  const headDX = lean + sway + (pose === 'hurt' ? -2 : 0);
  head(headDX, hy + 7 - yy);
  // arms
  const ax = tw / 2 + sway;
  const shoulderY = hy + 9 - yy;
  const lowHands = L.stance === 'handsLow' && pose === 'idle';
  switch (pose) {
    case 'jab':
      R(ax, shoulderY, 12, 3, sk);
      R(ax + 12, shoulderY - 1, 4, 4, glove);
      R(ax - 2, shoulderY + 2, 3, 3, glove);
      break;
    case 'punch':
    case 'elbow':
      R(ax, shoulderY + 1, pose === 'elbow' ? 6 : 13, 3, sk);
      R(ax + (pose === 'elbow' ? 5 : 13), shoulderY, 4, 4, pose === 'elbow' ? sk : glove);
      R(ax - 1, shoulderY - 2, 3, 3, glove);
      break;
    case 'hook':
      R(ax, shoulderY - 1, 8, 3, sk);
      R(ax + 7, shoulderY - 3, 4, 5, glove);
      R(ax - 1, shoulderY - 2, 3, 3, glove);
      break;
    case 'uppercut':
      R(ax, shoulderY - 4, 3, 7, sk);
      R(ax, shoulderY - 8, 4, 4, glove);
      break;
    case 'spin':
      R(-ax - 12, shoulderY, 12, 3, sk);
      R(-ax - 15, shoulderY - 1, 4, 4, glove);
      break;
    case 'clinch':
      R(ax, shoulderY, 10, 3, sk);
      R(ax, shoulderY + 4, 10, 3, sk);
      break;
    case 'celebrate':
      R(ax - 2, shoulderY - 10, 3, 10, sk);
      R(-ax - 1, shoulderY - 10, 3, 10, sk);
      R(ax - 3, shoulderY - 13, 4, 4, glove);
      R(-ax - 2, shoulderY - 13, 4, 4, glove);
      break;
    case 'taunt':
      R(ax, shoulderY + 2, 8, 3, sk);
      R(-ax - 8, shoulderY + 2, 8, 3, sk);
      break;
    case 'hurt':
      R(ax - 2, shoulderY + 4, 3, 7, sk);
      R(ax - 3, shoulderY + 10, 4, 4, glove);
      break;
    case 'walk':
      R(ax - 1, shoulderY - 12, 3, 12, sk);
      break;
    default: {
      const gy = lowHands ? shoulderY + 7 : shoulderY - 3;
      R(ax, gy + 2, 3, 3, sk);
      R(ax + 2, gy, 4, 4, glove);
      R(ax - 3, gy + 1, 4, 4, glove);
      if (L.stance === 'brawler') R(ax + 4, gy + 3, 3, 3, glove);
    }
  }
}

interface Spark {
  x: number;
  y: number;
  vx: number;
  vy: number;
  life: number;
  c: number;
}

export class ArenaView extends Container {
  private bg = new Graphics();
  private crowd = new Graphics();
  private fx = new Graphics();
  private fighters = new Graphics();
  private hud = new Container();
  private nameA: PixelText;
  private nameB: PixelText;
  private clock: PixelText;
  private callout: PixelText;
  private sparks: Spark[] = [];
  private t = 0;
  private L: [Look2, Look2];
  posX: [number, number] = [170, 310];
  pose: [Pose, Pose] = ['idle', 'idle'];
  poseT: [number, number] = [0, 0];
  hp: [number, number] = [100, 100];
  intensity = 1;
  flash = 0;
  shakeT = 0;
  round = 1;
  sec = 0;
  calloutT = 0;
  ground: 'stand' | 'clinch' | 'atop' | 'btop' = 'stand';
  winnerSide = -1;

  constructor(
    public A: Fighter,
    public B: Fighter,
    public rounds: number,
  ) {
    super();
    this.L = [lookOf(A, 0), lookOf(B, 1)];
    this.addChild(this.bg, this.crowd, this.fighters, this.fx, this.hud);
    this.drawBg();
    this.nameA = text(`${A.first[0]}. ${A.last}`, 6, 4, { color: PAL.bone });
    this.nameB = text(`${B.first[0]}. ${B.last}`, AW - 6 - 120, 4, { color: PAL.bone, width: 120, align: 'right' });
    this.clock = text('R1 5:00', 0, 4, { width: AW, align: 'center', color: PAL.gold });
    this.callout = text('', 0, 40, { width: AW, align: 'center', color: PAL.gold, scale: 2, shadow: PAL.ink });
    this.hud.addChild(this.nameA, this.nameB, this.clock, this.callout);
  }

  private drawBg(): void {
    const g = this.bg;
    g.clear();
    g.rect(0, 0, AW, AH).fill(0x141018);
    // arena lights
    for (let i = 0; i < 8; i++) g.rect(30 + i * 60, 0, 20, 3).fill(0x4a4030);
    // floor / canvas
    g.rect(0, FLOOR, AW, AH - FLOOR).fill(0x2a2a30);
    g.rect(60, FLOOR - 2, 360, 6).fill(0xd8d4cc);
    g.rect(60, FLOOR + 4, 360, AH - FLOOR - 4).fill(0xb8b4ac);
    g.ellipse(AW / 2, FLOOR + 10, 50, 6).fill({ color: PAL.blood, alpha: 0.35 });
    // cage posts & mesh behind fighters
    g.rect(58, 50, 4, 80).fill(0x1b1b1e);
    g.rect(418, 50, 4, 80).fill(0x1b1b1e);
    g.rect(58, 48, 364, 3).fill(0x2b2b30);
    for (let x = 62; x < 418; x += 8) {
      g.moveTo(x, 51).lineTo(x + 8, FLOOR - 2).stroke({ color: 0x3a3a42, width: 1, alpha: 0.6 });
      g.moveTo(x + 8, 51).lineTo(x, FLOOR - 2).stroke({ color: 0x3a3a42, width: 1, alpha: 0.6 });
    }
  }

  private drawCrowd(): void {
    const g = this.crowd;
    g.clear();
    const rows = 5;
    for (let r = 0; r < rows; r++) {
      const y = 14 + r * 7;
      for (let x = (r % 2) * 3; x < AW; x += 6) {
        const n = Math.sin(x * 12.9898 + r * 78.233 + Math.floor(this.t * (2 + this.intensity * 3)) * 3.1) * 43758.5453;
        const on = n - Math.floor(n);
        const c = on > 0.5 + 0.12 * (3 - this.intensity) ? lerpColor(0x4a3a40, 0xc0a890, on * (0.3 + this.intensity * 0.2)) : 0x2a2228;
        const jump = this.intensity >= 3 && on > 0.7 ? -1 : 0;
        g.rect(x, y + jump, 3, 4).fill(c);
      }
    }
    // camera flashes
    if (this.intensity >= 2 && Math.random() < 0.08 * this.intensity) g.rect(Math.random() * AW, 14 + Math.random() * 30, 2, 2).fill(0xffffff);
  }

  /** Apply a ticker line: sets poses, positions, sparks, sounds. */
  cue(line: TickerLine): void {
    this.round = line.round;
    this.sec = line.t;
    this.hp = [line.hp[0], line.hp[1]];
    this.intensity = Math.max(1, line.intensity);
    this.ground = line.pos;
    const a = line.side;
    const d = a === 0 ? 1 : 0;
    const act = line.act;
    const setPose = (i: 0 | 1, p: Pose, dur = 0.45) => {
      this.pose[i] = p;
      this.poseT[i] = dur;
    };
    const hit = (target: 0 | 1, big = false) => {
      const x = this.posX[target];
      for (let i = 0; i < (big ? 14 : 6); i++)
        this.sparks.push({ x, y: FLOOR - 26, vx: (Math.random() - 0.5) * 80, vy: -Math.random() * 60, life: 0.4, c: big ? PAL.gold : 0xffffff });
      if (big) this.shakeT = 0.25;
    };
    const blood = (target: 0 | 1) => {
      for (let i = 0; i < 5; i++) this.sparks.push({ x: this.posX[target], y: FLOOR - 28, vx: (Math.random() - 0.5) * 40, vy: -Math.random() * 30, life: 0.8, c: 0xa01818 });
    };
    // signature move flavour
    const sig = a >= 0 ? (a === 0 ? this.A : this.B).anim?.signature ?? [] : [];
    if (a >= 0 && sig.length && ['punch', 'kick', 'headkick', 'knee', 'elbow'].includes(act) && Math.random() < 0.25) {
      const name = sig[Math.floor(Math.random() * sig.length)];
      this.showCallout(name.replace(/([A-Z])/g, ' $1').toUpperCase() + '!');
    }
    switch (act) {
      case 'jab':
      case 'punch':
      case 'elbow':
      case 'kick':
      case 'legkick':
      case 'headkick':
      case 'knee':
        if (a < 0) break;
        setPose(a as 0 | 1, act === 'punch' ? (Math.random() < 0.4 ? 'hook' : Math.random() < 0.3 ? 'uppercut' : 'punch') : (act as Pose));
        setPose(d as 0 | 1, 'hurt', 0.25);
        hit(d as 0 | 1, act === 'headkick');
        sfx(act.includes('kick') ? 'kick' : 'punch');
        break;
      case 'kd':
        setPose(a as 0 | 1, 'punch');
        setPose(d as 0 | 1, 'down', 1.4);
        hit(d as 0 | 1, true);
        this.flash = 0.25;
        this.showCallout('KNOCKDOWN!');
        sfx('roar');
        break;
      case 'ko':
        setPose(a as 0 | 1, Math.random() < 0.5 ? 'hook' : 'headkick', 0.6);
        setPose(d as 0 | 1, 'ko', 999);
        hit(d as 0 | 1, true);
        this.flash = 0.6;
        this.showCallout('KNOCKOUT!');
        this.winnerSide = a;
        sfx('roar');
        break;
      case 'tko':
        setPose(d as 0 | 1, 'down', 999);
        setPose(a as 0 | 1, 'celebrate', 999);
        this.showCallout('IT\'S STOPPED!');
        this.winnerSide = a;
        sfx('roar');
        break;
      case 'tap':
        this.showCallout('TAP! TAP! TAP!');
        this.winnerSide = a;
        sfx('roar');
        break;
      case 'rocked':
        setPose(d as 0 | 1, 'hurt', 0.9);
        sfx('crowd');
        break;
      case 'td':
        setPose(a as 0 | 1, 'shoot', 0.4);
        sfx('thud');
        break;
      case 'sprawl':
        if (a >= 0) setPose(a as 0 | 1, 'sprawl', 0.4);
        break;
      case 'gnp':
        hit(d as 0 | 1);
        sfx('punch');
        break;
      case 'cut':
        blood(d as 0 | 1);
        break;
      case 'taunt':
        if (a >= 0) setPose(a as 0 | 1, 'taunt', 0.9);
        break;
      case 'injury':
        this.showCallout('INJURY!');
        sfx('snap');
        break;
      case 'foul':
        this.showCallout('FOUL!');
        break;
      case 'stool':
        this.showCallout('RETIRED ON THE STOOL');
        break;
      case 'bell':
        sfx('bell');
        break;
    }
  }

  showCallout(s: string): void {
    this.callout.setText(s);
    this.calloutT = 1.2;
  }

  update(dt: number): void {
    this.t += dt;
    for (const i of [0, 1] as const) {
      if (this.poseT[i] > 0) {
        this.poseT[i] -= dt;
        if (this.poseT[i] <= 0 && this.pose[i] !== 'ko') this.pose[i] = 'idle';
      }
    }
    // spacing by position
    const target: [number, number] =
      this.ground === 'clinch' ? [226, 254] : this.ground === 'atop' || this.ground === 'btop' ? [236, 244] : [200 - Math.sin(this.t * 0.7) * 20, 280 + Math.sin(this.t * 0.9) * 20];
    for (const i of [0, 1] as const) this.posX[i] += (target[i] - this.posX[i]) * Math.min(1, dt * 4);
    this.drawCrowd();
    const g = this.fighters;
    g.clear();
    const shake = this.shakeT > 0 ? Math.round((Math.random() - 0.5) * 3) : 0;
    this.shakeT -= dt;
    const ground = this.ground === 'atop' || this.ground === 'btop';
    for (const i of [0, 1] as const) {
      let pose = this.pose[i];
      if (ground && pose !== 'ko' && pose !== 'down') {
        const onTop = (this.ground === 'atop' && i === 0) || (this.ground === 'btop' && i === 1);
        pose = onTop ? 'top' : this.pose[i] === 'idle' || this.pose[i] === 'hurt' ? 'bottom' : this.pose[i] === 'sub' ? 'sub' : 'bottom';
      }
      if (this.winnerSide === i && this.pose[1 - i] === 'ko' && this.poseT[i] <= 0) pose = 'celebrate';
      drawFighter(g, Math.round(this.posX[i]) + shake, FLOOR - (ground && pose === 'top' ? 4 : 0), i === 0 ? 1 : -1, pose, this.t + i, this.L[i]);
    }
    // sparks
    const f = this.fx;
    f.clear();
    this.sparks = this.sparks.filter((s) => (s.life -= dt) > 0);
    for (const s of this.sparks) {
      s.x += s.vx * dt;
      s.y += s.vy * dt;
      s.vy += 200 * dt;
      f.rect(Math.round(s.x), Math.round(s.y), 2, 2).fill(s.c);
    }
    // HP bars
    f.rect(6, 14, 120, 5).fill(PAL.ink).rect(7, 15, Math.round(118 * this.hp[0] / 100), 3).fill(this.hp[0] > 40 ? PAL.moss : PAL.blood);
    f.rect(AW - 126, 14, 120, 5).fill(PAL.ink).rect(AW - 7 - Math.round(118 * this.hp[1] / 100), 15, Math.round(118 * this.hp[1] / 100), 3).fill(this.hp[1] > 40 ? PAL.moss : PAL.blood);
    f.rect(6, 20, 6, 2).fill(this.L[0].shorts).rect(AW - 12, 20, 6, 2).fill(this.L[1].shorts);
    if (this.flash > 0) {
      f.rect(0, 0, AW, AH).fill({ color: 0xffffff, alpha: Math.min(0.5, this.flash) });
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
    corner.rect(ox + 6, 16, AW / 2 - 12, AH - 22).fill(i === 0 ? 0x2a1818 : 0x18202e);
    corner.rect(ox + 6, AH - 30, AW / 2 - 12, 2).fill(i === 0 ? PAL.blood : PAL.steel);
    c.addChild(corner);
    const wounds = {
      cuts: Math.min(3, Math.ceil((rep?.cut ?? 0) / 3)),
      swelling: Math.min(3, Math.round((100 - (rep?.hp ?? 100)) / 28)),
      blackEye: (rep?.hp ?? 100) < 55 ? 1 : 0,
      bandages: (rep?.cut ?? 0) > 0 ? 1 : 0,
      noseBleed: (rep?.hp ?? 100) < 45,
    };
    const p = portrait({ id: f.id, look: f.look, gender: f.gender, age: f.age, damage: f.damage, wounds, variant: 'corner' }, 64);
    p.position.set(ox + 12, 22);
    c.addChild(p);
    // stool + cutman silhouette
    const st = new Graphics();
    drawFighter(st, ox + 110, 92, i === 0 ? 1 : -1, 'stool', 0, lookOf(f, i as 0 | 1));
    st.rect(ox + 100, 92, 22, 3).fill(0x3a3030);
    st.rect(ox + 132, 58, 8, 22).fill(0x2a2a2a).rect(ox + 133, 52, 6, 6).fill(0xc08e64);
    c.addChild(st);
    c.addChild(text(f.last.toUpperCase(), ox + 82, 20, { color: PAL.bone }));
    c.addChild(text(`HP ${rep?.hp ?? '?'}  ${rep?.scoreGuess ?? ''}${rep?.injury ? '  • ' + rep.injury.toUpperCase() : ''}`, ox + 82, 30, { small: true, color: rep && rep.hp < 40 ? PAL.blood : PAL.ash, width: AW / 2 - 90 }));
    c.addChild(text(`COACH: "${rep?.coach ?? 'Breathe.'}"`, ox + 10, 96, { small: true, width: AW / 2 - 20, color: PAL.bone, maxLines: 3 }));
    c.addChild(text(`CUTMAN (${f.cutman.name}, ${f.cutman.rating}): ${rep?.cutman ?? ''}`, ox + 10, 120, { small: true, width: AW / 2 - 20, color: PAL.ash, maxLines: 3 }));
    if (rep?.quit) c.addChild(text('NOT COMING OUT!', ox + 10, 80, { color: PAL.blood }));
  });
  return c;
}

/** Ring-card walk between rounds. */
export class RingCardWalk extends Container {
  private g = new Graphics();
  private cardLabel: PixelText;
  x0 = -30;
  t = 0;
  constructor(round: number) {
    super();
    this.addChild(this.g);
    this.cardLabel = text(`ROUND ${round}`, 0, 0, { small: true, color: PAL.ink });
    this.addChild(this.cardLabel);
  }
  update(dt: number): boolean {
    this.t += dt;
    const x = this.x0 + this.t * 140;
    const g = this.g;
    g.clear();
    const look: Look2 = { skin: SKIN_TONES[1], hair: 5, hairColor: HAIR_COLORS[3], hairStyle: 5, build: 0, shorts: 0x2a2a2a, stance: 'upright', female: true };
    drawFighter(g, x, FLOOR, 1, 'walk', this.t, look);
    // the round card held overhead
    g.rect(x - 14, FLOOR - 58, 30, 14).fill(0xf0eadc).stroke({ color: PAL.ink, width: 1 });
    this.cardLabel.position.set(x - 12, FLOOR - 54);
    return x < AW + 40;
  }
}
