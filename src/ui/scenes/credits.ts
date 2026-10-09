import type { Game } from '../app';
import { PAL } from '../../art/palette';
import { text, button, ScrollBox } from '../kit';
import { openWindow } from '../widgets';
import { hasAchievement } from '../achievements';
import { openMemorial } from '../endcredits';
import { FRIENDS, ARTISTS } from '../creditsdata';

export function openCredits(g: Game): void {
  const win = openWindow(g, 'Credits', 300, 262, { paper: 'cream' });
  const sb = new ScrollBox(290, hasAchievement('rtc_epilogue') ? 222 : 240);
  sb.position.set(4, 4);
  win.body.addChild(sb);
  const body =
    'CAGE BOSS\n' +
    'A 506CLICKS GAME\n\n' +
    'Game design, idea, story, art and everything else:\n' +
    'Riley "Monkey Man" Poirier / 506Clicks\n' +
    'Instagram: rpoirier07\n' +
    'TikTok: iheartgrannies69\n' +
    'Discord: gldmonkey\n' +
    '506clicks.ca\n\n' +
    'THE REAL ONES\n' +
    'These friends asked to be in the game, and now they are. Thank you, all of you:\n' +
    FRIENDS.map(([real, as]) => (real === as ? `  ${real}` : `  ${real} as ${as}`)).join('\n') + '\n\n' +
    'SOUNDTRACK\n' +
    'Local artists who let me put their songs in this game. Thank you, from the bottom of my heart: every walkout in here is yours.\n' +
    ARTISTS.map(([name, real, songs]) => `  ${name}${real && real !== name ? ` (${real})` : ''}: ${songs}`).join('\n') + '\n\n' +
    'Font: "Cagebook", an original pixel font (public domain).\n' +
    'Engine: PixiJS, TypeScript, Vite.\n\n' +
    'The friends above play themselves with their blessing. Everybody else (every other fighter, promoter, journalist, outlet, company, commission and event) is fictional: ' +
    'satirical archetypes. If you think one of them is about you, that says more about you than about us.\n\n' +
    'No energy drinks were harmed. Several were consumed.';
  sb.content.addChild(text(body, 4, 2, { width: 276, color: PAL.ink }));
  sb.refresh();
  // finished the road: the memorial stays here
  if (hasAchievement('rtc_epilogue')) win.body.addChild(button('IN MEMORIAM', 196, 232, 96, 13, () => openMemorial(g), { small: true, fill: 0x2a262c }));
}
