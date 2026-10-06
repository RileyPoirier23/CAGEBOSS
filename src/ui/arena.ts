/**
 * Side-on arena for spectating fights. Skeletal fighters (rig.ts) trade
 * shots at real striking range: lunges, recoils, clinches against the fence,
 * takedowns and ground work, knockdowns and KOs. Pixel crowd, octagon fence,
 * spotlights, sweat/blood/impact particles, HP bars and the round clock.
 * Also: the between-round corner cutaway and the ring-card walk.
 */
import { Assets, Container, Graphics, Sprite, type Texture } from 'pixi.js';
import type { Fighter, TickerLine, CornerReport } from '../core/types';
import { PAL, shade, lerpColor } from '../art/palette';
import { text } from './kit';
import { PixelText, pixelArtResolution } from './text';
import { portrait } from './sprites';
import { sfx } from '../audio/sfx';
import { heightStr } from '../core/format';
import { Rig, Pose, POSES, drawRig, lerpRig, mirrorRig, lookFor, stanceGuard, Look2 } from './rig';

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
  /** footwork: velocity, distance travelled (drives the stepping), preferred range offset */
  v?: number;
  dist?: number;
  foot?: number;
  footT?: number;
  /** head snap after taking a shot (decays) */
  snap?: number;
}

/** Blood on the canvas lasts the whole event; a new event gets a fresh mat. */
const MAT = { key: '', stains: [] as { x: number; y: number; r: number; c: number }[] };

export type CamMode = 'side' | 'tv' | 'top';

/** Poses where the fighter is on his back, so his face points at the lights. */
const SUPINE = new Set(['gBot', 'mBot', 'sBot', 'abVic', 'atriVic', 'kimVic', 'legVic', 'guilAtk', 'triAtk', 'abAtk', 'legAtk', 'bottom', 'bottomSub', 'ko', 'down']);

type GroundSpot = 'guard' | 'mount' | 'side' | 'back';
type SubKind = 'rnc' | 'guil' | 'tri' | 'ab' | 'atri' | 'kim' | 'leg';

/** Pose pairs per position: [top/attacker, bottom/victim, punch variant, who is drawn last]. */
const SPOTS: Record<GroundSpot, { a: Pose; d: Pose; punch: Pose; front: 'a' | 'd' }> = {
  guard: { a: 'gTop', d: 'gBot', punch: 'gTopPunch', front: 'a' },
  mount: { a: 'mTop', d: 'mBot', punch: 'mTopPunch', front: 'a' },
  side: { a: 'sTop', d: 'sBot', punch: 'sTopPunch', front: 'a' },
  back: { a: 'bkTop', d: 'bkBot', punch: 'bkTopPunch', front: 'd' },
};
const SUBS: Record<SubKind, { a: Pose; d: Pose; front: 'a' | 'd' }> = {
  rnc: { a: 'rncAtk', d: 'rncVic', front: 'd' },
  guil: { a: 'guilAtk', d: 'guilVic', front: 'a' },
  tri: { a: 'triAtk', d: 'triVic', front: 'a' },
  ab: { a: 'abAtk', d: 'abVic', front: 'a' },
  atri: { a: 'atriAtk', d: 'atriVic', front: 'a' },
  kim: { a: 'kimAtk', d: 'kimVic', front: 'a' },
  leg: { a: 'legAtk', d: 'legVic', front: 'a' },
};

/** Read the hold out of the ticker line; fall back on what makes sense from where the attacker is. */
function subKindFor(text: string, attackerOnTop: boolean): SubKind {
  const t = text.toLowerCase();
  if (/rear-naked|twister|von flue/.test(t)) return 'rnc';
  if (/guillotine|anaconda|d'arce|ezekiel/.test(t)) return attackerOnTop ? 'atri' : 'guil';
  if (/triangle choke|gogoplata/.test(t)) return 'tri';
  if (/arm-triangle|north-south/.test(t)) return 'atri';
  if (/armbar/.test(t)) return 'ab';
  if (/kimura|americana/.test(t)) return 'kim';
  if (/heel hook|kneebar|calf slicer|toe hold|banana split|suloev/.test(t)) return 'leg';
  return attackerOnTop ? 'atri' : 'tri';
}

/** Where the TV info card sits during walkout intros (under the event name and LIVE bug). */
const TV_TOP_Y = 36;
/** Half the distance between the two when they touch gloves (lead arms out, gloves just meeting). */
const TOUCH_GAP = 27;
/** Corner stools (x) for each side. */
const CORNERS = [CAGE_L + 26, CAGE_R - 26];
/**
 * Feet-to-feet distance an attack needs to land (guard pose reach + lunge into the man's face or body).
 * Further apart than this and the attacker steps in before the line plays.
 */
const REACH: Record<string, number> = {
  jab: 50, cross: 46, punch: 46, kd: 46, ko: 48, tko: 46, foul: 44, elbow: 38, knee: 36,
  legkick: 48, kick: 50, headkick: 52, td: 46, sprawl: 46, clinch: 36, sub: 28,
};
type ArenaScene = 'intro' | 'fight' | 'ceremony';

interface Actor {
  rig: Rig;
  pose: Pose;
  x: number;
  tx: number;
  facing: 1 | -1;
  look: Look2;
  visible: boolean;
  spin: number; // >0 while doing the Buffer 360
}

const REF_LOOK: Look2 = {
  skin: 0x8d5a3b, hairStyle: 0, hairColor: 0x1a1412, beard: 2, build: 1, trunks: 0x111111, trim: 0x111111, glove: 0x2a5aa8,
  stance: 'upright', female: false, tattoo: 0,
  // referee kit: black short-sleeve collared shirt, black slacks, blue exam gloves, plain badge
  outfit: { top: 0x141418, bottom: 0x1c1c22, bulk: 0, shortSleeves: true, hands: 0x4a7ad8, patch: 0xd8d8d8 },
};
const BUTLER_LOOK: Look2 = {
  // the legend: deep tan, silver hair slicked back, black tux, black bow tie, built like a fridge
  skin: 0xc98d5e, hairStyle: 2, hairColor: 0xc8c4bc, beard: 0, build: 3, trunks: 0x111111, trim: 0x111111, glove: 0xc98d5e,
  stance: 'upright', female: false, tattoo: 0, brows: 1,
  outfit: { top: 0x101014, bottom: 0x101014, shirt: 0xf6f3ea, tie: 0x0a0a0c, bulk: 4, mic: true },
};

// top-down octagon geometry
const TCX = AW / 2;
const TCY = 76;
const TR = 66;

export class ArenaView extends Container {
  private world = new Container(); // camera transform
  private worldInner = new Container(); // pixel-art render cache
  private bg = new Graphics();
  private crowd = new Graphics();
  private lights = new Graphics();
  private fighters = new Graphics();
  private fx = new Graphics();
  private front = new Graphics();
  private top = new Graphics();
  private topFx = new Graphics();
  private topLogo = new Sprite();
  private topStain = new Graphics();
  private topLight = new Graphics();
  private topStainsDrawn = -1;
  private topWorld = new Container();
  private hud = new Container();
  private hudG = new Graphics();
  private tv = new Container();
  private tvG = new Graphics();
  private tvLower: PixelText;
  private tvLower2: PixelText;
  private tvTag: PixelText;
  private topLabels = new Container();
  private clock: PixelText;
  private callout: PixelText;
  private parts: Part[] = [];
  private tparts: Part[] = [];
  private t = 0;
  private L: [Look2, Look2];
  private F: [FState, FState];
  private ref: Actor;
  private butler: Actor;
  private center = AW / 2;
  private drift = 0;
  // camera
  mode: CamMode = 'side';
  private cam = { x: AW / 2, y: AH / 2, z: 1 };
  private shot = { x: AW / 2, y: AH / 2, z: 1, hold: 0, slowZoom: 0 };
  private lowerT = 0;
  // top-down state
  private tc = { x: TCX, y: TCY, ang: 0 };
  scene: ArenaScene = 'fight';
  private introFocus: -1 | 0 | 1 = -1;
  hp: [number, number] = [100, 100];
  intensity = 1;
  flash = 0;
  shakeT = 0;
  round = 1;
  sec = 0;
  private lowerTop = false;
  private tdT = 0;
  private tdAtk: 0 | 1 = 0;
  private stainG = new Graphics();
  private stainsDrawn = -1;
  private matLogo = new Sprite();
  /** walking out of the corners to meet in the middle: no exchanges until they get there */
  private walkIn = false;
  private walkT = 0;
  /** the bell went: both men walk back to their corners */
  private roundOver = false;
  /** before the opening bell: everyone stays where they are (corners, or the walkout spots) */
  private prefight = true;
  /** the referee is busy (separating, checking a downed man): he holds his spot */
  private refHold = 0;
  /** fight-speed setting (1 = normal): walk-outs, glove touches and the walk back to the corners hurry up with it */
  pace = 1;
  /** lines waiting for the fighters to be in range; the attacker steps in to close the gap first */
  private held: TickerLine[] = [];
  private engage: { atk: 0 | 1; reach: number; t: number } | null = null;
  /** where the pair went down: ground work stays on that patch of canvas instead of sliding around */
  private groundX = AW / 2;
  private slowTag!: PixelText;
  private touchT = 0; // round 1: ref brings them together, they touch gloves
  private slowT = 0; // slow motion after knockdowns / knockouts
  private clapped = new Set<number>();
  private resting = false;
  private drawPose: [string, string] = ['guard', 'guard'];
  // grappling: which position we're in, and which submission is being cranked (attacker side)
  private groundPos: GroundSpot = 'guard';
  private subAnim: { kind: SubKind; atk: 0 | 1; t: number; tapped: boolean } | null = null;
  private gnpT = 0;
  private lowerCorner: 0 | 1 = 0;
  calloutT = 0;
  ground: 'stand' | 'clinch' | 'atop' | 'btop' = 'stand';
  winnerSide = -1;
  finished = false;

  constructor(
    public A: Fighter,
    public B: Fighter,
    public rounds: number,
    private info: { network?: string; event?: string; promo?: string; champs?: [boolean, boolean]; eventKey?: string } = {},
  ) {
    super();
    const key = info.eventKey ?? info.event ?? '';
    if (MAT.key !== key) {
      MAT.key = key;
      MAT.stains = [];
    }
    this.L = [lookFor(A, 0, info.champs?.[0]), lookFor(B, 1, info.champs?.[1])];
    this.F = [
      { rig: { ...POSES.guard }, pose: 'guard', poseT: 0, x: CORNERS[0], lunge: 0, recoil: 0, facing: 1 },
      { rig: { ...POSES.guard }, pose: 'guard', poseT: 0, x: CORNERS[1], lunge: 0, recoil: 0, facing: -1 },
    ];
    this.ref = { rig: { ...POSES.stand }, pose: 'stand', x: AW / 2 + 70, tx: AW / 2 + 70, facing: -1, look: REF_LOOK, visible: true, spin: 0 };
    this.butler = { rig: { ...POSES.mic }, pose: 'mic', x: AW / 2, tx: AW / 2, facing: 1, look: BUTLER_LOOK, visible: false, spin: 0 };
    this.worldInner.addChild(this.bg, this.matLogo, this.stainG, this.crowd, this.lights, this.fighters, this.fx, this.front);
    // the promotion's logo painted on the canvas, squashed into the floor's perspective
    Assets.load(`${import.meta.env.BASE_URL}mat-logo.png`).then((tex: Texture) => {
      if (this.destroyed) return;
      this.matLogo.texture = tex;
      this.matLogo.anchor.set(0.5);
      this.matLogo.scale.set(0.42, 0.075);
      this.matLogo.position.set(AW / 2, FLOOR + 1);
      this.matLogo.alpha = 0.8;
    }).catch(() => {});
    this.world.addChild(this.worldInner);
    this.topWorld.addChild(this.top, this.topLogo, this.topStain, this.topFx, this.topLight);
    Assets.load(`${import.meta.env.BASE_URL}mat-logo.png`).then((tex: Texture) => {
      if (this.destroyed) return;
      this.topLogo.texture = tex;
      this.topLogo.anchor.set(0.5);
      this.topLogo.scale.set(0.2);
      this.topLogo.position.set(TCX, TCY);
      this.topLogo.alpha = 0.55;
    }).catch(() => {});
    this.addChild(this.world, this.topWorld, this.topLabels, this.hudG, this.hud, this.tv);
    // pixel-art look: the arena renders into a low-res buffer (no anti-aliasing)
    const res = pixelArtResolution();
    this.worldInner.cacheAsTexture({ resolution: res, antialias: false });
    this.topWorld.cacheAsTexture({ resolution: res, antialias: false });
    this.drawBg();
    this.drawTopStatic();
    this.hud.addChild(text(`${A.first[0]}. ${A.last}`, 6, 3, { color: PAL.bone }));
    this.hud.addChild(text(`${B.first[0]}. ${B.last}`, AW - 126, 3, { color: PAL.bone, width: 120, align: 'right' }));
    this.clock = text('R1 5:00', 0, 3, { width: AW, align: 'center', color: PAL.gold });
    this.callout = text('', 0, 46, { width: AW, align: 'center', color: PAL.gold, scale: 2, shadow: PAL.ink });
    this.hud.addChild(this.clock, this.callout);
    this.slowTag = text('SLOW MO', AW - 58, AH - 8, { small: true, color: 0xffffff });
    this.slowTag.visible = false;
    this.hud.addChild(this.slowTag);
    // TV graphics
    this.tv.addChild(this.tvG);
    this.tvTag = text('● LIVE', AW - 50, 26, { small: true, color: 0xffffff });
    this.tv.addChild(text((info.event ?? '').toUpperCase(), 6, 26, { small: true, color: PAL.gold, shadow: PAL.ink }));
    this.tvLower = text('', 18, AH - 27, { color: PAL.bone });
    this.tvLower2 = text('', 18, AH - 16, { small: true, color: PAL.ash, width: 300 });
    this.tv.addChild(this.tvTag, this.tvLower, this.tvLower2);
    this.setMode('side');
  }

  setMode(m: CamMode): void {
    this.mode = m;
    const top = m === 'top' && this.scene === 'fight';
    this.world.visible = !top;
    this.topWorld.visible = top;
    this.topLabels.visible = top;
    this.tv.visible = m === 'tv';
    if (m !== 'tv') this.applyCam(AW / 2, AH / 2, 1, true);
    else this.shot.hold = 0;
  }

  // ------------------------------------------------------------ backgrounds

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
    // big screens
    g.rect(150, 1, 60, 8).fill(0x0e1420).rect(270, 1, 60, 8).fill(0x0e1420);
    // ---- the octagon in perspective: canvas, apron, eight fence panels
    const cx = AW / 2;
    const cy = FLOOR + 1;
    const oct = (R: number, r: number, lift = 0): [number, number][] =>
      Array.from({ length: 8 }, (_, k) => {
        const a = ((22.5 + k * 45) * Math.PI) / 180;
        return [cx + Math.cos(a) * R, cy + Math.sin(a) * r - lift] as [number, number];
      });
    const floor = oct(232, 17);
    const apron = oct(246, 22);
    g.poly(apron.flat()).fill(0x141015);
    g.poly(floor.flat()).fill(0xcfc8b9);
    g.poly(floor.flat()).stroke({ color: 0x8a8274, width: 1 }); // canvas edge
    // canvas wear and the centre logo
    g.poly(oct(150, 10).flat()).fill({ color: 0xbdb5a5, alpha: 0.35 });
    g.ellipse(cx, cy + 1, 70, 8).stroke({ color: 0xa83232, width: 2, alpha: 0.6 });
    g.ellipse(cx, cy + 1, 40, 4.5).fill({ color: 0xa83232, alpha: 0.25 });
    g.rect(cx - 150, cy + 6, 40, 3).fill({ color: 0x2a4a86, alpha: 0.35 });
    g.rect(cx + 110, cy + 6, 40, 3).fill({ color: 0x2a4a86, alpha: 0.35 });
    // fence: the back five panels, each rising from the floor edge
    const H = 86;
    const back = [3, 4, 5, 6, 7, 0].map((k) => floor[k]); // left-front .. back .. right-front, round the far side
    for (let k = 0; k < back.length - 1; k++) {
      const [x0, y0] = back[k];
      const [x1, y1] = back[k + 1];
      if (y0 > cy + 6 && y1 > cy + 6) continue; // front panels are drawn over the fighters
      const far = 1 - Math.min(1, Math.max(0, (Math.min(y0, y1) - (cy - 17)) / 34)); // further panels are darker
      const panel: number[] = [x0, y0 - 10, x1, y1 - 10, x1, y1 - H, x0, y0 - H];
      // alternate the facets' tone so the eight sides read as an octagon
      const facet = k % 2 === 0 ? 0x221f2a : 0x15131a;
      g.poly(panel).fill({ color: lerpColor(facet, 0x0d0b10, far * 0.5), alpha: 0.96 });
      // chain-link diamonds
      const steps = Math.max(2, Math.round(Math.abs(x1 - x0) / 4));
      for (let yy = 0; yy < H - 12; yy += 4) {
        for (let i = 0; i < steps; i++) {
          const t = (i + (yy % 8 ? 0.5 : 0)) / steps;
          const px = x0 + (x1 - x0) * t;
          const py = y0 + (y1 - y0) * t - 12 - yy;
          g.rect(Math.round(px), Math.round(py), 1, 1).fill(far > 0.5 ? 0x34343c : 0x4a4a54);
        }
      }
      g.moveTo(x0, y0 - H).lineTo(x1, y1 - H).stroke({ color: 0x8a1e1e, width: 3 }); // padded top rail
      g.moveTo(x0, y0 - 10).lineTo(x1, y1 - 10).stroke({ color: 0x1d1d22, width: 3 }); // bottom pad
    }
    // posts at the corners of the back panels
    for (const [x, y] of back) {
      if (y > cy + 6) continue;
      g.rect(x - 2, y - H - 3, 5, H - 6).fill(0x0e0e11);
      g.rect(x - 3, y - H - 5, 7, 4).fill(0x3a3a42);
    }
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
    // jumbotrons show the action
    const sc = this.scene === 'intro' ? 0x3a2a14 : this.intensity >= 3 ? 0x5a1a1a : 0x1a2a40;
    g.rect(152, 2, 56, 6).fill(sc).rect(272, 2, 56, 6).fill(sc);
    // spotlights over the cage
    const l = this.lights;
    l.clear();
    l.poly([AW / 2 - 30, 16, AW / 2 + 30, 16, AW / 2 + 150, FLOOR, AW / 2 - 150, FLOOR]).fill({ color: 0xfff2d0, alpha: 0.05 + this.intensity * 0.01 });
    // moving heads: four coloured beams sweeping the cage, wilder for walkouts and big moments
    const hype = this.scene === 'intro' ? 1 : this.intensity >= 3 ? 0.8 : this.scene === 'ceremony' ? 0.7 : 0.25;
    const beamCols = [0x3a7aff, 0xff3a4a, 0xffffff, 0xb04aff];
    for (let b = 0; b < 4; b++) {
      const ox = 60 + b * 120;
      const sweep = Math.sin(this.t * (0.7 + b * 0.23) + b * 1.7) * (90 + hype * 60);
      const tx = ox + sweep;
      const col = this.scene === 'intro' ? beamCols[(b + Math.floor(this.t * 1.5)) % 4] : beamCols[b];
      l.poly([ox - 2, 14, ox + 2, 14, tx + 22, FLOOR + 6, tx - 22, FLOOR + 6]).fill({ color: col, alpha: 0.035 + hype * 0.05 });
      l.ellipse(tx, FLOOR + 4, 22, 3).fill({ color: col, alpha: 0.05 + hype * 0.07 });
    }
    // LED strip along the top of the back fence: a chase that speeds up with the crowd
    const rail = 236;
    for (let i = 0; i < 46; i++) {
      const x = AW / 2 - rail + 22 + i * 9.8;
      const on = (i + Math.floor(this.t * (4 + this.intensity * 3))) % 6 < 2;
      l.rect(Math.round(x), FLOOR - 88 + Math.round(Math.abs(x - AW / 2) / 30), 3, 1).fill({ color: on ? (this.intensity >= 3 ? 0xff4040 : 0xffd27a) : 0x3a2a20, alpha: on ? 0.9 : 0.5 });
    }
    // strobe on knockdowns and finishes
    if (this.flash > 0.05) l.rect(0, 0, AW, AH).fill({ color: 0xffffff, alpha: Math.min(0.18, this.flash * 0.6) });
    l.ellipse(AW / 2 + this.drift, FLOOR + 1, 110, 10).fill({ color: 0xfff2d0, alpha: 0.08 });
    if (this.scene === 'intro') {
      const fx = this.introFocus < 0 ? this.butler.x : this.F[this.introFocus as 0 | 1].x;
      l.poly([fx - 6, 16, fx + 6, 16, fx + 30, FLOOR + 4, fx - 30, FLOOR + 4]).fill({ color: 0xfff2d0, alpha: 0.12 });
    }
  }

  /** Top-down octagon: mat, fence, crowd, commentary desk, judges. */
  private drawTopStatic(): void {
    const g = this.top;
    g.clear();
    g.rect(0, 0, AW, AH).fill(0x110d11);
    // crowd ring
    for (let i = 0; i < 520; i++) {
      const n = Math.sin(i * 91.7) * 43758.5453;
      const v = n - Math.floor(n);
      const a = (i / 520) * Math.PI * 2 * 7;
      const rr = 92 + (i % 7) * 9 + v * 4;
      const x = TCX + Math.cos(a) * rr * 1.6;
      const y = TCY + Math.sin(a) * rr * 0.62;
      if (y < 2 || y > AH - 2) continue;
      g.circle(x, y, 2).fill(lerpColor(0x241c22, 0x4a3a40, v));
    }
    // floor around the cage
    const oct = (r: number) => {
      const pts: number[] = [];
      for (let k = 0; k < 8; k++) {
        const a = Math.PI / 8 + (k * Math.PI) / 4;
        pts.push(TCX + Math.cos(a) * r, TCY + Math.sin(a) * r);
      }
      return pts;
    };
    g.poly(oct(TR + 14)).fill(0x1c171b);
    g.poly(oct(TR + 3)).fill(0x2a2a30);
    g.poly(oct(TR)).fill(0xcfc9bc);
    // mat art
    g.circle(TCX, TCY, 26).stroke({ color: 0xa83232, width: 2, alpha: 0.55 });
    g.circle(TCX, TCY, 14).fill({ color: 0xa83232, alpha: 0.18 });
    g.rect(TCX - 46, TCY - 40, 26, 6).fill({ color: 0x2a4a86, alpha: 0.3 });
    g.rect(TCX + 20, TCY + 34, 26, 6).fill({ color: 0x2a4a86, alpha: 0.3 });
    // fence & posts
    g.poly(oct(TR + 1)).stroke({ color: 0x0c0c0e, width: 3 });
    const p = oct(TR + 1);
    for (let k = 0; k < 8; k++) g.circle(p[k * 2], p[k * 2 + 1], 3).fill(0x8a1e1e);
    // corners: red (left-up) and blue (right-down) stools
    g.rect(p[10] - 6, p[11] - 4, 8, 8).fill(0x9e2a2a);
    g.rect(p[2] - 2, p[3] - 4, 8, 8).fill(0x284a86);
    // commentary desk
    g.rect(24, 112, 116, 16).fill(0x2a2228).rect(24, 112, 116, 3).fill(0x4a3a40);
    for (let k = 0; k < 3; k++) {
      const hx = 44 + k * 38;
      g.circle(hx, 122, 6).fill(0x15151a);
      g.circle(hx, 120, 3.5).fill([0xe0b48c, 0xd8a47c, 0x6e4630][k]);
      g.rect(hx - 6, 112, 12, 3).fill(0xc4a04a); // monitors
    }
    // judges
    for (let k = 0; k < 3; k++) {
      const jy = 28 + k * 46;
      g.rect(AW - 70, jy - 6, 40, 12).fill(0x2a2228);
      g.circle(AW - 50, jy + 6, 4).fill(0x15151a);
      g.circle(AW - 50, jy + 5, 2.5).fill(0xc8a080);
    }
    this.topLabels.removeChildren().forEach((c) => c.destroy());
    this.topLabels.addChild(text('ANIK  •  HOGAN  •  SANDWICH', 24, 131, { small: true, color: PAL.ash }));
    this.topLabels.addChild(text('JUDGES', AW - 66, AH - 12, { small: true, color: PAL.ash }));
    this.topLabels.addChild(text('RED', TCX - TR - 8, 22, { small: true, color: 0xc85a5a }));
    this.topLabels.addChild(text('BLUE', TCX + TR - 8, AH - 30, { small: true, color: 0x6a8ad8 }));
  }

  // ------------------------------------------------------------ scenes

  /** Juiced Butler time: fighters in their corners, announcer centre stage. */
  startIntro(): void {
    this.scene = 'intro';
    this.F[0].x = CAGE_L + 60;
    this.F[1].x = CAGE_R - 60;
    this.butler.visible = true;
    this.butler.x = this.butler.tx = AW / 2;
    this.ref.x = this.ref.tx = AW / 2 + 90;
    this.setMode(this.mode);
  }

  introCue(corner: 0 | 1 | undefined, stage: boolean, line: string): void {
    const b = this.butler;
    if (stage) {
      if (/360|spin|180/i.test(line)) b.spin = 0.7;
      else if (/flex|lats|bicep|pose/i.test(line)) this.setActor(b, 'flex');
      this.introFocus = -1;
      return;
    }
    if (corner === undefined) {
      this.setActor(b, 'mic');
      b.facing = 1;
      this.introFocus = -1;
      return;
    }
    // the Buffer 180: whip around and point at the corner being introduced
    const want = corner === 0 ? -1 : 1;
    if (b.facing !== want) b.spin = 0.35;
    b.facing = want as 1 | -1;
    this.setActor(b, /!!!$/.test(line) ? 'point' : 'mic');
    if (this.introFocus !== corner && this.mode === 'tv') this.lowerThird(corner);
    this.introFocus = corner;
    if (/!!!$/.test(line)) {
      this.F[corner].pose = 'taunt';
      this.F[corner].poseT = 1.2;
      this.intensity = 3;
      this.flash = 0.15;
      if (this.mode === 'tv') this.lowerThird(corner);
    }
  }

  startFight(): void {
    this.scene = 'fight';
    this.butler.visible = false;
    this.introFocus = -1;
    this.setActor(this.ref, 'stand');
    this.setMode(this.mode);
  }

  /** Both fighters to the centre, referee between them holding their wrists. */
  startCeremony(): void {
    this.scene = 'ceremony';
    this.butler.visible = true;
    this.butler.x = this.butler.tx = AW / 2 + 78;
    this.butler.facing = -1;
    this.setActor(this.butler, 'mic');
    this.ref.tx = AW / 2;
    this.ref.facing = 1;
    this.setActor(this.ref, 'refHold');
    for (const i of [0, 1] as const) {
      this.F[i].pose = 'stand';
      this.F[i].poseT = 9999;
    }
    this.ground = 'stand';
    this.setMode(this.mode);
  }

  ceremonyCue(line: string): void {
    this.setActor(this.butler, /!!!$/.test(line) ? 'point' : 'mic');
  }

  /** The moment: referee raises the winner's hand. */
  raiseHand(side: -1 | 0 | 1): void {
    if (side < 0) {
      this.setActor(this.ref, 'flex');
      for (const i of [0, 1] as const) this.F[i].pose = 'armUp';
      return;
    }
    const w = side as 0 | 1;
    this.ref.facing = w === 1 ? 1 : -1;
    this.setActor(this.ref, 'refRaise');
    this.F[w].pose = 'armUp';
    this.F[(1 - w) as 0 | 1].pose = 'headDown';
    this.winnerSide = w;
    this.intensity = 3;
    this.flash = 0.2;
    this.burst(this.F[w].x, FLOOR - 100, 24, PAL.gold, 90, 0.9, 2, 60);
    this.burst(this.F[w].x, FLOOR - 100, 18, 0xffffff, 90, 0.9, 1, 60);
    if (this.mode === 'tv') this.lowerThird(w, 'WINNER');
  }

  /** Send the referee somewhere with a job to do (he stops circling for a moment). */
  private refTo(x: number, hold = 1.6): void {
    this.ref.tx = x;
    this.refHold = hold;
  }

  private setActor(a: Actor, p: Pose): void {
    a.pose = p;
  }

  private lowerThird(i: 0 | 1, tag?: string): void {
    const f = i === 0 ? this.A : this.B;
    this.lowerCorner = i;
    // during the walkout intros the card sits at the top so it never fights the subtitles
    const top = this.scene === 'intro';
    const y = top ? TV_TOP_Y : AH - 30;
    this.tvLower.position.set(18, y + 3);
    this.tvLower2.position.set(18, y + 14);
    this.tvLower.setText(`${tag ? tag + ': ' : ''}${f.first} ${f.nick ? `"${f.nick}" ` : ''}${f.last}`.toUpperCase());
    this.tvLower2.setText(
      top
        ? `${f.record.w}-${f.record.l}${f.record.d ? '-' + f.record.d : ''}  •  ${heightStr(f.height)}  •  ${f.hometown.split('|')[0]}, ${f.country}  •  ${f.gym}`
        : `${f.record.w}-${f.record.l}${f.record.d ? '-' + f.record.d : ''}  •  ${f.hometown.split('|')[0]}, ${f.country}  •  ${f.gym}`,
    );
    this.lowerTop = top;
    this.lowerT = top ? 4.5 : 3.2;
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

  private burst(x: number, y: number, n: number, color: number, speed = 70, life = 0.35, size = 2, grav = 220, top = false): void {
    const arr = top ? this.tparts : this.parts;
    for (let k = 0; k < n; k++) {
      arr.push({ x, y, vx: (Math.random() - 0.5) * speed * 2, vy: top ? (Math.random() - 0.5) * speed * 2 : -Math.random() * speed, life: life * (0.6 + Math.random() * 0.6), c: color, s: size, grav: top ? 0 : grav });
    }
  }

  private impact(attacker: 0 | 1, joint: 'haF' | 'haB' | 'ftB' | 'knB' | 'elB', big: boolean, bloody: boolean): void {
    const def = (1 - attacker) as 0 | 1;
    this.F[attacker].lunge = 7;
    this.F[def].recoil = big ? 9 : 5;
    // the man who got hit reacts: head snaps, he's knocked back a step, body shots fold him,
    // big ones buckle the knees
    const D = this.F[def];
    const head = joint !== 'ftB' && joint !== 'knB';
    if (head) D.snap = big ? 1.6 : 0.8;
    if (this.ground === 'stand' || this.ground === 'clinch') {
      D.v = (D.v ?? 0) - D.facing * (big ? 120 : 60);
      if (D.poseT <= 0 || D.pose === 'guard') {
        if (joint === 'knB' || (!head && big)) this.setPose(def, 'doubled', 0.4); // folded over
        else if (big) this.setPose(def, 'rocked', 0.45);
        else if (Math.random() < 0.5) this.setPose(def, 'hurt', 0.2);
      }
    }
    const [x, y] = this.handPos(attacker, joint);
    this.burst(x, y, big ? 16 : 7, big ? PAL.gold : 0xffffff, big ? 110 : 60, 0.3, big ? 2 : 1);
    this.burst(x, y, 4, 0xbfe0ff, 40, 0.5, 1, 120); // sweat
    if (bloody) this.burst(x, y, 6, 0xa01818, 45, 0.9, 2);
    // same hit, top-down
    const [hx, hy] = this.topPos(def);
    this.burst(hx, hy, big ? 12 : 5, big ? PAL.gold : 0xffffff, big ? 60 : 35, 0.3, big ? 2 : 1, 0, true);
    if (bloody) this.burst(hx, hy, 5, 0xa01818, 25, 1.5, 2, 0, true);
    if (big) this.shakeT = 0.25;
    if (big && this.mode === 'tv') this.cutTo('close', 0.25);
  }

  /**
   * Feed a ticker line. Anything that needs contact (strikes, clinch entries, shots) waits until
   * the attacker has stepped into range, so nobody ever lands a punch on air from across the cage.
   * `instant` applies the line on the spot (rebuilding the view mid-fight).
   */
  cue(line: TickerLine, instant = false): void {
    if (instant) return this.apply(line);
    this.held.push(line);
    this.pumpHeld(0);
  }

  /** True while the arena is still acting something out that the next line must not interrupt. */
  busy(): boolean {
    if (this.scene !== 'fight' || this.finished) return false;
    return this.held.length > 0 || this.walkIn || this.touchT > 0 || (this.roundOver && this.walkT < 2.5 && !this.atCorners());
  }

  /** Rebuilt mid-fight (lines replayed instantly): put everyone where the last line left them. */
  settle(): void {
    for (const l of this.held.splice(0)) this.apply(l);
    this.engage = null;
    this.walkIn = false;
    this.touchT = 0;
    const ground = this.ground === 'atop' || this.ground === 'btop';
    this.F.forEach((f, i) => {
      f.v = 0;
      if (!this.prefight) f.x = this.resting || this.roundOver ? CORNERS[i] : ground ? this.groundX : this.center + (i === 0 ? -23 : 23);
    });
  }

  private atCorners(): boolean {
    return this.F.every((f, i) => Math.abs(f.x - CORNERS[i]) < 6);
  }

  /** How close (feet to feet) the attacker must be for this line to connect; 0 = no range needed. */
  private reachFor(line: TickerLine): number {
    if (line.speaker || line.side < 0 || this.scene !== 'fight' || this.finished) return 0;
    if (this.ground !== 'stand' && this.ground !== 'clinch') return 0; // tangled up on the mat already
    const r = REACH[line.act] ?? 0;
    return r && /^miss_/.test(line.key ?? '') ? r + 8 : r;
  }

  /** Release held lines once their attacker is in range (or after a beat, so a fight can never stall). */
  private pumpHeld(dt: number): void {
    while (this.held.length) {
      const line = this.held[0];
      const reach = this.reachFor(line);
      if (reach) {
        // nobody throws at a man who is still picking himself up off the canvas
        const floored = this.F.some((f) => f.pose === 'down' && f.poseT > 0);
        const ready = !this.walkIn && this.touchT <= 0 && !this.resting && !this.roundOver && !this.prefight && !floored;
        const d = Math.abs(this.F[1].x - this.F[0].x);
        if (!ready || d > reach + 2) {
          if (!this.engage) this.engage = { atk: (line.act === 'sprawl' ? 1 - line.side : line.side) as 0 | 1, reach, t: 0 };
          this.engage.t += dt;
          if (this.engage.t < (ready ? 1.2 : 8)) return;
        }
      }
      this.held.shift();
      this.engage = null;
      // (if we gave up waiting, the downed man is back on his feet for it)
      if (reach) for (const i of [0, 1] as const) if (this.F[i].pose === 'down' && this.F[i].poseT > 0 && this.F[i].poseT < 9000) this.setPose(i, 'guard', 0);
      this.apply(line);
    }
  }

  private apply(line: TickerLine): void {
    if (line.speaker) return; // booth chatter doesn't move anybody
    this.round = line.round;
    this.sec = line.t;
    this.hp = [line.hp[0], line.hp[1]];
    this.intensity = Math.max(1, line.intensity);
    // a new round: out of the corners and into the middle (nothing lands until they meet)
    if (line.key === 'opening' || line.key === 'round_start') this.walkOut(line.key === 'opening');
    const prevGround = this.ground;
    this.ground = line.pos;
    if (line.act === 'bell') this.ground = 'stand'; // the bell breaks up whatever they were doing
    const wasDown = prevGround === 'atop' || prevGround === 'btop';
    const isDown = this.ground === 'atop' || this.ground === 'btop';
    if (isDown && !wasDown) {
      // hit the mat: most takedowns land in guard, good ones in side control or mount
      const r = Math.random();
      this.groundPos = r < 0.45 ? 'guard' : r < 0.72 ? 'side' : r < 0.88 ? 'mount' : 'back';
      // the ground work happens where they fell: no sliding across the canvas
      this.groundX = Math.max(CAGE_L + 60, Math.min(CAGE_R - 60, (this.F[0].x + this.F[1].x) / 2));
      this.center = this.groundX;
    } else if (isDown && wasDown && prevGround !== this.ground) {
      this.groundPos = Math.random() < 0.6 ? 'guard' : 'mount'; // reversal
      this.subAnim = null;
    } else if (isDown && Math.random() < 0.12 && !this.subAnim) {
      // the top man advances now and then
      this.groundPos = this.groundPos === 'guard' ? 'side' : this.groundPos === 'side' ? (Math.random() < 0.5 ? 'mount' : 'back') : this.groundPos;
    }
    if (!isDown) this.subAnim = null;
    if (prevGround !== this.ground && this.ground === 'stand') {
      this.setPose(0, 'guard', 0);
      this.setPose(1, 'guard', 0);
    }
    if (!isDown && (wasDown || (prevGround === 'clinch' && this.ground === 'stand'))) {
      // back to the feet / clinch broken: they push off each other and reset to range
      this.center = (this.F[0].x + this.F[1].x) / 2;
      this.F[0].v = -110;
      this.F[1].v = 110;
    }
    const a = line.side;
    if (a < 0) {
      if (line.act === 'bell') {
        sfx('bell');
        if (line.round >= this.rounds) this.finished = true; // final bell: it's over, the cards decide
        else if (!this.finished) {
          // end of the round: back to the corners
          this.roundOver = true;
          this.walkT = 0;
          this.tdT = 0;
          this.refTo(this.center);
        }
      }
      if (line.act === 'standup') {
        this.showCallout('STAND UP!');
        this.refTo(this.center);
      }
      return;
    }
    const A = a as 0 | 1;
    const D = (1 - a) as 0 | 1;
    const ground = this.ground === 'atop' || this.ground === 'btop';
    const bloody = this.hp[D] < 55 && Math.random() < 0.5;
    const sig = (A === 0 ? this.A : this.B).anim?.signature ?? [];
    // an exchange on the feet: re-centre on the pair so they don't drift straight back out of range
    if (!ground && REACH[line.act]) this.center = (this.F[0].x + this.F[1].x) / 2;
    // a whiff: the shot is thrown for real, the other man slips or steps back, nothing connects
    if (/^miss_/.test(line.key ?? '')) {
      const kick = line.act === 'kick';
      this.setPose(A, kick ? (Math.random() < 0.5 ? 'bodykick' : 'legkick') : Math.random() < 0.5 ? 'jab' : Math.random() < 0.5 ? 'cross' : 'hook', kick ? 0.38 : 0.26);
      this.F[A].lunge = 5;
      this.setPose(D, kick ? 'block' : Math.random() < 0.6 ? 'slip' : 'block', 0.3);
      this.F[D].v = (this.F[D].v ?? 0) - this.F[D].facing * 70;
      sfx('whoosh');
      return;
    }
    // a feint: half a jab, a stamp, the other man flinches
    if (line.act === 'idle') {
      if (!ground) {
        this.setPose(A, Math.random() < 0.6 ? 'jab' : 'slip', 0.1);
        this.F[A].lunge = 3;
        if (Math.random() < 0.6) this.setPose(D, 'block', 0.25);
      }
      return;
    }
    switch (line.act) {
      case 'jab':
        this.setPose(A, 'jab', 0.22);
        this.setPose(D, Math.random() < 0.3 ? 'slip' : 'hurt', 0.2);
        this.impact(A, 'haF', false, false);
        sfx('punch');
        break;
      case 'cross': // a counter
      case 'punch': {
        const p: Pose = line.act === 'cross' ? 'cross' : Math.random() < 0.35 ? 'hook' : Math.random() < 0.25 ? 'uppercut' : Math.random() < 0.2 ? 'body' : 'cross';
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
        this.refTo(this.center + (D === 0 ? -30 : 30));
        sfx('crowd');
        break;
      case 'kd':
        this.setPose(A, Math.random() < 0.5 ? 'hook' : 'cross', 0.35);
        this.setPose(D, 'down', 1.6);
        this.impact(A, 'haB', true, true);
        this.flash = 0.25;
        this.showCallout('KNOCKDOWN!');
        this.slowT = 1.1;
        this.refTo(this.center);
        if (this.mode === 'tv') this.cutTo('close', 0.6, true);
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
        this.slowT = 1.6;
        this.refTo(this.F[D].x - this.F[D].facing * 12, 3);
        if (this.mode === 'tv') this.cutTo('close', 1.5, true);
        sfx('roar');
        break;
      case 'tko':
        this.setPose(D, ground ? 'bottom' : 'down', 9999);
        this.setPose(A, 'celebrate', 9999);
        this.winnerSide = A;
        this.finished = true;
        this.showCallout("IT'S STOPPED!");
        this.refTo(this.center);
        sfx('roar');
        break;
      case 'gnp':
        this.setPose(A, 'topPunch', 0.25);
        this.gnpT = 0.28;
        this.impact(A, 'haB', false, bloody);
        sfx('punch');
        break;
      case 'td':
        // shoot, lift, dump: the poses play out before the ground position takes over
        this.tdT = 0.95;
        this.tdAtk = A;
        this.setPose(A, 'shoot', 0.3);
        this.setPose(D, 'lifted', 0.25);
        this.burst(this.center, FLOOR, 10, 0xd8d0c0, 50, 0.4, 2, 60); // mat dust
        this.burst(this.tc.x, this.tc.y, 8, 0xe8e0d0, 30, 0.5, 2, 0, true);
        this.shakeT = 0.15;
        sfx('thud');
        break;
      case 'sprawl':
        this.setPose(D, 'shoot', 0.35);
        this.setPose(A, 'sprawl', 0.5);
        break;
      case 'sub':
        if (ground) {
          const kind = subKindFor(line.text, this.isTop(A));
          this.subAnim = { kind, atk: A, t: 2.2, tapped: false };
          if (kind === 'rnc') this.groundPos = 'back';
        } else this.setPose(A, 'clinch', 0.8);
        if (this.mode === 'tv') this.cutTo('close', 0.2);
        break;
      case 'tap':
        this.subAnim = { kind: subKindFor(line.text, ground && this.isTop(A)), atk: A, t: 2.4, tapped: true };
        this.setPose(A, this.isTop(A) ? 'top' : 'bottomSub', 2.4);
        this.winnerSide = A;
        this.finished = true;
        this.showCallout('TAP! TAP! TAP!');
        this.refTo(this.center);
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
        this.refTo(this.center);
        break;
      case 'stool':
        this.showCallout('RETIRED ON THE STOOL');
        this.finished = true;
        break;
      case 'stop':
        this.finished = true;
        break;
      case 'getup':
        // back up off the canvas after a knockdown
        if (this.F[A].pose === 'down' && this.F[A].poseT < 9000) this.setPose(A, 'guard', 0);
        this.subAnim = null;
        break;
      case 'escape':
        this.subAnim = null;
        break;
    }
    if (sig.length && ['punch', 'kick', 'headkick', 'knee', 'elbow'].includes(line.act) && line.intensity >= 2 && Math.random() < 0.35) {
      const name = sig[Math.floor(Math.random() * sig.length)];
      if (name === 'spinningElbow' || name === 'spinningBackfist') this.setPose(A, 'spin', 0.4);
      this.showCallout(name.replace(/([A-Z])/g, ' $1').toUpperCase() + '!');
    }
    if (line.t >= 288 && !this.clapped.has(line.round) && this.scene === 'fight') {
      // the timekeeper's clapper: ten seconds left in the round
      this.clapped.add(line.round);
      this.showCallout('10 SECONDS!');
      sfx('click');
    }
  }

  /** The winner's party piece, based on who they are. */
  private celebration(i: 0 | 1, base: Rig): Rig {
    const who = i === 0 ? this.A : this.B;
    const style = who.anim?.celebration ?? ['jump', 'flex', 'point', 'jump', 'strut'][(who.id.length + who.last.length) % 5];
    const t = this.t;
    const shift = (r: Rig, dx: number, dy: number): Rig => Object.fromEntries(Object.entries(r).map(([k, v]) => [k, [v[0] + dx, v[1] + dy]])) as Rig;
    switch (style) {
      case 'gunShow':
      case 'flex':
        return Math.floor(t * 1.2) % 2 ? POSES.flex : POSES.celebrate;
      case 'prays':
        return { ...POSES.stool, hip: [0, -18], knF: [10, -2], ftF: [-2, 0], knB: [4, -2], ftB: [-8, 0], haF: [6, -52], haB: [4, -52], elF: [10, -42], elB: [6, -42], head: [4, -54], neck: [2, -46] };
      case 'point':
        return Math.floor(t * 0.8) % 2 ? POSES.point : POSES.celebrate;
      case 'strut':
      case 'billyWalk':
        return Math.floor(t * 5) % 2 ? POSES.walk1 : POSES.walk2;
      case 'dances':
        return shift(Math.floor(t * 4) % 2 ? POSES.taunt : POSES.celebrate, Math.sin(t * 8) * 3, 0);
      case 'backflip':
      case 'jump':
      default: {
        const up = Math.abs(Math.sin(t * 5)) * 9;
        return shift({ ...base, knF: [base.knF[0] + 4, base.knF[1] + up * 0.3], knB: [base.knB[0] - 4, base.knB[1] + up * 0.3] }, 0, -up);
      }
    }
  }

  /** Feet actually step while a fighter moves: alternating lifts, a little hip bob. */
  private stepped(f: FState): Rig {
    const speed = Math.abs(f.v ?? 0);
    const snap = f.snap ?? 0;
    if (this.ground !== 'stand' && this.ground !== 'clinch') {
      // on the mat: nobody is ever still, legs and hands keep working
      const w = Math.sin(this.t * 2.4 + f.x * 0.1);
      return { ...f.rig, ftF: [f.rig.ftF[0] + w * 1.2, f.rig.ftF[1]], ftB: [f.rig.ftB[0] - w, f.rig.ftB[1]], haB: [f.rig.haB[0], f.rig.haB[1] + w * 0.8] };
    }
    if (speed < 6) {
      // bouncing on the balls of the feet, weight shifting, head snapping back when tagged
      const r: Rig = { ...f.rig };
      const b = Math.sin(this.t * 6.2 + f.x * 0.05);
      const shiftW = Math.sin(this.t * 1.7 + f.x * 0.03) * 1.5;
      r.ftF = [r.ftF[0] + shiftW, r.ftF[1] - Math.max(0, b) * 1.2];
      r.ftB = [r.ftB[0] + shiftW * 0.6, r.ftB[1] - Math.max(0, -b) * 1.2];
      r.knF = [r.knF[0] + shiftW * 0.6, r.knF[1] - Math.max(0, b) * 0.8];
      r.knB = [r.knB[0] + shiftW * 0.4, r.knB[1] - Math.max(0, -b) * 0.8];
      if (snap > 0.02) {
        r.head = [r.head[0] - snap * 6, r.head[1] + snap * 1.5];
        r.neck = [r.neck[0] - snap * 2.5, r.neck[1]];
      }
      return r;
    }
    const amp = Math.min(1, speed / 55);
    const ph = (f.dist ?? 0) * 0.2;
    const sF = Math.sin(ph);
    const back = Math.sign(f.v ?? 0) * f.facing < 0; // retreating: the back foot leads
    const r: Rig = { ...f.rig };
    const mv = (j: keyof Rig, dx: number, dy: number) => (r[j] = [r[j][0] + dx, r[j][1] + dy]);
    mv('ftF', sF * 4 * amp * (back ? -1 : 1), -Math.max(0, sF) * 3 * amp);
    mv('knF', sF * 2 * amp * (back ? -1 : 1), -Math.max(0, sF) * 2 * amp);
    mv('ftB', -sF * 4 * amp * (back ? -1 : 1), -Math.max(0, -sF) * 3 * amp);
    mv('knB', -sF * 2 * amp * (back ? -1 : 1), -Math.max(0, -sF) * 2 * amp);
    const bob = -Math.abs(sF) * 1.4 * amp;
    for (const j of ['hip', 'neck', 'head', 'shF', 'shB', 'elF', 'elB', 'haF', 'haB'] as const) mv(j, 0, bob);
    return r;
  }

  /** Between rounds: fighters sit on their stools in the corners. */
  restInCorners(): void {
    // anything still waiting plays out now (it's behind the corner cutaway)
    for (const l of this.held.splice(0)) this.apply(l);
    this.engage = null;
    this.resting = true;
    this.roundOver = false;
    this.walkIn = false;
    this.touchT = 0;
    this.tdT = 0;
    this.gnpT = 0;
    this.ground = 'stand';
    this.subAnim = null;
    this.center = AW / 2;
    this.F.forEach((f, i) => {
      f.x = CORNERS[i];
      f.v = 0;
      f.lunge = 0;
      f.recoil = 0;
      f.snap = 0;
      f.pose = 'stool';
      f.poseT = 9999;
      f.facing = i === 0 ? 1 : -1;
      f.rig = { ...POSES.stool }; // a cut, not a move: no tween from wherever they were
    });
    // the ref waits by the fence while the card girl does her lap
    this.ref.x = this.ref.tx = AW / 2 + 96;
    this.ref.facing = -1;
    this.ref.rig = { ...POSES.stand };
  }

  /** Something that walks behind the fighters (the ring card girl), drawn into the arena's far side. */
  addBackdrop(c: Container): void {
    const i = this.worldInner.getChildIndex(this.fighters);
    this.worldInner.addChildAt(c, i);
  }

  /** New round: both fighters get off their stools and walk out to meet in the middle. */
  walkOut(firstRound = false): void {
    this.resting = false;
    this.roundOver = false;
    this.prefight = false;
    // round one: they meet in the middle and touch gloves first
    this.touchT = firstRound ? 2.4 : 0;
    this.ground = 'stand';
    this.subAnim = null;
    this.tdT = 0;
    this.center = AW / 2;
    this.walkIn = true;
    this.walkT = 0;
    this.F.forEach((f) => {
      f.v = 0;
      f.pose = 'guard';
      f.poseT = 0;
      f.foot = 0;
      f.footT = 1.6;
    });
    this.ref.tx = AW / 2 + 70;
  }

  /** Which pose pair the ground fighters use right now, and who plays the attacker/top role. */
  private groundLayout(): { aIdx: 0 | 1; a: Pose; d: Pose; front: 'a' | 'd' } {
    if (this.subAnim) {
      const sp = SUBS[this.subAnim.kind];
      return { aIdx: this.subAnim.atk, a: sp.a, d: sp.d, front: sp.front };
    }
    const spot = SPOTS[this.groundPos];
    const aIdx: 0 | 1 = this.ground === 'btop' ? 1 : 0;
    return { aIdx, a: this.gnpT > 0 ? spot.punch : spot.a, d: spot.d, front: spot.front };
  }

  private isTop(i: 0 | 1): boolean {
    return (this.ground === 'atop' && i === 0) || (this.ground === 'btop' && i === 1);
  }

  showCallout(s: string): void {
    this.callout.setText(s);
    this.calloutT = 1.3;
  }

  // ------------------------------------------------------------ camera

  private cutTo(kind: 'close' | 'medium' | 'wide', hold = 0, slow = false): void {
    const z = kind === 'close' ? 1.75 : kind === 'medium' ? 1.35 : 1;
    this.shot.z = z;
    this.shot.hold = Math.max(hold, 2 + Math.random() * 3);
    this.shot.slowZoom = slow ? 0.25 : 0;
    this.applyCam(this.focusX(), this.focusY(z), z, true);
  }

  private focusX(): number {
    if (this.scene === 'intro') return this.introFocus < 0 ? this.butler.x : this.F[this.introFocus as 0 | 1].x;
    return (this.F[0].x + this.F[1].x) / 2;
  }

  private focusY(z: number): number {
    const ground = this.ground === 'atop' || this.ground === 'btop';
    if (z <= 1.01) return AH / 2;
    return ground ? FLOOR - 26 : FLOOR - 56;
  }

  private applyCam(x: number, y: number, z: number, snap = false): void {
    const c = this.cam;
    if (snap) {
      c.x = x;
      c.y = y;
      c.z = z;
    }
    const hw = AW / (2 * c.z);
    const hh = AH / (2 * c.z);
    c.x = Math.max(hw, Math.min(AW - hw, c.x));
    c.y = Math.max(hh, Math.min(AH - hh, c.y));
    this.world.scale.set(c.z);
    this.world.position.set(Math.round(AW / 2 - c.x * c.z), Math.round(AH / 2 - c.y * c.z));
  }

  private updateCam(dt: number): void {
    if (this.mode !== 'tv') return;
    const s = this.shot;
    s.hold -= dt;
    // walking to / sitting in / coming out of the corners: they're far apart, stay on the wide shot
    const apart = this.scene === 'fight' && (this.roundOver || this.resting || this.walkIn || this.prefight);
    if (apart && s.z > 1.01) this.cutTo('wide', 1.5);
    else if (s.hold <= 0) {
      // director: alternate shots, tighter when the action heats up
      const r = Math.random();
      const kind = this.scene === 'ceremony' ? 'medium' : this.ground !== 'stand' ? (r < 0.6 ? 'close' : 'medium') : r < 0.45 ? 'medium' : r < 0.8 ? 'close' : 'wide';
      this.cutTo(kind);
    }
    if (s.slowZoom > 0) s.z = Math.min(2.3, s.z + s.slowZoom * dt);
    const c = this.cam;
    const k = Math.min(1, dt * 3);
    c.x += (this.focusX() - c.x) * k;
    c.y += (this.focusY(s.z) - c.y) * k;
    c.z += (s.z - c.z) * Math.min(1, dt * 4);
    this.applyCam(c.x, c.y, c.z);
  }

  // ------------------------------------------------------------ frame

  update(dt: number): void {
    const real = dt;
    if (this.slowT > 0) {
      this.slowT -= real;
      dt *= 0.3;
    }
    if (!this.walkIn) this.touchT -= dt * this.pace;
    this.t += dt;
    this.drawCrowd();
    const ground = this.ground === 'atop' || this.ground === 'btop';
    if (this.scene === 'fight') {
      // the action drifts around the cage; clinches end up on the fence; ground work stays put
      const targetCenter =
        this.walkIn || this.touchT > 0 ? AW / 2
          : this.ground === 'clinch' ? (Math.sin(this.round * 1.7) > 0 ? CAGE_R - 40 : CAGE_L + 40)
            : ground ? this.groundX
              : AW / 2 + Math.sin(this.t * 0.35) * 70;
      this.center += (targetCenter - this.center) * Math.min(1, dt * (ground ? 4 : 1.5));
    } else this.center += (AW / 2 - this.center) * Math.min(1, dt * 2);
    this.drift = this.center - AW / 2;
    const gap = this.ground === 'clinch' ? 12 : ground ? 0 : 23 + Math.sin(this.t * 1.3) * 3;
    this.gnpT -= dt;
    this.tdT -= dt;
    this.walkT += dt;
    if (this.subAnim && !this.subAnim.tapped) {
      this.subAnim.t -= dt;
      if (this.subAnim.t <= 0) this.subAnim = null;
    }
    const lay = this.groundLayout();
    // the frame every ground pair is drawn in faces the way the man on top faces; a bottom man
    // attacking from guard (triangle, guillotine, armbar) keeps that frame so nobody flips over
    const topDir: 1 | -1 = this.ground === 'btop' ? -1 : 1;
    const sk = this.subAnim?.kind;
    const groundDir: 1 | -1 = sk && ['tri', 'guil', 'ab'].includes(sk) ? topDir : lay.aIdx === 0 ? 1 : -1;
    const fightOn = this.scene === 'fight' && !this.resting;
    for (const i of [0, 1] as const) {
      const f = this.F[i];
      const o = this.F[1 - i];
      const side = i === 0 ? -1 : 1;
      let tx = this.center + side * gap;
      let facing: 1 | -1 = i === 0 ? 1 : -1;
      let maxV = 150;
      // a finish on the mat: once the winner celebrates he gets up and walks off the man underneath
      const upAndAway = ground && fightOn && this.finished && this.winnerSide === i && (f.poseT <= 0 || f.pose === 'celebrate');
      if (this.scene === 'intro') tx = i === 0 ? CAGE_L + 60 : CAGE_R - 60;
      else if (this.scene === 'ceremony') tx = AW / 2 + side * 26;
      else if (this.resting) tx = CORNERS[i];
      else if (this.prefight) tx = f.x;
      else if (this.roundOver) {
        tx = CORNERS[i];
        maxV = 70 * this.pace;
      } else if (upAndAway) {
        tx = this.groundX + (this.groundX < AW / 2 ? 1 : -1) * 58;
        maxV = 90;
      } else if (ground) {
        // both fighters share the pose pair's frame: same x
        facing = groundDir;
        tx = this.groundX;
      } else if (this.walkIn) {
        // out of the corners at a walk, to touching distance in round one
        tx = this.center + side * (this.touchT > 0 ? TOUCH_GAP : gap);
        maxV = 80 * this.pace;
      } else if (this.touchT > 0 && this.ground === 'stand') {
        tx = this.center + side * TOUCH_GAP;
        if (this.touchT < 1.6 && this.touchT > 0.9 && f.poseT <= 0) this.setPose(i, 'touch', 0.5);
        this.ref.tx = this.center + (this.touchT > 0.9 ? 0 : 60);
      }
      // footwork on the feet: step in, step out to make space, circle; feint now and then
      const standing = fightOn && this.ground === 'stand' && !this.finished && !this.roundOver && !this.prefight && !this.walkIn && this.touchT <= 0;
      if (standing && !this.engage) {
        f.footT = (f.footT ?? 0) - dt;
        if (f.footT <= 0) {
          const r = Math.random();
          f.foot = r < 0.3 ? 9 + Math.random() * 8 : r < 0.55 ? -6 : r < 0.75 ? 3 : 0;
          f.footT = 0.5 + Math.random() * 1.2;
        }
        tx += side * (f.foot ?? 0);
        if (f.poseT <= 0 && f.pose === 'guard' && Math.random() < dt * 0.55) {
          // feint, slip or a pawing jab that never arrives
          const fk = Math.random();
          this.setPose(i, fk < 0.45 ? 'jab' : fk < 0.75 ? 'slip' : 'block', fk < 0.45 ? 0.09 : 0.22);
          if (fk < 0.45) f.lunge = 3;
        }
      }
      if (standing && this.engage) {
        // closing the distance for the next exchange: the attacker steps in, the other man plants his feet
        if (i === this.engage.atk) {
          tx = o.x + side * (this.engage.reach - 6);
          maxV = 170;
        } else tx = f.x;
        f.foot = 0;
      }
      if (this.scene === 'fight' && this.finished && this.winnerSide === i && (o.pose === 'ko' || o.pose === 'down') && !ground) {
        // walk off and celebrate away from the man on the canvas
        tx = o.x + (f.x < o.x ? -1 : 1) * 56;
        maxV = 90;
      }
      if (this.scene !== 'fight' || (ground && fightOn && !upAndAway)) {
        f.x += (tx - f.x) * Math.min(1, dt * (this.scene === 'fight' ? 8 : 3));
        f.v = 0;
      } else {
        // a spring with damping: fighters accelerate, step and settle instead of gliding
        const v0 = f.v ?? 0;
        let v = v0 + ((tx - f.x) * 70 - v0 * 15) * dt;
        v = Math.max(-maxV, Math.min(maxV, v));
        f.v = v;
        f.x += v * dt;
        f.dist = (f.dist ?? 0) + Math.abs(v * dt);
      }
      f.lunge *= Math.pow(0.001, dt);
      f.recoil *= Math.pow(0.003, dt);
      if (f.poseT > 0) {
        f.poseT -= dt;
        if (f.poseT <= 0 && f.pose !== 'ko') f.pose = this.scene === 'ceremony' ? 'stand' : 'guard';
      }
      let pose = f.pose;
      if (this.scene === 'fight') {
        if (ground && pose !== 'ko' && pose !== 'celebrate') pose = i === lay.aIdx ? lay.a : lay.d;
        if (this.ground === 'clinch' && pose === 'guard') pose = 'clinch';
        if (this.tdT > 0.3 && ground && pose !== 'ko') {
          const ph = 1 - this.tdT / 0.95;
          pose = i === this.tdAtk ? (ph < 0.45 ? 'shoot' : 'sprawl') : ph < 0.4 ? 'lifted' : 'down';
        }
        if (this.winnerSide === i && this.finished && f.poseT <= 0) pose = 'celebrate';
      }
      // walking (not fighting): turn and walk where you're going
      const walking = Math.abs(tx - f.x) > 3 && (this.scene !== 'fight' || this.roundOver) && pose !== 'ko' && pose !== 'down';
      if (walking) facing = tx > f.x ? 1 : -1;
      if (facing !== f.facing) {
        // turning round: mirror the current joints so the body doesn't jump, then tween from there
        f.rig = mirrorRig(f.rig);
        f.facing = facing;
      }
      this.drawPose[i] = walking ? 'walk' : pose;
      const target = walking ? (Math.floor(this.t * 6) % 2 ? POSES.walk1 : POSES.walk2) : pose === 'guard' ? stanceGuard(this.L[i], this.t + i * 1.3) : POSES[pose as Pose] ?? POSES.guard;
      const rate = ground && this.scene === 'fight' ? (this.tdT > 0 ? 9 : 5.5) : f.poseT > 0 ? 22 : 12;
      f.rig = lerpRig(f.rig, pose === 'celebrate' && this.finished && !walking ? this.celebration(i, target) : target, Math.min(1, dt * rate));
      f.snap = (f.snap ?? 0) * Math.exp(-dt * 7);
      // long hair swings with movement and with shots to the head
      this.L[i].sway = Math.max(-4, Math.min(4, ((f.v ?? 0) * f.facing) / 30 + (f.snap ?? 0) * 4 + Math.sin(this.t * 3 + i) * 0.5));
    }
    if (this.walkIn && this.walkT > 0.3 && this.F.every((f, i) => Math.abs(f.x - (this.center + (i === 0 ? -1 : 1) * (this.touchT > 0 ? TOUCH_GAP : gap))) < 5 && Math.abs(f.v ?? 0) < 25)) this.walkIn = false;
    if (this.walkIn && this.walkT > 6) this.walkIn = false;
    this.pumpHeld(dt);
    // referee & announcer
    for (const a of [this.ref, this.butler]) {
      if (!a.visible) continue;
      if (a === this.ref && this.scene === 'fight') {
        // the ref circles the action at a distance, keeping a sightline; now and then he
        // crosses to the other side (behind the fighters)
        this.refHold -= dt;
        const job = this.refHold > 0 || this.touchT > 0 || this.finished || this.resting || this.roundOver || this.prefight;
        const off = a.tx - this.center;
        if (!job && (Math.abs(off) > 104 || Math.abs(off) < 62 || Math.random() < dt * 0.05)) {
          const keep = Math.abs(off) >= 62 && Math.random() < 0.6;
          a.tx = this.center + (keep ? Math.sign(off) : Math.sign(off) ? -Math.sign(off) : 1) * (72 + Math.random() * 20);
          a.tx = Math.max(CAGE_L + 14, Math.min(CAGE_R - 14, a.tx));
        }
        if (!this.resting) a.facing = a.x < this.center ? 1 : -1;
      }
      const moving = Math.abs(a.tx - a.x) > 2;
      a.x += (a.tx - a.x) * Math.min(1, dt * 4);
      if (a.spin > 0) {
        a.spin -= dt;
        if (Math.floor(a.spin * 20) % 2 === 0) a.facing = (a.facing * -1) as 1 | -1;
      }
      const tgt = moving ? (Math.floor(this.t * 7) % 2 ? POSES.walk1 : POSES.walk2) : POSES[a.pose];
      a.rig = lerpRig(a.rig, tgt, Math.min(1, dt * 10));
    }
    this.updateCam(dt);
    // between rounds the overhead camera cuts back to the side so you see the card girl's lap
    const topNow = this.mode === 'top' && this.scene === 'fight' && !this.resting;
    this.world.visible = !topNow;
    this.topWorld.visible = topNow;
    this.topLabels.visible = topNow;
    if (topNow) {
      this.drawTop(dt);
      this.topWorld.updateCacheTexture();
    } else {
      this.drawSide(dt, ground);
      this.worldInner.updateCacheTexture();
    }
    this.drawHud(dt);
  }

  private drawSide(dt: number, ground: boolean): void {
    const g = this.fighters;
    g.clear();
    const shake = this.shakeT > 0 ? Math.round((Math.random() - 0.5) * 4) : 0;
    this.shakeT -= dt;
    // ref & announcer stand behind the fighters
    for (const a of [this.ref, this.butler]) {
      if (!a.visible) continue;
      const sc = a === this.butler ? 1.05 : this.scene === 'fight' ? 0.9 : 1;
      const fy = this.scene === 'fight' && a === this.ref ? FLOOR - 6 : FLOOR;
      g.ellipse(a.x, fy + 1, 12, 2.5).fill({ color: 0x000000, alpha: 0.3 });
      drawRig(g, a.rig, Math.round(a.x), fy, a.facing, a.look, sc);
    }
    for (const f of this.F) g.ellipse(f.x, FLOOR + 1, 16, 3).fill({ color: 0x000000, alpha: 0.35 });
    // corner stools between rounds
    this.F.forEach((f, i) => {
      if (this.drawPose[i] !== 'stool') return;
      const sx = Math.round(f.x - 2 * f.facing);
      g.rect(sx - 8, FLOOR - 25, 16, 4).fill(0x0c0c0e).rect(sx - 7, FLOOR - 24, 14, 2).fill(0x3a3a42);
      for (const lx of [-6, 5]) g.rect(sx + lx, FLOOR - 21, 2, 21).fill(0x1c1c22);
      g.rect(sx - 5, FLOOR - 9, 11, 1).fill(0x1c1c22);
    });
    const lay = this.groundLayout();
    const last = lay.front === 'a' ? lay.aIdx : ((1 - lay.aIdx) as 0 | 1);
    const order: (0 | 1)[] = ground ? (last === 0 ? [1, 0] : [0, 1]) : this.F[0].poseT > this.F[1].poseT ? [1, 0] : [0, 1];
    for (const i of order) {
      const f = this.F[i];
      // the tapping man's free hand slaps the mat
      const x = f.x + (f.lunge - f.recoil) * f.facing + shake;
      if (ground && this.subAnim?.tapped && i !== this.subAnim.atk && Math.floor(this.t * 8) % 2 === 0) f.rig = { ...f.rig, haB: [f.rig.haB[0], Math.min(0, f.rig.haB[1] + 4)] };
      this.L[i].faceUp = SUPINE.has(this.drawPose[i]);
      drawRig(g, this.stepped(f), Math.round(x), FLOOR, f.facing, this.L[i]);
    }
    // particles
    const p = this.fx;
    p.clear();
    this.parts = this.parts.filter((s) => (s.life -= dt) > 0);
    for (const s of this.parts) {
      s.x += s.vx * dt;
      s.y += s.vy * dt;
      s.vy += s.grav * dt;
      if (s.y > FLOOR + 2 && s.c === 0xa01818 && s.grav !== 0) {
        s.vy = 0;
        s.vx = 0;
        s.grav = 0;
        if (MAT.stains.length < 400) MAT.stains.push({ x: Math.round(s.x), y: Math.round(Math.min(FLOOR + 14, s.y)), r: s.s + (Math.random() < 0.3 ? 1 : 0), c: Math.random() < 0.5 ? 0x7a1010 : 0x5a0c0c });
      }
      p.rect(Math.round(s.x), Math.round(s.y), s.s, s.s).fill(s.c);
    }
    // dried blood on the canvas
    if (this.stainsDrawn !== MAT.stains.length) {
      this.stainsDrawn = MAT.stains.length;
      const sg = this.stainG;
      sg.clear();
      for (const st of MAT.stains) sg.rect(st.x, st.y, st.r + 1, Math.max(1, st.r - 1)).fill({ color: st.c, alpha: 0.75 });
    }
    // front fence posts
    const fr = this.front;
    fr.clear();
    // the near side of the octagon: corner posts, a faint mesh and the bottom pad, in front of everyone
    const ox = AW / 2;
    const fl = (k: number): [number, number] => {
      const a = ((22.5 + k * 45) * Math.PI) / 180;
      return [ox + Math.cos(a) * 232, FLOOR + 1 + Math.sin(a) * 17];
    };
    const near = [fl(0), fl(1), fl(2), fl(3)];
    for (let k = 0; k < 3; k++) {
      const [x0, y0] = near[k];
      const [x1, y1] = near[k + 1];
      fr.poly([x0, y0, x1, y1, x1, y1 - 70, x0, y0 - 70]).fill({ color: 0x0a0a0e, alpha: 0.06 });
      fr.moveTo(x0, y0 - 2).lineTo(x1, y1 - 2).stroke({ color: 0x141418, width: 4, alpha: 0.85 });
    }
    for (const [x, y] of [near[0], near[3]]) {
      fr.rect(x - 3, y - 92, 6, 92).fill({ color: 0x0c0c0e, alpha: 0.92 });
      fr.rect(x - 4, y - 95, 8, 4).fill(0x3a3a42);
    }
  }

  // ------------------------------------------------------------ top-down

  /** Head position of fighter i in the top-down view. */
  private topPos(i: 0 | 1): [number, number] {
    const { x, y, ang } = this.topBody(i);
    return [x + Math.cos(ang) * 2, y + Math.sin(ang) * 2];
  }

  private topBody(i: 0 | 1): { x: number; y: number; ang: number } {
    const c = this.tc;
    const ground = this.ground === 'atop' || this.ground === 'btop';
    const d = this.ground === 'clinch' ? 10 : ground ? 4 : 26 + Math.sin(this.t * 1.3) * 3;
    const dir = i === 0 ? -1 : 1;
    const f = this.F[i];
    const push = (f.lunge - f.recoil) * 0.8;
    const ang = c.ang + (i === 0 ? 0 : Math.PI);
    let x = c.x + Math.cos(c.ang) * (dir * d / 2) + Math.cos(ang) * push;
    let y = c.y + Math.sin(c.ang) * (dir * d / 2) + Math.sin(ang) * push;
    if (this.scene === 'fight' && (this.roundOver || this.walkIn || this.prefight || this.resting)) {
      // out of / back to the corner: follow the side view's walk between the stool and the middle
      const k = Math.max(0, Math.min(1, (f.x - CORNERS[i]) / (AW / 2 + dir * 23 - CORNERS[i])));
      const ca = ((i === 0 ? 247.5 : 67.5) * Math.PI) / 180;
      const cx = TCX + Math.cos(ca) * (TR - 12);
      const cy = TCY + Math.sin(ca) * (TR - 12);
      x = cx + (x - cx) * k;
      y = cy + (y - cy) * k;
      if (k < 0.98) {
        const walking = Math.abs(f.v ?? 0) > 8;
        const to = this.roundOver && walking ? [cx, cy] : [c.x, c.y];
        return { x, y, ang: Math.atan2(to[1] - y, to[0] - x) };
      }
    }
    return { x, y, ang };
  }

  /** Overhead extras: blood on the canvas (same stains as the side view), roaming spots, vignette. */
  private drawTopExtras(): void {
    if (this.topStainsDrawn !== MAT.stains.length) {
      this.topStainsDrawn = MAT.stains.length;
      const sg = this.topStain;
      sg.clear();
      for (const st of MAT.stains) {
        const x = TCX + ((st.x - AW / 2) / 232) * TR;
        const y = TCY + ((st.y - FLOOR) / 17) * TR * 0.9;
        sg.circle(x, y, 0.8 + st.r * 0.5).fill({ color: st.c, alpha: 0.7 });
      }
    }
    const l = this.topLight;
    l.clear();
    const hype = this.intensity >= 3 ? 0.08 : 0.04;
    for (let b = 0; b < 3; b++) {
      const a = this.t * (0.4 + b * 0.17) + b * 2.1;
      l.circle(TCX + Math.cos(a) * TR * 0.6, TCY + Math.sin(a * 1.3) * TR * 0.5, 22).fill({ color: [0x3a7aff, 0xff3a4a, 0xffffff][b], alpha: hype });
    }
    // darker edges so the octagon is the stage
    for (let k = 0; k < 6; k++) l.rect(k * 6, 0, 6, AH).fill({ color: 0x000000, alpha: 0.25 - k * 0.04 }).rect(AW - (k + 1) * 6, 0, 6, AH).fill({ color: 0x000000, alpha: 0.25 - k * 0.04 });
  }

  private drawTop(dt: number): void {
    this.drawTopExtras();
    // action centre wanders; clinches drift to the fence
    const c = this.tc;
    const ground = this.ground === 'atop' || this.ground === 'btop';
    let tx = TCX + Math.sin(this.t * 0.31) * 28;
    let ty = TCY + Math.cos(this.t * 0.23) * 22;
    if (this.ground === 'clinch') {
      const a = Math.sin(this.round * 1.7) * Math.PI;
      tx = TCX + Math.cos(a) * (TR - 16);
      ty = TCY + Math.sin(a) * (TR - 16);
    }
    if (ground) {
      tx = TCX + Math.sin(this.round * 2.3) * 20;
      ty = TCY + Math.cos(this.round * 1.1) * 14;
    }
    c.x += (tx - c.x) * Math.min(1, dt * 1.2);
    c.y += (ty - c.y) * Math.min(1, dt * 1.2);
    if (!ground && this.ground !== 'clinch') c.ang += dt * 0.25 * Math.sin(this.t * 0.4 + 1); // circling
    const g = this.topFx;
    g.clear();
    // referee
    const ra = c.ang + Math.PI / 2;
    const rx = c.x + Math.cos(ra) * 34;
    const ry = c.y + Math.sin(ra) * 34;
    g.circle(rx + 1, ry + 2, 6).fill({ color: 0, alpha: 0.3 });
    g.circle(rx, ry, 5.5).fill(0x18181c);
    g.circle(rx, ry, 3.2).fill(REF_LOOK.skin);
    // fighters: bottom one first
    const order: (0 | 1)[] = ground ? (this.isTop(0) ? [1, 0] : [0, 1]) : [0, 1];
    for (const i of order) this.drawTopFighter(g, i);
    // particles
    this.tparts = this.tparts.filter((s) => (s.life -= dt) > 0);
    for (const s of this.tparts) {
      s.x += s.vx * dt;
      s.y += s.vy * dt;
      s.vx *= Math.pow(0.05, dt);
      s.vy *= Math.pow(0.05, dt);
      g.rect(Math.round(s.x), Math.round(s.y), s.s, s.s).fill(s.c);
    }
  }

  private drawTopFighter(g: Graphics, i: 0 | 1): void {
    const L = this.L[i];
    const f = this.F[i];
    const { x, y, ang } = this.topBody(i);
    const cos = Math.cos(ang);
    const sin = Math.sin(ang);
    const P = (lx: number, ly: number): [number, number] => [x + lx * cos - ly * sin, y + lx * sin + ly * cos];
    const OUT = 0x120d10;
    const bulk = L.build === 2 ? 2 : L.build === 1 ? 1 : 0;
    const pose = f.pose;
    const lying = pose === 'down' || pose === 'ko' || (this.ground !== 'stand' && this.ground !== 'clinch' && !this.isTop(i)) || pose === 'bottom' || pose === 'bottomSub';
    // shadow
    g.ellipse(x + 2, y + 3, 11, 8).fill({ color: 0, alpha: 0.28 });
    if (lying) {
      // flat on the mat: body stretched back along the facing axis
      const back = pose === 'ko' ? -1 : -0.6;
      const [hx, hy] = P(back * 22, 0);
      const [fx1, fy1] = P(back * -14, -5);
      const [fx2, fy2] = P(back * -14, 5);
      const [hip1, hip2] = P(back * -2, 0);
      g.moveTo(hip1, hip2).lineTo(fx1, fy1).stroke({ color: OUT, width: 6, cap: 'round' }).moveTo(hip1, hip2).lineTo(fx2, fy2).stroke({ color: OUT, width: 6, cap: 'round' });
      g.moveTo(hip1, hip2).lineTo(fx1, fy1).stroke({ color: L.skin, width: 4, cap: 'round' }).moveTo(hip1, hip2).lineTo(fx2, fy2).stroke({ color: L.skin, width: 4, cap: 'round' });
      g.moveTo(hip1, hip2).lineTo(hx, hy).stroke({ color: OUT, width: 13 + bulk, cap: 'round' });
      g.moveTo(hip1, hip2).lineTo(hx, hy).stroke({ color: L.skin, width: 11 + bulk, cap: 'round' });
      const [tx1, ty1] = P(back * -2, 0);
      g.circle(tx1, ty1, 5).fill(L.trunks);
      if (pose === 'bottomSub') {
        // legs up, hunting a triangle/armbar
        const [l1x, l1y] = P(10, -8);
        const [l2x, l2y] = P(10, 8);
        g.moveTo(hip1, hip2).lineTo(l1x, l1y).stroke({ color: L.skin, width: 4, cap: 'round' }).moveTo(hip1, hip2).lineTo(l2x, l2y).stroke({ color: L.skin, width: 4, cap: 'round' });
      }
      g.circle(hx, hy, 5.5).fill(OUT);
      g.circle(hx, hy, 4.5).fill(L.hairStyle === 0 ? L.skin : L.hairColor);
      const [g1x, g1y] = P(back * 14, -8);
      const [g2x, g2y] = P(back * 14, 8);
      g.circle(g1x, g1y, 2.6).fill(L.glove).circle(g2x, g2y, 2.6).fill(L.glove);
      return;
    }
    // gloves (lead = -y side) per pose
    let lead: [number, number] = [9, -4];
    let rear: [number, number] = [7, 4];
    let leg: [number, number] | null = null;
    let lean = 0;
    switch (pose) {
      case 'jab': lead = [22, -3]; break;
      case 'cross': rear = [22, 1]; lean = 2; break;
      case 'hook': rear = [15, 9]; lean = 1; break;
      case 'uppercut': rear = [15, 3]; break;
      case 'body': rear = [14, 6]; lean = 2; break;
      case 'elbow': rear = [12, 4]; lean = 2; break;
      case 'spin': rear = [6, 18]; break;
      case 'legkick': leg = [18, 9]; break;
      case 'bodykick': leg = [22, 5]; break;
      case 'headkick': leg = [25, 1]; lean = -2; break;
      case 'knee': case 'flyknee': leg = [14, 2]; lean = 2; break;
      case 'shoot': lead = [16, -6]; rear = [16, 6]; lean = 7; break;
      case 'sprawl': lead = [10, -7]; rear = [10, 7]; lean = -5; break;
      case 'clinch': lead = [13, -5]; rear = [13, 5]; lean = 2; break;
      case 'top': case 'topPunch': lead = pose === 'topPunch' ? [16, -1] : [10, -5]; rear = [10, 5]; lean = 4; break;
      case 'hurt': lean = -3; lead = [6, -5]; rear = [6, 5]; break;
      case 'rocked': lean = -4 + Math.sin(this.t * 9) * 2; lead = [3, -7]; rear = [3, 7]; break;
      case 'celebrate': case 'flex': case 'armUp': lead = [0, -10]; rear = [0, 10]; break;
      case 'taunt': lead = [2, -13]; rear = [2, 13]; break;
    }
    const [bx, by] = P(lean, 0);
    if (leg) {
      const [hx, hy] = P(-1, 3);
      const [lx, ly] = P(leg[0], leg[1]);
      g.moveTo(hx, hy).lineTo(lx, ly).stroke({ color: OUT, width: 7, cap: 'round' });
      g.moveTo(hx, hy).lineTo(lx, ly).stroke({ color: L.skin, width: 5, cap: 'round' });
    }
    // shoulders (rotated ellipse)
    const pts: number[] = [];
    for (let k = 0; k < 14; k++) {
      const a = (k / 14) * Math.PI * 2;
      const [px, py] = P(lean + Math.cos(a) * (5 + bulk * 0.5), Math.sin(a) * (9 + bulk));
      pts.push(px, py);
    }
    g.poly(pts).fill(OUT);
    const inner: number[] = [];
    for (let k = 0; k < 14; k++) {
      const a = (k / 14) * Math.PI * 2;
      const [px, py] = P(lean + Math.cos(a) * (4 + bulk * 0.5), Math.sin(a) * (8 + bulk));
      inner.push(px, py);
    }
    g.poly(inner).fill(L.skin);
    // arms to gloves
    for (const [side, hand] of [[-1, lead], [1, rear]] as [number, [number, number]][]) {
      const [sx, sy] = P(lean, side * (7 + bulk));
      const [hx, hy] = P(hand[0] + lean * 0.5, hand[1]);
      g.moveTo(sx, sy).lineTo(hx, hy).stroke({ color: OUT, width: 5, cap: 'round' });
      g.moveTo(sx, sy).lineTo(hx, hy).stroke({ color: shade(L.skin, side < 0 ? 0 : -0.12), width: 3.4, cap: 'round' });
      g.circle(hx, hy, 3.6).fill(OUT);
      g.circle(hx, hy, 2.8).fill(L.glove);
    }
    // head from above: hair crown
    const [hx, hy] = P(lean + 1, 0);
    g.circle(hx, hy, 5).fill(OUT);
    g.circle(hx, hy, 4.2).fill(L.skin);
    if (L.hairStyle !== 0) g.circle(hx - cos * 0.8, hy - sin * 0.8, 3.4).fill(L.hairColor);
    void bx;
    void by;
  }

  // ------------------------------------------------------------ HUD

  private drawHud(dt: number): void {
    const h = this.hudG;
    h.clear();
    const tv = this.mode === 'tv';
    this.clock.visible = this.scene === 'fight';
    if (this.scene === 'fight') {
      h.rect(4, 13, 140, 6).fill(PAL.ink).rect(5, 14, Math.round((138 * this.hp[0]) / 100), 4).fill(this.hp[0] > 40 ? PAL.moss : PAL.blood);
      h.rect(AW - 144, 13, 140, 6).fill(PAL.ink).rect(AW - 5 - Math.round((138 * this.hp[1]) / 100), 14, Math.round((138 * this.hp[1]) / 100), 4).fill(this.hp[1] > 40 ? PAL.moss : PAL.blood);
      h.rect(4, 20, 10, 2).fill(this.L[0].glove).rect(AW - 14, 20, 10, 2).fill(this.L[1].glove);
    }
    if (this.slowT > 0) {
      // broadcast slow motion: letterbox bars and a tag
      h.rect(0, 0, AW, 10).fill({ color: 0x000000, alpha: 0.85 }).rect(0, AH - 10, AW, 10).fill({ color: 0x000000, alpha: 0.85 });
      h.rect(AW - 60, AH - 9, 54, 8).fill(0xa01818);
    }
    this.slowTag.visible = this.slowT > 0;
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
    // broadcast graphics
    if (tv) {
      const t = this.tvG;
      t.clear();
      t.rect(AW - 54, 24, 48, 10).fill(0xa01818);
      if (this.lowerT > 0) {
        this.lowerT -= dt;
        const a = Math.min(1, this.lowerT * 3);
        const ly = this.lowerTop ? TV_TOP_Y : AH - 30;
        const bar = this.lowerCorner === 0 ? 0xa01818 : 0x1e3a8a;
        t.rect(12, ly, 320, 24).fill({ color: 0x0a0a10, alpha: 0.85 * a }).rect(12, ly, 4, 24).fill({ color: this.lowerTop ? bar : PAL.gold, alpha: a });
        if (this.lowerTop) t.rect(12, ly + 23, 320, 1).fill({ color: PAL.gold, alpha: a });
        this.tvLower.alpha = a;
        this.tvLower2.alpha = a;
      } else {
        this.tvLower.alpha = 0;
        this.tvLower2.alpha = 0;
      }
      this.tvTag.setText(Math.floor(this.t * 1.5) % 2 ? '● LIVE' : '  LIVE');
    }
  }
}

/** Corner cutaway between rounds: split screen of both corners. */
export function cornerView(A: Fighter, B: Fighter, reports: CornerReport[], round: number, stats?: { sig: [number, number]; td: [number, number]; kd: [number, number] }): Container {
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
    // cutman in the team tee, black latex gloves, Vaseline on standby; head coach behind him in a team polo
    const cut: Look2 = { ...L, trunks: 0x2a2a2a, trim: 0x444444, glove: 0x1a1a1a, hairStyle: 0, beard: 3, build: 2, skin: 0xc08e64, tattoo: 0,
      outfit: { top: 0x16161a, bottom: 0x2a2a30, shortSleeves: true, hands: 0x1a1a1a, patch: L.trunks, bulk: 1 } };
    const coach: Look2 = { ...L, hairStyle: 1, hairColor: 0x2a2018, beard: 2, build: 1, skin: 0xb07a52, tattoo: 0,
      outfit: { top: L.trunks, bottom: 0x22222a, shortSleeves: true, patch: L.trim, bulk: 1 } };
    drawRig(st, POSES.stand, ox + (i === 0 ? 112 : 192), 108, i === 0 ? 1 : -1, coach, 0.62);
    drawRig(st, POSES.clinch, ox + (i === 0 ? 186 : 118), 108, i === 0 ? -1 : 1, cut, 0.7);
    c.addChild(st);
    st.cacheAsTexture({ resolution: pixelArtResolution(), antialias: false });
    c.addChild(text(f.last.toUpperCase(), ox + 88, 18, { color: PAL.bone }));
    c.addChild(text(`HP ${rep?.hp ?? '?'}  ${rep?.scoreGuess ?? ''}${rep?.injury ? '  • ' + rep.injury.toUpperCase() : ''}`, ox + 88, 28, { small: true, color: rep && rep.hp < 40 ? PAL.blood : PAL.ash, width: AW / 2 - 96 }));
    c.addChild(text(`COACH: "${rep?.coach ?? 'Breathe.'}"`, ox + 10, 110, { small: true, width: AW / 2 - 20, color: PAL.bone, maxLines: 3 }));
    c.addChild(text(`CUTMAN ${f.cutman.name.toUpperCase()} (${f.cutman.rating}): ${rep?.cutman ?? ''}`, ox + 10, 128, { small: true, width: AW / 2 - 20, color: PAL.ash, maxLines: 3 }));
    if (rep?.quit) c.addChild(text('NOT COMING OUT!', ox + 88, 40, { color: PAL.blood }));
  });
  if (stats) {
    // broadcast stat strip: significant strikes, takedowns, knockdowns this round
    const row = `SIG. STRIKES ${stats.sig[0]} - ${stats.sig[1]}    TAKEDOWNS ${stats.td[0]} - ${stats.td[1]}${stats.kd[0] + stats.kd[1] ? `    KNOCKDOWNS ${stats.kd[0]} - ${stats.kd[1]}` : ''}`;
    const strip = new Graphics().rect(AW / 2 - 120, 10, 240, 8).fill({ color: 0x0a0a10, alpha: 0.95 }).rect(AW / 2 - 120, 17, 240, 1).fill(PAL.gold);
    c.addChild(strip);
    c.addChild(text(row, 0, 12, { small: true, width: AW, align: "center", color: PAL.bone }));
  }
  return c;
}

/** Ring-card walk between rounds. */
const RING_CARD_URL = (n: number) => `${import.meta.env.BASE_URL}ringcards/round-${Math.max(1, Math.min(5, n))}.png`;

/** Load the ring-card art early so the card is there the moment she walks out. */
export function preloadRingCards(): void {
  for (let n = 1; n <= 5; n++) Assets.load(RING_CARD_URL(n)).catch(() => {});
}

export class RingCardWalk extends Container {
  private g = new Graphics();
  private card = new Sprite();
  t = 0;
  private L: Look2 = { skin: 0xdcae88, hairStyle: 5, hairColor: 0x6b4527, beard: 0, build: 0, trunks: 0x1a1a1a, trim: 0xc4a04a, glove: 0xdcae88, stance: 'upright', female: true, tattoo: 0 };
  constructor(round: number) {
    super();
    this.addChild(this.g, this.card);
    this.g.cacheAsTexture({ resolution: pixelArtResolution(), antialias: false });
    // the card is its own piece of pixel art, so the number always fits
    Assets.load(RING_CARD_URL(round)).then((tex: Texture) => {
      if (!this.destroyed) this.card.texture = tex;
    }).catch(() => {});
  }
  update(dt: number): boolean {
    this.t += dt;
    const x = -30 + this.t * 130;
    const g = this.g;
    g.clear();
    const step = Math.floor(this.t * 6) % 2 === 0 ? POSES.walk1 : POSES.walk2;
    const rig: Rig = { ...step, haB: [2, -96], elB: [0, -82], haF: [8, -96], elF: [8, -82] };
    // she walks the far side of the octagon, behind the fighters, a touch smaller with distance
    const fy = FLOOR - 14;
    const sc = 0.82;
    g.ellipse(x, fy + 1, 10, 2).fill({ color: 0, alpha: 0.35 });
    drawRig(g, rig, Math.round(x), fy, 1, this.L, sc);
    const bob = Math.floor(this.t * 6) % 2;
    this.card.scale.set(sc);
    this.card.position.set(Math.round(x - 17 * sc), Math.round(fy - 126 * sc + bob));
    g.updateCacheTexture();
    return x < AW + 40;
  }
}
