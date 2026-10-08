/**
 * Hands-on fight (Fighter Mode): you control your fighter in real time, the opponent is
 * LiveAI. A full-screen overlay on top of the fight night card so the card scene keeps
 * its state. Arena on top, HUD below: heart rate (BPM), a body-damage outline, gas, where
 * the fight is (clinch tie, ground position) and a play-by-play line. No control prompts on
 * screen: HELP (pause menu) has the full move list. Between rounds your cutman works the face
 * (the same corner mini game as the sim fights).
 *
 * Esc / MENU pauses: resume, help, autopilot (the AI fights for you), turn hands-on fights off.
 */
import { Container, Graphics, type Ticker } from 'pixi.js';
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
import { W, H, text, button, box } from './kit';
import { ArenaView, AH, AW, type CanvasInfo } from './arena';
import { input } from '../core/input';
import { isTouchDevice } from '../core/platform';
import { FightInput, sampleFight, rumbleForHit, type FightIntent, type KeyboardShare } from '../core/fightinput';
import { TouchFightPad } from './fightpad';
import { setPadUiMode } from './controller';
import { fighterPortrait } from './sprites';
import { sfx } from '../audio/sfx';
import { LiveFight, LiveAI, GPOS_NAME, type LiveEvent, type LiveRules, type Side } from '../sim/live';
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

  const root = new Container();
  root.addChild(new Graphics().rect(0, 0, W, H).fill(0x0c0a10));
  const arena = new ArenaView(o.A, o.B, o.bout.rounds, { event: o.event, eventKey: o.bout.id, sponsors: o.sponsors, canvas: o.canvas, bare: o.bare, refLook: o.refLook });
  (window as unknown as { __liveArena?: ArenaView }).__liveArena = arena;
  arena.manual = [L.F[0].x, L.F[1].x];
  arena.startFight();
  arena.manualRound();
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
      root.addChild(tape);
      sfx('crowd');
    }
    if (g.settings.bleets !== false) {
      feed = new BleetFeed();
      feed.position.set(AW - 146, 36);
      root.addChild(feed);
    }
  }
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
  let pad: TouchFightPad | null = null;
  if (isTouchDevice()) {
    pad = new TouchFightPad();
    root.addChild(pad);
  }

  // static HUD: portraits and names
  const y0 = AH + 2;
  hud.addChild(box(W, H - AH, PAL.ink, PAL.shadow));
  hud.position.set(0, 0);
  hud.children[0].position.set(0, AH);
  const pA = fighterPortrait(o.A, 32, 'plain');
  pA.position.set(4, y0 + 4);
  const pB = fighterPortrait(o.B, 32, 'plain');
  pB.position.set(W - 36, y0 + 4);
  hud.addChild(pA, pB);
  const tag = (i: Side) => (o.versus ? (i === P ? 'P1: ' : 'P2: ') : i === P ? 'YOU: ' : '');
  hud.addChild(text(tag(0) + o.A.last.toUpperCase(), 40, y0 + 3, { small: true, color: P === 0 || o.versus ? PAL.gold : PAL.bone }));
  hud.addChild(text(tag(1) + o.B.last.toUpperCase(), W - 140, y0 + 3, { small: true, color: P === 1 || o.versus ? PAL.gold : PAL.bone, width: 100, align: 'right' }));

  const wrap = g.modal(root, { dim: 0 });
  g.inLiveFight = true;
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
    const col = (v: number) => (v > 70 ? PAL.moss : v > 40 ? PAL.gold : v > 20 ? PAL.ember : PAL.blood);
    const head = (f.hp / 100) * 100;
    // head
    hudG.rect(x + 5, y, 6, 6).fill(col(head));
    hudG.rect(x + 7, y + 6, 2, 1).fill(PAL.ash);
    // torso + arms
    hudG.rect(x + 3, y + 7, 10, 9).fill(col(f.body));
    hudG.rect(x, y + 7, 2, 8).fill(col((f.body + f.gas) / 2)).rect(x + 14, y + 7, 2, 8).fill(col((f.body + f.gas) / 2));
    // legs
    hudG.rect(x + 3, y + 17, 4, 9).fill(col(f.legs)).rect(x + 9, y + 17, 4, 9).fill(col(f.legs));
  };
  const heart = (x: number, y: number, i: Side) => {
    const f = L.F[i];
    const beat = (performance.now() / 1000) * (f.bpm / 60);
    const pulse = (beat % 1) < 0.18;
    const c = f.bpm > 165 ? PAL.blood : f.bpm > 135 ? PAL.ember : 0xd04050;
    const s = pulse ? 1 : 0;
    hudG.rect(x + 1 - s, y, 2 + s, 2).fill(c).rect(x + 4, y, 2 + s, 2).fill(c).rect(x - s, y + 1, 7 + s * 2, 2).fill(c).rect(x + 1, y + 3, 5, 1).fill(c).rect(x + 2, y + 4, 3, 1).fill(c).rect(x + 3, y + 5, 1, 1).fill(c);
    dyn.addChild(text(`${Math.round(f.bpm)} BPM`, x + 10, y - 1, { small: true, color: f.bpm > 165 ? PAL.blood : PAL.bone }));
  };
  const bar = (x: number, y: number, w: number, v: number, c: number, label: string, right = false) => {
    hudG.rect(x, y, w, 4).fill(PAL.night);
    const n = Math.round(w * Math.max(0, Math.min(1, v)));
    hudG.rect(right ? x + w - n : x, y, n, 4).fill(c);
    dyn.addChild(text(label, right ? x - 26 : x + w + 3, y - 2, { small: true, color: PAL.ash }));
  };

  /** Where the fight is, in words: no button prompts (HELP has those), just the state. */
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

  const drawHud = () => {
    hudG.clear();
    dyn.removeChildren().forEach((c) => c.destroy({ children: true }));
    // left / right panels
    for (const i of [0, 1] as Side[]) {
      const left = i === 0;
      const x = left ? 40 : W - 140;
      bodyOutline(left ? 12 : W - 28, y0 + 42, i);
      heart(x, y0 + 14, i);
      bar(left ? x : x + 26, y0 + 25, 50, L.F[i].gas / 100, PAL.steel, 'GAS', !left);
      bar(left ? x : x + 26, y0 + 31, 50, L.F[i].hp / 100, L.F[i].hp > 40 ? PAL.moss : PAL.blood, 'HEAD', !left);
    }
    // centre: clock + control prompts
    dyn.addChild(text(`ROUND ${L.round}/${L.rounds}   ${L.clockText()}`, 0, y0 + 3, { width: W, align: 'center', color: PAL.gold }));
    if (autopilot) dyn.addChild(text('AUTOPILOT (ESC to take over)', 0, y0 + 14, { width: W, align: 'center', small: true, color: PAL.ember }));
    const sit = situation();
    if (sit) {
      dyn.addChild(text(sit.text, 150, y0 + (autopilot ? 25 : 16), { width: W - 300, align: 'center', small: true, color: sit.color, maxLines: 2 }));
      // progress on the mat: your passing / escape work
      if (L.pos === 'ground' && !L.sub) {
        const v = Math.max(0, Math.min(1, L.top === P ? L.gprog : L.standProg));
        hudG.rect(W / 2 - 40, y0 + 38, 80, 3).fill(PAL.night).rect(W / 2 - 40, y0 + 38, Math.round(80 * v), 3).fill(PAL.gold);
      }
    }
    // the booth and the play-by-play, newest at the bottom
    if (stage === 'tape' || stage === 'intro') dyn.addChild(text('ENTER / A: SKIP THE INTROS', 0, H - 11, { small: true, color: PAL.grey, width: W, align: 'center' }));
    else {
      const speakers = content().commentary.speakers;
      const rows: { t: string; c: number }[] = booth.slice(-3).map((l) => ({ t: `{#${speakers[l.speaker!]?.color ?? 'c4a04a'}}${speakers[l.speaker!]?.short ?? l.speaker!.toUpperCase()}:{/} ${l.text}`, c: PAL.fog }));
      let yy = H - 12;
      if (lineT > 0) {
        dyn.addChild(text(lastLine, 112, yy, { small: true, color: PAL.gold, width: W - 224, align: 'center', maxLines: 1 }));
        yy -= 10;
      }
      for (const r of rows.reverse()) {
        const t = text(r.t, 112, 0, { small: true, color: r.c, width: W - 224, maxLines: 3 });
        yy -= t.textHeight - 6;
        t.y = yy;
        if (yy < y0 + 44) {
          t.destroy();
          break;
        }
        dyn.addChild(t);
        yy -= 10;
      }
    }
    // overlays: the count, submission struggle
    for (const i of [0, 1] as Side[]) {
      if (L.F[i].down <= 0) continue;
      const mma = (L.rules.koRules ?? 'mma') === 'mma';
      // MMA: no count. He's down: jump on him (any attack) or let him up. Bareknuckle and smokers count.
      if (!mma) dyn.addChild(text(`${L.countOf(i)}`, 0, 40, { width: W, align: 'center', color: PAL.bone, scale: 3, shadow: PAL.ink }));
      else if (i !== P && !autopilot) dyn.addChild(text('HE\'S DOWN! JUMP ON HIM!', 0, 48, { width: W, align: 'center', color: PAL.gold, scale: 2, shadow: PAL.ink }));
      if (i === P && !autopilot) {
        hudG.rect(W / 2 - 60, 78, 120, 6).fill(PAL.night).rect(W / 2 - 59, 79, Math.round(118 * Math.min(1, L.F[i].getup)), 4).fill(PAL.gold);
        dyn.addChild(text('GET UP!', 0, 88, { width: W, align: 'center', small: true, color: PAL.gold, shadow: PAL.ink }));
      }
    }
    if (L.sub) {
      const v = Math.max(0, Math.min(1, L.sub.prog));
      hudG.rect(W / 2 - 80, 30, 160, 8).fill(PAL.night).rect(W / 2 - 79, 31, Math.round(158 * v), 6).fill(L.sub.atk === P ? PAL.moss : PAL.blood);
      dyn.addChild(text(L.sub.name.toUpperCase(), 0, 20, { width: W, align: 'center', small: true, color: PAL.gold, shadow: PAL.ink }));
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
        if (e.name === 'knee' || e.name === 'elbow') arena.play(a, e.name, 0.3, L.pos === 'clinch' ? 1 : 4);
        arena.strike(a, JOINT[e.name ?? 'punch'] ?? 'haB', !!e.big, L.F[d].hp < 55 && Math.random() < 0.5, e.target === 'body');
        sfx(e.name && /kick|knee/.test(e.name) ? 'kick' : 'punch');
        if (e.type === 'counter') arena.showCallout('COUNTER!');
        if (d === P) rumbleForHit(input, e.big ? 0.9 : 0.35);
        if (e.big) g.shake(e.type === 'counter' ? 3 : 2, 0.15);
        break;
      }
      case 'miss':
        if (e.name === 'STAND AND BANG') {
          if (a === P) arena.showCallout('STAND AND BANG ONLY!');
          break;
        }
        sfx('whoosh');
        break;
      case 'block':
        arena.play(a, 'block', 0.25);
        sfx('thud');
        break;
      case 'parry':
        arena.play(a, 'block', 0.25);
        arena.showCallout('PARRY!');
        sfx('snap');
        break;
      case 'evade':
        arena.play(a, e.name === 'pull' ? 'block' : 'slip', 0.3);
        if (e.big && a === P) arena.showCallout(e.name === 'roll' ? 'ROLLED UNDER!' : 'SLIPPED!');
        break;
      case 'feint':
        arena.play(a, 'jab', 0.1, 3);
        break;
      case 'rocked':
        arena.play(a, 'rocked', 0.9);
        arena.showCallout('ROCKED!');
        sfx('crowd');
        break;
      case 'kd':
        arena.floor(d, 'down');
        arena.showCallout('KNOCKDOWN!');
        arena.flash = 0.3;
        arena.slowMo(1);
        sfx('slam');
        sfx('roar');
        if (d === P) rumbleForHit(input, 1);
        break;
      case 'pounce':
        arena.floor(d, 'up');
        arena.takedown(a, 'shoot');
        arena.showCallout(L.gpos === 'mount' ? 'MOUNT! FINISH IT!' : 'SIDE CONTROL! FINISH IT!');
        sfx('slam');
        sfx('roar');
        if (d === P) rumbleForHit(input, 0.8);
        break;
      case 'getup':
        arena.floor(a, 'up');
        sfx('crowd');
        break;
      case 'clinch':
        sfx('grapple');
        break;
      case 'tie':
        sfx('grapple');
        if (a === P) arena.showCallout(TIE_NAME[e.name as keyof typeof TIE_NAME] ?? 'TIE-UP');
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
        arena.showCallout('TRIPPED!');
        sfx('slam');
        break;
      case 'pass':
        arena.transition('pass', a);
        sfx('scuffle');
        if (e.name === 'back' || e.name === 'mount') arena.showCallout(e.name === 'back' ? 'TAKES THE BACK!' : 'FULL MOUNT!');
        break;
      case 'scramble':
        arena.transition('scramble', a);
        arena.showCallout('SCRAMBLE!');
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
        arena.showCallout('STUFFED!');
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
        arena.strike(a, 'haB', !!e.big, L.F[d].hp < 50);
        sfx('punch');
        if (d === P) rumbleForHit(input, 0.4);
        break;
      case 'advance':
        sfx('scuffle');
        break;
      case 'sweep':
        arena.transition('scramble', a);
        arena.showCallout('SWEEP!');
        sfx('slam');
        break;
      case 'standup':
        // the man underneath stands up in base (technical stand-up)
        if (e.name === 'bottom') arena.play(a, 'techUp', 0.45);
        sfx('squeak');
        break;
      case 'sub':
        arena.showCallout('SUBMISSION ATTEMPT!');
        sfx('strain');
        sfx('crowd');
        break;
      case 'escape':
        arena.showCallout('ESCAPED!');
        sfx('scramble');
        break;
      case 'foul':
        arena.showCallout(`${(e.name ?? 'FOUL').toUpperCase()}!`);
        arena.play(d, 'hurt', 1.2);
        sfx('snap');
        if (d === P) rumbleForHit(input, 0.6);
        break;
      case 'deduction':
        arena.showCallout('POINT DEDUCTED');
        sfx('crowd');
        break;
      case 'injury':
        arena.showCallout('INJURY!');
        arena.play(a, 'hurt', 0.8);
        sfx('snap');
        if (a === P) rumbleForHit(input, 0.8);
        break;
      case 'doctor':
        arena.showCallout('DOCTOR!');
        sfx('crowd');
        break;
      case 'cut':
        arena.cue({ round: L.round, t: 0, text: '', side: a, intensity: 1, act: 'cut', pos: 'stand', hp: [L.F[0].hp, L.F[1].hp] }, true);
        break;
      case 'ko':
        arena.floor(d, 'ko');
        arena.showCallout('KNOCKOUT!');
        arena.flash = 0.6;
        arena.slowMo(1.6);
        sfx('roar');
        break;
      case 'tko':
        arena.over(a);
        arena.showCallout("IT'S STOPPED!");
        sfx('roar');
        break;
      case 'tap':
        arena.over(a, L.sub ? { name: L.sub.name, atk: L.sub.atk } : undefined);
        arena.showCallout('TAP! TAP! TAP!');
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
    const bx = (W - bw) / 2;
    const by = 40;
    fr.addChild(box(bw, bh, PAL.night, won ? PAL.gold : PAL.slate, { bevel: true })).position.set(bx, by);
    fr.addChild(text(won ? 'YOU WIN' : lost ? 'YOU LOSE' : 'DRAW', bx, by + 8, { width: bw, align: 'center', color: won ? PAL.gold : lost ? PAL.blood : PAL.bone, scale: 2 }));
    fr.addChild(text(`${r.method} (${r.detail}), round ${r.round} at ${r.time}`, bx, by + 30, { width: bw, align: 'center', small: true, color: PAL.bone }));
    if (r.method === 'DEC' || r.method === 'DRAW') fr.addChild(text(r.scores.map((s, i) => `${r.judges[i]} ${s[0]}-${s[1]}`).join('   '), bx + 8, by + 42, { width: bw - 16, align: 'center', small: true, color: PAL.ash, maxLines: 2 }));
    fr.addChild(text(`Strikes ${r.stats.strikes[0]}-${r.stats.strikes[1]}   Takedowns ${r.stats.takedowns[0]}-${r.stats.takedowns[1]}   Knockdowns ${r.stats.knockdowns[0]}-${r.stats.knockdowns[1]}`, bx + 8, by + bh - 34, { width: bw - 16, align: 'center', small: true, color: PAL.ash }));
    fr.addChild(button('CONTINUE', bx + bw / 2 - 40, by + bh - 20, 80, 14, () => close(r), { small: true, fill: PAL.moss }));
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
        const hum = fi.update(sample, dt, { facing, ...ctx });
        if (autopilot) {
          const r = auto.update(L, dt);
          mine = r.intents;
          move = r.move;
        } else {
          mine = hum;
          move = sample.move.x;
        }
        let them = ai.update(L, dt);
        if (fi2 && o.versus) {
          // player two
          const f2: 1 | -1 = facing === 1 ? -1 : 1;
          const s2 = sampleFight(input, fi2.bindings, null, f2, o.versus.p2.pad, o.versus.p2.kb);
          if (!primed2) {
            primed2 = true;
            fi2.prime(s2);
          }
          them = { intents: fi2.update(s2, dt, { facing: f2, ...L.context(O) }), move: s2.move.x };
        }
        const intents: [FightIntent[], FightIntent[]] = P === 0 ? [mine, them.intents] : [them.intents, mine];
        const moves: [number, number] = P === 0 ? [move, them.move] : [them.move, move];
        const logLen = L.log.length;
        L.update(dt, intents, moves);
        for (const e of L.events) handle(e);
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
    // mirror the engine into the arena
    const mid = (L.F[0].x + L.F[1].x) / 2;
    if (stage === 'fight') arena.manual = L.pos === 'clinch' ? [mid - 6, mid + 6] : [L.F[0].x, L.F[1].x];
    arena.clinchTie = { dom: L.clinch.dom, tie: L.clinch.tie, fence: L.clinch.fence };
    arena.hp = [Math.max(0, L.F[0].hp), Math.max(0, L.F[1].hp)];
    arena.round = L.round;
    arena.sec = 300 - (L.clock / 75) * 300;
    if (stage === 'fight' && (L.phase === 'fight' || L.phase === 'over')) arena.setMat(L.pos === 'ground' ? (L.top === 0 ? 'atop' : 'btop') : L.pos, L.gpos, L.sub);
    for (const i of [0, 1] as Side[]) if (L.F[i].block && !L.F[i].act && L.phase === 'fight' && L.pos === 'stand') arena.play(i, 'block', 0.06);
    arena.update(dt);
    drawHud();
  };
  g.app.ticker.add(tick);
  wrap.once('destroyed', () => {
    g.inLiveFight = false;
    g.app.ticker.remove(tick);
    popKeys();
    setPadUiMode('cursor');
  });
  if (stage === 'fight') {
    arena.showCallout('ROUND 1');
    sfx('crowd');
  }
}
