/**
 * Fighter Mode corner: you are the cutman. Pick a tool, hold it on the
 * problem (cut, swelling) and keep the pressure inside the sweet spot until
 * it's handled. Better cutmen give more time and a wider sweet spot. Then
 * the coach asks what the plan is for the next round.
 */
import { Container, Graphics, Ticker, type FederatedPointerEvent } from 'pixi.js';
import type { Game } from './app';
import type { CornerReport, Fighter } from '../core/types';
import type { GamePlan } from '../sim/fight';
import { PAL } from '../art/palette';
import { W, H, text, box, button } from './kit';
import { fighterPortrait } from './sprites';
import { PLANS } from '../sim/fighter';
import { sfx } from '../audio/sfx';

type Tool = 'ice' | 'enswell' | 'gauze' | 'vaseline';
const TOOLS: { id: Tool; name: string; color: number }[] = [
  { id: 'ice', name: 'ICE PACK', color: 0x6fb3d9 },
  { id: 'enswell', name: 'ENSWELL', color: 0xb8b8c0 },
  { id: 'gauze', name: 'GAUZE + ADR.', color: 0xeeeeee },
  { id: 'vaseline', name: 'VASELINE', color: 0xe8c66a },
];

interface Problem { name: string; zone: [number, number, number, number]; tools: Tool[]; progress: number }

export function openCorner(
  g: Game, f: Fighter, rep: CornerReport | undefined, tier: number, round: number,
  done: (aid: number, plan: GamePlan) => void,
): void {
  const frame = new Container();
  const wrap = g.modal(frame, { dim: 0.75 });
  const bw = 420;
  const bh = 236;
  const bx = Math.round((W - bw) / 2);
  const by = Math.round((H - bh) / 2);
  frame.addChild(box(bw, bh, PAL.night, PAL.gold, { bevel: true })).position.set(bx, by);
  frame.addChild(text(`END OF ROUND ${round}: YOUR CORNER`, bx + 8, by + 6, { color: PAL.gold }));

  // problems from the corner report
  const hp = rep?.hp ?? 80;
  const cut = rep?.cut ?? 0;
  const probs: Problem[] = [];
  if (cut > 0) probs.push({ name: cut >= 4 ? 'Cut over the eye (bad)' : 'Cut over the eye', zone: [52, 34, 26, 10], tools: cut >= 4 ? ['gauze'] : ['gauze', 'vaseline'], progress: 0 });
  if (hp < 75) probs.push({ name: 'Swelling under the left eye', zone: [36, 50, 18, 12], tools: ['enswell', 'ice'], progress: 0 });
  if (hp < 50) probs.push({ name: 'Swelling under the right eye', zone: [74, 50, 18, 12], tools: ['enswell', 'ice'], progress: 0 });
  if (hp < 35) probs.push({ name: 'Busted nose', zone: [58, 60, 14, 14], tools: ['gauze', 'ice'], progress: 0 });

  const finishCoach = (aid: number) => {
    // coach: what's the plan?
    frame.removeChildren().forEach((c) => c.destroy({ children: true }));
    frame.addChild(box(bw, bh, PAL.night, PAL.gold, { bevel: true })).position.set(bx, by);
    frame.addChild(text(`ROUND ${round + 1}: WHAT'S THE PLAN?`, bx + 8, by + 6, { color: PAL.gold }));
    const verdict = aid >= 0.8 ? 'Corner work: perfect. He feels brand new.' : aid >= 0.5 ? 'Corner work: decent. Patched up, mostly.' : 'Corner work: rough. He\'s going out there leaking.';
    frame.addChild(text(verdict, bx + 8, by + 20, { small: true, color: aid >= 0.5 ? PAL.moss : PAL.ember }));
    frame.addChild(text(rep?.coach ? `Coach: "${rep.coach}"` : 'Coach: "Breathe. Listen to me."', bx + 8, by + 32, { small: true, width: bw - 16, color: PAL.bone, maxLines: 3 }));
    frame.addChild(text(rep?.scoreGuess ? `Cards: ${rep.scoreGuess}` : '', bx + bw - 120, by + 6, { small: true, color: PAL.ash }));
    PLANS.forEach((p, i) => {
      const x = bx + 8 + (i % 2) * 204;
      const y = by + 58 + Math.floor(i / 2) * 40;
      const c = new Container();
      c.position.set(x, y);
      c.addChild(button(p.name, 0, 0, 196, 16, () => { g.closeModal(wrap); sfx('click'); done(aid, p.id); }, { small: true, fill: p.id === 'survive' ? PAL.shadow : PAL.steel }));
      c.addChild(text(p.text, 2, 19, { small: true, width: 192, color: PAL.ash, maxLines: 2 }));
      frame.addChild(c);
    });
  };

  if (!probs.length) {
    frame.addChild(text('Not a mark on him. Water, deep breaths, and a slap on the cheek.', bx + 8, by + 24, { small: true, color: PAL.bone }));
    frame.addChild(button('TO THE COACH →', bx + bw - 108, by + bh - 22, 100, 15, () => finishCoach(0.9 + tier * 0.03), { small: true, fill: PAL.moss }));
    return;
  }

  // ---------------------------------------------------------------- the face
  const face = new Container();
  face.position.set(bx + 12, by + 24);
  frame.addChild(face);
  const por = fighterPortrait(f, 64, 'plain');
  por.scale.set(2);
  face.addChild(por);
  const marks = new Graphics();
  face.addChild(marks);
  const glove = new Graphics();
  face.addChild(glove);
  // hit area for pressing the tool onto the face
  const hit = new Graphics().rect(0, 0, 128, 128).fill({ color: 0xffffff, alpha: 0.001 });
  hit.eventMode = 'static';
  hit.cursor = 'crosshair';
  face.addChild(hit);

  // ---------------------------------------------------------------- side panel
  const sx = bx + 152;
  let tool: Tool = probs[0].tools[0];
  const toolBtns: Container[] = [];
  frame.addChild(text('TOOL (1-4)', sx, by + 22, { small: true, color: PAL.ash }));
  const drawTools = () => {
    toolBtns.forEach((b) => b.destroy({ children: true }));
    toolBtns.length = 0;
    TOOLS.forEach((t, i) => {
      const b = button(t.name, sx + (i % 2) * 128, by + 32 + Math.floor(i / 2) * 16, 124, 14, () => { tool = t.id; drawTools(); sfx('click'); }, { small: true, fill: tool === t.id ? PAL.moss : PAL.shadow });
      toolBtns.push(b);
      frame.addChild(b);
    });
  };
  drawTools();
  frame.addChild(text('PRESSURE: hold on the problem; stay in the green', sx, by + 70, { small: true, color: PAL.ash, width: 256 }));
  const meter = new Graphics();
  meter.position.set(sx, by + 80);
  frame.addChild(meter);
  const probList = new Container();
  probList.position.set(sx, by + 98);
  frame.addChild(probList);
  const timerTxt = text('', sx, by + bh - 18, { small: true, color: PAL.gold });
  frame.addChild(timerTxt);
  const hint = text('', bx + 12, by + 156, { small: true, width: 134, color: PAL.bone, maxLines: 5 });
  frame.addChild(hint);

  const band = 0.16 + tier * 0.06;
  const bandLo = 0.55 - band / 2;
  const bandHi = 0.55 + band / 2;
  let time = 10 + tier * 3;
  let pressure = 0;
  let holding = false;
  let px = -1;
  let py = -1;
  let over = false;
  let ended = false;
  const local = (e: FederatedPointerEvent) => {
    const p = face.toLocal(e.global);
    px = p.x;
    py = p.y;
  };
  hit.on('pointerdown', (e) => { holding = true; local(e); });
  hit.on('pointermove', (e) => local(e));
  hit.on('pointerup', () => (holding = false));
  hit.on('pointerupoutside', () => (holding = false));
  const keys = (e: KeyboardEvent) => {
    const i = ['1', '2', '3', '4'].indexOf(e.key);
    if (i >= 0) { tool = TOOLS[i].id; drawTools(); }
  };
  window.addEventListener('keydown', keys);

  const inZone = (pr: Problem) => px >= pr.zone[0] && px <= pr.zone[0] + pr.zone[2] && py >= pr.zone[1] && py <= pr.zone[1] + pr.zone[3];

  const render = () => {
    marks.clear();
    for (const pr of probs) {
      const [x, y, w, h] = pr.zone;
      const doneP = pr.progress >= 1;
      marks.rect(x, y, w, h).stroke({ color: doneP ? PAL.moss : 0xff4040, width: 1, alpha: doneP ? 0.6 : 0.6 + 0.4 * Math.sin(performance.now() / 150) });
    }
    glove.clear();
    if (px >= 0) {
      const tc = TOOLS.find((t) => t.id === tool)!.color;
      glove.circle(px, py, holding ? 5 : 4).fill({ color: tc, alpha: 0.9 }).stroke({ color: 0x1a1a1a, width: 1 });
    }
    meter.clear();
    meter.rect(0, 0, 256, 10).fill(0x221e26).stroke({ color: PAL.ash, width: 1 });
    meter.rect(256 * bandLo, 1, 256 * (bandHi - bandLo), 8).fill({ color: PAL.moss, alpha: 0.6 });
    meter.rect(2, 3, Math.max(0, 252 * pressure), 4).fill(over ? 0xff4040 : PAL.gold);
    probList.removeChildren().forEach((c) => c.destroy({ children: true }));
    probs.forEach((pr, i) => {
      const row = new Container();
      row.position.set(0, i * 20);
      row.addChild(text(`${pr.name}  [${pr.tools.map((t) => TOOLS.find((x) => x.id === t)!.name).join(' / ')}]`, 0, 0, { small: true, color: pr.progress >= 1 ? PAL.moss : PAL.bone, width: 256, maxLines: 1 }));
      row.addChild(new Graphics().rect(0, 10, 256, 5).fill(0x221e26).rect(0, 10, 256 * Math.min(1, pr.progress), 5).fill(pr.progress >= 1 ? PAL.moss : PAL.sky));
      probList.addChild(row);
    });
    timerTxt.setText(`TIME: ${Math.max(0, time).toFixed(1)}s`);
  };

  const close = () => {
    if (ended) return;
    ended = true;
    Ticker.shared.remove(tick);
    window.removeEventListener('keydown', keys);
    const aid = probs.reduce((a, p) => a + Math.min(1, p.progress), 0) / probs.length;
    finishCoach(Math.max(0.15, aid));
  };

  const tick = (tk: Ticker) => {
    const dt = tk.deltaMS / 1000;
    if (ended) return;
    time -= dt;
    // pressure climbs while you press, sinks when you let go
    pressure = Math.max(0, Math.min(1, pressure + (holding ? 0.75 : -1.2) * dt));
    over = pressure > bandHi;
    const target = probs.find((p) => p.progress < 1 && inZone(p));
    if (holding && target) {
      if (!target.tools.includes(tool)) hint.setText(`Wrong tool for that. Try ${target.tools.map((t) => TOOLS.find((x) => x.id === t)!.name).join(' or ')}.`);
      else if (pressure >= bandLo && pressure <= bandHi) {
        target.progress += dt * (0.42 + tier * 0.1);
        hint.setText('That\'s it. Hold it there.');
      } else if (over) {
        target.progress = Math.max(0, target.progress - dt * 0.25);
        hint.setText('Too hard! You\'re making it worse.');
      } else hint.setText('More pressure.');
    } else if (holding) hint.setText('Press on the marked problem.');
    else hint.setText('Pick a tool, then press and hold on a red box.');
    render();
    if (time <= 0 || probs.every((p) => p.progress >= 1)) close();
  };
  Ticker.shared.add(tick);
  render();
  frame.addChild(button('SKIP (AUTO)', bx + bw - 88, by + bh - 20, 80, 14, () => {
    for (const p of probs) p.progress = Math.max(p.progress, 0.3 + tier * 0.17);
    close();
  }, { small: true, fill: PAL.shadow }));
}
