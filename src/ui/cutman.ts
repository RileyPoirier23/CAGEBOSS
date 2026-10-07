/**
 * Fighter Mode corner (Bruisers-style): a full-screen close-up of your
 * fighter's battered face. Swelling and cuts are drawn on the face and
 * physically shrink / stop bleeding as you work them.
 *
 *   move tool   : mouse / left stick
 *   switch tool : 1-4, Q/E / LB, RB
 *   apply       : hold mouse, Space / Y
 *   refresh tool: R / X   (ice melts, gauze soaks through, the enswell warms up)
 *   skip        : B / Esc (auto, worse result)
 *
 * Better cutmen get more time and a wider pressure sweet spot. Then the coach
 * asks for the next round's gameplan.
 */
import { Container, Graphics, Ticker } from 'pixi.js';
import type { Game } from './app';
import type { CornerReport, Fighter, Wounds } from '../core/types';
import type { GamePlan } from '../sim/fight';
import { PAL } from '../art/palette';
import { W, H, text, box, button } from './kit';
import { portrait, portraitInputForFighter } from './sprites';
import { FACE_ANCHORS } from '../art/portrait';
import { PLANS } from '../sim/fighter';
import { input } from '../core/input';
import { setPadUiMode } from './controller';
import { prompt } from './glyphs';
import { sfx } from '../audio/sfx';

type Tool = 'ice' | 'enswell' | 'gauze' | 'vaseline';
const TOOLS: { id: Tool; name: string; call: string; wearRate: number }[] = [
  { id: 'enswell', name: 'ENSWELL', call: 'USE THE ENSWELL!', wearRate: 0.12 },
  { id: 'ice', name: 'ICE PACK', call: 'ICE IT!', wearRate: 0.2 },
  { id: 'gauze', name: 'GAUZE', call: 'GAUZE ON THE CUT, PRESS IT!', wearRate: 0.25 },
  { id: 'vaseline', name: 'VASELINE', call: 'GREASE IT UP!', wearRate: 0.15 },
];

type Kind = 'swelling' | 'cut' | 'nose';
interface Problem {
  zone: string;
  kind: Kind;
  x: number; // face-space (64x64 portrait) centre
  y: number;
  sev: number; // 0..1 remaining
  start: number;
  tools: Tool[];
}

const S = 4; // close-up scale
const FACE_X = 18;
const FACE_Y = -22;

/** Draw a small pixel icon for a tool (16x12). */
function toolIcon(t: Tool, active: boolean): Graphics {
  const g = new Graphics();
  g.rect(0, 0, 30, 22).fill(active ? 0x3a4a2a : 0x1c1a22).stroke({ color: active ? PAL.gold : 0x55505a, width: 1 });
  switch (t) {
    case 'enswell':
      g.roundRect(6, 7, 18, 7, 2).fill(0xb8bcc4).rect(6, 7, 18, 2).fill(0xe2e6ec).rect(12, 14, 6, 4).fill(0x4a4a52);
      break;
    case 'ice':
      g.roundRect(6, 5, 18, 12, 4).fill(0x6fb3d9).rect(8, 7, 6, 3).fill(0xcfeaf8).rect(13, 3, 4, 3).fill(0x3a6a8a);
      break;
    case 'gauze':
      g.rect(7, 5, 16, 12).fill(0xf2efe8).rect(7, 10, 16, 1).fill(0xd8d2c8).rect(14, 5, 1, 12).fill(0xd8d2c8);
      break;
    case 'vaseline':
      g.rect(9, 5, 12, 3).fill(0x2a5a9a).rect(8, 8, 14, 9).fill(0xe8d090).rect(10, 10, 4, 4).fill(0xf6ecc4);
      break;
  }
  return g;
}

export function openCorner(
  g: Game, f: Fighter, rep: CornerReport | undefined, tier: number, round: number,
  done: (aid: number, plan: GamePlan) => void,
): void {
  const frame = new Container();
  const wrap = g.modal(frame, { dim: 0.9 });
  setPadUiMode('game');

  // ---------------------------------------------------------------- damage from the corner report
  const hp = rep?.hp ?? 80;
  const cut = rep?.cut ?? 0;
  // make sure the anchors exist for this face
  const baseInp = portraitInputForFighter(f, 'corner');
  portrait({ ...baseInp, wounds: undefined }, 64).destroy({ children: true });
  const A = FACE_ANCHORS.get(f.id) ?? { eyeL: 25, eyeR: 38, eyeY: 27, browY: 23, noseY: 34, mouthY: 39, top: 9, chinY: 45 };
  const probs: Problem[] = [];
  if (hp < 80) probs.push({ zone: 'Left eye', kind: 'swelling', x: A.eyeL, y: A.eyeY + 2, sev: Math.min(1, (80 - hp) / 45 + 0.25), start: 0, tools: ['enswell', 'ice'] });
  if (cut > 0) probs.push({ zone: 'Right brow', kind: 'cut', x: A.eyeR + 2, y: A.browY, sev: Math.min(1, 0.35 + cut / 7), start: 0, tools: ['gauze', 'vaseline'] });
  if (hp < 55) probs.push({ zone: 'Right eye', kind: 'swelling', x: A.eyeR, y: A.eyeY + 2, sev: Math.min(1, (55 - hp) / 35 + 0.3), start: 0, tools: ['enswell', 'ice'] });
  if (hp < 40) probs.push({ zone: 'Nose', kind: 'nose', x: 31, y: A.noseY, sev: Math.min(1, (40 - hp) / 30 + 0.35), start: 0, tools: ['gauze', 'ice'] });
  for (const p of probs) p.start = p.sev;

  let answered = false;
  const finishCoach = (aid: number) => {
    setPadUiMode('cursor');
    Ticker.shared.remove(tick);
    window.removeEventListener('keydown', keyDown);
    window.removeEventListener('keyup', keyUp);
    // leave the face as treated for the rest of the fight
    f.wounds = woundsFrom(probs, true);
    frame.removeChildren().forEach((c) => c.destroy({ children: true }));
    const bw = 420;
    const bh = 236;
    const bx = Math.round((W - bw) / 2);
    const by = Math.round((H - bh) / 2);
    frame.addChild(box(bw, bh, PAL.night, PAL.gold, { bevel: true })).position.set(bx, by);
    frame.addChild(text(`ROUND ${round + 1}: WHAT'S THE PLAN?`, bx + 8, by + 6, { color: PAL.gold }));
    const verdict = aid >= 0.8 ? 'Corner work: perfect. He feels brand new.' : aid >= 0.5 ? 'Corner work: decent. Patched up, mostly.' : "Corner work: rough. He's going out there leaking.";
    frame.addChild(text(verdict, bx + 8, by + 20, { small: true, color: aid >= 0.5 ? PAL.moss : PAL.ember }));
    frame.addChild(text(rep?.coach ? `Coach: "${rep.coach}"` : 'Coach: "Breathe. Listen to me."', bx + 8, by + 32, { small: true, width: bw - 16, color: PAL.bone, maxLines: 3 }));
    if (rep?.scoreGuess) frame.addChild(text(`Cards: ${rep.scoreGuess}`, bx + bw - 120, by + 6, { small: true, color: PAL.ash }));
    PLANS.forEach((p, i) => {
      const x = bx + 8 + (i % 2) * 204;
      const y = by + 58 + Math.floor(i / 2) * 40;
      frame.addChild(button(p.name, x, y, 196, 16, () => { answered = true; g.closeModal(wrap); sfx('click'); done(aid, p.id); }, { small: true, fill: p.id === 'survive' ? PAL.shadow : PAL.steel }));
      frame.addChild(text(p.text, x + 2, y + 19, { small: true, width: 192, color: PAL.ash, maxLines: 2 }));
    });
  };

  // ---------------------------------------------------------------- scene
  const bg = new Graphics();
  bg.rect(0, 0, W, H).fill(0x0c0a10);
  for (let i = 0; i < 160; i++) bg.rect((i * 53) % W, (i * 31) % 140, 2, 2).fill({ color: [0xffffff, 0xd8c070, 0x8090c0][i % 3], alpha: 0.25 });
  // ropes
  for (const [y, c] of [[150, 0xb02020], [176, 0xe8e8e8], [202, 0x2040b0]] as const) bg.rect(0, y, W, 4).fill(c).rect(0, y + 4, W, 1).fill({ color: 0x000000, alpha: 0.4 });
  frame.addChild(bg);

  const faceLayer = new Container();
  faceLayer.position.set(FACE_X, FACE_Y);
  frame.addChild(faceLayer);
  let faceSprite: Container | null = null;
  let lastKey = '';
  const fx = new Graphics();
  faceLayer.addChild(fx);
  const drips: { x: number; y: number; vy: number; life: number }[] = [];

  const drawFace = () => {
    const wnd = woundsFrom(probs, false);
    const key = JSON.stringify(wnd);
    if (key === lastKey) return;
    lastKey = key;
    faceSprite?.destroy({ children: true });
    faceSprite = portrait({ ...baseInp, wounds: wnd }, 64, false);
    faceSprite.scale.set(S);
    faceLayer.addChildAt(faceSprite, 0);
  };

  // HUD
  const hud = new Container();
  frame.addChild(hud);
  const handG = new Graphics();
  frame.addChild(handG);
  // visuals never eat the clicks meant for the face
  handG.eventMode = 'none';
  hud.eventMode = 'none';
  faceLayer.eventMode = 'none';

  let tool: Tool = probs[0]?.tools[0] ?? 'enswell';
  const wear: Record<Tool, number> = { enswell: 1, ice: 1, gauze: 1, vaseline: 1 };
  const band = 0.2 + tier * 0.06;
  const bandLo = 0.55 - band / 2;
  const bandHi = 0.55 + band / 2;
  let time = 11 + tier * 3;
  let pressure = 0;
  let holdMouse = false;
  let holdKey = false;
  let refreshT = 0;
  let tx = W / 2;
  let ty = H / 2;
  let ended = false;
  let msg = '';

  const zoneScreen = (p: Problem) => ({ x: FACE_X + p.x * S, y: FACE_Y + p.y * S });

  const hit = new Graphics().rect(0, 0, W, H).fill({ color: 0xffffff, alpha: 0.001 });
  hit.eventMode = 'static';
  hit.cursor = 'none';
  hit.on('pointermove', (e) => { const p = frame.toLocal(e.global); tx = p.x; ty = p.y; });
  hit.on('pointerdown', (e) => { const p = frame.toLocal(e.global); tx = p.x; ty = p.y; holdMouse = true; });
  hit.on('pointerup', () => (holdMouse = false));
  hit.on('pointerupoutside', () => (holdMouse = false));
  frame.addChildAt(hit, 1);

  const setTool = (d: number) => {
    const i = TOOLS.findIndex((t) => t.id === tool);
    tool = TOOLS[(i + d + TOOLS.length) % TOOLS.length].id;
    sfx('click');
  };
  const refresh = () => {
    if (refreshT > 0) return;
    refreshT = 1.1;
    msg = 'Fresh one!';
  };
  const keyDown = (e: KeyboardEvent) => {
    const i = ['1', '2', '3', '4'].indexOf(e.key);
    if (i >= 0) tool = TOOLS[i].id;
    if (e.key === 'q' || e.key === 'Q') setTool(-1);
    if (e.key === 'e' || e.key === 'E') setTool(1);
    if (e.key === 'r' || e.key === 'R') refresh();
    if (e.code === 'Space' || e.key === 'f') holdKey = true;
    if (e.key === 'Escape') skip();
  };
  const keyUp = (e: KeyboardEvent) => {
    if (e.code === 'Space' || e.key === 'f') holdKey = false;
  };
  window.addEventListener('keydown', keyDown);
  window.addEventListener('keyup', keyUp);

  const close = () => {
    if (ended) return;
    ended = true;
    const aid = probs.length ? probs.reduce((a, p) => a + (p.start > 0 ? 1 - p.sev / p.start : 1), 0) / probs.length : 0.9 + tier * 0.03;
    finishCoach(Math.max(0.15, Math.min(1, aid)));
  };
  const skip = () => {
    for (const p of probs) p.sev *= 0.7 - tier * 0.12;
    close();
  };

  const drawHud = () => {
    hud.removeChildren().forEach((c) => c.destroy({ children: true }));
    hud.addChild(prompt({ pad: 'B', key: 'Esc' }, 'TO SKIP MINI GAME', 6, 6, PAL.bone));
    // tools
    TOOLS.forEach((t, i) => {
      const ic = toolIcon(t.id, t.id === tool);
      ic.position.set(6 + i * 34, 20);
      hud.addChild(ic);
      hud.addChild(new Graphics().rect(6 + i * 34, 43, 30, 2).fill(0x222).rect(6 + i * 34, 43, 30 * wear[t.id], 2).fill(wear[t.id] > 0.25 ? PAL.moss : PAL.blood));
    });
    hud.addChild(text(TOOLS.find((t) => t.id === tool)!.name, 6, 48, { small: true, color: PAL.gold }));
    // call-out banner
    const next = probs.find((p) => p.sev > 0.04);
    const want = next ? TOOLS.find((t) => t.id === next.tools[0])! : null;
    hud.addChild(new Graphics().rect(148, 18, 170, 16).fill({ color: 0x000000, alpha: 0.7 }).stroke({ color: 0x55505a, width: 1 }));
    hud.addChild(text(want ? want.call : 'ALL CLEAN!', 152, 22, { color: 0xff5ad0 }));
    // pressure & zone panel
    const px = W - 140;
    hud.addChild(new Graphics().rect(px - 4, 4, 138, 96).fill({ color: 0x0a0a14, alpha: 0.85 }).stroke({ color: 0x55505a, width: 1 }));
    hud.addChild(text('Pressure:', px, 8, { small: true, color: PAL.bone }));
    const pm = new Graphics();
    pm.rect(px, 18, 128, 10).fill(0x1d3a8a).stroke({ color: 0x000000, width: 1 });
    pm.rect(px + 128 * bandLo, 18, 128 * (bandHi - bandLo), 10).fill(0x2aa84a);
    pm.rect(px + 128 * pressure - 1, 16, 3, 14).fill(0xffffff);
    hud.addChild(pm);
    const near = nearest();
    const shown = near ?? next;
    if (shown) {
      hud.addChild(text(`Zone: ${shown.zone}`, px, 34, { small: true, color: PAL.bone }));
      hud.addChild(text(shown.kind === 'swelling' ? 'Swelling' : shown.kind === 'cut' ? 'Bleeding cut' : 'Busted nose', px, 44, { small: true, color: 0xd08af0 }));
      hud.addChild(new Graphics().rect(px, 54, 128, 7).fill(0x1c1426).rect(px, 54, 128 * shown.sev, 7).fill(0x9a3ac8));
    }
    probs.forEach((p, i) => hud.addChild(text(`${p.sev <= 0.04 ? '✓' : '•'} ${p.zone}`, px + (i % 2) * 66, 66 + Math.floor(i / 2) * 10, { small: true, color: p.sev <= 0.04 ? PAL.moss : PAL.ash })));
    hud.addChild(text(`TIME ${Math.max(0, time).toFixed(1)}`, px, 88, { small: true, color: time < 4 ? PAL.blood : PAL.gold }));
    if (msg) hud.addChild(text(msg, 148, 38, { small: true, color: PAL.bone, width: 170 }));
    // controls
    const cy = H - 44;
    hud.addChild(new Graphics().rect(0, cy - 4, 170, 48).fill({ color: 0x000000, alpha: 0.7 }));
    hud.addChild(prompt({ pad: 'LStick', key: 'Mouse' }, 'MOVE TOOL', 6, cy));
    hud.addChild(prompt({ pad: 'LB', key: 'Q/E' }, 'SWITCH TOOL', 6, cy + 10));
    hud.addChild(prompt({ pad: 'Y', key: 'Hold' }, 'APPLY PRESSURE', 6, cy + 20));
    hud.addChild(prompt({ pad: 'X', key: 'R' }, 'REFRESH TOOL', 6, cy + 30));
  };

  const nearest = (): Problem | null => {
    let best: Problem | null = null;
    let bd = 22;
    for (const p of probs) {
      if (p.sev <= 0.04) continue;
      const z = zoneScreen(p);
      const d = Math.hypot(z.x - tx, z.y - ty);
      if (d < bd) { bd = d; best = p; }
    }
    return best;
  };

  const drawFx = (dt: number) => {
    fx.clear();
    const t = performance.now() / 1000;
    for (const p of probs) {
      if (p.sev <= 0.02) continue;
      const cx = p.x * S;
      const cy = p.y * S;
      if (p.kind === 'swelling') {
        const r = 6 + p.sev * 12 + Math.sin(t * 3) * 0.6;
        fx.ellipse(cx, cy + 2, r * 1.15, r * 0.8).fill({ color: 0x6a2850, alpha: 0.35 + p.sev * 0.3 });
        fx.ellipse(cx - r * 0.25, cy - r * 0.1, r * 0.55, r * 0.35).fill({ color: 0xc87890, alpha: 0.35 * p.sev });
      } else {
        const len = 8 + p.sev * 10;
        fx.moveTo(cx - len / 2, cy + 2).lineTo(cx - len / 6, cy - 1).lineTo(cx + len / 6, cy + 1).lineTo(cx + len / 2, cy - 2).stroke({ color: 0x9c1010, width: 3 });
        fx.moveTo(cx - len / 2, cy + 1).lineTo(cx + len / 2, cy - 3).stroke({ color: 0xe03a3a, width: 1 });
        if (Math.random() < p.sev * dt * 9) drips.push({ x: cx + (Math.random() - 0.5) * len * 0.6, y: cy + 3, vy: 6 + Math.random() * 10, life: 2.5 });
      }
    }
    for (const d of drips) {
      d.y += d.vy * dt;
      d.vy += 18 * dt;
      d.life -= dt;
      fx.rect(Math.round(d.x), Math.round(d.y), 2, 3).fill({ color: 0xa01818, alpha: Math.min(1, d.life) });
    }
    for (let i = drips.length - 1; i >= 0; i--) if (drips[i].life <= 0) drips.splice(i, 1);
  };

  const drawHand = (pressing: boolean) => {
    handG.clear();
    const x = Math.round(tx);
    const y = Math.round(ty) + (pressing ? 2 : 0);
    const tc = { enswell: 0xb8bcc4, ice: 0x6fb3d9, gauze: 0xf2efe8, vaseline: 0xe8d090 }[tool];
    const GL = 0xd8cfbe; // latex glove
    const SH = 0xa89c88;
    // forearm in a dark sleeve, from the lower right
    handG.poly([x + 18, y + 18, x + 52, y + 54, x + 66, y + 44, x + 30, y + 8]).fill(0x24304a).stroke({ color: 0x0a0a0a, width: 1 });
    // palm / back of the hand
    handG.roundRect(x + 4, y - 2, 22, 20, 6).fill(GL).stroke({ color: 0x1a1a1a, width: 1 });
    handG.rect(x + 6, y + 12, 18, 4).fill(SH);
    // thumb wrapping the tool
    handG.roundRect(x + 2, y + 6, 10, 6, 3).fill(GL).stroke({ color: 0x1a1a1a, width: 1 });
    // the tool, pinched by the fingertips
    handG.roundRect(x - 8, y - 6, 16, 11, 2).fill(tc).stroke({ color: 0x1a1a1a, width: 1 });
    handG.rect(x - 6, y - 5, 8, 2).fill({ color: 0xffffff, alpha: 0.5 });
    // fingers over the tool
    for (let i = 0; i < 3; i++) handG.roundRect(x + 2 + i * 6, y - 8 + i, 6, 9, 3).fill(GL).stroke({ color: 0x1a1a1a, width: 1 });
    if (pressing && refreshT <= 0) handG.circle(x, y, 11).stroke({ color: 0xffffff, width: 1, alpha: 0.5 });
  };

  // automation hook (tests / tutorial): read the meter, list problems
  (window as unknown as { __corner?: unknown }).__corner = { get pressure() { return pressure; }, band: [bandLo, bandHi], probs, setHold: (v: boolean) => (holdKey = v) };
  const tick = (tk: Ticker) => {
    if (ended) return;
    const dt = Math.min(0.05, tk.deltaMS / 1000);
    input.update();
    // pad: move the tool, switch, refresh, skip
    const st = input.stick('left');
    tx = Math.max(0, Math.min(W, tx + st.x * 170 * dt));
    ty = Math.max(0, Math.min(H, ty + st.y * 170 * dt));
    if (input.buttonPressed('LB')) setTool(-1);
    if (input.buttonPressed('RB')) setTool(1);
    if (input.buttonPressed('X')) refresh();
    if (input.buttonPressed('B')) return skip();
    const pressing = holdMouse || holdKey || input.button('Y') || input.button('A');
    time -= dt;
    if (refreshT > 0) {
      refreshT -= dt;
      if (refreshT <= 0) { wear[tool] = 1; msg = ''; }
    }
    pressure = Math.max(0, Math.min(1, pressure + (pressing && refreshT <= 0 ? 0.6 : -0.8) * dt));
    const target = nearest();
    if (pressing && target && refreshT <= 0) {
      if (!target.tools.includes(tool)) msg = `Wrong tool for that. ${TOOLS.find((t) => t.id === target.tools[0])!.name}!`;
      else if (wear[tool] <= 0) msg = `The ${TOOLS.find((t) => t.id === tool)!.name.toLowerCase()} is done. Refresh it!`;
      else if (pressure > bandHi) {
        target.sev = Math.min(target.start, target.sev + dt * 0.12);
        msg = 'Too hard! You\'re making it worse.';
        if (Math.random() < dt * 4) input.rumble(0.3, 0.1, 80);
      } else if (pressure >= bandLo) {
        target.sev = Math.max(0, target.sev - dt * (0.32 + tier * 0.08) * (tool === target.tools[0] ? 1 : 0.7));
        wear[tool] = Math.max(0, wear[tool] - dt * TOOLS.find((t) => t.id === tool)!.wearRate);
        msg = 'That\'s it. Hold it there.';
      } else msg = 'More pressure!';
    } else if (pressing && !target) msg = 'Put it on the damage.';
    drawFace();
    drawFx(dt);
    drawHud();
    drawHand(pressing);
    if (time <= 0 || probs.every((p) => p.sev <= 0.04)) close();
  };

  if (!probs.length) {
    finishCoach(0.9 + tier * 0.03);
    return;
  }
  drawFace();
  Ticker.shared.add(tick);
  // closed from outside (Esc / back): stop the mini game and send him out with an average corner
  wrap.once('destroyed', () => {
    Ticker.shared.remove(tick);
    window.removeEventListener('keydown', keyDown);
    window.removeEventListener('keyup', keyUp);
    setPadUiMode('cursor');
    if (!answered) {
      answered = true;
      done(0.4, 'balanced');
    }
  });
}

/** Corner damage -> portrait wounds (treated cuts get bandaged). */
function woundsFrom(probs: Problem[], final: boolean): Wounds {
  const sw = probs.filter((p) => p.kind === 'swelling');
  const swell = sw.reduce((a, p) => a + p.sev, 0);
  const cutP = probs.find((p) => p.kind === 'cut');
  const nose = probs.find((p) => p.kind === 'nose');
  return {
    swelling: Math.min(3, Math.ceil(swell * 2)),
    blackEye: Math.min(2, sw.filter((p) => p.sev > 0.35).length),
    cuts: cutP ? (cutP.sev > 0.5 ? 2 : cutP.sev > 0.08 ? 1 : 0) : 0,
    bandages: cutP && cutP.sev <= 0.5 && (final || cutP.sev < cutP.start) ? 1 : 0,
    noseBleed: !!nose && nose.sev > 0.15,
  };
}
