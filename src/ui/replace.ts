/**
 * Short-notice replacement picker: when a fighter gets hurt, arrested or
 * misses weight, the opponent keeps the slot and you pick a stand-in from
 * your own roster (or scrap the bout).
 */
import { Container } from 'pixi.js';
import type { Game } from './app';
import type { Bout, FightEvent } from '../core/types';
import { PAL } from '../art/palette';
import { text, box, clickable, button, ScrollBox } from './kit';
import { openWindow } from './widgets';
import { fighterPortrait } from './sprites';
import { replacementCandidates, setOpponent, renumber, cardProblems } from '../sim/events';
import { fullName, seenOverall } from '../sim/fighters';
import { rankLabel } from '../sim/rankings';
import { divisionName } from '../sim/divisions';
import { money, record } from '../core/format';
import { sfx } from '../audio/sfx';

export function openReplacementPicker(g: Game, ev: FightEvent, b: Bout, outId: string, reason: string, onDone?: () => void): void {
  const s = g.state!;
  const stay = outId === b.a ? b.b : b.a;
  const keep = s.fighters[stay];
  const out = s.fighters[outId];
  const cands = replacementCandidates(s, ev, b, stay).slice(0, 30);
  const win = openWindow(g, `Replacement needed`, 340, 230, { onClose: onDone });
  win.body.addChild(text(
    `${out ? fullName(out) : 'A fighter'} is out (${reason}). ${keep ? fullName(keep) : 'The opponent'} still wants to fight. Pick a short-notice replacement from your roster:`,
    6, 2, { width: 328, color: PAL.bone, small: true },
  ));
  const sb = new ScrollBox(328, 160);
  sb.position.set(6, 22);
  if (!cands.length) sb.content.addChild(text('Nobody on the roster is fit, rested and free. The bout is off unless you sign someone.', 4, 4, { width: 310, color: PAL.ember, small: true }));
  cands.forEach(({ f, catchweight }, i) => {
    const row = clickable(new Container(), () => {
      setOpponent(s, b, outId, f.id);
      b.shortNotice = true;
      f.hype = Math.min(100, f.hype + 4);
      f.morale = Math.min(100, f.morale + 3);
      ev.notes.push(`${f.first} ${f.last} steps in on short notice for ${out ? out.last : '?'}${catchweight ? ' (catchweight)' : ''}.`);
      sfx('paper');
      g.toast(`${f.last} accepts on short notice!`, PAL.moss);
      win.close();
    });
    row.addChild(box(318, 26, i % 2 ? 0x2a2630 : 0x24202a));
    const p = fighterPortrait(f, 24);
    p.position.set(1, 1);
    row.addChild(p);
    row.addChild(text(`${fullName(f)}  ${record(f.record)}`, 28, 3, { color: PAL.bone, small: true, width: 220 }));
    row.addChild(text(
      `${divisionName(f.division)}${catchweight ? ' (CATCHWEIGHT)' : ''}  •  ${rankLabel(s, f.id) || 'unranked'}  •  last fought ${s.week - f.lastFightWeek > 500 ? 'never' : s.week - f.lastFightWeek + ' wks ago'}`,
      28, 13, { color: catchweight ? PAL.ember : PAL.ash, small: true, width: 230 },
    ));
    row.addChild(text(`OVR ~${seenOverall(f)}`, 262, 3, { color: PAL.gold, small: true }));
    row.addChild(text(money(f.contract?.purse ?? 0), 262, 13, { color: PAL.ash, small: true }));
    row.position.set(0, i * 27);
    sb.content.addChild(row);
  });
  win.body.addChild(sb);
  sb.refresh();
  win.body.addChild(button('SCRAP THE BOUT', 6, 188, 110, 14, () => {
    b.status = 'cancelled';
    delete b.pulled;
    renumber(ev);
    ev.notes.push(`${keep?.last ?? '?'} vs ${out?.last ?? '?'} is off.`);
    sfx('paper');
    win.close();
  }, { small: true, fill: PAL.blood }));
}

/** Walk through every card problem one picker at a time, then call onDone. */
export function resolveCardProblems(g: Game, ev: FightEvent, onDone: () => void): void {
  const s = g.state!;
  const next = cardProblems(s, ev).find((p) => p.bout.status === 'scheduled');
  if (!next) return onDone();
  openReplacementPicker(g, ev, next.bout, next.fighter, next.reason, () => {
    // picker closed without choosing: leave the bout as-is only if the problem is gone
    if (cardProblems(s, ev).some((p) => p.bout === next.bout && p.fighter === next.fighter)) {
      next.bout.status = 'cancelled';
      delete next.bout.pulled;
      renumber(ev);
    }
    resolveCardProblems(g, ev, onDone);
  });
}
