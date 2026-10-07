/**
 * WHAT'S NEW: a short card the first time the game starts after an update. A handful of
 * lines, not patch notes. Remembers the last version the player saw.
 */
import type { Game } from './app';
import { PAL } from '../art/palette';
import { text, button } from './kit';
import { openWindow } from './widgets';
import { loadJSON, storeJSON, slotMeta, ALL_SLOTS } from '../core/save';
import { openHelp } from './help';

/** Newest first. Keep each version to a few lines. */
export const NOTES: { v: string; lines: string[] }[] = [
  {
    v: '1.6.0',
    lines: [
      'FIGHTER MODE is now ROAD TO CHAMPION.',
      'Directional strikes: body shots, overhands, front kicks, spinning stuff.',
      'A real clinch: collar ties, Thai plum, underhooks, the fence, trips.',
      'Ground game: half guard, passes, sweeps, scrambles, 16 submissions.',
      'Amateur and pro records, plus a career file: fights, charges, articles.',
      'Read your paperwork. A signed contract is a signed contract.',
      'Every promotion has its own canvas. The full CBFC roster is in.',
      'New HELP screen (above SETTINGS) with everything you need to know.',
    ],
  },
];

let shown = false;

/** Show the card if this version hasn't been seen yet (once per session). */
export function maybeWhatsNew(g: Game): void {
  if (shown) return;
  shown = true;
  const seen = loadJSON<string>('cageboss-whatsnew', '');
  if (seen === __APP_VERSION__) return;
  storeJSON('cageboss-whatsnew', __APP_VERSION__);
  // a brand-new player (no saves at all) doesn't need a changelog
  if (!seen && ALL_SLOTS.every((x) => !slotMeta(x))) return;
  openWhatsNew(g);
}

export function openWhatsNew(g: Game): void {
  const n = NOTES.find((x) => x.v === __APP_VERSION__) ?? NOTES[0];
  const h = 52 + n.lines.length * 12;
  const win = openWindow(g, "What's new", 280, h);
  win.body.addChild(text(`VERSION ${n.v}`, 8, 4, { color: PAL.gold }));
  n.lines.forEach((l, i) => {
    win.body.addChild(text('•', 8, 18 + i * 12, { small: true, color: PAL.gold }));
    win.body.addChild(text(l, 16, 18 + i * 12, { small: true, color: PAL.bone, width: 256, maxLines: 1 }));
  });
  const y = 22 + n.lines.length * 12;
  win.body.addChild(button('LET ME PLAY', 8, y, 124, 14, () => win.close(), { small: true, fill: PAL.moss }));
  win.body.addChild(button('OPEN HELP', 148, y, 124, 14, () => { win.close(); openHelp(g); }, { small: true, fill: PAL.shadow, border: PAL.gold }));
}
