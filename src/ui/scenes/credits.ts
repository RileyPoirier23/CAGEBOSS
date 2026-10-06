import type { Game } from '../app';
import { PAL } from '../../art/palette';
import { text } from '../kit';
import { openWindow } from '../widgets';

export function openCredits(g: Game): void {
  const win = openWindow(g, 'Credits', 300, 262, { paper: 'cream' });
  win.body.addChild(text(
    'CAGE BOSS\n\n' +
    'Created by Riley "Monkey Man" Poirier\n' +
    'Instagram: rpoirier07\n' +
    'TikTok: iheartgrannies69\n' +
    'Discord: gldmonkey\n\n' +
    'SOUNDTRACK (local artists, used with permission)\n' +
    'Champion - SANDO\n' +
    'Doin Shit - SANDO x RUIN\n' +
    'fu2 - SANDO\n' +
    'BAG - F.O.K. ft. Hope Nikku (prod. Miler)\n' +
    'ossa - RUIN143\n\n' +
    'Font: "Cagebook", an original pixel font (public domain).\n' +
    'Engine: PixiJS, TypeScript, Vite.\n\n' +
    'Every fighter, promoter, journalist, outlet, company, commission and event in this game is fictional. ' +
    'Characters are satirical archetypes. If you think one of them is about you, that says more about you than about us.\n\n' +
    'No energy drinks were harmed. Several were consumed.',
    8, 6, { width: 284, color: PAL.ink }));
}
