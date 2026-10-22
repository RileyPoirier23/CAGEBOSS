/**
 * Hands-on fight (Fighter Mode): you control your fighter in real time, the opponent is
 * LiveAI. A full-screen overlay on top of the fight night card so the card scene keeps
 * its state. Arena on top, HUD below: heart rate (BPM), a body-damage outline, gas, where
 * the fight is (clinch tie, ground position) and a play-by-play line. No button charts on
 * screen (HELP in the pause menu has the full move list), but the HUD says what matters this
 * second: a counter window you've earned (or given away), a shot that fell SHORT, your gas
 * running out, the sprawl when he shoots, what GRAB and KICK will do in the clinch and on the
 * mat. Between rounds your cutman works the face (the same corner mini game as the sim fights).
 *
 * The engine drives the animation: strikes are timed by the engine's wind-up, hits get a
 * hit-stop scaled to the damage (the engine pauses with the picture), callouts are coloured
 * (green = you did it, orange = done to you) and the biggest one of a frame wins.
 *
 * Esc / MENU pauses: resume, help, autopilot (the AI fights for you), turn hands-on fights off.
 */
import { Container, Graphics, type Ticker } from 'pixi.js';
import { hint, padName } from './hints';
import type { Game } from './app';
import type { Bout, CornerReport, Fighter, FightEvent, FightResult, GameState, Skills, TickerLine } from '../core/types';
import { content } from '../core/content';
import { Rng } from '../core/rng';
import { TaleOfTape } from './taleoftape';
import { BleetFeed } from './bleetfeed';
import { bleetSituation, makeBleet } from '../sim/bleets';
import { boothOpen, commentate, butlerIntro, butlerDecision, butlerFinish, weighInWeight, type AnnounceLine } from '../sim/commentary';
import { boutLabel } from '../sim/events';
import { rankLabel } from '../sim/rankings';
import { PAL } from '../art/palette';
import { W, H, SW, OX, text, button, box } from './kit';
import { col, type PixelText, type TextOpts } from './text';
import { ArenaView, AH, AW, type CanvasInfo } from './arena';
import { input } from '../core/input';
import { isTouchDevice } from '../core/platform';
import { FightInput, sampleFight, fightHaptic, stickDir, FIGHT_TUNING, type Dir, type FightHaptic, type FightIntent, type KeyboardShare } from '../core/fightinput';
import { TouchFightPad, fightPadLayout } from './fightpad';
import { setPinchZoom } from './touch';
import { setPadUiMode } from './controller';
import { fighterPortrait } from './sprites';
import { sfx } from '../audio/sfx';
import { LiveFight, LiveAI, GPOS_NAME, STRIKE_REACH, subFor, groundGoal, type LiveEvent, type LiveRules, type Side } from '../sim/live';
import type { Look2 } from './rig';
import { openHelp } from './help';
import { liveTutorial } from './tutorial';
import type { GamePlan } from '../sim/fight';
import { openCorner } from './cutman';
import { openFightLab } from './scenes/fightlab';

export interface LiveFightOpts {
  bout: Bout;
  A: Fighter;
  B: Fighter;
  skills: [Skills, Skills];
  player: Side;
  plan: GamePlan;
  oppPlan: GamePlan;
  cutTier: number;
  seed: number;
  event: string;
  judges: string[];
  referee: string;
  sponsors?: { name: string; color: number }[];
  canvas?: CanvasInfo;
  /** bareknuckle rules (somebody signed without reading) */
  bare?: boolean;
  /** with the game state and event: the full broadcast (tale of the tape, Juiced Butler, the booth, Bleeter, the decision) */
  state?: GameState;
  ev?: FightEvent;
  /** local 2-player versus: each player's controller (-1 = none) and share of the keyboard */
  versus?: { p1: { pad?: number; kb: KeyboardShare }; p2: { pad?: number; kb: KeyboardShare } };
  /** special rules for this fight (the story's boss fights), and a referee who looks like himself */
  rules?: LiveRules;
  refLook?: Look2;
  done: (r: FightResult) => void;
}

/** Engine strike name -> arena pose. */
const PUNCH_POSE: Record<string, string> = {
  jab: 'jab', cross: 'cross', hook: 'hook', uppercut: 'uppercut', overhand: 'overhand', 'body jab': 'bodyJab', 'body shot': 'body', 'body hook': 'bodyHook',
  'spinning backfist': 'spin', 'short hook': 'leadHook', elbow: 'elbow', knee: 'knee', legkick: 'legkick', kick: 'bodykick', headkick: 'headkick',
  'front kick': 'frontKick', 'spinning back kick': 'spinKick',
};
const JOINT: Record<string, 'haF' | 'haB' | 'ftB' | 'knB' | 'elB'> = {
  jab: 'haF', cross: 'haB', hook: 'haF', uppercut: 'haB', overhand: 'haB', 'body jab': 'haF', 'body shot': 'haB', 'body hook': 'haF', 'spinning backfist': 'haB', 'short hook': 'haF',
  elbow: 'elB', knee: 'knB', legkick: 'ftB', kick: 'ftB', headkick: 'ftB', 'front kick': 'ftB', 'spinning back kick': 'ftB', punch: 'haB',
};
const poseFor = (name: string, hand?: 'lead' | 'rear'): string => (name === 'hook' && hand === 'lead' ? 'leadHook' : name === 'hook' && hand === 'rear' ? 'hook' : PUNCH_POSE[name] ?? 'jab');
const TIE_NAME = { collar: 'COLLAR TIE', under: 'DOUBLE UNDERHOOKS', plum: 'THAI PLUM' };
const EVADE_POSE: Record<string, string> = { slip: 'slip', roll: 'roll', pull: 'pull', lean: 'lean' };
/** Punches (by the engine's names), for the named combos. */
const PUNCH_NAMES: Record<string, boolean> = {
  jab: true, cross: true, hook: true, uppercut: true, overhand: true, 'body jab': true, 'body shot': true, 'body hook': true, 'spinning backfist': true, 'short hook': true,
};
/** Submissions on a touch button (6 letters at most). */
const SUB_SHORT: Record<string, string> = {
  'rear-naked choke': 'RNC', 'bow and arrow choke': 'BOW', 'neck crank': 'CRANK', armbar: 'ARMBAR', 'triangle choke': 'TRI', guillotine: 'GUILLO',
  'arm-triangle choke': 'A-TRI', "d'arce choke": 'DARCE', 'north-south choke': 'N-S', 'ezekiel choke': 'EZEKEL', kimura: 'KIMURA', americana: 'AMERI',
  omoplata: 'OMOPLA', 'heel hook': 'HEEL', kneebar: 'KNEEBR', 'ankle lock': 'ANKLE',
};
/** A ground goal on the touch KICK button (its first word, 6 letters at most). */
const GOAL_SHORT: Record<string, string> = { pass: 'PASS', take: 'BACK', stand: 'STAND', pressure: 'PRESS', sweep: 'SWEEP', recover: 'RECOVR', frame: 'FRAME' };
/** 'pass to mount' -> 'PASSING TO MOUNT' (the progress bar's label). */
const ING: Record<string, string> = { pass: 'PASSING', take: 'TAKING', stand: 'STANDING', sweep: 'SWEEPING', recover: 'RECOVERING' };
const SIDES: Side[] = [0, 1];
const clamp = (v: number, a: number, b: number) => Math.max(a, Math.min(b, v));
const working = (goal: string): string => {
  if (!goal) return '';
  const sp = goal.indexOf(' ');
  const w = sp < 0 ? goal : goal.slice(0, sp);
  return ((ING[w] ?? w.toUpperCase() + 'ING') + (sp < 0 ? '' : goal.slice(sp).toUpperCase()));
};
/** A combo's named ending (the last few strikes, oldest first), or ''. */
function comboName(n: string[], clinch: boolean): string {
  const k = n.length;
  if (k >= 3 && n[k - 3] === 'jab' && n[k - 2] === 'cross' && n[k - 1] === 'hook') return 'ONE-TWO-THREE!';
  if (k >= 2 && n[k - 2] === 'jab' && n[k - 1] === 'cross') return 'ONE-TWO!';
  if (k >= 2 && PUNCH_NAMES[n[k - 2]] && n[k - 1] === 'legkick') return 'DUTCH FINISH!';
  if (clinch && k >= 2 && n[k - 2] === 'knee' && n[k - 1] === 'elbow') return 'MUAY THAI!';
  return '';
}

export function openLiveFight(g: Game, o: LiveFightOpts): void {
  const L = new LiveFight(o.A, o.B, o.skills[0], o.skills[1], o.bout.rounds, o.seed);
  // knockdown rules follow the promotion: bareknuckle and amateur smokers give a count, MMA doesn't
  L.rules = { koRules: o.bare || o.canvas?.style === 'bk' || o.canvas?.style === 'local' ? 'count' : 'mma', ...(o.rules ? { referee: o.referee, ...o.rules } : {}) };
  (window as unknown as { __live?: LiveFight }).__live = L; // debug / automated testing hook
  const P = o.player;
  const O = (1 - P) as Side;
  const fi = new FightInput();
  const fi2 = o.versus ? new FightInput() : null;
  let primed2 = false;
  const ai = new LiveAI(O, o.seed ^ 0x9e3779b9, o.oppPlan);
  const auto = new LiveAI(P, o.seed ^ 0x51ed27, o.plan);
  let autopilot = false;
  let paused = false;
  let freeze = 1.6; // "ROUND 1... FIGHT!"
  let endT = 0;
  let resultShown = false;
  let primed = false;
  let lastLine = '';
  let lineT = 0;
  // ------------------------------------------------------------ feel: hit-stop, callouts, combos, haptics
  /** real seconds since the fight opened (blinks, hit-stop spacing, combo windows) */
  let realT = 0;
  let lastStopT = -9;
  /** where each side's last clean shot landed (a body shot drops him to a knee) */
  const lastHitTarget: [string, string] = ['head', 'head'];
  let lastReadN = 0;
  /** this frame's callout: the most important one wins; a counter that rocks him says both */
  let coS = '';
  let coC = 0;
  let coP = 0;
  let coCounter = -1;
  /** your stick this frame, as a direction (what GRAB and KICK would do) */
  let stickNow: Dir = 'neutral';
  /** a tag over your head: SHORT (out of range), TOO FAR (clinch / shot), TOO CLOSE (taunt) */
  let rangeTag = '';
  let rangeT = 0;
  /** your get-up rhythm went wrong: the bar flashes red */
  let fumbleT = 0;
  /** heartbeats (a phase per side, so the HUD heart and the haptic pulse agree) */
  const beat: [number, number] = [0, 0];
  /** a loaded heavy clicks once per hold (lead, rear) */
  const loaded: [boolean, boolean] = [false, false];
  /** the body outline: which part just got hit (or blocked), for a moment */
  const hitFlash = [{ part: '', t: 0, blocked: false }, { part: '', t: 0, blocked: false }];
  /** strings of landed shots: count, last landing, the last few names, the named finishes already called */
  const combo = [{ n: 0, t: -9, names: [] as string[], fired: '', tag: '', tagT: 0 }, { n: 0, t: -9, names: [] as string[], fired: '', tag: '', tagT: 0 }];
  const rangeSide = { side: P as 0 | 1 };
  const vib = () => g.settings.vibration !== false;
  const buzz = (k: FightHaptic) => fightHaptic(input, k, vib());
  /** green when you did it, orange when it was done to you (gold for a two-player fight) */
  const who = (a: Side) => (o.versus ? PAL.gold : a === P ? PAL.moss : PAL.ember);
  const callout = (s: string, color: number = PAL.gold, prio = 1) => {
    if (coS && prio < coP) return;
    coS = s;
    coC = color;
    coP = prio;
  };
  const flushCallout = () => {
    if (coS) arena.showCallout(coS, coC, coP);
    coS = '';
    coP = 0;
    coCounter = -1;
  };
  const flashPart = (i: Side, part: string, blocked: boolean) => {
    hitFlash[i].part = part;
    hitFlash[i].t = 0.15;
    hitFlash[i].blocked = blocked;
  };
  const comboHit = (a: Side, name: string) => {
    const c = combo[a];
    if (c.n > 0 && realT - c.t <= 0.7) c.n++;
    else {
      c.n = 1;
      c.names.length = 0;
      c.fired = '';
    }
    c.t = realT;
    c.names.push(name);
    if (c.names.length > 3) c.names.shift();
    const tag = c.n >= 2 ? comboName(c.names, L.pos === 'clinch') : '';
    if (tag && c.fired.indexOf('|' + tag) < 0) {
      c.fired += '|' + tag;
      c.tag = tag;
      c.tagT = 1.2;
      sfx('crowd');
    }
  };

  // the fight spans the whole screen: on a wide phone the arena sits in the middle and the
  // HUD panel (and the thumbs) get the full width. FW = screen width, AX = the arena's x.
  const FW = SW;
  const AX = Math.floor((FW - AW) / 2);
  const root = new Container();
  root.x = -OX;
  root.addChild(new Graphics().rect(0, 0, FW, H).fill(0x0c0a10));
  const arena = new ArenaView(o.A, o.B, o.bout.rounds, { event: o.event, eventKey: o.bout.id, sponsors: o.sponsors, canvas: o.canvas, bare: o.bare, refLook: o.refLook });
  (window as unknown as { __liveArena?: ArenaView }).__liveArena = arena;
  arena.manual = [L.F[0].x, L.F[1].x];
  arena.startFight();
  arena.manualRound();
  arena.x = AX;
  root.addChild(arena);
  arena.setMode(g.settings.fightCam ?? 'side');
  /** C / View: side -> TV -> top-down */
  const cycleCam = () => {
    const order = ['side', 'tv', 'top'] as const;
    g.settings.fightCam = order[(order.indexOf(g.settings.fightCam ?? 'side') + 1) % 3];
    g.applySettings();
    arena.setMode(g.settings.fightCam);
    g.toast(`Camera: ${g.settings.fightCam === 'tv' ? 'TV broadcast' : g.settings.fightCam === 'top' ? 'top-down' : 'side'}`, PAL.ash, { small: true });
  };
  // ------------------------------------------------------------ broadcast: tape, Juiced Butler, booth, Bleeter
  const S = o.state;
  const EV = o.ev;
  const pseed = (o.seed ^ 0x2545f491) >>> 0;
  let stage: 'tape' | 'intro' | 'fight' | 'ceremony' = 'fight';
  let tape: TaleOfTape | null = null;
  let intro: AnnounceLine[] = [];
  let introIdx = 0;
  let annT = 0.6;
  let cer: AnnounceLine[] = [];
  let cerIdx = 0;
  const subtitle = new Container();
  const booth: TickerLine[] = []; // what the booth has said (newest last)
  let boothT = 0;
  let boothK = 0;
  let feed: BleetFeed | null = null;
  const bleetQ: { at: number; sit: string; actor: 0 | 1 }[] = [];
  let bleetClock = 0;
  if (S && EV) {
    if (g.settings.intros !== false) intro = butlerIntro(S, EV, o.bout, pseed);
    booth.push(...boothOpen(S, EV, o.bout, pseed).filter((l) => l.speaker));
    if (intro.length) {
      stage = 'tape';
      arena.startIntro();
      tape = new TaleOfTape(o.A, o.B, AW, boutLabel(S, o.bout), weighInWeight(o.A, o.bout, 1), weighInWeight(o.B, o.bout, 2), [rankLabel(S, o.A.id), rankLabel(S, o.B.id)]);
      tape.x = AX;
      root.addChild(tape);
      sfx('crowd');
    }
    if (g.settings.bleets !== false) {
      feed = new BleetFeed();
      feed.position.set(AX + AW - 146, 36);
      root.addChild(feed);
    }
  }
  subtitle.x = AX;
  root.addChild(subtitle);
  const say = (line: AnnounceLine | null) => {
    subtitle.removeChildren().forEach((c) => c.destroy({ children: true }));
    if (!line) return;
    const t = text(line.text, 0, 0, { width: W - 40, align: 'center', color: line.stage ? PAL.ash : /!!!$/.test(line.text) ? PAL.gold : PAL.bone, small: line.stage, maxLines: 3, shadow: PAL.ink });
    const h = t.textHeight + 8;
    const bg = box(W - 24, h, 0x0a080c);
    bg.alpha = 0.82;
    bg.position.set(12, AH - 8 - h);
    subtitle.addChild(bg);
    if (!line.stage) subtitle.addChild(text('JUICED BUTLER', 16, AH - 17 - h, { small: true, color: PAL.gold, shadow: PAL.ink }));
    t.position.set(20, AH - 8 - h + 4);
    subtitle.addChild(t);
  };
  const queueBleet = (sit: string, actor: 0 | 1, delay = 0.8 + Math.random() * 1.4) => {
    if (feed && bleetQ.length < 4) bleetQ.push({ at: bleetClock + delay, sit, actor });
  };
  /** A new line from the fight: the booth might say something, Bleeter might react. */
  const react = (line: TickerLine) => {
    if (!S || !EV) return;
    const urgent = line.intensity >= 3 || line.act === 'kd' || line.act === 'tap' || line.act === 'ko' || line.act === 'tko';
    if (urgent || boothT <= 0) {
      const said = commentate(S, EV, o.bout, [line], pseed + ++boothK * 7919).filter((l) => l.speaker);
      if (said.length) {
        booth.push(...said.slice(0, urgent ? 2 : 1));
        boothT = 4.5;
      }
    }
    const sit = bleetSituation(line);
    if (sit && Math.random() < sit.chance) queueBleet(sit.sit, line.side === 1 ? 1 : 0);
  };
  const endIntro = () => {
    if (stage !== 'tape' && stage !== 'intro') return;
    tape?.destroy({ children: true });
    tape = null;
    stage = 'fight';
    say(null);
    arena.startFight();
    arena.manual = [L.F[0].x, L.F[1].x];
    arena.manualRound();
    freeze = 1.4;
    arena.showCallout('ROUND 1');
    queueBleet('open', 0, 1.2);
  };
  const hud = new Container();
  root.addChild(hud);
  const hudG = new Graphics();
  root.addChild(hudG);
  const dyn = new Container(); // redrawn text
  root.addChild(dyn);
  // phones / tablets: the touch pad takes the panel's left and right thirds (the thumbs),
  // so both fighters' readouts squeeze into the middle (TX0..TX1) and PAUSE / CAM go on screen
  const touchUi = isTouchDevice() && !o.versus;
  const TX0 = 124;
  const TX1 = FW - 154;
  let pad: TouchFightPad | null = null;
  let skipCatch: Container | null = null;
  let skipBtn: Container | null = null;
  if (touchUi) {
    pad = new TouchFightPad(fightPadLayout(FW));
    root.addChild(pad);
  }

  // static HUD: portraits and names
  const y0 = AH + 2;
  hud.addChild(box(FW, H - AH, PAL.ink, PAL.shadow));
  hud.position.set(0, 0);
  hud.children[0].position.set(0, AH);
  const tag = (i: Side) => (o.versus ? (i === P ? 'P1: ' : 'P2: ') : i === P ? 'YOU: ' : '');
  if (touchUi) {
    const cw = (TX1 - TX0) / 2;
    hud.addChild(text(tag(0) + o.A.last.toUpperCase(), TX0, y0 + 3, { small: true, color: P === 0 ? PAL.gold : PAL.bone, width: cw - 4, maxLines: 1 }));
    hud.addChild(text(tag(1) + o.B.last.toUpperCase(), TX0 + cw + 4, y0 + 3, { small: true, color: P === 1 ? PAL.gold : PAL.bone, width: cw - 4, align: 'right', maxLines: 1 }));
  } else {
    const pA = fighterPortrait(o.A, 32, 'plain');
    pA.position.set(4, y0 + 4);
    const pB = fighterPortrait(o.B, 32, 'plain');
    pB.position.set(FW - 36, y0 + 4);
    hud.addChild(pA, pB);
    hud.addChild(text(tag(0) + o.A.last.toUpperCase(), 40, y0 + 3, { small: true, color: P === 0 || o.versus ? PAL.gold : PAL.bone }));
    hud.addChild(text(tag(1) + o.B.last.toUpperCase(), FW - 140, y0 + 3, { small: true, color: P === 1 || o.versus ? PAL.gold : PAL.bone, width: 100, align: 'right' }));
  }

  if (touchUi) {
    // no Esc / C on a phone: PAUSE and CAM sit in the panel's top corners, above the thumbs
    root.addChild(button('CAM', 4, AH + 4, 40, 16, () => {
      if (!paused && !resultShown) cycleCam();
    }, { fill: PAL.shadow }));
    root.addChild(button('PAUSE', FW - 50, AH + 4, 46, 16, () => {
      if (!paused && !resultShown && g.modals[g.modals.length - 1] === wrap) pause();
    }, { fill: PAL.shadow }));
    // tap the cage to skip the tale of the tape / Juiced Butler (a catcher over the tape card, gone once the fight starts)
    if ((stage as string) !== 'fight') {
      skipCatch = new Container();
      skipCatch.eventMode = 'static';
      skipCatch.hitArea = { contains: (x: number, y: number) => x >= AX && y >= 0 && x < AX + AW && y < AH };
      skipCatch.on('pointertap', () => {
        if ((stage === 'tape' || stage === 'intro') && !paused) endIntro();
      });
      root.addChildAt(skipCatch, root.getChildIndex(pad!));
      // and a button that says so, in the middle of the panel
      skipBtn = button('SKIP INTROS >>', Math.floor(FW / 2 - 50), H - 26, 100, 20, () => {
        if ((stage === 'tape' || stage === 'intro') && !paused) endIntro();
      }, { fill: PAL.blood, border: PAL.gold });
      root.addChild(skipBtn);
    }
  }

  const wrap = g.modal(root, { dim: 0 });
  g.inLiveFight = true;
  setPinchZoom(false);
  // first hands-on fight: the coach's three cards (the fight waits for them)
  setTimeout(() => liveTutorial(g), 50);
  setPadUiMode('game');
  const popKeys = g.pushKeyHandler((e) => {
    if (e.type !== 'keydown') return true;
    if ((stage === 'tape' || stage === 'intro') && !paused) {
      if (e.key === 'Escape' || e.key === 'Enter' || e.key === ' ') endIntro();
      return true;
    }
    if ((e.key === 'c' || e.key === 'C') && !paused) {
      cycleCam();
      return true;
    }
    if (e.key === 'Escape') {
      if (!paused && !resultShown) pause();
      else if (paused && pauseWrap && g.modals[g.modals.length - 1] === pauseWrap) g.closeModal(pauseWrap);
      return true;
    }
    return !paused; // swallow fight keys
  });

  // ------------------------------------------------------------ HUD drawing

  const bodyOutline = (x: number, y: number, i: Side) => {
    const f = L.F[i];
    const tint = (v: number) => (v > 70 ? PAL.moss : v > 40 ? PAL.gold : v > 20 ? PAL.ember : PAL.blood);
    // the part that just took a shot flashes white (orange when the guard took it)
    const fl = hitFlash[i];
    const hot = fl.t > 0 ? (fl.blocked ? PAL.ember : 0xffffff) : 0;
    const head = (f.hp / 100) * 100;
    // head
    hudG.rect(x + 5, y, 6, 6).fill(hot && fl.part === 'head' ? hot : tint(head));
    hudG.rect(x + 7, y + 6, 2, 1).fill(PAL.ash);
    // torso + arms
    const body = hot && fl.part === 'body' ? hot : 0;
    hudG.rect(x + 3, y + 7, 10, 9).fill(body || tint(f.body));
    hudG.rect(x, y + 7, 2, 8).fill(body || tint((f.body + f.gas) / 2)).rect(x + 14, y + 7, 2, 8).fill(body || tint((f.body + f.gas) / 2));
    // legs
    const legs = hot && fl.part === 'legs' ? hot : 0;
    hudG.rect(x + 3, y + 17, 4, 9).fill(legs || tint(f.legs)).rect(x + 9, y + 17, 4, 9).fill(legs || tint(f.legs));
  };
  // The HUD is rebuilt every frame: a text is reused while its words, style and place stay the same.
  const hudPool = new Map<string, PixelText>();
  let hudUsed = new Set<string>();
  const hudText = (s: string, x: number, y: number, opts: TextOpts = {}): PixelText => {
    let key = `${s}\u0001${x}|${y}|${opts.small ? 1 : 0}|${opts.color ?? ''}|${opts.width ?? ''}|${opts.align ?? ''}|${opts.maxLines ?? ''}|${opts.scale ?? ''}|${opts.shadow ?? ''}`;
    while (hudUsed.has(key)) key += '+';
    let t = hudPool.get(key);
    if (!t || t.destroyed) {
      t = text(s, x, y, opts);
      hudPool.set(key, t);
    } else t.y = Math.round(y);
    hudUsed.add(key);
    return t;
  };
  const heart = (x: number, y: number, i: Side) => {
    const f = L.F[i];
    const pulse = (beat[i] % 1) < 0.18;
    const c = f.bpm > 165 ? PAL.blood : f.bpm > 135 ? PAL.ember : 0xd04050;
    const s = pulse ? 1 : 0;
    hudG.rect(x + 1 - s, y, 2 + s, 2).fill(c).rect(x + 4, y, 2 + s, 2).fill(c).rect(x - s, y + 1, 7 + s * 2, 2).fill(c).rect(x + 1, y + 3, 5, 1).fill(c).rect(x + 2, y + 4, 3, 1).fill(c).rect(x + 3, y + 5, 1, 1).fill(c);
    dyn.addChild(hudText(`${Math.round(f.bpm)} BPM`, x + 10, y - 1, { small: true, color: f.bpm > 165 ? PAL.blood : PAL.bone }));
  };
  const bar = (x: number, y: number, w: number, v: number, c: number, label: string, right = false, labelColor: number = PAL.ash, tick = false) => {
    hudG.rect(x, y, w, 4).fill(PAL.night);
    const n = Math.round(w * Math.max(0, Math.min(1, v)));
    hudG.rect(right ? x + w - n : x, y, n, 4).fill(c);
    // the 20% line on the gas tank: below it every strike comes out slower
    if (tick) hudG.rect(right ? x + w - Math.round(w * 0.2) - 1 : x + Math.round(w * 0.2), y - 1, 1, 6).fill(PAL.bone);
    const t = hudText(label, right ? x - 26 : x + w + 3, y - 2, { small: true, color: labelColor });
    if (right) t.x = x - 3 - t.textWidth;
    dyn.addChild(t);
  };
  /** The gas bar: a mark at 20%, and below it the bar blinks and says GASSED. */
  const gasBar = (x: number, y: number, w: number, i: Side, right: boolean) => {
    const gas = L.F[i].gas;
    const gassed = gas < 20;
    const blink = gassed && Math.floor(realT * 6) % 2 === 0;
    bar(x, y, w, gas / 100, blink ? PAL.ember : PAL.steel, gassed ? 'GASSED' : 'GAS', right, gassed ? PAL.ember : PAL.ash, true);
  };
  /** Under your bars: COUNTER! with the window draining (you made him miss), OPEN (you missed: he's got one). */
  const windows = (i: Side, x: number, w: number, y: number, right: boolean) => {
    const ct = L.F[i].counterT;
    let cx = right ? x + w : x;
    if (ct > 0) {
      const t = hudText('COUNTER!', x, y, { small: true, color: PAL.gold });
      const bw = Math.max(1, Math.round(30 * Math.min(1, ct / 0.6)));
      const gx = right ? cx - 30 : cx + t.textWidth + 2;
      t.x = right ? gx - 2 - t.textWidth : cx;
      hudG.rect(gx, y + 2, 30, 2).fill(PAL.night).rect(right ? gx + 30 - bw : gx, y + 2, bw, 2).fill(PAL.gold);
      dyn.addChild(t);
      cx = right ? t.x - 4 : gx + 34;
    }
    if (L.F[1 - i].counterT > 0) {
      const t = hudText('OPEN', x, y, { small: true, color: PAL.ember });
      t.x = right ? cx - t.textWidth : cx;
      dyn.addChild(t);
    }
  };

  /** Where the fight is, in words: no button charts (HELP has those), just the state. */
  const situation = (): { text: string; color: number } | null => {
    if (L.pos === 'clinch') {
      const c = L.clinch;
      const fence = c.fence === P ? '  (YOUR BACK ON THE FENCE)' : c.fence === O ? '  (HIM ON THE FENCE)' : '';
      if (c.dom === -1) return { text: 'CLINCH: EVEN' + fence, color: PAL.bone };
      return { text: (c.dom === P ? 'YOUR ' : 'HIS ') + TIE_NAME[c.tie] + fence, color: c.dom === P ? PAL.moss : PAL.ember };
    }
    if (L.pos === 'ground') {
      const top = L.top === P;
      const name = GPOS_NAME[L.gpos].toUpperCase();
      return { text: (top ? 'ON TOP: ' : 'UNDERNEATH: ') + (L.gpos === 'back' && !top ? 'HE HAS YOUR BACK' : name), color: top ? PAL.moss : PAL.ember };
    }
    return null;
  };
  /** What GRAB and KICK do from here with the stick where it is (the pointed option lit). */
  const preview = (): string => {
    const d = stickNow;
    if (L.pos === 'clinch') {
      const lit = (on: boolean, s: string) => (on ? col(PAL.gold, s) : s);
      const tw = P === 0 ? '→' : '←';
      const aw = P === 0 ? '←' : '→';
      return `GRAB: ${lit(d === 'up', '↑PLUM')} ${lit(d === 'toward', tw + 'UNDERS')} ${lit(d === 'down', '↓TRIP')} ${lit(d === 'away', aw + 'BREAK')} ${lit(d === 'neutral', '•PUMMEL')}  KICK: KNEE`;
    }
    if (L.pos === 'ground') {
      const top = L.top === P;
      const goal = groundGoal(top, L.gpos, d).toUpperCase();
      const sub = subFor(top, L.gpos, d);
      return `KICK: ${goal ? col(PAL.bone, goal) : '-'}   GRAB: ${sub ? col(PAL.bone, sub.toUpperCase()) : 'NO SUB FROM HERE'}`;
    }
    return '';
  };
  /** Touch: the charge rings, the busy shade, and GRAB / KICK saying what they'd do. */
  const padHints = () => {
    if (!pad) return;
    pad.setCharge('LEAD', autopilot ? 0 : fi.heldFor('lead'));
    pad.setCharge('REAR', autopilot ? 0 : fi.heldFor('rear'));
    const a = L.F[P].act;
    pad.setBusy(a ? 1 - a.t / (a.wind + a.rec) : 0);
    if (L.sub) return;
    const d = stickNow;
    if (L.pos === 'clinch') pad.setLabel('GRAB', d === 'up' ? 'PLUM' : d === 'toward' ? 'UNDERS' : d === 'down' ? 'TRIP' : d === 'away' ? 'BREAK' : 'PUMMEL');
    else if (L.pos === 'ground') {
      const top = L.top === P;
      const sub = subFor(top, L.gpos, d);
      pad.setLabel('GRAB', sub ? SUB_SHORT[sub] ?? sub.slice(0, 6).toUpperCase() : 'SUB', !sub);
      const goal = groundGoal(top, L.gpos, d);
      const sp = goal.indexOf(' ');
      const w = sp < 0 ? goal : goal.slice(0, sp);
      pad.setLabel('KICK', goal ? GOAL_SHORT[w] ?? w.slice(0, 6).toUpperCase() : 'MOVE', !goal);
    }
  };

  const drawHud = () => {
    hudG.clear();
    dyn.removeChildren();
    hudUsed = new Set();
    const fighting = stage === 'fight' && L.phase === 'fight';
    // left / right panels (touch: two columns in the middle, the arena's top bar has the clock)
    const cx0 = touchUi ? TX0 : 112; // the centre column the text below lives in
    const cx1 = touchUi ? TX1 : FW - 112;
    for (const i of SIDES) {
      const left = i === 0;
      // your counter window (and his), under your bars; both players' in a two-player fight
      const tags = fighting && (o.versus || (i === P && !autopilot));
      if (touchUi) {
        bodyOutline(left ? TX0 : TX1 - 16, y0 + 12, i);
        const x = left ? TX0 + 20 : TX1 - 20 - 46;
        heart(x, y0 + 12, i);
        gasBar(x, y0 + 22, 46, i, !left);
        bar(x, y0 + 30, 46, L.F[i].hp / 100, L.F[i].hp > 40 ? PAL.moss : PAL.blood, 'HEAD', !left);
        if (tags) windows(i, x, 46, y0 + 36, !left);
        continue;
      }
      const x = left ? 40 : FW - 140;
      bodyOutline(left ? 12 : FW - 28, y0 + 42, i);
      heart(x, y0 + 14, i);
      gasBar(left ? x : x + 26, y0 + 25, 50, i, !left);
      bar(left ? x : x + 26, y0 + 31, 50, L.F[i].hp / 100, L.F[i].hp > 40 ? PAL.moss : PAL.blood, 'HEAD', !left);
      if (tags) windows(i, left ? x : x + 26, 50, y0 + 38, !left);
    }
    // centre: clock + where the fight is
    if (!touchUi) dyn.addChild(hudText(`ROUND ${L.round}/${L.rounds}   ${L.clockText()}`, 0, y0 + 3, { width: FW, align: 'center', color: PAL.gold }));
    const sy = touchUi ? y0 + 40 : y0 + 14;
    if (autopilot) dyn.addChild(hudText(touchUi ? 'AUTOPILOT (PAUSE to take over)' : hint('AUTOPILOT (ESC to take over)', 'AUTOPILOT ({Menu} to take over)'), cx0, sy, { width: cx1 - cx0, align: 'center', small: true, color: PAL.ember }));
    const sit = situation();
    // the centre column fills top-down: the situation, what your buttons do, the progress bar
    const sx = touchUi ? cx0 : 150;
    const sw = touchUi ? cx1 - cx0 : FW - 300;
    let cy = sy + (autopilot ? 11 : touchUi ? 0 : 2);
    if (sit) {
      const st = hudText(sit.text, sx, cy, { width: sw, align: 'center', small: true, color: sit.color, maxLines: 2 });
      dyn.addChild(st);
      cy += st.textHeight + 2;
      if (fighting && !autopilot && !L.sub) {
        const pv = preview();
        if (pv) {
          const pt = hudText(pv, sx, cy, { width: sw, align: 'center', small: true, color: PAL.ash, maxLines: 2 });
          dyn.addChild(pt);
          cy += pt.textHeight + 2;
        }
      }
      // progress on the mat: your passing / escape work, and what it's working toward
      if (L.pos === 'ground' && !L.sub) {
        const mineTop = L.top === P;
        const v = Math.max(0, Math.min(1, mineTop ? L.gprog : L.standProg));
        const wk = L.working();
        const label = working(mineTop ? wk.top : wk.bottom);
        if (label) {
          dyn.addChild(hudText(label, sx, cy, { width: sw, align: 'center', small: true, color: PAL.gold }));
          cy += 8;
        }
        hudG.rect(FW / 2 - 40, cy, 80, 3).fill(PAL.night).rect(FW / 2 - 40, cy, Math.round(80 * v), 3).fill(PAL.gold);
        cy += 5;
      }
    }
    // the booth and the play-by-play, newest at the bottom
    if (stage === 'tape' || stage === 'intro') {
      if (!touchUi) dyn.addChild(hudText(hint('ENTER / A: SKIP THE INTROS', '{A}: SKIP THE INTROS'), 0, H - 11, { small: true, color: PAL.grey, width: FW, align: 'center' }));
    }
    else {
      const speakers = content().commentary.speakers;
      const rows: { t: string; c: number }[] = booth.slice(-3).map((l) => ({ t: `{#${speakers[l.speaker!]?.color ?? 'c4a04a'}}${speakers[l.speaker!]?.short ?? l.speaker!.toUpperCase()}:{/} ${l.text}`, c: PAL.fog }));
      let yy = H - 12;
      if (lineT > 0) {
        const t = hudText(lastLine, cx0, 0, { small: true, color: PAL.gold, width: cx1 - cx0, align: 'center', maxLines: touchUi ? 2 : 1 });
        yy -= t.textHeight - 6;
        t.y = yy;
        dyn.addChild(t);
        yy -= 10;
      }
      const top = Math.max(y0 + (touchUi ? 52 : 44), cy + 2);
      for (const r of (touchUi ? rows.slice(-2) : rows).reverse()) {
        const t = hudText(r.t, cx0, 0, { small: true, color: r.c, width: cx1 - cx0, maxLines: 3 });
        yy -= t.textHeight - 6;
        t.y = yy;
        if (yy < top) break;
        dyn.addChild(t);
        yy -= 10;
      }
    }
    // over the cage: SHORT / TOO FAR over your head, the string you're on under each HP bar
    if (stage === 'fight') {
      if (rangeT > 0 && rangeTag && !autopilot) {
        const t = hudText(rangeTag, 0, 30, { small: true, color: PAL.ember, shadow: PAL.ink });
        t.x = Math.round(AX + L.F[P].x - t.textWidth / 2);
        dyn.addChild(t);
      }
      for (const i of SIDES) {
        const c = combo[i];
        const cxx = i === 0 ? AX + 6 : AX + AW - 70;
        const align = i === 0 ? 'left' : 'right';
        if (c.n >= 2 && L.F[i].comboT > 0) dyn.addChild(hudText(c.n === 2 ? '2 HITS' : `${c.n} HIT COMBO`, cxx, 24, { small: true, color: PAL.bone, shadow: PAL.ink, width: 64, align }));
        if (c.tagT > 0 && c.tag) dyn.addChild(hudText(c.tag, cxx, 32, { small: true, color: PAL.gold, shadow: PAL.ink, width: 64, align }));
      }
    }
    // he's shooting: the sprawl, right now
    const shot = L.F[O].act;
    if (fighting && !autopilot && L.shooting === O && shot && shot.kind === 'shoot' && !shot.done) {
      const key = touchUi ? 'GRAB' : input.lastDevice === 'gamepad' ? padName('B') : hint('SPACE', '{B}');
      dyn.addChild(hudText(`TAP ${key} TO SPRAWL!`, 0, 48, { width: FW, align: 'center', color: PAL.gold, scale: 2, shadow: PAL.ink }));
    }
    // overlays: the count, submission struggle
    for (const i of SIDES) {
      if (L.F[i].down <= 0) continue;
      const mma = (L.rules.koRules ?? 'mma') === 'mma';
      // MMA: no count. He's down: jump on him (any attack) or let him up. Bareknuckle and smokers count.
      if (!mma) dyn.addChild(hudText(`${L.countOf(i)}`, 0, 40, { width: FW, align: 'center', color: PAL.bone, scale: 3, shadow: PAL.ink }));
      else if (i !== P && !autopilot) dyn.addChild(hudText('HE\'S DOWN! JUMP ON HIM!', 0, 48, { width: FW, align: 'center', color: PAL.gold, scale: 2, shadow: PAL.ink }));
      if (i === P && !autopilot) {
        // under MMA rules the same left-right covers you up (he lands in your guard, not the mount)
        const red = fumbleT > 0;
        hudG.rect(FW / 2 - 60, 78, 120, 6).fill(red ? PAL.blood : PAL.night).rect(FW / 2 - 59, 79, Math.round(118 * Math.min(1, L.F[i].getup)), 4).fill(red ? PAL.ember : PAL.gold);
        // the beat: left, right, left... (the ideal gap between presses)
        const lit = Math.floor(realT / 0.3) % 2;
        hudG.rect(FW / 2 - 12, 71, 6, 4).fill(lit === 0 ? PAL.gold : PAL.night).rect(FW / 2 + 6, 71, 6, 4).fill(lit === 1 ? PAL.gold : PAL.night);
        dyn.addChild(hudText(mma ? 'COVER UP!' : 'GET UP!', 0, 88, { width: FW, align: 'center', small: true, color: red ? PAL.ember : PAL.gold, shadow: PAL.ink }));
      }
    }
    if (L.sub) {
      const v = Math.max(0, Math.min(1, L.sub.prog));
      hudG.rect(FW / 2 - 80, 30, 160, 8).fill(PAL.night).rect(FW / 2 - 79, 31, Math.round(158 * v), 6).fill(L.sub.atk === P ? PAL.moss : PAL.blood);
      dyn.addChild(hudText(L.sub.name.toUpperCase(), 0, 20, { width: FW, align: 'center', small: true, color: PAL.gold, shadow: PAL.ink }));
    }
    // texts that left the HUD this frame
    for (const [k, t] of hudPool) {
      if (hudUsed.has(k)) continue;
      t.destroy();
      hudPool.delete(k);
    }
  };

  // ------------------------------------------------------------ events -> animation

  const sayLine = (s: string) => {
    lastLine = s;
    lineT = 3;
  };
  const handle = (e: LiveEvent) => {
    const a = e.side;
    const d = (1 - a) as Side;
    switch (e.type) {
      case 'punch':
      case 'kick': {
        const n = e.name ?? 'jab';
        const kick = e.type === 'kick';
        arena.play(a, poseFor(n, e.hand), /spinning/.test(n) ? 0.5 : kick ? 0.4 : 0.26, L.pos === 'clinch' ? 1 : 4);
        if (/spinning/.test(n)) sfx('whoosh');
        break;
      }
      case 'hit':
      case 'counter': {
        const counter = e.type === 'counter';
        const tgt = e.target ?? 'head';
        if (e.name === 'knee' || e.name === 'elbow') arena.play(a, e.name, 0.3, L.pos === 'clinch' ? 1 : 4);
        // the shot that opens a cut sprays
        let cut = false;
        for (const x of L.events) if (x.type === 'cut' && x.side === d) cut = true;
        arena.strike(a, JOINT[e.name ?? 'punch'] ?? 'haB', !!e.big, cut || (L.F[d].hp < 55 && Math.random() < 0.5), tgt);
        sfx(e.name && /kick|knee/.test(e.name) ? 'kick' : 'punch');
        lastHitTarget[a] = tgt;
        // the picture (and the engine) stops for a beat, longer for bigger shots; flurries don't stutter
        if (realT - lastStopT >= 0.1) {
          arena.hitStop = Math.max(arena.hitStop, clamp((e.dmg ?? 3) / 12, 0.25, 1) * 0.06 + (counter ? 0.03 : 0));
          lastStopT = realT;
        }
        if (counter) {
          callout('COUNTER!', who(a), 3);
          coCounter = a;
          g.shake(e.big ? 3 : 2, 0.15);
        }
        if (a === P) buzz(e.big || counter ? 'landBig' : 'land');
        else if (d === P) buzz(e.big || counter ? 'hurtBig' : 'hurt');
        flashPart(d, tgt, false);
        comboHit(a, e.name ?? '');
        break;
      }
      case 'miss':
        if (e.name === 'STAND AND BANG') {
          if (a === P) callout('STAND AND BANG ONLY!');
          break;
        }
        sfx('whoosh');
        // thrown from too far out: it falls short (not a slip, not a block: range)
        if (a === P && e.name && STRIKE_REACH[e.name] !== undefined && L.dist > STRIKE_REACH[e.name]) {
          rangeTag = 'SHORT';
          rangeT = 0.6;
        }
        combo[a].n = 0;
        break;
      case 'block': {
        // a covered up, d threw it; the guard he shows depends on where it was going
        const n = e.name ?? '';
        const tgt = L.F[d].act?.target ?? (n === 'legkick' ? 'legs' : /body|kick|knee/.test(n) && n !== 'headkick' ? 'body' : 'head');
        if (L.pos === 'ground') arena.play(a, 'block', 0.25);
        else {
          arena.play(a, n === 'legkick' ? 'check' : tgt === 'body' ? 'blockBody' : 'block', 0.25);
          arena.blockFx(a, n === 'legkick' ? 'check' : 'block');
        }
        sfx('thud');
        if (d === P) buzz('blocked');
        flashPart(a, tgt, true);
        combo[d].n = 0;
        break;
      }
      case 'parry':
        arena.play(a, 'parry', 0.25);
        arena.blockFx(a, 'parry');
        callout('PARRY!', who(a), 2);
        sfx('snap');
        if (d === P) buzz('parried');
        combo[d].n = 0;
        break;
      case 'catch':
        // he caught the kick: the kicker hops on one leg, wide open
        arena.blockFx(a, 'catch');
        callout('CAUGHT THE KICK!', o.versus ? PAL.gold : a === P ? PAL.moss : PAL.ember, 2);
        sfx('grapple');
        if (d === P) buzz('parried');
        combo[d].n = 0;
        break;
      case 'interrupt':
        // a landed first and took the other man's wind-up away
        arena.play(d, 'hurt', 0.25);
        callout(a === P ? 'BEAT HIM TO IT!' : o.versus ? 'BEAT HIM TO IT!' : 'HE BEAT YOU TO IT!', who(a), 2);
        sfx('snap');
        break;
      case 'pivot':
        // pinned on the fence: circled off it, or got cut off
        arena.play(a, 'slip', 0.25);
        if (a === P) callout(e.name === 'escape' ? 'PIVOTED OFF THE FENCE' : 'CUT OFF!', e.name === 'escape' ? who(P) : who(O));
        else if (e.name === 'cutoff') callout('CUT HIM OFF!', who(P));
        sfx('squeak');
        break;
      case 'evade':
        arena.play(a, EVADE_POSE[e.name ?? 'slip'] ?? 'slip', 0.3);
        if (e.big && a === P) callout(e.name === 'roll' ? 'ROLLED UNDER!' : e.name === 'pull' ? 'MADE HIM MISS!' : 'SLIPPED!', who(a));
        break;
      case 'feint': {
        // a wrestler fakes the shot, a striker paws or dips a shoulder; a good one makes the other man flinch
        const wrestler = L.F[a].sk.wrestling > L.F[a].sk.striking;
        arena.play(a, wrestler ? 'levelFeint' : Math.random() < 0.5 ? 'paw' : 'shoulderFeint', 0.18, 2);
        if (L.F[d].stun > 0.2) arena.play(d, 'block', 0.2);
        break;
      }
      case 'taunt':
        arena.play(a, 'taunt', 1.0);
        if (a === P || Math.random() < 0.5) callout(arena.tauntCall(a));
        sfx('crowd');
        break;
      case 'rocked':
        arena.play(a, 'rocked', 0.9);
        // a counter that rocks him says both (the engine sends the counter first)
        if (coCounter === d) callout(o.versus || a !== P ? "COUNTER! HE'S ROCKED!" : "COUNTER! YOU'RE ROCKED!", who(d), 3);
        else callout('ROCKED!', who(d), 3);
        sfx('crowd');
        break;
      case 'kd':
        // a body shot folds him onto a knee; to the head he goes down flat
        arena.floor(d, 'down', lastHitTarget[a] === 'body' ? 'body' : '');
        callout('KNOCKDOWN!', who(a), 4);
        arena.flash = 0.3;
        arena.slowMo(1);
        arena.hitStop = Math.max(arena.hitStop, 0.12);
        lastStopT = realT;
        sfx('slam');
        sfx('roar');
        buzz('kd');
        break;
      case 'pounce': {
        arena.floor(d, 'up');
        arena.takedown(a, 'shoot');
        // where he landed says how well the man underneath covered up
        const gp = L.gpos;
        if (d === P && !o.versus) callout(gp === 'guard' ? "HE'S IN YOUR GUARD!" : gp === 'half' ? 'HALF GUARD!' : gp === 'mount' ? 'MOUNTED!' : gp === 'back' ? 'HE HAS YOUR BACK!' : 'SIDE CONTROL!', gp === 'guard' || gp === 'half' ? PAL.moss : PAL.ember, 4);
        else callout(gp === 'guard' ? 'IN HIS GUARD!' : gp === 'half' ? 'HALF GUARD! FINISH IT!' : gp === 'mount' ? 'MOUNT! FINISH IT!' : 'SIDE CONTROL! FINISH IT!', gp === 'guard' ? PAL.gold : who(a), 4);
        sfx('slam');
        sfx('roar');
        if (d === P) buzz('hurtBig');
        break;
      }
      case 'getup':
        arena.floor(a, 'up');
        sfx('crowd');
        break;
      case 'clinch':
        sfx('grapple');
        break;
      case 'tie':
        sfx('grapple');
        if (a === P) callout(TIE_NAME[e.name as keyof typeof TIE_NAME] ?? 'TIE-UP', who(a));
        break;
      case 'pummel':
        sfx('scuffle');
        break;
      case 'fence':
        sfx('cage');
        arena.shakeT = 0.1;
        break;
      case 'trip':
        arena.takedown(a, 'trip');
        callout('TRIPPED!', who(a));
        sfx('slam');
        break;
      case 'pass':
        arena.transition('pass', a);
        sfx('scuffle');
        if (e.name === 'back' || e.name === 'mount') callout(e.name === 'back' ? 'TAKES THE BACK!' : 'FULL MOUNT!', who(a));
        break;
      case 'scramble':
        arena.transition('scramble', a);
        callout('SCRAMBLE!');
        sfx('scramble');
        break;
      case 'break':
        break;
      case 'shoot':
        arena.play(a, 'shoot', 0.45);
        sfx('squeak');
        break;
      case 'sprawl':
        arena.play(a, 'sprawl', 0.5);
        arena.play(d, 'shoot', 0.35);
        callout('STUFFED!', who(a), 2);
        sfx('grapple');
        break;
      case 'td':
        if (e.name !== 'trip') {
          arena.takedown(a, 'shoot');
          arena.play(a, 'shoot', 0.3);
          arena.play(d, 'lifted', 0.25);
        }
        sfx('slam');
        arena.shakeT = 0.15;
        break;
      case 'gnp':
        arena.gnp();
        arena.strike(a, 'haB', !!e.big, L.F[d].hp < 50, 'head');
        sfx('punch');
        if (realT - lastStopT >= 0.1) {
          arena.hitStop = Math.max(arena.hitStop, clamp((e.dmg ?? 3) / 12, 0.25, 1) * 0.04);
          lastStopT = realT;
        }
        if (a === P) buzz('land');
        else if (d === P) buzz('hurt');
        flashPart(d, 'head', false);
        break;
      case 'advance':
        sfx('scuffle');
        break;
      case 'sweep':
        arena.transition('scramble', a);
        callout('SWEEP!', who(a));
        sfx('slam');
        break;
      case 'standup':
        // the man underneath stands up in base (technical stand-up)
        if (e.name === 'bottom') arena.play(a, 'techUp', 0.45);
        sfx('squeak');
        break;
      case 'sub':
        callout('SUBMISSION ATTEMPT!', who(a));
        sfx('strain');
        sfx('crowd');
        break;
      case 'escape':
        callout('ESCAPED!', who(a));
        sfx('scramble');
        break;
      case 'foul':
        callout(`${(e.name ?? 'FOUL').toUpperCase()}!`);
        arena.play(d, 'hurt', 1.2);
        sfx('snap');
        if (d === P) buzz('hurt');
        break;
      case 'deduction':
        callout('POINT DEDUCTED');
        sfx('crowd');
        break;
      case 'injury':
        callout('INJURY!', who(d));
        arena.play(a, 'hurt', 0.8);
        sfx('snap');
        if (a === P) buzz('hurtBig');
        break;
      case 'doctor':
        callout('DOCTOR!');
        sfx('crowd');
        break;
      case 'cut':
        // (the line's side is the man who opened it; the arena bleeds the other one)
        arena.cue({ round: L.round, t: 0, text: '', side: d, intensity: 1, act: 'cut', pos: 'stand', hp: [L.F[0].hp, L.F[1].hp] }, true);
        callout(a === P && !o.versus ? "YOU'RE CUT!" : 'HE IS CUT!', who(d));
        break;
      case 'ko':
        arena.floor(d, 'ko', L.result?.detail ?? '');
        callout('KNOCKOUT!', who(a), 5);
        arena.flash = 0.6;
        arena.slowMo(1.6);
        sfx('roar');
        buzz('kd');
        break;
      case 'tko':
        arena.over(a);
        callout("IT'S STOPPED!", who(a), 5);
        sfx('roar');
        break;
      case 'tap':
        arena.over(a, L.sub ? { name: L.sub.name, atk: L.sub.atk } : undefined);
        callout('TAP! TAP! TAP!', who(a), 5);
        sfx('tap');
        sfx('roar');
        break;
      case 'bell':
        sfx('bell');
        break;
    }
  };

  // ------------------------------------------------------------ flow

  const corner = () => {
    const f = P === 0 ? o.A : o.B;
    const me = L.F[P];
    const rep: CornerReport = { round: L.round, side: P, coach: me.hp < 40 ? "You're hurt. Hands up, move your head, and stop trading." : L.F[O].gas < 40 ? "He's tired. Go to the body, then go upstairs." : 'Good round. Keep that jab in his face.', cutman: '', hp: Math.round(me.hp), cut: me.cut, injury: null, quit: false, scoreGuess: scoreGuess() };
    openCorner(g, f, rep, o.cutTier, L.round, (aid, plan) => {
      auto.plan = plan;
      L.nextRound([P === 0 ? aid : 0.5, P === 1 ? aid : 0.5]);
      if ((L.phase as string) === 'over') {
        // the doctor stopped it in the corner
        for (const e of L.events) handle(e);
        flushCallout();
        L.events.length = 0;
        sayLine(L.log[L.log.length - 1]?.text ?? '');
        setPadUiMode('game');
        return;
      }
      arena.manual = [L.F[0].x, L.F[1].x];
      arena.manualRound();
      setPadUiMode('game');
      fi.reset();
      fi2?.reset();
      pad?.clearLatch();
      primed2 = false;
      primed = false;
      freeze = 1.4;
      arena.showCallout(`ROUND ${L.round}`);
    });
  };

  const scoreGuess = (): string => {
    const { rounds } = L.cards();
    let a = 0;
    let b = 0;
    for (const r of rounds) {
      a += r[0][0];
      b += r[0][1];
    }
    const mine = P === 0 ? a : b;
    const theirs = P === 0 ? b : a;
    return mine > theirs ? `up ${mine}-${theirs}` : mine < theirs ? `down ${mine}-${theirs}` : `even ${mine}-${theirs}`;
  };

  const showResult = () => {
    resultShown = true;
    const r = L.toResult(o.judges, o.referee);
    const won = r.winner === (P === 0 ? o.A.id : o.B.id);
    const lost = r.loser === (P === 0 ? o.A.id : o.B.id);
    const fr = new Container();
    const bw = 300;
    const bh = r.method === 'DEC' || r.method === 'DRAW' ? 92 : 70;
    const bx = (FW - bw) / 2;
    const by = 40;
    fr.addChild(box(bw, bh, PAL.night, won ? PAL.gold : PAL.slate, { bevel: true })).position.set(bx, by);
    fr.addChild(text(won ? 'YOU WIN' : lost ? 'YOU LOSE' : 'DRAW', bx, by + 8, { width: bw, align: 'center', color: won ? PAL.gold : lost ? PAL.blood : PAL.bone, scale: 2 }));
    fr.addChild(text(`${r.method} (${r.detail}), round ${r.round} at ${r.time}`, bx, by + 30, { width: bw, align: 'center', small: true, color: PAL.bone }));
    if (r.method === 'DEC' || r.method === 'DRAW') fr.addChild(text(r.scores.map((s, i) => `${r.judges[i]} ${s[0]}-${s[1]}`).join('   '), bx + 8, by + 42, { width: bw - 16, align: 'center', small: true, color: PAL.ash, maxLines: 2 }));
    fr.addChild(text(`Strikes ${r.stats.strikes[0]}-${r.stats.strikes[1]}   Takedowns ${r.stats.takedowns[0]}-${r.stats.takedowns[1]}   Knockdowns ${r.stats.knockdowns[0]}-${r.stats.knockdowns[1]}`, bx + 8, by + bh - 34, { width: bw - 16, align: 'center', small: true, color: PAL.ash }));
    fr.addChild(button('CONTINUE', bx + bw / 2 - 40, by + bh - 20, 80, 14, () => close(r), { small: true, fill: PAL.moss }));
    if (touchUi) {
      // phones: bigger, over the cage (the HUD panel stays visible under it)
      fr.pivot.set(bx + bw / 2, by + bh / 2);
      fr.scale.set(1.4);
      fr.position.set(Math.round(FW / 2), Math.round(Math.max(by + bh * 0.7, 6 + bh * 0.7)));
    }
    root.addChild(fr);
    setPadUiMode('cursor');
  };

  let closed = false;
  const close = (r: FightResult) => {
    if (closed) return;
    closed = true;
    g.closeModal(wrap);
    o.done(r);
  };

  /** Let both AIs finish it in an instant (your corner does the cutman work at an average level). */
  const simRest = () => {
    if (resultShown || L.phase === 'over') return;
    auto.plan = o.plan;
    let steps = 0;
    while ((L.phase as string) !== 'over' && steps < 200000) {
      if (L.phase === 'break') L.nextRound([0.55, 0.5]);
      const a = auto.update(L, 1 / 30);
      const b = ai.update(L, 1 / 30);
      const intents: [FightIntent[], FightIntent[]] = P === 0 ? [a.intents, b.intents] : [b.intents, a.intents];
      const moves: [number, number] = P === 0 ? [a.move, b.move] : [b.move, a.move];
      L.update(1 / 30, intents, moves);
      auto.noteEvents(L);
      ai.noteEvents(L);
      L.events.length = 0;
      steps++;
    }
    const w = L.result?.winner ?? -1;
    if (L.result && (L.result.method === 'KO' || L.result.method === 'TKO') && w >= 0) arena.floor((1 - w) as Side, 'ko');
    arena.over(w as Side | -1);
    freeze = 0;
    endT = 99;
  };

  let pauseWrap: Container | null = null;
  const pause = () => {
    paused = true;
    setPadUiMode('cursor');
    const fr = new Container();
    const bw = 200;
    const bh = 148;
    const bx = (W - bw) / 2;
    const by = (H - bh) / 2;
    fr.addChild(box(bw, bh, PAL.night, PAL.gold, { bevel: true })).position.set(bx, by);
    fr.addChild(text('PAUSED', bx, by + 6, { width: bw, align: 'center', color: PAL.gold }));
    const resume = () => {
      if (pauseWrap) g.closeModal(pauseWrap);
      pauseWrap = null;
      paused = false;
      setPadUiMode('game');
      pad?.clearLatch();
      fi.reset();
      fi2?.reset();
      primed2 = false;
      primed = false;
    };
    fr.addChild(button('RESUME', bx + 10, by + 20, bw - 20, 14, resume, { small: true, fill: PAL.moss }));
    fr.addChild(button('HELP: HOW TO FIGHT', bx + 10, by + 38, bw - 20, 14, () => openHelp(g, 'fight'), { small: true, fill: PAL.gold }));
    const y2 = by + 18;
    fr.addChild(button(autopilot ? 'TAKE BACK CONTROL' : 'AUTOPILOT (AI FIGHTS FOR YOU)', bx + 10, y2 + 38, bw - 20, 14, () => {
      autopilot = !autopilot;
      resume();
    }, { small: true, fill: PAL.steel }));
    fr.addChild(button('CONTROLS', bx + 10, y2 + 56, (bw - 24) / 2, 14, () => openFightLab(g), { small: true, fill: PAL.slate }));
    fr.addChild(button(`CAMERA: ${(g.settings.fightCam ?? 'side').toUpperCase()}`, bx + 14 + (bw - 24) / 2, y2 + 56, (bw - 24) / 2, 14, () => {
      cycleCam();
      resume();
    }, { small: true, fill: PAL.slate }));
    fr.addChild(button('HANDS-ON FIGHTS: ' + (g.settings.handsOn === false ? 'OFF' : 'ON'), bx + 10, y2 + 74, bw - 20, 14, () => {
      g.settings.handsOn = g.settings.handsOn === false;
      g.applySettings();
      // switching off mid-fight: the AI finishes this one for you
      if (g.settings.handsOn === false) autopilot = true;
      resume();
      g.toast(g.settings.handsOn === false ? 'Hands-on fights off: future fights use the sim. The AI finishes this one.' : 'Hands-on fights on.', PAL.gold, { small: true });
    }, { small: true, fill: PAL.shadow }));
    fr.addChild(button('SIM THE REST OF THE FIGHT', bx + 10, y2 + 92, bw - 20, 14, () => {
      resume();
      simRest();
    }, { small: true, fill: PAL.blood }));
    fr.addChild(text('Hands-on fights can also be turned off in Settings', bx + 6, y2 + 112, { width: bw - 12, align: 'center', small: true, color: PAL.ash }));
    pauseWrap = g.modal(fr, { dim: 0.6 });
    // however the menu goes away, the fight carries on
    pauseWrap.once('destroyed', () => {
      pauseWrap = null;
      if (!paused || closed) return;
      paused = false;
      setPadUiMode('game');
      fi.reset();
      fi2?.reset();
      primed2 = false;
      primed = false;
    });
  };

  const tick = (t: Ticker) => {
    if (closed) return;
    const dt = Math.min(0.05, t.deltaMS / 1000);
    realT += dt;
    rangeT -= dt;
    fumbleT -= dt;
    for (const i of SIDES) {
      hitFlash[i].t -= dt;
      combo[i].tagT -= dt;
      // the heart beats at his real rate; hurt or gassed, you feel yours
      const was = Math.floor(beat[i]);
      beat[i] += dt * (L.F[i].bpm / 60);
      if (i === P && Math.floor(beat[i]) !== was && !autopilot && !paused && stage === 'fight' && L.phase === 'fight' && (L.F[P].hp < 30 || L.F[P].gas < 12)) buzz('heartbeat');
    }
    if (skipCatch && stage !== 'tape' && stage !== 'intro') {
      skipCatch.destroy();
      skipCatch = null;
      skipBtn?.destroy({ children: true });
      skipBtn = null;
    }
    if (!paused && !resultShown && (input.buttonPressed('Menu') || input.buttonPressed('Start' as never)) && g.modals[g.modals.length - 1] === wrap) pause();
    if (!paused && input.buttonPressed('View') && g.modals[g.modals.length - 1] === wrap) cycleCam();
    // a modal on top (corner, pause, controls): the fight waits
    const onTop = g.modals[g.modals.length - 1] === wrap;
    lineT -= dt;
    boothT -= dt;
    if (feed && !feed.destroyed && S && EV) {
      bleetClock += dt;
      feed.update(dt);
      for (const q of bleetQ.filter((x) => x.at <= bleetClock)) {
        const b = makeBleet(S, EV, o.bout, q.sit, q.actor, new Rng((Math.random() * 1e9) | 0));
        if (b) feed.push(b);
      }
      for (let k = bleetQ.length - 1; k >= 0; k--) if (bleetQ[k].at <= bleetClock) bleetQ.splice(k, 1);
    }
    if (onTop && !paused && (stage === 'tape' || stage === 'intro')) {
      if (input.buttonPressed('A' as never)) endIntro();
      else if (stage === 'tape') {
        if (!tape || !tape.update(dt)) {
          tape?.destroy({ children: true });
          tape = null;
          stage = 'intro';
        }
      } else {
        annT -= dt;
        if (annT <= 0) {
          const line = intro[introIdx++];
          if (!line) endIntro();
          else {
            arena.introCue(line.corner, !!line.stage, line.text);
            say(line);
            if (/!!!$/.test(line.text)) sfx('roar');
            annT = line.stage ? 1.8 : 1.0 + line.text.length / 38;
          }
        }
      }
    } else if (onTop && !paused) {
      if (freeze > 0) {
        freeze -= dt;
        if (freeze <= 0.5 && freeze + dt > 0.5) {
          arena.showCallout('FIGHT!');
          sfx('bell');
        }
      } else if (L.phase === 'fight') {
        const ctx = L.context(P);
        const facing: 1 | -1 = P === 0 ? 1 : -1;
        const sample = sampleFight(input, fi.bindings, pad?.state(), facing, o.versus?.p1.pad, o.versus?.p1.kb ?? 'full');
        if (!primed) {
          primed = true;
          fi.prime(sample);
        }
        let mine: FightIntent[];
        let move: number;
        // the engine slows with the picture (hit-stop, the knockdown slow-mo); your hands keep real time
        const simDt = dt * (arena.hitStop > 0 ? 0.1 : 1) * (arena.isSlow() ? 0.3 : 1);
        const hum = fi.update(sample, dt, { facing, ...ctx });
        stickNow = stickDir(sample.move, facing);
        if (autopilot) {
          const r = auto.update(L, simDt);
          mine = r.intents;
          move = r.move;
        } else {
          mine = hum;
          move = sample.move.x;
          // still holding block after your own strike: the guard comes back up
          if (fi.isBlocking && !L.F[P].block && !L.F[P].act && L.pos !== 'ground') mine.push({ type: 'block', phase: 'start' });
          for (const it of hum) {
            if (it.type !== 'getupFumble') continue;
            fumbleT = 0.35;
            sfx('error');
            buzz('blocked');
          }
        }
        let them = ai.update(L, simDt);
        if (fi2 && o.versus) {
          // player two
          const f2: 1 | -1 = facing === 1 ? -1 : 1;
          const s2 = sampleFight(input, fi2.bindings, null, f2, o.versus.p2.pad, o.versus.p2.kb);
          if (!primed2) {
            primed2 = true;
            fi2.prime(s2);
          }
          const i2 = fi2.update(s2, dt, { facing: f2, ...L.context(O) });
          if (fi2.isBlocking && !L.F[O].block && !L.F[O].act && L.pos !== 'ground') i2.push({ type: 'block', phase: 'start' });
          them = { intents: i2, move: s2.move.x };
        }
        const intents: [FightIntent[], FightIntent[]] = P === 0 ? [mine, them.intents] : [them.intents, mine];
        const moves: [number, number] = P === 0 ? [move, them.move] : [them.move, move];
        const logLen = L.log.length;
        // a clinch, shot or taunt from the wrong range does nothing: say so (only if he was free to try)
        const free = !autopilot && !L.F[P].act && L.F[P].stun <= 0.15 && L.pos === 'stand' && L.F[0].down <= 0 && L.F[1].down <= 0;
        const dist0 = L.dist;
        L.update(simDt, intents, moves);
        if (free && mine.length) {
          let tried = '';
          for (const it of mine) if (it.type === 'clinch' || it.type === 'shoot' || it.type === 'taunt') tried = it.type;
          let answered = false;
          for (const e of L.events) if (e.side === P && (e.type === 'clinch' || e.type === 'shoot' || e.type === 'miss' || e.type === 'taunt')) answered = true;
          if (tried && !answered) {
            const far = (tried === 'clinch' && dist0 > 54) || (tried === 'shoot' && dist0 > 70);
            if (far || (tried === 'taunt' && dist0 < 46)) {
              rangeTag = far ? 'TOO FAR' : 'TOO CLOSE';
              rangeT = 0.6;
            }
          }
        }
        for (const e of L.events) handle(e);
        ai.noteEvents(L); // he learns what's landing on him
        auto.noteEvents(L); // and your autopilot learns too
        // he's worked out one of your habits: he says so (the counter is coming)
        if (ai.readN !== lastReadN) {
          lastReadN = ai.readN;
          if (!autopilot && !o.versus) callout(`HE'S READING YOUR ${ai.readNote.toUpperCase()}`, PAL.ember, 2);
        }
        flushCallout();
        L.events.length = 0;
        if (L.log.length > logLen) {
          for (const ln of L.log.slice(logLen)) react(ln);
          sayLine(L.log[L.log.length - 1].text);
        }
        if ((L.phase as string) === 'break') {
          arena.restInCorners();
          setTimeout(corner, 900);
        }
      } else if (L.phase === 'over' && !resultShown) {
        if (stage !== 'ceremony') {
          if (L.result?.method === 'DEC' || L.result?.method === 'DRAW') arena.over(L.result.winner);
          endT += dt;
          if (endT > 2.6) {
            if (S && EV) {
              // Juiced Butler reads it out
              const r = L.toResult(o.judges, o.referee);
              const b = { ...o.bout, result: r };
              cer = r.method === 'DEC' || r.method === 'DRAW' ? butlerDecision(S, EV, b, pseed).lines : butlerFinish(S, b, pseed);
              cerIdx = 0;
              annT = 0.6;
              stage = 'ceremony';
              arena.manual = null;
              arena.startCeremony();
              react({ ...L.log[L.log.length - 1], key: r.method === 'DEC' ? 'decision' : r.method === 'SUB' ? 'tap' : 'ko_live' });
            } else showResult();
          }
        } else {
          annT -= dt;
          if (annT <= 0) {
            const line = cer[cerIdx++];
            if (!line) {
              say(null);
              showResult();
            } else {
              arena.ceremonyCue(line.text);
              say(line);
              const last = cerIdx >= cer.length;
              if (last) {
                const w = L.result?.winner ?? -1;
                arena.raiseHand(w as 0 | 1 | -1);
                sfx('roar');
              }
              annT = last ? 3 : 1 + line.text.length / 40;
            }
          }
        }
      }
    }
    const fighting = stage === 'fight' && L.phase === 'fight';
    // the touch pad follows the fight (KNEE / TIE in the clinch, MASH in a submission, GET UP on the canvas)
    if (pad && fighting) {
      const c = L.context(P);
      pad.setMode(c.knockedDown ? 'down' : c.submission ? 'sub' : c.grounded ? 'ground' : c.clinch ? 'clinch' : 'stand');
      pad.vibrate = vib();
      padHints();
    }
    // a loaded punch: you see him coil, a click when the heavy is ready (once per hold)
    if (fighting && !autopilot && !paused) {
      for (let k = 0; k < 2; k++) {
        const held = fi.heldFor(k === 0 ? 'lead' : 'rear');
        if (held > FIGHT_TUNING.tapMax && !L.F[P].act && L.pos === 'stand' && L.F[P].down <= 0) arena.play(P, 'coil', 0.06);
        if (held >= FIGHT_TUNING.mediumMax && !loaded[k]) {
          loaded[k] = true;
          sfx('click');
          buzz('charged');
        }
        if (held <= 0) loaded[k] = false;
      }
    }
    // mirror the engine into the arena
    const mid = (L.F[0].x + L.F[1].x) / 2;
    if (stage === 'fight') arena.manual = L.pos === 'clinch' ? [mid - 6, mid + 6] : [L.F[0].x, L.F[1].x];
    arena.clinchTie = { dom: L.clinch.dom, tie: L.clinch.tie, fence: L.clinch.fence };
    arena.hp = [Math.max(0, L.F[0].hp), Math.max(0, L.F[1].hp)];
    arena.vitals = [{ gas: L.F[0].gas, cut: L.F[0].cut }, { gas: L.F[1].gas, cut: L.F[1].cut }];
    arena.round = L.round;
    arena.sec = 300 - (L.clock / 75) * 300;
    arena.reduceMotion = g.settings.reduceShake;
    arena.rangeGuide = autopilot || !fighting || L.pos !== 'stand' ? null : rangeSide;
    for (const i of SIDES) {
      const f = L.F[i];
      // strikes play on the engine's clock: full extension exactly when it lands
      const a = f.act;
      if (fighting && a && (a.kind === 'punch' || a.kind === 'kick' || a.kind === 'knee')) arena.drive(i, a.t, a.wind, a.rec);
      arena.getupProg[i] = f.getup;
      arena.stun[i] = f.stun;
      arena.counterGlow[i] = f.counterT;
      if (fighting && f.down > 0 && (L.rules.koRules ?? 'mma') !== 'mma') arena.refCount(i, L.countOf(i));
    }
    if (stage === 'fight' && (L.phase === 'fight' || L.phase === 'over')) arena.setMat(L.pos === 'ground' ? (L.top === 0 ? 'atop' : 'btop') : L.pos, L.gpos, L.sub);
    for (const i of SIDES) if (L.F[i].block && !L.F[i].act && L.phase === 'fight' && L.pos === 'stand') arena.play(i, L.F[1 - i].act?.target === 'body' ? 'blockBody' : 'block', 0.06);
    arena.update(dt);
    drawHud();
  };
  g.app.ticker.add(tick);
  wrap.once('destroyed', () => {
    g.inLiveFight = false;
    setPinchZoom(true);
    g.app.ticker.remove(tick);
    popKeys();
    setPadUiMode('cursor');
  });
  if (stage === 'fight') {
    arena.showCallout('ROUND 1');
    sfx('crowd');
  }
}
