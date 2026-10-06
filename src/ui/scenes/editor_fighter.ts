/**
 * Fighter creator / god-mode editor: portrait builder, identity, traits,
 * styles, skills, bio. Creates a new fighter when id is null.
 */
import { Container } from 'pixi.js';
import type { Game } from '../app';
import type { Fighter, Look, Skills } from '../../core/types';
import { SKILL_KEYS } from '../../core/types';
import { PAL } from '../../art/palette';
import { W, H, text, button, box } from '../kit';
import { portrait } from '../sprites';
import { openWindow, stepper, selector, domInput } from '../widgets';
import { TRAITS, STYLES, generateFighter } from '../../sim/generate';
import { content } from '../../core/content';
import { Rng } from '../../core/rng';
import { DIVISION_ORDER, divisionName } from '../../sim/divisions';
import { computeStarPower } from '../../sim/fighters';

const LOOK_PARTS: [keyof Look, string, number][] = [
  ['head', 'Head', 4], ['skin', 'Skin', 6], ['hair', 'Hair', 8], ['hairColor', 'Hair col', 8], ['beard', 'Beard', 5], ['brows', 'Brows', 3],
  ['eyes', 'Eyes', 3], ['nose', 'Nose', 3], ['ears', 'Ears', 4], ['scar', 'Scar', 4], ['tattoo', 'Tattoo', 4], ['build', 'Build', 3],
];

export function openFighterEditor(g: Game, id: string | null, onDone: () => void): void {
  const s = g.state!;
  const rng = new Rng(s.rng ^ 0x5eed);
  let f: Fighter;
  if (id && s.fighters[id]) f = s.fighters[id];
  else {
    f = generateFighter(rng, content().names, { division: s.divisionsOpen[0] ?? 'light', tier: 'journeyman', id: 'custom_' + s.week + '_' + rng.int(0, 99999) });
    f.status = 'free-agent';
  }
  const inputs: { remove: () => void; value: () => string }[] = [];
  const win = openWindow(g, id ? 'Edit fighter (god mode)' : 'Fighter creator', W - 8, H - 8, {
    x: 4, y: 4,
    onClose: () => {
      inputs.forEach((i) => i.remove());
      onDone();
    },
  });
  let tab: 'look' | 'skills' | 'traits' = 'look';
  const draw = () => {
    inputs.forEach((i) => i.remove());
    inputs.length = 0;
    win.body.removeChildren().forEach((c) => c.destroy({ children: true }));
    const b = win.body;
    const p = portrait({ id: f.id, look: f.look, gender: f.gender, age: f.age, damage: f.damage, wounds: f.wounds }, 64);
    p.position.set(6, 4);
    b.addChild(p);
    b.addChild(text('First', 76, 6, { small: true, color: PAL.ash }));
    b.addChild(text('Nick', 76, 22, { small: true, color: PAL.ash }));
    b.addChild(text('Last', 76, 38, { small: true, color: PAL.ash }));
    const ox = win.frame.x + 0;
    const oy = win.frame.y + 14;
    inputs.push(domInput(g, ox + 100, oy + 3, 120, 13, f.first, { maxLength: 20, onChange: (v) => (f.first = v) }));
    inputs.push(domInput(g, ox + 100, oy + 19, 120, 13, f.nick, { maxLength: 30, onChange: (v) => (f.nick = v) }));
    inputs.push(domInput(g, ox + 100, oy + 35, 120, 13, f.last, { maxLength: 20, onChange: (v) => (f.last = v) }));
    b.addChild(selector(230, 4, 150, DIVISION_ORDER.map((d) => ({ value: d, label: divisionName(d) })), f.division, (v) => { f.division = v; f.gender = v.startsWith('w') ? 'W' : 'M'; }));
    b.addChild(text('Age', 230, 22, { small: true, color: PAL.ash }));
    b.addChild(stepper(256, 19, 124, f.age, 18, 50, 1, String, (v) => (f.age = v)));
    b.addChild(text('Hometown: ' + f.hometown + ', ' + f.country, 230, 38, { small: true, color: PAL.ash, width: 220 }));
    (['look', 'skills', 'traits'] as const).forEach((t, i) => b.addChild(button(t.toUpperCase(), 6 + i * 52, 74, 50, 12, () => { tab = t; draw(); }, { small: true, fill: tab === t ? PAL.gold : PAL.slate, textColor: tab === t ? PAL.ink : PAL.bone })));
    const area = new Container();
    area.position.set(6, 90);
    b.addChild(area);
    if (tab === 'look') {
      LOOK_PARTS.forEach(([k, label, n], i) => {
        const x = (i % 3) * 150;
        const y = Math.floor(i / 3) * 16;
        area.addChild(text(label, x, y + 3, { small: true, color: PAL.ash }));
        area.addChild(stepper(x + 40, y, 100, f.look[k] ?? 0, 0, n - 1, 1, String, (v) => { f.look[k] = v; draw(); }));
      });
      area.addChild(button('RANDOMIZE LOOK', 0, 70, 90, 13, () => {
        const r2 = new Rng(Date.now() >>> 0);
        for (const [k, , n] of LOOK_PARTS) f.look[k] = r2.int(0, n - 1);
        draw();
      }, { small: true }));
    } else if (tab === 'skills') {
      SKILL_KEYS.forEach((k, i) => {
        const x = (i % 2) * 230;
        const y = Math.floor(i / 2) * 15;
        area.addChild(text(k, x, y + 3, { small: true, color: PAL.ash }));
        area.addChild(stepper(x + 60, y, 140, f.skills[k as keyof Skills], 1, 99, 1, String, (v) => (f.skills[k as keyof Skills] = v)));
      });
      area.addChild(text('Potential', 0, 78, { small: true, color: PAL.ash }));
      area.addChild(stepper(60, 75, 140, f.potential, 1, 99, 1, String, (v) => (f.potential = v)));
      area.addChild(text('Prime age', 230, 78, { small: true, color: PAL.ash }));
      area.addChild(stepper(290, 75, 140, f.primeAge, 22, 38, 1, String, (v) => (f.primeAge = v)));
      area.addChild(text('Money IQ', 0, 93, { small: true, color: PAL.ash }));
      area.addChild(stepper(60, 90, 140, f.moneyIQ, 0, 100, 5, String, (v) => (f.moneyIQ = v)));
      area.addChild(text('Cutman', 230, 93, { small: true, color: PAL.ash }));
      area.addChild(stepper(290, 90, 140, f.cutman.rating, 0, 100, 5, String, (v) => (f.cutman.rating = v)));
    } else {
      const all = [...TRAITS, 'Reformed', 'Martyr Complex', 'Sober', 'Cancelled', 'Weight Misser'];
      all.forEach((t, i) => {
        const on = f.traits.includes(t);
        area.addChild(button(t, (i % 5) * 92, Math.floor(i / 5) * 13, 90, 12, () => {
          f.traits = on ? f.traits.filter((x) => x !== t) : [...f.traits, t];
          f.streaming = f.traits.includes('Streamer');
          draw();
        }, { small: true, fill: on ? PAL.moss : PAL.shadow }));
      });
      const sy = Math.ceil(all.length / 5) * 13 + 4;
      (STYLES as readonly string[]).forEach((t, i) => {
        const on = f.styles.includes(t);
        area.addChild(button(t, (i % 5) * 92, sy + Math.floor(i / 5) * 13, 90, 12, () => {
          f.styles = on ? f.styles.filter((x) => x !== t) : [...f.styles, t].slice(-2);
          draw();
        }, { small: true, fill: on ? PAL.steel : PAL.shadow }));
      });
    }
    b.addChild(button(id ? 'SAVE CHANGES' : 'CREATE & ADD AS FREE AGENT', W - 170, H - 40, 150, 16, () => {
      f.modded = true;
      f.starPower = computeStarPower(s, f);
      if (!id) s.fighters[f.id] = f;
      g.toast(id ? 'Saved.' : `${f.first} ${f.last} created.`, PAL.moss);
      win.close();
    }, { fill: PAL.moss }));
  };
  draw();
}

export { box };
