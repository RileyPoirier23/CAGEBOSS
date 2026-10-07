/**
 * Hands-on fight (Fighter Mode): you control your fighter in real time, the opponent is
 * LiveAI. A full-screen overlay on top of the fight night card so the card scene keeps
 * its state. Arena on top, HUD below: heart rate (BPM), a body-damage outline, gas,
 * context-sensitive control prompts and a play-by-play line. Between rounds your cutman
 * works the face (the same corner mini game as the sim fights).
 *
 * Esc / MENU pauses: resume, autopilot (the AI fights for you), turn hands-on fights off.
 */
import { Container, Graphics, type Ticker } from 'pixi.js';
import type { Game } from './app';
import type { Bout, CornerReport, Fighter, FightResult, Skills } from '../core/types';
import { PAL } from '../art/palette';
import { W, H, text, button, box } from './kit';
import { ArenaView, AH } from './arena';
import { input } from '../core/input';
import { isTouchDevice } from '../core/platform';
import { FightInput, sampleFight, rumbleForHit, type FightIntent } from '../core/fightinput';
import { TouchFightPad } from './fightpad';
import { setPadUiMode } from './controller';
import { prompt } from './glyphs';
import { fighterPortrait } from './sprites';
import { sfx } from '../audio/sfx';
import { LiveFight, LiveAI, type LiveEvent, type Side } from '../sim/live';
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
  done: (r: FightResult) => void;
}

const PUNCH_POSE: Record<string, string> = { jab: 'jab', cross: 'cross', hook: 'hook', uppercut: 'uppercut', overhand: 'cross', elbow: 'elbow', knee: 'knee', legkick: 'legkick', kick: 'bodykick', headkick: 'headkick' };
const JOINT: Record<string, 'haF' | 'haB' | 'ftB' | 'knB' | 'elB'> = { jab: 'haF', cross: 'haB', hook: 'haF', uppercut: 'haB', overhand: 'haB', elbow: 'elB', knee: 'knB', legkick: 'ftB', kick: 'ftB', headkick: 'ftB', punch: 'haB' };

export function openLiveFight(g: Game, o: LiveFightOpts): void {
  const L = new LiveFight(o.A, o.B, o.skills[0], o.skills[1], o.bout.rounds, o.seed);
  (window as unknown as { __live?: LiveFight }).__live = L; // debug / automated testing hook
  const P = o.player;
  const O = (1 - P) as Side;
  const fi = new FightInput();
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
  const arena = new ArenaView(o.A, o.B, o.bout.rounds, { event: o.event, eventKey: o.bout.id });
  arena.manual = [L.F[0].x, L.F[1].x];
  arena.startFight();
  arena.manualRound();
  root.addChild(arena);
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
  hud.addChild(text((P === 0 ? 'YOU: ' : '') + o.A.last.toUpperCase(), 40, y0 + 3, { small: true, color: P === 0 ? PAL.gold : PAL.bone }));
  hud.addChild(text((P === 1 ? 'YOU: ' : '') + o.B.last.toUpperCase(), W - 140, y0 + 3, { small: true, color: P === 1 ? PAL.gold : PAL.bone, width: 100, align: 'right' }));

  const wrap = g.modal(root, { dim: 0 });
  setPadUiMode('game');
  const popKeys = g.pushKeyHandler((e) => {
    if (e.type !== 'keydown') return true;
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

  const prompts = (): [Parameters<typeof prompt>[0], string][] => {
    const ctx = L.context(P);
    if (ctx.knockedDown) return [[{ pad: 'LT', key: 'Q' }, 'THEN'], [{ pad: 'RT', key: 'E' }, 'IN RHYTHM TO GET UP']];
    if (ctx.submission) return [[{ pad: 'B', key: 'Space' }, ctx.submission === 'attack' ? 'MASH TO CRANK IT' : 'MASH TO ESCAPE'], [{ pad: 'LStick', key: 'WASD' }, 'ROTATE']];
    if (ctx.grounded) {
      const top = L.top === P;
      return top
        ? [[{ pad: 'RB', key: 'J' }, 'PUNCH'], [{ pad: 'A', key: 'L' }, '+ TOWARD: PASS'], [{ pad: 'B', key: 'Space' }, 'SUBMISSION']]
        : [[{ pad: 'A', key: 'L' }, '+ UP: STAND / AWAY: SWEEP'], [{ pad: 'LB', key: 'I' }, 'COVER UP'], [{ pad: 'B', key: 'Space' }, 'SUB']];
    }
    if (L.pos === 'clinch') return [[{ pad: 'RT', key: 'K' }, 'KNEE'], [{ pad: 'RB', key: 'J' }, 'ELBOW'], [{ pad: 'B', key: 'Space' }, 'HOLD: TRIP / BREAK']];
    if (ctx.beingShot) return [[{ pad: 'B', key: 'Space' }, 'TAP: SPRAWL!']];
    return [[{ pad: 'RB', key: 'J' }, 'LEAD'], [{ pad: 'RT', key: 'K' }, 'REAR'], [{ pad: 'A', key: 'L' }, 'KICK'], [{ pad: 'LB', key: 'I' }, 'BLOCK'], [{ pad: 'B', key: 'Space' }, 'CLINCH / SHOOT']];
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
    else {
      let px = 150;
      let py = y0 + 14;
      for (const [spec, label] of prompts()) {
        const c = prompt(spec, label, px, py);
        if (px + c.width > W - 150) {
          px = 150;
          py += 10;
          c.position.set(px, py);
        }
        dyn.addChild(c);
        px += Math.ceil(c.width) + 6;
      }
    }
    // play-by-play
    if (lineT > 0) dyn.addChild(text(lastLine, 8, H - 12, { small: true, color: PAL.bone, width: W - 16, align: 'center', maxLines: 1 }));
    else dyn.addChild(text('ESC / MENU: pause', 0, H - 11, { small: true, color: PAL.grey, width: W, align: 'center' }));
    // overlays: the count, submission struggle
    for (const i of [0, 1] as Side[]) {
      if (L.F[i].down <= 0) continue;
      dyn.addChild(text(`${L.countOf(i)}`, 0, 40, { width: W, align: 'center', color: PAL.bone, scale: 3, shadow: PAL.ink }));
      if (i === P && !autopilot) {
        hudG.rect(W / 2 - 60, 78, 120, 6).fill(PAL.night).rect(W / 2 - 59, 79, Math.round(118 * Math.min(1, L.F[i].getup)), 4).fill(PAL.gold);
        dyn.addChild(text('ALTERNATE LT / RT (Q / E) TO BEAT THE COUNT', 0, 88, { width: W, align: 'center', small: true, color: PAL.gold, shadow: PAL.ink }));
      }
    }
    if (L.sub) {
      const v = Math.max(0, Math.min(1, L.sub.prog));
      hudG.rect(W / 2 - 80, 30, 160, 8).fill(PAL.night).rect(W / 2 - 79, 31, Math.round(158 * v), 6).fill(L.sub.atk === P ? PAL.moss : PAL.blood);
      dyn.addChild(text(L.sub.name.toUpperCase(), 0, 20, { width: W, align: 'center', small: true, color: PAL.gold, shadow: PAL.ink }));
    }
  };

  // ------------------------------------------------------------ events -> animation

  const say = (s: string) => {
    lastLine = s;
    lineT = 3;
  };
  const handle = (e: LiveEvent) => {
    const a = e.side;
    const d = (1 - a) as Side;
    switch (e.type) {
      case 'punch':
      case 'kick':
        arena.play(a, PUNCH_POSE[e.name ?? 'jab'] ?? 'jab', e.type === 'kick' ? 0.4 : 0.26, 4);
        break;
      case 'hit':
      case 'counter': {
        if (e.name === 'knee' || e.name === 'elbow') arena.play(a, e.name, 0.3, 4);
        arena.strike(a, JOINT[e.name ?? 'punch'] ?? 'haB', !!e.big, L.F[d].hp < 55 && Math.random() < 0.5);
        sfx(e.name && /kick|knee/.test(e.name) ? 'kick' : 'punch');
        if (e.type === 'counter') arena.showCallout('COUNTER!');
        if (d === P) rumbleForHit(input, e.big ? 0.9 : 0.35);
        if (e.big) g.shake(e.type === 'counter' ? 3 : 2, 0.15);
        break;
      }
      case 'miss':
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
        sfx('roar');
        if (d === P) rumbleForHit(input, 1);
        break;
      case 'getup':
        arena.floor(a, 'up');
        sfx('crowd');
        break;
      case 'clinch':
        sfx('thud');
        break;
      case 'break':
        break;
      case 'shoot':
        arena.play(a, 'shoot', 0.45);
        break;
      case 'sprawl':
        arena.play(a, 'sprawl', 0.5);
        arena.play(d, 'shoot', 0.35);
        arena.showCallout('STUFFED!');
        break;
      case 'td':
        arena.play(a, 'shoot', 0.3);
        arena.play(d, 'lifted', 0.25);
        sfx('thud');
        arena.shakeT = 0.15;
        break;
      case 'gnp':
        arena.gnp();
        arena.strike(a, 'haB', !!e.big, L.F[d].hp < 50);
        sfx('punch');
        if (d === P) rumbleForHit(input, 0.4);
        break;
      case 'advance':
      case 'sweep':
        sfx('thud');
        break;
      case 'standup':
        break;
      case 'sub':
        arena.showCallout('SUBMISSION ATTEMPT!');
        break;
      case 'escape':
        arena.showCallout('ESCAPED!');
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
      arena.manual = [L.F[0].x, L.F[1].x];
      arena.manualRound();
      setPadUiMode('game');
      fi.reset();
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

  let pauseWrap: Container | null = null;
  const pause = () => {
    paused = true;
    setPadUiMode('cursor');
    const fr = new Container();
    const bw = 200;
    const bh = 112;
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
      primed = false;
    };
    fr.addChild(button('RESUME', bx + 10, by + 20, bw - 20, 14, resume, { small: true, fill: PAL.moss }));
    fr.addChild(button(autopilot ? 'TAKE BACK CONTROL' : 'AUTOPILOT (AI FIGHTS FOR YOU)', bx + 10, by + 38, bw - 20, 14, () => {
      autopilot = !autopilot;
      resume();
    }, { small: true, fill: PAL.steel }));
    fr.addChild(button('CONTROLS', bx + 10, by + 56, bw - 20, 14, () => openFightLab(g), { small: true, fill: PAL.slate }));
    fr.addChild(button('HANDS-ON FIGHTS: ' + (g.settings.handsOn === false ? 'OFF' : 'ON'), bx + 10, by + 74, bw - 20, 14, () => {
      g.settings.handsOn = g.settings.handsOn === false;
      g.applySettings();
      // switching off mid-fight: the AI finishes this one for you
      if (g.settings.handsOn === false) autopilot = true;
      resume();
      g.toast(g.settings.handsOn === false ? 'Hands-on fights off: future fights use the sim. The AI finishes this one.' : 'Hands-on fights on.', PAL.gold, { small: true });
    }, { small: true, fill: PAL.shadow }));
    fr.addChild(text('Also in Settings', bx, by + 94, { width: bw, align: 'center', small: true, color: PAL.ash }));
    pauseWrap = g.modal(fr, { dim: 0.6 });
    // however the menu goes away, the fight carries on
    pauseWrap.once('destroyed', () => {
      pauseWrap = null;
      if (!paused || closed) return;
      paused = false;
      setPadUiMode('game');
      fi.reset();
      primed = false;
    });
  };

  const tick = (t: Ticker) => {
    if (closed) return;
    const dt = Math.min(0.05, t.deltaMS / 1000);
    if (!paused && !resultShown && (input.buttonPressed('Menu') || input.buttonPressed('Start' as never)) && g.modals[g.modals.length - 1] === wrap) pause();
    // a modal on top (corner, pause, controls): the fight waits
    const onTop = g.modals[g.modals.length - 1] === wrap;
    lineT -= dt;
    if (onTop && !paused) {
      if (freeze > 0) {
        freeze -= dt;
        if (freeze <= 0.5 && freeze + dt > 0.5) {
          arena.showCallout('FIGHT!');
          sfx('bell');
        }
      } else if (L.phase === 'fight') {
        const ctx = L.context(P);
        const facing: 1 | -1 = P === 0 ? 1 : -1;
        const sample = sampleFight(input, fi.bindings, pad?.state(), facing);
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
        const them = ai.update(L, dt);
        const intents: [FightIntent[], FightIntent[]] = P === 0 ? [mine, them.intents] : [them.intents, mine];
        const moves: [number, number] = P === 0 ? [move, them.move] : [them.move, move];
        const logLen = L.log.length;
        L.update(dt, intents, moves);
        for (const e of L.events) handle(e);
        L.events.length = 0;
        if (L.log.length > logLen) say(L.log[L.log.length - 1].text);
        if ((L.phase as string) === 'break') {
          arena.restInCorners();
          setTimeout(corner, 900);
        }
      } else if (L.phase === 'over' && !resultShown) {
        if (L.result?.method === 'DEC' || L.result?.method === 'DRAW') arena.over(L.result.winner);
        endT += dt;
        if (endT > 2.6) showResult();
      }
    }
    // mirror the engine into the arena
    const mid = (L.F[0].x + L.F[1].x) / 2;
    arena.manual = L.pos === 'clinch' ? [mid - 6, mid + 6] : [L.F[0].x, L.F[1].x];
    arena.hp = [Math.max(0, L.F[0].hp), Math.max(0, L.F[1].hp)];
    arena.round = L.round;
    arena.sec = 300 - (L.clock / 75) * 300;
    if (L.phase === 'fight' || L.phase === 'over') arena.setMat(L.pos === 'ground' ? (L.top === 0 ? 'atop' : 'btop') : L.pos, L.gpos, L.sub);
    for (const i of [0, 1] as Side[]) if (L.F[i].block && !L.F[i].act && L.phase === 'fight' && L.pos === 'stand') arena.play(i, 'block', 0.06);
    arena.update(dt);
    drawHud();
  };
  g.app.ticker.add(tick);
  wrap.once('destroyed', () => {
    g.app.ticker.remove(tick);
    popKeys();
    setPadUiMode('cursor');
  });
  arena.showCallout('ROUND 1');
  sfx('crowd');
}
