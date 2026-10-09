/**
 * SUPPORT THE DEV: CAGE BOSS is made by one person. Players who want to can send a donation
 * (Interac e-Transfer), then message @506clicks on Instagram: every supporter goes in the
 * credits with the next update, and supporters can ask to be put in the game as a character.
 *
 * Only on the desktop and web builds: console and phone stores don't allow outside payments
 * inside an app, so it never shows there.
 */
import { Container } from 'pixi.js';
import type { Game } from './app';
import { PAL } from '../art/palette';
import { text, button, box } from './kit';
import { openWindow } from './widgets';
import { platform } from '../core/platform';
import { SUPPORTERS } from './creditsdata';
import { sfx } from '../audio/sfx';

export const DONATE_EMAIL = 'rileypoirier23@outlook.com';
export const INSTAGRAM = '506clicks';
const INSTAGRAM_URL = 'https://instagram.com/506clicks';

/** The support screen is for the builds Riley sells himself (never inside a store app). */
export const supportAvailable = (): boolean => platform === 'desktop' || platform === 'web';

function copy(g: Game, s: string): void {
  try {
    void navigator.clipboard.writeText(s).then(() => g.toast('Copied: ' + s, PAL.moss, { small: true }), () => g.toast(s, PAL.ash, { small: true }));
  } catch {
    g.toast(s, PAL.ash, { small: true });
  }
}

export function openSupport(g: Game): void {
  if (!supportAvailable()) return;
  const win = openWindow(g, 'Support CAGE BOSS', 330, 236, { paper: 'cream' });
  const b = win.body;
  let y = 4;
  const para = (s: string, color: number = PAL.ink, gap = 4) => {
    const t = text(s, 8, y, { width: 314, color, small: true });
    b.addChild(t);
    y += t.textHeight + gap;
  };
  b.addChild(text('MADE BY ONE GUY IN MONCTON', 8, y, { color: PAL.blood }));
  y += 13;
  para('CAGE BOSS is made by one person: Riley "Monkey Man" Poirier (506Clicks). No studio, no publisher, no investors. Just a lot of late nights and a lot of energy drinks.');
  para('If the game made you laugh, or you just want more of it, you can support development with a donation of any size. It goes straight into making CAGE BOSS bigger and better.');
  // how
  const hb = new Container();
  hb.position.set(8, y);
  b.addChild(hb);
  hb.addChild(box(314, 52, 0xf2ead6, PAL.gold, { bevel: true }));
  hb.addChild(text('1. Send an Interac e-Transfer to', 6, 5, { small: true, color: PAL.ink }));
  hb.addChild(text(DONATE_EMAIL, 6, 14, { color: PAL.blood }));
  hb.addChild(button('COPY', 250, 13, 56, 12, () => { sfx('click'); copy(g, DONATE_EMAIL); }, { small: true, fill: PAL.steel }));
  hb.addChild(text(`2. Then message @${INSTAGRAM} on Instagram so I can thank you`, 6, 29, { small: true, color: PAL.ink }));
  hb.addChild(button('INSTAGRAM', 250, 36, 56, 12, () => { sfx('click'); window.open(INSTAGRAM_URL, '_blank'); }, { small: true, fill: PAL.plum }));
  hb.addChild(text('(the name you want in the credits, and if you want to be in the game)', 6, 39, { small: true, color: PAL.ash, width: 240, maxLines: 1 }));
  y += 58;
  b.addChild(text('WHAT YOU GET', 8, y, { color: PAL.blood }));
  y += 12;
  para('- Your name in the credits, in every update from then on.');
  para('- Become a character: send a photo or a description and a nickname, and you can end up in the game as a fighter, a referee, a reporter or something worse.', PAL.ink);
  para('- My eternal gratitude, and the knowledge that you helped a solo dev keep going.', PAL.ink, 6);
  b.addChild(text(SUPPORTERS.length ? `${SUPPORTERS.length} supporter${SUPPORTERS.length > 1 ? 's' : ''} so far. Thank you.` : 'No supporters yet. Be the first name in the credits.', 0, Math.min(y, 210), { width: 330, align: 'center', small: true, color: PAL.ash }));
}
