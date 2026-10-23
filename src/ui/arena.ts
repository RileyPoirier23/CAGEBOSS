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
import { PixelText, pixelArtResolution, measure } from './text';
import { portrait } from './sprites';
import { sfx, type Sfx } from '../audio/sfx';
import { heightStr } from '../core/format';
import { ROOMS, leagueRoom, paintRoom, roomFx, type Room } from './rooms';
import { Rig, Pose, POSES, GUARD, JOINTS, type Joint, drawRig, lerpRig, mirrorRig, rotateRig, lookFor, stanceGuard, tauntRig, TAUNT_CALL, Look2, KO_POSES, koPoseFor, CELEB_ALIAS, mouthguardColor } from './rig';
import { Rng, hashString } from '../core/rng';

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
  /** the life it started with (sparks shrink and everything fades near the end) */
  life0: number;
  c: number;
  s: number;
  grav: number;
}
/** Caps so a wild exchange can't bury a phone in particles. */
const MAX_PARTS = 300;
const MAX_FLASHES = 40;

type HitJoint = 'haF' | 'haB' | 'ftB' | 'knB' | 'elB';
type HitTarget = 'head' | 'body' | 'legs';
/** A strike waiting its turn in a combination: it starts when the one before it ends. */
interface QStep {
  pose: Pose;
  dur: number;
  hit: '' | HitTarget;
  big: boolean;
  joint: HitJoint;
  lunge: number;
}
/** A watched strike on its way: the impact lands when the fist (or shin) gets there, not when it's thrown. */
interface Pend {
  atk: 0 | 1;
  joint: HitJoint;
  big: boolean;
  bloody: boolean;
  target: HitTarget;
  t: number;
  react: Pose | '';
  reactDur: number;
  fin: '' | 'kd' | 'ko';
  kop: Pose | '';
}
/** A mouthpiece knocked out on the canvas. */
interface Piece {
  x: number;
  y: number;
  vx: number;
  vy: number;
  bounces: number;
  c: number;
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
  /** how far the head is jolted sideways (long hair swings with it) */
  snap?: number;
  /** how long the current pose was given, and the strikes queued behind it (combinations) */
  poseDur?: number;
  queue: QStep[];
  /** the jolt from a shot: head and torso offsets and velocities, on springs */
  hd: [number, number];
  hv: [number, number];
  td: [number, number];
  tv: [number, number];
  /** hands-on: the engine's clock for the strike being thrown (set by drive() each frame), and the last driven phase */
  drv: { t: number; wind: number; rec: number } | null;
  drvU: number;
  /** going down: time into the fall (-1 = not falling), where it started, how he goes, the pose he ends in */
  fallT: number;
  fallFrom: Rig;
  fallKind: 'back' | 'face' | 'fold' | 'sit';
  fallPose: Pose;
  landed: boolean;
  /** where he landed, still being eased into the views that follow his x (the punch-in, the overhead view): world px */
  slide: number;
  /** rubbery legs (rocked, stunned), and the stumble timer */
  wobble: number;
  wobT: number;
  /** bouncing on the balls of the feet (eases off while he throws, so the back foot stays planted) */
  bounce: number;
  /** a cut drips, the long man paws, the man on the fence circles off it */
  dripT: number;
  pawT: number;
  pivT: number;
}

const newFState = (x: number, facing: 1 | -1): FState => ({
  rig: { ...POSES.guard }, pose: 'guard', poseT: 0, x, lunge: 0, recoil: 0, facing, queue: [],
  hd: [0, 0], hv: [0, 0], td: [0, 0], tv: [0, 0], drv: null, drvU: -1,
  fallT: -1, fallFrom: POSES.guard, fallKind: 'back', fallPose: 'ko', landed: false, slide: 0,
  wobble: 0, wobT: 0, bounce: 1, dripT: 1, pawT: 1.5, pivT: 3,
});

/** The strikes: thrown over the stance with a load, a snap and a recovery (and drawn in front of the man they hit). */
const STRIKE_POSES = new Set<Pose>(['jab', 'cross', 'hook', 'leadHook', 'uppercut', 'body', 'bodyJab', 'bodyHook', 'overhand', 'elbow', 'knee', 'plumKnee', 'flyknee', 'legkick', 'bodykick', 'headkick', 'frontKick', 'spinKick', 'spin']);
/** Kicks and knees: the knee chambers before the foot goes. */
const KICK_POSES = new Set<Pose>(['legkick', 'bodykick', 'headkick', 'frontKick', 'spinKick', 'knee', 'plumKnee', 'flyknee']);
/** Defence and feints: dip, hold, come back up, over his own stance. */
const DEFENCE_POSES = new Set<Pose>(['roll', 'pull', 'lean', 'parry', 'check', 'blockBody', 'catchKick', 'slip', 'block', 'paw', 'shoulderFeint', 'levelFeint']);
/** On the canvas (or the stool): no bouncing on the toes, he just breathes. */
const FLOORED = new Set<string>(['ko', 'koFace', 'koCrumple', 'down', 'kneel', 'stool', 'koStiff']);
/** Taking a shot: the spring jolt is the snap, the pose is the follow-through. */
const REACT_POSES = new Set<string>(['hurt', 'rocked', 'doubled', 'legBuckle']);
const onCanvas = (p: string): boolean => KO_POSES.has(p as Pose) || p === 'down' || p === 'kneel';
/** Move one joint of a copied rig (a fresh pair: copied rigs share their joints). */
const mvJ = (r: Rig, j: Joint, dx: number, dy: number): void => {
  r[j] = [r[j][0] + dx, r[j][1] + dy];
};

/**
 * The weight of a strike over its life, u = 0..1: a small load the wrong way, the snap out
 * (overshooting a touch), the contact frame at u = 0.4, then the recovery back to guard.
 */
export function strikeW(u: number): number {
  if (u <= 0) return 0;
  if (u < 0.2) return -0.15 * Math.sin(((u / 0.2) * Math.PI) / 2);
  if (u < 0.4) {
    const k = (u - 0.2) / 0.2;
    return -0.15 + 1.23 * (1 - (1 - k) * (1 - k) * (1 - k));
  }
  if (u < 0.5) return 1.08 - (0.08 * (u - 0.4)) / 0.1;
  if (u < 1) {
    const k = (u - 0.5) / 0.5;
    return 1 - k * k * (3 - 2 * k);
  }
  return 0;
}

const smooth = (k: number): number => {
  const c = Math.max(0, Math.min(1, k));
  return c * c * (3 - 2 * c);
};
/** Defence over its life: dip in, hold, come back up. */
function holdW(u: number): number {
  if (u < 0.2) return smooth(u / 0.2);
  if (u > 0.65) return 1 - smooth((u - 0.65) / 0.35);
  return 1;
}

/** Hands-on: where the strike is in its life, from the engine's clock (contact lands exactly at t = wind). */
function driveU(t: number, wind: number, rec: number): number {
  if (t < wind) {
    if (wind > 0.2) return t < wind - 0.07 ? (0.2 * t) / (wind - 0.07) : 0.2 + (0.2 * (t - wind + 0.07)) / 0.07;
    return (0.4 * t) / Math.max(0.001, wind);
  }
  return 0.4 + 0.6 * Math.min(1, (t - wind) / Math.max(0.001, rec));
}

/** The kinetic chain: the hip turns first, then the shoulder, then the fist (a joint's head start in u). */
const PUNCH_LEAD: Record<Joint, number> = { head: 0, neck: 0, shF: 0.04, elF: 0.02, haF: 0, shB: 0.04, elB: 0.02, haB: 0, hip: 0.06, knF: 0, ftF: 0, knB: 0, ftB: 0 };
/** Kicks: the hip and the knee chamber, the foot follows, so the leg arcs instead of sliding through the other one. */
const KICK_LEAD: Record<Joint, number> = { head: 0, neck: 0, shF: 0, elF: 0, haF: 0, shB: 0, elB: 0, haB: 0, hip: 0.06, knF: 0.08, ftF: -0.04, knB: 0.08, ftB: -0.04 };
/** Knees: the knee is the weapon, so it arrives on the contact frame (the hip still leads). */
const KNEE_LEAD: Record<Joint, number> = { head: 0, neck: 0, shF: 0, elF: 0, haF: 0, shB: 0, elB: 0, haB: 0, hip: 0.06, knF: 0, ftF: -0.04, knB: 0, ftB: -0.04 };
/** How much of a lunge each joint carries (the back foot stays planted)... */
const LUNGE_W: Record<Joint, number> = { head: 1, neck: 1, shF: 1, elF: 1, haF: 1, shB: 1, elB: 1, haB: 1, hip: 0.7, knF: 0.85, ftF: 1, knB: 0.35, ftB: 0 };
/** A rear-leg kick or a knee: the front foot is the one planted, the kicking leg carries the lunge into the target. */
const KICK_LUNGE_W: Record<Joint, number> = { head: 1, neck: 1, shF: 1, elF: 1, haF: 1, shB: 1, elB: 1, haB: 1, hip: 0.7, knF: 0.35, ftF: 0, knB: 1, ftB: 1 };
/** ...and of being knocked back (the head goes furthest, the feet hardly). */
const RECOIL_W: Record<Joint, number> = { head: 1.25, neck: 1.1, shF: 1, elF: 1, haF: 1, shB: 1, elB: 1, haB: 1, hip: 0.65, knF: 0.4, ftF: 0.15, knB: 0.4, ftB: 0.15 };
const ARMS = new Set<string>(['elF', 'haF', 'elB', 'haB']);

/** Which way each blow jolts the head (the defender's own frame: -x is back, +y is down). */
const SNAP_DIR: Record<string, [number, number]> = {
  jab: [-1, 0.05], bodyJab: [-0.6, 0.2], cross: [-1, 0.1], hook: [-0.7, 0.5], leadHook: [-0.7, 0.5], overhand: [-0.45, 0.9], uppercut: [-0.4, -1],
  elbow: [-0.8, 0.4], spin: [-0.9, 0.35], headkick: [-1, 0.4], knee: [-0.3, -0.9], plumKnee: [-0.3, -1], flyknee: [-0.3, -1], topPunch: [0, 1],
};
const SNAP_DEFAULT: [number, number] = [-1, 0.1];

/** What lands with what: lead-hand shots off the lead glove, rear-hand ones off the rear, knees, elbows, shins. */
const HIT_JOINT: Record<string, HitJoint> = {
  jab: 'haF', leadHook: 'haF', bodyJab: 'haF', elbow: 'elB', knee: 'knB', plumKnee: 'knB', flyknee: 'knB',
  legkick: 'ftB', bodykick: 'ftB', headkick: 'ftB', frontKick: 'ftB', spinKick: 'ftB',
};
const BODY_SHOTS = new Set<string>(['body', 'bodyJab', 'bodyHook', 'bodykick', 'frontKick', 'spinKick']);

/** A step of a strike sequence. big: 0 never, 1 always, 2 when the line is a big one (intensity 2+). */
interface SeqStep {
  p: Pose;
  alt: Pose | '';
  dur: number;
  target: HitTarget;
  big: 0 | 1 | 2;
  lunge: number;
}
const seqStep = (p: Pose, dur: number, target: HitTarget = 'head', big: 0 | 1 | 2 = 2, alt: Pose | '' = '', lunge = 4): SeqStep => ({ p, alt, dur, target, big, lunge });
/** What the booth says is what you see: each landed-strike template plays its own shot (or combination). */
const KEY_SEQ: Record<string, SeqStep[]> = {
  land_jab: [seqStep('jab', 0.22, 'head', 0)],
  land_cross: [seqStep('cross', 0.3)],
  land_hook: [seqStep('hook', 0.3, 'head', 2, 'leadHook')],
  land_uppercut: [seqStep('uppercut', 0.32)],
  land_overhand: [seqStep('overhand', 0.36)],
  land_body: [seqStep('bodyHook', 0.3, 'body', 2, 'body')],
  land_combo: [seqStep('jab', 0.15, 'head', 0), seqStep('cross', 0.17, 'head', 0), seqStep('leadHook', 0.26)],
  land_superman: [seqStep('overhand', 0.36, 'head', 2, '', 12)],
  land_spinning: [seqStep('spin', 0.42, 'head', 1)],
  land_flying: [seqStep('flyknee', 0.4, 'head', 1, '', 8)],
  land_legkick: [seqStep('legkick', 0.35, 'legs')],
  land_calfkick: [seqStep('legkick', 0.35, 'legs')],
  land_bodykick: [seqStep('bodykick', 0.38, 'body')],
  land_headkick: [seqStep('headkick', 0.45, 'head', 1)],
  land_knee: [seqStep('knee', 0.35, 'body')],
  land_elbow: [seqStep('elbow', 0.3)],
  land_dirty: [seqStep('uppercut', 0.2, 'head', 0, '', 1), seqStep('leadHook', 0.24, 'head', 2, '', 1)],
};

/** The shot the booth names in a finishing line, if it names one. */
function namedShot(text: string): Pose | '' {
  if (/uppercut/i.test(text)) return 'uppercut';
  if (/overhand/i.test(text)) return 'overhand';
  if (/hook/i.test(text)) return /left/i.test(text) ? 'leadHook' : /body|liver/i.test(text) ? 'bodyHook' : 'hook';
  if (/liver|to the body|body shot/i.test(text)) return 'bodyHook';
  if (/\bjab\b/i.test(text)) return 'jab';
  if (/straight right|right hand|\bcross\b/i.test(text)) return 'cross';
  return '';
}

/** Feints by style: wrestlers fake the level change, brawlers dip a shoulder, everybody else paws. */
function feintFor(stance: string, r: number): Pose {
  if (stance === 'wrestler' || stance === 'crouch') return r < 0.45 ? 'levelFeint' : r < 0.75 ? 'paw' : 'shoulderFeint';
  if (stance === 'brawler' || stance === 'handsLow') return r < 0.45 ? 'shoulderFeint' : r < 0.8 ? 'paw' : 'levelFeint';
  return r < 0.5 ? 'paw' : r < 0.8 ? 'shoulderFeint' : 'check';
}
const FEINT_DUR: Record<string, number> = { paw: 0.18, shoulderFeint: 0.24, levelFeint: 0.28, check: 0.3 };

/** How far the pressure can build: past 1 he's pinned on the fence, and the extra keeps him there a while longer. */
const PRESS_MAX = 1.3;

/** Ground positions, worst to best for the man on top (a change upward is a pass, downward a scramble). */
const GPOS_RANK: Record<string, number> = { guard: 0, half: 1, side: 2, mount: 3, back: 4 };

/** Signature moves the broadcast calls by name, when the line is the move. */
const SIG_MOVES: Record<string, { acts: string[]; pose?: Pose; call: string; text?: RegExp }> = {
  overhandRight: { acts: ['punch', 'kd', 'ko'], pose: 'overhand', call: 'THE OVERHAND RIGHT!' },
  bigOverhand: { acts: ['punch', 'kd', 'ko'], pose: 'overhand', call: 'THE OVERHAND RIGHT!' },
  leftHook: { acts: ['punch', 'kd', 'ko'], pose: 'leadHook', call: 'THE LEFT HOOK!' },
  counterLeft: { acts: ['punch', 'kd', 'ko'], pose: 'leadHook', call: 'THE COUNTER LEFT!' },
  headKick: { acts: ['headkick', 'ko'], pose: 'headkick', call: 'HEAD KICK!' },
  leftHeadKick: { acts: ['headkick', 'ko'], pose: 'headkick', call: 'THE LEFT HIGH KICK!' },
  showtimeKick: { acts: ['headkick', 'ko'], pose: 'headkick', call: 'SHOWTIME KICK!' },
  doubleLeg: { acts: ['td'], pose: 'shoot', call: 'THE DOUBLE LEG!' },
  guillotine: { acts: ['sub', 'tap'], call: 'THE GUILLOTINE!', text: /guillotine/i },
  rearNakedChoke: { acts: ['sub', 'tap'], call: 'THE REAR-NAKED CHOKE!', text: /rear-naked/i },
  calfKick: { acts: ['legkick'], pose: 'legkick', call: 'THE CALF KICK!' },
  legKicks: { acts: ['legkick'], pose: 'legkick', call: 'CHOPPING THE LEG!' },
  bodyHook: { acts: ['punch'], pose: 'bodyHook', call: 'BODY HOOK!' },
  liverShot: { acts: ['punch'], pose: 'bodyHook', call: 'TO THE LIVER!' },
  bodyShots: { acts: ['punch'], pose: 'bodyHook', call: 'BODY WORK!' },
  flyingKnee: { acts: ['knee', 'ko'], pose: 'flyknee', call: 'FLYING KNEE!' },
  spinningBackfist: { acts: ['punch', 'elbow'], pose: 'spin', call: 'SPINNING BACKFIST!' },
  spinningElbow: { acts: ['punch', 'elbow'], pose: 'spin', call: 'SPINNING ELBOW!' },
  spinningBackKick: { acts: ['kick', 'headkick'], pose: 'spinKick', call: 'SPINNING BACK KICK!' },
  spinningWheelKick: { acts: ['kick', 'headkick'], pose: 'spinKick', call: 'WHEEL KICK!' },
  jabJabJab: { acts: ['jab'], pose: 'jab', call: 'JAB, JAB, JAB!' },
  volume: { acts: ['jab'], pose: 'jab', call: 'THE VOLUME!' },
};
/** A signature only fits the shot he's throwing: hands, legs, knees, shots (a head kicker's punch KO isn't his head kick). */
const STRIKE_KIND: Record<string, string> = {
  jab: 'hand', cross: 'hand', hook: 'hand', leadHook: 'hand', uppercut: 'hand', body: 'hand', bodyJab: 'hand', bodyHook: 'hand', overhand: 'hand', elbow: 'hand', spin: 'hand',
  legkick: 'leg', bodykick: 'leg', headkick: 'leg', frontKick: 'leg', spinKick: 'leg', knee: 'knee', plumKnee: 'knee', flyknee: 'knee', shoot: 'shoot', trip: 'trip',
};
/** ...and the booth's words: when the line names a strike, it has to be his. */
const STRIKE_WORDS = /jab|cross|hook|uppercut|overhand|kick|knee|elbow|backfist|spinning|body|liver/i;
const SIG_WORDS: Record<string, RegExp> = {
  overhand: /overhand/i, leadHook: /hook/i, headkick: /kick/i, legkick: /kick|calf|leg/i, bodyHook: /body|liver|hook/i,
  flyknee: /knee/i, spin: /spinning|backfist|elbow/i, spinKick: /spinning|wheel|kick/i, jab: /jab/i,
};

/** What the watched sim may add to a line (absent: today's behaviour). */
type VisLine = TickerLine & { st?: [number, number]; gpos?: GroundSpot; tie?: 'collar' | 'under' | 'plum'; fence?: -1 | 0 | 1; lead?: 0 | 1 };

/** Blood on the canvas lasts the whole event; a new event gets a fresh mat. */
const MAT = { key: '', stains: [] as { x: number; y: number; r: number; c: number }[] };

export type CamMode = 'side' | 'tv' | 'top';

/** Every promotion paints its own canvas: colours, the ring round the middle, and its name. */
export type CanvasStyle = 'cbfc' | 'local' | 'regional' | 'pfl' | 'bk';
export interface CanvasInfo {
  style: CanvasStyle;
  /** name painted in the middle (text promotions); the CBFC uses the logo art */
  logo?: string;
  accent?: number;
  /** a special venue's room (rooms.ts); otherwise the league's own */
  room?: Room;
}
const CANVAS: Record<CanvasStyle, { mat: number; edge: number; wear: number; ring: number; rail: number; deco: number }> = {
  cbfc: { mat: 0xcfc8b9, edge: 0x8a8274, wear: 0xbdb5a5, ring: 0xa83232, rail: 0x8a1e1e, deco: 0x2a4a86 },
  // a bingo hall mat: grey-brown, taped seams, a ring somebody painted by hand
  local: { mat: 0x9c9384, edge: 0x5a5448, wear: 0x857c6c, ring: 0x3a5a3a, rail: 0x2a3a6a, deco: 0x6a6050 },
  regional: { mat: 0xdcdcd6, edge: 0x7a7a74, wear: 0xc6c6c0, ring: 0x2a5aa0, rail: 0x1e2a4a, deco: 0x2a2a2a },
  pfl: { mat: 0xc4c8cc, edge: 0x6a6e74, wear: 0xb0b4b8, ring: 0xc8a040, rail: 0x15161a, deco: 0x1a2a4a },
  bk: { mat: 0x6a2a24, edge: 0x3a1410, wear: 0x5a2420, ring: 0xd8b060, rail: 0x2a1a10, deco: 0xd8b060 },
};

/** Poses where the fighter is on his back, so his face points at the lights. */
const SUPINE = new Set(['gBot', 'hBot', 'passBot', 'mBot', 'sBot', 'abVic', 'atriVic', 'kimVic', 'legVic', 'guilAtk', 'triAtk', 'abAtk', 'legAtk', 'bottom', 'bottomSub', 'ko', 'down']);

export type GroundSpot = 'guard' | 'half' | 'mount' | 'side' | 'back';
export type ClinchTieView = { dom: -1 | 0 | 1; tie: 'collar' | 'under' | 'plum'; fence: -1 | 0 | 1 };
type SubKind = 'rnc' | 'guil' | 'tri' | 'ab' | 'atri' | 'kim' | 'leg';

/** Pose pairs per position: [top/attacker, bottom/victim, punch variant, who is drawn last]. */
const SPOTS: Record<GroundSpot, { a: Pose; d: Pose; punch: Pose; front: 'a' | 'd' }> = {
  guard: { a: 'gTop', d: 'gBot', punch: 'gTopPunch', front: 'a' },
  half: { a: 'hTop', d: 'hBot', punch: 'hTopPunch', front: 'a' },
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
  if (/rear-naked|twister|von flue|bow and arrow|neck crank/.test(t)) return 'rnc';
  if (/omoplata/.test(t)) return 'kim';
  if (/ankle lock/.test(t)) return 'leg';
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

/** Very short and very tall fighters look it (everybody else is drawn the same size). */
export const sizeFor = (f: Fighter): number => (f.height < 165 || f.height > 193 ? Math.max(0.74, Math.min(1.14, f.height / 180)) : 1);

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
  /** sponsor decals and the promotion's name painted on the canvas, seen from above */
  private topAds = new Container();
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
  shakeAmp = 4;
  /** the shake moves the whole picture: how long this one lasts, which way the blow went (+-1, 0 = any), and whether it jolts up and down too */
  private shakeDur = 0;
  private shakeDir = 0;
  private shakeY = false;
  private shakeN = 0;
  private shakePrev = 0;
  /** a big shot stops the frame for a beat (hit-stop), so it reads */
  hitStop = 0;
  /** hands-on, set every frame: how far up off the canvas each man has mashed (0..1), the engine's stun, the counter window */
  getupProg: [number, number] = [0, 0];
  stun: [number, number] = [0, 0];
  counterGlow: [number, number] = [0, 0];
  /** hands-on: the range tick on the canvas for this side (null = off) */
  rangeGuide: { side: 0 | 1 } | null = null;
  /** the player turned screen shake down: a quarter of it, and no punch-in */
  reduceMotion = false;
  /** the crowd's heat from the watch screen (0..1): the rows nearest the action get up */
  heat = 0;
  /** the instant replay is playing (the sponsor's name on the letterbox), or null */
  replay: string | null = null;
  /** debug: sounds played (the arena lab counts them on a rebuild) */
  sfxCount = 0;
  /** the fighters' tanks and cuts, from the engine (hands-on fights) or the lines (spectated): the models wear them */
  vitals: [{ gas: number; cut: number }, { gas: number; cut: number }] = [{ gas: 100, cut: 0 }, { gas: 100, cut: 0 }];
  round = 1;
  sec = 0;
  private lowerTop = false;
  private tdT = 0;
  private tdAtk: 0 | 1 = 0;
  private tdKind: 'shoot' | 'trip' = 'shoot';
  /** a position change on the mat plays a short transition frame (pass, scramble) before the new position */
  private trans: { kind: 'pass' | 'scramble'; atk: 0 | 1; t: number } | null = null;
  /** clinch: who has the better tie (poses), and who is pinned on the fence */
  clinchTie: ClinchTieView = { dom: -1, tie: 'collar', fence: -1 };
  private stainG = new Graphics();
  private stainsDrawn = -1;
  private matLogo = new Sprite();
  /** sponsor ribbon board (scrolls), canvas decals and the jumbotron ads: they change every event */
  private ads = new Container();
  private ribbon = new Container();
  private ribbonX = 0;
  private screenAd: PixelText[] = [];
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
  private calloutAge = 9;
  private calloutPrio = 0;
  private calloutColor: number = PAL.gold;
  ground: 'stand' | 'clinch' | 'atop' | 'btop' = 'stand';
  winnerSide = -1;
  finished = false;
  /** watched strikes on their way to the target, and whether we're rebuilding quietly (no sound, no fx) */
  private pend: Pend[] = [];
  private q = false;
  /** this line's dice: the same line always plays the same way (the reactions and the mouthpiece roll on them too) */
  private R = new Rng(1);
  /** who's walking whom down (-1 = fighter 1 on the left fence .. 1 = fighter 0 has him on the right one) */
  private press = 0;
  /** clean shots in a row by one man (+ fighter 0, - fighter 1): unanswered, they walk the other man back faster */
  private pressRun = 0;
  /** just broke from the clinch: a bigger gap for a moment */
  private breakT = 0;
  /** the sim said which tie it is: no random grip changes for a while */
  private tieHold = 0;
  /** the side-view punch-in on knockdowns and finishes (0..1), its timer, and who it's on */
  private zoomKick = 0;
  private kickT = 0;
  private zoomOn: 0 | 1 = 0;
  /** where the punch-in is looking (eased: a man landing or the other man taking the shot doesn't jerk the picture) */
  private zoomX = AW / 2;
  /** HP bars: the chunk just lost (drains after a beat), the white flash on a hit */
  private hpGhost: [number, number] = [100, 100];
  private hpPrev: [number, number] = [100, 100];
  private hpHitT: [number, number] = [0, 0];
  private hpFlash: [number, number] = [0, 0];
  /** watched fights: the clock runs on to the next line's time */
  private clockRamp: { from: number; to: number; t: number; dur: number } | null = null;
  private replayTag!: PixelText;
  private replayBug!: PixelText;
  private replayShown: string | null = null;
  /** the referee's job right now: a pose (alternating with b at hz), for t seconds once he's there; then the next one */
  private refAct: { a: Pose; b: Pose | ''; hz: number; t: number } | null = null;
  private refNext: { a: Pose; b: Pose | ''; hz: number; t: number } | null = null;
  private refRun = false;
  /** the fighter he's standing over (-1: nobody), and the count he's on */
  private refOver: -1 | 0 | 1 = -1;
  private refCountN = -1;
  private refFlip = false;
  /** the crowd: how loud (0..3, holds a beat then settles), and where the action is */
  private hype = 1;
  private hypeHold = 0;
  private actionX = AW / 2;
  private crowdDraws = 0;
  /** flash photography on the big moments */
  private flashT = 0;
  private flashes: { x: number; y: number; life: number }[] = [];
  /** knocked-out mouthpieces */
  private piece: [Piece | null, Piece | null] = [null, null];
  /** signature moves called (the round each fighter last had one) */
  private lastSig: [number, number] = [-9, -9];
  /** a finish's signature call, waiting for the KNOCKOUT! / KNOCKDOWN! / TAP! to have its moment (seen: that's up) */
  private sigNext: { s: string; prio: number; seen: boolean; t: number } | null = null;
  /** the man backed onto his own fence (gets the cage-back guard) */
  private pinned: [boolean, boolean] = [false, false];
  /** the rig each fighter was drawn with this frame (gloves for the counter glow) */
  private drawn: [Rig, Rig] = [POSES.guard, POSES.guard];
  private sz: [number, number] = [1, 1];
  private frameN = 0;

  constructor(
    public A: Fighter,
    public B: Fighter,
    public rounds: number,
    private info: { network?: string; event?: string; promo?: string; champs?: [boolean, boolean]; eventKey?: string; sponsors?: { name: string; color: number }[]; canvas?: CanvasInfo; bare?: boolean; refLook?: Look2 } = {},
  ) {
    super();
    const key = info.eventKey ?? info.event ?? '';
    if (MAT.key !== key) {
      MAT.key = key;
      MAT.stains = [];
    }
    this.L = [lookFor(A, 0, info.champs?.[0]), lookFor(B, 1, info.champs?.[1])];
    // no gloves tonight (a contract nobody read): white hand wraps
    if (info.bare) for (const L of this.L) L.glove = 0xe8e4d8;
    this.F = [newFState(CORNERS[0], 1), newFState(CORNERS[1], -1)];
    this.sz = [sizeFor(A), sizeFor(B)];
    this.ref = { rig: { ...POSES.stand }, pose: 'stand', x: AW / 2 + 70, tx: AW / 2 + 70, facing: -1, look: info.refLook ?? REF_LOOK, visible: true, spin: 0 };
    this.butler = { rig: { ...POSES.mic }, pose: 'mic', x: AW / 2, tx: AW / 2, facing: 1, look: BUTLER_LOOK, visible: false, spin: 0 };
    this.worldInner.addChild(this.bg, this.matLogo, this.stainG, this.crowd, this.ads, this.lights, this.fighters, this.fx, this.front);
    this.buildAds();
    // the promotion's logo painted on the canvas, squashed into the floor's perspective
    if (this.canvasStyle === 'cbfc') Assets.load(`${import.meta.env.BASE_URL}mat-logo.png`).then((tex: Texture) => {
      if (this.destroyed) return;
      this.matLogo.texture = tex;
      this.matLogo.anchor.set(0.5);
      this.matLogo.scale.set(0.42, 0.075);
      this.matLogo.position.set(AW / 2, FLOOR + 1);
      this.matLogo.alpha = 0.8;
    }).catch(() => {});
    this.world.addChild(this.worldInner);
    this.topWorld.addChild(this.top, this.topLogo, this.topAds, this.topStain, this.topFx, this.topLight);
    if (this.canvasStyle === 'cbfc') Assets.load(`${import.meta.env.BASE_URL}mat-logo.png`).then((tex: Texture) => {
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
    // shadowed, on a faint plate (drawHud): the sky is bright outdoors, and lamps and banners hang behind them
    this.nameW = [Math.min(120, measure(`${A.first[0]}. ${A.last}`)), Math.min(120, measure(`${B.first[0]}. ${B.last}`))];
    this.hud.addChild(text(`${A.first[0]}. ${A.last}`, 6, 3, { color: PAL.bone, shadow: PAL.ink }));
    this.hud.addChild(text(`${B.first[0]}. ${B.last}`, AW - 126, 3, { color: PAL.bone, width: 120, align: 'right', shadow: PAL.ink }));
    this.clock = text('R1 5:00', 0, 3, { width: AW, align: 'center', color: PAL.gold, shadow: PAL.ink });
    this.callout = text('', 0, 46, { width: AW, align: 'center', color: PAL.gold, scale: 2, shadow: PAL.ink });
    this.hud.addChild(this.clock, this.callout);
    this.slowTag = text('SLOW MO', AW - 58, AH - 8, { small: true, color: 0xffffff });
    this.slowTag.visible = false;
    this.hud.addChild(this.slowTag);
    // the instant replay's letterbox: the tag on the left, the sponsor on the right
    this.replayTag = text('INSTANT REPLAY', 8, AH - 8, { small: true, color: 0xffffff });
    this.replayBug = text('', AW - 126, AH - 8, { small: true, color: PAL.gold, width: 120, align: 'right' });
    this.replayTag.visible = false;
    this.replayBug.visible = false;
    this.hud.addChild(this.replayTag, this.replayBug);
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
    this.drawVenue(g);
    const sign = ROOMS[this.room].sign;
    if (sign && !this.roomSign) {
      const t = text(sign.text, 0, 0, { small: true, color: sign.color });
      t.position.set(Math.round(sign.x - t.textWidth / 2), sign.y);
      this.roomSign = t;
      this.worldInner.addChildAt(t, this.worldInner.getChildIndex(this.bg) + 1);
    }
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
    const cv = CANVAS[this.canvasStyle];
    const ring = this.info.canvas?.accent ?? cv.ring;
    g.poly(apron.flat()).fill(0x141015);
    g.poly(floor.flat()).fill(cv.mat);
    g.poly(floor.flat()).stroke({ color: cv.edge, width: 1 }); // canvas edge
    // canvas wear and the centre logo
    g.poly(oct(150, 10).flat()).fill({ color: cv.wear, alpha: 0.35 });
    g.ellipse(cx, cy + 1, 70, 8).stroke({ color: ring, width: 2, alpha: 0.6 });
    g.ellipse(cx, cy + 1, 40, 4.5).fill({ color: ring, alpha: 0.25 });
    g.rect(cx - 150, cy + 6, 40, 3).fill({ color: cv.deco, alpha: 0.35 });
    g.rect(cx + 110, cy + 6, 40, 3).fill({ color: cv.deco, alpha: 0.35 });
    if (this.canvasStyle === 'local') {
      // duct tape over the rips
      g.rect(cx - 96, cy - 6, 18, 2).fill({ color: 0x8a8a90, alpha: 0.8 }).rect(cx + 60, cy + 9, 14, 2).fill({ color: 0x8a8a90, alpha: 0.8 }).rect(cx + 128, cy - 3, 10, 2).fill({ color: 0x8a8a90, alpha: 0.8 });
    }
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
      g.moveTo(x0, y0 - H).lineTo(x1, y1 - H).stroke({ color: cv.rail, width: 3 }); // padded top rail
      g.moveTo(x0, y0 - 10).lineTo(x1, y1 - 10).stroke({ color: 0x1d1d22, width: 3 }); // bottom pad
    }
    // posts at the corners of the back panels
    for (const [x, y] of back) {
      if (y > cy + 6) continue;
      g.rect(x - 2, y - H - 3, 5, H - 6).fill(0x0e0e11);
      g.rect(x - 3, y - H - 5, 7, 4).fill(0x3a3a42);
    }
    // promotions without logo art get their name painted in the middle
    const logo = this.info.canvas?.logo;
    if (this.canvasStyle !== 'cbfc' && logo && !this.matName) {
      const t = text(logo.toUpperCase(), 0, 0, { color: ring });
      t.alpha = 0.7;
      t.scale.set(1.4, 0.45);
      t.position.set(Math.round(cx - (t.textWidth * 1.4) / 2), cy - 2);
      this.matName = t;
      this.worldInner.addChildAt(t, this.worldInner.getChildIndex(this.matLogo) + 1);
    }
  }
  private matName: PixelText | null = null;
  private roomSign: PixelText | null = null;

  /** Where the fight is: every league has its own room behind the cage. */
  private drawVenue(g: Graphics): void {
    paintRoom(g, this.room, lerpColor);
  }

  private get canvasStyle(): CanvasStyle {
    return this.info.canvas?.style ?? 'cbfc';
  }

  /** where the cage stands: a special venue, or the league's own room */
  private get room(): Room {
    return this.info.canvas?.room ?? leagueRoom(this.canvasStyle);
  }

  /** Sponsors around the cage: a ribbon board under the lighting rig, decals on the canvas, ads on the big screens. */
  private buildAds(): void {
    const sp = this.info.sponsors ?? [];
    if (!sp.length) return;
    // ribbon board: a dark LED strip, sponsor names scrolling in their colours
    const strip = new Graphics().rect(0, 31, AW, 7).fill(0x07060a).rect(0, 31, AW, 1).fill(0x2a2230).rect(0, 37, AW, 1).fill(0x2a2230);
    this.ads.addChild(strip);
    this.ribbon.y = 32;
    this.ads.addChild(this.ribbon);
    let x = 0;
    // repeat the names until the strip is covered twice (so the scroll can wrap)
    while (x < AW * 2) {
      for (const a of sp) {
        const t = text(a.name.toUpperCase(), x, 0, { small: true, color: a.color });
        this.ribbon.addChild(t);
        x += t.textWidth + 6;
        const dot = new Graphics().rect(x - 4, 2, 2, 2).fill(0x5a5060);
        this.ribbon.addChild(dot);
      }
    }
    this.ribbonX = 0;
    (this.ribbon as Container & { loopW?: number }).loopW = x / 2;
    // canvas decals: the presenting sponsor left of centre, the next one right (squashed into the floor's perspective)
    const cy = FLOOR + 1;
    sp.slice(0, 2).forEach((a, i) => {
      const t = text(a.name.toUpperCase(), 0, 0, { small: true, color: a.color });
      t.alpha = 0.55;
      t.scale.set(1, 0.5);
      t.position.set(i === 0 ? AW / 2 - 150 : AW / 2 + 150 - t.textWidth, cy + 5);
      this.ads.addChild(t);
    });
    // the two big screens alternate between the action and an ad
    for (const sx of [152, 272]) {
      const t = text('', sx, 2, { small: true, color: 0xffffff, width: 56, align: 'center', maxLines: 1 });
      t.visible = false;
      this.ads.addChild(t);
      this.screenAd.push(t);
    }
  }

  private tickAds(dt: number): void {
    const sp = this.info.sponsors ?? [];
    if (!sp.length) return;
    const loop = (this.ribbon as Container & { loopW?: number }).loopW ?? AW;
    this.ribbonX = (this.ribbonX + dt * 14) % loop;
    this.ribbon.x = -Math.round(this.ribbonX);
    // every few seconds the screens cut to a sponsor
    const slot = Math.floor(this.t / 4);
    const showAd = slot % 3 === 2 && this.scene !== 'intro';
    this.screenAd.forEach((t, i) => {
      t.visible = showAd;
      if (showAd) {
        const a = sp[(slot + i) % sp.length];
        // the screen's 56 px wide: as many whole words as fit, not a name cut off with dots
        const words = a.name.toUpperCase().split(' ');
        while (words.length > 1 && measure(words.join(' '), true) > 56) words.pop();
        t.setText(words.join(' '));
        t.tint = a.color;
      }
    });
  }

  /** The crowd's seats (positions and colours) for this room: fixed, so worked out once. */
  private crowdSeats: { x: number; y: number; v: number; head: number; body: number; fist: number }[] | null = null;
  private crowdKey = '';

  /** How loud it is: what the arena has seen, or the watch screen's heat, whichever is louder. */
  private effHype(): number {
    return Math.max(this.hype, this.heat * 3, this.scene !== 'fight' ? this.intensity : 0);
  }

  /** Something happened: the crowd gets up for it (and stays up a beat). */
  private pump(h: number, x = -1): void {
    this.hype = Math.max(this.hype, h);
    this.hypeHold = 1;
    this.actionX = x >= 0 ? x : (this.F[0].x + this.F[1].x) / 2;
  }

  private drawCrowd(): void {
    const g = this.crowd;
    // smaller rooms, smaller crowds: a bingo hall is half empty, the CBFC is sold out
    const room = ROOMS[this.room];
    if (!this.crowdSeats) {
      const fill = room.fill;
      const rows = room.rows;
      this.crowdSeats = [];
      for (let r = 0; r < rows; r++) {
        const y = 22 + r * 7 + (rows === 2 ? 14 : 0);
        for (let x = (r % 2) * 4; x < AW; x += 8) {
          const n = Math.sin(x * 12.9898 + r * 78.233) * 43758.5453;
          const v = n - Math.floor(n);
          if (((n * 7) % 1 + 1) % 1 > fill) continue;
          const head = lerpColor(0x1e171c, 0x4a3a40, v * 0.7);
          // outdoors in daylight you can see what they're wearing
          const shirt = room.shirts ? shade(room.shirts[Math.floor(v * 97) % room.shirts.length], room.day ? -0.1 : -0.45) : shade(head, -0.2);
          const skin = room.day ? lerpColor(0x8a6a50, 0xd8b090, v) : head;
          this.crowdSeats.push({ x, y, v, head: skin, body: shirt, fist: shade(skin, 0.2) });
        }
      }
    }
    // the crowd only moves when it's on its feet (and phones blink): redraw when the picture changes.
    // Big moments get the rows nearest the action up out of their seats, arms in the air.
    const eh = this.effHype();
    const standAt = (x: number) => Math.max(0, Math.min(1, (eh - 1.8) * 1.2 - Math.abs(x - this.actionX) / 320));
    const bouncing = (eh - 1.8) * 1.2 > 0.8;
    const key = `${Math.round(eh * 4)}|${Math.round(this.actionX / 40)}|${bouncing ? Math.floor(this.t * 30) : 0}`;
    if (key !== this.crowdKey) {
      this.crowdKey = key;
      this.crowdDraws++;
      g.clear();
      for (const s of this.crowdSeats) {
        const stand = standAt(s.x);
        const excite = stand > 0.8 ? Math.round(Math.abs(Math.sin(this.t * 9 + s.x)) * -2) : 0;
        const hy = s.y + excite - Math.round(3 * stand);
        g.circle(s.x + 3, hy, 2.5).fill(s.head);
        g.rect(s.x, hy + 2, 7, 5 + Math.round(2 * stand)).fill(s.body);
        if (s.v > 0.7 && stand > 0.5) g.rect(s.x - 1, hy - 5, 1, 4).fill(s.fist).rect(s.x + 7, hy - 5, 1, 4).fill(s.fist); // both arms up
        else if (eh >= 2 && s.v > 0.93) g.rect(s.x + 2, hy - 4, 2, 4).fill(s.fist); // fist up
      }
    }
    // what changes every frame goes on the lights layer (cleared each frame)
    const l = this.lights;
    l.clear();
    for (const s of this.crowdSeats) if (s.v > 0.97 && Math.sin(this.t * 2 + s.x) > 0) l.rect(s.x + 3, s.y - 2, 1, 2).fill(0xbfd8ff); // phone screens
    if (eh >= 2 && Math.random() < 0.06 * eh) {
      const fx = Math.random() * AW;
      l.circle(fx, 24 + Math.random() * 20, 2).fill(0xffffff);
    }
    // the big moment: flash photography all round the action, front rows
    for (const p of this.flashes) {
      const a = Math.max(0, Math.min(1, p.life / 0.08));
      l.rect(p.x - 1, p.y, 3, 1).fill({ color: 0xffffff, alpha: a }).rect(p.x, p.y - 1, 1, 3).fill({ color: 0xffffff, alpha: a });
    }
    roomFx(l, this.room, this.t);
    // jumbotrons show the action (no jumbotrons in a bingo hall or a warehouse)
    const sc = this.scene === 'intro' ? 0x3a2a14 : eh >= 3 ? 0x5a1a1a : 0x1a2a40;
    if (room.screens === 'low') l.rect(152, 15, 56, 7).fill(sc).rect(272, 15, 56, 7).fill(sc);
    else if (room.screens === 'high') l.rect(152, 2, 56, 6).fill(sc).rect(272, 2, 56, 6).fill(sc);
    // spotlights over the cage (in daylight you can barely see them)
    l.poly([AW / 2 - 30, 16, AW / 2 + 30, 16, AW / 2 + 150, FLOOR, AW / 2 - 150, FLOOR]).fill({ color: 0xfff2d0, alpha: (0.05 + this.intensity * 0.01) * (room.day ? 0.3 : 1) });
    // moving heads: four coloured beams sweeping the cage, wilder for walkouts and big moments
    const hype = this.scene === 'intro' ? 1 : eh >= 3 ? 0.8 : this.scene === 'ceremony' ? 0.7 : 0.25;
    const beamCols = [0x3a7aff, 0xff3a4a, 0xffffff, 0xb04aff];
    for (let b = 0; b < (room.beams ? 4 : 0); b++) {
      const ox = 60 + b * 120;
      const sweep = Math.sin(this.t * (0.7 + b * 0.23) + b * 1.7) * (90 + hype * 60);
      const tx = ox + sweep;
      const col = this.scene === 'intro' ? beamCols[(b + Math.floor(this.t * 1.5)) % 4] : beamCols[b];
      l.poly([ox - 2, 14, ox + 2, 14, tx + 22, FLOOR + 6, tx - 22, FLOOR + 6]).fill({ color: col, alpha: 0.035 + hype * 0.05 });
      l.ellipse(tx, FLOOR + 4, 22, 3).fill({ color: col, alpha: 0.05 + hype * 0.07 });
    }
    // LED strip along the top of the back fence: a chase that speeds up with the crowd (the big leagues only)
    const rail = 236;
    for (let i = 0; i < (room.led ? 46 : 0); i++) {
      const x = AW / 2 - rail + 22 + i * 9.8;
      const on = (i + Math.floor(this.t * (4 + eh * 3))) % 6 < 2;
      l.rect(Math.round(x), FLOOR - 88 + Math.round(Math.abs(x - AW / 2) / 30), 3, 1).fill({ color: on ? (eh >= 3 ? 0xff4040 : 0xffd27a) : 0x3a2a20, alpha: on ? 0.9 : 0.5 });
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
    const rm = ROOMS[this.room];
    g.rect(0, 0, AW, AH).fill(rm.day ? shade(rm.top, -0.35) : 0x110d11);
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
    g.poly(oct(TR + 14)).fill(ROOMS[this.room].top);
    g.poly(oct(TR + 3)).fill(0x2a2a30);
    const cv = CANVAS[this.canvasStyle];
    const ring = this.info.canvas?.accent ?? cv.ring;
    g.poly(oct(TR)).fill(cv.mat);
    // mat art
    g.circle(TCX, TCY, 26).stroke({ color: ring, width: 2, alpha: 0.55 });
    g.circle(TCX, TCY, 14).fill({ color: ring, alpha: 0.18 });
    if (this.canvasStyle === 'local') g.rect(TCX - 30, TCY + 22, 12, 3).fill({ color: 0x8a8a90, alpha: 0.8 }).rect(TCX + 34, TCY - 12, 10, 3).fill({ color: 0x8a8a90, alpha: 0.8 });
    // fence & posts
    g.poly(oct(TR + 1)).stroke({ color: 0x0c0c0e, width: 3 });
    const p = oct(TR + 1);
    for (let k = 0; k < 8; k++) g.circle(p[k * 2], p[k * 2 + 1], 3).fill(cv.rail);
    // from above you can read the canvas: sponsor decals in their colours, and the promotion's name
    this.topAds.removeChildren().forEach((c) => c.destroy());
    const sp = this.info.sponsors ?? [];
    const spots: [number, number][] = [[TCX - 33, TCY - 37], [TCX + 33, TCY + 34], [TCX - 52, TCY + 14], [TCX + 52, TCY - 16]];
    sp.slice(0, 4).forEach((a, i) => {
      const t = text(a.name.toUpperCase(), 0, 0, { small: true, color: a.color });
      t.alpha = 0.75;
      t.position.set(Math.round(spots[i][0] - t.textWidth / 2), spots[i][1] - 3);
      this.topAds.addChild(t);
    });
    const logo = this.info.canvas?.logo;
    if (this.canvasStyle !== 'cbfc' && logo) {
      const t = text(logo.toUpperCase(), 0, 0, { color: ring });
      t.alpha = 0.7;
      t.position.set(Math.round(TCX - t.textWidth / 2), TCY - 4);
      this.topAds.addChild(t);
    }
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

  // ------------------------------------------------------------ hands-on fights
  /** Hands-on fights: feet positions come from the live engine instead of the AI footwork. */
  manual: [number, number] | null = null;

  /** Start of a hands-on round: no walk-out, no glove touch, straight into it. */
  manualRound(): void {
    this.scene = 'fight';
    this.prefight = false;
    this.walkIn = false;
    this.touchT = 0;
    this.resting = false;
    this.roundOver = false;
    this.finished = false;
    this.winnerSide = -1;
    this.held = [];
    this.engage = null;
    this.ground = 'stand';
    this.subAnim = null;
    this.pend = [];
    this.refAct = null;
    this.refNext = null;
    this.refOver = -1;
    this.F.forEach((f, i) => {
      f.pose = 'guard';
      f.poseT = 0;
      f.v = 0;
      f.facing = i === 0 ? 1 : -1;
      this.calm(f);
      if (this.manual) f.x = this.manual[i];
    });
  }

  /** Back to neutral: no jolt, no fall, no wobble, nothing queued. */
  private calm(f: FState): void {
    f.queue = [];
    f.hd = [0, 0];
    f.hv = [0, 0];
    f.td = [0, 0];
    f.tv = [0, 0];
    f.snap = 0;
    f.wobble = 0;
    f.drv = null;
    f.drvU = -1;
    f.slide = 0;
    if (f.fallT >= 0) {
      f.fallT = -1;
      f.rig = { ...POSES[f.fallPose] };
    }
  }

  /** Play a pose on one fighter (hands-on fights). */
  /** The broadcast's line for this fighter's taunt. */
  tauntCall(i: 0 | 1): string {
    return TAUNT_CALL[this.L[i].taunt ?? 'arms'];
  }

  play(i: 0 | 1, pose: string, dur = 0.3, lunge = 0): void {
    this.setPose(i, (POSES as Record<string, unknown>)[pose] ? (pose as Pose) : 'guard', dur);
    if (lunge) this.F[i].lunge = lunge;
    if (pose === 'rocked') this.F[i].wobble = Math.max(this.F[i].wobble, 2.5);
  }

  /** A strike connects (hands-on fights). target: true = the body, false = the head (the old flag), or say where. */
  strike(atk: 0 | 1, joint: 'haF' | 'haB' | 'ftB' | 'knB' | 'elB', big: boolean, bloody: boolean, target: boolean | 'head' | 'body' | 'legs' = false): void {
    const where: HitTarget = target === true ? 'body' : target === false ? 'head' : target;
    this.impact(atk, joint, big, bloody, where);
  }

  /**
   * Hands-on: the engine's clock for the strike fighter i is throwing (call it every frame, before
   * update, while his act is a punch, kick or knee). Full extension and the contact land exactly at
   * t = wind; the recovery takes rec. A frame without a call plays the strike on its own clock.
   */
  drive(i: 0 | 1, t: number, wind: number, rec: number): void {
    const f = this.F[i];
    if (f.drv) {
      f.drv.t = t;
      f.drv.wind = wind;
      f.drv.rec = rec;
    } else f.drv = { t, wind, rec };
  }

  /** Blocked, parried, checked or caught: a pale spark off the gloves (or the shin), and a half step back. */
  blockFx(def: 0 | 1, kind: 'block' | 'parry' | 'catch' | 'check'): void {
    const atk = (1 - def) as 0 | 1;
    const D = this.F[def];
    const A = this.F[atk];
    const j = kind === 'check' ? D.rig.knF : D.rig.haF;
    const s = this.sz[def];
    const x = D.x + j[0] * D.facing * s - D.recoil * D.facing;
    const y = FLOOR + j[1] * s;
    this.burst(x, y, kind === 'parry' ? 9 : 5, 0xd8e8ff, 50, 0.25, 1, 100);
    const [tx, ty] = this.topPos(def);
    this.burst(tx, ty, 4, 0xd8e8ff, 30, 0.25, 1, 0, true);
    D.recoil = Math.max(D.recoil, 3);
    this.shake(0.04, 2, A.facing);
    if (kind === 'parry') {
      // knocked off line: the shot dies and he's turned a little
      A.lunge = 0;
      A.recoil = 4;
    }
    if (kind === 'catch') {
      this.setPose(atk, 'hop', 0.6);
      this.setPose(def, 'catchKick', 0.6);
    }
  }

  /** Slow motion is running (knockdowns, finishes). */
  isSlow(): boolean {
    return this.slowT > 0;
  }

  /** Watched fights: run the clock on to t over `over` seconds (it never goes backward within a round). */
  clockTo(t: number, over: number): void {
    if (t <= this.sec) return;
    this.clockRamp = { from: this.sec, to: t, t: 0, dur: Math.max(0.01, over) };
  }

  /** Count rules: the referee stands over fighter i and counts (one arm, then the point, each number). */
  refCount(i: 0 | 1, n: number): void {
    if (n === this.refCountN && this.refOver === i && this.refAct) return;
    this.refCountN = n;
    this.refFlip = !this.refFlip;
    this.refJob(this.refFlip ? 'refCount' : 'refPoint', '', 0, 1.1, i);
  }

  /** Mirror the engine's position on the mat. */
  setMat(ground: 'stand' | 'clinch' | 'atop' | 'btop', spot: GroundSpot = 'guard', sub: { name: string; atk: 0 | 1 } | null = null): void {
    const was = this.ground === 'atop' || this.ground === 'btop';
    const now = ground === 'atop' || ground === 'btop';
    if (now && !was) {
      this.groundX = Math.max(CAGE_L + 60, Math.min(CAGE_R - 60, (this.F[0].x + this.F[1].x) / 2));
      this.center = this.groundX;
    }
    if (!now && was) for (const i of [0, 1] as const) if (this.F[i].pose !== 'techUp') this.setPose(i, 'guard', 0);
    this.ground = ground;
    this.groundPos = spot;
    if (sub && now) {
      const kind = subKindFor(sub.name, this.isTop(sub.atk));
      if (!this.subAnim || this.subAnim.kind !== kind || this.subAnim.tapped) this.subAnim = { kind, atk: sub.atk, t: 99, tapped: false };
      else this.subAnim.t = 99;
    } else if (this.subAnim && !this.subAnim.tapped) this.subAnim = null;
  }

  /** Ground and pound flash on the top man. */
  gnp(): void {
    this.gnpT = 0.28;
  }

  /** A pass / guard recovery (top man works) or a scramble (sweeps, lost leg locks) on the mat. */
  transition(kind: 'pass' | 'scramble', atk: 0 | 1): void {
    this.trans = { kind, atk, t: kind === 'pass' ? 0.45 : 0.55 };
    this.burst(this.groundX, FLOOR, 6, 0xd8d0c0, 35, 0.35, 2, 60);
  }

  /** The takedown itself: a double leg (shoot, lift, dump) or a trip from the clinch. */
  takedown(atk: 0 | 1, kind: 'shoot' | 'trip'): void {
    this.tdT = 0.95;
    this.tdAtk = atk;
    this.tdKind = kind;
    this.burst((this.F[0].x + this.F[1].x) / 2, FLOOR, 10, 0xd8d0c0, 50, 0.4, 2, 60);
    this.burst(this.tc.x, this.tc.y, 8, 0xe8e0d0, 30, 0.5, 2, 0, true);
    this.shake(0.15, 4, 0, true, true);
  }

  /** The clinch pose for fighter i: the man with the tie holds it, the other covers up (or has his back on the fence). */
  private clinchPose(i: 0 | 1): Pose {
    const c = this.clinchTie;
    if (c.dom === i) return c.tie === 'plum' ? 'plum' : c.tie === 'under' ? 'underhook' : 'collar';
    if (c.fence === i) return 'cageBack';
    return c.dom < 0 ? 'clinch' : 'clinchDef';
  }

  /**
   * Knocked down / back up / out cold (hands-on fights). detail: for 'down', 'body' puts him on a
   * knee; for 'ko', what did it (the result's detail) decides how he falls.
   */
  floor(i: 0 | 1, state: 'down' | 'up' | 'ko', detail = ''): void {
    if (state === 'up') {
      this.setPose(i, 'techUp', 0.3);
      return;
    }
    if (state === 'down') {
      this.setPose(i, detail === 'body' ? 'kneel' : 'down', 9999);
      this.bigMoment(i);
      this.refJob('refPoint', '', 0, 1.2, i);
      if (this.R.next() < 0.25) this.knockPiece(i);
      return;
    }
    const kop = koPoseFor(detail);
    this.setPose(i, kop, 9999);
    this.F[i].recoil = kop === 'koFace' ? -10 : 22;
    this.finished = true;
    this.winnerSide = 1 - i;
    this.bigMoment(i);
    this.waveOff(i);
    this.knockPiece(i);
  }

  /** The fight is over: winner celebrates. */
  over(winner: 0 | 1 | -1, tapped?: { name: string; atk: 0 | 1 }): void {
    const first = !this.finished;
    this.finished = true;
    this.winnerSide = winner;
    if (tapped && (this.ground === 'atop' || this.ground === 'btop')) this.subAnim = { kind: subKindFor(tapped.name, this.isTop(tapped.atk)), atk: tapped.atk, t: 2.4, tapped: true };
    if (!first) return;
    if (tapped) {
      this.bigMoment((1 - tapped.atk) as 0 | 1);
      this.refJob('refBreak', '', 0, 1.2, -1);
      this.refRun = true;
      this.ref.tx = (this.F[0].x + this.F[1].x) / 2;
    } else if (winner >= 0 && this.sec < 299.5 && !this.refAct) {
      // stopped before the bell: the ref dives in and waves it off
      this.waveOff((1 - winner) as 0 | 1);
      this.flashT = 1.6;
      this.pump(3);
    }
  }

  /** A knockdown, a knockout, a tap: the crowd's up, the cameras flash, the picture punches in on the man going down. */
  private bigMoment(i: 0 | 1): void {
    this.flashT = 1.6;
    this.kickT = 1.2;
    this.zoomOn = i;
    this.pump(3, this.F[i].x);
  }

  /** It's over: the referee runs in, scissors his arms over his head, then dives over the man on the canvas. */
  private waveOff(i: 0 | 1): void {
    // (stopped on his feet: he steps in between them instead)
    const down = onCanvas(this.F[i].pose) || this.F[i].fallT >= 0 || this.ground === 'atop' || this.ground === 'btop';
    this.refJob('refWave1', 'refWave2', 6, 0.9, i, { a: down ? 'refCover' : 'refBreak', b: '', hz: 0, t: down ? 2.5 : 1.5 });
    this.refRun = true;
  }

  /** Give the referee a job: a pose (alternating with b at hz Hz) held t seconds once he gets there; over = the man he stands by. */
  private refJob(a: Pose, b: Pose | '', hz: number, t: number, over: -1 | 0 | 1, next: { a: Pose; b: Pose | ''; hz: number; t: number } | null = null): void {
    this.refAct = { a, b, hz, t };
    this.refNext = next;
    this.refOver = over;
    this.refRun = false;
    if (over >= 0) this.refHold = Math.max(this.refHold, t);
  }

  /** The mouthpiece flies out (a knockout always, a knockdown sometimes, now and then a big shot). */
  private knockPiece(i: 0 | 1): void {
    if (this.q || this.piece[i]) return;
    const f = this.F[i];
    const a = this.F[1 - i];
    const s = this.sz[i];
    this.piece[i] = { x: f.x + f.rig.head[0] * f.facing * s, y: FLOOR + (f.rig.head[1] + 3) * s, vx: a.facing * (50 + this.R.next() * 40), vy: -(80 + this.R.next() * 40), bounces: 0, c: mouthguardColor(this.L[i]) };
    this.L[i].noGuard = true;
  }

  slowMo(t: number): void {
    this.slowT = t;
  }

  /** Both fighters to the centre, referee between them holding their wrists. */
  startCeremony(): void {
    this.flushPend(-1);
    this.refAct = null;
    this.refNext = null;
    this.refOver = -1;
    this.refRun = false;
    for (const f of this.F) this.calm(f);
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
    // his own gesture with the free hand if it's one of those, otherwise the arm goes up
    const style = this.celebStyle(w);
    this.F[w].pose = style === 'point' || style === 'pointUp' || style === 'flex' || style === 'roar' ? (style as Pose) : 'armUp';
    this.F[(1 - w) as 0 | 1].pose = 'headDown';
    this.winnerSide = w;
    this.intensity = 3;
    this.flash = 0.2;
    this.flashT = 1.6;
    this.pump(3, this.F[w].x);
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

  /** keep: a combination's next shot (the rest of the queue stays). */
  private setPose(i: 0 | 1, p: Pose, dur = 0.35, keep = false): void {
    const f = this.F[i];
    // holding a guard (hands-on re-sends it every frame): stay in it instead of starting it over
    if (p === f.pose && f.poseT > 0 && f.poseDur && DEFENCE_POSES.has(p)) {
      const u = Math.min(0.2, Math.max(0, 1 - f.poseT / f.poseDur));
      f.poseDur = dur / (1 - u);
      f.poseT = dur;
      return;
    }
    // going down from his feet: a fall, not a melt
    if (onCanvas(p) && this.upright(f)) {
      f.fallT = 0;
      f.fallFrom = { ...f.rig };
      f.fallKind = p === 'ko' ? 'back' : p === 'koFace' ? 'face' : p === 'koCrumple' ? 'fold' : 'sit';
      f.fallPose = p;
      f.landed = false;
    }
    f.pose = p;
    f.poseT = dur;
    f.poseDur = dur;
    if (!keep) f.queue = [];
  }

  /** On his feet (not on the canvas, not tangled up on the mat). */
  private upright(f: FState): boolean {
    return (this.ground === 'stand' || this.ground === 'clinch') && !onCanvas(f.pose) && f.fallT < 0 && this.scene === 'fight';
  }

  /** Put a man straight down on the canvas (a quiet rebuild: no fall to watch). */
  private floorNow(i: 0 | 1, p: Pose): void {
    const f = this.F[i];
    this.setPose(i, p, 9999);
    f.fallT = -1;
    f.rig = { ...POSES[p] };
  }

  /** Where a shot lands on the man taking it: his face, his ribs, his thigh (screen coords, knocked back the way he's drawn). */
  private hitPoint(def: 0 | 1, target: HitTarget): [number, number] {
    const D = this.F[def];
    const r = D.rig;
    const j: [number, number] = target === 'head' ? r.head : target === 'body' ? [r.neck[0] + (r.hip[0] - r.neck[0]) * 0.45, r.neck[1] + (r.hip[1] - r.neck[1]) * 0.45] : r.knF;
    const s = this.sz[def];
    const kb = Math.abs(D.recoil) > 12 ? 1 : target === 'head' ? RECOIL_W.head : target === 'body' ? 0.9 : RECOIL_W.knF;
    return [D.x + (j[0] * s - D.recoil * kb) * D.facing, FLOOR + j[1] * s];
  }

  private burst(x: number, y: number, n: number, color: number, speed = 70, life = 0.35, size = 2, grav = 220, top = false): void {
    if (this.q) return;
    const arr = top ? this.tparts : this.parts;
    for (let k = 0; k < n && arr.length < MAX_PARTS; k++) {
      const l = life * (0.6 + Math.random() * 0.6);
      arr.push({ x, y, vx: (Math.random() - 0.5) * speed * 2, vy: top ? (Math.random() - 0.5) * speed * 2 : -Math.random() * speed, life: l, life0: l, c: color, s: size, grav: top ? 0 : grav });
    }
  }

  /** A spray thrown one way (dir = +-1): sweat flying off the head, away from the punch. */
  private burstDir(x: number, y: number, n: number, color: number, dir: number, spread: number): void {
    if (this.q) return;
    for (let k = 0; k < n && this.parts.length < MAX_PARTS; k++) {
      const l = 0.4 + Math.random() * 0.25;
      this.parts.push({ x, y, vx: dir * spread * (0.3 + Math.random() * 0.7), vy: -(10 + Math.random() * 60), life: l, life0: l, c: color, s: 1, grav: 180 });
    }
  }

  /** Shake the whole picture (dir: the way the blow went; y: a slam, it jolts up and down too). */
  private shake(t: number, amp: number, dir = 0, y = false, force = false): void {
    if (this.q) return;
    if (!force && this.shakeT > 0 && amp < this.shakeAmp) return; // a bigger one is still going
    this.shakeT = t;
    this.shakePrev = t;
    this.shakeDur = t;
    this.shakeAmp = amp;
    this.shakeDir = dir;
    this.shakeY = y;
    this.shakeN = 0;
  }

  /** Sound, unless we're rebuilding quietly. */
  private snd(name: Sfx): void {
    if (this.q) return;
    this.sfxCount++;
    sfx(name);
  }

  /** A callout, unless we're rebuilding quietly. */
  private call(s: string, color: number = PAL.gold, prio = 1): void {
    if (!this.q) this.showCallout(s, color, prio);
  }

  private impact(attacker: 0 | 1, joint: 'haF' | 'haB' | 'ftB' | 'knB' | 'elB', big: boolean, bloody: boolean, target: HitTarget = 'head', quiet = false): void {
    const wasQ = this.q;
    this.q = quiet || wasQ;
    const def = (1 - attacker) as 0 | 1;
    const A = this.F[attacker];
    const D = this.F[def];
    A.lunge = 7;
    D.recoil = big ? 9 : 5;
    // where it lands: on him, where he's drawn as the blow knocks him back
    const [x, y] = this.hitPoint(def, target);
    const [hx0, hy0] = this.hitPoint(def, 'head');
    // the man who got hit reacts: the head whips the way the blow went and springs back, the torso
    // follows; he's knocked back a step, body shots fold him, leg kicks buckle the knee, big ones rock him
    const head = target === 'head';
    const legs = target === 'legs';
    const m = big ? 260 : 150;
    const onMat = this.ground === 'atop' || this.ground === 'btop';
    const dir = SNAP_DIR[onMat && (this.gnpT > 0 || A.pose === 'topPunch') ? 'topPunch' : A.pose] ?? SNAP_DEFAULT;
    if (head) {
      D.hv = [D.hv[0] + dir[0] * m, D.hv[1] + dir[1] * m];
      D.tv = [D.tv[0] + dir[0] * m * 0.35, D.tv[1] + Math.max(0, dir[1]) * m * 0.2];
    } else if (target === 'body') {
      D.tv = [D.tv[0] - m * 0.3, D.tv[1] + m * 0.15];
      D.hv = [D.hv[0] - m * 0.2, D.hv[1] + m * 0.2];
    } else D.tv = [D.tv[0], D.tv[1] + m * 0.1];
    if (this.ground === 'stand' || this.ground === 'clinch') {
      D.v = (D.v ?? 0) - D.facing * (legs ? 25 : big ? 120 : 60);
      if (D.poseT <= 0 || D.pose === 'guard') {
        if (legs) this.setPose(def, 'legBuckle', big ? 0.45 : 0.3); // the knee goes
        else if (target === 'body') {
          if (big || this.R.next() < 0.5) this.setPose(def, 'doubled', 0.4); // folded over
        } else if (big) {
          this.setPose(def, 'rocked', 0.45);
          D.wobble = Math.max(D.wobble, 0.6);
        } else if (this.R.next() < 0.5) this.setPose(def, 'hurt', 0.2);
      }
    }
    if (big && !this.q) this.hitStop = 0.055;
    this.zoomOn = def;
    this.burst(x, y, big ? 16 : 7, big ? PAL.gold : 0xffffff, big ? 110 : 60, 0.3, big ? 2 : 1);
    // sweat flies off the head, away from the blow (more of it as the rounds go)
    if (head) this.burstDir(hx0, hy0, 3 + Math.round((this.L[def].sweat ?? 0) * 10), 0xd8ecff, A.facing, 130);
    if (bloody) this.burst(x, y, 6, 0xa01818, 45, 0.9, 2);
    // same hit, top-down
    const [tx, ty] = this.topPos(def);
    this.burst(tx, ty, big ? 12 : 5, big ? PAL.gold : 0xffffff, big ? 60 : 35, 0.3, big ? 2 : 1, 0, true);
    if (bloody) this.burst(tx, ty, 5, 0xa01818, 25, 1.5, 2, 0, true);
    if (big) this.shake(0.25, 5, A.facing, false, true);
    else if (this.shakeT <= 0) this.shake(0.06, 2, A.facing);
    if (big && this.mode === 'tv' && !this.q) this.cutTo('close', 0.25);
    if (big) {
      this.pump(2, D.x);
      if (head && this.R.next() < 0.03) this.knockPiece(def);
    }
    this.q = wasQ;
  }

  /** A watched strike is on its way: the impact (and the reaction) land at contact, t seconds from now. */
  private pendHit(atk: 0 | 1, joint: HitJoint, big: boolean, bloody: boolean, target: HitTarget, t: number, react: Pose | '', reactDur: number, fin: '' | 'kd' | 'ko' = '', kop: Pose | '' = ''): void {
    this.flushPend(atk);
    const p: Pend = { atk, joint, big, bloody, target, t, react, reactDur, fin, kop };
    // a quiet rebuild: it lands now, as state only
    if (this.q) this.firePend(p);
    else this.pend.push(p);
  }

  /** Land the strikes still on their way now (side -1: everybody's). */
  private flushPend(side: -1 | 0 | 1): void {
    if (!this.pend.length) return;
    const keep: Pend[] = [];
    const go: Pend[] = [];
    for (const p of this.pend) {
      if (side < 0 || p.atk === side) go.push(p);
      else keep.push(p);
    }
    this.pend = keep;
    for (const p of go) this.firePend(p);
  }

  /** Contact. */
  private firePend(p: Pend): void {
    const A = p.atk;
    const D = (1 - A) as 0 | 1;
    const f = this.F[D];
    if (p.react) this.setPose(D, p.react, p.reactDur);
    if (p.fin === 'kd') {
      // down (on a knee, from a body shot)
      const kp = (p.kop || 'down') as Pose;
      this.impact(A, p.joint, true, p.bloody, p.target);
      if (this.q) this.floorNow(D, kp);
      else this.setPose(D, kp, 1.6);
      f.poseT = 1.6;
      if (this.q) return;
      this.flash = 0.25;
      this.call('KNOCKDOWN!', PAL.gold, 4);
      this.slowT = 1.1;
      this.bigMoment(D);
      this.refJob('refPoint', '', 0, 1.2, D);
      if (this.R.next() < 0.25) this.knockPiece(D);
      if (this.mode === 'tv') this.cutTo('close', 0.6, true);
      this.snd('punch');
      this.snd('roar');
      return;
    }
    if (p.fin === 'ko') {
      const kop = (p.kop || 'ko') as Pose;
      this.impact(A, p.joint, true, p.bloody, p.target);
      if (this.q) {
        this.floorNow(D, kop);
        return;
      }
      this.setPose(D, kop, 9999);
      f.recoil = kop === 'koFace' ? -10 : 22;
      this.shake(0.45, 8, this.F[A].facing, false, true);
      this.hitStop = 0.12;
      this.flash = 0.6;
      this.call('KNOCKOUT!', PAL.gold, 5);
      this.slowT = 1.6;
      this.bigMoment(D);
      this.waveOff(D);
      this.knockPiece(D);
      if (this.mode === 'tv') this.cutTo('close', 1.5, true);
      this.snd(p.joint === 'ftB' || p.joint === 'knB' ? 'kick' : 'punch');
      this.snd('roar');
      return;
    }
    this.impact(A, p.joint, p.big, p.bloody, p.target);
    this.snd(p.joint === 'ftB' || p.joint === 'knB' ? 'kick' : 'punch');
  }

  /**
   * Feed a ticker line. Anything that needs contact (strikes, clinch entries, shots) waits until
   * the attacker has stepped into range, so nobody ever lands a punch on air from across the cage.
   * `instant` applies the line on the spot and quietly (rebuilding the view mid-fight).
   */
  cue(line: TickerLine, instant = false): void {
    // (a hands-on fight's cut comes in this way too: it's live, not a rebuild, so it still bleeds)
    if (instant) return this.apply(line, !(this.manual && line.act === 'cut'));
    this.held.push(line);
    this.pumpHeld(0);
  }

  /** True while the arena is still acting something out that the next line must not interrupt. */
  busy(): boolean {
    if (this.scene !== 'fight' || this.finished) return false;
    return this.held.length > 0 || this.pend.length > 0 || this.F[0].queue.length > 0 || this.F[1].queue.length > 0 || this.walkIn || this.touchT > 0 || (this.roundOver && this.walkT < 2.5 && !this.atCorners());
  }

  /** Rebuilt mid-fight (lines replayed instantly): put everyone where the last line left them. */
  settle(): void {
    for (const l of this.held.splice(0)) this.apply(l, true);
    const wasQ = this.q;
    this.q = true;
    this.flushPend(-1);
    this.q = wasQ;
    this.engage = null;
    this.walkIn = false;
    this.touchT = 0;
    this.parts = [];
    this.tparts = [];
    this.slowT = 0;
    this.hitStop = 0;
    this.calloutT = 0;
    this.sigNext = null;
    this.flash = 0;
    this.flashT = 0;
    this.flashes = [];
    this.shakeT = 0;
    this.shakePrev = 0;
    this.zoomKick = 0;
    this.kickT = 0;
    this.clockRamp = null;
    // no takedown, pass or punch half played out: they're where the last line left them
    this.tdT = 0;
    this.gnpT = 0;
    this.trans = null;
    this.hpGhost = [this.hp[0], this.hp[1]];
    this.hpPrev = [this.hp[0], this.hp[1]];
    const ground = this.ground === 'atop' || this.ground === 'btop';
    this.F.forEach((f, i) => {
      f.v = 0;
      this.calm(f);
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
        const floored = this.F.some((f) => (f.pose === 'down' || f.pose === 'kneel') && f.poseT > 0);
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
      // (if we gave up waiting, the downed man gets up for it)
      if (reach) for (const i of [0, 1] as const) if ((this.F[i].pose === 'down' || this.F[i].pose === 'kneel') && this.F[i].poseT > 0 && this.F[i].poseT < 9000) this.setPose(i, 'techUp', 0.35);
      this.apply(line);
    }
  }

  /** Act out a line. quiet: a rebuild (no sound, sparks, shake, slow-mo or callouts; the state is the same). */
  private apply(line: TickerLine, quiet = false): void {
    if (line.speaker) return; // booth chatter doesn't move anybody
    const wasQ = this.q;
    this.q = quiet || wasQ;
    this.applyLine(line as VisLine);
    this.q = wasQ;
  }

  private applyLine(line: VisLine): void {
    // the same line always plays the same way (any view, any rebuild)
    const R = new Rng(hashString(`${line.round}|${line.t}|${line.key ?? ''}|${line.side}|${line.act}`));
    this.R = R;
    // the clock: a new round starts it again, otherwise it only runs forward
    if (line.round !== this.round) {
      this.round = line.round;
      this.sec = line.t;
      this.clockRamp = null;
    } else if (line.t > this.sec) this.sec = line.t;
    this.hp = [line.hp[0], line.hp[1]];
    this.intensity = Math.max(1, line.intensity);
    this.pump(this.intensity);
    if (line.st) {
      this.vitals[0].gas = line.st[0];
      this.vitals[1].gas = line.st[1];
    }
    // a new round: out of the corners and into the middle (nothing lands until they meet)
    if (line.key === 'opening' || line.key === 'round_start') this.walkOut(line.key === 'opening');
    const prevGround = this.ground;
    this.ground = line.pos;
    if (line.act === 'bell') this.ground = 'stand'; // the bell breaks up whatever they were doing
    const wasDown = prevGround === 'atop' || prevGround === 'btop';
    const isDown = this.ground === 'atop' || this.ground === 'btop';
    if (isDown && !wasDown) {
      // hit the mat: where the sim says, or most takedowns land in guard, good ones in side control or mount
      if (line.gpos) this.groundPos = line.gpos;
      else {
        const r = R.next();
        this.groundPos = r < 0.35 ? 'guard' : r < 0.55 ? 'half' : r < 0.75 ? 'side' : r < 0.9 ? 'mount' : 'back';
      }
      // the ground work happens where they fell: no sliding across the canvas
      this.groundX = Math.max(CAGE_L + 60, Math.min(CAGE_R - 60, (this.F[0].x + this.F[1].x) / 2));
      this.center = this.groundX;
    } else if (isDown && wasDown && prevGround !== this.ground) {
      this.groundPos = line.gpos ?? (R.next() < 0.6 ? 'half' : 'mount'); // reversal
      this.subAnim = null;
      this.trans = { kind: 'scramble', atk: this.ground === 'atop' ? 0 : 1, t: 0.55 };
    } else if (isDown && line.gpos) {
      // the sim says where they are now: a better spot for the top man is a pass, a worse one a scramble
      if (line.gpos !== this.groundPos && !this.subAnim) {
        const top: 0 | 1 = this.ground === 'atop' ? 0 : 1;
        const better = (GPOS_RANK[line.gpos] ?? 0) > (GPOS_RANK[this.groundPos] ?? 0);
        this.groundPos = line.gpos;
        this.trans = better ? { kind: 'pass', atk: top, t: 0.45 } : { kind: 'scramble', atk: (1 - top) as 0 | 1, t: 0.55 };
      }
    } else if (isDown && R.next() < 0.12 && !this.subAnim) {
      // the top man advances now and then
      const was = this.groundPos;
      this.groundPos = was === 'guard' ? 'half' : was === 'half' ? 'side' : was === 'side' ? (R.next() < 0.5 ? 'mount' : 'back') : was;
      if (was !== this.groundPos) this.trans = { kind: 'pass', atk: this.ground === 'atop' ? 0 : 1, t: 0.45 };
    }
    if (this.ground === 'clinch' && prevGround !== 'clinch') {
      const tie: 'collar' | 'under' | 'plum' = line.tie ?? (R.next() < 0.5 ? 'collar' : R.next() < 0.5 ? 'under' : 'plum');
      this.clinchTie = { dom: line.side < 0 ? -1 : (line.side as 0 | 1), tie, fence: -1 };
    }
    if (this.ground === 'clinch') {
      if (line.tie) {
        this.clinchTie = { dom: this.clinchTie.dom, tie: line.tie, fence: this.clinchTie.fence };
        this.tieHold = 3;
      }
      // whose back is on the cage: the pair goes to that fence
      if (line.fence !== undefined && line.fence >= 0) this.clinchTie = { dom: this.clinchTie.dom, tie: this.clinchTie.tie, fence: line.fence };
    } else if (!isDown && line.fence !== undefined && line.fence >= 0) {
      // standing with his back to the fence: the picture shows it
      this.press = line.fence === 1 ? Math.max(this.press, 0.7) : Math.min(this.press, -0.7);
    }
    if (line.lead !== undefined) this.press = Math.max(-PRESS_MAX, Math.min(PRESS_MAX, this.press + (line.lead === 0 ? 0.08 : -0.08)));
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
        this.snd('bell');
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
        this.call('STAND UP!');
        this.breakUp();
      }
      return;
    }
    const A = a as 0 | 1;
    const D = (1 - a) as 0 | 1;
    const ground = this.ground === 'atop' || this.ground === 'btop';
    const bloody = this.hp[D] < 55 && R.next() < 0.5;
    const sig = (A === 0 ? this.A : this.B).anim?.signature ?? [];
    const key = line.key ?? '';
    // an exchange on the feet: re-centre on the pair so they don't drift straight back out of range
    if (!ground && REACH[line.act]) this.center = (this.F[0].x + this.F[1].x) / 2;
    // landing clean walks the other man back toward his fence (faster when he doesn't answer)
    if (!ground && (/^land_/.test(key) || line.act === 'kd' || line.act === 'rocked')) {
      const big = line.intensity >= 2 || line.act === 'kd';
      const dir = A === 0 ? 1 : -1;
      this.pressRun = this.pressRun * dir > 0 ? this.pressRun + dir : dir;
      const run = Math.min(4, Math.abs(this.pressRun));
      this.press = Math.max(-PRESS_MAX, Math.min(PRESS_MAX, this.press + dir * (big ? 0.22 : 0.1) * (1 + 0.5 * (run - 1))));
    }
    // a whiff: the shot is thrown for real and the other man gets out of the way of that shot
    if (/^miss_/.test(key)) {
      const kick = line.act === 'kick';
      const r = R.next();
      const shot: Pose = kick ? (r < 0.45 ? 'legkick' : r < 0.8 ? 'bodykick' : 'headkick') : r < 0.35 ? 'jab' : r < 0.65 ? 'cross' : r < 0.8 ? 'hook' : r < 0.9 ? 'leadHook' : 'overhand';
      this.setPose(A, shot, kick ? 0.38 : 0.26);
      this.F[A].lunge = 5;
      const d = R.next();
      const dodge: Pose =
        shot === 'hook' || shot === 'leadHook' || shot === 'overhand' ? 'roll'
          : shot === 'jab' || shot === 'cross' ? (d < 0.5 ? 'slip' : d < 0.8 ? 'pull' : 'parry')
            : shot === 'legkick' ? 'check'
              : shot === 'bodykick' ? (d < 0.2 ? 'catchKick' : 'blockBody')
                : 'pull';
      this.setPose(D, dodge, 0.3);
      // a caught kick: the kicker is left hopping on one leg
      if (dodge === 'catchKick') this.F[A].queue.push({ pose: 'hop', dur: 0.45, hit: '', big: false, joint: 'ftB', lunge: 0 });
      if (dodge === 'slip' || dodge === 'pull' || dodge === 'roll') this.F[D].v = (this.F[D].v ?? 0) - this.F[D].facing * 70;
      this.snd('whoosh');
      return;
    }
    // a feint: a paw, a shoulder dip, a level change (by style); the other man flinches
    if (line.act === 'idle') {
      if (!ground) {
        const fp = feintFor(this.L[A].stance, R.next());
        this.setPose(A, fp, FEINT_DUR[fp] ?? 0.2);
        this.F[A].lunge = fp === 'paw' ? 3 : 1;
        if (R.next() < 0.6) this.setPose(D, 'block', 0.25);
      }
      return;
    }
    // the counter: the other man's lead whiffs, the counter-puncher slips (or rolls) it; the next line lands the counter
    if (key === 'counter' && !ground) {
      const r = R.next();
      const whiff: Pose = r < 0.4 ? 'jab' : r < 0.75 ? 'cross' : 'hook';
      this.setPose(D, whiff, 0.26);
      this.F[D].lunge = 5;
      this.setPose(A, whiff === 'hook' ? 'roll' : 'slip', 0.24);
      this.call('COUNTER!', PAL.gold, 3);
      this.snd('whoosh');
      return;
    }
    const seq = ground ? undefined : KEY_SEQ[key];
    if (seq) this.strikeSeq(A, seq, line, bloody);
    else
      switch (line.act) {
        case 'jab': {
          const p: Pose = R.next() < 0.2 ? 'bodyJab' : 'jab';
          this.setPose(A, p, 0.22);
          this.pendHit(A, 'haF', false, false, p === 'bodyJab' ? 'body' : 'head', 0.22 * 0.4, R.next() < 0.3 ? 'slip' : 'hurt', 0.2);
          break;
        }
        case 'cross': // a counter
        case 'punch': {
          const pr = R.next();
          const p: Pose = line.act === 'cross' ? 'cross' : pr < 0.18 ? 'hook' : pr < 0.3 ? 'leadHook' : pr < 0.4 ? 'uppercut' : pr < 0.5 ? 'body' : pr < 0.58 ? 'bodyHook' : pr < 0.66 ? 'overhand' : 'cross';
          if (ground) {
            this.setPose(A, 'topPunch', 0.25);
            this.gnpT = Math.max(this.gnpT, 0.25);
            this.pendHit(A, 'haB', false, bloody, 'head', 0.1, '', 0);
          } else {
            this.setPose(A, p, 0.3);
            this.pendHit(A, HIT_JOINT[p] ?? 'haB', line.intensity >= 2, bloody, BODY_SHOTS.has(p) ? 'body' : 'head', 0.3 * 0.4, 'hurt', 0.28);
          }
          break;
        }
        case 'elbow':
          this.setPose(A, ground ? 'topPunch' : 'elbow', 0.3);
          if (ground) this.gnpT = Math.max(this.gnpT, 0.28);
          this.pendHit(A, 'elB', line.intensity >= 2, true, 'head', 0.3 * 0.4, 'hurt', 0.3);
          break;
        case 'legkick':
          this.setPose(A, 'legkick', 0.35);
          this.pendHit(A, 'ftB', line.intensity >= 2, false, 'legs', 0.35 * 0.4, '', 0);
          break;
        case 'kick': {
          const p: Pose = R.next() < 0.2 ? 'frontKick' : 'bodykick';
          this.setPose(A, p, 0.38);
          this.pendHit(A, 'ftB', line.intensity >= 2, false, 'body', 0.38 * 0.4, 'hurt', 0.3);
          break;
        }
        case 'headkick':
          this.setPose(A, 'headkick', 0.45);
          this.pendHit(A, 'ftB', true, bloody, 'head', 0.45 * 0.4, 'rocked', 0.5);
          break;
        case 'knee': {
          const p: Pose = sig.includes('flyingKnee') && R.next() < 0.5 ? 'flyknee' : 'knee';
          const plum = this.ground === 'clinch' && this.clinchTie.dom === A && this.clinchTie.tie === 'plum';
          this.setPose(A, p, 0.35);
          this.pendHit(A, 'knB', line.intensity >= 2, bloody, plum || p === 'flyknee' ? 'head' : 'body', 0.35 * 0.4, 'hurt', 0.3);
          break;
        }
        case 'rocked':
          this.setPose(D, 'rocked', 0.9);
          this.F[D].wobble = Math.max(this.F[D].wobble, 2.5);
          this.refTo(this.center + (D === 0 ? -30 : 30));
          this.snd('crowd');
          break;
        case 'kd': {
          const p: Pose = namedShot(line.text) || (R.next() < 0.5 ? 'hook' : 'cross');
          const body = BODY_SHOTS.has(p);
          this.setPose(A, p, 0.35);
          this.pendHit(A, HIT_JOINT[p] ?? 'haB', true, !body, body ? 'body' : 'head', 0.35 * 0.4, '', 0, 'kd', body ? 'kneel' : '');
          break;
        }
        case 'ko': {
          // how he goes depends on what put him there
          const kop = koPoseFor(`${key} ${line.act} ${line.text}`);
          // (a punch KO is a punch: the one the booth names, or one that fits the way he falls)
          const p: Pose =
            key === 'ko_kick' ? (/spinning|wheel/i.test(line.text) ? 'spinKick' : 'headkick')
              : key === 'ko_knee' ? (/flying/i.test(line.text) ? 'flyknee' : 'knee')
                : key === 'ko_elbow' ? 'elbow'
                  : namedShot(line.text) || (kop === 'ko' ? (R.next() < 0.5 ? 'uppercut' : 'cross')
                    : kop === 'koCrumple' ? (R.next() < 0.5 ? 'hook' : 'overhand')
                      : R.next() < 0.5 ? 'bodyHook' : 'overhand');
          this.setPose(A, p, 0.6);
          this.pendHit(A, HIT_JOINT[p] ?? 'haB', true, true, kop === 'koFace' && BODY_SHOTS.has(p) ? 'body' : 'head', 0.6 * 0.4, '', 0, 'ko', kop);
          this.winnerSide = A;
          this.finished = true;
          break;
        }
        case 'tko':
          if (this.q) this.floorNow(D, ground ? 'bottom' : 'down');
          else this.setPose(D, ground ? 'bottom' : 'down', 9999);
          this.setPose(A, 'celebrate', 9999);
          this.winnerSide = A;
          this.finished = true;
          this.call("IT'S STOPPED!", PAL.gold, 5);
          if (!this.q) {
            this.waveOff(D);
            this.bigMoment(D);
          }
          this.snd('roar');
          break;
        case 'gnp':
          this.setPose(A, 'topPunch', 0.25);
          this.gnpT = 0.28;
          this.pendHit(A, 'haB', false, bloody, 'head', 0.1, '', 0);
          break;
        case 'td':
          // shoot, lift, dump (or a trip out of the clinch): the poses play out before the ground position takes over
          this.takedown(A, prevGround === 'clinch' || /trip|throw|sweeps? the leg|foot sweep/i.test(line.text) ? 'trip' : 'shoot');
          this.setPose(A, this.tdKind === 'trip' ? 'trip' : 'shoot', 0.3);
          this.setPose(D, this.tdKind === 'trip' ? 'falling' : 'lifted', 0.25);
          this.snd('slam');
          break;
        case 'sprawl':
          this.setPose(D, 'shoot', 0.35);
          this.setPose(A, 'sprawl', 0.5);
          this.snd('grapple');
          break;
        case 'sub':
          if (ground) {
            const kind = subKindFor(line.text, this.isTop(A));
            this.subAnim = { kind, atk: A, t: 2.2, tapped: false };
            if (kind === 'rnc') this.groundPos = 'back';
          } else this.setPose(A, 'clinch', 0.8);
          if (this.mode === 'tv' && !this.q) this.cutTo('close', 0.2);
          this.snd('strain');
          break;
        case 'tap':
          this.subAnim = { kind: subKindFor(line.text, ground && this.isTop(A)), atk: A, t: 2.4, tapped: true };
          this.setPose(A, this.isTop(A) ? 'top' : 'bottomSub', 2.4);
          this.winnerSide = A;
          this.finished = true;
          this.call('TAP! TAP! TAP!', PAL.gold, 5);
          this.refTo(this.center);
          if (!this.q) {
            // the ref dives in to stop it
            this.bigMoment(D);
            this.refJob('refBreak', '', 0, 1.2, -1);
            this.refRun = true;
          }
          this.snd('tap');
          this.snd('roar');
          break;
        case 'sweep':
          this.burst(this.center, FLOOR, 8, 0xd8d0c0, 40, 0.4, 2, 60);
          this.snd('slam');
          break;
        case 'clinch':
          this.snd('grapple');
          break;
        case 'break':
          // they let go: both push off, the referee steps in between
          this.F[0].v = -110;
          this.F[1].v = 110;
          this.ground = 'stand';
          this.breakUp();
          break;
        case 'ctrl':
          break;
        case 'taunt':
          this.setPose(A, 'taunt', 1.0);
          break;
        case 'cut':
          this.vitals[D].cut++;
          this.burst(this.F[D].x + 6 * this.F[D].facing, FLOOR - 74, 10, 0xa01818, 50, 1.0, 2);
          break;
        case 'injury':
          this.call('INJURY!');
          this.snd('snap');
          break;
        case 'foul':
          this.call('FOUL!');
          this.setPose(D, 'hurt', 0.8);
          this.refTo(this.center);
          break;
        case 'stool':
          this.call('RETIRED ON THE STOOL', PAL.gold, 5);
          this.finished = true;
          break;
        case 'stop':
          this.finished = true;
          break;
        case 'getup':
          // back up off the canvas after a knockdown
          if ((this.F[A].pose === 'down' || this.F[A].pose === 'kneel') && this.F[A].poseT < 9000) this.setPose(A, 'techUp', 0.35);
          this.subAnim = null;
          break;
        case 'escape':
          this.subAnim = null;
          break;
      }
    this.signature(A, sig, line);
    if (line.t >= 288 && !this.clapped.has(line.round) && this.scene === 'fight') {
      // the timekeeper's clapper: ten seconds left in the round
      this.clapped.add(line.round);
      this.call('10 SECONDS!');
      this.snd('click');
    }
  }

  /** A strike line that's a sequence: the first shot now, the rest queued behind it; each lands at its own contact frame. */
  private strikeSeq(A: 0 | 1, seq: SeqStep[], line: VisLine, bloody: boolean): void {
    const f = this.F[A];
    for (let k = 0; k < seq.length; k++) {
      const st = seq[k];
      let p: Pose = st.alt && this.R.next() < 0.5 ? st.alt : st.p;
      let target = st.target;
      // a knee from the plum goes to the face
      if (p === 'knee' && this.ground === 'clinch' && this.clinchTie.dom === A && this.clinchTie.tie === 'plum') {
        p = 'plumKnee';
        target = 'head';
      }
      const big = st.big === 1 || (st.big === 2 && line.intensity >= 2);
      const joint = HIT_JOINT[p] ?? 'haB';
      if (k === 0) {
        this.setPose(A, p, st.dur);
        f.lunge = Math.max(f.lunge, st.lunge);
        this.pendHit(A, joint, big, bloody, target, st.dur * 0.4, '', 0);
      } else if (this.q) this.pendHit(A, joint, big, false, target, 0, '', 0); // rebuilding: just the hits
      else f.queue.push({ pose: p, dur: st.dur, hit: target, big, joint, lunge: st.lunge });
    }
  }

  /** Separating them: the referee steps in between, arms out. */
  private breakUp(): void {
    this.breakT = 1;
    this.refTo((this.F[0].x + this.F[1].x) / 2, 1);
    this.refJob('refBreak', '', 0, 0.7, -1);
    this.refRun = true;
  }

  /** His signature move, called by name when the line is that move (once every couple of rounds; always on the finish). */
  private signature(A: 0 | 1, sig: string[], line: VisLine): void {
    if (!sig.length || this.q) return;
    const finish = line.act === 'ko' || line.act === 'tap' || line.act === 'kd';
    if (!finish && (line.round - this.lastSig[A] < 2 || line.intensity < 2)) return;
    const f = this.F[A];
    const throwing = f.poseT > 0 && (STRIKE_POSES.has(f.pose) || f.pose === 'shoot' || f.pose === 'trip');
    const named = STRIKE_WORDS.test(line.text);
    const fits: string[] = [];
    for (const id of sig) {
      const m = SIG_MOVES[id];
      if (!m || !m.acts.includes(line.act) || (m.text && !m.text.test(line.text))) continue;
      // it has to be the shot we're showing, and the one the booth is calling
      if (m.pose && (!throwing || STRIKE_KIND[m.pose] !== STRIKE_KIND[f.pose])) continue;
      if (m.pose && named && SIG_WORDS[m.pose] && !SIG_WORDS[m.pose].test(line.text)) continue;
      fits.push(id);
    }
    if (!fits.length || (!finish && this.R.next() >= 0.35)) return;
    const m = SIG_MOVES[fits[Math.floor(this.R.next() * fits.length)]];
    // the shot he's throwing becomes his shot
    if (m.pose && throwing) f.pose = m.pose;
    this.lastSig[A] = line.round;
    // on a finish it goes up right after the KNOCKOUT! / KNOCKDOWN! / TAP! (already up on a tap, at contact on the others)
    if (finish) this.sigNext = { s: m.call, prio: line.act === 'kd' ? 4 : 5, seen: line.act === 'tap', t: 4 };
    else this.call(m.call, PAL.gold, 1);
  }

  /** His celebration style: his own (through CELEB_ALIAS), or one of the arena's if he hasn't got one we know. */
  private celebStyle(i: 0 | 1): string {
    const who = i === 0 ? this.A : this.B;
    const own = CELEB_ALIAS[who.anim?.celebration ?? ''] ?? '';
    return own || ['jump', 'flex', 'point', 'jump', 'strut'][(who.id.length + who.last.length) % 5];
  }

  /** The winner's party piece, based on who they are. */
  private celebration(i: 0 | 1, base: Rig): Rig {
    const style = this.celebStyle(i);
    const t = this.t;
    const shift = (r: Rig, dx: number, dy: number): Rig => Object.fromEntries(Object.entries(r).map(([k, v]) => [k, [v[0] + dx, v[1] + dy]])) as Rig;
    switch (style) {
      case 'flex':
        return Math.floor(t * 1.2) % 2 ? POSES.flex : POSES.celebrate;
      case 'prays':
        return { ...POSES.stool, hip: [0, -18], knF: [10, -2], ftF: [-2, 0], knB: [4, -2], ftB: [-8, 0], haF: [6, -52], haB: [4, -52], elF: [10, -42], elB: [6, -42], head: [4, -54], neck: [2, -46] };
      case 'point':
        return Math.floor(t * 0.8) % 2 ? POSES.point : POSES.celebrate;
      case 'pointUp':
        return Math.floor(t * 0.7) % 2 ? POSES.pointUp : POSES.celebrate;
      case 'bow':
        return Math.floor(t * 0.6) % 2 ? POSES.bow : POSES.stand;
      case 'roar': {
        // chest out, arms wide, shaking with it
        const k = Math.sin(t * 18) * (Math.floor(t * 0.7) % 2 ? 1 : 0.3);
        return shift(POSES.roar, k * 0.6, 0);
      }
      case 'shush':
        return Math.floor(t * 0.5) % 2 ? POSES.shush : POSES.celebrate;
      case 'shrug':
        return Math.floor(t * 0.9) % 2 ? POSES.shrug : POSES.stand;
      case 'flipoff':
        this.L[i].bird = true;
        return POSES.flipoff;
      case 'strut':
        return Math.floor(t * 5) % 2 ? POSES.walk1 : POSES.walk2;
      case 'walkAway':
        return shift(Math.floor(t * 3) % 2 ? POSES.walk1 : POSES.walk2, 0, 1);
      case 'dances':
        return shift(Math.floor(t * 4) % 2 ? POSES.taunt : POSES.celebrate, Math.sin(t * 8) * 3, 0);
      case 'backflip': {
        // every couple of seconds: crouch, up (an 18 px arc), round with the knees tucked, land
        const ph = (t % 2.2) / 1.1;
        if (ph >= 1) return POSES.celebrate;
        const tuck: Rig = { ...POSES.stand, knF: [12, -54], ftF: [2, -44], knB: [10, -52], ftB: [0, -42], haF: [12, -54], haB: [10, -52], elF: [10, -60], elB: [6, -60] };
        const k = Math.max(0, Math.min(1, (ph - 0.15) / 0.7));
        const r = k <= 0 || k >= 1 ? lerpRig(POSES.stand, tuck, 0.3) : rotateRig(tuck, -Math.PI * 2 * k, 0, -50);
        return shift(r, 0, -18 * Math.sin(Math.PI * k));
      }
      case 'jump':
      default: {
        const up = Math.abs(Math.sin(t * 5)) * 9;
        return shift({ ...base, knF: [base.knF[0] + 4, base.knF[1] + up * 0.3], knB: [base.knB[0] - 4, base.knB[1] + up * 0.3] }, 0, -up);
      }
    }
  }

  /**
   * What gets drawn on top of the tweened rig: the feet stepping, the idle bounce (or breathing on the
   * canvas), the lunge and knock-back weighted joint by joint (the back foot stays planted), the jolt
   * of a shot through the head and torso, and the wobble of a man on rubbery legs.
   */
  private stepped(i: 0 | 1, f: FState): Rig {
    const r: Rig = { ...f.rig };
    const speed = Math.abs(f.v ?? 0);
    if (this.ground !== 'stand' && this.ground !== 'clinch') {
      // on the mat: nobody is ever still, legs and hands keep working; the man underneath takes the shots in the head
      const w = Math.sin(this.t * 2.4 + f.x * 0.1);
      mvJ(r, 'ftF', w * 1.2, 0);
      mvJ(r, 'ftB', -w, 0);
      mvJ(r, 'haB', 0, w * 0.8);
      const push = f.lunge - f.recoil;
      if (push) for (const j of JOINTS) mvJ(r, j, push, 0);
      r.head = [r.head[0], Math.min(0, r.head[1] + Math.hypot(f.hd[0], f.hd[1]) * 0.6)];
      return r;
    }
    if (f.fallT >= 0) {
      // falling: nothing but the fall (and whatever knocked him back)
      const kb = f.recoil;
      if (kb) for (const j of JOINTS) mvJ(r, j, -kb * (Math.abs(kb) > 12 ? 1 : RECOIL_W[j]), 0);
      return r;
    }
    if (FLOORED.has(f.pose)) {
      // down (or sat on the stool): no bounce, he breathes
      const br = Math.sin(this.t * 2.4 + i) * (0.5 + (this.L[i].gassed ?? 0));
      for (const j of ['neck', 'head', 'shF', 'shB'] as const) mvJ(r, j, 0, br);
    } else if (speed < 6) {
      // bouncing on the balls of the feet, weight shifting (not while he throws: the back foot is planted)
      const k = f.bounce;
      const b = Math.sin(this.t * 6.2 + f.x * 0.05);
      const shiftW = Math.sin(this.t * 1.7 + f.x * 0.03) * 1.5 * k;
      mvJ(r, 'ftF', shiftW, -Math.max(0, b) * 1.2 * k);
      mvJ(r, 'ftB', shiftW * 0.6, -Math.max(0, -b) * 1.2 * k);
      mvJ(r, 'knF', shiftW * 0.6, -Math.max(0, b) * 0.8 * k);
      mvJ(r, 'knB', shiftW * 0.4, -Math.max(0, -b) * 0.8 * k);
    } else {
      const amp = Math.min(1, speed / 55);
      const ph = (f.dist ?? 0) * 0.2;
      const sF = Math.sin(ph);
      const back = Math.sign(f.v ?? 0) * f.facing < 0; // retreating: the back foot leads
      mvJ(r, 'ftF', sF * 4 * amp * (back ? -1 : 1), -Math.max(0, sF) * 3 * amp);
      mvJ(r, 'knF', sF * 2 * amp * (back ? -1 : 1), -Math.max(0, sF) * 2 * amp);
      mvJ(r, 'ftB', -sF * 4 * amp * (back ? -1 : 1), -Math.max(0, -sF) * 3 * amp);
      mvJ(r, 'knB', -sF * 2 * amp * (back ? -1 : 1), -Math.max(0, -sF) * 2 * amp);
      const bob = -Math.abs(sF) * 1.4 * amp;
      for (const j of ['hip', 'neck', 'head', 'shF', 'shB', 'elF', 'elB', 'haF', 'haB'] as const) mvJ(r, j, 0, bob);
    }
    // the lunge carries the body over a planted foot (the back one; the front one under a kick); a knock back takes the head furthest
    const big = Math.abs(f.recoil) > 12;
    const lw = KICK_POSES.has(f.pose) && f.pose !== 'frontKick' && f.poseT > 0 ? KICK_LUNGE_W : LUNGE_W;
    if (f.lunge || f.recoil) for (const j of JOINTS) mvJ(r, j, f.lunge * lw[j] - f.recoil * (big ? 1 : RECOIL_W[j]), 0);
    // the jolt of the shot
    const hd = f.hd;
    const td = f.td;
    if (hd[0] || hd[1] || td[0] || td[1]) {
      mvJ(r, 'head', hd[0], hd[1]);
      mvJ(r, 'neck', hd[0] * 0.5 + td[0] * 0.6, hd[1] * 0.5 + td[1] * 0.6);
      for (const j of ['shF', 'shB', 'elF', 'elB', 'haF', 'haB'] as const) mvJ(r, j, td[0], td[1]);
      mvJ(r, 'hip', td[0] * 0.3, td[1] * 0.3);
    }
    // rubbery legs: the head loops, the hips sway, the knees dip, the hands come down
    const w = Math.min(1, f.wobble);
    if (w > 0.01 && !FLOORED.has(f.pose)) {
      const s1 = Math.sin(this.t * 4.1);
      for (const j of ['head', 'neck', 'shF', 'shB'] as const) mvJ(r, j, s1 * 3 * w, Math.abs(s1) * 2 * w);
      mvJ(r, 'hip', Math.sin(this.t * 4.1 - 0.7) * 1.5 * w, 0);
      const kn = (1 + Math.sin(this.t * 8.2)) * 1.6 * w;
      mvJ(r, 'knF', 0, kn);
      mvJ(r, 'knB', 0, kn);
      mvJ(r, 'haF', 0, 6 * w);
      mvJ(r, 'haB', 0, 6 * w);
    }
    return r;
  }

  /** Between rounds: fighters sit on their stools in the corners. */
  restInCorners(): void {
    // anything still waiting plays out now (it's behind the corner cutaway)
    for (const l of this.held.splice(0)) this.apply(l);
    this.flushPend(-1);
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
    this.press = 0;
    this.pressRun = 0;
    this.refAct = null;
    this.refNext = null;
    this.refOver = -1;
    this.refRun = false;
    this.clearPieces();
    this.F.forEach((f, i) => {
      this.calm(f);
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

  /** The mouthpieces go back in (the corner rinsed them). */
  private clearPieces(): void {
    this.piece = [null, null];
    this.L[0].noGuard = false;
    this.L[1].noGuard = false;
  }

  /** Something that walks behind the fighters (the ring card girl), drawn into the arena's far side. */
  addBackdrop(c: Container): void {
    const i = this.worldInner.getChildIndex(this.fighters);
    this.worldInner.addChildAt(c, i);
  }

  /** New round: both fighters get off their stools and walk out to meet in the middle. */
  walkOut(firstRound = false): void {
    this.flushPend(-1);
    this.resting = false;
    this.roundOver = false;
    this.prefight = false;
    // round one: they meet in the middle and touch gloves first
    this.touchT = firstRound ? 2.4 : 0;
    this.ground = 'stand';
    this.subAnim = null;
    this.tdT = 0;
    this.center = AW / 2;
    this.press = 0;
    this.pressRun = 0;
    this.walkIn = true;
    this.walkT = 0;
    this.refAct = null;
    this.refNext = null;
    this.refOver = -1;
    this.refRun = false;
    this.clearPieces();
    this.F.forEach((f) => {
      this.calm(f);
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
    const aIdx: 0 | 1 = this.ground === 'btop' ? 1 : 0;
    if (this.trans) {
      if (this.trans.kind === 'pass') return { aIdx, a: 'passTop', d: 'passBot', front: 'a' };
      return { aIdx: this.trans.atk, a: 'scrA', d: 'scrB', front: 'a' };
    }
    const spot = SPOTS[this.groundPos];
    return { aIdx, a: this.gnpT > 0 ? spot.punch : spot.a, d: spot.d, front: spot.front };
  }

  private isTop(i: 0 | 1): boolean {
    return (this.ground === 'atop' && i === 0) || (this.ground === 'btop' && i === 1);
  }

  /**
   * A callout slammed onto the screen. prio: 5 KO, 4 KD, 3 COUNTER/ROCKED, 2 PARRY/CAUGHT/STUFFED,
   * 1 everything else; a lower one waits its turn while a higher one still has more than 0.6 s to go.
   */
  /** A long callout is up (it reaches the corners of the screen, where the Bleeter feed sits). */
  calloutWide(): boolean {
    return this.calloutT > 0 && this.calloutW > 150;
  }
  private calloutW = 0;
  /** the HUD names' widths, for the plates behind them */
  private nameW = [0, 0];

  showCallout(s: string, color: number = PAL.gold, prio = 1): void {
    if (prio < this.calloutPrio && this.calloutT > 0.6) return;
    this.callout.setText(s);
    this.calloutW = measure(s) * 2;
    if (color !== this.calloutColor) {
      this.calloutColor = color;
      this.callout.setColor(color);
    }
    this.calloutT = 1.3;
    this.calloutAge = 0;
    this.calloutPrio = prio;
    if (prio >= 4 && this.sigNext) this.sigNext.seen = true;
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

  private updateCam(dt: number, real: number): void {
    if (this.mode !== 'tv') {
      // side view: a punch-in on the man going down (a knockdown, a finish, the slow-mo)
      const want = this.scene === 'fight' && !this.reduceMotion && (this.slowT > 0 || this.kickT > 0) ? 1 : 0;
      this.zoomKick += (want - this.zoomKick) * Math.min(1, real * 6);
      if (this.zoomKick < 0.002) this.zoomKick = 0;
      const zk = this.zoomKick;
      const ground = this.ground === 'atop' || this.ground === 'btop';
      // the punch-in follows him smoothly (it starts right on him)
      const tx = this.F[this.zoomOn].x;
      this.zoomX = zk ? this.zoomX + (tx - this.zoomX) * Math.min(1, real * 8) : tx;
      const fx = this.zoomX;
      const fy = ground || onCanvas(this.F[this.zoomOn].pose) ? FLOOR - 26 : FLOOR - 56;
      if (this.mode === 'side') this.applyCam(AW / 2 + (fx - AW / 2) * zk, AH / 2 + (fy - AH / 2) * zk, 1 + 0.22 * zk, true);
      else this.applyCam(AW / 2, AH / 2, 1, true);
      return;
    }
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
    if (this.hitStop > 0) {
      this.hitStop -= real;
      dt *= 0.08;
    }
    this.frameN++;
    // watched strikes land when they get there
    if (this.pend.length) {
      const due: Pend[] = [];
      const keep: Pend[] = [];
      for (const p of this.pend) {
        p.t -= dt;
        if (p.t <= 0) due.push(p);
        else keep.push(p);
      }
      if (due.length) {
        this.pend = keep;
        for (const p of due) this.firePend(p);
      }
    }
    if (!this.walkIn) this.touchT -= dt * this.pace;
    this.t += dt;
    // the crowd holds a beat, then settles; the cameras flash on the big moments
    if (this.hypeHold > 0) this.hypeHold -= real;
    else this.hype = Math.max(1, this.hype - real * 0.45);
    if (this.flashT > 0) {
      this.flashT -= real;
      const rows = ROOMS[this.room].rows;
      const n = Math.random() < 0.5 ? 2 : 3;
      for (let k = 0; k < n && this.flashes.length < MAX_FLASHES; k++) {
        const r = rows - 1 - Math.floor(Math.random() * Math.min(2, rows));
        this.flashes.push({ x: Math.round(this.actionX + (Math.random() * 2 - 1) * 120), y: 22 + r * 7 + (rows === 2 ? 14 : 0) - 1, life: 0.08 });
      }
    }
    if (this.flashes.length) {
      for (const p of this.flashes) p.life -= real;
      this.flashes = this.flashes.filter((p) => p.life > 0);
    }
    // watched fights: the clock runs on to the next line
    if (this.clockRamp) {
      const c = this.clockRamp;
      c.t += real;
      this.sec = Math.max(this.sec, c.from + (c.to - c.from) * Math.min(1, c.t / c.dur));
      if (c.t >= c.dur) this.clockRamp = null;
    }
    this.kickT -= real;
    this.drawCrowd();
    this.tickAds(dt);
    const ground = this.ground === 'atop' || this.ground === 'btop';
    if (this.scene === 'fight') {
      // the man landing walks the other one back to his fence (the pair wanders less while he does);
      // clinches end up on the fence; ground work stays put; a finish stays where it happened
      const fence = this.clinchTie.fence;
      const targetCenter =
        this.manual && !ground ? (this.manual[0] + this.manual[1]) / 2
          : this.finished ? this.center
            : this.walkIn || this.touchT > 0 ? AW / 2
              : this.ground === 'clinch' ? (fence === 0 ? CAGE_L + 40 : fence === 1 ? CAGE_R - 40 : Math.sin(this.round * 1.7) > 0 ? CAGE_R - 40 : CAGE_L + 40)
                : ground ? this.groundX
                  : Math.max(CAGE_L + 50, Math.min(CAGE_R - 50, AW / 2 + Math.max(-1, Math.min(1, this.press)) * 150 + Math.sin(this.t * 0.35) * 25 * (1 - Math.min(1, Math.abs(this.press)) * 0.6)));
      this.center += (targetCenter - this.center) * Math.min(1, dt * (ground ? 4 : 1.5));
    } else this.center += (AW / 2 - this.center) * Math.min(1, dt * 2);
    this.drift = this.center - AW / 2;
    this.press *= Math.exp(-dt * 0.07);
    this.breakT -= dt;
    this.tieHold -= dt;
    const gap = this.ground === 'clinch' ? 12 : ground ? 0 : 23 + Math.sin(this.t * 1.3) * 3 + Math.max(0, this.breakT) * 14;
    this.gnpT -= dt;
    this.tdT -= dt;
    if (this.trans && (this.trans.t -= dt) <= 0) this.trans = null;
    // watching a sim fight: the clinch is a grip fight, ties change hands now and then (unless the sim said which)
    if (!this.manual && this.ground === 'clinch' && this.tieHold <= 0 && Math.random() < dt * 0.35) {
      const r = Math.random();
      this.clinchTie = { dom: r < 0.25 ? -1 : r < 0.62 ? 0 : 1, tie: Math.random() < 0.4 ? 'plum' : Math.random() < 0.5 ? 'under' : 'collar', fence: this.clinchTie.fence };
    }
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
    const upright = this.ground === 'stand' || this.ground === 'clinch';
    for (const i of [0, 1] as const) {
      const f = this.F[i];
      const o = this.F[1 - i];
      const L = this.L[i];
      const side = i === 0 ? -1 : 1;
      let tx = this.center + side * gap;
      let facing: 1 | -1 = i === 0 ? 1 : -1;
      let maxV = 150;
      this.pinned[i] = false;
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
      if (this.manual && fightOn && !this.roundOver && (this.ground === 'stand' || this.ground === 'clinch')) {
        // hands-on: the engine says where the feet are
        tx = this.manual[i];
        maxV = 400;
      } else if (standing && !this.engage) {
        f.footT = (f.footT ?? 0) - dt;
        if (f.footT <= 0) {
          f.foot = this.footFor(L.stance);
          f.footT = 0.5 + Math.random() * 1.2;
        }
        tx += side * (f.foot ?? 0);
        if (f.poseT <= 0 && f.pose === 'guard' && Math.random() < dt * 0.55 * (L.tempo ?? 1)) {
          // a feint (his style of feint), a slip, a roll or a pull, or the hands come up
          const fk = Math.random();
          if (fk < 0.45) {
            const fp = feintFor(L.stance, Math.random());
            this.setPose(i, fp, FEINT_DUR[fp] ?? 0.2);
            f.lunge = fp === 'paw' ? 3 : 1;
          } else if (fk < 0.75) {
            const s2 = Math.random();
            this.setPose(i, s2 < 0.5 ? 'slip' : s2 < 0.75 ? 'roll' : 'pull', 0.26);
          } else this.setPose(i, 'block', 0.22);
        }
        // the longer man keeps pawing out his range
        const longer = i === 0 ? this.A.reach >= this.B.reach : this.B.reach > this.A.reach;
        if (longer && f.pose === 'guard' && f.poseT <= 0 && o.pose === 'guard' && o.poseT <= 0 && Math.abs(o.x - f.x) <= 70) {
          f.pawT -= dt;
          if (f.pawT <= 0) {
            this.setPose(i, 'paw', 0.18);
            f.lunge = 2;
            f.pawT = 1.2 + Math.random() * 1.3;
          }
        }
        // walked back onto his own fence: the cage-back guard, and every few seconds he circles off it
        this.pinned[i] = Math.abs(f.x - (i === 0 ? CAGE_L : CAGE_R)) < 30;
        if (this.pinned[i]) {
          f.pivT -= dt;
          if (f.pivT <= 0) {
            f.pivT = 2 + Math.random() * 2;
            f.v = -side * 120;
            this.press *= 0.6;
            if (f.poseT <= 0) this.setPose(i, 'slip', 0.25);
          }
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
      if (this.scene === 'fight' && this.finished && this.winnerSide === i && onCanvas(o.pose) && !ground) {
        // walk off and celebrate away from the man on the canvas
        tx = o.x + (f.x < o.x ? -1 : 1) * 56;
        maxV = 90;
      } else if (this.scene === 'fight' && !this.manual && !ground && this.refOver === 1 - i && onCanvas(o.pose) && !onCanvas(f.pose)) {
        // the referee's over the man he dropped: he backs off and gives them room
        const away = f.x < o.x ? -1 : 1;
        if (away * (tx - o.x) < 56) tx = Math.max(CAGE_L + 20, Math.min(CAGE_R - 20, o.x + away * 56));
        maxV = 90;
      }
      // a man on the canvas stays where he fell
      if (this.scene === 'fight' && !ground && (onCanvas(f.pose) || f.fallT >= 0)) tx = f.x;
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
      // rubbery legs: a rocked man (or one the engine has stunned) wobbles, and stumbles now and then
      f.wobble = Math.max(0, f.wobble - dt);
      if (this.stun[i] > 0.35) f.wobble = Math.max(f.wobble, this.stun[i] * 2);
      if (!this.manual && standing && f.wobble > 0.5) {
        f.wobT -= dt;
        if (f.wobT <= 0) {
          f.wobT = 0.7;
          f.v = (f.v ?? 0) + (Math.random() < 0.5 ? -35 : 35);
        }
      }
      // hands-on: the engine's clock drives the strike (it can't run out while he's throwing it)
      let du = -1;
      if (f.drv) {
        du = driveU(f.drv.t, f.drv.wind, f.drv.rec);
        // (still 0.05 s left after this frame's tick, however long the frame)
        f.poseT = Math.max(f.poseT, 0.05 + dt);
        f.drvU = du;
      } else if (f.drvU >= 0) {
        // the engine's done with it: finish on our own clock from where it got to
        if (f.poseDur && STRIKE_POSES.has(f.pose)) f.poseT = Math.min(f.poseT, f.poseDur * (1 - f.drvU));
        f.drvU = -1;
      }
      if (f.poseT > 0) {
        f.poseT -= dt;
        if (f.poseT <= 0) {
          const nx = f.queue.length ? f.queue.shift() : undefined;
          if (nx) {
            // the next shot of the combination
            this.setPose(i, nx.pose, nx.dur, true);
            f.lunge = Math.max(f.lunge, nx.lunge);
            if (nx.hit !== '') this.pendHit(i, nx.joint, nx.big, false, nx.hit, nx.dur * 0.4, '', 0);
          } else if ((f.pose === 'down' || f.pose === 'kneel') && this.scene === 'fight') this.setPose(i, 'techUp', 0.35); // up off the canvas
          else if (!KO_POSES.has(f.pose)) f.pose = this.scene === 'ceremony' ? 'stand' : 'guard';
        }
      }
      let pose = f.pose;
      if (this.scene === 'fight') {
        if (ground && !KO_POSES.has(pose) && pose !== 'celebrate') pose = i === lay.aIdx ? lay.a : lay.d;
        if (this.ground === 'clinch' && (pose === 'guard' || pose === 'clinch')) pose = this.clinchPose(i);
        if (this.ground === 'clinch' && pose === 'knee' && this.clinchTie.dom === i && this.clinchTie.tie === 'plum') pose = 'plumKnee';
        if (this.tdT > 0.3 && ground && !KO_POSES.has(pose)) {
          const ph = 1 - this.tdT / 0.95;
          if (this.tdKind === 'trip') pose = i === this.tdAtk ? (ph < 0.5 ? 'trip' : 'sprawl') : ph < 0.45 ? 'falling' : 'down';
          else pose = i === this.tdAtk ? (ph < 0.45 ? 'shoot' : 'sprawl') : ph < 0.4 ? 'lifted' : 'down';
        }
        if (this.winnerSide === i && this.finished && f.poseT <= 0) pose = 'celebrate';
      }
      // walking (not fighting): turn and walk where you're going
      const walking = Math.abs(tx - f.x) > 3 && (this.scene !== 'fight' || this.roundOver) && !onCanvas(pose);
      if (walking) facing = tx > f.x ? 1 : -1;
      if (facing !== f.facing) {
        // turning round: mirror the current joints so the body doesn't jump, then tween from there
        f.rig = mirrorRig(f.rig);
        f.facing = facing;
      }
      this.drawPose[i] = walking ? 'walk' : pose;
      // his own taunt (the bird gets a finger)
      L.bird = pose === 'taunt' && L.taunt === 'flipoff' && !walking;
      const fight = this.scene === 'fight';
      const strike = fight && upright && !walking && f.poseT > 0 && !!f.poseDur && STRIKE_POSES.has(pose);
      const guardUp = fight && upright && !walking && f.poseT > 0 && !!f.poseDur && DEFENCE_POSES.has(pose);
      f.bounce += ((strike ? 0 : 1) - f.bounce) * (1 - Math.exp(-(strike ? 60 : 12) * dt));
      // taken down (or back up) before he'd finished falling: the fall's over, the pose takes it from here
      if (f.fallT >= 0 && (!upright || !onCanvas(f.pose))) {
        f.fallT = -1;
        f.landed = true;
      }
      if (f.slide) {
        f.slide -= f.slide * Math.min(1, real * 4);
        if (Math.abs(f.slide) < 0.05) f.slide = 0;
      }
      if (f.fallT >= 0) this.tickFall(i, f, dt);
      else if (strike || guardUp) {
        // thrown (or ducked) over his own stance: a crouched man stays crouched on a jab
        const u = strike && du >= 0 ? du : 1 - f.poseT / (f.poseDur ?? 1);
        const base = this.ground === 'clinch' ? POSES[this.clinchPose(i)] : stanceGuard(L, this.t + i * 1.3);
        const to = POSES[pose];
        const from = pose === 'plumKnee' ? POSES.plum : GUARD;
        const kick = KICK_POSES.has(pose);
        const lead = pose === 'knee' || pose === 'plumKnee' || pose === 'flyknee' ? KNEE_LEAD : kick ? KICK_LEAD : PUNCH_LEAD;
        const hw = guardUp ? holdW(u) : 0;
        const target = {} as Rig;
        for (const j of JOINTS) {
          // punches keep both feet planted; kicks chamber the knee first
          const w = guardUp ? hw : !kick && (j === 'ftF' || j === 'ftB') ? 0 : strikeW(u + lead[j]);
          target[j] = [base[j][0] + (to[j][0] - from[j][0]) * w, base[j][1] + (to[j][1] - from[j][1]) * w];
        }
        // eased in from wherever he was, then right on the curve: the contact frame is the full-extension frame
        f.rig = u >= 0.15 && strike ? target : lerpRig(f.rig, target, 1 - Math.exp(-45 * dt));
      } else if ((pose === 'down' || pose === 'kneel') && this.getupProg[i] > 0) {
        // mashing up off the canvas: the body comes up with it
        f.rig = lerpRig(f.rig, lerpRig(POSES[pose], POSES.techUp, Math.min(1, this.getupProg[i] * 1.1)), 1 - Math.exp(-13.4 * dt));
      } else {
        let target = walking ? (Math.floor(this.t * 6) % 2 ? POSES.walk1 : POSES.walk2) : pose === 'guard' ? stanceGuard(L, this.t + i * 1.3) : pose === 'taunt' ? tauntRig(L, this.t) : POSES[pose as Pose] ?? POSES.guard;
        if (pose === 'guard' && this.pinned[i]) target = lerpRig(target, POSES.cageBack, 0.35);
        // a pose snaps in (quick to arrive) and comes back at the old pace; a reaction follows the jolt instead of beating it
        const fresh = f.poseT > 0 && f.poseDur !== undefined && f.poseT > f.poseDur - 0.12 && !REACT_POSES.has(pose);
        const rate = ground && fight ? (this.tdT > 0 ? 9.7 : this.gnpT > 0 ? 30 : 5.8) : f.poseT > 0 ? (fresh ? 50 : 32) : 13.4;
        f.rig = lerpRig(f.rig, pose === 'celebrate' && this.finished && !walking ? this.celebration(i, target) : target, 1 - Math.exp(-rate * dt));
      }
      // the jolt of a shot springs back (head quick, torso slower), in small steps so every frame rate sees the same whip
      if (f.hv[0] || f.hv[1] || f.tv[0] || f.tv[1] || f.hd[0] || f.hd[1] || f.td[0] || f.td[1]) {
        const steps = Math.min(4, Math.ceil(Math.min(dt, 1 / 30) * 120));
        const h = Math.min(dt, 1 / 30) / steps;
        for (let k = 0; k < steps; k++) {
          f.hv[0] += (-280 * f.hd[0] - 17 * f.hv[0]) * h;
          f.hv[1] += (-280 * f.hd[1] - 17 * f.hv[1]) * h;
          f.hd[0] += f.hv[0] * h;
          f.hd[1] += f.hv[1] * h;
          f.tv[0] += (-160 * f.td[0] - 13 * f.tv[0]) * h;
          f.tv[1] += (-160 * f.td[1] - 13 * f.tv[1]) * h;
          f.td[0] += f.tv[0] * h;
          f.td[1] += f.tv[1] * h;
        }
        // settled: stop
        if (Math.abs(f.hd[0]) + Math.abs(f.hd[1]) + Math.abs(f.td[0]) + Math.abs(f.td[1]) < 0.01 && Math.abs(f.hv[0]) + Math.abs(f.hv[1]) + Math.abs(f.tv[0]) + Math.abs(f.tv[1]) < 0.05) {
          f.hd = [0, 0];
          f.hv = [0, 0];
          f.td = [0, 0];
          f.tv = [0, 0];
        }
      }
      f.snap = Math.abs(f.hd[0]) / 6;
      // long hair swings with movement and with shots to the head
      L.sway = Math.max(-4, Math.min(4, ((f.v ?? 0) * f.facing) / 30 + (f.snap ?? 0) * 4 + Math.sin(this.t * 3 + i) * 0.5));
      // the fight wears on him: sweat with the rounds, the face and body with the damage, the hands down when he's gassed
      if (fight) {
        const hurt = 1 - Math.max(0, Math.min(100, this.hp[i])) / 100;
        L.sweat = Math.min(1, 0.1 + (this.round - 1) * 0.28 + hurt * 0.35);
        const cut = this.vitals[i].cut;
        L.wear = { cuts: cut, swell: hurt, blood: cut > 0 ? Math.min(1, 0.3 + cut * 0.22) : 0, body: hurt * 0.8 };
        L.gassed = Math.max(Math.max(0, Math.min(1, (45 - this.vitals[i].gas) / 35)), this.round >= 3 ? Math.min(0.5, (this.round - 2) * 0.2 + hurt * 0.3) : 0);
        // a cut drips onto the canvas
        if (cut > 0 && !this.resting && this.upright(f)) {
          f.dripT -= dt;
          if (f.dripT <= 0) {
            f.dripT = Math.max(0.6, 2.4 - cut * 0.3);
            const s = this.sz[i];
            if (this.parts.length < MAX_PARTS) this.parts.push({ x: f.x + (f.rig.head[0] + 4) * f.facing * s, y: FLOOR + (f.rig.head[1] - 3) * s, vx: f.v ?? 0, vy: 10, life: 1.2, life0: 1.2, c: 0xa01818, s: 1, grav: 220 });
          }
        }
      }
      f.drv = null;
    }
    if (this.walkIn && this.walkT > 0.3 && this.F.every((f, i) => Math.abs(f.x - (this.center + (i === 0 ? -1 : 1) * (this.touchT > 0 ? TOUCH_GAP : gap))) < 5 && Math.abs(f.v ?? 0) < 25)) this.walkIn = false;
    if (this.walkIn && this.walkT > 6) this.walkIn = false;
    this.pumpHeld(dt);
    // referee & announcer
    for (const a of [this.ref, this.butler]) {
      if (!a.visible) continue;
      const reffing = a === this.ref && this.scene === 'fight';
      if (reffing) {
        this.refHold -= dt;
        const ra = this.refAct;
        if (this.refOver >= 0) {
          // over a man on the canvas: covering him, pointing at him, counting over him
          const o = this.F[this.refOver as 0 | 1];
          const close = ra !== null && (ra.a === 'refCover' || ra.a === 'refWave1' || this.refNext !== null) ? 10 : 30;
          // from behind him; with his back on the fence there's no room there, so from the open side
          const behind = o.x - o.facing * close;
          const spot = behind < CAGE_L + 14 || behind > CAGE_R - 14 ? o.x + o.facing * close : behind;
          a.tx = Math.max(CAGE_L + 14, Math.min(CAGE_R - 14, spot));
          if (Math.abs(a.tx - a.x) < 8) a.facing = o.x >= a.x ? 1 : -1;
          else a.facing = a.tx > a.x ? 1 : -1;
        } else if (ra) {
          // a job between them (breaking them up, stopping a choke): he gets in there, wherever they've gone
          a.tx = Math.max(CAGE_L + 14, Math.min(CAGE_R - 14, (this.F[0].x + this.F[1].x) / 2));
          a.facing = a.tx >= a.x ? 1 : -1;
        } else {
          // the ref circles the action at a distance, keeping a sightline (in close on the ground work);
          // now and then he crosses to the other side (behind the fighters)
          const job = this.refHold > 0 || this.touchT > 0 || this.finished || this.resting || this.roundOver || this.prefight;
          const off = a.tx - this.center;
          const near = ground ? 40 : 72;
          const span = ground ? 10 : 20;
          if (!job && (Math.abs(off) > near + span + 12 || Math.abs(off) < near - 10 || Math.random() < dt * 0.05)) {
            const keep = Math.abs(off) >= near - 10 && Math.random() < 0.6;
            a.tx = this.center + (keep ? Math.sign(off) : Math.sign(off) ? -Math.sign(off) : 1) * (near + Math.random() * span);
            a.tx = Math.max(CAGE_L + 14, Math.min(CAGE_R - 14, a.tx));
          }
          if (!this.resting) a.facing = a.x < this.center ? 1 : -1;
        }
      }
      const moving = Math.abs(a.tx - a.x) > 2;
      const run = reffing && this.refRun;
      a.x += (a.tx - a.x) * Math.min(1, dt * (run ? 9 : 4));
      if (a.spin > 0) {
        a.spin -= dt;
        if (Math.floor(a.spin * 20) % 2 === 0) a.facing = (a.facing * -1) as 1 | -1;
      }
      let tgt: Rig;
      const act = reffing ? this.refAct : null;
      const there = act !== null && Math.abs(a.tx - a.x) < 8;
      if (act) {
        // the job runs once he's there (and the next one when this one's done); on his way it counts down
        // slowly, so a job he can't get to never holds him forever
        act.t -= there ? dt : dt * 0.25;
        if (act.t <= 0) {
          this.refAct = this.refNext;
          this.refNext = null;
          if (!this.refAct) {
            this.refOver = -1;
            this.refRun = false;
          }
        }
      }
      if (act && there) tgt = act.b !== '' && Math.floor(this.t * act.hz) % 2 ? POSES[act.b as Pose] : POSES[act.a];
      else if (moving) tgt = Math.floor(this.t * (run ? 12 : 7)) % 2 ? POSES.walk1 : POSES.walk2;
      else tgt = reffing && ground && !this.finished ? POSES.refWatch : POSES[a.pose];
      a.rig = lerpRig(a.rig, tgt, 1 - Math.exp(-10.9 * dt));
    }
    this.updateCam(dt, real);
    // the shake moves the whole picture: the way the blow went for two frames, then a rattle that dies away
    if (this.shakeT > this.shakePrev + 0.0001) {
      // started from outside (hands-on sets shakeT): no direction
      this.shakeDur = this.shakeT;
      this.shakeN = 0;
      this.shakeDir = 0;
      this.shakeY = false;
    }
    let sx = 0;
    let sy = 0;
    let margin = 0;
    if (this.shakeT > 0 && this.shakeDur > 0) {
      const amp = this.shakeAmp * Math.pow(Math.min(1, this.shakeT / this.shakeDur), 2) * (this.reduceMotion ? 0.25 : 1);
      sx = this.shakeN < 2 && this.shakeDir ? this.shakeDir * amp : (Math.random() * 2 - 1) * amp;
      if (this.shakeY) sy = (Math.random() * 2 - 1) * Math.min(2, amp);
      this.shakeN++;
      this.shakeT -= dt;
      margin = (2 * this.shakeAmp * (this.reduceMotion ? 0.25 : 1)) / AW;
    }
    this.shakePrev = this.shakeT;
    if (margin) {
      // zoomed in a hair so the edge of the picture never shows
      const c = this.cam;
      this.applyCam(c.x, c.y, Math.max(c.z, 1 + margin), true);
      this.world.position.set(this.world.position.x + Math.round(sx), this.world.position.y + Math.round(sy));
    }
    this.topWorld.scale.set(1 + margin);
    this.topWorld.position.set(Math.round(sx - (AW / 2) * margin), Math.round(sy - (AH / 2) * margin));
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
    this.drawHud(dt, real);
  }

  /** A man going down: the legs go, he topples from the ankles (or folds, or sits down), hits the canvas, bounces once and lies still. */
  private tickFall(i: 0 | 1, f: FState, dt: number): void {
    f.fallT += dt;
    const t = f.fallT;
    const from = f.fallFrom;
    const end = POSES[f.fallPose];
    const kind = f.fallKind;
    // the buckle: knees and hips drop, the arms go limp (or lock up: the fencing response, going over backwards)
    const buckle: Rig = { ...from };
    mvJ(buckle, 'knF', 0, 8);
    mvJ(buckle, 'knB', 0, 8);
    mvJ(buckle, 'hip', 0, 6);
    if (kind === 'back') {
      buckle.elF = POSES.koStiff.elF;
      buckle.haF = POSES.koStiff.haF;
      buckle.elB = POSES.koStiff.elB;
      buckle.haB = POSES.koStiff.haB;
    } else {
      mvJ(buckle, 'elF', 0, 9);
      mvJ(buckle, 'elB', 0, 9);
      mvJ(buckle, 'haF', 0, 18);
      mvJ(buckle, 'haB', 0, 18);
    }
    const topple = kind === 'back' || kind === 'face';
    const tLand = topple ? 0.12 + Math.sqrt(1.3 / 14) : kind === 'fold' ? 0.5 : 0.42;
    let target: Rig;
    if (t < 0.12) target = buckle;
    else if (t < tLand) {
      if (topple) target = this.toppled(buckle, from, kind, 14 * (t - 0.12) * (t - 0.12));
      else if (kind === 'fold') {
        const k = (t - 0.12) / 0.18;
        target = t < 0.3 ? lerpRig(buckle, POSES.kneel, k * k) : lerpRig(POSES.kneel, end, (t - 0.3) / 0.2);
      } else target = lerpRig(buckle, end, smooth((t - 0.12) / 0.3));
    } else {
      if (!f.landed) {
        f.landed = true;
        if (topple) {
          // the body stays where it hit the canvas (the legs fold up after it): he is where he landed now
          const lay = this.toppled(buckle, from, kind, 1.3);
          const dx = lay.hip[0] - end.hip[0];
          const shift = dx * f.facing * this.sz[i];
          f.x += shift;
          f.slide -= shift;
          const r = {} as Rig;
          for (const j of JOINTS) r[j] = [f.rig[j][0] - dx, f.rig[j][1]];
          f.rig = r;
        }
        // dust off the canvas, a thud through the picture
        const s = this.sz[i];
        this.burst(f.x + end.head[0] * f.facing * s, FLOOR - 1, 8, 0xd8d0c0, 40, 0.4, 2, 60);
        this.burst(f.x + end.hip[0] * f.facing * s, FLOOR - 1, 8, 0xd8d0c0, 40, 0.4, 2, 60);
        this.shake(0.15, 4, 0, true, true);
        this.snd('thud');
      }
      const k = (t - tLand) / 0.14;
      if (k >= 1) {
        f.fallT = -1;
        f.rig = { ...end };
        return;
      }
      // one bounce off the canvas
      const up = 3 * Math.sin(Math.PI * k);
      target = {} as Rig;
      for (const j of JOINTS) target[j] = j === 'ftF' || j === 'ftB' ? end[j] : [end[j][0], end[j][1] - up];
    }
    // the body follows the fall, the arms flop after it
    const kb = 1 - Math.exp(-45 * dt);
    const ka = 1 - Math.exp(-10 * dt);
    const r = {} as Rig;
    for (const j of JOINTS) {
      const c = ARMS.has(j) ? ka : kb;
      r[j] = [f.rig[j][0] + (target[j][0] - f.rig[j][0]) * c, f.rig[j][1] + (target[j][1] - f.rig[j][1]) * c];
    }
    f.rig = r;
  }

  /** The buckled body turned over the feet by theta (on his back or on his face): the feet stay put, nothing goes through the canvas. */
  private toppled(buckle: Rig, from: Rig, kind: string, theta: number): Rig {
    const r = rotateRig(buckle, (kind === 'back' ? -1 : 1) * theta, (from.ftF[0] + from.ftB[0]) / 2, 0);
    r.ftF = from.ftF;
    r.ftB = from.ftB;
    for (const j of JOINTS) if (r[j][1] > 0) r[j] = [r[j][0], 0];
    return r;
  }

  /** Where he likes to stand (+ = out, giving ground; - = in): pressure fighters walk you down, movers keep their distance. */
  private footFor(stance: string): number {
    const r = Math.random();
    if (stance === 'brawler' || stance === 'wrestler') return r < 0.5 ? -(5 + Math.random() * 3) : r < 0.75 ? 9 + Math.random() * 8 : 0;
    if (stance === 'sway' || stance === 'upright' || stance === 'karate') return r < 0.45 ? 9 + Math.random() * 6 : r < 0.65 ? -6 : r < 0.85 ? 3 : 0;
    return r < 0.3 ? 9 + Math.random() * 8 : r < 0.55 ? -6 : r < 0.75 ? 3 : 0;
  }

  /** Drawing order on the feet: the man on the canvas first, the man throwing last (his punch passes in front of the face). */
  private drawRank(i: 0 | 1): number {
    const f = this.F[i];
    if (onCanvas(this.drawPose[i]) || f.fallT >= 0) return -1;
    if (f.poseT > 0 && STRIKE_POSES.has(f.pose)) return 2;
    return f.poseT > 0 ? 1 : 0;
  }

  private drawSide(dt: number, ground: boolean): void {
    const g = this.fighters;
    g.clear();
    // the ref dives over the man on the canvas: drawn in front of him then
    const ra = this.refAct;
    const cover = this.scene === 'fight' && this.refOver >= 0 && ra !== null && ra.a === 'refCover' && Math.abs(this.ref.tx - this.ref.x) < 8;
    // ref & announcer stand behind the fighters
    for (const a of [this.ref, this.butler]) {
      if (!a.visible || (a === this.ref && cover)) continue;
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
    // hands-on: the range, on the canvas under the fighters (gold: hook range, green: jab range)
    const rg = this.rangeGuide;
    if (rg && this.scene === 'fight' && this.ground === 'stand' && !this.resting) {
      const me = this.F[rg.side];
      const op = this.F[1 - rg.side];
      const d = Math.abs(op.x - me.x);
      const col = d <= 44 ? PAL.gold : d <= 56 ? PAL.moss : PAL.grey;
      const ax = Math.round(me.x + me.rig.ftF[0] * me.facing * this.sz[rg.side]);
      const bx = Math.round(op.x + op.rig.ftF[0] * op.facing * this.sz[1 - rg.side]);
      g.rect(bx, FLOOR - 1, 1, 3).fill({ color: col, alpha: 0.4 });
      g.rect(Math.min(ax, bx), FLOOR + 1, Math.max(1, Math.abs(bx - ax)), 1).fill({ color: col, alpha: 0.4 });
    }
    // the man throwing is drawn over the man he's hitting (the finishing punch passes in front of the face); the man on the canvas goes first
    const lay = this.groundLayout();
    const last = lay.front === 'a' ? lay.aIdx : ((1 - lay.aIdx) as 0 | 1);
    const order: (0 | 1)[] = ground ? (last === 0 ? [1, 0] : [0, 1]) : this.drawRank(0) > this.drawRank(1) ? [1, 0] : [0, 1];
    for (const i of order) {
      const f = this.F[i];
      // the tapping man's free hand slaps the mat
      if (ground && this.subAnim?.tapped && i !== this.subAnim.atk && Math.floor(this.t * 8) % 2 === 0) f.rig = { ...f.rig, haB: [f.rig.haB[0], Math.min(0, f.rig.haB[1] + 4)] };
      this.L[i].faceUp = SUPINE.has(this.drawPose[i]);
      const r = this.stepped(i, f);
      this.drawn[i] = r;
      drawRig(g, r, Math.round(f.x), FLOOR, f.facing, this.L[i], this.sz[i]);
    }
    if (cover) {
      const a = this.ref;
      g.ellipse(a.x, FLOOR + 4, 12, 2.5).fill({ color: 0x000000, alpha: 0.3 });
      drawRig(g, a.rig, Math.round(a.x), FLOOR + 3, a.facing, a.look, 0.95);
    }
    // particles: they fade out, sparks shrink at the end
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
      const sz = s.s > 1 && s.life < s.life0 * 0.3 ? 1 : s.s;
      const a = Math.min(1, s.life * 5);
      if (a >= 1) p.rect(Math.round(s.x), Math.round(s.y), sz, sz).fill(s.c);
      else p.rect(Math.round(s.x), Math.round(s.y), sz, sz).fill({ color: s.c, alpha: a });
    }
    // knocked-out mouthpieces: an arc, one bounce, then they lie there
    for (const i of [0, 1] as const) {
      const pc = this.piece[i];
      if (!pc) continue;
      if (pc.bounces < 2) {
        pc.vy += 300 * dt;
        pc.x = Math.max(CAGE_L + 6, Math.min(CAGE_R - 6, pc.x + pc.vx * dt));
        pc.y += pc.vy * dt;
        if (pc.y >= FLOOR + 3 && pc.vy > 0) {
          pc.y = FLOOR + 3;
          pc.bounces++;
          pc.vy = pc.bounces === 1 ? pc.vy * -0.3 : 0;
          pc.vx = pc.bounces === 1 ? pc.vx * 0.5 : 0;
        }
      }
      p.rect(Math.round(pc.x), Math.round(pc.y), 2, 1).fill(pc.c);
      p.rect(Math.round(pc.x), Math.round(pc.y), 1, 1).fill(0xffffff);
    }
    // hands-on: a counter is on, his gloves glint
    if (this.frameN % 3 === 0) {
      for (const i of [0, 1] as const) {
        if (this.counterGlow[i] <= 0) continue;
        const f = this.F[i];
        const r = this.drawn[i];
        const s = this.sz[i];
        p.rect(Math.round(f.x + r.haF[0] * f.facing * s), Math.round(FLOOR + r.haF[1] * s), 1, 1).fill(0xffffff);
        p.rect(Math.round(f.x + r.haB[0] * f.facing * s), Math.round(FLOOR + r.haB[1] * s), 1, 1).fill(0xffffff);
      }
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
    // the real gap between them (side view feet), so range, footwork and pressure read from above too
    // (a knocked-out man's landing shift eases in: the overhead view doesn't jump when he hits the canvas)
    const real = Math.abs(this.F[1].x + this.F[1].slide - this.F[0].x - this.F[0].slide);
    const d = this.ground === 'clinch' ? 13 : ground ? 4 : Math.max(16, Math.min(64, real * 0.62));
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
    // follow the action along the side view's x (so pushing a man to the fence reads the same), wander in depth
    const mid = (this.F[0].x + this.F[1].x) / 2;
    let tx = TCX + Math.max(-1, Math.min(1, (mid - AW / 2) / 200)) * (TR - 30);
    let ty = TCY + Math.cos(this.t * 0.23) * 22;
    if (this.ground === 'clinch') {
      const fence = this.clinchTie.fence;
      if (fence >= 0) {
        // pinned: the pair goes to that fence, the pinned man's back to the cage
        tx = TCX + (fence === 0 ? -1 : 1) * (TR - 16);
        ty = TCY;
        let da = -c.ang;
        da = Math.atan2(Math.sin(da), Math.cos(da));
        c.ang += da * Math.min(1, dt * 3);
      } else if (this.manual) {
        // hands-on: follow the engine's walk along the fence line
        const m = (this.F[0].x + this.F[1].x) / 2;
        tx = TCX + ((m - AW / 2) / 232) * TR;
        ty = TCY;
      } else {
        const a = Math.sin(this.round * 1.7) * Math.PI;
        tx = TCX + Math.cos(a) * (TR - 16);
        ty = TCY + Math.sin(a) * (TR - 16);
      }
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
      // fading out, sparks shrinking at the end
      const sz = s.s > 1 && s.life < s.life0 * 0.3 ? 1 : s.s;
      const a = Math.min(1, s.life * 5);
      if (a >= 1) g.rect(Math.round(s.x), Math.round(s.y), sz, sz).fill(s.c);
      else g.rect(Math.round(s.x), Math.round(s.y), sz, sz).fill({ color: s.c, alpha: a });
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
    // the same pose the side view is drawing (clinch ties, takedowns, ground frames), not just the last cue
    const pose = this.drawPose[i] === 'walk' ? f.pose : this.drawPose[i];
    const lying = pose === 'down' || KO_POSES.has(pose as Pose) || (this.ground !== 'stand' && this.ground !== 'clinch' && !this.isTop(i)) || pose === 'bottom' || pose === 'bottomSub';
    // shadow
    g.ellipse(x + 2, y + 3, 11, 8).fill({ color: 0, alpha: 0.28 });
    if (lying) {
      // flat on the mat: body stretched back along the facing axis
      const back = pose === 'ko' ? -1 : pose === 'koFace' ? 0.8 : pose === 'koCrumple' ? -0.4 : -0.6;
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
      case 'collar': lead = [15, -2]; rear = [12, 6]; lean = 2; break;
      case 'plum': lead = [15, -2]; rear = [15, 2]; lean = 1; break;
      case 'plumKnee': lead = [15, -2]; rear = [15, 2]; leg = [16, 3]; lean = 1; break;
      case 'underhook': lead = [17, -8]; rear = [17, 8]; lean = 5; break;
      case 'clinchDef': lead = [9, -6]; rear = [9, 6]; lean = -1; break;
      case 'cageBack': lead = [10, -7]; rear = [10, 7]; lean = -3; break;
      case 'bodyJab': lead = [21, -2]; lean = 3; break;
      case 'leadHook': lead = [15, -10]; lean = 1; break;
      case 'bodyHook': lead = [14, -8]; lean = 3; break;
      case 'overhand': rear = [21, 3]; lean = 3; break;
      case 'frontKick': leg = [24, -2]; lean = -2; break;
      case 'spinKick': leg = [-24, 4]; lean = -1; break;
      case 'trip': lead = [14, -6]; rear = [14, 6]; leg = [16, -6]; lean = 4; break;
      case 'falling': lean = -6; lead = [0, -10]; rear = [0, 10]; break;
      case 'techUp': lean = -4; lead = [-6, -9]; rear = [4, 6]; break;
      case 'top': case 'topPunch': case 'gTop': case 'hTop': case 'sTop': case 'mTop': case 'bkTop': case 'passTop': case 'scrA':
      case 'gTopPunch': case 'hTopPunch': case 'sTopPunch': case 'mTopPunch': case 'bkTopPunch':
        lead = /Punch/i.test(pose) ? [16, -1] : [10, -5]; rear = [10, 5]; lean = pose === 'passTop' ? 7 : pose === 'scrA' ? 2 : 4; break;
      case 'hurt': lean = -3; lead = [6, -5]; rear = [6, 5]; break;
      case 'rocked': lean = -4 + Math.sin(this.t * 9) * 2; lead = [3, -7]; rear = [3, 7]; break;
      case 'celebrate': case 'flex': case 'armUp': lead = [0, -10]; rear = [0, 10]; break;
      case 'taunt': lead = [2, -13]; rear = [2, 13]; break;
      // defence and feints from above: the head moves, a glove goes out, a shin comes up
      case 'roll': case 'levelFeint': lean = 2; lead = [7, -6]; rear = [6, 6]; break;
      case 'pull': lean = -4; break;
      case 'parry': lead = [15, -2]; break;
      case 'paw': lead = [18, -3]; break;
      case 'shoulderFeint': lean = 1; lead = [12, -5]; break;
      case 'blockBody': lead = [6, -5]; rear = [6, 5]; break;
      case 'check': leg = [9, -4]; break;
      case 'catchKick': lead = [12, -6]; rear = [12, 2]; break;
      case 'hop': lean = -2; leg = [20, 4]; break;
      case 'koStiff': lean = -4; lead = [0, -10]; break;
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

  private drawHud(dt: number, real: number): void {
    const h = this.hudG;
    h.clear();
    const tv = this.mode === 'tv';
    this.clock.visible = this.scene === 'fight';
    if (this.scene === 'fight') {
      h.rect(3, 2, this.nameW[0] + 6, 10).fill({ color: 0x000000, alpha: 0.75 }).rect(AW - 9 - this.nameW[1], 2, this.nameW[1] + 6, 10).fill({ color: 0x000000, alpha: 0.75 });
      // HP bars: the chunk just lost shows pale, holds a beat and drains away; a real hit flashes the bar white
      for (const i of [0, 1] as const) {
        const hp = Math.max(0, Math.min(100, this.hp[i]));
        const drop = this.hpPrev[i] - hp;
        if (drop > 0.01) {
          if (drop >= 3) this.hpFlash[i] = 2;
          this.hpGhost[i] = Math.max(this.hpGhost[i], this.hpPrev[i]);
          this.hpHitT[i] = 0.4;
        }
        this.hpPrev[i] = hp;
        if (hp >= this.hpGhost[i]) this.hpGhost[i] = hp;
        else if (this.hpHitT[i] > 0) this.hpHitT[i] -= real;
        else this.hpGhost[i] = Math.max(hp, this.hpGhost[i] - 40 * real);
        const w = Math.round((138 * hp) / 100);
        const gw = Math.round((138 * this.hpGhost[i]) / 100);
        const col = this.hpFlash[i] > 0 ? 0xffffff : hp > 40 ? PAL.moss : PAL.blood;
        if (this.hpFlash[i] > 0) this.hpFlash[i]--;
        if (i === 0) h.rect(4, 13, 140, 6).fill(PAL.ink).rect(5, 14, gw, 4).fill(0xe8d8b0).rect(5, 14, w, 4).fill(col);
        else h.rect(AW - 144, 13, 140, 6).fill(PAL.ink).rect(AW - 5 - gw, 14, gw, 4).fill(0xe8d8b0).rect(AW - 5 - w, 14, w, 4).fill(col);
      }
      h.rect(4, 20, 10, 2).fill(this.L[0].glove).rect(AW - 14, 20, 10, 2).fill(this.L[1].glove);
    }
    const replay = this.replay !== null;
    if (this.slowT > 0 || replay) {
      // broadcast slow motion (or the instant replay): letterbox bars and a tag
      h.rect(0, 0, AW, 10).fill({ color: 0x000000, alpha: 0.85 }).rect(0, AH - 10, AW, 10).fill({ color: 0x000000, alpha: 0.85 });
      if (replay) h.rect(4, AH - 9, 66, 8).fill(0xa01818);
      else h.rect(AW - 60, AH - 9, 54, 8).fill(0xa01818);
    }
    this.slowTag.visible = this.slowT > 0 && !replay;
    this.replayTag.visible = replay;
    this.replayBug.visible = replay;
    if (replay && this.replayShown !== this.replay) {
      this.replayShown = this.replay;
      this.replayBug.setText((this.replay ?? '').toUpperCase());
    }
    if (this.flash > 0) {
      // a flash is a flash: it fades in real time, even in slow motion
      h.rect(0, 0, AW, AH).fill({ color: 0xffffff, alpha: Math.min(0.5, this.flash) });
      this.flash -= real;
    }
    const left = Math.max(0, 300 - this.sec);
    this.clock.setText(`R${this.round}/${this.rounds}  ${Math.floor(left / 60)}:${String(Math.floor(left % 60)).padStart(2, '0')}`);
    if (this.sigNext) {
      // the finish's signature call: once the big one has had its moment (or if it never comes)
      const n = this.sigNext;
      n.t -= real;
      if ((n.seen && this.calloutT < 0.4) || n.t <= 0) {
        this.sigNext = null;
        this.showCallout(n.s, PAL.gold, n.prio);
      }
    }
    if (this.calloutT > 0) {
      // the callout slams in big and settles; a knockdown or a knockout shudders as it lands
      this.calloutT -= dt;
      this.calloutAge += real;
      this.callout.alpha = Math.min(1, this.calloutT * 2);
      const k = (2 + Math.max(0, 0.6 - this.calloutAge * 5)) / 2;
      const jit = this.calloutPrio >= 4 && this.calloutAge < 0.15 && !this.reduceMotion ? (this.frameN % 2 ? 1 : -1) : 0;
      this.callout.scale.set(k);
      this.callout.position.set(Math.round((AW / 2) * (1 - k)) + jit, Math.round(46 - 8 * (k - 1)) + jit);
    } else {
      this.callout.alpha = 0;
      this.calloutPrio = 0;
    }
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
