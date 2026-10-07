/**
 * Storylet presentation: phone calls, office visits, memos, boardroom,
 * press conference questions. Shows scenes in order, then choices, then the
 * result. Typewriter text speed follows settings.
 */
import { Container, Graphics } from 'pixi.js';
import type { Game } from './app';
import type { StoryletInstance, SceneDef } from '../core/types';
import { PAL, shade } from '../art/palette';
import { W, H, text, button, box, paper } from './kit';
import { PixelText } from './text';
import { def, renderText, availableChoices, resolveStorylet } from '../storylets/engine';
import { fighterPortrait, reporterPortrait, npcPortrait, namedPortrait } from './sprites';
import { content } from '../core/content';
import { Rng } from '../core/rng';
import { sfx } from '../audio/sfx';
import { money } from '../core/format';

const SCENE_LABEL: Record<string, string> = {
  phone: 'INCOMING CALL', visit: 'VISITOR', doc: 'DOCUMENT', memo: 'MEMO', presser: 'PRESS CONFERENCE', headline: 'BREAKING',
  social: 'SOCIAL MEDIA', bail: 'BAIL OFFICE', boardroom: 'BOARDROOM', fightnight: 'FIGHT NIGHT', narration: '',
};

const TONE_COLOR: Record<string, number> = {
  deflect: PAL.steel, attack: PAL.blood, joke: PAL.ember, truth: PAL.moss, wwsh: PAL.slate, storm: PAL.plum,
};

export function scenePortrait(g: Game, inst: StoryletInstance, sc: SceneDef): Container | null {
  const s = g.state!;
  const d = def(inst.id);
  if (sc.portrait?.startsWith('npc:')) {
    const named = namedPortrait(sc.portrait.slice(4), 64);
    if (named) return named;
  }
  const role = sc.portrait ?? (d?.roles ? Object.keys(d.roles)[0] : undefined);
  if (role && inst.roles[role]) {
    const type = d?.roles?.[role]?.type ?? 'fighter';
    const id = inst.roles[role];
    if (type === 'reporter') {
      const r = content().reporters.find((x) => x.id === id);
      if (r) return reporterPortrait(r, 64);
    } else if (s.fighters[id]) {
      return fighterPortrait(s.fighters[id], 64, sc.type === 'bail' ? 'mugshot' : 'plain');
    }
  }
  const kind = sc.type === 'boardroom' || sc.type === 'memo' ? 'exec' : sc.type === 'bail' ? 'cop' : sc.type === 'phone' ? 'manager' : 'manager';
  return npcPortrait(sc.speaker ?? inst.id, kind, 64);
}

export function playStorylet(g: Game, inst: StoryletInstance, onDone: (result: string) => void): void {
  const s = g.state!;
  const d = def(inst.id);
  if (!d) {
    onDone('');
    return;
  }
  let sceneIdx = 0;
  const frame = new Container();
  const wrap = g.modal(frame, { dim: 0.5 });
  const close = (res: string) => {
    g.closeModal(wrap);
    onDone(res);
  };
  if (d.scenes[0]?.type === 'phone') sfx('phone');
  else if (d.scenes[0]?.type === 'visit') sfx('thud');
  else sfx('paper');

  const draw = () => {
    frame.removeChildren().forEach((c) => c.destroy({ children: true }));
    const sc = d.scenes[Math.min(sceneIdx, d.scenes.length - 1)];
    const lastScene = sceneIdx >= d.scenes.length - 1;
    const bw = 420;
    const bh = 196;
    const bx = (W - bw) / 2;
    const by = (H - bh) / 2;
    const isDoc = sc.type === 'doc' || sc.type === 'memo' || sc.type === 'headline' || sc.type === 'social';
    if (isDoc) frame.addChild(paper(bw, bh, sc.type === 'memo' ? 'white' : sc.type === 'headline' ? 'news' : 'cream', 3)).position.set(bx, by);
    else frame.addChild(box(bw, bh, PAL.night, PAL.ash, { shadow: true, bevel: true })).position.set(bx, by);
    const ink = isDoc ? PAL.ink : PAL.bone;
    frame.addChild(box(bw, 12, shade(PAL.blood, -0.2))).position.set(bx, by);
    frame.addChild(text(`${SCENE_LABEL[sc.type] ?? ''}  •  ${d.title.toUpperCase()}`, bx + 4, by + 3, { small: true, color: PAL.bone }));
    const por = scenePortrait(g, inst, sc);
    let tx = bx + 8;
    if (por && !isDoc) {
      por.x = bx + 8;
      por.y = by + 18;
      frame.addChild(por);
      tx = bx + 80;
      if (sc.speaker) frame.addChild(text(renderText(s, inst, sc.speaker), bx + 8, by + 86, { small: true, width: 66, color: PAL.gold }));
    }
    const tw = bx + bw - 8 - tx;
    if (sc.title) frame.addChild(text(renderText(s, inst, sc.title), tx, by + 18, { color: isDoc ? PAL.blood : PAL.gold, width: tw }));
    const body = renderText(s, inst, sc.text);
    const bodyText = new PixelText('', { width: tw, color: ink });
    bodyText.x = tx;
    bodyText.y = by + (sc.title ? 30 : 18);
    frame.addChild(bodyText);
    // typewriter
    const speed = [0, 40, 90, 220, 99999][g.settings.textSpeed] ?? 90;
    let shown = 0;
    let done = speed > 9999;
    if (done) bodyText.setText(body);
    const tick = (dt: number) => {
      if (done) return;
      shown = Math.min(body.length, shown + speed * dt);
      bodyText.setText(body.slice(0, Math.floor(shown)));
      if (shown >= body.length) done = true;
    };
    let last = performance.now();
    const ticker = () => {
      if (frame.destroyed) return;
      const now = performance.now();
      tick((now - last) / 1000);
      last = now;
      if (!done) requestAnimationFrame(ticker);
    };
    requestAnimationFrame(ticker);
    const skip = new Graphics().rect(bx, by + 12, bw, bh - 80).fill({ color: 0, alpha: 0.001 });
    skip.eventMode = 'static';
    skip.on('pointertap', () => {
      done = true;
      bodyText.setText(body);
    });
    frame.addChildAt(skip, 1);

    if (!lastScene) {
      frame.addChild(button('CONTINUE →', bx + bw - 90, by + bh - 20, 82, 14, () => {
        done = true;
        sceneIdx++;
        draw();
      }, { fill: PAL.slate }));
      return;
    }
    // choices
    const opts = availableChoices(s, inst, new Rng(s.rng));
    let cy = by + bh - 8 - opts.length * 15;
    for (const i of opts) {
      const ch = d.choices[i];
      const label = renderText(s, inst, ch.label).replace(/\{\$([a-z.]+)\}/gi, (_, k) => money(Number(inst.vars[k]) || 0));
      const fill = ch.tone ? TONE_COLOR[ch.tone] : PAL.slate;
      frame.addChild(button((ch.tone ? `[${ch.tone.toUpperCase()}] ` : '') + label, bx + 8, cy, bw - 16, 13, () => pick(i), { fill, align: 'left' }));
      cy += 15;
    }
  };

  const pick = (i: number) => {
    const rng = new Rng(s.rng);
    const res = resolveStorylet(s, inst.iid, i, rng);
    s.rng = rng.state;
    sfx('stamp');
    frame.removeChildren().forEach((c) => c.destroy({ children: true }));
    if (!res) {
      close('');
      return;
    }
    const bw = 360;
    const t = text(res, 0, 0, { width: bw - 16, color: PAL.bone });
    const bh = t.textHeight + 40;
    const bx = (W - bw) / 2;
    const by = (H - bh) / 2;
    frame.addChild(box(bw, bh, PAL.night, PAL.gold, { shadow: true, bevel: true })).position.set(bx, by);
    t.position.set(bx + 8, by + 8);
    frame.addChild(t);
    frame.addChild(button('OK', bx + bw - 50, by + bh - 20, 42, 14, () => close(res), { fill: PAL.moss }));
  };
  draw();
}
