/**
 * Arena lab: a test stage for the fight animation. One arena, two fighters, a scripted timeline
 * (strikes, defence, knockouts, ground work, a whole watched fight) with pause and frame stepping,
 * and a hook for automated checks (window.__arenaLab). Open with ?arenalab=<script>; ?fps=30 forces
 * the frame time, ?drive=1 throws the strikes on an engine clock like a hands-on fight, ?seed=N
 * picks the watched fight. Space pauses, '.' steps one 60th of a second, ESC closes.
 */
import { Container, type Ticker } from 'pixi.js';
import type { Game } from '../app';
import type { Fighter, TickerLine } from '../../core/types';
import { PAL } from '../../art/palette';
import { W, H, text, button, box } from '../kit';
import { ArenaView } from '../arena';
import { createNewGame } from '../../sim/newgame';
import { simulateFight } from '../../sim/fight';
import { content } from '../../core/content';
import { Rng } from '../../core/rng';

type Joint5 = 'haF' | 'haB' | 'ftB' | 'knB' | 'elB';
type Target = 'head' | 'body' | 'legs';
/** A hands-on strike as the lab throws it: the pose, what lands, and the engine's wind-up and recovery. */
interface LabStrike {
  pose: string;
  joint: Joint5;
  dur: number;
  target: Target;
  big: boolean;
  wind: number;
  rec: number;
  gap: number;
}
const STRIKES: LabStrike[] = [
  { pose: 'jab', joint: 'haF', dur: 0.26, target: 'head', big: false, wind: 0.09, rec: 0.13, gap: 48 },
  { pose: 'cross', joint: 'haB', dur: 0.26, target: 'head', big: true, wind: 0.14, rec: 0.2, gap: 46 },
  { pose: 'hook', joint: 'haB', dur: 0.26, target: 'head', big: false, wind: 0.17, rec: 0.24, gap: 40 },
  { pose: 'uppercut', joint: 'haB', dur: 0.26, target: 'head', big: true, wind: 0.17, rec: 0.26, gap: 38 },
  { pose: 'overhand', joint: 'haB', dur: 0.26, target: 'head', big: true, wind: 0.345, rec: 0.39, gap: 44 },
  { pose: 'body', joint: 'haB', dur: 0.26, target: 'body', big: false, wind: 0.16, rec: 0.24, gap: 44 },
  { pose: 'legkick', joint: 'ftB', dur: 0.4, target: 'legs', big: false, wind: 0.2, rec: 0.3, gap: 50 },
  { pose: 'bodykick', joint: 'ftB', dur: 0.4, target: 'body', big: true, wind: 0.24, rec: 0.34, gap: 52 },
  { pose: 'headkick', joint: 'ftB', dur: 0.4, target: 'head', big: true, wind: 0.31, rec: 0.42, gap: 52 },
  { pose: 'knee', joint: 'knB', dur: 0.3, target: 'body', big: false, wind: 0.2, rec: 0.3, gap: 36 },
];
const DEFENCE = ['roll', 'pull', 'lean', 'parry', 'check', 'blockBody', 'catchKick', 'slip', 'block', 'paw', 'shoulderFeint', 'levelFeint'];

export interface ArenaLab {
  arena: ArenaView;
  script: string;
  paused: boolean;
  /** lab time (seconds of frames stepped) */
  t: number;
  /** what happened, newest last */
  log: string[];
  /** the watched fight: lines cued, and the fight time it took */
  stats: { lines: number; fightT: number; done: boolean };
  step(n: number, dt: number): void;
  cue(line: TickerLine): void;
  play(i: 0 | 1, pose: string, dur: number): void;
  restart(script: string): void;
}

export function openArenaLab(g: Game, script: string): void {
  const s = g.state ?? createNewGame({ seed: 1, mode: 'career', difficulty: 'normal', promotionName: 'Lab', presidentName: 'Lab' });
  const query = location.search;
  const num = (k: string, d: number): number => {
    const m = query.match(new RegExp('[?&]' + k + '=([0-9.]+)'));
    return m ? Number(m[1]) : d;
  };
  const forcedFps = num('fps', 0);
  const drive = num('drive', 0) > 0;
  const seed = num('seed', 7);
  // two lightweights (a striker and a wrestler if there are some)
  const pool = Object.values(s.fighters).filter((f) => f.division === 'light').sort((a, b) => (a.id < b.id ? -1 : 1));
  const A: Fighter = pool.find((f) => !f.styles.includes('Wrestler')) ?? pool[0];
  const B: Fighter = pool.find((f) => f !== A && f.styles.includes('Wrestler')) ?? pool.find((f) => f !== A) ?? pool[1];

  const root = new Container();
  root.addChild(box(W, H, PAL.ink, undefined));
  const stage = new Container();
  stage.position.set(0, 14);
  root.addChild(stage);
  const title = text('', 6, 3, { small: true, color: PAL.gold });
  const status = text('', W - 206, 3, { small: true, color: PAL.ash, width: 200, align: 'right' });
  const logText = text('', 6, 170, { small: true, color: PAL.bone, width: 300, maxLines: 9 });
  root.addChild(title, status, logText);
  root.addChild(text('SPACE pause   . step   ESC close', 6, H - 10, { small: true, color: PAL.grey }));

  // the timeline: things to do at lab times, plus the strike being thrown right now
  let timeline: { at: number; run: () => void }[] = [];
  let active: { start: number; k: LabStrike; hit: boolean } | null = null;
  let watch: { lines: TickerLine[]; idx: number; timer: number; phase: 'fight' | 'corner' | 'card'; phaseT: number } | null = null;
  let n = 0;
  const lab: ArenaLab = {
    arena: new ArenaView(A, B, 3, { event: 'ARENA LAB', eventKey: 'arenalab' }),
    script,
    paused: false,
    t: 0,
    log: [],
    stats: { lines: 0, fightT: 0, done: false },
    step: (count: number, dt: number) => {
      for (let k = 0; k < count; k++) advance(dt);
    },
    cue: (line: TickerLine) => lab.arena.cue(line),
    play: (i: 0 | 1, pose: string, dur: number) => lab.arena.play(i, pose, dur),
    restart: (sc: string) => start(sc),
  };
  const note = (sx: string) => {
    lab.log.push(`${lab.t.toFixed(2)} ${sx}`);
    if (lab.log.length > 60) lab.log.shift();
    logText.setText(lab.log.slice(-9).join('\n'));
  };
  /** A fresh arena (side cam), the two of them squared up in the middle. */
  const fresh = (manual: boolean): ArenaView => {
    if (lab.arena && !lab.arena.destroyed) lab.arena.destroy({ children: true });
    const a = new ArenaView(A, B, 3, { event: 'ARENA LAB', eventKey: 'arenalab' });
    a.setMode('side');
    stage.addChild(a);
    lab.arena = a;
    if (manual) {
      a.manual = [240 - 24, 240 + 24];
      a.startFight();
      a.manualRound();
    }
    return a;
  };
  /** Squared up in the middle without a walk-out (watched mode: the lines play out on their own). */
  const squareUp = (a: ArenaView) => {
    a.startFight();
    a.manualRound();
    a.manual = null;
    a.settle();
  };
  const line = (act: string, side: 0 | 1 | -1, extra: Partial<TickerLine> = {}): TickerLine => {
    n++;
    return { round: 1, t: 10 + n, text: '', side, intensity: 2, act, pos: 'stand', hp: [90, 80], key: '', ...extra };
  };
  const at = (t: number, run: () => void) => timeline.push({ at: t, run });

  const start = (sc: string) => {
    lab.script = sc;
    lab.t = 0;
    lab.log = [];
    lab.stats = { lines: 0, fightT: 0, done: false };
    timeline = [];
    active = null;
    watch = null;
    title.setText(`ARENA LAB: ${sc.toUpperCase()}   ${A.last} v ${B.last}`);
    if (sc === 'defence') {
      const a = fresh(true);
      a.manual = [240 - 26, 240 + 26];
      const defend = (p: string) => {
        note(p);
        if (p === 'catchKick') {
          // a body kick, caught: the kicker hops, the defender cradles the shin
          lab.arena.play(0, 'bodykick', 0.4);
          lab.arena.blockFx(1, 'catch');
        } else {
          lab.arena.play(1, p, 0.5);
          if (p === 'parry') lab.arena.blockFx(1, 'parry');
          if (p === 'check') lab.arena.blockFx(1, 'check');
          if (p === 'block' || p === 'blockBody') lab.arena.blockFx(1, 'block');
        }
      };
      DEFENCE.forEach((p, k) => at(0.6 + k * 1.0, () => defend(p)));
    } else if (sc === 'ko') {
      // a knockdown and the rise, then each of the three ways out
      const segs: [string, Partial<TickerLine>][] = [
        ['kd', { key: 'knockdown', text: 'Down he goes!' }],
        ['ko', { key: 'ko_kick', text: 'Head kick! Lights out!', intensity: 3 }],
        ['ko', { key: 'ko_punch', text: 'A left hook and he folds!', intensity: 3 }],
        ['ko', { key: 'ko_punch', text: 'A shot to the body and he goes down on his face!', intensity: 3 }],
      ];
      segs.forEach(([act, extra], k) =>
        at(k * 7, () => {
          squareUp(fresh(false));
          note(`${act} ${extra.key}`);
          lab.arena.cue(line(act, 0, extra));
        }),
      );
      at(2.6, () => {
        note('getup');
        lab.arena.cue(line('getup', 1, { key: 'getup' }));
      });
    } else if (sc === 'ground') {
      at(0, () => squareUp(fresh(false)));
      at(0.4, () => {
        note('td');
        lab.arena.cue(line('td', 0, { key: 'takedown', pos: 'atop' }));
      });
      for (let k = 0; k < 3; k++)
        at(1.8 + k * 0.7, () => {
          note('gnp');
          lab.arena.cue(line('gnp', 0, { key: 'gnp', pos: 'atop', hp: [90, 50] }));
        });
      at(4.4, () => {
        note('sub');
        lab.arena.cue(line('sub', 0, { key: 'sub_attempt', pos: 'atop', text: 'He takes the back and sinks in the rear-naked choke!' }));
      });
      at(6.6, () => {
        note('tap');
        lab.arena.cue(line('tap', 0, { key: 'tap', pos: 'atop', text: 'He taps to the rear-naked choke!', intensity: 3 }));
      });
    } else if (sc === 'watch') {
      fresh(false);
      const all = content().officials;
      const r = simulateFight(A, B, { rounds: 3, judges: all.filter((o) => o.role === 'judge').slice(0, 3), referee: all.filter((o) => o.role === 'referee')[0], ticker: content().templates.ticker, keepTicker: true }, new Rng(seed));
      watch = { lines: (r.ticker ?? []).filter((l) => !l.speaker), idx: 0, timer: 0.6, phase: 'fight', phaseT: 0 };
      note(`${watch.lines.length} lines, ${r.method} R${r.round}`);
    } else {
      // strikes: thrown the hands-on way (the pose, then the hit at contact), 1.2 s apart
      fresh(true);
      STRIKES.forEach((k, idx) => {
        // square up at his range first, then throw
        at(0.1 + idx * 1.2, () => {
          lab.arena.manual = [240 - k.gap / 2, 240 + k.gap / 2];
        });
        at(0.6 + idx * 1.2, () => {
          lab.arena.play(0, k.pose, k.dur, 4);
          active = { start: lab.t, k, hit: false };
          note(k.pose);
        });
      });
    }
  };

  /** One frame of lab time: the timeline, the strike being thrown, the watched fight, then the arena. */
  const advance = (dt: number) => {
    lab.t += dt;
    const due = timeline.filter((e) => e.at <= lab.t);
    if (due.length) {
      timeline = timeline.filter((e) => e.at > lab.t);
      for (const e of due) e.run();
    }
    const a = lab.arena;
    if (active) {
      const tt = lab.t - active.start;
      const k = active.k;
      if (drive && tt <= k.wind + k.rec) a.drive(0, tt, k.wind, k.rec);
      // (this frame's update runs the pose's clock on by dt: the hit lands on the frame the shot arrives)
      if (!active.hit && tt + dt >= (drive ? k.wind : k.dur * 0.4)) {
        active.hit = true;
        a.strike(0, k.joint, k.big, false, k.target);
        note(`hit ${k.target}${k.big ? ' (big)' : ''}`);
      }
      if (tt > k.wind + k.rec + 0.2 && tt > k.dur) active = null;
    }
    if (watch && !lab.stats.done) tickWatch(dt);
    a.update(dt);
  };

  /** The watched fight, cued the way the fight night does it. */
  const tickWatch = (dt: number) => {
    const w = watch!;
    const a = lab.arena;
    if (w.phase === 'corner' || w.phase === 'card') {
      w.phaseT -= dt;
      if (w.phaseT > 0) return;
      if (w.phase === 'corner') {
        a.restInCorners();
        w.phase = 'card';
        w.phaseT = 2.5;
      } else w.phase = 'fight';
      return;
    }
    lab.stats.fightT += dt;
    if (a.busy()) return;
    w.timer -= dt;
    if (w.timer > 0) return;
    if (w.idx >= w.lines.length) {
      lab.stats.done = true;
      note('end');
      return;
    }
    const l = w.lines[w.idx++];
    a.cue(l);
    lab.stats.lines++;
    note(`${l.key ?? l.act}${l.side >= 0 ? ' ' + l.side : ''}`);
    w.timer = l.intensity >= 3 ? 1.6 : l.act === 'bell' ? 0.9 : 0.95;
    if (l.act === 'bell' && w.idx < w.lines.length) {
      w.phase = 'corner';
      w.phaseT = 2;
    }
  };

  start(script);
  (window as unknown as { __arenaLab?: ArenaLab }).__arenaLab = lab;
  const names = ['strikes', 'defence', 'ko', 'ground', 'watch'];
  names.forEach((sc, k) => root.addChild(button(sc.toUpperCase(), W - 62, 170 + k * 15, 56, 12, () => start(sc), { small: true })));

  let fpsT = 0;
  let frames = 0;
  let fps = 0;
  const tick = (tk: Ticker) => {
    const real = tk.deltaMS / 1000;
    fpsT += real;
    frames++;
    if (fpsT >= 1) {
      fps = Math.round(frames / fpsT);
      fpsT = 0;
      frames = 0;
    }
    if (!lab.paused) advance(forcedFps > 0 ? 1 / forcedFps : Math.min(0.05, real));
    status.setText(`${lab.paused ? 'PAUSED  ' : ''}T ${lab.t.toFixed(1)}  ${fps} FPS${watch ? `  LINES ${lab.stats.lines}` : ''}`);
  };
  const wrap = g.modal(root, { dim: 1, fit: false });
  const popKeys = g.pushKeyHandler((e) => {
    if (e.key === 'Escape') return false;
    if (e.key === ' ') lab.paused = !lab.paused;
    else if (e.key === '.') {
      lab.paused = true;
      lab.step(1, 1 / 60);
    }
    return true;
  });
  g.app.ticker.add(tick);
  wrap.once('destroyed', () => {
    g.app.ticker.remove(tick);
    popKeys();
  });
}
