/**
 * Road To Champion "moments": the screens between the weekly grind.
 *  - signing: moving up a league is a ceremony (banner, contract, sign it, confetti)
 *  - checkin: your coach / nutritionist / manager / cutman messages you
 *  - story: a beat of the storyline (with choices)
 *  - interview: a reporter wants a word (more often the more famous you are)
 */
import { Container, Graphics, type Ticker } from 'pixi.js';
import type { Game } from './app';
import type { GameState } from '../core/types';
import { PAL } from '../art/palette';
import { W, H, text, button, box, paper } from './kit';
import { alertBox } from './widgets';
import { fighterPortrait, npcPortrait, namedPortrait, reporterPortrait } from './sprites';
import { content } from '../core/content';
import { sfx } from '../audio/sfx';
import { openEndCredits } from './endcredits';
import { me } from '../sim/fighter';
import { answerStory, answerInterview, type FMMoment } from '../sim/fmstory';
import { playCutscene } from './cutscene';
import { storyScene } from './storyscenes';
import type { Rng } from '../core/rng';

const ROLE: Record<string, string> = { coach: 'HEAD COACH', nutrition: 'NUTRITIONIST', manager: 'MANAGER', cutman: 'CUTMAN' };

function speakerPortrait(who: string, size: 64 | 32, s?: GameState): Container {
  const rival = s?.fighters.rival;
  if (rival && /bleeter|vance|trust fund/i.test(who)) return fighterPortrait(rival, size);
  if (/bradie/i.test(who)) return namedPortrait('bradie_taylor', size) ?? npcPortrait(who, 'exec', size);
  if (/dane/i.test(who)) return npcPortrait('dane_whyte', 'exec', size);
  if (/ray/i.test(who)) return npcPortrait('uncle_ray_soup', 'manager', size);
  if (/producer/i.test(who)) return npcPortrait('lounge_producer', 'exec', size);
  return npcPortrait(who, 'manager', size);
}

/** Show one moment; `done` when it's dealt with. */
export function showMoment(g: Game, s: GameState, m: FMMoment, rng: () => Rng, done: () => void): void {
  switch (m.kind) {
    case 'signing':
      return signing(g, s, m, done);
    case 'checkin':
      return card(g, `MESSAGE  •  ${ROLE[m.who] ?? 'TEAM'}: ${m.name.toUpperCase()}`, m.text, npcPortrait(m.name, 'manager', 32), [{ id: 'ok', label: m.who === 'coach' ? 'YES COACH' : 'GOT IT' }], () => done(), PAL.sky);
    case 'story':
      return story(g, s, m, done);
    case 'credits':
      return openEndCredits(g, done);
    case 'interview': {
      const rep = content().reporters.find((r) => r.name === m.reporter);
      const face = rep ? reporterPortrait(rep, 32) : npcPortrait(m.reporter, 'fan', 32);
      return card(g, `${m.phase === 'pre' ? 'MEDIA DAY' : 'CAGESIDE'}  •  ${m.outlet.toUpperCase()}`, `${m.reporter}: "${m.q}"`, face, m.choices, (id) => {
        const out = answerInterview(s, m, id, rng());
        alertBox(g, 'THE CLIP', out, done);
      }, PAL.gold);
    }
  }
}

/** A message card with a portrait and buttons. */
function card(g: Game, title: string, body: string, face: Container, choices: { id: string; label: string }[], pick: (id: string) => void, accent: number): void {
  const frame = new Container();
  const wrap = g.modal(frame, { dim: 0.7 });
  const bw = 320;
  const t = text(body, 0, 0, { small: true, width: bw - 54, color: PAL.bone, maxLines: 9 });
  const many = choices.length > 1;
  const bh = Math.max(76, t.textHeight + 34 + (many ? choices.length * 17 : 20));
  const bx = (W - bw) / 2;
  const by = Math.round((H - bh) / 2);
  frame.addChild(box(bw, bh, PAL.night, accent, { bevel: true })).position.set(bx, by);
  face.position.set(bx + 8, by + 8);
  frame.addChild(face);
  frame.addChild(text(title, bx + 46, by + 6, { small: true, color: accent, width: bw - 54, maxLines: 1 }));
  t.position.set(bx + 46, by + 18);
  frame.addChild(t);
  choices.forEach((c, i) => {
    const y = many ? by + bh - 6 - (choices.length - i) * 17 : by + bh - 20;
    frame.addChild(button(c.label, many ? bx + 46 : bx + bw - 108, y, many ? bw - 54 : 100, 14, () => {
      sfx('click');
      g.closeModal(wrap);
      pick(c.id);
    }, { small: true, fill: i === 0 ? PAL.moss : PAL.steel }));
  });
}

function story(g: Game, s: GameState, m: Extract<FMMoment, { kind: 'story' }>, done: () => void): void {
  // the big beats are staged as cutscenes
  const scene = storyScene(s, m.id);
  if (scene) {
    return playCutscene(g, { ...scene, choices: m.choices }, (id) => {
      const out = id ? answerStory(s, m.id, id) : '';
      if (out) alertBox(g, m.title, out, done);
      else done();
    });
  }
  const frame = new Container();
  const wrap = g.modal(frame, { dim: 0.8 });
  const bw = 360;
  const t = text(m.text, 0, 0, { small: true, width: bw - 96, color: PAL.bone, maxLines: 12 });
  const ch = m.choices ?? [];
  const bh = Math.max(110, t.textHeight + 52 + (ch.length ? ch.length * 17 : 20));
  const bx = (W - bw) / 2;
  const by = Math.round((H - bh) / 2);
  frame.addChild(box(bw, bh, 0x120e14, PAL.gold, { bevel: true })).position.set(bx, by);
  frame.addChild(new Graphics().rect(bx + 1, by + 1, bw - 2, 11).fill(0x2a1a10));
  frame.addChild(text(m.chapter, bx + 6, by + 3, { small: true, color: PAL.ember }));
  const face = speakerPortrait(m.who, 64, s);
  face.position.set(bx + 8, by + 18);
  frame.addChild(face);
  frame.addChild(text((/bleeter/i.test(m.who) && s.fighters.rival ? `@${s.fighters.rival.last.toLowerCase()}_${s.fighters.rival.nick.replace(/\W/g, '').toLowerCase()}` : m.who).toUpperCase(), bx + 8, by + 84, { small: true, color: PAL.ash, width: 64, align: 'center', maxLines: 2 }));
  frame.addChild(text(m.title, bx + 82, by + 16, { color: PAL.gold, width: bw - 90, maxLines: 1 }));
  t.position.set(bx + 82, by + 30);
  frame.addChild(t);
  const finish = (id: string | null) => {
    g.closeModal(wrap);
    const out = id ? answerStory(s, m.id, id) : '';
    if (out) alertBox(g, m.title, out, done);
    else done();
  };
  if (ch.length) ch.forEach((c, i) => frame.addChild(button(c.label, bx + 82, by + bh - 6 - (ch.length - i) * 17, bw - 90, 14, () => { sfx('click'); finish(c.id); }, { small: true, fill: i === 0 ? PAL.moss : PAL.steel })));
  else frame.addChild(button('CONTINUE', bx + bw - 88, by + bh - 20, 80, 14, () => finish(null), { small: true, fill: PAL.moss }));
  sfx('click');
}

/** Moving up: the contract signing. Spotlights, the banner, the paper, your signature, confetti. */
function signing(g: Game, s: GameState, m: Extract<FMMoment, { kind: 'signing' }>, done: () => void): void {
  const root = new Container();
  const wrap = g.modal(root, { dim: 0.92 });
  const f = me(s);
  const fx = new Graphics();
  // spotlights
  const lights = new Graphics();
  for (let k = 0; k < 4; k++) lights.poly([60 + k * 120, 0, 20 + k * 120, H, 120 + k * 120, H]).fill({ color: [0xffe8a0, 0xa0c8ff, 0xffe8a0, 0xffa0a0][k], alpha: 0.05 });
  root.addChild(lights);
  const title = m.tier === 'amateur' ? 'YOUR FIRST CONTRACT' : m.tier === 'of' ? 'WELCOME TO THE CBFC' : `WELCOME TO THE ${m.short}`;
  root.addChild(text(title, 0, 10, { width: W, align: 'center', color: PAL.gold, scale: 2, shadow: PAL.ink }));
  root.addChild(text(m.league.toUpperCase(), 0, 30, { width: W, align: 'center', color: PAL.bone, shadow: PAL.ink }));
  root.addChild(text(m.blurb, 40, 42, { width: W - 80, align: 'center', small: true, color: PAL.ash, maxLines: 3 }));
  // you, and the promoter
  const pf = fighterPortrait(f, 64);
  pf.position.set(30, 92);
  root.addChild(pf);
  root.addChild(text(`${f.first} ${f.last}`.toUpperCase(), 14, 160, { small: true, color: PAL.bone, width: 96, align: 'center', maxLines: 2 }));
  const pp = speakerPortrait(m.promoter, 64);
  pp.position.set(W - 94, 92);
  root.addChild(pp);
  root.addChild(text(m.promoter.toUpperCase(), W - 112, 160, { small: true, color: PAL.bone, width: 100, align: 'center', maxLines: 2 }));
  // the contract
  const px = 124;
  const py = 74;
  const pw = W - 248;
  const ph = 156;
  const doc = paper(pw, ph, 'cream', s.week + 7);
  doc.position.set(px, py);
  root.addChild(doc);
  root.addChild(text('PROMOTIONAL AGREEMENT', px, py + 6, { width: pw, align: 'center', color: PAL.ink }));
  m.terms.forEach(([k, v], i) => {
    root.addChild(text(k.toUpperCase(), px + 10, py + 22 + i * 12, { small: true, color: 0x6a5a4a }));
    root.addChild(text(v, px + 84, py + 22 + i * 12, { small: true, color: PAL.ink, width: pw - 94, maxLines: 1 }));
  });
  const sy = py + ph - 24;
  root.addChild(new Graphics().rect(px + 20, sy + 10, pw - 40, 1).fill(PAL.ink));
  root.addChild(text('FIGHTER SIGNATURE', px + 20, sy + 13, { small: true, color: 0x6a5a4a }));
  const sig = new Graphics();
  root.addChild(sig);
  root.addChild(fx);
  let signT = -1;
  let t = 0;
  const parts: { x: number; y: number; vx: number; vy: number; c: number; life: number }[] = [];
  const btn = button('SIGN IT', px + pw / 2 - 40, py + ph + 8, 80, 16, () => {
    if (signT >= 0) return;
    signT = 0;
    btn.visible = false;
    sfx('click');
  }, { fill: PAL.blood });
  root.addChild(btn);
  const go = button("LET'S GO", W / 2 - 44, py + ph + 8, 88, 16, () => close(), { fill: PAL.moss });
  go.visible = false;
  root.addChild(go);
  let stamped = false;
  const tick = (tk: Ticker) => {
    const dt = Math.min(0.05, tk.deltaMS / 1000);
    t += dt;
    lights.alpha = 0.7 + Math.sin(t * 2) * 0.3;
    if (signT >= 0 && signT < 1) {
      // the pen moves across the line: a loopy scrawl
      signT = Math.min(1, signT + dt * 1.1);
      sig.clear();
      const x0 = px + 30;
      const len = (pw - 60) * signT;
      sig.moveTo(x0, sy + 6);
      for (let x = 0; x <= len; x += 1.5) sig.lineTo(x0 + x, sy + 6 - Math.sin(x * 0.35) * 4 - Math.sin(x * 0.11) * 2);
      sig.stroke({ color: 0x1a2a6a, width: 1 });
      if (signT >= 1 && !stamped) {
        stamped = true;
        sfx('roar');
        g.shake(2, 0.2);
        const st = new Container();
        st.addChild(new Graphics().rect(0, 0, 70, 18).stroke({ color: PAL.blood, width: 2 }));
        st.addChild(text('SIGNED', 0, 4, { width: 70, align: 'center', color: PAL.blood }));
        st.position.set(px + pw - 96, sy - 22);
        st.rotation = -0.2;
        root.addChild(st);
        for (let k = 0; k < 90; k++) parts.push({ x: W / 2 + (Math.random() - 0.5) * 300, y: -10 - Math.random() * 60, vx: (Math.random() - 0.5) * 40, vy: 40 + Math.random() * 60, c: [PAL.gold, PAL.blood, PAL.sky, PAL.moss, 0xffffff][k % 5], life: 3 + Math.random() * 2 });
        go.visible = true;
      }
    }
    fx.clear();
    for (const p of parts) {
      p.life -= dt;
      p.x += p.vx * dt;
      p.y += p.vy * dt;
      if (p.life > 0 && p.y < H) fx.rect(Math.round(p.x), Math.round(p.y), 2, 2).fill(p.c);
    }
  };
  g.app.ticker.add(tick);
  const close = () => {
    g.app.ticker.remove(tick);
    g.closeModal(wrap);
    done();
  };
  wrap.once('destroyed', () => g.app.ticker.remove(tick));
  sfx('crowd');
}
