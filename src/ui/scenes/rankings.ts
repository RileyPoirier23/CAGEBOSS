/**
 * Rankings wall: champion + top 15 per division, and the belt case.
 */
import { Container, Graphics } from 'pixi.js';
import type { Game } from '../app';
import { PAL } from '../../art/palette';
import { W, H, text, button, box, ScrollBox, clickable } from '../kit';
import { fighterPortrait } from '../sprites';
import { openWindow } from '../widgets';
import { undisputed, interim } from '../../sim/rankings';
import { divisionShort, divisionName, DIVISION_ORDER } from '../../sim/divisions';
import { fullName } from '../../sim/fighters';
import { record } from '../../core/format';
import { openRoster } from './roster';

export function drawBelt(design: { plate: number; strap: number; gem: number }, w = 40): Graphics {
  const straps = [0x2a2230, PAL.blood, 0x1d3a5a, 0xd8d4cc];
  const plates = [PAL.gold, 0xc0c0c8, 0xb87333, 0x2a2a2a];
  const gems = [PAL.blood, 0x3a8ad8, 0x3ad87a, 0xd83ad0];
  const g = new Graphics();
  const h = Math.round(w / 4);
  g.rect(0, h / 3, w, h / 2).fill(straps[design.strap % 4]);
  g.roundRect(w / 2 - h, 0, h * 2, h, 2).fill(plates[design.plate % 4]);
  g.rect(w / 4 - 3, h / 3, 5, h / 2).fill(plates[design.plate % 4]);
  g.rect((w * 3) / 4 - 2, h / 3, 5, h / 2).fill(plates[design.plate % 4]);
  g.circle(w / 2, h / 2, Math.max(1, h / 4)).fill(gems[design.gem % 4]);
  return g;
}

export function openRankings(g: Game): void {
  const s = g.state!;
  let div = s.divisionsOpen[0] ?? 'light';
  const win = openWindow(g, 'Rankings wall', W - 8, H - 8, { x: 4, y: 4 });
  const draw = () => {
    win.body.removeChildren().forEach((c) => c.destroy({ children: true }));
    const divs = DIVISION_ORDER.filter((d) => s.divisionsOpen.includes(d));
    divs.forEach((d, i) => win.body.addChild(button(divisionShort(d), 4 + i * 34, 0, 33, 12, () => { div = d; draw(); }, { small: true, fill: d === div ? PAL.gold : PAL.slate, textColor: d === div ? PAL.ink : PAL.bone })));
    win.body.addChild(button('BELTS', W - 60, 0, 44, 12, () => belts(), { small: true, fill: PAL.plum }));
    const belt = undisputed(s, div);
    const champ = belt?.holder ? s.fighters[belt.holder] : null;
    const panel = new Container();
    panel.position.set(4, 16);
    panel.addChild(box(150, H - 50, PAL.ink, PAL.gold));
    panel.addChild(text(divisionName(div).toUpperCase(), 4, 4, { small: true, color: PAL.gold, width: 142 }));
    panel.addChild(text('CHAMPION', 4, 14, { small: true, color: PAL.ash }));
    if (champ) {
      const p = fighterPortrait(champ, 64, 'belt');
      p.position.set(43, 24);
      panel.addChild(clickable(p, () => openRoster(g, () => {}, champ.id)));
      panel.addChild(text(fullName(champ), 4, 92, { width: 142, align: 'center', color: PAL.bone }));
      panel.addChild(text(`${record(champ.record)}  •  ${belt!.defenses} defenses`, 4, 103, { small: true, width: 142, align: 'center', color: PAL.ash }));
    } else panel.addChild(text('VACANT', 4, 50, { width: 142, align: 'center', color: PAL.blood, scale: 2 }));
    if (belt) {
      const bg = drawBelt(belt.design, 80);
      bg.position.set(35, 116);
      panel.addChild(bg);
    }
    const ib = interim(s, div);
    if (ib) panel.addChild(text(`INTERIM: ${ib.holder ? fullName(s.fighters[ib.holder]) : 'vacant'}`, 4, 145, { small: true, color: PAL.plum, width: 142 }));
    win.body.addChild(panel);
    const sb = new ScrollBox(W - 176, H - 50);
    sb.position.set(160, 16);
    (s.rankings[div] ?? []).forEach((id, i) => {
      const f = s.fighters[id];
      if (!f) return;
      const row = clickable(new Container(), () => openRoster(g, () => {}, f.id));
      row.addChild(box(W - 184, 16, i % 2 ? 0x2a2630 : 0x24212a));
      row.addChild(text(`#${i + 1}`, 3, 4, { color: PAL.gold }));
      const p = fighterPortrait(f, 24);
      p.scale.set(0.6);
      p.position.set(24, 1);
      row.addChild(p);
      row.addChild(text(fullName(f), 42, 4, { color: PAL.bone, width: 150, maxLines: 1 }));
      row.addChild(text(`${record(f.record)}  streak ${f.streak > 0 ? 'W' + f.streak : f.streak < 0 ? 'L' + -f.streak : '-'}  star ${f.starPower}`, 196, 5, { small: true, color: PAL.ash }));
      row.position.set(0, i * 17);
      sb.content.addChild(row);
    });
    win.body.addChild(sb);
    sb.refresh();
    win.body.addChild(text(`Rankings voted by a media panel. Media meter: ${Math.round(s.meters.media)} (hostile panels get weird).`, 160, H - 32, { small: true, color: PAL.grey }));
  };
  const belts = () => {
    const w2 = openWindow(g, 'The belt case', 360, 220);
    const sb = new ScrollBox(350, 196);
    sb.position.set(4, 2);
    Object.values(s.belts).filter((b) => !b.retired).forEach((b, i) => {
      const row = new Container();
      row.addChild(box(340, 22, i % 2 ? 0x2a2630 : 0x24212a));
      const bg = drawBelt(b.design, 40);
      bg.position.set(4, 6);
      row.addChild(bg);
      row.addChild(text(b.name + (b.symbolic ? ' (symbolic)' : ''), 50, 2, { small: true, color: b.symbolic ? PAL.plum : PAL.gold, width: 280 }));
      row.addChild(text(`Holder: ${b.holder && s.fighters[b.holder] ? fullName(s.fighters[b.holder]) : 'VACANT'}  •  ${b.defenses} defenses  •  ${b.history.length} reigns`, 50, 11, { small: true, color: PAL.ash, width: 285 }));
      row.position.set(0, i * 24);
      sb.content.addChild(row);
    });
    w2.body.addChild(sb);
    sb.refresh();
  };
  draw();
}
