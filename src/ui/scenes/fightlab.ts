/**
 * Fight controls lab: a debug overlay for the Fighter Mode action map. Shows the
 * live sticks / triggers / charge, which fight intents fire, and the binding table,
 * with toggles for the fight context (facing, grounded, being shot, submission,
 * knocked down) and the touch fight pad. Open with View -> Y on a controller, or
 * `__open.fightlab()` from the console. MENU / VIEW / ESC closes it.
 */
import { Container, Graphics, type Ticker } from 'pixi.js';
import type { Game } from '../app';
import { PAL } from '../../art/palette';
import { W, H, text, button, box } from '../kit';
import { checkbox } from '../widgets';
import { input } from '../../core/input';
import { isTouchDevice } from '../../core/platform';
import {
  FightInput, sampleFight, rumbleForHit, FIGHT_ACTIONS,
  type FightContext, type FightIntent, type FightButton,
} from '../../core/fightinput';
import { TouchFightPad } from '../fightpad';
import { setPadUiMode } from '../controller';
import { padGlyph, keyGlyph } from '../glyphs';

export function describeIntent(i: FightIntent): string {
  switch (i.type) {
    case 'punch': return `${i.weight.toUpperCase()} ${i.hand} ${i.punch} (${i.hold.toFixed(2)}s${i.pressure < 1 ? `, ${Math.round(i.pressure * 100)}%` : ''})${i.grounded ? ' [ground]' : ''}`;
    case 'block': return `block ${i.phase}`;
    case 'evade': return `${i.kind} (${i.source})`;
    case 'kick': return `${i.level} kick`;
    case 'ground': return `ground: ${i.move}`;
    case 'subTurn': return `sub ${i.role}: turn ${i.dir > 0 ? 'cw' : 'ccw'} (${i.turns})`;
    case 'mash': return `sub ${i.role}: mash ${i.rate.toFixed(1)}/s`;
    case 'getup': return `get up ${i.side} rhythm ${Math.round(i.rhythm * 100)}%`;
    case 'getupFumble': return 'get up FUMBLE (same trigger twice)';
    default: return i.type;
  }
}

export function openFightLab(g: Game): void {
  const fi = new FightInput();
  const ctx: FightContext = { facing: 1, grounded: false, beingShot: false, submission: null, knockedDown: false };
  const log: string[] = [];
  const root = new Container();
  root.addChild(box(W, H, PAL.ink, undefined));
  root.addChild(text('FIGHT CONTROLS LAB', 6, 4, { color: PAL.gold }));
  root.addChild(text('MENU / VIEW / ESC closes', W - 120, 5, { small: true, color: PAL.ash }));

  // context toggles
  const toggles: [string, (v: boolean) => void, boolean][] = [
    ['Facing right', (v) => (ctx.facing = v ? 1 : -1), true],
    ['Grounded', (v) => (ctx.grounded = v), false],
    ['Being shot on', (v) => (ctx.beingShot = v), false],
    ['Submission (attack)', (v) => (ctx.submission = v ? 'attack' : null), false],
    ['Knocked down', (v) => (ctx.knockedDown = v), false],
  ];
  toggles.forEach(([label, fn, v], i) => root.addChild(checkbox(6, 18 + i * 12, label, v, (x) => { fn(x); fi.reset(); })));

  // binding table
  const tbl = new Container();
  tbl.position.set(150, 16);
  root.addChild(tbl);
  const rows: FightButton[] = ['lead', 'rear', 'kick', 'block', 'grab', 'feint', 'evadeUp', 'getupLeft'];
  rows.forEach((b, i) => {
    const y = i * 11;
    const bind = fi.bindings[b];
    let x = 0;
    for (const p of bind.pad ?? []) {
      const gl = padGlyph(p);
      gl.position.set(x, y);
      tbl.addChild(gl);
      x += Math.ceil(gl.width) + 2;
    }
    for (const k of (bind.keys ?? []).slice(0, 1)) {
      const kg = keyGlyph(k.replace(/^Key/, '').replace(/^Arrow/, '').replace('ShiftLeft', 'SHIFT'));
      kg.position.set(Math.max(x, 18), y);
      tbl.addChild(kg);
    }
    tbl.addChild(text(FIGHT_ACTIONS[b].label + (b === 'evadeUp' ? ' (R-stick flick)' : ''), 50, y + 2, { small: true, color: PAL.bone }));
  });

  // live meters + log
  const live = new Graphics();
  root.addChild(live);
  const liveText = new Container();
  root.addChild(liveText);
  const logBox = new Container();
  logBox.position.set(300, 16);
  root.addChild(logBox);

  let pad: TouchFightPad | null = null;
  const setPad = (on: boolean) => {
    pad?.destroy({ children: true });
    pad = null;
    if (on) {
      pad = new TouchFightPad();
      root.addChild(pad);
    }
  };
  root.addChild(checkbox(6, 80, 'Touch fight pad', isTouchDevice(), (v) => setPad(v)));
  setPad(isTouchDevice());

  root.addChild(button('CLOSE', W - 46, H - 16, 40, 12, () => g.closeModal(wrap), { small: true, fill: PAL.blood }));

  const meter = (x: number, y: number, v: { x: number; y: number }, label: string) => {
    live.rect(x, y, 25, 25).fill(PAL.night).rect(x + 12, y, 1, 25).fill(PAL.shadow).rect(x, y + 12, 25, 1).fill(PAL.shadow);
    live.rect(x + 11 + Math.round(v.x * 11), y + 11 + Math.round(v.y * 11), 3, 3).fill(PAL.gold);
    liveText.addChild(text(label, x, y + 27, { small: true, color: PAL.ash }));
  };
  const bar = (x: number, y: number, w: number, v: number, color: number, label: string) => {
    live.rect(x, y, w, 4).fill(PAL.night).rect(x, y, Math.round(w * Math.max(0, Math.min(1, v))), 4).fill(color);
    liveText.addChild(text(label, x + w + 3, y - 1, { small: true, color: PAL.ash }));
  };

  let primed = false;
  const tick = (t: Ticker) => {
    const dt = t.deltaMS / 1000;
    if (input.buttonPressed('Menu') || input.buttonPressed('View')) {
      g.closeModal(wrap);
      return;
    }
    const s = sampleFight(input, fi.bindings, pad?.state(), ctx.facing);
    if (!primed) {
      primed = true;
      fi.prime(s); // the Y that opened the lab isn't a feint
    }
    const intents = fi.update(s, dt, ctx);
    for (const i of intents) {
      log.unshift(describeIntent(i));
      if (i.type === 'punch' && i.weight === 'heavy') rumbleForHit(input, 0.8);
    }
    log.length = Math.min(log.length, 16);
    live.clear();
    liveText.removeChildren().forEach((c) => c.destroy());
    meter(6, 96, s.move, 'MOVE');
    meter(40, 96, s.look, 'HEAD');
    bar(80, 98, 40, input.trigger('LT'), PAL.steel, 'LT');
    bar(80, 106, 40, input.trigger('RT'), PAL.blood, 'RT');
    bar(80, 114, 40, fi.heldFor('lead') / 0.6, PAL.gold, 'LEAD');
    bar(80, 122, 40, fi.heldFor('rear') / 0.6, PAL.ember, 'REAR');
    liveText.addChild(text('HELD: ' + ([...s.held].join(' ') || '-'), 6, 132, { small: true, color: PAL.fog, width: 280 }));
    liveText.addChild(text(`device: ${input.lastDevice}${input.connected ? '  pad: ' + input.padList()[0]?.id.slice(0, 40) : ''}`, 6, 140, { small: true, color: PAL.grey, width: 290 }));
    logBox.removeChildren().forEach((c) => c.destroy());
    logBox.addChild(text('INTENTS', 0, 0, { small: true, color: PAL.gold }));
    log.forEach((l, i) => logBox.addChild(text(l, 0, 9 + i * 8, { small: true, color: i === 0 ? PAL.bone : PAL.ash, maxLines: 1, width: 176 })));
  };

  const wrap = g.modal(root, { dim: 0.9 });
  setPadUiMode('game');
  // swallow keys (J/K/Space...) so the scene underneath doesn't react; Escape still closes
  const popKeys = g.pushKeyHandler((e) => e.key !== 'Escape');
  g.app.ticker.add(tick);
  wrap.once('destroyed', () => {
    g.app.ticker.remove(tick);
    popKeys();
    setPadUiMode('cursor');
  });
}
