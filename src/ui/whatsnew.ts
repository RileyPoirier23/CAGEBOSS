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
    v: '2.0.0',
    lines: [
      'Road To Champion: you are Han "The Pride Of The Maritimes" Tibular.',
      'Five chapters, time skips, a boss in every league, a superfight at the end.',
      'Beat a chapter: its boss is playable in QUICK FIGHT.',
      'Cutscenes everywhere, with BACK so you never miss a line.',
      'Settings > Text: Clear or Bold lettering if pixels are hard to read.',
      'Four new songs: SANDOTHERAPPER x Jayson, and $cott.',
      'Every league fights in its own room. 1ton finally makes sense.',
      'CREDITS plays the full roll. SUPPORT THE DEV if you want to help.',
    ],
  },
  {
    v: '1.7.0',
    lines: [
      'Road To Champion: a much longer story, with cutscenes.',
      'The landlord, Mateo, the parking lot, the grudge match, the rematch.',
      'Press conferences and weigh-in face-offs for your own fights.',
      'Live fights: fouls, point deductions, injuries, doctor stoppages.',
      'QUICK FIGHT: any two fighters, vs the CPU or a friend (local 2P).',
      'Legacy Mode unlocks after the road: change weight, open a gym, promote.',
      'Grappling sounds, story portraits, a BODY button on touch.',
      'Mac and Linux builds. Saves are files now (Steam Cloud ready).',
    ],
  },
  {
    v: '1.6.0',
    lines: [
      'FIGHTER MODE is now ROAD TO CHAMPION, with a story (save the soup).',
      'New LEGACY MODE: the fighter career, no script, more chaos.',
      'Directional strikes, a real clinch, and a full ground game.',
      'Hands-on fights get the whole broadcast. Change camera with C / View.',
      'Contract signings, staff check-ins, interviews, a career file.',
      'Read your paperwork: a signed contract is a signed contract.',
      'Achievements, save slots per mode, CONTINUE, and a HELP screen.',
      'Every promotion has its own canvas. The full CBFC roster is in.',
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
